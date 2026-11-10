// Orb presets outside the orb page: the wire format the preset server stores, and turning a
// preset back into Strudel code (the main player plays user presets with this).
// A preset only ever names catalogue orbs, drawings (64 digits), custom orbs (a catalogue orb and
// knob values, src/orbEdit.js) and a variation number; the code is always rebuilt here from the
// catalogue, so nothing a server sends is ever run as code.
import {
  BASE_BPM, DRUM_CATS, byId, hash, keyLabel, keyTail, rng, role, setMode, vocalFiles,
} from './orbCatalog.js';
import { checkCustom, editChain, editGain, editOf, kindOf, registerCustom, rootId } from './orbEdit.js';

// ---------- drawings (shared with the orb page's piano roll) ----------

export const BARS = 4, STEPS = BARS * 16, ROWS = 15;
// Full scale (the roll's 풀 스케일): rows are semitones instead of scale degrees, 4 octaves
// from an octave under the voice's root. Such a note is kept as SEMI + its semitone (0–47), so a
// drawing tells by its own notes which kind it is; it plays exactly as placed (no snapping to the
// harmony, notes outside the key stay outside).
export const SEMI = 100, SEMIS = 48;
export const isSemi = (d) => d >= SEMI;
export const fullScaleRaw = (raw) => raw.some((x) => notesAt(x).some(isSemi));
const MINOR = [0, 2, 3, 5, 7, 8, 10];
const PC = { c: 0, d: 2, e: 4, f: 5, g: 7, a: 9, b: 11 };
const midiOf = (name) => {
  const m = /^([a-g])(#|b)?(-?\d)$/i.exec(String(name));
  return m ? 12 * (+m[3] + 1) + PC[m[1].toLowerCase()] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0) : 57;
};

// A step holds null (no note), one row, or a sorted array of rows (a chord). Single notes stay
// plain numbers so drawings saved before chords existed load unchanged.
export const notesAt = (x) => (x === null || x === undefined ? [] : Array.isArray(x) ? x : [x]);
export const stepOf = (ds) => {
  const u = [...new Set(ds)].sort((a, b) => a - b);
  return !u.length ? null : u.length === 1 ? u[0] : u;
};
const same = (a, b) => a.length === b.length && a.every((x, i) => x === b[i]);

// a drawing as text, one entry per sixteenth: '.' = no note, a row in base 36, or a chord as
// its rows in parentheses ("(047)"). A full-scale note is two characters: its octave (A–D) and
// its semitone in base 12 ("B9"). A drawing without chords or full-scale notes is exactly 64 chars.
const OCT = 'ABCD';
const packOne = (d) => (isSemi(d) ? OCT[Math.floor((d - SEMI) / 12)] + ((d - SEMI) % 12).toString(12) : d.toString(36));
export const packRaw = (raw) => raw.map((x) => {
  const ds = notesAt(x);
  return !ds.length ? '.' : ds.length === 1 ? packOne(ds[0]) : `(${ds.map(packOne).join('')})`;
}).join('');
export const unpackRaw = (str) => {
  const t = String(str);
  // the note at i: [value, characters used]
  const one = (i) => {
    const o = OCT.indexOf(t[i]);
    if (o >= 0) return [SEMI + o * 12 + Math.min(11, parseInt(t[i + 1], 12) || 0), 2];
    return [Math.min(ROWS - 1, parseInt(t[i], 36) || 0), 1];
  };
  const out = [];
  for (let i = 0; i < t.length && out.length < STEPS;) {
    if (t[i] === '(') {
      const j = t.indexOf(')', i);
      if (j < 0) break;
      const ds = [];
      for (let k = i + 1; k < j;) {
        const [d, n] = one(k);
        ds.push(d);
        k += n;
      }
      out.push(stepOf(ds));
      i = j + 1;
    } else if (t[i] === '.') {
      out.push(null);
      i++;
    } else {
      const [d, n] = one(i);
      out.push(d);
      i += n;
    }
  }
  while (out.length < STEPS) out.push(null);
  return out;
};

