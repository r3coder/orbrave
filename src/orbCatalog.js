// The orb catalogue: the shared music frame (key, chords, generators) and every orb.
// About 30 orbs are hand-made; the rest are built from a fixed seed so their ids, names
// and sounds stay the same between visits (saved presets refer to them by id).
import { getLang } from './i18n.js';
import { orbNameIn, orbKindIn } from './orbNames.js';
import { editChain, kindOf } from './orbEdit.js';
import { cleanEdit } from '../server/orbEditSpec.mjs';

// ---------- music frame ----------
// Every orb plugs into one frame: 124 BPM, A minor, Am9 – Fmaj7 – Cmaj7 – G6 (one chord per cycle).
export const BASE_BPM = 124;
export const KEYS = ['A', 'A#', 'B', 'C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#'];
// The frame is A minor unless a mode orb switches it to A major (A – F#m – D – E). Each bar's
// chord is written as scale degrees (0 = A): root offset for basslines, then the triad and the
// full chord as pitch classes. Generators read PROG and BAR_CHORDS when they run, so calling
// setMode() before building a line is all it takes; lines then swap ':minor' for the mode.
const MODES = {
  minor: {
    prog: '<Am9 F^7 C^7 G6>',
    chords: [
      { root: 0, triad: [0, 2, 4], tones: [0, 2, 4, 6, 1] }, // Am9
      { root: -2, triad: [5, 0, 2], tones: [5, 0, 2, 4] }, // Fmaj7
      { root: 2, triad: [2, 4, 6], tones: [2, 4, 6, 1] }, // Cmaj7
      { root: -1, triad: [6, 1, 3], tones: [6, 1, 3, 4] }, // G6
    ],
  },
  major: {
    prog: '<A^7 F#m7 D^7 E7>',
    chords: [
      { root: 0, triad: [0, 2, 4], tones: [0, 2, 4, 6] }, // Amaj7
      { root: -2, triad: [5, 0, 2], tones: [5, 0, 2, 4] }, // F#m7
      { root: 3, triad: [3, 5, 0], tones: [3, 5, 0, 2] }, // Dmaj7
      { root: 4, triad: [4, 6, 1], tones: [4, 6, 1, 3] }, // E7
    ],
  },
};
export let MODE = 'minor';
export let PROG = MODES.minor.prog;
export const BAR_CHORDS = MODES.minor.chords.map((c) => ({ ...c }));
export function setMode(mode) {
  if (mode === MODE || !MODES[mode]) return;
  MODE = mode;
  PROG = MODES[mode].prog;
  MODES[mode].chords.forEach((c, i) => Object.assign(BAR_CHORDS[i], c));
}
export const mod7 = (d) => ((d % 7) + 7) % 7;
// nearest degree (ties go down) whose pitch class is in `allowed`
export function snap(d, allowed, lo = -99, hi = 99) {
  for (let k = 0; k < 7; k++) for (const c of [d - k, d + k]) if (c >= lo && c <= hi && allowed.includes(mod7(c))) return c;
  return d;
}
export const chordRange = (c, lo, hi) => {
  const out = [];
  for (let d = lo; d <= hi; d++) if (c.tones.includes(mod7(d))) out.push(d);
  return out;
};
// 4-bar mini-notation "<[bar0] [bar1] [bar2] [bar3]>"; fn(chord) returns one bar's tokens
export const bars = (fn) => `"<${BAR_CHORDS.map((c) => `[${fn(c).join(' ')}]`).join(' ')}>"`;

export function rng(seed) {
  let a = seed >>> 0;
  const r = () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  r.pick = (arr) => arr[Math.floor(r() * arr.length)];
  r.int = (lo, hi) => lo + Math.floor(r() * (hi - lo + 1));
  r.chance = (p) => r() < p;
  r.shuffle = (arr) => arr.map((x) => [r(), x]).sort((p, q) => p[0] - q[0]).map((p) => p[1]);
  return r;
}
export const hash = (s) => [...s].reduce((h, ch) => Math.imul(h ^ ch.charCodeAt(0), 16777619), 2166136261) >>> 0;

// ---------- generators: each variation seed gives a new line over the same chords ----------

// one rhythmic motif (offsets from each bar's root) repeated over the progression
export function bassLine(r, rhythms, offsets) {
  const motif = [...r.pick(rhythms)].map((x, i) => (x === '1' ? (i === 0 ? 0 : r.pick(offsets)) : null));
  return bars((c) => motif.map((o) => (o === null ? '~' : c.root + o)));
}
export const ARP_SHAPES = [[0, 1, 2, 3, 2, 1, 0, 1], [0, 2, 1, 3, 2, 4, 3, 5], [0, 1, 2, 3, 4, 3, 2, 1], [4, 3, 2, 1, 0, 1, 2, 3], [0, 2, 4, 2, 1, 3, 5, 3]];
export function arpLine(r, lo, hi) {
  const shape = r.pick(ARP_SHAPES), len = r.pick([8, 8, 16]);
  return bars((c) => {
    const ds = chordRange(c, lo, hi);
    const s0 = Math.max(0, ds.findIndex((d) => mod7(d) === mod7(c.root)));
    return Array.from({ length: len }, (_, i) => ds[Math.min(ds.length - 1, s0 + shape[i % shape.length])]);
  });
}
// random walk that lands on the triad on strong beats and on chord tones on the others
export function melody(r, { slots, density, lo, hi, hold = 0 }) {
  const rhythm = Array.from({ length: slots }, (_, i) => i === 0 || r.chance(density));
  let d = r.int(lo + 2, hi - 2);
  return bars((c) => rhythm.map((on, i) => {
    if (!on) return i > 0 && r.chance(hold) ? '_' : '~';
    d = Math.max(lo, Math.min(hi, d + r.pick([-2, -1, -1, 0, 1, 1, 2])));
    const eighth = (i * 8) / slots;
    if (eighth % 2 === 0) d = snap(d, eighth % 4 === 0 ? c.triad : c.tones, lo, hi);
    return d;
  }));
}

// ---------- layers ----------
// Each orb is one layer. Layers in the same `cat` replace each other.
//   code   string, or (rng) => string for parts the variation button re-rolls
//   voice  how the orb sounds as the piano-roll instrument
// Special orbs: tempo (`bpm`), combo (`combo`: several layers at once), mood (`fx` appended
// to every line, and/or `duck`: roles it turns down). Every mood has a `sub` type (MOOD_SUBS).
export const DRUM_CATS = ['kick', 'snare', 'hat', 'perc'];
export const PITCHED_CATS = ['bass', 'pad', 'arp', 'lead'];
export const speedOf = (d) => (2 ** ((d - 7) / 7)).toFixed(2);
export const melodic = (root, sound, snapTo = 'tones') => ({ ctrl: 'n', root, legato: true, snap: snapTo, sound });
export const drum = (sound, ctrl = 'speed', map = speedOf) => ({ ctrl, map, sound });

const HANDMADE = [
  { id: 'kick', cat: 'kick', kind: 'kick', name: '심장 뛰는 쿵쿵', color: '#f03a47',
    samples: ['TR909_bd'],
    code: (r) => `s("${r.pick(['bd*4', 'bd*4', 'bd bd bd [bd ~ ~ bd]', 'bd bd bd <bd [~ bd]>'])}").bank("TR909").gain(.62)`,
    voice: drum(`.s("bd").bank("TR909").gain(.6)`) },
  { id: 'kickBroken', cat: 'kick', kind: 'kick', name: '비틀거리는 발걸음', color: '#ff5a3c',
    samples: ['TR909_bd'],
    code: (r) => `s("bd").struct("${r.pick(['x ~ ~ x ~ ~ x ~ ~ ~ x ~ ~ x ~ ~', 'x ~ ~ ~ ~ ~ x ~ ~ ~ x ~ ~ ~ ~ ~', 'x ~ ~ x ~ ~ ~ ~ x ~ x ~ ~ ~ ~ ~', 'x ~ x ~ ~ ~ x ~ ~ x ~ ~ ~ ~ x ~'])}").bank("TR909").gain(.62)`,
    voice: drum(`.s("bd").bank("TR909").lpf(2500).gain(.6)`) },
  { id: 'clap', cat: 'snare', kind: 'clap', name: '찰싹! 손뼉 파티', color: '#ff8a3d',
    samples: ['TR909_cp'],
    code: (r) => `s("${r.pick(['~ cp ~ cp', '~ cp ~ [cp ~ ~ cp]', '~ cp ~ <cp [cp cp]>'])}").bank("TR909").gain(.42).room(.2)`,
    voice: drum(`.s("cp").bank("TR909").room(.2).gain(.4)`) },
  { id: 'lofiSnare', cat: 'snare', kind: 'snare', name: '먼지 낀 낮잠', color: '#d9773a',
    samples: ['Kit_sd:5'],
    code: (r) => `s("${r.pick(['~ Kit_sd:5 ~ [Kit_sd:5 ~ ~ Kit_sd:5?]', '~ Kit_sd:5 ~ Kit_sd:5', '~ Kit_sd:5 [~ Kit_sd:5?] Kit_sd:5'])}").gain(.38).lpf(3200).room(.35)`,
    voice: drum(`.s("Kit_sd:5").lpf(3200).room(.35).gain(.38)`) },
  { id: 'hats', cat: 'hat', kind: 'hihat', name: '잘게 부서진 반짝이', color: '#ffe45c',
    samples: ['TR909_hh'],
    code: (r) => `s("${r.pick(['hh*16', 'hh*8', '[hh hh ~ hh]*4', '[~ hh]*8'])}").bank("TR909").gain(perlin.range(.18,.42)).hpf(5000).pan(sine.range(.35,.65).slow(4))`,
    voice: drum(`.s("hh").bank("TR909").hpf(5000).gain(.34)`) },
  { id: 'openHat', cat: 'hat', kind: 'open hat', name: '들썩이는 어깨', color: '#ffd23f',
    samples: ['TR909_oh'],
    code: `s("~ oh ~ oh ~ oh ~ oh").bank("TR909").gain(.24).hpf(4000)`,
    voice: drum(`.s("oh").bank("TR909").hpf(4000).gain(.24)`) },
  { id: 'tabla', cat: 'perc', kind: 'percussion', name: '정글의 수다쟁이', color: '#e8a33a',
    samples: Array.from({ length: 7 }, (_, i) => `TR727_perc:${i}`),
    code: (r) => `s("TR727_perc").struct("x(${r.int(3, 7)},16,${r.int(0, 4)})").n(irand(7)).pan(rand).gain(.34).room(.25)`,
    voice: drum(`.s("TR727_perc").room(.25).gain(.34)`, 'n', (d) => d % 15) },
  { id: 'amen', cat: 'perc', kind: 'breakbeat', name: '폭주하는 드럼통', color: '#d9822b',
    samples: Array.from({ length: 32 }, (_, i) => `kitbreak:${i}`),
    code: (r) => `n("${Array.from({ length: 16 }, (_, i) => (r.chance(0.3) ? r.int(0, 31) : r.chance(0.12) ? `[${i} ${i}]` : i)).join(' ')}").s("kitbreak").cut(1).hpf(180).gain(.38)`,
    voice: drum(`.s("kitbreak").cut(1).hpf(180).gain(.38)`, 'n', (d) => d * 2) },
  { id: 'rollBass', cat: 'bass', kind: 'bass', name: '꿈틀대는 지렁이', color: '#5a4fe0',
    code: (r) => `n(${bassLine(r, ['0111011101110111', '1011101110111011', '0101010101010101', '0111010101110101'], [0, 0, 0, 0, 7, 4])}).scale("A1:minor")
  .s("sawtooth").lpf(650).lpenv(2).lpd(.1).decay(.15).sustain(0).gain(.34)`,
    voice: melodic('A1', `.s("sawtooth").lpf(800).lpenv(2).lpd(.1).decay(.2).sustain(.4).release(.05).gain(.32)`, 'triad') },
  { id: 'acid', cat: 'bass', kind: 'acid', name: '격렬한 바나나', color: '#6c5cff',
    code: (r) => `n(${bassLine(r, ['1111111111111111', '1101111011011110', '1011101110111011', '1111011111110110'], [0, 0, 0, 7, 7, 4, 2])}).scale("A1:minor")
  .s("sawtooth").lpf(sine.range(300,3000).slow(8)).lpq(15).lpenv(3).lpd(.12)
  .decay(.18).sustain(.15).shape(.35).gain(.26)`,
    voice: melodic('A1', `.s("sawtooth").lpf(sine.range(400,3000).slow(8)).lpq(15).lpenv(3).lpd(.12).decay(.18).sustain(.25).shape(.35).gain(.24)`, 'triad') },
  { id: 'sub', cat: 'bass', kind: 'sub bass', name: '땅속 고래의 하품', color: '#3a0ca3', glow: '#8f7bff',
    code: (r) => `n(${bassLine(r, ['1000001000100000', '1000000010000000', '1000001000000010', '1001000000100000'], [0])}).scale("A1:minor")
  .s("sine").decay(.6).sustain(.6).release(.2).lpf(220).gain(.6)`,
    voice: melodic('A1', `.s("sine").lpf(240).sustain(.9).release(.15).gain(.55)`, 'triad') },
  { id: 'pad', cat: 'pad', kind: 'pad', name: '구름 위 솜사탕', color: '#6fa8ff',
    code: (r) => r.chance(0.5)
      ? `chord("${PROG}").voicing().s("supersaw").attack(.5).release(1.5).lpf(1500).room(.8).roomsize(6).gain(.1)`
      : `chord("${PROG}").voicing().struct("${r.pick(['x ~ ~ x ~ ~ x ~', 'x ~ x ~', '[~ x]*2'])}").s("supersaw").attack(.05).release(.6).lpf(1700).room(.7).roomsize(5).gain(.1)`,
    voice: melodic('A3', `.s("supersaw").attack(.06).release(.8).lpf(1800).room(.6).roomsize(5).gain(.11)`) },
  { id: 'piano', cat: 'pad', kind: 'piano', name: '새벽 세 시의 고백', color: '#9cc2ff',
    samples: ['piano'],
    code: (r) => `chord("${PROG}").voicing().struct("${r.pick(['~ x ~ [x ~ ~ x]', 'x ~ ~ x ~ ~ x ~', '[~ x]*4', 'x ~ [~ x] ~', '~ [x x] ~ x'])}").s("piano").clip(1).room(.5).gain(.34)`,
    voice: melodic('A3', `.s("piano").clip(1).room(.45).gain(.4)`) },
  { id: 'arp', cat: 'arp', kind: 'arpeggio', name: '빙글빙글 회전목마', color: '#a66bff',
    code: (r) => `n(${arpLine(r, 0, 14)}).scale("A3:minor").s("square").decay(.12).sustain(0)
  .lpf(sine.range(900,3500).slow(8)).delay(.3).delaytime(__DT__).pan(sine.fast(2)).gain(.1)`,
    voice: melodic('A3', `.s("square").decay(.15).sustain(.25).lpf(2800).delay(.25).delaytime(__DT__).gain(.11)`) },
  { id: 'bells', cat: 'arp', kind: 'fm bells', name: '유리구슬 빗방울', color: '#c39bff',
    code: (r) => `n(${melody(r, { slots: 8, density: 0.4, lo: 0, hi: 9 })}).scale("A4:minor").s("sine").fm(4).fmh(2.01)
  .decay(.3).sustain(0).delay(.4).delaytime(__DT__).delayfeedback(.5).room(.5).pan(rand).gain(.17)`,
    voice: melodic('A4', `.s("sine").fm(4).fmh(2.01).decay(.4).sustain(.1).delay(.3).delaytime(__DT__).room(.4).gain(.17)`) },
  { id: 'lead', cat: 'lead', kind: 'lead', name: '하늘 나는 오징어', color: '#06d6a0',
    code: (r) => `n(${melody(r, { slots: 8, density: 0.55, lo: 0, hi: 9, hold: 0.3 })}).scale("A4:minor")
  .s("sawtooth").lpf(2400).decay(.2).sustain(.4).release(.3).room(.4).delay(.3).delaytime(__DT__).gain(.12)`,
    voice: melodic('A4', `.s("sawtooth").lpf(2600).decay(.2).sustain(.5).release(.2).room(.3).delay(.25).delaytime(__DT__).gain(.12)`) },
  { id: 'ghost', cat: 'lead', kind: 'whistle', name: '휘파람 부는 유령', color: '#7fe0c4',
    code: (r) => `n(${melody(r, { slots: 4, density: 0.75, lo: 2, hi: 9, hold: 0.6 })}).scale("A4:minor")
  .s("triangle").attack(.08).release(.8).vib(5).vibmod(.25).room(.7).roomsize(5).gain(.16)`,
    voice: melodic('A4', `.s("triangle").attack(.04).release(.4).vib(5).vibmod(.25).room(.6).gain(.18)`) },
  { id: 'riser', cat: 'fx', kind: 'riser', name: '우주행 엘리베이터', color: '#a3aab8',
    code: `s("white*16").decay(.08).sustain(0).gain(saw.range(.04,.2).slow(8)).hpf(saw.range(400,9000).slow(8))`,
    voice: drum(`.s("white").decay(.07).sustain(0).gain(.12)`, 'hpf', (d) => Math.round(300 * 2 ** (d / 3))) },
  { id: 'crackle', cat: 'texture', kind: 'texture', name: '낡은 레코드의 한숨', color: '#8d95a3',
    code: `s("white*16").degradeBy(.6).decay(.02).sustain(0).hpf(3000).gain(rand.range(.02,.09))`,
    voice: drum(`.s("white").decay(.02).sustain(0).gain(.1)`, 'hpf', (d) => Math.round(500 * 2 ** (d / 4))) },

  { id: 'slow', cat: 'tempo', kind: 'tempo ↓ 96', name: '느릿느릿 블랙홀', color: '#15151c', glow: '#c9c9ff', dark: true, bpm: 96 },
  { id: 'fast', cat: 'tempo', kind: 'tempo ↑ 148', name: '새하얀 폭주기관차', color: '#ffffff', bpm: 148 },

  { id: 'comboDrums', cat: 'combo', kind: 'combo · 3', name: '풀코스 드럼 세트', combo: ['kick', 'clap', 'hats'] },
  { id: 'comboDrive', cat: 'combo', kind: 'combo · 3', name: '한밤의 고속도로', combo: ['sub', 'pad', 'bells'] },
  { id: 'comboAcid', cat: 'combo', kind: 'combo · 4', name: '애시드 폭주족', combo: ['kick', 'acid', 'openHat', 'riser'] },
  { id: 'comboCafe', cat: 'combo', kind: 'combo · 4', name: '비 오는 날 다락방', combo: ['lofiSnare', 'piano', 'crackle', 'ghost'] },

  { id: 'underwater', cat: 'mood', sub: 'filter', kind: '필터 · 먹먹+넓은', name: '물속에 잠긴 도시', colors: ['#00b4d8', '#0077b6', '#90e0ef'],
    fx: `.lpf(650).room(.5)` },
  { id: 'radio', cat: 'mood', sub: 'texture', kind: '질감 · 8비트+깨진', name: '고장 난 라디오', colors: ['#ff006e', '#8338ec', '#ffbe0b'],
    fx: `.crush(5).coarse(3)` },
  { id: 'cave', cat: 'mood', sub: 'space', kind: '공간 · 넓은', name: '메아리 동굴 탐험', colors: ['#7209b7', '#4361ee', '#4cc9f0'],
    fx: `.room(.9).roomsize(9)` },
  { id: 'dizzy', cat: 'mood', sub: 'space', kind: '공간 · 메아리+빙글', name: '술 취한 메아리', colors: ['#ffbe0b', '#fb5607', '#ff006e'],
    fx: `.pan(sine.fast(2)).delay(.45).delaytime(__DT__).delayfeedback(.6)` },
  { id: 'breathe', cat: 'mood', sub: 'mix', kind: '밸런스 · 드럼 줄임', name: '잠깐 숨 고르기', colors: ['#f8f9fa', '#adb5bd', '#06d6a0'],
    duck: DRUM_CATS },
];
// ---------- generated orbs ----------
// Ten times the hand-made set: each category gets new orbs combined from a sound source,
// a pattern family and a tone, plus a two-word name. Everything comes from one seed.

const hex = (h, s, l) => {
  s /= 100;
  l /= 100;
  const f = (n) => {
    const k = (n + h / 30) % 12;
    const c = l - s * Math.min(l, 1 - l) * Math.max(-1, Math.min(k - 3, 9 - k, 1));
    return Math.round(c * 255).toString(16).padStart(2, '0');
  };
  return `#${f(0)}${f(8)}${f(4)}`;
};

const ADJ = [
  '격렬한', '그루브한', '졸린', '수줍은', '반짝이는', '끈적한', '몽글몽글', '삐딱한', '우아한', '수상한', '배고픈', '춤추는',
  '녹아내리는', '얼어붙은', '화난', '행복한', '외로운', '들뜬', '거꾸로 걷는', '꿈꾸는', '미끄러운', '빛나는', '낡은', '투명한',
  '뜨거운', '차가운', '보랏빛', '초록빛', '은빛', '황금빛', '고장 난', '날아다니는', '부푼', '쫀득한', '바삭한', '출렁이는',
  '성난', '조용한', '시끄러운', '우주에서 온', '지하실의', '새벽의', '한밤의', '비 맞은', '깨어난', '길 잃은', '뒤집힌', '엉뚱한',
  '느긋한', '재빠른', '무거운', '가벼운', '흔들리는', '미쳐버린', '귀여운', '비밀스러운', '전설의', '네온빛', '레트로', '꿀 바른',
  '매콤한', '새콤한', '달콤한', '폭신한', '끝없는', '반쯤 녹은', '졸음 오는', '펄쩍 뛰는', '빙빙 도는', '삐걱대는', '번쩍이는',
  '고독한', '기분 좋은', '심술궂은', '용감한', '겁 많은', '수다스러운', '잠 못 드는', '거대한', '조그만', '지글지글', '말랑한',
  '단단한', '축축한', '메마른', '향긋한',
];

const NOUNS = {
  kick: '심장 망치 코끼리 발걸음 북소리 거인 공룡 대포 지진 고릴라 쇠공 주먹 하마 천둥 문짝 트럭 바위 맥박 탱크 곰',
  snare: '손뼉 채찍 박수 폭죽 팝콘 따귀 뺨 종이컵 깡통 번개 뻥튀기 고무줄 상자 신문지 풍선 비닐봉지 탁구공 냄비 젓가락 박쥐',
  hat: '모래알 빗방울 반짝이 은가루 귀뚜라미 생쥐 동전 열쇠꾸러미 설탕 별가루 지퍼 참새 가위 소금 방울 유리조각 눈송이 벌레 시계 이빨',
  perc: '원숭이 앵무새 코코넛 대나무 조개 나무토막 정글 축제 장난감 도깨비 개구리 딱따구리 돌멩이 마라카스 캐스터네츠 장구 탬버린 수다쟁이 너구리 펭귄',
  bass: '지렁이 바나나 고래 문어 젤리 용암 늪 지하철 뱀장어 껌 엔진 거미 곰팡이 진흙 슬라임 해파리 오징어 두꺼비 잠수함 코뿔소 소시지 맨홀 화산 버섯 뱀 쿠션 낙타 메기 도마뱀 고구마 하수구',
  pad: '솜사탕 구름 오로라 안개 담요 은하수 꿈 노을 비눗방울 이불 호수 숲 새벽 성당 우주 파도 커튼 눈밭 정원 온천 베개',
  arp: '회전목마 빗방울 유리구슬 계단 오르골 반딧불 사다리 풍차 팽이 요정 톱니바퀴 시계태엽 물방울 구슬 별똥별 나선 무지개 핀볼 종소리 자전거',
  lead: '오징어 유령 갈매기 로봇 요정 해적 카우보이 마법사 앵무새 외계인 늑대 고양이 가수 나팔수 돌고래 백조 독수리 광대 기사 해마',
  fx: '엘리베이터 로켓 사이렌 소방차 우주선 비행기 폭포 롤러코스터 회오리 레이저 타임머신 경보 유성 기차 번개',
  texture: '레코드 라디오 빗소리 모닥불 파도 바람 카페 시냇물 풀벌레 다락방 지붕',
  combo: '파티 세트 정식 도시락 오케스트라 밴드 축제 여행 버스 놀이공원 클럽 다락방 고속도로 지하실 해변 뷔페 콘서트 원정대 피크닉 서커스',
  mood: '도시 동굴 꿈 메아리 수족관 우주 사막 지하철 거울 터널 온실 운동장 꿈속 놀이터 바닷속 구름나라 빈방 기억 필름 비디오테이프',
  slow: '블랙홀 거북이 나무늘보 달팽이 곰 잠꾸러기 해파리 빙하 구름 할머니 코알라',
  fast: '기관차 치타 번개 로켓 벌새 롤러스케이트 오토바이 다람쥐 혜성 토끼 경주마',
};

// sample sources (names checked against the loaded sample maps; VCSL instruments whose folder
// names contain a comma are left out: GitHub's raw host sends that comma unescaped in a
// Content-Disposition header and Chromium refuses the file)
const BANKS = [
  'TR909 bd cp hh oh rim sd lt mt ht', 'TR808 bd cb cp hh oh perc rim sd sh lt mt ht', 'TR707 bd cp hh oh rim sd tb lt mt ht',
  'TR606 bd hh oh sd lt ht', 'TR727 perc sh', 'RD6 bd cp hh oh sd lt ht', 'Kit bd hh oh rim sd lt ht',
].map((line) => {
  const [name, ...has] = line.split(' ');
  return { name, has, label: name };
});
const bankSrc = (r, snd) => {
  const b = r.pick(BANKS.filter((x) => x.has.includes(snd)));
  return { s: snd, bank: b.name, label: b.label, samples: [`${b.name}_${snd}`] };
};
const plainSrc = (s, label, samples = [s]) => ({ s, label, samples });
const indexed = (name, count, label = name) => (r) => {
  const n = r.int(0, count - 1);
  return plainSrc(`${name}:${n}`, label, [`${name}:${n}`]);
};
const range = (name, n) => Array.from({ length: n }, (_, i) => `${name}:${i}`);
const srcCode = (src) => `s("${src.s}")${src.bank ? `.bank("${src.bank}")` : ''}`;

// Sampled sounds never pile up: each orb's hits cut off its own previous hit (one cut group
// per orb), and pitched samples stop where their note ends (clip). Long tails stacking on top
// of each other made a harsh wall of sound.
let cutGroup = 20;
const choke = () => `.cut(${cutGroup++})`;
const clipped = (inst) => (inst.samples ? '.clip(1)' : '');

function* genDrums(r, cat, n, { sources, families, tones, gain, kind }) {
  for (let i = 0; i < n; i++) {
    const src = r.pick(sources)(r);
    const fam = r.pick(families);
    const tone = r.pick(tones);
    const cut = choke();
    yield {
      kind: `${kind} · ${src.label}`, samples: src.samples,
      code: (v) => `${srcCode(src)}.struct("${v.pick(fam)}")${tone}${cut}.gain(${gain})`,
      voice: drum(`.${srcCode(src)}${tone}${cut}.gain(${gain})`),
    };
  }
}

