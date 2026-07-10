// ============================================================
// audio.js — Web Audio API 程序化音效（无需音频文件）
// 作为 SoundManager 的 OGG 文件缺失时的回退方案
// ============================================================

let _ctx = null;
let _masterGain = null;  // ★ 主音量控制节点

function getCtx() {
  if (!_ctx) {
    try { _ctx = new (window.AudioContext || window.webkitAudioContext)(); }
    catch (e) { return null; }
    // ★ 创建主增益节点，控制全局音量
    _masterGain = _ctx.createGain();
    _masterGain.gain.setValueAtTime(1.0, _ctx.currentTime);
    _masterGain.connect(_ctx.destination);
  }
  if (_ctx.state === 'suspended') _ctx.resume();
  return _ctx;
}

/**
 * ★ 设置主音量（由 SoundManager.setVolume 调用）
 */
function setMasterVolume(v) {
  if (_masterGain && _ctx) {
    _masterGain.gain.setValueAtTime(Math.max(0, Math.min(1, v)), _ctx.currentTime);
  }
}

/**
 * Web Audio API 回退音效
 * 当 SoundManager 的 OGG 文件不存在时调用
 */
function playSoundFallback(name) {
  const ctx = getCtx();
  if (!ctx) return;
  switch (name) {
    case 'click':        _click(ctx); break;
    case 'diceShake':    _diceRoll(ctx); break;
    case 'diceRoll':     _diceRoll(ctx); break;
    case 'cardFlip':     _cardFlip(ctx); break;
    case 'cardReveal':   _cardReveal(ctx); break;
    case 'victory':      _winCard(ctx); break;
    case 'winCard':      _winCard(ctx); break;
    case 'defeat':       _defeat(ctx); break;
    case 'gameOver':     _gameOver(ctx); break;
    case 'gameStart':    _gameStart(ctx); break;
    case 'coin':         _click(ctx); break;
    case 'bid':          _click(ctx); break;
    case 'confirm':      _click(ctx); break;
    case 'error':        _error(ctx); break;
    case 'duel':         _diceRoll(ctx); break;
    case 'phaseChange':  _phaseChange(ctx); break;
    case 'roundStart':   _roundStart(ctx); break;
    case 'commission':   _commission(ctx); break;
    case 'tradeProposal':_tradeProposal(ctx); break;
    case 'tradeSuccess': _tradeSuccess(ctx); break;
    case 'tradeReject':  _tradeReject(ctx); break;
    case 'tickUrgent':   _tickUrgent(ctx); break;
    case 'coinGain':     _coinGain(ctx); break;
    case 'coinLose':     _coinLose(ctx); break;
    case 'qianShake':    _diceRoll(ctx); break;
    case 'qianPop':      _qianPop(ctx); break;
    default:             _click(ctx); break;
  }
}

// 兼容旧代码：如果 soundManager.js 未加载，用 Web Audio
let _playSound = function(name) {
  playSoundFallback(name);
};

// 等 soundManager.js 加载后会覆写此函数
// 使用 getter 确保始终指向最新版本
Object.defineProperty(window, 'playSound', {
  get: function() { return _playSound; },
  set: function(fn) {
    _playSound = fn;
    console.log('[Audio] playSound 已被外部模块接管');
  },
  configurable: true,
  enumerable: true
});

function _tone(ctx, freq, duration, type, gainVal, rampTo) {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type || 'sine';
  osc.frequency.setValueAtTime(freq, ctx.currentTime);
  if (rampTo) osc.frequency.linearRampToValueAtTime(rampTo, ctx.currentTime + duration);
  gain.gain.setValueAtTime(gainVal || 0.15, ctx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
  osc.connect(gain);
  gain.connect(_masterGain || ctx.destination);  // ★ 走主音量节点
  osc.start(ctx.currentTime);
  osc.stop(ctx.currentTime + duration);
}

// 按钮点击：短促清脆咔嗒
function _click(ctx) {
  _tone(ctx, 800, 0.05, 'square', 0.08, 200);
}

// 骰子滚动：白噪声 1.5s + 频率渐低
function _diceRoll(ctx) {
  const duration = 1.5;
  const bufferSize = ctx.sampleRate * duration;
  const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < bufferSize; i++) {
    data[i] = (Math.random() * 2 - 1) * Math.max(0, 1 - i / bufferSize) * 0.1;
  }
  const noise = ctx.createBufferSource();
  noise.buffer = buffer;
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.15, ctx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
  const filter = ctx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.setValueAtTime(3000, ctx.currentTime);
  filter.frequency.exponentialRampToValueAtTime(200, ctx.currentTime + duration);
  noise.connect(filter);
  filter.connect(gain);
  gain.connect(_masterGain || ctx.destination);  // ★ 走主音量节点
  noise.start();
  noise.stop(ctx.currentTime + duration);
}

