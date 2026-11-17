import { makeBuilding, TICKS_PER_SECOND } from './sim/building.ts';
import { addPassenger, createSim, step, type Command, type SimState } from './sim/sim.ts';
import { makeTraffic } from './sim/traffic.ts';
import { draw } from './render/render.ts';
import { hitTest, makeLayout, makeView, toLogical, type View } from './render/layout.ts';
import { handleTap, type ControlState } from './ui/controls.ts';

const canvas = document.createElement('canvas');
document.getElementById('app')!.append(canvas);
const ctx = canvas.getContext('2d')!;

// 2日目の暫定設定。ステージの仕組みは後日。
const config = {
  building: makeBuilding({ floors: 5, elevators: 1, capacity: 8 }),
  traffic: makeTraffic({ ratePerTick: 0.012 }),
};
// 開発時だけ、URLで建物を変えて確認できる(例: ?elevators=2&floors=7)。本番ビルドでは無効。
if (import.meta.env.DEV) {
  const q = new URLSearchParams(location.search);
  const num = (k: string): number | undefined => (q.has(k) ? Number(q.get(k)) : undefined);
  config.building = makeBuilding({
    floors: num('floors') ?? config.building.floors,
    elevators: num('elevators') ?? config.building.elevators,
  });
}
// 乱数のシードはここ(simの外)で決める。simの中では Math.random を使わない。
const seed = (Date.now() & 0x7fffffff) >>> 0;
const state: SimState = createSim(config, seed);
const layout = makeLayout(config.building);

let control: ControlState = { selected: config.building.elevators === 1 ? 0 : null };
let pending: Command[] = [];
let prevPos: number[] = state.elevators.map((e) => e.pos);

let cssW = 0, cssH = 0, dpr = 1;
let view: View = makeView(1, 1);

function resize(): void {
  dpr = window.devicePixelRatio || 1;
  cssW = window.innerWidth;
  cssH = window.innerHeight;
  canvas.width = Math.round(cssW * dpr);
  canvas.height = Math.round(cssH * dpr);
  canvas.style.width = `${cssW}px`;
  canvas.style.height = `${cssH}px`;
  view = makeView(cssW, cssH);
}
window.addEventListener('resize', resize);
resize();

canvas.addEventListener('pointerdown', (ev) => {
  ev.preventDefault();
  const rect = canvas.getBoundingClientRect();
  const p = toLogical(view, ev.clientX - rect.left, ev.clientY - rect.top);
  const hit = hitTest(layout, p.x, p.y, state.elevators.map((e) => e.pos));
  const r = handleTap(hit, control, state.elevators.length);
  control = r.state;
  if (r.command) pending.push(r.command);
});

const DT = 1000 / TICKS_PER_SECOND;
const MAX_STEPS_PER_FRAME = 5;
let acc = 0;
let last = performance.now();

function frame(now: number): void {
  acc += Math.min(now - last, 250);
  last = now;
  let steps = 0;
  while (acc >= DT) {
    prevPos = state.elevators.map((e) => e.pos);
    step(state, pending);
    pending = [];
    acc -= DT;
    if (++steps >= MAX_STEPS_PER_FRAME) {
      acc = 0; // 遅れを取り戻そうとして固まらないようにする
      break;
    }
  }
  draw({
    ctx, cssW, cssH, dpr, view, layout, state, prevPos,
    alpha: acc / DT, selected: control.selected, now,
  });
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// 開発時だけ、検証用に状態を覗けるようにする(本番ビルドには含まれない)
if (import.meta.env.DEV) {
  (window as unknown as Record<string, unknown>).__dev = { state, addPassenger };
}
