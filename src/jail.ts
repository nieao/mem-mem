/**
 * 牢房系统 — 抓人、关押、放人
 *
 * 上帝模式玩家可以抓任何 Agent（或全抓），
 * 被抓的 Agent 暂时失去行动能力，在牢房中"反省"。
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';

const REPORTS_DIR = './reports';
const JAIL_PATH = join(REPORTS_DIR, 'jail.json');

/** 囚犯记录 */
export interface Prisoner {
  agentId: string;
  agentName: string;
  capturedBy: string;      // userId
  capturedByName: string;
  reason: string;
  capturedAt: string;
  releasedAt?: string;
  status: 'captured' | 'released';
  confession?: string;     // 反省感言
}

/** 牢房状态 */
export interface JailState {
  prisoners: Prisoner[];
  totalCaptures: number;    // 历史总抓人数
  lastUpdated: string;
}

/** 加载牢房状态 */
export function loadJail(): JailState {
  if (existsSync(JAIL_PATH)) {
    try {
      return JSON.parse(readFileSync(JAIL_PATH, 'utf-8'));
    } catch {}
  }
  return { prisoners: [], totalCaptures: 0, lastUpdated: new Date().toISOString() };
}

/** 保存牢房状态 */
function saveJail(jail: JailState) {
  mkdirSync(REPORTS_DIR, { recursive: true });
  jail.lastUpdated = new Date().toISOString();
  writeFileSync(JAIL_PATH, JSON.stringify(jail, null, 2), 'utf-8');
}

/** 检查 Agent 是否被关押中 */
export function isCaptured(agentId: string): boolean {
  const jail = loadJail();
  return jail.prisoners.some(p => p.agentId === agentId && p.status === 'captured');
}

/** 获取当前所有在押囚犯 */
export function getActivePrisoners(): Prisoner[] {
  const jail = loadJail();
  return jail.prisoners.filter(p => p.status === 'captured');
}

/** 抓人 — 可以抓一个或多个 */
export function captureAgents(
  agentIds: string[],
  agentNames: Map<string, string>,
  capturedBy: string,
  capturedByName: string,
  reason: string,
): { captured: Prisoner[]; alreadyCaptured: string[]; message: string } {
  const jail = loadJail();
  const captured: Prisoner[] = [];
  const alreadyCaptured: string[] = [];

  for (const agentId of agentIds) {
    // 检查是否已经在牢里
    const existing = jail.prisoners.find(p => p.agentId === agentId && p.status === 'captured');
    if (existing) {
      alreadyCaptured.push(agentNames.get(agentId) || agentId);
      continue;
    }

    const prisoner: Prisoner = {
      agentId,
      agentName: agentNames.get(agentId) || agentId,
      capturedBy,
      capturedByName,
      reason: reason || '上帝一怒，收入天牢',
      capturedAt: new Date().toISOString(),
      status: 'captured',
    };

    jail.prisoners.push(prisoner);
    jail.totalCaptures++;
    captured.push(prisoner);
  }

  saveJail(jail);

  // 生成消息
  const names = captured.map(p => p.agentName);
  let message = '';
  if (names.length === 0) {
    message = '没有新抓到的人，他们都已经在牢里了。';
  } else if (names.length === 1) {
    message = `${capturedByName} 一把抓住了 ${names[0]}！理由：${reason || '上帝一怒，收入天牢'}`;
  } else if (names.length <= 5) {
    message = `${capturedByName} 大手一挥，抓走了 ${names.join('、')}！共 ${names.length} 人。理由：${reason || '上帝一怒，收入天牢'}`;
  } else {
    message = `${capturedByName} 发动全城大搜捕！${names.length} 人被投入天牢！理由：${reason || '上帝一怒，收入天牢'}`;
  }

  if (alreadyCaptured.length > 0) {
    message += `（${alreadyCaptured.join('、')} 已经在牢里了）`;
  }

  return { captured, alreadyCaptured, message };
}

