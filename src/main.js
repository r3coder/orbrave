import {
  initStrudel, evaluate, hush, Pattern, samples, registerZZFXSounds,
  getAudioContext, getSuperdoughAudioController,
} from '@strudel/web';
import { generateSong, nextSeed, randomSeed, STYLE_NAMES } from './composer.js';
import { LANGS, getLang, setLang, t } from './i18n.js';
import { presetSong, presetColors } from './orbPreset.js';
import { listPresets, getPreset, weightedPick, weightedOrder } from './presetApi.js';
import { mountVote } from './vote.js';
import { loadSampleBanks, preloadSamples, preloadDrums } from './samples.js';
import { mountLicenses } from './licenses.js';
import { copyText } from './copyBox.js';

// Place a pattern at an absolute cycle window: shift it so its cycle 0 lands on `a`,
// and drop every event outside [a, a+len). Generated songs use this for every line.
Pattern.prototype.sect = function (a, len) {
  return this.late(a).filterWhen((t) => t >= a && t < a + len);
};

const $ = (id) => document.getElementById(id);
const ui = {
  title: $('title'), meta: $('meta'), timeline: $('timeline'),
  play: $('play'), prev: $('prev'), skip: $('skip'), share: $('share'),
  download: $('download'), drawer: $('drawer'), code: $('code'), history: $('history'),
  core: $('core'), ring: $('ring'), genres: $('genres'), langs: $('langs'),
};
// 👍 / 👎 beside the play button while a shared preset plays
const setVote = mountVote($('vote'));

const replReady = initStrudel({
  prebake: loadSampleBanks,
});

// Boot screen: hold the page until the sample maps are registered and every drum one-shot is
// decoded, so the first bars of a song never drop hits while files are still downloading.
const bootBar = $('bootBar'), bootCount = $('bootCount');
const soundsReady = Promise.all([
  replReady,
  preloadDrums((n, total) => {
    bootBar.style.width = `${(100 * n) / total}%`;
    bootCount.textContent = `${n} / ${total}`;
  }),
])
  .catch((e) => console.warn('preload failed, starting anyway', e))
  .finally(() => document.body.classList.add('booted'));

let repl;
if (import.meta.env.DEV) window.__algorave = { replReady, generateSong, startAt: (...a) => startAt(...a), state: () => ({ current, upcoming }) };
let playing = false;
let current = null; // song now playing
let upcoming = null; // song queued right after it
const played = []; // song refs ({seed, style} or {preset}) for the previous-song button
const selected = new Set(); // genres picked from the floating labels (empty = any, generated songs only)
let lastSectionKey = '';

// ---------- audio chain: master -> limiter -> volume -> speakers (+ analyser) ----------

let analyser, volume;
let volValue = 0.8;
try {
  const v = parseFloat(localStorage.getItem('volume'));
  if (v >= 0 && v <= 1) volValue = v;
} catch {}
const volGain = () => volValue * volValue * 1.25;

function setupMaster() {
  if (analyser) return;
  const ac = getAudioContext();
  const master = getSuperdoughAudioController().output.destinationGain;
  const limiter = new DynamicsCompressorNode(ac, { threshold: -8, knee: 6, ratio: 12, attack: 0.003, release: 0.25 });
  volume = new GainNode(ac, { gain: volGain() });
  analyser = new AnalyserNode(ac, { fftSize: 2048, smoothingTimeConstant: 0.8 });
  master.disconnect();
  master.connect(limiter).connect(volume);
  volume.connect(ac.destination);
  volume.connect(analyser);
}

const preload = (song) => preloadSamples(song.samples);
// wait for a song's other samples (piano, VCSL …) too, but never hang on a slow host
const PRELOAD_WAIT_MS = 8000;
const preloadWait = (song) => Promise.race([preload(song), new Promise((r) => setTimeout(r, PRELOAD_WAIT_MS))]);

// ---------- song flow ----------
// Songs come from user presets (made on the orb page, shared through the preset server) when
// the server has any; otherwise the composer generates them. A ref names a song:
// { seed, style } for a generated one, { preset } for a user preset.

