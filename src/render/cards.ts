import type { CardId } from '../sim/rules.ts';
import { roundRect } from './icons.ts';
import { theme } from './theme.ts';

// ルールのカードの絵(文字は使わない)。
// 記号だけでは効果が伝わらなかったため(2026-11-19 試遊の感想)、各カードの中に「5階建ての小さなビル」を描き、
// そのカードの判断を短い場面として見せる。編集画面・結果画面では動かし、プレイ中の小さなカードでは1コマで見せる。

export const CARD_COLORS: Record<CardId, string> = {
  nearest: '#249e91',
  sameDir: '#d9782f',
  express: '#c4473a',
  zoneLow: '#55607a',
  zoneHigh: '#55607a',
};

/** カードの中の場面(階は 0〜4、0 が1階) */
export interface CardScene {
  /** かごの出発階と行き先 */
  from: number;
  to: number;
  /** かごが最初から向いている方向(矢印で見せる。0 なら出さない) */
  heading: -1 | 0 | 1;
  /** 待っている人: picked = このカードで迎えに行く人 / それ以外は選ばれない(通り過ぎる・無視する)人 */
  calls: { floor: number; picked: boolean }[];
  /** 担当範囲のカード: 明るくする階 */
  lit?: number[];
  /** 急行: 1階の床を太く描く */
  ground?: boolean;
}

export const SCENES: Record<CardId, CardScene> = {
  // 3階のかご。上(4階)と下(1階)に待つ人 → 近いほう(4階)へ
  nearest: { from: 2, to: 3, heading: 0, calls: [{ floor: 3, picked: true }, { floor: 0, picked: false }] },
  // 同じ配置で、下へ向かっている → 近い4階ではなく、進行方向の先(1階)へ
  sameDir: { from: 2, to: 0, heading: -1, calls: [{ floor: 3, picked: false }, { floor: 0, picked: true }] },
  // 空のかごが最上階から、途中(3階)の待つ人を通り過ぎて1階へ
  express: { from: 4, to: 0, heading: 0, calls: [{ floor: 2, picked: false }], ground: true },
  // 下層担当: 1〜3階だけ明るい。5階の呼び出しは無視して、2階の人へ
  zoneLow: { from: 2, to: 1, heading: 0, calls: [{ floor: 1, picked: true }, { floor: 4, picked: false }], lit: [0, 1, 2] },
  // 上層担当: 1階と4〜5階だけ明るい。2階の呼び出しは無視して、5階の人へ
  zoneHigh: { from: 3, to: 4, heading: 0, calls: [{ floor: 4, picked: true }, { floor: 1, picked: false }], lit: [0, 3, 4] },
};

/** 1回の場面の長さ(ms)。動かすときは now をこれで割った余りを t にする */
export const CARD_LOOP_MS = 2600;

/** 静止画で見せるときの時刻(動き出した直後: 矢印とかごの向かう先が分かる) */
export const STATIC_T = 0.4;

/**
 * 時刻 t(0〜1、繰り返し)での場面の状態。
 * 0〜0.2: 止まって行き先を示す / 0.2〜0.65: 移動 / 0.65〜0.9: 着いて乗せる / 0.9〜1: 消えて最初へ
 */
export function cardSceneAt(sc: CardScene, t: number): { pos: number; pickedGone: boolean; fade: number } {
  const u = ((t % 1) + 1) % 1;
  const move = Math.max(0, Math.min(1, (u - 0.2) / 0.45));
  const ease = move * move * (3 - 2 * move);
  return {
    pos: sc.from + (sc.to - sc.from) * ease,
    pickedGone: u >= 0.7,
    fade: u >= 0.9 ? 1 - (u - 0.9) / 0.1 : 1,
  };
}

export interface CardOpts {
  /** 今この枠のカードが動きを決めている */
  active?: boolean;
  /** 使えない・置けない(薄く描く) */
  dim?: boolean;
  /** 場面の時刻(0〜1)。省略すると静止画(STATIC_T) */
  t?: number;
}

