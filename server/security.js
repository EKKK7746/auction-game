// ============================================================
// security.js — 游戏安全中间件
// 功能：限频、格式校验、反作弊、异常检测
// ============================================================

const gameEngine = require('./gameEngine');
const roomManager = require('./roomManager');

// -------------------- 配置 --------------------

/** IP 限频配置 */
const RATE_LIMITS = {
  'room:create':       { max: 5,  window: 60000 },
  'room:join':         { max: 10, window: 60000 },
  'room:add_bot':      { max: 10, window: 60000 },
  'game:bid':          { max: 10, window: 30000 },
  'game:roll_dice':    { max: 10, window: 30000 },
  '__default':         { max: 30, window: 10000 },
};

/** 最大违规次数（超过后断连） */
const MAX_VIOLATIONS = 3;

/** 事件参数校验规则 */
const EVENT_SCHEMAS = {
  'room:create': {
    isPublic:  { type: 'boolean' },
  },
  'room:join': {
    roomId:    { type: 'string', len: 6, pattern: /^[A-Z0-9]{6}$/ },
  },
  'room:leave': {
    roomId:    { type: 'string', len: 6 },
  },
  'room:kick': {
    roomId:    { type: 'string', len: 6 },
    targetId:  { type: 'string' },
  },
  'game:bid': {
    roomId:     { type: 'string', len: 6 },
    percentage: { type: 'number', min: 10, max: 50, nullable: true },
  },
  'game:select_card': {
    roomId:    { type: 'string', len: 6 },
    cardIndex: { type: 'number', min: 0 },  // 上限由 gameEngine 按当前 deck.length 动态校验
  },
  'game:select_dice': {
    roomId:   { type: 'string', len: 6 },
    diceType: { type: 'string', enum: ['d4', 'd6', 'd8', 'd12', 'd20', 'pass'] },
  },
  'game:place_side_bet': {
    roomId:   { type: 'string', len: 6 },
  },
  'game:roll_dice': {
    roomId:   { type: 'string', len: 6 },
  },
  'room:add_bot': {
    roomId:   { type: 'string', len: 6 },
  },
  'game:start': {
    roomId:   { type: 'string', len: 6 },
  },
};

/** 合法佣金值 */
const VALID_COMMISSIONS = [10, 20, 30, 40, 50];

// -------------------- 游戏状态校验规则 --------------------

