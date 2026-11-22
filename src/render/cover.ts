// 投稿用の表紙の画像(CrazyGames: 横長 1920x1080 / 縦長 800x1200 / 正方形 800x800。文字はタイトルだけ。
// 画面写真そのままではなく、ゲームの要素で組み立てた絵にする。docs.crazygames.com/requirements/game-covers)。
// 撮影専用ビルドで ?cover=landscape|portrait|square を付けて開くと、この絵だけを描く(scripts/promo.ts が撮る)。
import { drawCard } from './cards.ts';
import { drawNumber, fillCircle, roundRect } from './icons.ts';
import { floorColor } from './render.ts';

export type CoverKind = 'landscape' | 'portrait' | 'square';

const ELEV = ['#4fc3f7', '#f06292'];
const ACCENT = '#ff9a2e';

interface Box { x: number; y: number; w: number; h: number }

function layout(kind: CoverKind, W: number, H: number): { title: Box; building: Box; cards: Box } {
  if (kind === 'landscape') {
    return {
      building: { x: W * 0.06, y: H * 0.1, w: W * 0.42, h: H * 0.82 },
      title: { x: W * 0.52, y: H * 0.12, w: W * 0.44, h: H * 0.42 },
      cards: { x: W * 0.55, y: H * 0.56, w: W * 0.4, h: H * 0.36 },
    };
  }
  if (kind === 'portrait') {
    // 縦長: 上にタイトル、真ん中に建物、下にカードを横一列(建物のかごを隠さない)
    return {
      title: { x: W * 0.06, y: H * 0.03, w: W * 0.88, h: H * 0.12 },
      building: { x: W * 0.1, y: H * 0.16, w: W * 0.8, h: H * 0.56 },
      cards: { x: W * 0.06, y: H * 0.74, w: W * 0.88, h: H * 0.24 },
    };
  }
  return {
    title: { x: W * 0.06, y: H * 0.04, w: W * 0.88, h: H * 0.26 },
    building: { x: W * 0.06, y: H * 0.33, w: W * 0.5, h: H * 0.62 },
    cards: { x: W * 0.52, y: H * 0.45, w: W * 0.44, h: H * 0.45 },
  };
}

/** 人の形(頭と胴)。cx: 中心、foot: 足元、r: 大きさ */
function person(ctx: CanvasRenderingContext2D, cx: number, foot: number, r: number, color: string): void {
  ctx.fillStyle = color;
  roundRect(ctx, cx - r * 0.62, foot - r * 1.5, r * 1.24, r * 1.5, r * 0.4);
  ctx.fill();
  fillCircle(ctx, cx, foot - r * 1.5 - r * 0.62, r * 0.58, color);
}

function drawBuilding(ctx: CanvasRenderingContext2D, b: Box): void {
  const floors = 7;
  const fh = b.h / floors;
  ctx.fillStyle = '#0d0d0f';
  roundRect(ctx, b.x, b.y, b.w, b.h, 10);
  ctx.fill();
  const shaftW = b.w * 0.16;
  const shaftX = [b.x + b.w - shaftW * 2 - b.w * 0.05, b.x + b.w - shaftW - b.w * 0.03];
  for (let f = 0; f < floors; f++) {
    const y = b.y + (floors - 1 - f) * fh;
    ctx.fillStyle = f % 2 === 0 ? '#17181c' : '#1c1d22';
    ctx.fillRect(b.x, y, b.w, fh - 2);
    ctx.fillStyle = floorColor(f);
    ctx.fillRect(b.x, y, b.w * 0.012, fh - 2);
    // オフィスの窓
    ctx.fillStyle = 'rgba(140,190,255,0.07)';
    for (let x = b.x + b.w * 0.08; x < shaftX[0]! - b.w * 0.12; x += b.w * 0.11) ctx.fillRect(x, y + fh * 0.18, b.w * 0.08, fh * 0.3);
  }
  for (const sx of shaftX) {
    ctx.fillStyle = '#050505';
    ctx.fillRect(sx, b.y, shaftW, b.h);
    ctx.fillStyle = 'rgba(255,255,255,0.12)';
    ctx.fillRect(sx + shaftW / 2 - 1.5, b.y, 3, b.h);
  }
  // 待っている人(行き先の色)
  const r = fh * 0.17;
  const waits: [number, number[]][] = [[0, [3, 5, 6, 2, 4]], [3, [0, 6]], [5, [0, 1, 0]], [2, [6]]];
  for (const [f, dests] of waits) {
    const foot = b.y + (floors - f) * fh - fh * 0.1;
    dests.forEach((d, i) => {
      const cx = shaftX[0]! - b.w * 0.06 - i * r * 2.6;
      person(ctx, cx, foot, r, floorColor(d));
      drawNumber(ctx, String(d + 1), cx, foot - r * 3.0, Math.max(14, r * 1.6), '#e8e8e8');
    });
  }
  // かご(エレベーターの色の縁、上に階数表示)
  const cars: [number, number][] = [[0, 3.3], [1, 1]];
  for (const [i, pos] of cars) {
    const sx = shaftX[i]!;
    const cy = b.y + (floors - 1 - pos) * fh + fh * 0.06;
    const ch = fh * 0.88;
    ctx.fillStyle = 'rgba(255,255,255,0.12)';
    ctx.fillRect(sx + shaftW / 2 - 1.5, b.y, 3, cy - b.y);
    ctx.fillStyle = '#5f6670';
    roundRect(ctx, sx + 4, cy, shaftW - 8, ch, 8);
    ctx.fill();
    ctx.save();
    ctx.shadowColor = ELEV[i]!;
    ctx.shadowBlur = 24;
    ctx.strokeStyle = ELEV[i]!;
    ctx.lineWidth = Math.max(4, shaftW * 0.05);
    ctx.stroke();
    ctx.restore();
    ctx.fillStyle = '#22262c';
    roundRect(ctx, sx + 12, cy + 8, shaftW - 24, ch - 16, 5);
    ctx.fill();
    // 乗っている人
    for (let k = 0; k < 3; k++) fillCircle(ctx, sx + shaftW * (0.3 + k * 0.2), cy + ch - r * 1.4, r * 0.62, floorColor((k * 3 + i * 2) % 7));
    // 階数表示
    const iw = shaftW * 0.6, ih = fh * 0.3;
    ctx.fillStyle = '#050505';
    roundRect(ctx, sx + shaftW / 2 - iw / 2, cy - ih - 6, iw, ih, 5);
    ctx.fill();
    drawNumber(ctx, String(Math.round(pos) + 1), sx + shaftW / 2 + iw * 0.18, cy - 10, Math.max(14, ih * 0.8), ACCENT);
    ctx.fillStyle = ACCENT;
    const tx = sx + shaftW / 2 - iw * 0.22, ty = cy - ih / 2 - 6;
    ctx.beginPath();
    ctx.moveTo(tx, ty - ih * 0.28); ctx.lineTo(tx + ih * 0.28, ty + ih * 0.2); ctx.lineTo(tx - ih * 0.28, ty + ih * 0.2);
    ctx.closePath();
    ctx.fill();
  }
}

