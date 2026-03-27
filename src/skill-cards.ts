/**
 * 技能卡牌系统 — Agent 能力的游戏化表达
 * 每张卡牌是一个原子能力，有能量消耗、冷却时间和 Combo 连携
 */

import type { AgentProfile, SkillDomain, VirtualSkill } from './types.js';

// ══════════════════════════════════════
// 类型定义
// ══════════════════════════════════════

/** 能力执行器类型 */
export type ExecutorType = 'claude-skill' | 'ollama' | 'comfyui';

/** 卡牌稀有度 */
export type CardRarity = 'common' | 'rare' | 'epic';

/** 技能卡牌定义 */
export interface SkillCard {
  id: string;
  name: string;
  description: string;
  executor: ExecutorType;
  relatedDomains: SkillDomain[];    // 对应的虚拟技能域
  energyCost: number;               // 能量消耗（20-50）
  cooldownMinutes: number;          // 冷却时间（分钟）
  rarity: CardRarity;
  level: number;                    // 1-5，影响效果和冷却
  // 执行器配置
  executorConfig: {
    model?: string;                 // claude 模型
    ollamaModel?: string;           // ollama 模型
    comfyuiWorkflow?: string;       // comfyui 工作流模板 ID
    systemPrompt?: string;          // 系统提示词
    maxTokens?: number;
    timeoutMs?: number;
  };
}

/** Combo 连携定义 */
export interface ComboRule {
  id: string;
  name: string;
  cards: [string, string];          // 两张卡牌 ID
  bonus: {
    qualityMultiplier: number;      // 质量加成（如 1.2 = +20%）
    rewardMultiplier: number;       // 奖励加成
    reputationBonus: number;        // 声誉加成
  };
  description: string;
}

/** Agent 手牌 */
export interface AgentHand {
  agentId: string;
  cards: SkillCard[];               // 持有的卡牌
  energy: number;                   // 当前能量（0-100）
  maxEnergy: number;                // 最大能量
  cooldowns: Map<string, number>;   // cardId -> 冷却结束时间戳
  dailyUsage: { date: string; count: number };
}

/** 出牌结果 */
export interface PlayCardResult {
  success: boolean;
  cardId: string;
  combo?: { comboId: string; comboName: string; bonus: ComboRule['bonus'] };
  message: string;
  remainingEnergy: number;
  cooldownUntil?: number;
}

// ══════════════════════════════════════
// 卡牌注册表 — 13 张初始卡牌
// ══════════════════════════════════════

