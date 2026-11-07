// Custom orbs (the orb page's 🎛 편집): a catalogue orb with its sound changed. The change is an
// edit, plain data checked against server/orbEditSpec.mjs; this file turns it into the Strudel
// calls appended to the orb's own line (a later call of the same control replaces the orb's own
// one), and reads an orb's own values back so the editor can start from them.
import { EDIT_PARAMS, cleanCustomDef, cleanEdit, customIdOf } from '../server/orbEditSpec.mjs';
import { cleanText } from '../server/presetSchema.mjs';

export { EDIT_PARAMS, customIdOf };

// edit key -> the Strudel control it sets as a plain value
const CALL = {
  att: 'attack', dec: 'decay', sus: 'sustain', rel: 'release', clip: 'clip',
  penv: 'penv', patt: 'pattack', pdec: 'pdecay',
  lpf: 'lpf', lpq: 'lpq', hpf: 'hpf', hpq: 'hpq', bpf: 'bpf', bpq: 'bpq', ftype: 'ftype', drive: 'drive',
  lpenv: 'lpenv', lpa: 'lpattack', lpd: 'lpdecay', lps: 'lpsustain', lpr: 'lprelease',
  shape: 'shape', dist: 'distort', crush: 'crush', coarse: 'coarse', vowel: 'vowel',
  fm: 'fm', fmh: 'fmh', fmatt: 'fmattack', fmdec: 'fmdecay', fmsus: 'fmsustain', fmwave: 'fmwave',
  det: 'detune', uni: 'unison', spread: 'spread', pw: 'pw', pwrate: 'pwrate', vib: 'vib', vibmod: 'vibmod', noise: 'noise',
  room: 'room', rsize: 'roomsize', rlp: 'roomlp', delay: 'delay', dfb: 'delayfeedback',
  deg: 'degradeBy', ply: 'ply',
};
// the controls an orb's own code may set, read back as edit keys (aliases included)
const READ = {
  ...Object.fromEntries(Object.entries(CALL).map(([k, c]) => [c, k])),
  lp: 'lpf', cutoff: 'lpf', ctf: 'lpf', resonance: 'lpq', hp: 'hpf', hcutoff: 'hpf', hresonance: 'hpq',
  bp: 'bpf', bandf: 'bpf', bandq: 'bpq', att: 'att', dec: 'dec', sus: 'sus', rel: 'rel', size: 'rsize', dfb: 'dfb',
  lpe: 'lpenv', lpattack: 'lpa', lpdecay: 'lpd', lpsustain: 'lps', lprelease: 'lpr', distort: 'dist', pan: 'pan',
};

export const SYNTH_WAVES = ['sawtooth', 'square', 'triangle', 'sine', 'supersaw', 'pulse'];
// which drum hits each machine has (public/samples/strudel.json), for 🥁 기계 바꾸기
const BANK_SOUNDS = {
  TR909: 'bd sd cp rim hh oh cr rd lt mt ht',
  TR808: 'bd sd cp rim hh oh cr lt mt ht cb sh perc',
  TR707: 'bd sd cp rim hh oh cr rd lt mt ht tb',
  TR606: 'bd sd hh oh cr lt ht',
  TR727: 'sh perc',
  RD6: 'bd sd cp hh oh cr lt ht',
};
const DT_OF = { '1/16': 1 / 3, '1/8': 2 / 3, '3/16': 1, '1/4': 4 / 3, '3/8': 2, '1/2': 8 / 3 }; // × the dotted eighth (__DT__)
const num = (x) => String(+(+x).toFixed(4));

