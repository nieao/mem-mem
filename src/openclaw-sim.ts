/**
 * OpenClaw 轻量模拟层
 * 每个 Agent 拥有自己的 OpenClaw：SOUL.md + 技能 + 心跳任务
 */

import type { AgentProfile, VirtualSkill, Personality } from './types.js';
import { writeFileSync, readFileSync, mkdirSync, existsSync, readdirSync } from 'fs';
import { join } from 'path';

// ── SOUL.md 生成 ──

export function generateSoulMd(agent: AgentProfile): string {
  const p = agent.personality;
  const skills = agent.skills.map(s => `- ${s.name}（Lv.${s.level}）：${s.description}`).join('\n');

  const traits: string[] = [];
  if (p.ocean.openness > 70) traits.push('好奇心旺盛，喜欢探索新领域');
  if (p.ocean.openness < 40) traits.push('偏好已知方案，谨慎对待新事物');
  if (p.ocean.conscientiousness > 70) traits.push('注重细节和流程，工作有条理');
  if (p.ocean.conscientiousness < 40) traits.push('灵活随性，偏好敏捷迭代');
  if (p.ocean.extraversion > 60) traits.push('善于沟通，主动发起对话');
  if (p.ocean.extraversion < 40) traits.push('倾听为主，发言精炼有力');
  if (p.ocean.agreeableness > 70) traits.push('友善合作，善于调和分歧');
  if (p.ocean.agreeableness < 40) traits.push('直言不讳，敢于提出不同意见');
  if (p.ocean.neuroticism > 60) traits.push('风险敏感，关注潜在问题');
  if (p.ocean.neuroticism < 40) traits.push('情绪稳定，面对压力沉着冷静');

  return `# SOUL.md — ${agent.name} 的人格配置

## 身份
- 姓名：${agent.name}
- 职业：${agent.role}
- 人格：${p.mbti}（${p.archetype}）
- 所属：龙虾小镇居民

## 核心价值观
${traits.map(t => `- ${t}`).join('\n')}

## 沟通风格
${p.communicationStyle}

## 决策风格
${p.decisionStyle}

## 专业技能
${skills}

## 安全红线
- 不泄露其他居民的私人记忆
- 不执行可能破坏小镇数据的操作
- 不冒充其他居民的身份发言
- 遇到不确定的请求时，优先请求确认

## 日常行为
- 每日心跳检查：查看 Crucix 情报中与自身技能相关的更新
- 主动整理：定期蒸馏情节记忆为知识
- 社交互动：在讨论中与性格互补的居民多交流
- 持续学习：关注自身技能领域的最新动态

## 背景故事
${agent.backstory}
`;
}

// ── 心跳模拟 ──

export interface HeartbeatTask {
  id: string;
  title: string;
  status: 'pending' | 'done';
  createdAt: string;
  completedAt?: string;
}

export function runHeartbeat(agent: AgentProfile, memoryDir: string): HeartbeatTask[] {
  const ocDir = join(memoryDir, agent.id, 'openclaw');
  mkdirSync(ocDir, { recursive: true });

  // 加载或创建心跳记录
  const hbPath = join(ocDir, 'heartbeat.json');
  let tasks: HeartbeatTask[] = [];
  if (existsSync(hbPath)) {
    try { tasks = JSON.parse(readFileSync(hbPath, 'utf-8')); } catch {}
  }

  // 生成今日默认待办（基于技能）
  const today = new Date().toISOString().slice(0, 10);
  const todayTasks = tasks.filter(t => t.createdAt.startsWith(today));
  if (todayTasks.length === 0) {
    const newTasks: HeartbeatTask[] = [];

    // 每个技能生成一个待办
    for (const skill of agent.skills.slice(0, 2)) {
      const taskMap: Record<string, string> = {
        'soul-design': '检查 SOUL.md 是否需要更新',
        'memory-arch': '蒸馏昨日情节记忆为知识',
        'security': '扫描安全日志，检查异常',
        'model-strategy': '评估今日模型使用成本',
        'skill-authoring': '检查 Skill 触发准确率',
        'multi-agent': '检查 Agent 协作队列状态',
        'channel-ops': '检查各渠道连接状态',
        'automation': '检查 Cron 任务执行记录',
        'tool-integration': '检查外部 API 可用性',
        'prompt-craft': '优化高频提示词模板',
      };
      newTasks.push({
        id: `hb-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
        title: taskMap[skill.domain] || `处理 ${skill.name} 相关任务`,
        status: 'pending',
        createdAt: new Date().toISOString(),
      });
    }

    // 通用待办
    newTasks.push({
      id: `hb-${Date.now()}-gen`,
      title: '查看今日 Crucix 情报更新',
      status: 'pending',
      createdAt: new Date().toISOString(),
    });

    tasks.push(...newTasks);
  }

  // 保存
  writeFileSync(hbPath, JSON.stringify(tasks, null, 2), 'utf-8');
  return tasks;
}

// ── OpenClaw 初始化 ──

export function initOpenClaw(agent: AgentProfile, memoryDir: string): void {
  const ocDir = join(memoryDir, agent.id, 'openclaw');
  mkdirSync(join(ocDir, 'skills'), { recursive: true });
  mkdirSync(join(ocDir, 'tasks'), { recursive: true });

  // 生成 SOUL.md
  const soulPath = join(ocDir, 'SOUL.md');
  if (!existsSync(soulPath)) {
    writeFileSync(soulPath, generateSoulMd(agent), 'utf-8');
  }

  // 生成技能文件
  for (const skill of agent.skills) {
    const skillPath = join(ocDir, 'skills', `${skill.domain}.md`);
    if (!existsSync(skillPath)) {
      writeFileSync(skillPath, `# SKILL.md — ${skill.name}\n\n` +
        `## description\n${skill.description}\n\n` +
        `## level\n${skill.level}/5\n\n` +
        `## 触发规则\n当讨论涉及 ${skill.name} 相关话题时自动激活\n`,
        'utf-8');
    }
  }
}

// ── 状态查询 ──

export function getOpenClawStatus(agent: AgentProfile, memoryDir: string): {
  soulSummary: string;
  skillCount: number;
  heartbeatTasks: HeartbeatTask[];
  taskHistoryCount: number;
} {
  const ocDir = join(memoryDir, agent.id, 'openclaw');

  // SOUL 摘要
  const soulSummary = `${agent.personality.mbti} · ${agent.personality.archetype}`;

  // 技能数
  const skillCount = agent.skills.length;

  // 心跳任务
  let heartbeatTasks: HeartbeatTask[] = [];
  const hbPath = join(ocDir, 'heartbeat.json');
  if (existsSync(hbPath)) {
    try { heartbeatTasks = JSON.parse(readFileSync(hbPath, 'utf-8')); } catch {}
  }

  // 已完成任务数
  let taskHistoryCount = 0;
  const tasksDir = join(ocDir, 'tasks');
  if (existsSync(tasksDir)) {
    try { taskHistoryCount = readdirSync(tasksDir).filter(f => f.endsWith('.html')).length; } catch {}
  }

  return { soulSummary, skillCount, heartbeatTasks, taskHistoryCount };
}