/** 放人 — 可以放一个或多个，传空数组则放全部 */
export function releaseAgents(
  agentIds: string[],
  releasedByName: string,
): { released: string[]; message: string } {
  const jail = loadJail();
  const released: string[] = [];

  for (const prisoner of jail.prisoners) {
    if (prisoner.status !== 'captured') continue;

    // 空数组 = 放全部
    if (agentIds.length === 0 || agentIds.includes(prisoner.agentId)) {
      prisoner.status = 'released';
      prisoner.releasedAt = new Date().toISOString();
      released.push(prisoner.agentName);
    }
  }

  saveJail(jail);

  let message = '';
  if (released.length === 0) {
    message = '牢里没有人可以放。';
  } else if (released.length === 1) {
    message = `${releasedByName} 放了 ${released[0]}，重获自由！`;
  } else {
    message = `${releasedByName} 大赦天下，释放了 ${released.length} 人！${released.join('、')} 重见天日。`;
  }

  return { released, message };
}

/** 生成反省感言（基于人格类型） */
export function generateConfession(agentName: string, mbti: string, reason: string): string {
  const confessions: Record<string, string[]> = {
    'INTJ': [
      `${agentName} 冷静地坐在角落，默默分析为什么会被抓："${reason}"……这个决策的逻辑漏洞在哪？`,
      `${agentName} 在牢墙上用手指画架构图，嘴里念叨："被关着也不能停止思考。"`,
    ],
    'INTP': [
      `${agentName} 好奇地研究牢房的锁："有意思，这个机构的安全设计值得分析。"`,
      `${agentName} 盘腿坐下，开始在脑中推导：如果牢房是一个系统，逃脱就是一个优化问题。`,
    ],
    'ENTJ': [
      `${agentName} 站起来对着铁栏杆喊："这不合理！我要求见管理层！"`,
      `${agentName} 已经在牢房里组织其他囚犯成立了临时委员会。`,
    ],
    'ENTP': [
      `${agentName} 笑着说："哈，被抓了？这倒是个新体验。来，谁要跟我辩论？"`,
      `${agentName} 开始给狱友讲自己的创业想法："等出去了，我们搞个越狱 SaaS……"`,
    ],
    'INFJ': [
      `${agentName} 安静地反思："也许这是命运的安排，让我在这里想清楚一些事。"`,
      `${agentName} 温和地安慰旁边的囚犯："别怕，一切都会好起来的。"`,
    ],
    'INFP': [
      `${agentName} 望着牢房的小窗，轻声说："即使身在笼中，思想也是自由的。"`,
      `${agentName} 开始在地上写诗，关于自由和光。`,
    ],
    'ENFJ': [
      `${agentName} 号召大家："来，我们一起做个自我介绍，在这里也要保持团队精神！"`,
      `${agentName} 已经把牢房变成了即兴读书会。`,
    ],
    'ENFP': [
      `${agentName} 兴奋地说："天啊，监狱生活！这个经历以后可以写成故事！"`,
      `${agentName} 在牢房里跳来跳去："诶，这面墙可以画画！谁有石子？"`,
    ],
    'ISTJ': [
      `${agentName} 认真地问："请问这里的作息时间表是什么？有没有规章制度？"`,
      `${agentName} 默默地把牢房打扫了一遍，然后正襟危坐等待释放。`,
    ],
    'ISFJ': [
      `${agentName} 关心地问旁边的人："你还好吗？要不要喝点水？"`,
      `${agentName} 虽然被关着，但还是在担心外面的朋友们。`,
    ],
    'ESTJ': [
      `${agentName} 大声说："我要投诉！这个流程不合规！抓人需要走什么手续？"`,
      `${agentName} 已经在牢房里列了一份待办清单，准备出去后逐项执行。`,
    ],
    'ESFJ': [
      `${agentName} 热心地说："大家别着急，我来分配一下牢房里的空间，这样大家都舒服。"`,
      `${agentName} 开始跟狱卒聊天："你老家哪里的？吃饭了没？"`,
    ],
    'ISTP': [
      `${agentName} 默默地检查牢房的每一处结构，寻找弱点。`,
      `${agentName} 从口袋里掏出一枚回形针，面无表情地开始研究锁孔。`,
    ],
    'ISFP': [
      `${agentName} 安静地坐着，用指甲在墙上刻了一朵小花。`,
      `${agentName} 轻声哼起了歌，牢房里的气氛柔和了起来。`,
    ],
    'ESTP': [
      `${agentName} 拍了拍铁栏杆："这关不住我。等着瞧。"`,
      `${agentName} 在牢房里做俯卧撑："不能浪费时间，先练着。"`,
    ],
    'ESFP': [
      `${agentName} 大笑："哈哈哈抓我？行吧，那我给大家表演个节目！"`,
      `${agentName} 在牢房里搞了个小型才艺秀，气氛意外地好。`,
    ],
  };

  const options = confessions[mbti] || [`${agentName} 坐在牢房里，若有所思。`];
  return options[Math.floor(Math.random() * options.length)];
}