const pool = () => [...selected];
const presetMode = () => presets.length > 0;
const refOf = (song) => (song.preset ? { preset: song.preset } : { seed: song.seed, style: song.style });
const keyOf = (ref) => (ref.preset ? `p:${ref.preset.id}` : `s:${ref.seed}`);
const hashOf = (song) => (song.preset ? `#preset.${song.preset.id}` : `#${song.id}.${song.style}`);
// well-liked presets come up more often (their weight from 👍 / 👎)
function randomPreset(except) {
  const list = presets.length > 1 ? presets.filter((p) => p.id !== except) : presets;
  return weightedPick(list);
}
// what plays after `song`: another user preset when there are any, else the next generated song
const nextRef = (song) => (presetMode() ? { preset: randomPreset(song.preset?.id) } : { seed: nextSeed(song.seed) });
const makeSong = (ref, at) => (ref.preset ? presetSong(ref.preset, at) : generateSong(ref.seed, at, ref.style ? [ref.style] : pool()));

// orb presets also play ZZFX synths and mridangam strokes; loaded the first time one comes up
let orbSounds;
const ensureOrbSounds = () => (orbSounds ??= Promise.resolve()
  .then(() => {
    registerZZFXSounds();
    return samples('https://raw.githubusercontent.com/felixroos/dough-samples/main/mridangam.json');
  })
  .catch((e) => console.warn('orb sounds unavailable', e)));

async function load(cur, nxt, { record = true } = {}) {
  if (cur.preset || nxt.preset) await ensureOrbSounds();
  // both songs live in one program; `.sect` keeps them apart in time
  await evaluate(cur.code + '\n\n' + nxt.code);
  current = cur;
  upcoming = nxt;
  preload(nxt);
  history.replaceState(null, '', hashOf(cur));
  if (record && (!played.length || keyOf(played.at(-1)) !== keyOf(refOf(cur)))) played.push(refOf(cur));
  addHistory(cur);
  renderSong();
}

async function startAt(ref, at, opts) {
  const cur = makeSong(ref, at);
  const nxt = makeSong(nextRef(cur), cur.end);
  await preloadWait(cur);
  repl.setCps(cur.cps);
  await load(cur, nxt, opts);
}

// the song a shared link names: #preset.<id> or #<seed>.<genre>
async function refFromHash() {
  const [id, arg] = location.hash.slice(1).split('.');
  if (id === 'preset' && arg) {
    const p = presets.find((x) => x.id === arg) ?? (await getPreset(arg));
    return p ? { preset: p } : null;
  }
  const seed = parseInt(id, 36);
  return Number.isFinite(seed) ? { seed: seed >>> 0, style: STYLE_NAMES.includes(arg) ? arg : null } : null;
}

async function play() {
  document.body.classList.add('loading');
  repl = await replReady;
  await soundsReady;
  await getAudioContext().resume();
  setupMaster();
  await presetsReady;
  const ref = (await refFromHash()) ?? (presetMode() ? { preset: randomPreset() } : { seed: randomSeed() });
  await startAt(ref, 0);
  playing = true;
  document.body.classList.remove('loading');
  document.body.classList.add('playing');
  setButtons();
}

function stop() {
  hush();
  playing = false;
  document.body.classList.remove('playing');
  setButtons();
  history.replaceState(null, '', location.pathname);
}

const nowCycle = () => repl.scheduler.now();
// next beat (quarter cycle) with a little headroom for the scheduler's lookahead
const soon = () => Math.ceil((nowCycle() + 0.1) * 4) / 4;

// Start a song one cycle from now.
async function jump(ref, opts) {
  if (!playing) return;
  await startAt(ref, soon(), opts);
}

// Re-place the current song so section `i` starts on the coming downbeat.
async function goToSection(i) {
  const target = playing && current.sections[i];
  if (!target) return;
  await startAt(refOf(current), soon() - (target.start - current.start), { record: false });
}

