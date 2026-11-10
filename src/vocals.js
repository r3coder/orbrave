// The Teto vocal words (vocal orbs, VOCAL_ORBS in orbCatalog.js) are not part of the site: the
// voice is under the voicebank's terms (non-commercial, no redistribution; tools/vocals/NOTICE.txt),
// so its files live only on the share server (server/vocals.mjs, /api/vocals). The orb page asks the
// server once; when it has them, the words are registered as teto_<line>_<bar>[_dn4|_up3] samples
// played from there, and the vocal orbs fall in the field (vocalsOn). Without the server (a fork,
// offline, the server down) they never fall, and the search lists them greyed out with [X], unusable.
import { samples } from '@strudel/web';
import VOCAL from './vocalLines.json';

// the share server, as in presetApi.js
const BASE = (import.meta.env.VITE_PRESET_API || '/api').replace(/\/+$/, '');
const PITCHES = ['', '_dn4', '_up3']; // tools/vocals/make_ustx.py PITCHES, keyTail in orbCatalog.js
const TIMEOUT = 6000;

let on = false;
export const vocalsOn = () => on;

let probe = null;
// resolves to whether the vocal words can be played (asks the server once)
export function loadVocals() {
  return (probe ??= (async () => {
    const base = new URL(BASE + '/vocals/', document.baseURI).href;
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), TIMEOUT);
    try {
      const res = await fetch(base.slice(0, -1), { signal: ctl.signal, headers: { Accept: 'application/json' } });
      if ((await res.json())?.vocals !== true) return false;
    } catch {
      return false;
    } finally {
      clearTimeout(timer);
    }
    const map = {};
    for (const [line, { bars }] of Object.entries(VOCAL.lines)) {
      bars.forEach((_, i) => {
        for (const p of PITCHES) map[`teto_${line}_${i + 1}${p}`] = [`${line}_${i + 1}${p}.flac`];
      });
    }
    await samples(map, base);
    on = true;
    dispatchEvent(new Event('vocalschange')); // the search greys vocal orbs out until then (orbs/search.js)
    return true;
  })());
}
