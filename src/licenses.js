// "License" dialog shared by the orb page and the player: sound sample and source code licenses.
// The text follows the page language (src/i18n.js); it is rebuilt each time the dialog opens.
// Keep this list in sync with README.md (Notes → Samples) and public/samples/SOURCES.md.
import { getLang } from './i18n.js';
import './licenses.css';

const TXT = {
  ko: {
    title: '라이선스',
    sounds: '소리',
    soundsNote: '드럼과 대부분의 악기 소리는 CC0(퍼블릭 도메인)입니다. 피아노와 므리당감 소리는 저작자 표시가 필요합니다. 이 소리가 들어간 곡(WAV 등)을 배포할 때는 아래 표기를 함께 적어 주세요.',
    synthNote: '신스 소리는 샘플 없이 Strudel(superdough)이 실시간으로 합성합니다.',
    code: '소스 코드 · 글꼴',
    codeNote: 'ORBRAVE는 AGPL-3.0 라이선스의 Strudel을 사용하므로 이 사이트의 소스 코드도 AGPL-3.0-or-later로 공개되어 있습니다.',
    by: '저작자',
    use: { drums: '드럼 머신 (909/808/707/606/727, RD-6)', kit: '어쿠스틱 드럼 키트', kitbreak: '브레이크비트 (이 프로젝트에서 위 키트로 연주)', vcsl: '마림바, 칼림바, 콩가, 셰이커 등', piano: '피아노', mrid: '므리당감 (오브 페이지)', maps: '샘플 목록(JSON)', site: '이 사이트', engine: '음악 엔진', font: '글꼴 (달무리)' },
    close: '닫기',
  },
  en: {
    title: 'Licenses',
    sounds: 'Sounds',
    soundsNote: 'Drums and most instruments are CC0 (public domain). The piano and mridangam sounds require attribution: if you share a track (a WAV, for example) that uses them, include the credits below.',
    synthNote: 'Synth sounds use no samples; Strudel (superdough) synthesizes them live.',
    code: 'Source code · Font',
    codeNote: 'ORBRAVE uses Strudel, which is AGPL-3.0, so this site\'s source code is published under AGPL-3.0-or-later as well.',
    by: 'by',
    use: { drums: 'Drum machines (909/808/707/606/727, RD-6)', kit: 'Acoustic drum kit', kitbreak: 'Breakbeat (played on the kit above by this project)', vcsl: 'Marimba, kalimba, conga, shakers and more', piano: 'Piano', mrid: 'Mridangam (orb page)', maps: 'Sample maps (JSON)', site: 'This site', engine: 'Music engine', font: 'Font (Dalmoori)' },
    close: 'Close',
  },
  ja: {
    title: 'ライセンス',
    sounds: 'サウンド',
    soundsNote: 'ドラムとほとんどの楽器の音は CC0(パブリックドメイン)です。ピアノとムリダンガムの音はクレジット表記が必要です。これらの音を含む曲(WAV など)を配布するときは、下の表記を添えてください。',
    synthNote: 'シンセの音はサンプルを使わず、Strudel(superdough)がリアルタイムで合成しています。',
    code: 'ソースコード · フォント',
    codeNote: 'ORBRAVE は AGPL-3.0 の Strudel を使っているため、このサイトのソースコードも AGPL-3.0-or-later で公開しています。',
    by: '作者',
    use: { drums: 'ドラムマシン (909/808/707/606/727, RD-6)', kit: 'アコースティックドラムキット', kitbreak: 'ブレイクビーツ (上のキットでこのプロジェクトが演奏)', vcsl: 'マリンバ、カリンバ、コンガ、シェイカーなど', piano: 'ピアノ', mrid: 'ムリダンガム (オーブページ)', maps: 'サンプルマップ (JSON)', site: 'このサイト', engine: '音楽エンジン', font: 'フォント (Dalmoori)' },
    close: '閉じる',
  },
};

