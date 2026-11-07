// Audio: the Strudel REPL, master chain and volume dial, building the set's code and syncing it, adding and removing orbs.
// Split out of orbs.js; the files load in a chain (each imports the one before it first), so they run in the
// same order as the one file did. See orbs/state.js.
import { S, active, applyVar, drawnOf, drumsReady, gainOf, heldSeed, orbVars, ownSeed, replReady, seedOf, ui, volStep } from './state.js';
import { evaluate, hush, getAudioContext, getSuperdoughAudioController } from '@strudel/web';
import { preloadSamples } from '../samples.js';
import { BASE_BPM, rng, hash, byId, role, setMode, keyLabel } from '../orbCatalog.js';
import { BARS, sheetCode, songFx, duckOf, eqClash } from '../orbPreset.js';
import { editChain, editGain, editOf, kindOf, rootId } from '../orbEdit.js';
import * as taste from '../orbTaste.js';
import { countMove, tut } from './guide.js';
import { makeSat, renderStatus, setSolo } from './list.js';
import { STASH_MAX, fieldSize, makeOrbEl, rain, rainAdd, renderStash, stash, vanish } from './field.js';
import { coreCenter, goHome } from './drag.js';
import { editPreview, orbEditing } from './customOrbs.js';
import { previewLayer } from './slots.js';
import { checkVoteSet, saveSessionSoon } from './presets.js';
import { songLines } from './stems.js';

// ---------- audio ----------

