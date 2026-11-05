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
// `first`: sample names ("TR909_bd", "Kit_sd:5") to put at the front of the boot set, so the
// orbs that play them are ready when the page opens (the opening rain in orbs.js only drops orbs
// whose sounds are all booted, see isBooted). Names outside this bank are skipped. The boot set
// grows past BOOT_COUNT if `first` alone is longer.
const BOOT_COUNT = 100;
const BOOT_WORKERS = 8;
const BG_WORKERS = 2;
let drumsReady, drumsAllDone;
let drumMap = null; // sound -> file list, once strudel.json is in
const booted = new Set(); // "sound:n" decoded during boot
// the bank's own name for a hit ("TR909_bd" -> "TR909_bd:0"; n wraps like Strudel's), or null
// when the sound isn't a one-shot of this bank (pitched maps, fx_*, VCSL, piano …)
function drumKey(name) {
  const [s, n = 0] = name.split(':');
  const list = drumMap?.[s];
  if (!Array.isArray(list) || !list.length || s.startsWith('fx_')) return null;
  return `${s}:${((+n % list.length) + list.length) % list.length}`;
}
// true once boot is done and this sample was in it
export const isBooted = (name) => booted.has(drumKey(name));
export const drumsAll = () => drumsAllDone ?? preloadDrums().then(() => drumsAllDone);
export function preloadDrums(onProgress, first = []) {
  return (drumsReady ??= (async () => {
    const map = await fetch(DRUMS_URL).then((r) => r.json());
    drumMap = map;
    const lists = Object.entries(map)
      // fx_* (≈2 MB) and the pitched instruments (note maps, ≈2.5 MB) are longer and only a few
      // orbs play them: those load when the orb is hovered, grabbed or added (warm in orbs.js)
      .filter(([k, v]) => !k.startsWith('_') && !k.startsWith('fx_') && Array.isArray(v));
    // round-robin over the sounds (every sound's :0 first, then every :1 …), after `first`
    const keys = new Set(first.map(drumKey).filter(Boolean));
    const head = keys.size;
    for (let i = 0; keys.size < lists.reduce((s, [, l]) => s + l.length, 0); i++) {
      for (const [k, l] of lists) if (i < l.length) keys.add(`${k}:${i}`);
    }
    const order = [...keys];
    const url = (key) => {
      const [s, n] = key.split(':');
      return DRUMS_BASE + map[s][+n];
    };
    const ac = getAudioContext(); // decoding works while the context is still suspended
    const load = (key) => loadBuffer(url(key), ac).catch((e) => console.warn('drum preload failed', url(key), e));
    const run = (queue, workers, onEach) =>
      Promise.all(Array.from({ length: workers }, async () => {
        for (let key; (key = queue.shift()); ) await load(key).then((buf) => onEach?.(key, buf));
      }));

    const count = Math.max(BOOT_COUNT, head);
    const boot = order.slice(0, count);
    const total = boot.length; // run() empties the queue as it goes
    let done = 0;
    onProgress?.(0, total);
    await run(boot, BOOT_WORKERS, (key, buf) => {
      if (buf) booted.add(key); // a failed file leaves its orbs out of the opening rain
      onProgress?.(++done, total);
    });
    drumsAllDone = run(order.slice(count), BG_WORKERS);
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

// The same banks as `samples(...)` lines for the top of a set opened on strudel.cc, with absolute
// URLs (this site's own bank is fetched from here, so the server sends it with CORS open).
// tom_mallet's fix only when the code plays it.
// Single quotes only: Strudel reads every "double-quoted" string as mini-notation.
export function samplePrelude(code) {
  const q = (s) => `'${s.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
  return [
    `await samples(${q(DRUMS_URL)}, ${q(DRUMS_BASE)})`,
    `await samples(${q(DOUGH + 'vcsl.json')})`,
    `await samples(${q(DOUGH + 'piano.json')})`,
    ...(code.includes('tom_mallet') ? [`await samples({ tom_mallet: [${TOM_MALLET.map(q).join(', ')}] }, ${q(VCSL)})`] : []),
  ];
}

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
