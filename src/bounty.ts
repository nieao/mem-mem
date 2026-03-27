/**
 * 赏金市场 — 外部龙虾委托 Agent 执行能力任务
 * 复用 shop.ts 钱包模式，集成 capabilities.ts 执行引擎
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync } from 'fs';
import { join } from 'path';

import type { AgentProfile, SkillDomain } from './types.js';
import type { CapabilityResult, CapabilityInput } from './capabilities.js';
import type { ComboRule } from './skill-cards.js';
import { executeCapability, executeCombo, saveResultAsHtml } from './capabilities.js';
import { getHand, assignHand, CARD_REGISTRY, COMBO_RULES } from './skill-cards.js';
import { isCaptured } from './jail.js';

// ══════════════════════════════════════
// 类型定义
// ══════════════════════════════════════

export type BountyStatus = 'open' | 'assigned' | 'in-progress' | 'completed' | 'failed' | 'expired';
export type EscrowStatus = 'locked' | 'released' | 'refunded';

export interface Bounty {
  id: string;
  posterId: string;
  posterName: string;
  title: string;
  description: string;
  requiredCards: string[];          // 所需卡牌 ID
  preferredDomains: SkillDomain[];
  reward: number;                   // Agent 获得的 token
  serviceFee: number;               // 20% 平台费
  totalCost: number;                // reward + serviceFee
  escrowStatus: EscrowStatus;
  status: BountyStatus;
  assignedAgentId?: string;
  assignedAgentName?: string;
  result?: BountyResult;
  rating?: BountyRating;
  createdAt: string;
  assignedAt?: string;
  completedAt?: string;
  expiresAt: string;
  costCap: number;                  // 最大执行 token 消耗
  timeoutMs: number;                // 最大执行时间
}

export interface BountyResult {
  output: string;
  outputType: 'text' | 'html' | 'image-path' | 'json';
  savedPath?: string;
  auditIds: string[];
  totalTokensUsed: number;
  durationMs: number;
  combo?: { comboName: string; bonus: ComboRule['bonus'] };
}

export interface BountyRating {
  score: number;                    // 1-5
  comment: string;
  ratedAt: string;
}

export interface BountyMatch {
  agentId: string;
  agentName: string;
  matchScore: number;               // 0-100
  matchedCards: string[];
  availableEnergy: number;
  isCaptured: boolean;
}

// ══════════════════════════════════════
// 存储路径
// ══════════════════════════════════════

const MEMORY_DIR = './agent-memories';
const BOUNTY_DIR = join('./reports', 'bounties');
const INDEX_PATH = join(BOUNTY_DIR, 'index.json');

// ══════════════════════════════════════
// 钱包操作（复用 shop.ts 模式）
// ══════════════════════════════════════

interface PlayerWallet {
  userId: string;
  balance: number;
  totalEarned: number;
  totalSpent: number;
  transactions: { time: string; type: 'earn' | 'spend'; amount: number; desc: string }[];
}

function loadWallet(userId: string): PlayerWallet {
  const walletPath = join(MEMORY_DIR, userId, 'wallet.json');
  if (existsSync(walletPath)) {
    try { return JSON.parse(readFileSync(walletPath, 'utf-8')); } catch {}
  }
  return { userId, balance: 15000, totalEarned: 0, totalSpent: 0, transactions: [] };
}

function saveWallet(wallet: PlayerWallet): void {
  const dir = join(MEMORY_DIR, wallet.userId);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'wallet.json'), JSON.stringify(wallet, null, 2), 'utf-8');
}

// ══════════════════════════════════════
// 赏金索引
// ══════════════════════════════════════

interface BountyIndex {
  bounties: Array<{
    id: string;
    status: BountyStatus;
    posterId: string;
    assignedAgentId?: string;
    createdAt: string;
  }>;
}

function loadIndex(): BountyIndex {
  mkdirSync(BOUNTY_DIR, { recursive: true });
  if (existsSync(INDEX_PATH)) {
    try { return JSON.parse(readFileSync(INDEX_PATH, 'utf-8')); } catch {}
  }
  return { bounties: [] };
}

function saveIndex(index: BountyIndex): void {
  writeFileSync(INDEX_PATH, JSON.stringify(index, null, 2), 'utf-8');
}

function loadBounty(bountyId: string): Bounty | null {
  const path = join(BOUNTY_DIR, `${bountyId}.json`);
  if (!existsSync(path)) return null;
  try { return JSON.parse(readFileSync(path, 'utf-8')); } catch { return null; }
}

function saveBounty(bounty: Bounty): void {
  mkdirSync(BOUNTY_DIR, { recursive: true });
  writeFileSync(join(BOUNTY_DIR, `${bounty.id}.json`), JSON.stringify(bounty, null, 2), 'utf-8');
}

// ══════════════════════════════════════
// 核心函数
// ══════════════════════════════════════

/** 创建赏金（从用户钱包扣除托管金额） */
export function createBounty(
  posterId: string,
  posterName: string,
  title: string,
  description: string,
  requiredCards: string[],
  reward: number,
  options?: { costCap?: number; timeoutMs?: number; expiresInHours?: number },
): { success: boolean; bounty?: Bounty; message: string } {
  // 验证卡牌存在
  for (const cardId of requiredCards) {
    if (!CARD_REGISTRY.find(c => c.id === cardId)) {
      return { success: false, message: `卡牌不存在: ${cardId}` };
    }
  }

  // 计算费用
  const serviceFee = Math.ceil(reward * 0.2);
  const totalCost = reward + serviceFee;

  // 检查钱包余额
  const wallet = loadWallet(posterId);
  if (wallet.balance < totalCost) {
    return {
      success: false,
      message: `余额不足（需要 ${totalCost} Token = ${reward} 赏金 + ${serviceFee} 手续费，当前 ${wallet.balance}）`,
    };
  }

  // 扣款（托管）
  wallet.balance -= totalCost;
  wallet.totalSpent += totalCost;
  wallet.transactions.push({
    time: new Date().toISOString(),
    type: 'spend',
    amount: totalCost,
    desc: `赏金托管: ${title.slice(0, 30)}`,
  });
  saveWallet(wallet);

  // 提取相关技能域
  const preferredDomains = new Set<SkillDomain>();
  for (const cardId of requiredCards) {
    const card = CARD_REGISTRY.find(c => c.id === cardId);
    if (card) card.relatedDomains.forEach(d => preferredDomains.add(d));
  }

  // 创建赏金
  const expiresInHours = options?.expiresInHours || 24;
  const bounty: Bounty = {
    id: `bnt-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 5)}`,
    posterId,
    posterName,
    title,
    description,
    requiredCards,
    preferredDomains: [...preferredDomains],
    reward,
    serviceFee,
    totalCost,
    escrowStatus: 'locked',
    status: 'open',
    createdAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + expiresInHours * 3600_000).toISOString(),
    costCap: options?.costCap || 5000,
    timeoutMs: options?.timeoutMs || 300_000,
  };

  saveBounty(bounty);

  // 更新索引
  const index = loadIndex();
  index.bounties.push({
    id: bounty.id,
    status: bounty.status,
    posterId: bounty.posterId,
    createdAt: bounty.createdAt,
  });
  saveIndex(index);

  return { success: true, bounty, message: `赏金已创建，托管 ${totalCost} Token（赏金 ${reward} + 手续费 ${serviceFee}）` };
}

