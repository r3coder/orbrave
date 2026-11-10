// How the Teto vocal words read in the page's language: the kana they are sung in, written out
// as it sounds in Hangul (ko) or romaji (en). The words picker shows these (✎ 단어, src/orbs/slots.js).
// Only the kana the lines use (tools/vocals/make_ustx.py) and their plain readings: は is "ha" and
// を "o", since that is what the voicebank sings for them.
import { getLang } from './i18n.js';

// mora -> [romaji, Hangul]
const MORA = {
  あ: ['a', '아'], い: ['i', '이'], う: ['u', '우'], え: ['e', '에'], お: ['o', '오'],
  か: ['ka', '카'], が: ['ga', '가'], き: ['ki', '키'], く: ['ku', '쿠'], け: ['ke', '케'], げ: ['ge', '게'], こ: ['ko', '코'],
  さ: ['sa', '사'], し: ['shi', '시'], しゅ: ['shu', '슈'], す: ['su', '스'], ず: ['zu', '즈'], せ: ['se', '세'], ぜ: ['ze', '제'], そ: ['so', '소'], ぞ: ['zo', '조'],
  た: ['ta', '타'], だ: ['da', '다'], ち: ['chi', '치'], つ: ['tsu', '츠'], づ: ['zu', '즈'], て: ['te', '테'], で: ['de', '데'], と: ['to', '토'], ど: ['do', '도'],
  な: ['na', '나'], に: ['ni', '니'], ぬ: ['nu', '누'], ね: ['ne', '네'], の: ['no', '노'],
  は: ['ha', '하'], ば: ['ba', '바'], ぱ: ['pa', '파'], ひ: ['hi', '히'], び: ['bi', '비'], ぴ: ['pi', '피'],
  ふ: ['fu', '후'], ぶ: ['bu', '부'], ぷ: ['pu', '푸'], へ: ['he', '헤'], べ: ['be', '베'], ぺ: ['pe', '페'], ほ: ['ho', '호'], ぼ: ['bo', '보'], ぽ: ['po', '포'],
  ま: ['ma', '마'], み: ['mi', '미'], む: ['mu', '무'], め: ['me', '메'], も: ['mo', '모'],
  や: ['ya', '야'], ゆ: ['yu', '유'], よ: ['yo', '요'],
  ら: ['ra', '라'], り: ['ri', '리'], る: ['ru', '루'], れ: ['re', '레'], ろ: ['ro', '로'],
  わ: ['wa', '와'], を: ['o', '오'],
};

// ん closes the syllable before it in Hangul (ㄴ as its final consonant), "n" in romaji
function withN(hangul) {
  const c = hangul ? hangul.codePointAt(hangul.length - 1) - 0xac00 : -1;
  // no syllable before it (a hum: "んんん"), or one that already ends in a consonant
  if (!(c >= 0 && c < 11172) || c % 28) return hangul + '응';
  return hangul.slice(0, -1) + String.fromCodePoint(0xac00 + c + 4); // + ㄴ
}

// kana (as the lines are written) -> how it reads in the page's language (Japanese: as it is)
export function kanaReading(text, lang = getLang()) {
  if (lang === 'ja') return text;
  const ko = lang === 'ko';
  let out = '';
  for (let i = 0; i < text.length; i++) {
    const two = MORA[text.slice(i, i + 2)];
    if (two) {
      out += two[ko ? 1 : 0];
      i++;
    } else if (text[i] === 'ん') out = ko ? withN(out) : out + 'n';
    else out += MORA[text[i]]?.[ko ? 1 : 0] ?? text[i];
  }
  return out;
}
