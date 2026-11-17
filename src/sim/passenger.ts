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
 * 45秒では取りこぼしがほぼ起きず焦りが出なかったため、25秒にした(tools/calibrate.ts で確認)。
 */
export const KIND_PATIENCE: Record<Kind, number> = {
  normal: 25 * TICKS_PER_SECOND,
  rushed: 12 * TICKS_PER_SECOND,
  group: 25 * TICKS_PER_SECOND,
  luggage: 25 * TICKS_PER_SECOND,
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
