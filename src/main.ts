import { makeBuilding, TICKS_PER_SECOND } from './sim/building.ts';
import { addPassenger, createSim, step, type Command, type SimState } from './sim/sim.ts';
import { computeScore } from './sim/score.ts';
import { STAGES, type Stage } from './sim/stages.ts';
import { CARD_ORDER, type CardId } from './sim/rules.ts';
import { draw, EFFECT_MS, type DayResult, type Effect, type Mode } from './render/render.ts';
import { rateRules, RATING_DAYS } from './sim/evaluate.ts';
import {
  editorHit, hitTest, inRect, makeLayout, makeView, MUTE_BUTTON, RETRY_BUTTON, shareButtonHit, stageTabHit, toLogical, type Layout, type View,
  RESET_BUTTON, RESET_YES,
} from './render/layout.ts';
import { handleTap, type ControlState } from './ui/controls.ts';
import {
  fitRules, nextUnlock, placeCardAt, removeCard, slotCountFor, stagesOpen, type RuleSet,
} from './ui/editor.ts';
import { browserStore, loadSave, resetSave, SAVE_VERSION, writeSave, type SaveData } from './platform/storage.ts';
import { decodeShare, encodeShare } from './share/codec.ts';
import { applyShared } from './share/apply.ts';
import { isShareDialogOpen, openShareDialog, type Feedback } from './ui/shareDialog.ts';
import { SoundPlayer, type Sfx } from './platform/audio.ts';
import { setTheme, theme } from './render/theme.ts';

/**
 * 検証用の仕組み(URLの指定と window.__dev)を有効にするか。
 * 開発サーバーと、撮影専用ビルド(vite build --mode screenshot)だけで有効。
 * 通常の本番ビルドでは false に置き換わり、仕組みごと取り除かれる。
 */
const DEBUG_HOOKS = import.meta.env.DEV || import.meta.env.MODE === 'screenshot';

const canvas = document.createElement('canvas');
document.getElementById('app')!.append(canvas);
const ctx = canvas.getContext('2d')!;
/** ドット絵風のテーマで使う、粗い画素の下書き用キャンバス */
const lowRes = document.createElement('canvas');
const lowResCtx = lowRes.getContext('2d')!;

// ---- 進行状況(端末内に保存する: platform/storage.ts) ----
/** 手に入れたカード */
let unlocked: CardId[] = [];
/** 選択中のステージ(STAGES の添字) */
let stageIdx = 0;
/** ステージごとのルール(エレベーターごとの枠) */
const rulesByStage: RuleSet[] = STAGES.map((s) => fitRules([], s.building.elevators, 0, []));
/** ステージごとの最高の星 */
const bestStars: number[] = STAGES.map(() => 0);

const store = browserStore();
/** 案内(指の手本)の進み具合: 1日目に手でタップした回数・カードを一度でも置いたか */
let tutorial = { taps: 0, placed: false };
/** 進行状況を消す前の確かめの窓を出しているか */
let confirmReset = false;
const sound = new SoundPlayer();
/** 検証用: 鳴らした効果音の記録(開発サーバーと撮影用ビルドだけ) */
const soundLog: Sfx[] = [];
function sfx(s: Sfx): void {
  if (DEBUG_HOOKS) soundLog.push(s);
  sound.play(s);
}
/** 保存するか(検証用のURL指定で状態を変えたときは、本当の進行状況を上書きしないよう保存しない) */
let saving = true;

// 保存された進行状況を読み込む(なければ・壊れていれば最初から)
{
  const saved = loadSave(store);
  if (saved) {
    unlocked = saved.unlocked;
    STAGES.forEach((s, i) => {
      bestStars[i] = saved.bestStars[s.id] ?? 0;
      const r = saved.rules[s.id];
      if (r) rulesByStage[i] = r.map((row) => [...row]);
    });
    const last = STAGES.findIndex((s) => s.id === saved.lastStage);
    if (last >= 0 && last < stagesOpen(unlocked, STAGES)) stageIdx = last;
    sound.muted = saved.muted;
    tutorial = { ...saved.tutorial };
  }
}

