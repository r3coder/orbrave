// Dev-only orb level check (open /tools/orb-levels.html on the dev server).
// Every sound orb is rendered alone for 4 bars at the frame's 124 BPM with variation seeds 1–3,
// and its K-weighted integrated loudness (mean of the seeds) is compared with the median of its
// category (or the target an orb names with `level`, e.g. block FX follow the kick). Orbs to check that sit more than `tolerance` dB away get a suggested TRIM entry:
// their current trim times the correction, ready to paste into TRIM in src/orbCatalog.js.
// The medians include every orb, so a batch of new orbs is matched to the catalogue as it is.
import { initStrudel, registerZZFXSounds } from '@strudel/web';
import { loadSampleBanks, preloadSamples, preloadDrums, drumsAll } from '../src/samples.js';
import { renderOffline, loudness } from '../src/offline.js';
import { LAYERS, TRIM, rng, hash } from '../src/orbCatalog.js';

const SOUND_CATS = ['kick', 'snare', 'hat', 'perc', 'bass', 'pad', 'arp', 'lead', 'fx', 'texture'];
const SEEDS = [1, 2, 3];
const BARS = 4;
const CPS = 124 / 240;
const DT = (0.75 / CPS / 4).toFixed(3); // the orbs' delay time: a dotted 8th at 124 BPM

const logEl = document.getElementById('log');
const log = (...a) => { logEl.textContent += a.join(' ') + '\n'; console.log(...a); };
const median = (xs) => {
  const s = [...xs].sort((a, b) => a - b), m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

const repl = await initStrudel({
  prebake: async () => {
    registerZZFXSounds();
    await loadSampleBanks();
  },
});

// the code an orb plays for a variation seed (same as codeOf in src/orbs/audio.js, minor key)
const codeOf = (l, v) => (typeof l.code === 'function' ? l.code(rng(hash(l.id) + v * 7919)) : l.code).replaceAll('__DT__', DT);

// Results are kept in localStorage by the orb's code, so a page reload (the dev server reloads on
// every source change) resumes where it stopped, and later runs only render new or changed orbs.
const CACHE_KEY = 'orbLevels.v1';
const cache = (() => { try { return JSON.parse(localStorage.getItem(CACHE_KEY)) ?? {}; } catch { return {}; } })();
const saveCache = () => { try { localStorage.setItem(CACHE_KEY, JSON.stringify(cache)); } catch { /* full or blocked */ } };
const codeKey = (l) => `${l.id}:${hash((typeof l.code === 'function' ? SEEDS : [1]).map((v) => codeOf(l, v)).join('\n'))}`;

async function lufs(l) {
  const key = codeKey(l);
  if (key in cache) return cache[key];
  if (l.samples?.length) await preloadSamples(l.samples);
  const vals = [];
  for (const v of typeof l.code === 'function' ? SEEDS : [1]) {
    const pattern = await repl.evaluate(`$: ${codeOf(l, v)}`, false);
    const m = await loudness(await renderOffline(pattern, { start: 0, end: BARS, cps: CPS, tail: 0.5, limiter: false }));
    if (Number.isFinite(m.integrated) && m.integrated > -70) vals.push(m.integrated);
  }
  cache[key] = vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
  saveCache();
  return cache[key];
}

async function run() {
  logEl.textContent = '';
  const t0 = performance.now();
  const only = document.getElementById('only').value.trim();
  const tol = +document.getElementById('tol').value || 2;
  const orbs = LAYERS.filter((l) => SOUND_CATS.includes(l.cat) && l.code);
  const check = new Set(only === 'all' ? orbs.map((l) => l.id)
    : only === 'new' ? orbs.filter((l) => l.tag || l.spot).map((l) => l.id)
      : only.split(',').map((s) => s.trim()));
  await preloadDrums();
  await drumsAll();
  log(`— measuring ${orbs.length} orbs (${check.size} to check)`);
  const level = {};
  for (const [i, l] of orbs.entries()) {
    level[l.id] = await lufs(l);
    if (i % 25 === 24) log(`  ${i + 1}/${orbs.length}`);
  }
  const byCat = {};
  for (const l of orbs) if (level[l.id] !== null) (byCat[l.cat] ??= []).push(level[l.id]);
  const med = Object.fromEntries(Object.entries(byCat).map(([c, xs]) => [c, median(xs)]));
  log('— category medians (LUFS)');
  for (const c of SOUND_CATS) if (med[c] !== undefined) log(`  ${c.padEnd(8)} ${med[c].toFixed(1)}  (${byCat[c].length} orbs)`);
  log(`— checked orbs (±${tol} dB)`);
  const fixes = [];
  for (const l of orbs.filter((x) => check.has(x.id))) {
    const lv = level[l.id];
    if (lv === null) { log(`  ${l.id.padEnd(10)} silent`); continue; }
    // an orb can name its own target: [category whose median to use, offset in dB]
    const [refCat, offset] = l.level ?? [l.cat, 0];
    const d = med[refCat] + offset - lv;
    const off = Math.abs(d) > tol;
    log(`  ${l.id.padEnd(10)} ${l.kindKo ?? l.kind} · ${lv.toFixed(1)} (${d >= 0 ? '+' : ''}${d.toFixed(1)} dB)${off ? '  ← trim' : ''}`);
    if (off) fixes.push(`${l.id}: ${+((TRIM[l.id] ?? 1) * 10 ** (d / 20)).toFixed(2)}`);
  }
  log(fixes.length ? `\n// add to TRIM in src/orbCatalog.js\n${fixes.join(', ')},` : '\nall checked orbs are within tolerance');
  log(`finished in ${((performance.now() - t0) / 1000).toFixed(0)} s`);
  window.__levels = { level, med, fixes };
}

document.getElementById('run').onclick = run;
window.__runLevels = run;
window.__repl = repl; // for one-off checks from the console
// ?run starts at once (and again after a reload, picking up from the cache)
if (new URLSearchParams(location.search).has('run')) run();
