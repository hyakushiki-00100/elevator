import { describe, expect, it } from 'vitest';
import {
  emptySave, loadSave, resetSave, parseSave, SAVE_KEY, SAVE_VERSION, serializeSave, writeSave, type KeyValueStore, type SaveData,
} from '../src/platform/storage.ts';

class MemoryStore implements KeyValueStore {
  data = new Map<string, string>();
  getItem(k: string): string | null { return this.data.get(k) ?? null; }
  setItem(k: string, v: string): void { this.data.set(k, v); }
}
class ThrowingStore implements KeyValueStore {
  getItem(): string | null { throw new Error('SecurityError'); }
  setItem(): void { throw new Error('QuotaExceededError'); }
}

const sample: SaveData = {
  version: SAVE_VERSION,
  unlocked: ['nearest', 'sameDir', 'express'],
  bestStars: { 1: 3, 2: 1 },
  rules: { 1: [['sameDir', 'nearest']], 2: [['nearest'], ['express', 'nearest']] },
  lastStage: 2,
  muted: true,
  sfx: 0,
  music: 0,
  tutorial: { taps: 3, placed: true },
  lastScore: { 1: 6704, 2: 5210 },
  bestScore: { 1: 7120, 2: 5210 },
};

describe('進行状況の保存', () => {
  it('書いて読むと同じ内容に戻る', () => {
    const st = new MemoryStore();
    expect(writeSave(st, sample)).toBe(true);
    expect(st.data.has(SAVE_KEY)).toBe(true);
    expect(loadSave(st)).toEqual(sample);
  });

  it('前回の点・自己ベスト(後から足した項目): ない古いデータは空、壊れた値は捨てる', () => {
    const st = new MemoryStore();
    const { lastScore: _l, bestScore: _b, ...old } = sample;
    st.setItem(SAVE_KEY, JSON.stringify(old));
    const a = loadSave(st)!;
    expect(a.lastScore).toEqual({});
    expect(a.bestScore).toEqual({});
    st.setItem(SAVE_KEY, JSON.stringify({ ...sample, lastScore: { 1: 100, 2: -5, x: 3, 3: 1.5 }, bestScore: 'x' }));
    const b = loadSave(st)!;
    expect(b.lastScore).toEqual({ 1: 100 });
    expect(b.bestScore).toEqual({});
  });

  it('保存がなければ null', () => {
    expect(loadSave(new MemoryStore())).toBeNull();
    expect(loadSave(null)).toBeNull();
  });

  it('読み書きで例外が出ても外に出さない(保存できない環境でもゲームは止まらない)', () => {
    const st = new ThrowingStore();
    expect(loadSave(st)).toBeNull();
    expect(writeSave(st, sample)).toBe(false);
    expect(writeSave(null, sample)).toBe(false);
  });

  it('JSONとして読めない・版が違う・形が違う ときは null(最初から)', () => {
    for (const bad of ['{', 'null', '[]', '"x"', '123', JSON.stringify({ ...sample, version: 999 }), JSON.stringify({ unlocked: [] })]) {
      expect(parseSave(bad), bad).toBeNull();
    }
  });

  it('部分的に壊れた値は、その部分だけ捨てる', () => {
    const text = JSON.stringify({
      version: SAVE_VERSION,
      unlocked: ['nearest', 'nope', 42, 'nearest', 'zoneLow'],     // 知らないカード・数値・重複
      bestStars: { 1: 3, 2: 7, 3: -1, 4: 1.5, abc: 2, 0: 2, 5: 2 }, // 範囲外・小数・不正なid
      rules: { 1: [['sameDir', 'bad', 'nearest']], 2: 'x', 3: [[], 'row', ['express']], zz: [['nearest']] },
      lastStage: 'two',
    });
    const d = parseSave(text)!;
    expect(d.unlocked).toEqual(['nearest', 'zoneLow']);
    expect(d.bestStars).toEqual({ 1: 3, 5: 2 });
    expect(d.rules).toEqual({ 1: [['sameDir', 'nearest']], 3: [[], [], ['express']] });
    expect(d.lastStage).toBe(1);
  });

  it('枠は1基あたり5枚まで、エレベーターは8基分まで', () => {
    const text = JSON.stringify({
      version: SAVE_VERSION, unlocked: [], bestStars: {}, lastStage: 1,
      rules: { 1: [['nearest', 'sameDir', 'express', 'zoneLow', 'zoneHigh', 'nearest', 'nearest']], 2: Array.from({ length: 9 }, () => []) },
    });
    const d = parseSave(text)!;
    expect(d.rules[1]![0]).toHaveLength(5);
    expect(d.rules[2]).toBeUndefined();
  });

  it('消音の設定がない古い保存データは「音あり」として読む(版は上げない)', () => {
    const old = JSON.stringify({ version: SAVE_VERSION, unlocked: ['nearest'], bestStars: {}, rules: {}, lastStage: 1 });
    expect(parseSave(old)!.muted).toBe(false);
    expect(parseSave(old)!.tutorial).toEqual({ taps: 0, placed: false });
    expect(parseSave(JSON.stringify({ ...sample, tutorial: { taps: -1, placed: 'x' } }))!.tutorial).toEqual({ taps: 0, placed: false });
    expect(parseSave(JSON.stringify({ ...sample, muted: 'yes' }))!.muted).toBe(false);
  });

  it('空の保存データは、そのまま読み戻せる', () => {
    expect(parseSave(serializeSave(emptySave()))).toEqual(emptySave());
  });
});

