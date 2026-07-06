// ============================================================
// auth.js — 账户系统：登录/注册/Token管理/云端数据同步
// ============================================================

const AUTH_TOKEN_KEY = 'mwAuthToken';

// ==================== Token 管理 ====================

function getAuthToken() {
  return localStorage.getItem(AUTH_TOKEN_KEY);
}

function setAuthToken(token) {
  localStorage.setItem(AUTH_TOKEN_KEY, token);
}

function clearAuthToken() {
  localStorage.removeItem(AUTH_TOKEN_KEY);
}

function isLoggedIn() {
  return !!getAuthToken();
}

/** 从 token 解码用户信息（不验证有效期，仅读取 payload） */
function getAuthUser() {
  const token = getAuthToken();
  if (!token) return null;
  try {
    const payload = JSON.parse(atob(token.split('.')[1]));
    return { userId: payload.userId, username: payload.username, nickname: payload.nickname };
  } catch {
    return null;
  }
}

// ==================== API 调用 ====================

async function authFetch(url, options = {}) {
  const token = getAuthToken();
  const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
  if (token) {
    headers['Authorization'] = 'Bearer ' + token;
  }
  const res = await fetch(url, { ...options, headers });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error || '请求失败');
  }
  return data;
}

/** 注册 */
async function authRegister(username, password, nickname) {
  const data = await authFetch('/api/auth/register', {
    method: 'POST',
    body: JSON.stringify({ username, password, nickname: nickname || username }),
  });
  setAuthToken(data.token);
  return data;
}

/** 登录 */
async function authLogin(username, password) {
  const data = await authFetch('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ username, password }),
  });
  setAuthToken(data.token);
  return data;
}

/** 验证 token 有效性 */
async function authVerify() {
  try {
    const data = await authFetch('/api/auth/verify', { method: 'POST' });
    return data;
  } catch {
    clearAuthToken();
    return null;
  }
}

/** 修改昵称 */
async function authUpdateNickname(nickname) {
  const data = await authFetch('/api/auth/nickname', {
    method: 'PUT',
    body: JSON.stringify({ nickname }),
  });
  setAuthToken(data.token);
  return data;
}

// ==================== 数据同步 ====================

/** 从服务端拉取收集数据 */
async function syncPullCollection() {
  try {
    const data = await authFetch('/api/sync/collection');
    return data.data; // null 表示服务端无数据
  } catch {
    return null;
  }
}

/** 上传收集数据到服务端 */
async function syncPushCollection(collectionData) {
  try {
    await authFetch('/api/sync/collection', {
      method: 'POST',
      body: JSON.stringify({ data: collectionData }),
    });
    return true;
  } catch {
    return false;
  }
}

/** 登录后同步：拉取服务端数据并与本地合并 */
async function syncAfterLogin(localCollection) {
  const serverData = await syncPullCollection();

  if (!serverData) {
    // 服务端无数据 → 上传本地数据
    if (localCollection) {
      await syncPushCollection(localCollection);
    }
    return localCollection || null;
  }

  // 服务端有数据 → 使用服务端数据（优先）
  // 但保留本地未被服务端覆盖的新解锁（以防万一）
  return serverData;
}

// ==================== Auth 页面 UI ====================

let _authTab = 'login'; // 'login' | 'register'

function renderAuthPage() {
  const container = document.getElementById('view-auth');
  if (!container) return;

  container.innerHTML = `
    <div class="auth-container">
      <div class="auth-card">
        <div class="auth-header">
          <div class="auth-logo">🏺</div>
          <h2 class="auth-title">琳 琅</h2>
          <p class="auth-subtitle">华夏千年 · 珍宝博弈</p>
        </div>

        <div class="auth-tabs">
          <button class="auth-tab ${_authTab === 'login' ? 'active' : ''}" onclick="switchAuthTab('login')">登录</button>
          <button class="auth-tab ${_authTab === 'register' ? 'active' : ''}" onclick="switchAuthTab('register')">注册</button>
        </div>

        <div class="auth-form" id="authFormContainer">
          ${_authTab === 'login' ? _renderLoginForm() : _renderRegisterForm()}
        </div>

        <p class="auth-error" id="authError"></p>
      </div>
    </div>
  `;

  // 绑定表单事件
  setTimeout(() => {
    if (_authTab === 'login') {
      _bindLoginForm();
    } else {
      _bindRegisterForm();
    }
  }, 0);
}

function switchAuthTab(tab) {
  _authTab = tab;
  renderAuthPage();
}

function _renderLoginForm() {
  return `
    <div class="auth-field">
      <label>用户名</label>
      <input type="text" id="authUsername" class="input-primary" placeholder="输入用户名" maxlength="20" autocomplete="username">
    </div>
    <div class="auth-field">
      <label>密码</label>
      <input type="password" id="authPassword" class="input-primary" placeholder="输入密码" autocomplete="current-password">
    </div>
    <button id="btnAuthLogin" class="btn btn-primary btn-auth-submit" disabled>登录</button>
    <p class="auth-hint">没有账号？<a href="#" onclick="switchAuthTab('register'); return false;">立即注册</a></p>
  `;
}