/** 匹配 Agent — 根据手牌和状态排名 */
export function matchAgents(
  bountyId: string,
  agents: AgentProfile[],
): BountyMatch[] {
  const bounty = loadBounty(bountyId);
  if (!bounty) return [];

  const matches: BountyMatch[] = [];

  for (const agent of agents) {
    const hand = getHand(agent.id) || assignHand(agent);
    const captured = isCaptured(agent.id);

    // 计算匹配分
    let score = 0;
    const matchedCards: string[] = [];

    for (const reqCardId of bounty.requiredCards) {
      const hasCard = hand.cards.find(c => c.id === reqCardId);
      if (hasCard) {
        score += 20 + hasCard.level * 5; // 基础分 + 等级加成
        matchedCards.push(reqCardId);
      }
    }

    // 技能域加成
    for (const domain of bounty.preferredDomains) {
      const hasSkill = agent.skills.find(s => s.domain === domain);
      if (hasSkill) score += hasSkill.level * 3;
    }

    // 能量惩罚
    if (hand.energy < 30) score -= 10;

    // 被捕惩罚
    if (captured) score -= 50;

    matches.push({
      agentId: agent.id,
      agentName: agent.name,
      matchScore: Math.max(0, Math.min(100, score)),
      matchedCards,
      availableEnergy: hand.energy,
      isCaptured: captured,
    });
  }

  // 按分数降序
  return matches.sort((a, b) => b.matchScore - a.matchScore);
}

