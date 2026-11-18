import { makeBuilding, type Building } from './building.ts';
import { makePhase, type DayPlan } from './traffic.ts';

export interface Stage {
  id: number;
  /**
   * ステージごとに固定のシード。画面で見せる日(0日目)に使い、正式な採点の各日のシードもここから決まる
   * (sim/evaluate.ts の daySeed)。同じルールなら誰の端末でも同じ点数になる。
   */
  seed: number;
  building: Building;
  traffic: DayPlan;
  /** 星1・2・3に必要な点数(カードだけで動かした日は、複数日の平均の点で判定する: sim/evaluate.ts) */
  stars: [number, number, number];
  /** 持っているカードがこの枚数以上になると開く(配列は opensAt の小さい順に並べる) */
  opensAt: number;
}

/** 1分 = 1800tick */
const MIN = 1800;

// 数値は `node tools/calibrate.ts` の結果から決めた暫定値(点はすべて正式な採点と同じ20日平均)。
// 星の考え方: 1★=手動の初心者の約半分 / 2★=手動の初心者並み / 3★=そのステージに合った「考え方」のカードが必要。
// シードは `node tools/calibrate.ts seeds` で、画面で見せる日が平均的な日(発生人数が中央値付近で、
// その日の点が20日平均に近い日)を選ぶ。
export const STAGES: readonly Stage[] = [
  {
    id: 1,
    // 以前の1001は、200シード中で下位3%の「軽い日」で、3日目の判定で簡単すぎた原因の1つだった。
    seed: 1031,
    // 速度30(0.9階/秒)・定員6: エレベーターが足りない資源になり、運び方の良し悪しが点に出る。
    // 速度60・定員8では、どう動かしても待ち時間がほぼ同じで、点に差が出なかった。
    building: makeBuilding({ floors: 5, elevators: 1, capacity: 6, speed: 30 }),
    traffic: {
      phases: [
        // 朝: 肩慣らし。1階から上へ向かう人がやや多い。だんだん増える
        makePhase({ ticks: MIN, rate: 0.010, rateEnd: 0.014, fromGround: 0.4, toGround: 0.1 }),
        // 昼: 階と階の間の移動
        makePhase({ ticks: MIN, rate: 0.014, rateEnd: 0.019, fromGround: 0.1, toGround: 0.1 }),
        // 夕方: 一番忙しく、上から1階へ向かう人が多い
        makePhase({ ticks: MIN, rate: 0.019, rateEnd: 0.025, fromGround: 0.1, toGround: 0.4 }),
      ],
      overtimeTicks: 600,
    },
    // 20日平均: 手動相当 上級者 6202 / 初心者 5466
    //   カード [同方向,近い] 6771 / [近い] 6537 / [限界,近い] 6443
    // 3★: 「同じ方向を優先」を「近い呼び出しへ」の上に置く考え方が必要
    stars: [2800, 5400, 6700],
    opensAt: 0,
  },
  {
    id: 2,
    seed: 1039,
    // 7階・2基。朝夕のラッシュ。カードの組み合わせによる差は小さい(上位は±1.5%以内)
    // ので、「2基をきちんと自動化できれば3★」のステージにした。
    building: makeBuilding({ floors: 7, elevators: 2, capacity: 6, speed: 30 }),
    traffic: {
      phases: [
        // 朝: 静かに始まり、1階から上へのラッシュが急に強まる
        makePhase({ ticks: MIN, rate: 0.008, rateEnd: 0.030, fromGround: 0.85, toGround: 0 }),
        // 昼: 階と階の間の移動(軽め)
        makePhase({ ticks: MIN, rate: 0.012, rateEnd: 0.016, fromGround: 0.1, toGround: 0.1 }),
        // 夕方: 上から1階へのラッシュ
        makePhase({ ticks: MIN, rate: 0.020, rateEnd: 0.032, fromGround: 0, toGround: 0.75 }),
      ],
      overtimeTicks: 600,
    },
    // 20日平均: 手動相当 上級者 6915 / 初心者 5936
    //   カード 両方[近い] 7616 / 両方[同方向,近い] 7591 / ゾーン+[近い] 7618 / 両方[限界,近い] 6982
    stars: [3000, 5900, 7550],
    opensAt: 3,
  },
  {
    id: 3,
    // 画面で見せる日の点が、ゾーン分け・近いだけのどちらでも20日平均との差1%以内
    seed: 1008,
    // 7階・2基。下の階どうし・上の階どうしの移動が多い「2つの集団」のビル。
    building: makeBuilding({ floors: 7, elevators: 2, capacity: 6, speed: 30 }),
    traffic: {
      phases: [
        makePhase({ ticks: MIN, rate: 0.020, rateEnd: 0.028, local: 0.9 }),
        makePhase({ ticks: MIN, rate: 0.022, rateEnd: 0.030, local: 0.9 }),
        makePhase({ ticks: MIN, rate: 0.024, rateEnd: 0.032, local: 0.9 }),
      ],
      overtimeTicks: 600,
    },
    // 20日平均(seed 1008): カード ゾーン+[近い] 11637 / 両方[近い] 10552(ゾーン分けが+10%)
    // 3★: 担当範囲のカードで、下層と上層に分ける考え方が必要
    stars: [5000, 9700, 11200],
    opensAt: 6,
  },
];
