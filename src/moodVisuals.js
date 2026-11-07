// Mood visuals: a mood orb changes how the whole song sounds, so it changes how the whole player
// looks. Each effect in a mood's code gets a visual twin, read from the code itself, so a generated
// mood that stacks two effects shows both:
//   every mood     the mood's three colours drift around the player as a soft glow (tint)
//   lpf (low)      muffled: the canvas blurs and loses colour, bubbles rise (dull; lpf(sine) breathes)
//   hpf (high)     thin: sharper and brighter, thinner rings (thin)
//   room           wide: the edges darken like a cave, rings spread further and last longer (wet)
//   delay          echo: every hit ring repeats a few times, fainter each time (echo)
//   crush          8-bit: the canvas is drawn at a lower resolution, pixelated (crush)
//   coarse / shape broken: scanlines, and the picture tears for a moment on hits (grit)
//   pan / swing    spinning: rings appear on a side that swings left and right, the glow turns faster (swirl)
//   jux            mirror: each ring also appears mirrored across the player (mirror)
//   degradeBy      holes: some hits drop no ring at all (holes)
//   duck           balance: the parts turned down fade on screen too (the caller dims them)
//   EQ moods       the EQ bars around the player: low / high bands longer or shorter (eqLow / eqHigh)
// Self-contained: the orb page's frame loop and tools/mood-demo.html both drive it.
import { fxStrength } from './orbPreset.js';

const KEYS = ['tint', 'dull', 'breathe', 'thin', 'wet', 'echo', 'echoFb', 'crush', 'grit', 'swirl', 'swirlSpeed', 'mirror', 'holes', 'eqLow', 'eqHigh'];
const clamp = (v, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, v));
const arg = (fx, name) => {
  const m = new RegExp(`\\.${name}\\(\\s*([-\\d.]+)`).exec(fx);
  return m ? +m[1] : null;
};

