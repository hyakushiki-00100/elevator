// ルールの共有の窓(書き出し・読み込み)。共有文字列を選んだり貼り付けたりするため、キャンバスではなく HTML の入力欄を使う。
// 文字によるラベルや説明は使わない(ボタンは図形の SVG のみ)。共有文字列そのものはデータなので表示する。

export type Feedback = 'ok' | 'partial' | 'error';

type Options =
  | { mode: 'export'; code: string }
  | { mode: 'import'; onSubmit: (text: string) => Feedback; initial?: string; autoSubmit?: boolean };

const SVG = {
  copy: '<svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="#fff" stroke-width="2.2" stroke-linejoin="round"><rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3"/></svg>',
  check: '<svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>',
  close: '<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="#fff" stroke-width="2.6" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>',
  okMark: '<svg viewBox="0 0 24 24" width="36" height="36"><circle cx="12" cy="12" r="11" fill="#3fbf6a"/><path d="M6.5 12.5l3.5 3.5 7.5-8" fill="none" stroke="#fff" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  warnMark: '<svg viewBox="0 0 24 24" width="36" height="36"><path d="M12 2L23 21H1z" fill="#f2c744"/><path d="M12 9v5" stroke="#1f2330" stroke-width="2.6" stroke-linecap="round"/><circle cx="12" cy="17.5" r="1.5" fill="#1f2330"/></svg>',
  errMark: '<svg viewBox="0 0 24 24" width="36" height="36"><circle cx="12" cy="12" r="11" fill="#e5484d"/><path d="M8 8l8 8M16 8l-8 8" stroke="#fff" stroke-width="2.6" stroke-linecap="round"/></svg>',
};

let current: HTMLElement | null = null;

export function isShareDialogOpen(): boolean {
  return current !== null;
}

export function closeShareDialog(): void {
  current?.remove();
  current = null;
}

function button(svg: string, color: string): HTMLButtonElement {
  const b = document.createElement('button');
  b.type = 'button';
  b.innerHTML = svg;
  Object.assign(b.style, {
    width: '56px', height: '56px', borderRadius: '50%', border: 'none', background: color,
    display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', padding: '0',
  });
  return b;
}

export function openShareDialog(opts: Options): void {
  closeShareDialog();
  const overlay = document.createElement('div');
  Object.assign(overlay.style, {
    position: 'fixed', inset: '0', background: 'rgba(8,10,14,0.7)', display: 'flex',
    alignItems: 'center', justifyContent: 'center', zIndex: '10',
  });
  const panel = document.createElement('div');
  Object.assign(panel.style, {
    background: '#1f2330', borderRadius: '14px', padding: '20px', display: 'flex', flexDirection: 'column',
    gap: '14px', alignItems: 'center', width: 'min(92vw, 460px)', boxSizing: 'border-box',
  });
  const input = document.createElement('textarea');
  input.rows = 2;
  input.spellcheck = false;
  input.autocapitalize = 'characters';
  Object.assign(input.style, {
    width: '100%', boxSizing: 'border-box', resize: 'none', fontFamily: 'ui-monospace, Menlo, Consolas, monospace',
    fontSize: '22px', letterSpacing: '1px', textAlign: 'center', color: '#fff', background: '#14161c',
    border: '2px solid #3a4156', borderRadius: '8px', padding: '10px', outline: 'none',
  });
  const status = document.createElement('div');
  Object.assign(status.style, { height: '36px', display: 'flex', alignItems: 'center', justifyContent: 'center' });
  const row = document.createElement('div');
  Object.assign(row.style, { display: 'flex', gap: '18px', justifyContent: 'center' });

  const closeBtn = button(SVG.close, '#3a4156');
  closeBtn.onclick = closeShareDialog;
  const show = (fb: Feedback | null): void => {
    status.innerHTML = fb === 'ok' ? SVG.okMark : fb === 'partial' ? SVG.warnMark : fb === 'error' ? SVG.errMark : '';
  };

  if (opts.mode === 'export') {
    input.value = opts.code;
    input.readOnly = true;
    const copyBtn = button(SVG.copy, '#4f7ff0');
    const copy = async (): Promise<void> => {
      input.select();
      try {
        await navigator.clipboard.writeText(opts.code);
        show('ok');
      } catch {
        // クリップボードが使えない環境(iframe の制限など)。選択した状態にしておくので、手でコピーできる
        let done = false;
        try { done = document.execCommand('copy'); } catch { done = false; }
        show(done ? 'ok' : null);
      }
    };
    copyBtn.onclick = () => { void copy(); };
    row.append(copyBtn, closeBtn);
    void copy();
  } else {
    const okBtn = button(SVG.check, '#3fbf6a');
    const submit = (): void => {
      const fb = opts.onSubmit(input.value);
      show(fb);
      if (fb === 'error') {
        panel.animate?.([{ transform: 'translateX(0)' }, { transform: 'translateX(-10px)' }, { transform: 'translateX(10px)' }, { transform: 'translateX(0)' }], { duration: 300 });
      } else {
        setTimeout(closeShareDialog, fb === 'ok' ? 700 : 1400);
      }
    };
    okBtn.onclick = submit;
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); submit(); } });
    input.addEventListener('input', () => show(null));
    row.append(okBtn, closeBtn);
    if (opts.initial) input.value = opts.initial;
    if (opts.autoSubmit) setTimeout(submit, 0);
  }
  overlay.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeShareDialog(); });
  overlay.addEventListener('pointerdown', (e) => { if (e.target === overlay) closeShareDialog(); });
  panel.append(input, status, row);
  overlay.append(panel);
  document.body.append(overlay);
  current = overlay;
  input.focus();
}
