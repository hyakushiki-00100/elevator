import { describe, expect, it } from 'vitest';
import { WALK_TICKS } from '../src/sim/passenger.ts';
import { createSim, step } from '../src/sim/sim.ts';
import { STAGES } from '../src/sim/stages.ts';

// 乗客が歩いて行列に着くまで待つ(案B、2026-11-21 本採用)。
describe('歩いて登場(案B)', () => {
  it('歩いている間は乗れず、着いてから乗る。全ステージで1日が終わり、人数の合計が合う', () => {
    for (const st of STAGES) {
      const rules = Array.from({ length: st.building.elevators }, () => ['nearest' as const]);
      const s = createSim({ building: st.building, traffic: st.traffic, rules, walkTicks: WALK_TICKS }, st.seed);
      let guard = 0;
      while (!s.finished && guard++ < 20000) {
        step(s);
        for (const p of s.passengers) {
          // 乗っている人は、必ず着いた後に乗っている
          if (p.state === 'riding') expect(p.spawnTick).toBeLessThanOrEqual(s.tick);
        }
      }
      expect(s.finished).toBe(true);
      expect(s.stats.delivered + s.stats.missed).toBe(s.stats.spawned);
    }
  });
  it('walkTicks を省略すると WALK_TICKS(2秒)を使う', () => {
    const st = STAGES[0]!;
    const a = createSim({ building: st.building, traffic: st.traffic, rules: [['nearest']] }, st.seed);
    const b = createSim({ building: st.building, traffic: st.traffic, rules: [['nearest']], walkTicks: WALK_TICKS }, st.seed);
    while (!a.finished) step(a);
    while (!b.finished) step(b);
    expect(b.stats).toEqual(a.stats);
  });
});
