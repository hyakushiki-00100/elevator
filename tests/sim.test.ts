import { describe, expect, it } from 'vitest';
import { makeBuilding } from '../src/sim/building.ts';
import { Rng } from '../src/sim/rng.ts';
import { addPassenger, createSim, stateHash, step, type SimState } from '../src/sim/sim.ts';
import { makeTraffic } from '../src/sim/traffic.ts';
import { KIND_PATIENCE } from '../src/sim/passenger.ts';

function quietSim(buildingOverrides = {}, seed = 1): SimState {
  return createSim(
    { building: makeBuilding(buildingOverrides), traffic: makeTraffic({ ratePerTick: 0 }) },
    seed,
  );
}

function run(s: SimState, ticks: number): void {
  for (let i = 0; i < ticks; i++) step(s);
}

describe('Rng', () => {
  it('同じシードなら同じ列、違うシードなら違う列', () => {
    const a = new Rng(42), b = new Rng(42), c = new Rng(43);
    const xs = Array.from({ length: 20 }, () => a.next());
    const ys = Array.from({ length: 20 }, () => b.next());
    const zs = Array.from({ length: 20 }, () => c.next());
    expect(xs).toEqual(ys);
    expect(xs).not.toEqual(zs);
  });
  it('next は [0,1)、int は [0,n)', () => {
    const r = new Rng(7);
    for (let i = 0; i < 10000; i++) {
      const x = r.next();
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThan(1);
      const n = r.int(5);
      expect(Number.isInteger(n) && n >= 0 && n < 5).toBe(true);
    }
  });
});

describe('決定性', () => {
  const cfg = {
    building: makeBuilding({ elevators: 2 }),
    traffic: makeTraffic({ ratePerTick: 0.05, rushedShare: 0.2, groupShare: 0.1, luggageShare: 0.1 }),
  };
  function play(seed: number): number {
    const s = createSim(cfg, seed);
    for (let i = 0; i < 5000; i++) {
      // 入力も決まった列にする
      step(s, i % 90 === 0 ? [{ type: 'goto', elevator: (i / 90) % 2, floor: (i / 90) % 5 }] : []);
    }
    return stateHash(s);
  }
  it('同じシード・同じ入力なら同じ結果', () => {
    expect(play(123)).toBe(play(123));
  });
  it('違うシードなら違う結果', () => {
    expect(play(123)).not.toBe(play(124));
  });
  it('sim/ の中で Math.random を使っていない', () => {
    const files = import.meta.glob('../src/sim/*.ts', { query: '?raw', import: 'default', eager: true });
    expect(Object.keys(files).length).toBeGreaterThanOrEqual(6);
    for (const [path, src] of Object.entries(files)) {
      const code = (src as string).split('\n').filter((l) => !l.trim().startsWith('//')).join('\n');
      expect(code.includes('Math.random'), path).toBe(false);
    }
  });
});

describe('エレベーターの基本動作', () => {
  it('呼ばれた階へ行き、乗せて、行き先で降ろす', () => {
    const s = quietSim();
    const p = addPassenger(s, 3, 1);
    step(s, [{ type: 'goto', elevator: 0, floor: 3 }]);
    run(s, 400);
    expect(s.stats.boarded).toBe(1);
    expect(s.stats.delivered).toBe(1);
    expect(p.state).toBe('arrived');
    expect(s.passengers).toHaveLength(0);
    expect(s.elevators[0]!.phase).toBe('idle');
    expect(s.elevators[0]!.pos).toBe(1000);
  });

  it('移動時間: 3階分(3000ミリ階)を速度60で動くと50tickで着く', () => {
    const s = quietSim();
    step(s, [{ type: 'goto', elevator: 0, floor: 3 }]); // idle→moving
    let n = 0;
    while (s.elevators[0]!.phase !== 'open' && n < 1000) { step(s); n++; }
    expect(s.elevators[0]!.pos).toBe(3000);
    expect(n).toBe(50); // 決定→移動開始で1tick、その後49tickで到着
  });

  it('範囲外の階・存在しないエレベーターへの指示は無視される', () => {
    const s = quietSim();
    step(s, [
      { type: 'goto', elevator: 0, floor: 99 },
      { type: 'goto', elevator: 5, floor: 1 },
      { type: 'goto', elevator: 0, floor: 1.5 },
    ]);
    expect(s.elevators[0]!.manualTarget).toBeNull();
    expect(s.elevators[0]!.phase).toBe('idle');
  });

  it('移動中でも別の階に指示し直せる', () => {
    const s = quietSim();
    step(s, [{ type: 'goto', elevator: 0, floor: 4 }]);
    run(s, 20);
    step(s, [{ type: 'goto', elevator: 0, floor: 1 }]);
    run(s, 100);
    expect(s.elevators[0]!.pos).toBe(1000);
  });

  it('今いる階への指示で扉が開き、待っている人が乗れる', () => {
    const s = quietSim();
    addPassenger(s, 0, 2);
    step(s, [{ type: 'goto', elevator: 0, floor: 0 }]);
    run(s, 300);
    expect(s.stats.delivered).toBe(1);
  });
});