async function prevSong() {
  if (played.length < 2) return;
  played.pop();
  await jump(played.at(-1), { record: false });
}

// When the queued song has begun, make it current and queue another one behind it.
async function advance() {
  const cur = upcoming;
  let ref = nextRef(cur);
  for (let tries = 0; tries < 3; tries++) {
    try {
      await load(cur, makeSong(ref, cur.end));
      return;
    } catch (e) {
      console.error('song failed, rerolling', e);
      ref = { seed: randomSeed() };
    }
  }
}

let advancing = false;
setInterval(async () => {
  if (!playing || advancing || !upcoming) return;
  if (nowCycle() >= upcoming.start + 0.5) {
    advancing = true;
    await advance();
    advancing = false;
  }
}, 200);

// ---------- user presets ----------

let presetsLoaded = false;
let presets = []; // playable presets from the server, newest first
const sameIds = (a, b) => a.length === b.length && a.every((p, i) => p.id === b[i].id);
async function refreshPresets() {
  const list = await listPresets();
  if (presetsLoaded && sameIds(list, presets)) return;
  presetsLoaded = true;
  presets = list;
  renderFloaters();
  // a song queued from the old list (or a generated one when presets just arrived) is re-picked
  if (playing && upcoming && !advancing && !!upcoming.preset !== presetMode()) {
    await load(current, makeSong(nextRef(current), current.end), { record: false });
  }
}
const presetsReady = refreshPresets();
setInterval(refreshPresets, 3 * 60 * 1000); // new uploads show up without a reload

async function playPresetNow(p) {
  if (!playing) {
    location.hash = `preset.${p.id}`;
    return play();
  }
  await jump({ preset: p });
}

function setButtons() {
  for (const b of [ui.skip, ui.share]) b.disabled = !playing;
  ui.prev.disabled = !playing || played.length < 2;
  ui.download.disabled = !current || rendering;
  ui.play.setAttribute('aria-label', t(playing ? 'stop' : 'play'));
  setVote(playing ? current?.preset : null);
}

// ---------- floating labels: user presets, or genres when there are none ----------

const MAX_FLOATERS = 14;
let floaters = [];

function genreFloater(name) {
  const b = document.createElement('button');
  b.className = 'genre';
  b.textContent = name;
  b.classList.toggle('on', selected.has(name));
  // single click toggles the genre for upcoming songs; double click plays it right now.
  // The single-click action waits briefly so a double click doesn't toggle it twice.
  let pending;
  b.onclick = (e) => {
    clearTimeout(pending);
    if (e.detail > 1) return;
    pending = setTimeout(() => toggleGenre(name, b), 240);
  };
  b.ondblclick = () => {
    clearTimeout(pending);
    playGenreNow(name);
  };
  return b;
}

function presetFloater(p) {
  const b = document.createElement('button');
  b.className = 'genre preset';
  b.dataset.preset = p.id;
  const cols = presetColors(p);
  const dot = document.createElement('i');
  dot.style.background = cols.length > 1 ? `conic-gradient(${[...cols, cols[0]].join(', ')})` : cols[0] ?? 'var(--acc)';
  const name = document.createElement('span');
  name.textContent = p.name;
  b.append(dot, name);
  b.title = p.author ? `${p.name} · ${p.author}` : p.name;
  b.onclick = () => playPresetNow(p);
  return b;
}

// a few presets at a time (always including the one playing), shuffled
function renderFloaters() {
  let items;
  if (presetMode()) {
    const cur = current?.preset && presets.find((p) => p.id === current.preset.id);
    const others = weightedOrder(presets.filter((p) => p !== cur));
    items = [cur, ...others].filter(Boolean).slice(0, MAX_FLOATERS).map(presetFloater);
  } else items = STYLE_NAMES.map(genreFloater);
  ui.genres.replaceChildren(...items);
  floaters = items.map((el, i) => ({ el, zone: i % 2, x: NaN, y: NaN, heading: Math.random() * Math.PI * 2, speed: 9 + Math.random() * 9 }));
  markPlaying();
}

