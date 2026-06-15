// ============================================================
// cards.js — 卡牌视觉元数据（emoji / 颜色 / 图案类型）
// ============================================================

const CARD_VISUALS = {
  'ssdc': { emoji: '👘', color: '#E8D5B7', label: '丝', image: 'assets/cards/ssdc.png' },
  'mfl':  { emoji: '🏺', color: '#B8860B', label: '铜', image: 'assets/cards/mfl.png' },
  'slj':  { emoji: '🪞', color: '#C0C0C0', label: '镜', image: 'assets/cards/slj.png' },
  'ssyz': { emoji: '🍶', color: '#98FB98', label: '玉', image: 'assets/cards/ssyz.png' },
  'yulb': { emoji: '🐉', color: '#FFD700', label: '龙', image: 'assets/cards/yulb.png' },
  'lfh':  { emoji: '🕊️', color: '#FF6347', label: '凤', image: 'assets/cards/lfh.png' },
  'jxsp': { emoji: '🍽️', color: '#8B4513', label: '漆', image: 'assets/cards/jxsp.png' },
  'jxjeb':{ emoji: '🍷', color: '#A0522D', label: '漆', image: 'assets/cards/jxjeb.png' },
  'dsy':  { emoji: '🎭', color: '#DEB887', label: '俑', image: 'assets/cards/dsy.png' },
  'sq':   { emoji: '📜', color: '#F5DEB3', label: '券', image: 'assets/cards/sq.png' },
};

const EFFECT_LABELS = {
  dragonPhoenix: '🐉🕊️ 龙凤联动',
  rerollDice: '🎲 重掷一次',
  upgradeDice: '⬆️ 骰子升级',
  doubleCommission: '💰 佣金翻倍',
  duel: '🪞 镜中决斗',
};

const PHASE_LABELS = {
  auction: '拍卖阶段',
  selectCard: '拍卖师选卡',
  rentDice: '租骰阶段',
  rollDice: '掷骰中',
  settle: '结算',
  duel: '镜中决斗',
  finished: '游戏结束',
};

const CARD_RARITY = {
  'ssdc': 'legendary', 'mfl': 'legendary',  // 3分卡 → 传说
  'ssyz': 'rare', 'slj': 'rare',            // 2分卡
  'yulb': 'rare', 'jxjeb': 'rare',          // 联动关键卡
  'lfh': 'common', 'jxsp': 'common',        // 1分联动卡
  'dsy': 'common', 'sq': 'common',          // 1分功能卡
};

function getCardRarity(cardId) {
  return CARD_RARITY[cardId] || 'common';
}

function getCardVisual(cardId) {
  return CARD_VISUALS[cardId] || { emoji: '❓', color: '#CCCCCC', label: '?' };
}

function getEffectLabel(effect) {
  return effect ? (EFFECT_LABELS[effect] || effect) : '';
}

// 返回卡牌图片 HTML（统一尺寸，加载失败回退 emoji）
function getCardImageHtml(cardId, sizeClass) {
  const vis = getCardVisual(cardId);
  const cls = sizeClass || 'card-img-md';
  if (vis.image) {
    return `<img class="card-image ${cls}" src="${vis.image}" alt="${vis.emoji} ${cardId}" onerror="this.style.display='none';this.insertAdjacentHTML('afterend','<span class=\\'card-emoji-fallback\\'>${vis.emoji}</span>')" />`;
  }
  return `<span class="card-emoji-fallback">${vis.emoji}</span>`;
}
