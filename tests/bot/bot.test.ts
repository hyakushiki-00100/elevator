import { describe, expect, it } from 'vitest';
import { STAGES } from '../../src/sim/stages.ts';
import { makeBuilding } from '../../src/sim/building.ts';
import type { Stage } from '../../src/sim/stages.ts';
import { BotCheckError, botsFor, flags, runDay, summarize } from './runner.ts';

// npm test では時間を抑えるためシード1〜3。全20シードは npm run check:bots で回す。
describe('自動プレイボット: 全ステージを最後まで遊ばせても異常がない', () => {
  for (const stage of STAGES) {
    for (const spec of botsFor(stage)) {
      it(`ステージ${stage.id} ${spec.name}`, () => {
        for (const seed of [1, 2, 3]) {
          const r = runDay(stage, spec, seed);
          expect(r.spawned).toBe(r.delivered + r.missed);
          expect(r.ticks).toBeLessThanOrEqual(5400 + stage.traffic.overtimeTicks);
        }
      });
    }
  }
});

describe('検出の仕組みそのもの', () => {
  const st = STAGES[0]!;

  it('ボットが例外を投げたら BotCheckError で止まる', () => {
    const bad = { name: 'bad', bot: () => { throw new Error('boom'); } };
    expect(() => runDay(st, bad, 1)).toThrow(BotCheckError);
  });

  it('不正な設定(作成時の例外)も BotCheckError になる', () => {
    const broken: Stage = { ...st, building: makeBuilding({ floors: 1 }) };
    expect(() => runDay(broken, { name: 'idle', bot: () => [] }, 1)).toThrow(BotCheckError);
  });

  it('1日が終わらなくなる不具合(ここではボットが状態を壊して再現)は、無限ループとして止まる', () => {
    const breaker = { name: 'breaker', bot: (s: { dayTicks: number }) => { s.dayTicks = Number.POSITIVE_INFINITY; return []; } };
    expect(() => runDay(st, breaker as never, 1)).toThrow(/無限ループ/);
  });

  it('乗客が消える不具合(ここではボットが待ち行列から1人消して再現)は、人数の合計の不一致として止まる', () => {
    let done = false;
    const thief = { name: 'thief', bot: (s: { passengers: unknown[] }) => { if (!done && s.passengers.length > 0) { s.passengers.pop(); done = true; } return []; } };
    expect(() => runDay(st, thief as never, 1)).toThrow(/人数の合計が合わない/);
  });

  it('調整候補の判定: idle が星1以上・最良でも星1未満・ばらつき大 を報告する', () => {
    const fake: Stage = { ...st, stars: [100, 200, 300] };
    const rows = [
      ...[1, 2].map((seed) => ({ stage: st.id, bot: 'idle', seed, score: 150, stars: 1, delivered: 0, missed: 0, spawned: 0, avgWaitSec: 0, ticks: 0 })),
      ...[1, 2].map((seed) => ({ stage: st.id, bot: 'preset-rules:x', seed, score: seed === 1 ? 10 : 90, stars: 0, delivered: 0, missed: 0, spawned: 0, avgWaitSec: 0, ticks: 0 })),
    ];
    const f = flags(fake, summarize(rows));
    expect(f.some((x) => x.startsWith('簡単すぎる'))).toBe(true);
    expect(f.some((x) => x.startsWith('難しすぎる'))).toBe(true);
    expect(f.some((x) => x.startsWith('運の要素が強い'))).toBe(true);
  });
});
