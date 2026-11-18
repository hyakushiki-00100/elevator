import { describe, expect, it } from 'vitest';
import { makeBuilding } from '../src/sim/building.ts';
import { CARDS, inZone, servesFloor, type CardId, type RuleContext } from '../src/sim/rules.ts';
import { addPassenger, createSim, stateHash, step, type SimState } from '../src/sim/sim.ts';
import { makeTraffic } from '../src/sim/traffic.ts';
import { Rng } from '../src/sim/rng.ts';

function ctx(over: Partial<RuleContext> & { floors?: number } = {}): RuleContext {
  const floors = over.floors ?? 6;
  return {
    cur: 2,
    floors,
    heading: 1,
    hall: new Array(floors).fill(false),
    car: new Array(floors).fill(false),
    includeCur: false,
    ...over,
  };
}
const set = (n: number, idx: number[]): boolean[] => Array.from({ length: n }, (_, i) => idx.includes(i));

describe('カード単体の判断', () => {
  it('近い呼び出しへ: 待っている階・降りる階のうち一番近い階', () => {
    expect(CARDS.nearest(ctx({ hall: set(6, [5]), car: set(6, [0]) }))).toBe(0); // 距離2 < 距離3
    expect(CARDS.nearest(ctx({ hall: set(6, [4]) }))).toBe(4);
    expect(CARDS.nearest(ctx())).toBeNull();
  });

  it('近い呼び出しへ: 同じ距離なら進行方向を優先', () => {
    expect(CARDS.nearest(ctx({ hall: set(6, [1, 3]), heading: 1 }))).toBe(3);
    expect(CARDS.nearest(ctx({ hall: set(6, [1, 3]), heading: -1 }))).toBe(1);
  });

  it('同じ方向を優先: 進行方向の先だけを見る。先に何もなければ当てはまらない', () => {
    expect(CARDS.sameDir(ctx({ hall: set(6, [1, 5]), heading: 1 }))).toBe(5);
    expect(CARDS.sameDir(ctx({ hall: set(6, [1]), heading: 1 }))).toBeNull();
    expect(CARDS.sameDir(ctx({ hall: set(6, [1]), heading: -1 }))).toBe(1);
  });

  it('空なら急行で1階へ: 乗っている人がいなければ、呼ばれていても1階へ。1階にいる・乗っている人がいれば当てはまらない', () => {
    expect(CARDS.express(ctx())).toBe(0);
    expect(CARDS.express(ctx({ hall: set(6, [4]) }))).toBe(0);
    expect(CARDS.express(ctx({ car: set(6, [4]) }))).toBeNull();
    expect(CARDS.express(ctx({ cur: 0, hall: set(6, [4]) }))).toBeNull();
  });

  it('待機中(includeCur)なら、今いる階の乗れる人が最優先。扉が閉まった直後は今いる階を選ばない', () => {
    const c = { hall: set(6, [2, 3]) };
    for (const id of ['nearest', 'sameDir'] as const) {
      expect(CARDS[id](ctx({ ...c, includeCur: true }))).toBe(2);
      expect(CARDS[id](ctx({ ...c, includeCur: false }))).toBe(3);
    }
  });
});

function sim(rules: CardId[][], over = {}, seed = 1): SimState {
  return createSim({ building: makeBuilding(over), traffic: makeTraffic({ ratePerTick: 0 }), rules }, seed);
}
function runUntil(s: SimState, pred: () => boolean, max = 3000): number {
  let n = 0;
  while (!pred() && n < max) { step(s); n++; }
  return n;
}

