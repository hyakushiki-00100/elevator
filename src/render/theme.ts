// 見た目のテーマ(色と質感)。見た目の雰囲気(CLAUDE.md 9章)を選ぶための見本として4種類を用意する。
// カードの色はどのテーマでも同じ(覚えた色が変わると混乱するため: cards.ts)。

export interface Theme {
  name: 'dark' | 'light' | 'retro' | 'metal' | 'steel' | 'brass' | 'led';
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
  /** 金属の質感の強さ(1が基準) */
  metalStrength: number;
  /** 階の番号・点数を光らせる強さ(0で光らない) */
  glow: number;
  /** 数字を7セグメント表示(電卓・古い階数表示のような数字)で描く */
  segment: boolean;
}

const FLOOR_VIVID = ['#ef4b5f', '#4cc26a', '#f2c744', '#4f7ff0', '#f28b3a', '#a35be0', '#3fd3d3', '#ec5fc0', '#a8d63a', '#e9a8a8'];

export const THEMES: Record<Theme['name'], Theme> = {
  dark: {
    name: 'dark', bg: '#14161c', bandA: '#1d212b', bandB: '#222735', shaft: '#0e1015', floorLine: '#394056',
    panelBg: '#1a1d26', dialogBg: '#1f2330', button: '#3a4156', buttonActive: '#4f7ff0',
    text: '#ffffff', textDim: 'rgba(255,255,255,0.55)', accent: '#ffd34d',
    carBody: '#3a4156', carInner: '#2b3042', door: 'rgba(160,170,195,0.5)', dim: 'rgba(8,10,14,0.66)', highlightRgb: '255,255,255',
    floorColors: FLOOR_VIVID, phaseColors: ['#a8743a', '#3d7fa8', '#7a4fa8'],
    font: 'system-ui, sans-serif', floorNumber: null, pixel: 1, metal: false, metalStrength: 1, glow: 0, segment: false,
  },
  light: {
    name: 'light', bg: '#eef1f6', bandA: '#ffffff', bandB: '#f4f6fa', shaft: '#d5dbe6', floorLine: '#c5cddb',
    panelBg: '#ffffff', dialogBg: '#ffffff', button: '#dfe5ef', buttonActive: '#4f7ff0',
    text: '#1d2433', textDim: 'rgba(29,36,51,0.5)', accent: '#e0a100',
    carBody: '#5b6b8c', carInner: '#7d8db0', door: 'rgba(240,244,252,0.7)', dim: 'rgba(30,40,60,0.35)', highlightRgb: '29,36,51',
    floorColors: ['#e5384f', '#2fa85a', '#e0a800', '#3b6fe0', '#ec7a20', '#9147d6', '#20b5b5', '#e04aa8', '#86b81f', '#d98a8a'],
    phaseColors: ['#f0b46a', '#7cc0ec', '#b08ae0'],
    font: 'system-ui, sans-serif', floorNumber: null, pixel: 1, metal: false, metalStrength: 1, glow: 0, segment: false,
  },
  retro: {
    name: 'retro', bg: '#0b0f1a', bandA: '#141c33', bandB: '#1a2440', shaft: '#05070d', floorLine: '#2e3d6b',
    panelBg: '#111830', dialogBg: '#141c33', button: '#2e3d6b', buttonActive: '#e04a6a',
    text: '#f4f4e8', textDim: 'rgba(244,244,232,0.55)', accent: '#ffcc33',
    carBody: '#6a7bb0', carInner: '#2e3d6b', door: 'rgba(160,180,230,0.55)', dim: 'rgba(5,7,13,0.7)', highlightRgb: '244,244,232',
    floorColors: ['#ff4d6d', '#3ddc84', '#ffcc33', '#4d8bff', '#ff8c33', '#b36bff', '#33e0e0', '#ff66cc', '#b3ff33', '#ffb3b3'],
    phaseColors: ['#ff8c33', '#4d8bff', '#b36bff'],
    font: 'ui-monospace, Menlo, Consolas, monospace', floorNumber: null, pixel: 4, metal: false, metalStrength: 1, glow: 0, segment: false,
  },
  metal: {
    name: 'metal', bg: '#1b1c1e', bandA: '#2b2d31', bandB: '#303237', shaft: '#121314', floorLine: '#55585f',
    panelBg: '#26282c', dialogBg: '#2b2d31', button: '#45484f', buttonActive: '#d4892a',
    text: '#f1ece2', textDim: 'rgba(241,236,226,0.5)', accent: '#ffb02e',
    carBody: '#8a8f99', carInner: '#4a4e57', door: 'rgba(200,205,215,0.55)', dim: 'rgba(10,10,12,0.7)', highlightRgb: '255,190,90',
    floorColors: FLOOR_VIVID, phaseColors: ['#b07a3a', '#6d8aa0', '#8a6a9a'],
    font: 'ui-monospace, Menlo, Consolas, monospace', floorNumber: '#ffb02e', pixel: 1, metal: true, metalStrength: 1, glow: 8, segment: false,
  },
  // D2 ステンレス: 明るい銀色、金属の筋を強く。文字は濃い色
  steel: {
    name: 'steel', bg: '#9aa1ab', bandA: '#c9ced6', bandB: '#bfc5ce', shaft: '#6f7782', floorLine: '#8e96a1',
    panelBg: '#c4c9d1', dialogBg: '#cfd4db', button: '#a9b0ba', buttonActive: '#2f6fd6',
    text: '#1f252e', textDim: 'rgba(31,37,46,0.55)', accent: '#b8520a',
    carBody: '#e2e6ec', carInner: '#8b93a0', door: 'rgba(245,247,250,0.55)', dim: 'rgba(40,46,56,0.45)', highlightRgb: '20,40,90',
    floorColors: ['#d6243c', '#1e8f45', '#c78a00', '#2457c5', '#d4610e', '#7a35c0', '#13908f', '#c2328b', '#5f8f12', '#b85b5b'],
    phaseColors: ['#c9813a', '#4f7fa8', '#7d5a9a'],
    font: 'ui-monospace, Menlo, Consolas, monospace', floorNumber: '#1f252e', pixel: 1, metal: true, metalStrength: 2.2, glow: 0, segment: false,
  },
  // D3 真鍮(クラシックホテル風): 暖かい金色と深い赤茶
  brass: {
    name: 'brass', bg: '#1e120d', bandA: '#3a2219', bandB: '#43281d', shaft: '#160d09', floorLine: '#8a6a3a',
    panelBg: '#2c1a13', dialogBg: '#34211a', button: '#6b4a26', buttonActive: '#c9962f',
    text: '#f6e7c8', textDim: 'rgba(246,231,200,0.55)', accent: '#e8b84a',
    carBody: '#b8913f', carInner: '#5a3a1e', door: 'rgba(232,200,120,0.5)', dim: 'rgba(15,8,5,0.7)', highlightRgb: '240,200,110',
    floorColors: FLOOR_VIVID, phaseColors: ['#c78b3a', '#6f8aa0', '#8f5f7f'],
    font: 'Georgia, "Times New Roman", serif', floorNumber: '#e8b84a', pixel: 1, metal: true, metalStrength: 1.6, glow: 4, segment: false,
  },
  // D4 黒とLED: 黒い面に、橙色に光る7セグメント表示の数字
  led: {
    name: 'led', bg: '#070707', bandA: '#121212', bandB: '#161616', shaft: '#030303', floorLine: '#2a2a2a',
    panelBg: '#0d0d0d', dialogBg: '#141414', button: '#262626', buttonActive: '#ff8a1f',
    text: '#ff9a2e', textDim: 'rgba(255,154,46,0.45)', accent: '#ffb84d',
    carBody: '#5f6670', carInner: '#22262c', door: 'rgba(180,190,200,0.4)', dim: 'rgba(0,0,0,0.75)', highlightRgb: '255,154,46',
    floorColors: FLOOR_VIVID, phaseColors: ['#8a5a20', '#2f5a7a', '#5a3a7a'],
    font: 'ui-monospace, Menlo, Consolas, monospace', floorNumber: '#ff9a2e', pixel: 1, metal: true, metalStrength: 0.8, glow: 12, segment: true,
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
