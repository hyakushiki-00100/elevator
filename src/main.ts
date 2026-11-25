import { makeBuilding, TICKS_PER_SECOND } from './sim/building.ts';
import { addPassenger, createSim, step, type Command, type SimState } from './sim/sim.ts';
import { computeScore } from './sim/score.ts';
import { STAGES, type Stage } from './sim/stages.ts';
import { CARD_ORDER, type CardId } from './sim/rules.ts';
import { draw, EFFECT_MS, type DayResult, type Effect, type Mode } from './render/render.ts';
import { rateRules, RATING_DAYS } from './sim/evaluate.ts';
import {
  editorHit, hitTest, inRect, makeLayout, makeView, MUTE_BUTTON, RETRY_BUTTON, volumeHit, shareButtonHit, stageTabHit, toLogical, type Layout, type View,
  RESET_BUTTON, RESET_YES, PAD_BUTTON, PAD_MUTE,
} from './render/layout.ts';
import { handleTap, type ControlState } from './ui/controls.ts';
import {
  compactLayout, dropFromHand, fitLayout, moveSlot, nextStarGate, nextUnlock, removeAt, slotCountFor, stagesOpen, type RuleSet, type SlotLayout,
} from './ui/editor.ts';
import { crazyGames, noAds } from './platform/ads.ts';
import { drawCover, type CoverKind } from './render/cover.ts';
import { advancePreview, ensurePreview, previewRuleSets, type Preview } from './ui/preview.ts';
import { browserStore, loadSave, resetSave, SAVE_VERSION, writeSave, type SaveData } from './platform/storage.ts';
import { decodeShare, encodeShare } from './share/codec.ts';
import { applyShared } from './share/apply.ts';
import { isShareDialogOpen, openShareDialog, type Feedback } from './ui/shareDialog.ts';
import { isVolumeLevel, SoundPlayer, type Sfx } from './platform/audio.ts';
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
/** ステージごとの枠の並び(空いた枠は null。枠の位置は固定) */
const rulesByStage: SlotLayout[] = STAGES.map((s) => fitLayout([], s.building.elevators, 0, []));
/** ステージごとの最高の星 */
const bestStars: number[] = STAGES.map(() => 0);
/** 星の合計(各ステージの最高の星)。ステージ5以降はこれで開く */
function totalStars(): number {
  return bestStars.reduce((a, b) => a + b, 0);
}
/** 開いているステージの数(カードの枚数と星の合計で決まる) */
function openCount(): number {
  return stagesOpen(unlocked, STAGES, totalStars());
}

const store = browserStore();
/** 案内(指の手本)の進み具合: 1日目に手でタップした回数・カードを一度でも置いたか */
let tutorial = { taps: 0, placed: false };
/** 進行状況を消す前の確かめの窓を出しているか */
let confirmReset = false;
/** 音量の窓を開いているか */
let volumeOpen = false;
const sound = new SoundPlayer();
/** 検証用: 鳴らした効果音の記録(開発サーバーと撮影用ビルドだけ) */
const soundLog: Sfx[] = [];
/** 公開先(広告・遊んでいる区間の合図)。ビルド時の VITE_PLATFORM で選ぶ。指定がなければ広告なし */
// 比較をここに直接書くと、ビルド時に値が埋め込まれ、使わない公開先の中身(CrazyGames の SDK の読み込み)は本番のファイルから消える
const platform = import.meta.env.VITE_PLATFORM === 'crazygames' ? crazyGames() : noAds();
void platform.init();
/** 1日の終わりの広告を待っている間は、結果画面の操作を止める(公開先の決まり) */
let adBusy = false;

function sfx(s: Sfx): void {
  if (DEBUG_HOOKS) soundLog.push(s);
  // 公開先の設定で音を消すよう求められていれば、ゲーム内の設定より優先して鳴らさない
  if (platform.forcedMute()) return;
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
    if (last >= 0 && last < openCount()) stageIdx = last;
    sound.sfxLevel = isVolumeLevel(saved.sfx) ? saved.sfx : 3;
    sound.musicLevel = isVolumeLevel(saved.music) ? saved.music : 2;
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
  // 星で開くステージの確認用: ?stars=all で全ステージの最高の星を3にする
  if (q.get('stars') === 'all') bestStars.fill(3);
  // 見た目のテーマの見本(?theme=dark|light|retro|metal)。見た目の雰囲気が決まるまでの比較用
  const th = q.get('theme');
  if (th) setTheme(th);
  const st = num('stage');
  if (st !== undefined && st >= 1 && st <= STAGES.length) stageIdx = st - 1;
  if (['cards', 'stars', 'stage', 'floors', 'elevators'].some((k) => q.has(k))) saving = false;
}

