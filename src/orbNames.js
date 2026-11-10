// English / Japanese names for the orbs. Orb names are made in Korean (orbCatalog.js) and the
// Korean name stays the orb's real name inside the program; this only changes what is shown.
// Generated names are "<adjective> <noun>" (sometimes with a number), translated word by word.
// Each entry is ko: [en, ja].

const ADJ = {
  격렬한: ['Furious', '激しい'], 그루브한: ['Groovy', 'グルーヴィな'], 졸린: ['Sleepy', '眠い'], 수줍은: ['Shy', '内気な'],
  반짝이는: ['Twinkling', 'きらめく'], 끈적한: ['Sticky', 'ねばねば'], 몽글몽글: ['Fluffy', 'もこもこ'], 삐딱한: ['Crooked', 'ひねくれた'],
  우아한: ['Elegant', '優雅な'], 수상한: ['Suspicious', '怪しい'], 배고픈: ['Hungry', '腹ぺこの'], 춤추는: ['Dancing', '踊る'],
  녹아내리는: ['Melting', '溶けゆく'], 얼어붙은: ['Frozen', '凍りついた'], 화난: ['Angry', '怒った'], 행복한: ['Happy', '幸せな'],
  외로운: ['Lonely', '寂しい'], 들뜬: ['Giddy', '浮かれた'], '거꾸로 걷는': ['Backwards-Walking', '後ろ歩きの'], 꿈꾸는: ['Dreaming', '夢見る'],
  미끄러운: ['Slippery', 'つるつるの'], 빛나는: ['Shining', '輝く'], 낡은: ['Worn-Out', '古びた'], 투명한: ['Transparent', '透明な'],
  뜨거운: ['Hot', '熱い'], 차가운: ['Cold', '冷たい'], 보랏빛: ['Violet', '紫色の'], 초록빛: ['Green', '緑色の'],
  은빛: ['Silver', '銀色の'], 황금빛: ['Golden', '黄金色の'], '고장 난': ['Broken', '壊れた'], 날아다니는: ['Flying', '飛び回る'],
  부푼: ['Puffed-Up', 'ふくらんだ'], 쫀득한: ['Chewy', 'もちもちの'], 바삭한: ['Crispy', 'サクサクの'], 출렁이는: ['Sloshing', '揺れる'],
  성난: ['Raging', '荒ぶる'], 조용한: ['Quiet', '静かな'], 시끄러운: ['Noisy', 'うるさい'], '우주에서 온': ['Space-Born', '宇宙から来た'],
  지하실의: ['Basement', '地下室の'], 새벽의: ['Dawn', '夜明けの'], 한밤의: ['Midnight', '真夜中の'], '비 맞은': ['Rain-Soaked', '雨に濡れた'],
  깨어난: ['Awakened', '目覚めた'], '길 잃은': ['Lost', '迷子の'], 뒤집힌: ['Upside-Down', 'ひっくり返った'], 엉뚱한: ['Quirky', '突拍子もない'],
  느긋한: ['Laid-Back', 'のんびりした'], 재빠른: ['Nimble', 'すばやい'], 무거운: ['Heavy', '重い'], 가벼운: ['Light', '軽い'],
  흔들리는: ['Wobbly', '揺らぐ'], 미쳐버린: ['Crazed', '狂った'], 귀여운: ['Cute', 'かわいい'], 비밀스러운: ['Secret', '秘密の'],
  전설의: ['Legendary', '伝説の'], 네온빛: ['Neon', 'ネオン色の'], 레트로: ['Retro', 'レトロな'], '꿀 바른': ['Honey-Glazed', 'はちみつ塗りの'],
  매콤한: ['Spicy', 'ピリ辛の'], 새콤한: ['Sour', '甘酸っぱい'], 달콤한: ['Sweet', '甘い'], 폭신한: ['Squishy', 'ふかふかの'],
  끝없는: ['Endless', '果てしない'], '반쯤 녹은': ['Half-Melted', '半分溶けた'], '졸음 오는': ['Drowsy', '眠くなる'], '펄쩍 뛰는': ['Leaping', '跳びはねる'],
  '빙빙 도는': ['Spinning', 'ぐるぐる回る'], 삐걱대는: ['Creaky', 'きしむ'], 번쩍이는: ['Flashing', 'ぴかっと光る'],
  고독한: ['Solitary', '孤独な'], '기분 좋은': ['Cheerful', 'ご機嫌な'], 심술궂은: ['Grumpy', '意地悪な'], 용감한: ['Brave', '勇敢な'],
  '겁 많은': ['Timid', '臆病な'], 수다스러운: ['Chatty', 'おしゃべりな'], '잠 못 드는': ['Sleepless', '眠れない'], 거대한: ['Giant', '巨大な'],
  조그만: ['Tiny', 'ちっちゃな'], 지글지글: ['Sizzling', 'じゅうじゅう'], 말랑한: ['Squashy', 'ぷにぷにの'],
  단단한: ['Solid', '硬い'], 축축한: ['Damp', 'じめじめした'], 메마른: ['Parched', '干からびた'], 향긋한: ['Fragrant', '香り高い'],
};

