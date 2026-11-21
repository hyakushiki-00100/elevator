import { UNITS_PER_FLOOR } from '../sim/building.ts';
import { WALK_TICKS } from '../sim/passenger.ts';
import { STORY_LOOP_MS, storyAt } from './story.ts';
import { BRANCH_FREEZE, type Branch, type Preview } from '../ui/preview.ts';
import type { Elevator } from '../sim/elevator.ts';
import type { Passenger } from '../sim/passenger.ts';
import type { ScoreResult } from '../sim/score.ts';
import type { SimState } from '../sim/sim.ts';
import type { CardId } from '../sim/rules.ts';
import {
  BUILDING_RIGHT, EDITOR_PANEL, EDITOR_PLAY, LOGICAL_H, LOGICAL_W, PANEL_W, PANEL_X, RESULT_PANEL,
  MUTE_BUTTON, RETRY_BUTTON, SHARE_EXPORT_BUTTON, SHARE_IMPORT_BUTTON, CARD_H, CARD_W, START_BUTTON, START_DEMO, RESET_BUTTON, RESET_NO, RESET_PANEL, RESET_YES, carHeight, carTop, floorTop, handRect, rowButtonRect, slotRect, stageTabRect,
  EDITOR_PREVIEW, type Layout, type Rect, type View,
} from './layout.ts';
import { CARD_LOOP_MS, drawCard, drawEmptySlot } from './cards.ts';
import { theme } from './theme.ts';
import {
  drawBuildingIcon, drawCarIcon, iconTrash, drawNumber, drawPointer, fillCircle, iconShare, iconSpeaker, iconCalendar, iconCheck, iconClock, iconCross, iconFinger, iconPhase, iconPlay, iconRetry, iconStar, roundRect,
} from './icons.ts';

// 描画は sim の状態を読むだけで、書き換えない。乱数も使わない。

/** 階ごとの色(行き先を色でも区別できるように) */
export const floorColor = (f: number): string => {
  const c = theme().floorColors;
  return c[f % c.length]!;
};

const T = theme;

/** エレベーターごとの色(1号機 水色・2号機 桃色…)。ビルのかごと編集画面の行の頭で同じ色を使い、対応を見せる */
export const ELEVATOR_COLORS = ['#4fc3f7', '#f06292', '#aed581', '#ba68c8'];
export const elevatorColor = (i: number): string => ELEVATOR_COLORS[i % ELEVATOR_COLORS.length]!;

/** 演出(sim の出来事やタップから作る。sim には影響しない) */
export interface Effect {
  type: 'delivered' | 'missed' | 'tap';
  floor: number;
  elevator: number;
  /** 発生時刻(performance.now) */
  t0: number;
  /** タップの波紋の位置(論理座標。type が tap のとき) */
  x?: number;
  y?: number;
}

export type Mode = 'ready' | 'playing' | 'result';

/** 1日の終わりの正式な結果 */
export interface DayResult {
  /** 正式な点と星 */
  score: number;
  stars: 0 | 1 | 2 | 3;
  /** rated: カードだけで動かした日(複数日の平均) / manual: 手動を使った日(その日の点) */
  basis: 'rated' | 'manual';
  /** 平均を取った日数(rated のとき) */
  days: number;
  /** 画面で見た日の点 */
  dayScore: number;
}

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
  /** 編集画面用: 手持ちのカード・枠の数・編集中のルール・選択中の行 */
  unlocked: readonly CardId[];
  slotCount: number;
  /** 枠の並び(空いた枠は null。枠の位置は固定) */
  editRules: readonly (readonly (CardId | null)[])[];
  editRow: number;
  /** この日に手に入れたカード(結果画面に出す) */
  newCards: readonly CardId[];
  /** 1日の終わりの正式な結果(結果画面のときだけ) */
  result: DayResult | null;
  /** 音を消しているか(消音ボタンの絵) */
  muted: boolean;
  /** 音が鳴らせる状態か(準備を試したのに鳴らせないとき false。消音ボタンに黄色の点を出す) */
  audioOk: boolean;
  /** 編集画面: 持ち上げているカード(手持ちの何番目か。枠から持ち上げたときは null) */
  drag: {
    card: CardId;
    x: number; y: number;
    from: { kind: 'hand'; index: number } | { kind: 'slot'; row: number; slot: number };
    /** 今離したら置かれる枠(枠の上でなければ null) */
    target: { row: number; slot: number } | null;
  } | null;
  /** 編集画面: 大きく再生するカード */
  previewCard: CardId | null;
  /** 編集画面: 本物のビルで試しに動かしているもの(なければ null) */
  simPreview: Preview | null;
  /** 編集画面: 初回の手本(指)をどこに出すか */
  editorHint: { hand: number; row: number; slot: number } | null;
  /** 各ステージの形(階の数・エレベーターの本数): ステージの選択ボタンの絵に使う */
  stageShapes: readonly { floors: number; elevators: number }[];
  /** 編集画面のステージ選択: 開いているステージ数・選択中・各ステージの最高の星 */
  stagesOpen: number;
  stageIdx: number;
  bestStars: readonly number[];
  /** 進行状況を消す前の確かめの窓を出しているか */
  confirmReset: boolean;
  /** 1日目の最初の数回: 待っている人の階を指で示す */
  playHint: boolean;
  /** performance.now() 相当(点滅などの演出用。simには影響しない) */
  now: number;
}

export function draw(a: DrawArgs): void {
  const { ctx, view, layout: l, state: s } = a;
  ctx.setTransform(a.dpr, 0, 0, a.dpr, 0, 0);
  ctx.fillStyle = T().bg;
  ctx.fillRect(0, 0, a.cssW, a.cssH);
  ctx.setTransform(a.dpr * view.scale, 0, 0, a.dpr * view.scale, a.dpr * view.offsetX, a.dpr * view.offsetY);
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, 0, LOGICAL_W, LOGICAL_H);
  ctx.clip();
  ctx.fillStyle = T().bg;
  ctx.fillRect(0, 0, LOGICAL_W, LOGICAL_H);

  drawBuilding(ctx, l, s, a.now);
  const multi = s.elevators.length > 1;
  // 2基以上: 選んでいるエレベーターの通り道(シャフト)を、そのエレベーターの色で縦いっぱいに光らせる
  if (multi && a.selected !== null && a.mode === 'playing') drawSelectedShaft(ctx, l, a.selected, a.now);
  drawQueuesWalking(ctx, l, s, a.now);
  s.elevators.forEach((e, i) => {
    const prev = a.prevPos[i] ?? e.pos;
    const pos = prev + (e.pos - prev) * a.alpha;
    // 選んでいないかごは少し暗く(選んでいるかごを目立たせる)
    const dimmed = multi && a.selected !== null && a.selected !== i && a.mode === 'playing';
    if (dimmed) ctx.globalAlpha = 0.55;
    drawElevator(ctx, l, s, e, pos, a.selected === i, a.now, multi && a.selected === null && a.mode === 'playing');
    ctx.globalAlpha = 1;
  });
  drawEffects(ctx, l, a.effects, a.now);
  if (a.mode === 'playing' && a.playHint) drawPlayHint(ctx, l, s, a.now);
  drawPanel(ctx, s, a.score, a.starThresholds, a.now);

  if (a.mode === 'ready') {
    if (a.unlocked.length === 0) drawStart(ctx, a.now);
    else drawEditor(ctx, a);
    if (a.confirmReset) drawResetConfirm(ctx);
  }
  if (a.mode === 'result' && a.result) drawResult(ctx, a.score, a.result, a.now - a.modeSince, a.newCards);
  // 消音ボタン(どの画面でも一番上に)
  const mb = MUTE_BUTTON;
  ctx.fillStyle = T().button;
  roundRect(ctx, mb.x, mb.y, mb.w, mb.h, 6);
  ctx.fill();
  iconSpeaker(ctx, mb.x + mb.w / 2, mb.y + mb.h / 2, mb.w * 0.36, a.muted);
  if (!a.muted && !a.audioOk) fillCircle(ctx, mb.x + mb.w - 5, mb.y + 5, 5, '#f5c542');
  drawTapRipples(ctx, a.effects, a.now);
  ctx.restore();

  // 縦長の画面では、上の余白に「横向きにして」の図を出す(文字は使わない。操作は妨げない)
  if (a.cssH > a.cssW) drawRotateHint(ctx, a);
}

