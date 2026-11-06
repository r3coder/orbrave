// The one place that decides what a shared preset may contain. The preset server runs every
// upload through validatePreset() before anything touches the disk, and the orb page runs the
// same check before sending, so the user sees the same message either way.
// Plain ESM; its only import (custom orbs' knobs) is plain ESM too, so Node (server/) and Vite
// (src/) both load it as is.
import { CUSTOM_LIMITS, cleanCustomDef } from './orbEditSpec.mjs';

export const LIMITS = {
  body: 32 * 1024, // bytes of JSON per upload
  name: 32,
  author: 24,
  description: 100, // what the user types
  credits: 160, // room after it for the CC-BY credits the orb page appends (src/licenses.js)
  layers: 24,
  drawn: 8,
  sections: 12,
  sectionName: 12,
  sectionBlocks: 16, // 4-bar blocks per section
  rows: 40,
  seed: 10_000_000,
  gainMin: 5, // an orb's own volume, whole percents (orb page volume slots)
  gainMax: 400,
  vars: 16, // variations per orb (변주 slot: 01 … 16)
  varDrawings: 16, // drawn variations in one preset, all orbs together
  custom: CUSTOM_LIMITS.perPreset, // custom orbs (🎛 편집) one preset carries
  orbBody: 4 * 1024, // bytes of JSON per uploaded custom orb
};

const ID = /^[A-Za-z0-9_-]{1,40}$/;
// a drawing: 64 steps, each '.', a row 0–14 in base 36, a full-scale note (octave A–D + semitone
// 0–b in base 12), or a chord of rows / notes in parentheses
const RAW = /^(?:[.0-9a-e]|[A-D][0-9ab]|\((?:[0-9a-e]|[A-D][0-9ab]){2,15}\)){64}$/;

// Characters that can hide or disguise text: C0/C1 controls, zero-width marks, bidi overrides
// and isolates, the BOM, line/paragraph separators, and the Unicode "tag" block.
const HIDDEN = /[\u0000-\u001f\u007f-\u009f\u00ad\u034f\u061c\u115f\u1160\u17b4\u17b5\u180e\u200b-\u200f\u2028-\u202e\u2060-\u206f\u3164\ufe00-\ufe0f\ufeff\uffa0\ufff0-\ufffb]|[\u{e0000}-\u{e007f}]/u;
// markup, script URLs and links: the text is shown as plain text everywhere, but nobody needs
// these in a song title, and refusing them keeps the shared list free of link spam
const MARKUP = /[<>`{}\\]|&#|&[a-z]+;|(?:java|vb)script\s*:|data:[a-z]+\/|on[a-z]+\s*=|https?:|ftp:|www\.|\b[a-z0-9-]+\.(?:com|net|org|io|kr|ly|gg|xyz|me|co|app|link|site|top|ru|cn)\b/i;

export class PresetError extends Error {}
const fail = (msg) => {
  throw new PresetError(msg);
};

// One line of user text: normalised, whitespace collapsed, checked for hidden characters and markup.
export function cleanText(value, label, max, { required = false } = {}) {
  if (value == null) value = '';
  if (typeof value !== 'string') fail(`${label} 형식이 올바르지 않아요`);
  if (value.length > max * 4) fail(`${label}이(가) 너무 길어요 (최대 ${max}자)`);
  const s = value.normalize('NFC').replace(/\s+/g, ' ').trim();
  if (required && !s) fail(`${label}을(를) 입력해 주세요`);
  if ([...s].length > max) fail(`${label}은(는) ${max}자까지 쓸 수 있어요`);
  if (HIDDEN.test(s)) fail(`${label}에 쓸 수 없는 보이지 않는 문자가 있어요`);
  if (MARKUP.test(s)) fail(`${label}에 링크, 태그, 특수 기호(< > { } \` \\)는 쓸 수 없어요`);
  return s;
}

const int = (v, lo, hi, label) => {
  if (!Number.isSafeInteger(v) || v < lo || v > hi) fail(`${label} 값이 올바르지 않아요`);
  return v;
};
const list = (v, max, label) => {
  if (!Array.isArray(v)) fail(`${label} 형식이 올바르지 않아요`);
  if (v.length > max) fail(`${label}이(가) 너무 많아요 (최대 ${max}개)`);
  return v;
};
const id = (v, label) => {
  if (typeof v !== 'string' || !ID.test(v)) fail(`${label} 이름이 올바르지 않아요`);
  return v;
};

