import type { Elevator } from '../sim/elevator.ts';
import type { Passenger } from '../sim/passenger.ts';
import type { SimState } from '../sim/sim.ts';
import {
  LOGICAL_H, LOGICAL_W, carHeight, carTop, floorTop, type Layout, type View,
} from './layout.ts';

// 描画は sim の状態を読むだけで、書き換えない。乱数も使わない。

/** 階ごとの色(行き先を色でも区別できるように) */
export const FLOOR_COLORS = [
  '#ef4b5f', '#4cc26a', '#f2c744', '#4f7ff0', '#f28b3a',
  '#a35be0', '#3fd3d3', '#ec5fc0', '#a8d63a', '#e9a8a8',
];
export const floorColor = (f: number): string => FLOOR_COLORS[f % FLOOR_COLORS.length]!;

const BG = '#14161c';
const BAND_A = '#1d212b';
const BAND_B = '#222735';
const SHAFT = '#0e1015';

export interface DrawArgs {
  ctx: CanvasRenderingContext2D;
  cssW: number;
  cssH: number;
  dpr: number;
  view: View;
  layout: Layout;
  state: SimState;
  /** 1つ前のtickでのかご位置(補間用) */
  prevPos: readonly number[];
  /** 0〜1: 前のtickから次のtickまでの進み具合 */
  alpha: number;
  selected: number | null;
  /** performance.now() 相当(点滅などの演出用。simには影響しない) */
  now: number;
}

export function draw(a: DrawArgs): void {
  const { ctx, view, layout: l, state: s } = a;
  ctx.setTransform(a.dpr, 0, 0, a.dpr, 0, 0);
  ctx.fillStyle = BG;
  ctx.fillRect(0, 0, a.cssW, a.cssH);
  ctx.setTransform(a.dpr * view.scale, 0, 0, a.dpr * view.scale, a.dpr * view.offsetX, a.dpr * view.offsetY);
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, 0, LOGICAL_W, LOGICAL_H);
  ctx.clip();
  ctx.fillStyle = BG;
  ctx.fillRect(0, 0, LOGICAL_W, LOGICAL_H);

  drawBuilding(ctx, l, s, a.now);
  drawQueues(ctx, l, s);
  s.elevators.forEach((e, i) => {
    const prev = a.prevPos[i] ?? e.pos;
    const pos = prev + (e.pos - prev) * a.alpha;
    drawElevator(ctx, l, s, e, pos, a.selected === i);
  });
  ctx.restore();
}

function drawBuilding(ctx: CanvasRenderingContext2D, l: Layout, s: SimState, now: number): void {
  const waitingAt = new Set<number>();
  for (const p of s.passengers) if (p.state === 'waiting') waitingAt.add(p.origin);
  const targets = new Set<number>();
  for (const e of s.elevators) if (e.manualTarget !== null) targets.add(e.manualTarget);

  for (let f = 0; f < l.floors; f++) {
    const y = floorTop(l, f);
    ctx.fillStyle = f % 2 === 0 ? BAND_A : BAND_B;
    ctx.fillRect(0, y, LOGICAL_W, l.floorH);
    // 階の色の帯と番号
    ctx.fillStyle = floorColor(f);
    ctx.fillRect(0, y, 6, l.floorH);
    drawNumber(ctx, String(f + 1), 21, y + l.floorH - 12, 13, floorColor(f));
    // 床の線
    ctx.fillStyle = '#394056';
    ctx.fillRect(6, y + l.floorH - 2, LOGICAL_W - 6, 2);
    // 呼び出しランプ
    if (waitingAt.has(f)) {
      ctx.fillStyle = '#ffd34d';
      ctx.beginPath();
      ctx.arc(l.queueRight + 6, y + 14, 4, 0, Math.PI * 2);
      ctx.fill();
    }
    // 手動指示の目的階(点滅する枠)
    if (targets.has(f)) {
      const pulse = 0.5 + 0.5 * Math.sin(now / 160);
      ctx.strokeStyle = `rgba(255,255,255,${(0.35 + 0.45 * pulse).toFixed(3)})`;
      ctx.lineWidth = 2;
      ctx.strokeRect(8, y + 2, LOGICAL_W - 10, l.floorH - 4);
    }
  }
  // シャフト
  for (const x of l.shaftX) {
    ctx.fillStyle = SHAFT;
    ctx.fillRect(x, l.top, l.shaftW, l.floors * l.floorH);
  }
}

/** 待ち行列。種類ごとに幅の違う「枠」を取り、先頭(id が小さい人)がシャフトに一番近い */
const SLOT_WIDTH = { normal: 1, rushed: 1, group: 2.2, luggage: 1.6 } as const;

function drawQueues(ctx: CanvasRenderingContext2D, l: Layout, s: SimState): void {
  const byFloor: Passenger[][] = Array.from({ length: l.floors }, () => []);
  for (const p of s.passengers) if (p.state === 'waiting') byFloor[p.origin]!.push(p);
  const avail = l.queueRight - l.queueLeft;
  for (let f = 0; f < l.floors; f++) {
    const q = byFloor[f]!;
    if (q.length === 0) continue;
    let slots = 0;
    for (const p of q) slots += SLOT_WIDTH[p.kind];
    const unit = Math.min(20, avail / slots);
    const baseY = floorTop(l, f) + l.floorH - 2;
    let x = l.queueRight;
    for (const p of q) {
      const w = SLOT_WIDTH[p.kind] * unit;
      x -= w;
      const remain = Math.max(0, 1 - (s.tick - p.spawnTick) / p.patience);
      drawPassenger(ctx, p, x + w / 2, baseY, Math.min(unit, 20), remain, true);
    }
  }
}

