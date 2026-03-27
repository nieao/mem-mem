/**
 * 虚拟技能库 — 10 个 OpenClaw 相关技能领域
 * 每个 Agent 随机分配 2-3 个技能，塑造其专业视角
 */

import type { VirtualSkill, SkillDomain } from './types.js';

/** 技能模板库 */
const SKILL_TEMPLATES: Record<SkillDomain, { name: string; description: string }> = {
  'soul-design': {
    name: 'SOUL.md 人格设计',
    description: '擅长设计 Agent 人格、价值观体系、行为边界。能写出让 Agent "活起来"的 SOUL.md。',
  },
  'memory-arch': {
    name: '记忆系统架构',
    description: '精通三层记忆模型（短期/中期/长期），向量检索，知识蒸馏。理解记忆对 Agent 智能的决定性作用。',
  },
  'security': {
    name: '安全与权限管理',
    description: '安全意识极强，熟悉最小权限原则、Docker 隔离、Token 轮换。对提示注入攻击高度敏感。',
  },
  'model-strategy': {
    name: '模型选择策略',
    description: '了解各 LLM 的性价比、延迟、能力边界。能根据任务复杂度自动切换模型层级。',
  },
  'skill-authoring': {
    name: 'Skill 编写专家',
    description: '精通 SKILL.md 规范，知道如何写出让 Agent 能准确触发的 description。有丰富的脚本集成经验。',
  },
  'multi-agent': {
    name: '多 Agent 编排',
    description: '理解 Agent 分工协作模式，AGENTS.md 配置，并发限制。有复杂工作流编排经验。',
  },
  'channel-ops': {
    name: '渠道运维',
    description: '熟悉 Telegram Bot、Web UI、Terminal 等渠道的配置和维护。能快速排查连接问题。',
  },
  'automation': {
    name: '自动化与定时任务',
    description: '擅长 Cron 表达式、Heartbeat 机制、事件驱动自动化。让 Agent 从被动应答变为主动服务。',
  },
  'tool-integration': {
    name: '工具集成',
    description: '有丰富的 API 对接经验，能让 Agent 接入日历、邮件、GitHub、Notion 等外部服务。',
  },
  'prompt-craft': {
    name: '提示词工程',
    description: '深谙 prompt 技巧，能用精巧的系统提示让小模型发挥大模型的效果。理解上下文窗口管理。',
  },
};

const ALL_DOMAINS: SkillDomain[] = Object.keys(SKILL_TEMPLATES) as SkillDomain[];

/** 为一个 Agent 随机分配 2-3 个技能 */
export function assignSkills(): VirtualSkill[] {
  const count = 2 + Math.floor(Math.random() * 2); // 2 或 3
  const shuffled = [...ALL_DOMAINS].sort(() => Math.random() - 0.5);
  const selected = shuffled.slice(0, count);

  return selected.map((domain) => ({
    domain,
    name: SKILL_TEMPLATES[domain].name,
    level: 1 + Math.floor(Math.random() * 5), // 1-5
    description: SKILL_TEMPLATES[domain].description,
  }));
}

/** 获取技能简短标签 */
export function skillTag(skill: VirtualSkill): string {
  const stars = '★'.repeat(skill.level) + '☆'.repeat(5 - skill.level);
  return `[${skill.name} ${stars}]`;
}

/** 获取所有技能模板 */
export function getAllSkillTemplates() {
  return SKILL_TEMPLATES;
}
