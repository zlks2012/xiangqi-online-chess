# 中国象棋 · 楚河汉界（v2 引擎版）

> Canvas 渲染 · 后台线程 AI · 七层迭代深搜 —— 支持房间号联机对战、PWA 离线安装与 Android APK。

本仓库的 **main 分支**为 v2.0.0 版本（全新引擎）；v1.0.0 的 DOM 渲染版见 [Release v1.0.0](https://github.com/zlks2012/xiangqi-online-chess/releases/tag/v1.0.0)。

**📌 两代版本完整对比见 [COMPARISON.md](./COMPARISON.md)**（架构 / AI / 联机实现 / 功能细节 / 选型建议）

## 在线体验

**https://xiangqi-chess-app.app.workbuddy.host/?sharecode=QBJPCYEMMN**

手机浏览器打开后：
- 安卓：菜单选「添加到桌面 / 安装应用」，或直接下载 [APK](https://github.com/zlks2012/xiangqi-online-chess/releases)
- iOS：点分享按钮 →「添加到主屏幕」
- 安装后**断网也能玩**（单机模式离线可用，联机需要网络）

## 功能

### 单机 AI 对战
- **四档棋力**：简单（2 层）/ 中等（3 层）/ 高级（4 层）/ 超级（7 层迭代深搜 + 置换表）
- **AI 跑在 Web Worker**：主线程 60fps 渲染永不卡顿；Worker 不可用时自动降级同步搜索
- **Canvas 高性能渲染**：棋盘缓存、棋子精灵图缓存、落子动画、吃子爆裂粒子、将军冲击波、震屏闪光
- 可选执红先手 / 执黑后手（执黑自动翻转棋盘）
- 悔棋（扣分）、提示（AI 算最佳着法）、危位高亮（受威胁棋子标记）、棋盘翻转
- 连击 Combo 计分、难度倍率、计时、吃子统计、本地龙虎榜（按难度筛选）
- 三种操作：点击、拖拽、键盘（方向键移动光标 + 空格/回车）

### 联机对战（v2 新增）
- 主菜单点「联机对战」→「创建房间」得到 6 位房间号
- 朋友用同一链接打开 →「加入房间」输入号码即可对弈
- 房主执红先手、朋友执黑后手；棋步 900ms 轮询同步，乐观锁（move_count）防冲突
- 云端房间存储于 WorkBuddy Cloud Service（PostgreSQL + RLS）
- 支持点击 / 拖拽 / 键盘三种操作；翻转棋盘、复制房间号、断线指示

## 技术栈

- React 19 + TypeScript 5.9 + Vite 7 + Tailwind CSS 4
- `vite-plugin-singlefile` 打包为单 HTML 文件（468 KB，gzip 140 KB）
- Web Worker 内嵌（`?worker&inline`）、Canvas 2D、Web Audio 合成音效
- `@tencent-ai/workbuddy-cloud-sdk` 云数据库

## 目录结构

```
├── index.html                 # 入口（PWA meta + 分享码兼容脚本）
├── public/
│   ├── manifest.webmanifest   # PWA 清单（含快捷方式）
│   ├── sw.js                  # Service Worker 离线缓存
│   └── icons/                 # 应用图标 192/512/maskable
└── src/
    ├── App.tsx                # 单机主程序（状态机、计分、键盘、特效编排）
    ├── OnlineGame.tsx         # 联机对战（建房/加入/同步/Canvas 对局）
    ├── components/
    │   ├── BoardCanvas.tsx    # Canvas 棋盘（指针事件 + 60fps 渲染循环）
    │   ├── Screens.tsx        # 菜单/暂停/结算/龙虎榜
    │   ├── ui.tsx             # 自绘 SVG 图标 + 按钮 + 面板
    │   └── Ambient.tsx        # 背景氛围动画
    ├── game/
    │   ├── xiangqi.ts         # 规则引擎（90 格 Int8Array、走法生成、将军判定、中文记谱）
    │   ├── ai.ts              # 迭代加深 Alpha-Beta + 置换表 + 评估函数
    │   ├── aiWorker.ts        # AI 的 Worker 入口
    │   ├── aiClient.ts        # Worker 封装（Promise 化 + 降级）
    │   ├── renderer.ts        # Canvas 绘制（棋盘/棋子/动画/特效）
    │   ├── effects.ts         # 粒子/波纹/浮动文字/震屏
    │   ├── meta.ts            # 难度定义与龙虎榜存取
    │   └── cloud.ts           # 云服务客户端配置
    └── audio/sound.ts         # Web Audio 音效合成
```

## 本地开发

```bash
npm install
npm run dev      # 开发服务器
npm run build    # 产出 dist/index.html（单文件）
```

需要 Node.js 20+。

## 云端房间表

联机功能依赖云数据库 `rooms` 表（PostgreSQL）：

| 字段 | 类型 | 说明 |
|---|---|---|
| code | TEXT PK | 6 位房间号 |
| status | TEXT | waiting / playing / finished |
| moves | JSONB | 数字数组，每步 `from*90+to` |
| move_count | INT | 乐观锁版本号 |
| red_seat / black_seat | TEXT | 双方匿名座位标识 |
| winner | TEXT | 胜方 r / b |

## Android APK 打包

```bash
npm run build
# Capacitor 工程指向 dist 产物
npx cap sync android
cd android && ./gradlew assembleDebug
```

详见 [Release v2.0.0](https://github.com/zlks2012/xiangqi-online-chess/releases) 的 APK 附件。

## npm 包

规则引擎单独发布为 **@zlks2012/xiangqi-engine**（GitHub Packages，公开）：
https://github.com/zlks2012/xiangqi-online-chess/pkgs/package/xiangqi-engine
