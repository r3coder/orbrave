// Presets (saved loops), the set surviving a reload, and ↶ 되돌리기.
// Split out of orbs.js; the files load in a chain (each imports the one before it first), so they run in the
// same order as the one file did. See orbs/state.js.
import { makeCopy, makeDrawn, onScreen, renderSlots } from './slots.js';
import { rng, hash, byId } from '../orbCatalog.js';
import { STEPS, songToWire, songFromWire } from '../orbPreset.js';
import { fetchPresets, weightedOrder } from '../presetApi.js';
import { mountVote } from '../vote.js';
import { ot } from '../orbsI18n.js';
import {
  $, S, VOL_STEPS, active, gainStep, heldSeed, orbStep, orbVars, ownGains, ownSeed, ownSeeds,
  presetVars, setStep, setVars, ui, varCount, varIndexOf, varSeed,
} from './state.js';
import { isPhone } from '../phoneLayout.js';
import { layers, nextBar, nextPhrase, play, put, removeLayer, returnOrb, seeded, sync } from './audio.js';
import { tutEvent } from './guide.js';
import { bubbles, paint, tint } from './list.js';
import { STASH_MAX, rain, renderStash, stash, vanish } from './field.js';
import { FX_SLOTS, accepts, bump, coreCenter, highlight, overCore, slotIds, slotOrbs } from './drag.js';
import { commitDraft, rollOrb } from './variations.js';
import { customDefsFor, ensureCustoms, orbEditing } from './customOrbs.js';
import { SHARE_TAG, openShareDialog, parsePresetText, sharePreset } from './share.js';
import { openSong, syncRows } from './stems.js';

// ---------- presets ----------

const PRESET_KEY = 'orbPresets';
function loadPresets() {
  try {
    const list = JSON.parse(localStorage.getItem(PRESET_KEY));
    return (Array.isArray(list) ? list : []).filter((p) => p && typeof p === 'object' && Array.isArray(p.layers));
  } catch {
    return [];
  }
}
function savePresets(list) {
  try {
    localStorage.setItem(PRESET_KEY, JSON.stringify(list));
  } catch {}
}

// a preset's orbs (a drawn one stands in as the orb it was drawn from), for its tile's ball
function presetParts(p) {
  ensureCustoms(p);
  const src = (id) => byId[id] ?? byId[(p.drawn ?? []).find((d) => d.id === id)?.src];
  const list = p.layers.map(src).filter(Boolean).flatMap((l) => (l.combo ? l.combo.map((c) => byId[c]).filter(Boolean) : [l]));
  return [...new Set(list)];
}

// a preset drawn like a combo orb: its orbs huddled together, and for a stem a white ring around
// them and a white ▶ in the middle (fills .mini tiles and the drag ghost's .ball)
function paintPreset(el, inner, p) {
  const parts = presetParts(p).slice(0, 6);
  paint(el, { color: parts[0] ? tint(parts[0]) : '#39ff9c' });
  if (!parts.length) return void (inner.innerHTML = '<i class="swirl"></i>');
  el.classList.add('cluster');
  inner.innerHTML = bubbles(parts, p.id + p.name, !!p.song);
}

