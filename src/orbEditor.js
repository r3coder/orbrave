// 🎛 편집: the panel that covers the orb field while an orb's sound is being changed. It knows
// nothing about the song: the orb page (orbs.js) opens it on an orb with that orb's code and
// sound kind, hears every change through onChange (and plays the orb with it), and gets the
// result back through onDone. Knobs and their ranges come from server/orbEditSpec.mjs.
import { EDIT_PARAMS, fits, readDefaults } from './orbEdit.js';
import { cleanValue } from '../server/orbEditSpec.mjs';
import { getLang } from './i18n.js';

// ---------- words ----------
const L = (ko, en, ja) => ({ ko, en, ja });
const say = (x) => x[getLang()] ?? x.ko;
const TABS = {
  sound: L('소리', 'Sound', '音色'), env: L('엔벨로프', 'Envelope', 'エンベロープ'), filter: L('필터 · EQ', 'Filter · EQ', 'フィルター · EQ'),
  tone: L('톤', 'Tone', 'トーン'), space: L('공간', 'Space', '空間'), motion: L('움직임', 'Motion', '動き'),
  synth: L('신스', 'Synth', 'シンセ'), rhythm: L('리듬', 'Rhythm', 'リズム'), mix: L('믹스', 'Mix', 'ミックス'),
};
const NAMES = {
  wave: L('파형', 'Waveform', '波形'), bank: L('드럼 머신', 'Drum machine', 'ドラムマシン'),
  oct: L('옥타브', 'Octave', 'オクターブ'), semi: L('반음 올리기', 'Semitones', '半音'), pitch: L('음높이', 'Pitch', 'ピッチ'),
  att: L('어택', 'Attack', 'アタック'), dec: L('디케이', 'Decay', 'ディケイ'), sus: L('서스테인', 'Sustain', 'サステイン'), rel: L('릴리스', 'Release', 'リリース'),
  clip: L('음 길이', 'Note length', '音の長さ'), penv: L('피치 엔벨로프', 'Pitch envelope', 'ピッチEG'),
  patt: L('피치 어택', 'Pitch attack', 'ピッチ アタック'), pdec: L('피치 디케이', 'Pitch decay', 'ピッチ ディケイ'),
  lpf: L('하이컷 (로우패스)', 'High cut (low-pass)', 'ハイカット (LPF)'), lpq: L('하이컷 공진', 'High-cut resonance', 'LPF レゾナンス'),
  hpf: L('로우컷 (하이패스)', 'Low cut (high-pass)', 'ローカット (HPF)'), hpq: L('로우컷 공진', 'Low-cut resonance', 'HPF レゾナンス'),
  bpf: L('밴드 중심', 'Band centre', 'バンド中心'), bpq: L('밴드 좁기', 'Band narrowness', 'バンドの狭さ'),
  ftype: L('필터 종류', 'Filter type', 'フィルター種類'), drive: L('필터 드라이브', 'Filter drive', 'ドライブ'),
  lpenv: L('필터 엔벨로프 양', 'Filter env amount', 'フィルターEG量'), lpa: L('필터 어택', 'Filter attack', 'フィルター アタック'),
  lpd: L('필터 디케이', 'Filter decay', 'フィルター ディケイ'), lps: L('필터 서스테인', 'Filter sustain', 'フィルター サステイン'),
  lpr: L('필터 릴리스', 'Filter release', 'フィルター リリース'),
  lfo: L('움직이는 필터', 'Moving filter', '動くフィルター'), lfow: L('LFO 모양', 'LFO shape', 'LFO 形'),
  lfor: L('한 바퀴 (마디)', 'Cycle (bars)', '一周 (小節)'), lfolo: L('LFO 아래 끝', 'LFO low', 'LFO 下'), lfohi: L('LFO 위 끝', 'LFO high', 'LFO 上'),
  shape: L('새츄레이션', 'Saturation', 'サチュレーション'), dist: L('디스토션', 'Distortion', 'ディストーション'),
  crush: L('비트 크러시', 'Bit crush', 'ビットクラッシュ'), coarse: L('샘플레이트 낮추기', 'Downsample', 'ダウンサンプル'), vowel: L('모음 필터', 'Vowel', '母音フィルター'),
  fm: L('FM 양', 'FM amount', 'FM 量'), fmh: L('FM 배음비', 'FM ratio', 'FM 比'), fmatt: L('FM 어택', 'FM attack', 'FM アタック'),
  fmdec: L('FM 디케이', 'FM decay', 'FM ディケイ'), fmsus: L('FM 서스테인', 'FM sustain', 'FM サステイン'), fmwave: L('FM 파형', 'FM wave', 'FM 波形'),
  det: L('디튠', 'Detune', 'デチューン'), uni: L('보이스 수', 'Voices', 'ボイス数'), spread: L('스테레오 폭', 'Stereo spread', 'ステレオ幅'),
  pw: L('펄스 폭', 'Pulse width', 'パルス幅'), pwrate: L('펄스 폭 흔들기', 'PWM rate', 'PWM 速さ'),
  vib: L('비브라토 속도', 'Vibrato rate', 'ビブラート速さ'), vibmod: L('비브라토 깊이', 'Vibrato depth', 'ビブラート深さ'), noise: L('노이즈 섞기', 'Noise', 'ノイズ'),
  pan: L('팬 (좌우)', 'Pan', 'パン'), apan: L('자동 팬 폭', 'Auto-pan width', 'オートパン幅'), apr: L('자동 팬 한 바퀴', 'Auto-pan cycle', 'オートパン一周'),
  trem: L('트레몰로 깊이', 'Tremolo depth', 'トレモロ深さ'), tremr: L('트레몰로 박', 'Tremolo beats', 'トレモロ拍'),
  phr: L('페이저 속도', 'Phaser rate', 'フェイザー速さ'), phd: L('페이저 깊이', 'Phaser depth', 'フェイザー深さ'),
  room: L('리버브', 'Reverb', 'リバーブ'), rsize: L('리버브 크기', 'Reverb size', 'リバーブ大きさ'), rlp: L('리버브 밝기', 'Reverb tone', 'リバーブ明るさ'),
  delay: L('딜레이', 'Delay', 'ディレイ'), dtime: L('딜레이 박자', 'Delay time', 'ディレイ拍'), dfb: L('딜레이 반복', 'Delay feedback', 'ディレイ反復'),
  jux: L('좌우 거울', 'Stereo mirror', '左右ミラー'),
  deg: L('구멍 (빠지는 확률)', 'Holes (drop chance)', '抜け (確率)'), swing: L('스윙', 'Swing', 'スウィング'),
  tempo: L('빠르기', 'Speed', '速さ'), nudge: L('밀고 당기기', 'Nudge', 'タイミング'), ply: L('연타', 'Repeat hits', '連打'),
  vol: L('볼륨', 'Volume', '音量'), comp: L('컴프 임계값', 'Compressor threshold', 'コンプ閾値'), crat: L('컴프 비율', 'Compressor ratio', 'コンプ比'),
};
const OPT = {
  tempo: { 0.5: L('½ 느리게', '½ slower', '½ 遅く'), 2: L('×2 빠르게', '×2 faster', '×2 速く') },
  jux: { rev: L('거꾸로', 'reversed', '逆再生'), press: L('반 박 당겨', 'pressed', '前寄せ') },
  lfo: { lpf: L('하이컷', 'high cut', 'ハイカット'), hpf: L('로우컷', 'low cut', 'ローカット'), bpf: L('밴드', 'band', 'バンド') },
  ftype: { '12db': L('부드럽게 12dB', 'soft 12 dB', 'ソフト 12dB'), ladder: L('래더 (아날로그)', 'ladder (analog)', 'ラダー'), '24db': L('가파르게 24dB', 'steep 24 dB', '急 24dB') },
};
const W = {
  orig: L('원래대로', 'original', '元のまま'), reset: L('되돌리기', 'reset', '戻す'), moving: L('∿ 움직임', '∿ moving', '∿ 動き'),
  name: L('오브 이름', 'Orb name', 'オーブ名'), color: L('색', 'Colour', '色'),
  ab: L('A/B 원본 듣기', 'A/B hear original', 'A/B 元の音'), abOn: L('🅰 원본 듣는 중', '🅰 hearing original', '🅰 元の音'),
  solo: L('🎧 솔로', '🎧 Solo', '🎧 ソロ'), resetAll: L('↺ 전부 되돌리기', '↺ Reset all', '↺ 全部戻す'),
  cancel: L('✕ 취소', '✕ Cancel', '✕ キャンセル'), done: L('✓ 편집 완료', '✓ Finish editing', '✓ 編集完了'),
  help: L('편집 화면 둘러보기', 'Tour of the editor', '編集画面ツアー'),
  ask: L('이 프리셋을 서버에 전송할까요?', 'Send this preset to the server?', 'このプリセットをサーバーに送信しますか？'),
  askYes: L('네', 'Yes', 'はい'),
  askKeep: L('아직 아니요, 편집을 계속합니다.', 'Not yet, keep editing.', 'まだです、編集を続けます。'),
  askEnd: L('아니요, 편집을 끝냅니다', 'No, finish editing', 'いいえ、編集を終えます'),
  changed: L('바뀐 곳 {n}개', '{n} changed', '変更 {n}'), none: L('아직 바꾼 곳이 없어요', 'Nothing changed yet', 'まだ変更なし'),
  eq: L('EQ 곡선', 'EQ curves', 'EQ カーブ'),
  hint: L('그래프의 점을 끌어서 바꿔요 · 점을 두 번 누르면 원래대로', 'Drag the points on the graphs · double-click a point to reset it', 'グラフの点をドラッグ · ダブルクリックで元に戻す'),
  lfoOff: L('위아래 선을 끌면 하이컷이 오르내리기 시작해요', 'Drag the lines to make the high cut sweep', '線をドラッグするとハイカットが動き出します'),
  more: L('그 밖에', 'More', 'その他'),
  all: L('전체', 'All', '全体'),
  allTip: L('모든 섹션을 같은 번호로 바꿔요', 'Switch every section to the same slot', '全セクションを同じ番号に'),
  slotTip: L('이 섹션의 버전 1~4: 바꿔 가며 비교해요 (새 번호는 지금 것을 복사해서 시작)', "This section's versions 1–4 to compare (a new one starts as a copy)", 'このセクションの版 1〜4 (新しい版は今のをコピー)'),
};
// the graphs: what each one is called (its knobs are dragged on it and get no slider)
const G = {
  amp: L('볼륨 엔벨로프', 'Amp envelope', '音量エンベロープ'), penv: L('피치 엔벨로프', 'Pitch envelope', 'ピッチエンベロープ'),
  filter: L('필터 곡선 · 뒤는 지금 소리', 'Filter curve · behind: the sound now', 'フィルター · 背景は今の音'),
  fenv: L('필터 엔벨로프', 'Filter envelope', 'フィルターエンベロープ'), lfo: L('움직이는 필터', 'Moving filter', '動くフィルター'),
  pan: L('좌우 위치 · 자동 팬', 'Stereo position · auto-pan', '定位 · オートパン'), drive: L('드라이브', 'Drive', 'ドライブ'),
  lofi: L('로파이', 'Lo-fi', 'ローファイ'), fm: L('FM 엔벨로프', 'FM envelope', 'FM エンベロープ'), saw: L('슈퍼소', 'Supersaw', 'スーパーソウ'),
  pulse: L('펄스', 'Pulse', 'パルス'), vib: L('비브라토', 'Vibrato', 'ビブラート'), phaser: L('페이저', 'Phaser', 'フェイザー'),
  reverb: L('리버브', 'Reverb', 'リバーブ'), delay: L('딜레이', 'Delay', 'ディレイ'), comp: L('컴프레서', 'Compressor', 'コンプ'),
};
const GRAPHS = {
  env: [
    { type: 'env', t: 'amp', a: 'att', d: 'dec', s: 'sus', r: 'rel' },
    { type: 'env', t: 'penv', amt: 'penv', a: 'patt', d: 'pdec' },
  ],
  filter: [
    { type: 'filter', t: 'filter', keys: ['lpf', 'lpq', 'hpf', 'hpq', 'bpf', 'bpq'] },
    { type: 'env', t: 'fenv', amt: 'lpenv', a: 'lpa', d: 'lpd', s: 'lps', r: 'lpr' },
  ],
  tone: [
    { type: 'pad', t: 'drive', x: 'shape', y: 'dist' },
    { type: 'pad', t: 'lofi', x: 'crush', y: 'coarse', rx: true },
  ],
  synth: [
    { type: 'env', t: 'fm', amt: 'fm', a: 'fmatt', d: 'fmdec', s: 'fmsus' },
    { type: 'pad', t: 'saw', x: 'det', y: 'spread' },
    { type: 'pad', t: 'pulse', x: 'pw', y: 'pwrate' },
    { type: 'pad', t: 'vib', x: 'vib', y: 'vibmod' },
  ],
  motion: [
    { type: 'lfo', t: 'lfo', keys: ['lfolo', 'lfohi'] },
    { type: 'pan', t: 'pan', keys: ['pan', 'apan'] },
  ],
  space: [
    { type: 'pad', t: 'reverb', x: 'room', y: 'rsize' },
    { type: 'pad', t: 'delay', x: 'delay', y: 'dfb' },
  ],
  mix: [{ type: 'pad', t: 'comp', x: 'comp', y: 'crat', rx: true }],
};
const SLOT_N = [0, 1, 2, 3];
// knobs the panel no longer shows (the motion section kept to a moving filter, pan and tremolo).
// They stay in the spec, so custom orbs made with them still play as they were.
const HIDDEN = new Set(['lfo', 'lfow', 'apr', 'phr', 'phd']);
// choices with many buttons: a line of their own in a wide section
const FULL_OPTS = new Set(['wave', 'bank']);
// sections that take the panel's whole width (the others sit two to a line when there is room)
const WIDE = new Set(['sound', 'env', 'filter']);
const gKeys = (g) => g.keys ?? [g.x, g.y, g.amt, g.a, g.d, g.s, g.r].filter(Boolean);
const EQ_PRESETS = [
  [L('저음 강화', 'Bass boost', '低音強調'), { hpf: 70, hpq: 9 }],
  [L('초저음', 'Sub boost', '超低音'), { hpf: 42, hpq: 12 }],
  [L('펀치', 'Punch', 'パンチ'), { hpf: 120, hpq: 7 }],
  [L('고음 강화', 'Treble boost', '高音強調'), { lpf: 7000, lpq: 9 }],
  [L('공기감', 'Air', '空気感'), { lpf: 13000, lpq: 12 }],
  [L('스마일', 'Smile', 'スマイル'), { hpf: 65, hpq: 8, lpf: 9000, lpq: 8 }],
  [L('전화기', 'Telephone', '電話'), { bpf: 1100, bpq: 0.6 }],
  [L('가볍게 (저음 컷)', 'Light (low cut)', '軽く (ローカット)'), { hpf: 260, hpq: 0 }],
  [L('포근하게 (고음 컷)', 'Warm (high cut)', '柔らかく (ハイカット)'), { lpf: 2400, lpq: 0 }],
];
const EQ_KEYS = ['lpf', 'lpq', 'hpf', 'hpq', 'bpf', 'bpq'];

