// Grabbing, dropping and throwing orbs: the player, the slots under the field, the stash.
// Split out of orbs.js; the files load in a chain (each imports the one before it first), so they run in the
// same order as the one file did. See orbs/state.js.
import { STASH_MAX, cancelHover, fieldSize, hoverOff, makeOrbEl, rain, rainAdd, renderStash, stash, storeInStash } from './field.js';
import { byId } from '../orbCatalog.js';
import { fxScalable } from '../orbPreset.js';
import { isPhone } from '../phoneLayout.js';
import * as taste from '../orbTaste.js';
import { S, VOL_STEPS, active, ui, volStep } from './state.js';
import { addLayer, removeLayer, returnOrb, seeded, syncSoon, warm } from './audio.js';
import { countMove } from './guide.js';
import { ctint } from './list.js';
import { pickForSlot } from './variations.js';
import { renderSlots } from './slots.js';

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
// The orb slots under the field: 약하게 · 세게, and apart from them 변주. The volume
// slots change the orb and keep it, jiggling, in the slot until it is grabbed out again; what a
// slot did stays with the orb wherever it goes next. 변주 keeps the orb still, with its
// variations around it (변주 제거 · ◀ · ▶ · 편집, which opens the piano roll on the one on show).
// 🎛 편집, last and apart again, opens the knobs panel over the field on the orb put in it.
const SLOTS = ['quieter', 'louder', 'vary', 'edit'];
const FX_SLOTS = SLOTS; // every slot keeps the orb put into it
const slotOrbs = {}; // mode -> { id, home }: the orb sitting in a slot
const slotIds = () => FX_SLOTS.map((m) => slotOrbs[m]?.id).filter(Boolean);
const slotEls = Object.fromEntries(SLOTS.map((m) => [m, ui.slots.querySelector(`[data-slot="${m}"]`)]));
// which orbs a slot takes: the volume slots an orb that plays a part of its own (up to three
// steps each way), 변주 an orb whose notes change with the seed or an instrument to draw with
function accepts(mode, l) {
  if (!l || !slotLive(mode)) return false;
  if (mode === 'vary') return seeded(l) || (!!l.voice && !l.raw);
  // 🎛 편집: an orb that plays a sound of its own (not a drawing: its notes are its own), or a mood
  if (mode === 'edit') return (!!l.code && !l.combo && !l.raw) || l.cat === 'mood';
  // a mood orb: 약하게 / 세게 turn its effects down / up instead of a volume
  if (!l.code && (mode === 'quieter' || mode === 'louder') && fxScalable(l)) {
    return mode === 'quieter' ? volStep(l.id) > -VOL_STEPS : volStep(l.id) < VOL_STEPS;
  }
  if (!l.code) return false;
  return mode === 'quieter' ? volStep(l.id) > -VOL_STEPS : volStep(l.id) < VOL_STEPS;
}
// the slot under (x, y)
// On a phone the slots (and 편집) are always out; on wide screens the guide's steps open them.
const hasCls = (c) => document.body.classList.contains(c);
const slotsOn = () => isPhone.matches || hasCls('roll-ready');
// the guide wakes the slots up a group at a time (dimmed and shut until then, phones too):
// 약하게 · 세게 with the slots (2), 변주 at 3, 🎛 편집 at 6
// 🎛 편집 is hidden on a phone (orbsMobile.css): it takes nothing there
const slotLive = (m) => (m === 'vary' ? hasCls('midi-ready') : m === 'edit' ? hasCls('song-ready') && !isPhone.matches : true);
function slotAt(x, y) {
  if (!slotsOn()) return null;
  for (const m of SLOTS) if (slotLive(m) && inRect(slotEls[m], x, y)) return m;
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
  // its stem row stays while it is in the hand (it may be on its way to 변주)
  S.songHeld = id;
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
  ui.stash.classList.toggle('hot', !core && x !== null && overStash(x, y));
}

