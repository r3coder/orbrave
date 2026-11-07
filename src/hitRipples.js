// Hit ripples: the drums and effects (kick, snare, hat, perc, fx, texture) have no notes for the
// piano-roll backdrop, so each of their hits drops a ring behind everything instead, at a random
// spot around the play button, that spreads out and fades. Self-contained like midiBackdrop.js:
// the frame loop calls drawHitRipples() with the sounding parts and where in the loop it is.
// A mood (moodVisuals.js) bends them: echoes, wider / longer rings, mirrored, swinging, dropped.
import { transpiler } from '@strudel/web';
import { BARS } from './orbPreset.js';

// how big / long-lived a ring each part gets: the kick thumps wide, hats are small quick ticks
const FEEL = {
  kick: { r: 120, life: 1.1, w: 3 },
  snare: { r: 95, life: 0.9, w: 2.5 },
  hat: { r: 45, life: 0.5, w: 1.5 },
  perc: { r: 65, life: 0.7, w: 2 },
  fx: { r: 160, life: 1.6, w: 2 },
  texture: { r: 140, life: 1.8, w: 1.5 },
};
export const RIPPLE_ROLES = new Set(Object.keys(FEEL));

const cache = new Map(); // layer key -> [{ b, v }] (onset in cycles, loudness 0..1)
function hitsOf(key, code) {
  if (cache.has(key)) return cache.get(key);
  let out = [];
  try {
    const js = transpiler(code().replaceAll('__DT__', '0.3'), { emitMiniLocations: false, emitWidgets: false }).output;
    const pat = new Function(js)();
    for (const h of pat.queryArc(0, BARS)) {
      if (!h.hasOnset()) continue;
      const gain = Number(h.value?.gain ?? 1) * Number(h.value?.velocity ?? 1);
      if (!(gain > 0)) continue;
      out.push({ b: +h.whole.begin, v: Math.min(1, gain) });
    }
  } catch {
    out = [];
  }
  if (cache.size > 200) cache.clear();
  cache.set(key, out);
  return out;
}

const rings = [];
let last = null;
const MAX = 48;

// parts: [{ key, code: () => string, role, color, dim }] (or `hits` in place of code); pos: where in the 4-bar loop the music is
// (0 to BARS), or null while nothing is moving; cx / cy: the play button; inner / outer: the band
// around it rings may start in; box: [left, top, right, bottom] they keep away from the edges of
// mood: the eased look from moodVisuals.js (optional); onHit(role): called for every hit that lands
export function drawHitRipples(g, { parts, pos, cx, cy, inner, outer, box, dt, lite, mood = null, onHit = null }) {
  const env = { cx, cy, inner, outer, box, lite, mood, onHit };
  if (pos == null || !parts.length) last = null;
  else {
    // the hits the playhead passed since the last frame (a big jump - a hidden tab, a seek - spawns nothing)
    const from = last ?? pos;
    let span = pos - from;
    if (span < 0) span += BARS;
    if (span > 0 && span < 0.5) {
      for (const p of parts) {
        const feel = FEEL[p.role];
        for (const n of p.hits ?? hitsOf(p.key, p.code)) {
          let d = n.b - from;
          if (d <= 0) d += BARS;
          if (d > span) continue;
          spawn(feel, p, n.v, env);
        }
      }
    }
    last = pos;
  }

  for (let i = rings.length - 1; i >= 0; i--) {
    const r = rings[i];
    r.t += dt;
    r.x += r.vx * dt;
    if (r.t >= r.life) rings.splice(i, 1);
  }
  if (!rings.length) return;
  g.save();
  for (const r of rings) {
    if (r.t < 0) continue; // an echo still waiting for its turn
    const k = r.t / r.life;
    const ease = 1 - (1 - k) ** 3; // fast out, settling as it fades
    g.globalAlpha = r.a * (1 - k) ** 1.6;
    g.strokeStyle = r.color;
    g.lineWidth = r.w * (1 - k * 0.6);
    g.beginPath();
    g.arc(r.x, r.y, 4 + r.r * ease, 0, Math.PI * 2);
    g.stroke();
    // a soft fill only at the start, so the hit reads as a flash and then just the ring spreads
    if (k < 0.35) {
      g.globalAlpha = r.a * 0.18 * (1 - k / 0.35);
      g.fillStyle = r.color;
      g.fill();
    }
  }
  g.restore();
}

function spawn(feel, p, v, { cx, cy, inner, outer, box: [l, t, rt, b], lite, mood: m, onHit }) {
  onHit?.(p.role);
  if (m && m.holes > 0.02 && Math.random() < m.holes * 0.8) return;
  const ang = Math.random() * Math.PI * 2;
  const dist = inner + Math.sqrt(Math.random()) * Math.max(0, outer - inner);
  const pad = 30;
  let x = cx + Math.cos(ang) * dist;
  // spinning moods: rings gather on a side that swings left and right with the pan
  if (m && m.swirl > 0.02) x = cx + (x - cx) * (1 - m.swirl * 0.5) + Math.sin(m.phase * 6) * (outer - inner) * 0.6 * Math.min(1, m.swirl);
  const at = (px) => Math.max(l + pad, Math.min(rt - pad, px));
  const y = Math.max(t + pad, Math.min(b - pad, cy + Math.sin(ang) * dist));
  const size = (0.75 + Math.random() * 0.5) * (1 + (m?.wet ?? 0) * 0.45);
  const ring = {
    x: at(x), y, t: 0, color: p.color, vx: m ? Math.cos(m.phase * 6) * m.swirl * 40 : 0,
    r: feel.r * size, life: feel.life * (0.85 + Math.random() * 0.3) * (1 + (m?.wet ?? 0) * 0.8), w: feel.w * (1 - (m?.thin ?? 0) * 0.5),
    a: (0.3 + v * 0.4) * 0.7 * p.dim,
  };
  const out = [ring];
  if (m && m.mirror > 0.05) out.push({ ...ring, x: at(2 * cx - ring.x), vx: -ring.vx, a: ring.a * Math.min(1, m.mirror) });
  // echo moods: the same ring again a beat-ish later, fainter each time
  if (m && m.echo > 0.08) {
    const n = Math.round(1 + m.echo * 2 + m.echoFb * 1.5);
    for (const base of [...out]) {
      for (let i = 1; i <= n; i++) out.push({ ...base, t: -0.22 * i, r: base.r * (1 + i * 0.12), a: base.a * Math.min(1, m.echo) * (0.35 + m.echoFb * 0.5) ** i });
    }
  }
  const cap = lite ? MAX / 2 : MAX * (m && m.echo > 0.08 ? 2 : 1);
  rings.push(...out);
  if (rings.length > cap) rings.splice(0, rings.length - cap);
}
