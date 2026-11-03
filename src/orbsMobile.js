// Phone (portrait) layout helpers for the orb page. Kept apart from orbs.js: it only adds
// a dock with two toggles and moves the song timeline into its own bottom panel. Every
// element orbs.js holds keeps its identity, so its listeners and rect checks still work.
import './orbsMobile.css';
import { ot } from './orbsI18n.js';

const $ = (id) => document.getElementById(id);
const stage = $('stage');
const stash = $('stash');
const top = document.querySelector('.top');

// the header is fixed and wraps on narrow screens: let the layout know how tall it is
new ResizeObserver(() => {
  document.documentElement.style.setProperty('--top-h', top.offsetHeight + 'px');
}).observe(top);

// bottom panel for the full song (and its stems, once they live here)
const songPanel = document.createElement('section');
songPanel.className = 'm-song';
songPanel.id = 'mSong';
songPanel.innerHTML = `<div class="m-song-empty" data-i18n="mSongEmpty">${ot('mSongEmpty')}</div>`;
stage.insertBefore(songPanel, stash);

// everything song-related goes in the panel: the timeline now, a stem builder later
const SONG_PARTS = '#song, #stems, .stems';
const isPhone = matchMedia('(max-width: 760px)');
const homes = new Map(); // el -> [parent, nextSibling] to put it back on wide screens
function placeSongParts() {
  for (const el of document.querySelectorAll(SONG_PARTS)) {
    if (isPhone.matches) {
      if (el.parentNode === songPanel) continue;
      homes.set(el, [el.parentNode, el.nextSibling]);
      songPanel.append(el);
    } else if (homes.has(el)) {
      const [p, next] = homes.get(el);
      p.insertBefore(el, next?.parentNode === p ? next : null);
      homes.delete(el);
    }
  }
}

// the dock: two toggles above the stash
const dock = document.createElement('nav');
dock.className = 'm-dock';
dock.innerHTML = `
  <button type="button" data-open="roll-open"><span data-i18n="mMidi">${ot('mMidi')}</span> <i>▴</i></button>
  <button type="button" data-open="song-open"><span data-i18n="mSong">${ot('mSong')}</span> <i>▴</i></button>`;
stage.insertBefore(dock, stash);
dock.addEventListener('click', (e) => {
  const b = e.target.closest('button[data-open]');
  if (!b) return;
  document.body.classList.toggle(b.dataset.open);
  syncDock();
});
let wasLive = false;
function syncDock() {
  for (const b of dock.querySelectorAll('button[data-open]')) {
    const open = document.body.classList.contains(b.dataset.open);
    b.classList.toggle('open', open);
    const arrow = open ? '▾' : '▴';
    const i = b.querySelector('i');
    if (i.textContent !== arrow) i.textContent = arrow;
  }
  const body = document.body.classList;
  // a live song lights its toggle even while the panel is closed; a song just made opens it once
  const live = body.contains('stem-open') || !!$('song')?.classList.contains('on');
  if (live && !wasLive && !body.contains('song-open')) body.add('song-open');
  wasLive = live;
  dock.querySelector('[data-open="song-open"]').classList.toggle('live', live);
  // an orb dropped into the roll keeps it open
  if (body.contains('roll-full') && !body.contains('roll-open')) body.add('roll-open');
}

// follow what orbs.js does: song on/off, orb picked into the roll, a stem panel appearing
const watch = { attributes: true, attributeFilter: ['class'] };
const mo = new MutationObserver(() => {
  placeSongParts();
  syncDock();
  mo.takeRecords(); // our own changes above don't need another pass
});
mo.observe(document.body, watch);
if ($('song')) mo.observe($('song'), watch);
mo.observe(stage, { childList: true, subtree: false });
mo.observe(document.querySelector('.left'), { childList: true });
isPhone.addEventListener('change', placeSongParts);
placeSongParts();
syncDock();
