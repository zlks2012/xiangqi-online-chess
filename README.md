# 中国象棋 · 掌上对弈

一个可安装的中国象棋手游：支持单机 AI 对战，也支持建房报号、朋友加入的**真人联机对战**。可部署为 PWA 在手机浏览器安装，也可打包成 Android APK。

## 功能

- **单机 AI 对战**：简单 / 中等 / 高级 / 超级四档难度，连吃 Combo、震屏特效、提示、悔棋、音效、本地高分榜。
- **联机对战**：创建房间获得 6 位房间号 → 朋友输入房间号加入 → 房主执红先手、朋友执黑后手，棋步自动同步（约 900ms 轮询）。
- **手机适配**：全屏启动、桌面图标、离线缓存（Service Worker）、安全区适配、触屏 / 键盘双操作。
- **技术栈**：React 19 + TypeScript + Vite 7 + Tailwind CSS 4 + lucide-react；云端房间使用 WorkBuddy Cloud Service（PostgREST 风格数据库）；Android 打包使用 Capacitor 7。

## 在线体验

- 在线 APP：<https://xiangqi-chess-app.app.workbuddy.host/?sharecode=QBJPCYEMMN>
- 打开后点主页「联机对战 · 建房 / 加入」即可创建或加入房间。

## 目录结构

```
├── index.html                 # 入口，含 PWA meta 与分享码资源修正
├── package.json / package-lock.json
├── tsconfig.json / vite.config.ts
├── public/
│   ├── manifest.webmanifest   # PWA 安装清单
│   ├── sw.js                  # Service Worker，离线缓存
│   └── icons/                 # 192/512/maskable 应用图标
├── src/
│   ├── main.tsx               # 入口，注册 Service Worker
│   ├── App.tsx                # 单机 AI 对战主界面
│   ├── OnlineGame.tsx         # 联机对战模块（建房 / 加入 / 同步）
│   ├── index.css              # 全局样式与动画
│   ├── components/
│   │   └── ParticleCanvas.tsx # 粒子特效
│   ├── game/
│   │   ├── xiangqi.ts         # 象棋规则引擎、走法生成、AI 搜索
│   │   ├── audio.ts           # WebAudio 合成音效
│   │   ├── storage.ts         # 本地高分榜
│   │   └── cloud.ts           # 云服务客户端初始化
│   └── utils/cn.ts
```

## 本地开发

需要 Node.js 20+。

```bash
npm install
npm run dev        # 本地开发服务器
npm run build      # 构建，产物在 dist/（单 HTML 文件 + PWA 资源）
npm run preview    # 预览构建产物
```

构建后 `dist/` 是一个自包含的单 HTML 文件（由 `vite-plugin-singlefile` 生成），可直接部署到任意静态托管。

## 联机玩法说明

1. 房主点「创建房间」，界面显示 6 位房间号，房主执红先走。
2. 把房间号告诉朋友（微信 / QQ / 口头均可）。
3. 朋友用同一个 APP 打开「联机对战」，输入 6 位房间号点「加入」，执黑后手。
4. 双方轮流行棋，棋步通过云端房间表同步；界面会显示「轮到你走」或「对方行棋中」。
5. 房间号就是进入凭据，无需注册登录；不要把房间号公开给陌生人。

## 云端房间配置

联机功能依赖 WorkBuddy Cloud Service。当前应用已开通云服务，`src/game/cloud.ts` 中的 `publicConfig` 为可公开的前端配置（endpoint / publishableKey 等）。

云端表结构（已在应用中创建）：

```sql
CREATE TABLE rooms (
  code TEXT PRIMARY KEY,             -- 6 位房间号
  status TEXT NOT NULL DEFAULT 'waiting',  -- waiting / playing / finished
  moves JSONB NOT NULL DEFAULT '[]', -- 棋步数组 [{fx,fy,tx,ty}]
  move_count INT NOT NULL DEFAULT 0, -- 已走步数，用于乐观锁
  red_seat TEXT,                     -- 房主座位标识（localStorage 随机生成）
  black_seat TEXT,                   -- 加入者座位标识
  winner TEXT,                       -- 胜方颜色 r/b
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

表已启用 RLS，并对 `authenticated, anon` 开放 SELECT/INSERT/UPDATE/DELETE 策略。房间号是唯一访问凭据。

若要迁移到自己的后端，替换 `src/game/cloud.ts` 与 `src/OnlineGame.tsx` 中的数据读写即可。

## Android APK 打包

使用 Capacitor 将构建产物包成 WebView APP：

```bash
# 准备 Android SDK（JDK 21 + platforms;android-35 + build-tools;35.0.0）
npm install @capacitor/core@7 @capacitor/cli@7 @capacitor/android@7
npx cap init Xiangqi com.example.xiangqi --web-dir=dist
npx cap add android
npx cap sync android
cd android && ./gradlew assembleDebug
# 产物：android/app/build/outputs/apk/debug/app-debug.apk
```

本仓库不含 APK 二进制文件，可按上述步骤自行构建；也可直接使用在线 PWA 版本。

## 图标

应用图标为用户提供的霓虹 M 图标，已生成 192×192、512×512、maskable 512×512 三种 PWA 尺寸，以及 Android 各密度 mipmap 与自适应图标前景。

## 许可

代码仅供学习与个人使用。象棋规则引擎为原创实现。
