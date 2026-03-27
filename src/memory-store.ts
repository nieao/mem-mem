/**
 * 三层渐进式记忆系统
 *
 * Layer 1 (core.json):     身份 — 人格、技能、创建时间（极少变化）
 * Layer 2 (knowledge.json): 知识 — 从讨论中蒸馏的洞察和事实（累积增长）
 * Layer 3 (episodes.json):  情节 — 具体的讨论和互动记录（带衰减）
 * Daily (daily/{date}.json): 每日外部情报（Crucix 数据）
 */

import { writeFileSync, readFileSync, mkdirSync, existsSync, readdirSync } from 'fs';
import { join } from 'path';
import type { Personality, VirtualSkill, MemoryEntry } from './types.js';

// ── 记忆层类型定义 ──

export interface CoreMemory {
  agentId: string;
  name: string;
  role: string;
  personality: Personality;
  skills: VirtualSkill[];
  createdAt: string;
  sessionCount: number;
  lastSessionAt: string;
}

export interface KnowledgeEntry {
  id: string;
  content: string;
  source: string;       // 来源话题/会话
  importance: number;   // 0-1
  createdAt: string;
  accessCount: number;
}

export interface EpisodeEntry {
  id: string;
  sessionId: string;
  type: 'utterance' | 'reflection' | 'interaction';
  content: string;
  relatedAgents: string[];
  topic: string;
  timestamp: string;
  decayFactor: number;  // 0-1，随时间衰减
}

export interface DailyData {
  date: string;
  crucixSummary: string;
  highlights: string[];
  discussedTopics: string[];
}

// ── AgentMemoryStore ──

export class AgentMemoryStore {
  private baseDir: string;
  private agentDir: string;
  private agentId: string;

  constructor(baseDir: string, agentId: string) {
    this.baseDir = baseDir;
    this.agentId = agentId;
    this.agentDir = join(baseDir, agentId);
    mkdirSync(this.agentDir, { recursive: true });
    mkdirSync(join(this.agentDir, 'daily'), { recursive: true });
  }

  // ── Layer 1: Core（身份） ──

  loadCore(): CoreMemory | null {
    const p = join(this.agentDir, 'core.json');
    if (!existsSync(p)) return null;
    try {
      return JSON.parse(readFileSync(p, 'utf-8'));
    } catch { return null; }
  }

  saveCore(core: CoreMemory): void {
    writeFileSync(join(this.agentDir, 'core.json'), JSON.stringify(core, null, 2), 'utf-8');
  }

  // ── Layer 2: Knowledge（知识） ──

  loadKnowledge(): KnowledgeEntry[] {
    const p = join(this.agentDir, 'knowledge.json');
    if (!existsSync(p)) return [];
    try {
      return JSON.parse(readFileSync(p, 'utf-8'));
    } catch { return []; }
  }

  saveKnowledge(entries: KnowledgeEntry[]): void {
    writeFileSync(join(this.agentDir, 'knowledge.json'), JSON.stringify(entries, null, 2), 'utf-8');
  }

  addKnowledge(content: string, source: string, importance: number): void {
    const entries = this.loadKnowledge();
    // 去重：相似内容不重复添加
    if (entries.some(e => e.content.slice(0, 40) === content.slice(0, 40))) return;
    entries.push({
      id: `k-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      content,
      source,
      importance,
      createdAt: new Date().toISOString(),
      accessCount: 0,
    });
    // 知识上限 200 条，溢出时删除最不重要的
    if (entries.length > 200) {
      entries.sort((a, b) => b.importance - a.importance);
      entries.length = 200;
    }
    this.saveKnowledge(entries);
  }

  /** 获取与话题相关的知识（简单关键词匹配） */
  getRelevantKnowledge(topic: string, limit = 5): KnowledgeEntry[] {
    const entries = this.loadKnowledge();
    const keywords = topic.split(/[，。？！：\s]+/).filter(k => k.length > 1);

    const scored = entries.map(e => {
      let score = e.importance;
      for (const kw of keywords) {
        if (e.content.includes(kw)) score += 0.2;
      }
      return { entry: e, score };
    });
    scored.sort((a, b) => b.score - a.score);

    // 更新 accessCount
    const top = scored.slice(0, limit);
    for (const { entry } of top) entry.accessCount++;
    this.saveKnowledge(entries);

    return top.map(s => s.entry);
  }

  // ── Layer 3: Episodes（情节） ──

  loadEpisodes(limit?: number): EpisodeEntry[] {
    const p = join(this.agentDir, 'episodes.json');
    if (!existsSync(p)) return [];
    try {
      const all: EpisodeEntry[] = JSON.parse(readFileSync(p, 'utf-8'));
      return limit ? all.slice(-limit) : all;
    } catch { return []; }
  }

  saveEpisodes(entries: EpisodeEntry[]): void {
    writeFileSync(join(this.agentDir, 'episodes.json'), JSON.stringify(entries, null, 2), 'utf-8');
  }

  addEpisode(params: {
    sessionId: string;
    type: EpisodeEntry['type'];
    content: string;
    relatedAgents: string[];
    topic: string;
  }): void {
    const entries = this.loadEpisodes();
    entries.push({
      id: `e-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      sessionId: params.sessionId,
      type: params.type,
      content: params.content,
      relatedAgents: params.relatedAgents,
      topic: params.topic,
      timestamp: new Date().toISOString(),
      decayFactor: 1.0,
    });
    // 情节上限 500 条
    if (entries.length > 500) entries.splice(0, entries.length - 500);
    this.saveEpisodes(entries);
  }

