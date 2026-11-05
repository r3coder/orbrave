import { samples, superdough, getAudioContext, soundMap, loadBuffer } from '@strudel/web';

// Sample banks:
// - drums: the self-hosted CC0 bank in public/samples (TR909/808/707/606/727 and RD6 from
//   MckAudio/MckSamplePacks, the acoustic Kit and kitbreak from Karoryfer Big Rusty Drums;
//   see public/samples/SOURCES.md)
// - VCSL (sgossner/VCSL, CC0): marimba, kalimba, conga, shakers, steinway …
// - Salamander Grand Piano (Alexander Holm, CC-BY 3.0)
const DOUGH = 'https://raw.githubusercontent.com/felixroos/dough-samples/main/';
// resolved against the page, so it also works when the site lives under a sub-path
export const DRUMS_URL = new URL('samples/strudel.json', document.baseURI).href;
// strudel.json has no `_base`, and Strudel derives the base from the JSON's folder with the
// trailing slash stripped ("…/samples"), then glues it straight onto each path, giving
// "…/samplesTR808/bd/00.flac" (the dev server answers that with index.html → silent hit).
// Pass the folder explicitly, slash included.
const DRUMS_BASE = new URL('samples/', document.baseURI).href;
export const loadDrums = () => samples(DRUMS_URL, DRUMS_BASE);

// Fetch and decode the self-hosted drum one-shots ahead of time. Strudel only loads a sample on
// its first hit, and drops that hit ("loading sound … took too long") when it isn't ready in time.
// superdough caches buffers by URL, so later hits on the same files play straight away.
//
// Two phases, so the page doesn't wait for the whole bank:
// - boot: the first BOOT_COUNT files, in round-robin order over the sounds (every sound's :0
//   first, then every :1 …), so each kit piece already has its default hit. The returned promise
//   resolves here and onProgress(n, total) counts up to this set only.
// - background: the rest keeps loading quietly with fewer requests at a time, so it doesn't
//   crowd out the orb / song samples fetched on demand. drumsAll() resolves when it is done.
const BOOT_COUNT = 100;
const BOOT_WORKERS = 8;
const BG_WORKERS = 2;
let drumsReady, drumsAllDone;
export const drumsAll = () => drumsAllDone ?? preloadDrums().then(() => drumsAllDone);
export function preloadDrums(onProgress) {
  return (drumsReady ??= (async () => {
    const map = await fetch(DRUMS_URL).then((r) => r.json());
    const lists = Object.entries(map)
      // fx_* (≈2 MB) and the pitched instruments (note maps, ≈2.5 MB) are longer and only a few
      // orbs play them: those load when the orb is hovered, grabbed or added (warm in orbs.js)
      .filter(([k, v]) => !k.startsWith('_') && !k.startsWith('fx_') && Array.isArray(v))
      .map(([, v]) => v);
    const urls = [];
    for (let i = 0; urls.length < lists.reduce((s, l) => s + l.length, 0); i++) {
      for (const l of lists) if (i < l.length) urls.push(DRUMS_BASE + l[i]);
    }
    const ac = getAudioContext(); // decoding works while the context is still suspended
    const load = (url) => loadBuffer(url, ac).catch((e) => console.warn('drum preload failed', url, e));
    const run = (queue, workers, onEach) =>
      Promise.all(Array.from({ length: workers }, async () => {
        for (let url; (url = queue.shift()); ) await load(url).then(onEach);
      }));

    const boot = urls.slice(0, BOOT_COUNT);
    const total = boot.length; // run() empties the queue as it goes
    let done = 0;
    onProgress?.(0, total);
    await run(boot, BOOT_WORKERS, () => onProgress?.(++done, total));
    drumsAllDone = run(urls.slice(BOOT_COUNT), BG_WORKERS);
  })());
}

// vcsl.json lists tom_mallet without its top folder ("Struck Membranophones/…" instead of
// "Membranophones/Struck Membranophones/…"), so every hit was a 404 and its orbs stayed silent.
// Registered again, after the map, with the full paths (same order, so tom_mallet:n is the same hit).
const VCSL = 'https://raw.githubusercontent.com/sgossner/VCSL/master/';
const TOM_MALLET = [
  ...['v2_rr1', 'v2_rr2', 'v3_rr1', 'v3_rr2', 'v4_rr1', 'v4_rr2'].map((v) => `HitM_${v}`), 'RollM_v1_rr1', 'RollM_v2_rr1',
].map((h) => `Membranophones/Struck%20Membranophones/Tom%201/Mallet/TomH_${h}_Mid.wav`);

export const loadSampleBanks = () =>
  Promise.all([
    loadDrums(),
    samples(DOUGH + 'vcsl.json').then(() => samples({ tom_mallet: TOM_MALLET }, VCSL)),
    samples(DOUGH + 'piano.json'),
  ]);

const NOTE = { c: 0, d: 2, e: 4, f: 5, g: 7, a: 9, b: 11 };
// sample-map keys look like "A#2", "Ds1" (s = sharp), "Bb3"
function keyToMidi(key) {
  const m = /^([a-g])(#|s|b)?(-?\d)$/i.exec(key);
  if (!m) return null;
  const acc = m[2] === '#' || m[2] === 's' ? 1 : m[2] === 'b' ? -1 : 0;
  return 12 * (+m[3] + 1) + NOTE[m[1].toLowerCase()] + acc;
}

// Trigger every sample a song needs at zero gain so it is fetched before it plays.
// Pitched instruments (piano, marimba …) are split into one file per key, so all keys load.
// Resolves once every hit has loaded (or failed).
export function preloadSamples(names) {
  const ac = getAudioContext();
  const map = soundMap.get();
  const t = ac.currentTime + 0.05;
  const hits = [];
  const hit = (v) => hits.push(superdough({ gain: 0, ...v }, t, 0.1).catch(() => {}));
  for (const name of names) {
    const [s, n = 0] = name.split(':');
    const keys = map[s.toLowerCase()]?.data?.samples; // superdough stores names lowercased
    if (keys && !Array.isArray(keys) && typeof keys === 'object') {
      for (const k of Object.keys(keys)) {
        const note = keyToMidi(k);
        if (note !== null) hit({ s, note });
      }
    } else {
      hit({ s, n: +n });
    }
  }
  return Promise.all(hits);
}
