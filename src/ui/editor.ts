import type { CardId } from '../sim/rules.ts';

// ルールのカードの編集(1日の開始前)。純粋な関数だけにして、テストできるようにする。

export type RuleSet = CardId[][];

/** 手持ちのカードを、そのエレベーターの枠の末尾に置く。同じカードは1基に1枚まで。枠が埋まっていれば何もしない */
export function placeCard(rules: RuleSet, row: number, card: CardId, slotCount: number): RuleSet {
  const cur = rules[row];
  if (!cur || cur.includes(card) || cur.length >= slotCount) return rules;
  return rules.map((r, i) => (i === row ? [...r, card] : r));
}

/**
 * 持ち上げたカードを、そのエレベーターの index 番目の枠に置く(2026-11-19、2段階の置き方)。
 * - 同じカードがすでにその行にあれば、そこから抜いて置き直す(並べ替え)
 * - index が今の枚数より後ろなら、末尾に置く
 * - 枠が埋まっていて、新しいカードを足すことになる場合は置かない(元のまま)
 */
export function placeCardAt(rules: RuleSet, row: number, card: CardId, index: number, slotCount: number): RuleSet {
  const cur = rules[row];
  if (!cur) return rules;
  const without = cur.filter((c) => c !== card);
  if (without.length >= slotCount) return rules;
  const at = Math.max(0, Math.min(index, without.length));
  const next = [...without.slice(0, at), card, ...without.slice(at)];
  return rules.map((r, i) => (i === row ? next : r));
}

/** 枠のカードを外す(下のカードは1つずつ上に詰める) */
export function removeCard(rules: RuleSet, row: number, index: number): RuleSet {
  const cur = rules[row];
  if (!cur || index < 0 || index >= cur.length) return rules;
  return rules.map((r, i) => (i === row ? r.filter((_, k) => k !== index) : r));
}

/** 枠の数が減ったときなどに、はみ出したカードを落とす */
export function fitRules(rules: RuleSet, elevators: number, slotCount: number, unlocked: readonly CardId[]): RuleSet {
  const out: RuleSet = [];
  for (let i = 0; i < elevators; i++) {
    out.push((rules[i] ?? []).filter((c) => unlocked.includes(c)).slice(0, slotCount));
  }
  return out;
}

/**
 * カードを手に入れる順番。1日を終えるごとに1段ずつ進む。
 * 担当範囲のカード(下層・上層)は2基のステージで初めて意味があるので、2枚組で手に入る。
 */
export const UNLOCK_STEPS: readonly (readonly CardId[])[] = [
  ['nearest'],
  ['sameDir'],
  ['express'],
  ['zoneLow', 'zoneHigh'],
];

/** 1日を終えたときに手に入るカード(もう全部持っていれば空) */
export function nextUnlock(unlocked: readonly CardId[], steps: readonly (readonly CardId[])[] = UNLOCK_STEPS): CardId[] {
  for (const s of steps) {
    if (s.some((c) => !unlocked.includes(c))) return s.filter((c) => !unlocked.includes(c));
  }
  return [];
}

/** 開いているステージの数(ステージは opensAt の小さい順に並んでいる前提) */
export function stagesOpen(unlocked: readonly CardId[], stages: readonly { opensAt: number }[]): number {
  let n = 0;
  for (const s of stages) if (s.opensAt <= unlocked.length) n++;
  return Math.max(1, n);
}

export function slotCountFor(unlocked: readonly CardId[]): number {
  return Math.min(5, unlocked.length);
}

// ---- 引っ張って置く方式(2026-11-20)。枠の位置を固定し、空きを許す ----
// 置いた位置から勝手にずれないよう、枠ごとに「カードか空き(null)」を持つ。
// sim・共有・採点には、空きを飛ばして左から詰めた並び(compactLayout)を渡すので、意味は今までと同じ。

export type SlotRow = (CardId | null)[];
export type SlotLayout = SlotRow[];

/** 空きを飛ばして左から詰めた並び(sim と共有に渡す形) */
export function compactLayout(layout: readonly (readonly (CardId | null)[])[]): RuleSet {
  return layout.map((r) => r.filter((c): c is CardId => c !== null));
}

/** 枠の数に合わせ、持っていないカード・同じ行の2枚目を空きにする。後ろの空きは削る */
export function fitLayout(
  layout: readonly (readonly (CardId | null)[])[], elevators: number, slotCount: number, unlocked: readonly CardId[],
): SlotLayout {
  const out: SlotLayout = [];
  for (let i = 0; i < elevators; i++) {
    const src = layout[i] ?? [];
    const row: SlotRow = [];
    for (let k = 0; k < slotCount; k++) {
      const c = src[k] ?? null;
      row.push(c !== null && unlocked.includes(c) && !row.includes(c) ? c : null);
    }
    while (row.length > 0 && row[row.length - 1] === null) row.pop();
    out.push(row);
  }
  return out;
}

function cloneLayout(layout: readonly (readonly (CardId | null)[])[]): SlotLayout {
  return layout.map((r) => [...r]);
}

function setAt(row: SlotRow, k: number, c: CardId | null): void {
  while (row.length <= k) row.push(null);
  row[k] = c;
}

/**
 * 手持ちのカードを枠へ置く。
 * - その枠にあったカードは外れる(手持ちに戻る)
 * - 同じカードがその行の別の枠にあれば、その2枠を入れ替える(同じカードは1基に1枚まで)
 */
export function dropFromHand(layout: readonly (readonly (CardId | null)[])[], row: number, slot: number, card: CardId): SlotLayout {
  const out = cloneLayout(layout);
  const r = out[row];
  if (!r) return out;
  const prev = r[slot] ?? null;
  const at = r.indexOf(card);
  if (at === slot) return out;
  if (at >= 0) setAt(r, at, prev);
  setAt(r, slot, card);
  return out;
}

/**
 * 枠のカードを別の枠へ移す。行き先にカードがあれば入れ替える。ほかのカードは動かない。
 * 別の行へ移すとき、行き先の行に同じカードがあれば、そちらは空きにする(入れ替えで来るカードが元の行にすでにある場合も空きにする)。
 */
export function moveSlot(
  layout: readonly (readonly (CardId | null)[])[], fromRow: number, fromSlot: number, toRow: number, toSlot: number,
): SlotLayout {
  const out = cloneLayout(layout);
  const a = out[fromRow];
  const b = out[toRow];
  const card = a?.[fromSlot] ?? null;
  if (!a || !b || card === null || (fromRow === toRow && fromSlot === toSlot)) return out;
  const prev = b[toSlot] ?? null;
  if (fromRow !== toRow) {
    const dup = b.indexOf(card);
    if (dup >= 0) b[dup] = null;
    setAt(a, fromSlot, prev !== null && a.includes(prev) ? null : prev);
  } else {
    setAt(a, fromSlot, prev);
  }
  setAt(b, toSlot, card);
  return out;
}

/** 枠のカードを外す(ほかのカードは動かない) */
export function removeAt(layout: readonly (readonly (CardId | null)[])[], row: number, slot: number): SlotLayout {
  const out = cloneLayout(layout);
  const r = out[row];
  if (r && slot < r.length) r[slot] = null;
  return out;
}
