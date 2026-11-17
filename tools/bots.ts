// 較正とテスト用の自動操作(ゲームの機能ではない)。sim の公開APIだけを使う。
import { UNITS_PER_FLOOR } from '../src/sim/building.ts';
import type { Command, SimState } from '../src/sim/sim.ts';

export type Bot = (s: SimState) => Command[];

function waitingFloors(s: SimState): boolean[] {
  const w = new Array<boolean>(s.building.floors).fill(false);
  for (const p of s.passengers) if (p.state === 'waiting') w[p.origin] = true;
  return w;
}

/** 何もしない */
export const idleBot: Bot = () => [];

/** 初心者相当: 空いて止まっているときだけ、一番近い「人が待っている階」へ行く。運んでいる途中では拾わない */
export const greedyBot: Bot = (s) => {
  const cmds: Command[] = [];
  const w = waitingFloors(s);
  for (const e of s.elevators) {
    if (e.phase !== 'idle' || e.manualTarget !== null || e.stops.some(Boolean)) continue;
    const cur = e.pos / UNITS_PER_FLOOR;
    let best = -1;
    for (let d = 0; d < s.building.floors && best < 0; d++) {
      for (const f of [cur - d, cur + d]) {
        if (f >= 0 && f < s.building.floors && w[f]) { best = f; break; }
      }
    }
    if (best >= 0) cmds.push({ type: 'goto', elevator: e.id, floor: best });
  }
  return cmds;
};

/**
 * 上級者相当: 進行方向にある「待っている階」と「降りる階」を順に回る(いわゆる乗り合い運転)。
 * 反応の遅れがない分、人間の上限に近い想定(推測)。
 */
export const expertBot: Bot = (s) => {
  const cmds: Command[] = [];
  const w = waitingFloors(s);
  const floors = s.building.floors;
  for (const e of s.elevators) {
    if (e.phase === 'open' || e.manualTarget !== null) continue;
    const posF = e.pos / UNITS_PER_FLOOR;
    const want = (f: number): boolean => e.stops[f] === true || w[f] === true;
    const pick = (dir: number): number => {
      // dir 方向で、まだ通り過ぎていない最も近い階
      const start = dir > 0 ? Math.ceil(posF) : Math.floor(posF);
      for (let f = start; f >= 0 && f < floors; f += dir) {
        if (f * UNITS_PER_FLOOR === e.pos && e.phase === 'moving') continue;
        if (want(f)) return f;
      }
      return -1;
    };
    let target = pick(e.heading);
    if (target < 0) target = pick(-e.heading);
    if (target < 0) continue;
    if (e.phase === 'moving' && target === e.target) continue;
    if (e.phase === 'idle' && e.stops[target] && target !== posF) continue; // 自動で向かう
    cmds.push({ type: 'goto', elevator: e.id, floor: target });
  }
  return cmds;
};

/** 人間らしさ: k tick に1回しか操作しない(見て、判断して、タップするまでの遅れ) */
export function everyTicks(bot: Bot, k: number): Bot {
  return (s) => (s.tick % k === 0 ? bot(s) : []);
}