/** 進行状況を端末内に保存する(失敗しても無視。ゲームは続ける)。lastIdx は次に開いたときのステージ */
function persist(lastIdx: number = stageIdx): void {
  if (!saving) return;
  const data: SaveData = {
    version: SAVE_VERSION, unlocked: [...unlocked], bestStars: {}, rules: {}, lastStage: STAGES[lastIdx]!.id, muted: sound.muted,
    sfx: sound.sfxLevel, music: sound.musicLevel,
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

/** 今のステージの枠の並び(空いた枠を含む。編集画面の表示用) */
function currentLayout(): SlotLayout {
  return fitLayout(rulesByStage[stageIdx] ?? [], stage().building.elevators, slotCountFor(unlocked), unlocked);
}

/** 今のステージのルール(空いた枠を飛ばして左から詰めた並び。sim・共有・採点に渡す形) */
function currentRules(): RuleSet {
  return compactLayout(currentLayout());
}

let editRow = 0;
/**
 * 編集画面: 引っ張っているカード。from は手持ち(index)か枠(row, slot)。
 * moved は、触れた場所から少し動いたか(動かずに離したら「触れただけ」として説明を見せるだけにする)
 */
interface Drag {
  card: CardId;
  from: { kind: 'hand'; index: number } | { kind: 'slot'; row: number; slot: number };
  x0: number; y0: number; x: number; y: number;
  moved: boolean;
}
let drag: Drag | null = null;
/** これだけ動いたら「引っ張り」と見なす(論理座標。スマホで触れただけのずれを引っ張りと誤解しないため) */
const DRAG_THRESHOLD = 10;
/**
 * 見本のページだけが window.__SAMPLE_KINDS を true にする: 急ぎ・団体・荷物持ちも出す
 * (どのステージも出現率がまだ0で、絵を確かめられないため。見本の日は点の扱いも見本)。
 */
const SAMPLE_KINDS = (globalThis as { __SAMPLE_KINDS?: unknown }).__SAMPLE_KINDS === true;
/** 編集画面: 大きく再生するカード */
let previewCard: CardId | null = null;
/** 編集画面の「試しに動かす」窓(本物のビルを今のルールで動かす。得点・保存には関係しない) */
let simPreview: Preview | null = null;
let previewAcc = 0;
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
  rulesByStage[stageIdx] = currentLayout();
  // ステージごとに固定のシード(同じルール・同じ操作なら同じ結果になる)
  // 見本では、急ぎ・団体・荷物持ちも出す(どのステージも出現率がまだ0で、絵を確かめられないため)
  const traffic = SAMPLE_KINDS
    ? { ...st.traffic, phases: st.traffic.phases.map((p) => ({ ...p, rushedShare: 0.1, groupShare: 0.08, luggageShare: 0.08 })) }
    : st.traffic;
  state = createSim({ building: st.building, traffic, rules: currentRules() }, st.seed);
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
  // 遊んでいる区間を公開先に知らせる(1日の間だけ。編集画面・結果画面は休憩)
  if (m === 'playing') platform.gameplayStart();
  else platform.gameplayStop();
}

/**
 * 1日の正式な結果。カードだけで動かした日は、同じルールで複数日を画面に出さずに計算した平均
 * (1日分の点は運のぶれが大きく、カードの組み合わせの差より大きいことがあるため: sim/evaluate.ts)。
 * 手動を1度でも使った日や、カードを置いていない日は、その日の点。
 */
function officialResult(): DayResult {
  const st = stage();
  const day = computeScore(state.stats, st.stars);
  const rules = currentRules();
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
  const openBefore = openCount();
  bestStars[stageIdx] = Math.max(bestStars[stageIdx] ?? 0, dayResult.stars);
  newCards = nextUnlock(unlocked);
  unlocked = [...unlocked, ...newCards];
  const openAfter = openCount();
  prepareProgress(openAfter > openBefore ? openAfter - 1 : null);
  persist(nextStageIdx);
  setMode('result');
  // 1日の終わりの広告(出なくても、そのまま結果画面を使える)。広告が始まったら音を止め、終わったら戻す
  adBusy = true;
  void platform.midgame({
    onAdStart: () => sound.setHidden(true),
    onAdEnd: () => sound.setHidden(document.hidden),
  }).then(() => { adBusy = false; });
  // 結果画面の演出(星が1つずつ現れる・カードが光って現れる: render.ts の drawResult)に合わせて鳴らす
  for (let i = 0; i < dayResult.stars; i++) setTimeout(() => sfx('star'), 250 + i * 300 + 120);
  if (newCards.length > 0) setTimeout(() => sfx('unlock'), 1400);
}

/**
 * 1日の終わりに、次の日の準備をしておく(結果画面のままページを閉じても、保存に反映されるように)。
 * 新しいステージが開いたら、次の日はそこへ移る。
 * カードは自動で枠に置かない(2026-11-20 ユーザー決定。置き方は編集画面の指の手本で示す)。
 */
function prepareProgress(openedStage: number | null): void {
  nextStageIdx = openedStage ?? stageIdx;
}

/** 結果画面の「やり直し」: 準備しておいた次の日へ */
function prepareNextDay(): void {
  stageIdx = nextStageIdx;
  rulesByStage[stageIdx] = currentLayout();
  newCards = [];
  newDay();
}

/** 結果画面が出た直後の誤タップでやり直さないための待ち時間 */
const RESULT_INPUT_DELAY_MS = 700;

/** 共有文字列を読み込んで、そのステージの枠に置く。結果を図で示すための区分を返す */
function importShared(text: string): Feedback {
  const d = decodeShare(text);
  if (!d.ok) { sfx('error'); return 'error'; }
  const r = applyShared(d.value, STAGES, openCount(), unlocked, slotCountFor(unlocked));
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
    rulesByStage[i] = fitLayout([], st.building.elevators, 0, []);
  });
  stageIdx = 0;
  editRow = 0;
  drag = null;
  previewCard = null;
  tutorial = { taps: 0, placed: false };
  if (saving) resetSave(store, { sfx: sound.sfxLevel, music: sound.musicLevel });
  newDay();
  // 最初からのやり直しも、開始画面を挟まずにすぐ遊べる状態にする
  setMode('playing');
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
  if (inRect(RESET_BUTTON, x, y, PAD_BUTTON)) {
    sfx('click');
    drag = null;
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
  const tab = stageTabHit(x, y, openCount());
  if (tab !== null) {
    sfx('click');
    drag = null;
    stageIdx = tab;
    newDay();
    persist();
    return;
  }
  const slots = slotCountFor(unlocked);
  const lay = currentLayout();
  const hit = editorHit(x, y, lay.length, slots, unlocked.length);
  if (!hit) return;
  if (hit.kind === 'play') {
    sfx('click');
    newDay();
    setMode('playing');
    return;
  }
  if (hit.kind === 'row') {
    sfx('click');
    editRow = hit.row;
    return;
  }
  // カードに触れた: 引っ張り始める(動かさずに離したら、説明を見せるだけ)
  if (hit.kind === 'hand') {
    const c = unlocked[hit.index]!;
    drag = { card: c, from: { kind: 'hand', index: hit.index }, x0: x, y0: y, x, y, moved: false };
    return;
  }
  editRow = hit.row;
  const c = lay[hit.row]?.[hit.index] ?? null;
  if (c) drag = { card: c, from: { kind: 'slot', row: hit.row, slot: hit.index }, x0: x, y0: y, x, y, moved: false };
}

