import type { Building } from './building.ts';
import { createElevator, stepElevator, type Elevator } from './elevator.ts';
import { makePassenger, type Kind, type Passenger, type Stats } from './passenger.ts';
import { Rng } from './rng.ts';
import { maybeSpawn, type TrafficConfig } from './traffic.ts';

export interface SimConfig {
  building: Building;
  traffic: TrafficConfig;
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
}

export type Command = { type: 'goto'; elevator: number; floor: number };

export function createSim(config: SimConfig, seed: number): SimState {
  const elevators: Elevator[] = [];
  for (let i = 0; i < config.building.elevators; i++) {
    elevators.push(createElevator(i, config.building.floors));
  }
  return {
    config,
    building: config.building,
    tick: 0,
    rng: new Rng(seed),
    nextId: 0,
    passengers: [],
    elevators,
    stats: { spawned: 0, boarded: 0, delivered: 0, missed: 0, totalWait: 0 },
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
}

/**
 * 1tick(1/30秒)進める。state を直接書き換えるが、
 * 同じ初期状態・同じシード・同じ入力の列なら必ず同じ結果になる(決定的)。
 * 順序: 入力 → 乗客の発生 → 我慢の限界 → エレベーター → 終わった乗客の掃除
 */
export function step(s: SimState, commands: readonly Command[] = []): void {
  for (const c of commands) applyCommand(s, c);

  const p = maybeSpawn(s.config.traffic, s.rng, s.config.building, s.tick, s.nextId);
  if (p) {
    s.nextId++;
    s.passengers.push(p);
    s.stats.spawned++;
  }

  for (const q of s.passengers) {
    // このtickが終わると待ち時間は (tick+1 - spawnTick)。我慢の限界ちょうどで去る
    if (q.state === 'waiting' && s.tick + 1 - q.spawnTick >= q.patience) {
      q.state = 'gone';
      s.stats.missed++;
    }
  }

  for (const e of s.elevators) stepElevator(e, s);

  s.passengers = s.passengers.filter((q) => q.state === 'waiting' || q.state === 'riding');
  s.tick++;
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
  for (const q of s.passengers) {
    mix(q.id); mix(q.origin); mix(q.dest); mix(q.size); mix(q.elevatorId);
    mix(q.state === 'waiting' ? 0 : 1);
  }
  for (const e of s.elevators) {
    mix(e.pos); mix(e.dir); mix(e.timer); mix(e.target);
    mix(e.phase === 'idle' ? 0 : e.phase === 'moving' ? 1 : 2);
    mix(e.manualTarget ?? -1);
    for (const x of e.stops) mix(x ? 1 : 0);
  }
  const st = s.stats;
  mix(st.spawned); mix(st.boarded); mix(st.delivered); mix(st.missed); mix(st.totalWait);
  return h >>> 0;
}
