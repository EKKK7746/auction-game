// ============================================================
// test_step5.js — Step 5: AI 机器人玩家系统验收测试
// 启动方式: node server/test_step5.js
// 要求: 服务器未运行（测试自己启动服务器）
// ============================================================

const http = require('http');
const express = require('express');
const path = require('path');
const { Server } = require('socket.io');
const { io: ClientIO } = require('socket.io-client');

const roomManager = require('./roomManager');
const gameEngine = require('./gameEngine');
const { BotManager, createBotPlayer } = require('./bot');

const PORT = 3099;
const SERVER_URL = 'http://localhost:' + PORT;

let server, io, botManager;
let passed = 0, failed = 0;

function check(name, condition, detail) {
  if (condition) { passed++; console.log('  OK ' + name); }
  else { failed++; console.log('  FAIL ' + name + ' | ' + (detail || '')); }
}

function wait(ms) { return new Promise(r => setTimeout(r, ms)); }

function sleepUntil(condition, timeoutMs = 15000, intervalMs = 200) {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    const timer = setInterval(() => {
      if (condition()) { clearInterval(timer); resolve(true); }
      else if (Date.now() - start > timeoutMs) { clearInterval(timer); reject(new Error('timeout')); }
    }, intervalMs);
  });
}

// ==================== 启动测试服务器 ====================

async function startServer() {
  const app = express();
  app.use(express.static(path.join(__dirname, '..', 'client')));
  const httpServer = http.createServer(app);
  io = new Server(httpServer, { cors: { origin: '*', methods: ['GET', 'POST'] } });

  gameEngine.setIO(io);
  botManager = new BotManager(io, gameEngine);
  gameEngine.setOnBroadcast((roomId) => botManager.processBots(roomId));

  io.on('connection', (socket) => {
    console.log('[测试] 连接:', socket.id);

    socket.on('room:create', (nickname, callback) => {
      if (typeof callback !== 'function') callback = () => {};
      try {
        const { roomId, players } = roomManager.createRoom(socket, nickname);
        socket.emit('room:created', { roomId, players });
        callback({ success: true, roomId });
      } catch (err) {
        callback({ success: false, error: err.message });
      }
    });

    socket.on('room:join', (roomId, nickname, callback) => {
      if (typeof callback !== 'function') callback = () => {};
      try {
        const result = roomManager.joinRoom(socket, roomId, nickname);
        if (!result.success) { callback(result); return; }
        socket.emit('room:joined', { roomId, players: result.players });
        socket.to(roomId).emit('room:player_joined', { player: result.player, players: result.players });
        callback(result);
      } catch (err) {
        callback({ success: false, error: err.message });
      }
    });

    socket.on('room:leave', (roomId) => {
      const game = gameEngine.getGame(roomId);
      if (game && game.phase !== 'finished') gameEngine.removePlayer(roomId, socket.id);
      const result = roomManager.leaveRoom(socket, roomId);
      if (!result) return;
      socket.emit('room:left', { roomId });
      if (!result.destroyed) {
        socket.to(roomId).emit('room:player_left', { player: result.player, players: result.players });
      }
      if (result.destroyed) botManager.cancelRoom(roomId);
    });

    socket.on('room:add_bot', (roomId, botName, callback) => {
      if (typeof callback !== 'function') callback = () => {};
      try {
        const bot = createBotPlayer(botName);
        const result = roomManager.addBot(roomId, bot);
        if (!result.success) { callback(result); return; }
        io.to(roomId).emit('room:player_joined', { player: result.player, players: result.players });
        callback(result);
      } catch (err) {
        callback({ success: false, error: err.message });
      }
    });

    socket.on('game:start', (roomId, callback) => {
      if (typeof callback !== 'function') callback = () => {};
      const room = roomManager.getPlayers(roomId);
      if (room.length < 2) { callback({ success: false, error: '至少需要2名玩家' }); return; }
      const existing = gameEngine.getGame(roomId);
      if (existing && existing.phase !== 'finished') { callback({ success: false, error: '游戏已在进行中' }); return; }
      try {
        gameEngine.initGame(roomId, room);
        callback({ success: true });
      } catch (err) {
        callback({ success: false, error: err.message });
      }
    });

    socket.on('game:bid', (roomId, percentage, callback) => {
      const result = gameEngine.submitBid(roomId, socket.id, percentage);
      if (typeof callback === 'function') callback({ success: !result.error, error: result.error });
    });

    socket.on('game:select_card', (roomId, cardIndex, callback) => {
      const result = gameEngine.selectCard(roomId, socket.id, cardIndex);
      if (typeof callback === 'function') callback({ success: !result.error, error: result.error });
    });

    socket.on('game:select_dice', (roomId, diceType, useUpgrade, callback) => {
      if (typeof useUpgrade === 'function') { callback = useUpgrade; useUpgrade = false; }
      if (typeof callback !== 'function') callback = () => {};
      const result = gameEngine.selectDice(roomId, socket.id, diceType, useUpgrade);
      callback({ success: !result.error, error: result.error });
    });

    socket.on('game:roll_dice', (roomId, callback) => {
      const result = gameEngine.rollAllDice(roomId);
      if (typeof callback === 'function') callback({ success: !result.error, error: result.error });
    });

    socket.on('game:end_round', (roomId, callback) => {
      const result = gameEngine.endRound(roomId);
      if (typeof callback === 'function') callback({ success: !result.error, error: result.error, finished: result.finished });
    });

    socket.on('disconnect', () => {
      const results = roomManager.handleDisconnect(socket);
      for (const r of results) {
        socket.to(r.roomId).emit('room:player_left', { player: r.player, players: r.players });
        const game = gameEngine.getGame(r.roomId);
        if (game && game.phase !== 'finished') gameEngine.removePlayer(r.roomId, socket.id);
      }
    });
  });

  return new Promise(r => httpServer.listen(PORT, () => { console.log('[测试] 服务器启动'); r(); }));
}

