/**
 * Town — 小镇模拟器主引擎
 * 编排整个讨论流程：初始化 → 话题讨论 → 反思 → 报告
 */

import type {
  AgentProfile, AgentState, DiscussionRound, SimulationLog, SimConfig,
} from './types.js';
import { getAllPersonalities } from './personalities.js';
import { assignSkills } from './skills.js';
import { createAgent, createAgentState, generateReflection, resetAgentIndex } from './agent.js';
import { pickTopics } from './openclaw-kb.js';
import { runDiscussionRound, generateInsights } from './game-master.js';
import { generateHtmlReport } from './report.js';
import { generate3dReport } from './report-3d.js';
import { fetchCrucixData, filterForAgent } from './crucix.js';
import { AgentMemoryStore, hasExistingMemories } from './memory-store.js';
import { CultivationEngine } from './cultivation.js';
import { initOpenClaw, runHeartbeat, type HeartbeatTask } from './openclaw-sim.js';
import { startServer } from './server.js';
import { executeAllAgentTasks, type AgentTaskResult } from './agent-worker.js';
import { getTokenStats, setTokenBudget } from './llm.js';
import { getMarketData, autoInvest, serializeMarketData, type AgentPortfolio } from './stock-market.js';
import { TownEconomy } from './town-economy.js';
import { generateTVChannels, generateRadioChannels, serializeMediaData } from './town-media.js';
import { runBountyHeartbeat } from './bounty-heartbeat.js';

/** 默认配置 */
export const DEFAULT_CONFIG: SimConfig = {
  agentCount: 20,
  roundsPerTopic: 2,
  speakersPerRound: 5,
  topicCount: 4,
  model: 'claude-haiku-4-5-20251001',
  mockMode: process.env.MOCK_LLM === '1',
  maxTokensPerUtterance: 300,
  outputDir: './reports',
  crucixEnabled: true,
  persistMemory: true,
  memoryDir: './agent-memories',
};

