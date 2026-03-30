/**
 * 小镇股市模拟系统
 * 对应现实 A 股板块，Agent 用 Token 代币买涨跌
 * 数据来源：Crucix China 模块 / mock 数据
 */

import type { AgentProfile, VirtualSkill } from './types.js';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';

// ── 板块定义 ──

export interface Sector {
  code: string;        // 板块代码
  name: string;        // 板块名称
  price: number;       // 当前价格
  change: number;      // 涨跌额
  changePct: number;   // 涨跌幅 %
  volume: number;      // 成交量（万手）
  trend: number[];     // 最近 7 日涨跌幅
}

export interface MarketOverview {
  timestamp: string;
  indexName: string;    // 上证指数
  indexPrice: number;
  indexChange: number;
  indexChangePct: number;
  sectors: Sector[];
  sentiment: 'bull' | 'bear' | 'neutral';  // 市场情绪
  breadth: { up: number; down: number; flat: number };
}

// ── Agent 持仓 ──

export interface AgentPortfolio {
  agentId: string;
  tokens: number;              // 可用 Token 代币
  totalInvested: number;       // 总投资额
  holdings: Holding[];         // 持仓
  tradeHistory: Trade[];       // 交易记录
  totalPnL: number;            // 总盈亏
}

export interface Holding {
  sectorCode: string;
  sectorName: string;
  direction: 'long' | 'short';  // 买涨/买跌
  amount: number;                // 投入 Token
  entryPrice: number;            // 买入时价格
  currentPrice: number;          // 当前价格
  pnl: number;                   // 盈亏
  pnlPct: number;                // 盈亏百分比
}

export interface Trade {
  timestamp: string;
  sectorCode: string;
  sectorName: string;
  direction: 'long' | 'short';
  amount: number;
  price: number;
  result?: 'profit' | 'loss';
  pnl?: number;
}

// ── 初始 Token 分配 ──

const INITIAL_TOKENS = 10000;

// ── 技能 → 偏好板块映射（Agent 会根据自身专长选择板块） ──

const SKILL_SECTOR_PREFERENCE: Record<string, string[]> = {
  'soul-design': ['人工智能', '传媒娱乐', '教育'],
  'memory-arch': ['云计算', '大数据', '半导体'],
  'security': ['网络安全', '军工', '国防'],
  'model-strategy': ['芯片', '算力', '消费电子'],
  'skill-authoring': ['软件开发', '信息技术', '互联网'],
  'multi-agent': ['机器人', '自动化', '智能制造'],
  'channel-ops': ['通信', '5G', '物联网'],
  'automation': ['工业自动化', '新能源', '光伏'],
  'tool-integration': ['云计算', 'SaaS', '企业服务'],
  'prompt-craft': ['人工智能', '内容生成', '数字媒体'],
};

// ── Mock 市场数据 ──