const NOUN = {
  심장: ['Heart', 'ハート'], 망치: ['Hammer', 'ハンマー'], 코끼리: ['Elephant', 'ゾウ'], 발걸음: ['Footsteps', '足音'], 북소리: ['Drumbeat', '太鼓の音'],
  거인: ['Giant', '巨人'], 공룡: ['Dinosaur', '恐竜'], 대포: ['Cannon', '大砲'], 지진: ['Earthquake', '地震'], 고릴라: ['Gorilla', 'ゴリラ'],
  쇠공: ['Iron Ball', '鉄球'], 주먹: ['Fist', 'げんこつ'], 하마: ['Hippo', 'カバ'], 천둥: ['Thunder', '雷鳴'], 문짝: ['Door', 'ドア'],
  트럭: ['Truck', 'トラック'], 바위: ['Boulder', '岩'], 맥박: ['Pulse', '脈拍'], 탱크: ['Tank', '戦車'], 곰: ['Bear', 'クマ'],
  손뼉: ['Handclap', '手拍子'], 채찍: ['Whip', 'ムチ'], 박수: ['Applause', '拍手'], 폭죽: ['Firecracker', '爆竹'], 팝콘: ['Popcorn', 'ポップコーン'],
  따귀: ['Slap', 'ビンタ'], 뺨: ['Cheek', 'ほっぺ'], 종이컵: ['Paper Cup', '紙コップ'], 깡통: ['Tin Can', '空き缶'], 번개: ['Lightning', '稲妻'],
  뻥튀기: ['Rice Puff', 'ポン菓子'], 고무줄: ['Rubber Band', '輪ゴム'], 상자: ['Box', '箱'], 신문지: ['Newspaper', '新聞紙'], 풍선: ['Balloon', '風船'],
  비닐봉지: ['Plastic Bag', 'ビニール袋'], 탁구공: ['Ping-Pong Ball', 'ピンポン玉'], 냄비: ['Pot', '鍋'], 젓가락: ['Chopsticks', '箸'], 박쥐: ['Bat', 'コウモリ'],
  모래알: ['Sand Grain', '砂粒'], 빗방울: ['Raindrop', '雨粒'], 반짝이: ['Glitter', 'ラメ'], 은가루: ['Silver Dust', '銀の粉'], 귀뚜라미: ['Cricket', 'コオロギ'],
  생쥐: ['Mouse', 'ネズミ'], 동전: ['Coin', '小銭'], 열쇠꾸러미: ['Key Ring', '鍵束'], 설탕: ['Sugar', '砂糖'], 별가루: ['Stardust', '星くず'],
  지퍼: ['Zipper', 'ファスナー'], 참새: ['Sparrow', 'スズメ'], 가위: ['Scissors', 'ハサミ'], 소금: ['Salt', '塩'], 방울: ['Bell', '鈴'],
  유리조각: ['Glass Shard', 'ガラス片'], 눈송이: ['Snowflake', '雪の結晶'], 벌레: ['Bug', '虫'], 시계: ['Clock', '時計'], 이빨: ['Teeth', '歯'],
  원숭이: ['Monkey', 'サル'], 앵무새: ['Parrot', 'オウム'], 코코넛: ['Coconut', 'ココナッツ'], 대나무: ['Bamboo', '竹'], 조개: ['Clam', '貝'],
  나무토막: ['Wood Block', '木片'], 정글: ['Jungle', 'ジャングル'], 축제: ['Festival', 'お祭り'], 장난감: ['Toy', 'おもちゃ'], 도깨비: ['Goblin', 'トッケビ'],
  개구리: ['Frog', 'カエル'], 딱따구리: ['Woodpecker', 'キツツキ'], 돌멩이: ['Pebble', '小石'], 마라카스: ['Maracas', 'マラカス'], 캐스터네츠: ['Castanets', 'カスタネット'],
  장구: ['Janggu', 'チャング'], 탬버린: ['Tambourine', 'タンバリン'], 수다쟁이: ['Chatterbox', 'おしゃべり屋'], 너구리: ['Raccoon', 'タヌキ'], 펭귄: ['Penguin', 'ペンギン'],
  지렁이: ['Earthworm', 'ミミズ'], 바나나: ['Banana', 'バナナ'], 고래: ['Whale', 'クジラ'], 문어: ['Octopus', 'タコ'], 젤리: ['Jelly', 'ゼリー'],
  용암: ['Lava', '溶岩'], 늪: ['Swamp', '沼'], 지하철: ['Subway', '地下鉄'], 뱀장어: ['Eel', 'ウナギ'], 껌: ['Bubblegum', 'ガム'],
  엔진: ['Engine', 'エンジン'], 거미: ['Spider', 'クモ'], 곰팡이: ['Mold', 'カビ'], 진흙: ['Mud', '泥'], 슬라임: ['Slime', 'スライム'],
  해파리: ['Jellyfish', 'クラゲ'], 오징어: ['Squid', 'イカ'], 두꺼비: ['Toad', 'ヒキガエル'], 잠수함: ['Submarine', '潜水艦'], 코뿔소: ['Rhino', 'サイ'],
  소시지: ['Sausage', 'ソーセージ'], 맨홀: ['Manhole', 'マンホール'], 화산: ['Volcano', '火山'], 버섯: ['Mushroom', 'キノコ'], 뱀: ['Snake', 'ヘビ'],
  쿠션: ['Cushion', 'クッション'], 낙타: ['Camel', 'ラクダ'], 메기: ['Catfish', 'ナマズ'], 도마뱀: ['Lizard', 'トカゲ'], 고구마: ['Sweet Potato', 'サツマイモ'],
  하수구: ['Sewer', '下水道'], 솜사탕: ['Cotton Candy', '綿あめ'], 구름: ['Cloud', '雲'], 오로라: ['Aurora', 'オーロラ'], 안개: ['Fog', '霧'],
  담요: ['Blanket', '毛布'], 은하수: ['Milky Way', '天の川'], 꿈: ['Dream', '夢'], 노을: ['Sunset', '夕焼け'], 비눗방울: ['Soap Bubble', 'シャボン玉'],
  이불: ['Duvet', '布団'], 호수: ['Lake', '湖'], 숲: ['Forest', '森'], 새벽: ['Dawn', '夜明け'], 성당: ['Cathedral', '聖堂'],
  우주: ['Cosmos', '宇宙'], 파도: ['Wave', '波'], 커튼: ['Curtain', 'カーテン'], 눈밭: ['Snowfield', '雪原'], 정원: ['Garden', '庭園'],
  온천: ['Hot Spring', '温泉'], 베개: ['Pillow', '枕'], 회전목마: ['Carousel', 'メリーゴーランド'], 유리구슬: ['Glass Marble', 'ビー玉'], 계단: ['Staircase', '階段'],
  오르골: ['Music Box', 'オルゴール'], 반딧불: ['Firefly', 'ホタル'], 사다리: ['Ladder', 'はしご'], 풍차: ['Windmill', '風車'], 팽이: ['Spinning Top', 'コマ'],
  요정: ['Fairy', '妖精'], 톱니바퀴: ['Cogwheel', '歯車'], 시계태엽: ['Clockwork', 'ぜんまい'], 물방울: ['Water Drop', 'しずく'], 구슬: ['Bead', '玉'],
  별똥별: ['Shooting Star', '流れ星'], 나선: ['Spiral', '螺旋'], 무지개: ['Rainbow', '虹'], 핀볼: ['Pinball', 'ピンボール'], 종소리: ['Chime', '鐘の音'],
  자전거: ['Bicycle', '自転車'], 유령: ['Ghost', '幽霊'], 갈매기: ['Seagull', 'カモメ'], 로봇: ['Robot', 'ロボット'], 해적: ['Pirate', '海賊'],
  카우보이: ['Cowboy', 'カウボーイ'], 마법사: ['Wizard', '魔法使い'], 외계인: ['Alien', '宇宙人'], 늑대: ['Wolf', 'オオカミ'], 고양이: ['Cat', 'ネコ'],
  가수: ['Singer', '歌手'], 나팔수: ['Bugler', 'ラッパ吹き'], 돌고래: ['Dolphin', 'イルカ'], 백조: ['Swan', '白鳥'], 독수리: ['Eagle', 'ワシ'],
  광대: ['Clown', 'ピエロ'], 기사: ['Knight', '騎士'], 해마: ['Seahorse', 'タツノオトシゴ'], 엘리베이터: ['Elevator', 'エレベーター'], 로켓: ['Rocket', 'ロケット'],
  사이렌: ['Siren', 'サイレン'], 소방차: ['Fire Truck', '消防車'], 우주선: ['Spaceship', '宇宙船'], 비행기: ['Airplane', '飛行機'], 폭포: ['Waterfall', '滝'],
  롤러코스터: ['Roller Coaster', 'ジェットコースター'], 회오리: ['Whirlwind', 'つむじ風'], 레이저: ['Laser', 'レーザー'], 타임머신: ['Time Machine', 'タイムマシン'], 경보: ['Alarm', '警報'],
  유성: ['Meteor', '流星'], 기차: ['Train', '汽車'], 레코드: ['Record', 'レコード'], 라디오: ['Radio', 'ラジオ'], 빗소리: ['Rain Sound', '雨音'],
  모닥불: ['Campfire', '焚き火'], 바람: ['Wind', '風'], 카페: ['Café', 'カフェ'], 시냇물: ['Brook', '小川'], 풀벌레: ['Grass Bugs', '草むらの虫'],
  다락방: ['Attic', '屋根裏部屋'], 지붕: ['Rooftop', '屋根'], 파티: ['Party', 'パーティー'], 세트: ['Set', 'セット'], 정식: ['Set Meal', '定食'],
  도시락: ['Lunchbox', 'お弁当'], 오케스트라: ['Orchestra', 'オーケストラ'], 밴드: ['Band', 'バンド'], 여행: ['Journey', '旅'], 버스: ['Bus', 'バス'],
  놀이공원: ['Amusement Park', '遊園地'], 클럽: ['Club', 'クラブ'], 고속도로: ['Highway', '高速道路'], 지하실: ['Basement', '地下室'], 해변: ['Beach', '海辺'],
  뷔페: ['Buffet', 'ビュッフェ'], 콘서트: ['Concert', 'コンサート'], 원정대: ['Expedition', '遠征隊'], 피크닉: ['Picnic', 'ピクニック'], 서커스: ['Circus', 'サーカス'],
  도시: ['City', '都市'], 동굴: ['Cave', '洞窟'], 메아리: ['Echo', 'こだま'], 수족관: ['Aquarium', '水族館'], 사막: ['Desert', '砂漠'],
  거울: ['Mirror', '鏡'], 터널: ['Tunnel', 'トンネル'], 온실: ['Greenhouse', '温室'], 운동장: ['Playground', '運動場'], 꿈속: ['Dreamland', '夢の中'],
  놀이터: ['Playpark', '公園'], 바닷속: ['Deep Sea', '海の中'], 구름나라: ['Cloudland', '雲の国'], 빈방: ['Empty Room', '空き部屋'], 기억: ['Memory', '記憶'],
  필름: ['Film', 'フィルム'], 비디오테이프: ['Videotape', 'ビデオテープ'], 블랙홀: ['Black Hole', 'ブラックホール'], 거북이: ['Turtle', 'カメ'], 나무늘보: ['Sloth', 'ナマケモノ'],
  달팽이: ['Snail', 'カタツムリ'], 잠꾸러기: ['Sleepyhead', '寝ぼすけ'], 빙하: ['Glacier', '氷河'], 할머니: ['Grandma', 'おばあちゃん'], 코알라: ['Koala', 'コアラ'],
  기관차: ['Locomotive', '機関車'], 치타: ['Cheetah', 'チーター'], 벌새: ['Hummingbird', 'ハチドリ'], 롤러스케이트: ['Roller Skates', 'ローラースケート'], 오토바이: ['Motorbike', 'バイク'],
  다람쥐: ['Squirrel', 'リス'], 혜성: ['Comet', '彗星'], 토끼: ['Rabbit', 'ウサギ'], 경주마: ['Racehorse', '競走馬'], 햇살: ['Sunshine', '日差し'],
  아침: ['Morning', '朝'], 소풍: ['Outing', '遠足'], 산책: ['Stroll', '散歩'], 여름: ['Summer', '夏'], 퍼레이드: ['Parade', 'パレード'],
  불꽃: ['Sparks', '火花'], 생일: ['Birthday', '誕生日'], 달빛: ['Moonlight', '月明かり'], 그림자: ['Shadow', '影'], 빗속: ['In the Rain', '雨の中'],
  골목: ['Alley', '路地'], 밤바다: ['Night Sea', '夜の海'], 비밀: ['Secret', '秘密'], 폐허: ['Ruins', '廃墟'], 심야: ['Late Night', '深夜'],
  겨울: ['Winter', '冬'], 미로: ['Maze', '迷路'], 불꽃놀이: ['Fireworks', '花火'], 첫사랑: ['First Love', '初恋'], 운동회: ['Sports Day', '運動会'],
  눈물: ['Tears', '涙'], 고백: ['Confession', '告白'], 이별: ['Farewell', '別れ'], 정전: ['Blackout', '停電'],
};

