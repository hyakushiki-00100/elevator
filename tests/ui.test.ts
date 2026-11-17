import { describe, expect, it } from 'vitest';
import { makeBuilding } from '../src/sim/building.ts';
import { LOGICAL_H, LOGICAL_W, carHeight, carTop, floorTop, hitTest, makeLayout, makeView, toLogical } from '../src/render/layout.ts';
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

  it('シャフトは重ならず、画面内に収まる', () => {
    expect(l.shaftX[0]! + l.shaftW).toBeLessThan(l.shaftX[1]!);
    expect(l.shaftX[1]! + l.shaftW).toBeLessThanOrEqual(LOGICAL_W);
    expect(l.queueRight).toBeGreaterThan(l.queueLeft + 60);
  });
});

describe('View', () => {
  it('縦長・横長のどちらでも論理領域が収まり、変換が往復できる', () => {
    for (const [w, h] of [[390, 800], [1280, 720], [360, 640]] as const) {
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
