import { UNITS_PER_FLOOR, type Building } from '../sim/building.ts';

/** 論理座標(横長 16:9)。実画面には縦横比を保って中央に収める */
export const LOGICAL_W = 960;
export const LOGICAL_H = 540;
/** 左: 建物の断面 / 右: 情報パネル(後でルールのカードもここに置く) */
export const BUILDING_RIGHT = 640;
export const PANEL_X = 660;
export const PANEL_W = LOGICAL_W - PANEL_X - 16;

export interface Rect { x: number; y: number; w: number; h: number }

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
  const top = 20;
  const bottom = 20;
  const shaftW = 72;
  const gap = 14;
  const n = b.elevators;
  const firstX = BUILDING_RIGHT - 12 - (n * shaftW + (n - 1) * gap);
  const shaftX: number[] = [];
  for (let i = 0; i < n; i++) shaftX.push(firstX + i * (shaftW + gap));
  return {
    floors: b.floors,
    top,
    floorH: (LOGICAL_H - top - bottom) / b.floors,
    shaftW,
    shaftX,
    queueLeft: 44,
    queueRight: firstX - 18,
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

/** 論理座標 (x, y) に何があるか。かごが優先で、それ以外は階の帯。情報パネルの上は null */
export function hitTest(l: Layout, x: number, y: number, carPos: readonly number[]): Hit {
  const bottomY = l.top + l.floors * l.floorH;
  if (y < l.top || y >= bottomY || x < 0 || x > BUILDING_RIGHT) return null;
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

/** 結果画面の枠と、やり直しボタン */
export const RESULT_PANEL: Rect = { x: 250, y: 70, w: 460, h: 400 };
export const RETRY_BUTTON: Rect = { x: 480 - 44, y: 470 - 24 - 88, w: 88, h: 88 };
/** 開始画面のボタン */
export const START_BUTTON: Rect = { x: 480 - 60, y: 270 - 60, w: 120, h: 120 };

export function inRect(r: Rect, x: number, y: number): boolean {
  return x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;
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

// ---- ルールのカードの編集画面(1日の開始前) ----
export const EDITOR_PANEL: Rect = { x: 230, y: 40, w: 500, h: 460 };
export const CARD_W = 64;
export const CARD_H = 84;
const CARD_GAP = 16;
const SLOTS_Y = 84;
const ROW_H = 104;
const HAND_GAP = 34;
/** 開始ボタン(右下。左下はステージの選択ボタン) */
export const EDITOR_PLAY: Rect = { x: 230 + 500 - 16 - 76, y: 418, w: 76, h: 76 };

function rowStartX(n: number): number {
  return 480 - (n * CARD_W + (n - 1) * CARD_GAP) / 2;
}

/** エレベーター row の i 番目の枠 */
export function slotRect(row: number, i: number, slotCount: number): Rect {
  return { x: rowStartX(slotCount) + i * (CARD_W + CARD_GAP), y: SLOTS_Y + row * ROW_H, w: CARD_W, h: CARD_H };
}

/** 手持ちのカードの i 番目(枠の行の下に並べる) */
export function handRect(i: number, handCount: number, rows: number): Rect {
  return { x: rowStartX(handCount) + i * (CARD_W + CARD_GAP), y: SLOTS_Y + rows * ROW_H + HAND_GAP, w: CARD_W, h: CARD_H };
}

/** 2基以上のとき、行の左に置くエレベーターの選択ボタン */
export function rowButtonRect(row: number, slotCount: number): Rect {
  return { x: rowStartX(slotCount) - 56, y: SLOTS_Y + row * ROW_H + 18, w: 40, h: 48 };
}

export type EditorHit =
  | { kind: 'slot'; row: number; index: number }
  | { kind: 'hand'; index: number }
  | { kind: 'row'; row: number }
  | { kind: 'play' }
  | null;

export function editorHit(x: number, y: number, rows: number, slotCount: number, handCount: number): EditorHit {
  if (inRect(EDITOR_PLAY, x, y)) return { kind: 'play' };
  for (let r = 0; r < rows; r++) {
    for (let i = 0; i < slotCount; i++) if (inRect(slotRect(r, i, slotCount), x, y)) return { kind: 'slot', row: r, index: i };
    if (rows > 1 && inRect(rowButtonRect(r, slotCount), x, y)) return { kind: 'row', row: r };
  }
  for (let i = 0; i < handCount; i++) if (inRect(handRect(i, handCount, rows), x, y)) return { kind: 'hand', index: i };
  return null;
}

/** ステージの選択ボタン(編集画面の左下) */
export function stageTabRect(i: number): Rect {
  return { x: EDITOR_PANEL.x + 16 + i * 52, y: EDITOR_PANEL.y + EDITOR_PANEL.h - 16 - 40, w: 44, h: 40 };
}

export function stageTabHit(x: number, y: number, stages: number): number | null {
  if (stages < 2) return null;
  for (let i = 0; i < stages; i++) if (inRect(stageTabRect(i), x, y)) return i;
  return null;
}

/** ルールの共有ボタン(編集画面の下段、ステージの選択ボタンと開始ボタンの間) */
export const SHARE_EXPORT_BUTTON: Rect = { x: 540, y: EDITOR_PANEL.y + EDITOR_PANEL.h - 16 - 40, w: 40, h: 40 };
export const SHARE_IMPORT_BUTTON: Rect = { x: 588, y: EDITOR_PANEL.y + EDITOR_PANEL.h - 16 - 40, w: 40, h: 40 };

export function shareButtonHit(x: number, y: number): 'export' | 'import' | null {
  if (inRect(SHARE_EXPORT_BUTTON, x, y)) return 'export';
  if (inRect(SHARE_IMPORT_BUTTON, x, y)) return 'import';
  return null;
}

/** 消音ボタン(右のパネルの右上。どの画面でも押せる) */
export const MUTE_BUTTON: Rect = { x: 900, y: 20, w: 36, h: 36 };
