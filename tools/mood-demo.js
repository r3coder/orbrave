// Dev page: every kind of mood orb and the look it gives the player, side by side with none.
// A fake player (play button, waveform ring, EQ arcs, piano-roll blocks and a drum pattern's hit
// rings) is drawn with the same modules the orb page uses: src/moodVisuals.js and src/hitRipples.js.
import { LAYERS, MOOD_SUBS } from '../src/orbCatalog.js';
import { duckOf, BARS } from '../src/orbPreset.js';
import { createMood, easeMood, readMood, pixelScale, styleCanvas, drawMoodUnder, drawMoodOver, moodHit, eqBandGain } from '../src/moodVisuals.js';
import { drawHitRipples } from '../src/hitRipples.js';

const $ = (id) => document.getElementById(id);
const canvas = $('viz'), g = canvas.getContext('2d'), stage = $('stage');

// ---------- the mood orbs to try: the hand-made ones, all EQ ones, and a few generated per kind ----------
const moods = LAYERS.filter((l) => l.cat === 'mood' && !l.base);
const handmade = new Set(['underwater', 'radio', 'cave', 'dizzy', 'breathe']);
const groups = {};
for (const sub of Object.keys(MOOD_SUBS)) {
  const all = moods.filter((l) => l.sub === sub);
  groups[sub] = [...all.filter((l) => handmade.has(l.id) || l.eq), ...all.filter((l) => !handmade.has(l.id) && !l.eq).slice(0, sub === 'eq' ? 0 : 4)];
}
const on = new Set();
let step = 0;
const list = $('list');
for (const [sub, orbs] of Object.entries(groups)) {
  if (!orbs.length) continue;
  const h = document.createElement('h2');
  h.textContent = `${MOOD_SUBS[sub]} (${sub})`;
  list.append(h);
  for (const o of orbs) {
    const b = document.createElement('button');
    b.className = 'orb';
    const cols = o.colors ?? [o.color];
    b.innerHTML = `<span class="dot" style="background:conic-gradient(${cols.join(',')},${cols[0]})"></span><span>${o.name} <span class="kind">${o.kind}</span></span><span class="fx"></span>`;
    b.querySelector('.fx').textContent = (o.fx ?? '') + (o.duck ? ` duck: ${o.duck.join(', ')}` : '');
    b.onclick = () => {
      on.has(o) ? on.delete(o) : on.add(o);
      b.classList.toggle('on', on.has(o));
    };
    list.append(b);
  }
}
$('clear').onclick = () => {
  on.clear();
  list.querySelectorAll('.orb.on').forEach((b) => b.classList.remove('on'));
};
$('step').oninput = (e) => ($('stepv').textContent = step = +e.target.value);
let comparing = false;
const cmp = $('compare');
const setCmp = (v) => {
  comparing = v;
  cmp.classList.toggle('on', v);
};
cmp.addEventListener('pointerdown', () => setCmp(true));
for (const ev of ['pointerup', 'pointerleave', 'pointercancel']) cmp.addEventListener(ev, () => setCmp(false));

