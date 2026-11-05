import {
  initStrudel, evaluate, hush, registerZZFXSounds, getAudioContext, getSuperdoughAudioController, Pattern,
  transpiler, noteToMidi, getAnalyserById,
} from '@strudel/web';
import { loadSampleBanks, preloadSamples, preloadDrums, samplePrelude, isBooted } from './samples.js';
import './orbs.css';
import {
  LAYERS, CAT_SHARE, BASE_BPM, KEYS, BAR_CHORDS, snap, rng, hash, byId, role, ROLE_TEXT, setMode, keyLabel, MOOD_SUBS,
} from './orbCatalog.js';
import { BARS, STEPS, ROWS, packRaw, unpackRaw, sheetCode, quantize, notesAt, stepOf, songToWire, songFromWire, toWire, cleanGains, fxScalable, songFx, duckOf, eqClash } from './orbPreset.js';
import { uploadPreset, fetchPresets, weightedOrder } from './presetApi.js';
import { mountVote } from './vote.js';
import { lite, setLite, onLite, watchFrame } from './liteMode.js';
import { tone, toneHex, ink, onTheme, setPalette, mountThemeButton, theme as themeNow } from './theme.js';
import { drawMidiBackdrop } from './midiBackdrop.js';
import { ot, secName, allLangs, mountLangButtons } from './orbsI18n.js';
import { isPhone } from './phoneLayout.js';
import { mountLicenses, attributionsFor, creditLine, soundName } from './licenses.js';
import { copyText } from './copyBox.js';
import { mountChangelog } from './changelog.js';
import { spotlight, banner, busy as tutBusy, onIdle as onTutIdle } from './tutorial.js';
import { saveFile } from './saveFile.js';
import * as taste from './orbTaste.js';
import { LIMITS, validatePreset } from '../server/presetSchema.mjs';

// Gate a pattern to one window of a looping song: the song starts at cycle `s0`, is `len`
// cycles long, and this part plays from `a` to `b` within it.
// Nothing sounds before cycle `from`: a jump into the song waits there in silence.
Pattern.prototype.songPart = function (s0, len, a, b, from = s0) {
  return this.filterWhen((t) => {
    const p = (((t - s0) % len) + len) % len;
    return t >= s0 && t >= from && p >= a && p < b;
  });
};

// ---------- state ----------

const $ = (id) => document.getElementById(id);
const ui = {
  play: $('play'), core: $('core'), sats: $('sats'), field: $('field'), right: $('right'), status: $('status'),
  chips: $('chips'), roles: $('roles'), soloHint: $('soloHint'), drawer: $('drawer'), code: $('code'),
  roll: $('roll'), rollCanvas: $('rollCanvas'), rollSlot: $('rollSlot'), rollName: $('rollName'),
  rollHint: $('rollHint'), rollDone: $('rollDone'), rollDice: $('rollDice'),
  slots: $('slots'), slotHint: $('slotHint'),
  stash: $('stash'), stashSlots: $('stashSlots'),
  presetList: $('presetList'), presetName: $('presetName'),
  song: $('song'), songBtn: $('songBtn'),
  stem: $('stems'), stemGrid: $('stemGrid'), seedPop: $('seedPop'),
  search: $('searchBox'), searchInput: $('searchInput'), searchResults: $('searchResults'),
};

// the orb page also plays ZZFX synths, on top of the shared banks
const replReady = initStrudel({
  prebake: () => {
    registerZZFXSounds(); // z_sine, z_square … synths (@strudel/web doesn't register them by itself)
    return loadSampleBanks();
  },
});
// Boot screen: hold the page until the sample maps are registered and every drum one-shot is
// decoded (see samples.js), so the first bars never drop hits while files are still downloading.
// The boot set starts with the drum hits of the band-part orbs (FIRST_CATS), so the opening rain
// (see pickCandidate) has kicks, snares and hats to drop next to the synth orbs.
// what may fall before the first orb ever goes in: 리드 · 아르페지오 · 베이스 · 코드 · 킥 · 스네어 · 하이햇
const FIRST_CATS = new Set(['lead', 'arp', 'bass', 'pad', 'kick', 'snare', 'hat']);
const bootFirst = LAYERS.filter((l) => FIRST_CATS.has(l.cat) && !l.combo).flatMap((l) => l.samples ?? []);
const bootBar = document.getElementById('bootBar'), bootCount = document.getElementById('bootCount');
const drumsReady = preloadDrums((n, total) => {
  bootBar.style.width = `${(100 * n) / total}%`;
  bootCount.textContent = `${n} / ${total}`;
}, bootFirst).catch((e) => console.warn('drum preload failed', e));
const booted = Promise.all([replReady, drumsReady])
  .catch((e) => console.warn('preload failed, starting anyway', e))
  .finally(() => document.body.classList.add('booted'));
let repl;
let playing = false;
let started = false; // audio context unlocked + master chain built
const active = new Map(); // id -> { layer, at, sat, home }
let variation = 1 + Math.floor(Math.random() * 9999); // every page load starts from its own seed
// orbs given their own seed with the 🎲 on their strip; the rest follow `variation`
const ownSeed = new Map(); // id -> seed
const seedOf = (l) => ownSeed.get(l.id) ?? variation;
const ownSeeds = () => (ownSeed.size ? Object.fromEntries(ownSeed) : null);
// Orbs changed in the slots under the field travel with that change wherever they go (field,
// stash, song) until they leave the screen: a volume from 약하게 / 세게 (for a mood: how strong its effects are), and a seed from 변주
// waiting for the orb to go into the song (or kept from the song when it comes out).
// The volume is a number of steps, -3 … +3: each 약하게 is × 0.8, each 세게 × 1.2, and
// one cancels the other. The orb shows it (smaller / bigger, one sound-wave ring per step).
const VOL_STEPS = 3;
const orbStep = new Map(); // id -> steps (never 0)
const volStep = (id) => orbStep.get(id) ?? 0;
const stepGain = (n) => (n < 0 ? 0.8 ** -n : 1.2 ** n);
// a volume from a preset (any factor) as the nearest step
const gainStep = (g) => Math.max(-VOL_STEPS, Math.min(VOL_STEPS, Math.round(Math.log(g) / Math.log(g < 1 ? 0.8 : 1.2) * (g < 1 ? -1 : 1))));
function setStep(id, n) {
  if (n) orbStep.set(id, n);
  else orbStep.delete(id);
}
const gainOf = (l) => stepGain(volStep(l.id));
const heldSeed = new Map(); // id -> seed, for orbs outside the song
// the volumes of the song's orbs that differ from 100%, as whole percents (presets, share codes)
const gainPct = (g) => Math.round(g * 100);
const ownGains = () => {
  const g = [...active.keys()].filter((id) => volStep(id)).map((id) => [id, gainPct(stepGain(volStep(id)))]);
  return g.length ? Object.fromEntries(g) : null;
};
// an orb that shows up anew (from the catalogue) starts as made
function forget(id) {
  orbStep.delete(id);
  heldSeed.delete(id);
}
let solo = null; // id of the orb being auditioned from the list
let song = null; // { seed, s0 } while the full-song arrangement plays
let lastSong = null; // the stems closed last, for 📂 스템 열기
let songPlanCache = null;

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
let volDemo = 0; // rAF id while the dial is being wiggled
function setVolume(v) {
  cancelAnimationFrame(volDemo);
  volDemo = 0;
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
  if (started) return;
  document.body.classList.add('loading');
  repl = await replReady;
  await drumsReady;
  await getAudioContext().resume();
  setupMaster();
  started = true;
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
  if (!started) return;
  const names = list.flatMap((l) => (l?.combo ? l.combo.map((c) => byId[c]) : [l])).flatMap((l) => l?.samples ?? []).filter((n) => !warmed.has(n));
  names.forEach((n) => warmed.add(n));
  warmQueue.push(...names);
  warmTimer ??= setInterval(() => {
    const batch = warmQueue.splice(0, 4);
    if (batch.length) preloadSamples(batch);
    else warmTimer = clearInterval(warmTimer) ?? null;
  }, 300);
}

const nowCycle = () => repl.scheduler.now();
const layers = () => [...active.values()].map((a) => a.layer);
taste.setSong(layers);
taste.setFalling(() => rain.map((o) => o.id));
// The orb under the mouse in the field (or held) is auditioned on its own: the song goes quiet.
// While a held orb is over the player it is heard together with the song instead.
let hover = null;
let hoverMix = false;
// true while building the code for a WAV render: no hover previews, solo dips or bar gates
let offline = false;
const hoverOrb = () => !offline && hover && byId[hover];
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
const codeOf = (l, v) => {
  setMode(keyMode());
  // a copy (복제 slot) plays its source orb's notes: it hashes under that orb's id
  const code = typeof l.code === 'function' ? l.code(rng(hash(l.base ?? l.id) + v * 7919)) : l.code;
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

function lineFor(l, v, extra = '', { preview = false } = {}) {
  if (!l.code) return null;
  // hovering an orb in the song's list solos it
  const quiet = !(preview || offline) && solo && solo !== l.id && byId[solo]?.code;
  // the orb's own volume (음량 slots), times a balance mood's dip and the solo dip; one postgain,
  // since a second would replace the first
  const g = gainOf(l) * ducked(l) * (quiet ? 0.12 : 1);
  const post = Math.abs(g - 1) < 0.005 ? '' : `.postgain(${+g.toFixed(3)})`;
  // fft(5): superdough sizes the analyser 2^(5+5) = 1024, the size the equaliser reads it at
  const chan = preview || offline ? '' : `.analyze(${chanOf(l.id)}).fft(5)`;
  const code = codeOf(l, v);
  const key = keyShift() && pitchedCode(l, code) ? `.transpose(${keyShift()})` : '';
  // the EQ and mood orbs' effects, each at the strength the 약하게 / 세게 slots gave it
  const fx = songFx(fxOrbs(), code + extra, (o) => volStep(o.id));
  return `// ${preview ? '미리듣기: ' : ''}${l.name}\n$: ${code}${key}${extra}${fx}${post}${chan}`;
}

function buildCode() {
  const dt = (((60 / bpm()) * 3) / 4).toFixed(3); // dotted-eighth delay in seconds
  const lines = [`setcpm(${bpm()}/4)`];
  // auditioning a sounding orb: it plays alone, unless it is held over the player
  const audition = !offline && hoverSounds().length > 0 && !hoverMix;
  for (const l of hoverSounds()) if (!active.has(l.id)) lines.push(lineFor(l, heldSeed.get(l.id) ?? variation, '', { preview: true }));
  for (const a of audition ? [] : active.values()) {
    const line = lineFor(a.layer, seedOf(a.layer));
    // each layer waits for the next bar; while a song is queued, the loop hands over at its start
    const gate = [a.at > 0 && !offline && `t >= ${a.at}`, song && `t < ${song.s0}`].filter(Boolean);
    if (line) lines.push(line + (gate.length ? `\n  .filterWhen((t) => ${gate.join(' && ')})` : ''));
  }
  if (song && !audition) lines.push(...songLines());
  const pv = !offline && previewLayer();
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
  if (!playing) return;
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
  if (song) Object.assign(song, { s0: 0, from: null });
  playing = true;
  document.body.classList.add('playing');
  await sync();
}

function stop() {
  hush();
  playing = false;
  previewOnly = false;
  document.body.classList.remove('playing');
  renderStatus();
}

ui.play.addEventListener('click', () => (playing ? stop() : play()));

// ---------- adding / removing layers ----------

const nextBar = () => (playing ? Math.ceil(nowCycle() + 0.15) : 0);
// Orb patterns (and the MIDI pane) loop on the absolute 4-bar grid (cycle % BARS), so a song
// has to start on a 4-bar boundary: then each section's first bar is the pane's first bar.
const nextPhrase = () => (playing ? Math.ceil((nowCycle() + 0.15) / BARS) * BARS : 0);

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
  opening = false;
  active.set(layer.id, { layer, at, home, sat: makeSat(layer) });
}

// ---------- tutorial: tools show up one by one as the player goes ----------
// Counted from the player's own moves only (presets and the restored session don't count):
// `thrown` = orbs put into the song, `moves` = orbs put in or taken out. Each step unlocks a part
// of the page (a body class) and points at it once (tutorial.js spotlight: the rest dims for a
// moment), except the preset step, which keeps a note under the title instead.
//   1  3 thrown                      the stash on the right (nothing new unlocks: it is always there)
//   2  5 thrown / 1 min after 1        the slots under the field: 약하게 / 세게 / 변주 / 복제  (.roll-ready)
//   3  7 thrown / 1 min after 2        the 편집 slot (piano roll)                                 (.midi-ready)
//   4  9 thrown / 1 min after 3        "save it as a preset" under the title, until a preset is saved or 4 more moves
//   5  preset saved / 15 moves / 1 min without a change after 4
//                                    loop WAV / loop share / server share                      (.share-ready)
//   6  one of those used / 5 more thrown / 1 min after 5
//                                    📂 스템 열기 (full-song stems)                              (.song-ready)
//   8  the stems opened (wide screens): ↩ 루프 모드로 at the top right takes you back to the loop
// A step never starts while another note is still up (tutorial.js busy): it waits its turn.
// The progress is remembered across reloads; the volume-knob tip after the first orb is separate.
const TUT_KEY = 'orbTutorial';
const IDLE_MS = 60_000, SONG_AFTER_MS = 60_000, CODE_AFTER_MS = 30_000;
// steps 2–4 also come by themselves this long after the step before
const STEP_AFTER_MS = 60_000;
const stepTimeUp = () => Date.now() - tut.at >= STEP_AFTER_MS;
const tut = { step: 0, thrown: 0, moves: 0, thrownAt: 0, movesAt: 0, at: 0, banner: false, bannerMoves: 0, used: false, combo: false };
try {
  Object.assign(tut, JSON.parse(localStorage.getItem(TUT_KEY)) ?? {});
  // from before the step-by-step guide: the slots, or everything, were already out
  if (!tut.step && localStorage.getItem('orbToolsReady')) tut.step = 6;
  else if (!tut.step && localStorage.getItem('orbRollReady')) tut.step = 3;
} catch {}
if (tut.step >= 1) tut.combo = true; // got past the combo note before it existed
// Combo orbs stay out of the rain until the volume-knob tip after the first orb has run; then
// one combo is dropped on purpose and, a quarter of the way down the field, it stops and gets
// explained (tut.combo). The stash note (step 1) follows straight after.
let comboDue = false; // the volume tip is over: drop the combo
let comboOrb = null; // the rain entry of that combo while it falls
const comboHeld = () => !tut.combo && !onlyIds;
function explainCombo(o) {
  o.hold = true; // it waits in place while the note is up
  // the orb element itself has no size (its parts hang off its centre): point at the ball
  spotlight(() => o.el.querySelector('.ball') ?? o.el, ot('tutCombo'), {
    onDone: () => {
      o.hold = false;
      comboOrb = null;
      tut.combo = true;
      saveTut();
      tutCheck();
    },
  });
}
function dropCombo(size) {
  const shown = new Set([...active.keys(), ...rain.map((q) => q.id), ...stash, ...slotIds()]);
  const pool = LAYERS.filter((l) => l.combo && !shown.has(l.id) && !l.combo.every((c) => active.has(c)) && (!opening || instant(l)));
  if (!pool.length) return null;
  const id = pool[Math.floor(Math.random() * pool.length)].id;
  forget(id);
  rainAdd(id, pickX(size.w), -40);
  return rain.at(-1);
}
const saveTut = () => {
  try {
    localStorage.setItem(TUT_KEY, JSON.stringify(tut));
  } catch {}
};
let lastChange = Date.now(); // the last orb put in or taken out (this visit)
// the ⇪ button on a phone (one of two, whichever shows), else the loop's save / share row
const shareTarget = () => [...document.querySelectorAll('.m-export-btn')].find((b) => b.getBoundingClientRect().width) ?? $('wavBtn').parentElement;
// 코드 · (직접수정) strudel.cc · 라이선스 as one target: the spotlight only reads its box
const codeLinks = {
  getBoundingClientRect() {
    const rs = ['codeToggle', 'strudelBtn', 'licenseBtn'].map((id) => $(id).getBoundingClientRect()).filter((r) => r.width);
    if (!rs.length) return new DOMRect();
    const l = Math.min(...rs.map((r) => r.left)), t = Math.min(...rs.map((r) => r.top));
    return new DOMRect(l, t, Math.max(...rs.map((r) => r.right)) - l, Math.max(...rs.map((r) => r.bottom)) - t);
  },
};
const TUT = [
  null,
  { when: () => tut.combo, show: () => spotlight(ui.stash, ot(isPhone.matches ? 'tutStashPhone' : 'tutStash'), { wait: 300 }) },
  {
    when: () => tut.thrown >= 5 || stepTimeUp(), cls: 'roll-ready',
    // a phone has had the slots (편집 too) all along: here each of the five gets a short note
    show: () => {
      if (isPhone.matches) {
        SLOTS.forEach((m, i) => spotlight(slotEls[m], `${i + 1}/5 · ${ot('tutX' + m)}`, { wait: i ? 0 : 500 }));
        return;
      }
      bump(ui.slots, 'intro');
      spotlight(ui.slots, ot('tutSlots'), { wait: 800 });
    },
  },
  {
    when: () => tut.thrown >= 7 || stepTimeUp(), cls: 'midi-ready',
    // a phone had 편집 explained with the other slots: the step unlocks it quietly (for a later wide screen)
    show: () => {
      if (isPhone.matches) return;
      bump(slotEls.midi, 'intro');
      spotlight(slotEls.midi, ot('tutMidi'), { wait: 700 });
    },
  },
  {
    when: () => tut.thrown >= 9 || stepTimeUp(),
    show: () => {
      tut.banner = true;
      tut.bannerMoves = tut.moves;
      const el = banner(ot(isPhone.matches ? 'tutPresetPhone' : 'tutPreset'));
      // dim everything but the preset bar (📁 on a phone) for a moment, banner kept lit
      spotlight(() => (isPhone.matches ? document.querySelector('.m-presets-btn') : $('presetbar')), null, { wait: 400, lift: [el] });
    },
  },
  {
    when: () => tut.used || tut.moves >= 15 || Date.now() - Math.max(lastChange, tut.at) >= IDLE_MS, cls: 'share-ready',
    show: () => spotlight(shareTarget, ot('tutShare'), { wait: 500 }),
  },
  {
    // the set is Strudel code underneath: where to see it, and to take it to strudel.cc
    // (on a phone those links sit in the ⋯ menu, so the note points at that)
    when: () => tut.used || tut.thrown >= tut.thrownAt + 3 || Date.now() - tut.at >= CODE_AFTER_MS,
    show: () => isPhone.matches
      ? spotlight(() => document.querySelector('.m-menu-btn'), ot('tutCodePhone'), { wait: 500 })
      : spotlight(codeLinks, ot('tutCode'), { wait: 500 }),
  },
  {
    when: () => tut.used || tut.thrown >= tut.thrownAt + 5 || Date.now() - tut.at >= SONG_AFTER_MS, cls: 'song-ready',
    // the stems are for wide screens: on a phone the button stays hidden and this just passes
    show: () => isPhone.matches || spotlight($('stemReopen'), ot('tutSong'), { wait: 500 }),
  },
  {
    // the stems were opened: how to get back to the loop (only the close button stays lit)
    when: () => tut.used && document.body.classList.contains('stem-open'),
    show: () => spotlight($('stemClose'), ot('tutStemClose'), { wait: 600 }),
  },
];
const TUT_LAST = TUT.length - 1;
// v2 put the Strudel-code note (6) before the stems (now 7): progress saved before that moves up
// one past 6, so the stems button a returning visitor already had stays out
if (!tut.v) {
  if (tut.step >= 6) tut.step++;
  tut.v = 2;
  saveTut();
}
for (let i = 1; i <= tut.step && i <= TUT_LAST; i++) if (TUT[i].cls) document.body.classList.add(TUT[i].cls);
function tutCheck() {
  // the preset note goes once a preset is saved or after four more moves
  if (tut.banner && (tut.step > 4 || tut.moves >= tut.bannerMoves + 4)) {
    tut.banner = false;
    banner(null);
    saveTut();
  }
  const s = TUT[tut.step + 1];
  // one note at a time: a step that is due waits until the note on screen has gone
  if (!s || tutBusy() || !s.when()) return;
  tut.step++;
  Object.assign(tut, { at: Date.now(), thrownAt: tut.thrown, movesAt: tut.moves, used: false });
  if (s.cls) document.body.classList.add(s.cls);
  saveTut();
  s.show();
  tutCheck(); // the banner may go with this step
}
// what the steps wait for besides orbs: a preset saved (step 5), a save / share button used
// (step 6), the code opened (step 7), the stems opened (step 8)
function tutEvent(name) {
  if ((name === 'preset' && tut.step === 4) || (name === 'share' && tut.step === 5) || (name === 'code' && tut.step === 6) || (name === 'stems' && tut.step === 7)) {
    tut.used = true;
    tutCheck();
  }
}
setInterval(() => tut.step < TUT_LAST && !document.hidden && tutCheck(), 2000);
// a step held back by a note on screen comes as soon as that note has gone
onTutIdle(() => tut.step < TUT_LAST && tutCheck());
// skip ahead to step n without pointing at anything (n = TUT_LAST: everything out at once)
function tutUpTo(n) {
  for (let i = 1; i <= n; i++) if (TUT[i].cls) document.body.classList.add(TUT[i].cls);
  if (tut.step >= n) return;
  Object.assign(tut, { step: n, at: Date.now(), thrownAt: tut.thrown, movesAt: tut.moves, used: false });
  if (n > 4) tut.banner = false, banner(null);
  saveTut();
}
const revealRoll = () => tutUpTo(TUT_LAST);

function countMove(n = 1) {
  tut.moves += n;
  lastChange = Date.now();
  saveTut();
  tutCheck();
}