// what the moods in the song ask for: orbs = the mood orbs that apply, stepOf = an orb's strength step
export function readMood(orbs, stepOf = () => 0) {
  const t = Object.fromEntries(KEYS.map((k) => [k, 0]));
  t.colors = [];
  t.swirlSpeed = 1;
  for (const o of orbs) {
    const k = clamp(fxStrength(stepOf(o) | 0), 0.3, 2);
    const fx = o.fx ?? '';
    t.tint = Math.max(t.tint, clamp(0.7 + k * 0.3, 0, 1.3));
    t.colors.push(...(o.colors ?? [o.color]).filter(Boolean));
    const lp = arg(fx, 'lpf'), lpq = arg(fx, 'lpq'), hp = arg(fx, 'hpf'), hpq = arg(fx, 'hpq');
    if (o.eq) {
      // EQ moods: a resonant filter is a boost of that end, a plain one a cut
      if (hp != null) t.eqLow += (hpq ? 0.7 : -0.6) * k;
      if (lp != null) t.eqHigh += (lpq ? 0.7 : -0.6) * k;
      if (/\.bpf\(/.test(fx)) (t.eqLow -= 0.6 * k), (t.eqHigh -= 0.6 * k);
      if (lp != null && !lpq) t.dull += clamp((4000 - lp) / 6000) * k;
      continue;
    }
    if (/\.lpf\(\s*sine/.test(fx)) t.breathe += 0.8 * k;
    else if (lp != null) t.dull += clamp((4000 - lp) / 3400) * k;
    if (hp != null) t.thin += clamp((hp - 100) / 800) * k;
    const room = arg(fx, 'room');
    if (room != null) t.wet += room * k;
    const delay = arg(fx, 'delay');
    if (delay != null) {
      t.echo += clamp(delay * 1.8) * k;
      t.echoFb = Math.max(t.echoFb, arg(fx, 'delayfeedback') ?? 0.5);
    }
    const bits = arg(fx, 'crush');
    if (bits != null) t.crush += clamp((9 - bits) / 6) * k;
    const coarse = arg(fx, 'coarse'), shape = arg(fx, 'shape');
    if (coarse != null) t.grit += clamp(coarse / 6) * k;
    if (shape != null) t.grit += clamp(shape * 1.2) * k;
    const pan = /\.pan\(\s*sine\.fast\(\s*([\d.]+)/.exec(fx);
    if (pan) (t.swirl += k), (t.swirlSpeed = Math.max(t.swirlSpeed, +pan[1]));
    if (/\.swingBy\(/.test(fx)) t.swirl += 0.35 * k;
    if (/\.jux\(/.test(fx)) t.mirror += k;
    const deg = arg(fx, 'degradeBy');
    if (deg != null) t.holes += deg * k;
  }
  for (const key of KEYS) if (key !== 'swirlSpeed') t[key] = clamp(t[key], key.startsWith('eq') ? -1.2 : 0, 1.5);
  return t;
}

// the look eases toward the target over about a second, so throwing a mood in fades it in
export function createMood() {
  const m = Object.fromEntries(KEYS.map((k) => [k, 0]));
  m.swirlSpeed = 1;
  m.washes = []; // [{ colors, a, on }]: colour sets fading in / out
  m.bubbles = [];
  m.glitch = 0;
  m.phase = 0;
  return m;
}
export function easeMood(m, t, dt) {
  const f = Math.min(1, dt * 2.2);
  for (const k of KEYS) m[k] += (t[k] - m[k]) * f;
  m.phase += dt * (0.12 + m.swirl * 0.5 * m.swirlSpeed);
  const key = t.colors.join();
  let cur = m.washes.find((w) => w.key === key);
  if (!cur && t.colors.length) m.washes.push((cur = { key, colors: t.colors, a: 0 }));
  for (const w of m.washes) w.a += ((w === cur ? t.tint : 0) - w.a) * f;
  m.washes = m.washes.filter((w) => w === cur || w.a > 0.01);
  m.glitch = Math.max(0, m.glitch - dt);
  return m;
}

// the resolution factor for the canvas (crush draws it coarser) - 1 when nothing asks. In steps,
// so the canvas isn't reallocated every frame while the mood fades in
export const pixelScale = (m) => (m.crush > 0.06 ? clamp(Math.round((1 - m.crush * 1.1) * 8) / 8, 0.25, 1) : 1);

// CSS on the canvas element: blur / colour for muffled, sharp / bright for thin, pixelated for crush
export function styleCanvas(canvas, m, lite, ts) {
  const blur = lite ? 0 : m.dull * 1.3 + m.breathe * (0.3 + 0.3 * Math.sin(ts / 700));
  const parts = [];
  if (blur > 0.05) parts.push(`blur(${blur.toFixed(1)}px)`);
  const sat = 1 - m.dull * 0.35 + m.crush * 0.25;
  if (Math.abs(sat - 1) > 0.02) parts.push(`saturate(${sat.toFixed(2)})`);
  if (m.thin > 0.03) parts.push(`contrast(${(1 + m.thin * 0.35).toFixed(2)}) brightness(${(1 + m.thin * 0.2).toFixed(2)})`);
  const filter = parts.join(' ');
  if (canvas.dataset.moodFilter !== filter) {
    canvas.dataset.moodFilter = filter;
    canvas.style.filter = filter;
  }
  const px = pixelScale(m) < 1 ? 'pixelated' : '';
  if (canvas.style.imageRendering !== px) canvas.style.imageRendering = px;
}

// behind everything: the mood's colours drifting round the player, and (muffled) rising bubbles
export function drawMoodUnder(g, m, { cx, cy, w, h, dt, lite }) {
  const R = Math.max(w, h) * 0.55;
  g.save();
  for (const wash of m.washes) {
    if (wash.a < 0.01) continue;
    wash.colors.slice(0, 3).forEach((col, i) => {
      const a = m.phase + (i * Math.PI * 2) / 3;
      const x = cx + Math.cos(a) * R * 0.32, y = cy + Math.sin(a) * R * 0.22;
      const grad = g.createRadialGradient(x, y, 0, x, y, R * 0.8);
      grad.addColorStop(0, col);
      grad.addColorStop(1, 'transparent');
      g.globalAlpha = 0.22 * wash.a;
      g.fillStyle = grad;
      g.fillRect(0, 0, w, h);
    });
  }
  // bubbles
  const want = lite ? 0 : m.dull + m.breathe * 0.5;
  if (want > 0.05 && Math.random() < dt * 14 * want) {
    const ang = Math.random() * Math.PI * 2, d = Math.sqrt(Math.random()) * Math.min(w, h) * 0.42;
    m.bubbles.push({ x: cx + Math.cos(ang) * d, y: cy + Math.sin(ang) * d + 60, r: 2 + Math.random() * 6, v: 25 + Math.random() * 40, t: 0, life: 2 + Math.random() * 2, s: Math.random() * 6 });
  }
  const col = m.washes.at(-1)?.colors[2] ?? '#9fd';
  g.strokeStyle = col;
  g.lineWidth = 1;
  m.bubbles = m.bubbles.filter((b) => (b.t += dt) < b.life);
  for (const b of m.bubbles) {
    const k = b.t / b.life;
    g.globalAlpha = 0.45 * Math.min(1, want) * Math.sin(k * Math.PI);
    g.beginPath();
    g.arc(b.x + Math.sin(b.s + b.t * 2.5) * 6, b.y - b.v * b.t, b.r, 0, Math.PI * 2);
    g.stroke();
  }
  g.restore();
}

// on top of the canvas: cave edges (wide), scanlines and tearing (broken)
export function drawMoodOver(g, m, { canvas, cx, cy, w, h, lite }) {
  g.save();
  if (m.wet > 0.03) {
    const grad = g.createRadialGradient(cx, cy, Math.min(w, h) * 0.22, cx, cy, Math.max(w, h) * 0.75);
    grad.addColorStop(0, 'transparent');
    grad.addColorStop(1, '#000');
    g.globalAlpha = clamp(m.wet * 0.55, 0, 0.75);
    g.fillStyle = grad;
    g.fillRect(0, 0, w, h);
  }
  if (m.grit > 0.03) {
    g.globalAlpha = clamp(m.grit * 0.11, 0, 0.15);
    g.fillStyle = '#000';
    for (let y = 0; y < h; y += 4) g.fillRect(0, y, w, 2);
  }
  if (m.glitch > 0 && !lite) {
    // a few horizontal slices of the picture pushed sideways, screened over
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.globalCompositeOperation = 'screen';
    g.globalAlpha = 0.35;
    const H = canvas.height, W = canvas.width;
    for (let i = 0; i < 6; i++) {
      const sh = Math.max(2, (H * (0.02 + Math.random() * 0.06)) | 0), sy = (Math.random() * (H - sh)) | 0;
      const dx = ((Math.random() - 0.5) * W * 0.02) | 0;
      g.drawImage(canvas, 0, sy, W, sh, dx, sy, W, sh);
    }
  }
  g.restore();
}

// a hit landed: a broken / 8-bit mood tears the picture on the loud ones
export function moodHit(m, role) {
  if ((m.grit > 0.15 || m.crush > 0.3) && (role === 'kick' || role === 'snare') && Math.random() < 0.18 + m.grit * 0.2) m.glitch = 0.09;
}

// the EQ bars: band b of n, how much longer (> 1) or shorter its bar is under EQ moods
export function eqBandGain(m, b, n) {
  const x = b / (n - 1); // 0 low .. 1 high
  const low = clamp(1 - x * 2.5), high = clamp((x - 0.55) * 2.2);
  return Math.max(0.15, 1 + m.eqLow * low * 0.9 + m.eqHigh * high * 0.9);
}
