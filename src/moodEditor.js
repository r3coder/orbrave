// 🎛 편집 on a mood orb: the panel that covers the orb field while a mood is being made. Like
// src/orbEditor.js it knows nothing about the song: the orb page opens it on a mood orb, hears
// every change through onChange (and plays the song with it), and gets the result back through
// onDone. What it makes is a custom mood (server/orbEditSpec.mjs cleanMood):
//   lanes 1–5: one effect each, its full strength, and a strength curve over the 4-bar loop (one
//              bar per beat, painted with the pointer)
//   a graphic EQ: 31 bands on the whole mix (src/graphicEq.js plays it on the master bus)
import { EQ_DB, EQ_FREQS, MOOD_FX, MOOD_LANES, MOOD_STEPS, cleanMood } from '../server/orbEditSpec.mjs';
import { lanesOfFx, moodValue } from './orbEdit.js';
import { getLang } from './i18n.js';

// ---------- words ----------
const L = (ko, en, ja) => ({ ko, en, ja });
const say = (x) => x[getLang()] ?? x.ko;
const FX_NAMES = {
  lpf: L('먹먹 (하이컷)', 'Muffled (high cut)', 'こもる (ハイカット)'), hpf: L('얇은 (로우컷)', 'Thin (low cut)', '薄い (ローカット)'),
  crush: L('8비트', '8-bit', '8ビット'), coarse: L('깨진 (샘플레이트)', 'Broken (downsample)', '割れた (ダウンサンプル)'),
  room: L('넓은 (리버브)', 'Wide (reverb)', '広い (リバーブ)'), delay: L('메아리 (딜레이)', 'Echo (delay)', 'こだま (ディレイ)'),
  shape: L('찌그러진 (새츄레이션)', 'Crunchy (saturation)', '歪み (サチュレーション)'), deg: L('구멍 (빠지는 음)', 'Holes (dropped notes)', '抜け (音が抜ける)'),
  pan: L('빙글 (자동 팬)', 'Spin (auto-pan)', '回る (オートパン)'), vowel: L('말하는 (모음)', 'Talking (vowel)', 'しゃべる (母音)'),
  jux: L('거울 (좌우 거꾸로)', 'Mirror (reversed right)', 'ミラー (右を逆再生)'), swing: L('스윙', 'Swing', 'スウィング'),
};
const W = {
  help: L('편집 화면 둘러보기', 'Tour of the editor', '編集画面ツアー'),
  name: L('오브 이름', 'Orb name', 'オーブ名'), color: L('색', 'Colour', '色'),
  ab: L('A/B 원본 듣기', 'A/B hear original', 'A/B 元の音'), abOn: L('🅰 원본 듣는 중', '🅰 hearing original', '🅰 元の音'),
  resetAll: L('↺ 전부 되돌리기', '↺ Reset all', '↺ 全部戻す'), reset: L('되돌리기', 'reset', '戻す'),
  cancel: L('✕ 취소', '✕ Cancel', '✕ キャンセル'), done: L('✓ 편집 완료', '✓ Finish editing', '✓ 編集完了'),
  ask: L('이 무드를 서버에 전송할까요?', 'Send this mood to the server?', 'このムードをサーバーに送信しますか？'),
  askYes: L('네', 'Yes', 'はい'), askKeep: L('아직 아니요, 편집을 계속합니다.', 'Not yet, keep editing.', 'まだです、編集を続けます。'),
  askEnd: L('아니요, 편집을 끝냅니다', 'No, finish editing', 'いいえ、編集を終えます'),
  none: L('아직 바꾼 곳이 없어요', 'Nothing changed yet', 'まだ変更なし'),
  info: L('효과 {n}개 · EQ {eq}', '{n} effects · EQ {eq}', 'エフェクト {n} · EQ {eq}'),
  eqOn: L('켬', 'on', 'オン'), eqOff: L('끔', 'off', 'オフ'),
  hint: L(
    '줄마다 효과를 하나 고르고, 아래 막대로 4마디 동안 얼마나 세게 걸릴지 그려요 (막대 하나가 한 박) · 막대를 두 번 누르면 100%',
    'Pick an effect per line and paint how hard it bites over the 4 bars below it (one bar per beat) · double-click a bar for 100%',
    '行ごとにエフェクトを選び、下のバーで 4 小節の効き具合を描きます (バー 1 本が 1 拍) · ダブルクリックで 100%',
  ),
  lanes: L('효과 · 4마디 세기 곡선 (최대 {n}개)', 'Effects · 4-bar strength curves (up to {n})', 'エフェクト · 4 小節の強さカーブ (最大 {n})'),
  add: L('＋ 효과 고르기', '＋ Pick an effect', '＋ エフェクトを選ぶ'), remove: L('이 줄 비우기', 'Clear this line', 'この行を空ける'),
  full: L('100%일 때', 'at 100%', '100% のとき'),
  still: L('이 효과는 곡선 없이 계속 걸려요 (세기는 약하게 · 세게 칸으로)', 'This one is on all along, no curve (its strength: the Softer / Stronger slots)', 'このエフェクトはカーブなしで常にかかります (強さは 弱く · 強く スロットで)'),
  eq: L('그래픽 EQ · 노래 전체', 'Graphic EQ · the whole song', 'グラフィック EQ · 曲全体'),
  eqHint: L('막대를 위아래로 끌어 그려요 · 두 번 누르면 0 dB · 뒤는 지금 소리', 'Drag the bars up and down · double-click for 0 dB · behind: the sound now', 'バーを上下にドラッグ · ダブルクリックで 0 dB · 背景は今の音'),
  duck: L('밸런스 효과({what})는 원래 무드 그대로 남아요', 'The balance part ({what}) stays as the mood had it', 'バランス効果 ({what}) は元のムードのまま残ります'),
  bar: L('{b}마디 {t}박', 'bar {b} beat {t}', '{b} 小節 {t} 拍'),
};
const SHAPES = [
  ['flat', '━', L('일정하게', 'Steady', '一定')],
  ['rise', '↗', L('점점 세게', 'Build up', 'だんだん強く')],
  ['fall', '↘', L('점점 약하게', 'Fade out', 'だんだん弱く')],
  ['wave', '∿', L('물결 (4마디에 한 번)', 'Wave (once per 4 bars)', '波 (4 小節で 1 回)')],
  ['pulse', '⫶', L('마디마다 확 걸렸다 빠지기', 'Hit and fade every bar', '小節ごとに効いて抜ける')],
  ['late', '⇥', L('마지막 마디만', 'Last bar only', '最後の小節だけ')],
];
const SHAPE_OF = {
  flat: () => 100,
  rise: (i) => Math.round((100 * i) / (MOOD_STEPS - 1)),
  fall: (i) => Math.round(100 - (100 * i) / (MOOD_STEPS - 1)),
  wave: (i) => Math.round(50 - 50 * Math.cos((2 * Math.PI * i) / MOOD_STEPS)),
  pulse: (i) => [100, 60, 30, 10][i % 4],
  late: (i) => (i >= 12 ? 100 : 0),
};
// x = octaves from 1 kHz
const lg = (f) => Math.log2(f / 1000);
const EQ_PRESETS = [
  [L('평평하게', 'Flat', 'フラット'), () => 0],
  [L('저음 강화', 'Bass boost', '低音強調'), (f) => (f <= 80 ? 6 : f <= 250 ? 6 - 6 * (Math.log2(f / 80) / Math.log2(250 / 80)) : 0)],
  [L('고음 강화', 'Treble boost', '高音強調'), (f) => (f >= 3000 ? Math.min(6, 2 + 4 * Math.log2(f / 3000) / 2) : 0)],
  [L('스마일', 'Smile', 'スマイル'), (f) => Math.min(6, 2.2 * lg(f) ** 2 / 2) - 2],
  [L('라디오', 'Radio', 'ラジオ'), (f) => (f < 300 ? -12 : f > 3500 ? -12 : 2)],
  [L('따뜻하게', 'Warm', '暖かく'), (f) => (f >= 150 && f <= 500 ? 3 : f > 5000 ? -4 : 0)],
  [L('또렷하게', 'Clear', 'くっきり'), (f) => (f >= 2000 && f <= 5000 ? 4 : f < 120 ? -3 : 0)],
  [L('멀리서', 'Far away', '遠くで'), (f) => Math.max(-12, -Math.abs(lg(f) + 0.3) * 4)],
];

