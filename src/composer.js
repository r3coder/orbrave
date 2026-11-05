// Generative composer: turns a 32-bit seed into a full Strudel song.
// Every song is placed at an absolute cycle `start`, and each section's lines are
// wrapped in `.sect(start, len)` so several songs can live in one evaluated program
// and hand over to each other without gaps.
//
// Genre rules (tempo, grooves, progressions, sounds) follow docs/GENRES.md, which lists
// the production guides each one is based on. Step numbers are 0-based on a 16-step bar.

import { MIX_TRIM } from './mixTrim.js';

export const STYLE_NAMES = [
  'techno', 'house', 'acid', 'trance', 'dnb', 'breakbeat', 'lofi',
  'synthwave', 'ambient', 'dubtechno',
];

const ROOTS = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'];

// ---------- randomness ----------

export function makeRng(seed) {
  let a = seed >>> 0;
  const f = () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    f,
    int: (lo, hi) => lo + Math.floor(f() * (hi - lo + 1)),
    pick: (arr) => arr[Math.floor(f() * arr.length)],
    chance: (p) => f() < p,
    range: (lo, hi, dp = 2) => +(lo + f() * (hi - lo)).toFixed(dp),
  };
}

export const nextSeed = (seed) => (makeRng(seed ^ 0x9e3779b9).f() * 4294967296) >>> 0;
export const randomSeed = () => (Math.random() * 4294967296) >>> 0;

// ---------- styles ----------

