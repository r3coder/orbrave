// UI text for the orb page (index.html) in Korean, English and Japanese. The language itself is
// shared with the player (src/i18n.js, localStorage 'lang'), so switching on one page carries over.
// Orb names are made from Korean word banks and stay as they are; only the interface is translated.
// Strings with {x} take values; strings used with innerHTML may contain <b>/<br>.
import { getLang, setLang } from './i18n.js';

const STR = {
  ko: {
    // header
    toPlayer: '∞ 무한 재생', toPlayerTip: '자동으로 끝없이 생성되는 재생 화면으로',
    volume: '음량',
    import: '📥 불러오기', importTip: '공유받은 코드를 붙여 넣어 불러오기',
    shuffle: '↻ 오브 새로고침', shuffleTip: '떨어지는 오브를 새로 뽑기',
    search: '🔍 오브 검색', searchTip: '이름 · 종류 · 템포 · 조성으로 오브 찾기',
    code: '</> 코드', licenses: 'ⓘ 라이선스',
    searchPh: '예: Am · bpm · 140 · 베이스 · 드럼 · 장조',
    // preset sidebar
    presets: '프리셋', presetNamePh: '이름', save: '＋ 저장', saveTip: '지금 구성을 프리셋으로 저장',
    shared: '모두의 곡', sharedRefreshTip: '서버 목록 새로고침',
    presetsEmpty: '지금 구성을<br>저장하면<br>여기 쌓여요',
    presetsEmptyRow: '지금 구성을 저장하면 여기 쌓여요',
    loading: '불러오는 중…', sharedEmpty: '아직 공유된<br>곡이 없어요', serverDownList: '서버 이용<br>불가능',
    tileTip: '끌어다 재생 버튼에 놓거나 클릭하면 불러와요',
    copyCode: '공유 코드 복사', copyCodeStem: '공유 코드 복사 (스템 포함)',
    shareServer: '서버에 공유', del: '삭제', keep: '내 프리셋에 담기',
    presetN: '프리셋 {n}', importedPreset: '불러온 프리셋', myMix: '내 구성', mySong: '내 곡',
    // player column
    clearAll: '전부 비우기', clearAllTip: '곡에 들어간 오브를 모두 빼기',
    seedsTip: '이전 변주들 (★ 즐겨찾기는 지워지지 않아요)',
    variate: '🎲 변주', variateTip: '같은 구성, 다른 멜로디와 베이스라인 (따로 바꾼 악기는 그대로)',
    ownSeedTip: '이 악기만 변주', ownSeedBack: '이 악기만 따로 바꾼 변주 · 클릭: 전체 변주(#{v})로 되돌리기',
    favTip: '지금 변주를 즐겨찾기 (목록에서 지워지지 않아요)',
    makeSong: '🎼 전체 곡 만들기', makeSongTip: '지금 구성을 중심으로 앞뒤를 만들어 한 곡으로',
    otherSong: '🎼 다른 구성으로',
    wav: '💾 WAV로 저장', wavTip: '지금 구성을 WAV 파일로 저장 (전체 곡이면 곡 전체, 아니면 16마디)',
    shareOrbs: '🔗 오브 공유', shareOrbsTip: '지금 오브 구성을 공유 코드로 복사',
    shareStems: '🔗 스템 공유', shareStemsTip: '전체 곡(스템)까지 담은 공유 코드를 복사',
    serverShare: '☁ 서버 공유', serverShareTip: '서버에 올려서 모두의 곡에 공유',
    serverDown: '☁ 서버 이용 불가능', serverDownTip: '프리셋 서버에 연결할 수 없어요 (모두의 곡 ↻로 다시 확인)',
    toLoop: '✕ 루프로',
    major: '장조', minor: '단조',
    variation: '변주',
    quiet: '…조용하네요. 오브를 잡아서 <b>재생 버튼</b>으로 던져 보세요',
    idle: '재생을 누르고, 오브를 끌어오거나 던져서 넣어 보세요',
    empty: '비어 있음',
    stripTip: '드래그: 빼기 · 미디 창으로 수정 / 우클릭: 빼기',
    tempoWhat: '템포 ×{x} {dir} (겹치면 더)', slower: '느리게', faster: '빠르게',
    moodWhat: '곡 전체에 씌우는 분위기', modeWhat: '곡 전체를 {key} {mode}로', comboWhat: '{n}개 한 번에',
    soloLoud: '🔊 이것만 크게', previewing: '🎧 미리듣기',
    hoverHint: '재생을 한 번 누르면 오브에 마우스만 올려도 미리 들을 수 있어요',
    backToSeed: '이 변주로 돌아가기', backToSeedDel: '이 변주로 돌아가기 · 우클릭: 목록에서 지우기',
    nothingToSave: '저장할 오브가 없어요', nothingToShare: '공유할 오브가 없어요',
    noSound: '저장할 소리가 없어요. 오브를 먼저 넣어 주세요', wavFail: 'WAV 저장에 실패했어요',
    rendering: '렌더링 {p}%', addOrbsFirst: '먼저 오브를 몇 개 넣어 주세요',
    copied: '✓ 복사됨', copyPrompt: '이 코드를 복사해서 공유하세요',
    // roll
    rollAdd: '＋ 곡에 추가', rollStash: '⇥ 보관함', rollErase: '지우개', rollClear: '지우기',
    rollGrabTip: '잡아서 재생 버튼이나 보관함으로 던지거나, 필드에 놓아 돌려보내기',
    rollPitched: '대충 그려도 박자와 코드에 맞춰 연주돼요',
    rollDrum: '선 = 리듬 (평평하면 8분, 기울면 16분), 높이 = 음색',
    rollThrow: '왼쪽 오브를 잡아 던지세요',
    rollKept: '<b>그린 선은 남아 있어요</b><span>오브를 던져 넣으면 그 악기로 연주돼요</span>',
    rollEmpty: '<b>오브를 이 창에 던져 악기를 고르세요</b><span>그다음 마우스로 선을 그리면 미리 들려줘요 · 우클릭으로 지우기</span>',
    rollWholeSong: '「{name}」은(는) 곡 전체를 바꾸는 오브라 미디에 넣을 필요가 없어요 — 플레이어에 넣어 주세요',
    rollNotInstrument: '「{name}」은(는) 악기가 아니라서 그릴 수 없어요',
    previewOrb: '✎ 미리듣기',
    stash: '보관함',
    // stems
    stems: '스템',
    stemHint: '칸 = 4마디 · 섹션 이름: 그 부분만 반복 · −/+: 4마디 줄이기/늘리기 · 칸 클릭: 넣기/빼기 · ✕: 이 칸에서 지우기 · #시드 클릭: 바꾸기 · 리드는 4마디마다 다른 시드',
    once: '▶ 처음부터 끝까지', onceOn: '■ 끝까지 재생 중', onceTip: '곡을 처음부터 끝까지 한 번 재생하고 멈추기',
    corner: '악기 / 섹션', bars: '{n}마디',
    secTip: '이 섹션만 반복해서 듣기 (한 번 더 누르면 전체 곡)',
    secShorter: '이 섹션을 4마디 줄이기', secLonger: '이 섹션을 4마디 늘리기',
    secSeeds: '이 섹션 전체(세로)에 시드 일괄 적용 (리드는 4마디마다 +1)',
    rowSeedsLead: '이 리드 줄 전체(가로)에 시드 일괄 적용 (4마디마다 +1)', rowSeeds: '이 악기 줄 전체(가로)에 시드 일괄 적용',
    altRow: '곡 뒷부분에서 바뀌어 들어오는 악기',
    cellOff: '클릭: 이 4마디에서 빼기', cellOn: '클릭: 이 4마디에 넣기',
    customInst: '직접 편집한 악기', changeSeed: '시드 바꾸기', cellDel: '이 4마디에서 이 악기 지우기',
    apply: '적용',
    // search
    noMatch: '맞는 오브가 없어요', searchEx: '예: Bm · F# · Eb · 장조 · bpm · 140 · 베이스 · 바나나',
    inSong: '이미 곡에 들어가 있어요', hitTip: '클릭: 오브 필드에 띄우기 · 드래그: 바로 잡아서 던지기',
    // import dialog
    importTitle: '프리셋 불러오기', importBody: '공유받은 코드를 붙여 넣으세요. 프리셋 목록에 추가되고 바로 재생돼요.',
    cancel: '취소', importOk: '불러오기', importBad: '알아볼 수 있는 오브가 없어요. 공유받은 코드를 붙여 넣어 주세요',
    // share dialog
    shTitle: '서버에 공유', shSongTitle: '노래 제목', shKind: '종류',
    shOrb: '오브', shOrbSub: '지금 넣은 오브 조합', shStem: '스템', shStemSub: '전체 곡 구성까지',
    shStemOff: '🎼 전체 곡 만들기를 하면 고를 수 있어요',
    shAuthor: '노래 저자', shOptional: '(생략 가능)', shDesc: '노래 설명',
    shBody: '서버에 공유하면 이 오브 / 스템 조합이 왼쪽 <b>모두의 곡</b> 목록에 나타나요. 누구나 그 조합을 불러와 그대로 재생하거나 이어서 바꿀 수 있고, 메인 무한 재생기에도 섞여 나와요. 저장되는 건 오브 목록, 직접 그린 선, 시드, 스템 구성과 위에 적은 글뿐이에요. 링크나 태그는 쓸 수 없고, 한 번 올린 곡은 여기서 지울 수 없어요.',
    shAgree: '이 조합을 서버에 업로드하는 것에 동의합니다.',
    shOk: '☁ 서버에 공유', uploading: '올리는 중…', shDone: '공유했어요! 모두의 곡 목록에 추가됐어요',
    shDown: '서버 이용 불가능: 연결할 수 없어요. 잠시 뒤에 다시 시도해 주세요', shFail: '올리지 못했어요: {msg}',
    // phone dock
    mSongEmpty: '🎼 전체 곡 만들기를 누르면 여기 곡 구성이 떠요', mMidi: '🎹 미디', mSong: '🎼 곡',
    // parts
    'slot.tempo': '템포', 'slot.kick': '킥', 'slot.snare': '스네어', 'slot.hat': '하이햇', 'slot.perc': '퍼커션',
    'slot.bass': '베이스', 'slot.pad': '코드', 'slot.arp': '아르페지오', 'slot.lead': '리드', 'slot.fx': '효과',
    'slot.texture': '질감', 'slot.mood': '분위기', 'slot.mode': '조성',
    'role.kick': '킥 드럼', 'role.snare': '스네어/클랩', 'role.hat': '하이햇', 'role.perc': '퍼커션', 'role.bass': '베이스',
    'role.pad': '코드 반주', 'role.arp': '아르페지오', 'role.lead': '멜로디', 'role.fx': '효과음', 'role.texture': '질감',
    'role.tempo': '템포', 'role.mood': '전체 분위기',
  },
  en: {
    toPlayer: '∞ Endless play', toPlayerTip: 'To the player that generates music endlessly',
    volume: 'Volume',
    import: '📥 Import', importTip: 'Paste a share code you received',
    shuffle: '↻ New orbs', shuffleTip: 'Draw a fresh set of falling orbs',
    search: '🔍 Find orbs', searchTip: 'Find orbs by name, kind, tempo or key',
    code: '</> Code', licenses: 'ⓘ Licenses',
    searchPh: 'e.g. Am · bpm · 140 · bass · drums · major',
    presets: 'Presets', presetNamePh: 'Name', save: '＋ Save', saveTip: 'Save the current set as a preset',
    shared: 'Shared', sharedRefreshTip: 'Reload the server list',
    presetsEmpty: 'Saved sets<br>will pile<br>up here',
    presetsEmptyRow: 'Saved sets will pile up here',
    loading: 'Loading…', sharedEmpty: 'Nothing<br>shared yet', serverDownList: 'Server<br>unavailable',
    tileTip: 'Drag onto the play button or click to load',
    copyCode: 'Copy share code', copyCodeStem: 'Copy share code (with stems)',
    shareServer: 'Share to server', del: 'Delete', keep: 'Add to my presets',
    presetN: 'Preset {n}', importedPreset: 'Imported preset', myMix: 'My set', mySong: 'My song',
    clearAll: 'Clear all', clearAllTip: 'Take every orb out of the song',
    seedsTip: 'Earlier variations (★ favourites are kept)',
    variate: '🎲 Vary', variateTip: 'Same set, different melody and bassline (instruments varied on their own stay)',
    ownSeedTip: 'Vary just this instrument', ownSeedBack: 'Own variation for this instrument · click: back to the shared one (#{v})',
    favTip: 'Favourite this variation (it stays in the list)',
    makeSong: '🎼 Make full song', makeSongTip: 'Build a whole track around the current set',
    otherSong: '🎼 Another arrangement',
    wav: '💾 Save WAV', wavTip: 'Save as a WAV file (the whole song if one is open, else 16 bars)',
    shareOrbs: '🔗 Share orbs', shareOrbsTip: 'Copy the current orbs as a share code',
    shareStems: '🔗 Share stems', shareStemsTip: 'Copy a share code that includes the full song (stems)',
    serverShare: '☁ Share online', serverShareTip: 'Upload it to the Shared list',
    serverDown: '☁ Server unavailable', serverDownTip: "Can't reach the preset server (check again with ↻ next to Shared)",
    toLoop: '✕ Back to loop',
    major: 'major', minor: 'minor',
    variation: 'variation',
    quiet: '…quiet, isn\'t it. Grab an orb and throw it at the <b>play button</b>',
    idle: 'Press play, then drag or throw orbs in',
    empty: 'empty',
    stripTip: 'Drag: take out · edit in the MIDI pane / Right-click: take out',
    tempoWhat: 'Tempo ×{x} {dir} (stacks)', slower: 'slower', faster: 'faster',
    moodWhat: 'A mood over the whole song', modeWhat: 'The whole song in {key} {mode}', comboWhat: '{n} at once',
    soloLoud: '🔊 Solo', previewing: '🎧 Preview',
    hoverHint: 'Press play once, then just hover an orb to preview it',
    backToSeed: 'Back to this variation', backToSeedDel: 'Back to this variation · Right-click: remove from list',
    nothingToSave: 'No orbs to save', nothingToShare: 'No orbs to share',
    noSound: 'Nothing to save yet. Add some orbs first', wavFail: 'Saving the WAV failed',
    rendering: 'Rendering {p}%', addOrbsFirst: 'Add a few orbs first',
    copied: '✓ Copied', copyPrompt: 'Copy this code to share it',
    rollAdd: '＋ Add to song', rollStash: '⇥ Stash', rollErase: 'Eraser', rollClear: 'Clear',
    rollGrabTip: 'Throw it at the play button or the stash, or drop it on the field to send it back',
    rollPitched: 'Draw roughly; it plays in time and in key',
    rollDrum: 'Line = rhythm (flat: 8ths, slanted: 16ths), height = tone',
    rollThrow: 'grab the orb on the left and throw it',
    rollKept: '<b>Your line is still here</b><span>Throw in an orb to play it with that instrument</span>',
    rollEmpty: '<b>Throw an orb in here to pick an instrument</b><span>Then draw a line with the mouse to hear it · right-click to erase</span>',
    rollWholeSong: '“{name}” changes the whole song, so it doesn\'t go in the MIDI pane — put it in the player',
    rollNotInstrument: '“{name}” isn\'t an instrument, so it can\'t be drawn',
    previewOrb: '✎ Preview',
    stash: 'Stash',
    stems: 'Stems',
    stemHint: 'Cell = 4 bars · section name: loop just that part · −/+: 4 bars shorter/longer · click a cell: in/out · ✕: remove here · click #seed: change · leads get a new seed every 4 bars',
    once: '▶ Start to finish', onceOn: '■ Playing to the end', onceTip: 'Play the song once from start to finish, then stop',
    corner: 'Part / section', bars: '{n} bars',
    secTip: 'Loop just this section (click again for the whole song)',
    secShorter: 'Make this section 4 bars shorter', secLonger: 'Make this section 4 bars longer',
    secSeeds: 'Set one seed for this whole section (column; leads +1 every 4 bars)',
    rowSeedsLead: 'Set one seed for this whole lead row (+1 every 4 bars)', rowSeeds: 'Set one seed for this whole row',
    altRow: 'An instrument that swaps in later in the song',
    cellOff: 'Click: take out of these 4 bars', cellOn: 'Click: put into these 4 bars',
    customInst: 'Hand-drawn instrument', changeSeed: 'Change seed', cellDel: 'Remove this instrument from these 4 bars',
    apply: 'Apply',
    noMatch: 'No matching orbs', searchEx: 'e.g. Bm · F# · Eb · major · bpm · 140 · bass · banana',
    inSong: 'Already in the song', hitTip: 'Click: float it in the field · Drag: grab and throw right away',
    importTitle: 'Import preset', importBody: 'Paste a share code. It is added to your presets and starts playing.',
    cancel: 'Cancel', importOk: 'Import', importBad: 'No orbs found in that. Paste a share code you received',
    shTitle: 'Share to server', shSongTitle: 'Song title', shKind: 'Kind',
    shOrb: 'Orbs', shOrbSub: 'The orbs in the song now', shStem: 'Stems', shStemSub: 'Including the full-song layout',
    shStemOff: 'Available after 🎼 Make full song',
    shAuthor: 'Author', shOptional: '(optional)', shDesc: 'Description',
    shBody: 'Once shared, this orb / stem set shows up in the <b>Shared</b> list on the left. Anyone can load it, play it as is or keep changing it, and it also turns up in the endless player. Only the orb list, hand-drawn lines, seeds, stem layout and the text above are stored. Links and tags aren\'t allowed, and an uploaded song can\'t be deleted from here.',
    shAgree: 'I agree to upload this set to the server.',
    shOk: '☁ Share to server', uploading: 'Uploading…', shDone: 'Shared! It has been added to the Shared list',
    shDown: "Server unavailable: can't connect. Please try again in a moment", shFail: 'Upload failed: {msg}',
    mSongEmpty: 'Press 🎼 Make full song and the song layout shows up here', mMidi: '🎹 MIDI', mSong: '🎼 Song',
    'slot.tempo': 'Tempo', 'slot.kick': 'Kick', 'slot.snare': 'Snare', 'slot.hat': 'Hi-hat', 'slot.perc': 'Perc',
    'slot.bass': 'Bass', 'slot.pad': 'Chords', 'slot.arp': 'Arp', 'slot.lead': 'Lead', 'slot.fx': 'FX',
    'slot.texture': 'Texture', 'slot.mood': 'Mood', 'slot.mode': 'Key',
    'role.kick': 'Kick drum', 'role.snare': 'Snare/clap', 'role.hat': 'Hi-hat', 'role.perc': 'Percussion', 'role.bass': 'Bass',
    'role.pad': 'Chords', 'role.arp': 'Arpeggio', 'role.lead': 'Melody', 'role.fx': 'Effects', 'role.texture': 'Texture',
    'role.tempo': 'Tempo', 'role.mood': 'Overall mood',
  },
  ja: {
    toPlayer: '∞ 無限再生', toPlayerTip: '自動で延々と生成される再生画面へ',
    volume: '音量',
    import: '📥 読み込み', importTip: '共有されたコードを貼り付けて読み込む',
    shuffle: '↻ オーブ更新', shuffleTip: '落ちてくるオーブを引き直す',
    search: '🔍 オーブ検索', searchTip: '名前・種類・テンポ・調でオーブを探す',
    code: '</> コード', licenses: 'ⓘ ライセンス',
    searchPh: '例: Am · bpm · 140 · bass · drums · major',
    presets: 'プリセット', presetNamePh: '名前', save: '＋ 保存', saveTip: '今の構成をプリセットとして保存',
    shared: 'みんなの曲', sharedRefreshTip: 'サーバー一覧を更新',
    presetsEmpty: '今の構成を<br>保存すると<br>ここに並びます',
    presetsEmptyRow: '今の構成を保存するとここに並びます',
    loading: '読み込み中…', sharedEmpty: 'まだ共有された<br>曲はありません', serverDownList: 'サーバー<br>利用不可',
    tileTip: '再生ボタンへドラッグするかクリックで読み込み',
    copyCode: '共有コードをコピー', copyCodeStem: '共有コードをコピー (ステム込み)',
    shareServer: 'サーバーに共有', del: '削除', keep: 'マイプリセットに追加',
    presetN: 'プリセット {n}', importedPreset: '読み込んだプリセット', myMix: 'マイ構成', mySong: 'マイ曲',
    clearAll: 'すべて外す', clearAllTip: '曲に入れたオーブをすべて外す',
    seedsTip: '以前のバリエーション (★ お気に入りは消えません)',
    variate: '🎲 バリエーション', variateTip: '同じ構成で、違うメロディとベースライン (個別に変えた楽器はそのまま)',
    ownSeedTip: 'この楽器だけバリエーション', ownSeedBack: 'この楽器だけのバリエーション · クリック: 全体 (#{v}) に戻す',
    favTip: '今のバリエーションをお気に入りに (一覧から消えません)',
    makeSong: '🎼 フル曲を作る', makeSongTip: '今の構成を中心に前後を作って一曲に',
    otherSong: '🎼 別の構成で',
    wav: '💾 WAVで保存', wavTip: 'WAVファイルで保存 (フル曲なら曲全体、それ以外は16小節)',
    shareOrbs: '🔗 オーブ共有', shareOrbsTip: '今のオーブ構成を共有コードとしてコピー',
    shareStems: '🔗 ステム共有', shareStemsTip: 'フル曲 (ステム) まで含む共有コードをコピー',
    serverShare: '☁ サーバー共有', serverShareTip: 'サーバーに上げてみんなの曲に共有',
    serverDown: '☁ サーバー利用不可', serverDownTip: 'プリセットサーバーに接続できません (みんなの曲の ↻ で再確認)',
    toLoop: '✕ ループに戻る',
    major: '長調', minor: '短調',
    variation: 'バリエーション',
    quiet: '…静かですね。オーブをつかんで<b>再生ボタン</b>に投げてみて',
    idle: '再生を押して、オーブをドラッグするか投げ入れてみて',
    empty: '空き',
    stripTip: 'ドラッグ: 外す · MIDI画面で編集 / 右クリック: 外す',
    tempoWhat: 'テンポ ×{x} {dir} (重ねるとさらに)', slower: '遅く', faster: '速く',
    moodWhat: '曲全体にかかる雰囲気', modeWhat: '曲全体を {key} {mode}に', comboWhat: '{n}個まとめて',
    soloLoud: '🔊 これだけ大きく', previewing: '🎧 試聴',
    hoverHint: '一度再生を押すと、オーブにマウスを乗せるだけで試聴できます',
    backToSeed: 'このバリエーションに戻る', backToSeedDel: 'このバリエーションに戻る · 右クリック: 一覧から削除',
    nothingToSave: '保存するオーブがありません', nothingToShare: '共有するオーブがありません',
    noSound: '保存する音がありません。先にオーブを入れてください', wavFail: 'WAVの保存に失敗しました',
    rendering: 'レンダリング {p}%', addOrbsFirst: '先にオーブをいくつか入れてください',
    copied: '✓ コピー済み', copyPrompt: 'このコードをコピーして共有してください',
    rollAdd: '＋ 曲に追加', rollStash: '⇥ 保管庫', rollErase: '消しゴム', rollClear: 'クリア',
    rollGrabTip: 'つかんで再生ボタンか保管庫に投げるか、フィールドに置いて戻す',
    rollPitched: 'ざっくり描いてもリズムとコードに合わせて演奏されます',
    rollDrum: '線 = リズム (平らなら8分、傾くと16分)、高さ = 音色',
    rollThrow: '左のオーブをつかんで投げてください',
    rollKept: '<b>描いた線は残っています</b><span>オーブを投げ入れるとその楽器で演奏されます</span>',
    rollEmpty: '<b>オーブをここに投げて楽器を選んでください</b><span>次にマウスで線を描くと試聴できます · 右クリックで消去</span>',
    rollWholeSong: '「{name}」は曲全体を変えるオーブなのでMIDIに入れる必要はありません — プレイヤーに入れてください',
    rollNotInstrument: '「{name}」は楽器ではないので描けません',
    previewOrb: '✎ 試聴',
    stash: '保管庫',
    stems: 'ステム',
    stemHint: 'マス = 4小節 · セクション名: その部分だけループ · −/+: 4小節短く/長く · マスをクリック: 入れる/外す · ✕: このマスから消す · #シードをクリック: 変更 · リードは4小節ごとに別シード',
    once: '▶ 最初から最後まで', onceOn: '■ 最後まで再生中', onceTip: '曲を最初から最後まで一度再生して止める',
    corner: '楽器 / セクション', bars: '{n}小節',
    secTip: 'このセクションだけループ (もう一度押すと曲全体)',
    secShorter: 'このセクションを4小節短く', secLonger: 'このセクションを4小節長く',
    secSeeds: 'このセクション全体 (縦) にシードを一括適用 (リードは4小節ごとに+1)',
    rowSeedsLead: 'このリードの行全体 (横) にシードを一括適用 (4小節ごとに+1)', rowSeeds: 'この楽器の行全体 (横) にシードを一括適用',
    altRow: '曲の後半で入れ替わって入る楽器',
    cellOff: 'クリック: この4小節から外す', cellOn: 'クリック: この4小節に入れる',
    customInst: '手描きの楽器', changeSeed: 'シードを変更', cellDel: 'この4小節からこの楽器を消す',
    apply: '適用',
    noMatch: '一致するオーブがありません', searchEx: '例: Bm · F# · Eb · major · bpm · 140 · bass · banana',
    inSong: 'すでに曲に入っています', hitTip: 'クリック: フィールドに浮かべる · ドラッグ: そのままつかんで投げる',
    importTitle: 'プリセット読み込み', importBody: '共有されたコードを貼り付けてください。プリセット一覧に追加され、すぐ再生されます。',
    cancel: 'キャンセル', importOk: '読み込む', importBad: '認識できるオーブがありません。共有されたコードを貼り付けてください',
    shTitle: 'サーバーに共有', shSongTitle: '曲名', shKind: '種類',
    shOrb: 'オーブ', shOrbSub: '今入れているオーブの組み合わせ', shStem: 'ステム', shStemSub: 'フル曲の構成まで',
    shStemOff: '🎼 フル曲を作ると選べます',
    shAuthor: '作者', shOptional: '(省略可)', shDesc: '曲の説明',
    shBody: 'サーバーに共有すると、このオーブ / ステムの組み合わせが左の<b>みんなの曲</b>一覧に表示されます。誰でも読み込んでそのまま再生したり、続けて変えたりでき、無限再生にも混ざって流れます。保存されるのはオーブ一覧、手描きの線、シード、ステム構成と上に書いた文だけです。リンクやタグは使えず、一度上げた曲はここからは削除できません。',
    shAgree: 'この組み合わせをサーバーにアップロードすることに同意します。',
    shOk: '☁ サーバーに共有', uploading: 'アップロード中…', shDone: '共有しました！みんなの曲一覧に追加されました',
    shDown: 'サーバー利用不可: 接続できません。少し後でもう一度お試しください', shFail: 'アップロードできませんでした: {msg}',
    mSongEmpty: '🎼 フル曲を作るを押すと、ここに曲の構成が表示されます', mMidi: '🎹 MIDI', mSong: '🎼 曲',
    'slot.tempo': 'テンポ', 'slot.kick': 'キック', 'slot.snare': 'スネア', 'slot.hat': 'ハイハット', 'slot.perc': 'パーカス',
    'slot.bass': 'ベース', 'slot.pad': 'コード', 'slot.arp': 'アルペジオ', 'slot.lead': 'リード', 'slot.fx': 'エフェクト',
    'slot.texture': '質感', 'slot.mood': '雰囲気', 'slot.mode': '調',
    'role.kick': 'キックドラム', 'role.snare': 'スネア/クラップ', 'role.hat': 'ハイハット', 'role.perc': 'パーカッション', 'role.bass': 'ベース',
    'role.pad': 'コード伴奏', 'role.arp': 'アルペジオ', 'role.lead': 'メロディ', 'role.fx': '効果音', 'role.texture': '質感',
    'role.tempo': 'テンポ', 'role.mood': '全体の雰囲気',
  },
};

