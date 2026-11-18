import type { CardId } from '../sim/rules.ts';
import type { SharedRules } from './codec.ts';

// 読み込んだ共有ルールを、今の進行状況に当てはめる(純粋な関数)。
// 持っていないカードと、枠に入りきらない分は外す(カード集めの進行を飛ばせないようにするため)。
// 外した場合は 'partial' として知らせる(同じ点にならないことがある)。

export type ApplyResult =
  | { status: 'ok' | 'partial'; stageIdx: number; rules: CardId[][] }
  | { status: 'unknownStage' | 'locked' | 'mismatch' };

export function applyShared(
  shared: SharedRules,
  stages: readonly { id: number; building: { elevators: number } }[],
  stagesOpen: number,
  unlocked: readonly CardId[],
  slotCount: number,
): ApplyResult {
  const idx = stages.findIndex((s) => s.id === shared.stageId);
  if (idx < 0) return { status: 'unknownStage' };
  if (idx >= stagesOpen) return { status: 'locked' };
  if (shared.rules.length !== stages[idx]!.building.elevators) return { status: 'mismatch' };
  let dropped = false;
  const rules = shared.rules.map((row) => {
    const owned = row.filter((c) => unlocked.includes(c));
    const fitted = owned.slice(0, slotCount);
    if (fitted.length !== row.length) dropped = true;
    return fitted;
  });
  return { status: dropped ? 'partial' : 'ok', stageIdx: idx, rules };
}
