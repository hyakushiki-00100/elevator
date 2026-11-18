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

/**
 * カードを手に入れる順番。1日を終えるごとに1段ずつ進む。
 * 担当範囲のカード(下層・上層)は2基のステージで初めて意味があるので、2枚組で手に入る。
 */
export const UNLOCK_STEPS: readonly (readonly CardId[])[] = [
  ['nearest'],
  ['sameDir'],
  ['urgent'],
  ['home'],
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
