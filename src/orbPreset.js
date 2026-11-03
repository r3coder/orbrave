// Orb presets outside the orb page: the wire format the preset server stores, and turning a
// preset back into Strudel code (the main player plays user presets with this).
// A preset only ever names catalogue orbs, drawings (64 digits) and a variation number; the code
// is always rebuilt here from the catalogue, so nothing a server sends is ever run as code.
import {
  BAR_CHORDS, BASE_BPM, DRUM_CATS, byId, hash, keyLabel, rng, role, setMode, snap,
} from './orbCatalog.js';

// ---------- drawings (shared with the orb page's piano roll) ----------

export const BARS = 4, STEPS = BARS * 16, ROWS = 15;

// a drawing as 64 chars: '.' = no note, otherwise the row in base 36
export const packRaw = (raw) => raw.map((d) => (d === null ? '.' : d.toString(36))).join('');
export const unpackRaw = (str) => [...String(str).padEnd(STEPS, '.').slice(0, STEPS)].map((c) => (c === '.' ? null : Math.min(ROWS - 1, parseInt(c, 36) || 0)));

// Turn a rough drawing into notes that sit on the beat and on the harmony: one note per
// eighth (the average height of the line there); melodic parts snap to the bar's triad on
// strong beats and to its chord tones elsewhere, and a repeated pitch ties into a long note.
// Drums hit on each eighth the line passes, plus the sixteenth after it where the line slopes.
export function quantize(raw, v) {
  const out = Array(STEPS).fill(null); // { d, start } per sixteenth
  let prev = null;
  for (let e = 0; e < STEPS / 2; e++) {
    const a = raw[2 * e], b = raw[2 * e + 1];
    const vals = [a, b].filter((x) => x !== null);
    if (!vals.length) {
      prev = null;
      continue;
    }
    const pos = e % 8, c = BAR_CHORDS[Math.floor(e / 8)];
    if (v.root) {
      const avg = Math.round(vals.reduce((s, x) => s + x, 0) / vals.length);
      const d = snap(avg, v.snap === 'triad' || pos % 4 === 0 ? c.triad : c.tones, 0, ROWS - 1);
      out[2 * e] = { d, start: !(prev === d && pos !== 0) };
      out[2 * e + 1] = { d, start: false };
      prev = d;
    } else {
      out[2 * e] = { d: Math.round(vals[0]), start: true };
      if (a !== null && b !== null && Math.abs(a - b) >= 2) out[2 * e + 1] = { d: b, start: true };
    }
  }
  return out;
}

export function sheetCode(raw, v) {
  const q = quantize(raw, v);
  const tok = q.map((n) => (!n ? '~' : n.start ? (v.map ? v.map(n.d) : n.d) : v.legato ? '_' : '~'));
  const pat = `"<${[0, 1, 2, 3].map((b) => `[${tok.slice(b * 16, b * 16 + 16).join(' ')}]`).join(' ')}>"`;
  return v.root ? `n(${pat}).scale("${v.root}:minor")${v.sound}` : `${v.ctrl}(${pat})${v.sound}`;
}

// ---------- wire format ----------
// What the server stores and returns for one preset (see docs/PRESET_API.md):
//   { id, name, author?, description?, kind: 'orb' | 'stem', createdAt?,
//     layers: [orb id | drawing id], drawn: [{ id, src, raw }], variation, song? }
// `raw` travels packed (64 chars). A stem preset also carries the full-song grid (`song`, below).
// Anything unknown is dropped, so presets made with an older or newer catalogue still load with
// the orbs this page knows.

const known = (id) => typeof id === 'string' && Object.hasOwn(byId, id);
const clip = (s, n) => (typeof s === 'string' ? s.trim().slice(0, n) : '');
const BLOCK = 4; // bars per stem cell

// The stem grid (the orb page's full song) as data: its sections, and per instrument row one
// entry per 4-bar block: null = silent, -1 = playing (orb without a seed), n = playing with seed n.
//   { sections: [{ name, len, shift, v }], rows: [{ id, alt, cells: [...] }] }
export function songToWire(song) {
  return {
    sections: song.sections.map(({ name, len, shift, v }) => ({ name, len, shift: shift ?? 0, v: v ?? 0 })),
    rows: song.rows.filter((r) => song.cells[r.id]).map((r) => ({
      id: r.id, alt: !!r.alt, cells: song.cells[r.id].flat().map((c) => (!c.on ? null : c.v == null ? -1 : c.v)),
    })),
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
    cells[id] = sections.map((sec) => Array.from({ length: sec.len / BLOCK }, () => {
      const c = r.cells[k++];
      return Number.isSafeInteger(c) && c >= 0 ? { on: true, v: c } : { on: c === -1, v: c === -1 || c === null ? null : 0 };
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
  const song = x.kind === 'stem' && x.song && typeof x.song === 'object' ? x.song : null;
  const p = {
    id, name: clip(x.name, 32) || '이름 없는 프리셋', author: clip(x.author, 24), description: clip(x.description, 100),
    kind: song ? 'stem' : 'orb', createdAt: typeof x.createdAt === 'string' ? x.createdAt : null,
    layers, drawn, variation: Number.isSafeInteger(x.variation) && x.variation >= 0 ? x.variation : 0,
    ...(song ? { song } : {}),
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
// every line or silences whole roles.
export function presetLines(p) {
  const ls = presetLayers(p);
  const bpm = Math.round(Math.min(220, Math.max(40, ls.filter((l) => l.bpm).reduce((f, l) => (f * l.bpm) / BASE_BPM, 1) * BASE_BPM)));
  const mood = ls.find((l) => l.cat === 'mood');
  const keyOrb = ls.find((l) => l.cat === 'mode');
  const mode = keyOrb?.mode ?? 'minor', shift = keyOrb?.key ?? 0;
  const dt = (((60 / bpm) * 3) / 4).toFixed(3); // dotted-eighth delay in seconds
  const lines = [];
  setMode(mode);
  try {
    for (const l of ls) {
      if (!l.code || mood?.mute?.includes(role(l))) continue;
      let code = typeof l.code === 'function' ? l.code(rng(hash(l.id) + p.variation * 7919)) : l.code;
      if (mode !== 'minor') code = code.replaceAll(':minor"', `:${mode}"`);
      const pitched = l.pitched || /\b(scale|chord|note)\(/.test(code);
      const key = shift && pitched ? `.transpose(${shift})` : '';
      lines.push({ layer: l, role: role(l), code: `// ${l.name}\n$: ${code}${key}${mood?.fx ?? ''}`.replaceAll('__DT__', dt) });
    }
  } finally {
    setMode('minor');
  }
  return { bpm, key: keyLabel({ key: shift, mode }), mode, lines };
}

// A preset as a song for the main player (same shape as composer.generateSong): the user's set
// is the main part, with an intro, a break and an outro made by leaving parts of it out.
export function presetSong(p, start) {
  const { bpm, key, mode, lines } = presetLines(p);
  const drums = lines.filter((l) => DRUM_CATS.includes(l.role));
  const rest = lines.filter((l) => !drums.includes(l));
  const of = (...roles) => lines.filter((l) => roles.includes(l.role));
  const calm = lines.filter((l) => !['lead', 'arp'].includes(l.role));
  const form = drums.length && rest.length
    ? [
      ['intro', 8, [...drums, ...of('bass')]],
      ['main', 16, lines],
      ['break', 8, rest],
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
