import type { Elevator } from '../sim/elevator.ts';
import type { Passenger } from '../sim/passenger.ts';
import type { ScoreResult } from '../sim/score.ts';
import type { SimState } from '../sim/sim.ts';
import {
  BUILDING_RIGHT, LOGICAL_H, LOGICAL_W, PANEL_W, PANEL_X, RESULT_PANEL, RETRY_BUTTON, START_BUTTON,
  carHeight, carTop, floorTop, type Layout, type View,
} from './layout.ts';
import {
  drawNumber, fillCircle, iconCheck, iconClock, iconCross, iconPhase, iconPlay, iconRetry, iconStar, roundRect,
} from './icons.ts';

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
const PANEL_BG = '#1a1d26';

/** 演出(sim の出来事から作る。sim には影響しない) */
export interface Effect {
  type: 'delivered' | 'missed';
  floor: number;
  elevator: number;
  /** 発生時刻(performance.now) */
  t0: number;
}

export type Mode = 'ready' | 'playing' | 'result';

export interface DrawArgs {
  ctx: CanvasRenderingContext2D;
  cssW: number;
  cssH: number;
  dpr: number;
  view: View;
  layout: Layout;
  state: SimState;
  /** 今の点数と星(sim/score.ts で計算したもの) */
  score: ScoreResult;
  starThresholds: readonly [number, number, number];
  /** 1つ前のtickでのかご位置(補間用) */
  prevPos: readonly number[];
  /** 0〜1: 前のtickから次のtickまでの進み具合 */
  alpha: number;
  selected: number | null;
  effects: readonly Effect[];
  mode: Mode;
  /** 結果画面を出した時刻(演出用) */
  modeSince: number;
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
  drawEffects(ctx, l, a.effects, a.now);
  drawPanel(ctx, s, a.score, a.starThresholds, a.now);

  if (a.mode === 'ready') drawStart(ctx, a.now);
  if (a.mode === 'result') drawResult(ctx, a.score, a.now - a.modeSince);
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
    ctx.fillRect(0, y, BUILDING_RIGHT, l.floorH);
    // 階の色の帯と番号
    ctx.fillStyle = floorColor(f);
    ctx.fillRect(0, y, 8, l.floorH);
    drawNumber(ctx, String(f + 1), 26, y + l.floorH - 14, 18, floorColor(f));
    // 床の線
    ctx.fillStyle = '#394056';
    ctx.fillRect(8, y + l.floorH - 2, BUILDING_RIGHT - 8, 2);
    // 呼び出しランプ
    if (waitingAt.has(f)) fillCircle(ctx, l.queueRight + 8, y + 16, 5, '#ffd34d');
    // 手動指示の目的階(点滅する枠)
    if (targets.has(f)) {
      const pulse = 0.5 + 0.5 * Math.sin(now / 160);
      ctx.strokeStyle = `rgba(255,255,255,${(0.35 + 0.45 * pulse).toFixed(3)})`;
      ctx.lineWidth = 2;
      ctx.strokeRect(10, y + 2, BUILDING_RIGHT - 12, l.floorH - 4);
    }
  }
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
    const unit = Math.min(26, avail / slots);
    const baseY = floorTop(l, f) + l.floorH - 2;
    let x = l.queueRight;
    for (const p of q) {
      const w = SLOT_WIDTH[p.kind] * unit;
      x -= w;
      const remain = Math.max(0, 1 - (s.tick - p.spawnTick) / p.patience);
      drawPassenger(ctx, p, x + w / 2, baseY, unit, remain);
    }
  }
}