const KICK = {
  kind: 'kick', gain: 0.6,
  sources: [(r) => bankSrc(r, 'bd'), (r) => bankSrc(r, 'bd'), (r) => bankSrc(r, 'bd'), indexed('Kit_bd', 7, 'kit'), indexed('RD6_bd', 6, 'RD6'),
    indexed('TR808_bd', 5, '808'), indexed('TR909_bd', 6, '909'), () => plainSrc('bassdrum1', 'concert'), () => plainSrc('bassdrum2', 'concert')],
  families: [['x x x x', 'x x x [x ~ ~ x]', 'x x x <x [~ x]>'], ['x ~ ~ x ~ ~ x ~ ~ ~ x ~ ~ x ~ ~', 'x ~ ~ ~ ~ ~ x ~ ~ ~ x ~ ~ ~ ~ ~', 'x ~ x ~ ~ ~ x ~ ~ x ~ ~ ~ ~ x ~'],
    ['x ~ ~ ~ ~ ~ ~ ~ ~ ~ x ~ ~ ~ ~ ~', 'x ~ ~ ~ ~ ~ ~ x ~ ~ x ~ ~ ~ ~ ~'], ['x ~ ~ x x ~ ~ ~', 'x ~ ~ x ~ ~ x ~', '[x ~ ~ x] ~ [x ~ ~ x] ~'], ['[x ~ x x]*2', 'x [~ x] x [~ x]']],
  tones: ['', '.lpf(1800)', '.shape(.4)', '.speed(.85)', '.speed(1.15)', '.room(.3)', '.shape(.25).lpf(3000)', '.hpf(40).shape(.5)'],
};
const SNARE = {
  kind: 'snare', gain: 0.4,
  sources: [(r) => bankSrc(r, 'sd'), (r) => bankSrc(r, 'cp'), (r) => bankSrc(r, 'rim'), indexed('Kit_sd', 8, 'kit'), indexed('RD6_cp', 11, 'claps'),
    indexed('Kit_rim', 4, 'kit'), indexed('TR808_sd', 4, '808'), () => plainSrc('clap', 'clap')],
  families: [['~ x ~ x', '~ x ~ [x ~ ~ x]'], ['~ x ~ [x ~ ~ x?]', '~ x [~ x?] x'], ['~ ~ x ~', '~ ~ x [~ ~ ~ x]'], ['~ ~ x ~ ~ ~ x ~', '~ ~ x ~ ~ [~ x] x ~'],
    ['~ x ~ <x [x x x x]>', '~ x ~ <[x x] x>'], ['~ ~ x ~ ~ ~ x [~ x]', '~ ~ x ~ ~ ~ [x x] ~']],
  tones: ['.room(.2)', '.room(.4)', '.lpf(3500).room(.3)', '.hpf(300)', '.speed(1.1)', '.speed(.9).room(.25)', '.shape(.3)'],
};
const HAT = {
  kind: 'hihat', gain: 0.3,
  sources: [(r) => bankSrc(r, 'hh'), (r) => bankSrc(r, 'hh'), (r) => bankSrc(r, 'oh'), (r) => bankSrc(r, 'sh'), indexed('Kit_hh', 4, 'kit'), indexed('RD6_hh', 4, 'RD6'),
    () => plainSrc('hihat', 'hihat'), () => plainSrc('tambourine2', 'tambourine'), () => plainSrc('tambourine', 'tambourine'), () => plainSrc('cabasa', 'cabasa')],
  families: [['x*16', '[x x ~ x]*4'], ['x*8', '[~ x]*8'], ['[~ x]*4', '[~ x ~ x?]*2'], ['x*12', '[x x x]*4'], ['[x ~ x x]*4', '[x x ~ x]*4']],
  tones: ['.hpf(5000)', '.hpf(4000).pan(sine.range(.3,.7).slow(4))', '.hpf(6000).velocity(perlin.range(.5,1))', '.hpf(3000).room(.2)', '.hpf(5000).pan(rand)'],
};
const PERC = {
  kind: 'perc', gain: 0.32,
  sources: [(r) => bankSrc(r, 'cb'), (r) => bankSrc(r, 'perc'), (r) => bankSrc(r, 'tb'), (r) => bankSrc(r, 'lt'), (r) => bankSrc(r, 'ht'),
    indexed('TR727_perc', 15, '727'), indexed('TR808_perc', 6, '808'), indexed('TR909_lt', 2, '909 tom'), indexed('TR606_lt', 4, '606 tom'), indexed('RD6_lt', 6, 'RD6 tom'), indexed('RD6_ht', 6, 'RD6 tom'), indexed('Kit_lt', 2, 'kit tom'), indexed('Kit_ht', 2, 'kit tom'),
    () => plainSrc('bongo', 'bongo'), () => plainSrc('conga', 'conga'), () => plainSrc('darbuka', 'darbuka'), () => plainSrc('cajon', 'cajon'), () => plainSrc('clave', 'clave'),
    () => plainSrc('woodblock', 'woodblock'), () => plainSrc('cowbell', 'cowbell'), () => plainSrc('agogo', 'agogo'), () => plainSrc('slitdrum', 'slitdrum'), () => plainSrc('framedrum', 'framedrum')],
  families: [['x(3,8)', 'x(3,8,2)'], ['x(5,16,2)', 'x(5,16)'], ['x(7,16,3)', 'x(7,16)'], ['~ x ~ [~ x]', '~ [x x] ~ x'], ['x(3,16,4)', 'x(4,16,2)'], ['[~ x]*4', '[~ x x]*2']],
  tones: ['.pan(rand).room(.25)', '.pan(sine.slow(2)).room(.3)', '.speed(1.2).pan(rand)', '.speed(.8).room(.4)', '.room(.2)'],
};

const BASS_WAVES = [
  { s: 'sawtooth', tone: '.lpf(700).lpenv(2).lpd(.1)', g: 0.3, label: 'saw' },
  { s: 'square', tone: '.lpf(900)', g: 0.26, label: 'square' },
  { s: 'triangle', tone: '.lpf(500)', g: 0.42, label: 'triangle' },
  { s: 'sine', tone: '.lpf(300).shape(.2)', g: 0.55, label: 'sine' },
  { s: 'supersaw', tone: '.lpf(1200).lpq(4)', g: 0.18, label: 'supersaw' },
  { s: 'sawtooth', tone: '.lpf(sine.range(300,2400).slow(2)).lpq(10)', g: 0.26, label: 'wobble' },
  { s: 'square', tone: '.lpf(sine.range(200,1600).fast(2)).lpq(8)', g: 0.24, label: 'wub' },
  { s: 'sine', tone: '.fm(2).fmh(1.01).lpf(1200)', g: 0.38, label: 'fm' },
  { s: 'sawtooth', tone: '.lpf(400).lpq(18).lpenv(4).lpd(.15).shape(.3)', g: 0.24, label: 'acid' },
  { s: 'triangle', tone: '.shape(.5).lpf(1500)', g: 0.32, label: 'dirty' },
];
const BASS_FAMILIES = [
  { rhythms: ['0111011101110111', '1011101110111011', '0111010101110101'], offsets: [0, 0, 0, 0, 7, 4] },
  { rhythms: ['1010101010101010', '1110111011101110'], offsets: [0, 0, 0, 7] },
  { rhythms: ['1001001010010010', '1001000110010010', '1000101000101001'], offsets: [0, 0, 4, 7, 2] },
  { rhythms: ['1000001000100000', '1000000010000000', '1001000000100000'], offsets: [0] },
  { rhythms: ['1111111111111111', '1101111011011110', '1011101110111011'], offsets: [0, 0, 0, 7, 7, 4, 2] },
  { rhythms: ['1010101010101010', '1001100110011001'], offsets: [0, 7, 0, 7, 4] },
];
const BASS_ENVS = ['.decay(.15).sustain(0)', '.decay(.3).sustain(.4).release(.1)', '.sustain(.8).release(.1)', '.decay(.2).sustain(.2)'];

const PAD_INST = [
  { s: 'supersaw', tone: '.attack(.4).release(1.5).lpf(1500).room(.7).roomsize(5)', g: 0.1 },
  { s: 'sawtooth', tone: '.attack(.3).release(1).lpf(1100).room(.6)', g: 0.12 },
  { s: 'triangle', tone: '.attack(.5).release(1.5).room(.6)', g: 0.2 },
  { s: 'sine', tone: '.fm(1).fmh(2).attack(.3).release(1.2).room(.6)', g: 0.17 },
  { s: 'square', tone: '.lpf(900).attack(.2).release(.8).room(.5)', g: 0.1 },
  { s: 'piano', tone: '.room(.5)', g: 0.34, samples: ['piano'] },
  { s: 'piano1', tone: '.room(.5)', g: 0.34, samples: ['piano1'] },
  { s: 'marimba', tone: '.room(.4)', g: 0.36, samples: ['marimba'] },
  { s: 'vibraphone', tone: '.room(.4)', g: 0.34, samples: ['vibraphone'] },
  { s: 'sawtooth', tone: '.attack(.1).release(.6).lpf(1400).room(.5)', g: 0.1 },
  { s: 'triangle', tone: '.fm(2).fmh(3).attack(.05).release(.8).room(.5)', g: 0.16 },
  { s: 'fmpiano', tone: '.room(.4)', g: 0.3, samples: ['fmpiano'] },
  { s: 'clavisynth', tone: '.room(.3)', g: 0.3, samples: ['clavisynth'] },
  { s: 'harp', tone: '.room(.5)', g: 0.38, samples: ['harp'] },
];
const PAD_RHYTHMS = [[null], ['x ~ ~ x ~ ~ x ~', 'x ~ x ~'], ['[~ x]*4', '[~ x]*2'], ['x*8', '[x x ~ x]*2'], ['~ x ~ [x ~ ~ x]', 'x ~ [~ x] ~'], ['x ~ ~ ~ x ~ ~ x', '~ [x x] ~ x']];

const ARP_INST = [
  { s: 'square', tone: '.decay(.12).sustain(0).lpf(sine.range(900,3500).slow(8))', g: 0.1, root: 'A3' },
  { s: 'triangle', tone: '.decay(.15).sustain(0)', g: 0.2, root: 'A4' },
  { s: 'sawtooth', tone: '.decay(.08).sustain(0).lpf(2200)', g: 0.12, root: 'A3' },
  { s: 'sine', tone: '.fm(4).fmh(2.01).decay(.3).sustain(0)', g: 0.16, root: 'A4' },
  { s: 'marimba', tone: '', g: 0.4, root: 'A3', samples: ['marimba'] },
  { s: 'folkharp', tone: '', g: 0.4, root: 'A4', samples: ['folkharp'] },
  { s: 'glockenspiel', tone: '', g: 0.3, root: 'A4', samples: ['glockenspiel'] },
  { s: 'vibraphone', tone: '', g: 0.36, root: 'A3', samples: ['vibraphone'] },
  { s: 'xylophone_medium_ff', tone: '', g: 0.32, root: 'A4', samples: ['xylophone_medium_ff'] },
  { s: 'harp', tone: '', g: 0.38, root: 'A3', samples: ['harp'] },
  { s: 'strumstick', tone: '', g: 0.36, root: 'A3', samples: ['strumstick'] },
  { s: 'balafon', tone: '', g: 0.36, root: 'A3', samples: ['balafon'] },
  { s: 'handchimes', tone: '', g: 0.3, root: 'A4', samples: ['handchimes'] },
  { s: 'dantranh', tone: '', g: 0.36, root: 'A3', samples: ['dantranh'] },
];
const SPACES = ['', '.delay(.3).delaytime(__DT__)', '.delay(.4).delaytime(__DT__).delayfeedback(.55).room(.4)', '.room(.5).pan(sine.fast(2))', '.jux(rev).room(.3)'];

const LEAD_INST = [
  { s: 'sawtooth', tone: '.lpf(2400).decay(.2).sustain(.4).release(.3)', g: 0.12, root: 'A4' },
  { s: 'square', tone: '.lpf(2000).decay(.2).sustain(.5).release(.2)', g: 0.1, root: 'A4' },
  { s: 'triangle', tone: '.attack(.04).release(.4).vib(5).vibmod(.25)', g: 0.18, root: 'A4' },
  { s: 'sine', tone: '.attack(.05).release(.5).vib(6).vibmod(.3)', g: 0.2, root: 'A5' },
  { s: 'supersaw', tone: '.lpf(3000).decay(.25).sustain(.5).release(.3)', g: 0.09, root: 'A4' },
  { s: 'sine', tone: '.fm(3).fmh(1.5).decay(.3).sustain(.3)', g: 0.15, root: 'A4' },
  { s: 'sax', tone: '.room(.3)', g: 0.36, root: 'A3', samples: ['sax'] },
  { s: 'saxello_vib', tone: '.room(.3)', g: 0.36, root: 'A3', samples: ['saxello_vib'] },
  { s: 'recorder_alto_vib', tone: '.room(.4)', g: 0.36, root: 'A4', samples: ['recorder_alto_vib'] },
  { s: 'recorder_tenor_vib', tone: '.room(.4)', g: 0.36, root: 'A4', samples: ['recorder_tenor_vib'] },
  { s: 'square', tone: '.lpf(1600).attack(.02).decay(.15).sustain(.3).vib(4).vibmod(.15)', g: 0.09, root: 'A4' },
  { s: 'xylophone_soft_ff', tone: '.room(.3)', g: 0.34, root: 'A4', samples: ['xylophone_soft_ff'] },
  { s: 'sawtooth', tone: '.lpf(1800).decay(.12).sustain(.2).release(.1).delay(.2).delaytime(__DT__)', g: 0.11, root: 'A4' },
];
const LEAD_SHAPES = [
  { slots: 8, density: 0.55, hold: 0.3 }, { slots: 4, density: 0.75, hold: 0.6 }, { slots: 16, density: 0.35, hold: 0.2 },
  { slots: 8, density: 0.8, hold: 0.1 }, { slots: 8, density: 0.4, hold: 0.6 },
];

const hpfMap = (base, div) => (d) => Math.round(base * 2 ** (d / div));
const FX = [
  { kind: 'riser 4', code: `s("white*16").decay(.08).sustain(0).gain(saw.range(.04,.2).slow(4)).hpf(saw.range(400,9000).slow(4))`, voice: drum(`.s("white").decay(.07).sustain(0).gain(.12)`, 'hpf', hpfMap(300, 3)) },
  { kind: 'riser 8', code: `s("white*16").decay(.08).sustain(0).gain(saw.range(.04,.22).slow(8)).hpf(saw.range(300,10000).slow(8))`, voice: drum(`.s("white").decay(.1).sustain(0).gain(.12)`, 'hpf', hpfMap(300, 3)) },
  { kind: 'downlifter', code: `s("white*16").decay(.08).sustain(0).gain(isaw.range(.04,.2).slow(4)).lpf(isaw.range(500,9000).slow(4))`, voice: drum(`.s("pink").decay(.1).sustain(0).gain(.14)`, 'lpf', hpfMap(300, 3)) },
  { kind: 'crash', samples: ['TR909_cr'], code: `s("cr").bank("TR909").struct("<x ~>").gain(.3).room(.4)`, voice: drum(`.s("cr").bank("TR909").gain(.3)`) },
  { kind: 'zap', code: `n("[14 ~ ~ ~] ~ [~ ~ 10 ~] ~").scale("A5:minor").s("square").decay(.06).sustain(0).lpf(3000).gain(.08)`, voice: drum(`.s("square").decay(.05).sustain(0).lpf(3000).gain(.08)`, 'n', (d) => d) },
  { kind: 'bleep', code: `n("[~ 7] ~ [~ ~ 12 ~] ~").scale("A5:minor").s("sine").decay(.08).sustain(0).gain(.18)`, voice: drum(`.s("sine").decay(.08).sustain(0).gain(.18)`, 'n', (d) => d) },
  { kind: 'space', code: `n("0 ~ [~ 4] ~").scale("A4:minor").s("z_sine").slide(2).decay(.4).sustain(0).room(.6).gain(.2)`, voice: drum(`.s("z_sine").slide(2).decay(.4).sustain(0).room(.6).gain(.2)`, 'n', (d) => d) },
  { kind: 'invaders', code: `n("[0 ~ ~ ~] ~ ~ [~ -3]").scale("A3:minor").s("z_square").slide(-.5).decay(.15).sustain(0).gain(.1)`, voice: drum(`.s("z_square").slide(-.5).decay(.15).sustain(0).gain(.1)`, 'n', (d) => d) },
  { kind: 'whistle', samples: ['TR727_perc:10'], code: `s("TR727_perc:10").struct("~ x ~ ~").gain(.3).room(.3)`, voice: drum(`.s("TR727_perc:10").gain(.3)`) },
];
const TEXTURES = [
  { kind: 'rain', code: `s("white*16").degradeBy(.3).decay(.01).sustain(0).hpf(6000).gain(rand.range(.01,.05))`, voice: drum(`.s("white").decay(.01).sustain(0).gain(.06)`, 'hpf', hpfMap(2000, 5)) },
  { kind: 'dust', code: `s("white*8").degradeBy(.7).decay(.015).sustain(0).hpf(800).lpf(4000).gain(rand.range(.02,.06))`, voice: drum(`.s("white").decay(.015).sustain(0).gain(.06)`, 'lpf', hpfMap(800, 4)) },
  { kind: 'clicks', samples: range('TR808_perc', 3), code: `s("TR808_perc").n(irand(3)).struct("x(5,16,<0 3>)").hpf(2000).gain(.12)`, voice: drum(`.s("TR808_perc").hpf(2000).gain(.12)`, 'n', (d) => d % 3) },
  { kind: 'glass', samples: ['wineglass'], code: `s("wineglass").struct("x(3,8,<0 2>)").room(.4).gain(.15)`, voice: drum(`.s("wineglass").room(.4).gain(.15)`) },
  { kind: 'bubbles', code: `n("0(3,8,<0 2>)").scale("A4:minor").s("z_sine").slide(4).decay(.08).sustain(0).room(.3).gain(.16)`, voice: drum(`.s("z_sine").slide(4).decay(.08).sustain(0).gain(.16)`, 'n', (d) => d) },
  { kind: 'tinks', samples: ['TR727_perc:14'], code: `s("TR727_perc:14").struct("x(3,16,<2 5>)").pan(rand).gain(.14)`, voice: drum(`.s("TR727_perc:14").gain(.14)`) },
  { kind: 'hum', code: `s("white*4").attack(.1).decay(.3).sustain(.4).lpf(sine.range(400,900).slow(4)).gain(.18)`, voice: drum(`.s("white").attack(.05).decay(.2).sustain(.3).gain(.18)`, 'lpf', hpfMap(300, 4)) },
  { kind: 'drone', code: () => `chord("${PROG}").voicing().s("supersaw").attack(1).release(2).lpf(600).room(.6).gain(.12)`, voice: melodic('A2', `.s("supersaw").attack(.3).release(1).lpf(700).gain(.12)`) },
  { kind: 'bells', samples: ['sleighbells'], code: `s("sleighbells").struct("[~ x]*2").gain(.18).room(.3)`, voice: drum(`.s("sleighbells").gain(.18)`) },
];

const MOOD_FX = [
  { slot: 'lp', make: (r) => `.lpf(${r.int(4, 12) * 100})`, word: '먹먹' },
  { slot: 'lp', make: (r) => `.lpf(sine.range(300,3000).slow(${r.pick([2, 4, 8])}))`, word: '숨쉬는' },
  { slot: 'hp', make: (r) => `.hpf(${r.int(3, 9) * 100})`, word: '얇은' },
  { slot: 'crush', make: (r) => `.crush(${r.int(3, 7)})`, word: '8비트' },
  { slot: 'coarse', make: (r) => `.coarse(${r.int(2, 8)})`, word: '깨진' },
  { slot: 'room', make: (r) => `.room(${(r.int(6, 10) / 10).toFixed(1)}).roomsize(${r.int(4, 10)})`, word: '넓은' },
  { slot: 'delay', make: (r) => `.delay(${(r.int(3, 6) / 10).toFixed(1)}).delaytime(__DT__).delayfeedback(${(r.int(4, 7) / 10).toFixed(1)})`, word: '메아리' },
  { slot: 'pan', make: (r) => `.pan(sine.fast(${r.int(1, 4)}))`, word: '빙글' },
  { slot: 'shape', make: (r) => `.shape(${(r.int(3, 7) / 10).toFixed(1)})`, word: '찌그러진' },
  { slot: 'vowel', make: (r) => `.vowel("${r.pick(['a', 'e', 'i', 'o', 'u'])}")`, word: '말하는' },
  { slot: 'jux', make: () => `.jux(rev)`, word: '거울' },
  { slot: 'deg', make: (r) => `.degradeBy(${(r.int(2, 4) / 10).toFixed(1)})`, word: '구멍' },
  { slot: 'swing', make: (r) => `.swingBy(${r.pick(['1/3', '1/6'])}, 4)`, word: '스윙' },
];
// balance moods: the roles they turn down (src/orbPreset.js duckOf), and how the kind line says it
const MOOD_MUTES = [
  { duck: DRUM_CATS, label: '드럼 줄임' },
  { duck: ['bass', 'pad', 'arp', 'lead', 'fx', 'texture'], label: '드럼 강조' },
  { duck: ['bass'], label: '베이스 줄임' },
  { duck: ['lead', 'arp'], label: '멜로디 줄임' },
  { duck: ['pad', 'arp', 'lead', 'texture'], label: '리듬 강조' },
];
// what a balance mood's `duck` turns down, in words ('' if it is none of these)
export const duckLabel = (duck) => MOOD_MUTES.find((m) => m.duck.length === duck.length && m.duck.every((r) => duck.includes(r)))?.label ?? '';
// A mood's sub-type, by its first effect (a generated mood with a balance part is a balance mood).
// The kind line starts with it ("공간 · 넓은+메아리"); search finds it with t:공간 and so on.
export const MOOD_SUBS = {
  eq: 'EQ', filter: '필터', space: '공간', texture: '질감', motion: '움직임', mix: '밸런스',
};
const SUB_OF_SLOT = {
  lp: 'filter', hp: 'filter', room: 'space', delay: 'space', crush: 'texture', coarse: 'texture', shape: 'texture',
  vowel: 'texture', pan: 'motion', jux: 'motion', deg: 'motion', swing: 'motion',
};

const COMBO_TEMPLATES = [
  ['kick', 'snare', 'hat'], ['kick', 'bass', 'hat'], ['pad', 'lead', 'texture'], ['kick', 'snare', 'bass', 'pad'], ['arp', 'lead', 'pad'],
  ['kick', 'bass', 'fx', 'hat'], ['perc', 'bass', 'arp'], ['snare', 'hat', 'perc'], ['bass', 'pad'], ['kick', 'snare', 'hat', 'bass', 'lead'],
];

// [hue from, hue to, saturation, lightness] per category
const HUES = {
  // drums red → yellow, bass / chords / arpeggio blue → violet, lead teal-green, effects grey
  kick: [350, 8, 80, 55], snare: [14, 30, 85, 58], hat: [44, 58, 90, 64], perc: [28, 44, 70, 50], bass: [252, 272, 70, 52],
  pad: [212, 236, 72, 64], arp: [276, 300, 72, 66], lead: [150, 178, 75, 50], fx: [200, 240, 10, 62], texture: [200, 240, 10, 62],
};

function generateOrbs(existing) {
  const r = rng(2611);
  const used = new Set(existing.map((l) => l.name));
  const name = (cat) => {
    const nouns = NOUNS[cat].split(' ');
    for (let k = 0; k < 500; k++) {
      const n = `${r.pick(ADJ)} ${r.pick(nouns)}`;
      if (!used.has(n)) {
        used.add(n);
        return n;
      }
    }
    return `${r.pick(ADJ)} ${r.pick(nouns)} ${used.size}`;
  };
  const color = (cat) => {
    const [h0, h1, s, l] = HUES[cat];
    return hex((h0 + r() * ((h1 - h0 + 360) % 360)) % 360, s + r.int(-10, 10), l + r.int(-8, 8));
  };
  const count = (pred) => existing.filter(pred).length * 9;
  const out = [];
  const add = (cat, def) => {
    const n = out.filter((l) => l.cat === cat).length + 1;
    out.push({ id: `${cat}${n}`, cat, name: name(cat), color: color(cat), ...def });
  };

  for (const [cat, spec] of [['kick', KICK], ['snare', SNARE], ['hat', HAT], ['perc', PERC]]) {
    for (const def of genDrums(r, cat, count((l) => l.cat === cat), spec)) add(cat, def);
  }
  for (let i = count((l) => l.cat === 'bass'); i > 0; i--) {
    const w = r.pick(BASS_WAVES), fam = r.pick(BASS_FAMILIES), env = r.pick(BASS_ENVS);
    add('bass', {
      kind: `bass · ${w.label}`,
      code: (v) => `n(${bassLine(v, fam.rhythms, fam.offsets)}).scale("A1:minor").s("${w.s}")${w.tone}${env}.gain(${w.g})`,
      voice: melodic('A1', `.s("${w.s}")${w.tone}.decay(.25).sustain(.6).release(.1).gain(${w.g})`, 'triad'),
    });
  }
  for (let i = count((l) => l.cat === 'pad'); i > 0; i--) {
    const inst = r.pick(PAD_INST), rh = r.pick(PAD_RHYTHMS);
    add('pad', {
      kind: `chords · ${inst.s.replace(/_.*/, '')}`, samples: inst.samples,
      code: (v) => {
        const p = v.pick(rh);
        return `chord("${PROG}").voicing()${p ? `.struct("${p}")` : ''}.s("${inst.s}")${inst.tone}${clipped(inst)}.gain(${inst.g})`;
      },
      voice: melodic('A3', `.s("${inst.s}")${inst.tone}${clipped(inst)}.gain(${inst.g})`),
    });
  }
  for (let i = count((l) => l.cat === 'arp'); i > 0; i--) {
    const inst = r.pick(ARP_INST), space = r.pick(SPACES);
    add('arp', {
      kind: `arp · ${inst.s.replace(/_.*/, '')}`, samples: inst.samples,
      code: (v) => `n(${arpLine(v, 0, 14)}).scale("${inst.root}:minor").s("${inst.s}")${inst.tone}${clipped(inst)}${space}.gain(${inst.g})`,
      voice: melodic(inst.root, `.s("${inst.s}")${inst.tone}${clipped(inst)}${space}.gain(${inst.g})`),
    });
  }
  for (let i = count((l) => l.cat === 'lead'); i > 0; i--) {
    const inst = r.pick(LEAD_INST), shape = r.pick(LEAD_SHAPES), space = r.pick(SPACES);
    add('lead', {
      kind: `melody · ${inst.s.replace(/_.*/, '')}`, samples: inst.samples,
      code: (v) => `n(${melody(v, { ...shape, lo: 0, hi: 9 })}).scale("${inst.root}:minor").s("${inst.s}")${inst.tone}${clipped(inst)}${space}.gain(${inst.g})`,
      voice: melodic(inst.root, `.s("${inst.s}")${inst.tone}${clipped(inst)}${space}.gain(${inst.g})`),
    });
  }
  const choked = (def) => {
    if (!def.samples) return def;
    const cut = choke();
    return { ...def, code: def.code + cut, voice: { ...def.voice, sound: def.voice.sound + cut } };
  };
  for (const def of FX) add('fx', choked(def));
  for (const def of TEXTURES) add('texture', choked(def));

  // tempo: darker orbs slow the song down, paler ones speed it up
  for (const bpm of [70, 74, 78, 82, 86, 90, 100, 104, 108]) {
    const h = r() * 360;
    out.push({ id: `slow${bpm}`, cat: 'tempo', kind: `tempo ↓ ${bpm}`, name: name('slow'), color: hex(h, 30, 8 + r.int(0, 6)), glow: hex(h, 70, 78), dark: true, bpm });
  }
  for (const bpm of [128, 132, 136, 140, 144, 152, 160, 168, 174]) {
    const h = r() * 360;
    out.push({ id: `fast${bpm}`, cat: 'tempo', kind: `tempo ↑ ${bpm}`, name: name('fast'), color: hex(h, 60, 92 + r.int(0, 6)), glow: hex(h, 80, 75), bpm });
  }

  // combos: one sound orb per role of a template
  const sounds = [...existing, ...out].filter((l) => l.code && l.cat in HUES);
  for (let i = 0; i < count((l) => l.combo); i++) {
    const combo = COMBO_TEMPLATES[i % COMBO_TEMPLATES.length].map((c) => r.pick(sounds.filter((l) => l.cat === c)).id);
    out.push({ id: `combo${i + 1}`, cat: 'combo', kind: `combo · ${combo.length}`, name: name('combo'), combo });
  }

  // moods: one or two effects on everything, sometimes with part of the band turned down
  for (let i = 0; i < count((l) => l.cat === 'mood'); i++) {
    const picks = r.shuffle(MOOD_FX).filter((f, k, arr) => arr.findIndex((g) => g.slot === f.slot) === k).slice(0, r.pick([1, 1, 2]));
    const mute = r.chance(0.2) ? r.pick(MOOD_MUTES) : null;
    const sub = mute ? 'mix' : SUB_OF_SLOT[picks[0].slot];
    out.push({
      id: `mood${i + 1}`, cat: 'mood', sub, name: name('mood'),
      colors: Array.from({ length: 3 }, () => hex(r() * 360, 75 + r.int(0, 20), 55 + r.int(0, 15))),
      kind: `${MOOD_SUBS[sub]} · ${[...(mute ? [mute.label] : []), ...picks.map((p) => p.word)].join('+')}`,
      fx: picks.map((p) => p.make(r)).join(''), duck: mute?.duck,
    });
  }
  return out;
}

// ---------- second batch: sounds from the loaded banks that were still unused ----------
// Generated in its own pass with its own seed, after everything above, so the first 300 orbs
// (their ids, names, sounds and level trims) stay exactly as they were.

// (there used to be more drum machines here; the CC0 bank has one set, shared with BANKS)
const MORE_BANKS = BANKS;
const moreBankSrc = (r, snd) => {
  const b = r.pick(MORE_BANKS.filter((x) => x.has.includes(snd)));
  return { s: snd, bank: b.name, label: b.label, samples: [`${b.name}_${snd}`] };
};
// VCSL hand percussion, one indexed pick each. These 11 slots used to be mridangam strokes
// (CC BY-SA); keeping 11 one-draw sources keeps the rng stream, so no other orb changes.
// (clave and woodblock sat here first but measured too quiet to trim, so those slots got drums)
const HAND_PERC = [['bongo', 28], ['conga', 34], ['darbuka', 20], ['cajon', 18], ['framedrum', 18], ['slitdrum', 6], ['cajon', 18], ['darbuka', 20], ['agogo', 5], ['tambourine', 7], ['cowbell', 13]];