function generateMockMarket(): MarketOverview {
  const sectors: Sector[] = [
    { code: 'AI', name: '人工智能', price: 1285, change: 0, changePct: 0, volume: 3200, trend: [] },
    { code: 'CHIP', name: '芯片半导体', price: 986, change: 0, changePct: 0, volume: 4500, trend: [] },
    { code: 'NEV', name: '新能源车', price: 1120, change: 0, changePct: 0, volume: 2800, trend: [] },
    { code: 'MED', name: '医药生物', price: 845, change: 0, changePct: 0, volume: 1900, trend: [] },
    { code: 'FIN', name: '金融银行', price: 723, change: 0, changePct: 0, volume: 5200, trend: [] },
    { code: 'RE', name: '房地产', price: 456, change: 0, changePct: 0, volume: 1200, trend: [] },
    { code: 'CON', name: '消费零售', price: 678, change: 0, changePct: 0, volume: 2100, trend: [] },
    { code: 'MIL', name: '军工国防', price: 892, change: 0, changePct: 0, volume: 1600, trend: [] },
    { code: 'CLOUD', name: '云计算', price: 1050, change: 0, changePct: 0, volume: 2400, trend: [] },
    { code: 'GREEN', name: '光伏储能', price: 765, change: 0, changePct: 0, volume: 1800, trend: [] },
    { code: 'ROBOT', name: '机器人', price: 1180, change: 0, changePct: 0, volume: 2000, trend: [] },
    { code: 'SEC', name: '网络安全', price: 620, change: 0, changePct: 0, volume: 900, trend: [] },
  ];

  // 随机生成涨跌（-5% ~ +5%）
  let upCount = 0, downCount = 0, flatCount = 0;
  for (const s of sectors) {
    const pct = (Math.random() - 0.45) * 8; // 略偏多
    s.changePct = Math.round(pct * 100) / 100;
    s.change = Math.round(s.price * pct / 100 * 100) / 100;
    s.price = Math.round((s.price + s.change) * 100) / 100;
    // 7 日趋势
    s.trend = Array.from({ length: 7 }, () => Math.round((Math.random() - 0.45) * 6 * 100) / 100);
    if (s.changePct > 0.1) upCount++;
    else if (s.changePct < -0.1) downCount++;
    else flatCount++;
  }

  const indexPrice = 3215 + Math.round((Math.random() - 0.45) * 60 * 100) / 100;
  const indexPct = Math.round((Math.random() - 0.45) * 3 * 100) / 100;

  return {
    timestamp: new Date().toISOString(),
    indexName: '上证指数',
    indexPrice,
    indexChange: Math.round(indexPrice * indexPct / 100 * 100) / 100,
    indexChangePct: indexPct,
    sectors,
    sentiment: upCount > downCount + 2 ? 'bull' : downCount > upCount + 2 ? 'bear' : 'neutral',
    breadth: { up: upCount, down: downCount, flat: flatCount },
  };
}

// ── 从 Crucix 获取真实数据（如有） ──

function fetchRealMarketData(): MarketOverview | null {
  try {
    const crucixPath = join(process.cwd(), '..', 'Crucix', 'runs', 'latest.json');
    if (!existsSync(crucixPath)) return null;
    const raw = JSON.parse(readFileSync(crucixPath, 'utf-8'));
    const china = raw.sources?.China;
    if (!china?.indexes?.length) return null;

    const idx = china.indexes[0];
    const sectors: Sector[] = (china.sectors || []).slice(0, 12).map((s: any) => ({
      code: s.code || s.name?.slice(0, 4),
      name: s.name,
      price: parseFloat(s.price) || 1000,
      change: parseFloat(s.change) || 0,
      changePct: parseFloat(s.changePct) || 0,
      volume: s.volume || 0,
      trend: Array.from({ length: 7 }, () => Math.round((Math.random() - 0.45) * 4 * 100) / 100),
    }));

    // 不够 12 个则用 mock 补充
    if (sectors.length < 8) return null;

    const up = sectors.filter(s => s.changePct > 0.1).length;
    const down = sectors.filter(s => s.changePct < -0.1).length;

    return {
      timestamp: china.timestamp || new Date().toISOString(),
      indexName: idx.name || '上证指数',
      indexPrice: parseFloat(idx.price) || 3200,
      indexChange: parseFloat(idx.change) || 0,
      indexChangePct: parseFloat(idx.changePct) || 0,
      sectors,
      sentiment: up > down + 2 ? 'bull' : down > up + 2 ? 'bear' : 'neutral',
      breadth: { up, down, flat: sectors.length - up - down },
    };
  } catch { return null; }
}

// ── 获取市场数据（真实优先，mock 兜底） ──

export function getMarketData(): MarketOverview {
  return fetchRealMarketData() || generateMockMarket();
}

// ── Agent 投资决策（根据人格 + 技能自动选择） ──

