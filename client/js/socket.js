// ============================================================
// socket.js — Socket.IO 连接管理（JWT 鉴权 + 断线重连）
// ============================================================

const SERVER_URL = window.location.origin;

let socket = null;

/** 建立/恢复 Socket.IO 连接 */
function connectSocket() {
  if (socket && socket.connected) return socket;

  const token = typeof getAuthToken === 'function' ? getAuthToken() : null;
  if (!token) {
    console.warn('[Socket] 无 JWT token，延迟连接');
    return null;
  }

  socket = io(SERVER_URL, {
    auth: { token },
    reconnection: true,
    reconnectionAttempts: 10,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 5000,
    timeout: 20000,
  });

  // -------------------- 连接事件 --------------------

  socket.on('connect', () => {
    console.log('[Socket] 已连接:', socket.id);
    hideToast();
    hideLoading();
    showToast('已连接到服务器', 'info');
  });

  socket.on('disconnect', (reason) => {
    console.log('[Socket] 断开连接:', reason);
    if (_intentionalDisconnect) {
      _intentionalDisconnect = false;
      return; // 主动退出不触发重连提示
    }
    showLoading('连接中断，重连中…');
    showToast('与服务器断开连接，正在重连…', 'error');
  });

  socket.on('reconnect_attempt', (attempt) => {
    console.log('[Socket] 重连尝试 #' + attempt);
  });

  socket.on('reconnect', () => {
    console.log('[Socket] 重连成功');
    showToast('已重新连接', 'info');
    // 重连后重新加入房间（如果之前在房间中）
    if (GameState.roomId) {
      const skin = typeof getSkinBundle === 'function' ? getSkinBundle() : {};
      socket.emit('room:join', GameState.roomId, skin, (res) => {
        if (res && res.success) {
          console.log('[Socket] 重连后已重新加入房间:', GameState.roomId);
        }
      });
    }
  });

  socket.on('reconnect_error', (error) => {
    console.error('[Socket] 重连失败:', error);
  });

  socket.on('reconnect_failed', () => {
    console.error('[Socket] 重连次数用尽');
    showToast('无法连接到服务器，请刷新页面', 'error');
  });

  // 连接错误：token 过期等
  socket.on('connect_error', (err) => {
    console.error('[Socket] 连接错误:', err.message);
    if (err.message === '登录已过期' || err.message === '未登录') {
      if (typeof clearAuthToken === 'function') clearAuthToken();
      showView('start');
    }
  });

  return socket;
}

/** 主动断开 Socket 连接（不触发重连提示） */
let _intentionalDisconnect = false;

function disconnectSocket() {
  if (socket) {
    _intentionalDisconnect = true; // 标记为主动退出，不触发重连提示
    socket.disconnect();
    socket = null;
  }
}

// -------------------- Toast 工具函数 --------------------

let toastTimer = null;

function showToast(msg, type) {
  const toast = document.getElementById('connectionToast');
  const text = document.getElementById('toastText');
  if (!toast || !text) return;

  toast.className = 'toast ' + type + ' show';
  text.textContent = msg;

  // 错误提示音
  if (type === 'error' && typeof playSound === 'function') {
    playSound('error');
  }

  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    toast.classList.remove('show');
  }, 2500);
}

function hideToast() {
  const toast = document.getElementById('connectionToast');
  if (toast) toast.classList.remove('show');
}

// -------------------- Loading Overlay --------------------

function showLoading(msg) {
  const existing = document.getElementById('loadingOverlay');
  if (existing) return;
  const overlay = document.createElement('div');
  overlay.id = 'loadingOverlay';
  overlay.className = 'loading-overlay';
  overlay.innerHTML = `
    <div class="loading-spinner"></div>
    <div class="loading-text">${msg || '连接中…'}</div>
  `;
  document.body.appendChild(overlay);
}

function hideLoading() {
  const overlay = document.getElementById('loadingOverlay');
  if (overlay) overlay.remove();
}