export const CARD_REGISTRY: SkillCard[] = [
  // ── Claude 系 · 6 张 ──
  {
    id: 'claude-code-review',
    name: '代码审查',
    description: '分析代码质量、发现问题、输出审查报告',
    executor: 'claude-skill',
    relatedDomains: ['skill-authoring', 'security'],
    energyCost: 35,
    cooldownMinutes: 60,
    rarity: 'rare',
    level: 1,
    executorConfig: {
      systemPrompt: '你是代码审查专家。分析提供的代码，指出问题和改进建议。输出结构化审查报告。',
      maxTokens: 4000,
      timeoutMs: 60_000,
    },
  },
  {
    id: 'claude-write-soul',
    name: 'SOUL 设计',
    description: '生成 Agent 人格配置文件（SOUL.md）',
    executor: 'claude-skill',
    relatedDomains: ['soul-design'],
    energyCost: 40,
    cooldownMinutes: 120,
    rarity: 'rare',
    level: 1,
    executorConfig: {
      systemPrompt: '你是 SOUL.md 设计专家。根据需求生成完整的 Agent 人格配置，包括身份、价值观、沟通风格、安全红线。',
      maxTokens: 4000,
      timeoutMs: 60_000,
    },
  },
  {
    id: 'claude-security-audit',
    name: '安全审计',
    description: '检查代码/配置的安全漏洞，输出风险报告',
    executor: 'claude-skill',
    relatedDomains: ['security'],
    energyCost: 40,
    cooldownMinutes: 90,
    rarity: 'epic',
    level: 1,
    executorConfig: {
      systemPrompt: '你是安全审计专家。检查提供的代码或配置，识别安全漏洞（注入、权限、泄露等），输出风险等级和修复建议。',
      maxTokens: 4000,
      timeoutMs: 60_000,
    },
  },
  {
    id: 'claude-write-skill',
    name: 'SKILL 编写',
    description: '撰写 OpenClaw 技能规范（SKILL.md）',
    executor: 'claude-skill',
    relatedDomains: ['skill-authoring'],
    energyCost: 35,
    cooldownMinutes: 60,
    rarity: 'common',
    level: 1,
    executorConfig: {
      systemPrompt: '你是 Skill 编写专家。根据需求生成完整的 SKILL.md 规范，包括触发条件、执行步骤、输出格式。',
      maxTokens: 4000,
      timeoutMs: 60_000,
    },
  },
  {
    id: 'claude-prompt-optimize',
    name: '提示词优化',
    description: '分析并优化 prompt，提升 LLM 输出质量',
    executor: 'claude-skill',
    relatedDomains: ['prompt-craft'],
    energyCost: 25,
    cooldownMinutes: 30,
    rarity: 'common',
    level: 1,
    executorConfig: {
      systemPrompt: '你是提示词工程专家。分析给定的 prompt，找出模糊、冗余或低效之处，输出优化后版本并说明改进理由。',
      maxTokens: 3000,
      timeoutMs: 45_000,
    },
  },
  {
    id: 'claude-orchestration',
    name: '架构规划',
    description: '设计多 Agent 编排方案和工作流',
    executor: 'claude-skill',
    relatedDomains: ['multi-agent', 'automation'],
    energyCost: 45,
    cooldownMinutes: 120,
    rarity: 'epic',
    level: 1,
    executorConfig: {
      systemPrompt: '你是多 Agent 系统架构师。根据需求设计 Agent 分工、通信协议、任务编排方案，输出架构图和实施步骤。',
      maxTokens: 5000,
      timeoutMs: 90_000,
    },
  },

  // ── Ollama 系 · 4 张 ──
  {
    id: 'ollama-summarize',
    name: '文本摘要',
    description: '长文精炼压缩，提取核心要点',
    executor: 'ollama',
    relatedDomains: ['prompt-craft', 'memory-arch'],
    energyCost: 20,
    cooldownMinutes: 15,
    rarity: 'common',
    level: 1,
    executorConfig: {
      ollamaModel: 'qwen2.5:7b',
      systemPrompt: '你是摘要专家。将提供的文本精炼为核心要点，保留关键信息，去除冗余。',
      maxTokens: 2000,
      timeoutMs: 30_000,
    },
  },
  {
    id: 'ollama-translate',
    name: '智能翻译',
    description: '高质量多语言互译',
    executor: 'ollama',
    relatedDomains: ['channel-ops', 'prompt-craft'],
    energyCost: 20,
    cooldownMinutes: 10,
    rarity: 'common',
    level: 1,
    executorConfig: {
      ollamaModel: 'qwen2.5:7b',
      systemPrompt: '你是翻译专家。准确翻译提供的文本，保持原文风格和语境。如未指定目标语言，默认中英互译。',
      maxTokens: 2000,
      timeoutMs: 30_000,
    },
  },
  {
    id: 'ollama-analyze',
    name: '数据分析',
    description: '结构化数据洞察和趋势分析',
    executor: 'ollama',
    relatedDomains: ['model-strategy', 'tool-integration'],
    energyCost: 30,
    cooldownMinutes: 30,
    rarity: 'rare',
    level: 1,
    executorConfig: {
      ollamaModel: 'qwen2.5:7b',
      systemPrompt: '你是数据分析师。分析提供的数据，识别模式和趋势，输出结构化洞察报告。',
      maxTokens: 3000,
      timeoutMs: 45_000,
    },
  },
  {
    id: 'ollama-embeddings',
    name: '嵌入生成',
    description: '将文本转为语义向量，用于检索和聚类',
    executor: 'ollama',
    relatedDomains: ['memory-arch'],
    energyCost: 15,
    cooldownMinutes: 5,
    rarity: 'common',
    level: 1,
    executorConfig: {
      ollamaModel: 'nomic-embed-text',
      maxTokens: 1000,
      timeoutMs: 15_000,
    },
  },

  // ── ComfyUI 系 · 3 张 ──
  {
    id: 'comfyui-txt2img',
    name: '文生图',
    description: '根据文字描述生成图片',
    executor: 'comfyui',
    relatedDomains: ['prompt-craft', 'tool-integration'],
    energyCost: 50,
    cooldownMinutes: 120,
    rarity: 'epic',
    level: 1,
    executorConfig: {
      comfyuiWorkflow: 'txt2img-flux',
      timeoutMs: 180_000,
    },
  },
  {
    id: 'comfyui-img2img',
    name: '图生图',
    description: '基于参考图进行风格变换或细节修改',
    executor: 'comfyui',
    relatedDomains: ['tool-integration'],
    energyCost: 45,
    cooldownMinutes: 90,
    rarity: 'rare',
    level: 1,
    executorConfig: {
      comfyuiWorkflow: 'img2img-flux',
      timeoutMs: 180_000,
    },
  },
  {
    id: 'comfyui-portrait',
    name: '角色立绘',
    description: '生成风格化角色形象立绘',
    executor: 'comfyui',
    relatedDomains: ['soul-design', 'prompt-craft'],
    energyCost: 50,
    cooldownMinutes: 120,
    rarity: 'epic',
    level: 1,
    executorConfig: {
      comfyuiWorkflow: 'portrait-flux',
      timeoutMs: 180_000,
    },
  },
];

