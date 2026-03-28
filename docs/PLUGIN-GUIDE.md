# 🔌 龙虾小镇插件开发指南

## 快速开始

1. 复制模板
   ```bash
   cp -r plugins/.template plugins/my-plugin
   ```

2. 编辑 `manifest.json`
   ```json
   {
     "id": "my-plugin",        // 小写字母+数字+连字符
     "name": "我的插件",        // 不超过 20 字
     "icon": "🎮",             // 一个 emoji
     "description": "一句话描述", // 不超过 100 字
     "author": "你的名字",
     "version": "1.0.0",
     "category": "game"        // game|social|tool|creative|other
   }
   ```

3. 编辑 `index.html`（你的全部代码）
   ```html
   <!DOCTYPE html>
   <html lang="zh">
   <head>
     <meta charset="utf-8">
     <script src="/sdk/plugin-sdk.js"></script>
   </head>
   <body>
     <script>
       // 使用 LobsterSDK 与小镇交互
       const user = await LobsterSDK.getCurrentUser();
     </script>
   </body>
   </html>
   ```

4. 本地测试
   ```bash
   bun run scripts/check-plugin.ts plugins/my-plugin  # 安全检查
   bun run src/server.ts                               # 启动服务
   # 打开 http://localhost:3456/plugin/my-plugin
   ```

5. 提交 PR

## SDK API

| 方法 | 说明 | 返回 |
|------|------|------|
| `getCurrentUser()` | 获取当前用户 | `{ id, name, mbti, tokens }` |
| `getData(key)` | 读取插件数据 | `any` |
| `setData(key, value)` | 写入插件数据 | `true` |
| `getBalance()` | Token 余额 | `number` |
| `addTokens(amount, reason)` | 奖励 Token | `true` |
| `deductTokens(amount, reason)` | 消费 Token | `true` |
| `awardBadge(badgeId)` | 授予勋章 | `true` |
| `getBadges()` | 用户勋章列表 | `Badge[]` |
| `sendMessage(text)` | 发广播 | `true` |
| `getLeaderboard(metric)` | 排行榜 | `Activity[]` |
| `getAgents()` | AI 居民列表 | `Agent[]` |
| `callLLM(prompt, maxTokens?)` | 调用 AI | `string` |
| `close()` | 关闭插件 | -- |

## 安全规则

### 禁止
- `eval()` / `Function()` — 动态代码执行
- `document.cookie` — Cookie 访问
- `<iframe>` — 嵌套 iframe
- `new Worker` — Web Worker（防挖矿）
- `crypto.subtle` — 加密 API
- `importScripts` — 外部脚本加载

### 建议避免
- 直接 `fetch()` — 改用 `LobsterSDK` API
- `localStorage` — 改用 `LobsterSDK.getData/setData`
- `innerHTML =` — 改用 `textContent` 防 XSS
- `WebSocket` — 减少资源消耗

### 允许
- 白名单 CDN: unpkg.com, cdn.jsdelivr.net, cdnjs.cloudflare.com
- Canvas / SVG 图形
- CSS 动画
- 任何纯前端 UI 框架（Vue/React/Svelte 的 CDN 版本）

## 文件限制
- 入口文件 ≤ 512KB
- 目录总大小 ≤ 1MB
- 文件数 ≤ 20
- 允许格式: .html .css .js .json .png .jpg .svg .gif .webp .txt .md