export function autoInvest(agent: AgentProfile, market: MarketOverview): AgentPortfolio {
  const memDir = join('agent-memories', agent.id);
  const portfolioPath = join(memDir, 'portfolio.json');

  // 加载已有持仓
  let portfolio: AgentPortfolio;
  if (existsSync(portfolioPath)) {
    try {
      portfolio = JSON.parse(readFileSync(portfolioPath, 'utf-8'));
    } catch {
      portfolio = createEmptyPortfolio(agent.id);
    }
  } else {
    portfolio = createEmptyPortfolio(agent.id);
  }

  // 更新当前持仓的盈亏
  for (const h of portfolio.holdings) {
    const sector = market.sectors.find(s => s.code === h.sectorCode);
    if (sector) {
      h.currentPrice = sector.price;
      if (h.direction === 'long') {
        h.pnlPct = ((sector.price - h.entryPrice) / h.entryPrice) * 100;
      } else {
        h.pnlPct = ((h.entryPrice - sector.price) / h.entryPrice) * 100;
      }
      h.pnl = Math.round(h.amount * h.pnlPct / 100);
    }
  }
  portfolio.totalPnL = portfolio.holdings.reduce((sum, h) => sum + h.pnl, 0);

  // 如果今天还没投资过，自动做一笔投资
  const today = new Date().toISOString().slice(0, 10);
  const todayTrades = portfolio.tradeHistory.filter(t => t.timestamp.startsWith(today));
  if (todayTrades.length === 0 && portfolio.tokens >= 200) {
    const investment = makeInvestmentDecision(agent, market, portfolio);
    if (investment) {
      portfolio.holdings.push(investment.holding);
      portfolio.tradeHistory.push(investment.trade);
      portfolio.tokens -= investment.holding.amount;
      portfolio.totalInvested += investment.holding.amount;
    }
  }

  // 保存
  mkdirSync(memDir, { recursive: true });
  writeFileSync(portfolioPath, JSON.stringify(portfolio, null, 2), 'utf-8');
  return portfolio;
}

function createEmptyPortfolio(agentId: string): AgentPortfolio {
  return {
    agentId,
    tokens: INITIAL_TOKENS,
    totalInvested: 0,
    holdings: [],
    tradeHistory: [],
    totalPnL: 0,
  };
}

/** 根据人格和技能做投资决策 */
function makeInvestmentDecision(
  agent: AgentProfile,
  market: MarketOverview,
  portfolio: AgentPortfolio,
): { holding: Holding; trade: Trade } | null {
  const ocean = agent.personality.ocean;

  // 根据技能找偏好板块
  const preferredNames = new Set<string>();
  for (const skill of agent.skills) {
    const prefs = SKILL_SECTOR_PREFERENCE[skill.domain] || [];
    prefs.forEach(p => preferredNames.add(p));
  }

  // 选择投资目标（偏好板块优先，其次看涨跌）
  let target = market.sectors.find(s => preferredNames.has(s.name));
  if (!target) {
    // 根据人格选策略
    if (ocean.openness > 70) {
      // 高开放性 → 买涨幅最大的（追涨）
      target = [...market.sectors].sort((a, b) => b.changePct - a.changePct)[0];
    } else if (ocean.neuroticism > 60) {
      // 高神经质 → 买跌幅最大的（抄底，但可能更焦虑）
      target = [...market.sectors].sort((a, b) => a.changePct - b.changePct)[0];
    } else {
      // 稳健型 → 随机选
      target = market.sectors[Math.floor(Math.random() * market.sectors.length)];
    }
  }
  if (!target) return null;

  // 投资金额（根据尽责性和风险偏好）
  const riskFactor = (100 - ocean.conscientiousness) / 100; // 越不尽责越冒险
  const baseAmount = 200 + Math.floor(riskFactor * 600); // 200-800
  const amount = Math.min(baseAmount, portfolio.tokens);

  // 方向：外向性高 → 更可能做多
  const direction: 'long' | 'short' = ocean.extraversion > 60 || Math.random() > 0.35 ? 'long' : 'short';

  const holding: Holding = {
    sectorCode: target.code,
    sectorName: target.name,
    direction,
    amount,
    entryPrice: target.price,
    currentPrice: target.price,
    pnl: 0,
    pnlPct: 0,
  };

  const trade: Trade = {
    timestamp: new Date().toISOString(),
    sectorCode: target.code,
    sectorName: target.name,
    direction,
    amount,
    price: target.price,
  };

  return { holding, trade };
}