// ---------- what each effect is, for the readout ----------
const LABELS = {
  tint: ['색 번짐', '분위기 오브 색 3개가 플레이어 주변을 천천히 돎 (모든 분위기)'],
  dull: ['먹먹함 (lpf)', '화면 블러 + 채도 낮춤, 거품이 떠오름'],
  breathe: ['숨쉬는 필터 (lpf sine)', '블러가 천천히 강해졌다 약해졌다'],
  thin: ['얇음 (hpf)', '대비·밝기 올림, 링이 가늘어짐'],
  wet: ['넓은 공간 (room)', '가장자리 어둡게(동굴), 링이 더 크고 오래감'],
  echo: ['메아리 (delay)', '링이 몇 번 더 퍼짐, 갈수록 흐리게'],
  crush: ['8비트 (crush)', '캔버스 해상도를 낮춰 픽셀처럼'],
  grit: ['깨진 소리 (coarse/shape)', '스캔라인 + 킥·스네어에 화면 찢김'],
  swirl: ['빙글 (pan/swing)', '링이 좌우로 흔들리는 쪽에 생기고 흘러감, 색이 빨리 돎'],
  mirror: ['거울 (jux)', '링이 플레이어 반대편에도 대칭으로 생김'],
  holes: ['구멍 (degradeBy)', '일부 타격은 링이 안 생김'],
  eqLow: ['EQ 저음', 'EQ 바의 낮은 쪽이 길어짐(+) / 짧아짐(−)'],
  eqHigh: ['EQ 고음', 'EQ 바의 높은 쪽이 길어짐(+) / 짧아짐(−)'],
};
const meters = $('meters');
let lastMeterKey = '';
function updateMeters(t, ducks) {
  const rows = Object.keys(LABELS).filter((k) => Math.abs(t[k]) > 0.01).map((k) => [k, t[k]]);
  const duckRows = Object.entries(ducks).filter(([, f]) => f < 0.99);
  const key = JSON.stringify([rows.map(([k, v]) => [k, v.toFixed(2)]), duckRows]);
  if (key === lastMeterKey) return;
  lastMeterKey = key;
  if (!rows.length && !duckRows.length) {
    meters.innerHTML = '<p class="note">켜진 분위기 오브 없음 → 효과 없음</p>';
    return;
  }
  meters.innerHTML = '';
  for (const [k, v] of rows) {
    const el = document.createElement('div');
    el.className = 'm';
    el.innerHTML = `<b>${LABELS[k][0]}</b><div class="bar ${v < 0 ? 'neg' : ''}"><i style="width:${Math.min(100, Math.abs(v) / 1.5 * 100)}%"></i></div><small>${LABELS[k][1]} · ${v.toFixed(2)}</small>`;
    meters.append(el);
  }
  for (const [r, f] of duckRows) {
    const el = document.createElement('div');
    el.className = 'm';
    el.innerHTML = `<b>밸런스: ${r} 줄임</b><div class="bar neg"><i style="width:${(1 - f) * 100}%"></i></div><small>그 파트의 링 / 피아노롤 / EQ 바가 흐려짐 · ×${f.toFixed(2)}</small>`;
    meters.append(el);
  }
}

// ---------- the fake song ----------
const BPM = 124;
const per = (arr, v = 1) => Array.from({ length: BARS }, (_, bar) => arr.map((x) => ({ b: bar + x, v }))).flat();
const PARTS = [
  { key: 'k', role: 'kick', color: '#f03a47', hits: per([0, 0.25, 0.5, 0.75]) },
  { key: 's', role: 'snare', color: '#ff8a3d', hits: per([0.25, 0.75]) },
  { key: 'h', role: 'hat', color: '#ffe45c', hits: per([0.125, 0.375, 0.625, 0.875], 0.6) },
  { key: 'p', role: 'perc', color: '#e8a33a', hits: per([0.3125, 0.6875], 0.7) },
];
const PITCHED = [
  { role: 'bass', color: '#6c5cff', notes: [[0, 0.5, 3], [0.5, 1, 3], [1, 1.5, 1], [1.5, 2, 1], [2, 2.5, 5], [2.5, 3, 5], [3, 4, 4]] },
  { role: 'pad', color: '#6fa8ff', notes: [[0, 2, 10], [0, 2, 13], [2, 4, 12], [2, 4, 15]] },
  { role: 'lead', color: '#06d6a0', notes: [[0.25, 0.5, 20], [0.75, 1, 22], [1.25, 1.75, 19], [2.25, 2.5, 22], [2.5, 3, 24], [3.5, 4, 20]] },
];
const ALL_ROLES = [...PARTS, ...PITCHED].map((p) => p.role);
const env = Object.fromEntries(ALL_ROLES.map((r) => [r, 0]));

