// ============================================================
// tutorialGuide.js — 新手教程引导系统 v3.0
// 方案：CSS pointer-events 控制（无遮罩层）
// - body.tutorial-lock → #app 内所有元素 pointer-events:none
// - .tg-clickable → 恢复 pointer-events:auto
// - info 步骤：提示框在 body 顶层，天然可交互
// - action 步骤：给目标元素加 .tg-clickable，玩家直接点击
// 依赖: showToast, socket, GameState
// ============================================================

(function() {
  'use strict';

  // ==================== 步骤定义 ====================

  function getSteps(phase, isAuctioneer, round) {
    // 第3轮起：无引导
    if (round >= 3) return [];

    // ==================== 第1轮：跳过竞标 → 租骰竞拍 ====================
    if (round === 1) {
      switch (phase) {
        case 'auction':
          return [
            { type: 'info', text: '欢迎来到琳琅！\n每轮先竞标拍卖师资格——报价佣金比例最低者当选。\n第一轮先跳过竞标，体验竞拍。' },
            { type: 'action', text: '点击「放弃」跳过本轮竞标，\n作为竞拍者参与掷骰。', target: '.bid-btn.pass-btn', advanceOn: 'bidSubmitted' },
          ];

        case 'selectCard':
          return [
            { type: 'info', text: 'AI 当选拍卖师，正在选卡…\n每张文物卡都有独特技能：\n被动技能自动生效，主动技能在特定时机触发，\n联动技能需同时持有配对文物才能激活。\n等待拍卖师选择本轮拍品。', advanceOn: 'phaseChange' },
          ];

        case 'rentDice':
          return [
            { type: 'info', text: '选骰子争夺卡牌！\n骰子面数=点数范围：\n4面骰(1-4)  6面骰(1-6)\n8面骰(1-8)  12面骰(1-12)  20面骰(1-20)\n面数越多赢面越大，但费用也越高。\n非拍卖师只能看到文物分值（★X分），\n拍卖师可鉴定完整卡牌信息。\n\n可花1💰押注碰运气：\n参与者赢卡→返2💰，旁观者猜有人赢→返2💰。' },
            { type: 'action', text: '点击 6面骰租骰——性价比最高。', target: '.dice-btn[data-dice-type="d6"]', advanceOn: 'diceSelected' },
          ];

        case 'rollDice':
          return [
            { type: 'info', text: '掷骰中…点数最高者赢得卡牌！', advanceOn: 'phaseChange' },
          ];

        case 'settle':
          return [
            { type: 'info', text: '结算完成！\n赢家获得卡牌，拍卖师收佣金。\n终局总分 = 卡牌分 + floor(资金/2)，\n清明上河图终局额外+3分。', advanceOn: 'phaseChange' },
          ];

        default:
          return [];
      }
    }

    // ==================== 第2轮：当拍卖师 ====================
    if (round === 2) {
      switch (phase) {
        case 'auction':
          return [
            { type: 'info', text: '第二轮，你来当拍卖师！\n报最低佣金比例即可当选。\n注意：连续当选拍卖师会有惩罚，\n每连任一次佣金收入减少1💰。' },
            { type: 'action', text: '点击「10%」——最低佣金最容易当选。', target: '.bid-btn:first-child', advanceOn: 'bidSubmitted' },
          ];

        case 'selectCard':
          if (isAuctioneer) {
            return [
              { type: 'info', text: '你当选拍卖师！\n从剩余卡牌中选一张作为本轮拍品。\n拍卖师不掷骰，但收佣金。' },
              { type: 'action', text: '点击一张文物卡牌。', target: '.select-card-item', advanceOn: 'phaseChange' },
            ];
          }
          return [
            { type: 'info', text: 'AI 当选拍卖师，等待它选卡…', advanceOn: 'phaseChange' },
          ];

        case 'rentDice':
          if (isAuctioneer) {
            return [
              { type: 'info', text: '拍卖师不掷骰，等待竞拍者选骰。', advanceOn: 'phaseChange' },
            ];
          }
          return [
            { type: 'info', text: '选骰子竞拍！\n点击你想要的骰子类型。', advanceOn: 'diceSelected' },
          ];

        case 'rollDice':
          return [
            { type: 'info', text: '掷骰中…', advanceOn: 'phaseChange' },
          ];

        case 'settle':
          return [
            { type: 'info', text: '结算完成！\n拍卖师获得佣金收入。', advanceOn: 'phaseChange' },
          ];

        case 'trade':
          return [
            { type: 'info', text: '交易阶段！\n你可以与其他玩家交换文物卡。\n发起交易需指定对方和交换条件，\n对方可以接受或拒绝。每人每局可发起有限次交易。\n点击玩家头像可查看其卡牌详情。', advanceOn: 'phaseChange' },
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

    // DOM
    _tooltipEl: null,
    _highlightEl: null,
    _targetEl: null,
    _infoDismissed: false,
    _renderedStepKey: null,
    _resizeHandler: null,
    _clickableSet: null, // 记录已加 tg-clickable 的元素

    // ==================== 生命周期 ====================

    init() {
      this.active = true;
      this.currentPhase = null;
      this.currentRound = 0;
      this.steps = null;
      this.stepIndex = 0;
      this.finishedStepsDone = false;
      this._lastView = null;
      this._infoDismissed = false;
      this._renderedStepKey = null;
      this._clickableSet = new Set();
      this._fullCleanup();
      document.body.classList.add('tutorial-active', 'tutorial-lock');
    },

    reset() {
      this.active = false;
      this._renderedStepKey = null;
      this._fullCleanup();
      document.body.classList.remove('tutorial-active', 'tutorial-lock');
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
        this._cleanupClickable();
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
          // 暗标制：检查 bids 数组里是否有我的报价
          const myBid = (view.bids || []).find(b => b.playerId === myId);
          return !!myBid;
        }
        case 'diceSelected': {
          const sel = view.diceSelections && view.diceSelections[myId];
          return !!(sel && sel !== 'auctioneer' && sel !== 'waiting');
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
      this._cleanupClickable();
      this._cleanup();

      if (this.stepIndex >= this.steps.length) {
        // 步骤序列结束，解锁等待阶段变化
        document.body.classList.remove('tutorial-lock');
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

      if (this._renderedStepKey === stepKey && this._elementsAlive(step)) {
        // 步骤没变，但重渲染后目标元素可能被重建，需要重新加 tg-clickable
        if (step.type === 'action' && step.target) {
          this._applyClickable(step.target);
          this._updateHighlightPosition();
        }
        return;
      }
      this._renderedStepKey = stepKey;
      this._cleanupClickable();
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

    _elementsAlive(step) {
      if (step.type === 'info') {
        if (this._infoDismissed) return true;
        return !!this._tooltipEl;
      }
      if (step.type === 'action') {
        return !!this._highlightEl;
      }
      return false;
    },

    // ==================== info 步骤 ====================

    _renderInfoStep(step) {
      // info 步骤：锁定 #app 交互，提示框在 body 顶层可点击
      document.body.classList.add('tutorial-lock');

      const isLastStep = this.stepIndex >= this.steps.length - 1;

      const tooltip = document.createElement('div');
      tooltip.className = 'tg-centered-tooltip';
      tooltip.style.cssText = [
        'text-align:center',
      ].join(';');

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
        if (!isLastStep) {
          this._advanceStep();
        } else {
          // 最后一步：移除提示，解锁等待阶段变化
          this._infoDismissed = true;
          this._removeTooltip();
          document.body.classList.remove('tutorial-lock');
        }
      });

      document.body.appendChild(tooltip);
      this._tooltipEl = tooltip;
    },

    // ==================== action 步骤 ====================

    _renderActionStep(step) {
      // action 步骤：锁定 #app，给目标加 tg-clickable
      document.body.classList.add('tutorial-lock');

      // 查找目标元素
      let targetEl = null;
      const selectors = (step.target || '').split(',').map(s => s.trim()).filter(Boolean);
      for (const sel of selectors) {
        targetEl = document.querySelector(sel);
        if (targetEl) break;
      }

      if (!targetEl) {
        // 目标不存在：降级为 info
        this._renderInfoStep({ text: step.text });
        return;
      }

      this._targetEl = targetEl;
      this._applyClickable(step.target);

      // 用 rAF 等布局稳定后创建高亮和提示
      requestAnimationFrame(() => {
        if (!this.active || !this._targetEl) return;
        const rect = this._targetEl.getBoundingClientRect();
        if (!rect.width || !rect.height) {
          // 目标不可见，重试
          requestAnimationFrame(() => {
            if (!this.active || !this._targetEl) return;
            const r2 = this._targetEl.getBoundingClientRect();
            if (r2.width && r2.height) {
              this._createHighlight(r2);
              this._createTargetTooltip(step.text);
              this._positionTooltip(r2);
              this._addResizeHandler();
            }
          });
          return;
        }

        this._createHighlight(rect);
        this._createTargetTooltip(step.text);
        this._positionTooltip(rect);
        this._addResizeHandler();
      });
    },

    // ==================== pointer-events 控制 ====================

    _applyClickable(targetSelector) {
      this._cleanupClickable();

      const selectors = (targetSelector || '').split(',').map(s => s.trim()).filter(Boolean);
      for (const sel of selectors) {
        const els = document.querySelectorAll(sel);
        els.forEach(el => {
          el.classList.add('tg-clickable');
          this._clickableSet.add(el);

          // 点击目标后直接推进步骤（不依赖服务器 view）
          const handler = (e) => {
            // 让原始 onclick 先执行（下一帧再推进）
            requestAnimationFrame(() => {
              if (this.active && this.steps && this.stepIndex < this.steps.length) {
                const step = this.steps[this.stepIndex];
                if (step.type === 'action') {
                  this._advanceStep();
                }
              }
            });
          };
          el.addEventListener('click', handler, { once: true });
          el._tgClickHandler = handler;
        });
        if (els.length > 0) {
          this._targetEl = els[0];
        }
      }
    },

    _cleanupClickable() {
      if (this._clickableSet) {
        this._clickableSet.forEach(el => {
          el.classList.remove('tg-clickable');
          if (el._tgClickHandler) {
            el.removeEventListener('click', el._tgClickHandler);
            delete el._tgClickHandler;
          }
        });
        this._clickableSet.clear();
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

    _updateHighlightPosition() {
      if (!this._targetEl || !this._highlightEl) return;
      const rect = this._targetEl.getBoundingClientRect();
      if (!rect.width || !rect.height) return;
      const pad = 6;
      this._highlightEl.style.top = (Math.round(rect.top) - pad) + 'px';
      this._highlightEl.style.left = (Math.round(rect.left) - pad) + 'px';
      this._highlightEl.style.width = (Math.round(rect.width) + pad * 2) + 'px';
      this._highlightEl.style.height = (Math.round(rect.height) + pad * 2) + 'px';
      if (this._tooltipEl) {
        this._positionTooltip(rect);
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
        this._updateHighlightPosition();
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
      this._targetEl = null;
      this._infoDismissed = false;

      if (this._resizeHandler) {
        window.removeEventListener('resize', this._resizeHandler);
        window.removeEventListener('scroll', this._resizeHandler, { capture: true });
        this._resizeHandler = null;
      }
    },

    _fullCleanup() {
      this._cleanupClickable();
      this._cleanup();
    },
  };

  window.TutorialGuide = Guide;
  console.log('[TutorialGuide] 模块已加载 v3.0 (pointer-events)');
})();
