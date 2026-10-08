/* 魔女のポーション工房 — game data and tunable settings */
(function (root) {
  'use strict';

  // 12 potion colours: hue spread + lightness variation, each with a symbol for colour-assist mode
  const COLORS = [
    { name: 'ドラゴンの血', hex: '#e2383f', mark: '♥' },
    { name: '月光の雫', hex: '#9cc2ff', mark: '☾' },
    { name: '妖精の粉', hex: '#ff8fc8', mark: '✿' },
    { name: '森の精', hex: '#35b865', mark: '♣' },
    { name: '太陽の蜜', hex: '#f7cb3c', mark: '☀' },
    { name: '夜空のインク', hex: '#3553d6', mark: '◆' },
    { name: '魔女の紫', hex: '#9a45dc', mark: '✦' },
    { name: 'かぼちゃ灯', hex: '#f47e2a', mark: '▲' },
    { name: '人魚の涙', hex: '#22c3bd', mark: '●' },
    { name: '古木の樹液', hex: '#8f5f3a', mark: '■' },
    { name: '雪の吐息', hex: '#eef1fb', mark: '❄' },
    { name: '毒リンゴ', hex: '#a7dc2c', mark: '✚' },
  ];

  const SERIES = [
    { name: '魔女の相棒', shapes: ['cat', 'hat', 'moon', 'owl', 'pumpkin', 'dragon', 'crystal', 'mushroom', 'broom', 'book'] },
    { name: '夜の森', shapes: ['fox', 'rabbit', 'hedgehog', 'deer', 'wolf', 'squirrel', 'firefly', 'stump', 'pinecone', 'web'] },
    { name: '星と月', shapes: ['saturn', 'sun', 'comet', 'northstar', 'telescope', 'armillary', 'moonrabbit', 'astrolabe', 'eclipse', 'aurora'] },
    { name: 'お菓子の家', shapes: ['cupcake', 'teapot', 'lollipop', 'donut', 'pudding', 'strawberry', 'softserve', 'macaron', 'gingerbread', 'teacup'] },
    { name: '幻獣と海の底', shapes: ['unicorn', 'pegasus', 'phoenix', 'griffin', 'whale', 'seahorse', 'jellyfish', 'octopus', 'turtle', 'mermaidtail'] },
    { name: '銀月', variant: 'silver' },
    { name: '黄金', variant: 'gold' },
    { name: '夜空', variant: 'night' },
    { name: '氷', variant: 'ice' },
    { name: '虹', variant: 'rainbow' },
  ];

  // glass tint for colour-variant series (drawn with the canvas "color" blend)
  const VARIANTS = {
    ruby: { name: '紅玉', tint: '#d2204a', strength: 0.55, flavor: '深紅のガラスに金の薔薇が巻きついた' },
    jade: { name: '翡翠', tint: '#1f9e62', strength: 0.5, flavor: '緑のガラスに蔦が絡む' },
    silver: { name: '銀月', tint: '#c9d3ea', strength: 0.45, flavor: '銀白のガラスに三日月が並ぶ' },
    gold: { name: '黄金', tint: '#e0a526', strength: 0.55, flavor: '琥珀色のガラスに宝石が光る' },
    night: { name: '夜空', tint: '#2a3aa8', strength: 0.55, flavor: '紺のガラスに星の粒が瞬く' },
    ice: { name: '氷', tint: '#8fd8f2', strength: 0.5, flavor: '淡い水色のガラスに霜が降りた' },
    rainbow: { name: '虹', tint: 'rainbow', strength: 0.4, flavor: '虹色に揺らぐガラスに七色の宝石が並ぶ' },
  };

  const BOTTLES = {
    cat: ['黒猫の瓶', '夜更かしの秘薬', '飲むと夜目が利き、朝までぐっすり眠れない。見習い魔女の必需品。'],
    hat: ['とんがり帽子の瓶', '先生の知恵袋', '帽子のつばに溜まった知恵をひと匙ずつ溶かした薬。'],
    moon: ['三日月の瓶', '月光の雫', '三日月の夜にだけ集められる、冷たく澄んだ光の雫。'],
    owl: ['フクロウの瓶', '森の物知り薬', '一口で森じゅうの噂話が聞こえてくる。飲みすぎ注意。'],
    pumpkin: ['かぼちゃの瓶', '灯火のスープ', 'お腹の底からぽかぽか温まる、収穫祭の夜の薬。'],
    dragon: ['ドラゴンの瓶', '小竜の吐息', '舌がぴりっとするが、くしゃみと一緒に小さな炎が出る。'],
    crystal: ['水晶玉の瓶', '予見の霧', '瓶を覗くと、明日の天気くらいはぼんやり見える。'],
    mushroom: ['キノコの瓶', '胞子の子守歌', '森の小人が眠る前に飲む、ふわふわした甘い薬。'],
    broom: ['ほうきの瓶', '追い風の粉', 'ほうきに一振りすれば、帰り道はずっと追い風。'],
    book: ['魔導書の瓶', '忘れ物防止の墨', '覚えた呪文がページから抜け落ちないようにする墨。'],
    fox: ['キツネの瓶', '化かしの香水', 'ひと吹きで、ほんの少しだけ別の誰かに見える。'],
    rabbit: ['ウサギの瓶', '跳ね足の薬', '階段を二段飛ばしで上りたくなる、軽やかな薬。'],
    hedgehog: ['ハリネズミの瓶', 'まんまる守りの薬', '嫌なことがあった日に、心を丸めて守ってくれる。'],
    deer: ['シカの瓶', '森の王の雫', '角の先に宿る朝露を集めた、背筋が伸びる薬。'],
    wolf: ['オオカミの瓶', '遠吠えのど飴', '声がよく通るようになる。満月の夜は効きすぎる。'],
    squirrel: ['リスの瓶', 'ためこみの蜜', 'どこかに隠した大事なものを思い出させてくれる。'],
    firefly: ['ホタルの瓶', '小さな灯りの薬', '暗い帰り道で、指先がほんのり光る。'],
    stump: ['切り株の瓶', '年輪の休息', '座って一息つくと、疲れが年輪のように溶けていく。'],
    pinecone: ['松ぼっくりの瓶', '冬ごもりの香', '部屋に置くと、雪の日でも森の匂いがする。'],
    web: ['蜘蛛の巣の瓶', '夢とりの糸', '悪い夢だけをからめとる、きらきらした糸の薬。'],
    saturn: ['土星の瓶', '輪っかの目まい薬', 'くるくる回っても、なぜか目が回らなくなる。'],
    sun: ['太陽の瓶', 'ひだまりの雫', '曇りの日に一滴たらすと、頬がお日さまの匂い。'],
    comet: ['彗星の瓶', '流れ星の尾', '願い事を三回言う間だけ、時間がゆっくり流れる。'],
    northstar: ['北極星の瓶', '道しるべの光', '迷ったときに飲むと、帰るべき方角が分かる。'],
    telescope: ['望遠鏡の瓶', '遠見のしずく', '遠くの星の囁きまで聞き取れるようになる。'],
    armillary: ['天球儀の瓶', '巡る星の薬', '星の巡りを整え、運の悪い日を少しだけ良くする。'],
    moonrabbit: ['月の兎の瓶', '餅つきの薬', '月の兎がついた餅を溶かした、もちもちの薬。'],
    astrolabe: ['星座盤の瓶', '星読みのインク', 'このインクで書いた手紙は、星の導きで届く。'],
    eclipse: ['日食の瓶', '昼の闇の薬', '真昼に一瞬だけ、星空を呼び出すことができる。'],
    aurora: ['オーロラの瓶', '揺らめく帳', '夜空の帳を少しだけ揺らし、七色の夢を見せる。'],
    cupcake: ['カップケーキの瓶', 'ふわふわの魔法', '一口飲むと、心までクリームのようにふんわり軽くなる。'],
    teapot: ['ティーポットの瓶', 'お茶会の約束', '注げば注ぐほど、誰かとおしゃべりしたくなる不思議な紅茶。'],
    lollipop: ['キャンディの瓶', 'ぐるぐる渦の飴', 'なめている間だけ、悩みごとがぐるぐる遠くへ回っていく。'],
    donut: ['ドーナツの瓶', 'まんまるの輪', '輪の真ん中から覗くと、なくした物の在りかが見える。'],
    pudding: ['プリンの瓶', 'ぷるぷるの秘薬', 'ぷるんと揺れるたびに、疲れた肩がほぐれていく。'],
    strawberry: ['いちごの瓶', '春摘みの雫', '甘酸っぱい香りで、眠い朝もぱっちり目が覚める。'],
    softserve: ['ソフトクリームの瓶', '夏祭りの渦', '冷たいのに溶けない、真夏の夜のおまじない。'],
    macaron: ['マカロンの瓶', '三段重ねの夢', '三つの味が順番に変わる、おめかしの日の薬。'],
    gingerbread: ['お菓子の家の瓶', '迷子の道しるべ', '森で迷っても、甘い香りが家まで連れて帰ってくれる。'],
    teacup: ['ティーカップの瓶', '午後三時の休憩', '飲むと時計の針が少しゆっくりになる、休憩用の薬。'],
    unicorn: ['ユニコーンの瓶', '一角の祝福', '角の光をひと匙。どんな傷もやさしく癒やすと言われる。'],
    pegasus: ['ペガサスの瓶', '天翔ける羽', '背中が軽くなり、階段の上り下りがふわりと楽になる。'],
    phoenix: ['不死鳥の瓶', '灰からの炎', '何度失敗しても、もう一度挑む勇気がわいてくる。'],
    griffin: ['グリフォンの瓶', '守り手の誓い', '大切な宝物を、眠っている間もしっかり守ってくれる。'],
    whale: ['クジラの瓶', '深海の歌', '耳を澄ますと、遠い海の子守歌がかすかに聞こえる。'],
    seahorse: ['タツノオトシゴの瓶', 'くるりの尾', '尾をくるりと巻くように、なくしかけた縁をつなぎとめる。'],
    jellyfish: ['クラゲの瓶', 'ゆらめく灯', '水の中でも灯り続ける、海の底のランタンの薬。'],
    octopus: ['タコの瓶', '八本腕の器用さ', '飲むと手先が器用になり、調合の失敗が減るらしい。'],
    turtle: ['ウミガメの瓶', '千年の旅路', 'ゆっくりでも、必ず目的地にたどり着ける薬。'],
    mermaidtail: ['人魚の瓶', '泡の恋文', '想いを泡に包んで、届けたい相手のもとへ運ぶ。'],
  };

  const TROPHY_MOTIFS = ['雪の結晶', 'ハート', '桜', '四つ葉', '蝶', '雨粒', '流れ星', 'ひまわり', '満月', 'コウモリ', 'ドングリ', '雪だるま'];
  const TROPHY_COLORS = ['#bfe4ff', '#ff6f9a', '#ffb3cf', '#58c96b', '#b98cff', '#5aa9ff', '#ffd75a', '#ffb52e', '#f3e7b3', '#9a45dc', '#b07a45', '#e8f3ff'];

  const CONFIG = {
    MAX_LEVEL: 500,
    DAILY_UNLOCK: 20,
    START_ITEMS: { undo: 5, shuffle: 5, bottle: 5 },
    ITEM_MAX: 99,
    COIN_MAX: 9999,
    PRICES: [
      { id: 'undo1', item: 'undo', qty: 1, price: 100 },
      { id: 'undo5', item: 'undo', qty: 5, price: 450 },
      { id: 'shuffle1', item: 'shuffle', qty: 1, price: 150 },
      { id: 'bottle1', item: 'bottle', qty: 1, price: 200 },
    ],
    COSMETICS: [
      { id: 'flask', type: 'bottle', name: '標準の薬瓶', price: 0, img: 'bottle' },
      { id: 'roundflask', type: 'bottle', name: '丸底フラスコ', price: 300, img: 'skin_roundflask' },
      { id: 'testtube', type: 'bottle', name: '蒼いガラスの試験管', price: 400, img: 'skin_testtube' },
      { id: 'perfume', type: 'bottle', name: '金細工の香水瓶', price: 600, img: 'skin_perfume' },
      { id: 'constellation', type: 'bottle', name: '星座の小瓶', price: null, how: '実績「月の証」の報酬', img: 'skin_constellation' },
      { id: 'heart', type: 'bottle', name: 'ハートの香水瓶', price: 500, img: 'skin_heart', stopper: true },
      { id: 'crystal', type: 'bottle', name: '六角クリスタル瓶', price: 600, img: 'skin_crystal', stopper: true },
      { id: 'shell', type: 'bottle', name: '貝殻の瓶', price: 500, img: 'skin_shell', stopper: true },
      { id: 'attar', type: 'bottle', name: 'インドの香水瓶', price: 800, img: 'skin_attar', stopper: true },
      { id: 'workshop', type: 'bg', name: '魔女の工房', price: 0, img: 'bg' },
      { id: 'forest', type: 'bg', name: '月夜の森', price: 400, img: 'bg_forest' },
      { id: 'school', type: 'bg', name: '魔法学校の教室', price: 500, img: 'bg_school' },
      { id: 'tower', type: 'bg', name: '天文塔', price: 700, img: 'bg_tower' },
      { id: 'lake', type: 'bg', name: '星降る湖畔', price: 600, img: 'bg_lake' },
      { id: 'sakura', type: 'bg', name: '夜桜の丘', price: 600, img: 'bg_sakura' },
      { id: 'autumn', type: 'bg', name: '秋の紅葉の森', price: 600, img: 'bg_autumn' },
      { id: 'aurora', type: 'bg', name: 'オーロラの雪原', price: 700, img: 'bg_aurora' },
      { id: 'seatemple', type: 'bg', name: '海の底の神殿', price: 700, img: 'bg_seatemple' },
      { id: 'skygarden', type: 'bg', name: '雲の上の空中庭園', price: 800, img: 'bg_skygarden' },
      { id: 'magiccircle', type: 'bg', name: '魔法陣の文様', price: 900, img: 'bg_magiccircle' },
      { id: 'stainedglass', type: 'bg', name: 'ステンドグラスの花模様', price: 900, img: 'bg_stainedglass' },
      { id: 'cauldron', type: 'bg', name: '月夜の大釜', price: null, how: '図鑑コンプリートの報酬', img: 'bg_cauldron' },
    ],
    COIN: {
      clearBase: 90, perStar: 10, giantBonus: 70, replay: 15, starUp: 10,
      cleanTable: 20, dailyClear: 100, trophyFull: 400, seriesDone: 300, collectionDone: 1000,
    },
    LOGIN_BONUS: [
      { coins: 30 }, { coins: 40 }, { coins: 50 }, { undo: 1 }, { coins: 60 }, { coins: 80 }, { coins: 200, shuffle: 1 },
    ],
  };

  const ITEMS = {
    undo: { name: '時戻りの砂時計', short: '一手戻す', icon: 'item_icons_0', desc: '直前の1手を取り消す' },
    shuffle: { name: 'かき混ぜの杖', short: 'シャッフル', icon: 'item_icons_1', desc: '選んだ瓶1本の中身を混ぜ直す' },
    bottle: { name: '予備の薬瓶', short: 'ボトル追加', icon: 'item_icons_2', desc: '空の瓶を1本追加(1レベル2本まで)' },
  };

  // achievements: stages (cumulative) and titles
  const ACH = [
    { id: 'clear', name: 'レベル攻略', what: 'クリアしたレベル', stages: [10, 25, 50, 100, 150, 200, 300, 400, 500], titles: ['見習い魔女', '駆け出し魔女', '一人前の魔女', '熟練の魔女', '工房の主', '森の賢女', '月の魔女', '星の魔女', '大魔女'] },
    { id: 'perfect', name: '完璧主義', what: '星3を取ったレベル', stages: [5, 10, 25, 50, 100, 200, 300, 500], titles: ['几帳面な弟子', '丁寧な調合師', '正確な調合師', '完璧主義者', '精密の匠', '錬金の名手', '黄金の手', '至高の調合師'] },
    { id: 'noitem', name: '道具に頼らない', what: 'アイテムを使わずにクリアしたレベル', stages: [5, 10, 25, 50, 100, 200, 300, 500], titles: ['素手の見習い', '自力の魔女', '腕利きの魔女', '道具いらず', '己を信じる者', '真の実力者', '孤高の魔女', '伝説の腕前'] },
    { id: 'giant', name: '魔法瓶の使い手', what: '満たした巨大ボトル', stages: [1, 5, 10, 20, 40, 70, 100], titles: ['瓶を知る者', '瓶の見習い', '魔法瓶の使い手', '瓶職人', '瓶の名匠', '瓶の守り手', '魔法瓶の主'] },
    { id: 'blind', name: '闇を見通す目', what: 'クリアしたブラインドのレベル', stages: [1, 5, 10, 20, 40, 70, 100], titles: ['手探りの魔女', '夜目の利く者', '霧払い', '闇を見通す目', '見えざる手', '千里眼', '霧の王'] },
    { id: 'curtain', name: 'カーテンコール', what: '開けたカーテン', stages: [1, 10, 25, 50, 100, 200], titles: ['幕開け', '舞台袖の魔女', '幕引き上手', 'カーテンコール', '喝采の魔女', '主演魔女'] },
    { id: 'series', name: '図鑑収集', what: '完成したシリーズ', stages: [1, 3, 5, 7, 10], titles: ['蒐集家の卵', '棚の番人', '蒐集家', '博物の魔女', '図鑑の主'] },
    { id: 'daily', name: '毎日の修行', what: 'クリアしたデイリーの日数', stages: [1, 7, 14, 30, 60, 100, 200, 365], titles: ['修行初日', '一週間の修行', '二週間の修行', '毎日の修行', 'ふた月の修行', '百日の修行', '二百日の修行', '一年の修行'] },
    { id: 'trophy', name: '月の証', what: '満杯にしたトロフィー', stages: [1, 3, 6, 12], titles: ['月の証', '三つの月', '半年の月', '十二の月'] },
    { id: 'tables', name: 'きれい好き', what: 'お掃除で拭いた机', stages: [10, 50, 100, 300, 1000], titles: ['お手伝い', 'きれい好き', '掃除上手', 'ピカピカ職人', '掃除の魔女'] },
    { id: 'chimneys', name: '夜空の散歩', what: 'ほうきで抜けた煙突', stages: [10, 30, 100, 300, 1000], titles: ['初飛行', '夜空の散歩', '夜間飛行士', '風の乗り手', '夜空の主'] },
    { id: 'cauldron', name: '大釜の達人', what: '大釜キャッチの最高点', stages: [100, 200, 300, 500, 800], titles: ['大釜の見習い', '受け止め上手', '大釜使い', '大釜の達人', '大釜の主'] },
    { id: 'gachaOwn', name: '小物蒐集家', what: '集めたガチャアイテム', stages: [10, 25, 40, 50], titles: ['蒐集の芽', '小物好き', '宝物の番人', 'すべてを集めし魔女'] },
    { id: 'gachaPulls', name: '運試し', what: 'ガチャを回した回数', stages: [10, 50, 100, 300, 1000], titles: ['はじめての運試し', '福引き好き', '運命の常連', '星に願う者', '千の願い'] },
    { id: 'gachaSSR', name: '星の幸運', what: '集めたSSRのアイテム', stages: [1, 3, 5], titles: ['一番星', '三つ星の幸運', '五つ星の奇跡'] },
  ];
  const ACH_REWARD = (achId, stageIdx) => {
    if (achId === 'clear' && stageIdx === 8) return { coins: 1000 };
    if (achId === 'trophy' && stageIdx === 0) return { cosmetic: 'constellation', coins: 20 };
    return { coins: [20, 30, 50, 80, 120][stageIdx] || 200 };
  };

  const RULE_CARDS = {
    giant: { title: '巨大ボトル', body: '中央の大きな魔法瓶に入るのは1色だけです。最初から入っている色と同じ色を、周りの瓶から集めて注ぎましょう。魔法瓶が満杯になればクリア。周りの瓶は揃い切っていなくても大丈夫です。' },
    blind: { title: 'ブラインド', body: '黒い霧の層は色が分かりません。上の層を移して一番上に出ると、霧が晴れて色が分かります。一度見えた色は二度と隠れません。' },
    curtain: { title: 'カーテン', body: 'カーテンの掛かった瓶は触れません。裾の札に書かれた条件(指定の色、または本数)の瓶を完成させると開きます。' },
    'giant+blind': { title: '巨大ボトル × ブラインド', body: '霧に隠れた層を掘り出しながら、魔法瓶と同じ色を集めて満杯にしましょう。' },
    'blind+curtain': { title: 'ブラインド × カーテン', body: 'カーテンが開くと、その瓶の一番上の色だけが見えるようになります。' },
    shop: { title: '魔女の道具屋', body: 'パズルやミニゲームで貯めたコインで、アイテムや着せ替えを買えます。' },
    gacha: { title: '星の福引き', body: '1回50コイン、10連は500コインで、図鑑に飾る小物が当たります。10連はR以上が1つ確定。1回ごとに1ポイントたまり、100ポイントで好きなレアリティの未所持アイテムと交換できます。持っている物が出たときはコインに戻ります。' },
    minigame: { title: 'ミニゲーム', body: '気分転換に遊んでコインを稼げます。何度でも遊べて、失敗しても最低20枚もらえます。' },
    daily: { title: 'デイリーチャレンジ', body: '1日1問。クリアするとその月のトロフィーにポーションが注がれ、1か月分そろうと満杯になります。' },
    cosmetics: { title: '着せ替え', body: '瓶と背景のデザインを変えられます。買う前にプレビューできます。' },
  };


  // ---------------- gacha (collectibles only, no gameplay effect) ----------------
  // each genre has 4 N, 3 R, 2 SR, 1 SSR: 20 / 15 / 10 / 5 items in total
  const GACHA_GENRES = [
    { id: 'tools', name: '魔法の道具', items: [
      ['quill', 'N', '羽根ペン', '書いた呪文が少しだけ光る、カラスの羽根のペン。'],
      ['lantern', 'N', '古いランタン', '雨の夜でも消えない、小さな青い炎が灯る。'],
      ['spoon', 'N', '銀の匙', 'ポーションをかき混ぜると、ほんのり甘くなる。'],
      ['gloves', 'N', '革の手袋', '熱い大釜もへっちゃらな、使い込んだ手袋。'],
      ['hourglass', 'R', '砂時計の首飾り', '三分だけ時間がゆっくり流れる首飾り。'],
      ['starmap', 'R', '星図の巻物', '広げるたびに、今夜の星の位置に描き変わる。'],
      ['scales', 'R', '真鍮の天秤', '材料の重さだけでなく、気持ちの重さも量れる。'],
      ['crystalball', 'SR', '予言の水晶', '覗き込むと、明日の自分が手を振っている。'],
      ['moonwand', 'SR', '月光の杖', '月の光を集めて、夜道をそっと照らす杖。'],
      ['grimoire', 'SSR', '大魔女の魔導書', '代々の大魔女が書き足してきた、終わりのない魔導書。'],
    ] },
    { id: 'familiars', name: '使い魔', items: [
      ['frog', 'N', '小さなカエル', '雨の匂いがすると、ケロッと一声鳴く。'],
      ['hedgehog', 'N', 'ちびハリネズミ', '丸まると、針が星の形に光る。'],
      ['bat', 'N', 'ちびコウモリ', '夜のお使いが得意な、小さな相棒。'],
      ['mouse', 'N', '白ねずみ', '材料棚のチーズを守る、働き者。'],
      ['fox', 'R', '子ギツネ', 'しっぽで火を灯せる、いたずら好きの子ギツネ。'],
      ['owl', 'R', 'もりのフクロウ', '本の在りかを何でも知っている物知り。'],
      ['dragonegg', 'R', '竜の卵', 'ときどき中からコツコツと音がする。'],
      ['moonrabbit', 'SR', '月の兎', '満月の夜だけ、餅つきの音が聞こえる。'],
      ['firedrake', 'SR', '炎の小竜', '暖炉の火を絶やさない、小さな竜。'],
      ['starphoenix', 'SSR', '星の不死鳥', '羽ばたくたびに星くずがこぼれる、伝説の鳥。'],
    ] },
    { id: 'gems', name: '宝石と鉱石', items: [
      ['quartz', 'N', '水晶のかけら', '透かして見ると、景色が少しだけ優しくなる。'],
      ['amethyst', 'N', '紫水晶', '眠る前に枕元に置くと、よい夢が見られる。'],
      ['pyrite', 'N', '黄鉄鉱', '金貨と間違えられがちな、四角い石。'],
      ['moonstone', 'N', '月長石の粒', '月の満ち欠けで、色が少し変わる。'],
      ['amber', 'R', '琥珀', '中に小さな星の光が閉じ込められている。'],
      ['fluorite', 'R', '蛍石', '暗い場所で、ほんのり緑に光る。'],
      ['garnet', 'R', '柘榴石', '持ち主の勇気に合わせて、赤く輝く。'],
      ['starsapphire', 'SR', '星彩サファイア', '光を当てると、六つの光の筋が浮かぶ。'],
      ['opal', 'SR', '虹のオパール', '見る角度ごとに、違う季節の色になる。'],
      ['dragonheart', 'SSR', '竜の心臓石', '今もかすかに脈打つ、伝説の紅い石。'],
    ] },
    { id: 'sweets', name: '魔女のお菓子', items: [
      ['starcookie', 'N', '星くずクッキー', 'かじるとパチパチ星がはじける。'],
      ['marshmallow', 'N', '魔法のマシュマロ', '浮かべるとココアがふわりと宙に浮く。'],
      ['pumpkintart', 'N', 'かぼちゃのタルト', '収穫祭の定番。笑う顔が描いてある。'],
      ['herbcandy', 'N', 'ハーブの飴', '喉に効く、ミントとカモミールの飴。'],
      ['dango', 'R', '月見だんご', '月に供えると、次の日ひとつ増えている。'],
      ['rosemacaron', 'R', '薔薇のマカロン', '香りだけで、恋の悩みが軽くなる。'],
      ['berrypie', 'R', '森のベリーパイ', '森の妖精がこっそり分けてくれたベリー入り。'],
      ['starparfait', 'SR', '星降るパフェ', '一番上の星を食べると、願いがひとつ叶う。'],
      ['nightcake', 'SR', '夜空のケーキ', '切るたびに、断面に違う星座が現れる。'],
      ['goldpudding', 'SSR', '女王の金色プリン', '大魔女の誕生日にだけ作られる、幻のプリン。'],
    ] },
    { id: 'charms', name: '星と月のお守り', items: [
      ['mooncharm', 'N', '三日月のチャーム', 'カバンに付けると、忘れ物が減る。'],
      ['starbell', 'N', '星の鈴', '振ると、遠くの友だちに音が届く。'],
      ['cloverbookmark', 'N', '四つ葉の栞', '開いたページに、いい知らせが挟まっている。'],
      ['wishstring', 'N', '願いの組紐', '切れたときに、願いが叶うといわれる。'],
      ['meteorbrooch', 'R', '流れ星のブローチ', '胸元で、ときどき小さく流れ星が光る。'],
      ['phasewatch', 'R', '月齢の懐中時計', '時刻の代わりに、月の満ち欠けを指す。'],
      ['starcompass', 'R', '星座のコンパス', '北ではなく、会いたい人の方角を指す。'],
      ['snowglobe', 'SR', '銀河のスノードーム', '振ると、中で小さな銀河がゆっくり回る。'],
      ['sunmoonpendant', 'SR', '太陽と月のペンダント', '昼と夜で、表と裏の絵が入れ替わる。'],
      ['starcrown', 'SSR', '星の王冠', '夜空でいちばん明るい星を集めて作った王冠。'],
    ] },
  ];
  const GACHA = {
    cost1: 50, cost10: 500, exchangePoints: 100,
    rarities: [
      { id: 'N', rate: 0.60, refund: 10, color: '#b8c4d6', label: 'N' },
      { id: 'R', rate: 0.28, refund: 50, color: '#5ab0ff', label: 'R' },
      { id: 'SR', rate: 0.10, refund: 80, color: '#f2c44f', label: 'SR' },
      { id: 'SSR', rate: 0.02, refund: 100, color: '#ff7ad9', label: 'SSR' },
    ],
    genres: GACHA_GENRES,
    items: [],
  };
  GACHA_GENRES.forEach((g, gi) => g.items.forEach(([id, rarity, name, desc], k) => GACHA.items.push({ id, rarity, name, desc, genre: g.id, gi, k })));

  root.GameData = { GACHA, COLORS, SERIES, VARIANTS, BOTTLES, TROPHY_MOTIFS, TROPHY_COLORS, CONFIG, ITEMS, ACH, ACH_REWARD, RULE_CARDS };
})(typeof globalThis !== 'undefined' ? globalThis : this);
