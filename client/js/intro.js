// ============================================================
// intro.js — 游戏介绍弹窗控制
// ============================================================

function openIntro() {
  const modal = document.getElementById('introModal');
  if (modal) modal.style.display = 'flex';
}

function closeIntro() {
  const modal = document.getElementById('introModal');
  if (modal) modal.style.display = 'none';
}

// 点击遮罩关闭
document.addEventListener('click', (e) => {
  const modal = document.getElementById('introModal');
  if (e.target === modal) closeIntro();
});

// 绑定按钮事件
document.addEventListener('DOMContentLoaded', () => {
  const btn = document.getElementById('btnIntro');
  if (btn) btn.addEventListener('click', openIntro);
});
