import { UNITS_PER_FLOOR as U, type Building } from './building.ts';
import type { Passenger, Stats } from './passenger.ts';
import { deliveryPoints } from './score.ts';
import { evaluateRules, hallCalls, makeContext, type CardId } from './rules.ts';

/** 描画の演出用に sim が出す出来事。採点や状態には使わない */
export type SimEvent =
  | { type: 'delivered'; floor: number; elevator: number }
  | { type: 'boarded'; floor: number; elevator: number }
  | { type: 'missed'; floor: number };

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
  /** 運行ルールの枠(上から順に評価する)。1日の間は変わらない */
  rules: readonly CardId[];
  /** 今の動きを決めたもの: 0以上=その枠のカード / -1=手動 / -2=乗っている人の行き先 / -3=なし(表示用) */
  ruleIndex: number;
  /** 今の移動を選んだカード(移動中に途中の階へ止まるかどうかに使う) */
  tripCard: CardId | null;
}

/** エレベーターが見る世界(sim.ts の SimState の一部) */
export interface World {
  building: Building;
  tick: number;
  passengers: Passenger[];
  stats: Stats;
  /** このtickに起きた出来事(step の最初に空になる) */
  events: SimEvent[];
}

export function createElevator(id: number, floors: number, rules: readonly CardId[] = [], startFloor = 0): Elevator {
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
    rules: [...rules],
    ruleIndex: -3,
    tripCard: null,
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

function openDoors(e: Elevator, w: World): void {
  e.phase = 'open';
  e.timer = w.building.doorTicks;
  e.dir = 0;
}

/**
 * 扉が閉まった(または待機中)ときに、次にどうするかを決める。
 * 優先順: 手動の指示 → ルールのカード(上の枠から) → 乗っている人の行き先 → 待機
 * idle: 待機中からの判断なら true(今いる階で乗れる人がいれば扉を開ける)
 */
function decide(e: Elevator, w: World, idle: boolean): void {
  const floors = w.building.floors;
  const cur = e.pos / U;
  let target: number | null = null;
  if (e.manualTarget !== null) {
    if (e.manualTarget === cur) {
      // 今いる階が指示された: 扉を開けて乗り降りさせる
      e.manualTarget = null;
      e.ruleIndex = -1;
      e.tripCard = null;
      openDoors(e, w);
      return;
    }
    target = e.manualTarget;
    e.ruleIndex = -1;
    e.tripCard = null;
  }
  if (target === null && e.rules.length > 0) {
    const r = evaluateRules(e, makeContext(e, w, idle, loadOf(e, w)));
    if (r !== null) {
      e.ruleIndex = r.index;
      e.tripCard = e.rules[r.index]!;
      if (r.target === cur) {
        openDoors(e, w);
        return;
      }
      target = r.target;
    }
  }
  if (target === null) {
    target = nearestStop(e, cur, floors);
    e.ruleIndex = target === null ? -3 : -2;
    e.tripCard = null;
  }
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

/**
 * 移動中、目的階より手前で止まるべき階(手動の指示で動いているときは止まらない)。
 * 乗っている人の降りる階には必ず止まる。「同じ方向を優先」で選んだ移動なら、待っている人の階にも止まる。
 */
function enRouteStop(e: Elevator, w: World): number | null {
  if (e.manualTarget !== null || e.dir === 0) return null;
  // 「同じ方向を優先」と「1階で待つ」で選んだ移動は、途中の待っている階にも止まる(担当範囲内のみ)
  const hallToo = e.tripCard === 'sameDir' || e.tripCard === 'home';
  const hall = hallToo ? hallCalls(e, w, loadOf(e, w)) : null;
  // 進行方向で、まだ通り過ぎていない最初の階から目的階の手前まで
  const first = e.dir > 0 ? Math.floor(e.pos / U) + 1 : Math.ceil(e.pos / U) - 1;
  for (let f = first; f !== e.target; f += e.dir) {
    if (f < 0 || f >= w.building.floors) break;
    if (e.stops[f] || (hall !== null && hall[f])) return f;
  }
  return null;
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
      w.stats.servicePoints += deliveryPoints(p.waitTicks);
      w.events.push({ type: 'delivered', floor: cur, elevator: e.id });
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
      p.waitTicks = w.tick + 1 - p.spawnTick;
      w.stats.totalWait += p.waitTicks;
      w.events.push({ type: 'boarded', floor: cur, elevator: e.id });
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
      decide(e, w, true);
      break;
    case 'moving': {
      // 手動指示は移動中でも割り込める(途中での方向転換を許す: 簡略化)
      if (e.manualTarget !== null) {
        e.target = e.manualTarget;
        e.ruleIndex = -1;
        e.tripCard = null;
      } else {
        const stop = enRouteStop(e, w);
        if (stop !== null) e.target = stop;
      }
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
      if (e.timer <= 0) decide(e, w, false);
      break;
  }
}