const GAME_RULES = {
  'game:bid': (socket, state, args) => {
    // args[0]=roomId, args[1]=percentage
    if (!state) return { allowed: false, reason: '游戏不存在' };

    // 1. 玩家必须在游戏中
    if (!state.players.some(p => p.id === socket.id)) {
      return { allowed: false, reason: '你不在本局游戏中' };
    }

    // 2. 当前阶段必须是 auction（暗标制：所有人同时报价）
    if (state.phase !== 'auction') {
      return { allowed: false, reason: '当前不是拍卖阶段' };
    }

    // 3. 暗标制：每人只能报价一次
    if (state.bids && state.bids.some(b => b.playerId === socket.id)) {
      return { allowed: false, reason: '你已经报过价了' };
    }

    // 4. 佣金比例校验（非 null 时）
    const percentage = args[1];
    if (percentage !== null && percentage !== undefined) {
      const pct = Number(percentage);
      if (!VALID_COMMISSIONS.includes(pct)) {
        return { allowed: false, reason: '佣金比例必须为 10/20/30/40/50 之一' };
      }
    }

    return { allowed: true };
  },

  'game:select_card': (socket, state, args) => {
    if (!state) return { allowed: false, reason: '游戏不存在' };

    // 1. 必须是拍卖师
    if (state.auctioneerId !== socket.id) {
      return { allowed: false, reason: '只有拍卖师可以选卡' };
    }

    // 2. 当前阶段必须是 selectCard
    if (state.phase !== 'selectCard') {
      return { allowed: false, reason: '当前不是选卡阶段' };
    }

    return { allowed: true };
  },

  'game:select_dice': (socket, state, args) => {
    if (!state) return { allowed: false, reason: '游戏不存在' };

    // 1. 不能是拍卖师
    if (state.auctioneerId === socket.id) {
      return { allowed: false, reason: '拍卖师不参与掷骰' };
    }

    // 2. 当前阶段必须是 rentDice
    if (state.phase !== 'rentDice') {
      return { allowed: false, reason: '当前不是租骰阶段' };
    }

    // 3. 该玩家还没选过骰子
    if (state.diceSelections && state.diceSelections.hasOwnProperty(socket.id)) {
      return { allowed: false, reason: '你已经选过骰子了' };
    }

    return { allowed: true };
  },

  'game:roll_dice': (socket, state, args) => {
    if (!state) return { allowed: false, reason: '游戏不存在' };

    // 1. 当前阶段必须是 rentDice
    if (state.phase !== 'rentDice') {
      return { allowed: false, reason: '当前不在掷骰阶段' };
    }

    // 2. 该玩家已选骰子
    if (!state.diceSelections || !state.diceSelections.hasOwnProperty(socket.id)) {
      return { allowed: false, reason: '你还没选骰子' };
    }

    if (state.diceSelections[socket.id] === 'pass') {
      return { allowed: false, reason: '你已放弃本轮' };
    }

    // 3. 该玩家还没掷过
    if (state.diceResults && state.diceResults.hasOwnProperty(socket.id)) {
      return { allowed: false, reason: '你已经掷过骰了' };
    }

    return { allowed: true };
  },

  'game:start': (socket, state, args) => {
    // args[0] = roomId
    const roomId = args[0];

    // 获取房间玩家
    const players = roomManager.getPlayers(roomId);

    // 1. 必须是房主
    const me = players.find(p => p.id === socket.id);
    if (!me || !me.isHost) {
      return { allowed: false, reason: '只有房主可以开始游戏' };
    }

    // 2. 至少 2 人
    if (players.length < 2) {
      return { allowed: false, reason: '至少需要 2 名玩家' };
    }

    // 3. 游戏未开始（没有游戏状态，或已完成/等待）
    if (state) {
      if (state.phase !== 'finished' && state.phase !== 'waiting') {
        return { allowed: false, reason: '游戏已在进行中' };
      }
    }

    return { allowed: true };
  },

  'room:kick': (socket, state, args) => {
    // args[0]=roomId, args[1]=targetId
    const roomId = args[0];
    const targetId = args[1];

    const players = roomManager.getPlayers(roomId);

    // 1. 必须是房主
    const me = players.find(p => p.id === socket.id);
    if (!me || !me.isHost) {
      return { allowed: false, reason: '只有房主可以踢人' };
    }

    // 2. 目标玩家在房间内
    if (!players.some(p => p.id === targetId)) {
      return { allowed: false, reason: '目标玩家不在房间内' };
    }

    // 3. 不能踢自己
    if (socket.id === targetId) {
      return { allowed: false, reason: '不能踢自己' };
    }

    return { allowed: true };
  },
};

// -------------------- 异常检测配置 --------------------

const ANOMALY_RULES = {
  rapidJoinLeave:  { threshold: 3, window: 30000 },
  ghostRoom:       { threshold: 5, window: 60000 },
  invalidAction:   { threshold: 10, window: 60000 },
};

// -------------------- SecurityMiddleware 类 --------------------

class SecurityMiddleware {
  constructor(io) {
    this.io = io;
    /** socketId → Map<eventName, timestamps[]> */
    this.rateLimiter = new Map();
    /** socketId → { type → { count, lastTime, events[] } } */
    this.anomalyLog = new Map();
    /** socketId → count（总违规次数） */
    this.violations = new Map();
  }

  // ==================== 主入口 ====================

