import { UNITS_PER_FLOOR as U } from './building.ts';
import type { Elevator, World } from './elevator.ts';

// 運行ルールのカード(5.4節)。
// カードのID(文字列)は共有文字列の中身になるため、一度公開したら意味を変えない。

export type CardId = 'nearest' | 'sameDir' | 'oldest';

/** 手に入る順番(進行に合わせて1枚ずつ解放する) */
export const CARD_ORDER: readonly CardId[] = ['nearest', 'sameDir', 'oldest'];

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
  /** その階で乗れる人のうち、一番早く来た人の発生tick(いなければ Infinity) */
  oldestSpawn: number[];
  /** 乗っている人の行き先 */
  car: boolean[];
  /** 待機中なら、今いる階の乗れる人も対象にする(扉を開けて乗せる) */
  includeCur: boolean;
}

type CardFn = (c: RuleContext) => number | null;

/** 今いる階を候補にしてよいか */
function allowedHere(c: RuleContext, f: number): boolean {
  return f !== c.cur || (c.includeCur && c.hall[f] === true);
}

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

/** 長く待っている階を優先: 一番早く来た(乗れる)人がいる階。同じなら近い階 */
const oldest: CardFn = (c) => {
  let best: number | null = null;
  let bestSpawn = Infinity;
  for (let f = 0; f < c.floors; f++) {
    if (!c.hall[f] || !allowedHere(c, f)) continue;
    const t = c.oldestSpawn[f]!;
    if (t < bestSpawn || (t === bestSpawn && best !== null && Math.abs(f - c.cur) < Math.abs(best - c.cur))) {
      bestSpawn = t;
      best = f;
    }
  }
  return best;
};

export const CARDS: Record<CardId, CardFn> = { nearest, sameDir, oldest };

export function makeContext(e: Elevator, w: World, includeCur: boolean, load: number): RuleContext {
  const floors = w.building.floors;
  const hall = new Array<boolean>(floors).fill(false);
  const oldestSpawn = new Array<number>(floors).fill(Infinity);
  for (const p of w.passengers) {
    if (p.state !== 'waiting' || load + p.size > w.building.capacity) continue;
    hall[p.origin] = true;
    if (p.spawnTick < oldestSpawn[p.origin]!) oldestSpawn[p.origin] = p.spawnTick;
  }
  return {
    cur: Math.round(e.pos / U),
    floors,
    heading: e.heading,
    hall,
    oldestSpawn,
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