function startDrag(e, el, home, anchor) {
  e.preventDefault();
  const held = el.dataset.id;
  warm([byId[held]]);
  // a held orb is auditioned on its own; over the player it is heard with the song
  if (S.started) {
    S.hover = held;
    S.hoverMix = false;
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
    if (S.hover === held && overCore(x, y) !== S.hoverMix) {
      S.hoverMix = !S.hoverMix;
      syncSoon();
    }
  };
  move(e);
  const up = (ev) => {
    window.removeEventListener('pointermove', move);
    window.removeEventListener('pointerup', up);
    window.removeEventListener('pointercancel', up);
    highlight(null);
    // a quick throw can end before a preview set off on the way has started: it must not start after
    cancelHover();
    if (S.hover === held) {
      S.hover = null;
      S.hoverMix = false;
      syncSoon();
    }
    const x = ev.clientX - off.x, y = ev.clientY - off.y;
    if (S.songHeld === held) S.songHeld = null;
    if (ev.type !== 'pointerup') return goHome(el, home);
    if (land(el, home, x, y)) return;
    // released while moving fast: throw it
    const now = performance.now();
    // no move in the last 110 ms: the mouse was held still before letting go, so it is a drop,
    // not a throw (a real mouse sends no pointermove while it rests)
    const old = trail.find((p) => now - p.t < 110);
    const dt = old ? (now - old.t) / 1000 : 0;
    const vx = dt > 0.012 ? (x - old.x) / dt : 0, vy = dt > 0.012 ? (y - old.y) / dt : 0;
    if (home.kind === 'active') {
      // taken out of the song: it stays where it was let go; a hard flick to the right throws it
      // off the screen (past the stash: only a drop right on it keeps it there), and it comes
      // back down with the rain
      if (vx > 900 && vx > Math.abs(vy) * 1.2) return throwOut(el, x, y, vx, vy);
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
  // volume slot does its job once more (grab, drop, grab, drop … turns it down step by step)
  const own = home.kind === 'slot' ? home.mode : null;
  if (m && m === own && !thrown) {
    if (pickForSlot(el.dataset.id, home.origin, m)) el.remove();
    else goHome(el, home);
    return true;
  }
  if (m && m !== own) {
    // the orb moves into the slot and stays there
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
  if (!inRect(ui.field, x, y)) return goHome(el, home);
  const fr = ui.field.getBoundingClientRect();
  rainAdd(el.dataset.id, x - fr.left, y - fr.top, { el });
}

function goHome(el, home) {
  // an orb taken out of the song and dropped nowhere in particular goes back in
  if (home.kind === 'active') return absorb(el, home.home);
  const id = el.dataset.id;
  let tx, ty;
  if (home.kind === 'slot') {
    const r = slotEls[home.mode].getBoundingClientRect();
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
    if (home.kind === 'slot') {
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

// (tx, ty) pushed sideways out of the player's drop zone, to `side` (1 right, -1 left) where it
// fits between the field's edges (inset by `pad`), else the other way; returns the new x
function clearOfCore(tx, ty, fr, pad, side) {
  const c = coreCenter();
  const clear = c.drop + 40;
  if (Math.hypot(tx - c.x, ty - c.y) >= clear) return tx;
  const dy = Math.min(Math.abs(ty - c.y), clear - 1);
  const off = Math.sqrt(clear * clear - dy * dy);
  tx = c.x + side * off;
  if (tx < fr.left + pad || tx > fr.right - pad) tx = c.x - side * off;
  return Math.max(fr.left + pad, Math.min(fr.right - pad, tx));
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
  tx = clearOfCore(tx, ty, fr, pad, tx >= coreCenter().x ? 1 : -1);
  el.classList.add('flying');
  el.style.left = tx + 'px';
  el.style.top = ty + 'px';
  setTimeout(() => {
    el.classList.remove('flying');
    rainAdd(el.dataset.id, tx - fr.left, ty - fr.top, { el });
  }, 360);
}

// An orb taken out of the song and flicked to the right: it glides a little way that way, caught
// by nothing (stash, slots), settles somewhere in the middle of the field, clear of the player's
// drop zone, and falls slowly from there with the rain.
function throwOut(el, x, y, vx, vy) {
  const fr = ui.field.getBoundingClientRect();
  const padX = Math.min(120, fr.width * 0.15);
  let tx = x + Math.min(320, 140 + (vx - 900) * 0.08);
  let ty = y + Math.max(-120, Math.min(120, vy * 0.1)) - 60;
  tx = Math.max(fr.left + padX, Math.min(fr.right - padX, tx));
  ty = Math.max(fr.top + fr.height * 0.2, Math.min(fr.top + fr.height * 0.55, ty));
  // pushed out of the player's drop zone, to the right where it can
  tx = clearOfCore(tx, ty, fr, padX, 1);
  // a soft glide that slows into its spot
  const x0 = x, y0 = y, t0 = performance.now(), dur = 520;
  const step = (now) => {
    const t = Math.min(1, (now - t0) / dur);
    const e = 1 - Math.pow(1 - t, 3);
    el.style.left = x0 + (tx - x0) * e + 'px';
    el.style.top = y0 + (ty - y0) * e - Math.sin(Math.PI * t) * 30 + 'px';
    if (t < 1) return requestAnimationFrame(step);
    rainAdd(el.dataset.id, tx - fr.left, ty - fr.top, { el });
  };
  requestAnimationFrame(step);
}

function fling(el, home, x, y, vx, vy) {
  let last = performance.now();
  // while nothing plays, a throw heading left (towards the player) always lands in it, so the
  // first orb starts the song without pressing play
  const aim = !S.playing && home.kind !== 'active' && vx < 0 && -vx > Math.abs(vy);
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
  const seed = null;
  if (home?.kind === 'slot') home = home.origin;
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

export {
  FX_SLOTS, accepts, bump, coreCenter, goHome, grabFromRain, grabFromSong, grabFromStash, highlight,
  overCore, slotEls, slotIds, slotOrbs, slotsOn, startDrag,
};