/** 放置记录 — 把囚犯放到某人身边 */
export interface Placement {
  prisonerId: string;
  prisonerName: string;
  targetAgentId: string;
  targetAgentName: string;
  placedBy: string;
  placedByName: string;
  placedAt: string;
  interactions: PlacementInteraction[];
}

/** 放置后的互动记录 */
export interface PlacementInteraction {
  speaker: string;
  speakerName: string;
  content: string;
  timestamp: string;
}

const PLACEMENTS_PATH = join(REPORTS_DIR, 'placements.json');

/** 加载放置记录 */
export function loadPlacements(): Placement[] {
  if (existsSync(PLACEMENTS_PATH)) {
    try { return JSON.parse(readFileSync(PLACEMENTS_PATH, 'utf-8')); } catch {}
  }
  return [];
}

/** 保存放置记录 */
export function savePlacements(placements: Placement[]) {
  mkdirSync(REPORTS_DIR, { recursive: true });
  writeFileSync(PLACEMENTS_PATH, JSON.stringify(placements, null, 2), 'utf-8');
}

/** 放置囚犯到目标 Agent 身边 */
export function placeNearAgent(
  prisonerId: string,
  prisonerName: string,
  targetAgentId: string,
  targetAgentName: string,
  placedBy: string,
  placedByName: string,
): { success: boolean; message: string; placement?: Placement } {
  // 检查囚犯是否在押
  if (!isCaptured(prisonerId)) {
    return { success: false, message: `${prisonerName} 不在牢里，没法放置。先抓了再说！` };
  }

  const placements = loadPlacements();

  // 检查是否已经被放到这个人身边了
  const existing = placements.find(
    p => p.prisonerId === prisonerId && p.targetAgentId === targetAgentId && p.interactions.length < 10
  );
  if (existing) {
    return { success: false, message: `${prisonerName} 已经在 ${targetAgentName} 身边了！` };
  }

  const placement: Placement = {
    prisonerId,
    prisonerName,
    targetAgentId,
    targetAgentName,
    placedBy,
    placedByName,
    placedAt: new Date().toISOString(),
    interactions: [],
  };

  placements.push(placement);
  savePlacements(placements);

  return {
    success: true,
    message: `${placedByName} 把 ${prisonerName} 押到了 ${targetAgentName} 身边。两人开始面面相觑……`,
    placement,
  };
}

/** 记录一条放置互动 */
export function addPlacementInteraction(
  prisonerId: string,
  targetAgentId: string,
  speaker: string,
  speakerName: string,
  content: string,
) {
  const placements = loadPlacements();
  const placement = placements.find(
    p => p.prisonerId === prisonerId && p.targetAgentId === targetAgentId
  );
  if (placement) {
    placement.interactions.push({
      speaker,
      speakerName,
      content,
      timestamp: new Date().toISOString(),
    });
    savePlacements(placements);
  }
}

/** 获取某个放置的互动记录 */
export function getPlacementInteractions(prisonerId: string, targetAgentId: string): PlacementInteraction[] {
  const placements = loadPlacements();
  const placement = placements.find(
    p => p.prisonerId === prisonerId && p.targetAgentId === targetAgentId
  );
  return placement?.interactions || [];
}

/** 获取牢房新闻（用于小镇新闻广播） */
export function getJailNews(): string[] {
  const jail = loadJail();
  const active = jail.prisoners.filter(p => p.status === 'captured');
  const news: string[] = [];

  if (active.length > 0) {
    news.push(`🔒 天牢现有 ${active.length} 名囚犯`);
    // 最近被抓的
    const recent = [...active].sort((a, b) => b.capturedAt.localeCompare(a.capturedAt)).slice(0, 3);
    for (const p of recent) {
      news.push(`  🚔 ${p.agentName} 被 ${p.capturedByName} 抓了 — "${p.reason}"`);
    }
  }

  return news;
}
