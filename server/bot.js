// ============================================================
// bot.js — AI 机器人决策逻辑 + BotManager 调度器
// ============================================================

const BOT_NAMES = [
  '辛追夫人', '利苍侯爷', '轪侯家臣', '长沙丞相', '汉墓守灵',
  '马王守将', '轪侯少主', '湘江渔翁', '长沙令尹', '太仓令史',
  '帛书官', '铜器匠',
];
const BOT_STRATEGIES = ['easy', 'normal', 'hard'];

// 全局计数器，用于生成唯一编号
let _botCounter = 0;

// -------------------- 工具函数 --------------------

function rand(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randDelay() {
  return rand(800, 2000);
}

// -------------------- BotManager --------------------

class BotManager {
  constructor(io, gameEngine) {
    this._io = io;
    this._engine = gameEngine;
    this._timers = {}; // roomId -> { [playerId]: timerId }
  }

  // 在 game_state_update 广播后调用
  processBots(roomId) {
    const state = this._engine.getGame(roomId);
    if (!state || state.phase === 'finished') return;

    // 包含 bot 和被托管的真人玩家
    const bots = state.players.filter(p => p.isBot || p.managed);
    if (bots.length === 0) return;

    console.log(`[Bot] processBots 调度: 房间=${roomId}, 阶段=${state.phase}, bots/managed=${bots.length}, 提案=${state._tradeProposal ? 'to ' + state._tradeProposal.toId : '无'}`);

    for (const bot of bots) {
      this.scheduleBot(roomId, bot, state);
    }
  }

  scheduleBot(roomId, player, state) {
    // 防止重复调度
    this._cancelTimer(roomId, player.id);

    // 检查该 bot 是否需要行动
    const action = this._getAction(player.id, state);
    if (!action) return;

    const delay = action.delayOverride || randDelay();
    const timerId = setTimeout(() => {
      // 重新获取最新状态（可能已被其他 bot 改变）
      const currentState = this._engine.getGame(roomId);
      if (!currentState || currentState.phase === 'finished') {
        this._clearTimers(roomId, player.id);
        return;
      }

      // 重新校验行动是否仍有效（防止过期操作）
      const currentAction = this._getAction(player.id, currentState);
      if (!currentAction) {
        this._clearTimers(roomId, player.id);
        return;
      }

      // 执行操作
      const result = currentAction.fn(roomId, player.id, currentState);
      if (result && result.error) {
        console.log(`[Bot] ${player.nickname} 操作失败: ${result.error}`);
      }

      // ★ C1 修复：不再 _clearTimers！
      // action.fn() 内部的 broadcast → processBots 已经重新调度了本 bot，
      // 此处调用 _clearTimers 会误删 processBots 刚设的新定时器。
      // 旧定时器已到期，自动 GC。下次 processBots 的 _cancelTimer 会清理残留。
    }, delay);

    this._ensureRoom(roomId);
    this._timers[roomId][player.id] = timerId;
    console.log(`[Bot] ${player.nickname} 将在 ${delay}ms 后行动 (${action.label})`);
  }

  removeBot(roomId, botId) {
    this._cancelTimer(roomId, botId);
    this._clearTimers(roomId, botId);
    console.log(`[Bot] 移除 Bot ${botId} 从房间 ${roomId}`);
  }

  cancelRoom(roomId) {
    if (!this._timers[roomId]) return;
    for (const pid of Object.keys(this._timers[roomId])) {
      clearTimeout(this._timers[roomId][pid]);
    }
    delete this._timers[roomId];
    console.log(`[Bot] 房间 ${roomId} 所有定时器已清除`);
  }

  /** 公开方法：取消单个玩家的 Bot 定时器（用于托管退出） */
  cancelPlayerTimer(roomId, playerId) {
    this._cancelTimer(roomId, playerId);
    this._clearTimers(roomId, playerId);
  }

  _cancelTimer(roomId, playerId) {
    if (this._timers[roomId] && this._timers[roomId][playerId]) {
      clearTimeout(this._timers[roomId][playerId]);
      delete this._timers[roomId][playerId];
    }
  }

  _clearTimers(roomId, playerId) {
    if (this._timers[roomId]) {
      delete this._timers[roomId][playerId];
      if (Object.keys(this._timers[roomId]).length === 0) {
        delete this._timers[roomId];
      }
    }
  }

  _ensureRoom(roomId) {
    if (!this._timers[roomId]) this._timers[roomId] = {};
  }

  // 判断该 bot 当前是否需要行动
  _getAction(playerId, state) {
    const hasActed = this._hasPlayerActed(playerId, state);

    switch (state.phase) {
      case 'auction': {
        // 暗标制：所有 Bot 同时报价，无需等待顺序
        if (hasActed) return null;

        // ★ 新手教程第二轮：强制人机跳过竞标，确保玩家当选拍卖师
        if (state.isTutorial && state.round === 2) {
          const me = state.players.find(p => p.id === playerId);
          console.log(`[Bot] ${me?.nickname || playerId} 教程第二轮跳过竞标`);
          return { label: '教程跳过竞标', fn: (rid, pid) => this._engine.submitBid(rid, pid, null) };
        }

        return { label: '暗标竞标', fn: (rid, pid, s) => {
          const bid = bidStrategy(pid, s);
          return this._engine.submitBid(rid, pid, bid);
        }};
      }

      case 'selectCard': {
        if (state.auctioneerId !== playerId) return null;
        return { label: '选卡', fn: (rid, pid, s) => {
          const idx = selectCardStrategy(pid, s);
          return this._engine.selectCard(rid, pid, idx);
        }};
      }

      case 'rentDice': {
        if (state.auctioneerId === playerId) return null;
        if (hasActed) return null;
        return { label: '选骰子', fn: (rid, pid, s) => {
          const type = selectDiceStrategy(pid, s);
          return this._engine.selectDice(rid, pid, type);
        }};
      }

      case 'rollDice':
        // roll 已自动 resolve，无需 bot 操作
        return null;

      case 'duel': {
        if (!state.duel) return null;

        // --- Bot 是发起者 ---

        // 步骤1：选择对手
        if (state.duel.step === 'select_target' && playerId === state.duel.initiatorId) {
          return { label: '决斗选目标', fn: (rid, pid, s) => {
            const target = duelSelectTargetStrategy(pid, s);
            if (!target) return { error: '无合适决斗目标' };
            return this._engine.duelSelectTargetById(rid, pid, target);
          }};
        }

        // 步骤2：选择争夺卡牌
        if (state.duel.step === 'select_card' && playerId === state.duel.initiatorId) {
          return { label: '决斗选卡', fn: (rid, pid, s) => {
            const cardId = duelSelectCardStrategy(pid, s);
            return this._engine.duelSelectCardById(rid, pid, cardId);
          }};
        }

        // --- Bot 是参与者（发起者或目标都需要选骰子）---

        if (state.duel.step === 'rent_dice') {
          const isParticipant = playerId === state.duel.initiatorId || playerId === state.duel.targetId;
          if (!isParticipant) return null;

          if (state.duel.diceSelections.hasOwnProperty(playerId)) return null;

          return { label: '决斗选骰子', fn: (rid, pid, s) => {
            const type = duelDiceStrategy(pid, s);
            return this._engine.duelRentDiceById(rid, pid, type, false);
          }};
        }

        // roll_dice / resolve 阶段自动结算，Bot 无需操作
        return null;
      }

      case 'trade': {
        const proposal = state._tradeProposal;

        // 场景1：Bot/托管玩家是待处理提案的目标 → 评估并回应
        if (proposal && !proposal.responded && proposal.toId === playerId) {
          const me = state.players.find(p => p.id === playerId);
          console.log(`[Bot] ${me?.nickname || playerId} 收到交易提案，准备回应 (from=${proposal.fromId})`);
          return { label: '回应交易', fn: (rid, pid, s) => {
            const accept = tradeResponseStrategy(pid, s);
            console.log(`[Bot] ${me?.nickname || pid} 交易决策: ${accept ? '接受' : '拒绝'}`);
            const result = this._engine.respondTrade(rid, pid, accept);
            console.log(`[Bot] ${me?.nickname || pid} respondTrade 结果:`, result);
            return result;
          }};
        }

        // 场景2：托管玩家有交易配额但未跳过 → 自动跳过
        const tp = state.players.find(pp => pp.id === playerId);
        if (tp && !tp.isBot && tp.managed) {
          const quota = state._tradeQuota?.[playerId] ?? (state._mode === 'fulldeck' ? 2 : 1);
          if (quota > 0 && !state._tradeSkipped?.has(playerId)) {
            console.log(`[Bot] ${tp.nickname} 托管中，自动跳过交易`);
            return { label: '跳过交易', fn: (rid, pid) => this._engine.skipTrade(rid, pid) };
          }
        }

        return null;
      }

      case 'settle': {
        const p = state.players.find(p => p.id === playerId);
        const isAuctioneer = state.auctioneerId === playerId;
        const isHost = p && p.isHost;
        if (isHost || isAuctioneer) {
          // ★ 使用 randDelay() 保持一致决策节奏（800-2000ms），与 auction/rentDice 同频
          return { label: '结束回合', fn: (rid) => this._engine.endRound(rid), delayOverride: randDelay() };
        }
        return null;
      }

      default: return null;
    }
  }

  _hasPlayerActed(playerId, state) {
    if (state.phase === 'auction') {
      return state.bids.some(b => b.playerId === playerId);
    }
    if (state.phase === 'rentDice') {
      return state.diceSelections.hasOwnProperty(playerId);
    }
    return false;
  }
}

// -------------------- 卡牌价值评估 --------------------

/**
 * 评估卡牌的真实价值（考虑联动潜力、特效）
 */
function evaluateCardValue(card, playerCards) {
  let value = card.score || 0;

  // 联动组合检查
  if (card.effect === 'dragonPhoenix') {
    const partner = card.id === 'ltsx' ? 'kxqt' : 'ltsx';
    if (playerCards.some(c => c.id === partner)) {
      value += 3; // 联动成功：所有1分卡+1，价值大幅提升
    } else {
      value += 0.5; // 有联动潜力
    }
  }

  if (card.effect === 'rerollDice') {
    const partner = card.id === 'rytqy' ? 'jgpx' : 'rytqy';
    if (playerCards.some(c => c.id === partner)) {
      value += 2; // 联动成功：重掷能力
    } else {
      value += 0.5;
    }
  }

  // 特效价值
  if (card.effect === 'duel') value += 1.5;
  if (card.effect === 'extraScore') value += 2;
  if (card.effect === 'soloReroll') value += 1.5;
  if (card.effect === 'passiveIncome') value += 1.5;
  if (card.effect === 'streakShield') value += 1;
  if (card.effect === 'doubleCommission') value += 1;
  if (card.effect === 'upgradeDice') value += 1;

  return value;
}

/**
 * 规范化难度（兼容旧 strategy 值）
 */
function getDifficulty(player) {
  const s = player?.strategy || 'normal';
  if (s === 'greedy') return 'normal';
  if (s === 'frugal') return 'easy';
  return s;
}

// -------------------- 暗标竞标策略 --------------------

function bidStrategy(playerId, state) {
  const p = state.players.find(p => p.id === playerId);
  if (!p) return null;

  const difficulty = getDifficulty(p);
  const streak = state.auctioneerStreak || 0;

  // 通用规则
  if (streak >= 2) return null;
  if (p.funds <= 3) return null;

  if (difficulty === 'easy') {
    // easy：基本随机
    const roll = Math.random();
    if (roll < 0.30) return null;
    if (roll < 0.50) return 10;
    if (roll < 0.70) return 20;
    if (roll < 0.85) return 30;
    return 40;
  }

  if (difficulty === 'normal') {
    // normal：混合策略，倾向低价竞争
    const roll = Math.random();
    if (roll < 0.35) return 10;
    if (roll < 0.60) return 20;
    if (roll < 0.80) return 30;
    if (roll < 0.92) return 40;
    return null;
  }

  if (difficulty === 'hard') {
    // hard：根据牌堆价值决定竞争意愿
    const highValueCards = state.deck.filter(c =>
      c.score >= 3 || c.effect === 'dragonPhoenix' || c.effect === 'extraScore' || c.effect === 'duel'
    );
    const wantAuctioneer = highValueCards.length > 0 && streak < 1;

    if (!wantAuctioneer) {
      if (Math.random() < 0.50) return null;
      return 40; // 报高价，不想当选但碰碰运气
    }

    const roll = Math.random();
    if (roll < 0.40) return 10;  // 志在必得
    if (roll < 0.70) return 20;
    if (roll < 0.88) return 30;
    return null;
  }

  return null;
}

// -------------------- 选卡策略 --------------------

function selectCardStrategy(playerId, state) {
  const p = state.players.find(p => p.id === playerId);
  const deck = state.deck;
  if (!deck || deck.length === 0) return 0;

  const difficulty = getDifficulty(p);
  const myCards = p ? p.cards : [];

  if (difficulty === 'easy') {
    // easy：50% 选最高分，50% 随机
    if (Math.random() < 0.5) {
      let bestIdx = 0, bestScore = deck[0].score || 0;
      for (let i = 1; i < deck.length; i++) {
        if ((deck[i].score || 0) > bestScore) { bestScore = deck[i].score; bestIdx = i; }
      }
      return bestIdx;
    }
    return rand(0, deck.length - 1);
  }

  // normal / hard：评估每张卡的价值（考虑联动）
  let bestIdx = 0;
  let bestValue = -1;
  for (let i = 0; i < deck.length; i++) {
    let v = evaluateCardValue(deck[i], myCards);

    // hard：截胡逻辑——对手需要这张卡时增加优先级
    if (difficulty === 'hard') {
      for (const op of state.players) {
        if (op.id === playerId || op.cards.length === 0) continue;
        const opValue = evaluateCardValue(deck[i], op.cards);
        if (opValue > (deck[i].score || 0) + 1) {
          v += 0.5; // 对手想凑联动，截胡加分
        }
      }
    }

    if (v > bestValue) {
      bestValue = v;
      bestIdx = i;
    }
  }
  return bestIdx;
}

// -------------------- 租骰策略 --------------------

function _simpleDiceSelect(cardValue, funds) {
  if (cardValue >= 3) {
    if (funds >= 6) return 'd20';
    if (funds >= 4) return 'd12';
    if (funds >= 2) return 'd6';
    if (funds >= 1) return 'd4';
    return 'pass';
  }
  if (cardValue >= 2) {
    if (funds >= 4) return 'd12';
    if (funds >= 2) return 'd6';
    if (funds >= 1) return 'd4';
    return 'pass';
  }
  return Math.random() < 0.6 ? 'pass' : (funds >= 1 ? 'd4' : 'pass');
}

function _smartDiceSelect(effectiveValue, funds) {
  if (effectiveValue >= 4) {
    if (funds >= 6) return 'd20';
    if (funds >= 4) return 'd12';
    if (funds >= 2) return 'd6';
    if (funds >= 1) return 'd4';
    return 'pass';
  }
  if (effectiveValue >= 3) {
    if (funds >= 6) return Math.random() < 0.6 ? 'd20' : 'd12';
    if (funds >= 4) return 'd12';
    if (funds >= 2) return 'd6';
    if (funds >= 1) return 'd4';
    return 'pass';
  }
  if (effectiveValue >= 2) {
    if (funds >= 4) return Math.random() < 0.5 ? 'd12' : 'd6';
    if (funds >= 2) return 'd6';
    if (funds >= 1) return Math.random() < 0.5 ? 'd4' : 'pass';
    return 'pass';
  }
  // 低价值卡
  return Math.random() < 0.5 ? 'pass' : (funds >= 2 ? 'd6' : (funds >= 1 ? 'd4' : 'pass'));
}

function selectDiceStrategy(playerId, state) {
  const p = state.players.find(p => p.id === playerId);
  if (!p) return 'pass';

  const difficulty = getDifficulty(p);
  const card = state.revealedCard;
  const cardValue = card ? evaluateCardValue(card, p.cards) : 1;
  const funds = p.funds;
  const round = state.round || 1;
  const maxRounds = state.maxRounds || 10;
  const remaining = maxRounds - round + 1;

  if (funds <= 0) return 'pass';

  if (difficulty === 'easy') {
    return _simpleDiceSelect(cardValue, funds);
  }

  // normal / hard
  let multiplier = 1.0;
  if (remaining <= 3) multiplier = 1.2; // 后期更激进

  if (difficulty === 'hard') {
    const myScore = p.cardScore || 0;
    const maxOppScore = Math.max(...state.players
      .filter(pp => pp.id !== playerId)
      .map(pp => pp.cardScore || 0));
    if (myScore < maxOppScore - 2) multiplier = 1.3; // 落后追赶
    if (remaining <= 2) multiplier = 1.4; // 最后两轮全力
  }

  const effectiveValue = cardValue * multiplier;
  return _smartDiceSelect(effectiveValue, funds);
}

// -------------------- 决斗：选目标策略 --------------------

function duelSelectTargetStrategy(playerId, state) {
  if (!state.duel) return null;

  const p = state.players.find(pp => pp.id === playerId);
  const difficulty = getDifficulty(p);

  let bestTargetId = null;
  let bestScore = -1;

  for (const op of state.players) {
    if (op.id === playerId || op.cards.length === 0) continue;

    let targetValue;
    if (difficulty === 'easy') {
      targetValue = Math.max(...op.cards.map(c => c.score));
    } else {
      targetValue = Math.max(...op.cards.map(c => evaluateCardValue(c, op.cards)));
      if (difficulty === 'hard') {
        // hard：优先选领先者（拉分差）
        targetValue += (op.cardScore || 0) * 0.1;
      }
    }

    if (targetValue > bestScore) {
      bestScore = targetValue;
      bestTargetId = op.id;
    }
  }

  return bestTargetId;
}

// -------------------- 决斗：选卡策略 --------------------

function duelSelectCardStrategy(playerId, state) {
  if (!state.duel || !state.duel.targetId) return null;

  const target = state.players.find(p => p.id === state.duel.targetId);
  if (!target || target.cards.length === 0) return null;

  const p = state.players.find(pp => pp.id === playerId);
  const difficulty = getDifficulty(p);

  if (difficulty === 'easy') {
    // easy：选最高分卡
    let best = target.cards[0];
    for (const c of target.cards) {
      if (c.score > best.score) best = c;
    }
    return best.id;
  }

  // normal / hard：选价值最高的卡
  let bestCard = target.cards[0];
  let bestValue = evaluateCardValue(target.cards[0], target.cards);
  for (const c of target.cards) {
    const v = evaluateCardValue(c, target.cards);
    if (v > bestValue) {
      bestValue = v;
      bestCard = c;
    }
  }
  return bestCard.id;
}

// -------------------- 决斗：选骰策略 --------------------

function duelDiceStrategy(playerId, state) {
  const p = state.players.find(p => p.id === playerId);
  if (!p) return 'pass';

  const difficulty = getDifficulty(p);
  const targetCardScore = state.duel ? (state.duel.targetCardScore || 2) : 2;
  const funds = p.funds;

  // 评估目标卡的实际价值（决斗中目标卡价值可能很高）
  const target = state.duel && state.duel.targetId
    ? state.players.find(pp => pp.id === state.duel.targetId)
    : null;
  const targetCard = target && state.duel.targetCardId
    ? target.cards.find(c => c.id === state.duel.targetCardId)
    : null;
  const cardValue = targetCard ? evaluateCardValue(targetCard, target.cards) : targetCardScore;

  if (difficulty === 'easy') {
    if (funds >= 6 && cardValue >= 3) return 'd20';
    if (funds >= 4) return 'd12';
    if (funds >= 2) return 'd6';
    if (funds >= 1) return 'd4';
    return 'pass';
  }

  // normal / hard：根据卡牌价值智能选骰
  if (cardValue >= 4) {
    if (funds >= 6) return 'd20';
    if (funds >= 4) return 'd12';
    if (funds >= 2) return 'd6';
    if (funds >= 1) return 'd4';
    return 'pass';
  }
  if (cardValue >= 2.5) {
    if (funds >= 6) return Math.random() < 0.5 ? 'd20' : 'd12';
    if (funds >= 4) return 'd12';
    if (funds >= 2) return 'd6';
    if (funds >= 1) return 'd4';
    return 'pass';
  }
  // 低价值卡 → 控制投入
  if (funds >= 4) return Math.random() < 0.4 ? 'd12' : 'd6';
  if (funds >= 2) return 'd6';
  if (funds >= 1) return Math.random() < 0.3 ? 'd4' : 'pass';
  return 'pass';
}

// -------------------- 交易回应策略 --------------------

/**
 * 评估交易提案，决定是否接受
 * 复用 evaluateCardValue 评估卡牌实际价值（含联动/特效）
 * @param {string} playerId - 被提案的玩家 ID（Bot/托管）
 * @param {object} state - 游戏状态
 * @returns {boolean} true=接受, false=拒绝
 */
function tradeResponseStrategy(playerId, state) {
  const proposal = state._tradeProposal;
  if (!proposal || proposal.toId !== playerId) {
    console.log(`[Bot] tradeResponseStrategy: 无提案或目标不匹配 (playerId=${playerId}, proposal=${!!proposal})`);
    return false;
  }

  const me = state.players.find(pp => pp.id === playerId);
  if (!me) {
    console.log(`[Bot] tradeResponseStrategy: 玩家 ${playerId} 不存在`);
    return false;
  }

  const difficulty = getDifficulty(me);
  const fromPlayer = state.players.find(pp => pp.id === proposal.fromId);
  if (!fromPlayer) {
    console.log(`[Bot] tradeResponseStrategy: 发起方 ${proposal.fromId} 不存在`);
    return false;
  }

  // 收到的卡牌（fromCards 属于发起方，交易后归我）
  const receivedCards = proposal.fromCards
    .map(cid => fromPlayer.cards.find(c => c.id === cid))
    .filter(Boolean);

  // 给出的卡牌（toCards 属于我，交易后归对方）
  const givenCards = proposal.toCards
    .map(cid => me.cards.find(c => c.id === cid))
    .filter(Boolean);

  console.log(`[Bot] tradeResponseStrategy: ${me.nickname} 收到 ${receivedCards.length} 张卡，给出 ${givenCards.length} 张卡`);

  // 交易后我的卡组（用于评估联动价值）
  const myCardsAfter = [
    ...me.cards.filter(c => !proposal.toCards.includes(c.id)),
    ...receivedCards,
  ];

  // 金币权重：1 金币 ≈ 0.5 分价值
  const GOLD_WEIGHT = 0.5;

  const gainValue = receivedCards.reduce(
    (sum, c) => sum + evaluateCardValue(c, myCardsAfter), 0
  ) + (proposal.fromGold || 0) * GOLD_WEIGHT;

  const loseValue = givenCards.reduce(
    (sum, c) => sum + evaluateCardValue(c, me.cards), 0
  ) + (proposal.toGold || 0) * GOLD_WEIGHT;

  const netGain = gainValue - loseValue;

  console.log(`[Bot] tradeResponseStrategy: ${me.nickname} gain=${gainValue.toFixed(2)}, lose=${loseValue.toFixed(2)}, net=${netGain.toFixed(2)}, difficulty=${difficulty}`);

  // 难度分级阈值
  switch (difficulty) {
    case 'easy':   return netGain > -1;    // 宽容，偶尔吃亏
    case 'normal': return netGain > 0;     // 只接受不亏的
    case 'hard':   return netGain > 0.5;   // 精明，必须有赚头
    default:       return netGain > 0;
  }
}

// -------------------- 创建 Bot 玩家 --------------------

/**
 * 创建 Bot 玩家
 * @param {string[]} existingNicknames - 已被占用的昵称
 * @param {string} difficulty - 'auto' | 'easy' | 'normal' | 'hard'，默认 'auto'
 */
function createBotPlayer(existingNicknames, difficulty) {
  existingNicknames = existingNicknames || [];
  difficulty = difficulty || 'auto';

  // 基础名：从未被使用的名字中随机选
  const available = BOT_NAMES.filter(n => !existingNicknames.includes(n));
  const baseName = available.length > 0
    ? available[Math.floor(Math.random() * available.length)]
    : BOT_NAMES[Math.floor(Math.random() * BOT_NAMES.length)];

  // 生成编号（两位数，01-99 循环）
  _botCounter = (_botCounter % 99) + 1;
  const num = String(_botCounter).padStart(2, '0');
  const nickname = `${baseName}${num}`;

  return {
    id: 'bot_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
    nickname,
    isBot: true,
    strategy: difficulty, // 'auto' | 'easy' | 'normal' | 'hard'
  };
}

/**
 * 解析自动难度：根据真人玩家数将 strategy='auto' 的 Bot 转为实际难度
 * 在 game:start 前调用，直接修改 players 数组
 * @param {object[]} players - 玩家数组（含 strategy 字段）
 */
function resolveAutoStrategies(players) {
  const humanCount = players.filter(p => !p.isBot).length;

  for (const p of players) {
    if (!p.isBot) continue;
    const s = p.strategy || 'auto';
    if (s === 'auto') {
      if (humanCount <= 1) {
        p.strategy = 'hard';                     // 孤军奋战，给强力对手
      } else if (humanCount === 2) {
        p.strategy = Math.random() < 0.3 ? 'hard' : 'normal';  // 70%普通 30%困难
      } else if (humanCount === 3) {
        p.strategy = 'normal';                   // 三人成虎，博弈足够
      } else {
        p.strategy = Math.random() < 0.3 ? 'normal' : 'easy';  // 4+真人：70%简单 30%普通
      }
      console.log(`[Bot] ${p.nickname} 自动档 → ${p.strategy} (${humanCount}真人)`);
    }
  }
}

// -------------------- 导出 --------------------

module.exports = { BotManager, createBotPlayer, resolveAutoStrategies };