describe('進行状況を消す', () => {
  it('カード・星・ルール・案内を消し、音の設定だけ残す', () => {
    const s = new MemoryStore();
    writeSave(s, { ...emptySave(), unlocked: ['nearest', 'sameDir'], bestStars: { 1: 3 }, muted: true, tutorial: { taps: 5, placed: true } });
    expect(resetSave(s, { sfx: 1, music: 0 })).toBe(true);
    const d = loadSave(s)!;
    expect(d.unlocked).toEqual([]);
    expect(d.bestStars).toEqual({});
    expect(d.tutorial).toEqual({ taps: 0, placed: false });
    expect(d.sfx).toBe(1);
    expect(d.music).toBe(0);
  });
  it('保存できない環境でも例外を出さない', () => {
    expect(resetSave(null, { sfx: 3, music: 2 })).toBe(false);
  });
});

describe('空いた枠の保存', () => {
  it('null(空いた枠)は残し、知らない値だけ捨てる', () => {
    const d = parseSave(JSON.stringify({ ...emptySave(), rules: { 1: [[null, 'nearest', 'bogus', null, 'sameDir']] } }))!;
    expect(d.rules[1]).toEqual([[null, 'nearest', null, 'sameDir']]);
  });
});

describe('音量の段階の保存', () => {
  it('段階を書いて読むと戻る。範囲外・小数は既定に戻す', () => {
    const d = parseSave(JSON.stringify({ ...emptySave(), sfx: 1, music: 3 }))!;
    expect([d.sfx, d.music]).toEqual([1, 3]);
    const bad = parseSave(JSON.stringify({ ...emptySave(), sfx: 7, music: 1.5 }))!;
    expect([bad.sfx, bad.music]).toEqual([3, 2]);
  });
  it('段階のない古いデータ: 消音していたら両方とも無、そうでなければ既定(効果音=大、BGM=中)', () => {
    const base = { ...emptySave() } as Record<string, unknown>;
    delete base['sfx']; delete base['music'];
    const muted = parseSave(JSON.stringify({ ...base, muted: true }))!;
    expect([muted.sfx, muted.music]).toEqual([0, 0]);
    const plain = parseSave(JSON.stringify({ ...base, muted: false }))!;
    expect([plain.sfx, plain.music]).toEqual([3, 2]);
  });
});

