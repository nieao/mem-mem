/**
 * Agent 养成系统 — 经验值、等级、技能升级、OCEAN 微漂移
 */

import type { AgentState, DiscussionRound, VirtualSkill, OceanScores, SkillDomain } from './types.js';
import { AgentMemoryStore } from './memory-store.js';
import { writeFileSync, readFileSync, existsSync } from 'fs';
import { join } from 'path';

// ── 成长记录 ──

export interface AgentGrowthRecord {
  agentId: string;
  level: number;           // 1-10
  totalXP: number;
  discussionCount: number;
  topicsDiscussed: string[];
  insightsGenerated: number;
  relationships: Record<string, number>;  // agentName → 互动次数
  skillXP: Record<string, number>;         // SkillDomain → 经验值
  oceanDrift: Partial<OceanScores>;        // 累积 OCEAN 漂移
}

// ── 常量 ──

const XP_TABLE = {
  utterance: 10,
  reflection: 25,
  replyReceived: 15,
  insightMentioned: 30,
};

const LEVEL_THRESHOLDS = [0, 100, 300, 600, 1000, 1500, 2200, 3000, 4000, 5200];

const SKILL_XP_PER_LEVEL = 50;
const MAX_SKILL_LEVEL = 5;
const MAX_OCEAN_DRIFT_PER_SESSION = 2;

// ── 核心引擎 ──

export class CultivationEngine {
  private memoryDir: string;

  constructor(memoryDir: string) {
    this.memoryDir = memoryDir;
  }

  /** 加载成长记录 */
  loadGrowth(agentId: string): AgentGrowthRecord {
    const p = join(this.memoryDir, agentId, 'growth.json');
    if (existsSync(p)) {
      try { return JSON.parse(readFileSync(p, 'utf-8')); } catch {}
    }
    return {
      agentId,
      level: 1,
      totalXP: 0,
      discussionCount: 0,
      topicsDiscussed: [],
      insightsGenerated: 0,
      relationships: {},
      skillXP: {},
      oceanDrift: {},
    };
  }

  /** 保存成长记录 */
  saveGrowth(record: AgentGrowthRecord): void {
    const dir = join(this.memoryDir, record.agentId);
    const p = join(dir, 'growth.json');
    writeFileSync(p, JSON.stringify(record, null, 2), 'utf-8');
  }

  /** 处理一次会话的结果，返回成长变化 */
  processSession(
    agent: AgentState,
    rounds: DiscussionRound[],
    insights: string[],
  ): {
    xpGained: number;
    leveledUp: boolean;
    newLevel: number;
    skillLevelUps: string[];
    oceanShift: Partial<OceanScores>;
  } {
    const record = this.loadGrowth(agent.profile.id);
    let xpGained = 0;

    // 统计本次会话的参与情况
    const participatedRounds = rounds.filter(r =>
      r.utterances.some(u => u.agentId === agent.profile.id)
    );

    // 1. 发言 XP
    for (const round of participatedRounds) {
      for (const u of round.utterances) {
        if (u.agentId === agent.profile.id) {
          xpGained += XP_TABLE.utterance;
          // 记录话题
          if (!record.topicsDiscussed.includes(round.topic.title)) {
            record.topicsDiscussed.push(round.topic.title);
          }
          // 技能 XP：话题相关技能获得经验
          for (const skill of round.topic.relatedSkills) {
            record.skillXP[skill] = (record.skillXP[skill] || 0) + 5;
          }
        }
      }
    }

    // 2. 被回复 XP
    for (const round of rounds) {
      for (const u of round.utterances) {
        if (u.replyTo === agent.profile.name || u.replyTo === agent.profile.id) {
          xpGained += XP_TABLE.replyReceived;
          // 记录关系
          record.relationships[u.agentName] = (record.relationships[u.agentName] || 0) + 1;
        }
      }
    }

    // 3. 反思 XP
    const reflections = agent.memories.filter(m => m.type === 'reflection');
    xpGained += reflections.length * XP_TABLE.reflection;

    // 4. 洞察提及 XP
    const name = agent.profile.name;
    for (const insight of insights) {
      if (insight.includes(name)) {
        xpGained += XP_TABLE.insightMentioned;
        record.insightsGenerated++;
      }
    }

    // 更新总 XP 和等级
    record.totalXP += xpGained;
    record.discussionCount++;
    const oldLevel = record.level;
    record.level = this.calculateLevel(record.totalXP);
    const leveledUp = record.level > oldLevel;

    // 5. 技能升级检查
    const skillLevelUps: string[] = [];
    for (const skill of agent.profile.skills) {
      const xp = record.skillXP[skill.domain] || 0;
      const newLevel = Math.min(MAX_SKILL_LEVEL, 1 + Math.floor(xp / SKILL_XP_PER_LEVEL));
      if (newLevel > skill.level) {
        skill.level = newLevel;
        skillLevelUps.push(skill.name);
      }
    }

    // 6. OCEAN 微漂移
    const oceanShift = this.calculateOceanDrift(agent, participatedRounds);
    // 累积漂移
    for (const [key, val] of Object.entries(oceanShift)) {
      const k = key as keyof OceanScores;
      record.oceanDrift[k] = (record.oceanDrift[k] || 0) + (val as number);
    }

    // 7. 新技能习得（skillXP 达到阈值且 Agent 未拥有该技能且技能数 < 5）
    const newSkillsAcquired: string[] = [];
    const allDomains: SkillDomain[] = ['soul-design', 'memory-arch', 'security', 'model-strategy', 'skill-authoring', 'multi-agent', 'channel-ops', 'automation', 'tool-integration', 'prompt-craft'];
    const currentDomains = new Set(agent.profile.skills.map(s => s.domain));
    if (agent.profile.skills.length < 5) {
      // 技能习得阈值随数量递增：第3个30, 第4个50, 第5个80
      const thresholds = [30, 30, 30, 50, 80];
      const threshold = thresholds[Math.min(agent.profile.skills.length, 4)];
      for (const domain of allDomains) {
        if (currentDomains.has(domain)) continue;
        if ((record.skillXP[domain] || 0) >= threshold) {
          // 习得新技能
          const skillNames: Record<string, string> = {
            'soul-design': 'SOUL.md 人格设计', 'memory-arch': '记忆系统架构',
            'security': '安全与权限管理', 'model-strategy': '模型选择策略',
            'skill-authoring': 'Skill 编写专家', 'multi-agent': '多 Agent 编排',
            'channel-ops': '渠道运维', 'automation': '自动化与定时任务',
            'tool-integration': '工具集成', 'prompt-craft': '提示词工程',
          };
          agent.profile.skills.push({
            domain, name: skillNames[domain] || domain, level: 1,
            description: `通过讨论和实践习得的新技能（XP: ${record.skillXP[domain]}）`,
          } as VirtualSkill);
          currentDomains.add(domain);
          newSkillsAcquired.push(skillNames[domain] || domain);
          if (agent.profile.skills.length >= 5) break;
        }
      }
    }

    // 8. OCEAN 漂移回写到 core.json（使实际人格发生变化）
    this.applyEvolution(agent, record, newSkillsAcquired);

    this.saveGrowth(record);

    return {
      xpGained,
      leveledUp,
      newLevel: record.level,
      skillLevelUps: [...skillLevelUps, ...newSkillsAcquired.map(s => s + '(NEW)')],
      oceanShift,
    };
  }

