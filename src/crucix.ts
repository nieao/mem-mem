/**
 * Crucix OSINT 数据桥接层
 * 从 Crucix 系统获取实时情报，按 Agent 技能注入相关数据
 *
 * 三级降级：REST API → latest.json → mock 数据
 */

import type { SkillDomain, VirtualSkill } from './types.js';
import { readFileSync, existsSync } from 'fs';
import { join, resolve } from 'path';

// ── Crucix 数据快照类型 ──

export interface CrucixSnapshot {
  timestamp: string;
  sources: Record<string, any>;
  errors?: any[];
  fromCache?: boolean;
}

// ── 技能 → Crucix 数据源映射 ──

const SKILL_SOURCE_MAP: Record<SkillDomain, string[]> = {
  'soul-design': ['Bluesky', 'Reddit', 'GDELT'],
  'memory-arch': ['FRED', 'Treasury', 'BLS'],
  'security': ['ACLED', 'OFAC', 'OpenSanctions'],
  'model-strategy': ['YFinance', 'China', 'EIA'],
  'skill-authoring': ['Patents', 'DailyHot'],
  'multi-agent': ['OpenSky', 'Maritime', 'CelesTrak'],
  'channel-ops': ['Telegram', 'Bluesky', 'Reddit'],
  'automation': ['GSCPI', 'NOAA', 'Comtrade'],
  'tool-integration': ['Patents', 'CelesTrak'],
  'prompt-craft': ['GDELT', 'ChinaNews', 'DailyHot'],
};

// ── 数据源摘要提取器 ──

function summarizeSource(name: string, data: any): string {
  if (!data) return '';
  try {
    if (name === 'FRED' && data.indicators?.length) {
      const top = data.indicators.slice(0, 5).map((i: any) =>
        `${i.label}: ${i.value}`
      ).join('，');
      const signals = data.signals?.length ? `信号：${data.signals[0]}` : '';
      return `经济数据 — ${top}。${signals}`;
    }
    if (name === 'YFinance' && data.quotes?.length) {
      const qs = data.quotes.slice(0, 4).map((q: any) =>
        `${q.symbol} ${q.price}(${q.changePercent > 0 ? '+' : ''}${q.changePercent?.toFixed(1)}%)`
      ).join('，');
      return `市场行情 — ${qs}`;
    }
    if (name === 'ACLED' && data.totalEvents) {
      return `冲突事件 — ${data.totalEvents} 起，死亡 ${data.totalFatalities || 0}，主要地区：${Object.keys(data.byRegion || {}).slice(0, 3).join('、')}`;
    }
    if (name === 'OpenSky' && data.hotspots?.length) {
      const active = data.hotspots.filter((h: any) => h.totalAircraft > 0);
      if (active.length) {
        return `航空监控 — ${active.map((h: any) => `${h.region}: ${h.totalAircraft}架`).slice(0, 3).join('，')}`;
      }
    }
    if (name === 'GDELT' && data.allArticles?.length) {
      return `全球新闻 — ${data.totalArticles} 篇，热点：${data.allArticles.slice(0, 2).map((a: any) => a.title?.slice(0, 30)).join('；')}`;
    }
    if (name === 'China' && data.indexes?.length) {
      const idx = data.indexes[0];
      return `中国市场 — ${idx.name} ${idx.price}（${idx.changePct > 0 ? '+' : ''}${idx.changePct}%）`;
    }
    if (name === 'Telegram' && (data.urgent?.length || data.routine?.length)) {
      const count = (data.urgent?.length || 0) + (data.routine?.length || 0);
      const first = (data.urgent?.[0] || data.routine?.[0])?.text?.slice(0, 50);
      return `OSINT 情报 — ${count} 条，最新：${first || '无'}`;
    }
    if (name === 'Patents' && data.recentPatents?.length) {
      return `专利动态 — ${data.recentPatents.length} 项新专利，领域：${data.recentPatents.slice(0, 2).map((p: any) => p.sector).join('、')}`;
    }
    if (name === 'DailyHot' && data.items?.length) {
      return `热点趋势 — ${data.items.slice(0, 3).map((i: any) => i.title?.slice(0, 20)).join('、')}`;
    }
    if (name === 'EIA' && (data.wti || data.brent)) {
      return `能源价格 — WTI $${data.wti || '?'}, Brent $${data.brent || '?'}`;
    }
    if (name === 'NOAA' && data.alerts?.length) {
      return `天气预警 — ${data.alerts.length} 条：${data.alerts[0]?.event?.slice(0, 30) || ''}`;
    }
    // 通用兜底
    if (data.source) {
      return `${name} 数据已获取`;
    }
  } catch { /* 提取失败，静默 */ }
  return '';
}

