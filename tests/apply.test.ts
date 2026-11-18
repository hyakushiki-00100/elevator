import { describe, expect, it } from 'vitest';
import { applyShared } from '../src/share/apply.ts';
import { STAGES } from '../src/sim/stages.ts';
import { CARD_ORDER } from '../src/sim/rules.ts';

const all = [...CARD_ORDER];

describe('読み込んだ共有ルールの当てはめ', () => {
  it('開いているステージで、持っているカードだけなら、そのまま当てはめる', () => {
    expect(applyShared({ stageId: 3, rules: [['express', 'nearest']] }, STAGES, 4, all, 5))
      .toEqual({ status: 'ok', stageIdx: 2, rules: [['express', 'nearest']] });
  });

  it('知らないステージ・まだ開いていないステージは当てはめない', () => {
    expect(applyShared({ stageId: 99, rules: [[]] }, STAGES, 4, all, 5).status).toBe('unknownStage');
    expect(applyShared({ stageId: 3, rules: [['nearest']] }, STAGES, 2, all, 5).status).toBe('locked');
  });

  it('エレベーターの数がステージと違えば当てはめない', () => {
    expect(applyShared({ stageId: 1, rules: [['nearest'], ['nearest']] }, STAGES, 4, all, 5).status).toBe('mismatch');
  });

  it('持っていないカード・枠に入りきらない分は外して、一部だけ(partial)として当てはめる', () => {
    expect(applyShared({ stageId: 2, rules: [['zoneLow', 'nearest'], ['sameDir', 'nearest']] }, STAGES, 2, ['nearest', 'sameDir'], 2))
      .toEqual({ status: 'partial', stageIdx: 1, rules: [['nearest'], ['sameDir', 'nearest']] });
    expect(applyShared({ stageId: 1, rules: [['sameDir', 'nearest', 'express']] }, STAGES, 4, all, 2))
      .toEqual({ status: 'partial', stageIdx: 0, rules: [['sameDir', 'nearest']] });
  });
});