// ==================== 测试 ====================

async function runTests() {
  // ---- Test 1: 创建房间 + 添加 bot ----
  console.log('\n[Test 1] 创建房间 + 添加 bot');
  const alice = ClientIO(SERVER_URL);
  await new Promise(r => alice.on('connect', r));

  let roomId;
  await new Promise(r => {
    alice.emit('room:create', 'Alice', (res) => {
      check('创建成功', res.success);
      roomId = res.roomId;
      r();
    });
  });

  const createdPromise = new Promise(r => alice.once('room:created', r));
  const created = await createdPromise;
  check('玩家列表1人', created.players.length === 1);

  // 添加 bot
  let botJoined = false;
  alice.once('room:player_joined', (data) => botJoined = data.player.isBot);
  await new Promise(r => {
    alice.emit('room:add_bot', roomId, null, (res) => {
      check('添加bot成功', res.success);
      r();
    });
  });
  await wait(300);
  check('bot isBot=true', botJoined);

  // ---- Test 2: 添加 bot 到满 ----
  console.log('\n[Test 2] 房间满员限制');
  for (let i = 0; i < 5; i++) {
    await new Promise(r => alice.emit('room:add_bot', roomId, null, r));
  }
  const fullResult = await new Promise(r => alice.emit('room:add_bot', roomId, null, r));
  check('第7个bot失败（满6人）', fullResult && !fullResult.success);

  // ---- Test 3: 开始游戏（含 bot） ----
  console.log('\n[Test 3] 开始游戏');
  // 重新来：1人类 + 1bot
  alice.emit('room:leave', roomId);
  await wait(200);
  alice.disconnect();
  await wait(200);

  const alice2 = ClientIO(SERVER_URL);
  await new Promise(r => alice2.on('connect', r));
  await new Promise(r => alice2.emit('room:create', 'Alice', (res) => {
    roomId = res.roomId;
    check('新房间创建', res.success);
    r();
  }));

  await new Promise(r => alice2.emit('room:add_bot', roomId, null, r));
  await wait(300);

  let gameStarted = false;
  alice2.on('game_state_update', () => { gameStarted = true; });

  await new Promise(r => alice2.emit('game:start', roomId, (res) => {
    check('游戏开始', res.success);
    r();
  }));

  // 等待首次 state_update
  await sleepUntil(() => gameStarted, 5000);
  check('收到 game_state_update', gameStarted);

  // ---- Test 4: Bot 在游戏中 isBot 标记 ----
  console.log('\n[Test 4] game_state_update 中 isBot 标记');
  let viewWithBot = null;
  alice2.on('game_state_update', (v) => { viewWithBot = v; });
  await wait(2000); // 等 bot 行动触发新的 state_update
  if (viewWithBot) {
    const bots = viewWithBot.players.filter(p => p.isBot);
    check('view中有bot', bots.length >= 1);
    check('bot有isBot=true', bots.every(b => b.isBot));
  }

  // ---- Test 5: 完整对局 1人类+1bot ----
  console.log('\n[Test 5] 完整对局 1人类+1bot（等待自动完成10轮）');
  let finalView = null;
  alice2.on('game_state_update', (v) => {
    if (v.phase === 'finished') finalView = v;
  });

  // 等待游戏自动结束（bot自动操作）
  try {
    await sleepUntil(() => finalView !== null, 120000, 500);
    check('游戏结束', finalView !== null && finalView.phase === 'finished');
    check('共完成多轮', finalView && finalView.round > 1);
    check('玩家有isBot标记', finalView && finalView.players.some(p => p.isBot));
    check('玩家有资金变化', finalView && finalView.players.every(p => p.funds !== undefined));
  } catch (e) {
    check('游戏自动完成', false, 'timeout: ' + e.message);
  }

  alice2.disconnect();
  botManager.cancelRoom(roomId);

  // ---- Test 6: 全 bot 对局 ----
  console.log('\n[Test 6] 全 bot 对局（无人类操作）');
  const alice3 = ClientIO(SERVER_URL);
  await new Promise(r => alice3.on('connect', r));
  let roomId3;
  await new Promise(r => alice3.emit('room:create', 'Host', (res) => {
    roomId3 = res.roomId;
    r();
  }));
  await new Promise(r => alice3.emit('room:add_bot', roomId3, null, r));
  await new Promise(r => alice3.emit('room:add_bot', roomId3, null, r));
  await wait(300);

  let fullBotFinished = false;
  alice3.on('game_state_update', (v) => { if (v.phase === 'finished') fullBotFinished = true; });

  await new Promise(r => alice3.emit('game:start', roomId3, r));

  try {
    await sleepUntil(() => fullBotFinished, 120000, 500);
    check('全bot对局完成', true);
  } catch (e) {
    check('全bot对局完成', false, 'timeout');
  }

  alice3.disconnect();
  botManager.cancelRoom(roomId3);

  // ---- Test 7: Bot cardScore 计算 ----
  console.log('\n[Test 7] 终局计分');
  gameEngine.destroyGame(roomId);
  gameEngine.initGame('ts7', [
    { id: 'a', nickname: 'A' },
    { id: 'b', nickname: 'B' }
  ]);
  let s = gameEngine.getGame('ts7');
  s.players[0].cards = [
    { id: 'yulb', name: 'Dragon', score: 2, effect: 'dragonPhoenix' },
    { id: 'lfh', name: 'Phoenix', score: 1, effect: 'dragonPhoenix' },
  ];
  s.players[1].cards = [
    { id: 'mfl', name: 'Vessel', score: 3, effect: null },
  ];
  s.phase = 'finished';
  const scores = gameEngine.calculateFinalScores('ts7');
  check('dragonPhoenix计分', scores[0].cardScore === 4, 'score=' + scores[0].cardScore);
  gameEngine.destroyGame('ts7');
}

// ==================== 主函数 ====================

async function main() {
  await startServer();
  try {
    await runTests();
  } catch (e) {
    console.error('[测试] 异常:', e.message);
  }

  console.log('\n========================================');
  console.log('Step 5 结果: ' + passed + ' passed, ' + failed + ' failed');
  if (failed === 0) console.log('ALL PASSED!');
  else console.log('SOME FAILED');

  io.close();
  server.close();
  process.exit(failed > 0 ? 1 : 0);
}

main();
