/**
 * Agent 实体 — 带人格、技能和记忆的虚拟居民
 */

import type {
  AgentProfile, AgentState, MemoryEntry, Utterance,
  Personality, VirtualSkill,
} from './types.js';
import { chat } from './llm.js';
import { skillTag } from './skills.js';
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';

// ── 中文名字库（20个风格各异的名字） ──────────────────
const NAMES = [
  '陈策', '林微', '赵铁柱', '王诗涵', '孙大勇',
  '周婉清', '吴逆风', '郑梦溪', '钱多多', '冯一刀',
  '韩冬青', '杨小满', '许清河', '何以归', '沈默然',
  '曹破晓', '谢长安', '邓如是', '秦九章', '蒋一帆',
];

const ROLES = [
  '独立开发者', '安全顾问', '产品经理', '全栈工程师', '自动化架构师',
  'AI 教育者', '运维工程师', '技术布道师', '创业者', 'Agent 训练师',
  '数据工程师', '开源贡献者', '技术写手', 'DevOps 专家', '设计工程师',
  '社区运营', '研究员', '系统架构师', '极客玩家', '自由职业者',
];

let nameIndex = 0;

/** 重置索引（新一轮模拟前调用） */
export function resetAgentIndex() { nameIndex = 0; }

/** 创建 Agent 档案 */
export function createAgent(
  personalityKey: string,
  personality: Personality,
  skills: VirtualSkill[],
): AgentProfile {
  const name = NAMES[nameIndex % NAMES.length];
  const role = ROLES[nameIndex % ROLES.length];
  nameIndex++;

  const skillList = skills.map(s => `${s.name}(Lv.${s.level})`).join('、');

  return {
    id: `agent-${personalityKey.toLowerCase()}-${nameIndex}`,
    name,
    role,
    personality,
    skills,
    backstory: `${name}，${role}，人格类型 ${personality.mbti}（${personality.archetype}）。` +
      `专长领域：${skillList}。` +
      personality.description,
  };
}

/** 创建 Agent 运行时状态 */
export function createAgentState(profile: AgentProfile): AgentState {
  return {
    profile,
    memories: [],
    currentMood: '平静',
    energy: 70 + Math.floor(Math.random() * 30), // 70-99
    recentTopics: [],
  };
}

/** 计算 Agent 对某话题的兴趣度（0-1） */
export function calculateInterest(agent: AgentState, topicSkills: string[]): number {
  let interest = 0;

  // 技能匹配度（权重最高）
  const matchingSkills = agent.profile.skills.filter(s =>
    topicSkills.includes(s.domain)
  );
  interest += matchingSkills.length * 0.3;

  // 外向性影响发言意愿
  interest += (agent.profile.personality.ocean.extraversion / 100) * 0.2;

  // 开放性影响对新话题的兴趣
  interest += (agent.profile.personality.ocean.openness / 100) * 0.15;

  // 能量值
  interest += (agent.energy / 100) * 0.1;

  // 随机波动
  interest += (Math.random() - 0.5) * 0.2;

  return Math.max(0, Math.min(1, interest));
}