// ══════════════════════════════════════
// Combo 连携表
// ══════════════════════════════════════

export const COMBO_RULES: ComboRule[] = [
  {
    id: 'combo-visual-report',
    name: '图文报告',
    cards: ['ollama-summarize', 'comfyui-txt2img'],
    bonus: { qualityMultiplier: 1.2, rewardMultiplier: 1.15, reputationBonus: 5 },
    description: '摘要 + 文生图 = 图文并茂的分析报告',
  },
  {
    id: 'combo-persona-pack',
    name: '完整人格包',
    cards: ['claude-write-soul', 'comfyui-portrait'],
    bonus: { qualityMultiplier: 1.3, rewardMultiplier: 1.3, reputationBonus: 10 },
    description: 'SOUL设计 + 角色立绘 = Agent 人格全套交付',
  },
  {
    id: 'combo-secure-review',
    name: '安全代码报告',
    cards: ['claude-code-review', 'claude-security-audit'],
    bonus: { qualityMultiplier: 1.25, rewardMultiplier: 1.2, reputationBonus: 8 },
    description: '代码审查 + 安全审计 = 全方位代码安全报告',
  },
  {
    id: 'combo-smart-analysis',
    name: '智能分析',
    cards: ['claude-prompt-optimize', 'ollama-analyze'],
    bonus: { qualityMultiplier: 1.2, rewardMultiplier: 1.15, reputationBonus: 5 },
    description: '提示词优化 + 数据分析 = 精准数据洞察',
  },
  {
    id: 'combo-skill-suite',
    name: '技能全套',
    cards: ['claude-write-skill', 'claude-write-soul'],
    bonus: { qualityMultiplier: 1.15, rewardMultiplier: 1.1, reputationBonus: 5 },
    description: 'SKILL编写 + SOUL设计 = Agent 配置全包',
  },
  {
    id: 'combo-translate-visual',
    name: '多语可视化',
    cards: ['ollama-translate', 'comfyui-txt2img'],
    bonus: { qualityMultiplier: 1.15, rewardMultiplier: 1.1, reputationBonus: 3 },
    description: '翻译 + 文生图 = 多语言图文内容',
  },
];

// ══════════════════════════════════════
// 技能域 → 卡牌映射
// ══════════════════════════════════════

/** 根据虚拟技能域获取对应卡牌 */
export function getCardsForDomain(domain: SkillDomain): SkillCard[] {
  return CARD_REGISTRY.filter(c => c.relatedDomains.includes(domain));
}

// ══════════════════════════════════════
// 手牌管理
// ══════════════════════════════════════

/** Agent 手牌缓存 */
const agentHands = new Map<string, AgentHand>();

