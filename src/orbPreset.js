// Orb presets outside the orb page: the wire format the preset server stores, and turning a
// preset back into Strudel code (the main player plays user presets with this).
// A preset only ever names catalogue orbs, drawings (64 digits) and a variation number; the code
// is always rebuilt here from the catalogue, so nothing a server sends is ever run as code.
import {
  BAR_CHORDS, BASE_BPM, DRUM_CATS, byId, hash, keyLabel, rng, role, setMode, snap,
} from './orbCatalog.js';

// ---------- drawings (shared with the orb page's piano roll) ----------

export const BARS = 4, STEPS = BARS * 16, ROWS = 15;

// A step holds null (no note), one row, or a sorted array of rows (a chord). Single notes stay
// plain numbers so drawings saved before chords existed load unchanged.
export const notesAt = (x) => (x === null || x === undefined ? [] : Array.isArray(x) ? x : [x]);
export const stepOf = (ds) => {
  const u = [...new Set(ds)].sort((a, b) => a - b);
  return !u.length ? null : u.length === 1 ? u[0] : u;
};
const same = (a, b) => a.length === b.length && a.every((x, i) => x === b[i]);

// a drawing as text, one entry per sixteenth: '.' = no note, a row in base 36, or a chord as
// its rows in parentheses ("(047)"). A drawing without chords is exactly 64 chars.
export const packRaw = (raw) => raw.map((x) => {
  const ds = notesAt(x);
  return !ds.length ? '.' : ds.length === 1 ? ds[0].toString(36) : `(${ds.map((d) => d.toString(36)).join('')})`;
}).join('');
export const unpackRaw = (str) => {
  const row = (c) => Math.min(ROWS - 1, parseInt(c, 36) || 0);
  const out = [];
  const t = String(str);
  for (let i = 0; i < t.length && out.length < STEPS; i++) {
    if (t[i] === '(') {
      const j = t.indexOf(')', i);
      if (j < 0) break;
      out.push(stepOf([...t.slice(i + 1, j)].map(row)));
      i = j;
    } else out.push(t[i] === '.' ? null : row(t[i]));
  }
  while (out.length < STEPS) out.push(null);
  return out;
};

// Turn a rough drawing into notes that sit on the beat and on the harmony: one note per
// eighth (the average height of the line there); melodic parts snap to the bar's triad on
// strong beats and to its chord tones elsewhere, and a repeated pitch ties into a long note.
// A chord (several rows in one step) plays as placed, on the eighth, tied while it repeats.
// Drums hit on each eighth the line passes, plus the sixteenth after it where the line slopes.
// Each sixteenth comes out as { ds: [rows], start } or null.
export function quantize(raw, v) {
  const out = Array(STEPS).fill(null);
  let prev = null;
  for (let e = 0; e < STEPS / 2; e++) {
    const A = notesAt(raw[2 * e]), B = notesAt(raw[2 * e + 1]);
    if (!A.length && !B.length) {
      prev = null;
      continue;
    }
    const pos = e % 8, c = BAR_CHORDS[Math.floor(e / 8)];
    const chord = A.length > 1 || B.length > 1;
    if (v.root) {
      let ds;
      if (chord) ds = notesAt(stepOf([...A, ...B]));
      else {
        const vals = [...A, ...B];
        const avg = Math.round(vals.reduce((s, x) => s + x, 0) / vals.length);
        ds = [snap(avg, v.snap === 'triad' || pos % 4 === 0 ? c.triad : c.tones, 0, ROWS - 1)];
      }
      out[2 * e] = { ds, start: !(prev && same(prev, ds) && pos !== 0) };
      out[2 * e + 1] = { ds, start: false };
      prev = ds;
    } else {
      out[2 * e] = { ds: A.length ? A : B, start: true };
      const slope = chord ? !same(A, B) : A.length && B.length && Math.abs(A[0] - B[0]) >= 2;
      if (A.length && B.length && slope) out[2 * e + 1] = { ds: B, start: true };
    }
  }
  return out;
}

