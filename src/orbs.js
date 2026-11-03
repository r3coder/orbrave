import {
  initStrudel, evaluate, hush, samples, registerZZFXSounds, getAudioContext, getSuperdoughAudioController, Pattern,
  transpiler, noteToMidi, getAnalyserById,
} from '@strudel/web';
import { loadSampleBanks, preloadSamples, preloadDrums } from './samples.js';
import './orbs.css';
import {
  LAYERS, BASE_BPM, KEYS, BAR_CHORDS, snap, rng, hash, byId, role, ROLE_TEXT, setMode, keyLabel,
} from './orbCatalog.js';
import { BARS, STEPS, ROWS, packRaw, unpackRaw, sheetCode, quantize, songToWire, songFromWire, toWire } from './orbPreset.js';
import { uploadPreset, fetchPresets, weightedOrder } from './presetApi.js';
import { mountVote } from './vote.js';
import { ot, secName, allLangs, mountLangButtons } from './orbsI18n.js';
import { mountLicenses } from './licenses.js';
import { copyText } from './copyBox.js';
import { LIMITS, validatePreset } from '../server/presetSchema.mjs';

// Gate a pattern to one window of a looping song: the song starts at cycle `s0`, is `len`
// cycles long, and this part plays from `a` to `b` within it. With `once`, the song doesn't loop.
Pattern.prototype.songPart = function (s0, len, a, b, once = 0) {
  return this.filterWhen((t) => {
    const p = (((t - s0) % len) + len) % len;
    return t >= s0 && (!once || t < s0 + len) && p >= a && p < b;
  });
};

// ---------- state ----------

const $ = (id) => document.getElementById(id);
const ui = {
  play: $('play'), core: $('core'), sats: $('sats'), field: $('field'), right: $('right'), status: $('status'),
  chips: $('chips'), roles: $('roles'), soloHint: $('soloHint'), drawer: $('drawer'), code: $('code'),
  roll: $('roll'), rollCanvas: $('rollCanvas'), rollSlot: $('rollSlot'), rollName: $('rollName'),
  rollErase: $('rollErase'), rollHint: $('rollHint'), rollAdd: $('rollAdd'), rollStash: $('rollStash'),
  stash: $('stash'), stashSlots: $('stashSlots'),
  presetList: $('presetList'), presetName: $('presetName'),
  song: $('song'), songBar: $('songBar'), songBtn: $('songBtn'),
  seeds: $('seeds'), favSeed: $('favSeed'), stem: $('stems'), stemGrid: $('stemGrid'), seedPop: $('seedPop'),
  search: $('searchBox'), searchInput: $('searchInput'), searchResults: $('searchResults'),
};

// the orb page also plays mridangam strokes (yaxu/mrid), on top of the shared banks
const replReady = initStrudel({
  prebake: () => {
    registerZZFXSounds(); // z_sine, z_square … synths (@strudel/web doesn't register them by itself)
    return Promise.all([loadSampleBanks(), samples('https://raw.githubusercontent.com/felixroos/dough-samples/main/mridangam.json')]);
  },
});
const drumsReady = preloadDrums().catch((e) => console.warn('drum preload failed', e)); // see samples.js
let repl;
let playing = false;
let started = false; // audio context unlocked + master chain built
const active = new Map(); // id -> { layer, at, sat, home }
let variation = 1 + Math.floor(Math.random() * 9999); // every page load starts from its own seed
// orbs given their own seed with the 🎲 on their strip; the rest follow `variation`
const ownSeed = new Map(); // id -> seed
const seedOf = (l) => ownSeed.get(l.id) ?? variation;
const ownSeeds = () => (ownSeed.size ? Object.fromEntries(ownSeed) : null);
let solo = null; // id of the orb being auditioned from the list
let song = null; // { seed, s0 } while the full-song arrangement plays
let songPlanCache = null;

// ---------- audio ----------

