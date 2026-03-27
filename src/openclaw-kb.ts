/**
 * OpenClaw 知识库 — 龙虾小镇领域知识
 * 沙箱内自包含，不读取外部数据
 */

import type { Topic } from './types.js';

/** OpenClaw 核心概念简介（注入 GM 上下文） */
export const OPENCLAW_CONTEXT = `
OpenClaw 是一个个人 AI Agent 服务器，在本地机器运行。它不是聊天应用——而是能主动执行任务的自主数字助手。

核心架构五大支柱：
1. 多渠道网关：Telegram、iMessage、Web UI、Terminal 统一入口
2. 自安装工具：Agent 能自主发现和安装新工具
3. 心跳机制：每 30 分钟主动检查待办任务
4. 定时任务：Agent 可以自建 Cron 任务（如早 7 点读邮件推到 Telegram）
5. 持久记忆：三层记忆系统——对话上下文（短期）、每日日记（中期）、MEMORY.md（长期）

关键文件：
- SOUL.md：Agent 人格——身份、价值观、沟通风格、安全红线、日常行为
- MEMORY.md：长期记忆，从日记蒸馏而来
- skills/<name>/SKILL.md：可复用的专家知识包
- openclaw.json：主配置

安全六铁律：
1. 专用账号（给 Agent 新建邮箱/服务账号）
2. 最小权限（从 Telegram + 只读开始）
3. Docker 隔离
4. 强模型防注入（处理外部内容用 Opus 级模型）
5. 不暴露公网（localhost + SSH 隧道）
6. Token 轮换

模型选择策略：
- Haiku：简单分类、格式化（极低成本）
- Sonnet：日常 90% 任务（每天 2-5 美元）
- Opus：深度研究、关键决策、安全敏感任务
`;

/** 讨论话题池 */
export const TOPICS: Topic[] = [
  {
    id: 'soul-design',
    title: 'SOUL.md 的灵魂拷问：如何设计一个有"人味"的 Agent？',
    description: '探讨 SOUL.md 的最佳实践。人格设计到底应该详细到什么程度？安全红线怎么写才不会限制 Agent 的能力？',
    relatedSkills: ['soul-design', 'prompt-craft', 'security'],
    openingQuestion: 'SOUL.md 应该控制在多少 Token？人格描述越详细越好，还是留给 Agent 自由发挥的空间更重要？',
  },
  {
    id: 'memory-war',
    title: '记忆的战争：Agent 应该记住什么，忘记什么？',
    description: '讨论三层记忆架构的取舍。短期 vs 长期，什么该蒸馏保留，什么该遗忘？记忆过多会不会反而让 Agent 变蠢？',
    relatedSkills: ['memory-arch', 'prompt-craft', 'model-strategy'],
    openingQuestion: '你的 Agent 记忆库超过 500 条后，检索质量明显下降。是记忆太多了，还是检索策略有问题？',
  },
  {
    id: 'security-paranoia',
    title: '安全偏执狂 vs 效率至上：权限边界在哪里？',
    description: '安全和便利永远矛盾。Docker 隔离、最小权限、强模型防注入——这些安全措施是必要的还是过度的？',
    relatedSkills: ['security', 'channel-ops', 'automation'],
    openingQuestion: '你会让你的 Agent 直接操作生产环境的数据库吗？如果不会，那"自主 Agent"的意义在哪？',
  },
  {
    id: 'model-economy',
    title: '模型经济学：Haiku 够用还是必须 Opus？',
    description: '讨论模型选择的成本效益。什么场景必须用强模型？能不能全部用 Haiku 然后靠 Skill 弥补智力差距？',
    relatedSkills: ['model-strategy', 'prompt-craft', 'skill-authoring'],
    openingQuestion: '有人说"好的提示词能让 Haiku 达到 Sonnet 80% 的效果"，你同意吗？在 OpenClaw 场景中如何实现？',
  },
  {
    id: 'skill-ecosystem',
    title: 'Skill 生态：Agent 的"超能力"怎么设计？',
    description: '探讨 Skill 系统的最佳实践。SKILL.md 的 description 怎么写才能被 Agent 准确触发？Skill 之间怎么编排？',
    relatedSkills: ['skill-authoring', 'multi-agent', 'tool-integration'],
    openingQuestion: '你写过最有用的 Skill 是什么？description 字段到底有多重要——Agent 真的会"理解"它吗？',
  },
  {
    id: 'multi-agent-chaos',
    title: '多 Agent 混战：协作还是灾难？',
    description: '当多个 Agent 同时工作，如何避免冲突、重复劳动和相互覆盖？分治策略是否真的可行？',
    relatedSkills: ['multi-agent', 'automation', 'memory-arch'],
    openingQuestion: '你尝试过让多个 Agent 并行处理同一个项目吗？遇到了什么灾难性的协调问题？',
  },
  {
    id: 'automation-boundary',
    title: '自动化边界：Agent 应该多"自主"？',
    description: '心跳、Cron、主动行为——Agent 的自主程度应该到哪里？完全自动化是目标还是风险？',
    relatedSkills: ['automation', 'security', 'soul-design'],
    openingQuestion: '你的 Agent 半夜自动发了一封邮件，内容是对的但时机不对。你会关掉自动化还是调整规则？',
  },
  {
    id: 'channel-strategy',
    title: '渠道战略：Telegram 之外还有什么？',
    description: '讨论多渠道集成策略。不同渠道适合什么场景？是否应该每个渠道配一个专属 Agent？',
    relatedSkills: ['channel-ops', 'tool-integration', 'multi-agent'],
    openingQuestion: 'Telegram 是公认的首选渠道，但它有明显的局限性（如富文本支持差）。你还用什么渠道？为什么？',
  },
];

