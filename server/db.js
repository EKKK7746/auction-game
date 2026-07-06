'use strict';

const path = require('path');
const Database = require('better-sqlite3');

const DB_PATH = path.join(__dirname, 'data', 'auction.db');

let _db = null;

function getDb() {
  if (_db) return _db;

  // 确保 data 目录存在
  const fs = require('fs');
  const dir = path.dirname(DB_PATH);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  _db = new Database(DB_PATH);

  // WAL 模式提升并发性能
  _db.pragma('journal_mode = WAL');
  _db.pragma('foreign_keys = ON');

  // 创建用户表
  _db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      nickname TEXT NOT NULL,
      password_hash TEXT NOT NULL,
      created_at INTEGER DEFAULT (unixepoch()),
      last_login_at INTEGER
    )
  `);

  // 创建收集数据表
  _db.exec(`
    CREATE TABLE IF NOT EXISTS collection_data (
      user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      data TEXT NOT NULL,
      updated_at INTEGER DEFAULT (unixepoch())
    )
  `);

  return _db;
}

module.exports = { getDb };
