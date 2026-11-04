// Low-spec mode for the orb page: drops the costly effects (canvas glow, pulsing CSS shadows,
// blurred swirls, retina-resolution canvases) so slow machines stay smooth. The sound is the same.
//
// The choice is kept in localStorage 'orbLite': '1' on, '0' off (picked by hand: never switched on
// automatically again), unset: watch the frame rate and switch on by itself when it stays low.

const KEY = 'orbLite';
let pref = null;
try {
  pref = localStorage.getItem(KEY);
} catch {}

export let lite = pref === '1';
const listeners = [];
export const onLite = (f) => listeners.push(f);

export function setLite(on, { auto = false } = {}) {
  lite = on;
  pref = on ? '1' : '0';
  document.body.classList.toggle('lite', on);
  try {
    localStorage.setItem(KEY, pref);
  } catch {}
  for (const f of listeners) f(on, auto);
}

// Frame-rate watch: the median frame time over each 2 s window, so a single hitch (loading
// samples, rendering a WAV) doesn't count; only a steady slowdown does. Two slow windows in a
// row (about 4 s under SLOW_FPS) switch to low-spec mode.
const WINDOW = 2000, SLOW_FPS = 35, SLOW_WINDOWS = 2, WARMUP = 5000;
const born = performance.now();
let t0 = 0, last = 0, slow = 0;
const deltas = [];

const reset = () => {
  t0 = last = 0;
  deltas.length = 0;
};
document.addEventListener('visibilitychange', reset);

export function watchFrame(ts) {
  if (lite || pref === '0' || document.hidden || ts - born < WARMUP) return reset();
  if (!t0) {
    t0 = last = ts;
    return;
  }
  const d = ts - last;
  last = ts;
  // a gap this long is the tab or the machine pausing, not rendering: start over
  if (d > 1000) return reset();
  deltas.push(d);
  if (ts - t0 < WINDOW) return;
  deltas.sort((a, b) => a - b);
  const fps = 1000 / deltas[deltas.length >> 1];
  t0 = ts;
  deltas.length = 0;
  slow = fps < SLOW_FPS ? slow + 1 : 0;
  if (slow >= SLOW_WINDOWS) setLite(true, { auto: true });
}

document.body.classList.toggle('lite', lite);