/** 分配赏金给 Agent */
export function assignBounty(
  bountyId: string,
  agentId: string,
  agentName: string,
): { success: boolean; message: string } {
  const bounty = loadBounty(bountyId);
  if (!bounty) return { success: false, message: '赏金不存在' };
  if (bounty.status !== 'open') return { success: false, message: `赏金状态不允许分配: ${bounty.status}` };

  if (isCaptured(agentId)) {
    return { success: false, message: 'Agent 已被捕，无法接单' };
  }

  bounty.status = 'assigned';
  bounty.assignedAgentId = agentId;
  bounty.assignedAgentName = agentName;
  bounty.assignedAt = new Date().toISOString();
  saveBounty(bounty);

  // 更新索引
  const index = loadIndex();
  const entry = index.bounties.find(b => b.id === bountyId);
  if (entry) {
    entry.status = 'assigned';
    entry.assignedAgentId = agentId;
    saveIndex(index);
  }

  return { success: true, message: `赏金已分配给 ${agentName}` };
}

/** 执行赏金 */
export async function executeBounty(
  bountyId: string,
  agent: AgentProfile,
  mockMode = false,
): Promise<{ success: boolean; result?: BountyResult; message: string }> {
  const bounty = loadBounty(bountyId);
  if (!bounty) return { success: false, message: '赏金不存在' };
  if (bounty.status !== 'assigned') return { success: false, message: `赏金状态不允许执行: ${bounty.status}` };
  if (bounty.assignedAgentId !== agent.id) return { success: false, message: 'Agent 未被分配此赏金' };

  // 更新状态
  bounty.status = 'in-progress';
  saveBounty(bounty);

  const start = Date.now();
  const input: CapabilityInput = {
    prompt: bounty.description,
    context: `赏金标题: ${bounty.title}\n要求使用卡牌: ${bounty.requiredCards.join(', ')}`,
  };

  let capResult: CapabilityResult;

  // 单卡或多卡（Combo）
  if (bounty.requiredCards.length === 1) {
    capResult = await executeCapability(agent, bounty.requiredCards[0], input, mockMode);
  } else {
    capResult = await executeCombo(agent, bounty.requiredCards, input, mockMode);
  }

  if (!capResult.success) {
    // 执行失败
    bounty.status = 'failed';
    saveBounty(bounty);
    updateIndexStatus(bountyId, 'failed');

    return {
      success: false,
      message: `执行失败: ${capResult.error}`,
    };
  }

  // 保存结果为 HTML
  const cardName = bounty.requiredCards.map(id => CARD_REGISTRY.find(c => c.id === id)?.name || id).join(' + ');
  const savedPath = saveResultAsHtml(agent.id, agent.name, cardName, capResult);

  const bountyResult: BountyResult = {
    output: capResult.output,
    outputType: capResult.outputType,
    savedPath,
    auditIds: [capResult.auditId],
    totalTokensUsed: capResult.tokensUsed,
    durationMs: Date.now() - start,
    combo: capResult.combo,
  };

  bounty.result = bountyResult;
  bounty.status = 'completed';
  bounty.completedAt = new Date().toISOString();
  bounty.escrowStatus = 'released';
  saveBounty(bounty);
  updateIndexStatus(bountyId, 'completed');

  // 将赏金转给 Agent（写入 Agent 钱包/portfolio）
  transferReward(agent.id, bounty.reward, bounty.title);

  return {
    success: true,
    result: bountyResult,
    message: `赏金完成！${agent.name} 获得 ${bounty.reward} Token`,
  };
}

/** 完成赏金 + 评分 */
export function rateBounty(
  bountyId: string,
  score: number,
  comment: string,
): { success: boolean; message: string } {
  const bounty = loadBounty(bountyId);
  if (!bounty) return { success: false, message: '赏金不存在' };
  if (bounty.status !== 'completed') return { success: false, message: '只能对已完成的赏金评分' };

  bounty.rating = { score: Math.max(1, Math.min(5, score)), comment, ratedAt: new Date().toISOString() };
  saveBounty(bounty);

  return { success: true, message: `评分成功: ${score}/5` };
}

/** 失败/过期退款 */
export function refundBounty(bountyId: string, reason: string): { success: boolean; message: string } {
  const bounty = loadBounty(bountyId);
  if (!bounty) return { success: false, message: '赏金不存在' };
  if (bounty.escrowStatus !== 'locked') return { success: false, message: '托管已处理' };

  // 退款
  const wallet = loadWallet(bounty.posterId);
  wallet.balance += bounty.totalCost;
  wallet.totalEarned += bounty.totalCost;
  wallet.transactions.push({
    time: new Date().toISOString(),
    type: 'earn',
    amount: bounty.totalCost,
    desc: `赏金退款: ${bounty.title.slice(0, 30)} (${reason})`,
  });
  saveWallet(wallet);

  bounty.status = 'failed';
  bounty.escrowStatus = 'refunded';
  saveBounty(bounty);
  updateIndexStatus(bountyId, 'failed');

  return { success: true, message: `已退款 ${bounty.totalCost} Token` };
}