const MORE_DRUMS = {
  kick: { ...KICK, sources: [(r) => moreBankSrc(r, 'bd'), (r) => moreBankSrc(r, 'bd'), () => plainSrc('Kit_bd:6', 'kit soft'), () => plainSrc('RD6_bd:5', 'RD6 long')] },
  snare: { ...SNARE, sources: [(r) => moreBankSrc(r, 'sd'), (r) => moreBankSrc(r, 'cp'), (r) => moreBankSrc(r, 'rim')] },
  hat: {
    ...HAT,
    sources: [(r) => moreBankSrc(r, 'hh'), (r) => moreBankSrc(r, 'oh'), (r) => moreBankSrc(r, 'sh'), indexed('TR808_hh', 2, '808'), indexed('TR808_oh', 3, '808'),
      indexed('TR606_hh', 2, '606'), indexed('Kit_oh', 4, 'kit'), indexed('triangles', 37, 'triangle')],
  },
  perc: {
    ...PERC,
    sources: [(r) => moreBankSrc(r, 'cb'), (r) => moreBankSrc(r, 'perc'), (r) => moreBankSrc(r, 'tb'), indexed('TR808_perc', 6, 'conga'), indexed('TR727_perc', 15, '727'),
      indexed('TR808_ht', 3, 'tom'), indexed('TR808_lt', 4, 'tom'), indexed('TR707_lt', 2, 'tom'), indexed('TR707_ht', 2, 'tom'), indexed('TR606_ht', 2, 'tom'), indexed('TR808_cb', 2, 'cowbell'),
      indexed('tom_mallet', 8, 'tom'), indexed('tom2_stick', 8, 'tom'), indexed('timpani', 30), indexed('anvil', 9), indexed('brakedrum', 17, 'brake'),
      indexed('guiro', 5), indexed('slapstick', 5), indexed('ratchet', 8),
      ...HAND_PERC.map(([k, n]) => indexed(k, n))],
  },
};

// pitched VCSL instruments that were unused (one sample per key), short or struck
const MORE_ARP = [
  { s: 'tubularbells', tone: '.room(.4)', g: 0.3, root: 'A3', samples: ['tubularbells'] },
  { s: 'tubularbells2', tone: '.room(.4)', g: 0.3, root: 'A3', samples: ['tubularbells2'] },
  { s: 'xylophone_hard_ff', tone: '', g: 0.3, root: 'A4', samples: ['xylophone_hard_ff'] },
  { s: 'xylophone_medium_pp', tone: '', g: 0.4, root: 'A4', samples: ['xylophone_medium_pp'] },
  { s: 'balafon_hard', tone: '', g: 0.36, root: 'A3', samples: ['balafon_hard'] },
  { s: 'balafon_soft', tone: '', g: 0.4, root: 'A3', samples: ['balafon_soft'] },
  { s: 'vibraphone_soft', tone: '.room(.3)', g: 0.4, root: 'A3', samples: ['vibraphone_soft'] },
  { s: 'belltree', tone: '.room(.3)', g: 0.3, root: 'A4', samples: ['belltree'] },
];
const MORE_LEAD = [
  { s: 'sax_stacc', tone: '.room(.3)', g: 0.36, root: 'A3', samples: ['sax_stacc'] },
  { s: 'saxello_stacc', tone: '.room(.3)', g: 0.36, root: 'A3', samples: ['saxello_stacc'] },
  { s: 'recorder_alto_stacc', tone: '.room(.4)', g: 0.36, root: 'A4', samples: ['recorder_alto_stacc'] },
  { s: 'recorder_tenor_stacc', tone: '.room(.4)', g: 0.36, root: 'A3', samples: ['recorder_tenor_stacc'] },
  { s: 'recorder_soprano_stacc', tone: '.room(.4)', g: 0.34, root: 'A4', samples: ['recorder_soprano_stacc'] },
  { s: 'dantranh_tremolo', tone: '.room(.3)', g: 0.34, root: 'A3', samples: ['dantranh_tremolo'] },
  // ZZFX chip leads: synthesised on the spot, nothing to download
  { s: 'z_square', tone: '.decay(.12).sustain(.4).release(.05)', g: 0.12, root: 'A4' },
  { s: 'z_triangle', tone: '.decay(.15).sustain(.5).tremolo(.3)', g: 0.2, root: 'A4' },
  { s: 'z_sawtooth', tone: '.decay(.1).sustain(.3).zcrush(.2)', g: 0.1, root: 'A4' },
];
// ZZFX chip basses and pads
const CHIP_BASS = [
  { s: 'z_square', tone: '.decay(.12).sustain(.3)', g: 0.2, label: 'chip' },
  { s: 'z_triangle', tone: '.decay(.2).sustain(.6)', g: 0.4, label: 'chip' },
  { s: 'z_sawtooth', tone: '.decay(.1).sustain(.2).zcrush(.15)', g: 0.16, label: 'crunch' },
  { s: 'z_tan', tone: '.decay(.15).sustain(.3)', g: 0.12, label: 'tan' },
];
const CHIP_PAD = [
  { s: 'z_triangle', tone: '.attack(.05).decay(.3).sustain(.5).release(.3)', g: 0.12 },
  { s: 'z_sine', tone: '.attack(.1).sustain(.6).release(.4).tremolo(.4)', g: 0.14 },
  { s: 'z_square', tone: '.attack(.02).decay(.2).sustain(.3).release(.2)', g: 0.06 },
];

// sound effects: ZZFX game sounds plus voice, rave and junk samples, all hitting at least once a bar
const MORE_FX = [
  { kind: 'laser', code: `n("[9 ~ ~ ~] ~ [~ 7 ~ ~] ~").scale("A5:minor").s("z_sawtooth").slide(-1).decay(.15).sustain(0).gain(.12)`, voice: drum(`.s("z_sawtooth").slide(-1).decay(.15).sustain(0).gain(.12)`, 'n', (d) => d) },
  { kind: 'coin', code: `n("~ ~ [7 ~] ~").scale("A5:minor").s("z_square").pitchJump(500).pitchJumpTime(.06).decay(.2).sustain(0).gain(.1)`, voice: drum(`.s("z_square").pitchJump(500).pitchJumpTime(.06).decay(.2).sustain(0).gain(.1)`, 'n', (d) => d) },
  { kind: 'jump', code: `n("[0 ~ ~ ~] ~ ~ [~ ~ 4 ~]").scale("A4:minor").s("z_sine").slide(1).decay(.18).sustain(0).gain(.2)`, voice: drum(`.s("z_sine").slide(1).decay(.18).sustain(0).gain(.2)`, 'n', (d) => d) },
  { kind: 'boom', code: `n("<0 ~> ~ ~ ~").scale("A1:minor").s("z_noise").decay(.6).sustain(0).lpf(1500).gain(.3)`, voice: drum(`.s("z_noise").decay(.4).sustain(0).lpf(1500).gain(.3)`, 'lpf', hpfMap(300, 3)) },
  { kind: 'zap', code: `n("~ [11 ~] ~ ~").scale("A5:minor").s("z_tan").slide(-2).zcrush(.3).decay(.1).sustain(0).gain(.1)`, voice: drum(`.s("z_tan").slide(-2).zcrush(.3).decay(.1).sustain(0).gain(.1)`, 'n', (d) => d) },
  { kind: 'hoover', code: `n("<0 ~> ~ ~ ~").scale("A2:minor").s("supersaw").lpf(2400).decay(.6).sustain(0).gain(.12)`, voice: drum(`.s("supersaw").lpf(2400).decay(.5).sustain(0).gain(.12)`, 'n', (d) => d) },
  { kind: 'rave stab', code: `n("~ [~ 0] ~ ~").scale("A4:minor").s("sawtooth").lpf(3000).decay(.15).sustain(0).room(.3).gain(.12)`, voice: drum(`.s("sawtooth").lpf(3000).decay(.15).sustain(0).gain(.12)`, 'n', (d) => d) },
  { kind: 'whistle', samples: ['TR727_perc:11'], code: `s("TR727_perc:11").struct("~ ~ ~ <x ~>").gain(.3)`, voice: drum(`.s("TR727_perc:11").gain(.3)`) },
  { kind: 'quijada', samples: ['TR727_perc:12', 'TR727_perc:13'], code: `s("TR727_perc").n("<12 13>").struct("x(3,8,<0 2>)").gain(.3)`, voice: drum(`.s("TR727_perc:12").gain(.3)`) },
  { kind: 'glitch', code: `s("z_noise").struct("x(5,16,<1 3>)").decay(.03).sustain(0).hpf(2000).gain(.15)`, voice: drum(`.s("z_noise").decay(.03).sustain(0).hpf(2000).gain(.15)`, 'hpf', hpfMap(500, 3)) },
  { kind: 'flexatone', samples: range('flexatone', 8), code: `s("flexatone").n(irand(8)).struct("~ ~ <x ~> ~").clip(1).gain(.3)`, voice: drum(`.s("flexatone").clip(1).gain(.3)`, 'n', (d) => d % 8) },
  { kind: 'vibraslap', samples: range('vibraslap', 4), code: `s("vibraslap").n(irand(4)).struct("~ ~ ~ <x ~>").gain(.3)`, voice: drum(`.s("vibraslap").gain(.3)`, 'n', (d) => d % 4) },
];
const MORE_TEXTURES = [
  { kind: 'didgeridoo', samples: range('didgeridoo', 12), code: `s("didgeridoo").n(irand(12)).struct("<x ~>").clip(2).gain(.25)`, voice: drum(`.s("didgeridoo").clip(1).gain(.25)`, 'n', (d) => d % 12) },
  { kind: 'shimmer', samples: range('triangles', 37), code: `s("triangles").n(irand(37)).struct("x(3,8,<0 3>)").pan(rand).hpf(3000).gain(.12)`, voice: drum(`.s("triangles").hpf(3000).gain(.12)`, 'n', (d) => d * 2) },
  { kind: 'maracas', samples: range('TR808_sh', 2), code: `s("TR808_sh").n(irand(2)).struct("x(3,16,<2 6>)").gain(.18)`, voice: drum(`.s("TR808_sh").gain(.18)`, 'n', (d) => d % 2) },
  { kind: 'flicks', samples: range('TR909_hh', 2), code: `s("TR909_hh").n(irand(2)).struct("[~ x]*4").degradeBy(.4).hpf(1500).gain(.15)`, voice: drum(`.s("TR909_hh").hpf(1500).gain(.15)`, 'n', (d) => d % 2) },
];

const MORE_COMBOS = [['perc', 'perc', 'hat'], ['bass', 'lead'], ['kick', 'fx', 'arp'], ['pad', 'arp', 'texture'], ['kick', 'snare', 'perc', 'bass'], ['hat', 'lead', 'pad']];

function generateMore(existing) {
  const r = rng(2612);
  const used = new Set(existing.map((l) => l.name));
  const name = (cat) => {
    const nouns = NOUNS[cat].split(' ');
    for (let k = 0; k < 500; k++) {
      const n = `${r.pick(ADJ)} ${r.pick(nouns)}`;
      if (!used.has(n)) {
        used.add(n);
        return n;
      }
    }
    return `${r.pick(ADJ)} ${r.pick(nouns)} ${used.size}`;
  };
  const color = (cat) => {
    const [h0, h1, s, l] = HUES[cat];
    return hex((h0 + r() * ((h1 - h0 + 360) % 360)) % 360, s + r.int(-10, 10), l + r.int(-8, 8));
  };
  // ids carry on from the highest number already used in that category
  const next = {};
  const nextId = (cat) => {
    next[cat] ??= Math.max(0, ...existing.map((l) => (l.cat === cat && /\d+$/.exec(l.id)?.[0]) || 0).map(Number));
    return `${cat}${++next[cat]}`;
  };
  const out = [];
  const add = (cat, def) => out.push({ id: nextId(cat), cat, name: name(cat), color: color(cat), ...def });

  for (const [cat, n] of [['kick', 6], ['snare', 6], ['hat', 6], ['perc', 14]]) {
    for (const def of genDrums(r, cat, n, MORE_DRUMS[cat])) add(cat, def);
  }
  for (const w of CHIP_BASS) {
    const fam = r.pick(BASS_FAMILIES);
    add('bass', {
      kind: `bass · ${w.label}`,
      code: (v) => `n(${bassLine(v, fam.rhythms, fam.offsets)}).scale("A2:minor").s("${w.s}")${w.tone}.gain(${w.g})`,
      voice: melodic('A2', `.s("${w.s}")${w.tone}.gain(${w.g})`, 'triad'),
    });
  }
  for (const inst of CHIP_PAD) {
    const rh = r.pick(PAD_RHYTHMS.slice(1));
    add('pad', {
      kind: 'chords · chip',
      code: (v) => `chord("${PROG}").voicing().struct("${v.pick(rh)}").s("${inst.s}")${inst.tone}.gain(${inst.g})`,
      voice: melodic('A3', `.s("${inst.s}")${inst.tone}.gain(${inst.g})`),
    });
  }
  for (const inst of MORE_ARP) {
    const space = r.pick(SPACES);
    add('arp', {
      kind: `arp · ${inst.s.replace(/_.*/, '')}`, samples: inst.samples,
      code: (v) => `n(${arpLine(v, 0, 14)}).scale("${inst.root}:minor").s("${inst.s}")${inst.tone}${clipped(inst)}${space}.gain(${inst.g})`,
      voice: melodic(inst.root, `.s("${inst.s}")${inst.tone}${clipped(inst)}${space}.gain(${inst.g})`),
    });
  }
  for (const inst of MORE_LEAD) {
    const shape = r.pick(LEAD_SHAPES), space = r.pick(SPACES);
    add('lead', {
      kind: `melody · ${inst.s.replace(/^z_/, 'chip ').replace(/_.*/, '')}`, samples: inst.samples,
      code: (v) => `n(${melody(v, { ...shape, lo: 0, hi: 9 })}).scale("${inst.root}:minor").s("${inst.s}")${inst.tone}${clipped(inst)}${space}.gain(${inst.g})`,
      voice: melodic(inst.root, `.s("${inst.s}")${inst.tone}${clipped(inst)}${space}.gain(${inst.g})`),
    });
  }
  const choked = (def) => {
    if (!def.samples) return def;
    const cut = choke();
    return { ...def, code: def.code + cut, voice: { ...def.voice, sound: def.voice.sound + cut } };
  };
  for (const def of MORE_FX) add('fx', choked(def));
  for (const def of MORE_TEXTURES) add('texture', choked(def));

  // a few combos built from the new sounds
  const fresh = (c) => out.filter((l) => l.cat === c);
  for (const roles of MORE_COMBOS) {
    const picks = [];
    for (const c of roles) picks.push(r.pick(fresh(c).filter((l) => !picks.includes(l.id))).id);
    out.push({ id: nextId('combo'), cat: 'combo', kind: `combo · ${picks.length}`, name: name('combo'), combo: picks });
  }
  return out;
}

// ---------- third batch: major / minor ----------
// Mode orbs switch the whole song between A minor and A major. Mode combos are ready-made sets
// for one mood or the other: the mode orb plus three to five parts that suit it.
// Key orbs: every tonic in major and minor. `key` is how far the song moves from A in
// semitones (kept within -6…+5 so parts stay near their register). A major / A minor keep their
// old ids, which combos and saved presets use.
export const keyLabel = (l) => `${KEYS[(l.key + 12) % 12]}${l.mode === 'minor' ? 'm' : ''}`;
const KEY_NOUNS = {
  major: '햇살 축제 아침 소풍 무지개 산책 여름 퍼레이드 불꽃 생일 바람 정원',
  minor: '달빛 그림자 새벽 빗속 골목 안개 밤바다 비밀 폐허 심야 겨울 미로',
};
const MODE_ORBS = KEYS.flatMap((tonic, i) => ['minor', 'major'].map((mode) => {
  const key = i <= 5 ? i : i - 12;
  const word = mode === 'major' ? '장조' : '단조';
  if (i === 0) {
    return mode === 'major'
      ? { id: 'major', cat: 'mode', mode, key, kind: 'key · A 장조', name: '햇살 가득 장조', colors: ['#ffd23f', '#ff9f1c', '#fff3b0'] }
      : { id: 'minor', cat: 'mode', mode, key, kind: 'key · Am 단조', name: '달빛 아래 단조', colors: ['#3a0ca3', '#4361ee', '#4cc9f0'] };
  }
  const hue = i * 30;
  const colors = mode === 'major'
    ? [hex(hue, 90, 66), hex((hue + 40) % 360, 95, 72), '#fff3b0']
    : [hex(hue, 70, 34), hex((hue + 30) % 360, 65, 48), hex((hue + 200) % 360, 60, 40)];
  const noun = KEY_NOUNS[mode].split(' ')[i % 12];
  return {
    id: `key${tonic.replace('#', 's')}${mode === 'minor' ? 'm' : ''}`, cat: 'mode', mode, key,
    kind: `key · ${tonic}${mode === 'minor' ? 'm' : ''} ${word}`, name: `${tonic} ${word}의 ${noun}`, colors,
  };
}));
const MODE_COMBO = {
  major: {
    nouns: '소풍 여름 축제 놀이공원 해변 무지개 생일 퍼레이드 산책 피크닉 불꽃놀이 첫사랑 운동회 여행 아침',
    // brighter instruments and fuller drums
    templates: [['kick', 'snare', 'hat', 'bass', 'lead'], ['kick', 'hat', 'arp', 'pad'], ['perc', 'bass', 'arp', 'lead'], ['kick', 'snare', 'bass', 'pad'],
      ['hat', 'perc', 'arp', 'lead'], ['kick', 'clap', 'bass', 'arp'], ['snare', 'hat', 'pad', 'lead'], ['kick', 'perc', 'bass', 'fx']],
  },
  minor: {
    nouns: '빗속 새벽 그림자 골목 지하실 눈물 안개 폐허 심야 미로 비밀 고백 이별 밤바다 정전',
    templates: [['kick', 'hat', 'bass', 'pad'], ['pad', 'lead', 'texture'], ['kick', 'snare', 'bass', 'fx'], ['bass', 'arp', 'texture'],
      ['kick', 'perc', 'bass', 'lead'], ['snare', 'hat', 'pad', 'texture'], ['kick', 'hat', 'arp', 'fx'], ['perc', 'pad', 'lead']],
  },
};

function generateModeCombos(existing) {
  const r = rng(2613);
  const used = new Set(existing.map((l) => l.name));
  const sounds = existing.filter((l) => l.code && !l.raw);
  const out = [];
  let n = Math.max(...existing.map((l) => (l.cat === 'combo' && +/\d+$/.exec(l.id)?.[0]) || 0));
  for (const [mode, spec] of Object.entries(MODE_COMBO)) {
    const nouns = spec.nouns.split(' ');
    for (let i = 0; i < 18; i++) {
      // 'clap' in a template means a snare-slot orb
      const parts = spec.templates[i % spec.templates.length].map((c) => r.pick(sounds.filter((l) => l.cat === (c === 'clap' ? 'snare' : c))).id);
      let name;
      do name = `${r.pick(ADJ)} ${r.pick(nouns)}`;
      while (used.has(name));
      used.add(name);
      out.push({
        id: `combo${++n}`, cat: 'combo', name, kind: `combo · ${mode === 'major' ? '장조' : '단조'} ${parts.length}`,
        combo: [mode, ...parts], modeTag: mode,
      });
    }
  }
  return out;
}

// ---------- fourth batch: drum-machine sounds of the CC0 bank no orb played yet ----------
// Rides, crashes, tom fills and the 707 kick/hats/claps. Own seed and appended last, so every
// older id stays the same. Each machine's new orbs also come as one combo.
const KIT_LABEL = { TR909: '909', TR808: '808', TR707: '707', TR606: '606', RD6: 'RD6', Kit: 'kit' };
const TOM_FILLS = [
  '<~ ~ ~ [~ ~ [lt lt] [mt ht]]>', '<~ ~ ~ [lt ~ mt ~ ht ~ ht ht]>', '<~ ~ ~ [~ ht mt lt]>', '<~ [~ ~ ~ lt] ~ [ht mt lt lt]>',
  '<~ ~ ~ [[ht ht] [mt mt] [lt lt] lt]>', '[~ ~ lt ~] [~ mt ~ ~] [~ ~ lt ~] [ht ~ ~ ~]', '<~ ~ ~ [ht*2 mt*2 lt*4]>',
];
const RIDES = ['x*4', 'x*8', '[~ x]*4', '[x x ~ x]*2', '[x ~ x x]*2', 'x ~ x [x x]'];
const CRASHES = ['<x ~ ~ ~>', '<x ~>', '<x ~ ~ [~ ~ ~ x]>', '<[x ~ ~ ~] ~ [~ ~ x ~] ~>'];
const MACHINE_ORBS = [
  { cat: 'kick', kit: 'TR707', snd: 'bd', n: 3, base: KICK, tone: '.shape(.2)' },
  { cat: 'kick', kit: 'TR707', snd: 'bd', n: 3, base: KICK, tone: '.lpf(2200).room(.2)' },
  { cat: 'snare', kit: 'TR909', snd: 'sd', n: 5, base: SNARE, tone: '.room(.25)' },
  { cat: 'snare', kit: 'TR707', snd: 'cp', n: 1, base: SNARE, tone: '.room(.35)' },
  { cat: 'snare', kit: 'TR707', snd: 'rim', n: 2, base: SNARE, tone: '.room(.2)', fams: [['~ x ~ x ~ x ~ [x x]', 'x(3,8,2)'], ['~ ~ x ~ ~ x ~ x', '~ x ~ ~ x ~ x ~']] },
  { cat: 'hat', kit: 'TR707', snd: 'hh', n: 1, base: HAT, tone: '.hpf(4500)' },
  { cat: 'hat', kit: 'TR808', snd: 'oh', n: 3, base: HAT, tone: '.hpf(3500)', fams: [['[~ x]*4', '~ x ~ x'], ['[~ x]*4', '[~ x ~ x?]*2']] },
  ...['TR909', 'TR707', 'Kit'].map((kit) => ({ cat: 'hat', kit, snd: 'rd', n: 2, kind: 'ride', base: HAT, tone: '.hpf(2500).room(.2)', fams: [RIDES], gain: 0.22 })),
  ...[['TR909', 'lt mt ht'], ['TR808', 'lt mt ht'], ['TR707', 'lt mt ht'], ['RD6', 'lt ht'], ['Kit', 'lt ht']].map(([kit, has]) => ({ cat: 'perc', kit, toms: has.split(' '), kind: 'tom fill' })),
  ...['TR808', 'TR707', 'TR606', 'RD6', 'Kit'].map((kit) => ({ cat: 'fx', kit, snd: 'cr', n: 2, kind: 'crash' })),
];

function generateMachines(existing) {
  const r = rng(2614);
  const used = new Set(existing.map((l) => l.name));
  const name = (cat) => {
    const nouns = NOUNS[cat].split(' ');
    for (let k = 0; k < 500; k++) {
      const n = `${r.pick(ADJ)} ${r.pick(nouns)}`;
      if (!used.has(n)) {
        used.add(n);
        return n;
      }
    }
    return `${r.pick(ADJ)} ${r.pick(nouns)} ${used.size}`;
  };
  const color = (cat) => {
    const [h0, h1, sat, l] = HUES[cat];
    return hex((h0 + r() * ((h1 - h0 + 360) % 360)) % 360, sat + r.int(-10, 10), l + r.int(-8, 8));
  };
  const next = {};
  const nextId = (cat) => {
    next[cat] ??= Math.max(0, ...existing.map((l) => (l.cat === cat && /\d+$/.exec(l.id)?.[0]) || 0).map(Number));
    return `${cat}${++next[cat]}`;
  };
  const out = [];
  const byKit = {};
  for (const m of MACHINE_ORBS) {
    const label = KIT_LABEL[m.kit];
    const cut = choke();
    let def;
    if (m.toms) {
      // tom fills: the low / mid / high toms of one machine, mostly on the fourth bar
      const fills = TOM_FILLS.map((f) => (m.toms.includes('mt') ? f : f.replaceAll('mt', 'lt')));
      const tone = r.pick(['.room(.3)', '.room(.2).pan(sine.slow(2))', '.room(.4)']);
      def = {
        kind: `${m.kind} · ${label}`, samples: m.toms.map((t) => `${m.kit}_${t}`),
        code: (v) => `s("${v.pick(fills)}").bank("${m.kit}")${tone}${cut}.gain(.4)`,
        voice: drum(`.s("${m.toms[0]}").bank("${m.kit}")${tone}${cut}.gain(.4)`),
      };
    } else if (m.cat === 'fx') {
      def = {
        kind: `${m.kind} · ${label}`, samples: range(`${m.kit}_cr`, m.n),
        code: (v) => `s("cr").bank("${m.kit}").n(${v.int(0, m.n - 1)}).struct("${v.pick(CRASHES)}").room(.4).gain(.28)`,
        voice: drum(`.s("cr").bank("${m.kit}").room(.4).gain(.28)`),
      };
    } else {
      const fam = r.pick(m.fams ?? m.base.families);
      const tone = m.tone ?? r.pick(m.base.tones);
      const gain = m.gain ?? m.base.gain;
      const nPart = (v) => (m.n > 1 ? `.n(${v.int(0, m.n - 1)})` : '');
      def = {
        kind: `${m.kind ?? m.base.kind} · ${label}`, samples: range(`${m.kit}_${m.snd}`, m.n),
        code: (v) => `s("${m.snd}").bank("${m.kit}")${nPart(v)}.struct("${v.pick(fam)}")${tone}${cut}.gain(${gain})`,
        voice: drum(`.s("${m.snd}").bank("${m.kit}")${tone}${cut}.gain(${gain})`),
      };
    }
    const l = { id: nextId(m.cat), cat: m.cat, name: name(m.cat), color: color(m.cat), ...def };
    out.push(l);
    (byKit[m.kit] ??= []).push(l.id);
  }
  // one combo per machine with its new sounds (only drum parts; at most one per category)
  for (const [kit, ids] of Object.entries(byKit)) {
    const seen = new Set();
    const parts = ids.filter((id) => {
      const c = out.find((l) => l.id === id).cat;
      if (seen.has(c)) return false;
      seen.add(c);
      return true;
    });
    if (parts.length < 2) continue;
    out.push({ id: nextId('combo'), cat: 'combo', kind: `combo · ${KIT_LABEL[kit]} ${parts.length}`, name: name('combo'), combo: parts });
  }
  return out;
}

// ---------- fifth batch: block FX (public/samples/fx, built by tools/samples/build_fx.py) ----------
// One-shots placed on the 4-bar grid: hits on a block's first bar, reversed sounds and the
// up-sweep on its last bar. The reversed and swept ones are one bar (or half a bar) long at
// 124 BPM and play with .fit(), so they end exactly on the next downbeat at any tempo.
// `level` is their loudness target for tools/orb-levels.html: accents are matched to the kick, not
// to the quieter FX loops. `spot` marks them as one-off accents: they fall rarely, and the stem grid puts each one in a
// single block (start = the drop's first block, end = the build-up's last block), not everywhere.
// Own seed and appended last, so every older id stays the same.
const BLOCK_FX = [
  { snd: 'impact', n: 3, kind: 'impact', spot: 'start', level: ['kick', -3], gain: 0.3, structs: ['<x ~ ~ ~>', '<x ~ x ~>'], tone: ['', '.room(.2)'] },
  { snd: 'subdrop', n: 2, kind: 'sub drop', spot: 'start', level: ['kick', -3], gain: 0.4, structs: ['<x ~ ~ ~>', '<~ ~ x ~>'], tone: [''] },
  { snd: 'revcr', n: 4, kind: 'reverse crash', spot: 'end', level: ['kick', -8], gain: 0.32, fit: true, structs: ['<~ ~ ~ x>', '<~ x ~ x>'], tone: ['', '.pan(sine.slow(4))'] },
  { snd: 'revsd', n: 3, kind: 'reverse snare', spot: 'end', level: ['kick', -8], gain: 0.34, fit: true, structs: ['<~ ~ ~ [~ x]>', '<~ [~ x] ~ [~ x]>'], tone: ['', '.hpf(300)'] },
  { snd: 'upsweep', n: 2, kind: 'sweep up', spot: 'end', level: ['kick', -10], gain: 0.24, fit: true, structs: ['<~ ~ ~ x>', '<~ x ~ x>'], tone: ['', '.pan(sine.slow(2))'] },
  { snd: 'downsweep', n: 2, kind: 'sweep down', spot: 'start', level: ['kick', -10], gain: 0.24, fit: true, structs: ['<x ~ ~ ~>', '<x ~ x ~>'], tone: ['', '.pan(sine.slow(2))'] },
];

