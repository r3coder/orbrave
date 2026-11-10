// The field: falling orbs (the rain), what falls next, and the stash on the right.
// Split out of orbs.js; the files load in a chain (each imports the one before it first), so they run in the
// same order as the one file did. See orbs/state.js.
import { SOUND_FIRST, describe, noSound, orbInner, paint, renderRoles } from './list.js';
import { isBooted } from '../samples.js';
import { vocalsOn } from '../vocals.js';
import { LAYERS, CAT_SHARE, byId } from '../orbCatalog.js';
import { ot } from '../orbsI18n.js';
import { isPhone } from '../phoneLayout.js';
import * as taste from '../orbTaste.js';
import {
  FIRST_CATS, S, active, forget, gainPct, heldSeed, orbVars, ownSeed, stepGain, ui, varNum, volStep,
} from './state.js';
import { audioUnlocked, ensureStarted, layers, play, stop, syncSoon, warm } from './audio.js';
import { comboHeld, dropCombo, explainCombo, firstOrbDone, hoverCombo } from './guide.js';
import { bump, grabFromRain, grabFromStash } from './drag.js';
import { serverFell } from './customOrbs.js';
import { freshOrb, rootOf } from './slots.js';
import { saveSessionSoon } from './presets.js';

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
  const o = rain.filter((r) => r.id !== S.hover && !r.hold && r !== S.comboOrb).sort((a, b) => b.y - a.y)[0];
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
  const n = volStep(id), seed = heldSeed.get(id) ?? ownSeed.get(id), vs = orbVars.get(id);
  const what = byId[id]?.cat === 'mood' ? `${ot('slotFxWhat')} ${n > 0 ? '+' : ''}${n}` : `${ot('slotGainWhat')} ${gainPct(stepGain(n))}%`;
  return (n ? ` · ${what}` : '') + (vs ? ` · ${ot('slotVary')} ${varNum(vs.vi)}` : seed != null ? ` · #${seed}` : '');
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
  ball.addEventListener('mouseenter', () => {
    // a held or flying orb is moved into the body, which counts as the mouse entering it again:
    // the drag auditions it by itself, and once it has landed nothing would take the preview down
    if (el.classList.contains('dragging')) return;
    hoverOn(el.dataset.id, 'field');
    hoverCombo(el.dataset.id, ball);
  });
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
// the sampled instruments, other scales, line variations, concert percussion, the chip / ambient / world batch and the sound edits), ?only=fx, ?only=dub, ?only=inst, ?only=scale, ?only=var, ?only=ac, ?only=vibe or ?only=edit one of those sets, ?only=id1,id2 just those orbs. Every other orb can
// still be found with the search.
const ONLY = import.meta.env.DEV ? new URLSearchParams(location.search).get('only') : null;
const ONLY_SETS = { new: (l) => l.spot || !!l.tag, fx: (l) => l.spot, dub: (l) => l.tag === 'dubtechno', inst: (l) => l.tag === 'instruments', scale: (l) => l.tag === 'scales', var: (l) => l.tag === 'variations', ac: (l) => l.tag === 'acoustic', vibe: (l) => l.tag === 'vibes', edit: (l) => l.tag === 'edits' };
const onlyIds = ONLY && new Set(ONLY_SETS[ONLY] ? LAYERS.filter(ONLY_SETS[ONLY]).map((l) => l.id) : ONLY.split(','));

