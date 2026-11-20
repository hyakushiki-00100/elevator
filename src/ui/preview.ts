// 編集画面の「試しに動かす」窓: 本物のステージのビルを、今のルール(と、持ち上げたカードを足したルール)で動かして見せる。
// 画面の飾りではなく本物の sim を動かすので、見える動きは本番と同じ判断になる(得点や保存には一切関係しない)。
import type { CardId } from '../sim/rules.ts';
import { createSim, step, type SimConfig, type SimState } from '../sim/sim.ts';
import type { RuleSet } from './editor.ts';

/** 見せ始める前に、画面に出さずに進めておく tick(朝の最初は人が少ないため) */
export const PREVIEW_WARMUP = 900;
/** 見せる長さ(tick)。過ぎたら最初からやり直す */
export const PREVIEW_SHOW = 1800;
/** 1回の描画の刻み(1/30秒)ごとに進める tick 数(本番の3倍速) */
export const PREVIEW_SPEED = 3;

export interface PreviewRun {
  rules: RuleSet;
  sim: SimState;
  /** 見せ始めた時点の運んだ人数・取りこぼし(窓にはここからの増分を出す) */
  baseDelivered: number;
  baseMissed: number;
}

export interface Preview {
  key: string;
  runs: PreviewRun[];
  /** 見せ始めてから進めた tick */
  shown: number;
  row: number;
  /** 2つ目の窓で足したカード(並べないときは null) */
  added: CardId | null;
  /** 2つのルールを比べるとき: 動きが分かれる瞬間(見つからなければ空)。比べないときは null */
  branches: Branch[] | null;
  /** 分かれ道を見せている番号と、その中の時間(tick) */
  bIndex: number;
  bT: number;
  /** 比べている2つのルール */
  sets: RuleSet[];
}

/** 分かれ道1つを見せる長さ: 止めて見せる → 道筋を再生 → 止める(tick) */
export const BRANCH_FREEZE = 36;
export const BRANCH_HOLD = 45;
/** 分かれ道の再生の速さ(描画の刻み1つで進める tick) */
export const BRANCH_SPEED = 2;

/**
 * 比べるルールの組を作る。持ち上げたカードがなければ今のルールだけ。
 * あれば [今のルール, そのカードを選択中の行の先頭に足したルール](枠からあふれる分は後ろから外す)。
 * 足しても変わらない(すでに先頭にある)ときは、今のルールだけ。
 */
export function previewRuleSets(base: RuleSet, row: number, held: CardId | null, slots: number): RuleSet[] {
  const copy = base.map((r) => [...r]);
  if (!held || row < 0 || row >= copy.length) return [copy];
  const after = base.map((r) => [...r]);
  const r = after[row]!.filter((c) => c !== held);
  r.unshift(held);
  after[row] = r.slice(0, Math.max(1, slots));
  if (JSON.stringify(after) === JSON.stringify(copy)) return [copy];
  return [copy, after];
}

function startRun(config: Omit<SimConfig, 'rules'>, rules: RuleSet, seed: number): PreviewRun {
  const sim = createSim({ ...config, rules }, seed);
  for (let i = 0; i < PREVIEW_WARMUP && !sim.finished; i++) step(sim);
  return { rules, sim, baseDelivered: sim.stats.delivered, baseMissed: sim.stats.missed };
}

/** ルールの組が変わったときだけ作り直す(同じなら今のものを返す)。sets は previewRuleSets などで作った組 */
export function ensurePreview(
  prev: Preview | null, config: Omit<SimConfig, 'rules'>, seed: number, sets: RuleSet[], row: number, added: CardId | null,
): Preview {
  const key = `${seed}|${row}|${JSON.stringify(sets)}`;
  if (prev && prev.key === key) return prev;
  const two = sets.length > 1;
  return {
    key,
    // 比べるときは、分かれ道が見つからなかったときのために今のルールだけを動かしておく
    runs: (two ? sets.slice(0, 1) : sets).map((rules) => startRun(config, rules, seed)),
    shown: 0,
    row,
    added: two ? added : null,
    branches: two ? findBranches(config, seed, sets[0]!, sets[1]!, row) : null,
    bIndex: 0,
    bT: 0,
    sets,
  };
}

