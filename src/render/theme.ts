// 見た目のテーマ(色と質感)。見た目の雰囲気(CLAUDE.md 9章)を選ぶための見本として4種類を用意する。
// カードの色はどのテーマでも同じ(覚えた色が変わると混乱するため: cards.ts)。

export interface Theme {
  name: 'dark' | 'light' | 'retro' | 'metal';
  bg: string;
  bandA: string;
  bandB: string;
  shaft: string;
  floorLine: string;
  panelBg: string;
  dialogBg: string;
  button: string;
  buttonActive: string;
  /** 主な文字・数字の色 */
  text: string;
  /** 控えめな文字・矢印の色 */
  textDim: string;
  /** 点数など目立たせる色 */
  accent: string;
  carBody: string;
  carInner: string;
  door: string;
  /** 結果画面などで後ろを暗くする色 */
  dim: string;
  /** 強調の枠・波紋の色(r,g,b) */
  highlightRgb: string;
  /** 階ごとの色(行き先の区別) */
  floorColors: string[];
  /** 朝・昼・夕の帯の色 */
  phaseColors: [string, string, string];
  /** 数字の書体 */
  font: string;
  /** 階の番号の色(null なら階の色) */
  floorNumber: string | null;
  /** 1より大きいと、その倍率で粗い画素にして描く(ドット絵風) */
  pixel: number;
  /** 金属の質感(帯・かご・パネルにグラデーション) */
  metal: boolean;
}

const FLOOR_VIVID = ['#ef4b5f', '#4cc26a', '#f2c744', '#4f7ff0', '#f28b3a', '#a35be0', '#3fd3d3', '#ec5fc0', '#a8d63a', '#e9a8a8'];

export const THEMES: Record<Theme['name'], Theme> = {
  dark: {
    name: 'dark', bg: '#14161c', bandA: '#1d212b', bandB: '#222735', shaft: '#0e1015', floorLine: '#394056',
    panelBg: '#1a1d26', dialogBg: '#1f2330', button: '#3a4156', buttonActive: '#4f7ff0',
    text: '#ffffff', textDim: 'rgba(255,255,255,0.55)', accent: '#ffd34d',
    carBody: '#3a4156', carInner: '#2b3042', door: 'rgba(160,170,195,0.5)', dim: 'rgba(8,10,14,0.66)', highlightRgb: '255,255,255',
    floorColors: FLOOR_VIVID, phaseColors: ['#a8743a', '#3d7fa8', '#7a4fa8'],
    font: 'system-ui, sans-serif', floorNumber: null, pixel: 1, metal: false,
  },
  light: {
    name: 'light', bg: '#eef1f6', bandA: '#ffffff', bandB: '#f4f6fa', shaft: '#d5dbe6', floorLine: '#c5cddb',
    panelBg: '#ffffff', dialogBg: '#ffffff', button: '#dfe5ef', buttonActive: '#4f7ff0',
    text: '#1d2433', textDim: 'rgba(29,36,51,0.5)', accent: '#e0a100',
    carBody: '#5b6b8c', carInner: '#7d8db0', door: 'rgba(240,244,252,0.7)', dim: 'rgba(30,40,60,0.35)', highlightRgb: '29,36,51',
    floorColors: ['#e5384f', '#2fa85a', '#e0a800', '#3b6fe0', '#ec7a20', '#9147d6', '#20b5b5', '#e04aa8', '#86b81f', '#d98a8a'],
    phaseColors: ['#f0b46a', '#7cc0ec', '#b08ae0'],
    font: 'system-ui, sans-serif', floorNumber: null, pixel: 1, metal: false,
  },
  retro: {
    name: 'retro', bg: '#0b0f1a', bandA: '#141c33', bandB: '#1a2440', shaft: '#05070d', floorLine: '#2e3d6b',
    panelBg: '#111830', dialogBg: '#141c33', button: '#2e3d6b', buttonActive: '#e04a6a',
    text: '#f4f4e8', textDim: 'rgba(244,244,232,0.55)', accent: '#ffcc33',
    carBody: '#6a7bb0', carInner: '#2e3d6b', door: 'rgba(160,180,230,0.55)', dim: 'rgba(5,7,13,0.7)', highlightRgb: '244,244,232',
    floorColors: ['#ff4d6d', '#3ddc84', '#ffcc33', '#4d8bff', '#ff8c33', '#b36bff', '#33e0e0', '#ff66cc', '#b3ff33', '#ffb3b3'],
    phaseColors: ['#ff8c33', '#4d8bff', '#b36bff'],
    font: 'ui-monospace, Menlo, Consolas, monospace', floorNumber: null, pixel: 4, metal: false,
  },
  metal: {
    name: 'metal', bg: '#1b1c1e', bandA: '#2b2d31', bandB: '#303237', shaft: '#121314', floorLine: '#55585f',
    panelBg: '#26282c', dialogBg: '#2b2d31', button: '#45484f', buttonActive: '#d4892a',
    text: '#f1ece2', textDim: 'rgba(241,236,226,0.5)', accent: '#ffb02e',
    carBody: '#8a8f99', carInner: '#4a4e57', door: 'rgba(200,205,215,0.55)', dim: 'rgba(10,10,12,0.7)', highlightRgb: '255,190,90',
    floorColors: FLOOR_VIVID, phaseColors: ['#b07a3a', '#6d8aa0', '#8a6a9a'],
    font: 'ui-monospace, Menlo, Consolas, monospace', floorNumber: '#ffb02e', pixel: 1, metal: true,
  },
};

let current: Theme = THEMES.dark;

export function theme(): Theme {
  return current;
}

export function setTheme(name: string): boolean {
  if (name in THEMES) {
    current = THEMES[name as Theme['name']];
    return true;
  }
  return false;
}