  /** 衰减旧情节，删除过期的 */
  applyDecay(): { removed: number; distilled: number } {
    const entries = this.loadEpisodes();
    const now = Date.now();
    let removed = 0;
    let distilled = 0;

    for (const e of entries) {
      const daysSince = (now - new Date(e.timestamp).getTime()) / (1000 * 60 * 60 * 24);
      e.decayFactor = Math.pow(0.95, daysSince);
    }

    // 蒸馏：重要的旧情节提升为知识
    const toDistill = entries.filter(e => e.decayFactor < 0.3 && e.content.length > 20);
    for (const e of toDistill) {
      // importance > 0.5 的情节蒸馏为知识
      if (e.type === 'reflection' || e.content.length > 50) {
        this.addKnowledge(
          e.content.slice(0, 200),
          `讨论「${e.topic}」`,
          0.6,
        );
        distilled++;
      }
    }

    // 删除过期的
    const alive = entries.filter(e => e.decayFactor >= 0.1);
    removed = entries.length - alive.length;
    this.saveEpisodes(alive);

    return { removed, distilled };
  }

  // ── Daily（每日外部情报） ──

  saveDailyData(date: string, data: DailyData): void {
    const p = join(this.agentDir, 'daily', `${date}.json`);
    writeFileSync(p, JSON.stringify(data, null, 2), 'utf-8');
  }

  loadDailyData(date: string): DailyData | null {
    const p = join(this.agentDir, 'daily', `${date}.json`);
    if (!existsSync(p)) return null;
    try {
      return JSON.parse(readFileSync(p, 'utf-8'));
    } catch { return null; }
  }

  /** 获取最近 N 天的每日数据 */
  getRecentDailyData(days = 3): DailyData[] {
    const dailyDir = join(this.agentDir, 'daily');
    if (!existsSync(dailyDir)) return [];
    try {
      const files = readdirSync(dailyDir)
        .filter(f => f.endsWith('.json'))
        .sort()
        .reverse()
        .slice(0, days);
      return files.map(f => {
        try { return JSON.parse(readFileSync(join(dailyDir, f), 'utf-8')); }
        catch { return null; }
      }).filter(Boolean) as DailyData[];
    } catch { return []; }
  }

  // ── 汇总统计 ──

  getStats(): { episodes: number; knowledge: number; dailyFiles: number; sessionCount: number } {
    const core = this.loadCore();
    const dailyDir = join(this.agentDir, 'daily');
    let dailyFiles = 0;
    try { dailyFiles = readdirSync(dailyDir).filter(f => f.endsWith('.json')).length; } catch {}
    return {
      episodes: this.loadEpisodes().length,
      knowledge: this.loadKnowledge().length,
      dailyFiles,
      sessionCount: core?.sessionCount || 0,
    };
  }
}

/** 检查是否有已保存的 Agent 记忆 */
export function hasExistingMemories(baseDir: string): boolean {
  if (!existsSync(baseDir)) return false;
  try {
    const dirs = readdirSync(baseDir).filter(d =>
      existsSync(join(baseDir, d, 'core.json'))
    );
    return dirs.length > 0;
  } catch { return false; }
}

/** 加载所有已保存的 Agent ID */
export function loadExistingAgentIds(baseDir: string): string[] {
  if (!existsSync(baseDir)) return [];
  try {
    return readdirSync(baseDir).filter(d =>
      existsSync(join(baseDir, d, 'core.json'))
    );
  } catch { return []; }
}
