export const LANGS = { ko: '한국어', en: 'English', ja: '日本語' };

const STR = {
  ko: {
    play: '재생', stop: '정지',
    prev: '이전 곡', next: '다음 곡', share: '공유', download: '저장',
    rendering: '렌더링 {p}%',
    copied: '복사됨',
    loadingSounds: '사운드 불러오는 중',
    code: '코드', generatedCode: '생성된 코드', history: '재생 기록',
    toOrbs: '● 내 오브 만들기', licenses: 'ⓘ 라이선스', feedback: '🐞 버그/의견 제출',
  },
  en: {
    play: 'Play', stop: 'Stop',
    prev: 'Previous', next: 'Next song', share: 'Share', download: 'Save',
    rendering: 'Rendering {p}%',
    copied: 'Copied',
    loadingSounds: 'Loading sounds',
    code: 'code', generatedCode: 'generated code', history: 'history',
    toOrbs: '● Make my orbs', licenses: 'ⓘ Licenses', feedback: '🐞 Bug / Feedback',
  },
  ja: {
    play: '再生', stop: '停止',
    prev: '前の曲', next: '次の曲', share: '共有', download: '保存',
    rendering: 'レンダリング {p}%',
    copied: 'コピー済み',
    loadingSounds: 'サウンドを読み込み中',
    code: 'コード', generatedCode: '生成されたコード', history: '再生履歴',
    toOrbs: '● マイオーブを作る', licenses: 'ⓘ ライセンス', feedback: '🐞 バグ・ご意見',
  },
};

function initialLang() {
  try {
    const saved = localStorage.getItem('lang');
    if (STR[saved]) return saved;
  } catch {}
  const prefs = navigator.languages?.length ? navigator.languages : [navigator.language || 'en'];
  for (const p of prefs) {
    const code = String(p).slice(0, 2).toLowerCase();
    if (STR[code]) return code;
  }
  return 'en';
}

let lang = initialLang();
export const getLang = () => lang;
// save=false: apply without pinning, so first-visit auto-detect keeps following the browser
export function setLang(l, save = true) {
  if (!STR[l]) return;
  lang = l;
  document.documentElement.lang = l;
  if (save) try {
    localStorage.setItem('lang', l);
  } catch {}
}
export const t = (key, vars = {}) =>
  (STR[lang][key] ?? STR.en[key] ?? key).replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? '');