// ── 用户交易系统 ──

/**
 * 为人类用户执行股票交易
 * @returns 交易结果
 */
export function userTrade(
  userId: string,
  sectorCode: string,
  direction: 'long' | 'short',
  amount: number,
  market: MarketOverview,
): { success: boolean; message: string; trade?: Trade; portfolio?: AgentPortfolio } {
  const memDir = join('agent-memories', userId);
  const portfolioPath = join(memDir, 'portfolio.json');

  // 加载或创建用户持仓
  let portfolio: AgentPortfolio;
  if (existsSync(portfolioPath)) {
    try {
      portfolio = JSON.parse(readFileSync(portfolioPath, 'utf-8'));
    } catch {
      portfolio = createEmptyPortfolio(userId);
      portfolio.tokens = 15000; // 人类用户初始 Token
    }
  } else {
    portfolio = createEmptyPortfolio(userId);
    portfolio.tokens = 15000;
  }

  // 验证板块
  const sector = market.sectors.find(s => s.code === sectorCode);
  if (!sector) return { success: false, message: `板块不存在: ${sectorCode}` };

  // 验证金额
  if (amount < 100) return { success: false, message: '最低交易金额 100 Token' };
  if (amount > portfolio.tokens) return { success: false, message: `余额不足，当前可用 ${portfolio.tokens} Token` };

  // 执行交易
  const holding: Holding = {
    sectorCode: sector.code,
    sectorName: sector.name,
    direction,
    amount,
    entryPrice: sector.price,
    currentPrice: sector.price,
    pnl: 0,
    pnlPct: 0,
  };

  const trade: Trade = {
    timestamp: new Date().toISOString(),
    sectorCode: sector.code,
    sectorName: sector.name,
    direction,
    amount,
    price: sector.price,
  };

  portfolio.holdings.push(holding);
  portfolio.tradeHistory.push(trade);
  portfolio.tokens -= amount;
  portfolio.totalInvested += amount;

  // 更新所有持仓盈亏
  for (const h of portfolio.holdings) {
    const s = market.sectors.find(sec => sec.code === h.sectorCode);
    if (s) {
      h.currentPrice = s.price;
      h.pnlPct = h.direction === 'long'
        ? ((s.price - h.entryPrice) / h.entryPrice) * 100
        : ((h.entryPrice - s.price) / h.entryPrice) * 100;
      h.pnl = Math.round(h.amount * h.pnlPct / 100);
    }
  }
  portfolio.totalPnL = portfolio.holdings.reduce((sum, h) => sum + h.pnl, 0);

  // 保存
  mkdirSync(memDir, { recursive: true });
  writeFileSync(portfolioPath, JSON.stringify(portfolio, null, 2), 'utf-8');

  return { success: true, message: `成功${direction === 'long' ? '做多' : '做空'} ${sector.name} ${amount} Token`, trade, portfolio };
}

/**
 * 平仓（卖出）指定持仓
 */