// Progressions are scale degrees (0 = i, 1 = ii, 2 = III, 3 = iv, 4 = v, 5 = VI, 6 = VII in
// the style's scale), one chord per bar. Voicings are scale-degree stacks on each root:
// [0,2,4] triad, [0,2,4,6] 7th, [0,2,4,6,8] 9th, [0,1,4] sus2, [0,2,4,8] add9, [0,6] root+7th.
// Sample names: `Bank_part:n` (TR909, TR808, TR707, TR606, TR727, RD6, Kit) and `kitbreak`
// are the self-hosted CC0 drum bank in public/samples; piano/vibraphone/conga … are
// Salamander and VCSL (see samples.js).
// Avoid VCSL folders with a comma in their path (Shaker, Small / Steinway / Kawai /
// Kalimba): GitHub serves them with a duplicated Content-Disposition header that
// Chrome rejects, so they never load. Some VCSL takes also start late (tambourine:2
// ~380 ms, cabasa:2), so tambourine/cabasa are pinned to takes that hit on time, and
// marimba/glockenspiel/harp are recorded ~20–40 dB below the rest, so mallets use vibraphone.
const STYLES = {
  techno: {
    bpm: [124, 134], scales: ['minor', 'phrygian', 'phrygian'],
    duck: { roles: ['chords', 'lead', 'arp'], depth: 0.25, release: 0.6 },
    kick: 'four', kicks: ['TR909_bd:0', 'TR909_bd:2', 'TR909_bd:3', 'TR909_bd:5', 'RD6_bd:0'],
    snares: ['TR909_cp:0', 'TR909_rim:0', 'RD6_cp:0'],
    hats: ['skip16', 'skip16', 'rolling'], hh: ['TR909_hh:0', 'TR909_hh:1', 'RD6_hh:0'], oh: ['TR909_oh:0', 'RD6_oh:0'],
    percs: ['TR909_rim:0', 'TR909_lt:0', 'TR909_mt:1', 'cabasa:0', 'cabasa:3'],
    bass: ['rumble', 'rumble', 'pulse'],
    bassRhythm: ['~ ~ r ~ ~ ~ r ~ ~ ~ r ~ ~ ~ r ~', '~ ~ r r ~ ~ r r ~ ~ r r ~ ~ r r', '~ r r ~ ~ r r ~ ~ r r ~ ~ r r ~'],
    chords: ['stab', 'dub', 'none'], voicings: [[0, 6], [0, 4], [0, 2, 4, 6]],
    progs: [[0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 6, 6], [0, 1, 0, 1], [0, 0, 5, 5]],
    stabRhythm: ['~ ~ x ~ ~ ~ x ~', '~ x ~ ~ ~ ~ ~ x', '~ ~ ~ x ~ ~ x ~'], chordBars: [1, 2],
    lead: ['none', 'none', 'blip'],
  },
  house: {
    bpm: [118, 128], scales: ['dorian', 'minor', 'dorian'], swing16: [0, 0.05, 0.1, 0.2],
    duck: { roles: ['bass', 'chords'], depth: 0.1, release: 0.5 },
    kick: 'four', kicks: ['TR909_bd:1', 'TR909_bd:3', 'TR909_bd:4', 'TR808_bd:0'],
    snares: ['TR909_cp:0', 'TR909_cp:1', 'TR808_cp:0', 'RD6_cp:2'],
    hats: ['house16', 'house16', 'eighths'], hh: ['TR909_hh:1', 'TR909_hh:0', 'TR808_hh:0'], oh: ['TR909_oh:0', 'TR909_oh:1'],
    percs: ['conga', 'bongo', 'cabasa:0', 'cabasa:3', 'tambourine:0', 'tambourine:1'],
    bass: ['deep', 'deep', 'pluck'],
    bassRhythm: ['r ~ ~ r ~ r o ~', 'r ~ ~ ~ f ~ r ~', 'r ~ r ~ ~ f ~ o'],
    chords: ['piano', 'organ', 'epiano'], voicings: [[0, 2, 4, 6], [0, 2, 4, 6, 8]],
    progs: [[0, 6, 5, 4], [0, 3, 0, 3], [0, 6, 5, 6], [3, 3, 0, 0], [0, 5, 6, 0]],
    stabRhythm: ['~ x ~ x ~ x ~ x', '~ x ~ ~ ~ x ~ ~', '~ x ~ x ~ ~ ~ x'], chordBars: [1, 2],
    lead: ['none', 'none', 'fm'],
  },
  acid: {
    bpm: [118, 134], scales: ['minor', 'phrygian', 'mixolydian'], subLayer: true,
    kick: 'four', kicks: ['TR909_bd:0', 'TR808_bd:2', 'TR707_bd:0'],
    snares: ['TR909_cp:1', 'TR808_cp:0', 'TR707_cp:0'],
    hats: ['skip16', 'eighths'], hh: ['TR909_hh:1', 'TR808_hh:0', 'TR707_hh:0'], oh: ['TR909_oh:1', 'TR808_oh:1'],
    percs: ['TR808_rim:0', 'TR808_cb:0', 'TR909_rim:0'],
    bass: ['acid'], bassRhythm: ['acid'],
    chords: ['none', 'none', 'pad'], voicings: [[0, 2, 4, 6]],
    progs: [[0, 0, 0, 0], [0, 0, 6, 6]], stabRhythm: ['x ~ ~ ~ ~ ~ ~ ~'], chordBars: [2],
    lead: ['none'],
  },
  trance: {
    bpm: [136, 142], scales: ['minor'],
    duck: { roles: ['bass'], depth: 0.7, release: 0.8 },
    kick: 'four', kicks: ['TR909_bd:2', 'TR909_bd:5', 'RD6_bd:2'], snares: ['TR909_cp:1', 'TR808_cp:2'],
    hats: ['techno16', 'skip16'], hh: ['TR909_hh:0', 'RD6_hh:1'], oh: ['TR909_oh:1', 'RD6_oh:1'],
    percs: ['cabasa:0', 'cabasa:3', 'tambourine:0', 'tambourine:1', 'TR909_rim:0'],
    bass: ['pulse'], bassRhythm: ['~ r r r ~ r r r ~ r r r ~ r r r', '~ r ~ r ~ r ~ r'],
    chords: ['pad'], voicings: [[0, 2, 4], [0, 2, 4, 7]],
    progs: [[0, 5, 2, 6], [0, 5, 0, 4], [0, 3, 6, 2], [5, 2, 6, 0]],
    stabRhythm: ['x ~ ~ x ~ ~ x ~'], chordBars: [1, 2],
    arpShapes: [[0, 1, 2, 3, 2, 1], [0, 1, 2, 3]], arpSteps: [16], arpWaves: ['sawtooth', 'square'],
    lead: ['supersaw', 'supersaw', 'saw'],
  },
  dnb: {
    bpm: [172, 178], scales: ['minor', 'dorian'], subLayer: true,
    ghost: { steps: [3, 11], gain: 0.1 },
    kick: 'dnb', kicks: ['Kit_bd:0', 'Kit_bd:1', 'TR909_bd:0'], snares: ['Kit_sd:0', 'Kit_sd:1', 'TR909_sd:3'],
    hats: ['dnb'], hh: ['Kit_hh:0', 'Kit_hh:1', 'TR909_hh:0'], oh: ['TR909_rd:0', 'Kit_oh:2'],
    percs: ['TR909_rd:0', 'cabasa:0', 'cabasa:3', 'Kit_rim:0'],
    breaks: ['K ~ G ~ S ~ G K ~ G K ~ S ~ G ~', 'K ~ K ~ S ~ G S ~ G K ~ S ~ G S', 'K ~ G ~ S ~ ~ G ~ G K ~ S ~ G G'],
    bass: ['reese'], bassRhythm: ['r@6 ~ f', 'r@3 ~ r@4', 'r@8', 'r@4 o@2 r@2'],
    chords: ['pad', 'epiano'], voicings: [[0, 2, 4, 6, 8], [0, 2, 4, 6]],
    progs: [[0, 6, 5, 6], [0, 5, 6, 3], [0, 6, 0, 6], [0, 6, 5, 4]],
    stabRhythm: ['x ~ ~ ~ ~ ~ ~ ~'], chordBars: [1, 2],
    lead: ['none', 'fm', 'soft'],
  },
  breakbeat: {
    bpm: [125, 135], scales: ['minor', 'dorian'],
    ghost: { steps: [7, 9, 15], gain: 0.1 },
    kick: 'funk', kicks: ['Kit_bd:2', 'Kit_bd:3', 'TR808_bd:1'], snares: ['Kit_sd:2', 'Kit_sd:3', 'TR808_sd:1'],
    hats: ['rolling', 'techno16'], hh: ['Kit_hh:1', 'TR606_hh:0'], oh: ['Kit_oh:0', 'TR606_oh:0'],
    percs: ['tambourine:0', 'tambourine:1', 'cabasa:0', 'cabasa:3', 'Kit_rim:1'],
    breaks: ['K ~ G K S ~ G ~ ~ G K ~ S ~ G ~', 'K ~ G ~ S ~ G K ~ K G ~ S ~ G ~', 'K ~ ~ G S ~ G ~ K G ~ K S ~ G ~'],
    bass: ['rumble', 'pulse'], bassRhythm: ['r ~ ~ r ~ ~ ~ ~ ~ ~ r ~ ~ r ~ ~', 'r@3 ~ ~ r@2 ~', 'r ~ ~ ~ ~ ~ r ~ ~ ~ ~ ~ o ~ ~ ~'],
    chords: ['stab', 'none'], voicings: [[0, 2, 4], [0, 2, 4, 6]],
    progs: [[0, 0, 0, 0], [0, 6, 0, 6], [0, 3, 0, 3], [0, 0, 6, 6]],
    stabRhythm: ['~ ~ x ~ ~ x ~ ~', 'x ~ ~ x ~ ~ ~ ~'], chordBars: [1, 2],
    lead: ['none', 'blip', 'fm'],
  },
  lofi: {
    bpm: [75, 94], scales: ['minor', 'dorian'], swing16: [0.25, 0.3, 0.35], crackle: true,
    duck: { roles: ['bass', 'chords'], depth: 0.3, release: 0.7 },
    ghost: { steps: [7, 15], gain: 0.12, sound: 'Kit_rim:0' },
    kick: 'boombap', kicks: ['Kit_bd:4', 'Kit_bd:5', 'TR808_bd:0', 'RD6_bd:3'], snares: ['Kit_sd:4', 'Kit_sd:5', 'Kit_rim:2'],
    hats: ['eighths'], hh: ['Kit_hh:2', 'Kit_hh:3', 'TR606_hh:1'], oh: ['Kit_oh:3', 'Kit_oh:1'], ohatSteps: [2, 10],
    percs: ['cabasa:0', 'cabasa:3', 'tambourine:0', 'tambourine:1', 'Kit_rim:0'],
    bass: ['sub'], bassRhythm: ['r@3 ~ f@2 ~ ~', 'r@4 ~ ~ f ~', 'r@2 ~ r ~ ~ o ~', 'r@3 ~ t@2 f ~', 'r@2 ~ f ~ t ~ o'],
    chords: ['epiano', 'epiano', 'piano'], voicings: [[0, 2, 4, 6], [0, 2, 4, 6, 8]],
    progs: [[0, 6, 5, 6], [0, 5, 6, 0], [0, 3, 0, 3], [1, 4, 0, 0], [0, 2, 5, 6]],
    stabRhythm: ['x ~ ~ x ~ ~ x ~', 'x@3 ~ x@2 ~ ~', 'x ~ ~ ~ x ~ ~ ~'], chordBars: [1],
    melodyDensity: 0.3, lead: ['soft', 'vibes', 'none'],
  },
  synthwave: {
    bpm: [96, 118], scales: ['minor', 'minor', 'phrygian'], snareRoom: 0.6, toms: true,
    duck: { roles: ['bass'], depth: 0.15, release: 0.6 },
    kick: 'four', kicks: ['TR707_bd:0', 'TR707_bd:1', 'Kit_bd:0', 'RD6_bd:1'],
    snares: ['TR707_sd:0', 'TR707_sd:1', 'Kit_sd:0', 'RD6_sd:2'],
    hats: ['eighths', 'techno16'], hh: ['TR707_hh:0', 'Kit_hh:0'], oh: ['TR707_oh:0', 'Kit_oh:2'],
    percs: ['TR707_tb:0', 'TR808_sh:0'],
    bass: ['pulse'], bassRhythm: ['r r r r r r r r', 'r o r o r o r o', 'r r r r r r r r r r r r r r r r'],
    chords: ['pad'], voicings: [[0, 2, 4], [0, 2, 4, 7]],
    progs: [[0, 5, 2, 6], [0, 5, 6, 0], [0, 0, 0, 0], [0, 0, 4, 4], [0, 0, 4, 1]],
    stabRhythm: ['x ~ ~ x ~ ~ x ~'], chordBars: [1, 2],
    arpShapes: [[0, 1, 2, 3], [0, 1, 2, 3, 2, 1]], arpSteps: [16], arpWaves: ['sawtooth', 'square'], arpEverywhere: true,
    lead: ['saw', 'saw', 'supersaw'],
  },
  ambient: {
    bpm: [60, 80], scales: ['dorian', 'minor', 'minor', 'lydian'], noDrums: true,
    kick: 'none', kicks: ['Kit_bd:6'], snares: ['Kit_rim:0'], snareHits: [],
    hats: ['eighths'], hh: ['cabasa:0', 'cabasa:3'], oh: ['Kit_oh:3'],
    percs: ['handchimes', 'marktrees', 'belltree', 'wineglass'],
    bass: ['drone'], bassRhythm: ['r@8', 'r@6 f@2'],
    chords: ['airpad', 'airpad', 'piano'], voicings: [[0, 1, 4], [0, 2, 4, 8], [0, 2, 4, 6], [0, 4, 8]],
    progs: [[0, 0, 0, 0], [0, 0, 2, 0], [0, 0, 5, 0], [0, 1, 0, 1], [0, 3, 0, 3]],
    stabRhythm: ['x ~ ~ ~ ~ ~ ~ ~', 'x ~ ~ ~ x ~ ~ ~'], chordBars: [4, 8],
    arpSounds: ['vibraphone', 'piano'], arpSteps: [8],
    lead: ['bells', 'soft', 'none'],
  },
  // one minor chord as a short stab into long echoes; swung 16th hats; tape hiss underneath
  dubtechno: {
    bpm: [120, 130], scales: ['minor', 'minor', 'dorian'], swing16: [0.1, 0.15, 0.2, 0.2], crackle: true,
    duck: { roles: ['bass', 'chords'], depth: 0.5, release: 0.6 },
    kick: 'four', kicks: ['TR909_bd:3', 'TR909_bd:4', 'TR808_bd:1', 'RD6_bd:0'],
    snares: ['TR909_rim:0', 'TR808_rim:0', 'Kit_rim:0', 'TR909_cp:1'],
    hats: ['techno16', 'house16', 'skip16'], hh: ['TR909_hh:0', 'TR808_hh:1', 'RD6_hh:0'], oh: ['TR909_oh:0', 'TR808_oh:0'],
    percs: ['TR808_sh:0', 'TR909_rim:0', 'cabasa:0', 'cabasa:3'],
    bass: ['dubsub', 'dubsub', 'rumble'],
    bassRhythm: ['~ ~ r ~ ~ ~ r ~ ~ ~ r ~ ~ ~ r ~', '~ ~ r ~ ~ ~ ~ ~ ~ ~ r ~ ~ ~ r ~', 'r ~ ~ ~ ~ ~ r ~ ~ ~ r ~ ~ ~ ~ ~'],
    chords: ['dub'], voicings: [[0, 2, 4, 6], [0, 2, 4, 6, 8], [0, 6], [0, 2, 4]],
    progs: [[0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 2, 2], [0, 0, 4, 0], [0, 0, 5, 5]],
    stabRhythm: ['~ x ~ ~ ~ x ~ ~', '~ ~ x ~ ~ ~ ~ ~', '~ x ~ ~ ~ ~ x ~', '~ ~ ~ x ~ ~ ~ ~'], chordBars: [2, 4],
    lead: ['none', 'none', 'blip'],
  },
};

