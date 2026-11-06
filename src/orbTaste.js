// Taste: which falling orbs fit the song, and when to look elsewhere.
//
// Every sound orb gets a vibe: a point on four axes (VIBES), read from its family and its kind label.
// World orbs (hand drums, balafon, dan tranh …: world the strongest of the read-out axes) are too few to
// be a vibe of their own; they get none and fall at their plain weight, whatever the player does.
// Inside each category the vibes get a target share of the drops:
// - while the player is happy (t = 0), the song's own vibes come up more, but no vibe takes more
//   than MAX_SHARE of a category (or its plain share, when that is already higher);
// - when the player turns orbs down (grabs one and lets it go anywhere but the song, hears one on
//   hover and leaves it, or tries one in a slot and lets it go) an exploration level `t` rises and
//   the share moves to the vibes the song doesn't have, evenly, however many orbs each has;
// - each vibe turned down builds its own penalty, so turning down the new direction too moves on to
//   the vibes not yet tried;
// - a vibe that already has many orbs falling gets less, so the field never fills with one vibe.
// Inside a vibe the orbs keep their plain weights, nudged towards combo mates of the song's orbs.
// Putting an orb in brings `t` back down, so the new direction becomes the new centre.
//
// Each category keeps the share spawnWeights gave it (CAT_SHARE, the 4× for missing parts …).
// Moods, keys, tempos and world orbs have no vibe and are left alone. Kept for the session only, never saved.
//
// The other-scale orbs (pentatonic, blues …) have two sides: their vibe comes from what they are
// played on, like any orb, and their scale is a separate knob (scaleKeep) that turns the family's
// share down when they are turned down. Turning one down counts only half for its vibe, since it may
// be the scale that was not wanted.
// See docs/ORBS.md, "Spawn balance".
import { LAYERS, byId } from './orbCatalog.js';

// the words and families are read on one more axis, world, which only sorts the world orbs out
const AXES = ['dance', 'organic', 'chip', 'ambient', 'world'];
export const VIBES = AXES.slice(0, 4);
const D = VIBES.length;
const vec = (o) => AXES.map((k) => o[k] ?? 0);

// the starting point, by family
const FAMILY_VIBE = {
  TR909: { dance: 1 }, TR808: { dance: 1 }, TR707: { dance: 1 }, TR606: { dance: 1 }, TR727: { dance: 0.7, world: 0.3 }, RD6: { dance: 1 },
  kit: { organic: 1 }, kitbreak: { organic: 0.6, dance: 0.4 },
  'bass guitar': { organic: 1 }, 'upright bass': { organic: 1 }, piano: { organic: 1 }, wurlitzer: { organic: 1 }, organ: { organic: 0.8, ambient: 0.2 },
  zzfx: { chip: 1 }, 'block fx': { dance: 1 },
  // a plain synth leans only lightly to dance, so sine / triangle / pad words can make it ambient
  synth: { dance: 0.3 }, sampled: { organic: 0.4 },
};
// words in the kind label (and a scale orb's instrument) that pull an orb towards a vibe; added up
// the other-scale orbs are one family whatever they are played on: the family their instrument
// would have (as familyOf in orbCatalog.js), so their vibe is the sound's, not the scale's
const SCALE_INST = { wurli: 'wurlitzer', swagbass: 'bass guitar', growlybass: 'bass guitar', uprightbass: 'upright bass' };
const instFamily = (s) => SCALE_INST[s] ?? (/^(z_)?(sine|sawtooth|square|triangle|supersaw)$/.test(s) ? 'synth' : 'sampled');
const WORDS = [
  [/acid|trance|house|disco|dnb|reese|wobble|wub|hoover|rave|riser|downlifter|stab|gate|euclid|breaks|rolling|dirty|supersaw|saw|pulse|pwm|sync|offbeat|impact|sweep|crash|clap/, { dance: 0.8 }],
  [/square|8-bit/, { dance: 0.3, chip: 0.4 }],
  [/chip|blip|bleep|tan\b|crunch|invaders|coin|laser|jump/, { chip: 1.2 }],
  [/pad|air|drone|hum|dust|rain|tape hiss|texture|swell|sustain|held|glass|shimmer|space|bells?\b|tubular|handchimes|bowed|sine|triangle|soft|echo|bubbles|flexatone/, { ambient: 0.8 }],
  [/lofi|dub/, { ambient: 0.5, organic: 0.3 }],
  [/piano|sax|harmonica|recorder|vibes|vibraphone|xylophone|marimba|harp|clav|glockenspiel|kit|cabasa|hihat · hihat|concert|timpani|tom\b|walk|upright|finger|funk|charleston|stride|ballad|skank|flute|brass|whistle|e-piano|organ|vibraslap|guiro|anvil|brake/, { organic: 0.8 }],
  [/balafon|dan ?tranh|strumstick|darbuka|conga|bongo|cajon|agogo|didgeridoo|quijada|belltree|tresillo/, { world: 0.9 }],
  [/synthwave|fm|deep|sub/, { dance: 0.3, ambient: 0.2 }],
];

