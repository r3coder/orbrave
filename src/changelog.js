// Version badge + "What's new" dialog on the orb page (next to ∞ Endless play).
// Add a new entry at the top of NOTES for each release; VERSION follows the first entry.
// The text follows the page language (src/i18n.js) and is rebuilt each time the dialog opens.
// Uses the license dialog frame (src/licenses.css).
import { getLang } from './i18n.js';
import './licenses.css';

// [version, date, { ko: [...], en: [...], ja: [...] }]
const NOTES = [
  ['0.4.5', '2026-11-06', {
    ko: ['(직접수정) strudel.cc ↗: 지금 곡을 Strudel 코드 그대로 strudel.cc 에서 열어 직접 고치고 실행해 볼 수 있어요 (샘플과 출처 포함)', '튜토리얼에 코드 안내가 생겼고, 프리셋 안내 때는 프리셋 줄만 밝게 보여요', '음량을 돌리는 동안 다이얼만 밝고 나머지는 어두워져요', '처음 떨어지는 오브는 로딩 화면에서 미리 받은 소리만 써서, 잡자마자 바로 소리가 나요', '언어는 브라우저가 고른 언어 순서를 따라가요', '왼쪽 아래 링크가 커지고 줄바꿈되며, 오브가 많아도 재생기와 저장 · 공유 버튼이 화면에 남아요'],
    en: ['(edit) strudel.cc ↗: open the current set as plain Strudel code on strudel.cc and change and run it there (samples and credits included)', 'The guide now points out the code, and the preset tip lights up just the preset bar', 'While the volume is turned, everything but the dial dims', 'The first orbs to fall only use sounds loaded on the boot screen, so they play the moment they go in', 'The page language follows your browser\'s list of preferred languages', 'The bottom-left links are larger and wrap; with many orbs in, the player and save / share buttons stay on screen'],
    ja: ['(直接編集) strudel.cc ↗: 今の曲を Strudel のコードのまま strudel.cc で開いて、書き換えて再生できます(サンプルとクレジット付き)', 'ガイドにコードの案内が加わり、プリセットの案内ではプリセットの列だけが明るくなります', '音量を回している間はダイヤル以外が暗くなります', '最初に落ちてくるオーブはロード画面で読み込んだ音だけを使うので、入れた瞬間に鳴ります', '表示言語はブラウザの優先言語の順に従います', '左下のリンクが大きくなり折り返します。オーブが多くてもプレイヤーと保存・共有ボタンが画面に残ります'],
  }],
  ['0.4.4', '2026-11-06', {
    ko: ['스템: 섹션마다 ♯ 버튼으로 그 섹션만 서브 조성으로 바꾸거나 원래 조로 되돌려요', '곡에서 꺼낸 오브는 놓은 자리에 머물러요. 오른쪽으로 세게 던지면 보관함으로 들어가요', '슬롯에서 위로 던진 오브는 필드로 살짝 튀어 올랐다가 떨어져요', '밝은 테마의 색을 새로 칠했어요: 단조는 로즈 밀크티, 장조는 딸기 타로 밀크', '폰: 곡 줄 위로 필드가 끝나서, 떨어지는 오브와 곡의 오브가 겹치지 않아요'],
    en: ['Stems: ♯ on a section plays just that section in the sub key, or back in the home key', 'An orb taken out of the song stays where you let go; a hard flick to the right puts it in the stash', 'An orb thrown upwards out of a slot hops up into the field and falls from there', 'New light-theme colours: rose milk tea in minor, strawberry-taro milk in major', 'Phones: the field ends above the song\'s row, so falling orbs and the song\'s orbs no longer overlap'],
    ja: ['ステム: セクションごとの ♯ でそのセクションだけサブ調に、または元の調に戻します', '曲から取り出したオーブは離した場所にとどまります。右へ強く投げるとストックへ', 'スロットから上へ投げたオーブはフィールドへ軽く跳ねてから落ちます', 'ライトテーマの色を一新: マイナーはローズミルクティー、メジャーはいちごタロミルク', 'スマホ: フィールドが曲の列の上で終わるので、落ちてくるオーブと曲のオーブが重なりません'],
  }],
  ['0.4.3', '2026-11-05', {
    ko: ['스템: 섹션과 악기 사이에 마디 번호 줄이 생겼어요. 누르면 4박자 카운트(4 · 3 · 2 · 1) 뒤에 그 마디부터 재생돼요', '스템: 섹션 오른쪽 끝의 || 를 끌어서 길이를 마디 단위로 조절해요', '스템: 섹션마다 ＋ 로 바로 뒤에 새 섹션(인트로 · 빌드업 · 드롭 · 브레이크 · 브리지 · 아웃트로) 추가, ✕ 로 삭제', '곡 구성 랜덤화와 섹션 삭제는 한 번 더 물어봐요', '왼쪽 배경 피아노 롤의 선이 스템에서 재생 중인 위치를 따라가요', '전부 비우기를 누르면 스템도 닫혀요', '분위기는 EQ 포함 5개까지 겹치고, 킥 · 스네어 · 하이햇 · 아르페지오 · 코드는 2개까지 들어가요'],
    en: ['Stems: a row of bar numbers under the sections; click one to play from that bar after a 4-beat count-in (4 · 3 · 2 · 1)', 'Stems: drag the || at a section\'s right edge to change its length bar by bar', 'Stems: ＋ on a section adds a new one right after it (intro, build-up, drop, break, bridge, outro); ✕ deletes it', 'Shuffling the song layout and deleting a section ask once more first', 'The piano roll behind the page follows where the stems are playing', 'Clear all also closes the stems', 'Up to 5 moods stack (EQ included); kicks, snares, hats, arpeggios and chords take 2 each'],
    ja: ['ステム: セクションと楽器の間に小節番号の列。クリックすると 4 拍のカウント(4 · 3 · 2 · 1)のあとその小節から再生', 'ステム: セクション右端の || をドラッグして長さを小節単位で調整', 'ステム: セクションごとの ＋ で直後に新しいセクション(イントロ・ビルドアップ・ドロップ・ブレイク・ブリッジ・アウトロ)を追加、✕ で削除', '曲構成のランダム化とセクション削除はもう一度確認します', '背景のピアノロールの線がステムの再生位置についていきます', 'すべて外すでステムも閉じます', '雰囲気は EQ を含めて 5 つまで重なり、キック・スネア・ハイハット・アルペジオ・コードは 2 つまで'],
  }],
  ['0.4.2', '2026-11-05', {
    ko: ['모두의 곡: 서버가 20곡을 골라 보내 줘요 (👍가 많은 곡과 새 곡이 더 자주 나와요). ↻를 누르면 새로 20곡', '모두의 곡 목록 스크롤이 부드러워졌어요: 타일의 색 소용돌이는 마우스를 올렸을 때만 돌아요'],
    en: ['Shared: the server picks 20 songs (well-liked and new ones more often); ↻ draws a fresh 20', 'The Shared list scrolls smoothly: a tile\'s colour swirl only turns while hovered'],
    ja: ['みんなの曲: サーバーが 20 曲を選んで送ります(👍 の多い曲と新しい曲がよく出ます)。↻ で新しく 20 曲', 'みんなの曲の一覧がなめらかにスクロールします: タイルの色の渦はマウスを乗せたときだけ回ります'],
  }],
  ['0.4.1', '2026-11-05', {
    ko: ['넓은 화면: 재생 중인 멜로디 오브들의 루프가 배경에 피아노 롤로 흘러요', '원형 파형이 재생 버튼과 EQ 막대 사이에 들어가요', '휴대폰: 편집을 포함한 오브 슬롯 5개가 항상 나와 있고, 안내에서 하나씩 설명해요', '휴대폰: 위쪽 줄에 전부 비우기 · 오브 설명 · ⇪ 내보내기', '휴대폰: 빈 화면을 아래로 스와이프하면 오브가 빠르게, 위로 스와이프하면 느리게 떨어져요'],
    en: ['Wide screens: the loop of the melodic orbs playing scrolls behind the page as a piano roll', 'The round waveform now sits between the play button and the EQ bars', 'Phones: all 5 orb slots, Edit included, are always out, and the guide explains each one', 'Phones: Clear all, the orb hint and ⇪ Export along the top', 'Phones: swipe down on the empty field for faster-falling orbs, up for slower'],
    ja: ['ワイド画面: 再生中のメロディオーブのループが背景にピアノロールで流れます', '円形の波形が再生ボタンと EQ バーの間に収まります', 'スマホ: 編集を含むオーブスロット 5 つが常に表示され、ガイドで一つずつ説明します', 'スマホ: 上の列にすべて外す・オーブの説明・⇪ 書き出し', 'スマホ: 空いた画面を下にスワイプするとオーブが速く、上にスワイプすると遅く落ちます'],
  }],
  ['0.4.0', '2026-11-05', {
    ko: ['오브 565개 → 816개: 베이스 · 리드 100개, 코드 58개, 아르페지오 83개 · 여러 멜로디 변주(시퀀스, 콜 앤 리스폰스, 반행, 훅 …)와 장르별 베이스 리듬', '새 악기: 오르간 · 파이프오르간 · 하모니카 · 리코더 · 활로 켠 비브라폰, 서스펜디드 심벌 · 콘서트 탐 · 팀파니 · 공', '칩튠 · 앰비언트 · 월드 오브가 킥 · 스네어 · 하이햇까지 모든 종류에 생겼어요', '취향 탐색: 오브를 내려놓거나 듣고 지나치면 노래에 없는 분위기의 오브가 더 떨어져요', 'EQ 오브: 저음 · 고음 강화, 저음 · 고음 줄이기 등 (3개까지 겹쳐요)', '무드는 3개까지 겹치고, 밸런스 무드는 파트를 끄지 않고 줄여요', '검색: t:베이스 · s:펜타토닉 · k:Am · bpm:>130 처럼 찾기', '소리가 안 나던 탐 오브 두 개 수리', '버전 표시와 업데이트 노트'],
    en: ['565 → 816 orbs: 100 basses and leads, 58 chord parts, 83 arpeggios, with melody variations (sequence, call and response, inversion, hooks …) and genre bass rhythms', 'New instruments: organs, pipe organ, harmonicas, recorders, bowed vibraphone, suspended cymbals, concert toms, timpani, gongs', 'Chip, ambient and world orbs in every category, kick, snare and hat included', 'Taste: put orbs back or pass them by and more orbs fall from the vibes your song doesn\'t have yet', 'EQ orbs: bass / treble boost, low / high cut and more (up to 3 stack)', 'Up to 3 moods stack; balance moods turn parts down instead of muting them', 'Search fields: t:bass · s:pentatonic · k:Am · bpm:>130', 'Two tom orbs that made no sound now play', 'Version badge and release notes'],
    ja: ['オーブ 565 → 816 個: ベースとリード 100 個、コード 58 個、アルペジオ 83 個。メロディの変奏(シーケンス、コール&レスポンス、反行、フック …)とジャンル別ベースリズム', '新しい楽器: オルガン、パイプオルガン、ハーモニカ、リコーダー、弓で弾くビブラフォン、サスペンドシンバル、コンサートタム、ティンパニ、ゴング', 'チップ・アンビエント・ワールドのオーブがキック・スネア・ハイハットを含む全種類に', '好み探索: オーブを戻したり聴いて通り過ぎたりすると、曲にない雰囲気のオーブが多く落ちてきます', 'EQ オーブ: 低音・高音ブースト、低域・高域カットなど(3 つまで重ねられます)', 'ムードは 3 つまで重ねられ、バランスムードはパートを消さずに小さくします', '検索: t:ベース · s:ペンタトニック · k:Am · bpm:>130 のように', '音が出なかったタムのオーブ 2 つを修理', 'バージョン表示とアップデートノート'],
  }],
  ['0.3.1', '2026-11-05', {
    ko: ['프리셋 곡의 8마디 브레이크가 매번이 아니라 가끔(약 60%) 나와요', '하우스 곡의 브레이크도 70% 확률로만 나와요'],
    en: ['The 8-bar break in preset songs now comes in only some of the time (about 60%)', 'House songs get their break in 70% of plays'],
    ja: ['プリセット曲の8小節ブレイクが毎回ではなく、ときどき(約60%)入るように', 'ハウス曲のブレイクも70%の確率で入るように'],
  }],
  ['0.3.0', '2026-11-05', {
    ko: ['플레이어 아래 오브 슬롯: MIDI 편집, 작게(80%) · 크게(120%), 변주 · 효과는 겹쳐 쓸 수 있어요', '오브별 음량이 프리셋 · 공유 코드 · 서버 공유에 저장돼요', '드로잉에 화음, 스템에 필인 마디 추가', '새 악기: 효과음(임팩트 · 서브 드롭 · 리버스 · 스윕), 베이스 기타, 콘트라베이스, 일렉트릭 피아노(Wurlitzer)', '새 장르: 덥 테크노', '다크 / 라이트 테마 · 색 톤이 조성을 따라가요', '처음 방문하면 안내가 나와요', '카카오톡 · 인스타그램 같은 앱 안 브라우저에서도 파일 저장'],
    en: ['Orb slots under the player: MIDI edit, quieter (80%) / louder (120%) and vary; effects stack', 'Per-orb volume is kept in presets, share codes and server uploads', 'Chords in drawings, fill bars in stems', 'New instruments: effects (impacts, sub drops, reverses, sweeps), bass guitars, upright bass, electric piano (Wurlitzer)', 'New genre: dub techno', 'Dark / light theme; the palette follows the key', 'A guide on your first visit', 'Saving files from in-app browsers (KakaoTalk, Instagram, ...)'],
    ja: ['プレイヤー下のオーブスロット: MIDI 編集、小さく(80%)・大きく(120%)、バリエーション。効果は重ねられます', 'オーブごとの音量がプリセット・共有コード・サーバー共有に保存されます', '手描きに和音、ステムにフィルイン小節', '新しい楽器: 効果音(インパクト・サブドロップ・リバース・スイープ)、ベースギター、コントラバス、エレクトリックピアノ(Wurlitzer)', '新ジャンル: ダブテクノ', 'ダーク / ライトテーマ。色調は調に合わせて変わります', '初回訪問時のガイド', 'カカオトーク・Instagram などのアプリ内ブラウザでもファイル保存'],
  }],
  ['0.2.0', '2026-11-04', {
    ko: ['⚡ 저사양 모드: 빛 번짐 등을 줄여 가볍게 (소리는 그대로) · 화면이 버벅이면 저절로 켜져요', '루프 / 스템 버튼 분리 (WAV 저장 · 공유)', '피아노 롤의 🎲 변주: 악기 하나만 따로 변주', '폴더블 펼친 화면 · 노치 화면 대응'],
    en: ['⚡ Low-spec mode: fewer glow effects (sound unchanged); turns on by itself when the screen stutters', 'Separate loop / stem buttons (save WAV, share)', '🎲 Vary in the piano roll: vary just one instrument', 'Unfolded foldables and notched screens'],
    ja: ['⚡ 低スペックモード: 光のにじみなどを減らして軽く(音はそのまま)。画面がカクつくと自動でオン', 'ループ / ステムのボタンを分離 (WAV 保存・共有)', 'ピアノロールの 🎲 バリエーション: 楽器ひとつだけ変える', '折りたたみ端末の展開画面・ノッチ画面に対応'],
  }],
  ['0.1.5', '2026-11-04', {
    ko: ['곡이 4마디 단위에 맞춰 시작해요', '👍 / 👎 는 공유된 그대로일 때만 보여요'],
    en: ['Songs start on the 4-bar grid', '👍 / 👎 shows only while the set is exactly as shared'],
    ja: ['曲が4小節単位にそろって始まります', '👍 / 👎 は共有されたままのときだけ表示'],
  }],
  ['0.1.4', '2026-11-04', {
    ko: ['모두의 곡에 👍 / 👎 투표 · 좋아요가 많은 곡이 더 자주 나와요', '🐞 버그/의견 제출 버튼', '휴대폰에서 공유 코드 복사 창'],
    en: ['👍 / 👎 votes on shared songs; liked songs come up more often', '🐞 Bug / Feedback button', 'Copy popup for share codes on phones'],
    ja: ['みんなの曲に 👍 / 👎 投票。好評な曲がよく流れます', '🐞 バグ・ご意見ボタン', 'スマホで共有コードのコピー画面'],
  }],
  ['0.1.3', '2026-11-04', {
    ko: ['오브마다 따로 변주 시드', 'ⓘ 라이선스 창', 'WAV 파일 용량 줄임'],
    en: ['Each orb can have its own variation seed', 'ⓘ Licenses dialog', 'Smaller WAV downloads'],
    ja: ['オーブごとに別のバリエーションシード', 'ⓘ ライセンス画面', 'WAV ファイルを小さく'],
  }],
  ['0.1.2', '2026-11-04', {
    ko: ['작은 화면 지원'],
    en: ['Small screen support'],
    ja: ['小さい画面に対応'],
  }],
  ['0.1.1', '2026-11-04', {
    ko: ['자잘한 수정'],
    en: ['Small fixes'],
    ja: ['細かな修正'],
  }],
  ['0.1', '2026-11-04', {
    ko: ['ORBRAVE 첫 공개: 끝없이 생성되는 무한 재생기와 오브 페이지'],
    en: ['First release of ORBRAVE: the endless generative player and the orb page'],
    ja: ['ORBRAVE 初公開: 終わりなく生成される無限再生プレイヤーとオーブページ'],
  }],
];