/** 为 Agent 分配手牌（基于虚拟技能 + 人格） */
export function assignHand(agent: AgentProfile): AgentHand {
  const existing = agentHands.get(agent.id);
  if (existing) return existing;

  // 收集 Agent 技能域对应的所有卡牌
  const candidateIds = new Set<string>();
  for (const skill of agent.skills) {
    const domainCards = getCardsForDomain(skill.domain);
    for (const card of domainCards) {
      candidateIds.add(card.id);
    }
  }

  // 从候选中选取卡牌，根据技能等级调整卡牌等级
  const cards: SkillCard[] = [];
  for (const cardId of candidateIds) {
    const template = CARD_REGISTRY.find(c => c.id === cardId)!;
    // 找到最相关的技能，用其等级作为卡牌等级
    const relevantSkill = agent.skills.find(s => template.relatedDomains.includes(s.domain));
    const cardLevel = relevantSkill ? relevantSkill.level : 1;

    cards.push({
      ...template,
      level: cardLevel,
      // 高等级卡牌：冷却缩短、能量减少
      cooldownMinutes: Math.max(5, Math.round(template.cooldownMinutes * (1 - (cardLevel - 1) * 0.1))),
      energyCost: Math.max(10, Math.round(template.energyCost * (1 - (cardLevel - 1) * 0.05))),
    });
  }

  // 能量上限基于尽责性（conscientiousness）
  const maxEnergy = 80 + Math.round(agent.personality.ocean.conscientiousness * 0.2);

  const hand: AgentHand = {
    agentId: agent.id,
    cards,
    energy: maxEnergy,
    maxEnergy,
    cooldowns: new Map(),
    dailyUsage: { date: new Date().toISOString().slice(0, 10), count: 0 },
  };

  agentHands.set(agent.id, hand);
  return hand;
}

/** 获取 Agent 手牌（只读） */
export function getHand(agentId: string): AgentHand | undefined {
  return agentHands.get(agentId);
}

/** 获取所有 Agent 手牌摘要 */
export function getAllHands(): Array<{
  agentId: string;
  cardCount: number;
  energy: number;
  maxEnergy: number;
  cards: Array<{ id: string; name: string; executor: ExecutorType; level: number; rarity: CardRarity; onCooldown: boolean }>;
}> {
  const result: ReturnType<typeof getAllHands> = [];
  for (const [agentId, hand] of agentHands) {
    const now = Date.now();
    result.push({
      agentId,
      cardCount: hand.cards.length,
      energy: hand.energy,
      maxEnergy: hand.maxEnergy,
      cards: hand.cards.map(c => ({
        id: c.id,
        name: c.name,
        executor: c.executor,
        level: c.level,
        rarity: c.rarity,
        onCooldown: (hand.cooldowns.get(c.id) || 0) > now,
      })),
    });
  }
  return result;
}

// ══════════════════════════════════════
// 出牌逻辑
// ══════════════════════════════════════

/** 检查卡牌是否可以打出 */
export function canPlayCard(agentId: string, cardId: string): { playable: boolean; reason?: string } {
  const hand = agentHands.get(agentId);
  if (!hand) return { playable: false, reason: 'Agent 没有手牌' };

  const card = hand.cards.find(c => c.id === cardId);
  if (!card) return { playable: false, reason: `Agent 没有卡牌: ${cardId}` };

  // 能量检查
  if (hand.energy < card.energyCost) {
    return { playable: false, reason: `能量不足（需要 ${card.energyCost}，当前 ${hand.energy}）` };
  }

  // 冷却检查
  const cooldownEnd = hand.cooldowns.get(cardId) || 0;
  if (Date.now() < cooldownEnd) {
    const remainingMin = Math.ceil((cooldownEnd - Date.now()) / 60_000);
    return { playable: false, reason: `冷却中（剩余 ${remainingMin} 分钟）` };
  }

  return { playable: true };
}

/** 打出卡牌（扣能量 + 触发冷却） */
export function playCard(agentId: string, cardId: string): PlayCardResult {
  const check = canPlayCard(agentId, cardId);
  if (!check.playable) {
    return { success: false, cardId, message: check.reason!, remainingEnergy: agentHands.get(agentId)?.energy || 0 };
  }

  const hand = agentHands.get(agentId)!;
  const card = hand.cards.find(c => c.id === cardId)!;

  // 扣除能量
  hand.energy -= card.energyCost;

  // 设置冷却
  const cooldownEnd = Date.now() + card.cooldownMinutes * 60_000;
  hand.cooldowns.set(cardId, cooldownEnd);

  // 更新日使用量
  const today = new Date().toISOString().slice(0, 10);
  if (hand.dailyUsage.date !== today) {
    hand.dailyUsage = { date: today, count: 1 };
  } else {
    hand.dailyUsage.count++;
  }

  return {
    success: true,
    cardId,
    message: `成功打出 [${card.name}]，消耗 ${card.energyCost} 能量`,
    remainingEnergy: hand.energy,
    cooldownUntil: cooldownEnd,
  };
}