// the label of the preset that is playing lights up
function markPlaying() {
  if (!presetMode()) return;
  const id = playing && current?.preset?.id;
  for (const f of floaters) f.el.classList.toggle('on', f.el.dataset.preset === id);
}

async function toggleGenre(name, el) {
  selected.has(name) ? selected.delete(name) : selected.add(name);
  el.classList.toggle('on', selected.has(name));
  if (!playing || upcoming.preset) return;
  // re-roll only the queued song; the one playing stays as it is
  await load(current, generateSong(upcoming.seed, current.end, pool()), { record: false });
}

async function playGenreNow(name) {
  if (!playing) {
    location.hash = `${randomSeed().toString(36)}.${name}`;
    return play();
  }
  await jump({ seed: randomSeed(), style: name });
}

// The labels drift inside two free areas: left/right of the visualizer on wide screens,
// above/below it on narrow ones. Each one wanders with a slowly turning heading, bounces
// off its area's edges and keeps a little distance from its neighbours.
function labelZones() {
  const w = innerWidth, h = innerHeight;
  const core = ui.core.getBoundingClientRect();
  const cx = core.left + core.width / 2;
  const clearance = core.width / 2 + Math.min(w, h) * 0.24;
  if (cx - clearance - w * 0.03 >= 170) {
    const top = h * 0.17, bottom = h * 0.86;
    return [
      { x0: w * 0.03, x1: cx - clearance, y0: top, y1: bottom },
      { x0: cx + clearance, x1: w * 0.97, y0: top, y1: bottom },
    ];
  }
  const info = document.querySelector('.info').getBoundingClientRect();
  const lower = document.querySelector('.lower').getBoundingClientRect();
  return [
    { x0: 12, x1: w - 12, y0: info.bottom + 6, y1: core.top },
    { x0: 12, x1: w - 12, y0: core.bottom, y1: lower.top - 6 },
  ];
}

let zones = null, zonesKey = '', lastFloat = 0;

function floatLabels(time, bass) {
  const dt = Math.min(0.05, (time - lastFloat) / 1000 || 0);
  lastFloat = time;
  const key = `${innerWidth}x${innerHeight}`;
  if (key !== zonesKey) {
    zonesKey = key;
    zones = labelZones();
    for (const d of floaters) d.x = NaN; // re-scatter after a layout change
  }
  for (const d of floaters) {
    const z = zones[d.zone];
    const hw = d.el.offsetWidth / 2, hh = d.el.offsetHeight / 2;
    const [xa, xb, ya, yb] = [z.x0 + hw, Math.max(z.x0 + hw, z.x1 - hw), z.y0 + hh, Math.max(z.y0 + hh, z.y1 - hh)];
    if (Number.isNaN(d.x)) {
      d.x = xa + Math.random() * (xb - xa);
      d.y = ya + Math.random() * (yb - ya);
    }
    d.heading += (Math.random() - 0.5) * 1.2 * dt;
    let vx = Math.cos(d.heading) * d.speed, vy = Math.sin(d.heading) * d.speed;
    for (const o of floaters) {
      if (o === d || o.zone !== d.zone || Number.isNaN(o.x)) continue;
      const dx = d.x - o.x, dy = d.y - o.y, dist = Math.hypot(dx, dy) || 1;
      const min = (hw + o.el.offsetWidth / 2) * 0.9 + 12;
      if (dist < min) {
        vx += (dx / dist) * 30;
        vy += (dy / dist) * 30;
      }
    }
    d.x += vx * dt;
    d.y += vy * dt;
    if (d.x < xa || d.x > xb) d.heading = Math.PI - d.heading;
    if (d.y < ya || d.y > yb) d.heading = -d.heading;
    d.x = Math.min(xb, Math.max(xa, d.x));
    d.y = Math.min(yb, Math.max(ya, d.y));
    const s = 1 + (d.el.classList.contains('on') ? bass * 0.25 : bass * 0.08);
    d.el.style.transform = `translate(${d.x - hw}px, ${d.y - hh}px) scale(${s})`;
  }
}