// master -> limiter -> volume -> speakers; the visuals read the limiter so they don't fade with the volume
let analyser, volume;
const VOL_DEFAULT = 0.6;
let volValue = VOL_DEFAULT;
try {
  const v = parseFloat(localStorage.getItem('orbVolume'));
  if (v >= 0 && v <= 1) volValue = v;
} catch {}
const volGain = () => volValue * volValue * 1.25;
function setupMaster() {
  const ac = getAudioContext();
  const master = getSuperdoughAudioController().output.destinationGain;
  const limiter = new DynamicsCompressorNode(ac, { threshold: -8, knee: 6, ratio: 12, attack: 0.003, release: 0.25 });
  analyser = new AnalyserNode(ac, { fftSize: 2048, smoothingTimeConstant: 0.8 });
  volume = new GainNode(ac, { gain: volGain() });
  master.disconnect();
  master.connect(limiter).connect(volume).connect(ac.destination);
  limiter.connect(analyser);
}
// Volume dial around the play button, the same control as the player page: a 270° arc from
// bottom-left to bottom-right. Drag along it, scroll over the player, or use the arrow keys.
const volRing = document.getElementById('volRing');
const VC = 120, VR = 104, VA0 = 135, VSWEEP = 270, VTICKS = 28;
const vpt = (deg, r = VR) => [VC + r * Math.cos((deg * Math.PI) / 180), VC + r * Math.sin((deg * Math.PI) / 180)];
const varc = (a0, a1) => {
  const [x0, y0] = vpt(a0), [x1, y1] = vpt(a1);
  return `M${x0} ${y0} A${VR} ${VR} 0 ${a1 - a0 > 180 ? 1 : 0} 1 ${x1} ${y1}`;
};
document.getElementById('volTrack').setAttribute('d', varc(VA0, VA0 + VSWEEP));
document.getElementById('volHit').setAttribute('d', varc(VA0, VA0 + VSWEEP));
const volTicks = Array.from({ length: VTICKS }, (_, i) => {
  const a = VA0 + (i / (VTICKS - 1)) * VSWEEP;
  const [x1, y1] = vpt(a, 112), [x2, y2] = vpt(a, 118);
  const l = document.createElementNS('http://www.w3.org/2000/svg', 'line');
  Object.entries({ x1, y1, x2, y2 }).forEach(([k, v]) => l.setAttribute(k, v));
  document.getElementById('volTicks').append(l);
  return l;
});
// draws the dial only (the first-orb tip wiggles it without touching the sound)
function drawVolume(v) {
  const end = VA0 + v * VSWEEP;
  document.getElementById('volArc').setAttribute('d', varc(VA0, Math.max(end, VA0 + 0.01)));
  const [kx, ky] = vpt(end);
  const knob = document.getElementById('volKnob');
  knob.setAttribute('cx', kx);
  knob.setAttribute('cy', ky);
  volTicks.forEach((l, i) => l.classList.toggle('lit', i / (VTICKS - 1) <= v));
}
S.volDemo = 0; // rAF id while the dial is being wiggled
function setVolume(v) {
  cancelAnimationFrame(S.volDemo);
  S.volDemo = 0;
  document.body.classList.remove('vol-demo');
  volValue = Math.max(0, Math.min(1, v));
  drawVolume(volValue);
  volRing.setAttribute('aria-valuenow', Math.round(volValue * 100));
  volume?.gain.setTargetAtTime(volGain(), getAudioContext().currentTime, 0.03);
  try {
    localStorage.setItem('orbVolume', volValue);
  } catch {}
}
function volFromPointer(e) {
  const r = volRing.getBoundingClientRect();
  const x = ((e.clientX - r.left) / r.width) * 240 - VC;
  const y = ((e.clientY - r.top) / r.height) * 240 - VC;
  let rel = ((Math.atan2(y, x) * 180) / Math.PI - VA0 + 720) % 360;
  if (rel > VSWEEP) rel = rel > VSWEEP + 45 ? 0 : VSWEEP;
  return rel / VSWEEP;
}
// during the first-orb volume tip, everything but the dial dims for `ms` (a round hole whose huge
// shadow is the dimming; it takes no clicks, so the dial can be turned right away)
const volDim = document.createElement('div');
volDim.className = 'vol-dim';
document.body.append(volDim);
let volDimTimer = 0;
function volFocus(ms) {
  clearTimeout(volDimTimer);
  const r = volRing.getBoundingClientRect();
  const pad = 6;
  Object.assign(volDim.style, {
    left: `${r.left - pad}px`, top: `${r.top - pad}px`, width: `${r.width + pad * 2}px`, height: `${r.height + pad * 2}px`,
  });
  volDim.classList.add('on');
  volDimTimer = setTimeout(() => volDim.classList.remove('on'), ms);
}
let volDrag = false;
volRing.addEventListener('pointerdown', (e) => {
  e.stopPropagation();
  volDrag = true;
  volRing.classList.add('drag');
  volRing.setPointerCapture(e.pointerId);
  setVolume(volFromPointer(e));
});
volRing.addEventListener('pointermove', (e) => {
  if (!volDrag) return;
  const v = volFromPointer(e);
  if (Math.abs(v - volValue) < 0.5) setVolume(v); // no jump across the gap at the bottom
});
const volUp = () => {
  volDrag = false;
  volRing.classList.remove('drag');
};
volRing.addEventListener('pointerup', volUp);
volRing.addEventListener('pointercancel', volUp);
document.getElementById('core').addEventListener('wheel', (e) => {
  e.preventDefault();
  setVolume(volValue - Math.sign(e.deltaY) * 0.04);
}, { passive: false });
volRing.addEventListener('keydown', (e) => {
  const d = { ArrowUp: 0.05, ArrowRight: 0.05, ArrowDown: -0.05, ArrowLeft: -0.05 }[e.key];
  if (d) {
    e.preventDefault();
    setVolume(volValue + d);
  }
});
setVolume(volValue);

async function ensureStarted() {
  if (S.started) return;
  document.body.classList.add('loading');
  S.repl = await replReady;
  await drumsReady;
  await getAudioContext().resume();
  setupMaster();
  S.started = true;
  warm(layers());
  document.body.classList.remove('loading');
}

