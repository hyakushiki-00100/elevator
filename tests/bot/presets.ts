import type { CardId } from '../../src/sim/rules.ts';

// preset-rules ボットで使う、ルールのカードの組み合わせ(エレベーターの数ごと)。
// tools/calibrate.ts の較正でも同じ一覧を使う。

export interface Preset {
  /** 表の見出しに使う短い名前 */
  name: string;
  /** エレベーターごとの枠 */
  rules: CardId[][];
}

const SINGLES: [string, CardId[]][] = [
  ['近い', ['nearest']],
  ['同方向>近い', ['sameDir', 'nearest']],
  ['近い>同方向', ['nearest', 'sameDir']],
  ['急行>近い', ['express', 'nearest']],
  ['急行>同方向>近い', ['express', 'sameDir', 'nearest']],
  ['同方向>近い>急行', ['sameDir', 'nearest', 'express']],
];

export function presetsFor(elevators: number): Preset[] {
  const all = (r: CardId[]): CardId[][] => Array.from({ length: elevators }, () => [...r]);
  const out: Preset[] = SINGLES.map(([name, r]) => ({ name, rules: all(r) }));
  if (elevators >= 2) {
    const rest = (r: CardId[]): CardId[][] => Array.from({ length: elevators - 2 }, () => [...r]);
    out.push(
      { name: 'ゾーン+近い', rules: [['zoneLow', 'nearest'], ['zoneHigh', 'nearest'], ...rest(['nearest'])] },
      { name: 'ゾーン+同方向>近い', rules: [['zoneLow', 'sameDir', 'nearest'], ['zoneHigh', 'sameDir', 'nearest'], ...rest(['sameDir', 'nearest'])] },
      { name: 'ゾーン+急行>近い', rules: [['zoneLow', 'express', 'nearest'], ['zoneHigh', 'express', 'nearest'], ...rest(['express', 'nearest'])] },
      { name: '1号機だけ急行>近い', rules: [['express', 'nearest'], ['nearest'], ...rest(['nearest'])] },
      { name: '下層のみゾーン', rules: [['zoneLow', 'nearest'], ['nearest'], ...rest(['nearest'])] },
      { name: '片方だけ大荷物お断り', rules: [['noBulky', 'sameDir', 'nearest'], ['express', 'nearest'], ...rest(['nearest'])] },
    );
  }
  return out;
}
