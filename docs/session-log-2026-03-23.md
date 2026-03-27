# 🦞 龙虾小镇 — 开发日志 2026-03-23/24

## 概要

从一个简单的斯坦福小镇风格讨论模拟器（mem-mem），一夜之间扩展成了一个完整的虚拟小镇经济生态系统——**龙虾小镇**。

## 今日完成的所有功能

### 核心系统
| 系统 | 文件 | 描述 |
|------|------|------|
| 自定义话题 | openclaw-kb.ts, index.ts | `--topic "xxx"` CLI 支持 |
| Crucix OSINT 集成 | crucix.ts | 37 数据源，技能→数据源映射，三级降级 |
| 三层记忆系统 | memory-store.ts | core/knowledge/episodes/daily，衰减+蒸馏 |
| Agent 养成 | cultivation.ts | XP/等级/技能升级/OCEAN 漂移 |
| 房间美化增强 | report.ts | 护墙板/顶灯/地毯/证书/蜡烛/电路板等 |

### 任务与工作
| 系统 | 文件 | 描述 |
|------|------|------|
| 任务系统+服务器 | server.ts, task-templates.ts | HTTP API，模板推荐 |
| OpenClaw 模拟 | openclaw-sim.ts | SOUL.md 自动生成，心跳任务，Skill 文件 |
| Agent 自主工作 | agent-worker.ts | 真实 claude CLI 执行，HTML 成果库 |

### 经济系统
| 系统 | 文件 | 描述 |
|------|------|------|
| 股市模拟 | stock-market.ts | A 股 12 板块，人格驱动投资 |
| 12 家企业 | town-economy.ts | 餐饮×2/美容/娱乐×3/维修/物业/能源/宠物龙虾/电视台/广播台 |
| 排行榜 | town-economy.ts | 财富榜/人气榜/生产力榜 |
| 随机事件 | town-economy.ts | 龙虾节/AI暴涨/停电/音乐节等 10 种 |
| 居民需求 | town-economy.ts | 饥饿/娱乐/形象/维修需求驱动消费 |
| Token 统计 | llm.ts, report.ts | 左上角面板，调用次数/token/成本 |
| Token 预算 | llm.ts | `--token-budget` 超限自动切 Mock |

### 媒体系统
| 系统 | 文件 | 描述 |
|------|------|------|
| 电视台 6 频道 | report.ts, town-media.ts | 小镇综合/财经/国内/国际/网络热点/八卦 |
| HLS 直播 | report.ts | CGTN/CCTV-13/CCTV+，自动 failover |
| 广播台 4 频道 | report.ts, town-media.ts | 新闻/股市/音乐(HTML5播放器)/龙虾八卦 |
| 房间挂墙电视 | report.ts | 居中横屏，HLS 直播，暂停/切台 |
| 电视待机 | report.ts | 默认不加载流，龙虾 logo 待机画面 |

### 视觉效果
| 系统 | 文件 | 描述 |
|------|------|------|
| 4 种气质房间 | report.ts | NT科技/NF书房/SJ办公/SP工坊 |
| 龙虾宠物 | report.ts | 1-3 只，8 种拟人动作(散步/躺着/跑步/瑜伽/跳舞/坐/挥手/跳) |
| 股市终端 | report.ts | Crucix Jarvis 风格，红涨绿跌，sparkline |
| OpenClaw 面板 | report.ts | SOUL/技能/待办/成果数 |
| 任务面板 | report.ts | 模板按钮+输入框+执行+结果弹窗 |
| 随机新闻话题 | openclaw-kb.ts | 12 条新闻驱动话题池 |

## 代码统计

- **新增文件**: 14 个 TypeScript 模块
- **总新增代码**: ~6000+ 行
- **Git Commits**: 8 个
- **浏览器自检**: 100/100 (36/36 全通过)
- **真实 LLM 测试**: 陈策(INTJ)成功用 claude CLI 生成了完整的 SOUL.md 审查报告

## 架构总览

```
src/
├── index.ts              ← CLI 入口（新增 8 个参数）
├── types.ts              ← 核心类型（扩展 10+ 接口）
├── town.ts               ← 小镇引擎（8 个阶段）
├── agent.ts              ← Agent 实体（Crucix + 记忆注入）
├── game-master.ts        ← GM 中介（传递 crucixContextMap）
├── llm.ts                ← LLM 调用层（Token 追踪 + 预算控制）
├── personalities.ts      ← 20 个 MBTI/OCEAN 人格
├── skills.ts             ← 10 个虚拟技能
├── openclaw-kb.ts        ← 话题库（经典 + 随机新闻）
├── crucix.ts             ← Crucix OSINT 桥接（三级降级）
├── memory-store.ts       ← 三层记忆系统
├── cultivation.ts        ← Agent 养成引擎
├── openclaw-sim.ts       ← OpenClaw 模拟
├── agent-worker.ts       ← Agent 自主工作引擎
├── stock-market.ts       ← 股市模拟
├── town-economy.ts       ← 12 家企业经济
├── town-media.ts         ← 电视台 + 广播台
├── task-templates.ts     ← 任务模板
├── server.ts             ← HTTP 任务服务器
├── report.ts             ← HTML 报告（5000+ 行）
└── report-3d.ts          ← 3D 报告
```

## 运行方式

```bash
# 快速测试
bun run src/index.ts --mock --topics 2 --rounds 2 --speakers 4

# 真实 LLM + 服务器
bun run src/index.ts --topics 2 --rounds 2 --serve

# 自定义话题
bun run src/index.ts --mock --topic "龙虾能否学会编程？"

# Token 预算限制
bun run src/index.ts --token-budget 50000 --topics 3
```