// the hand-made orbs
const FIXED = {
  // vocal orbs (VOCAL_ORBS in orbCatalog.js)
  '빛 속에서 노래하는 테토': ['Teto Singing in the Light', '光の中で歌うテト'],
  '라라라 흥얼거리는 테토': ['Teto Humming La La La', 'ラララと口ずさむテト'],
  '화음 쌓는 테토': ['Teto Stacking Chords', 'ハモりを重ねるテト'],
  '심장 뛰는 쿵쿵': ['Heart-Pounding Thump', 'ドキドキ鼓動'],
  '비틀거리는 발걸음': ['Stumbling Footsteps', 'よろめく足音'],
  '찰싹! 손뼉 파티': ['Smack! Clap Party', 'パチン！手拍子パーティー'],
  '먼지 낀 낮잠': ['Dusty Nap', 'ほこりまみれの昼寝'],
  '잘게 부서진 반짝이': ['Crushed Glitter', '粉々のラメ'],
  '들썩이는 어깨': ['Bouncing Shoulders', '揺れる肩'],
  '정글의 수다쟁이': ['Jungle Chatterbox', 'ジャングルのおしゃべり屋'],
  '폭주하는 드럼통': ['Runaway Drum Barrel', '暴走するドラム缶'],
  '꿈틀대는 지렁이': ['Wriggling Earthworm', 'うねうねミミズ'],
  '격렬한 바나나': ['Furious Banana', '激しいバナナ'],
  '땅속 고래의 하품': ['Yawn of the Underground Whale', '地底クジラのあくび'],
  '구름 위 솜사탕': ['Cotton Candy on a Cloud', '雲の上の綿あめ'],
  '새벽 세 시의 고백': ['3 A.M. Confession', '午前三時の告白'],
  '빙글빙글 회전목마': ['Round-and-Round Carousel', 'くるくるメリーゴーランド'],
  '유리구슬 빗방울': ['Glass-Marble Raindrops', 'ビー玉の雨粒'],
  '하늘 나는 오징어': ['Flying Squid', '空飛ぶイカ'],
  '휘파람 부는 유령': ['Whistling Ghost', '口笛を吹く幽霊'],
  '우주행 엘리베이터': ['Elevator to Space', '宇宙行きエレベーター'],
  '낡은 레코드의 한숨': ['Sigh of an Old Record', '古いレコードのため息'],
  '느릿느릿 블랙홀': ['Sluggish Black Hole', 'のろのろブラックホール'],
  '새하얀 폭주기관차': ['Snow-White Runaway Train', '真っ白な暴走機関車'],
  '풀코스 드럼 세트': ['Full-Course Drum Kit', 'フルコースのドラムセット'],
  '한밤의 고속도로': ['Midnight Highway', '真夜中の高速道路'],
  '애시드 폭주족': ['Acid Speed Gang', 'アシッド暴走族'],
  '비 오는 날 다락방': ['Attic on a Rainy Day', '雨の日の屋根裏部屋'],
  '물속에 잠긴 도시': ['Sunken City', '水に沈んだ都市'],
  '고장 난 라디오': ['Broken Radio', '壊れたラジオ'],
  '메아리 동굴 탐험': ['Echo Cave Expedition', 'こだま洞窟探検'],
  '술 취한 메아리': ['Drunken Echo', '酔っぱらったこだま'],
  '잠깐 숨 고르기': ['Catching a Breath', 'ひと息ついて'],
  '햇살 가득 장조': ['Sun-Filled Major', '日差しいっぱいの長調'],
  '달빛 아래 단조': ['Minor by Moonlight', '月明かりの短調'],
  '쿵쿵 울리는 저음': ['Thumping Lows', 'ずんずん響く低音'],
  '땅이 흔들리는 초저음': ['Earth-Shaking Sub', '地面が揺れる超低音'],
  '가슴을 치는 펀치': ['Punch to the Chest', '胸に響くパンチ'],
  '반짝반짝 고음': ['Sparkly Highs', 'キラキラ高音'],
  '공기 한 스푼': ['A Spoonful of Air', '空気ひとさじ'],
  '웃는 얼굴 커브': ['Smiley Curve', 'スマイルカーブ'],
  '전화기 너머 목소리': ['Voice on the Phone', '電話越しの声'],
  '깃털처럼 가볍게': ['Light as a Feather', '羽のように軽く'],
  '포근한 솜이불': ['Cozy Quilt', 'ふかふかの綿布団'],
  '멜로디는 잠시 쉬어': ['Melody Takes Five', 'メロディはひと休み'],
  '베이스 없는 오후': ['An Afternoon Without Bass', 'ベースのない午後'],
  '드럼만 남은 무대': ['Drums Take the Stage', 'ドラムだけのステージ'],
  '어깨가 들썩이는 스윙': ['Shoulder-Shaking Swing', '肩が揺れるスイング'],
};

