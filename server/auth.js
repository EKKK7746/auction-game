'use strict';

const { Router } = require('express');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { getDb } = require('./db');

const router = Router();

// JWT 密钥：优先使用环境变量，开发环境自动生成
const JWT_SECRET = process.env.JWT_SECRET || crypto.randomBytes(32).toString('hex');
const JWT_EXPIRY = '30d';
const BCRYPT_ROUNDS = 10;

// 导出 JWT_SECRET 供其他模块使用
router.JWT_SECRET = JWT_SECRET;

// ==================== 工具函数 ====================

/** 生成 JWT */
function signToken(userId, username, nickname) {
  return jwt.sign(
    { userId, username, nickname },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRY }
  );
}

/** 验证 JWT，返回 decoded payload 或 null */
function verifyToken(token) {
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch {
    return null;
  }
}

// 导出验证函数供 index.js 使用
router.verifyToken = verifyToken;

/** 从 Authorization header 提取 token */
function extractToken(req) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) return null;
  return header.slice(7);
}

// ==================== 输入校验 ====================

const USERNAME_RE = /^[\w\u4e00-\u9fff]{2,20}$/;  // 2-20字符，字母数字下划线中文
const NICKNAME_RE = /^.{0,8}$/u;                    // 0-8任意字符（可选，u flag 支持完整 Unicode）
const PASSWORD_MIN = 6;

/** 校验并返回错误消息，无错误返回 null */
function validateInput(username, password, nickname) {
  if (!username || !USERNAME_RE.test(username)) {
    return '用户名需 2-20 字符（字母、数字、下划线、中文）';
  }
  if (!password || password.length < PASSWORD_MIN) {
    return `密码长度至少 ${PASSWORD_MIN} 位`;
  }
  if (nickname !== undefined && nickname !== null && nickname !== '' && !NICKNAME_RE.test(nickname)) {
    return '昵称需 2-8 字符';
  }
  return null;
}

// ==================== 端点 ====================

/** POST /api/auth/register — 注册 */
router.post('/register', (req, res) => {
  const { username, password, nickname } = req.body;

  const err = validateInput(username, password, nickname);
  if (err) return res.status(400).json({ error: err });

  // 昵称默认等于用户名（如果没传）
  const displayName = nickname || username;

  const db = getDb();

  // 检查用户名是否已存在
  const existing = db.prepare('SELECT id FROM users WHERE username = ?').get(username);
  if (existing) {
    return res.status(409).json({ error: '用户名已被占用' });
  }

  // 哈希密码并插入
  const hash = bcrypt.hashSync(password, BCRYPT_ROUNDS);
  const result = db.prepare(
    'INSERT INTO users (username, nickname, password_hash, created_at, last_login_at) VALUES (?, ?, ?, unixepoch(), unixepoch())'
  ).run(username, displayName, hash);

  const userId = result.lastInsertRowid;
  const token = signToken(userId, username, displayName);

  res.json({ token, username, nickname: displayName, userId });
});

/** POST /api/auth/login — 登录 */
router.post('/login', (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ error: '请输入用户名和密码' });
  }

  const db = getDb();
  const user = db.prepare(
    'SELECT id, username, nickname, password_hash FROM users WHERE username = ?'
  ).get(username);

  if (!user) {
    return res.status(401).json({ error: '用户名或密码错误' });
  }

  if (!bcrypt.compareSync(password, user.password_hash)) {
    return res.status(401).json({ error: '用户名或密码错误' });
  }

  // 更新最后登录时间
  db.prepare('UPDATE users SET last_login_at = unixepoch() WHERE id = ?').run(user.id);

  const token = signToken(user.id, user.username, user.nickname);

  res.json({ token, username: user.username, nickname: user.nickname, userId: user.id });
});

/** POST /api/auth/verify — 验证 token 有效性（用于页面刷新恢复登录态） */
router.post('/verify', (req, res) => {
  const token = extractToken(req);
  if (!token) {
    return res.status(401).json({ valid: false, error: '未提供 token' });
  }

  const decoded = verifyToken(token);
  if (!decoded) {
    return res.status(401).json({ valid: false, error: 'token 无效或已过期' });
  }

  res.json({ valid: true, username: decoded.username, nickname: decoded.nickname, userId: decoded.userId });
});

/** PUT /api/auth/nickname — 修改昵称（需登录） */
router.put('/nickname', (req, res) => {
  const token = extractToken(req);
  if (!token) return res.status(401).json({ error: '未登录' });

  const decoded = verifyToken(token);
  if (!decoded) return res.status(401).json({ error: '登录已过期' });

  const { nickname } = req.body;
  if (!nickname || !NICKNAME_RE.test(nickname)) {
    return res.status(400).json({ error: '昵称需 2-8 字符' });
  }

  const db = getDb();
  db.prepare('UPDATE users SET nickname = ? WHERE id = ?').run(nickname, decoded.userId);

  // 签发新 token 包含新昵称
  const newToken = signToken(decoded.userId, decoded.username, nickname);

  res.json({ token: newToken, nickname });
});

module.exports = router;
