import type { CardId } from '../sim/rules.ts';

// ルールのカードの編集(1日の開始前)。純粋な関数だけにして、テストできるようにする。

export type RuleSet = CardId[][];

/** 手持ちのカードを、そのエレベーターの枠の末尾に置く。同じカードは1基に1枚まで。枠が埋まっていれば何もしない */
export function placeCard(rules: RuleSet, row: number, card: CardId, slotCount: number): RuleSet {
  const cur = rules[row];
  if (!cur || cur.includes(card) || cur.length >= slotCount) return rules;
  return rules.map((r, i) => (i === row ? [...r, card] : r));
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

/** 1日を終えたときの進行: まだ持っていないカードを順に1枚手に入れる。枠の数は持っているカードの数(最大5) */
export function nextUnlock(unlocked: readonly CardId[], order: readonly CardId[]): CardId | null {
  for (const c of order) if (!unlocked.includes(c)) return c;
  return null;
}

export function slotCountFor(unlocked: readonly CardId[]): number {
  return Math.min(5, unlocked.length);
}
