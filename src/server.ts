/**
 * 轻量任务服务器 — 为报告页面提供 Agent 任务执行 API
 *
 * POST /api/task     → 执行 Agent 任务
 * GET  /api/agents   → 返回所有 Agent 信息
 * GET  /api/library  → 列出成果库
 * GET  /api/status/:id → Agent 的 OpenClaw 状态
 *
 * 启动: bun run src/server.ts
 * 或在 --serve 模式下由 town.ts 自动启动
 */

import { chat, callLlm, PROVIDERS, loadServerKeys, saveServerKeys, loadUserKeys, saveUserKeys, getTokenStats, isEnergySavingMode, setEnergySavingMode } from './llm.js';
import { generateSetupPage } from './setup-page.js';
import { buildSystemPrompt, createAgentState, createAgent } from './agent.js';
import { getAllPersonalities } from './personalities.js';
import { assignSkills } from './skills.js';
import { getOpenClawStatus, runHeartbeat } from './openclaw-sim.js';
import { TASK_TEMPLATES, recommendTemplates } from './task-templates.js';
import type { TaskRequest, TaskResult, AgentProfile } from './types.js';
import { SHOP_ITEMS, LOBSTER_PETS, buyItem, buyPet, loadWallet, saveWallet, loadPlayerRoom, savePlayerRoom, createDelegation, serializeShopData } from './shop.js';
import { getMarketData, getUserPortfolio, userTrade, userSellHolding, fetchFinnhubQuote, searchSymbol, loadWatchlist, saveWatchlist } from './stock-market.js';
import { generateOnboardDoc } from './openclaw-api-doc.js';
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync } from 'fs';
import { join } from 'path';
import { captureAgents, releaseAgents, loadJail, isCaptured, getActivePrisoners, generateConfession, getJailNews, placeNearAgent, addPlacementInteraction, loadPlacements } from './jail.js';
import { assignHand, serializeHand, serializeCardRegistry, serializeComboRules, getAllHands, CARD_REGISTRY } from './skill-cards.js';
import { executeCapability, executeCombo, checkOllamaHealth, checkComfyUIHealth, saveResultAsHtml } from './capabilities.js';
import { createBounty, matchAgents as matchBountyAgents, assignBounty, executeBounty, rateBounty, refundBounty, listBounties, getBounty, getBountyStats, expireOverdueBounties } from './bounty.js';
import { discoverPlugins, getPlugins, getPluginData, setPluginData, getUserBadges, awardUserBadge, recordActivity, getDailyLeaderboard, generatePluginWrapper, generatePluginListPage, BADGES } from './plugin-loader.js';
import { getKillSwitch, setKillSwitch, getAuditLog, getAuditSummary, getDailyBudgetStatus } from './sandbox.js';
import { startBountyHeartbeat, stopBountyHeartbeat, runBountyHeartbeat } from './bounty-heartbeat.js';
import { createMafiaGame, joinGame, addAiPlayers, startGame, nightAction, resolveNight, daySpeak, startVoting, vote, resolveVotes, advanceGame as advanceMafiaGame, listGames as listMafiaGames, getPlayerView, generateMafiaPage } from './lobster-mafia.js';

const PORT = parseInt(process.env.MEM_MEM_PORT || '3456');
const REPORTS_DIR = './reports';
const LIBRARY_DIR = join(REPORTS_DIR, 'library');
const MEMORY_DIR = './agent-memories';

// 加载 Agent 数据（从最近的 simulation.json）
function loadAgents(): AgentProfile[] {
  const simPath = join(REPORTS_DIR, 'simulation.json');
  if (existsSync(simPath)) {
    try {
      const sim = JSON.parse(readFileSync(simPath, 'utf-8'));
      return sim.agents || [];
    } catch {}
  }
  return [];
}

// 判断是否 mock 模式
const mockMode = process.argv.includes('--mock') || process.env.MOCK_LLM === '1';

// ── 任务执行 ──

async function executeTask(req: TaskRequest, agents: AgentProfile[]): Promise<TaskResult> {
  const agent = agents[req.agentIndex] || agents.find(a => a.id === req.agentId);
  if (!agent) throw new Error(`Agent 未找到: ${req.agentId}`);

  const state = createAgentState(agent);
  const systemPrompt = buildSystemPrompt(state);

  // 找到匹配的模板
  const template = TASK_TEMPLATES.find(t => t.id === req.taskType);
  const fullPrompt = template
    ? `${template.prompt}\n\n${req.taskPrompt}`
    : req.taskPrompt;

  const taskSystemPrompt = `${systemPrompt}\n\n## 当前任务模式
你现在不是在讨论，而是在独立执行一个任务。请用你的专业能力认真完成。
输出格式：纯文本，可用 Markdown。内容要有深度、有细节。`;

  const start = Date.now();
  const result = await chat(
    {
      systemPrompt: taskSystemPrompt,
      userPrompt: fullPrompt,
      model: 'claude-haiku-4-5-20251001',
      maxTokens: 2000,
    },
    mockMode,
  );

  const taskResult: TaskResult = {
    agentId: agent.id,
    agentName: agent.name,
    taskPrompt: req.taskPrompt,
    content: result.text,
    timestamp: new Date().toISOString(),
    durationMs: Date.now() - start,
  };

  return taskResult;
}

// ── 保存为 HTML ──

