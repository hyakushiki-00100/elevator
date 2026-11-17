import { makeBuilding, TICKS_PER_SECOND } from './sim/building.ts';
import { addPassenger, createSim, step, type Command, type SimState } from './sim/sim.ts';
import { computeScore } from './sim/score.ts';
import { STAGES, type Stage } from './sim/stages.ts';
import { CARD_ORDER, type CardId } from './sim/rules.ts';
import { draw, EFFECT_MS, type Effect, type Mode } from './render/render.ts';
import {
  editorHit, hitTest, inRect, makeLayout, makeView, RETRY_BUTTON, stageTabHit, toLogical, type Layout, type View,
} from './render/layout.ts';
import { handleTap, type ControlState } from './ui/controls.ts';
import {
  fitRules, nextUnlock, placeCard, removeCard, slotCountFor, stagesOpen, type RuleSet,
} from './ui/editor.ts';

const canvas = document.createElement('canvas');
document.getElementById('app')!.append(canvas);
const ctx = canvas.getContext('2d')!;

// ---- 進行状況(保存は8〜9日目。今はページを開き直すと最初から) ----
/** 手に入れたカード */
let unlocked: CardId[] = [];
/** 選択中のステージ(STAGES の添字) */
let stageIdx = 0;
/** ステージごとのルール(エレベーターごとの枠) */
const rulesByStage: RuleSet[] = STAGES.map((s) => fitRules([], s.building.elevators, 0, []));
/** ステージごとの最高の星 */
const bestStars: number[] = STAGES.map(() => 0);

// 開発時だけ、URLで状態を変えて確認できる(例: ?cards=all&stage=2&elevators=3)。本番ビルドでは無効。
let devBuilding: { floors?: number; elevators?: number } = {};
if (import.meta.env.DEV) {
  const q = new URLSearchParams(location.search);
  const num = (k: string): number | undefined => (q.has(k) ? Number(q.get(k)) : undefined);
  devBuilding = { floors: num('floors'), elevators: num('elevators') };
  if (q.get('cards') === 'all') unlocked = [...CARD_ORDER];
  const st = num('stage');
  if (st !== undefined && st >= 1 && st <= STAGES.length) stageIdx = st - 1;
}

function stage(): Stage {
  const s = STAGES[stageIdx]!;
  if (devBuilding.floors === undefined && devBuilding.elevators === undefined) return s;
  return {
    ...s,
    building: makeBuilding({
      ...s.building,
      floors: devBuilding.floors ?? s.building.floors,
      elevators: devBuilding.elevators ?? s.building.elevators,
    }),
  };
}

function currentRules(): RuleSet {
  return fitRules(rulesByStage[stageIdx] ?? [], stage().building.elevators, slotCountFor(unlocked), unlocked);
}

let editRow = 0;
let newCards: CardId[] = [];
/** この日の終わりに新しく開いたステージ(なければ null) */
let newStage: number | null = null;

let state: SimState;
let layout: Layout;
let control: ControlState;
let pending: Command[];
let prevPos: number[];
let effects: Effect[];
let mode: Mode = 'ready';
let modeSince = performance.now();

function newDay(): void {
  const st = stage();
  rulesByStage[stageIdx] = currentRules();
  // ステージごとに固定のシード(同じルール・同じ操作なら同じ結果になる)
  state = createSim({ building: st.building, traffic: st.traffic, rules: rulesByStage[stageIdx] }, st.seed);
  layout = makeLayout(st.building);
  control = { selected: st.building.elevators === 1 ? 0 : null };
  pending = [];
  prevPos = state.elevators.map((e) => e.pos);
  effects = [];
  editRow = Math.min(editRow, st.building.elevators - 1);
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

/** 1日の終わり: 星を記録し、カードを手に入れる */
function finishDay(): void {
  const sc = computeScore(state.stats, stage().stars);
  bestStars[stageIdx] = Math.max(bestStars[stageIdx] ?? 0, sc.stars);
  const openBefore = stagesOpen(unlocked, STAGES.length);
  newCards = nextUnlock(unlocked);
  unlocked = [...unlocked, ...newCards];
  const openAfter = stagesOpen(unlocked, STAGES.length);
  newStage = openAfter > openBefore ? openAfter - 1 : null;
  setMode('result');
}

/** 結果画面の後、次の日の準備(新しいステージが開いたら移り、カードの置き場所を用意する) */
function prepareNextDay(): void {
  if (newStage !== null) {
    // 新しく開いたステージへ移る。最初は、いま遊んでいたステージの1基目の並びを全基に置いておく
    const prev = rulesByStage[stageIdx]?.[0] ?? [];
    stageIdx = newStage;
    rulesByStage[stageIdx] = Array.from({ length: stage().building.elevators }, () => [...prev]);
    newStage = null;
  }
  let rules = currentRules();
  // 初めてカードを手に入れたら、最初の枠に置いておく(置き方を図で示す代わり)
  if (newCards.length > 0 && rules.every((r) => r.length === 0)) {
    rules = rules.map((r) => [...r, newCards[0]!]);
  }
  rulesByStage[stageIdx] = rules;
  newCards = [];
  newDay();
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
  const tab = stageTabHit(x, y, stagesOpen(unlocked, STAGES.length));
  if (tab !== null) {
    stageIdx = tab;
    newDay();
    return;
  }
  const slots = slotCountFor(unlocked);
  const rules = currentRules();
  const hit = editorHit(x, y, rules.length, slots, unlocked.length);
  if (!hit) return;
  if (hit.kind === 'play') {
    newDay();
    setMode('playing');
    return;
  }
  if (hit.kind === 'row') editRow = hit.row;
  else if (hit.kind === 'slot') {
    editRow = hit.row;
    rulesByStage[stageIdx] = removeCard(rules, hit.row, hit.index);
  } else {
    rulesByStage[stageIdx] = placeCard(rules, editRow, unlocked[hit.index]!, slots);
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
      prepareNextDay();
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
  const st = stage();
  draw({
    ctx, cssW, cssH, dpr, view, layout, state,
    score: computeScore(state.stats, st.stars),
    starThresholds: st.stars,
    prevPos, alpha: mode === 'playing' ? acc / DT : 1,
    selected: control.selected, effects, mode, modeSince, now,
    unlocked, slotCount: slotCountFor(unlocked), editRules: currentRules(), editRow, newCards,
    stagesOpen: stagesOpen(unlocked, STAGES.length), stageIdx, bestStars,
  });
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// 開発時だけ、検証用に状態を覗けるようにする(本番ビルドには含まれない)
if (import.meta.env.DEV) {
  (window as unknown as Record<string, unknown>).__dev = {
    get state() { return state; },
    get mode() { return mode; },
    get rules() { return currentRules(); },
    get unlocked() { return unlocked; },
    get stageIdx() { return stageIdx; },
    addPassenger,
    /** 検証用: 時間を早送りする */
    fastForward(ticks: number) { for (let i = 0; i < ticks && !state.finished; i++) step(state); },
  };
}
