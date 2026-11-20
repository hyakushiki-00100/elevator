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
}

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
  return {
    key,
    runs: sets.map((rules) => startRun(config, rules, seed)),
    shown: 0,
    row,
    added: sets.length > 1 ? added : null,
  };
}

/** 描画の刻み1つ分進める。見せる長さを過ぎたら最初からやり直す */
export function advancePreview(p: Preview, config: Omit<SimConfig, 'rules'>, seed: number): void {
  if (p.shown >= PREVIEW_SHOW || p.runs.some((r) => r.sim.finished)) {
    p.runs = p.runs.map((r) => startRun(config, r.rules, seed));
    p.shown = 0;
    return;
  }
  for (let k = 0; k < PREVIEW_SPEED; k++) for (const r of p.runs) step(r.sim);
  p.shown += PREVIEW_SPEED;
}
