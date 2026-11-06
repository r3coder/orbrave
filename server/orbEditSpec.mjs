// What a custom orb (the orb page's 🎛 편집) may change about a catalogue orb's sound, as data:
// each key below is one knob with its range (or its choices). An edit is a plain object
// { key: value } of these keys only; the orb page turns it into Strudel calls itself
// (src/orbEdit.js), so a shared custom orb is never run as code.
// Plain ESM with no imports: Node (server/) and Vite (src/) both load it as is.

// grp: the editor tab it sits in. only: which sounds it applies to (see src/orbEdit.js kindOf):
// synth (a waveform), drum (no pitch), pitched (plays notes), bank (a drum machine sample),
// supersaw, pulse. log: the slider moves on a log scale. int: whole numbers.
export const EDIT_PARAMS = {
  // ---- sound
  wave: { grp: 'sound', only: 'synth', opts: ['sawtooth', 'square', 'triangle', 'sine', 'supersaw', 'pulse'] },
  bank: { grp: 'sound', only: 'bank', opts: ['TR909', 'TR808', 'TR707', 'TR606', 'TR727', 'RD6'] },
  oct: { grp: 'sound', only: 'pitched', min: -2, max: 2, int: true, def: 0 },
  semi: { grp: 'sound', only: 'pitched', min: -12, max: 12, int: true, def: 0 },
  pitch: { grp: 'sound', only: 'drum', min: -24, max: 24, int: true, def: 0 },
  // ---- envelope
  att: { grp: 'env', min: 0, max: 2, step: 0.005, def: 0.001 },
  dec: { grp: 'env', min: 0, max: 2, step: 0.005, def: 0.05 },
  sus: { grp: 'env', min: 0, max: 1, step: 0.01, def: 1 },
  rel: { grp: 'env', min: 0, max: 4, step: 0.01, def: 0.01 },
  clip: { grp: 'env', min: 0.05, max: 2, step: 0.01, def: 1 },
  penv: { grp: 'env', min: -24, max: 24, int: true, def: 0 },
  patt: { grp: 'env', min: 0, max: 1, step: 0.005, def: 0 },
  pdec: { grp: 'env', min: 0, max: 1, step: 0.005, def: 0.1 },
  // ---- filter / EQ
  lpf: { grp: 'filter', min: 50, max: 20000, log: true, int: true, def: 20000 },
  lpq: { grp: 'filter', min: 0, max: 20, step: 0.1, def: 0 },
  hpf: { grp: 'filter', min: 20, max: 12000, log: true, int: true, def: 20 },
  hpq: { grp: 'filter', min: 0, max: 20, step: 0.1, def: 0 },
  bpf: { grp: 'filter', min: 100, max: 10000, log: true, int: true, def: 1000 },
  bpq: { grp: 'filter', min: 0.1, max: 10, step: 0.1, def: 1 },
  ftype: { grp: 'filter', opts: ['12db', 'ladder', '24db'] },
  drive: { grp: 'filter', min: 0, max: 1, step: 0.01, def: 0.69 },
  lpenv: { grp: 'filter', min: -8, max: 8, step: 0.1, def: 0 },
  lpa: { grp: 'filter', min: 0, max: 2, step: 0.005, def: 0.005 },
  lpd: { grp: 'filter', min: 0, max: 2, step: 0.005, def: 0.1 },
  lps: { grp: 'filter', min: 0, max: 1, step: 0.01, def: 0 },
  lpr: { grp: 'filter', min: 0, max: 2, step: 0.005, def: 0.1 },
  // a moving filter (LFO): which filter, its wave, bars per sweep, and the range it sweeps
  lfo: { grp: 'motion', opts: ['lpf', 'hpf', 'bpf'] },
  lfow: { grp: 'motion', opts: ['sine', 'tri', 'saw', 'isaw', 'square', 'perlin'] },
  lfor: { grp: 'motion', opts: ['0.25', '0.5', '1', '2', '4', '8', '16'] },
  lfolo: { grp: 'motion', min: 50, max: 20000, log: true, int: true, def: 300 },
  lfohi: { grp: 'motion', min: 50, max: 20000, log: true, int: true, def: 3000 },
  // ---- tone
  shape: { grp: 'tone', min: 0, max: 0.95, step: 0.01, def: 0 },
  dist: { grp: 'tone', min: 0, max: 4, step: 0.05, def: 0 },
  crush: { grp: 'tone', min: 2, max: 16, step: 0.5, def: 16 },
  coarse: { grp: 'tone', min: 1, max: 32, int: true, def: 1 },
  vowel: { grp: 'tone', opts: ['a', 'e', 'i', 'o', 'u'] },
  // ---- synth
  fm: { grp: 'synth', only: 'synth', min: 0, max: 10, step: 0.1, def: 0 },
  fmh: { grp: 'synth', only: 'synth', min: 0.25, max: 8, step: 0.01, def: 1 },
  fmatt: { grp: 'synth', only: 'synth', min: 0, max: 2, step: 0.005, def: 0.001 },
  fmdec: { grp: 'synth', only: 'synth', min: 0, max: 2, step: 0.005, def: 0.2 },
  fmsus: { grp: 'synth', only: 'synth', min: 0, max: 1, step: 0.01, def: 1 },
  fmwave: { grp: 'synth', only: 'synth', opts: ['sine', 'sawtooth', 'square', 'triangle'] },
  det: { grp: 'synth', only: 'supersaw', min: 0, max: 1, step: 0.01, def: 0.18 },
  uni: { grp: 'synth', only: 'supersaw', min: 1, max: 8, int: true, def: 5 },
  spread: { grp: 'synth', only: 'supersaw', min: 0, max: 1, step: 0.01, def: 0.6 },
  pw: { grp: 'synth', only: 'pulse', min: 0.05, max: 0.95, step: 0.01, def: 0.5 },
  pwrate: { grp: 'synth', only: 'pulse', min: 0, max: 8, step: 0.05, def: 0 },
  vib: { grp: 'synth', only: 'pitched', min: 0, max: 16, step: 0.1, def: 0 },
  vibmod: { grp: 'synth', only: 'pitched', min: 0, max: 2, step: 0.01, def: 0.5 },
  noise: { grp: 'synth', only: 'synth', min: 0, max: 1, step: 0.01, def: 0 },
  // ---- motion
  pan: { grp: 'motion', min: 0, max: 1, step: 0.01, def: 0.5 },
  apan: { grp: 'motion', min: 0, max: 1, step: 0.01, def: 0 }, // auto-pan width
  apr: { grp: 'motion', opts: ['0.25', '0.5', '1', '2', '4'] }, // bars per swing
  trem: { grp: 'motion', min: 0, max: 1, step: 0.01, def: 0 }, // tremolo depth
  tremr: { grp: 'motion', opts: ['1', '2', '4', '8', '16'] }, // tremolo beats per bar
  phr: { grp: 'motion', min: 0, max: 8, step: 0.05, def: 0 }, // phaser rate (Hz)
  phd: { grp: 'motion', min: 0, max: 1, step: 0.01, def: 0.75 },
  // ---- space
  room: { grp: 'space', min: 0, max: 1, step: 0.01, def: 0 },
  rsize: { grp: 'space', min: 0.5, max: 10, step: 0.1, def: 2 },
  rlp: { grp: 'space', min: 200, max: 20000, log: true, int: true, def: 20000 },
  delay: { grp: 'space', min: 0, max: 0.95, step: 0.01, def: 0 },
  dtime: { grp: 'space', opts: ['1/16', '1/8', '3/16', '1/4', '3/8', '1/2'] },
  dfb: { grp: 'space', min: 0, max: 0.9, step: 0.01, def: 0.5 },
  jux: { grp: 'space', opts: ['rev', 'press'] }, // the right channel plays it reversed / pressed
  // ---- rhythm
  deg: { grp: 'rhythm', min: 0, max: 0.9, step: 0.01, def: 0 },
  swing: { grp: 'rhythm', min: 0, max: 0.33, step: 0.01, def: 0 },
  tempo: { grp: 'rhythm', opts: ['0.5', '2'] },
  nudge: { grp: 'rhythm', min: -4, max: 4, int: true, def: 0 }, // 32nd notes later / earlier
  ply: { grp: 'rhythm', min: 1, max: 4, int: true, def: 1 },
  // ---- mix
  vol: { grp: 'mix', min: 5, max: 400, log: true, int: true, def: 100 }, // percent
  comp: { grp: 'mix', min: -60, max: 0, int: true, def: 0 }, // threshold dB (0: off)
  crat: { grp: 'mix', min: 1, max: 20, step: 0.5, def: 4 },
};

