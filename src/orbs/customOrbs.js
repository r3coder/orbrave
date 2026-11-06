// The 🎛 편집 slot: custom orbs, their knobs panel, and uploading / listing them.
// Split out of orbs.js; the files load in a chain (each imports the one before it first), so they run in the
// same order as the one file did. See orbs/state.js.
import { closeEditor, rollOrb, seedFor, slotSay } from './variations.js';
import { getAudioContext, getAnalyserById } from '@strudel/web';
import { byId } from '../orbCatalog.js';
import { fetchOrbs, uploadOrb } from '../presetApi.js';
import { editOf, kindOf, rootId, checkCustom, registerCustom, makeDef } from '../orbEdit.js';
import { createOrbEditor } from '../orbEditor.js';
import { ot } from '../orbsI18n.js';
import { $, S, active, drawnOf, heldSeed, orbVars, setStep, setVars, ui, volStep } from './state.js';
import { chanOf, codeOf, play, returnOrb, seeded, stop, syncSoon } from './audio.js';
import { ctint, paint } from './list.js';
import { SERVER_BATCH, hoverOff, rain, stash } from './field.js';
import { bump, slotEls, slotIds, slotOrbs } from './drag.js';
import { renderSlots } from './slots.js';
import { saveSessionSoon, serverUp } from './presets.js';
import { AUTHOR_KEY } from './share.js';
import { fftBuf } from './visuals.js';
import { renderSearch, searchMode } from './search.js';

// ---------- 🎛 편집: custom orbs ----------
// An orb thrown into the 편집 slot opens the knobs panel over the field (src/orbEditor.js). The
// orb plays with the knobs as they are; ✓ 편집 완료 makes a custom orb from it (src/orbEdit.js)
// that takes the slot orb's place (no copy). Custom orbs are
// kept in this browser (내 오브, CUSTOM_KEY), fall with the rain, and can be uploaded on their own.

let orbEditing = null; // { id, edit, ab, solo }: the orb in the 편집 slot while its panel is open
let editStartedPlay = false; // the panel started playback (nothing was playing): it stops again on close
const orbEditor = createOrbEditor(ui.orbEdit, {
  onChange(s) {
    if (!orbEditing) return;
    // 🎧 솔로 while stopped: the player starts too (and stops again when the panel closes)
    const soloOn = s.solo && !orbEditing.solo;
    Object.assign(orbEditing, { edit: s.ab ? null : s.edit, ab: s.ab, solo: s.solo, color: s.color });
    if (soloOn && !S.playing) {
      editStartedPlay = !active.size;
      play();
    } else syncSoon();
  },
  onDone: (s) => finishOrbEdit(s),
  onCancel: () => closeOrbEdit(),
  paintOrb(el, l, color) {
    el.className = 'oe-ball mini';
    paint(el, color ? Object.create(l, { color: { value: color }, glow: { value: color }, colors: { value: undefined } }) : l);
    el.innerHTML = '<i class="swirl"></i>';
  },
  spectrum() {
    if (!S.playing || !orbEditing) return null;
    try {
      const an = getAnalyserById(chanOf(EDIT_PREVIEW_ID), 1024);
      an.getByteFrequencyData(fftBuf);
      return fftBuf;
    } catch {
      return null;
    }
  },
  sampleRate: () => getAudioContext().sampleRate,
  canUpload: () => serverUp !== false,
});
const EDIT_PREVIEW_ID = 'orbedit';
// the orb being edited as the panel has it, under an id of its own (its analyser channel)
function editPreview() {
  if (!orbEditing) return null;
  const l = byId[orbEditing.id];
  if (!l?.code) return null;
  const pv = Object.create(l);
  Object.defineProperties(pv, {
    id: { value: EDIT_PREVIEW_ID }, base: { value: l.id }, name: { value: ot('editPreview', { name: l.name }) },
    // A/B: the orb as it was (a custom orb's own knobs) / the knobs being set
    edit: { value: orbEditing.ab ? editOf(l, byId) : orbEditing.edit },
  });
  return pv;
}

