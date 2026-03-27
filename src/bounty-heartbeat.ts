/**
 * 赏金心跳系统 — Agent 自动巡查并接单
 *
 * 每个心跳周期（模拟循环 or 定时器）：
 * 1. 扫描所有 open 状态的赏金
 * 2. 为每条赏金匹配 Agent（按手牌匹配度 + 人格概率）
 * 3. 最佳匹配的 Agent 按概率决定是否接单
 * 4. 接单后自动执行任务
 *
 * 接单概率公式：
 *   baseProb = matchScore / 100
 *   personality = (extraversion * 0.3 + conscientiousness * 0.2 + openness * 0.2) / 100
 *   finalProb = baseProb * 0.6 + personality * 0.4
 *   随机 < finalProb → 接单
 */

import type { AgentProfile } from './types.js';
import { assignHand, getHand } from './skill-cards.js';
import { matchAgents, assignBounty, executeBounty, listBounties, rateBounty, type Bounty } from './bounty.js';
import { isCaptured } from './jail.js';

// ══════════════════════════════════════
// 类型
// ══════════════════════════════════════

export interface HeartbeatResult {
  bountyId: string;
  bountyTitle: string;
  agentId: string;
  agentName: string;
  action: 'accepted' | 'skipped' | 'executed' | 'failed';
  message: string;
}

export interface HeartbeatSummary {
  timestamp: string;
  scanned: number;       // 扫描了多少条 open 赏金
  accepted: number;      // 多少条被接单
  executed: number;      // 多少条执行完成
  failed: number;        // 多少条执行失败
  skipped: number;       // 多少条被跳过（概率未通过）
  results: HeartbeatResult[];
}

// ══════════════════════════════════════
// 配置
// ══════════════════════════════════════

/** 每次心跳最多处理的赏金数 */
const MAX_BOUNTIES_PER_HEARTBEAT = 3;

/** 基础接单概率系数（降低可避免所有赏金都被秒接） */
const ACCEPT_PROBABILITY_SCALE = 0.7;

/** 自动评分范围（模拟系统评分） */
const AUTO_RATING_MIN = 3;
const AUTO_RATING_MAX = 5;

// ══════════════════════════════════════
// 核心函数
// ══════════════════════════════════════

/**
 * 执行一次赏金心跳
 * 在 town.ts 模拟循环中调用，或由定时器触发
 */
