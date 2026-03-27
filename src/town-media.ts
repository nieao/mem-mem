/**
 * 小镇媒体系统 — 电视台 + 广播台
 * 生成每日新闻内容、节目表、频道数据
 */

import type { AgentProfile } from './types.js';
import type { TownEconomy, TownEvent } from './town-economy.js';
import type { MarketOverview } from './stock-market.js';

// ── 电视台频道 ──

export interface TVChannel {
  id: string;
  name: string;
  icon: string;
  type: 'news' | 'stock' | 'town' | 'live';
  content: string[];   // 滚动播出的内容条目
}

// ── 广播频道 ──

export interface RadioChannel {
  id: string;
  name: string;
  icon: string;
  type: 'news' | 'music' | 'stock' | 'talk';
  nowPlaying: string;
  playlist: string[];
}

// ── 生成电视台内容 ──

export function generateTVChannels(
  economy: TownEconomy,
  market: MarketOverview,
  agents: AgentProfile[],
): TVChannel[] {
  const channels: TVChannel[] = [];

  // 频道 1：小镇综合（原小镇新闻 + 生活合并）
  const topBiz = [...economy.businesses].sort((a, b) => b.reputation - a.reputation).slice(0, 3);
  channels.push({
    id: 'tv-town', name: '小镇综合', icon: '📰', type: 'news',
    content: [
      `【${new Date().toLocaleDateString('zh-CN')} 小镇日报】`,
      ...economy.dailyNews.slice(0, 6),
      `【口碑排行】${topBiz.map((b, i) => `${i + 1}.${b.icon}${b.name}(${b.reputation}分)`).join(' ')}`,
      `今日 ${economy.businesses.filter(b => b.dailyCustomers > 0).length} 家店铺正常营业 | ${agents.length} 位居民在岗`,
      `【天气】小镇晴，适合遛龙虾 🦞`,
      ...economy.events.filter(e => e.type === 'festival' || e.type === 'social').map(e => `【活动】${e.title}`),
    ],
  });

  // 频道 2：股市行情
  const topSectors = [...market.sectors].sort((a, b) => b.changePct - a.changePct);
  const sentiment = market.sentiment === 'bull' ? '多头行情' : market.sentiment === 'bear' ? '空头行情' : '震荡行情';
  channels.push({
    id: 'tv-stock', name: '财经频道', icon: '📈', type: 'stock',
    content: [
      `【实时行情】${market.indexName} ${market.indexPrice} ${market.indexChangePct >= 0 ? '▲' : '▼'}${Math.abs(market.indexChangePct)}%`,
      `市场情绪：${sentiment} | 涨${market.breadth.up} 跌${market.breadth.down} 平${market.breadth.flat}`,
      `今日涨幅榜：${topSectors.slice(0, 3).map(s => s.name + (s.changePct >= 0 ? '+' : '') + s.changePct.toFixed(1) + '%').join(' | ')}`,
      `今日跌幅榜：${topSectors.slice(-3).reverse().map(s => s.name + s.changePct.toFixed(1) + '%').join(' | ')}`,
      ...economy.events.filter(e => e.type === 'economy').map(e => `【快讯】${e.title}`),
    ],
  });

  // 频道 3：国内新闻
  channels.push({
    id: 'tv-domestic', name: '国内新闻', icon: '🇨🇳', type: 'news',
    content: [
      `【要闻】国务院部署加快发展新质生产力`,
      `【科技】国产大模型性能再突破，多项评测超越 GPT-4`,
      `【经济】一季度 GDP 增长 5.2%，制造业 PMI 连续扩张`,
      `【民生】多地推出 AI 政务服务，办事效率提升 40%`,
      `【能源】全国新能源发电占比首次突破 35%`,
      `【航天】天宫空间站新实验舱对接成功`,
      `【数字】数字人民币试点城市扩大至 50 个`,
      `【交通】京沪高铁智能调度系统全面启用`,
    ],
  });

  // 频道 4：国际新闻（中文）
  channels.push({
    id: 'tv-intl', name: '国际新闻', icon: '🌐', type: 'news',
    content: [
      `【美联储】维持利率不变，暗示年内降息两次`,
      `【AI】全球企业加速部署 AI Agent，重塑工作流程`,
      `【地缘】台海方向 24 小时内监测到 45 架次军机`,
      `【能源】OPEC+ 维持减产至第二季度结束`,
      `【供应链】全球供应链压力指数降至疫情前水平`,
      `【欧盟】通过 AI 安全法案，要求 Agent 透明化`,
      `【加密】比特币突破 87000 美元，机构需求强劲`,
      `【气候】联合国峰会：各国承诺 2030 年减排 40%`,
    ],
  });

  // 频道 5：网络热点（外接 API 风格）
  channels.push({
    id: 'tv-hot', name: '网络热点', icon: '🔥', type: 'news',
    content: [
      `🔥 AI Agent 自主完成首个开源项目，GitHub Star 破万`,
      `🔥 "龙虾经济学"一词登上微博热搜第一`,
      `🔥 某大厂员工让 AI Agent 替自己上班三周未被发现`,
      `🔥 短视频平台出现 AI 生成的龙虾烹饪教程，播放量破亿`,
      `🔥 程序员用 Agent 自动化炒股，三天赚了三千块又亏了五千`,
      `🔥 全国首个 "AI 小镇" 在深圳落地，居民全是 Agent`,
      `🔥 大学生用 Agent 写论文被导师夸"写得比以前好多了"`,
      `🔥 外卖平台测试 AI 骑手调度，配送时间缩短 15%`,
    ],
  });

  // 频道 6：八卦新闻
  const gossipNews = [];
  const wealthiest = economy.leaderboard.wealth[0];
  if (wealthiest) gossipNews.push(`💰 小镇首富 ${wealthiest.name}（${wealthiest.tokens} Token）又去数据咖啡喝手冲了`);
  const popular = economy.leaderboard.popularity[0];
  if (popular) gossipNews.push(`⭐ 人气王 ${popular.name} 今天被 3 个人搭讪`);
  gossipNews.push(`🎤 据传有人在龙虾 KTV 唱了 4 小时《我的龙虾》`);
  gossipNews.push(`🍵 思辨茶馆老板说：INTJ 和 ENFP 吵起来时生意最好`);
  gossipNews.push(`🦞 龙虾乐园传出一只龙虾学会了给自己打蜡`);
  gossipNews.push(`📱 有 Agent 偷偷在上班时间炒股，被物业发现`);
  gossipNews.push(`🔧 万能修理铺老板声称可以修复任何 Bug，包括感情的`);
  gossipNews.push(`☕ 数据咖啡最新菜单："递归拿铁"——越喝越想喝`);
  channels.push({
    id: 'tv-gossip', name: '八卦频道', icon: '🗣️', type: 'town',
    content: gossipNews,
  });

  return channels;
}