/** 縦長の画面のとき、上の余白に「スマホを横向きに回す」動きの図を描く */
function drawRotateHint(ctx: CanvasRenderingContext2D, a: DrawArgs): void {
  const space = a.view.offsetY; // ゲームの上の余白(css px)
  if (space < 48) return;
  const size = Math.min(space * 0.7, a.cssW * 0.4, 140);
  const cx = a.cssW / 2;
  const cy = space / 2;
  ctx.setTransform(a.dpr, 0, 0, a.dpr, 0, 0);
  // 0→90度に回って少し止まる、を繰り返す
  const period = 2400;
  const t = (a.now % period) / period;
  const turn = t < 0.15 ? 0 : t < 0.55 ? (t - 0.15) / 0.4 : 1;
  const ease = turn * turn * (3 - 2 * turn);
  const angle = (-Math.PI / 2) * ease;
  const w = size * 0.42, h = size * 0.72;
  ctx.save();
  ctx.translate(cx, cy);
  // 回転の矢印(弧+矢じり)
  ctx.strokeStyle = 'rgba(255,255,255,0.55)';
  ctx.lineWidth = Math.max(2, size * 0.035);
  ctx.lineCap = 'round';
  const r = size * 0.5;
  const a0 = -Math.PI * 0.15, a1 = -Math.PI * 0.75;
  ctx.beginPath();
  ctx.arc(0, 0, r, a0, a1, true);
  ctx.stroke();
  const ex = Math.cos(a1) * r, ey = Math.sin(a1) * r;
  const tx = Math.sin(a1), ty = -Math.cos(a1); // 反時計回りの進む向き
  const k = size * 0.09;
  ctx.fillStyle = 'rgba(255,255,255,0.55)';
  ctx.beginPath();
  ctx.moveTo(ex + tx * k * 1.2, ey + ty * k * 1.2);
  ctx.lineTo(ex + Math.cos(a1) * k, ey + Math.sin(a1) * k);
  ctx.lineTo(ex - Math.cos(a1) * k, ey - Math.sin(a1) * k);
  ctx.closePath();
  ctx.fill();
  // スマホ本体(角の丸い長方形)と画面
  ctx.rotate(angle);
  ctx.fillStyle = '#d7dbe6';
  roundRect(ctx, -w / 2, -h / 2, w, h, w * 0.18);
  ctx.fill();
  ctx.fillStyle = '#2b3042';
  roundRect(ctx, -w / 2 + w * 0.1, -h / 2 + h * 0.1, w * 0.8, h * 0.8, w * 0.08);
  ctx.fill();
  ctx.restore();
}

function drawBuilding(ctx: CanvasRenderingContext2D, l: Layout, s: SimState, now: number): void {
  const waitingAt = new Set<number>();
  for (const p of s.passengers) if (p.state === 'waiting') waitingAt.add(p.origin);
  const targets = new Set<number>();
  for (const e of s.elevators) if (e.manualTarget !== null) targets.add(e.manualTarget);

  for (let f = 0; f < l.floors; f++) {
    const y = floorTop(l, f);
    const band = f % 2 === 0 ? T().bandA : T().bandB;
    ctx.fillStyle = T().metal ? metalGradient(ctx, 0, y, 0, l.floorH, band, true) : band;
    ctx.fillRect(0, y, BUILDING_RIGHT, l.floorH);
    // 階の色の帯と番号
    ctx.fillStyle = floorColor(f);
    ctx.fillRect(0, y, 8, l.floorH);
    const numColor = T().floorNumber ?? floorColor(f);
    if (T().glow > 0) { ctx.shadowColor = numColor; ctx.shadowBlur = T().glow; }
    drawNumber(ctx, String(f + 1), 26, y + l.floorH - 14, 18, numColor);
    ctx.shadowBlur = 0;
    // 床の線
    ctx.fillStyle = T().floorLine;
    ctx.fillRect(8, y + l.floorH - 2, BUILDING_RIGHT - 8, 2);
    // 呼び出しランプ
    if (waitingAt.has(f)) fillCircle(ctx, l.queueRight + 8, y + 16, 5, '#ffd34d');
    // 手動指示の目的階(点滅する枠)
    if (targets.has(f)) {
      const pulse = 0.5 + 0.5 * Math.sin(now / 160);
      ctx.strokeStyle = `rgba(${T().highlightRgb},${(0.35 + 0.45 * pulse).toFixed(3)})`;
      ctx.lineWidth = 2;
      ctx.strokeRect(10, y + 2, BUILDING_RIGHT - 12, l.floorH - 4);
    }
  }
  for (const x of l.shaftX) {
    ctx.fillStyle = T().shaft;
    ctx.fillRect(x, l.top, l.shaftW, l.floors * l.floorH);
  }
}

/** 待ち行列。種類ごとに幅の違う「枠」を取り、先頭(id が小さい人)がシャフトに一番近い */
const SLOT_WIDTH = { normal: 1, rushed: 1, group: 2.2, luggage: 1.6 } as const;


/**
 * 見本: 各階の左端にドアを描き、待っている人を「人の形」で描く。新しく来た人はドアから出て、行列の最後尾まで歩く。
 * a: 見た目だけ歩く(sim では現れた瞬間から待っている) / b: sim でも着くまで待つ(spawnTick が着く時刻)。
 */
function drawQueuesWalking(ctx: CanvasRenderingContext2D, l: Layout, s: SimState, now: number): void {
  const W = WALK_TICKS;
  const byFloor: Passenger[][] = Array.from({ length: l.floors }, () => []);
  for (const p of s.passengers) if (p.state === 'waiting') byFloor[p.origin]!.push(p);
  const doorX = 12;
  const doorW = 24;
  const avail = l.queueRight - l.queueLeft;
  for (let f = 0; f < l.floors; f++) {
    const top = floorTop(l, f);
    const baseY = top + l.floorH - 2;
    const q = byFloor[f]!;
    // 歩いている人の進み具合(0=ドア 1=行列)
    const progress = (p: Passenger): number => {
      const t = 1 - (p.spawnTick - s.tick) / W;
      return Math.max(0, Math.min(1, t));
    };
    // ドア: 誰かが出てきたばかりなら開いている
    const doorH = Math.min(l.floorH - 10, 60);
    const dy = baseY - doorH;
    let open = 0;
    for (const p of q) {
      const t = progress(p);
      if (t < 1) open = Math.max(open, t < 0.25 ? t / 0.25 : t < 0.6 ? 1 : 1 - (t - 0.6) / 0.4);
    }
    ctx.fillStyle = T().shaft;
    ctx.fillRect(doorX, dy, doorW, doorH);
    ctx.fillStyle = T().door;
    ctx.fillRect(doorX, dy, doorW * (1 - open * 0.85), doorH);
    ctx.strokeStyle = T().floorLine;
    ctx.lineWidth = 2;
    ctx.strokeRect(doorX, dy, doorW, doorH);
    if (q.length === 0) continue;
    let slots = 0;
    for (const p of q) slots += SLOT_WIDTH[p.kind];
    const unit = Math.min(l.floorH * 0.42, avail / slots);
    const maxR = l.floorH * 0.15;
    let x = l.queueRight;
    for (const p of q) {
      const w = SLOT_WIDTH[p.kind] * unit;
      x -= w;
      const slotX = x + w / 2;
      const t = progress(p);
      const startX = doorX + doorW / 2;
      const px = startX + (slotX - startX) * t;
      const walking = t < 1;
      const arrived = s.tick - p.spawnTick;
      const remain = Math.max(0, 1 - Math.max(0, arrived) / p.patience);
      drawPerson(ctx, p, px, baseY, unit, walking ? 1 : remain, maxR, walking ? now : null);
    }
  }
}

