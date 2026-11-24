import { theme } from './theme.ts';
// 文字を使わないUIのためのアイコン(すべて図形で描く)

export function fillCircle(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, color: string): void {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
}

/** 数字だけを描く(文字による説明は使わない方針。数字は可) */
export function drawNumber(
  ctx: CanvasRenderingContext2D, text: string, x: number, y: number, size: number, color: string,
  align: CanvasTextAlign = 'center',
): void {
  // 7セグメント表示(テーマ led)。数字と小数点だけの文字列で、ある程度大きいときに使う(小さいとつぶれるため)
  if (theme().segment && size >= 14 && /^[0-9.]+$/.test(text)) {
    drawSegments(ctx, text, x, y, size, color, align);
    return;
  }
  ctx.font = `bold ${size}px ${theme().font}`;
  ctx.textAlign = align;
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = color;
  ctx.fillText(text, x, y);
}

export function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** 運んだ: 緑の丸にチェック */
export function iconCheck(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, alpha = 1): void {
  ctx.globalAlpha = alpha;
  fillCircle(ctx, x, y, r, '#3fbf6a');
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = Math.max(2, r * 0.22);
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(x - r * 0.45, y + r * 0.02);
  ctx.lineTo(x - r * 0.1, y + r * 0.38);
  ctx.lineTo(x + r * 0.48, y - r * 0.35);
  ctx.stroke();
  ctx.globalAlpha = 1;
}

/** 取りこぼした: 赤い丸にバツ */
export function iconCross(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, alpha = 1): void {
  ctx.globalAlpha = alpha;
  fillCircle(ctx, x, y, r, '#e5484d');
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = Math.max(2, r * 0.22);
  ctx.lineCap = 'round';
  const k = r * 0.4;
  ctx.beginPath();
  ctx.moveTo(x - k, y - k); ctx.lineTo(x + k, y + k);
  ctx.moveTo(x + k, y - k); ctx.lineTo(x - k, y + k);
  ctx.stroke();
  ctx.globalAlpha = 1;
}

/** 待ち時間: 時計 */
export function iconClock(ctx: CanvasRenderingContext2D, x: number, y: number, r: number): void {
  ctx.strokeStyle = theme().info;
  ctx.lineWidth = Math.max(2, r * 0.2);
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.arc(x, y, r * 0.9, 0, Math.PI * 2);
  ctx.moveTo(x, y); ctx.lineTo(x, y - r * 0.55);
  ctx.moveTo(x, y); ctx.lineTo(x + r * 0.42, y + r * 0.1);
  ctx.stroke();
}

export function starPath(ctx: CanvasRenderingContext2D, x: number, y: number, r: number): void {
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const rr = i % 2 === 0 ? r : r * 0.45;
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const px = x + Math.cos(a) * rr;
    const py = y + Math.sin(a) * rr;
    if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
  }
  ctx.closePath();
}

export function iconStar(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, filled: boolean): void {
  starPath(ctx, x, y, r);
  if (filled) {
    ctx.fillStyle = '#ffd34d';
    ctx.fill();
  } else {
    ctx.fillStyle = `rgba(${theme().highlightRgb},0.08)`;
    ctx.fill();
    ctx.strokeStyle = `rgba(${theme().highlightRgb},0.35)`;
    ctx.lineWidth = 2;
    ctx.stroke();
  }
}

/** やり直し: 円い矢印 */
export function iconRetry(ctx: CanvasRenderingContext2D, x: number, y: number, r: number): void {
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = r * 0.2;
  ctx.lineCap = 'round';
  const a0 = -Math.PI * 0.35;
  const a1 = a0 + Math.PI * 1.6;
  ctx.beginPath();
  ctx.arc(x, y, r * 0.6, a0, a1);
  ctx.stroke();
  // 矢じり(終点の接線方向)
  const ex = x + Math.cos(a1) * r * 0.6;
  const ey = y + Math.sin(a1) * r * 0.6;
  const tx = -Math.sin(a1);
  const ty = Math.cos(a1);
  const nx = Math.cos(a1);
  const ny = Math.sin(a1);
  const s = r * 0.32;
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.moveTo(ex + tx * s, ey + ty * s);
  ctx.lineTo(ex + nx * s * 0.9, ey + ny * s * 0.9);
  ctx.lineTo(ex - nx * s * 0.9, ey - ny * s * 0.9);
  ctx.closePath();
  ctx.fill();
}