// ---------- mix trims (measured by tools/mix.html, stored in mixTrim.js) ----------

const withN = (key, n = 0) => (key.includes(':') ? key : `${key}:${n}`);
const sampleTrim = (key) => MIX_TRIM.samples[withN(key)] ?? 1;
const roleTrim = (style, role) => MIX_TRIM.roles[style]?.[role] ?? 1;
const kindTrim = (key) => (key && MIX_TRIM.kinds?.[key]) ?? 1;
// identifies a sound recipe for loudness matching, e.g. `lead:bells:piano`, `chords:pad:supersaw`
const kindKey = (role, kind, recipe) => `${role}:${kind}:${/\.s\("([^"]+)"\)/.exec(recipe)?.[1] ?? '-'}`;
const g = (key, base) => +(base * sampleTrim(key)).toFixed(3);

// which mix role each generated line belongs to
export const ROLE_OF = {
  kick: 'kick', snare: 'snare', roll: 'snare', ghost: 'ghost', hats: 'hats', hats2: 'hats', ohat: 'ohat',
  perc: 'perc', toms: 'toms', brk: 'breaks', bass: 'bass', chords: 'chords', chordsLow: 'chords', chordsSweep: 'chords',
  chordsClose: 'chords', lead: 'lead', leadSoft: 'lead', arp: 'arp', riser: 'riser', crackle: 'crackle',
};

// every one-shot drum/percussion sample the composer can play (for loudness matching)
export function drumSampleKeys() {
  const keys = new Set();
  const span = (name, lo, hi) => { for (let n = lo; n <= hi; n++) keys.add(withN(name, n)); };
  for (const st of Object.values(STYLES)) {
    for (const k of [...st.kicks, ...st.snares, ...st.hh, ...st.oh]) keys.add(withN(k));
    for (const k of st.percs) (k.includes(':') ? keys.add(k) : span(k, 0, 3));
    if (st.ghost?.sound) keys.add(withN(st.ghost.sound));
    if (st.toms) TOMS.forEach((k) => keys.add(k));
  }
  span('kitbreak', 0, 31);
  return [...keys];
}

const ADJ = ['Neon', 'Hollow', 'Electric', 'Midnight', 'Velvet', 'Feral', 'Liquid', 'Static', 'Golden', 'Broken',
  'Infinite', 'Silent', 'Chrome', 'Lunar', 'Fractal', 'Burning', 'Paper', 'Distant', 'Hidden', 'Ultra', 'Glass', 'Analog'];
const NOUN = ['Cathedral', 'Signal', 'Machine', 'Garden', 'Tunnel', 'Horizon', 'Engine', 'Circuit', 'Ritual', 'Mirage',
  'Satellite', 'Pulse', 'Harbor', 'Orbit', 'Lantern', 'Avenue', 'Swarm', 'Echo', 'Spiral', 'Reactor', 'Bloom', 'Archive'];

// ---------- pattern helpers ----------

const bar = (hits, n = 16) => '[' + Array.from({ length: n }, (_, i) => (hits.includes(i) ? 'x' : '~')).join(' ') + ']';
const seqOf = (bars) => `<${bars.join(' ')}>`;
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

function kickBars(r, kind) {
  const four = [0, 4, 8, 12];
  switch (kind) {
    case 'four': { // at most one extra kick at the end of an 8-bar phrase
      const fill = r.pick([four, four, [...four, 14], [...four, 15]]);
      return `<${bar(four)}!7 ${bar(fill)}>`;
    }
    case 'dnb': // two-step: kick on 0 and the "and" of 3
      return seqOf([bar(r.pick([[0, 10], [0, 10], [0, 7, 10]])), bar(r.pick([[0, 10], [0, 6, 10], [0, 10, 13]]))]);
    case 'funk': { // funk-break kicks: syncopated, anticipating the beat
      const a = r.pick([[0, 2, 10, 13], [0, 3, 10], [0, 6, 10, 13], [0, 2, 10]]);
      return `<${bar(a)}!7 ${bar(r.pick([[0, 2, 8, 10], [0, 3, 6, 10, 13]]))}>`;
    }
    default: // boombap
      return seqOf([bar(r.pick([[0, 6, 10], [0, 7, 10], [0, 6, 10, 14]])), bar(r.pick([[0, 3, 10], [0, 6, 10, 11], [0, 10]]))]);
  }
}

