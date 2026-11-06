// Phone (portrait) layout for the orb page. Kept apart from orbs.js: on a phone the page is one
// screen (the orbs rain around the player with 전부 비우기 · the orb hint · ⇪ along its top, the
// song's orbs under it, the orb slots and the stash at the bottom). The full-song stems are left to
// wide screens (orbsMobile.css hides them, orbs.js skips their tutorial step); the header folds into a
// menu, presets open as a sheet, and the save/share buttons share one popover under ⇪. Elements orbs.js
// holds are only moved (and put back on wide screens), so its listeners and rect checks still work.
import './orbsMobile.css';
import { ot } from './orbsI18n.js';
import { isPhone } from './phoneLayout.js';

const $ = (id) => document.getElementById(id);
const body = document.body;
const stage = $('stage');
const top = document.querySelector('.top');
const h = (html) => {
  const t = document.createElement('template');
  t.innerHTML = html.trim();
  return t.content.firstChild;
};

// the header is fixed: let the layout know how tall it is
new ResizeObserver(() => {
  document.documentElement.style.setProperty('--top-h', top.offsetHeight + 'px');
}).observe(top);

// the song's row under the player (status, the song's orbs, ↩ 루프 모드로) gets its own band: the
// field (and the orbs falling in it) stops above it, so a touch there never picks up an orb falling
// behind, and an orb taken out of the song and let go there goes back in instead of into the rain
const left = document.querySelector('.left');
const songParts = [$('status'), $('chips'), $('song')];
function songBand() {
  const chips = $('chips');
  let hgt = 0;
  if (isPhone.matches && chips.offsetParent) {
    hgt = Math.max(0, Math.ceil(left.getBoundingClientRect().bottom - $('status').getBoundingClientRect().top + 6));
  }
  document.documentElement.style.setProperty('--song-h', hgt + 'px');
}
const bandRO = new ResizeObserver(songBand);
for (const el of [left, ...songParts]) bandRO.observe(el);
new MutationObserver(songBand).observe(body, { attributes: true, attributeFilter: ['class'] });
isPhone.addEventListener('change', songBand);

// phones held sideways get a notice instead of a squeezed layout (orbsMobile.css decides when)
body.append(h(`<div class="m-rotate"><p data-i18n="mRotate">${ot('mRotate')}</p></div>`));

// ---------- open / close: ⋯ menu, 📁 presets sheet, ⇪ export popover ----------
const PANELS = ['m-menu-open', 'm-sheet-open', 'm-export-open'];
function openPanel(cls, open = !body.classList.contains(cls)) {
  for (const c of PANELS) body.classList.toggle(c, c === cls && open);
}
const closePanels = () => openPanel(null, false);
const toggler = (cls, html) => {
  const b = h(html);
  b.addEventListener('click', (e) => {
    e.stopPropagation();
    openPanel(cls);
  });
  return b;
};

// header: 📁 and 🔍 stay out, the rest folds into ⋯
const headBtns = h(`<div class="m-head-btns"></div>`);
const presetsBtn = toggler('m-sheet-open', `<button type="button" class="m-presets-btn" data-i18n-title="mPresets" title="${ot('mPresets')}" aria-label="presets">📁</button>`);
const menuBtn = toggler('m-menu-open', `<button type="button" class="m-menu-btn" data-i18n-title="mMenu" title="${ot('mMenu')}" aria-label="menu">⋯</button>`);
const credit = h(`<div class="m-credit"></div>`);
credit.append(...[...document.querySelectorAll('.powered a')].map((a) => a.cloneNode(true)));

// presets sheet: my presets and the shared ones
const sheet = h(`<div class="m-sheet"><button type="button" class="ghost m-sheet-close" data-i18n="mClose">${ot('mClose')}</button></div>`);
sheet.querySelector('.m-sheet-close').addEventListener('click', closePanels);

// export popover: the loop's / song's save and share buttons (the whole .actions row moves in)
const exportPop = h(`<div class="m-export"></div>`);
// ⇪ sits at the top right of the player area, across from 전부 비우기; its popover opens under it
const exportBtn = toggler('m-export-open', `<button type="button" class="m-export-btn" data-i18n="mExport">${ot('mExport')}</button>`);

// the hint while the song is empty (the desktop one points at the sidebar), and one over the stash
const emptyHint = h(`<p class="empty-hint m-empty-hint" data-i18n="mEmptyHint">${ot('mEmptyHint')}</p>`);
const stashHint = h(`<small class="m-stash-hint" data-i18n="mStashHint">${ot('mStashHint')}</small>`);

// a tap anywhere outside closes what is open (a tap on a button inside does its job first)
document.addEventListener('click', (e) => {
  if (!e.target.closest('.tools, .m-sheet, .m-export')) closePanels();
});
document.querySelector('.tools').addEventListener('click', (e) => {
  if (e.target.closest('button') && !e.target.closest('.langs')) closePanels();
});
// a preset tapped (not dragged) in the sheet loads: close it to show the player
let tapAt = null;
sheet.addEventListener('pointerdown', (e) => (tapAt = [e.clientX, e.clientY]), true);
sheet.addEventListener('pointerup', (e) => {
  if (!tapAt || !e.target.closest('.ptile') || e.target.closest('button')) return;
  if (Math.hypot(e.clientX - tapAt[0], e.clientY - tapAt[1]) < 6) setTimeout(closePanels, 120);
});
// dragging a preset out of the sheet: get the sheet out of the way so the player shows
window.addEventListener('pointermove', () => {
  if (body.classList.contains('m-sheet-open') && document.querySelector('body > .orb.dragging')) closePanels();
}, { passive: true });

// ---------- moving things in and out ----------
const PLACES = [
  [presetsBtn, headBtns],
  [$('searchBtn'), headBtns],
  [$('customBtn'), headBtns],
  [menuBtn, headBtns],
  [$('footLinks'), document.querySelector('.tools')],
  [credit, document.querySelector('.tools')],
  [emptyHint, stage],
  [$('presetbar'), sheet],
  [$('shareRow'), exportPop],
  [exportBtn, document.querySelector('.left')],
  [stashHint, $('stash')],
];
const OWN = new Set([presetsBtn, menuBtn, credit, emptyHint, exportBtn, stashHint]);
const homes = new Map(); // el -> [parent, nextSibling] to put it back on wide screens
function place() {
  if (isPhone.matches) {
    top.append(headBtns);
    body.append(sheet, exportPop);
    for (const [el, to] of PLACES) {
      if (el.parentNode === to) continue;
      if (el.parentNode && !homes.has(el)) homes.set(el, [el.parentNode, el.nextSibling]);
      to.append(el);
    }
  } else {
    // back in reverse, so a moved element's old neighbour is home again before it is needed
    for (const [el] of [...PLACES].reverse()) {
      const home = homes.get(el);
      if (home) {
        const [p, next] = home;
        p.insertBefore(el, next?.parentNode === p ? next : null);
      } else if (OWN.has(el)) el.remove(); // made here for the phone layout only
    }
    homes.clear();
    for (const el of [headBtns, sheet, exportPop]) el.remove();
    closePanels();
  }
}
isPhone.addEventListener('change', place);
place();
