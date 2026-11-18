import type { Building } from './building.ts';
import { createElevator, stepElevator, type Elevator, type SimEvent } from './elevator.ts';
import { makePassenger, type Kind, type Passenger, type Stats } from './passenger.ts';
import { Rng } from './rng.ts';
import { CARD_ORDER, isCardId, type CardId } from './rules.ts';
import { dayTicks, maybeSpawn, phaseAt, validatePlan, type DayPlan } from './traffic.ts';

export interface SimConfig {
  building: Building;
  traffic: DayPlan;
  /** エレベーターごとのルールの枠(上から順に評価)。省略すると全基が手動のみ */
  rules?: readonly (readonly CardId[])[];
}

export interface SimState {
  config: SimConfig;
  /** config.building と同じもの(World として elevator.ts から読めるようにしてある) */
  building: Building;
  tick: number;
  rng: Rng;
  nextId: number;
  /** 待っている人・乗っている人だけを id 昇順で持つ(終わった人は stats に数だけ残す) */
  passengers: Passenger[];
  elevators: Elevator[];
  stats: Stats;
  /** 発生が続く長さ(tick)= 全時間帯の合計 */
  dayTicks: number;
  /** 今の時間帯の番号。発生が止まった後は -1 */
  phaseIndex: number;
  /** 1日が終わったか。終わった後の step は何もしない */
  finished: boolean;
  /** このtickに起きた出来事(描画の演出用。step の最初に空になる) */
  events: SimEvent[];
  /** 手動の指示が1度でも受け付けられたか(手動を使った日は、複数日の平均で採点できない) */
  manualUsed: boolean;
}

export type Command = { type: 'goto'; elevator: number; floor: number };

export function validateBuilding(b: Building): void {
  const ok =
    Number.isInteger(b.floors) && b.floors >= 2 &&
    Number.isInteger(b.elevators) && b.elevators >= 1 &&
    Number.isInteger(b.capacity) && b.capacity >= 1 &&
    Number.isInteger(b.speed) && b.speed >= 1 &&
    Number.isInteger(b.doorTicks) && b.doorTicks >= 1 &&
    Number.isInteger(b.boardTicks) && b.boardTicks >= 0;
  if (!ok) throw new Error(`invalid building: ${JSON.stringify(b)}`);
}

export function createSim(config: SimConfig, seed: number): SimState {
  validateBuilding(config.building);
  validatePlan(config.traffic);
  const rules = config.rules ?? [];
  if (rules.length > config.building.elevators || !rules.every((r) => r.every(isCardId))) {
    throw new Error(`invalid rules: ${JSON.stringify(rules)}`);
  }
  const elevators: Elevator[] = [];
  for (let i = 0; i < config.building.elevators; i++) {
    elevators.push(createElevator(i, config.building.floors, rules[i] ?? []));
  }
  return {
    config,
    building: config.building,
    tick: 0,
    rng: new Rng(seed),
    nextId: 0,
    passengers: [],
    elevators,
    stats: { spawned: 0, boarded: 0, delivered: 0, missed: 0, totalWait: 0, servicePoints: 0 },
    dayTicks: dayTicks(config.traffic),
    phaseIndex: 0,
    finished: false,
    events: [],
    manualUsed: false,
  };
}

/** 乗客を直接追加する(テストやチュートリアル用。乱数は使わない) */
export function addPassenger(s: SimState, origin: number, dest: number, kind: Kind = 'normal'): Passenger {
  const p = makePassenger(s.nextId++, origin, dest, kind, s.tick);
  s.passengers.push(p);
  s.stats.spawned++;
  return p;
}

function applyCommand(s: SimState, c: Command): void {
  const e = s.elevators[c.elevator];
  if (!e) return;
  if (!Number.isInteger(c.floor) || c.floor < 0 || c.floor >= s.config.building.floors) return;
  e.manualTarget = c.floor;
  s.manualUsed = true;
}

/**
 * 1tick(1/30秒)進める。state を直接書き換えるが、
 * 同じ初期状態・同じシード・同じ入力の列なら必ず同じ結果になる(決定的)。
 * 順序: 入力 → 乗客の発生 → 我慢の限界 → エレベーター → 終わった乗客の掃除 → 1日の終わりの判定
 */
export function step(s: SimState, commands: readonly Command[] = []): void {
  s.events.length = 0;
  if (s.finished) return;

  for (const c of commands) applyCommand(s, c);

  const at = phaseAt(s.config.traffic, s.tick);
  s.phaseIndex = at.index;
  if (s.phaseIndex >= 0) {
    const ph = s.config.traffic.phases[s.phaseIndex]!;
    const p = maybeSpawn(ph, at.offset, s.rng, s.config.building, s.tick, s.nextId);
    if (p) {
      s.nextId++;
      s.passengers.push(p);
      s.stats.spawned++;
    }
  }

  for (const q of s.passengers) {
    // このtickが終わると待ち時間は (tick+1 - spawnTick)。我慢の限界ちょうどで去る
    if (q.state === 'waiting' && s.tick + 1 - q.spawnTick >= q.patience) {
      q.state = 'gone';
      s.stats.missed++;
      s.events.push({ type: 'missed', floor: q.origin });
    }
  }

  for (const e of s.elevators) stepElevator(e, s);

  s.passengers = s.passengers.filter((q) => q.state === 'waiting' || q.state === 'riding');
  s.tick++;

  // 1日の終わり: 発生が止まり、全員を運び終えたら終了。
  // 延長時間を過ぎても残っている人(待っている人・乗っている人)は取りこぼしとして数える。
  if (s.tick >= s.dayTicks) {
    const overtimeOver = s.tick >= s.dayTicks + s.config.traffic.overtimeTicks;
    if (s.passengers.length === 0 || overtimeOver) {
      for (const q of s.passengers) {
        s.stats.missed++;
        s.events.push({ type: 'missed', floor: q.state === 'riding' ? q.dest : q.origin });
      }
      s.passengers = [];
      s.finished = true;
    }
  }
}

/** 状態の要約(FNV-1a)。決定性のテストと、将来の「共有結果の検証」に使う */
export function stateHash(s: SimState): number {
  let h = 0x811c9dc5;
  const mix = (n: number): void => {
    h = Math.imul(h ^ (n | 0), 0x01000193) >>> 0;
  };
  mix(s.tick);
  mix(s.rng.getState());
  mix(s.nextId);
  mix(s.finished ? 1 : 0);
  mix(s.manualUsed ? 1 : 0);
  for (const q of s.passengers) {
    mix(q.id); mix(q.origin); mix(q.dest); mix(q.size); mix(q.elevatorId);
    mix(q.spawnTick); mix(q.patience); mix(q.waitTicks);
    mix(q.state === 'waiting' ? 0 : 1);
  }
  for (const e of s.elevators) {
    mix(e.pos); mix(e.dir); mix(e.heading); mix(e.timer); mix(e.target);
    mix(e.phase === 'idle' ? 0 : e.phase === 'moving' ? 1 : 2);
    mix(e.manualTarget ?? -1);
    mix(e.ruleIndex);
    mix(e.tripCard === null ? -1 : CARD_ORDER.indexOf(e.tripCard));
    for (const x of e.stops) mix(x ? 1 : 0);
  }
  const st = s.stats;
  mix(st.spawned); mix(st.boarded); mix(st.delivered); mix(st.missed); mix(st.totalWait); mix(st.servicePoints);
  return h >>> 0;
}