// ---------- values ----------
const SEC = new Set(['att', 'dec', 'rel', 'patt', 'pdec', 'lpa', 'lpd', 'lpr', 'fmatt', 'fmdec']);
const HZ = new Set(['lpf', 'hpf', 'bpf', 'lfolo', 'lfohi', 'rlp']);
const ST = new Set(['semi', 'pitch', 'penv']);
const PCT = new Set(['sus', 'room', 'delay', 'dfb', 'deg', 'trem', 'apan', 'spread', 'lps', 'fmsus', 'noise', 'det', 'phd']);
function fmt(k, v) {
  if (typeof v === 'string') return OPT[k]?.[v] ? say(OPT[k][v]) : v;
  if (HZ.has(k)) return v >= 1000 ? `${+(v / 1000).toFixed(v >= 10000 ? 1 : 2)} kHz` : `${Math.round(v)} Hz`;
  if (SEC.has(k)) return v < 1 ? `${Math.round(v * 1000)} ms` : `${+v.toFixed(2)} s`;
  if (ST.has(k)) return `${v > 0 ? '+' : ''}${v} st`;
  if (PCT.has(k)) return `${Math.round(v * 100)}%`;
  if (k === 'vol') return `${v}%`;
  if (k === 'comp') return v ? `${v} dB` : 'off';
  if (k === 'crat') return `${v}:1`;
  if (k === 'oct') return `${v > 0 ? '+' : ''}${v}`;
  if (k === 'pan') return v === 0.5 ? 'C' : v < 0.5 ? `L${Math.round((0.5 - v) * 200)}` : `R${Math.round((v - 0.5) * 200)}`;
  if (k === 'nudge') return v ? `${v > 0 ? '+' : ''}${v}/32` : '0';
  if (k === 'clip') return `×${v}`;
  if (k === 'crush') return v >= 16 ? 'off' : `${v} bit`;
  if (k === 'coarse') return v <= 1 ? 'off' : `÷${v}`;
  if (k === 'ply') return `×${v}`;
  if (k === 'pwrate' || k === 'vib' || k === 'phr') return `${+v.toFixed(2)} Hz`;
  return String(+(+v).toFixed(3));
}
const SLIDE = 1000;
const toSlider = (p, v) => (p.log ? Math.log(v / p.min) / Math.log(p.max / p.min) : (v - p.min) / (p.max - p.min)) * SLIDE;
const fromSlider = (p, t) => {
  const x = t / SLIDE;
  return p.log ? p.min * (p.max / p.min) ** x : p.min + x * (p.max - p.min);
};