function generateBlockFx(existing) {
  const r = rng(2615);
  const used = new Set(existing.map((l) => l.name));
  const name = (cat) => {
    const nouns = NOUNS[cat].split(' ');
    for (let k = 0; k < 500; k++) {
      const n = `${r.pick(ADJ)} ${r.pick(nouns)}`;
      if (!used.has(n)) {
        used.add(n);
        return n;
      }
    }
    return `${r.pick(ADJ)} ${r.pick(nouns)} ${used.size}`;
  };
  const color = (cat) => {
    const [h0, h1, sat, l] = HUES[cat];
    return hex((h0 + r() * ((h1 - h0 + 360) % 360)) % 360, sat + r.int(-10, 10), l + r.int(-8, 8));
  };
  const next = {};
  const nextId = (cat) => {
    next[cat] ??= Math.max(0, ...existing.map((l) => (l.cat === cat && /\d+$/.exec(l.id)?.[0]) || 0).map(Number));
    return `${cat}${++next[cat]}`;
  };
  const out = [];
  const ids = {};
  for (const f of BLOCK_FX) {
    const s = `fx_${f.snd}`, fit = f.fit ? '.fit()' : '', cut = choke(), tone = r.pick(f.tone);
    const l = {
      id: nextId('fx'), cat: 'fx', name: name('fx'), color: color('fx'), kind: f.kind, spot: f.spot, level: f.level, samples: range(s, f.n),
      code: (v) => `s("${s}").n(${v.int(0, f.n - 1)}).struct("${v.pick(f.structs)}")${fit}${tone}${cut}.gain(${f.gain})`,
      voice: drum(`.s("${s}")${tone}${cut}.gain(${f.gain})`),
    };
    out.push(l);
    ids[f.snd] = l.id;
  }
  // a drop: the crash swells into the downbeat, the hit lands, the sweep falls away
  out.push({ id: nextId('combo'), cat: 'combo', kind: 'combo · drop 3', name: name('combo'), spot: true, combo: [ids.revcr, ids.impact, ids.downsweep] });
  return out;
}

// ---------- sixth batch: dub techno (docs/GENRES.md, dubtechno) ----------
// The song generator's dub techno, cut into orbs: a soft kick, a rim with an echo, swung 16th
// hats, an offbeat sub, the stab-into-echoes chord on the frame's progression, and hiss.
// Own seed and appended last, so every older id stays the same.
const DUB_SWING = '.swingBy(.18, 8)';
const DUB_ORBS = [
  { cat: 'kick', kind: 'kick · dub', samples: ['TR909_bd:3', 'TR808_bd:1'],
    code: (v) => `s("${v.pick(['TR909_bd:3', 'TR808_bd:1'])}*4").lpf(${v.pick([1600, 2200])}).gain(.6)`,
    voice: drum(`.s("TR909_bd:3").lpf(2000).gain(.6)`) },
  { cat: 'snare', kind: 'rim · dub', samples: ['TR909_rim:0', 'TR808_rim:0'],
    code: (v) => `s("${v.pick(['TR909_rim:0', 'TR808_rim:0'])}").struct("${v.pick(['~ x ~ x', '~ x ~ [x ~ ~ x?]', '~ x ~ <x [~ x]>'])}").room(.4).delay(.35).delaytime(__DT__).delayfeedback(.45)${DUB_SWING}.gain(.63)`,
    voice: drum(`.s("TR909_rim:0").room(.4).delay(.3).delaytime(__DT__).gain(.63)`) },
  { cat: 'hat', kind: 'hihat · swung', samples: ['TR808_hh:1', 'TR909_hh:0'],
    code: (v) => `s("${v.pick(['TR808_hh:1', 'TR909_hh:0'])}*16").gain("${v.pick(['[.32 .48 .7 .48]*4', '[.4 .6 .6 .6]*4'])}").hpf(5000).pan(sine.range(.4,.6).slow(2))${DUB_SWING}`,
    voice: drum(`.s("TR808_hh:1").hpf(5000).gain(.6)`) },
  { cat: 'bass', kind: 'bass · dub sub',
    code: (v) => `n(${bassLine(v, ['0010001000100010', '0010000000100010', '1000001000100000', '0010001000000010'], [0, 0, 7])}).scale("A1:minor")
  .s("sine").decay(.22).sustain(.3).release(.1).lpf(220).shape(.2).gain(.55)`,
    voice: melodic('A1', `.s("sine").decay(.3).sustain(.5).release(.1).lpf(240).shape(.2).gain(.5)`, 'triad') },
  { cat: 'pad', kind: 'dub chord',
    code: (v) => `chord("${PROG}").voicing().struct("${v.pick(['~ x ~ ~ ~ x ~ ~', '~ ~ x ~ ~ ~ ~ ~', '~ x ~ ~ ~ ~ x ~', '~ ~ ~ x ~ ~ ~ ~'])}")
  .s("sawtooth").decay(.15).sustain(0).lpf(sine.range(700,1800).slow(16)).room(.6).delay(.5).delaytime(__DT__).delayfeedback(.65).gain(.38)`,
    voice: melodic('A3', `.s("sawtooth").decay(.15).sustain(0).lpf(1400).room(.6).delay(.5).delaytime(__DT__).delayfeedback(.6).gain(.38)`) },
  { cat: 'pad', kind: 'dub chord · wide',
    code: (v) => `chord("${PROG}").voicing().struct("${v.pick(['~ x ~ ~ ~ x ~ ~', '~ x ~ ~ ~ ~ x ~', '~ ~ x ~ ~ x ~ ~'])}")
  .s("sawtooth").decay(.22).sustain(0).lpf(sine.range(500,1600).slow(8)).lpq(4).room(.7).roomsize(4).delay(.55).delaytime(__DT__).delayfeedback(.7).pan(sine.slow(8)).gain(.37)`,
    voice: melodic('A3', `.s("sawtooth").decay(.2).sustain(0).lpf(1300).lpq(4).room(.7).delay(.5).delaytime(__DT__).gain(.37)`) },
  { cat: 'texture', kind: 'tape hiss',
    code: (v) => `s("crackle").density(${v.pick(['.02', '.04'])}).sustain(1).hpf(1500).gain(.78)`,
    voice: drum(`.s("white").decay(.03).sustain(0).hpf(3000).gain(.08)`, 'hpf', (d) => Math.round(500 * 2 ** (d / 4))) },
];

function generateDubTechno(existing) {
  const r = rng(2616);
  const used = new Set(existing.map((l) => l.name));
  const name = (cat) => {
    const nouns = NOUNS[cat].split(' ');
    for (let k = 0; k < 500; k++) {
      const n = `${r.pick(ADJ)} ${r.pick(nouns)}`;
      if (!used.has(n)) {
        used.add(n);
        return n;
      }
    }
    return `${r.pick(ADJ)} ${r.pick(nouns)} ${used.size}`;
  };
  const color = (cat) => {
    const [h0, h1, sat, l] = HUES[cat];
    return hex((h0 + r() * ((h1 - h0 + 360) % 360)) % 360, sat + r.int(-10, 10), l + r.int(-8, 8));
  };
  const next = {};
  const nextId = (cat) => {
    next[cat] ??= Math.max(0, ...existing.map((l) => (l.cat === cat && /\d+$/.exec(l.id)?.[0]) || 0).map(Number));
    return `${cat}${++next[cat]}`;
  };
  const out = [];
  for (const def of DUB_ORBS) {
    const cut = def.samples ? choke() : '';
    const code = cut ? (v) => def.code(v) + cut : def.code;
    const voice = cut ? { ...def.voice, sound: def.voice.sound + cut } : def.voice;
    out.push({ id: nextId(def.cat), cat: def.cat, name: name(def.cat), color: color(def.cat), tag: 'dubtechno', ...def, code, voice });
  }
  // the whole groove at once (one orb per part)
  const pick = (cat) => out.find((l) => l.cat === cat).id;
  out.push({ id: nextId('combo'), cat: 'combo', kind: 'combo · dub techno 6', name: name('combo'), tag: 'dubtechno',
    combo: ['kick', 'snare', 'hat', 'bass', 'pad', 'texture'].map(pick) });
  return out;
}

// ---------- seventh batch: sampled basses and a Wurlitzer (tools/samples/build_pitched.py) ----------
// Until now every bass orb was a synth and the only played keyboard was the piano. These use
// recorded instruments: two bass guitars and an upright (Karoryfer / D. Smolken, CC0) and Greg
// Sullivan's Wurlitzer EP200 (CC BY 3.0). Own seed and appended last, so older ids stay put.
const INST_ORBS = [
  { cat: 'bass', kind: 'bass · finger', s: 'swagbass', tone: '.clip(1).lpf(2000)', gain: 0.68,
    rhythms: ['1000101000101000', '1001001000100100', '1010001010100010', '1000100110001001'], offsets: [0, 0, 4, 7] },
  { cat: 'bass', kind: 'bass · finger long', s: 'swagbass', tone: '.clip(1.6).lpf(1400)', gain: 0.78,
    rhythms: ['1000000010000000', '1000001000100000', '1000000000100000'], offsets: [0, 0, 4] },
  { cat: 'bass', kind: 'bass · staccato', s: 'growlybass', tone: '.lpf(2600)', gain: 0.44,
    rhythms: ['1010101010101010', '1011101110111011', '1010001010100010', '1110111011101110'], offsets: [0, 0, 0, 7] },
  { cat: 'bass', kind: 'bass · upright walk', s: 'uprightbass', tone: '.clip(1).room(.2)', gain: 0.47,
    rhythms: ['1000100010001000', '1000100010001010', '1000100010101000'], offsets: [0, 2, 4, 5, 7] },
  { cat: 'bass', kind: 'bass · upright', s: 'uprightbass', tone: '.room(.3)', gain: 0.6,
    rhythms: ['1000001000000000', '1000000010000010', '1000001000100000'], offsets: [0, 0, 4] },
];
const WURLI = (tone, gain) => `.s("wurli").clip(1)${tone}.gain(${gain})`;
const WURLI_ORBS = [
  { cat: 'pad', kind: 'e-piano · stabs',
    code: (v) => `chord("${PROG}").voicing().struct("${v.pick(['~ x ~ x ~ x ~ x', '~ x ~ ~ ~ x ~ ~', '[~ x]*4', '~ x ~ [x ~ ~ x]'])}")${WURLI('.room(.3)', 0.082)}`,
    voice: melodic('A3', WURLI('.room(.3)', 0.082)) },
  { cat: 'pad', kind: 'e-piano · tremolo',
    code: (v) => `chord("${PROG}").voicing().struct("${v.pick(['x ~ ~ ~', 'x ~ ~ x ~ ~ x ~', 'x ~ x ~'])}")${WURLI('.pan(sine.fast(4)).room(.4)', 0.17)}`,
    voice: melodic('A3', WURLI('.pan(sine.fast(4)).room(.4)', 0.17)) },
  { cat: 'pad', kind: 'e-piano · lofi',
    code: (v) => `chord("${PROG}").voicing().struct("${v.pick(['~ x ~ [x ~ ~ x]', 'x ~ ~ x ~ ~ x ~', '~ [x x] ~ x'])}")${WURLI('.lpf(2200).room(.45).delay(.25).delaytime(__DT__).swingBy(1/6, 4)', 0.075)}`,
    voice: melodic('A3', WURLI('.lpf(2200).room(.45)', 0.075)) },
  { cat: 'arp', kind: 'arp · e-piano',
    code: (v) => `n(${arpLine(v, 0, 14)}).scale("A3:minor")${WURLI('.delay(.3).delaytime(__DT__).pan(sine.slow(4))', 0.054)}`,
    voice: melodic('A3', WURLI('.delay(.3).delaytime(__DT__)', 0.054)) },
  { cat: 'lead', kind: 'lead · e-piano',
    code: (v) => `n(${melody(v, { slots: 8, density: 0.5, lo: 0, hi: 9, hold: 0.3 })}).scale("A4:minor")${WURLI('.room(.4)', 0.072)}`,
    voice: melodic('A4', WURLI('.room(.4)', 0.072)) },
];

function generateInstruments(existing) {
  const r = rng(2617);
  const used = new Set(existing.map((l) => l.name));
  const name = (cat) => {
    const nouns = NOUNS[cat].split(' ');
    for (let k = 0; k < 500; k++) {
      const n = `${r.pick(ADJ)} ${r.pick(nouns)}`;
      if (!used.has(n)) {
        used.add(n);
        return n;
      }
    }
    return `${r.pick(ADJ)} ${r.pick(nouns)} ${used.size}`;
  };
  const color = (cat) => {
    const [h0, h1, sat, l] = HUES[cat];
    return hex((h0 + r() * ((h1 - h0 + 360) % 360)) % 360, sat + r.int(-10, 10), l + r.int(-8, 8));
  };
  const next = {};
  const nextId = (cat) => {
    next[cat] ??= Math.max(0, ...existing.map((l) => (l.cat === cat && /\d+$/.exec(l.id)?.[0]) || 0).map(Number));
    return `${cat}${++next[cat]}`;
  };
  const out = [];
  const add = (def) => {
    const l = { id: nextId(def.cat), cat: def.cat, name: name(def.cat), ...(def.cat !== 'combo' && { color: color(def.cat) }), tag: 'instruments', ...def };
    out.push(l);
    return l.id;
  };
  const ids = {};
  for (const b of INST_ORBS) {
    const snd = `.s("${b.s}")${b.tone}.gain(${b.gain})`;
    ids[b.kind] = add({ cat: b.cat, kind: b.kind, samples: [b.s],
      code: (v) => `n(${bassLine(v, b.rhythms, b.offsets)}).scale("A1:minor")${snd}`,
      voice: melodic('A1', `.s("${b.s}")${b.tone}.gain(${b.gain})`, 'triad') });
  }
  for (const w of WURLI_ORBS) ids[w.kind] = add({ samples: ['wurli'], ...w });
  // a house groove on the new bass and keys, and a late-night jazz corner
  add({ cat: 'combo', kind: 'combo · 4', combo: ['kick', 'hats', ids['bass · finger'], ids['e-piano · stabs']] });
  add({ cat: 'combo', kind: 'combo · 4', combo: ['lofiSnare', 'crackle', ids['bass · upright walk'], ids['e-piano · lofi']] });
  return out;
}

// ---------- eighth batch: other scales that fit the frame ----------
// Every scale orb so far plays A natural minor (or A major under a key orb). These play five- and
// six-note scales whose notes all sit inside that scale, so they colour the line without clashing
// with the progression: pentatonic, blues (its blue note only on weak steps), Japanese (hirajoshi)
// and suspended (egyptian). Under a major key orb each switches to its major partner. Degrees are
// counted in the five/six-note scale, so the lines are built here bar by bar: strong steps land on
// the bar's chord tones that the scale has, weak steps move along the scale.
// Own seed and appended last, so every older id stays the same.
const ALT_SCALES = {
  pentatonic: { minor: ['minor:pentatonic', [0, 3, 5, 7, 10]], major: ['major:pentatonic', [0, 2, 4, 7, 9]] },
  blues: { minor: ['minor:blues', [0, 3, 5, 6, 7, 10]], major: ['major:blues', [0, 2, 3, 4, 7, 9]] },
  japanese: { minor: ['hirajoshi', [0, 2, 3, 7, 8]], major: ['ionian:pentatonic', [0, 4, 5, 7, 11]] },
  suspended: { minor: ['egyptian', [0, 2, 5, 7, 10]], major: ['ritusen', [0, 2, 5, 7, 9]] },
  // ninth batch: two more minor-sixth pentatonics; under a major key both fall back to major pentatonic
  malkos: { minor: ['malkos:raga', [0, 3, 5, 8, 10]], major: ['major:pentatonic', [0, 2, 4, 7, 9]] },
  vietnamese: { minor: ['vietnamese:1', [0, 3, 5, 7, 8]], major: ['major:pentatonic', [0, 2, 4, 7, 9]] },
};
const MODE_STEPS = { minor: [0, 2, 3, 5, 7, 8, 10], major: [0, 2, 4, 5, 7, 9, 11] };
const pcMod = (x) => ((x % 12) + 12) % 12;
// the scale as it stands under the current mode, and how its degrees meet a bar's chord
function altFrame(fam) {
  const [name, steps] = ALT_SCALES[fam][MODE] ?? ALT_SCALES[fam].minor;
  const k = steps.length;
  const semi = (d) => 12 * Math.floor(d / k) + steps[((d % k) + k) % k];
  const chordPcs = (c) => c.tones.map((t) => MODE_STEPS[MODE][mod7(t)]);
  const inChord = (d, c) => chordPcs(c).includes(pcMod(semi(d)));
  // the degree nearest to `d` that is a chord tone (ties go down)
  const snapTo = (d, c) => {
    for (let s = 0; s <= k; s++) for (const x of [d - s, d + s]) if (inChord(x, c)) return x;
    return d;
  };
  // the bar's anchor at or above `lo`: its root if the scale has it, else the nearest chord tone
  const anchor = (c, lo) => {
    const root = MODE_STEPS[MODE][mod7(c.root)];
    for (let d = lo; d < lo + k; d++) if (pcMod(semi(d)) === root) return d;
    return snapTo(lo, c);
  };
  return { name, k, inChord, snapTo, anchor };
}
const altBass = (r, fam, rhythms) => {
  const motif = [...r.pick(rhythms)].map((x) => x === '1');
  const offs = motif.map((on, i) => (i === 0 ? 0 : r.pick([0, 0, 1, -1, 2, 'oct'])));
  return bars((c) => {
    const f = altFrame(fam), a = f.anchor(c, -2);
    return motif.map((on, i) => {
      if (!on) return '~';
      const d = offs[i] === 'oct' ? a + f.k : a + offs[i];
      return i % 4 === 0 ? f.snapTo(d, c) : d;
    });
  });
};
const altArp = (r, fam) => {
  const shape = r.pick(ARP_SHAPES), len = r.pick([8, 8, 16]);
  return bars((c) => {
    const f = altFrame(fam);
    const ds = Array.from({ length: 2 * f.k + 1 }, (_, i) => i).filter((d) => f.inChord(d, c));
    return Array.from({ length: len }, (_, i) => ds[Math.min(ds.length - 1, shape[i % shape.length])]);
  });
};
const altMelody = (r, fam, { slots, density, hold }) => {
  const rhythm = Array.from({ length: slots }, (_, i) => i === 0 || r.chance(density));
  const steps = rhythm.map(() => r.pick([-2, -1, -1, 0, 1, 1, 2]));
  let d = 3;
  return bars((c) => {
    const f = altFrame(fam), lo = 0, hi = 2 * f.k;
    return rhythm.map((on, i) => {
      if (!on) return i > 0 && r.chance(hold) ? '_' : '~';
      d = Math.max(lo, Math.min(hi, d + steps[i]));
      if ((i * 8) % slots === 0 && ((i * 8) / slots) % 2 === 0) d = f.snapTo(d, c); // on the beat: a chord tone
      return d;
    });
  });
};
// scale names carry the mode, so they are rebuilt per call (codeOf sets the mode first)
const altScale = (fam, root) => `.scale("${root}:${(ALT_SCALES[fam][MODE] ?? ALT_SCALES[fam].minor)[0]}")`;
const ALT_ORBS = [
  // bass (13)
  ...[['pentatonic', 'sawtooth', '.lpf(900).decay(.2).sustain(.3)', 0.32], ['pentatonic', 'swagbass', '.clip(1).lpf(2000)', 0.4, ['swagbass']],
    ['pentatonic', 'sine', '.decay(.4).sustain(.6).lpf(300)', 0.5], ['pentatonic', 'square', '.lpf(700).decay(.15).sustain(.2)', 0.24],
    ['blues', 'uprightbass', '.clip(1).room(.2)', 0.3, ['uprightbass']], ['blues', 'sawtooth', '.lpf(1200).lpq(6).decay(.18).sustain(.2)', 0.28],
    ['blues', 'growlybass', '.lpf(2600)', 0.24, ['growlybass']],
    ['japanese', 'triangle', '.decay(.3).sustain(.5).lpf(800)', 0.45], ['japanese', 'uprightbass', '.room(.3)', 0.3, ['uprightbass']],
    ['japanese', 'sawtooth', '.lpf(600).decay(.25).sustain(.3).room(.2)', 0.3],
    ['suspended', 'sine', '.fm(1).fmh(2).decay(.3).sustain(.4).lpf(500)', 0.4], ['suspended', 'swagbass', '.clip(1.4).lpf(1400)', 0.4, ['swagbass']],
    ['suspended', 'square', '.lpf(900).decay(.12).sustain(.2)', 0.22]]
    .map(([fam, s, tone, g, samples]) => ({ cat: 'bass', fam, s, tone, g, samples })),
  // arp (10)
  ...[['pentatonic', 'balafon', '', 0.36, ['balafon']], ['pentatonic', 'square', '.decay(.12).sustain(0).lpf(sine.range(900,3500).slow(8))', 0.1],
    ['pentatonic', 'wurli', '.clip(1).delay(.3).delaytime(__DT__)', 0.06, ['wurli']],
    ['japanese', 'dantranh', '.room(.4)', 0.36, ['dantranh']], ['japanese', 'harp', '.room(.5)', 0.38, ['harp']],
    ['japanese', 'triangle', '.decay(.2).sustain(0).delay(.4).delaytime(__DT__).delayfeedback(.5)', 0.2],
    ['suspended', 'vibraphone', '.room(.4)', 0.36, ['vibraphone']], ['suspended', 'handchimes', '.room(.5)', 0.3, ['handchimes']],
    ['blues', 'sawtooth', '.decay(.1).sustain(0).lpf(2200)', 0.12], ['blues', 'vibraphone', '.room(.3).delay(.25).delaytime(__DT__)', 0.34, ['vibraphone']]]
    .map(([fam, s, tone, g, samples]) => ({ cat: 'arp', fam, s, tone, g, samples })),
  // lead (10)
  ...[['blues', 'sax', '.room(.3)', 0.36, ['sax']], ['blues', 'sawtooth', '.lpf(2200).decay(.2).sustain(.4).release(.3)', 0.12],
    ['blues', 'wurli', '.clip(1).room(.4)', 0.07, ['wurli']],
    ['pentatonic', 'z_square', '.decay(.12).sustain(.4).release(.05)', 0.12], ['pentatonic', 'triangle', '.attack(.04).release(.4).vib(5).vibmod(.25)', 0.18],
    ['pentatonic', 'saxello_vib', '.room(.3)', 0.36, ['saxello_vib']],
    ['japanese', 'recorder_alto_vib', '.room(.5)', 0.36, ['recorder_alto_vib']], ['japanese', 'sine', '.attack(.06).release(.6).vib(5).vibmod(.2).room(.5)', 0.2],
    ['suspended', 'recorder_tenor_vib', '.room(.4)', 0.36, ['recorder_tenor_vib']], ['suspended', 'supersaw', '.lpf(3000).decay(.25).sustain(.5).release(.3)', 0.09]]
    .map(([fam, s, tone, g, samples]) => ({ cat: 'lead', fam, s, tone, g, samples })),
];

// ninth batch: the same scale families twice as big. New scales (malkos, vietnamese) and, in the
// four older families, instruments they did not use yet. Entries may name their own root and bass rhythms.
const ALT_ORBS_2 = [
  // bass (11)
  ...[['malkos', 'sawtooth', '.lpf(700).lpq(4).decay(.25).sustain(.3)', 0.3], ['malkos', 'uprightbass', '.room(.2)', 0.3, ['uprightbass']],
    ['malkos', 'sine', '.decay(.4).sustain(.6).lpf(250).shape(.2)', 0.45],
    ['vietnamese', 'triangle', '.decay(.3).sustain(.5).lpf(700)', 0.45], ['vietnamese', 'swagbass', '.clip(1).lpf(1800).room(.15)', 0.4, ['swagbass']],
    ['vietnamese', 'square', '.lpf(600).decay(.2).sustain(.3)', 0.22],
    ['pentatonic', 'uprightbass', '.room(.15)', 0.3, ['uprightbass'], { walk: true }], ['blues', 'swagbass', '.clip(1).lpf(1600)', 0.4, ['swagbass']],
    ['blues', 'z_triangle', '.decay(.2).sustain(.3)', 0.3], ['japanese', 'sine', '.fm(2).fmh(1).decay(.25).sustain(.3).lpf(600)', 0.4],
    ['suspended', 'growlybass', '.lpf(2000)', 0.24, ['growlybass']]]
    .map(([fam, s, tone, g, samples, more]) => ({ cat: 'bass', fam, s, tone, g, samples, ...more })),
  // arp (12)
  ...[['malkos', 'harp', '.room(.5)', 0.38, ['harp']], ['malkos', 'triangle', '.decay(.2).sustain(0).delay(.35).delaytime(__DT__)', 0.2],
    ['malkos', 'tubularbells2', '.room(.4)', 0.3, ['tubularbells2']],
    ['vietnamese', 'dantranh', '.room(.4)', 0.36, ['dantranh']], ['vietnamese', 'balafon_soft', '', 0.4, ['balafon_soft']],
    ['pentatonic', 'marimba', '', 0.4, ['marimba']], ['pentatonic', 'glockenspiel', '', 0.3, ['glockenspiel'], { root: 'A4' }],
    ['blues', 'clavisynth', '.room(.3)', 0.3, ['clavisynth']], ['blues', 'fmpiano', '.room(.3)', 0.3, ['fmpiano']],
    ['japanese', 'sine', '.fm(5).fmh(3.01).decay(.25).sustain(0).room(.4)', 0.16], ['japanese', 'strumstick', '', 0.36, ['strumstick']],
    ['suspended', 'tubularbells', '.room(.4)', 0.3, ['tubularbells']]]
    .map(([fam, s, tone, g, samples, more]) => ({ cat: 'arp', fam, s, tone, g, samples, ...more })),
  // lead (10)
  ...[['malkos', 'sawtooth', '.lpf(1400).attack(.03).decay(.3).sustain(.4).release(.4).room(.4)', 0.12], ['malkos', 'saxello_vib', '.room(.4)', 0.36, ['saxello_vib']],
    ['vietnamese', 'recorder_alto_vib', '.room(.5)', 0.36, ['recorder_alto_vib']], ['vietnamese', 'sine', '.attack(.05).release(.5).vib(6).vibmod(.3).room(.4)', 0.2],
    ['vietnamese', 'wurli', '.clip(1).room(.4)', 0.07, ['wurli']],
    ['pentatonic', 'recorder_soprano_stacc', '.room(.4)', 0.34, ['recorder_soprano_stacc']], ['blues', 'sax_stacc', '.room(.3)', 0.36, ['sax_stacc']],
    ['japanese', 'dantranh_tremolo', '.room(.3)', 0.34, ['dantranh_tremolo']], ['suspended', 'z_triangle', '.decay(.15).sustain(.5).tremolo(.3)', 0.2],
    ['suspended', 'xylophone_soft_ff', '.room(.3)', 0.34, ['xylophone_soft_ff']]]
    .map(([fam, s, tone, g, samples, more]) => ({ cat: 'lead', fam, s, tone, g, samples, ...more })),
];

function generateScales(existing, orbs = ALT_ORBS, seed = 2618) {
  const r = rng(seed);
  const used = new Set(existing.map((l) => l.name));
  const name = (cat) => {
    const nouns = NOUNS[cat].split(' ');
    for (let k = 0; k < 500; k++) {
      const n = `${r.pick(ADJ)} ${r.pick(nouns)}`;
      if (!used.has(n)) {
        used.add(n);
        return n;
      }
    }
    return `${r.pick(ADJ)} ${r.pick(nouns)} ${used.size}`;
  };
  const color = (cat) => {
    const [h0, h1, sat, l] = HUES[cat];
    return hex((h0 + r() * ((h1 - h0 + 360) % 360)) % 360, sat + r.int(-10, 10), l + r.int(-8, 8));
  };
  const next = {};
  const nextId = (cat) => {
    next[cat] ??= Math.max(0, ...existing.map((l) => (l.cat === cat && /\d+$/.exec(l.id)?.[0]) || 0).map(Number));
    return `${cat}${++next[cat]}`;
  };
  const BASS_RHYTHMS = ['1000101000101000', '1000001000100000', '1010001010100010', '1001001000100100', '1000100010001000'];
  // quarter notes with a pickup now and then: a walking line
  const WALK_RHYTHMS = ['1000100010001000', '1000100010001010', '1000100010101000'];
  return orbs.map((o) => {
    const snd = `.s("${o.s}")${o.tone}.gain(${o.g})`;
    const root = o.root ?? (o.cat === 'bass' ? 'A1' : o.cat === 'arp' ? 'A3' : 'A4');
    const shape = r.pick(LEAD_SHAPES);
    const line = {
      bass: (v) => altBass(v, o.fam, o.walk ? WALK_RHYTHMS : BASS_RHYTHMS),
      arp: (v) => altArp(v, o.fam),
      lead: (v) => altMelody(v, o.fam, shape),
    }[o.cat];
    return {
      id: nextId(o.cat), cat: o.cat, name: name(o.cat), color: color(o.cat), tag: 'scales', scaleFamily: o.fam,
      // inst: what it is played on; orbTaste reads its vibe from this, not from the scale
      kind: `${o.cat} · ${o.fam}`, inst: o.s, ...(o.samples && { samples: o.samples }),
      code: (v) => `n(${line(v)})${altScale(o.fam, root)}${snd}`,
      voice: melodic(root, snd, o.cat === 'bass' ? 'triad' : 'tones'),
    };
  });
}