function hatsExpr(r, kind, hh) {
  switch (kind) {
    case 'skip16': // 16ths with the downbeat left to the kick, velocity varied
      return `s("${hh}").struct("[~ x x x]*4").gain("[.3 .45 .25]*4").hpf(5000)`;
    case 'techno16':
      return `s("${hh}*16").gain(perlin.range(.22,.5)).hpf(4500).pan(sine.range(.35,.65).slow(4))`;
    case 'rolling':
      return `s("${hh}*16").gain("[.45 .2 .3 .2]*4").hpf(5500).pan(rand.range(.3,.7))`;
    case 'dnb':
      return `s("${hh}*8").gain("[.45 .22 .35 .22]*2").hpf(5000)`;
    case 'house16': // every 16th, offbeats accented, with a little movement
      return `s("${hh}*16").gain("[.22 .3 .45 .3]*4").hpf(5000).pan(sine.range(.4,.6).slow(2))`;
    default: // eighths
      return `s("${hh}*8").gain("[.42 .25]*4").hpf(4000)`;
  }
}

// Chopped break (`kitbreak`: an original 2-bar funk break played on the CC0 acoustic kit
// at 136 BPM, cut into 32 sixteenth slices; see public/samples/SOURCES.md). Slices are
// grouped by what they start with: K kick, S snare, G hats and ghost notes.
const BREAK = {
  K: [0, 9, 10, 16, 18, 25],
  S: [4, 12, 20, 28, 30],
  G: [2, 3, 6, 7, 8, 11, 14, 15, 21, 22, 23, 24, 26, 27, 31],
};
const BREAK_GAIN = { K: 0.42, S: 0.42, G: 0.2 };
// synthwave fill toms, high to low
const TOMS = ['TR707_ht:0', 'TR707_mt:0', 'TR707_lt:0'];

// A template of K/S/G tokens becomes a 2-bar chop. Each song picks a few slices per
// kind; the second bar reshuffles and thins the ghosts so the loop breathes without
// sounding like a fill. Returns the slice and gain patterns plus the slices used.
function breakBars(r, tmpl) {
  const pool = { K: [r.pick(BREAK.K), r.pick(BREAK.K)], S: [r.pick(BREAK.S), r.pick(BREAK.S)], G: Array.from({ length: 4 }, () => r.pick(BREAK.G)) };
  const toks = tmpl.split(' ');
  const make = (thin) => {
    const n = [], gain = [];
    toks.forEach((t, i) => {
      if (t === '~' || (thin && t === 'G' && r.chance(0.3))) { n.push('~'); gain.push('~'); return; }
      n.push(t === 'G' ? r.pick(pool.G) : pool[t][i < 8 ? 0 : 1]);
      gain.push(t === 'G' ? r.range(0.14, BREAK_GAIN.G) : BREAK_GAIN[t]);
    });
    return { n: '[' + n.join(' ') + ']', gain: '[' + gain.join(' ') + ']' };
  };
  const a = make(false), b = make(true);
  return { n: seqOf([a.n, b.n]), gain: seqOf([a.gain, b.gain]), used: [...pool.K, ...pool.S, ...pool.G] };
}

// degree offsets for bass rhythm tokens: r=root, o=octave, f=fifth, t=third.
// A token may carry a mini-notation weight, e.g. `r@4` holds the root for 4 steps.
const TOKEN = { r: 0, o: 7, f: 4, t: 2 };

// TB-303 style line: 16 steps, rests, octave jumps, slides (tied into the next step)
// and accents (returned as a parallel gain pattern).
function acidBar(r, root) {
  const notes = [], accents = [];
  for (let i = 0; i < 16; ) {
    const rest = i > 0 && r.chance(0.25);
    const slide = !rest && i < 15 && r.chance(0.18);
    const w = slide ? 2 : 1;
    const deg = root + r.pick([0, 0, 0, 7, 0, 2, 7, -1]);
    notes.push((rest ? '~' : deg) + (w > 1 ? '@2' : ''));
    accents.push((rest ? '~' : r.chance(0.3) ? 0.4 : 0.25) + (w > 1 ? '@2' : ''));
    i += w;
  }
  return { notes: '[' + notes.join(' ') + ']', accents: '[' + accents.join(' ') + ']' };
}

function bassBars(r, style, prog) {
  const tmpl = r.pick(style.bassRhythm);
  const rootOf = (deg) => (deg >= 4 ? deg - 7 : deg);
  if (tmpl === 'acid') {
    const bars = prog.map((d) => acidBar(r, rootOf(d)));
    return { notes: bars.map((b) => b.notes), accents: bars.map((b) => b.accents) };
  }
  const toks = tmpl.split(' ');
  const notes = prog.map((deg) => {
    const root = rootOf(deg);
    const step = (tok) => {
      const [t, w = ''] = tok.split('@');
      return (t === '~' ? '~' : root + TOKEN[t]) + (w && '@' + w);
    };
    return '[' + toks.map(step).join(' ') + ']';
  });
  return { notes };
}

const voicingOf = (deg, intervals) => '[' + intervals.map((i) => deg + i).join(',') + ']';

function melodyBars(r, prog, density) {
  const tones = (d) => [d, d + 2, d + 4, d + 7, d - 3];
  const nearest = (v, d) => tones(d).reduce((a, b) => (Math.abs(b - v) < Math.abs(a - v) ? b : a));
  const makeBar = (deg) => {
    let cur = deg + r.pick([0, 2, 4]);
    return Array.from({ length: 8 }, (_, i) => {
      if (i > 0 && !r.chance(density)) return '~';
      cur = clamp(cur + r.pick([-2, -1, -1, 0, 1, 1, 2]), -3, 11);
      if (i % 4 === 0) cur = nearest(cur, deg);
      return cur;
    });
  };
  const motif = makeBar(prog[0]);
  const shift = (b, by) => b.map((v) => (v === '~' ? v : clamp(v + by, -3, 11)));
  const bars = [motif, shift(motif, prog[1] - prog[0]), motif, makeBar(prog[3])];
  return bars.map((b) => '[' + b.join(' ') + ']');
}

function arpBars(r, prog, st) {
  const shape = r.pick(st.arpShapes ?? [[0, 1, 2, 3], [3, 2, 1, 0], [0, 1, 2, 3, 2, 1], [0, 2, 1, 3]]);
  const steps = r.pick(st.arpSteps ?? [8, 16]);
  return prog.map((d) => {
    const t = [d, d + 2, d + 4, d + 7];
    return '[' + Array.from({ length: steps }, (_, i) => t[shape[i % shape.length]]).join(' ') + ']';
  });
}

// ---------- sound recipes ----------

function bassSound(r, kind) {
  switch (kind) {
    case 'acid': // resonant 303-style squelch; accents come from a gain pattern
      return `.s("sawtooth").lpf(sine.range(300,2400).slow(${r.pick([8, 16, 32])})).lpq(${r.int(14, 20)}).lpenv(3).lpd(.12).decay(.16).sustain(.15).shape(.35).gain(.25)`;
    case 'pluck':
      return `.s("square").lpf(${r.int(800, 1400)}).decay(.14).sustain(0).gain(.3)`;
    case 'reese': // two detuned saws, filter sweeping during the note
      return `.s("supersaw").lpf(sine.range(200,1800).slow(2)).lpq(5).release(.2).gain(.2)`;
    case 'deep': // house: long, round sub notes
      return `.s("triangle").lpf(380).decay(.6).sustain(.8).release(.15).gain(.42)`;
    case 'sub':
      return `.s("triangle").lpf(700).decay(.35).sustain(.5).gain(.38)`;
    case 'pulse':
      return `.s("sawtooth").lpf(${r.int(900, 1500)}).decay(.1).sustain(0).gain(.28)`;
    case 'drone':
      return `.s("sine").attack(.6).sustain(1).release(2).lpf(500).gain(.32)`;
    case 'dubsub': // dub techno: a short, round sub under the chord
      return `.s("sine").decay(.22).sustain(.3).release(.1).lpf(220).shape(.2).gain(.45)`;
    default: // rumble
      return `.s("sawtooth").lpf(${r.int(250, 400)}).lpq(6).decay(.22).sustain(.25).shape(.2).room(.3).gain(.3)`;
  }
}