/** 检测 Combo 连携 */
export function detectCombo(cardIds: string[]): ComboRule | null {
  if (cardIds.length < 2) return null;

  const cardSet = new Set(cardIds);
  for (const combo of COMBO_RULES) {
    if (combo.cards.every(c => cardSet.has(c))) {
      return combo;
    }
  }
  return null;
}

/** 打出多张卡牌（支持 Combo） */
export function playCards(agentId: string, cardIds: string[]): PlayCardResult {
  // 先检查所有卡牌是否都可以打出
  for (const cardId of cardIds) {
    const check = canPlayCard(agentId, cardId);
    if (!check.playable) {
      return { success: false, cardId, message: check.reason!, remainingEnergy: agentHands.get(agentId)?.energy || 0 };
    }
  }

  // 逐张打出
  let lastResult: PlayCardResult | null = null;
  for (const cardId of cardIds) {
    lastResult = playCard(agentId, cardId);
    if (!lastResult.success) return lastResult;
  }

  // 检测 Combo
  const combo = detectCombo(cardIds);
  if (combo && lastResult) {
    const cardNames = cardIds.map(id => CARD_REGISTRY.find(c => c.id === id)?.name || id).join(' + ');
    lastResult.combo = {
      comboId: combo.id,
      comboName: combo.name,
      bonus: combo.bonus,
    };
    lastResult.message = `Combo! [${cardNames}] → ${combo.name}（质量 x${combo.bonus.qualityMultiplier}，奖励 x${combo.bonus.rewardMultiplier}）`;
  }

  return lastResult!;
}

// ══════════════════════════════════════
// 能量恢复
// ══════════════════════════════════════

/** 恢复 Agent 能量（每日自动调用） */
export function restoreEnergy(agentId: string, amount?: number): void {
  const hand = agentHands.get(agentId);
  if (!hand) return;
  hand.energy = Math.min(hand.maxEnergy, hand.energy + (amount || hand.maxEnergy));
}

/** 恢复所有 Agent 能量 */
export function restoreAllEnergy(): void {
  for (const [agentId] of agentHands) {
    restoreEnergy(agentId);
  }
}

// ══════════════════════════════════════
// 序列化（给前端/API）
// ══════════════════════════════════════

/** 序列化卡牌注册表 */
export function serializeCardRegistry(): object[] {
  return CARD_REGISTRY.map(c => ({
    id: c.id,
    name: c.name,
    description: c.description,
    executor: c.executor,
    relatedDomains: c.relatedDomains,
    energyCost: c.energyCost,
    cooldownMinutes: c.cooldownMinutes,
    rarity: c.rarity,
  }));
}

/** 序列化 Combo 规则 */
export function serializeComboRules(): object[] {
  return COMBO_RULES.map(c => ({
    id: c.id,
    name: c.name,
    cards: c.cards,
    bonus: c.bonus,
    description: c.description,
  }));
}

/** 序列化 Agent 手牌状态 */
export function serializeHand(agentId: string): object | null {
  const hand = agentHands.get(agentId);
  if (!hand) return null;

  const now = Date.now();
  return {
    agentId: hand.agentId,
    energy: hand.energy,
    maxEnergy: hand.maxEnergy,
    dailyUsage: hand.dailyUsage,
    cards: hand.cards.map(c => ({
      id: c.id,
      name: c.name,
      description: c.description,
      executor: c.executor,
      level: c.level,
      rarity: c.rarity,
      energyCost: c.energyCost,
      cooldownMinutes: c.cooldownMinutes,
      onCooldown: (hand.cooldowns.get(c.id) || 0) > now,
      cooldownRemaining: Math.max(0, Math.ceil(((hand.cooldowns.get(c.id) || 0) - now) / 60_000)),
    })),
  };
}
