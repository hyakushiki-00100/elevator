import { makeBuilding, TICKS_PER_SECOND } from './sim/building.ts';
import { addPassenger, createSim, step, type Command, type SimState } from './sim/sim.ts';
import { computeScore } from './sim/score.ts';
import { STAGES, type Stage } from './sim/stages.ts';
import { draw, EFFECT_MS, type Effect, type Mode } from './render/render.ts';
import { hitTest, inRect, makeLayout, makeView, RETRY_BUTTON, toLogical, type Layout, type View } from './render/layout.ts';
import { handleTap, type ControlState } from './ui/controls.ts';

const canvas = document.createElement('canvas');
document.getElementById('app')!.append(canvas);
const ctx = canvas.getContext('2d')!;

let stage: Stage = STAGES[0]!;
// 開発時だけ、URLで建物を変えて確認できる(例: ?elevators=2&floors=7)。本番ビルドでは無効。
if (import.meta.env.DEV) {
  const q = new URLSearchParams(location.search);
  const num = (k: string): number | undefined => (q.has(k) ? Number(q.get(k)) : undefined);
  stage = {
    ...stage,
    building: makeBuilding({
      ...stage.building,
      floors: num('floors') ?? stage.building.floors,
      elevators: num('elevators') ?? stage.building.elevators,
    }),
  };
}

let state: SimState;
let layout: Layout;
let control: ControlState;
let pending: Command[];
let prevPos: number[];
let effects: Effect[];
let mode: Mode = 'ready';
let modeSince = performance.now();

function newDay(): void {
  // ステージごとに固定のシード(同じ操作なら同じ結果になる)
  state = createSim({ building: stage.building, traffic: stage.traffic }, stage.seed);
  layout = makeLayout(stage.building);
  control = { selected: stage.building.elevators === 1 ? 0 : null };
  pending = [];
  prevPos = state.elevators.map((e) => e.pos);
  effects = [];
}
newDay();

let cssW = 0, cssH = 0, dpr = 1;
let view: View = makeView(1, 1);

function resize(): void {
  dpr = window.devicePixelRatio || 1;
  cssW = window.innerWidth;
  cssH = window.innerHeight;
  canvas.width = Math.round(cssW * dpr);
  canvas.height = Math.round(cssH * dpr);
  canvas.style.width = `${cssW}px`;
  canvas.style.height = `${cssH}px`;
  view = makeView(cssW, cssH);
}
window.addEventListener('resize', resize);
resize();

function setMode(m: Mode): void {
  mode = m;
  modeSince = performance.now();
}

/** 結果画面が出た直後の誤タップでやり直さないための待ち時間 */
const RESULT_INPUT_DELAY_MS = 700;

canvas.addEventListener('pointerdown', (ev) => {
  ev.preventDefault();
  const rect = canvas.getBoundingClientRect();
  const p = toLogical(view, ev.clientX - rect.left, ev.clientY - rect.top);
  if (mode === 'ready') {
    setMode('playing');
    return;
  }
  if (mode === 'result') {
    if (performance.now() - modeSince >= RESULT_INPUT_DELAY_MS && inRect(RETRY_BUTTON, p.x, p.y)) {
      newDay();
      setMode('playing');
    }
    return;
  }
  const hit = hitTest(layout, p.x, p.y, state.elevators.map((e) => e.pos));
  const r = handleTap(hit, control, state.elevators.length);
  control = r.state;
  if (r.command) pending.push(r.command);
});

const DT = 1000 / TICKS_PER_SECOND;
const MAX_STEPS_PER_FRAME = 5;
let acc = 0;
let last = performance.now();

function frame(now: number): void {
  acc += Math.min(now - last, 250);
  last = now;
  if (mode !== 'playing') acc = 0;
  let steps = 0;
  while (acc >= DT) {
    prevPos = state.elevators.map((e) => e.pos);
    step(state, pending);
    pending = [];
    for (const ev of state.events) {
      if (ev.type === 'delivered') effects.push({ type: 'delivered', floor: ev.floor, elevator: ev.elevator, t0: now });
      else if (ev.type === 'missed') effects.push({ type: 'missed', floor: ev.floor, elevator: -1, t0: now });
    }
    acc -= DT;
    if (state.finished) {
      setMode('result');
      acc = 0;
      break;
    }
    if (++steps >= MAX_STEPS_PER_FRAME) {
      acc = 0; // 遅れを取り戻そうとして固まらないようにする
      break;
    }
  }
  effects = effects.filter((e) => now - e.t0 <= EFFECT_MS);
  draw({
    ctx, cssW, cssH, dpr, view, layout, state,
    score: computeScore(state.stats, stage.stars),
    starThresholds: stage.stars,
    prevPos, alpha: mode === 'playing' ? acc / DT : 1,
    selected: control.selected, effects, mode, modeSince, now,
  });
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// 開発時だけ、検証用に状態を覗けるようにする(本番ビルドには含まれない)
if (import.meta.env.DEV) {
  (window as unknown as Record<string, unknown>).__dev = {
    get state() { return state; },
    get mode() { return mode; },
    addPassenger,
    /** 検証用: 時間を早送りする */
    fastForward(ticks: number) { for (let i = 0; i < ticks && !state.finished; i++) step(state); },
  };
}