export function userSellHolding(
  userId: string,
  holdingIndex: number,
  market: MarketOverview,
): { success: boolean; message: string; pnl?: number; portfolio?: AgentPortfolio } {
  const memDir = join('agent-memories', userId);
  const portfolioPath = join(memDir, 'portfolio.json');

  if (!existsSync(portfolioPath)) return { success: false, message: '无持仓数据' };

  let portfolio: AgentPortfolio;
  try {
    portfolio = JSON.parse(readFileSync(portfolioPath, 'utf-8'));
  } catch {
    return { success: false, message: '持仓数据损坏' };
  }

  if (holdingIndex < 0 || holdingIndex >= portfolio.holdings.length) {
    return { success: false, message: '持仓索引无效' };
  }

  const h = portfolio.holdings[holdingIndex];
  const sector = market.sectors.find(s => s.code === h.sectorCode);
  if (sector) {
    h.currentPrice = sector.price;
    h.pnlPct = h.direction === 'long'
      ? ((sector.price - h.entryPrice) / h.entryPrice) * 100
      : ((h.entryPrice - sector.price) / h.entryPrice) * 100;
    h.pnl = Math.round(h.amount * h.pnlPct / 100);
  }

  // 平仓 → 回收本金 + 盈亏
  const returnAmount = h.amount + h.pnl;
  portfolio.tokens += returnAmount;
  portfolio.totalInvested -= h.amount;

  // 记录交易
  portfolio.tradeHistory.push({
    timestamp: new Date().toISOString(),
    sectorCode: h.sectorCode,
    sectorName: h.sectorName,
    direction: h.direction,
    amount: h.amount,
    price: h.currentPrice,
    result: h.pnl >= 0 ? 'profit' : 'loss',
    pnl: h.pnl,
  });

  const pnl = h.pnl;
  const sectorName = h.sectorName;

  // 移除持仓
  portfolio.holdings.splice(holdingIndex, 1);
  portfolio.totalPnL = portfolio.holdings.reduce((sum, hh) => sum + hh.pnl, 0);

  writeFileSync(portfolioPath, JSON.stringify(portfolio, null, 2), 'utf-8');

  return { success: true, message: `已平仓 ${sectorName}，${pnl >= 0 ? '盈利' : '亏损'} ${Math.abs(pnl)} Token`, pnl, portfolio };
}

/**
 * 获取用户持仓（不执行自动交易）
 */
export function getUserPortfolio(userId: string, market: MarketOverview): AgentPortfolio {
  const memDir = join('agent-memories', userId);
  const portfolioPath = join(memDir, 'portfolio.json');

  let portfolio: AgentPortfolio;
  if (existsSync(portfolioPath)) {
    try {
      portfolio = JSON.parse(readFileSync(portfolioPath, 'utf-8'));
    } catch {
      portfolio = createEmptyPortfolio(userId);
      portfolio.tokens = 15000;
    }
  } else {
    portfolio = createEmptyPortfolio(userId);
    portfolio.tokens = 15000;
  }

  // 更新盈亏
  for (const h of portfolio.holdings) {
    const s = market.sectors.find(sec => sec.code === h.sectorCode);
    if (s) {
      h.currentPrice = s.price;
      h.pnlPct = h.direction === 'long'
        ? ((s.price - h.entryPrice) / h.entryPrice) * 100
        : ((h.entryPrice - s.price) / h.entryPrice) * 100;
      h.pnl = Math.round(h.amount * h.pnlPct / 100);
    }
  }
  portfolio.totalPnL = portfolio.holdings.reduce((sum, h) => sum + h.pnl, 0);

  return portfolio;
}

// ── 行情数据源（Yahoo Finance，免费无 Key） ──

export interface FinnhubQuote {
  c: number;   // 当前价
  d: number;   // 涨跌额
  dp: number;  // 涨跌幅%
  h: number;   // 最高
  l: number;   // 最低
  o: number;   // 开盘
  pc: number;  // 昨收
  t: number;   // 时间戳
}

export interface WatchlistItem {
  symbol: string;
  name: string;
  sector?: string;
}

export interface Watchlist {
  stocks: WatchlistItem[];
}

// ── 缓存层（5 分钟 TTL） ──

interface CacheEntry {
  data: FinnhubQuote;
  expiry: number;
}

const quoteCache = new Map<string, CacheEntry>();
const CACHE_TTL = 5 * 60 * 1000; // 5 分钟

function getCachedQuote(symbol: string): FinnhubQuote | null {
  const entry = quoteCache.get(symbol.toUpperCase());
  if (entry && Date.now() < entry.expiry) return entry.data;
  return null;
}

function setCachedQuote(symbol: string, data: FinnhubQuote): void {
  quoteCache.set(symbol.toUpperCase(), { data, expiry: Date.now() + CACHE_TTL });
}

// ── Yahoo Finance API（免费、无 Key、支持 A股/港股/美股） ──

const YAHOO_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
};