function _renderRegisterForm() {
  return `
    <div class="auth-field">
      <label>用户名</label>
      <input type="text" id="authUsername" class="input-primary" placeholder="2-20字符（字母、数字、下划线、中文）" maxlength="20" autocomplete="username">
    </div>
    <div class="auth-field">
      <label>游戏昵称 <span class="auth-label-hint">（游戏内显示名）</span></label>
      <input type="text" id="authNickname" class="input-primary" placeholder="2-8字符" maxlength="8">
    </div>
    <div class="auth-field">
      <label>密码</label>
      <input type="password" id="authPassword" class="input-primary" placeholder="至少6位密码" autocomplete="new-password">
    </div>
    <button id="btnAuthRegister" class="btn btn-primary btn-auth-submit" disabled>注册</button>
    <p class="auth-hint">已有账号？<a href="#" onclick="switchAuthTab('login'); return false;">立即登录</a></p>
  `;
}

function _bindLoginForm() {
  const usernameEl = document.getElementById('authUsername');
  const passwordEl = document.getElementById('authPassword');
  const btnEl = document.getElementById('btnAuthLogin');

  function updateBtn() {
    const u = (usernameEl.value || '').trim();
    const p = (passwordEl.value || '');
    btnEl.disabled = u.length < 2 || p.length < 6;
  }

  usernameEl.addEventListener('input', updateBtn);
  passwordEl.addEventListener('input', updateBtn);

  btnEl.addEventListener('click', async () => {
    const username = usernameEl.value.trim();
    const password = passwordEl.value;
    btnEl.disabled = true;
    btnEl.textContent = '登录中...';
    document.getElementById('authError').textContent = '';

    try {
      const data = await authLogin(username, password);
      await _onAuthSuccess(data);
    } catch (err) {
      document.getElementById('authError').textContent = err.message;
      btnEl.disabled = false;
      btnEl.textContent = '登录';
    }
  });

  // 回车提交
  passwordEl.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !btnEl.disabled) btnEl.click();
  });
}

function _bindRegisterForm() {
  const usernameEl = document.getElementById('authUsername');
  const nicknameEl = document.getElementById('authNickname');
  const passwordEl = document.getElementById('authPassword');
  const btnEl = document.getElementById('btnAuthRegister');

  function updateBtn() {
    const u = (usernameEl.value || '').trim();
    const n = (nicknameEl.value || '').trim();
    const p = (passwordEl.value || '');
    btnEl.disabled = u.length < 2 || n.length < 2 || p.length < 6;
  }

  usernameEl.addEventListener('input', updateBtn);
  nicknameEl.addEventListener('input', updateBtn);
  passwordEl.addEventListener('input', updateBtn);

  btnEl.addEventListener('click', async () => {
    const username = usernameEl.value.trim();
    const nickname = nicknameEl.value.trim() || username;
    const password = passwordEl.value;
    btnEl.disabled = true;
    btnEl.textContent = '注册中...';
    document.getElementById('authError').textContent = '';

    try {
      const data = await authRegister(username, password, nickname);
      await _onAuthSuccess(data);
    } catch (err) {
      document.getElementById('authError').textContent = err.message;
      btnEl.disabled = false;
      btnEl.textContent = '注册';
    }
  });

  // 回车提交
  passwordEl.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !btnEl.disabled) btnEl.click();
  });
}

/** 登录/注册成功后：同步数据 → 更新 GameState → 跳转 */
async function _onAuthSuccess(data) {
  // 1. 更新 GameState
  GameState.nickname = data.nickname;
  GameState.authUser = { userId: data.userId, username: data.username, nickname: data.nickname };

  // 2. 建立 Socket.IO 连接（带 JWT token）
  if (typeof connectSocket === 'function') {
    const s = connectSocket();
    if (!s) {
      showView(Views.AUTH);
      renderAuthPage();
      document.getElementById('authError').textContent = '连接服务器失败，请重试';
      return;
    }
  }

  // 3. 同步收集数据
  try {
    const localData = (typeof _loadCollection === 'function') ? _loadCollection() : null;
    const merged = await syncAfterLogin(localData);
    if (merged && typeof _saveCollectionRaw === 'function') {
      _saveCollectionRaw(merged);
    }
  } catch {
    // 同步失败不影响继续使用
  }

  // 4. 跳转到房间页面
  showView(Views.LOGIN);
  // 预填昵称
  const nickInput = document.getElementById('nicknameInput');
  if (nickInput) nickInput.value = data.nickname;
  if (typeof updateLoginButtons === 'function') updateLoginButtons();
}

/** 退出登录 */
function doLogout() {
  clearAuthToken();
  GameState.nickname = '';
  GameState.authUser = null;
  if (typeof disconnectSocket === 'function') {
    disconnectSocket();
  }
  showView(Views.START);
}