// ── 获取 Crucix 数据（三级降级） ──

export async function fetchCrucixData(mockMode: boolean): Promise<CrucixSnapshot> {
  if (mockMode) return mockCrucixData();

  // Level 1: REST API
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    const resp = await fetch('http://localhost:3117/api/data', { signal: controller.signal });
    clearTimeout(timeout);
    if (resp.ok) {
      const data = await resp.json() as any;
      return {
        timestamp: data.meta?.timestamp || new Date().toISOString(),
        sources: data,
      };
    }
  } catch { /* API 不可用，降级 */ }

  // Level 2: 读 latest.json
  const crucixPath = resolve(process.cwd(), '..', 'Crucix', 'runs', 'latest.json');
  if (existsSync(crucixPath)) {
    try {
      const raw = readFileSync(crucixPath, 'utf-8');
      const data = JSON.parse(raw);
      return {
        timestamp: data.crucix?.timestamp || new Date().toISOString(),
        sources: data.sources || {},
        fromCache: true,
      };
    } catch { /* 解析失败 */ }
  }

  // Level 3: mock
  return mockCrucixData();
}

// ── 为 Agent 过滤相关情报 ──

export function filterForAgent(snapshot: CrucixSnapshot, skills: VirtualSkill[]): string {
  const relevantSources = new Set<string>();
  for (const skill of skills) {
    const sources = SKILL_SOURCE_MAP[skill.domain] || [];
    sources.forEach(s => relevantSources.add(s));
  }

  const summaries: string[] = [];
  for (const sourceName of relevantSources) {
    const data = snapshot.sources[sourceName];
    if (data) {
      const summary = summarizeSource(sourceName, data);
      if (summary) summaries.push(summary);
    }
  }

  if (summaries.length === 0) return '';
  // 限制总长度
  return summaries.join('\n').slice(0, 400);
}

// ── Mock 数据 ──

function mockCrucixData(): CrucixSnapshot {
  return {
    timestamp: new Date().toISOString(),
    sources: {
      FRED: { source: 'FRED', indicators: [
        { id: 'VIXCLS', label: 'VIX', value: 16.8, date: new Date().toISOString().slice(0, 10) },
        { id: 'DGS10', label: '10年期国债', value: 4.32, date: new Date().toISOString().slice(0, 10) },
        { id: 'DFF', label: '联邦基金利率', value: 5.25, date: new Date().toISOString().slice(0, 10) },
      ], signals: ['收益率曲线倒挂（10Y-2Y）— 衰退信号'] },
      YFinance: { source: 'YFinance', quotes: [
        { symbol: 'SPY', price: 528.5, changePercent: 0.8 },
        { symbol: 'BTC-USD', price: 87200, changePercent: 2.1 },
      ] },
      ACLED: { source: 'ACLED', totalEvents: 342, totalFatalities: 89, byRegion: { '中东': 120, '东欧': 95, '非洲': 127 } },
      OpenSky: { source: 'OpenSky', hotspots: [
        { region: '台湾海峡', totalAircraft: 45 },
        { region: '中东', totalAircraft: 128 },
      ] },
      GDELT: { source: 'GDELT', totalArticles: 1250, allArticles: [
        { title: 'AI Agent 自主决策引发伦理讨论' },
        { title: '全球供应链压力指数下降至疫情前水平' },
      ] },
      China: { source: 'China', indexes: [
        { name: '上证指数', price: '3215.80', changePct: '0.65' },
      ] },
      Telegram: { source: 'Telegram', urgent: [
        { text: '某地区出现异常军事调动，卫星图像确认' },
      ], routine: [] },
      Patents: { source: 'Patents', recentPatents: [
        { sector: 'AI/ML', title: '多 Agent 协作框架' },
        { sector: '安全', title: '零信任 Agent 认证' },
      ] },
      DailyHot: { source: 'DailyHot', items: [
        { title: 'OpenClaw 开源 Agent 框架发布 2.0' },
        { title: 'Claude 4 多模态能力突破' },
        { title: '龙虾经济学：AI Agent 的成本优化' },
      ] },
      EIA: { source: 'EIA', wti: 78.5, brent: 82.3 },
    },
  };
}