// words that turn up in an orb's small "kind" line
const KIND_WORDS = {
  장조: ['major', '長調'], 단조: ['minor', '短調'],
  먹먹: ['muffled', 'こもった'], 숨쉬는: ['breathing', '呼吸する'], 얇은: ['thin', '薄い'], '8비트': ['8-bit', '8ビット'],
  깨진: ['broken', '割れた'], 넓은: ['wide', '広い'], 메아리: ['echo', 'こだま'], 빙글: ['swirl', 'ぐるり'],
  찌그러진: ['crushed', 'ひしゃげた'], 말하는: ['talking', 'しゃべる'], 거울: ['mirror', '鏡'], 구멍: ['holes', '穴あき'], 스윙: ['swing', 'スイング'],
  저음: ['bass', '低音'], 초저음: ['sub', '超低音'], 중저음: ['low-mid', '中低音'], 고음: ['treble', '高音'], 중음만: ['mids only', '中音だけ'],
  강화: ['boost', 'ブースト'], 줄이기: ['cut', 'カット'], 공기감: ['air', '空気感'],
  필터: ['filter', 'フィルター'], 공간: ['space', '空間'], 질감: ['texture', '質感'], 움직임: ['motion', '動き'], 밸런스: ['balance', 'バランス'],
  드럼: ['drums', 'ドラム'], 베이스: ['bass', 'ベース'], 멜로디: ['melody', 'メロディ'], 리듬: ['rhythm', 'リズム'],
  줄임: ['down', '控えめ'], 강조: ['up front', '強調'],
};

