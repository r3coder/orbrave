// The slots under the field (putting orbs in, taking them out) and the piano roll: drawing notes, its canvas.
// Split out of orbs.js; the files load in a chain (each imports the one before it first), so they run in the
// same order as the one file did. See orbs/state.js.
import { closeOrbEdit, openOrbEdit, orbEditing } from './customOrbs.js';
import { transpiler, noteToMidi } from '@strudel/web';
import { byId, hash, rng } from '../orbCatalog.js';
import { rootId } from '../orbEdit.js';
import VOCAL from '../vocalLines.json';
import { wordLabel } from '../vocalWords.js';
import { BARS, STEPS, ROWS, SEMIS, sheetCode, quantize, notesAt, stepOf, VAR_MAX } from '../orbPreset.js';
import { lite } from '../liteMode.js';
import { toneHex, ink } from '../theme.js';
import { ot } from '../orbsI18n.js';
import { isPhone } from '../phoneLayout.js';
import { S, active, orbVars, seedOf, setStep, ui, varNum, volStep } from './state.js';
import { codeOf, keyShift, play, returnOrb, seeded, sync, syncSoon } from './audio.js';
import { hoverCombo } from './guide.js';
import { ctint, paint, patternOn, rawKey, tint, volScale } from './list.js';
import { hoverOff, hoverOn, makeOrbEl, rain, stash } from './field.js';
import { FX_SLOTS, bump, slotEls, slotIds, slotOrbs, slotsOn, startDrag } from './drag.js';
import {
  GUTTER, addVar, closeEditor, degreeOf, draft, fullScale, hasNotes, openEditor, removeVar, rollOrb,
  rollRows, rowOf, rowVal, scaleSteps, seedFor, semiOf, semiRoll, setFullScale, slotSay, startVars, stepVar,
  varyOrb,
} from './variations.js';
import { saveSessionSoon } from './presets.js';
import { askFirst, loopPos, newSeed } from './stems.js';

// The slots: the orb is changed (a volume step down / up, its variations started) and
// stays in the slot until it is grabbed out. An orb already there goes home.
function putInSlot(id, home, mode, apply = true) {
  const old = slotOrbs[mode];
  // a new orb in 변주 while the roll is open on the one there: that one's drawing is kept first
  if (mode === 'vary' && old && old.id !== id && rollOrb) closeEditor();
  // a new orb in 🎛 편집: what was being changed on the one there is dropped (완료 keeps it)
  if (mode === 'edit' && orbEditing) closeOrbEdit();
  if (old && old.id !== id) returnOrb(old.id, old.home);
  slotOrbs[mode] = { id, home };
  const fromScale = volScale(volStep(id));
  if (mode === 'vary') {
    // the first time in: its variations start (02); an orb that already has some gets a new one
    // at the end of its list, selected
    if (apply && !orbVars.has(id)) startVars(id);
    else if (apply && !addVar(id)) slotSay(ot('slotVaryFull', { n: VAR_MAX }));
  } else if (mode === 'edit') {
    if (apply) openOrbEdit(id);
  } else if (apply) setStep(id, volStep(id) + (mode === 'quieter' ? -1 : 1));
  bump(slotEls[mode], 'gulp');
  renderSlots();
  if (apply && (mode === 'quieter' || mode === 'louder')) {
    // shakes for 0.3s at its old size, overshoots smaller / bigger, then settles at the new one
    const mini = slotEls[mode].querySelector('.mini');
    mini?.style.setProperty('--from-scale', fromScale);
    mini?.classList.add(mode === 'quieter' ? 'squash' : 'swell');
  }
  return true;
}