function chordSound(r, kind, style, dt) {
  const rhythm = r.pick(style.stabRhythm);
  switch (kind) {
    case 'stab':
      return `.s("${r.pick(['square', 'sawtooth'])}").struct("${rhythm}").decay(.18).sustain(0).lpf(${r.int(1500, 2600)}).room(.5).delay(.25).delaytime(${dt}).gain(.12)`;
    case 'dub': // dub-techno chord: short stab into long echoes
      return `.s("sawtooth").struct("${rhythm}").decay(.15).sustain(0).lpf(${r.int(900, 1600)}).room(.6).delay(.5).delaytime(${dt}).delayfeedback(.65).gain(.12)`;
    case 'organ':
      return `.s("sine").fm(1.5).fmh(2).struct("${rhythm}").decay(.22).sustain(0).room(.3).gain(.2)`;
    case 'piano':
      return `.s("${r.pick(['piano'])}").struct("${rhythm}").release(1).room(.45).gain(.3)`;
    case 'epiano': // Rhodes-like FM piano
      return `.s("fmpiano").struct("${rhythm}").release(.6).room(.35).gain(.3)`;
    case 'airpad': // ambient: slow attack, filter drifting on a very slow LFO, long tails
      return `.s("supersaw").attack(2).release(4).lpf(sine.range(500,2200).slow(16)).room(.9).roomsize(8).delay(.4).delaytime(${(dt * 2).toFixed(3)}).delayfeedback(.7).gain(.11)`;
    default: // pad
      return `.s("supersaw").attack(.4).release(1.2).lpf(${r.int(1100, 1800)}).room(.8).roomsize(5).gain(.1)`;
  }
}

function leadSound(r, kind, dt) {
  switch (kind) {
    case 'blip':
      return `.s("square").lpf(2600).decay(.12).sustain(0).delay(.45).delaytime(${dt}).delayfeedback(.5).jux(rev).gain(.13)`;
    case 'saw':
      return `.s("sawtooth").lpf(2200).decay(.2).sustain(.3).release(.2).room(.4).delay(.3).delaytime(${dt}).gain(.11)`;
    case 'supersaw':
      return `.s("supersaw").hpf(200).lpf(4000).decay(.25).sustain(.4).release(.3).room(.6).delay(.3).delaytime(${dt}).gain(.1)`;
    case 'fm':
      return `.s("sine").fm(${r.int(2, 5)}).fmh(${r.pick([1.5, 2.01, 3])}).decay(.25).sustain(.1).delay(.35).delaytime(${dt}).room(.3).gain(.16)`;
    case 'vibes':
      return `.s("vibraphone").room(.4).gain(.3)`;
    case 'bells':
      return `.s("${r.pick(['vibraphone', 'piano'])}").room(.8).roomsize(6).delay(.4).delaytime(${(dt * 2).toFixed(3)}).delayfeedback(.6).gain(.25)`;
    default: // soft
      return `.s("triangle").decay(.3).sustain(.2).lpf(1800).room(.5).gain(.17)`;
  }
}

// ---------- arrangement ----------

// Every genre has its own form, following docs/GENRES.md and the reference-track analysis
// (analysis/genres). Section names say what a section does, and each genre decides which
// parts play in it (SECTION_LAYERS); a song rolls its section lengths once and reuses them.
//   techno    waves: a part drops out (the kick in "strip") and comes back; no builds or risers
//   house     long grooves, a short break on bass + chords, rarely a short build
//   acid      the 303 starts alone, carries the breaks, and drums come and go around it
//   trance    groove, then a melodic breakdown → build (riser, roll) → drop, twice
//   dnb       drums + pads first, the bass enters at the drop; breakdown, build, second drop
//   breakbeat break grooves without bass trade with full sections
//   synthwave a pop song: verse / chorus / bridge, arps throughout
//   lofi      a sample loop with the beat dropping in and out
//   ambient   one or a few long textures
//   dubtechno the echoing chord from bar 1; the kick drops out ("strip") or only chords + bass remain ("break")
const FORMS = {
  techno: (r) => {
    const main = r.pick([16, 24]);
    const f = [['intro', r.pick([16, 32])], ['groove', 16], ['main', main]];
    const waves = r.pick([2, 2, 3]);
    for (let i = 0; i < waves; i++) {
      f.push([r.pick(['strip', 'strip', 'breakdown']), 8]);
      f.push([i === waves - 1 ? 'main2' : 'main', main]);
    }
    return [...f, ['outro', 16]];
  },
  house: (r) => {
    const main = r.pick([32, 48]);
    const f = [['intro', r.pick([16, 32])], ['groove', 16], ['main', main]];
    // most tracks take an 8-bar break between the peaks; some just roll on through
    if (r.chance(0.7)) f.push(['break', 8]);
    if (r.chance(0.35)) f.push(['build', 4]);
    f.push(['main2', main]);
    if (r.chance(0.5)) f.push(['groove', 8]);
    return [...f, ['outro', 16]];
  },
  acid: (r) => {
    // the 303 never stops: breaks drop the drums ("break") or only the kick ("strip")
    const peaks = r.pick([2, 2, 3]);
    const main = r.pick(peaks > 2 ? [24, 32] : [32, 48]);
    const f = [['intro', r.pick([16, 32])], ['groove', 16], ['main', main]];
    for (let i = 1; i < peaks; i++) f.push([r.pick(['break', 'strip']), r.pick([8, 16])], [i === peaks - 1 ? 'main2' : 'main', main]);
    if (r.chance(0.4)) f.push(['groove', 16]);
    return [...f, ['outro', 16]];
  },
  trance: (r) => {
    const bd = r.pick([16, 32]);
    const f = [['intro', 16], ['groove', 32]];
    if (r.chance(0.6)) f.push(['breakdown', bd]);
    f.push(['build', 8], ['drop', 32]);
    if (r.chance(0.5)) f.push(['groove', 16]);
    return [...f, ['breakdown', bd], ['build', 8], ['drop2', 32], ['outro', 16]];
  },
  dnb: (r) => {
    // the bass coming in or dropping out is the main move; some drops land without a build
    const drop = r.pick([32, 48]);
    const f = [['intro', r.pick([16, 32])], ['groove', r.pick([16, 32])]];
    if (r.chance(0.7)) f.push(['build', 8]);
    f.push(['drop', drop]);
    if (r.chance(0.5)) f.push(['groove', 16], ['drop', 16]);
    f.push([r.pick(['breakdown', 'breakdown', 'groove']), r.pick([16, 32])], ['build', 8], ['drop2', drop]);
    return [...f, [r.pick(['outro', 'outro', 'groove']), 16]];
  },
  breakbeat: (r) => {
    const main = r.pick([24, 32]);
    const f = [['intro', 16], ['groove', 16], ['main', main], ['groove', 8], ['main2', main]];
    if (r.chance(0.7)) f.push([r.pick(['break', 'breakdown']), 8], ['build', 4], ['main2', main]);
    return [...f, ['outro', 16]];
  },
  synthwave: (r) => {
    // a pop song: two or three verse/chorus rounds, maybe a bridge and a closing double chorus
    const rounds = r.pick([2, 2, 3]);
    const chorus = r.pick(rounds > 2 ? [16] : [16, 16, 32]);
    const f = [['intro', r.pick([8, 16])]];
    for (let i = 0; i < rounds; i++) f.push(['verse', r.pick([16, 16, 8])], ['chorus', chorus]);
    if (r.chance(0.7)) f.push(['bridge', r.pick([8, 16])], ['chorus', chorus]);
    if (r.chance(0.3)) f.push(['chorus', chorus]);
    return [...f, ['outro', 8]];
  },
  lofi: (r) => {
    // 2–3 loops of the beat with sample-only dropouts between; some end on the sample alone
    const len = r.pick([16, 16, 8]);
    const f = [['sample', r.pick([4, 8])]];
    const rounds = r.pick([2, 2, 3]);
    for (let i = 0; i < rounds; i++) {
      f.push(['verse', len]);
      if (r.chance(0.7)) f.push(['chorus', len]);
      if (i < rounds - 1) f.push([r.pick(['dropout', 'sample']), r.pick([4, 8])]);
    }
    return [...f, [r.pick(['outro', 'sample']), 8]];
  },
  dubtechno: (r) => {
    const main = r.pick([24, 32]);
    const f = [['intro', r.pick([16, 32])], ['groove', 16], ['main', main]];
    const waves = r.pick([1, 2, 2]);
    for (let i = 0; i < waves; i++) f.push([r.pick(['strip', 'break']), r.pick([8, 16])], [i === waves - 1 ? 'main2' : 'main', main]);
    return [...f, ['outro', 16]];
  },
  ambient: (r) => {
    const f = [['dawn', r.pick([8, 16])]];
    const n = r.int(1, 3);
    for (let i = 0; i < n; i++) f.push([r.pick(['swell', 'drift', 'glow']), r.pick([24, 32])]);
    return [...f, ['fade', r.pick([8, 16])]];
  },
};

