/* =========================================================
   将棋王 2026 〜 天下統一・戦国決戦 〜
   【ファイル 1 / 3：game_data.js - 戦国英傑・兵法データ絵巻】
   ========================================================= */

// 日本将棋連盟・公式駒定義および換算テーブル
const PIECES = {
  OU: '王将', HI: '飛車', KA: '角行', KI: '金将', GI: '銀将', KE: '桂馬', KY: '香車', FU: '歩兵',
  RY: '龍王', UM: '龍馬', NG: '成銀', NK: '成桂', NY: '成香', TO: 'と金'
};

const KIF_PIECE_NAMES = {
  OU: '玉', HI: '飛', KA: '角', KI: '金', GI: '銀', KE: '桂', KY: '香', FU: '歩',
  RY: '竜', UM: '馬', NG: '成銀', NK: '成桂', NY: '成香', TO: 'と'
};

const PROMOTED_PIECES = ['RY', 'UM', 'NG', 'NK', 'NY', 'TO'];
const KANJI_NUMS = ['一', '二', '三', '四', '五', '六', '七', '八', '九'];
const ZENKAKU_NUMS = ['１', '２', '３', '４', '５', '６', '７', '８', '９'];

const UNPROMOTE_MAP = {
  RY: 'HI', UM: 'KA', NG: 'GI', NK: 'KE', NY: 'KY', TO: 'FU',
  HI: 'HI', KA: 'KA', KI: 'KI', GI: 'GI', KE: 'KE', KY: 'KY', FU: 'FU', OU: 'OU'
};

const PROMOTE_MAP = {
  HI: 'RY', KA: 'UM', GI: 'NG', KE: 'NK', KY: 'NY', FU: 'TO'
};

// 駒の戦力換算点（兵力残存ゲージ算出用）
const PIECE_WEIGHTS = {
  FU: 1.5, KY: 4.0, KE: 4.0, GI: 8.0, KI: 9.0, KA: 15.0, HI: 17.0,
  TO: 6.0, NY: 6.0, NK: 6.0, NG: 9.0, UM: 19.0, RY: 22.0
};
const TOTAL_FORCE_POINTS = 95.5;

// PST (Piece-Square Tables: 陣形・位置評価テーブル)
const PST_DATA = {
  FU: [
    0,  0,  0,  0,  0,  0,  0,  0,  0,
    25, 25, 30, 35, 35, 35, 30, 25, 25,
    18, 20, 24, 28, 28, 28, 24, 20, 18,
    10, 14, 18, 22, 24, 22, 18, 14, 10,
     6,  8, 12, 16, 18, 16, 12,  8,  6,
     2,  4,  8, 12, 14, 12,  8,  4,  2,
     0,  0,  0,  6,  6,  6,  0,  0,  0,
     0,  0,  0,  0,  0,  0,  0,  0,  0,
     0,  0,  0,  0,  0,  0,  0,  0,  0
  ],
  GI: [
    15, 20, 22, 25, 25, 25, 22, 20, 15,
    12, 18, 22, 26, 28, 26, 22, 18, 12,
    10, 15, 20, 24, 25, 24, 20, 15, 10,
     8, 12, 16, 20, 22, 20, 16, 12,  8,
     5,  8, 12, 15, 16, 15, 12,  8,  5,
     0,  5,  8, 10, 12, 10,  8,  5,  0,
    -2,  0,  4,  6,  6,  6,  4,  0, -2,
    -5, -2,  0,  0,  0,  0,  0, -2, -5,
    -8, -5, -2, -2, -2, -2, -2, -5, -8
  ],
  KI: [
    10, 15, 18, 20, 20, 20, 18, 15, 10,
    10, 16, 20, 22, 24, 22, 20, 16, 10,
     8, 14, 18, 20, 22, 20, 18, 14,  8,
     6, 10, 14, 16, 18, 16, 14, 10,  6,
     2,  6, 10, 12, 14, 12, 10,  6,  2,
     0,  4,  6,  8, 10,  8,  6,  4,  0,
    -2,  2,  4,  6,  6,  6,  4,  2, -2,
     0,  0,  2,  4,  4,  4,  2,  0,  0,
    -5, -2,  0,  0,  0,  0,  0, -2, -5
  ]
};

/* =========================================================
   客分四英傑データ（実在の戦国名将・剣聖・軍師・一世名人）
   ========================================================= */