// ══════════════════════════════════════
// 查询
// ══════════════════════════════════════

/** 列出赏金 */
export function listBounties(filters?: {
  status?: BountyStatus;
  posterId?: string;
  agentId?: string;
  limit?: number;
}): Bounty[] {
  const index = loadIndex();
  let entries = index.bounties;

  if (filters?.status) entries = entries.filter(e => e.status === filters.status);
  if (filters?.posterId) entries = entries.filter(e => e.posterId === filters.posterId);
  if (filters?.agentId) entries = entries.filter(e => e.assignedAgentId === filters.agentId);

  const limit = filters?.limit || 50;
  const bounties: Bounty[] = [];
  for (const entry of entries.slice(-limit)) {
    const bounty = loadBounty(entry.id);
    if (bounty) bounties.push(bounty);
  }

  return bounties;
}

/** 获取单个赏金 */
export function getBounty(bountyId: string): Bounty | null {
  return loadBounty(bountyId);
}

/** 获取赏金市场统计 */
export function getBountyStats(): {
  totalBounties: number;
  open: number;
  completed: number;
  failed: number;
  totalRewardsDistributed: number;
} {
  const index = loadIndex();
  const stats = { totalBounties: index.bounties.length, open: 0, completed: 0, failed: 0, totalRewardsDistributed: 0 };

  for (const entry of index.bounties) {
    if (entry.status === 'open') stats.open++;
    else if (entry.status === 'completed') stats.completed++;
    else if (entry.status === 'failed') stats.failed++;
  }

  // 计算已分配的总赏金
  const completedBounties = listBounties({ status: 'completed' });
  stats.totalRewardsDistributed = completedBounties.reduce((sum, b) => sum + b.reward, 0);

  return stats;
}

/** 检查并退款所有过期赏金 */
export function expireOverdueBounties(): { expired: number; refunded: number } {
  const index = loadIndex();
  const now = Date.now();
  let expired = 0;
  let refunded = 0;

  for (const entry of index.bounties) {
    if (entry.status !== 'open' && entry.status !== 'assigned') continue;
    const bounty = loadBounty(entry.id);
    if (!bounty || !bounty.expiresAt) continue;

    if (new Date(bounty.expiresAt).getTime() < now) {
      // 退款给发布者
      const wallet = loadWallet(bounty.posterId);
      wallet.balance += bounty.totalCost;
      wallet.totalEarned += bounty.totalCost;
      wallet.transactions.push({
        time: new Date().toISOString(),
        type: 'earn',
        amount: bounty.totalCost,
        desc: `过期退款: ${bounty.title.slice(0, 30)}`,
      });
      saveWallet(wallet);

      bounty.status = 'expired';
      bounty.escrowStatus = 'refunded';
      saveBounty(bounty);
      updateIndexStatus(bounty.id, 'expired');

      expired++;
      refunded += bounty.totalCost;
      console.log(`[赏金] 过期退款: ${bounty.id} → ${bounty.posterId} (${bounty.totalCost} Token)`);
    }
  }

  return { expired, refunded };
}

// ══════════════════════════════════════
// 内部工具函数
// ══════════════════════════════════════

function updateIndexStatus(bountyId: string, status: BountyStatus): void {
  const index = loadIndex();
  const entry = index.bounties.find(b => b.id === bountyId);
  if (entry) {
    entry.status = status;
    saveIndex(index);
  }
}

/** 将赏金转给 Agent */
function transferReward(agentId: string, amount: number, bountyTitle: string): void {
  // Agent 的钱包存在 portfolio.json 中
  const portfolioPath = join(MEMORY_DIR, agentId, 'portfolio.json');
  let portfolio: any = { agentId, tokens: 10000, totalInvested: 0, holdings: [], tradeHistory: [], totalPnL: 0 };

  if (existsSync(portfolioPath)) {
    try { portfolio = JSON.parse(readFileSync(portfolioPath, 'utf-8')); } catch {}
  }

  portfolio.tokens = (portfolio.tokens || 0) + amount;

  // 记录收入
  if (!portfolio.bountyIncome) portfolio.bountyIncome = [];
  portfolio.bountyIncome.push({
    amount,
    from: bountyTitle.slice(0, 50),
    at: new Date().toISOString(),
  });

  mkdirSync(join(MEMORY_DIR, agentId), { recursive: true });
  writeFileSync(portfolioPath, JSON.stringify(portfolio, null, 2), 'utf-8');
}