export async function runBountyHeartbeat(
  agents: AgentProfile[],
  mockMode = false,
  log?: (msg: string) => void,
): Promise<HeartbeatSummary> {
  const print = log || console.log;
  const summary: HeartbeatSummary = {
    timestamp: new Date().toISOString(),
    scanned: 0, accepted: 0, executed: 0, failed: 0, skipped: 0,
    results: [],
  };

  // 确保所有 Agent 都有手牌
  for (const agent of agents) {
    assignHand(agent);
  }

  // 获取所有 open 状态的赏金
  const openBounties = listBounties({ status: 'open', limit: 20 });
  summary.scanned = openBounties.length;

  if (openBounties.length === 0) {
    return summary;
  }

  print(`  赏金心跳：发现 ${openBounties.length} 条待接赏金`);

  // 限制每次心跳处理数量
  const toProcess = openBounties.slice(0, MAX_BOUNTIES_PER_HEARTBEAT);

  for (const bounty of toProcess) {
    // 匹配 Agent
    const matches = matchAgents(bounty.id, agents);
    const validMatches = matches.filter(m => !m.isCaptured && m.matchScore > 10 && m.availableEnergy >= 20);

    if (validMatches.length === 0) {
      summary.skipped++;
      summary.results.push({
        bountyId: bounty.id, bountyTitle: bounty.title,
        agentId: '', agentName: '',
        action: 'skipped', message: '无合适 Agent',
      });
      continue;
    }

    // 从前 3 名中按概率选择
    const candidates = validMatches.slice(0, 3);
    let accepted = false;

    for (const candidate of candidates) {
      const agent = agents.find(a => a.id === candidate.agentId);
      if (!agent) continue;

      // 计算接单概率
      const prob = calculateAcceptProbability(candidate.matchScore, agent);

      if (Math.random() < prob) {
        // 接单
        print(`  → ${agent.name} 接受赏金「${bounty.title}」(概率 ${(prob * 100).toFixed(0)}%)`);

        const assignResult = assignBounty(bounty.id, agent.id, agent.name);
        if (!assignResult.success) {
          summary.results.push({
            bountyId: bounty.id, bountyTitle: bounty.title,
            agentId: agent.id, agentName: agent.name,
            action: 'failed', message: assignResult.message,
          });
          continue;
        }

        summary.accepted++;
        summary.results.push({
          bountyId: bounty.id, bountyTitle: bounty.title,
          agentId: agent.id, agentName: agent.name,
          action: 'accepted', message: `匹配度 ${candidate.matchScore}，概率 ${(prob * 100).toFixed(0)}%`,
        });

        // 自动执行
        const execResult = await executeBounty(bounty.id, agent, mockMode);
        if (execResult.success) {
          summary.executed++;
          print(`  ✓ ${agent.name} 完成赏金「${bounty.title}」`);

          // 自动评分（模拟）
          const autoScore = AUTO_RATING_MIN + Math.floor(Math.random() * (AUTO_RATING_MAX - AUTO_RATING_MIN + 1));
          const comments = [
            '完成得很好！', '非常专业！', '效率很高！',
            '超出预期！', '质量优秀！', '下次还找你！',
          ];
          rateBounty(bounty.id, autoScore, comments[Math.floor(Math.random() * comments.length)]);

          summary.results.push({
            bountyId: bounty.id, bountyTitle: bounty.title,
            agentId: agent.id, agentName: agent.name,
            action: 'executed', message: `完成，评分 ${autoScore}/5`,
          });
        } else {
          summary.failed++;
          print(`  ✗ ${agent.name} 执行失败: ${execResult.message}`);
          summary.results.push({
            bountyId: bounty.id, bountyTitle: bounty.title,
            agentId: agent.id, agentName: agent.name,
            action: 'failed', message: execResult.message,
          });
        }

        accepted = true;
        break;
      }
    }

    if (!accepted) {
      summary.skipped++;
      const topName = candidates[0] ? agents.find(a => a.id === candidates[0].agentId)?.name || '?' : '?';
      print(`  · 赏金「${bounty.title}」暂无人接单（${topName} 等 ${candidates.length} 人考虑中）`);
      summary.results.push({
        bountyId: bounty.id, bountyTitle: bounty.title,
        agentId: '', agentName: topName,
        action: 'skipped', message: '概率未通过，下次心跳重试',
      });
    }
  }

  print(`  赏金心跳完成：${summary.accepted} 接单 / ${summary.executed} 完成 / ${summary.skipped} 跳过`);
  return summary;
}

// ══════════════════════════════════════
// 概率计算
// ══════════════════════════════════════

/**
 * 计算 Agent 接单概率
 *
 * 影响因素：
 * - matchScore: 手牌匹配度（0-100）
 * - extraversion: 外向性高 → 更愿意接活
 * - conscientiousness: 尽责性高 → 更可靠
 * - openness: 开放性高 → 更愿意尝试新任务
 * - agreeableness: 宜人性高 → 更乐于助人
 */
function calculateAcceptProbability(matchScore: number, agent: AgentProfile): number {
  const ocean = agent.personality.ocean;

  // 匹配度分（60% 权重）
  const matchProb = (matchScore / 100) * 0.6;

  // 人格分（40% 权重）
  const personalityProb = (
    ocean.extraversion * 0.30 +
    ocean.conscientiousness * 0.25 +
    ocean.openness * 0.25 +
    ocean.agreeableness * 0.20
  ) / 100 * 0.4;

  // 总概率，乘以缩放系数
  return Math.min(0.95, (matchProb + personalityProb) * ACCEPT_PROBABILITY_SCALE);
}

// ══════════════════════════════════════
// 服务器定时心跳（供 server.ts 调用）
// ══════════════════════════════════════

let heartbeatInterval: ReturnType<typeof setInterval> | null = null;

/** 启动定时心跳（每 N 秒扫描一次赏金） */
export function startBountyHeartbeat(
  agents: AgentProfile[],
  intervalMs = 60_000,
  mockMode = false,
): void {
  if (heartbeatInterval) return; // 防止重复启动

  console.log(`[赏金心跳] 已启动，每 ${intervalMs / 1000} 秒扫描一次`);

  heartbeatInterval = setInterval(async () => {
    try {
      await runBountyHeartbeat(agents, mockMode, (msg) => console.log(`[赏金心跳] ${msg}`));
    } catch (e: any) {
      console.log(`[赏金心跳] 错误: ${e.message}`);
    }
  }, intervalMs);
}

/** 停止定时心跳 */
export function stopBountyHeartbeat(): void {
  if (heartbeatInterval) {
    clearInterval(heartbeatInterval);
    heartbeatInterval = null;
    console.log('[赏金心跳] 已停止');
  }
}
