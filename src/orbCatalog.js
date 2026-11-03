// The orb catalogue: the shared music frame (key, chords, generators) and every orb.
// About 30 orbs are hand-made; the rest are built from a fixed seed so their ids, names
// and sounds stay the same between visits (saved presets refer to them by id).
import { getLang } from './i18n.js';
import { orbNameIn, orbKindIn } from './orbNames.js';

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
// to every line, or `mute` for the drums).
export const DRUM_CATS = ['kick', 'snare', 'hat', 'perc'];
export const PITCHED_CATS = ['bass', 'pad', 'arp', 'lead'];
export const speedOf = (d) => (2 ** ((d - 7) / 7)).toFixed(2);
export const melodic = (root, sound, snapTo = 'tones') => ({ ctrl: 'n', root, legato: true, snap: snapTo, sound });
export const drum = (sound, ctrl = 'speed', map = speedOf) => ({ ctrl, map, sound });

const HANDMADE = [
  { id: 'kick', cat: 'kick', kind: 'kick', name: '심장 뛰는 쿵쿵', color: '#ff4d6d',
    samples: ['TR909_bd'],
    code: (r) => `s("${r.pick(['bd*4', 'bd*4', 'bd bd bd [bd ~ ~ bd]', 'bd bd bd <bd [~ bd]>'])}").bank("TR909").gain(.62)`,
    voice: drum(`.s("bd").bank("TR909").gain(.6)`) },
  { id: 'kickBroken', cat: 'kick', kind: 'kick', name: '비틀거리는 발걸음', color: '#ff7a45',
    samples: ['TR909_bd'],
    code: (r) => `s("bd").struct("${r.pick(['x ~ ~ x ~ ~ x ~ ~ ~ x ~ ~ x ~ ~', 'x ~ ~ ~ ~ ~ x ~ ~ ~ x ~ ~ ~ ~ ~', 'x ~ ~ x ~ ~ ~ ~ x ~ x ~ ~ ~ ~ ~', 'x ~ x ~ ~ ~ x ~ ~ x ~ ~ ~ ~ x ~'])}").bank("TR909").gain(.62)`,
    voice: drum(`.s("bd").bank("TR909").lpf(2500).gain(.6)`) },
  { id: 'clap', cat: 'snare', kind: 'clap', name: '찰싹! 손뼉 파티', color: '#ffd23f',
    samples: ['TR909_cp'],
    code: (r) => `s("${r.pick(['~ cp ~ cp', '~ cp ~ [cp ~ ~ cp]', '~ cp ~ <cp [cp cp]>'])}").bank("TR909").gain(.42).room(.2)`,
    voice: drum(`.s("cp").bank("TR909").room(.2).gain(.4)`) },
  { id: 'lofiSnare', cat: 'snare', kind: 'snare', name: '먼지 낀 낮잠', color: '#c9a66b',
    samples: ['Kit_sd:5'],
    code: (r) => `s("${r.pick(['~ Kit_sd:5 ~ [Kit_sd:5 ~ ~ Kit_sd:5?]', '~ Kit_sd:5 ~ Kit_sd:5', '~ Kit_sd:5 [~ Kit_sd:5?] Kit_sd:5'])}").gain(.38).lpf(3200).room(.35)`,
    voice: drum(`.s("Kit_sd:5").lpf(3200).room(.35).gain(.38)`) },
  { id: 'hats', cat: 'hat', kind: 'hihat', name: '잘게 부서진 반짝이', color: '#d8f3ff',
    samples: ['TR909_hh'],
    code: (r) => `s("${r.pick(['hh*16', 'hh*8', '[hh hh ~ hh]*4', '[~ hh]*8'])}").bank("TR909").gain(perlin.range(.18,.42)).hpf(5000).pan(sine.range(.35,.65).slow(4))`,
    voice: drum(`.s("hh").bank("TR909").hpf(5000).gain(.34)`) },
  { id: 'openHat', cat: 'hat', kind: 'open hat', name: '들썩이는 어깨', color: '#9be7ff',
    samples: ['TR909_oh'],
    code: `s("~ oh ~ oh ~ oh ~ oh").bank("TR909").gain(.24).hpf(4000)`,
    voice: drum(`.s("oh").bank("TR909").hpf(4000).gain(.24)`) },
  { id: 'tabla', cat: 'perc', kind: 'percussion', name: '정글의 수다쟁이', color: '#7bd389',
    samples: Array.from({ length: 7 }, (_, i) => `TR727_perc:${i}`),
    code: (r) => `s("TR727_perc").struct("x(${r.int(3, 7)},16,${r.int(0, 4)})").n(irand(7)).pan(rand).gain(.34).room(.25)`,
    voice: drum(`.s("TR727_perc").room(.25).gain(.34)`, 'n', (d) => d % 15) },
  { id: 'amen', cat: 'perc', kind: 'breakbeat', name: '폭주하는 드럼통', color: '#e85d04',
    samples: Array.from({ length: 32 }, (_, i) => `kitbreak:${i}`),
    code: (r) => `n("${Array.from({ length: 16 }, (_, i) => (r.chance(0.3) ? r.int(0, 31) : r.chance(0.12) ? `[${i} ${i}]` : i)).join(' ')}").s("kitbreak").cut(1).hpf(180).gain(.38)`,
    voice: drum(`.s("kitbreak").cut(1).hpf(180).gain(.38)`, 'n', (d) => d * 2) },
  { id: 'rollBass', cat: 'bass', kind: 'bass', name: '꿈틀대는 지렁이', color: '#b5179e',
    code: (r) => `n(${bassLine(r, ['0111011101110111', '1011101110111011', '0101010101010101', '0111010101110101'], [0, 0, 0, 0, 7, 4])}).scale("A1:minor")
  .s("sawtooth").lpf(650).lpenv(2).lpd(.1).decay(.15).sustain(0).gain(.34)`,
    voice: melodic('A1', `.s("sawtooth").lpf(800).lpenv(2).lpd(.1).decay(.2).sustain(.4).release(.05).gain(.32)`, 'triad') },
  { id: 'acid', cat: 'bass', kind: 'acid', name: '격렬한 바나나', color: '#f9e900',
    code: (r) => `n(${bassLine(r, ['1111111111111111', '1101111011011110', '1011101110111011', '1111011111110110'], [0, 0, 0, 7, 7, 4, 2])}).scale("A1:minor")
  .s("sawtooth").lpf(sine.range(300,3000).slow(8)).lpq(15).lpenv(3).lpd(.12)
  .decay(.18).sustain(.15).shape(.35).gain(.26)`,
    voice: melodic('A1', `.s("sawtooth").lpf(sine.range(400,3000).slow(8)).lpq(15).lpenv(3).lpd(.12).decay(.18).sustain(.25).shape(.35).gain(.24)`, 'triad') },
  { id: 'sub', cat: 'bass', kind: 'sub bass', name: '땅속 고래의 하품', color: '#3a0ca3', glow: '#8f7bff',
    code: (r) => `n(${bassLine(r, ['1000001000100000', '1000000010000000', '1000001000000010', '1001000000100000'], [0])}).scale("A1:minor")
  .s("sine").decay(.6).sustain(.6).release(.2).lpf(220).gain(.6)`,
    voice: melodic('A1', `.s("sine").lpf(240).sustain(.9).release(.15).gain(.55)`, 'triad') },
  { id: 'pad', cat: 'pad', kind: 'pad', name: '구름 위 솜사탕', color: '#ffafcc',
    code: (r) => r.chance(0.5)
      ? `chord("${PROG}").voicing().s("supersaw").attack(.5).release(1.5).lpf(1500).room(.8).roomsize(6).gain(.1)`
      : `chord("${PROG}").voicing().struct("${r.pick(['x ~ ~ x ~ ~ x ~', 'x ~ x ~', '[~ x]*2'])}").s("supersaw").attack(.05).release(.6).lpf(1700).room(.7).roomsize(5).gain(.1)`,
    voice: melodic('A3', `.s("supersaw").attack(.06).release(.8).lpf(1800).room(.6).roomsize(5).gain(.11)`) },
  { id: 'piano', cat: 'pad', kind: 'piano', name: '새벽 세 시의 고백', color: '#f1faee',
    samples: ['piano'],
    code: (r) => `chord("${PROG}").voicing().struct("${r.pick(['~ x ~ [x ~ ~ x]', 'x ~ ~ x ~ ~ x ~', '[~ x]*4', 'x ~ [~ x] ~', '~ [x x] ~ x'])}").s("piano").clip(1).room(.5).gain(.34)`,
    voice: melodic('A3', `.s("piano").clip(1).room(.45).gain(.4)`) },
  { id: 'arp', cat: 'arp', kind: 'arpeggio', name: '빙글빙글 회전목마', color: '#4cc9f0',
    code: (r) => `n(${arpLine(r, 0, 14)}).scale("A3:minor").s("square").decay(.12).sustain(0)
  .lpf(sine.range(900,3500).slow(8)).delay(.3).delaytime(__DT__).pan(sine.fast(2)).gain(.1)`,
    voice: melodic('A3', `.s("square").decay(.15).sustain(.25).lpf(2800).delay(.25).delaytime(__DT__).gain(.11)`) },
  { id: 'bells', cat: 'arp', kind: 'fm bells', name: '유리구슬 빗방울', color: '#a0c4ff',
    code: (r) => `n(${melody(r, { slots: 8, density: 0.4, lo: 0, hi: 9 })}).scale("A4:minor").s("sine").fm(4).fmh(2.01)
  .decay(.3).sustain(0).delay(.4).delaytime(__DT__).delayfeedback(.5).room(.5).pan(rand).gain(.17)`,
    voice: melodic('A4', `.s("sine").fm(4).fmh(2.01).decay(.4).sustain(.1).delay(.3).delaytime(__DT__).room(.4).gain(.17)`) },
  { id: 'lead', cat: 'lead', kind: 'lead', name: '하늘 나는 오징어', color: '#06d6a0',
    code: (r) => `n(${melody(r, { slots: 8, density: 0.55, lo: 0, hi: 9, hold: 0.3 })}).scale("A4:minor")
  .s("sawtooth").lpf(2400).decay(.2).sustain(.4).release(.3).room(.4).delay(.3).delaytime(__DT__).gain(.12)`,
    voice: melodic('A4', `.s("sawtooth").lpf(2600).decay(.2).sustain(.5).release(.2).room(.3).delay(.25).delaytime(__DT__).gain(.12)`) },
  { id: 'ghost', cat: 'lead', kind: 'whistle', name: '휘파람 부는 유령', color: '#cdb4db',
    code: (r) => `n(${melody(r, { slots: 4, density: 0.75, lo: 2, hi: 9, hold: 0.6 })}).scale("A4:minor")
  .s("triangle").attack(.08).release(.8).vib(5).vibmod(.25).room(.7).roomsize(5).gain(.16)`,
    voice: melodic('A4', `.s("triangle").attack(.04).release(.4).vib(5).vibmod(.25).room(.6).gain(.18)`) },
  { id: 'riser', cat: 'fx', kind: 'riser', name: '우주행 엘리베이터', color: '#f72585',
    code: `s("white*16").decay(.08).sustain(0).gain(saw.range(.04,.2).slow(8)).hpf(saw.range(400,9000).slow(8))`,
    voice: drum(`.s("white").decay(.07).sustain(0).gain(.12)`, 'hpf', (d) => Math.round(300 * 2 ** (d / 3))) },
  { id: 'crackle', cat: 'texture', kind: 'texture', name: '낡은 레코드의 한숨', color: '#8d99ae',
    code: `s("white*16").degradeBy(.6).decay(.02).sustain(0).hpf(3000).gain(rand.range(.02,.09))`,
    voice: drum(`.s("white").decay(.02).sustain(0).gain(.1)`, 'hpf', (d) => Math.round(500 * 2 ** (d / 4))) },

  { id: 'slow', cat: 'tempo', kind: 'tempo ↓ 96', name: '느릿느릿 블랙홀', color: '#15151c', glow: '#c9c9ff', dark: true, bpm: 96 },
  { id: 'fast', cat: 'tempo', kind: 'tempo ↑ 148', name: '새하얀 폭주기관차', color: '#ffffff', bpm: 148 },

  { id: 'comboDrums', cat: 'combo', kind: 'combo · 3', name: '풀코스 드럼 세트', combo: ['kick', 'clap', 'hats'] },
  { id: 'comboDrive', cat: 'combo', kind: 'combo · 3', name: '한밤의 고속도로', combo: ['sub', 'pad', 'bells'] },
  { id: 'comboAcid', cat: 'combo', kind: 'combo · 4', name: '애시드 폭주족', combo: ['kick', 'acid', 'openHat', 'riser'] },
  { id: 'comboCafe', cat: 'combo', kind: 'combo · 4', name: '비 오는 날 다락방', combo: ['lofiSnare', 'piano', 'crackle', 'ghost'] },

  { id: 'underwater', cat: 'mood', kind: 'mood · all', name: '물속에 잠긴 도시', colors: ['#00b4d8', '#0077b6', '#90e0ef'],
    fx: `.lpf(650).room(.5)` },
  { id: 'radio', cat: 'mood', kind: 'mood · all', name: '고장 난 라디오', colors: ['#ff006e', '#8338ec', '#ffbe0b'],
    fx: `.crush(5).coarse(3)` },
  { id: 'cave', cat: 'mood', kind: 'mood · all', name: '메아리 동굴 탐험', colors: ['#7209b7', '#4361ee', '#4cc9f0'],
    fx: `.room(.9).roomsize(9)` },
  { id: 'dizzy', cat: 'mood', kind: 'mood · all', name: '술 취한 메아리', colors: ['#ffbe0b', '#fb5607', '#ff006e'],
    fx: `.pan(sine.fast(2)).delay(.45).delaytime(__DT__).delayfeedback(.6)` },
  { id: 'breathe', cat: 'mood', kind: 'mood · no drums', name: '잠깐 숨 고르기', colors: ['#f8f9fa', '#adb5bd', '#06d6a0'],
    mute: DRUM_CATS },
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
const MOOD_MUTES = [
  { mute: DRUM_CATS, label: 'no drums' },
  { mute: ['bass', 'pad', 'arp', 'lead', 'fx', 'texture'], label: 'drums only' },
  { mute: ['bass'], label: 'no bass' },
  { mute: ['lead', 'arp'], label: 'no melody' },
  { mute: ['pad', 'arp', 'lead', 'texture'], label: 'bass + drums' },
];

const COMBO_TEMPLATES = [
  ['kick', 'snare', 'hat'], ['kick', 'bass', 'hat'], ['pad', 'lead', 'texture'], ['kick', 'snare', 'bass', 'pad'], ['arp', 'lead', 'pad'],
  ['kick', 'bass', 'fx', 'hat'], ['perc', 'bass', 'arp'], ['snare', 'hat', 'perc'], ['bass', 'pad'], ['kick', 'snare', 'hat', 'bass', 'lead'],
];

// [hue from, hue to, saturation, lightness] per category
const HUES = {
  kick: [340, 20, 70, 55], snare: [38, 62, 90, 60], hat: [175, 215, 70, 82], perc: [85, 150, 55, 55], bass: [265, 320, 70, 50],
  pad: [315, 350, 80, 80], arp: [190, 232, 80, 65], lead: [150, 178, 75, 50], fx: [320, 345, 85, 58], texture: [200, 230, 12, 60],
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

  // moods: one or two effects on everything, sometimes with part of the band muted
  for (let i = 0; i < count((l) => l.cat === 'mood'); i++) {
    const picks = r.shuffle(MOOD_FX).filter((f, k, arr) => arr.findIndex((g) => g.slot === f.slot) === k).slice(0, r.pick([1, 1, 2]));
    const mute = r.chance(0.2) ? r.pick(MOOD_MUTES) : null;
    out.push({
      id: `mood${i + 1}`, cat: 'mood', name: name('mood'),
      colors: Array.from({ length: 3 }, () => hex(r() * 360, 75 + r.int(0, 20), 55 + r.int(0, 15))),
      kind: `mood · ${mute ? mute.label : picks.map((p) => p.word).join('+')}`,
      fx: picks.map((p) => p.make(r)).join(''), mute: mute?.mute,
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
// mridangam strokes (yaxu/mrid, loaded by the orb page from dough-samples' mridangam.json)
const MRIDANGAM = { ta: 9, ki: 7, na: 12, thom: 7, dhin: 8, dhi: 7, tha: 7, gumki: 14, chaapu: 13, nam: 8, ka: 12 };

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
      ...Object.entries(MRIDANGAM).map(([k, n]) => indexed(k, n, 'mridangam'))],
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

const FIRST = [...HANDMADE, ...generateOrbs(HANDMADE)];
const SECOND = [...FIRST, ...generateMore(FIRST)];
const THIRD = [...SECOND, ...MODE_ORBS, ...generateModeCombos(SECOND)];
export const LAYERS = [...THIRD, ...generateMachines(THIRD)];

// Level trims, measured in the browser: each orb played alone, peak level compared with the
// median of its category. Orbs far quieter (some were next to silent) or far louder than their
// neighbours are scaled toward it; nothing ends up below an audible floor. Re-measure after
// changing sounds or the generator seed.
const TRIM = {
  crackle: 1.35, kick1: 5, kick8: 5, hat17: 5, perc16: 1.95, perc17: 3.65, perc18: 4.94, pad11: 3.33,
  pad12: 5, arp9: 1.43, arp10: 0.59, arp15: 1.35, arp17: 1.17, lead4: 1.21, lead5: 1.37, lead6: 1.27, lead9: 1.56, lead10: 1.63,
  lead11: 1.19, fx1: 1.72, texture1: 3.18, texture2: 4.38, texture4: 1.4, texture5: 0.4, texture6: 0.4, texture7: 2.92,
  texture8: 2.19, texture9: 2,
};
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


export const byId = Object.fromEntries(LAYERS.map((l) => [l.id, l]));
for (const l of LAYERS) {
  if (l.combo) l.colors = l.combo.map((id) => byId[id].color ?? byId[id].colors[0]);
  l.drum = DRUM_CATS.includes(l.cat);
  l.pitched = PITCHED_CATS.includes(l.cat);
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
  arp: '아르페지오', lead: '멜로디', fx: '효과음', texture: '질감', tempo: '템포', mood: '전체 분위기',
};