/** 開始: 再生の三角 */
export function iconPlay(ctx: CanvasRenderingContext2D, x: number, y: number, r: number): void {
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.moveTo(x - r * 0.35, y - r * 0.5);
  ctx.lineTo(x + r * 0.55, y);
  ctx.lineTo(x - r * 0.35, y + r * 0.5);
  ctx.closePath();
  ctx.fill();
}

/** 時間帯のアイコン: 0=朝(地平線から昇る日)、1=昼(高い日)、2=夕方(沈む日)、それ以外は月 */
export function iconPhase(ctx: CanvasRenderingContext2D, phase: number, x: number, y: number, r: number): void {
  const colors = ['#ffb347', '#ffd34d', '#ff7a59'];
  if (phase < 0 || phase > 2) {
    fillCircle(ctx, x, y, r * 0.7, '#cfd8ff');
    fillCircle(ctx, x + r * 0.3, y - r * 0.2, r * 0.6, '#14161c');
    return;
  }
  const c = colors[phase]!;
  if (phase === 1) {
    fillCircle(ctx, x, y, r * 0.55, c);
    ctx.strokeStyle = c;
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (let i = 0; i < 8; i++) {
      const a = (i * Math.PI) / 4;
      ctx.moveTo(x + Math.cos(a) * r * 0.75, y + Math.sin(a) * r * 0.75);
      ctx.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r);
    }
    ctx.stroke();
    return;
  }
  // 半分の日と地平線、上向き(朝)/下向き(夕)の小さな矢印
  ctx.fillStyle = c;
  ctx.beginPath();
  ctx.arc(x, y + r * 0.3, r * 0.6, Math.PI, 0);
  ctx.closePath();
  ctx.fill();
  ctx.fillRect(x - r, y + r * 0.3, r * 2, 2);
  const up = phase === 0;
  const ay = y - r * 0.55;
  ctx.beginPath();
  if (up) { ctx.moveTo(x, ay - r * 0.35); ctx.lineTo(x + r * 0.25, ay); ctx.lineTo(x - r * 0.25, ay); }
  else { ctx.moveTo(x, ay); ctx.lineTo(x + r * 0.25, ay - r * 0.35); ctx.lineTo(x - r * 0.25, ay - r * 0.35); }
  ctx.closePath();
  ctx.fill();
}

/** カレンダー(複数日の平均で採点したことを示す)。数字は日数 */
export function iconCalendar(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, days: number, color = theme().info): void {
  const w = r * 1.7, h = r * 1.6;
  ctx.strokeStyle = color;
  ctx.lineWidth = Math.max(2, r * 0.14);
  roundRect(ctx, x - w / 2, y - h / 2, w, h, r * 0.2);
  ctx.stroke();
  ctx.fillStyle = color;
  ctx.fillRect(x - w / 2, y - h / 2, w, h * 0.26);
  // 綴じ具
  ctx.fillRect(x - w * 0.28, y - h / 2 - r * 0.2, r * 0.16, r * 0.34);
  ctx.fillRect(x + w * 0.28 - r * 0.16, y - h / 2 - r * 0.2, r * 0.16, r * 0.34);
  drawNumber(ctx, String(days), x, y + h * 0.36, r * 0.85, color);
}

/** 指(手動で操作したことを示す) */
export function iconFinger(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, color = '#f5d0b0'): void {
  fillCircle(ctx, x, y - r * 0.35, r * 0.42, color);
  ctx.fillStyle = color;
  ctx.fillRect(x - r * 0.42, y - r * 0.35, r * 0.84, r * 1.1);
}

