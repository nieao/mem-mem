/**
 * 小镇经济生态系统
 * 12 家企业 + 工作分配 + 薪酬 + 居民需求 + 随机事件 + 排行榜 + 小镇日报
 */

import type { AgentProfile, VirtualSkill, SkillDomain } from './types.js';
import { writeFileSync, readFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';

// ══════════════════════════════════════
// 企业定义
// ══════════════════════════════════════

export interface Business {
  id: string;
  name: string;
  type: BusinessType;
  icon: string;          // emoji 图标
  description: string;
  requiredSkills: SkillDomain[];  // 适合什么技能的人
  capacity: number;       // 最多雇几人
  baseSalary: number;     // 基础日薪（Token）
  servicePrice: number;   // 服务单价
  employees: string[];    // agentId[]
  owner?: string;         // 店主 agentId
  dailyRevenue: number;   // 今日营业额
  dailyCustomers: number; // 今日顾客数
  reputation: number;     // 口碑 0-100
}

export type BusinessType =
  | 'restaurant' | 'beauty' | 'entertainment'
  | 'repair' | 'property' | 'energy'
  | 'pet-lobster' | 'tv-station' | 'radio-station';

/** 12 家小镇企业 */
export const BUSINESSES: Business[] = [
  // ── 餐饮 ×2 ──
  {
    id: 'rest-1', name: '龙虾食堂', type: 'restaurant', icon: '🦞',
    description: '小镇最受欢迎的餐厅，招牌菜是麻辣龙虾。也给宠物龙虾提供特制饲料。',
    requiredSkills: ['channel-ops', 'automation'], capacity: 3, baseSalary: 80,
    servicePrice: 30, employees: [], dailyRevenue: 0, dailyCustomers: 0, reputation: 75,
  },
  {
    id: 'rest-2', name: '数据咖啡', type: 'restaurant', icon: '☕',
    description: '程序员们的聚会地，墙上挂着实时数据大屏。提供咖啡和简餐。',
    requiredSkills: ['prompt-craft', 'tool-integration'], capacity: 2, baseSalary: 70,
    servicePrice: 20, employees: [], dailyRevenue: 0, dailyCustomers: 0, reputation: 70,
  },
  // ── 美容理发 ──
  {
    id: 'beauty-1', name: '焕新造型', type: 'beauty', icon: '💇',
    description: '不只给人理发，也给龙虾抛光外壳。老板审美极佳。',
    requiredSkills: ['soul-design', 'prompt-craft'], capacity: 2, baseSalary: 75,
    servicePrice: 40, employees: [], dailyRevenue: 0, dailyCustomers: 0, reputation: 72,
  },
  // ── 娱乐 ×3 ──
  {
    id: 'ent-1', name: 'Agent 电竞馆', type: 'entertainment', icon: '🎮',
    description: '多人在线对战、AI 棋牌、虚拟现实体验。龙虾可以操控迷你赛车。',
    requiredSkills: ['multi-agent', 'skill-authoring'], capacity: 2, baseSalary: 65,
    servicePrice: 25, employees: [], dailyRevenue: 0, dailyCustomers: 0, reputation: 80,
  },
  {
    id: 'ent-2', name: '思辨茶馆', type: 'entertainment', icon: '🍵',
    description: '小镇的灵魂场所。每天下午有主题辩论赛，赢家有 Token 奖励。',
    requiredSkills: ['prompt-craft', 'soul-design'], capacity: 2, baseSalary: 60,
    servicePrice: 15, employees: [], dailyRevenue: 0, dailyCustomers: 0, reputation: 85,
  },
  {
    id: 'ent-3', name: '龙虾 KTV', type: 'entertainment', icon: '🎤',
    description: '唱歌放松的好地方。据说龙虾的叫声和某些歌曲很搭。',
    requiredSkills: ['channel-ops', 'soul-design'], capacity: 2, baseSalary: 55,
    servicePrice: 20, employees: [], dailyRevenue: 0, dailyCustomers: 0, reputation: 68,
  },
  // ── 维修公司 ──
  {
    id: 'repair-1', name: '万能修理铺', type: 'repair', icon: '🔧',
    description: '修电脑、修 Bug、修龙虾机械钳。没有修不了的东西。',
    requiredSkills: ['tool-integration', 'automation'], capacity: 2, baseSalary: 85,
    servicePrice: 50, employees: [], dailyRevenue: 0, dailyCustomers: 0, reputation: 78,
  },
  // ── 物业管理 ──
  {
    id: 'property-1', name: '小镇物业', type: 'property', icon: '🏠',
    description: '管理 20 栋龙虾屋的维护、清洁、安保。小镇运转的幕后英雄。',
    requiredSkills: ['security', 'automation'], capacity: 2, baseSalary: 90,
    servicePrice: 35, employees: [], dailyRevenue: 0, dailyCustomers: 0, reputation: 73,
  },
  // ── 能源公司 ──
  {
    id: 'energy-1', name: '绿能科技', type: 'energy', icon: '⚡',
    description: '负责小镇的电力供应和网络基础设施。正在研发龙虾动力发电。',
    requiredSkills: ['model-strategy', 'automation'], capacity: 2, baseSalary: 95,
    servicePrice: 40, employees: [], dailyRevenue: 0, dailyCustomers: 0, reputation: 76,
  },
  // ── 宠物龙虾服务 ──
  {
    id: 'pet-1', name: '龙虾乐园', type: 'pet-lobster', icon: '🦞',
    description: '宠物龙虾的天堂：喂养、训练、医疗、选美大赛。每只龙虾都值得最好的。',
    requiredSkills: ['memory-arch', 'soul-design'], capacity: 2, baseSalary: 70,
    servicePrice: 35, employees: [], dailyRevenue: 0, dailyCustomers: 0, reputation: 90,
  },
  // ── 电视台 ──
  {
    id: 'tv-1', name: '小镇电视台', type: 'tv-station', icon: '📺',
    description: '每日播报小镇新闻、股市行情、天气预报。也制作 Agent 纪录片。',
    requiredSkills: ['prompt-craft', 'channel-ops', 'skill-authoring'], capacity: 3, baseSalary: 100,
    servicePrice: 0, employees: [], dailyRevenue: 0, dailyCustomers: 0, reputation: 82,
  },
  // ── 广播台 ──
  {
    id: 'radio-1', name: '龙虾之声 FM', type: 'radio-station', icon: '📻',
    description: '24 小时滚动播出：新闻快报、股市分析、音乐电台、龙虾养殖小课堂。',
    requiredSkills: ['prompt-craft', 'channel-ops', 'model-strategy'], capacity: 2, baseSalary: 90,
    servicePrice: 0, employees: [], dailyRevenue: 0, dailyCustomers: 0, reputation: 80,
  },
];

// ══════════════════════════════════════
// 居民需求系统
// ══════════════════════════════════════

export interface AgentNeeds {
  hunger: number;       // 0-100，越高越饿
  entertainment: number; // 0-100，越高越无聊
  grooming: number;     // 0-100，越高越邋遢
  repair: number;       // 0-100，越高越多东西要修
  energy: number;       // 0-100，活力值（低了要休息）
}

export interface AgentEconomy {
  agentId: string;
  job?: { businessId: string; role: 'owner' | 'employee'; salary: number };
  needs: AgentNeeds;
  dailySpending: number;
  dailyIncome: number;
  consumptionLog: { business: string; amount: number; service: string }[];
}

// ══════════════════════════════════════
// 随机事件系统
// ══════════════════════════════════════

export interface TownEvent {
  id: string;
  type: 'economy' | 'social' | 'disaster' | 'festival' | 'discovery';
  title: string;
  description: string;
  effects: {
    tokenBonus?: number;           // 全镇 Token 奖励
    reputationChange?: Record<string, number>;  // businessId → 变化
    moodShift?: number;            // 全镇情绪变化
    stockImpact?: { sector: string; pctChange: number }[];
  };
  timestamp: string;
}

const EVENT_POOL: Omit<TownEvent, 'id' | 'timestamp'>[] = [
  { type: 'festival', title: '🦞 龙虾节', description: '一年一度的龙虾节！全镇龙虾选美大赛，龙虾乐园客流量翻倍。',
    effects: { reputationChange: { 'pet-1': 10 }, moodShift: 15, tokenBonus: 50 } },
  { type: 'economy', title: '📈 AI 板块暴涨', description: '人工智能板块涨停！投资 AI 的居民今日收益翻倍。',
    effects: { stockImpact: [{ sector: 'AI', pctChange: 8.5 }], moodShift: 10 } },
  { type: 'economy', title: '📉 市场震荡', description: '受国际局势影响，多个板块下跌。小镇居民情绪低落。',
    effects: { moodShift: -10, stockImpact: [{ sector: 'FIN', pctChange: -4.2 }, { sector: 'RE', pctChange: -3.8 }] } },
  { type: 'social', title: '🏆 最佳 Agent 评选', description: '月度最佳 Agent 评选结果公布！获奖者获得 500 Token 奖励。',
    effects: { tokenBonus: 500 } },
  { type: 'disaster', title: '⚡ 小镇停电', description: '绿能科技的发电机故障，小镇停电 2 小时。万能修理铺紧急出动。',
    effects: { reputationChange: { 'energy-1': -5, 'repair-1': 8 }, moodShift: -8 } },
  { type: 'discovery', title: '🔬 新技能发现', description: '研究员发现了一种新的 Agent 训练方法，全镇 Agent 经验获取 +20%。',
    effects: { moodShift: 12 } },
  { type: 'social', title: '☕ 数据咖啡辩论之夜', description: '数据咖啡举办"AI 是否应该有情感"主题辩论，吸引大批居民参加。',
    effects: { reputationChange: { 'rest-2': 6, 'ent-2': 4 }, moodShift: 8 } },
  { type: 'festival', title: '🎵 音乐节', description: '龙虾 KTV 举办小镇音乐节，龙虾之声 FM 全程直播。',
    effects: { reputationChange: { 'ent-3': 12, 'radio-1': 8 }, moodShift: 15, tokenBonus: 30 } },
  { type: 'economy', title: '💰 物业费调整', description: '小镇物业宣布下调物业费 10%，居民拍手叫好。',
    effects: { reputationChange: { 'property-1': 10 }, moodShift: 5 } },
  { type: 'disaster', title: '🦞 龙虾感冒潮', description: '近期气温骤降，多只宠物龙虾出现感冒症状。龙虾乐园忙疯了。',
    effects: { reputationChange: { 'pet-1': 5 }, moodShift: -5 } },
];

// ══════════════════════════════════════
// 核心引擎
// ══════════════════════════════════════

export class TownEconomy {
  businesses: Business[];
  agentEconomies: Map<string, AgentEconomy>;
  events: TownEvent[];
  dailyNews: string[];
  leaderboard: { wealth: { name: string; tokens: number }[]; popularity: { name: string; score: number }[]; productivity: { name: string; tasks: number }[] };

  constructor() {
    this.businesses = JSON.parse(JSON.stringify(BUSINESSES)); // 深拷贝
    this.agentEconomies = new Map();
    this.events = [];
    this.dailyNews = [];
    this.leaderboard = { wealth: [], popularity: [], productivity: [] };
  }

  /** 分配工作——根据技能匹配度 */
  assignJobs(agents: AgentProfile[], portfolios: Map<string, any>): void {
    // 计算每个 Agent 对每个企业的匹配度
    const assignments: { agentId: string; businessId: string; score: number }[] = [];

    for (const agent of agents) {
      const agentSkills = new Set(agent.skills.map(s => s.domain));
      for (const biz of this.businesses) {
        if (biz.employees.length >= biz.capacity) continue;
        let score = 0;
        for (const reqSkill of biz.requiredSkills) {
          if (agentSkills.has(reqSkill)) score += 3;
        }
        // 高外向性更适合服务业
        if (['restaurant', 'beauty', 'entertainment', 'pet-lobster'].includes(biz.type)) {
          score += agent.personality.ocean.extraversion / 50;
        }
        // 高尽责性更适合管理岗
        if (['property', 'energy', 'repair'].includes(biz.type)) {
          score += agent.personality.ocean.conscientiousness / 50;
        }
        // 高开放性更适合媒体
        if (['tv-station', 'radio-station'].includes(biz.type)) {
          score += agent.personality.ocean.openness / 50;
        }
        assignments.push({ agentId: agent.id, businessId: biz.id, score });
      }
    }

    // 贪心分配：按匹配度排序，依次分配
    assignments.sort((a, b) => b.score - a.score);
    const assigned = new Set<string>();

    for (const a of assignments) {
      if (assigned.has(a.agentId)) continue;
      const biz = this.businesses.find(b => b.id === a.businessId);
      if (!biz || biz.employees.length >= biz.capacity) continue;

      // 第一个员工是老板
      const role: 'owner' | 'employee' = biz.employees.length === 0 ? 'owner' : 'employee';
      const salary = role === 'owner' ? Math.round(biz.baseSalary * 1.5) : biz.baseSalary;

      biz.employees.push(a.agentId);
      if (role === 'owner') biz.owner = a.agentId;
      assigned.add(a.agentId);

      // 初始化经济状态
      const portfolio = portfolios.get(a.agentId);
      this.agentEconomies.set(a.agentId, {
        agentId: a.agentId,
        job: { businessId: a.businessId, role, salary },
        needs: {
          hunger: 20 + Math.floor(Math.random() * 30),
          entertainment: 15 + Math.floor(Math.random() * 25),
          grooming: 10 + Math.floor(Math.random() * 20),
          repair: 5 + Math.floor(Math.random() * 15),
          energy: 60 + Math.floor(Math.random() * 30),
        },
        dailySpending: 0,
        dailyIncome: salary,
        consumptionLog: [],
      });
    }

    // 没分配到工作的 Agent 也需要经济状态
    for (const agent of agents) {
      if (!this.agentEconomies.has(agent.id)) {
        this.agentEconomies.set(agent.id, {
          agentId: agent.id,
          needs: { hunger: 30, entertainment: 30, grooming: 20, repair: 10, energy: 70 },
          dailySpending: 0, dailyIncome: 0, consumptionLog: [],
        });
      }
    }
  }

  /** 模拟一天的经济活动 */
  simulateDay(agents: AgentProfile[]): void {
    // 1. 发工资
    for (const [id, eco] of this.agentEconomies) {
      if (eco.job) eco.dailyIncome = eco.job.salary;
    }

    // 2. 需求增长
    for (const [id, eco] of this.agentEconomies) {
      eco.needs.hunger = Math.min(100, eco.needs.hunger + 15 + Math.floor(Math.random() * 10));
      eco.needs.entertainment = Math.min(100, eco.needs.entertainment + 10 + Math.floor(Math.random() * 8));
      eco.needs.grooming = Math.min(100, eco.needs.grooming + 5 + Math.floor(Math.random() * 5));
      eco.needs.repair = Math.min(100, eco.needs.repair + 3 + Math.floor(Math.random() * 5));
      eco.needs.energy = Math.max(0, eco.needs.energy - 10 - Math.floor(Math.random() * 10));
    }

    // 3. 消费行为（满足需求）
    for (const [id, eco] of this.agentEconomies) {
      // 饿了去餐厅
      if (eco.needs.hunger > 50) {
        const restaurant = this.pickBusiness(['restaurant']);
        if (restaurant) {
          eco.consumptionLog.push({ business: restaurant.name, amount: restaurant.servicePrice, service: '用餐' });
          eco.dailySpending += restaurant.servicePrice;
          restaurant.dailyRevenue += restaurant.servicePrice;
          restaurant.dailyCustomers++;
          eco.needs.hunger = Math.max(0, eco.needs.hunger - 40);
          this.dailyNews.push(`${this.getAgentName(id, agents)} 去 ${restaurant.name} 吃了一顿`);
        }
      }
      // 无聊去娱乐
      if (eco.needs.entertainment > 60) {
        const ent = this.pickBusiness(['entertainment']);
        if (ent) {
          eco.consumptionLog.push({ business: ent.name, amount: ent.servicePrice, service: '娱乐' });
          eco.dailySpending += ent.servicePrice;
          ent.dailyRevenue += ent.servicePrice;
          ent.dailyCustomers++;
          eco.needs.entertainment = Math.max(0, eco.needs.entertainment - 50);
        }
      }
      // 邋遢去理发
      if (eco.needs.grooming > 70) {
        const beauty = this.pickBusiness(['beauty']);
        if (beauty) {
          eco.consumptionLog.push({ business: beauty.name, amount: beauty.servicePrice, service: '造型' });
          eco.dailySpending += beauty.servicePrice;
          beauty.dailyRevenue += beauty.servicePrice;
          beauty.dailyCustomers++;
          eco.needs.grooming = Math.max(0, eco.needs.grooming - 60);
        }
      }
      // 东西坏了去修理
      if (eco.needs.repair > 60) {
        const repair = this.pickBusiness(['repair']);
        if (repair) {
          eco.consumptionLog.push({ business: repair.name, amount: repair.servicePrice, service: '维修' });
          eco.dailySpending += repair.servicePrice;
          repair.dailyRevenue += repair.servicePrice;
          repair.dailyCustomers++;
          eco.needs.repair = Math.max(0, eco.needs.repair - 50);
        }
      }
    }

    // 4. 随机事件（每天 30% 概率触发）
    if (Math.random() < 0.3) {
      const template = EVENT_POOL[Math.floor(Math.random() * EVENT_POOL.length)];
      const event: TownEvent = {
        ...template,
        id: `evt-${Date.now()}`,
        timestamp: new Date().toISOString(),
      };
      this.events.push(event);
      this.dailyNews.push(`【${event.type === 'festival' ? '庆典' : event.type === 'disaster' ? '突发' : '快讯'}】${event.title} — ${event.description}`);

      // 应用事件效果
      if (event.effects.reputationChange) {
        for (const [bizId, change] of Object.entries(event.effects.reputationChange)) {
          const biz = this.businesses.find(b => b.id === bizId);
          if (biz) biz.reputation = Math.max(0, Math.min(100, biz.reputation + change));
        }
      }
    }

    // 5. 生成小镇日报新闻
    this.generateDailyNews(agents);
  }

  /** 随机选一家指定类型的营业企业 */
  private pickBusiness(types: BusinessType[]): Business | null {
    const candidates = this.businesses.filter(b => types.includes(b.type) && b.employees.length > 0);
    if (candidates.length === 0) return null;
    // 按口碑加权随机
    const totalRep = candidates.reduce((s, b) => s + b.reputation, 0);
    let r = Math.random() * totalRep;
    for (const b of candidates) {
      r -= b.reputation;
      if (r <= 0) return b;
    }
    return candidates[0];
  }

  private getAgentName(id: string, agents: AgentProfile[]): string {
    return agents.find(a => a.id === id)?.name || id;
  }

  /** 生成小镇日报 */
  private generateDailyNews(agents: AgentProfile[]): void {
    const today = new Date().toISOString().slice(0, 10);

    // 营业额排行
    const topBiz = [...this.businesses].sort((a, b) => b.dailyRevenue - a.dailyRevenue)[0];
    if (topBiz && topBiz.dailyRevenue > 0) {
      this.dailyNews.push(`📊 今日营业冠军：${topBiz.name}，营业额 ${topBiz.dailyRevenue} Token`);
    }

    // 最忙的店
    const busiest = [...this.businesses].sort((a, b) => b.dailyCustomers - a.dailyCustomers)[0];
    if (busiest && busiest.dailyCustomers > 0) {
      this.dailyNews.push(`🔥 最受欢迎：${busiest.name}，接待 ${busiest.dailyCustomers} 位顾客`);
    }

    // 随机一条软新闻
    const softNews = [
      '龙虾食堂推出新菜品"蒜蓉龙虾披萨"，评价褒贬不一',
      '思辨茶馆今日辩题：Agent 应该有假期吗？投票结果 14:6',
      'Agent 电竞馆举办 1v1 锦标赛，冠军奖金 200 Token',
      '焕新造型推出"龙虾甲壳保养套餐"，预约排到下周',
      '绿能科技宣布龙虾动力发电研究取得突破性进展',
      '小镇物业提醒：请勿在公共区域放养宠物龙虾',
      '龙虾乐园举办"最萌龙虾"投票，目前领先的是一只红色龙虾',
    ];
    this.dailyNews.push(softNews[Math.floor(Math.random() * softNews.length)]);
  }

  /** 计算排行榜 */
  computeLeaderboard(agents: AgentProfile[], portfolios: Map<string, any>, growthDir: string): void {
    // 财富榜
    this.leaderboard.wealth = agents.map(a => {
      const portfolio = portfolios.get(a.id);
      const eco = this.agentEconomies.get(a.id);
      const tokens = (portfolio?.tokens || 10000) + (eco?.dailyIncome || 0) - (eco?.dailySpending || 0);
      return { name: a.name, tokens };
    }).sort((a, b) => b.tokens - a.tokens).slice(0, 10);

    // 人气榜（基于社交互动）
    this.leaderboard.popularity = agents.map(a => {
      const eco = this.agentEconomies.get(a.id);
      const job = eco?.job;
      const biz = job ? this.businesses.find(b => b.id === job.businessId) : null;
      const score = (biz?.reputation || 0) + (a.personality.ocean.extraversion / 2) + (a.personality.ocean.agreeableness / 3);
      return { name: a.name, score: Math.round(score) };
    }).sort((a, b) => b.score - a.score).slice(0, 10);

    // 生产力榜
    this.leaderboard.productivity = agents.map(a => {
      try {
        const growthPath = join(growthDir, a.id, 'growth.json');
        if (existsSync(growthPath)) {
          const g = JSON.parse(readFileSync(growthPath, 'utf-8'));
          return { name: a.name, tasks: g.discussionCount || 0 };
        }
      } catch {}
      return { name: a.name, tasks: 0 };
    }).sort((a, b) => b.tasks - a.tasks).slice(0, 10);
  }

  /** 序列化为 JSON（供前端 & 报告使用） */
  serialize(): string {
    return JSON.stringify({
      businesses: this.businesses.map(b => ({
        id: b.id, name: b.name, type: b.type, icon: b.icon,
        description: b.description,
        employees: b.employees, owner: b.owner,
        dailyRevenue: b.dailyRevenue, dailyCustomers: b.dailyCustomers,
        reputation: b.reputation, baseSalary: b.baseSalary,
      })),
      events: this.events.slice(-5),
      dailyNews: this.dailyNews,
      leaderboard: this.leaderboard,
      agentJobs: Object.fromEntries(
        [...this.agentEconomies.entries()].map(([id, eco]) => [id, {
          job: eco.job,
          needs: eco.needs,
          dailyIncome: eco.dailyIncome,
          dailySpending: eco.dailySpending,
        }])
      ),
    });
  }
}