const el = (tag, cls, text) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
};

// ---------- the panel ----------
// root: the empty <section> to fill. hooks: onChange(state) on every change, onDone({ name,
// color, edit, upload }) / onCancel(), paintOrb(el, orb), spectrum() -> Uint8Array | null
// (the edited orb's analyser, 1024-point), sampleRate().
// One scrolling page, a section per group: its graphs first (their points are the knobs), then
// choice buttons, then sliders only for what no graph moves.
export function createOrbEditor(root, hooks) {
  let st = null; // { orb, kind, defaults: { values, moving }, edit, ab, solo, color }
  let raf = 0;

  const head = el('div', 'oe-head');
  const ball = el('div', 'oe-ball');
  const nameIn = el('input', 'oe-name');
  nameIn.maxLength = 24;
  nameIn.spellcheck = false;
  const colorIn = el('input', 'oe-color');
  colorIn.type = 'color';
  const info = el('span', 'oe-info');
  const abBtn = el('button', 'oe-ab');
  const soloBtn = el('button', 'oe-solo');
  const resetBtn = el('button', 'oe-reset');
  const cancelBtn = el('button', 'oe-cancel');
  const doneBtn = el('button', 'oe-done go');
  // ?: a tour of the panel (the orb page runs it: hooks.onHelp)
  const helpBtn = el('button', 'oe-help', '?');
  helpBtn.setAttribute('aria-label', '?');
  // ✓ 편집 완료 asks first whether the orb goes to the server too
  const ask = el('dialog', 'import oe-ask');
  const askText = el('p', 'oe-ask-q');
  const askYes = el('button', 'go'), askKeep = el('button', 'ghost'), askEnd = el('button');
  const askBtns = el('div', 'oe-ask-btns');
  askBtns.append(askYes, askKeep, askEnd);
  ask.append(askText, askBtns);
  const who = el('div', 'oe-who');
  who.append(nameIn, info);
  const tools = el('div', 'oe-tools');
  // 전체 1 2 3 4: every section to the same slot at once
  const allBox = el('div', 'oe-slots all');
  const allLabel = el('span', 'oe-slab');
  const allBtns = SLOT_N.map((i) => {
    const b = el('button', 'oe-slot', String(i + 1));
    b.addEventListener('click', () => {
      for (const grp of Object.keys(TABS)) pick(grp, i);
      emit({ rerender: true });
    });
    return b;
  });
  allBox.append(allLabel, ...allBtns);
  tools.append(allBox, abBtn, soloBtn, resetBtn, cancelBtn, doneBtn, helpBtn);
  head.append(ball, colorIn, who, tools);
  root.append(ask);
  const pane = el('div', 'oe-pane');
  root.append(head, pane);
  // the field under the panel must not see these clicks (it grabs orbs and tucks tabs away)
  for (const ev of ['pointerdown', 'click', 'wheel']) root.addEventListener(ev, (e) => e.stopPropagation());

  const changed = () => Object.keys(st.edit).length;
  const valueOf = (k) => st.edit[k] ?? st.defaults.values[k] ?? EDIT_PARAMS[k].def;
  const isSet = (k) => k in st.edit;
  function emit({ rerender = false } = {}) {
    renderHead();
    if (rerender) renderPane();
    else updateAll();
    hooks.onChange?.(state());
  }
  // Slots 1–4: each section keeps four versions of its knobs (st.slots[i] holds every key; a
  // section reads its own keys from the slot it has picked). The edit that plays is each
  // section's picked slot put together. A slot a section hasn't used yet starts as a copy of the
  // one it was showing, so a change can be compared with what it was.
  const grpOf = (k) => EDIT_PARAMS[k].grp;
  const slotOf = (k) => st.slots[st.pick[grpOf(k)] ?? 0];
  function compose() {
    const out = {};
    for (const k of Object.keys(EDIT_PARAMS)) {
      const v = slotOf(k)[k];
      if (v !== undefined) out[k] = v;
    }
    st.edit = out;
    syncKind();
  }
  // a new waveform brings its own knobs (supersaw voices, pulse width)
  function syncKind() {
    if (!st.kind.synth) return;
    const w = st.edit.wave ?? st.defaults.values.wave;
    st.kind = { ...st.kind, wave: w, supersaw: w === 'supersaw', pulse: w === 'pulse' };
  }
  function pick(grp, i) {
    const was = st.pick[grp] ?? 0;
    if (was === i) return;
    if (!st.used.has(`${grp}:${i}`)) {
      for (const k of Object.keys(EDIT_PARAMS)) {
        if (grpOf(k) !== grp) continue;
        if (st.slots[was][k] === undefined) delete st.slots[i][k];
        else st.slots[i][k] = st.slots[was][k];
      }
      st.used.add(`${grp}:${i}`);
    }
    st.pick[grp] = i;
    compose();
  }
  function set(k, v) {
    const c = cleanValue(k, v), s = slotOf(k);
    if (c === undefined) delete s[k];
    else s[k] = c;
    if (st.ab) st.ab = false; // touching a knob means listening to the edit
    compose();
  }
  const state = () => st && { orb: st.orb, edit: { ...st.edit }, ab: st.ab, solo: st.solo, name: nameIn.value, color: st.color };

  function renderHead() {
    ball.replaceChildren();
    hooks.paintOrb?.(ball, st.orb, st.color);
    const n = changed();
    info.textContent = n ? say(W.changed).replace('{n}', n) : say(W.none);
    abBtn.textContent = say(st.ab ? W.abOn : W.ab);
    abBtn.classList.toggle('on', st.ab);
    abBtn.disabled = !n;
    soloBtn.textContent = say(W.solo);
    soloBtn.classList.toggle('on', st.solo);
    resetBtn.textContent = say(W.resetAll);
    resetBtn.disabled = !n;
    cancelBtn.textContent = say(W.cancel);
    doneBtn.textContent = say(W.done);
    doneBtn.disabled = !n;
    helpBtn.title = say(W.help);
    nameIn.placeholder = say(W.name);
    colorIn.title = say(W.color);
    allLabel.textContent = say(W.all);
    allBox.title = say(W.allTip);
    const picks = Object.keys(TABS).map((g) => st.pick[g] ?? 0);
    allBtns.forEach((b, i) => b.classList.toggle('on', picks.every((p) => p === i)));
  }

  // ---- values on a 0…1 scale (log knobs on a log scale), `rev` flips it
  const norm = (k, v, rev) => {
    const t = Math.min(1, Math.max(0, toSlider(EDIT_PARAMS[k], v) / SLIDE));
    return rev ? 1 - t : t;
  };
  const denorm = (k, t, rev) => fromSlider(EDIT_PARAMS[k], Math.min(1, Math.max(0, rev ? 1 - t : t)) * SLIDE);
  const shown = (k) => (!isSet(k) && st.defaults.moving[k] ? say(W.moving) : fmt(k, valueOf(k)));

  // ---- sections
  const inGrp = (grp) => Object.keys(EDIT_PARAMS).filter((k) => EDIT_PARAMS[k].grp === grp);
  const fitting = (grp) => inGrp(grp).filter((k) => fits(k, st.kind) && !HIDDEN.has(k));
  const graphsOf = (grp) => (GRAPHS[grp] ?? []).filter((g) => gKeys(g).every((k) => fits(k, st.kind)));
  const sections = new Map(); // grp -> { count, back, keys }
  const rows = new Map(); // key -> update()
  let graphs = []; // { g, cv, vals, draw, handles, hover, drag }

  function renderPane() {
    const top = pane.scrollTop;
    pane.replaceChildren();
    rows.clear();
    sections.clear();
    graphs = [];
    eqBtns = [];
    pane.append(el('p', 'oe-hint', say(W.hint)));
    for (const grp of Object.keys(TABS)) {
      const keys = fitting(grp);
      if (!keys.length) continue;
      const sec = el('section', 'oe-sec' + (WIDE.has(grp) ? ' wide' : ''));
      const h = el('h3', 'oe-sh');
      const count = el('i', 'oe-dot');
      const back = el('button', 'oe-back', '↺');
      back.title = say(W.reset);
      back.addEventListener('click', () => {
        for (const k of inGrp(grp)) set(k, undefined);
        emit({ rerender: keys.includes('wave') });
      });
      // 1 2 3 4: this section's versions
      const slotBox = el('div', 'oe-slots');
      slotBox.title = say(W.slotTip);
      const slotBtns = SLOT_N.map((i) => {
        const b = el('button', 'oe-slot', String(i + 1));
        b.addEventListener('click', () => {
          const wave = st.edit.wave;
          pick(grp, i);
          emit({ rerender: st.edit.wave !== wave });
        });
        return b;
      });
      slotBox.append(...slotBtns);
      const title = el('span', 'oe-st', say(TABS[grp]));
      title.append(count);
      h.append(title, back, slotBox);
      sec.append(h);
      sections.set(grp, { count, back, keys: inGrp(grp), slotBtns });
      if (grp === 'filter') sec.append(eqPresets());
      const gs = graphsOf(grp);
      const covered = new Set(gs.flatMap(gKeys));
      const wide = gs.filter((g) => g.type !== 'pad'), pads = gs.filter((g) => g.type === 'pad');
      if (wide.length) {
        const box = el('div', 'oe-wides');
        for (const g of wide) box.append(makeGraph(g));
        sec.append(box);
      }
      if (pads.length) {
        const grid = el('div', 'oe-pads');
        for (const g of pads) grid.append(makeGraph(g));
        sec.append(grid);
      }
      const rest = keys.filter((k) => !covered.has(k));
      if (rest.length) {
        const list = el('div', 'oe-rows');
        // choices first, then sliders
        for (const k of [...rest.filter((k) => EDIT_PARAMS[k].opts), ...rest.filter((k) => !EDIT_PARAMS[k].opts)]) list.append(knob(k));
        sec.append(list);
      }
      pane.append(sec);
    }
    updateAll();
    pane.scrollTop = top;
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(loop);
  }
  function updateAll() {
    for (const u of rows.values()) u();
    for (const [b, vals] of eqBtns) b.classList.toggle('on', eqMatch(vals));
    for (const [grp, s] of sections) {
      const n = s.keys.filter(isSet).length;
      s.count.textContent = n ? String(n) : '';
      s.count.hidden = !n;
      s.back.hidden = !n;
      s.slotBtns.forEach((b, i) => {
        b.classList.toggle('on', (st.pick[grp] ?? 0) === i);
        b.classList.toggle('used', st.used.has(`${grp}:${i}`) && s.keys.some((k) => st.slots[i][k] !== undefined));
      });
    }
    for (const gr of graphs) drawGraph(gr);
  }

  let eqBtns = [];
  const eqMatch = (vals) => EQ_KEYS.every((k) => st.edit[k] === cleanValue(k, vals[k]));
  function eqPresets() {
    const eq = el('div', 'oe-eq');
    eq.append(el('b', '', say(W.eq)));
    eqBtns = [];
    for (const [label, vals] of EQ_PRESETS) {
      const b = el('button', 'oe-opt', say(label));
      eqBtns.push([b, vals]);
      b.addEventListener('click', () => {
        for (const k of EQ_KEYS) set(k, undefined);
        for (const [k, v] of Object.entries(vals)) set(k, v);
        emit();
      });
      eq.append(b);
    }
    return eq;
  }

  // ---- one knob that no graph moves: choice buttons, or a slider
  function knob(k) {
    const p = EDIT_PARAMS[k];
    const row = el('div', 'oe-row');
    row.dataset.k = k;
    const label = el('label', 'oe-label', say(NAMES[k]));
    const val = el('span', 'oe-val');
    const back = el('button', 'oe-back', '↺');
    back.title = say(W.reset);
    back.addEventListener('click', () => {
      set(k, undefined);
      emit({ rerender: k === 'wave' });
    });
    let update;
    if (p.opts) {
      const box = el('div', 'oe-opts');
      const opts = k === 'bank' ? p.opts.filter((o) => st.kind.banks.includes(o)) : p.opts;
      const bar = k === 'lfor' || k === 'apr' ? (getLang() === 'en' ? ' bar' : getLang() === 'ja' ? ' 小節' : ' 마디') : '';
      const btns = opts.map((o) => {
        const b = el('button', 'oe-opt', fmt(k, o) + bar);
        b.addEventListener('click', () => {
          // the one on already: a second click puts the orb's own back
          if (st.edit[k] === o) {
            set(k, undefined);
            emit({ rerender: k === 'wave' });
            return;
          }
          set(k, o);
          // a moving filter starts from where the orb's own filter is
          if (k === 'lfo' && st.edit.lfolo === undefined && st.defaults.values.lfo !== o) startLfo(o);
          emit({ rerender: k === 'wave' });
        });
        box.append(b);
        return [o, b];
      });
      update = () => {
        const v = st.edit[k], d = st.defaults.values[k];
        // what plays: the choice made here, or (dimmer) the orb's own
        for (const [o, b] of btns) {
          b.classList.toggle('on', v === o);
          b.classList.toggle('own', v === undefined && d === o);
          b.title = d === o ? say(W.orig) : '';
        }
      };
      row.classList.add('opt');
      if (FULL_OPTS.has(k)) row.classList.add('full');
      row.append(label, box, back);
    } else {
      const range = el('input', 'oe-range');
      range.type = 'range';
      range.min = 0;
      range.max = SLIDE;
      range.addEventListener('input', () => {
        set(k, fromSlider(p, +range.value));
        emit();
      });
      range.addEventListener('dblclick', () => {
        set(k, undefined);
        emit();
      });
      update = () => {
        const v = valueOf(k);
        if (document.activeElement !== range || !isSet(k)) range.value = Math.round(toSlider(p, v));
        val.textContent = shown(k);
        val.title = st.defaults.moving[k] ?? '';
      };
      row.append(label, range, val, back);
    }
    rows.set(k, () => {
      update();
      row.classList.toggle('set', isSet(k));
    });
    return row;
  }
  function startLfo(f) {
    const v = st.edit[f] ?? st.defaults.values[f];
    if (v) {
      set('lfolo', Math.max(80, v / 4));
      set('lfohi', Math.min(18000, v * 2));
    }
  }

  // ---------- graphs ----------
  // Each graph draws itself and lists its handles: { x, y, keys, move(x, y, w, h) }. Dragging a
  // handle moves its knobs; double-clicking it puts them back. A pad's handle can be grabbed
  // anywhere on it (the point jumps there).
  function makeGraph(g) {
    const wrap = el('div', `oe-graph ${g.type}`);
    const top = el('div', 'oe-gh');
    const vals = el('div', 'oe-gv');
    const back = el('button', 'oe-back', '↺');
    back.title = say(W.reset);
    back.addEventListener('click', () => {
      for (const k of gKeys(g)) set(k, undefined);
      if (g.type === 'lfo') set('lfo', undefined);
      emit();
    });
    top.append(el('b', '', say(G[g.t])), back);
    const cv = el('canvas');
    wrap.append(top, cv, vals);
    const gr = { g, cv, vals, back, handles: [], hover: null, drag: null };
    graphs.push(gr);
    const at = (e) => {
      const r = cv.getBoundingClientRect();
      return [e.clientX - r.left, e.clientY - r.top, r.width, r.height];
    };
    const nearest = (x, y, reach = 22) => {
      let best = null, bd = reach;
      for (const h of gr.handles) {
        const d = Math.hypot(h.x - x, h.y - y);
        if (d < bd) [best, bd] = [h, d];
      }
      return best;
    };
    let scrollFrom = null; // a touch that missed every point scrolls the page instead
    cv.addEventListener('pointerdown', (e) => {
      const [x, y, w, h] = at(e);
      const touch = e.pointerType === 'touch';
      let hd = nearest(x, y, touch ? 30 : 22);
      if (!hd && g.type === 'pad' && !touch) hd = gr.handles[0];
      cv.setPointerCapture(e.pointerId);
      if (!hd) {
        scrollFrom = touch ? [e.clientY, pane.scrollTop] : null;
        return;
      }
      e.preventDefault();
      gr.drag = hd;
      hd.move(x, y, w, h);
      emit();
    });
    cv.addEventListener('pointermove', (e) => {
      if (scrollFrom) {
        pane.scrollTop = scrollFrom[1] - (e.clientY - scrollFrom[0]);
        return;
      }
      const [x, y, w, h] = at(e);
      if (gr.drag) {
        gr.drag.move(x, y, w, h);
        emit();
        return;
      }
      const hv = nearest(x, y) ?? (g.type === 'pad' ? gr.handles[0] : null);
      cv.style.cursor = nearest(x, y) ? 'grab' : g.type === 'pad' ? 'crosshair' : 'default';
      if (hv !== gr.hover) {
        gr.hover = hv;
        drawGraph(gr);
      }
    });
    const up = () => {
      gr.drag = null;
      scrollFrom = null;
    };
    cv.addEventListener('pointerup', up);
    cv.addEventListener('pointercancel', up);
    cv.addEventListener('pointerleave', () => {
      if (gr.drag) return;
      gr.hover = null;
      drawGraph(gr);
    });
    cv.addEventListener('dblclick', (e) => {
      const [x, y] = at(e);
      const hd = nearest(x, y) ?? (g.type === 'pad' ? gr.handles[0] : null);
      if (!hd) return;
      for (const k of hd.keys) set(k, undefined);
      emit();
    });
    return wrap;
  }

  const css = (name) => getComputedStyle(root).getPropertyValue(name).trim() || '#ccc';
  function sizeCanvas(cv) {
    const w = cv.clientWidth, h = cv.clientHeight, dpr = devicePixelRatio || 1;
    if (cv.width !== Math.round(w * dpr) || cv.height !== Math.round(h * dpr)) {
      cv.width = Math.round(w * dpr);
      cv.height = Math.round(h * dpr);
    }
    const g = cv.getContext('2d');
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, w, h);
    return { g, w, h };
  }
  const line = (g, pts) => {
    g.beginPath();
    pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)));
  };
  function drawHandles(gr, g) {
    const acc = css('--g');
    for (const hd of gr.handles) {
      const on = hd.keys.some(isSet), hot = gr.hover === hd || gr.drag === hd;
      g.beginPath();
      g.arc(hd.x, hd.y, hot ? 8 : 6, 0, Math.PI * 2);
      if (on) {
        g.fillStyle = acc;
        g.fill();
      } else {
        g.fillStyle = css('--bg');
        g.fill();
        g.strokeStyle = acc;
        g.lineWidth = 2;
        g.stroke();
      }
      if (hd.label) {
        g.font = '10px sans-serif';
        g.fillStyle = css('--dim');
        g.fillText(hd.label, hd.x + 9, hd.y - 7);
      }
    }
    // the knobs this graph moves, under it: hovered / dragged ones lit up
    const hot = new Set((gr.drag ?? gr.hover)?.keys ?? []);
    gr.vals.replaceChildren(
      ...gKeys(gr.g).map((k) => {
        const s = el('span', (isSet(k) ? 'set' : '') + (hot.has(k) ? ' hot' : ''));
        s.append(say(NAMES[k]) + ' ', el('b', '', shown(k)));
        return s;
      }),
    );
    gr.back.hidden = !gKeys(gr.g).some(isSet) && !(gr.g.type === 'lfo' && isSet('lfo'));
  }
  function grid(g, w, h, pad, n = 4) {
    g.strokeStyle = css('--line');
    g.lineWidth = 1;
    for (let i = 1; i < n; i++) {
      const x = pad + ((w - 2 * pad) * i) / n, y = pad + ((h - 2 * pad) * i) / n;
      line(g, [[x, pad], [x, h - pad]]);
      g.stroke();
      line(g, [[pad, y], [w - pad, y]]);
      g.stroke();
    }
  }

  // An envelope: attack (sideways), the peak (up/down when it has an amount), decay to the
  // sustain level, release. Each stage has a zone of its own on a square-root time scale, so
  // short times stay wide enough to grab and the points don't jump while one is dragged.
  function drawEnv(gr) {
    const { g, w, h } = sizeCanvas(gr.cv);
    const e = gr.g, pad = 14;
    const signed = e.amt && EDIT_PARAMS[e.amt].min < 0;
    const span = e.amt ? Math.max(Math.abs(EDIT_PARAMS[e.amt].min), EDIT_PARAMS[e.amt].max) : 1;
    const base = signed ? h / 2 : h - pad, room = signed ? h / 2 - pad : h - 2 * pad;
    const Y = (v) => base - v * room;
    const zones = { a: [0, 0.26], d: [0.26, 0.26], hold: [0.52, 0.18], r: [0.7, 0.26] };
    const X = (z, t, max) => pad + (zones[z][0] + Math.sqrt(Math.min(1, Math.max(0, t / max))) * zones[z][1]) * (w - 2 * pad);
    const T = (z, x, max) => ((Math.min(1, Math.max(0, ((x - pad) / (w - 2 * pad) - zones[z][0]) / zones[z][1]))) ** 2) * max;
    const mx = (k) => EDIT_PARAMS[k].max;
    const peak = e.amt ? valueOf(e.amt) / span : 1;
    const s = e.s ? valueOf(e.s) : 0;
    const xa = X('a', valueOf(e.a), mx(e.a)), xd = X('d', valueOf(e.d), mx(e.d));
    const pts = [[pad, base], [xa, Y(peak)], [xd, Y(peak * s)]];
    let xr = null;
    if (e.r) {
      const xh = pad + 0.7 * (w - 2 * pad);
      xr = X('r', valueOf(e.r), mx(e.r));
      pts.push([xh, Y(peak * s)], [xr, base], [w - pad, base]);
    } else pts.push([w - pad, Y(peak * s)]);
    g.strokeStyle = css('--line');
    g.lineWidth = 1;
    line(g, [[pad, base], [w - pad, base]]);
    g.stroke();
    if (e.r) {
      g.setLineDash([3, 4]);
      for (const z of [0.52, 0.7]) {
        const x = pad + z * (w - 2 * pad);
        line(g, [[x, pad], [x, h - pad]]);
        g.stroke();
      }
      g.setLineDash([]);
    }
    const acc = css('--g');
    line(g, pts);
    g.strokeStyle = acc;
    g.lineWidth = 2;
    g.stroke();
    g.lineTo(w - pad, base);
    g.lineTo(pad, base);
    g.globalAlpha = 0.15;
    g.fillStyle = acc;
    g.fill();
    g.globalAlpha = 1;
    const amtOf = (y) => ((base - y) / room) * span;
    gr.handles = [
      {
        x: xa, y: Y(peak), keys: [e.a, e.amt].filter(Boolean),
        move: (x, y) => {
          set(e.a, T('a', x, mx(e.a)));
          if (e.amt) set(e.amt, amtOf(y));
        },
      },
      {
        x: xd, y: Y(peak * s), keys: [e.d, e.s].filter(Boolean),
        move: (x, y) => {
          set(e.d, T('d', x, mx(e.d)));
          // the sustain level is a share of the peak (left alone while the peak is flat)
          const py = Y(e.amt ? valueOf(e.amt) / span : 1);
          if (e.s && Math.abs(py - base) > 6) set(e.s, (base - y) / (base - py));
        },
      },
    ];
    if (e.r) gr.handles.push({ x: xr, y: base, keys: [e.r], move: (x) => set(e.r, T('r', x, mx(e.r))) });
    drawHandles(gr, g);
  }

  // the filters' combined response, from real biquads (one offline context, made once)
  let octx = null;
  const N = 160, freqs = new Float32Array(N);
  for (let i = 0; i < N; i++) freqs[i] = 20 * 1000 ** (i / (N - 1));
  const mag = new Float32Array(N), ph = new Float32Array(N);
  function response(type, f, q, steep) {
    octx ??= new OfflineAudioContext(1, 128, 44100);
    const b = octx.createBiquadFilter();
    b.type = type;
    b.frequency.value = f;
    b.Q.value = type === 'bandpass' ? Math.max(0.1, q) : q;
    b.getFrequencyResponse(freqs, mag, ph);
    return Array.from(mag, (m) => (steep ? m * m : m));
  }
  function drawFilter(gr) {
    const { g, w, h } = sizeCanvas(gr.cv);
    const pad = 12, top = 24, bot = -36; // dB range
    const X = (f) => pad + (Math.log(f / 20) / Math.log(1000)) * (w - 2 * pad);
    const Y = (db) => pad + ((top - Math.min(top, Math.max(bot, db))) / (top - bot)) * (h - 2 * pad);
    // the sound right now, behind the curve
    const sp = hooks.spectrum?.();
    if (sp) {
      const sr = hooks.sampleRate?.() ?? 48000, bins = sp.length;
      g.fillStyle = css('--g');
      g.globalAlpha = 0.18;
      for (let i = 0; i < N - 1; i++) {
        const k = Math.min(bins - 1, Math.round((freqs[i] / (sr / 2)) * bins));
        const v = sp[k] / 255;
        g.fillRect(X(freqs[i]), h - pad - v * (h - 2 * pad), Math.max(1, X(freqs[i + 1]) - X(freqs[i]) - 0.5), v * (h - 2 * pad));
      }
      g.globalAlpha = 1;
    }
    g.strokeStyle = css('--line');
    g.lineWidth = 1;
    g.font = '9px sans-serif';
    for (const [f, t] of [[100, '100'], [1000, '1k'], [10000, '10k']]) {
      line(g, [[X(f), pad], [X(f), h - pad]]);
      g.stroke();
      g.fillStyle = css('--dim');
      g.fillText(t, X(f) + 3, h - pad - 3);
    }
    line(g, [[pad, Y(0)], [w - pad, Y(0)]]);
    g.stroke();
    const steep = valueOf('ftype') === '24db' || valueOf('ftype') === 'ladder';
    const has = (k) => isSet(k) || st.defaults.values[k] !== undefined;
    const moving = st.edit.lfo ?? st.defaults.values.lfo;
    const lp = moving === 'lpf' ? null : has('lpf') ? valueOf('lpf') : null;
    const hp = moving === 'hpf' ? null : has('hpf') ? valueOf('hpf') : null;
    const bp = moving === 'bpf' ? null : has('bpf') ? valueOf('bpf') : null;
    const total = new Array(N).fill(1);
    const mul = (arr) => arr.forEach((m, i) => (total[i] *= m));
    if (lp != null && lp < 19999) mul(response('lowpass', lp, valueOf('lpq'), steep));
    if (hp != null && hp > 20) mul(response('highpass', hp, valueOf('hpq'), steep));
    if (bp != null) mul(response('bandpass', bp, valueOf('bpq'), false));
    line(g, total.map((m, i) => [X(freqs[i]), Y(20 * Math.log10(Math.max(1e-4, m)))]));
    g.strokeStyle = css('--g');
    g.lineWidth = 2;
    g.stroke();
    const fOf = (x, wd) => 20 * 1000 ** Math.min(1, Math.max(0, (x - pad) / (wd - 2 * pad)));
    const qY = (k) => h - pad - norm(k, valueOf(k)) * (h - 2 * pad);
    const qOf = (k, y, ht) => denorm(k, (ht - pad - y) / (ht - 2 * pad));
    const fh = (fk, qk, label, f, fallback) => ({
      x: X(Math.min(20000, Math.max(20, f ?? fallback))), y: qY(qk), keys: [fk, qk], label,
      move: (x, y, wd, ht) => {
        set(fk, fOf(x, wd));
        set(qk, qOf(qk, y, ht));
      },
    });
    gr.handles = [fh('hpf', 'hpq', 'HP', hp, 20), fh('lpf', 'lpq', 'LP', lp, 20000), fh('bpf', 'bpq', 'BP', bp, valueOf('bpf'))];
    drawHandles(gr, g);
  }

  // The moving filter: its sweep over 8 bars, between the two lines (dragged up and down)
  const WAVE = {
    sine: (p) => 0.5 + 0.5 * Math.sin(p * 2 * Math.PI),
    tri: (p) => 1 - Math.abs(2 * (p % 1) - 1),
    saw: (p) => p % 1,
    isaw: (p) => 1 - (p % 1),
    square: (p) => (p % 1 < 0.5 ? 1 : 0),
    perlin: (p) => 0.5 + 0.3 * Math.sin(p * 5.3) + 0.2 * Math.sin(p * 11.7 + 1),
  };
  function drawLfo(gr) {
    const { g, w, h } = sizeCanvas(gr.cv);
    const pad = 14, bars = 8;
    const which = st.edit.lfo ?? st.defaults.values.lfo;
    const Y = (f) => h - pad - norm('lfolo', f) * (h - 2 * pad);
    const fOf = (y, ht) => denorm('lfolo', (ht - pad - y) / (ht - 2 * pad));
    g.strokeStyle = css('--line');
    g.lineWidth = 1;
    for (let b = 1; b < bars; b++) {
      const x = pad + (b / bars) * (w - 2 * pad);
      line(g, [[x, pad], [x, h - pad]]);
      g.stroke();
    }
    const lo = valueOf('lfolo'), hi = valueOf('lfohi');
    g.setLineDash([4, 4]);
    for (const f of [lo, hi]) {
      line(g, [[pad, Y(f)], [w - pad, Y(f)]]);
      g.stroke();
    }
    g.setLineDash([]);
    const per = +(valueOf('lfor') ?? 4) || 4, fn = WAVE[valueOf('lfow')] ?? WAVE.sine;
    const pts = [];
    for (let i = 0; i <= 200; i++) {
      const t = (i / 200) * bars;
      pts.push([pad + (i / 200) * (w - 2 * pad), Y(lo + fn(t / per) * (hi - lo))]);
    }
    g.globalAlpha = which ? 1 : 0.35;
    line(g, pts);
    g.strokeStyle = css('--g');
    g.lineWidth = 2;
    g.stroke();
    g.globalAlpha = 1;
    g.font = '10px sans-serif';
    g.fillStyle = css('--dim');
    if (which) g.fillText(say(OPT.lfo[which]) + ` · ${fmt('lfor', valueOf('lfor') ?? '4')} bar`, pad + 4, pad + 10);
    else g.fillText(say(W.lfoOff), pad + 4, pad + 10);
    const on = () => {
      if (!isSet('lfo')) {
        set('lfo', which ?? 'lpf');
        if (!which) startLfo('lpf');
      }
    };
    gr.handles = [
      { x: w - pad - 22, y: Y(hi), keys: ['lfohi'], label: 'max', move: (_x, y, _w, ht) => (on(), set('lfohi', fOf(y, ht))) },
      { x: w - pad - 56, y: Y(lo), keys: ['lfolo'], label: 'min', move: (_x, y, _w, ht) => (on(), set('lfolo', fOf(y, ht))) },
    ];
    drawHandles(gr, g);
  }

  // Left / right: the dot is where it sits, the bar around it how far auto-pan swings it
  function drawPan(gr) {
    const { g, w, h } = sizeCanvas(gr.cv);
    const pad = 16;
    const X = (v) => pad + v * (w - 2 * pad);
    const c = valueOf('pan'), wd = valueOf('apan');
    const l = Math.max(0, c - wd / 2), r = Math.min(1, c + wd / 2);
    g.strokeStyle = css('--line');
    g.lineWidth = 1;
    line(g, [[X(0), h / 2], [X(1), h / 2]]);
    g.stroke();
    g.font = '10px sans-serif';
    g.fillStyle = css('--dim');
    g.fillText('L', 4, h / 2 + 4);
    g.fillText('R', w - 11, h / 2 + 4);
    line(g, [[X(0.5), h / 2 - 6], [X(0.5), h / 2 + 6]]);
    g.stroke();
    const acc = css('--g');
    if (wd > 0) {
      g.globalAlpha = 0.18;
      g.fillStyle = acc;
      g.fillRect(X(l), pad, X(r) - X(l), h - 2 * pad);
      g.globalAlpha = 1;
      const pts = [];
      for (let i = 0; i <= 60; i++) pts.push([X(c + (wd / 2) * Math.sin((i / 60) * 4 * Math.PI)), pad + (i / 60) * (h - 2 * pad)]);
      line(g, pts);
      g.strokeStyle = acc;
      g.lineWidth = 1;
      g.stroke();
    }
    const vOf = (x, ww) => (x - pad) / (ww - 2 * pad);
    gr.handles = [
      { x: X(c), y: h / 2, keys: ['pan'], move: (x, _y, ww) => set('pan', vOf(x, ww)) },
      { x: X(r), y: pad + 6, keys: ['apan'], label: '↔', move: (x, _y, ww) => set('apan', 2 * Math.abs(vOf(x, ww) - valueOf('pan'))) },
    ];
    drawHandles(gr, g);
  }

  // Two knobs on one square: one sideways, one up and down
  function drawPad(gr) {
    const { g, w, h } = sizeCanvas(gr.cv);
    const p = gr.g, pad = 12;
    grid(g, w, h, pad);
    g.strokeStyle = css('--line');
    g.strokeRect(pad, pad, w - 2 * pad, h - 2 * pad);
    const x = pad + norm(p.x, valueOf(p.x), p.rx) * (w - 2 * pad);
    const y = h - pad - norm(p.y, valueOf(p.y), p.ry) * (h - 2 * pad);
    const acc = css('--g');
    g.globalAlpha = 0.14;
    g.fillStyle = acc;
    g.fillRect(pad, y, x - pad, h - pad - y);
    g.globalAlpha = 1;
    g.font = '10px sans-serif';
    g.fillStyle = css('--dim');
    const xn = say(NAMES[p.x]) + ' →';
    g.fillText(xn, w - pad - g.measureText(xn).width - 3, h - pad - 4);
    g.save();
    g.translate(pad + 11, pad + 3);
    g.rotate(Math.PI / 2);
    g.fillText(say(NAMES[p.y]) + ' ↓', 0, 0);
    g.restore();
    gr.handles = [
      {
        x, y, keys: [p.x, p.y],
        move: (mx, my, ww, hh) => {
          set(p.x, denorm(p.x, (mx - pad) / (ww - 2 * pad), p.rx));
          set(p.y, denorm(p.y, (hh - pad - my) / (hh - 2 * pad), p.ry));
        },
      },
    ];
    drawHandles(gr, g);
  }

  function drawGraph(gr) {
    if (!st || !gr.cv.isConnected) return;
    const t = gr.g.type;
    if (t === 'env') drawEnv(gr);
    else if (t === 'filter') drawFilter(gr);
    else if (t === 'lfo') drawLfo(gr);
    else if (t === 'pan') drawPan(gr);
    else drawPad(gr);
  }
  // the spectrum moves with the sound: the filter graph redraws every frame while it is in view
  function loop() {
    raf = 0;
    if (!st || !root.isConnected) return;
    const view = pane.getBoundingClientRect();
    for (const gr of graphs) {
      if (gr.g.type !== 'filter') continue;
      const r = gr.cv.getBoundingClientRect();
      if (r.bottom > view.top && r.top < view.bottom) drawFilter(gr);
    }
    raf = requestAnimationFrame(loop);
  }

  // ---- buttons
  abBtn.addEventListener('click', () => {
    st.ab = !st.ab;
    renderHead();
    hooks.onChange?.(state());
  });
  soloBtn.addEventListener('click', () => {
    st.solo = !st.solo;
    renderHead();
    hooks.onChange?.(state());
  });
  // ↺ 전부 되돌리기: the slots on show, back to the orb as it was
  resetBtn.addEventListener('click', () => {
    for (const k of Object.keys(st.edit)) delete slotOf(k)[k];
    compose();
    emit({ rerender: true });
  });
  cancelBtn.addEventListener('click', () => hooks.onCancel?.());
  helpBtn.addEventListener('click', () => hooks.onHelp?.());
  doneBtn.addEventListener('click', () => {
    if (!changed()) return;
    if (!hooks.canUpload?.()) return hooks.onDone?.({ ...state(), upload: false });
    askText.textContent = say(W.ask);
    askYes.textContent = say(W.askYes);
    askKeep.textContent = say(W.askKeep);
    askEnd.textContent = say(W.askEnd);
    ask.showModal();
  });
  askYes.addEventListener('click', () => {
    ask.close();
    hooks.onDone?.({ ...state(), upload: true });
  });
  askEnd.addEventListener('click', () => {
    ask.close();
    hooks.onDone?.({ ...state(), upload: false });
  });
  askKeep.addEventListener('click', () => ask.close());
  nameIn.addEventListener('input', () => hooks.onChange?.(state()));
  colorIn.addEventListener('input', () => {
    st.color = colorIn.value;
    renderHead();
    hooks.onChange?.(state());
  });
  addEventListener('resize', () => st && updateAll());

  return {
    // orb: the orb being edited; code: its line at the variation on show; kind: kindOf(orb, code);
    // start: the edit it starts from (a custom orb's own), name / color: what it is called / tinted
    open({ orb, code, kind, start = {}, name = '', color = '' }) {
      // the edit is on top of the orb's own values: what the orb sets itself shows as its default
      st = { orb, kind, defaults: readDefaults(code), edit: {}, ab: false, solo: false, color };
      st.slots = SLOT_N.map((i) => (i ? {} : { ...start }));
      st.pick = {};
      st.used = new Set(Object.keys(TABS).map((g) => `${g}:0`));
      compose();
      nameIn.value = name;
      colorIn.value = color || '#888888';
      pane.scrollTop = 0;
      renderHead();
      renderPane();
    },
    close() {
      cancelAnimationFrame(raf);
      raf = 0;
      st = null;
      graphs = [];
    },
    get open_() {
      return !!st;
    },
    state,
    // the parts a tour points at, each looked up when its step shows (the pane is drawn again
    // on some changes, and holds only the sections this orb's kind has)
    parts: {
      intro: () => [head, pane.querySelector('.oe-hint')],
      orb: () => [ball, colorIn, who],
      graph: () => pane.querySelector('.oe-graph'),
      knobs: () => pane.querySelector('.oe-row'),
      section: () => pane.querySelector('.oe-sh .oe-st'),
      slots: () => pane.querySelector('.oe-sh .oe-slots'),
      all: () => allBox,
      ab: () => abBtn,
      solo: () => soloBtn,
      reset: () => [resetBtn, cancelBtn],
      done: () => doneBtn,
    },
    // the language changed: words again
    relabel() {
      if (!st) return;
      renderHead();
      renderPane();
    },
  };
}