const el = (tag, cls, text) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
};
const SLIDE = 1000;
const toSlider = (p, v) => (p.log ? Math.log(v / p.min) / Math.log(p.max / p.min) : (v - p.min) / (p.max - p.min)) * SLIDE;
const fromSlider = (p, t) => {
  const x = t / SLIDE;
  return p.log ? p.min * (p.max / p.min) ** x : p.min + x * (p.max - p.min);
};
const hz = (v) => (v >= 1000 ? `${+(v / 1000).toFixed(v >= 10000 ? 1 : 2)} kHz` : `${Math.round(v)} Hz`);
function fmt(f, v) {
  if (f === 'lpf' || f === 'hpf') return hz(v);
  if (f === 'crush') return v >= 16 ? 'off' : `${+(+v).toFixed(1)} bit`;
  if (f === 'coarse') return v <= 1 ? 'off' : `÷${v}`;
  if (f === 'vowel') return String(v).toUpperCase();
  return `${Math.round(v * 100)}%`;
}
const fLabel = (f) => (f >= 1000 ? `${f / 1000}k` : String(f));
const still = (f) => !!MOOD_FX[f]?.still;
const newLane = (f) => ({ f, v: MOOD_FX[f].def, c: Array(MOOD_STEPS).fill(100) });

// An EQ mood's filters (`.hpf(70).hpq(9)` …) as graphic EQ bands: the filters' response at each
// band's centre, from real biquads (one offline context, made once)
let octx = null;
function eqOfFx(fx) {
  octx ??= new OfflineAudioContext(1, 128, 44100);
  const freqs = new Float32Array(EQ_FREQS), mag = new Float32Array(freqs.length), ph = new Float32Array(freqs.length);
  const total = new Array(freqs.length).fill(1);
  const call = (n) => {
    const m = new RegExp(`\\.${n}\\(([\\d.]+)\\)`).exec(fx);
    return m ? +m[1] : null;
  };
  for (const [type, f, q] of [['lowpass', 'lpf', 'lpq'], ['highpass', 'hpf', 'hpq'], ['bandpass', 'bpf', 'bpq']]) {
    if (call(f) == null) continue;
    const b = octx.createBiquadFilter();
    b.type = type;
    b.frequency.value = call(f);
    b.Q.value = call(q) ?? (type === 'bandpass' ? 1 : 0.7);
    b.getFrequencyResponse(freqs, mag, ph);
    mag.forEach((x, i) => (total[i] *= x));
  }
  return total.map((x) => Math.round(Math.max(-EQ_DB, Math.min(EQ_DB, 20 * Math.log10(Math.max(1e-4, x))))));
}