export const EDIT_KEYS = Object.keys(EDIT_PARAMS);
export const CUSTOM_LIMITS = { name: 24, perPreset: 12 };
const ORB_ID = /^[A-Za-z0-9_-]{1,40}$/;
export const CUSTOM_ID = /^cx[a-z0-9]{8,16}$/;
export const COLOR = /^#[0-9a-f]{6}$/;

// one value of `key`, rounded to its step and kept in range; undefined when it can't be one
export function cleanValue(key, v) {
  const p = EDIT_PARAMS[key];
  if (!p) return undefined;
  if (p.opts) return typeof v === 'string' && p.opts.includes(v) ? v : undefined;
  if (typeof v !== 'number' || !Number.isFinite(v)) return undefined;
  const x = Math.min(p.max, Math.max(p.min, v));
  if (p.int) return Math.round(x);
  const step = p.step ?? 0.01;
  return +(Math.round(x / step) * step).toFixed(4);
}

// An edit with only known keys and sensible values (unknown keys dropped, numbers clamped),
// keys in EDIT_KEYS order so the same edit always reads the same. null when nothing is left.
export function cleanEdit(e) {
  if (!e || typeof e !== 'object' || Array.isArray(e)) return null;
  const out = {};
  for (const k of EDIT_KEYS) {
    if (!Object.hasOwn(e, k)) continue;
    const v = cleanValue(k, e[k]);
    if (v !== undefined) out[k] = v;
  }
  return Object.keys(out).length ? out : null;
}