/** 引っ張っている間: カードを指に付いてこさせる */
function onReadyMove(x: number, y: number): void {
  if (!drag) return;
  drag.x = x;
  drag.y = y;
  if (!drag.moved && Math.hypot(x - drag.x0, y - drag.y0) >= DRAG_THRESHOLD) drag.moved = true;
}

/** 引っ張っているカードを、いま指がある枠に置いたらどうなるか(枠の上でなければ null) */
function dropTarget(d: Drag): { row: number; slot: number } | null {
  const lay = currentLayout();
  const hit = editorHit(d.x, d.y, lay.length, slotCountFor(unlocked), unlocked.length);
  return hit && hit.kind === 'slot' ? { row: hit.row, slot: hit.index } : null;
}

function applyDrop(d: Drag, t: { row: number; slot: number }): SlotLayout {
  const lay = currentLayout();
  return d.from.kind === 'hand' ? dropFromHand(lay, t.row, t.slot, d.card) : moveSlot(lay, d.from.row, d.from.slot, t.row, t.slot);
}

/** 指を離した: 枠の上なら置く・入れ替える。枠のカードを枠の外で離したら外す。動かさずに離したら説明を見せるだけ */
function onReadyUp(): void {
  const d = drag;
  drag = null;
  if (!d) return;
  if (!d.moved) {
    sfx('click');
    previewCard = previewCard === d.card ? null : d.card;
    return;
  }
  const t = dropTarget(d);
  if (t) {
    rulesByStage[stageIdx] = applyDrop(d, t);
    editRow = t.row;
    tutorial.placed = true;
    previewCard = null;
    sfx('board');
    persist();
    return;
  }
  if (d.from.kind === 'slot') {
    rulesByStage[stageIdx] = removeAt(currentLayout(), d.from.row, d.from.slot);
    sfx('click');
    persist();
  }
}