/** 乗客1人。cx: 中心x、footY: 足元y、unit: 1人分の幅 */
function drawPassenger(
  ctx: CanvasRenderingContext2D, p: Passenger, cx: number, footY: number,
  unit: number, remain: number, showRing: boolean,
): void {
  const r = Math.max(3.5, Math.min(7, unit * 0.36));
  const cy = footY - r - 3;
  const color = floorColor(p.dest);
  if (p.kind === 'group') {
    for (const dx of [-r * 1.25, 0, r * 1.25]) fillCircle(ctx, cx + dx, cy + (dx === 0 ? -2 : 0), r * 0.85, color);
  } else if (p.kind === 'luggage') {
    fillCircle(ctx, cx - r * 0.5, cy, r, color);
    ctx.fillStyle = '#c9a26b';
    ctx.fillRect(cx + r * 0.6, cy - r * 0.2, r * 1.3, r * 1.2);
  } else if (p.kind === 'rushed') {
    // 急ぎ: 三角形
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(cx, cy - r * 1.2);
    ctx.lineTo(cx + r * 1.15, cy + r * 0.85);
    ctx.lineTo(cx - r * 1.15, cy + r * 0.85);
    ctx.closePath();
    ctx.fill();
  } else {
    fillCircle(ctx, cx, cy, r, color);
  }
  if (showRing) {
    // 我慢の残り: リングが減り、緑→赤に変わる
    ctx.strokeStyle = `hsl(${(120 * remain).toFixed(0)} 85% 55%)`;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(cx, cy, r + 3, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * remain);
    ctx.stroke();
  }
  drawNumber(ctx, String(p.dest + 1), cx, cy - r - 6, 11, '#ffffff');
}

function drawElevator(
  ctx: CanvasRenderingContext2D, l: Layout, s: SimState, e: Elevator, pos: number, selected: boolean,
): void {
  const x = l.shaftX[e.id]!;
  const y = carTop(l, pos);
  const h = carHeight(l);
  const w = l.shaftW;

  ctx.fillStyle = '#3a4156';
  roundRect(ctx, x + 1, y, w - 2, h, 6);
  ctx.fill();
  ctx.fillStyle = '#2b3042';
  roundRect(ctx, x + 5, y + 5, w - 10, h - 10, 4);
  ctx.fill();
  if (selected && s.elevators.length > 1) {
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2.5;
    roundRect(ctx, x - 1, y - 1, w + 2, h + 2, 7);
    ctx.stroke();
  }

  // 乗客(1人分につき1つの丸。数字は先頭のみ)
  const riders = s.passengers.filter((p) => p.state === 'riding' && p.elevatorId === e.id);
  const r = 6;
  const cols = 4;
  const pitch = (w - 14) / cols;
  let n = 0;
  for (const p of riders) {
    for (let k = 0; k < p.size; k++) {
      const col = n % cols;
      const row = Math.floor(n / cols);
      const cx = x + 7 + pitch * (col + 0.5);
      const cy = y + h - 12 - row * (r * 2 + 6);
      fillCircle(ctx, cx, cy, r, floorColor(p.dest));
      if (k === 0) drawNumber(ctx, String(p.dest + 1), cx, cy + 4, 10, '#0b0d12');
      n++;
    }
  }

  // 扉: 開いている間は左右に引き込まれる
  const open = doorOpen(e, s.config.building.doorTicks);
  const half = (w - 10) / 2;
  ctx.fillStyle = 'rgba(160,170,195,0.55)';
  ctx.fillRect(x + 5, y + 5, half * (1 - open), h - 10);
  ctx.fillRect(x + 5 + half + half * open, y + 5, half * (1 - open), h - 10);

  // 進行方向の矢印
  if (e.dir !== 0) {
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    const cx = x + w / 2;
    if (e.dir === 1) {
      ctx.moveTo(cx, y - 7); ctx.lineTo(cx + 6, y - 1); ctx.lineTo(cx - 6, y - 1);
    } else {
      ctx.moveTo(cx, y + h + 7); ctx.lineTo(cx + 6, y + h + 1); ctx.lineTo(cx - 6, y + h + 1);
    }
    ctx.closePath();
    ctx.fill();
  }
}

/** 扉の開き具合 0〜1 */
export function doorOpen(e: Elevator, doorTicks: number): number {
  if (e.phase !== 'open') return 0;
  const ramp = 8;
  const opening = (doorTicks - e.timer) / ramp;
  const closing = e.timer / ramp;
  return Math.max(0, Math.min(1, opening, closing));
}

function fillCircle(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, color: string): void {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
}

function drawNumber(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, size: number, color: string): void {
  ctx.font = `bold ${size}px system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.fillStyle = color;
  ctx.fillText(text, x, y);
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