// The stem grid: sections (any whole number of bars, one block per started 4) and, per instrument row, one entry per block:
// null = silent there, -1 = playing (no seed), n >= 0 = playing with seed n.
// `fills` (optional): the blocks whose last bar plays as a fill.
// `vi` (optional): per block, which of the orb's variations (`vars`, 0 = 01) it plays.
// `g0` / `g1` / `cv` (optional): per block, its strength at the start and end in percent (0–150;
// g1 -1 = as at the start) and the curve between ('' or l linear, q quadratic, e eased, s S).
function cleanSong(s, layerIds) {
  if (!s || typeof s !== 'object' || Array.isArray(s)) fail('스템 데이터가 올바르지 않아요');
  const sections = list(s.sections, LIMITS.sections, '섹션').map((x) => {
    if (!x || typeof x !== 'object') fail('섹션 형식이 올바르지 않아요');
    const len = int(x.len, 1, LIMITS.sectionBlocks * 4, '섹션 길이');
    return {
      name: cleanText(x.name, '섹션 이름', LIMITS.sectionName, { required: true }),
      len,
      shift: int(x.shift ?? 0, -11, 11, '조옮김'),
      v: int(x.v ?? 0, 0, 100, '섹션 변주'),
    };
  });
  if (!sections.length) fail('스템에 섹션이 없어요');
  const blocks = sections.reduce((n, x) => n + Math.ceil(x.len / 4), 0);
  const seen = new Set();
  const rows = list(s.rows, LIMITS.rows, '스템 줄').map((r) => {
    if (!r || typeof r !== 'object') fail('스템 줄 형식이 올바르지 않아요');
    const rid = id(r.id, '스템 악기');
    if (seen.has(rid)) fail('스템 줄이 중복돼요');
    seen.add(rid);
    const alt = r.alt === true;
    // a row is one of the set's orbs, or (alt) a stand-in the song swaps in later
    if (!alt && !layerIds.has(rid)) fail('스템 줄이 오브 목록과 맞지 않아요');
    const cells = list(r.cells, blocks, '스템 칸');
    if (cells.length !== blocks) fail('스템 칸 수가 섹션 길이와 맞지 않아요');
    const out = { id: rid, alt, cells: cells.map((c) => (c === null ? null : int(c, -1, LIMITS.seed, '시드'))) };
    if (r.fills != null) {
      const fills = [...new Set(list(r.fills, blocks, '필인').map((i) => int(i, 0, blocks - 1, '필인 위치')))];
      if (fills.some((i) => out.cells[i] === null)) fail('필인은 악기가 연주하는 칸에만 넣을 수 있어요');
      if (fills.length) out.fills = fills.sort((a, b) => a - b);
    }
    if (r.vi != null) {
      const vi = list(r.vi, blocks, '스템 변주');
      if (vi.length !== blocks) fail('스템 변주 수가 섹션 길이와 맞지 않아요');
      out.vi = vi.map((k) => int(k, 0, LIMITS.vars - 1, '스템 변주'));
    }
    const perBlock = (key, label, check) => {
      if (r[key] == null) return;
      const a = list(r[key], blocks, label);
      if (a.length !== blocks) fail(`${label} 수가 섹션 길이와 맞지 않아요`);
      out[key] = a.map(check);
    };
    perBlock('g0', '스템 시작 세기', (g) => int(g, 0, 150, '스템 시작 세기'));
    perBlock('g1', '스템 끝 세기', (g) => int(g, -1, 150, '스템 끝 세기'));
    perBlock('cv', '스템 페이드 모양', (f) => (f === '' || (typeof f === 'string' && /^[lqes]$/.test(f)) ? f : fail('스템 페이드 모양이 올바르지 않아요')));
    return out;
  });
  if (!rows.length) fail('스템에 악기가 없어요');
  return { sections, rows };
}

