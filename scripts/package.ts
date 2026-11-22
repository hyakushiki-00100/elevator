// アップロード用の ZIP を作る(itch.io: ZIP の一番上に index.html が必要。docs: itch.io/docs/creators/html5)。
// 使い方: npm run package → out/release/rule-the-lift-itch.zip(広告なし)と rule-the-lift-crazygames.zip(CrazyGames の SDK 版)
const proc = (globalThis as { process?: { getBuiltinModule(n: string): unknown } }).process!;
const cp = proc.getBuiltinModule('child_process') as { execFileSync(cmd: string, args: string[], o: { stdio: string; cwd?: string }): void };
const fs = proc.getBuiltinModule('fs') as { mkdirSync(p: string, o: { recursive: boolean }): void; rmSync(p: string, o: { force: boolean }): void };
const path = proc.getBuiltinModule('path') as { resolve(...p: string[]): string };

const out = path.resolve('out/release');
fs.mkdirSync(out, { recursive: true });
for (const [dir, name] of [['dist', 'rule-the-lift-itch.zip'], ['dist-crazygames', 'rule-the-lift-crazygames.zip']] as const) {
  const zip = path.resolve(out, name);
  fs.rmSync(zip, { force: true });
  // フォルダの中身を ZIP の一番上に置く(フォルダごと入れると index.html が一段下になり、itch.io で動かない)
  cp.execFileSync('zip', ['-r', '-q', zip, '.'], { stdio: 'inherit', cwd: path.resolve(dir) });
  console.log(`作成: out/release/${name}`);
}