// 卡牌翻开：上升音
function _cardFlip(ctx) {
  _tone(ctx, 200, 0.15, 'sine', 0.12, 600);
}

// 获得卡牌：三音和弦 C-E-G
function _winCard(ctx) {
  [523, 659, 784].forEach((f, i) => {
    setTimeout(() => _tone(ctx, f, 0.3, 'sine', 0.1, f * 1.05), i * 100);
  });
}

// 拍卖成交：木槌敲击
function _auctionEnd(ctx) {
  _tone(ctx, 80, 0.2, 'triangle', 0.2, 40);
  setTimeout(() => _tone(ctx, 60, 0.1, 'triangle', 0.15, 30), 100);
}

// 游戏结束：五音上行琶音
function _gameOver(ctx) {
  [523, 659, 784, 880, 1047].forEach((f, i) => {
    setTimeout(() => _tone(ctx, f, 0.3, 'sine', 0.08, f), i * 100);
  });
}

// ========== 新增音效 ==========

// 游戏开始：号角感上行三音
function _gameStart(ctx) {
  [392, 523, 659].forEach((f, i) => {
    setTimeout(() => _tone(ctx, f, 0.35, 'triangle', 0.12, f), i * 120);
  });
}

// 失败：下行两音
function _defeat(ctx) {
  _tone(ctx, 400, 0.2, 'sine', 0.1, 300);
  setTimeout(() => _tone(ctx, 300, 0.3, 'sine', 0.1, 200), 150);
}

// 错误提示：低频短促
function _error(ctx) {
  _tone(ctx, 200, 0.15, 'sawtooth', 0.1, 150);
}

// 阶段切换：柔和双音钟声
function _phaseChange(ctx) {
  _tone(ctx, 660, 0.12, 'sine', 0.08, 880);
  setTimeout(() => _tone(ctx, 880, 0.15, 'sine', 0.06, 660), 80);
}

// 回合开始：轻快号角
function _roundStart(ctx) {
  _tone(ctx, 523, 0.1, 'triangle', 0.1, 659);
  setTimeout(() => _tone(ctx, 659, 0.2, 'triangle', 0.1, 784), 100);
}

// 卡牌揭示：神秘上升音
function _cardReveal(ctx) {
  _tone(ctx, 150, 0.25, 'sine', 0.1, 500);
  setTimeout(() => _tone(ctx, 500, 0.15, 'sine', 0.08, 700), 100);
}

// 佣金结算：金币叮当
function _commission(ctx) {
  [880, 1047, 880].forEach((f, i) => {
    setTimeout(() => _tone(ctx, f, 0.1, 'triangle', 0.08, f * 0.95), i * 60);
  });
}

// 交易提案：轻快双音
function _tradeProposal(ctx) {
  _tone(ctx, 700, 0.1, 'sine', 0.08, 900);
  setTimeout(() => _tone(ctx, 900, 0.12, 'sine', 0.08, 700), 80);
}

// 交易成功：愉快短旋律
function _tradeSuccess(ctx) {
  [523, 659, 784, 1047].forEach((f, i) => {
    setTimeout(() => _tone(ctx, f, 0.12, 'sine', 0.09, f), i * 70);
  });
}

// 交易被拒：低沉短音
function _tradeReject(ctx) {
  _tone(ctx, 300, 0.2, 'sawtooth', 0.08, 200);
}

// 倒计时紧迫：短促高频滴答
function _tickUrgent(ctx) {
  _tone(ctx, 1200, 0.04, 'square', 0.05, 1000);
}

// 获得金币：清脆叮
function _coinGain(ctx) {
  _tone(ctx, 988, 0.1, 'triangle', 0.1, 1319);
  setTimeout(() => _tone(ctx, 1319, 0.1, 'triangle', 0.08, 1568), 50);
}

// 支出金币：低沉咚
function _coinLose(ctx) {
  _tone(ctx, 400, 0.12, 'sine', 0.1, 300);
}

// 签弹出：清脆弹出音
function _qianPop(ctx) {
  _tone(ctx, 600, 0.08, 'sine', 0.12, 1200);
  setTimeout(() => _tone(ctx, 1200, 0.1, 'sine', 0.08, 800), 40);
}

console.log('[Audio] 音效系统已加载');
