// What the Teto vocal words say, for the word picker (✎ 단어 in the 변주 slot, src/orbs/slots.js):
// for each sung line (tools/vocals/make_ustx.py), the meaning of each of its 4 bars in Korean and
// English. A bar can end in the middle of a word (sora: かぞ|える), so its meaning is cut there
// too. Lines with no meaning (scat, chords) are not listed: the picker shows only how they sound.
import { getLang } from './i18n.js';
import { kanaReading } from './kanaReading.js';

const MEANING = {
  hikari: [['빛 속에서', 'in the light'], ['춤추며', 'dancing'], ['계속해서', 'on and on'], ['지금', 'now']],
  kaze: [['바람 속에서', 'in the wind'], ['너를 불러', 'I call you'], ['라라라', 'la la la'], ['아아', 'ah']],
  sora: [['하늘을 올려다보며', 'looking up at the sky'], ['꿈을 세-', 'counting dre-'], ['-어, 언젠가', '-ams, someday'], ['닿을 거야', "they'll reach"]],
  nee: [['저기, 들려?', 'hey, can you hear'], ['우리의', 'our'], ['리듬', 'rhythm'], ['라라라', 'la la la']],
  mada: [['아직 잠들지 않는', 'still awake'], ['이 거리에서', 'in this town'], ['혼자서', 'all alone'], ['저기~', 'hey']],
  ashita: [['내일은', 'tomorrow'], ['맑을까', 'will it be sunny'], ['아마', 'maybe'], ['그치?', 'right?']],
};

// a word's label in the page's language: { main, sub } — main its meaning (the kana in Japanese) and
// sub how it sounds; a word with no meaning (scat, chords) is main = how it sounds, no sub
export function wordLabel(line, bar, kana, lang = getLang()) {
  const m = MEANING[line]?.[bar];
  if (!m) return { main: kanaReading(kana, lang), sub: '' };
  if (lang === 'ja') return { main: kana, sub: '' };
  const main = m[lang === 'ko' ? 0 : 1], sub = kanaReading(kana, lang);
  // a sound with no meaning (ららら, ああ) reads the same both ways: shown once
  return { main, sub: sub.replace(/\s/g, '') === main.replace(/[\s-]/g, '') ? '' : sub };
}