// the orbs sitting in the slots (an empty slot shows just its name); the 변주 slot shows the
// number of the variation on show, and its buttons only while it has an orb
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
    if (m === 'vary') b.dataset.pnum = varNum(orbVars.get(s.id)?.vi ?? 0);
    b.addEventListener('pointerdown', (e) => grabFromSlot(e, m));
    b.addEventListener('mouseenter', () => {
      hoverOn(s.id);
      hoverCombo(s.id, b);
    });
    b.addEventListener('mouseleave', hoverOff);
    el.append(b);
  }
  const id = varyOrb(), st = id && orbVars.get(id);
  ui.varyWrap.classList.toggle('on', !!id);
  ui.varyWrap.classList.toggle('editing', !!rollOrb);
  ui.varyDel.disabled = !st?.vi;
  ui.varyPrev.disabled = !st?.vi;
  const last = !st || st.vi >= st.list.length - 1;
  ui.varyNext.disabled = !id || (last && (st?.list.length ?? 1) >= VAR_MAX) || (last && !seeded(byId[id]) && !byId[id]?.voice);
  ui.varyNext.title = ot(last ? 'varyNew' : 'varyNextTip');
  ui.varyEdit.disabled = !id || !(byId[id]?.voice || byId[id]?.vocal);
  // a vocal orb has words to pick instead of notes to draw
  const words = !!byId[id]?.vocal;
  ui.varyEdit.textContent = ot(words ? 'varyEditWords' : 'varyEdit');
  ui.varyEdit.title = ot(words ? 'varyEditWordsTip' : 'varyEditTip');
  ui.varyEdit.classList.toggle('on', !!rollOrb);
  slotEls.edit.classList.toggle('open', !!orbEditing);
  ui.editOpen.disabled = !slotOrbs.edit;
  ui.editOpen.classList.toggle('on', !!orbEditing);
  ui.editOpen.textContent = ot(orbEditing ? 'editClose' : 'editOpen');
  ui.editWrap.classList.toggle('on', !!slotOrbs.edit);
}

function grabFromSlot(e, mode) {
  const s = slotOrbs[mode];
  if (!s || e.button > 0) return;
  hoverOff();
  // taking the orb out of 변주 while it is being edited: what was drawn is kept first
  if (mode === 'vary' && rollOrb) closeEditor();
  // taking the orb out of 🎛 편집 closes its panel without keeping what was changed
  if (mode === 'edit' && orbEditing) closeOrbEdit();
  slotOrbs[mode] = null;
  renderSlots();
  startDrag(e, makeOrbEl(s.id), { kind: 'slot', mode, origin: s.home }, { x: e.clientX, y: e.clientY });
}

function closeTab() {
  document.body.classList.remove('roll-full', 'roll-min');
  renderRollHead();
  syncSoon();
}

// The roll's head: the orb being edited with the number of its variation.
function renderRollHead() {
  const held = rollOrb && byId[rollOrb.id];
  ui.rollSlot.innerHTML = '';
  ui.rollSlot.classList.toggle('filled', !!held);
  ui.rollSlot.style.setProperty('--g', held ? ctint(held) : '');
  if (held) {
    const b = document.createElement('div');
    b.className = 'mini';
    paint(b, held);
    if (hasNotes(draft.raw)) b.classList.add('pen');
    // what it will keep: a hand edit shows its notes' pattern, a 🎲 roll that seed's pattern
    if (draft.edited && hasNotes(draft.raw)) patternOn(b, rawKey(draft.raw), held);
    else if (draft.seed != null) patternOn(b, draft.seed, held);
    b.innerHTML = '<i class="swirl"></i>';
    b.dataset.pnum = varNum(orbVars.get(held.id)?.vi ?? 0);
    b.title = ot('rollGrabTip');
    ui.rollSlot.append(b);
  }
  const l = held;
  ui.rollName.innerHTML = l
    ? `<b style="color:${ctint(l)}">${l.name} <small>${ot('slotVary')} ${varNum(orbVars.get(l.id)?.vi ?? 0)}</small></b><span>${l.vocal ? ot('rollWords') : `${ot(l.voice.root ? 'rollPitched' : 'rollDrum')} · ${ot('rollThrow')}`}</span>`
    : ot('rollEmpty');
  ui.rollHint.textContent = '';
  ui.rollDone.disabled = !rollOrb;
  ui.rollDice.disabled = !rollOrb || !seeded(l);
  ui.rollFull.disabled = !rollOrb || !l?.voice?.root;
  ui.rollFull.classList.toggle('on', semiRoll());
  ui.rollFull.setAttribute('aria-pressed', String(fullScale));
  ui.roll.classList.toggle('semi', semiRoll());
  renderWords();
}

