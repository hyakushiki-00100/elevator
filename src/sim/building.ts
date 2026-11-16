export const TICKS_PER_SECOND = 30;
/** 位置は整数の「ミリ階」で持つ(浮動小数点の誤差を避け、決定性を保つ) */
export const UNITS_PER_FLOOR = 1000;

export interface Building {
  /** 階数。階は 0 〜 floors-1(0 が1階) */
  floors: number;
  /** エレベーターの基数 */
  elevators: number;
  /** 定員(乗客の size の合計の上限) */
  capacity: number;
  /** 速度(ミリ階 / 1tick)。60 なら 1.8階/秒 */
  speed: number;
  /** 到着してから扉が閉まり始めるまでの tick 数 */
  doorTicks: number;
  /** 誰かが乗り降りしたとき、扉が開いている時間をこの tick 数まで延ばす */
  boardTicks: number;
}

export function makeBuilding(overrides: Partial<Building> = {}): Building {
  return {
    floors: 5,
    elevators: 1,
    capacity: 8,
    speed: 60,
    doorTicks: 45,
    boardTicks: 10,
    ...overrides,
  };
}
