import { UNITS_PER_FLOOR as U, type Building } from './building.ts';
import type { Passenger, Stats } from './passenger.ts';

export type Phase = 'idle' | 'moving' | 'open';

export interface Elevator {
  id: number;
  /** 位置(ミリ階) */
  pos: number;
  /** 今動いている方向。0 は停止中(表示用) */
  dir: -1 | 0 | 1;
  /** 最後に動いた方向。止まっている間も保持し、次の行き先選びで優先する */
  heading: -1 | 1;
  phase: Phase;
  /** open の間、扉が閉まるまでの残り tick */
  timer: number;
  /** 移動中の目的階 */
  target: number;
  /** 手動で指示された目的階(なければ null)。ルールよりも優先される */
  manualTarget: number | null;
  /** 乗客が押した行き先ボタン(階ごと) */
  stops: boolean[];
}

/** エレベーターが見る世界(sim.ts の SimState の一部) */
export interface World {
  building: Building;
  tick: number;
  passengers: Passenger[];
  stats: Stats;
}

export function createElevator(id: number, floors: number, startFloor = 0): Elevator {
  return {
    id,
    pos: startFloor * U,
    dir: 0,
    heading: 1,
    phase: 'idle',
    timer: 0,
    target: startFloor,
    manualTarget: null,
    stops: new Array<boolean>(floors).fill(false),
  };
}

export function loadOf(e: Elevator, w: World): number {
  let sum = 0;
  for (const p of w.passengers) {
    if (p.state === 'riding' && p.elevatorId === e.id) sum += p.size;
  }
  return sum;
}

/** 今いる階から見て、進行方向を優先して最も近い「行き先ボタンが押された階」 */
function nearestStop(e: Elevator, cur: number, floors: number): number | null {
  for (const sign of [e.heading, -e.heading]) {
    for (let d = 1; d < floors; d++) {
      const f = cur + sign * d;
      if (f < 0 || f >= floors) break;
      if (e.stops[f]) return f;
    }
  }
  return null;
}

/** 扉が閉まった(または待機中)ときに、次にどうするかを決める */
function decide(e: Elevator, w: World): void {
  const floors = w.building.floors;
  const cur = e.pos / U;
  let target: number | null = null;
  if (e.manualTarget !== null) {
    if (e.manualTarget === cur) {
      // 今いる階が指示された: 扉を開けて乗り降りさせる
      e.manualTarget = null;
      e.phase = 'open';
      e.timer = w.building.doorTicks;
      e.dir = 0;
      return;
    }
    target = e.manualTarget;
  }
  if (target === null) target = nearestStop(e, cur, floors);
  if (target === null) {
    e.phase = 'idle';
    e.dir = 0;
    return;
  }
  e.target = target;
  e.dir = target > cur ? 1 : -1;
  e.heading = e.dir;
  e.phase = 'moving';
}

/** 扉が開いている間の乗り降り。毎tick呼ぶ(同じ階では二重に処理されない) */
function serve(e: Elevator, w: World): void {
  const b = w.building;
  const cur = e.pos / U;
  let changed = false;

  // 降りる
  for (const p of w.passengers) {
    if (p.state === 'riding' && p.elevatorId === e.id && p.dest === cur) {
      p.state = 'arrived';
      p.elevatorId = -1;
      w.stats.delivered++;
      changed = true;
    }
  }
  e.stops[cur] = false;

  // 乗る(待ち行列の順。入りきらない人は飛ばして、次の人を試す)
  let load = loadOf(e, w);
  for (const p of w.passengers) {
    if (p.state === 'waiting' && p.origin === cur && load + p.size <= b.capacity) {
      p.state = 'riding';
      p.elevatorId = e.id;
      load += p.size;
      e.stops[p.dest] = true;
      w.stats.boarded++;
      // 待ち時間は「このtickの終わり時点」で数える(sim.ts の我慢の限界の判定と同じ定義)
      w.stats.totalWait += w.tick + 1 - p.spawnTick;
      changed = true;
    }
  }

  // 今いる階への手動指示は「扉を開けておく」意味になる
  if (e.manualTarget === cur) {
    e.manualTarget = null;
    changed = true;
  }
  if (changed && e.timer < b.boardTicks) e.timer = b.boardTicks;
}

export function stepElevator(e: Elevator, w: World): void {
  const b = w.building;
  switch (e.phase) {
    case 'idle':
      decide(e, w);
      break;
    case 'moving': {
      // 手動指示は移動中でも割り込める(途中での方向転換を許す: 簡略化)
      if (e.manualTarget !== null) e.target = e.manualTarget;
      const diff = e.target * U - e.pos;
      if (Math.abs(diff) <= b.speed) {
        e.pos = e.target * U;
        e.phase = 'open';
        e.timer = b.doorTicks;
        e.dir = 0;
        serve(e, w);
      } else {
        e.dir = diff > 0 ? 1 : -1;
        e.heading = e.dir;
        e.pos += e.dir * b.speed;
      }
      break;
    }
    case 'open':
      serve(e, w);
      e.timer--;
      if (e.timer <= 0) decide(e, w);
      break;
  }
}
