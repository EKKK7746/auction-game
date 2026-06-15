// ============================================================
// test_script.js - Step 1 自动化验收脚本
// ============================================================

const { io } = require('socket.io-client');
const SERVER = 'http://localhost:3000';

let passed = 0, failed = 0;
function check(name, condition) {
  if (condition) { passed++; console.log(`  ✅ ${name}`); }
  else { failed++; console.log(`  ❌ ${name}`); }
}

async function test() {
  console.log('==========================================');
  console.log('🏺 Step 1 自动化验收测试');
  console.log('==========================================\n');

  // === 测试1: 创建房间 ===
  console.log('[测试1] 创建房间...');
  const alice = io(SERVER);
  await new Promise(r => alice.on('connect', r));

  // 先注册监听，再发送
  const createdPromise = new Promise(r => alice.once('room:created', r));
  const createResult = await new Promise((resolve) => {
    alice.emit('room:create', '火麟飞', (res) => resolve(res));
  });
  check('创建房间回调返回 success', createResult.success === true);
  check('返回了6位房间号', createResult.roomId && createResult.roomId.length === 6);
  const roomId = createResult.roomId;

  const createdData = await createdPromise;
  check('收到 room:created 事件', createdData.roomId === roomId);
  check('玩家列表包含1人', createdData.players.length === 1);
  check('玩家昵称为火麟飞', createdData.players[0].nickname === '火麟飞');
  check('火麟飞是房主', createdData.players[0].isHost === true);
  console.log(`    房间号: ${roomId}\n`);

  // === 测试2: 加入房间 ===
  console.log('[测试2] 加入房间...');
  const bob = io(SERVER);
  await new Promise(r => bob.on('connect', r));

  // 先注册 Alice 的 player_joined 监听
  const playerJoinedPromise = new Promise(r => alice.once('room:player_joined', r));
  const joinedPromise = new Promise(r => bob.once('room:joined', r));

  const joinResult = await new Promise((resolve) => {
    bob.emit('room:join', roomId, '悲伤的菠萝', (res) => resolve(res));
  });
  check('加入房间回调返回 success', joinResult.success === true);
  check('返回玩家列表包含2人', joinResult.players.length === 2);

  const joinedData = await joinedPromise;
  check('Bob收到 room:joined', joinedData.roomId === roomId);
  check('joined 玩家列表包含2人', joinedData.players.length === 2);

  const pJoinedData = await playerJoinedPromise;
  check('Alice收到 room:player_joined', pJoinedData.player.nickname === '悲伤的菠萝');
  check('player_joined 玩家列表包含2人', pJoinedData.players.length === 2);
  console.log('');

  // === 测试3: 加入不存在的房间 ===
  console.log('[测试3] 加入不存在的房间...');
  const charlie = io(SERVER);
  await new Promise(r => charlie.on('connect', r));

  const badJoin = await new Promise((resolve) => {
    charlie.emit('room:join', '999999', '路人甲', (res) => resolve(res));
  });
  check('加入不存在房间返回失败', badJoin.success === false);
  check('错误信息: 房间不存在', badJoin.error === '房间不存在');
  charlie.disconnect();
  console.log('');

  // === 测试4: 离开房间 ===
  console.log('[测试4] 离开房间...');
  const leftPromise = new Promise(r => bob.once('room:left', r));
  const playerLeftPromise = new Promise(r => alice.once('room:player_left', r));

  bob.emit('room:leave', roomId);

  const leftData = await leftPromise;
  check('Bob收到 room:left', leftData.roomId === roomId);

  const pLeftData = await playerLeftPromise;
  check('Alice收到 room:player_left', pLeftData.player.nickname === '悲伤的菠萝');
  check('离开后玩家列表剩1人', pLeftData.players.length === 1);
  bob.disconnect();
  console.log('');

  // === 测试5: 重复昵称 ===
  console.log('[测试5] 重复昵称...');
  const dave = io(SERVER);
  await new Promise(r => dave.on('connect', r));

  const dupJoin = await new Promise((resolve) => {
    dave.emit('room:join', roomId, '火麟飞', (res) => resolve(res));
  });
  check('重复昵称加入失败', dupJoin.success === false);
  check('错误信息: 昵称已被使用', dupJoin.error === '昵称已被使用');
  dave.disconnect();
  console.log('');

  // === 清理 ===
  alice.emit('room:leave', roomId);
  alice.disconnect();

  // === 结果 ===
  console.log('==========================================');
  console.log(`测试结果: ${passed} 通过, ${failed} 失败`);
  if (failed === 0) console.log('🎉 全部通过！Step 1 验收完成！');
  else console.log('⚠️ 存在失败用例');
  console.log('==========================================');

  process.exit(failed > 0 ? 1 : 0);
}

test().catch(err => {
  console.error('测试异常:', err.message);
  process.exit(1);
});