// ---------- tenth batch: line variations ----------
// More basses, chords, arpeggios and melodies, written the way the song generator (src/composer.js)
// writes its parts, plus the classic ways of varying a motif (sequence, call and response, inversion,
// retrograde, displacement, octave answer, ornaments, hooks, runs). Every line still follows the frame:
// built bar by bar over BAR_CHORDS, strong steps on chord tones, so it fits every other orb and the key
// orbs. Instruments: the song generator's synth recipes and the VCSL instruments no orb used yet
// (organs, harmonicas, bowed vibraphone, more recorders …). VCSL instruments in folders whose names have a
// comma (kalimbas, ocarinas, psaltery, the two concert pianos) stay out: Chromium refuses them (see BANKS).
// Own seed, appended last.

// bars with the next bar's chord and the bar number too (walking lines lead into the next chord)
const bars2 = (fn) => `"<${BAR_CHORDS.map((c, i) => `[${fn(c, BAR_CHORDS[(i + 1) % BAR_CHORDS.length], i).join(' ')}]`).join(' ')}>"`;
// the first `size` degrees at or above `from` whose pitch class is in `pcs`
const chordWindow = (pcs, from, size) => {
  const out = [];
  for (let d = from; out.length < size && d < from + 21; d++) if (pcs.includes(mod7(d))) out.push(d);
  return out;
};
// a mini-notation bar must not start by holding (`_`) the bar before
const cleanBar = (bar) => (bar[0] === '_' ? ['~', ...bar.slice(1)] : bar);
const euclidHits = (k, n, rot = 0) => Array.from({ length: n }, (_, i) => i === 0 || (((i + rot) * k) % n) < k);

// --- bass ---
// the song generator's bass rhythms: r root, o octave, f fifth, t third (of the bar's chord), @n held
const VAR_TOKEN = { r: 0, o: 7, f: 4, t: 2 };
const BASS_GROOVES = {
  house: ['r ~ ~ r ~ r o ~', 'r ~ ~ ~ f ~ r ~', 'r ~ r ~ ~ f ~ o'],
  lofi: ['r@3 ~ f@2 ~ ~', 'r@4 ~ ~ f ~', 'r@2 ~ r ~ ~ o ~', 'r@3 ~ t@2 f ~'],
  dnb: ['r@6 ~ f', 'r@3 ~ r@4', 'r@4 o@2 r@2'],
  offbeat: ['~ r ~ r ~ r ~ r', '~ r r r ~ r r r ~ r r r ~ r r r'],
  rolling: ['~ ~ r ~ ~ ~ r ~ ~ ~ r ~ ~ ~ r ~', '~ r r ~ ~ r r ~ ~ r r ~ ~ r r ~', '~ ~ r r ~ ~ r r ~ ~ r r ~ ~ r r'],
  drive: ['r r r r r r r r', 'r o r o r o r o', 'r r r r r r r r r r r r r r r r'],
  disco: ['r o r o r o r o r o r o r o r o', 'r ~ o ~ r ~ o ~ r ~ o ~ r o r o', 'r o ~ o r o ~ o r o ~ o r o f o'],
  funk: ['r ~ ~ r ~ ~ o ~ ~ r ~ ~ f ~ t ~', 'r ~ r ~ ~ ~ o ~ r ~ ~ r ~ f ~ ~'],
  breaks: ['r ~ ~ r ~ ~ ~ ~ ~ ~ r ~ ~ r ~ ~', 'r ~ ~ ~ ~ ~ r ~ ~ ~ ~ ~ o ~ ~ ~'],
  dub: ['r@2 ~ t f@2 ~ r', '~ ~ r ~ r ~ f ~', 'r@3 ~ ~ f r ~'],
  tresillo: ['r ~ ~ r ~ ~ f ~', 'r ~ ~ o ~ ~ r ~', 'r ~ ~ r ~ ~ r ~ ~ ~ f ~ ~ ~ o ~'],
};
const VAR_BASS_LINES = {
  // one groove for three bars, the fourth now and then another groove of the same style
  ...Object.fromEntries(Object.entries(BASS_GROOVES).map(([style, grooves]) => [style, (v) => {
    const a = v.pick(grooves), b = v.chance(0.4) ? v.pick(grooves) : a;
    const step = (c) => (tok) => {
      const [t, w] = tok.split('@');
      return (t === '~' ? '~' : c.root + VAR_TOKEN[t]) + (w ? `@${w}` : '');
    };
    return { notes: bars2((c, n, i) => (i === 3 ? b : a).split(' ').map(step(c))) };
  }])),
  // a TB-303 line (composer.js acidBar) as one motif over the chords: rests, octave jumps, slides
  // (a note held into the next step) and accents, which come back as a velocity pattern
  acid: (v) => {
    const steps = [];
    for (let i = 0; i < 16; ) {
      const rest = i > 0 && v.chance(0.25), w = !rest && i < 15 && v.chance(0.18) ? 2 : 1;
      steps.push({ rest, w, o: v.pick([0, 0, 0, 7, 0, 2, 7, 4]), acc: v.chance(0.3) });
      i += w;
    }
    const at = (s, x) => `${x}${s.w > 1 ? '@2' : ''}`;
    return {
      notes: bars((c) => steps.map((s) => at(s, s.rest ? '~' : c.root + s.o))),
      extra: `.velocity("${steps.map((s) => at(s, s.acc ? 1 : 0.7)).join(' ')}")`,
    };
  },
  // broken chord: root, third, fifth, octave in a repeating figure
  broken: (v) => {
    const shape = v.pick([[0, 4, 7, 4], [0, 2, 4, 2], [0, 7, 4, 7], [0, 4, 2, 4], [0, 0, 7, 0], [0, 2, 4, 7]]), len = v.pick([8, 8, 16]);
    return { notes: bars((c) => Array.from({ length: len }, (_, i) => c.root + shape[i % shape.length])) };
  },
  // walking: chord tones on beats 1–3, a step above or below the next chord's root on beat 4
  walk: (v) => {
    const mid = v.pick([[2, 4], [4, 2], [4, 7], [2, 7], [7, 4]]), pickup = v.chance(0.4);
    return {
      notes: bars2((c, n) => {
        const third = c.root + mid[1], appr = n.root + (third > n.root ? 1 : -1);
        return [c.root, c.root + mid[0], third, pickup ? `[${third} ${appr}]` : appr];
      }),
    };
  },
  // a Euclidean rhythm on the root, with fifths and octaves on some hits
  euclid: (v) => {
    const [k, n] = v.pick([[5, 16], [7, 16], [3, 8], [5, 8], [9, 16]]), hits = euclidHits(k, n, v.int(0, 3));
    const offs = hits.map((h, i) => (i === 0 ? 0 : v.pick([0, 0, 0, 7, 4, 2])));
    return { notes: bars((c) => hits.map((h, i) => (h ? c.root + offs[i] : '~'))) };
  },
  // a riff for three bars and a busier fill in the fourth
  answer: (v) => {
    const fam = v.pick(BASS_FAMILIES);
    const motif = [...v.pick(fam.rhythms)].map((x, i) => (x === '1' ? (i === 0 ? 0 : v.pick(fam.offsets)) : null));
    const fill = [...v.pick(['1010101010111111', '1000100010101010', '1001001001001011', '1010101011101110'])]
      .map((x, i) => (x === '1' ? (i === 0 ? 0 : v.pick([0, 2, 4, 7, 7])) : null));
    return { notes: bars2((c, n, i) => (i === 3 ? fill : motif).map((o) => (o === null ? '~' : c.root + o))) };
  },
};
const VAR_BASS_SOUNDS = {
  deep: ['triangle', '.lpf(380).decay(.6).sustain(.8).release(.15)', 0.42],
  rumble: ['sawtooth', '.lpf(320).lpq(6).decay(.22).sustain(.25).shape(.2).room(.3)', 0.3],
  pluck: ['square', '.lpf(1100).decay(.14).sustain(0)', 0.3],
  reese: ['supersaw', '.lpf(sine.range(200,1800).slow(2)).lpq(5).release(.2)', 0.2],
  pulse: ['sawtooth', '.lpf(1200).decay(.1).sustain(0)', 0.28],
  dubsub: ['sine', '.decay(.22).sustain(.3).release(.1).lpf(220).shape(.2)', 0.45],
  sub: ['triangle', '.lpf(700).decay(.35).sustain(.5)', 0.38],
  acid: ['sawtooth', '.lpf(sine.range(300,2400).slow(16)).lpq(16).lpenv(3).lpd(.12).decay(.16).sustain(.15).shape(.35)', 0.25],
  'acid square': ['square', '.lpf(sine.range(250,1800).slow(8)).lpq(14).lpenv(4).lpd(.1).decay(.14).sustain(.1).shape(.3)', 0.22],
  fm: ['sine', '.fm(3).fmh(.5).decay(.2).sustain(.3).lpf(900)', 0.38],
  saw: ['sawtooth', '.lpf(500).lpenv(1.5).lpd(.2).decay(.25).sustain(.4)', 0.28],
  wobble: ['sawtooth', '.lpf(sine.range(300,2200).fast(4)).lpq(8).decay(.3).sustain(.5)', 0.24],
  '8-bit': ['square', '.lpf(1600).crush(6).decay(.15).sustain(.2)', 0.2],
  grit: ['triangle', '.shape(.6).lpf(1100).decay(.2).sustain(.4)', 0.3],
  'chip square': ['z_square', '.decay(.1).sustain(.2).lpf(1400)', 0.18, 'A2'],
  'chip triangle': ['z_triangle', '.decay(.15).sustain(.4)', 0.38, 'A2'],
  'chip saw': ['z_sawtooth', '.lpf(sine.range(400,2000).slow(8)).lpq(10).decay(.12).sustain(.1)', 0.16, 'A2'],
  'pipe organ': ['pipeorgan_quiet_pedal', '.clip(1).room(.3)', 0.4],
  piano: ['piano', '.clip(1).lpf(2400)', 0.35],
  'piano 2': ['piano1', '.clip(1).lpf(2000)', 0.35],
  finger: ['swagbass', '.clip(1).lpf(1800)', 0.4],
  growl: ['growlybass', '.lpf(2400)', 0.3],
  upright: ['uprightbass', '.clip(1).room(.2)', 0.47],
};
// [line, sound]: 36
const VAR_BASS = [
  ['house', 'deep'], ['house', 'finger'], ['house', 'fm'], ['lofi', 'sub'], ['lofi', 'upright'], ['lofi', 'piano'],
  ['dnb', 'reese'], ['dnb', 'saw'], ['offbeat', 'pulse'], ['offbeat', 'chip square'], ['rolling', 'rumble'], ['rolling', 'dubsub'],
  ['drive', '8-bit'], ['drive', 'growl'], ['disco', 'pluck'], ['disco', 'grit'], ['funk', 'finger'], ['funk', 'piano 2'],
  ['breaks', 'deep'], ['breaks', 'chip saw'], ['dub', 'dubsub'], ['dub', 'pipe organ'], ['tresillo', 'pluck'], ['tresillo', 'chip triangle'],
  ['acid', 'acid'], ['acid', 'acid square'], ['acid', 'chip saw'], ['broken', 'piano'], ['broken', 'pluck'], ['broken', 'chip triangle'],
  ['walk', 'upright'], ['walk', 'pipe organ'], ['euclid', 'fm'], ['euclid', 'wobble'], ['euclid', 'reese'], ['answer', 'deep'],
];

// --- chords ---
// chord("…").voicing() with the song generator's chord rhythms, the fourth bar now and then on another
const VAR_STABS = {
  house: ['~ x ~ x ~ x ~ x', '~ x ~ ~ ~ x ~ ~', '~ x ~ x ~ ~ ~ x'],
  dub: ['~ x ~ ~ ~ x ~ ~', '~ ~ x ~ ~ ~ ~ ~', '~ x ~ ~ ~ ~ x ~', '~ ~ ~ x ~ ~ ~ ~'],
  gate: ['[x x ~ x]*4', 'x*16', '[x ~ x x]*4'],
  lofi: ['x ~ ~ x ~ ~ x ~', 'x@3 ~ x@2 ~ ~', 'x ~ ~ ~ x ~ ~ ~'],
  charleston: ['x ~ ~ x ~ ~ ~ ~', 'x ~ ~ x ~ ~ x ~', 'x ~ ~ [~ x] ~ ~ x ~'],
  synthwave: ['x ~ ~ x ~ ~ x ~', 'x ~ x ~ x ~ x ~'],
  skank: ['~ x ~ x', '~ [x x] ~ x', '~ x ~ [x ~ x ~]'],
  pluck: ['x ~ ~ x ~ ~ x ~', '~ x ~ ~ x ~ ~ x', 'x ~ ~ x ~ ~ ~ x'],
};
// chords spelled as scale degrees (the way the song generator writes them), from the bar's chord tones:
// x the chord nearest above `lo` (so the voices move as little as possible), y the next inversion up,
// L the bar's root an octave down (a pianist's left hand), _ hold, ~ rest
const VAR_VOICED = {
  sustain: ['x _ _ _', 'x _ _ y'],
  swell: ['x _ y _', 'x _ _ _ y _ _ _'],
  house: ['~ x ~ x ~ x ~ x', '~ x ~ ~ ~ x ~ ~'],
  lofi: ['x _ _ x _ _ x _', 'x _ ~ x _ ~ x ~'],
  ballad: ['L x _ _ ~ x _ ~', 'L x _ y _ _ x _'],
  stride: ['L ~ x ~ L ~ x ~', 'L x L x'],
  offbeat: ['~ x ~ x ~ x ~ x', '[~ x]*2 ~ x'],
};
const voicedLine = (style, { lo = 2, size = 4, pcs = 'tones' } = {}) => (v) => {
  const a = v.pick(VAR_VOICED[style]), b = v.chance(0.35) ? v.pick(VAR_VOICED[style]) : a;
  return bars2((c, n, i) => {
    const at = (from) => `[${chordWindow(c[pcs], from, size).join(',')}]`;
    return (i === 3 ? b : a).split(' ').map((t) => t.replace(/[xyL]/g, (m) => (m === 'x' ? at(lo) : m === 'y' ? at(lo + 2) : c.root - 7)));
  });
};
const VAR_PAD_SOUNDS = {
  organ: ['sine', '.fm(1.5).fmh(2).decay(.22).sustain(0).room(.3)', 0.2],
  'dub chord': ['sawtooth', '.decay(.15).sustain(0).lpf(1200).room(.6).delay(.5).delaytime(__DT__).delayfeedback(.65)', 0.12],
  'trance gate': ['supersaw', '.decay(.1).sustain(0).lpf(2600).room(.5)', 0.12],
  'air pad': ['supersaw', '.attack(2).release(4).lpf(sine.range(500,2200).slow(16)).room(.9).roomsize(8)', 0.11],
  'e-piano': ['fmpiano', '.release(.6).room(.35)', 0.3],
  piano: ['piano', '.clip(1).room(.4)', 0.3],
  'piano 2': ['piano1', '.clip(1).room(.3)', 0.3],
  'organ 8': ['organ_8inch', '.clip(1).room(.4)', 0.25],
  'organ 4': ['organ_4inch', '.clip(1).room(.3)', 0.25],
  'full organ': ['organ_full', '.clip(1).room(.5)', 0.22],
  'pipe organ': ['pipeorgan_quiet', '.clip(1).room(.6)', 0.25],
  'bowed vibes': ['vibraphone_bowed', '.clip(1).room(.5)', 0.3],
  'harmonica vib': ['harmonica_vib', '.clip(1).room(.5)', 0.25],
  marimba: ['marimba', '.clip(1).room(.4)', 0.6],
  recorders: ['recorder_alto_sus', '.clip(1).room(.5)', 0.25, 'A4'],
  harmonica: ['harmonica_soft', '.clip(1).room(.4)', 0.25],
  brass: ['sawtooth', '.attack(.05).decay(.3).sustain(.6).release(.4).lpf(2200)', 0.1],
  clav: ['triangle', '.fm(2).fmh(3).decay(.12).sustain(0).lpf(3000)', 0.16],
  'slow saw': ['supersaw', '.attack(.6).release(1.5).lpf(sine.range(600,2400).slow(8)).room(.6)', 0.1],
  'sine pad': ['sine', '.attack(.3).release(1).lpf(sine.range(600,2400).slow(8)).pan(sine.slow(4)).room(.6)', 0.18],
  'pluck echo': ['sawtooth', '.decay(.2).sustain(0).lpf(2600).room(.4).delay(.4).delaytime(__DT__).delayfeedback(.5)', 0.1],
};
// [stab rhythm | voiced style (+ options), sound]: 22
const VAR_PAD = [
  ['stab:house', 'organ'], ['stab:dub', 'dub chord'], ['stab:gate', 'trance gate'], [null, 'air pad'], ['stab:lofi', 'e-piano'],
  ['stab:charleston', 'piano'], ['voiced:sustain', 'organ 8'], ['voiced:house', 'organ 4'], ['voiced:swell', 'full organ'],
  ['voiced:sustain', 'pipe organ', { lo: 0 }], ['voiced:ballad', 'piano'], ['voiced:stride', 'piano 2'], ['voiced:sustain', 'bowed vibes', { lo: 4 }],
  ['voiced:swell', 'harmonica vib', { pcs: 'triad', size: 3 }], ['voiced:offbeat', 'marimba', { lo: 4, size: 3 }], ['voiced:sustain', 'recorders', { lo: -3, size: 3 }],
  ['voiced:lofi', 'harmonica', { pcs: 'triad', size: 3 }], ['stab:synthwave', 'brass'], ['stab:skank', 'clav'], ['voiced:swell', 'slow saw'],
  ['voiced:sustain', 'sine pad', { lo: 0, size: 5 }], ['stab:pluck', 'pluck echo'],
];

// --- arpeggios ---
const VAR_ARP_SHAPES = {
  up: [0, 1, 2, 3, 4, 5, 6, 7], down: [7, 6, 5, 4, 3, 2, 1, 0], alberti: [0, 2, 1, 2], pinky: [0, 3, 1, 3, 2, 3, 1, 3],
  converge: [0, 5, 1, 4, 2, 3, 3, 2], leap: [0, 3, 1, 4, 2, 5, 3, 6], pedal: [0, 2, 0, 3, 0, 4, 0, 3], wave: [0, 1, 2, 1],
  cascade: [5, 4, 3, 4, 3, 2, 3, 2, 1, 2, 1, 0],
};
// over the bar's chord tones like arpLine; `play` changes how the shape is run:
//   triplet 12 (or 6) steps a bar · gate only a Euclidean set of the steps · ratchet some steps twice ·
//   rotate each bar starts one step further on · octave every other note an octave up
const varArp = (shapeName, play) => (v) => {
  const shape = VAR_ARP_SHAPES[shapeName];
  const len = play === 'triplet' ? v.pick([12, 12, 6]) : v.pick([8, 16, 16]);
  const gate = play === 'gate' ? euclidHits(v.pick([5, 7, 9, 11]), len, v.int(0, 3)) : null;
  const twice = Array.from({ length: len }, () => play === 'ratchet' && v.chance(0.2));
  return bars2((c, n, b) => {
    const ds = chordRange(c, 0, 14);
    const s0 = Math.max(0, ds.findIndex((d) => mod7(d) === mod7(c.root)));
    return Array.from({ length: len }, (_, i) => {
      if (gate && !gate[i]) return '~';
      let d = ds[Math.min(ds.length - 1, s0 + shape[(i + (play === 'rotate' ? b : 0)) % shape.length])];
      if (play === 'octave' && i % 2) d = d + 7 <= 16 ? d + 7 : d - 7;
      return twice[i] ? `[${d} ${d}]` : d;
    });
  });
};
const VAR_ARP_SOUNDS = {
  glockenspiel: ['glockenspiel', '.clip(1).room(.3)', 0.3, 'A4'],
  marimba: ['marimba', '.clip(1).delay(.3).delaytime(__DT__)', 0.4],
  handchimes: ['handchimes', '.clip(1).room(.4)', 0.3],
  clavisynth: ['clavisynth', '.clip(1).pan(sine.slow(4))', 0.3],
  'soft balafon': ['balafon_soft', '.clip(1).room(.3)', 0.4],
  'folk harp': ['folkharp', '.clip(1).room(.4)', 0.4],
  strumstick: ['strumstick', '.clip(1).room(.3)', 0.36],
  piano: ['piano', '.clip(1).room(.3)', 0.28],
  'piano 2': ['piano1', '.clip(1).delay(.25).delaytime(__DT__)', 0.28],
  'xylophone medium': ['xylophone_medium_pp', '.room(.4)', 0.4, 'A4'],
  'xylophone hard': ['xylophone_hard_pp', '.room(.3)', 0.38, 'A4'],
  'xylophone soft': ['xylophone_soft_pp', '.room(.3)', 0.4, 'A4'],
  'organ 4': ['organ_4inch', '.clip(.8).room(.3)', 0.22],
  'organ 8': ['organ_8inch', '.clip(.8).room(.4)', 0.22],
  'dan tranh': ['dantranh_vibrato', '.clip(1).room(.4)', 0.34],
  'trance saw': ['sawtooth', '.lpf(sine.range(800,4000).slow(8)).decay(.12).sustain(0)', 0.12],
  'square pluck': ['square', '.lpf(1800).lpenv(3).lpd(.08).decay(.1).sustain(0)', 0.1],
  'fm bell': ['sine', '.fm(7).fmh(3.5).decay(.4).sustain(0).room(.5)', 0.14, 'A4'],
  'chip triangle': ['z_triangle', '.decay(.12).sustain(0)', 0.2, 'A4'],
  'chip square': ['z_square', '.decay(.08).sustain(0)', 0.1, 'A4'],
  'sine ping-pong': ['sine', '.decay(.2).sustain(0).jux(rev).room(.3)', 0.18, 'A4'],
  'supersaw pluck': ['supersaw', '.lpf(2600).decay(.15).sustain(0).room(.4)', 0.1],
  'saw sweep': ['sawtooth', '.lpf(saw.range(600,4000).slow(4)).lpq(8).decay(.1).sustain(0)', 0.11],
  'triangle echo': ['triangle', '.decay(.15).sustain(0).delay(.5).delaytime(__DT__).delayfeedback(.6)', 0.18, 'A4'],
};
// [shape, play, sound]: 24
const VAR_ARPS = [
  ['up', '', 'glockenspiel'], ['pinky', '', 'marimba'], ['cascade', 'triplet', 'handchimes'], ['up', 'gate', 'clavisynth'], ['wave', 'rotate', 'soft balafon'],
  ['alberti', '', 'folk harp'], ['leap', 'ratchet', 'strumstick'], ['up', 'octave', 'piano'], ['alberti', 'triplet', 'piano 2'],
  ['pedal', '', 'xylophone medium'], ['converge', '', 'xylophone hard'], ['leap', 'gate', 'xylophone soft'], ['pedal', '', 'organ 4'],
  ['cascade', 'rotate', 'organ 8'], ['wave', 'rotate', 'dan tranh'], ['up', '', 'trance saw'], ['wave', 'ratchet', 'square pluck'],
  ['leap', '', 'fm bell'], ['up', 'ratchet', 'chip triangle'], ['down', 'triplet', 'chip square'], ['converge', '', 'sine ping-pong'],
  ['pinky', 'gate', 'supersaw pluck'], ['down', 'octave', 'saw sweep'], ['pedal', 'rotate', 'triangle echo'],
];

