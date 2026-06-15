# 音效文件目录

将以下 `.ogg` 文件放入此目录即可启用完整音效系统。

如果文件缺失，SoundManager 会自动回退到 Web Audio API 程序化音效（audio.js）。

## 音效清单

| 文件名 | 描述 | 时长 | 触发时机 |
|--------|------|------|-----------|
| `ambient.ogg` | 古琴/编钟背景音（循环） | 30-60s | 首次点击页面后播放 |
| `click.ogg` | 竹简敲击声 | 0.5s | 按钮点击 |
| `confirm.ogg` | 确认音效 | 0.5s | 创建/加入房间成功 |
| `gameStart.ogg` | 号角/钟声 | 2-3s | 开始游戏 |
| `cardFlip.ogg` | 翻牌/丝帛摩擦声 | 0.5-1s | 卡牌展示 |
| `coin.ogg` | 金币碰撞声 | 0.5s | 出价 |
| `diceShake.ogg` | 骰子摇晃声 | 1-2s | 租骰/掷骰 |
| `qianShake.ogg` | 签子晃动声 | 1-2s | 签筒动画开始 |
| `qianPop.ogg` | 签子弹出声 | 0.5s | 签子弹出 |
| `victory.ogg` | 胜利音效 | 2-3s | 掷骰结算 |
| `duel.ogg` | 紧张弦乐 | 1-2s | 镜中决斗触发 |
| `gameOver.ogg` | 欢呼+撒花 | 3-5s | 游戏结束 |
| `error.ogg` | 低沉提示音 | 0.5s | 操作失败 |

## 音效文件规范

- 格式：OGG（推荐）或 MP3
- 采样率：44.1kHz
- 比特率：128kbps（背景音 192kbps）
- 音量标准化：-3dB

## 免费音效资源

- [Freesound](https://freesound.org/)
- [OpenGameArt](https://opengameart.org/)
- [Zapsplat](https://www.zapsplat.com/)
- [爱给网](https://www.aigei.com/sound/)