const INSTRUCTORS_DATA = {
  nanban: {
    id: 'inst_nanban', name: '蒲生氏郷', rank: 'アマ初段相当', clan: '会津国 ｜ 南蛮兵法・深さ3',
    sourceEngine: 'MicroMax / 西洋古典αβ探索', engineType: 'nanban', baseTroops: 15000, targetDepth: 3,
    depthSpec: '深さ3＋静止探索', featureShort: '信長公直伝の南蛮兵法と前進速攻。',
    quotes: {
      default: '「信長公直伝の南蛮兵法、日ノ本の将棋と融合させてご覧に入れよう！」',
      opening: '「燕雀安くんぞ鴻鵠の志を知らんや！ まずは堂々たる陣形を敷く！」',
      midgame: '「銀杏の葉が如く、前線へ兵を繰り出す！ 南蛮の筋、見切れるか！」',
      endgame: '「これぞ会津黒川の軍略！ 油断なく敵本陣を包囲せん！」',
      check: '「チェック… いや王手！ 我が南蛮槍の切っ先、かわしてみせよ！」',
      pinch: '「ム… 日ノ本の将棋、誠に侮りがたし！ 陣を組み直さねば！」',
      adv: '「我が優勢は揺るがぬ！ 氏郷の秘策、いざ受けてみよ！」'
    },
    defeatQuote: '「参り申した…！ 日ノ本の将棋の奥深さ、敬服いたした！」',
    victoryQuote: '「南蛮兵法の勝利！ 日ノ本の盤上、見事に制覇いたし候！」',
    portraitSvg: `<rect width="100" height="100" rx="6" fill="#0d1829"/><circle cx="50" cy="45" r="22" fill="#1b2a47" stroke="#ffd700" stroke-width="2"/><line x1="50" y1="28" x2="50" y2="62" stroke="#ffd700" stroke-width="4"/><line x1="38" y1="40" x2="62" y2="40" stroke="#ffd700" stroke-width="4"/><circle cx="50" cy="40" r="4" fill="#ffffff"/>`
  },
  kenshi: {
    id: 'inst_kenshi', name: '柳生石舟斎', rank: 'アマ二段相当', clan: '大和国 ｜ 新陰流剣聖・深さ4',
    sourceEngine: 'Sunfish将棋 / LesserKai PST駆動', engineType: 'kenshi', baseTroops: 30000, targetDepth: 4,
    depthSpec: '深さ4＋PST配置評価', featureShort: '新陰流無刀取り。基本に忠実で隙なき構え。',
    quotes: {
      default: '「太刀を構えるが如く駒に魂を宿す。新陰流の太刀筋、受けてみよ。」',
      opening: '「隙のない構えこそ不敗の基本。陣を整えて静かに機を待つべし。」',
      midgame: '「刃と刃の切り結び！ ここからが新陰流・盤上白兵戦の本番ぞ！」',
      endgame: '「太刀筋は完全に定まった！ 必殺の一刀を本陣へ叩き込む！」',
      check: '「一刀両断！ 王手！ 我が太刀筋から逃れられると思うなよ！」',
      pinch: '「ぬうっ… 刃を交えて初めて知る貴殿の気迫、受けて立とうぞ！」',
      adv: '「我が太刀筋に乱れなし！ 新陰流無刀取りの極意、味わうがよい！」'
    },
    defeatQuote: '「見事な太刀筋… 我が剣、盤上に完敗にござる！」',
    victoryQuote: '「我が新陰流の太刀筋、盤上に見事に極まれり！」',
    portraitSvg: `<rect width="100" height="100" rx="6" fill="#1c0f05"/><polygon points="50,15 80,85 50,70 20,85" fill="#8c671a" stroke="#ffd700" stroke-width="2"/><line x1="50" y1="15" x2="50" y2="70" stroke="#ffd700" stroke-width="2.5"/><circle cx="50" cy="40" r="14" fill="none" stroke="#ffd700" stroke-width="1.8"/>`
  },
  inja: {
    id: 'inst_inja', name: '黒田如水', rank: 'アマ五段相当', clan: '播磨国 ｜ 神算鬼謀の隠者・深さ5',
    sourceEngine: 'Bonanza系統 置換表＆キラー探索', engineType: 'inja', baseTroops: 60000, targetDepth: 5,
    depthSpec: '深さ5＋置換表＋キラー探索', featureShort: '天下の天才軍師。相手の手を先読みし罠へ誘い込む。',
    quotes: {
      default: '「すべては我が盤上の絵図通り… 如水の読み、見破れるか。」',
      opening: '「盤上は静かなる深淵。布石の一手ひとつが勝敗を分かつぞ。」',
      midgame: '「ほほう、仕掛けてきたか。それもすべてこの如水の手のひらの上よ。」',
      endgame: '「天網恢恢疎にして漏らさず。これにて貴殿に逃げ場はなくなったぞ。」',
      check: '「これぞ深遠なる詰めろ！ 逃げ道はすべて塞がれておるぞ。」',
      pinch: '「ほほう… この如水の裏をかくか。面白い、一手興じようぞ。」',
      adv: '「天網恢恢疎にして漏らさず。神算鬼謀の網からは逃れられぬ。」'
    },
    defeatQuote: '「この如水の読みを超えるとは… まこと天下無双の器よ！」',
    victoryQuote: '「すべては我が読みの筋書き通り。盤上平定なり。」',
    portraitSvg: `<rect width="100" height="100" rx="6" fill="#10061e"/><circle cx="50" cy="50" r="28" fill="none" stroke="#ba68c8" stroke-width="2.5" stroke-dasharray="4,4"/><path d="M 32,30 Q 50,12 68,30 L 74,70 Q 50,82 26,70 Z" fill="#b31212" stroke="#ffd700" stroke-width="1.8"/><circle cx="50" cy="50" r="9" fill="#ffd700"/>`
  },
  sokei: {
    id: 'inst_sokei', name: '大橋宗桂', titleHonor: '初代名人', rank: 'アマ八段〜九段相当', clan: '山城国 ｜ 将棋一世名人・深さ6',
    sourceEngine: 'Apery / やねうら王系統 Null-Move＋PVS探索', engineType: 'sokei', baseTroops: 100000, targetDepth: 6,
    depthSpec: '深さ6＋Null-Move枝刈り＋PVS探索', featureShort: '信長・家康公より名人を賜りし開祖。最高峰の極致。',
    quotes: {
      default: '「信長公、家康公の御前で極めし我が一世名人の技芸… 盤上に見せて進ぜよう。」',
      opening: '「盤上の礼法に乱れなし。古今無双の名人将棋、受けてみられよ。」',
      midgame: '「駒の響きが勝利の調べを奏でておる。隙なき名人の構え、崩せるか。」',
      endgame: '「これにて玉将の運命は定まれり。一手も狂わぬ寄せを放つ！」',
      check: '「一世名人の王手！ 逃れられる道は天地いずこにもなし！」',
      pinch: '「ほう…！ 我が名人の読みに挑む鋭い刃、見事な気迫にござる！」',
      adv: '「盤上の全ては定石の極みに収束す。我が一手、天下無敵なり。」'
    },
    defeatQuote: '「見事なり…！ 現代にこれほどの将棋の名手が現れようとは… 完敗にござる！」',
    victoryQuote: '「信長公、家康公に捧げし将棋名人の誇り… 今ここに極まれり！」',
    portraitSvg: `<rect width="100" height="100" rx="6" fill="#1c072e"/><polygon points="50,10 88,28 78,92 22,92 12,28" fill="#380d59" stroke="#ffd700" stroke-width="3" stroke-linejoin="round"/><circle cx="50" cy="50" r="18" fill="radial-gradient(circle, #ffd700, #b8860b)" stroke="#ffffff" stroke-width="1.5"/><text x="50" y="58" font-size="20" font-weight="900" fill="#1c072e" text-anchor="middle" font-family="Shippori Mincho, serif">名</text>`
  }
};

/* =========================================================
   主役武将（主役五傑）
   ========================================================= */