/** 人の形(頭と胴)。行き先の色。種類: 急ぎ=前かがみ+線 / 団体=3人 / 荷物持ち=かばん。足元の棒が我慢の残り */
function drawPerson(
  ctx: CanvasRenderingContext2D, p: Passenger, cx: number, footY: number, unit: number, remain: number, maxR: number, walkNow: number | null,
): void {
  const r = Math.max(4, Math.min(maxR, unit * 0.38));
  const color = floorColor(p.dest);
  const bob = walkNow !== null ? Math.abs(Math.sin(walkNow / 150)) * 2 : 0;
  const shake = remain < 0.25 && walkNow === null ? Math.sin(remain * 400) * 1.5 : 0;
  const one = (x: number, scale: number, lean: number): void => {
    const hr = r * 0.55 * scale;
    const bw = r * 1.25 * scale;
    const bh = r * 1.35 * scale;
    const by = footY - 6 - bh - bob;
    ctx.save();
    ctx.translate(x + shake, footY - 6);
    ctx.rotate(lean);
    ctx.translate(-(x + shake), -(footY - 6));
    ctx.fillStyle = color;
    roundRect(ctx, x + shake - bw / 2, by, bw, bh, bw * 0.35);
    ctx.fill();
    fillCircle(ctx, x + shake, by - hr - 1.5, hr, color);
    ctx.restore();
  };
  if (p.kind === 'group') {
    one(cx - r * 1.1, 0.8, 0);
    one(cx + r * 1.1, 0.8, 0);
    one(cx, 0.9, 0);
  } else if (p.kind === 'rushed') {
    one(cx, 1, 0.25);
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (const k of [0, 1]) {
      const yy = footY - 6 - r * (0.6 + k * 0.6) - bob;
      ctx.moveTo(cx - r * 1.4, yy); ctx.lineTo(cx - r * 0.9, yy);
    }
    ctx.stroke();
  } else if (p.kind === 'luggage') {
    // 荷物持ち: 人の横に、伸ばした取っ手と車輪の付いた大きなスーツケース(2026-11-21「荷物のアイコンが分かりにくい」)
    one(cx - r * 0.55, 1, 0);
    const sw = r * 1.15;
    const sh = r * 1.5;
    const sx = cx + r * 0.25;
    const sy = footY - 6 - sh - 2;
    ctx.strokeStyle = '#e8d6b0';
    ctx.lineWidth = Math.max(1.5, r * 0.14);
    ctx.beginPath();
    ctx.moveTo(sx + sw * 0.3, sy); ctx.lineTo(sx + sw * 0.3, sy - r * 0.7);
    ctx.lineTo(sx + sw * 0.7, sy - r * 0.7); ctx.lineTo(sx + sw * 0.7, sy);
    ctx.stroke();
    ctx.fillStyle = '#c9a26b';
    roundRect(ctx, sx, sy, sw, sh, r * 0.2);
    ctx.fill();
    ctx.strokeStyle = '#6b4f2a';
    ctx.lineWidth = Math.max(1, r * 0.1);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(sx + sw * 0.15, sy + sh * 0.35); ctx.lineTo(sx + sw * 0.85, sy + sh * 0.35);
    ctx.moveTo(sx + sw * 0.15, sy + sh * 0.65); ctx.lineTo(sx + sw * 0.85, sy + sh * 0.65);
    ctx.stroke();
    fillCircle(ctx, sx + sw * 0.25, sy + sh + 1.5, Math.max(1.5, r * 0.16), '#333');
    fillCircle(ctx, sx + sw * 0.75, sy + sh + 1.5, Math.max(1.5, r * 0.16), '#333');
  } else {
    one(cx, 1, 0);
  }
  // 我慢の残り: 足元の短い棒(緑→赤)。歩いている間は出さない
  if (walkNow === null) {
    const bw = r * 1.8;
    ctx.fillStyle = 'rgba(255,255,255,0.15)';
    ctx.fillRect(cx - bw / 2, footY - 4, bw, 3);
    ctx.fillStyle = `hsl(${(120 * remain).toFixed(0)} 85% 55%)`;
    ctx.fillRect(cx - bw / 2, footY - 4, bw * remain, 3);
  }
  const headTop = footY - 6 - r * 1.35 - r * 1.1 - 3 - bob;
  drawNumber(ctx, String(p.dest + 1), cx, headTop - 3, Math.max(12, Math.round(r * 1.5)), T().text);
}


