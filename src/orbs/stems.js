// The full song (stem mode): sections, cells, strength and fades.
// Split out of orbs.js; the files load in a chain (each imports the one before it first), so they run in the
// same order as the one file did. See orbs/state.js.
import { updateShareButtons, wavStemBtn } from './share.js';
import { rng, byId, role } from '../orbCatalog.js';
import { BARS, VAR_MAX } from '../orbPreset.js';
import { ot, secName } from '../orbsI18n.js';
import { isPhone } from '../phoneLayout.js';
import { LIMITS } from '../../server/presetSchema.mjs';
import { $, S, active, ensureVars, orbVars, ui, varCount, varNum, varPlay, varSeed } from './state.js';
import { saveSessionSoon } from './presets.js';
import {
  keyText, layers, lineFor, nextPhrase, nowCycle, play, seeded, sync, syncSoon,
} from './audio.js';
import { tutEvent } from './guide.js';
import { tour } from '../tutorial.js';
import { ctint, customTags, orbInner, paint, roleText } from './list.js';
import { dropVarCells, newSeedVar } from './variations.js';

// ---------- full song ----------
// The current set becomes the centre of a whole track: an intro and build-up lead into it,
// then a break and a second drop in a new key (with a different variation), and an outro back home.

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
  const r = rng(S.song.seed);
  const base = layers().filter((l) => l.code);
  // only the orbs in the set play: the later sections change by key and variation, never by
  // bringing in an orb that wasn't added (songs saved with swapped-in rows still load as they were)
  const swapped = base;
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
// into sections), and in every block whether the instrument plays there, which of the orb's
// variations (변주 slot: 01, 02 …) it plays (k), and for an orb without variations how strong
// it plays (lv, -2 … +2 like 약하게 / 세게) and whether it fades in or out (fade). The stem
// panel shows it; the song is built from it. Drawn (user-edited) rows are labelled C01 ….
//
// Rolled by the stems, by role:
//   lead · arp · bass   change variation only between sections: the drops and the rest play the
//                       orb's own (the one it plays), 드롭 2 another, break / bridge a third; a lead
//                       also takes turns with another one block by block in the drops. Variations
//                       made in the 변주 slot come first; at most two more are made for it.
//   drums               keep their variation, with a ★ fill on each section's last block
//   the rest            keep their variation
//   no seed (fixed)     a little softer in the intro / break / bridge / outro, fading in at the
//                       song's start and out at its end
const BLOCK = 4;
// a section is any whole number of bars: one block per started 4, the last one maybe shorter
const blocksIn = (sec) => Math.ceil(sec.len / BLOCK);
const blockBars = (sec, j) => Math.min(BLOCK, sec.len - j * BLOCK);
const isLead = (l) => role(l) === 'lead';
const newSeed = () => 1 + Math.floor(Math.random() * 9999);
const VARIED_ROLES = ['lead', 'arp', 'bass'];
const DRUMS = ['kick', 'snare', 'hat', 'perc', 'combo'];
const varied = (l) => seeded(l) && VARIED_ROLES.includes(role(l));
// an orb that has nothing to switch between in the stems: it gets strength and fades instead
// (drums, fx … change with the seed: they are variation orbs too, even with only 01 so far)
const noVars = (l) => !l.raw && !seeded(l) && varCount(l.id) <= 1;
const secKind = (sec) => sec.name.split(' ')[0];
const secNum = (sec) => +(sec.name.split(' ')[1] ?? 1) || 1;
// the variations the stems may use besides the one the orb plays: its own from the 변주 slot
// first, then up to two made for it (kept in its list, so rolling the song again reuses them)
function altVars(l, n) {
  const st = ensureVars(l.id), out = [];
  st.list.forEach((x, i) => i !== st.vi && !x.auto && out.length < n && out.push(i));
  for (let a = 1; out.length < n && a <= 2; a++) {
    const key = `a${a}`;
    let i = st.list.findIndex((x) => x.auto === key);
    if (i < 0) {
      if (st.list.length >= VAR_MAX) break;
      st.list.push({ seed: varSeed(l, st.vi) + a * 100, auto: key });
      i = st.list.length - 1;
    }
    if (i !== st.vi) out.push(i);
  }
  return out;
}
// the variation of block j of section sec
function blockVar(l, sec, j) {
  const vi = orbVars.get(l.id)?.vi ?? 0;
  if (!varied(l)) return vi;
  const kind = secKind(sec), alt = altVars(l, 2);
  let k = vi;
  if (kind === '드롭' && secNum(sec) >= 2) k = alt[0] ?? vi;
  else if (kind === '브레이크' || kind === '브리지') k = alt[1] ?? alt[0] ?? vi;
  if (isLead(l) && kind === '드롭' && j % 2) k = k === vi ? alt[0] ?? vi : vi;
  return k;
}
// the rest of an auto block: a drum fill on a section's last block, strength and fades for an
// orb without variations
function blockFx(l, i, j) {
  const secs = S.song.sections, sec = secs[i], kind = secKind(sec), last = j === blocksIn(sec) - 1;
  // (an orb without variations takes strength and fades instead of a fill)
  const out = { fill: DRUMS.includes(role(l)) && last && kind !== '아웃트로' && i < secs.length - 1 && !!fillFx(l) && !noVars(l) };
  if (noVars(l)) {
    const g = ['인트로', '브레이크', '브리지', '아웃트로'].includes(kind) ? 80 : 100;
    if (g !== 100) out.g0 = g;
    // the song's first block fades in from silence, its last one out to silence
    if (i === 0 && j === 0) Object.assign(out, { g0: 0, g1: g });
    else if (i === secs.length - 1 && last) out.g1 = 0;
  }
  return out;
}
function cellsFor(l, on) {
  if (l.spot) return spotCells(l);
  return S.song.sections.map((sec, i) => Array.from({ length: blocksIn(sec) }, (_, j) => {
    const c = { on: on(sec, i), k: blockVar(l, sec, j) };
    return { ...c, ...blockFx(l, i, j), ...(c.on ? {} : { fill: false }) };
  }));
}