// The tiles' own tooltip (in the page's style, not the browser's): name, loop / stem and the orb
// count, author, description, how to load it. One element, moved to the tile under the mouse.
const ptip = document.createElement('div');
ptip.className = 'ptip';
document.body.append(ptip);
let ptipFor = null;
function showPtip(tile, p) {
  ptipFor = tile;
  const line = (tag, cls, text) => {
    const e = document.createElement(tag);
    e.className = cls;
    e.textContent = text;
    return e;
  };
  ptip.replaceChildren(
    line('b', 'pt-name', p.name),
    line('span', 'pt-kind' + (p.song ? ' stem' : ''), `${ot(p.song ? 'kindStem' : 'kindLoop')} · ${ot('tileOrbs', { n: p.layers.length })}`),
    ...(p.author ? [line('span', 'pt-by', ot('tileBy', { a: p.author }))] : []),
    ...(p.description ? [line('p', 'pt-desc', p.description)] : []),
    line('small', 'pt-how', ot('tileTip')),
  );
  // beside the tile (the sidebar is on the left); under or over it when there's no room (phone row)
  const t = tile.getBoundingClientRect(), b = ptip.getBoundingClientRect();
  let x = t.right + 10, y = t.top + t.height / 2 - b.height / 2;
  if (x + b.width > innerWidth - 8) {
    x = Math.min(Math.max(8, t.left + t.width / 2 - b.width / 2), innerWidth - b.width - 8);
    y = t.bottom + 8 + b.height > innerHeight - 8 ? t.top - b.height - 8 : t.bottom + 8;
  }
  ptip.style.left = `${Math.round(x)}px`;
  ptip.style.top = `${Math.round(Math.min(Math.max(8, y), innerHeight - b.height - 8))}px`;
  ptip.classList.add('on');
}
function hidePtip(tile) {
  if (tile && tile !== ptipFor) return;
  ptipFor = null;
  ptip.classList.remove('on');
}
addEventListener('scroll', () => hidePtip(), true);

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
  const ball = document.createElement('div');
  ball.className = 'mini';
  paintPreset(ball, ball, p);
  const name = document.createElement('span');
  name.className = 'pname';
  name.textContent = p.name;
  // the line under the name is only the author (loop / stem shows in the ball and the tooltip)
  const meta = document.createElement('small');
  meta.textContent = p.author ?? '';
  meta.hidden = !p.author;
  tile.addEventListener('pointerenter', (e) => e.pointerType === 'mouse' && showPtip(tile, p));
  tile.addEventListener('pointerleave', () => hidePtip(tile));
  tile.addEventListener('pointerdown', () => hidePtip(tile));
  const share = tileButton('share', '', ot(p.song ? 'copyCodeStem' : 'copyCode'), () => sharePreset(p, share));
  share.dataset.ic = 'link';
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
  for (const p of list) {
    // one saved preset that can't be drawn must not take the page down with it
    try {
      ui.presetList.append(presetTile(p, true));
    } catch (e) {
      console.error('could not show a saved preset', p?.id, e);
    }
  }
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
  const r = rng(hash([...active.keys()].join()) + S.variation);
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
    ...(layers().some(seeded) ? { variation: S.variation } : {}),
    ...(ownSeeds() ? { seeds: ownSeeds() } : {}),
    ...(ownGains() ? { gains: ownGains() } : {}),
    ...(presetVars() ? { vars: presetVars() } : {}),
  };
  if (withSong && S.song?.sections) {
    syncRows();
    p.song = songToWire(S.song, (id, c) => (seeded(byId[id]) ? varSeed(byId[id], c.k) : null));
  }
  uncopy(p);
  // custom orbs (🎛 편집) travel as their definitions
  const custom = customDefsFor([...p.layers, ...(p.song?.rows ?? []).map((r) => r.id)]);
  if (custom.length) p.custom = custom;
  return p;
}

// Presets and share codes only know catalogue orbs, custom orbs and drawings: a copy goes
// out as the orb it was copied from (with its seed and volume), unless that orb is in the set already.
function uncopy(p) {
  const isCopy = (id) => !!byId[id]?.base && !Object.hasOwn(byId[id], 'edit');
  const to = new Map();
  for (const id of p.layers) {
    const b = isCopy(id) && byId[id].base;
    if (b && !p.layers.includes(b) && ![...to.values()].includes(b)) to.set(id, b);
  }
  const drop = new Set(p.layers.filter((id) => isCopy(id) && !to.has(id)));
  if (!to.size && !drop.size) return p;
  const keys = (o) => o && Object.fromEntries(Object.entries(o).filter(([k]) => !drop.has(k)).map(([k, v]) => [to.get(k) ?? k, v]));
  p.layers = p.layers.filter((id) => !drop.has(id)).map((id) => to.get(id) ?? id);
  if (p.seeds) p.seeds = keys(p.seeds);
  if (p.gains) p.gains = keys(p.gains);
  if (p.vars) p.vars = keys(p.vars);
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
      ghost.innerHTML = '<div class="fade"><div class="float"><span class="label"></span><div class="ball"></div><span class="kind"></span></div></div>';
      paintPreset(ghost, ghost.querySelector('.ball'), p);
      ghost.querySelector('.kind').textContent = ot(p.song ? 'kindStem' : 'kindLoop');
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
  ensureCustoms(p); // its custom orbs (🎛 편집), before anything names them
  // drawn parts are rebuilt under fresh ids so they never clash with drawings made since
  const ids = new Map((p.drawn ?? []).map((d) => [d.id, makeDrawn(d.src, d.raw).id]));
  if (p.variation) S.variation = p.variation;
  for (const [id, v] of Object.entries(p.seeds ?? {})) if (Number.isSafeInteger(v) && v >= 0) ownSeed.set(ids.get(id) ?? id, v);
  for (const id of p.layers) if (!ids.has(id)) orbVars.delete(id);
  // each orb's own volume (음량 slots), as whole percents
  for (const id of p.layers) {
    const g = p.gains?.[id];
    setStep(ids.get(id) ?? id, Number.isSafeInteger(g) && g > 0 ? gainStep(g / 100) : 0);
  }
  S.previewOnly = false;
  if (!S.playing) await play();
  const at = nextBar();
  for (const id of p.layers) {
    const l = byId[ids.get(id) ?? id];
    if (l) put(l, at);
  }
  // each orb's variations (변주 slot), the one it plays included
  for (const [id, v] of Object.entries(p.vars ?? {})) if (active.has(id)) setVars(id, v);
  for (const o of [...rain]) if (active.has(o.id)) vanish(o);
  // a stem preset brings its full song back too (drawings under their new ids)
  const grid = p.song && songFromWire(p.song, (id) => ids.get(id) ?? id);
  if (grid) {
    fillSeeds(grid);
    S.song = { seed: hash(String(p.id)), s0: nextPhrase(), ...grid, audition: null };
    S.stemSig = '';
    openSong();
  }
  await sync();
  if (!$('vote').hidden) voteSig = setSig();
}

