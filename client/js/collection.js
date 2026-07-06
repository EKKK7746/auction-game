// ============================================================
// collection.js — 收集系统数据层（localStorage CRUD）
// 说文物品收集、对局统计、成就解锁、皮肤装备
// ============================================================

const COLLECTION_KEY = 'mwCollection';
const CHEAT_BACKUP_KEY = 'mwCollection_labrat_backup';
const CHEAT_ACTIVE_KEY = 'mwCollection_labrat_active';

// 10 张文物卡牌定义（与 server/gameEngine.js CARDS 对应）
const ARTIFACT_IDS = [
  'sxqts','qsbmy','qmht','syfz','slj',
  'jlyy','ltsx','zhybz','yqz','yqh',
  'dhmh','rytqy','kxqt','jgpx','dhft',
  'sq','sxtc','cjgb','jofjg','dhcxb'
];

// ==================== 成就定义 ====================
// hidden: true → 达成前不可见；hidden: false（常驻）→ 始终可见
const ACHIEVEMENTS = {
  // --- 原有成就（常驻） ---
  first_win:       { id:'first_win',       name:'初出茅庐',   desc:'赢得第1局游戏',             icon:'🏆', reward:{ type:'avatarFrame', id:'frame_bronze' } },
  collector_5:     { id:'collector_5',     name:'小有收藏',   desc:'收集5种不同文物',           icon:'📦', reward:{ type:'avatarFrame', id:'frame_silver' } },
  collector_10:    { id:'collector_10',    name:'收藏大家',   desc:'收集10种不同文物',          icon:'🏛️', reward:{ type:'avatarFrame', id:'frame_gold' } },
  collector_all:   { id:'collector_all',   name:'博物君子',   desc:'集齐全部20种文物',          icon:'👑', reward:{ type:'diceEffect', id:'dice_golden' } },
  auctioneer_5:    { id:'auctioneer_5',    name:'拍卖行家',   desc:'担任拍卖师5次',             icon:'🔨', reward:{ type:'avatar',     id:'avatar_auctioneer' } },
  rich_50:         { id:'rich_50',         name:'富可敌国',   desc:'一局游戏结束时拥有50+金币',   icon:'💰', reward:{ type:'avatar',     id:'avatar_merchant' } },
  win_3_streak:    { id:'win_3_streak',    name:'连战连捷',   desc:'连续3局获胜',               icon:'🔥', reward:{ type:'diceEffect', id:'dice_inferno' } },
  play_10_games:   { id:'play_10_games',   name:'身经百战',   desc:'参与10局游戏',              icon:'⚔️', reward:{ type:'avatar',     id:'avatar_veteran' } },
  d4_winner:       { id:'d4_winner',       name:'以小博大',   desc:'在镜中决斗中用d4骰子获胜',  icon:'🎲', reward:{ type:'diceEffect', id:'dice_lucky' } },
  high_score_20:   { id:'high_score_20',   name:'高分猎手',   desc:'单局最终分达到20分',         icon:'⭐', reward:{ type:'avatar',     id:'avatar_star' } },

  // --- 新增：运气类 ---
  chosen_one:      { id:'chosen_one',      name:'天选之子',   desc:'单局内掷出3次以上最大点数',   icon:'🌟', hidden: false, reward:null },
  bad_luck:        { id:'bad_luck',        name:'霉运连连',   desc:'连续4局，每局最终点数为1',   icon:'🌚', hidden: true,  reward:null },
  narrow_win:      { id:'narrow_win',      name:'一线生机',   desc:'在镜中决斗中用d4获胜',       icon:'⚡', hidden: true,  reward:null },

  // --- 新增：拍卖师类 ---
  always_runner:   { id:'always_runner',   name:'万年老二',   desc:'单局竞选拍卖师3次以上全部落选', icon:'🥈', hidden: true,  reward:null },
  monopoly:        { id:'monopoly',        name:'垄断巨头',   desc:'连续当选拍卖师8次',          icon:'🏦', hidden: false, reward:null },
  fisherman:       { id:'fisherman',       name:'鹬蚌相争',   desc:'作为拍卖师，某回合所有其他玩家都租了d20', icon:'🎣', hidden: true, reward:null },

  // --- 新增：策略类 ---
  miser:           { id:'miser',           name:'守财奴',     desc:'全程不租骰，最终得分第一',   icon:'🤑', hidden: false, reward:null },
  business_mind:   { id:'business_mind',   name:'商业头脑',   desc:'单局至少一次获得100%工资率（持有市券时叫到50%），且该次总收入≥18', icon:'📈', hidden: false, reward:null },
  millennium_eye:  { id:'millennium_eye',  name:'一眼千年',   desc:'单局收集到3件以上同朝代文物', icon:'👁️', hidden: false, reward:null },

  // --- 新增：交互类 ---
  social_butterfly: { id:'social_butterfly', name:'社交达人',   desc:'累计发起交易30次以上',       icon:'🤝', hidden: true,  reward:null },
  three_visits:    { id:'three_visits',    name:'三顾茅庐',   desc:'单局交易被拒3次以上',        icon:'📜', hidden: true,  reward:null },
  all_in:          { id:'all_in',          name:'破釜沉舟',   desc:'某回合将所有金币花光租骰',   icon:'🔥', hidden: true,  reward:null },
};