/** 运行小镇模拟 */
export async function runTown(userConfig: Partial<SimConfig> = {}): Promise<SimulationLog> {
  const config = { ...DEFAULT_CONFIG, ...userConfig };
  const startTime = new Date().toISOString();

  const log = (msg: string) => {
    const ts = new Date().toLocaleTimeString('zh-CN');
    console.log(`[${ts}] ${msg}`);
  };

  // Token 预算
  if (config.tokenBudget) {
    setTokenBudget(config.tokenBudget);
    log(`Token 预算: ${config.tokenBudget}`);
  }

  log('='.repeat(50));
  log('  🦞 龙虾小镇');
  log('='.repeat(50));
  log(`模式: ${config.mockMode ? 'Mock（不消耗 API）' : '真实 LLM'}`);
  log(`模型: ${config.model}`);
  log(`居民: ${config.agentCount} 人`);
  log(`话题: ${config.topicCount} 个, 每话题 ${config.roundsPerTopic} 轮`);
  log(`每轮发言: ${config.speakersPerRound} 人`);
  log('');

  // ── 阶段 1：初始化居民 ──────────────────

  log('【阶段 1】初始化居民...');
  resetAgentIndex();
  const personalities = getAllPersonalities().slice(0, config.agentCount);
  const agents: AgentProfile[] = [];
  const agentStates: AgentState[] = [];
  const memoryDir = config.memoryDir || './agent-memories';
  const persistMemory = config.persistMemory !== false;
  const memoryStores = new Map<string, AgentMemoryStore>();
  const sessionId = `s-${Date.now()}`;

  for (const { key, personality } of personalities) {
    const skills = assignSkills();
    const profile = createAgent(key, personality, skills);
    agents.push(profile);
    const state = createAgentState(profile);

    // 加载持久化记忆
    if (persistMemory) {
      const store = new AgentMemoryStore(memoryDir, profile.id);
      memoryStores.set(profile.id, store);
      const core = store.loadCore();
      if (core) {
        // 恢复已有记忆
        const recentEpisodes = store.loadEpisodes(10);
        for (const ep of recentEpisodes) {
          state.memories.push({
            tick: 0,
            type: ep.type === 'reflection' ? 'reflection' : 'dialogue',
            content: ep.content,
            importance: ep.decayFactor,
            relatedAgents: ep.relatedAgents,
          });
        }
        core.sessionCount++;
        core.lastSessionAt = new Date().toISOString();
        store.saveCore(core);
      } else {
        // 首次创建
        store.saveCore({
          agentId: profile.id,
          name: profile.name,
          role: profile.role,
          personality,
          skills,
          createdAt: new Date().toISOString(),
          sessionCount: 1,
          lastSessionAt: new Date().toISOString(),
        });
      }
      // 衰减旧情节
      store.applyDecay();
    }

    agentStates.push(state);

    const skillStr = profile.skills.map(s => s.name).join(', ');
    const memStats = persistMemory ? memoryStores.get(profile.id)?.getStats() : null;
    const memTag = memStats && memStats.sessionCount > 1 ? ` [S${memStats.sessionCount} K${memStats.knowledge} E${memStats.episodes}]` : '';
    log(`  + ${profile.name} | ${personality.mbti}（${personality.archetype}）| ${skillStr}${memTag}`);
  }
  log(`共 ${agents.length} 位居民就位\n`);

  // 初始化 OpenClaw
  if (persistMemory) {
    for (const profile of agents) {
      initOpenClaw(profile, memoryDir);
      runHeartbeat(profile, memoryDir);
    }
    log(`  OpenClaw 已为 ${agents.length} 位居民初始化（SOUL.md + 心跳）\n`);
  }

  // ── 阶段 1.3：股市交易 ──────────────────

  log('【股市】获取市场数据...');
  const marketData = getMarketData();
  const portfolios = new Map<string, AgentPortfolio>();
  const sentimentIcon = marketData.sentiment === 'bull' ? '📈' : marketData.sentiment === 'bear' ? '📉' : '➖';
  log(`  ${marketData.indexName} ${marketData.indexPrice} (${marketData.indexChangePct > 0 ? '+' : ''}${marketData.indexChangePct}%) ${sentimentIcon}`);
  log(`  板块: ${marketData.breadth.up}涨 ${marketData.breadth.down}跌 ${marketData.breadth.flat}平`);

  for (const profile of agents) {
    const portfolio = autoInvest(profile, marketData);
    portfolios.set(profile.id, portfolio);
    if (portfolio.holdings.length > 0) {
      const latest = portfolio.holdings[portfolio.holdings.length - 1];
      const arrow = latest.direction === 'long' ? '买涨' : '买跌';
      log(`  ${profile.name}: ${arrow} ${latest.sectorName} ${latest.amount}代币 | 余额${portfolio.tokens}`);
    }
  }
  log('');

  // ── 阶段 1.4：小镇经济 ──────────────────

  log('【经济】分配工作 + 模拟经济活动...');
  const economy = new TownEconomy();
  economy.assignJobs(agents, portfolios);

  // 输出工作分配
  for (const biz of economy.businesses) {
    if (biz.employees.length > 0) {
      const owner = agents.find(a => a.id === biz.owner);
      const empNames = biz.employees.map(id => agents.find(a => a.id === id)?.name || '?');
      log(`  ${biz.icon} ${biz.name}: ${empNames.join('、')}${owner ? '（' + owner.name + '店主）' : ''}`);
    }
  }

  // 模拟一天经济活动
  economy.simulateDay(agents);
  economy.computeLeaderboard(agents, portfolios, memoryDir);

  // 输出今日事件
  for (const evt of economy.events) {
    log(`  ⚡ ${evt.title}`);
  }
  log(`  📰 今日 ${economy.dailyNews.length} 条小镇新闻\n`);

  // ── 生成媒体内容 ──
  const tvChannels = generateTVChannels(economy, marketData, agents);
  const radioChannels = generateRadioChannels(economy, marketData, agents);
  log(`  📺 电视台 ${tvChannels.length} 个频道 | 📻 广播台 ${radioChannels.length} 个频道\n`);

  // ── 阶段 1.5：获取实时情报 ──────────────────

  let crucixContextMap = new Map<string, string>();
  const crucixEnabled = config.crucixEnabled !== false;
  if (crucixEnabled) {
    log('【阶段 1.5】获取 Crucix 实时情报...');
    try {
      const snapshot = await fetchCrucixData(config.mockMode);
      log(`  数据时间: ${snapshot.timestamp}${snapshot.fromCache ? '（缓存）' : ''}`);
      const sourceCount = Object.keys(snapshot.sources).length;
      log(`  数据源: ${sourceCount} 个`);

      // 为每个 Agent 生成个性化情报摘要
      for (const state of agentStates) {
        const ctx = filterForAgent(snapshot, state.profile.skills);
        if (ctx) crucixContextMap.set(state.profile.id, ctx);
      }
      log(`  已为 ${crucixContextMap.size} 位居民注入个性化情报\n`);
    } catch (err) {
      log(`  Crucix 获取失败，继续无情报模式: ${err}\n`);
    }
  }

  // ── 阶段 2：话题讨论 ──────────────────

  log('【阶段 2】开始讨论...');
  const topics = pickTopics(config.topicCount, config);
  const allRounds: DiscussionRound[] = [];
  let tick = 0;

  for (const topic of topics) {
    log(`\n${'━'.repeat(50)}`);
    log(`话题：${topic.title}`);
    log(`${'━'.repeat(50)}`);

    const previousSpeakers = new Set<string>();

    for (let r = 1; r <= config.roundsPerTopic; r++) {
      const round = await runDiscussionRound(
        r,
        topic,
        agentStates,
        config,
        tick,
        previousSpeakers,
        log,
        crucixContextMap,
      );
      allRounds.push(round);
      tick += config.speakersPerRound;
    }

    // 话题结束后，随机选 3 个参与者做反思
    log(`\n  反思阶段...`);
    const reflectors = agentStates
      .filter(a => allRounds.some(r =>
        r.topic.id === topic.id && r.participants.includes(a.profile.id)
      ))
      .slice(0, 3);

    for (const agent of reflectors) {
      const lastRound = allRounds.filter(r => r.topic.id === topic.id).pop();
      if (lastRound) {
        const reflection = await generateReflection(
          agent, topic.title, lastRound.gmSummary, tick++, config.mockMode, config.model,
        );
        log(`  ${agent.profile.name} 反思：${reflection.slice(0, 60)}...`);
      }
    }
  }

  // ── 阶段 3：跨话题洞察 ──────────────────

  log('\n【阶段 3】生成跨话题洞察...');
  const insights = await generateInsights(allRounds, agentStates, config);
  for (const insight of insights) {
    log(`  ${insight.slice(0, 80)}...`);
  }

  // ── 阶段 3.5：保存记忆 ──────────────────

  if (persistMemory) {
    log('\n【保存记忆】...');
    const today = new Date().toISOString().slice(0, 10);
    let savedCount = 0;

    for (const state of agentStates) {
      const store = memoryStores.get(state.profile.id);
      if (!store) continue;

      // 保存本次讨论的情节记忆
      for (const round of allRounds) {
        for (const u of round.utterances) {
          if (u.agentId === state.profile.id) {
            store.addEpisode({
              sessionId,
              type: 'utterance',
              content: u.content.slice(0, 200),
              relatedAgents: u.replyTo ? [u.replyTo] : [],
              topic: round.topic.title,
            });
          }
        }
      }

      // 保存反思为知识
      for (const mem of state.memories.filter(m => m.type === 'reflection')) {
        store.addKnowledge(mem.content.slice(0, 200), '讨论反思', mem.importance);
      }

      // 保存今日 Crucix 情报
      const crucixCtx = crucixContextMap.get(state.profile.id);
      if (crucixCtx) {
        const topicNames = allRounds
          .filter(r => r.participants.includes(state.profile.id))
          .map(r => r.topic.title);
        store.saveDailyData(today, {
          date: today,
          crucixSummary: crucixCtx,
          highlights: insights.slice(0, 3),
          discussedTopics: [...new Set(topicNames)],
        });
      }

      savedCount++;
    }
    log(`  ${savedCount} 位居民记忆已保存到 ${memoryDir}/`);
  }

  // ── 阶段 3.8：居民成长结算 ──────────────────

  if (persistMemory) {
    log('\n【居民成长】...');
    const cultivation = new CultivationEngine(memoryDir);
    for (const state of agentStates) {
      const result = cultivation.processSession(state, allRounds, insights);
      if (result.xpGained > 0) {
        let msg = `  ${state.profile.name}: +${result.xpGained}XP → Lv.${result.newLevel}`;
        if (result.leveledUp) msg += ' ★升级！';
        if (result.skillLevelUps.length) msg += ` 技能↑: ${result.skillLevelUps.join(', ')}`;
        const shifts = Object.entries(result.oceanShift).filter(([, v]) => v !== 0);
        if (shifts.length) msg += ` 人格: ${shifts.map(([k, v]) => `${k}${(v as number) > 0 ? '+' : ''}${v}`).join(' ')}`;
        log(msg);
      }
    }
  }

  // ── 阶段 3.9：Agent 自主工作 ──────────────────

  if (persistMemory) {
    log('\n【Agent 自主工作】每位居民执行心跳任务...');
    // 收集心跳任务
    const heartbeatMap = new Map<string, import('./openclaw-sim.js').HeartbeatTask[]>();
    for (const profile of agents) {
      const tasks = runHeartbeat(profile, memoryDir);
      heartbeatMap.set(profile.id, tasks);
    }

    const taskResults = await executeAllAgentTasks(
      agents,
      heartbeatMap,
      crucixContextMap,
      config.mockMode,
      config.model,
      memoryDir,
      log,
    );

    if (taskResults.length > 0) {
      log(`\n  共完成 ${taskResults.length} 项任务，成果已保存到 reports/library/`);
    }
  }

  // ── 阶段 3.9：社会系统 ──────────────────
  {
    const { rollDisaster, applyDisaster, checkMarriages, checkBirths, runSchool } = await import('./social-systems.js');

    // 灾难引擎
    const disaster = rollDisaster();
    if (disaster) {
      const disasterNews = applyDisaster(disaster, agents);
      for (const n of disasterNews) {
        log(`  ${n}`);
        economy.dailyNews.push(n);
      }
    }

    // 学校系统
    const { classes, news: schoolNews } = runSchool(agents);
    if (classes.length > 0) {
      log('\n【小镇学堂】');
      for (const n of schoolNews) { log(`  ${n}`); economy.dailyNews.push(n); }
    }

    // 结婚系统
    const { marriages, news: marriageNews } = checkMarriages(agents);
    for (const n of marriageNews) { log(`  ${n}`); economy.dailyNews.push(n); }

    // 生子系统
    const birthNews = checkBirths(agents);
    for (const n of birthNews) { log(`  ${n}`); economy.dailyNews.push(n); }
  }

  // ── 阶段 3.95：赏金心跳 ──────────────────
  {
    log('\n【赏金心跳】Agent 巡查赏金墙...');
    const heartbeatSummary = await runBountyHeartbeat(agents, config.mockMode, log);
    if (heartbeatSummary.scanned > 0) {
      economy.dailyNews.push(`赏金心跳：${heartbeatSummary.accepted} 接单 / ${heartbeatSummary.executed} 完成 / ${heartbeatSummary.skipped} 跳过`);
    }
  }

  // ── 阶段 4：生成报告 ──────────────────

  log('\n【阶段 4】生成报告...');

  // 统计数据
  const utteranceCounts = new Map<string, number>();
  for (const round of allRounds) {
    for (const u of round.utterances) {
      utteranceCounts.set(u.agentName, (utteranceCounts.get(u.agentName) || 0) + 1);
    }
  }
  const mostActiveAgents = [...utteranceCounts.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count);

  const totalUtterances = allRounds.reduce((sum, r) => sum + r.utterances.length, 0);

  const simulationLog: SimulationLog = {
    startTime,
    endTime: new Date().toISOString(),
    agents,
    topics,
    rounds: allRounds,
    insights,
    metadata: {
      totalUtterances,
      totalRounds: allRounds.length,
      avgUtterancesPerRound: allRounds.length > 0 ? totalUtterances / allRounds.length : 0,
      mostActiveAgents,
      topicCoverage: topics.map(t => ({
        topic: t.title,
        depth: allRounds.filter(r => r.topic.id === t.id).length,
      })),
    },
  };

  // 注入股市数据到模拟日志的 metadata
  const finalTokenStats = getTokenStats();
  log(`\n  📊 Token 消耗: ${finalTokenStats.totalCalls} 次调用 | ~${finalTokenStats.estimatedTokens} tokens | $${finalTokenStats.estimatedCost.toFixed(4)}`);
  (simulationLog.metadata as any).tokenStats = JSON.stringify(finalTokenStats);
  (simulationLog.metadata as any).marketDataJson = serializeMarketData(marketData, portfolios);
  (simulationLog.metadata as any).economyJson = economy.serialize();
  (simulationLog.metadata as any).mediaJson = serializeMediaData(tvChannels, radioChannels);

  const reportPath = generateHtmlReport(simulationLog, config.outputDir);
  const report3dPath = generate3dReport(simulationLog, config.outputDir);
  log(`报告已生成：${reportPath}`);
  log(`3D 报告：${report3dPath}`);
  log(`JSON 数据：${config.outputDir}/simulation.json`);

  log('\n' + '='.repeat(50));
  log('  模拟完成');
  log(`  总发言: ${totalUtterances} | 轮数: ${allRounds.length} | 洞察: ${insights.length}`);
  log('='.repeat(50));

  // ── 启动服务器（默认启动，--no-serve 可关闭） ──
  if (config.serve !== false) {
    const port = config.serverPort || 3456;
    log('\n【启动龙虾小镇服务】...');
    startServer(port);
    log(`🦞 龙虾小镇已上线: http://localhost:${port}`);
    log(`   浏览器访问上述地址即可登录、逛商店、给 Agent 下任务\n`);
    // 自动打开浏览器
    try {
      const { exec } = require('child_process');
      exec(`start "" "http://localhost:${port}"`);
    } catch {}
  }

  return simulationLog;
}
