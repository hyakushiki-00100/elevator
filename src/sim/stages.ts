import { makeBuilding, type Building } from './building.ts';
import { makePhase, type DayPlan } from './traffic.ts';

export interface Stage {
  id: number;
  /** ステージごとに固定のシード(同じルールなら誰の端末でも同じ点数になるように) */
  seed: number;
  building: Building;
  traffic: DayPlan;
  /** 星1・2・3に必要な点数 */
  stars: [number, number, number];
}

/** 1分 = 1800tick */
const MIN = 1800;

// 数値は tools/calibrate.ts の結果から決めた暫定値。3日目の判定(実際に遊ぶ)で調整する。
export const STAGES: readonly Stage[] = [
  {
    id: 1,
    // 平均的な日を選んだ(`node tools/calibrate.ts seeds`): 発生人数が中央値に近く、
    // 「進行方向で拾う」と「近い階1つずつ」の点の比も200シードの平均に近い。
    // 以前の1001は下位3%の「軽い日」で、簡単すぎる原因の1つだった。
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
    // このシードでの点: 手動相当のボット 上級者 6411 / 初心者 5646 / 反応1秒遅い初心者 5461
    //                   カードだけの自動運転 [近い] 6698 / [同方向,近い] 7498 / [長く待つ] 7259
    // 1★: 初心者の約半分 / 2★: 反応の遅い初心者並み / 3★: カードの組み合わせが必要(1枚目だけでは届かない)
    stars: [2800, 5400, 7200],
  },
];
