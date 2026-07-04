// ============================================================
// tutorialGuide.js — 新手教程引导系统（简化重构版）
// 方案：单层全屏遮罩 + 坐标检测转发点击
// - info 步骤：全屏遮罩 + 居中提示框 + "知道了"按钮
// - action 步骤：全屏遮罩（拦截所有点击）+ 高亮环 + 提示气泡
//   点击落在目标区域内 → 转发给真实元素；落在区域外 → 提示
// 依赖: showToast, socket, GameState
// ============================================================

(function() {
  'use strict';

  // ==================== 步骤定义 ====================

  function getSteps(phase, isAuctioneer, round) {
    if (round >= 4) return [];

    if (round === 3) {
      if (phase !== 'trade') return [];
      return [
        { type: 'info', text: '交易阶段到了！\n你可以用卡牌或金币与其他玩家交换，优化你的收藏组合。' },
        { type: 'action', text: '点击一位可交易玩家发起提案，\n或点「跳过交易」结束本阶段。', target: '.trade-player-item.can-target, .trade-skip-btn', advanceOn: 'tradeAction' },
      ];
    }

    if (round === 1) {
      switch (phase) {
        case 'auction':
          return [
            { type: 'info', text: '欢迎来到琳琅！\n第一回合，你要争取当上拍卖师。\n所有人同时秘密报价佣金比例，数字最低者当选。' },
            { type: 'action', text: '点击「10%」报价——最低佣金最容易当选拍卖师。', target: '.bid-btn:first-child', advanceOn: 'bidSubmitted' },
          ];

        case 'selectCard':
          if (isAuctioneer) {
            return [
              { type: 'info', text: '恭喜你当选拍卖师！\n拍卖师不掷骰，但可以从剩余卡牌中挑选一张进行拍卖。' },
              { type: 'action', text: '点击一张文物卡牌，把它作为本轮拍品。', target: '.select-card-item', advanceOn: 'phaseChange' },
            ];
          }
          return [
            { type: 'info', text: 'AI 当选了本轮拍卖师。\n先看它选卡，下一回合你再体验竞拍。', advanceOn: 'phaseChange' },
          ];

        case 'rentDice':
          if (isAuctioneer) {
            return [
              { type: 'info', text: '你是拍卖师，本轮不参与掷骰。\n等待竞拍者选骰即可。', advanceOn: 'phaseChange' },
            ];
          }
          return [
            { type: 'info', text: 'AI 是拍卖师，你作为竞拍者参与掷骰。\n选一枚骰子争夺卡牌。', advanceOn: 'phaseChange' },
          ];

        case 'rollDice':
          return [
            { type: 'info', text: '竞拍者开始掷骰，\n点数最高者赢得本轮卡牌。', advanceOn: 'phaseChange' },
          ];

        case 'settle':
          return [
            { type: 'info', text: '本轮结算完成。\n拍卖师获得佣金，赢家获得卡牌。', advanceOn: 'phaseChange' },
          ];

        default:
          return [];
      }
    }

    if (round === 2) {
      switch (phase) {
        case 'auction':
          return [
            { type: 'info', text: '第二回合，你要体验竞拍。\n再次秘密报价佣金比例；如果报价最低，你当拍卖师；否则参与竞拍。' },
            { type: 'action', text: '点击一个佣金比例报价。\n想当选就报低价，想当竞拍者就报高一些。', target: '.bid-btn:not(.pass-btn)', advanceOn: 'bidSubmitted' },
          ];

        case 'selectCard':
          if (isAuctioneer) {
            return [
              { type: 'info', text: '你又当选了拍卖师！\n再练习一次选卡，然后继续当竞拍者。' },
              { type: 'action', text: '点击一张卡牌作为拍品。', target: '.select-card-item', advanceOn: 'phaseChange' },
            ];
          }
          return [
            { type: 'info', text: '你不是拍卖师，等待拍卖师选卡...', advanceOn: 'phaseChange' },
          ];

        case 'rentDice':
          if (isAuctioneer) {
            return [
              { type: 'info', text: '你是拍卖师，本轮不参与掷骰。', advanceOn: 'phaseChange' },
            ];
          }
          return [
            { type: 'info', text: '现在选择骰子争夺卡牌！\nd4=1💰(1-4点)  d6=2💰(1-6点)\nd12=4💰(1-12点)  d20=6💰(1-20点)\n越贵越大，但也越耗金币。' },
            { type: 'action', text: '点击想要的骰子。新手推荐 d6，性价比高。', target: '.dice-btn[data-dice="d6"], .dice-btn:not(.pass-btn-full)', advanceOn: 'diceSelected' },
          ];

        case 'rollDice':
          return [
            { type: 'info', text: '所有竞拍者已选骰，掷骰结果决定卡牌归属。\n点数高者赢得卡牌。', advanceOn: 'phaseChange' },
          ];

        case 'settle':
          return [
            { type: 'info', text: '本轮结算！\n记住：终局只看卡牌总分，金币别囤太多，要积极争卡。', advanceOn: 'phaseChange' },
          ];

        default:
          return [];
      }
    }

    return [];
  }

  // ==================== 引擎 ====================

  const Guide = {
    active: false,
    currentPhase: null,
    currentRound: 0,
    steps: null,
    stepIndex: 0,
    finishedStepsDone: false,
    _lastView: null,
    _prevTradeQuota: -1,

    // DOM
    _overlayEl: null,      // 全屏遮罩（info 和 action 共用）
    _tooltipEl: null,       // 提示气泡
    _highlightEl: null,     // 高亮环（action 步骤）
    _targetEl: null,        // action 步骤的真实目标元素
    _infoDismissed: false,  // info 步骤已点"知道了"
    _renderedStepKey: null,
    _resizeHandler: null,

    // ==================== 生命周期 ====================

    init() {
      this.active = true;
      this.currentPhase = null;
      this.currentRound = 0;
      this.steps = null;
      this.stepIndex = 0;
      this.finishedStepsDone = false;
      this._lastView = null;
      this._prevTradeQuota = -1;
      this._infoDismissed = false;
      this._renderedStepKey = null;
      this._fullCleanup();
      document.body.classList.add('tutorial-active');
    },

    reset() {
      this.active = false;
      this._renderedStepKey = null;
      this._fullCleanup();
      document.body.classList.remove('tutorial-active');
    },

    // ==================== 主入口 ====================

    onPhaseRender(view) {
      if (!this.active) return;
      if (!GameState._tutorial || !GameState._tutorial.active) return;

      this._lastView = view;
      const phase = view.phase;
      const round = view.round || 1;
      const isAuctioneer = view.auctioneerId === socket.id;

      // 回合/阶段变化 → 加载新步骤序列
      if (phase !== this.currentPhase || round !== this.currentRound) {
        this.currentPhase = phase;
        this.currentRound = round;
        this.stepIndex = 0;
        this.steps = getSteps(phase, isAuctioneer, round);
        this._infoDismissed = false;
        this._cleanup();
      }

      if (!this.steps || this.steps.length === 0) {
        this._fullCleanup();
        return;
      }

      // 检测自动推进
      if (this._shouldAutoAdvance(view)) {
        this._advanceStep();
        return;
      }

      this._renderCurrentStep();
    },

    // ==================== 自动推进检测 ====================

    _shouldAutoAdvance(view) {
      if (!this.steps || this.stepIndex >= this.steps.length) return false;
      const step = this.steps[this.stepIndex];
      if (!step.advanceOn) return false;
      if (step.type === 'info' && !this._infoDismissed) return false;

      const myId = socket.id;

      switch (step.advanceOn) {
        case 'bidSubmitted': {
          const myBid = (view.bids || []).find(b => b.playerId === myId);
          return !!(myBid && myBid.submitted);
        }
        case 'diceSelected': {
          const sel = view.diceSelections && view.diceSelections[myId];
          return !!(sel && sel !== 'auctioneer' && sel !== 'waiting');
        }
        case 'tradeAction': {
          const myQuota = view.tradeQuota ? (view.tradeQuota[myId] || 0) : 0;
          if (this._prevTradeQuota < 0) { this._prevTradeQuota = myQuota; return false; }
          if (myQuota < this._prevTradeQuota) { this._prevTradeQuota = myQuota; return true; }
          this._prevTradeQuota = myQuota;
          return false;
        }
        case 'phaseChange':
          return false;
        default:
          return false;
      }
    },

    // ==================== 步骤推进 ====================

    _advanceStep() {
      this.stepIndex++;
      this._infoDismissed = false;
      this._renderedStepKey = null;
      this._cleanup();

      if (this.stepIndex >= this.steps.length) {
        if (this.currentPhase === 'finished' && !this.finishedStepsDone) {
          this.finishedStepsDone = true;
          if (this._lastView) {
            const container = document.getElementById('gameActionArea');
            if (container && typeof _renderActionContent === 'function') {
              _renderActionContent(this._lastView, container);
            }
          }
        }
        return;
      }
      this._renderCurrentStep();
    },

    // ==================== 渲染当前步骤 ====================

    _renderCurrentStep() {
      if (!this.steps || this.stepIndex >= this.steps.length) {
        this._cleanup();
        return;
      }

      const step = this.steps[this.stepIndex];
      const stepKey = `${this.currentRound}|${this.currentPhase}|${this.stepIndex}|${step.type}`;

      if (this._renderedStepKey === stepKey && this._overlayAlive(step)) {
        return;
      }
      this._renderedStepKey = stepKey;
      this._cleanup();

      switch (step.type) {
        case 'info':
          this._renderInfoStep(step);
          break;
        case 'action':
          this._renderActionStep(step);
          break;
      }
    },

    _overlayAlive(step) {
      if (step.type === 'info') {
        if (this._infoDismissed) return true; // 已关闭，等推进
        return !!this._overlayEl && !!this._tooltipEl;
      }
      if (step.type === 'action') {
        return !!this._overlayEl;
      }
      return false;
    },

    // ==================== info 步骤 ====================

    _renderInfoStep(step) {
      // 创建全屏遮罩
      this._createOverlay(true);

      // 创建居中提示框
      const tooltip = document.createElement('div');
      tooltip.className = 'tg-centered-tooltip';
      tooltip.style.cssText = [
        'position:fixed',
        'top:50%',
        'left:50%',
        'transform:translate(-50%,-50%)',
        'z-index:100001',
        'background:rgba(30,20,10,0.96)',
        'color:#F0E0C0',
        'padding:18px 24px',
        'border-radius:14px',
        'border:1px solid rgba(201,169,110,0.5)',
        'max-width:340px',
        'font-size:15px',
        'line-height:1.7',
        'text-align:center',
        'box-shadow:0 12px 40px rgba(0,0,0,0.7)',
        'pointer-events:auto',
        'white-space:pre-line',
      ].join(';');

      const hasAdvanceOn = !!step.advanceOn;
      const isLastStep = this.stepIndex >= this.steps.length - 1;

      tooltip.innerHTML =
        '<div class="tg-info-text">' + step.text + '</div>' +
        '<button class="tg-next-btn">知道了</button>';

      const btn = tooltip.querySelector('.tg-next-btn');
      btn.style.cssText = [
        'display:inline-block',
        'margin-top:16px',
        'padding:8px 32px',
        'background:#C9A96E',
        'color:#1a1a1a',
        'border:none',
        'border-radius:8px',
        'font-size:15px',
        'font-weight:600',
        'cursor:pointer',
        'transition:background 0.2s',
      ].join(';');

      btn.addEventListener('mouseenter', () => { btn.style.background = '#D4B97E'; });
      btn.addEventListener('mouseleave', () => { btn.style.background = '#C9A96E'; });

      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        // 关键修复：无论是否有 advanceOn，点"知道了"后：
        // 1. 如果有下一步 → 直接推进到下一步
        // 2. 如果是最后一步 → 移除遮罩，等待阶段变化
        if (!isLastStep) {
          this._advanceStep();
        } else {
          // 最后一步：移除遮罩让用户看到游戏画面
          this._infoDismissed = true;
          this._removeOverlay();
          this._removeTooltip();
        }
      });

      document.body.appendChild(tooltip);
      this._tooltipEl = tooltip;
    },

    // ==================== action 步骤 ====================

    _renderActionStep(step) {
      // 查找目标元素
      let targetEl = null;
      const selectors = (step.target || '').split(',').map(s => s.trim()).filter(Boolean);
      for (const sel of selectors) {
        targetEl = document.querySelector(sel);
        if (targetEl) break;
      }

      if (!targetEl) {
        // 目标不存在：当 info 处理
        this._createOverlay(true);
        this._createCenteredTooltip(step.text, false);
        return;
      }

      this._targetEl = targetEl;

      // 创建全屏遮罩（拦截所有点击，按坐标判断是否转发）
      this._createOverlay(false, (e) => {
        if (!this._targetEl) return;
        const rect = this._targetEl.getBoundingClientRect();
        // 点击落在目标区域内 → 转发给真实元素
        if (e.clientX >= rect.left && e.clientX <= rect.right &&
            e.clientY >= rect.top && e.clientY <= rect.bottom) {
          // 临时移除遮罩，让真实元素接收点击
          this._overlayEl.style.pointerEvents = 'none';
          // 直接调用目标元素的 click
          this._targetEl.click();
          // 不恢复 pointer-events，因为点击后步骤会推进或阶段会变化
        } else {
          // 点击在目标外 → 提示
          if (typeof showToast === 'function') {
            showToast('请点击高亮区域完成指引', 'info');
          }
        }
      });

      // 用 rAF 等布局稳定后创建高亮和提示
      requestAnimationFrame(() => {
        if (!this.active || !this._targetEl) return;
        const rect = this._targetEl.getBoundingClientRect();
        if (!rect.width || !rect.height) return;

        this._createHighlight(rect);
        this._createTargetTooltip(step.text);
        this._positionTooltip(rect);
        this._addResizeHandler();
      });
    },

    _createCenteredTooltip(text) {
      const tooltip = document.createElement('div');
      tooltip.className = 'tg-centered-tooltip';
      tooltip.style.cssText = [
        'position:fixed',
        'top:50%',
        'left:50%',
        'transform:translate(-50%,-50%)',
        'z-index:100001',
        'background:rgba(30,20,10,0.96)',
        'color:#F0E0C0',
        'padding:18px 24px',
        'border-radius:14px',
        'border:1px solid rgba(201,169,110,0.5)',
        'max-width:340px',
        'font-size:15px',
        'line-height:1.7',
        'text-align:center',
        'box-shadow:0 12px 40px rgba(0,0,0,0.7)',
        'pointer-events:auto',
        'white-space:pre-line',
      ].join(';');
      tooltip.textContent = text;
      document.body.appendChild(tooltip);
      this._tooltipEl = tooltip;
    },

    // ==================== 全屏遮罩 ====================

    _createOverlay(isInfo, clickHandler) {
      const el = document.createElement('div');
      el.className = isInfo ? 'tg-overlay tg-overlay-info' : 'tg-overlay tg-overlay-action';
      el.style.cssText = [
        'position:fixed',
        'inset:0',
        'z-index:99998',
        'background:rgba(0,0,0,0.55)',
        'pointer-events:auto',
        'cursor:default',
      ].join(';');

      if (clickHandler) {
        el.addEventListener('click', clickHandler);
      } else {
        // info 遮罩：点击非提示区域给提示
        el.addEventListener('click', (e) => {
          if (e.target === el && typeof showToast === 'function') {
            showToast('请先点击"知道了"继续', 'info');
          }
        });
      }

      document.body.appendChild(el);
      this._overlayEl = el;
    },

    _removeOverlay() {
      if (this._overlayEl) {
        this._overlayEl.remove();
        this._overlayEl = null;
      }
    },

    // ==================== 高亮环 ====================

    _createHighlight(rect) {
      this._removeHighlight();
      const pad = 6;
      const el = document.createElement('div');
      el.className = 'tg-highlight-ring';
      el.style.cssText = [
        'position:fixed',
        `top:${Math.round(rect.top) - pad}px`,
        `left:${Math.round(rect.left) - pad}px`,
        `width:${Math.round(rect.width) + pad * 2}px`,
        `height:${Math.round(rect.height) + pad * 2}px`,
        'z-index:100000',
        'border-radius:12px',
        'pointer-events:none',
        'box-shadow:inset 0 0 0 3px #D4AF37, inset 0 0 0 5px rgba(255,215,0,0.25), 0 0 30px rgba(255,215,0,0.65)',
        'animation:tgPulse 1.4s ease-in-out infinite',
      ].join(';');
      document.body.appendChild(el);
      this._highlightEl = el;
    },

    _removeHighlight() {
      if (this._highlightEl) {
        this._highlightEl.remove();
        this._highlightEl = null;
      }
    },

    // ==================== 目标提示气泡 ====================

    _createTargetTooltip(text) {
      const tooltip = document.createElement('div');
      tooltip.className = 'tg-target-tooltip';
      tooltip.style.cssText = [
        'position:fixed',
        'z-index:100001',
        'background:rgba(30,20,10,0.96)',
        'color:#F0E0C0',
        'padding:10px 14px',
        'border-radius:12px',
        'border:1px solid rgba(201,169,110,0.5)',
        'max-width:240px',
        'font-size:13px',
        'line-height:1.6',
        'box-shadow:0 6px 24px rgba(0,0,0,0.6)',
        'pointer-events:none',
        'opacity:0',
        'transition:opacity 0.2s',
        'white-space:pre-line',
      ].join(';');
      tooltip.textContent = text;
      document.body.appendChild(tooltip);
      this._tooltipEl = tooltip;
    },

    // ==================== 定位 ====================

    _positionTooltip(rect) {
      const tooltip = this._tooltipEl;
      if (!tooltip || !rect) return;

      // 先显示以获取尺寸
      tooltip.style.visibility = 'hidden';
      tooltip.style.opacity = '0';
      tooltip.style.display = 'block';

      const tooltipRect = tooltip.getBoundingClientRect();
      const tooltipW = Math.round(tooltipRect.width);
      const tooltipH = Math.round(tooltipRect.height);
      const gap = 16;
      const pad = 12;
      const vw = window.innerWidth;
      const vh = window.innerHeight;

      const spaceBelow = vh - rect.bottom;
      const spaceAbove = rect.top;
      const spaceRight = vw - rect.right;
      const spaceLeft = rect.left;

      let left, top, place = 'below';

      if (spaceBelow >= tooltipH + gap + pad) {
        left = rect.left + rect.width / 2 - tooltipW / 2;
        top = rect.bottom + gap;
        place = 'below';
      } else if (spaceAbove >= tooltipH + gap + pad) {
        left = rect.left + rect.width / 2 - tooltipW / 2;
        top = rect.top - tooltipH - gap;
        place = 'above';
      } else if (spaceRight >= tooltipW + gap + pad) {
        left = rect.right + gap;
        top = rect.top + rect.height / 2 - tooltipH / 2;
        place = 'right';
      } else if (spaceLeft >= tooltipW + gap + pad) {
        left = rect.left - tooltipW - gap;
        top = rect.top + rect.height / 2 - tooltipH / 2;
        place = 'left';
      } else {
        left = rect.left + rect.width / 2 - tooltipW / 2;
        top = rect.bottom + gap;
        place = 'below';
      }

      if (left < pad) left = pad;
      if (left + tooltipW > vw - pad) left = vw - tooltipW - pad;
      if (top < pad) top = pad;
      if (top + tooltipH > vh - pad) top = vh - tooltipH - pad;

      tooltip.style.top = Math.round(top) + 'px';
      tooltip.style.left = Math.round(left) + 'px';
      tooltip.style.visibility = '';
      tooltip.style.opacity = '1';

      tooltip.classList.remove('tg-tip-right', 'tg-tip-left', 'tg-tip-below', 'tg-tip-above');
      tooltip.classList.add('tg-tip-' + place);
    },

    // ==================== resize 监听 ====================

    _addResizeHandler() {
      const handler = () => {
        if (!this._targetEl || !this.active) return;
        const rect = this._targetEl.getBoundingClientRect();
        if (!rect.width || !rect.height) return;
        this._createHighlight(rect);
        if (this._tooltipEl) {
          this._positionTooltip(rect);
        }
      };

      let timer = null;
      const debounced = () => {
        if (timer) cancelAnimationFrame(timer);
        timer = requestAnimationFrame(handler);
      };

      this._resizeHandler = debounced;
      window.addEventListener('resize', debounced);
      window.addEventListener('scroll', debounced, { passive: true, capture: true });
    },

    // ==================== 清理 ====================

    _removeTooltip() {
      if (this._tooltipEl) {
        this._tooltipEl.remove();
        this._tooltipEl = null;
      }
    },

    _cleanup() {
      this._removeTooltip();
      this._removeHighlight();
      this._removeOverlay();
      this._targetEl = null;
      this._infoDismissed = false;

      if (this._resizeHandler) {
        window.removeEventListener('resize', this._resizeHandler);
        window.removeEventListener('scroll', this._resizeHandler, { capture: true });
        this._resizeHandler = null;
      }
    },

    _fullCleanup() {
      this._cleanup();
    },
  };

  window.TutorialGuide = Guide;
  console.log('[TutorialGuide] 模块已加载 v2.0');
})();
