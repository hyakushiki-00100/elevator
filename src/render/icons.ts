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
  ctx.font = `bold ${size}px system-ui, sans-serif`;
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
  ctx.strokeStyle = '#9fb3ff';
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
    ctx.fillStyle = 'rgba(255,255,255,0.08)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.35)';
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
