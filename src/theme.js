// Theme and palette for the orb page.
//
// Theme: dark or light, picked by hand with the ☀/☾ button and kept in localStorage 'orbTheme'
// (dark until picked). Palette: follows the key, so the colours match what you hear: a minor key
// (the default) is the neutral palette, a major key orb in the song (or being auditioned) turns it
// pastel. Both sit on <html> as data-theme / data-palette; orbs.css holds the page colours for each
// of the four pairs.
//
// Orb colours stay the catalogue's own hex values and are toned on the way to the screen: mixed
// toward grey (neutral) or white (pastel) by --orb-keep / --orb-mix. In CSS that is tone(), a
// color-mix() that follows the variables, so a palette change re-tones every orb on the page with
// no repaint from here. Canvases can't read CSS variables, so toneHex() does the same mix in JS.

const KEY = 'orbTheme';
const root = document.documentElement;

// [share of the orb's own colour, colour it is mixed toward], per theme · palette
const TONES = {
  'dark neutral': [58, '#8a8782'],
  'dark pastel': [60, '#ffffff'],
  'light neutral': [72, '#efe3e6'],
  'light pastel': [66, '#fff2f8'],
};
// what the canvases draw with (the same values as orbs.css): accent, text, faint ink
const INK = {
  'dark neutral': { acc: '#d6c6a5', fg: '#ece9e4', ink: '255,255,255' },
  'dark pastel': { acc: '#9fe3c9', fg: '#f6f1ff', ink: '255,255,255' },
  'light neutral': { acc: '#b4637a', fg: '#6e6a8e', ink: '87,82,121' },
  'light pastel': { acc: '#c04f8c', fg: '#6f5a8c', ink: '94,74,120' },
};

let saved = null;
try {
  saved = localStorage.getItem(KEY);
} catch {}
export let theme = saved === 'light' ? 'light' : 'dark';
export let palette = 'neutral';
const listeners = [];
export const onTheme = (f) => listeners.push(f);

const pair = () => `${theme} ${palette}`;
export const ink = () => INK[pair()];

function apply() {
  root.dataset.theme = theme;
  root.dataset.palette = palette;
  const [keep, mix] = TONES[pair()];
  root.style.setProperty('--orb-keep', keep + '%');
  root.style.setProperty('--orb-mix', mix);
  toneCache.clear();
  for (const f of listeners) f();
}

export function setTheme(t) {
  if (t === theme) return;
  theme = t;
  try {
    localStorage.setItem(KEY, t);
  } catch {}
  apply();
}
export function setPalette(p) {
  if (p === palette) return;
  palette = p;
  apply();
}

// a catalogue colour as CSS, toned by the current palette (and re-toned when it changes)
export const tone = (c) => `color-mix(in srgb, ${c} var(--orb-keep), var(--orb-mix))`;

// the same mix for canvases: '#rgb' / '#rrggbb' in, '#rrggbb' out (anything else passes through)
const toneCache = new Map();
const rgbOf = (hex) => {
  const h = hex.slice(1);
  const f = h.length === 3 ? [...h].map((x) => x + x) : h.length === 6 ? [h.slice(0, 2), h.slice(2, 4), h.slice(4, 6)] : null;
  return f && f.map((x) => parseInt(x, 16));
};
export function toneHex(c) {
  if (typeof c !== 'string' || c[0] !== '#') return c;
  let out = toneCache.get(c);
  if (out) return out;
  const a = rgbOf(c);
  if (!a || a.some(Number.isNaN)) return c;
  const [keep, mix] = TONES[pair()];
  const b = rgbOf(mix), k = keep / 100;
  out = '#' + a.map((v, i) => Math.round(v * k + b[i] * (1 - k)).toString(16).padStart(2, '0')).join('');
  toneCache.set(c, out);
  return out;
}

// the ☀/☾ button: shows the theme it switches to
export function mountThemeButton(btn, label) {
  const show = () => {
    btn.textContent = label(theme === 'dark' ? 'themeLight' : 'themeDark');
    btn.title = label('themeTip');
  };
  btn.addEventListener('click', () => setTheme(theme === 'dark' ? 'light' : 'dark'));
  onTheme(show);
  show();
  return show;
}

apply();
