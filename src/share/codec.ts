import { CARD_ORDER, isCardId, type CardId } from '../sim/rules.ts';

// ルールの共有文字列(5.7節)。例: EV1-0M4G2-7KQ1
// - 先頭の数字は形式の版。一度公開した版の意味は、後から絶対に変えない(過去に共有された文字列の結果が変わるため)。
//   カードの番号(CARD_ORDER の順)、sim の動き、採点の式・正式な点の日数が変わるときも版を上げる。
// - 本体: ステージの id(8ビット)・エレベーターの数(3ビット)・各エレベーターの枚数(3ビット)とカードの番号(各4ビット)。
// - 文字は Crockford base32(I・L・O・U を使わない)。読み込むときは小文字・I/L(→1)・O(→0)・空白・ハイフンを許す。
// - 最後の4文字は CRC-16(壊れた文字列・書き間違いの検出用。改ざん防止ではない: 点数は受け取った側で計算し直すので、
//   文字列に点数は入れない)。

export const SHARE_PREFIX = 'EV';
export const SHARE_VERSION = 1;
const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
const MAX_ELEVATORS = 8;
const MAX_CARDS = 5;

export interface SharedRules {
  stageId: number;
  /** エレベーターごとの枠 */
  rules: CardId[][];
}

export type DecodeResult =
  | { ok: true; value: SharedRules }
  | { ok: false; reason: 'format' | 'version' | 'checksum' | 'content' };

/** CRC-16/CCITT-FALSE */
function crc16(text: string): number {
  let crc = 0xffff;
  for (let i = 0; i < text.length; i++) {
    crc ^= text.charCodeAt(i) << 8;
    for (let b = 0; b < 8; b++) crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
  }
  return crc;
}

function toChars(value: number, count: number): string {
  let s = '';
  for (let i = count - 1; i >= 0; i--) s += ALPHABET[(value >>> (5 * i)) & 31];
  return s;
}

/** 共有文字列にする。内容が範囲外なら例外(呼ぶ側のバグ) */
export function encodeShare(v: SharedRules): string {
  if (!Number.isInteger(v.stageId) || v.stageId < 1 || v.stageId > 255) throw new Error('stageId out of range');
  if (v.rules.length < 1 || v.rules.length > MAX_ELEVATORS) throw new Error('elevator count out of range');
  const bits: number[] = [];
  const put = (value: number, n: number): void => { for (let i = n - 1; i >= 0; i--) bits.push((value >>> i) & 1); };
  put(v.stageId, 8);
  put(v.rules.length - 1, 3);
  for (const row of v.rules) {
    if (row.length > MAX_CARDS) throw new Error('too many cards');
    put(row.length, 3);
    for (const c of row) put(CARD_ORDER.indexOf(c), 4);
  }
  while (bits.length % 5 !== 0) bits.push(0);
  let body = '';
  for (let i = 0; i < bits.length; i += 5) {
    let x = 0;
    for (let k = 0; k < 5; k++) x = (x << 1) | bits[i + k]!;
    body += ALPHABET[x];
  }
  const head = `${SHARE_PREFIX}${SHARE_VERSION}`;
  return `${head}-${body}-${toChars(crc16(`${head}${body}`), 4)}`;
}

/** 書き写しの揺れを吸収する(小文字、I/L→1、O→0、空白・ハイフン・ふつうでない記号を除く) */
function normalize(s: string): string {
  return s.toUpperCase().replace(/[IL]/g, '1').replace(/O/g, '0').replace(/[^0-9A-Z]/g, '');
}

export function decodeShare(text: string): DecodeResult {
  const s = normalize(text);
  if (!s.startsWith(SHARE_PREFIX) || s.length < SHARE_PREFIX.length + 1 + 1 + 4) return { ok: false, reason: 'format' };
  // 版(1桁以上の数字。いまは1)
  let i = SHARE_PREFIX.length;
  let verText = '';
  while (i < s.length && /[0-9]/.test(s[i]!) && verText.length < 1) verText += s[i++];
  if (Number(verText) !== SHARE_VERSION) return { ok: false, reason: 'version' };
  const rest = s.slice(i);
  if (rest.length < 5) return { ok: false, reason: 'format' };
  const body = rest.slice(0, -4);
  const check = rest.slice(-4);
  for (const ch of body + check) if (!ALPHABET.includes(ch)) return { ok: false, reason: 'format' };
  if (toChars(crc16(`${SHARE_PREFIX}${SHARE_VERSION}${body}`), 4) !== check) return { ok: false, reason: 'checksum' };

  const bits: number[] = [];
  for (const ch of body) { const x = ALPHABET.indexOf(ch); for (let k = 4; k >= 0; k--) bits.push((x >>> k) & 1); }
  let p = 0;
  const take = (n: number): number | null => {
    if (p + n > bits.length) return null;
    let x = 0;
    for (let k = 0; k < n; k++) x = (x << 1) | bits[p++]!;
    return x;
  };
  const stageId = take(8);
  const el = take(3);
  if (stageId === null || el === null || stageId < 1) return { ok: false, reason: 'content' };
  const rules: CardId[][] = [];
  for (let e = 0; e <= el; e++) {
    const n = take(3);
    if (n === null || n > MAX_CARDS) return { ok: false, reason: 'content' };
    const row: CardId[] = [];
    for (let k = 0; k < n; k++) {
      const idx = take(4);
      const c = idx === null ? undefined : CARD_ORDER[idx];
      if (!isCardId(c) || row.includes(c)) return { ok: false, reason: 'content' };
      row.push(c);
    }
    rules.push(row);
  }
  // 残りのビットは詰め物(0)だけのはず
  while (p < bits.length) if (bits[p++] !== 0) return { ok: false, reason: 'content' };
  return { ok: true, value: { stageId, rules } };
}
