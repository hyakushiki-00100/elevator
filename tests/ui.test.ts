import { STORY_LOOP_MS, storyAt } from '../src/render/story.ts';
import { describe, expect, it } from 'vitest';
import { makeBuilding } from '../src/sim/building.ts';
import {
  BUILDING_RIGHT, LOGICAL_H, LOGICAL_W, PANEL_X, RESULT_PANEL, RETRY_BUTTON, START_BUTTON, START_DEMO,
  carHeight, carTop, floorTop, hitTest, inRect, makeLayout, makeView, toLogical,
} from '../src/render/layout.ts';
import { handleTap } from '../src/ui/controls.ts';

describe('layout / hitTest', () => {
  const b = makeBuilding({ floors: 5, elevators: 2 });
  const l = makeLayout(b);

  it('各階の帯の中央をタップするとその階になる(0階が一番下)', () => {
    for (let f = 0; f < 5; f++) {
      const y = floorTop(l, f) + l.floorH / 2;
      expect(hitTest(l, 20, y, [0, 0])).toEqual({ kind: 'floor', floor: f });
    }
  });

  it('範囲外は null', () => {
    expect(hitTest(l, 20, 1, [0, 0])).toBeNull();
    expect(hitTest(l, 20, LOGICAL_H - 1, [0, 0])).toBeNull();
    expect(hitTest(l, -5, 300, [0, 0])).toBeNull();
  });

  it('かごの上は階よりもエレベーターが優先される', () => {
    const x = l.shaftX[1]! + 10;
    const y = carTop(l, 2000) + carHeight(l) / 2;
    expect(hitTest(l, x, y, [0, 2000])).toEqual({ kind: 'elevator', index: 1, floor: 2 });
    // 同じ位置でもかごがいなければ階
    expect(hitTest(l, x, y, [0, 0])).toEqual({ kind: 'floor', floor: 2 });
  });

  it('シャフトは重ならず、建物の領域内に収まる(情報パネルにはみ出さない)', () => {
    expect(l.shaftX[0]! + l.shaftW).toBeLessThan(l.shaftX[1]!);
    expect(l.shaftX[1]! + l.shaftW).toBeLessThanOrEqual(BUILDING_RIGHT);
    expect(BUILDING_RIGHT).toBeLessThan(PANEL_X);
    expect(l.queueRight).toBeGreaterThan(l.queueLeft + 200);
  });

  it('情報パネルの上のタップは階として扱わない', () => {
    expect(hitTest(l, PANEL_X + 50, floorTop(l, 2) + 10, [0, 0])).toBeNull();
  });

  it('階が多くても(10階)帯の高さが確保される', () => {
    const l10 = makeLayout(makeBuilding({ floors: 10 }));
    expect(l10.floorH).toBeGreaterThanOrEqual(45);
    expect(floorTop(l10, 0) + l10.floorH).toBeLessThanOrEqual(LOGICAL_H);
  });

  it('結果画面・開始画面のボタンは画面内にあり、やり直しボタンは結果の枠の中', () => {
    for (const r of [RESULT_PANEL, RETRY_BUTTON, START_BUTTON]) {
      expect(r.x).toBeGreaterThanOrEqual(0);
      expect(r.y).toBeGreaterThanOrEqual(0);
      expect(r.x + r.w).toBeLessThanOrEqual(LOGICAL_W);
      expect(r.y + r.h).toBeLessThanOrEqual(LOGICAL_H);
    }
    expect(inRect(RESULT_PANEL, RETRY_BUTTON.x, RETRY_BUTTON.y)).toBe(true);
    expect(inRect(RESULT_PANEL, RETRY_BUTTON.x + RETRY_BUTTON.w, RETRY_BUTTON.y + RETRY_BUTTON.h)).toBe(true);
    expect(inRect(RETRY_BUTTON, RETRY_BUTTON.x + 1, RETRY_BUTTON.y + 1)).toBe(true);
    expect(inRect(RETRY_BUTTON, RETRY_BUTTON.x - 1, RETRY_BUTTON.y)).toBe(false);
  });
});

describe('View', () => {
  it('縦長・横長のどちらでも論理領域が収まり、変換が往復できる', () => {
    for (const [w, h] of [[390, 800], [1280, 720], [960, 540], [800, 600]] as const) {
      const v = makeView(w, h);
      expect(v.offsetX).toBeGreaterThanOrEqual(0);
      expect(v.offsetY).toBeGreaterThanOrEqual(0);
      expect(LOGICAL_W * v.scale).toBeLessThanOrEqual(w + 1e-9);
      expect(LOGICAL_H * v.scale).toBeLessThanOrEqual(h + 1e-9);
      const p = toLogical(v, v.offsetX + 100 * v.scale, v.offsetY + 200 * v.scale);
      expect(p.x).toBeCloseTo(100);
      expect(p.y).toBeCloseTo(200);
    }
  });
});

describe('handleTap', () => {
  it('1基: 階タップで即 goto', () => {
    const r = handleTap({ kind: 'floor', floor: 3 }, { selected: null }, 1);
    expect(r.command).toEqual({ type: 'goto', elevator: 0, floor: 3 });
  });
  it('1基: かごの上のタップは、その位置の階へのタップとして扱う(押しても反応しない場所を作らない)', () => {
    expect(handleTap({ kind: 'elevator', index: 0, floor: 2 }, { selected: null }, 1).command)
      .toEqual({ type: 'goto', elevator: 0, floor: 2 });
  });
  it('2基: 選択なしの階タップは無視、選択後は goto', () => {
    expect(handleTap({ kind: 'floor', floor: 2 }, { selected: null }, 2).command).toBeNull();
    const sel = handleTap({ kind: 'elevator', index: 1, floor: 0 }, { selected: null }, 2);
    expect(sel.state.selected).toBe(1);
    expect(sel.command).toBeNull();
    const go = handleTap({ kind: 'floor', floor: 4 }, sel.state, 2);
    expect(go.command).toEqual({ type: 'goto', elevator: 1, floor: 4 });
  });
  it('null(範囲外)は何も起きない', () => {
    const s = { selected: 1 };
    const r = handleTap(null, s, 2);
    expect(r.command).toBeNull();
    expect(r.state).toBe(s);
  });
});

describe('最初の画面の見本', () => {
  it('見本と開始ボタンは重ならず、画面内にある', () => {
    expect(START_DEMO.x + START_DEMO.w).toBeLessThan(START_BUTTON.x);
    expect(START_DEMO.y).toBeGreaterThanOrEqual(0);
    expect(START_DEMO.y + START_DEMO.h).toBeLessThanOrEqual(LOGICAL_H);
  });

  it('順番: タップ → かごが3階へ → 乗る → 1階へ → 降りる → チェック', () => {
    const at = (t: number) => storyAt(t);
    // タップより前は、かごは1階にいる
    let firstTap = -1;
    for (let i = 0; i < 1000; i++) if (at(i / 1000).tap) { firstTap = i / 1000; break; }
    expect(firstTap).toBeGreaterThan(0);
    for (let i = 0; i <= firstTap * 1000; i++) expect(at(i / 1000).carFloor).toBe(0);
    // 乗り込み始めるとき、かごは3階(添字2)に着いている
    for (let i = 0; i < 1000; i++) {
      const s = at(i / 1000);
      if (s.person === 'wait' && s.personX > 0) expect(s.carFloor).toBe(2);
      if (s.person === 'leave') expect(s.carFloor).toBe(0);
      if (s.check > 0) expect(s.person === 'leave' || s.person === 'gone').toBe(true);
    }
    expect(STORY_LOOP_MS).toBeGreaterThan(3000);
  });
});

