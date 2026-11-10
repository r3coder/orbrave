// The piano roll and the 변주 slot: an orb's variations.
// Split out of orbs.js; the files load in a chain (each imports the one before it first), so they run in the
// same order as the one file did. See orbs/state.js.
import { accepts, bump, slotEls, slotOrbs } from './drag.js';
import { byId } from '../orbCatalog.js';
import {
  STEPS, ROWS, SEMI, SEMIS, isSemi, fullScaleRaw, notesAt, stepOf, VAR_MAX, fxScalable,
} from '../orbPreset.js';
import { ot } from '../orbsI18n.js';
import * as taste from '../orbTaste.js';
import { S, applyVar, drawnOf, ensureVars, heldSeed, orbVars, seedOf, ui } from './state.js';
import { keyMode, seeded, sync, syncSoon } from './audio.js';
import { ctint } from './list.js';
import { hoverOff } from './field.js';
import { closeTab, patternToRaw, putInSlot, renderRollHead, renderSlots } from './slots.js';
import { saveSessionSoon } from './presets.js';
import { newSeed } from './stems.js';

// ---------- piano roll: draw a line, get a part ----------
// 4 bars × 16 steps; rows are scale degrees of A minor (0 = lowest). The drawing is a draft
// that plays as a preview while the roll is open; "곡에 추가" turns it into an orb in the
// song, "보관함" keeps it as an orb in the stash without adding it.

const GUTTER = 34; // BARS, STEPS, ROWS come from orbPreset.js
let draft = null; // { src: instrument orb id, raw: Array(STEPS) of degree | [degrees] | null }
// mode: 'add' puts a note on each step the line crosses (beside any already there), 'remove'
// (the press landed on a note) takes notes off, 'erase' (right button / shift) clears whole steps
S.stroke = null; // { mode, base: raw at the press, pts: [[x, y]], last: { s, d } }
S.drawnCount = 0;
// 편집 (beside the 변주 slot) opens the roll on the orb sitting there, at the variation on show.
// 수정 완료 (or switching variation, or taking the orb out) keeps what was drawn as that variation.
let rollOrb = null; // { id }: the orb in the 변주 slot being edited
// 풀 스케일: the roll shows all 12 semitones over 4 octaves (scrolling) instead of the key's 15
// scale rows. It stays on for the next orb; a full-scale drawing turns it on when it is opened.
let fullScale = false;
S.rollScrollDue = false; // scroll the roll to its notes on the next frame

const hasNotes = (raw) => raw.some((d) => notesAt(d).length > 0);
// the roll is showing semitones (only pitched instruments have them)
const semiRoll = () => fullScale && !!draft && !!byId[draft.src]?.voice?.root;
const rollRows = () => (semiRoll() ? SEMIS : ROWS);
// a roll row as a stored note, and back
const rowVal = (r) => (semiRoll() ? SEMI + r : r);
const rowOf = (d) => (isSemi(d) ? d - SEMI : d);
const scaleSteps = () => (keyMode() === 'major' ? [0, 2, 4, 5, 7, 9, 11] : [0, 2, 3, 5, 7, 8, 10]);
// semitones above the voice's root -> the nearest scale row (0–14)
function degreeOf(rel) {
  const steps = scaleSteps(), pc = ((rel % 12) + 12) % 12;
  let best = 0;
  steps.forEach((st, i) => Math.abs(st - pc) < Math.abs(steps[best] - pc) && (best = i));
  let d = Math.floor(rel / 12) * 7 + best;
  while (d < 0) d += 7;
  while (d > ROWS - 1) d -= 7;
  return d;
}
// semitones above the voice's root -> a full-scale note (rows start an octave under the root)
function semiOf(rel) {
  let k = rel + 12;
  while (k < 0) k += 12;
  while (k > SEMIS - 1) k -= 12;
  return SEMI + k;
}
// A drawing in the other kind of rows. To full scale each note goes to its semitone. Back to the key's rows, each note goes to the nearest.
function convertRaw(raw, v, toSemi) {
  if (toSemi) {
    const steps = scaleSteps();
    return raw.map((x) => stepOf(notesAt(x).map((d) => (isSemi(d) ? d : semiOf(Math.floor(d / 7) * 12 + steps[d % 7])))));
  }
  return raw.map((x) => stepOf(notesAt(x).map((d) => (isSemi(d) ? degreeOf(d - SEMI - 12) : d))));
}
// make the draft's notes match the roll's rows: an untouched seed variation is read again (exact notes)
function fitDraft() {
  const s = draft && byId[draft.src];
  if (!s?.voice?.root || !hasNotes(draft.raw)) return;
  const want = semiRoll();
  if (fullScaleRaw(draft.raw) === want) return;
  if (!draft.edited && !drawnOf(s)) {
    const own = patternToRaw(s, draft.seed ?? seedFor(s), want);
    if (own && hasNotes(own)) {
      draft.raw = own;
      return;
    }
  }
  draft.raw = convertRaw(draft.raw, s.voice, want);
}
function setFullScale(on) {
  fullScale = on;
  fitDraft();
  S.rollScrollDue = true;
  renderRollHead();
  if (rollOrb) sync();
}
// the seed an orb plays at outside the song: its variation, one waiting from the 변주 slot, else its own or the shared one
const seedFor = (l) => drawnOf(l) ?? heldSeed.get(l.id) ?? seedOf(l);