describe('追加のカード(空なら急行で1階へ・担当範囲)', () => {
  it('担当範囲: 1階はどちらにも入る。7階建てなら下層=1〜4階、上層=1階と5〜7階', () => {
    const low = [0, 1, 2, 3, 4, 5, 6].filter((f) => inZone('zoneLow', f, 7));
    const high = [0, 1, 2, 3, 4, 5, 6].filter((f) => inZone('zoneHigh', f, 7));
    expect(low).toEqual([0, 1, 2, 3]);
    expect(high).toEqual([0, 4, 5, 6]);
    expect(servesFloor([], 5, 7)).toBe(true);
    expect(servesFloor(['nearest', 'zoneLow'], 5, 7)).toBe(false);
    expect(servesFloor(['zoneLow', 'zoneHigh'], 5, 7)).toBe(true); // 両方なら全部
    expect(CARDS.zoneLow(ctx({ hall: set(6, [1]) }))).toBeNull();
  });

  it('担当範囲外の待っている人には応えないが、乗っている人は担当外の階でも降ろす', () => {
    const s = createSim({ building: makeBuilding({ floors: 7 }), traffic: makeTraffic({ ratePerTick: 0 }), rules: [['zoneLow', 'nearest']] }, 1);
    const e = s.elevators[0]!;
    const far = addPassenger(s, 6, 0);   // 担当外(7階)
    for (let i = 0; i < 200; i++) step(s);
    expect(e.phase).toBe('idle');
    expect(far.state).toBe('waiting');
    const rider = addPassenger(s, 0, 6); // 1階から担当外の7階へ
    runUntil(s, () => rider.state === 'arrived');
    expect(rider.state).toBe('arrived');
  });

  it('空なら急行で1階へ: 降ろし終えると1階へ戻り、戻る途中の待っている人には止まらない', () => {
    const s = createSim({ building: makeBuilding({ floors: 7 }), traffic: makeTraffic({ ratePerTick: 0 }), rules: [['express', 'nearest']] }, 1);
    const e = s.elevators[0]!;
    const rider = addPassenger(s, 0, 5); // 1階から6階へ
    runUntil(s, () => rider.state === 'arrived');
    runUntil(s, () => e.phase === 'moving');
    expect(e.target).toBe(0);
    expect(e.tripCard).toBe('express');
    const p = addPassenger(s, 2, 6);     // 途中の3階で待つ人
    const opened: number[] = [];
    runUntil(s, () => { if (e.phase === 'open' && opened[opened.length - 1] !== e.pos) opened.push(e.pos); return p.state !== 'waiting'; });
    expect(opened[0]).toBe(0);           // 3階を通り過ぎて、まず1階に着く
    expect(p.state).toBe('riding');      // その後、近い呼び出しへ で迎えに行く
  });
});

describe('ルールで動くエレベーター', () => {
  it('カードなしなら、待っている人がいても動かない(手動のみ)', () => {
    const s = sim([[]]);
    addPassenger(s, 3, 0);
    for (let i = 0; i < 100; i++) step(s);
    expect(s.elevators[0]!.phase).toBe('idle');
    expect(s.elevators[0]!.pos).toBe(0);
  });

  it('近い呼び出しへ: 手で操作しなくても迎えに行き、運び終える', () => {
    const s = sim([['nearest']]);
    const p = addPassenger(s, 3, 1);
    runUntil(s, () => p.state === 'arrived');
    expect(p.state).toBe('arrived');
    expect(s.elevators[0]!.ruleIndex).toBeGreaterThanOrEqual(-3);
  });

  it('上の枠から評価する: 当てはまらないカードは飛ばして、次のカードが決める', () => {
    const s = sim([['sameDir', 'nearest']]);
    const e = s.elevators[0]!;
    // 3階(index2)で待機、heading は上。下にだけ呼び出し
    step(s, [{ type: 'goto', elevator: 0, floor: 2 }]);
    runUntil(s, () => e.phase === 'idle' && e.pos === 2000);
    expect(e.heading).toBe(1);
    addPassenger(s, 0, 4);
    step(s);
    expect(e.phase).toBe('moving');
    expect(e.target).toBe(0);
    expect(e.ruleIndex).toBe(1); // 2枠目(近い呼び出しへ)が決めた
  });

  it('同じ方向を優先で選んだ移動は、途中の待っている階にも止まる。近い呼び出しへ は止まらない', () => {
    for (const [card, expectStopAt1] of [['sameDir', true], ['nearest', false]] as const) {
      const s = sim([[card]]);
      const e = s.elevators[0]!;
      addPassenger(s, 3, 4);        // 4階(index3)で呼ぶ
      step(s);                      // 動き出す
      expect(e.phase).toBe('moving');
      addPassenger(s, 1, 4);        // 移動中に2階(index1)で呼ぶ
      const stops: number[] = [];
      runUntil(s, () => {
        if (e.phase === 'open' && stops[stops.length - 1] !== e.pos) stops.push(e.pos);
        return stops.includes(3000);
      });
      expect(stops.includes(1000)).toBe(expectStopAt1);
    }
  });

  it('乗っている人の降りる階は、カードに関係なく途中で必ず止まる(安全装置)', () => {
    // 今のカードはどれも降りる階を行き先の候補に入れるので、通常はこの状況にならない。
    // 行き詰まり防止の安全装置として、状態を直接作って確かめる。
    const s = sim([['sameDir']]);
    const e = s.elevators[0]!;
    addPassenger(s, 4, 0);  // 5階で待つ人 → 5階へ向かって動き出す
    step(s);
    expect(e.phase).toBe('moving');
    expect(e.target).toBe(4);
    const rider = addPassenger(s, 0, 1);
    rider.state = 'riding';
    rider.elevatorId = 0;
    e.stops[1] = true;      // 2階で降りたい人が乗っている状態にする
    const opened: number[] = [];
    runUntil(s, () => { if (e.phase === 'open') opened.push(e.pos); return e.pos === 4000; });
    expect(opened).toContain(1000);
    expect(rider.state).toBe('arrived');
  });

  it('手動の指示はルールより優先され、途中の階には止まらない', () => {
    const s = sim([['sameDir']]);
    const e = s.elevators[0]!;
    addPassenger(s, 1, 0);
    step(s, [{ type: 'goto', elevator: 0, floor: 4 }]);
    const opened: number[] = [];
    runUntil(s, () => { if (e.phase === 'open') opened.push(e.pos); return e.pos === 4000; });
    expect(opened.includes(1000)).toBe(false);
    expect(e.ruleIndex).toBe(-1);
  });

  it('満員で乗れない人しかいない階は呼び出しとして扱わない(同じ階で扉を開け閉めし続けない)', () => {
    const s = sim([['nearest']], { capacity: 3 });
    const e = s.elevators[0]!;
    addPassenger(s, 0, 4, 'group'); // 3人分で満員
    addPassenger(s, 0, 3, 'normal'); // 乗れない
    step(s);
    runUntil(s, () => e.phase === 'moving');
    expect(e.target).toBe(4); // 乗れない人のいる1階に留まらず、降ろしに行く
  });

  it('不正なルールは作成時に弾く', () => {
    const b = makeBuilding({ elevators: 1 });
    expect(() => createSim({ building: b, traffic: makeTraffic(), rules: [['nope' as CardId]] }, 1)).toThrow();
    expect(() => createSim({ building: b, traffic: makeTraffic(), rules: [[], []] }, 1)).toThrow();
  });
});