const norm = (v) => Math.hypot(...v) || 1;
const unit = (v) => {
  const n = norm(v);
  return v.map((x) => x / n);
};
const dot = (a, b) => a.reduce((s, x, i) => s + x * b[i], 0);
const sum = (v) => v.reduce((a, b) => a + b, 0);
const share = (v) => {
  const s = sum(v);
  return s > 0 ? v.map((x) => x / s) : v;
};

const vibeCache = new Map();
const worldIds = new Set();
// a world orb: left out of the taste, so it falls at its plain weight (spawnWeights)
export const isWorld = (l) => (vibeOf(l), worldIds.has(l?.id));
// the unit vibe vector of an orb, or null for orbs that play nothing (moods, keys, tempos) and for
// world orbs (see isWorld); a little world in another orb (the TR727's) is simply left out
export function vibeOf(l) {
  if (!l) return null;
  if (vibeCache.has(l.id)) return vibeCache.get(l.id);
  let v = null;
  if (l.combo) {
    const parts = l.combo.map((c) => vibeOf(byId[c])).filter(Boolean);
    if (parts.length) v = unit(parts.reduce((s, p) => s.map((x, i) => x + p[i]), Array(D).fill(0)));
  } else if (l.src) v = vibeOf(byId[l.src]); // a drawn orb sounds like its instrument
  else if (l.code && l.family) {
    const s = vec(FAMILY_VIBE[l.scaleFamily ? instFamily(l.inst) : l.family] ?? {});
    const text = `${l.kindKo ?? l.kind ?? ''} ${l.inst ?? ''}`.toLowerCase();
    for (const [re, add] of WORDS) if (re.test(text)) vec(add).forEach((x, i) => (s[i] += x));
    if (l.tag === 'dubtechno') vec({ dance: 0.5, ambient: 0.5 }).forEach((x, i) => (s[i] += x));
    const world = s.pop();
    v = world > 0 && world >= Math.max(...s) ? null : s.some((x) => x > 0) ? unit(s) : null;
    if (!v && world > 0) worldIds.add(l.id);
  }
  vibeCache.set(l.id, v);
  return v;
}
// how much of an orb belongs to each vibe (sums to 1): a sine bass might be 0.4 dance, 0.6 ambient
const memberOf = (l) => vibeOf(l)?.map((x) => x * x) ?? null;

// orbs that share a combo with each other: the catalogue's own "these go together"
const mates = new Map();
for (const l of LAYERS) {
  if (!l.combo) continue;
  for (const a of l.combo) for (const b of l.combo) if (a !== b) (mates.get(a) ?? mates.set(a, new Set()).get(a)).add(b);
}
const MATE_BONUS = 0.35;
const soundIds = (id) => (byId[id]?.combo ?? [id]);

// how well two orbs go together, 0 … 1
function sim(a, b) {
  const va = vibeOf(a), vb = vibeOf(b);
  if (!va || !vb) return null;
  let s = Math.max(0, dot(va, vb));
  if (soundIds(a.id).some((x) => soundIds(b.id).some((y) => mates.get(x)?.has(y)))) s += MATE_BONUS;
  return Math.min(1, s);
}

// ---------- tuning ----------
export const TUNE = {
  pull: 1.6, // t = 0: a vibe's share × e^(pull × its share of the song)
  maxShare: 0.55, // … but no vibe above this share of a category (unless its plain share is higher)
  penFull: 1.5, // turned-down weight at which a vibe's penalty is full (one strong turn-down ≈ 0.6 of it)
  penCut: 0.85, // a vibe at full penalty keeps 15% of its share
  crowd: 0.15, // a vibe's share ÷ (1 + crowd × orbs of it falling now)
  inVibe: 1.2, // inside a vibe, towards orbs that fit the song (combo mates); fades as t rises
  epsilon: 0.12, // this share of every category ignores taste, so nothing ever stops falling
  tHalfLife: 45, // seconds for t to halve on its own
  pHalfLife: 60, // seconds for a turned-down vibe's penalty to halve
  bump: { grab: 0.2, hover: 0.12, slot: 0.07 }, // t added per turn-down (more when the orb fit the song)
  weight: { grab: 1, hover: 0.6, slot: 0.35 }, // how much a turn-down counts towards the penalty
  addKeep: 0.3, // t kept when an orb goes in
  scaleFull: 2.5, // turned-down weight of other-scale orbs at which their family's cut is full (≈ 3 strong turn-downs)
  scaleCut: 0.7, // … and at full the family keeps 30% of its share (SCALE_SHARE 30% → 9%)
  scaleVibe: 0.5, // how much turning down an other-scale orb counts for its vibe (and t)
};