// seed: the orb comes in with its own variation (one rolled with 🎲 in the roll)
async function addLayer(id, home, seed = null) {
  seed ??= heldSeed.get(id) ?? null;
  heldSeed.delete(id);
  tut.thrown++;
  countMove();
  taste.add(id);
  previewOnly = false; // putting an orb in means the song plays on
  if (!playing) await play();
  const layer = byId[id];
  const at = nextBar();
  if (layer.combo) for (const c of layer.combo) put(byId[c], at);
  else {
    put(layer, at, home);
    if (seed != null && seed !== variation && seeded(layer)) ownSeed.set(id, seed);
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
  chans.delete(id);
  if (solo === id) setSolo(null);
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

// ---------- first visit: throw hint, then the volume tip ----------

// Until the first orb ever goes into the song, the hint stays up and a see-through orb keeps
// flying from the field into the player. The first orb then wiggles the volume dial for 2s with
// a "turn the knob" tip that fades out. Remembered across reloads, so all of it shows once.
const FIRST_ORB_KEY = 'orbFirstOrb';
let firstOrbDone = false;
try {
  firstOrbDone = !!localStorage.getItem(FIRST_ORB_KEY);
} catch {}
let ghostTimer = 0;
function ghostThrow() {
  ghostTimer = 0;
  if (firstOrbDone) return;
  const f = ui.field.getBoundingClientRect();
  const c = coreCenter();
  if (f.width && f.height && !document.hidden) {
    const el = document.createElement('i');
    el.className = 'ghost-orb';
    document.body.append(el);
    const x0 = f.left + f.width * (0.3 + Math.random() * 0.25), y0 = f.top + f.height * (0.3 + Math.random() * 0.3);
    // a slight arc, like a throw: up a little on the way, then into the player
    const mx = (x0 + c.x) / 2, my = Math.min(y0, c.y) - 40;
    const at = (x, y, s) => `translate(${x}px, ${y}px) scale(${s})`;
    el.animate([
      { transform: at(x0, y0, 1), opacity: 0 },
      { transform: at(x0, y0, 1.05), opacity: 0.45, offset: 0.2 },
      { transform: at(mx, my, 0.95), opacity: 0.45, offset: 0.6 },
      { transform: at(c.x, c.y, 0.6), opacity: 0 },
    ], { duration: 1600, easing: 'ease-in-out' }).finished.then(() => el.remove(), () => el.remove());
  }
  ghostTimer = setTimeout(ghostThrow, 2600);
}
function showVolumeTip() {
  // dial and sound: slowly down to 15% of where it was, then back up to the default 60% over 5s,
  // so the change is heard. Touching the dial (setVolume) ends the demo at once.
  const t0 = performance.now();
  const from = volValue, low = volValue * 0.15;
  const step = (t) => {
    const k = Math.min(1, (t - t0) / 5000);
    const e = 0.5 - 0.5 * Math.cos((k < 0.5 ? k * 2 : k * 2 - 1) * Math.PI); // eases 0→1 in each half
    const v = k < 0.5 ? from + (low - from) * e : low + (VOL_DEFAULT - low) * e;
    if (k >= 1) return setVolume(VOL_DEFAULT);
    drawVolume(v);
    ui.sats.style.setProperty('--neon', Math.sin(k * Math.PI).toFixed(3)); // brightest at the quietest
    volume?.gain.setTargetAtTime(v * v * 1.25, getAudioContext().currentTime, 0.03);
    volDemo = requestAnimationFrame(step);
  };
  cancelAnimationFrame(volDemo);
  document.body.classList.add('vol-demo');
  volDemo = requestAnimationFrame(step);
  const r = volRing.getBoundingClientRect();
  if (!r.width) return;
  volFocus(5000); // the note is up ~5s (volTip keyframes)
  const tip = document.createElement('div');
  tip.className = 'vol-tip';
  tip.textContent = ot('volHint');
  // bottom-right of the player, just past the dial's end where the knob lives
  const [ex, ey] = vpt(VA0 + VSWEEP, VR + 14);
  tip.style.left = r.left + (ex / 240) * r.width + 'px';
  tip.style.top = r.top + (ey / 240) * r.height + 'px';
  document.body.append(tip);
  const over = tip.getBoundingClientRect().right - (innerWidth - 8);
  if (over > 0) tip.style.left = parseFloat(tip.style.left) - over + 'px';
  tip.addEventListener('animationend', (e) => e.animationName === 'volTip' && tip.remove());
}
// boot: a restored session with orbs already counts as done (no tip on load)
function checkFirstOrb({ boot = false } = {}) {
  if (firstOrbDone || !active.size) return;
  firstOrbDone = true;
  document.body.classList.add('first-orb-done');
  clearTimeout(ghostTimer);
  try {
    localStorage.setItem(FIRST_ORB_KEY, '1');
  } catch {}
  if (!boot) {
    afterFirstSound(() => {
      showVolumeTip();
      setTimeout(() => (comboDue = true), 6500); // once the tip has faded
    });
    setTimeout(() => (comboDue = true), 30_000); // the tip was skipped (song emptied before it sounded)
  }
}
// Wait until the song is playing and has reached the bar the first orb comes in on, then let it
// be heard for a moment before running fn (the dip has to start from the song already sounding).
function afterFirstSound(fn) {
  const at = Math.min(...[...active.values()].map((a) => a.at ?? 0));
  const wait = () => {
    if (!active.size) return; // emptied again before it ever sounded: skip the tip
    if (playing && repl && nowCycle() >= at) setTimeout(fn, 1200);
    else setTimeout(wait, 100);
  };
  wait();
}
if (firstOrbDone) document.body.classList.add('first-orb-done');

// ---------- status, list, solo ----------

function renderStatus() {
  document.body.classList.toggle('has-orbs', active.size > 0);
  checkFirstOrb();
  const key = song ? '' : ` · ${keyText()} (${ot(keyMode())})`;
  ui.status.innerHTML = active.size
    ? `${bpm()} BPM${key}${layers().some(seeded) ? ` · ${ot('variation')} <b>#${variation}</b>` : ''}`
    : playing
      ? ot('quiet')
      : ot(isPhone.matches ? 'idlePhone' : 'idle');
  renderChips();
  renderRoles();
}

// Above the player: one placeholder per kind of part, lit when the song has one. Nothing has
// to be filled; it just shows what the song could still use. The hovered orb's slot blinks.
// texture orbs share the effects slot (they stay their own cat underneath, for the mix)
// three rows: drums and effects / pitched parts / the whole-song settings
const ROLE_ROWS = [
  ['kick', 'snare', 'hat', 'perc', 'fx'],
  ['bass', 'pad', 'arp', 'lead'],
  ['tempo', 'mood', 'mode'],
];
const ROLE_IDS = ROLE_ROWS.flat();
const slotOf = (l) => (role(l) === 'texture' ? 'fx' : role(l));
const roleSlots = () => ROLE_IDS.map((r) => [r, ot(`slot.${r}`)]);
const roleText = (r) => (ot(`role.${r}`) === `role.${r}` ? r : ot(`role.${r}`));
function renderRoles() {
  const h = hoverOrb();
  const incoming = new Set((h?.combo ? h.combo.map((c) => byId[c]) : h ? [h] : []).map(slotOf));
  ui.roles.innerHTML = '';
  const rowOf = new Map();
  for (const ids of ROLE_ROWS) {
    const row = document.createElement('div');
    row.className = 'role-row';
    ui.roles.append(row);
    for (const r of ids) rowOf.set(r, row);
  }
  for (const [r, label] of roleSlots()) {
    const ls = layers().filter((l) => slotOf(l) === r);
    const slot = document.createElement('div');
    slot.className = 'role' + (ls.length ? ' on' : '') + (incoming.has(r) ? ' next' : '');
    const dot = document.createElement('i');
    if (ls.length) {
      paint(dot, ls[0]);
      dot.innerHTML = '<i class="swirl"></i>';
      slot.style.setProperty('--g', ctint(ls[0]));
    } else if (h) slot.style.setProperty('--g', ctint(h));
    const name = document.createElement('span');
    name.textContent = r === 'tempo' && ls.length ? `${bpm()}` : ls.length > 1 ? `${label}×${ls.length}` : label;
    slot.title = ls.length ? ls.map((l) => l.name).join(', ') : `${label} — ${ot('empty')}`;
    slot.append(dot, name);
    rowOf.get(r).append(slot);
  }
}

// The orbs in the song, under the player, grouped like the slots above it ("베이스", "베이스 2").
// Each strip's orb pulses with its own channel. Hover to solo; drag the orb out (to the
// field or the stash, or into the roll to edit its notes); right-click to take it out.
// the strip orbs by id, kept here so the equaliser doesn't query the DOM for them every frame
const strips = new Map();
function renderChips() {
  ui.chips.innerHTML = '';
  strips.clear();
  // an orb's own seed can change while it plays (🎲 on its strip): its satellite follows
  for (const a of active.values()) decorate(a.sat, a.layer.id);
  for (const [r, label] of roleSlots()) {
    layers().filter((l) => slotOf(l) === r).forEach((l, i) => {
      const strip = document.createElement('div');
      // tempo orbs: slowing down shows red, speeding up shows black
      strip.className = 'strip' + (l.bpm ? (l.bpm < BASE_BPM ? ' slow' : ' fast') : '');
      strip.dataset.id = l.id;
      if (!l.bpm) strip.style.setProperty('--g', ctint(l));
      const ball = document.createElement('div');
      ball.className = 'mini';
      paint(ball, l);
      ball.innerHTML = '<i class="swirl"></i>';
      strips.set(l.id, ball);
      const tag = document.createElement('b');
      tag.textContent = r === 'tempo' ? `${label} ${l.bpm}` : r === 'mode' ? `${label} ${keyLabel(l)}` : i ? `${label} ${i + 1}` : label;
      const name = document.createElement('span');
      name.textContent = l.name;
      strip.append(ball, tag, name);
      if (l.raw) {
        // edited by hand: C01 … where the seed would be (the shared variation doesn't touch it),
        // and ↺ in the corner puts the orb it was made from back in its place
        const num = document.createElement('span');
        num.className = 'snum custom';
        num.textContent = customTags().get(l.id);
        num.title = ot('customTag');
        const undo = document.createElement('button');
        undo.className = 'ghost sdice';
        undo.textContent = '↺';
        undo.title = ot('revertDrawn', { v: variation });
        undo.addEventListener('click', (e) => {
          e.stopPropagation();
          revertDrawn(l.id);
        });
        strip.append(num, undo);
      } else if (seeded(l)) {
        // its own seed (from the 변주 slot): the number, shown only when it differs, goes back to the shared one
        if (ownSeed.has(l.id)) {
          const num = document.createElement('button');
          num.className = 'ghost snum';
          num.textContent = `#${ownSeed.get(l.id)}`;
          num.title = ot('ownSeedBack', { v: variation });
          num.addEventListener('click', (e) => {
            e.stopPropagation();
            setOwnSeed(l.id, null);
          });
          strip.append(num);
        }
      }
      strip.title = `${l.name}${slotTag(l.id)} — ${ot('stripTip')}`;
      strip.addEventListener('mouseenter', () => setSolo(l.id));
      strip.addEventListener('mouseleave', () => setSolo(null));
      strip.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        countMove();
        removeLayer(l.id);
      });
      ball.addEventListener('pointerdown', (e) => e.button === 0 && grabFromSong(e, l.id));
      ui.chips.append(strip);
    });
  }
  // 12 or more orbs: smaller strips, so a third row doesn't push the buttons below off the screen
  ui.chips.classList.toggle('many', ui.chips.children.length >= 12);
}

// hand-edited orbs in the song, numbered C01, C02 … in the order they went in (strips and stem grid)
function customTags() {
  let n = 0;
  return new Map(layers().filter((l) => l.raw).map((l) => [l.id, `C${String(++n).padStart(2, '0')}`]));
}

// ↺ on a hand-edited strip: the orb it was drawn from takes its place (and its row in the stem
// grid), following the shared variation again. The edited copy goes to the stash.
function revertDrawn(id) {
  const a = active.get(id), l = byId[id], src = l?.raw && byId[l.src];
  if (!a || !src) return;
  if (active.has(src.id)) return removeLayer(id);
  const order = [...active.keys()].map((k) => (k === id ? src.id : k));
  const cells = song?.cells?.[id];
  removeLayer(id, { silent: true });
  put(src, 0, a.home);
  // keep the strip where it was
  const all = new Map(active);
  active.clear();
  for (const k of order) if (all.has(k)) active.set(k, all.get(k));
  for (const [k, v] of all) if (!active.has(k)) active.set(k, v);
  if (cells && !song.cells[src.id]) {
    let g = 0;
    song.cells[src.id] = cells.map((sec, i) => sec.map((b) => ({ on: b.on, v: blockSeed(src, seedOf(src) + (song.sections[i].v ?? 0) * 100, g++) })));
    const row = song.rows.find((r) => r.id === id);
    if (row) row.id = src.id;
    delete song.cells[id];
  }
  sync();
}

// one line under the list saying what an orb does
function describe(l, prefix = '') {
  ui.soloHint.style.setProperty('--g', l ? ctint(l) : '');
  if (!l) {
    ui.soloHint.textContent = '';
    return;
  }
  const what = l.bpm
    ? ot('tempoWhat', { x: (l.bpm / BASE_BPM).toFixed(2), dir: ot(l.bpm < BASE_BPM ? 'slower' : 'faster') })
    : l.eq ? ot('eqWhat')
      : l.cat === 'mood' ? ot('moodWhat')
      : l.cat === 'mode' ? ot('modeWhat', { key: keyLabel(l), mode: ot(l.mode) })
        : l.combo ? ot('comboWhat', { n: l.combo.length }) : roleText(role(l));
  ui.soloHint.innerHTML = `${prefix ? prefix + ' ' : ''}<b>${l.name}</b> — ${what}`;
}

// Hovering an orb in the list keeps its channel at full volume and turns the rest down.
function setSolo(id) {
  if (solo === id) return;
  solo = id;
  const l = id && byId[id];
  describe(l, l?.code ? ot('soloLoud') : '');
  if (!l || l.code) syncSoon();
}

// ---------- colours ----------

// mood, tempo and key orbs add no sound of their own (see paint): a song with fewer orbs than
// this doesn't get them in the rain yet, so the first picks are all things you can hear
const SOUND_FIRST = 3;
const noSound = (l) => l.cat && !l.code && !l.combo;

const tint = (l) => l.glow ?? l.colors?.[0] ?? l.color;
// the same, toned by the palette (theme.js): ctint for the page, toneHex(tint()) for canvases
const ctint = (l) => tone(tint(l));
function paint(el, l) {
  el.style.setProperty('--c', tone(l.color ?? l.colors[0]));
  el.style.setProperty('--g', ctint(l));
  // a combo is drawn as its orbs huddled together (orbInner); moods and keys get the colour swirl
  if (l.combo) el.classList.add('cluster');
  else if (l.colors) {
    el.classList.add('multi');
    el.style.setProperty('--multi', `conic-gradient(${[...l.colors, l.colors[0]].map(tone).join(', ')})`);
  }
  if (l.dark) el.classList.add('dark');
  if (l.raw) el.classList.add('pen');
  // mood, tempo and key orbs play nothing themselves, they change the rest: drawn with a rim
  // (preset tiles are painted from bare colours, with no cat: they get no rim)
  if (noSound(l)) el.classList.add('nosound');
  if (l.mode === 'major' || l.modeTag === 'major') el.classList.add('major');
  // moods and keys are both colour swirls: a mood's rim is dashed, a key's is solid
  if (l.cat === 'mood') el.classList.add('mood');
  if (l.eq) el.classList.add('eq');
  if (l.id && byId[l.id] === l) decorate(el, l.id);
}

// What the slots did to an orb, drawn on it wherever it shows (field, stash, slots, song):
// turned down = smaller, turned up = a bit bigger (.vol, --vol-scale); its own variation = a faint
// pattern over the ball that changes with the seed (.varied, --vpat, --vpat-rot).
function decorate(el, id) {
  if (!el) return;
  const n = volStep(id);
  el.classList.toggle('vol', !!n);
  if (n) el.style.setProperty('--vol-scale', (n < 0 ? 1 + 0.13 * n : 1 + 0.1 * n).toFixed(2));
  else el.style.removeProperty('--vol-scale');
  // an orb edited by hand gets a pattern too, picked by its notes
  const raw = byId[id]?.raw;
  patternOn(el, heldSeed.get(id) ?? ownSeed.get(id) ?? (raw ? rawKey(raw) : null));
}
const rawKey = (raw) => 'raw' + JSON.stringify(raw);
// the variation pattern for `key` (a seed, or rawKey of a drawing) on el; null takes it off
function patternOn(el, key) {
  el.classList.toggle('varied', key != null);
  if (key != null) {
    const [bg, rot] = seedPattern(key);
    el.style.setProperty('--vpat', bg);
    el.style.setProperty('--vpat-rot', rot + 'deg');
  } else el.style.removeProperty('--vpat');
}

// A faint pattern picked by the seed, so each variation looks a little different: one of many
// kinds (checks, stripes, dots, rings, rays, weaves …), in light or dark ink, at its own size,
// thickness and angle.
function seedPattern(seed) {
  const r = rng(hash('vpat' + seed));
  const a = (lo, hi) => (lo + r() * (hi - lo)).toFixed(2);
  const dark = r() < 0.3;
  const ink = (k = 1) => (dark ? `rgba(0, 0, 0, ${a(0.22 * k, 0.36 * k)})` : `rgba(255, 255, 255, ${a(0.14 * k, 0.26 * k)})`);
  const w = ink(), w2 = ink(0.6);
  const z = Math.round(12 + r() * 26); // tile, % of the ball
  const t = Math.round(z * (0.2 + r() * 0.3)); // line thickness, same units
  const tile = `0 0 / ${z}% ${z}%`;
  const kinds = [
    // checkerboard
    () => `repeating-conic-gradient(${w} 0 25%, transparent 0 50%) ${tile}`,
    // stripes, thin or thick
    () => `repeating-linear-gradient(0deg, ${w} 0 ${t}%, transparent 0 ${z}%)`,
    // two-tone stripes
    () => `repeating-linear-gradient(0deg, ${w} 0 ${t}%, transparent 0 ${z / 2}%, ${w2} 0 ${z / 2 + t / 2}%, transparent 0 ${z}%)`,
    // polka dots
    () => `radial-gradient(circle, ${w} 0 ${a(18, 34)}%, transparent 0) ${tile}`,
    // staggered dots
    () => `radial-gradient(circle, ${w} 0 22%, transparent 0) 0 0 / ${z}% ${z}%, radial-gradient(circle, ${w2} 0 22%, transparent 0) ${z / 2}% ${z / 2}% / ${z}% ${z}%`,
    // ring dots
    () => `radial-gradient(circle, transparent 0 18%, ${w} 0 30%, transparent 0) ${tile}`,
    // grid
    () => `linear-gradient(${w} 0 ${t / 2}%, transparent 0) ${tile}, linear-gradient(90deg, ${w} 0 ${t / 2}%, transparent 0) ${tile}`,
    // crosshatch
    () => `repeating-linear-gradient(45deg, ${w} 0 ${t / 2}%, transparent 0 ${z / 2}%), repeating-linear-gradient(-45deg, ${w2} 0 ${t / 2}%, transparent 0 ${z / 2}%)`,
    // plaid
    () => `repeating-linear-gradient(0deg, ${w} 0 ${t}%, transparent 0 ${z}%), repeating-linear-gradient(90deg, ${w2} 0 ${t * 1.5}%, transparent 0 ${z * 1.3}%)`,
    // concentric rings around the middle
    () => `repeating-radial-gradient(circle, ${w} 0 ${t / 2}%, transparent 0 ${z / 2}%)`,
    // rings around a point off to one side
    () => `repeating-radial-gradient(circle at ${a(10, 90)}% ${a(10, 90)}%, ${w} 0 ${t / 2}%, transparent 0 ${z / 2}%)`,
    // sunburst rays
    () => `repeating-conic-gradient(from ${a(0, 90)}deg, ${w} 0 ${a(4, 10)}deg, transparent 0 ${a(16, 30)}deg)`,
    // pinwheel (rays from off-centre)
    () => `repeating-conic-gradient(from 0deg at ${a(25, 75)}% ${a(25, 75)}%, ${w} 0 ${a(8, 16)}deg, transparent 0 ${a(24, 45)}deg)`,
    // diamonds
    () => `conic-gradient(from 45deg, ${w} 0 25%, transparent 0 50%, ${w} 0 75%, transparent 0) ${tile}`,
    // triangles / sawtooth
    () => `linear-gradient(135deg, ${w} 0 25%, transparent 0 50%, ${w2} 0 75%, transparent 0) ${tile}`,
    // zigzag
    () => `linear-gradient(135deg, ${w} 25%, transparent 25%) -${z / 2}% 0 / ${z}% ${z}%, linear-gradient(225deg, ${w} 25%, transparent 25%) -${z / 2}% 0 / ${z}% ${z}%, linear-gradient(315deg, ${w} 25%, transparent 25%) 0 0 / ${z}% ${z}%, linear-gradient(45deg, ${w} 25%, transparent 25%) 0 0 / ${z}% ${z}%`,
    // scales / scallops
    () => `radial-gradient(circle at 50% 0, transparent 0 ${a(38, 46)}%, ${w} 0 ${a(52, 60)}%, transparent 0) ${tile}`,
    // weave
    () => `linear-gradient(90deg, ${w} 0 50%, transparent 0) 0 0 / ${z}% ${z / 2}%, linear-gradient(${w2} 0 50%, transparent 0) ${z / 2}% 0 / ${z}% ${z}%`,
    // bricks
    () => `linear-gradient(${w} 0 ${t / 2}%, transparent 0) 0 0 / ${z}% ${z / 2}%, linear-gradient(90deg, ${w} 0 ${t / 2}%, transparent 0) 0 0 / ${z}% ${z}%, linear-gradient(90deg, ${w} 0 ${t / 2}%, transparent 0) ${z / 2}% ${z / 2}% / ${z}% ${z}%`,
    // speckles: a few dot sizes on different tiles
    () => [7, 11, 17].map((q, i) => `radial-gradient(circle, ${i ? w2 : w} 0 ${a(10, 22)}%, transparent 0) ${a(0, 50)}% ${a(0, 50)}% / ${Math.round(z * q / 11)}% ${Math.round(z * q / 11)}%`).join(', '),
    // soft bands (waves of light)
    () => `repeating-linear-gradient(0deg, transparent 0, ${w} ${z / 4}%, transparent ${z / 2}%)`,
    // half the ball shaded, a split
    () => `linear-gradient(0deg, ${w} 0 ${a(35, 65)}%, transparent 0)`,
  ];
  return [kinds[Math.floor(r() * kinds.length)](), Math.round(r() * 180)];
}

// what goes inside a ball: the colour swirl, or for a combo its orbs, packed in a circle
function orbInner(l) {
  if (!l?.combo) return '<i class="swirl"></i>';
  const parts = l.combo.map((id) => byId[id]).filter(Boolean);
  const n = parts.length;
  // up to five around the middle; more get one in the middle and the rest around it
  const mid = n > 5;
  const ring = mid ? n - 1 : n;
  const d = n === 1 ? 70 : mid ? 36 : [0, 0, 52, 48, 44, 40][n];
  const R = n === 1 ? 0 : mid ? 33 : [0, 0, 25, 27, 29, 31][n];
  const r = rng(hash(l.id));
  return parts.map((p, i) => {
    const k = mid ? i - 1 : i;
    const ang = (k / ring) * Math.PI * 2 - Math.PI / 2 + (r() - 0.5) * 0.3;
    const rad = mid && i === 0 ? 0 : R;
    const x = 50 + Math.cos(ang) * rad, y = 50 + Math.sin(ang) * rad;
    // three points of a little loop each bubble wanders through (and swells / shrinks on the way),
    // each at its own pace, so they squirm against each other as the combo falls
    const w = () => `${((r() - 0.5) * 34).toFixed(1)}%`;
    const sz = () => (0.9 + r() * 0.2).toFixed(2);
    const loop = `--ax:${w()};--ay:${w()};--as:${sz()};--bx:${w()};--by:${w()};--bs:${sz()};--cx:${w()};--cy:${w()};--cs:${sz()};--t:${(1.8 + r() * 1.6).toFixed(2)}s`;
    return `<i class="bub${p.dark ? ' dark' : ''}" style="--c:${tone(p.color ?? p.colors?.[0])};--g:${ctint(p)};--x:${x.toFixed(1)}%;--y:${y.toFixed(1)}%;--d:${(d * (0.92 + r() * 0.16)).toFixed(1)}%;--k:${i};${loop}"></i>`;
  }).join('');
}

function makeSat(layer) {
  const el = document.createElement('div');
  el.className = 'sat';
  paint(el, layer);
  el.innerHTML = '<i class="swirl"></i>';
  ui.sats.append(el);
  return el;
}

// ---------- falling orbs ----------
// Orbs drift down the field; near the bottom they shrink and fade out. New ones keep
// coming in from the top so about target() are on screen.

// phones (orbsMobile.js) have a smaller field: fewer orbs, so their names stay readable
const baseTarget = () => (isPhone.matches ? 10 : 16);
// Each click on the empty field lets 1 more orb fall for a while (up to 25 in all, 15 on a
// phone); a moment after the last click the extra goes away again, one orb a second.
const EXTRA_STEP = 1, EXTRA_GRACE = 1200;
const extraMax = () => (isPhone.matches ? 15 : 25) - baseTarget();
let extra = 0, extraAt = 0, extraTrim = 0;
const target = () => baseTarget() + Math.floor(extra);
function addExtra() {
  extra = Math.min(extraMax(), Math.floor(extra) + EXTRA_STEP);
  extraAt = performance.now();
}
// lets the extra run down after the grace and takes one orb off the field for every step it
// loses (the one lowest down, so it looks like it fell out)
function decayExtra(dt, now) {
  if (extra <= 0 || now - extraAt < EXTRA_GRACE) return;
  const before = Math.floor(extra);
  extra = Math.max(0, extra - dt);
  extraTrim += before - Math.floor(extra);
}
function trimExtra() {
  if (!extraTrim) return;
  if (rain.length <= target()) return void (extraTrim = 0);
  const o = rain.filter((r) => r.id !== hover && !r.hold && r !== comboOrb).sort((a, b) => b.y - a.y)[0];
  if (o) vanish(o);
  extraTrim--;
}
const rain = []; // { id, el, x, y, v }: centre in field coordinates, fall speed in px/s
let lastSpawn = 0;