// The opening rain: until an orb goes into the song (put), only orbs that play at once fall, i.e.
// every sound is a synth or a drum hit decoded on the boot screen (samples.js). VCSL, piano,
// the sampled basses and the like load on first use, so they wait. Nothing falls before boot ends.
S.opening = true;
S.bootDone = false;
const instant = (l) => (l.combo ? l.combo.map((c) => byId[c]) : [l]).every((x) => x && (x.samples ?? []).every(isBooted));
// Pick a layer to drop in, favouring parts the song doesn't have yet and orbs not already shown.
// Uploaded custom orbs (✦ 커스텀 오브 > 서버) come SERVER_BATCH at a time and fall now and then
// (SERVER_RAIN of the drops), one by one in the panel's order; only while a full batch is in, so a
// server with fewer has none in the rain. When the last one of a batch has fallen, a new batch
// is fetched (refreshSharedOrbs). Custom orbs made here never fall.
const SERVER_BATCH = 10, SERVER_RAIN = 0.015;
S.serverOrbs = []; // [{ id, at, by }]: the definition's id, uploaded at, by
S.serverNext = 0; // the next of serverOrbs to fall
// The song, the stash and the slots don't hold an orb back (a second one falls as a copy, freshOrb);
// only one of each falls at a time.
function pickCandidate() {
  const shown = new Set(rain.map((o) => rootOf(o.id)));
  const activeCats = new Set(layers().map((l) => l.cat));
  const early = active.size < SOUND_FIRST;
  const from = onlyIds ? LAYERS.filter((l) => onlyIds.has(l.id)) : LAYERS;
  // before the very first orb goes in, only the plain band parts fall (no fx, moods, combos …)
  const first = !firstOrbDone;
  if (S.opening && !S.bootDone && !onlyIds) return null;
  const allowed = (l) => (!l.vocal || vocalsOn()) && (onlyIds || (!(early && noSound(l)) && !(l.combo && comboHeld()) && (!first || FIRST_CATS.has(l.cat)) && (!S.opening || instant(l))));
  // now and then the next uploaded custom orb of the batch instead of a catalogue one
  if (!onlyIds && !first && S.serverOrbs.length >= SERVER_BATCH && Math.random() < SERVER_RAIN) {
    const l = byId[S.serverOrbs[S.serverNext]?.id];
    if (l && allowed(l) && !shown.has(l.id)) {
      serverFell();
      return l.id;
    }
  }
  let pool = from.filter((l) => allowed(l) && !shown.has(l.id) && !(l.combo && l.combo.every((c) => active.has(c))));
  if (!pool.length && !onlyIds) pool = from.filter((l) => allowed(l));
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
// held at SCALE_SHARE of its category instead, so it can keep growing without taking over; turning
// those orbs down lowers that share for a while (taste.scaleKeep).
const SCALE_SHARE = 0.3;
const MOOD_SHARE = 0.08;
// Combos fall less once the song is full: from about 15% of drops at COMBO_FULL orbs (×COMBO_HI)
// easing down towards about 3% (×COMBO_LO) over COMBO_TAU orbs (≈5% at 10, ≈3.4% at 14), with
// every sound part in the song. A combo whose parts are mostly in the song already adds little,
// so it falls less again (up to COMBO_OVERLAP off when all but one are in).
const COMBO_FULL = 4, COMBO_HI = 0.76, COMBO_LO = 0.13, COMBO_TAU = 3, COMBO_OVERLAP = 0.7;
function comboDamp(l) {
  const crowd = COMBO_LO + (COMBO_HI - COMBO_LO) * Math.exp(-Math.max(0, active.size - COMBO_FULL) / COMBO_TAU);
  const have = l.combo.filter((c) => active.has(c)).length / l.combo.length;
  return crowd * (1 - COMBO_OVERLAP * have);
}
function spawnWeights(pool, activeCats) {
  const fams = new Map(); // cat -> Map(family -> count)
  for (const l of pool) {
    const m = fams.get(l.cat) ?? fams.set(l.cat, new Map()).get(l.cat);
    m.set(l.family, (m.get(l.family) ?? 0) + 1);
  }
  const famWeight = (fam, n) => Math.sqrt(n) * (fam === 'block fx' && !onlyIds ? 0.15 : 1);
  // the other-scale orbs take a fixed share of their category (SCALE_SHARE), however many there are
  const scaleShare = SCALE_SHARE * taste.scaleKeep();
  const famWeights = new Map([...fams].map(([cat, m]) => {
    const w = new Map([...m].map(([f, n]) => [f, famWeight(f, n)]));
    const rest = [...w].reduce((s, [f, x]) => s + (f === 'other scales' ? 0 : x), 0);
    if (w.has('other scales') && rest > 0) w.set('other scales', (rest * scaleShare) / (1 - scaleShare));
    return [cat, w];
  }));
  const catTotal = new Map([...famWeights].map(([cat, w]) => [cat, [...w.values()].reduce((s, x) => s + x, 0)]));
  if (onlyIds) return pool.map(() => 1);
  const w = pool.map((l) => {
    const n = fams.get(l.cat).get(l.family);
    const cat = (CAT_SHARE[l.cat] ?? 20) * (activeCats.has(l.cat) ? 1 : 4) * (l.combo || l.fx || l.duck || l.bpm || l.mode ? 0.25 : 1);
    return ((cat * famWeights.get(l.cat).get(l.family)) / catTotal.get(l.cat) / n) * (l.combo ? comboDamp(l) : 1);
  });
  // moods, once the song has one: a fixed MOOD_SHARE of all drops instead of the ¼× (several are
  // worth trying); their split over the mood families stays as above. Without one, the 4× above.
  const isMood = (l) => l.cat === 'mood';
  const moodTot = pool.reduce((s, l, i) => s + (isMood(l) ? w[i] : 0), 0);
  const restTot = pool.reduce((s, l, i) => s + (isMood(l) ? 0 : w[i]), 0);
  if (activeCats.has('mood') && moodTot > 0 && restTot > 0) {
    const k = (restTot * MOOD_SHARE) / (1 - MOOD_SHARE) / moodTot;
    pool.forEach((l, i) => isMood(l) && (w[i] *= k));
  }
  // then, inside each category, towards orbs that fit the song, or away from it after turn-downs
  // (moods have no vibe, so their share stays)
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
S.previewOnly = false;
// a falling orb heard on hover and then left alone counts as turned down (src/orbTaste.js)
let heard = null; // { id, from, at }
function hoverOn(id, from = null) {
  clearTimeout(hoverTimer);
  warm([byId[id]]);
  hoverTimer = setTimeout(async () => {
    if (S.hover === id) return;
    S.hover = id;
    heard = { id, from, at: performance.now() };
    if (!S.started) {
      // browsers only let audio start after the page has been clicked or typed into once
      if (!audioUnlocked()) {
        ui.soloHint.textContent = ot('hoverHint');
        return;
      }
      await ensureStarted();
      if (S.hover !== id) return; // the mouse left while the audio was loading
    }
    describe(byId[id], ot('previewing'));
    renderRoles();
    if (!S.playing) {
      S.previewOnly = true;
      await play();
    } else syncSoon();
  }, 160);
}
// drop a preview that is still waiting to start (the mouse entered an orb less than 160 ms ago)
const cancelHover = () => clearTimeout(hoverTimer);
function hoverOff() {
  clearTimeout(hoverTimer);
  if (!S.hover) return;
  if (heard?.id === S.hover && heard.from === 'field' && S.started) taste.previewLeft(S.hover, (performance.now() - heard.at) / 1000);
  heard = null;
  S.hover = null;
  S.hoverMix = false;
  describe(S.solo && byId[S.solo]);
  renderRoles();
  if (S.previewOnly) stop();
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
    if (o.id !== S.hover && !o.hold) o.y += o.v * boost * dt;
    if (o === S.comboOrb && !o.told && o.y >= size.h / 4) {
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
  if (S.comboOrb && !S.comboOrb.told && !rain.includes(S.comboOrb)) S.comboOrb = null;
  if (S.comboDue && comboHeld() && !S.comboOrb) S.comboOrb = dropCombo(size);
  let every = ((size.h + 80) / 19 / target() / boost) * 1000;
  if (extra > 0) every = Math.min(every, 700); // the extra orbs come in a little sooner
  if (rain.length < target() && now - lastSpawn > every) {
    lastSpawn = now;
    let id = pickCandidate();
    if (id) {
      id = freshOrb(id);
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
    let id = pickCandidate();
    if (id) id = freshOrb(id);
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
      b.addEventListener('mouseenter', () => {
        hoverOn(id);
        hoverCombo(id, b);
      });
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
  stash.push(el.dataset.id);
  el.remove();
  renderStash();
  bump(ui.stash, 'gulp');
  return true;
}

export {
  SERVER_BATCH, STASH_MAX, cancelHover, fieldSize, hoverOff, hoverOn, instant, makeOrbEl, onlyIds, pickX, rain,
  rainAdd, renderStash, seedRain, slotTag, spawnWeights, stash, storeInStash, updateRain, vanish,
};