// Parts per section. DEFAULT_LAYERS covers every section name; SECTION_LAYERS overrides
// them per genre. Both are built once per song, so their coin flips stay fixed.
const DEFAULT_LAYERS = (r, pc) => ({
  intro: ['kick', 'hats', pc(), 'chordsLow'],
  groove: ['kick', 'hats', r.chance(0.6) && 'ohat', 'bass', 'perc', r.chance(0.4) && 'snare'],
  build: ['kick', 'hats', 'ohat', 'bass', 'chordsSweep', 'riser', r.chance(0.25) && 'roll'],
  drop: ['kick', 'snare', 'hats', 'ohat', 'bass', 'chords', 'lead', pc()],
  drop2: ['kick', 'snare', 'hats2', 'ohat', 'bass', 'chords', 'lead', 'arp', 'perc'],
  main: ['kick', 'snare', 'hats', 'ohat', 'bass', 'chords', pc()],
  main2: ['kick', 'snare', 'hats2', 'ohat', 'bass', 'chords', 'lead', 'perc'],
  strip: ['hats', 'ohat', 'bass', 'chords', pc()],
  break: ['chords', r.chance(0.7) && 'arp', r.chance(0.5) && 'leadSoft', r.chance(0.4) && 'hats'],
  breakdown: ['chords', r.chance(0.6) && 'leadSoft', r.chance(0.5) && 'arp'],
  outro: ['kick', 'hats', 'bass', 'chordsClose', pc()],
  verse: ['kick', 'snare', 'hats', 'bass', 'chords', r.chance(0.4) && 'perc'],
  chorus: ['kick', 'snare', 'hats', 'ohat', 'bass', 'chords', 'lead', r.chance(0.5) && 'arp'],
  bridge: ['chords', 'arp', 'leadSoft', r.chance(0.5) && 'bass'],
  sample: ['chordsLow', r.chance(0.5) && 'leadSoft'],
  dropout: ['chords', 'bass', r.chance(0.5) && 'leadSoft'],
  dawn: ['chordsLow', r.chance(0.5) && 'arp'],
  swell: ['chords', 'bass', r.chance(0.6) && 'leadSoft', r.chance(0.3) && 'perc'],
  drift: ['chords', 'arp', r.chance(0.5) && 'bass'],
  glow: ['chords', 'bass', 'lead', 'arp', r.chance(0.3) && 'perc'],
  fade: ['chordsClose', r.chance(0.5) && 'arp'],
});

const SECTION_LAYERS = {
  // DJ intro on drums; the kick drops out in "strip" while the groove keeps rolling;
  // the breakdown is a filtered chord stab and a noise sweep, not a pad wash
  techno: (r) => ({
    intro: ['kick', 'hats', 'perc'],
    groove: ['kick', 'hats', 'ohat', 'bass', 'perc'],
    main: ['kick', 'snare', 'hats', 'ohat', 'bass', 'chords', 'perc'],
    main2: ['kick', 'snare', 'hats2', 'ohat', 'bass', 'chords', r.chance(0.5) && 'lead', 'perc'],
    breakdown: ['chordsSweep', 'riser', r.chance(0.5) && 'hats'],
    outro: ['kick', 'hats', 'perc'],
  }),
  house: (r) => ({
    intro: ['kick', 'hats', 'perc'],
    groove: ['kick', 'hats', 'ohat', 'bass', 'perc'],
    main: ['kick', 'snare', 'hats', 'ohat', 'bass', 'chords', 'perc'],
    main2: ['kick', 'snare', 'hats2', 'ohat', 'bass', 'chords', 'lead', 'perc'],
    break: ['bass', 'chords', r.chance(0.5) && 'leadSoft'],
    build: ['kick', 'hats', 'chordsSweep', 'riser'],
    outro: ['kick', 'hats', 'perc'],
  }),
  // the 303 (bass part) starts alone and never leaves; drums come and go around it
  acid: (r, pc) => ({
    intro: ['bass'],
    groove: ['kick', 'hats', 'bass'],
    main: ['kick', 'snare', 'hats', 'ohat', 'bass', 'chords', pc()],
    main2: ['kick', 'snare', 'hats2', 'ohat', 'bass', 'chords', 'perc'],
    break: ['bass', 'chords', r.chance(0.4) && 'hats'],
    strip: ['hats', 'ohat', 'bass', 'chords'],
    outro: ['kick', 'hats', 'bass'],
  }),
  // kick + rolling bass groove; the breakdown brings in the melody that the drop then carries
  trance: (r, pc) => ({
    intro: ['kick', 'hats', 'chordsLow'],
    groove: ['kick', 'hats', 'ohat', 'bass', pc()],
    breakdown: ['chords', 'leadSoft', r.chance(0.6) && 'arp'],
    drop: ['kick', 'snare', 'hats', 'ohat', 'bass', 'chords', 'lead', 'arp'],
    outro: ['kick', 'hats', 'bass', 'chordsClose'],
  }),
  // no bass before the first drop; pads all the way through; breakdown keeps the pads
  dnb: (r) => ({
    intro: ['chordsLow', r.chance(0.5) && 'hats'],
    groove: ['kick', 'snare', 'hats', 'chords'],
    build: ['kick', 'hats', 'chordsSweep', 'riser'],
    breakdown: ['chords', r.chance(0.6) && 'leadSoft', r.chance(0.5) && 'arp'],
    outro: ['kick', 'hats', 'chordsClose'],
  }),
  // the break groove runs without bass; the bass entering is what makes a full section
  breakbeat: (r) => ({
    intro: ['kick', 'hats', 'chordsLow'],
    groove: ['kick', 'snare', 'hats', 'perc'],
    main: ['kick', 'snare', 'hats', 'ohat', 'bass', 'chords', r.chance(0.5) && 'lead'],
    main2: ['kick', 'snare', 'hats2', 'ohat', 'bass', 'chords', 'lead', 'perc'],
    break: ['bass', 'chords'],
    build: ['kick', 'hats', 'chordsSweep', 'riser'],
  }),
  // verse on arps + pads, chorus adds the lead, bridge strips the drums
  synthwave: (r) => ({
    intro: ['kick', 'hats', 'bass', 'arp'],
    verse: ['kick', 'snare', 'hats', 'bass', 'chords', 'arp'],
    chorus: ['kick', 'snare', 'hats', 'ohat', 'bass', 'chords', 'lead', 'arp'],
    bridge: ['chords', 'arp', 'leadSoft', r.chance(0.5) && 'bass'],
    outro: ['chordsClose', 'arp', 'leadSoft'],
  }),
  // the chord plays from the first bar, filtered low until the groove; breaks are echoes alone
  dubtechno: (r, pc) => ({
    intro: ['kick', 'hats', 'chordsLow'],
    groove: ['kick', 'hats', 'bass', 'chordsLow', pc()],
    main: ['kick', 'snare', 'hats', 'ohat', 'bass', 'chords', 'perc'],
    main2: ['kick', 'snare', 'hats2', 'ohat', 'bass', 'chordsSweep', r.chance(0.4) && 'lead', 'perc'],
    strip: ['hats', 'bass', 'chordsSweep', pc()],
    break: ['bass', 'chords', r.chance(0.5) && 'hats'],
    outro: ['kick', 'hats', 'chordsClose'],
  }),
};