const fieldSize = () => ({ w: ui.field.clientWidth, h: ui.field.clientHeight });
// The stems and the edit tab slide up over the field like overlays: the rain keeps the field's
// whole height and falls on behind them (clipped by the field), so closing them shows the orbs
// where they were instead of a bunch freshly spawned at the top. On a phone the tab already
// overlays the field (and the stems are hidden), so the field itself is the whole height.
const rainSize = () => {
  const s = fieldSize();
  if (!isPhone.matches) s.h += ui.stem.offsetHeight + ui.roll.offsetHeight;
  return s;
};

// what the slots did to an orb, for tooltips: " · 음량 80% · #1234"
function slotTag(id) {
  const n = volStep(id), seed = heldSeed.get(id) ?? ownSeed.get(id);
  const what = byId[id]?.cat === 'mood' ? `${ot('slotFxWhat')} ${n > 0 ? '+' : ''}${n}` : `${ot('slotGainWhat')} ${gainPct(stepGain(n))}%`;
  return (n ? ` · ${what}` : '') + (seed != null ? ` · #${seed}` : '');
}

function makeOrbEl(id) {
  const l = byId[id];
  const el = document.createElement('div');
  el.className = 'orb' + (l.combo ? ' big' : '');
  el.dataset.id = id;
  paint(el, l);
  el.style.setProperty('--dur', (3 + Math.random() * 3).toFixed(2) + 's');
  el.style.setProperty('--delay', (-Math.random() * 5).toFixed(2) + 's');
  el.innerHTML = `<div class="fade"><div class="float"><span class="label">${l.name}</span><div class="ball">${orbInner(l)}</div><span class="kind">${l.kind ?? ''}</span></div></div>`;
  const ball = el.querySelector('.ball');
  ball.addEventListener('pointerdown', (e) => grabFromRain(e, el));
  ball.addEventListener('mouseenter', () => hoverOn(el.dataset.id, 'field'));
  ball.addEventListener('mouseleave', hoverOff);
  return el;
}

function rainAdd(id, x, y, { pop = false, el = makeOrbEl(id) } = {}) {
  el.classList.remove('dragging', 'flying', 'absorb', 'ejected');
  el.classList.toggle('spawn', pop);
  if (pop) setTimeout(() => el.classList.remove('spawn'), 600);
  ui.field.append(el);
  taste.landed(id); // back in the field after being picked up: turned down
  const o = { id, el, x, y, v: 14 + Math.random() * 10 };
  rain.push(o);
  placeRain(o, rainSize());
}

function placeRain(o, { w, h }) {
  o.x = Math.min(Math.max(o.x, 50), Math.max(50, w - 50));
  o.el.style.left = o.x + 'px';
  o.el.style.top = o.y + 'px';
  const fadeFrom = h * 0.68;
  const t = Math.min(1, Math.max(0, (o.y - fadeFrom) / (h - fadeFrom)));
  const fade = o.el.firstChild;
  fade.style.transform = `scale(${1 - 0.7 * t})`;
  fade.style.opacity = 1 - t;
}

function vanish(o) {
  rain.splice(rain.indexOf(o), 1);
  o.el.classList.add('vanish');
  setTimeout(() => o.el.remove(), 400);
}

// Dev only, for listening tests: ?only=new drops just the newest orbs (block FX, dub techno and
// the sampled instruments, other scales, line variations, concert percussion and the chip / ambient / world batch), ?only=fx, ?only=dub, ?only=inst, ?only=scale, ?only=var, ?only=ac or ?only=vibe one of those sets, ?only=id1,id2 just those orbs. Every other orb can
// still be found with the search.
const ONLY = import.meta.env.DEV ? new URLSearchParams(location.search).get('only') : null;
const ONLY_SETS = { new: (l) => l.spot || !!l.tag, fx: (l) => l.spot, dub: (l) => l.tag === 'dubtechno', inst: (l) => l.tag === 'instruments', scale: (l) => l.tag === 'scales', var: (l) => l.tag === 'variations', ac: (l) => l.tag === 'acoustic', vibe: (l) => l.tag === 'vibes' };
const onlyIds = ONLY && new Set(ONLY_SETS[ONLY] ? LAYERS.filter(ONLY_SETS[ONLY]).map((l) => l.id) : ONLY.split(','));

// The opening rain: until an orb goes into the song (put), only orbs that play at once fall, i.e.
// every sound is a synth or a drum hit decoded on the boot screen (samples.js). VCSL, piano,
// the sampled basses and the like load on first use, so they wait. Nothing falls before boot ends.
let opening = true;
let bootDone = false;
const instant = (l) => (l.combo ? l.combo.map((c) => byId[c]) : [l]).every((x) => x && (x.samples ?? []).every(isBooted));
// Pick a layer to drop in, favouring parts the song doesn't have yet and orbs not already shown.
function pickCandidate() {
  const shown = new Set([...active.keys(), ...rain.map((o) => o.id), ...stash, ...slotIds()]);
  const activeCats = new Set(layers().map((l) => l.cat));
  const early = active.size < SOUND_FIRST;
  const from = onlyIds ? LAYERS.filter((l) => onlyIds.has(l.id)) : LAYERS;
  // before the very first orb goes in, only the plain band parts fall (no fx, moods, combos …)
  const first = !firstOrbDone;
  if (opening && !bootDone && !onlyIds) return null;
  const allowed = (l) => onlyIds || (!(early && noSound(l)) && !(l.combo && comboHeld()) && (!first || FIRST_CATS.has(l.cat)) && (!opening || instant(l)));
  let pool = from.filter((l) => allowed(l) && !shown.has(l.id) && !(l.combo && l.combo.every((c) => active.has(c))));
  if (!pool.length && !onlyIds) pool = from.filter((l) => allowed(l) && !active.has(l.id));
  if (!pool.length) return null;
  const w = spawnWeights(pool, activeCats);
  let x = Math.random() * w.reduce((s, v) => s + v, 0);
  for (let i = 0; i < pool.length; i++) if ((x -= w[i]) < 0) return pool[i].id;
  return pool.at(-1).id;
}

// Weight of each candidate (see CAT_SHARE in orbCatalog.js): the category's fixed share, more for
// parts the song is missing and less for helpers (combos, moods, keys, tempos); split over the
// category's sound families by √size; split evenly inside a family. Block FX (spot) are accents
// for one place in a stem song, so their family falls far less often. The other-scale family is
// held at SCALE_SHARE of its category instead, so it can keep growing without taking over.
const SCALE_SHARE = 0.3;
function spawnWeights(pool, activeCats) {
  const fams = new Map(); // cat -> Map(family -> count)
  for (const l of pool) {
    const m = fams.get(l.cat) ?? fams.set(l.cat, new Map()).get(l.cat);
    m.set(l.family, (m.get(l.family) ?? 0) + 1);
  }
  const famWeight = (fam, n) => Math.sqrt(n) * (fam === 'block fx' && !onlyIds ? 0.15 : 1);
  // the other-scale orbs take a fixed share of their category (SCALE_SHARE), however many there are
  const famWeights = new Map([...fams].map(([cat, m]) => {
    const w = new Map([...m].map(([f, n]) => [f, famWeight(f, n)]));
    const rest = [...w].reduce((s, [f, x]) => s + (f === 'other scales' ? 0 : x), 0);
    if (w.has('other scales') && rest > 0) w.set('other scales', (rest * SCALE_SHARE) / (1 - SCALE_SHARE));
    return [cat, w];
  }));
  const catTotal = new Map([...famWeights].map(([cat, w]) => [cat, [...w.values()].reduce((s, x) => s + x, 0)]));
  if (onlyIds) return pool.map(() => 1);
  const w = pool.map((l) => {
    const n = fams.get(l.cat).get(l.family);
    const cat = (CAT_SHARE[l.cat] ?? 20) * (activeCats.has(l.cat) ? 1 : 4) * (l.combo || l.fx || l.duck || l.bpm || l.mode ? 0.25 : 1);
    return (cat * famWeights.get(l.cat).get(l.family)) / catTotal.get(l.cat) / n;
  });
  // then, inside each category, towards orbs that fit the song, or away from it after turn-downs
  return taste.reweigh(pool, w);
}

// a spot near the top, away from the orbs that just came in
function pickX(w) {
  let best = w / 2, bestD = -1;
  for (let k = 0; k < 10; k++) {
    const x = 60 + Math.random() * Math.max(1, w - 120);
    const d = Math.min(999, ...rain.filter((o) => o.y < 170).map((o) => Math.abs(o.x - x)));
    if (d > bestD) [best, bestD] = [x, d];
  }
  return best;
}

// Hovering an orb in the field or the stash previews it in the song while the mouse stays
// on it (the orb stops falling meanwhile); a short delay keeps quick passes from flickering.
let hoverTimer;
// true while playback was started only to preview a hovered orb (the song was stopped): only
// that orb sounds, and it stops again when the mouse leaves
let previewOnly = false;
// a falling orb heard on hover and then left alone counts as turned down (src/orbTaste.js)
let heard = null; // { id, from, at }
function hoverOn(id, from = null) {
  clearTimeout(hoverTimer);
  warm([byId[id]]);
  hoverTimer = setTimeout(async () => {
    if (hover === id) return;
    hover = id;
    heard = { id, from, at: performance.now() };
    if (!started) {
      // browsers only let audio start after the page has been clicked or typed into once
      if (!audioUnlocked()) {
        ui.soloHint.textContent = ot('hoverHint');
        return;
      }
      await ensureStarted();
      if (hover !== id) return; // the mouse left while the audio was loading
    }
    describe(byId[id], ot('previewing'));
    renderRoles();
    if (!playing) {
      previewOnly = true;
      await play();
    } else syncSoon();
  }, 160);
}
function hoverOff() {
  clearTimeout(hoverTimer);
  if (!hover) return;
  if (heard?.id === hover && heard.from === 'field' && started) taste.previewLeft(hover, (performance.now() - heard.at) / 1000);
  heard = null;
  hover = null;
  hoverMix = false;
  describe(solo && byId[solo]);
  renderRoles();
  if (previewOnly) stop();
  else syncSoon();
}

// holding the mouse down on the empty field makes the orbs pour down faster
let boost = 1, boostTarget = 1, bgY = 0;
ui.field.addEventListener('pointerdown', (e) => {
  if (e.target !== ui.field) return;
  e.preventDefault();
  boostTarget = Math.max(7, fallSpeed);
  addExtra();
  // a click on the field tucks the open MIDI pane away, so there's room to pick orbs
  if (document.body.classList.contains('roll-full')) document.body.classList.add('roll-min');
});
let held = false;
ui.field.addEventListener('pointerdown', (e) => e.target === ui.field && (held = true));
const release = () => ((held = false), (swipe = null), (boostTarget = fallSpeed));
for (const t of ['pointerup', 'pointercancel']) window.addEventListener(t, release);
ui.field.addEventListener('pointerleave', release);

// The wheel over the field sets how fast the orbs (and the art behind them) fall: down is faster,
// up is slower. The level stays put; a small slider on the field's right edge shows it only
// while it is being changed.
const SPEED_MIN = 0.25, SPEED_MAX = 6;
let fallSpeed = 1;
const speedEl = document.createElement('div');
speedEl.className = 'speed-meter';
speedEl.innerHTML = '<div class="track"><div class="fill"></div><div class="knob"></div><div class="mark"></div></div><span class="val"></span>';
ui.field.append(speedEl);
const speedFrac = (v) => Math.log(v / SPEED_MIN) / Math.log(SPEED_MAX / SPEED_MIN);
speedEl.style.setProperty('--one', speedFrac(1));
let speedHide = 0;
function showSpeed() {
  speedEl.style.setProperty('--f', speedFrac(fallSpeed).toFixed(3));
  speedEl.querySelector('.val').textContent = `×${fallSpeed < 1 ? fallSpeed.toFixed(2) : fallSpeed.toFixed(1)}`;
  speedEl.classList.add('show');
  clearTimeout(speedHide);
  speedHide = setTimeout(() => speedEl.classList.remove('show'), 900);
}
ui.field.addEventListener('wheel', (e) => {
  if (e.target.closest('.field-tools')) return;
  e.preventDefault();
  const dy = e.deltaY * (e.deltaMode === 1 ? 33 : e.deltaMode === 2 ? 400 : 1);
  setSpeed(fallSpeed * Math.exp(dy * 0.0015));
}, { passive: false });
function setSpeed(v) {
  // settle on ×1 when passing through it, so normal speed is easy to get back to
  if ((fallSpeed - 1) * (v - 1) < 0) v = 1;
  fallSpeed = Math.min(SPEED_MAX, Math.max(SPEED_MIN, v));
  if (!held) boostTarget = fallSpeed;
  showSpeed();
}
// A phone has no wheel: a swipe on the empty field does the same, down faster, up slower. A press
// that stays put still pours the orbs down while held; once it moves it is a swipe instead.
let swipe = null; // { y0, y, on }
ui.field.addEventListener('pointerdown', (e) => {
  if (e.target === ui.field && isPhone.matches) swipe = { y0: e.clientY, y: e.clientY, on: false };
});
window.addEventListener('pointermove', (e) => {
  if (!swipe) return;
  if (!swipe.on) {
    if (Math.abs(e.clientY - swipe.y0) < 14) return;
    swipe.on = true;
    swipe.y = e.clientY;
    held = false; // not a hold any more: the pour stops
  }
  setSpeed(fallSpeed * Math.exp((e.clientY - swipe.y) * 0.01));
  swipe.y = e.clientY;
}, { passive: true });

// optional background art for the field: an image at public/orbs-field.webp, tiled vertically
// It lives on its own layer that is only moved (transform), so the drift doesn't repaint the
// whole field every frame the way animating background-position did.
const fieldArt = new Image();
const artEl = document.createElement('div');
artEl.className = 'field-art';
ui.field.prepend(artEl);
let artTile = 0, artW = 0;
fieldArt.onload = () => ui.field.style.setProperty('--field-bg', `url(${fieldArt.src})`);
// relative to the site base: on GitHub Pages the site lives under /<repo>/, so '/orbs-field.webp' would 404
fieldArt.src = `${import.meta.env.BASE_URL}orbs-field.webp`;

function updateRain(dt, now) {
  const size = rainSize();
  decayExtra(dt, now);
  trimExtra();
  // while extra orbs are out the rain also keeps falling a little faster (×1.5 at the most)
  if (!held) boostTarget = fallSpeed * (1 + (0.5 * extra) / Math.max(1, extraMax()));
  boost += (boostTarget - boost) * Math.min(1, dt * 5);
  ui.field.classList.toggle('rush', boost > 2);
  if (fieldArt.naturalWidth) {
    // one tile is the image scaled to the field's width; the layer is a tile taller than the
    // field and slides down through one tile, then wraps
    if (artW !== size.w) {
      artW = size.w;
      artTile = (size.w * fieldArt.naturalHeight) / fieldArt.naturalWidth;
    }
    artEl.style.height = `${size.h + artTile}px`;
    bgY = (bgY + 10 * boost * dt) % artTile;
    artEl.style.transform = `translate3d(0, ${(bgY - artTile).toFixed(1)}px, 0)`;
  }
  for (const o of [...rain]) {
    if (o.id !== hover && !o.hold) o.y += o.v * boost * dt;
    if (o === comboOrb && !o.told && o.y >= size.h / 4) {
      o.told = true;
      explainCombo(o);
    }
    if (o.y > size.h + 20) {
      o.el.remove();
      rain.splice(rain.indexOf(o), 1);
    } else placeRain(o, size);
  }
  // the guide's combo: dropped once the volume tip is over (again if the first one was grabbed
  // or fell out before it was explained)
  if (comboOrb && !comboOrb.told && !rain.includes(comboOrb)) comboOrb = null;
  if (comboDue && comboHeld() && !comboOrb) comboOrb = dropCombo(size);
  let every = ((size.h + 80) / 19 / target() / boost) * 1000;
  if (extra > 0) every = Math.min(every, 700); // the extra orbs come in a little sooner
  if (rain.length < target() && now - lastSpawn > every) {
    lastSpawn = now;
    const id = pickCandidate();
    if (id) {
      forget(id);
      rainAdd(id, pickX(size.w), -40);
    }
  }
}

function seedRain() {
  for (const o of [...rain]) vanish(o);
  const { w, h } = rainSize();
  const n = target();
  for (let i = 0; i < n; i++) {
    const id = pickCandidate();
    if (id) forget(id);
    if (id) rainAdd(id, 60 + Math.random() * Math.max(1, w - 120), (i / n) * h * 0.85 + 10, { pop: true });
  }
  lastSpawn = performance.now();
}

// ---------- stash (right sidebar) ----------

const STASH_MAX = 20;
const stash = []; // orb ids

function renderStash() {
  saveSessionSoon();
  ui.stashSlots.innerHTML = '';
  for (let i = 0; i < STASH_MAX; i++) {
    const cell = document.createElement('div');
    cell.className = 'cell';
    const id = stash[i];
    if (id) {
      const b = document.createElement('div');
      b.className = 'mini';
      b.title = byId[id].name + slotTag(id);
      paint(b, byId[id]);
      b.innerHTML = orbInner(byId[id]);
      b.addEventListener('pointerdown', (e) => grabFromStash(e, i));
      b.addEventListener('mouseenter', () => hoverOn(id));
      b.addEventListener('mouseleave', hoverOff);
      cell.append(b);
    }
    ui.stashSlots.append(cell);
  }
}

function storeInStash(el, home) {
  if (stash.length >= STASH_MAX) {
    bump(ui.stash, 'reject');
    return false;
  }
  taste.clear(el.dataset.id); // kept for later: neither for nor against
  stash.push(home?.kind === 'roll' ? takeFromRoll().id : el.dataset.id);
  el.remove();
  renderStash();
  bump(ui.stash, 'gulp');
  return true;
}

// ---------- grabbing, dropping, throwing ----------

function coreCenter() {
  const r = ui.core.getBoundingClientRect();
  // the drop zone can be tightened from CSS (--drop-pad, --drop-pull): the phone layout keeps
  // it to the ring so orbs taken out of the song right under the player don't fall back in
  const cs = getComputedStyle(ui.core);
  const pad = parseFloat(cs.getPropertyValue('--drop-pad')) || 50;
  const pull = parseFloat(cs.getPropertyValue('--drop-pull')) || 3;
  return { x: r.left + r.width / 2, y: r.top + r.height / 2, rad: r.width / 2 + 50, drop: r.width / 2 + pad, pull };
}
const inRect = (el, x, y) => {
  const r = el.getBoundingClientRect();
  return x >= r.left && x <= r.right && y >= r.top && y <= r.bottom;
};
const overCore = (x, y) => {
  const c = coreCenter();
  return Math.hypot(x - c.x, y - c.y) < c.drop;
};
// The five orb slots under the field. Throwing an orb into 편집 opens its tab (the piano roll,
// #roll, above the slots); the volume and variation slots change the orb and keep it, jiggling, in
// the slot until it is grabbed out again. What a slot did stays with the orb wherever it goes next.
// 복제 leaves the orb as it is and puts a copy of it (variation and volume included) in the stash.
const SLOTS = ['midi', 'quieter', 'louder', 'vary', 'copy'];
// the slots that keep an orb sitting in them (편집 too, once its tab is closed with 수정 완료)
const FX_SLOTS = ['quieter', 'louder', 'vary', 'copy', 'midi'];
const slotOrbs = {}; // mode -> { id, home }: the orb sitting in a slot
const slotIds = () => FX_SLOTS.map((m) => slotOrbs[m]?.id).filter(Boolean);
const slotEls = Object.fromEntries(SLOTS.map((m) => [m, ui.slots.querySelector(`[data-slot="${m}"]`)]));
// which orbs a slot takes: 편집 needs an instrument to draw with, the volume slots an orb that
// plays a part of its own (up to three steps each way), 변주 an orb whose notes change with the seed
function accepts(mode, l) {
  if (!l) return false;
  if (mode === 'midi') return !!l.voice;
  if (mode === 'vary') return seeded(l);
  // a mood orb: 약하게 / 세게 turn its effects down / up instead of a volume
  if (!l.code && (mode === 'quieter' || mode === 'louder') && fxScalable(l)) {
    return mode === 'quieter' ? volStep(l.id) > -VOL_STEPS : volStep(l.id) < VOL_STEPS;
  }
  if (!l.code) return false;
  if (mode === 'copy') return !l.combo;
  return mode === 'quieter' ? volStep(l.id) > -VOL_STEPS : volStep(l.id) < VOL_STEPS;
}
// the slot under (x, y): one of the five, or the open tab (the same as its slot)
// On a phone the slots (편집 included) are always out; on wide screens the guide's steps open them.
const hasCls = (c) => document.body.classList.contains(c);
const slotsOn = () => isPhone.matches || hasCls('roll-ready');
const midiOn = () => isPhone.matches || hasCls('midi-ready');
function slotAt(x, y) {
  if (!slotsOn()) return null;
  const midi = midiOn();
  for (const m of SLOTS) if ((m !== 'midi' || midi) && inRect(slotEls[m], x, y)) return m;
  if (midi && rollOrb && inRect(ui.roll, x, y)) return 'midi';
  return null;
}
const overStash = (x, y) => inRect(ui.stash, x, y);

function grabFromRain(e, el) {
  const o = rain.find((q) => q.el === el);
  if (!o) return;
  rain.splice(rain.indexOf(o), 1);
  taste.grab(o.id); // before hoverOff: picking it up isn't leaving it
  hoverOff();
  const { w, h } = fieldSize();
  const fr = ui.field.getBoundingClientRect();
  startDrag(e, el, { kind: 'field', fx: o.x / w, fy: o.y / h }, { x: fr.left + o.x, y: fr.top + o.y });
}

// drag one of the song's own orbs out of the list under the player
function grabFromSong(e, id) {
  const a = active.get(id);
  if (!a) return;
  const r = e.currentTarget.getBoundingClientRect();
  countMove();
  removeLayer(id, { silent: true, respawn: false });
  startDrag(e, makeOrbEl(id), { kind: 'active', home: a.home }, { x: r.left + r.width / 2, y: r.top + r.height / 2 });
}

// Phones (orbsMobile.js): a tap on a stashed orb puts it into the song; moving the finger
// still picks it up as on desktop.
function tapOrDrag(e, tap, drag) {
  e.preventDefault();
  const x0 = e.clientX, y0 = e.clientY;
  const off = () => {
    window.removeEventListener('pointermove', move);
    window.removeEventListener('pointerup', up);
    window.removeEventListener('pointercancel', off);
  };
  const move = (ev) => {
    if (Math.hypot(ev.clientX - x0, ev.clientY - y0) < 8) return;
    off();
    drag(ev);
  };
  const up = () => {
    off();
    tap();
  };
  window.addEventListener('pointermove', move);
  window.addEventListener('pointerup', up);
  window.addEventListener('pointercancel', off);
}
export function stashToSong(i) {
  const id = stash[i];
  if (!id) return;
  stash.splice(i, 1);
  renderStash();
  ui.core.style.setProperty('--gulp', ctint(byId[id]));
  bump(ui.core, 'gulp');
  addLayer(id, { kind: 'stash', index: i });
}