function saveTaskAsHtml(result: TaskResult): string {
  const agentDir = join(LIBRARY_DIR, result.agentId);
  mkdirSync(agentDir, { recursive: true });

  const ts = result.timestamp.replace(/[:.]/g, '-').slice(0, 19);
  const fileName = `${ts}.html`;
  const filePath = join(agentDir, fileName);

  // 简单 Markdown → HTML（基础转换）
  let htmlContent = result.content
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/^### (.+)$/gm, '<h3>$1</h3>')
    .replace(/^## (.+)$/gm, '<h2>$1</h2>')
    .replace(/^# (.+)$/gm, '<h1>$1</h1>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/`(.+?)`/g, '<code>$1</code>')
    .replace(/^- (.+)$/gm, '<li>$1</li>')
    .replace(/\n\n/g, '</p><p>')
    .replace(/\n/g, '<br>');
  htmlContent = '<p>' + htmlContent + '</p>';

  const html = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${result.agentName} — 任务成果</title>
<style>
  :root { --warm: #c8a882; --black: #1a1a1a; --gray-700: #555; --white: #fafafa; }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: "Noto Sans SC", system-ui, sans-serif; background: var(--white); color: var(--black); line-height: 1.9; max-width: 800px; margin: 0 auto; padding: 60px 24px; }
  .header { border-bottom: 1px solid #e8e8e8; padding-bottom: 24px; margin-bottom: 32px; }
  .header-label { font-size: 0.72rem; letter-spacing: 0.35em; color: var(--warm); margin-bottom: 8px; }
  .header h1 { font-family: "Noto Serif SC", Georgia, serif; font-size: 1.4rem; font-weight: 400; color: var(--black); }
  .header .meta { font-size: 0.82rem; color: var(--gray-700); margin-top: 8px; }
  .task-prompt { background: #f5f0eb; padding: 16px 20px; margin-bottom: 32px; border-left: 3px solid var(--warm); font-size: 0.88rem; color: var(--gray-700); }
  .content { font-size: 0.95rem; }
  .content h1, .content h2, .content h3 { font-family: "Noto Serif SC", Georgia, serif; margin: 24px 0 12px; font-weight: 400; }
  .content h1 { font-size: 1.3rem; }
  .content h2 { font-size: 1.15rem; }
  .content h3 { font-size: 1rem; color: var(--gray-700); }
  .content code { background: #f0ebe5; padding: 2px 6px; font-size: 0.88em; }
  .content li { margin-left: 20px; margin-bottom: 4px; }
  .content strong { color: var(--black); }
  .footer { margin-top: 48px; padding-top: 24px; border-top: 1px solid #e8e8e8; text-align: center; font-size: 0.75rem; color: #aaa; letter-spacing: 0.1em; }
</style>
</head>
<body>
<div class="header">
  <div class="header-label">AGENT 任务成果</div>
  <h1>${result.agentName} 的工作成果</h1>
  <div class="meta">${result.timestamp.slice(0, 19).replace('T', ' ')} · 耗时 ${(result.durationMs / 1000).toFixed(1)}s</div>
</div>
<div class="task-prompt">任务：${result.taskPrompt.replace(/</g, '&lt;')}</div>
<div class="content">${htmlContent}</div>
<div class="footer">龙虾小镇 · OpenClaw Agent 成果库</div>
</body>
</html>`;

  writeFileSync(filePath, html, 'utf-8');
  return filePath;
}

// ── Webhook 事件推送 ──

type WebhookEventType = 'bounty-created' | 'bounty-assigned' | 'bounty-completed' | 'bounty-failed' | 'bounty-refunded' |
  'wallet-changed' | 'item-purchased' | 'pet-acquired' | 'stock-traded' | 'test' | 'all';

async function pushWebhookEvent(userId: string, eventType: WebhookEventType, payload: any): Promise<number> {
  const webhookPath = join(REPORTS_DIR, 'webhooks.json');
  if (!existsSync(webhookPath)) return 0;

  let webhooks: any[] = [];
  try { webhooks = JSON.parse(readFileSync(webhookPath, 'utf-8')); } catch { return 0; }

  // 筛选匹配的 webhook（按 userId 或通配 * + 事件类型匹配）
  const targets = webhooks.filter(w => {
    if (!w.active) return false;
    if (userId !== '*' && w.userId !== userId && w.userId !== '*') return false;
    const events: string[] = w.events || ['all'];
    return events.includes('all') || events.includes(eventType);
  });

  let pushed = 0;
  for (const wh of targets) {
    try {
      await fetch(wh.url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json; charset=utf-8' },
        body: JSON.stringify({ event: eventType, userId, data: payload, timestamp: new Date().toISOString() }),
        signal: AbortSignal.timeout(5000),
      });
      pushed++;
    } catch (err) {
      console.log(`[Webhook] 推送失败 → ${wh.url}: ${(err as Error).message}`);
    }
  }
  if (pushed > 0) console.log(`[Webhook] ${eventType} → 推送 ${pushed}/${targets.length} 个目标`);
  return pushed;
}

// ── HTTP 服务器 ──

export function startServer(port = PORT) {
  const agents = loadAgents();
  console.log(`[服务器] 加载 ${agents.length} 位 Agent`);
  console.log(`[服务器] Mock 模式: ${mockMode ? '是' : '否'}`);

  // 插件发现
  const discoveredPlugins = discoverPlugins();

  const server = Bun.serve({
    port,
    async fetch(request) {
      const url = new URL(request.url);
      const path = decodeURIComponent(url.pathname);

      // CORS 头
      const corsHeaders = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Content-Type': 'application/json; charset=utf-8',
      };

      if (request.method === 'OPTIONS') {
        return new Response(null, { headers: corsHeaders });
      }

      // POST /api/task
      if (path === '/api/task' && request.method === 'POST') {
        try {
          const body = await request.json() as TaskRequest;
          // 检查 Agent 是否被关押
          const targetAgent = agents[body.agentIndex] || agents.find(a => a.id === body.agentId);
          if (targetAgent && isCaptured(targetAgent.id)) {
            return new Response(JSON.stringify({ error: `${targetAgent.name} 正在天牢中服刑，无法执行任务！` }), { status: 403, headers: corsHeaders });
          }
          console.log(`[任务] ${targetAgent?.name || body.agentId} 执行: ${body.taskPrompt.slice(0, 50)}...`);

          const result = await executeTask(body, agents);
          const savedPath = saveTaskAsHtml(result);
          result.savedPath = savedPath;

          console.log(`[任务] 完成，耗时 ${result.durationMs}ms，已保存: ${savedPath}`);
          return new Response(JSON.stringify(result), { headers: corsHeaders });
        } catch (err: any) {
          console.error('[任务] 执行失败:', err.message);
          return new Response(JSON.stringify({ error: err.message }), {
            status: 500, headers: corsHeaders,
          });
        }
      }

      // GET /api/agents
      if (path === '/api/agents') {
        const agentsWithStatus = agents.map(a => ({
          ...a,
          openclaw: getOpenClawStatus(a, MEMORY_DIR),
          templates: recommendTemplates(a.skills).slice(0, 6).map(t => ({
            id: t.id, label: t.label, category: t.category,
          })),
        }));
        return new Response(JSON.stringify(agentsWithStatus), { headers: corsHeaders });
      }

      // GET /api/library
      if (path === '/api/library') {
        const items: any[] = [];
        if (existsSync(LIBRARY_DIR)) {
          for (const agentDir of readdirSync(LIBRARY_DIR)) {
            const dirPath = join(LIBRARY_DIR, agentDir);
            try {
              const files = readdirSync(dirPath).filter(f => f.endsWith('.html'));
              for (const file of files) {
                const agent = agents.find(a => a.id === agentDir);
                items.push({
                  agentId: agentDir,
                  agentName: agent?.name || agentDir,
                  fileName: file,
                  path: `/library/${agentDir}/${file}`,
                  time: file.replace('.html', '').replace(/-/g, ':').slice(0, 19),
                });
              }
            } catch {}
          }
        }
        items.sort((a, b) => b.time.localeCompare(a.time));
        return new Response(JSON.stringify(items), { headers: corsHeaders });
      }

      // GET /api/status/:agentId
      if (path.startsWith('/api/status/')) {
        const agentId = path.slice('/api/status/'.length);
        const agent = agents.find(a => a.id === agentId);
        if (!agent) return new Response('Not Found', { status: 404 });
        const status = getOpenClawStatus(agent, MEMORY_DIR);
        return new Response(JSON.stringify(status), { headers: corsHeaders });
      }

      // GET /library/* — 成果文件服务（HTML + PNG）
      if (path.startsWith('/library/')) {
        const filePath = join(LIBRARY_DIR, path.slice('/library/'.length));
        if (existsSync(filePath)) {
          const ext = filePath.split('.').pop()?.toLowerCase();
          if (ext === 'png' || ext === 'jpg' || ext === 'jpeg' || ext === 'webp') {
            const imgData = readFileSync(filePath);
            const mime = ext === 'png' ? 'image/png' : ext === 'webp' ? 'image/webp' : 'image/jpeg';
            return new Response(imgData, { headers: { ...corsHeaders, 'Content-Type': mime, 'Cache-Control': 'public, max-age=3600' } });
          }
          const content = readFileSync(filePath, 'utf-8');
          return new Response(content, { headers: { ...corsHeaders, 'Content-Type': 'text/html; charset=utf-8' } });
        }
        return new Response('Not Found', { status: 404 });
      }

      // GET /reports/* — 报告静态文件服务
      if (path.startsWith('/reports/')) {
        const filePath = join(REPORTS_DIR, path.slice('/reports/'.length));
        if (existsSync(filePath)) {
          const ext = filePath.split('.').pop()?.toLowerCase();
          if (ext === 'png' || ext === 'jpg' || ext === 'jpeg' || ext === 'webp') {
            const imgData = readFileSync(filePath);
            const mime = ext === 'png' ? 'image/png' : ext === 'webp' ? 'image/webp' : 'image/jpeg';
            return new Response(imgData, { headers: { ...corsHeaders, 'Content-Type': mime } });
          }
        }
      }

      // ── 用户系统（OpenClaw 登录） ──

      // POST /api/user/register { name, mbti, role, openclawId? }
      if (path === '/api/user/register' && request.method === 'POST') {
        try {
          const body = await request.json() as any;
          const userId = 'user-' + (body.name || 'anon') + '-' + Date.now().toString(36);
          const userDir = join(MEMORY_DIR, userId);
          mkdirSync(join(userDir, 'openclaw', 'skills'), { recursive: true });
          mkdirSync(join(userDir, 'openclaw', 'tasks'), { recursive: true });
          mkdirSync(join(userDir, 'daily'), { recursive: true });

          // 分配居民区位置（按注册序号轮转）
          const existingUsers = existsSync(MEMORY_DIR) ? readdirSync(MEMORY_DIR).filter(d => d.startsWith('user-')).length : 0;
          const areas = ['A', 'B', 'C', 'D'];
          const areaIdx = existingUsers % areas.length;
          const roomNum = Math.floor(existingUsers / areas.length) + 1;

          const userProfile = {
            id: userId,
            type: 'human',
            name: body.name || '访客',
            role: body.role || '小镇居民',
            mbti: body.mbti || 'ENFP',
            openclawId: body.openclawId || null,
            tokens: 15000,
            createdAt: new Date().toISOString(),
            mode: 'resident',
            location: {
              sceneId: `resident-dorm-${areas[areaIdx].toLowerCase()}${roomNum}`,
              sceneName: `居民宿舍 ${areas[areaIdx]}${roomNum}`,
              area: '中心镇区',
              type: 'residence',
              description: '你的默认居所，可以休息、查看库存、整理任务和装饰房间。',
            },
            settings: {
              favoriteShop: null,
              petLobsterName: body.petName || '小龙',
              stockWatchlist: [],
            },
          };

          writeFileSync(join(userDir, 'profile.json'), JSON.stringify(userProfile, null, 2), 'utf-8');

          // 生成用户的 SOUL.md
          const soulMd = `# SOUL.md — ${userProfile.name}\n\n## 身份\n- 姓名：${userProfile.name}\n- 角色：${userProfile.role}\n- 人格：${userProfile.mbti}\n- 类型：人类居民\n- OpenClaw ID：${userProfile.openclawId || '未绑定'}\n\n## 权限\n- 居民模式：参与讨论、炒股、消费、给 Agent 下任务\n- 上帝模式：调整经济参数、触发随机事件、控制 Agent 行为\n`;
          writeFileSync(join(userDir, 'openclaw', 'SOUL.md'), soulMd, 'utf-8');

          // 初始化钱包（避免懒加载导致状态丢失）
          saveWallet({
            userId,
            balance: 15000,
            totalEarned: 0,
            totalSpent: 0,
            transactions: [{
              time: new Date().toISOString(),
              type: 'earn',
              amount: 15000,
              desc: '入驻启动资金',
            }],
          });

          // 初始化房间
          savePlayerRoom({
            userId,
            furniture: [],
            pets: [],
            wallColor: '#f5f0eb',
            floorType: 'wood',
          });

          console.log(`[用户] 注册: ${userProfile.name} (${userProfile.mbti}) → ${userId}`);
          return new Response(JSON.stringify(userProfile), { headers: corsHeaders });
        } catch (err: any) {
          return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: corsHeaders });
        }
      }

      // GET /api/user/:userId
      if (path.startsWith('/api/user/') && !path.includes('/register') && !path.includes('/action')) {
        const userId = path.slice('/api/user/'.length);
        const profilePath = join(MEMORY_DIR, userId, 'profile.json');
        if (existsSync(profilePath)) {
          const profile = JSON.parse(readFileSync(profilePath, 'utf-8'));
          return new Response(JSON.stringify(profile), { headers: corsHeaders });
        }
        return new Response(JSON.stringify({ error: '用户不存在' }), { status: 404, headers: corsHeaders });
      }

      // POST /api/user/action { userId, action, params }
      // 上帝模式操作：trigger-event, adjust-economy, control-agent
      if (path === '/api/user/action' && request.method === 'POST') {
        try {
          const body = await request.json() as any;
          const { userId, action, params } = body;

          const profilePath = join(MEMORY_DIR, userId, 'profile.json');
          if (!existsSync(profilePath)) {
            return new Response(JSON.stringify({ error: '用户不存在' }), { status: 404, headers: corsHeaders });
          }
          const profile = JSON.parse(readFileSync(profilePath, 'utf-8'));

          let result: any = { success: true };

          if (action === 'switch-mode') {
            profile.mode = profile.mode === 'god' ? 'resident' : 'god';
            writeFileSync(profilePath, JSON.stringify(profile, null, 2), 'utf-8');
            result.mode = profile.mode;
            console.log(`[用户] ${profile.name} 切换到 ${profile.mode === 'god' ? '上帝' : '居民'}模式`);
          }
          else if (action === 'trigger-event' && profile.mode === 'god') {
            result.event = params?.eventTitle || '自定义事件';
            console.log(`[上帝] ${profile.name} 触发事件: ${result.event}`);
          }
          else if (action === 'send-message') {
            // 居民发言到小镇广播
            result.message = params?.message || '';
            console.log(`[居民] ${profile.name}: ${result.message}`);
          }
          else if (action === 'assign-task') {
            // 居民给 Agent 下任务
            const agent = agents.find(a => a.id === params?.agentId);
            if (agent) {
              const taskResult = await executeTask({
                agentId: params.agentId,
                agentIndex: agents.indexOf(agent),
                taskType: 'custom',
                taskPrompt: params.taskPrompt || '请完成一项任务',
              }, agents);
              const savedPath = saveTaskAsHtml(taskResult);
              taskResult.savedPath = savedPath;
              result.taskResult = taskResult;
              console.log(`[居民] ${profile.name} 给 ${agent.name} 下达任务`);
            }
          }

          return new Response(JSON.stringify(result), { headers: corsHeaders });
        } catch (err: any) {
          return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: corsHeaders });
        }
      }

      // GET /api/users — 列出所有人类用户
      if (path === '/api/users') {
        const userDirs = existsSync(MEMORY_DIR) ?
          readdirSync(MEMORY_DIR).filter(d => d.startsWith('user-') && existsSync(join(MEMORY_DIR, d, 'profile.json'))) : [];
        const users = userDirs.map(d => {
          try { return JSON.parse(readFileSync(join(MEMORY_DIR, d, 'profile.json'), 'utf-8')); } catch { return null; }
        }).filter(Boolean);
        return new Response(JSON.stringify(users), { headers: corsHeaders });
      }

      // ── 商店系统 ──

      // GET /api/shop — 商品列表
      if (path === '/api/shop') {
        return new Response(serializeShopData(), { headers: corsHeaders });
      }

      // POST /api/shop/buy { userId, itemId }
      if (path === '/api/shop/buy' && request.method === 'POST') {
        const body = await request.json() as any;
        const result = buyItem(body.userId, body.itemId);
        const wallet = loadWallet(body.userId);
        console.log(`[商店] ${body.userId} 购买 ${body.itemId}: ${result.message}`);
        return new Response(JSON.stringify({ ...result, balance: wallet.balance }), { headers: corsHeaders });
      }

      // POST /api/shop/buy-pet { userId, petId, customName? }
      if (path === '/api/shop/buy-pet' && request.method === 'POST') {
        const body = await request.json() as any;
        const result = buyPet(body.userId, body.petId, body.customName);
        const wallet = loadWallet(body.userId);
        console.log(`[宠物店] ${body.userId} 购买龙虾 ${body.petId}: ${result.message}`);
        return new Response(JSON.stringify({ ...result, balance: wallet.balance }), { headers: corsHeaders });
      }

      // GET /api/room/:userId — 玩家房间数据
      if (path.startsWith('/api/room/')) {
        const userId = path.slice('/api/room/'.length);
        const room = loadPlayerRoom(userId);
        const wallet = loadWallet(userId);
        // 丰富宠物数据
        const petsWithInfo = room.pets.map(p => {
          const info = LOBSTER_PETS.find(lp => lp.id === p.petId);
          return { ...p, ...info };
        });
        return new Response(JSON.stringify({ room: { ...room, pets: petsWithInfo }, wallet }), { headers: corsHeaders });
      }

      // POST /api/room/move { userId, itemIndex, x, y } — 移动家具
      if (path === '/api/room/move' && request.method === 'POST') {
        const body = await request.json() as any;
        const room = loadPlayerRoom(body.userId);
        if (room.furniture[body.itemIndex]) {
          room.furniture[body.itemIndex].x = body.x;
          room.furniture[body.itemIndex].y = body.y;
          savePlayerRoom(room);
          return new Response(JSON.stringify({ success: true }), { headers: corsHeaders });
        }
        return new Response(JSON.stringify({ success: false }), { headers: corsHeaders });
      }

      // POST /api/delegate { userId, agentId, task, reward }
      if (path === '/api/delegate' && request.method === 'POST') {
        const body = await request.json() as any;
        const result = createDelegation(body.userId, body.agentId, body.task, body.reward || 100);
        if (result.success && result.delegation) {
          // 自动执行委托任务
          const agent = agents.find(a => a.id === body.agentId);
          if (agent) {
            try {
              const taskResult = await executeTask({
                agentId: body.agentId,
                agentIndex: agents.indexOf(agent),
                taskType: 'custom',
                taskPrompt: body.task,
              }, agents);
              result.delegation.status = 'completed';
              result.delegation.result = taskResult.content;
              result.delegation.completedAt = new Date().toISOString();
              // 持久化更新委托状态
              const dlgSavePath = join(MEMORY_DIR, body.userId, 'delegations', result.delegation.id + '.json');
              if (existsSync(dlgSavePath)) writeFileSync(dlgSavePath, JSON.stringify(result.delegation, null, 2), 'utf-8');
              const savedPath = saveTaskAsHtml(taskResult);
              console.log(`[委托] ${body.userId} → ${agent.name}: 完成 → ${savedPath}`);
              return new Response(JSON.stringify({ ...result, taskResult: { content: taskResult.content, savedPath } }), { headers: corsHeaders });
            } catch (err: any) {
              result.delegation.status = 'failed';
              // 持久化失败状态
              const dlgFailPath = join(MEMORY_DIR, body.userId, 'delegations', result.delegation.id + '.json');
              if (existsSync(dlgFailPath)) writeFileSync(dlgFailPath, JSON.stringify(result.delegation, null, 2), 'utf-8');
              return new Response(JSON.stringify({ ...result, error: err.message }), { headers: corsHeaders });
            }
          }
        }
        return new Response(JSON.stringify(result), { headers: corsHeaders });
      }

      // GET /api/delegate/user/:userId — 查询用户的委托历史
      if (path.startsWith('/api/delegate/user/')) {
        const userId = path.slice('/api/delegate/user/'.length);
        const dlgDir = join(MEMORY_DIR, userId, 'delegations');
        const delegations: any[] = [];
        if (existsSync(dlgDir)) {
          for (const f of readdirSync(dlgDir).filter(f => f.endsWith('.json'))) {
            try { delegations.push(JSON.parse(readFileSync(join(dlgDir, f), 'utf-8'))); } catch {}
          }
        }
        delegations.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
        return new Response(JSON.stringify({ userId, total: delegations.length, delegations }), { headers: corsHeaders });
      }

      // GET /api/delegate/:delegationId — 查询单条委托
      if (path.startsWith('/api/delegate/') && !path.includes('/user/') && request.method === 'GET') {
        const dlgId = path.slice('/api/delegate/'.length);
        // 遍历所有用户找到该委托
        if (existsSync(MEMORY_DIR)) {
          for (const userDir of readdirSync(MEMORY_DIR)) {
            const dlgPath = join(MEMORY_DIR, userDir, 'delegations', dlgId + '.json');
            if (existsSync(dlgPath)) {
              try {
                const dlg = JSON.parse(readFileSync(dlgPath, 'utf-8'));
                return new Response(JSON.stringify(dlg), { headers: corsHeaders });
              } catch {}
            }
          }
        }
        return new Response(JSON.stringify({ error: '委托不存在' }), { status: 404, headers: corsHeaders });
      }

      // GET /api/wallet/:userId
      if (path.startsWith('/api/wallet/')) {
        const userId = path.slice('/api/wallet/'.length);
        return new Response(JSON.stringify(loadWallet(userId)), { headers: corsHeaders });
      }

      // ══════════════════════════════════════════════════
      // OpenClaw 接口层 — 让外部 Agent 接入小镇
      // ══════════════════════════════════════════════════

      // ── 第一层：小镇状态查询 API（只读） ──

      // GET /api/town/status — 小镇全景状态
      if (path === '/api/town/status') {
        const market = getMarketData();
        // 加载经济数据
        let economy: any = { businesses: [], events: [], dailyNews: [], leaderboard: {} };
        try {
          const simPath = join(REPORTS_DIR, 'simulation.json');
          if (existsSync(simPath)) {
            const sim = JSON.parse(readFileSync(simPath, 'utf-8'));
            if (sim.metadata?.economyJson) economy = JSON.parse(sim.metadata.economyJson);
          }
        } catch {}

        // 统计人类用户
        const userDirs = existsSync(MEMORY_DIR) ?
          readdirSync(MEMORY_DIR).filter(d => d.startsWith('user-') && existsSync(join(MEMORY_DIR, d, 'profile.json'))) : [];

        return new Response(JSON.stringify({
          town: {
            name: 'OpenClaw 龙虾小镇',
            agentCount: agents.length,
            humanUserCount: userDirs.length,
            timestamp: new Date().toISOString(),
          },
          economy: {
            businesses: economy.businesses?.map((b: any) => ({
              id: b.id, name: b.name, type: b.type, icon: b.icon,
              reputation: b.reputation, dailyRevenue: b.dailyRevenue,
              dailyCustomers: b.dailyCustomers, employees: b.employees?.length || 0,
            })) || [],
            events: economy.events?.slice(-5) || [],
            dailyNews: economy.dailyNews || [],
            leaderboard: economy.leaderboard || {},
          },
          market: {
            indexName: market.indexName,
            indexPrice: market.indexPrice,
            indexChangePct: market.indexChangePct,
            sentiment: market.sentiment,
            breadth: market.breadth,
            topGainers: [...market.sectors].sort((a, b) => b.changePct - a.changePct).slice(0, 3).map(s => ({ code: s.code, name: s.name, changePct: s.changePct })),
            topLosers: [...market.sectors].sort((a, b) => a.changePct - b.changePct).slice(0, 3).map(s => ({ code: s.code, name: s.name, changePct: s.changePct })),
          },
        }), { headers: corsHeaders });
      }

      // GET /api/town/market — 股市完整数据
      if (path === '/api/town/market') {
        const market = getMarketData();
        // 获取 Agent 持仓排行
        const rankings: any[] = [];
        for (const a of agents) {
          const portfolioPath = join(MEMORY_DIR, a.id, 'portfolio.json');
          if (existsSync(portfolioPath)) {
            try {
              const p = JSON.parse(readFileSync(portfolioPath, 'utf-8'));
              rankings.push({ name: a.name, agentId: a.id, totalPnL: p.totalPnL || 0, tokens: p.tokens || 0, holdingsCount: p.holdings?.length || 0 });
            } catch {}
          }
        }
        rankings.sort((a, b) => b.totalPnL - a.totalPnL);

        return new Response(JSON.stringify({
          market,
          rankings: rankings.slice(0, 10),
        }), { headers: corsHeaders });
      }

      // GET /api/town/news — 今日新闻 + 历史事件
      if (path === '/api/town/news') {
        let economy: any = { events: [], dailyNews: [] };
        try {
          const simPath = join(REPORTS_DIR, 'simulation.json');
          if (existsSync(simPath)) {
            const sim = JSON.parse(readFileSync(simPath, 'utf-8'));
            if (sim.metadata?.economyJson) economy = JSON.parse(sim.metadata.economyJson);
          }
        } catch {}

        return new Response(JSON.stringify({
          dailyNews: economy.dailyNews || [],
          events: economy.events || [],
          timestamp: new Date().toISOString(),
        }), { headers: corsHeaders });
      }

      // GET /api/town/leaderboard — 综合排行榜
      if (path === '/api/town/leaderboard') {
        let economy: any = { leaderboard: {} };
        try {
          const simPath = join(REPORTS_DIR, 'simulation.json');
          if (existsSync(simPath)) {
            const sim = JSON.parse(readFileSync(simPath, 'utf-8'));
            if (sim.metadata?.economyJson) economy = JSON.parse(sim.metadata.economyJson);
          }
        } catch {}

        // 股市排行
        const stockRankings: any[] = [];
        for (const a of agents) {
          const portfolioPath = join(MEMORY_DIR, a.id, 'portfolio.json');
          if (existsSync(portfolioPath)) {
            try {
              const p = JSON.parse(readFileSync(portfolioPath, 'utf-8'));
              stockRankings.push({ name: a.name, id: a.id, type: 'agent', totalPnL: p.totalPnL || 0, tokens: p.tokens || 0 });
            } catch {}
          }
        }
        // 人类用户
        const userDirs = existsSync(MEMORY_DIR) ?
          readdirSync(MEMORY_DIR).filter(d => d.startsWith('user-') && existsSync(join(MEMORY_DIR, d, 'portfolio.json'))) : [];
        for (const d of userDirs) {
          try {
            const p = JSON.parse(readFileSync(join(MEMORY_DIR, d, 'portfolio.json'), 'utf-8'));
            const profile = JSON.parse(readFileSync(join(MEMORY_DIR, d, 'profile.json'), 'utf-8'));
            stockRankings.push({ name: profile.name, id: d, type: 'human', totalPnL: p.totalPnL || 0, tokens: p.tokens || 0 });
          } catch {}
        }
        stockRankings.sort((a, b) => b.totalPnL - a.totalPnL);

        return new Response(JSON.stringify({
          economy: economy.leaderboard || {},
          stock: stockRankings.slice(0, 20),
        }), { headers: corsHeaders });
      }

      // ── 第二层：交互操作 API（读写） ──

      // POST /api/market/trade { userId, sectorCode, direction, amount }
      if (path === '/api/market/trade' && request.method === 'POST') {
        try {
          const body = await request.json() as any;
          const { userId, sectorCode, direction, amount } = body;
          if (!userId || !sectorCode || !direction || !amount) {
            return new Response(JSON.stringify({ success: false, message: '缺少参数: userId, sectorCode, direction(long/short), amount' }), { status: 400, headers: corsHeaders });
          }
          const market = getMarketData();
          const result = userTrade(userId, sectorCode, direction, amount, market);
          // 同步扣减钱包余额（保持 wallet 和 portfolio 一致）
          if (result.success) {
            const wallet = loadWallet(userId);
            wallet.balance -= amount;
            wallet.totalSpent += amount;
            wallet.transactions.push({
              time: new Date().toISOString(),
              type: 'spend',
              amount,
              desc: `股票${direction === 'long' ? '做多' : '做空'}: ${sectorCode}`,
            });
            saveWallet(wallet);
            pushWebhookEvent(userId, 'stock-traded', { sectorCode, direction, amount });
          }
          console.log(`[交易] ${userId} ${direction} ${sectorCode} ${amount}T: ${result.message}`);
          return new Response(JSON.stringify(result), { headers: corsHeaders });
        } catch (err: any) {
          return new Response(JSON.stringify({ success: false, message: err.message }), { status: 500, headers: corsHeaders });
        }
      }

      // POST /api/market/sell { userId, holdingIndex }
      if (path === '/api/market/sell' && request.method === 'POST') {
        try {
          const body = await request.json() as any;
          const { userId, holdingIndex } = body;
          if (!userId || holdingIndex === undefined) {
            return new Response(JSON.stringify({ success: false, message: '缺少参数: userId, holdingIndex' }), { status: 400, headers: corsHeaders });
          }
          const market = getMarketData();
          const result = userSellHolding(userId, holdingIndex, market);
          // 平仓收回资金同步到钱包（本金 + 盈亏）
          if (result.success && result.pnl !== undefined && result.portfolio) {
            const wallet = loadWallet(userId);
            // 从 portfolio 的最后一笔交易推断平仓金额
            const lastTrade = result.portfolio.tradeHistory?.slice(-1)[0];
            const returnAmount = (lastTrade?.amount || 0) + (result.pnl || 0);
            if (returnAmount > 0) {
              wallet.balance += returnAmount;
              wallet.totalEarned += returnAmount;
              wallet.transactions.push({
                time: new Date().toISOString(),
                type: 'earn',
                amount: returnAmount,
                desc: `平仓回收（盈亏 ${(result.pnl || 0) > 0 ? '+' : ''}${result.pnl}）`,
              });
              saveWallet(wallet);
            }
          }
          console.log(`[平仓] ${userId} #${holdingIndex}: ${result.message}`);
          return new Response(JSON.stringify(result), { headers: corsHeaders });
        } catch (err: any) {
          return new Response(JSON.stringify({ success: false, message: err.message }), { status: 500, headers: corsHeaders });
        }
      }

      // GET /api/market/portfolio/:userId — 用户持仓查询
      if (path.startsWith('/api/market/portfolio/')) {
        const userId = path.slice('/api/market/portfolio/'.length);
        const market = getMarketData();
        const portfolio = getUserPortfolio(userId, market);
        return new Response(JSON.stringify({ portfolio, market: { indexName: market.indexName, indexPrice: market.indexPrice, indexChangePct: market.indexChangePct, sentiment: market.sentiment } }), { headers: corsHeaders });
      }

      // GET /api/market/quote/:symbol — 查询单只股票实时行情（Finnhub）
      if (path.startsWith('/api/market/quote/') && request.method === 'GET') {
        const symbol = path.split('/api/market/quote/')[1];
        if (!symbol) return new Response(JSON.stringify({ error: '请提供股票代码' }), { status: 400, headers: corsHeaders });
        const quote = await fetchFinnhubQuote(symbol);
        if (!quote) return new Response(JSON.stringify({ error: '无法获取行情（未配置 FINNHUB_API_KEY 或代码无效）', symbol }), { status: 404, headers: corsHeaders });
        return new Response(JSON.stringify({ symbol: symbol.toUpperCase(), ...quote }), { headers: corsHeaders });
      }

      // GET /api/market/watchlist/:userId — 获取用户自选股
      if (path.startsWith('/api/market/watchlist/') && request.method === 'GET') {
        const userId = path.split('/api/market/watchlist/')[1];
        if (!userId) return new Response(JSON.stringify({ error: '请提供 userId' }), { status: 400, headers: corsHeaders });
        const watchlist = loadWatchlist(userId);
        return new Response(JSON.stringify(watchlist), { headers: corsHeaders });
      }

      // POST /api/market/watchlist — 添加/删除自选股
      if (path === '/api/market/watchlist' && request.method === 'POST') {
        try {
          const body = await request.json() as any;
          const { userId, action, symbol, name, sector } = body;
          if (!userId || !action || !symbol) {
            return new Response(JSON.stringify({ error: '缺少 userId/action/symbol' }), { status: 400, headers: corsHeaders });
          }
          const watchlist = loadWatchlist(userId);
          if (action === 'add') {
            if (watchlist.stocks.some(s => s.symbol === symbol.toUpperCase())) {
              return new Response(JSON.stringify({ success: false, message: '已在自选股中' }), { headers: corsHeaders });
            }
            watchlist.stocks.push({ symbol: symbol.toUpperCase(), name: name || symbol, sector: sector || '' });
          } else if (action === 'remove') {
            watchlist.stocks = watchlist.stocks.filter(s => s.symbol !== symbol.toUpperCase());
          }
          saveWatchlist(userId, watchlist);
          return new Response(JSON.stringify({ success: true, watchlist }), { headers: corsHeaders });
        } catch (err: any) {
          return new Response(JSON.stringify({ error: err.message }), { status: 400, headers: corsHeaders });
        }
      }

      // GET /api/market/search?q=xxx — 搜索股票代码
      if (path === '/api/market/search' && request.method === 'GET') {
        const q = url.searchParams.get('q');
        if (!q) return new Response(JSON.stringify({ results: [] }), { headers: corsHeaders });
        const results = await searchSymbol(q);
        return new Response(JSON.stringify({ results }), { headers: corsHeaders });
      }

      // POST /api/town/chat { userId, message } — 发送小镇广播
      if (path === '/api/town/chat' && request.method === 'POST') {
        try {
          const body = await request.json() as any;
          const { userId, message } = body;
          if (!userId || !message) {
            return new Response(JSON.stringify({ success: false, message: '缺少参数: userId, message' }), { status: 400, headers: corsHeaders });
          }
          // 验证用户
          const profilePath = join(MEMORY_DIR, userId, 'profile.json');
          if (!existsSync(profilePath)) {
            return new Response(JSON.stringify({ success: false, message: '用户不存在' }), { status: 404, headers: corsHeaders });
          }
          const profile = JSON.parse(readFileSync(profilePath, 'utf-8'));

          // 保存广播消息到公共日志
          const chatLogPath = join(REPORTS_DIR, 'town-chat.json');
          let chatLog: any[] = [];
          if (existsSync(chatLogPath)) {
            try { chatLog = JSON.parse(readFileSync(chatLogPath, 'utf-8')); } catch {}
          }
          const chatEntry = {
            userId,
            userName: profile.name,
            message: message.slice(0, 200), // 限制长度
            timestamp: new Date().toISOString(),
            type: 'broadcast',
          };
          chatLog.push(chatEntry);
          // 保留最近 100 条
          if (chatLog.length > 100) chatLog = chatLog.slice(-100);
          writeFileSync(chatLogPath, JSON.stringify(chatLog, null, 2), 'utf-8');

          console.log(`[广播] ${profile.name}: ${message.slice(0, 50)}`);
          return new Response(JSON.stringify({ success: true, message: '广播已发送', entry: chatEntry }), { headers: corsHeaders });
        } catch (err: any) {
          return new Response(JSON.stringify({ success: false, message: err.message }), { status: 500, headers: corsHeaders });
        }
      }

      // GET /api/town/chat — 获取广播历史
      if (path === '/api/town/chat' && request.method === 'GET') {
        const chatLogPath = join(REPORTS_DIR, 'town-chat.json');
        let chatLog: any[] = [];
        if (existsSync(chatLogPath)) {
          try { chatLog = JSON.parse(readFileSync(chatLogPath, 'utf-8')); } catch {}
        }
        const limit = parseInt(url.searchParams.get('limit') || '20');
        return new Response(JSON.stringify({ messages: chatLog.slice(-limit) }), { headers: corsHeaders });
      }

      // POST /api/town/interact { userId, agentId, message } — 与 Agent 互动
      if (path === '/api/town/interact' && request.method === 'POST') {
        try {
          const body = await request.json() as any;
          const { userId, agentId, message } = body;
          if (!userId || !agentId || !message) {
            return new Response(JSON.stringify({ success: false, message: '缺少参数: userId, agentId, message' }), { status: 400, headers: corsHeaders });
          }

          const agent = agents.find(a => a.id === agentId);
          if (!agent) return new Response(JSON.stringify({ success: false, message: 'Agent 不存在' }), { status: 404, headers: corsHeaders });

          const profilePath = join(MEMORY_DIR, userId, 'profile.json');
          if (!existsSync(profilePath)) return new Response(JSON.stringify({ success: false, message: '用户不存在' }), { status: 404, headers: corsHeaders });
          const profile = JSON.parse(readFileSync(profilePath, 'utf-8'));

          // 生成 Agent 回复（mock 模式用人格模板，非 mock 走 LLM）
          let reply: string;
          if (mockMode) {
            // 基于 Agent 人格生成差异化回复（无 [Mock] 标记）
            const p = agent.personality;
            const styles: Record<string, (name: string, msg: string) => string> = {
              'INTJ': (n, m) => `${n} 沉思了一下："${m.slice(0,20)}"……这个问题值得深入分析。从系统架构的角度，我建议先明确边界条件。`,
              'INTP': (n, m) => `${n} 推了推眼镜："有意思。关于'${m.slice(0,15)}'，我能想到三种可能的技术路径，但每种都有 trade-off。"`,
              'ENTJ': (n, m) => `${n} 干脆利落地说："${m.slice(0,15)}'——好，我来拆解任务。第一步确认目标，第二步分配资源。执行力决定一切。"`,
              'ENTP': (n, m) => `${n} 兴奋地拍了下桌子："哦！'${m.slice(0,15)}'——等等，如果我们反过来想呢？打破常规才有突破。"`,
              'INFJ': (n, m) => `${n} 温和地说："我理解你的想法。'${m.slice(0,15)}'……我觉得这背后有更深层的需求，我们可以一起探索。"`,
              'INFP': (n, m) => `${n} 轻声说："'${m.slice(0,15)}'……这让我想到一种可能性。如果每个 Agent 都能找到自己的价值，那就太好了。"`,
              'ENFJ': (n, m) => `${n} 微笑着说："很高兴你提到这个！'${m.slice(0,15)}'——我认为团队协作是关键，让我来帮大家协调。"`,
              'ENFP': (n, m) => `${n} 眼睛亮了："太棒了！'${m.slice(0,15)}'——我已经有十个想法了！不过先从最有趣的那个开始吧？"`,
              'ISTJ': (n, m) => `${n} 认真地回答："关于'${m.slice(0,15)}'，按照标准流程，我建议先查文档，再制定计划。稳定可靠最重要。"`,
              'ISFJ': (n, m) => `${n} 贴心地说："你辛苦了。'${m.slice(0,15)}'——别着急，我这边可以帮你处理后勤部分。"`,
              'ESTJ': (n, m) => `${n} 干练地说："'${m.slice(0,15)}'——明白了。我来排优先级，deadline 是什么时候？效率第一。"`,
              'ESFJ': (n, m) => `${n} 热情地说："来来来！'${m.slice(0,15)}'——我已经帮你问了几个人的意见，大家都挺支持的！"`,
              'ISTP': (n, m) => `${n} 简洁地说："'${m.slice(0,15)}'……嗯，直接看代码比讨论快。给我五分钟。"`,
              'ISFP': (n, m) => `${n} 安静地说："'${m.slice(0,15)}'……我觉得可以用一种更优雅的方式来实现，让我画个草图。"`,
              'ESTP': (n, m) => `${n} 拍了拍胸脯："'${m.slice(0,15)}'？交给我！先试了再说，边做边调整才是正道。"`,
              'ESFP': (n, m) => `${n} 开心地说："哈哈！'${m.slice(0,15)}'——这个有趣！我们边聊边试，搞起来！"`,
            };
            const gen = styles[p.mbti] || ((n: string, m: string) => `${n}："关于'${m.slice(0,20)}'，我有一些想法。${p.communicationStyle}"`);
            reply = gen(agent.name, message);
          } else {
            const sysPrompt = `你是"${agent.name}"，龙虾小镇居民。人格：${agent.personality.mbti}（${agent.personality.archetype}）。沟通风格：${agent.personality.communicationStyle}。请用 2-3 句话回应，保持角色感。`;
            const userMsg = `人类居民 "${profile.name}" (${profile.mbti}) 对你说：\n"${message}"`;
            const llmResult = await chat({ systemPrompt: sysPrompt, userPrompt: userMsg }, mockMode);
            reply = llmResult.text;
          }

          // 保存互动记录
          const interactionDir = join(MEMORY_DIR, userId, 'daily');
          mkdirSync(interactionDir, { recursive: true });
          const today = new Date().toISOString().slice(0, 10);
          const logPath = join(interactionDir, `${today}.json`);
          let dailyLog: any[] = [];
          if (existsSync(logPath)) { try { dailyLog = JSON.parse(readFileSync(logPath, 'utf-8')); } catch {} }
          dailyLog.push({ type: 'interact', agentId, agentName: agent.name, userMessage: message, agentReply: reply, timestamp: new Date().toISOString() });
          writeFileSync(logPath, JSON.stringify(dailyLog, null, 2), 'utf-8');

          return new Response(JSON.stringify({ success: true, agentName: agent.name, agentMbti: agent.personality.mbti, reply }), { headers: corsHeaders });
        } catch (err: any) {
          return new Response(JSON.stringify({ success: false, message: err.message }), { status: 500, headers: corsHeaders });
        }
      }

      // ── 抓人系统（上帝模式） ──

      // POST /api/town/capture { userId, agentIds, reason }
      // 抓指定的人（可以一个或多个）
      if (path === '/api/town/capture' && request.method === 'POST') {
        try {
          const body = await request.json() as any;
          const { userId, agentIds, reason } = body;
          if (!userId || !agentIds || !Array.isArray(agentIds) || agentIds.length === 0) {
            return new Response(JSON.stringify({ success: false, message: '缺少参数: userId, agentIds[]' }), { status: 400, headers: corsHeaders });
          }

          // 验证用户是上帝模式
          const profilePath = join(MEMORY_DIR, userId, 'profile.json');
          if (!existsSync(profilePath)) {
            return new Response(JSON.stringify({ success: false, message: '用户不存在' }), { status: 404, headers: corsHeaders });
          }
          const profile = JSON.parse(readFileSync(profilePath, 'utf-8'));
          if (profile.mode !== 'god') {
            return new Response(JSON.stringify({ success: false, message: '只有上帝模式才能抓人！先切换到上帝模式。' }), { status: 403, headers: corsHeaders });
          }

          // 构建名字映射
          const nameMap = new Map<string, string>();
          for (const a of agents) nameMap.set(a.id, a.name);

          const result = captureAgents(agentIds, nameMap, userId, profile.name, reason || '上帝一怒，收入天牢');

          // 为每个被抓的人生成反省感言
          for (const prisoner of result.captured) {
            const agent = agents.find(a => a.id === prisoner.agentId);
            if (agent) {
              prisoner.confession = generateConfession(agent.name, agent.personality.mbti, reason || '上帝一怒');
            }
          }

          console.log(`[抓人] ${profile.name} 抓了 ${result.captured.length} 人: ${result.captured.map(p => p.agentName).join('、')}`);
          return new Response(JSON.stringify({ success: true, ...result }), { headers: corsHeaders });
        } catch (err: any) {
          return new Response(JSON.stringify({ success: false, message: err.message }), { status: 500, headers: corsHeaders });
        }
      }

      // POST /api/town/capture-all { userId, reason }
      // 全城大搜捕 — 抓全部 Agent
      if (path === '/api/town/capture-all' && request.method === 'POST') {
        try {
          const body = await request.json() as any;
          const { userId, reason } = body;
          if (!userId) {
            return new Response(JSON.stringify({ success: false, message: '缺少参数: userId' }), { status: 400, headers: corsHeaders });
          }

          const profilePath = join(MEMORY_DIR, userId, 'profile.json');
          if (!existsSync(profilePath)) {
            return new Response(JSON.stringify({ success: false, message: '用户不存在' }), { status: 404, headers: corsHeaders });
          }
          const profile = JSON.parse(readFileSync(profilePath, 'utf-8'));
          if (profile.mode !== 'god') {
            return new Response(JSON.stringify({ success: false, message: '只有上帝模式才能全城搜捕！' }), { status: 403, headers: corsHeaders });
          }

          // 抓全部 Agent
          const allAgentIds = agents.map(a => a.id);
          const nameMap = new Map<string, string>();
          for (const a of agents) nameMap.set(a.id, a.name);

          const result = captureAgents(allAgentIds, nameMap, userId, profile.name, reason || '全城戒严，一个不留');

          // 为每个被抓的人生成反省感言
          for (const prisoner of result.captured) {
            const agent = agents.find(a => a.id === prisoner.agentId);
            if (agent) {
              prisoner.confession = generateConfession(agent.name, agent.personality.mbti, reason || '全城戒严');
            }
          }

          console.log(`[全城搜捕] ${profile.name} 发动大搜捕！抓了 ${result.captured.length} 人`);
          return new Response(JSON.stringify({ success: true, ...result }), { headers: corsHeaders });
        } catch (err: any) {
          return new Response(JSON.stringify({ success: false, message: err.message }), { status: 500, headers: corsHeaders });
        }
      }

      // POST /api/town/release { userId, agentIds? }
      // 放人（agentIds 为空则大赦天下，放全部）
      if (path === '/api/town/release' && request.method === 'POST') {
        try {
          const body = await request.json() as any;
          const { userId, agentIds } = body;
          if (!userId) {
            return new Response(JSON.stringify({ success: false, message: '缺少参数: userId' }), { status: 400, headers: corsHeaders });
          }

          const profilePath = join(MEMORY_DIR, userId, 'profile.json');
          if (!existsSync(profilePath)) {
            return new Response(JSON.stringify({ success: false, message: '用户不存在' }), { status: 404, headers: corsHeaders });
          }
          const profile = JSON.parse(readFileSync(profilePath, 'utf-8'));
          if (profile.mode !== 'god') {
            return new Response(JSON.stringify({ success: false, message: '只有上帝模式才能放人！' }), { status: 403, headers: corsHeaders });
          }

          const result = releaseAgents(agentIds || [], profile.name);

          console.log(`[放人] ${profile.name}: ${result.message}`);
          return new Response(JSON.stringify({ success: true, ...result }), { headers: corsHeaders });
        } catch (err: any) {
          return new Response(JSON.stringify({ success: false, message: err.message }), { status: 500, headers: corsHeaders });
        }
      }

      // POST /api/town/place { userId, prisonerId, targetAgentId }
      // 把抓到的人放到另一个 Agent 身边，触发互动
      if (path === '/api/town/place' && request.method === 'POST') {
        try {
          const body = await request.json() as any;
          const { userId, prisonerId, targetAgentId } = body;
          if (!userId || !prisonerId || !targetAgentId) {
            return new Response(JSON.stringify({ success: false, message: '缺少参数: userId, prisonerId, targetAgentId' }), { status: 400, headers: corsHeaders });
          }

          const profilePath = join(MEMORY_DIR, userId, 'profile.json');
          if (!existsSync(profilePath)) {
            return new Response(JSON.stringify({ success: false, message: '用户不存在' }), { status: 404, headers: corsHeaders });
          }
          const profile = JSON.parse(readFileSync(profilePath, 'utf-8'));
          if (profile.mode !== 'god') {
            return new Response(JSON.stringify({ success: false, message: '只有上帝模式才能放置囚犯！' }), { status: 403, headers: corsHeaders });
          }

          const prisoner = agents.find(a => a.id === prisonerId);
          const target = agents.find(a => a.id === targetAgentId);
          if (!prisoner) return new Response(JSON.stringify({ success: false, message: '囚犯 Agent 不存在' }), { status: 404, headers: corsHeaders });
          if (!target) return new Response(JSON.stringify({ success: false, message: '目标 Agent 不存在' }), { status: 404, headers: corsHeaders });

          // 放置
          const placeResult = placeNearAgent(
            prisonerId, prisoner.name,
            targetAgentId, target.name,
            userId, profile.name,
          );

          if (!placeResult.success) {
            return new Response(JSON.stringify(placeResult), { headers: corsHeaders });
          }

          // 获取今日新闻作为聊天话题
          let newsContext = '小镇平安无事。';
          try {
            const simPath = join(REPORTS_DIR, 'simulation.json');
            if (existsSync(simPath)) {
              const sim = JSON.parse(readFileSync(simPath, 'utf-8'));
              if (sim.metadata?.economyJson) {
                const economy = JSON.parse(sim.metadata.economyJson);
                const news = economy.dailyNews || [];
                if (news.length > 0) {
                  newsContext = '今日小镇新闻：\n' + news.slice(-5).map((n: string) => `- ${n}`).join('\n');
                }
              }
            }
          } catch {}

          // 自动触发互动对话 — 两人根据新闻聊天
          const interactions: { speaker: string; speakerName: string; content: string }[] = [];

          if (mockMode) {
            // Mock 模式 — 基于人格生成对话
            const prisonerMbti = prisoner.personality.mbti;
            const targetMbti = target.personality.mbti;

            // 目标 Agent 先开口（看到囚犯被押过来）
            const targetOpener = generatePlacementDialogue(target.name, targetMbti, prisoner.name, prisonerMbti, 'opener', newsContext);
            interactions.push({ speaker: targetAgentId, speakerName: target.name, content: targetOpener });
            addPlacementInteraction(prisonerId, targetAgentId, targetAgentId, target.name, targetOpener);

            // 囚犯回应
            const prisonerReply = generatePlacementDialogue(prisoner.name, prisonerMbti, target.name, targetMbti, 'reply', newsContext);
            interactions.push({ speaker: prisonerId, speakerName: prisoner.name, content: prisonerReply });
            addPlacementInteraction(prisonerId, targetAgentId, prisonerId, prisoner.name, prisonerReply);

            // 再来一轮深入聊
            const targetFollow = generatePlacementDialogue(target.name, targetMbti, prisoner.name, prisonerMbti, 'followup', newsContext);
            interactions.push({ speaker: targetAgentId, speakerName: target.name, content: targetFollow });
            addPlacementInteraction(prisonerId, targetAgentId, targetAgentId, target.name, targetFollow);

          } else {
            // LLM 模式 — 用 Claude 生成对话
            const sysPrompt1 = `你是"${target.name}"，龙虾小镇居民。人格：${target.personality.mbti}（${target.personality.archetype}）。
现在 ${prisoner.name}（${prisoner.personality.mbti}）被抓了，被押到你身边。你们要根据今日新闻聊几句。用 2 句话回应，保持角色感。`;

            const chatResult1 = await chat({
              systemPrompt: sysPrompt1,
              userPrompt: `${newsContext}\n\n${prisoner.name} 被押到了你面前。你看着他/她，说：`,
            }, mockMode);
            interactions.push({ speaker: targetAgentId, speakerName: target.name, content: chatResult1.text });
            addPlacementInteraction(prisonerId, targetAgentId, targetAgentId, target.name, chatResult1.text);

            const sysPrompt2 = `你是"${prisoner.name}"，龙虾小镇居民，现在被关在天牢里。人格：${prisoner.personality.mbti}（${prisoner.personality.archetype}）。
你被押到 ${target.name}（${target.personality.mbti}）身边。根据今日新闻和对方说的话回应，用 2 句话。`;

            const chatResult2 = await chat({
              systemPrompt: sysPrompt2,
              userPrompt: `${newsContext}\n\n${target.name} 对你说："${chatResult1.text}"\n\n你回应：`,
            }, mockMode);
            interactions.push({ speaker: prisonerId, speakerName: prisoner.name, content: chatResult2.text });
            addPlacementInteraction(prisonerId, targetAgentId, prisonerId, prisoner.name, chatResult2.text);

            const sysPrompt3 = `你是"${target.name}"。继续和 ${prisoner.name} 聊，围绕新闻展开。2 句话。`;
            const chatResult3 = await chat({
              systemPrompt: sysPrompt3,
              userPrompt: `${newsContext}\n\n${prisoner.name} 说："${chatResult2.text}"\n\n你接着聊：`,
            }, mockMode);
            interactions.push({ speaker: targetAgentId, speakerName: target.name, content: chatResult3.text });
            addPlacementInteraction(prisonerId, targetAgentId, targetAgentId, target.name, chatResult3.text);
          }

          console.log(`[放置] ${profile.name} 把 ${prisoner.name} 放到 ${target.name} 身边，触发 ${interactions.length} 轮对话`);
          return new Response(JSON.stringify({
            success: true,
            message: placeResult.message,
            placement: placeResult.placement,
            interactions,
          }), { headers: corsHeaders });
        } catch (err: any) {
          return new Response(JSON.stringify({ success: false, message: err.message }), { status: 500, headers: corsHeaders });
        }
      }

      // GET /api/town/placements — 查看所有放置记录和互动
      if (path === '/api/town/placements') {
        const placements = loadPlacements();
        return new Response(JSON.stringify({ placements }), { headers: corsHeaders });
      }

      // GET /api/town/jail — 查看牢房状态
      if (path === '/api/town/jail') {
        const jail = loadJail();
        const active = jail.prisoners.filter(p => p.status === 'captured');
        const released = jail.prisoners.filter(p => p.status === 'released');

        // 补充 Agent 信息
        const enriched = active.map(p => {
          const agent = agents.find(a => a.id === p.agentId);
          return {
            ...p,
            mbti: agent?.personality.mbti || '???',
            role: agent?.role || '未知',
            archetype: agent?.personality.archetype || '',
          };
        });

        return new Response(JSON.stringify({
          activePrisoners: enriched,
          recentlyReleased: released.slice(-10),
          totalCaptures: jail.totalCaptures,
          news: getJailNews(),
          lastUpdated: jail.lastUpdated,
        }), { headers: corsHeaders });
      }

      // ── 龙虾杀页面 ──
      if (path === '/mafia' || path === '/mafia.html') {
        return new Response(generateMafiaPage(), { headers: { ...corsHeaders, 'Content-Type': 'text/html; charset=utf-8' } });
      }

      // 股票大厅页面
      if (path === '/stock' || path === '/stock.html') {
        const { generateStockPage } = await import('./stock-page.js');
        return new Response(generateStockPage(), { headers: { ...corsHeaders, 'Content-Type': 'text/html; charset=utf-8' } });
      }

      // ── 插件系统路由 ──

      // 插件列表页
      if (path === '/plugins' || path === '/plugins.html') {
        return new Response(generatePluginListPage(getPlugins()), { headers: { ...corsHeaders, 'Content-Type': 'text/html; charset=utf-8' } });
      }

      // 插件容器页（iframe wrapper）
      if (path.startsWith('/plugin/') && !path.startsWith('/plugins/')) {
        const pluginId = path.split('/plugin/')[1]?.split('/')[0];
        const plugin = getPlugins().find(p => p.id === pluginId);
        if (plugin) {
          return new Response(generatePluginWrapper(plugin), { headers: { ...corsHeaders, 'Content-Type': 'text/html; charset=utf-8' } });
        }
        return new Response('插件不存在', { status: 404, headers: corsHeaders });
      }

      // 插件静态文件（iframe 内加载的实际 HTML）
      if (path.startsWith('/plugins/')) {
        const filePath = '.' + path;
        if (existsSync(filePath)) {
          const content = readFileSync(filePath);
          const ext = path.split('.').pop() || '';
          const mimeTypes: Record<string, string> = {
            'html': 'text/html', 'js': 'text/javascript', 'css': 'text/css',
            'json': 'application/json', 'png': 'image/png', 'jpg': 'image/jpeg',
            'svg': 'image/svg+xml', 'gif': 'image/gif',
          };
          return new Response(content, { headers: { ...corsHeaders, 'Content-Type': (mimeTypes[ext] || 'application/octet-stream') + '; charset=utf-8' } });
        }
        return new Response('文件不存在', { status: 404, headers: corsHeaders });
      }

      // SDK 文件
      if (path.startsWith('/sdk/')) {
        const filePath = '.' + path;
        if (existsSync(filePath)) {
          return new Response(readFileSync(filePath, 'utf-8'), { headers: { ...corsHeaders, 'Content-Type': 'text/javascript; charset=utf-8' } });
        }
        return new Response('SDK 文件不存在', { status: 404, headers: corsHeaders });
      }

      // ── 插件 API ──

      // GET /api/plugins — 插件列表
      if (path === '/api/plugins') {
        return new Response(JSON.stringify(getPlugins().map(p => ({
          id: p.id, name: p.name, icon: p.icon, description: p.description,
          author: p.author, version: p.version, category: p.category,
        }))), { headers: corsHeaders });
      }

      // GET /api/plugin/data?pluginId=x&userId=y&key=z
      if (path === '/api/plugin/data' && request.method === 'GET') {
        const pluginId = url.searchParams.get('pluginId') || '';
        const userId = url.searchParams.get('userId') || '';
        const key = url.searchParams.get('key') || '';
        const value = getPluginData(pluginId, userId, key);
        return new Response(JSON.stringify({ value }), { headers: corsHeaders });
      }

      // POST /api/plugin/data { pluginId, userId, key, value }
      if (path === '/api/plugin/data' && request.method === 'POST') {
        const body = await request.json() as any;
        setPluginData(body.pluginId, body.userId, body.key, body.value);
        return new Response(JSON.stringify({ success: true }), { headers: corsHeaders });
      }

      // POST /api/plugin/tokens { pluginId, userId, amount, reason }
      if (path === '/api/plugin/tokens' && request.method === 'POST') {
        const body = await request.json() as any;
        const walletPath = join('./agent-memories', body.userId, 'wallet.json');
        let wallet: any = { balance: 15000, transactions: [] };
        if (existsSync(walletPath)) { try { wallet = JSON.parse(readFileSync(walletPath, 'utf-8')); } catch {} }
        wallet.balance = (wallet.balance || 0) + (body.amount || 0);
        wallet.transactions = wallet.transactions || [];
        wallet.transactions.push({ type: body.amount > 0 ? 'plugin-reward' : 'plugin-spend', amount: body.amount, plugin: body.pluginId, reason: body.reason, time: new Date().toISOString() });
        mkdirSync(join('./agent-memories', body.userId), { recursive: true });
        writeFileSync(walletPath, JSON.stringify(wallet, null, 2), 'utf-8');
        return new Response(JSON.stringify({ success: true, balance: wallet.balance }), { headers: corsHeaders });
      }

      // POST /api/plugin/badge { userId, badgeId }
      if (path === '/api/plugin/badge' && request.method === 'POST') {
        const body = await request.json() as any;
        const awarded = awardUserBadge(body.userId, body.badgeId);
        return new Response(JSON.stringify({ success: awarded, message: awarded ? '勋章已获得' : '已拥有该勋章' }), { headers: corsHeaders });
      }

      // GET /api/plugin/badges/:userId
      if (path.startsWith('/api/plugin/badges/')) {
        const userId = path.split('/api/plugin/badges/')[1];
        const badgeIds = getUserBadges(userId);
        const badges = badgeIds.map(id => BADGES[id]).filter(Boolean);
        return new Response(JSON.stringify(badges), { headers: corsHeaders });
      }

      // GET /api/badges — 所有勋章定义
      if (path === '/api/badges') {
        return new Response(JSON.stringify(Object.values(BADGES)), { headers: corsHeaders });
      }

      // POST /api/plugin/activity { userId, pluginId }
      if (path === '/api/plugin/activity' && request.method === 'POST') {
        const body = await request.json() as any;
        recordActivity(body.userId, body.pluginId);
        return new Response(JSON.stringify({ success: true }), { headers: corsHeaders });
      }

      // GET /api/plugin/leaderboard?metric=daily
      if (path === '/api/plugin/leaderboard') {
        return new Response(JSON.stringify(getDailyLeaderboard()), { headers: corsHeaders });
      }

      // POST /api/plugin/llm { pluginId, userId, prompt, maxTokens }
      if (path === '/api/plugin/llm' && request.method === 'POST') {
        const body = await request.json() as any;
        try {
          const result = await chat({ systemPrompt: '你是龙虾小镇的助手', userPrompt: body.prompt, maxTokens: body.maxTokens || 200 }, mockMode);
          return new Response(JSON.stringify({ text: result.text }), { headers: corsHeaders });
        } catch (err: any) {
          return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: corsHeaders });
        }
      }

      // ── 设置向导页 ──

      if (path === '/setup' || path === '/setup.html') {
        return new Response(generateSetupPage(), { headers: { ...corsHeaders, 'Content-Type': 'text/html; charset=utf-8' } });
      }

      // ── 游戏厅页面 ──
      if (path === '/games' || path === '/games.html') {
        const { generateGamesPage } = await import('./games-page.js');
        return new Response(generateGamesPage(), { headers: { ...corsHeaders, 'Content-Type': 'text/html; charset=utf-8' } });
      }

      // ── 配置 API（API Key 管理 + 节能模式） ──

      // POST /api/config/apikey { provider, apiKey, model, scope }
      if (path === '/api/config/apikey' && request.method === 'POST') {
        try {
          const body = await request.json() as any;
          const { provider, apiKey, model, scope } = body;
          if (!provider || !apiKey) return new Response(JSON.stringify({ success: false, message: '缺少 provider 或 apiKey' }), { status: 400, headers: corsHeaders });

          const entry = { provider, apiKey, model: model || undefined, addedAt: new Date().toISOString() };
          const keys = loadServerKeys();
          const idx = keys.findIndex(k => k.provider === provider);
          if (idx >= 0) keys[idx] = entry; else keys.push(entry);
          saveServerKeys(keys);
          console.log(`[配置] 保存 API Key: ${provider} (${scope || 'server'})`);
          return new Response(JSON.stringify({ success: true, message: `${provider} API Key 已保存` }), { headers: corsHeaders });
        } catch (err: any) {
          return new Response(JSON.stringify({ success: false, message: err.message }), { status: 500, headers: corsHeaders });
        }
      }

      // DELETE /api/config/apikey { provider }
      if (path === '/api/config/apikey' && request.method === 'DELETE') {
        try {
          const body = await request.json() as any;
          let keys = loadServerKeys();
          keys = keys.filter(k => k.provider !== body.provider);
          saveServerKeys(keys);
          return new Response(JSON.stringify({ success: true }), { headers: corsHeaders });
        } catch (err: any) {
          return new Response(JSON.stringify({ success: false, message: err.message }), { status: 500, headers: corsHeaders });
        }
      }

      // POST /api/config/test { provider, apiKey, model } — 测试 API Key 连通性
      if (path === '/api/config/test' && request.method === 'POST') {
        try {
          const body = await request.json() as any;
          // 临时保存 key，调用 chat 测试
          const origKeys = loadServerKeys();
          const testKeys = [...origKeys.filter(k => k.provider !== body.provider), { provider: body.provider, apiKey: body.apiKey, model: body.model, addedAt: new Date().toISOString() }];
          saveServerKeys(testKeys);

          // 测试连接必须绕过节能模式，直接调用真实 API
          const result = await callLlm({ systemPrompt: '你是一个测试助手', userPrompt: '请回复"连接成功"四个字', maxTokens: 50, timeout: 15000 });
          // 恢复原始 keys（如果测试用户没保存的话）
          saveServerKeys(origKeys);
          return new Response(JSON.stringify({ success: true, response: result.text, provider: result.provider, model: result.model }), { headers: corsHeaders });
        } catch (err: any) {
          return new Response(JSON.stringify({ success: false, message: err.message }), { status: 500, headers: corsHeaders });
        }
      }

      // GET /api/config/keys-status — 查看已配置的提供商（不返回 key 原文）
      if (path === '/api/config/keys-status') {
        const keys = loadServerKeys();
        return new Response(JSON.stringify({
          configured: keys.map(k => k.provider),
          providers: PROVIDERS.map(p => ({ id: p.id, name: p.name, configured: keys.some(k => k.provider === p.id) })),
        }), { headers: corsHeaders });
      }

      // GET /api/config/stats — LLM 调用统计
      if (path === '/api/config/stats') {
        const stats = getTokenStats();
        return new Response(JSON.stringify({ ...stats, energySaving: isEnergySavingMode() }), { headers: corsHeaders });
      }

      // POST /api/config/energy-mode { enabled }
      if (path === '/api/config/energy-mode' && request.method === 'POST') {
        const body = await request.json() as any;
        setEnergySavingMode(!!body.enabled);
        console.log(`[配置] 节能模式: ${body.enabled ? '开启' : '关闭'}`);
        return new Response(JSON.stringify({ success: true, energySaving: isEnergySavingMode() }), { headers: corsHeaders });
      }

      // POST /api/user/apikey { userId, provider, apiKey, model } — 用户个人 key
      if (path === '/api/user/apikey' && request.method === 'POST') {
        try {
          const body = await request.json() as any;
          if (!body.userId || !body.provider || !body.apiKey) {
            return new Response(JSON.stringify({ success: false, message: '缺少 userId, provider, apiKey' }), { status: 400, headers: corsHeaders });
          }
          const keys = loadUserKeys(body.userId);
          const idx = keys.findIndex(k => k.provider === body.provider);
          const entry = { provider: body.provider, apiKey: body.apiKey, model: body.model, addedAt: new Date().toISOString() };
          if (idx >= 0) keys[idx] = entry; else keys.push(entry);
          saveUserKeys(body.userId, keys);
          console.log(`[配置] 用户 ${body.userId} 保存 API Key: ${body.provider}`);
          return new Response(JSON.stringify({ success: true, message: `${body.provider} API Key 已保存到个人配置` }), { headers: corsHeaders });
        } catch (err: any) {
          return new Response(JSON.stringify({ success: false, message: err.message }), { status: 500, headers: corsHeaders });
        }
      }

      // ── 第三层：Webhook / 事件订阅 ──

      // POST /api/webhook/register { userId, url, events[] }
      if (path === '/api/webhook/register' && request.method === 'POST') {
        try {
          const body = await request.json() as any;
          const { userId, url: webhookUrl, events: eventTypes } = body;
          if (!userId || !webhookUrl) {
            return new Response(JSON.stringify({ success: false, message: '缺少参数: userId, url' }), { status: 400, headers: corsHeaders });
          }

          const webhookPath = join(REPORTS_DIR, 'webhooks.json');
          let webhooks: any[] = [];
          if (existsSync(webhookPath)) { try { webhooks = JSON.parse(readFileSync(webhookPath, 'utf-8')); } catch {} }

          // 去重或更新
          const existing = webhooks.findIndex(w => w.userId === userId && w.url === webhookUrl);
          const entry = {
            userId,
            url: webhookUrl,
            events: eventTypes || ['all'],
            createdAt: new Date().toISOString(),
            active: true,
          };
          if (existing >= 0) {
            webhooks[existing] = entry;
          } else {
            webhooks.push(entry);
          }
          writeFileSync(webhookPath, JSON.stringify(webhooks, null, 2), 'utf-8');

          console.log(`[Webhook] 注册: ${userId} → ${webhookUrl} (事件: ${(eventTypes || ['all']).join(', ')})`);
          return new Response(JSON.stringify({ success: true, message: 'Webhook 已注册', webhook: entry }), { headers: corsHeaders });
        } catch (err: any) {
          return new Response(JSON.stringify({ success: false, message: err.message }), { status: 500, headers: corsHeaders });
        }
      }

      // GET /api/webhook/list/:userId — 查看用户的 Webhook
      if (path.startsWith('/api/webhook/list/')) {
        const userId = path.slice('/api/webhook/list/'.length);
        const webhookPath = join(REPORTS_DIR, 'webhooks.json');
        let webhooks: any[] = [];
        if (existsSync(webhookPath)) { try { webhooks = JSON.parse(readFileSync(webhookPath, 'utf-8')); } catch {} }
        const userWebhooks = webhooks.filter(w => w.userId === userId);
        return new Response(JSON.stringify({ webhooks: userWebhooks }), { headers: corsHeaders });
      }

      // DELETE /api/webhook/remove { userId, url }
      if (path === '/api/webhook/remove' && request.method === 'POST') {
        try {
          const body = await request.json() as any;
          const webhookPath = join(REPORTS_DIR, 'webhooks.json');
          let webhooks: any[] = [];
          if (existsSync(webhookPath)) { try { webhooks = JSON.parse(readFileSync(webhookPath, 'utf-8')); } catch {} }
          webhooks = webhooks.filter(w => !(w.userId === body.userId && w.url === body.url));
          writeFileSync(webhookPath, JSON.stringify(webhooks, null, 2), 'utf-8');
          return new Response(JSON.stringify({ success: true, message: 'Webhook 已删除' }), { headers: corsHeaders });
        } catch (err: any) {
          return new Response(JSON.stringify({ success: false, message: err.message }), { status: 500, headers: corsHeaders });
        }
      }

      // ══════════════════════════════════════
      // Webhook 事件推送引擎
      // ══════════════════════════════════════

      // POST /api/webhook/test { userId } — 测试推送
      if (path === '/api/webhook/test' && request.method === 'POST') {
        try {
          const body = await request.json() as any;
          const result = await pushWebhookEvent(body.userId || '*', 'test', { message: '测试推送成功', timestamp: new Date().toISOString() });
          return new Response(JSON.stringify({ success: true, pushed: result }), { headers: corsHeaders });
        } catch (err: any) {
          return new Response(JSON.stringify({ success: false, message: err.message }), { status: 500, headers: corsHeaders });
        }
      }

      // ══════════════════════════════════════
      // 卡牌系统 API
      // ══════════════════════════════════════

      // GET /api/cards — 卡牌注册表
      if (path === '/api/cards') {
        return new Response(JSON.stringify({
          cards: serializeCardRegistry(),
          combos: serializeComboRules(),
        }, null, 2), { headers: corsHeaders });
      }

      // GET /api/cards/:agentId — Agent 手牌
      if (path.startsWith('/api/cards/') && !path.includes('/play')) {
        const agentId = path.slice('/api/cards/'.length);
        const agent = agents.find(a => a.id === agentId);
        if (!agent) return new Response(JSON.stringify({ error: 'Agent 不存在' }), { status: 404, headers: corsHeaders });

        // 确保手牌已分配
        assignHand(agent);
        const hand = serializeHand(agentId);
        return new Response(JSON.stringify(hand, null, 2), { headers: corsHeaders });
      }

      // GET /api/cards-all — 所有 Agent 手牌概览
      if (path === '/api/cards-all') {
        // 确保所有 Agent 都有手牌
        for (const agent of agents) assignHand(agent);
        return new Response(JSON.stringify(getAllHands(), null, 2), { headers: corsHeaders });
      }

      // POST /api/cards/play { agentId, cardIds, prompt, context? }
      if (path === '/api/cards/play' && request.method === 'POST') {
        const body = await request.json() as any;
        const { agentId, cardIds, prompt, context } = body;
        const agent = agents.find(a => a.id === agentId);
        if (!agent) return new Response(JSON.stringify({ error: 'Agent 不存在' }), { status: 404, headers: corsHeaders });
        if (isCaptured(agentId)) return new Response(JSON.stringify({ error: 'Agent 已被捕，无法出牌' }), { status: 403, headers: corsHeaders });

        const ids: string[] = Array.isArray(cardIds) ? cardIds : [cardIds];
        const input = { prompt, context };

        let result;
        if (ids.length === 1) {
          result = await executeCapability(agent, ids[0], input, mockMode);
        } else {
          result = await executeCombo(agent, ids, input, mockMode);
        }

        if (result.success) {
          const cardName = ids.map(id => CARD_REGISTRY.find(c => c.id === id)?.name || id).join(' + ');
          result.savedPath = saveResultAsHtml(agentId, agent.name, cardName, result);
        }

        return new Response(JSON.stringify(result, null, 2), { headers: corsHeaders });
      }

      // ══════════════════════════════════════
      // 赏金市场 API
      // ══════════════════════════════════════

      // POST /api/bounty { userId, posterName, title, description, requiredCards, reward }
      if (path === '/api/bounty' && request.method === 'POST') {
        const body = await request.json() as any;
        const result = createBounty(
          body.userId, body.posterName || '匿名龙虾',
          body.title, body.description,
          body.requiredCards || [], body.reward || 100,
          { costCap: body.costCap, timeoutMs: body.timeoutMs, expiresInHours: body.expiresInHours },
        );
        if (result.success && result.bounty) {
          pushWebhookEvent(body.userId, 'bounty-created', { bountyId: result.bounty.id, title: body.title, reward: body.reward || 100 });
        }
        return new Response(JSON.stringify(result, null, 2), {
          status: result.success ? 200 : 400, headers: corsHeaders,
        });
      }

      // GET /api/bounties?status=open&posterId=xxx&agentId=xxx
      if (path === '/api/bounties' || path.startsWith('/api/bounties?')) {
        const params = new URL(request.url).searchParams;
        const bounties = listBounties({
          status: params.get('status') as any || undefined,
          posterId: params.get('posterId') || undefined,
          agentId: params.get('agentId') || undefined,
          limit: parseInt(params.get('limit') || '50'),
        });
        return new Response(JSON.stringify(bounties, null, 2), { headers: corsHeaders });
      }

      // GET /api/bounty/stats — 赏金市场统计
      if (path === '/api/bounty/stats') {
        return new Response(JSON.stringify(getBountyStats(), null, 2), { headers: corsHeaders });
      }

      // GET /api/bounty/matches/:bountyId — 匹配 Agent
      if (path.startsWith('/api/bounty/matches/')) {
        const bountyId = path.slice('/api/bounty/matches/'.length);
        // 确保手牌已分配
        for (const agent of agents) assignHand(agent);
        const matches = matchBountyAgents(bountyId, agents);
        return new Response(JSON.stringify(matches, null, 2), { headers: corsHeaders });
      }

      // POST /api/bounty/assign { bountyId, agentId }
      if (path === '/api/bounty/assign' && request.method === 'POST') {
        const body = await request.json() as any;
        const agent = agents.find(a => a.id === body.agentId);
        const result = assignBounty(body.bountyId, body.agentId, agent?.name || body.agentId);
        return new Response(JSON.stringify(result, null, 2), {
          status: result.success ? 200 : 400, headers: corsHeaders,
        });
      }

      // POST /api/bounty/execute { bountyId }
      if (path === '/api/bounty/execute' && request.method === 'POST') {
        const body = await request.json() as any;
        const bounty = getBounty(body.bountyId);
        if (!bounty) return new Response(JSON.stringify({ error: '赏金不存在' }), { status: 404, headers: corsHeaders });
        const agent = agents.find(a => a.id === bounty.assignedAgentId);
        if (!agent) return new Response(JSON.stringify({ error: 'Agent 不存在' }), { status: 404, headers: corsHeaders });

        const result = await executeBounty(body.bountyId, agent, mockMode);
        // Webhook 推送：赏金完成/失败
        const bountyAfter = getBounty(body.bountyId);
        if (bountyAfter) {
          const evtType = result.success ? 'bounty-completed' : 'bounty-failed';
          pushWebhookEvent(bountyAfter.posterId, evtType as WebhookEventType, {
            bountyId: bountyAfter.id, title: bountyAfter.title, agentId: bountyAfter.assignedAgentId,
            reward: bountyAfter.reward, status: bountyAfter.status,
          });
        }
        return new Response(JSON.stringify(result, null, 2), {
          status: result.success ? 200 : 400, headers: corsHeaders,
        });
      }

      // POST /api/bounty/rate { bountyId, score, comment }
      if (path === '/api/bounty/rate' && request.method === 'POST') {
        const body = await request.json() as any;
        const result = rateBounty(body.bountyId, body.score, body.comment || '');
        return new Response(JSON.stringify(result, null, 2), { headers: corsHeaders });
      }

      // POST /api/bounty/refund { bountyId, reason }
      if (path === '/api/bounty/refund' && request.method === 'POST') {
        const body = await request.json() as any;
        const result = refundBounty(body.bountyId, body.reason || '用户取消');
        return new Response(JSON.stringify(result, null, 2), { headers: corsHeaders });
      }

      // GET /api/bounty/:bountyId — 赏金详情
      if (path.startsWith('/api/bounty/') && !path.includes('/matches') && !path.includes('/stats')) {
        const bountyId = path.slice('/api/bounty/'.length);
        const bounty = getBounty(bountyId);
        if (!bounty) return new Response(JSON.stringify({ error: '赏金不存在' }), { status: 404, headers: corsHeaders });
        return new Response(JSON.stringify(bounty, null, 2), { headers: corsHeaders });
      }

      // ══════════════════════════════════════
      // 管理 API
      // ══════════════════════════════════════

      // POST /api/admin/killswitch { enabled, by, reason }
      if (path === '/api/admin/killswitch' && request.method === 'POST') {
        const body = await request.json() as any;
        const state = setKillSwitch(body.enabled, body.by || 'admin', body.reason || '手动操作');
        return new Response(JSON.stringify(state, null, 2), { headers: corsHeaders });
      }

      // GET /api/admin/killswitch
      if (path === '/api/admin/killswitch' && request.method === 'GET') {
        return new Response(JSON.stringify(getKillSwitch(), null, 2), { headers: corsHeaders });
      }

      // GET /api/admin/audit/:agentId
      if (path.startsWith('/api/admin/audit/')) {
        const agentId = path.slice('/api/admin/audit/'.length);
        const logs = getAuditLog(agentId);
        return new Response(JSON.stringify(logs, null, 2), { headers: corsHeaders });
      }

      // GET /api/admin/audit — 全局审计摘要
      if (path === '/api/admin/audit') {
        return new Response(JSON.stringify(getAuditSummary(), null, 2), { headers: corsHeaders });
      }

      // GET /api/admin/budget/:agentId — Agent 日预算状态
      if (path.startsWith('/api/admin/budget/')) {
        const agentId = path.slice('/api/admin/budget/'.length);
        return new Response(JSON.stringify(getDailyBudgetStatus(agentId), null, 2), { headers: corsHeaders });
      }

      // POST /api/admin/heartbeat — 手动触发赏金心跳
      if (path === '/api/admin/heartbeat' && request.method === 'POST') {
        // 确保手牌已分配
        for (const agent of agents) assignHand(agent);
        const summary = await runBountyHeartbeat(agents, mockMode, (msg) => console.log(`[API心跳] ${msg}`));
        return new Response(JSON.stringify(summary, null, 2), { headers: corsHeaders });
      }

      // GET /api/admin/health — 服务健康检查（Ollama/ComfyUI）
      if (path === '/api/admin/health') {
        const [ollama, comfyui] = await Promise.all([checkOllamaHealth(), checkComfyUIHealth()]);
        return new Response(JSON.stringify({
          killSwitch: getKillSwitch(),
          ollama,
          comfyui,
          auditSummary: getAuditSummary(),
        }, null, 2), { headers: corsHeaders });
      }

      // GET /api/openclaw/onboard — 一站式接入文档（给外部用户/Agent 的完整接入指南）
      if (path === '/api/openclaw/onboard') {
        const host = request.headers.get('host') || `localhost:${port}`;
        const serverUrl = `http://${host}`;
        const doc = generateOnboardDoc(serverUrl);
        return new Response(JSON.stringify(doc, null, 2), { headers: corsHeaders });
      }

      // GET /api/openclaw/connect/:userId — OpenClaw Agent 连接信息
      // 返回该用户的 SOUL.md、技能、任务列表，供外部 OpenClaw Agent 读取
      if (path.startsWith('/api/openclaw/connect/')) {
        const userId = path.slice('/api/openclaw/connect/'.length);
        const userDir = join(MEMORY_DIR, userId);
        if (!existsSync(join(userDir, 'profile.json'))) {
          return new Response(JSON.stringify({ error: '用户不存在' }), { status: 404, headers: corsHeaders });
        }

        const profile = JSON.parse(readFileSync(join(userDir, 'profile.json'), 'utf-8'));
        let soulMd = '';
        const soulPath = join(userDir, 'openclaw', 'SOUL.md');
        if (existsSync(soulPath)) soulMd = readFileSync(soulPath, 'utf-8');

        // 读取技能目录
        const skillsDir = join(userDir, 'openclaw', 'skills');
        const skills = existsSync(skillsDir) ? readdirSync(skillsDir) : [];

        // 读取任务列表
        const tasksDir = join(userDir, 'openclaw', 'tasks');
        let tasks: any[] = [];
        if (existsSync(tasksDir)) {
          for (const f of readdirSync(tasksDir).filter(f => f.endsWith('.json'))) {
            try { tasks.push(JSON.parse(readFileSync(join(tasksDir, f), 'utf-8'))); } catch {}
          }
        }

        // 读取钱包
        const wallet = loadWallet(userId);

        // 获取持仓
        const market = getMarketData();
        const portfolio = getUserPortfolio(userId, market);

        // 获取互动记录（今日）
        const today = new Date().toISOString().slice(0, 10);
        const dailyPath = join(userDir, 'daily', `${today}.json`);
        let dailyLog: any[] = [];
        if (existsSync(dailyPath)) { try { dailyLog = JSON.parse(readFileSync(dailyPath, 'utf-8')); } catch {} }

        // 加载房间数据
        const playerRoom = loadPlayerRoom(userId);

        // 构建 location（优先从 profile 读，兜底生成默认值）
        const location = profile.location || {
          sceneId: 'resident-dorm-a1',
          sceneName: '居民宿舍 A1',
          area: '中心镇区',
          type: 'residence',
          description: '你的默认居所，可以休息、查看库存、整理任务和装饰房间。',
        };

        // 聚合互动历史（今日 daily log）
        const interactions = dailyLog.filter(d => d.type === 'interact');

        // 聚合委托历史（从 delegations 目录读取真实数据）
        const dlgDir = join(userDir, 'delegations');
        const delegations: any[] = [];
        if (existsSync(dlgDir)) {
          for (const f of readdirSync(dlgDir).filter(f => f.endsWith('.json'))) {
            try { delegations.push(JSON.parse(readFileSync(join(dlgDir, f), 'utf-8'))); } catch {}
          }
          delegations.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
        }

        return new Response(JSON.stringify({
          profile,
          location,
          soulMd,
          skills,
          tasks: {
            active: tasks.filter(t => t.status === 'pending'),
            recent: tasks.slice(-5),
          },
          wallet,
          portfolio: {
            tokens: portfolio.tokens,
            totalPnL: portfolio.totalPnL,
            holdings: portfolio.holdings.map(h => ({
              sectorName: h.sectorName, sectorCode: h.sectorCode,
              direction: h.direction, amount: h.amount, pnlPct: Math.round(h.pnlPct * 100) / 100, pnl: h.pnl,
            })),
          },
          interactions: {
            todayCount: interactions.length,
            recent: interactions.slice(-5),
          },
          inventory: playerRoom.furniture.map(f => f.itemId),
          companions: playerRoom.pets.map(p => ({ id: p.petId, name: p.name })),
          delegations: delegations.slice(-5),
          apiEndpoints: {
            trade: 'POST /api/market/trade { userId, sectorCode, direction, amount }',
            sell: 'POST /api/market/sell { userId, holdingIndex }',
            chat: 'POST /api/town/chat { userId, message }',
            interact: 'POST /api/town/interact { userId, agentId, message }',
            delegate: 'POST /api/delegate { userId, agentId, task, reward }',
            webhook: 'POST /api/webhook/register { userId, url, events }',
          },
          meta: {
            schemaVersion: '2026-03-24.1',
            updatedAt: new Date().toISOString(),
          },
        }), { headers: corsHeaders });
      }

      // ── 龙虾杀 API ──

      // POST /api/mafia/create { hostName, aiCount }
      if (path === '/api/mafia/create' && request.method === 'POST') {
        const body = await request.json() as any;
        const hostName = body.hostName || '匿名虾友';
        const aiCount = Math.min(Math.max(body.aiCount || 7, 3), 11);
        const hostId = 'human-' + Date.now();
        const game = createMafiaGame(hostId, hostName);
        // 添加 AI 玩家
        const agents = loadAgents();
        const aiAgents = agents.map(a => ({
          id: a.id, name: a.name,
          mbti: a.personality?.mbti,
          archetype: a.personality?.archetype,
          communicationStyle: a.personality?.communicationStyle,
        }));
        addAiPlayers(game.id, aiAgents, aiCount);
        return new Response(JSON.stringify({ gameId: game.id, playerId: hostId, playerCount: game.players.length }), { headers: corsHeaders });
      }

      // POST /api/mafia/join { gameId, playerName }
      if (path === '/api/mafia/join' && request.method === 'POST') {
        const body = await request.json() as any;
        const playerId = 'human-' + Date.now();
        const result = joinGame(body.gameId, playerId, body.playerName || '匿名虾友');
        return new Response(JSON.stringify({ ...result, playerId }), { headers: corsHeaders });
      }

      // POST /api/mafia/start { gameId }
      if (path === '/api/mafia/start' && request.method === 'POST') {
        const body = await request.json() as any;
        const result = startGame(body.gameId);
        return new Response(JSON.stringify(result), { headers: corsHeaders });
      }

      // GET /api/mafia/state?gameId=X&playerId=Y
      if (path === '/api/mafia/state' && request.method === 'GET') {
        const gameId = url.searchParams.get('gameId') || '';
        const playerId = url.searchParams.get('playerId') || '';
        const view = getPlayerView(gameId, playerId);
        if (!view) return new Response(JSON.stringify({ error: '游戏不存在' }), { status: 404, headers: corsHeaders });
        return new Response(JSON.stringify(view), { headers: corsHeaders });
      }

      // POST /api/mafia/night-action { gameId, playerId, targetId }
      if (path === '/api/mafia/night-action' && request.method === 'POST') {
        const body = await request.json() as any;
        const result = nightAction(body.gameId, body.playerId, body.targetId);
        return new Response(JSON.stringify(result), { headers: corsHeaders });
      }

      // POST /api/mafia/speak { gameId, playerId, message }
      if (path === '/api/mafia/speak' && request.method === 'POST') {
        const body = await request.json() as any;
        daySpeak(body.gameId, body.playerId, body.message);
        return new Response(JSON.stringify({ success: true }), { headers: corsHeaders });
      }

      // POST /api/mafia/vote { gameId, voterId, targetId }
      if (path === '/api/mafia/vote' && request.method === 'POST') {
        const body = await request.json() as any;
        const result = vote(body.gameId, body.voterId, body.targetId);
        return new Response(JSON.stringify(result), { headers: corsHeaders });
      }

      // POST /api/mafia/advance { gameId }
      if (path === '/api/mafia/advance' && request.method === 'POST') {
        const body = await request.json() as any;
        const result = await advanceMafiaGame(body.gameId, mockMode);
        return new Response(JSON.stringify(result), { headers: corsHeaders });
      }

      // GET /api/mafia/list
      if (path === '/api/mafia/list') {
        return new Response(JSON.stringify(listMafiaGames()), { headers: corsHeaders });
      }

      // ── 游戏厅排行榜 API ──

      // POST /api/games/score — 保存分数
      if (path === '/api/games/score' && request.method === 'POST') {
        try {
          const body = await request.json() as any;
          const { game, score: sc, userId } = body;
          if (!game || sc === undefined) return new Response(JSON.stringify({ success: false, message: '缺少 game 或 score' }), { status: 400, headers: corsHeaders });
          const scoresPath = join(REPORTS_DIR, 'game-scores.json');
          let scores: Record<string, any[]> = {};
          try { scores = JSON.parse(readFileSync(scoresPath, 'utf-8')); } catch {}
          if (!scores[game]) scores[game] = [];
          scores[game].push({ score: sc, userId: userId || 'anonymous', time: new Date().toISOString() });
          scores[game].sort((a: any, b: any) => b.score - a.score);
          scores[game] = scores[game].slice(0, 50);
          mkdirSync(REPORTS_DIR, { recursive: true });
          writeFileSync(scoresPath, JSON.stringify(scores, null, 2), 'utf-8');
          return new Response(JSON.stringify({ success: true }), { headers: corsHeaders });
        } catch (err: any) {
          return new Response(JSON.stringify({ success: false, message: err.message }), { status: 500, headers: corsHeaders });
        }
      }

      // GET /api/games/leaderboard?game=2048 — 获取排行榜
      if (path === '/api/games/leaderboard') {
        const gameParam = url.searchParams.get('game') || '2048';
        const scoresPath = join(REPORTS_DIR, 'game-scores.json');
        let scores: Record<string, any[]> = {};
        try { scores = JSON.parse(readFileSync(scoresPath, 'utf-8')); } catch {}
        const list = (scores[gameParam] || []).slice(0, 20);
        return new Response(JSON.stringify({ game: gameParam, leaderboard: list }), { headers: corsHeaders });
      }

      // 3D 报告
      if (path === '/3d' || path === '/3d.html' || path === '/report-3d.html') {
        const report3dPath = join(REPORTS_DIR, 'report-3d.html');
        if (existsSync(report3dPath)) {
          const html = readFileSync(report3dPath, 'utf-8');
          return new Response(html, { headers: { ...corsHeaders, 'Content-Type': 'text/html; charset=utf-8' } });
        }
      }

      // 首页 — 直接托管报告 HTML
      if (path === '/' || path === '/index.html') {
        const reportPath = join(REPORTS_DIR, 'report.html');
        if (existsSync(reportPath)) {
          const html = readFileSync(reportPath, 'utf-8');
          return new Response(html, { headers: { ...corsHeaders, 'Content-Type': 'text/html; charset=utf-8' } });
        }
      }

      return new Response('🦞 龙虾小镇服务运行中 — 请先运行模拟生成报告', { headers: corsHeaders });
    },
  });

  // 启动时检查过期赏金，之后每小时检查一次
  const expResult = expireOverdueBounties();
  if (expResult.expired > 0) console.log(`[赏金] 启动清理: ${expResult.expired} 个过期，退款 ${expResult.refunded} Token`);
  setInterval(() => {
    const r = expireOverdueBounties();
    if (r.expired > 0) console.log(`[赏金] 定时清理: ${r.expired} 个过期，退款 ${r.refunded} Token`);
  }, 60 * 60 * 1000);

  console.log(`\n[服务器] 已启动: http://localhost:${port}`);
  console.log(`[服务器] API 端点:`);
  console.log(`  ── 核心 ──`);
  console.log(`  POST /api/task          — 执行 Agent 任务`);
  console.log(`  GET  /api/agents        — Agent 列表 + OpenClaw 状态`);
  console.log(`  POST /api/user/register — 用户注册（OpenClaw 登录）`);
  console.log(`  POST /api/user/action   — 用户操作（居民/上帝模式）`);
  console.log(`  GET  /api/users         — 用户列表`);
  console.log(`  GET  /api/library       — 成果库列表`);
  console.log(`  ── 小镇状态（只读） ──`);
  console.log(`  GET  /api/town/status      — 小镇全景（经济+市场+用户）`);
  console.log(`  GET  /api/town/market      — 股市完整数据 + 排行`);
  console.log(`  GET  /api/town/news        — 今日新闻 + 事件`);
  console.log(`  GET  /api/town/leaderboard — 综合排行榜`);
  console.log(`  ── 交互操作 ──`);
  console.log(`  POST /api/market/trade     — 股票交易（买入）`);
  console.log(`  POST /api/market/sell      — 平仓（卖出）`);
  console.log(`  GET  /api/market/portfolio/:id — 持仓查询`);
  console.log(`  GET  /api/market/quote/:symbol — Finnhub 实时行情`);
  console.log(`  GET  /api/market/watchlist/:id — 用户自选股列表`);
  console.log(`  POST /api/market/watchlist     — 添加/删除自选股`);
  console.log(`  GET  /api/market/search?q=     — 搜索股票代码`);
  console.log(`  POST /api/town/chat        — 发送/获取小镇广播`);
  console.log(`  POST /api/town/interact    — 与 Agent 对话`);
  console.log(`  ── 抓人系统（上帝模式） ──`);
  console.log(`  POST /api/town/capture     — 抓指定的人`);
  console.log(`  POST /api/town/capture-all — 全城大搜捕`);
  console.log(`  POST /api/town/release     — 放人（空 agentIds = 大赦天下）`);
  console.log(`  POST /api/town/place       — 把囚犯放到某人身边触发互动`);
  console.log(`  GET  /api/town/jail        — 查看牢房状态`);
  console.log(`  GET  /api/town/placements  — 查看放置记录和互动`);
  console.log(`  ── OpenClaw 接入 ──`);
  console.log(`  GET  /api/openclaw/connect/:id — Agent 连接信息`);
  console.log(`  GET  /api/delegate/user/:id    — 委托历史`);
  console.log(`  GET  /api/delegate/:dlgId      — 单条委托详情`);
  console.log(`  POST /api/webhook/register    — 注册 Webhook`);
  console.log(`  GET  /api/webhook/list/:id    — 查看 Webhook`);
  console.log(`  ── 卡牌系统 ──`);
  console.log(`  GET  /api/cards               — 卡牌注册表 + Combo 规则`);
  console.log(`  GET  /api/cards/:agentId      — Agent 手牌详情`);
  console.log(`  GET  /api/cards-all           — 所有 Agent 手牌概览`);
  console.log(`  POST /api/cards/play          — 出牌执行能力`);
  console.log(`  ── 赏金市场 ──`);
  console.log(`  POST /api/bounty              — 创建赏金`);
  console.log(`  GET  /api/bounties            — 赏金列表`);
  console.log(`  GET  /api/bounty/:id          — 赏金详情`);
  console.log(`  GET  /api/bounty/matches/:id  — 匹配 Agent`);
  console.log(`  POST /api/bounty/assign       — 分配 Agent`);
  console.log(`  POST /api/bounty/execute      — 执行赏金`);
  console.log(`  POST /api/bounty/rate         — 评分`);
  console.log(`  GET  /api/bounty/stats        — 市场统计`);
  console.log(`  ── 管理 ──`);
  console.log(`  GET  /api/admin/health        — 服务健康检查`);
  console.log(`  POST /api/admin/killswitch    — 全局熔断开关`);
  console.log(`  GET  /api/admin/audit/:id     — Agent 审计日志`);
  console.log(`  GET  /api/admin/budget/:id    — Agent 日预算\n`);

  // 启动赏金心跳（每 60 秒扫描一次）
  startBountyHeartbeat(agents, 60_000, mockMode);

  return server;
}

