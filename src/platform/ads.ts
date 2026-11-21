// 広告の窓口(公開先ごとに中身を差し替える)。ゲーム本体はこの窓口だけを呼ぶ。
// - itch.io・自分のサイト版: 広告なし(none)。何もしない。
// - CrazyGames 版: CrazyGames の HTML5 SDK v3 を使う(ビルド時に VITE_PLATFORM=crazygames)。
//   呼び方は公式の説明で確かめた(2026-11-21、docs.crazygames.com の sdk/intro・sdk/video-ads・sdk/game・requirements/ads)。
//   - 広告が「始まったら」音を消して操作を止め、終わるか失敗したら戻す。リクエストから終わるまでは操作を止める
//   - Basic Launch の間は広告が無効で adError(adsDisabled)が返る。そのときもゲームは止まらずに続く
//   - 1日の終わりの広告(midgame)の頻度は SDK 側で調整される(3分に1回まで)。こちらで間隔を数えなくてよい
//   - SDK の muteAudio 設定は、ゲーム内の音の設定より優先する
// どの公開先でも、広告が出なくてもゲームの進行に支障が出ないようにする(CLAUDE.md 5.9)。
// 報酬型広告はまだ使わない(ご褒美の中身が未定。効果のないボタンは審査で不可。点数が変わるご褒美は共有の点の再現と衝突する)。

export interface AdHooks {
  /** 広告が始まった: 音を消し、ゲームを止める */
  onAdStart(): void;
  /** 広告が終わった・失敗した: 音とゲームを戻す */
  onAdEnd(): void;
}

export interface Platform {
  readonly name: 'none' | 'crazygames';
  /** 準備(失敗しても例外は外に出さず、広告なしとして動く) */
  init(): Promise<void>;
  /** 遊んでいる区間の始まり・終わり(1日の開始・終了、編集画面など) */
  gameplayStart(): void;
  gameplayStop(): void;
  /** 1日の終わりの広告。出ても出なくても resolve する。広告が実際に流れたら true */
  midgame(hooks: AdHooks): Promise<boolean>;
  /** 公開先の設定で音を消すよう求められているか(ゲーム内の設定より優先) */
  forcedMute(): boolean;
  /** 公開先の設定が変わったときに呼ぶ */
  onSettingsChange(cb: () => void): void;
}

/** 広告なし(itch.io・自分のサイト) */
export function noAds(): Platform {
  return {
    name: 'none',
    init: async () => {},
    gameplayStart: () => {},
    gameplayStop: () => {},
    midgame: async () => false,
    forcedMute: () => false,
    onSettingsChange: () => {},
  };
}

/** CrazyGames SDK のうち、使う部分だけの形(テストでは偽物を渡す) */
export interface CrazySdk {
  init(): Promise<void>;
  ad: {
    requestAd(type: 'midgame' | 'rewarded', callbacks: {
      adStarted?: () => void;
      adFinished?: () => void;
      adError?: (error: { code?: string; message?: string }) => void;
    }): void;
  };
  game: {
    gameplayStart(): void;
    gameplayStop(): void;
    settings?: { muteAudio?: boolean };
    addSettingsChangeListener?(listener: (s: { muteAudio?: boolean }) => void): void;
  };
}

/** CrazyGames 版。sdk を渡すとそれを使う(テスト用)。渡さなければ window.CrazyGames.SDK を読み込んで使う */
export function crazyGames(sdkOverride?: CrazySdk): Platform {
  let sdk: CrazySdk | null = sdkOverride ?? null;
  let ready = false;
  let playing = false;
  const listeners: (() => void)[] = [];
  const safe = (f: () => void): void => {
    try { f(); } catch { /* SDK の失敗でゲームを止めない */ }
  };
  return {
    name: 'crazygames',
    async init() {
      try {
        if (!sdk) {
          await loadScript('https://sdk.crazygames.com/crazygames-sdk-v3.js');
          sdk = (globalThis as { CrazyGames?: { SDK?: CrazySdk } }).CrazyGames?.SDK ?? null;
        }
        if (!sdk) return;
        await sdk.init();
        ready = true;
        sdk.game.addSettingsChangeListener?.(() => listeners.forEach((cb) => safe(cb)));
      } catch {
        ready = false;
      }
    },
    gameplayStart() {
      if (!ready || !sdk || playing) return;
      playing = true;
      safe(() => sdk!.game.gameplayStart());
    },
    gameplayStop() {
      if (!ready || !sdk || !playing) return;
      playing = false;
      safe(() => sdk!.game.gameplayStop());
    },
    midgame(hooks) {
      if (!ready || !sdk) return Promise.resolve(false);
      return new Promise<boolean>((resolve) => {
        let started = false;
        let done = false;
        const finish = (shown: boolean): void => {
          if (done) return;
          done = true;
          if (started) safe(() => hooks.onAdEnd());
          resolve(shown);
        };
        try {
          sdk!.ad.requestAd('midgame', {
            adStarted: () => { started = true; safe(() => hooks.onAdStart()); },
            adFinished: () => finish(true),
            adError: () => finish(false),
          });
        } catch {
          finish(false);
        }
      });
    },
    forcedMute() {
      return ready && sdk?.game.settings?.muteAudio === true;
    },
    onSettingsChange(cb) {
      listeners.push(cb);
    },
  };
}

function loadScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const doc = (globalThis as { document?: Document }).document;
    if (!doc) { reject(new Error('no document')); return; }
    const s = doc.createElement('script');
    s.src = src;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error(`load failed: ${src}`));
    doc.head.appendChild(s);
  });
}

/** ビルド時の指定(VITE_PLATFORM)で公開先を選ぶ。指定がなければ広告なし */
export function platformFor(name: string | undefined): Platform {
  return name === 'crazygames' ? crazyGames() : noAds();
}
