import type { Building } from './building.ts';
import { makePassenger, type Kind, type Passenger } from './passenger.ts';
import type { Rng } from './rng.ts';

export interface TrafficConfig {
  /** 1tickあたりに乗客が1人発生する確率(30tick = 1秒) */
  ratePerTick: number;
  /** 種類の割合(残りは「ふつう」)。合計は 1 以下 */
  rushedShare: number;
  groupShare: number;
  luggageShare: number;
}

export function makeTraffic(overrides: Partial<TrafficConfig> = {}): TrafficConfig {
  return {
    ratePerTick: 0.01,
    rushedShare: 0,
    groupShare: 0,
    luggageShare: 0,
    ...overrides,
  };
}

/** 乱数の消費回数が結果によらず一定になるようにしてある(決定性のため) */
export function maybeSpawn(
  cfg: TrafficConfig,
  rng: Rng,
  b: Building,
  tick: number,
  id: number,
): Passenger | null {
  if (!rng.chance(cfg.ratePerTick)) return null;
  const origin = rng.int(b.floors);
  let dest = rng.int(b.floors - 1);
  if (dest >= origin) dest++;
  const r = rng.next();
  let kind: Kind = 'normal';
  if (r < cfg.rushedShare) kind = 'rushed';
  else if (r < cfg.rushedShare + cfg.groupShare) kind = 'group';
  else if (r < cfg.rushedShare + cfg.groupShare + cfg.luggageShare) kind = 'luggage';
  return makePassenger(id, origin, dest, kind, tick);
}