// Request body -> the record to store (without id / createdAt), or a PresetError with a message
// that can be shown to the user as is. Unknown fields are dropped.
export function validatePreset(b) {
  if (!b || typeof b !== 'object' || Array.isArray(b)) fail('요청 형식이 올바르지 않아요');
  if (b.agree !== true) fail('업로드 동의가 필요해요');
  const kind = b.kind === 'stem' ? 'stem' : b.kind === 'orb' || b.kind == null ? 'orb' : fail('종류는 루프 또는 스템이어야 해요');
  const name = cleanText(b.name, '노래 제목', LIMITS.name, { required: true });
  const author = cleanText(b.author, '노래 저자', LIMITS.author);
  const description = cleanText(b.description, '노래 설명', LIMITS.description + 1 + LIMITS.credits);

  const drawnIds = new Set();
  const drawn = list(b.drawn ?? [], LIMITS.drawn, '그린 악기').map((d) => {
    if (!d || typeof d !== 'object') fail('그린 악기 형식이 올바르지 않아요');
    const did = id(d.id, '그린 악기');
    if (drawnIds.has(did)) fail('그린 악기가 중복돼요');
    drawnIds.add(did);
    if (typeof d.raw !== 'string' || !RAW.test(d.raw)) fail('그린 악기 데이터가 올바르지 않아요');
    return { id: did, src: id(d.src, '그린 악기의 원본'), raw: d.raw };
  });
  const layers = [...new Set(list(b.layers, LIMITS.layers, '오브').map((l) => id(l, '오브')))];
  if (!layers.length) fail('오브가 하나도 없어요');
  const variation = int(b.variation ?? 0, 0, LIMITS.seed, '변주');

  // orbs varied on their own: { orb id: seed }, only for orbs in the set
  let seeds = null;
  if (b.seeds != null) {
    if (typeof b.seeds !== 'object' || Array.isArray(b.seeds)) fail('악기별 변주 형식이 올바르지 않아요');
    const entries = Object.entries(b.seeds);
    if (entries.length > LIMITS.layers) fail('악기별 변주가 너무 많아요');
    seeds = {};
    for (const [k, v] of entries) if (layers.includes(id(k, '악기별 변주'))) seeds[k] = int(v, 0, LIMITS.seed, '악기별 변주');
    if (!Object.keys(seeds).length) seeds = null;
  }

  // orbs turned down / up on their own: { orb id: percent }, only for orbs in the set
  let gains = null;
  if (b.gains != null) {
    if (typeof b.gains !== 'object' || Array.isArray(b.gains)) fail('악기별 음량 형식이 올바르지 않아요');
    const entries = Object.entries(b.gains);
    if (entries.length > LIMITS.layers) fail('악기별 음량이 너무 많아요');
    gains = {};
    for (const [k, v] of entries) if (layers.includes(id(k, '악기별 음량'))) gains[k] = int(v, LIMITS.gainMin, LIMITS.gainMax, '악기별 음량');
    if (!Object.keys(gains).length) gains = null;
  }

  // each orb's variations (변주 slot): { orb id: { l: [seed | -1 | drawing], i: the one it plays } }
  let vars = null;
  if (b.vars != null) {
    if (typeof b.vars !== 'object' || Array.isArray(b.vars)) fail('변주 목록 형식이 올바르지 않아요');
    const entries = Object.entries(b.vars);
    if (entries.length > LIMITS.layers) fail('변주 목록이 너무 많아요');
    vars = {};
    let drawings = 0;
    for (const [k, v] of entries) {
      if (!layers.includes(id(k, '변주 목록'))) continue;
      if (!v || typeof v !== 'object') fail('변주 목록 형식이 올바르지 않아요');
      const l = list(v.l, LIMITS.vars, '변주').map((e) => {
        if (typeof e !== 'string') return int(e, -1, LIMITS.seed, '변주');
        if (!RAW.test(e)) fail('그린 변주 데이터가 올바르지 않아요');
        if (++drawings > LIMITS.varDrawings) fail(`그린 변주가 너무 많아요 (최대 ${LIMITS.varDrawings}개)`);
        return e;
      });
      if (!l.length) continue;
      vars[k] = { l, i: int(v.i ?? 0, 0, l.length - 1, '고른 변주') };
    }
    if (!Object.keys(vars).length) vars = null;
  }

  // custom orbs (🎛 편집) the set plays: their definitions travel with it, only those it uses
  const customIds = new Set();
  const custom = list(b.custom ?? [], LIMITS.custom, '커스텀 오브').map((d) => {
    const c = cleanCustomDef(d, { fail, cleanText });
    if (customIds.has(c.id)) fail('커스텀 오브가 중복돼요');
    customIds.add(c.id);
    return c;
  });
  const usedIds = new Set([...layers, ...(b.song?.rows ?? []).map((r) => r?.id)]);

  const out = { name, author, description, kind, layers, drawn: drawn.filter((d) => layers.includes(d.id)), variation, ...(seeds ? { seeds } : {}), ...(gains ? { gains } : {}), ...(vars ? { vars } : {}) };
  const usedCustom = custom.filter((c) => usedIds.has(c.id));
  if (usedCustom.length) out.custom = usedCustom;
  if (kind === 'stem') out.song = cleanSong(b.song, new Set(layers));
  return out;
}

// One custom orb uploaded on its own (POST /orbs): its definition, plus who made it.
// Request body -> the record to store, or a PresetError with a message for the user.
export function validateOrbUpload(b) {
  if (!b || typeof b !== 'object' || Array.isArray(b)) fail('요청 형식이 올바르지 않아요');
  if (b.agree !== true) fail('업로드 동의가 필요해요');
  const orb = cleanCustomDef(b.orb, { fail, cleanText });
  const author = cleanText(b.author, '만든 사람', LIMITS.author);
  return { orb, author };
}
