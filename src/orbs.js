// The orb page (index.html). The page's code is split over src/orbs/*.js by feature; this file loads
// them (orbs/search.js first, which pulls in the rest in order) and wires the toolbar and the boot.
import { renderSearch, searchMode } from './orbs/search.js'; // first: loads the chain (see orbs/state.js)
import { samplePrelude } from './samples.js';
import { LAYERS, byId } from './orbCatalog.js';
import { lite, setLite, onLite } from './liteMode.js';
import { onTheme, mountThemeButton } from './theme.js';
import { ot, mountLangButtons } from './orbsI18n.js';
import { isPhone } from './phoneLayout.js';
import { mountLicenses, attributionsFor } from './licenses.js';
import { mountChangelog } from './changelog.js';
import { banner } from './tutorial.js';
import * as taste from './orbTaste.js';
import { $, S, active, booted, heldSeed, orbStep, orbVars, replReady, ui } from './orbs/state.js';
import { addLayer, buildCode, codeOf, keyMode, nowCycle, removeLayer, sync, volRing } from './orbs/audio.js';
import {
  FIRST_ORB_KEY, TUT_KEY, checkFirstOrb, countMove, firstOrbDone, ghostThrow, revealRoll, tut,
  tutEvent,
} from './orbs/guide.js';
import { decorate, renderStatus } from './orbs/list.js';
import { rain, renderStash, seedRain, spawnWeights, stash } from './orbs/field.js';
import { slotOrbs } from './orbs/drag.js';
import { draft, pickForSlot, rollOrb } from './orbs/variations.js';
import { orbEditing, orbEditor, refreshSharedOrbs } from './orbs/customOrbs.js';
import { leaveSlots, patternToRaw, renderRollHead } from './orbs/slots.js';
import {
  SESSION_KEY, handoffPreset, refreshShared, renderPresets, renderShared, restoreSession, serverUp,
  sessionData, sharedList, undoKey,
} from './orbs/presets.js';
import { renderCode, renderingWav, setSampleNames, wavBtn, wavLabel, wavStemBtn } from './orbs/share.js';
import { closeSong, loopPos, renderSong } from './orbs/stems.js';
import { frame } from './orbs/visuals.js';

// ---------- toolbar ----------

$('clear').addEventListener('click', () => {
  countMove(active.size);
  for (const id of [...active.keys()]) removeLayer(id, { silent: true, respawn: false });
  if (S.song) closeSong(); // nothing left for the stems to play (closeSong syncs)
  else sync();
});
$('codeToggle').addEventListener('click', () => {
  ui.drawer.classList.toggle('open');
  tutEvent('code');
});
$('codeClose').addEventListener('click', () => ui.drawer.classList.remove('open'));

// the bottom-left links wrap on a narrow column: .left keeps that much room under its content
{
  const foot = document.querySelector('.powered');
  new ResizeObserver(() => document.documentElement.style.setProperty('--foot-h', `${foot.offsetHeight}px`)).observe(foot);
}

// (직접수정) strudel.cc: the set as plain Strudel code (what the WAV render plays: no
// previews, solo dips, analysers or bar gates), with the sample banks loaded at the top and the
// CC-BY credits of the sounds it uses, opened in the Strudel REPL through its #<base64> share hash
// (read in the browser, never sent to their server).
function strudelExport() {
  const { code } = renderCode(!!S.song);
  const credits = attributionsFor(setSampleNames());
  return [
    // comments in the page language (the orb-name comments already follow it through l.name)
    `// ${ot('codeMadeWith')} — https://github.com/r3coder/orbrave (AGPL-3.0)`,
    `// ${ot('codeSounds')}`,
    ...credits.map((c) => `// ${ot('codeCredit')}: ${c.text}`),
    ...samplePrelude(code),
    '',
    code,
  ].join('\n');
}
// Strudel's code2hash, in chunks: its String.fromCharCode(...bytes) overflows on a long song
function strudelHash(code) {
  const bytes = new TextEncoder().encode(code);
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return encodeURIComponent(btoa(bin));
}
$('strudelBtn').addEventListener('click', () => {
  window.open(`https://strudel.cc/#${strudelHash(strudelExport())}`, '_blank', 'noopener');
  tutEvent('code');
});

