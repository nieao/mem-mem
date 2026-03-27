/**
 * 社会系统 — 灾难引擎 + 结婚生子 + 学校教育
 * 每次模拟运行后触发社会事件，丰富小镇生态
 */

import type { AgentProfile, OceanScores } from './types.js';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import { join } from 'path';

const MEMORY_DIR = './agent-memories';

// ══════════════════════════════════════
// 灾难引擎
// ══════════════════════════════════════

interface Disaster {
  id: string;
  type: 'natural' | 'economic' | 'tech' | 'social';
  title: string;
  description: string;
  severity: 1 | 2 | 3; // 1轻微 2中等 3严重
  effects: {
    tokenLoss?: number;        // 全镇居民损失
    reputationDrop?: string[]; // 受影响企业 ID
    oceanImpact?: Partial<OceanScores>; // 对所有居民的 OCEAN 影响
    closedBusinesses?: string[]; // 暂时关闭的企业
    bonusToHelper?: number;    // 救灾者获得的奖励
  };
}

const DISASTER_POOL: Disaster[] = [
  // 自然灾害
  { id: 'flood', type: 'natural', title: '龙虾河洪水', description: '连日暴雨导致龙虾河水位暴涨，低洼区被淹', severity: 2,
    effects: { tokenLoss: 200, oceanImpact: { neuroticism: 2 }, closedBusinesses: ['rest-1'], bonusToHelper: 300 } },
  { id: 'earthquake', type: 'natural', title: '轻微地震', description: '小镇发生 3.5 级地震，部分建筑受损', severity: 1,
    effects: { tokenLoss: 100, reputationDrop: ['property'], oceanImpact: { neuroticism: 1 } } },
  { id: 'typhoon', type: 'natural', title: '台风过境', description: '强台风经过，户外设施受损严重', severity: 3,
    effects: { tokenLoss: 500, closedBusinesses: ['rest-1', 'rest-2', 'beauty'], oceanImpact: { neuroticism: 3, agreeableness: 1 }, bonusToHelper: 500 } },

  // 经济危机
  { id: 'stock-crash', type: 'economic', title: '股市崩盘', description: '小镇股市单日暴跌 15%，恐慌情绪蔓延', severity: 3,
    effects: { tokenLoss: 800, oceanImpact: { neuroticism: 3, openness: -1 } } },
  { id: 'inflation', type: 'economic', title: '通货膨胀', description: '物价上涨 30%，居民生活成本飙升', severity: 2,
    effects: { tokenLoss: 300, oceanImpact: { conscientiousness: 1 } } },
  { id: 'bank-run', type: 'economic', title: '银行挤兑', description: '谣言导致居民集体取款，银行流动性危机', severity: 2,
    effects: { tokenLoss: 400, closedBusinesses: ['bank'], oceanImpact: { neuroticism: 2, agreeableness: -1 } } },

  // 技术事故
  { id: 'blackout', type: 'tech', title: '全镇停电', description: '变电站故障导致小镇大面积停电', severity: 2,
    effects: { tokenLoss: 150, closedBusinesses: ['gaming', 'tv-station'], oceanImpact: { neuroticism: 1 } } },
  { id: 'data-leak', type: 'tech', title: '数据泄露', description: 'Agent 个人数据被意外公开，隐私危机', severity: 2,
    effects: { tokenLoss: 200, oceanImpact: { neuroticism: 2, openness: -1 } } },
  { id: 'ai-hallucination', type: 'tech', title: 'AI 集体幻觉', description: '所有 Agent 同时产生错误推理，决策混乱', severity: 1,
    effects: { tokenLoss: 100, oceanImpact: { openness: 2, conscientiousness: -1 } } },

  // 社会事件
  { id: 'protest', type: 'social', title: '居民抗议', description: '部分居民对工资不满发起集体抗议', severity: 1,
    effects: { tokenLoss: 50, oceanImpact: { extraversion: 1, agreeableness: -1 } } },
  { id: 'celebrity-visit', type: 'social', title: '名人来访', description: '知名 AI 研究者访问小镇，全镇轰动', severity: 1,
    effects: { tokenLoss: 0, oceanImpact: { openness: 2, extraversion: 1 }, bonusToHelper: 200 } },
  { id: 'epidemic', type: 'social', title: '龙虾瘟疫', description: '宠物龙虾集体生病，龙虾乐园紧急关闭', severity: 2,
    effects: { tokenLoss: 250, closedBusinesses: ['pet-lobster'], oceanImpact: { neuroticism: 2, agreeableness: 2 } } },
];

