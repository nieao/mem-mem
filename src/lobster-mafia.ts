/**
 * 龙虾杀 — 狼人杀龙虾小镇版
 * 人类 + AI Agent 混合对战，回合制推理游戏
 */

import { chat } from './llm.js';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';

// ── 类型定义 ──

type MafiaRole = '龙虾杀手' | '虾民' | '占虾师' | '虾医';
type GamePhase = 'lobby' | 'night' | 'day-discuss' | 'day-vote' | 'ended';
type PlayerType = 'human' | 'ai';

interface MafiaPlayer {
  id: string;
  name: string;
  type: PlayerType;
  role?: MafiaRole;
  alive: boolean;
  // AI 相关
  mbti?: string;
  archetype?: string;
  communicationStyle?: string;
}

interface NightAction {
  playerId: string;
  role: MafiaRole;
  targetId: string;
}

interface GameMessage {
  playerId: string;
  playerName: string;
  content: string;
  phase: GamePhase;
  round: number;
  time: string;
}

interface MafiaGame {
  id: string;
  phase: GamePhase;
  round: number;
  players: MafiaPlayer[];
  messages: GameMessage[];
  nightActions: NightAction[];
  votes: Record<string, string>;  // voterId → targetId
  eliminatedTonight: string | null;  // 夜间被杀的人
  protectedTonight: string | null;   // 虾医保护的人
  checkedTonight: { playerId: string; targetId: string; isKiller: boolean } | null;
  winner: '正义' | '邪恶' | null;
  createdAt: string;
  hostId: string;  // 创建者
}

// ── 游戏管理 ──

const activeGames = new Map<string, MafiaGame>();
const GAMES_DIR = './reports/mafia-games';