// A drawing as it plays: every sixteenth exactly as placed (no averaging, no snapping to the
// harmony; several rows in a step play together as a chord). Melodic parts tie a pitch (or
// chord) that repeats on the next sixteenth into one long note, starting afresh on each bar;
// drums hit on every sixteenth that has a note.
// Each sixteenth comes out as { ds: [rows], start } or null.
export function quantize(raw, v) {
  const out = Array(STEPS).fill(null);
  let prev = null;
  for (let i = 0; i < STEPS; i++) {
    const ds = notesAt(raw[i]);
    if (!ds.length) {
      prev = null;
      continue;
    }
    out[i] = { ds, start: !(v.root && prev && same(prev, ds) && i % 16 !== 0) };
    prev = ds;
  }
  return out;
}

export function sheetCode(raw, v) {
  const q = quantize(raw, v);
  // a full-scale drawing plays MIDI notes (a stray scale row is read in minor)
  const semi = !!v.root && fullScaleRaw(raw), base = semi ? midiOf(v.root) - 12 : 0;
  const one = (d) => (semi ? base + (isSemi(d) ? d - SEMI : 12 + Math.floor(d / 7) * 12 + MINOR[d % 7]) : v.map ? v.map(d) : d);
  const tok = q.map((n) => (!n ? '~' : n.start ? (n.ds.length === 1 ? one(n.ds[0]) : `[${n.ds.map(one).join(',')}]`) : v.legato ? '_' : '~'));
  const pat = `"<${[0, 1, 2, 3].map((b) => `[${tok.slice(b * 16, b * 16 + 16).join(' ')}]`).join(' ')}>"`;
  if (semi) return `note(${pat})${v.sound}`;
  return v.root ? `n(${pat}).scale("${v.root}:minor")${v.sound}` : `${v.ctrl}(${pat})${v.sound}`;
}

// ---------- variations (the orb page's 변주 slot) ----------
// Per orb, its numbered variations and the one it plays. On the page: { list: [{ seed } |
// { raw }], vi } (seed null = the shared variation). On the wire: { l: [entry], i }, an entry a
// seed (0 or more), -1 (the shared variation) or a drawing (packed, see packRaw).
export const VAR_MAX = 16;
export const varsToWire = (v) => ({ l: v.list.map((x) => (x.raw ? packRaw(x.raw) : x.seed ?? -1)), i: v.vi });
export function varsFromWire(w) {
  if (!w || typeof w !== 'object' || !Array.isArray(w.l) || !w.l.length) return null;
  const list = w.l.slice(0, VAR_MAX).map((e) => (typeof e === 'string' ? { raw: unpackRaw(e) } : { seed: Number.isSafeInteger(e) && e >= 0 ? e : null }));
  const vi = Number.isSafeInteger(w.i) && w.i >= 0 && w.i < list.length ? w.i : 0;
  return { list, vi };
}
// a preset's `vars` (wire) for its own layers, as the page keeps them, or null
export function cleanVars(x, layers) {
  if (!x || typeof x !== 'object' || Array.isArray(x)) return null;
  const out = Object.fromEntries(Object.entries(x).filter(([k]) => layers.includes(k) && known(k)).map(([k, w]) => [k, varsFromWire(w)]).filter(([, v]) => v));
  return Object.keys(out).length ? out : null;
}

// ---------- wire format ----------
// What the server stores and returns for one preset (see docs/PRESET_API.md):
//   { id, name, author?, description?, kind: 'orb' | 'stem', createdAt?,
//     layers: [orb id | drawing id], drawn: [{ id, src, raw }], variation, seeds?, gains?, song? }
// `seeds` ({ orb id: seed }) names orbs that play their own variation instead of `variation`.
// `gains` ({ orb id: percent }) names orbs turned down / up in the orb page's volume slots
// (whole percents, GAIN_MIN–GAIN_MAX; 100 is left out).
// `raw` travels packed (64 steps, see packRaw). A stem preset also carries the full-song grid (`song`, below).
// Anything unknown is dropped, so presets made with an older or newer catalogue still load with
// the orbs this page knows.

const known = (id) => typeof id === 'string' && Object.hasOwn(byId, id);