// which parts play in each section of this song
function sectionLayers(r, style, st, has) {
  const pc = () => r.chance(0.5) && 'perc';
  const table = { ...DEFAULT_LAYERS(r, pc), ...SECTION_LAYERS[style]?.(r, pc) };
  return (name) => {
    const out = table[name].filter(Boolean);
    // genre signatures that ride along with the backbeat
    if (out.includes('snare')) {
      if (st.ghost) out.push('ghost');
      if (st.toms) out.push('toms');
    }
    // breaks genres: the chopped break carries the hats in the grooves and full sections
    if (st.breaks && ['drop', 'drop2', 'main', 'main2', 'groove'].includes(name)) {
      out.push('brk');
      for (const h of ['hats', 'hats2']) if (out.includes(h)) out.splice(out.indexOf(h), 1);
    }
    if (st.arpEverywhere && !out.includes('arp') && !['outro', 'bridge'].includes(name)) out.push('arp');
    if (st.crackle) out.push('crackle');
    const kept = out.filter(has);
    return kept.length ? kept : ['chords', 'bass'].filter(has);
  };
}

// stretch the main sections of very short forms so every song has room to breathe
function padForm(form, minCycles = 48) {
  const total = () => form.reduce((a, [, len]) => a + len, 0);
  const mains = form.filter(([n]) => n.startsWith('drop') || n.startsWith('main') || ['chorus', 'verse', 'swell', 'glow', 'drift'].includes(n));
  for (let i = 0; total() < minCycles; i++) mains[i % mains.length][1] += 8;
  return form;
}

// ---------- song ----------

