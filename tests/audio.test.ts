import { describe, expect, it } from 'vitest';
import { MIN_INTERVAL_MS, RECIPES, shouldPlay, SoundPlayer, type Sfx } from '../src/platform/audio.ts';

describe('効果音', () => {
  it('同じ音は最小間隔より短く続けて鳴らさない。別の音は関係ない', () => {
    const last: Partial<Record<Sfx, number>> = {};
    expect(shouldPlay(last, 'deliver', 1000)).toBe(true);
    last.deliver = 1000;
    expect(shouldPlay(last, 'deliver', 1000 + MIN_INTERVAL_MS.deliver - 1)).toBe(false);
    expect(shouldPlay(last, 'deliver', 1000 + MIN_INTERVAL_MS.deliver)).toBe(true);
    expect(shouldPlay(last, 'miss', 1001)).toBe(true);
  });

  it('すべての音の組み立てが妥当(人に聞こえる周波数・短い長さ・控えめな音量)', () => {
    for (const [name, notes] of Object.entries(RECIPES)) {
      expect(notes.length, name).toBeGreaterThan(0);
      for (const n of notes) {
        expect(n.freq, name).toBeGreaterThanOrEqual(50);
        expect(n.freq, name).toBeLessThanOrEqual(5000);
        expect(n.at + n.dur, name).toBeLessThanOrEqual(0.7);
        expect(n.vol, name).toBeGreaterThan(0);
        expect(n.vol, name).toBeLessThanOrEqual(0.15);
      }
    }
  });

  it('音が出せない環境(AudioContext がない)でも例外を出さない', () => {
    const p = new SoundPlayer();
    expect(() => { p.unlock(); p.play('door'); p.setHidden(true); p.setHidden(false); }).not.toThrow();
  });
});