// the orbs' own volumes, as whole percents: only orbs of the set, only sensible values, or null
export const GAIN_MIN = 5, GAIN_MAX = 400;
export function cleanGains(g, layers) {
  if (!g || typeof g !== 'object' || Array.isArray(g)) return null;
  const out = Object.fromEntries(Object.entries(g).filter(([k, v]) => layers.includes(k) && Number.isSafeInteger(v) && v >= GAIN_MIN && v <= GAIN_MAX && v !== 100));
  return Object.keys(out).length ? out : null;
}

// ---------- effect strength (mood orbs in the 약하게 / 세게 slots) ----------
// A mood orb has no sound of its own, so its "volume" steps (-3 … +3, stored like any orb's as a
// percent in `gains`: 80% per step down, 120% per step up) scale how hard its effects bite.
// Each effect is pulled toward "off" (weaker) or pushed past where it was (stronger).
const VOL_STEPS = 3;
export const pctStep = (pct) => {
  const g = (pct ?? 100) / 100;
  if (!(g > 0) || Math.abs(g - 1) < 0.005) return 0;
  return Math.max(-VOL_STEPS, Math.min(VOL_STEPS, Math.round(g < 1 ? Math.log(g) / Math.log(0.8) * -1 : Math.log(g) / Math.log(1.2))));
};
const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));
const num = (x) => String(+x.toFixed(3));
// per effect: (value, strength) -> value; strength 1 leaves it as it is
const FX_SCALE = {
  lpf: (x, s) => clamp(20000 * (x / 20000) ** s, 80, 20000), // cutoff: weaker opens up toward 20 kHz
  hpf: (x, s) => clamp(20 * (x / 20) ** s, 20, 9000),
  crush: (x, s) => clamp(16 - (16 - x) * s, 3, 16), // bits: 16 is clean
  coarse: (x, s) => Math.max(1, Math.round(1 + (x - 1) * s)),
  room: (x, s) => clamp(x * s, 0, 1),
  roomsize: (x, s) => clamp(x * Math.sqrt(s), 0.5, 10),
  delay: (x, s) => clamp(x * s, 0, 0.95),
  delayfeedback: (x, s) => clamp(x * s, 0, 0.85),
  shape: (x, s) => clamp(x * s, 0, 0.9),
  degradeBy: (x, s) => clamp(x * s, 0, 0.9),
  // filter resonance (EQ orbs): the boost at the cutoff, in dB
  lpq: (x, s) => clamp(x * s, 0, 18),
  hpq: (x, s) => clamp(x * s, 0, 18),
  bpq: (x, s) => clamp(x * s, 0.1, 10),
};
const NUM = /^-?\d*\.?\d+$/;
// the strength a step stands for: three steps down nearly switch the effect off
export const fxStrength = (step) => (step < 0 ? 0.6 ** -step : 1.25 ** step);
// whether the strength slots change anything (a mood that only speaks a vowel does not; one that
// turns parts down does: its strength is how far)
const fxScalableCode = (fx) => !!fx && (scaleFx(fx, -1) !== fx || scaleFx(fx, 1) !== fx);
export const fxScalable = (l) => !!l && (!!l.moodFx || !!l.duck?.length || fxScalableCode(l.fx));
// `fx` (a mood's effect chain, e.g. `.lpf(650).room(.5)`) at `step`
export function scaleFx(fx, step) {
  if (!fx || !step) return fx ?? '';
  const s = fxStrength(step);
  let out = '';
  for (let i = 0; i < fx.length;) {
    const m = /^\.(\w+)\(/.exec(fx.slice(i));
    if (!m) {
      out += fx[i++];
      continue;
    }
    // the call's arguments, up to the matching bracket
    let depth = 1, j = i + m[0].length;
    for (; j < fx.length && depth; j++) depth += fx[j] === '(' ? 1 : fx[j] === ')' ? -1 : 0;
    const name = m[1], arg = fx.slice(i + m[0].length, j - 1), f = FX_SCALE[name];
    let next = arg;
    if (f && NUM.test(arg.trim())) next = num(f(+arg, s));
    // a moving value (sine.range(300,3000) …): both ends of the range
    else if (f) next = arg.replace(/range\(\s*([\d.]+)\s*,\s*([\d.]+)\s*\)/, (_, a, b) => `range(${num(f(+a, s))},${num(f(+b, s))})`);
    // auto-pan: a narrower swing when weaker
    else if (name === 'pan' && s < 1 && !/range\(/.test(arg)) next = `${arg}.range(${num(0.5 - 0.5 * s)},${num(0.5 + 0.5 * s)})`;
    out += `.${name}(${next})`;
    i = j;
  }
  return out;
}

// ---------- EQ orbs ----------
// Strudel gives every sound one low-pass, one high-pass and one band-pass, so an EQ orb works
// with those: a resonant high-pass just under the bass lifts the lows (the resonance, in dB, is the
// boost), a resonant low-pass up top lifts the highs, a plain one cuts. A later filter of the same
// kind replaces an earlier one, so an EQ orb leaves alone the filter a part already sets itself
// (hats keep their high-pass, a dark pad its low-pass) and only touches the parts that have none.
const FILTER_GROUPS = [
  { calls: /^(lpf|lp|cutoff|ctf|lpq|resonance)$/, used: /\.(lpf|lp|cutoff|ctf|djf)\(/ },
  { calls: /^(hpf|hp|hcutoff|hpq|hresonance)$/, used: /\.(hpf|hp|hcutoff|djf)\(/ },
  { calls: /^(bpf|bp|bandf|bpq|bandq)$/, used: /\.(bpf|bp|bandf)\(/ },
];
// `fx` (an EQ orb's chain) without the filters `code` already sets
export function eqFx(fx, code) {
  if (!fx) return '';
  const taken = FILTER_GROUPS.filter((g) => g.used.test(code));
  if (!taken.length) return fx;
  return fx.replace(/\.(\w+)\(([^()]*)\)/g, (call, name) => (taken.some((g) => g.calls.test(name)) ? '' : call));
}
// An EQ orb at a strength: a boost (a filter with its resonance) keeps its frequency and only
// its boost grows or shrinks; a plain cut moves its cutoff like a mood's filter does.
const Q_OF = { lpf: 'lpq', hpf: 'hpq', bpf: 'bpq' };
function scaleEq(fx, step) {
  if (!step) return fx;
  return fx.replace(/\.(\w+)\(([^()]*)\)/g, (call, name) => (Q_OF[name] && fx.includes(`.${Q_OF[name]}(`) ? call : scaleFx(call, step)));
}
// What the whole-song orbs add to one part's line: the EQ orbs (in the order they went in),
// then the moods on top, each at the strength its 약하게 / 세게 steps gave it.
// `orbs`: the song's EQ and mood orbs; `stepOf(orb)`: its strength step.
// A sound has one filter of each kind, so of several EQ orbs on the same kind (two low boosts …)
// only the last one put in is heard: the earlier ones are left out of the code.
const CALL = /\.(\w+)\(([^()]*)\)/g;
const groupOf = (name) => FILTER_GROUPS.findIndex((g) => g.calls.test(name));
// the filter kinds an EQ orb uses (0 low-pass / top, 1 high-pass / bottom, 2 band-pass / middle)
const eqGroups = (fx) => new Set([...(fx ?? '').matchAll(CALL)].map((m) => groupOf(m[1])).filter((g) => g >= 0));
// two EQ orbs on the same range can't both be heard: the orb page bounces the older one out
export const eqClash = (a, b) => !!(a?.eq && b?.eq && a !== b) && [...eqGroups(a.fx)].some((g) => eqGroups(b.fx).has(g));
export function songFx(orbs, code, stepOf) {
  const eqs = orbs.filter((o) => o.eq).map((o) => scaleEq(eqFx(o.fx, code), stepOf(o)));
  const owner = new Map(); // filter group -> index of the last EQ that sets it
  eqs.forEach((fx, i) => [...fx.matchAll(CALL)].forEach((m) => owner.set(groupOf(m[1]), i)));
  const eq = eqs.map((fx, i) => fx.replace(CALL, (call, name) => (owner.get(groupOf(name)) === i ? call : ''))).join('');
  // a custom mood (🎛 편집) makes its own calls at its strength
  const mood = orbs.filter((o) => !o.eq).map((o) => (o.moodFx ? o.moodFx(stepOf(o)) : scaleFx(o.fx, stepOf(o)))).join('');
  return eq + mood;
}
// The custom moods' graphic EQs, added up (dB per band): what the master bus plays the song
// through (src/graphicEq.js). null when none has one.
export function masterEq(orbs, stepOf) {
  let out = null;
  for (const o of orbs) {
    const q = o.graphicEq?.(stepOf(o));
    if (!q) continue;
    out ??= q.map(() => 0);
    q.forEach((db, i) => (out[i] += db));
  }
  return out && out.map((db) => Math.max(-24, Math.min(24, db)));
}
// A balance mood (`duck`: the roles it names) turns those parts down instead of muting them:
// to DUCK of their volume, less far when weaker and further when stronger. Several multiply,
// down to DUCK_MIN, so a part is always still there.
export const DUCK = 0.25;
const DUCK_MIN = 0.05;
export function duckOf(orbs, r, stepOf) {
  const f = orbs.filter((o) => o.duck?.includes(r)).reduce((g, o) => g * DUCK ** fxStrength(stepOf(o)), 1);
  return Math.max(DUCK_MIN, f);
}

const CURVE_RE = /^[qes]$/;
// (one line: a name goes into the song's code as a // comment, so it must never hold a line break)
const clip = (s, n) => (typeof s === 'string' ? s.replace(/[\u0000-\u001f\u007f-\u009f\u2028\u2029]+/g, ' ').trim().slice(0, n) : '');
const BLOCK = 4; // bars per stem cell

// The stem grid (the orb page's full song) as data: its sections, and per instrument row one
// entry per 4-bar block: null = silent, -1 = playing (orb without a seed), n = playing with seed n.
// `fills` (optional) lists the blocks whose last bar plays as a ★ fill; `vi` (optional) names
// each block's variation (the orb's `vars`, 0 = 01), the seed in `cells` being that variation's.
// `g0` / `g1` / `cv` (optional): each block's strength at its start and end in percent (0–150;
// g1 -1 = the same as the start) and the curve between them ('' / l linear, q quadratic,
// e eased, s S-curve).
//   { sections: [{ name, len, shift, v }], rows: [{ id, alt, cells: [...], fills?: [blockIndex], vi?: [k] }] }
// cellSeed(id, cell): the seed a block plays (null: none)
export function songToWire(song, cellSeed = (id, c) => c.v) {
  return {
    sections: song.sections.map(({ name, len, shift, v }) => ({ name, len, shift: shift ?? 0, v: v ?? 0 })),
    rows: song.rows.filter((r) => song.cells[r.id]).map((r) => {
      const flat = song.cells[r.id].flat();
      const fills = flat.flatMap((c, i) => (c.on && c.fill ? [i] : []));
      const vi = flat.map((c) => c.k ?? 0), g0 = flat.map((c) => c.g0 ?? 100), g1 = flat.map((c) => c.g1 ?? -1), cv = flat.map((c) => c.cv ?? '');
      return {
        id: r.id, alt: !!r.alt, cells: flat.map((c) => (!c.on ? null : cellSeed(r.id, c) ?? -1)),
        ...(fills.length && { fills }), ...(vi.some(Boolean) && { vi }), ...(g0.some((g) => g !== 100) && { g0 }), ...(g1.some((g) => g >= 0) && { g1 }), ...(cv.some(Boolean) && { cv }),
      };
    }),
  };
}

// wire grid -> { sections, rows, cells } as the orb page keeps it, or null if it doesn't add up.
// `rename` maps a row id to the id it has on this page (drawings get fresh ids when loaded);
// rows naming an orb this catalogue doesn't have are dropped.
export function songFromWire(w, rename = (id) => id) {
  if (!w || !Array.isArray(w.sections) || !Array.isArray(w.rows)) return null;
  const int = (x, lo, hi, d) => (Number.isSafeInteger(x) && x >= lo && x <= hi ? x : d);
  const sections = w.sections.slice(0, 12).map((x) => ({
    name: clip(x?.name, 12) || '섹션', len: int(x?.len, 1, 64, 0), shift: int(x?.shift, -11, 11, 0), v: int(x?.v, 0, 100, 0),
  }));
  if (!sections.length || sections.some((x) => !x.len)) return null;
  // a section is any number of bars: one block per started 4
  const total = sections.reduce((n, x) => n + Math.ceil(x.len / BLOCK), 0);
  const rows = [], cells = {};
  for (const r of w.rows.slice(0, 40)) {
    const id = typeof r?.id === 'string' ? rename(r.id) : null;
    if (!id || !known(id) || cells[id] || !Array.isArray(r.cells) || r.cells.length !== total) continue;
    let k = 0;
    const fills = new Set(Array.isArray(r.fills) ? r.fills : []);
    const vi = Array.isArray(r.vi) && r.vi.length === total ? r.vi : null;
    const arr = (a) => (Array.isArray(a) && a.length === total ? a : null);
    const g0 = arr(r.g0), g1 = arr(r.g1), cv = arr(r.cv);
    const pct = (x) => Number.isSafeInteger(x) && x >= 0 && x <= 150;
    cells[id] = sections.map((sec) => Array.from({ length: Math.ceil(sec.len / BLOCK) }, () => {
      const fill = fills.has(k), kk = vi?.[k], a = g0?.[k], b = g1?.[k], f = cv?.[k], c = r.cells[k++];
      const cell = Number.isSafeInteger(c) && c >= 0 ? { on: true, v: c } : { on: c === -1, v: c === -1 || c === null ? null : 0 };
      return {
        ...cell, fill: cell.on && fill, ...(Number.isSafeInteger(kk) && kk >= 0 && kk < VAR_MAX ? { k: kk } : {}),
        ...(pct(a) && a !== 100 ? { g0: a } : {}), ...(pct(b) ? { g1: b } : {}), ...(typeof f === 'string' && CURVE_RE.test(f) ? { cv: f } : {}),
      };
    }));
    rows.push({ id, alt: r.alt === true });
  }
  return rows.length ? { sections, rows, cells } : null;
}

// a local preset (orb page) + what the share dialog asks -> request body for POST /presets
export function toWire(p, extra = {}) {
  const stem = extra.kind === 'stem' && p.song;
  return {
    name: p.name,
    author: extra.author ?? p.author ?? '',
    description: extra.description ?? p.description ?? '',
    kind: stem ? 'stem' : 'orb',
    layers: p.layers,
    drawn: (p.drawn ?? []).map((d) => ({ id: d.id, src: d.src, raw: packRaw(d.raw) })),
    variation: p.variation ?? 0,
    ...(p.seeds ? { seeds: p.seeds } : {}),
    ...(p.gains ? { gains: p.gains } : {}),
    ...(p.vars ? { vars: Object.fromEntries(Object.entries(p.vars).map(([k, v]) => [k, varsToWire(v)])) } : {}),
    ...(p.custom?.length ? { custom: p.custom } : {}),
    ...(stem ? { song: p.song } : {}),
    agree: extra.agree === true,
    website: extra.website ?? '',
  };
}

// a server record -> a preset this page can play, or null when nothing in it is playable
export function fromWire(x) {
  if (!x || typeof x !== 'object') return null;
  const id = /^[A-Za-z0-9_-]{1,64}$/.test(String(x.id ?? '')) ? String(x.id) : null;
  if (!id) return null;
  // custom orbs first, so the layers and drawings below can name them
  const custom = (Array.isArray(x.custom) ? x.custom : []).slice(0, 12).map((d) => checkCustom(d, byId)).filter(Boolean);
  for (const d of custom) registerCustom(d, byId);
  const drawn =(Array.isArray(x.drawn) ? x.drawn : [])
    .filter((d) => d && typeof d.id === 'string' && known(d.src) && byId[d.src].voice && typeof d.raw === 'string')
    .slice(0, 8)
    .map((d) => ({ id: d.id.slice(0, 40), src: d.src, raw: unpackRaw(d.raw) }));
  const ok = new Set(drawn.map((d) => d.id));
  const layers = [...new Set((Array.isArray(x.layers) ? x.layers : [])
    .filter((l) => ok.has(l) || (known(l) && !byId[l].combo)))].slice(0, 24);
  // the grid is kept in wire form; it is checked (and drawings renamed) when it is loaded
  const seeds = x.seeds && typeof x.seeds === 'object'
    ? Object.fromEntries(Object.entries(x.seeds).filter(([k, v]) => layers.includes(k) && Number.isSafeInteger(v) && v >= 0))
    : null;
  const gains = cleanGains(x.gains, layers);
  const vars = cleanVars(x.vars, layers);
  const song = x.kind === 'stem' && x.song && typeof x.song === 'object' ? x.song : null;
  const p = {
    id, name: clip(x.name, 32) || '이름 없는 프리셋', author: clip(x.author, 24), description: clip(x.description, 261), // 100 typed + credits (server/presetSchema.mjs LIMITS)
    kind: song ? 'stem' : 'orb', createdAt: typeof x.createdAt === 'string' ? x.createdAt : null,
    layers, drawn, variation: Number.isSafeInteger(x.variation) && x.variation >= 0 ? x.variation : 0,
    ...(seeds ? { seeds } : {}),
    ...(gains ? { gains } : {}),
    ...(vars ? { vars } : {}),
    ...(custom.length ? { custom } : {}),
    ...(song ? { song } : {}),
    // how often it comes up (from 👍 / 👎 on the server); never shown
    ...(Number.isFinite(x.w) && x.w > 0 ? { w: Math.min(10, x.w) } : {}),
  };
  return presetLayers(p).some((l) => l.code) ? p : null;
}

// ---------- preset -> code ----------

// the preset's layers as orb objects; drawings become parts of their instrument orb
export function presetLayers(p) {
  const drawn = new Map((p.drawn ?? []).map((d) => {
    const s = byId[d.src];
    return [d.id, {
      id: d.id, cat: d.id, role: s.cat, name: '✎ ' + s.name, color: s.color, samples: s.samples,
      pitched: !!s.voice.root, code: () => sheetCode(d.raw, s.voice), edit: editOf(s, byId),
    }];
  }));
  // an orb playing a drawn variation (변주 slot · 편집) plays those notes on its instrument
  const varied = (id) => {
    const v = p.vars?.[id], x = v?.list[v.vi], s = byId[id];
    if (!x?.raw || !s?.voice) return null;
    // (on top of the orb itself, so a custom orb keeps its own sound)
    return Object.assign(Object.create(s), { id, pitched: !!s.voice.root, code: () => sheetCode(x.raw, s.voice) });
  };
  return p.layers.map((id) => drawn.get(id) ?? varied(id) ?? byId[id]).filter(Boolean);
}

// colours of a preset's parts (for its label)
export function presetColors(p) {
  const cols = presetLayers(p).flatMap((l) => l.colors ?? [l.color]).filter(Boolean);
  return [...new Set(cols)].slice(0, 6);
}

// One `$:` line per sounding part, exactly as the orb page builds them for a WAV render:
// tempo orbs scale the tempo, a key orb moves the pitched parts, a mood adds its effects to
// every line or turns whole roles down.
export function presetLines(p) {
  const ls = presetLayers(p);
  const bpm = Math.round(Math.min(220, Math.max(40, ls.filter((l) => l.bpm).reduce((f, l) => (f * l.bpm) / BASE_BPM, 1) * BASE_BPM)));
  // moods, EQ ones included (several may stack), at the strength set in the orb page's 약하게 / 세게 slots
  const fxOrbs = ls.filter((l) => l.cat === 'mood');
  const fxStep = (o) => pctStep(p.gains?.[o.id]);
  const keyOrb = ls.find((l) => l.cat === 'mode');
  const mode = keyOrb?.mode ?? 'minor', shift = keyOrb?.key ?? 0;
  const dt = (((60 / bpm) * 3) / 4).toFixed(3); // dotted-eighth delay in seconds
  const lines = [];
  setMode(mode);
  try {
    for (const l of ls) {
      if (!l.code) continue;
      const v = p.seeds?.[l.id] ?? p.variation; // an orb may carry its own seed
      let code = typeof l.code === 'function' ? l.code(rng(hash(rootId(l, byId)) + v * 7919)) : l.code;
      if (mode !== 'minor') code = code.replaceAll(':minor"', `:${mode}"`);
      const key = keyTail(l, code, shift, mode);
      const g = p.gains?.[l.id]; // the orb's own volume (orb page volume slots), times a balance mood's dip
      // a custom orb (🎛 편집): its knobs on top of the orb's own line, its own volume times the rest
      const ed = editOf(l, byId), own = ed ? editChain(ed, kindOf(l, code, ed)) : '';
      const gv = (Number.isSafeInteger(g) ? g / 100 : 1) * duckOf(fxOrbs, role(l), fxStep) * editGain(ed);
      const gain = Math.abs(gv - 1) < 0.005 ? '' : `.postgain(${+gv.toFixed(3)})`;
      const fx = songFx(fxOrbs, code + own, fxStep);
      lines.push({ layer: l, role: role(l), code: `// ${l.name}\n$: ${code}${key}${own}${fx}${gain}`.replaceAll('__DT__', dt) });
    }
  } finally {
    setMode('minor');
  }
  return { bpm, key: keyLabel({ key: shift, mode }), mode, lines };
}

// A preset as a song for the main player (same shape as composer.generateSong): the user's set
// is the main part, with an intro, an optional break and an outro made by leaving parts of it
// out. Whether the break comes is rolled per play (from the preset and its start cycle).
const BREAK_CHANCE = 0.6;
export function presetSong(p, start) {
  const { bpm, key, mode, lines } = presetLines(p);
  const drums = lines.filter((l) => DRUM_CATS.includes(l.role));
  const rest = lines.filter((l) => !drums.includes(l));
  const of = (...roles) => lines.filter((l) => roles.includes(l.role));
  const calm = lines.filter((l) => !['lead', 'arp'].includes(l.role));
  const withBreak = rng(hash(p.id) + start * 7919).chance(BREAK_CHANCE);
  const form = drums.length && rest.length
    ? [
      ['intro', 8, [...drums, ...of('bass')]],
      ['main', 16, lines],
      ...(withBreak ? [['break', 8, rest]] : []),
      ['main2', 16, lines],
      ['outro', 8, [...drums, ...of('pad', 'texture')]],
    ]
    : [['intro', 8, calm], ['main', 32, lines], ['outro', 8, calm]];
  const cps = +(bpm / 240).toFixed(5);
  const sections = [];
  const blocks = [];
  let t = start;
  for (const [name, len, part] of form) {
    const layers = part.length ? part : lines;
    const code = layers.map((l) => `${l.code}\n  .sect(${t}, ${len})`).join('\n');
    sections.push({ name, start: t, len, layers: layers.map((l) => l.layer.id) });
    blocks.push({ name, start: t, len, code: `// ── ${name.toUpperCase()} · cycles ${t}–${t + len} ──\n${code}` });
    t += len;
  }
  const header =
    `// "${p.name}"${p.author ? ` by ${p.author}` : ''} · orb preset ${p.id} · ${bpm} BPM · ${key}\n` +
    `$: note(0).s("sine").gain(0).cps(${cps})\n  .sect(${start}, ${t - start})`;
  return {
    seed: hash(p.id), id: p.id, preset: p, title: p.name, style: 'preset', bpm, cps, root: key, scale: mode,
    start, end: t, sections, header, blocks,
    code: header + '\n\n' + blocks.map((b) => b.code).join('\n\n'),
    // a vocal orb lists all its lines: only the ones this song's code plays (at its key) load
    samples: [...new Set([
      ...presetLayers(p).filter((l) => !l.vocal).flatMap((l) => l.samples ?? []),
      ...vocalFiles(blocks.map((b) => b.code).join('\n')),
    ])],
  };
}