// --- melodies ---
// A motif is a rhythm and a contour (steps from its first note); fitBar puts it on a bar's chord:
// beats land on chord tones (half bars on the triad), as in melody().
const motifOf = (v, { slots, density, hold }, part = 'all') => {
  let d = 0;
  return Array.from({ length: slots }, (_, i) => {
    const inPart = part === 'all' || (part === 'call' ? i < slots / 2 : i >= slots / 2);
    const first = i === (part === 'response' ? slots / 2 : 0);
    if (!inPart || !(first || v.chance(density))) return i > 0 && inPart && v.chance(hold) ? '_' : '~';
    if (!first) d = Math.max(-4, Math.min(4, d + v.pick([-2, -1, -1, 0, 1, 1, 2])));
    return d;
  });
};
const fitBar = (bar, c, lo, hi, add = 0) => cleanBar(bar.map((d, i) => {
  if (typeof d !== 'number') return d;
  const x = Math.max(lo, Math.min(hi, d + add)), e = (i * 8) / bar.length;
  return e % 2 === 0 ? snap(x, e % 4 === 0 ? c.triad : c.tones, lo, hi) : x;
}));
const VAR_LEAD_SHAPES = [
  { slots: 8, density: 0.55, hold: 0.3 }, { slots: 8, density: 0.7, hold: 0.2 }, { slots: 16, density: 0.4, hold: 0.25 },
  { slots: 8, density: 0.45, hold: 0.5 }, { slots: 4, density: 0.8, hold: 0.6 },
];
const VAR_LEAD_FORMS = {
  // the motif, the motif moved with the chord, the motif, an answer
  sequence: (v, o) => {
    const m = motifOf(v, o), ans = motifOf(v, o), base = v.int(o.lo + 2, o.hi - 3), r0 = BAR_CHORDS[0].root;
    return bars2((c, n, i) => fitBar(i === 3 ? ans : m, c, o.lo, o.hi, base + (i === 1 ? c.root - r0 : 0)));
  },
  // a call in the first half bar, a response in the second half of the next
  callResponse: (v, o) => {
    const call = motifOf(v, o, 'call'), resp = motifOf(v, o, 'response'), resp2 = motifOf(v, o, 'response');
    const base = v.int(o.lo + 2, o.hi - 3);
    return bars2((c, n, i) => fitBar([call, resp, call, resp2][i], c, o.lo, o.hi, base));
  },
  // the motif, upside down, the motif, backwards
  mirror: (v, o) => {
    const m = motifOf(v, o), base = v.int(o.lo + 3, o.hi - 3);
    const inv = m.map((d) => (typeof d === 'number' ? -d : d)), retro = [...m].reverse();
    return bars2((c, n, i) => fitBar([m, inv, m, retro][i], c, o.lo, o.hi, base));
  },
  // the motif, then the same a step later (off the beat)
  displace: (v, o) => {
    const m = motifOf(v, o), late = ['~', ...m.slice(0, -1)], base = v.int(o.lo + 2, o.hi - 3);
    return bars2((c, n, i) => fitBar(i % 2 ? late : m, c, o.lo, o.hi, base));
  },
  // three bars of the motif, the fourth an octave up
  octave: (v, o) => {
    const m = motifOf(v, o), base = v.int(o.lo + 1, o.hi - 4);
    return bars2((c, n, i) => fitBar(m, c, o.lo, o.hi + (i === 3 ? 7 : 0), base + (i === 3 ? 7 : 0)));
  },
  // a walk with grace notes, turns and trills between the beats
  ornament: (v, o) => {
    const m = motifOf(v, o), base = v.int(o.lo + 2, o.hi - 3), orn = m.map(() => (v.chance(0.35) ? v.pick(['up', 'turn', 'trill']) : null));
    return bars2((c) => fitBar(m, c, o.lo, o.hi, base).map((d, i) => {
      // (not on a beat, and not on a held note: a hold would stretch the ornament onto the beat)
      if (typeof d !== 'number' || !orn[i] || ((i * 8) / m.length) % 2 === 0 || m[i + 1] === '_') return d;
      return { up: `[${d} ${d + 1}]`, turn: `[${d + 1} ${d} ${d - 1} ${d}]`, trill: `[${d} ${d + 1} ${d} ${d + 1}]` }[orn[i]];
    }));
  },
  // a half-bar riff played twice a bar, its last note moved to the bar's chord
  hook: (v, o) => {
    const riff = motifOf(v, { ...o, slots: o.slots / 2 }), base = v.int(o.lo + 2, o.hi - 3);
    const twice = [...riff, ...riff.map((d, i) => (typeof d === 'number' && i === riff.length - 1 ? d + v.pick([1, -1, 2]) : d))];
    return bars2((c) => fitBar(twice, c, o.lo, o.hi, base));
  },
  // leaps between chord tones instead of steps
  leap: (v, o) => {
    const rhythm = Array.from({ length: o.slots }, (_, i) => i === 0 || v.chance(o.density));
    const picks = rhythm.map(() => v());
    return bars2((c) => {
      const ds = chordRange(c, o.lo, o.hi);
      return cleanBar(rhythm.map((on, i) => (on ? ds[Math.floor(picks[i] * ds.length)] : '~')));
    });
  },
  // 16th-note runs up or down the scale that land on a chord tone on the beat
  run: (v, o) => {
    const plan = [];
    for (let i = 0; i < 16; ) {
      const len = v.int(3, 6), dir = v.pick([1, -1]), rest = v.int(1, 3);
      for (let k = 0; k < len && i < 16; k++, i++) plan.push(k === 0 ? { start: true, dir } : { dir });
      for (let k = 0; k < rest && i < 16; k++, i++) plan.push(null);
    }
    const base = v.int(o.lo + 3, o.hi - 3);
    return bars2((c) => {
      let d = base;
      return fitBar(plan.map((p) => {
        if (!p) return '~';
        d = p.start ? base + (p.dir > 0 ? -2 : 2) : d + p.dir;
        return d;
      }), c, o.lo, o.hi);
    });
  },
};
const VAR_LEAD_SOUNDS = {
  'sine flute': ['sine', '.attack(.05).release(.3).lpf(2400).vib(5).vibmod(.15).room(.4)', 0.2],
  'triangle flute': ['triangle', '.attack(.04).release(.3).lpf(2000).vib(6).vibmod(.25).room(.5)', 0.2],
  'soprano recorder stacc': ['recorder_soprano_stacc', '.clip(1).room(.4)', 0.34],
  harmonica: ['harmonica', '.clip(1).room(.3)', 0.3],
  'harmonica vib': ['harmonica_vib', '.clip(1).room(.4)', 0.3],
  'harmonica soft': ['harmonica_soft', '.clip(1).room(.4)', 0.32],
  'chromatic harp': ['super64', '.clip(1).room(.3)', 0.3],
  'chromatic harp vib': ['super64_vib', '.clip(1).room(.4)', 0.3],
  'chromatic harp acc': ['super64_acc', '.clip(1).room(.3)', 0.3],
  'sax vib': ['sax_vib', '.clip(1).room(.3)', 0.34, 'A3'],
  saxello: ['saxello', '.clip(1).room(.3)', 0.34, 'A3'],
  'soprano recorder': ['recorder_soprano_sus', '.clip(1).room(.4)', 0.32],
  'alto recorder': ['recorder_alto_sus', '.clip(1).room(.4)', 0.32],
  'tenor recorder': ['recorder_tenor_sus', '.clip(1).room(.4)', 0.32, 'A3'],
  'bass recorder': ['recorder_bass_vib', '.clip(1).room(.4)', 0.34, 'A3'],
  'bass recorder stacc': ['recorder_bass_stacc', '.room(.3)', 0.34, 'A3'],
  'pipe organ': ['pipeorgan_loud', '.clip(1).room(.6)', 0.2],
  'full organ': ['organ_full', '.clip(1).room(.4)', 0.2],
  'organ 8': ['organ_8inch', '.clip(1).room(.3).delay(.25).delaytime(__DT__)', 0.22],
  'dan tranh tremolo': ['dantranh_tremolo', '.clip(1).room(.4)', 0.34, 'A3'],
  harp: ['harp', '.clip(1).room(.4)', 0.38],
  'dan tranh vib': ['dantranh_vibrato', '.clip(1).room(.4)', 0.34, 'A3'],
  'bowed vibes': ['vibraphone_bowed', '.clip(1).room(.5)', 0.32],
  'soft vibes': ['vibraphone_soft', '.clip(1).room(.4).delay(.3).delaytime(__DT__)', 0.4],
  piano: ['piano', '.clip(1).room(.4)', 0.3],
  'piano 2': ['piano1', '.clip(1).room(.3).delay(.3).delaytime(__DT__)', 0.3],
  'soft xylophone': ['xylophone_soft_pp', '.room(.4)', 0.4],
  blip: ['square', '.lpf(2600).decay(.12).sustain(0).delay(.45).delaytime(__DT__).delayfeedback(.5).pan(sine.slow(2))', 0.13],
  saw: ['sawtooth', '.lpf(2200).decay(.2).sustain(.3).release(.2).room(.4).delay(.3).delaytime(__DT__)', 0.11],
  supersaw: ['supersaw', '.hpf(200).lpf(4000).decay(.25).sustain(.4).release(.3).room(.6).delay(.3).delaytime(__DT__)', 0.1],
  fm: ['sine', '.fm(3).fmh(2.01).decay(.25).sustain(.1).delay(.35).delaytime(__DT__).room(.3)', 0.16],
  soft: ['triangle', '.decay(.3).sustain(.2).lpf(1800).room(.5)', 0.17],
  whistle: ['sine', '.attack(.03).release(.3).vib(5.5).vibmod(.2).room(.4)', 0.18, 'A5'],
  brass: ['sawtooth', '.attack(.06).decay(.2).sustain(.6).release(.2).lpf(1800).lpenv(2).vib(5).vibmod(.1)', 0.1],
  flute: ['triangle', '.attack(.08).release(.4).hpf(300).vib(4.5).vibmod(.2).room(.4)', 0.2],
  pwm: ['square', '.lpf(2400).attack(.02).sustain(.6).release(.2).vib(6).vibmod(.12).room(.3)', 0.09],
  sync: ['sawtooth', '.lpf(sine.range(800,3600).slow(4)).lpq(10).decay(.2).sustain(.4)', 0.1],
  glass: ['sine', '.fm(8).fmh(4.01).decay(.5).sustain(0).room(.6)', 0.14],
  'chip square': ['z_square', '.decay(.1).sustain(.5).release(.05)', 0.12],
  'chip triangle': ['z_triangle', '.decay(.2).sustain(.5)', 0.2],
  'chip saw': ['z_sawtooth', '.decay(.1).sustain(.3).zcrush(.15)', 0.1],
  'chip tan': ['z_tan', '.decay(.12).sustain(.4)', 0.1],
  bells: ['piano', '.clip(1).room(.8).roomsize(6).delay(.4).delaytime(__DT__).delayfeedback(.6)', 0.25],
};
// [form, sound]: 50
const VAR_LEADS = [
  ['sequence', 'sine flute'], ['sequence', 'sax vib'], ['sequence', 'brass'], ['sequence', 'chromatic harp'], ['sequence', 'saw'],
  ['sequence', 'alto recorder'], ['sequence', 'chip square'],
  ['callResponse', 'harmonica'], ['callResponse', 'saxello'], ['callResponse', 'fm'], ['callResponse', 'pipe organ'],
  ['callResponse', 'whistle'], ['callResponse', 'piano 2'], ['callResponse', 'chip triangle'],
  ['mirror', 'triangle flute'], ['mirror', 'dan tranh tremolo'], ['mirror', 'pwm'], ['mirror', 'tenor recorder'], ['mirror', 'glass'], ['mirror', 'piano'],
  ['displace', 'harmonica vib'], ['displace', 'blip'], ['displace', 'soprano recorder'], ['displace', 'sync'], ['displace', 'soft vibes'],
  ['octave', 'soprano recorder stacc'], ['octave', 'supersaw'], ['octave', 'chromatic harp vib'], ['octave', 'full organ'], ['octave', 'flute'],
  ['ornament', 'dan tranh vib'], ['ornament', 'harmonica soft'], ['ornament', 'soft'], ['ornament', 'bass recorder'],
  ['ornament', 'bowed vibes'], ['ornament', 'chip saw'],
  ['hook', 'chromatic harp acc'], ['hook', 'bass recorder stacc'], ['hook', 'chip tan'], ['hook', 'organ 8'], ['hook', 'saw'], ['hook', 'soft xylophone'],
  ['leap', 'bells'], ['leap', 'harp'], ['leap', 'fm'], ['leap', 'whistle'],
  ['run', 'piano'], ['run', 'pwm'], ['run', 'chip square'], ['run', 'harp'],
];
const VAR_FORM_LABEL = {
  callResponse: 'call & response', mirror: 'mirror', sequence: 'sequence', displace: 'offbeat', octave: 'octave answer',
  ornament: 'ornaments', hook: 'hook', leap: 'leaps', run: 'runs',
};
const SYNTHS = new Set(['sine', 'sawtooth', 'square', 'triangle', 'supersaw']);

function generateVariations(existing) {
  const r = rng(2620);
  const used = new Set(existing.map((l) => l.name));
  const name = (cat) => {
    const nouns = NOUNS[cat].split(' ');
    for (let k = 0; k < 500; k++) {
      const n = `${r.pick(ADJ)} ${r.pick(nouns)}`;
      if (!used.has(n)) {
        used.add(n);
        return n;
      }
    }
    return `${r.pick(ADJ)} ${r.pick(nouns)} ${used.size}`;
  };
  const color = (cat) => {
    const [h0, h1, sat, l] = HUES[cat];
    return hex((h0 + r() * ((h1 - h0 + 360) % 360)) % 360, sat + r.int(-10, 10), l + r.int(-8, 8));
  };
  const next = {};
  const nextId = (cat) => {
    next[cat] ??= Math.max(0, ...existing.map((l) => (l.cat === cat && /\d+$/.exec(l.id)?.[0]) || 0).map(Number));
    return `${cat}${++next[cat]}`;
  };
  const out = [];
  // one orb: `line(v)` gives the notes (and maybe extra controls), `snd` the instrument
  const add = (cat, kind, [s, tone, g, root], line, { snapTo = 'tones', defRoot } = {}) => {
    const snd = `.s("${s}")${tone}.gain(${g})`;
    const at = root ?? defRoot;
    out.push({
      id: nextId(cat), cat, name: name(cat), color: color(cat), tag: 'variations', kind,
      ...(!SYNTHS.has(s) && !s.startsWith('z_') && { samples: [s] }),
      code: (v) => line(v, at, snd),
      voice: melodic(at, snd, snapTo),
    });
  };
  for (const [style, sound] of VAR_BASS) {
    add('bass', `bass · ${style} · ${sound}`, VAR_BASS_SOUNDS[sound], (v, root, snd) => {
      const { notes, extra = '' } = VAR_BASS_LINES[style](v);
      return `n(${notes}).scale("${root}:minor")${snd}${extra}`;
    }, { snapTo: 'triad', defRoot: 'A1' });
  }
  for (const [how, sound, opts] of VAR_PAD) {
    const [kind, style] = how ? how.split(':') : [];
    const label = kind === 'voiced' ? `voiced ${style}` : style ?? 'held';
    add('pad', `chords · ${label} · ${sound}`, VAR_PAD_SOUNDS[sound], kind === 'voiced'
      ? (v, root, snd) => `n(${voicedLine(style, opts)(v)}).scale("${root}:minor")${snd}`
      : (v, root, snd) => {
        const rh = style && VAR_STABS[style], a = rh && v.pick(rh), b = rh && (v.chance(0.35) ? v.pick(rh) : a);
        return `chord("${PROG}").voicing()${rh ? `.struct("<[${a}] [${a}] [${a}] [${b}]>")` : ''}${snd}`;
      }, { defRoot: 'A3' });
  }
  for (const [shape, play, sound] of VAR_ARPS) {
    add('arp', `arp · ${[shape, play].filter(Boolean).join(' ')} · ${sound}`, VAR_ARP_SOUNDS[sound],
      (v, root, snd) => `n(${varArp(shape, play)(v)}).scale("${root}:minor")${snd}`, { defRoot: 'A3' });
  }
  for (const [form, sound] of VAR_LEADS) {
    const shape = form === 'run' ? { slots: 16 } : form === 'hook' ? r.pick(VAR_LEAD_SHAPES.slice(0, 3)) : r.pick(VAR_LEAD_SHAPES);
    add('lead', `melody · ${VAR_FORM_LABEL[form]} · ${sound}`, VAR_LEAD_SOUNDS[sound],
      (v, root, snd) => `n(${VAR_LEAD_FORMS[form](v, { ...shape, lo: 0, hi: 9 })}).scale("${root}:minor")${snd}`, { defRoot: 'A4' });
  }
  return out;
}

// ---------- eleventh batch: concert percussion ----------
// Hats, percussion, effects and textures from the VCSL concert percussion no orb used yet (their
// folders have no comma, so Chromium loads them): suspended cymbals played with sticks, on the bell,
// bowed, rolled and swelled; finger cymbal; two concert toms (stick, mallet, rim, rolls); timpani hits
// and rolls; gongs and clash cymbals; siren and ball whistle; ocean drum; slow wineglasses.
// `src` is the sound (an index pattern where hits vary), `fam` the rhythms the seed picks from.
// Own seed, appended last.
const PERC_ORBS = [
  // hat (6): rides and bells
  { cat: 'hat', kind: 'ride · cymbal stick', src: 's("sus_cymbal:15")', samples: ['sus_cymbal:15'],
    fam: ['x*4', 'x ~ x [x x]', 'x [~ x] x [~ x]'], tone: '.hpf(3000).room(.2)', g: 4 },
  { cat: 'hat', kind: 'ride · cymbal 8ths', src: 's("sus_cymbal:16")', samples: ['sus_cymbal:16'],
    fam: ['x*8', '[x x ~ x]*2', 'x*8'], tone: '.hpf(4000).velocity("[1 .6]*4")', g: 6.8 },
  { cat: 'hat', kind: 'ride · cymbal offbeat', src: 's("sus_cymbal2:13")', samples: ['sus_cymbal2:13'],
    fam: ['[~ x]*4', '[~ x x]*2', '~ x ~ [x x]'], tone: '.hpf(3500).pan(sine.range(.3,.7).slow(4))', g: 1.85 },
  { cat: 'hat', kind: 'ride · cymbal bell', src: 's("sus_cymbal:9")', samples: ['sus_cymbal:9'],
    fam: ['[~ x]*4', 'x ~ x x ~ x x ~', '~ x ~ x'], tone: '.hpf(2000).room(.3)', g: 1.39 },
  { cat: 'hat', kind: 'ride · cymbal bell soft', src: 's("sus_cymbal2:7")', samples: ['sus_cymbal2:7'],
    fam: ['x ~ x x ~ x x ~', '[x ~ ~ x]*2', 'x*4'], tone: '.hpf(1500).room(.25)', g: 4.36 },
  { cat: 'hat', kind: 'finger cymbal', src: 's("fingercymbal")', samples: ['fingercymbal'],
    fam: ['[~ x]*4', '~ x ~ [x x]', '[~ x]*2 ~ [~ x]'], tone: '.hpf(2500).room(.3)', g: 19.9 },
  // perc (14): concert toms and timpani
  { cat: 'perc', kind: 'perc · tom stick', src: 's("tom_stick").n("<1 3>")', samples: ['tom_stick:1', 'tom_stick:3'],
    fam: ['x(3,8)', 'x(3,8,2)', 'x(5,16,2)'], tone: '.room(.25)', g: 2.97 },
  { cat: 'perc', kind: 'perc · tom stick roll', src: 's("tom_stick:7")', samples: ['tom_stick:7'],
    fam: ['<~ ~ ~ [~ x]>', '<~ ~ ~ x>', '<~ x ~ [~ x]>'], tone: '.room(.3)', g: 4.59 },
  { cat: 'perc', kind: 'perc · tom rim', src: 's("tom_rim").n("<4 5>")', samples: ['tom_rim:4', 'tom_rim:5'],
    fam: ['x(5,16,2)', '~ x ~ [~ x]', 'x(3,8,1)'], tone: '.pan(rand).room(.2)', g: 9 },
  { cat: 'perc', kind: 'perc · low tom rim flam', src: 's("tom2_rim:5")', samples: ['tom2_rim:5'],
    fam: ['~ x ~ x', '~ [x x] ~ x', '[~ x]*2'], tone: '.room(.2)', g: 9 },
  { cat: 'perc', kind: 'perc · low tom', src: 's("tom2_mallet").n("<2 3>")', samples: ['tom2_mallet:2', 'tom2_mallet:3'],
    fam: ['x(3,8,2)', 'x ~ ~ x ~ ~ x ~', '~ ~ x ~ ~ x ~ ~'], tone: '.room(.3)', g: 2.13 },
  { cat: 'perc', kind: 'perc · low tom roll', src: 's("tom2_mallet:7")', samples: ['tom2_mallet:7'],
    fam: ['<~ ~ ~ x>', '<~ ~ ~ [~ x]>'], tone: '.room(.35)', g: 3.26 },
  { cat: 'perc', kind: 'perc · low tom rim', src: 's("tom2_rim:4")', samples: ['tom2_rim:4'],
    fam: ['x(7,16,3)', 'x(5,16)', '[~ x x]*2'], tone: '.pan(sine.slow(2)).room(.2)', g: 8.1 },
  { cat: 'perc', kind: 'perc · tom groove', src: 's("[~ tom_stick:3] ~ [~ tom2_mallet:3] tom2_mallet:1")', samples: ['tom_stick:3', 'tom2_mallet:3', 'tom2_mallet:1'],
    tone: '.room(.25)', g: 2.54, voice: 's("tom_stick:3")' },
  { cat: 'perc', kind: 'perc · tom call', src: 's("tom_stick:2 [~ tom_stick:2] tom2_mallet:2 ~")', samples: ['tom_stick:2', 'tom2_mallet:2'],
    tone: '.room(.3).pan(sine.slow(4))', g: 1.66, voice: 's("tom_stick:2")' },
  { cat: 'perc', kind: 'perc · timpani', src: 's("timpani2").n("<4 40>")', samples: ['timpani2:4', 'timpani2:40'],
    fam: ['x(3,16,4)', 'x ~ ~ ~ ~ ~ x ~', '~ ~ ~ <x [x x]>'], tone: '.room(.4)', g: 0.77 },
  { cat: 'perc', kind: 'perc · timpani low', src: 's("timpani2:184")', samples: ['timpani2:184'],
    fam: ['x ~ ~ ~ ~ ~ x ~', 'x ~ ~ ~ x ~ ~ ~', '<x [x ~ ~ x]>'], tone: '.lpf(1200).room(.4)', g: 1.05 },
  { cat: 'perc', kind: 'perc · timpani high', src: 's("timpani2").n("<100 106>")', samples: ['timpani2:100', 'timpani2:106'],
    fam: ['~ x ~ [~ x]', 'x(5,16,3)', '~ ~ x ~'], tone: '.room(.35)', g: 0.67 },
  { cat: 'perc', kind: 'perc · timpani hand', src: 's("timpani2").n("<64 70 76>")', samples: ['timpani2:64', 'timpani2:70', 'timpani2:76'],
    fam: ['x(3,8)', '[~ x]*2 ~ x', 'x ~ [~ x] ~'], tone: '.speed(1.1).room(.3)', g: 0.85 },
  { cat: 'perc', kind: 'perc · timpani roll', src: 's("timpani_roll").n("<0 2 4>")', samples: ['timpani_roll:0', 'timpani_roll:2', 'timpani_roll:4'],
    fam: ['<~ ~ ~ x>', '<~ ~ x ~>'], tone: '.room(.4)', g: 3.44 },
  // fx (10): gongs, crashes, swells, whistles
  { cat: 'fx', kind: 'gong', src: 's("gong:2")', samples: ['gong:2'], fam: ['<x ~ ~ ~>', '<x ~>'], tone: '.room(.5)', g: 0.313 },
  { cat: 'fx', kind: 'gong scrape', src: 's("gong:6")', samples: ['gong:6'], fam: ['<~ ~ ~ x>', '<~ ~ x ~>'], tone: '.room(.4)', g: 2.397 },
  { cat: 'fx', kind: 'big gong', src: 's("gong2:1")', samples: ['gong2:1'], fam: ['<x ~ ~ ~>'], tone: '.room(.5)', g: 0.191 },
  { cat: 'fx', kind: 'clash', src: 's("clash").n("<0 1>")', samples: ['clash:0', 'clash:1'], fam: ['<x ~ ~ ~>', '<x ~>'], tone: '.room(.4)', g: 0.51 },
  { cat: 'fx', kind: 'clash short', src: 's("clash2:1")', samples: ['clash2:1'], fam: ['<x ~ ~ ~>', '<x ~ ~ [~ ~ ~ x]>'], tone: '.room(.3)', g: 0.165 },
  { cat: 'fx', kind: 'cymbal swell', src: 's("sus_cymbal:6")', samples: ['sus_cymbal:6'], fam: ['<~ ~ x ~>'], tone: '.room(.4)', g: 0.29 },
  { cat: 'fx', kind: 'cymbal swell long', src: 's("sus_cymbal2:5")', samples: ['sus_cymbal2:5'], fam: ['<x ~ ~ ~>'], tone: '.room(.4)', g: 0.266 },
  { cat: 'fx', kind: 'siren', src: 's("siren").n("<0 2 4>")', samples: ['siren:0', 'siren:2', 'siren:4'], fam: ['<~ ~ ~ x>', '<~ x ~ ~>'], tone: '.room(.3)', g: 2.422 },
  { cat: 'fx', kind: 'ball whistle', src: 's("ballwhistle:1")', samples: ['ballwhistle:1'], fam: ['~ ~ ~ <x ~>', '<~ x> ~ ~ ~'], tone: '.room(.3)', g: 0.492 },
  { cat: 'fx', kind: 'ball whistle long', src: 's("ballwhistle:0")', samples: ['ballwhistle:0'], fam: ['<~ ~ ~ x>'], tone: '.room(.4)', g: 0.22 },
  // texture (8): waves, bowed metal, rumbles, glass and vibraphone drones
  { cat: 'texture', kind: 'ocean drum', src: 's("oceandrum").n("<0 1 2>")', samples: range('oceandrum', 3), fam: ['<x ~>'], tone: '.room(.5)', g: 2.892 },
  { cat: 'texture', kind: 'surf', src: 's("oceandrum:2")', samples: ['oceandrum:2'], fam: ['<x ~ ~ ~>'], tone: '.lpf(1500).pan(sine.slow(8)).room(.6)', g: 2.72 },
  { cat: 'texture', kind: 'bowed cymbal', src: 's("sus_cymbal").n("<0 1 2 3>")', samples: range('sus_cymbal', 4), fam: ['<x ~>'], tone: '.hpf(1500).room(.6)', g: 0.21 },
  { cat: 'texture', kind: 'bowed cymbal 2', src: 's("sus_cymbal2").n("<0 1 2>")', samples: range('sus_cymbal2', 3), fam: ['<x ~>'], tone: '.hpf(1200).pan(sine.slow(4)).room(.6)', g: 4.1 },
  { cat: 'texture', kind: 'cymbal roll', src: 's("sus_cymbal:20")', samples: ['sus_cymbal:20'], fam: ['<x ~>'], tone: '.hpf(1500).room(.5)', g: 0.057 },
  { cat: 'texture', kind: 'timpani rumble', src: 's("timpani_roll").n("<1 3>")', samples: ['timpani_roll:1', 'timpani_roll:3'], fam: ['<x ~ ~ ~>'], tone: '.lpf(400).room(.6)', g: 0.14 },
  // pitched: the bar's root (and fifth) under the chords
  { cat: 'texture', kind: 'glass drone', pitched: true, root: 'A4', samples: ['wineglass_slow'],
    line: () => bars((c) => [c.root]), snd: '.s("wineglass_slow").attack(.4).release(2).room(.7)', g: 0.71 },
  { cat: 'texture', kind: 'bowed vibes drone', pitched: true, root: 'A3', samples: ['vibraphone_bowed'],
    line: () => bars((c) => [`[${c.root},${c.root + 4}]`]), snd: '.s("vibraphone_bowed").clip(1).attack(.3).room(.7)', g: 0.46 },
];

function generateAcoustic(existing) {
  const r = rng(2621);
  const used = new Set(existing.map((l) => l.name));
  const name = (cat) => {
    const nouns = NOUNS[cat].split(' ');
    for (let k = 0; k < 500; k++) {
      const n = `${r.pick(ADJ)} ${r.pick(nouns)}`;
      if (!used.has(n)) {
        used.add(n);
        return n;
      }
    }
    return `${r.pick(ADJ)} ${r.pick(nouns)} ${used.size}`;
  };
  const color = (cat) => {
    const [h0, h1, sat, l] = HUES[cat];
    return hex((h0 + r() * ((h1 - h0 + 360) % 360)) % 360, sat + r.int(-10, 10), l + r.int(-8, 8));
  };
  const next = {};
  const nextId = (cat) => {
    next[cat] ??= Math.max(0, ...existing.map((l) => (l.cat === cat && /\d+$/.exec(l.id)?.[0]) || 0).map(Number));
    return `${cat}${++next[cat]}`;
  };
  return PERC_ORBS.map((o) => {
    const base = { id: nextId(o.cat), cat: o.cat, name: name(o.cat), color: color(o.cat), tag: 'acoustic', kind: o.kind, samples: o.samples };
    if (o.pitched) {
      const snd = `${o.snd}.gain(${o.g})`;
      return { ...base, code: () => `n(${o.line()}).scale("${o.root}:minor")${snd}`, voice: melodic(o.root, snd, 'triad') };
    }
    // each orb cuts off its own previous hit, like the other sampled drums
    const cut = choke();
    const tail = `${o.tone}${cut}.gain(${o.g})`;
    const one = (o.voice ?? o.src).replace(/\.n\("<(\d+).*?>"\)/, ':$1').replace(/^s\("([^"]+)"\):(\d+)/, 's("$1:$2")');
    return {
      ...base,
      code: o.fam ? (v) => `${o.src}.struct("${v.pick(o.fam)}")${tail}` : `${o.src}${tail}`,
      voice: drum(`.${one}${tail}`),
    };
  });
}

// ---------- twelfth batch: chip, ambient and world for every category ----------
// orbTaste.js sorts orbs into five vibes (dance, organic, chip, ambient, world) and explores the ones
// the song doesn't have. Chip and ambient were the smallest, and kick, snare and hat had only dance
// and organic, so exploring the drums went back and forth between those two. This batch fills the gaps:
// chip drums made with ZZFX (a falling sine or triangle for kicks, noise for snares and hats; `freq`, not
// `note`, so a key orb never moves them), soft and spacious drums from superdough synths and VCSL
// one-shots, world drums (cajon, conga, darbuka, agogo, bongo), and chip / ambient lines on the line
// generators of the tenth batch. Kind labels carry the words orbTaste reads. Own seed, appended last.