// 検証時だけ、URLで状態を変えて確認できる(例: ?cards=all&stage=2&elevators=3)。本番ビルドでは無効。
let devBuilding: { floors?: number; elevators?: number } = {};
if (DEBUG_HOOKS) {
  const q = new URLSearchParams(location.search);
  const num = (k: string): number | undefined => (q.has(k) ? Number(q.get(k)) : undefined);
  devBuilding = { floors: num('floors'), elevators: num('elevators') };
  if (q.get('cards') === 'all') unlocked = [...CARD_ORDER];
  // 見た目のテーマの見本(?theme=dark|light|retro|metal)。見た目の雰囲気が決まるまでの比較用
  const th = q.get('theme');
  if (th) setTheme(th);
  const st = num('stage');
  if (st !== undefined && st >= 1 && st <= STAGES.length) stageIdx = st - 1;
  if (['cards', 'stage', 'floors', 'elevators'].some((k) => q.has(k))) saving = false;
}

/** 進行状況を端末内に保存する(失敗しても無視。ゲームは続ける)。lastIdx は次に開いたときのステージ */
function persist(lastIdx: number = stageIdx): void {
  if (!saving) return;
  const data: SaveData = {
    version: SAVE_VERSION, unlocked: [...unlocked], bestStars: {}, rules: {}, lastStage: STAGES[lastIdx]!.id, muted: sound.muted,
    tutorial: { ...tutorial },
  };
  STAGES.forEach((s, i) => {
    data.bestStars[s.id] = bestStars[i] ?? 0;
    data.rules[s.id] = (rulesByStage[i] ?? []).map((row) => [...row]);
  });
  writeSave(store, data);
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
/** 編集画面: 持ち上げているカード(手持ちの何番目か。枠から持ち上げたときは handIndex = null) */
let held: { card: CardId; handIndex: number | null } | null = null;
/** 編集画面: 大きく再生するカード */
let previewCard: CardId | null = null;
let newCards: CardId[] = [];
/** 次の日に遊ぶステージ(1日の終わりに決めて保存する。結果画面の「やり直し」で移る) */
let nextStageIdx = 0;
/** 1日の終わりの正式な結果 */
let dayResult: DayResult | null = null;

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
  document.body.style.background = theme().bg;
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

/**
 * 1日の正式な結果。カードだけで動かした日は、同じルールで複数日を画面に出さずに計算した平均
 * (1日分の点は運のぶれが大きく、カードの組み合わせの差より大きいことがあるため: sim/evaluate.ts)。
 * 手動を1度でも使った日や、カードを置いていない日は、その日の点。
 */
function officialResult(): DayResult {
  const st = stage();
  const day = computeScore(state.stats, st.stars);
  const rules = rulesByStage[stageIdx] ?? [];
  const hasCards = rules.some((r) => r.length > 0);
  if (!hasCards || state.manualUsed) {
    return { score: day.score, stars: day.stars, basis: 'manual', days: 1, dayScore: day.score };
  }
  const t0 = performance.now();
  const rating = rateRules(st, rules);
  if (import.meta.env.DEV) console.info(`rating: ${RATING_DAYS}日分 ${(performance.now() - t0).toFixed(0)}ms`);
  return { score: rating.score, stars: rating.stars, basis: 'rated', days: RATING_DAYS, dayScore: day.score };
}

/** 1日の終わり: 正式な結果を出し、星を記録し、カードを手に入れる */
function finishDay(): void {
  dayResult = officialResult();
  bestStars[stageIdx] = Math.max(bestStars[stageIdx] ?? 0, dayResult.stars);
  const openBefore = stagesOpen(unlocked, STAGES);
  newCards = nextUnlock(unlocked);
  unlocked = [...unlocked, ...newCards];
  const openAfter = stagesOpen(unlocked, STAGES);
  prepareProgress(openAfter > openBefore ? openAfter - 1 : null);
  persist(nextStageIdx);
  setMode('result');
  // 結果画面の演出(星が1つずつ現れる・カードが光って現れる: render.ts の drawResult)に合わせて鳴らす
  for (let i = 0; i < dayResult.stars; i++) setTimeout(() => sfx('star'), 250 + i * 300 + 120);
  if (newCards.length > 0) setTimeout(() => sfx('unlock'), 1400);
}

/**
 * 1日の終わりに、次の日の準備をしておく(結果画面のままページを閉じても、保存に反映されるように)。
 * - 新しいステージが開いたら、次の日はそこへ移る。最初は、いま遊んでいたステージの1基目の並びを全基に置いておく
 * - 初めてカードを手に入れたら、最初の枠に置いておく(置き方を図で示す代わり)
 */
function prepareProgress(openedStage: number | null): void {
  nextStageIdx = stageIdx;
  if (openedStage !== null) {
    const prev = rulesByStage[stageIdx]?.[0] ?? [];
    nextStageIdx = openedStage;
    rulesByStage[nextStageIdx] = Array.from({ length: STAGES[nextStageIdx]!.building.elevators }, () => [...prev]);
  }
  const target = rulesByStage[nextStageIdx] ?? [];
  if (newCards.length > 0 && target.every((r) => r.length === 0)) {
    const n = STAGES[nextStageIdx]!.building.elevators;
    rulesByStage[nextStageIdx] = Array.from({ length: n }, () => [newCards[0]!]);
  }
}

/** 結果画面の「やり直し」: 準備しておいた次の日へ */
function prepareNextDay(): void {
  stageIdx = nextStageIdx;
  rulesByStage[stageIdx] = currentRules();
  newCards = [];
  newDay();
}

/** 結果画面が出た直後の誤タップでやり直さないための待ち時間 */
const RESULT_INPUT_DELAY_MS = 700;

/** 共有文字列を読み込んで、そのステージの枠に置く。結果を図で示すための区分を返す */
function importShared(text: string): Feedback {
  const d = decodeShare(text);
  if (!d.ok) { sfx('error'); return 'error'; }
  const r = applyShared(d.value, STAGES, stagesOpen(unlocked, STAGES), unlocked, slotCountFor(unlocked));
  if (r.status !== 'ok' && r.status !== 'partial') { sfx('error'); return 'error'; }
  sfx('click');
  stageIdx = r.stageIdx;
  rulesByStage[stageIdx] = r.rules;
  newDay();
  setMode('ready');
  persist();
  return r.status;
}

/** 進行状況を最初に戻す(手に入れたカード・星・ルール・案内。音の設定は残す) */
function resetProgress(): void {
  unlocked = [];
  STAGES.forEach((st, i) => {
    bestStars[i] = 0;
    rulesByStage[i] = fitRules([], st.building.elevators, 0, []);
  });
  stageIdx = 0;
  editRow = 0;
  held = null;
  previewCard = null;
  tutorial = { taps: 0, placed: false };
  if (saving) resetSave(store, sound.muted);
  newDay();
}

function onReadyTap(x: number, y: number): void {
  if (unlocked.length === 0) {
    // カードを持っていない最初の日は、どこをタップしても開始
    sfx('click');
    newDay();
    setMode('playing');
    return;
  }
  if (confirmReset) {
    // 確かめの窓: ✓で消す、それ以外(×・窓の外)はやめる
    confirmReset = false;
    if (inRect(RESET_YES, x, y)) {
      sfx('click');
      resetProgress();
    } else sfx('click');
    return;
  }
  if (inRect(RESET_BUTTON, x, y)) {
    sfx('click');
    held = null;
    confirmReset = true;
    return;
  }
  const share = shareButtonHit(x, y);
  if (share) sfx('click');
  if (share === 'export') {
    openShareDialog({ mode: 'export', code: encodeShare({ stageId: STAGES[stageIdx]!.id, rules: currentRules() }) });
    return;
  }
  if (share === 'import') {
    openShareDialog({ mode: 'import', onSubmit: importShared });
    return;
  }
  const tab = stageTabHit(x, y, stagesOpen(unlocked, STAGES));
  if (tab !== null) {
    sfx('click');
    held = null;
    stageIdx = tab;
    newDay();
    persist();
    return;
  }
  const slots = slotCountFor(unlocked);
  const rules = currentRules();
  const hit = editorHit(x, y, rules.length, slots, unlocked.length);
  if (!hit) {
    // 何もない所をタップ: 持ち上げをやめる(枠から持ち上げたカードは、そのまま外れる)
    if (held) { held = null; sfx('click'); }
    return;
  }
  sfx('click');
  if (hit.kind === 'play') {
    held = null;
    newDay();
    setMode('playing');
    return;
  }
  if (hit.kind === 'row') {
    editRow = hit.row;
    return;
  }
  if (hit.kind === 'hand') {
    // 手持ちのカードをタップ: 持ち上げる(もう一度タップでやめる)。大きく再生する
    const c = unlocked[hit.index]!;
    if (held && held.handIndex === hit.index) held = null;
    else held = { card: c, handIndex: hit.index };
    previewCard = c;
    return;
  }
  // 枠をタップ
  editRow = hit.row;
  const inSlot = rules[hit.row]?.[hit.index];
  if (held) {
    // 持ち上げているカードを、この枠に置く
    const next = placeCardAt(rules, hit.row, held.card, hit.index, slots);
    if (next !== rules) {
      rulesByStage[stageIdx] = next;
      tutorial.placed = true;
      persist();
    } else {
      sfx('error');
    }
    previewCard = held.card;
    held = null;
    return;
  }
  if (inSlot) {
    // 置いてあるカードを持ち上げる(別の枠をタップで移す・何もない所をタップで外す)
    rulesByStage[stageIdx] = removeCard(rules, hit.row, hit.index);
    held = { card: inSlot, handIndex: null };
    previewCard = inSlot;
    persist();
  }
}

/** 初回の手本(指)を出す場所。カードを一度でも置いたら出さない */
function editorHint(): { kind: 'hand'; index: number } | { kind: 'slot'; row: number; index: number } | null {
  if (tutorial.placed || unlocked.length === 0) return null;
  const rules = currentRules();
  const row = rules[editRow] ?? [];
  if (held) return { kind: 'slot', row: editRow, index: Math.min(row.length, slotCountFor(unlocked) - 1) };
  const idx = unlocked.findIndex((c) => !row.includes(c));
  return { kind: 'hand', index: idx >= 0 ? idx : 0 };
}

canvas.addEventListener('pointerdown', (ev) => {
  ev.preventDefault();
  if (isShareDialogOpen()) return;
  // 音は利用者の操作の中でしか出せるようにならないので、タップのたびに準備する(2回目以降は何もしない)
  sound.unlock();
  const rect = canvas.getBoundingClientRect();
  const p = toLogical(view, ev.clientX - rect.left, ev.clientY - rect.top);
  if (inRect(MUTE_BUTTON, p.x, p.y)) {
    sound.muted = !sound.muted;
    sfx('click');
    persist();
    return;
  }
  if (mode === 'ready') {
    onReadyTap(p.x, p.y);
    return;
  }
  if (mode === 'result') {
    if (performance.now() - modeSince >= RESULT_INPUT_DELAY_MS && inRect(RETRY_BUTTON, p.x, p.y)) {
      sfx('click');
      prepareNextDay();
      setMode('ready');
    }
    return;
  }
  const hit = hitTest(layout, p.x, p.y, state.elevators.map((e) => e.pos));
  const r = handleTap(hit, control, state.elevators.length);
  control = r.state;
  if (r.command && unlocked.length === 0) tutorial.taps++;
  if (r.command || hit?.kind === 'elevator') {
    // タップが届いたことを、音と波紋で返す
    sfx('tap');
    effects.push({ type: 'tap', floor: -1, elevator: -1, t0: performance.now(), x: p.x, y: p.y });
  }
  if (r.command) pending.push(r.command);
});

document.addEventListener('visibilitychange', () => sound.setHidden(document.hidden));

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
    const phasesBefore = state.elevators.map((e) => e.phase);
    const timeBefore = state.phaseIndex;
    step(state, pending);
    pending = [];
    for (const ev of state.events) {
      if (ev.type === 'delivered') {
        effects.push({ type: 'delivered', floor: ev.floor, elevator: ev.elevator, t0: now });
        sfx('deliver');
      } else if (ev.type === 'missed') {
        effects.push({ type: 'missed', floor: ev.floor, elevator: -1, t0: now });
        sfx('miss');
      } else if (ev.type === 'boarded') {
        sfx('board');
      }
    }
    // 扉が開いた(到着した)とき
    state.elevators.forEach((e, i) => { if (e.phase === 'open' && phasesBefore[i] !== 'open') sfx('door'); });
    // 時間帯が変わった(朝 → 昼 → 夕方)とき
    if (state.phaseIndex > 0 && state.phaseIndex !== timeBefore) sfx('phase');
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
  // ドット絵風のテーマは、粗い画素の下書き用キャンバスに描いてから、ぼかさずに拡大する
  const px = theme().pixel;
  let drawCtx = ctx;
  let drawDpr = dpr;
  if (px > 1) {
    const w = Math.max(1, Math.ceil(cssW / px)), h = Math.max(1, Math.ceil(cssH / px));
    if (lowRes.width !== w || lowRes.height !== h) { lowRes.width = w; lowRes.height = h; }
    drawCtx = lowResCtx;
    drawDpr = 1 / px;
  }
  draw({
    ctx: drawCtx, cssW, cssH, dpr: drawDpr, view, layout, state,
    score: computeScore(state.stats, st.stars),
    starThresholds: st.stars,
    prevPos, alpha: mode === 'playing' ? acc / DT : 1,
    selected: control.selected, effects, mode, modeSince, now,
    unlocked, slotCount: slotCountFor(unlocked), editRules: currentRules(), editRow, newCards,
    stagesOpen: stagesOpen(unlocked, STAGES), stageIdx, bestStars, muted: sound.muted,
    held, previewCard: held?.card ?? previewCard, editorHint: mode === 'ready' ? editorHint() : null,
    stageShapes: STAGES.map((s) => ({ floors: s.building.floors, elevators: s.building.elevators })),
    result: mode === 'result' ? dayResult : null,
    playHint: unlocked.length === 0 && tutorial.taps < 3,
    confirmReset: mode === 'ready' && confirmReset,
  });
  if (px > 1) {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(lowRes, 0, 0, canvas.width, canvas.height);
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// 検証時だけ、状態を覗いたり操作したりできるようにする(本番ビルドには含まれない)
if (DEBUG_HOOKS) {
  (window as unknown as Record<string, unknown>).__dev = {
    get state() { return state; },
    get mode() { return mode; },
    get rules() { return currentRules(); },
    get unlocked() { return unlocked; },
    get stageIdx() { return stageIdx; },
    get result() { return dayResult; },
    get sounds() { return soundLog; },
    get muted() { return sound.muted; },
    get audioState() { return sound.state; },
    addPassenger,
    /** 検証用: 時間を早送りする */
    fastForward(ticks: number) { for (let i = 0; i < ticks && !state.finished; i++) step(state); },
    /** 検証用: 今のステージのルールを置き換える(1日の開始前に使う) */
    setRules(rules: CardId[][]) {
      rulesByStage[stageIdx] = fitRules(rules, stage().building.elevators, slotCountFor(unlocked), unlocked);
      newDay();
    },
    /** 検証用: 編集画面・最初の画面から1日を始める */
    start() { newDay(); setMode('playing'); },
  };
}

// 共有のリンク(?r=EV1-...)で開かれたら、そのルールを読み込む(結果は共有の窓に図で示す)
{
  const params = new URLSearchParams(location.search);
  const code = params.get('r');
  if (code) {
    params.delete('r');
    const rest = params.toString();
    try {
      history.replaceState(null, '', `${location.pathname}${rest ? `?${rest}` : ''}${location.hash}`);
    } catch {
      // URL を書き換えられない環境(一部の iframe など)では、そのままにする
    }
    openShareDialog({ mode: 'import', onSubmit: importShared, initial: code, autoSubmit: true });
  }
}