/** 描画の刻み1つ分進める。見せる長さを過ぎたら最初からやり直す */
export function advancePreview(p: Preview, config: Omit<SimConfig, 'rules'>, seed: number): void {
  if (p.branches && p.branches.length > 0) {
    p.bT += BRANCH_SPEED;
    if (p.bT >= BRANCH_FREEZE + BRANCH_HORIZON + BRANCH_HOLD) {
      p.bT = 0;
      p.bIndex = (p.bIndex + 1) % p.branches.length;
    }
    return;
  }
  if (p.shown >= PREVIEW_SHOW || p.runs.some((r) => r.sim.finished)) {
    p.runs = p.runs.map((r) => startRun(config, r.rules, seed));
    p.shown = 0;
    return;
  }
  for (let k = 0; k < PREVIEW_SPEED; k++) for (const r of p.runs) step(r.sim);
  p.shown += PREVIEW_SPEED;
}

// ---- 分かれ道(2026-11-20): 同じ場面で、2つのルールの行き先が分かれる瞬間を探して見せる ----
// 左右のビルを別々に動かすと、すぐ別の状況になって「カードのせいで動きが変わった」のかが分からない(試遊の感想)。
// そこで、今のルールで1日を進めながら、判断する瞬間ごとに「もう一方のルールならどこへ行くか」を同じ状態から1歩だけ試し、
// 行き先が違った瞬間を集める。

/** sim の状態を丸ごと写す(乱数も含む)。元の状態には触らない */
export function cloneSim(s: SimState): SimState {
  const { rng, config, building, ...rest } = s;
  const copy = structuredClone(rest) as Omit<SimState, 'rng' | 'config' | 'building'>;
  return { ...copy, rng: rng.clone(), config, building };
}

/** この tick の step で、そのエレベーターが行き先を決めるか(待機中、または扉がこの tick に閉まる) */
function aboutToDecide(s: SimState, e: number): boolean {
  const el = s.elevators[e]!;
  return el.phase === 'idle' || (el.phase === 'open' && el.timer <= 1);
}

/** 分かれ道で先を見る長さ(tick)。この間に止まる階の並びを比べる */
export const BRANCH_HORIZON = 180;

export interface Path {
  /** tick ごとのかごの位置(ミリ階) */
  pos: number[];
  /** 扉を開けた階(順に) */
  stops: number[];
  /** 扉を開けた tick(pos の添字) */
  stopAt: number[];
}

export interface Branch {
  /** 判断の直前の状態(窓にはこれを止めて描く) */
  before: SimState;
  elevator: number;
  /** 今のルールで進めた道筋 */
  a: Path;
  /** もう一方のルールで進めた道筋 */
  b: Path;
}

function runPath(from: SimState, rules: RuleSet, e: number, ticks: number): Path {
  const s = cloneSim(from);
  s.elevators.forEach((el, i) => { el.rules = [...(rules[i] ?? [])]; });
  const path: Path = { pos: [], stops: [], stopAt: [] };
  let wasOpen = s.elevators[e]!.phase === 'open';
  for (let t = 0; t < ticks && !s.finished; t++) {
    step(s);
    const el = s.elevators[e]!;
    path.pos.push(el.pos);
    const open = el.phase === 'open';
    if (open && !wasOpen) { path.stops.push(Math.round(el.pos / 1000)); path.stopAt.push(t); }
    wasOpen = open;
  }
  return path;
}

/**
 * 2つのルールで動きが分かれる瞬間を、今のルール(a)で1日を進めながら探す。
 * 判断する瞬間ごとに、同じ状態から両方のルールで BRANCH_HORIZON tick 先まで進め、止まる階の並びが違えば「分かれ道」とする
 * (行き先だけを比べると、「同じ方向を優先」の効き目の大半である「途中の階で拾う」違いを見落とすため)。
 * 見つかった分(最大 max 件)を返す。同じ場面が続かないよう、1件見つけたら minGap tick は探さない。
 */
export function findBranches(
  config: Omit<SimConfig, 'rules'>, seed: number, a: RuleSet, b: RuleSet, row: number,
  max = 4, startTick = 300, minGap = 240,
): Branch[] {
  const sim = createSim({ ...config, rules: a }, seed);
  const out: Branch[] = [];
  let nextAllowed = startTick;
  while (!sim.finished && out.length < max) {
    if (sim.tick >= nextAllowed && aboutToDecide(sim, row)) {
      const pa = runPath(sim, a, row, BRANCH_HORIZON);
      const pb = runPath(sim, b, row, BRANCH_HORIZON);
      if (JSON.stringify(pa.stops) !== JSON.stringify(pb.stops)) {
        out.push({ before: cloneSim(sim), elevator: row, a: pa, b: pb });
        nextAllowed = sim.tick + minGap;
      } else {
        nextAllowed = sim.tick + 15;
      }
    }
    step(sim);
  }
  return out;
}
