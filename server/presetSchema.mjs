// The one place that decides what a shared preset may contain. The preset server runs every
// upload through validatePreset() before anything touches the disk, and the orb page runs the
// same check before sending, so the user sees the same message either way.
// Plain ESM with no imports: Node (server/) and Vite (src/) both load it as is.

export const LIMITS = {
  body: 32 * 1024, // bytes of JSON per upload
  name: 32,
  author: 24,
  description: 100,
  layers: 24,
  drawn: 8,
  sections: 12,
  sectionName: 12,
  sectionBlocks: 16, // 4-bar blocks per section
  rows: 40,
  seed: 10_000_000,
};

const ID = /^[A-Za-z0-9_-]{1,40}$/;
const RAW = /^[.0-9a-e]{64}$/; // a drawing: 64 steps, '.' or a row 0–14 in base 36

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

// The stem grid: sections (4-bar blocks each) and, per instrument row, one entry per block:
// null = silent there, -1 = playing (no seed), n >= 0 = playing with seed n.
function cleanSong(s, layerIds) {
  if (!s || typeof s !== 'object' || Array.isArray(s)) fail('스템 데이터가 올바르지 않아요');
  const sections = list(s.sections, LIMITS.sections, '섹션').map((x) => {
    if (!x || typeof x !== 'object') fail('섹션 형식이 올바르지 않아요');
    const len = int(x.len, 4, LIMITS.sectionBlocks * 4, '섹션 길이');
    if (len % 4) fail('섹션 길이는 4마디 단위여야 해요');
    return {
      name: cleanText(x.name, '섹션 이름', LIMITS.sectionName, { required: true }),
      len,
      shift: int(x.shift ?? 0, -11, 11, '조옮김'),
      v: int(x.v ?? 0, 0, 100, '섹션 변주'),
    };
  });
  if (!sections.length) fail('스템에 섹션이 없어요');
  const blocks = sections.reduce((n, x) => n + x.len / 4, 0);
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
    return { id: rid, alt, cells: cells.map((c) => (c === null ? null : int(c, -1, LIMITS.seed, '시드'))) };
  });
  if (!rows.length) fail('스템에 악기가 없어요');
  return { sections, rows };
}

// Request body -> the record to store (without id / createdAt), or a PresetError with a message
// that can be shown to the user as is. Unknown fields are dropped.
export function validatePreset(b) {
  if (!b || typeof b !== 'object' || Array.isArray(b)) fail('요청 형식이 올바르지 않아요');
  if (b.agree !== true) fail('업로드 동의가 필요해요');
  const kind = b.kind === 'stem' ? 'stem' : b.kind === 'orb' || b.kind == null ? 'orb' : fail('종류는 오브 또는 스템이어야 해요');
  const name = cleanText(b.name, '노래 제목', LIMITS.name, { required: true });
  const author = cleanText(b.author, '노래 저자', LIMITS.author);
  const description = cleanText(b.description, '노래 설명', LIMITS.description);

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

  const out = { name, author, description, kind, layers, drawn: drawn.filter((d) => layers.includes(d.id)), variation };
  if (kind === 'stem') out.song = cleanSong(b.song, new Set(layers));
  return out;
}