// master -> limiter -> volume -> speakers; the visuals read the limiter so they don't fade with the volume
let analyser, volume;
let volValue = 0.8;
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
function setVolume(v) {
  volValue = Math.max(0, Math.min(1, v));
  const end = VA0 + volValue * VSWEEP;
  document.getElementById('volArc').setAttribute('d', varc(VA0, Math.max(end, VA0 + 0.01)));
  const [kx, ky] = vpt(end);
  const knob = document.getElementById('volKnob');
  knob.setAttribute('cx', kx);
  knob.setAttribute('cy', ky);
  volTicks.forEach((l, i) => l.classList.toggle('lit', i / (VTICKS - 1) <= volValue));
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
const mood = () => (hoverOrb()?.cat === 'mood' ? hoverOrb() : layers().find((l) => l.cat === 'mood'));
// The key: A minor unless a key orb (in the song, or being auditioned) says otherwise. keyMode is
// major/minor; keyShift is how many semitones every pitched part moves away from A.
const keyOrb = () => (hoverOrb()?.cat === 'mode' ? hoverOrb() : layers().find((l) => l.cat === 'mode'));
const keyMode = () => keyOrb()?.mode ?? 'minor';
const keyShift = () => keyOrb()?.key ?? 0;
const keyText = (extra = 0) => keyLabel({ key: keyShift() + extra, mode: keyMode() });
// a line is pitched when it plays notes; drums and noise are left where they are
const pitchedCode = (l, code) => l.pitched || /\b(scale|chord|note)\(/.test(code);
// a mood can silence whole roles (no drums, drums only, no bass …)
const muted = (l) => !!mood()?.mute?.includes(role(l));
const codeOf = (l, v) => {
  setMode(keyMode());
  const code = typeof l.code === 'function' ? l.code(rng(hash(l.id) + v * 7919)) : l.code;
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
  const m = mood();
  if (!l.code || muted(l)) return null;
  // hovering an orb in the song's list solos it
  const quiet = preview || offline ? '' : solo && solo !== l.id && byId[solo]?.code ? '.postgain(.12)' : '';
  // fft(5): superdough sizes the analyser 2^(5+5) = 1024, the size the equaliser reads it at
  const chan = preview || offline ? '' : `.analyze(${chanOf(l.id)}).fft(5)`;
  const code = codeOf(l, v);
  const key = keyShift() && pitchedCode(l, code) ? `.transpose(${keyShift()})` : '';
  return `// ${preview ? '미리듣기: ' : ''}${l.name}\n$: ${code}${key}${extra}${m?.fx ?? ''}${quiet}${chan}`;
}

function buildCode() {
  const dt = (((60 / bpm()) * 3) / 4).toFixed(3); // dotted-eighth delay in seconds
  const lines = [`setcpm(${bpm()}/4)`];
  // auditioning a sounding orb: it plays alone, unless it is held over the player
  const audition = !offline && hoverSounds().length > 0 && !hoverMix;
  for (const l of hoverSounds()) if (!active.has(l.id)) lines.push(lineFor(l, variation, '', { preview: true }));
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
  if (song) song.s0 = 0;
  playing = true;
  document.body.classList.add('playing');
  await sync();
}

function stop() {
  hush();
  playing = false;
  previewOnly = false;
  if (song) song.once = false;
  onceLabel();
  document.body.classList.remove('playing');
  renderStatus();
}

ui.play.addEventListener('click', () => (playing ? stop() : play()));

// ---------- adding / removing layers ----------

const nextBar = () => (playing ? Math.ceil(nowCycle() + 0.15) : 0);

// how many orbs of one kind may play together; one more bounces the oldest out
const CAPS = { lead: 3, bass: 3, perc: 3, fx: 3, tempo: 4 }; // everything else: one at a time

// Put one layer into the mix (no evaluation), bouncing out what it pushes over the limit.
function put(layer, at, home = null) {
  if (active.has(layer.id)) return;
  const same = [...active.values()].filter((a) => a.layer.cat === layer.cat);
  for (const a of same.slice(0, Math.max(0, same.length - (CAPS[layer.cat] ?? 1) + 1))) removeLayer(a.layer.id, { silent: true });
  warm([layer]);
  active.set(layer.id, { layer, at, home, sat: makeSat(layer) });
}

// The MIDI pane stays tucked away until five orbs have been thrown into the player; then it
// slides up from the bottom and stays (remembered across reloads).
const ROLL_READY_KEY = 'orbRollReady';
const ROLL_AFTER = 5;
let orbsThrown = 0;
function revealRoll({ animate = true } = {}) {
  if (document.body.classList.contains('roll-ready')) return;
  document.body.classList.add('roll-ready');
  if (animate) bump(ui.roll, 'intro');
  try {
    localStorage.setItem(ROLL_READY_KEY, '1');
  } catch {}
}
try {
  if (localStorage.getItem(ROLL_READY_KEY)) document.body.classList.add('roll-ready');
} catch {}

async function addLayer(id, home) {
  if (++orbsThrown >= ROLL_AFTER) revealRoll();
  previewOnly = false; // putting an orb in means the song plays on
  if (!playing) await play();
  const layer = byId[id];
  const at = nextBar();
  if (layer.combo) for (const c of layer.combo) put(byId[c], at);
  else put(layer, at, home);
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

// ---------- status, list, solo ----------

function renderStatus() {
  // the centre hint shows only while the song has no orbs
  document.body.classList.toggle('has-orbs', active.size > 0);
  const key = song ? '' : ` · ${keyText()} (${ot(keyMode())})`;
  ui.status.innerHTML = active.size
    ? `${bpm()} BPM${key}${layers().some(seeded) ? ` · ${ot('variation')} <b>#${variation}</b>` : ''}`
    : playing
      ? ot('quiet')
      : ot('idle');
  renderChips();
  renderRoles();
  renderSeeds();
}

// Above the player: one placeholder per kind of part, lit when the song has one. Nothing has
// to be filled; it just shows what the song could still use. The hovered orb's slot blinks.
const ROLE_IDS = ['tempo', 'kick', 'snare', 'hat', 'perc', 'bass', 'pad', 'arp', 'lead', 'fx', 'texture', 'mood', 'mode'];
const roleSlots = () => ROLE_IDS.map((r) => [r, ot(`slot.${r}`)]);
const roleText = (r) => (ot(`role.${r}`) === `role.${r}` ? r : ot(`role.${r}`));
function renderRoles() {
  const h = hoverOrb();
  const incoming = new Set((h?.combo ? h.combo.map((c) => byId[c]) : h ? [h] : []).map(role));
  ui.roles.innerHTML = '';
  for (const [r, label] of roleSlots()) {
    const ls = layers().filter((l) => role(l) === r);
    const slot = document.createElement('div');
    slot.className = 'role' + (ls.length ? ' on' : '') + (incoming.has(r) ? ' next' : '');
    const dot = document.createElement('i');
    if (ls.length) {
      paint(dot, ls[0]);
      dot.innerHTML = '<i class="swirl"></i>';
      slot.style.setProperty('--g', tint(ls[0]));
    } else if (h) slot.style.setProperty('--g', tint(h));
    const name = document.createElement('span');
    name.textContent = r === 'tempo' && ls.length ? `${bpm()}` : ls.length > 1 ? `${label}×${ls.length}` : label;
    slot.title = ls.length ? ls.map((l) => l.name).join(', ') : `${label} — ${ot('empty')}`;
    slot.append(dot, name);
    ui.roles.append(slot);
  }
}

// The orbs in the song, under the player, grouped like the slots above it ("베이스", "베이스 2").
// Each strip's orb pulses with its own channel. Hover to solo; drag the orb out (to the
// field or the stash, or into the roll to edit its notes); right-click to take it out.
function renderChips() {
  ui.chips.innerHTML = '';
  for (const [r, label] of roleSlots()) {
    layers().filter((l) => role(l) === r).forEach((l, i) => {
      const strip = document.createElement('div');
      // tempo orbs: slowing down shows red, speeding up shows black
      strip.className = 'strip' + (l.bpm ? (l.bpm < BASE_BPM ? ' slow' : ' fast') : '');
      strip.dataset.id = l.id;
      if (!l.bpm) strip.style.setProperty('--g', tint(l));
      const ball = document.createElement('div');
      ball.className = 'mini';
      paint(ball, l);
      ball.innerHTML = '<i class="swirl"></i>';
      const tag = document.createElement('b');
      tag.textContent = r === 'tempo' ? `${label} ${l.bpm}` : r === 'mode' ? `${label} ${keyLabel(l)}` : i ? `${label} ${i + 1}` : label;
      const name = document.createElement('span');
      name.textContent = l.name;
      strip.append(ball, tag, name);
      // its own seed: 🎲 in the corner rolls one, the number (shown only when it differs) goes back
      if (seeded(l)) {
        const dice = document.createElement('button');
        dice.className = 'ghost sdice';
        dice.textContent = '🎲';
        dice.title = ot('ownSeedTip');
        dice.addEventListener('click', (e) => {
          e.stopPropagation();
          setOwnSeed(l.id, 1 + Math.floor(Math.random() * 9999));
        });
        strip.append(dice);
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
      strip.title = `${l.name} — ${ot('stripTip')}`;
      strip.addEventListener('mouseenter', () => setSolo(l.id));
      strip.addEventListener('mouseleave', () => setSolo(null));
      strip.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        removeLayer(l.id);
      });
      ball.addEventListener('pointerdown', (e) => e.button === 0 && grabFromSong(e, l.id));
      ui.chips.append(strip);
    });
  }
}

// one line under the list saying what an orb does
function describe(l, prefix = '') {
  ui.soloHint.style.setProperty('--g', l ? tint(l) : '');
  if (!l) {
    ui.soloHint.textContent = '';
    return;
  }
  const what = l.bpm
    ? ot('tempoWhat', { x: (l.bpm / BASE_BPM).toFixed(2), dir: ot(l.bpm < BASE_BPM ? 'slower' : 'faster') })
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

const tint = (l) => l.glow ?? l.colors?.[0] ?? l.color;
function paint(el, l) {
  el.style.setProperty('--c', l.color ?? l.colors[0]);
  el.style.setProperty('--g', tint(l));
  if (l.colors) {
    el.classList.add('multi');
    el.style.setProperty('--multi', `conic-gradient(${[...l.colors, l.colors[0]].join(', ')})`);
  }
  if (l.dark) el.classList.add('dark');
  if (l.raw) el.classList.add('pen');
  // mood, tempo and key orbs play nothing themselves, they change the rest: drawn with a rim
  // (preset tiles are painted from bare colours, with no cat: they get no rim)
  if (l.cat && !l.code && !l.combo) el.classList.add('nosound');
  if (l.mode === 'major' || l.modeTag === 'major') el.classList.add('major');
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
// coming in from the top so about TARGET are on screen.

const TARGET = 16;
const rain = []; // { id, el, x, y, v }: centre in field coordinates, fall speed in px/s
let lastSpawn = 0;

const fieldSize = () => ({ w: ui.field.clientWidth, h: ui.field.clientHeight });

function makeOrbEl(id) {
  const l = byId[id];
  const el = document.createElement('div');
  el.className = 'orb' + (l.combo ? ' big' : '');
  el.dataset.id = id;
  paint(el, l);
  el.style.setProperty('--dur', (3 + Math.random() * 3).toFixed(2) + 's');
  el.style.setProperty('--delay', (-Math.random() * 5).toFixed(2) + 's');
  el.innerHTML = `<div class="fade"><div class="float"><span class="label">${l.name}</span><div class="ball"><i class="swirl"></i></div><span class="kind">${l.kind}</span></div></div>`;
  const ball = el.querySelector('.ball');
  ball.addEventListener('pointerdown', (e) => grabFromRain(e, el));
  ball.addEventListener('mouseenter', () => hoverOn(el.dataset.id));
  ball.addEventListener('mouseleave', hoverOff);
  return el;
}

function rainAdd(id, x, y, { pop = false, el = makeOrbEl(id) } = {}) {
  el.classList.remove('dragging', 'flying', 'absorb', 'ejected');
  el.classList.toggle('spawn', pop);
  if (pop) setTimeout(() => el.classList.remove('spawn'), 600);
  ui.field.append(el);
  const o = { id, el, x, y, v: 14 + Math.random() * 10 };
  rain.push(o);
  placeRain(o, fieldSize());
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

// Pick a layer to drop in, favouring parts the song doesn't have yet and orbs not already shown.
function pickCandidate() {
  const shown = new Set([...active.keys(), ...rain.map((o) => o.id), ...stash]);
  const activeCats = new Set(layers().map((l) => l.cat));
  let pool = LAYERS.filter((l) => !shown.has(l.id) && !(l.combo && l.combo.every((c) => active.has(c))));
  if (!pool.length) pool = LAYERS.filter((l) => !active.has(l.id));
  if (!pool.length) return null;
  const w = pool.map((l) => (activeCats.has(l.cat) ? 1 : 3) * (l.combo || l.fx || l.mute || l.bpm || l.mode ? 0.25 : 1));
  let x = Math.random() * w.reduce((s, v) => s + v, 0);
  for (let i = 0; i < pool.length; i++) if ((x -= w[i]) < 0) return pool[i].id;
  return pool.at(-1).id;
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
function hoverOn(id) {
  clearTimeout(hoverTimer);
  warm([byId[id]]);
  hoverTimer = setTimeout(async () => {
    if (hover === id) return;
    hover = id;
    if (!started) {
      ui.soloHint.textContent = ot('hoverHint');
      return;
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
  boostTarget = 7;
});
for (const t of ['pointerup', 'pointercancel']) window.addEventListener(t, () => (boostTarget = 1));
ui.field.addEventListener('pointerleave', () => (boostTarget = 1));

// optional background art for the field: an image at public/orbs-field.webp, tiled vertically
const fieldArt = new Image();
fieldArt.onload = () => ui.field.style.setProperty('--field-bg', `url(${fieldArt.src})`);
// relative to the site base: on GitHub Pages the site lives under /<repo>/, so '/orbs-field.webp' would 404
fieldArt.src = `${import.meta.env.BASE_URL}orbs-field.webp`;

function updateRain(dt, now) {
  const size = fieldSize();
  boost += (boostTarget - boost) * Math.min(1, dt * 5);
  ui.field.classList.toggle('rush', boost > 2);
  bgY = (bgY + 10 * boost * dt) % 4096;
  ui.field.style.setProperty('--bg-y', `${bgY.toFixed(1)}px`);
  for (const o of [...rain]) {
    if (o.id !== hover) o.y += o.v * boost * dt;
    if (o.y > size.h + 20) {
      o.el.remove();
      rain.splice(rain.indexOf(o), 1);
    } else placeRain(o, size);
  }
  const every = ((size.h + 80) / 19 / TARGET / boost) * 1000;
  if (rain.length < TARGET && now - lastSpawn > every) {
    lastSpawn = now;
    const id = pickCandidate();
    if (id) rainAdd(id, pickX(size.w), -40);
  }
}

function seedRain() {
  for (const o of [...rain]) vanish(o);
  const { w, h } = fieldSize();
  for (let i = 0; i < TARGET; i++) {
    const id = pickCandidate();
    if (id) rainAdd(id, 60 + Math.random() * Math.max(1, w - 120), (i / TARGET) * h * 0.85 + 10, { pop: true });
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
      b.title = byId[id].name;
      paint(b, byId[id]);
      b.innerHTML = '<i class="swirl"></i>';
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
const overRoll = (x, y) => inRect(ui.roll, x, y);
const overStash = (x, y) => inRect(ui.stash, x, y);

function grabFromRain(e, el) {
  const o = rain.find((q) => q.el === el);
  if (!o) return;
  rain.splice(rain.indexOf(o), 1);
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
  removeLayer(id, { silent: true, respawn: false });
  startDrag(e, makeOrbEl(id), { kind: 'active', home: a.home }, { x: r.left + r.width / 2, y: r.top + r.height / 2 });
}

function grabFromStash(e, i) {
  hoverOff();
  const id = stash.splice(i, 1)[0];
  renderStash();
  startDrag(e, makeOrbEl(id), { kind: 'stash', index: i }, { x: e.clientX, y: e.clientY });
}

// id: the orb being moved, when there is one. The roll only lights up for orbs it can take
// (instruments); mood, tempo and key orbs have nothing to draw and are turned away there.
function highlight(x, y, id = null) {
  const core = x !== null && overCore(x, y);
  const drawable = !id || !!byId[id]?.voice;
  ui.core.classList.toggle('hot', core);
  ui.roll.classList.toggle('hot', drawable && !core && x !== null && overRoll(x, y));
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
    if (Math.hypot(vx, vy) > 450) fling(el, home, x, y, vx, vy);
    else settle(el, home, x, y);
  };
  window.addEventListener('pointermove', move);
  window.addEventListener('pointerup', up);
  window.addEventListener('pointercancel', up);
}

// Drop on whatever is under (x, y). Returns true when the orb was taken care of.
function land(el, home, x, y) {
  if (overCore(x, y)) {
    absorb(el, home);
    return true;
  }
  if (overRoll(x, y)) {
    // the orb moves into the roll and stays there as its instrument
    if (home.kind !== 'roll' && pickInstrument(el.dataset.id, home.kind === 'active' ? home.home : home)) el.remove();
    else goHome(el, home);
    return true;
  }
  if (overStash(x, y)) return storeInStash(el, home);
  return false;
}

// Let go somewhere neutral: inside the field it keeps falling from there, otherwise it goes home.
function settle(el, home, x, y) {
  if (home.kind === 'roll') {
    // let go of the roll's orb anywhere else: it goes back to where it came from
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
  if (home.kind === 'roll') {
    const r = ui.rollSlot.getBoundingClientRect();
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
    if (land(el, home, x, y)) return done();
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
  if (home?.kind === 'roll') ({ id: el.dataset.id, home } = takeFromRoll());
  const id = el.dataset.id;
  const c = coreCenter();
  el.classList.add('flying', 'absorb');
  el.style.left = c.x + 'px';
  el.style.top = c.y + 'px';
  ui.core.style.setProperty('--gulp', tint(byId[id]));
  bump(ui.core, 'gulp');
  addLayer(id, home);
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
let draft = null; // { src: instrument orb id, raw: Array(STEPS) of degree | null }
let erasing = false;
let stroke = null; // { erase, pts: [[x, y]], last: { s, d } }
let drawnCount = 0;
// The orb thrown into the roll stays there as its instrument (the roll grows while it has
// one). Grab it to throw it into the song or the stash, carrying the drawing with it, or let
// go of it in the field to send it back where it came from.
let rollOrb = null; // { id, home, grabbed }

const hasNotes = (raw) => raw.some((d) => d !== null);

function pickInstrument(id, home = null) {
  const l = byId[id];
  if (!l.voice) {
    ui.rollHint.textContent = !l.code && !l.combo
      ? ot('rollWholeSong', { name: l.name })
      : ot('rollNotInstrument', { name: l.name });
    bump(ui.roll, 'reject');
    return false;
  }
  if (rollOrb && rollOrb.id !== id) returnOrb(rollOrb.id, rollOrb.home);
  rollOrb = { id, home };
  // a drawn orb brings its drawing back; any other orb shows the notes it is playing right now
  const own = l.raw ? null : patternToRaw(l);
  if (l.raw) draft = { src: l.src, raw: [...l.raw] };
  else draft = { src: id, raw: own && hasNotes(own) ? own : draft?.raw ?? Array(STEPS).fill(null) };
  draft.edited = false;
  document.body.classList.add('roll-full');
  ui.roll.style.setProperty('--g', tint(byId[draft.src]));
  bump(ui.roll, 'gulp');
  renderRollHead();
  syncSoon();
  return true;
}

// What leaves the roll: the drawing as a drawn orb (a loaded drawn orb gets its line updated),
// or the plain orb when nothing is drawn. A plain orb used for a drawing goes back home.
function takeFromRoll() {
  let { id, home } = rollOrb;
  // only a changed drawing becomes a drawn orb; an untouched orb leaves as itself
  if (hasNotes(draft.raw) && draft.edited) {
    const l = byId[id];
    if (l.raw) l.raw = [...draft.raw];
    else {
      returnOrb(id, home);
      id = makeDrawn(draft.src, draft.raw).id;
      home = null;
    }
  }
  rollOrb = null;
  draft.raw = Array(STEPS).fill(null);
  document.body.classList.remove('roll-full');
  renderRollHead();
  return { id, home };
}

// back where it came from; the line stays drawn for the next instrument
function sendRollOrbHome() {
  const { id, home } = rollOrb;
  rollOrb = null;
  document.body.classList.remove('roll-full');
  returnOrb(id, home);
  renderRollHead();
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
  const held = rollOrb && byId[rollOrb.id];
  const l = rollOrb && byId[draft.src];
  ui.rollSlot.innerHTML = '';
  ui.rollSlot.classList.toggle('filled', !!held && !rollOrb.grabbed);
  if (held && !rollOrb.grabbed) {
    const b = document.createElement('div');
    b.className = 'mini';
    paint(b, held);
    if (hasNotes(draft.raw)) b.classList.add('pen');
    b.innerHTML = '<i class="swirl"></i>';
    b.title = ot('rollGrabTip');
    b.addEventListener('pointerdown', grabFromRoll);
    ui.rollSlot.append(b);
  }
  ui.rollName.innerHTML = l
    ? `<b style="color:${tint(l)}">${held.name}</b><span>${ot(l.voice.root ? 'rollPitched' : 'rollDrum')} · ${ot('rollThrow')}</span>`
    : draft && hasNotes(draft.raw)
      ? ot('rollKept')
      : ot('rollEmpty');
  ui.rollHint.textContent = '';
  ui.rollAdd.disabled = ui.rollStash.disabled = !rollOrb || !!rollOrb.grabbed;
}

// An orb's current notes as a drawing: its pattern (at the current variation) is built without
// playing it and read back over 4 bars. Melodic parts map notes to scale rows (the highest note
// of a chord wins); drums put a hit on each onset, at the height their speed / sample suggests.
function patternToRaw(l) {
  const v = l.voice;
  let pat;
  try {
    const js = transpiler(codeOf(l, seedOf(l)).replaceAll('__DT__', '0.3'), { emitMiniLocations: false, emitWidgets: false }).output;
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
    for (let k = 0; k < len && at + k < STEPS; k++) if (raw[at + k] === null || raw[at + k] < d) raw[at + k] = d;
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

// the roll's buttons do what throwing its orb would
async function finishDraft(where) {
  if (!rollOrb) return;
  if (where === 'stash' && stash.length >= STASH_MAX) {
    bump(ui.stash, 'reject');
    return;
  }
  const { id, home } = takeFromRoll();
  if (where === 'stash') {
    stash.push(id);
    renderStash();
    bump(ui.stash, 'gulp');
    await sync();
  } else {
    ui.core.style.setProperty('--gulp', tint(byId[id]));
    bump(ui.core, 'gulp');
    await addLayer(id, home);
  }
}

function rollGeom() {
  const w = ui.rollCanvas.clientWidth, h = ui.rollCanvas.clientHeight;
  return { w, h, cw: (w - GUTTER) / STEPS, rh: h / ROWS };
}

function applyStroke(e) {
  const r = ui.rollCanvas.getBoundingClientRect();
  const { cw, rh } = rollGeom();
  if (!rh || cw <= 0) return; // roll still opening
  const x = e.clientX - r.left, y = e.clientY - r.top;
  const s = Math.min(STEPS - 1, Math.max(0, Math.floor((x - GUTTER) / cw)));
  const d = Math.min(ROWS - 1, Math.max(0, ROWS - 1 - (y / rh - 0.5)));
  const last = stroke.last ?? { s, d };
  // fill every step the pointer crossed since the last event, interpolating the height
  const n = Math.abs(s - last.s);
  for (let k = 0; k <= n; k++) {
    const t = n ? k / n : 1;
    draft.raw[last.s + Math.sign(s - last.s) * k] = stroke.erase ? null : Math.round(last.d + (d - last.d) * t);
  }
  stroke.last = { s, d };
  if (!stroke.erase) stroke.pts.push([x, y]);
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
  stroke = { erase: erasing || e.button === 2 || e.shiftKey, pts: [], last: null };
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

ui.rollAdd.addEventListener('click', () => finishDraft('song'));
ui.rollStash.addEventListener('click', () => finishDraft('stash'));
$('rollClear').addEventListener('click', () => {
  if (!draft) return;
  draft.raw.fill(null);
  draft.edited = true;
  renderRollHead();
  sync();
});
ui.rollErase.addEventListener('click', () => {
  erasing = !erasing;
  ui.rollErase.classList.toggle('on', erasing);
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
  for (const [width, blur, col, a] of [[9, 26, color, 0.35], [4, 12, color, 0.9], [1.5, 0, '#fff', 0.9]]) {
    g.beginPath();
    pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)));
    g.lineWidth = width;
    g.shadowBlur = blur;
    g.shadowColor = color;
    g.strokeStyle = col;
    g.globalAlpha = alpha * a;
    g.stroke();
  }
  g.restore();
}

const rg = ui.rollCanvas.getContext('2d');
function drawRoll() {
  const dpr = window.devicePixelRatio || 1;
  const { w, h, cw, rh } = rollGeom();
  if (w < 10 || h < 10) return;
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

  // rows: the root (A) gets a brighter stripe
  g.font = '10px ui-monospace, Consolas, monospace';
  g.textBaseline = 'middle';
  for (let d = 0; d < ROWS; d++) {
    const y = (ROWS - 1 - d) * rh;
    g.fillStyle = d % 7 === 0 ? 'rgba(57,255,156,.07)' : d % 2 ? 'rgba(255,255,255,.015)' : 'rgba(255,255,255,.035)';
    g.fillRect(GUTTER, y, w - GUTTER, rh);
    g.fillStyle = d % 7 === 0 ? '#39ff9c' : '#4a5a52';
    const label = !v || v.root ? rowName(v, d) : d === ROWS - 1 ? 'hi' : d === 0 ? 'lo' : '·';
    g.fillText(label, 6, y + rh / 2);
  }
  // columns: steps, beats, bars
  for (let i = 0; i <= STEPS; i++) {
    g.fillStyle = i % 16 === 0 ? 'rgba(57,255,156,.35)' : i % 4 === 0 ? 'rgba(255,255,255,.1)' : 'rgba(255,255,255,.03)';
    g.fillRect(GUTTER + i * cw, 0, 1, h);
  }

  const pos = playing && repl ? (nowCycle() % BARS) / BARS : -1;
  const playStep = pos >= 0 ? Math.floor(pos * STEPS) : -1;
  if (draft) {
    const color = tint(s);
    // what you drew, faint
    g.save();
    g.globalAlpha = 0.35;
    g.strokeStyle = '#ffffff';
    g.setLineDash([2, 4]);
    g.beginPath();
    let pen = false;
    draft.raw.forEach((d, i) => {
      if (d === null) return (pen = false);
      const p = [GUTTER + (i + 0.5) * cw, yOf(d)];
      pen ? g.lineTo(...p) : g.moveTo(...p);
      pen = true;
    });
    g.stroke();
    g.restore();
    // what will play: MIDI blocks + a neon line through them
    const q = quantize(draft.raw, v);
    g.fillStyle = color;
    g.globalAlpha = 0.18;
    q.forEach((n, i) => n && g.fillRect(GUTTER + i * cw + 0.5, (ROWS - 1 - n.d) * rh + 1, cw - 1, rh - 2));
    g.globalAlpha = 1;
    let run = [];
    const flush = () => {
      if (run.length === 1) run = [[run[0][0] - cw * 0.35, run[0][1]], [run[0][0] + cw * 0.35, run[0][1]]];
      neon(g, run, color, 1);
      run = [];
    };
    q.forEach((n, i) => (n ? run.push([GUTTER + (i + 0.5) * cw, yOf(n.d)]) : flush()));
    flush();
    const n = q[playStep];
    if (n) {
      g.save();
      g.shadowBlur = 30;
      g.shadowColor = color;
      g.fillStyle = '#fff';
      g.beginPath();
      g.arc(GUTTER + (playStep + 0.5) * cw, yOf(n.d), 5, 0, Math.PI * 2);
      g.fill();
      g.restore();
    }
  }
  if (stroke?.pts.length > 1) neon(g, stroke.pts, '#ffffff', 0.5);
  if (pos >= 0) {
    g.fillStyle = 'rgba(255,255,255,.55)';
    g.fillRect(GUTTER + pos * (w - GUTTER), 0, 1.5, h);
  }
}

// ---------- variation ----------

// Every press keeps the seed it replaces at the front of a short list, so an earlier variation can
// be brought back. Up to 16 are kept; starred ones (the ☆ next to 변주) are never dropped.
const SEED_KEY = 'orbSeeds', SEED_MAX = 16;
let seeds = []; // [{ v, fav }], newest first
try {
  seeds = JSON.parse(localStorage.getItem(SEED_KEY)) ?? [];
} catch {}
const saveSeeds = () => {
  try {
    localStorage.setItem(SEED_KEY, JSON.stringify(seeds));
  } catch {}
};
function keepSeed(v) {
  if (seeds.some((x) => x.v === v)) return;
  seeds.unshift({ v, fav: false });
  while (seeds.length > SEED_MAX) {
    const i = seeds.findLastIndex((x) => !x.fav);
    if (i < 0) break;
    seeds.splice(i, 1);
  }
  saveSeeds();
}
function setVariation(v) {
  if (v === variation) return;
  keepSeed(variation);
  variation = v;
  bump(ui.core, 'gulp');
  sync();
}
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
function renderSeeds() {
  const fav = seeds.find((x) => x.v === variation)?.fav;
  ui.favSeed.textContent = fav ? '★' : '☆';
  ui.favSeed.classList.toggle('on', !!fav);
  ui.seeds.innerHTML = '';
  for (const x of seeds) {
    const b = document.createElement('button');
    b.className = 'seed' + (x.fav ? ' fav' : '') + (x.v === variation ? ' now' : '');
    b.textContent = `${x.fav ? '★' : ''}#${x.v}`;
    b.title = ot(x.fav ? 'backToSeed' : 'backToSeedDel');
    b.addEventListener('click', () => setVariation(x.v));
    b.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      if (x.fav) return;
      seeds = seeds.filter((y) => y !== x);
      saveSeeds();
      renderSeeds();
    });
    ui.seeds.append(b);
  }
}
$('variate').addEventListener('click', () => setVariation(1 + Math.floor(Math.random() * 9999)));
ui.favSeed.addEventListener('click', () => {
  let x = seeds.find((y) => y.v === variation);
  if (!x) seeds.unshift((x = { v: variation, fav: false }));
  x.fav = !x.fav;
  saveSeeds();
  renderSeeds();
});

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
let sharedLoading = null;
let sharedLast = null; // the last list the server sent, re-drawn when the language changes
function renderShared() {
  if (!sharedLast) return;
  sharedList.innerHTML = sharedLast.length ? '' : `<p class="empty">${ot('sharedEmpty')}</p>`;
  for (const p of sharedLast) sharedList.append(presetTile(p, false));
}
function refreshShared() {
  if (!sharedList.children.length) sharedList.innerHTML = `<p class="empty">${ot('loading')}</p>`;
  // well-liked and recent presets tend to come first, and to make the cut of 100
  sharedLoading ??= fetchPresets({ limit: 500 })
    .then((list) => {
      setServerUp(true);
      sharedLast = weightedOrder(list).slice(0, 100);
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
  };
  if (withSong && song?.sections) {
    syncRows();
    p.song = songToWire(song);
  }
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

// 👍 / 👎 beside the play button for the shared preset last loaded (hidden for other sets)
const setVote = mountVote($('vote'));

async function applyPreset(p) {
  setVote(p);
  for (const id of [...active.keys()]) removeLayer(id, { silent: true, respawn: false });
  // drawn parts are rebuilt under fresh ids so they never clash with drawings made since
  const ids = new Map((p.drawn ?? []).map((d) => [d.id, makeDrawn(d.src, d.raw).id]));
  // the variation it replaces goes into the history, as with 🎲 변주
  if (p.variation && p.variation !== variation) {
    keepSeed(variation);
    variation = p.variation;
  }
  for (const [id, v] of Object.entries(p.seeds ?? {})) if (Number.isSafeInteger(v) && v >= 0) ownSeed.set(ids.get(id) ?? id, v);
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
    song = { seed: hash(String(p.id)), s0: at, ...grid, audition: null, once: false };
    stemSig = '';
    openSong();
  }
  await sync();
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
function saveSession() {
  clearTimeout(sessionTimer);
  if (!sessionReady || offline) return;
  const ids = new Set([...active.keys(), ...stash, ...(rollOrb ? [rollOrb.id] : [])]);
  const drawn = [...ids].map((id) => byId[id]).filter((l) => l?.raw).map((l) => ({ id: l.id, src: l.src, raw: l.raw }));
  const data = {
    layers: [...active.keys()],
    drawn,
    stash: [...stash],
    variation,
    seeds: ownSeeds(),
    name: ui.presetName.value,
    roll: rollOrb && draft ? { id: rollOrb.id, home: rollOrb.home ?? null, src: draft.src, raw: draft.raw, edited: !!draft.edited } : null,
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
    if (+s.variation) variation = +s.variation;
    for (const id of s.stash ?? []) if (byId[id] && stash.length < STASH_MAX) stash.push(id);
    for (const id of s.layers ?? []) if (byId[id]) put(byId[id], 0);
    for (const [id, v] of Object.entries(s.seeds ?? {})) if (active.has(id) && Number.isSafeInteger(v)) ownSeed.set(id, v);
    if (typeof s.name === 'string') ui.presetName.value = s.name;
    if (s.roll || active.size >= ROLL_AFTER) revealRoll({ animate: false });
    if (s.roll && byId[s.roll.id] && pickInstrument(s.roll.id, s.roll.home)) {
      if (byId[s.roll.src] && Array.isArray(s.roll.raw)) draft = { src: s.roll.src, raw: [...s.roll.raw], edited: !!s.roll.edited };
      renderRollHead();
    }
  } catch (e) {
    console.error('could not restore the last session', e);
  } finally {
    sessionReady = true;
  }
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
  const data = { n: p.name, l: p.layers, d: (p.drawn ?? []).map((d) => [d.id, d.src, packRaw(d.raw)]), v: p.variation ?? 0, ...(p.seeds ? { vs: p.seeds } : {}), ...(p.song ? { s: p.song } : {}) };
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
    return { id, name: String(d.n ?? ot('importedPreset')).slice(0, 24), layers, drawn, variation: +d.v || 0, ...seeds, ...song };
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
    description: shDesc.value,
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

// the code as it would play from cycle 0, without anything only the live page hears
function renderCode() {
  offline = true;
  const s0 = song?.s0;
  if (song) song.s0 = 0;
  try {
    const code = buildCode();
    const cycles = song ? songPlanCache.reduce((s, x) => s + x.len, 0) : LOOP_BARS;
    return { code, cycles, tempo: bpm() };
  } finally {
    offline = false;
    if (song) {
      song.s0 = s0;
      ui.code.textContent = buildCode(); // put the live code (and song bar) back
    }
  }
}

const wavBtn = $('wavBtn');
wavBtn.addEventListener('click', async () => {
  if (renderingWav) return;
  if (!layers().some((l) => l.code)) {
    ui.soloHint.textContent = ot('noSound');
    return;
  }
  const { code, cycles, tempo } = renderCode();

  renderingWav = true;
  wavBtn.disabled = true;
  wavBtn.textContent = ot('rendering', { p: 0 });
  try {
    await renderer();
    const id = ++renderJob;
    const wav = await new Promise((resolve, reject) => {
      renderJobs.set(id, { resolve, reject, progress: (p) => (wavBtn.textContent = ot('rendering', { p: Math.round(p * 100) })) });
      renderFrame.contentWindow.postMessage({ type: 'render', id, code, start: 0, end: cycles, cps: tempo / 4 / 60 }, location.origin);
    });
    const name = (ui.presetName.value.trim() || layers().find((l) => l.code)?.name || 'orb').replace(/[\\/:*?"<>|]/g, '');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([wav], { type: 'audio/wav' }));
    a.download = `ORBRAVE - ${name} ${tempo}bpm${song ? ' (full)' : ''}.wav`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 10000);
  } catch (e) {
    console.error('render failed', e);
    ui.soloHint.textContent = ot('wavFail');
  } finally {
    renderingWav = false;
    wavBtn.disabled = false;
    wavBtn.textContent = ot('wav');
  }
});

// ---------- full song ----------
// The current set becomes the centre of a whole track: an intro and build-up lead into it,
// then a break and a second drop in a new key (with a different variation and one or two
// parts swapped for a sibling), and an outro back home.

function songPlan() {
  const r = rng(song.seed);
  const base = layers().filter((l) => l.code);
  const swaps = new Map();
  for (const l of r.shuffle(base.filter((x) => !x.raw))) {
    if (swaps.size >= 2) break;
    const alts = LAYERS.filter((x) => x.cat === l.cat && x.code && !active.has(x.id));
    if (alts.length && r.chance(0.7)) swaps.set(l.id, r.pick(alts));
  }
  const swapped = base.map((l) => swaps.get(l.id) ?? l);
  const up = r.pick([2, 3, 5, -2]);
  const R = role;
  const plan = [
    { name: '인트로', len: r.pick([8, 16]), from: base, keep: (l) => !l.drum && !['bass', 'lead'].includes(R(l)) },
    { name: '빌드업', len: 8, from: base, keep: (l) => R(l) !== 'kick' && R(l) !== 'lead' },
    { name: '드롭', len: 16, from: base, keep: () => true },
    { name: '브레이크', len: 8, from: swapped, keep: (l) => !l.drum && R(l) !== 'bass', shift: up, v: 1 },
    { name: '드롭 2', len: 16, from: swapped, keep: () => true, shift: up, v: 1 },
  ];
  if (r.chance(0.5)) plan.push({ name: '브리지', len: 8, from: swapped, keep: (l) => l.drum || ['bass', 'texture'].includes(R(l)), shift: up, v: 2 });
  plan.push({ name: '아웃트로', len: 8, from: base, keep: (l) => l.drum || ['pad', 'texture'].includes(R(l)) });
  return plan.map((s) => {
    const kept = s.from.filter(s.keep);
    return { ...s, shift: s.shift ?? 0, v: s.v ?? 0, layers: kept.length ? kept : s.from };
  });
}

// The plan becomes an editable grid: a row per instrument, a column per 4-bar block (grouped
// into sections), and in every block whether the instrument plays there and with which seed.
// The stem panel shows it; the song is built from it. Leads get a new seed every block; the
// other parts keep one seed per section. Orbs without a seed carry none (v: null), and drawn
// (user-edited) rows are labelled CU01, CU02 … instead.
const BLOCK = 4;
const isLead = (l) => role(l) === 'lead';
const newSeed = () => 1 + Math.floor(Math.random() * 9999);
// the seed of block `g` (counted through the whole song for a lead) from a section's base seed
const blockSeed = (l, base, g) => (!seeded(l) ? null : isLead(l) ? base + g : base);
function cellsFor(l, on) {
  let g = 0;
  return song.sections.map((sec, i) => Array.from({ length: sec.len / BLOCK }, () => ({ on: on(sec, i), v: blockSeed(l, seedOf(l) + (sec.v ?? 0) * 100, g++) })));
}
function buildGrid() {
  const plan = songPlan();
  const rows = [];
  for (const sec of plan) for (const l of sec.layers) if (!rows.includes(l.id)) rows.push(l.id);
  song.sections = plan.map(({ name, len, shift, v }) => ({ name, len, shift, v }));
  song.rows = rows.map((id) => ({ id, alt: !active.has(id) }));
  song.cells = Object.fromEntries(rows.map((id) => [id, cellsFor(byId[id], (sec, i) => plan[i].layers.some((l) => l.id === id))]));
  song.audition = null;
  song.once = false;
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
  // clicking a section name loops just that section; 끝까지 재생 plays the song once
  const aud = !offline && song.audition != null ? song.audition : null;
  const once = aud === null && song.once && !offline ? ', 1' : '';
  const out = [];
  for (const r of song.rows) {
    const l = byId[r.id];
    if (!l) continue;
    let o = 0;
    secs.forEach((sec, i) => {
      const blocks = song.cells[r.id][i], base = aud === null ? o : 0;
      o += sec.len;
      if (aud !== null && aud !== i) return;
      // neighbouring blocks with the same seed play as one line
      for (let j = 0, k; j < blocks.length; j = k) {
        for (k = j + 1; k < blocks.length && blocks[k].on === blocks[j].on && blocks[k].v === blocks[j].v; k++);
        if (!blocks[j].on) continue;
        // same test as the key orbs use, so fx / texture orbs that play notes move with the section too
        const v = blocks[j].v ?? 0;
        const line = lineFor(l, v, sec.shift && pitchedCode(l, codeOf(l, v)) ? `.transpose(${sec.shift})` : '');
        if (line) out.push(`${line}\n  .songPart(${song.s0}, ${aud === null ? total : sec.len}, ${base + j * BLOCK}, ${base + k * BLOCK}${once})`);
      }
    });
  }
  renderSong();
  return out;
}

const keyName = (shift) => keyText(shift);
const miniOrb = (l) => {
  const b = document.createElement('div');
  b.className = 'mini';
  paint(b, l);
  b.innerHTML = '<i class="swirl"></i>';
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
  const secs = song.sections;
  // the small timeline under the player
  const sig = JSON.stringify([secs, song.rows, song.cells, song.audition, keyText(), ot('corner')]);
  if (sig === stemSig) return;
  stemSig = sig;
  ui.songBar.innerHTML = '';
  for (const sec of secs) {
    const b = document.createElement('div');
    b.className = 'sec' + (sec.shift ? ' mod' : '');
    b.style.flex = sec.len;
    b.textContent = sec.shift ? `${secName(sec.name)} · ${keyName(sec.shift)}` : secName(sec.name);
    ui.songBar.append(b);
  }
  const cur = document.createElement('i');
  cur.className = 'song-cursor';
  ui.songBar.append(cur);
  renderStem();
}

// a section grows or shrinks by one 4-bar block at its end
function resizeSection(i, d) {
  const sec = song.sections[i], n = sec.len / BLOCK + d;
  if (n < 1 || n > 16) return;
  sec.len = n * BLOCK;
  for (const r of song.rows) {
    const blocks = song.cells[r.id][i], last = blocks.at(-1);
    if (d < 0) blocks.pop();
    else blocks.push({ on: last.on, v: last.v == null ? null : isLead(byId[r.id]) ? newSeed() : last.v });
  }
  sync();
}

function renderStem() {
  const secs = song.sections, grid = ui.stemGrid;
  grid.innerHTML = '';
  const nBlocks = secs.reduce((sum, x) => sum + x.len / BLOCK, 0);
  grid.style.gridTemplateColumns = `170px repeat(${nBlocks}, minmax(74px, 1fr))`;
  const corner = document.createElement('div');
  corner.className = 'corner';
  corner.textContent = ot('corner');
  grid.append(corner);
  secs.forEach((sec, i) => {
    const h = document.createElement('div');
    h.className = 'sh' + (song.audition === i ? ' aud' : '') + (sec.shift ? ' mod' : '');
    h.style.gridColumn = `span ${sec.len / BLOCK}`;
    const bars = document.createElement('small');
    bars.className = 'bars';
    bars.textContent = ot('bars', { n: sec.len });
    h.append(
      button('ghost sname', sec.shift ? `${secName(sec.name)} · ${keyName(sec.shift)}` : secName(sec.name), ot('secTip'), () => {
        song.audition = song.audition === i ? null : i;
        song.once = false;
        onceLabel();
        sync();
      }),
      bars,
      button('ghost len', '−', ot('secShorter'), () => resizeSection(i, -1)),
      button('ghost len', '+', ot('secLonger'), () => resizeSection(i, 1)),
      button('ghost batch', '↓#', ot('secSeeds'), (e) => askSeed(e.currentTarget, variation, (v) => {
        for (const r of song.rows) song.cells[r.id][i].forEach((b, j) => b.v != null && (b.v = isLead(byId[r.id]) ? v + j : v));
        sync();
      })),
    );
    grid.append(h);
  });
  let cu = 0;
  for (const r of song.rows) {
    const l = byId[r.id];
    if (!l) continue;
    const custom = l.raw ? `CU${String(++cu).padStart(2, '0')}` : null;
    const head = document.createElement('div');
    head.className = 'rh' + (r.alt ? ' alt' : '');
    head.style.setProperty('--g', tint(l));
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
      c.style.setProperty('--g', tint(l));
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
          sync();
        });
        c.append(tagEl, x);
      }
      c.addEventListener('click', () => {
        cell.on = !cell.on;
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

function onceLabel() {
  const b = $('stemOnce');
  if (!b) return;
  const on = !!song?.once && playing;
  b.textContent = ot(on ? 'onceOn' : 'once');
  b.classList.toggle('on', on);
}
$('stemOnce')?.addEventListener('click', async () => {
  if (!song) return;
  if (song.once && playing) {
    stop();
    return;
  }
  song.audition = null;
  song.once = true;
  if (!playing) await play(); // starts from cycle 0 with s0 = 0
  else {
    song.s0 = nextBar();
    await sync();
  }
  onceLabel();
});

function openSong() {
  document.body.classList.add('stem-open');
  ui.song.classList.add('on');
  ui.songBtn.textContent = ot('otherSong');
  updateShareButtons();
}
function closeSong() {
  song = null;
  onceLabel();
  songPlanCache = null;
  stemSig = '';
  document.body.classList.remove('stem-open');
  ui.song.classList.remove('on');
  ui.songBtn.textContent = ot('makeSong');
  updateShareButtons();
  for (const a of active.values()) a.at = 0;
  sync();
}

ui.songBtn.addEventListener('click', async () => {
  if (!layers().some((l) => l.code)) {
    ui.soloHint.textContent = ot('addOrbsFirst');
    return;
  }
  const was = playing;
  if (!playing) await play();
  song = { seed: Math.floor(Math.random() * 1e9), s0: was ? nextBar() : 0 };
  buildGrid();
  stemSig = '';
  openSong();
  await sync();
});
$('songOff').addEventListener('click', closeSong);
$('stemClose').addEventListener('click', closeSong);

// where the song is now: the section and how far into it (a looped section counts on its own)
function songPosition() {
  const secs = song.sections, total = secs.reduce((sum, x) => sum + x.len, 0);
  const t = nowCycle();
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
  if (!song?.sections || !playing) return;
  if (song.once && song.audition == null && nowCycle() >= song.s0 + song.sections.reduce((sum, x) => sum + x.len, 0)) {
    stop();
    return;
  }
  const { idx, frac, total } = songPosition();
  const secs = song.sections;
  [...ui.songBar.querySelectorAll('.sec')].forEach((b, i) => b.classList.toggle('now', i === idx));
  const cur = ui.songBar.querySelector('.song-cursor');
  const before = secs.slice(0, Math.max(0, idx)).reduce((sum, x) => sum + x.len, 0);
  if (cur) cur.style.left = `${idx < 0 ? 0 : ((before + frac * secs[idx].len) / total) * 100}%`;
  const heads = ui.stemGrid.querySelectorAll('.sh');
  heads.forEach((h, i) => h.classList.toggle('now', i === idx));
  const sc = $('stemCursor'), body = $('stemBody');
  if (heads[idx]) {
    const hr = heads[idx].getBoundingClientRect(), br = body.getBoundingClientRect();
    sc.style.display = '';
    sc.style.left = `${hr.left - br.left + body.scrollLeft + frac * hr.width}px`;
  } else sc.style.display = 'none';
}

// ---------- visuals: waveform ring + atom orbits ----------

const canvas = $('viz');
const g = canvas.getContext('2d');
let buf;
let lastTs = performance.now();
function frame(ts) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.1, (ts - lastTs) / 1000);
  lastTs = ts;
  const dpr = window.devicePixelRatio || 1;
  const w = innerWidth, h = innerHeight;
  // rounded: at 125% / 150% scaling w * dpr is fractional and would never match, resizing every frame
  if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
  }
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  g.clearRect(0, 0, w, h);

  const c = coreCenter();
  let level = 0;
  if (analyser && playing) {
    buf ??= new Float32Array(analyser.fftSize);
    analyser.getFloatTimeDomainData(buf);
    for (const v of buf) level = Math.max(level, Math.abs(v));
    const colors = layers().flatMap((l) => l.colors ?? [tint(l)]);
    const grad = g.createConicGradient(ts / 3000, c.x, c.y);
    (colors.length ? colors : ['#39ff9c']).concat(colors[0] ?? '#39ff9c').forEach((col, i, arr) => grad.addColorStop(i / (arr.length - 1), col));
    g.strokeStyle = grad;
    g.lineWidth = 2;
    g.shadowBlur = 18;
    g.shadowColor = colors[0] ?? '#39ff9c';
    g.beginPath();
    const n = 256, step = Math.floor(buf.length / n);
    for (let i = 0; i <= n; i++) {
      const a = (i / n) * Math.PI * 2;
      const r = c.rad - 10 + buf[(i % n) * step] * 70;
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
  const m = mood();
  sats.forEach((a, i) => {
    const tilt = (i / sats.length) * Math.PI + 0.35;
    const rx = cr.width / 2 + 26 + (i % 3) * 12 + level * 10, ry = rx * 0.32;
    const dir = i % 2 ? -1 : 1;
    const ang = (dir * ts) / (900 + (i % 4) * 260) + i * 1.7;
    const lx = Math.cos(ang) * rx, ly = Math.sin(ang) * ry;
    const x = lx * Math.cos(tilt) - ly * Math.sin(tilt), y = lx * Math.sin(tilt) + ly * Math.cos(tilt);
    const depth = Math.sin(ang);
    const soloed = solo === a.layer.id;
    const dim = (playing && now < a.at) || muted(a.layer) || (solo && !soloed);
    a.sat.style.transform = `translate(${x}px, ${y}px) scale(${(0.8 + depth * 0.25) * (soloed ? 1.5 : 1)})`;
    a.sat.style.zIndex = depth > 0 ? 3 : 1;
    a.sat.style.opacity = dim ? 0.3 : 0.7 + depth * 0.3;
    g.save();
    g.strokeStyle = tint(a.layer);
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
  const sounding = layers().filter((l) => l.code && !muted(l));
  if (!sounding.length) return;
  const inner = cr.width / 2 + 40;
  const span = (Math.PI * 2) / sounding.length;
  sounding.forEach((l, i) => {
    const bands = bandsOf(l.id);
    const col = tint(l);
    const dim = solo && solo !== l.id ? 0.25 : 1;
    // the arc of bars around the player
    g.save();
    g.strokeStyle = col;
    g.shadowColor = col;
    g.shadowBlur = 10;
    g.lineCap = 'round';
    g.lineWidth = Math.max(2, ((span * inner) / EQ_BANDS) * 0.45);
    bands.forEach((v, b) => {
      const a = ts / 9000 + i * span + ((b + 0.5) / EQ_BANDS) * span * 0.86;
      const len = 3 + v * 46;
      g.globalAlpha = (0.35 + v * 0.65) * dim;
      g.beginPath();
      g.moveTo(c.x + Math.cos(a) * inner, c.y + Math.sin(a) * inner);
      g.lineTo(c.x + Math.cos(a) * (inner + len), c.y + Math.sin(a) * (inner + len));
      g.stroke();
    });
    g.restore();
    // the strip's orb swells with the channel
    const ball = ui.chips.querySelector(`.strip[data-id="${CSS.escape(l.id)}"] .mini`);
    if (!ball) return;
    const now = Math.max(...bands);
    const prev = pulse.get(l.id) ?? 0;
    const lvl = now > prev ? prev + (now - prev) * 0.6 : prev * 0.88;
    pulse.set(l.id, lvl);
    ball.style.transform = `scale(${(1 + lvl * 0.45).toFixed(3)})`;
    ball.style.boxShadow = `0 0 ${(8 + lvl * 26).toFixed(1)}px ${col}`;
  });
}

// ---------- toolbar ----------

$('shuffle').addEventListener('click', seedRain);

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
const orbText = (l) => [l.name, l.kind, l.cat, partText(l), ...(l.combo ?? []).map((c) => `${byId[c].name} ${byId[c].kind} ${partText(byId[c])}`)].join(' ').toLowerCase();
function matchesTerm(l, term) {
  if (/^(bpm|tempo|템포|テンポ)$/.test(term)) return !!l.bpm;
  // a number finds tempos near it, and also drum machines by name (808, 909 …)
  if (/^\d+$/.test(term)) return (!!l.bpm && Math.abs(l.bpm - +term) <= 6) || orbText(l).includes(term);
  for (const [mode, words] of Object.entries(MODE_WORDS)) if (words.includes(term)) return keyOf(l)?.mode === mode;
  const k = parseKey(term);
  if (k) return !!keyOf(l) && (keyOf(l).key + 12) % 12 === k.tonic && keyOf(l).mode === k.mode;
  return orbText(l).includes(term);
}
const searchOrbs = (q) => {
  const terms = q.toLowerCase().split(/[\s/,]+/).filter(Boolean);
  return terms.length ? LAYERS.filter((l) => terms.every((t) => matchesTerm(l, t))).slice(0, 48) : [];
};
function renderSearch() {
  const q = ui.searchInput.value;
  const found = searchOrbs(q);
  ui.searchResults.innerHTML = found.length ? '' : `<p class="empty">${ot(q.trim() ? 'noMatch' : 'searchEx')}</p>`;
  for (const l of found) {
    const item = document.createElement('div');
    item.className = 'hit' + (active.has(l.id) ? ' on' : '');
    item.style.setProperty('--g', tint(l));
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
    renderSearch();
    ui.searchInput.focus();
    ui.searchInput.select();
  }
});
ui.searchInput.addEventListener('input', renderSearch);
ui.searchInput.addEventListener('keydown', (e) => e.key === 'Escape' && $('searchBtn').click());
$('clear').addEventListener('click', () => {
  setVote(null);
  for (const id of [...active.keys()]) removeLayer(id, { silent: true, respawn: false });
  sync();
});
$('codeToggle').addEventListener('click', () => ui.drawer.classList.toggle('open'));
$('codeClose').addEventListener('click', () => ui.drawer.classList.remove('open'));

// Text built in script, redrawn when KR / EN / JP is switched (static text is handled by orbsI18n.js).
function applyLangUI() {
  ui.songBtn.textContent = ot(song?.sections ? 'otherSong' : 'makeSong');
  const sb = $('serverShareBtn');
  sb.textContent = ot(serverUp === false ? 'serverDown' : 'serverShare');
  sb.title = ot(serverUp === false ? 'serverDownTip' : 'serverShareTip');
  volRing.setAttribute('aria-label', ot('volume'));
  if (!renderingWav) wavBtn.textContent = ot('wav');
  onceLabel();
}
mountLicenses($('licenseBtn'));
$('feedbackBtn').addEventListener('click', () => window.open('https://forms.gle/gvjXSkEM7W6ug6US9', '_blank', 'noopener'));
mountLangButtons($('langs'), () => {
  applyLangUI();
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

restoreSession();
renderStash();
renderPresets();
refreshShared();
renderRollHead();
renderStatus();
ui.code.textContent = buildCode();
requestAnimationFrame(() => {
  seedRain();
  requestAnimationFrame(frame);
});
if (import.meta.env.DEV) window.__orbs = { replReady, codeOf, active, rain, stash, byId, addLayer, removeLayer, buildCode, pickInstrument, finishDraft, get draft() { return draft; }, get song() { return song; }, get variation() { return variation; }, patternToRaw, keyMode, LAYERS };