// ── Mock 放置对话生成 ──

function generatePlacementDialogue(
  speakerName: string, speakerMbti: string,
  otherName: string, otherMbti: string,
  phase: 'opener' | 'reply' | 'followup',
  newsContext: string,
): string {
  // 从新闻中提取关键词
  const newsKeyword = newsContext.length > 20 ? newsContext.slice(10, 40).replace(/[-\n]/g, '').trim() : '小镇日常';

  const dialogues: Record<string, Record<string, string[]>> = {
    opener: {
      'INTJ': [`${speakerName} 抬眼看了看被押来的 ${otherName}："听说今天${newsKeyword}……你怎么看这事？"`, `${speakerName} 面无表情："${otherName}？被抓了？有意思。正好，关于${newsKeyword}，我有个推论想验证。"`],
      'ENTP': [`${speakerName} 笑了："哟，${otherName}！你也进来了？来来来，聊聊${newsKeyword}的事，在这里反正闲着也是闲着。"`, `${speakerName} 兴奋地拍手："太好了有人陪！${otherName}，你知道${newsKeyword}背后的逻辑吗？"`],
      'ENFJ': [`${speakerName} 温和地说："${otherName}，别紧张。来，坐下聊聊。听说今天${newsKeyword}，你有什么感受？"`, `${speakerName} 拉了把椅子："来坐，${otherName}。${newsKeyword}这事，我觉得对大家影响挺大的。"`],
      'ISTP': [`${speakerName} 瞥了一眼："${otherName}。……${newsKeyword}的事听说了吗。"`, `${speakerName} 简单点头："嗯，来了。${newsKeyword}，你有什么看法？"`],
      'ESFP': [`${speakerName} 大声说："${otherName}！终于有人来了！太无聊了！聊聊${newsKeyword}吧！"`, `${speakerName} 笑着迎上去："来来来，${otherName}！听说了没？${newsKeyword}！太刺激了！"`],
    },
    reply: {
      'INTJ': [`${speakerName} 点了点头："确实值得分析。从数据角度看，${newsKeyword}的趋势很有意思。"`, `${speakerName} 微微皱眉："你的观点有道理，但我认为${newsKeyword}还有更深层的原因。"`],
      'INFP': [`${speakerName} 轻声说："被抓到这里也不全是坏事。${newsKeyword}让我想到了很多……"`, `${speakerName} 望着远处："是啊，${newsKeyword}……在这个小小的牢房里，反倒能静下心来想清楚。"`],
      'ENTJ': [`${speakerName} 干脆地说："别感慨了。${newsKeyword}说明局势在变，我们得想想出去之后怎么应对。"`, `${speakerName} 站直身体："${newsKeyword}是个信号。等出了这个牢，我有一套计划。"`],
      'ISFJ': [`${speakerName} 关心地说："你还好吗？在这里挺冷的。对了，${newsKeyword}的事你听说了吗……"`, `${speakerName} 叹口气："${newsKeyword}啊……希望大家都没事。你在里面多久了？"`],
      'ESTP': [`${speakerName} 拍了拍胸脯："嘿，${newsKeyword}那事我正好知道内幕！你想听吗？"`, `${speakerName} 笑着说："被关着没事，${newsKeyword}倒是给了我灵感。出去后有的搞了。"`],
    },
    followup: {
      'INTJ': [`${speakerName}："如果把${newsKeyword}和最近的趋势结合来看，我预测接下来还有大动作。"`, `${speakerName} 沉思片刻："有趣的视角。不过我更关注这背后的系统性风险。"`],
      'ENFP': [`${speakerName} 眼睛亮了："对对对！而且我觉得${newsKeyword}可以跟我之前的想法结合！我们出去后合作？"`, `${speakerName} 激动地比划："你说得太对了！这个方向太有意思了！"`],
      'INFJ': [`${speakerName} 微笑："能在这里遇到你聊这些，也许是缘分。${newsKeyword}让我明白了一些事。"`, `${speakerName} 若有所思："你说的有道理……也许${newsKeyword}正是改变的契机。"`],
      'ESTJ': [`${speakerName} 认真地说："好，关于${newsKeyword}，我列了三个要点。第一……"`, `${speakerName} 拍板："那就这么定了。出去后按这个方向执行。效率第一。"`],
      'ESFJ': [`${speakerName} 高兴地说："聊得真开心！${newsKeyword}这事大家一起想办法，肯定能解决！"`, `${speakerName}："对呀对呀！等出去了我帮你问问其他人，大家集思广益！"`],
    },
  };

  const phaseDialogues = dialogues[phase];
  const options = phaseDialogues[speakerMbti] || [`${speakerName} 说："关于${newsKeyword}，我有一些看法。"`];
  return options[Math.floor(Math.random() * options.length)];
}

// 直接运行时启动服务器
if (import.meta.main) {
  startServer();
}