const ADJ_KEYS = Object.keys(ADJ).sort((a, b) => b.length - a.length); // longest first: "고장 난" before "고장"
const LANG_I = { en: 0, ja: 1 };
const cache = { en: new Map(), ja: new Map() };

function translate(ko, i) {
  if (FIXED[ko]) return FIXED[ko][i];
  // key orbs: "C# 장조의 축제"
  const key = /^([A-G]#?) (장조|단조)의 (.+)$/.exec(ko);
  if (key && NOUN[key[3]]) {
    const [, tonic, mode, noun] = key;
    return i === 0
      ? `${NOUN[noun][0]} in ${tonic}${mode === '단조' ? ' Minor' : ' Major'}`
      : `${tonic}${KIND_WORDS[mode][1]}の${NOUN[noun][1]}`;
  }
  // "<adjective> <noun>[ <number>]"
  for (const adj of ADJ_KEYS) {
    if (!ko.startsWith(adj + ' ')) continue;
    const m = /^(\S+)( \d+)?$/.exec(ko.slice(adj.length + 1));
    if (!m || !NOUN[m[1]]) break;
    const num = m[2] ?? '';
    return i === 0 ? `${ADJ[adj][0]} ${NOUN[m[1]][0]}${num}` : `${ADJ[adj][1]}${NOUN[m[1]][1]}${num}`;
  }
  return ko; // anything unknown is shown as it is
}

// the name to show for a Korean orb name in `lang` ('ko' | 'en' | 'ja')
export function orbNameIn(ko, lang) {
  const i = LANG_I[lang];
  if (i === undefined || !ko) return ko;
  let t = cache[lang].get(ko);
  if (t === undefined) cache[lang].set(ko, (t = translate(ko, i)));
  return t;
}

// the small "kind" line ("mood · 먹먹+넓은", "key · A 장조")
export function orbKindIn(kind, lang) {
  const i = LANG_I[lang];
  if (i === undefined || !kind || !/[가-힣]/.test(kind)) return kind;
  return kind.replace(/[가-힣0-9]*[가-힣]+/g, (w) => KIND_WORDS[w]?.[i] ?? w);
}

// for checking: every Korean name that would be left untranslated
export const untranslated = (names) => names.filter((n) => translate(n, 0) === n || translate(n, 1) === n);
