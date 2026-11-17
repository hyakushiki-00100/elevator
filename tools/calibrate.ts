// 使い方: node tools/calibrate.ts
// ステージを各ボットで1日回し、時間帯ごとの数字と点数を出す。
import { createSim, step, type SimState } from '../src/sim/sim.ts';
import { computeScore } from '../src/sim/score.ts';
import { STAGES } from '../src/sim/stages.ts';
import { expertBot, greedyBot, idleBot, type Bot } from './bots.ts';

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

for (let i = 0; i < STAGES.length; i++) {
  console.log(`== stage ${STAGES[i]!.id}`);
  for (const [name, bot] of [['idle', idleBot], ['greedy', greedyBot], ['expert', expertBot]] as const) {
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