/** 乗客1人。cx: 中心x、footY: 足元y、unit: 1人分の幅 */
function drawPassenger(
  ctx: CanvasRenderingContext2D, p: Passenger, cx: number, footY: number, unit: number, remain: number,
): void {
  const r = Math.max(4, Math.min(9, unit * 0.36));
  const cy = footY - r - 5;
  const color = floorColor(p.dest);
  // 我慢が残り少ないと震える(残り25%以下)
  const shake = remain < 0.25 ? Math.sin(remain * 400) * 1.5 : 0;
  const x = cx + shake;
  if (p.kind === 'group') {
    for (const dx of [-r * 1.25, 0, r * 1.25]) fillCircle(ctx, x + dx, cy + (dx === 0 ? -2 : 0), r * 0.85, color);
  } else if (p.kind === 'luggage') {
    fillCircle(ctx, x - r * 0.5, cy, r, color);
    ctx.fillStyle = '#c9a26b';
    ctx.fillRect(x + r * 0.6, cy - r * 0.2, r * 1.3, r * 1.2);
  } else if (p.kind === 'rushed') {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(x, cy - r * 1.2);
    ctx.lineTo(x + r * 1.15, cy + r * 0.85);
    ctx.lineTo(x - r * 1.15, cy + r * 0.85);
    ctx.closePath();
    ctx.fill();
  } else {
    fillCircle(ctx, x, cy, r, color);
  }
  // 我慢の残り: リングが減り、緑→赤に変わる
  ctx.strokeStyle = `hsl(${(120 * remain).toFixed(0)} 85% 55%)`;
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.arc(x, cy, r + 3.5, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * remain);
  ctx.stroke();
  drawNumber(ctx, String(p.dest + 1), x, cy - r - 8, 13, '#ffffff');
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
  const r = 6.5;
  const cols = 4;
  const pitch = (w - 14) / cols;
  let n = 0;
  for (const p of riders) {
    for (let k = 0; k < p.size; k++) {
      const col = n % cols;
      const row = Math.floor(n / cols);
      const cx = x + 7 + pitch * (col + 0.5);
      const cy = y + h - 14 - row * (r * 2 + 6);
      fillCircle(ctx, cx, cy, r, floorColor(p.dest));
      if (k === 0) drawNumber(ctx, String(p.dest + 1), cx, cy + 4.5, 11, '#0b0d12');
      n++;
    }
  }
  // 定員の目盛り(上部の小さな点。使っている分が明るい)
  const cap = s.building.capacity;
  for (let i = 0; i < cap; i++) {
    const gx = x + w / 2 + (i - (cap - 1) / 2) * 8;
    fillCircle(ctx, gx, y + 12, 2.5, i < n ? '#ffffff' : 'rgba(255,255,255,0.2)');
  }

  // 扉: 開いている間は左右に引き込まれる
  const open = doorOpen(e, s.building.doorTicks);
  const half = (w - 10) / 2;
  ctx.fillStyle = 'rgba(160,170,195,0.5)';
  ctx.fillRect(x + 5, y + 20, half * (1 - open), h - 25);
  ctx.fillRect(x + 5 + half + half * open, y + 20, half * (1 - open), h - 25);

  // 進行方向の矢印
  if (e.dir !== 0) {
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    const cx = x + w / 2;
    if (e.dir === 1) {
      ctx.moveTo(cx, y - 8); ctx.lineTo(cx + 7, y - 1); ctx.lineTo(cx - 7, y - 1);
    } else {
      ctx.moveTo(cx, y + h + 8); ctx.lineTo(cx + 7, y + h + 1); ctx.lineTo(cx - 7, y + h + 1);
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

export const EFFECT_MS = 900;

function drawEffects(ctx: CanvasRenderingContext2D, l: Layout, effects: readonly Effect[], now: number): void {
  for (const ef of effects) {
    const t = (now - ef.t0) / EFFECT_MS;
    if (t < 0 || t > 1) continue;
    const y = floorTop(l, ef.floor) + l.floorH / 2 - t * 24;
    const alpha = 1 - t;
    if (ef.type === 'missed') {
      iconCross(ctx, l.queueLeft + 14, y, 11, alpha);
    } else {
      const sx = l.shaftX[ef.elevator] ?? l.shaftX[0]!;
      iconCheck(ctx, sx - 12, y, 9, alpha);
    }
  }
}

function drawPanel(
  ctx: CanvasRenderingContext2D, s: SimState, sc: ScoreResult, th: readonly [number, number, number], now: number,
): void {
  ctx.fillStyle = PANEL_BG;
  roundRect(ctx, PANEL_X, 16, PANEL_W, LOGICAL_H - 32, 10);
  ctx.fill();

  // 1日の進み具合: 時間帯ごとに色分けした帯と、今の位置
  const bx = PANEL_X + 20;
  const bw = PANEL_W - 40;
  const by = 74;
  const phases = s.config.traffic.phases;
  const colors = ['#a8743a', '#3d7fa8', '#7a4fa8'];
  let acc = 0;
  phases.forEach((ph, i) => {
    const x0 = bx + (acc / s.dayTicks) * bw;
    const x1 = bx + ((acc + ph.ticks) / s.dayTicks) * bw;
    ctx.fillStyle = colors[i % colors.length]!;
    ctx.fillRect(x0, by, x1 - x0 - 2, 12);
    iconPhase(ctx, i, (x0 + x1) / 2, by - 24, 14);
    acc += ph.ticks;
  });
  const t = Math.min(1, s.tick / s.dayTicks);
  const mx = bx + t * bw;
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(mx - 1.5, by - 4, 3, 20);
  if (s.tick >= s.dayTicks && !s.finished) {
    // 延長中: 月が点滅
    if (Math.floor(now / 400) % 2 === 0) iconPhase(ctx, -1, bx + bw + 4, by + 6, 10);
  }

  // 数字の行: 運んだ / 取りこぼし / 平均待ち時間
  const rowX = PANEL_X + 40;
  const numX = PANEL_X + PANEL_W - 28;
  let y = 140;
  iconCheck(ctx, rowX, y, 13);
  drawNumber(ctx, String(sc.delivered), numX, y + 9, 26, '#ffffff', 'right');
  y += 50;
  iconCross(ctx, rowX, y, 13);
  drawNumber(ctx, String(sc.missed), numX, y + 9, 26, '#ffffff', 'right');
  y += 50;
  iconClock(ctx, rowX, y, 14);
  drawNumber(ctx, sc.avgWaitSec.toFixed(1), numX, y + 9, 26, '#ffffff', 'right');

  // 点数と星(閾値に届いた星が光る)
  y += 70;
  ctx.fillStyle = 'rgba(255,255,255,0.08)';
  ctx.fillRect(PANEL_X + 20, y - 34, PANEL_W - 40, 2);
  drawNumber(ctx, String(sc.score), PANEL_X + PANEL_W / 2, y + 16, 40, '#ffd34d');
  y += 56;
  for (let i = 0; i < 3; i++) {
    iconStar(ctx, PANEL_X + PANEL_W / 2 + (i - 1) * 46, y, 17, sc.score >= th[i]!);
  }
}

function dim(ctx: CanvasRenderingContext2D): void {
  ctx.fillStyle = 'rgba(8,10,14,0.66)';
  ctx.fillRect(0, 0, LOGICAL_W, LOGICAL_H);
}

function drawStart(ctx: CanvasRenderingContext2D, now: number): void {
  dim(ctx);
  const b = START_BUTTON;
  const pulse = 1 + 0.04 * Math.sin(now / 250);
  const cx = b.x + b.w / 2;
  const cy = b.y + b.h / 2;
  fillCircle(ctx, cx, cy, (b.w / 2) * pulse, '#3fbf6a');
  iconPlay(ctx, cx + 4, cy, b.w / 2);
  // 遊び方の図: 指が階をタップ → エレベーターが向かう(文字は使わない)
  const hx = cx - 150;
  const hy = cy + 120;
  ctx.fillStyle = '#2b3042';
  ctx.fillRect(hx - 10, hy - 30, 300, 60);
  fillCircle(ctx, hx + 30, hy, 9, floorColor(2));
  drawNumber(ctx, '3', hx + 30, hy - 14, 12, '#ffffff');
  // 指(丸と短い軸)
  const tap = (Math.floor(now / 600) % 2) === 0;
  fillCircle(ctx, hx + 90, hy + (tap ? 0 : -6), 10, '#f5d0b0');
  ctx.fillStyle = '#f5d0b0';
  ctx.fillRect(hx + 85, hy + (tap ? 0 : -6), 10, 22);
  if (tap) {
    ctx.strokeStyle = 'rgba(255,255,255,0.6)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(hx + 90, hy, 18, 0, Math.PI * 2);
    ctx.stroke();
  }
  // 矢印 → かご
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(hx + 130, hy - 2, 70, 4);
  ctx.beginPath();
  ctx.moveTo(hx + 210, hy); ctx.lineTo(hx + 198, hy - 8); ctx.lineTo(hx + 198, hy + 8);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#3a4156';
  roundRect(ctx, hx + 230, hy - 26, 40, 52, 5);
  ctx.fill();
}

function drawResult(ctx: CanvasRenderingContext2D, sc: ScoreResult, sinceMs: number): void {
  dim(ctx);
  const p = RESULT_PANEL;
  ctx.fillStyle = '#1f2330';
  roundRect(ctx, p.x, p.y, p.w, p.h, 14);
  ctx.fill();
  const cx = p.x + p.w / 2;

  // 星: 1つずつ順に現れる
  for (let i = 0; i < 3; i++) {
    const appear = Math.max(0, Math.min(1, (sinceMs - 250 - i * 300) / 250));
    const filled = sc.stars > i && appear > 0;
    const scale = filled ? 0.6 + 0.4 * appear + 0.15 * Math.sin(Math.PI * appear) : 1;
    iconStar(ctx, cx + (i - 1) * 84, p.y + 70 + (i === 1 ? -10 : 0), 32 * scale, filled);
  }
  drawNumber(ctx, String(sc.score), cx, p.y + 170, 52, '#ffd34d');

  const y = p.y + 225;
  const cols = [cx - 140, cx, cx + 140];
  iconCheck(ctx, cols[0]! - 30, y, 14);
  drawNumber(ctx, String(sc.delivered), cols[0]! + 4, y + 9, 26, '#ffffff', 'left');
  iconCross(ctx, cols[1]! - 30, y, 14);
  drawNumber(ctx, String(sc.missed), cols[1]! + 4, y + 9, 26, '#ffffff', 'left');
  iconClock(ctx, cols[2]! - 30, y, 15);
  drawNumber(ctx, sc.avgWaitSec.toFixed(1), cols[2]! + 4, y + 9, 26, '#ffffff', 'left');

  const b = RETRY_BUTTON;
  fillCircle(ctx, b.x + b.w / 2, b.y + b.h / 2, b.w / 2, '#4f7ff0');
  iconRetry(ctx, b.x + b.w / 2, b.y + b.h / 2, b.w / 2);
}
