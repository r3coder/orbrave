// Visuals: the waveform ring and the orbs orbiting the player.
// Split out of orbs.js; the files load in a chain (each imports the one before it first), so they run in the
// same order as the one file did. See orbs/state.js.
import { loopPos, updateSongCursor } from './stems.js';
import { getAnalyserById } from '@strudel/web';
import { rng, hash, setMode } from '../orbCatalog.js';
import { lite, watchFrame } from '../liteMode.js';
import { toneHex, ink, setPalette, theme as themeNow } from '../theme.js';
import { drawMidiBackdrop } from '../midiBackdrop.js';
import { isPhone } from '../phoneLayout.js';
import { $, S, active, seedOf, ui } from './state.js';
import { analyser, chanOf, ducked, keyMode, layers, nowCycle } from './audio.js';
import { strips, tint } from './list.js';
import { updateRain } from './field.js';
import { coreCenter } from './drag.js';
import { drawRoll } from './slots.js';

// ---------- visuals: waveform ring + atom orbits ----------

const canvas = $('viz');
const g = canvas.getContext('2d');
let buf;
let lastTs = performance.now();
function frame(ts) {
  requestAnimationFrame(frame);
  watchFrame(ts);
  setPalette(keyMode() === 'major' ? 'pastel' : 'neutral');
  const dt = Math.min(0.1, (ts - lastTs) / 1000);
  lastTs = ts;
  // low-spec mode draws the full-screen canvas at 1x: at 2x / 3x scaling that is 4-9x fewer pixels
  const dpr = lite ? 1 : window.devicePixelRatio || 1;
  const w = innerWidth, h = innerHeight;
  // rounded: at 125% / 150% scaling w * dpr is fractional and would never match, resizing every frame
  if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
  }
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  g.clearRect(0, 0, w, h);

  const c = coreCenter();
  drawBackdrop(c, dt, w, h);
  let level = 0;
  if (analyser && S.playing) {
    buf ??= new Float32Array(analyser.fftSize);
    analyser.getFloatTimeDomainData(buf);
    for (const v of buf) level = Math.max(level, Math.abs(v));
    const colors = layers().flatMap((l) => l.colors?.map(toneHex) ?? [toneHex(tint(l))]);
    const grad = g.createConicGradient(ts / 3000, c.x, c.y);
    (colors.length ? colors : [ink().acc]).concat(colors[0] ?? ink().acc).forEach((col, i, arr) => grad.addColorStop(i / (arr.length - 1), col));
    g.strokeStyle = grad;
    g.lineWidth = 2;
    g.shadowBlur = lite ? 0 : 18;
    g.shadowColor = colors[0] ?? ink().acc;
    g.beginPath();
    // kept in the gap between the play button and the EQ bars (which start 40px out, see drawEq)
    const n = 256, step = Math.floor(buf.length / n);
    const r0 = ui.core.getBoundingClientRect().width / 2 + 20;
    for (let i = 0; i <= n; i++) {
      const a = (i / n) * Math.PI * 2;
      const r = r0 + Math.max(-16, Math.min(16, buf[(i % n) * step] * 24));
      const x = c.x + Math.cos(a) * r, y = c.y + Math.sin(a) * r;
      i ? g.lineTo(x, y) : g.moveTo(x, y);
    }
    g.stroke();
    g.shadowBlur = 0;
  }

  // electrons: each orb on its own tilted ellipse around the play button, behind it on the far side
  const sats = [...active.values()];
  const cr = ui.core.getBoundingClientRect();
  const now = S.repl && S.playing ? nowCycle() : 0;
  sats.forEach((a, i) => {
    const tilt = (i / sats.length) * Math.PI + 0.35;
    const rx = cr.width / 2 + 26 + (i % 3) * 12 + level * 10, ry = rx * 0.32;
    const dir = i % 2 ? -1 : 1;
    const ang = (dir * ts) / (900 + (i % 4) * 260) + i * 1.7;
    const lx = Math.cos(ang) * rx, ly = Math.sin(ang) * ry;
    const x = lx * Math.cos(tilt) - ly * Math.sin(tilt), y = lx * Math.sin(tilt) + ly * Math.cos(tilt);
    const depth = Math.sin(ang);
    const soloed = S.solo === a.layer.id;
    const dim = (S.playing && now < a.at) || (!!a.layer.code && ducked(a.layer) < 1) || (S.solo && !soloed);
    a.sat.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) scale(${((0.8 + depth * 0.25) * (soloed ? 1.5 : 1)).toFixed(3)})`;
    // restacking costs more than moving: only when the orb actually passes behind / in front
    const z = depth > 0 ? 3 : 1;
    if (a.z !== z) a.sat.style.zIndex = a.z = z;
    a.sat.style.opacity = (dim ? 0.3 : 0.7 + depth * 0.3).toFixed(2);
    g.save();
    g.strokeStyle = toneHex(tint(a.layer));
    g.globalAlpha = soloed ? 0.6 : S.solo ? 0.06 : 0.16;
    g.lineWidth = soloed ? 1.5 : 1;
    g.beginPath();
    g.ellipse(c.x, c.y, rx, ry, tilt, 0, Math.PI * 2);
    g.stroke();
    g.restore();
  });

  drawEq(c, cr, ts);
  updateRain(dt, ts);
  drawRoll();
  updateSongCursor();
}

const rightPane = $('right');
const presetPane = $('presetbar');

// desktop: drag the preset sidebar's right edge (the line between it and the player) to show its
// tiles in 1, 2 or 3 columns; the choice is kept per browser
{
  const PB_COLS_KEY = 'orbPresetCols';
  const setCols = (n) => {
    n = Math.max(1, Math.min(3, n | 0 || 1));
    document.documentElement.style.setProperty('--pb-cols', n);
    presetPane.classList.toggle('wide', n > 1);
    return n;
  };
  let cols = 1;
  try { cols = setCols(+localStorage.getItem(PB_COLS_KEY)); } catch {}
  const grip = document.createElement('div');
  grip.className = 'pb-resize';
  presetPane.append(grip);
  grip.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    e.preventDefault();
    grip.setPointerCapture(e.pointerId);
    document.body.classList.add('pb-resizing');
    const left = presetPane.getBoundingClientRect().left;
    const move = (ev) => {
      const n = Math.max(1, Math.min(3, Math.round((ev.clientX - left - 6) / 86)));
      if (n !== cols) cols = setCols(n);
    };
    const up = () => {
      document.body.classList.remove('pb-resizing');
      grip.removeEventListener('pointermove', move);
      grip.removeEventListener('pointerup', up);
      grip.removeEventListener('pointercancel', up);
      try { localStorage.setItem(PB_COLS_KEY, cols); } catch {}
    };
    grip.addEventListener('pointermove', move);
    grip.addEventListener('pointerup', up);
    grip.addEventListener('pointercancel', up);
  });
}
// the dark piano roll behind the page on wide screens (midiBackdrop.js): the loop of every pitched
// orb on the player, as it plays (no hover previews, no waiting variations, no auditioned key)
function drawBackdrop(c, dt, w, h) {
  const on = !isPhone.matches && S.playing && !!S.repl;
  const now = on ? nowCycle() : 0;
  const mode = layers().find((l) => l.cat === 'mode')?.mode ?? 'minor';
  const parts = !on ? [] : [...active.values()]
    .filter(({ layer: l, at }) => l.code && (l.voice?.root || l.pitched) && now >= at)
    .map(({ layer: l }) => {
      const seed = seedOf(l);
      return {
        key: `${l.id}|${seed}|${mode}|${l.raw ? l.raw.join() : ''}`,
        code: () => {
          setMode(mode);
          const code = typeof l.code === 'function' ? l.code(rng(hash(l.base ?? l.id) + seed * 7919)) : l.code;
          return mode === 'minor' ? code : code.replaceAll(':minor"', `:${mode}"`);
        },
        color: toneHex(tint(l)),
        dim: 1,
      };
    });
  // the loop spans the page between the preset bar and the orb field
  const x0 = presetPane.getBoundingClientRect().right;
  const x1 = rightPane.getBoundingClientRect().left;
  const wide = x1 - x0 > 200;
  // the sweep follows the song's own 4-bar blocks, and stays away while a jump counts in
  const pos = on ? loopPos(now) : 0;
  drawMidiBackdrop(g, { x: wide ? x0 : 0, w: wide ? x1 - x0 : w, h, cy: c.y, pos, on, parts, dark: themeNow === 'dark', ink: ink().ink, lite, dt });
}