function grabFromStash(e, i, moved = false) {
  if (isPhone.matches && !moved) return tapOrDrag(e, () => stashToSong(i), (ev) => grabFromStash(ev, i, true));
  hoverOff();
  const id = stash.splice(i, 1)[0];
  renderStash();
  startDrag(e, makeOrbEl(id), { kind: 'stash', index: i }, { x: e.clientX, y: e.clientY });
}

// id: the orb being moved, when there is one. A slot only lights up for orbs it can take; while
// an orb is held, the slots that would turn it away (mood, tempo and key orbs …) dim.
function highlight(x, y, id = null) {
  const core = x !== null && overCore(x, y);
  const l = x !== null && id ? byId[id] : null;
  const at = l && !core ? slotAt(x, y) : null;
  ui.core.classList.toggle('hot', core);
  for (const m of SLOTS) {
    slotEls[m].classList.toggle('hot', at === m && accepts(m, l));
    slotEls[m].classList.toggle('off', !!l && !accepts(m, l));
  }
  ui.roll.classList.toggle('hot', !!at && at === rollOrb?.mode && inRect(ui.roll, x, y) && accepts(at, l));
  ui.stash.classList.toggle('hot', !core && x !== null && overStash(x, y));
}

function startDrag(e, el, home, anchor) {
  e.preventDefault();
  const held = el.dataset.id;
  warm([byId[held]]);
  // a held orb is auditioned on its own; over the player it is heard with the song
  if (started && home.kind !== 'roll') {
    hover = held;
    hoverMix = false;
    syncSoon();
  }
  const off = { x: e.clientX - anchor.x, y: e.clientY - anchor.y };
  el.classList.remove('spawn', 'flying', 'vanish');
  el.classList.add('dragging');
  el.firstChild.style.transform = '';
  el.firstChild.style.opacity = '';
  document.body.append(el);
  const trail = [];
  const move = (ev) => {
    const x = ev.clientX - off.x, y = ev.clientY - off.y;
    el.style.left = x + 'px';
    el.style.top = y + 'px';
    trail.push({ x, y, t: performance.now() });
    if (trail.length > 10) trail.shift();
    highlight(x, y, held);
    if (hover === held && overCore(x, y) !== hoverMix) {
      hoverMix = !hoverMix;
      syncSoon();
    }
  };
  move(e);
  const up = (ev) => {
    window.removeEventListener('pointermove', move);
    window.removeEventListener('pointerup', up);
    window.removeEventListener('pointercancel', up);
    highlight(null);
    if (hover === held) {
      hover = null;
      hoverMix = false;
      syncSoon();
    }
    const x = ev.clientX - off.x, y = ev.clientY - off.y;
    if (ev.type !== 'pointerup') return goHome(el, home);
    if (land(el, home, x, y)) return;
    // released while moving fast: throw it
    const now = performance.now();
    const old = trail.find((p) => now - p.t < 110) ?? trail[0];
    const dt = (now - old.t) / 1000;
    const vx = dt > 0.012 ? (x - old.x) / dt : 0, vy = dt > 0.012 ? (y - old.y) / dt : 0;
    if (home.kind === 'active') {
      // taken out of the song: it stays where it was let go; only a hard flick to the right
      // (towards the stash) sends it straight into the stash
      if (vx > 900 && vx > Math.abs(vy) * 1.2 && storeInStash(el, home)) return;
      return settle(el, home, x, y);
    }
    // thrown upwards out of a slot under the field: a short hop up into the field, never into the song
    if (home.kind === 'slot' && vy < -450 && -vy > Math.abs(vx)) return hopUp(el, home, x, y, vx, vy);
    if (Math.hypot(vx, vy) > 450) fling(el, home, x, y, vx, vy);
    else settle(el, home, x, y);
  };
  window.addEventListener('pointermove', move);
  window.addEventListener('pointerup', up);
  window.addEventListener('pointercancel', up);
}

// Drop on whatever is under (x, y). Returns true when the orb was taken care of.
// thrown: called along a throw's flight (an orb thrown out of a slot isn't caught by it again)
function land(el, home, x, y, thrown = false) {
  if (overCore(x, y)) {
    absorb(el, home);
    return true;
  }
  const m = slotAt(x, y);
  // over the slot it was just taken out of: a throw starting there flies on; let go there, a
  // volume / variation slot does its job once more (grab, drop, grab, drop … turns it down step by
  // step), and 편집's orb just goes back
  const own = home.kind === 'roll' ? 'midi' : home.kind === 'slot' ? home.mode : null;
  if (m && m === own && home.kind === 'slot' && !thrown) {
    if (pickForSlot(el.dataset.id, home.origin, m)) el.remove();
    else goHome(el, home);
    return true;
  }
  if (m && m !== own) {
    if (home.kind === 'roll') {
      // on into another slot, keeping the drawing / seed
      const t = takeFromRoll();
      if (!pickForSlot(t.id, t.home, m)) returnOrb(t.id, t.home);
      el.remove();
      sync();
      return true;
    }
    // the orb moves into the slot and stays there (in 편집, as its instrument)
    const origin = home.kind === 'active' ? home.home : home.kind === 'slot' ? home.origin : home;
    if (pickForSlot(el.dataset.id, origin, m)) el.remove();
    else goHome(el, home);
    return true;
  }
  if (overStash(x, y)) return storeInStash(el, home);
  return false;
}

// Let go somewhere neutral: inside the field it keeps falling from there, otherwise it goes home.
function settle(el, home, x, y) {
  if (home.kind === 'roll') {
    // let go of the 편집 orb anywhere else: it goes back to where it came from
    if (!inRect(ui.field, x, y) && !inRect(ui.stash, x, y)) return goHome(el, home);
    el.remove();
    sendRollOrbHome();
    return;
  }
  if (!inRect(ui.field, x, y)) return goHome(el, home);
  const fr = ui.field.getBoundingClientRect();
  rainAdd(el.dataset.id, x - fr.left, y - fr.top, { el });
}

function goHome(el, home) {
  // an orb taken out of the song and dropped nowhere in particular goes back in
  if (home.kind === 'active') return absorb(el, home.home);
  const id = el.dataset.id;
  let tx, ty;
  if (home.kind === 'roll' || home.kind === 'slot') {
    const r = (home.kind === 'roll' ? ui.rollSlot : slotEls[home.mode]).getBoundingClientRect();
    [tx, ty] = [r.left + r.width / 2, r.top + r.height / 2];
  } else if (home.kind === 'stash') {
    const cell = ui.stashSlots.children[Math.min(home.index, stash.length)];
    const r = (cell ?? ui.stash).getBoundingClientRect();
    [tx, ty] = [r.left + r.width / 2, r.top + r.height / 2];
  } else {
    const fr = ui.field.getBoundingClientRect();
    [tx, ty] = [fr.left + home.fx * fr.width, fr.top + Math.min(home.fy, 0.65) * fr.height];
  }
  el.classList.add('flying');
  el.style.left = tx + 'px';
  el.style.top = ty + 'px';
  setTimeout(() => {
    if (home.kind === 'roll') {
      el.remove();
      rollOrb.grabbed = false;
      renderRollHead();
    } else if (home.kind === 'slot') {
      // back into its slot as it was (somebody else's orb there now: it goes where it came from)
      el.remove();
      if (slotOrbs[home.mode]) returnOrb(id, home.origin);
      else {
        slotOrbs[home.mode] = { id, home: home.origin };
        renderSlots();
      }
    } else if (home.kind === 'stash' && stash.length < STASH_MAX) {
      stash.splice(Math.min(home.index, stash.length), 0, id);
      renderStash();
      el.remove();
    } else {
      const fr = ui.field.getBoundingClientRect();
      rainAdd(id, tx - fr.left, ty - fr.top, { el });
    }
  }, 360);
}

// An orb thrown up out of a slot: it lands a little above where it was let go (further for a
// harder throw), inside the field and clear of the player's drop zone, then falls from there.
function hopUp(el, home, x, y, vx, vy) {
  const fr = ui.field.getBoundingClientRect();
  const pad = 30;
  let tx = x + Math.max(-120, Math.min(120, vx * 0.12));
  let ty = y - Math.min(260, 120 + (-vy - 450) * 0.08);
  tx = Math.max(fr.left + pad, Math.min(fr.right - pad, tx));
  ty = Math.max(fr.top + pad, Math.min(fr.bottom - pad, ty));
  // pushed out of the player's drop zone, sideways (it falls down from there, past the player)
  const c = coreCenter();
  const clear = c.drop + 40;
  if (Math.hypot(tx - c.x, ty - c.y) < clear) {
    const side = tx >= c.x ? 1 : -1;
    const dy = Math.min(Math.abs(ty - c.y), clear - 1);
    tx = c.x + side * Math.sqrt(clear * clear - dy * dy);
    if (tx < fr.left + pad || tx > fr.right - pad) tx = c.x - side * Math.sqrt(clear * clear - dy * dy);
    tx = Math.max(fr.left + pad, Math.min(fr.right - pad, tx));
  }
  el.classList.add('flying');
  el.style.left = tx + 'px';
  el.style.top = ty + 'px';
  setTimeout(() => {
    el.classList.remove('flying');
    rainAdd(el.dataset.id, tx - fr.left, ty - fr.top, { el });
  }, 360);
}

function fling(el, home, x, y, vx, vy) {
  let last = performance.now();
  // while nothing plays, a throw heading left (towards the player) always lands in it, so the
  // first orb starts the song without pressing play
  const aim = !playing && home.kind !== 'active' && vx < 0 && -vx > Math.abs(vy);
  const step = (now) => {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    const c = coreCenter();
    const dx = c.x - x, dy = c.y - y, dist = Math.hypot(dx, dy);
    if (aim) {
      // fly straight at the player, never slower than a brisk throw
      const sp = Math.max(Math.hypot(vx, vy), 1100);
      vx = (dx / dist) * sp;
      vy = (dy / dist) * sp;
    } else if (dist < c.drop * c.pull) {
      // a light pull near the player so a roughly aimed throw still lands
      vx += (dx / dist) * 2600 * dt;
      vy += (dy / dist) * 2600 * dt;
    }
    x += vx * dt;
    y += vy * dt;
    if (!aim) {
      const f = Math.pow(0.2, dt);
      vx *= f;
      vy *= f;
    }
    el.style.left = x + 'px';
    el.style.top = y + 'px';
    highlight(x, y, el.dataset.id);
    const done = () => highlight(null);
    if (land(el, home, x, y, true)) return done();
    const out = x < -60 || x > innerWidth + 60 || y < -60 || y > innerHeight + 60;
    if (out || Math.hypot(vx, vy) < 70) {
      done();
      return out ? goHome(el, home) : settle(el, home, x, y);
    }
    requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

function absorb(el, home) {
  let seed = null;
  if (home?.kind === 'roll') ({ id: el.dataset.id, home, seed } = takeFromRoll());
  else if (home?.kind === 'slot') home = home.origin;
  const id = el.dataset.id;
  const c = coreCenter();
  el.classList.add('flying', 'absorb');
  el.style.left = c.x + 'px';
  el.style.top = c.y + 'px';
  ui.core.style.setProperty('--gulp', ctint(byId[id]));
  bump(ui.core, 'gulp');
  addLayer(id, home, seed);
  setTimeout(() => el.remove(), 380);
}

// restart a one-shot CSS animation class
function bump(el, cls) {
  el.classList.remove(cls);
  void el.offsetWidth;
  el.classList.add(cls);
}

// ---------- piano roll: draw a line, get a part ----------
// 4 bars × 16 steps; rows are scale degrees of A minor (0 = lowest). The drawing is a draft
// that plays as a preview while the roll is open; "곡에 추가" turns it into an orb in the
// song, "보관함" keeps it as an orb in the stash without adding it.

const GUTTER = 34; // BARS, STEPS, ROWS come from orbPreset.js
let draft = null; // { src: instrument orb id, raw: Array(STEPS) of degree | [degrees] | null }
// mode: 'add' puts a note on each step the line crosses (beside any already there), 'remove'
// (the press landed on a note) takes notes off, 'erase' (right button / shift) clears whole steps
let stroke = null; // { mode, base: raw at the press, pts: [[x, y]], last: { s, d } }
let drawnCount = 0;
// The orb thrown into a slot stays there (the slot's tab is open while it has one; in the MIDI
// slot the orb is the instrument). Grab it to throw it into the song, the stash, the field or
// another slot, carrying what the slot did with it; in the MIDI slot a drawing goes with it, and
// letting go of it in the field sends it back where it came from.
let rollOrb = null; // { id, home, mode: 'midi', grabbed }

const hasNotes = (raw) => raw.some((d) => notesAt(d).length > 0);
// the seed an orb plays at: one waiting from the 변주 slot, else its own or the shared one
const seedFor = (l) => heldSeed.get(l.id) ?? seedOf(l);

// a short line over the slots when one turns an orb away
let slotHintTimer = 0;
function slotSay(text) {
  ui.slotHint.textContent = text;
  ui.slotHint.classList.add('on');
  clearTimeout(slotHintTimer);
  slotHintTimer = setTimeout(() => ui.slotHint.classList.remove('on'), 4000);
}

// Put an orb into a slot: 편집 slides its tab up with the orb in it; the others do their job and
// keep the orb. apply = false when a saved session puts it back (the change was made before).
function pickForSlot(id, home = null, mode = 'midi', { apply = true } = {}) {
  const l = byId[id];
  if (!accepts(mode, l)) {
    slotSay(mode === 'midi'
      ? ot(!l.code && !l.combo ? 'rollWholeSong' : 'rollNotInstrument', { name: l.name })
      : ot(mode === 'vary' ? 'slotVaryNo' : mode === 'copy' ? 'slotCopyNo' : !l.code && !fxScalable(l) ? 'slotGainNo' : mode === 'quieter' ? 'slotQuieterMax' : 'slotLouderMax', { name: l.name }));
    bump(slotEls[mode], 'reject');
    return false;
  }
  taste.slot(id); // tried out: if it goes back to the field, only a weak turn-down
  if (mode !== 'midi') return putInSlot(id, home, mode, apply);
  if (rollOrb && rollOrb.id !== id) returnOrb(rollOrb.id, rollOrb.home);
  // an orb left in 편집 by 수정 완료 makes room (back where it came from, unless it is this one)
  const sat = slotOrbs.midi;
  if (sat) {
    slotOrbs.midi = null;
    if (sat.id !== id) returnOrb(sat.id, sat.home);
    renderSlots();
  }
  rollOrb = { id, home, mode };
  // a drawn orb brings its drawing back; any other orb shows the notes it is playing right now
  const own = l.raw ? null : patternToRaw(l, seedFor(l));
  if (l.raw) draft = { src: l.src, raw: [...l.raw] };
  else draft = { src: id, raw: own && hasNotes(own) ? own : draft?.raw ?? Array(STEPS).fill(null) };
  draft.edited = false;
  draft.seed = null; // set by 🎲 in the roll: the orb leaves with that variation
  document.body.classList.add('roll-full');
  document.body.classList.remove('roll-min');
  ui.roll.style.setProperty('--g', ctint(byId[draft.src]));
  bump(ui.roll, 'gulp');
  bump(slotEls[mode], 'gulp');
  renderRollHead();
  syncSoon();
  return true;
}

// The volume / variation slots: the orb is changed (a volume step down / up, or a new seed of its own)
// and stays in the slot, jiggling, until it is grabbed out. An orb already there goes home.
function putInSlot(id, home, mode, apply = true) {
  if (apply && mode === 'copy' && stash.length >= STASH_MAX) {
    slotSay(ot('slotCopyFull'));
    bump(slotEls[mode], 'reject');
    bump(ui.stash, 'reject');
    return false;
  }
  const old = slotOrbs[mode];
  if (old && old.id !== id) returnOrb(old.id, old.home);
  slotOrbs[mode] = { id, home };
  if (apply && mode === 'vary') {
    const l = byId[id];
    let v;
    do v = newSeed();
    while (v === seedFor(l));
    heldSeed.set(id, v);
  } else if (apply && mode === 'copy') stashCopy(id);
  else if (apply) setStep(id, volStep(id) + (mode === 'quieter' ? -1 : 1));
  bump(slotEls[mode], 'gulp');
  renderSlots();
  return true;
}

// the orbs sitting in the volume / variation slots (an empty slot shows just its name)
function renderSlots() {
  saveSessionSoon();
  for (const m of FX_SLOTS) {
    const el = slotEls[m], s = slotOrbs[m];
    el.querySelector('.mini')?.remove();
    el.classList.toggle('filled', !!s);
    if (!s) continue;
    const b = document.createElement('div');
    b.className = 'mini';
    paint(b, byId[s.id]);
    b.innerHTML = '<i class="swirl"></i>';
    b.title = `${byId[s.id].name} — ${ot('slotHeldTip')}`;
    b.addEventListener('pointerdown', (e) => grabFromSlot(e, m));
    b.addEventListener('mouseenter', () => hoverOn(s.id));
    b.addEventListener('mouseleave', hoverOff);
    el.append(b);
  }
}

function grabFromSlot(e, mode) {
  const s = slotOrbs[mode];
  if (!s || e.button > 0) return;
  hoverOff();
  slotOrbs[mode] = null;
  renderSlots();
  startDrag(e, makeOrbEl(s.id), { kind: 'slot', mode, origin: s.home }, { x: e.clientX, y: e.clientY });
}

function closeTab() {
  document.body.classList.remove('roll-full', 'roll-min');
  renderRollHead();
  syncSoon();
}

// What leaves 편집: the drawing as a drawn orb (a loaded drawn orb gets its line updated), or the
// plain orb when nothing is drawn; a plain orb used for a drawing goes back home.
function takeFromRoll() {
  let { id, home } = rollOrb;
  let seed = draft.seed ?? null;
  // only a changed drawing becomes a drawn orb; an untouched orb leaves as itself
  if (hasNotes(draft.raw) && draft.edited) {
    seed = null;
    const l = byId[id];
    if (l.raw) l.raw = [...draft.raw];
    else {
      const n = volStep(id);
      taste.clear(id); // its sound goes on in the drawing: not turned down
      returnOrb(id, home);
      id = makeDrawn(draft.src, draft.raw).id;
      setStep(id, n); // the drawing keeps the orb's volume
      home = null;
    }
  }
  draft.raw = Array(STEPS).fill(null);
  draft.seed = null;
  if (seed != null) heldSeed.set(id, seed);
  rollOrb = null;
  closeTab();
  return { id, home, seed };
}

// back where it came from; the line stays drawn for the next instrument
function sendRollOrbHome() {
  const { id, home } = rollOrb;
  rollOrb = null;
  returnOrb(id, home);
  closeTab();
  sync();
}

function grabFromRoll(e) {
  if (!rollOrb) return;
  hoverOff();
  const el = makeOrbEl(rollOrb.id);
  if (hasNotes(draft.raw)) el.classList.add('pen');
  rollOrb.grabbed = true;
  renderRollHead();
  startDrag(e, el, { kind: 'roll' }, { x: e.clientX, y: e.clientY });
}

function renderRollHead() {
  slotEls.midi.classList.toggle('open', !!rollOrb);
  const held = rollOrb && byId[rollOrb.id];
  ui.rollSlot.innerHTML = '';
  ui.rollSlot.classList.toggle('filled', !!held && !rollOrb.grabbed);
  if (held && !rollOrb.grabbed) {
    const b = document.createElement('div');
    b.className = 'mini';
    paint(b, held);
    if (hasNotes(draft.raw)) b.classList.add('pen');
    // what it will leave as: a hand edit shows its notes' pattern, a 🎲 roll that seed's pattern
    if (draft.edited && hasNotes(draft.raw)) patternOn(b, rawKey(draft.raw));
    else if (draft.seed != null) patternOn(b, draft.seed);
    b.innerHTML = '<i class="swirl"></i>';
    b.title = ot('rollGrabTip');
    b.addEventListener('pointerdown', grabFromRoll);
    ui.rollSlot.append(b);
  }
  const l = rollOrb && byId[draft.src];
  const seedTag = draft?.seed != null && !draft.edited ? ` <small>#${draft.seed}</small>` : '';
  ui.rollName.innerHTML = l
    ? `<b style="color:${ctint(l)}">${held.name}${seedTag}</b><span>${ot(l.voice.root ? 'rollPitched' : 'rollDrum')} · ${ot('rollThrow')}</span>`
    : draft && hasNotes(draft.raw)
      ? ot('rollKept')
      : ot('rollEmpty');
  ui.rollHint.textContent = '';
  ui.rollDone.disabled = !rollOrb || !!rollOrb.grabbed;
  ui.rollDice.disabled = !rollOrb || !!rollOrb.grabbed || !seeded(byId[draft?.src]);
}

// An orb's current notes as a drawing: its pattern (at the current variation, or `seed`) is built
// without playing it and read back over 4 bars. Melodic parts map notes to scale rows (a chord
// keeps all its rows); drums put a hit on each onset, at the height their speed / sample suggests.
function patternToRaw(l, seed = seedOf(l)) {
  const v = l.voice;
  let pat;
  try {
    const js = transpiler(codeOf(l, seed).replaceAll('__DT__', '0.3'), { emitMiniLocations: false, emitWidgets: false }).output;
    pat = new Function(js)();
  } catch {
    return null;
  }
  const steps = keyMode() === 'major' ? [0, 2, 4, 5, 7, 9, 11] : [0, 2, 3, 5, 7, 8, 10];
  const rootMidi = v.root ? noteToMidi(v.root) : 0;
  const degree = (midi) => {
    const rel = midi - rootMidi, pc = ((rel % 12) + 12) % 12;
    let best = 0;
    steps.forEach((st, i) => Math.abs(st - pc) < Math.abs(steps[best] - pc) && (best = i));
    let d = Math.floor(rel / 12) * 7 + best;
    while (d < 0) d += 7;
    while (d > ROWS - 1) d -= 7;
    return d;
  };
  const raw = Array(STEPS).fill(null);
  for (const h of pat.queryArc(0, BARS).filter((x) => x.hasOnset())) {
    const at = Math.floor(+h.whole.begin * 16 + 1e-6);
    if (at < 0 || at >= STEPS) continue;
    let d, len = 1;
    if (v.root) {
      const note = h.value.note ?? h.value.n;
      if (note == null) continue;
      d = degree(typeof note === 'string' ? noteToMidi(note) : note);
      len = Math.max(1, Math.round((+h.whole.end - +h.whole.begin) * 16));
    } else if (h.value.speed) d = Math.round(7 + 7 * Math.log2(h.value.speed));
    else if (v.ctrl === 'n' && h.value.n != null) d = Math.round(h.value.n / (v.map(1) - v.map(0) || 1));
    else d = 7;
    d = Math.max(0, Math.min(ROWS - 1, d));
    for (let k = 0; k < len && at + k < STEPS; k++) {
      if (v.root) raw[at + k] = stepOf([...notesAt(raw[at + k]), d]);
      else if (raw[at + k] === null || raw[at + k] < d) raw[at + k] = d;
    }
  }
  return raw;
}

// the draft sounds while the roll is open so you hear what you draw
function previewLayer() {
  if (!rollOrb || !hasNotes(draft.raw)) return null;
  const s = byId[draft.src];
  return { id: 'preview', name: ot('previewOrb'), drum: s.drum, code: () => sheetCode(draft.raw, s.voice) };
}

function makeDrawn(src, raw, id = `drawn${++drawnCount}`) {
  const s = byId[src];
  const l = {
    id, cat: id, role: s.cat, src, raw: [...raw], voice: s.voice,
    get name() { return '✎ ' + s.name; }, get kind() { return 'drawn · ' + s.kind; }, color: s.color, glow: s.glow, dark: s.dark,
    drum: s.drum, pitched: !!s.voice.root,
  };
  l.code = () => sheetCode(l.raw, l.voice);
  byId[id] = l;
  return l;
}

// 복제: a new orb that plays like `id` does right now (its variation and volume), straight into the
// stash. A drawn orb is copied as another drawing; any other orb as a stand-in for its catalogue
// orb (`base`) under an id of its own, so the two can sit in the song side by side.
let copyCount = 0;
function makeCopy(base, id = `copy${++copyCount}`) {
  const l = Object.create(byId[base]);
  Object.defineProperties(l, { id: { value: id, enumerable: true }, base: { value: base, enumerable: true } });
  byId[id] = l;
  return l;
}
function stashCopy(id) {
  const l = byId[id];
  const c = l.raw ? makeDrawn(l.src, l.raw) : makeCopy(l.base ?? id);
  if (seeded(l)) heldSeed.set(c.id, seedFor(l));
  setStep(c.id, volStep(id));
  stash.push(c.id);
  renderStash();
  bump(ui.stash, 'gulp');
}

// the roll's buttons do what throwing its orb would
async function finishDraft(where) {
  if (!rollOrb) return;
  if (where === 'stash' && stash.length >= STASH_MAX) {
    bump(ui.stash, 'reject');
    return;
  }
  const { id, home, seed } = takeFromRoll();
  if (where === 'stash') {
    stash.push(id);
    renderStash();
    bump(ui.stash, 'gulp');
    await sync();
  } else {
    ui.core.style.setProperty('--gulp', ctint(byId[id]));
    bump(ui.core, 'gulp');
    await addLayer(id, home, seed);
  }
}

// 🎲 in the roll: the instrument's notes at a random variation. A plain orb stays itself and
// leaves with that seed; on a drawn orb it replaces the drawing (an edit like any other).
async function rollVariation() {
  const s = rollOrb && byId[draft.src];
  if (!s || rollOrb.grabbed || !seeded(s)) return;
  const v = newSeed();
  const raw = patternToRaw(s, v);
  if (!raw) return;
  draft.raw = raw;
  if (byId[rollOrb.id].raw) draft.edited = true;
  else {
    draft.edited = false;
    draft.seed = v;
  }
  bump(ui.roll, 'gulp');
  renderRollHead();
  if (!playing) await play();
  else sync();
}

function rollGeom() {
  const w = ui.rollCanvas.clientWidth, h = ui.rollCanvas.clientHeight;
  return { w, h, cw: (w - GUTTER) / STEPS, rh: h / ROWS };
}

// the pointer as a step and a (fractional) row, or null while the roll is still opening
function rollCell(e) {
  const r = ui.rollCanvas.getBoundingClientRect();
  const { cw, rh } = rollGeom();
  if (!rh || cw <= 0) return null;
  const x = e.clientX - r.left, y = e.clientY - r.top;
  const s = Math.min(STEPS - 1, Math.max(0, Math.floor((x - GUTTER) / cw)));
  const d = Math.min(ROWS - 1, Math.max(0, ROWS - 1 - (y / rh - 0.5)));
  return { x, y, s, d };
}

// Take the note at row r off step s, as the roll shows it: the step's own note, or the drawing
// behind a note that sounds there (a snapped or held eighth). False if nothing plays there.
function removeAt(s, r) {
  const v = byId[draft.src].voice;
  const shown = () => notesAt(draft.raw[s]).includes(r) || !!quantize(draft.raw, v)[s]?.ds.includes(r);
  if (!shown()) return false;
  const own = notesAt(draft.raw[s]);
  if (own.includes(r)) draft.raw[s] = stepOf(own.filter((x) => x !== r));
  if (shown()) {
    for (const k of [s - (s % 2), s - (s % 2) + 1]) {
      const ds = notesAt(draft.raw[k]);
      draft.raw[k] = stepOf(ds.includes(r) ? ds.filter((x) => x !== r) : ds.length === 1 ? [] : ds);
    }
  }
  return true;
}

function applyStroke(e) {
  const c = rollCell(e);
  if (!c) return;
  const { x, y, s, d } = c;
  const last = stroke.last ?? { s, d };
  // every step the pointer crossed since the last event, interpolating the height
  const n = Math.abs(s - last.s);
  for (let k = 0; k <= n; k++) {
    const t = n ? k / n : 1;
    const at = last.s + Math.sign(s - last.s) * k, row = Math.round(last.d + (d - last.d) * t);
    if (stroke.mode === 'erase') draft.raw[at] = null;
    else if (stroke.mode === 'remove') removeAt(at, row);
    // a stroke keeps one note per step: moving up and down within a step moves that note
    else draft.raw[at] = stepOf([...notesAt(stroke.base[at]), row]);
  }
  stroke.last = { s, d };
  if (stroke.mode === 'add') stroke.pts.push([x, y]);
}

ui.rollCanvas.addEventListener('contextmenu', (e) => e.preventDefault());
ui.rollCanvas.addEventListener('pointerdown', (e) => {
  if (!rollOrb) {
    bump(ui.roll, 'reject');
    return;
  }
  e.preventDefault();
  try {
    ui.rollCanvas.setPointerCapture(e.pointerId);
  } catch {}
  const c = rollCell(e);
  if (!c) return;
  // a press on a note takes it off; anywhere else adds one, even where notes already are (chords)
  const mode = e.button === 2 || e.shiftKey ? 'erase' : removeAt(c.s, Math.round(c.d)) ? 'remove' : 'add';
  stroke = { mode, base: [...draft.raw], pts: [], last: null };
  applyStroke(e);
});
ui.rollCanvas.addEventListener('pointermove', (e) => stroke && applyStroke(e));
const endStroke = async () => {
  if (!stroke) return;
  stroke = null;
  draft.edited = true;
  renderRollHead();
  if (!playing) await play();
  else sync();
};
ui.rollCanvas.addEventListener('pointerup', endStroke);
ui.rollCanvas.addEventListener('pointercancel', endStroke);

ui.rollDice.addEventListener('click', rollVariation);
// a tucked-away roll opens again when it is clicked (its orb can still be grabbed straight away)
ui.roll.addEventListener('pointerdown', (e) => {
  if (!document.body.classList.contains('roll-min') || e.target.closest('.roll-slot')) return;
  document.body.classList.remove('roll-min');
}, true);
// 수정 완료: the tab goes down and the orb (the drawing, or the variation from 🎲) waits, jiggling,
// in the 편집 slot until it is grabbed and thrown into the song, the stash or another slot
// the slots went away (a phone turned into a wide screen before the guide opened them): the orbs in the tab and the slots go
// back where they came from (a changed drawing leaves as a drawn orb)
function leaveSlots() {
  if (slotsOn() || !((rollOrb && !rollOrb.grabbed) || slotIds().length)) return;
  if (rollOrb && !rollOrb.grabbed) {
    const { id, home } = takeFromRoll();
    returnOrb(id, home);
  }
  for (const m of FX_SLOTS) {
    const sat = slotOrbs[m];
    if (!sat) continue;
    slotOrbs[m] = null;
    returnOrb(sat.id, sat.home);
  }
  renderSlots();
  sync();
}
isPhone.addEventListener('change', leaveSlots);
ui.rollDone.addEventListener('click', () => {
  if (!rollOrb || rollOrb.grabbed) return;
  const { id, home } = takeFromRoll();
  slotOrbs.midi = { id, home };
  bump(slotEls.midi, 'gulp');
  renderSlots();
  sync();
});

// the name of each scale row (0 = the voice's root) in the song's key
const NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
function rowName(v, d) {
  const steps = keyMode() === 'major' ? [0, 2, 4, 5, 7, 9, 11] : [0, 2, 3, 5, 7, 8, 10];
  const midi = noteToMidi(v?.root ?? 'A3') + keyShift() + Math.floor(d / 7) * 12 + steps[d % 7];
  return NAMES[midi % 12] + (d % 7 === 0 ? Math.floor(midi / 12) - 1 : '');
}

// one neon line: wide soft glow, a brighter core, a white filament
function neon(g, pts, color, alpha) {
  if (pts.length < 2) return;
  g.save();
  g.lineCap = g.lineJoin = 'round';
  for (const [width, blur, col, a] of [[9, 26, color, 0.35], [4, 12, color, 0.9], [1.5, 0, ink().ink !== '255,255,255' ? ink().fg : '#fff', 0.9]]) {
    g.beginPath();
    pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)));
    g.lineWidth = width;
    g.shadowBlur = lite ? 0 : blur;
    g.shadowColor = color;
    g.strokeStyle = col;
    g.globalAlpha = alpha * a;
    g.stroke();
  }
  g.restore();
}