// a short line over the slots when one turns an orb away
let slotHintTimer = 0;
function slotSay(text) {
  ui.slotHint.textContent = text;
  ui.slotHint.classList.add('on');
  clearTimeout(slotHintTimer);
  slotHintTimer = setTimeout(() => ui.slotHint.classList.remove('on'), 4000);
}

// Put an orb into a slot: it does its job and keeps the orb. apply = false when a saved session
// puts it back (the change was made before).
function pickForSlot(id, home = null, mode = 'vary', { apply = true } = {}) {
  const l = byId[id];
  if (!accepts(mode, l)) {
    slotSay(ot(mode === 'vary' ? 'slotVaryNo' : mode === 'edit' ? 'slotEditNo' : !l.code && !fxScalable(l) ? 'slotGainNo' : mode === 'quieter' ? 'slotQuieterMax' : 'slotLouderMax', { name: l.name }));
    bump(slotEls[mode], 'reject');
    return false;
  }
  taste.slot(id); // tried out: if it goes back to the field, only a weak turn-down
  return putInSlot(id, home, mode, apply);
}

// ---------- the 변주 slot: an orb's variations ----------

// a new variation for the orb, selected: a fresh seed, or for a part whose notes never change
// with the seed, a copy of the notes on show to draw on
// a fresh seed variation at the end of the orb's list (its index), or null when the list is full
function newSeedVar(id) {
  const st = ensureVars(id);
  if (st.list.length >= VAR_MAX) return null;
  const used = new Set(st.list.map((x) => x.seed));
  let v;
  do v = newSeed();
  while (used.has(v) || v === S.variation);
  st.list.push({ seed: v });
  return st.list.length - 1;
}
function addVar(id) {
  const st = ensureVars(id), l = byId[id];
  if (st.list.length >= VAR_MAX) return false;
  if (seeded(l)) newSeedVar(id);
  else {
    const raw = drawnOf(l)?.raw ?? (l.voice && patternToRaw(l, seedFor(l), fullScale && !!l.voice.root));
    if (!raw) return false;
    st.list.push({ raw: [...raw] });
  }
  st.vi = st.list.length - 1;
  applyVar(id);
  return true;
}
// the first time in: 02, a new variation (an orb with variations shows the one it plays)
function startVars(id) {
  if (orbVars.has(id)) return;
  ensureVars(id);
  if (seeded(byId[id])) addVar(id);
}
// stem cells that pointed at variation k of id follow its removal
function dropVarCells(id, k) {
  for (const s of [S.song, S.lastSong]) {
    for (const sec of s?.cells?.[id] ?? []) {
      for (const c of sec) if (c.k != null && c.k >= k) c.k = c.k === k ? Math.max(0, k - 1) : c.k - 1;
    }
  }
}
function varyOrb() {
  const s = slotOrbs.vary;
  return s ? s.id : null;
}
// ◀ / ▶ beside the 변주 slot; ▶ past the last one makes a new variation
function stepVar(dir) {
  const id = varyOrb();
  if (!id) return;
  const editing = !!rollOrb;
  if (editing) commitDraft();
  const st = ensureVars(id), i = st.vi + dir;
  if (i < 0) return;
  if (i >= st.list.length) {
    if (!addVar(id)) return;
  } else {
    st.vi = i;
    applyVar(id);
  }
  varChanged(id, editing);
}
// 변주 제거: the variation on show goes (01, how the orb played before, always stays)
function removeVar() {
  const id = varyOrb(), st = id && orbVars.get(id);
  if (!st || !st.vi) return;
  const editing = !!rollOrb;
  st.list.splice(st.vi, 1);
  dropVarCells(id, st.vi);
  st.vi--;
  applyVar(id);
  if (editing) draft.edited = false; // what was being drawn went with it
  varChanged(id, editing);
}
function varChanged(id, editing) {
  renderSlots();
  bump(slotEls.vary.querySelector('.mini') ?? slotEls.vary, 'gulp');
  if (editing) loadDraft();
  saveSessionSoon();
  syncSoon();
}