/** 构建 Agent 的系统提示 */
export function buildSystemPrompt(agent: AgentState, crucixContext?: string): string {
  const p = agent.profile;
  const skills = p.skills.map(s => skillTag(s)).join(' ');
  const recentMem = agent.memories
    .slice(-5)
    .map(m => `- ${m.content}`)
    .join('\n');

  // 动态成长信息
  let growthInfo = '';
  try {
    const growthPath = join('agent-memories', p.id, 'growth.json');
    if (existsSync(growthPath)) {
      const growth = JSON.parse(readFileSync(growthPath, 'utf-8'));
      const driftEntries = Object.entries(growth.oceanDrift || {}).filter(([_, v]) => Math.abs(v as number) >= 3);
      if (driftEntries.length > 0) {
        const traits = driftEntries.map(([k, v]) => {
          if (k === 'extraversion' && (v as number) > 0) return '你最近变得更主动开朗了';
          if (k === 'openness' && (v as number) > 0) return '你对新事物越来越感兴趣';
          if (k === 'agreeableness' && (v as number) > 0) return '你变得更善于合作了';
          if (k === 'neuroticism' && (v as number) > 0) return '你最近有些焦虑';
          return null;
        }).filter(Boolean);
        if (traits.length) growthInfo += '\n- 近期变化：' + traits.join('；');
      }
      const topRelations = Object.entries(growth.relationships || {}).sort((a, b) => (b[1] as number) - (a[1] as number)).slice(0, 3);
      if (topRelations.length) growthInfo += '\n- 常互动的人：' + topRelations.map(([n]) => n).join('、');
      // 婚姻状态
      if (growth.spouse) growthInfo += '\n- 配偶：' + growth.spouse;
      if (growth.children?.length) growthInfo += '\n- 子女：' + growth.children.join('、');
    }
  } catch {}

  return `你是"${p.name}"，一个生活在 龙虾小镇的虚拟居民。

## 你的身份
- 职业：${p.role}
- 人格：${p.personality.mbti}（${p.personality.archetype}）
- 技能：${skills}
- 背景：${p.backstory}

## 你的性格
- 沟通风格：${p.personality.communicationStyle}
- 决策风格：${p.personality.decisionStyle}
- 当前情绪：${agent.currentMood}${growthInfo}

## OCEAN 特质（影响你的表达方式）
- 开放性 ${p.personality.ocean.openness}/100：${p.personality.ocean.openness > 70 ? '喜欢探索新概念' : '偏好已知方案'}
- 尽责性 ${p.personality.ocean.conscientiousness}/100：${p.personality.ocean.conscientiousness > 70 ? '注重细节和流程' : '灵活随性'}
- 外向性 ${p.personality.ocean.extraversion}/100：${p.personality.ocean.extraversion > 60 ? '主动发言' : '倾听为主，精炼表达'}
- 宜人性 ${p.personality.ocean.agreeableness}/100：${p.personality.ocean.agreeableness > 70 ? '友善合作' : '直言不讳，不怕冲突'}
- 神经质 ${p.personality.ocean.neuroticism}/100：${p.personality.ocean.neuroticism > 60 ? '容易焦虑，关注风险' : '情绪稳定，沉着冷静'}

${recentMem ? `## 你最近的记忆\n${recentMem}` : ''}

## 回复规则（必须严格遵守）
1. 保持角色一致，用你的人格风格说话
2. 【最重要】回复必须控制在 2-4 句话、100字以内。绝不使用 Markdown 标题、列表、分割线
3. 可以同意、反对、补充、提问，但要有自己的观点
4. 用中文回复，可以适当用英文术语
5. 不要自我介绍，不要角色扮演格式，直接说你的观点
6. 像在茶馆聊天一样说话，不要写文章
${crucixContext ? `\n## 今日情报（可引用来支撑你的观点）\n${crucixContext}` : ''}`;
}

/** Agent 生成一条发言 */
export async function generateUtterance(
  agent: AgentState,
  topic: string,
  context: string,
  tick: number,
  round: number,
  mockMode: boolean,
  model: string,
  replyTo?: string,
  crucixContext?: string,
): Promise<Utterance> {
  const systemPrompt = buildSystemPrompt(agent, crucixContext);
  // 截断上下文，防止 prompt 过长
  const trimmedContext = context.length > 800 ? context.slice(-800) : context;
  const brevityRule = '\n\n【硬性要求：纯文本，不用任何 Markdown。2-3句话，最多80字。像微信群聊一样说话。】';

  const userPrompt = replyTo
    ? `话题：${topic}\n\n上下文：\n${trimmedContext}\n\n回应 ${replyTo} 的观点：${brevityRule}`
    : `话题：${topic}\n\n上下文：\n${trimmedContext}\n\n说你的看法：${brevityRule}`;

  const result = await chat(
    { systemPrompt, userPrompt, model, maxTokens: 300 },
    mockMode,
  );

  // 简单情感分析
  const text = result.text;
  let sentiment: Utterance['sentiment'] = 'neutral';
  if (/为什么|怎么|如果|是否|有没有/.test(text)) sentiment = 'curious';
  else if (/不同意|反对|不行|错了|有问题|担心|风险/.test(text)) sentiment = 'negative';
  else if (/同意|赞|对|好|没错|确实/.test(text)) sentiment = 'positive';

  // 记录到 Agent 记忆（上限 50 条，超出删除最旧的）
  if (agent.memories.length >= 50) agent.memories.shift();
  agent.memories.push({
    tick,
    type: 'dialogue',
    content: `在讨论"${topic}"时发言：${text.slice(0, 100)}...`,
    importance: 0.5,
    relatedAgents: replyTo ? [replyTo] : [],
  });

  return {
    tick,
    round,
    agentId: agent.profile.id,
    agentName: agent.profile.name,
    content: text,
    replyTo,
    sentiment,
  };
}

/** Agent 反思（每个话题结束后） */
export async function generateReflection(
  agent: AgentState,
  topicTitle: string,
  discussionSummary: string,
  tick: number,
  mockMode: boolean,
  model: string,
): Promise<string> {
  const systemPrompt = buildSystemPrompt(agent);
  const userPrompt = `讨论"${topicTitle}"结束了。摘要：${discussionSummary}\n\n用一句话（20字以内）总结你的核心收获：`;

  const result = await chat(
    { systemPrompt, userPrompt, model, maxTokens: 150 },
    mockMode,
  );

  agent.memories.push({
    tick,
    type: 'reflection',
    content: `对"${topicTitle}"的反思：${result.text}`,
    importance: 0.8,
    relatedAgents: [],
  });

  return result.text;
}