// ---------- volume ring ----------

const C = 120, R = 104, A0 = 135, SWEEP = 270, TICKS = 28;
const pt = (deg, r = R) => [C + r * Math.cos((deg * Math.PI) / 180), C + r * Math.sin((deg * Math.PI) / 180)];
const arc = (a0, a1) => {
  const [x0, y0] = pt(a0), [x1, y1] = pt(a1);
  return `M${x0} ${y0} A${R} ${R} 0 ${a1 - a0 > 180 ? 1 : 0} 1 ${x1} ${y1}`;
};
$('volTrack').setAttribute('d', arc(A0, A0 + SWEEP));
const ticks = Array.from({ length: TICKS }, (_, i) => {
  const a = A0 + (i / (TICKS - 1)) * SWEEP;
  const [x1, y1] = pt(a, 114), [x2, y2] = pt(a, 120);
  const l = document.createElementNS('http://www.w3.org/2000/svg', 'line');
  Object.entries({ x1, y1, x2, y2 }).forEach(([k, v]) => l.setAttribute(k, v));
  $('ticks').append(l);
  return l;
});

function setVolume(v) {
  volValue = Math.max(0, Math.min(1, v));
  const end = A0 + volValue * SWEEP;
  $('volArc').setAttribute('d', arc(A0, Math.max(end, A0 + 0.01)));
  const [kx, ky] = pt(end);
  $('volKnob').setAttribute('cx', kx);
  $('volKnob').setAttribute('cy', ky);
  ticks.forEach((l, i) => l.classList.toggle('lit', i / (TICKS - 1) <= volValue));
  ui.ring.setAttribute('aria-valuenow', Math.round(volValue * 100));
  ui.ring.setAttribute('aria-label', t('volume'));
  volume?.gain.setTargetAtTime(volGain(), volume.context.currentTime, 0.03);
  try {
    localStorage.setItem('volume', String(volValue));
  } catch {}
}

function volFromPointer(e) {
  const r = ui.ring.getBoundingClientRect();
  const x = ((e.clientX - r.left) / r.width) * 240 - C;
  const y = ((e.clientY - r.top) / r.height) * 240 - C;
  if (Math.hypot(x, y) < 70) return null;
  let rel = ((Math.atan2(y, x) * 180) / Math.PI - A0 + 720) % 360;
  if (rel > SWEEP) rel = rel > SWEEP + 45 ? 0 : SWEEP;
  return rel / SWEEP;
}
let dragging = false;
ui.ring.addEventListener('pointerdown', (e) => {
  const v = volFromPointer(e);
  if (v === null) return;
  dragging = true;
  ui.ring.setPointerCapture(e.pointerId);
  setVolume(v);
});
ui.ring.addEventListener('pointermove', (e) => {
  if (!dragging) return;
  const v = volFromPointer(e);
  // ignore jumps across the gap at the bottom of the ring
  if (v !== null && Math.abs(v - volValue) < 0.5) setVolume(v);
});
ui.ring.addEventListener('pointerup', () => (dragging = false));
ui.core.addEventListener('wheel', (e) => {
  e.preventDefault();
  setVolume(volValue - Math.sign(e.deltaY) * 0.04);
}, { passive: false });
ui.ring.addEventListener('keydown', (e) => {
  const d = { ArrowUp: 0.05, ArrowRight: 0.05, ArrowDown: -0.05, ArrowLeft: -0.05 }[e.key];
  if (d) {
    e.preventDefault();
    setVolume(volValue + d);
  }
});

// ---------- download (offline render in a hidden iframe, live playback keeps going) ----------

let renderFrame, frameReady, rendering = false, jobId = 0;
const jobs = new Map();
function renderer() {
  if (!frameReady) {
    renderFrame = document.createElement('iframe');
    renderFrame.src = 'render.html?orbs'; // ?orbs: also ZZFX synths + mridangam, for orb presets
    renderFrame.style.display = 'none';
    frameReady = new Promise((res) => (renderFrame.onload = res));
    document.body.append(renderFrame);
  }
  return frameReady;
}
addEventListener('message', (e) => {
  if (e.origin !== location.origin || e.data?.source !== 'algorave-render') return;
  const job = jobs.get(e.data.id);
  if (!job) return;
  if (e.data.type === 'progress') job.progress(e.data.value);
  else {
    jobs.delete(e.data.id);
    e.data.type === 'done' ? job.resolve(e.data.wav) : job.reject(new Error(e.data.message));
  }
});