function drawElevator(
  ctx: CanvasRenderingContext2D, l: Layout, s: SimState, e: Elevator, pos: number, selected: boolean,
  now = 0, invite = false,
): void {
  const x = l.shaftX[e.id]!;
  const y = carTop(l, pos);
  const h = carHeight(l);
  const w = l.shaftW;

  // 行き先: 移動中は、止まる予定の階にかごの形の点線を描く(どこへ向かっているかが見えるように)
  if (e.phase === 'moving') {
    const ty = carTop(l, e.target * UNITS_PER_FLOOR);
    ctx.save();
    ctx.setLineDash([6, 5]);
    ctx.strokeStyle = elevatorColor(e.id);
    ctx.globalAlpha = 0.85;
    ctx.lineWidth = 2.5;
    roundRect(ctx, x + 3, ty + 1, w - 6, h - 2, 6);
    ctx.stroke();
    ctx.restore();
  }

  ctx.fillStyle = T().metal ? metalGradient(ctx, x, y, w, h, T().carBody) : T().carBody;
  roundRect(ctx, x + 1, y, w - 2, h, 6);
  ctx.fill();
  // そのエレベーターの色の縁(編集画面の行の頭のかごと同じ色)
  ctx.strokeStyle = elevatorColor(e.id);
  ctx.lineWidth = 3;
  roundRect(ctx, x + 2.5, y + 1.5, w - 5, h - 3, 5);
  ctx.stroke();
  ctx.fillStyle = T().carInner;
  roundRect(ctx, x + 5, y + 5, w - 10, h - 10, 4);
  ctx.fill();
  if (selected && s.elevators.length > 1) {
    // 選んでいるかご: 白い太い縁と、そのエレベーターの色の光(ゆっくり脈打つ)
    ctx.save();
    ctx.shadowColor = elevatorColor(e.id);
    ctx.shadowBlur = 14 + 6 * Math.sin(now / 200);
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 4;
    roundRect(ctx, x - 3, y - 3, w + 6, h + 6, 8);
    ctx.stroke();
    ctx.restore();
  } else if (invite) {
    // まだどちらも選んでいない: 両方のかごの縁を点滅させて「まずかごを選ぶ」と示す
    if (Math.floor(now / 450) % 2 === 0) {
      ctx.strokeStyle = elevatorColor(e.id);
      ctx.lineWidth = 3;
      roundRect(ctx, x - 3, y - 3, w + 6, h + 6, 8);
      ctx.stroke();
    }
  }

  // 乗客(1人分につき1つの丸。数字は先頭のみ)
  const riders = s.passengers.filter((p) => p.state === 'riding' && p.elevatorId === e.id);
  const cols = 4;
  const pitch = (w - 14) / cols;
  const r = Math.min(9, pitch * 0.42, (h - 30) / 4.6);
  let n = 0;
  for (const p of riders) {
    for (let k = 0; k < p.size; k++) {
      const col = n % cols;
      const row = Math.floor(n / cols);
      const cx = x + 7 + pitch * (col + 0.5);
      const cy = y + h - 7 - r - row * (r * 2 + 3);
      fillCircle(ctx, cx, cy, r, floorColor(p.dest));
      // 次に止まる階で降りる人は白い輪で示す(なぜその階へ向かうのかが見えるように)
      if (e.phase === 'moving' && p.dest === e.target) {
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(cx, cy, r + 2, 0, Math.PI * 2);
        ctx.stroke();
      }
      if (k === 0) drawNumber(ctx, String(p.dest + 1), cx, cy + r * 0.45, Math.round(r * 1.35), '#0b0d12');
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
  ctx.fillStyle = T().door;
  ctx.fillRect(x + 5, y + 20, half * (1 - open), h - 25);
  ctx.fillRect(x + 5 + half + half * open, y + 20, half * (1 - open), h - 25);

  // 進行方向の矢印
  if (e.dir !== 0) {
    ctx.fillStyle = T().text;
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

/** 選んでいるエレベーターのシャフトを、その色で縦いっぱいに塗り、両側に線を引く */
function drawSelectedShaft(ctx: CanvasRenderingContext2D, l: Layout, idx: number, now: number): void {
  const x = l.shaftX[idx];
  if (x === undefined) return;
  const color = elevatorColor(idx);
  const top = l.top;
  const h = l.floors * l.floorH;
  ctx.save();
  ctx.fillStyle = color;
  ctx.globalAlpha = 0.16 + 0.04 * Math.sin(now / 300);
  ctx.fillRect(x, top, l.shaftW, h);
  ctx.globalAlpha = 0.9;
  ctx.fillRect(x - 3, top, 3, h);
  ctx.fillRect(x + l.shaftW, top, 3, h);
  ctx.restore();
}

/** 扉の開き具合 0〜1 */
export function doorOpen(e: Elevator, doorTicks: number): number {
  if (e.phase !== 'open') return 0;
  const ramp = 8;
  const opening = (doorTicks - e.timer) / ramp;
  const closing = e.timer / ramp;
  return Math.max(0, Math.min(1, opening, closing));
}

/**
 * 金属の質感(テーマ metal): 横向き(既定)は筋のある明暗、vertical は上が明るく下が暗い面。
 * w=0 で vertical のときは y〜y+h の縦のグラデーション
 */
function metalGradient(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, base: string, vertical = false): CanvasGradient {
  const k = T().metalStrength;
  const g = vertical ? ctx.createLinearGradient(0, y, 0, y + h) : ctx.createLinearGradient(x, y, x + w, y);
  if (vertical) {
    g.addColorStop(0, shade(base, 18 * k));
    g.addColorStop(1, shade(base, -10 * k));
  } else {
    g.addColorStop(0, shade(base, -14 * k));
    g.addColorStop(0.35, shade(base, 16 * k));
    g.addColorStop(0.5, shade(base, 4 * k));
    g.addColorStop(0.7, shade(base, 14 * k));
    g.addColorStop(1, shade(base, -14 * k));
  }
  return g;
}

/** #rrggbb を明るく(+)・暗く(−)する */
function shade(hex: string, amt: number): string {
  const n = parseInt(hex.slice(1), 16);
  const c = (v: number): number => Math.max(0, Math.min(255, v + amt));
  return `rgb(${c((n >> 16) & 255)},${c((n >> 8) & 255)},${c(n & 255)})`;
}

export const EFFECT_MS = 900;
const RIPPLE_MS = 350;

/** タップした場所の波紋(押したことが目で分かるように) */
function drawTapRipples(ctx: CanvasRenderingContext2D, effects: readonly Effect[], now: number): void {
  for (const ef of effects) {
    if (ef.type !== 'tap' || ef.x === undefined || ef.y === undefined) continue;
    const t = (now - ef.t0) / RIPPLE_MS;
    if (t < 0 || t > 1) continue;
    ctx.strokeStyle = `rgba(${T().highlightRgb},${(0.7 * (1 - t)).toFixed(3)})`;
    ctx.lineWidth = 3 * (1 - t) + 1;
    ctx.beginPath();
    ctx.arc(ef.x, ef.y, 8 + 26 * t, 0, Math.PI * 2);
    ctx.stroke();
  }
}

function drawEffects(ctx: CanvasRenderingContext2D, l: Layout, effects: readonly Effect[], now: number): void {
  for (const ef of effects) {
    const t = (now - ef.t0) / EFFECT_MS;
    if (t < 0 || t > 1) continue;
    const y = floorTop(l, ef.floor) + l.floorH / 2 - t * 24;
    const alpha = 1 - t;
    if (ef.type === 'tap') continue;
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
  ctx.fillStyle = T().metal ? metalGradient(ctx, PANEL_X, 16, PANEL_W, LOGICAL_H - 32, T().panelBg) : T().panelBg;
  roundRect(ctx, PANEL_X, 16, PANEL_W, LOGICAL_H - 32, 10);
  ctx.fill();

  // 1日の進み具合: 時間帯ごとに色分けした帯と、今の位置
  const bx = PANEL_X + 20;
  const bw = PANEL_W - 40;
  const by = 74;
  const phases = s.config.traffic.phases;
  const colors = T().phaseColors;
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
  ctx.fillStyle = T().text;
  ctx.fillRect(mx - 1.5, by - 4, 3, 20);
  if (s.tick >= s.dayTicks && !s.finished) {
    // 延長中: 月が点滅
    if (Math.floor(now / 400) % 2 === 0) iconPhase(ctx, -1, bx + bw + 4, by + 6, 10);
  }

  // 数字の行: 運んだ / 取りこぼし / 平均待ち時間(横に3つ並べ、下のカードに場所を空ける)
  const colW = PANEL_W / 3;
  const statIcon = 110;
  const statNum = 152;
  const stats = [String(sc.delivered), String(sc.missed), sc.avgWaitSec.toFixed(1)];
  stats.forEach((v, i) => {
    const cx = PANEL_X + colW * (i + 0.5);
    if (i === 0) iconCheck(ctx, cx, statIcon, 12);
    else if (i === 1) iconCross(ctx, cx, statIcon, 12);
    else iconClock(ctx, cx, statIcon, 13);
    drawNumber(ctx, v, cx, statNum, 24, T().text);
  });

  // 点数と星(閾値に届いた星が光る)
  ctx.fillStyle = T().floorLine;
  ctx.fillRect(PANEL_X + 20, 168, PANEL_W - 40, 2);
  if (T().glow > 0) { ctx.shadowColor = T().accent; ctx.shadowBlur = T().glow; }
  drawNumber(ctx, String(sc.score), PANEL_X + PANEL_W / 2, 214, 36, T().accent);
  ctx.shadowBlur = 0;
  for (let i = 0; i < 3; i++) {
    iconStar(ctx, PANEL_X + PANEL_W / 2 + (i - 1) * 40, 246, 15, sc.score >= th[i]!);
  }

  // 運行ルールの枠(今動きを決めているカードを枠で示し、切り替わった瞬間に1回だけ光らせる)。
  // 星の下からパネルの下端までに、エレベーターの数だけ段を収める
  const rowsTop = 274;
  const rowsBottom = LOGICAL_H - 16 - 10;
  const ruled = s.elevators.filter((e) => e.rules.length > 0);
  const rowCount = ruled.length;
  if (rowCount === 0) return;
  const gap = 8;
  const multi = s.elevators.length > 1;
  const headW = multi ? 30 : 0;
  const maxCards = Math.max(...ruled.map((e) => e.rules.length));
  const availW = PANEL_W - 24 - headW;
  const cwByWidth = (availW - (maxCards - 1) * gap) / maxCards;
  const chByHeight = (rowsBottom - rowsTop - (rowCount - 1) * gap) / rowCount;
  const ch = Math.min(chByHeight, cwByWidth * (47 / 36), 150);
  const cw = ch * (36 / 47);
  let ry = rowsTop;
  for (const e of ruled) {
    const total = e.rules.length * cw + (e.rules.length - 1) * gap;
    const x0 = PANEL_X + headW + (PANEL_W - headW) / 2 - total / 2;
    e.rules.forEach((c, i) => drawCard(ctx, c, x0 + i * (cw + gap), ry, cw, ch, { active: e.ruleIndex === i }));
    // 切り替わった瞬間の光(エレベーターの色で、0.4秒で消える)
    const f = ruleFlash(e.id, e.ruleIndex, e.target, now);
    if (f > 0 && e.ruleIndex >= 0) {
      const cx = x0 + e.ruleIndex * (cw + gap);
      ctx.save();
      ctx.globalAlpha = f;
      ctx.shadowColor = elevatorColor(e.id);
      ctx.shadowBlur = 24;
      ctx.strokeStyle = elevatorColor(e.id);
      ctx.lineWidth = 4 + 4 * f;
      const grow = (1 - f) * 6;
      roundRect(ctx, cx - grow, ry - grow, cw + grow * 2, ch + grow * 2, 8);
      ctx.stroke();
      ctx.restore();
    }
    // 2基以上なら、行の左にそのエレベーターの色のかご(編集画面と同じ)
    if (multi) drawCarIcon(ctx, PANEL_X + 10, ry + ch / 2 - 14, 20, 28, elevatorColor(e.id));
    ry += ch + gap;
  }
}

/**
 * カードが新しい行き先を決めた時刻(描画だけの記録。sim には影響しない)。
 * 「どの枠か」だけで判定すると、カードが1枚の行では1日に数回しか光らないため、
 * 「どの枠か+行き先」が変わったときに光らせる(1基あたり約3秒に1回。2026-11-20 に sim で数えた)。
 */
const flashState: { key: string; at: number }[] = [];
const FLASH_MS = 400;
/** 光の強さ 1→0 */
function ruleFlash(elevator: number, idx: number, target: number, now: number): number {
  const key = `${idx}:${target}`;
  const st = flashState[elevator];
  if (!st) {
    flashState[elevator] = { key, at: -Infinity };
    return 0;
  }
  if (st.key !== key) {
    st.key = key;
    st.at = idx >= 0 ? now : -Infinity;
  }
  const u = (now - st.at) / FLASH_MS;
  return u >= 0 && u < 1 ? 1 - u : 0;
}

function dim(ctx: CanvasRenderingContext2D): void {
  ctx.fillStyle = T().dim;
  ctx.fillRect(0, 0, LOGICAL_W, LOGICAL_H);
}

function drawStart(ctx: CanvasRenderingContext2D, now: number): void {
  dim(ctx);
  // 左: 遊び方の見本(動く絵)。右: 開始ボタン
  drawStoryboard(ctx, START_DEMO, now);
  const b = START_BUTTON;
  const pulse = 1 + 0.04 * Math.sin(now / 250);
  const cx = b.x + b.w / 2;
  const cy = b.y + b.h / 2;
  fillCircle(ctx, cx, cy, (b.w / 2) * pulse, '#3fbf6a');
  iconPlay(ctx, cx + 4, cy, b.w / 2);
}

function drawStoryboard(ctx: CanvasRenderingContext2D, r: Rect, now: number): void {
  const t = (now % STORY_LOOP_MS) / STORY_LOOP_MS;
  const st = storyAt(t);
  ctx.fillStyle = T().dialogBg;
  roundRect(ctx, r.x, r.y, r.w, r.h, 14);
  ctx.fill();
  const floors = 4;
  const pad = 16;
  const top = r.y + pad;
  const fh = (r.h - pad * 2) / floors;
  const left = r.x + pad;
  const shaftW = 56;
  const shaftX = r.x + r.w - pad - shaftW;
  const fy = (f: number): number => top + (floors - 1 - f) * fh;
  for (let f = 0; f < floors; f++) {
    ctx.fillStyle = f % 2 === 0 ? T().bandA : T().bandB;
    ctx.fillRect(left, fy(f), shaftX - left - 6, fh - 2);
    ctx.fillStyle = floorColor(f);
    ctx.fillRect(left, fy(f), 5, fh - 2);
    drawNumber(ctx, String(f + 1), left + 20, fy(f) + fh / 2, 16, T().text);
  }
  ctx.fillStyle = T().shaft;
  ctx.fillRect(shaftX, top, shaftW, fh * floors);
  // かご
  const carY = top + (floors - 1 - st.carFloor) * fh + 3;
  ctx.fillStyle = T().carBody;
  roundRect(ctx, shaftX + 2, carY, shaftW - 4, fh - 8, 6);
  ctx.fill();
  ctx.strokeStyle = elevatorColor(0);
  ctx.lineWidth = 3;
  ctx.stroke();
  // 人(行き先は1階 = 1階の色)
  const waitX = shaftX - 60;
  const inX = shaftX + shaftW / 2;
  const pr = 10;
  const color = floorColor(0);
  if (st.person !== 'gone') {
    let x: number;
    let y: number;
    if (st.person === 'wait') {
      x = waitX + (inX - waitX) * st.personX;
      y = fy(2) + fh - pr - 10;
    } else if (st.person === 'ride') {
      x = inX;
      y = carY + fh - 8 - pr - 8;
    } else {
      x = inX + (left + 40 - inX) * (1 - st.personX) * 0.9;
      y = fy(0) + fh - pr - 10;
    }
    ctx.globalAlpha = st.person === 'leave' ? Math.max(0, Math.min(1, st.personX + 0.3)) : 1;
    fillCircle(ctx, x, y, pr, color);
    if (st.person === 'wait' && st.personX === 0) {
      ctx.strokeStyle = `hsl(${(120 * st.ring).toFixed(0)} 85% 55%)`;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(x, y, pr + 5, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * st.ring);
      ctx.stroke();
    }
    drawNumber(ctx, '1', x, y - pr - 13, 16, T().text);
    ctx.globalAlpha = 1;
  }
  // 指: 3階の帯をタップ
  if (st.pointer) drawPointer(ctx, left + 110, fy(2) + fh / 2, 52, st.tap);
  // 届けたら緑のチェックと点
  if (st.check > 0) {
    const cx = left + 110;
    const cy = fy(0) + fh / 2 - 6 - 10 * st.check;
    iconCheck(ctx, cx, cy, 16, st.check);
    ctx.globalAlpha = st.check;
    drawNumber(ctx, '100', cx + 52, cy, 18, T().info);
    ctx.globalAlpha = 1;
  }
}

/** 1日目の最初の数回: 待っている人がいる階(一番長く待っている人の階)を指で示す */
function drawPlayHint(ctx: CanvasRenderingContext2D, l: Layout, s: SimState, now: number): void {
  let best: Passenger | null = null;
  for (const p of s.passengers) {
    if (p.state === 'waiting' && p.spawnTick <= s.tick && (best === null || p.spawnTick < best.spawnTick)) best = p;
  }
  if (!best) return;
  const phase = (now % 1200) / 1200;
  const y = floorTop(l, best.origin) + l.floorH * 0.5;
  drawPointer(ctx, Math.max(l.queueLeft + 40, l.queueRight - 190), y, 46, phase > 0.5 && phase < 0.75);
}

function drawEditor(ctx: CanvasRenderingContext2D, a: DrawArgs): void {
  dim(ctx);
  const p = EDITOR_PANEL;
  ctx.fillStyle = T().dialogBg;
  roundRect(ctx, p.x, p.y, p.w, p.h, 14);
  ctx.fill();
  const loopT = (a.now / CARD_LOOP_MS) % 1;
  const rows = a.editRules.length;

  for (let r = 0; r < rows; r++) {
    const rules = a.editRules[r]!;
    const color = elevatorColor(r);
    const head = rowButtonRect(r);
    const first = slotRect(r, 0);
    const last = slotRect(r, a.slotCount - 1);
    // 行の帯(そのエレベーターの色をうっすら)。選択中の行は濃く
    ctx.fillStyle = color;
    ctx.globalAlpha = r === a.editRow ? 0.16 : 0.07;
    roundRect(ctx, head.x - 8, first.y - 8, last.x + last.w - head.x + 16, first.h + 22, 10);
    ctx.fill();
    ctx.globalAlpha = 1;
    // 行の頭: そのエレベーターのかご(ビルのかごの縁と同じ色)
    drawCarIcon(ctx, head.x + 8, head.y + 4, head.w - 16, head.h - 8, color);
    if (r === a.editRow && rows > 1) {
      ctx.strokeStyle = color;
      ctx.lineWidth = 3;
      roundRect(ctx, head.x + 2, head.y - 2, head.w - 4, head.h + 4, 9);
      ctx.stroke();
    }
    // 枠
    for (let i = 0; i < a.slotCount; i++) {
      const rc = slotRect(r, i);
      const c = rules[i] ?? null;
      const isOrigin = a.drag !== null && a.drag.from.kind === 'slot' && a.drag.from.row === r && a.drag.from.slot === i;
      if (c && !isOrigin) drawCard(ctx, c, rc.x, rc.y, rc.w, rc.h, { t: loopT });
      else drawEmptySlot(ctx, rc.x, rc.y, rc.w, rc.h);
      // 今離したら置かれる枠を光らせる
      if (a.drag?.target && a.drag.target.row === r && a.drag.target.slot === i) {
        ctx.save();
        ctx.strokeStyle = '#ffffff';
        ctx.shadowColor = '#ffffff';
        ctx.shadowBlur = 14;
        ctx.lineWidth = 3;
        roundRect(ctx, rc.x - 3, rc.y - 3, rc.w + 6, rc.h + 6, 9);
        ctx.stroke();
        ctx.restore();
      }
    }
    // かごから右へ順に流れる光(かごは左のカードから順に確かめる。空いた枠は飛ばす)
    const filled: number[] = [];
    for (let i = 0; i < a.slotCount; i++) if (rules[i]) filled.push(i);
    drawFlow(ctx, head, r, filled, color, a.now);
  }

  // 手持ち。選択中の行に置いてあるカードは薄く。説明を見ているカードは枠で示す
  const placed = a.editRules[a.editRow] ?? [];
  a.unlocked.forEach((c, i) => {
    const rc = handRect(i);
    const picked = a.drag === null && a.previewCard === c;
    drawCard(ctx, c, rc.x, rc.y, rc.w, rc.h, { dim: placed.includes(c), t: loopT, active: picked });
  });

  // 大きな再生の窓
  if (a.simPreview) drawSimPreview(ctx, EDITOR_PREVIEW, a.simPreview, a.now);
  else drawPreview(ctx, EDITOR_PREVIEW, a.previewCard, a.now);

  // ルールの共有(書き出し・読み込み)
  for (const [b, dir] of [[SHARE_EXPORT_BUTTON, 'out'], [SHARE_IMPORT_BUTTON, 'in']] as const) {
    ctx.fillStyle = T().button;
    roundRect(ctx, b.x, b.y, b.w, b.h, 6);
    ctx.fill();
    iconShare(ctx, b.x + b.w / 2, b.y + b.h / 2, b.w * 0.32, dir);
  }

  // ステージの選択(2つ以上開いているとき)。ビルの形の絵(階の数・エレベーターの本数)と、その下に最高の星
  if (a.stagesOpen > 1) {
    for (let i = 0; i < a.stagesOpen; i++) {
      const r = stageTabRect(i);
      const shape = a.stageShapes[i];
      ctx.fillStyle = i === a.stageIdx ? T().buttonActive : T().button;
      roundRect(ctx, r.x, r.y, r.w, r.h, 6);
      ctx.fill();
      if (shape) {
        const fg = i === a.stageIdx ? '#1a1a1a' : T().text;
        drawBuildingIcon(ctx, r.x + 12, r.y + 5, r.w - 24, 30, shape.floors, shape.elevators, ELEVATOR_COLORS, fg);
      }
      for (let k = 0; k < 3; k++) iconStar(ctx, r.x + r.w / 2 + (k - 1) * 13, r.y + 44, 5, (a.bestStars[i] ?? 0) > k);
    }
  }

  // 進行状況を消す(ごみ箱)。押すと確かめの窓が出る
  {
    const rb = RESET_BUTTON;
    ctx.fillStyle = T().button;
    roundRect(ctx, rb.x, rb.y, rb.w, rb.h, 6);
    ctx.fill();
    iconTrash(ctx, rb.x + rb.w / 2, rb.y + rb.h / 2, rb.w * 0.3, T().textDim);
  }

  const b = EDITOR_PLAY;
  const pulse = 1 + 0.04 * Math.sin(a.now / 250);
  fillCircle(ctx, b.x + b.w / 2, b.y + b.h / 2, (b.w / 2) * pulse, '#3fbf6a');
  iconPlay(ctx, b.x + b.w / 2 + 3, b.y + b.h / 2, b.w / 2);

  // 手本: 指が手持ちのカードを押さえ、枠まで引っ張ってみせる(カードの影が一緒に動く)
  if (a.editorHint) {
    const from = handRect(a.editorHint.hand);
    const to = slotRect(a.editorHint.row, a.editorHint.slot);
    const u = (a.now % 2200) / 2200;
    const k = u < 0.2 ? 0 : u < 0.75 ? (u - 0.2) / 0.55 : 1;
    const e = k * k * (3 - 2 * k);
    const x = from.x + (to.x - from.x) * e;
    const y = from.y + (to.y - from.y) * e;
    if (u >= 0.12 && u < 0.85) {
      ctx.save();
      ctx.globalAlpha = 0.5;
      drawCard(ctx, a.unlocked[a.editorHint.hand]!, x, y, from.w, from.h, {});
      ctx.restore();
    }
    drawPointer(ctx, x + from.w * 0.55, y + from.h * 0.55, 46, u >= 0.12 && u < 0.85);
  }

  // 引っ張っているカード(指に付いてくる。一番上に描く)
  if (a.drag) {
    const w = CARD_W * 1.1;
    const h = CARD_H * 1.1;
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.6)';
    ctx.shadowBlur = 16;
    ctx.shadowOffsetY = 6;
    drawCard(ctx, a.drag.card, a.drag.x - w / 2, a.drag.y - h / 2, w, h, { t: loopT, active: true });
    ctx.restore();
  }
}

/** 進行状況を消す前の確かめ: 大きなごみ箱と、手に入れたカード・星が消える絵、「やめる(×)」「消す(✓)」 */
function drawResetConfirm(ctx: CanvasRenderingContext2D): void {
  dim(ctx);
  const p = RESET_PANEL;
  ctx.fillStyle = T().dialogBg;
  roundRect(ctx, p.x, p.y, p.w, p.h, 14);
  ctx.fill();
  ctx.strokeStyle = '#e5484d';
  ctx.lineWidth = 3;
  ctx.stroke();
  // 星とカード → ごみ箱
  iconStar(ctx, p.x + 70, p.y + 70, 18, true);
  ctx.fillStyle = '#249e91';
  roundRect(ctx, p.x + 100, p.y + 48, 32, 44, 5);
  ctx.fill();
  ctx.fillStyle = T().text;
  ctx.fillRect(p.x + 150, p.y + 68, 40, 4);
  ctx.beginPath();
  ctx.moveTo(p.x + 200, p.y + 70); ctx.lineTo(p.x + 188, p.y + 62); ctx.lineTo(p.x + 188, p.y + 78);
  ctx.closePath();
  ctx.fill();
  iconTrash(ctx, p.x + 240, p.y + 72, 26, '#e5484d');
  for (const [r, yes] of [[RESET_NO, false], [RESET_YES, true]] as const) {
    ctx.fillStyle = T().button;
    roundRect(ctx, r.x, r.y, r.w, r.h, 10);
    ctx.fill();
    if (yes) iconCheck(ctx, r.x + r.w / 2, r.y + r.h / 2, r.w * 0.32);
    else iconCross(ctx, r.x + r.w / 2, r.y + r.h / 2, r.w * 0.32);
  }
}

/** かごから右のカードへ、順に流れる光の粒(カードを左から順に確かめることを見せる) */
function drawFlow(ctx: CanvasRenderingContext2D, head: Rect, row: number, filled: readonly number[], color: string, now: number): void {
  const stops = [head.x + head.w - 4];
  for (const i of filled.length > 0 ? filled : [0]) {
    const rc = slotRect(row, i);
    stops.push(rc.x + rc.w / 2);
  }
  const s0 = slotRect(row, 0);
  const y = s0.y + s0.h + 8;
  ctx.strokeStyle = color;
  ctx.globalAlpha = 0.45;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(stops[0]!, y); ctx.lineTo(stops[stops.length - 1]!, y);
  ctx.stroke();
  ctx.globalAlpha = 1;
  // 光の粒: 左から右へ、1枚ずつ少し止まりながら進む
  const per = 700;
  const total = per * (stops.length - 1) + 600;
  const u = now % total;
  const seg = Math.min(stops.length - 2, Math.floor(u / per));
  const f = Math.min(1, (u - seg * per) / (per * 0.6));
  const px = u >= per * (stops.length - 1) ? stops[stops.length - 1]! : stops[seg]! + (stops[seg + 1]! - stops[seg]!) * f;
  ctx.save();
  ctx.shadowColor = color;
  ctx.shadowBlur = 12;
  fillCircle(ctx, px, y, 5, color);
  ctx.restore();
}

/**
 * 試しに動かす窓: 本物のビルを小さく描く。2つあれば左右に並べる(左=今のルール、右=持ち上げたカードを先頭に足したルール)。
 * 各窓の上に、選択中の行のカードの並び、下に「運んだ人数」と「取りこぼし」(見せ始めてからの数)。
 */
function drawSimPreview(ctx: CanvasRenderingContext2D, r: Rect, p: Preview, now: number): void {
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  roundRect(ctx, r.x, r.y, r.w, r.h, 12);
  ctx.fill();
  if (p.branches && p.branches.length > 0) {
    drawBranchView(ctx, r, p, now);
    return;
  }
  const n = p.runs.length;
  const gap = 10;
  const w = (r.w - 16 - gap * (n - 1)) / n;
  p.runs.forEach((run, i) => {
    const x = r.x + 8 + i * (w + gap);
    const y = r.y + 8;
    const h = r.h - 16;
    // 上: その窓のルール(選択中の行)。足したカードは光らせる
    const row = run.rules[p.row] ?? [];
    const cardH = 40;
    const cardW = cardH * (36 / 47);
    const cg = 4;
    const tot = row.length * cardW + Math.max(0, row.length - 1) * cg;
    let cx = x + w / 2 - tot / 2;
    if (row.length === 0) {
      drawEmptySlot(ctx, x + w / 2 - cardW / 2, y, cardW, cardH);
    }
    row.forEach((c) => {
      const isAdded = i === 1 && p.added === c;
      if (isAdded) {
        ctx.save();
        ctx.shadowColor = '#ffffff';
        ctx.shadowBlur = 10 + 6 * Math.sin(now / 200);
      }
      drawCard(ctx, c, cx, y, cardW, cardH, { active: isAdded });
      if (isAdded) ctx.restore();
      cx += cardW + cg;
    });
    // 真ん中: ビル
    const by = y + cardH + 10;
    const bh = h - cardH - 10 - 34;
    drawMiniBuilding(ctx, x, by, w, bh, run.sim);
    // 下: 運んだ人数 / 取りこぼし
    const sy = y + h - 14;
    iconCheck(ctx, x + w * 0.18, sy - 2, 9);
    drawNumber(ctx, String(run.sim.stats.delivered - run.baseDelivered), x + w * 0.45, sy + 6, 20, T().text, 'right');
    iconCross(ctx, x + w * 0.62, sy - 2, 9);
    drawNumber(ctx, String(run.sim.stats.missed - run.baseMissed), x + w * 0.92, sy + 6, 20, T().text, 'right');
  });
  // 2つ並べるときは、間に「→」(今 → 足したら)
  if (n === 2) {
    const mx = r.x + 8 + w + gap / 2;
    const my = r.y + 8 + 20;
    ctx.fillStyle = T().text;
    ctx.beginPath();
    ctx.moveTo(mx + 5, my); ctx.lineTo(mx - 3, my - 6); ctx.lineTo(mx - 3, my + 6);
    ctx.closePath();
    ctx.fill();
  }
}

/** カードの並びを小さく描く(分かれ道の窓の上段)。added は光らせる */
function drawRuleStrip(ctx: CanvasRenderingContext2D, row: readonly CardId[], cx: number, y: number, h: number, added: CardId | null, now: number): void {
  const w = h * (36 / 47);
  const gap = 4;
  const tot = row.length * w + Math.max(0, row.length - 1) * gap;
  if (row.length === 0) {
    drawEmptySlot(ctx, cx - w / 2, y, w, h);
    return;
  }
  let x = cx - tot / 2;
  for (const c of row) {
    const isAdded = added === c;
    if (isAdded) {
      ctx.save();
      ctx.shadowColor = '#ffffff';
      ctx.shadowBlur = 10 + 6 * Math.sin(now / 200);
    }
    drawCard(ctx, c, x, y, w, h, { active: isAdded });
    if (isAdded) ctx.restore();
    x += w + gap;
  }
}

/**
 * 分かれ道の窓: 同じ場面から、今のルール(灰色のかご)と、カードを足したルール(そのエレベーターの色のかご)が
 * それぞれどう動くかを、1つのビルの上で重ねて見せる。止まった階には、それぞれの色の印を残す。
 */
function drawBranchView(ctx: CanvasRenderingContext2D, r: Rect, p: Preview, now: number): void {
  const br = p.branches![p.bIndex]!;
  const e = br.elevator;
  const color = elevatorColor(e);
  const gray = '#9aa0a6';
  // 上段: 今のルール(灰色の印) → 足したルール(エレベーターの色の印)
  const topY = r.y + 10;
  const stripH = 40;
  const leftC = r.x + r.w * 0.27;
  const rightC = r.x + r.w * 0.73;
  drawRuleStrip(ctx, p.sets[0]![p.row] ?? [], leftC, topY, stripH, null, now);
  drawRuleStrip(ctx, p.sets[1]![p.row] ?? [], rightC, topY, stripH, p.added, now);
  ctx.fillStyle = gray;
  ctx.fillRect(leftC - 30, topY + stripH + 5, 60, 4);
  ctx.fillStyle = color;
  ctx.fillRect(rightC - 30, topY + stripH + 5, 60, 4);
  ctx.fillStyle = T().text;
  ctx.beginPath();
  ctx.moveTo(r.x + r.w / 2 + 6, topY + stripH / 2);
  ctx.lineTo(r.x + r.w / 2 - 4, topY + stripH / 2 - 7);
  ctx.lineTo(r.x + r.w / 2 - 4, topY + stripH / 2 + 7);
  ctx.closePath();
  ctx.fill();
  // ビル(人は分かれ道の瞬間のまま止めて描く。動かすのはかごだけ)
  const bx = r.x + 10;
  const by = topY + stripH + 16;
  const bw = r.w - 20;
  const bh = r.h - (by - r.y) - 24;
  const k = Math.max(0, p.bT - BRANCH_FREEZE);
  const posAt = (path: Branch['a']): number => {
    if (k <= 0 || path.pos.length === 0) return br.before.elevators[e]!.pos;
    return path.pos[Math.min(path.pos.length - 1, k - 1)]!;
  };
  drawMiniBuilding(ctx, bx, by, bw, bh, br.before, {
    elevator: e,
    cars: [
      { pos: posAt(br.a), color: gray, alpha: 0.75, offset: -0.18, stops: br.a.stops.filter((_, i) => br.a.stopAt[i]! < k) },
      { pos: posAt(br.b), color, alpha: 1, offset: 0.18, stops: br.b.stops.filter((_, i) => br.b.stopAt[i]! < k) },
    ],
  });
  // 下段: いくつ目の分かれ道か(点)
  const n = p.branches!.length;
  for (let i = 0; i < n; i++) {
    fillCircle(ctx, r.x + r.w / 2 + (i - (n - 1) / 2) * 14, r.y + r.h - 12, 4, i === p.bIndex ? T().text : 'rgba(255,255,255,0.25)');
  }
}

/** 小さなビル(試しに動かす窓用)。階の帯・待っている人(行き先の色の丸)・かご(エレベーターの色)・行き先の点線 */
interface GhostCars {
  /** このエレベーターのかごの代わりに、cars を重ねて描く */
  elevator: number;
  cars: { pos: number; color: string; alpha: number; offset: number; stops: number[] }[];
}

function drawMiniBuilding(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, s: SimState, ghost?: GhostCars): void {
  const floors = s.building.floors;
  const fh = h / floors;
  const ne = s.elevators.length;
  const shaftW = Math.min(ghost ? 60 : 34, (w * 0.42) / ne);
  const shaftX0 = x + w - ne * shaftW - 2;
  const fy = (f: number): number => y + (floors - 1 - f) * fh;
  for (let f = 0; f < floors; f++) {
    ctx.fillStyle = f % 2 === 0 ? T().bandA : T().bandB;
    ctx.fillRect(x, fy(f), w, fh - 1);
    ctx.fillStyle = floorColor(f);
    ctx.fillRect(x, fy(f), 3, fh - 1);
  }
  ctx.fillStyle = T().shaft;
  ctx.fillRect(shaftX0, y, ne * shaftW, h);
  // 待っている人: 先頭がシャフト側
  const pr = Math.max(2.5, Math.min(5, fh * 0.16));
  const byFloor: Passenger[][] = Array.from({ length: floors }, () => []);
  // 歩いている途中の人(まだ行列に着いていない)は描かない
  for (const p of s.passengers) if (p.state === 'waiting' && p.spawnTick <= s.tick) byFloor[p.origin]!.push(p);
  byFloor.forEach((q, f) => {
    const step = Math.min(pr * 2.4, (shaftX0 - x - 8) / Math.max(1, q.length));
    q.forEach((p, k) => fillCircle(ctx, shaftX0 - 4 - pr - k * step, fy(f) + fh - pr - 3, pr, floorColor(p.dest)));
  });
  // かご
  s.elevators.forEach((e, i) => {
    const sx = shaftX0 + i * shaftW;
    if (ghost && ghost.elevator === i) {
      // 分かれ道: 2台のかごを少し左右にずらして重ね、止まった階に印を残す
      for (const g of ghost.cars) {
        const ox = g.offset * shaftW;
        for (const f of g.stops) {
          fillCircle(ctx, sx + shaftW / 2 + ox * 2.4, fy(f) + fh / 2, Math.max(3, fh * 0.12), g.color);
        }
        const gy = y + (floors - 1 - g.pos / UNITS_PER_FLOOR) * fh + 1;
        ctx.save();
        ctx.globalAlpha = g.alpha;
        ctx.fillStyle = T().carBody;
        roundRect(ctx, sx + 3 + ox, gy, shaftW - 6, fh - 2, 3);
        ctx.fill();
        ctx.strokeStyle = g.color;
        ctx.lineWidth = 3;
        ctx.stroke();
        ctx.restore();
      }
      return;
    }
    const pos = e.pos / UNITS_PER_FLOOR;
    const cy = y + (floors - 1 - pos) * fh + 1;
    if (e.phase === 'moving') {
      ctx.save();
      ctx.setLineDash([3, 3]);
      ctx.strokeStyle = elevatorColor(e.id);
      ctx.lineWidth = 1.5;
      roundRect(ctx, sx + 2, fy(e.target) + 1, shaftW - 4, fh - 2, 3);
      ctx.stroke();
      ctx.restore();
    }
    ctx.fillStyle = T().carBody;
    roundRect(ctx, sx + 2, cy, shaftW - 4, fh - 2, 3);
    ctx.fill();
    ctx.strokeStyle = elevatorColor(e.id);
    ctx.lineWidth = 2;
    ctx.stroke();
    // 乗っている人(行き先の色の小さな丸)
    const riders = s.passengers.filter((p) => p.state === 'riding' && p.elevatorId === e.id);
    const rr = Math.max(1.8, Math.min(3, fh * 0.1));
    riders.forEach((p, k) => {
      const col = k % 3;
      const rowi = Math.floor(k / 3);
      fillCircle(ctx, sx + 2 + (shaftW - 4) * (col + 1) / 4, cy + fh - 4 - rr - rowi * (rr * 2 + 1), rr, floorColor(p.dest));
    });
  });
}

/** 大きな再生の窓: 選んだカードの場面を大きく見せる(何も選んでいなければ点線の枠) */
function drawPreview(ctx: CanvasRenderingContext2D, r: Rect, card: CardId | null, now: number): void {
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  roundRect(ctx, r.x, r.y, r.w, r.h, 12);
  ctx.fill();
  if (!card) {
    ctx.save();
    ctx.setLineDash([8, 6]);
    ctx.strokeStyle = T().textDim;
    ctx.lineWidth = 2;
    roundRect(ctx, r.x + 60, r.y + 40, r.w - 120, r.h - 80, 12);
    ctx.stroke();
    ctx.restore();
    return;
  }
  const h = r.h - 36;
  const w = Math.round(h * (64 / 84));
  drawCard(ctx, card, r.x + (r.w - w) / 2, r.y + 18, w, h, { t: (now / CARD_LOOP_MS) % 1 });
}

function drawResult(
  ctx: CanvasRenderingContext2D, sc: ScoreResult, res: DayResult, sinceMs: number, newCards: readonly CardId[],
): void {
  dim(ctx);
  const p = RESULT_PANEL;
  ctx.fillStyle = T().dialogBg;
  roundRect(ctx, p.x, p.y, p.w, p.h, 14);
  ctx.fill();
  const cx = p.x + p.w / 2;

  // 星: 1つずつ順に現れる
  for (let i = 0; i < 3; i++) {
    const appear = Math.max(0, Math.min(1, (sinceMs - 250 - i * 300) / 250));
    const filled = res.stars > i && appear > 0;
    const scale = filled ? 0.6 + 0.4 * appear + 0.15 * Math.sin(Math.PI * appear) : 1;
    iconStar(ctx, cx + (i - 1) * 84, p.y + 70 + (i === 1 ? -10 : 0), 32 * scale, filled);
  }
  // 正式な点。左に根拠(カレンダー=複数日の平均 / 指=手動を使った日の点)
  drawNumber(ctx, String(res.score), cx, p.y + 170, 52, T().accent);
  if (res.basis === 'rated') {
    iconCalendar(ctx, cx - 125, p.y + 152, 20, res.days);
    // 右に、画面で見た日の点(カレンダー「1」)
    iconCalendar(ctx, cx + 118, p.y + 152, 13, 1, T().textDim);
    drawNumber(ctx, String(res.dayScore), cx + 140, p.y + 160, 18, T().textDim, 'left');
  } else {
    iconFinger(ctx, cx - 125, p.y + 152, 22);
  }

  const y = p.y + 225;
  const cols = [cx - 140, cx, cx + 140];
  iconCheck(ctx, cols[0]! - 30, y, 14);
  drawNumber(ctx, String(sc.delivered), cols[0]! + 4, y + 9, 26, T().text, 'left');
  iconCross(ctx, cols[1]! - 30, y, 14);
  drawNumber(ctx, String(sc.missed), cols[1]! + 4, y + 9, 26, T().text, 'left');
  iconClock(ctx, cols[2]! - 30, y, 15);
  drawNumber(ctx, sc.avgWaitSec.toFixed(1), cols[2]! + 4, y + 9, 26, T().text, 'left');

  const b = RETRY_BUTTON;
  fillCircle(ctx, b.x + b.w / 2, b.y + b.h / 2, b.w / 2, T().buttonActive);
  iconRetry(ctx, b.x + b.w / 2, b.y + b.h / 2, b.w / 2);

  // 新しく手に入れたカード: 星のあとに光りながら現れる
  newCards.forEach((newCard, k) => {
    const t = Math.max(0, Math.min(1, (sinceMs - 1400 - k * 200) / 400));
    if (t > 0) {
      const w = 64 * (0.7 + 0.3 * t), h = 84 * (0.7 + 0.3 * t);
      const x = p.x + 90 + k * 76 - w / 2, y = b.y + b.h / 2 - h / 2;
      ctx.save();
      ctx.globalAlpha = t;
      ctx.shadowColor = '#ffd34d';
      ctx.shadowBlur = 24;
      drawCard(ctx, newCard, x, y, w, h, { t: (sinceMs / CARD_LOOP_MS) % 1 });
      ctx.restore();
      // 「+」の印
      fillCircle(ctx, x + w, y, 12, '#3fbf6a');
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(x + w - 6, y - 1.5, 12, 3);
      ctx.fillRect(x + w - 1.5, y - 6, 3, 12);
    }
  });
}