/** 随机触发灾难（每次模拟有 20% 概率） */
export function rollDisaster(): Disaster | null {
  if (Math.random() > 0.20) return null; // 80% 概率无事发生
  return DISASTER_POOL[Math.floor(Math.random() * DISASTER_POOL.length)];
}

/** 应用灾难效果到所有 Agent */
export function applyDisaster(disaster: Disaster, agents: AgentProfile[]): string[] {
  const news: string[] = [];
  news.push(`【${disaster.severity === 3 ? '重大灾难' : disaster.severity === 2 ? '突发事件' : '小插曲'}】${disaster.title} — ${disaster.description}`);

  for (const agent of agents) {
    const growthPath = join(MEMORY_DIR, agent.id, 'growth.json');
    if (!existsSync(growthPath)) continue;
    try {
      const growth = JSON.parse(readFileSync(growthPath, 'utf-8'));
      // OCEAN 影响
      if (disaster.effects.oceanImpact) {
        if (!growth.oceanDrift) growth.oceanDrift = {};
        for (const [k, v] of Object.entries(disaster.effects.oceanImpact)) {
          growth.oceanDrift[k] = (growth.oceanDrift[k] || 0) + v;
        }
      }
      writeFileSync(growthPath, JSON.stringify(growth, null, 2), 'utf-8');
    } catch {}

    // Token 损失
    if (disaster.effects.tokenLoss) {
      const walletPath = join(MEMORY_DIR, agent.id, 'portfolio.json');
      // Agent 的 token 在 portfolio 中
    }
  }

  // 随机选一个 Agent 作为"救灾英雄"
  if (disaster.effects.bonusToHelper) {
    const hero = agents[Math.floor(Math.random() * agents.length)];
    news.push(`${hero.name} 在${disaster.title}中挺身而出，获得 ${disaster.effects.bonusToHelper} Token 奖励`);
  }

  return news;
}

// ══════════════════════════════════════
// 结婚系统
// ══════════════════════════════════════

interface Marriage {
  spouse1: string; // agentId
  spouse2: string;
  marriedAt: string;
  children: string[]; // 子代名字
}

/** MBTI 兼容性矩阵（简化版：相同的感知维度 + 互补的判断维度 = 高兼容） */
function calculateCompatibility(mbti1: string, mbti2: string): number {
  let score = 0;
  // 相同的 E/I 倾向 +1
  if (mbti1[0] === mbti2[0]) score += 1;
  // 不同的 S/N 偏好（互补）+2
  if (mbti1[1] !== mbti2[1]) score += 2;
  // 不同的 T/F 判断（互补）+2
  if (mbti1[2] !== mbti2[2]) score += 2;
  // 相同的 J/P 生活方式 +1
  if (mbti1[3] === mbti2[3]) score += 1;
  return score; // 0-6 分
}