function openOrbEdit(id) {
  const l = byId[id];
  if (!l?.code) return;
  if (rollOrb) closeEditor(); // the piano roll and the knobs share the space
  hoverOff();
  const v = drawnOf(l) ?? heldSeed.get(id) ?? S.variation;
  const code = codeOf(l, v);
  const start = editOf(l, byId) ?? {};
  orbEditing = { id, edit: { ...start }, ab: false, solo: false };
  const def = l.def ?? (l.base && byId[l.base]?.def); // a custom orb (or a copy of one): its name and colour too
  // shown first, so its graphs are drawn at their size
  ui.orbEdit.style.setProperty('--g', ctint(l));
  placeOrbEdit();
  document.body.classList.add('orbedit-open');
  orbEditor.open({ orb: l, code, kind: kindOf(l, code, start), start, name: def?.name || editName(l), color: def?.color ?? '' });
  bump(ui.orbEdit, 'gulp');
  renderSlots();
  if (!S.playing) {
    editStartedPlay = !active.size;
    play();
  } else syncSoon();
}
// a new custom orb's name to start from: one more adjective in front of the orb's own name
function editName(l) {
  const adjs = ot('editAdjs').split('|');
  const base = l.name.replace(/^✦\s*/, '');
  const pick = adjs.filter((a) => !base.startsWith(a));
  return `${pick[Math.floor(Math.random() * pick.length)]} ${base}`.slice(0, 24);
}
function closeOrbEdit() {
  if (!orbEditing) return;
  orbEditing = null;
  orbEditor.close();
  document.body.classList.remove('orbedit-open');
  renderSlots();
  if (editStartedPlay && !active.size && !S.song) stop();
  else syncSoon();
  editStartedPlay = false;
}
// the panel covers the right column down to the slots (whose height changes with the layout)
function placeOrbEdit() {
  ui.orbEdit.style.bottom = `${ui.slots.offsetHeight}px`;
}
// (the slots slide in and change height with the layout)
new ResizeObserver(() => orbEditing && placeOrbEdit()).observe(ui.slots);
ui.editOpen.addEventListener('click', () => {
  const s = slotOrbs.edit;
  if (!s) return;
  if (orbEditing) closeOrbEdit();
  else openOrbEdit(s.id);
});

// ✓ 편집 완료: the knobs become a custom orb, and it takes the place of the orb in the 편집 slot
function finishOrbEdit({ name, color, edit, upload }) {
  const l = orbEditing && byId[orbEditing.id];
  if (!l || !Object.keys(edit).length) return;
  const def = makeDef(rootId(l, byId), edit, name, color);
  const c = registerCustom(def, byId);
  keepCustom(def);
  const slot = slotOrbs.edit;
  const shown = c.id !== l.id && (active.has(c.id) || stash.includes(c.id) || slotIds().includes(c.id) || rain.some((o) => o.id === c.id));
  closeOrbEdit();
  if (slot?.id === l.id && !shown) {
    // the orb in the slot becomes the edited one (no copy): it keeps the variations and volume
    // the orb had, and goes where that one would have gone when it is taken out
    if (c.id !== l.id) {
      if (orbVars.has(l.id)) setVars(c.id, structuredClone(orbVars.get(l.id)));
      else if (seeded(l) && typeof seedFor(l) === 'number') heldSeed.set(c.id, seedFor(l));
      setStep(c.id, volStep(l.id));
      slot.id = c.id;
    }
  } else if (slot?.id === l.id) {
    // the very same custom orb is out already (on the field, in the stash or playing): the one in
    // the slot goes home instead of there being two
    slotOrbs.edit = null;
    returnOrb(l.id, slot.home);
  }
  renderSlots();
  bump(slotEls.edit, 'gulp');
  slotSay(ot('editMade', { name: c.name }));
  saveSessionSoon();
  if (upload) openOrbUpload(def);
}

