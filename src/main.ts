import { makeBuilding, TICKS_PER_SECOND } from './sim/building.ts';
import { addPassenger, createSim, step, type Command, type SimState } from './sim/sim.ts';
import { computeScore } from './sim/score.ts';
import { STAGES, type Stage } from './sim/stages.ts';
import { CARD_ORDER, type CardId } from './sim/rules.ts';
import { draw, EFFECT_MS, type Effect, type Mode } from './render/render.ts';
import {
  editorHit, hitTest, inRect, makeLayout, makeView, RETRY_BUTTON, toLogical, type Layout, type View,
} from './render/layout.ts';
import { handleTap, type ControlState } from './ui/controls.ts';
import { fitRules, nextUnlock, placeCard, removeCard, slotCountFor, type RuleSet } from './ui/editor.ts';

const canvas = document.createElement('canvas');
document.getElementById('app')!.append(canvas);
const ctx = canvas.getContext('2d')!;

let stage: Stage = STAGES[0]!;
/** 手に入れたカード(進行状況の保存は8〜9日目。今はページを開き直すと最初から) */
let unlocked: CardId[] = [];
// 開発時だけ、URLで建物やカードを変えて確認できる(例: ?elevators=2&floors=7&cards=all)。本番ビルドでは無効。
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
  if (q.get('cards') === 'all') unlocked = [...CARD_ORDER];
}

let rules: RuleSet = fitRules([], stage.building.elevators, slotCountFor(unlocked), unlocked);
let editRow = 0;
let newCard: CardId | null = null;

let state: SimState;
let layout: Layout;
let control: ControlState;
let pending: Command[];
let prevPos: number[];
let effects: Effect[];
let mode: Mode = 'ready';
let modeSince = performance.now();

function newDay(): void {
  // ステージごとに固定のシード(同じルール・同じ操作なら同じ結果になる)
  state = createSim({ building: stage.building, traffic: stage.traffic, rules }, stage.seed);
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

/** 1日の終わり: カードを1枚手に入れる */
function finishDay(): void {
  newCard = nextUnlock(unlocked, CARD_ORDER);
  if (newCard) unlocked = [...unlocked, newCard];
  setMode('result');
}

/** 結果画面が出た直後の誤タップでやり直さないための待ち時間 */
const RESULT_INPUT_DELAY_MS = 700;

function onReadyTap(x: number, y: number): void {
  if (unlocked.length === 0) {
    // カードを持っていない最初の日は、どこをタップしても開始
    newDay();
    setMode('playing');
    return;
  }
  const slots = slotCountFor(unlocked);
  const hit = editorHit(x, y, rules.length, slots, unlocked.length);
  if (!hit) return;
  if (hit.kind === 'play') {
    newDay();
    setMode('playing');
  } else if (hit.kind === 'row') {
    editRow = hit.row;
  } else if (hit.kind === 'slot') {
    editRow = hit.row;
    rules = removeCard(rules, hit.row, hit.index);
  } else {
    rules = placeCard(rules, editRow, unlocked[hit.index]!, slots);
  }
}

canvas.addEventListener('pointerdown', (ev) => {
  ev.preventDefault();
  const rect = canvas.getBoundingClientRect();
  const p = toLogical(view, ev.clientX - rect.left, ev.clientY - rect.top);
  if (mode === 'ready') {
    onReadyTap(p.x, p.y);
    return;
  }
  if (mode === 'result') {
    if (performance.now() - modeSince >= RESULT_INPUT_DELAY_MS && inRect(RETRY_BUTTON, p.x, p.y)) {
      // 次の日の前に、ルールを組み替えられるようにする
      rules = fitRules(rules, stage.building.elevators, slotCountFor(unlocked), unlocked);
      // 初めてカードを手に入れたら、最初の枠に置いておく(置き方を図で示す代わり)
      if (newCard && rules.every((r) => r.length === 0)) {
        rules = rules.map((r) => [...r, newCard!]);
      }
      newCard = null;
      newDay();
      setMode('ready');
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
      finishDay();
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
    unlocked, slotCount: slotCountFor(unlocked), editRules: rules, editRow, newCard,
  });
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// 開発時だけ、検証用に状態を覗けるようにする(本番ビルドには含まれない)
if (import.meta.env.DEV) {
  (window as unknown as Record<string, unknown>).__dev = {
    get state() { return state; },
    get mode() { return mode; },
    get rules() { return rules; },
    get unlocked() { return unlocked; },
    addPassenger,
    /** 検証用: 時間を早送りする */
    fastForward(ticks: number) { for (let i = 0; i < ticks && !state.finished; i++) step(state); },
  };
}