/**
 * 指の手本: 枠が全部空なら、手持ちのカードから枠へ引っ張る動きを見せる
 * (カードを自動で置かなくなったので、新しいステージでも毎回ここで示す)
 */
function editorHint(): { hand: number; row: number; slot: number } | null {
  if (unlocked.length === 0 || drag) return null;
  const lay = currentLayout();
  if (lay.some((r) => r.some((c) => c !== null))) return null;
  return { hand: 0, row: editRow, slot: 0 };
}

canvas.addEventListener('pointerdown', (ev) => {
  ev.preventDefault();
  if (isShareDialogOpen()) return;
  // 音は利用者の操作の中でしか出せるようにならないので、タップのたびに準備する(2回目以降は何もしない)
  sound.unlock();
  const rect = canvas.getBoundingClientRect();
  const p = toLogical(view, ev.clientX - rect.left, ev.clientY - rect.top);
  // 音量の窓: スピーカーのボタンで開け閉めする。開いている間のタップは窓だけが受け取る(後ろのゲームには届かない)
  if (inRect(MUTE_BUTTON, p.x, p.y, PAD_MUTE)) {
    volumeOpen = !volumeOpen;
    sfx('click');
    return;
  }
  if (volumeOpen) {
    const hit = volumeHit(p.x, p.y);
    if (hit === null) {
      volumeOpen = false;
    } else if (hit !== 'panel') {
      if (hit.row === 'sfx') sound.sfxLevel = hit.level;
      else sound.musicLevel = hit.level;
      // 効果音の段を変えたときは、その大きさで確かめの音を鳴らす
      sfx('click');
      persist();
    }
    return;
  }
  if (mode === 'ready') {
    canvas.setPointerCapture?.(ev.pointerId);
    onReadyTap(p.x, p.y);
    return;
  }
  if (mode === 'result') {
    if (adBusy) return;
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

function toLogicalEv(ev: PointerEvent): { x: number; y: number } {
  const rect = canvas.getBoundingClientRect();
  return toLogical(view, ev.clientX - rect.left, ev.clientY - rect.top);
}
canvas.addEventListener('pointermove', (ev) => {
  if (mode !== 'ready' || !drag) return;
  const p = toLogicalEv(ev);
  onReadyMove(p.x, p.y);
});
for (const type of ['pointerup', 'pointercancel'] as const) {
  canvas.addEventListener(type, (ev) => {
    if (mode !== 'ready' || !drag) return;
    if (type === 'pointercancel') { drag = null; return; }
    const p = toLogicalEv(ev);
    onReadyMove(p.x, p.y);
    onReadyUp();
  });
}

// iPhone の Safari では、指を離したときの操作でないと音の許可にならないことがあるので、ここでも準備する
for (const type of ['pointerup', 'touchend', 'click'] as const) {
  window.addEventListener(type, () => sound.unlock(), { capture: true, passive: true });
}
document.addEventListener('visibilitychange', () => sound.setHidden(document.hidden));

const DT = 1000 / TICKS_PER_SECOND;
const MAX_STEPS_PER_FRAME = 5;
let acc = 0;
let last = performance.now();

/**
 * 最初の1人で止めて待つ(2026-11-25、CrazyGames の品質ガイドライン「説明はゲームの中で、絵で」)。
 * カードを持っていない最初の日に、まだ一度も指示していなければ、最初の人が乗り場に着いたところで時間を止め、
 * 指の絵(playHint)がその階を指したまま、プレイヤーが階をタップするのを待つ。手動の日なので点数の再現には関係しない。
 */
function onboardingHold(): boolean {
  return unlocked.length === 0 && tutorial.taps === 0 &&
    state.passengers.some((p) => p.state === 'waiting' && p.spawnTick <= state.tick);
}

/** 撮影専用: ?cover=landscape|portrait|square なら投稿用の表紙の画像だけを描く(本番ビルドには入らない) */
const COVER: CoverKind | null = (() => {
  if (!DEBUG_HOOKS) return null;
  const v = new URLSearchParams(location.search).get('cover');
  return v === 'landscape' || v === 'portrait' || v === 'square' || v === 'itch' ? v : null;
})();

function frame(now: number): void {
  // BGM はプレイ中だけ。公開先の設定で音を消すよう求められていれば流さない(消音ボタンの設定は SoundPlayer の中で見る)
  sound.setMusic(mode === 'playing' && !platform.forcedMute(), stage().look);
  sound.tickMusic();
  if (COVER) {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    drawCover(ctx, cssW, cssH, COVER);
    requestAnimationFrame(frame);
    return;
  }
  // 編集画面: 試しに動かす窓を進める(ルールや持ち上げたカードが変わったら作り直す)
  if (mode === 'ready' && unlocked.length > 0) {
    const st = stage();
    const cfg = { building: st.building, traffic: st.traffic };
    const t = drag && drag.moved ? dropTarget(drag) : null;
    const sets = t && drag
      ? [currentRules(), compactLayout(applyDrop(drag, t))]
      : previewRuleSets(currentRules(), editRow, previewCard, slotCountFor(unlocked));
    simPreview = ensurePreview(simPreview, cfg, st.seed, sets, t ? t.row : editRow, t && drag ? drag.card : previewCard);
    previewAcc += Math.min(now - last, 250);
    while (previewAcc >= DT) {
      advancePreview(simPreview, cfg, st.seed);
      previewAcc -= DT;
    }
  } else {
    simPreview = null;
    previewAcc = 0;
  }
  acc += Math.min(now - last, 250);
  last = now;
  if (mode !== 'playing' || onboardingHold()) acc = 0;
  let steps = 0;
  while (acc >= DT) {
    prevPos = state.elevators.map((e) => e.pos);
    const phasesBefore = state.elevators.map((e) => e.phase);
    const timeBefore = state.phaseIndex;
    step(state, pending);
    pending = [];
    for (const ev of state.events) {
      if (ev.type === 'delivered') {
        effects.push({ type: 'delivered', floor: ev.floor, elevator: ev.elevator, t0: now, points: ev.points });
        effects.push({ type: 'alight', floor: ev.floor, elevator: ev.elevator, t0: now, dest: ev.dest });
        sfx('deliver');
      } else if (ev.type === 'missed') {
        effects.push({ type: 'missed', floor: ev.floor, elevator: -1, t0: now, points: ev.penalty });
        sfx('miss');
      } else if (ev.type === 'boarded') {
        effects.push({ type: 'board', floor: ev.floor, elevator: ev.elevator, t0: now, dest: ev.dest });
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
    unlocked, slotCount: slotCountFor(unlocked), editRules: currentLayout(), editRow, newCards,
    stagesOpen: openCount(), starGate: nextStarGate(unlocked, STAGES, totalStars()), totalStars: totalStars(), stageIdx, bestStars, muted: sound.muted, audioOk: sound.ok,
    sfxLevel: sound.sfxLevel, musicLevel: sound.musicLevel, volumeOpen,
    drag: drag && drag.moved ? { card: drag.card, x: drag.x, y: drag.y, from: drag.from, target: dropTarget(drag) } : null,
    previewCard: drag?.card ?? previewCard, simPreview: mode === 'ready' && unlocked.length > 0 ? simPreview : null, editorHint: mode === 'ready' ? editorHint() : null,
    stageShapes: STAGES.map((s) => ({ floors: s.building.floors, elevators: s.building.elevators })),
    look: stage().look,
    result: mode === 'result' ? dayResult : null,
    playHint: unlocked.length === 0 && tutorial.taps < 3,
    confirmReset: mode === 'ready' && confirmReset,
    adBusy: mode === 'result' && adBusy,
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
      rulesByStage[stageIdx] = fitLayout(rules, stage().building.elevators, slotCountFor(unlocked), unlocked);
      newDay();
    },
    /** 検証用: 編集画面・最初の画面から1日を始める */
    start() { newDay(); setMode('playing'); },
  };
}

// 初めて遊ぶ人(カードを持っていない)は、開始画面を出さずにすぐ1日目を始める(2026-11-25、CrazyGames の
// 品質ガイドライン「開いたらすぐ遊べる」。Full Launch では必須)。カードを持っている人は編集画面から(開始まで1回のタップ)。
if (unlocked.length === 0) setMode('playing');

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
