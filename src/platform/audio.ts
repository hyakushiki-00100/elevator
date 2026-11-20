// 効果音(すべてコードで生成する。外部の音素材は使わない)。Web Audio API を使う。
// ブラウザは利用者の操作があるまで音を出せないので、最初のタップで unlock() を呼ぶ。
// 音が出せない環境(古いブラウザ・制限された iframe 等)でも、例外は外に出さず黙って何もしない。

export type Sfx =
  | 'tap' | 'click' | 'door' | 'board' | 'deliver' | 'miss' | 'phase' | 'star' | 'unlock' | 'error';

/** 同じ音を続けて鳴らすときの最小間隔(ms)。一度にたくさん起きても、うるさくならないように */
export const MIN_INTERVAL_MS: Record<Sfx, number> = {
  tap: 40, click: 40, door: 120, board: 70, deliver: 70, miss: 150, phase: 300, star: 100, unlock: 300, error: 200,
};

/** 鳴らしてよいか(最小間隔の判定)。純粋な関数にしてテストできるようにする */
export function shouldPlay(last: Partial<Record<Sfx, number>>, s: Sfx, now: number): boolean {
  const t = last[s];
  return t === undefined || now - t >= MIN_INTERVAL_MS[s];
}

interface Note {
  /** 鳴らし始め(秒、相対) */
  at: number;
  freq: number;
  /** 終わりの周波数(滑らかに変える。省略で一定) */
  freqEnd?: number;
  dur: number;
  type: OscillatorType;
  vol: number;
}

/** 効果音ごとの音の組み立て(周波数 Hz・長さ 秒・音量 0〜1) */
export const RECIPES: Record<Sfx, Note[]> = {
  tap: [{ at: 0, freq: 660, dur: 0.05, type: 'square', vol: 0.06 }],
  click: [{ at: 0, freq: 1200, dur: 0.03, type: 'square', vol: 0.05 }],
  // エレベーターの到着音(高い音 → 少し低い音)
  door: [
    { at: 0, freq: 1318, dur: 0.35, type: 'sine', vol: 0.12 },
    { at: 0.12, freq: 1046, dur: 0.45, type: 'sine', vol: 0.10 },
  ],
  board: [{ at: 0, freq: 520, dur: 0.04, type: 'triangle', vol: 0.08 }],
  deliver: [
    { at: 0, freq: 784, dur: 0.07, type: 'triangle', vol: 0.10 },
    { at: 0.06, freq: 1175, dur: 0.10, type: 'triangle', vol: 0.10 },
  ],
  // 取りこぼし(低く下がる音)
  miss: [{ at: 0, freq: 220, freqEnd: 110, dur: 0.3, type: 'sawtooth', vol: 0.06 }],
  phase: [
    { at: 0, freq: 587, dur: 0.18, type: 'sine', vol: 0.09 },
    { at: 0.15, freq: 880, dur: 0.25, type: 'sine', vol: 0.09 },
  ],
  star: [
    { at: 0, freq: 1568, dur: 0.4, type: 'sine', vol: 0.12 },
    { at: 0, freq: 3136, dur: 0.25, type: 'sine', vol: 0.04 },
  ],
  // カードを手に入れた(上がっていく和音)
  unlock: [
    { at: 0, freq: 523, dur: 0.12, type: 'triangle', vol: 0.1 },
    { at: 0.08, freq: 659, dur: 0.12, type: 'triangle', vol: 0.1 },
    { at: 0.16, freq: 784, dur: 0.12, type: 'triangle', vol: 0.1 },
    { at: 0.24, freq: 1046, dur: 0.3, type: 'triangle', vol: 0.12 },
  ],
  error: [
    { at: 0, freq: 196, dur: 0.1, type: 'square', vol: 0.06 },
    { at: 0.13, freq: 165, dur: 0.14, type: 'square', vol: 0.06 },
  ],
};

export class SoundPlayer {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private last: Partial<Record<Sfx, number>> = {};
  muted = false;

  /** 音の準備の状態(検証用): none = まだ作っていない / suspended / running / closed */
  get state(): string {
    return this.ctx?.state ?? 'none';
  }

  /** unlock を一度でも試したか(音の準備の印を出すかの判定に使う) */
  tried = false;

  /** 音が鳴らせる状態か(準備を試したのに running でなければ false) */
  get ok(): boolean {
    return !this.tried || this.ctx?.state === 'running';
  }

  /**
   * 利用者の操作(タップ)の中で呼ぶ。2回目以降は、止まっていれば再開するだけ。
   * iPhone の Safari では、指が触れた瞬間(pointerdown)を許可と見なさないことがあるため、
   * 指を離したとき(pointerup・touchend・click)にも呼ぶ。
   */
  unlock(): void {
    this.tried = true;
    try {
      if (!this.ctx) {
        // マナーモード(消音スイッチ)でも効果音を鳴らす設定(Safari の Audio Session API。ない環境では何もしない)
        try {
          const nav = navigator as Navigator & { audioSession?: { type: string } };
          if (nav.audioSession) nav.audioSession.type = 'playback';
        } catch {
          // 何もしない
        }
        const Ctor = (globalThis as { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext }).AudioContext
          ?? (globalThis as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        if (!Ctor) return;
        this.ctx = new Ctor();
        this.master = this.ctx.createGain();
        this.master.gain.value = 0.8;
        this.master.connect(this.ctx.destination);
      }
      // Safari では suspended のほかに interrupted(電話や裏に回ったあと)もあるので、running 以外はすべて再開を試す
      if (this.ctx.state !== 'running' && this.ctx.state !== 'closed') void this.ctx.resume();
      // 無音の短い音を1回鳴らす(iOS で音の出力を有効にする定番の手順)
      if (!this.primed) {
        const buf = this.ctx.createBuffer(1, 1, 22050);
        const src = this.ctx.createBufferSource();
        src.buffer = buf;
        src.connect(this.ctx.destination);
        src.start(0);
        this.primed = true;
      }
    } catch {
      this.ctx = null;
    }
  }

  private primed = false;

  /** 画面が隠れたら止め、戻ったら再開する(電池と、裏で鳴り続けるのを防ぐため) */
  setHidden(hidden: boolean): void {
    try {
      if (!this.ctx) return;
      if (hidden) void this.ctx.suspend();
      else void this.ctx.resume();
    } catch {
      // 何もしない
    }
  }

  play(s: Sfx): void {
    if (this.muted || !this.ctx || !this.master || this.ctx.state !== 'running') return;
    const nowMs = performance.now();
    if (!shouldPlay(this.last, s, nowMs)) return;
    this.last[s] = nowMs;
    try {
      const t0 = this.ctx.currentTime + 0.005;
      for (const n of RECIPES[s]) {
        const osc = this.ctx.createOscillator();
        const g = this.ctx.createGain();
        osc.type = n.type;
        osc.frequency.setValueAtTime(n.freq, t0 + n.at);
        if (n.freqEnd !== undefined) osc.frequency.exponentialRampToValueAtTime(n.freqEnd, t0 + n.at + n.dur);
        // 立ち上がりを少しだけ丸め、指数的に消える(プチッという雑音を防ぐ)
        g.gain.setValueAtTime(0.0001, t0 + n.at);
        g.gain.exponentialRampToValueAtTime(n.vol, t0 + n.at + 0.008);
        g.gain.exponentialRampToValueAtTime(0.0001, t0 + n.at + n.dur);
        osc.connect(g);
        g.connect(this.master);
        osc.start(t0 + n.at);
        osc.stop(t0 + n.at + n.dur + 0.02);
      }
    } catch {
      // 音が出せなくてもゲームは続ける
    }
  }
}