// ---------- a vocal orb's words (✎ 단어) ----------
// A vocal orb sings bar n of one of its lines in each bar (src/orbCatalog.js); which ones, and
// whether held notes are sung again, come from the variation's seed. Picking a word looks for a
// seed that makes that choice (the first few draws of the seed decide it, so it is quick), and the
// variation keeps that seed: saving, sharing and the stems read it like any other.
const BAR_CHORDS = ['Am9', 'Fmaj7', 'Cmaj7', 'G6'];
const wordsOf = (l, v) => l.vocalChoose(rng(hash(rootId(l, byId)) + v * 7919));
function seedForWords(l, per, stutter) {
  const base = hash(rootId(l, byId));
  const start = 1 + Math.floor(Math.random() * 9_000_000);
  for (let i = 0; i < 1_000_000; i++) {
    const v = start + i;
    const c = l.vocalChoose(rng(base + v * 7919));
    if (c.stutter === stutter && c.per.every((x, k) => x === per[k])) return v;
  }
  return null;
}
// every word on one line: the largest text size (13px down to 10px) at which no word in the list is
// cut, set on the whole list so the columns stay even. A tab too narrow for that shows the bars in
// two columns (two rows of two) and fits again, down to 8px; only past that does a word end in …
function fitWords() {
  const box = ui.rollWords;
  if (!box.offsetWidth) return;
  const cut = () => [...box.querySelectorAll('.word span, .word small')].some((e) => e.scrollWidth > e.clientWidth + 0.5);
  const fit = (min) => {
    let px = 13;
    box.style.fontSize = `${px}px`;
    while (px > min && cut()) box.style.fontSize = `${(px -= 0.5)}px`;
    return !cut();
  };
  box.classList.remove('two');
  if (fit(10)) return;
  box.classList.add('two');
  fit(8);
}
new ResizeObserver(() => document.body.classList.contains('roll-full') && fitWords()).observe(ui.rollWords);
async function setWords(per, stutter) {
  const l = rollOrb && byId[draft.src];
  if (!l?.vocal) return;
  const v = seedForWords(l, per, stutter);
  if (v == null) {
    ui.rollHint.textContent = ot('wordsNone');
    return;
  }
  draft.edited = false;
  draft.seed = v;
  renderRollHead();
  if (!S.playing) await play();
  else sync();
}
function renderWords() {
  const l = rollOrb && byId[rollOrb.id];
  ui.roll.classList.toggle('words', !!l?.vocal);
  ui.rollWords.innerHTML = '';
  if (!l?.vocal) return;
  const { per, stutter } = wordsOf(l, draft.seed ?? seedFor(l));
  per.forEach((cur, k) => {
    const col = document.createElement('div');
    col.className = 'words-bar';
    col.innerHTML = `<b>${ot('wordsBar', { n: k + 1 })}<small>${BAR_CHORDS[k]}</small></b>`;
    for (const line of l.vocalLines) {
      const b = document.createElement('button');
      b.className = 'word' + (line === cur ? ' on' : '');
      // what it says, in the page's language, and beside it how it sounds (scat and chords: only
      // how they sound; Japanese: the kana)
      const text = VOCAL.lines[line].bars[k].text;
      const { main, sub } = wordLabel(line, k, text);
      b.innerHTML = `<span>${main}</span>${sub ? `<small>${sub}</small>` : ''}`;
      b.title = main === text ? text : `${main}${sub ? ` · ${sub}` : ''} (${text})`;
      b.addEventListener('click', () => line !== cur && setWords(per.map((x, j) => (j === k ? line : x)), stutter));
      col.append(b);
    }
    ui.rollWords.append(col);
  });
  fitWords();
  if (l.cat === 'pad') return; // chords are never sung again
  const tools = document.createElement('div');
  tools.className = 'words-tools';
  const t = document.createElement('button');
  t.className = stutter ? 'on' : '';
  t.textContent = ot('wordsStutter');
  t.title = ot('wordsStutterTip');
  t.setAttribute('aria-pressed', String(stutter));
  t.addEventListener('click', () => setWords(per, !stutter));
  tools.append(t);
  ui.rollWords.prepend(tools);
}

