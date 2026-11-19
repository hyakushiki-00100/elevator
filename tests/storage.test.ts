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
  tutorial: { taps: 3, placed: true },
};

describe('進行状況の保存', () => {
  it('書いて読むと同じ内容に戻る', () => {
    const st = new MemoryStore();
    expect(writeSave(st, sample)).toBe(true);
    expect(st.data.has(SAVE_KEY)).toBe(true);
    expect(loadSave(st)).toEqual(sample);
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
    expect(resetSave(s, true)).toBe(true);
    const d = loadSave(s)!;
    expect(d.unlocked).toEqual([]);
    expect(d.bestStars).toEqual({});
    expect(d.tutorial).toEqual({ taps: 0, placed: false });
    expect(d.muted).toBe(true);
  });
  it('保存できない環境でも例外を出さない', () => {
    expect(resetSave(null, false)).toBe(false);
  });
});
