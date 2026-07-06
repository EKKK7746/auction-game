'use strict';

const { Router } = require('express');
const { getDb } = require('./db');
const { verifyToken } = require('./auth');

const router = Router();

/** 从 Authorization header 提取 token */
function extractToken(req) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) return null;
  return header.slice(7);
}

/** JWT 认证中间件 */
function authMiddleware(req, res, next) {
  const token = extractToken(req);
  if (!token) return res.status(401).json({ error: '未登录' });

  const decoded = verifyToken(token);
  if (!decoded) return res.status(401).json({ error: '登录已过期' });

  req.userId = decoded.userId;
  next();
}

// ==================== 端点 ====================

/** GET /api/sync/collection — 拉取收集数据 */
router.get('/collection', authMiddleware, (req, res) => {
  const db = getDb();
  const row = db.prepare('SELECT data, updated_at FROM collection_data WHERE user_id = ?').get(req.userId);

  if (!row) {
    // 没有数据，返回 null（客户端会用默认空数据）
    return res.json({ data: null });
  }

  res.json({ data: JSON.parse(row.data), updatedAt: row.updated_at });
});

/** POST /api/sync/collection — 上传收集数据 */
router.post('/collection', authMiddleware, (req, res) => {
  const { data } = req.body;
  if (!data || typeof data !== 'object') {
    return res.status(400).json({ error: '无效数据' });
  }

  const db = getDb();
  const json = JSON.stringify(data);

  db.prepare(`
    INSERT INTO collection_data (user_id, data, updated_at)
    VALUES (?, ?, unixepoch())
    ON CONFLICT(user_id) DO UPDATE SET data = excluded.data, updated_at = unixepoch()
  `).run(req.userId, json);

  res.json({ success: true });
});

module.exports = router;
