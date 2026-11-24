import { isCardId, type CardId } from '../sim/rules.ts';

// 進行状況の保存(プレイヤーの端末内の localStorage だけを使う。サーバーは使わない)。
// 読み書きは必ず try/catch で囲む: シークレットモード・容量不足・保存の禁止設定などで例外が出ても、ゲームは止めない。
// 中身は読み込むたびに検査し、壊れた値や知らないカードは捨てる(手で書き換えられても落ちないように)。

export const SAVE_KEY = 'elevator-game/save';
/** 保存形式の版。形式を変えたら上げる(古い版は読み込まずに最初から) */
export const SAVE_VERSION = 1;

export interface SaveData {
  version: typeof SAVE_VERSION;
  /** 手に入れたカード(手に入れた順) */
  unlocked: CardId[];
  /** ステージの id → 最高の星(0〜3) */
  bestStars: Record<number, number>;
  /** ステージの id → エレベーターごとのルールの枠 */
  rules: Record<number, (CardId | null)[][]>;
  /** 最後に選んでいたステージの id */
  lastStage: number;
  /** 音を消しているか(後から足した項目。古い保存データにはないので、ないときは false) */
  /** 両方とも無か(古いデータとの互換のため残す。読み込みでは sfx・music を優先する) */
  muted: boolean;
  /** 効果音・BGM の音量の段階(0=無 1=小 2=中 3=大。2026-11-24 追加) */
  sfx: number;
  music: number;
  /** 案内(指の手本)の進み具合(後から足した項目。ないときは最初から) */
  tutorial: { taps: number; placed: boolean };
}

export function emptySave(): SaveData {
  return { version: SAVE_VERSION, unlocked: [], bestStars: {}, rules: {}, lastStage: 1, muted: false, sfx: 3, music: 2, tutorial: { taps: 0, placed: false } };
}

/** localStorage と同じ形の最小限の窓口(テストでは偽物を渡す) */
export interface KeyValueStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem?(key: string): void;
}

const isObj = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x);
const isStageId = (k: string): boolean => /^[1-9][0-9]{0,2}$/.test(k);

/**
 * 文字列から SaveData を取り出す。読めない・版が違う場合は null。
 * 部分的に壊れている場合は、壊れた部分だけ捨てて残りを使う。
 */
export function parseSave(text: string | null): SaveData | null {
  if (text === null) return null;
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return null;
  }
  if (!isObj(raw) || raw['version'] !== SAVE_VERSION) return null;
  const out = emptySave();

  if (Array.isArray(raw['unlocked'])) {
    for (const c of raw['unlocked']) if (isCardId(c) && !out.unlocked.includes(c)) out.unlocked.push(c);
  }
  if (isObj(raw['bestStars'])) {
    for (const [k, v] of Object.entries(raw['bestStars'])) {
      if (isStageId(k) && typeof v === 'number' && Number.isInteger(v) && v >= 0 && v <= 3) out.bestStars[Number(k)] = v;
    }
  }
  if (isObj(raw['rules'])) {
    for (const [k, v] of Object.entries(raw['rules'])) {
      if (!isStageId(k) || !Array.isArray(v) || v.length > 8) continue;
      const rows: (CardId | null)[][] = [];
      for (const row of v) {
        if (!Array.isArray(row)) { rows.push([]); continue; }
        // null は空いた枠(2026-11-20、引っ張って置く方式で枠の位置を固定した)。知らない値は捨てる
        rows.push(row.filter((c: unknown): c is CardId | null => c === null || isCardId(c)).slice(0, 5));
      }
      out.rules[Number(k)] = rows;
    }
  }
  const ls = raw['lastStage'];
  if (typeof ls === 'number' && Number.isInteger(ls) && ls >= 1 && ls <= 999) out.lastStage = ls;
  out.muted = raw['muted'] === true;
  // 音量の段階。ない古いデータは、消音していたなら両方とも無、そうでなければ既定(効果音=大、BGM=中)
  const lv = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v) && v >= 0 && v <= 3;
  if (out.muted) { out.sfx = 0; out.music = 0; }
  if (lv(raw['sfx'])) out.sfx = raw['sfx'];
  if (lv(raw['music'])) out.music = raw['music'];
  const tu = raw['tutorial'];
  if (isObj(tu)) {
    const taps = tu['taps'];
    if (typeof taps === 'number' && Number.isInteger(taps) && taps >= 0) out.tutorial.taps = Math.min(taps, 999);
    out.tutorial.placed = tu['placed'] === true;
  }
  return out;
}

export function serializeSave(d: SaveData): string {
  return JSON.stringify(d);
}

/** ブラウザの localStorage(使えない環境では null) */
export function browserStore(): KeyValueStore | null {
  try {
    const ls = (globalThis as { localStorage?: KeyValueStore }).localStorage;
    return ls ?? null;
  } catch {
    // 一部のブラウザでは、保存が禁止されていると localStorage を参照しただけで例外になる
    return null;
  }
}

/** 読み込む。保存がない・読めない・壊れている場合は null(例外は外に出さない) */
export function loadSave(store: KeyValueStore | null): SaveData | null {
  if (!store) return null;
  try {
    return parseSave(store.getItem(SAVE_KEY));
  } catch {
    return null;
  }
}

/** 書き込む。成功したら true(失敗しても例外は外に出さない) */
export function writeSave(store: KeyValueStore | null, d: SaveData): boolean {
  if (!store) return false;
  try {
    store.setItem(SAVE_KEY, serializeSave(d));
    return true;
  } catch {
    return false;
  }
}

/** 進行状況を消す(音の設定だけは残す)。成功したら true(失敗しても例外は外に出さない) */
export function resetSave(store: KeyValueStore | null, sound: { sfx: number; music: number }): boolean {
  return writeSave(store, { ...emptySave(), sfx: sound.sfx, music: sound.music, muted: sound.sfx === 0 && sound.music === 0 });
}