// full-song section names are stored in Korean (they travel inside shared presets); shown translated
const SECTIONS = {
  인트로: { en: 'Intro', ja: 'イントロ' }, 빌드업: { en: 'Build-up', ja: 'ビルドアップ' }, 드롭: { en: 'Drop', ja: 'ドロップ' },
  브레이크: { en: 'Break', ja: 'ブレイク' }, 브리지: { en: 'Bridge', ja: 'ブリッジ' }, 아웃트로: { en: 'Outro', ja: 'アウトロ' },
  섹션: { en: 'Section', ja: 'セクション' },
};
export const secName = (name) => (getLang() === 'ko' ? name : name.replace(/^\S+/, (w) => SECTIONS[w]?.[getLang()] ?? w));

export const ot = (key, vars = {}) =>
  String(STR[getLang()]?.[key] ?? STR.ko[key] ?? key).replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? '');

// every translation of a key, for search (so "bass", "베이스" and "ベース" all find bass orbs)
export const allLangs = (key) => Object.values(STR).map((d) => d[key] ?? '').join(' ');

// Fills the static page text: data-i18n (text), data-i18n-html, data-i18n-title, data-i18n-ph.
export function applyStatic(root = document) {
  for (const el of root.querySelectorAll('[data-i18n]')) el.textContent = ot(el.dataset.i18n);
  for (const el of root.querySelectorAll('[data-i18n-html]')) el.innerHTML = ot(el.dataset.i18nHtml);
  for (const el of root.querySelectorAll('[data-i18n-title]')) el.title = ot(el.dataset.i18nTitle);
  for (const el of root.querySelectorAll('[data-i18n-ph]')) el.placeholder = ot(el.dataset.i18nPh);
}

// KR / EN / JP buttons; onChange re-renders whatever the page builds in script
export const LANG_LABELS = { ko: 'KR', en: 'EN', ja: 'JP' };
export function mountLangButtons(box, onChange) {
  const titles = { ko: '한국어', en: 'English', ja: '日本語' };
  const mark = () => box.querySelectorAll('button').forEach((b) => b.classList.toggle('on', b.dataset.lang === getLang()));
  for (const code of Object.keys(LANG_LABELS)) {
    const b = document.createElement('button');
    b.type = 'button';
    b.dataset.lang = code;
    b.textContent = LANG_LABELS[code];
    b.title = titles[code];
    b.onclick = () => {
      if (code === getLang()) return;
      setLang(code);
      mark();
      applyStatic();
      onChange?.();
      window.dispatchEvent(new Event('langchange'));
    };
    box.append(b);
  }
  setLang(getLang()); // sets <html lang>
  mark();
  applyStatic();
}
