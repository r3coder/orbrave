// Version badge + "What's new" dialog on the orb page (next to ∞ Endless play).
// Add a new entry at the top of NOTES for each release; VERSION follows the first entry.
// The text follows the page language (src/i18n.js) and is rebuilt each time the dialog opens.
// Uses the license dialog frame (src/licenses.css).
import { getLang } from './i18n.js';
import './licenses.css';

// [version, date, { ko: [...], en: [...], ja: [...] }]
const NOTES = [
  ['0.6.2', '2026-11-11', {
    ko: [
      '버튼과 라벨의 이모지 일부가 선 아이콘으로 바뀌고, 간격이 고르게 정리됐어요',
      '잘못된 공유 코드나 링크를 열어도 페이지가 멈추지 않아요',
      '공유 서버가 더 단단해졌어요: 공유 · 평가 횟수 제한을 피해 갈 수 없고, 한 곡의 평가는 한 네트워크에서 하루 3명까지만 반영돼요',
    ],
    en: [
      'Some emoji on buttons and labels are now line icons, and the spacing is evened out',
      'A broken share code or link no longer stops the page from loading',
      'A sturdier share server: the share and vote limits can no longer be sidestepped, and one song takes votes from at most 3 people per network a day',
    ],
    ja: [
      'ボタンやラベルの絵文字の一部が線アイコンになり、余白がそろいました',
      '壊れた共有コードやリンクを開いても、ページが止まらなくなりました',
      '共有サーバーが丈夫になりました: 共有 · 評価の回数制限をすり抜けられなくなり、1曲への評価は1つのネットワークから1日3人まで反映されます',
    ],
  }],
  ['0.6.1', '2026-11-10', {
    ko: [
      '스템 모드에서 악기를 노래에서 꺼내 변주 슬롯에 넣어도 스템 줄이 그대로 남고 계속 연주돼요',
      '악기를 노래에서 뺐다가 다시 넣으면 그 스템 줄의 편집(블록 · 변주 · 세기 · 뮤트 · 자리)이 그대로 돌아와요',
    ],
    en: [
      'In stem mode, an instrument taken from the song into the variation slot keeps its stem row and keeps playing',
      'An instrument taken out of the song and put back gets its stem row back as it was edited (blocks, variations, strength, mute, place)',
    ],
    ja: [
      'ステムモードで楽器を曲からバリエーションスロットに入れても、ステムの行がそのまま残って鳴り続けます',
      '楽器を曲から外してまた入れると、そのステム行の編集 (ブロック · バリエーション · 強さ · ミュート · 位置) がそのまま戻ります',
    ],
  }],
  ['0.6.0', '2026-11-10', {
    ko: [
      '보컬 오브 3개가 생겼어요: 빛 속에서 노래하는 테토 · 라라라 흥얼거리는 테토 · 화음 쌓는 테토 (UTAU 음원 重音テト, OpenUtau로 노래)',
      '테토는 마디마다 단어를 바꿔 불러요. 🎲로 새로 섞고, ✎ 단어에서 마디별 단어를 직접 고를 수 있어요 (뜻과 발음은 페이지 언어로 표시)',
      '조성 오브와 템포 오브를 넣어도 테토 노래가 박자와 음높이를 따라가요',
      '테토 목소리는 공유 서버에서 받아요. 서버에 연결되지 않으면 보컬 오브가 떨어지지 않고, 검색에는 [X]와 회색으로 표시돼요',
      '테토 음성은 비상업 이용만 가능하고 AGPL·CC0 대상이 아니에요. 멜로디와 가사는 CC0예요',
      '스템 편집 내용이 저장돼요: 스템을 닫거나 페이지를 닫아도, 다시 열면 편집하던 그대로(뮤트 포함) 돌아와요. 열어 둔 채 닫았다면 스템이 열린 채로 시작해요',
    ],
    en: [
      'Three vocal orbs: Teto Singing in the Light · Teto Humming La La La · Teto Stacking Chords (the 重音テト UTAU voicebank, sung in OpenUtau)',
      'Teto changes words every bar: 🎲 mixes new ones, and ✎ Words lets you pick each bar’s word (meaning and pronunciation in the page language)',
      'Teto’s singing follows key and tempo orbs, on the beat and in tune',
      'Teto’s voice comes from the share server: without it the vocal orbs don’t fall, and the search shows them greyed out with [X]',
      'Teto’s audio is for non-commercial use only and not under the AGPL or CC0; the melodies and lyrics are CC0',
      'Stem edits are saved: close the stems or the page and they come back as you left them (mutes too); stems left open reopen open',
    ],
    ja: [
      'ボーカルオーブが3つ:光の中で歌うテト · ラララと口ずさむテト · ハモりを重ねるテト (UTAU 音源 重音テト、OpenUtau で歌唱)',
      'テトは小節ごとに言葉を変えて歌います。🎲 で混ぜ直し、✎ 言葉で小節ごとの言葉を選べます (意味と発音はページの言語で表示)',
      '調オーブやテンポオーブを入れても、テトの歌がリズムと音程についていきます',
      'テトの声は共有サーバーから読み込みます。つながらないときはボーカルオーブが落ちず、検索では [X] とグレーで表示されます',
      'テトの音声は非商用のみで、AGPL・CC0 の対象外です。メロディーと歌詞は CC0 です',
      'ステムの編集内容が保存されます:ステムやページを閉じても、次に開くと編集していたまま (ミュートも) 戻ります。開いたまま閉じた場合はステムが開いた状態で始まります',
    ],
  }],
  ['0.5.6', '2026-11-08', {
    ko: [
      '🎛 편집 슬롯에 분위기 오브도 넣을 수 있어요: 효과를 5개까지 골라 줄마다 4마디에 걸친 세기 곡선을 그려요',
      '곡선 모양 버튼(일정 · 점점 세게 · 점점 약하게 · 물결 · 마디마다 · 마지막 마디만)과 효과별 100% 세기 조절',
      '분위기 편집 아래에 막대 31개짜리 그래픽 EQ가 생겼어요. 노래 전체에 걸리고 WAV 저장에도 들어가요',
      '만든 분위기는 커스텀 오브로 남고, 서버에 올려 나눌 수도 있어요',
      '분위기 편집도 처음 열면 둘러보기가 나와요. 소리 편집에서 이미 본 부분은 건너뛰고, 반대 순서도 마찬가지예요',
    ],
    en: [
      'Mood orbs go in the 🎛 Edit slot too: pick up to 5 effects and draw the strength of each across 4 bars',
      'Curve shape buttons (steady · build up · fade out · wave · every bar · last bar only) and a 100% strength per effect',
      'A 31-bar graphic EQ under the mood editor, on the whole song and in WAV exports',
      'Moods you make stay as custom orbs and can be shared on the server',
      'The mood editor has a first-time tour too; steps already seen in the sound editor are skipped, and the other way round',
    ],
    ja: [
      '🎛 編集スロットにムードオーブも入れられます:エフェクトを5つまで選び、4小節にわたる強さカーブを描きます',
      'カーブの形ボタン(一定 · だんだん強く · だんだん弱く · 波 · 小節ごと · 最後の小節だけ)とエフェクトごとの100%の強さ',
      'ムード編集の下に31本のグラフィック EQ。曲全体にかかり、WAV 保存にも入ります',
      '作ったムードはカスタムオーブとして残り、サーバーで共有もできます',
      'ムード編集も初めて開くとツアーが出ます。音の編集ですでに見た部分は飛ばし、逆の順番も同じです',
    ],
  }],
  ['0.5.5', '2026-11-08', {
    ko: [
      '분위기 오브에 효과 하나만 담은 4개가 생겼어요: 멜로디는 잠시 쉬어 · 베이스 없는 오후 · 드럼만 남은 무대 · 어깨가 들썩이는 스윙',
      '분위기 오브 구성을 고르게 다듬었어요: 효과마다 혼자 쓰는 오브가 하나씩, 나머지는 두세 효과 조합 (일부 분위기는 소리가 바뀌었어요)',
      '검색하면 효과 하나짜리 분위기가 먼저, 그다음 두 개 · 세 개짜리 순으로 나와요',
      '곡에 오브가 많아질수록 콤보 오브가 덜 떨어지고, 이미 곡에 있는 파트로 된 콤보는 더 드물게 나와요',
      '넓은 화면: 스템을 열면 스템이 거의 전체를 쓰고, 오브 필드는 위에 얇게 남아 오브를 집을 수 있어요',
      '스템: 옆으로 스크롤할 때 머리 줄 틈새로 칸이 비치거나 세기 손잡이가 악기 이름 위로 올라오던 문제를 고쳤어요',
    ],
    en: [
      'Four mood orbs with a single effect each: Melody Takes Five · An Afternoon Without Bass · Drums Take the Stage · Shoulder-Shaking Swing',
      'Moods are evened out: each effect has one mood of its own, the rest stack two or three (some moods sound different now)',
      'Search lists single-effect moods first, then two- and three-effect ones',
      'Combo orbs fall less often as the song fills up, and even less when their parts are already in the song',
      'Wide screens: opening the stems gives them nearly the whole column, with a thin strip of the orb field left on top to grab orbs from',
      'Stems: cells no longer show through gaps in the header rows when scrolling sideways, and strength handles slide under the instrument names',
    ],
    ja: [
      'ムードオーブにエフェクト一つだけのものが4つ:メロディはひと休み · ベースのない午後 · ドラムだけのステージ · 肩が揺れるスイング',
      'ムードの構成を整えました:エフェクトごとに単独のムードが一つ、残りは2〜3個の組み合わせ (一部のムードは音が変わりました)',
      '検索でエフェクト一つのムードが先に、続いて2つ・3つのものが並びます',
      '曲のオーブが増えるほどコンボオーブが落ちにくくなり、パートがすでに曲にあるコンボはさらに出にくくなります',
      '広い画面:ステムを開くとステムがほぼ全体を使い、オーブフィールドは上に細く残ってオーブをつかめます',
      'ステム:横スクロール時に見出し行のすき間からマスが透けたり、強さハンドルが楽器名の上に出たりする問題を直しました',
    ],
  }],
  ['0.5.4', '2026-11-08', {
    ko: [
      '스템 모드의 ? 가 기능 둘러보기로 바뀌었어요: 섹션 · 칸 · 변주 · 필인 · 세기를 하나씩 짚어 가며 ◀ ▶ 로 넘겨 봐요',
      '🎛 편집 화면에도 ? 둘러보기가 생겼어요. 편집 화면을 처음 열면 한 번 저절로 시작해요',
      '스템: 빈 칸에서 옆으로 드래그하면 그 악기의 여러 칸을 한 번에 켜요',
      '스템: ＋ 로 넣은 섹션이 곡을 짤 때와 같은 구성(변주 · 필인 · 세기)으로 채워져요',
      '스템: 곡 뒷부분에 세트에 없던 오브가 끼어들지 않아요. 키와 변주만 바뀌어요',
      '좁은 창에서도 슬롯이 한 줄로 놓여요 · 휴대폰에서는 🎛 편집이 빠졌어요 (넓은 화면 전용)',
    ],
    en: [
      'The ? in stem mode is now a tour: it points at sections, cells, variations, fills and strength one by one, with ◀ ▶ to step through',
      'The 🎛 Edit panel gets a ? tour too, and runs it once by itself the first time you open the panel',
      'Stems: drag along a row from an empty cell to put that instrument into several cells at once',
      'Stems: a section added with ＋ is laid out the way the song plan lays it out (variations, fills, strength)',
      'Stems: later sections no longer bring in orbs that are not in your set; only the key and variations change',
      'Narrow windows keep the slots in one row · on phones 🎛 Edit is gone (wide screens only)',
    ],
    ja: [
      'ステムモードの ? が機能ツアーに:セクション・マス・変奏・フィル・強さを一つずつ指して ◀ ▶ で進みます',
      '🎛 編集画面にも ? ツアーができました。編集画面を初めて開くと一度だけ自動で始まります',
      'ステム:空のマスから横にドラッグすると、その楽器のマスをまとめてオンにできます',
      'ステム:＋ で足したセクションが、曲を組むときと同じ構成(変奏・フィル・強さ)で埋まります',
      'ステム:曲の後半にセットにないオーブが入り込まなくなりました。変わるのはキーと変奏だけです',
      '狭いウィンドウでもスロットが一列に並びます · スマホでは 🎛 編集を外しました (広い画面専用)',
    ],
  }],
  ['0.5.3', '2026-11-07', {
    ko: [
      '메뉴와 버튼이 더 깔끔해졌어요: 아이콘을 빼고 글자만 남겼어요 (서버 공유 · 모두의 곡 · 커스텀 오브만 🌐)',
      '코드 붙여넣기 버튼이 전부 비우기 위로 옮겨졌어요 · 모두의 곡 새로고침은 목록 위의 버튼으로',
      '휴대폰: 커스텀 오브가 위쪽 🌐 버튼으로 옮겨졌어요 (전부 비우기 버튼에 가려 누를 수 없던 문제를 고쳤어요)',
      '휴대폰: 좁은 화면에서도 위쪽 버튼들이 겹치지 않아요',
    ],
    en: [
      'Cleaner menus and buttons: icons removed, just the words (only Share online, Shared and Custom orbs keep a 🌐)',
      'Paste code now sits above Clear all · Shared gets a Refresh button above its list',
      'Phones: Custom orbs moved to the 🌐 button at the top (it was hidden behind Clear all and could not be tapped)',
      'Phones: the top buttons no longer overlap on narrow screens',
    ],
    ja: [
      'メニューとボタンがすっきりしました:アイコンを外して文字だけに (サーバー共有・みんなの曲・カスタムオーブだけ 🌐)',
      'コード貼り付けボタンを「すべて外す」の上へ · みんなの曲の更新は一覧の上のボタンに',
      'スマホ:カスタムオーブは上の 🌐 ボタンへ (「すべて外す」に隠れて押せなかった問題を直しました)',
      'スマホ:狭い画面でも上のボタンが重なりません',
    ],
  }],
  ['0.5.2', '2026-11-07', {
    ko: [
      '🎛 편집 칸의 손잡이로 만든 새 오브 59개: 슈퍼소 · FM · 펄스 신스, 애시드 · 와우 · 페이저 · 게이트 같은 이펙트, 비트를 깎은 칩 사운드, 느리게 부풀고 길게 울리는 앰비언트',
      '새 오브를 🎛 편집 칸에 넣으면 어떤 손잡이로 만들었는지 그대로 보여요',
      '오브를 빠르게 끌다가 멈추고 놓으면 던져지지 않고 그 자리에 놓여요',
      '오브를 재빨리 던져 넣으면 곡이 멈추고 그 오브만 미리듣기로 남던 문제를 고쳤어요',
    ],
    en: [
      '59 new orbs made with the 🎛 Edit knobs: supersaw, FM and pulse synths, effects like acid, wah, phaser and gate, bit-crushed chip sounds, and slow, long-echo ambient ones',
      'Drop one of the new orbs into the 🎛 Edit slot to see the knobs it was made with',
      'Dragging an orb fast, stopping, then letting go now drops it there instead of throwing it',
      'Fixed: a quick throw into the player could leave that orb previewing alone, silencing the song',
    ],
    ja: [
      '🎛 編集のつまみで作った新しいオーブ59個:スーパーソー・FM・パルスのシンセ、アシッド・ワウ・フェイザー・ゲートなどのエフェクト、ビットを削ったチップサウンド、ゆっくり膨らんで長く響くアンビエント',
      '新しいオーブを 🎛 編集に入れると、どのつまみで作ったかがそのまま見えます',
      'オーブを速くドラッグして止めてから離すと、投げずにその場に置かれます',
      'オーブを素早く投げ入れると、曲が止まってそのオーブだけ試聴のまま残る問題を直しました',
    ],
  }],
  ['0.5.1', '2026-11-07', {
    ko: [
      '커스텀 오브 창이 내 오브와 서버 오브 두 칸으로 나뉘었어요. 내 오브는 삭제할 수 있고, 아직 안 올린 오브는 거기서 바로 서버에 올릴 수 있어요',
      '커스텀 오브에 마우스를 올리면 누가, 언제 올렸는지 보여요. 올릴 때 닉네임을 적을 수 있어요 (생략 가능)',
      '서버 오브는 10개씩 받아요. 10개가 다 모이면 가끔 오브 비에 차례로 섞여 내리고, 다 내리거나 ↻를 누르면 새로 10개를 받아요',
      '곡에서 꺼내 오른쪽으로 던진 오브는 화면 밖으로 날아가지 않고 필드 가운데쯤 내려앉아요',
    ],
    en: [
      'The custom orbs panel is split into My orbs and Server orbs. Your own orbs can be deleted, and ones not uploaded yet can be uploaded right there',
      'Hover a custom orb to see who uploaded it and when. You can add a nickname when uploading (optional)',
      'Server orbs come 10 at a time. With all 10 in, they now and then fall with the rain in order; once all have fallen, or with ↻, 10 new ones come in',
      'An orb taken out of the song and flicked to the right now settles in the middle of the field instead of flying off the screen',
    ],
    ja: [
      'カスタムオーブの画面が「自分のオーブ」と「サーバーのオーブ」に分かれました。自分のオーブは削除でき、まだアップしていないオーブはその場でアップできます',
      'カスタムオーブにマウスを乗せると、誰がいつアップしたかが表示されます。アップ時にニックネームを付けられます(省略可)',
      'サーバーのオーブは10個ずつ受け取ります。10個そろうと、ときどき順番にオーブの雨に混ざって降り、全部降るか ↻ を押すと新しく10個受け取ります',
      '曲から取り出して右へ投げたオーブは、画面の外へ飛ばずにフィールドの中ほどに降ります',
    ],
  }],
  ['0.5.0', '2026-11-07', {
    ko: [
      '🎛 편집 칸(전문가용): 오브를 던져 넣고 어택 · 디케이 · 필터 · EQ · 이펙트를 바꿔 나만의 오브를 만들어요. 만든 오브는 서버에 올려 다른 사람과 나눌 수 있어요',
      '왼쪽에 ✦ 커스텀 오브 목록이 생겼어요: 내가 만든 오브와 다른 사람이 올린 오브',
      '변주 칸: 한 오브에 변주를 16개까지 만들고 ◀ ▶로 골라요. ✎ 악보로 변주의 음을 피아노 롤에서 직접 고치고, 🎹 풀 스케일로 12음 4옥타브까지 그릴 수 있어요',
      '스템: 4마디 칸마다 연주할 변주를 고르고, 시작 · 끝 세기와 페이드 모양을 정해요. 악기 이름 더블클릭은 그 악기만 듣기, ? 버튼에 스템 모드 도움말',
      '↶ 되돌리기 (Ctrl+Z, 최근 20개까지)',
      '오브 조합은 이제 "루프"라고 불러요. 공유한 곡에 변주와 커스텀 오브도 함께 저장돼요',
      '취향 반영: 다른 음계 오브는 악기에 맞는 분위기로 나뉘고, 내려보낸 음계는 덜 떨어져요. 분위기 오브는 한 번 넣으면 조금 더 자주 내려와요',
      '모두의 곡 목록 스크롤이 가벼워졌어요',
    ],
    en: [
      '🎛 Edit slot (advanced): throw an orb in and change its attack · decay · filter · EQ · effects to make an orb of your own, then upload it to share',
      'New ✦ Custom orbs list on the left: the orbs you made and the ones others uploaded',
      'Variation slot: up to 16 variations per orb, picked with ◀ ▶. ✎ Notes edits a variation in the piano roll, and 🎹 Full scale draws over all 12 notes and 4 octaves',
      'Stems: pick the variation each 4-bar cell plays and set its start and end strength and fade shape. Double-click an instrument to hear only it; ? opens stem mode help',
      '↶ Undo (Ctrl+Z, up to 20 back)',
      'An orb set is now called a "loop". Shared songs keep their variations and custom orbs',
      'Taste: other-scale orbs follow their instrument\'s vibe, and a scale you turn down falls less. Moods fall a little more often once the song has one',
      'The Shared list scrolls more smoothly',
    ],
    ja: [
      '🎛 編集スロット(上級者向け): オーブを投げ入れて アタック・ディケイ・フィルター・EQ・エフェクトを変え、自分だけのオーブを作れます。作ったオーブはアップロードして共有できます',
      '左に ✦ カスタムオーブ一覧ができました: 自分で作ったオーブと、ほかの人がアップしたオーブ',
      'バリエーションスロット: 1つのオーブにバリエーションを16個まで作って ◀ ▶ で選べます。✎ 楽譜でピアノロールから音を直し、🎹 フルスケールで12音・4オクターブまで描けます',
      'ステム: 4小節のマスごとに演奏するバリエーションと、開始・終わりの強さ、フェードの形を決められます。楽器名のダブルクリックでその楽器だけ聴く、? ボタンでステムモードのヘルプ',
      '↶ 元に戻す (Ctrl+Z、最近の20回まで)',
      'オーブの組み合わせは「ループ」と呼ぶようになりました。共有した曲にバリエーションとカスタムオーブも一緒に保存されます',
      '好みの反映: ほかの音階のオーブは楽器に合った雰囲気に分かれ、見送った音階は降りにくくなります。ムードは曲に入ると少し多めに降ります',
      'みんなの曲一覧のスクロールが軽くなりました',
    ],
  }],
  ['0.4.7', '2026-11-06', {
    ko: ['음량 다이얼 주변이 어두워지는 건 첫 오브 뒤 튜토리얼 안내 때만 나와요. 평소에 음량을 돌릴 때는 화면이 그대로예요'],
    en: ['The dim around the volume dial now only shows with the guide\'s volume tip after the first orb; turning the volume normally leaves the screen as it is'],
    ja: ['音量ダイヤルの周りが暗くなるのは、最初のオーブのあとのガイドの案内のときだけになりました。普段音量を回しても画面はそのままです'],
  }],
  ['0.4.6', '2026-11-06', {
    ko: ['튜토리얼 안내는 한 번에 하나씩만 떠요: 다음 안내는 지금 안내가 닫힌 뒤에 나와요', '스템을 처음 열면 오른쪽 위 ↩ 루프 모드로 버튼으로 돌아가는 법을 알려 줘요', '코드 안내에 아무 곳이나 누르면 닫힌다는 설명을 더했어요'],
    en: ['Guide notes come one at a time: the next waits until the one on screen has closed', 'The first time the stems open, the guide shows how to get back with ↩ Loop mode at the top right', 'The code note now says a click anywhere closes it'],
    ja: ['ガイドの案内は一度に一つずつ表示され、次の案内は今の案内が閉じてから出ます', 'ステムを初めて開くと、右上の ↩ ループモードへ で戻る方法を案内します', 'コードの案内に、どこかを押すと閉じることを書き加えました'],
  }],
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
// Teto's name in her colour (the vocal orbs' colour, VOCAL_ORBS in orbCatalog.js)
const teto = (html) => html.replace(/重音テト|テト|테토|Teto/g, (w) => `<b class="cl-teto">${w}</b>`);

function render(dlg) {
  const t = s();
  const lang = getLang();
  dlg.innerHTML = `
    <div class="lic-head"><b>${esc(t.title)}</b><button type="button" class="ghost lic-x" aria-label="${esc(t.close)}">✕</button></div>
    <div class="lic-body">${NOTES.map(([v, date, items]) => `
      <h3>v${esc(v)} <span class="cl-date">${esc(date)}</span></h3>
      <ul class="cl-list">${(items[lang] ?? items.en).map((i) => `<li>${teto(esc(i))}</li>`).join('')}</ul>`).join('')}
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