const rg = ui.rollCanvas.getContext('2d');
let rollSig = '';
function drawRoll() {
  const dpr = lite ? 1 : window.devicePixelRatio || 1;
  const { w, h, cw, rh } = rollGeom();
  if (w < 10 || h < 10) return;
  // with nothing drawn on it the roll only changes with its size, the playhead and the voice
  // (row labels): skip redrawing an unchanged picture
  const lp = playing && repl ? loopPos() : null;
  const head = lp != null ? Math.round((lp / BARS) * (w - GUTTER) * 2) : -1;
  const sig = draft || stroke ? '' : `${w}|${h}|${dpr}|${head}`;
  if (sig && sig === rollSig) return;
  rollSig = sig;
  if (ui.rollCanvas.width !== Math.round(w * dpr) || ui.rollCanvas.height !== Math.round(h * dpr)) {
    ui.rollCanvas.width = Math.round(w * dpr);
    ui.rollCanvas.height = Math.round(h * dpr);
  }
  const g = rg;
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  g.clearRect(0, 0, w, h);
  const s = draft && byId[draft.src];
  const v = s?.voice;
  const yOf = (d) => (ROWS - 1 - d + 0.5) * rh;
  const { acc, fg, ink: k } = ink();
  const faint = (a) => `rgba(${k},${a})`;
  const accA = (a) => acc + Math.round(a * 255).toString(16).padStart(2, '0');

  // rows: the root (A) gets a brighter stripe
  g.font = '10px ui-monospace, Consolas, monospace';
  g.textBaseline = 'middle';
  for (let d = 0; d < ROWS; d++) {
    const y = (ROWS - 1 - d) * rh;
    g.fillStyle = d % 7 === 0 ? accA(0.07) : d % 2 ? faint(0.015) : faint(0.035);
    g.fillRect(GUTTER, y, w - GUTTER, rh);
    g.fillStyle = d % 7 === 0 ? acc : faint(0.4);
    const label = !v || v.root ? rowName(v, d) : d === ROWS - 1 ? 'hi' : d === 0 ? 'lo' : '·';
    g.fillText(label, 6, y + rh / 2);
  }
  // columns: steps, beats, bars
  for (let i = 0; i <= STEPS; i++) {
    g.fillStyle = i % 16 === 0 ? accA(0.35) : i % 4 === 0 ? faint(0.1) : faint(0.03);
    g.fillRect(GUTTER + i * cw, 0, 1, h);
  }

  const pos = lp != null ? lp / BARS : -1;
  const playStep = pos >= 0 ? Math.floor(pos * STEPS) : -1;
  if (draft) {
    const color = toneHex(tint(s));
    // what you drew, faint
    g.save();
    g.globalAlpha = 0.35;
    g.strokeStyle = fg;
    g.setLineDash([2, 4]);
    g.beginPath();
    let pen = false;
    const dots = []; // chord steps: a dot per note instead of the line
    draft.raw.forEach((x, i) => {
      const ds = notesAt(x);
      if (ds.length !== 1) {
        ds.forEach((d) => dots.push([GUTTER + (i + 0.5) * cw, yOf(d)]));
        return (pen = false);
      }
      const p = [GUTTER + (i + 0.5) * cw, yOf(ds[0])];
      pen ? g.lineTo(...p) : g.moveTo(...p);
      pen = true;
    });
    g.stroke();
    g.fillStyle = fg;
    dots.forEach(([x, y]) => g.fillRect(x - 1.5, y - 1.5, 3, 3));
    g.restore();
    // what will play: MIDI blocks + a neon line through single notes, a held bar per chord note
    const q = quantize(draft.raw, v);
    g.fillStyle = color;
    g.globalAlpha = 0.18;
    q.forEach((n, i) => n?.ds.forEach((d) => g.fillRect(GUTTER + i * cw + 0.5, (ROWS - 1 - d) * rh + 1, cw - 1, rh - 2)));
    g.globalAlpha = 1;
    let run = [];
    const flush = () => {
      if (run.length === 1) run = [[run[0][0] - cw * 0.35, run[0][1]], [run[0][0] + cw * 0.35, run[0][1]]];
      neon(g, run, color, 1);
      run = [];
    };
    const bars = new Map(); // chord row -> [x0, x1]
    const endBars = (keep = []) => {
      for (const [d, [x0, x1]] of bars) {
        if (keep.includes(d)) continue;
        neon(g, [[x0, yOf(d)], [x1, yOf(d)]], color, 1);
        bars.delete(d);
      }
    };
    q.forEach((n, i) => {
      const x = GUTTER + (i + 0.5) * cw;
      if (n?.ds.length === 1) {
        endBars();
        return run.push([x, yOf(n.ds[0])]);
      }
      flush();
      if (!n) return endBars();
      endBars(n.start ? [] : n.ds);
      for (const d of n.ds) {
        const b = bars.get(d);
        if (b) b[1] = x + cw * 0.35;
        else bars.set(d, [x - cw * 0.35, x + cw * 0.35]);
      }
    });
    flush();
    endBars();
    const n = q[playStep];
    if (n) {
      g.save();
      g.shadowBlur = 30;
      g.shadowColor = color;
      g.fillStyle = '#fff';
      for (const d of n.ds) {
        g.beginPath();
        g.arc(GUTTER + (playStep + 0.5) * cw, yOf(d), 5, 0, Math.PI * 2);
        g.fill();
      }
      g.restore();
    }
  }
  if (stroke?.pts.length > 1) neon(g, stroke.pts, fg, 0.5);
  if (pos >= 0) {
    g.fillStyle = faint(0.55);
    g.fillRect(GUTTER + pos * (w - GUTTER), 0, 1.5, h);
  }
}

// ---------- variation ----------

// one orb's own seed (null: back to the shared one); a new grid row picks it up too
function setOwnSeed(id, v) {
  if (v == null || v === variation) ownSeed.delete(id);
  else ownSeed.set(id, v);
  // with the full song open, its row in the stem grid takes the new seed (leads +1 per block)
  const cells = song?.cells?.[id], l = byId[id];
  if (cells && seeded(l)) {
    let g = 0;
    cells.forEach((sec, i) => sec.forEach((b) => (b.v = blockSeed(l, seedOf(l) + (song.sections[i].v ?? 0) * 100, g++))));
  }
  bump(ui.chips.querySelector(`.strip[data-id="${CSS.escape(id)}"] .mini`), 'gulp');
  sync();
}
// ---------- presets ----------

const PRESET_KEY = 'orbPresets';
function loadPresets() {
  try {
    return JSON.parse(localStorage.getItem(PRESET_KEY)) ?? [];
  } catch {
    return [];
  }
}
function savePresets(list) {
  try {
    localStorage.setItem(PRESET_KEY, JSON.stringify(list));
  } catch {}
}

// colours of a preset's parts, for its tile's swirl
function presetColors(p) {
  const src = (id) => byId[id] ?? byId[(p.drawn ?? []).find((d) => d.id === id)?.src];
  const cols = p.layers.map(src).filter(Boolean).flatMap((l) => l.colors ?? [l.color]);
  return [...new Set(cols)].slice(0, 6);
}

const tileButton = (cls, text, title, onClick) => {
  const b = document.createElement('button');
  b.className = cls;
  b.textContent = text;
  b.title = title;
  b.addEventListener('pointerdown', (e) => e.stopPropagation());
  b.addEventListener('click', onClick);
  return b;
};

// One preset as a sidebar tile: click it, or drag it onto the player, to load it. `mine` tiles
// (saved here) can be deleted and sent to the server; shared ones (from the server) can be kept.
function presetTile(p, mine) {
  const tile = document.createElement('div');
  tile.className = 'ptile' + (p.song ? ' stem' : '');
  tile.dataset.preset = p.id;
  const who = p.author ? ` — ${p.author}` : '';
  tile.title = `${p.name}${who}${p.description ? `\n${p.description}` : ''}\n${ot('tileTip')}`;
  const ball = document.createElement('div');
  ball.className = 'mini';
  const cols = presetColors(p);
  paint(ball, cols.length > 1 ? { colors: cols } : { color: cols[0] ?? '#39ff9c' });
  ball.innerHTML = '<i class="swirl"></i>';
  const name = document.createElement('span');
  name.className = 'pname';
  name.textContent = p.name;
  const meta = document.createElement('small');
  meta.textContent = mine ? `${p.layers.length} orbs${p.song ? ' · stem' : ''}` : `${p.song ? 'stem' : 'orb'}${p.author ? ` · ${p.author}` : ''}`;
  const share = tileButton('share', '🔗', ot(p.song ? 'copyCodeStem' : 'copyCode'), () => sharePreset(p, share));
  if (mine) {
    const up = tileButton('share up cloud', '☁', ot('shareServer'), () => openShareDialog(p));
    const del = tileButton('del', '✕', ot('del'), () => {
      savePresets(loadPresets().filter((q) => q.id !== p.id));
      renderPresets();
    });
    tile.append(ball, name, meta, up, share, del);
  } else {
    const keep = tileButton('share up', '＋', ot('keep'), () => {
      const { w, ...kept } = p; // the list weight stays with the server's copy
      savePresets([{ ...kept, id: Date.now().toString(36) }, ...loadPresets()]);
      renderPresets();
      bump(ui.presetList.firstChild, 'gulp');
    });
    tile.append(ball, name, meta, keep, share);
  }
  tile.addEventListener('pointerdown', (e) => grabPreset(e, p, tile));
  return tile;
}

// Saved presets fill the top half of the left sidebar, presets shared on the server the bottom half.
function renderPresets() {
  const list = loadPresets();
  ui.presetList.innerHTML = list.length ? '' : `<p class="empty">${ot('presetsEmpty')}</p>`;
  for (const p of list) ui.presetList.append(presetTile(p, true));
}

// Whether the preset server answers. While it doesn't, sharing to it is switched off (the button
// says so) and the list is checked again every 30 s, or right away with ↻.
let serverUp = null; // null until the first check
let serverRetry;
function setServerUp(up) {
  serverUp = up;
  const b = $('serverShareBtn');
  b.disabled = !up;
  b.textContent = ot(up ? 'serverShare' : 'serverDown');
  b.title = ot(up ? 'serverShareTip' : 'serverDownTip');
  document.body.classList.toggle('server-down', !up);
  clearTimeout(serverRetry);
  if (!up) serverRetry = setTimeout(refreshShared, 30_000);
}

const sharedList = $('sharedList');
const SHARED_COUNT = 20; // tiles in the shared list; ↻ draws a fresh 20
let sharedLoading = null;
let sharedLast = null; // the last list the server sent, re-drawn when the language changes
function renderShared() {
  if (!sharedLast) return;
  sharedList.innerHTML = sharedLast.length ? '' : `<p class="empty">${ot('sharedEmpty')}</p>`;
  for (const p of sharedLast) sharedList.append(presetTile(p, false));
}
function refreshShared() {
  if (!sharedList.children.length) sharedList.innerHTML = `<p class="empty">${ot('loading')}</p>`;
  // the server picks SHARED_COUNT at random, well-liked and recent ones more often (an older
  // server ignores `mix` and sends the newest ones; the weighted order on top keeps that varied)
  sharedLoading ??= fetchPresets({ limit: SHARED_COUNT, mix: true })
    .then((list) => {
      setServerUp(true);
      sharedLast = weightedOrder(list).slice(0, SHARED_COUNT);
      renderShared();
    })
    .catch((e) => {
      console.info('preset server unavailable:', e.message);
      setServerUp(false);
      sharedLast = null;
      sharedList.innerHTML = `<p class="empty">${ot('serverDownList')}</p>`;
    })
    .finally(() => (sharedLoading = null));
  return sharedLoading;
}
$('sharedRefresh').addEventListener('click', refreshShared);

// A title for the current set, made from its orbs' names ("격렬한" + "원정대"), the same for the
// same set and variation.
function autoTitle() {
  const words = layers().filter((l) => l.code && !l.raw).map((l) => l.name.trim().split(/\s+/));
  if (!words.length) return '';
  const r = rng(hash([...active.keys()].join()) + variation);
  const a = r.pick(words), b = r.pick(words);
  return (a.length > 1 && b.length > 1 ? `${a[0]} ${b.at(-1)}` : a.join(' ')).slice(0, 24);
}

// the current set as a preset object; `withSong` also takes the stem grid when a full song is open
function currentPreset(fallbackName, { withSong = false } = {}) {
  const p = {
    id: Date.now().toString(36),
    name: ui.presetName.value.trim() || autoTitle() || fallbackName,
    layers: [...active.keys()],
    drawn: layers().filter((l) => l.raw).map((l) => ({ id: l.id, src: l.src, raw: l.raw })),
    ...(layers().some(seeded) ? { variation } : {}),
    ...(ownSeeds() ? { seeds: ownSeeds() } : {}),
    ...(ownGains() ? { gains: ownGains() } : {}),
  };
  if (withSong && song?.sections) {
    syncRows();
    p.song = songToWire(song);
  }
  return uncopy(p);
}

// Presets and share codes only know catalogue orbs and drawings: a copy from 복제 goes out as the
// orb it was copied from (with its seed and volume), unless that orb is in the set already.
function uncopy(p) {
  const to = new Map();
  for (const id of p.layers) {
    const b = byId[id]?.base;
    if (b && !p.layers.includes(b) && ![...to.values()].includes(b)) to.set(id, b);
  }
  const drop = new Set(p.layers.filter((id) => byId[id]?.base && !to.has(id)));
  if (!to.size && !drop.size) return p;
  const keys = (o) => o && Object.fromEntries(Object.entries(o).filter(([k]) => !drop.has(k)).map(([k, v]) => [to.get(k) ?? k, v]));
  p.layers = p.layers.filter((id) => !drop.has(id)).map((id) => to.get(id) ?? id);
  if (p.seeds) p.seeds = keys(p.seeds);
  if (p.gains) p.gains = keys(p.gains);
  if (p.song) p.song = { ...p.song, rows: p.song.rows.filter((r) => !drop.has(r.id)).map((r) => ({ ...r, id: to.get(r.id) ?? r.id })) };
  return p;
}

$('presetForm').addEventListener('submit', (e) => {
  e.preventDefault();
  if (!active.size) {
    ui.soloHint.textContent = ot('nothingToSave');
    return;
  }
  const list = loadPresets();
  list.unshift(currentPreset(ot('presetN', { n: list.length + 1 }), { withSong: true }));
  savePresets(list);
  ui.presetName.value = '';
  ui.presetName.blur();
  renderPresets();
  bump(ui.presetList.firstChild, 'gulp');
  tutEvent('preset');
});

// Drag a tile out as a big swirl orb; let go over the player to load it. A plain click loads too.
function grabPreset(e, p, tile) {
  e.preventDefault();
  const x0 = e.clientX, y0 = e.clientY;
  let ghost = null;
  const move = (ev) => {
    if (!ghost && Math.hypot(ev.clientX - x0, ev.clientY - y0) < 6) return;
    if (!ghost) {
      ghost = document.createElement('div');
      ghost.className = 'orb big dragging';
      const cols = presetColors(p);
      paint(ghost, cols.length > 1 ? { colors: cols } : { color: cols[0] ?? '#39ff9c' });
      ghost.innerHTML = '<div class="fade"><div class="float"><span class="label"></span><div class="ball"><i class="swirl"></i></div><span class="kind">preset</span></div></div>';
      ghost.querySelector('.label').textContent = p.name;
      document.body.append(ghost);
      tile.classList.add('gone');
    }
    ghost.style.left = ev.clientX + 'px';
    ghost.style.top = ev.clientY + 'px';
    highlight(ev.clientX, ev.clientY);
  };
  const up = (ev) => {
    window.removeEventListener('pointermove', move);
    window.removeEventListener('pointerup', up);
    window.removeEventListener('pointercancel', up);
    highlight(null);
    tile.classList.remove('gone');
    if (!ghost) {
      if (ev.type === 'pointerup') applyPreset(p);
      return;
    }
    if (ev.type === 'pointerup' && overCore(ev.clientX, ev.clientY)) {
      const c = coreCenter();
      ghost.classList.add('flying', 'absorb');
      ghost.style.left = c.x + 'px';
      ghost.style.top = c.y + 'px';
      bump(ui.core, 'gulp');
      applyPreset(p);
    } else {
      // back to its tile
      const r = tile.getBoundingClientRect();
      ghost.classList.add('flying', 'absorb');
      ghost.style.left = r.left + r.width / 2 + 'px';
      ghost.style.top = r.top + 20 + 'px';
    }
    setTimeout(() => ghost.remove(), 380);
  };
  window.addEventListener('pointermove', move);
  window.addEventListener('pointerup', up);
  window.addEventListener('pointercancel', up);
}