const PLAYER_WARLORDS = {
  sanada: {
    id: 'sanada', name: '真田幸村', clan: '信濃国 ｜ 真田赤備隊', themeColor: '#e61919',
    baseTroops: 3000, strategistName: '真田昌幸', strategistTitle: '表裏比興の父', strategistShort: '昌幸', strategistImgId: 'strategist_masayuki',
    bgGrad: 'radial-gradient(circle at 35% 35%, #6a0b0b 0%, #180202 100%)',
    quotes: {
      default: '「不惜身命！ この一手に命を懸ける！」',
      opening: '「六文銭の旗の下、まずは陣容を堅固に組み上げん！」',
      midgame: '「ここが天下の分水嶺！ 赤備え、敵陣の喉首を狙え！」',
      endgame: '「いざ敵本陣へ突入！ 一手も引かずに押し通る！」',
      check: '「真田が突撃！ ここが敵本陣の喉首ぞ！」',
      pinch: '「六文銭を胸に… まだだ、ここからが真田の戦よ！」',
      adv: '「好機至る！ 赤備え、全軍突撃せよ！」',
      defeat: '「我が武運ここに尽きるか… されど真田の魂は不滅ぞ！」',
      victory: '「義は勝てり！ 日本一の兵の武名、天下に刻んだり！」'
    },
    portraitSvg: `<rect width="100" height="100" rx="6" fill="#4d0808"/><path d="M 28,32 Q 10,10 18,2 Q 30,16 34,26 Z" fill="#ffd700"/><path d="M 72,32 Q 90,10 82,2 Q 70,16 66,26 Z" fill="#ffd700"/><path d="M 30,48 Q 50,30 70,48 L 74,75 Q 50,82 26,75 Z" fill="#b31212" stroke="#ffd700" stroke-width="1.8"/><g fill="#ffd700" stroke="#330000" stroke-width="1"><circle cx="42" cy="42" r="4.5"/><circle cx="50" cy="42" r="4.5"/><circle cx="58" cy="42" r="4.5"/><circle cx="42" cy="52" r="4.5"/><circle cx="50" cy="52" r="4.5"/><circle cx="58" cy="52" r="4.5"/></g><path d="M 24,72 Q 50,96 76,72 L 72,82 Q 50,100 28,82 Z" fill="#ffd700"/>`
  },
  keiji: {
    id: 'keiji', name: '前田慶次', clan: '加賀国 ｜ 天下無双の傾奇者', themeColor: '#ffd700',
    baseTroops: 3000, strategistName: '奥村助右衛門', strategistTitle: '加賀前田の親友', strategistShort: '助右衛門', strategistImgId: 'strategist_sukeemon',
    bgGrad: 'radial-gradient(circle at 35% 35%, #4a2800 0%, #140500 100%)',
    quotes: {
      default: '「大ふへん者とは大武辺者のことよ！ いざ参る！」',
      opening: '「陣立てなんぞ堅苦しいぜ！ 派手に傾いて盤面を賑やかにしようや！」',
      midgame: '「いいねえ、白兵戦だ！ 松風、ここ一番の槍働きを見せてやれ！」',
      endgame: '「これにて幕引きといくかい！ 天下一の傾奇槍を受けてみろ！」',
      check: '「よっしゃあ！ これぞ天下無双の傾奇の一手よ！」',
      pinch: '「窮地ほど面白え！ 松風、もう一跳ねするぜ！」',
      adv: '「ハハハ！ 派手に行こうぜ、天下を傾けてみせろ！」',
      defeat: '「派手に散るのもまた一興… 見事な一手だったぜ！」',
      victory: '「傾き通して大勝利よ！ 助右衛門、天下の銘酒をあけようぜ！」'
    },
    portraitSvg: `<rect width="100" height="100" rx="6" fill="#301404"/><path d="M 20,80 L 80,20" stroke="#d41313" stroke-width="6" stroke-linecap="round"/><path d="M 32,45 Q 50,22 68,45 L 72,72 Q 50,80 28,72 Z" fill="#613808" stroke="#ffd700" stroke-width="2"/><circle cx="50" cy="45" r="9" fill="#ffd700"/><circle cx="50" cy="26" r="6" fill="#ffd700"/><circle cx="68" cy="38" r="6" fill="#ffd700"/><circle cx="62" cy="62" r="6" fill="#ffd700"/><circle cx="38" cy="62" r="6" fill="#ffd700"/><circle cx="32" cy="38" r="6" fill="#ffd700"/>`
  },
  masamune: {
    id: 'masamune', name: '伊達政宗', clan: '陸奥国 ｜ 独眼竜の牙', themeColor: '#d4aa50',
    baseTroops: 3000, strategistName: '片倉小十郎', strategistTitle: '竜の右目・天下二大軍師', strategistShort: '小十郎', strategistImgId: 'strategist_kojuro',
    bgGrad: 'radial-gradient(circle at 35% 35%, #0d2847 0%, #030a14 100%)',
    quotes: {
      default: '「天下の隙、この独眼竜が見逃さぬ！ 派手に行こうぜ！」',
      opening: '「まずは右目の小十郎と陣を敷く。奥州の竜は静かに爪を研ぐぜ。」',
      midgame: '「喰らいつけ！ 竜の牙で敵の中央陣地を食いちぎってやれ！」',
      endgame: '「チェックメイトだ！ 独眼竜の前にひれ伏すがいい！」',
      check: '「竜の牙が届いたぜ！ 逃げられると思うなよ！」',
      pinch: '「チッ、手痛い一撃だな… だが独眼竜の牙は折れねえ！」',
      adv: '「好機到来！ 一気に盤上を制圧するぜ！」',
      defeat: '「俺の野望が盤上に散るか… 小十郎、後は頼んだぜ…」',
      victory: '「天下を睨む独眼竜の前に敵はなし！ 鬨の声をあげろ！」'
    },
    portraitSvg: `<rect width="100" height="100" rx="6" fill="#061224"/><path d="M 16,36 Q 66,8 86,58 Q 50,30 16,36 Z" fill="#ffd700"/><path d="M 28,48 Q 50,28 72,48 L 76,76 Q 50,84 24,76 Z" fill="#0d1f36" stroke="#ffd700" stroke-width="1.8"/><circle cx="40" cy="60" r="4" fill="#ffd700"/><path d="M 34,58 L 46,62" stroke="#000" stroke-width="2"/>`
  },
  kanetsugu: {
    id: 'kanetsugu', name: '直江兼続', clan: '越後国 ｜ 義と愛の軍師', themeColor: '#ba68c8',
    baseTroops: 3000, strategistName: '上杉景勝', strategistTitle: '越後の総帥・寡黙の主君', strategistShort: '景勝', strategistImgId: 'strategist_kagekatsu',
    bgGrad: 'radial-gradient(circle at 35% 35%, #2a0836 0%, #0b0110 100%)',
    quotes: {
      default: '「義を見てせざるは勇なきなり！ 義の刃を受けてみよ！」',
      opening: '「愛の一文字を前立に掲げ、礼節正しく陣容を整えん。」',
      midgame: '「不義の駒運びには鉄槌を下す！ これぞ越後流・愛の采配！」',
      endgame: '「大義はすでに定まれり！ 義理を通し、敵本陣を包囲せん！」',
      check: '「義理を通し、不義を断つ！ これぞ愛の一手！」',
      pinch: '「義の旗印、決して倒れはせぬ！ 陣形を立て直すぞ！」',
      adv: '「大義は我が軍にあり！ 正道を以て制さん！」',
      defeat: '「義を貫き通した… 悔いはござらぬ、御屋形様…！」',
      victory: '「大義の前に邪道なし！ 愛と義の一手、天下に示せり！」'
    },
    portraitSvg: `<rect width="100" height="100" rx="6" fill="#1c0524"/><text x="50" y="44" font-size="34" font-weight="900" fill="#ffd700" text-anchor="middle" font-family="Shippori Mincho, serif">愛</text><path d="M 28,48 Q 50,32 72,48 L 75,76 Q 50,84 25,76 Z" fill="#30103b" stroke="#ffd700" stroke-width="1.8"/><path d="M 24,72 Q 50,94 76,72" fill="none" stroke="#ba68c8" stroke-width="3"/>`
  },
  tadakatsu: {
    id: 'tadakatsu', name: '本多忠勝', clan: '三河国 ｜ 徳川四天王・蜻蛉切', themeColor: '#ffb74d',
    baseTroops: 3000, strategistName: '本多正信', strategistTitle: '徳川の知謀・佐渡守', strategistShort: '正信', strategistImgId: 'strategist_masanobu',
    bgGrad: 'radial-gradient(circle at 35% 35%, #3d2406 0%, #0f0701 100%)',
    quotes: {
      default: '「我が蜻蛉切に切れぬものなし！ 迎え撃ってくれよう！」',
      opening: '「名槍・蜻蛉切を構え、三河武士の不動の陣を築く！」',
      midgame: '「五十七度傷なしの武名、伊達ではないわ！ 突き破れ！」',
      endgame: '「敵将、観念せい！ 蜻蛉切の射程から逃れる術はなし！」',
      check: '「天下無双の槍撃！ 敵将、そこを動くな！」',
      pinch: '「五十七度の合戦、一度の傷も負わぬ儂が退くものか！」',
      adv: '「我が槍の前に敵なし！ 押し通るぞ！」',
      defeat: '「無傷を誇りし儂が敗れるとは… 誠に見事な采配であった！」',
      victory: '「蜻蛉切の威光、盤上に轟けり！ 我が生涯、不敗なり！」'
    },
    portraitSvg: `<rect width="100" height="100" rx="6" fill="#1f1103"/><path d="M 22,25 Q 12,46 32,54 Q 18,36 28,26 Z" fill="#ffd700"/><path d="M 78,25 Q 88,46 68,54 Q 82,36 72,26 Z" fill="#ffd700"/><path d="M 30,48 Q 50,30 70,48 L 74,76 Q 50,84 26,76 Z" fill="#241505" stroke="#ffd700" stroke-width="1.8"/><circle cx="50" cy="62" r="14" fill="none" stroke="#ffd700" stroke-width="3.5" stroke-dasharray="3,3"/>`
  }
};

