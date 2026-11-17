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
    seed: 1001,
    // 速度30(0.9階/秒)・定員6: エレベーターが足りない資源になり、運び方の良し悪しが点に出る。
    // 速度60・定員8では、どう動かしても待ち時間がほぼ同じで、点に差が出なかった。
    building: makeBuilding({ floors: 5, elevators: 1, capacity: 6, speed: 30 }),
    traffic: {
      phases: [
        // 朝: ゆっくり始まり、1階から上へ向かう人がやや多い
        makePhase({ ticks: MIN, rate: 0.010, fromGround: 0.4, toGround: 0.1 }),
        // 昼: 階と階の間の移動
        makePhase({ ticks: MIN, rate: 0.014, fromGround: 0.1, toGround: 0.1 }),
        // 夕方: 一番忙しく、上から1階へ向かう人が多い
        makePhase({ ticks: MIN, rate: 0.018, fromGround: 0.1, toGround: 0.4 }),
      ],
      overtimeTicks: 600,
    },
    // 1★: 初心者ボットの約半分 / 2★: 初心者ボット並み / 3★: 上級者ボットの95%(手動では難しく、ルールのカードで届く想定)
    stars: [2200, 4000, 4500],
  },
];