// 👍 / 👎 beside the play button for the shared preset last loaded. It stays only while the set
// is exactly as loaded: any change (an orb in or out, a drawing, a seed, the song grid) hides it.
const setVote = mountVote($('vote'));
let voteSig = null; // the loaded set's signature, null while nothing votable is loaded
const setSig = () => JSON.stringify({ ...currentPreset('', { withSong: true }), id: 0, name: 0 });
function checkVoteSet() {
  if (voteSig && setSig() !== voteSig) {
    voteSig = null;
    setVote(null);
  }
}

async function applyPreset(p) {
  voteSig = null; // the set is still being built: no checks until it is done
  setVote(p);
  for (const id of [...active.keys()]) removeLayer(id, { silent: true, respawn: false });
  // drawn parts are rebuilt under fresh ids so they never clash with drawings made since
  const ids = new Map((p.drawn ?? []).map((d) => [d.id, makeDrawn(d.src, d.raw).id]));
  if (p.variation) variation = p.variation;
  for (const [id, v] of Object.entries(p.seeds ?? {})) if (Number.isSafeInteger(v) && v >= 0) ownSeed.set(ids.get(id) ?? id, v);
  // each orb's own volume (음량 slots), as whole percents
  for (const id of p.layers) {
    const g = p.gains?.[id];
    setStep(ids.get(id) ?? id, Number.isSafeInteger(g) && g > 0 ? gainStep(g / 100) : 0);
  }
  previewOnly = false;
  if (!playing) await play();
  const at = nextBar();
  for (const id of p.layers) {
    const l = byId[ids.get(id) ?? id];
    if (l) put(l, at);
  }
  for (const o of [...rain]) if (active.has(o.id)) vanish(o);
  // a stem preset brings its full song back too (drawings under their new ids)
  const grid = p.song && songFromWire(p.song, (id) => ids.get(id) ?? id);
  if (grid) {
    fillSeeds(grid);
    song = { seed: hash(String(p.id)), s0: nextPhrase(), ...grid, audition: null };
    stemSig = '';
    openSong();
  }
  await sync();
  if (!$('vote').hidden) voteSig = setSig();
}

// The wire form only keeps the seed of blocks that play; a silent block of a seeded part gets
// the seed before it, so switching it back on in the grid plays something sensible.
function fillSeeds(grid) {
  for (const r of grid.rows) {
    const on = seeded(byId[r.id]);
    let last = seedOf(byId[r.id]);
    for (const sec of grid.cells[r.id]) {
      for (const c of sec) {
        if (!on) c.v = null;
        else if (c.v == null) c.v = last;
        else last = c.v;
      }
    }
  }
}

// ---------- the set being worked on survives a reload ----------
// Besides saved presets, whatever is on the player right now (orbs in the song, drawings, the
// stash, the variation, the line in the roll) is kept in localStorage, so restarting the dev
// server or reloading the page brings it back. It comes back stopped: press play to hear it.

const SESSION_KEY = 'orbSession';
let sessionReady = false; // nothing is written until the saved session has been read back
let sessionTimer;
let sessionDropped = false; // ↺ 튜토리얼 재실행: the page reloads as on a first visit, nothing is saved on the way out
function saveSession() {
  clearTimeout(sessionTimer);
  if (!sessionReady || offline || sessionDropped) return;
  const ids = new Set([...active.keys(), ...stash, ...slotIds(), ...(rollOrb ? [rollOrb.id] : [])]);
  const drawn = [...ids].map((id) => byId[id]).filter((l) => l?.raw).map((l) => ({ id: l.id, src: l.src, raw: l.raw }));
  const copies = [...ids].filter((id) => byId[id]?.base).map((id) => ({ id, base: byId[id].base }));
  const of = (map) => Object.fromEntries([...ids].filter((id) => map.has(id)).map((id) => [id, map.get(id)]));
  const data = {
    layers: [...active.keys()],
    drawn,
    copies,
    stash: [...stash],
    variation,
    seeds: ownSeeds(),
    steps: of(orbStep),
    held: of(heldSeed),
    name: ui.presetName.value,
    slots: Object.fromEntries(FX_SLOTS.filter((m) => slotOrbs[m]).map((m) => [m, { id: slotOrbs[m].id, home: slotOrbs[m].home ?? null }])),
    roll: rollOrb && draft ? { id: rollOrb.id, home: rollOrb.home ?? null, src: draft.src, raw: draft.raw, edited: !!draft.edited, seed: draft.seed ?? null } : null,
  };
  try {
    localStorage.setItem(SESSION_KEY, JSON.stringify(data));
  } catch {}
}
const saveSessionSoon = () => {
  clearTimeout(sessionTimer);
  sessionTimer = setTimeout(saveSession, 300);
};
addEventListener('pagehide', saveSession);
addEventListener('beforeunload', saveSession);
document.addEventListener('visibilitychange', () => document.visibilityState === 'hidden' && saveSession());
ui.presetName.addEventListener('input', saveSessionSoon);

function restoreSession() {
  let s = null;
  try {
    s = JSON.parse(localStorage.getItem(SESSION_KEY));
  } catch {}
  try {
    if (!s) return;
    // drawn orbs keep their ids, and new drawings are numbered past them
    for (const d of s.drawn ?? []) {
      if (!byId[d.src]?.voice || !Array.isArray(d.raw)) continue;
      makeDrawn(d.src, d.raw, d.id);
      const n = +String(d.id).match(/^drawn(\d+)$/)?.[1];
      if (n > drawnCount) drawnCount = n;
    }
    // so do copies from 복제
    for (const c of s.copies ?? []) {
      const n = +String(c.id).match(/^copy(\d+)$/)?.[1];
      if (!n || !byId[c.base] || byId[c.base].base || byId[c.id]) continue;
      makeCopy(c.base, c.id);
      if (n > copyCount) copyCount = n;
    }
    if (+s.variation) variation = +s.variation;
    for (const id of s.stash ?? []) if (byId[id] && stash.length < STASH_MAX) stash.push(id);
    for (const id of s.layers ?? []) if (byId[id]) put(byId[id], 0);
    for (const [id, v] of Object.entries(s.seeds ?? {})) if (active.has(id) && Number.isSafeInteger(v)) ownSeed.set(id, v);
    for (const [id, n] of Object.entries(s.steps ?? {})) if (byId[id] && Number.isSafeInteger(n)) setStep(id, Math.max(-VOL_STEPS, Math.min(VOL_STEPS, n)));
    for (const [id, g] of Object.entries(s.gains ?? {})) if (byId[id] && Number.isFinite(g) && g > 0) setStep(id, gainStep(g)); // older sessions
    for (const [id, v] of Object.entries(s.held ?? {})) if (byId[id] && !active.has(id) && Number.isSafeInteger(v)) heldSeed.set(id, v);
    if (typeof s.name === 'string') ui.presetName.value = s.name;
    if (s.roll) tutUpTo(3); // a session left with the piano roll open had the 편집 slot out
    for (const m of FX_SLOTS) {
      const x = s.slots?.[m];
      if (x && byId[x.id] && !active.has(x.id) && accepts(m, byId[x.id])) slotOrbs[m] = { id: x.id, home: x.home ?? null };
    }
    renderSlots();
    if (s.roll && byId[s.roll.id] && pickForSlot(s.roll.id, s.roll.home, 'midi', { apply: false })) {
      if (byId[s.roll.src] && Array.isArray(s.roll.raw)) draft = { src: s.roll.src, raw: [...s.roll.raw], edited: !!s.roll.edited, seed: Number.isSafeInteger(s.roll.seed) ? s.roll.seed : null };
      renderRollHead();
    }
  } catch (e) {
    console.error('could not restore the last session', e);
  } finally {
    sessionReady = true;
  }
}

// A page opened with #orb1:… (from 💾 in an in-app browser, opened again outside it) starts on that
// set: it becomes the saved session and the top preset (a stem one keeps its song there).
function handoffPreset() {
  if (!location.hash.startsWith('#' + SHARE_TAG)) return;
  try {
    const p = parsePresetText(location.hash.slice(1));
    if (p.layers.length) {
      savePresets([p, ...loadPresets()]);
      const gains = Object.fromEntries(Object.entries(p.gains ?? {}).map(([k, g]) => [k, g / 100]));
      localStorage.setItem(SESSION_KEY, JSON.stringify({ layers: p.layers, drawn: p.drawn, stash: [], variation: p.variation, seeds: p.seeds ?? {}, gains, name: p.name }));
    }
  } catch (e) {
    console.error('could not read the set in the URL', e);
  }
  history.replaceState(null, '', location.pathname + location.search);
}

// ---------- sharing presets as text ----------
// A shared preset is one short code (orb1:…) that carries the exact set (orb ids, drawings,
// variation). Pasting it into 불러오기 brings it back.

const SHARE_TAG = 'orb1:';
const b64 = (str) => btoa(String.fromCharCode(...new TextEncoder().encode(str))).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
const unb64 = (str) => new TextDecoder().decode(Uint8Array.from(atob(str.replaceAll('-', '+').replaceAll('_', '/')), (c) => c.charCodeAt(0)));

// the share code alone: one line that carries the whole preset (name, orbs, drawings, variation,
// and for a stem share the full-song grid)
function presetText(p) {
  const data = { n: p.name, l: p.layers, d: (p.drawn ?? []).map((d) => [d.id, d.src, packRaw(d.raw)]), v: p.variation ?? 0, ...(p.seeds ? { vs: p.seeds } : {}), ...(p.gains ? { vg: p.gains } : {}), ...(p.song ? { s: p.song } : {}) };
  return SHARE_TAG + b64(JSON.stringify(data));
}

