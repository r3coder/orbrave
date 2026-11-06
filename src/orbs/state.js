// Shared state of the orb page: the DOM handles, the set being played (active, seeds, variations, volume steps), and S, the values more than one of these files changes.
//
// The orb page used to be one file (orbs.js). It is now src/orbs.js (the entry) and these files,
// which load in a chain: each one's FIRST import is the file before it (state → audio → guide →
// list → field → drag → variations → customOrbs → slots → presets → share → stems → visuals →
// search → orbs.js). The entry imports search.js, which imports visuals.js first, and so on down to
// this file, so the top-level code of every file runs in that order, the same as in the one file;
// imports of later files are fine (functions are there from the start), but top-level code must not
// use a later file's consts. Keep the file before as the first import when adding imports.
// This file also imports every outside module, in the old order, so the CSS lands as before.
import { initStrudel, registerZZFXSounds, Pattern } from '@strudel/web';
import { loadSampleBanks, preloadDrums } from '../samples.js';
import '../orbs.css';
import { LAYERS } from '../orbCatalog.js';
import { STEPS, VAR_MAX } from '../orbPreset.js';
import '../presetApi.js';
import '../orbEdit.js';
import '../orbEditor.js';
import '../vote.js';
import '../liteMode.js';
import '../theme.js';
import '../midiBackdrop.js';
import '../orbsI18n.js';
import '../i18n.js';
import '../phoneLayout.js';
import '../licenses.js';
import '../copyBox.js';
import '../changelog.js';
import '../tutorial.js';
import '../saveFile.js';
import '../orbTaste.js';
import '../../server/presetSchema.mjs';

// Values more than one file changes. ES module bindings can only be reassigned in the file that
// declares them, so these live on one object; each is set (with what it means) where it was declared.
export const S = {};

// Gate a pattern to one window of a looping song: the song starts at cycle `s0`, is `len`
// cycles long, and this part plays from `a` to `b` within it.
// Nothing sounds before cycle `from`: a jump into the song waits there in silence.
Pattern.prototype.songPart = function (s0, len, a, b, from = s0) {
  return this.filterWhen((t) => {
    const p = (((t - s0) % len) + len) % len;
    return t >= s0 && t >= from && p >= a && p < b;
  });
};

// ---------- state ----------

const $ = (id) => document.getElementById(id);
const ui = {
  play: $('play'), core: $('core'), sats: $('sats'), field: $('field'), right: $('right'), status: $('status'),
  chips: $('chips'), roles: $('roles'), soloHint: $('soloHint'), drawer: $('drawer'), code: $('code'),
  roll: $('roll'), rollCanvas: $('rollCanvas'), rollSlot: $('rollSlot'), rollName: $('rollName'),
  rollHint: $('rollHint'), rollDone: $('rollDone'), rollDice: $('rollDice'), rollFull: $('rollFull'), rollScroll: $('rollScroll'),
  varyWrap: $('varyWrap'), varyDel: $('varyDel'), varyPrev: $('varyPrev'), varyNext: $('varyNext'), varyEdit: $('varyEdit'),
  slots: $('slots'), slotHint: $('slotHint'), orbEdit: $('orbEdit'), editWrap: $('editWrap'), editOpen: $('editOpen'),
  stash: $('stash'), stashSlots: $('stashSlots'),
  presetList: $('presetList'), presetName: $('presetName'),
  song: $('song'), songBtn: $('songBtn'),
  stem: $('stems'), stemGrid: $('stemGrid'), seedPop: $('seedPop'),
  search: $('searchBox'), searchInput: $('searchInput'), searchResults: $('searchResults'),
};