// `pool` = allowed styles (empty = all). The style roll always consumes exactly one
// random number, so seed + resulting style reproduces the exact same song later.
export function generateSong(seed, start, pool = []) {
  const r = makeRng(seed);
  const allowed = pool.filter((s) => STYLES[s]);
  const choices = allowed.length ? allowed : STYLE_NAMES;
  const styleName = choices[Math.floor(r.f() * choices.length)];
  const st = STYLES[styleName];
  const bpm = r.int(st.bpm[0], st.bpm[1]);
  const root = r.pick(ROOTS);
  const scale = r.pick(st.scales);
  const beat = 60 / bpm;
  const dt = +(beat * r.pick([0.75, 0.5, 0.375])).toFixed(3);
  const chordBars = r.pick(st.chordBars);
  const voicing = r.pick(st.voicings);
  const baseProg = r.pick(st.progs); // 4 chords
  const prog = baseProg.flatMap((d) => Array(chordBars).fill(d)); // one entry per bar
  const sc = (oct) => `"${root}${oct}:${scale}"`;

  const sounds = {
    kick: r.pick(st.kicks), snare: r.pick(st.snares), hh: r.pick(st.hh), oh: r.pick(st.oh),
    perc: withN(r.pick(st.percs), r.int(0, 3)),
  };
  const chordKind = r.pick(st.chords);
  const leadKind = r.pick(st.lead);

  const notes = (pat) => `n("${pat}")`;
  const chordsBase = `${notes(seqOf(prog.map((d) => voicingOf(d, voicing))))}.scale(${sc(3)})`;
  const chordSnd = chordKind === 'none' ? null : chordSound(r, chordKind, st, dt);
  const chordsLine = chordSnd && chordsBase + chordSnd;
  const bassPat = bassBars(r, st, prog);
  const melody = melodyBars(r, baseProg, st.melodyDensity ?? r.range(0.5, 0.8));
  const leadSnd = leadKind === 'none' ? null : leadSound(r, leadKind, dt);
  const leadLine = leadSnd && `${notes(seqOf(melody.flatMap((b) => Array(chordBars).fill(b))))}.scale(${sc(4)})${leadSnd}`;
  const arpBase = `${notes(seqOf(arpBars(r, prog, st)))}.scale(${sc(4)})`;
  const arpSnd = st.arpSounds
    ? `.s("${r.pick(st.arpSounds)}").room(.5).delay(.3).delaytime(${dt}).pan(sine.slow(4)).gain(.2)`
    : `.s("${r.pick(st.arpWaves ?? ['square', 'triangle', 'sawtooth'])}").decay(.12).sustain(0).lpf(sine.range(800,3500).slow(8)).delay(.3).delaytime(${dt}).pan(sine.fast(2)).gain(.1)`;
  const arpLine = arpBase + arpSnd;
  const bassKind = r.pick(st.bass);
  const bassSnd = bassSound(r, bassKind);
  const hats2Kind = r.pick(st.hats);
  // groove swing: 16th swing for house, 8th swing for lofi; drums share one feel
  // swingBy(x, 8) delays every off-16th by x of a 16th (house 0–20%, lofi 25–35% measured)
  const swing16 = st.swing16 ? r.pick(st.swing16) : 0;
  const swing = swing16 ? `.swingBy(${swing16}, 8)` : '';
  // sidechain: each kick ducks the parts on orbit 2 (depth and recovery from the analysis)
  const duckRelease = st.duck && +(beat * st.duck.release).toFixed(3);
  const brk = st.breaks && breakBars(r, r.pick(st.breaks));

  const lines = {
    kick: () => `s("${sounds.kick}").struct("${kickBars(r, st.kick)}").gain(.55)${swing}`
      + (st.duck ? `.duckorbit(2).duckdepth(${st.duck.depth}).duckattack(${duckRelease})` : ''),
    snare: () => {
      const main = st.snareHits ?? [4, 12];
      // at most one pickup hit closing an 8-bar phrase
      const fill = [...main, ...r.pick([[], [], [15], [14]])];
      return `s("${sounds.snare}").struct("<${bar(main)}!7 ${bar(fill)}>").gain(.38).room(${st.snareRoom ?? 0.2})`;
    },
    ghost: () => `s("${st.ghost.sound ?? sounds.snare}").struct("${bar(st.ghost.steps)}").gain(${st.ghost.gain})${swing}`,
    hats: () => hatsExpr(r, r.pick(st.hats), sounds.hh) + swing,
    hats2: () => hatsExpr(r, hats2Kind, sounds.hh) + swing,
    // dnb/breakbeat: chopped break; each slice cuts off the one before, like a sampler voice
    brk: () => brk && `n("${brk.n}").s("kitbreak").gain("${brk.gain}").cut(1).hpf(40)`,
    ohat: () => `s("${sounds.oh}").struct("${st.ohatSteps ? bar(st.ohatSteps) : '~ x ~ x ~ x ~ x'}").gain(.18).hpf(3500)${swing}`,
    perc: () => `s("${sounds.perc}").struct("x(${r.int(3, 6)},16,${r.int(0, 5)})").pan(rand).gain(.22).room(.2)${swing}`,
    bass: () => {
      const accents = bassPat.accents ? `.gain("${seqOf(bassPat.accents)}")` : '';
      const main = `${notes(seqOf(bassPat.notes))}.scale(${sc(2)})${bassSnd}${accents}`;
      if (!st.subLayer) return main;
      // clean sine sub on the chord roots under the mid-range bass
      const subNotes = seqOf(prog.map((d) => (d >= 4 ? d - 7 : d)));
      return `stack(${main}, ${notes(subNotes)}.scale(${sc(1)}).s("sine").sustain(1).lpf(120).gain(.42))`;
    },
    chords: () => chordsLine,
    chordsLow: (len) => chordsLine && `${chordsLine}.lpf(saw.range(300,1400).slow(${len}))`,
    chordsSweep: (len) => chordsLine && `${chordsLine}.lpf(saw.range(400,3500).slow(${len}))`,
    chordsClose: (len) => chordsLine && `${chordsLine}.lpf(isaw.range(200,1600).slow(${len}))`,
    lead: () => leadLine,
    leadSoft: () => leadLine && `${leadLine}.lpf(1200).room(.7)`,
    arp: () => arpLine,
    riser: (len) => `s("white*16").decay(.08).sustain(0).gain(saw.range(.02,.22).slow(${len})).hpf(saw.range(400,9000).slow(${len}))`,
    // short, quiet pickup into the drop (only some songs' builds have it)
    roll: (len) => `s("${sounds.snare}").struct("<~!${len - 1} [~ ~ ~ ~ ~ ~ ~ ~ ~ ~ x ~ x ~ x x]>").gain("[.12 .16 .2 .24]")`,
    // synthwave: three descending gated toms closing every 16-bar phrase
    toms: () => {
      const [h, m, l] = TOMS;
      return `s("<~!15 [~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ${h} ~ ${m} ~ ${l} ~]>").gain("<~!15 [~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ${g(h, 0.28)} ~ ${g(m, 0.28)} ~ ${g(l, 0.28)} ~]>").room(.5)`;
    },
    // lofi: vinyl crackle under everything
    crackle: () => `s("crackle").density(.04).sustain(1).hpf(1200).gain(.6)`,
  };
  // freeze per-song choices so every section uses the same parts
  for (const k of ['kick', 'snare', 'hats', 'hats2', 'perc', 'bass']) {
    const v = lines[k]();
    lines[k] = () => v;
  }

  const has = (k) => {
    if (k.startsWith('chords')) return !!chordsLine;
    if (k.startsWith('lead')) return !!leadLine;
    if (st.noDrums && ['kick', 'snare', 'hats', 'hats2', 'ohat', 'ghost', 'roll'].includes(k)) return false;
    if (k === 'kick' && st.kick === 'none') return false;
    if (k === 'snare' && st.snareHits?.length === 0) return false;
    return true;
  };

  // Mix trims, applied after each voice's effects: the part's level for this style,
  // the one-shot's loudness normalisation (single-sample drum lines), and the style's
  // overall loudness.
  const lineSample = {
    kick: sounds.kick, snare: sounds.snare, roll: sounds.snare, ghost: st.ghost?.sound ?? sounds.snare,
    hats: sounds.hh, hats2: sounds.hh, ohat: sounds.oh, perc: sounds.perc,
  };
  const chordsKind = chordSnd && kindKey('chords', chordKind, chordSnd);
  const lineKind = {
    chords: chordsKind, chordsLow: chordsKind, chordsSweep: chordsKind, chordsClose: chordsKind,
    lead: leadSnd && kindKey('lead', leadKind, leadSnd), leadSoft: leadSnd && kindKey('lead', leadKind, leadSnd),
    arp: kindKey('arp', st.arpSounds ? 'sample' : 'synth', arpSnd),
    bass: kindKey('bass', bassKind + (st.subLayer ? '+sub' : ''), bassSnd),
  };
  const trimFor = (k) => {
    const v = roleTrim(styleName, ROLE_OF[k]) * roleTrim(styleName, '_mix') * kindTrim(lineKind[k])
      * (lineSample[k] ? sampleTrim(lineSample[k]) : 1);
    return Math.abs(v - 1) < 0.005 ? '' : `.postgain(${v.toFixed(3)})`;
  };
  const sections = [];
  const blocks = [];
  let t = start;
  const form = padForm(FORMS[styleName](r));
  // a section kind keeps the same layers every time it comes back
  const layersOf = sectionLayers(r, styleName, st, has);
  for (const [name, len] of form) {
    const layers = layersOf(name);
    const parts = layers
      .map((k) => [k, lines[k](len)])
      .filter(([, expr]) => expr)
      .map(([k, expr]) => ({ role: ROLE_OF[k], kind: lineKind[k], code: `$: ${expr}${trimFor(k)}${st.duck?.roles.includes(ROLE_OF[k]) ? '.orbit(2)' : ''}\n  .sect(${t}, ${len})` }));
    const code = parts.map((p) => p.code).join('\n');
    sections.push({ name, start: t, len, layers, parts });
    blocks.push({ name, start: t, len, code: `// ── ${name.toUpperCase()} · cycles ${t}–${t + len} ──\n${code}` });
    t += len;
  }

  const title = `${r.pick(ADJ)} ${r.pick(NOUN)}`;
  const cps = +(bpm / 240).toFixed(5);
  const header =
    `// "${title}" · ${styleName} · ${bpm} BPM · ${root} ${scale} · seed ${seed.toString(36)}\n` +
    `$: note(0).s("sine").gain(0).cps(${cps})\n  .sect(${start}, ${t - start})`;

  // every sample name the code actually plays, for preloading
  const SYNTHS = new Set(['sine', 'square', 'triangle', 'sawtooth', 'supersaw', 'white', 'crackle']);
  const code = header + '\n\n' + blocks.map((b) => b.code).join('\n\n');
  const used = new Set(brk && code.includes('"kitbreak"') ? brk.used.map((n) => `kitbreak:${n}`) : []);
  for (const [, pat] of code.matchAll(/\bs\("([^"]+)"\)/g)) {
    for (const tok of pat.split(/[\s*<>[\],!@]+/)) {
      const name = tok.replace(/\*\d+$/, '');
      if (/^[A-Za-z]/.test(name) && !SYNTHS.has(name.split(':')[0])) used.add(name);
    }
  }
  return {
    seed, id: seed.toString(36), title, style: styleName, bpm, cps, root, scale,
    start, end: t, sections, header, blocks,
    code,
    samples: [...used],
  };
}
