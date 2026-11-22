// 投稿用の素材を作る(CrazyGames の決まり: docs.crazygames.com/requirements/game-covers、2026-11-22 に確認)。
// - 表紙の画像3枚: 横長 1920x1080 / 縦長 800x1200 / 正方形 800x800(文字はタイトルだけ)
// - 紹介動画2本: 横長 1080p(16:9)/ 縦長 1080p(2:3)。15〜20秒、音なし、最初のコマは表紙
// 使い方: npm run promo(撮影専用ビルドを作ってから、out/promo/ に書き出す)。ffmpeg(H.264)が必要。
import { preview } from 'vite';

const proc = (globalThis as { process?: { getBuiltinModule(n: string): unknown; exit(code: number): never } }).process!;
const { createRequire } = proc.getBuiltinModule('module') as { createRequire(url: string): (id: string) => unknown };
const fs = proc.getBuiltinModule('fs') as {
  mkdirSync(p: string, o: { recursive: boolean }): void; readdirSync(p: string): string[]; renameSync(a: string, b: string): void;
  rmSync(p: string, o: { recursive: boolean; force: boolean }): void;
};
const cp = proc.getBuiltinModule('child_process') as { execFileSync(cmd: string, args: string[], o: { stdio: string }): void };

interface Page {
  goto(url: string): Promise<unknown>;
  waitForFunction(fn: string): Promise<unknown>;
  waitForTimeout(ms: number): Promise<void>;
  evaluate<T = unknown>(fn: string): Promise<T>;
  screenshot(o: { path: string }): Promise<unknown>;
}
interface Context { newPage(): Promise<Page>; close(): Promise<void> }
interface Browser {
  newContext(o: { viewport: { width: number; height: number }; deviceScaleFactor?: number; recordVideo?: { dir: string; size: { width: number; height: number } } }): Promise<Context>;
  close(): Promise<void>;
}
const { chromium } = createRequire(import.meta.url)('playwright') as { chromium: { launch(): Promise<Browser> } };

const OUT = 'out/promo';
fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });

const server = await preview({ preview: { port: 4196, strictPort: true }, build: { outDir: 'out/build-screenshot' } });
const base = 'http://localhost:4196/';
const browser = await chromium.launch();

// ---- 表紙の画像 ----
const covers = [
  { kind: 'landscape', w: 1920, h: 1080 },
  { kind: 'portrait', w: 800, h: 1200 },
  { kind: 'square', w: 800, h: 800 },
];
for (const c of covers) {
  const ctx = await browser.newContext({ viewport: { width: c.w, height: c.h }, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  await page.goto(`${base}?cover=${c.kind}`);
  await page.waitForTimeout(800);
  await page.screenshot({ path: `${OUT}/cover-${c.kind}-${c.w}x${c.h}.png` });
  await ctx.close();
  console.log(`表紙: ${OUT}/cover-${c.kind}-${c.w}x${c.h}.png`);
}

// ---- 紹介動画の元(横長で録画し、縦長は建物の部分を切り出す) ----
const rawDir = `${OUT}/raw`;
const t0 = Date.now();
const vctx = await browser.newContext({ viewport: { width: 1920, height: 1080 }, recordVideo: { dir: rawDir, size: { width: 1920, height: 1080 } } });
const page = await vctx.newPage();
await page.goto(`${base}?cards=all&stage=2`);
await page.waitForFunction('window.__dev !== undefined');
await page.evaluate('window.__dev.setRules([["sameDir","nearest"],["sameDir","nearest"]])');
await page.evaluate('window.__dev.start()');
// 朝のラッシュの途中から見せる(始まりは人が少ないため)
await page.evaluate('window.__dev.fastForward(1500)');
const startSec = (Date.now() - t0) / 1000 + 0.3;
await page.waitForTimeout(19000);
await vctx.close();
const raw = `${rawDir}/${fs.readdirSync(rawDir).find((f) => f.endsWith('.webm'))!}`;

const ffmpeg = (args: string[]): void => cp.execFileSync('ffmpeg', ['-y', '-loglevel', 'error', ...args], { stdio: 'inherit' });
const CLIP = 17; // 表紙1秒+録画17秒=18秒(決まりは15〜20秒)
// 横長: 表紙1秒 → 録画
ffmpeg([
  '-loop', '1', '-t', '1', '-i', `${OUT}/cover-landscape-1920x1080.png`,
  '-ss', startSec.toFixed(2), '-t', String(CLIP), '-i', raw,
  '-filter_complex', '[0:v]scale=1920:1080,setsar=1,fps=30[a];[1:v]scale=1920:1080,setsar=1,fps=30[b];[a][b]concat=n=2:v=1:a=0[v]',
  '-map', '[v]', '-an', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '20', `${OUT}/video-landscape-1920x1080.mp4`,
]);
// 縦長(2:3): 録画の建物の部分(シャフトと行列)を切り出して 1080x1620 に。表紙1秒 → 録画
ffmpeg([
  '-loop', '1', '-t', '1', '-i', `${OUT}/cover-portrait-800x1200.png`,
  '-ss', startSec.toFixed(2), '-t', String(CLIP), '-i', raw,
  '-filter_complex', '[0:v]scale=1080:1620,setsar=1,fps=30[a];[1:v]crop=720:1080:560:0,scale=1080:1620,setsar=1,fps=30[b];[a][b]concat=n=2:v=1:a=0[v]',
  '-map', '[v]', '-an', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '20', `${OUT}/video-portrait-1080x1620.mp4`,
]);
fs.rmSync(rawDir, { recursive: true, force: true });
console.log(`動画: ${OUT}/video-landscape-1920x1080.mp4 / ${OUT}/video-portrait-1080x1620.mp4`);

await browser.close();
await new Promise<void>((resolve) => server.httpServer.close(() => resolve()));