// ==================== 皮肤定义 ====================
const SKINS = {
  avatar: {
    'default':           { name:'默认',        gradient:'linear-gradient(135deg, #8B7B6B, #6B5B4B)' },
    'avatar_auctioneer': { name:'拍卖师',      gradient:'linear-gradient(135deg, #D4AF37, #8B6914)' },
    'avatar_merchant':   { name:'金主',        gradient:'linear-gradient(135deg, #FFD700, #FF6B00)' },
    'avatar_veteran':    { name:'老兵',        gradient:'linear-gradient(135deg, #4A90D9, #1A3A5C)' },
    'avatar_star':       { name:'明星玩家',    gradient:'linear-gradient(135deg, #FF6B9D, #C44569)' },
  },
  avatarFrame: {
    'default':      { name:'默认',    css:'' },
    'frame_bronze': { name:'青铜框',  css:'box-shadow: 0 0 0 3px #CD7F32, 0 0 8px rgba(205,127,50,0.5);' },
    'frame_silver': { name:'白银框',  css:'box-shadow: 0 0 0 3px #C0C0C0, 0 0 10px rgba(192,192,192,0.6);' },
    'frame_gold':   { name:'黄金框',  css:'box-shadow: 0 0 0 3px #FFD700, 0 0 12px rgba(255,215,0,0.7);' },
  },
  diceEffect: {
    'default':      { name:'默认·漆器金',   primary:'#d4a84b', secondary:'#B85C3A', accent:'#F0D78C', particleCount:500 },
    'dice_golden':  { name:'流光溢彩',      primary:'#9B59FF', secondary:'#00D4C4', accent:'#FF6BB5', particleCount:600 },
    'dice_inferno': { name:'烈焰燎原',      primary:'#FF4500', secondary:'#8B0000', accent:'#FF2400', particleCount:550 },
    'dice_lucky':   { name:'四叶幸运',      primary:'#00CC66', secondary:'#006633', accent:'#AAFFCC', particleCount:450 },
  }
};

// ==================== 默认数据结构 ====================
function _defaultCollection() {
  return {
    artifacts: {},      // { cardId: { count: N, firstWon: timestamp } }
    stats: {
      totalGames: 0,
      totalWins: 0,
      totalCardsWon: 0,
      totalFundsEarned: 0,
      bestScore: 0,
      bestRank: 999,
      winStreak: 0,
      bestWinStreak: 0,
      totalAuctioneerRounds: 0,
      // 新增追踪字段
      totalTradesInitiated: 0,  // 累计发起交易次数
      consecutiveLastPlaceRolls: 0,  // 连续最终点数1的局数
    },
    achievements: {},   // { achievementId: { unlockedAt: timestamp } }
    equippedSkin: {
      avatar: 'default',
      avatarFrame: 'default',
      diceEffect: 'default',
    },
    // 每局临时追踪（游戏开始时重置）
    _sessionStats: null,
  };
}

