import { describe, expect, it } from 'vitest';
import { createSim, stateHash, step } from '../src/sim/sim.ts';
import { computeScore } from '../src/sim/score.ts';
import { STAGES, type Stage } from '../src/sim/stages.ts';
import { daySeed, playDay, rateRules, RATING_DAYS } from '../src/sim/evaluate.ts';
import { dayTicks } from '../src/sim/traffic.ts';
import type { CardId } from '../src/sim/rules.ts';
import { expertBot, greedyBot, idleBot, type Bot } from '../tools/bots.ts';

/** 手動相当のボットの、正式な採点と同じ日々での平均 */
function botAverage(st: Stage, bot: Bot): number {
  let sum = 0;
  for (let k = 0; k < RATING_DAYS; k++) {
    const s = createSim({ building: st.building, traffic: st.traffic }, daySeed(st.seed, k));
    while (!s.finished) step(s, bot(s));
    sum += computeScore(s.stats, st.stars).score;
  }
  return Math.floor(sum / RATING_DAYS);
}
const both = (r: CardId[]): CardId[][] => [r, r];

describe('正式な採点(複数日の平均)', () => {
  const st = STAGES[0]!;
  it('0日目はステージのシードそのもの(画面で見せる日)で、各日のシードは異なる', () => {
    expect(daySeed(st.seed, 0)).toBe(st.seed);
    const seeds = new Set(Array.from({ length: RATING_DAYS }, (_, k) => daySeed(st.seed, k)));
    expect(seeds.size).toBe(RATING_DAYS);
  });

  it('決定的: 同じルールなら何度計算しても同じ点', () => {
    const a = rateRules(st, [['sameDir', 'nearest']]);
    const b = rateRules(st, [['sameDir', 'nearest']]);
    expect(a).toEqual(b);
    expect(a.perDay).toHaveLength(RATING_DAYS);
  });

  it('0日目の点は、画面で遊ぶ日(ステージのシード・同じルール)の点と一致する', () => {
    const rules: CardId[][] = [['nearest']];
    const s = createSim({ building: st.building, traffic: st.traffic, rules }, st.seed);
    while (!s.finished) step(s);
    expect(rateRules(st, rules).perDay[0]).toBe(computeScore(s.stats, st.stars).score);
    expect(playDay(st, rules, st.seed).score).toBe(computeScore(s.stats, st.stars).score);
  });

  it('点は各日の平均(切り捨て)で、星は閾値で決まる', () => {
    const r = rateRules(st, [['nearest']]);
    expect(r.score).toBe(Math.floor(r.perDay.reduce((x, y) => x + y, 0) / RATING_DAYS));
    const expected = r.score >= st.stars[2] ? 3 : r.score >= st.stars[1] ? 2 : r.score >= st.stars[0] ? 1 : 0;
    expect(r.stars).toBe(expected);
  });

  it('手動の指示を受け付けた日は manualUsed が立つ(範囲外の指示では立たない)', () => {
    const s = createSim({ building: st.building, traffic: st.traffic, rules: [['nearest']] }, st.seed);
    step(s, [{ type: 'goto', elevator: 0, floor: 99 }]);
    expect(s.manualUsed).toBe(false);
    const h = stateHash(s);
    step(s, [{ type: 'goto', elevator: 0, floor: 2 }]);
    expect(s.manualUsed).toBe(true);
    expect(stateHash(s)).not.toBe(h);
  });
});

describe('ステージの並びと共通の性質', () => {
  it('開く順(opensAt の小さい順)に並び、1日は3分', () => {
    for (let i = 0; i < STAGES.length; i++) {
      expect(dayTicks(STAGES[i]!.traffic)).toBe(5400);
      expect(STAGES[i]!.stars[0]).toBeLessThan(STAGES[i]!.stars[1]);
      expect(STAGES[i]!.stars[1]).toBeLessThan(STAGES[i]!.stars[2]);
      if (i > 0) expect(STAGES[i]!.opensAt).toBeGreaterThanOrEqual(STAGES[i - 1]!.opensAt);
    }
    expect(STAGES[0]!.opensAt).toBe(0);
  });

  for (const st of STAGES) {
    it(`ステージ${st.id}: 画面で見せる日は平均的な日(発生人数が200シードの中央値±5%以内)`, () => {
      const count = (seed: number) => { const s = createSim({ building: st.building, traffic: st.traffic }, seed); while (!s.finished) step(s); return s.stats.spawned; };
      const counts = Array.from({ length: 200 }, (_, k) => count(1000 + k)).sort((a, b) => a - b);
      const median = counts[100]!;
      expect(Math.abs(count(st.seed) - median)).toBeLessThanOrEqual(median * 0.05);
    });

    it(`ステージ${st.id}: 何もしなければ星0、手動の初心者は2★、手動の上級者でも3★には届かない`, () => {
      expect(botAverage(st, idleBot)).toBe(0);
      expect(botAverage(st, greedyBot)).toBeGreaterThanOrEqual(st.stars[1]);
      expect(botAverage(st, expertBot)).toBeLessThan(st.stars[2]);
    });
  }
});

describe('ステージごとに3★に必要な「考え方」(較正の前提)', () => {
  it('ステージ1: 「同じ方向を優先」を「近い呼び出しへ」の上に置くと3★。逆順や1枚だけでは届かない', () => {
    const st = STAGES[0]!;
    expect(rateRules(st, [['sameDir', 'nearest']]).stars).toBe(3);
    expect(rateRules(st, [['nearest', 'sameDir']]).stars).toBe(2);
    expect(rateRules(st, [['nearest']]).stars).toBe(2);
  });

  it('ステージ2: 2基をきちんと自動化すれば3★。「限界が近い人を優先」を上に置くと届かない', () => {
    const st = STAGES[1]!;
    expect(rateRules(st, both(['nearest'])).stars).toBe(3);
    expect(rateRules(st, both(['sameDir', 'nearest'])).stars).toBe(3);
    expect(rateRules(st, both(['urgent', 'nearest'])).stars).toBeLessThan(3);
  });

  it('ステージ3: 担当範囲のカードで下層・上層に分けると3★。分けないと届かない(差は8%以上)', () => {
    const st = STAGES[2]!;
    const zone = rateRules(st, [['zoneLow', 'nearest'], ['zoneHigh', 'nearest']]);
    const plain = rateRules(st, both(['nearest']));
    expect(zone.stars).toBe(3);
    expect(plain.stars).toBeLessThan(3);
    expect(zone.score / plain.score).toBeGreaterThan(1.08);
  });
});
