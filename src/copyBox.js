// Copying text for sharing, shared by the orb page and the player.
// On a desktop the text goes straight to the clipboard. On a phone or tablet (or when the clipboard
// is refused) a popup shows the text already selected, with a copy button, since mobile browsers
// often refuse to copy without a direct tap.
import { getLang } from './i18n.js';
import './licenses.css';

const TXT = {
  ko: { title: '복사', hint: '아래 내용을 복사해서 공유하세요', copy: '복사', copied: '✓ 복사됨', manual: '길게 눌러 직접 복사하세요', share: '공유…' },
  en: { title: 'Copy', hint: 'Copy this to share it', copy: 'Copy', copied: '✓ Copied', manual: 'Press and hold to copy it yourself', share: 'Share…' },
  ja: { title: 'コピー', hint: 'これをコピーして共有してください', copy: 'コピー', copied: '✓ コピー済み', manual: '長押ししてコピーしてください', share: '共有…' },
};
const s = () => TXT[getLang()] ?? TXT.en;

export const isMobile = () =>
  matchMedia('(pointer: coarse)').matches || /Android|iPhone|iPad|iPod|Mobi/i.test(navigator.userAgent);

// the older way, for browsers whose clipboard API is missing or refuses
function execCopy(ta) {
  ta.focus();
  ta.select();
  ta.setSelectionRange(0, ta.value.length);
  try {
    return document.execCommand('copy');
  } catch {
    return false;
  }
}

let dlg = null;
function box() {
  if (dlg) return dlg;
  dlg = document.createElement('dialog');
  dlg.className = 'lic copybox';
  dlg.innerHTML = `
    <div class="lic-head"><span class="cb-title"></span><button class="lic-x" type="button">✕</button></div>
    <div class="lic-body">
      <p class="lic-dim cb-hint"></p>
      <textarea class="cb-text" readonly rows="6" spellcheck="false"></textarea>
      <div class="cb-row"><button class="cb-share" type="button"></button><button class="cb-copy" type="button"></button></div>
    </div>`;
  document.body.append(dlg);
  dlg.addEventListener('click', (e) => {
    if (e.target === dlg) dlg.close();
  });
  dlg.querySelector('.lic-x').onclick = () => dlg.close();
  const ta = dlg.querySelector('.cb-text');
  ta.addEventListener('focus', () => ta.select());
  dlg.querySelector('.cb-copy').onclick = async (e) => {
    const btn = e.currentTarget;
    let ok = false;
    try {
      await navigator.clipboard.writeText(ta.value);
      ok = true;
    } catch {
      ok = execCopy(ta);
    }
    btn.textContent = ok ? s().copied : s().copy;
    dlg.querySelector('.cb-hint').textContent = ok ? s().hint : s().manual;
    if (ok) setTimeout(() => dlg.open && dlg.close(), 700);
    else execCopy(ta); // leave it selected for a long press
  };
  dlg.querySelector('.cb-share').onclick = () => navigator.share?.({ text: ta.value }).catch(() => {});
  return dlg;
}

// shows the popup with `text` selected
export function showCopyBox(text) {
  const d = box();
  const t = s();
  d.setAttribute('aria-label', t.title);
  d.querySelector('.cb-title').textContent = t.title;
  d.querySelector('.cb-hint').textContent = t.hint;
  d.querySelector('.cb-copy').textContent = t.copy;
  const share = d.querySelector('.cb-share');
  share.textContent = t.share;
  share.hidden = !navigator.share;
  const ta = d.querySelector('.cb-text');
  ta.value = text;
  d.showModal();
  ta.scrollTop = 0;
  ta.select();
  ta.setSelectionRange(0, text.length);
}

// Copies `text`. Resolves true when it went to the clipboard, false when the popup was shown instead.
export async function copyText(text) {
  if (!isMobile()) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {}
  }
  showCopyBox(text);
  return false;
}