function drawTitle(ctx: CanvasRenderingContext2D, b: Box, kind: CoverKind): void {
  const lines = kind === 'landscape' ? ['RULE THE', 'LIFT'] : ['RULE THE LIFT'];
  const family = '"Arial Black", Impact, "DejaVu Sans", sans-serif';
  // 枠に収まる一番大きな字の大きさ
  let size = b.h / lines.length;
  ctx.font = `900 ${size}px ${family}`;
  const widest = Math.max(...lines.map((l) => ctx.measureText(l).width));
  if (widest > b.w) size *= b.w / widest;
  size = Math.min(size, (b.h / lines.length) * 0.92);
  ctx.font = `900 ${size}px ${family}`;
  ctx.textBaseline = 'alphabetic';
  ctx.textAlign = kind === 'landscape' ? 'left' : 'center';
  const x = kind === 'landscape' ? b.x : b.x + b.w / 2;
  lines.forEach((l, i) => {
    const y = b.y + size * (i + 0.9);
    ctx.save();
    ctx.shadowColor = ACCENT;
    ctx.shadowBlur = size * 0.25;
    ctx.fillStyle = i === lines.length - 1 && kind === 'landscape' ? ACCENT : '#fff3e0';
    ctx.fillText(l, x, y);
    ctx.restore();
  });
}

function drawCards(ctx: CanvasRenderingContext2D, b: Box): void {
  const cards = ['nearest', 'sameDir', 'express'] as const;
  const ch = Math.min(b.h * 0.95, (b.w / 3) * (84 / 64) * 1.15);
  const cw = ch * (64 / 84);
  cards.forEach((c, i) => {
    const angle = (i - 1) * 0.16;
    const cx = b.x + b.w / 2 + (i - 1) * cw * 0.78;
    const cy = b.y + b.h / 2 + Math.abs(i - 1) * ch * 0.05;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(angle);
    ctx.shadowColor = 'rgba(0,0,0,0.6)';
    ctx.shadowBlur = 20;
    ctx.shadowOffsetY = 8;
    drawCard(ctx, c, -cw / 2, -ch / 2, cw, ch, { t: 0.4 });
    ctx.restore();
  });
}

export function drawCover(ctx: CanvasRenderingContext2D, W: number, H: number, kind: CoverKind): void {
  const g = ctx.createRadialGradient(W * 0.6, H * 0.4, 0, W * 0.6, H * 0.4, Math.max(W, H) * 0.8);
  g.addColorStop(0, '#2a1a06');
  g.addColorStop(1, '#050505');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  const l = layout(kind, W, H);
  drawBuilding(ctx, l.building);
  drawCards(ctx, l.cards);
  drawTitle(ctx, l.title, kind);
}