// The first click or key press anywhere unlocks the audio context (it has to happen inside a
// user gesture), so hovering an orb can preview it even before play was ever pressed.
const audioUnlocked = () => getAudioContext().state === 'running' || !!navigator.userActivation?.hasBeenActive;
const unlockAudio = () => {
  getAudioContext().resume().catch(() => {});
  removeEventListener('pointerdown', unlockAudio, true);
  removeEventListener('keydown', unlockAudio, true);
};
addEventListener('pointerdown', unlockAudio, true);
addEventListener('keydown', unlockAudio, true);

// Fetch an orb's samples ahead of its first hit, once audio is running: when it is hovered,
// grabbed or added. Requests go out a few at a time, since a burst of them gets refused by
// the sample host (pitched instruments are one file per key).
const warmed = new Set();
const warmQueue = [];
let warmTimer = null;
function warm(list) {
  if (!S.started) return;
  const names = list.flatMap((l) => (l?.combo ? l.combo.map((c) => byId[c]) : [l])).flatMap((l) => l?.samples ?? []).filter((n) => !warmed.has(n));
  names.forEach((n) => warmed.add(n));
  warmQueue.push(...names);
  warmTimer ??= setInterval(() => {
    const batch = warmQueue.splice(0, 4);
    if (batch.length) preloadSamples(batch);
    else warmTimer = clearInterval(warmTimer) ?? null;
  }, 300);
}

