import { describe, expect, it } from 'vitest';
import { STAGES } from '../src/sim/stages.ts';
import { advancePreview, ensurePreview, PREVIEW_SHOW, PREVIEW_WARMUP, previewRuleSets } from '../src/ui/preview.ts';

const st = STAGES[0]!;
const cfg = { building: st.building, traffic: st.traffic };

describe('試しに動かす窓', () => {
  it('持ち上げたカードがなければ今のルールだけ、あれば先頭に足したルールと並べる', () => {
    expect(previewRuleSets([['nearest']], 0, null, 2)).toEqual([[['nearest']]]);
    expect(previewRuleSets([['nearest']], 0, 'sameDir', 2)).toEqual([[['nearest']], [['sameDir', 'nearest']]]);
    // 枠からあふれる分は後ろから外す
    expect(previewRuleSets([['nearest', 'express']], 0, 'sameDir', 2)).toEqual([[['nearest', 'express']], [['sameDir', 'nearest']]]);
    // すでに行にあるカードは先頭へ移す
    expect(previewRuleSets([['nearest', 'sameDir']], 0, 'sameDir', 2)).toEqual([[['nearest', 'sameDir']], [['sameDir', 'nearest']]]);
    // すでに先頭なら変わらないので1つだけ
    expect(previewRuleSets([['sameDir', 'nearest']], 0, 'sameDir', 2)).toEqual([[['sameDir', 'nearest']]]);
    // 選んだ行だけ変わる
    expect(previewRuleSets([['nearest'], ['nearest']], 1, 'express', 2)).toEqual([[['nearest'], ['nearest']], [['nearest'], ['express', 'nearest']]]);
  });

  it('同じ条件なら作り直さず、条件が変われば作り直す。画面に出す前に少し進めておく', () => {
    const a = ensurePreview(null, cfg, st.seed, [['nearest']], 0, null, 2);
    expect(a.runs).toHaveLength(1);
    expect(a.runs[0]!.sim.tick).toBe(PREVIEW_WARMUP);
    expect(ensurePreview(a, cfg, st.seed, [['nearest']], 0, null, 2)).toBe(a);
    const b = ensurePreview(a, cfg, st.seed, [['nearest']], 0, 'sameDir', 2);
    expect(b).not.toBe(a);
    expect(b.runs).toHaveLength(2);
    expect(b.added).toBe('sameDir');
  });

  it('見せる長さを過ぎたら最初からやり直す。本物の sim と同じ判断で動く(同じルールなら同じ結果)', () => {
    const p = ensurePreview(null, cfg, st.seed, [['nearest']], 0, 'sameDir', 2);
    for (let i = 0; i * 3 < PREVIEW_SHOW; i++) advancePreview(p, cfg, st.seed);
    expect(p.shown).toBeGreaterThanOrEqual(PREVIEW_SHOW);
    advancePreview(p, cfg, st.seed);
    expect(p.shown).toBe(0);
    expect(p.runs[0]!.sim.tick).toBe(PREVIEW_WARMUP);
    const q = ensurePreview(null, cfg, st.seed, [['nearest']], 0, null, 2);
    const r = ensurePreview(null, cfg, st.seed, [['nearest']], 0, null, 2);
    for (let i = 0; i < 100; i++) { advancePreview(q, cfg, st.seed); advancePreview(r, cfg, st.seed); }
    expect(q.runs[0]!.sim.stats).toEqual(r.runs[0]!.sim.stats);
  });
});
