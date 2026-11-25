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
  /** 星の合計(各ステージの最高の星を足したもの)がこの数以上になると開く(2026-11-25 ユーザー決定、ステージ5以降) */
  starsNeeded?: number;
  /**
   * 建物の見た目(描画だけに使う。sim には関係しない)。人の流れの特徴と合わせ、文字なしでステージの性格を伝える
   * (2026-11-21):plain=小さなビル / office=オフィス(朝夕のラッシュ)/ department=デパート(1日中、1階から上へ)/ hotel=ホテル(上の階どうし・下の階どうし)
   */
  look: 'plain' | 'office' | 'department' | 'hotel';
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
    // 20日平均(2026-11-21、乗客が2秒歩いて来る形で測り直し): 手動相当 上級者 6047 / 初心者 5497
    //   カード [同方向,近い] 6704 / [急行,同方向,近い] 6591 / [近い] 6479
    // 3★: 「同じ方向を優先」を「近い呼び出しへ」の上に置く考え方が必要
    stars: [2800, 5400, 6650],
    opensAt: 0,
    look: 'plain',
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
    // 20日平均(2026-11-21、乗客が2秒歩いて来る形で測り直し): 手動相当 上級者 6996 / 初心者 5652
    //   カード 両方[近い] 7542 / 両方[同方向,近い] 7514 / ゾーン+[近い] 7549 / 両方[急行,近い] 7230
    stars: [3000, 5600, 7450],
    opensAt: 2,
    look: 'office',
  },
  {
    id: 3,
    // 候補のうち、画面で見せる日の点が20日平均に近い(差3%以内)シード
    seed: 1033,
    // 7階・1基・定員8。1日中、1階から上へのラッシュが続く「朝のオフィス」。
    // 「空なら急行で1階へ」を上に置くと、20日平均で+4.8〜5.4%(条件を探したときの2つのシード群)。
    // 注意: この差は不安定。発生率を少し変えるだけで+1%〜+7%に動き、平均を取る20日の選び方(シード)でも
    // 0%〜+8%に動いた。取りこぼしは2割強と多く、手動の上手さはほぼ点に出ない(手動相当のボットは3者とも約3450)。
    building: makeBuilding({ floors: 7, elevators: 1, capacity: 8, speed: 30 }),
    traffic: {
      phases: [
        makePhase({ ticks: MIN, rate: 0.013, rateEnd: 0.020, fromGround: 0.85 }),
        makePhase({ ticks: MIN, rate: 0.0104, rateEnd: 0.016, fromGround: 0.85 }),
        makePhase({ ticks: MIN, rate: 0.013, rateEnd: 0.020, fromGround: 0.85 }),
      ],
      overtimeTicks: 600,
    },
    // 20日平均(seed 1033、2026-11-21 乗客が2秒歩いて来る形で測り直し): 手動相当 上級者 3570 / 初心者 3362
    //   カード [急行,近い] 4140 / [近い] 3982 / [同方向,近い] 3816
    // 3★: 「空なら急行で1階へ」を「近い呼び出しへ」の上に置く考え方が必要
    stars: [1700, 3300, 4100],
    opensAt: 3,
    look: 'department',
  },
  {
    id: 4,
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
    // 20日平均(seed 1008、2026-11-21 乗客が2秒歩いて来る形で測り直し): 手動相当 上級者 10343 / 初心者 9394
    //   カード ゾーン+[近い] 11607 / ゾーン+[同方向,近い] 11066 / 両方[近い] 10508(ゾーン分けが+10%)
    // 3★: 担当範囲のカードで、下層と上層に分ける考え方が必要
    stars: [5000, 9300, 11200],
    opensAt: 5,
    look: 'hotel',
  },
  // ---- ステージ5〜7(2026-11-25 追加、ユーザー決定「新ステージ+特別な乗客」「星の合計で開く」)----
  // 急ぎ(我慢8秒)・団体(定員3人分)・荷物持ち(定員2人分)が出る。今の5枚のカードには特別な乗客に反応するものがないので、
  // 組み合わせの差は小さい(条件を探した結果: 1〜3%で、1位がシード群ごとに入れ替わることが多い)。
  {
    id: 5,
    seed: 1007,
    // 7階・2基のオフィス。朝夕のラッシュに、急ぎの人(我慢が半分)が4人に1人まじる
    building: makeBuilding({ floors: 7, elevators: 2, capacity: 6, speed: 30 }),
    traffic: {
      phases: [
        makePhase({ ticks: MIN, rate: 0.008, rateEnd: 0.026, fromGround: 0.8, rushedShare: 0.25 }),
        makePhase({ ticks: MIN, rate: 0.012, rateEnd: 0.016, fromGround: 0.1, toGround: 0.1, rushedShare: 0.25 }),
        makePhase({ ticks: MIN, rate: 0.018, rateEnd: 0.028, toGround: 0.75, rushedShare: 0.25 }),
      ],
      overtimeTicks: 600,
    },
    // 20日平均(seed 1007、2026-11-25): 手動相当 上級者 6525 / 初心者 5372
    //   カード 両方[近い] 7204 / 全組み合わせ(1035通り)の1位 ゾーン+[近い…] 7273 / 両方[急行,近い] 6737
    // 3★: ステージ2と同じく「2基をきちんと自動化すれば取れる」(差が小さく、決まった考え方の差にならないため)
    stars: [2700, 5300, 7000],
    opensAt: 5,
    starsNeeded: 6,
    look: 'office',
  },
  {
    id: 6,
    seed: 1025,
    // 7階・1基・定員8のホテル。5組に1組が団体(定員を3人分使う)。朝は1階から上へ、夕方は上から1階へ
    building: makeBuilding({ floors: 7, elevators: 1, capacity: 8, speed: 30 }),
    traffic: {
      phases: [
        makePhase({ ticks: MIN, rate: 0.007, rateEnd: 0.010, fromGround: 0.6, groupShare: 0.2 }),
        makePhase({ ticks: MIN, rate: 0.008, rateEnd: 0.011, groupShare: 0.2 }),
        makePhase({ ticks: MIN, rate: 0.009, rateEnd: 0.012, toGround: 0.6, groupShare: 0.2 }),
      ],
      overtimeTicks: 600,
    },
    // 20日平均(seed 1025、2026-11-25 団体の乗り降り+3秒・団体は3人分の点で測り直し): 手動相当 上級者 3071 / 初心者 1909
    //   全24通り: [近い] 3271(1位) / [同方向,近い] 3184(−2.7%) / [急行,同方向,近い] 2951 / [急行,近い] 2923
    // 3★: 「近い呼び出しへ」だけで動かす考え方が必要。団体は乗り降りに時間がかかるので、「同じ方向」で途中の階に止まると
    // かえって遅れる(ステージ1とは逆の答え。理由は推測)
    stars: [950, 1900, 3230],
    opensAt: 5,
    starsNeeded: 9,
    look: 'hotel',
  },
  {
    id: 7,
    seed: 1032,
    // 9階・2基のデパート。10人に3人が荷物持ち(定員2人分)。朝は1階から上へ、夕方は上から1階へ
    building: makeBuilding({ floors: 9, elevators: 2, capacity: 6, speed: 30 }),
    traffic: {
      // 2026-11-25 作り直し(「大荷物お断り」のカードと、団体・荷物持ちの乗り降りが3秒遅い仕組みに合わせて)
      phases: [
        makePhase({ ticks: MIN, rate: 0.016, rateEnd: 0.0224, fromGround: 0.8, luggageShare: 0.3 }),
        makePhase({ ticks: MIN, rate: 0.016, rateEnd: 0.0224, luggageShare: 0.3 }),
        makePhase({ ticks: MIN, rate: 0.016, rateEnd: 0.0224, toGround: 0.75, luggageShare: 0.3 }),
      ],
      overtimeTicks: 600,
    },
    // 20日平均(seed 1032、2026-11-25 荷物持ち30%に作り直し): 手動相当 上級者 3795 / 初心者 2816
    //   全576通り: 1位 [お断り,近い]/[同方向,近い] 4678 / 「大荷物お断り」なしの最良 4337(−7.3%) / 両方お断りの最良 4004
    //   (団体を3人分の点にしたら、団体の多い建物では「お断り」が得にならなくなった。荷物持ちは1人分のまま2人分の場所と時間を使う)
    // 3★: 「大荷物お断り」を片方のかごだけに置き、身軽な人の速い便にする考え方が必要
    stars: [1400, 2800, 4450],
    opensAt: 5,
    starsNeeded: 12,
    look: 'department',
  },
  {
    id: 8,
    seed: 1069,
    // 10階・3基のオフィスビル(2026-11-25)。1階から上へ向かう人(3割)と、下の階どうし・上の階どうしの移動(45%)がまじる。
    // 条件を探した結果、「1基を急行、2基を下層・上層に分ける」組み合わせが、3つのシード群のどれでも+2.5%以上で1位だった
    building: makeBuilding({ floors: 10, elevators: 3, capacity: 6, speed: 30 }),
    traffic: {
      phases: [
        makePhase({ ticks: MIN, rate: 0.028, rateEnd: 0.0378, fromGround: 0.3, local: 0.45 }),
        makePhase({ ticks: MIN, rate: 0.028, rateEnd: 0.0378, fromGround: 0.3, local: 0.45 }),
        makePhase({ ticks: MIN, rate: 0.028, rateEnd: 0.0378, fromGround: 0.3, local: 0.45 }),
      ],
      overtimeTicks: 600,
    },
    // 20日平均(seed 1069、2026-11-25): 手動相当 初心者 8951 / 上級者 9248
    //   全組み合わせ(各基 担当なし・下層・上層 × [近い]・[同方向,近い]・[急行,近い]・[急行,同方向,近い] の 1728 通り)
    //   1位 [急行,同方向,近い]/[下層,急行,近い]/[急行,同方向,近い] 11739 / 急行なしの最良 11463 / 担当範囲なしの最良 11339
    //   全部[急行,近い] 11001 / 2基をゾーン+[近い] 10994 / 全部[近い] 9964 / 1基急行+2基ゾーン 11198
    // 3★: 「空なら急行」と「担当範囲」の両方を使う考え方が必要(どちらか片方だけの最良は届かない)。差は1.3〜3.4%
    stars: [4500, 8900, 11500],
    opensAt: 5,
    starsNeeded: 15,
    look: 'office',
  },
];
