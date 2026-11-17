import { UNITS_PER_FLOOR, type Building } from '../sim/building.ts';

/** 論理座標。実画面には「縦横比を保って中央に収める」(縦長/横長が決まるまでの暫定) */
export const LOGICAL_W = 360;
export const LOGICAL_H = 640;

export interface Layout {
  floors: number;
  top: number;
  floorH: number;
  shaftW: number;
  /** エレベーターごとのシャフトの左端x */
  shaftX: number[];
  /** 待ち行列を描く領域 [queueLeft, queueRight] */
  queueLeft: number;
  queueRight: number;
}

export function makeLayout(b: Building): Layout {
  const top = 24;
  const bottom = 24;
  const shaftW = 64;
  const gap = 12;
  const n = b.elevators;
  const firstX = LOGICAL_W - 12 - (n * shaftW + (n - 1) * gap);
  const shaftX: number[] = [];
  for (let i = 0; i < n; i++) shaftX.push(firstX + i * (shaftW + gap));
  return {
    floors: b.floors,
    top,
    floorH: (LOGICAL_H - top - bottom) / b.floors,
    shaftW,
    shaftX,
    queueLeft: 36,
    queueRight: firstX - 14,
  };
}

/** 階 f の帯の上端y(0階が一番下) */
export function floorTop(l: Layout, f: number): number {
  return l.top + (l.floors - 1 - f) * l.floorH;
}

/** エレベーター(位置はミリ階)のかごの上端y */
export function carTop(l: Layout, pos: number): number {
  return l.top + (l.floors - 1 - pos / UNITS_PER_FLOOR) * l.floorH + 2;
}

export function carHeight(l: Layout): number {
  return l.floorH - 4;
}

/** elevator の場合も、タップ位置の階を floor に入れる(1基のときは階のタップとして扱うため) */
export type Hit = { kind: 'elevator'; index: number; floor: number } | { kind: 'floor'; floor: number } | null;

/** 論理座標 (x, y) に何があるか。かごが優先で、それ以外は階の帯。 */
export function hitTest(l: Layout, x: number, y: number, carPos: readonly number[]): Hit {
  const bottomY = l.top + l.floors * l.floorH;
  if (y < l.top || y >= bottomY || x < 0 || x > LOGICAL_W) return null;
  const floor = l.floors - 1 - Math.floor((y - l.top) / l.floorH);
  for (let i = 0; i < l.shaftX.length; i++) {
    const cx = l.shaftX[i]!;
    const cy = carTop(l, carPos[i] ?? 0);
    if (x >= cx && x <= cx + l.shaftW && y >= cy && y <= cy + carHeight(l)) {
      return { kind: 'elevator', index: i, floor };
    }
  }
  return { kind: 'floor', floor };
}

/** 実画面(css px)→論理座標への変換 */
export interface View {
  scale: number;
  offsetX: number;
  offsetY: number;
}

export function makeView(cssW: number, cssH: number): View {
  const scale = Math.min(cssW / LOGICAL_W, cssH / LOGICAL_H);
  return {
    scale,
    offsetX: (cssW - LOGICAL_W * scale) / 2,
    offsetY: (cssH - LOGICAL_H * scale) / 2,
  };
}

export function toLogical(v: View, px: number, py: number): { x: number; y: number } {
  return { x: (px - v.offsetX) / v.scale, y: (py - v.offsetY) / v.scale };
}
