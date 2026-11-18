import { describe, expect, it } from 'vitest';
import { CARD_ORDER } from '../src/sim/rules.ts';
import { STAGES } from '../src/sim/stages.ts';
import {
  EDITOR_PANEL, EDITOR_PLAY, editorHit, handRect, inRect, rowButtonRect, SHARE_EXPORT_BUTTON, SHARE_IMPORT_BUTTON, shareButtonHit,
  slotRect, stageTabHit, stageTabRect,
} from '../src/render/layout.ts';
import { fitRules, nextUnlock, placeCard, removeCard, slotCountFor, stagesOpen, UNLOCK_STEPS } from '../src/ui/editor.ts';

describe('カードの編集(純粋な関数)', () => {
  it('置く: 末尾に追加。同じカードは1基に1枚まで、枠が埋まれば置けない', () => {
    let r = placeCard([[]], 0, 'nearest', 2);
    expect(r).toEqual([['nearest']]);
    expect(placeCard(r, 0, 'nearest', 2)).toBe(r);
    r = placeCard(r, 0, 'sameDir', 2);
    expect(r).toEqual([['nearest', 'sameDir']]);
    expect(placeCard(r, 0, 'express', 2)).toBe(r);
    expect(placeCard(r, 5, 'express', 3)).toBe(r); // 存在しない行
  });

  it('外す: 下のカードが詰まる。範囲外は何もしない', () => {
    const r = [['sameDir', 'nearest', 'express'] as const].map((x) => [...x]);
    expect(removeCard(r, 0, 0)).toEqual([['nearest', 'express']]);
    expect(removeCard(r, 0, 3)).toBe(r);
    expect(removeCard(r, 1, 0)).toBe(r);
  });

  it('元の配列を書き換えない', () => {
    const r = [['nearest' as const]];
    placeCard(r, 0, 'sameDir', 3);
    removeCard(r, 0, 0);
    expect(r).toEqual([['nearest']]);
  });

  it('fitRules: エレベーターの数に合わせ、枠の数・持っていないカードを落とす', () => {
    expect(fitRules([['nearest', 'sameDir', 'express']], 2, 2, ['nearest', 'sameDir', 'express'])).toEqual([['nearest', 'sameDir'], []]);
    expect(fitRules([['express', 'nearest']], 1, 3, ['nearest'])).toEqual([['nearest']]);
  });

  it('進行: カードを順に1枚ずつ手に入れ、枠の数は持っているカードの数', () => {
    expect(nextUnlock([])).toEqual(['nearest']);
    expect(nextUnlock(['nearest'])).toEqual(['sameDir']);
    expect(nextUnlock(['nearest', 'sameDir', 'express'])).toEqual(['zoneLow', 'zoneHigh']);
    expect(nextUnlock([...CARD_ORDER])).toEqual([]);
    // 手に入る順番に全カードが1回ずつ出てくる
    expect(UNLOCK_STEPS.flat().slice().sort()).toEqual([...CARD_ORDER].sort());
    expect(slotCountFor([])).toBe(0);
    expect(slotCountFor(['nearest', 'sameDir'])).toBe(2);
    expect(slotCountFor([...CARD_ORDER])).toBe(5);
  });

  it('ステージは持っているカードの枚数で開く(2枚でステージ2、3枚でステージ3、全5枚でステージ4)', () => {
    expect(stagesOpen([], STAGES)).toBe(1);
    expect(stagesOpen(['nearest'], STAGES)).toBe(1);
    expect(stagesOpen(['nearest', 'sameDir'], STAGES)).toBe(2);
    expect(stagesOpen(['nearest', 'sameDir', 'express'], STAGES)).toBe(3);
    expect(stagesOpen([...CARD_ORDER], STAGES)).toBe(4);
    // 開く順に並んでいる
    for (let i = 1; i < STAGES.length; i++) expect(STAGES[i]!.opensAt).toBeGreaterThanOrEqual(STAGES[i - 1]!.opensAt);
  });
});

describe('編集画面の当たり判定', () => {
  it('枠・手持ち・開始ボタンの中心をタップすると、それぞれに当たる', () => {
    const c = (r: { x: number; y: number; w: number; h: number }) => [r.x + r.w / 2, r.y + r.h / 2] as const;
    expect(editorHit(...c(slotRect(0, 1, 3)), 1, 3, 3)).toEqual({ kind: 'slot', row: 0, index: 1 });
    expect(editorHit(...c(handRect(2, 3, 1)), 1, 3, 3)).toEqual({ kind: 'hand', index: 2 });
    expect(editorHit(...c(EDITOR_PLAY), 1, 3, 3)).toEqual({ kind: 'play' });
    expect(editorHit(...c(rowButtonRect(1, 3)), 2, 3, 3)).toEqual({ kind: 'row', row: 1 });
    expect(editorHit(5, 5, 1, 3, 3)).toBeNull();
    expect(stageTabHit(...c(stageTabRect(1)), 2)).toBe(1);
    expect(shareButtonHit(...c(SHARE_EXPORT_BUTTON))).toBe('export');
    expect(shareButtonHit(...c(SHARE_IMPORT_BUTTON))).toBe('import');
    expect(shareButtonHit(...c(EDITOR_PLAY))).toBeNull();
    expect(stageTabHit(...c(stageTabRect(0)), 1)).toBeNull(); // 1つしか開いていなければ出さない
  });

  it('5枠・2基・全カードを持っていても、すべての要素が編集画面の枠内に収まり、重ならない', () => {
    const n = CARD_ORDER.length;
    const rects = [
      ...[0, 1].flatMap((r) => [0, 1, 2, 3, 4].map((i) => slotRect(r, i, 5))),
      ...Array.from({ length: n }, (_, i) => handRect(i, n, 2)),
      rowButtonRect(0, 5), rowButtonRect(1, 5), EDITOR_PLAY, SHARE_EXPORT_BUTTON, SHARE_IMPORT_BUTTON,
      // ステージの選択ボタン: 今のステージ数 + 1 つ分の余裕
      ...Array.from({ length: STAGES.length + 1 }, (_, i) => stageTabRect(i)),
    ];
    for (const r of rects) {
      expect(inRect(EDITOR_PANEL, r.x, r.y)).toBe(true);
      expect(inRect(EDITOR_PANEL, r.x + r.w, r.y + r.h)).toBe(true);
    }
    for (let i = 0; i < rects.length; i++) {
      for (let j = i + 1; j < rects.length; j++) {
        const a = rects[i]!, b = rects[j]!;
        const overlap = a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
        expect(overlap, `${JSON.stringify(a)} と ${JSON.stringify(b)}`).toBe(false);
      }
    }
  });
});