  /**
   * 校验一个事件是否允许
   * @param {object} socket
   * @param {string} eventName
   * @param  {...any} args 原始参数（含回调函数）
   * @returns {{ allowed: boolean, reason?: string }}
   */
  check(socket, eventName, ...args) {
    // 只拦截 room: / game: 前缀事件，不拦截 Socket.IO 内部事件
    if (!eventName.startsWith('room:') && !eventName.startsWith('game:')) {
      return { allowed: true };
    }

    // 去掉末尾的回调函数用于校验
    const validateArgs = (args.length > 0 && typeof args[args.length - 1] === 'function')
      ? args.slice(0, -1)
      : args;

    // 1. 限频检查
    const rateResult = this._checkRateLimit(socket, eventName);
    if (!rateResult.allowed) {
      this._recordViolation(socket, 'rate_limit', rateResult.reason);
      return rateResult;
    }

    // 2. 消息格式校验
    if (EVENT_SCHEMAS[eventName]) {
      const formatResult = this._validateInput(eventName, validateArgs);
      if (!formatResult.valid) {
        this._recordViolation(socket, 'format', formatResult.reason);
        console.warn(`[安全] 格式校验 | ${socket.id} | ${eventName} | ${formatResult.reason}`);
        return { allowed: false, reason: formatResult.reason };
      }
    }

    // 3. 游戏状态校验
    if (GAME_RULES[eventName]) {
      const roomId = validateArgs[0];
      const gameState = gameEngine.getGame(roomId);

      // 幽灵房间检测
      if (!gameState && eventName !== 'game:start') {
        this._logAnomaly(socket, 'ghostRoom', `event=${eventName} roomId=${roomId}`);
      }

      const gameResult = GAME_RULES[eventName](socket, gameState, validateArgs);
      if (!gameResult.allowed) {
        this._recordViolation(socket, 'state', gameResult.reason);
        this._logAnomaly(socket, 'invalidAction', `event=${eventName} reason=${gameResult.reason}`);
        console.warn(`[安全] 状态校验 | ${socket.id} | ${eventName} | ${gameResult.reason}`);
        return { allowed: false, reason: gameResult.reason };
      }
    }

    // 4. 异常检测（仅记录，不拦截）
    if (eventName === 'room:join' || eventName === 'room:leave') {
      this._trackJoinLeave(socket, eventName, validateArgs[0]);
    }

    return { allowed: true };
  }

  // ==================== 模块 1：限频 ====================

  /**
   * 检查请求频率
   */
  _checkRateLimit(socket, eventName) {
    const limits = RATE_LIMITS[eventName] || RATE_LIMITS.__default;

    if (!this.rateLimiter.has(socket.id)) {
      this.rateLimiter.set(socket.id, new Map());
    }

    const socketLimits = this.rateLimiter.get(socket.id);
    if (!socketLimits.has(eventName)) {
      socketLimits.set(eventName, []);
    }

    const timestamps = socketLimits.get(eventName);
    const now = Date.now();

    // 清理过期记录
    while (timestamps.length > 0 && now - timestamps[0] > limits.window) {
      timestamps.shift();
    }

    if (timestamps.length >= limits.max) {
      return { allowed: false, reason: `操作太频繁 (${limits.max}次/${limits.window / 1000}s)，请稍后再试` };
    }

    timestamps.push(now);
    return { allowed: true };
  }

  // ==================== 模块 2：格式校验 ====================

  /**
   * 校验事件参数格式
   */
  _validateInput(eventName, args) {
    const schema = EVENT_SCHEMAS[eventName];
    if (!schema) return { valid: true };

    const fields = Object.keys(schema);

    for (let i = 0; i < fields.length; i++) {
      const fieldName = fields[i];
      const rules = schema[fieldName];
      const value = args[i];

      // nullable 字段允许 null/undefined
      if (rules.nullable && (value === null || value === undefined)) {
        continue;
      }

      // 类型检查
      if (typeof value !== rules.type) {
        return { valid: false, reason: `${fieldName} 类型错误，期望 ${rules.type}，实际 ${typeof value}` };
      }

      if (rules.type === 'string') {
        if (rules.len !== undefined && value.length !== rules.len) {
          return { valid: false, reason: `${fieldName} 长度必须为 ${rules.len}` };
        }
        if (rules.minLen !== undefined && value.length < rules.minLen) {
          return { valid: false, reason: `${fieldName} 至少 ${rules.minLen} 个字符` };
        }
        if (rules.maxLen !== undefined && value.length > rules.maxLen) {
          return { valid: false, reason: `${fieldName} 最多 ${rules.maxLen} 个字符` };
        }
        if (rules.pattern && !rules.pattern.test(value)) {
          return { valid: false, reason: `${fieldName} 格式不正确` };
        }
        if (rules.enum && !rules.enum.includes(value)) {
          return { valid: false, reason: `${fieldName} 值无效，可选: ${rules.enum.join('/')}` };
        }
      }

      if (rules.type === 'number') {
        if (rules.min !== undefined && value < rules.min) {
          return { valid: false, reason: `${fieldName} 不能小于 ${rules.min}` };
        }
        if (rules.max !== undefined && value > rules.max) {
          return { valid: false, reason: `${fieldName} 不能大于 ${rules.max}` };
        }
      }
    }

    // 额外校验：percentage 必须是合法佣金值
    if (eventName === 'game:bid') {
      const percentage = args[1];
      if (percentage !== null && percentage !== undefined) {
        if (!VALID_COMMISSIONS.includes(Number(percentage))) {
          return { valid: false, reason: `佣金比例必须为 ${VALID_COMMISSIONS.join('/')} 之一` };
        }
      }
    }

    return { valid: true };
  }

