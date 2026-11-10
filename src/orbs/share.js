// Sharing: share codes, the server's shared list, and WAV download.
// Split out of orbs.js; the files load in a chain (each imports the one before it first), so they run in the
// same order as the one file did. See orbs/state.js.
import { applyPreset, currentPreset, loadPresets, refreshShared, renderPresets, savePresets, serverUp, setServerUp } from './presets.js';
import { LAYERS, byId } from '../orbCatalog.js';
import { packRaw, unpackRaw, toWire, varsToWire, cleanVars, cleanGains } from '../orbPreset.js';
import { uploadPreset } from '../presetApi.js';
import { checkCustom, registerCustom } from '../orbEdit.js';
import { ot } from '../orbsI18n.js';
import { attributionsFor, creditLine, soundName } from '../licenses.js';
import { copyText } from '../copyBox.js';
import { saveFile } from '../saveFile.js';
import { LIMITS, validatePreset } from '../../server/presetSchema.mjs';
import { $, S, active, seedOf, ui } from './state.js';
import { bpm, buildCode, codeOf, layers, masterEqNow } from './audio.js';
import { tutEvent } from './guide.js';
import { bump } from './drag.js';

// ---------- sharing presets as text ----------
// A shared preset is one short code (orb1:…) that carries the exact set (orb ids, drawings,
// variation). Pasting it into 불러오기 brings it back.

const SHARE_TAG = 'orb1:';
const ORB_ID = /^[A-Za-z0-9_-]{1,40}$/; // as the server takes them (server/presetSchema.mjs)
const b64 = (str) => btoa(String.fromCharCode(...new TextEncoder().encode(str))).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
const unb64 = (str) => new TextDecoder().decode(Uint8Array.from(atob(str.replaceAll('-', '+').replaceAll('_', '/')), (c) => c.charCodeAt(0)));

// the share code alone: one line that carries the whole preset (name, orbs, drawings, variation,
// and for a stem share the full-song grid)
function presetText(p) {
  const vr = p.vars ? Object.fromEntries(Object.entries(p.vars).map(([k, v]) => [k, varsToWire(v)])) : null;
  const data = { n: p.name, l: p.layers, d: (p.drawn ?? []).map((d) => [d.id, d.src, packRaw(d.raw)]), v: p.variation ?? 0, ...(p.seeds ? { vs: p.seeds } : {}), ...(p.gains ? { vg: p.gains } : {}), ...(vr ? { vr } : {}), ...(p.custom?.length ? { c: p.custom } : {}), ...(p.song ? { s: p.song } : {}) };
  return SHARE_TAG + b64(JSON.stringify(data));
}