/** 共有(書き出し・読み込み): 箱と、外へ出る(上向き)/中へ入る(下向き)矢印 */
export function iconShare(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, dir: 'out' | 'in'): void {
  ctx.strokeStyle = theme().text;
  ctx.lineWidth = Math.max(2, r * 0.16);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  // 箱(上が開いている)
  ctx.beginPath();
  ctx.moveTo(x - r * 0.75, y - r * 0.05);
  ctx.lineTo(x - r * 0.75, y + r * 0.75);
  ctx.lineTo(x + r * 0.75, y + r * 0.75);
  ctx.lineTo(x + r * 0.75, y - r * 0.05);
  ctx.stroke();
  // 矢印
  const top = y - r * 0.85, bottom = y + r * 0.35;
  ctx.beginPath();
  ctx.moveTo(x, top); ctx.lineTo(x, bottom);
  if (dir === 'out') { ctx.moveTo(x - r * 0.35, top + r * 0.35); ctx.lineTo(x, top); ctx.lineTo(x + r * 0.35, top + r * 0.35); }
  else { ctx.moveTo(x - r * 0.35, bottom - r * 0.35); ctx.lineTo(x, bottom); ctx.lineTo(x + r * 0.35, bottom - r * 0.35); }
  ctx.stroke();
}

/** スピーカー。muted なら斜線、そうでなければ音の波 */
export function iconSpeaker(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, muted: boolean): void {
  ctx.fillStyle = theme().text;
  ctx.beginPath();
  ctx.moveTo(x - r * 0.75, y - r * 0.3);
  ctx.lineTo(x - r * 0.35, y - r * 0.3);
  ctx.lineTo(x + r * 0.1, y - r * 0.7);
  ctx.lineTo(x + r * 0.1, y + r * 0.7);
  ctx.lineTo(x - r * 0.35, y + r * 0.3);
  ctx.lineTo(x - r * 0.75, y + r * 0.3);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = muted ? '#e5484d' : theme().text;
  ctx.lineWidth = Math.max(2, r * 0.15);
  ctx.lineCap = 'round';
  ctx.beginPath();
  if (muted) {
    ctx.moveTo(x + r * 0.35, y - r * 0.35); ctx.lineTo(x + r * 0.85, y + r * 0.35);
    ctx.moveTo(x + r * 0.85, y - r * 0.35); ctx.lineTo(x + r * 0.35, y + r * 0.35);
  } else {
    ctx.arc(x + r * 0.15, y, r * 0.4, -Math.PI / 4, Math.PI / 4);
    ctx.moveTo(x + r * 0.15 + Math.cos(-Math.PI / 4) * r * 0.75, y + Math.sin(-Math.PI / 4) * r * 0.75);
    ctx.arc(x + r * 0.15, y, r * 0.75, -Math.PI / 4, Math.PI / 4);
  }
  ctx.stroke();
}

/**
 * 7セグメント表示の数字(電卓・古い階数表示のような数字)。各数字で点灯する線 a〜g:
 *  aaa
 * f   b
 *  ggg
 * e   c
 *  ddd
 */
const SEGMENTS: Record<string, string> = {
  '0': 'abcdef', '1': 'bc', '2': 'abdeg', '3': 'abcdg', '4': 'bcfg',
  '5': 'acdfg', '6': 'acdefg', '7': 'abc', '8': 'abcdefg', '9': 'abcdfg',
};