/* =========================================================
   対戦武将十一人データ（専用評価・開戦兵法・動員数）
   ========================================================= */
const WARLORDS_DATA = {
  1: {
    id: 'enemy_1', province: '尾張国', name: '木下藤吉郎', clan: '尾張国｜織田足軽隊', maxTroops: 3000,
    targetDepth: 1, depthSpec: '深さ1＋足軽速攻', engineType: 'warlord_1',
    featureShort: '足軽戦法。歩の前進重視。',
    tacticsHint: '駒にヒモをつけ、角・飛車の道を開いて突入されよ！',
    tacticsOpenFive: '▲７六歩 ➡ ▲２六歩 ➡ ▲２五歩 ➡ ▲４八銀 ➡ ▲５六歩',
    tacticsWeakness: '藤吉郎は足軽の前進に気を取られ、横や斜めの守りが薄くなりがち。角行の射線で敵陣を射抜くのが極意。',
    portraitSvg: `<rect width="100" height="100" rx="6" fill="#140d06"/><path d="M50 20 Q56 28 50 36 Q44 28 50 20 Z M50 36 Q62 50 50 68 Q38 50 50 68 Z M50 68 Q68 85 50 94 Q32 85 50 68 Z" fill="#ffd700"/>`,
    quotes: {
      default: '「草履取りとて天下を夢見候！ 足軽の意地、見せてくれよう！」',
      opening: '「まずは歩を一歩前へ！ 出世の道も一歩からでござる！」',
      midgame: '「わ、わ、混戦でござる！ 足軽隊、踏みとどまれ！」',
      endgame: '「ここまできたら一歩も引けぬ！ 猿の底力、喰らいなされ！」',
      check: '「猿の一撃、侮りめさるな！」',
      pinch: '「あわわ…！ 信長様にお叱りを受けてしまう！」',
      adv: '「出世の足音が聞こえてき申した！」'
    },
    defeatQuote: '「参り申した…！ されど猿は何度でも木を登り候！」',
    victoryQuote: '「勝ったぞ！ 信長様、藤吉郎やりましたぞ！」'
  },
  2: {
    id: 'enemy_2', province: '加賀国', name: '前田利家', clan: '加賀国｜槍の又左', maxTroops: 8000,
    targetDepth: 1, depthSpec: '深さ1＋槍の突破', engineType: 'warlord_2',
    featureShort: '中央5筋から飛車・槍で突進。',
    tacticsHint: '真ん中に金銀を配して防壁を築き、飛車の突撃を跳ね返されよ！',
    tacticsOpenFive: '▲７六歩 ➡ ▲６八銀 ➡ ▲５六歩 ➡ ▲５八金右 ➡ ▲６六歩',
    tacticsWeakness: '利家は中央突破にこだわり、端陣地（1筋・9筋）のケアがおろそかになりやすい。端攻めで撹乱せよ。',
    portraitSvg: `<rect width="100" height="100" rx="6" fill="#180707"/><circle cx="50" cy="50" r="10" fill="#ffd700"/><circle cx="50" cy="24" r="8" fill="#ffd700"/><circle cx="75" cy="42" r="8" fill="#ffd700"/><circle cx="65" cy="74" r="8" fill="#ffd700"/><circle cx="35" cy="74" r="8" fill="#ffd700"/><circle cx="25" cy="42" r="8" fill="#ffd700"/>`,
    quotes: {
      default: '「我が槍に迷いなし！ 槍の又左が一撃、盤上に受けてみよ！」',
      opening: '「前田の槍衾、まずは陣形を整え、中央を睨むぞ！」',
      midgame: '「中央突破！ 槍の穂先で敵の守りをこじ開けてくれる！」',
      endgame: '「勝負は此処に極まれり！ 又左の槍を喰らえ！」',
      check: '「槍の又左、一騎当千の突撃ぞ！」',
      pinch: '「ぬう…！ 前田の槍衾を崩されるとは！」',
      adv: '「槍を引くな！ この利家が押し通る！」'
    },
    defeatQuote: '「見事な槍さばき… 前田の当主として完敗を認めよう！」',
    victoryQuote: '「槍の又左の前に敵なし！ 百万石の礎となれ！」'
  },
  3: {
    id: 'enemy_3', province: '越前国', name: '柴田勝家', clan: '越前国｜鬼柴田', maxTroops: 15000,
    targetDepth: 2, depthSpec: '深さ2＋瓶割り突進', engineType: 'warlord_3',
    featureShort: '銀と歩で正面粉砕。',
    tacticsHint: '横から飛車・角の射線で銀の首を狙い撃たれよ！',
    tacticsOpenFive: '▲２六歩 ➡ ▲２五歩 ➡ ▲７六歩 ➡ ▲３八銀 ➡ ▲３三銀',
    tacticsWeakness: '退路を断つ猛攻ゆえに、一度受け止められると自陣の守りがガラ空きになる。カウンターの成り駒で仕留めよ。',
    portraitSvg: `<rect width="100" height="100" rx="6" fill="#150a04"/><path d="M30 40 Q50 25 70 40 Q50 48 30 40 Z M30 65 Q50 50 70 65 Q50 73 30 65 Z" fill="#ffd700"/>`,
    quotes: {
      default: '「かかれ柴田の突進力、小細工など粉砕してくれるわ！」',
      opening: '「退路の瓶は割った！ 前進あるのみ、陣を進めよ！」',
      midgame: '「銀をぶち込め！ 鬼柴田の猛進は誰にも止められぬぞ！」',
      endgame: '「城もろとも叩き潰す！ 覚悟いたせ！」',
      check: '「鬼柴田の剛腕、いざ受けてみよ！」',
      pinch: '「ぐぬ… 瓶割り柴田、退路を断って迎え撃つ！」',
      adv: '「かかれ！ かかれ柴田の猛進を止められるか！」'
    },
    defeatQuote: '「無念…！ 瓶を割れども、貴殿の策を砕けなんだか…！」',
    victoryQuote: '「ガハハ！ 鬼柴田の突進を止められる者などおらぬわ！」'
  },
  4: {
    id: 'enemy_4', province: '近江国', name: '浅井長政', clan: '近江国｜浅井軍総帥', maxTroops: 25000,
    targetDepth: 2, depthSpec: '深さ2＋三間飛車', engineType: 'warlord_4',
    featureShort: '三間飛車と美濃囲い。',
    tacticsHint: '自玉を美濃囲い等に堅く囲ってからじっくり攻略されよ。',
    tacticsOpenFive: '▲７六歩 ➡ ▲２六歩 ➡ ▲４八銀 ➡ ▲５六歩 ➡ ▲６八玉',
    tacticsWeakness: '堅守型のため手数を与えてくれる。焦らず銀冠や矢倉に発展させてから端攻めを絡めると崩れ去る。',
    portraitSvg: `<rect width="100" height="100" rx="6" fill="#0d1824"/><g fill="none" stroke="#ffd700" stroke-width="3"><polygon points="50,18 64,26 64,42 50,50 36,42 36,26"/><polygon points="36,44 50,52 50,68 36,76 22,68 22,52"/><polygon points="64,44 78,52 78,68 64,76 50,68 50,52"/></g>`,
    quotes: {
      default: '「信義を重んじ、我が陣を進めん！ 浅井の誇り、見よ！」',
      opening: '「三間に飛車を振り、堅牢な美濃囲いを築く。隙は見せぬ。」',
      midgame: '「義理と信義の一撃！ 盤上の不義を打ち払わん！」',
      endgame: '「お市、見ていてくれ… 浅井の武門、ここに示さん！」',
      check: '「信義の一撃、ここを退くわけにはいかぬ！」',
      pinch: '「信義を貫く刻… お市、すまぬ…」',
      adv: '「我が陣容に乱れなし！ 義の勝利を！」'
    },
    defeatQuote: '「浅井の誇り、盤上に散る… お市、許せよ…」',
    victoryQuote: '「信義は勝てり！ 近江の誇りは揺るぎなし！」'
  },
  5: {
    id: 'enemy_5', province: '美濃国', name: '明智光秀', clan: '美濃国｜智謀の軍総帥', maxTroops: 40000,
    targetDepth: 3, depthSpec: '深さ3＋隙突き知謀', engineType: 'warlord_5',
    featureShort: '浮き駒を狙う知謀戦。',
    tacticsHint: '自陣の駒同士を常に連結させ、隙を作らぬよう戦われよ。',
    tacticsOpenFive: '▲７六歩 ➡ ▲２六歩 ➡ ▲２五歩 ➡ ▲７八金 ➡ ▲６九玉',
    tacticsWeakness: '相手の隙を突くのが得意だが、こちらが隙を作らず堂々と金銀を連結させると攻めあぐねる。',
    portraitSvg: `<rect width="100" height="100" rx="6" fill="#09141c"/><polygon points="50,18 60,38 82,38 65,52 72,74 50,60 28,74 35,52 18,38 40,38" fill="#ffd700"/>`,
    quotes: {
      default: '「時は今、天が下知る五月哉。我が智謀、見切れるか！」',
      opening: '「綿密なる計算こそ勝利の母。静かに布陣を敷く。」',
      midgame: '「貴殿の駒の乱れ、すでに計算に入っておる。」',
      endgame: '「時満ちたれり。これより本陣急襲を仕掛ける！」',
      check: '「敵は本能寺に… いや、貴殿の本陣にあり！」',
      pinch: '「天運は我を見放すというのか…！ まだだ！」',
      adv: '「盤上の全て、我が掌の上にて動いておる。」'
    },
    defeatQuote: '「我が天運の尽きる刻… 貴殿の軍略、誠にお見事…」',
    victoryQuote: '「時は今！ 天下を統べるは、この光秀よ！」'
  },
  6: {
    id: 'enemy_6', province: '越後国', name: '上杉謙信', clan: '越後国｜越後の龍・軍神', maxTroops: 60000,
    targetDepth: 3, depthSpec: '深さ3＋車懸り射線', engineType: 'warlord_6',
    featureShort: '角行と龍馬の遠距離砲撃。',
    tacticsHint: '斜めの射線上に自軍の大事な駒を置かぬよう注意されよ。',
    tacticsOpenFive: '▲７六歩 ➡ ▲６六歩 ➡ ▲７七角 ➡ ▲７八銀 ➡ ▲６八飛',
    tacticsWeakness: '角筋を止める「▲６六歩」や壁駒を配置することで車懸りの威力が半減する。射線を遮断せよ。',
    portraitSvg: `<rect width="100" height="100" rx="6" fill="#14061a"/><path d="M 26,45 Q 50,18 74,45 L 76,78 Q 50,86 24,78 Z" fill="#e8e8e8" stroke="#ffd700" stroke-width="1.8"/><circle cx="50" cy="46" r="16" fill="#1c0a24"/><text x="50" y="52" font-size="14" font-weight="900" fill="#ffd700" text-anchor="middle">毘</text>`,
    quotes: {
      default: '「毘沙門天の御加護、我が軍にあり！ 車懸りの陣、進めよ！」',
      opening: '「大義なき戦に勝利なし。毘沙門天の旗を掲げよ。」',
      midgame: '「車懸りの陣！ 龍の射線で敵陣を断ち割ってくれよう！」',
      endgame: '「天命ここに定まる！ 義の刃、いざ振り下ろさん！」',
      check: '「龍の爪牙、敵本陣を裂く！」',
      pinch: '「運は天にあり、鎧は胸にあり！ 毘沙門天よ！」',
      adv: '「車懸り、休むこと莫れ！ 義戦を完遂せん！」'
    },
    defeatQuote: '「極楽も地獄も先は有明の… 義戦を尽くし、悔いはなし！」',
    victoryQuote: '「毘沙門天の御前、悪は滅び義は輝かん！」'
  },
  7: {
    id: 'enemy_7', province: '甲斐国', name: '武田信玄', clan: '甲斐国｜甲斐の虎', maxTroops: 80000,
    targetDepth: 4, depthSpec: '深さ4＋風林火山要塞', engineType: 'warlord_7',
    featureShort: '金銀要塞と重厚な布陣。',
    tacticsHint: '中央は鉄壁ゆえ、端攻め（1筋や9筋）から崩すのが妙手。',
    tacticsOpenFive: '▲７六歩 ➡ ▲２六歩 ➡ ▲４八銀 ➡ ▲５六歩 ➡ ▲７八金',
    tacticsWeakness: '中央の金銀が密集しているため、香車・歩を使った端攻めや桂馬の跳躍で要塞の横腹を突くべし。',
    portraitSvg: `<rect width="100" height="100" rx="6" fill="#1f0303"/><path d="M 22,34 Q 50,10 78,34 Q 90,60 76,76 Q 50,88 24,76 Q 10,60 22,34 Z" fill="#e0d6c3" stroke="#ffd700" stroke-width="1.8"/><polygon points="50,30 60,42 50,54 40,42" fill="#ffd700"/><polygon points="40,44 50,56 40,68 30,56" fill="#ffd700"/><polygon points="60,44 70,56 60,68 50,56" fill="#ffd700"/>`,
    quotes: {
      default: '「疾きこと風の如く、動かざること山の如し！ 蹂躙してくれる！」',
      opening: '「動かざること山の如し。金銀の石垣を築いて迎え撃つ。」',
      midgame: '「侵略すること火の如し！ 虎の牙、敵陣を焼き尽くせ！」',
      endgame: '「疾きこと風の如し！ 一気に勝負を決めてくれるわ！」',
      check: '「侵略すること火の如し！ 虎の牙、受けてみよ！」',
      pinch: '「人は城、人は石垣… 崩れるな、耐えよ！」',
      adv: '「風林火山の旗の下、天下を呑み込まん！」'
    },
    defeatQuote: '「人は城、人は石垣… 儂の石垣が崩れるとは… 見事！」',
    victoryQuote: '「風林火山の旗靡くところ、天下平定の道あり！」'
  },
  8: {
    id: 'enemy_8', province: '近江安土', name: '織田信長', clan: '近江安土｜第六天魔王', maxTroops: 110000,
    targetDepth: 4, depthSpec: '深さ4＋成駒電撃戦', engineType: 'warlord_8',
    featureShort: '龍王・龍馬の電撃速攻。',
    tacticsHint: '自玉を深く囲い、成駒の突入に耐え反撃せよ。',
    tacticsOpenFive: '▲７六歩 ➡ ▲２六歩 ➡ ▲２五歩 ➡ ▲２四歩 ➡ ▲同歩',
    tacticsWeakness: '成駒での速攻を至上命題とするため、自陣玉の囲いが薄い。信長の猛攻を一手躱せば即座に寄せられる。',
    portraitSvg: `<rect width="100" height="100" rx="6" fill="#140606"/><path d="M 28,42 Q 50,20 72,42 L 76,76 Q 50,86 24,76 Z" fill="#3b0808" stroke="#ffd700" stroke-width="2"/><circle cx="50" cy="27" r="10" fill="#ffd700"/><circle cx="68" cy="40" r="10" fill="#ffd700"/><circle cx="62" cy="62" r="10" fill="#ffd700"/><circle cx="38" cy="62" r="10" fill="#ffd700"/><circle cx="32" cy="40" r="10" fill="#ffd700"/><circle cx="50" cy="48" r="11" fill="#9b111e" stroke="#ffd700" stroke-width="1.5"/>`,
    quotes: {
      default: '「是非に及ばず。この信長に挑む愚かさ、骨身に刻め。」',
      opening: '「古い兵法など焼き捨てよ！ 新しき駒組みで蹂躙する！」',
      midgame: '「三段撃ちの如く、間断なき攻めを浴びせかけてくれよう！」',
      endgame: '「天下布武の前に立ちはだかる者は、灰燼に帰すのみ！」',
      check: '「三段撃ち！ 鉄砲の前に灰燼と帰すがよい！」',
      pinch: '「人間五十年、下天の内をくらぶれば… まだ死せぬ！」',
      adv: '「天下布武！ 我が前にひれ伏せ！」'
    },
    defeatQuote: '「是非に及ばず…！ 新たなる天下人よ、乱世を束ねよ！」',
    victoryQuote: '「天下布武！ 我が覇道に従わぬ者に明日はない！」'
  },
  9: {
    id: 'enemy_9', province: '摂津大坂', name: '豊臣秀吉', clan: '摂津大坂｜天下人・太閤', maxTroops: 150000,
    targetDepth: 4, depthSpec: '深さ4＋持ち駒包囲網', engineType: 'warlord_9',
    featureShort: '持ち駒包囲戦。',
    tacticsHint: '無駄な駒交換を避けて盤上を制圧せよ。',
    tacticsOpenFive: '▲７六歩 ➡ ▲２六歩 ➡ ▲４八銀 ➡ ▲５六歩 ➡ ▲６八銀',
    tacticsWeakness: '持ち駒を使わせないよう、大駒交換を避けて盤上の小駒の連携で前線を押し上げるべし。',
    portraitSvg: `<rect width="100" height="100" rx="6" fill="#241904"/><g stroke="#ffd700" stroke-width="2"><line x1="50" y1="45" x2="50" y2="8"/><line x1="50" y1="45" x2="25" y2="15"/><line x1="50" y1="45" x2="75" y2="15"/><line x1="50" y1="45" x2="10" y2="30"/><line x1="50" y1="45" x2="90" y2="30"/></g><path d="M 30,46 Q 50,30 70,46 L 74,75 Q 50,84 26,75 Z" fill="#694a08" stroke="#ffd700" stroke-width="2"/><circle cx="50" cy="56" r="10" fill="#ffd700"/>`,
    quotes: {
      default: '「天下は我が手中にある！ 太閤の前に跪くがよい！」',
      opening: '「太閤の財力と動員力、まずはじっくり見せて進ぜよう！」',
      midgame: '「大坂城の金蔵の如く、持ち駒を集めて包囲網を築くぞ！」',
      endgame: '「日輪の光は遮れぬ！ 天下人の底力、思い知れ！」',
      check: '「黄金の茶室ならぬ、黄金の王手を喰らいなされ！」',
      pinch: '「露と落ち、露と消えにし我が身かな… なにを！」',
      adv: '「日輪の如く、全てを照らし尽くして見せよう！」'
    },
    defeatQuote: '「露と落ち露と消えにし我が身かな… 天下の夢、託し申す！」',
    victoryQuote: '「天下人はこの秀吉よ！ 日輪の光、誰にも遮れぬ！」'
  },
  10: {
    id: 'enemy_10', province: '武蔵江戸', name: '徳川家康', clan: '武蔵江戸｜天下の覇者', maxTroops: 200000,
    targetDepth: 5, depthSpec: '深さ5＋鉄壁探索', engineType: 'warlord_10',
    featureShort: '最深探索の鉄壁。',
    tacticsHint: '軍師の【覚醒進言】と連携し神算鬼謀の一撃を狙うべし。',
    tacticsOpenFive: '▲７六歩 ➡ ▲２六歩 ➡ ▲２五歩 ➡ ▲４八銀 ➡ ▲６八玉',
    tacticsWeakness: '最強の持久力を持つ。中盤での小競り合いを避け、軍師の進言で相手陣の急所へクサビの歩を打ち込め。',
    portraitSvg: `<rect width="100" height="100" rx="6" fill="#080f1f"/><path d="M 32,24 Q 50,14 68,24 Q 80,38 74,62 Q 50,78 26,62 Q 20,38 32,24 Z" fill="#1b2a47" stroke="#ffd700" stroke-width="2"/><circle cx="50" cy="50" r="18" fill="none" stroke="#ffd700" stroke-width="2.5"/><path d="M50 48 C44 32, 36 24, 50 18 C64 24, 56 32, 50 48 Z" fill="#ffd700"/><path d="M49 52 C33 50, 24 60, 26 74 C38 74, 46 64, 49 52 Z" fill="#ffd700"/><path d="M51 52 C67 50, 76 60, 74 74 C62 74, 54 64, 51 52 Z" fill="#ffd700"/>`,
    quotes: {
      default: '「人の一生は重荷を負うて… 焦るでない、勝機は此処にあり。」',
      opening: '「重荷を負いて遠き道を行くが如し。まずは鉄壁の布陣。」',
      midgame: '「耐えてこそ勝機あり。鳴かぬなら鳴くまで待とうホトトギス。」',
      endgame: '「機は熟した！ 徳川三百年泰平の礎、盤上に築かん！」',
      check: '「忍耐の刻は過ぎた！ 我が天下の礎となられよ！」',
      pinch: '「ぐぬぬ…！ 爪を噛むほどの焦燥よ… だが儂の天下は揺るがぬ！」',
      adv: '「鳴くまで待った甲斐があったわ。天下泰平の刻ぞ！」'
    },
    defeatQuote: '「見事なり… 乱世を鎮むる真の器、確かに見届けた…！」',
    victoryQuote: '「忍耐の末に泰平あり。天下は徳川の掌中にあり！」'
  },
  11: {
    id: 'enemy_11', province: '天下無双', name: '前田慶次', clan: '天下無双｜軍師AI：奥村助右衛門', maxTroops: 180000,
    targetDepth: 5, depthSpec: '深さ5＋神算鬼謀', engineType: 'warlord_11',
    featureShort: '軍師AI搭載。豪快傾奇と神算鬼謀の極み。',
    tacticsHint: '助右衛門の神算が仕組む罠に警戒し、守りを固めてから挑まれよ！',
    tacticsOpenFive: '▲７六歩 ➡ ▲２六歩 ➡ ▲７七角 ➡ ▲８八銀 ➡ ▲６八玉',
    tacticsWeakness: '型破りな奇襲を放ってくるため、定跡にとらわれず相手の狙い筋（飛車・角の突入）を堅く受け止めよ。',
    customImg: 'images/keiji',
    portraitSvg: `<rect width="100" height="100" rx="6" fill="#301404"/><path d="M 20,80 L 80,20" stroke="#d41313" stroke-width="6" stroke-linecap="round"/><path d="M 32,45 Q 50,22 68,45 L 72,72 Q 50,80 28,72 Z" fill="#613808" stroke="#ffd700" stroke-width="2"/><circle cx="50" cy="45" r="9" fill="#ffd700"/><circle cx="50" cy="26" r="6" fill="#ffd700"/><circle cx="68" cy="38" r="6" fill="#ffd700"/><circle cx="62" cy="62" r="10" fill="#ffd700"/><circle cx="38" cy="62" r="10" fill="#ffd700"/><circle cx="32" cy="38" r="6" fill="#ffd700"/>`,
    quotes: {
      default: '「軍師・助右衛門の策と俺の槍！ 天下を傾け尽くしてくれるわ！」',
      opening: '「助右衛門、面白い陣形を頼むぜ！ ど派手に傾こうじゃねえか！」',
      midgame: '「天下無双の傾奇戦！ 助右衛門の読みと俺の突進を止められるか！」',
      endgame: '「いよっ、大詰めだ！ 派手に散るか派手に勝つか、勝負勝負！」',
      check: '「助右衛門、一手もらったぜ！ これぞ傾奇王手！」',
      pinch: '「ハハハ！ 窮地ほど血が滾るわ！ ここからが本番よ！」',
      adv: '「松風、駆け抜けろ！ 助右衛門、一気に仕留めるぞ！」'
    },
    defeatQuote: '「見事だ！ 天下一の傾きを見せてもらったぜ、完敗よ！」',
    victoryQuote: '「大武辺者の勝ちよ！ 助右衛門、美味い酒を呑もうぜ！」'
  }
};