export function sheetCode(raw, v) {
  const q = quantize(raw, v);
  const one = (d) => (v.map ? v.map(d) : d);
  const tok = q.map((n) => (!n ? '~' : n.start ? (n.ds.length === 1 ? one(n.ds[0]) : `[${n.ds.map(one).join(',')}]`) : v.legato ? '_' : '~'));
  const pat = `"<${[0, 1, 2, 3].map((b) => `[${tok.slice(b * 16, b * 16 + 16).join(' ')}]`).join(' ')}>"`;
  return v.root ? `n(${pat}).scale("${v.root}:minor")${v.sound}` : `${v.ctrl}(${pat})${v.sound}`;
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
export const fxScalable = (l) => !!l && (!!l.duck?.length || fxScalableCode(l.fx));
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
  const mood = orbs.filter((o) => !o.eq).map((o) => scaleFx(o.fx, stepOf(o))).join('');
  return eq + mood;
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

const clip = (s, n) => (typeof s === 'string' ? s.trim().slice(0, n) : '');
const BLOCK = 4; // bars per stem cell

// The stem grid (the orb page's full song) as data: its sections, and per instrument row one
// entry per 4-bar block: null = silent, -1 = playing (orb without a seed), n = playing with seed n.
// `fills` (optional) lists the blocks whose last bar plays as a 💥 fill.
//   { sections: [{ name, len, shift, v }], rows: [{ id, alt, cells: [...], fills?: [blockIndex] }] }
export function songToWire(song) {
  return {
    sections: song.sections.map(({ name, len, shift, v }) => ({ name, len, shift: shift ?? 0, v: v ?? 0 })),
    rows: song.rows.filter((r) => song.cells[r.id]).map((r) => {
      const flat = song.cells[r.id].flat();
      const fills = flat.flatMap((c, i) => (c.on && c.fill ? [i] : []));
      return { id: r.id, alt: !!r.alt, cells: flat.map((c) => (!c.on ? null : c.v == null ? -1 : c.v)), ...(fills.length && { fills }) };
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
    name: clip(x?.name, 12) || '섹션', len: int(x?.len, BLOCK, 64, 0), shift: int(x?.shift, -11, 11, 0), v: int(x?.v, 0, 100, 0),
  }));
  if (!sections.length || sections.some((x) => !x.len || x.len % BLOCK)) return null;
  const total = sections.reduce((n, x) => n + x.len / BLOCK, 0);
  const rows = [], cells = {};
  for (const r of w.rows.slice(0, 40)) {
    const id = typeof r?.id === 'string' ? rename(r.id) : null;
    if (!id || !known(id) || cells[id] || !Array.isArray(r.cells) || r.cells.length !== total) continue;
    let k = 0;
    const fills = new Set(Array.isArray(r.fills) ? r.fills : []);
    cells[id] = sections.map((sec) => Array.from({ length: sec.len / BLOCK }, () => {
      const fill = fills.has(k), c = r.cells[k++];
      const cell = Number.isSafeInteger(c) && c >= 0 ? { on: true, v: c } : { on: c === -1, v: c === -1 || c === null ? null : 0 };
      return { ...cell, fill: cell.on && fill };
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
  const drawn = (Array.isArray(x.drawn) ? x.drawn : [])
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
  const song = x.kind === 'stem' && x.song && typeof x.song === 'object' ? x.song : null;
  const p = {
    id, name: clip(x.name, 32) || '이름 없는 프리셋', author: clip(x.author, 24), description: clip(x.description, 261), // 100 typed + credits (server/presetSchema.mjs LIMITS)
    kind: song ? 'stem' : 'orb', createdAt: typeof x.createdAt === 'string' ? x.createdAt : null,
    layers, drawn, variation: Number.isSafeInteger(x.variation) && x.variation >= 0 ? x.variation : 0,
    ...(seeds ? { seeds } : {}),
    ...(gains ? { gains } : {}),
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
      pitched: !!s.voice.root, code: () => sheetCode(d.raw, s.voice),
    }];
  }));
  return p.layers.map((id) => drawn.get(id) ?? byId[id]).filter(Boolean);
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
      let code = typeof l.code === 'function' ? l.code(rng(hash(l.id) + v * 7919)) : l.code;
      if (mode !== 'minor') code = code.replaceAll(':minor"', `:${mode}"`);
      const pitched = l.pitched || /\b(scale|chord|note)\(/.test(code);
      const key = shift && pitched ? `.transpose(${shift})` : '';
      const g = p.gains?.[l.id]; // the orb's own volume (orb page volume slots), times a balance mood's dip
      const gv = (Number.isSafeInteger(g) ? g / 100 : 1) * duckOf(fxOrbs, role(l), fxStep);
      const gain = Math.abs(gv - 1) < 0.005 ? '' : `.postgain(${+gv.toFixed(3)})`;
      const fx = songFx(fxOrbs, code, fxStep);
      lines.push({ layer: l, role: role(l), code: `// ${l.name}\n$: ${code}${key}${fx}${gain}`.replaceAll('__DT__', dt) });
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
    samples: [...new Set(presetLayers(p).flatMap((l) => l.samples ?? []))],
  };
}