// Equaliser: every sounding orb has its own analyser channel. Around the player each channel
// gets an arc of spectrum bars in its colour; in the list under the player, each orb swells
// with its channel's loudness (fast up, slower down) and glows brighter.
const EQ_BANDS = 12;
const fftBuf = new Uint8Array(512);
const pulse = new Map(); // orb id -> smoothed level 0..1
function bandsOf(id) {
  const an = getAnalyserById(chanOf(id), 1024);
  an.getByteFrequencyData(fftBuf);
  const out = [];
  for (let b = 0; b < EQ_BANDS; b++) {
    // log-spaced bins up to ~10 kHz
    const lo = Math.floor(2 ** ((b / EQ_BANDS) * 8)), hi = Math.max(lo + 1, Math.floor(2 ** (((b + 1) / EQ_BANDS) * 8)));
    let m = 0;
    for (let k = lo; k < hi && k < fftBuf.length; k++) m = Math.max(m, fftBuf[k]);
    out.push(m / 255);
  }
  return out;
}
function drawEq(c, cr, ts) {
  if (!S.started || !S.playing) return;
  const sounding = layers().filter((l) => l.code);
  if (!sounding.length) return;
  const inner = cr.width / 2 + 40;
  const span = (Math.PI * 2) / sounding.length;
  sounding.forEach((l, i) => {
    const bands = bandsOf(l.id);
    const col = toneHex(tint(l));
    const dim = S.solo && S.solo !== l.id ? 0.25 : 1;
    // the arc of bars around the player. Bars are grouped into a few brightness steps and each
    // group is one path, so a glowing orb costs a handful of shadowed strokes instead of 12.
    g.save();
    g.strokeStyle = col;
    g.shadowColor = col;
    g.shadowBlur = lite ? 0 : 10;
    g.lineCap = 'round';
    g.lineWidth = Math.max(2, ((span * inner) / EQ_BANDS) * 0.45);
    for (let k = 0; k < EQ_STEPS; k++) eqPaths[k].length = 0;
    bands.forEach((v, b) => eqPaths[Math.min(EQ_STEPS - 1, Math.floor(v * EQ_STEPS))].push(b));
    eqPaths.forEach((group, k) => {
      if (!group.length) return;
      g.globalAlpha = (0.35 + ((k + 0.5) / EQ_STEPS) * 0.65) * dim;
      g.beginPath();
      for (const b of group) {
        const a = ts / 9000 + i * span + ((b + 0.5) / EQ_BANDS) * span * 0.86;
        const len = 3 + bands[b] * 46;
        const cos = Math.cos(a), sin = Math.sin(a);
        g.moveTo(c.x + cos * inner, c.y + sin * inner);
        g.lineTo(c.x + cos * (inner + len), c.y + sin * (inner + len));
      }
      g.stroke();
    });
    g.restore();
    // the strip's orb swells with the channel
    const ball = strips.get(l.id);
    if (!ball) return;
    const now = Math.max(...bands);
    const prev = pulse.get(l.id) ?? 0;
    const lvl = now > prev ? prev + (now - prev) * 0.6 : prev * 0.88;
    pulse.set(l.id, lvl);
    const scale = `scale(${(1 + lvl * 0.45).toFixed(2)})`;
    if (ball.style.transform !== scale) ball.style.transform = scale;
    // a changing shadow repaints the orb every frame: low-spec mode keeps the CSS one
    const glow = lite ? '' : `0 0 ${Math.round(8 + lvl * 26)}px ${col}`;
    if (ball.dataset.glow !== glow) {
      ball.dataset.glow = glow;
      ball.style.boxShadow = glow;
    }
  });
}
const EQ_STEPS = 4;
const eqPaths = Array.from({ length: EQ_STEPS }, () => []);

export { fftBuf, frame };