// ---------- strength and fades (stem cells of orbs without variations) ----------
// A block plays at a strength from its start (g0) to its end (g1), in percent of how the orb
// plays (0 silent … 150); without its own end it stays at its start. Between the two the
// strength follows a curve (cv): l linear, q quadratic (slow start), e eased (fast start), s an S.
const G_MAX = 150;
const CURVES = ['l', 'q', 'e', 's'];
const curveOf = (cell) => (CURVES.includes(cell.cv) ? cell.cv : 'l');
const gStart = (cell) => cell.g0 ?? 100;
const gEnd = (cell) => cell.g1 ?? gStart(cell);
// the curve at t (0 … 1), for drawing it
const curveAt = (cv, t) => ({ l: t, q: t * t, e: 1 - (1 - t) * (1 - t), s: t * t * (3 - 2 * t) })[cv];
// the block's gain: null (as is), a factor, or a ramp as Strudel code
function blockGain(cell, bars) {
  const a = gStart(cell) / 100, b = gEnd(cell) / 100;
  if (Math.abs(a - b) < 1e-6) return Math.abs(a - 1) < 1e-6 ? null : a;
  // t: 0 → 1 over the block (the line is shifted so the block starts on a 4-bar boundary)
  const t = bars === BLOCK ? 'saw.slow(4)' : `saw.slow(4).mul(${+(BLOCK / bars).toFixed(4)})`;
  const u = `${t}.mul(-1).add(1)`;
  const f = { l: t, q: `${t}.mul(${t})`, e: `${u}.mul(${u}).mul(-1).add(1)`, s: `${t}.mul(${t}).mul(${t}.mul(-2).add(3))` }[curveOf(cell)];
  return `${f}.mul(${+(b - a).toFixed(3)}).add(${+a.toFixed(3)})`;
}
// A block FX (spot orb) plays in one block only: a hit or down-sweep on the drop's first block,
// a reversed sound or up-sweep on the build-up's last block, leading into the drop. Without
// those sections it takes the first block after the intro (or the song's first block).
function spotCells(l) {
  const secs = S.song.sections;
  const drop = secs.findIndex((s) => s.name === '드롭');
  const build = secs.findIndex((s) => s.name === '빌드업');
  let at, block;
  if (l.spot === 'end' && build >= 0) [at, block] = [build, blocksIn(secs[build]) - 1];
  else if (drop >= 0) [at, block] = [drop, 0];
  else [at, block] = [Math.min(1, secs.length - 1), 0];
  return secs.map((sec, i) => Array.from({ length: blocksIn(sec) }, (_, j) => ({ on: i === at && j === block, k: blockVar(l, sec, j) })));
}
function buildGrid() {
  const plan = songPlan();
  const rows = [];
  for (const sec of plan) for (const l of sec.layers) if (!rows.includes(l.id)) rows.push(l.id);
  // variations the stems made before (per section, `s…`) that the orb doesn't play go
  for (const id of rows) {
    const st = orbVars.get(id);
    for (let k = (st?.list.length ?? 0) - 1; k > 0; k--) {
      if (k === st.vi || !/^s\d/.test(st.list[k].auto ?? '')) continue;
      st.list.splice(k, 1);
      dropVarCells(id, k);
      if (st.vi > k) st.vi--;
    }
  }
  S.song.sections = plan.map(({ name, len, shift, v }) => ({ name, len, shift, v }));
  S.song.rows = rows.map((id) => ({ id, alt: !active.has(id) }));
  S.song.cells = Object.fromEntries(rows.map((id) => [id, cellsFor(byId[id], (sec, i) => plan[i].layers.some((l) => l.id === id))]));
  S.song.audition = null;
}