// 내 오브: every custom orb made here, newest first (they show only in the ✦ 커스텀 오브 panel)
const CUSTOM_KEY = 'orbCustoms', CUSTOM_MAX = 60;
let myCustoms = [];
function loadCustoms() {
  try {
    const list = JSON.parse(localStorage.getItem(CUSTOM_KEY)) ?? [];
    myCustoms = (Array.isArray(list) ? list : []).map((d) => checkCustom(d, byId)).filter(Boolean).slice(0, CUSTOM_MAX);
  } catch {
    myCustoms = [];
  }
  for (const d of myCustoms) registerCustom(d, byId);
}
function saveCustoms() {
  try {
    localStorage.setItem(CUSTOM_KEY, JSON.stringify(myCustoms));
  } catch {}
}
function keepCustom(def) {
  myCustoms = [def, ...myCustoms.filter((d) => d.id !== def.id)].slice(0, CUSTOM_MAX);
  saveCustoms();
  if (!customMeta[def.id]?.at) setCustomMeta(def.id, { at: new Date().toISOString() });
}
// what this browser knows about its own custom orbs, for the hover card:
// { id: { at: made, up: uploaded to the server, by: the nickname it went up with } }
const CUSTOM_META_KEY = 'orbCustomMeta';
let customMeta = {};
try {
  const m = JSON.parse(localStorage.getItem(CUSTOM_META_KEY));
  if (m && typeof m === 'object' && !Array.isArray(m)) customMeta = m;
} catch {}
function setCustomMeta(id, patch) {
  if (patch) customMeta[id] = { ...(customMeta[id] ?? {}), ...patch };
  else delete customMeta[id];
  try {
    localStorage.setItem(CUSTOM_META_KEY, JSON.stringify(customMeta));
  } catch {}
}
// 🗑 on one of 내 오브: gone from this browser's list only. Songs, presets and the orbs out on
// screen keep it (it stays registered); a copy uploaded earlier stays on the server.
function deleteCustom(id) {
  myCustoms = myCustoms.filter((d) => d.id !== id);
  saveCustoms();
  setCustomMeta(id, null);
}
loadCustoms();
// custom orbs others uploaded (GET /api/orbs): a batch of SERVER_BATCH, registered as they arrive
let serverLoad = null; // the fetch under way
let serverErr = false;
const customPanelOpen = () => searchMode === 'custom' && ui.search.classList.contains('open');
const refreshCustomPanel = () => customPanelOpen() && renderSearch();
function refreshSharedOrbs() {
  if (serverLoad) return serverLoad;
  serverLoad = fetchOrbs({ limit: SERVER_BATCH })
    .then((recs) => {
      const out = [];
      for (const r of recs) {
        const d = checkCustom(r.orb, byId);
        if (!d || out.some((x) => x.id === d.id)) continue;
        registerCustom(d, byId);
        out.push({ id: d.id, at: String(r.createdAt ?? ''), by: String(r.author ?? '') });
      }
      S.serverOrbs = out;
      S.serverNext = 0;
      serverErr = false;
    })
    .catch((e) => {
      serverErr = true;
      console.info('custom orbs unavailable:', e.message);
    })
    .finally(() => {
      serverLoad = null;
      refreshCustomPanel();
    });
  refreshCustomPanel();
  return serverLoad;
}
// one of the batch has fallen: the next one is up, or after the last a new batch
function serverFell() {
  S.serverNext++;
  if (S.serverNext >= S.serverOrbs.length) refreshSharedOrbs();
  else refreshCustomPanel();
}
// the definitions a preset needs for the custom orbs it names (directly, or through copies / drawings)
function customDefsFor(ids) {
  const out = new Map();
  for (const id of ids) {
    let l = byId[id];
    if (l?.src) l = byId[l.src];
    while (l && !l.def && l.base && byId[l.base] !== l) l = byId[l.base];
    if (l?.def) out.set(l.def.id, l.def);
  }
  return [...out.values()];
}
// a preset's custom orbs, registered (before its tiles are drawn or it is played)
function ensureCustoms(p) {
  for (const d of p?.custom ?? []) {
    const c = checkCustom(d, byId);
    if (c) registerCustom(c, byId);
  }
}

// ☁ 완료하고 서버에 올리기: one custom orb to the server, after the same kind of agreement as a song
const orbUpDlg = $('orbUpDlg'), orbUpErr = $('orbUpErr'), orbUpOk = $('orbUpOk');
let orbUpDef = null;
function openOrbUpload(def) {
  if (serverUp === false) return;
  orbUpDef = def;
  $('orbUpName').textContent = byId[def.id]?.name ?? def.name;
  try {
    $('orbUpAuthor').value = localStorage.getItem(AUTHOR_KEY) ?? '';
  } catch {}
  $('orbUpAgree').checked = false;
  orbUpOk.disabled = true;
  orbUpErr.textContent = '';
  orbUpErr.classList.remove('ok');
  orbUpDlg.showModal();
}
// 🗑 on one of 내 오브: asks first, and says so when it went up to the server once
const orbDelDlg = $('orbDelDlg');
let orbDelId = null;
function openOrbDelete(id) {
  orbDelId = id;
  $('orbDelName').textContent = byId[id]?.name ?? '';
  $('orbDelWarn').hidden = !customMeta[id]?.up;
  orbDelDlg.showModal();
}
$('orbDelCancel').addEventListener('click', () => orbDelDlg.close());
$('orbDelForm').addEventListener('submit', (e) => {
  e.preventDefault();
  if (orbDelId) deleteCustom(orbDelId);
  orbDelId = null;
  orbDelDlg.close();
  refreshCustomPanel();
});
$('orbUpCancel').addEventListener('click', () => orbUpDlg.close());
$('orbUpAgree').addEventListener('change', (e) => (orbUpOk.disabled = !e.target.checked));
$('orbUpForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  if (!orbUpDef || orbUpOk.disabled) return;
  const author = $('orbUpAuthor').value;
  try {
    localStorage.setItem(AUTHOR_KEY, author);
  } catch {}
  orbUpOk.disabled = true;
  orbUpErr.textContent = ot('uploading');
  try {
    await uploadOrb(orbUpDef, { author, agree: true, website: $('orbUpWebsite').value });
    setCustomMeta(orbUpDef.id, { up: new Date().toISOString(), by: author.trim() });
    refreshCustomPanel();
    orbUpErr.textContent = ot('orbUpDone');
    orbUpErr.classList.add('ok');
    setTimeout(() => orbUpDlg.close(), 1200);
  } catch (err) {
    orbUpErr.textContent = err.message || ot('orbUpFail');
    orbUpOk.disabled = false;
  }
});

export {
  closeOrbEdit, customDefsFor, customMeta, editPreview, ensureCustoms, myCustoms, openOrbDelete,
  openOrbEdit, openOrbUpload, orbEditing, orbEditor, refreshSharedOrbs, serverErr, serverFell,
  serverLoad,
};
