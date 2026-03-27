# mem-mem — OpenClaw 讨论小镇

## 项目简介

斯坦福小镇风格的文本 Agent 讨论模拟器。20 位拥有不同 MBTI/OCEAN 人格和虚拟技能的 Agent，在 Game Master 中介下讨论 OpenClaw 核心议题。

目的：理解 Agent 间的沟通逻辑，为设置 Agent 和 Skill 提供参考。

## 技术栈

- 运行时：Bun
- 语言：TypeScript
- LLM：本地 claude CLI subprocess（默认 Haiku，可切换）
- 架构：Concordia GM 中介模式 + 轮次制讨论

## 常用命令

```bash
# Mock 模式（不消耗 API，用于测试）
bun run src/index.ts --mock

# 真实 LLM 模式
bun run src/index.ts

# 指定参数
bun run src/index.ts --topics 3 --rounds 2 --speakers 5

# 用 Sonnet 模型（更高质量）
bun run src/index.ts --model claude-sonnet-4-6
```

## 架构

```
src/
├── index.ts           ← CLI 入口
├── types.ts           ← 核心类型
├── llm.ts             ← Claude CLI 调用层（带并发控制）
├── personalities.ts   ← 20 个 MBTI/OCEAN 人格档案
├── skills.ts          ← 10 个 OpenClaw 虚拟技能
├── agent.ts           ← Agent 实体（人格 + 技能 + 记忆）
├── game-master.ts     ← GM 中介（选人、总结、洞察）
├── openclaw-kb.ts     ← OpenClaw 知识库（沙箱内自包含）
├── town.ts            ← 小镇模拟引擎
└── report.ts          ← HTML 报告生成（建筑极简风格）
```

## 沙箱原则

本项目完全自包含，不读写外部数据。所有知识库、人格数据、讨论记录都在项目目录内。
