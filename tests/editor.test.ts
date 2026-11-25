import { describe, expect, it } from 'vitest';
import { CARD_ORDER, type CardId } from '../src/sim/rules.ts';
import { STAGES } from '../src/sim/stages.ts';
import {
  EDITOR_PANEL, EDITOR_PLAY, EDITOR_PREVIEW, editorHit, handRect, inRect, rowButtonRect, SHARE_EXPORT_BUTTON, SHARE_IMPORT_BUTTON, RESET_BUTTON, RESET_NO, RESET_PANEL, RESET_YES,
  shareButtonHit, slotRect, stageTabHit, stageTabRect,
} from '../src/render/layout.ts';
import { fitRules, nextStarGate, nextUnlock, placeCard, placeCardAt, removeCard, slotCountFor, stagesOpen, UNLOCK_STEPS } from '../src/ui/editor.ts';

describe('カードの編集(純粋な関数)', () => {
  it('持ち上げたカードを置く: 指定の枠に差し込む。同じ行にあれば移す。枠が埋まっていれば新しいカードは置かない', () => {
    expect(placeCardAt([[]], 0, 'nearest', 3, 5)).toEqual([['nearest']]); // 空なら末尾(先頭)へ
    expect(placeCardAt([['nearest']], 0, 'sameDir', 0, 5)).toEqual([['sameDir', 'nearest']]); // 前に差し込む
    expect(placeCardAt([['nearest', 'sameDir']], 0, 'sameDir', 0, 5)).toEqual([['sameDir', 'nearest']]); // 並べ替え
    expect(placeCardAt([['nearest', 'sameDir', 'express']], 0, 'nearest', 9, 5)).toEqual([['sameDir', 'express', 'nearest']]);
    const full: CardId[][] = [['nearest', 'sameDir']];
    expect(placeCardAt(full, 0, 'express', 0, 2)).toBe(full); // 埋まっている
    expect(placeCardAt(full, 0, 'sameDir', 0, 2)).toEqual([['sameDir', 'nearest']]); // 移すだけなら置ける
    expect(placeCardAt(full, 3, 'express', 0, 5)).toBe(full); // 存在しない行
    const two: CardId[][] = [['nearest'], ['sameDir']];
    expect(placeCardAt(two, 1, 'nearest', 0, 5)).toEqual([['nearest'], ['nearest', 'sameDir']]); // 行ごとに別
  });

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
    // ステージ5以降は星の合計で開く(手前が閉じていれば、その先も閉じたまま)
    expect(stagesOpen([...CARD_ORDER], STAGES, 5)).toBe(4);
    expect(stagesOpen([...CARD_ORDER], STAGES, 6)).toBe(5);
    expect(stagesOpen([...CARD_ORDER], STAGES, 9)).toBe(6);
    expect(stagesOpen([...CARD_ORDER], STAGES, 12)).toBe(7);
    expect(stagesOpen(['nearest'], STAGES, 99)).toBe(1); // 星があってもカードが足りなければ開かない
    expect(nextStarGate([...CARD_ORDER], STAGES, 0)).toBe(6);
    expect(nextStarGate([...CARD_ORDER], STAGES, 6)).toBe(9);
    expect(nextStarGate(['nearest'], STAGES, 0)).toBeNull(); // 次はカードで開く
    expect(nextStarGate([...CARD_ORDER], STAGES, 99)).toBeNull(); // 全部開いている
    // 開く順に並んでいる
    for (let i = 1; i < STAGES.length; i++) expect(STAGES[i]!.opensAt).toBeGreaterThanOrEqual(STAGES[i - 1]!.opensAt);
  });
});