describe('定員', () => {
  it('入りきらない人は乗れず、後ろの入れる人は乗る', () => {
    const s = quietSim({ capacity: 4 });
    const g1 = addPassenger(s, 0, 4, 'group');   // size 3
    const g2 = addPassenger(s, 0, 4, 'group');   // size 3 → 入らない
    const n1 = addPassenger(s, 0, 4, 'normal');  // size 1 → 入る
    step(s, [{ type: 'goto', elevator: 0, floor: 0 }]);
    run(s, 5);
    expect(g1.state).toBe('riding');
    expect(g2.state).toBe('waiting');
    expect(n1.state).toBe('riding');
  });

  it('荷物持ちは2人分', () => {
    const s = quietSim({ capacity: 3 });
    const l1 = addPassenger(s, 0, 2, 'luggage');
    const l2 = addPassenger(s, 0, 2, 'luggage');
    step(s, [{ type: 'goto', elevator: 0, floor: 0 }]);
    run(s, 5);
    expect(l1.state).toBe('riding');
    expect(l2.state).toBe('waiting');
  });

  it('降りた分の空きに、同じ停止で乗れる', () => {
    const s = quietSim({ capacity: 3 });
    const a = addPassenger(s, 0, 1, 'group');   // 満員にして1階へ
    const b = addPassenger(s, 1, 2, 'group');   // 1階で待っている
    step(s, [{ type: 'goto', elevator: 0, floor: 0 }]);
    run(s, 400);
    expect(a.state).toBe('arrived');
    expect(b.state).toBe('arrived'); // aが降りたあと乗って2階へ
  });
});

describe('我慢の限界', () => {
  it('限界を超えると取りこぼしとして去る', () => {
    const s = quietSim();
    const p = addPassenger(s, 4, 0, 'normal');
    run(s, KIND_PATIENCE.normal - 1);
    expect(p.state).toBe('waiting');
    run(s, 1);
    expect(p.state).toBe('gone');
    expect(s.stats.missed).toBe(1);
    expect(s.passengers).toHaveLength(0);
  });

  it('急ぎの人は早く去る', () => {
    const s = quietSim();
    const p = addPassenger(s, 4, 0, 'rushed');
    run(s, KIND_PATIENCE.rushed);
    expect(p.state).toBe('gone');
  });

  it('乗車済みの人は去らない', () => {
    const s = quietSim();
    const p = addPassenger(s, 0, 4);
    step(s, [{ type: 'goto', elevator: 0, floor: 0 }]);
    run(s, 10);
    expect(p.state).toBe('riding');
    run(s, 400);
    expect(s.stats.missed).toBe(0);
    expect(s.stats.delivered).toBe(1);
  });
});

describe('統計の整合', () => {
  it('発生数 = 配達 + 取りこぼし + 残り', () => {
    const s = createSim(
      { building: makeBuilding({ elevators: 1 }), traffic: makeTraffic({ ratePerTick: 0.03 }) },
      99,
    );
    for (let i = 0; i < 6000; i++) {
      step(s, i % 60 === 0 ? [{ type: 'goto', elevator: 0, floor: (i / 60) % 5 }] : []);
    }
    const st = s.stats;
    expect(st.spawned).toBeGreaterThan(100);
    expect(st.spawned).toBe(st.delivered + st.missed + s.passengers.length);
  });
});

