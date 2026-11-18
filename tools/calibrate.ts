// 使い方:
//   node tools/calibrate.ts         各ステージで、手動相当のボットとカードの組み合わせを正式な採点(複数日の平均)で比べる
//   node tools/calibrate.ts seeds   ステージに使うシード(画面で見せる日)の候補を探す
import { createSim, step, type SimState } from '../src/sim/sim.ts';
import { computeScore } from '../src/sim/score.ts';
import { STAGES } from '../src/sim/stages.ts';
import type { CardId } from '../src/sim/rules.ts';
import { daySeed, rateRules, RATING_DAYS } from '../src/sim/evaluate.ts';
import { everyTicks, expertBot, greedyBot, idleBot, type Bot } from './bots.ts';

/** 1日分を回す(ボットの操作つき) */
function play(stageIdx: number, bot: Bot, seed: number, rules?: CardId[][]) {
  const st = STAGES[stageIdx]!;
  const s: SimState = createSim({ building: st.building, traffic: st.traffic, rules }, seed);
  while (!s.finished) {
    step(s, bot(s));
    if (s.tick > 100000) throw new Error('終わらない');
  }
  return { s, score: computeScore(s.stats, st.stars) };
}

/** 較正で試すカードの組み合わせ(エレベーターの数ごと) */
function ruleSetsFor(elevators: number): CardId[][][] {
  const singles: CardId[][] = [
    ['nearest'], ['sameDir', 'nearest'], ['nearest', 'sameDir'], ['urgent', 'nearest'],
    ['sameDir', 'urgent', 'nearest'], ['nearest', 'home'], ['sameDir', 'nearest', 'home'],
  ];
  const all = (r: CardId[]) => Array.from({ length: elevators }, () => r);
  if (elevators === 1) return singles.map((r) => all(r));
  return [
    ...singles.map((r) => all(r)),
    [['zoneLow', 'nearest'], ['zoneHigh', 'nearest']],
    [['zoneLow', 'sameDir', 'nearest'], ['zoneHigh', 'sameDir', 'nearest']],
    [['zoneLow', 'nearest', 'home'], ['zoneHigh', 'nearest', 'home']],
    [['zoneLow', 'nearest'], ['nearest']],
  ];
}

/** 各ステージの比較(正式な採点と同じ RATING_DAYS 日分の平均) */
function report(stageIdx: number): void {
  const st = STAGES[stageIdx]!;
  const seeds = Array.from({ length: RATING_DAYS }, (_, k) => daySeed(st.seed, k));
  console.log(`== stage ${st.id}(星の閾値 ${st.stars.join(' / ')}。点は ${RATING_DAYS} 日平均)`);
  const bots: [string, Bot][] = [['idle', idleBot], ['casual', everyTicks(greedyBot, 30)], ['greedy', greedyBot], ['expert', expertBot]];
  for (const [name, bot] of bots) {
    const scores = seeds.map((seed) => play(stageIdx, bot, seed).score.score);
    const avg = Math.floor(scores.reduce((a, b) => a + b, 0) / scores.length);
    console.log(`  手動相当 ${name.padEnd(7)} 平均=${String(avg).padStart(5)}  (画面の日=${scores[0]}、最小=${Math.min(...scores)}、最大=${Math.max(...scores)})`);
  }
  const rows = ruleSetsFor(st.building.elevators).map((rs) => ({ rs, r: rateRules(st, rs) }));
  rows.sort((a, b) => b.r.score - a.r.score);
  for (const { rs, r } of rows) {
    const label = rs.map((r1) => r1.join(',')).join(' / ');
    console.log(`  rules[${label}]`.padEnd(58) + ` 平均=${String(r.score).padStart(5)} 星=${r.stars}  (画面の日=${r.perDay[0]})`);
  }
}

/**
 * シードの選び方: 正式な点は複数日の平均だが、画面で見せる日(0日目)が極端に軽い・重い日だと
 * 遊んだ印象と点がずれる。発生人数が中央値に近いシードを選ぶ。
 */
function pickSeeds(stageIdx: number): void {
  const st = STAGES[stageIdx]!;
  const rows: { seed: number; spawned: number }[] = [];
  for (let seed = 1000; seed < 1200; seed++) {
    const s = createSim({ building: st.building, traffic: st.traffic }, seed);
    while (!s.finished) step(s);
    rows.push({ seed, spawned: s.stats.spawned });
  }
  const sp = rows.map((r) => r.spawned).sort((a, b) => a - b);
  const median = sp[100]!;
  console.log(`== stage ${st.id} シード候補(1000〜1199) 発生人数の中央値=${median}`);
  rows
    .filter((r) => Math.abs(r.spawned - median) <= 1)
    .slice(0, 8)
    .forEach((r) => console.log(`  seed=${r.seed} spawned=${r.spawned}`));
}

// @types/node を入れないため、process は型なしで参照する(Node の実行専用ツール)
const argv = (globalThis as unknown as { process: { argv: string[] } }).process.argv;

for (let i = 0; i < STAGES.length; i++) {
  if (argv[2] === 'seeds') pickSeeds(i);
  else report(i);
}