describe('ルールでの長時間運転(不変条件)', () => {
  const combos: CardId[][] = [['nearest'], ['sameDir'], ['express'], ['sameDir', 'nearest'], ['express', 'sameDir', 'nearest'], ['zoneLow', 'sameDir', 'nearest', 'express'], ['zoneHigh', 'express']];
  for (const rs of combos) {
    it(`[${rs.join(',')}] 2基: 定員超過なし・乗った人は60秒以内に降りる・決定的`, () => {
      const run = () => {
        const s = createSim({
          building: makeBuilding({ elevators: 2, capacity: 5, speed: 30 }),
          traffic: makeTraffic({ ratePerTick: 0.06, groupShare: 0.2, luggageShare: 0.2 }),
          rules: [rs, rs],
        }, 4);
        const boardedAt = new Map<number, number>();
        let maxRide = 0;
        const r = new Rng(3);
        for (let i = 0; i < 9000; i++) {
          // ときどき手動で割り込む
          step(s, r.chance(0.01) ? [{ type: 'goto', elevator: r.int(2), floor: r.int(5) }] : []);
          for (const e of s.elevators) {
            const load = s.passengers.filter((p) => p.state === 'riding' && p.elevatorId === e.id).reduce((a, p) => a + p.size, 0);
            expect(load).toBeLessThanOrEqual(5);
          }
          for (const p of s.passengers) {
            if (p.state === 'riding') {
              if (!boardedAt.has(p.id)) boardedAt.set(p.id, s.tick);
              maxRide = Math.max(maxRide, s.tick - boardedAt.get(p.id)!);
            }
          }
        }
        // 高負荷(約1.8人/秒)なので取りこぼしも多い。ここでは「実際に運べている」ことだけ確かめる
        expect(s.stats.delivered).toBeGreaterThan(150);
        return { maxRide, hash: stateHash(s) };
      };
      const a = run();
      expect(a.maxRide).toBeLessThan(60 * 30);
      expect(run().hash).toBe(a.hash);
    });
  }
});
