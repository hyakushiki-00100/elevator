// 最初の画面の「遊び方の見本」の時間割(描画から切り離して、順番をテストできるようにする)

/** 見本の1周の長さ(ミリ秒) */
export const STORY_LOOP_MS = 7000;

/**
 * 遊び方の見本(文字なし)。4階建て・1基の小さなビルで、次を繰り返す:
 * 3階で人が待つ(頭上に行き先「1」、我慢のリングが減る) → 指が3階をタップ → かごが3階へ →
 * 人が乗る → かごが1階へ → 人が降りる → 緑のチェックと点数。
 */
export function storyAt(t: number): {
  tap: boolean; pointer: boolean; carFloor: number; person: 'wait' | 'ride' | 'leave' | 'gone'; personX: number; check: number; ring: number;
} {
  const ease = (u: number): number => (u <= 0 ? 0 : u >= 1 ? 1 : u * u * (3 - 2 * u));
  const seg = (a: number, b: number): number => ease((t - a) / (b - a));
  const pointer = t >= 0.08 && t < 0.3;
  const tap = t >= 0.2 && t < 0.27;
  // かご: 0階 →(0.27〜0.45)→ 2階 →(0.55〜0.75)→ 0階
  const carFloor = t < 0.5 ? 2 * seg(0.27, 0.45) : 2 - 2 * seg(0.55, 0.75);
  let person: 'wait' | 'ride' | 'leave' | 'gone' = 'wait';
  let personX = 0; // 0: 待つ位置 1: かごの中
  if (t >= 0.45 && t < 0.55) { person = 'wait'; personX = seg(0.45, 0.53); }
  if (t >= 0.55 && t < 0.78) { person = 'ride'; personX = 1; }
  if (t >= 0.78 && t < 0.9) { person = 'leave'; personX = 1 - 1.4 * seg(0.78, 0.9); }
  if (t >= 0.9) person = 'gone';
  const check = t >= 0.84 ? seg(0.84, 0.9) : 0;
  // 我慢のリング: タップするまでは減り、乗ったら消える
  const ring = 1 - 0.6 * Math.min(1, t / 0.45);
  return { tap, pointer, carFloor, person, personX, check, ring };
}