// An orb's current notes as a drawing: its pattern (at the current variation, or `seed`) is built
// without playing it and read back over 4 bars. Melodic parts map notes to scale rows (a chord
// keeps all its rows); drums put a hit on each onset, at the height their speed / sample suggests.
// full: semitones (full-scale rows) instead of the nearest scale row.
function patternToRaw(l, seed = seedOf(l), full = false) {
  const v = l.voice;
  let pat;
  try {
    const js = transpiler(codeOf(l, seed).replaceAll('__DT__', '0.3'), { emitMiniLocations: false, emitWidgets: false }).output;
    pat = new Function(js)();
  } catch {
    return null;
  }
  const rootMidi = v.root ? noteToMidi(v.root) : 0;
  const degree = (midi) => (full ? semiOf(midi - rootMidi) : degreeOf(midi - rootMidi));
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
    if (!v.root) d = Math.max(0, Math.min(ROWS - 1, d));
    for (let k = 0; k < len && at + k < STEPS; k++) {
      if (v.root) raw[at + k] = stepOf([...notesAt(raw[at + k]), d]);
      else if (raw[at + k] === null || raw[at + k] < d) raw[at + k] = d;
    }
  }
  return raw;
}

// the draft sounds while the roll is open so you hear what you draw
function previewLayer() {
  if (!rollOrb) return null;
  const s = byId[draft.src];
  // a vocal orb: its words as picked (the seed they come from)
  if (s.vocal) {
    const v = draft.seed ?? seedFor(s);
    return { id: 'preview', name: ot('previewOrb'), cat: s.cat, vocal: true, code: () => codeOf(s, v) };
  }
  if (!hasNotes(draft.raw)) return null;
  return { id: 'preview', name: ot('previewOrb'), drum: s.drum, code: () => sheetCode(draft.raw, s.voice) };
}

// pats / pi: all its patterns and the one it plays (raw is that one)
function makeDrawn(src, raw, id = `drawn${++S.drawnCount}`, pats = null, pi = 0) {
  const s = byId[src];
  const ps = pats?.length ? pats.map((p) => [...p]) : [[...raw]];
  const l = {
    id, cat: id, role: s.cat, src, voice: s.voice,
    pats: ps, pi: Math.min(Math.max(0, pi | 0), ps.length - 1),
    get raw() { return this.pats[this.pi]; },
    set raw(r) { this.pats[this.pi] = r; },
    get name() { return '✎ ' + s.name; }, get kind() { return 'drawn · ' + s.kind; }, color: s.color, glow: s.glow, dark: s.dark,
    drum: s.drum, pitched: !!s.voice.root,
  };
  l.code = () => sheetCode(l.raw, l.voice);
  byId[id] = l;
  return l;
}