// Text -> preset. Takes the code (with or without its orb1: prefix); otherwise matches listed names.
function parsePresetText(text) {
  const id = Date.now().toString(36);
  const m = text.match(/orb1:([A-Za-z0-9_-]+)/) ?? text.trim().match(/^([A-Za-z0-9_-]{16,})$/);
  if (m) {
    const d = JSON.parse(unb64(m[1]));
    // custom orbs (🎛 편집) first, so the orbs below can name them
    const custom = (Array.isArray(d.c) ? d.c : []).slice(0, 12).map((x) => checkCustom(x, byId)).filter(Boolean);
    for (const c of custom) registerCustom(c, byId);
    // ids are plain orb names; a drawing may not take the id of an orb that is not a drawing
    const isId = (x) => typeof x === 'string' && ORB_ID.test(x) && x !== '__proto__';
    const drawn = (Array.isArray(d.d) ? d.d : [])
      .filter((x) => Array.isArray(x) && isId(x[0]) && (!byId[x[0]] || byId[x[0]].raw) && isId(x[1]) && byId[x[1]]?.voice && typeof x[2] === 'string')
      .slice(0, 8)
      .map(([did, src, raw]) => ({ id: did, src, raw: unpackRaw(raw) }));
    const ok = new Set(drawn.map((x) => x.id));
    const layers = [...new Set((Array.isArray(d.l) ? d.l : []).filter((x) => isId(x) && (ok.has(x) || (byId[x] && !byId[x].raw))))].slice(0, 24);
    const song = d.s && typeof d.s === 'object' ? { song: d.s } : {}; // checked when it is applied
    const seeds = d.vs && typeof d.vs === 'object' ? { seeds: Object.fromEntries(Object.entries(d.vs).filter(([k, v]) => layers.includes(k) && Number.isSafeInteger(v) && v >= 0)) } : {};
    const gains = cleanGains(d.vg, layers);
    const vars = cleanVars(d.vr, layers);
    return { id, name: String(d.n ?? ot('importedPreset')).slice(0, 24), layers, drawn, variation: +d.v || 0, ...seeds, ...(gains ? { gains } : {}), ...(vars ? { vars } : {}), ...(custom.length ? { custom } : {}), ...song };
  }
  const byName = new Map(LAYERS.flatMap((l) => [[l.nameKo ?? l.name, l.id], [l.name, l.id]]));
  const layers = [];
  for (const line of text.split(/\r?\n/)) {
    const name = line.replace(/^\s*(\d+[.)]|[-•*])\s*/, '').replace(/\s*\([^)]*\)\s*$/, '').trim();
    const lid = byName.get(name);
    if (lid && !layers.includes(lid)) layers.push(lid);
  }
  const title = text.match(/프리셋\s*—\s*(.+)/)?.[1]?.trim();
  return { id, name: (title || ot('importedPreset')).slice(0, 24), layers, drawn: [], variation: +(text.match(/변주\s*#(\d+)/)?.[1] ?? 0) };
}

// copy to the clipboard (on mobile, or if that fails, a popup to copy from); the button says how it went
async function shareText(text, btn) {
  if (!(await copyText(text))) return;
  const label = btn.textContent;
  btn.textContent = btn.classList.contains('share') ? '✓' : ot('copied');
  setTimeout(() => (btn.textContent = label), 1500);
}
const sharePreset = (p, btn) => shareText(presetText(p), btn);

$('shareBtn').addEventListener('click', (e) => {
  if (!active.size) {
    ui.soloHint.textContent = ot('nothingToShare');
    return;
  }
  shareText(presetText(currentPreset(ot('myMix'))), e.currentTarget);
});
$('stemShareBtn').addEventListener('click', (e) => {
  if (!S.song?.sections) return;
  shareText(presetText(currentPreset(ot('mySong'), { withSong: true })), e.currentTarget);
});
const updateShareButtons = () => ($('stemShareBtn').disabled = !S.song?.sections);

// ---------- sharing on the server ----------
// The dialog asks for a title, orb or stem, an author and a short description, checks it with the
// same rules the server uses (server/presetSchema.mjs), and posts it; the server checks it again.

const shareDlg = $('shareDlg'), shErr = $('shErr'), shOk = $('shOk'), shDesc = $('shDesc');
const AUTHOR_KEY = 'orbAuthor';
let shareSrc = null; // the preset being shared
let shareCredits = ''; // CC-BY credits appended to its description ('' when every sound is CC0)

// every sample the set plays: what each orb lists, plus the s("…") names in its code at its seed
// (a drawn part plays its source orb's sound)
function setSampleNames() {
  const names = new Set();
  for (const l of layers()) {
    for (const o of [l, l.raw && byId[l.src]]) for (const n of o?.samples ?? []) names.add(n);
    let code = '';
    try {
      code = l.code ? codeOf(l, seedOf(l)) : '';
    } catch {}
    for (const [, s] of code.matchAll(/\bs\("([^"]*)"\)/g)) for (const n of s.match(/[A-Za-z_][\w]*(?::\d+)?/g) ?? []) names.add(n);
  }
  return names;
}

function openShareDialog(p) {
  if (serverUp === false) return;
  shareSrc = p;
  $('shTitle').value = p.name.slice(0, LIMITS.name);
  for (const r of shareDlg.querySelectorAll('input[name=shKind]')) {
    r.disabled = r.value === 'stem' && !p.song;
    r.checked = r.value === (p.song ? 'stem' : 'orb');
    r.parentElement.title = r.disabled ? ot('shStemOff') : '';
  }
  try {
    $('shAuthor').value = localStorage.getItem(AUTHOR_KEY) ?? '';
  } catch {
    $('shAuthor').value = '';
  }
  shDesc.value = '';
  $('shCount').textContent = `0 / ${LIMITS.description}`;
  const attr = attributionsFor(setSampleNames());
  shareCredits = creditLine(attr);
  const credit = $('shCredit');
  credit.hidden = !attr.length;
  if (attr.length) {
    credit.textContent = ot('shCredit', { what: attr.map((c) => soundName(c.use)).join(', ') });
    credit.append(Object.assign(document.createElement('small'), { textContent: shareCredits }));
  }
  $('shWebsite').value = '';
  $('shAgree').checked = false;
  shOk.disabled = true;
  shErr.textContent = '';
  shErr.classList.remove('ok');
  shareDlg.showModal();
  $('shTitle').select();
}

$('serverShareBtn').addEventListener('click', () => {
  if (!active.size) {
    ui.soloHint.textContent = ot('nothingToShare');
    return;
  }
  openShareDialog(currentPreset(ot('mySong'), { withSong: true }));
});
$('shCancel').addEventListener('click', () => shareDlg.close());
$('shAgree').addEventListener('change', (e) => (shOk.disabled = !e.target.checked));
const countDesc = () => ($('shCount').textContent = `${[...shDesc.value].length} / ${LIMITS.description}`);
shDesc.addEventListener('input', countDesc);
shDesc.addEventListener('compositionend', countDesc); // Hangul typed through an IME

$('shareForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  if (!shareSrc || shOk.disabled) return;
  const extra = {
    kind: shareDlg.querySelector('input[name=shKind]:checked')?.value ?? 'orb',
    author: $('shAuthor').value,
    description: [shDesc.value.trim(), shareCredits].filter(Boolean).join(' '),
    agree: $('shAgree').checked,
    website: $('shWebsite').value,
  };
  const p = { ...shareSrc, name: $('shTitle').value };
  shErr.classList.remove('ok');
  try {
    validatePreset(toWire(p, extra));
  } catch (err) {
    shErr.textContent = err.message;
    return;
  }
  shOk.disabled = true;
  shOk.textContent = ot('uploading');
  try {
    await uploadPreset(p, extra);
    try {
      localStorage.setItem(AUTHOR_KEY, extra.author.trim());
    } catch {}
    shErr.textContent = ot('shDone');
    shErr.classList.add('ok');
    refreshShared();
    setTimeout(() => shareDlg.close(), 1400);
  } catch (err) {
    const down = err.name === 'AbortError' || err instanceof TypeError; // timeout / no connection
    shErr.textContent = down ? ot('shDown') : ot('shFail', { msg: err.message });
    shOk.disabled = down || !$('shAgree').checked;
    if (down) setServerUp(false);
    console.error('preset upload failed', err);
  } finally {
    shOk.textContent = ot('shOk');
  }
});

const importDlg = $('importDlg'), importText = $('importText'), importErr = $('importErr');
$('importBtn').addEventListener('click', () => {
  importErr.textContent = '';
  importText.value = '';
  importDlg.showModal();
  importText.focus();
});
$('importCancel').addEventListener('click', () => importDlg.close());
$('importForm').addEventListener('submit', (e) => {
  e.preventDefault();
  let p = null;
  try {
    p = parsePresetText(importText.value);
  } catch {}
  if (!p?.layers.length) {
    importErr.textContent = ot('importBad');
    return;
  }
  importDlg.close();
  savePresets([p, ...loadPresets()]);
  renderPresets();
  bump(ui.presetList.firstChild, 'gulp');
  applyPreset(p);
});

// ---------- WAV download ----------
// The set is rendered offline in a hidden iframe (render.html?orbs, its own Strudel), so the
// live loop keeps playing. A full song renders once through; a loop renders LOOP_BARS bars.

const LOOP_BARS = 16;
let renderFrame, frameReady, renderJob = 0, renderingWav = false;
const renderJobs = new Map();
function renderer() {
  if (!frameReady) {
    renderFrame = document.createElement('iframe');
    renderFrame.src = 'render.html?orbs';
    renderFrame.style.display = 'none';
    frameReady = new Promise((res) => (renderFrame.onload = res));
    document.body.append(renderFrame);
  }
  return frameReady;
}
addEventListener('message', (e) => {
  if (e.origin !== location.origin || e.data?.source !== 'algorave-render') return;
  const job = renderJobs.get(e.data.id);
  if (!job) return;
  if (e.data.type === 'progress') job.progress(e.data.value);
  else {
    renderJobs.delete(e.data.id);
    e.data.type === 'done' ? job.resolve(e.data.wav) : job.reject(new Error(e.data.message));
  }
});

// the code as it would play from cycle 0, without anything only the live page hears;
// `full`: the whole stem song once through, otherwise LOOP_BARS of the loop
function renderCode(full) {
  S.offline = true;
  const live = S.song;
  if (!full) S.song = null;
  const s0 = S.song?.s0;
  if (S.song) S.song.s0 = 0;
  try {
    const code = buildCode();
    const eq = masterEqNow();
    const cycles = S.song ? S.songPlanCache.reduce((s, x) => s + x.len, 0) : LOOP_BARS;
    return { code, cycles, tempo: bpm(), eq };
  } finally {
    S.offline = false;
    S.song = live;
    if (S.song) {
      if (full) S.song.s0 = s0;
      ui.code.textContent = buildCode(); // put the live code (and song bar) back
    }
  }
}

// 💾 루프 WAV (loop mode) and 💾 스템 WAV (while the stems are open)
const wavBtn = $('wavBtn'), wavStemBtn = $('wavStemBtn');
const wavLabel = (b) => ot(b === wavStemBtn ? 'wavStem' : 'wav');
wavBtn.addEventListener('click', () => saveWav(wavBtn, false));
// the loop's save / share buttons move the guide on to the stems
for (const b of [wavBtn, $('shareBtn'), $('serverShareBtn')]) b.addEventListener('click', () => tutEvent('share'));
wavStemBtn.addEventListener('click', () => saveWav(wavStemBtn, true));
async function saveWav(btn, full) {
  if (renderingWav) return;
  if (full && !S.song?.sections) return;
  if (!layers().some((l) => l.code)) {
    ui.soloHint.textContent = ot('noSound');
    return;
  }
  const { code, cycles, tempo, eq } = renderCode(full);

  renderingWav = true;
  wavBtn.disabled = wavStemBtn.disabled = true;
  btn.textContent = ot('rendering', { p: 0 });
  try {
    await renderer();
    const id = ++renderJob;
    const wav = await new Promise((resolve, reject) => {
      renderJobs.set(id, { resolve, reject, progress: (p) => (btn.textContent = ot('rendering', { p: Math.round(p * 100) })) });
      renderFrame.contentWindow.postMessage({ type: 'render', id, code, eq, start: 0, end: cycles, cps: tempo / 4 / 60 }, location.origin);
    });
    const name = (ui.presetName.value.trim() || layers().find((l) => l.code)?.name || 'orb').replace(/[\\/:*?"<>|]/g, '');
    // an in-app browser may open the page elsewhere: the set goes along in the URL (see handoffPreset)
    const handoff = () => location.href.split('#')[0] + '#' + presetText(currentPreset(name, { withSong: full }));
    saveFile(new Blob([wav], { type: 'audio/wav' }), `ORBRAVE - ${name} ${tempo}bpm${full ? ' (full)' : ''}.wav`, { handoff });
  } catch (e) {
    console.error('render failed', e);
    ui.soloHint.textContent = ot('wavFail');
  } finally {
    renderingWav = false;
    wavBtn.disabled = wavStemBtn.disabled = false;
    btn.textContent = wavLabel(btn);
  }
}

export {
  AUTHOR_KEY, SHARE_TAG, openShareDialog, parsePresetText, renderCode, renderingWav, setSampleNames,
  sharePreset, updateShareButtons, wavBtn, wavLabel, wavStemBtn,
};
