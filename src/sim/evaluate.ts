import type { Building } from './building.ts';
import type { CardId } from './rules.ts';
import { computeScore, type ScoreResult } from './score.ts';
import { createSim, step } from './sim.ts';
import type { DayPlan } from './traffic.ts';

// ルールの評価(採点方式A、2026-11-18 決定):
// 1日分の点は運のぶれが大きく、カードの組み合わせの差より大きいことがある。
// そこで、カードだけで動かした日(手動操作なし)の正式な点は、同じルールで RATING_DAYS 日分を
// 画面に出さずに計算した平均にする。シードはステージのシードから決まるので、誰の端末でも同じ点になる。
// この日数やシードの決め方を変えると共有した点数が変わるため、公開後は共有文字列の版番号を上げること。

export const RATING_DAYS = 20;

/** k 日目のシード。0日目はステージのシードそのもの(画面で見せる日) */
export function daySeed(stageSeed: number, k: number): number {
  return (stageSeed + k * 7919) >>> 0;
}

export interface RatingInput {
  building: Building;
  traffic: DayPlan;
  seed: number;
  stars: readonly [number, number, number];
}

export interface Rating {
  /** 平均の点(整数、切り捨て) */
  score: number;
  stars: 0 | 1 | 2 | 3;
  /** 各日の点(0日目が画面で見せる日) */
  perDay: number[];
}

/** その日の点数と同じ式で星を決める(閾値は score.ts と同じ判定) */
function starsFor(score: number, th: readonly [number, number, number]): 0 | 1 | 2 | 3 {
  return computeScore({ spawned: 0, boarded: 0, delivered: 0, missed: 0, totalWait: 0, servicePoints: score }, th).stars;
}

/** 1日分をカードだけで最後まで回す */
export function playDay(input: RatingInput, rules: readonly (readonly CardId[])[], seed: number): ScoreResult {
  const s = createSim({ building: input.building, traffic: input.traffic, rules }, seed);
  while (!s.finished) step(s);
  return computeScore(s.stats, input.stars);
}

export function rateRules(input: RatingInput, rules: readonly (readonly CardId[])[], days = RATING_DAYS): Rating {
  const perDay: number[] = [];
  for (let k = 0; k < days; k++) perDay.push(playDay(input, rules, daySeed(input.seed, k)).score);
  const score = Math.floor(perDay.reduce((a, b) => a + b, 0) / days);
  return { score, stars: starsFor(score, input.stars), perDay };
}