// ==================== 基础读写 ====================
function _loadCollection() {
  // labrat 作弊模式：检测状态切换
  const wasLabrat = localStorage.getItem(CHEAT_ACTIVE_KEY) === '1';
  const isLabrat = _isLabrat();

  if (isLabrat && !wasLabrat) {
    // 刚切换到 labrat：备份旧存档
    const oldData = localStorage.getItem(COLLECTION_KEY);
    if (oldData) {
      localStorage.setItem(CHEAT_BACKUP_KEY, oldData);
    }
    localStorage.setItem(CHEAT_ACTIVE_KEY, '1');
    console.log('[Collection] 🎮 labrat 作弊模式：已备份旧存档');
    return _getFullCollectionWithSkins();
  }

  if (!isLabrat && wasLabrat) {
    // 刚退出 labrat：恢复旧存档
    const backup = localStorage.getItem(CHEAT_BACKUP_KEY);
    if (backup) {
      localStorage.setItem(COLLECTION_KEY, backup);
    } else {
      // 无旧存档时直接清空 labrat 污染的数据
      localStorage.removeItem(COLLECTION_KEY);
    }
    localStorage.removeItem(CHEAT_BACKUP_KEY);
    localStorage.removeItem(CHEAT_ACTIVE_KEY);
    console.log('[Collection] 🔄 退出作弊模式，已恢复旧存档');
    // 继续正常加载
  }

  if (isLabrat) {
    return _getFullCollectionWithSkins();
  }

  try {
    const raw = localStorage.getItem(COLLECTION_KEY);
    if (!raw) return _defaultCollection();
    const data = JSON.parse(raw);
    return _deepMerge(_defaultCollection(), data);
  } catch (e) {
    console.warn('[Collection] 数据损坏，重置', e);
    return _defaultCollection();
  }
}

function _saveCollection(data) {
  try {
    localStorage.setItem(COLLECTION_KEY, JSON.stringify(data));
  } catch (e) {
    console.error('[Collection] 保存失败', e);
  }
}

/** 直接写入原始数据（用于从服务端同步后覆盖本地） */
function _saveCollectionRaw(data) {
  _saveCollection(data);
}

/** 获取当前玩家昵称 */
function _getNickname() {
  // 优先从 auth 系统获取
  if (typeof GameState !== 'undefined' && GameState.authUser && GameState.nickname) {
    return GameState.nickname;
  }
  try {
    const raw = localStorage.getItem('mwPlayer');
    if (!raw) return '';
    const data = JSON.parse(raw);
    return data.nickname || '';
  } catch (e) {
    return '';
  }
}

/** 检查是否为 labrat 作弊模式 */
function _isLabrat() {
  return _getNickname() === 'labrat';
}

/** 获取全解锁集合数据 */
function _getFullCollection() {
  const data = _defaultCollection();
  // 收集全部文物
  for (const id of ARTIFACT_IDS) {
    data.artifacts[id] = { count: 99, firstWon: Date.now() };
  }
  // 解锁全部成就（含隐藏成就）
  for (const achId of Object.keys(ACHIEVEMENTS)) {
    data.achievements[achId] = { unlockedAt: Date.now() };
  }
  // 全统计满值
  data.stats.totalGames = 999;
  data.stats.totalWins = 999;
  data.stats.totalCardsWon = 9999;
  data.stats.bestScore = 999;
  data.stats.bestRank = 1;
  data.stats.winStreak = 99;
  data.stats.bestWinStreak = 99;
  data.stats.totalAuctioneerRounds = 999;
  data.stats.totalTradesInitiated = 999;
  data.stats.consecutiveLastPlaceRolls = 4;
  return data;
}