/** 查询单只股票实时行情（Yahoo Finance） */
export async function fetchFinnhubQuote(symbol: string): Promise<FinnhubQuote | null> {
  const cached = getCachedQuote(symbol);
  if (cached) return cached;

  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol.toUpperCase())}?interval=1d&range=1d`;
    const resp = await fetch(url, {
      headers: YAHOO_HEADERS,
      signal: AbortSignal.timeout(10000),
    });
    if (!resp.ok) return null;
    const json = await resp.json() as any;
    const result = json?.chart?.result?.[0];
    if (!result) return null;

    const meta = result.meta;
    const c = meta.regularMarketPrice ?? 0;
    const pc = meta.previousClose ?? meta.chartPreviousClose ?? c;
    const d = Math.round((c - pc) * 100) / 100;
    const dp = pc !== 0 ? Math.round((d / pc) * 10000) / 100 : 0;

    const indicators = result.indicators?.quote?.[0];
    const quote: FinnhubQuote = {
      c,
      d,
      dp,
      h: indicators?.high?.[0] ?? meta.regularMarketDayHigh ?? c,
      l: indicators?.low?.[0] ?? meta.regularMarketDayLow ?? c,
      o: indicators?.open?.[0] ?? meta.regularMarketOpen ?? c,
      pc,
      t: meta.regularMarketTime ?? Math.floor(Date.now() / 1000),
    };

    if (quote.c === 0) return null;
    setCachedQuote(symbol, quote);
    return quote;
  } catch {
    return null;
  }
}

/** 带缓存的行情查询 */
export async function getQuoteWithCache(symbol: string): Promise<FinnhubQuote | null> {
  return fetchFinnhubQuote(symbol);
}

/** 搜索股票代码（Yahoo Finance） */
export async function searchSymbol(query: string): Promise<Array<{ symbol: string; description: string; type: string }>> {
  try {
    const url = `https://query2.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(query)}&quotesCount=10&newsCount=0&listsCount=0`;
    const resp = await fetch(url, {
      headers: YAHOO_HEADERS,
      signal: AbortSignal.timeout(8000),
    });
    if (!resp.ok) return [];
    const data = await resp.json() as any;
    return (data.quotes || []).slice(0, 10).map((r: any) => ({
      symbol: r.symbol || '',
      description: r.shortname || r.longname || r.symbol || '',
      type: r.quoteType || r.typeDisp || 'Equity',
    }));
  } catch {
    return [];
  }
}

// ── 自选股 ──

/** 加载用户自选股 */
export function loadWatchlist(userId: string): Watchlist {
  const p = join('agent-memories', userId, 'watchlist.json');
  if (!existsSync(p)) return { stocks: [] };
  try { return JSON.parse(readFileSync(p, 'utf-8')); } catch { return { stocks: [] }; }
}

/** 保存用户自选股 */
export function saveWatchlist(userId: string, watchlist: Watchlist): void {
  const dir = join('agent-memories', userId);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'watchlist.json'), JSON.stringify(watchlist, null, 2), 'utf-8');
}

/** 序列化市场和持仓数据供前端使用 */
export function serializeMarketData(
  market: MarketOverview,
  portfolios: Map<string, AgentPortfolio>,
): string {
  return JSON.stringify({
    market: {
      indexName: market.indexName,
      indexPrice: market.indexPrice,
      indexChange: market.indexChange,
      indexChangePct: market.indexChangePct,
      sentiment: market.sentiment,
      breadth: market.breadth,
      sectors: market.sectors.map(s => ({
        code: s.code,
        name: s.name,
        price: s.price,
        changePct: s.changePct,
        trend: s.trend,
      })),
    },
    portfolios: Object.fromEntries(
      [...portfolios.entries()].map(([id, p]) => [id, {
        tokens: p.tokens,
        totalPnL: p.totalPnL,
        holdings: p.holdings.map(h => ({
          sectorName: h.sectorName,
          direction: h.direction,
          amount: h.amount,
          pnlPct: Math.round(h.pnlPct * 100) / 100,
          pnl: h.pnl,
        })),
      }])
    ),
  });
}
