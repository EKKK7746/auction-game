// ============================================================
// tutorial.js — 新手引导系统
// ============================================================

// -------------------- 弹窗控制 --------------------

function openTutorialModal() {
  const modal = document.getElementById('tutorialModal');
  if (modal) modal.style.display = 'flex';
}

function closeTutorialModal() {
  const modal = document.getElementById('tutorialModal');
  if (modal) modal.style.display = 'none';
}

// 从教程弹窗打开游戏介绍
function openIntroFromTutorial() {
  closeTutorialModal();
  if (typeof openIntro === 'function') openIntro();
}

// -------------------- 新手教程：创建教程对局 --------------------

/**
 * 开始新手教程——自动创建房间、添加 Bot、开始游戏
 */
function startTutorial() {
  closeTutorialModal();

  // 确保用户有昵称
  const nicknameInput = document.getElementById('startNickname');
  const nickname = (nicknameInput && nicknameInput.value.trim()) || GameState.nickname;
  if (!nickname || nickname.length < 2) {
    if (typeof showToast === 'function') showToast('请先输入你的名字（至少2个字）', 'error');
    return;
  }

  // 保存昵称
  GameState.nickname = nickname;
  if (nicknameInput) nicknameInput.value = nickname;

  // 设置教程模式：使用经典模式但缩短为5轮，保留交易阶段
  GameState._tutorial = { active: true, seenPhases: {}, completed: false };
  GameState.selectedMode = getModeById('classic');

  // 初始化聚光灯引导引擎
  if (window.TutorialGuide) TutorialGuide.init();

  if (typeof showLoading === 'function') showLoading('正在创建教程房间...');

  // 1. 创建房间（经典模式5轮，2人，保留交易阶段）
  socket.emit('room:create', nickname, false, { mode: 'classic', rounds: 5, maxPlayers: 2, skin: typeof getSkinBundle === 'function' ? getSkinBundle() : {} }, (res) => {
    if (!res || !res.success) {
      if (typeof hideLoading === 'function') hideLoading();
      if (typeof showToast === 'function') showToast('创建教程房间失败: ' + (res?.error || '未知错误'), 'error');
      GameState._tutorial = null;
      return;
    }

    GameState.roomId = res.roomId;
    console.log('[教程] 房间已创建:', res.roomId);

    // 2. 添加一个简单难度的 Bot
    socket.emit('room:add_bot', res.roomId, 'easy', (botRes) => {
      if (!botRes || !botRes.success) {
        if (typeof hideLoading === 'function') hideLoading();
        if (typeof showToast === 'function') showToast('添加AI对手失败: ' + (botRes?.error || '未知错误'), 'error');
        GameState._tutorial = null;
        return;
      }

      console.log('[教程] Bot 已加入');

      // 3. 开始游戏
      socket.emit('game:start', res.roomId, (startRes) => {
        if (typeof hideLoading === 'function') hideLoading();

        if (!startRes || !startRes.success) {
          if (typeof showToast === 'function') showToast('开始游戏失败: ' + (startRes?.error || '未知错误'), 'error');
          GameState._tutorial = null;
          return;
        }

        console.log('[教程] 游戏已开始！');
        if (typeof showToast === 'function') showToast('🎓 新手教程开始！跟着引导一步步操作吧~', 'info');
      });
    });
  });
}

/**
 * 教程结束——显示完成页面
 */
function renderTutorialComplete() {
  if (!GameState._tutorial || GameState._tutorial.completed) return '';

  GameState._tutorial.completed = true;
  if (typeof playSound === 'function') playSound('victory');

  return `
    <div class="tutorial-complete">
      <div class="tutorial-complete-icon">🎉</div>
      <div class="tutorial-complete-title">教程完成！</div>
      <div class="tutorial-complete-text">
        你已经体验了一局完整的极速对局！<br>
        现在可以开始真正的对战了～
      </div>
      <button class="btn btn-primary" onclick="finishTutorial()" style="margin-top:12px;">🎮 开始真正的游戏</button>
      <button class="btn btn-outline" onclick="finishTutorial()" style="margin-top:8px;display:block;width:100%;">回到模式选择</button>
    </div>
  `;
}

/**
 * 退出教程
 */
function finishTutorial() {
  GameState._tutorial = null;
  // 清理聚光灯引导
  if (window.TutorialGuide) TutorialGuide.reset();
  // 如果在游戏中，离开房间（room:left 事件会自动切到模式选择）
  if (GameState.roomId) {
    socket.emit('room:leave', GameState.roomId);
  } else {
    goToMode();
  }
}

// -------------------- 绑定事件 --------------------

document.addEventListener('DOMContentLoaded', () => {
  const btnHowToPlay = document.getElementById('btnHowToPlay');
  if (btnHowToPlay) {
    btnHowToPlay.addEventListener('click', openTutorialModal);
  }
});

// 点击遮罩关闭教程弹窗
document.addEventListener('click', (e) => {
  const modal = document.getElementById('tutorialModal');
  if (e.target === modal) closeTutorialModal();
});
