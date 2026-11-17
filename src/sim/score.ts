import { TICKS_PER_SECOND } from './building.ts';
import type { Stats } from './passenger.ts';

// 採点の式はこのファイルの1か所にまとめる(5.6節)。
// 一度公開したら、式を変えるときは共有文字列の版番号を上げること。
//
// 考え方: 1人運ぶごとに点が入り、その人の待ち時間が短いほど点が高い。
// 取りこぼした人は点が入らないうえに減点される。
// (運んだ人数・待ち時間・取りこぼしの3つを使う。人数だけで点が決まらないよう、待ち時間を1人ごとに効かせる)

/** 待ち時間0秒で運んだときの点 */
export const POINTS_MAX = 100;
/** 待ち時間1秒ごとに減る点 */
export const POINTS_LOST_PER_WAIT_SECOND = 3;
/** どれだけ待たせても、運べば最低この点は入る */
export const POINTS_MIN = 20;
/** 1人取りこぼすごとの減点 */
export const PENALTY_PER_MISS = 50;

/** 1人運び終えたときの点。整数だけで計算する(端末による誤差を出さないため) */
export function deliveryPoints(waitTicks: number): number {
  const lost = Math.floor((Math.max(0, waitTicks) * POINTS_LOST_PER_WAIT_SECOND) / TICKS_PER_SECOND);
  return Math.max(POINTS_MIN, POINTS_MAX - lost);
}

export interface ScoreResult {
  score: number;
  stars: 0 | 1 | 2 | 3;
  delivered: number;
  missed: number;
  /** 乗った人の平均待ち時間(秒)。表示用。誰も乗っていなければ 0 */
  avgWaitSec: number;
}

export function computeScore(st: Stats, starThresholds: readonly [number, number, number]): ScoreResult {
  const score = Math.max(0, st.servicePoints - st.missed * PENALTY_PER_MISS);
  let stars: 0 | 1 | 2 | 3 = 0;
  if (score >= starThresholds[0]) stars = 1;
  if (score >= starThresholds[1]) stars = 2;
  if (score >= starThresholds[2]) stars = 3;
  return {
    score,
    stars,
    delivered: st.delivered,
    missed: st.missed,
    avgWaitSec: st.boarded > 0 ? st.totalWait / st.boarded / TICKS_PER_SECOND : 0,
  };
}
