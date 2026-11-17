import type { Hit } from '../render/layout.ts';
import type { Command } from '../sim/sim.ts';

export interface ControlState {
  /** 選択中のエレベーター(2基以上のとき) */
  selected: number | null;
}

export interface TapResult {
  state: ControlState;
  command: Command | null;
}

/**
 * タップの解釈(5.3節)。
 * 1基のとき: 階をタップ → その階へ。
 * 2基以上: エレベーターをタップして選び、次に階をタップ。
 */
export function handleTap(hit: Hit, state: ControlState, elevatorCount: number): TapResult {
  if (hit === null) return { state, command: null };
  if (elevatorCount <= 1) {
    // 1基のときは、かごの上をタップしても「その位置の階」へのタップとして扱う
    return { state: { selected: 0 }, command: { type: 'goto', elevator: 0, floor: hit.floor } };
  }
  if (hit.kind === 'elevator') {
    return { state: { selected: hit.index }, command: null };
  }
  if (state.selected === null) return { state, command: null };
  return { state, command: { type: 'goto', elevator: state.selected, floor: hit.floor } };
}