// ---------- state (this session only) ----------
let clock = () => performance.now() / 1000;
export const setClock = (fn) => (clock = fn);
// scale: the turned-down weight of other-scale orbs (halves like the vibe penalties)
const state = { t: 0, tAt: 0, pen: Array(D).fill(0), pAt: 0, scale: 0 };
const touched = new Map(); // id -> 'grab' | 'slot': taken out of the field and not settled yet
const hoverSeen = new Map(); // id -> time of the last hover turn-down (counted once per 15 s)
let song = () => []; // the orbs in the song (set by orbs.js)
export const setSong = (fn) => (song = fn);
let falling = () => []; // ids of the orbs falling in the field now (set by orbs.js)
export const setFalling = (fn) => (falling = fn);

const decay = (half, dt) => Math.pow(0.5, Math.max(0, dt) / half);
function settle() {
  const now = clock();
  state.t *= decay(TUNE.tHalfLife, now - state.tAt);
  state.tAt = now;
  const k = decay(TUNE.pHalfLife, now - state.pAt);
  state.pen = state.pen.map((x) => x * k);
  state.scale *= k;
  state.pAt = now;
}
export function level() {
  settle();
  return { t: +state.t.toFixed(3), pen: Object.fromEntries(VIBES.map((k, i) => [k, +state.pen[i].toFixed(2)])), scale: +scaleKeep().toFixed(2) };
}

// how well an orb fits the song now, 0 … 1 (null: no vibe, or nothing in the song to compare with)
function fitOf(l, inSong = song().filter((s) => s.id !== l.id)) {
  const ss = inSong.map((s) => sim(l, s)).filter((x) => x != null);
  return ss.length ? ss.reduce((a, b) => a + b, 0) / ss.length : null;
}

function turnDown(id, how) {
  const l = byId[id];
  const m = memberOf(l);
  settle();
  // an other-scale orb: the scale is turned down (world ones too), the sound only half (it may be the scale)
  if (l?.scaleFamily) state.scale += TUNE.weight[how];
  if (!m) return;
  const fit = fitOf(l) ?? 0.5;
  const k = l.scaleFamily ? TUNE.scaleVibe : 1;
  // an orb that fit and still got turned down says "something else" louder than one that didn't fit
  state.t = Math.min(1, state.t + k * TUNE.bump[how] * (0.5 + fit));
  state.pen = state.pen.map((x, i) => x + k * m[i] * TUNE.weight[how]);
}

// ---------- events from the page ----------
// picked up out of the falling field
export function grab(id) {
  touched.set(id, 'grab');
}
// put into one of the slots (편집, 변주, 약하게 / 세게): trying it out, so only a weak turn-down
// if it then goes back to the field
export function slot(id) {
  if (touched.has(id)) touched.set(id, 'slot');
}
// went to the stash, or is used up some other way: neither for nor against
export function clear(id) {
  touched.delete(id);
}
// an orb is falling in the field again: one taken out of it and not put in the song is turned down
export function landed(id) {
  const how = touched.get(id);
  if (!how) return;
  touched.delete(id);
  turnDown(id, how);
}
// the mouse left a falling orb after hearing it (secs of preview); grabbing it right after doesn't count
let hoverTimer = 0;
export function previewLeft(id, secs) {
  if (secs < 0.6) return;
  clearTimeout(hoverTimer);
  hoverTimer = setTimeout(() => {
    if (touched.has(id) || song().some((s) => s.id === id)) return;
    const now = clock();
    if (now - (hoverSeen.get(id) ?? -1e9) < 15) return;
    hoverSeen.set(id, now);
    turnDown(id, 'hover');
  }, 350);
}
// went into the song: the search worked, settle around it
export function add(id) {
  touched.delete(id);
  clearTimeout(hoverTimer);
  // an other-scale orb that went in (world ones too): the scales are welcome again
  if (byId[id]?.scaleFamily) (settle(), (state.scale = 0));
  if (!vibeOf(byId[id])) return; // a mood, tempo or world orb says nothing about the sound
  settle();
  state.t *= TUNE.addKeep;
  // what was turned down still counts, but less: the song has moved on
  state.pen = state.pen.map((x) => x * 0.5);
  if (!byId[id].scaleFamily) state.scale *= 0.5;
}
// the factor on the other-scale family's share (SCALE_SHARE in orbs/field.js): 1, down to 1 − scaleCut
export function scaleKeep() {
  settle();
  return 1 - TUNE.scaleCut * Math.min(1, state.scale / TUNE.scaleFull);
}

