import type { CardId } from '../sim/rules.ts';
import { fillCircle, roundRect } from './icons.ts';
import { theme } from './theme.ts';

// ルールのカードの絵(文字は使わない)

export const CARD_COLORS: Record<CardId, string> = {
  nearest: '#249e91',
  sameDir: '#d9782f',
  express: '#c4473a',
  zoneLow: '#55607a',
  zoneHigh: '#55607a',
};

export interface CardOpts {
  /** 今この枠のカードが動きを決めている */
  active?: boolean;
  /** 使えない・置けない(薄く描く) */
  dim?: boolean;
}

export function drawCard(ctx: CanvasRenderingContext2D, card: CardId, x: number, y: number, w: number, h: number, o: CardOpts = {}): void {
  ctx.save();
  ctx.globalAlpha = o.dim ? 0.35 : 1;
  ctx.fillStyle = CARD_COLORS[card];
  roundRect(ctx, x, y, w, h, Math.min(8, w * 0.12));
  ctx.fill();
  ctx.fillStyle = 'rgba(0,0,0,0.18)';
  roundRect(ctx, x + w * 0.1, y + h * 0.12, w * 0.8, h * 0.76, Math.min(6, w * 0.1));
  ctx.fill();
  const cx = x + w / 2;
  const cy = y + h / 2;
  const s = w / 64; // 64px幅を基準にした倍率
  ctx.strokeStyle = '#ffffff';
  ctx.fillStyle = '#ffffff';
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  if (card === 'nearest') {
    // かご(四角)から、近い人へ矢印。遠い人は薄く
    ctx.fillRect(cx - 20 * s, cy - 8 * s, 12 * s, 16 * s);
    fillCircle(ctx, cx + 8 * s, cy - 14 * s, 5 * s, '#ffffff');
    ctx.globalAlpha *= 0.4;
    fillCircle(ctx, cx + 14 * s, cy + 20 * s, 5 * s, '#ffffff');
    ctx.globalAlpha = o.dim ? 0.35 : 1;
    ctx.lineWidth = 3 * s;
    ctx.beginPath();
    ctx.moveTo(cx - 6 * s, cy - 2 * s);
    ctx.lineTo(cx + 2 * s, cy - 10 * s);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(cx + 3 * s, cy - 11 * s); ctx.lineTo(cx - 4 * s, cy - 10 * s); ctx.lineTo(cx + 2 * s, cy - 4 * s);
    ctx.stroke();
  } else if (card === 'sameDir') {
    // 同じ向きの山形が3つ連なる
    ctx.lineWidth = 4 * s;
    for (let k = 0; k < 3; k++) {
      const yy = cy + 14 * s - k * 13 * s;
      ctx.beginPath();
      ctx.moveTo(cx - 12 * s, yy + 6 * s);
      ctx.lineTo(cx, yy - 6 * s);
      ctx.lineTo(cx + 12 * s, yy + 6 * s);
      ctx.stroke();
    }
  } else if (card === 'express') {
    // 1階(太い床)へまっすぐ下る二重の矢印(途中に止まらない)
    ctx.fillRect(cx - 18 * s, cy + 20 * s, 36 * s, 5 * s);
    ctx.lineWidth = 4 * s;
    ctx.beginPath();
    ctx.moveTo(cx, cy - 22 * s); ctx.lineTo(cx, cy + 12 * s);
    ctx.stroke();
    for (const dy of [-2, 9]) {
      ctx.beginPath();
      ctx.moveTo(cx - 10 * s, cy + (dy - 9) * s); ctx.lineTo(cx, cy + dy * s); ctx.lineTo(cx + 10 * s, cy + (dy - 9) * s);
      ctx.stroke();
    }
    // 空のかご(小さな四角の枠)
    ctx.lineWidth = 2 * s;
    ctx.strokeRect(cx + 12 * s, cy - 22 * s, 10 * s, 12 * s);
  } else if (card === 'zoneLow' || card === 'zoneHigh') {
    // 小さな建物(5階)。担当する階を明るく、それ以外を暗く。1階はどちらも担当
    const bw = 26 * s, fh = 8 * s, gap = 1.5 * s;
    const top = cy - (5 * fh + 4 * gap) / 2;
    for (let k = 0; k < 5; k++) {
      const floorIdx = 4 - k; // 上から4,3,2,1,0
      const on = floorIdx === 0 || (card === 'zoneLow' ? floorIdx <= 2 : floorIdx > 2);
      ctx.globalAlpha = (o.dim ? 0.35 : 1) * (on ? 1 : 0.22);
      ctx.fillRect(cx - bw / 2, top + k * (fh + gap), bw, fh);
    }
    ctx.globalAlpha = o.dim ? 0.35 : 1;
    // 「絞る」ことを示す括弧
    ctx.lineWidth = 2.5 * s;
    const y0 = card === 'zoneLow' ? top + 2 * (fh + gap) : top;
    const y1 = card === 'zoneLow' ? top + 5 * fh + 4 * gap : top + 2 * fh + gap;
    ctx.beginPath();
    ctx.moveTo(cx + bw / 2 + 6 * s, y0); ctx.lineTo(cx + bw / 2 + 9 * s, y0);
    ctx.lineTo(cx + bw / 2 + 9 * s, y1); ctx.lineTo(cx + bw / 2 + 6 * s, y1);
    ctx.stroke();
  }
  ctx.restore();
  if (o.active) {
    ctx.strokeStyle = '#ffffff';
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
