import { describe, expect, it } from 'vitest';
import { decodeShare, encodeShare, SHARE_VERSION, type SharedRules } from '../src/share/codec.ts';
import { CARD_ORDER, type CardId } from '../src/sim/rules.ts';
import { presetsFor } from './bot/presets.ts';
import { STAGES } from '../src/sim/stages.ts';

const samples: SharedRules[] = [
  { stageId: 1, rules: [['sameDir', 'nearest']] },
  { stageId: 1, rules: [[]] },
  { stageId: 3, rules: [['express', 'nearest']] },
  { stageId: 4, rules: [['zoneLow', 'nearest'], ['zoneHigh', 'sameDir', 'nearest', 'express']] },
  { stageId: 255, rules: Array.from({ length: 8 }, () => [...CARD_ORDER]) },
  ...STAGES.flatMap((st) => presetsFor(st.building.elevators).map((p) => ({ stageId: st.id, rules: p.rules }))),
];
const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

describe('ルールの共有文字列', () => {
  it('書式: EV<版>-<本体>-<チェック4文字>。全部の例が元に戻る', () => {
    for (const v of samples) {
      const s = encodeShare(v);
      expect(s).toMatch(new RegExp(`^EV${SHARE_VERSION}-[0-9A-HJKMNP-TV-Z]+-[0-9A-HJKMNP-TV-Z]{4}$`));
      expect(decodeShare(s)).toEqual({ ok: true, value: v });
    }
  });

  it('短い: 1基・カード2枚なら12文字前後', () => {
    expect(encodeShare(samples[0]!).length).toBeLessThanOrEqual(14);
  });

  it('書き写しの揺れを許す(小文字・空白・I/L/O の取り違え・ハイフンなし)', () => {
    const s = encodeShare(samples[3]!);
    const variants = [s.toLowerCase(), ` ${s} `, s.replace(/-/g, ''), s.replace(/1/g, 'I'), s.replace(/1/g, 'l'), s.replace(/0/g, 'O')];
    for (const v of variants) expect(decodeShare(v), v).toEqual({ ok: true, value: samples[3] });
  });

  it('1文字でも書き間違えると必ず検出する(すべての位置・すべての文字で試す)', () => {
    for (const v of samples.slice(0, 6)) {
      const s = encodeShare(v);
      for (let i = 0; i < s.length; i++) {
        if (s[i] === '-') continue;
        for (const ch of ALPHABET) {
          if (ch === s[i]) continue;
          const bad = s.slice(0, i) + ch + s.slice(i + 1);
          expect(decodeShare(bad).ok, `${bad}`).toBe(false);
        }
      }
    }
  });

  it('隣り合う2文字の入れ替わりも必ず検出する', () => {
    for (const v of samples.slice(0, 6)) {
      const s = encodeShare(v).replace(/-/g, '');
      for (let i = 3; i < s.length - 1; i++) {
        if (s[i] === s[i + 1]) continue;
        const bad = s.slice(0, i) + s[i + 1] + s[i] + s.slice(i + 2);
        expect(decodeShare(bad).ok, bad).toBe(false);
      }
    }
  });

  it('読めない理由を返す: 書式・版・チェック・中身', () => {
    expect(decodeShare('')).toEqual({ ok: false, reason: 'format' });
    expect(decodeShare('hello')).toEqual({ ok: false, reason: 'format' });
    const s = encodeShare(samples[0]!);
    expect(decodeShare(s.replace('EV1', 'EV2'))).toEqual({ ok: false, reason: 'version' });
    expect(decodeShare(s.slice(0, -1) + (s.endsWith('0') ? '1' : '0'))).toEqual({ ok: false, reason: 'checksum' });
  });

  it('チェックが合っていても中身が不正なら読まない(同じカードの重複・範囲外のカード番号)', () => {
    // 正しいチェック付きで、不正な中身を作る(エンコーダは使わずにビットを直接並べる)
    const forge = (bits: string): string => {
      while (bits.length % 5) bits += '0';
      let body = '';
      for (let i = 0; i < bits.length; i += 5) body += ALPHABET[parseInt(bits.slice(i, i + 5), 2)];
      // チェックを正しく付けるため、本物の関数で計算させる: 一度 encode 済みの文字列の本体を差し替えて総当たりせず、
      // 同じ CRC を codec と同じ手順で計算する
      let crc = 0xffff;
      const text = `EV1${body}`;
      for (let i = 0; i < text.length; i++) {
        crc ^= text.charCodeAt(i) << 8;
        for (let b = 0; b < 8; b++) crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
      }
      let chk = '';
      for (let i = 3; i >= 0; i--) chk += ALPHABET[(crc >>> (5 * i)) & 31];
      return `EV1-${body}-${chk}`;
    };
    const stage1 = '00000001', oneEl = '000';
    const card = (i: number) => i.toString(2).padStart(4, '0');
    expect(decodeShare(forge(stage1 + oneEl + '010' + card(0) + card(1))).ok).toBe(true); // 正しい例(仕組みの確認)
    expect(decodeShare(forge(stage1 + oneEl + '010' + card(0) + card(0)))).toEqual({ ok: false, reason: 'content' }); // 重複
    expect(decodeShare(forge(stage1 + oneEl + '001' + card(15)))).toEqual({ ok: false, reason: 'content' }); // 存在しない番号
    expect(decodeShare(forge(stage1 + oneEl + '110'))).toEqual({ ok: false, reason: 'content' }); // 6枚(上限5)
    expect(decodeShare(forge('00000000' + oneEl + '000'))).toEqual({ ok: false, reason: 'content' }); // ステージ0
  });

  it('範囲外の内容は作れない(呼ぶ側のバグとして例外)', () => {
    expect(() => encodeShare({ stageId: 0, rules: [[]] })).toThrow();
    expect(() => encodeShare({ stageId: 1, rules: [] })).toThrow();
    expect(() => encodeShare({ stageId: 1, rules: [['nearest', 'sameDir', 'express', 'zoneLow', 'zoneHigh', 'nearest'] as CardId[]] })).toThrow();
  });
});
