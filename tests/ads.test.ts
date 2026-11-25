import { describe, expect, it } from 'vitest';
import { crazyGames, noAds, platformFor, type CrazySdk } from '../src/platform/ads.ts';

/** CrazyGames SDK の偽物。requestAd の結果を outcome で選ぶ */
function fakeSdk(outcome: 'finished' | 'error' | 'unstarted-error' | 'throw', initFails = false) {
  const calls: string[] = [];
  const sdk: CrazySdk = {
    init: async () => { calls.push('init'); if (initFails) throw new Error('x'); },
    ad: {
      requestAd: (type, cb) => {
        calls.push(`request:${type}`);
        if (outcome === 'throw') throw new Error('boom');
        if (outcome === 'unstarted-error') { cb.adError?.({ code: 'adsDisabled' }); return; }
        cb.adStarted?.();
        if (outcome === 'finished') cb.adFinished?.(); else cb.adError?.({ code: 'other' });
      },
    },
    game: {
      gameplayStart: () => calls.push('start'),
      gameplayStop: () => calls.push('stop'),
      settings: { muteAudio: false },
    },
  };
  return { sdk, calls };
}

function hooks(log: string[]) {
  return { onAdStart: () => log.push('mute'), onAdEnd: () => log.push('unmute') };
}

describe('広告の窓口', () => {
  it('広告なしの版は何もせず、すぐ終わる', async () => {
    const p = noAds();
    await p.init();
    const log: string[] = [];
    expect(await p.midgame(hooks(log))).toBe(false);
    expect(log).toEqual([]);
    expect(platformFor(undefined).name).toBe('none');
    expect(platformFor('crazygames').name).toBe('crazygames');
  });

  it('CrazyGames: SDK の準備の前に遊び始めたら、準備ができたときに gameplayStart を知らせる(開いてすぐ1日目が始まるため)', async () => {
    const { sdk, calls } = fakeSdk('finished');
    const p = crazyGames(sdk);
    p.gameplayStart(); // 準備の前
    expect(calls).not.toContain('start');
    await p.init();
    expect(calls.filter((c) => c === 'start')).toHaveLength(1);
    p.gameplayStart(); // 二重には知らせない
    expect(calls.filter((c) => c === 'start')).toHaveLength(1);
    // 準備の前に止めていれば、知らせない
    const b = fakeSdk('finished');
    const q = crazyGames(b.sdk);
    q.gameplayStart();
    q.gameplayStop();
    await q.init();
    expect(b.calls).not.toContain('start');
  });

  it('CrazyGames: 広告が始まったら音を止め、終わったら戻す', async () => {
    const { sdk, calls } = fakeSdk('finished');
    const p = crazyGames(sdk);
    await p.init();
    const log: string[] = [];
    expect(await p.midgame(hooks(log))).toBe(true);
    expect(log).toEqual(['mute', 'unmute']);
    expect(calls).toContain('request:midgame');
  });

  it('CrazyGames: 広告が無効(Basic Launch など)・失敗・例外でも止まらずに終わる。始まっていなければ音には触れない', async () => {
    for (const o of ['unstarted-error', 'error', 'throw'] as const) {
      const { sdk } = fakeSdk(o);
      const p = crazyGames(sdk);
      await p.init();
      const log: string[] = [];
      expect(await p.midgame(hooks(log))).toBe(false);
      expect(log).toEqual(o === 'error' ? ['mute', 'unmute'] : []);
    }
  });

  it('CrazyGames: 準備に失敗したら広告なしとして動く。遊んでいる区間の合図は重ねて送らない', async () => {
    const bad = fakeSdk('finished', true);
    const p = crazyGames(bad.sdk);
    await p.init();
    expect(await p.midgame(hooks([]))).toBe(false);
    const good = fakeSdk('finished');
    const q = crazyGames(good.sdk);
    await q.init();
    q.gameplayStart(); q.gameplayStart(); q.gameplayStop(); q.gameplayStop();
    expect(good.calls.filter((c) => c === 'start' || c === 'stop')).toEqual(['start', 'stop']);
  });

  it('CrazyGames: SDK の消音設定はゲーム内の設定より優先する', async () => {
    const { sdk } = fakeSdk('finished');
    const p = crazyGames(sdk);
    await p.init();
    expect(p.forcedMute()).toBe(false);
    sdk.game.settings!.muteAudio = true;
    expect(p.forcedMute()).toBe(true);
  });
});
