import type { Building } from './building.ts';
import { makePassenger, type Kind, type Passenger } from './passenger.ts';
import type { Rng } from './rng.ts';

/** 1日の中の時間帯(朝・昼・夕など)。乗客の発生のしかたを決める */
export interface TrafficPhase {
  /** この時間帯の長さ(tick) */
  ticks: number;
  /** 1tickあたりに乗客が1人発生する確率(30tick = 1秒) */
  rate: number;
  /** 発生した人が「1階(index0)から上へ」向かう割合(朝のラッシュ) */
  fromGround: number;
  /** 発生した人が「上の階から1階へ」向かう割合(夕方のラッシュ)。fromGround との合計は 1 以下 */
  toGround: number;
  /** 種類の割合(残りは「ふつう」)。合計は 1 以下 */
  rushedShare: number;
  groupShare: number;
  luggageShare: number;
}

export interface DayPlan {
  phases: TrafficPhase[];
  /** 発生が止まってから、残った人を運び終えるまで待つ最大tick。過ぎたら残りは取りこぼし */
  overtimeTicks: number;
}

export function makePhase(overrides: Partial<TrafficPhase> = {}): TrafficPhase {
  return {
    ticks: 1800,
    rate: 0.01,
    fromGround: 0,
    toGround: 0,
    rushedShare: 0,
    groupShare: 0,
    luggageShare: 0,
    ...overrides,
  };
}

/**
 * 終わらない1時間帯だけの計画(テスト・実験用)。
 * 引数は1つの時間帯の設定。ratePerTick は rate の別名(以前のAPIとの互換)。
 */
export function makeTraffic(
  overrides: Partial<TrafficPhase> & { ratePerTick?: number } = {},
): DayPlan {
  const { ratePerTick, ...rest } = overrides;
  return {
    phases: [makePhase({ ticks: Number.MAX_SAFE_INTEGER, ...(ratePerTick !== undefined ? { rate: ratePerTick } : {}), ...rest })],
    overtimeTicks: 0,
  };
}

export function dayTicks(plan: DayPlan): number {
  let sum = 0;
  for (const p of plan.phases) sum += p.ticks;
  return sum;
}

/** tick がどの時間帯か。1日が終わっていれば -1 */
export function phaseIndexAt(plan: DayPlan, tick: number): number {
  let t = tick;
  for (let i = 0; i < plan.phases.length; i++) {
    const len = plan.phases[i]!.ticks;
    if (t < len) return i;
    t -= len;
  }
  return -1;
}

export function validatePlan(plan: DayPlan): void {
  const okShare = (x: number): boolean => Number.isFinite(x) && x >= 0 && x <= 1;
  const ok =
    plan.phases.length >= 1 &&
    Number.isInteger(plan.overtimeTicks) && plan.overtimeTicks >= 0 &&
    plan.phases.every((p) =>
      Number.isInteger(p.ticks) && p.ticks >= 1 && okShare(p.rate) &&
      okShare(p.fromGround) && okShare(p.toGround) && p.fromGround + p.toGround <= 1 &&
      okShare(p.rushedShare) && okShare(p.groupShare) && okShare(p.luggageShare) &&
      p.rushedShare + p.groupShare + p.luggageShare <= 1);
  if (!ok) throw new Error(`invalid day plan: ${JSON.stringify(plan)}`);
}

/**
 * 乱数の消費は「発生しない tick は1回、発生する tick は5回」(発生判定・向き・出発階・行き先・種類)。
 * 消費回数は結果に依存するが、同じシードなら同じ列になるので決定性は保たれる。
 * この順序を変えると過去の共有結果が再現できなくなるため、変更時は形式の版番号を上げること。
 */
export function maybeSpawn(
  ph: TrafficPhase,
  rng: Rng,
  b: Building,
  tick: number,
  id: number,
): Passenger | null {
  if (!rng.chance(ph.rate)) return null;
  const mode = rng.next();
  const a = rng.int(b.floors);
  const c = rng.int(b.floors - 1);
  let origin: number;
  let dest: number;
  if (mode < ph.fromGround) {
    origin = 0;
    dest = 1 + (c % (b.floors - 1)); // 1..floors-1
  } else if (mode < ph.fromGround + ph.toGround) {
    origin = 1 + (c % (b.floors - 1));
    dest = 0;
  } else {
    origin = a;
    dest = c >= origin ? c + 1 : c;
  }
  const r = rng.next();
  let kind: Kind = 'normal';
  if (r < ph.rushedShare) kind = 'rushed';
  else if (r < ph.rushedShare + ph.groupShare) kind = 'group';
  else if (r < ph.rushedShare + ph.groupShare + ph.luggageShare) kind = 'luggage';
  return makePassenger(id, origin, dest, kind, tick);
}