// ZZFX chip drums: the piano roll plays them on `freq`
const freqMap = (base) => (d) => Math.round(base * 2 ** ((d - 7) / 7));
const VIBE_DRUMS = [
  // kick: chip
  { cat: 'kick', kind: 'kick · chip sine drop', src: 's("z_sine")', fam: KICK.families[0], tone: '.decay(.12).sustain(0).slide(-3)', g: 1.842, freq: 160 },
  { cat: 'kick', kind: 'kick · chip triangle', src: 's("z_triangle")', fam: KICK.families[1], tone: '.decay(.1).sustain(0).slide(-2)', g: 2.292, freq: 120 },
  { cat: 'kick', kind: 'kick · chip crunch', src: 's("z_sine")', fam: KICK.families[3], tone: '.decay(.12).sustain(0).slide(-4).zcrush(.3)', g: 1.785, freq: 180 },
  { cat: 'kick', kind: 'kick · chip noise thump', src: 's("z_noise")', fam: KICK.families[4], tone: '.decay(.07).sustain(0).lpf(260)', g: 6.6, freq: 100 },
  // kick: ambient (synths, so the sound family stays plain)
  { cat: 'kick', kind: 'kick · soft heartbeat', src: 's("sbd")', fam: ['x ~ ~ ~ ~ ~ x ~', 'x ~ ~ ~ x ~ ~ ~', '<x [x ~ ~ ~ ~ ~ x ~]>'], tone: '.decay(.6).pdecay(.15).penv(18).lpf(300).room(.5)', g: 0.483 },
  { cat: 'kick', kind: 'kick · sine echo', src: 's("sine")', fam: ['x ~ ~ ~', 'x ~ ~ ~ ~ ~ ~ ~ x ~ ~ ~ ~ ~ ~ ~', 'x ~ ~ ~ ~ ~ x ~'],
    tone: '.freq(52).penv(24).pdecay(.06).decay(.35).sustain(0).delay(.35).delaytime(__DT__).delayfeedback(.45).room(.4)', g: 1.32 },
  { cat: 'kick', kind: 'kick · soft bass drum air', src: 's("bassdrum1")', samples: ['bassdrum1'], fam: ['x ~ ~ ~ ~ ~ ~ ~', 'x ~ ~ ~ ~ ~ x ~'], tone: '.lpf(800).room(.7).roomsize(6)', g: 10.134, cut: true },
  // kick: world
  { cat: 'kick', kind: 'kick · cajon bass', src: 's("cajon").n("<2 3>")', samples: ['cajon:2', 'cajon:3'], fam: ['x ~ ~ x ~ ~ x ~', 'x ~ ~ ~ x ~ ~ ~', 'x ~ ~ x ~ x ~ ~'], tone: '.lpf(900).room(.2)', g: 1.92, cut: true },
  { cat: 'kick', kind: 'kick · conga tumba', src: 's("conga").n("<24 25>")', samples: ['conga:24', 'conga:25'], fam: ['x ~ ~ x ~ ~ x ~', 'x ~ x ~ ~ ~ x ~'], tone: '.speed(.8).lpf(1200).room(.2)', g: 4.446, cut: true },
  { cat: 'kick', kind: 'kick · darbuka doum', src: 's("darbuka").n("<2 3>")', samples: ['darbuka:2', 'darbuka:3'], fam: ['x ~ ~ ~ x ~ x ~', 'x ~ ~ x ~ ~ x ~', 'x ~ x ~ ~ ~ x ~'], tone: '.speed(.7).lpf(800).room(.2)', g: 0.6, cut: true },
  // snare: chip
  { cat: 'snare', kind: 'snare · chip noise', src: 's("z_noise")', fam: SNARE.families[0], tone: '.decay(.12).sustain(0).hpf(900)', g: 0.54, freq: 300 },
  { cat: 'snare', kind: 'snare · chip crush', src: 's("z_noise")', fam: SNARE.families[1], tone: '.decay(.1).sustain(0).zcrush(.4).hpf(600)', g: 1.032, freq: 300 },
  { cat: 'snare', kind: 'snare · chip square tom-snare', src: 's("z_square")', fam: SNARE.families[4], tone: '.decay(.1).sustain(0).slide(-3).lpf(3000)', g: 0.383, freq: 240 },
  { cat: 'snare', kind: 'snare · chip tan', src: 's("z_tan")', fam: SNARE.families[3], tone: '.decay(.08).sustain(0).slide(-5).zcrush(.2)', g: 0.563, freq: 400 },
  // snare: ambient
  { cat: 'snare', kind: 'snare · soft noise brush', src: 's("white")', fam: ['~ x ~ x', '~ x ~ [x ~ ~ x]', '~ ~ x ~'], tone: '.attack(.01).decay(.15).sustain(0).lpf(2500).hpf(400).room(.6)', g: 1.134 },
  { cat: 'snare', kind: 'snare · woodblock echo', src: 's("woodblock").n("<6 7>")', samples: ['woodblock:6', 'woodblock:7'], fam: ['~ x ~ x', '~ ~ x ~'], tone: '.delay(.4).delaytime(__DT__).delayfeedback(.5).room(.5)', g: 8.319, cut: true },
  { cat: 'snare', kind: 'snare · soft snap in space', src: 's("clap").n("<6 7>")', samples: ['clap:6', 'clap:7'], fam: ['~ x ~ x', '~ ~ x ~ ~ ~ x ~'], tone: '.lpf(3000).room(.8).roomsize(7)', g: 2.172, cut: true },
  // snare: world
  { cat: 'snare', kind: 'snare · darbuka tek', src: 's("darbuka").n("<14 15>")', samples: ['darbuka:14', 'darbuka:15'], fam: ['~ x ~ x', '~ x ~ [x x]', '~ ~ x ~ ~ x x ~'], tone: '.room(.2)', g: 2.558, cut: true },
  { cat: 'snare', kind: 'snare · cajon slap', src: 's("cajon").n("<12 13>")', samples: ['cajon:12', 'cajon:13'], fam: ['~ x ~ x', '~ x ~ [~ x]'], tone: '.hpf(300).room(.2)', g: 1.463, cut: true },
  { cat: 'snare', kind: 'snare · conga quinto slap', src: 's("conga").n("<12 13>")', samples: ['conga:12', 'conga:13'], fam: ['~ x ~ x', '~ ~ x ~ ~ ~ x [~ x]'], tone: '.room(.2)', g: 2.387, cut: true },
  // hat: chip
  { cat: 'hat', kind: 'hat · chip noise 16ths', src: 's("z_noise")', fam: HAT.families[0], tone: '.decay(.03).sustain(0).hpf(7000)', g: 0.756, freq: 2000 },
  { cat: 'hat', kind: 'hat · chip open', src: 's("z_noise")', fam: ['[~ x]*4', '[~ x ~ x?]*2'], tone: '.decay(.15).sustain(0).hpf(6000)', g: 0.593, freq: 2000 },
  { cat: 'hat', kind: 'hat · chip tick', src: 's("z_square")', fam: HAT.families[1], tone: '.decay(.02).sustain(0).hpf(4000)', g: 0.52, freq: 5000 },
  { cat: 'hat', kind: 'hat · chip crush', src: 's("z_noise")', fam: HAT.families[4], tone: '.decay(.04).sustain(0).zcrush(.5).hpf(5000)', g: 3.267, freq: 3000 },
  // hat: ambient
  { cat: 'hat', kind: 'hat · triangle shimmer', src: 's("triangles").n("<4 6 19>")', samples: ['triangles:4', 'triangles:6', 'triangles:19'], fam: ['[~ x]*2', '~ x ~ ~', 'x(3,8,2)'], tone: '.hpf(3000).room(.6)', g: 7.214, cut: true },
  { cat: 'hat', kind: 'hat · soft noise air', src: 's("pink")', fam: ['x*8', '[~ x]*4', 'x*4'], tone: '.decay(.08).sustain(0).hpf(6000).pan(sine.slow(8)).room(.5)', g: 5.658 },
  { cat: 'hat', kind: 'hat · wind chimes soft', src: 's("marktrees").n("<0 1 4 5>")', samples: range('marktrees', 6), fam: ['<x ~>', '<x ~ ~ ~>'], tone: '.hpf(2000).room(.6)', g: 3.654, cut: true },
  // hat: world
  { cat: 'hat', kind: 'hat · agogo', src: 's("agogo").n("[0 1 3 1]*2")', samples: range('agogo', 5), fam: ['x*8', '[x x ~ x]*2', '[~ x]*4'], tone: '.room(.2)', g: 9.47, cut: true },
  { cat: 'hat', kind: 'hat · bongo ghost', src: 's("bongo").n("<6 8 10>")', samples: ['bongo:6', 'bongo:8', 'bongo:10'], fam: ['[x x ~ x]*4', 'x*8', '[~ x x]*4'], tone: '.hpf(500).velocity(perlin.range(.5,1))', g: 2.295, cut: true },
  { cat: 'hat', kind: 'hat · cajon ghost', src: 's("cajon").n("<8 9>")', samples: ['cajon:8', 'cajon:9'], fam: ['x*16', '[x ~ x x]*4'], tone: '.hpf(1500).velocity("[1 .6 .8 .6]*4")', g: 4.4, cut: true },
  // perc: chip
  { cat: 'perc', kind: 'perc · chip toms', src: 's("z_triangle").freq("[220 165 110]")', fam: PERC.families[0], tone: '.decay(.12).sustain(0).slide(-1)', g: 0.932, freq: 165 },
  { cat: 'perc', kind: 'perc · chip cowbell', src: 's("z_square")', fam: PERC.families[1], tone: '.decay(.08).sustain(0).lpf(3000)', g: 0.526, freq: 800 },
  { cat: 'perc', kind: 'perc · chip blips', src: 's("z_sine").freq("<1200 1600 900>")', fam: PERC.families[2], tone: '.decay(.05).sustain(0).pan(rand)', g: 1.145, freq: 1200 },
  { cat: 'perc', kind: 'perc · chip bongo', src: 's("z_sine").freq("[300 220]")', fam: PERC.families[3], tone: '.decay(.08).sustain(0).slide(-1.5)', g: 0.896, freq: 260 },
  // perc: ambient
  { cat: 'perc', kind: 'perc · glass taps soft', src: 's("wineglass")', samples: ['wineglass'], fam: ['x(3,8,<0 2>)', '~ x ~ ~'], tone: '.note("<a5 e5>").room(.6).delay(.3).delaytime(__DT__)', g: 2.528, cut: true },
  { cat: 'perc', kind: 'perc · log drum echo', src: 's("slitdrum").n("<0 3 1 4>")', samples: range('slitdrum', 6), fam: ['x(3,8)', 'x ~ ~ x ~ ~ ~ ~'], tone: '.delay(.45).delaytime(__DT__).delayfeedback(.55).room(.5)', g: 5.235, cut: true },
  { cat: 'perc', kind: 'perc · sine drops echo', src: 's("sine").freq("<880 660 990>")', fam: ['x(3,8,2)', '~ x ~ ~ ~ ~ x ~'], tone: '.decay(.2).sustain(0).penv(-12).pdecay(.2).delay(.5).delaytime(__DT__).delayfeedback(.6).room(.5)', g: 0.523 },
  // fx: chip
  { cat: 'fx', kind: 'fx · chip power-up', src: 's("z_square")', fam: ['<~ ~ ~ x>', '<~ x ~ ~>'], tone: '.decay(.4).sustain(0).slide(4).pitchJump(300).pitchJumpTime(.08)', g: 0.1, freq: 300 },
  { cat: 'fx', kind: 'fx · chip explosion', src: 's("z_noise")', fam: ['<x ~ ~ ~>', '<~ ~ x ~>'], tone: '.decay(.8).sustain(0).slide(-1).lpf(2000)', g: 0.174, freq: 80 },
  { cat: 'fx', kind: 'fx · chip hit', src: 's("z_sawtooth")', fam: ['~ ~ ~ <x ~>', '<~ x> ~ ~ ~'], tone: '.decay(.15).sustain(0).slide(-8).zcrush(.3)', g: 0.278, freq: 500 },
  { cat: 'fx', kind: 'fx · chip warp', src: 's("z_sine")', fam: ['<~ ~ ~ x>'], tone: '.attack(.2).decay(.6).sustain(0).slide(6)', g: 0.14, freq: 200 },
  // fx: ambient
  { cat: 'fx', kind: 'fx · air swell', src: 's("pink")', fam: ['<~ ~ ~ x>', '<~ ~ x ~>'], tone: '.attack(1.2).decay(.1).sustain(0).lpf(sine.range(800,4000).slow(4)).room(.6)', g: 0.55 },
  { cat: 'fx', kind: 'fx · space drop', src: 's("sine").freq(440)', fam: ['<x ~ ~ ~>', '<~ ~ x ~>'], tone: '.penv(-24).pdecay(1.5).decay(1.5).sustain(0).delay(.5).delaytime(__DT__).delayfeedback(.6).room(.7)', g: 0.15 },
  { cat: 'fx', kind: 'fx · tubular bell echo', src: 's("tubularbells")', samples: ['tubularbells'], fam: ['<x ~ ~ ~>'], tone: '.note("a3").clip(1).delay(.5).delaytime(__DT__).delayfeedback(.65).room(.7)', g: 1.545, cut: true },
  { cat: 'fx', kind: 'fx · glass swell', src: 's("wineglass_slow")', samples: ['wineglass_slow'], fam: ['<x ~ ~ ~>', '<~ ~ x ~>'], tone: '.note("<a4 e4>").attack(.6).release(2).room(.8)', g: 2.84, cut: true },
  // texture: chip
  { cat: 'texture', kind: 'texture · chip rain', src: 's("z_noise")', fam: ['x*16'], tone: '.degradeBy(.5).decay(.02).sustain(0).hpf(5000).velocity(rand.range(.3,1))', g: 0.148, freq: 3000 },
  { cat: 'texture', kind: 'texture · chip bubbles', src: 's("z_sine")', fam: ['x*8'], tone: '.freq(rand.range(400,1600)).degradeBy(.4).decay(.06).sustain(0).slide(2)', g: 0.1 },
  { cat: 'texture', kind: 'texture · chip static', src: 's("z_noise")', fam: ['x*4'], tone: '.attack(.05).decay(.4).sustain(.5).zcrush(.6).lpf(1500)', g: 0.04, freq: 1000 },
  { cat: 'texture', kind: 'texture · chip crickets', src: 's("z_square")', fam: ['[x x x ~]*2', '[~ x x x]*2'], tone: '.decay(.015).sustain(0).hpf(4000).pan(rand)', g: 0.104, freq: 4500 },
  // texture: ambient
  { cat: 'texture', kind: 'texture · air pad noise', src: 's("pink")', fam: ['<x ~>'], tone: '.attack(1).release(2).lpf(sine.range(400,1600).slow(16)).pan(sine.slow(8)).room(.8)', g: 0.186 },
];
// chip and ambient lines on the tenth batch's generators: [cat, kind, line, [s, tone, gain, root?]]
const VIBE_LINES = [
  // bass
  ['bass', 'bass · chip drive', ['bass', 'drive'], ['z_square', '.decay(.1).sustain(.3).lpf(1200)', 0.297, 'A2']],
  ['bass', 'bass · chip pulse offbeat', ['bass', 'offbeat'], ['z_triangle', '.decay(.12).sustain(.2)', 0.688, 'A2']],
  ['bass', 'bass · chip saw broken', ['bass', 'broken'], ['z_sawtooth', '.decay(.1).sustain(.2).zcrush(.15).lpf(1600)', 0.581, 'A2']],
  ['bass', 'bass · soft sine drone', ['bass', 'dub'], ['sine', '.attack(.3).decay(.8).sustain(.6).release(1).lpf(300)', 0.239]],
  ['bass', 'bass · soft triangle echo', ['bass', 'lofi'], ['triangle', '.decay(.5).sustain(.4).lpf(500).delay(.3).delaytime(__DT__).room(.4)', 0.4]],
  ['bass', 'bass · air sub', ['bass', 'answer'], ['sine', '.attack(.05).decay(.6).sustain(.5).lpf(200).room(.5)', 0.24]],
  ['bass', 'bass · bowed drone', ['bass', 'dnb'], ['vibraphone_bowed', '.clip(1).room(.6)', 50.064, 'A2']],
  // pad
  ['pad', 'chords · chip held', ['voiced', 'sustain', { size: 3, pcs: 'triad' }], ['z_triangle', '.attack(.05).sustain(.6).release(.3)', 0.199]],
  ['pad', 'chords · chip stabs', ['stab', 'pluck'], ['z_square', '.decay(.12).sustain(0)', 0.192]],
  ['pad', 'chords · chip arp-chords', ['voiced', 'offbeat', { size: 3 }], ['z_sawtooth', '.decay(.15).sustain(.2).zcrush(.1)', 0.33]],
  ['pad', 'chords · chip sine swell', ['voiced', 'swell'], ['z_sine', '.attack(.2).sustain(.6).release(.5)', 0.12]],
  ['pad', 'chords · air pad glass', ['voiced', 'sustain', { lo: 4 }], ['sine', '.fm(2).fmh(4.01).attack(.8).release(2).room(.8).roomsize(6)', 0.045]],
  ['pad', 'chords · soft triangle drone', ['voiced', 'sustain', { lo: 0, size: 3, pcs: 'triad' }], ['triangle', '.attack(1).release(2.5).lpf(1400).room(.8)', 0.101]],
  ['pad', 'chords · bowed space pad', ['voiced', 'swell', { lo: 2 }], ['vibraphone_bowed', '.clip(1).attack(.4).room(.8).roomsize(7)', 3.888]],
  ['pad', 'chords · echo pad', ['voiced', 'swell', { lo: 3, size: 3 }], ['supersaw', '.attack(1.5).release(3).lpf(900).delay(.4).delaytime(__DT__).delayfeedback(.6).room(.8)', 0.166]],
  // arp
  ['arp', 'arp · chip up', ['arp', 'up', ''], ['z_square', '.decay(.08).sustain(0)', 0.151, 'A4']],
  ['arp', 'arp · chip triplet', ['arp', 'cascade', 'triplet'], ['z_triangle', '.decay(.1).sustain(0)', 0.262, 'A4']],
  ['arp', 'arp · chip ratchet', ['arp', 'pinky', 'ratchet'], ['z_sawtooth', '.decay(.06).sustain(0).zcrush(.1)', 0.289, 'A4']],
  ['arp', 'arp · chip octave', ['arp', 'wave', 'octave'], ['z_sine', '.decay(.1).sustain(0)', 0.2, 'A4']],
  ['arp', 'arp · chip tan gate', ['arp', 'leap', 'gate'], ['z_tan', '.decay(.06).sustain(0)', 0.254, 'A4']],
  ['arp', 'arp · soft sine echo', ['arp', 'up', ''], ['sine', '.decay(.3).sustain(0).delay(.5).delaytime(__DT__).delayfeedback(.6).room(.6)', 0.087, 'A4']],
  ['arp', 'arp · glass bells drift', ['arp', 'converge', 'rotate'], ['sine', '.fm(6).fmh(3.01).decay(.6).sustain(0).room(.8)', 0.07, 'A4']],
  ['arp', 'arp · handchimes space', ['arp', 'wave', ''], ['handchimes', '.clip(1).room(.8).roomsize(6)', 0.207]],
  // lead
  ['lead', 'melody · chip sequence', ['lead', 'sequence'], ['z_square', '.decay(.1).sustain(.5).release(.05)', 0.12]],
  ['lead', 'melody · chip hook', ['lead', 'hook'], ['z_triangle', '.decay(.15).sustain(.5)', 0.254]],
  ['lead', 'melody · chip runs', ['lead', 'run'], ['z_sawtooth', '.decay(.06).sustain(.3).zcrush(.1)', 0.268]],
  ['lead', 'melody · chip call', ['lead', 'callResponse'], ['z_tan', '.decay(.1).sustain(.4)', 0.19]],
  ['lead', 'melody · soft sine long', ['lead', 'octave', { slots: 4, density: 0.7, hold: 0.7 }], ['sine', '.attack(.15).release(.8).vib(4).vibmod(.15).room(.7)', 0.095]],
  ['lead', 'melody · air triangle drift', ['lead', 'mirror', { slots: 8, density: 0.4, hold: 0.6 }], ['triangle', '.attack(.2).release(1).hpf(300).room(.7).delay(.3).delaytime(__DT__)', 0.086]],
  ['lead', 'melody · glass echo', ['lead', 'leap', { slots: 8, density: 0.35, hold: 0 }], ['sine', '.fm(4).fmh(2.01).decay(.6).sustain(0).delay(.5).delaytime(__DT__).delayfeedback(.6).room(.6)', 0.12]],
  ['lead', 'melody · bowed soft', ['lead', 'sequence', { slots: 4, density: 0.6, hold: 0.6 }], ['vibraphone_bowed', '.clip(1).room(.7)', 4.395]],
];
const VIBE_LEAD_SHAPE = { slots: 8, density: 0.55, hold: 0.3 };