export function drawCard(ctx: CanvasRenderingContext2D, card: CardId, x: number, y: number, w: number, h: number, o: CardOpts = {}): void {
  ctx.save();
  ctx.globalAlpha = o.dim ? 0.35 : 1;
  ctx.fillStyle = CARD_COLORS[card];
  roundRect(ctx, x, y, w, h, Math.min(8, w * 0.12));
  ctx.fill();

  const sc = SCENES[card];
  const st = cardSceneAt(sc, o.t ?? STATIC_T);
  const s = w / 64; // 64px幅を基準にした倍率
  const left = x + 7 * s, right = x + w - 7 * s;
  const top = y + 8 * s, bottom = y + h - 8 * s;
  const fh = (bottom - top) / 5;
  const floorMid = (f: number): number => bottom - (f + 0.5) * fh;
  const shaftX = left + 3 * s, shaftW = 14 * s;
  const base = o.dim ? 0.35 : 1;

  // ビルの中(暗い面)と階
  ctx.fillStyle = 'rgba(0,0,0,0.28)';
  roundRect(ctx, left, top, right - left, bottom - top, 4 * s);
  ctx.fill();
  for (let f = 0; f < 5; f++) {
    const fy = bottom - (f + 1) * fh;
    // 担当範囲: 担当の階を明るく、担当外を暗く
    if (sc.lit) {
      ctx.fillStyle = sc.lit.includes(f) ? 'rgba(255,255,255,0.22)' : 'rgba(0,0,0,0.25)';
      ctx.fillRect(left, fy, right - left, fh);
    }
    ctx.fillStyle = 'rgba(255,255,255,0.18)';
    ctx.fillRect(left, fy + fh - Math.max(1, s), right - left, Math.max(1, s));
  }
  if (sc.ground) {
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(left, bottom - 2.5 * s, right - left, 2.5 * s);
  }
  // シャフト
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  ctx.fillRect(shaftX, top, shaftW, bottom - top);

  // 待っている人(シャフトの右)。迎えに行く人は白く、選ばれない人は薄く
  for (const c of sc.calls) {
    if (c.picked && st.pickedGone) continue;
    const cyy = floorMid(c.floor);
    const cxx = shaftX + shaftW + 9 * s;
    ctx.globalAlpha = base * st.fade * (c.picked ? 1 : 0.4);
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(cxx, cyy - 0.5 * s, 3.2 * s, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillRect(cxx - 2.6 * s, cyy + 2 * s, 5.2 * s, 2.6 * s);
    // 選ばれない人には斜線(無視する・通り過ぎる)
    if (!c.picked) {
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = Math.max(1.2, 1.4 * s);
      ctx.beginPath();
      ctx.moveTo(cxx - 5 * s, cyy + 5 * s);
      ctx.lineTo(cxx + 5 * s, cyy - 5 * s);
      ctx.stroke();
    }
  }
  ctx.globalAlpha = base * st.fade;

  // 行き先への矢印(動き出す前と移動中): シャフトの左に、出発階から行き先まで
  const toY = floorMid(sc.to), fromY = floorMid(sc.from);
  const dirDown = sc.to < sc.from;
  ctx.strokeStyle = '#ffffff';
  ctx.fillStyle = '#ffffff';
  ctx.lineWidth = Math.max(1.5, 2 * s);
  if (!st.pickedGone) {
    const ax = left + 1.2 * s;
    ctx.setLineDash([3 * s, 2.5 * s]);
    ctx.beginPath();
    ctx.moveTo(ax, fromY);
    ctx.lineTo(ax, toY);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  // かご(白い枠)。最初から向いている方向があれば三角で示す
  const carY = floorMid(st.pos);
  const ch = fh * 0.82, cw = shaftW - 3 * s;
  ctx.fillStyle = '#ffffff';
  roundRect(ctx, shaftX + 1.5 * s, carY - ch / 2, cw, ch, 2 * s);
  ctx.fill();
  ctx.fillStyle = CARD_COLORS[card];
  ctx.fillRect(shaftX + 3.5 * s, carY - ch / 2 + 2 * s, cw - 4 * s, ch - 4 * s);
  const heading = sc.heading !== 0 ? sc.heading : (st.pos === sc.to ? 0 : dirDown ? -1 : 1);
  if (heading !== 0 && !st.pickedGone) {
    const mx = shaftX + shaftW / 2;
    const tipY = heading > 0 ? carY - ch / 2 - 4.5 * s : carY + ch / 2 + 4.5 * s;
    const baseY = heading > 0 ? carY - ch / 2 - 1 * s : carY + ch / 2 + 1 * s;
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.moveTo(mx, tipY);
    ctx.lineTo(mx - 4 * s, baseY);
    ctx.lineTo(mx + 4 * s, baseY);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();

  if (o.active) {
    ctx.strokeStyle = `rgb(${theme().highlightRgb})`;
    ctx.lineWidth = 3;
    roundRect(ctx, x - 3, y - 3, w + 6, h + 6, Math.min(10, w * 0.15));
    ctx.stroke();
  }
}

/** 空の枠 */
export function drawEmptySlot(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number): void {
  ctx.save();
  ctx.setLineDash([6, 5]);
  ctx.strokeStyle = theme().textDim;
  ctx.lineWidth = 2;
  roundRect(ctx, x, y, w, h, Math.min(8, w * 0.12));
  ctx.stroke();
  ctx.restore();
}