function drawSegments(
  ctx: CanvasRenderingContext2D, text: string, x: number, baseline: number, size: number, color: string, align: CanvasTextAlign,
): void {
  const h = size * 0.9;           // 数字の高さ
  const w = size * 0.52;          // 数字の幅
  const gap = size * 0.14;        // 数字の間
  const t = Math.max(1.5, size * 0.11); // 線の太さ
  const dotW = size * 0.22;
  let total = 0;
  for (const ch of text) total += ch === '.' ? dotW : w + gap;
  total -= gap;
  let cx = align === 'center' ? x - total / 2 : align === 'right' || align === 'end' ? x - total : x;
  const top = baseline - h;
  const seg = (x0: number, y0: number, x1: number, y1: number, on: boolean): void => {
    ctx.strokeStyle = color;
    ctx.globalAlpha = on ? 1 : 0.08; // 消えている線もうっすら見せる(本物の表示器のように)
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.lineTo(x1, y1);
    ctx.stroke();
  };
  ctx.save();
  ctx.lineWidth = t;
  ctx.lineCap = 'round';
  for (const ch of text) {
    if (ch === '.') {
      ctx.globalAlpha = 1;
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(cx + dotW / 2 - gap / 2, baseline - t / 2, t * 0.7, 0, Math.PI * 2);
      ctx.fill();
      cx += dotW;
      continue;
    }
    const on = SEGMENTS[ch] ?? '';
    const l = cx + t / 2, r = cx + w - t / 2, mid = top + h / 2;
    seg(l + t * 0.4, top, r - t * 0.4, top, on.includes('a'));
    seg(r, top + t * 0.4, r, mid - t * 0.4, on.includes('b'));
    seg(r, mid + t * 0.4, r, baseline - t * 0.4, on.includes('c'));
    seg(l + t * 0.4, baseline, r - t * 0.4, baseline, on.includes('d'));
    seg(l, mid + t * 0.4, l, baseline - t * 0.4, on.includes('e'));
    seg(l, top + t * 0.4, l, mid - t * 0.4, on.includes('f'));
    seg(l + t * 0.4, mid, r - t * 0.4, mid, on.includes('g'));
    cx += w + gap;
  }
  ctx.restore();
}

/** 指(手本・案内用)。指先が (x, y)。pressed なら少し押し込んだ形 */
export function drawPointer(ctx: CanvasRenderingContext2D, x: number, y: number, size: number, pressed: boolean): void {
  const s = size / 40;
  const dy = pressed ? 3 * s : 0;
  ctx.save();
  ctx.translate(x, y + dy);
  ctx.rotate(-0.35);
  ctx.fillStyle = '#f5d0b0';
  ctx.strokeStyle = '#3a2a20';
  ctx.lineWidth = 2;
  // 人差し指
  roundRect(ctx, -5 * s, 0, 10 * s, 26 * s, 5 * s);
  ctx.fill(); ctx.stroke();
  // 手のひら
  roundRect(ctx, -9 * s, 18 * s, 22 * s, 20 * s, 7 * s);
  ctx.fill(); ctx.stroke();
  // 指の付け根の線(握っている指)
  ctx.beginPath();
  ctx.moveTo(-1 * s, 24 * s); ctx.lineTo(-1 * s, 30 * s);
  ctx.moveTo(5 * s, 24 * s); ctx.lineTo(5 * s, 30 * s);
  ctx.stroke();
  ctx.restore();
  if (pressed) {
    ctx.strokeStyle = 'rgba(255,255,255,0.7)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(x, y, 10 * s, 0, Math.PI * 2);
    ctx.stroke();
  }
}

/** エレベーターのかごの絵(編集画面の行の頭など)。色はそのエレベーターの色 */
export function drawCarIcon(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, color: string): void {
  ctx.fillStyle = color;
  roundRect(ctx, x, y, w, h, Math.min(8, w * 0.15));
  ctx.fill();
  ctx.fillStyle = 'rgba(0,0,0,0.45)';
  roundRect(ctx, x + w * 0.12, y + h * 0.2, w * 0.76, h * 0.7, 3);
  ctx.fill();
  // 扉の合わせ目と、上の表示窓
  ctx.fillStyle = color;
  ctx.fillRect(x + w / 2 - 1, y + h * 0.2, 2, h * 0.7);
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  roundRect(ctx, x + w * 0.3, y + h * 0.05, w * 0.4, h * 0.1, 2);
  ctx.fill();
}

