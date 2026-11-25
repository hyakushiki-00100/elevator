import { TICKS_PER_SECOND } from './building.ts';

export type Kind = 'normal' | 'rushed' | 'group' | 'luggage';
export type PassengerState = 'waiting' | 'riding' | 'arrived' | 'gone';

/** 定員を何人分使うか */
export const KIND_SIZE: Record<Kind, number> = {
  normal: 1,
  rushed: 1,
  group: 3,
  luggage: 2,
};

/**
 * 我慢の限界(tick)。
 * 45秒 → 25秒 → 16秒と短くしてきた(3日目の判定「簡単すぎる」を受けて)。
 * 16秒だと「誰から拾うか」の判断が点に効き、運行の考え方による差が広がる(tools/calibrate.ts で確認)。
 */
/**
 * 乗り降りにかかる追加の時間(tick、1人あたり。2026-11-25)。団体・荷物持ちは乗るときも降りるときも3秒よけいにかかる。
 * これがないと、団体・荷物持ちは「場所を取るだけ」でほかの人を遅らせず、「大荷物お断り」のカードで役割を分ける意味がなかった
 * (試算: 分けると−4〜−17%。3秒かかる形では、2基・ラッシュの建物で片方だけお断りにすると+5〜9%)。
 * 公開済みのステージ1〜4には団体・荷物持ちが出ないので、これらの点数は変わらない。
 */
export const KIND_BOARD_EXTRA: Record<Kind, number> = {
  normal: 0,
  rushed: 0,
  group: 3 * TICKS_PER_SECOND,
  luggage: 3 * TICKS_PER_SECOND,
};

export const KIND_PATIENCE: Record<Kind, number> = {
  normal: 16 * TICKS_PER_SECOND,
  rushed: 8 * TICKS_PER_SECOND,
  group: 16 * TICKS_PER_SECOND,
  luggage: 16 * TICKS_PER_SECOND,
};

export interface Passenger {
  id: number;
  origin: number;
  dest: number;
  kind: Kind;
  size: number;
  spawnTick: number;
  patience: number;
  state: PassengerState;
  /** 乗っているエレベーターの id。乗っていなければ -1 */
  elevatorId: number;
  /** 乗るまでに待った tick 数。乗る前は -1 */
  waitTicks: number;
}

/**
 * 乗客が左端のドアから行列まで歩く長さ(tick)。着くまでは呼び出しにならず、乗れず、我慢も数えない(案B、2026-11-21 ユーザー決定)。
 * 1.2秒は「急かされている感じが強い」、2.5秒の見本を見て「2秒で」(ユーザー決定)。
 */
export const WALK_TICKS = 60;

export interface Stats {
  spawned: number;
  boarded: number;
  delivered: number;
  /** 我慢の限界を超えて去った人数(取りこぼし) */
  missed: number;
  /** 乗車した人の待ち時間の合計(tick) */
  totalWait: number;
  /** 運び終えた人の点の合計(1人ごとの点は score.ts の deliveryPoints で決まる) */
  servicePoints: number;
}

export function makePassenger(
  id: number,
  origin: number,
  dest: number,
  kind: Kind,
  spawnTick: number,
): Passenger {
  return {
    id,
    origin,
    dest,
    kind,
    size: KIND_SIZE[kind],
    spawnTick,
    patience: KIND_PATIENCE[kind],
    state: 'waiting',
    elevatorId: -1,
    waitTicks: -1,
  };
}