/** 获取全解锁集合数据（保留已装备的皮肤） */
function _getFullCollectionWithSkins() {
  const data = _getFullCollection();
  // 从 COLLECTION_KEY 读取当前已装备的皮肤（本次 labrat 会话中已装备的记录）
  try {
    const saved = JSON.parse(localStorage.getItem(COLLECTION_KEY) || '{}');
    if (saved && saved.equippedSkin) {
      Object.assign(data.equippedSkin, saved.equippedSkin);
    }
  } catch (e) { /* ignore */ }
  return data;
}

function _deepMerge(defaults, data) {
  const result = { ...defaults };
  for (const key of Object.keys(data)) {
    if (typeof defaults[key] === 'object' && defaults[key] !== null && !Array.isArray(defaults[key])) {
      result[key] = _deepMerge(defaults[key], data[key] || {});
    } else {
      result[key] = data[key];
    }
  }
  return result;
}

// ==================== 公共 API ====================

/** 获取完整收集数据 */
function getCollection() {
  return _loadCollection();
}

/** 重置收集数据 */
function resetCollection() {
  _saveCollection(_defaultCollection());
}

/** 游戏结束后更新收集数据 */
function updateAfterGame(view, myPlayerId) {
  if (!view || view.phase !== 'finished') return null;

  const data = _loadCollection();
  const results = view.finalResults || [];
  const me = results.find(r => r.id === myPlayerId);
  if (!me) return null;

  // 统计
  data.stats.totalGames++;
  data.stats.totalCardsWon += (me.cards || []).length;
  data.stats.bestScore = Math.max(data.stats.bestScore, me.adjustedScore || 0);
  data.stats.bestRank = Math.min(data.stats.bestRank, me.rank || 999);

  if (me.rank === 1) {
    data.stats.totalWins++;
    data.stats.winStreak++;
    data.stats.bestWinStreak = Math.max(data.stats.bestWinStreak, data.stats.winStreak);
  } else {
    data.stats.winStreak = 0;
  }

  // 文物收集
  if (me.cards) {
    for (const card of me.cards) {
      if (!data.artifacts[card.id]) {
        data.artifacts[card.id] = { count: 0, firstWon: Date.now() };
      }
      data.artifacts[card.id].count++;
    }
  }

  // 填充会话统计中的 cardsObtained（用于"一眼千年"成就）
  if (data._sessionStats && me.cards) {
    data._sessionStats.cardsObtained = me.cards.map(c => c.id || c);
  }

  // 成就检查
  const newAchievements = _checkAchievements(data, me, view);

  // 新增成就检查（基于会话统计）
  const sessionAch = _checkSessionAchievements(data, me, view);
  newAchievements.push(...sessionAch);

  _saveCollection(data);
  return newAchievements.length > 0 ? newAchievements : null;
}