// ---------- the panel ----------
// root: the element to fill. hooks: onChange({ orb, m, ab, name, color }) on every change,
// onDone({ ...state, upload }) / onCancel(), paintOrb(el, orb, color), spectrum() -> Uint8Array |
// null (the mix's analyser), sampleRate(), position() -> bars into the 4-bar loop (0…4) or null,
// canUpload(), duckWords(orb) -> what a balance mood turns down ('' when nothing).
export function createMoodEditor(root, hooks) {
  let st = null; // { orb, lanes: [lane | null] × 5, q: dB × 31, ab, color, start: clean m }
  let raf = 0;

  const head = el('div', 'oe-head');
  const ball = el('div', 'oe-ball');
  const colorIn = el('input', 'oe-color');
  colorIn.type = 'color';
  const nameIn = el('input', 'oe-name');
  nameIn.maxLength = 24;
  nameIn.spellcheck = false;
  const info = el('span', 'oe-info');
  const who = el('div', 'oe-who');
  who.append(nameIn, info);
  const abBtn = el('button', 'oe-ab'), resetBtn = el('button', 'oe-reset'), cancelBtn = el('button', 'oe-cancel'), doneBtn = el('button', 'oe-done go');
  // ?: a tour of the panel (the orb page runs it: hooks.onHelp)
  const helpBtn = el('button', 'oe-help', '?');
  helpBtn.setAttribute('aria-label', '?');
  const tools = el('div', 'oe-tools');
  tools.append(abBtn, resetBtn, cancelBtn, doneBtn, helpBtn);
  head.append(ball, colorIn, who, tools);
  const ask = el('dialog', 'import oe-ask');
  const askText = el('p', 'oe-ask-q');
  const askYes = el('button', 'go'), askKeep = el('button', 'ghost'), askEnd = el('button');
  const askBtns = el('div', 'oe-ask-btns');
  askBtns.append(askYes, askKeep, askEnd);
  ask.append(askText, askBtns);
  const pane = el('div', 'oe-pane me-pane');
  root.append(ask, head, pane);
  for (const ev of ['pointerdown', 'click', 'wheel']) root.addEventListener(ev, (e) => e.stopPropagation());

  const toM = () => cleanMood({
    l: st.lanes.filter(Boolean).map(({ f, v, c }) => ({ f, v, ...(still(f) ? {} : { c }) })),
    q: st.q,
  });
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  const changed = () => !same(toM(), st.start);
  const state = () => st && { orb: st.orb, m: toM(), ab: st.ab, name: nameIn.value, color: st.color };
  function emit({ rerender = false } = {}) {
    if (st.ab) st.ab = false; // touching anything means listening to the edit
    renderHead();
    if (rerender) renderPane();
    else drawAll();
    hooks.onChange?.(state());
  }

  function renderHead() {
    ball.replaceChildren();
    hooks.paintOrb?.(ball, st.orb, st.color);
    const n = st.lanes.filter(Boolean).length, eq = st.q.some(Boolean);
    info.textContent = changed() ? say(W.info).replace('{n}', n).replace('{eq}', say(eq ? W.eqOn : W.eqOff)) : say(W.none);
    abBtn.textContent = say(st.ab ? W.abOn : W.ab);
    abBtn.classList.toggle('on', st.ab);
    abBtn.disabled = !changed();
    resetBtn.textContent = say(W.resetAll);
    resetBtn.disabled = !changed();
    cancelBtn.textContent = say(W.cancel);
    doneBtn.textContent = say(W.done);
    doneBtn.disabled = !changed() || !toM();
    helpBtn.title = say(W.help);
    nameIn.placeholder = say(W.name);
    colorIn.title = say(W.color);
  }

  // ---------- the pane ----------
  let curves = []; // { cv, lane index, hover }
  let eqCv = null, eqHover = -1, eqVal = null;
  function renderPane() {
    const top = pane.scrollTop;
    pane.replaceChildren();
    curves = [];
    pane.append(el('p', 'oe-hint', say(W.hint)));
    const sec = el('section', 'oe-sec wide');
    const h = el('h3', 'oe-sh');
    h.append(el('span', 'oe-st', say(W.lanes).replace('{n}', MOOD_LANES)));
    sec.append(h);
    st.lanes.forEach((lane, i) => sec.append(laneRow(lane, i)));
    pane.append(sec);
    pane.append(eqSection());
    const duck = hooks.duckWords?.(st.orb);
    if (duck) pane.append(el('p', 'oe-hint me-note', say(W.duck).replace('{what}', duck)));
    drawAll();
    pane.scrollTop = top;
  }

  function laneRow(lane, i) {
    const row = el('div', 'me-lane' + (lane ? '' : ' empty'));
    const top = el('div', 'me-lh');
    top.append(el('b', 'me-num', String(i + 1)));
    const pick = el('select', 'me-fx');
    const none = el('option', '', say(W.add));
    none.value = '';
    pick.append(none);
    const used = new Set(st.lanes.filter((x, k) => x && k !== i).map((x) => x.f));
    for (const f of Object.keys(MOOD_FX)) {
      const o = el('option', '', say(FX_NAMES[f]));
      o.value = f;
      o.disabled = used.has(f);
      pick.append(o);
    }
    pick.value = lane?.f ?? '';
    pick.addEventListener('change', () => {
      st.lanes[i] = pick.value ? newLane(pick.value) : null;
      emit({ rerender: true });
    });
    top.append(pick);
    if (lane) {
      const p = MOOD_FX[lane.f];
      if (p.opts) {
        const box = el('div', 'oe-opts');
        for (const o of p.opts) {
          const b = el('button', 'oe-opt' + (lane.v === o ? ' on' : ''), o.toUpperCase());
          b.addEventListener('click', () => {
            lane.v = o;
            emit({ rerender: true });
          });
          box.append(b);
        }
        top.append(box);
      } else if ('min' in p) {
        const lab = el('label', 'oe-label', say(W.full));
        const range = el('input', 'oe-range');
        range.type = 'range';
        range.min = 0;
        range.max = SLIDE;
        range.value = Math.round(toSlider(p, lane.v));
        const val = el('span', 'oe-val', fmt(lane.f, lane.v));
        range.addEventListener('input', () => {
          const x = fromSlider(p, +range.value);
          lane.v = p.int ? Math.round(x) : +(Math.round(x / (p.step ?? 0.01)) * (p.step ?? 0.01)).toFixed(4);
          val.textContent = fmt(lane.f, lane.v);
          emit();
        });
        range.addEventListener('dblclick', () => {
          lane.v = p.def;
          emit({ rerender: true });
        });
        const wrap = el('div', 'me-full');
        wrap.append(lab, range, val);
        top.append(wrap);
      }
      if (!still(lane.f)) {
        const shapes = el('div', 'me-shapes');
        for (const [k, icon, tip] of SHAPES) {
          const b = el('button', 'oe-opt', icon);
          b.title = say(tip);
          b.addEventListener('click', () => {
            lane.c = Array.from({ length: MOOD_STEPS }, (_, s) => SHAPE_OF[k](s));
            emit();
          });
          shapes.append(b);
        }
        top.append(shapes);
      }
      const x = el('button', 'oe-back me-x', '✕');
      x.title = say(W.remove);
      x.addEventListener('click', () => {
        st.lanes[i] = null;
        emit({ rerender: true });
      });
      top.append(x);
    }
    row.append(top);
    if (lane && !still(lane.f)) row.append(curveCanvas(i));
    else if (lane) row.append(el('p', 'me-still', say(W.still)));
    return row;
  }

  // ---- a lane's curve: 16 bars (one per beat), painted with the pointer
  function curveCanvas(i) {
    const cv = el('canvas', 'me-curve');
    const cu = { cv, i, hover: -1 };
    curves.push(cu);
    const at = (e) => {
      const r = cv.getBoundingClientRect();
      const col = Math.max(0, Math.min(MOOD_STEPS - 1, Math.floor(((e.clientX - r.left) / r.width) * MOOD_STEPS)));
      const v = Math.round(Math.max(0, Math.min(1, 1 - (e.clientY - r.top - 4) / (r.height - 8))) * 20) * 5;
      return [col, v];
    };
    let last = null;
    const paint = (e) => {
      const [col, v] = at(e), c = st.lanes[i].c;
      // a quick drag skips columns: fill the ones between too
      if (last) {
        const [c0, v0] = last, n = Math.abs(col - c0);
        for (let k = 1; k < n; k++) c[c0 + Math.sign(col - c0) * k] = Math.round(v0 + ((v - v0) * k) / n);
      }
      c[col] = v;
      last = [col, v];
      emit();
    };
    cv.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      cv.setPointerCapture(e.pointerId);
      last = null;
      paint(e);
    });
    cv.addEventListener('pointermove', (e) => {
      if (last) return paint(e);
      cu.hover = at(e)[0];
      drawCurve(cu);
    });
    const up = () => (last = null);
    cv.addEventListener('pointerup', up);
    cv.addEventListener('pointercancel', up);
    cv.addEventListener('pointerleave', () => {
      cu.hover = -1;
      drawCurve(cu);
    });
    cv.addEventListener('dblclick', (e) => {
      st.lanes[i].c[at(e)[0]] = 100;
      emit();
    });
    return cv;
  }

  // ---- the graphic EQ
  function eqSection() {
    const sec = el('section', 'oe-sec wide');
    const h = el('h3', 'oe-sh');
    h.append(el('span', 'oe-st', say(W.eq)));
    const back = el('button', 'oe-back', '↺');
    back.title = say(W.reset);
    back.hidden = !st.q.some(Boolean);
    back.addEventListener('click', () => {
      st.q = st.q.map(() => 0);
      emit({ rerender: true });
    });
    h.append(back);
    sec.append(h);
    const pre = el('div', 'oe-eq');
    for (const [label, fn] of EQ_PRESETS) {
      const b = el('button', 'oe-opt', say(label));
      b.addEventListener('click', () => {
        st.q = EQ_FREQS.map((f) => Math.round(Math.max(-EQ_DB, Math.min(EQ_DB, fn(f)))));
        emit({ rerender: true });
      });
      pre.append(b);
    }
    sec.append(pre);
    const g = el('div', 'oe-graph');
    eqCv = el('canvas', 'me-eq');
    eqVal = el('div', 'oe-gv');
    g.append(eqCv, eqVal);
    sec.append(g, el('p', 'oe-hint', say(W.eqHint)));
    const at = (e) => {
      const r = eqCv.getBoundingClientRect();
      const n = EQ_FREQS.length, pad = 8;
      const band = Math.max(0, Math.min(n - 1, Math.floor(((e.clientX - r.left - pad) / (r.width - 2 * pad)) * n)));
      const mid = r.height / 2 - 8, y = e.clientY - r.top - 8;
      const db = Math.round(Math.max(-EQ_DB, Math.min(EQ_DB, ((mid - y) / (mid - 6)) * EQ_DB)));
      return [band, db];
    };
    let last = null;
    const paint = (e) => {
      const [b, db] = at(e);
      if (last) {
        const [b0, d0] = last, n = Math.abs(b - b0);
        for (let k = 1; k < n; k++) st.q[b0 + Math.sign(b - b0) * k] = Math.round(d0 + ((db - d0) * k) / n);
      }
      st.q[b] = db;
      last = [b, db];
      eqHover = b;
      back.hidden = !st.q.some(Boolean);
      emit();
    };
    eqCv.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      eqCv.setPointerCapture(e.pointerId);
      last = null;
      paint(e);
    });
    eqCv.addEventListener('pointermove', (e) => {
      if (last) return paint(e);
      eqHover = at(e)[0];
      drawEq();
    });
    const up = () => (last = null);
    eqCv.addEventListener('pointerup', up);
    eqCv.addEventListener('pointercancel', up);
    eqCv.addEventListener('pointerleave', () => {
      eqHover = -1;
      drawEq();
    });
    eqCv.addEventListener('dblclick', (e) => {
      st.q[at(e)[0]] = 0;
      back.hidden = !st.q.some(Boolean);
      emit();
    });
    return sec;
  }

  // ---------- drawing ----------
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
  function drawCurve(cu) {
    const lane = st?.lanes[cu.i];
    if (!lane || !cu.cv.isConnected) return;
    const { g, w, h } = sizeCanvas(cu.cv);
    const pad = 4, cw = w / MOOD_STEPS, acc = css('--g');
    g.strokeStyle = css('--line');
    for (let s = 1; s < MOOD_STEPS; s++) {
      g.lineWidth = s % 4 ? 0.5 : 1.5;
      g.beginPath();
      g.moveTo(s * cw, 0);
      g.lineTo(s * cw, h);
      g.stroke();
    }
    lane.c.forEach((v, s) => {
      const bh = (v / 100) * (h - 2 * pad);
      g.globalAlpha = s === cu.hover ? 0.95 : 0.6;
      g.fillStyle = acc;
      g.fillRect(s * cw + 2, h - pad - bh, cw - 4, Math.max(1, bh));
    });
    g.globalAlpha = 1;
    // where the loop is now
    const pos = hooks.position?.();
    if (pos != null) {
      g.strokeStyle = css('--fg');
      g.lineWidth = 1;
      g.beginPath();
      g.moveTo((pos / 4) * w, 0);
      g.lineTo((pos / 4) * w, h);
      g.stroke();
    }
    g.font = '10px sans-serif';
    g.fillStyle = css('--dim');
    for (let b = 0; b < 4; b++) g.fillText(String(b + 1), b * 4 * cw + 4, 11);
    if (cu.hover >= 0) {
      const v = lane.c[cu.hover];
      const txt = `${say(W.bar).replace('{b}', Math.floor(cu.hover / 4) + 1).replace('{t}', (cu.hover % 4) + 1)} · ${v}% · ${fmt(lane.f, moodValue(lane.f, lane.v, v / 100))}`;
      const tw = g.measureText(txt).width;
      g.fillStyle = css('--fg');
      g.fillText(txt, Math.min(w - tw - 4, Math.max(4, cu.hover * cw)), h - 6 > 24 ? 22 : 11);
    }
  }
  function drawEq() {
    if (!st || !eqCv?.isConnected) return;
    const { g, w, h } = sizeCanvas(eqCv);
    const n = EQ_FREQS.length, pad = 8, bw = (w - 2 * pad) / n;
    const mid = (h - 16) / 2 + 8 - 8, Y = (db) => mid - (db / EQ_DB) * (mid - 6);
    // the sound right now, behind the bars
    const sp = hooks.spectrum?.();
    if (sp) {
      const sr = hooks.sampleRate?.() ?? 48000, bins = sp.length;
      g.fillStyle = css('--g');
      g.globalAlpha = 0.16;
      EQ_FREQS.forEach((f, i) => {
        const lo = Math.max(1, Math.floor(((f / 2 ** (1 / 6)) / (sr / 2)) * bins)), hi = Math.min(bins - 1, Math.ceil(((f * 2 ** (1 / 6)) / (sr / 2)) * bins));
        let m = 0;
        for (let k = lo; k <= hi; k++) m = Math.max(m, sp[k]);
        const v = (m / 255) * (h - 24);
        g.fillRect(pad + i * bw + 1, h - 16 - v, bw - 2, v);
      });
      g.globalAlpha = 1;
    }
    g.strokeStyle = css('--line');
    g.lineWidth = 1;
    for (const db of [-12, -6, 0, 6, 12]) {
      g.setLineDash(db ? [2, 4] : []);
      g.beginPath();
      g.moveTo(pad, Y(db));
      g.lineTo(w - pad, Y(db));
      g.stroke();
    }
    g.setLineDash([]);
    const acc = css('--g');
    st.q.forEach((db, i) => {
      const x = pad + i * bw, y0 = Y(0), y1 = Y(db);
      g.globalAlpha = i === eqHover ? 1 : 0.75;
      g.fillStyle = acc;
      g.fillRect(x + 1.5, Math.min(y0, y1), bw - 3, Math.max(2, Math.abs(y1 - y0)));
    });
    g.globalAlpha = 1;
    g.font = '9px sans-serif';
    g.fillStyle = css('--dim');
    EQ_FREQS.forEach((f, i) => {
      if (i % 3 !== 1) return;
      const t = fLabel(f);
      g.fillText(t, pad + i * bw + bw / 2 - g.measureText(t).width / 2, h - 3);
    });
    g.fillText(`+${EQ_DB}`, 2, Y(EQ_DB) + 9);
    g.fillText(`-${EQ_DB}`, 2, Y(-EQ_DB) - 2);
    const b = eqHover;
    eqVal.textContent = b >= 0 ? `${hz(EQ_FREQS[b])} · ${st.q[b] > 0 ? '+' : ''}${st.q[b]} dB` : '';
  }
  function drawAll() {
    for (const cu of curves) drawCurve(cu);
    drawEq();
  }
  // the playhead and the spectrum move: redraw while open
  function loop() {
    raf = 0;
    if (!st || !root.isConnected) return;
    drawAll();
    raf = requestAnimationFrame(loop);
  }

  // ---------- buttons ----------
  abBtn.addEventListener('click', () => {
    st.ab = !st.ab;
    renderHead();
    hooks.onChange?.(state());
  });
  resetBtn.addEventListener('click', () => {
    fill(st.start);
    emit({ rerender: true });
  });
  cancelBtn.addEventListener('click', () => hooks.onCancel?.());
  helpBtn.addEventListener('click', () => hooks.onHelp?.());
  doneBtn.addEventListener('click', () => {
    if (!changed() || !toM()) return;
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
  addEventListener('resize', () => st && drawAll());

  // the lanes and EQ from a mood (clean m, or null for an empty one)
  function fill(m) {
    st.lanes = Array.from({ length: MOOD_LANES }, (_, i) => {
      const x = m?.l?.[i];
      if (!x) return null;
      return { f: x.f, v: x.v ?? MOOD_FX[x.f].def, c: x.c ? [...x.c] : Array(MOOD_STEPS).fill(100) };
    });
    st.q = m?.q ? [...m.q] : EQ_FREQS.map(() => 0);
  }

  return {
    // orb: the mood orb (a catalogue mood, or a custom mood: its own lanes), name / color
    open({ orb, name = '', color = '' }) {
      st = { orb, ab: false, color };
      // where it starts: a custom mood's own lanes, else the catalogue mood's effects as lanes
      // (an EQ mood's filters as graphic EQ bands)
      const m = orb.mood ?? cleanMood({ l: orb.eq ? [] : lanesOfFx(orb.fx).slice(0, MOOD_LANES), q: orb.eq ? eqOfFx(orb.fx ?? '') : null });
      st.start = cleanMood(m);
      fill(st.start);
      nameIn.value = name;
      colorIn.value = color || '#888888';
      pane.scrollTop = 0;
      renderHead();
      renderPane();
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(loop);
    },
    close() {
      cancelAnimationFrame(raf);
      raf = 0;
      st = null;
      curves = [];
      eqCv = null;
    },
    state,
    // the parts a tour points at, each looked up when its step shows (the pane is drawn again
    // on changes; parts a mood doesn't have, a curve say, are passed over)
    parts: {
      intro: () => [head, pane.querySelector('.oe-hint')],
      orb: () => [ball, colorIn, who],
      lanes: () => pane.querySelector('.me-lane .me-fx'),
      full: () => pane.querySelector('.me-full, .me-lane .oe-opts'),
      curve: () => pane.querySelector('.me-curve'),
      shapes: () => pane.querySelector('.me-shapes'),
      eq: () => pane.querySelector('.me-eq')?.closest('.oe-sec'),
      ab: () => abBtn,
      reset: () => [resetBtn, cancelBtn],
      done: () => doneBtn,
    },
    relabel() {
      if (!st) return;
      renderHead();
      renderPane();
    },
  };
}