  // ==================== 模块 3：违规追踪 ====================

  /**
   * 记录一次违规，累计达阈值自动断连
   */
  _recordViolation(socket, type, reason) {
    const count = (this.violations.get(socket.id) || 0) + 1;
    this.violations.set(socket.id, count);

    console.warn(`[安全] 违规 #${count} | ${socket.id} | ${type} | ${reason}`);

    if (count >= MAX_VIOLATIONS) {
      console.warn(`[安全] 强制断连 | ${socket.id} | 累计违规 ${count} 次`);
      if (socket.connected) {
        socket.emit('security_violation', {
          reason: '检测到异常操作，已断开连接',
          violations: count,
        });
        socket.disconnect(true);
      }
      this.cleanup(socket.id);
    }
  }

  // ==================== 模块 4：异常检测 ====================

  /**
   * 记录异常行为
   */
  _logAnomaly(socket, type, detail) {
    if (!this.anomalyLog.has(socket.id)) {
      this.anomalyLog.set(socket.id, {});
    }

    const socketLog = this.anomalyLog.get(socket.id);
    if (!socketLog[type]) {
      socketLog[type] = { count: 0, lastTime: 0 };
    }

    const entry = socketLog[type];
    entry.count++;
    entry.lastTime = Date.now();

    // 检查阈值
    const rule = ANOMALY_RULES[type];
    if (rule && entry.count >= rule.threshold) {
      console.warn(
        `[安全] 异常行为 | ${socket.id} | ${type} | ` +
        `详情: ${detail || '-'} | 次数: ${entry.count} | ${new Date().toISOString()}`
      );
    }
  }

  /**
   * 追踪快速加入/离开
   */
  _trackJoinLeave(socket, eventName, roomId) {
    if (!this.anomalyLog.has(socket.id)) {
      this.anomalyLog.set(socket.id, {});
    }
    const socketLog = this.anomalyLog.get(socket.id);
    if (!socketLog.rapidJoinLeave) {
      socketLog.rapidJoinLeave = { count: 0, lastTime: 0, events: [] };
    }

    const entry = socketLog.rapidJoinLeave;
    const now = Date.now();

    entry.events.push({ event: eventName, roomId, time: now });

    // 清理过期记录
    const rule = ANOMALY_RULES.rapidJoinLeave;
    while (entry.events.length > 0 && now - entry.events[0].time > rule.window) {
      entry.events.shift();
    }

    if (entry.events.length >= rule.threshold) {
      entry.count = entry.events.length;
      entry.lastTime = now;
      console.warn(
        `[安全] 异常行为 | ${socket.id} | rapidJoinLeave | ` +
        `${entry.events.length}次加入/离开 ${rule.window / 1000}s 内 | ${new Date().toISOString()}`
      );
    }
  }

  // ==================== 清理 ====================

  /**
   * 清理断连用户的记录
   */
  cleanup(socketId) {
    this.rateLimiter.delete(socketId);
    this.anomalyLog.delete(socketId);
    this.violations.delete(socketId);
  }

  // ==================== 统计 ====================

  /**
   * 获取安全统计信息
   */
  getStats() {
    return {
      activeSockets: this.rateLimiter.size,
      totalViolations: Array.from(this.violations.values()).reduce((a, b) => a + b, 0),
      violationBySocket: Object.fromEntries(this.violations),
    };
  }
}

module.exports = SecurityMiddleware;
