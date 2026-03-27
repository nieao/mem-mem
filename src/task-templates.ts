/**
 * 任务模板系统 — 通用 + OpenClaw 专属，根据技能推荐
 */

import type { TaskTemplate, SkillDomain, VirtualSkill } from './types.js';

/** 全部任务模板 */
export const TASK_TEMPLATES: TaskTemplate[] = [
  // ── 通用模板 ──
  {
    id: 'analysis',
    label: '写分析文章',
    prompt: '请就以下话题写一篇简短但有深度的分析文章（300-500字），要有明确的观点和论据：',
    relatedSkills: [],
    category: 'general',
  },
  {
    id: 'code-review',
    label: '代码审查',
    prompt: '请对以下代码或技术方案进行审查，指出潜在问题和改进建议：',
    relatedSkills: ['tool-integration', 'skill-authoring'],
    category: 'general',
  },
  {
    id: 'data-report',
    label: '数据分析报告',
    prompt: '请基于以下信息生成一份简洁的数据分析报告，包含关键发现和建议：',
    relatedSkills: ['memory-arch', 'model-strategy'],
    category: 'general',
  },
  {
    id: 'brainstorm',
    label: '创意风暴',
    prompt: '请就以下主题进行头脑风暴，提出 5-8 个创意方案，每个方案用 1-2 句话描述：',
    relatedSkills: [],
    category: 'general',
  },
  {
    id: 'summary',
    label: '总结提炼',
    prompt: '请对以下内容进行总结提炼，提取核心要点，用简洁的语言重新组织：',
    relatedSkills: ['prompt-craft'],
    category: 'general',
  },

  // ── OpenClaw 专属模板 ──
  {
    id: 'write-soul',
    label: '写 SOUL.md',
    prompt: '请为一个 OpenClaw Agent 编写 SOUL.md 人格配置文件。包含身份、价值观、沟通风格、安全红线、日常行为规则。需求：',
    relatedSkills: ['soul-design'],
    category: 'openclaw',
  },
  {
    id: 'write-skill',
    label: '写 SKILL.md',
    prompt: '请为一个 OpenClaw Skill 编写 SKILL.md 文件。包含名称、description（触发词）、使用方法、脚本逻辑。需求：',
    relatedSkills: ['skill-authoring'],
    category: 'openclaw',
  },
  {
    id: 'security-plan',
    label: '安全策略',
    prompt: '请设计一套 OpenClaw Agent 的安全策略，涵盖权限管理、Docker 隔离、Token 轮换、提示注入防护。场景：',
    relatedSkills: ['security'],
    category: 'openclaw',
  },
  {
    id: 'memory-design',
    label: '记忆架构',
    prompt: '请设计一套 Agent 三层记忆架构（短期/中期/长期），包含数据结构、蒸馏策略、检索机制。需求：',
    relatedSkills: ['memory-arch'],
    category: 'openclaw',
  },
  {
    id: 'channel-config',
    label: '渠道方案',
    prompt: '请设计一套 Agent 多渠道接入方案（Telegram/Web/Terminal），包含配置步骤和最佳实践。需求：',
    relatedSkills: ['channel-ops'],
    category: 'openclaw',
  },
  {
    id: 'automation-plan',
    label: '自动化方案',
    prompt: '请设计一套 Agent 自动化方案，包含心跳机制、Cron 任务、事件驱动触发器。场景：',
    relatedSkills: ['automation'],
    category: 'openclaw',
  },
];

/** 根据 Agent 技能推荐模板（排序：匹配度高的在前） */
export function recommendTemplates(skills: VirtualSkill[]): TaskTemplate[] {
  const domains = new Set(skills.map(s => s.domain));

  const scored = TASK_TEMPLATES.map(t => {
    let score = 0;
    // 技能匹配加分
    for (const rs of t.relatedSkills) {
      if (domains.has(rs)) score += 2;
    }
    // 通用模板基础分
    if (t.category === 'general') score += 0.5;
    // OpenClaw 专属模板的技能匹配更重要
    if (t.category === 'openclaw' && t.relatedSkills.some(r => domains.has(r))) score += 3;
    return { template: t, score };
  });

  scored.sort((a, b) => b.score - a.score);
  return scored.map(s => s.template);
}

/** 序列化模板为 JSON（供前端使用） */
export function templatesToJson(skills: VirtualSkill[]): string {
  const recommended = recommendTemplates(skills);
  return JSON.stringify(recommended.map(t => ({
    id: t.id,
    label: t.label,
    prompt: t.prompt,
    category: t.category,
  })));
}