const L = {
  cc0: ['CC0 1.0', 'https://creativecommons.org/publicdomain/zero/1.0/'],
  ccby3: ['CC BY 3.0', 'https://creativecommons.org/licenses/by/3.0/'],
  ccbysa4: ['CC BY-SA 4.0', 'https://creativecommons.org/licenses/by-sa/4.0/'],
  agpl: ['AGPL-3.0-or-later', 'https://www.gnu.org/licenses/agpl-3.0.html'],
  apache: ['Apache-2.0', 'https://www.apache.org/licenses/LICENSE-2.0'],
};

// [use key, name, url, author, license key (or null), needs attribution]
const SOUNDS = [
  ['drums', 'MckSamplePacks (TR-8, RD-6)', 'https://github.com/MckAudio/MckSamplePacks', 'MckAudio', 'cc0'],
  ['kit', 'Big Rusty Drums', 'https://github.com/sfzinstruments/karoryfer.big-rusty-drums', 'Karoryfer Samples', 'cc0'],
  ['kitbreak', 'kitbreak', 'https://github.com/r3coder/orbrave/blob/main/public/samples/SOURCES.md', 'ORBRAVE', 'cc0'],
  ['vcsl', 'VCSL (Versilian Community Sample Library)', 'https://github.com/sgossner/VCSL', 'Versilian Studios', 'cc0'],
  ['piano', 'Salamander Grand Piano V3', 'https://archive.org/details/SalamanderGrandPianoV3', 'Alexander Holm', 'ccby3', true],
  ['mrid', 'mrid', 'https://github.com/yaxu/mrid', '© 2022 Arthur Carabott · performer Harishankar V Menon', 'ccbysa4', true],
  ['maps', 'dough-samples', 'https://github.com/felixroos/dough-samples', 'Felix Roos', null],
];
const CODE = [
  ['site', 'ORBRAVE', 'https://github.com/r3coder/orbrave', 'R3C0D3r', 'agpl'],
  ['engine', 'Strudel (@strudel/web)', 'https://codeberg.org/uzu/strudel', 'Strudel contributors', 'agpl'],
  ['font', 'Dalmoori', 'https://github.com/RanolP/dalmoori-font', 'RanolP', 'apache'],
];

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const link = (href, text) => `<a href="${esc(href)}" target="_blank" rel="noopener">${esc(text)}</a>`;

function rows(list, s) {
  return list
    .map(([use, name, url, author, lic, attr]) => {
      const badge = lic ? link(L[lic][1], L[lic][0]) : '';
      return `<li${attr ? ' class="attr"' : ''}>
        <div class="lic-row"><b>${link(url, name)}</b><span class="lic-badge">${badge}</span></div>
        <div class="lic-sub">${esc(s.use[use])} · ${esc(s.by)} ${esc(author)}</div>
      </li>`;
    })
    .join('');
}

function render(dlg) {
  const s = TXT[getLang()] ?? TXT.en;
  dlg.innerHTML = `
    <div class="lic-head"><b>${esc(s.title)}</b><button type="button" class="ghost lic-x" aria-label="${esc(s.close)}">✕</button></div>
    <div class="lic-body">
      <h3>${esc(s.sounds)}</h3>
      <p>${esc(s.soundsNote)}</p>
      <ul>${rows(SOUNDS, s)}</ul>
      <p class="lic-dim">${esc(s.synthNote)}</p>
      <h3>${esc(s.code)}</h3>
      <p>${esc(s.codeNote)}</p>
      <ul>${rows(CODE, s)}</ul>
    </div>`;
  dlg.setAttribute('aria-label', s.title);
  dlg.querySelector('.lic-x').onclick = () => dlg.close();
}

// Wires a button to open the dialog. The button's own label is translated by the page's i18n.
export function mountLicenses(btn) {
  const dlg = document.createElement('dialog');
  dlg.className = 'lic';
  document.body.append(dlg);
  // a click on the backdrop lands on the <dialog> itself
  dlg.addEventListener('click', (e) => {
    if (e.target === dlg) dlg.close();
  });
  btn.addEventListener('click', () => {
    render(dlg);
    dlg.showModal();
    dlg.querySelector('.lic-body').scrollTop = 0;
  });
}