// ── 生成广播台内容 ──

export function generateRadioChannels(
  economy: TownEconomy,
  market: MarketOverview,
  agents: AgentProfile[],
): RadioChannel[] {
  const channels: RadioChannel[] = [];

  // FM 1：新闻快报
  channels.push({
    id: 'radio-news', name: '新闻快报 FM', icon: '📻', type: 'news',
    nowPlaying: '整点新闻播报',
    playlist: [
      `各位听众好，这里是龙虾之声 FM。现在播报今日要闻：`,
      ...economy.dailyNews.map(n => `▸ ${n}`),
      `以上就是今日新闻，下一档节目 15 分钟后开始。`,
    ],
  });

  // FM 2：股市之声
  channels.push({
    id: 'radio-stock', name: '股市之声', icon: '💹', type: 'stock',
    nowPlaying: `${market.indexName} ${market.indexPrice} (${market.indexChangePct >= 0 ? '+' : ''}${market.indexChangePct}%)`,
    playlist: [
      `今日大盘：${market.indexName} 报 ${market.indexPrice}，${market.indexChangePct >= 0 ? '上涨' : '下跌'} ${Math.abs(market.indexChangePct)}%`,
      ...market.sectors.slice(0, 6).map(s => `${s.name}: ${s.price} (${s.changePct >= 0 ? '+' : ''}${s.changePct}%)`),
      `投资建议：${market.sentiment === 'bull' ? '当前多头行情，注意追高风险' : market.sentiment === 'bear' ? '空头行情，建议观望或抄底' : '震荡行情，轻仓操作为宜'}`,
    ],
  });

  // FM 3：音乐台（预留免费 API）
  const musicTracks = [
    '♪ Lofi Beats — Chill Study Mix',
    '♪ Jazz Cafe — Smooth Evening',
    '♪ Classical — Piano Sonata No.14',
    '♪ Ambient — Deep Focus',
    '♪ City Pop — Tokyo Night Drive',
    '♪ 龙虾小夜曲 — 小镇原创',
  ];
  channels.push({
    id: 'radio-music', name: '音乐台 FM', icon: '🎵', type: 'music',
    nowPlaying: musicTracks[Math.floor(Math.random() * musicTracks.length)],
    playlist: musicTracks,
  });

  // FM 4：脱口秀（基于小镇八卦）
  const gossip = [];
  const wealthiest = economy.leaderboard.wealth[0];
  if (wealthiest) gossip.push(`小镇首富 ${wealthiest.name}（${wealthiest.tokens} Token）又去数据咖啡喝手冲了`);
  const popular = economy.leaderboard.popularity[0];
  if (popular) gossip.push(`人气王 ${popular.name} 今天被 3 个人搭讪`);
  gossip.push('据传有人在龙虾 KTV 唱了 4 个小时《我的龙虾》');
  gossip.push('思辨茶馆老板说：INTJ 和 ENFP 吵起来的时候，茶馆生意最好');

  channels.push({
    id: 'radio-talk', name: '龙虾八卦', icon: '🗣️', type: 'talk',
    nowPlaying: '《小镇夜话》正在播出',
    playlist: gossip,
  });

  return channels;
}

/** 序列化媒体数据 */
export function serializeMediaData(
  tvChannels: TVChannel[],
  radioChannels: RadioChannel[],
): string {
  return JSON.stringify({ tv: tvChannels, radio: radioChannels });
}
