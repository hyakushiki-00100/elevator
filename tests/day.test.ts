import { describe, expect, it } from 'vitest';
import { makeBuilding } from '../src/sim/building.ts';
import { addPassenger, createSim, stateHash, step } from '../src/sim/sim.ts';
import { computeScore, deliveryPoints, PENALTY_PER_MISS, POINTS_MAX, POINTS_MIN } from '../src/sim/score.ts';
import { STAGES } from '../src/sim/stages.ts';
import { dayTicks, makePhase, phaseIndexAt, type DayPlan } from '../src/sim/traffic.ts';
import { expertBot, greedyBot, idleBot, type Bot } from '../tools/bots.ts';

function plan(phases: Parameters<typeof makePhase>[0][], overtimeTicks = 0): DayPlan {
  return { phases: phases.map((p) => makePhase(p)), overtimeTicks };
}

describe('1日の時間帯', () => {
  it('phaseIndexAt は境界で次の時間帯に切り替わり、終わると -1', () => {
    const p = plan([{ ticks: 10 }, { ticks: 20 }, { ticks: 5 }]);
    expect(dayTicks(p)).toBe(35);
    expect([0, 9, 10, 29, 30, 34, 35, 999].map((t) => phaseIndexAt(p, t))).toEqual([0, 0, 1, 1, 2, 2, -1, -1]);
  });

  it('朝は1階から上へ、夕方は上から1階へ向かう人が多い', () => {
    const b = makeBuilding({ floors: 6 });
    const count = (ph: Parameters<typeof makePhase>[0]) => {
      const s = createSim({ building: b, traffic: plan([{ ticks: 20000, ...ph }]) }, 3);
      let fromG = 0, toG = 0, n = 0;
      for (let i = 0; i < 20000; i++) {
        step(s);
        for (const q of s.passengers) {
          if (q.spawnTick !== s.tick - 1) continue;
          n++;
          if (q.origin === 0) fromG++;
          if (q.dest === 0) toG++;
        }
      }
      return { fromG: fromG / n, toG: toG / n, n };
    };
    const morning = count({ rate: 0.05, fromGround: 0.8, toGround: 0 });
    const evening = count({ rate: 0.05, fromGround: 0, toGround: 0.8 });
    expect(morning.n).toBeGreaterThan(500);
    // 0.8 + 一様な残り0.2のうち 1/6 程度 → 約0.83
    expect(morning.fromG).toBeGreaterThan(0.75);
    expect(evening.toG).toBeGreaterThan(0.75);
    expect(morning.toG).toBeLessThan(0.15);
  });

  it('発生した人の出発階と行き先は常に範囲内で異なる(朝・夕のモードも含む)', () => {
    const s = createSim({ building: makeBuilding({ floors: 4 }), traffic: plan([{ ticks: 9000, rate: 0.5, fromGround: 0.4, toGround: 0.4 }]) }, 11);
    let bad = 0;
    for (let i = 0; i < 9000; i++) {
      step(s);
      for (const q of s.passengers) if (q.origin === q.dest || q.origin < 0 || q.origin > 3 || q.dest < 0 || q.dest > 3) bad++;
    }
    expect(bad).toBe(0);
  });

  it('不正な計画は弾く', () => {
    const b = makeBuilding();
    expect(() => createSim({ building: b, traffic: plan([{ fromGround: 0.7, toGround: 0.5 }]) }, 1)).toThrow();
    expect(() => createSim({ building: b, traffic: { phases: [], overtimeTicks: 0 } }, 1)).toThrow();
    expect(() => createSim({ building: b, traffic: plan([{ ticks: 0 }]) }, 1)).toThrow();
  });
});

describe('1日の終わり', () => {
  it('発生が止まり、全員運び終えたら終わる', () => {
    const s = createSim({ building: makeBuilding(), traffic: plan([{ ticks: 30, rate: 0 }], 600) }, 1);
    addPassenger(s, 0, 2);
    step(s, [{ type: 'goto', elevator: 0, floor: 0 }]);
    let n = 1;
    while (!s.finished && n < 2000) { step(s); n++; }
    expect(s.finished).toBe(true);
    expect(s.stats.delivered).toBe(1);
    expect(s.stats.missed).toBe(0);
    expect(s.tick).toBeGreaterThanOrEqual(30);
    expect(s.tick).toBeLessThan(30 + 600);
  });

  it('誰もいなければ、発生期間の終わりちょうどで終わる', () => {
    const s = createSim({ building: makeBuilding(), traffic: plan([{ ticks: 50, rate: 0 }], 600) }, 1);
    for (let i = 0; i < 49; i++) step(s);
    expect(s.finished).toBe(false);
    step(s);
    expect(s.finished).toBe(true);
    expect(s.tick).toBe(50);
  });

  it('延長時間を過ぎて残った人(乗車中も)は取りこぼしになる', () => {
    const s = createSim({ building: makeBuilding(), traffic: plan([{ ticks: 10, rate: 0 }], 20) }, 1);
    const riding = addPassenger(s, 0, 4);
    addPassenger(s, 3, 1);
    step(s, [{ type: 'goto', elevator: 0, floor: 0 }]);
    step(s);
    expect(riding.state).toBe('riding');
    const missedEvents: number[] = [];
    while (!s.finished) { step(s); for (const e of s.events) if (e.type === 'missed') missedEvents.push(e.floor); }
    expect(s.tick).toBe(30);
    expect(s.stats.missed).toBe(2);
    expect(s.passengers).toHaveLength(0);
    expect(missedEvents.sort()).toEqual([3, 4]);
    expect(s.stats.spawned).toBe(s.stats.delivered + s.stats.missed);
  });

  it('終わった後の step と指示は何も変えない', () => {
    const s = createSim({ building: makeBuilding(), traffic: plan([{ ticks: 5, rate: 0 }]) }, 1);
    while (!s.finished) step(s);
    const h = stateHash(s);
    step(s, [{ type: 'goto', elevator: 0, floor: 3 }]);
    step(s);
    expect(stateHash(s)).toBe(h);
    expect(s.events).toHaveLength(0);
  });
});