// the orb page also plays ZZFX synths, on top of the shared banks
const replReady = initStrudel({
  prebake: () => {
    registerZZFXSounds(); // z_sine, z_square … synths (@strudel/web doesn't register them by itself)
    return loadSampleBanks();
  },
});
// Boot screen: hold the page until the sample maps are registered and every drum one-shot is
// decoded (see samples.js), so the first bars never drop hits while files are still downloading.
// The boot set starts with the drum hits of the band-part orbs (FIRST_CATS), so the opening rain
// (see pickCandidate) has kicks, snares and hats to drop next to the synth orbs.
// what may fall before the first orb ever goes in: 리드 · 아르페지오 · 베이스 · 코드 · 킥 · 스네어 · 하이햇
const FIRST_CATS = new Set(['lead', 'arp', 'bass', 'pad', 'kick', 'snare', 'hat']);
const bootFirst = LAYERS.filter((l) => FIRST_CATS.has(l.cat) && !l.combo).flatMap((l) => l.samples ?? []);
const bootBar = document.getElementById('bootBar'), bootCount = document.getElementById('bootCount');
const drumsReady = preloadDrums((n, total) => {
  bootBar.style.width = `${(100 * n) / total}%`;
  bootCount.textContent = `${n} / ${total}`;
}, bootFirst).catch((e) => console.warn('drum preload failed', e));
const booted = Promise.all([replReady, drumsReady])
  .catch((e) => console.warn('preload failed, starting anyway', e))
  .finally(() => document.body.classList.add('booted'));
