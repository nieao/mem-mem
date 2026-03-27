/**
 * Game Master（GM）— 讨论的裁判和中介
 * 采用 Concordia 架构：Agent 不直接通信，全部通过 GM 中转
 *
 * GM 职责：
 * 1. 选择话题、选择发言者
 * 2. 构建讨论上下文（谁说了什么）
 * 3. 总结每轮讨论
 * 4. 提取跨轮次洞察
 */

import type {
  AgentState, Topic, DiscussionRound, Utterance, SimConfig,
} from './types.js';
import { chat } from './llm.js';
import {
  calculateInterest,
  generateUtterance,
  generateReflection,
} from './agent.js';
import { OPENCLAW_CONTEXT } from './openclaw-kb.js';

/** GM 系统提示 */
const GM_SYSTEM_PROMPT = `你是 龙虾小镇的"上帝"——Game Master。

你的角色：
1. 引导讨论，但不参与具体技术辩论
2. 观察每个居民的发言，注意人格特征如何影响他们的观点
3. 用 2-3 句话总结每轮讨论的要点和值得注意的互动模式
4. 特别关注：不同人格类型之间的冲突和互补

你了解 OpenClaw 的全部知识：
${OPENCLAW_CONTEXT}

回复规则（必须严格遵守）：
- 用中文，纯文本，不用 Markdown 格式
- 简洁精炼，每次回复不超过 3 句话、80字以内
- 关注"谁"说了"什么"以及"为什么"（人格驱动的行为模式）
- 如果发现有趣的互动模式（如 INTJ 和 ENFP 的冲突），要指出来`;

/** 选择本轮发言者（基于兴趣度 + 随机性） */
export function selectSpeakers(
  agents: AgentState[],
  topic: Topic,
  count: number,
  previousSpeakers: Set<string>,
): AgentState[] {
  // 计算每个 Agent 对话题的兴趣度
  const scored = agents.map(a => ({
    agent: a,
    interest: calculateInterest(a, topic.relatedSkills),
    // 已发言者兴趣降低，避免同一人霸占话筒
    penalty: previousSpeakers.has(a.profile.id) ? 0.3 : 0,
  }));

  // 按（兴趣 - 惩罚）排序，取前 N 个
  scored.sort((a, b) => (b.interest - b.penalty) - (a.interest - a.penalty));

  // 前 70% 按兴趣选，后 30% 随机（模拟"凑热闹"的人）
  const topCount = Math.ceil(count * 0.7);
  const randomCount = count - topCount;

  const top = scored.slice(0, topCount).map(s => s.agent);
  const remaining = scored.slice(topCount);
  const randomPicks = remaining
    .sort(() => Math.random() - 0.5)
    .slice(0, randomCount)
    .map(s => s.agent);

  return [...top, ...randomPicks];
}

/** 构建讨论上下文字符串 */
function buildContext(utterances: Utterance[]): string {
  if (utterances.length === 0) return '（这是第一个发言）';
  return utterances
    .map(u => `${u.agentName}：${u.content}`)
    .join('\n\n');
}

/** 运行一轮讨论 */
export async function runDiscussionRound(
  roundNumber: number,
  topic: Topic,
  agents: AgentState[],
  config: SimConfig,
  tick: number,
  previousSpeakers: Set<string>,
  log: (msg: string) => void,
  crucixContextMap?: Map<string, string>,
): Promise<DiscussionRound> {
  log(`\n── 第 ${roundNumber} 轮 ──────────────────`);
  log(`话题：${topic.title}`);

  // 选择发言者
  const speakers = selectSpeakers(agents, topic, config.speakersPerRound, previousSpeakers);
  const speakerNames = speakers.map(s => s.profile.name).join('、');
  log(`发言者：${speakerNames}`);

  const utterances: Utterance[] = [];

  // 第一个发言者回应话题的开放问题
  for (let i = 0; i < speakers.length; i++) {
    const speaker = speakers[i];
    const context = i === 0
      ? `GM 提出问题：${topic.openingQuestion}`
      : buildContext(utterances);

    // 有概率回复前一个发言者
    const replyTo = i > 0 && Math.random() > 0.4
      ? utterances[utterances.length - 1].agentName
      : undefined;

    log(`  ${speaker.profile.name}（${speaker.profile.personality.mbti}）正在思考...`);

    const crucixCtx = crucixContextMap?.get(speaker.profile.id);
    const utterance = await generateUtterance(
      speaker,
      topic.title,
      context,
      tick + i,
      roundNumber,
      config.mockMode,
      config.model,
      replyTo,
      crucixCtx,
    );

    utterances.push(utterance);
    previousSpeakers.add(speaker.profile.id);

    // 消耗能量
    speaker.energy = Math.max(10, speaker.energy - (5 + Math.floor(Math.random() * 10)));

    log(`  ${utterance.agentName}：${utterance.content.slice(0, 80)}...`);
  }

  // GM 总结本轮
  log(`  GM 正在总结...`);
  const gmSummary = await generateGmSummary(roundNumber, topic, utterances, config);
  log(`  GM：${gmSummary.slice(0, 100)}...`);

  return {
    roundNumber,
    topic,
    participants: speakers.map(s => s.profile.id),
    utterances,
    gmSummary,
  };
}

/** GM 生成本轮总结 */
async function generateGmSummary(
  roundNumber: number,
  topic: Topic,
  utterances: Utterance[],
  config: SimConfig,
): Promise<string> {
  // 每条发言截取前 100 字
  const context = utterances
    .map(u => `${u.agentName}：${u.content.slice(0, 100)}`)
    .join('\n');

  const result = await chat({
    systemPrompt: GM_SYSTEM_PROMPT,
    userPrompt: `第${roundNumber}轮结束。话题：${topic.title}\n\n发言：\n${context}\n\n用2-3句纯文本总结关键观点和互动模式（不用Markdown）：`,
    model: config.model,
    maxTokens: 200,
  }, config.mockMode);

  return result.text;
}

/** GM 生成跨话题洞察 */
export async function generateInsights(
  rounds: DiscussionRound[],
  agents: AgentState[],
  config: SimConfig,
): Promise<string[]> {
  const roundSummaries = rounds
    .map(r => `【${r.topic.title}】${r.gmSummary.slice(0, 150)}`)
    .join('\n');

  const agentProfiles = agents.slice(0, 10)
    .map(a => `${a.profile.name}(${a.profile.personality.mbti})`)
    .join('、');

  const result = await chat({
    systemPrompt: GM_SYSTEM_PROMPT,
    userPrompt: `所有讨论已结束。

参与居民：${agentProfiles}

各轮总结：
${roundSummaries}

请提取 3 条跨话题洞察，每条一句话：
1. 人格类型如何影响 Agent 设计理念？
2. 组建 OpenClaw 团队的最佳人格搭配？
3. Agent 间沟通逻辑的深层规律？

格式："洞察N：内容"，每条不超过 50 字。`,
    model: config.model,
    maxTokens: 300,
  }, config.mockMode);

  // 按多种分隔模式分割洞察
  const raw = result.text.trim();
  const parts = raw
    .split(/(?:##\s*|洞察\d+[：:]|\*\*洞察\d+[：:]\*\*|\n{2,})/)
    .filter(s => s.trim().length > 10)
    .map(s => s.trim().replace(/^\*\*|\*\*$/g, ''));

  // 如果分割失败，按换行分割
  if (parts.length <= 1) {
    return raw.split('\n')
      .filter(s => s.trim().length > 10)
      .map(s => s.trim());
  }
  return parts;
}