async function download() {
  const song = current;
  const label = ui.download.querySelector('b');
  rendering = true;
  setButtons();
  label.textContent = t('rendering', { p: 0 });
  try {
    await renderer();
    const id = ++jobId;
    const wav = await new Promise((resolve, reject) => {
      jobs.set(id, { resolve, reject, progress: (p) => (label.textContent = t('rendering', { p: Math.round(p * 100) })) });
      renderFrame.contentWindow.postMessage(
        { type: 'render', id, code: song.code, start: song.start, end: song.end, cps: song.cps },
        location.origin,
      );
    });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([wav], { type: 'audio/wav' }));
    a.download = `${song.title} - ${song.style} ${song.bpm}bpm [${song.id}].wav`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 10000);
  } catch (e) {
    console.error('render failed', e);
  } finally {
    rendering = false;
    label.textContent = t('download');
    setButtons();
  }
}

// ---------- UI ----------

const esc = (s) => s.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]);

function renderSong() {
  ui.title.textContent = current.title;
  ui.meta.textContent = current.preset
    ? `orb preset${current.preset.author ? ` · ${current.preset.author}` : ''} · ${current.bpm} bpm · ${current.root}`
    : `${current.style} · ${current.bpm} bpm · ${current.root} ${current.scale}`;
  const total = current.end - current.start;
  ui.timeline.innerHTML = current.sections
    .map((s) => `<div class="seg" style="flex:${s.len / total}" title="${s.name}"><i></i><b>${s.name}</b></div>`)
    .join('');
  [...ui.timeline.children].forEach((seg, i) => (seg.onclick = () => goToSection(i)));
  ui.code.innerHTML =
    `<pre>${esc(current.header)}</pre>` + current.blocks.map((b) => `<pre>${esc(b.code)}</pre>`).join('');
  lastSectionKey = '';
  markPlaying();
  setButtons();
}

