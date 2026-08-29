# 《黑洞回收站》多端构建与打包指南 (Build & Packaging Guide)

## 1. 构建命令一览
```bash
# 构建全平台 (微信 + 抖音 + Web H5)
npm run build:all

# 单独构建微信小游戏 (dist/wx)
npm run build:wx

# 单独构建抖音小游戏 (dist/tt)
npm run build:tt

# 单独构建 Web H5 预览版 (dist/web)
npm run build:web

# 本地 Vite 实时热重载开发预览
npm run dev
```

## 2. 产物目录结构说明
- `dist/wx/`: 微信小游戏产物（包含 `game.js`, `game.json`, `project.config.json`）。
- `dist/tt/`: 抖音小游戏产物（包含 `game.js`, `game.json`, `microapp.json`, `project.config.json`）。
- `dist/web/`: 纯静态 H5 Web 产物，可直接通过任何 HTTP 静态服务器或 CDN 部署。