const nowCycle = () => S.repl.scheduler.now();
const layers = () => [...active.values()].map((a) => a.layer);
taste.setSong(layers);
taste.setFalling(() => rain.map((o) => o.id));
// The orb under the mouse in the field (or held) is auditioned on its own: the song goes quiet.
// While a held orb is over the player it is heard together with the song instead.
S.hover = null;
S.hoverMix = false;
// true while building the code for a WAV render: no hover previews, solo dips or bar gates
S.offline = false;
const hoverOrb = () => !S.offline && S.hover && byId[S.hover];
const hoverSounds = () => {
  const h = hoverOrb();
  return !h ? [] : h.combo ? h.combo.map((c) => byId[c]) : h.code ? [h] : [];
};
// tempo orbs stack: each one scales the tempo by its own ratio, so two slow orbs are slower still
const bpm = () => {
  const f = [...layers(), hoverOrb()].filter((l) => l?.bpm && !(l === hoverOrb() && active.has(l.id))).reduce((p, l) => (p * l.bpm) / BASE_BPM, 1);
  return Math.round(Math.min(220, Math.max(40, BASE_BPM * f)));
};
// Mood orbs stack: every one in the song applies, in the order they went in. EQ moods and the
// other moods share one count (capOf / CAPS: five in all; EQ orbs on the same range also bounce each other). An auditioned one is heard
// on top, as if it were thrown in (bouncing the oldest of its kind when full).
function fxOrbs() {
  const on = layers().filter((l) => l.cat === 'mood');
  const h = hoverOrb();
  if (h?.cat !== 'mood' || on.includes(h)) return on;
  const same = on.filter((l) => capOf(l) === capOf(h));
  const out = same.slice(0, Math.max(0, same.length - (CAPS[capOf(h)] ?? 1) + 1));
  return [...on.filter((l) => !out.includes(l) && !eqClash(l, h)), h];
}
// The key: A minor unless a key orb (in the song, or being auditioned) says otherwise. keyMode is
// major/minor; keyShift is how many semitones every pitched part moves away from A.
const keyOrb = () => (hoverOrb()?.cat === 'mode' ? hoverOrb() : layers().find((l) => l.cat === 'mode'));
const keyMode = () => keyOrb()?.mode ?? 'minor';
const keyShift = () => keyOrb()?.key ?? 0;
const keyText = (extra = 0) => keyLabel({ key: keyShift() + extra, mode: keyMode() });
// a line is pitched when it plays notes; drums and noise are left where they are
const pitchedCode = (l, code) => l.pitched || /\b(scale|chord|note)\(/.test(code);
// a balance mood turns whole roles down (drums, everything but the drums, the bass …): the factor
const ducked = (l) => duckOf(fxOrbs(), role(l), (o) => volStep(o.id));
// v: a seed, or a drawn variation ({ raw }), played on the orb's own instrument
const codeOf = (l, v) => {
  setMode(keyMode());
  // a copy (a second one of an orb on screen) or a custom orb (🎛 편집) plays its catalogue orb's notes: it hashes under that orb's id
  const code = v?.raw && l.voice ? sheetCode(v.raw, l.voice)
    : typeof l.code === 'function' ? l.code(rng(hash(rootId(l, byId)) + (typeof v === 'number' ? v : S.variation) * 7919)) : l.code;
  return keyMode() === 'minor' ? code : code.replaceAll(':minor"', `:${keyMode()}"`);
};

// Does the seed change this orb? Tempo, key and mood orbs, drawn parts and fixed patterns have no
// seed, so the stems and presets give them none.
const seededIds = new Map();
function seeded(l) {
  if (!l || l.raw || typeof l.code !== 'function') return false;
  if (!seededIds.has(l.id)) {
    const a = codeOf(l, 1);
    seededIds.set(l.id, [2, 3, 4, 5].some((v) => codeOf(l, v) !== a));
  }
  return seededIds.get(l.id);
}

// each orb gets its own analyser channel (1, 2, …) so the equaliser can draw it; numbers are reused
const chans = new Map();
function chanOf(id) {
  if (!chans.has(id)) {
    const taken = new Set(chans.values());
    let k = 1;
    while (taken.has(k)) k++;
    chans.set(id, k);
  }
  return chans.get(id);
}

// gain: a block's own strength in the stems (a factor, or a fade as Strudel code)
// analyse: a preview that still gets an analyser channel (the 🎛 편집 panel draws its spectrum)
function lineFor(l, v, extra = '', { preview = false, gain = null, analyse = false } = {}) {
  if (!l.code) return null;
  // hovering an orb in the song's list solos it
  const quiet = !(preview || S.offline) && S.solo && S.solo !== l.id && byId[S.solo]?.code;
  const code = codeOf(l, v);
  // a custom orb (🎛 편집): its knobs go right after its own line, so its own filters count as the
  // part's (EQ orbs leave them alone) and moods still go on top
  const ed = editOf(l, byId);
  const own = ed ? editChain(ed, kindOf(l, code, ed)) : '';
  // the orb's own volume (음량 slots, and a custom orb's own), times a balance mood's dip and the
  // solo dip; one postgain, since a second would replace the first
  const g = gainOf(l) * editGain(ed) * ducked(l) * (quiet ? 0.12 : 1) * (typeof gain === 'number' ? gain : 1);
  const post = typeof gain === 'string' ? `.postgain(${gain}.mul(${+g.toFixed(3)}))`
    : Math.abs(g - 1) < 0.005 ? '' : `.postgain(${+g.toFixed(3)})`;
  // fft(5): superdough sizes the analyser 2^(5+5) = 1024, the size the equaliser reads it at
  const chan = (preview && !analyse) || S.offline ? '' : `.analyze(${chanOf(l.id)}).fft(5)`;
  const key = keyShift() && pitchedCode(l, code) ? `.transpose(${keyShift()})` : '';
  // the EQ and mood orbs' effects, each at the strength the 약하게 / 세게 slots gave it
  const fx = songFx(fxOrbs(), code + own + extra, (o) => volStep(o.id));
  return `// ${preview ? '미리듣기: ' : ''}${l.name}\n$: ${code}${key}${own}${extra}${fx}${post}${chan}`;
}

function buildCode() {
  const dt = (((60 / bpm()) * 3) / 4).toFixed(3); // dotted-eighth delay in seconds
  const lines = [`setcpm(${bpm()}/4)`];
  // auditioning a sounding orb: it plays alone, unless it is held over the player
  // 🎛 편집 open: the orb being edited plays (alone, with 🎧 솔로) with the knobs as they are
  const ep = !S.offline && editPreview();
  const audition = !S.offline && ((hoverSounds().length > 0 && !S.hoverMix) || !!(ep && orbEditing.solo));
  if (ep) lines.push(lineFor(ep, drawnOf(byId[orbEditing.id]) ?? heldSeed.get(orbEditing.id) ?? S.variation, '', { preview: true, analyse: true }));
  for (const l of hoverSounds()) if (!active.has(l.id) && !(ep && orbEditing.solo)) lines.push(lineFor(l, drawnOf(l) ?? heldSeed.get(l.id) ?? S.variation, '', { preview: true }));
  for (const a of audition ? [] : active.values()) {
    const line = lineFor(a.layer, seedOf(a.layer));
    // each layer waits for the next bar; while a song is queued, the loop hands over at its start
    const gate = [a.at > 0 && !S.offline && `t >= ${a.at}`, S.song && `t < ${S.song.s0}`].filter(Boolean);
    if (line) lines.push(line + (gate.length ? `\n  .filterWhen((t) => ${gate.join(' && ')})` : ''));
  }
  if (S.song && !audition) lines.push(...songLines());
  const pv = !S.offline && !(ep && orbEditing.solo) && previewLayer();
  if (pv) lines.push(lineFor(pv, 0));
  if (lines.length === 1) lines.push('$: silence');
  return lines.filter(Boolean).join('\n\n').replaceAll('__DT__', dt);
}

let syncTimer;
async function sync() {
  clearTimeout(syncTimer);
  const code = buildCode();
  ui.code.textContent = code;
  renderStatus();
  saveSessionSoon();
  checkVoteSet();
  if (!S.playing) return;
  try {
    await evaluate(code);
  } catch (e) {
    console.error(e);
  }
}
const syncSoon = () => {
  clearTimeout(syncTimer);
  syncTimer = setTimeout(sync, 90);
};

async function play() {
  await ensureStarted();
  // the scheduler restarts from cycle 0, so every layer may sound straight away
  for (const a of active.values()) a.at = 0;
  if (S.song) Object.assign(S.song, { s0: 0, from: null });
  S.playing = true;
  document.body.classList.add('playing');
  await sync();
}

function stop() {
  hush();
  S.playing = false;
  S.previewOnly = false;
  document.body.classList.remove('playing');
  renderStatus();
}

ui.play.addEventListener('click', () => (S.playing ? stop() : play()));

// ---------- adding / removing layers ----------

const nextBar = () => (S.playing ? Math.ceil(nowCycle() + 0.15) : 0);
// Orb patterns (and the MIDI pane) loop on the absolute 4-bar grid (cycle % BARS), so a song
// has to start on a 4-bar boundary: then each section's first bar is the pane's first bar.
const nextPhrase = () => (S.playing ? Math.ceil((nowCycle() + 0.15) / BARS) * BARS : 0);

// how many orbs of one kind may play together; one more bounces the oldest out
// EQ orbs count as moods, and also bounce each other by range (put / eqClash): low, high and middle
const CAPS = { lead: 3, bass: 3, fx: 3, perc: 2, kick: 2, snare: 2, hat: 2, arp: 2, pad: 2, tempo: 2, mood: 5 }; // everything else: one at a time
const capOf = (l) => l.cat;

// Put one layer into the mix (no evaluation), bouncing out what it pushes over the limit.
function put(layer, at, home = null) {
  if (active.has(layer.id)) return;
  // an EQ orb bounces out the EQ orbs on its range (only one filter of each kind can sound)
  for (const a of [...active.values()]) if (eqClash(a.layer, layer)) removeLayer(a.layer.id, { silent: true });
  const same = [...active.values()].filter((a) => capOf(a.layer) === capOf(layer));
  for (const a of same.slice(0, Math.max(0, same.length - (CAPS[capOf(layer)] ?? 1) + 1))) removeLayer(a.layer.id, { silent: true });
  warm([layer]);
  heldSeed.delete(layer.id);
  S.opening = false;
  active.set(layer.id, { layer, at, home, sat: makeSat(layer) });
}

// seed: the orb comes in with its own variation (one rolled with 🎲 in the roll)
async function addLayer(id, home, seed = null) {
  seed ??= heldSeed.get(id) ?? null;
  heldSeed.delete(id);
  tut.thrown++;
  countMove();
  taste.add(id);
  S.previewOnly = false; // putting an orb in means the song plays on
  if (!S.playing) await play();
  const layer = byId[id];
  const at = nextBar();
  if (layer.combo) for (const c of layer.combo) put(byId[c], at);
  else {
    put(layer, at, home);
    if (seed != null && seed !== S.variation && seeded(layer)) ownSeed.set(id, seed);
    if (orbVars.has(id)) applyVar(id);
  }
  // a combo may have pulled in parts that are still falling
  for (const o of rain) if (active.has(o.id)) vanish(o);
  await sync();
}

// Take a layer out; its orb goes back where it came from (its spot in the field, or the stash).
function removeLayer(id, { silent = false, respawn = true } = {}) {
  const a = active.get(id);
  if (!a) return;
  const r = a.sat.getBoundingClientRect();
  a.sat.remove();
  active.delete(id);
  // its own seed goes with it, so it plays the same when it goes back in
  if (ownSeed.has(id)) heldSeed.set(id, ownSeed.get(id));
  else heldSeed.delete(id);
  ownSeed.delete(id);
  if (orbVars.has(id)) applyVar(id);
  chans.delete(id);
  if (S.solo === id) setSolo(null);
  if (respawn) eject(id, a.home, r.left + r.width / 2, r.top + r.height / 2);
  if (!silent) sync();
}

// An orb leaving the song pops out of its orbit, hops away from the player and flies home,
// so you can see what was replaced.
function eject(id, home, x, y) {
  const el = makeOrbEl(id);
  el.classList.add('dragging', 'ejected');
  el.style.left = x + 'px';
  el.style.top = y + 'px';
  document.body.append(el);
  const c = coreCenter();
  const d = Math.hypot(x - c.x, y - c.y) || 1;
  requestAnimationFrame(() => {
    el.classList.add('flying');
    el.style.left = x + ((x - c.x) / d) * 90 + 'px';
    el.style.top = y + ((y - c.y) / d) * 90 + 'px';
  });
  if (!home) home = byId[id].raw ? { kind: 'stash', index: stash.length } : { kind: 'field', fx: 0.2 + Math.random() * 0.6, fy: 0.15 };
  setTimeout(() => goHome(el, home), 420);
}

function returnOrb(id, home) {
  if (home?.kind === 'stash' || (!home && byId[id].raw)) {
    if (stash.length < STASH_MAX) {
      taste.clear(id);
      stash.splice(Math.min(home?.index ?? stash.length, stash.length), 0, id);
      renderStash();
      return;
    }
  }
  const { w, h } = fieldSize();
  const x = home?.kind === 'field' ? home.fx * w : 70 + Math.random() * Math.max(1, w - 140);
  const y = home?.kind === 'field' ? Math.min(home.fy, 0.6) * h : 0.15 * h;
  rainAdd(id, x, y, { pop: true });
}

export {
  VA0, VOL_DEFAULT, VR, VSWEEP, addLayer, analyser, audioUnlocked, bpm, buildCode, chanOf, codeOf,
  drawVolume, ducked, ensureStarted, fxOrbs, hoverOrb, keyMode, keyShift, keyText, layers, lineFor, nextBar,
  nextPhrase, nowCycle, pitchedCode, play, put, removeLayer, returnOrb, seeded, setVolume, stop, sync,
  syncSoon, volFocus, volRing, volValue, volume, vpt, warm,
};