describe('編集画面の当たり判定', () => {
  it('枠・手持ち・行の頭・開始ボタン・共有・ステージの中心をタップすると、それぞれに当たる', () => {
    const c = (r: { x: number; y: number; w: number; h: number }) => [r.x + r.w / 2, r.y + r.h / 2] as const;
    expect(editorHit(...c(slotRect(0, 1)), 1, 3, 3)).toEqual({ kind: 'slot', row: 0, index: 1 });
    expect(editorHit(...c(slotRect(0, 4)), 1, 3, 3)).toBeNull(); // 枠の数(3)より後ろは枠ではない
    expect(editorHit(...c(handRect(2)), 1, 3, 3)).toEqual({ kind: 'hand', index: 2 });
    expect(editorHit(...c(EDITOR_PLAY), 1, 3, 3)).toEqual({ kind: 'play' });
    expect(editorHit(...c(rowButtonRect(1)), 2, 3, 3)).toEqual({ kind: 'row', row: 1 });
    expect(editorHit(...c(EDITOR_PREVIEW), 2, 3, 3)).toBeNull(); // 再生の窓は押しても何もしない
    expect(stageTabHit(...c(stageTabRect(1)), 2)).toBe(1);
    expect(shareButtonHit(...c(SHARE_EXPORT_BUTTON))).toBe('export');
    expect(shareButtonHit(...c(SHARE_IMPORT_BUTTON))).toBe('import');
    expect(shareButtonHit(...c(EDITOR_PLAY))).toBeNull();
    expect(stageTabHit(...c(stageTabRect(0)), 1)).toBeNull(); // 1つしか開いていなければ出さない
  });

  it('5枠・2基・全カードを持っていても、すべての要素が編集画面の枠内に収まり、重ならない', () => {
    const n = CARD_ORDER.length;
    const rects = [
      ...[0, 1].flatMap((r) => [0, 1, 2, 3, 4].map((i) => slotRect(r, i))),
      ...Array.from({ length: n }, (_, i) => handRect(i, n)),
      rowButtonRect(0), rowButtonRect(1), EDITOR_PLAY, EDITOR_PREVIEW, SHARE_EXPORT_BUTTON, SHARE_IMPORT_BUTTON, RESET_BUTTON,
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

describe('進行状況を消すボタン', () => {
  it('確かめの「やめる」「消す」は窓の中にあり、互いに重ならない', () => {
    for (const r of [RESET_NO, RESET_YES]) {
      expect(inRect(RESET_PANEL, r.x, r.y)).toBe(true);
      expect(inRect(RESET_PANEL, r.x + r.w, r.y + r.h)).toBe(true);
    }
    expect(RESET_NO.x + RESET_NO.w).toBeLessThan(RESET_YES.x);
    expect(inRect(RESET_BUTTON, RESET_BUTTON.x + 1, RESET_BUTTON.y + 1)).toBe(true);
  });
});

describe('引っ張って置く方式(枠の位置は固定)', () => {
  it('手持ちから空いた枠に置くと、その位置に入る(左へ詰めない)', async () => {
    const { dropFromHand, compactLayout } = await import('../src/ui/editor.ts');
    const out = dropFromHand([[]], 0, 2, 'nearest');
    expect(out).toEqual([[null, null, 'nearest']]);
    expect(compactLayout(out)).toEqual([['nearest']]);
  });
  it('手持ちからカードのある枠に置くと置き換わる。同じカードが別の枠にあれば2枠が入れ替わる。ほかは動かない', async () => {
    const { dropFromHand } = await import('../src/ui/editor.ts');
    expect(dropFromHand([['nearest', 'express']], 0, 1, 'sameDir')).toEqual([['nearest', 'sameDir']]);
    expect(dropFromHand([['nearest', 'express', 'sameDir']], 0, 0, 'sameDir')).toEqual([['sameDir', 'express', 'nearest']]);
  });
  it('枠どうしは入れ替え。別の行へ移すとき、行き先の同じカードは空きになる', async () => {
    const { moveSlot } = await import('../src/ui/editor.ts');
    expect(moveSlot([['nearest', 'sameDir', 'express']], 0, 0, 0, 2)).toEqual([['express', 'sameDir', 'nearest']]);
    expect(moveSlot([['nearest', null, 'express']], 0, 0, 0, 1)).toEqual([[null, 'nearest', 'express']]);
    expect(moveSlot([['nearest'], ['sameDir', 'nearest']], 0, 0, 1, 0)).toEqual([['sameDir'], ['nearest', null]]);
    expect(moveSlot([['nearest', 'sameDir'], ['sameDir']], 0, 0, 1, 0)).toEqual([[null, 'sameDir'], ['nearest']]);
  });
  it('外すと空きになり、ほかのカードは動かない。fitLayout は持っていないカード・2枚目を空きにし、後ろの空きを削る', async () => {
    const { removeAt, fitLayout } = await import('../src/ui/editor.ts');
    expect(removeAt([['nearest', 'sameDir', 'express']], 0, 1)).toEqual([['nearest', null, 'express']]);
    expect(fitLayout([[null, 'nearest', 'nearest', 'express', null]], 1, 5, ['nearest'])).toEqual([[null, 'nearest']]);
    expect(fitLayout([['nearest', 'sameDir', 'express']], 2, 2, ['nearest', 'sameDir', 'express'])).toEqual([['nearest', 'sameDir'], []]);
  });
});

describe('音量の窓', () => {
  it('窓は画面の中にあり、消音ボタンと重ならない。段階のボタンは窓の中で互いに重ならない', async () => {
    const L = await import('../src/render/layout.ts');
    const p = L.VOLUME_PANEL;
    expect(p.x + p.w).toBeLessThanOrEqual(L.LOGICAL_W);
    expect(p.y).toBeGreaterThanOrEqual(L.MUTE_BUTTON.y + L.MUTE_BUTTON.h);
    for (const row of ['music', 'sfx'] as const) {
      for (let lv = 0; lv < 4; lv++) {
        const r = L.volumeLevelRect(row, lv);
        expect(L.inRect(p, r.x, r.y) && L.inRect(p, r.x + r.w, r.y + r.h)).toBe(true);
        expect(L.volumeHit(r.x + r.w / 2, r.y + r.h / 2)).toEqual({ row, level: lv });
        if (lv > 0) expect(L.volumeLevelRect(row, lv - 1).x + L.volumeLevelRect(row, lv - 1).w).toBeLessThan(r.x);
      }
    }
    expect(L.volumeHit(p.x + 2, p.y + 2)).toBe('panel');
    expect(L.volumeHit(10, 10)).toBeNull();
  });
});