/** ステージの絵: 階の数とエレベーターの本数を描いた小さなビル(数字は使わない) */
export function drawBuildingIcon(
  ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, floors: number, elevators: number,
  colors: readonly string[], fg: string,
): void {
  const fh = h / floors;
  ctx.strokeStyle = fg;
  ctx.lineWidth = 1.2;
  ctx.strokeRect(x, y, w, h);
  for (let f = 1; f < floors; f++) {
    ctx.beginPath();
    ctx.moveTo(x, y + f * fh); ctx.lineTo(x + w, y + f * fh);
    ctx.stroke();
  }
  const sw = Math.min(6, w / (elevators * 2 + 1));
  for (let i = 0; i < elevators; i++) {
    const sx = x + w - (elevators - i) * (sw + 3) - 1;
    ctx.fillStyle = colors[i % colors.length]!;
    ctx.fillRect(sx, y + 1, sw, h - 2);
  }
}

/** ごみ箱(進行状況を消す)。中心 (x, y)、大きさ r */
export function iconTrash(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, color: string): void {
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = Math.max(2, r * 0.14);
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  // ふた・取っ手
  ctx.beginPath();
  ctx.moveTo(x - r * 0.85, y - r * 0.6); ctx.lineTo(x + r * 0.85, y - r * 0.6);
  ctx.moveTo(x - r * 0.3, y - r * 0.6); ctx.lineTo(x - r * 0.3, y - r * 0.85);
  ctx.lineTo(x + r * 0.3, y - r * 0.85); ctx.lineTo(x + r * 0.3, y - r * 0.6);
  ctx.stroke();
  // 本体と縦の線
  ctx.beginPath();
  ctx.moveTo(x - r * 0.65, y - r * 0.45); ctx.lineTo(x - r * 0.5, y + r * 0.9);
  ctx.lineTo(x + r * 0.5, y + r * 0.9); ctx.lineTo(x + r * 0.65, y - r * 0.45);
  ctx.moveTo(x - r * 0.2, y - r * 0.25); ctx.lineTo(x - r * 0.2, y + r * 0.65);
  ctx.moveTo(x + r * 0.2, y - r * 0.25); ctx.lineTo(x + r * 0.2, y + r * 0.65);
  ctx.stroke();
}

/** 音符(BGM の印)。中心 (x, y)、大きさ r */
export function iconNote(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, color: string): void {
  ctx.fillStyle = color;
  ctx.strokeStyle = color;
  ctx.lineWidth = Math.max(2, r * 0.14);
  // 2つの玉と、それをつなぐ旗
  ctx.beginPath();
  ctx.ellipse(x - r * 0.45, y + r * 0.55, r * 0.3, r * 0.22, -0.4, 0, Math.PI * 2);
  ctx.ellipse(x + r * 0.45, y + r * 0.4, r * 0.3, r * 0.22, -0.4, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(x - r * 0.18, y + r * 0.5); ctx.lineTo(x - r * 0.18, y - r * 0.6);
  ctx.lineTo(x + r * 0.72, y - r * 0.75); ctx.lineTo(x + r * 0.72, y + r * 0.35);
  ctx.stroke();
}

/** 音量の段階の絵: 0 は赤い×、1〜3 は高さの違う棒が1〜3本 */
export function iconLevel(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, level: number, color: string): void {
  if (level === 0) {
    ctx.strokeStyle = '#e5484d';
    ctx.lineWidth = Math.max(2.5, r * 0.18);
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(x - r * 0.5, y - r * 0.5); ctx.lineTo(x + r * 0.5, y + r * 0.5);
    ctx.moveTo(x + r * 0.5, y - r * 0.5); ctx.lineTo(x - r * 0.5, y + r * 0.5);
    ctx.stroke();
    return;
  }
  const bw = r * 0.38;
  const gap = r * 0.18;
  const left = x - (3 * bw + 2 * gap) / 2;
  for (let i = 0; i < 3; i++) {
    const h = r * (0.5 + i * 0.4);
    ctx.fillStyle = i < level ? color : 'rgba(255,255,255,0.15)';
    ctx.fillRect(left + i * (bw + gap), y + r * 0.7 - h, bw, h);
  }
}
