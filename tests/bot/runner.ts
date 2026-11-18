import { UNITS_PER_FLOOR } from '../../src/sim/building.ts';
import { computeScore, type ScoreResult } from '../../src/sim/score.ts';
import { createSim, step, type SimState } from '../../src/sim/sim.ts';
import type { Stage } from '../../src/sim/stages.ts';
import type { CardId } from '../../src/sim/rules.ts';
import { greedyBot, idleBot, type Bot } from './bots.ts';
import { presetsFor } from './presets.ts';

// 自動プレイボットで1日を最後まで遊ばせ、途中の異常を検出する(CLAUDE.md 6章「完了前の自動確認」)。

export interface BotSpec {
  /** idle / greedy-manual / preset-rules:<組み合わせ名> */
  name: string;
  /** 手動操作の代わり(毎tick呼ぶ) */
  bot: Bot;
  /** カード(なければ手動のみ) */
  rules?: CardId[][];
}

/** 全ステージ共通のボット一覧(preset-rules はエレベーターの数で変わる) */
export function botsFor(stage: Stage): BotSpec[] {
  return [
    { name: 'idle', bot: idleBot },
    { name: 'greedy-manual', bot: greedyBot },
    ...presetsFor(stage.building.elevators).map((p) => ({ name: `preset-rules:${p.name}`, bot: idleBot, rules: p.rules })),
  ];
}

export class BotCheckError extends Error {}

/** 1tickごとの不変条件。破れていたら BotCheckError */
function checkInvariants(s: SimState, where: string): void {
  const st = s.stats;
  // 乗客の消失・二重計上がない: 発生した人 = 運んだ人 + 取りこぼした人 + まだ建物にいる人
  if (st.spawned !== st.delivered + st.missed + s.passengers.length) {
    throw new BotCheckError(`${where}: 人数の合計が合わない spawned=${st.spawned} delivered=${st.delivered} missed=${st.missed} inBuilding=${s.passengers.length}`);
  }
  const maxPos = (s.building.floors - 1) * UNITS_PER_FLOOR;
  for (const e of s.elevators) {
    if (e.pos < 0 || e.pos > maxPos) throw new BotCheckError(`${where}: エレベーター${e.id}の位置が範囲外 pos=${e.pos}`);
    let load = 0;
    for (const p of s.passengers) if (p.state === 'riding' && p.elevatorId === e.id) load += p.size;
    if (load > s.building.capacity) throw new BotCheckError(`${where}: エレベーター${e.id}が定員超過 load=${load}`);
  }
}

export interface DayRow {
  stage: number;
  bot: string;
  seed: number;
  score: number;
  stars: number;
  delivered: number;
  missed: number;
  spawned: number;
  avgWaitSec: number;
  ticks: number;
}

/** 1日を最後まで遊ばせる。例外・無限ループ・不変条件の違反は BotCheckError */
export function runDay(stage: Stage, spec: BotSpec, seed: number): DayRow {
  const where = `stage${stage.id} ${spec.name} seed=${seed}`;
  let s: SimState;
  try {
    s = createSim({ building: stage.building, traffic: stage.traffic, rules: spec.rules }, seed);
  } catch (e) {
    throw new BotCheckError(`${where}: 作成時の例外 ${String(e)}`);
  }
  // 1日の長さ + 延長時間を過ぎても終わらなければ無限ループとみなす
  const limit = s.dayTicks + stage.traffic.overtimeTicks + 1;
  while (!s.finished) {
    try {
      step(s, spec.bot(s));
    } catch (e) {
      throw new BotCheckError(`${where} tick=${s.tick}: 例外 ${String(e)}`);
    }
    checkInvariants(s, `${where} tick=${s.tick}`);
    if (s.tick > limit) throw new BotCheckError(`${where}: ${limit}tick を過ぎても1日が終わらない(無限ループ)`);
  }
  if (s.passengers.length !== 0) throw new BotCheckError(`${where}: 1日が終わったのに建物に人が残っている`);
  const sc: ScoreResult = computeScore(s.stats, stage.stars);
  return {
    stage: stage.id, bot: spec.name, seed,
    score: sc.score, stars: sc.stars, delivered: sc.delivered, missed: sc.missed,
    spawned: s.stats.spawned, avgWaitSec: sc.avgWaitSec, ticks: s.tick,
  };
}

/** 集計: ステージ×ボットごとの平均・最小・最大・ばらつき */
export interface Summary {
  stage: number;
  bot: string;
  n: number;
  mean: number;
  min: number;
  max: number;
  /** 変動係数(標準偏差 ÷ 平均)。平均0なら0 */
  cv: number;
  meanStars: number;
  meanMissed: number;
  meanWait: number;
}

export function summarize(rows: readonly DayRow[]): Summary[] {
  const groups = new Map<string, DayRow[]>();
  for (const r of rows) {
    const k = `${r.stage}\u0000${r.bot}`;
    const g = groups.get(k);
    if (g) g.push(r); else groups.set(k, [r]);
  }
  const out: Summary[] = [];
  for (const g of groups.values()) {
    const n = g.length;
    const mean = g.reduce((a, r) => a + r.score, 0) / n;
    const sd = Math.sqrt(g.reduce((a, r) => a + (r.score - mean) ** 2, 0) / n);
    out.push({
      stage: g[0]!.stage, bot: g[0]!.bot, n, mean,
      min: Math.min(...g.map((r) => r.score)), max: Math.max(...g.map((r) => r.score)),
      cv: mean > 0 ? sd / mean : 0,
      meanStars: g.reduce((a, r) => a + r.stars, 0) / n,
      meanMissed: g.reduce((a, r) => a + r.missed, 0) / n,
      meanWait: g.reduce((a, r) => a + r.avgWaitSec, 0) / n,
    });
  }
  return out;
}

/** ばらつきが大きいとみなす変動係数(暫定の基準) */
export const CV_LIMIT = 0.15;

/**
 * 調整候補(CLAUDE.md 6章の3条件)。星は1日ごとに判定し、その平均を見る。
 * - idle でも星1が取れる(簡単すぎる): idle の平均点が星1の閾値以上
 * - preset-rules の最良でも星1が取れない(難しすぎる): 最良の平均点が星1の閾値未満
 * - シードによって点数が大きくぶれる: greedy-manual か preset-rules の最良の変動係数が CV_LIMIT を超える
 */
export function flags(stage: Stage, sums: readonly Summary[]): string[] {
  const mine = sums.filter((s) => s.stage === stage.id);
  const out: string[] = [];
  const idle = mine.find((s) => s.bot === 'idle');
  if (idle && idle.mean >= stage.stars[0]) out.push(`簡単すぎる: idle の平均 ${Math.round(idle.mean)} が星1の閾値 ${stage.stars[0]} 以上`);
  const presets = mine.filter((s) => s.bot.startsWith('preset-rules:')).sort((a, b) => b.mean - a.mean);
  const best = presets[0];
  if (best && best.mean < stage.stars[0]) out.push(`難しすぎる: preset-rules の最良(${best.bot})の平均 ${Math.round(best.mean)} が星1の閾値 ${stage.stars[0]} 未満`);
  for (const s of [mine.find((x) => x.bot === 'greedy-manual'), best]) {
    if (s && s.cv > CV_LIMIT) out.push(`運の要素が強い: ${s.bot} の変動係数 ${(s.cv * 100).toFixed(1)}% が ${CV_LIMIT * 100}% を超える(最小 ${s.min} / 最大 ${s.max})`);
  }
  return out;
}