// The same orb can be on screen more than once (in the song, the stash, a slot and falling, all at
// the same time): each one after the first is a copy, a stand-in for its catalogue orb (`base`)
// under an id of its own, so they keep their own variations and volume and can sit in the song
// side by side. A drawn orb is copied as another drawing, a custom orb as itself.
S.copyCount = 0;
function makeCopy(base, id = `copy${++S.copyCount}`) {
  const l = Object.create(byId[base]);
  Object.defineProperties(l, { id: { value: id, enumerable: true }, base: { value: base, enumerable: true } });
  byId[id] = l;
  return l;
}
// the orb a copy stands in for (anything else: itself)
const rootOf = (id) => {
  const l = byId[id];
  return l && l.base && !Object.hasOwn(l, 'edit') && !l.raw ? l.base : id;
};
// the orb is somewhere on screen already: the song, the stems, the rain, the stash, a slot, the hand
function onScreen(id) {
  return active.has(id) || rain.some((o) => o.id === id) || stash.includes(id) || slotIds().includes(id)
    || !!S.song?.rows?.some((r) => r.id === id) || [...document.querySelectorAll('body > .orb')].some((el) => el.dataset.id === id);
}
// `id` itself while it is nowhere on screen, else a fresh copy of it (plain: no variations, default volume)
function freshOrb(id) {
  if (!onScreen(id)) return id;
  const l = byId[id];
  return (l.raw ? makeDrawn(l.src, l.raw, undefined, l.pats, l.pi) : makeCopy(rootOf(id))).id;
}

// 🎲 in the roll: the instrument's notes at a random seed; 수정 완료 keeps that seed as the
// variation on show (unless it is drawn on afterwards: then the drawing)
async function rollVariation() {
  const s = rollOrb && byId[draft.src];
  if (!s || !seeded(s)) return;
  const v = newSeed();
  if (!s.vocal) {
    const raw = patternToRaw(s, v, semiRoll());
    if (!raw) return;
    draft.raw = raw;
  }
  draft.edited = false;
  draft.seed = v;
  bump(ui.roll, 'gulp');
  renderRollHead();
  if (!S.playing) await play();
  else sync();
}

function rollGeom() {
  const w = ui.rollCanvas.clientWidth, h = ui.rollCanvas.clientHeight;
  return { w, h, cw: (w - GUTTER) / STEPS, rh: h / rollRows() };
}

// the pointer as a step and a (fractional) row, or null while the roll is still opening
function rollCell(e) {
  const r = ui.rollCanvas.getBoundingClientRect();
  const { cw, rh } = rollGeom();
  if (!rh || cw <= 0) return null;
  const x = e.clientX - r.left, y = e.clientY - r.top;
  const s = Math.min(STEPS - 1, Math.max(0, Math.floor((x - GUTTER) / cw)));
  const n = rollRows();
  const d = Math.min(n - 1, Math.max(0, n - 1 - (y / rh - 0.5)));
  return { x, y, s, d };
}

// Take the note at row r off step s (notes play exactly where they are drawn). False if there is none.
function removeAt(s, row) {
  const r = rowVal(row), own = notesAt(draft.raw[s]);
  if (!own.includes(r)) return false;
  draft.raw[s] = stepOf(own.filter((x) => x !== r));
  return true;
}

function applyStroke(e) {
  if (S.stroke.mode === 'scroll') {
    ui.rollScroll.scrollTop = S.stroke.top - (e.clientY - S.stroke.y0);
    return;
  }
  const c = rollCell(e);
  if (!c) return;
  const { x, y, s, d } = c;
  const last = S.stroke.last ?? { s, d };
  // every step the pointer crossed since the last event, interpolating the height
  const n = Math.abs(s - last.s);
  for (let k = 0; k <= n; k++) {
    const t = n ? k / n : 1;
    const at = last.s + Math.sign(s - last.s) * k, row = Math.round(last.d + (d - last.d) * t);
    if (S.stroke.mode === 'erase') draft.raw[at] = null;
    else if (S.stroke.mode === 'remove') removeAt(at, row);
    // a stroke keeps one note per step: moving up and down within a step moves that note
    else draft.raw[at] = stepOf([...notesAt(S.stroke.base[at]), rowVal(row)]);
  }
  S.stroke.last = { s, d };
  if (S.stroke.mode === 'add') S.stroke.pts.push([x, y]);
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
  // full scale on a touch screen: dragging the note names scrolls (the grid itself draws)
  if (semiRoll() && e.pointerType !== 'mouse' && c.x < GUTTER) {
    S.stroke = { mode: 'scroll', y0: e.clientY, top: ui.rollScroll.scrollTop };
    return;
  }
  // a press on a note takes it off; anywhere else adds one, even where notes already are (chords)
  const mode = e.button === 2 || e.shiftKey ? 'erase' : removeAt(c.s, Math.round(c.d)) ? 'remove' : 'add';
  S.stroke = { mode, base: [...draft.raw], pts: [], last: null };
  applyStroke(e);
});
ui.rollCanvas.addEventListener('pointermove', (e) => S.stroke && applyStroke(e));
const endStroke = async () => {
  if (!S.stroke) return;
  const scrolled = S.stroke.mode === 'scroll';
  S.stroke = null;
  if (scrolled) return;
  draft.edited = true;
  renderRollHead();
  if (!S.playing) await play();
  else sync();
};
ui.rollCanvas.addEventListener('pointerup', endStroke);
ui.rollCanvas.addEventListener('pointercancel', endStroke);