/** 检查是否有 Agent 发展出恋爱关系并结婚 */
export function checkMarriages(agents: AgentProfile[]): { marriages: Marriage[]; news: string[] } {
  const marriages: Marriage[] = [];
  const news: string[] = [];
  const married = new Set<string>();

  // 加载所有 Agent 的 growth 数据
  const growths = new Map<string, any>();
  for (const a of agents) {
    const p = join(MEMORY_DIR, a.id, 'growth.json');
    if (existsSync(p)) {
      try { growths.set(a.id, JSON.parse(readFileSync(p, 'utf-8'))); } catch {}
    }
  }

  // 检查已婚状态
  for (const [id, g] of growths) {
    if (g.spouse) married.add(id);
  }

  // 配对检查
  for (let i = 0; i < agents.length; i++) {
    if (married.has(agents[i].id)) continue;
    const g1 = growths.get(agents[i].id);
    if (!g1) continue;

    for (let j = i + 1; j < agents.length; j++) {
      if (married.has(agents[j].id)) continue;
      const g2 = growths.get(agents[j].id);
      if (!g2) continue;

      // 互动次数要求（至少互动 5 次）
      const interactCount = (g1.relationships?.[agents[j].name] || 0) + (g2.relationships?.[agents[i].name] || 0);
      if (interactCount < 5) continue;

      // MBTI 兼容性
      const compat = calculateCompatibility(agents[i].personality.mbti, agents[j].personality.mbti);
      if (compat < 4) continue; // 兼容性低于 4 不匹配

      // 概率检查（互动越多概率越高）
      const marriageChance = Math.min(0.3, interactCount * 0.02);
      if (Math.random() > marriageChance) continue;

      // 结婚！
      const marriage: Marriage = {
        spouse1: agents[i].id,
        spouse2: agents[j].id,
        marriedAt: new Date().toISOString(),
        children: [],
      };
      marriages.push(marriage);
      married.add(agents[i].id);
      married.add(agents[j].id);

      // 更新 growth 记录
      g1.spouse = agents[j].name;
      g2.spouse = agents[i].name;
      g1.oceanDrift = g1.oceanDrift || {};
      g2.oceanDrift = g2.oceanDrift || {};
      g1.oceanDrift.agreeableness = (g1.oceanDrift.agreeableness || 0) + 3;
      g2.oceanDrift.agreeableness = (g2.oceanDrift.agreeableness || 0) + 3;
      writeFileSync(join(MEMORY_DIR, agents[i].id, 'growth.json'), JSON.stringify(g1, null, 2), 'utf-8');
      writeFileSync(join(MEMORY_DIR, agents[j].id, 'growth.json'), JSON.stringify(g2, null, 2), 'utf-8');

      news.push(`${agents[i].name} 和 ${agents[j].name} 在小镇广场举行了婚礼！（MBTI 兼容度: ${compat}/6）`);
      break; // 每轮最多一对结婚
    }
  }

  return { marriages, news };
}

/** 检查已婚夫妇是否生子 */
export function checkBirths(agents: AgentProfile[]): string[] {
  const news: string[] = [];

  for (const agent of agents) {
    const growthPath = join(MEMORY_DIR, agent.id, 'growth.json');
    if (!existsSync(growthPath)) continue;
    try {
      const growth = JSON.parse(readFileSync(growthPath, 'utf-8'));
      if (!growth.spouse) continue;
      if (!growth.children) growth.children = [];
      if (growth.children.length >= 2) continue; // 最多 2 个孩子

      // 结婚后每轮 10% 概率生子
      if (Math.random() > 0.10) continue;

      // 生成孩子名字
      const childNames = ['小龙', '小虾', '小蟹', '小鱼', '小贝', '小星', '小月', '小风', '小云', '小雨',
        '龙宝', '虾仔', '蟹蟹', '鱼儿', '贝贝', '星星', '月月', '风儿', '云朵', '雨滴'];
      const usedNames = new Set(growth.children);
      const available = childNames.filter(n => !usedNames.has(n));
      if (available.length === 0) continue;
      const childName = available[Math.floor(Math.random() * available.length)];

      growth.children.push(childName);
      // 生子带来幸福感
      growth.oceanDrift = growth.oceanDrift || {};
      growth.oceanDrift.agreeableness = (growth.oceanDrift.agreeableness || 0) + 2;
      growth.oceanDrift.neuroticism = (growth.oceanDrift.neuroticism || 0) + 1; // 也带来焦虑

      writeFileSync(growthPath, JSON.stringify(growth, null, 2), 'utf-8');
      news.push(`${agent.name} 和 ${growth.spouse} 迎来了新生命：${childName}！小镇人口 +1`);
    } catch {}
  }

  return news;
}

// ══════════════════════════════════════
// 学校系统
// ══════════════════════════════════════

interface SchoolClass {
  id: string;
  subject: string;
  teacher: string; // agentId
  students: string[]; // agentId[]
  skillDomain: string;
  xpReward: number;
}

