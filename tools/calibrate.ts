// 使い方:
//   node tools/calibrate.ts         ステージを各ボットで1日回し、時間帯ごとの数字と点数を出す
//   node tools/calibrate.ts seeds   ステージに使うシードの候補を探す(平均的な日を選ぶため)
import { createSim, step, type SimState } from '../src/sim/sim.ts';
import { computeScore } from '../src/sim/score.ts';
import { STAGES } from '../src/sim/stages.ts';
import { everyTicks, expertBot, greedyBot, idleBot, type Bot } from './bots.ts';

function play(stageIdx: number, bot: Bot, seed?: number) {
  const st = STAGES[stageIdx]!;
  const s: SimState = createSim({ building: st.building, traffic: st.traffic }, seed ?? st.seed);
  const perPhase = st.traffic.phases.map(() => ({ spawned: 0, missed: 0, delivered: 0, peakWaiting: 0 }));
  let lastPhase = 0;
  while (!s.finished) {
    const before = { ...s.stats };
    step(s, bot(s));
    const ph = s.phaseIndex >= 0 ? s.phaseIndex : lastPhase;
    lastPhase = ph;
    const pp = perPhase[ph]!;
    pp.spawned += s.stats.spawned - before.spawned;
    pp.missed += s.stats.missed - before.missed;
    pp.delivered += s.stats.delivered - before.delivered;
    pp.peakWaiting = Math.max(pp.peakWaiting, s.passengers.filter((p) => p.state === 'waiting').length);
    if (s.tick > 100000) throw new Error('終わらない');
  }
  return { s, perPhase, score: computeScore(s.stats, st.stars) };
}

/**
 * シードの選び方: 固定シードの1日は運のぶれが大きい(上級者ボットが初心者ボットに負ける日もある)。
 * 発生人数が中央値に近く、ボット同士の点の比が平均に近いシードを選ぶ。
 */
function pickSeeds(stageIdx: number): void {
  const st = STAGES[stageIdx]!;
  const score = (seed: number, bot: Bot) => play(stageIdx, bot, seed).score.score;
  const rows: { seed: number; spawned: number; e: number; g: number }[] = [];
  for (let seed = 1000; seed < 1200; seed++) {
    const r = play(stageIdx, expertBot, seed);
    rows.push({ seed, spawned: r.s.stats.spawned, e: r.score.score, g: score(seed, greedyBot) });
  }
  const sp = rows.map((r) => r.spawned).sort((a, b) => a - b);
  const median = sp[100]!;
  const avgRatio = rows.reduce((a, r) => a + r.e, 0) / rows.reduce((a, r) => a + r.g, 0);
  const inverted = rows.filter((r) => r.e < r.g).length / rows.length;
  console.log(`== stage ${st.id} シード候補(1000〜1199)`);
  console.log(`発生人数の中央値=${median} 上級者/初心者の点の比(平均)=${avgRatio.toFixed(3)} 上級者が負けるシード=${(inverted * 100).toFixed(0)}%`);
  rows
    .filter((r) => Math.abs(r.spawned - median) <= 2 && r.e > r.g)
    .sort((a, b) => Math.abs(a.e / a.g - avgRatio) - Math.abs(b.e / b.g - avgRatio))
    .slice(0, 5)
    .forEach((r) => console.log(
      `  seed=${r.seed} spawned=${r.spawned} 上級者=${r.e} 初心者=${r.g} 反応1秒遅い初心者=${score(r.seed, everyTicks(greedyBot, 30))} 比=${(r.e / r.g).toFixed(3)}`,
    ));
}

// @types/node を入れないため、process は型なしで参照する(Node の実行専用ツール)
const argv = (globalThis as unknown as { process: { argv: string[] } }).process.argv;

if (argv[2] === 'seeds') {
  for (let i = 0; i < STAGES.length; i++) pickSeeds(i);
} else {
for (let i = 0; i < STAGES.length; i++) {
  console.log(`== stage ${STAGES[i]!.id}`);
  for (const [name, bot] of [['idle', idleBot], ['casual', everyTicks(greedyBot, 30)], ['greedy', greedyBot], ['expert', expertBot]] as const) {
    const r = play(i, bot);
    const sc = r.score;
    console.log(
      `${name.padEnd(7)} score=${String(sc.score).padStart(5)} stars=${sc.stars} delivered=${sc.delivered} missed=${sc.missed} ` +
      `avgWait=${sc.avgWaitSec.toFixed(1)}s ticks=${r.s.tick}`,
    );
    r.perPhase.forEach((p, k) => console.log(`   phase${k}: spawned=${p.spawned} delivered=${p.delivered} missed=${p.missed} peakWaiting=${p.peakWaiting}`));
  }
  // シードによるばらつき(同じステージを別シードで)
  for (const [name, bot] of [['greedy', greedyBot], ['expert', expertBot]] as const) {
    const scores = Array.from({ length: 20 }, (_, k) => play(i, bot, 5000 + k).score.score).sort((a, b) => a - b);
    console.log(`${name} 20seeds: min=${scores[0]} median=${scores[10]} max=${scores[19]}`);
  }
}
}