// Text -> preset. Takes the code (with or without its orb1: prefix); otherwise matches listed names.
function parsePresetText(text) {
  const id = Date.now().toString(36);
  const m = text.match(/orb1:([A-Za-z0-9_-]+)/) ?? text.trim().match(/^([A-Za-z0-9_-]{16,})$/);
  if (m) {
    const d = JSON.parse(unb64(m[1]));
    const drawn = (d.d ?? []).filter(([, src]) => byId[src]?.voice).map(([did, src, raw]) => ({ id: did, src, raw: unpackRaw(raw) }));
    const ok = new Set(drawn.map((x) => x.id));
    const layers = (d.l ?? []).filter((x) => ok.has(x) || (byId[x] && !byId[x].raw));
    const song = d.s && typeof d.s === 'object' ? { song: d.s } : {}; // checked when it is applied
    const seeds = d.vs && typeof d.vs === 'object' ? { seeds: Object.fromEntries(Object.entries(d.vs).filter(([k, v]) => layers.includes(k) && Number.isSafeInteger(v) && v >= 0)) } : {};
    const gains = cleanGains(d.vg, layers);
    return { id, name: String(d.n ?? ot('importedPreset')).slice(0, 24), layers, drawn, variation: +d.v || 0, ...seeds, ...(gains ? { gains } : {}), ...song };
  }
  const byName = new Map(LAYERS.flatMap((l) => [[l.nameKo ?? l.name, l.id], [l.name, l.id]]));
  const layers = [];
  for (const line of text.split(/\r?\n/)) {
    const name = line.replace(/^\s*(\d+[.)]|[-•*])\s*/, '').replace(/\s*\([^)]*\)\s*$/, '').trim();
    const lid = byName.get(name);
    if (lid && !layers.includes(lid)) layers.push(lid);
  }
  const title = text.match(/프리셋\s*—\s*(.+)/)?.[1]?.trim();
  return { id, name: (title || ot('importedPreset')).slice(0, 24), layers, drawn: [], variation: +(text.match(/변주\s*#(\d+)/)?.[1] ?? 0) };
}

// copy to the clipboard (on mobile, or if that fails, a popup to copy from); the button says how it went
async function shareText(text, btn) {
  if (!(await copyText(text))) return;
  const label = btn.textContent;
  btn.textContent = btn.classList.contains('share') ? '✓' : ot('copied');
  setTimeout(() => (btn.textContent = label), 1500);
}
const sharePreset = (p, btn) => shareText(presetText(p), btn);

$('shareBtn').addEventListener('click', (e) => {
  if (!active.size) {
    ui.soloHint.textContent = ot('nothingToShare');
    return;
  }
  shareText(presetText(currentPreset(ot('myMix'))), e.currentTarget);
});
$('stemShareBtn').addEventListener('click', (e) => {
  if (!song?.sections) return;
  shareText(presetText(currentPreset(ot('mySong'), { withSong: true })), e.currentTarget);
});
const updateShareButtons = () => ($('stemShareBtn').disabled = !song?.sections);

// ---------- sharing on the server ----------
// The dialog asks for a title, orb or stem, an author and a short description, checks it with the
// same rules the server uses (server/presetSchema.mjs), and posts it; the server checks it again.

const shareDlg = $('shareDlg'), shErr = $('shErr'), shOk = $('shOk'), shDesc = $('shDesc');
const AUTHOR_KEY = 'orbAuthor';
let shareSrc = null; // the preset being shared
let shareCredits = ''; // CC-BY credits appended to its description ('' when every sound is CC0)

// every sample the set plays: what each orb lists, plus the s("…") names in its code at its seed
// (a drawn part plays its source orb's sound)
function setSampleNames() {
  const names = new Set();
  for (const l of layers()) {
    for (const o of [l, l.raw && byId[l.src]]) for (const n of o?.samples ?? []) names.add(n);
    let code = '';
    try {
      code = l.code ? codeOf(l, seedOf(l)) : '';
    } catch {}
    for (const [, s] of code.matchAll(/\bs\("([^"]*)"\)/g)) for (const n of s.match(/[A-Za-z_][\w]*(?::\d+)?/g) ?? []) names.add(n);
  }
  return names;
}

function openShareDialog(p) {
  if (serverUp === false) return;
  shareSrc = p;
  $('shTitle').value = p.name.slice(0, LIMITS.name);
  for (const r of shareDlg.querySelectorAll('input[name=shKind]')) {
    r.disabled = r.value === 'stem' && !p.song;
    r.checked = r.value === (p.song ? 'stem' : 'orb');
    r.parentElement.title = r.disabled ? ot('shStemOff') : '';
  }
  try {
    $('shAuthor').value = localStorage.getItem(AUTHOR_KEY) ?? '';
  } catch {
    $('shAuthor').value = '';
  }
  shDesc.value = '';
  $('shCount').textContent = `0 / ${LIMITS.description}`;
  const attr = attributionsFor(setSampleNames());
  shareCredits = creditLine(attr);
  const credit = $('shCredit');
  credit.hidden = !attr.length;
  if (attr.length) {
    credit.textContent = ot('shCredit', { what: attr.map((c) => soundName(c.use)).join(', ') });
    credit.append(Object.assign(document.createElement('small'), { textContent: shareCredits }));
  }
  $('shWebsite').value = '';
  $('shAgree').checked = false;
  shOk.disabled = true;
  shErr.textContent = '';
  shErr.classList.remove('ok');
  shareDlg.showModal();
  $('shTitle').select();
}

$('serverShareBtn').addEventListener('click', () => {
  if (!active.size) {
    ui.soloHint.textContent = ot('nothingToShare');
    return;
  }
  openShareDialog(currentPreset(ot('mySong'), { withSong: true }));
});
$('shCancel').addEventListener('click', () => shareDlg.close());
$('shAgree').addEventListener('change', (e) => (shOk.disabled = !e.target.checked));
const countDesc = () => ($('shCount').textContent = `${[...shDesc.value].length} / ${LIMITS.description}`);
shDesc.addEventListener('input', countDesc);
shDesc.addEventListener('compositionend', countDesc); // Hangul typed through an IME

$('shareForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  if (!shareSrc || shOk.disabled) return;
  const extra = {
    kind: shareDlg.querySelector('input[name=shKind]:checked')?.value ?? 'orb',
    author: $('shAuthor').value,
    description: [shDesc.value.trim(), shareCredits].filter(Boolean).join(' '),
    agree: $('shAgree').checked,
    website: $('shWebsite').value,
  };
  const p = { ...shareSrc, name: $('shTitle').value };
  shErr.classList.remove('ok');
  try {
    validatePreset(toWire(p, extra));
  } catch (err) {
    shErr.textContent = err.message;
    return;
  }
  shOk.disabled = true;
  shOk.textContent = ot('uploading');
  try {
    await uploadPreset(p, extra);
    try {
      localStorage.setItem(AUTHOR_KEY, extra.author.trim());
    } catch {}
    shErr.textContent = ot('shDone');
    shErr.classList.add('ok');
    refreshShared();
    setTimeout(() => shareDlg.close(), 1400);
  } catch (err) {
    const down = err.name === 'AbortError' || err instanceof TypeError; // timeout / no connection
    shErr.textContent = down ? ot('shDown') : ot('shFail', { msg: err.message });
    shOk.disabled = down || !$('shAgree').checked;
    if (down) setServerUp(false);
    console.error('preset upload failed', err);
  } finally {
    shOk.textContent = ot('shOk');
  }
});

const importDlg = $('importDlg'), importText = $('importText'), importErr = $('importErr');
$('importBtn').addEventListener('click', () => {
  importErr.textContent = '';
  importText.value = '';
  importDlg.showModal();
  importText.focus();
});
$('importCancel').addEventListener('click', () => importDlg.close());
$('importForm').addEventListener('submit', (e) => {
  e.preventDefault();
  let p = null;
  try {
    p = parsePresetText(importText.value);
  } catch {}
  if (!p?.layers.length) {
    importErr.textContent = ot('importBad');
    return;
  }
  importDlg.close();
  savePresets([p, ...loadPresets()]);
  renderPresets();
  bump(ui.presetList.firstChild, 'gulp');
  applyPreset(p);
});

// ---------- WAV download ----------
// The set is rendered offline in a hidden iframe (render.html?orbs, its own Strudel), so the
// live loop keeps playing. A full song renders once through; a loop renders LOOP_BARS bars.

const LOOP_BARS = 16;
let renderFrame, frameReady, renderJob = 0, renderingWav = false;
const renderJobs = new Map();
function renderer() {
  if (!frameReady) {
    renderFrame = document.createElement('iframe');
    renderFrame.src = 'render.html?orbs';
    renderFrame.style.display = 'none';
    frameReady = new Promise((res) => (renderFrame.onload = res));
    document.body.append(renderFrame);
  }
  return frameReady;
}
addEventListener('message', (e) => {
  if (e.origin !== location.origin || e.data?.source !== 'algorave-render') return;
  const job = renderJobs.get(e.data.id);
  if (!job) return;
  if (e.data.type === 'progress') job.progress(e.data.value);
  else {
    renderJobs.delete(e.data.id);
    e.data.type === 'done' ? job.resolve(e.data.wav) : job.reject(new Error(e.data.message));
  }
});

// the code as it would play from cycle 0, without anything only the live page hears;
// `full`: the whole stem song once through, otherwise LOOP_BARS of the loop
function renderCode(full) {
  offline = true;
  const live = song;
  if (!full) song = null;
  const s0 = song?.s0;
  if (song) song.s0 = 0;
  try {
    const code = buildCode();
    const cycles = song ? songPlanCache.reduce((s, x) => s + x.len, 0) : LOOP_BARS;
    return { code, cycles, tempo: bpm() };
  } finally {
    offline = false;
    song = live;
    if (song) {
      if (full) song.s0 = s0;
      ui.code.textContent = buildCode(); // put the live code (and song bar) back
    }
  }
}

// 💾 루프 WAV (loop mode) and 💾 스템 WAV (while the stems are open)
const wavBtn = $('wavBtn'), wavStemBtn = $('wavStemBtn');
const wavLabel = (b) => ot(b === wavStemBtn ? 'wavStem' : 'wav');
wavBtn.addEventListener('click', () => saveWav(wavBtn, false));
// the loop's save / share buttons move the guide on to the stems
for (const b of [wavBtn, $('shareBtn'), $('serverShareBtn')]) b.addEventListener('click', () => tutEvent('share'));
wavStemBtn.addEventListener('click', () => saveWav(wavStemBtn, true));
async function saveWav(btn, full) {
  if (renderingWav) return;
  if (full && !song?.sections) return;
  if (!layers().some((l) => l.code)) {
    ui.soloHint.textContent = ot('noSound');
    return;
  }
  const { code, cycles, tempo } = renderCode(full);

  renderingWav = true;
  wavBtn.disabled = wavStemBtn.disabled = true;
  btn.textContent = ot('rendering', { p: 0 });
  try {
    await renderer();
    const id = ++renderJob;
    const wav = await new Promise((resolve, reject) => {
      renderJobs.set(id, { resolve, reject, progress: (p) => (btn.textContent = ot('rendering', { p: Math.round(p * 100) })) });
      renderFrame.contentWindow.postMessage({ type: 'render', id, code, start: 0, end: cycles, cps: tempo / 4 / 60 }, location.origin);
    });
    const name = (ui.presetName.value.trim() || layers().find((l) => l.code)?.name || 'orb').replace(/[\\/:*?"<>|]/g, '');
    // an in-app browser may open the page elsewhere: the set goes along in the URL (see handoffPreset)
    const handoff = () => location.href.split('#')[0] + '#' + presetText(currentPreset(name, { withSong: full }));
    saveFile(new Blob([wav], { type: 'audio/wav' }), `ORBRAVE - ${name} ${tempo}bpm${full ? ' (full)' : ''}.wav`, { handoff });
  } catch (e) {
    console.error('render failed', e);
    ui.soloHint.textContent = ot('wavFail');
  } finally {
    renderingWav = false;
    wavBtn.disabled = wavStemBtn.disabled = false;
    btn.textContent = wavLabel(btn);
  }
}

// ---------- full song ----------
// The current set becomes the centre of a whole track: an intro and build-up lead into it,
// then a break and a second drop in a new key (with a different variation and one or two
// parts swapped for a sibling), and an outro back home.

// the kinds of section: their usual length and which parts play in them (also what ＋ adds)
const SECTION_KINDS = {
  인트로: { len: 8, keep: (l) => !l.drum && !['bass', 'lead'].includes(role(l)) },
  빌드업: { len: 8, keep: (l) => role(l) !== 'kick' && role(l) !== 'lead' },
  드롭: { len: 16, keep: () => true },
  브레이크: { len: 8, keep: (l) => !l.drum && role(l) !== 'bass' },
  브리지: { len: 8, keep: (l) => l.drum || ['bass', 'texture'].includes(role(l)) },
  아웃트로: { len: 8, keep: (l) => l.drum || ['pad', 'texture'].includes(role(l)) },
};

function songPlan() {
  const r = rng(song.seed);
  const base = layers().filter((l) => l.code);
  const swaps = new Map();
  for (const l of r.shuffle(base.filter((x) => !x.raw))) {
    if (swaps.size >= 2) break;
    if (l.spot) continue; // a block FX stays itself (and is never swapped in for another orb)
    const alts = LAYERS.filter((x) => x.cat === l.cat && x.code && !x.spot && !active.has(x.id));
    if (alts.length && r.chance(0.7)) swaps.set(l.id, r.pick(alts));
  }
  const swapped = base.map((l) => swaps.get(l.id) ?? l);
  const up = r.pick([2, 3, 5, -2]);
  const K = SECTION_KINDS;
  const plan = [
    { name: '인트로', len: r.pick([8, 16]), from: base, keep: K.인트로.keep },
    { name: '빌드업', len: 8, from: base, keep: K.빌드업.keep },
    { name: '드롭', len: 16, from: base, keep: K.드롭.keep },
    { name: '브레이크', len: 8, from: swapped, keep: K.브레이크.keep, shift: up, v: 1 },
    { name: '드롭 2', len: 16, from: swapped, keep: K.드롭.keep, shift: up, v: 1 },
  ];
  if (r.chance(0.5)) plan.push({ name: '브리지', len: 8, from: swapped, keep: K.브리지.keep, shift: up, v: 2 });
  plan.push({ name: '아웃트로', len: 8, from: base, keep: K.아웃트로.keep });
  return plan.map((s) => {
    const kept = s.from.filter(s.keep);
    return { ...s, shift: s.shift ?? 0, v: s.v ?? 0, layers: kept.length ? kept : s.from };
  });
}

// The plan becomes an editable grid: a row per instrument, a column per 4-bar block (grouped
// into sections), and in every block whether the instrument plays there and with which seed.
// The stem panel shows it; the song is built from it. Leads get a new seed every block; the
// other parts keep one seed per section. Orbs without a seed carry none (v: null), and drawn
// (user-edited) rows are labelled C01, C02 … instead.
const BLOCK = 4;
// a section is any whole number of bars: one block per started 4, the last one maybe shorter
const blocksIn = (sec) => Math.ceil(sec.len / BLOCK);
const blockBars = (sec, j) => Math.min(BLOCK, sec.len - j * BLOCK);
const isLead = (l) => role(l) === 'lead';
const newSeed = () => 1 + Math.floor(Math.random() * 9999);
// the seed of block `g` (counted through the whole song for a lead) from a section's base seed
const blockSeed = (l, base, g) => (!seeded(l) ? null : isLead(l) ? base + g : base);
function cellsFor(l, on) {
  if (l.spot) return spotCells(l);
  let g = 0;
  return song.sections.map((sec, i) => Array.from({ length: blocksIn(sec) }, () => ({ on: on(sec, i), v: blockSeed(l, seedOf(l) + (sec.v ?? 0) * 100, g++) })));
}
// A block FX (spot orb) plays in one block only: a hit or down-sweep on the drop's first block,
// a reversed sound or up-sweep on the build-up's last block, leading into the drop. Without
// those sections it takes the first block after the intro (or the song's first block).
function spotCells(l) {
  const secs = song.sections;
  const drop = secs.findIndex((s) => s.name === '드롭');
  const build = secs.findIndex((s) => s.name === '빌드업');
  let at, block;
  if (l.spot === 'end' && build >= 0) [at, block] = [build, blocksIn(secs[build]) - 1];
  else if (drop >= 0) [at, block] = [drop, 0];
  else [at, block] = [Math.min(1, secs.length - 1), 0];
  let g = 0;
  return secs.map((sec, i) => Array.from({ length: blocksIn(sec) }, (_, j) => ({ on: i === at && j === block, v: blockSeed(l, seedOf(l) + (sec.v ?? 0) * 100, g++) })));
}
function buildGrid() {
  const plan = songPlan();
  const rows = [];
  for (const sec of plan) for (const l of sec.layers) if (!rows.includes(l.id)) rows.push(l.id);
  song.sections = plan.map(({ name, len, shift, v }) => ({ name, len, shift, v }));
  song.rows = rows.map((id) => ({ id, alt: !active.has(id) }));
  song.cells = Object.fromEntries(rows.map((id) => [id, cellsFor(byId[id], (sec, i) => plan[i].layers.some((l) => l.id === id))]));
  song.audition = null;
}

// keep the grid in step with the song's orbs: a new orb gets a row playing everywhere, a removed one loses its row
function syncRows() {
  for (const l of layers()) {
    if (!l.code || song.cells[l.id]) continue;
    song.rows.push({ id: l.id, alt: false });
    song.cells[l.id] = cellsFor(l, () => true);
  }
  song.rows = song.rows.filter((r) => r.alt || active.has(r.id));
  for (const id of Object.keys(song.cells)) if (!song.rows.some((r) => r.id === id)) delete song.cells[id];
}

function songLines() {
  syncRows();
  const secs = (songPlanCache = song.sections);
  const total = secs.reduce((sum, x) => sum + x.len, 0);
  // a double-clicked section head loops just that section
  const aud = !offline && song.audition != null ? song.audition : null;
  // after a jump the song stays silent until it starts (see playFromBar)
  const from = !offline && song.from != null ? `, ${song.from}` : '';
  const out = [];
  for (const r of song.rows) {
    const l = byId[r.id];
    if (!l) continue;
    let o = 0;
    secs.forEach((sec, i) => {
      const blocks = song.cells[r.id][i], base = aud === null ? o : 0;
      o += sec.len;
      if (aud !== null && aud !== i) return;
      // neighbouring blocks with the same seed play as one line (a 💥 block ends its line)
      for (let j = 0, k; j < blocks.length; j = k) {
        for (k = j + 1; k < blocks.length && !blocks[k - 1].fill && blocks[k].on === blocks[j].on && blocks[k].v === blocks[j].v; k++);
        if (!blocks[j].on) continue;
        // same test as the key orbs use, so fx / texture orbs that play notes move with the section too
        const v = blocks[j].v ?? 0;
        const shift = sec.shift && pitchedCode(l, codeOf(l, v)) ? `.transpose(${sec.shift})` : '';
        // the patterns loop every 4 bars on the clock: shifted so each run starts on its first bar
        // (a section of odd length, or a song started off the bar grid after a jump)
        const ph = ((((song.s0 + base + j * BLOCK) % BLOCK) + BLOCK) % BLOCK);
        const late = ph > 1e-6 ? `\n  .late(${+ph.toFixed(4)})` : '';
        const part = (a, b) => `${late}\n  .songPart(${song.s0}, ${aud === null ? total : sec.len}, ${base + a}, ${base + b}${from})`;
        const end = Math.min(k * BLOCK, sec.len), fx = blocks[k - 1].fill && fillFx(l);
        const line = lineFor(l, v, shift);
        if (line) out.push(line + part(j * BLOCK, fx ? end - 1 : end));
        // 💥: the run's last bar plays as a fill
        const fill = fx && lineFor(l, v, shift + fx);
        if (fill) out.push(fill + part(end - 1, end));
      }
    });
  }
  renderSong();
  return out;
}

// 💥 fill: how each part plays the last bar of its 4-bar block (null = no fill for this part)
function fillFx(l) {
  const r = role(l);
  if (['snare', 'hat', 'perc', 'combo'].includes(r)) return '.ply("1 [2 4]")'; // a roll that speeds up
  if (r === 'kick') return '.ply("1 [1 2]")';
  if (r === 'bass') return '.mask("1 [1 0]")'; // drops out on the last beats
  if (r === 'arp' || r === 'lead') return '.ply("1 [1 2]")';
  if (['pad', 'fx', 'texture'].includes(r)) return '.hpf(saw.range(200, 4000))'; // a riser
  return null;
}

const keyName = (shift) => keyText(shift);
const miniOrb = (l) => {
  const b = document.createElement('div');
  b.className = 'mini';
  paint(b, l);
  b.innerHTML = orbInner(l);
  return b;
};
const button = (cls, text, title, onClick) => {
  const b = document.createElement('button');
  b.className = cls;
  b.textContent = text;
  b.title = title;
  b.addEventListener('click', onClick);
  return b;
};

let stemSig = '';
function renderSong() {
  const sig = JSON.stringify([song.sections, song.rows, song.cells, song.audition, keyText(), ot('corner')]);
  if (sig === stemSig) return;
  stemSig = sig;
  renderStem();
}

// Section i becomes `len` bars long (1-64), growing or shrinking at its end. Its blocks follow:
// one per started 4 bars (the last may be shorter), a new one plays like the one before it.
function setSectionLen(i, len) {
  const sec = song.sections[i];
  len = Math.max(1, Math.min(LIMITS.sectionBlocks * BLOCK, len));
  if (len === sec.len) return false;
  sec.len = len;
  const n = blocksIn(sec);
  for (const r of song.rows) {
    const blocks = song.cells[r.id][i];
    while (blocks.length > n) blocks.pop();
    while (blocks.length < n) {
      const last = blocks.at(-1);
      blocks.push({ on: last.on, v: last.v == null ? null : isLead(byId[r.id]) ? last.v + 1 : last.v, fill: false });
    }
  }
  return true;
}

// The || between section heads: drag it to make the section before it longer or shorter, a bar at a time
let gripDrag = null;
function gripDown(e, i) {
  e.preventDefault();
  e.stopPropagation();
  const h = e.currentTarget.closest('.sh');
  gripDrag = { i, x: e.clientX, len: song.sections[i].len, bar: (h.getBoundingClientRect().width + 2) / song.sections[i].len };
  document.body.classList.add('sec-resizing');
}
addEventListener('pointermove', (e) => {
  if (!gripDrag) return;
  const len = gripDrag.len + Math.round((e.clientX - gripDrag.x) / gripDrag.bar);
  if (setSectionLen(gripDrag.i, len)) {
    renderSong();
    syncSoon();
  }
});
addEventListener('pointerup', () => {
  if (!gripDrag) return;
  gripDrag = null;
  document.body.classList.remove('sec-resizing');
  sync();
});

// 🗑 on a section head: the section and its column of blocks go (the song keeps at least one)
function deleteSection(i) {
  const secs = song.sections;
  if (secs.length < 2) return;
  secs.splice(i, 1);
  for (const r of song.rows) song.cells[r.id].splice(i, 1);
  if (song.audition === i) song.audition = null;
  else if (song.audition > i) song.audition--;
  sync();
}

// ＋ on a section head: a new section of `kind` right after section i, in its key. Of the parts
// playing at the end of section i it keeps the ones the kind wants (all of them if none fit);
// a block FX stays out.
function insertSection(i, kind) {
  const secs = song.sections, prev = secs[i];
  const { len, keep } = SECTION_KINDS[kind];
  const same = secs.filter((s) => s.name.split(' ')[0] === kind).length;
  const sec = { name: same ? `${kind} ${same + 1}` : kind, len, shift: prev.shift ?? 0, v: prev.v ?? 0 };
  secs.splice(i + 1, 0, sec);
  const wasOn = (r) => song.cells[r.id][i].at(-1).on && !byId[r.id]?.spot;
  const kept = song.rows.filter((r) => wasOn(r) && keep(byId[r.id]));
  const on = new Set((kept.length ? kept : song.rows.filter(wasOn)).map((r) => r.id));
  for (const r of song.rows) {
    const tail = song.cells[r.id][i].at(-1);
    song.cells[r.id].splice(i + 1, 0, Array.from({ length: blocksIn(sec) }, (_, j) => ({
      on: on.has(r.id),
      v: tail.v == null ? null : isLead(byId[r.id]) ? tail.v + 1 + j : tail.v,
      fill: false,
    })));
  }
  if (song.audition > i) song.audition++;
  sync();
}

// A button that could undo work asks first: the first click turns it into the question, which
// takes a click only after ARM_MS (so a double-click can't answer it); it gives up after a while
// or when anything else is pressed.
const ARM_MS = 500;
function askFirst(btn, ask, run) {
  if (btn.classList.contains('arm')) {
    if (btn.classList.contains('locked')) return;
    disarm(btn);
    run();
    return;
  }
  btn.dataset.label = btn.textContent;
  btn.textContent = ask;
  btn.classList.add('arm', 'locked');
  btn.armTimers = [setTimeout(() => btn.classList.remove('locked'), ARM_MS), setTimeout(() => disarm(btn), 4000)];
}
function disarm(btn) {
  if (!btn.classList.contains('arm')) return;
  btn.armTimers?.forEach(clearTimeout);
  btn.textContent = btn.dataset.label;
  btn.classList.remove('arm', 'locked');
}
document.addEventListener('pointerdown', (e) => {
  for (const b of document.querySelectorAll('button.arm')) if (!b.contains(e.target)) disarm(b);
});

// ✕ on a section head: "섹션 삭제할까요?" pops up above and to its right, and deletes on a
// click once ARM_MS has passed
const delAsk = document.createElement('div');
delAsk.className = 'delask';
document.body.append(delAsk);
function openDelAsk(anchor, i) {
  delAsk.innerHTML = '';
  const b = button('ghost', ot('secDelAsk'), '', () => {
    if (b.classList.contains('locked')) return;
    delAsk.classList.remove('open');
    deleteSection(i);
  });
  b.classList.add('arm', 'locked');
  setTimeout(() => b.classList.remove('locked'), ARM_MS);
  delAsk.append(b);
  delAsk.classList.add('open');
  const r = anchor.getBoundingClientRect();
  delAsk.style.left = `${Math.max(8, Math.min(innerWidth - delAsk.offsetWidth - 8, r.right - 6))}px`;
  delAsk.style.top = `${Math.max(8, r.top - delAsk.offsetHeight - 2)}px`;
}
document.addEventListener('pointerdown', (e) => {
  if (!e.target.closest('.delask, .secdel')) delAsk.classList.remove('open');
});

// ♯ on a section head: the section plays in the song's sub key, or back in the home key. The sub
// key is the one the other modulated sections use, else the one last switched off, else one
// picked from the song's seed (as the plan picks it).
function subShift() {
  return song.sections.find((s) => s.shift)?.shift ?? song.sub ?? rng(song.seed ?? 0).pick([2, 3, 5, -2]);
}
function toggleSub(i) {
  const sec = song.sections[i];
  if (sec.shift) {
    song.sub = sec.shift;
    sec.shift = 0;
  } else sec.shift = subShift();
  sync();
}

// the ＋ menu: one button per kind of section
const secMenu = document.createElement('div');
secMenu.className = 'secmenu';
document.body.append(secMenu);
function openSecMenu(anchor, i) {
  secMenu.innerHTML = '';
  for (const kind of Object.keys(SECTION_KINDS)) {
    secMenu.append(button('ghost', secName(kind), ot('secAddKind', { name: secName(kind), n: SECTION_KINDS[kind].len }), () => {
      secMenu.classList.remove('open');
      insertSection(i, kind);
    }));
  }
  const r = anchor.getBoundingClientRect();
  secMenu.classList.add('open');
  secMenu.style.left = `${Math.max(8, Math.min(innerWidth - secMenu.offsetWidth - 8, r.left))}px`;
  secMenu.style.top = `${Math.min(innerHeight - secMenu.offsetHeight - 8, r.bottom + 4)}px`;
}
document.addEventListener('pointerdown', (e) => {
  if (!e.target.closest('.secmenu, .secadd')) secMenu.classList.remove('open');
});

// The grid has a column per bar: a section head spans its bars, a block cell its (up to) 4.
function renderStem() {
  const secs = song.sections, grid = ui.stemGrid;
  grid.innerHTML = '';
  const nBars = secs.reduce((sum, x) => sum + x.len, 0);
  grid.style.gridTemplateColumns = `170px repeat(${nBars}, minmax(21px, 1fr))`;
  const corner = document.createElement('div');
  corner.className = 'corner';
  corner.textContent = ot('corner');
  grid.append(corner);
  const full = secs.length >= LIMITS.sections; // as many as a shared song may carry
  secs.forEach((sec, i) => {
    const h = document.createElement('div');
    h.className = 'sh' + (song.audition === i ? ' aud' : '') + (sec.shift ? ' mod' : '') + (sec.len < 8 ? ' narrow' : '') + (sec.len < 4 ? ' tiny' : '');
    h.style.gridColumn = `span ${sec.len}`;
    h.title = ot('secTip');
    sectionClicks(h, i);
    const bars = document.createElement('small');
    bars.className = 'bars';
    bars.textContent = ot('bars', { n: sec.len });
    const name = document.createElement('span');
    name.className = 'sname';
    name.textContent = (song.audition === i ? '🔁 ' : '') + (sec.shift ? `${secName(sec.name)} · ${keyName(sec.shift)}` : secName(sec.name));
    const add = button('ghost len secadd', '+', ot(full ? 'secAddFull' : 'secAdd', { n: LIMITS.sections }), (e) => {
      if (secMenu.classList.contains('open')) secMenu.classList.remove('open');
      else openSecMenu(e.currentTarget, i);
    });
    add.disabled = full;
    const sub = button('ghost len secsub' + (sec.shift ? ' on' : ''), '♯', ot(sec.shift ? 'secSubOff' : 'secSubOn', { key: keyName(sec.shift || subShift()) }), () => toggleSub(i));
    const del = button('ghost len secdel', '✕', ot('secDel'), (e) => openDelAsk(e.currentTarget, i));
    del.disabled = secs.length < 2;
    const grip = document.createElement('i');
    grip.className = 'grip';
    grip.title = ot('secGrip');
    grip.addEventListener('pointerdown', (e) => gripDown(e, i));
    h.append(name, bars, Object.assign(document.createElement('i'), { className: 'prog' }), sub, add, del, grip);
    grid.append(h);
  });
  // the bar numbers under the section heads: a click plays the song from that bar
  const barCorner = document.createElement('div');
  barCorner.className = 'corner barcorner';
  grid.append(barCorner);
  let bar = 0;
  for (const sec of secs) {
    for (let k = 0; k < sec.len; k++) {
      const off = bar++;
      const b = button('barnum' + (k % BLOCK === 0 ? ' blk' : '') + (k === 0 ? ' first' : '') + (k === sec.len - 1 ? ' last' : ''), String(off + 1), ot('barTip', { n: off + 1 }), () => playFromBar(off));
      grid.append(b);
    }
  }
  const tags = customTags();
  for (const r of song.rows) {
    const l = byId[r.id];
    if (!l) continue;
    const custom = l.raw ? tags.get(r.id) ?? 'C' : null;
    const head = document.createElement('div');
    head.className = 'rh' + (r.alt ? ' alt' : ''); // .rh starts a new grid row (column 1)
    head.style.setProperty('--g', ctint(l));
    const tag = document.createElement('b');
    tag.textContent = roleText(role(l));
    const name = document.createElement('span');
    name.textContent = l.name;
    head.append(miniOrb(l), tag, name);
    if (!custom && seeded(l)) {
      head.append(button('ghost batch', '→#', ot(isLead(l) ? 'rowSeedsLead' : 'rowSeeds'), (e) => askSeed(e.currentTarget, song.cells[r.id][0][0].v, (v) => {
        let g = 0;
        song.cells[r.id].flat().forEach((b) => (b.v = isLead(l) ? v + g++ : v));
        sync();
      })));
    }
    head.title = r.alt ? `${l.name} — ${ot('altRow')}` : l.name;
    grid.append(head);
    song.cells[r.id].forEach((blocks, i) => blocks.forEach((cell, j) => {
      const c = document.createElement('div');
      c.className = 'cell' + (cell.on ? ' on' : '') + (song.audition === i ? ' aud' : '') + (j === 0 ? ' first' : '');
      c.style.gridColumn = `span ${blockBars(secs[i], j)}`;
      c.style.setProperty('--g', ctint(l));
      c.title = ot(cell.on ? 'cellOff' : 'cellOn');
      if (cell.on) {
        // the seed on the left (none for an orb without one), ✕ on the right takes it out here
        const label = custom ?? (cell.v == null ? '' : `#${cell.v}`);
        const tagEl = button('ghost seedtag', label, ot(custom ? 'customInst' : 'changeSeed'), (e) => {
          e.stopPropagation();
          if (!custom && cell.v != null) askSeed(e.currentTarget, cell.v, (v) => ((cell.v = v), sync()));
        });
        if (!label) tagEl.style.visibility = 'hidden';
        const x = button('ghost cellx', '✕', ot('cellDel'), (e) => {
          e.stopPropagation();
          cell.on = false;
          cell.fill = false;
          sync();
        });
        const tools = document.createElement('span');
        tools.className = 'celltools';
        if (fillFx(l)) {
          tools.append(button('ghost cellfill' + (cell.fill ? ' on' : ''), '💥', ot(cell.fill ? 'cellFillOff' : 'cellFill'), (e) => {
            e.stopPropagation();
            cell.fill = !cell.fill;
            sync();
          }));
        }
        tools.append(x);
        c.append(tagEl, tools);
      }
      c.addEventListener('click', () => {
        cell.on = !cell.on;
        if (!cell.on) cell.fill = false;
        sync();
      });
      grid.append(c);
    }));
  }
}

// a small box under the clicked seed to type a new one
function askSeed(anchor, initial, apply) {
  const pop = ui.seedPop, input = pop.querySelector('input');
  const r = anchor.getBoundingClientRect();
  pop.style.left = `${Math.min(innerWidth - 190, Math.max(8, r.left))}px`;
  pop.style.top = `${Math.min(innerHeight - 50, r.bottom + 4)}px`;
  pop.classList.add('open');
  input.value = initial;
  input.focus();
  input.select();
  pop.onsubmit = (e) => {
    e.preventDefault();
    const v = parseInt(input.value, 10);
    if (Number.isFinite(v) && v >= 0) apply(v);
    pop.classList.remove('open');
  };
}
document.addEventListener('pointerdown', (e) => {
  if (!e.target.closest('#seedPop') && !e.target.closest('.batch, .seedtag')) ui.seedPop.classList.remove('open');
});

// A section head: a click plays the song from the 4-bar block under the mouse (and ends a looped
// section), a double-click loops just that section. The click waits a moment so a double-click
// doesn't seek first; either way the jump lands on the next 4-bar boundary.
const DBL_MS = 260;
let secClickTimer = 0;
function sectionClicks(h, i) {
  h.addEventListener('click', (e) => {
    if (e.target.closest('button, .grip')) return; // ＋ / 🗑 / the || resize grip
    clearTimeout(secClickTimer);
    if (e.detail >= 2) {
      loopSection(i);
      return;
    }
    const r = h.getBoundingClientRect();
    const n = blocksIn(song.sections[i]);
    const j = Math.max(0, Math.min(n - 1, Math.floor(((e.clientX - r.left) / r.width) * n)));
    secClickTimer = setTimeout(() => playFrom(i, j), DBL_MS);
  });
}
// the whole song from block j of section i
async function playFrom(i, j) {
  if (!song?.sections) return;
  await playFromBar(song.sections.slice(0, i).reduce((sum, x) => sum + x.len, 0) + j * BLOCK);
}
// A jump into the song waits one bar from the next beat: silent, with the stems counting in
// (grey cursor, 4 · 3 · 2 · 1). The song then starts off the bar grid, so songLines shifts its
// patterns to match (.late).
const countIn = () => Math.ceil((nowCycle() + 0.05) * 4) / 4 + 1;
// the whole song from bar `off` (0-based, counted through the song)
async function playFromBar(off) {
  if (!song?.sections) return;
  song.audition = null;
  if (!playing) await play();
  song.from = countIn();
  song.s0 = song.from - off;
  await sync();
}
// section i on repeat, from its start (counted in the same way)
async function loopSection(i) {
  if (!song?.sections) return;
  song.audition = i;
  if (!playing) await play();
  song.from = countIn();
  song.s0 = song.from - song.sections[i].len;
  await sync();
}

// 📂 스템 열기 sits with the loop's buttons; 🎲 곡 구성 랜덤화 lives in the stems' head. While the
// stems are open on a wide screen, their save / share buttons go up into that head too (on a
// phone the stems are hidden, so they stay in the export popover).
const stemTools = [wavStemBtn, $('stemShareBtn'), $('serverShareBtn')];
function stemToolsHome() {
  $('wavBtn').after(stemTools[0]);
  $('shareBtn').after(stemTools[1]);
  stemTools[1].after(stemTools[2]);
}
function stemToolsPlace() {
  if (document.body.classList.contains('stem-open') && !isPhone.matches) $('stemClose').before(...stemTools);
  else if (stemTools[0].closest('.stem-head')) stemToolsHome();
}
isPhone.addEventListener('change', stemToolsPlace);
function openSong() {
  document.body.classList.add('stem-open');
  ui.song.classList.add('on');
  stemToolsPlace();
  updateShareButtons();
  tutEvent('stems');
}
function closeSong() {
  if (song?.sections) lastSong = song; // kept for 📂 스템 열기
  song = null;
  songPlanCache = null;
  stemSig = '';
  document.body.classList.remove('stem-open');
  ui.song.classList.remove('on');
  stemToolsPlace();
  updateShareButtons();
  for (const a of active.values()) a.at = 0;
  sync();
}

// a new song around the current set (📂 스템 열기 the first time, 🎲 곡 구성 랜덤화 after), or with
// `again` the stems closed last, back as they were left
async function startSong(again) {
  if (!layers().some((l) => l.code)) {
    ui.soloHint.textContent = ot('addOrbsFirst');
    return;
  }
  const was = playing;
  if (!playing) await play();
  const s0 = was ? nextPhrase() : 0;
  if (again) song = { ...lastSong, s0, audition: null, from: null };
  else {
    song = { seed: Math.floor(Math.random() * 1e9), s0 };
    buildGrid();
  }
  stemSig = '';
  openSong();
  await sync();
}
ui.songBtn.addEventListener('click', () => askFirst(ui.songBtn, ot('otherSongAsk'), () => startSong(false)));
$('stemReopen').addEventListener('click', () => !song && startSong(!!lastSong));
$('songOff').addEventListener('click', closeSong);
$('stemClose').addEventListener('click', closeSong);

// where the song is now: the section and how far into it (a looped section counts on its own)
// Where in its 4-bar loop the music is now (0 to BARS), for the backdrop's sweep and the edit
// roll's playhead. In a song that is counted from the start of the 4-bar block playing (blocks
// start every 4 bars from their section's start, as songLines shifts the patterns), so a jump
// to bar 10 shows bar 2 of its block. null while a jump counts in: nothing moves until it starts.
function loopPos(now = nowCycle()) {
  const abs = ((now % BARS) + BARS) % BARS;
  if (!song?.sections) return abs;
  if (song.from != null && now < song.from) return null;
  const t = now - song.s0;
  if (t < 0) return abs; // the loop still playing until a new song comes in
  const secs = song.sections;
  let q; // bars into the section playing
  if (song.audition != null) q = t % secs[song.audition].len;
  else {
    let p = t % secs.reduce((sum, x) => sum + x.len, 0);
    for (const sec of secs) {
      if (p < sec.len) break;
      p -= sec.len;
    }
    q = p;
  }
  return q % BLOCK;
}

function songPosition(t = nowCycle()) {
  const secs = song.sections, total = secs.reduce((sum, x) => sum + x.len, 0);
  if (t < song.s0) return { idx: song.audition ?? 0, frac: 0, total };
  if (song.audition != null) return { idx: song.audition, frac: ((t - song.s0) % secs[song.audition].len) / secs[song.audition].len, total };
  const p = (t - song.s0) % total;
  let o = 0;
  for (let i = 0; i < secs.length; i++) {
    if (p < o + secs[i].len) return { idx: i, frac: (p - o) / secs[i].len, total };
    o += secs[i].len;
  }
  return { idx: -1, frac: 0, total };
}

function updateSongCursor() {
  const body = $('stemBody'), count = $('stemCount');
  if (!song?.sections || !playing) {
    body.classList.remove('waiting');
    count.textContent = '';
    return;
  }
  // after a jump: held grey on where it will start, counting the beats down until it does
  const now = nowCycle(), wait = song.from != null && now < song.from;
  body.classList.toggle('waiting', wait);
  const left = wait ? Math.max(1, Math.min(4, Math.ceil((song.from - now) * 4 - 1e-6))) : 0; // beats
  if (count.textContent !== String(left || '')) {
    count.textContent = left || '';
    // each new number pops in again
    count.classList.remove('tick');
    void count.offsetWidth;
    if (left) count.classList.add('tick');
  }
  const { idx, frac } = songPosition(wait ? song.from : now);
  // how far each section has played: the one playing fills up, the ones before it are full
  // (a looped section counts on its own, so the others stay empty)
  const done = (i) => (i === idx ? frac : song.audition == null && idx >= 0 && i < idx ? 1 : 0);
  const heads = ui.stemGrid.querySelectorAll('.sh');
  heads.forEach((h, i) => {
    h.classList.toggle('now', i === idx);
    h.classList.toggle('past', done(i) === 1);
    h.style.setProperty('--p', done(i).toFixed(4));
  });
  const sc = $('stemCursor');
  if (heads[idx]) {
    const hr = heads[idx].getBoundingClientRect(), br = body.getBoundingClientRect();
    const x = `${hr.left - br.left + body.scrollLeft + frac * hr.width}px`;
    sc.style.display = '';
    sc.style.left = count.style.left = x;
    count.style.top = `${body.scrollTop + 5}px`; // stays up on the section heads when scrolled
  } else sc.style.display = 'none';
}

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
  if (analyser && playing) {
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
  const now = repl && playing ? nowCycle() : 0;
  sats.forEach((a, i) => {
    const tilt = (i / sats.length) * Math.PI + 0.35;
    const rx = cr.width / 2 + 26 + (i % 3) * 12 + level * 10, ry = rx * 0.32;
    const dir = i % 2 ? -1 : 1;
    const ang = (dir * ts) / (900 + (i % 4) * 260) + i * 1.7;
    const lx = Math.cos(ang) * rx, ly = Math.sin(ang) * ry;
    const x = lx * Math.cos(tilt) - ly * Math.sin(tilt), y = lx * Math.sin(tilt) + ly * Math.cos(tilt);
    const depth = Math.sin(ang);
    const soloed = solo === a.layer.id;
    const dim = (playing && now < a.at) || (!!a.layer.code && ducked(a.layer) < 1) || (solo && !soloed);
    a.sat.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) scale(${((0.8 + depth * 0.25) * (soloed ? 1.5 : 1)).toFixed(3)})`;
    // restacking costs more than moving: only when the orb actually passes behind / in front
    const z = depth > 0 ? 3 : 1;
    if (a.z !== z) a.sat.style.zIndex = a.z = z;
    a.sat.style.opacity = (dim ? 0.3 : 0.7 + depth * 0.3).toFixed(2);
    g.save();
    g.strokeStyle = toneHex(tint(a.layer));
    g.globalAlpha = soloed ? 0.6 : solo ? 0.06 : 0.16;
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
// the dark piano roll behind the page on wide screens (midiBackdrop.js): the loop of every pitched
// orb on the player, as it plays (no hover previews, no waiting variations, no auditioned key)
function drawBackdrop(c, dt, w, h) {
  const on = !isPhone.matches && playing && !!repl;
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
  if (!started || !playing) return;
  const sounding = layers().filter((l) => l.code);
  if (!sounding.length) return;
  const inner = cr.width / 2 + 40;
  const span = (Math.PI * 2) / sounding.length;
  sounding.forEach((l, i) => {
    const bands = bandsOf(l.id);
    const col = toneHex(tint(l));
    const dim = solo && solo !== l.id ? 0.25 : 1;
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

// ---------- toolbar ----------


// ---------- orb search ----------
// Terms are separated by spaces or "/" and all have to match. A term is looked up in an orb's
// name, kind and part (Korean or English) and in a combo's parts; "bpm" / "템포" finds tempo
// orbs and a number finds tempos near it; Am / minor / 단조 and A / major / 장조 find by key.
const MODE_WORDS = { minor: ['minor', '단조', '마이너', '短調'], major: ['major', '장조', '메이저', '長調'] };
const FLATS = { db: 'c#', eb: 'd#', gb: 'f#', ab: 'g#', bb: 'a#' };
// "Bm" -> { tonic: 2, mode: 'minor' }, "F#" / "Gb" / "f#maj" -> major; anything else -> null
function parseKey(term) {
  const m = /^([a-g])(#|b)?(m|min|minor|maj|major)?$/.exec(term);
  if (!m) return null;
  let name = m[1] + (m[2] ?? '');
  name = FLATS[name] ?? name;
  const i = KEYS.findIndex((k) => k.toLowerCase() === name);
  return i < 0 ? null : { tonic: i, mode: m[3] && !m[3].startsWith('maj') ? 'minor' : 'major' };
}
// a combo's key is the key orb inside it
const keyOf = (l) => (l.cat === 'mode' ? l : l.combo?.map((c) => byId[c]).find((x) => x.cat === 'mode'));
const partText = (l) => `${ROLE_TEXT[role(l)] ?? ''} ${allLangs(`role.${role(l)}`)} ${allLangs(`slot.${role(l)}`)}`;
const orbText = (l) => [l.name, l.kind, l.cat, partText(l), TYPE_EXTRA[role(l)] ?? '', ...(l.combo ?? []).map((c) => `${byId[c].name} ${byId[c].kind} ${partText(byId[c])}`)].join(' ').toLowerCase();
function matchesTerm(l, term) {
  if (/^(bpm|tempo|템포|テンポ)$/.test(term)) return !!l.bpm;
  // a number finds tempos near it, and also drum machines by name (808, 909 …)
  if (/^\d+$/.test(term)) return (!!l.bpm && Math.abs(l.bpm - +term) <= 6) || orbText(l).includes(term);
  for (const [mode, words] of Object.entries(MODE_WORDS)) if (words.includes(term)) return keyOf(l)?.mode === mode;
  const k = parseKey(term);
  if (k) return !!keyOf(l) && (keyOf(l).key + 12) % 12 === k.tonic && keyOf(l).mode === k.mode;
  return orbText(l).includes(term);
}
// Operators: "-term" (or "!term") leaves out what the term finds, and "field:value" looks in one
// field only — t: the orb's own part (a combo is "combo", not its parts), s: its scale (a combo
// has its parts' scales), k: its key, bpm: its tempo (120, >120, <90, 120-140).
const FIELDS = {
  type: ['t', 'type', 'part', '종류', '타입', '파트', '種類', 'タイプ'],
  scale: ['s', 'scale', '스케일', '음계', 'スケール', '音階'],
  key: ['k', 'key', '키', '조성', '調', 'キー'],
  bpm: ['bpm', 'tempo', '템포', 'テンポ'],
};
const FIELD_OF = Object.fromEntries(Object.entries(FIELDS).flatMap(([f, ws]) => ws.map((w) => [w, f])));
const DRUM_WORDS = 'drum drums 드럼 ドラム';
const TYPE_EXTRA = {
  kick: DRUM_WORDS, snare: `${DRUM_WORDS} clap 클랩`, hat: DRUM_WORDS, perc: DRUM_WORDS,
  combo: 'combo 콤보 コンボ', mode: 'key mode 키 조성 調 キー', mood: 'mood 무드', tempo: 'bpm',
};
// a mood's sub-type (MOOD_SUBS), in every language: t:공간, t:eq, t:balance …
const SUB_EXTRA = {
  eq: 'eq equalizer tone 이퀄라이저 이큐 음색 저음 고음 イコライザー 音色 低音 高音',
  filter: 'filter 필터 먹먹 フィルター', space: 'space reverb echo 공간 리버브 메아리 空間 リバーブ',
  texture: 'texture distortion 질감 지글 왜곡 質感 歪み', motion: 'motion pan rhythm 움직임 패닝 리듬 動き',
  mix: 'balance mix 밸런스 볼륨 줄임 バランス',
};
const typeText = (l) => {
  const r = role(l);
  const sub = l.sub ? `${l.sub} ${MOOD_SUBS[l.sub] ?? ''} ${SUB_EXTRA[l.sub] ?? ''}` : '';
  return `${r} ${ROLE_TEXT[r] ?? ''} ${allLangs(`role.${r}`)} ${allLangs(`slot.${r}`)} ${TYPE_EXTRA[r] ?? ''} ${sub}`.toLowerCase();
};
// orbs without their own scale family play the plain seven-note scale of the key
const SCALE_WORDS = {
  natural: 'natural diatonic aeolian ionian minor major 자연 기본 단조 장조 自然',
  pentatonic: 'pentatonic penta 펜타토닉 펜타 ペンタトニック ペンタ',
  blues: 'blues 블루스 ブルース',
  japanese: 'japanese hirajoshi 일본 히라조시 和風 日本 平調子',
  suspended: 'suspended sus egyptian 서스펜디드 서스 이집트 サス',
  malkos: 'malkos malkauns raga 말코스 라가 マルコス',
  vietnamese: 'vietnamese 베트남 ベトナム',
};
const MELODIC = new Set(['bass', 'arp', 'lead', 'pad']);
const scalesOf = (l) =>
  l.combo ? l.combo.flatMap((c) => scalesOf(byId[c])) : l.scaleFamily ? [l.scaleFamily] : MELODIC.has(role(l)) ? ['natural'] : [];
function matchesBpm(l, v) {
  if (!l.bpm) return false;
  let m;
  if ((m = /^([<>])=?(\d+)$/.exec(v))) return m[1] === '>' ? l.bpm >= +m[2] : l.bpm <= +m[2];
  if ((m = /^(\d+)[-~](\d+)$/.exec(v))) return l.bpm >= Math.min(+m[1], +m[2]) && l.bpm <= Math.max(+m[1], +m[2]);
  return /^\d+$/.test(v) ? Math.abs(l.bpm - +v) <= 6 : false;
}
function matchesField(l, field, v) {
  if (field === 'type') return typeText(l).includes(v);
  if (field === 'scale') return scalesOf(l).some((f) => `${f} ${SCALE_WORDS[f] ?? ''}`.toLowerCase().includes(v));
  if (field === 'key') return (Object.values(MODE_WORDS).some((ws) => ws.includes(v)) || !!parseKey(v)) && matchesTerm(l, v);
  return matchesBpm(l, v);
}
// "-t:킥" -> { neg: true, field: 'type', value: '킥' }; a half-typed "t:" or "-" is dropped
function parseTerm(raw) {
  const neg = /^[-!]/.test(raw);
  const body = neg ? raw.slice(1) : raw;
  const m = /^([^:：]+)[:：](.*)$/.exec(body);
  const field = m && FIELD_OF[m[1]];
  const value = field ? m[2] : body;
  return value ? { neg, field, value } : null;
}
const searchOrbs = (q) => {
  const terms = q.toLowerCase().split(/[\s/,]+/).map(parseTerm).filter(Boolean);
  const ok = (l, t) => (t.field ? matchesField(l, t.field, t.value) : matchesTerm(l, t.value)) !== t.neg;
  return terms.length ? LAYERS.filter((l) => terms.every((t) => ok(l, t))).slice(0, 96) : [];
};
function renderSearch() {
  const q = ui.searchInput.value;
  const found = searchOrbs(q);
  ui.searchResults.innerHTML = found.length ? '' : `<p class="empty">${ot(q.trim() ? 'noMatch' : 'searchEx')}</p>`;
  for (const l of found) {
    const item = document.createElement('div');
    item.className = 'hit' + (active.has(l.id) ? ' on' : '');
    item.style.setProperty('--g', ctint(l));
    const name = document.createElement('span');
    name.textContent = l.name;
    const kind = document.createElement('small');
    kind.textContent = l.kind;
    item.append(miniOrb(l), name, kind);
    item.title = ot(active.has(l.id) ? 'inSong' : 'hitTip');
    item.addEventListener('mouseenter', () => hoverOn(l.id));
    item.addEventListener('mouseleave', hoverOff);
    item.addEventListener('pointerdown', (e) => grabFromSearch(e, l.id));
    ui.searchResults.append(item);
  }
}
// click: the orb drops into the field near the top; drag: it is held straight away
function grabFromSearch(e, id) {
  if (e.button !== 0 || active.has(id)) return;
  e.preventDefault();
  const x0 = e.clientX, y0 = e.clientY;
  const home = { kind: 'field', fx: 0.2 + Math.random() * 0.6, fy: 0.12 };
  const cleanup = () => {
    window.removeEventListener('pointermove', move);
    window.removeEventListener('pointerup', up);
    window.removeEventListener('pointercancel', cleanup);
  };
  // an orb is on screen once: a copy already falling or in the stash is taken out first
  const takeCopy = () => {
    const o = rain.find((q) => q.id === id);
    if (o) {
      rain.splice(rain.indexOf(o), 1);
      o.el.remove();
    }
    const i = stash.indexOf(id);
    if (i >= 0) {
      stash.splice(i, 1);
      renderStash();
    }
  };
  const move = (ev) => {
    if (Math.hypot(ev.clientX - x0, ev.clientY - y0) < 6) return;
    cleanup();
    hoverOff();
    takeCopy();
    startDrag(ev, makeOrbEl(id), home, { x: ev.clientX, y: ev.clientY });
  };
  const up = () => {
    cleanup();
    takeCopy();
    const { w, h } = fieldSize();
    rainAdd(id, home.fx * w, home.fy * h, { pop: true });
  };
  window.addEventListener('pointermove', move);
  window.addEventListener('pointerup', up);
  window.addEventListener('pointercancel', cleanup);
}
$('searchBtn').addEventListener('click', () => {
  const open = ui.search.classList.toggle('open');
  $('searchBtn').classList.toggle('on', open);
  if (open) {
    // opens just under the button (it sits in the field's corner); the phone layout overrides this
    const r = $('searchBtn').getBoundingClientRect();
    ui.search.style.setProperty('--search-x', `${Math.max(8, Math.min(r.left, innerWidth - ui.search.offsetWidth - 8))}px`);
    ui.search.style.setProperty('--search-y', `${r.bottom + 6}px`);
    renderSearch();
    ui.searchInput.focus();
    ui.searchInput.select();
  }
});
ui.searchInput.addEventListener('input', renderSearch);
ui.searchInput.addEventListener('keydown', (e) => e.key === 'Escape' && $('searchBtn').click());
$('clear').addEventListener('click', () => {
  countMove(active.size);
  for (const id of [...active.keys()]) removeLayer(id, { silent: true, respawn: false });
  if (song) closeSong(); // nothing left for the stems to play (closeSong syncs)
  else sync();
});
$('codeToggle').addEventListener('click', () => {
  ui.drawer.classList.toggle('open');
  tutEvent('code');
});
$('codeClose').addEventListener('click', () => ui.drawer.classList.remove('open'));

// the bottom-left links wrap on a narrow column: .left keeps that much room under its content
{
  const foot = document.querySelector('.powered');
  new ResizeObserver(() => document.documentElement.style.setProperty('--foot-h', `${foot.offsetHeight}px`)).observe(foot);
}

// (직접수정) strudel.cc: the set as plain Strudel code (what the WAV render plays: no
// previews, solo dips, analysers or bar gates), with the sample banks loaded at the top and the
// CC-BY credits of the sounds it uses, opened in the Strudel REPL through its #<base64> share hash
// (read in the browser, never sent to their server).
function strudelExport() {
  const { code } = renderCode(!!song);
  const credits = attributionsFor(setSampleNames());
  return [
    // comments in the page language (the orb-name comments already follow it through l.name)
    `// ${ot('codeMadeWith')} — https://github.com/r3coder/orbrave (AGPL-3.0)`,
    `// ${ot('codeSounds')}`,
    ...credits.map((c) => `// ${ot('codeCredit')}: ${c.text}`),
    ...samplePrelude(code),
    '',
    code,
  ].join('\n');
}
// Strudel's code2hash, in chunks: its String.fromCharCode(...bytes) overflows on a long song
function strudelHash(code) {
  const bytes = new TextEncoder().encode(code);
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return encodeURIComponent(btoa(bin));
}
$('strudelBtn').addEventListener('click', () => {
  window.open(`https://strudel.cc/#${strudelHash(strudelExport())}`, '_blank', 'noopener');
  tutEvent('code');
});

// Text built in script, redrawn when KR / EN / JP is switched (static text is handled by orbsI18n.js).
function applyLangUI() {
  const sb = $('serverShareBtn');
  sb.textContent = ot(serverUp === false ? 'serverDown' : 'serverShare');
  sb.title = ot(serverUp === false ? 'serverDownTip' : 'serverShareTip');
  volRing.setAttribute('aria-label', ot('volume'));
  if (!renderingWav) for (const b of [wavBtn, wavStemBtn]) b.textContent = wavLabel(b);
}
mountLicenses($('licenseBtn'));
mountChangelog($('verBtn'));
$('feedbackBtn').addEventListener('click', () => window.open('https://forms.gle/gvjXSkEM7W6ug6US9', '_blank', 'noopener'));
// ↺ 튜토리얼 재실행: forget the guide's progress and the current set (presets, language, volume and
// low-spec mode stay), then reload so everything starts as on a first visit
$('tutorialBtn').addEventListener('click', () => {
  sessionDropped = true;
  try {
    for (const k of [TUT_KEY, FIRST_ORB_KEY, SESSION_KEY, 'orbRollReady', 'orbToolsReady']) localStorage.removeItem(k);
  } catch {}
  location.reload();
});
// low-spec mode: the button flips it by hand; the frame-rate watch can also switch it on
const themeLabel = mountThemeButton($('themeBtn'), ot);
onTheme(() => (rollSig = ''));
const liteBtn = $('liteBtn');
liteBtn.classList.toggle('on', lite);
liteBtn.addEventListener('click', () => setLite(!lite));
onLite((on, auto) => {
  liteBtn.classList.toggle('on', on);
  rollSig = '';
  if (auto) ui.soloHint.textContent = ot(isPhone.matches ? 'liteAutoPhone' : 'liteAuto');
});
mountLangButtons($('langs'), () => {

  applyLangUI();

  themeLabel();
  renderStatus();
  renderPresets();
  renderShared();
  if (serverUp === false) sharedList.innerHTML = `<p class="empty">${ot('serverDownList')}</p>`;
  renderRollHead();
  if (song?.sections) {
    stemSig = '';
    renderSong();
  }
  if (ui.search.classList.contains('open')) renderSearch();
  if (tut.banner) banner(ot(isPhone.matches ? 'tutPresetPhone' : 'tutPreset'));
  ui.soloHint.textContent = '';
  // orbs already on screen (falling, in the stash, being dragged) keep their element: relabel them
  for (const el of document.querySelectorAll('.orb[data-id]')) {
    const l = byId[el.dataset.id];
    if (!l) continue;
    const label = el.querySelector('.label'), kind = el.querySelector('.kind');
    if (label) label.textContent = l.name;
    if (kind) kind.textContent = l.kind;
  }
  renderStash();
  ui.code.textContent = buildCode();
});
applyLangUI();

handoffPreset();
restoreSession();
checkFirstOrb({ boot: true });
if (firstOrbDone) comboDue = true;
if (tut.banner) banner(ot(isPhone.matches ? 'tutPresetPhone' : 'tutPreset'));
if (!firstOrbDone) ghostTimer = setTimeout(ghostThrow, 1200);
renderStash();
renderPresets();
refreshShared();
renderRollHead();
renderStatus();
ui.code.textContent = buildCode();
// the first rain waits for the boot screen (it covers the page until then), so it can pick from
// the sounds decoded there (see opening)
booted.then(() => requestAnimationFrame(() => {
  bootDone = true;
  seedRain();
  leaveSlots(); // a set saved with orbs in the slots, opened where they are off: back into the fresh rain
  requestAnimationFrame(frame);
}));
if (import.meta.env.DEV) window.__orbs = { spawnWeights, loopPos, nowCycle, taste: taste.debug, replReady, codeOf, active, rain, stash, byId, addLayer, removeLayer, buildCode, pickForSlot, finishDraft, orbStep, heldSeed, revealRoll, slotOrbs, decorate, get rollOrb() { return rollOrb; }, get draft() { return draft; }, get song() { return song; }, get variation() { return variation; }, patternToRaw, keyMode, LAYERS };