function generateGameId(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  return Array.from({ length: 4 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
}

// 角色分配（8人局）：2杀手 + 1占虾师 + 1虾医 + 4虾民
function assignRoles(players: MafiaPlayer[]): void {
  const roles: MafiaRole[] = ['龙虾杀手', '龙虾杀手', '占虾师', '虾医'];
  while (roles.length < players.length) roles.push('虾民');
  // Fisher-Yates 洗牌
  for (let i = roles.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [roles[i], roles[j]] = [roles[j], roles[i]];
  }
  players.forEach((p, i) => { p.role = roles[i]; });
}

/** 创建新游戏 */
export function createMafiaGame(hostId: string, hostName: string): MafiaGame {
  const game: MafiaGame = {
    id: generateGameId(),
    phase: 'lobby',
    round: 0,
    players: [{ id: hostId, name: hostName, type: 'human', alive: true }],
    messages: [],
    nightActions: [],
    votes: {},
    eliminatedTonight: null,
    protectedTonight: null,
    checkedTonight: null,
    winner: null,
    createdAt: new Date().toISOString(),
    hostId,
  };
  activeGames.set(game.id, game);
  return game;
}

/** 加入游戏（人类） */
export function joinGame(gameId: string, playerId: string, playerName: string): { success: boolean; message: string } {
  const game = activeGames.get(gameId);
  if (!game) return { success: false, message: '游戏不存在' };
  if (game.phase !== 'lobby') return { success: false, message: '游戏已开始' };
  if (game.players.length >= 12) return { success: false, message: '人数已满' };
  if (game.players.some(p => p.id === playerId)) return { success: false, message: '你已在游戏中' };
  game.players.push({ id: playerId, name: playerName, type: 'human', alive: true });
  return { success: true, message: '加入成功' };
}

/** 添加 AI 玩家（从小镇居民中选） */
export function addAiPlayers(gameId: string, agents: Array<{ id: string; name: string; mbti?: string; archetype?: string; communicationStyle?: string }>, count: number): { success: boolean; added: number } {
  const game = activeGames.get(gameId);
  if (!game || game.phase !== 'lobby') return { success: false, added: 0 };

  const existingIds = new Set(game.players.map(p => p.id));
  const available = agents.filter(a => !existingIds.has(a.id));

  // 随机选择
  for (let i = available.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [available[i], available[j]] = [available[j], available[i]];
  }

  const toAdd = available.slice(0, count);
  for (const a of toAdd) {
    game.players.push({
      id: a.id, name: a.name, type: 'ai', alive: true,
      mbti: a.mbti, archetype: a.archetype, communicationStyle: a.communicationStyle,
    });
  }
  return { success: true, added: toAdd.length };
}

/** 开始游戏 */
export function startGame(gameId: string): { success: boolean; message: string } {
  const game = activeGames.get(gameId);
  if (!game) return { success: false, message: '游戏不存在' };
  if (game.players.length < 6) return { success: false, message: '至少需要 6 人' };

  assignRoles(game.players);
  game.phase = 'night';
  game.round = 1;
  game.messages.push({
    playerId: 'system', playerName: '系统',
    content: `🌙 第 ${game.round} 夜降临了...龙虾杀手睁眼行动`,
    phase: 'night', round: game.round, time: new Date().toISOString(),
  });

  return { success: true, message: '游戏开始！' };
}

/** 夜间行动 */
export function nightAction(gameId: string, playerId: string, targetId: string): { success: boolean; message: string; info?: string } {
  const game = activeGames.get(gameId);
  if (!game || game.phase !== 'night') return { success: false, message: '不是夜间阶段' };

  const player = game.players.find(p => p.id === playerId && p.alive);
  if (!player || !player.role) return { success: false, message: '无效操作' };

  const target = game.players.find(p => p.id === targetId && p.alive);
  if (!target) return { success: false, message: '目标无效' };

  // 记录行动
  game.nightActions = game.nightActions.filter(a => a.playerId !== playerId);
  game.nightActions.push({ playerId, role: player.role, targetId });

  let info = '';
  if (player.role === '占虾师') {
    info = target.role === '龙虾杀手' ? '🔴 此人是龙虾杀手！' : '🟢 此人是好人';
  }

  return { success: true, message: '行动已记录', info };
}

/** 结算夜间 → 进入白天讨论 */
export function resolveNight(gameId: string): { success: boolean; announcement: string } {
  const game = activeGames.get(gameId);
  if (!game || game.phase !== 'night') return { success: false, announcement: '' };

  // 找出杀手的目标
  const killAction = game.nightActions.find(a => a.role === '龙虾杀手');
  const protectAction = game.nightActions.find(a => a.role === '虾医');
  const checkAction = game.nightActions.find(a => a.role === '占虾师');

  game.eliminatedTonight = killAction?.targetId || null;
  game.protectedTonight = protectAction?.targetId || null;

  if (checkAction) {
    const target = game.players.find(p => p.id === checkAction.targetId);
    game.checkedTonight = {
      playerId: checkAction.playerId,
      targetId: checkAction.targetId,
      isKiller: target?.role === '龙虾杀手',
    };
  }

  let announcement: string;

  // 虾医救了？
  if (game.eliminatedTonight && game.eliminatedTonight === game.protectedTonight) {
    announcement = `☀️ 天亮了！昨晚平安无事。`;
    game.eliminatedTonight = null;
  } else if (game.eliminatedTonight) {
    const victim = game.players.find(p => p.id === game.eliminatedTonight);
    if (victim) {
      victim.alive = false;
      announcement = `☀️ 天亮了！${victim.name} 昨晚被龙虾杀手带走了...`;
    } else {
      announcement = `☀️ 天亮了！昨晚平安无事。`;
    }
  } else {
    announcement = `☀️ 天亮了！昨晚平安无事。`;
  }

  // 检查胜负
  const winner = checkWinner(game);
  if (winner) {
    game.winner = winner;
    game.phase = 'ended';
    announcement += ` 游戏结束！${winner}阵营获胜！`;
  } else {
    game.phase = 'day-discuss';
  }

  game.nightActions = [];
  game.messages.push({
    playerId: 'system', playerName: '系统',
    content: announcement, phase: game.phase, round: game.round,
    time: new Date().toISOString(),
  });

  return { success: true, announcement };
}

/** 白天发言 */
export function daySpeak(gameId: string, playerId: string, message: string): { success: boolean } {
  const game = activeGames.get(gameId);
  if (!game || (game.phase !== 'day-discuss' && game.phase !== 'day-vote')) return { success: false };

  const player = game.players.find(p => p.id === playerId && p.alive);
  if (!player) return { success: false };

  game.messages.push({
    playerId, playerName: player.name, content: message,
    phase: game.phase, round: game.round, time: new Date().toISOString(),
  });
  return { success: true };
}

/** 进入投票阶段 */
export function startVoting(gameId: string): { success: boolean } {
  const game = activeGames.get(gameId);
  if (!game || game.phase !== 'day-discuss') return { success: false };
  game.phase = 'day-vote';
  game.votes = {};
  game.messages.push({
    playerId: 'system', playerName: '系统',
    content: '🗳️ 投票开始！请选择要淘汰的玩家',
    phase: 'day-vote', round: game.round, time: new Date().toISOString(),
  });
  return { success: true };
}

/** 投票 */
export function vote(gameId: string, voterId: string, targetId: string): { success: boolean; message: string } {
  const game = activeGames.get(gameId);
  if (!game || game.phase !== 'day-vote') return { success: false, message: '不是投票阶段' };

  const voter = game.players.find(p => p.id === voterId && p.alive);
  if (!voter) return { success: false, message: '你无法投票' };

  game.votes[voterId] = targetId;
  return { success: true, message: `${voter.name} 已投票` };
}

/** 结算投票 → 进入下一夜 */
export function resolveVotes(gameId: string): { success: boolean; result: string } {
  const game = activeGames.get(gameId);
  if (!game || game.phase !== 'day-vote') return { success: false, result: '' };

  // 计票
  const tally: Record<string, number> = {};
  for (const targetId of Object.values(game.votes)) {
    tally[targetId] = (tally[targetId] || 0) + 1;
  }

  // 找最高票
  let maxVotes = 0;
  let eliminated: string | null = null;
  let tie = false;
  for (const [id, count] of Object.entries(tally)) {
    if (count > maxVotes) { maxVotes = count; eliminated = id; tie = false; }
    else if (count === maxVotes) tie = true;
  }

  let result: string;
  if (tie || !eliminated) {
    result = '⚖️ 平票！今天没有人被淘汰。';
  } else {
    const victim = game.players.find(p => p.id === eliminated);
    if (victim) {
      victim.alive = false;
      result = `🪦 ${victim.name}（${victim.role}）被投票淘汰了！`;
    } else {
      result = '投票无效';
    }
  }

  game.messages.push({
    playerId: 'system', playerName: '系统',
    content: result, phase: 'day-vote', round: game.round, time: new Date().toISOString(),
  });

  // 检查胜负
  const winner = checkWinner(game);
  if (winner) {
    game.winner = winner;
    game.phase = 'ended';
    result += ` 游戏结束！${winner}阵营获胜！🎉`;
    game.messages.push({
      playerId: 'system', playerName: '系统',
      content: `🏆 ${winner}阵营获胜！`, phase: 'ended', round: game.round, time: new Date().toISOString(),
    });
  } else {
    // 下一轮
    game.round++;
    game.phase = 'night';
    game.votes = {};
    game.messages.push({
      playerId: 'system', playerName: '系统',
      content: `🌙 第 ${game.round} 夜降临了...`,
      phase: 'night', round: game.round, time: new Date().toISOString(),
    });
  }

  // 保存
  saveGame(game);

  return { success: true, result };
}

/** 检查胜负 */
function checkWinner(game: MafiaGame): '正义' | '邪恶' | null {
  const alive = game.players.filter(p => p.alive);
  const killers = alive.filter(p => p.role === '龙虾杀手');
  const others = alive.filter(p => p.role !== '龙虾杀手');

  if (killers.length === 0) return '正义';
  if (killers.length >= others.length) return '邪恶';
  return null;
}

/** 保存游戏 */
function saveGame(game: MafiaGame): void {
  mkdirSync(GAMES_DIR, { recursive: true });
  writeFileSync(join(GAMES_DIR, `${game.id}.json`), JSON.stringify(game, null, 2), 'utf-8');
}

/** 获取玩家视角的游戏状态（按角色过滤信息） */
export function getPlayerView(gameId: string, playerId: string): any {
  const game = activeGames.get(gameId);
  if (!game) return null;

  const me = game.players.find(p => p.id === playerId);
  const isKiller = me?.role === '龙虾杀手';

  return {
    id: game.id,
    phase: game.phase,
    round: game.round,
    winner: game.winner,
    myRole: me?.role,
    myAlive: me?.alive,
    players: game.players.map(p => ({
      id: p.id,
      name: p.name,
      type: p.type,
      alive: p.alive,
      // 只有同阵营杀手互相可见角色，或游戏结束后公开
      role: (game.phase === 'ended' || (isKiller && p.role === '龙虾杀手') || p.id === playerId) ? p.role : undefined,
    })),
    messages: game.messages.filter(m => {
      // 系统消息和白天消息全部可见
      if (m.phase !== 'night') return true;
      if (m.playerId === 'system') return true;
      return false;
    }),
    votes: game.phase === 'day-vote' ? game.votes : {},
    // 占虾师查验结果（只给占虾师看）
    checkResult: (me?.role === '占虾师' && game.checkedTonight?.playerId === playerId) ? game.checkedTonight : null,
    alivePlayers: game.players.filter(p => p.alive).length,
    totalPlayers: game.players.length,
  };
}

// ── AI 玩家逻辑 ──

/** AI 夜间行动 */
export async function aiNightActions(gameId: string, mockMode = false): Promise<void> {
  const game = activeGames.get(gameId);
  if (!game || game.phase !== 'night') return;

  const aiPlayers = game.players.filter(p => p.type === 'ai' && p.alive && p.role);
  const alivePlayers = game.players.filter(p => p.alive);

  for (const ai of aiPlayers) {
    if (ai.role === '龙虾杀手') {
      // 杀手：随机选一个非杀手的人
      const targets = alivePlayers.filter(p => p.role !== '龙虾杀手');
      if (targets.length > 0) {
        const target = targets[Math.floor(Math.random() * targets.length)];
        nightAction(gameId, ai.id, target.id);
      }
    } else if (ai.role === '占虾师') {
      // 占虾师：随机查验一个人
      const targets = alivePlayers.filter(p => p.id !== ai.id);
      if (targets.length > 0) {
        const target = targets[Math.floor(Math.random() * targets.length)];
        nightAction(gameId, ai.id, target.id);
      }
    } else if (ai.role === '虾医') {
      // 虾医：随机保护一个人（包括自己）
      const target = alivePlayers[Math.floor(Math.random() * alivePlayers.length)];
      nightAction(gameId, ai.id, target.id);
    }
    // 虾民夜间无行动
  }
}

/** AI 白天发言 */
export async function aiDaySpeak(gameId: string, mockMode = false): Promise<void> {
  const game = activeGames.get(gameId);
  if (!game || game.phase !== 'day-discuss') return;

  const aiPlayers = game.players.filter(p => p.type === 'ai' && p.alive);

  for (const ai of aiPlayers) {
    const isKiller = ai.role === '龙虾杀手';
    const recentMsgs = game.messages.slice(-10).map(m => `${m.playerName}: ${m.content}`).join('\n');
    const alivelist = game.players.filter(p => p.alive).map(p => p.name).join('、');

    const systemPrompt = `你是${ai.name}，${ai.archetype || '虾民'}。你正在玩龙虾杀游戏（类似狼人杀）。
你的角色是${ai.role}。${isKiller ? '你需要隐藏身份，转移怀疑。' : '你需要通过分析找出龙虾杀手。'}
说话风格：${ai.communicationStyle || '简洁'}。
用 1-2 句话发言，要有自己的观点和怀疑方向。不要太长。`;

    const userPrompt = `当前存活: ${alivelist}
第 ${game.round} 天讨论。
近期发言:
${recentMsgs || '（还没人发言）'}
请发表你的看法:`;

    try {
      const result = await chat({ systemPrompt, userPrompt, maxTokens: 150 }, mockMode);
      daySpeak(gameId, ai.id, result.text);
    } catch {
      daySpeak(gameId, ai.id, '我需要再观察一下...');
    }
  }
}

/** AI 投票 */
export async function aiVote(gameId: string, mockMode = false): Promise<void> {
  const game = activeGames.get(gameId);
  if (!game || game.phase !== 'day-vote') return;

  const aiPlayers = game.players.filter(p => p.type === 'ai' && p.alive);
  const alivePlayers = game.players.filter(p => p.alive);

  for (const ai of aiPlayers) {
    // 简单策略：杀手投非杀手，好人随机投（有概率投到杀手）
    const isKiller = ai.role === '龙虾杀手';
    let candidates = alivePlayers.filter(p => p.id !== ai.id);

    if (isKiller) {
      // 杀手：不投同伴
      candidates = candidates.filter(p => p.role !== '龙虾杀手');
    }

    if (candidates.length > 0) {
      const target = candidates[Math.floor(Math.random() * candidates.length)];
      vote(gameId, ai.id, target.id);
    }
  }
}

/** 一键推进游戏（自动化 AI 行为） */
export async function advanceGame(gameId: string, mockMode = false): Promise<{ phase: string; message: string }> {
  const game = activeGames.get(gameId);
  if (!game) return { phase: 'error', message: '游戏不存在' };

  if (game.phase === 'night') {
    await aiNightActions(gameId, mockMode);
    const result = resolveNight(gameId);
    return { phase: game.phase, message: result.announcement };
  }

  if (game.phase === 'day-discuss') {
    await aiDaySpeak(gameId, mockMode);
    startVoting(gameId);
    return { phase: 'day-vote', message: 'AI 已发言，进入投票' };
  }

  if (game.phase === 'day-vote') {
    await aiVote(gameId, mockMode);
    const result = resolveVotes(gameId);
    return { phase: game.phase, message: result.result };
  }

  return { phase: game.phase, message: '当前状态无法推进' };
}

// ── 列出游戏 ──

export function listGames(): Array<{ id: string; phase: string; playerCount: number; round: number }> {
  return Array.from(activeGames.values()).map(g => ({
    id: g.id, phase: g.phase, playerCount: g.players.length, round: g.round,
  }));
}

export function getGame(gameId: string): MafiaGame | undefined {
  return activeGames.get(gameId);
}

// ── 页面生成 ──

export function generateMafiaPage(): string {
  // 返回龙虾杀游戏页面 HTML — 建筑极简唯美风格
  return `<!DOCTYPE html>
<html lang="zh">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>龙虾杀 — 龙虾小镇</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
:root{--black:#1a1a1a;--dark:#2d2d2d;--gray-700:#555;--gray-500:#888;--gray-100:#e8e8e8;--white:#fafafa;--warm:#c8a882;--warm-light:#e8d5c0;--warm-bg:#f5f0eb;--red:#d4534a;--green:#5a9e6f}
body{font-family:"Noto Sans SC",system-ui,sans-serif;background:var(--white);color:var(--dark);min-height:100vh}
.container{max-width:800px;margin:0 auto;padding:24px}
h1{font-family:"Noto Serif SC",Georgia,serif;font-size:1.6rem;letter-spacing:0.02em;color:var(--black);margin-bottom:8px}
.nav{display:flex;align-items:center;justify-content:space-between;padding:16px 0;border-bottom:1px solid var(--gray-100);margin-bottom:24px}
.nav a{color:var(--gray-500);text-decoration:none;font-size:0.8rem;letter-spacing:0.1em}
.nav a:hover{color:var(--warm)}
.card{border:1px solid var(--gray-100);padding:20px;margin-bottom:16px;transition:all 0.4s cubic-bezier(0.22,1,0.36,1)}
.card:hover{border-color:var(--warm);transform:translateY(-2px);box-shadow:0 4px 20px rgba(0,0,0,0.06)}
.btn{display:inline-block;padding:10px 24px;border:1px solid var(--dark);background:var(--dark);color:var(--white);cursor:pointer;font-size:0.85rem;letter-spacing:0.05em;transition:all 0.3s}
.btn:hover{background:var(--warm);border-color:var(--warm)}
.btn:disabled{opacity:0.4;cursor:not-allowed}
.btn-outline{background:transparent;color:var(--dark)}
.btn-outline:hover{background:var(--warm-bg)}
.btn-danger{border-color:var(--red);color:var(--red);background:transparent}
.btn-danger:hover{background:var(--red);color:white}
.label{font-size:0.7rem;letter-spacing:0.25em;color:var(--warm);text-transform:uppercase;margin-bottom:8px}
.player-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:12px;margin:16px 0}
.player-card{padding:12px;border:1px solid var(--gray-100);text-align:center;position:relative}
.player-card.dead{opacity:0.35;text-decoration:line-through}
.player-card.killer{border-color:var(--red)}
.player-card .emoji{font-size:2rem;margin-bottom:4px}
.player-card .name{font-size:0.85rem;color:var(--dark)}
.player-card .role{font-size:0.7rem;color:var(--warm);margin-top:4px}
.player-card .badge{position:absolute;top:4px;right:4px;font-size:0.6rem;padding:2px 6px;border-radius:2px}
.badge-ai{background:var(--warm-bg);color:var(--warm)}
.badge-human{background:#e8f0e8;color:var(--green)}
.chat-box{border:1px solid var(--gray-100);height:300px;overflow-y:auto;padding:12px;margin:16px 0;font-size:0.85rem}
.chat-msg{margin-bottom:8px;line-height:1.5}
.chat-msg .sender{color:var(--warm);font-weight:600}
.chat-msg.system{color:var(--gray-500);font-style:italic;text-align:center}
.vote-section{display:flex;flex-wrap:wrap;gap:8px;margin:12px 0}
.vote-btn{padding:8px 16px;border:1px solid var(--gray-100);background:var(--white);cursor:pointer;font-size:0.8rem;transition:all 0.3s}
.vote-btn:hover{border-color:var(--red);color:var(--red)}
.vote-btn.selected{background:var(--red);color:white;border-color:var(--red)}
.phase-badge{display:inline-block;padding:4px 12px;font-size:0.7rem;letter-spacing:0.15em;border:1px solid var(--warm);color:var(--warm);margin-left:12px}
.night{background:#1a1a2e;color:#e8d5c0}
.input{padding:8px 12px;border:1px solid var(--gray-100);font-size:0.85rem;width:100%;font-family:inherit}
.input:focus{outline:none;border-color:var(--warm)}
.flex{display:flex;gap:8px;align-items:center}
.mt{margin-top:16px}
.mb{margin-bottom:16px}
.text-center{text-align:center}
.text-sm{font-size:0.8rem;color:var(--gray-500)}
#game-view{display:none}
</style>
</head>
<body>
<div class="container">
  <div class="nav">
    <div><h1>🦞 龙虾杀</h1><span class="text-sm">龙虾小镇 · 社交推理游戏</span></div>
    <div><a href="/">← 返回小镇</a> &nbsp; <a href="/games">游戏厅</a></div>
  </div>

  <!-- 大厅 -->
  <div id="lobby-view">
    <div class="card">
      <div class="label">创建新游戏</div>
      <p class="text-sm mb">创建一局龙虾杀，AI 居民会自动加入和你一起玩</p>
      <div class="flex mb">
        <input class="input" id="host-name" placeholder="你的昵称" style="max-width:200px" />
        <select class="input" id="ai-count" style="max-width:120px">
          <option value="5">5 个 AI</option>
          <option value="6">6 个 AI</option>
          <option value="7" selected>7 个 AI</option>
          <option value="9">9 个 AI</option>
          <option value="11">11 个 AI</option>
        </select>
        <button class="btn" onclick="createGame()">开局</button>
      </div>
    </div>
    <div class="card">
      <div class="label">加入已有游戏</div>
      <div class="flex">
        <input class="input" id="join-code" placeholder="房间号（4位）" style="max-width:140px" />
        <input class="input" id="join-name" placeholder="你的昵称" style="max-width:160px" />
        <button class="btn btn-outline" onclick="joinExistingGame()">加入</button>
      </div>
    </div>
    <div id="active-games" class="mt"></div>
  </div>

  <!-- 游戏界面 -->
  <div id="game-view">
    <div class="flex" style="justify-content:space-between;margin-bottom:16px">
      <div>
        <span class="label" id="game-id-display">房间: ----</span>
        <span class="phase-badge" id="phase-display">等待</span>
      </div>
      <div>
        <span class="text-sm" id="role-display">角色: ???</span>
      </div>
    </div>

    <div class="player-grid" id="players-grid"></div>

    <div class="chat-box" id="chat-box"></div>

    <!-- 行动区 -->
    <div id="action-area">
      <!-- 夜间行动 -->
      <div id="night-action" style="display:none">
        <div class="label" id="night-label">选择目标</div>
        <div class="vote-section" id="night-targets"></div>
        <button class="btn mt" id="night-submit" onclick="submitNightAction()">确认行动</button>
      </div>

      <!-- 白天发言 -->
      <div id="day-speak" style="display:none">
        <div class="flex">
          <input class="input" id="speak-input" placeholder="发表你的看法..." />
          <button class="btn" onclick="submitSpeak()">发言</button>
        </div>
      </div>

      <!-- 投票 -->
      <div id="vote-area" style="display:none">
        <div class="label">投票淘汰</div>
        <div class="vote-section" id="vote-targets"></div>
        <button class="btn btn-danger mt" id="vote-submit" onclick="submitVote()">确认投票</button>
      </div>
    </div>

    <!-- 推进按钮 -->
    <div class="mt text-center">
      <button class="btn" id="advance-btn" onclick="advanceGame()">推进游戏 →</button>
      <span class="text-sm" id="advance-hint">（AI 会自动行动和发言）</span>
    </div>
  </div>
</div>

<script>
var SERVER = window.location.origin;
var currentGameId = null;
var currentPlayerId = null;
var selectedTarget = null;
var pollInterval = null;

function api(path, method, body) {
  var opts = { method: method, headers: { 'Content-Type': 'application/json' } };
  if (body) opts.body = JSON.stringify(body);
  return fetch(SERVER + path, opts).then(function(r) { return r.json(); });
}

function createGame() {
  var name = document.getElementById('host-name').value.trim() || '匿名虾友';
  var aiCount = parseInt(document.getElementById('ai-count').value);
  api('/api/mafia/create', 'POST', { hostName: name, aiCount: aiCount }).then(function(data) {
    if (data.gameId) {
      currentGameId = data.gameId;
      currentPlayerId = data.playerId;
      showGameView();
      // 自动开始
      api('/api/mafia/start', 'POST', { gameId: currentGameId }).then(function() {
        refreshGame();
        startPolling();
      });
    }
  });
}

function joinExistingGame() {
  var code = document.getElementById('join-code').value.trim().toUpperCase();
  var name = document.getElementById('join-name').value.trim() || '匿名虾友';
  api('/api/mafia/join', 'POST', { gameId: code, playerName: name }).then(function(data) {
    if (data.success) {
      currentGameId = code;
      currentPlayerId = data.playerId;
      showGameView();
      refreshGame();
      startPolling();
    } else {
      alert(data.message);
    }
  });
}

function showGameView() {
  document.getElementById('lobby-view').style.display = 'none';
  document.getElementById('game-view').style.display = 'block';
}

function refreshGame() {
  if (!currentGameId || !currentPlayerId) return;
  api('/api/mafia/state?gameId=' + currentGameId + '&playerId=' + currentPlayerId, 'GET').then(function(state) {
    if (!state || !state.phase) return;
    renderGame(state);
  });
}

function renderGame(state) {
  document.getElementById('game-id-display').textContent = '房间: ' + state.id;
  var phaseNames = { lobby: '等待', night: '🌙 夜晚', 'day-discuss': '☀️ 讨论', 'day-vote': '🗳️ 投票', ended: '🏆 结束' };
  var phaseEl = document.getElementById('phase-display');
  phaseEl.textContent = (phaseNames[state.phase] || state.phase) + ' R' + state.round;
  if (state.phase === 'night') phaseEl.classList.add('night'); else phaseEl.classList.remove('night');

  document.getElementById('role-display').textContent = '角色: ' + (state.myRole || '???');

  // 玩家列表
  var grid = document.getElementById('players-grid');
  grid.innerHTML = state.players.map(function(p) {
    var cls = 'player-card';
    if (!p.alive) cls += ' dead';
    if (state.phase === 'ended' && p.role === '龙虾杀手') cls += ' killer';
    var badge = p.type === 'ai' ? '<span class="badge badge-ai">AI</span>' : '<span class="badge badge-human">人类</span>';
    var roleText = p.role ? p.role : '';
    return '<div class="' + cls + '">' + badge + '<div class="emoji">' + (p.alive ? '🦞' : '💀') + '</div><div class="name">' + p.name + '</div>' + (roleText ? '<div class="role">' + roleText + '</div>' : '') + '</div>';
  }).join('');

  // 聊天
  var chatBox = document.getElementById('chat-box');
  chatBox.innerHTML = state.messages.map(function(m) {
    if (m.playerId === 'system') return '<div class="chat-msg system">' + m.content + '</div>';
    return '<div class="chat-msg"><span class="sender">' + m.playerName + ':</span> ' + m.content + '</div>';
  }).join('');
  chatBox.scrollTop = chatBox.scrollHeight;

  // 行动区
  var nightArea = document.getElementById('night-action');
  var daySpeakArea = document.getElementById('day-speak');
  var voteArea = document.getElementById('vote-area');
  nightArea.style.display = 'none';
  daySpeakArea.style.display = 'none';
  voteArea.style.display = 'none';

  var alive = state.players.filter(function(p) { return p.alive && p.id !== currentPlayerId; });

  if (state.myAlive && state.phase === 'night' && (state.myRole === '龙虾杀手' || state.myRole === '占虾师' || state.myRole === '虾医')) {
    nightArea.style.display = 'block';
    var labels = { '龙虾杀手': '选择要击杀的目标', '占虾师': '选择要查验的目标', '虾医': '选择要保护的目标' };
    document.getElementById('night-label').textContent = labels[state.myRole] || '选择目标';
    var targets = state.myRole === '虾医' ? state.players.filter(function(p) { return p.alive; }) : alive;
    document.getElementById('night-targets').innerHTML = targets.map(function(p) {
      return '<button class="vote-btn" data-id="' + p.id + '" onclick="selectTarget(this)">' + p.name + '</button>';
    }).join('');
  }

  if (state.myAlive && state.phase === 'day-discuss') {
    daySpeakArea.style.display = 'block';
  }

  if (state.myAlive && state.phase === 'day-vote') {
    voteArea.style.display = 'block';
    document.getElementById('vote-targets').innerHTML = alive.map(function(p) {
      return '<button class="vote-btn" data-id="' + p.id + '" onclick="selectTarget(this)">' + p.name + '</button>';
    }).join('');
  }

  // 查验结果
  if (state.checkResult) {
    var msg = state.checkResult.isKiller ? '🔴 查验结果: 此人是龙虾杀手！' : '🟢 查验结果: 此人是好人';
    if (!document.querySelector('.check-result')) {
      var div = document.createElement('div');
      div.className = 'check-result card';
      div.style.background = state.checkResult.isKiller ? '#fff0f0' : '#f0fff0';
      div.textContent = msg;
      document.getElementById('action-area').prepend(div);
    }
  }

  // 推进按钮
  var advBtn = document.getElementById('advance-btn');
  if (state.phase === 'ended') {
    advBtn.textContent = '返回大厅';
    advBtn.onclick = function() { location.reload(); };
  }
}

function selectTarget(el) {
  document.querySelectorAll('.vote-btn').forEach(function(b) { b.classList.remove('selected'); });
  el.classList.add('selected');
  selectedTarget = el.dataset.id;
}

function submitNightAction() {
  if (!selectedTarget) return alert('请选择目标');
  api('/api/mafia/night-action', 'POST', { gameId: currentGameId, playerId: currentPlayerId, targetId: selectedTarget }).then(function() {
    selectedTarget = null;
    document.getElementById('night-action').style.display = 'none';
    document.getElementById('night-submit').textContent = '✓ 已行动';
  });
}

function submitSpeak() {
  var input = document.getElementById('speak-input');
  var msg = input.value.trim();
  if (!msg) return;
  api('/api/mafia/speak', 'POST', { gameId: currentGameId, playerId: currentPlayerId, message: msg }).then(function() {
    input.value = '';
    refreshGame();
  });
}

function submitVote() {
  if (!selectedTarget) return alert('请选择投票目标');
  api('/api/mafia/vote', 'POST', { gameId: currentGameId, voterId: currentPlayerId, targetId: selectedTarget }).then(function() {
    selectedTarget = null;
    document.getElementById('vote-submit').textContent = '✓ 已投票';
  });
}

function advanceGame() {
  var btn = document.getElementById('advance-btn');
  btn.disabled = true;
  btn.textContent = '推进中...';
  api('/api/mafia/advance', 'POST', { gameId: currentGameId }).then(function() {
    return refreshGame();
  }).then(function() {
    btn.disabled = false;
    btn.textContent = '推进游戏 →';
  });
}

function startPolling() {
  if (pollInterval) clearInterval(pollInterval);
  pollInterval = setInterval(refreshGame, 3000);
}

// 加载活跃游戏
function loadActiveGames() {
  api('/api/mafia/list', 'GET').then(function(data) {
    var el = document.getElementById('active-games');
    if (data && data.length > 0) {
      el.innerHTML = '<div class="label mt">进行中的游戏</div>' + data.map(function(g) {
        return '<div class="card"><strong>' + g.id + '</strong> — ' + g.playerCount + ' 人 · R' + g.round + ' · ' + g.phase + '</div>';
      }).join('');
    }
  }).catch(function() {});
}
loadActiveGames();
</script>
</body>
</html>`;
}
