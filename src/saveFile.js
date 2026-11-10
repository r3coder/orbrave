// Saving a rendered file, shared by the orb page and the player.
// A normal browser gets a plain download. In-app browsers (KakaoTalk, Instagram, LINE, ...) mostly
// drop blob: downloads without a word, so there a popup offers what does work: the share sheet
// with the file (where the browser has one), opening the page in the phone's own browser (with
// `handoff`, a URL that brings the same set back), and the plain download to try anyway.
// The popup also gives the share sheet the fresh tap it needs, since the render took a while.
import { getLang } from './i18n.js';
import './licenses.css';

const TXT = {
  ko: {
    title: '파일 저장',
    hint: '이 앱 안의 브라우저에서는 파일 저장이 막혀 있을 수 있어요.',
    kakao: '외부 브라우저(크롬, 사파리)로 열면 지금 세트 그대로 저장할 수 있어요.',
    other: '저장이 안 되면 브라우저 메뉴(⋮ 또는 ⋯)에서 "다른 브라우저로 열기"를 눌러 주세요.',
    share: '공유 / 파일에 저장', external: '외부 브라우저로 열기', anyway: '그냥 다운로드',
  },
  en: {
    title: 'Save file',
    hint: 'This in-app browser may block file downloads.',
    kakao: 'Open it in your own browser (Chrome, Safari) to save the same set.',
    other: 'If nothing downloads, use the browser menu (⋮ or ⋯) → "Open in browser".',
    share: 'Share / Save to Files', external: 'Open in browser', anyway: 'Download anyway',
  },
  ja: {
    title: 'ファイル保存',
    hint: 'このアプリ内ブラウザではファイルを保存できないことがあります。',
    kakao: '外部ブラウザ（Chrome、Safari）で開けば、今のセットのまま保存できます。',
    other: '保存できない場合は、ブラウザのメニュー（⋮ または ⋯）から「ブラウザで開く」を選んでください。',
    share: '共有 / ファイルに保存', external: '外部ブラウザで開く', anyway: 'そのままダウンロード',
  },
};
const s = () => TXT[getLang()] ?? TXT.en;

// 'kakao', 'other' (another app's built-in browser or a bare Android WebView), or null
export function inAppBrowser() {
  const ua = navigator.userAgent;
  if (/KAKAOTALK/i.test(ua)) return 'kakao';
  if (/Instagram|FBAN|FBAV|FB_IAB|\bLine\/|NAVER\(inapp|DaumApps|everytimeApp|Whale\/.*inapp|; wv\)/i.test(ua)) return 'other';
  return null;
}

function download(blob, name) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.append(a); // some WebViews only follow links that are in the page
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 60000);
}

let dlg = null;
function box() {
  if (dlg) return dlg;
  dlg = document.createElement('dialog');
  dlg.className = 'lic copybox savebox';
  dlg.innerHTML = `
    <div class="lic-head"><span class="sf-title"></span><button class="lic-x" type="button">✕</button></div>
    <div class="lic-body">
      <p class="sf-hint"></p>
      <p class="lic-dim sf-how"></p>
      <div class="sf-col">
        <button class="sf-share cb-copy" type="button"></button>
        <button class="sf-ext cb-copy" type="button"></button>
        <button class="sf-any" type="button"></button>
      </div>
    </div>`;
  document.body.append(dlg);
  dlg.addEventListener('click', (e) => {
    if (e.target === dlg) dlg.close();
  });
  dlg.querySelector('.lic-x').onclick = () => dlg.close();
  return dlg;
}

// Saves `blob` as `name`. `handoff`: a function giving the URL to open in an outside browser.
export function saveFile(blob, name, { handoff } = {}) {
  const app = inAppBrowser();
  if (!app) return download(blob, name);

  const d = box(), t = s();
  const file = new File([blob], name, { type: blob.type });
  let canShare = false;
  try {
    canShare = !!navigator.canShare?.({ files: [file] });
  } catch {}
  d.setAttribute('aria-label', t.title);
  d.querySelector('.sf-title').textContent = t.title;
  d.querySelector('.sf-hint').textContent = t.hint;
  d.querySelector('.sf-how').textContent = app === 'kakao' && handoff ? t.kakao : t.other;

  const share = d.querySelector('.sf-share');
  share.textContent = t.share;
  share.hidden = !canShare;
  share.onclick = () => navigator.share({ files: [file], title: name }).then(() => d.close(), () => {});

  const ext = d.querySelector('.sf-ext');
  ext.textContent = t.external;
  ext.hidden = !(app === 'kakao' && handoff);
  ext.onclick = () => {
    location.href = 'kakaotalk://web/openExternal?url=' + encodeURIComponent(handoff());
    d.close();
  };

  const any = d.querySelector('.sf-any');
  any.textContent = t.anyway;
  any.onclick = () => {
    download(blob, name);
    d.close();
  };
  d.showModal();
}