  /** 将成长数据回写到 core.json，使 Agent 真正演化 */
  private applyEvolution(agent: AgentState, record: AgentGrowthRecord, newSkills: string[]): void {
    const corePath = join(this.memoryDir, agent.profile.id, 'core.json');
    if (!existsSync(corePath)) return;

    try {
      const core = JSON.parse(readFileSync(corePath, 'utf-8'));

      // OCEAN 漂移应用到实际值（限制距初始值 +-20）
      const ocean = core.personality?.ocean;
      if (ocean && record.oceanDrift) {
        for (const [key, drift] of Object.entries(record.oceanDrift)) {
          if (drift && ocean[key] !== undefined) {
            ocean[key] = Math.max(0, Math.min(100, ocean[key] + Math.round(drift as number)));
          }
        }
      }

      // 技能持久化
      if (core.skills && agent.profile.skills) {
        core.skills = agent.profile.skills.map(s => ({
          domain: s.domain, name: s.name, level: s.level, description: s.description,
        }));
      }

      // 记录演化历史
      if (!core.evolutionHistory) core.evolutionHistory = [];
      const changes: string[] = [];
      if (Object.keys(record.oceanDrift).length > 0) {
        const driftStr = Object.entries(record.oceanDrift)
          .filter(([_, v]) => Math.abs(v as number) > 0)
          .map(([k, v]) => `${k}${(v as number) > 0 ? '+' : ''}${v}`)
          .join(', ');
        if (driftStr) changes.push('OCEAN: ' + driftStr);
      }
      if (newSkills.length > 0) changes.push('新技能: ' + newSkills.join(', '));
      if (changes.length > 0) {
        core.evolutionHistory.push({
          session: record.discussionCount,
          changes: changes.join(' | '),
          timestamp: new Date().toISOString(),
        });
        // 保留最近 20 条
        if (core.evolutionHistory.length > 20) core.evolutionHistory = core.evolutionHistory.slice(-20);
      }

      writeFileSync(corePath, JSON.stringify(core, null, 2), 'utf-8');
    } catch {}
  }

  /** 计算等级 */
  private calculateLevel(xp: number): number {
    for (let i = LEVEL_THRESHOLDS.length - 1; i >= 0; i--) {
      if (xp >= LEVEL_THRESHOLDS[i]) return i + 1;
    }
    return 1;
  }

  /** 计算 OCEAN 微漂移 */
  private calculateOceanDrift(
    agent: AgentState,
    participatedRounds: DiscussionRound[],
  ): Partial<OceanScores> {
    const drift: Partial<OceanScores> = {};
    if (participatedRounds.length === 0) return drift;

    // 多次发言 → 外向性 +
    const utteranceCount = participatedRounds.reduce((sum, r) =>
      sum + r.utterances.filter(u => u.agentId === agent.profile.id).length, 0
    );
    if (utteranceCount >= 3) {
      drift.extraversion = Math.min(MAX_OCEAN_DRIFT_PER_SESSION, 1);
    }

    // 讨论情绪统计
    let positiveCount = 0, negativeCount = 0, curiousCount = 0;
    for (const r of participatedRounds) {
      for (const u of r.utterances) {
        if (u.agentId === agent.profile.id) {
          if (u.sentiment === 'positive') positiveCount++;
          if (u.sentiment === 'negative') negativeCount++;
          if (u.sentiment === 'curious') curiousCount++;
        }
      }
    }

    // 多积极发言 → 宜人性 +
    if (positiveCount >= 2) drift.agreeableness = 1;
    // 多好奇发言 → 开放性 +
    if (curiousCount >= 2) drift.openness = 1;
    // 多消极发言 → 神经质 +
    if (negativeCount >= 2) drift.neuroticism = 1;

    return drift;
  }
}
