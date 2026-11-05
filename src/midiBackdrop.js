// A dark piano-roll backdrop for wide screens: the 4-bar loop of every pitched orb in the song
// (bass, chords, arps, leads) laid out across the whole page behind everything, in its colour.
// The notes sounding right now light up a little, and a faint line sweeps left to right once
// every 4 bars. Self-contained: orbs.js only calls drawMidiBackdrop() from its frame loop.
import { transpiler, noteToMidi } from '@strudel/web';
import { BARS } from './orbPreset.js';

const cache = new Map(); // layer key -> [{ b, e, m }] (begin / end in cycles, midi note)
function notesOf(key, code) {
  if (cache.has(key)) return cache.get(key);
  let out = [];
  try {
    const js = transpiler(code().replaceAll('__DT__', '0.3'), { emitMiniLocations: false, emitWidgets: false }).output;
    const pat = new Function(js)();
    for (const h of pat.queryArc(0, BARS)) {
      if (!h.hasOnset()) continue;
      const v = h.value?.note ?? h.value?.n;
      const m = typeof v === 'string' ? noteToMidi(v) : v;
      if (!Number.isFinite(m)) continue;
      out.push({ b: +h.whole.begin, e: Math.min(BARS, +h.whole.end), m });
    }
  } catch {
    out = [];
  }
  if (cache.size > 200) cache.clear();
  cache.set(key, out);
  return out;
}

let lo = null, hi = null, fade = 0;
// parts: [{ key, code: () => string, color, dim }]; x / w: the loop's span; cy: the band's middle;
// pos: where in the 4-bar loop the music is (0 to BARS), or null while nothing is moving yet
// (a jump into the stem song counting in): then no notes light up and the sweep is hidden
export function drawMidiBackdrop(g, { x: x0 = 0, w, h, cy, pos, on, parts, dark, ink, lite, dt }) {
  const lines = on ? parts.map((p) => ({ ...p, notes: notesOf(p.key, p.code) })).filter((p) => p.notes.length) : [];
  fade += ((lines.length ? 1 : 0) - fade) * Math.min(1, dt * 4);
  if (fade < 0.01 || !lines.length) return;

  // the pitch range eases toward what the parts span, so adding an orb doesn't make it jump
  let tLo = Infinity, tHi = -Infinity;
  for (const p of lines) for (const n of p.notes) (tLo = Math.min(tLo, n.m)), (tHi = Math.max(tHi, n.m));
  tLo -= 2;
  tHi += 2;
  lo = lo == null ? tLo : lo + (tLo - lo) * Math.min(1, dt * 3);
  hi = hi == null ? tHi : hi + (tHi - hi) * Math.min(1, dt * 3);
  const span = Math.max(12, hi - lo);
  const bandH = Math.min(h * 0.6, span * 9);
  const rowH = bandH / span;
  const top = cy - bandH / 2;
  const yAt = (m) => top + (hi - m) * rowH;

  g.save();
  const base = (dark ? 0.04 : 0.06) * fade;
  // each part sits a little above / below the others, so parts on the same notes don't cover each other
  const nudge = Math.max(2, rowH * 0.45);
  lines.forEach((p, i) => {
    const off = (i - (lines.length - 1) / 2) * nudge;
    const y = (m) => yAt(m) + off;
    g.fillStyle = p.color;
    // resting notes: dim, one path per part
    g.globalAlpha = base * p.dim;
    g.beginPath();
    const live = [];
    for (const n of p.notes) {
      const x = x0 + (n.b / BARS) * w, nw = Math.max(2, ((n.e - n.b) / BARS) * w - 2);
      g.rect(x, y(n.m) - rowH / 2, nw, Math.max(2, rowH - 1));
      if (pos != null && pos >= n.b && pos < n.e) live.push([x, y(n.m) - rowH / 2, nw, Math.max(2, rowH - 1)]);
    }
    g.fill();
    // what is sounding right now: a touch brighter with a small glow
    if (live.length) {
      g.globalAlpha = Math.min(1, base * 3.2) * p.dim;
      g.shadowColor = p.color;
      g.shadowBlur = lite ? 0 : 3;
      g.beginPath();
      for (const r of live) g.rect(...r);
      g.fill();
      g.shadowBlur = 0;
    }
  });
  // the 4-bar sweep
  if (pos == null) {
    g.restore();
    return;
  }
  const sx = x0 + (pos / BARS) * w;
  const grad = g.createLinearGradient(0, top - 40, 0, top + bandH + 40);
  grad.addColorStop(0, `rgba(${ink},0)`);
  grad.addColorStop(0.5, `rgba(${ink},${(dark ? 0.04 : 0.1) * fade})`);
  grad.addColorStop(1, `rgba(${ink},0)`);
  g.globalAlpha = 1;
  g.fillStyle = grad;
  g.fillRect(Math.round(sx), top - 40, 1, bandH + 80);
  g.restore();
}