/** 检查基于会话统计的成就 */
function _checkSessionAchievements(data, me, view) {
  const newAch = [];
  const ach = data.achievements;
  const ss = data._sessionStats;
  if (!ss) return newAch;

  // 天选之子：单局内掷出3次以上最大点数
  if (!ach.chosen_one && (ss.maxRolls || 0) >= 3) {
    ach.chosen_one = { unlockedAt: Date.now() };
    newAch.push('chosen_one');
  }

  // 霉运连连：连续4局，每局最终点数为1
  if (!ach.bad_luck) {
    if (ss.finalRollValue === 1) {
      data.stats.consecutiveLastPlaceRolls = (data.stats.consecutiveLastPlaceRolls || 0) + 1;
    } else {
      data.stats.consecutiveLastPlaceRolls = 0;
    }
    if ((data.stats.consecutiveLastPlaceRolls || 0) >= 4) {
      ach.bad_luck = { unlockedAt: Date.now() };
      newAch.push('bad_luck');
    }
  }

  // 一线生机：在镜中决斗中用d4获胜（与 d4_winner 相同条件）
  if (!ach.narrow_win && data.stats._lastDuelWinType === 'd4') {
    ach.narrow_win = { unlockedAt: Date.now() };
    newAch.push('narrow_win');
  }

  // 万年老二：单局竞选拍卖师3次以上全部落选
  if (!ach.always_runner && (ss.auctioneerBidCount || 0) >= 3 && (ss.auctioneerWonCount || 0) === 0) {
    ach.always_runner = { unlockedAt: Date.now() };
    newAch.push('always_runner');
  }

  // 垄断巨头：连续当选拍卖师8次
  if (!ach.monopoly && (ss.consecutiveAuctioneer || 0) >= 8) {
    ach.monopoly = { unlockedAt: Date.now() };
    newAch.push('monopoly');
  }

  // 鹬蚌相争：作为拍卖师，某回合所有其他玩家都租了d20
  if (!ach.fisherman && ss.allD20Round && ss.wasAuctioneerForAllD20) {
    ach.fisherman = { unlockedAt: Date.now() };
    newAch.push('fisherman');
  }

  // 守财奴：全程不租骰，最终得分第一
  if (!ach.miser && !ss.diceRented && me.rank === 1) {
    ach.miser = { unlockedAt: Date.now() };
    newAch.push('miser');
  }

  // 商业头脑：100%工资率且收入≥18
  if (!ach.business_mind && ss.had100PercentComm) {
    ach.business_mind = { unlockedAt: Date.now() };
    newAch.push('business_mind');
  }

  // 一眼千年：单局收集到3件以上同朝代文物
  if (!ach.millennium_eye && ss.cardsObtained && ss.cardsObtained.length >= 3) {
    const dynastyCount = {};
    for (const cardId of ss.cardsObtained) {
      const lore = CARD_LORE[cardId];
      if (lore && typeof lore === 'object') {
        const d = lore.dynasty;
        dynastyCount[d] = (dynastyCount[d] || 0) + 1;
        if (dynastyCount[d] >= 3) {
          ach.millennium_eye = { unlockedAt: Date.now() };
          newAch.push('millennium_eye');
          break;
        }
      }
    }
  }

  // 社交达人：累计发起交易30次以上
  if (!ach.social_butterfly && (data.stats.totalTradesInitiated || 0) >= 30) {
    ach.social_butterfly = { unlockedAt: Date.now() };
    newAch.push('social_butterfly');
  }

  // 三顾茅庐：单局交易被拒3次以上
  if (!ach.three_visits && (ss.tradeRejected || 0) >= 3) {
    ach.three_visits = { unlockedAt: Date.now() };
    newAch.push('three_visits');
  }

  // 破釜沉舟：某回合将所有金币花光租骰
  if (!ach.all_in && ss.allInRound) {
    ach.all_in = { unlockedAt: Date.now() };
    newAch.push('all_in');
  }

  return newAch;
}

function _checkAchievements(data, me, view) {
  const newAch = [];
  const ach = data.achievements;

  // first_win
  if (!ach.first_win && data.stats.totalWins >= 1) {
    ach.first_win = { unlockedAt: Date.now() };
    newAch.push('first_win');
  }

  // collector_5 / collector_10 / collector_all
  const uniqueCards = Object.keys(data.artifacts).length;
  if (!ach.collector_5 && uniqueCards >= 5) {
    ach.collector_5 = { unlockedAt: Date.now() };
    newAch.push('collector_5');
  }
  if (!ach.collector_10 && uniqueCards >= 10) {
    ach.collector_10 = { unlockedAt: Date.now() };
    newAch.push('collector_10');
  }
  if (!ach.collector_all && uniqueCards >= 20) {
    ach.collector_all = { unlockedAt: Date.now() };
    newAch.push('collector_all');
  }

  // auctioneer_5
  if (!ach.auctioneer_5 && (data.stats.totalAuctioneerRounds || 0) >= 5) {
    ach.auctioneer_5 = { unlockedAt: Date.now() };
    newAch.push('auctioneer_5');
  }

  // rich_50
  if (!ach.rich_50 && (me.funds || 0) >= 50) {
    ach.rich_50 = { unlockedAt: Date.now() };
    newAch.push('rich_50');
  }

  // win_3_streak
  if (!ach.win_3_streak && data.stats.bestWinStreak >= 3) {
    ach.win_3_streak = { unlockedAt: Date.now() };
    newAch.push('win_3_streak');
  }

  // play_10_games
  if (!ach.play_10_games && data.stats.totalGames >= 10) {
    ach.play_10_games = { unlockedAt: Date.now() };
    newAch.push('play_10_games');
  }

  // d4_winner — 需要外部钩子设置 stats._lastDuelWinType = 'd4'
  if (!ach.d4_winner && data.stats._lastDuelWinType === 'd4') {
    ach.d4_winner = { unlockedAt: Date.now() };
    newAch.push('d4_winner');
  }

  // high_score_20
  if (!ach.high_score_20 && (me.adjustedScore || 0) >= 20) {
    ach.high_score_20 = { unlockedAt: Date.now() };
    newAch.push('high_score_20');
  }

  return newAch;
}