const mood = createMood();
const t0 = performance.now();
let lastTs = t0, lastPos = 0;
function frame(ts) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.1, (ts - lastTs) / 1000);
  lastTs = ts;
  const active = comparing ? [] : [...on];
  const target = readMood(active, () => step);
  const ducks = Object.fromEntries(ALL_ROLES.map((r) => [r, duckOf(active, r, () => step)]));
  updateMeters(target, ducks);
  easeMood(mood, target, dt);
  styleCanvas(canvas, mood, false, ts);

  const w = stage.clientWidth, h = stage.clientHeight;
  const dpr = (window.devicePixelRatio || 1) * pixelScale(mood);
  if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
  }
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  g.fillStyle = '#0b0b10';
  g.fillRect(0, 0, w, h);
  const cx = w / 2, cy = h / 2, core = 46;

  // the loop position, and an envelope per part from its hits (for the EQ arcs)
  const pos = (((ts - t0) / 1000) * (BPM / 60) / 4) % BARS;
  for (const p of PARTS) {
    for (const n of p.hits) {
      let d = n.b - lastPos;
      if (d <= 0) d += BARS;
      let span = pos - lastPos;
      if (span < 0) span += BARS;
      if (d <= span) env[p.role] = n.v;
    }
  }
  for (const p of PITCHED) env[p.role] = p.notes.some(([b, e]) => pos >= b && pos < e) ? 0.55 + Math.random() * 0.1 : 0.1;
  lastPos = pos;

  drawMoodUnder(g, mood, { cx, cy, w, h, dt, lite: false });

  // piano roll: the pitched parts across the page, dimmed when a balance mood turns them down
  g.save();
  const rowH = Math.min(9, h / 40), top = cy - 13 * rowH;
  PITCHED.forEach((p) => {
    g.fillStyle = p.color;
    for (const [b, e, m] of p.notes) {
      const lit = pos >= b && pos < e;
      g.globalAlpha = (lit ? 0.2 : 0.06) * Math.max(0.15, ducks[p.role]);
      g.fillRect((b / BARS) * w, top + (26 - m) * rowH, ((e - b) / BARS) * w - 2, rowH - 1);
    }
  });
  g.globalAlpha = 0.12;
  g.fillStyle = '#fff';
  g.fillRect((pos / BARS) * w, 0, 1, h);
  g.restore();

  drawHitRipples(g, {
    parts: PARTS.map((p) => ({ ...p, dim: Math.max(0.12, ducks[p.role]) })),
    pos, cx, cy, inner: core + 30, outer: Math.max(core + 60, Math.min(w, h) * 0.42), box: [0, 0, w, h], dt, lite: false,
    mood, onHit: (r) => moodHit(mood, r),
  });

  // waveform ring
  const level = Math.max(...Object.values(env));
  g.save();
  g.strokeStyle = '#b9b0ff';
  g.lineWidth = 2;
  g.shadowBlur = 14;
  g.shadowColor = '#7c6cff';
  g.beginPath();
  for (let i = 0; i <= 128; i++) {
    const a = (i / 128) * Math.PI * 2;
    const r = core + 20 + Math.sin(a * 9 + ts / 90) * 6 * level + Math.sin(a * 23 - ts / 50) * 3 * level;
    const x = cx + Math.cos(a) * r, y = cy + Math.sin(a) * r;
    i ? g.lineTo(x, y) : g.moveTo(x, y);
  }
  g.stroke();
  g.restore();

  // EQ arcs, one per part, bent by EQ moods and dimmed by balance moods
  const all = [...PARTS, ...PITCHED], span = (Math.PI * 2) / all.length, inner = core + 40, BANDS = 12;
  all.forEach((p, i) => {
    g.save();
    g.strokeStyle = p.color;
    g.lineCap = 'round';
    g.lineWidth = Math.max(2, ((span * inner) / BANDS) * 0.45);
    g.globalAlpha = 0.75 * Math.max(0.15, ducks[p.role]);
    g.beginPath();
    for (let b = 0; b < BANDS; b++) {
      // drums are brighter up top, the pitched parts down low
      const shape = PARTS.includes(p) ? (p.role === 'kick' ? 1 - b / BANDS : 0.3 + b / BANDS) : 1 - b / BANDS / 1.4;
      const v = env[p.role] * shape * (0.7 + 0.3 * Math.sin(ts / 120 + b * 1.7 + i));
      const a = ts / 9000 + i * span + ((b + 0.5) / BANDS) * span * 0.86;
      const len = 3 + Math.max(0, v) * 46 * eqBandGain(mood, b, BANDS);
      g.moveTo(cx + Math.cos(a) * inner, cy + Math.sin(a) * inner);
      g.lineTo(cx + Math.cos(a) * (inner + len), cy + Math.sin(a) * (inner + len));
    }
    g.stroke();
    g.restore();
  });
  for (const r of Object.keys(env)) if (PARTS.some((p) => p.role === r)) env[r] *= 0.86;

  drawMoodOver(g, mood, { canvas, cx, cy, w, h, lite: false });
}
requestAnimationFrame(frame);
