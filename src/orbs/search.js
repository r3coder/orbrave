// The orb search and custom orb panel.
// Split out of orbs.js; the files load in a chain (each imports the one before it first), so they run in the
// same order as the one file did. See orbs/state.js.
import './visuals.js';
import { LAYERS, KEYS, byId, role, ROLE_TEXT, MOOD_SUBS } from '../orbCatalog.js';
import { ot, allLangs } from '../orbsI18n.js';
import { getLang } from '../i18n.js';
import { vocalsOn } from '../vocals.js';
import { $, S, active, ui } from './state.js';
import { hoverCombo } from './guide.js';
import { ctint } from './list.js';
import { SERVER_BATCH, fieldSize, hoverOff, hoverOn, makeOrbEl, rainAdd } from './field.js';
import { startDrag } from './drag.js';
import {
  customMeta, myCustoms, openOrbDelete, openOrbUpload, refreshSharedOrbs, serverErr, serverLoad,
} from './customOrbs.js';
import { freshOrb } from './slots.js';
import { serverUp } from './presets.js';
import { miniOrb } from './stems.js';

// ---------- orb search ----------
// Terms are separated by spaces or "/" and all have to match. A term is looked up in an orb's
// name, kind and part (Korean or English) and in a combo's parts; "bpm" / "템포" finds tempo
// orbs and a number finds tempos near it; Am / minor / 단조 and A / major / 장조 find by key.
const MODE_WORDS = { minor: ['minor', '단조', '마이너', '短調'], major: ['major', '장조', '메이저', '長調'] };
const FLATS = { db: 'c#', eb: 'd#', gb: 'f#', ab: 'g#', bb: 'a#' };
// "Bm" -> { tonic: 2, mode: 'minor' }, "F#" / "Gb" / "f#maj" -> major; anything else -> null
function parseKey(term) {
  const m = /^([a-g])(#|b)?(m|min|minor|maj|major)?$/.exec(term);
  if (!m) return null;
  let name = m[1] + (m[2] ?? '');
  name = FLATS[name] ?? name;
  const i = KEYS.findIndex((k) => k.toLowerCase() === name);
  return i < 0 ? null : { tonic: i, mode: m[3] && !m[3].startsWith('maj') ? 'minor' : 'major' };
}
// a combo's key is the key orb inside it
const keyOf = (l) => (l.cat === 'mode' ? l : l.combo?.map((c) => byId[c]).find((x) => x.cat === 'mode'));
const partText = (l) => `${ROLE_TEXT[role(l)] ?? ''} ${allLangs(`role.${role(l)}`)} ${allLangs(`slot.${role(l)}`)}`;
const orbText = (l) => [l.name, l.kind, l.cat, partText(l), TYPE_EXTRA[role(l)] ?? '', ...(l.combo ?? []).map((c) => `${byId[c].name} ${byId[c].kind} ${partText(byId[c])}`)].join(' ').toLowerCase();
function matchesTerm(l, term) {
  if (/^(bpm|tempo|템포|テンポ)$/.test(term)) return !!l.bpm;
  // a number finds tempos near it, and also drum machines by name (808, 909 …)
  if (/^\d+$/.test(term)) return (!!l.bpm && Math.abs(l.bpm - +term) <= 6) || orbText(l).includes(term);
  for (const [mode, words] of Object.entries(MODE_WORDS)) if (words.includes(term)) return keyOf(l)?.mode === mode;
  const k = parseKey(term);
  if (k) return !!keyOf(l) && (keyOf(l).key + 12) % 12 === k.tonic && keyOf(l).mode === k.mode;
  return orbText(l).includes(term);
}
// Operators: "-term" (or "!term") leaves out what the term finds, and "field:value" looks in one
// field only — t: the orb's own part (a combo is "combo", not its parts), s: its scale (a combo
// has its parts' scales), k: its key, bpm: its tempo (120, >120, <90, 120-140).
const FIELDS = {
  type: ['t', 'type', 'part', '종류', '타입', '파트', '種類', 'タイプ'],
  scale: ['s', 'scale', '스케일', '음계', 'スケール', '音階'],
  key: ['k', 'key', '키', '조성', '調', 'キー'],
  bpm: ['bpm', 'tempo', '템포', 'テンポ'],
};
const FIELD_OF = Object.fromEntries(Object.entries(FIELDS).flatMap(([f, ws]) => ws.map((w) => [w, f])));
const DRUM_WORDS = 'drum drums 드럼 ドラム';
const TYPE_EXTRA = {
  kick: DRUM_WORDS, snare: `${DRUM_WORDS} clap 클랩`, hat: DRUM_WORDS, perc: DRUM_WORDS,
  combo: 'combo 콤보 コンボ', mode: 'key mode 키 조성 調 キー', mood: 'mood 무드', tempo: 'bpm',
};
// a mood's sub-type (MOOD_SUBS), in every language: t:공간, t:eq, t:balance …
const SUB_EXTRA = {
  eq: 'eq equalizer tone 이퀄라이저 이큐 음색 저음 고음 イコライザー 音色 低音 高音',
  filter: 'filter 필터 먹먹 フィルター', space: 'space reverb echo 공간 리버브 메아리 空間 リバーブ',
  texture: 'texture distortion 질감 지글 왜곡 質感 歪み', motion: 'motion pan rhythm 움직임 패닝 리듬 動き',
  mix: 'balance mix 밸런스 볼륨 줄임 バランス',
};
const typeText = (l) => {
  const r = role(l);
  const sub = l.sub ? `${l.sub} ${MOOD_SUBS[l.sub] ?? ''} ${SUB_EXTRA[l.sub] ?? ''}` : '';
  return `${r} ${ROLE_TEXT[r] ?? ''} ${allLangs(`role.${r}`)} ${allLangs(`slot.${r}`)} ${TYPE_EXTRA[r] ?? ''} ${sub}`.toLowerCase();
};
// orbs without their own scale family play the plain seven-note scale of the key
const SCALE_WORDS = {
  natural: 'natural diatonic aeolian ionian minor major 자연 기본 단조 장조 自然',
  pentatonic: 'pentatonic penta 펜타토닉 펜타 ペンタトニック ペンタ',
  blues: 'blues 블루스 ブルース',
  japanese: 'japanese hirajoshi 일본 히라조시 和風 日本 平調子',
  suspended: 'suspended sus egyptian 서스펜디드 서스 이집트 サス',
  malkos: 'malkos malkauns raga 말코스 라가 マルコス',
  vietnamese: 'vietnamese 베트남 ベトナム',
};
const MELODIC = new Set(['bass', 'arp', 'lead', 'pad']);
const scalesOf = (l) =>
  l.combo ? l.combo.flatMap((c) => scalesOf(byId[c])) : l.scaleFamily ? [l.scaleFamily] : MELODIC.has(role(l)) ? ['natural'] : [];
function matchesBpm(l, v) {
  if (!l.bpm) return false;
  let m;
  if ((m = /^([<>])=?(\d+)$/.exec(v))) return m[1] === '>' ? l.bpm >= +m[2] : l.bpm <= +m[2];
  if ((m = /^(\d+)[-~](\d+)$/.exec(v))) return l.bpm >= Math.min(+m[1], +m[2]) && l.bpm <= Math.max(+m[1], +m[2]);
  return /^\d+$/.test(v) ? Math.abs(l.bpm - +v) <= 6 : false;
}
function matchesField(l, field, v) {
  if (field === 'type') return typeText(l).includes(v);
  if (field === 'scale') return scalesOf(l).some((f) => `${f} ${SCALE_WORDS[f] ?? ''}`.toLowerCase().includes(v));
  if (field === 'key') return (Object.values(MODE_WORDS).some((ws) => ws.includes(v)) || !!parseKey(v)) && matchesTerm(l, v);
  return matchesBpm(l, v);
}
// "-t:킥" -> { neg: true, field: 'type', value: '킥' }; a half-typed "t:" or "-" is dropped
function parseTerm(raw) {
  const neg = /^[-!]/.test(raw);
  const body = neg ? raw.slice(1) : raw;
  const m = /^([^:：]+)[:：](.*)$/.exec(body);
  const field = m && FIELD_OF[m[1]];
  const value = field ? m[2] : body;
  return value ? { neg, field, value } : null;
}
// the panel shows either the catalogue (🔍 오브 검색) or only the custom orbs (✦ 커스텀 오브), in
// two parts: 내 오브 (made here, can be deleted) and 서버 (a batch of uploaded ones, ↻ for the next).
// Custom orbs show nowhere else, apart from the server ones falling now and then.
let searchMode = 'catalogue';
// the search box's terms as one test on an orb
const searchTest = (q) => {
  const terms = q.toLowerCase().split(/[\s/,]+/).map(parseTerm).filter(Boolean);
  const ok = (l, t) => (t.field ? matchesField(l, t.field, t.value) : matchesTerm(l, t.value)) !== t.neg;
  return (l) => terms.every((t) => ok(l, t));
};
// how many effects a mood stacks, read from its kind line ("공간 · 메아리+빙글" → 2): search lists
// single-effect moods first, then the ones with two, then three. Every other orb counts as one.
const fxCount = (l) => (l.cat === 'mood' ? (l.kindKo ?? l.kind).split(' · ').pop().split('+').length : 1);
// the vocal orbs light up in the search once the share server answers (vocals.js)
addEventListener('vocalschange', () => renderSearch());
function renderSearch() {
  const q = ui.searchInput.value;
  hideHitMeta();
  if (searchMode === 'custom') return renderCustomSearch(q);
  const found = q.trim() ? LAYERS.filter(searchTest(q)).sort((a, b) => fxCount(a) - fxCount(b)).slice(0, 96) : [];
  ui.searchResults.innerHTML = found.length ? '' : `<p class="empty">${ot(q.trim() ? 'noMatch' : 'searchEx')}</p>`;
  for (const l of found) ui.searchResults.append(hitEl(l));
}
function renderCustomSearch(q) {
  const test = searchTest(q);
  const box = ui.searchResults;
  box.innerHTML = '';
  const head = (key, extra = []) => {
    const h = document.createElement('div');
    h.className = 'hit-head';
    const b = document.createElement('b');
    b.textContent = ot(key);
    if (key === 'customServer') b.dataset.ic = 'globe';
    h.append(b, ...extra);
    box.append(h);
  };
  const note = (key, vars) => {
    const p = document.createElement('p');
    p.className = 'empty';
    p.innerHTML = ot(key, vars);
    box.append(p);
  };
  const small = (text) => Object.assign(document.createElement('small'), { textContent: text });
  // 내 오브
  const mine = myCustoms.map((d) => byId[d.id]).filter((l) => l && test(l));
  head('customMine', [small(String(myCustoms.length))]);
  if (!mine.length) note(myCustoms.length ? 'noMatch' : 'customMineEmpty');
  for (const l of mine) box.append(hitEl(l, { mine: true }));
  // 서버: this batch, in the order they fall
  const reload = document.createElement('button');
  reload.type = 'button';
  reload.className = 'hit-reload';
  reload.textContent = '↻';
  reload.title = ot('customReloadTip');
  reload.disabled = !!serverLoad;
  reload.addEventListener('click', () => refreshSharedOrbs());
  head('customServer', [small(S.serverOrbs.length ? `${Math.min(S.serverNext, S.serverOrbs.length)}/${S.serverOrbs.length}` : ''), reload]);
  const list = S.serverOrbs.map((r, i) => ({ r, i, l: byId[r.id] })).filter((x) => x.l && test(x.l));
  if (serverLoad && !S.serverOrbs.length) note('loading');
  else if (serverErr && !S.serverOrbs.length) note('customServerDown');
  else if (!S.serverOrbs.length) note('customServerEmpty');
  else {
    note(S.serverOrbs.length >= SERVER_BATCH ? 'customServerRain' : 'customServerFew', { n: SERVER_BATCH });
    if (!list.length) note('noMatch');
  }
  for (const x of list) box.append(hitEl(x.l, { server: x.r, fell: x.i < S.serverNext }));
}
// one orb in the panel. A custom one shows who made it and when on hover (hitMeta); one of 내 오브
// also has 🗑 (and ☁ while it hasn't been uploaded from here).
function hitEl(l, { mine = false, server = null, fell = false } = {}) {
  const item = document.createElement('div');
  // a vocal orb without the share server (vocals.js) is listed, greyed out with [X], and can't be used
  const off = !!l.vocal && !vocalsOn();
  item.className = 'hit' + (active.has(l.id) ? ' on' : '') + (fell ? ' fell' : '') + (off ? ' off' : '');
  item.style.setProperty('--g', ctint(l));
  const name = document.createElement('span');
  name.textContent = (off ? '[X] ' : '') + l.name;
  const kind = document.createElement('small');
  kind.textContent = l.kind;
  item.append(miniOrb(l), name, kind);
  const custom = mine || !!server;
  if (!custom) item.title = active.has(l.id) ? `${ot('inSong')} · ${ot('hitTip')}` : ot('hitTip');
  if (off) {
    item.title = ot('vocalsOff');
    return item;
  }
  item.addEventListener('mouseenter', () => {
    hoverOn(l.id);
    hoverCombo(l.id, item);
    if (custom) showHitMeta(item, l, server);
  });
  item.addEventListener('mouseleave', () => {
    hoverOff();
    hideHitMeta();
  });
  item.addEventListener('pointerdown', (e) => {
    hideHitMeta();
    grabFromSearch(e, l.id);
  });
  if (mine) {
    const tools = document.createElement('div');
    tools.className = 'hit-tools';
    const tool = (text, tip, run) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.textContent = text;
      b.title = tip;
      b.addEventListener('pointerdown', (e) => e.stopPropagation());
      b.addEventListener('click', (e) => {
        e.stopPropagation();
        hideHitMeta();
        run();
      });
      tools.append(b);
    };
    const def = myCustoms.find((d) => d.id === l.id);
    if (def && !customMeta[l.id]?.up && serverUp !== false) tool(ot('customUp'), ot('customUpTip'), () => openOrbUpload(def));
    tool(ot('customDel'), ot('customDelTip'), () => openOrbDelete(l.id));
    item.append(tools);
  }
  return item;
}
// the hover card on a custom orb: who uploaded it and when (a server one), or when it was made
// here and whether it went up (one of 내 오브)
const hitMeta = document.createElement('div');
hitMeta.className = 'hit-meta';
document.body.append(hitMeta);
const LOCALES = { ko: 'ko-KR', en: 'en-US', ja: 'ja-JP' };
const fmtWhen = (iso) => {
  const d = new Date(iso);
  return isNaN(d) ? '' : d.toLocaleString(LOCALES[getLang()] ?? undefined, { dateStyle: 'medium', timeStyle: 'short' });
};
function showHitMeta(item, l, server) {
  const rows = [];
  const add = (cls, text) => text && rows.push([cls, text]);
  add('t', l.name);
  if (server) {
    add('', ot('metaBy', { a: server.by || ot('metaAnon') }));
    add('', ot('metaUpAt', { t: fmtWhen(server.at) || '?' }));
  } else {
    const m = customMeta[l.id] ?? {};
    add('', ot('metaMine'));
    if (m.at) add('', ot('metaMadeAt', { t: fmtWhen(m.at) }));
    if (m.up) add('', ot('metaMyUp', { t: fmtWhen(m.up), a: m.by || ot('metaAnon') }));
    else add('', ot('metaNotUp'));
  }
  const base = byId[l.def?.base];
  if (base) add('', ot('metaBase', { n: base.name }));
  add('d', ot('hitTip'));
  hitMeta.replaceChildren(...rows.map(([cls, text]) => Object.assign(document.createElement('div'), { className: cls, textContent: text })));
  hitMeta.classList.add('show');
  const r = item.getBoundingClientRect();
  const w = hitMeta.offsetWidth, h = hitMeta.offsetHeight;
  const x = Math.max(8, Math.min(r.left + r.width / 2 - w / 2, innerWidth - w - 8));
  const y = r.bottom + 6 + h <= innerHeight - 8 ? r.bottom + 6 : Math.max(8, r.top - h - 6);
  hitMeta.style.left = `${x}px`;
  hitMeta.style.top = `${y}px`;
}
function hideHitMeta() {
  hitMeta.classList.remove('show');
}
// click: the orb drops into the field near the top; drag: it is held straight away
// (an orb already on screen comes out as a copy of it)
function grabFromSearch(e, id) {
  if (e.button !== 0) return;
  e.preventDefault();
  const x0 = e.clientX, y0 = e.clientY;
  const home = { kind: 'field', fx: 0.2 + Math.random() * 0.6, fy: 0.12 };
  const cleanup = () => {
    window.removeEventListener('pointermove', move);
    window.removeEventListener('pointerup', up);
    window.removeEventListener('pointercancel', cleanup);
  };
  const move = (ev) => {
    if (Math.hypot(ev.clientX - x0, ev.clientY - y0) < 6) return;
    cleanup();
    hoverOff();
    startDrag(ev, makeOrbEl(freshOrb(id)), home, { x: ev.clientX, y: ev.clientY });
  };
  const up = () => {
    cleanup();
    const { w, h } = fieldSize();
    rainAdd(freshOrb(id), home.fx * w, home.fy * h, { pop: true });
  };
  window.addEventListener('pointermove', move);
  window.addEventListener('pointerup', up);
  window.addEventListener('pointercancel', cleanup);
}
// 🔍 and ✦ open the same panel in their own mode; the other button switches it, the same one closes it
const SEARCH_BTNS = { catalogue: 'searchBtn', custom: 'customBtn' };
function toggleSearch(mode) {
  const btn = $(SEARCH_BTNS[mode]);
  const open = !(ui.search.classList.contains('open') && searchMode === mode);
  if (searchMode !== mode) ui.searchInput.value = '';
  searchMode = mode;
  ui.search.classList.toggle('open', open);
  if (!open) hideHitMeta();
  ui.search.classList.toggle('custom', mode === 'custom');
  for (const [m, id] of Object.entries(SEARCH_BTNS)) $(id)?.classList.toggle('on', open && m === mode);
  ui.searchInput.placeholder = ot(mode === 'custom' ? 'customPh' : 'searchPh');
  if (open) {
    // opens just under the button (it sits in the field's corner); the phone layout overrides this
    const r = btn.getBoundingClientRect();
    ui.search.style.setProperty('--search-x', `${Math.max(8, Math.min(r.left, innerWidth - ui.search.offsetWidth - 8))}px`);
    ui.search.style.setProperty('--search-y', `${r.bottom + 6}px`);
    renderSearch();
    ui.searchInput.focus();
    ui.searchInput.select();
  }
}
$('searchBtn').addEventListener('click', () => toggleSearch('catalogue'));
$('customBtn').addEventListener('click', () => toggleSearch('custom'));
ui.searchInput.addEventListener('input', renderSearch);
ui.searchInput.addEventListener('keydown', (e) => e.key === 'Escape' && toggleSearch(searchMode));

export { renderSearch, searchMode };
