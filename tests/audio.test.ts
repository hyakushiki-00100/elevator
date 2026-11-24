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

describe('BGM', () => {
  it('どの曲も8小節で1周し、同じ位置では同じ音になる。音量は効果音より小さい。曲ごとに音が違う', async () => {
    const { musicNotes, MUSIC_LOOP_STEPS, TRACKS } = await import('../src/platform/audio.ts');
    const tracks = Object.keys(TRACKS) as (keyof typeof TRACKS)[];
    expect(tracks.length).toBe(4);
    for (const t of tracks) {
      for (let k = 0; k < MUSIC_LOOP_STEPS; k++) {
        expect(musicNotes(k + MUSIC_LOOP_STEPS, t)).toEqual(musicNotes(k, t));
        for (const n of musicNotes(k, t)) {
          expect(n.vol).toBeLessThanOrEqual(0.08);
          expect(n.freq).toBeGreaterThan(20);
          expect(n.freq).toBeLessThan(2500);
        }
      }
      // 小節の頭には必ずベースが鳴る
      for (let bar = 0; bar < 8; bar++) expect(musicNotes(bar * 8, t).some((n) => n.freq < 200), t).toBe(true);
    }
    const sig = (t: keyof typeof TRACKS) => JSON.stringify(Array.from({ length: 16 }, (_, k) => musicNotes(k, t)));
    expect(new Set(tracks.map(sig)).size).toBe(4);
  });
  it('音の準備の前に BGM を頼んでも例外を出さない', async () => {
    const { SoundPlayer } = await import('../src/platform/audio.ts');
    const p = new SoundPlayer();
    expect(() => { p.setMusic(true); p.setMusic(false); }).not.toThrow();
  });
});

describe('音量の段階', () => {
  it('段階の倍率は 無=0 < 小 < 中 < 大=1。段階の判定', async () => {
    const { LEVEL_GAIN, isVolumeLevel, SoundPlayer } = await import('../src/platform/audio.ts');
    expect(LEVEL_GAIN[0]).toBe(0);
    expect(LEVEL_GAIN[3]).toBe(1);
    for (let i = 1; i < 4; i++) expect(LEVEL_GAIN[i]!).toBeGreaterThan(LEVEL_GAIN[i - 1]!);
    expect([0, 1, 2, 3].every(isVolumeLevel)).toBe(true);
    expect([4, -1, 1.5, '2', null].some(isVolumeLevel)).toBe(false);
    const p = new SoundPlayer();
    expect([p.sfxLevel, p.musicLevel, p.muted]).toEqual([3, 2, false]);
    p.sfxLevel = 0; p.musicLevel = 0;
    expect(p.muted).toBe(true);
  });
});