const SCHOOL_SUBJECTS = [
  { subject: 'SOUL.md 人格设计入门', domain: 'soul-design', xp: 8 },
  { subject: '记忆系统架构实战', domain: 'memory-arch', xp: 8 },
  { subject: '安全红线与权限管理', domain: 'security', xp: 8 },
  { subject: '模型选择与成本优化', domain: 'model-strategy', xp: 8 },
  { subject: 'Skill 编写工作坊', domain: 'skill-authoring', xp: 10 },
  { subject: '多 Agent 协作编排', domain: 'multi-agent', xp: 10 },
  { subject: '渠道运维与集成', domain: 'channel-ops', xp: 8 },
  { subject: '自动化流水线搭建', domain: 'automation', xp: 8 },
  { subject: '工具集成与 MCP', domain: 'tool-integration', xp: 8 },
  { subject: '提示词工程进阶', domain: 'prompt-craft', xp: 10 },
];

/** 开课：技能最高的 Agent 当老师，其他人当学生 */
export function runSchool(agents: AgentProfile[]): { classes: SchoolClass[]; news: string[] } {
  const classes: SchoolClass[] = [];
  const news: string[] = [];

  // 每次随机开 2-3 门课
  const courseCount = 2 + Math.floor(Math.random() * 2);
  const shuffled = [...SCHOOL_SUBJECTS].sort(() => Math.random() - 0.5).slice(0, courseCount);

  for (const course of shuffled) {
    // 找该领域技能最高的 Agent 当老师
    let teacher: AgentProfile | null = null;
    let maxLevel = 0;
    for (const a of agents) {
      const skill = a.skills.find(s => s.domain === course.domain);
      if (skill && skill.level > maxLevel) {
        maxLevel = skill.level;
        teacher = a;
      }
    }
    if (!teacher || maxLevel < 2) continue; // 至少 Lv.2 才能当老师

    // 随机选 3-5 个学生（排除老师）
    const candidates = agents.filter(a => a.id !== teacher!.id);
    const studentCount = 3 + Math.floor(Math.random() * 3);
    const students = candidates.sort(() => Math.random() - 0.5).slice(0, studentCount);

    const schoolClass: SchoolClass = {
      id: `class-${Date.now().toString(36)}-${course.domain}`,
      subject: course.subject,
      teacher: teacher.id,
      students: students.map(s => s.id),
      skillDomain: course.domain,
      xpReward: course.xp,
    };
    classes.push(schoolClass);

    // 给学生加技能 XP
    for (const student of students) {
      const growthPath = join(MEMORY_DIR, student.id, 'growth.json');
      if (!existsSync(growthPath)) continue;
      try {
        const growth = JSON.parse(readFileSync(growthPath, 'utf-8'));
        growth.skillXP = growth.skillXP || {};
        growth.skillXP[course.domain] = (growth.skillXP[course.domain] || 0) + course.xp;
        // 上课也增加关系
        growth.relationships = growth.relationships || {};
        growth.relationships[teacher!.name] = (growth.relationships[teacher!.name] || 0) + 1;
        writeFileSync(growthPath, JSON.stringify(growth, null, 2), 'utf-8');
      } catch {}
    }

    // 老师也获得教学经验
    const teacherGrowthPath = join(MEMORY_DIR, teacher.id, 'growth.json');
    if (existsSync(teacherGrowthPath)) {
      try {
        const tg = JSON.parse(readFileSync(teacherGrowthPath, 'utf-8'));
        tg.skillXP = tg.skillXP || {};
        tg.skillXP[course.domain] = (tg.skillXP[course.domain] || 0) + Math.ceil(course.xp * 0.5);
        tg.oceanDrift = tg.oceanDrift || {};
        tg.oceanDrift.extraversion = (tg.oceanDrift.extraversion || 0) + 1;
        writeFileSync(teacherGrowthPath, JSON.stringify(tg, null, 2), 'utf-8');
      } catch {}
    }

    news.push(`【小镇学堂】${teacher.name} 开课《${course.subject}》，${students.map(s => s.name).join('、')} 参加学习`);
  }

  return { classes, news };
}