describe('検証で追加したテスト', () => {
  it('[回帰] 下向きに来て止まった後は、下の行き先を先に回る(進行方向の優先)', () => {
    const s = quietSim();
    const e = s.elevators[0]!;
    step(s, [{ type: 'goto', elevator: 0, floor: 3 }]);
    run(s, 200); // index3 で待機
    addPassenger(s, 1, 0);
    addPassenger(s, 1, 4);
    step(s, [{ type: 'goto', elevator: 0, floor: 1 }]); // 下向きに index1 へ
    let sawOpenAt1 = false;
    for (let i = 0; i < 500; i++) {
      step(s);
      if (e.phase === 'open' && e.pos === 1000) sawOpenAt1 = true;
      if (sawOpenAt1 && e.phase === 'moving') break;
    }
    expect(sawOpenAt1).toBe(true);
    expect({ target: e.target, dir: e.dir }).toEqual({ target: 0, dir: -1 });
  });

  it('上向きに来た場合は、上の行き先を先に回る', () => {
    const s = quietSim();
    const e = s.elevators[0]!;
    addPassenger(s, 2, 0);
    addPassenger(s, 2, 4);
    step(s, [{ type: 'goto', elevator: 0, floor: 2 }]); // 上向きに index2 へ
    let sawOpen = false;
    for (let i = 0; i < 500; i++) {
      step(s);
      if (e.phase === 'open' && e.pos === 2000) sawOpen = true;
      if (sawOpen && e.phase === 'moving') break;
    }
    expect({ target: e.target, dir: e.dir }).toEqual({ target: 4, dir: 1 });
  });

  it('扉が開いている間に来た人も乗れ、扉の時間が延びる', () => {
    const s = quietSim();
    const e = s.elevators[0]!;
    step(s, [{ type: 'goto', elevator: 0, floor: 0 }]); // 扉を開ける
    run(s, s.building.doorTicks - 3); // 閉まる直前
    expect(e.phase).toBe('open');
    const p = addPassenger(s, 0, 2);
    step(s);
    expect(p.state).toBe('riding');
    expect(e.timer).toBe(s.building.boardTicks - 1);
  });

  it('2基: 別のエレベーターの乗客は降ろさない', () => {
    const s = quietSim({ elevators: 2 });
    const a = addPassenger(s, 0, 2);
    step(s, [{ type: 'goto', elevator: 0, floor: 0 }]);
    run(s, 3);
    expect(a.state).toBe('riding');
    expect(a.elevatorId).toBe(0);
    // 1号機を index2 に先回りさせても、0号機の乗客は降りない
    step(s, [{ type: 'goto', elevator: 1, floor: 2 }]);
    run(s, 60);
    expect(s.elevators[1]!.pos).toBe(2000);
    expect(a.state).toBe('riding');
  });

  it('待ち時間の定義: 乗った tick の終わり時点での待ち tick 数(我慢の限界と同じ数え方)', () => {
    const s = quietSim();
    addPassenger(s, 0, 2); // spawnTick = 0
    step(s, [{ type: 'goto', elevator: 0, floor: 0 }]); // tick0: idle→open
    step(s); // tick1: 乗る → 待ち = 1+1-0 = 2
    expect(s.stats.boarded).toBe(1);
    expect(s.stats.totalWait).toBe(2);
  });

  it('不正な建物の設定は作成時に弾く', () => {
    const bad = [{ floors: 1 }, { elevators: 0 }, { speed: 0 }, { doorTicks: 0 }, { floors: 2.5 }];
    for (const o of bad) {
      expect(() => createSim({ building: makeBuilding(o), traffic: makeTraffic() }, 1)).toThrow();
    }
  });

  it('発生する乗客は常に範囲内で、出発階と行き先が違う(長時間)', () => {
    const s = createSim(
      { building: makeBuilding({ floors: 7 }), traffic: makeTraffic({ ratePerTick: 0.5, groupShare: 0.3, luggageShare: 0.3, rushedShare: 0.2 }) },
      5,
    );
    const seen = new Set<string>();
    let bad = 0;
    let checked = 0;
    for (let i = 0; i < 3000; i++) {
      step(s);
      // 新しく発生した人(spawnTick が今の tick)だけを調べる
      for (const p of s.passengers) {
        if (p.spawnTick !== s.tick - 1) continue;
        checked++;
        if (p.origin < 0 || p.origin >= 7 || p.dest < 0 || p.dest >= 7 || p.dest === p.origin) bad++;
        seen.add(p.kind);
      }
    }
    expect(checked).toBeGreaterThan(1000);
    expect(bad).toBe(0);
    expect(seen).toEqual(new Set(['normal', 'rushed', 'group', 'luggage']));
  });

  it('定員を超えて乗ることはない(長時間・ランダム操作)', () => {
    const s = createSim(
      { building: makeBuilding({ elevators: 2, capacity: 5 }), traffic: makeTraffic({ ratePerTick: 0.2, groupShare: 0.3, luggageShare: 0.3 }) },
      77,
    );
    const r = new Rng(9); // 操作用の別乱数
    for (let i = 0; i < 8000; i++) {
      const cmds = r.chance(0.05) ? [{ type: 'goto' as const, elevator: r.int(2), floor: r.int(5) }] : [];
      step(s, cmds);
      for (const e of s.elevators) {
        const load = s.passengers.filter((p) => p.state === 'riding' && p.elevatorId === e.id).reduce((a, p) => a + p.size, 0);
        expect(load).toBeLessThanOrEqual(5);
        expect(e.pos).toBeGreaterThanOrEqual(0);
        expect(e.pos).toBeLessThanOrEqual(4000);
        if (e.phase !== 'moving') expect(e.pos % 1000).toBe(0);
      }
    }
    expect(s.stats.spawned).toBe(s.stats.delivered + s.stats.missed + s.passengers.length);
    expect(s.stats.delivered).toBeGreaterThan(0);
  });
});