/* =========================================================
   宿命の対決録（五大因縁秘話）
   ========================================================= */
const RIVALRIES = {
  'sanada_10': {
    title: '大坂の陣！ 日本一の兵 vs 天下の覇者',
    pQuote: '「不惜身命！ 徳川の天下、この幸村が盤上で覆して見せようぞ！」',
    eQuote: '「真田か…！ 目の上の瘤め、大坂の雪辱はさせぬぞ！」'
  },
  'keiji_2': {
    title: '前田の血脈！ 傾奇者 vs 槍の又左',
    pQuote: '「叔父貴、ぬるい水風呂の礼をせねばな！ ど派手に傾くぜ！」',
    eQuote: '「慶次！ その放蕩、前田の当主として盤上で成敗いたす！」'
  },
  'kanetsugu_10': {
    title: '直江状の義戦！ 義愛の軍師 vs 関東の巨魁',
    pQuote: '「不義の天下に道はなし！ 義の刃、盤上にて受けてみよ！」',
    eQuote: '「直江兼続… 筆鋒鋭き小僧め、盤上で捻り潰してくれる！」'
  },
  'masamune_9': {
    title: '天下への野望！ 独眼竜 vs 太閤の威光',
    pQuote: '「太閤殿下！ 白装束の礼は済んだ、盤上は容赦しねえ！」',
    eQuote: '「伊達の若造、その野心ごとのみ込んで見せようぞ！」'
  },
  'tadakatsu_7': {
    title: '三方ヶ原の雪辱！ 蜻蛉切 vs 甲斐の虎',
    pQuote: '「信玄公！ 我が蜻蛉切、家康公の盾となり砕かん！」',
    eQuote: '「忠勝、家康に過ぎたるものよ。虎の牙を凌げるか！」'
  }
};