/** 标记最近一次镜中决斗使用的骰子类型（用于 d4_winner 成就） */
function recordDuelDice(diceType, won) {
  if (!won) return;
  const data = _loadCollection();
  data.stats._lastDuelWinType = diceType;
  _saveCollection(data);
}

/** 记录拍卖师轮次 */
function recordAuctioneerRound() {
  const data = _loadCollection();
  data.stats.totalAuctioneerRounds = (data.stats.totalAuctioneerRounds || 0) + 1;
  _saveCollection(data);
}

// ==================== 每局会话追踪 ====================

/** 初始化一局的会话统计（游戏开始时调用） */
function initSessionStats() {
  const data = _loadCollection();
  data._sessionStats = {
    maxRolls: 0,           // 本局掷出最大点数的次数
    auctioneerBidCount: 0, // 本局竞选拍卖师次数
    auctioneerWonCount: 0, // 本局当选拍卖师次数
    consecutiveAuctioneer: 0, // 连续当选计数
    diceRented: false,     // 本局是否租过骰
    tradeInitiated: 0,     // 本局发起交易次数
    tradeRejected: 0,      // 本局交易被拒次数
    allInRound: false,     // 是否有回合花光所有金币租骰
    maxCommissionRate: 0,  // 本局最高佣金率
    maxCommissionIncome: 0, // 本局最高单次佣金收入
    had100PercentComm: false, // 是否有100%工资率
    finalRollValue: 0,     // 本局最终掷骰点数
    allD20Round: false,    // 是否有回合所有非拍卖师玩家都租d20
    wasAuctioneerForAllD20: false, // allD20Round时是否为拍卖师
    cardsObtained: [],     // 本局获得的卡牌ID列表
  };
  _saveCollection(data);
}

/** 更新会话统计（局内调用） */
function updateSessionStats(updates) {
  const data = _loadCollection();
  if (!data._sessionStats) return;
  Object.assign(data._sessionStats, updates);
  _saveCollection(data);
}

/** 获取会话统计 */
function getSessionStats() {
  const data = _loadCollection();
  return data._sessionStats || null;
}

/** 记录掷骰结果（用于天选之子成就） */
function recordDiceRoll(diceType, value, isMaxValue) {
  if (!isMaxValue) return;
  const data = _loadCollection();
  if (!data._sessionStats) return;
  data._sessionStats.maxRolls = (data._sessionStats.maxRolls || 0) + 1;
  _saveCollection(data);
}

/** 记录拍卖师竞选结果 */
function recordAuctioneerBid(won) {
  const data = _loadCollection();
  if (!data._sessionStats) return;
  data._sessionStats.auctioneerBidCount = (data._sessionStats.auctioneerBidCount || 0) + 1;
  if (won) {
    data._sessionStats.auctioneerWonCount = (data._sessionStats.auctioneerWonCount || 0) + 1;
    data._sessionStats.consecutiveAuctioneer = (data._sessionStats.consecutiveAuctioneer || 0) + 1;
  } else {
    data._sessionStats.consecutiveAuctioneer = 0;
  }
  _saveCollection(data);
}