/** 从一行文本创建自定义话题 */
export function createCustomTopic(text: string, index: number): Topic {
  return {
    id: `custom-${index}`,
    title: text,
    description: text,
    relatedSkills: ['soul-design', 'memory-arch', 'security', 'model-strategy',
      'skill-authoring', 'multi-agent', 'channel-ops', 'automation',
      'tool-integration', 'prompt-craft'] as any[],
    openingQuestion: `关于"${text}"，你的看法是什么？`,
    source: 'custom',
  };
}

/** 从新闻和事件随机生成话题 */
const NEWS_BASED_TOPICS = [
  { title: 'AI Agent 是否应该有情感？', skills: ['soul-design', 'prompt-craft'] },
  { title: '国产大模型超越 GPT-4 意味着什么？', skills: ['model-strategy', 'prompt-craft'] },
  { title: '龙虾经济学：如何用最小成本养最聪明的龙虾？', skills: ['model-strategy', 'automation'] },
  { title: '股市暴跌时 Agent 应该恐慌还是冷静？', skills: ['model-strategy', 'security'] },
  { title: '数字人民币普及后 Agent 能自己花钱吗？', skills: ['tool-integration', 'security'] },
  { title: '小镇停电了，Agent 该如何自救？', skills: ['automation', 'multi-agent'] },
  { title: '远程办公时代，Agent 需要物理形体吗？', skills: ['channel-ops', 'soul-design'] },
  { title: '新能源发电占比突破 35%，对 Agent 有什么影响？', skills: ['automation', 'tool-integration'] },
  { title: '社交媒体上的 AI 生成内容该如何监管？', skills: ['security', 'channel-ops'] },
  { title: '宠物龙虾的智能化训练——Agent 能帮上什么忙？', skills: ['skill-authoring', 'memory-arch'] },
  { title: '全球供应链恢复正常，Agent 的物流优化还有意义吗？', skills: ['tool-integration', 'automation'] },
  { title: '比特币突破 87000 美元，Agent 该追涨还是观望？', skills: ['model-strategy', 'security'] },
];

export function generateRandomTopics(count: number): Topic[] {
  const shuffled = [...NEWS_BASED_TOPICS].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, count).map((t, i) => ({
    id: `news-${i}`,
    title: t.title,
    description: `基于今日新闻和事件随机生成的讨论话题：${t.title}`,
    relatedSkills: t.skills as any[],
    openingQuestion: `今天的新闻让我想到一个问题：${t.title} 你怎么看？`,
    source: 'crucix' as const,
  }));
}

/** 从 JSON 文件加载话题 */
export function loadTopicsFromFile(filePath: string): Topic[] {
  try {
    const { readFileSync } = require('fs');
    const raw = JSON.parse(readFileSync(filePath, 'utf-8'));
    const topics: Topic[] = (raw.topics || raw).map((t: any, i: number) => ({
      id: t.id || `file-${i}`,
      title: t.title,
      description: t.description || t.title,
      relatedSkills: t.relatedSkills || [],
      openingQuestion: t.openingQuestion || `关于"${t.title}"，你怎么看？`,
      source: 'custom' as const,
      crucixDomains: t.crucixDomains,
    }));
    return topics;
  } catch (err) {
    console.error(`加载话题文件失败: ${filePath}`, err);
    return [];
  }
}

/** 根据配置选取话题 */
export function pickTopics(count: number, config?: Partial<import('./types.js').SimConfig>): Topic[] {
  const mode = config?.topicMode || 'default';

  // 收集自定义话题
  let customTopics: Topic[] = [];
  if (config?.customTopics?.length) {
    customTopics = config.customTopics.map((t, i) => createCustomTopic(t, i));
  }
  if (config?.customTopicFile) {
    customTopics = [...customTopics, ...loadTopicsFromFile(config.customTopicFile)];
  }

  // 有自定义话题时，自定义话题优先选入，剩余名额从默认池补充
  if (customTopics.length > 0 && (mode !== 'default' || customTopics.length > 0)) {
    const selected: Topic[] = [...customTopics];
    if (mode !== 'custom') {
      // mixed 或未指定：补充默认话题填满 count
      const remaining = count - selected.length;
      if (remaining > 0) {
        const defaults = [...TOPICS].sort(() => Math.random() - 0.5);
        selected.push(...defaults.slice(0, remaining));
      }
    }
    return selected.slice(0, count);
  }

  // 默认模式：混合 OpenClaw 经典话题 + 随机新闻话题
  const newsTopics = generateRandomTopics(Math.max(1, Math.floor(count / 2)));
  const classicTopics = [...TOPICS].sort(() => Math.random() - 0.5).slice(0, count - newsTopics.length);
  const mixed = [...newsTopics, ...classicTopics].sort(() => Math.random() - 0.5);
  return mixed.slice(0, count);
}
