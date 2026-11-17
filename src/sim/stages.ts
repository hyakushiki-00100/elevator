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
  {
    id: 2,
    // `node tools/calibrate.ts seeds` の候補(発生人数が中央値付近)のうち、ゾーン分けの組み合わせが
    // 勝つシードを選んだ(新しく手に入る担当範囲のカードが報われるように)。
    // 注意: 20シードの平均では組み合わせ同士の差は±3%程度で、どれが有利かはシード群によって入れ替わる。
    // 「ゾーン分けが一般に有利」とは言えない(CLAUDE.md 9.5節)。
    seed: 1039,
    // 7階・2基。2基目が加わり、ゾーン分け(担当範囲のカード)が効く場面を作る
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
    // このシードでの点: 手動相当 上級者 7457 / 初心者 6399 / 反応1秒遅い初心者 5121
    //   カード: 両方[同方向,近い] 7684 / 両方[近い] 7487 / ゾーン+[同方向,近い] 8239 / ゾーン+[同方向,近い,1階] 8136
    // 1★: 初心者の半分 / 2★: 初心者並み / 3★: ゾーン分け(担当範囲のカード)が必要
    stars: [3200, 6300, 8100],
  },
];