export const VERSION = NOTES[0][0];

const TXT = {
  ko: { title: '업데이트 노트', tip: '업데이트 노트 보기', close: '닫기' },
  en: { title: "What's new", tip: 'See the update notes', close: 'Close' },
  ja: { title: 'アップデートノート', tip: 'アップデートノートを見る', close: '閉じる' },
};
const s = () => TXT[getLang()] ?? TXT.en;
const esc = (x) => String(x).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

function render(dlg) {
  const t = s();
  const lang = getLang();
  dlg.innerHTML = `
    <div class="lic-head"><b>${esc(t.title)}</b><button type="button" class="ghost lic-x" aria-label="${esc(t.close)}">✕</button></div>
    <div class="lic-body">${NOTES.map(([v, date, items]) => `
      <h3>v${esc(v)} <span class="cl-date">${esc(date)}</span></h3>
      <ul class="cl-list">${(items[lang] ?? items.en).map((i) => `<li>${esc(i)}</li>`).join('')}</ul>`).join('')}
    </div>`;
  dlg.setAttribute('aria-label', t.title);
  dlg.querySelector('.lic-x').onclick = () => dlg.close();
}

// Fills the badge with the version and wires it to open the dialog.
export function mountChangelog(btn) {
  btn.textContent = `v${VERSION}`;
  const dlg = document.createElement('dialog');
  dlg.className = 'lic changelog';
  document.body.append(dlg);
  dlg.addEventListener('click', (e) => {
    if (e.target === dlg) dlg.close();
  });
  btn.addEventListener('click', () => {
    btn.title = s().tip;
    render(dlg);
    dlg.showModal();
    dlg.querySelector('.lic-body').scrollTop = 0;
  });
  // the tooltip follows the language, which can change after mounting
  const tip = () => (btn.title = s().tip);
  btn.addEventListener('pointerenter', tip);
  btn.addEventListener('focus', tip);
  tip();
}
