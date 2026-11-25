// 押せる範囲の広げ幅(スマホで小さなボタンを押しやすくする)が、隣の押せる物とぶつからないことを確かめる
import { describe, expect, it } from 'vitest';
import {
  EDITOR_PLAY, EDITOR_PREVIEW, handRect, MUTE_BUTTON, PAD_BUTTON, PAD_CARD, PAD_CARD_SMALL, PAD_MUTE, PAD_TAB, PAD_VOLUME, RESET_BUTTON,
  rowButtonRect, SHARE_EXPORT_BUTTON, SHARE_IMPORT_BUTTON, slotRect, stageTabRect, VOLUME_PANEL, volumeLevelRect,
  editorHit, shareButtonHit, stageTabHit, volumeHit, type Rect,
} from '../src/render/layout.ts';

const grow = (r: Rect, p: number): Rect => ({ x: r.x - p, y: r.y - p, w: r.w + 2 * p, h: r.h + 2 * p });
const overlap = (a: Rect, b: Rect): boolean => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

describe('押せる範囲の広げ幅', () => {
  it('編集画面の押せる物どうしが、広げても重ならない', () => {
    const items: [string, Rect][] = [
      ['play', EDITOR_PLAY], ['export', grow(SHARE_EXPORT_BUTTON, PAD_BUTTON)], ['import', grow(SHARE_IMPORT_BUTTON, PAD_BUTTON)],
      ['reset', grow(RESET_BUTTON, PAD_BUTTON)], ['mute', grow(MUTE_BUTTON, PAD_MUTE)],
    ];
    for (let i = 0; i < 4; i++) items.push([`tab${i}`, grow(stageTabRect(i), PAD_TAB)]);
    for (let r = 0; r < 2; r++) {
      items.push([`row${r}`, rowButtonRect(r)]);
      for (let i = 0; i < 5; i++) items.push([`slot${r}-${i}`, grow(slotRect(r, i), PAD_CARD)]);
    }
    for (let i = 0; i < 5; i++) items.push([`hand${i}`, grow(handRect(i), PAD_CARD)]);
    for (let a = 0; a < items.length; a++) {
      for (let b = a + 1; b < items.length; b++) {
        expect(overlap(items[a]![1], items[b]![1]), `${items[a]![0]} と ${items[b]![0]}`).toBe(false);
      }
    }
    // カードの枠は、試しに動かす窓(右)にかからない
    for (let r = 0; r < 2; r++) expect(overlap(grow(slotRect(r, 4), PAD_CARD), EDITOR_PREVIEW)).toBe(false);
  });

  it('3基(3行)のときも、枠・行の頭・手持ちが広げても重ならず、試しに動かす窓にもかからない', () => {
    const items: [string, Rect][] = [];
    for (let r = 0; r < 3; r++) {
      items.push([`row${r}`, rowButtonRect(r, 3)]);
      for (let i = 0; i < 5; i++) items.push([`slot${r}-${i}`, grow(slotRect(r, i, 3), PAD_CARD_SMALL)]);
    }
    for (let i = 0; i < 5; i++) items.push([`hand${i}`, grow(handRect(i), PAD_CARD)]);
    for (let a = 0; a < items.length; a++) {
      for (let b = a + 1; b < items.length; b++) {
        expect(overlap(items[a]![1], items[b]![1]), `${items[a]![0]} と ${items[b]![0]}`).toBe(false);
      }
    }
    for (let r = 0; r < 3; r++) expect(overlap(grow(slotRect(r, 4, 3), PAD_CARD_SMALL), EDITOR_PREVIEW)).toBe(false);
    // 3行目の枠を押すと、3行目の枠として扱う
    const s = slotRect(2, 3, 3);
    expect(editorHit(s.x + 5, s.y + 5, 3, 5, 5)).toEqual({ kind: 'slot', row: 2, index: 3 });
    expect(editorHit(...[rowButtonRect(2, 3)].map((r) => [r.x + 5, r.y + 5] as const)[0]!, 3, 5, 5)).toEqual({ kind: 'row', row: 2 });
  });

  it('音量の窓のボタンどうし・消音ボタンが、広げても重ならない', () => {
    const rects: Rect[] = [grow(MUTE_BUTTON, PAD_MUTE)];
    for (const row of ['music', 'sfx'] as const) for (let l = 0; l < 4; l++) rects.push(grow(volumeLevelRect(row, l), PAD_VOLUME));
    for (let a = 0; a < rects.length; a++) for (let b = a + 1; b < rects.length; b++) expect(overlap(rects[a]!, rects[b]!)).toBe(false);
    for (const r of rects.slice(1)) {
      expect(r.x >= VOLUME_PANEL.x && r.x + r.w <= VOLUME_PANEL.x + VOLUME_PANEL.w).toBe(true);
    }
  });

  it('ボタンの少し外を押しても、そのボタンとして扱う', () => {
    const s = slotRect(0, 1);
    expect(editorHit(s.x - 8, s.y + 10, 1, 3, 3)).toEqual({ kind: 'slot', row: 0, index: 1 });
    const h = handRect(0);
    expect(editorHit(h.x + 10, h.y + h.h + 8, 1, 3, 3)).toEqual({ kind: 'hand', index: 0 });
    expect(shareButtonHit(SHARE_EXPORT_BUTTON.x - 5, SHARE_EXPORT_BUTTON.y + 5)).toBe('export');
    expect(shareButtonHit(SHARE_IMPORT_BUTTON.x + SHARE_IMPORT_BUTTON.w + 5, SHARE_IMPORT_BUTTON.y)).toBe('import');
    const t = stageTabRect(2);
    expect(stageTabHit(t.x - 3, t.y, 4)).toBe(2);
    const v = volumeLevelRect('sfx', 3);
    expect(volumeHit(v.x + v.w + 2, v.y + 2)).toEqual({ row: 'sfx', level: 3 });
    // 広げ幅より外は押していない扱い
    const s0 = slotRect(0, 0);
    expect(editorHit(s0.x - 12, s0.y + 10, 1, 3, 3)).toBeNull();
  });
});
