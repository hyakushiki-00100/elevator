// 使い方: node tests/bot/balance.ts   (npm run check:bots)
// 全ステージ × ボット × シード1〜20 を画面なしで最後まで遊ばせ、out/balance.csv に記録する。
// 例外・無限ループ・乗客の消失があれば、その場で止めて終了コード1を返す。
import { STAGES } from '../../src/sim/stages.ts';
import { BotCheckError, botsFor, CV_LIMIT, flags, runDay, summarize, type DayRow } from './runner.ts';

// @types/node を入れないため、Node の機能は型なしで取り出す
type Proc = { exitCode?: number; getBuiltinModule(name: string): unknown };
const proc = (globalThis as unknown as { process: Proc }).process;
const fs = proc.getBuiltinModule('fs') as {
  mkdirSync(p: string, o: { recursive: boolean }): void;
  writeFileSync(p: string, d: string): void;
};

const SEEDS = Array.from({ length: 20 }, (_, i) => i + 1);

const rows: DayRow[] = [];
const t0 = performance.now();
try {
  for (const stage of STAGES) {
    for (const spec of botsFor(stage)) {
      for (const seed of SEEDS) rows.push(runDay(stage, spec, seed));
    }
  }
} catch (e) {
  if (e instanceof BotCheckError) {
    console.error(`失敗: ${e.message}`);
    proc.exitCode = 1;
  } else {
    throw e;
  }
}

if (proc.exitCode !== 1) {
  const header = 'stage,bot,seed,score,stars,delivered,missed,spawned,avg_wait_sec,ticks';
  const csv = [header, ...rows.map((r) =>
    [r.stage, `"${r.bot}"`, r.seed, r.score, r.stars, r.delivered, r.missed, r.spawned, r.avgWaitSec.toFixed(2), r.ticks].join(','))].join('\n');
  fs.mkdirSync('out', { recursive: true });
  // Excel で文字化けしないよう UTF-8 の BOM を付ける
  fs.writeFileSync('out/balance.csv', '﻿' + csv + '\n');

  const sums = summarize(rows);
  console.log(`${rows.length}日分を最後まで遊ばせた(例外・無限ループ・乗客の消失なし)。${((performance.now() - t0) / 1000).toFixed(1)}秒`);
  console.log('out/balance.csv に記録した。\n');
  for (const stage of STAGES) {
    console.log(`== ステージ${stage.id}(星の閾値 ${stage.stars.join(' / ')}、シード1〜${SEEDS.length})`);
    const mine = sums.filter((s) => s.stage === stage.id).sort((a, b) => b.mean - a.mean);
    for (const s of mine) {
      console.log(`  ${s.bot.padEnd(30)} 平均=${String(Math.round(s.mean)).padStart(6)} 最小=${String(s.min).padStart(6)} 最大=${String(s.max).padStart(6)} ` +
        `ばらつき=${(s.cv * 100).toFixed(1).padStart(5)}% 星=${s.meanStars.toFixed(2)} 取りこぼし=${s.meanMissed.toFixed(1)} 待ち=${s.meanWait.toFixed(1)}s`);
    }
    const fl = flags(stage, sums);
    console.log(fl.length === 0 ? '  調整候補: なし' : fl.map((f) => `  調整候補: ${f}`).join('\n'));
    console.log('');
  }
  console.log(`(ばらつき = 変動係数。${CV_LIMIT * 100}% を超えると「運の要素が強い」として報告する。基準は暫定)`);
}