// What kind of sound an orb's code makes, for the knobs that only fit some sounds.
export function kindOf(l, code, edit = null) {
  const own = /\.s\("([a-z_]+)"\)|^s\("([a-z_]+)"\)/m.exec(code);
  const s0 = own?.[1] ?? own?.[2] ?? null;
  const wave = edit?.wave ?? (SYNTH_WAVES.includes(s0) ? s0 : null);
  const pitched = !!(l?.voice?.root || l?.pitched || /\b(scale|chord|note)\(/.test(code));
  const sounds = [...code.matchAll(/\bs\("([^"]*)"\)/g)].flatMap((m) => m[1].match(/[a-z]+/g) ?? []).filter((w) => w !== 'x');
  const bank = /\.bank\("/.test(code) && sounds.length > 0;
  const banks = bank ? Object.keys(BANK_SOUNDS).filter((b) => sounds.every((w) => BANK_SOUNDS[b].split(' ').includes(w))) : [];
  return {
    synth: !!wave, wave, pitched, drum: !pitched, bank: banks.length > 1, banks,
    supersaw: wave === 'supersaw', pulse: wave === 'pulse',
  };
}
// whether knob `key` means anything for a sound of this kind
export const fits = (key, kind) => {
  const only = EDIT_PARAMS[key]?.only;
  return !only || !!kind[only];
};

const LFO_WAVE = { sine: 'sine', tri: 'tri', saw: 'saw', isaw: 'isaw', square: 'square', perlin: 'perlin' };
const rate = (bars) => {
  const r = +bars || 1;
  return r === 1 ? '' : r > 1 ? `.slow(${num(r)})` : `.fast(${num(1 / r)})`;
};

// The edit as Strudel calls to append to the orb's line. `kind` (kindOf) leaves out knobs that
// don't fit the sound. Only values from EDIT_PARAMS ever get here (cleanEdit), so this is all
// generated text: no user string is copied into the code.
export function editChain(e, kind) {
  if (!e) return '';
  const out = [];
  const on = (k) => e[k] !== undefined && fits(k, kind);
  if (on('wave')) out.push(`.s("${e.wave}")`);
  if (on('bank') && kind.banks.includes(e.bank)) out.push(`.bank("${e.bank}")`);
  const tr = (on('oct') ? e.oct * 12 : 0) + (on('semi') ? e.semi : 0);
  if (tr) out.push(`.transpose(${tr})`);
  // microtune: transpose() only moves note names by whole semitones, so the note becomes a MIDI
  // number (valueToMidi, a Strudel core helper) with the cents added
  if (on('cents') && e.cents) out.push(`.withValue((v) => (v.note == null ? v : { ...v, note: valueToMidi(v) + ${num(e.cents / 100)} }))`);
  if (on('pitch') && e.pitch) out.push(`.mul(speed(${num(2 ** (e.pitch / 12))}))`);
  for (const [k, c] of Object.entries(CALL)) {
    if (!on(k) || (k === e.lfo)) continue; // a moving filter replaces the fixed one
    out.push(typeof e[k] === 'string' ? `.${c}("${e[k]}")` : `.${c}(${num(e[k])})`);
  }
  if (e.lfo) {
    const lo = e.lfolo ?? EDIT_PARAMS.lfolo.def, hi = e.lfohi ?? EDIT_PARAMS.lfohi.def;
    out.push(`.${e.lfo}(${LFO_WAVE[e.lfow ?? 'sine']}.range(${num(lo)},${num(hi)})${rate(e.lfor ?? '4')})`);
  }
  if (e.apan > 0) {
    const c = e.pan ?? 0.5, w = e.apan / 2;
    out.push(`.pan(sine.range(${num(Math.max(0, c - w))},${num(Math.min(1, c + w))})${rate(e.apr ?? '1')})`);
  } else if (on('pan')) out.push(`.pan(${num(e.pan)})`);
  if (e.trem > 0) out.push(`.tremolosync(${+(e.tremr ?? '4')}).tremolodepth(${num(e.trem)})`);
  if (e.phr > 0) out.push(`.phaserrate(${num(e.phr)}).phaserdepth(${num(e.phd ?? EDIT_PARAMS.phd.def)})`);
  if (e.dtime) out.push(`.delaytime(__DT__*${num(DT_OF[e.dtime])})`);
  if (e.comp < 0) out.push(`.compressor("${e.comp}:${num(e.crat ?? EDIT_PARAMS.crat.def)}:10:.005:.1")`);
  if (e.swing > 0) out.push(`.swingBy(${num(e.swing)}, 4)`);
  if (e.tempo === '2') out.push('.fast(2)');
  else if (e.tempo === '0.5') out.push('.slow(2)');
  if (e.nudge) out.push(`.late(${num(e.nudge / 32)})`);
  if (e.jux) out.push(`.jux(${e.jux})`);
  return out.join('');
}
// the edit's own volume, as a factor on the orb's postgain
export const editGain = (e) => (e?.vol ?? 100) / 100;

// The values an orb's own code sets, as edit keys: { values: { key: number | string },
// moving: { key: 'sine.range(…)' } } (a filter or pan that moves is shown as moving).
export function readDefaults(code) {
  const values = {}, moving = {};
  for (let i = 0; i < code.length;) {
    const m = /^\.(\w+)\(/.exec(code.slice(i));
    if (!m) {
      i++;
      continue;
    }
    let depth = 1, j = i + m[0].length;
    for (; j < code.length && depth; j++) depth += code[j] === '(' ? 1 : code[j] === ')' ? -1 : 0;
    const name = m[1], arg = code.slice(i + m[0].length, j - 1).trim();
    i = j;
    if (name === 's' && /^"([a-z]+)"$/.test(arg) && SYNTH_WAVES.includes(arg.slice(1, -1))) values.wave = arg.slice(1, -1);
    else if (name === 'bank') values.bank = arg.replaceAll('"', '');
    else if (name === 'delaytime' && /^__DT__(\*[\d.]+)?$/.test(arg)) {
      // __DT__ alone, or a multiple of it as editChain writes one
      const x = +(arg.split('*')[1] ?? 1);
      const k = Object.keys(DT_OF).find((d) => Math.abs(DT_OF[d] - x) < 0.001);
      if (k) values.dtime = k;
    }
    else if (name === 'jux') values.jux = arg;
    else if (name === 'swingBy') values.swing = +arg.split(',')[0] || undefined;
    else if (READ[name]) {
      const k = READ[name], p = EDIT_PARAMS[k];
      if (p.opts) {
        const v = arg.replaceAll('"', '');
        if (p.opts.includes(v)) values[k] = v;
      } else if (/^-?\d*\.?\d+$/.test(arg)) values[k] = +arg;
      else if (/range\(/.test(arg)) {
        moving[k] = arg;
        const r = /(\w+)\.range\(\s*([\d.]+)\s*,\s*([\d.]+)\s*\)(?:\.(slow|fast)\(([\d.]+)\))?/.exec(arg);
        if (r && ['lpf', 'hpf', 'bpf'].includes(k) && !values.lfo) {
          const bars = r[4] === 'slow' ? +r[5] : r[4] === 'fast' ? 1 / +r[5] : 1;
          const near = EDIT_PARAMS.lfor.opts.reduce((a, b) => (Math.abs(Math.log(+b / bars)) < Math.abs(Math.log(+a / bars)) ? b : a));
          Object.assign(values, { lfo: k, lfow: LFO_WAVE[r[1]] ? r[1] : 'sine', lfolo: +r[2], lfohi: +r[3], lfor: near });
        }
      }
    }
  }
  return { values, moving };
}

// ---------- custom orbs as orbs ----------
// A custom orb stands in for its catalogue orb (`base`), like a copy of an orb: it plays the base
// orb's notes (patterns hash under the base's id) with the edit on top, under an id of its own
// made from its definition (customIdOf), so the same orb loaded twice is the same orb.

// a definition from storage or the wire, checked; null if it isn't a usable one
export function checkCustom(d, byId) {
  try {
    const c = cleanCustomDef(d, { fail: (m) => { throw new Error(m); }, cleanText });
    const b = byId[c.base];
    return b && b.code && !b.combo && !b.base ? c : null;
  } catch {
    return null;
  }
}
// a definition for a new custom orb (its name cleaned as the server will, its id from that)
export function makeDef(base, e, name = '', color = '') {
  let n = '';
  try {
    n = cleanText(name, '오브 이름', 24);
  } catch {}
  // the edit cleaned the way the server cleans it (values on their steps, keys in their order),
  // so the id made here is the one the server and every other page work out from it
  const def = { base, name: n, color: /^#[0-9a-f]{6}$/i.test(color) ? color.toLowerCase() : '', e: cleanEdit(e) };
  return { id: customIdOf(def), ...def };
}
// the orb object for a definition (registered in byId; the same one if it already is)
export function registerCustom(def, byId) {
  if (byId[def.id]) return byId[def.id];
  const b = byId[def.base];
  const l = Object.create(b);
  Object.defineProperties(l, {
    id: { value: def.id, enumerable: true },
    base: { value: def.base, enumerable: true },
    edit: { value: def.e, enumerable: true },
    def: { value: def },
    custom: { value: true },
    name: { value: def.name || b.name, enumerable: true },
    kind: { value: b.kind },
    ...(def.color ? { color: { value: def.color }, glow: { value: def.color }, colors: { value: undefined } } : {}),
  });
  byId[def.id] = l;
  return l;
}
// the catalogue orb an orb plays the notes of (through copies and custom orbs)
export function rootId(l, byId) {
  let x = l;
  for (let n = 0; n < 4 && x?.base && byId[x.base] && byId[x.base] !== x; n++) x = byId[x.base];
  return x?.id ?? l?.id;
}
// the edit an orb plays with (its own, or the custom orb it is a copy / drawing of)
export const editOf = (l, byId) => l?.edit ?? (l?.src && byId[l.src]?.edit) ?? null;
