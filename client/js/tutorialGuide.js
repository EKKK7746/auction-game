// ============================================================
// tutorialGuide.js — 新手教程全屏引导系统（回合制教学版）
// 单层clip-path镂空遮罩 + 聚光灯高亮 + 交互驱动推进
// 依赖: showToast, _lastView, socket, GameState
// ============================================================

(function() {
  'use strict';

  // ==================== 步骤定义 ====================
  // type: 'info' (居中提示+"知道了"按钮) | 'action' (聚光灯目标+提示，等交互)
  // advanceOn: 'bidSubmitted' | 'phaseChange' | 'diceSelected' | 'tradeAction' | null

  function getSteps(phase, isAuctioneer, round) {
    // 后三个回合（4-5）完全自己玩
    if (round >= 4) return [];

    // 第3回合：只在交易阶段教学，其余自己玩
    if (round === 3) {
      if (phase !== 'trade') return [];
      return [
        { type: 'info', text: '交易阶段到了！\n你可以用卡牌或金币与其他玩家交换，优化你的收藏组合。' },
        { type: 'action', text: '点击一位可交易玩家发起提案，\n或点「跳过交易」结束本阶段。', target: '.trade-player-item.can-target, .trade-skip-btn', advanceOn: 'tradeAction' },
      ];
    }

    // 第1回合：当拍卖师（引导报最低价→选卡）
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
              { type: 'info', text: '恭喜你当选拍卖师！\n拍卖师不掷骰，但可以从剩余卡牌中挑选一张进行拍卖。', advanceOn: 'phaseChange' },
              { type: 'action', text: '点击一张文物卡牌，把它作为本轮拍品。', target: '.select-card-item', advanceOn: 'phaseChange' },
            ];
          }
          // 小概率没当选：简单提示，不影响主流程
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

    // 第2回合：当竞拍者（暗标→选骰→掷骰）
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
              { type: 'info', text: '你又当选了拍卖师！\n再练习一次选卡，然后继续当竞拍者。', advanceOn: 'phaseChange' },
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

  // ==================== 引擎状态 ====================

  const Guide = {
    active: false,
    currentPhase: null,
    currentRound: 0,
    steps: null,
    stepIndex: 0,
    seenPhases: {},
    finishedStepsDone: false,
    _lastView: null,
    _prevTradeQuota: -1,

    // DOM 引用
    _infoBackdropEl: null,   // info 步骤：全屏遮罩
    _hoodEls: [],             // action 步骤：4 块遮罩 [top, right, bottom, left]
    _highlightEl: null,        // 目标高亮环（不被 overflow:hidden 裁剪）
    _tooltipEl: null,
    _targetEl: null,
    _infoDismissed: false,
    _renderedStepKey: null,
    _resizeHandler: null,
    _observer: null,
    _repositionTimer: null,

    // ==================== 生命周期 ====================

    init() {
      this.active = true;
      this.currentPhase = null;
      this.currentRound = 0;
      this.steps = null;
      this.stepIndex = 0;
      this.seenPhases = {};
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
        // 自己玩的回合：关闭所有遮罩
        this._fullCleanup();
        return;
      }

      // 检测自动推进
      if (this._shouldAutoAdvance(view)) {
        this._advanceStep();
        return;
      }

      // 渲染当前步骤（同一步骤不重建，避免闪烁）
      this._renderCurrentStep();
    },

    // ==================== 自动推进检测 ====================

    _shouldAutoAdvance(view) {
      if (!this.steps || this.stepIndex >= this.steps.length) return false;
      const step = this.steps[this.stepIndex];
      if (!step.advanceOn) return false;

      // info 类型：必须先点"知道了"才能自动推进
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
          return false; // 由 onPhaseRender 的阶段变化检测处理
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
        // 该阶段所有步骤完成
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
      const stepKey = `${this.currentRound}|${this.currentPhase}|${this.stepIndex}|${step.type}|${step.target || ''}`;

      // 同一步骤已经渲染且覆盖层存在：不重建，避免闪烁
      if (this._renderedStepKey === stepKey && this._overlayAlive(step)) {
        return;
      }
      this._renderedStepKey = stepKey;

      // 清理上一步的高亮/提示，但保留背景遮罩
      this._cleanup();

      switch (step.type) {
        case 'info':
          // info 阶段：4 块遮罩和高亮环，创建全屏遮罩
          this._removeHoods();
          this._removeHighlight();
          this._createInfoBackdrop();
          this._createCenteredTooltip(step.text, !!step.advanceOn);
          break;

        case 'action':
          // action 阶段：移除 info 遮罩，由 _spotlightTarget 创建空心框遮罩
          this._removeInfoBackdrop();
          requestAnimationFrame(() => {
            if (!this.active || this.stepIndex >= this.steps.length) return;
            const currentStep = this.steps[this.stepIndex];
            if (currentStep !== step) return;
            this._spotlightTarget(step);
          });
          break;
      }
    },

    _overlayAlive(step) {
      if (step.type === 'info') {
        // 已点"知道了"等待推进：视为存活
        if (this._infoDismissed) return true;
        return !!(this._infoBackdropEl && this._tooltipEl);
      }
      if (step.type === 'action') {
        // hood 遮罩和高亮环都存在才视为存活
        return this._hoodEls.length === 4 && !!this._highlightEl && !!this._tooltipEl;
      }
      return false;
    },

    // ==================== 遮罩系统 ====================
    // info 步骤：全屏暗化遮罩（单层）
    // action 步骤：4 块遮罩拼成空心框，目标区域物理上无遮罩

    _createInfoBackdrop() {
      if (this._infoBackdropEl) return;
      const el = document.createElement('div');
      el.className = 'tg-info-backdrop';
      el.style.cssText = [
        'position:fixed', 'inset:0', 'z-index:99998',
        'background:rgba(0,0,0,0.55)',
        'pointer-events:auto',
      ].join(';');
      el.addEventListener('click', (e) => {
        if (e.target === el && typeof showToast === 'function') {
          showToast('请先完成当前指引步骤', 'info');
        }
      });
      document.body.appendChild(el);
      this._infoBackdropEl = el;
    },

    _removeInfoBackdrop() {
      if (this._infoBackdropEl) {
        this._infoBackdropEl.remove();
        this._infoBackdropEl = null;
      }
    },

    // 创建 4 块遮罩，覆盖目标区域以外的所有地方
    // 目标区域物理上无遮罩，按钮天然可点击
    _createHoods(rect) {
      this._removeHoods();
      const pad = 10;
      const x1 = Math.max(0, Math.round(rect.left) - pad);
      const y1 = Math.max(0, Math.round(rect.top) - pad);
      const x2 = Math.min(window.innerWidth, Math.round(rect.right) + pad);
      const y2 = Math.min(window.innerHeight, Math.round(rect.bottom) + pad);
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      const ov = 'rgba(0,0,0,0.55)';
      const z  = '99998';
      const ptr = 'pointer-events:auto;';

      const parts = [
        // top
        `position:fixed;top:0;left:0;right:0;height:${y1}px;z-index:${z};background:${ov};${ptr}`,
        // bottom
        `position:fixed;top:${y2}px;left:0;right:0;bottom:0;z-index:${z};background:${ov};${ptr}`,
        // left
        `position:fixed;top:${y1}px;bottom:calc(100vh - ${y2}px);left:0;width:${x1}px;z-index:${z};background:${ov};${ptr}`,
        // right
        `position:fixed;top:${y1}px;bottom:calc(100vh - ${y2}px);left:${x2}px;right:0;z-index:${z};background:${ov};${ptr}`,
      ];

      const clickHandler = (e) => {
        if (typeof showToast === 'function') {
          showToast('请先完成当前指引步骤', 'info');
        }
      };

      parts.forEach((css, i) => {
        const d = document.createElement('div');
        d.className = 'tg-hood';
        d.style.cssText = css;
        d.addEventListener('click', clickHandler);
        document.body.appendChild(d);
        this._hoodEls.push(d);
      });
    },

    _removeHoods() {
      this._hoodEls.forEach(d => d.remove());
      this._hoodEls = [];
    },

    // 在目标区域外缘绘制金色高亮环（用独立 div，不受 overflow:hidden 裁剪）
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
        'z-index:99999',
        'border-radius:10px',
        'pointer-events:none',
        'box-shadow:inset 0 0 0 3px #D4AF37, inset 0 0 0 5px rgba(255,215,0,0.3), 0 0 24px rgba(255,215,0,0.6)',
        'animation:tgPulse 1.5s ease-in-out infinite',
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

    // ==================== 居中提示（info） ====================

    _createCenteredTooltip(text, hasAdvanceOn) {
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
        'padding:16px 20px',
        'border-radius:12px',
        'border:1px solid rgba(201,169,110,0.5)',
        'max-width:320px',
        'font-size:14px',
        'line-height:1.7',
        'text-align:center',
        'box-shadow:0 8px 32px rgba(0,0,0,0.6)',
        'pointer-events:auto',
        'white-space:pre-line',
      ].join(';');

      tooltip.innerHTML =
        '<div class="tg-info-text">' + text + '</div>' +
        '<button class="tg-next-btn" style="' + [
          'display:inline-block',
          'margin-top:14px',
          'padding:7px 28px',
          'background:#C9A96E',
          'color:#1a1a1a',
          'border:none',
          'border-radius:8px',
          'font-size:14px',
          'font-weight:600',
          'cursor:pointer',
          'transition:background 0.2s',
        ].join(';') + '">知道了</button>';

      const btn = tooltip.querySelector('.tg-next-btn');
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (hasAdvanceOn) {
          this._infoDismissed = true;
          this._removeTooltip();
        } else {
          this._advanceStep();
        }
      });

      btn.addEventListener('mouseenter', () => { btn.style.background = '#D4B97E'; });
      btn.addEventListener('mouseleave', () => { btn.style.background = '#C9A96E'; });

      document.body.appendChild(tooltip);
      this._tooltipEl = tooltip;
    },

    // ==================== 聚光灯目标（action） ====================

    _spotlightTarget(step) {
      let targetEl = null;
      const selectors = (step.target || '').split(',').map(s => s.trim()).filter(Boolean);
      for (const sel of selectors) {
        targetEl = document.querySelector(sel);
        if (targetEl) break;
      }

      if (!targetEl) {
        this._createCenteredTooltip(step.text, false);
        return;
      }

      this._targetEl = targetEl;

      // double rAF 确保布局稳定后计算位置
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          if (!this.active || this._targetEl !== targetEl) return;
          const rect = targetEl.getBoundingClientRect();
          if (!rect.width || !rect.height) return;

          // 4 块遮罩（空心框，目标区域无遮罩，按钮天然可点击）
          this._createHoods(rect);
          // 金色高亮环（独立 div，不受 overflow:hidden 裁剪）
          this._createHighlight(rect);
          this._createTargetTooltip(step.text);
          this._positionTooltip(rect);
          this._addPositionHandlers();
        });
      });
    },

    _createTargetTooltip(text) {
      const tooltip = document.createElement('div');
      tooltip.className = 'tg-target-tooltip';
      tooltip.style.cssText = [
        'position:fixed',
        'z-index:100001',
        'background:rgba(30,20,10,0.96)',
        'color:#F0E0C0',
        'padding:8px 12px',
        'border-radius:10px',
        'border:1px solid rgba(201,169,110,0.5)',
        'max-width:220px',
        'font-size:12px',
        'line-height:1.5',
        'box-shadow:0 4px 16px rgba(0,0,0,0.5)',
        'pointer-events:auto',
        'opacity:0',
        'transition:opacity 0.2s',
        'white-space:pre-line',
      ].join(';');
      tooltip.textContent = text;
      document.body.appendChild(tooltip);
      this._tooltipEl = tooltip;
    },

    // ==================== 精确定位（viewport 坐标） ====================
    // 优先放在目标左右两侧，不遮挡目标本身

    _positionTooltip(rect) {
      const tooltip = this._tooltipEl;
      if (!tooltip || !rect) return;

      const tooltipRect = tooltip.getBoundingClientRect();
      const tooltipW = Math.round(tooltipRect.width);
      const tooltipH = Math.round(tooltipRect.height);
      const gap = 12;
      const pad = 8;

      const vw = window.innerWidth;
      const vh = window.innerHeight;

      // 优先右侧
      const spaceRight = vw - rect.right;
      const spaceLeft = rect.left;
      const spaceBelow = vh - rect.bottom;
      const spaceAbove = rect.top;

      let left, top, placeRight;

      if (spaceRight >= tooltipW + gap + pad) {
        left = rect.right + gap;
        top = rect.top + rect.height / 2 - tooltipH / 2;
        placeRight = true;
      } else if (spaceLeft >= tooltipW + gap + pad) {
        left = rect.left - tooltipW - gap;
        top = rect.top + rect.height / 2 - tooltipH / 2;
        placeRight = false;
      } else if (spaceBelow >= tooltipH + gap + pad) {
        left = rect.left + rect.width / 2 - tooltipW / 2;
        top = rect.bottom + gap;
        placeRight = null;
      } else {
        left = rect.left + rect.width / 2 - tooltipW / 2;
        top = rect.top - tooltipH - gap;
        placeRight = null;
      }

      // 边界修正
      if (left < pad) left = pad;
      if (left + tooltipW > vw - pad) left = vw - tooltipW - pad;
      if (top < pad) top = pad;
      if (top + tooltipH > vh - pad) top = vh - tooltipH - pad;

      tooltip.style.top = Math.round(top) + 'px';
      tooltip.style.left = Math.round(left) + 'px';
      tooltip.style.opacity = '1';

      tooltip.classList.remove('tg-tip-right', 'tg-tip-left', 'tg-tip-below', 'tg-tip-above');
      if (placeRight === true) tooltip.classList.add('tg-tip-right');
      else if (placeRight === false) tooltip.classList.add('tg-tip-left');
      else if (top > rect.bottom) tooltip.classList.add('tg-tip-below');
      else tooltip.classList.add('tg-tip-above');
    },

    // ==================== 位置监听 ====================

    _addPositionHandlers() {
      const handler = () => {
        if (this._targetEl) {
          const rect = this._targetEl.getBoundingClientRect();
          if (rect.width && rect.height) {
            this._createHoods(rect);
            this._createHighlight(rect);
            if (this._tooltipEl) {
              this._positionTooltip(rect);
            }
          }
        }
      };

      const debounced = () => {
        if (this._repositionTimer) cancelAnimationFrame(this._repositionTimer);
        this._repositionTimer = requestAnimationFrame(handler);
      };

      this._resizeHandler = debounced;
      window.addEventListener('resize', debounced);
      window.addEventListener('scroll', debounced, { passive: true, capture: true });

      if (window.ResizeObserver) {
        this._observer = new ResizeObserver(debounced);
        this._observer.observe(document.body);
        if (this._targetEl) this._observer.observe(this._targetEl);
      }
    },

    // ==================== 清理 ====================

    _removeTooltip() {
      if (this._tooltipEl) {
        this._tooltipEl.remove();
        this._tooltipEl = null;
      }
    },

    _cleanup() {
      // 清理上一步的遮罩、高亮、提示
      this._removeTooltip();
      this._removeHoods();
      this._removeHighlight();
      this._removeInfoBackdrop();
      this._targetEl = null;
      this._infoDismissed = false;

      if (this._resizeHandler) {
        window.removeEventListener('resize', this._resizeHandler);
        window.removeEventListener('scroll', this._resizeHandler, { capture: true });
        this._resizeHandler = null;
      }
      if (this._observer) {
        this._observer.disconnect();
        this._observer = null;
      }
      if (this._repositionTimer) {
        cancelAnimationFrame(this._repositionTimer);
        this._repositionTimer = null;
      }
    },

    _fullCleanup() {
      this._cleanup();
    },
  };

  // 全局暴露
  window.TutorialGuide = Guide;

  console.log('[TutorialGuide] 模块已加载');
})();