function generateVibes(existing) {
  const r = rng(2622);
  const used = new Set(existing.map((l) => l.name));
  const name = (cat) => {
    const nouns = NOUNS[cat].split(' ');
    for (let k = 0; k < 500; k++) {
      const n = `${r.pick(ADJ)} ${r.pick(nouns)}`;
      if (!used.has(n)) {
        used.add(n);
        return n;
      }
    }
    return `${r.pick(ADJ)} ${r.pick(nouns)} ${used.size}`;
  };
  const color = (cat) => {
    const [h0, h1, sat, l] = HUES[cat];
    return hex((h0 + r() * ((h1 - h0 + 360) % 360)) % 360, sat + r.int(-10, 10), l + r.int(-8, 8));
  };
  const next = {};
  const nextId = (cat) => {
    next[cat] ??= Math.max(0, ...existing.map((l) => (l.cat === cat && /\d+$/.exec(l.id)?.[0]) || 0).map(Number));
    return `${cat}${++next[cat]}`;
  };
  const out = [];
  const base = (cat, kind, samples) => ({ id: nextId(cat), cat, name: name(cat), color: color(cat), tag: 'vibes', kind, ...(samples && { samples }) });
  for (const o of VIBE_DRUMS) {
    const cut = o.cut ? choke() : '';
    const freq = o.freq && !/freq\(/.test(o.src) ? `.freq(${o.freq})` : '';
    const tail = `${o.tone}${cut}.gain(${o.g})`;
    const one = o.src.replace(/\.n\("[<[]?(\d+).*?"\)/, ':$1').replace(/^s\("([^"]+)"\):(\d+)/, 's("$1:$2")').replace(/\.freq\([^)]*\)\)?/, '');
    out.push({
      ...base(o.cat, o.kind, o.samples),
      code: (v) => `${o.src}.struct("${v.pick(o.fam)}")${freq}${tail}`,
      voice: o.freq ? drum(`.${one}${tail}`, 'freq', freqMap(o.freq)) : drum(`.${one}${tail}`),
    });
  }
  for (const [cat, kind, [type, a, b], [s, tone, g, root]] of VIBE_LINES) {
    const snd = `.s("${s}")${tone}.gain(${g})`;
    const at = root ?? { bass: 'A1', pad: 'A3', arp: 'A3', lead: 'A4' }[cat];
    const samples = !SYNTHS.has(s) && !s.startsWith('z_') ? [s] : undefined;
    let line;
    if (type === 'bass') line = (v) => { const { notes, extra = '' } = VAR_BASS_LINES[a](v); return `n(${notes}).scale("${at}:minor")${snd}${extra}`; };
    else if (type === 'voiced') line = (v) => `n(${voicedLine(a, b)(v)}).scale("${at}:minor")${snd}`;
    else if (type === 'stab') line = (v) => { const rh = VAR_STABS[a], x = v.pick(rh); return `chord("${PROG}").voicing().struct("<[${x}] [${x}] [${x}] [${v.pick(rh)}]>")${snd}`; };
    else if (type === 'arp') line = (v) => `n(${varArp(a, b)(v)}).scale("${at}:minor")${snd}`;
    else line = (v) => `n(${VAR_LEAD_FORMS[a](v, { ...(b ?? VIBE_LEAD_SHAPE), lo: 0, hi: 9 })}).scale("${at}:minor")${snd}`;
    out.push({ ...base(cat, kind, samples), code: line, voice: melodic(at, snd, cat === 'bass' ? 'triad' : 'tones') });
  }
  return out;
}

const FIRST = [...HANDMADE, ...generateOrbs(HANDMADE)];
const SECOND = [...FIRST, ...generateMore(FIRST)];
const THIRD = [...SECOND, ...MODE_ORBS, ...generateModeCombos(SECOND)];
const FOURTH = [...THIRD, ...generateMachines(THIRD)];
const FIFTH = [...FOURTH, ...generateBlockFx(FOURTH)];
const SIXTH = [...FIFTH, ...generateDubTechno(FIFTH)];
const SEVENTH = [...SIXTH, ...generateInstruments(SIXTH)];
const EIGHTH = [...SEVENTH, ...generateScales(SEVENTH)];
// ---------- ninth batch: EQ orbs ----------
// Moods of the EQ sub-type (`eq: true`): they change only the tone of every part, more or less low
// end, more or less top. One per range stacks (bass boost + treble boost + mids …): a second on
// the same range bounces the first. How the filters are applied, and why a part's own filter
// wins: eqFx in src/orbPreset.js. A resonance (lpq / hpq) is the boost in dB.
const EQ_ORBS = [
  { id: 'eqBass', kind: 'EQ · 저음 강화', name: '쿵쿵 울리는 저음', colors: ['#3a0ca3', '#7209b7', '#f72585'], fx: `.hpf(70).hpq(9)` },
  { id: 'eqSub', kind: 'EQ · 초저음 강화', name: '땅이 흔들리는 초저음', colors: ['#10002b', '#5a189a', '#9d4edd'], fx: `.hpf(42).hpq(12)` },
  { id: 'eqPunch', kind: 'EQ · 중저음 강화', name: '가슴을 치는 펀치', colors: ['#d00000', '#e85d04', '#ffba08'], fx: `.hpf(120).hpq(7)` },
  { id: 'eqTreble', kind: 'EQ · 고음 강화', name: '반짝반짝 고음', colors: ['#caf0f8', '#48cae4', '#ffd60a'], fx: `.lpf(7000).lpq(9)` },
  { id: 'eqAir', kind: 'EQ · 공기감', name: '공기 한 스푼', colors: ['#ffffff', '#bde0fe', '#a2d2ff'], fx: `.lpf(13000).lpq(12)` },
  { id: 'eqSmile', kind: 'EQ · 저음+고음 강화', name: '웃는 얼굴 커브', colors: ['#f72585', '#4cc9f0', '#ffd60a'], fx: `.hpf(65).hpq(8).lpf(9000).lpq(8)` },
  { id: 'eqMid', kind: 'EQ · 중음만', name: '전화기 너머 목소리', colors: ['#8d99ae', '#ef233c', '#edf2f4'], fx: `.bpf(1100).bpq(.6)` },
  { id: 'eqLowCut', kind: 'EQ · 저음 줄이기', name: '깃털처럼 가볍게', colors: ['#e9ff70', '#ffd670', '#ff9770'], fx: `.hpf(260)` },
  { id: 'eqHighCut', kind: 'EQ · 고음 줄이기', name: '포근한 솜이불', colors: ['#6d597a', '#b56576', '#eaac8b'], fx: `.lpf(2400)` },
].map((o) => ({ ...o, cat: 'mood', sub: 'eq', eq: true }));
// ---------- single-effect moods ----------
// Effects that only came stacked with others in the generated moods ("멜로디 줄임+구멍+얇은",
// "얇은+스윙" …) also get a mood of their own, so each can be tried alone.
const SINGLE_MOODS = [
  { id: 'meloRest', sub: 'mix', kind: '밸런스 · 멜로디 줄임', name: '멜로디는 잠시 쉬어', colors: ['#ffd6a5', '#caffbf', '#9bf6ff'], duck: MOOD_MUTES[3].duck },
  { id: 'bassless', sub: 'mix', kind: '밸런스 · 베이스 줄임', name: '베이스 없는 오후', colors: ['#fdffb6', '#ffc6ff', '#bdb2ff'], duck: MOOD_MUTES[2].duck },
  { id: 'drumStage', sub: 'mix', kind: '밸런스 · 드럼 강조', name: '드럼만 남은 무대', colors: ['#ef476f', '#ffd166', '#118ab2'], duck: MOOD_MUTES[1].duck },
  { id: 'swingFeel', sub: 'motion', kind: '움직임 · 스윙', name: '어깨가 들썩이는 스윙', colors: ['#ff9f1c', '#2ec4b6', '#cbf3f0'], fx: `.swingBy(1/3, 4)` },
].map((o) => ({ ...o, cat: 'mood' }));
// Mood balance: every effect has exactly one single-effect mood (the 약하게 / 세게 slots set its
// strength) and five to seven moods in all, the rest two- and three-effect stacks. The generated
// moods had several singles of the same effect and few stacks of others, so those keep their id and
// name but are redone here (a song saved with one sounds different now, but still loads); two
// 먹먹 stacks swap it for something rarer. Applied after generation, so no other orb changes.
const DUCK = Object.fromEntries(MOOD_MUTES.map((m) => [m.label, m.duck]));
const reMood = (sub, words, fx = '') => {
  const mute = words.find((w) => DUCK[w]);
  return { sub: mute ? 'mix' : sub, kind: `${MOOD_SUBS[mute ? 'mix' : sub]} · ${words.join('+')}`, fx: fx || undefined, duck: mute ? DUCK[mute] : undefined };
};
const MOOD_REWORK = {
  // the two effects that had no mood at all, alone
  mood10: reMood('motion', ['거울'], `.jux(rev)`),
  mood26: reMood('mix', ['리듬 강조']),
  // stacks for the rare ones, mostly with a balance part
  mood39: reMood('mix', ['베이스 줄임', '얇은'], `.hpf(500)`),
  mood41: reMood('mix', ['베이스 줄임', '거울'], `.jux(rev)`),
  mood43: reMood('mix', ['베이스 줄임', '숨쉬는'], `.lpf(sine.range(300,3000).slow(4))`),
  mood11: reMood('mix', ['멜로디 줄임', '스윙'], `.swingBy(1/6, 4)`),
  mood14: reMood('mix', ['멜로디 줄임', '찌그러진'], `.shape(0.5)`),
  mood21: reMood('mix', ['리듬 강조', '거울'], `.jux(rev)`),
  mood12: reMood('mix', ['리듬 강조', '깨진'], `.coarse(4)`),
  mood30: reMood('mix', ['리듬 강조', '구멍'], `.degradeBy(0.3)`),
  mood33: reMood('mix', ['리듬 강조', '8비트', '찌그러진'], `.crush(5).shape(0.4)`),
  mood31: reMood('mix', ['드럼 줄임', '말하는'], `.vowel("a")`),
  mood42: reMood('mix', ['드럼 강조', '거울'], `.jux(rev)`),
  // 먹먹 was in nine moods: two of its stacks take a rarer effect instead
  mood5: reMood('texture', ['말하는', '거울'], `.vowel("e").jux(rev)`),
  mood40: reMood('texture', ['8비트', '구멍'], `.crush(5).degradeBy(0.3)`),
};
const reworkMood = (l) => (MOOD_REWORK[l.id] ? { ...l, ...MOOD_REWORK[l.id] } : l);

const NINTH = [...EIGHTH, ...generateScales(EIGHTH, ALT_ORBS_2, 2619)];
// the tenth (line variations) and eleventh (concert percussion) batches go before the EQ orbs, which have ids of their own
const TENTH = [...NINTH, ...generateVariations(NINTH)];
const ELEVENTH = [...TENTH, ...generateAcoustic(TENTH)];
// twelfth batch (chip / ambient / world): see generateVibes
const TWELFTH = [...ELEVENTH, ...generateVibes(ELEVENTH)];

// ---------- thirteenth batch: sound edits ----------
// Orbs made the way the 🎛 편집 panel makes a custom orb: a catalogue orb (`base`) with an edit
// (server/orbEditSpec.mjs keys) on top. The line is the base orb's own generator followed by
// editChain(edit), the exact calls the editor writes, so opening one in the editor reads its knobs
// back. Each orb draws its own notes (it hashes under its own id), keeps the base's instrument for
// drawn variations, and gets a choke group of its own. No tempo knob on pitched lines: .slow(2)
// would pull them off the chord progression. Kind labels carry the words orbTaste.js reads.
// [category, base orb, kind, edit]
const EDIT_ORBS = [
  // ---- supersaw / FM / pulse: the synth knobs
  ['bass', 'bass7', 'bass · reese supersaw wide', { lpq: 6, uni: 7, det: 0.35, spread: 0.9, lfo: 'lpf', lfow: 'sine', lfor: '2', lfolo: 250, lfohi: 1600 }],
  ['bass', 'bass14', 'bass · pwm', { wave: 'pulse', lpf: 900, pw: 0.25, pwrate: 0.5 }],
  ['bass', 'bass64', 'bass · fm growl', { lpf: 1400, shape: 0.4, fm: 6, fmh: 0.5, fmdec: 0.15, fmsus: 0.2 }],
  ['bass', 'bass94', 'bass · fm metal', { lpf: 1800, fm: 8, fmh: 1.41, fmdec: 0.1, fmsus: 0, fmwave: 'square' }],
  ['pad', 'pad18', 'chords · supersaw wall', { hpf: 250, uni: 8, det: 0.45, spread: 1, phr: 0.3, phd: 0.6 }],
  ['pad', 'pad7', 'chords · pwm stabs', { wave: 'pulse', lpf: 2200, pw: 0.2, pwrate: 1, room: 0.4 }],
  ['pad', 'pad27', 'chords · fm keys', { fm: 3, fmh: 3, fmdec: 0.3, fmsus: 0.1 }],
  ['arp', 'arp9', 'arp · pwm pluck', { wave: 'pulse', lpf: 2600, pw: 0.15, pwrate: 2 }],
  ['arp', 'arp17', 'arp · fm pluck', { wave: 'sine', fm: 5, fmh: 2, fmdec: 0.08, fmsus: 0 }],
  ['arp', 'arp65', 'arp · supersaw gate', { wave: 'supersaw', uni: 6, det: 0.25, trem: 0.8, tremr: '16' }],
  ['lead', 'lead53', 'melody · supersaw', { wave: 'supersaw', lpf: 3500, uni: 7, det: 0.3, spread: 0.8 }],
  ['lead', 'lead4', 'melody · pwm vibrato', { wave: 'pulse', pw: 0.3, pwrate: 0.3, vib: 5, vibmod: 0.15 }],
  ['lead', 'lead51', 'melody · fm horn', { wave: 'sine', fm: 2.5, fmh: 1, fmatt: 0.08, fmdec: 0.4, fmsus: 0.5 }],
  ['fx', 'fx15', 'fx · hoover supersaw rise', { penv: 12, patt: 0.3, uni: 8, det: 0.6, spread: 1 }],
  // ---- effects on lines the catalogue already has
  ['bass', 'bass2', 'bass · acid ladder', { lpf: 350, lpq: 17, ftype: 'ladder', drive: 0.8, lpenv: 5, lpd: 0.12, shape: 0.25 }],
  ['lead', 'lead89', 'melody · acid', { lpf: 600, lpq: 16, lpenv: 4, lpd: 0.12, shape: 0.3 }],
  ['bass', 'bass62', 'bass · house pump', { trem: 0.7, tremr: '4' }],
  ['pad', 'pad10', 'chords · trance gate 16', { hpf: 300, trem: 1, tremr: '16' }],
  ['pad', 'pad3', 'chords · dub piano', { lpf: 2500, hpf: 400, room: 0.5, delay: 0.5, dtime: '3/16', dfb: 0.6 }],
  ['pad', 'pad24', 'e-piano · phaser', { apan: 0.6, apr: '2', phr: 0.5, phd: 0.8 }],
  ['bass', 'bass78', 'bass · wah funk finger', { bpq: 3, lfo: 'bpf', lfow: 'sine', lfor: '0.5', lfolo: 400, lfohi: 2500 }],
  ['lead', 'lead6', 'melody · lofi sax', { lpf: 2800, crush: 10, vib: 3, vibmod: 0.2, room: 0.4 }],
  ['lead', 'lead65', 'melody · talkbox', { vowel: 'o', lpq: 4 }],
  ['arp', 'arp12', 'arp · stutter harp', { apan: 0.8, apr: '1', deg: 0.35, ply: 2 }],
  ['arp', 'arp8', 'arp · marimba ping-pong', { jux: 'rev', delay: 0.35, dtime: '3/8', dfb: 0.4 }],
  // ---- chip: bit crush and sample-rate cuts
  ['bass', 'bass17', 'bass · chip crush', { lpf: 4000, crush: 6, coarse: 4 }],
  ['bass', 'bass23', 'bass · chip duty 12%', { wave: 'pulse', pw: 0.12, crush: 7 }],
  ['pad', 'pad8', 'chords · chip crush', { rel: 0.2, crush: 8, coarse: 2 }],
  ['arp', 'arp15', 'arp · chip coarse', { crush: 6, coarse: 8 }],
  ['arp', 'arp66', 'arp · chip duty ratchet', { wave: 'pulse', pw: 0.12, crush: 7, ply: 2 }],
  ['lead', 'lead96', 'melody · chip duty', { wave: 'pulse', pw: 0.25, crush: 7, vib: 6, vibmod: 0.1 }],
  ['lead', 'lead7', 'melody · chip crush', { lpf: 5000, crush: 6, coarse: 3 }],
  ['kick', 'kick', 'kick · chip crush', { pitch: -3, crush: 4, coarse: 4 }],
  ['snare', 'clap', 'snare · chip crush', { hpf: 400, crush: 3, coarse: 6 }],
  ['hat', 'hats', 'hat · chip crush', { crush: 4, coarse: 3 }],
  ['perc', 'perc13', 'perc · chip toms', { pitch: 12, crush: 5, coarse: 4 }],
  ['fx', 'fx5', 'fx · chip glitch zap', { crush: 6, coarse: 8, ply: 2 }],
  ['texture', 'texture1', 'texture · chip rain crush', { crush: 7, coarse: 4 }],
  // ---- ambient: slow attacks, big rooms, long echoes
  ['bass', 'bass12', 'bass · soft sine swell', { att: 0.2, sus: 0.8, rel: 1.2, lpf: 250, room: 0.6, rsize: 6 }],
  ['pad', 'pad12', 'chords · air swell', { att: 1.2, rel: 3, lpf: 900, room: 0.9, rsize: 8 }],
  ['pad', 'pad17', 'chords · glass pad', { wave: 'sine', fm: 1.5, fmh: 4, fmdec: 1, fmsus: 0.2, room: 0.8, rsize: 7 }],
  ['arp', 'arp6', 'arp · glass drift', { room: 0.9, rsize: 8, delay: 0.45, dtime: '3/8', dfb: 0.6 }],
  ['arp', 'arp70', 'arp · soft sine space', { att: 0.03, rel: 0.6, lpf: 2500, apan: 1, apr: '2', room: 0.8, rsize: 6 }],
  ['lead', 'lead1', 'melody · soft long echo', { lpf: 1600, room: 0.8, rsize: 7, delay: 0.5, dtime: '3/8', dfb: 0.65 }],
  ['lead', 'lead58', 'melody · glass bells', { fm: 6, fmh: 3.5, fmdec: 0.6, room: 0.8, delay: 0.4, dfb: 0.55 }],
  ['lead', 'lead3', 'melody · soft air triangle', { wave: 'triangle', att: 0.1, rel: 0.8, lpf: 1800, vib: 4, vibmod: 0.2, room: 0.8, rsize: 6 }],
  ['kick', 'kickBroken', 'kick · soft dub space', { lpf: 250, room: 0.6, rsize: 6, delay: 0.35, dtime: '3/16', dfb: 0.45 }],
  ['snare', 'snare9', 'snare · dub snap in a big space', { hpf: 300, room: 0.85, rsize: 8, rlp: 4000 }],
  ['hat', 'hat20', 'hat · dub air shimmer', { hpf: 7000, apan: 1, apr: '4', room: 0.8, rsize: 7, deg: 0.45 }],
  ['perc', 'perc3', 'perc · dub space echo', { lpf: 2500, room: 0.7, rsize: 6, delay: 0.5, dtime: '3/16', dfb: 0.6 }],
  ['texture', 'texture8', 'texture · drift drone', { uni: 8, det: 0.6, lfo: 'lpf', lfow: 'perlin', lfor: '16', lfolo: 200, lfohi: 1200, room: 0.9, rsize: 9 }],
  ['fx', 'fx1', 'fx · space swell', { room: 0.8, rsize: 8, delay: 0.4, dtime: '1/4', dfb: 0.6 }],
  // ---- more for the small vibes
  ['pad', 'pad1', 'chords · chip square crush', { wave: 'square', att: 0.01, rel: 0.3, crush: 8, coarse: 3 }],
  ['lead', 'lead11', 'melody · chip duty 12%', { wave: 'pulse', pw: 0.12, crush: 6, coarse: 2 }],
  ['perc', 'perc4', 'perc · chip blips', { pitch: 7, crush: 4, coarse: 6 }],
  ['bass', 'bass18', 'bass · soft triangle drift', { att: 0.1, sus: 0.7, rel: 1.5, room: 0.7, rsize: 6, delay: 0.3, dtime: '3/8', dfb: 0.4 }],
  ['pad', 'pad6', 'chords · soft drift pad', { wave: 'triangle', att: 0.8, rel: 2.5, lpf: 1200, apan: 0.6, apr: '4', room: 0.9, rsize: 8 }],
  ['arp', 'arp14', 'arp · soft sine echo', { wave: 'sine', att: 0.02, lpf: 2000, room: 0.85, rsize: 7, delay: 0.5, dtime: '3/8', dfb: 0.6 }],
  ['texture', 'texture7', 'texture · wide hum space', { apan: 1, apr: '4', room: 0.9, rsize: 9 }],
];
function generateEdits(existing) {
  const r = rng(2623);
  const byBase = Object.fromEntries(existing.map((l) => [l.id, l]));
  const used = new Set(existing.map((l) => l.name));
  const name = (cat) => {
    const nouns = NOUNS[cat].split(' ');
    for (let k = 0; k < 500; k++) {
      const n = `${r.pick(ADJ)} ${r.pick(nouns)}`;
      if (!used.has(n)) {
        used.add(n);
        return n;
      }
    }
    return `${r.pick(ADJ)} ${r.pick(nouns)} ${used.size}`;
  };
  const color = (cat) => {
    const [h0, h1, sat, l] = HUES[cat];
    return hex((h0 + r() * ((h1 - h0 + 360) % 360)) % 360, sat + r.int(-10, 10), l + r.int(-8, 8));
  };
  const next = {};
  const nextId = (cat) => {
    next[cat] ??= Math.max(0, ...existing.map((l) => (l.cat === cat && /\d+$/.exec(l.id)?.[0]) || 0).map(Number));
    return `${cat}${++next[cat]}`;
  };
  return EDIT_ORBS.map(([cat, from, kind, e]) => {
    const b = byBase[from];
    if (!b?.code || b.cat !== cat) throw new Error(`edit orb: no ${cat} orb ${from}`);
    // the base as generated, before TRIM (the level trims below give this orb its own)
    const c0 = b.code, own = typeof c0 === 'function' ? c0 : () => c0;
    // a choke group of its own (sharing the base's would cut one off when both play)
    const cut = /\.cut\(\d+\)/.test(own(rng(1))) ? choke() : '';
    const recut = (s) => (cut ? s.replace(/\.cut\(\d+\)/g, cut) : s);
    const sample = own(rng(1));
    const chain = editChain(cleanEdit(e), kindOf(b, sample));
    return {
      id: nextId(cat), cat, name: name(cat), color: color(cat), tag: 'edits', kind, from, recipe: cleanEdit(e),
      ...(b.samples && { samples: b.samples }),
      code: (v) => recut(own(v)) + chain,
      ...(b.voice && { voice: { ...b.voice, sound: recut(b.voice.sound) + chain } }),
    };
  });
}
export const LAYERS = [...TWELFTH, ...generateEdits(TWELFTH), ...EQ_ORBS, ...SINGLE_MOODS].map(reworkMood);

// Level trims from tools/orb-levels.html: every sound orb rendered alone (4 bars at 124 BPM,
// variation seeds 1-3) and its K-weighted loudness (LUFS) matched to the median of its category,
// or to the target it names with `level` (block FX follow the kick). Orbs within 2 dB are left as
// they are; corrections are capped at x20 / x0.1, so a few very quiet recordings (marimba, guiro,
// concert bass drum) stay a little under the median. Rerun the tool after changing sounds, the
// generator seeds or adding orbs, and paste what it prints.
export const TRIM = {
  // perc24 (tom_mallet) was silent until samples.js fixed the sample paths
  perc20: 2.34, perc24: 12.6,
  kick: 0.73, tabla: 1.35, amen: 2.35, rollBass: 1.45, acid: 0.7, sub: 0.53, piano: 0.64, arp: 2.24,
  lead: 1.84, ghost: 0.59, riser: 1.58, crackle: 1.35, kick1: 12.21, kick2: 0.39, kick3: 0.55, kick5: 20,
  kick6: 0.29, kick7: 14.13, kick8: 20, kick9: 0.67, kick10: 0.68, kick12: 1.5, kick14: 1.58, kick15: 0.79,
  kick18: 1.54, snare1: 0.55, snare2: 1.64, snare3: 0.58, snare5: 1.88, snare8: 1.49, snare9: 0.61,
  snare12: 0.64, snare13: 2.03, snare14: 1.58, snare15: 2.08, hat1: 0.65, hat2: 16.05, hat5: 0.67,
  hat7: 1.94, hat8: 0.63, hat9: 15.13, hat10: 0.48, hat11: 1.31, hat12: 11.71, hat13: 1.67, hat15: 0.74,
  hat16: 12.28, hat17: 16.26, hat18: 0.51, perc2: 4.5, perc3: 0.77, perc4: 1.47, perc7: 3.77, perc8: 0.65,
  perc10: 13.02, perc11: 1.34, perc12: 0.69, perc14: 0.78, perc15: 1.46, perc16: 0.96, perc17: 3.65,
  perc18: 0.5, bass3: 1.49, bass4: 2.21, bass6: 1.41, bass7: 2.21, bass10: 0.32, bass12: 0.48, bass13: 0.43,
  bass14: 1.59, bass15: 2.27, bass18: 0.72, bass19: 1.35, bass21: 1.55, bass23: 0.66, bass24: 0.55,
  bass26: 0.52, bass27: 0.63, pad2: 20, pad3: 0.62, pad5: 16.83, pad8: 0.49, pad10: 1.59, pad11: 20,
  pad12: 1.46, pad13: 0.52, pad16: 1.4, pad17: 0.35, arp1: 1.6, arp3: 0.32, arp4: 1.45, arp5: 0.46,
  arp6: 0.74, arp8: 19.91, arp9: 2.47, arp10: 0.31, arp11: 0.46, arp12: 1.35, arp13: 0.45, arp14: 2.3,
  arp15: 1.35, arp17: 2.89, arp18: 0.49, lead1: 0.56, lead4: 2.73, lead5: 1.99, lead6: 0.83, lead7: 1.47,
  lead9: 0.91, lead10: 0.62, lead11: 2.43, lead12: 0.61, lead14: 0.64, lead16: 0.63, lead17: 1.33, fx1: 1.11,
  fx2: 1.5, fx3: 1.37, fx4: 0.27, fx5: 2.11, fx8: 1.51, fx9: 0.28, texture1: 4.23, texture2: 4.38,
  texture3: 0.28, texture4: 2.05, texture5: 0.68, texture6: 0.19, texture7: 0.93, texture8: 0.13,
  texture9: 2.92, kick20: 1.81, kick22: 1.49, kick23: 0.44, kick24: 1.79, snare20: 0.74, snare21: 0.34,
  hat19: 0.57, hat20: 1.32, hat21: 0.51, perc19: 2.1, perc23: 12.97, perc21: 1.37, perc22: 8.08, perc25: 7.91,
  perc27: 13.58, perc28: 8.89, perc29: 20, perc30: 1.23, perc31: 1.4, perc32: 6.65, bass28: 1.65,
  bass29: 0.75, bass30: 3.37, bass31: 3.13, pad20: 2.79, pad21: 2.3, arp19: 5.27, arp20: 0.33, arp21: 0.39,
  arp25: 0.31, arp26: 19.99, lead20: 0.69, lead22: 4.07, lead26: 3.09, lead27: 3.99, fx10: 1.92, fx13: 0.71,
  fx14: 2.45, fx15: 1.69, fx16: 2.45, fx17: 0.13, fx18: 0.27, fx19: 3.04, fx20: 8.67, fx21: 8.35,
  texture10: 0.52, texture11: 6.03, texture12: 0.25, texture13: 0.35, snare27: 1.47, hat26: 0.72,
  hat27: 0.75, hat29: 2.75, perc34: 0.77, perc35: 0.63, perc36: 0.75, perc37: 0.44, fx23: 0.34, fx24: 0.71,
  fx25: 0.27, fx26: 1.28, fx28: 0.38, fx31: 1.35, kick27: 0.73, bass32: 0.52, bass33: 0.58, bass34: 0.61,
  bass35: 0.53, bass36: 0.64, bass37: 0.51, pad24: 0.74, pad25: 0.64, pad26: 0.74,
  // other-scale batch
  bass38: 1.83, bass40: 0.7, bass41: 1.6, bass43: 2.06, bass44: 1.54, bass47: 2.11, bass50: 2.14, arp28: 1.83, arp29: 1.49,
  arp30: 0.76, arp31: 3.35, arp34: 0.18, arp35: 0.46, arp36: 2.58, arp37: 0.26, lead29: 0.25, lead30: 1.89, lead31: 0.76,
  lead33: 0.79, lead34: 0.18, lead35: 0.12, lead36: 0.45, lead37: 0.16, lead38: 2.29,
  // second other-scale batch
  bass51: 1.75, bass52: 0.73, bass53: 0.49, bass56: 1.62, bass57: 0.74, bass59: 1.93, arp40: 0.3, arp41: 4.11, arp42: 1.47,
  arp43: 16.96, arp44: 8.45, arp46: 0.51, arp47: 0.59, arp48: 0.65, arp49: 3.19, lead39: 1.49, lead40: 0.13, lead41: 0.18,
  lead42: 0.4, lead43: 0.78, lead44: 2.02, lead46: 0.24, lead47: 2.96, lead48: 1.27,
  // line-variation batch (trims are capped at x20, so the marimba pad starts from a higher gain)
  bass62: 0.69, bass64: 1.3, bass66: 0.67, bass67: 1.37, bass68: 1.38, bass69: 1.73, bass70: 2.89, bass71: 1.89, bass73: 0.41,
  bass74: 1.29, bass75: 0.73, bass77: 0.29, bass79: 1.95, bass81: 5.03, bass82: 0.55, bass83: 4.29, bass84: 1.66, bass85: 1.77,
  bass88: 3.88, bass92: 0.5, bass93: 4.44, bass95: 1.68, bass96: 1.82, bass97: 0.56, pad28: 2.83, pad29: 1.75, pad34: 3.78,
  pad36: 3.65, pad37: 0.78, pad39: 5.93, pad40: 0.62, pad41: 20, pad42: 1.83, pad43: 1.96, pad44: 1.45, pad45: 1.3, pad47: 0.47,
  pad48: 2.57, arp50: 6.23, arp51: 20, arp53: 2.22, arp54: 1.36, arp55: 0.67, arp56: 0.47, arp57: 0.67, arp58: 0.71, arp59: 1.71,
  arp60: 0.7, arp61: 2.51, arp62: 3.41, arp63: 3.37, arp64: 1.35, arp65: 1.81, arp66: 1.34, arp67: 0.63, arp69: 1.92, arp70: 0.62,
  arp71: 2.95, arp72: 1.93, lead49: 0.51, lead50: 1.77, lead51: 1.71, lead52: 0.39, lead53: 2.16, lead54: 1.72, lead56: 0.59,
  lead57: 0.49, lead59: 11.37, lead60: 0.56, lead63: 0.6, lead65: 1.53, lead66: 2.56, lead69: 0.42, lead70: 2.45, lead72: 1.59,
  lead73: 0.46, lead75: 1.92, lead76: 0.6, lead77: 2.04, lead78: 0.51, lead79: 2.15, lead80: 3.67, lead81: 1.47, lead82: 2.39,
  lead83: 20, lead84: 2.26, lead86: 2.42, lead87: 1.49, lead88: 9.12, lead89: 1.52, lead90: 2.78, lead92: 2.15, lead94: 0.55,
  lead95: 0.69, lead98: 2.09,
  // sound-edit batch (measured from the base orbs' untrimmed lines, so these trims stand alone)
  bass105: 2, bass106: 1.94, bass107: 0.56, pad58: 1.58, pad59: 0.76, arp82: 3.7, arp83: 1.9, arp84: 4.26, lead107: 2.55,
  lead108: 3.43, fx51: 1.81, lead110: 0.45, pad60: 3.14, pad61: 0.48, pad62: 1.61, bass111: 2.73, lead111: 0.74, lead112: 3.58,
  arp85: 1.41, arp86: 14.3, bass113: 1.56, pad63: 0.52, arp88: 2.42, lead113: 2.61, lead114: 1.29, kick38: 0.64, perc59: 1.36,
  fx52: 1.33, texture28: 4.78, bass114: 0.25, pad64: 2.5, pad65: 0.27, arp89: 0.63, arp90: 0.43, lead115: 0.41, kick39: 0.51,
  hat48: 2.36, perc60: 0.64, texture29: 0.18, pad66: 0.55, lead118: 3.28, perc61: 1.97, bass115: 0.22, pad67: 2.03, arp91: 1.28,
};
// perc20 drew the mallet roll (tom_mallet:6). Its Euclidean rhythm cuts each roll off before it swells,
// which went unnoticed while tom_mallet failed to load (samples.js); it plays the hardest mallet hit instead.
{
  const l = LAYERS.find((x) => x.id === 'perc20'), code = l.code, hit = (str) => str.replace('tom_mallet:6', 'tom_mallet:4');
  l.code = (v) => hit(code(v));
  l.voice = { ...l.voice, sound: hit(l.voice.sound) };
  l.samples = l.samples.map(hit);
}
// scale the last plain .gain(n) of a line; lines whose gain is a pattern get a velocity instead
const scaleGain = (code, t) => {
  const m = [...code.matchAll(/\.gain\((\d*\.?\d+)\)/g)].at(-1);
  return m ? `${code.slice(0, m.index)}.gain(${+(m[1] * t).toFixed(3)})${code.slice(m.index + m[0].length)}` : `${code}.velocity(${t})`;
};
for (const l of LAYERS) {
  const t = TRIM[l.id];
  if (!t) continue;
  const base = l.code;
  l.code = typeof base === 'function' ? (v) => scaleGain(base(v), t) : scaleGain(base, t);
  if (l.voice) l.voice = { ...l.voice, sound: scaleGain(l.voice.sound, t) };
}


// ---------- spawn balance ----------
// Falling orbs are drawn in two steps so the catalogue can keep growing without tipping the mix:
// 1. a category, by a fixed share (CAT_SHARE: the category sizes before the catalogue started
//    growing again), so adding orbs to one category never makes it fall more often;
// 2. inside it, a sound family (the machine or instrument an orb is played on), each weighted by
//    the square root of its size: a family with more orbs comes up somewhat more often, but a
//    big new set can't crowd out the others. Inside a family every orb is equally likely.
export const CAT_SHARE = {
  kick: 28, snare: 29, hat: 31, perc: 39, bass: 34, pad: 23, arp: 28, lead: 29, fx: 27, texture: 14,
  combo: 87, mood: 50, mode: 24, tempo: 20,
};
// sampled pitched instruments that count as one family each, by sample name
const INSTRUMENT_FAMILY = {
  swagbass: 'bass guitar', growlybass: 'bass guitar', uprightbass: 'upright bass', wurli: 'wurlitzer', piano: 'piano',
  organ_4inch: 'organ', organ_8inch: 'organ', organ_full: 'organ', pipeorgan_quiet: 'organ', pipeorgan_loud: 'organ', pipeorgan_quiet_pedal: 'organ',
};
const MACHINES = ['TR909', 'TR808', 'TR707', 'TR606', 'TR727', 'RD6'];
function familyOf(l) {
  // EQ orbs fall as their own family inside the moods (√size weighting, see above)
  if (l.eq) return 'eq';
  if (!DRUM_CATS.includes(l.cat) && !PITCHED_CATS.includes(l.cat) && !['fx', 'texture'].includes(l.cat)) return l.cat;
  if (l.spot) return 'block fx';
  // the other-scale orbs fall as one family per category, whatever they are played on; spawnWeights
  // (src/orbs.js) holds that family at 30% of its category however many are added (less after
  // turn-downs, see scaleKeep in orbTaste.js)
  if (l.scaleFamily) return 'other scales';
  const code = typeof l.code === 'function' ? l.code(rng(1)) : l.code ?? '';
  const text = `${(l.samples ?? []).join(' ')} ${code}`;
  const machine = MACHINES.find((m) => text.includes(m));
  if (machine) return machine;
  if (text.includes('kitbreak')) return 'kitbreak';
  if (/Kit_|bank\("Kit"\)/.test(text)) return 'kit';
  const inst = Object.keys(INSTRUMENT_FAMILY).find((k) => new RegExp(`s\\("${k}"|^${k}\\b`).test(code) || (l.samples ?? []).includes(k));
  if (inst) return INSTRUMENT_FAMILY[inst];
  if (/\bz_\w+/.test(text)) return 'zzfx';
  if (l.samples?.length) return 'sampled';
  return 'synth';
}

export const byId = Object.fromEntries(LAYERS.map((l) => [l.id, l]));
for (const l of LAYERS) {
  if (l.combo) l.colors = l.combo.map((id) => byId[id].color ?? byId[id].colors[0]);
  l.drum = DRUM_CATS.includes(l.cat);
  l.pitched = PITCHED_CATS.includes(l.cat);
  l.family = familyOf(l);
}
// Names are made in Korean and stay the orb's real name (nameKo, kindKo); `name` and `kind`
// read back in the language the page is set to (src/orbNames.js has the translations).
export function localizeNames(l) {
  if (Object.hasOwn(l, 'nameKo')) return l;
  const nameKo = l.name, kindKo = l.kind;
  Object.defineProperties(l, {
    nameKo: { value: nameKo },
    kindKo: { value: kindKo },
    name: { get: () => orbNameIn(nameKo, getLang()), enumerable: true, configurable: true },
    kind: { get: () => orbKindIn(kindKo, getLang()), enumerable: true, configurable: true },
  });
  return l;
}
LAYERS.forEach(localizeNames);
export const role = (l) => l.role ?? l.cat;
export const ROLE_TEXT = {
  kick: '킥 드럼', snare: '스네어/클랩', hat: '하이햇', perc: '퍼커션', bass: '베이스', pad: '코드 반주',
  arp: '아르페지오', lead: '멜로디', fx: '효과음', texture: '효과음', tempo: '템포', mood: '전체 분위기',
};