/** 记录租骰 */
function recordDiceRented(diceType, cost, fundsAfter) {
  const data = _loadCollection();
  if (!data._sessionStats) return;
  data._sessionStats.diceRented = true;
  if (fundsAfter === 0) {
    data._sessionStats.allInRound = true;
  }
  _saveCollection(data);
}

/** 记录发起交易 */
function recordTradeInitiated() {
  const data = _loadCollection();
  if (!data._sessionStats) return;
  data._sessionStats.tradeInitiated = (data._sessionStats.tradeInitiated || 0) + 1;
  data.stats.totalTradesInitiated = (data.stats.totalTradesInitiated || 0) + 1;
  _saveCollection(data);
}

/** 记录交易被拒 */
function recordTradeRejected() {
  const data = _loadCollection();
  if (!data._sessionStats) return;
  data._sessionStats.tradeRejected = (data._sessionStats.tradeRejected || 0) + 1;
  _saveCollection(data);
}

/** 记录佣金收入 */
function recordCommission(rate, income, hasShiQuan) {
  const data = _loadCollection();
  if (!data._sessionStats) return;
  if (rate > data._sessionStats.maxCommissionRate) {
    data._sessionStats.maxCommissionRate = rate;
  }
  if (income > data._sessionStats.maxCommissionIncome) {
    data._sessionStats.maxCommissionIncome = income;
  }
  // 100%工资率 = 持有市券时叫到50%（佣金翻倍后实际100%）
  if (hasShiQuan && rate === 50 && income >= 18) {
    data._sessionStats.had100PercentComm = true;
  }
  _saveCollection(data);
}

/** 记录回合掷骰情况（所有非拍卖师玩家都租d20） */
function recordRoundDiceSummary(allD20, isAuctioneer) {
  const data = _loadCollection();
  if (!data._sessionStats) return;
  if (allD20) {
    data._sessionStats.allD20Round = true;
    data._sessionStats.wasAuctioneerForAllD20 = isAuctioneer;
  }
  _saveCollection(data);
}

/** 局内实时成就检查（每轮结束后调用） */
function checkAchievementsRealtime(view, myPlayerId) {
  if (!view || view.phase === 'finished') return null;
  const data = _loadCollection();
  const me = view.players.find(p => p.id === myPlayerId);
  if (!me) return null;

  const newAch = [];
  const ach = data.achievements;

  // 检查收集类成就（新增卡牌时触发）
  if (me.cards) {
    const uniqueCards = new Set([...Object.keys(data.artifacts)]);
    for (const card of me.cards) {
      uniqueCards.add(card.id || card);
    }
    const count = uniqueCards.size;
    if (!ach.collector_5 && count >= 5) {
      ach.collector_5 = { unlockedAt: Date.now() };
      newAch.push('collector_5');
    }
    if (!ach.collector_10 && count >= 10) {
      ach.collector_10 = { unlockedAt: Date.now() };
      newAch.push('collector_10');
    }
    if (!ach.collector_all && count >= 20) {
      ach.collector_all = { unlockedAt: Date.now() };
      newAch.push('collector_all');
    }
  }

  // 检查 d4_winner（通过 _lastDuelWinType 标记）
  if (!ach.d4_winner && data.stats._lastDuelWinType === 'd4') {
    ach.d4_winner = { unlockedAt: Date.now() };
    newAch.push('d4_winner');
  }

  // 检查 auctioneer_5
  if (!ach.auctioneer_5 && (data.stats.totalAuctioneerRounds || 0) >= 5) {
    ach.auctioneer_5 = { unlockedAt: Date.now() };
    newAch.push('auctioneer_5');
  }

  // 检查会话统计成就（12 个新增成就）
  const sessionAch = _checkSessionAchievements(data, me, view);
  newAch.push(...sessionAch);

  if (newAch.length > 0) {
    _saveCollection(data);
  }
  return newAch.length > 0 ? newAch : null;
}