describe('採点', () => {
  it('1人の点: 待ち0秒で最大、1秒ごとに減り、下限で止まる', () => {
    expect(deliveryPoints(0)).toBe(POINTS_MAX);
    expect(deliveryPoints(30)).toBe(POINTS_MAX - 3);
    expect(deliveryPoints(29)).toBe(POINTS_MAX - 2); // 2.9秒 → floor(8.7)=8 ではなく floor(29*3/30)=2
    expect(deliveryPoints(30 * 1000)).toBe(POINTS_MIN);
    expect(deliveryPoints(-5)).toBe(POINTS_MAX);
  });

  it('合計 = 運んだ人の点 − 取りこぼし × 減点、0未満にはならない', () => {
    const base = { spawned: 0, boarded: 0, delivered: 0, missed: 0, totalWait: 0, servicePoints: 0 };
    expect(computeScore({ ...base, servicePoints: 500, missed: 2 }, [1, 2, 3]).score).toBe(500 - 2 * PENALTY_PER_MISS);
    expect(computeScore({ ...base, servicePoints: 10, missed: 5 }, [1, 2, 3]).score).toBe(0);
  });

  it('星は閾値ちょうどで上がる', () => {
    const base = { spawned: 0, boarded: 0, delivered: 0, missed: 0, totalWait: 0 };
    const stars = (sp: number) => computeScore({ ...base, servicePoints: sp }, [100, 200, 300]).stars;
    expect([0, 99, 100, 199, 200, 299, 300, 9999].map(stars)).toEqual([0, 0, 1, 1, 2, 2, 3, 3]);
  });

  it('平均待ち時間(表示用)', () => {
    const r = computeScore({ spawned: 2, boarded: 2, delivered: 2, missed: 0, totalWait: 90, servicePoints: 0 }, [1, 2, 3]);
    expect(r.avgWaitSec).toBeCloseTo(1.5);
    expect(computeScore({ spawned: 0, boarded: 0, delivered: 0, missed: 0, totalWait: 0, servicePoints: 0 }, [1, 2, 3]).avgWaitSec).toBe(0);
  });

  it('servicePoints は、運んだ人それぞれの deliveryPoints の合計と厳密に一致する', () => {
    const s = createSim({ building: makeBuilding(), traffic: plan([{ ticks: 4000, rate: 0.03 }], 900) }, 21);
    const seen = new Set<import('../src/sim/passenger.ts').Passenger>();
    while (!s.finished) {
      for (const p of s.passengers) seen.add(p);
      step(s, greedyBot(s));
      for (const p of s.passengers) seen.add(p);
    }
    let expected = 0;
    let arrived = 0;
    for (const p of seen) {
      if (p.state === 'arrived') { expected += deliveryPoints(p.waitTicks); arrived++; }
    }
    expect(arrived).toBe(s.stats.delivered);
    expect(s.stats.delivered).toBeGreaterThan(50);
    expect(s.stats.servicePoints).toBe(expected);
  });
});

describe('ステージ1(較正済みの性質)', () => {
  const st = STAGES[0]!;
  function playDay(bot: Bot) {
    const s = createSim({ building: st.building, traffic: st.traffic }, st.seed);
    while (!s.finished) step(s, bot(s));
    return { s, r: computeScore(s.stats, st.stars) };
  }

  it('1日は3分(5400tick)+延長で終わる', () => {
    expect(dayTicks(st.traffic)).toBe(5400);
    const { s } = playDay(greedyBot);
    expect(s.tick).toBeGreaterThanOrEqual(5400);
    expect(s.tick).toBeLessThanOrEqual(5400 + st.traffic.overtimeTicks);
  });

  it('同じステージ・同じ操作なら同じ点数(決定性)', () => {
    const a = playDay(expertBot), b = playDay(expertBot);
    expect(stateHash(a.s)).toBe(stateHash(b.s));
    expect(a.r.score).toBe(b.r.score);
  });

  it('何もしなければ星0、上級者ボットは初心者ボットより点が高い', () => {
    expect(playDay(idleBot).r.stars).toBe(0);
    expect(playDay(expertBot).r.score).toBeGreaterThan(playDay(greedyBot).r.score);
  });

  it('星の閾値は昇順', () => {
    expect(st.stars[0]).toBeLessThan(st.stars[1]);
    expect(st.stars[1]).toBeLessThan(st.stars[2]);
  });
});
