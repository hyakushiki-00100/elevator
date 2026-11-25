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
  // スマホでも中の乗客が見えるよう、かごは広め(72 → 90。2026-11-20)
  const shaftW = 90;
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
/** 最初の画面: 右に開始ボタン、左に遊び方の見本(動く絵) */
export const START_BUTTON: Rect = { x: 640, y: 210, w: 120, h: 120 };
export const START_DEMO: Rect = { x: 150, y: 100, w: 400, h: 340 };

export function inRect(r: Rect, x: number, y: number, pad = 0): boolean {
  return x >= r.x - pad && x <= r.x + r.w + pad && y >= r.y - pad && y <= r.y + r.h + pad;
}

// ---- 押せる範囲の広げ幅(2026-11-24)----
// スマホの横向き(例: iPhone の 844x390)では論理座標の 1 が約 0.72px になり、48 のボタンは約 35px、36 の消音ボタンは約 26px。
// 指で押す目安(Apple の指針で 44pt)より小さいので、見た目は変えずに、押せる範囲だけを隣とぶつからない幅で広げる。
/** 消音ボタン(周りに押せる物がない) */
export const PAD_MUTE = 12;
/** 最下段の小さなボタン(共有・ごみ箱。隣との間が 12 → 半分の 6) */
export const PAD_BUTTON = 6;
/** ステージの選択(間が 8 → 4) */
export const PAD_TAB = 4;
/** カードの枠と手持ち(間が 18 → 9) */
export const PAD_CARD = 9;
/** 手持ちが6枚以上のとき(間が 9 → 4) */
export const PAD_HAND_TIGHT = 4;
/** 3行のときの小さな枠(横の間が 34、行の間が 22 → 縦に重ならない 9 にそろえる) */
export const PAD_CARD_SMALL = 9;
/** 音量の窓の段階のボタン(間が 6 → 3) */
export const PAD_VOLUME = 3;

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

// ---- ルールのカードの編集画面(1日の開始前、2026-11-19 作り直し) ----
// 左上: エレベーターごとの行(行の頭に、そのエレベーターの色のかごと番号) / 左下: 手持ちのカード
// 右: 選んだカードの場面を大きく再生する窓 / 最下段: ステージの選択・共有・開始
export const EDITOR_PANEL: Rect = { x: 16, y: 16, w: 928, h: 508 };
export const CARD_W = 72;
export const CARD_H = 96;
const CARD_GAP = 18;
const SLOT_X0 = 116;
const ROW_Y0 = 52;
const ROW_H = 124;
const HAND_Y = ROW_Y0 + 2 * ROW_H + 24;
/** 選んだカードの場面を大きく再生する窓 */
export const EDITOR_PREVIEW: Rect = { x: 580, y: 36, w: 344, h: 388 };
/** 開始ボタン(右下) */
export const EDITOR_PLAY: Rect = { x: 840, y: 434, w: 84, h: 84 };

/**
 * 行の並び方。エレベーターが3基のときは、3行が手持ちのカードの上に収まるよう、枠のカードを小さくする(2026-11-25)。
 * 枠の横の位置(列の中心)は手持ちのカードと同じにそろえる。
 */
function rowGeom(rows: number): { y0: number; h: number; cw: number; ch: number } {
  return rows >= 3 ? { y0: 40, h: 96, cw: 56, ch: 74 } : { y0: ROW_Y0, h: ROW_H, cw: CARD_W, ch: CARD_H };
}

/** エレベーター row の i 番目の枠(rows: 行の数 = エレベーターの数) */
export function slotRect(row: number, i: number, rows = 2): Rect {
  const g = rowGeom(rows);
  return { x: SLOT_X0 + i * (CARD_W + CARD_GAP) + (CARD_W - g.cw) / 2, y: g.y0 + row * g.h, w: g.cw, h: g.ch };
}

/**
 * 手持ちのカードの i 番目(count: 手持ちの枚数)。
 * 6枚以上のときは、右の試しに動かす窓にかからないよう、少し小さく(64×85)詰めて並べる(2026-11-25、6枚目のカード)。
 */
export function handRect(i: number, count = 5): Rect {
  if (count <= 5) return { x: SLOT_X0 + i * (CARD_W + CARD_GAP), y: HAND_Y, w: CARD_W, h: CARD_H };
  const w = 64, h = 85, gap = 9;
  return { x: SLOT_X0 + i * (w + gap), y: HAND_Y + (CARD_H - h) / 2, w, h };
}

