// 使い方: npm run check:screens
//   (撮影専用ビルド vite build --mode screenshot を out/build-screenshot に作ってから、このスクリプトを動かす)
// 各ステージの 編集画面・開始時・朝のラッシュ中・終了時 を、横長と縦長の両方で out/screenshots/ に保存する。
// 機械的な検査: コンソールエラー・ページの例外・真っ黒な画面(背景色以外がほぼない)があれば終了コード1。
// 表示崩れ・文字の切れ・はみ出しは、保存した画像を目で確かめる(CLAUDE.md 6章「完了前の自動確認」)。
import { preview } from 'vite';
import { STAGES } from '../src/sim/stages.ts';
import type { CardId } from '../src/sim/rules.ts';

// ---- Node の機能(@types/node を入れないため型なしで取り出す) ----
type Proc = { exitCode?: number; getBuiltinModule(name: string): unknown };
const proc = (globalThis as unknown as { process: Proc }).process;
const fs = proc.getBuiltinModule('fs') as { mkdirSync(p: string, o: { recursive: boolean }): void };
const { createRequire } = proc.getBuiltinModule('module') as { createRequire(url: string): (id: string) => unknown };

// ---- Playwright(package.json には入れていない。手元では npm i -D playwright と npx playwright install chromium が必要) ----
interface Page {
  goto(url: string): Promise<unknown>;
  waitForFunction(fn: string): Promise<unknown>;
  waitForTimeout(ms: number): Promise<void>;
  evaluate<T>(fn: string): Promise<T>;
  screenshot(o: { path: string }): Promise<unknown>;
  on(ev: string, cb: (x: { type?: () => string; text?: () => string; toString(): string }) => void): void;
  close(): Promise<void>;
}
interface Browser { newPage(o: { viewport: { width: number; height: number } }): Promise<Page>; close(): Promise<void> }
let chromium: { launch(): Promise<Browser> };
try {
  chromium = (createRequire(import.meta.url)('playwright') as { chromium: typeof chromium }).chromium;
} catch {
  console.error('Playwright が見つかりません。手元のPCでは次を実行してください(入院前に、速い回線で):');
  console.error('  npm install -D playwright');
  console.error('  npx playwright install chromium');
  proc.exitCode = 1;
  throw new Error('playwright not found');
}

const VIEWPORTS = [
  { name: 'landscape', width: 1280, height: 720 },
  { name: 'portrait', width: 390, height: 844 },
] as const;

/** 撮影時に置くカード(各ステージで3★に届く組み合わせ。CLAUDE.md 9.5節) */
const RULES_FOR_STAGE: Record<number, CardId[][]> = {
  1: [['sameDir', 'nearest']],
  2: [['nearest'], ['nearest']],
  3: [['express', 'nearest']],
  4: [['zoneLow', 'nearest'], ['zoneHigh', 'nearest']],
};

/** 朝のラッシュ中として撮る時刻(tick)。朝の時間帯の終わり近く */
const RUSH_TICK = 1500;

/**
 * 画面の中で「左上の画素と違う色」の画素の割合。真っ黒・真っ白など、一色だけの画面の検出に使う
 * (左上は余白か背景なので、何かが描かれていればそれと違う色の画素がある)。
 * 透明(何も描かれていない)キャンバスも一色として扱われる。
 */
const CONTENT_RATIO = `(() => {
  const c = document.querySelector('canvas');
  if (!c) return 0;
  const data = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
  const r0 = data[0], g0 = data[1], b0 = data[2], a0 = data[3];
  let n = 0, total = 0;
  for (let i = 0; i < data.length; i += 4 * 7) {
    total++;
    const d = Math.abs(data[i] - r0) + Math.abs(data[i + 1] - g0) + Math.abs(data[i + 2] - b0) + Math.abs(data[i + 3] - a0);
    if (d > 24) n++;
  }
  return total === 0 ? 0 : n / total;
})()`;
const MIN_CONTENT = 0.05;

const server = await preview({ preview: { port: 4179, strictPort: true }, build: { outDir: 'out/build-screenshot' } });
const base = server.resolvedUrls?.local[0] ?? 'http://localhost:4179/';
fs.mkdirSync('out/screenshots', { recursive: true });

const problems: string[] = [];
const saved: string[] = [];
const browser = await chromium.launch();

async function shot(page: Page, file: string): Promise<void> {
  const path = `out/screenshots/${file}.png`;
  await page.screenshot({ path });
  saved.push(path);
  const ratio = await page.evaluate<number>(CONTENT_RATIO);
  if (ratio < MIN_CONTENT) problems.push(`${file}: 真っ黒な画面の疑い(背景色以外の画素 ${(ratio * 100).toFixed(1)}%)`);
}

async function openPage(vp: (typeof VIEWPORTS)[number], query: string, label: string): Promise<Page> {
  const page = await browser.newPage({ viewport: { width: vp.width, height: vp.height } });
  page.on('console', (m) => { if (m.type?.() === 'error') problems.push(`${label}: コンソールエラー ${m.text?.()}`); });
  page.on('pageerror', (e) => problems.push(`${label}: ページの例外 ${e.toString()}`));
  await page.goto(`${base}${query}`);
  await page.waitForFunction('window.__dev !== undefined');
  await page.waitForTimeout(300);
  return page;
}

try {
  for (const vp of VIEWPORTS) {
    // 最初の画面(カードなし)
    const first = await openPage(vp, '', `${vp.name} 最初の画面`);
    await shot(first, `${vp.name}-title`);
    await first.close();

    for (const st of STAGES) {
      const label = `${vp.name} ステージ${st.id}`;
      const page = await openPage(vp, `?cards=all&stage=${st.id}`, label);
      await page.evaluate(`window.__dev.setRules(${JSON.stringify(RULES_FOR_STAGE[st.id] ?? [])})`);
      await page.waitForTimeout(200);
      await shot(page, `${vp.name}-stage${st.id}-1-editor`);
      await page.evaluate('window.__dev.start()');
      await page.waitForTimeout(400);
      await page.evaluate('window.__dev.fastForward(60)');
      await page.waitForTimeout(300);
      await shot(page, `${vp.name}-stage${st.id}-2-start`);
      await page.evaluate(`window.__dev.fastForward(${RUSH_TICK} - window.__dev.state.tick)`);
      await page.waitForTimeout(300);
      await shot(page, `${vp.name}-stage${st.id}-3-rush`);
      await page.evaluate('window.__dev.fastForward(999999)');
      await page.waitForTimeout(2600); // 結果画面の星とカードの演出が終わるまで
      const mode = await page.evaluate<string>('window.__dev.mode');
      if (mode !== 'result') problems.push(`${label}: 1日の終わりに結果画面にならない(mode=${mode})`);
      await shot(page, `${vp.name}-stage${st.id}-4-end`);
      await page.close();
    }
  }
} finally {
  await browser.close();
  await new Promise<void>((resolve) => server.httpServer.close(() => resolve()));
}

console.log(`${saved.length}枚を保存した:`);
for (const p of saved) console.log(`  ${p}`);
if (problems.length > 0) {
  console.error(`\n問題 ${problems.length}件:`);
  for (const p of problems) console.error(`  ${p}`);
  proc.exitCode = 1;
} else {
  console.log('\n機械的な検査(コンソールエラー・例外・真っ黒な画面・結果画面への遷移): 問題なし');
  console.log('表示崩れ・文字の切れ・はみ出しは、画像を目で確かめること。');
}
