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

// Fetch and decode every self-hosted drum one-shot up front. Strudel only loads a sample on its
// first hit, and drops that hit ("loading sound … took too long") when it isn't ready in time.
// The files are small (a few KiB each), so loading the whole bank is cheaper than missing beats.
// superdough caches buffers by URL, so later hits on the same files play straight away.
let drumsReady;
export function preloadDrums(onProgress) {
  return (drumsReady ??= (async () => {
    const map = await fetch(DRUMS_URL).then((r) => r.json());
    const urls = Object.entries(map)
      .filter(([k]) => !k.startsWith('_'))
      .flatMap(([, v]) => (Array.isArray(v) ? v : Object.values(v).flat()))
      .map((p) => DRUMS_BASE + p);
    const ac = getAudioContext(); // decoding works while the context is still suspended
    const queue = [...urls];
    let done = 0;
    onProgress?.(0, urls.length);
    const worker = async () => {
      for (let url; (url = queue.shift()); ) {
        await loadBuffer(url, ac).catch((e) => console.warn('drum preload failed', url, e));
        onProgress?.(++done, urls.length);
      }
    };
    await Promise.all(Array.from({ length: 8 }, worker)); // a few requests at a time
  })());
}

export const loadSampleBanks = () =>
  Promise.all([
    loadDrums(),
    samples(DOUGH + 'vcsl.json'),
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