ui.rollDice.addEventListener('click', rollVariation);
// another page language: the 변주 slot's labels (✎ 단어 / ✎ 악보) and the words' readings follow
window.addEventListener('langchange', () => {
  renderSlots();
  renderRollHead();
});
ui.rollFull.addEventListener('click', () => {
  if (!rollOrb) return;
  setFullScale(!fullScale);
});
// a tucked-away roll opens again when it is clicked
ui.roll.addEventListener('pointerdown', (e) => {
  if (!document.body.classList.contains('roll-min') || e.target.closest('.roll-slot')) return;
  document.body.classList.remove('roll-min');
}, true);
// the slots went away (a phone turned into a wide screen before the guide opened them): the
// roll closes (keeping what was drawn) and the orbs in the slots go back where they came from
function leaveSlots() {
  if (slotsOn() || !slotIds().length) return;
  closeEditor();
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
// turning into a phone layout: 🎛 편집 is hidden there, so its orb goes home (what was changed is dropped)
isPhone.addEventListener('change', () => {
  const sat = isPhone.matches && slotOrbs.edit;
  if (!sat) return;
  if (orbEditing) closeOrbEdit();
  slotOrbs.edit = null;
  returnOrb(sat.id, sat.home);
  renderSlots();
  sync();
});
// 수정 완료: the roll goes down; the orb stays in the 변주 slot with what was drawn as its variation
ui.rollDone.addEventListener('click', closeEditor);
// the 변주 slot's buttons
ui.varyPrev.addEventListener('click', () => stepVar(-1));
ui.varyNext.addEventListener('click', () => stepVar(1));
ui.varyEdit.addEventListener('click', () => (rollOrb ? closeEditor() : openEditor()));
ui.varyDel.addEventListener('click', (e) => askFirst(e.currentTarget, ot('varyDelAsk'), removeVar));
// with the pointer over the 변주 slot and its buttons, its orb is heard (alone) at the variation on show
ui.varyWrap.addEventListener('mouseenter', () => varyOrb() && !rollOrb && hoverOn(varyOrb()));
ui.varyWrap.addEventListener('mouseleave', () => varyOrb() && hoverOff());

// the name of each scale row (0 = the voice's root) in the song's key
const NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
function rowName(v, d) {
  const steps = scaleSteps();
  const midi = noteToMidi(v?.root ?? 'A3') + keyShift() + Math.floor(d / 7) * 12 + steps[d % 7];
  return NAMES[midi % 12] + (d % 7 === 0 ? Math.floor(midi / 12) - 1 : '');
}
// a full-scale row (0 = an octave under the root): every name, the octave on each C
function semiName(v, r) {
  const midi = noteToMidi(v?.root ?? 'A3') + keyShift() - 12 + r;
  return NAMES[midi % 12] + (midi % 12 === 0 ? Math.floor(midi / 12) - 1 : '');
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
S.rollSig = '';
function drawRoll() {
  const dpr = lite ? 1 : window.devicePixelRatio || 1;
  // full scale: 48 rows taller than the tab, scrolled (about an octave and a half in view)
  const semi = semiRoll(), N = rollRows();
  const tall = semi ? `${Math.round(SEMIS * Math.max(14, ui.rollScroll.clientHeight / 18))}px` : '';
  if (ui.rollCanvas.style.height !== tall) ui.rollCanvas.style.height = tall;
  if (S.rollScrollDue && ui.rollScroll.clientHeight > 10) {
    S.rollScrollDue = false;
    if (semi) {
      // centre the notes (or the root's octave)
      const rs = draft.raw.flatMap((x) => notesAt(x).map(rowOf));
      const mid = rs.length ? (Math.min(...rs) + Math.max(...rs)) / 2 : 18;
      const rh0 = ui.rollCanvas.clientHeight / SEMIS;
      ui.rollScroll.scrollTop = (SEMIS - 0.5 - mid) * rh0 - ui.rollScroll.clientHeight / 2;
    } else ui.rollScroll.scrollTop = 0;
  }
  const { w, h, cw, rh } = rollGeom();
  if (w < 10 || h < 10) return;
  // with nothing drawn on it the roll only changes with its size, the playhead and the voice
  // (row labels): skip redrawing an unchanged picture
  const lp = S.playing && S.repl ? loopPos() : null;
  const head = lp != null ? Math.round((lp / BARS) * (w - GUTTER) * 2) : -1;
  const sig = draft || S.stroke ? '' : `${w}|${h}|${dpr}|${head}`;
  if (sig && sig === S.rollSig) return;
  S.rollSig = sig;
  if (ui.rollCanvas.width !== Math.round(w * dpr) || ui.rollCanvas.height !== Math.round(h * dpr)) {
    ui.rollCanvas.width = Math.round(w * dpr);
    ui.rollCanvas.height = Math.round(h * dpr);
  }
  const g = rg;
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  g.clearRect(0, 0, w, h);
  const s = draft && byId[draft.src];
  const v = s?.voice;
  const yOf = (d) => (N - 1 - rowOf(d) + 0.5) * rh;
  const { acc, fg, ink: k } = ink();
  const faint = (a) => `rgba(${k},${a})`;
  const accA = (a) => acc + Math.round(a * 255).toString(16).padStart(2, '0');

  // rows: the root (A) gets a brighter stripe; in full scale the key's notes are lighter than
  // the ones outside it, and a line marks each octave
  g.font = '10px ui-monospace, Consolas, monospace';
  g.textBaseline = 'middle';
  const steps = scaleSteps();
  for (let d = 0; d < N; d++) {
    const y = (N - 1 - d) * rh;
    const root = semi ? d % 12 === 0 : d % 7 === 0, inKey = !semi || steps.includes(d % 12);
    g.fillStyle = root ? accA(0.07) : !inKey ? faint(0.0) : semi ? faint(0.035) : d % 2 ? faint(0.015) : faint(0.035);
    g.fillRect(GUTTER, y, w - GUTTER, rh);
    if (semi && root) {
      g.fillStyle = accA(0.25);
      g.fillRect(GUTTER, y + rh - 1, w - GUTTER, 1);
    }
    g.fillStyle = root ? acc : faint(inKey ? 0.4 : 0.22);
    const label = semi ? semiName(v, d) : !v || v.root ? rowName(v, d) : d === N - 1 ? 'hi' : d === 0 ? 'lo' : '·';
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
    q.forEach((n, i) => n?.ds.forEach((d) => g.fillRect(GUTTER + i * cw + 0.5, yOf(d) - rh / 2 + 1, cw - 1, rh - 2)));
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
  if (S.stroke?.pts?.length > 1) neon(g, S.stroke.pts, fg, 0.5);
  if (pos >= 0) {
    g.fillStyle = faint(0.55);
    g.fillRect(GUTTER + pos * (w - GUTTER), 0, 1.5, h);
  }
}

export {
  closeTab, drawRoll, freshOrb, leaveSlots, makeCopy, makeDrawn, onScreen, patternToRaw, previewLayer,
  putInSlot, renderRollHead, renderSlots, rootOf,
};
