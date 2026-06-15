/**
 * 音效管理器 — 马王堆拍卖游戏
 * 纯 Web Audio API 程序化音效，无需音频文件
 * 音效实现见 audio.js
 */
const SoundManager = {
  enabled: true,
  volume: 1.0,
  fallbackFn: null,

  /**
   * 初始化音效系统
   */
  init() {
    // 获取 Web Audio 回退函数（来自 audio.js）
    if (typeof playSoundFallback === 'function') {
      this.fallbackFn = playSoundFallback;
    }
    console.log('[SoundManager] 初始化完成，使用 Web Audio API 程序化音效');
  },

  /**
   * 播放音效（直接走 Web Audio API）
   */
  play(name) {
    if (!this.enabled) return;
    if (this.fallbackFn) {
      this.fallbackFn(name);
    }
  },

  /** 停止背景音（Web Audio API 无需实现，保留接口） */
  stopAmbient() {
    // audio.js 无背景音循环，此处为空
  },

  /** 切换音效开关 */
  toggle() {
    this.enabled = !this.enabled;
    return this.enabled;
  },

  /** 设置音量 0.0~1.0（Web Audio API 音量在 audio.js 内部控制，此处保存值备用） */
  setVolume(v) {
    this.volume = Math.max(0, Math.min(1, v));
  }
};

// ========== 初始化 ==========
SoundManager.init();

// ========== 音效开关按钮 ==========
function toggleSound() {
  const enabled = SoundManager.toggle();
  const btn = document.getElementById('soundToggle');
  if (btn) {
    btn.textContent = enabled ? '🔊' : '🔇';
    btn.classList.toggle('muted', !enabled);
  }
}

// ========== 全局 playSound 兼容层 ==========
// 将旧 playSound 事件名映射到 audio.js 音效名
const _soundNameMap = {
  click:      'click',
  bid:        'coin',
  diceRoll:   'diceShake',
  cardFlip:   'cardFlip',
  winCard:    'victory',
  auctionEnd: 'click',
  gameOver:   'gameOver',
};

// 用 SoundManager 覆写 playSound
window.playSound = function(name) {
  if (!SoundManager.enabled) return;
  const mapped = _soundNameMap[name] || name;
  SoundManager.play(mapped);
};

console.log('[SoundManager] 已接管全局 playSound()');