/* 御前試合：全選定対象キー一覧 */
const ALL_EXHIBITION_AI_KEYS = [
  'lvl_1', 'lvl_2', 'lvl_3', 'lvl_4', 'lvl_5',
  'lvl_6', 'lvl_7', 'lvl_8', 'lvl_9', 'lvl_10',
  'nanban', 'kenshi', 'inja', 'sokei',
  'strategist'
];

/* =========================================================
   武将アバター・ポートレート支援関数
   ========================================================= */
function getWarlordDisplayNameHtml(data) {
  if (!data) return '';
  if (data.titleHonor) {
    return `<span class="warlord-title-badge">${data.titleHonor}</span>${data.name}`;
  }
  return data.name;
}

let avatarViewMode = { player: 'face', ai: 'face' };

function getWarlordPortraitHtml(warlordData, isInteractive = false, side = null) {
  if (!warlordData) return '';
  const candidates = [];
  
  if (warlordData.id && warlordData.id.startsWith('strategist_')) {
    if (warlordData.strategistImgId) candidates.push(`images/${warlordData.strategistImgId}`);
    if (warlordData.customImg) candidates.push(warlordData.customImg);
  } else {
    if (warlordData.customImg) candidates.push(warlordData.customImg);
    if (warlordData.strategistImgId) candidates.push(`images/${warlordData.strategistImgId}`);
  }

  if (warlordData.id) candidates.push(`images/${warlordData.id}`);
  if (warlordData.id === 'enemy_11') candidates.push('images/keiji');
  if (warlordData.id === 'inst_nanban') { candidates.push('images/ujisato'); candidates.push('images/nanban'); }
  if (warlordData.id === 'inst_kenshi') { candidates.push('images/yagyu'); candidates.push('images/kenshi'); }
  if (warlordData.id === 'inst_inja')   { candidates.push('images/josui'); candidates.push('images/inja'); }
  if (warlordData.id === 'inst_sokei')  { candidates.push('images/sokei'); candidates.push('images/meijin'); }

  const uniqueCandidates = [...new Set(candidates)];
  const primarySrc = `${uniqueCandidates[0]}.png`;
  const fallbackListJson = JSON.stringify(uniqueCandidates).replace(/"/g, '&quot;');
  const showCrestClass = (isInteractive && side && avatarViewMode[side] === 'crest') ? 'show-crest' : '';

  return `
    <div class="portrait-container-box ${showCrestClass}">
      <div class="portrait-crest-svg">
        <svg viewBox="0 0 100 100">${warlordData.portraitSvg}</svg>
      </div>
      <img src="${primarySrc}" alt="${warlordData.name}" class="portrait-face-img"
           data-candidates="${fallbackListJson}"
           data-cand-idx="0"
           data-ext-idx="0"
           onload="this.closest('.portrait-container-box').classList.add('portrait-has-image');"
           onerror="handlePortraitError(this);">
    </div>
  `;
}

window.handlePortraitError = function(img) {
  const exts = ['.png', '.jpg', '.webp'];
  let candList = [];
  try { candList = JSON.parse(img.getAttribute('data-candidates') || '[]'); } catch(e){}
  if (candList.length === 0) { img.remove(); return; }

  let cIdx = parseInt(img.getAttribute('data-cand-idx') || '0', 10);
  let eIdx = parseInt(img.getAttribute('data-ext-idx') || '0', 10);

  eIdx++;
  if (eIdx < exts.length) {
    img.setAttribute('data-ext-idx', eIdx.toString());
    img.src = `${candList[cIdx]}${exts[eIdx]}`;
  } else {
    cIdx++;
    if (cIdx < candList.length) {
      img.setAttribute('data-cand-idx', cIdx.toString());
      img.setAttribute('data-ext-idx', '0');
      img.src = `${candList[cIdx]}${exts[0]}`;
    } else {
      img.remove();
    }
  }
};