/** 行の頭(そのエレベーターのかごの絵)。タップでその行を選ぶ */
export function rowButtonRect(row: number, rows = 2): Rect {
  const g = rowGeom(rows);
  return { x: 36, y: g.y0 + row * g.h + 8, w: 64, h: g.ch - 16 };
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
    for (let i = 0; i < slotCount; i++) if (inRect(slotRect(r, i, rows), x, y, rows >= 3 ? PAD_CARD_SMALL : PAD_CARD)) return { kind: 'slot', row: r, index: i };
    if (inRect(rowButtonRect(r, rows), x, y)) return { kind: 'row', row: r };
  }
  for (let i = 0; i < handCount; i++) if (inRect(handRect(i, handCount), x, y, handCount > 5 ? PAD_HAND_TIGHT : PAD_CARD)) return { kind: 'hand', index: i };
  return null;
}

/** ステージの選択ボタン(最下段の左) */
export function stageTabRect(i: number): Rect {
  return { x: 36 + i * 58, y: 452, w: 50, h: 52 };
}

export function stageTabHit(x: number, y: number, stages: number): number | null {
  if (stages < 2) return null;
  for (let i = 0; i < stages; i++) if (inRect(stageTabRect(i), x, y, PAD_TAB)) return i;
  return null;
}

/** ルールの共有ボタン(最下段の中ほど) */
export const SHARE_EXPORT_BUTTON: Rect = { x: 560, y: 454, w: 48, h: 48 };
export const SHARE_IMPORT_BUTTON: Rect = { x: 620, y: 454, w: 48, h: 48 };

export function shareButtonHit(x: number, y: number): 'export' | 'import' | null {
  if (inRect(SHARE_EXPORT_BUTTON, x, y, PAD_BUTTON)) return 'export';
  if (inRect(SHARE_IMPORT_BUTTON, x, y, PAD_BUTTON)) return 'import';
  return null;
}

/** 進行状況を消すボタン(最下段、共有ボタンと開始ボタンの間。ごみ箱の絵) */
export const RESET_BUTTON: Rect = { x: 740, y: 454, w: 48, h: 48 };
/** 消す前の確かめの窓と、その中の「やめる」「消す」ボタン */
export const RESET_PANEL: Rect = { x: 330, y: 150, w: 300, h: 240 };
export const RESET_NO: Rect = { x: 360, y: 290, w: 80, h: 80 };
export const RESET_YES: Rect = { x: 520, y: 290, w: 80, h: 80 };

/** 消音ボタン(右のパネルの右上。どの画面でも押せる) */
export const MUTE_BUTTON: Rect = { x: 900, y: 20, w: 36, h: 36 };

/**
 * 音量の窓(消音ボタンを押すと開く。2026-11-24)。上段=BGM、下段=効果音。
 * 各段に 無(×)・小・中・大 の4つのボタン(文字なし。棒の高さで大きさを見せる)。
 */
export const VOLUME_PANEL: Rect = { x: 700, y: 62, w: 244, h: 110 };
export type VolumeRow = 'music' | 'sfx';
const VOL_ROW_Y: Record<VolumeRow, number> = { music: 72, sfx: 120 };
/** 段の頭の絵(音符・スピーカー)の場所 */
export function volumeIconRect(row: VolumeRow): Rect {
  return { x: 708, y: VOL_ROW_Y[row], w: 40, h: 40 };
}
/** 段階のボタン(level 0=無 … 3=大)の場所 */
export function volumeLevelRect(row: VolumeRow, level: number): Rect {
  return { x: 756 + level * 46, y: VOL_ROW_Y[row], w: 40, h: 40 };
}
/** 音量の窓の中のどこを押したか。窓の外なら null */
export function volumeHit(x: number, y: number): { row: VolumeRow; level: 0 | 1 | 2 | 3 } | 'panel' | null {
  if (!inRect(VOLUME_PANEL, x, y)) return null;
  for (const row of ['music', 'sfx'] as const) {
    for (const level of [0, 1, 2, 3] as const) if (inRect(volumeLevelRect(row, level), x, y, PAD_VOLUME)) return { row, level };
  }
  return 'panel';
}