/** 装备皮肤 */
function equipSkin(type, skinId) {
  const validTypes = ['avatar', 'avatarFrame', 'diceEffect'];
  if (!validTypes.includes(type)) return false;
  if (!SKINS[type][skinId]) return false;
  const data = _loadCollection();
  data.equippedSkin[type] = skinId;
  _saveCollection(data);
  return true;
}

/** 获取当前装备的皮肤 */
function getEquippedSkin(type) {
  const data = _loadCollection();
  return data.equippedSkin[type] || 'default';
}

/** 获取皮肤详情 */
function getSkinInfo(type, skinId) {
  return SKINS[type] && SKINS[type][skinId] ? SKINS[type][skinId] : SKINS[type].default;
}

/** 获取所有可用的皮肤列表（含解锁状态） */
function getSkinCatalog() {
  const data = _loadCollection();
  const catalog = { avatar: [], avatarFrame: [], diceEffect: [] };
  for (const type of Object.keys(SKINS)) {
    for (const [id, skin] of Object.entries(SKINS[type])) {
      const unlocked = id === 'default' || _isSkinUnlocked(data, id);
      catalog[type].push({ id, ...skin, unlocked, equipped: data.equippedSkin[type] === id });
    }
  }
  return catalog;
}

function _isSkinUnlocked(data, skinId) {
  // 皮肤通过成就解锁
  for (const ach of Object.values(ACHIEVEMENTS)) {
    if (ach.reward && ach.reward.id === skinId && data.achievements[ach.id]) {
      return true;
    }
  }
  return false;
}

/** 应用当前装备的骰子皮肤到 diceParticles */
function applyDiceSkin() {
  const skinId = getEquippedSkin('diceEffect');
  if (skinId === 'default') return; // 使用默认配置
  const skin = getSkinInfo('diceEffect', skinId);
  if (skin && typeof window.setDiceSkin === 'function') {
    window.setDiceSkin(skin.primary, skin.secondary, skin.accent, skin.particleCount);
  }
}

/** 获取当前装备的皮肤组合（用于上传给服务器同步） */
function getSkinBundle() {
  const data = _loadCollection();
  return {
    avatar: data.equippedSkin.avatar || 'default',
    avatarFrame: data.equippedSkin.avatarFrame || 'default',
    diceEffect: data.equippedSkin.diceEffect || 'default',
  };
}

/** 应用头像框样式到 DOM 元素；优先使用传入的 skinData，否则读本地 localStorage */
function applyAvatarSkin(el, skinData) {
  if (!el) return;
  // 传入 skinData 为对象时：缺失字段视为 default，不再回退到本地皮肤（避免把本地皮肤套到别的玩家/Bot 上）
  const useServerData = typeof skinData === 'object' && skinData !== null;
  const frameId = useServerData ? (skinData.avatarFrame || 'default') : (skinData?.avatarFrame ? skinData.avatarFrame : getEquippedSkin('avatarFrame'));
  const avatarId = useServerData ? (skinData.avatar || 'default') : (skinData?.avatar ? skinData.avatar : getEquippedSkin('avatar'));
  // 头像底色：始终应用，default 使用默认棕色渐变覆盖可能不一致的 CSS 默认色
  const avatarSkin = getSkinInfo('avatar', avatarId);
  if (avatarSkin && avatarSkin.gradient) {
    el.style.setProperty('background', avatarSkin.gradient, 'important');
  }
  // 头像框：default 不额外加框
  if (frameId !== 'default') {
    const frameSkin = getSkinInfo('avatarFrame', frameId);
    if (frameSkin && frameSkin.css) {
      // box-shadow: ... → 直接拆分应用到 style
      const parts = frameSkin.css.split(';').filter(s => s.trim());
      for (const part of parts) {
        const colonIdx = part.indexOf(':');
        if (colonIdx > 0) {
          const prop = part.substring(0, colonIdx).trim();
          const val = part.substring(colonIdx + 1).trim();
          el.style.setProperty(prop, val, 'important');
        }
      }
    }
  }
}