// keep the grid in step with the song's orbs: a new orb gets a row playing everywhere, a removed one loses its row
function syncRows() {
  for (const l of layers()) {
    if (!l.code || S.song.cells[l.id]) continue;
    S.song.rows.push({ id: l.id, alt: false });
    S.song.cells[l.id] = cellsFor(l, () => true);
  }
  S.song.rows = S.song.rows.filter((r) => r.alt || active.has(r.id));
  for (const id of Object.keys(S.song.cells)) if (!S.song.rows.some((r) => r.id === id)) delete S.song.cells[id];
}

function songLines() {
  syncRows();
  const secs = (S.songPlanCache = S.song.sections);
  const total = secs.reduce((sum, x) => sum + x.len, 0);
  // a double-clicked section head loops just that section
  const aud = !S.offline && S.song.audition != null ? S.song.audition : null;
  // after a jump the song stays silent until it starts (see playFromBar)
  const from = !S.offline && S.song.from != null ? `, ${S.song.from}` : '';
  const out = [];
  for (const r of S.song.rows) {
    const l = byId[r.id];
    if (!l) continue;
    // a muted row (click on its head) stays out while listening; the WAV keeps every part
    if (r.mute && !S.offline) continue;
    let o = 0;
    secs.forEach((sec, i) => {
      const blocks = S.song.cells[r.id][i], base = aud === null ? o : 0;
      o += sec.len;
      if (aud !== null && aud !== i) return;
      // neighbouring blocks with the same variation and strength play as one line (a ★ block ends
      // its line, a fading block is a line of its own)
      const same = (a, b) => a.on === b.on && a.k === b.k && gStart(a) === gStart(b) && a.g1 == null && b.g1 == null;
      for (let j = 0, k; j < blocks.length; j = k) {
        for (k = j + 1; k < blocks.length && !blocks[k - 1].fill && same(blocks[k], blocks[j]); k++);
        if (!blocks[j].on) continue;
        // same test as the key orbs use, so fx / texture orbs that play notes move with the section too
        const v = varPlay(l, blocks[j].k);
        // the patterns loop every 4 bars on the clock: shifted so each run starts on its first bar
        // (a section of odd length, or a song started off the bar grid after a jump)
        const ph = ((((S.song.s0 + base + j * BLOCK) % BLOCK) + BLOCK) % BLOCK);
        const late = ph > 1e-6 ? `\n  .late(${+ph.toFixed(4)})` : '';
        const part = (a, b) => `${late}\n  .songPart(${S.song.s0}, ${aud === null ? total : sec.len}, ${base + a}, ${base + b}${from})`;
        const end = Math.min(k * BLOCK, sec.len), fx = blocks[k - 1].fill && fillFx(l);
        const gain = blockGain(blocks[j], blockBars(sec, j));
        // the section's own key shift goes on top of the key orb's (lineFor moves the line by both)
        const line = lineFor(l, v, '', { gain, shift: sec.shift });
        if (line) out.push(line + part(j * BLOCK, fx ? end - 1 : end));
        // ★: the run's last bar plays as a fill
        const fill = fx && lineFor(l, v, fx, { gain, shift: sec.shift });
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

S.stemSig = '';
function renderSong() {
  const sig = JSON.stringify([S.song.sections, S.song.rows, S.song.cells, S.song.rows.map((r) => varCount(r.id)), S.song.audition, keyText(), ot('corner')]);
  if (sig === S.stemSig) return;
  S.stemSig = sig;
  renderStem();
  saveSessionSoon(); // a stem edit is kept even if the page closes with the stems open
}

// Section i becomes `len` bars long (1-64), growing or shrinking at its end. Its blocks follow:
// one per started 4 bars (the last may be shorter), a new one plays like the one before it.
function setSectionLen(i, len) {
  const sec = S.song.sections[i];
  len = Math.max(1, Math.min(LIMITS.sectionBlocks * BLOCK, len));
  if (len === sec.len) return false;
  sec.len = len;
  const n = blocksIn(sec);
  for (const r of S.song.rows) {
    const blocks = S.song.cells[r.id][i];
    while (blocks.length > n) blocks.pop();
    while (blocks.length < n) {
      const last = blocks.at(-1);
      blocks.push({ on: last.on, k: last.k ?? 0, fill: false, ...(last.g0 != null || last.g1 != null ? { g0: gEnd(last) } : {}) });
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
  gripDrag = { i, x: e.clientX, len: S.song.sections[i].len, bar: (h.getBoundingClientRect().width + 2) / S.song.sections[i].len };
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
  const secs = S.song.sections;
  if (secs.length < 2) return;
  secs.splice(i, 1);
  for (const r of S.song.rows) S.song.cells[r.id].splice(i, 1);
  if (S.song.audition === i) S.song.audition = null;
  else if (S.song.audition > i) S.song.audition--;
  sync();
}

// ＋ on a section head: a new section of `kind` right after section i, in its key, laid out the
// way the song plan lays that kind out (whatever section i had playing): of the song's orbs, the
// ones the kind wants (all of them if none fit), with the kind's variations, fills and strength.
// The orbs are the set section i comes from: the song's own, or with the stems' swapped-in
// alternates (rows marked alt) once the song has moved on to them (break, drop 2, bridge).
// A block FX stays out.
function insertSection(i, kind) {
  const secs = S.song.sections, prev = secs[i];
  const { len, keep } = SECTION_KINDS[kind];
  const same = secs.filter((s) => s.name.split(' ')[0] === kind).length;
  const sec = { name: same ? `${kind} ${same + 1}` : kind, len, shift: prev.shift ?? 0, v: prev.v ?? 0 };
  const rows = S.song.rows.filter((r) => byId[r.id] && !byId[r.id].spot);
  const alts = rows.filter((r) => r.alt);
  const swapped = alts.length && (prev.v > 0 || alts.some((r) => S.song.cells[r.id][i].some((c) => c.on)));
  // in the swapped set an alternate stands in for the song's orb of its kind
  const from = swapped ? rows.filter((r) => r.alt || !alts.some((a) => byId[a.id].cat === byId[r.id].cat)) : rows.filter((r) => !r.alt);
  const kept = from.filter((r) => keep(byId[r.id]));
  const on = new Set((kept.length ? kept : from).map((r) => r.id));
  secs.splice(i + 1, 0, sec);
  for (const r of S.song.rows) {
    const l = byId[r.id];
    S.song.cells[r.id].splice(i + 1, 0, Array.from({ length: blocksIn(sec) }, (_, j) => {
      const c = { on: on.has(r.id), k: l ? blockVar(l, sec, j) : 0, ...(l ? blockFx(l, i + 1, j) : {}) };
      if (!c.on) c.fill = false;
      return c;
    }));
  }
  if (S.song.audition > i) S.song.audition++;
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
  return S.song.sections.find((s) => s.shift)?.shift ?? S.song.sub ?? rng(S.song.seed ?? 0).pick([2, 3, 5, -2]);
}
function toggleSub(i) {
  const sec = S.song.sections[i];
  if (sec.shift) {
    S.song.sub = sec.shift;
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
  const secs = S.song.sections, grid = ui.stemGrid;
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
    h.className = 'sh' + (S.song.audition === i ? ' aud' : '') + (sec.shift ? ' mod' : '') + (sec.len < 8 ? ' narrow' : '') + (sec.len < 4 ? ' tiny' : '');
    h.style.gridColumn = `span ${sec.len}`;
    h.title = ot('secTip');
    sectionClicks(h, i);
    const bars = document.createElement('small');
    bars.className = 'bars';
    bars.textContent = ot('bars', { n: sec.len });
    const name = document.createElement('span');
    name.className = 'sname';
    name.textContent = (S.song.audition === i ? '🔁 ' : '') + (sec.shift ? `${secName(sec.name)} · ${keyName(sec.shift)}` : secName(sec.name));
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
  for (const r of S.song.rows) {
    const l = byId[r.id];
    if (!l) continue;
    const custom = l.raw ? tags.get(r.id) ?? 'C' : null;
    const head = document.createElement('div');
    head.className = 'rh' + (r.alt ? ' alt' : '') + (r.mute ? ' muted' : ''); // .rh starts a new grid row (column 1)
    rowClicks(head, r);
    head.style.setProperty('--g', ctint(l));
    const tag = document.createElement('b');
    tag.textContent = roleText(role(l));
    const name = document.createElement('span');
    name.textContent = l.name;
    head.append(miniOrb(l), tag, name);
    head.title = `${r.alt ? `${l.name} — ${ot('altRow')}` : l.name}\n${ot('rowMuteTip')}`;
    grid.append(head);
    S.song.cells[r.id].forEach((blocks, i) => blocks.forEach((cell, j) => {
      const c = document.createElement('div');
      c.className = 'cell' + (cell.on ? ' on' : '') + (S.song.audition === i ? ' aud' : '') + (j === 0 ? ' first' : '') + (r.mute ? ' muted' : '');
      c.style.gridColumn = `span ${blockBars(secs[i], j)}`;
      c.style.setProperty('--g', ctint(l));
      c.title = ot(cell.on ? 'cellOff' : 'cellOn');
      if (cell.on) {
        // ◀ 01 ▶: the orb's variation here (switched between those in its list) · ★ fill · ✕ out
        // ▶ past the last one makes a new variation (an orb that changes with the seed)
        const n = varCount(r.id), k0 = cell.k ?? 0, grows = seeded(l) && k0 === n - 1 && n < VAR_MAX;
        const many = !custom && (n > 1 || seeded(l));
        if (blockBars(secs[i], j) < BLOCK) c.classList.add('short');
        const turn = (d) => (e) => {
          e.stopPropagation();
          if (d > 0 && grows) cell.k = newSeedVar(r.id) ?? 0;
          else cell.k = (k0 + d + n) % n;
          sync();
        };
        const prev = button('ghost cvar', '◀', ot('cellVarPrev'), turn(-1));
        const next = button('ghost cvar', '▶', ot(grows ? 'varyNew' : 'cellVarNext'), turn(1));
        if (n < 2) prev.disabled = true;
        const num = document.createElement('span');
        num.className = 'cnum';
        num.textContent = custom ?? varNum(cell.k ?? 0);
        num.title = ot(custom ? 'customInst' : 'cellVarTip');
        if (!many) prev.style.visibility = next.style.visibility = 'hidden';
        const x = button('ghost cellx', '✕', ot('cellDel'), (e) => {
          e.stopPropagation();
          cell.on = false;
          cell.fill = false;
          sync();
        });
        const tools = document.createElement('span');
        tools.className = 'celltools';
        if (fillFx(l)) {
          tools.append(button('ghost cellfill' + (cell.fill ? ' on' : ''), '★', ot(cell.fill ? 'cellFillOff' : 'cellFill'), (e) => {
            e.stopPropagation();
            cell.fill = !cell.fill;
            sync();
          }));
        }
        tools.append(x);
        // an orb without variations: its strength over the block instead (no fill)
        if (!custom && noVars(l)) rampCell(c, cell, x);
        else {
          const pick = document.createElement('span');
          pick.className = 'cvars';
          pick.append(prev, num, next);
          c.append(pick, tools);
        }
      }
      c.dataset.row = r.id;
      if (!cell.on) c.addEventListener('pointerdown', (e) => brushDown(e, r.id, cell));
      c.addEventListener('click', () => {
        if (brushClick) return; // the end of a drag across empty cells: they are on already
        cell.on = !cell.on;
        if (!cell.on) cell.fill = false;
        sync();
      });
      c.cellRef = cell;
      grid.append(c);
    }));
  }
}

// A press on an empty cell and a drag along its row: every empty cell of that instrument the
// drag spans is put in (a press without a drag is a plain click). The grid is redrawn as
// it goes; the cells under the mouse are found by their row id.
let brush = null, brushClick = false;
function brushDown(e, rowId, cell) {
  if (e.button > 0 || e.target.closest('button')) return;
  e.preventDefault(); // no text selection while dragging
  brush = { rowId, start: cell, x: e.clientX, y: e.clientY, moved: false };
}
addEventListener('pointermove', (e) => {
  if (!brush) return;
  if (!brush.moved && Math.hypot(e.clientX - brush.x, e.clientY - brush.y) < 4) return;
  brush.moved = true;
  // every cell between the one pressed and the one under the mouse (a quick drag skips none)
  const el = document.elementFromPoint(e.clientX, e.clientY)?.closest('.stem-grid .cell');
  const row = S.song?.cells[brush.rowId]?.flat() ?? [];
  const a = row.indexOf(brush.start), b = el?.dataset.row === brush.rowId ? row.indexOf(el.cellRef) : -1;
  const cells = b < 0 ? [brush.start] : row.slice(Math.min(a, b), Math.max(a, b) + 1);
  let changed = false;
  for (const c of cells) {
    if (c.on) continue;
    c.on = true;
    changed = true;
  }
  if (changed) {
    renderSong();
    syncSoon();
  }
});
addEventListener('pointerup', () => {
  if (!brush) return;
  const moved = brush.moved;
  brush = null;
  if (!moved) return;
  // the click that follows the drag (on the cell it started on) must not take it out again
  brushClick = true;
  setTimeout(() => (brushClick = false), 0);
  sync();
});

// The block of an orb without variations: | start ⌁ shape …… ✕ end |. The two edges are drag
// handles (up = stronger, down = softer) for the strength at its start and end; the end follows
// the start until it is dragged itself. A line across the block draws the strength, darker above.
function rampCell(c, cell, x) {
  c.classList.add('ramp');
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 100 100');
  svg.setAttribute('preserveAspectRatio', 'none');
  svg.setAttribute('class', 'cramp');
  const start = rampHandle(cell, 'g0', () => draw());
  const end = rampHandle(cell, 'g1', () => draw());
  const shape = button('ghost cshape', '', ot('rampShapeTip', { shape: ot('fadeShape_' + curveOf(cell)) }), (e) => {
    e.stopPropagation();
    openShapeMenu(e.currentTarget, cell);
  });
  shape.append(curveIcon(curveOf(cell)));
  const gap = document.createElement('span');
  gap.className = 'cgap';
  function draw() {
    const y = (g) => 100 - (g / G_MAX) * 100;
    const pts = Array.from({ length: 21 }, (_, i) => {
      const t = i / 20;
      return `${t * 100},${y(gStart(cell) + (gEnd(cell) - gStart(cell)) * curveAt(curveOf(cell), t)).toFixed(2)}`;
    });
    svg.innerHTML = `<polygon class="shade" points="0,0 ${pts.join(' ')} 100,0" /><polyline points="${pts.join(' ')}" vector-effect="non-scaling-stroke" />`;
    for (const [h, g] of [[start, gStart(cell)], [end, gEnd(cell)]]) h.style.setProperty('--y', `${y(g)}%`);
    start.title = ot('rampStartTip', { n: gStart(cell) });
    end.title = ot(cell.g1 == null ? 'rampEndFollowTip' : 'rampEndTip', { n: gEnd(cell) });
    end.classList.toggle('follow', cell.g1 == null);
  }
  draw();
  c.append(svg, start, shape, gap, x, end);
}
// a drag handle on a block's edge: key 'g0' (start) or 'g1' (end). A click on the end (no drag)
// makes it follow the start again; a double click on the start puts it back to 100%
function rampHandle(cell, key, redraw) {
  const h = document.createElement('span');
  h.className = 'ghandle ' + (key === 'g0' ? 'gstart' : 'gend');
  h.innerHTML = '<i></i>';
  h.addEventListener('click', (e) => e.stopPropagation());
  h.addEventListener('dblclick', (e) => {
    e.stopPropagation();
    delete cell[key];
    sync();
  });
  h.addEventListener('pointerdown', (e) => {
    if (e.button > 0) return;
    e.preventDefault();
    e.stopPropagation();
    h.setPointerCapture(e.pointerId);
    const y0 = e.clientY, v0 = key === 'g0' ? gStart(cell) : gEnd(cell);
    let moved = false;
    h.classList.add('drag');
    const move = (ev) => {
      if (!moved && Math.abs(ev.clientY - y0) < 3) return;
      moved = true;
      // 2% per pixel, in steps of 5
      cell[key] = Math.max(0, Math.min(G_MAX, Math.round((v0 - (ev.clientY - y0) * 2) / 5) * 5));
      redraw();
    };
    const up = () => {
      h.removeEventListener('pointermove', move);
      h.removeEventListener('pointerup', up);
      h.removeEventListener('pointercancel', up);
      h.classList.remove('drag');
      // a click on the end (no drag): it follows the start again
      if (!moved && key === 'g1') delete cell.g1;
      if (key === 'g0' && cell.g0 === 100) delete cell.g0;
      sync();
    };
    h.addEventListener('pointermove', move);
    h.addEventListener('pointerup', up);
    h.addEventListener('pointercancel', up);
  });
  return h;
}
// a small list under the shape button: the four curves, and the end back to following the start
const shapeMenu = document.createElement('div');
shapeMenu.className = 'fade-menu';
document.body.append(shapeMenu);
function openShapeMenu(anchor, cell) {
  shapeMenu.innerHTML = '';
  const item = (label, on, run) => {
    const b = button('ghost' + (on ? ' on' : ''), label, '', (e) => {
      e.stopPropagation();
      run();
      shapeMenu.classList.remove('open');
      sync();
    });
    shapeMenu.append(b);
    return b;
  };
  for (const cv of CURVES) {
    item(ot('fadeShape_' + cv), curveOf(cell) === cv, () => {
      if (cv === 'l') delete cell.cv;
      else cell.cv = cv;
    }).prepend(curveIcon(cv));
  }
  if (cell.g1 != null) item(ot('rampFollow'), false, () => delete cell.g1);
  const r = anchor.getBoundingClientRect();
  shapeMenu.classList.add('open');
  shapeMenu.style.left = `${Math.min(innerWidth - shapeMenu.offsetWidth - 8, Math.max(8, r.left))}px`;
  shapeMenu.style.top = `${Math.min(innerHeight - shapeMenu.offsetHeight - 8, r.bottom + 4)}px`;
}
// a tiny drawing of a curve, rising
function curveIcon(cv) {
  const pts = Array.from({ length: 13 }, (_, i) => `${((i / 12) * 22 + 1).toFixed(1)},${(13 - curveAt(cv, i / 12) * 12).toFixed(1)}`);
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 14');
  svg.setAttribute('class', 'fade-curve');
  svg.innerHTML = `<polyline points="${pts.join(' ')}" />`;
  return svg;
}
document.addEventListener('pointerdown', (e) => {
  if (!e.target.closest('.fade-menu, .cshape')) shapeMenu.classList.remove('open');
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
    const n = blocksIn(S.song.sections[i]);
    const j = Math.max(0, Math.min(n - 1, Math.floor(((e.clientX - r.left) / r.width) * n)));
    secClickTimer = setTimeout(() => playFrom(i, j), DBL_MS);
  });
}
// A row head (the instrument on the left): a click mutes / unmutes it, a double-click keeps only
// it playing (or, if it already is the only one, brings every part back). The click waits like a
// section head's, so a double-click doesn't mute first.
let rowClickTimer = 0;
function rowClicks(head, r) {
  head.addEventListener('click', (e) => {
    if (e.target.closest('button')) return; // →#
    clearTimeout(rowClickTimer);
    if (e.detail >= 2) {
      const solo = S.song.rows.every((x) => !x.mute === (x === r));
      for (const x of S.song.rows) x.mute = !solo && x !== r;
      sync();
      return;
    }
    rowClickTimer = setTimeout(() => {
      r.mute = !r.mute;
      sync();
    }, DBL_MS);
  });
}

// the whole song from block j of section i
async function playFrom(i, j) {
  if (!S.song?.sections) return;
  await playFromBar(S.song.sections.slice(0, i).reduce((sum, x) => sum + x.len, 0) + j * BLOCK);
}
// A jump into the song waits one bar from the next beat: silent, with the stems counting in
// (grey cursor, 4 · 3 · 2 · 1). The song then starts off the bar grid, so songLines shifts its
// patterns to match (.late).
const countIn = () => Math.ceil((nowCycle() + 0.05) * 4) / 4 + 1;
// the whole song from bar `off` (0-based, counted through the song)
async function playFromBar(off) {
  if (!S.song?.sections) return;
  S.song.audition = null;
  if (!S.playing) await play();
  S.song.from = countIn();
  S.song.s0 = S.song.from - off;
  await sync();
}
// section i on repeat, from its start (counted in the same way)
async function loopSection(i) {
  if (!S.song?.sections) return;
  S.song.audition = i;
  if (!S.playing) await play();
  S.song.from = countIn();
  S.song.s0 = S.song.from - S.song.sections[i].len;
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
  if (document.body.classList.contains('stem-open') && !isPhone.matches) $('stemHelp').before(...stemTools);
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
  if (S.song?.sections) S.lastSong = S.song; // kept for 📂 스템 열기
  S.song = null;
  S.songPlanCache = null;
  S.stemSig = '';
  document.body.classList.remove('stem-open');
  ui.song.classList.remove('on');
  stemToolsPlace();
  updateShareButtons();
  for (const a of active.values()) a.at = 0;
  sync();
  saveSessionSoon();
}

// a new song around the current set (📂 스템 열기 the first time, 🎲 곡 구성 랜덤화 after), or with
// `again` the stems closed last, back as they were left
async function startSong(again) {
  if (!layers().some((l) => l.code)) {
    ui.soloHint.textContent = ot('addOrbsFirst');
    return;
  }
  const was = S.playing;
  if (!S.playing) await play();
  const s0 = was ? nextPhrase() : 0;
  if (again) S.song = { ...S.lastSong, s0, audition: null, from: null };
  else {
    S.song = { seed: Math.floor(Math.random() * 1e9), s0 };
    buildGrid();
  }
  S.stemSig = '';
  openSong();
  await sync();
}
ui.songBtn.addEventListener('click', () => askFirst(ui.songBtn, ot('otherSongAsk'), () => startSong(false)));
$('stemReopen').addEventListener('click', () => !S.song && startSong(!!S.lastSong));
$('songOff').addEventListener('click', closeSong);
$('stemClose').addEventListener('click', closeSong);
// ? beside ↩ 루프 모드로: a tour of stem mode, pointing at each part in turn (tutorial.js tour).
// Parts not on screen (no fill-able or strength-only orb in the song, say) are passed over.
const grid1 = (sel) => () => ui.stemGrid.querySelector(sel);
const STEM_TOUR = [
  ['Intro', () => $('stemBody')],
  ['Section', grid1('.sh')],
  ['Bars', () => [...ui.stemGrid.querySelectorAll('.barnum')].slice(0, 8)],
  ['Grip', grid1('.sh .grip')],
  ['SecTools', () => [...(ui.stemGrid.querySelector('.sh')?.querySelectorAll('.secsub, .secadd, .secdel') ?? [])]],
  ['Row', grid1('.rh')],
  ['Cell', grid1('.cell.on')],
  ['Vars', () => [...ui.stemGrid.querySelectorAll('.cvars')].find((v) => v.firstChild?.style.visibility !== 'hidden')],
  ['Fill', grid1('.cellfill')],
  ['Ramp', grid1('.cell.ramp')],
  ['Random', () => ui.songBtn],
  ['Save', () => stemTools],
  ['Close', () => $('stemClose')],
];
$('stemHelp').addEventListener('click', () => tour(
  STEM_TOUR.map(([k, target]) => ({ target, title: ot('stemTour' + k), text: ot('stemTour' + k + 'Text') })),
  { prev: ot('tourPrev'), next: ot('tourNext'), done: ot('tourDone'), close: ot('tourClose') },
));

// where the song is now: the section and how far into it (a looped section counts on its own)
// Where in its 4-bar loop the music is now (0 to BARS), for the backdrop's sweep and the edit
// roll's playhead. In a song that is counted from the start of the 4-bar block playing (blocks
// start every 4 bars from their section's start, as songLines shifts the patterns), so a jump
// to bar 10 shows bar 2 of its block. null while a jump counts in: nothing moves until it starts.
function loopPos(now = nowCycle()) {
  const abs = ((now % BARS) + BARS) % BARS;
  if (!S.song?.sections) return abs;
  if (S.song.from != null && now < S.song.from) return null;
  const t = now - S.song.s0;
  if (t < 0) return abs; // the loop still playing until a new song comes in
  const secs = S.song.sections;
  let q; // bars into the section playing
  if (S.song.audition != null) q = t % secs[S.song.audition].len;
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
  const secs = S.song.sections, total = secs.reduce((sum, x) => sum + x.len, 0);
  if (t < S.song.s0) return { idx: S.song.audition ?? 0, frac: 0, total };
  if (S.song.audition != null) return { idx: S.song.audition, frac: ((t - S.song.s0) % secs[S.song.audition].len) / secs[S.song.audition].len, total };
  const p = (t - S.song.s0) % total;
  let o = 0;
  for (let i = 0; i < secs.length; i++) {
    if (p < o + secs[i].len) return { idx: i, frac: (p - o) / secs[i].len, total };
    o += secs[i].len;
  }
  return { idx: -1, frac: 0, total };
}

function updateSongCursor() {
  const body = $('stemBody'), count = $('stemCount');
  if (!S.song?.sections || !S.playing) {
    body.classList.remove('waiting');
    count.textContent = '';
    return;
  }
  // after a jump: held grey on where it will start, counting the beats down until it does
  const now = nowCycle(), wait = S.song.from != null && now < S.song.from;
  body.classList.toggle('waiting', wait);
  const left = wait ? Math.max(1, Math.min(4, Math.ceil((S.song.from - now) * 4 - 1e-6))) : 0; // beats
  if (count.textContent !== String(left || '')) {
    count.textContent = left || '';
    // each new number pops in again
    count.classList.remove('tick');
    void count.offsetWidth;
    if (left) count.classList.add('tick');
  }
  const { idx, frac } = songPosition(wait ? S.song.from : now);
  // how far each section has played: the one playing fills up, the ones before it are full
  // (a looped section counts on its own, so the others stay empty)
  const done = (i) => (i === idx ? frac : S.song.audition == null && idx >= 0 && i < idx ? 1 : 0);
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

export {
  askFirst, blockVar, closeSong, loopPos, miniOrb, newSeed, openSong, renderSong, songLines, syncRows,
  updateSongCursor,
};
