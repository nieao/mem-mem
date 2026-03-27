/**
 * 龙虾小镇 核心类型定义
 * 龙虾小镇模拟器
 */

// ── 人格系统 ──────────────────────────────────────────

/** Big Five OCEAN 人格维度（0-100） */
export interface OceanScores {
  openness: number;        // 开放性
  conscientiousness: number; // 尽责性
  extraversion: number;    // 外向性
  agreeableness: number;   // 宜人性
  neuroticism: number;     // 神经质
}

/** MBTI 类型 */
export type MbtiType =
  | 'INTJ' | 'INTP' | 'ENTJ' | 'ENTP'
  | 'INFJ' | 'INFP' | 'ENFJ' | 'ENFP'
  | 'ISTJ' | 'ISFJ' | 'ESTJ' | 'ESFJ'
  | 'ISTP' | 'ISFP' | 'ESTP' | 'ESFP';

/** 人格档案 */
export interface Personality {
  mbti: MbtiType;
  ocean: OceanScores;
  archetype: string;       // 原型名称，如"建筑师"、"探险家"
  description: string;     // 一段话人格描述
  communicationStyle: string; // 沟通风格
  decisionStyle: string;   // 决策风格
}

// ── 虚拟技能 ──────────────────────────────────────────

/** 技能领域 */
export type SkillDomain =
  | 'soul-design'       // SOUL.md 人格设计
  | 'memory-arch'       // 记忆系统架构
  | 'security'          // 安全与权限
  | 'model-strategy'    // 模型选择策略
  | 'skill-authoring'   // Skill 编写
  | 'multi-agent'       // 多 Agent 编排
  | 'channel-ops'       // 渠道运维（Telegram等）
  | 'automation'        // 自动化与 Cron
  | 'tool-integration'  // 工具集成
  | 'prompt-craft';     // 提示词工程

/** 虚拟技能 */
export interface VirtualSkill {
  domain: SkillDomain;
  name: string;
  level: number;  // 1-5 熟练度
  description: string;
}

// ── Agent ──────────────────────────────────────────

/** Agent 记忆条目 */
export interface MemoryEntry {
  tick: number;
  type: 'observation' | 'dialogue' | 'reflection';
  content: string;
  importance: number;  // 0-1
  relatedAgents: string[];
}

/** Agent 定义 */
export interface AgentProfile {
  id: string;
  name: string;
  role: string;         // 职业/角色
  personality: Personality;
  skills: VirtualSkill[];
  backstory: string;    // 背景故事
}

/** Agent 运行时状态 */
export interface AgentState {
  profile: AgentProfile;
  memories: MemoryEntry[];
  currentMood: string;
  energy: number;       // 0-100，影响发言意愿
  recentTopics: string[];
}

// ── 讨论系统 ──────────────────────────────────────────

/** 讨论话题 */
export interface Topic {
  id: string;
  title: string;
  description: string;
  relatedSkills: SkillDomain[];
  openingQuestion: string;
  source?: 'openclaw' | 'custom' | 'crucix';  // 话题来源
  crucixDomains?: string[];  // 关联的 Crucix 数据领域
}

/** 单条发言 */
export interface Utterance {
  tick: number;
  round: number;
  agentId: string;
  agentName: string;
  content: string;
  replyTo?: string;     // 回复的 agentId
  sentiment: 'positive' | 'neutral' | 'negative' | 'curious';
}

/** 讨论轮次 */
export interface DiscussionRound {
  roundNumber: number;
  topic: Topic;
  participants: string[];  // agent IDs
  utterances: Utterance[];
  gmSummary: string;
}

/** 完整模拟记录 */
export interface SimulationLog {
  startTime: string;
  endTime?: string;
  agents: AgentProfile[];
  topics: Topic[];
  rounds: DiscussionRound[];
  insights: string[];    // GM 提取的跨轮次洞察
  metadata: {
    totalUtterances: number;
    totalRounds: number;
    avgUtterancesPerRound: number;
    mostActiveAgents: { name: string; count: number }[];
    topicCoverage: { topic: string; depth: number }[];
  };
}

// ── 配置 ──────────────────────────────────────────

export interface SimConfig {
  agentCount: number;         // 居民数量
  roundsPerTopic: number;     // 每个话题讨论轮数
  speakersPerRound: number;   // 每轮发言人数
  topicCount: number;         // 讨论话题数
  model: string;              // LLM 模型
  mockMode: boolean;          // mock 模式（不调用 LLM）
  maxTokensPerUtterance: number;
  outputDir: string;
  // Phase 1: 自定义话题
  customTopics?: string[];    // --topic "xxx" 自定义话题文本
  customTopicFile?: string;   // --topic-file path 话题 JSON 文件
  topicMode?: 'custom' | 'default' | 'mixed';  // 话题模式
  // Phase 2: Crucix 集成
  crucixEnabled?: boolean;    // 是否启用 Crucix（默认 true）
  // Phase 3: 记忆系统
  persistMemory?: boolean;    // 是否持久化记忆（默认 true）
  memoryDir?: string;         // 记忆文件目录
  // 任务系统
  serve?: boolean;            // --serve 启动交互服务器
  serverPort?: number;        // 服务器端口（默认 3456）
  tokenBudget?: number;       // Token 预算上限（默认无限）
}

// ── 任务系统 ──────────────────────────────────────────

/** 任务模板 */
export interface TaskTemplate {
  id: string;
  label: string;
  prompt: string;
  relatedSkills: SkillDomain[];
  category: 'general' | 'openclaw';
}

/** 任务请求 */
export interface TaskRequest {
  agentId: string;
  agentIndex: number;
  taskType: string;       // 模板 ID 或 'custom'
  taskPrompt: string;     // 实际任务描述
}

/** 任务结果 */
export interface TaskResult {
  agentId: string;
  agentName: string;
  taskPrompt: string;
  content: string;        // LLM 生成的内容
  timestamp: string;
  durationMs: number;
  savedPath?: string;     // 保存的 HTML 文件路径
}

/** OpenClaw 模拟状态 */
export interface OpenClawStatus {
  soulSummary: string;    // SOUL.md 摘要
  skillCount: number;
  heartbeatTasks: string[];  // 待办列表
  lastHeartbeat: string;
  taskHistory: { title: string; time: string }[];
}

// ── 能力系统 ──────────────────────────────────────────

/** 能力执行器类型 */
export type CapabilityType = 'claude-skill' | 'ollama' | 'comfyui';

/** 安全等级 */
export type SecurityLevel = 'low' | 'medium' | 'high';

/** 赏金状态 */
export type BountyStatus = 'open' | 'assigned' | 'in-progress' | 'completed' | 'failed' | 'expired';

/** 托管状态 */
export type EscrowStatus = 'locked' | 'released' | 'refunded';

/** 卡牌稀有度 */
export type CardRarity = 'common' | 'rare' | 'epic';
