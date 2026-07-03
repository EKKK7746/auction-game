// ============================================================
// tutorialGuide.js — 新手教程全屏引导系统（重写版）
// 全屏fixed遮罩 + 聚光灯高亮 + 交互驱动推进
// 依赖: showToast, _lastView, socket, GameState
// ============================================================

(function() {
  'use strict';

  // ==================== 步骤定义 ====================
  // type: 'info' (居中提示+"知道了"按钮) | 'action' (聚光灯目标+提示，等交互)
  // advanceOn: 'bidSubmitted' | 'phaseChange' | 'diceSelected' | 'tradeAction' | null
  //   - info + advanceOn=null: 点"知道了"推进
  //   - info + advanceOn='phaseChange': 点"知道了"关闭提示，等phase变化推进
  //   - action + advanceOn: 等玩家完成指定交互后推进

  function getSteps(phase, isAuctioneer, isFirstTime) {
    switch (phase) {
      case 'auction':
        return [
          { type: 'info', text: '欢迎来到马王堆拍卖！\n所有人同时秘密报价佣金比例（10%~50%）。\n佣金最低者当选拍卖师——拍卖师不掷骰，但收取其他人的佣金。' },
          { type: 'action', text: '点击一个佣金比例按钮报价。\n比例越低越容易当选，但佣金也越少。', target: '.bid-btn:not(.pass-btn)', advanceOn: 'bidSubmitted' },
          { type: 'info', text: '已提交报价！等待其他玩家报价中...', advanceOn: 'phaseChange' },
        ];

      case 'selectCard':
        if (isAuctioneer) {
          return [
            { type: 'info', text: '你当选了拍卖师！\n从牌堆中选一张文物进行拍卖。' },
            { type: 'action', text: '点击你想拍卖的文物卡牌。', target: '.select-card-item', advanceOn: 'phaseChange' },
          ];
        }
        return [
          { type: 'info', text: '本轮你不是拍卖师，等待拍卖师选卡...', advanceOn: 'phaseChange' },
        ];

      case 'rentDice':
        if (isAuctioneer) {
          return [
            { type: 'info', text: '你是拍卖师，不参与掷骰。等待其他玩家选骰。', advanceOn: 'phaseChange' },
          ];
        }
        return [
          { type: 'info', text: '现在选择骰子争夺这张卡牌！\nd4=1💰(1-4点) d6=2💰(1-6)\nd12=4💰(1-12) d20=6💰(1-20)\n骰子越贵出点越高，但要注意留够金币。' },
          { type: 'action', text: '点击你想要的骰子，或点击"放弃"跳过。', target: '.dice-btn:not(.pass-btn-full), .dice-btn.pass-btn-full', advanceOn: 'diceSelected' },
        ];

      case 'rollDice':
        return [
          { type: 'info', text: '掷骰结果出来了！\n点数最高者赢得卡牌。平局会重掷直到分出胜负。', advanceOn: 'phaseChange' },
        ];

      case 'settle':
        return [
          { type: 'info', text: '本轮结算！看看谁赢得了卡牌，拍卖师获得佣金。\n核心策略：终局排名只看卡牌总分，不要囤钱，要积极争卡！' },
        ];

      case 'trade':
        if (isFirstTime) {
          return [
            { type: 'info', text: '交易阶段！\n你可以和其他玩家交换卡牌或金币，调整你的收藏组合。' },
            { type: 'action', text: '选择目标玩家发起交易，或点击"跳过交易"。', target: '.trade-player-item.can-target, .trade-skip-btn', advanceOn: 'tradeAction' },
          ];
        }
        return [
          { type: 'action', text: '交易阶段：选择目标玩家交易，或跳过。', target: '.trade-player-item.can-target, .trade-skip-btn', advanceOn: 'tradeAction' },
        ];

      case 'duel':
        return [
          { type: 'info', text: '镜中决斗！\n双方各押一张卡，掷骰定胜负。\n这是一次抢夺对手珍品的机会。', advanceOn: 'phaseChange' },
        ];

      case 'finished':
        return [
          { type: 'info', text: '游戏结束！看看你的最终排名。\n总分 = 所有卡牌分值之和。\n特殊卡牌联动可以大幅提升低分卡的价值——注意收集成套组合！' },
        ];

      default:
        return null;
    }
  }

  // ==================== 引擎状态 ====================

  const Guide = {
    active: false,
    currentPhase: null,
    steps: null,
    stepIndex: 0,
    seenPhases: {},
    finishedStepsDone: false,
    _lastView: null,
    _prevTradeQuota: -1,

    // DOM 引用
    _maskEl: null,
    _tooltipEl: null,
    _targetEl: null,
    _targetPrevState: null,
    _infoDismissed: false,
    _resizeHandler: null,
    _observer: null,
    _repositionTimer: null,

    // ==================== 生命周期 ====================

    init() {
      this.active = true;
      this.currentPhase = null;
      this.steps = null;
      this.stepIndex = 0;
      this.seenPhases = {};
      this.finishedStepsDone = false;
      this._lastView = null;
      this._prevTradeQuota = -1;
      this._infoDismissed = false;
      this._cleanup();
    },

    reset() {
      this.active = false;
      this._cleanup();
    },

    // ==================== 主入口 ====================

    onPhaseRender(view) {
      if (!this.active) return;
      if (!GameState._tutorial || !GameState._tutorial.active) return;

      this._lastView = view;
      const phase = view.phase;
      const isAuctioneer = view.auctioneerId === socket.id;

      // 阶段变化 → 加载新步骤序列
      if (phase !== this.currentPhase) {
        this.currentPhase = phase;
        this.stepIndex = 0;
        const isFirstTime = !this.seenPhases[phase];
        this.seenPhases[phase] = true;
        this.steps = getSteps(phase, isAuctioneer, isFirstTime);
        this._infoDismissed = false;
        this._cleanup();
      }

      if (!this.steps || this.steps.length === 0) {
        this._cleanup();
        return;
      }

      // 检测自动推进
      if (this._shouldAutoAdvance(view)) {
        this._advanceStep();
        return;
      }

      // 渲染当前步骤
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

      // 清理上一次覆盖层
      this._removeOverlay();

      switch (step.type) {
        case 'info':
          this._createMask();
          this._createCenteredTooltip(step.text, !!step.advanceOn);
          break;

        case 'action':
          // 用 rAF 确保 DOM 已完成布局
          requestAnimationFrame(() => {
            if (!this.active || this.stepIndex >= this.steps.length) return;
            const currentStep = this.steps[this.stepIndex];
            if (currentStep !== step) return; // 已切换
            this._createMask();
            this._spotlightTarget(step);
          });
          break;
      }
    },

    // ==================== 全屏遮罩 ====================

    _createMask() {
      const mask = document.createElement('div');
      mask.className = 'tg-mask';
      mask.style.cssText = [
        'position:fixed',
        'inset:0',
        'background:rgba(0,0,0,0.75)',
        'z-index:99999',
        'pointer-events:auto',
      ].join(';');

      mask.addEventListener('click', (e) => {
        if (e.target === mask) {
          if (typeof showToast === 'function') {
            showToast('请先完成当前指引步骤', 'info');
          }
        }
      });

      document.body.appendChild(mask);
      this._maskEl = mask;
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
        'background:rgba(30,20,10,0.95)',
        'color:#F0E0C0',
        'padding:20px 24px',
        'border-radius:14px',
        'border:1px solid rgba(201,169,110,0.5)',
        'max-width:360px',
        'font-size:14px',
        'line-height:1.8',
        'text-align:center',
        'box-shadow:0 8px 32px rgba(0,0,0,0.6)',
        'pointer-events:auto',
        'white-space:pre-line',
      ].join(';');

      tooltip.innerHTML =
        '<div class="tg-info-text">' + text + '</div>' +
        '<button class="tg-next-btn" style="' + [
          'display:inline-block',
          'margin-top:16px',
          'padding:8px 32px',
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
          // info with advanceOn: dismiss tooltip + mask, wait for auto-advance
          this._infoDismissed = true;
          this._removeOverlay();
        } else {
          // info without advanceOn: advance to next step
          this._advanceStep();
        }
      });

      btn.addEventListener('mouseenter', () => {
        btn.style.background = '#D4B97E';
      });
      btn.addEventListener('mouseleave', () => {
        btn.style.background = '#C9A96E';
      });

      document.body.appendChild(tooltip);
      this._tooltipEl = tooltip;
    },

    // ==================== 聚光灯目标（action） ====================

    _spotlightTarget(step) {
      // 在全文档搜索目标元素
      let targetEl = null;
      const selectors = (step.target || '').split(',').map(s => s.trim()).filter(Boolean);
      for (const sel of selectors) {
        targetEl = document.querySelector(sel);
        if (targetEl) break;
      }

      if (!targetEl) {
        // 目标未找到，降级为居中提示
        this._createCenteredTooltip(step.text, false);
        return;
      }

      // 滚动目标到可见区域
      try { targetEl.scrollIntoView({ block: 'center', behavior: 'instant' }); } catch (e) { /* ignore */ }

      // 提升目标到遮罩之上
      this._targetPrevState = {
        position: targetEl.style.position,
        zIndex: targetEl.style.zIndex,
        boxShadow: targetEl.style.boxShadow,
        borderRadius: targetEl.style.borderRadius,
        isolation: targetEl.style.isolation,
      };
      targetEl.style.position = 'relative';
      targetEl.style.zIndex = '100000';
      targetEl.style.isolation = 'isolate';
      targetEl.classList.add('tg-spotlight-target');
      this._targetEl = targetEl;

      // 创建提示气泡
      this._createTargetTooltip(step.text);

      // 精确定位气泡（double rAF 确保布局完成）
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          if (this._targetEl === targetEl && this._tooltipEl) {
            this._positionTooltip(targetEl);
          }
        });
      });

      // 监听位置变化
      this._addPositionHandlers();
    },

    _createTargetTooltip(text) {
      const tooltip = document.createElement('div');
      tooltip.className = 'tg-target-tooltip';
      tooltip.style.cssText = [
        'position:fixed',
        'z-index:100001',
        'background:rgba(30,20,10,0.95)',
        'color:#F0E0C0',
        'padding:10px 14px',
        'border-radius:10px',
        'border:1px solid rgba(201,169,110,0.5)',
        'max-width:280px',
        'font-size:13px',
        'line-height:1.6',
        'box-shadow:0 4px 16px rgba(0,0,0,0.5)',
        'pointer-events:none',
        'opacity:0',
        'transition:opacity 0.2s',
        'white-space:pre-line',
      ].join(';');
      tooltip.textContent = text;
      document.body.appendChild(tooltip);
      this._tooltipEl = tooltip;
    },

    // ==================== 精确定位（viewport 坐标） ====================

    _positionTooltip(targetEl) {
      const tooltip = this._tooltipEl;
      if (!tooltip || !targetEl) return;

      const targetRect = targetEl.getBoundingClientRect();
      const tooltipRect = tooltip.getBoundingClientRect();

      const tooltipW = Math.round(tooltipRect.width);
      const tooltipH = Math.round(tooltipRect.height);
      const gap = 10;
      const pad = 8;

      const spaceBelow = window.innerHeight - targetRect.bottom;
      const spaceAbove = targetRect.top;

      let top, placeAbove;

      if (spaceBelow >= tooltipH + gap + pad || spaceBelow >= spaceAbove) {
        top = targetRect.bottom + gap;
        placeAbove = false;
      } else {
        top = targetRect.top - tooltipH - gap;
        placeAbove = true;
      }

      let left = targetRect.left + targetRect.width / 2 - tooltipW / 2;

      if (left < pad) left = pad;
      if (left + tooltipW > window.innerWidth - pad) {
        left = window.innerWidth - tooltipW - pad;
      }

      if (top < pad) top = pad;
      if (top + tooltipH > window.innerHeight - pad) {
        top = window.innerHeight - tooltipH - pad;
      }

      tooltip.style.top = Math.round(top) + 'px';
      tooltip.style.left = Math.round(left) + 'px';
      tooltip.style.opacity = '1';

      tooltip.classList.remove('tg-tip-below', 'tg-tip-above');
      tooltip.classList.add(placeAbove ? 'tg-tip-above' : 'tg-tip-below');
    },

    // ==================== 位置监听 ====================

    _addPositionHandlers() {
      const handler = () => {
        if (this._targetEl && this._tooltipEl) {
          this._positionTooltip(this._targetEl);
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
        if (this._targetEl) {
          this._observer.observe(this._targetEl);
        }
      }
    },

    // ==================== 清理 ====================

    _removeOverlay() {
      // 移除遮罩
      if (this._maskEl) {
        this._maskEl.remove();
        this._maskEl = null;
      }

      // 移除提示气泡
      if (this._tooltipEl) {
        this._tooltipEl.remove();
        this._tooltipEl = null;
      }

      // 恢复目标元素样式
      if (this._targetEl) {
        this._targetEl.classList.remove('tg-spotlight-target');
        if (this._targetPrevState) {
          this._targetEl.style.position = this._targetPrevState.position || '';
          this._targetEl.style.zIndex = this._targetPrevState.zIndex || '';
          this._targetEl.style.boxShadow = this._targetPrevState.boxShadow || '';
          this._targetEl.style.borderRadius = this._targetPrevState.borderRadius || '';
          this._targetEl.style.isolation = this._targetPrevState.isolation || '';
        }
        this._targetEl = null;
        this._targetPrevState = null;
      }

      // 移除事件监听
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

    _cleanup() {
      this._removeOverlay();
      this._infoDismissed = false;
    },
  };

  // 全局暴露
  window.TutorialGuide = Guide;

  console.log('[TutorialGuide] 模块已加载');
})();