function updateProgress() {
  if (!playing || !current) return;
  const now = nowCycle();
  const segs = ui.timeline.children;
  const pres = ui.code.querySelectorAll('pre');
  current.sections.forEach((s, i) => {
    const p = Math.min(1, Math.max(0, (now - s.start) / s.len));
    const seg = segs[i];
    if (!seg) return;
    const on = p > 0 && p < 1;
    seg.classList.toggle('on', on);
    seg.classList.toggle('done', p >= 1);
    seg.firstChild.style.width = on ? `${p * 100}%` : '';
    pres[i + 1]?.classList.toggle('on', on);
    if (on && current.id + i !== lastSectionKey) {
      lastSectionKey = current.id + i;
      pres[i + 1]?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
  });
}

function addHistory(song) {
  if (ui.history.firstElementChild?.dataset.id === song.id) return;
  const li = document.createElement('li');
  li.dataset.id = song.id;
  li.innerHTML = `<a href="${hashOf(song)}">${esc(song.title)}</a> — ${song.style}, ${song.bpm} bpm`;
  li.querySelector('a').onclick = (e) => {
    e.preventDefault();
    jump(refOf(song));
  };
  ui.history.prepend(li);
  while (ui.history.children.length > 50) ui.history.lastChild.remove();
}

function applyLang() {
  document.querySelectorAll('[data-i18n]').forEach((el) => (el.textContent = t(el.dataset.i18n)));
  for (const [id, key] of [['prev', 'prev'], ['skip', 'next'], ['share', 'share'], ['download', 'download']]) {
    $(id).title = t(key);
    $(id).setAttribute('aria-label', t(key));
  }
  ui.langs.querySelectorAll('button').forEach((b) => b.classList.toggle('on', b.dataset.lang === getLang()));
  setVolume(volValue);
  setButtons();
  if (current) renderSong();
}
for (const [code, name] of Object.entries(LANGS)) {
  const b = document.createElement('button');
  b.dataset.lang = code;
  b.textContent = { ko: "KR", en: "EN", ja: "JP" }[code] ?? code.toUpperCase();
  b.title = name;
  b.onclick = () => {
    setLang(code);
    applyLang();
  };
  ui.langs.append(b);
}
mountLicenses($('licenseBtn'));
$('feedbackBtn').addEventListener('click', () => window.open('https://forms.gle/gvjXSkEM7W6ug6US9', '_blank', 'noopener'));
setLang(getLang());
applyLang();

ui.play.onclick = () => (playing ? stop() : play().catch((e) => console.error(e)));
ui.prev.onclick = prevSong;
ui.skip.onclick = () => jump(refOf(upcoming));
ui.download.onclick = download;
ui.share.onclick = async () => {
  const url = location.href.split('#')[0] + hashOf(current);
  if (!(await copyText(url))) return;
  const label = ui.share.querySelector('b');
  label.textContent = t('copied');
  setTimeout(() => (label.textContent = t('share')), 1500);
};
$('codeToggle').onclick = () => ui.drawer.classList.toggle('open');
$('codeClose').onclick = () => ui.drawer.classList.remove('open');

// ---------- visualizer ----------

const cv = $('viz');
const g = cv.getContext('2d');
const freq = new Uint8Array(1024);
const wave = new Uint8Array(2048);
let hue = 150;
function draw(time) {
  requestAnimationFrame(draw);
  const dpr = devicePixelRatio || 1;
  const w = (cv.width = innerWidth * dpr);
  const h = (cv.height = innerHeight * dpr);
  g.fillStyle = '#050508';
  g.fillRect(0, 0, w, h);
  updateProgress();

  let bass = 0;
  if (analyser) {
    analyser.getByteFrequencyData(freq);
    analyser.getByteTimeDomainData(wave);
    bass = freq.slice(1, 8).reduce((a, b) => a + b, 0) / (7 * 255);
  }
  floatLabels(time, bass);
  if (!analyser) return;
  hue = (hue + 0.15 + bass * 0.6) % 360;

  // centred on the play button, starting just outside the volume ring
  const core = ui.core.getBoundingClientRect();
  const cx = (core.left + core.width / 2) * dpr, cy = (core.top + core.height / 2) * dpr;
  const base = (core.width / 2 + 12 + bass * 14) * dpr;
  const reach = Math.min(w, h) * 0.3;
  const bars = 160;
  g.lineWidth = Math.max(2, (Math.PI * 2 * base) / bars - 2);
  for (let i = 0; i < bars; i++) {
    const v = freq[Math.floor(Math.pow(i / bars, 1.8) * freq.length * 0.7)] / 255;
    const a = (i / bars) * Math.PI * 2 - Math.PI / 2;
    const len = v * reach;
    g.strokeStyle = `hsla(${(hue + i * 1.2) % 360}, 100%, 60%, ${0.12 + v * 0.65})`;
    g.beginPath();
    g.moveTo(cx + Math.cos(a) * base, cy + Math.sin(a) * base);
    g.lineTo(cx + Math.cos(a) * (base + len), cy + Math.sin(a) * (base + len));
    g.stroke();
  }
  g.strokeStyle = `hsla(${(hue + 180) % 360}, 100%, 75%, 0.35)`;
  g.lineWidth = 1.5 * dpr;
  g.beginPath();
  for (let i = 0; i < wave.length; i++) {
    const a = (i / wave.length) * Math.PI * 2;
    const r = base * 1.15 + ((wave[i] - 128) / 128) * base * 0.4;
    const x = cx + Math.cos(a) * r, y = cy + Math.sin(a) * r;
    i ? g.lineTo(x, y) : g.moveTo(x, y);
  }
  g.closePath();
  g.stroke();
}
requestAnimationFrame(draw);
