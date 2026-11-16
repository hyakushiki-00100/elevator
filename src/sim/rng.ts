// シード付き乱数(mulberry32)。simの中で使ってよい乱数はこれだけ。
// Math.random() は sim/ 内で使用禁止(tests/sim.test.ts で検査する)。
export class Rng {
  private s: number;

  constructor(seed: number) {
    this.s = seed >>> 0;
  }

  /** [0, 1) の一様乱数 */
  next(): number {
    this.s = (this.s + 0x6d2b79f5) >>> 0;
    let t = this.s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /** 0 以上 n 未満の整数 */
  int(n: number): number {
    return Math.floor(this.next() * n);
  }

  /** 確率 p で true */
  chance(p: number): boolean {
    return this.next() < p;
  }

  getState(): number {
    return this.s;
  }
}
