import { UNITS_PER_FLOOR as U } from './building.ts';
import type { Elevator, World } from './elevator.ts';

// 運行ルールのカード(5.4節)。
// カードのID(文字列)は共有文字列の中身になるため、一度公開したら意味を変えない。

export type CardId = 'nearest' | 'sameDir' | 'express' | 'zoneLow' | 'zoneHigh' | 'noBulky';

/** すべてのカード(共有文字列での番号もこの順。末尾に足すだけにし、並べ替えない) */
export const CARD_ORDER: readonly CardId[] = ['nearest', 'sameDir', 'express', 'zoneLow', 'zoneHigh', 'noBulky'];

/** 担当範囲のカード: 行き先を決めるのではなく、そのエレベーターが応える階を絞る(どの枠に置いても効く) */
export const ZONE_CARDS: readonly CardId[] = ['zoneLow', 'zoneHigh'];

/**
 * 担当範囲に入る階か。1階(index0)はどちらの担当にも入る。
 * 下層: 1階 〜 真ん中の階 / 上層: 1階と、真ん中より上の階
 */
export function inZone(card: CardId, f: number, floors: number): boolean {
  const mid = Math.floor((floors - 1) / 2);
  if (f === 0) return true;
  if (card === 'zoneLow') return f <= mid;
  if (card === 'zoneHigh') return f > mid;
  return true;
}

export function isCardId(x: unknown): x is CardId {
  return typeof x === 'string' && (CARD_ORDER as readonly string[]).includes(x);
}

/** カードが判断に使う情報(判断の時点のスナップショット) */
export interface RuleContext {
  cur: number;
  floors: number;
  heading: -1 | 1;
  /** 待っている人のうち「今の空きに乗れる人」がいる階 */
  hall: boolean[];
  /** 乗っている人の行き先 */
  car: boolean[];
  /** 待機中なら、今いる階の乗れる人も対象にする(扉を開けて乗せる) */
  includeCur: boolean;
}

type CardFn = (c: RuleContext) => number | null;

/** 近い呼び出しへ: 待っている人・降りる人がいる階のうち一番近い階。同じ距離なら進行方向を優先 */
const nearest: CardFn = (c) => {
  if (c.includeCur && c.hall[c.cur]) return c.cur;
  for (let d = 1; d < c.floors; d++) {
    for (const f of [c.cur + c.heading * d, c.cur - c.heading * d]) {
      if (f < 0 || f >= c.floors) continue;
      if (c.hall[f] || c.car[f]) return f;
    }
  }
  return null;
};

/**
 * 同じ方向を優先: 進行方向の先にある呼び出しのうち一番近い階。先に何もなければ当てはまらない
 * (下の枠のカードに判断を任せる)。このカードで選んだ移動では、途中の待っている階にも止まる。
 */
const sameDir: CardFn = (c) => {
  if (c.includeCur && c.hall[c.cur]) return c.cur;
  for (let f = c.cur + c.heading; f >= 0 && f < c.floors; f += c.heading) {
    if (c.hall[f] || c.car[f]) return f;
  }
  return null;
};

/**
 * 空なら急行で1階へ: 乗っている人がいなければ、ほかの階で呼ばれていても1階へ戻る。
 * この移動では途中の待っている階に止まらない(elevator.ts の enRouteStop)。1階にいる・乗っている人がいれば当てはまらない。
 * 朝のラッシュ(1階から上へ)が続くビルで効く。
 * (以前の「1階で待つ」「限界が近い人を優先」は、どの条件でも効かなかったため、2026-11-18 にこのカードへ置き換えた)
 */
const express: CardFn = (c) => {
  if (c.cur === 0) return null;
  for (let f = 0; f < c.floors; f++) if (c.car[f]) return null;
  return 0;
};

/** 担当範囲のカードは行き先を決めない(makeContext で呼び出しを絞る) */
const zone: CardFn = () => null;

export const CARDS: Record<CardId, CardFn> = { nearest, sameDir, express, zoneLow: zone, zoneHigh: zone, noBulky: zone };

/**
 * 大荷物お断り(noBulky、2026-11-25): このかごには団体・荷物持ち(定員を2人分以上使う人)を乗せない。
 * 行き先は決めず、どの枠に置いても効く(担当範囲と同じ扱い)。乗せない人がいるだけの階は呼び出しにならない。
 * 団体・荷物持ちは乗り降りに時間がかかる(passenger.ts の KIND_BOARD_EXTRA)ので、2基のうち片方を「身軽な人の速い便」にできる。
 */
export function acceptsSize(rules: readonly CardId[], size: number): boolean {
  return !(size > 1 && rules.includes('noBulky'));
}

/** そのエレベーターが応える階か(担当範囲のカードがなければすべて。複数あれば合わせた範囲) */
export function servesFloor(rules: readonly CardId[], f: number, floors: number): boolean {
  const zones = rules.filter((c) => ZONE_CARDS.includes(c));
  return zones.length === 0 || zones.some((z) => inZone(z, f, floors));
}

/** 待っている人のうち、このエレベーターが応える(担当範囲内で、今の空きに乗れる)人がいる階 */
export function hallCalls(e: Elevator, w: World, load: number): boolean[] {
  const floors = w.building.floors;
  const hall = new Array<boolean>(floors).fill(false);
  for (const p of w.passengers) {
    if (p.state !== 'waiting' || load + p.size > w.building.capacity) continue;
    // まだ歩いて向かっている人(見本の案B)は呼び出しにならない
    if (p.spawnTick > w.tick) continue;
    if (!servesFloor(e.rules, p.origin, floors)) continue;
    if (!acceptsSize(e.rules, p.size)) continue;
    hall[p.origin] = true;
  }
  return hall;
}

export function makeContext(e: Elevator, w: World, includeCur: boolean, load: number): RuleContext {
  const floors = w.building.floors;
  const hall = hallCalls(e, w, load);
  return {
    cur: Math.round(e.pos / U),
    floors,
    heading: e.heading,
    hall,
    car: e.stops,
    includeCur,
  };
}

/** 上の枠から順に評価し、最初に当てはまったカードの行き先と枠の番号を返す */
export function evaluateRules(e: Elevator, ctx: RuleContext): { target: number; index: number } | null {
  for (let i = 0; i < e.rules.length; i++) {
    const t = CARDS[e.rules[i]!](ctx);
    if (t !== null) return { target: t, index: i };
  }
  return null;
}