S.repl = undefined;
S.playing = false;
S.started = false; // audio context unlocked + master chain built
const active = new Map(); // id -> { layer, at, sat, home }
S.variation = 1 + Math.floor(Math.random() * 9999); // every page load starts from its own seed
// orbs given their own seed with the 🎲 on their strip; the rest follow `variation`
const ownSeed = new Map(); // id -> seed
// Variations (the 변주 slot): an orb that has been in it keeps a numbered list, 01 the way it
// played before, 02 … added there: a seed, or notes drawn with 편집 ({ raw }). It plays the one
// selected (vi); the stems pick one per block (cell.k). A seed variation is played through
// ownSeed / heldSeed like any own seed (applyVar), so presets and the player read it as before.
const orbVars = new Map(); // id -> { list: [{ seed: n | null, auto? } | { raw }], vi }
const varOf = (id) => {
  const s = orbVars.get(id);
  return s ? s.list[s.vi] : null;
};
const varCount = (id) => orbVars.get(id)?.list.length ?? 1;
const varNum = (k) => String(k + 1).padStart(2, '0');
// what codeOf plays for a drawn variation: the notes themselves
const drawnOf = (l) => (varOf(l.id)?.raw ? varOf(l.id) : undefined);
const seedOf = (l) => drawnOf(l) ?? ownSeed.get(l.id) ?? S.variation;
// variation k of an orb as codeOf takes it (a seed, or { raw })
function varPlay(l, k) {
  const x = orbVars.get(l.id)?.list[k ?? 0];
  if (!x) return seedOf(l);
  return x.raw ? x : x.seed ?? S.variation;
}
// the plain seed of variation k (a drawn one has none: the shared one)
const varSeed = (l, k) => {
  const v = varPlay(l, k);
  return typeof v === 'number' ? v : S.variation;
};
// make the orb play its selected variation (a seed one through ownSeed in the song, heldSeed outside)
function applyVar(id) {
  const x = varOf(id);
  if (!x) return;
  const m = active.has(id) ? ownSeed : heldSeed;
  (active.has(id) ? heldSeed : ownSeed).delete(id);
  if (x.raw || x.seed == null) m.delete(id);
  else m.set(id, x.seed);
}
// a list from a saved session or a preset (page form, see orbPreset.js varsFromWire)
function setVars(id, v) {
  if (!v || !Array.isArray(v.list) || !v.list.length) return;
  const list = v.list.slice(0, VAR_MAX).map((x) => (Array.isArray(x?.raw) && x.raw.length === STEPS
    ? { raw: [...x.raw] }
    : { seed: Number.isSafeInteger(x?.seed) && x.seed >= 0 ? x.seed : null, ...(x?.auto ? { auto: String(x.auto) } : {}) }));
  orbVars.set(id, { list, vi: Number.isSafeInteger(v.vi) && v.vi >= 0 && v.vi < list.length ? v.vi : 0 });
  applyVar(id);
}
// the variation index playing seed v (added to the list when it isn't there yet)
function varIndexOf(id, v) {
  const st = ensureVars(id);
  const k = st.list.findIndex((x) => !x.raw && (x.seed ?? S.variation) === v);
  if (k >= 0) return k;
  if (st.list.length >= VAR_MAX) return st.vi;
  st.list.push({ seed: v });
  return st.list.length - 1;
}
// the variations of the set's orbs (for presets and share codes), or null
const presetVars = () => {
  const ids = [...active.keys()].filter((id) => orbVars.has(id));
  return ids.length ? Object.fromEntries(ids.map((id) => [id, orbVars.get(id)])) : null;
};
// the list, started with 01 = how the orb plays right now
function ensureVars(id) {
  let s = orbVars.get(id);
  if (!s) {
    const own = active.has(id) ? ownSeed.get(id) : heldSeed.get(id);
    s = { list: [{ seed: own ?? null }], vi: 0 };
    orbVars.set(id, s);
  }
  return s;
}
const ownSeeds = () => (ownSeed.size ? Object.fromEntries(ownSeed) : null);
// Orbs changed in the slots under the field travel with that change wherever they go (field,
// stash, song) until they leave the screen: a volume from 약하게 / 세게 (for a mood: how strong its effects are), and a seed from 변주
// waiting for the orb to go into the song (or kept from the song when it comes out).
// The volume is a number of steps, -3 … +3: each 약하게 is × 0.8, each 세게 × 1.2, and
// one cancels the other. The orb shows it (smaller / bigger, one sound-wave ring per step).
const VOL_STEPS = 3;
const orbStep = new Map(); // id -> steps (never 0)
const volStep = (id) => orbStep.get(id) ?? 0;
const stepGain = (n) => (n < 0 ? 0.8 ** -n : 1.2 ** n);
// a volume from a preset (any factor) as the nearest step
const gainStep = (g) => Math.max(-VOL_STEPS, Math.min(VOL_STEPS, Math.round(Math.log(g) / Math.log(g < 1 ? 0.8 : 1.2) * (g < 1 ? -1 : 1))));
function setStep(id, n) {
  if (n) orbStep.set(id, n);
  else orbStep.delete(id);
}
const gainOf = (l) => stepGain(volStep(l.id));
const heldSeed = new Map(); // id -> seed, for orbs outside the song
// the volumes of the song's orbs that differ from 100%, as whole percents (presets, share codes)
const gainPct = (g) => Math.round(g * 100);
const ownGains = () => {
  const g = [...active.keys()].filter((id) => volStep(id)).map((id) => [id, gainPct(stepGain(volStep(id)))]);
  return g.length ? Object.fromEntries(g) : null;
};
// an orb that shows up anew (from the catalogue) starts as made
function forget(id) {
  orbStep.delete(id);
  heldSeed.delete(id);
  orbVars.delete(id);
}
S.solo = null; // id of the orb being auditioned from the list
S.song = null; // { seed, s0 } while the full-song arrangement plays
S.lastSong = null; // the stems closed last, for 📂 스템 열기
S.songPlanCache = null;

export {
  $, FIRST_CATS, VOL_STEPS, active, applyVar, booted, drawnOf, drumsReady, ensureVars, forget, gainOf,
  gainPct, gainStep, heldSeed, orbStep, orbVars, ownGains, ownSeed, ownSeeds, presetVars, replReady,
  seedOf, setStep, setVars, stepGain, ui, varCount, varIndexOf, varNum, varOf, varPlay, varSeed,
  volStep,
};