// Each block names the variation it plays (cell.k). Older grids only have the seed (cell.v): it
// becomes the orb's variation with that seed (added to its list when new). The wire form only keeps
// the seed of blocks that play; a silent block takes the variation before it.
function fillSeeds(grid) {
  for (const r of grid.rows) {
    const l = byId[r.id], on = seeded(l);
    let last = orbVars.get(r.id)?.vi ?? 0;
    for (const sec of grid.cells[r.id]) {
      for (const c of sec) {
        if (c.k == null) c.k = on && c.v != null && c.on ? varIndexOf(r.id, c.v) : last;
        if (c.k >= varCount(r.id)) c.k = 0;
        last = c.k;
        delete c.v;
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
S.sessionDropped = false; // ↺ 튜토리얼 재실행: the page reloads as on a first visit, nothing is saved on the way out
function saveSession() {
  clearTimeout(sessionTimer);
  if (!sessionReady || S.offline || S.sessionDropped) return;
  if (rollOrb) commitDraft(); // a drawing in the open roll is kept as its variation
  const data = sessionData();
  remember(data);
  try {
    localStorage.setItem(SESSION_KEY, JSON.stringify(data));
  } catch {}
}
// the stem grid (open, or the one 📂 스템 열기 brings back), with each row's mute
function songSession() {
  const open = !!S.song?.sections;
  const song = open ? S.song : S.lastSong;
  if (!song?.sections) return null;
  if (open) syncRows();
  return { ...songToWire(song, () => null), seed: song.seed ?? 0, open, mutes: song.rows.filter((r) => r.mute).map((r) => r.id) };
}
function sessionData() {
  const song = songSession();
  const ids = new Set([...active.keys(), ...stash, ...slotIds(), ...(song?.rows ?? []).map((r) => r.id)]);
  const drawn = [...ids].map((id) => byId[id]).filter((l) => l?.raw).map((l) => ({ id: l.id, src: l.src, raw: l.raw, ...(l.pats?.length > 1 ? { pats: l.pats, pi: l.pi } : {}) }));
  const copies = [...ids].filter((id) => byId[id]?.base && !Object.hasOwn(byId[id], 'edit')).map((id) => ({ id, base: byId[id].base }));
  const customs = customDefsFor(ids);
  const of = (map) => Object.fromEntries([...ids].filter((id) => map.has(id)).map((id) => [id, map.get(id)]));
  return {
    layers: [...active.keys()],
    drawn,
    customs,
    copies,
    stash: [...stash],
    variation: S.variation,
    seeds: ownSeeds(),
    steps: of(orbStep),
    held: of(heldSeed),
    name: ui.presetName.value,
    slots: Object.fromEntries(FX_SLOTS.filter((m) => slotOrbs[m]).map((m) => [m, { id: slotOrbs[m].id, home: slotOrbs[m].home ?? null }])),
    vars: of(orbVars),
    ...(song ? { song } : {}),
  };
}

// ---------- ↶ 되돌리기: the last 20 changes to the set ----------
// Each time the set settles (the session save above, which follows every change) it is compared
// with the one before; when it differs, that one goes on the stack. So an orb in or out, 약하게 /
// 세게, a variation, 전부 비우기 or a preset loaded is one step each, and nothing is counted
// while an orb is still in the hand or a copy is still flying to the stash. Undo puts the set
// back: the song's orbs (each from its own spot), their volumes, seeds and variations, the stash
// and the slots. An orb the older set doesn't have goes back to the field.
const UNDO_MAX = 20;
const undoStack = []; // older sets, as JSON
S.undoBase = null; // the set as it last settled
let undoQuiet = false; // an undo is still landing (orbs flying home): it is not a change of its own
const undoKey = (d) => JSON.stringify({
  layers: d.layers, stash: d.stash, variation: d.variation, seeds: d.seeds, steps: d.steps, held: d.held, slots: d.slots, vars: d.vars,
  homes: Object.fromEntries(d.layers.map((id) => [id, active.get(id)?.home ?? null])),
});
const inHand = () => !!document.querySelector('body > .orb.dragging:not(.flying)');
function remember(data) {
  if (undoQuiet || inHand()) return;
  const k = undoKey(data);
  if (S.undoBase != null && k !== S.undoBase) {
    undoStack.push(S.undoBase);
    if (undoStack.length > UNDO_MAX) undoStack.shift();
  }
  S.undoBase = k;
  $('undo').disabled = !undoStack.length;
}
function undo() {
  // the piano roll or the 편집 panel is open: those have their own way back
  if (!undoStack.length || rollOrb || orbEditing) return;
  if (inHand()) return;
  saveSession(); // a change still waiting to be counted goes on the stack first
  const s = JSON.parse(undoStack.pop());
  $('undo').disabled = !undoStack.length;
  undoQuiet = true;
  const slotted = (x) => FX_SLOTS.map((m) => x[m]?.id).filter(Boolean);
  const keep = new Set([...s.layers, ...s.stash, ...slotted(s.slots)]);
  const before = new Set([...active.keys(), ...stash, ...slotted(slotOrbs)]);
  const field = (h) => (h?.kind === 'field' ? h : { kind: 'field', fx: 0.2 + Math.random() * 0.6, fy: 0.15 });
  // out of the song: the ones the older set has elsewhere just leave, the rest fly to the field
  for (const [id, a] of [...active]) {
    if (s.layers.includes(id)) continue;
    if (keep.has(id)) removeLayer(id, { silent: true, respawn: false });
    else {
      a.home = field(a.home);
      removeLayer(id, { silent: true });
    }
  }
  for (const id of [...stash, ...slotted(slotOrbs)]) if (!keep.has(id)) returnOrb(id, field(null));
  stash.length = 0;
  for (const id of s.stash) if (byId[id] && stash.length < STASH_MAX) stash.push(id);
  for (const m of FX_SLOTS) slotOrbs[m] = s.slots[m] && byId[s.slots[m].id] ? { ...s.slots[m] } : null;
  // 🎛 편집 is hidden on a phone: an orb the set left there goes home instead
  if (isPhone.matches && slotOrbs.edit) { returnOrb(slotOrbs.edit.id, slotOrbs.edit.home); slotOrbs.edit = null; }
  S.variation = s.variation;
  // volumes, seeds and variations of every orb either set has
  for (const id of new Set([...before, ...keep])) {
    setStep(id, s.steps[id] ?? 0);
    ownSeed.delete(id);
    heldSeed.delete(id);
    orbVars.delete(id);
  }
  const at = nextBar();
  for (const id of s.layers) if (byId[id] && !active.has(id)) put(byId[id], at, s.homes?.[id] ?? null);
  for (const [id, v] of Object.entries(s.seeds ?? {})) if (active.has(id)) ownSeed.set(id, v);
  for (const [id, v] of Object.entries(s.held ?? {})) if (!active.has(id)) heldSeed.set(id, v);
  for (const [id, v] of Object.entries(s.vars ?? {})) if (byId[id]) setVars(id, structuredClone(v));
  for (const o of [...rain]) if (keep.has(o.id)) vanish(o);
  renderStash();
  renderSlots();
  sync();
  // orbs flying home land within half a second; what is there then is the new starting point
  setTimeout(() => {
    undoQuiet = false;
    S.undoBase = undoKey(sessionData());
  }, 700);
}
$('undo').addEventListener('click', undo);
addEventListener('keydown', (e) => {
  if (!(e.ctrlKey || e.metaKey) || e.shiftKey || e.altKey || e.key.toLowerCase() !== 'z') return;
  if (e.target.closest?.('input, textarea, [contenteditable]')) return;
  e.preventDefault();
  undo();
});
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
    // custom orbs first: drawings, copies and the song may name them
    ensureCustoms({ custom: s.customs });
    // drawn orbs keep their ids, and new drawings are numbered past them
    for (const d of s.drawn ?? []) {
      if (!byId[d.src]?.voice || !Array.isArray(d.raw) || typeof d.id !== 'string' || d.id === '__proto__' || byId[d.id]) continue;
      const pats = Array.isArray(d.pats) && d.pats.every((x) => Array.isArray(x) && x.length === STEPS) ? d.pats : null;
      makeDrawn(d.src, d.raw, d.id, pats, pats ? d.pi : 0);
      const n = +String(d.id).match(/^drawn(\d+)$/)?.[1];
      if (n > S.drawnCount) S.drawnCount = n;
    }
    // so do copies (a second one of an orb on screen)
    for (const c of s.copies ?? []) {
      const n = +String(c.id).match(/^copy(\d+)$/)?.[1];
      if (!n || !byId[c.base] || (byId[c.base].base && !byId[c.base].custom) || byId[c.id]) continue;
      makeCopy(c.base, c.id);
      if (n > S.copyCount) S.copyCount = n;
    }
    if (+s.variation) S.variation = +s.variation;
    for (const id of s.stash ?? []) if (byId[id] && stash.length < STASH_MAX) stash.push(id);
    for (const id of s.layers ?? []) if (byId[id]) put(byId[id], 0);
    for (const [id, v] of Object.entries(s.seeds ?? {})) if (active.has(id) && Number.isSafeInteger(v)) ownSeed.set(id, v);
    for (const [id, n] of Object.entries(s.steps ?? {})) if (byId[id] && Number.isSafeInteger(n)) setStep(id, Math.max(-VOL_STEPS, Math.min(VOL_STEPS, n)));
    for (const [id, g] of Object.entries(s.gains ?? {})) if (byId[id] && Number.isFinite(g) && g > 0) setStep(id, gainStep(g)); // older sessions
    for (const [id, v] of Object.entries(s.held ?? {})) if (byId[id] && !active.has(id) && Number.isSafeInteger(v)) heldSeed.set(id, v);
    if (typeof s.name === 'string') ui.presetName.value = s.name;
    for (const [id, v] of Object.entries(s.vars ?? {})) if (byId[id]) setVars(id, v);
    for (const m of FX_SLOTS) {
      const x = s.slots?.[m];
      if (x && byId[x.id] && !active.has(x.id) && accepts(m, byId[x.id])) slotOrbs[m] = { id: x.id, home: x.home ?? null };
    }
    // the 복제 slot is gone: an orb a session left there goes to the stash
    const old = s.slots?.copy;
    if (old && byId[old.id] && !onScreen(old.id) && stash.length < STASH_MAX) stash.push(old.id);
    renderSlots();
    // the stems as they were left: open again if they were open, else for 📂 스템 열기
    const grid = s.song && songFromWire(s.song);
    if (grid) {
      // every block names its variation here (vi is left out when all are 0)
      for (const r of grid.rows) for (const sec of grid.cells[r.id]) for (const c of sec) c.k ??= 0;
      fillSeeds(grid);
      const mutes = new Set(Array.isArray(s.song.mutes) ? s.song.mutes : []);
      for (const r of grid.rows) if (mutes.has(r.id)) r.mute = true;
      const song = { seed: Number.isSafeInteger(s.song.seed) ? s.song.seed : 0, s0: 0, ...grid, audition: null, from: null };
      if (s.song.open) {
        S.song = song;
        S.stemSig = '';
        openSong();
      } else S.lastSong = song;
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
      localStorage.setItem(SESSION_KEY, JSON.stringify({ layers: p.layers, drawn: p.drawn, stash: [], variation: p.variation, seeds: p.seeds ?? {}, gains, vars: p.vars ?? {}, name: p.name, customs: p.custom ?? [] }));
    }
  } catch (e) {
    console.error('could not read the set in the URL', e);
  }
  history.replaceState(null, '', location.pathname + location.search);
}

export {
  SESSION_KEY, applyPreset, checkVoteSet, currentPreset, handoffPreset, loadPresets, refreshShared,
  renderPresets, renderShared, restoreSession, savePresets, saveSessionSoon, serverUp, sessionData,
  setServerUp, sharedList, undoKey,
};
