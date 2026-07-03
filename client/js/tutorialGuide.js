// ============================================================
// tutorialGuide.js — 新手教程聚光灯引导系统
// 强迫玩家一步步操作，了解游戏基本流程
// 依赖: showToast, _lastView, socket, GameState
// ============================================================

(function() {
  'use strict';

  // ==================== 步骤定义 ====================
  // type: 'intro' (遮罩+居中提示+"下一步") | 'action' (聚光灯目标+提示) | 'tip' (遮罩+居中提示+"下一步") | 'info' (无遮罩，自动推进)
  // advanceOn: 'bidSubmitted' | 'phaseChange' | 'diceSelected' | 'tradeAction' | 'manual'

  function getSteps(phase, isAuctioneer, isFirstTime) {
    switch (phase) {
      case 'auction':
        return [
          { type: 'intro', text: '欢迎来到马王堆拍卖！所有人同时秘密报价佣金比例（10%~50%）。佣金最低者当选拍卖师——拍卖师不掷骰，但收取其他人的佣金。' },
          { type: 'action', text: '点击一个佣金比例按钮报价。比例越低越容易当选，但佣金也越少。', target: '.bid-btn:not(.pass-btn)', advanceOn: 'bidSubmitted' },
          { type: 'info', text: '已提交报价！等待其他玩家报价中...', advanceOn: 'phaseChange' },
        ];

      case 'selectCard':
        if (isAuctioneer) {
          return [
            { type: 'intro', text: '你当选了拍卖师！从牌堆中选一张文物进行拍卖。选择高分卡牌可以拉开分差，但也要考虑特殊效果联动。' },
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
          { type: 'intro', text: '现在选择骰子争夺这张卡牌！' },
          { type: 'tip', text: 'd4=1💰(1-4点) d6=2💰(1-6) d12=4💰(1-12) d20=6💰(1-20)。骰子越贵出点越高，但要注意留够金币应付后续轮次。' },
          { type: 'action', text: '点击你想要的骰子，或点击"放弃"跳过。', target: '.dice-btn:not(.pass-btn-full), .dice-btn.pass-btn-full', advanceOn: 'diceSelected' },
        ];

      case 'rollDice':
        return [
          { type: 'info', text: '掷骰结果出来了！点数最高者赢得卡牌。平局会重掷直到分出胜负。', advanceOn: 'phaseChange' },
        ];

      case 'settle':
        return [
          { type: 'intro', text: '本轮结算！看看谁赢得了卡牌，拍卖师获得佣金。' },
          { type: 'tip', text: '核心策略：终局排名只看卡牌总分，剩余金币仅用于平局决胜。不要囤钱，要积极争卡！' },
        ];

      case 'trade':
        if (isFirstTime) {
          return [
            { type: 'intro', text: '交易阶段！你可以和其他玩家交换卡牌或金币，调整你的收藏组合。' },
            { type: 'action', text: '选择目标玩家发起交易，或点击"跳过交易"。', target: '.trade-player-item.can-target, .trade-skip-btn', advanceOn: 'tradeAction' },
          ];
        }
        return [
          { type: 'action', text: '交易阶段：选择目标玩家交易，或跳过。', target: '.trade-player-item.can-target, .trade-skip-btn', advanceOn: 'tradeAction' },
        ];

      case 'duel':
        return [
          { type: 'info', text: '镜中决斗！双方各押一张卡，掷骰定胜负。这是一次抢夺对手珍品的机会。', advanceOn: 'phaseChange' },
        ];

      case 'finished':
        return [
          { type: 'intro', text: '游戏结束！看看你的最终排名。' },
          { type: 'tip', text: '总分 = 所有卡牌分值之和。特殊卡牌联动可以大幅提升低分卡的价值——注意收集成套组合！' },
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

    // DOM 引用（每次渲染重建）
    _maskEl: null,
    _tooltipEl: null,
    _targetEl: null,
    _targetPrevState: null,
    _parent: null,
    _resizeHandler: null,
    _scrollHandler: null,
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
      this._cleanup();
    },

    reset() {
      this.active = false;
      this._cleanup();
    },

    // ==================== 主入口：每次渲染后调用 ====================

    onPhaseRender(view, container) {
      if (!this.active) return;
      if (!GameState._tutorial || !GameState._tutorial.active) return;

      this._lastView = view;

      const phase = view.phase;
      const isAuctioneer = view.auctioneerId === socket.id;

      // 检测阶段变化 → 加载新步骤序列
      if (phase !== this.currentPhase) {
        this.currentPhase = phase;
        this.stepIndex = 0;
        const isFirstTime = !this.seenPhases[phase];
        this.seenPhases[phase] = true;
        this.steps = getSteps(phase, isAuctioneer, isFirstTime);
        this._cleanup();
      }

      if (!this.steps || this.steps.length === 0) {
        this._cleanup();
        return;
      }

      // 被动检测：是否应自动推进
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
      this._cleanup();
      if (this.stepIndex >= this.steps.length) {
        // 该阶段所有步骤完成
        if (this.currentPhase === 'finished' && !this.finishedStepsDone) {
          this.finishedStepsDone = true;
          // 重新渲染以显示教程完成页
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

    nextStepManual() {
      this._advanceStep();
    },

    // ==================== 渲染当前步骤 ====================

    _renderCurrentStep() {
      if (!this.steps || this.stepIndex >= this.steps.length) {
        this._cleanup();
        return;
      }

      const step = this.steps[this.stepIndex];
      const inner = document.getElementById('tut-phase-inner');
      if (!inner) return;

      // 确保 inner 有定位上下文
      inner.style.position = 'relative';

      // 清理上一次覆盖层
      this._removeOverlay();
      this._parent = inner;

      switch (step.type) {
        case 'info':
          // info 步骤：无遮罩，仅等待自动推进
          break;

        case 'intro':
        case 'tip':
          this._createMask(inner);
          this._createCenteredTooltip(inner, step.text, step.type === 'tip');
          break;

        case 'action':
          // 用 requestAnimationFrame 确保 DOM 已完成布局
          requestAnimationFrame(() => {
            if (this._parent !== inner) return; // 已被清理
            this._createMask(inner);
            this._spotlightTarget(inner, step);
          });
          break;
      }
    },

    // ==================== 遮罩 ====================

    _createMask(parent) {
      const mask = document.createElement('div');
      mask.className = 'tg-mask';
      mask.style.cssText = [
        'position:absolute',
        'inset:0',
        'background:rgba(0,0,0,0.55)',
        'z-index:9998',
        'pointer-events:auto',
        'border-radius:inherit',
        'cursor:not-allowed',
      ].join(';');

      mask.addEventListener('click', (e) => {
        if (e.target === mask) {
          if (typeof showToast === 'function') {
            showToast('请先完成当前指引步骤', 'info');
          }
        }
      });

      parent.appendChild(mask);
      this._maskEl = mask;
    },

    // ==================== 居中提示（intro / tip） ====================

    _createCenteredTooltip(parent, text, isTip) {
      const tooltip = document.createElement('div');
      tooltip.className = 'tg-centered-tooltip';
      tooltip.style.cssText = [
        'position:absolute',
        'top:50%',
        'left:50%',
        'transform:translate(-50%,-50%)',
        'z-index:10000',
        'background:rgba(30,20,10,0.95)',
        'color:#F0E0C0',
        'padding:16px 20px',
        'border-radius:12px',
        'border:1px solid rgba(201,169,110,0.4)',
        'max-width:320px',
        'font-size:14px',
        'line-height:1.6',
        'text-align:center',
        'box-shadow:0 4px 24px rgba(0,0,0,0.5)',
        'pointer-events:auto',
      ].join(';');

      const tipIcon = isTip ? '<span style="font-size:18px;margin-right:4px;">💡</span>' : '';
      tooltip.innerHTML =
        '<div style="margin-bottom:14px;">' + tipIcon + text + '</div>' +
        '<button class="tg-next-btn" style="' + [
          'display:inline-block',
          'padding:8px 28px',
          'background:#C9A96E',
          'color:#1a1a1a',
          'border:none',
          'border-radius:8px',
          'font-size:14px',
          'font-weight:600',
          'cursor:pointer',
        ].join(';') + '">下一步 →</button>';

      const btn = tooltip.querySelector('.tg-next-btn');
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.nextStepManual();
      });

      parent.appendChild(tooltip);
      this._tooltipEl = tooltip;
    },

    // ==================== 聚光灯目标 ====================

    _spotlightTarget(parent, step) {
      // 查找目标元素
      let targetEl = null;
      const selectors = (step.target || '').split(',').map(s => s.trim()).filter(Boolean);
      for (const sel of selectors) {
        targetEl = parent.querySelector(sel);
        if (targetEl) break;
      }

      if (!targetEl) {
        // 目标未找到，降级为居中提示
        if (typeof window.__MW_DEBUG__ !== 'undefined' && window.__MW_DEBUG__) {
          console.warn('[TutorialGuide] Target not found:', step.target);
        }
        this._createCenteredTooltip(parent, step.text, false);
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
      };
      targetEl.style.position = 'relative';
      targetEl.style.zIndex = '9999';
      targetEl.classList.add('tg-spotlight-target');
      this._targetEl = targetEl;

      // 创建提示气泡
      this._createTargetTooltip(parent, step.text);

      // 精确定位气泡
      // 用 double-rAF 确保布局已完成（scrollIntoView 可能触发布局变化）
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          if (this._targetEl === targetEl && this._tooltipEl) {
            this._positionTooltip(parent, targetEl);
          }
        });
      });

      // 监听位置变化
      this._addPositionHandlers(parent);
    },

    _createTargetTooltip(parent, text) {
      const tooltip = document.createElement('div');
      tooltip.className = 'tg-target-tooltip';
      tooltip.style.cssText = [
        'position:absolute',
        'z-index:10000',
        'background:rgba(30,20,10,0.95)',
        'color:#F0E0C0',
        'padding:10px 14px',
        'border-radius:10px',
        'border:1px solid rgba(201,169,110,0.4)',
        'max-width:260px',
        'font-size:13px',
        'line-height:1.5',
        'box-shadow:0 4px 16px rgba(0,0,0,0.4)',
        'pointer-events:none',
        'opacity:0',
        'transition:opacity 0.15s',
      ].join(';');
      tooltip.textContent = text;
      parent.appendChild(tooltip);
      this._tooltipEl = tooltip;
    },

    // ==================== 精确定位（核心！） ====================

    _positionTooltip(parent, targetEl) {
      const tooltip = this._tooltipEl;
      if (!tooltip || !targetEl || !parent) return;

      // 使用 getBoundingClientRect 获取精确位置
      const targetRect = targetEl.getBoundingClientRect();
      const parentRect = parent.getBoundingClientRect();
      const tooltipRect = tooltip.getBoundingClientRect();

      const tooltipW = Math.round(tooltipRect.width);
      const tooltipH = Math.round(tooltipRect.height);
      const gap = 10; // 目标与气泡之间的间距
      const pad = 8;  // 安全边距

      // 计算可用空间
      const spaceBelow = parentRect.bottom - targetRect.bottom;
      const spaceAbove = targetRect.top - parentRect.top;

      // 默认放在目标下方，水平居中
      let top, placeAbove;

      if (spaceBelow >= tooltipH + gap + pad || spaceBelow >= spaceAbove) {
        // 下方放得下，或下方比上方大 → 放下方
        top = targetRect.bottom - parentRect.top + gap;
        placeAbove = false;
      } else {
        // 放上方
        top = targetRect.top - parentRect.top - tooltipH - gap;
        placeAbove = true;
      }

      // 水平居中于目标
      let left = targetRect.left - parentRect.left + targetRect.width / 2 - tooltipW / 2;

      // 水平边界钳制
      if (left < pad) left = pad;
      if (left + tooltipW > parentRect.width - pad) {
        left = parentRect.width - tooltipW - pad;
      }

      // 垂直边界钳制
      if (top < pad) top = pad;
      if (top + tooltipH > parentRect.height - pad) {
        top = parentRect.height - tooltipH - pad;
      }

      tooltip.style.top = Math.round(top) + 'px';
      tooltip.style.left = Math.round(left) + 'px';
      tooltip.style.opacity = '1';

      // 箭头方向
      tooltip.classList.remove('tg-tip-below', 'tg-tip-above');
      tooltip.classList.add(placeAbove ? 'tg-tip-above' : 'tg-tip-below');
    },

    // ==================== 位置监听 ====================

    _addPositionHandlers(parent) {
      const handler = () => {
        if (this._targetEl && this._tooltipEl && this._parent === parent) {
          this._positionTooltip(parent, this._targetEl);
        }
      };

      // 防抖
      const debounced = () => {
        if (this._repositionTimer) cancelAnimationFrame(this._repositionTimer);
        this._repositionTimer = requestAnimationFrame(handler);
      };

      this._resizeHandler = debounced;
      this._scrollHandler = debounced;

      window.addEventListener('resize', debounced);
      parent.addEventListener('scroll', debounced, { passive: true });

      // 监听父容器尺寸变化
      if (window.ResizeObserver) {
        this._observer = new ResizeObserver(debounced);
        this._observer.observe(parent);
        // 也监听目标元素尺寸变化
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
        }
        this._targetEl = null;
        this._targetPrevState = null;
      }

      // 移除事件监听
      if (this._resizeHandler) {
        window.removeEventListener('resize', this._resizeHandler);
        this._resizeHandler = null;
      }
      if (this._scrollHandler && this._parent) {
        this._parent.removeEventListener('scroll', this._scrollHandler);
        this._scrollHandler = null;
      }
      if (this._observer) {
        this._observer.disconnect();
        this._observer = null;
      }
      if (this._repositionTimer) {
        cancelAnimationFrame(this._repositionTimer);
        this._repositionTimer = null;
      }

      this._parent = null;
    },

    _cleanup() {
      this._removeOverlay();
    },
  };

  // 全局暴露
  window.TutorialGuide = Guide;

  console.log('[TutorialGuide] 模块已加载');
})();