// Text built in script, redrawn when KR / EN / JP is switched (static text is handled by orbsI18n.js).
function applyLangUI() {
  const sb = $('serverShareBtn');
  sb.textContent = ot(serverUp === false ? 'serverDown' : 'serverShare');
  sb.title = ot(serverUp === false ? 'serverDownTip' : 'serverShareTip');
  volRing.setAttribute('aria-label', ot('volume'));
  ui.editOpen.textContent = ot(orbEditing ? 'editClose' : 'editOpen');
  if (!renderingWav) for (const b of [wavBtn, wavStemBtn]) b.textContent = wavLabel(b);
}
mountLicenses($('licenseBtn'));
mountChangelog($('verBtn'));
$('feedbackBtn').addEventListener('click', () => window.open('https://forms.gle/gvjXSkEM7W6ug6US9', '_blank', 'noopener'));
// ↺ 튜토리얼 재실행: forget the guide's progress and the current set (presets, language, volume and
// low-spec mode stay), then reload so everything starts as on a first visit
$('tutorialBtn').addEventListener('click', () => {
  S.sessionDropped = true;
  try {
    for (const k of [TUT_KEY, FIRST_ORB_KEY, SESSION_KEY, 'orbRollReady', 'orbToolsReady']) localStorage.removeItem(k);
  } catch {}
  location.reload();
});
// low-spec mode: the button flips it by hand; the frame-rate watch can also switch it on
const themeLabel = mountThemeButton($('themeBtn'), ot);
onTheme(() => (S.rollSig = ''));
const liteBtn = $('liteBtn');
liteBtn.classList.toggle('on', lite);
liteBtn.addEventListener('click', () => setLite(!lite));
onLite((on, auto) => {
  liteBtn.classList.toggle('on', on);
  S.rollSig = '';
  if (auto) ui.soloHint.textContent = ot(isPhone.matches ? 'liteAutoPhone' : 'liteAuto');
});
mountLangButtons($('langs'), () => {

  applyLangUI();

  themeLabel();
  renderStatus();
  renderPresets();
  renderShared();
  if (serverUp === false) sharedList.innerHTML = `<p class="empty">${ot('serverDownList')}</p>`;
  renderRollHead();
  orbEditor.relabel();
  if (S.song?.sections) {
    S.stemSig = '';
    renderSong();
  }
  ui.searchInput.placeholder = ot(searchMode === 'custom' ? 'customPh' : 'searchPh');
  if (ui.search.classList.contains('open')) renderSearch();
  if (tut.banner) banner(ot(isPhone.matches ? 'tutPresetPhone' : 'tutPreset'));
  ui.soloHint.textContent = '';
  // orbs already on screen (falling, in the stash, being dragged) keep their element: relabel them
  for (const el of document.querySelectorAll('.orb[data-id]')) {
    const l = byId[el.dataset.id];
    if (!l) continue;
    const label = el.querySelector('.label'), kind = el.querySelector('.kind');
    if (label) label.textContent = l.name;
    if (kind) kind.textContent = l.kind;
  }
  renderStash();
  ui.code.textContent = buildCode();
});
applyLangUI();

handoffPreset();
restoreSession();
S.undoBase = undoKey(sessionData()); // what comes back from the last visit is where ↶ 되돌리기 stops
checkFirstOrb({ boot: true });
if (firstOrbDone) S.comboDue = true;
if (tut.banner) banner(ot(isPhone.matches ? 'tutPresetPhone' : 'tutPreset'));
if (!firstOrbDone) S.ghostTimer = setTimeout(ghostThrow, 1200);
renderStash();
renderPresets();
refreshShared();
refreshSharedOrbs();
renderRollHead();
renderStatus();
ui.code.textContent = buildCode();
// the first rain waits for the boot screen (it covers the page until then), so it can pick from
// the sounds decoded there (see opening)
booted.then(() => requestAnimationFrame(() => {
  S.bootDone = true;
  seedRain();
  leaveSlots(); // a set saved with orbs in the slots, opened where they are off: back into the fresh rain
  requestAnimationFrame(frame);
}));
if (import.meta.env.DEV) window.__orbs = { spawnWeights, loopPos, nowCycle, taste: taste.debug, replReady, codeOf, active, rain, stash, byId, addLayer, removeLayer, buildCode, pickForSlot, orbStep, orbVars, heldSeed, revealRoll, slotOrbs, decorate, get rollOrb() { return rollOrb; }, get draft() { return draft; }, get song() { return S.song; }, get variation() { return S.variation; }, patternToRaw, keyMode, LAYERS };
