import { describe, expect, it } from 'vitest';
import { cardSceneAt, SCENES, STATIC_T } from '../src/render/cards.ts';
import { CARDS, CARD_ORDER, servesFloor, type CardId, type RuleContext } from '../src/sim/rules.ts';

// カードの絵の場面が、本物のカードの判断と食い違っていないか(絵が嘘をつかないように)
describe('カードの絵の場面', () => {
  it('全カードに場面があり、行き先は 0〜4 階', () => {
    for (const c of CARD_ORDER) {
      const sc = SCENES[c];
      expect(sc, c).toBeDefined();
      for (const f of [sc.from, sc.to, ...sc.calls.map((x) => x.floor), ...(sc.rider !== undefined ? [sc.rider] : [])]) {
        expect(f).toBeGreaterThanOrEqual(0);
        expect(f).toBeLessThanOrEqual(4);
      }
    }
  });

  it('場面の行き先は、同じ状況で本物のカードが選ぶ階と一致する', () => {
    for (const c of CARD_ORDER) {
      const sc = SCENES[c];
      // 担当範囲のカードは「担当範囲 → 近い」の組み合わせとして確かめる
      const rules: CardId[] = c === 'zoneLow' || c === 'zoneHigh' ? [c, 'nearest'] : [c];
      const hall = [0, 1, 2, 3, 4].map((f) => sc.calls.some((x) => x.floor === f) && servesFloor(rules, f, 5));
      const ctx: RuleContext = {
        cur: sc.from, floors: 5, heading: sc.heading === 0 ? 1 : sc.heading, hall,
        car: [0, 1, 2, 3, 4].map((f) => sc.rider === f), includeCur: false,
      };
      let target: number | null = null;
      for (const r of rules) { target = CARDS[r](ctx); if (target !== null) break; }
      expect(target, c).toBe(sc.to);
      // 迎えに行く人は行き先の階にいる(急行は誰も迎えに行かない)
      for (const call of sc.calls) if (call.picked) expect(call.floor, c).toBe(sc.to);
    }
  });

  it('担当範囲の明るい階は、実際の担当の階と一致する(5階建て)', () => {
    for (const c of ['zoneLow', 'zoneHigh'] as const) {
      const served = [0, 1, 2, 3, 4].filter((f) => servesFloor([c], f, 5));
      expect(SCENES[c].lit, c).toEqual(served);
    }
  });

  it('時間の流れ: 最初は出発階、移動の後は行き先、静止画の時刻は移動の途中', () => {
    const sc = SCENES.express;
    expect(cardSceneAt(sc, 0).pos).toBe(sc.from);
    expect(cardSceneAt(sc, 0.8).pos).toBe(sc.to);
    expect(cardSceneAt(sc, 0.8).pickedGone).toBe(true);
    const mid = cardSceneAt(sc, STATIC_T).pos;
    expect(mid).toBeLessThan(sc.from);
    expect(mid).toBeGreaterThan(sc.to);
    expect(cardSceneAt(sc, 1.25)).toEqual(cardSceneAt(sc, 0.25)); // 繰り返し
  });
});
