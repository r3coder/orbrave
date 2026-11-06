// The status line, the list of the song's orbs under the player, solo, and orb colours.
// Split out of orbs.js; the files load in a chain (each imports the one before it first), so they run in the
// same order as the one file did. See orbs/state.js.
import { checkFirstOrb, countMove } from './guide.js';
import { BASE_BPM, rng, hash, byId, role, keyLabel } from '../orbCatalog.js';
import { tone } from '../theme.js';
import { ot } from '../orbsI18n.js';
import { isPhone } from '../phoneLayout.js';
import { S, active, heldSeed, ownSeed, ui, varOf, volStep } from './state.js';
import { bpm, hoverOrb, keyMode, keyText, layers, put, removeLayer, sync, syncSoon } from './audio.js';
import { slotTag } from './field.js';
import { grabFromSong } from './drag.js';
import { blockVar } from './stems.js';

// ---------- status, list, solo ----------

function renderStatus() {
  document.body.classList.toggle('has-orbs', active.size > 0);
  checkFirstOrb();
  const key = S.song ? '' : ` · ${keyText()} (${ot(keyMode())})`;
  ui.status.innerHTML = active.size
    ? `${bpm()} BPM${key}`
    : S.playing
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
        undo.title = ot('revertDrawn', { v: S.variation });
        undo.addEventListener('click', (e) => {
          e.stopPropagation();
          revertDrawn(l.id);
        });
        strip.append(num, undo);
      }
      // an orb's own seed (from the 변주 slot) isn't shown on its strip: the 변주 slot handles it
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
  const cells = S.song?.cells?.[id];
  removeLayer(id, { silent: true });
  put(src, 0, a.home);
  // keep the strip where it was
  const all = new Map(active);
  active.clear();
  for (const k of order) if (all.has(k)) active.set(k, all.get(k));
  for (const [k, v] of all) if (!active.has(k)) active.set(k, v);
  if (cells && !S.song.cells[src.id]) {
    S.song.cells[src.id] = cells.map((sec, i) => sec.map((b, j) => ({ ...b, k: blockVar(src, S.song.sections[i], j) })));
    const row = S.song.rows.find((r) => r.id === id);
    if (row) row.id = src.id;
    delete S.song.cells[id];
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
  if (S.solo === id) return;
  S.solo = id;
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
  // a custom orb (🎛 편집): a diagonal band across the ball's lower right (orbs.css --band)
  if (l.custom) el.classList.add('custom');
  // the sound-edit batch (orbCatalog.js EDIT_ORBS, made like custom orbs): the same band, in white
  else if (l.tag === 'edits') el.classList.add('soundedit');
  if (l.id && byId[l.id] === l) decorate(el, l.id);
}

// What the slots did to an orb, drawn on it wherever it shows (field, stash, slots, song):
// turned down = smaller, turned up = a bit bigger (.vol, --vol-scale); its own variation = a faint
// pattern over the ball that changes with the seed (.varied, --vpat, --vpat-rot).
const volScale = (n) => (n < 0 ? 1 + 0.13 * n : 1 + 0.1 * n).toFixed(2);
function decorate(el, id) {
  if (!el) return;
  const n = volStep(id);
  el.classList.toggle('vol', !!n);
  if (n) el.style.setProperty('--vol-scale', volScale(n));
  else el.style.removeProperty('--vol-scale');
  // an orb edited by hand gets a pattern too, picked by its notes
  const raw = byId[id]?.raw ?? varOf(id)?.raw;
  patternOn(el, raw ? rawKey(raw) : heldSeed.get(id) ?? ownSeed.get(id) ?? null, byId[id]);
}
const rawKey = (raw) => 'raw' + JSON.stringify(raw);
// a red / vermilion / orange / yellow ball: rays spreading from its middle would read as a rising
// sun, so those get no ray patterns (seedPattern)
function warmOrb(l) {
  const m = /^#?([0-9a-f]{6})$/i.exec(l?.color ?? l?.colors?.[0] ?? '');
  if (!m) return false;
  const n = parseInt(m[1], 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => v / 255);
  const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
  if (!d || d / (1 - Math.abs(max + min - 1)) < 0.25) return false; // grey-ish
  const h = (max === r ? ((g - b) / d + 6) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4) * 60;
  return h >= 340 || h <= 65;
}
// the variation pattern for `key` (a seed, or rawKey of a drawing) on el; null takes it off.
// `l`: the orb it's on (a warm one gets no rays)
function patternOn(el, key, l) {
  el.classList.toggle('varied', key != null);
  if (key != null) {
    const [bg, rot] = seedPattern(key, warmOrb(l));
    el.style.setProperty('--vpat', bg);
    el.style.setProperty('--vpat-rot', rot + 'deg');
  } else el.style.removeProperty('--vpat');
}

// A faint pattern picked by the seed, so each variation looks a little different: one of many
// kinds (checks, stripes, dots, rings, rays, weaves …), in light or dark ink, at its own size,
// thickness and angle. `noRays`: leave out the kinds that fan out from a point (warmOrb)
function seedPattern(seed, noRays = false) {
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
    !noRays && (() => `repeating-conic-gradient(from ${a(0, 90)}deg, ${w} 0 ${a(4, 10)}deg, transparent 0 ${a(16, 30)}deg)`),
    // pinwheel (rays from off-centre)
    !noRays && (() => `repeating-conic-gradient(from 0deg at ${a(25, 75)}% ${a(25, 75)}%, ${w} 0 ${a(8, 16)}deg, transparent 0 ${a(24, 45)}deg)`),
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
  ].filter(Boolean);
  return [kinds[Math.floor(r() * kinds.length)](), Math.round(r() * 180)];
}

// what goes inside a ball: the colour swirl, or for a combo its orbs, packed in a circle
function orbInner(l) {
  if (!l?.combo) return '<i class="swirl"></i>';
  return bubbles(l.combo.map((id) => byId[id]).filter(Boolean), l.id);
}

// orbs packed in a circle (a combo's ball, a preset tile). `core`: a stem's tile, where the orbs
// go around a glowing white ▶ in the middle, inside a white ring
function bubbles(parts, seed, core = false) {
  const n = parts.length;
  // up to five around the middle; more get one in the middle and the rest around it
  const mid = !core && n > 5;
  const ring = mid ? n - 1 : n;
  const d = core ? ([0, 50, 46, 44, 42, 40, 38][n] ?? 36) : n === 1 ? 70 : mid ? 36 : [0, 0, 52, 48, 44, 40][n];
  const R = core ? (n === 1 ? 24 : 31) : n === 1 ? 0 : mid ? 33 : [0, 0, 25, 27, 29, 31][n];
  const r = rng(hash(seed));
  const html = parts.map((p, i) => {
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
  return core ? html + '<i class="stem-ring"></i><i class="stem-play"></i>' : html;
}

function makeSat(layer) {
  const el = document.createElement('div');
  el.className = 'sat';
  paint(el, layer);
  el.innerHTML = '<i class="swirl"></i>';
  ui.sats.append(el);
  return el;
}

export {
  SOUND_FIRST, bubbles, ctint, customTags, decorate, describe, makeSat, noSound, orbInner, paint,
  patternOn, rawKey, renderRoles, renderStatus, roleText, setSolo, strips, tint, volScale,
};