// ---------- weights ----------

// raise shares to at least nothing and cap each at cap[v], handing the excess to the others by size
function capShares(f, cap) {
  f = [...f];
  for (let k = 0; k < D; k++) {
    const over = f.map((x, i) => Math.max(0, x - cap[i]));
    const extra = sum(over);
    if (extra < 1e-9) break;
    const room = f.map((x, i) => (over[i] > 0 ? 0 : x));
    const r = sum(room);
    f = f.map((x, i) => (over[i] > 0 ? cap[i] : r > 0 ? x + (extra * x) / r : x));
    if (r <= 0) break;
  }
  return f;
}

// the target share of each vibe in one category: b = its plain shares (from the base weights)
export function targetShares(b, { t, songMix, pen, crowd }) {
  const avail = b.map((x) => x > 0.03);
  const keep = pen.map((p) => 1 - TUNE.penCut * Math.min(1, p / TUNE.penFull));
  // happy: the song's vibes up, capped
  let fit = share(b.map((x, i) => x * Math.exp(TUNE.pull * songMix[i]) * keep[i]));
  fit = capShares(fit, b.map((x) => Math.max(TUNE.maxShare, x)));
  // exploring: evenly over the vibes the song lacks, minus those already turned down
  let far = share(b.map((_, i) => (avail[i] ? (1 - songMix[i]) ** 2 * keep[i] + 1e-3 : 0)));
  if (!sum(far)) far = b;
  // the exploring side grows fast at first: 1 − (1 − t)², so one or two turn-downs already show
  const e = 1 - (1 - t) ** 2;
  // and fewer of whatever already fills the field
  return share(fit.map((x, i) => ((1 - e) * x + e * far[i]) / (1 + TUNE.crowd * crowd[i])));
}

const fitCache = { key: null, map: new Map() };
// base: spawnWeights' numbers for pool. Returns new ones with the same total per category.
export function reweigh(pool, base) {
  settle();
  const inSong = song();
  const t = state.t;
  const mix = (ls) => ls.reduce((s, l) => {
    const m = memberOf(l);
    return m ? s.map((x, i) => x + m[i]) : s;
  }, Array(D).fill(0));
  const songMix = share(mix(inSong));
  const crowd = mix(falling().map((id) => byId[id]).filter(Boolean));
  // fits only change with the song, so they are kept until it does
  const key = inSong.map((s) => s.id).join(',');
  if (key !== fitCache.key) Object.assign(fitCache, { key, map: new Map() });
  const fitOfCached = (l) => {
    if (!fitCache.map.has(l.id)) fitCache.map.set(l.id, fitOf(l, inSong));
    return fitCache.map.get(l.id);
  };

  const out = [...base];
  const byCat = new Map();
  pool.forEach((l, i) => memberOf(l) && (byCat.get(l.cat) ?? byCat.set(l.cat, []).get(l.cat)).push(i));
  for (const idx of byCat.values()) {
    const tot = sum(idx.map((i) => base[i]));
    if (!(tot > 0)) continue;
    const mass = Array(D).fill(0);
    for (const i of idx) memberOf(pool[i]).forEach((x, v) => (mass[v] += base[i] * x));
    const b = share(mass);
    const T = targetShares(b, { t, songMix, pen: state.pen, crowd });
    // spread each vibe's target over its orbs by membership × plain weight, leaning towards the
    // orbs that fit the song (combo mates) inside the vibe only, so the vibe's total stays T[v]
    const fits = idx.map((i) => fitOfCached(pool[i]));
    const known = fits.filter((f) => f != null);
    const mean = known.length ? sum(known) / known.length : 0;
    const lean = TUNE.inVibe * (1 - t);
    const tilt = fits.map((f) => (f != null ? Math.exp(lean * (f - mean)) : 1));
    const w = idx.map(() => 0);
    for (let v = 0; v < D; v++) {
      if (!(b[v] > 0)) continue;
      const part = idx.map((i, k) => base[i] * memberOf(pool[i])[v] * tilt[k]);
      const pt = sum(part);
      if (pt > 0) part.forEach((x, k) => (w[k] += (x / pt) * T[v] * tot));
    }
    idx.forEach((i, k) => (out[i] = TUNE.epsilon * base[i] + (1 - TUNE.epsilon) * w[k]));
  }
  return out;
}

export const debug = { state, touched, sim, fitOf, vibeOf, memberOf, targetShares, reweigh, level, scaleKeep, isWorld, TUNE };
