import { describe, expect, it } from 'vitest';
import { CARD_ORDER } from '../src/sim/rules.ts';
import { EDITOR_PANEL, EDITOR_PLAY, editorHit, handRect, inRect, rowButtonRect, slotRect } from '../src/render/layout.ts';
import { fitRules, nextUnlock, placeCard, removeCard, slotCountFor } from '../src/ui/editor.ts';

describe('カードの編集(純粋な関数)', () => {
  it('置く: 末尾に追加。同じカードは1基に1枚まで、枠が埋まれば置けない', () => {
    let r = placeCard([[]], 0, 'nearest', 2);
    expect(r).toEqual([['nearest']]);
    expect(placeCard(r, 0, 'nearest', 2)).toBe(r);
    r = placeCard(r, 0, 'sameDir', 2);
    expect(r).toEqual([['nearest', 'sameDir']]);
    expect(placeCard(r, 0, 'oldest', 2)).toBe(r);
    expect(placeCard(r, 5, 'oldest', 3)).toBe(r); // 存在しない行
  });

  it('外す: 下のカードが詰まる。範囲外は何もしない', () => {
    const r = [['sameDir', 'nearest', 'oldest'] as const].map((x) => [...x]);
    expect(removeCard(r, 0, 0)).toEqual([['nearest', 'oldest']]);
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
    expect(fitRules([['nearest', 'sameDir', 'oldest']], 2, 2, ['nearest', 'sameDir', 'oldest'])).toEqual([['nearest', 'sameDir'], []]);
    expect(fitRules([['oldest', 'nearest']], 1, 3, ['nearest'])).toEqual([['nearest']]);
  });

  it('進行: カードを順に1枚ずつ手に入れ、枠の数は持っているカードの数', () => {
    expect(nextUnlock([], CARD_ORDER)).toBe('nearest');
    expect(nextUnlock(['nearest'], CARD_ORDER)).toBe('sameDir');
    expect(nextUnlock([...CARD_ORDER], CARD_ORDER)).toBeNull();
    expect(slotCountFor([])).toBe(0);
    expect(slotCountFor(['nearest', 'sameDir'])).toBe(2);
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
  });

  it('5枠・2基でも、すべての要素が編集画面の枠内に収まり、重ならない', () => {
    const rects = [
      ...[0, 1].flatMap((r) => [0, 1, 2, 3, 4].map((i) => slotRect(r, i, 5))),
      ...[0, 1, 2, 3, 4].map((i) => handRect(i, 5, 2)),
      rowButtonRect(0, 5), rowButtonRect(1, 5), EDITOR_PLAY,
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
