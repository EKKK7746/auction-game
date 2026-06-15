// ============================================================
// router.js — 视图切换（登录 / 大厅 / 游戏）
// ============================================================

const Views = {
  LOGIN: 'login',
  LOBBY: 'lobby',
  ROOM_WAIT: 'room-wait',
  GAME: 'game',
};

/**
 * 切换到指定视图
 * @param {'login'|'lobby'|'game'} viewName
 */
function showView(viewName) {
  // 隐藏所有视图
  document.querySelectorAll('.view').forEach(v => {
    v.classList.remove('active');
  });

  // 显示目标视图
  const target = document.getElementById('view-' + viewName);
  if (target) {
    target.classList.add('active');
    GameState.currentView = viewName;
    console.log('[Router] 切换到视图:', viewName);
  } else {
    console.error('[Router] 视图不存在:', viewName);
  }
}

/**
 * 返回登录页并重置状态
 */
function backToLogin() {
  GameState.reset();     // 不再清空 nickname
  showView(Views.LOGIN);

  // 保留昵称：从 GameState 回填到输入框
  const nicknameInput = document.getElementById('nicknameInput');
  const roomInput = document.getElementById('roomInput');
  const loginError = document.getElementById('loginError');
  if (nicknameInput && GameState.nickname) {
    nicknameInput.value = GameState.nickname;
  } else if (nicknameInput) {
    // 如果 GameState.nickname 也空了，尝试从 localStorage 恢复
    const saved = JSON.parse(localStorage.getItem('mwPlayer') || '{}');
    if (saved.nickname) {
      nicknameInput.value = saved.nickname;
      GameState.nickname = saved.nickname;
    }
  }
  if (roomInput) roomInput.value = '';
  if (loginError) loginError.textContent = '';

  updateLoginButtons();
}