// A custom orb's id comes from what it is (its source orb, edit, name and colour): the same orb
// made twice, or shared and loaded back, has the same id, and two different ones never share one.
const fnv = (s, h = 2166136261) => {
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
};
export function customIdOf({ base, name = '', color = '', e }) {
  const s = JSON.stringify([base, name ?? '', color ?? '', e]);
  return 'cx' + fnv(s).toString(36).padStart(7, '0') + fnv(s, 0x811c9dc4 ^ 0x5bd1e995).toString(36).padStart(7, '0');
}

// A custom orb as data: { id, base, name, color, e }. `cleanText` checks the name the way the
// preset server checks song titles (passed in, so this file needs no imports). Throws (via
// `fail`) on anything that isn't one; returns the clean definition (its id checked against it).
export function cleanCustomDef(d, { fail, cleanText }) {
  if (!d || typeof d !== 'object' || Array.isArray(d)) fail('커스텀 오브 형식이 올바르지 않아요');
  if (typeof d.base !== 'string' || !ORB_ID.test(d.base) || CUSTOM_ID.test(d.base)) fail('커스텀 오브의 원본이 올바르지 않아요');
  const e = cleanEdit(d.e);
  if (!e) fail('커스텀 오브에 바꾼 소리가 없어요');
  const color = typeof d.color === 'string' && COLOR.test(d.color.toLowerCase()) ? d.color.toLowerCase() : '';
  const name = cleanText(d.name, '오브 이름', CUSTOM_LIMITS.name);
  const def = { base: d.base, name, color, e };
  const id = customIdOf(def);
  if (d.id !== id) fail('커스텀 오브 이름표가 내용과 맞지 않아요');
  return { id, ...def };
}
