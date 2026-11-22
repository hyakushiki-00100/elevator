import { defineConfig } from 'vite';

// 公開先(CrazyGames など)では、ゲームのファイルを相対パスで参照する決まりがある
// (docs.crazygames.com/requirements/technical: "Use only relative paths ... Never use absolute paths")。
// itch.io も ZIP の中身を自分のフォルダに置くので、相対パスにしておく。
export default defineConfig({
  base: './',
});