// 편집: the roll opens on the variation on show (a vocal orb's: its words, see renderWords in slots.js)
function openEditor() {
  const id = varyOrb(), l = id && byId[id];
  if (!(l?.voice || l?.vocal) || rollOrb) return;
  ensureVars(id);
  hoverOff(); // the roll's own preview takes over from hearing the slot's orb
  rollOrb = { id };
  loadDraft();
  document.body.classList.add('roll-full');
  document.body.classList.remove('roll-min');
  ui.roll.style.setProperty('--g', ctint(l));
  bump(ui.roll, 'gulp');
  renderSlots();
  syncSoon();
}
// the variation on show as a drawing: its notes, or the notes its seed plays
function loadDraft() {
  const l = byId[rollOrb.id], x = drawnOf(l);
  // a vocal orb has no notes to draw: the draft is the seed its words come from (null: as it is)
  if (l.vocal) {
    draft = { src: l.id, raw: Array(STEPS).fill(null), edited: false, seed: null, words: true };
    renderRollHead();
    return;
  }
  if (x && fullScaleRaw(x.raw)) fullScale = true; // a full-scale drawing opens as one
  const raw = x ? [...x.raw] : patternToRaw(l, seedFor(l), fullScale && !!l.voice?.root);
  draft = { src: l.id, raw: raw ?? Array(STEPS).fill(null), edited: false, seed: null };
  fitDraft();
  S.rollScrollDue = true;
  renderRollHead();
}
// what was drawn (or rolled with 🎲) becomes the variation on show
function commitDraft() {
  if (!rollOrb || !draft) return;
  const id = rollOrb.id, st = ensureVars(id);
  if (draft.edited && hasNotes(draft.raw)) st.list[st.vi] = { raw: [...draft.raw] };
  else if (!draft.edited && draft.seed != null) st.list[st.vi] = { seed: draft.seed };
  draft.edited = false;
  draft.seed = null;
  applyVar(id);
}
// 수정 완료: keep it and close the roll (the orb stays in the 변주 slot)
function closeEditor() {
  if (!rollOrb) return;
  commitDraft();
  rollOrb = null;
  draft = null;
  closeTab();
  renderSlots();
  sync();
}

export {
  GUTTER, addVar, closeEditor, commitDraft, degreeOf, draft, dropVarCells, fullScale, hasNotes,
  newSeedVar, openEditor, pickForSlot, removeVar, rollOrb, rollRows, rowOf, rowVal, scaleSteps,
  seedFor, semiOf, semiRoll, setFullScale, slotSay, startVars, stepVar, varyOrb,
};
