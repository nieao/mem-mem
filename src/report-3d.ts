/**
 * 3D 小镇报告生成器 — Three.js 全 3D 交互式可视化
 * 建筑极简唯美风格 + 低多边形 3D 场景
 */

import type { SimulationLog, AgentProfile, Utterance, DiscussionRound } from './types.js';
import { writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';

/** HTML 转义 */
function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/** 根据 MBTI 生成建筑配色（hex 数值） */
function mbtiColorHex(mbti: string): { main: string; roof: string; accent: string; light: string } {
  const palette: Record<string, { main: string; roof: string; accent: string; light: string }> = {
    INTJ: { main: '#6b7b8d', roof: '#4a5568', accent: '#9fb3c8', light: '#c8d6e5' },
    INTP: { main: '#7b8fa1', roof: '#5a6f82', accent: '#a8c0d4', light: '#d0e0ee' },
    ENTJ: { main: '#8b6f5e', roof: '#6b4f3e', accent: '#c8a882', light: '#e8d5c0' },
    ENTP: { main: '#9b8b6e', roof: '#7b6b4e', accent: '#d4c4a2', light: '#ece0cc' },
    INFJ: { main: '#7b6b8d', roof: '#5b4b6d', accent: '#b8a8cc', light: '#d8cee8' },
    INFP: { main: '#8b7b9b', roof: '#6b5b7b', accent: '#c8b8d8', light: '#e2d8ec' },
    ENFJ: { main: '#8b7b6b', roof: '#6b5b4b', accent: '#c8b8a2', light: '#e4d8c8' },
    ENFP: { main: '#9b8b7b', roof: '#7b6b5b', accent: '#d4c4b4', light: '#ece0d4' },
    ISTJ: { main: '#6b7b7b', roof: '#4a5a5a', accent: '#9bb0b0', light: '#c8dada' },
    ISFJ: { main: '#7b8b8b', roof: '#5a6a6a', accent: '#a8c0c0', light: '#d0e0e0' },
    ESTJ: { main: '#7b6b6b', roof: '#5b4b4b', accent: '#b0a0a0', light: '#d4c8c8' },
    ESFJ: { main: '#8b7b7b', roof: '#6b5b5b', accent: '#c0b0b0', light: '#dcd0d0' },
    ISTP: { main: '#6b8b7b', roof: '#4a6b5a', accent: '#9bc0b0', light: '#c4e0d4' },
    ISFP: { main: '#7b9b8b', roof: '#5a7b6a', accent: '#a8d0c0', light: '#cee8dc' },
    ESTP: { main: '#8b7b6b', roof: '#6b5b4b', accent: '#c0b0a0', light: '#dcd4c8' },
    ESFP: { main: '#9b8b7b', roof: '#7b6b5b', accent: '#d0c0b0', light: '#e8dcd0' },
  };
  return palette[mbti] || { main: '#8b8b8b', roof: '#6b6b6b', accent: '#b0b0b0', light: '#d0d0d0' };
}

/** 计算 Agent 间的对话关系 */
function buildRelationships(log: SimulationLog): { from: string; to: string; fromName: string; toName: string; count: number }[] {
  const map = new Map<string, number>();
  for (const round of log.rounds) {
    for (const u of round.utterances) {
      if (u.replyTo) {
        const key = `${u.agentId}->${u.replyTo}`;
        map.set(key, (map.get(key) || 0) + 1);
      }
    }
  }
  return Array.from(map.entries())
    .map(([k, count]) => {
      const [from, to] = k.split('->');
      return {
        from, to,
        fromName: log.agents.find(a => a.id === from)?.name || from,
        toName: log.agents.find(a => a.id === to)?.name || to,
        count
      };
    })
    .sort((a, b) => b.count - a.count)
    .slice(0, 30);
}

/** 统计每轮情感分布 */
function sentimentDist(utterances: Utterance[]): { positive: number; neutral: number; negative: number; curious: number } {
  const d = { positive: 0, neutral: 0, negative: 0, curious: 0 };
  for (const u of utterances) d[u.sentiment]++;
  return d;
}

/** 生成 3D HTML 报告 */
export function generate3dReport(log: SimulationLog, outputDir: string): string {
  mkdirSync(outputDir, { recursive: true });

  // 序列化数据供前端使用
  const agentsJson = JSON.stringify(log.agents.map(a => ({
    id: a.id,
    name: a.name,
    role: a.role,
    mbti: a.personality.mbti,
    archetype: a.personality.archetype,
    ocean: a.personality.ocean,
    skills: a.skills.map(s => ({ name: s.name, level: s.level, domain: s.domain })),
    backstory: a.backstory,
    colors: mbtiColorHex(a.personality.mbti),
    description: a.personality.description,
    communicationStyle: a.personality.communicationStyle,
  })));

  const roundsJson = JSON.stringify(log.rounds.map(r => ({
    roundNumber: r.roundNumber,
    topicTitle: r.topic.title,
    topicQuestion: r.topic.openingQuestion,
    participants: r.participants,
    utterances: r.utterances.map(u => ({
      agentId: u.agentId,
      agentName: u.agentName,
      content: u.content,
      sentiment: u.sentiment,
      replyTo: u.replyTo,
    })),
    gmSummary: r.gmSummary,
    sentiment: sentimentDist(r.utterances),
  })));

  const insightsJson = JSON.stringify(log.insights);
  const relJson = JSON.stringify(buildRelationships(log));
  const metaJson = JSON.stringify(log.metadata);

  // 提取小镇新闻供聊天气泡使用
  let dailyNewsArr: string[] = [];
  try {
    const econStr = (log.metadata as any).economyJson;
    if (econStr) {
      const econ = JSON.parse(econStr);
      if (econ.dailyNews) dailyNewsArr = econ.dailyNews.slice(-10);
    }
  } catch {}
  if (dailyNewsArr.length === 0) dailyNewsArr = ['小镇今天平安无事', '股市波动不大', '龙虾食堂生意兴隆'];
  const newsJson = JSON.stringify(dailyNewsArr);

  const html = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>🦞 龙虾小镇 — 3D</title>
<style>
  @import url('https://fonts.googleapis.com/css2?family=Noto+Sans+SC:wght@300;400;500;700&family=Noto+Serif+SC:wght@300;400;600&display=swap');

  :root {
    --black: #1a1a1a;
    --dark: #2d2d2d;
    --gray-900: #3a3a3a;
    --gray-700: #555;
    --gray-500: #888;
    --gray-400: #aaa;
    --gray-300: #bbb;
    --gray-100: #e8e8e8;
    --white: #fafafa;
    --warm: #c8a882;
    --warm-light: #e8d5c0;
    --warm-bg: #f5f0eb;
  }

  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    font-family: "Noto Sans SC", "Microsoft YaHei", system-ui, sans-serif;
    background: #0a0a0a;
    color: var(--white);
    overflow: hidden;
    height: 100vh;
    width: 100vw;
  }

  #canvas-container {
    position: fixed; top: 0; left: 0; width: 100%; height: 100%; z-index: 0;
  }
  canvas { display: block; }

  /* ── 顶部导航 ── */
  .top-bar {
    position: fixed; top: 0; left: 0; right: 0; z-index: 100;
    background: rgba(10, 10, 10, 0.75);
    backdrop-filter: blur(24px);
    border-bottom: 1px solid rgba(200,168,130,0.15);
    height: 56px; display: flex; align-items: center;
    padding: 0 24px; justify-content: space-between;
  }
  .top-title {
    font-family: "Noto Serif SC", Georgia, serif;
    font-size: 1rem; font-weight: 300;
    letter-spacing: 0.08em; color: rgba(255,255,255,0.9);
    display: flex; align-items: center; gap: 12px;
  }
  .top-warm-dot {
    width: 8px; height: 8px; border-radius: 50%;
    background: var(--warm); box-shadow: 0 0 12px rgba(200,168,130,0.5);
  }
  .top-stats {
    display: flex; gap: 28px; font-size: 0.75rem; letter-spacing: 0.1em;
  }
  .top-stat { display: flex; flex-direction: column; align-items: center; }
  .top-stat-val {
    font-family: "Noto Serif SC", Georgia, serif;
    font-size: 1.3rem; color: var(--warm); line-height: 1.2;
  }
  .top-stat-label { color: rgba(255,255,255,0.4); font-size: 0.65rem; letter-spacing: 0.2em; }
  .top-controls { display: flex; gap: 8px; }
  .top-btn {
    background: rgba(255,255,255,0.06); border: 1px solid rgba(255,255,255,0.1);
    color: rgba(255,255,255,0.7); padding: 6px 14px; cursor: pointer;
    font-size: 0.72rem; letter-spacing: 0.1em; transition: all 0.3s;
    font-family: inherit;
  }
  .top-btn:hover { background: rgba(200,168,130,0.15); border-color: var(--warm); color: var(--warm); }
  .top-btn.active { background: rgba(200,168,130,0.2); border-color: var(--warm); color: var(--warm); }

  /* ── 左侧居民列表 ── */
  .side-panel {
    position: fixed; top: 56px; left: 0; bottom: 0; width: 280px; z-index: 90;
    background: rgba(10, 10, 10, 0.82);
    backdrop-filter: blur(20px);
    border-right: 1px solid rgba(200,168,130,0.1);
    transform: translateX(-100%);
    transition: transform 0.4s cubic-bezier(0.22, 1, 0.36, 1);
    overflow-y: auto; padding: 20px 16px;
  }
  .side-panel.open { transform: translateX(0); }
  .side-panel::-webkit-scrollbar { width: 3px; }
  .side-panel::-webkit-scrollbar-thumb { background: rgba(200,168,130,0.3); border-radius: 2px; }
  .side-label {
    font-size: 0.65rem; letter-spacing: 0.35em; color: var(--warm);
    margin-bottom: 16px; padding-bottom: 8px;
    border-bottom: 1px solid rgba(200,168,130,0.15);
  }
  .side-agent {
    display: flex; align-items: center; gap: 10px; padding: 10px 8px;
    cursor: pointer; border-radius: 4px; transition: all 0.3s;
    border: 1px solid transparent; margin-bottom: 2px;
  }
  .side-agent:hover { background: rgba(200,168,130,0.08); border-color: rgba(200,168,130,0.15); }
  .side-agent.selected { background: rgba(200,168,130,0.12); border-color: var(--warm); }
  .side-avatar {
    width: 32px; height: 32px; border-radius: 50%;
    display: flex; align-items: center; justify-content: center;
    font-size: 0.8rem; font-weight: 500; color: white; flex-shrink: 0;
  }
  .side-agent-info { flex: 1; min-width: 0; }
  .side-agent-name { font-size: 0.82rem; color: rgba(255,255,255,0.9); }
  .side-agent-meta { font-size: 0.65rem; color: rgba(255,255,255,0.4); }

  /* ── 右侧详情面板 ── */
  .detail-panel {
    position: fixed; top: 56px; right: 0; bottom: 0; width: 420px; z-index: 90;
    background: rgba(10, 10, 10, 0.88);
    backdrop-filter: blur(24px);
    border-left: 1px solid rgba(200,168,130,0.1);
    transform: translateX(100%);
    transition: transform 0.5s cubic-bezier(0.22, 1, 0.36, 1);
    overflow-y: auto; padding: 0;
  }
  .detail-panel.open { transform: translateX(0); }
  .detail-panel::-webkit-scrollbar { width: 3px; }
  .detail-panel::-webkit-scrollbar-thumb { background: rgba(200,168,130,0.3); border-radius: 2px; }
  .detail-close {
    position: absolute; top: 12px; right: 12px; width: 28px; height: 28px;
    background: none; border: 1px solid rgba(255,255,255,0.1); color: rgba(255,255,255,0.5);
    cursor: pointer; font-size: 1rem; display: flex; align-items: center; justify-content: center;
    transition: all 0.3s; z-index: 5;
  }
  .detail-close:hover { border-color: var(--warm); color: var(--warm); }

  /* 详情 - Agent 卡片头 */
  .detail-hero {
    padding: 32px 28px 24px; position: relative;
    border-bottom: 1px solid rgba(200,168,130,0.1);
  }
  .detail-hero::before {
    content: ''; position: absolute; top: 0; left: 0; right: 0; height: 3px;
    background: var(--warm);
  }
  .detail-avatar-lg {
    width: 64px; height: 64px; border-radius: 50%;
    display: flex; align-items: center; justify-content: center;
    font-family: "Noto Serif SC", Georgia, serif;
    font-size: 1.6rem; color: white; margin-bottom: 12px;
    box-shadow: 0 8px 32px rgba(0,0,0,0.3);
  }
  .detail-name {
    font-family: "Noto Serif SC", Georgia, serif;
    font-size: 1.4rem; color: white; margin-bottom: 4px;
  }
  .detail-mbti {
    display: inline-block; font-size: 0.72rem; letter-spacing: 0.15em;
    border: 1px solid var(--warm); color: var(--warm);
    padding: 2px 12px; margin-bottom: 8px;
  }
  .detail-role { font-size: 0.82rem; color: rgba(255,255,255,0.5); margin-bottom: 4px; }
  .detail-desc { font-size: 0.8rem; color: rgba(255,255,255,0.45); line-height: 1.7; margin-top: 12px; }

  /* 详情 - OCEAN 柱状图 */
  .detail-section {
    padding: 20px 28px; border-bottom: 1px solid rgba(200,168,130,0.06);
  }
  .detail-section-title {
    font-size: 0.65rem; letter-spacing: 0.3em; color: var(--warm);
    margin-bottom: 14px;
  }
  .ocean-row { display: flex; align-items: center; gap: 8px; margin-bottom: 8px; }
  .ocean-label { font-size: 0.72rem; color: rgba(255,255,255,0.5); width: 32px; text-align: right; }
  .ocean-track { flex: 1; height: 4px; background: rgba(255,255,255,0.06); border-radius: 2px; overflow: hidden; }
  .ocean-fill { height: 100%; border-radius: 2px; transition: width 0.8s ease; }
  .ocean-val { font-size: 0.68rem; color: rgba(255,255,255,0.4); width: 26px; }

  /* 详情 - 技能 */
  .skill-chip {
    display: inline-flex; align-items: center; gap: 6px;
    padding: 5px 12px; margin: 0 6px 6px 0;
    border: 1px solid rgba(255,255,255,0.08);
    font-size: 0.72rem; color: rgba(255,255,255,0.65);
    border-radius: 2px;
  }
  .skill-dot { width: 5px; height: 5px; border-radius: 50%; }
  .skill-lv { color: var(--warm); font-size: 0.65rem; }

  /* ── 底部讨论面板 ── */
  .discuss-panel {
    position: fixed; left: 0; right: 0; bottom: 0; z-index: 80;
    max-height: 45vh;
    background: rgba(10, 10, 10, 0.9);
    backdrop-filter: blur(24px);
    border-top: 1px solid rgba(200,168,130,0.15);
    transform: translateY(100%);
    transition: transform 0.5s cubic-bezier(0.22, 1, 0.36, 1);
    overflow-y: auto;
  }
  .discuss-panel.open { transform: translateY(0); }
  .discuss-panel::-webkit-scrollbar { width: 3px; }
  .discuss-panel::-webkit-scrollbar-thumb { background: rgba(200,168,130,0.3); }

  .discuss-header {
    position: sticky; top: 0; z-index: 5;
    display: flex; align-items: center; justify-content: space-between;
    padding: 16px 28px; background: rgba(15,15,15,0.95);
    border-bottom: 1px solid rgba(200,168,130,0.08);
  }
  .discuss-title {
    font-family: "Noto Serif SC", Georgia, serif;
    font-size: 1rem; color: white;
  }
  .discuss-tabs { display: flex; gap: 4px; }
  .discuss-tab {
    padding: 5px 14px; font-size: 0.72rem; cursor: pointer;
    background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.08);
    color: rgba(255,255,255,0.5); transition: all 0.3s; font-family: inherit;
  }
  .discuss-tab.active { background: rgba(200,168,130,0.15); border-color: var(--warm); color: var(--warm); }

  .discuss-content { padding: 20px 28px; }
  .round-card {
    margin-bottom: 28px; border: 1px solid rgba(255,255,255,0.05);
    background: rgba(255,255,255,0.02);
  }
  .round-head {
    display: flex; align-items: center; gap: 16px;
    padding: 16px 20px;
    background: linear-gradient(135deg, rgba(200,168,130,0.06), transparent);
    border-bottom: 1px solid rgba(255,255,255,0.04);
  }
  .round-num {
    font-family: "Noto Serif SC", Georgia, serif;
    font-size: 2rem; color: var(--warm); opacity: 0.6; line-height: 1;
  }
  .round-info { flex: 1; }
  .round-topic-title {
    font-family: "Noto Serif SC", Georgia, serif;
    font-size: 0.95rem; color: white; margin-bottom: 4px;
  }
  .round-question {
    font-size: 0.78rem; color: rgba(255,255,255,0.4); font-style: italic;
    padding-left: 10px; border-left: 2px solid rgba(200,168,130,0.3);
  }
  .sentiment-bar {
    display: flex; height: 3px; border-radius: 2px; overflow: hidden;
    margin: 10px 20px;
  }
  .sb-pos { background: #4caf50; }
  .sb-cur { background: #64b5f6; }
  .sb-neu { background: #888; }
  .sb-neg { background: #e57373; }

  .utt-list { padding: 12px 20px; }
  .utt-item {
    display: flex; gap: 10px; padding: 10px 0;
    border-bottom: 1px solid rgba(255,255,255,0.03);
  }
  .utt-item:last-child { border-bottom: none; }
  .utt-avatar {
    width: 28px; height: 28px; border-radius: 50%; flex-shrink: 0;
    display: flex; align-items: center; justify-content: center;
    font-size: 0.68rem; color: white;
  }
  .utt-body { flex: 1; min-width: 0; }
  .utt-head {
    display: flex; align-items: center; gap: 6px; margin-bottom: 3px; flex-wrap: wrap;
  }
  .utt-name { font-size: 0.8rem; color: rgba(255,255,255,0.85); font-weight: 500; }
  .utt-mbti { font-size: 0.65rem; color: rgba(255,255,255,0.3); }
  .utt-reply { font-size: 0.62rem; color: var(--warm); background: rgba(200,168,130,0.1); padding: 1px 6px; }
  .utt-sent {
    width: 5px; height: 5px; border-radius: 50%; margin-left: auto; flex-shrink: 0;
  }
  .utt-text { font-size: 0.82rem; color: rgba(255,255,255,0.65); line-height: 1.7; }

  .gm-block {
    display: flex; gap: 12px; padding: 14px 20px; margin-top: 4px;
    background: rgba(200,168,130,0.04); border-top: 1px solid rgba(200,168,130,0.08);
  }
  .gm-badge {
    width: 30px; height: 30px; background: var(--warm); color: white;
    display: flex; align-items: center; justify-content: center;
    font-size: 0.6rem; font-weight: 700; flex-shrink: 0; border-radius: 3px;
  }
  .gm-body { flex: 1; }
  .gm-lbl { font-size: 0.6rem; letter-spacing: 0.2em; color: var(--warm); margin-bottom: 2px; }
  .gm-txt { font-size: 0.78rem; color: rgba(255,255,255,0.6); line-height: 1.7; }

  /* ── 洞察面板 ── */
  .insights-content { padding: 20px 28px; }
  .insight-item {
    display: flex; gap: 16px; padding: 18px 0;
    border-bottom: 1px solid rgba(255,255,255,0.04);
  }
  .insight-item:last-child { border-bottom: none; }
  .insight-num {
    font-family: "Noto Serif SC", Georgia, serif;
    font-size: 1.1rem; color: var(--warm); opacity: 0.7; flex-shrink: 0; width: 30px;
  }
  .insight-text { font-size: 0.85rem; color: rgba(255,255,255,0.65); line-height: 1.8; }

  /* ── 提示文字 ── */
  .hint-text {
    position: fixed; bottom: 16px; left: 50%; transform: translateX(-50%);
    z-index: 70; font-size: 0.7rem; color: rgba(255,255,255,0.25);
    letter-spacing: 0.15em; pointer-events: none;
    transition: opacity 0.5s;
  }

  /* ── 加载动画 ── */
  .loader {
    position: fixed; top: 0; left: 0; right: 0; bottom: 0; z-index: 200;
    background: #0a0a0a;
    display: flex; flex-direction: column; align-items: center; justify-content: center;
    transition: opacity 0.8s ease;
  }
  .loader.fade { opacity: 0; pointer-events: none; }
  .loader-text {
    font-family: "Noto Serif SC", Georgia, serif;
    font-size: 1.2rem; color: var(--warm); letter-spacing: 0.1em;
    margin-top: 24px; opacity: 0.8;
  }
  .loader-bar {
    width: 200px; height: 2px; background: rgba(255,255,255,0.06);
    margin-top: 16px; border-radius: 1px; overflow: hidden;
  }
  .loader-fill {
    width: 0%; height: 100%; background: var(--warm);
    transition: width 0.3s ease;
  }

  /* ── 响应式 ── */
  @media (max-width: 768px) {
    .side-panel { width: 240px; }
    .detail-panel { width: 100%; }
    .top-stats { display: none; }
    .discuss-panel { max-height: 55vh; }
  }

  /* ── 工具提示 ── */
  .tooltip-3d {
    position: fixed; z-index: 150; pointer-events: none;
    background: rgba(10,10,10,0.92); backdrop-filter: blur(12px);
    border: 1px solid rgba(200,168,130,0.2);
    padding: 8px 14px; max-width: 200px;
    transform: translate(-50%, -120%);
    opacity: 0; transition: opacity 0.2s;
  }
  .tooltip-3d.visible { opacity: 1; }
  .tooltip-name { font-size: 0.82rem; color: white; margin-bottom: 2px; }
  .tooltip-meta { font-size: 0.68rem; color: rgba(255,255,255,0.4); }
</style>
</head>
<body>

<!-- 加载界面 -->
<div class="loader" id="loader">
  <div class="top-warm-dot" style="width:16px;height:16px;animation:pulse 1.5s ease infinite"></div>
  <div class="loader-text">构建小镇中...</div>
  <div class="loader-bar"><div class="loader-fill" id="loader-fill"></div></div>
</div>
<style>@keyframes pulse { 0%,100%{box-shadow:0 0 12px rgba(200,168,130,0.5)} 50%{box-shadow:0 0 32px rgba(200,168,130,0.8)} }</style>

<!-- 3D 画布容器 -->
<div id="canvas-container"></div>

<!-- 顶部栏 -->
<div class="top-bar">
  <div class="top-title">
    <div class="top-warm-dot"></div>
    <span>龙虾小镇</span>
    <span style="color:rgba(255,255,255,0.3);font-weight:300">|</span>
    <span style="color:rgba(255,255,255,0.5);font-size:0.82rem">龙虾小镇</span>
  </div>
  <div class="top-stats">
    <div class="top-stat">
      <div class="top-stat-val">${log.metadata.totalUtterances}</div>
      <div class="top-stat-label">发言</div>
    </div>
    <div class="top-stat">
      <div class="top-stat-val">${log.metadata.totalRounds}</div>
      <div class="top-stat-label">轮次</div>
    </div>
    <div class="top-stat">
      <div class="top-stat-val">${log.agents.length}</div>
      <div class="top-stat-label">居民</div>
    </div>
    <div class="top-stat">
      <div class="top-stat-val">${log.insights.length}</div>
      <div class="top-stat-label">洞察</div>
    </div>
  </div>
  <div class="top-controls">
    <button class="top-btn" id="btn-agents">居民</button>
    <button class="top-btn" id="btn-discuss">讨论</button>
    <button class="top-btn" id="btn-insights">洞察</button>
    <button class="top-btn" id="btn-day-night">昼/夜</button>
    <button class="top-btn" id="btn-auto-rotate">自动旋转</button>
    <button class="top-btn" id="btn-capture" style="color:#ff6b6b;border-color:rgba(255,107,107,0.3)">抓人</button>
    <button class="top-btn" id="btn-jail">天牢 <span id="jail-count" style="color:var(--warm)">0</span></button>
  </div>
</div>

<!-- 悬停工具提示 -->
<div class="tooltip-3d" id="tooltip">
  <div class="tooltip-name" id="tooltip-name"></div>
  <div class="tooltip-meta" id="tooltip-meta"></div>
</div>

<!-- 左侧居民列表 -->
<div class="side-panel" id="side-panel">
  <div class="side-label">居民列表 / RESIDENTS</div>
  <div id="agent-list"></div>
</div>

<!-- 右侧详情面板 -->
<div class="detail-panel" id="detail-panel">
  <button class="detail-close" id="detail-close">&times;</button>
  <div id="detail-content"></div>
</div>

<!-- 底部讨论面板 -->
<div class="discuss-panel" id="discuss-panel">
  <div class="discuss-header">
    <div class="discuss-title" id="discuss-title">讨论记录</div>
    <div class="discuss-tabs">
      <button class="discuss-tab active" data-tab="rounds">讨论轮次</button>
      <button class="discuss-tab" data-tab="insights">跨话题洞察</button>
    </div>
    <button class="detail-close" id="discuss-close" style="position:static">&times;</button>
  </div>
  <div class="discuss-content" id="discuss-content"></div>
</div>

<!-- 天牢面板 -->
<div class="side-panel" id="jail-panel" style="left:auto;right:0;border-right:none;border-left:1px solid rgba(255,107,107,0.15);width:320px">
  <div class="side-label" style="color:#ff6b6b">天牢 / JAIL</div>
  <div id="jail-list" style="margin-bottom:16px"></div>
  <div style="border-top:1px solid rgba(255,255,255,0.06);padding-top:12px">
    <button class="top-btn" id="btn-release-all" style="width:100%;color:#66d9a0;border-color:rgba(102,217,160,0.3)">大赦天下（全部释放）</button>
  </div>
  <div id="jail-interactions" style="margin-top:16px"></div>
</div>

<!-- 放置提示 -->
<div id="place-hint" style="display:none;position:fixed;bottom:80px;left:50%;transform:translateX(-50%);z-index:200;background:rgba(200,168,130,0.9);color:#1a1a1a;padding:12px 24px;font-size:0.85rem;letter-spacing:0.05em;border-radius:4px;pointer-events:none">
  点击一个居民，将囚犯放到他/她身边
</div>

<!-- 底部提示 -->
<div class="hint-text" id="hint">左键拖拽小人抓取并移动 · 放到别人身边自动聊天 · 中键旋转 · 右键平移 · 滚轮缩放</div>

<script type="importmap">
{
  "imports": {
    "three": "https://cdn.jsdelivr.net/npm/three@0.170.0/build/three.module.js",
    "three/addons/": "https://cdn.jsdelivr.net/npm/three@0.170.0/examples/jsm/"
  }
}
</script>

<script type="module">
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

// ── 数据 ──
const agents = ${agentsJson};
const rounds = ${roundsJson};
const insights = ${insightsJson};
const relationships = ${relJson};
const meta = ${metaJson};

// ── 全局状态 ──
let isNight = false;
let autoRotate = false;
let selectedAgentId = null;
const agentMeshMap = new Map(); // agentId -> mesh
const agentPositions = new Map(); // agentId -> {x, z}
const agentWalkers = []; // 行走动画对象

// ── 场景初始化 ──
const container = document.getElementById('canvas-container');
const scene = new THREE.Scene();

const camera = new THREE.PerspectiveCamera(35, window.innerWidth / window.innerHeight, 0.1, 500);
camera.position.set(50, 40, 50);

const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.1;
container.appendChild(renderer.domElement);

// ── 控制器 ──
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.05;
controls.maxPolarAngle = Math.PI / 2.2;
controls.minDistance = 15;
controls.maxDistance = 120;
controls.target.set(0, 0, 0);
// 左键用于抓人，中键旋转，右键平移
controls.mouseButtons.LEFT = -1;       // 禁用左键控制画面
controls.mouseButtons.MIDDLE = THREE.MOUSE.ROTATE;
controls.mouseButtons.RIGHT = THREE.MOUSE.PAN;
controls.enableRotate = true;
controls.enablePan = true;

// ── 环境 ──
const ambientLight = new THREE.AmbientLight(0xfff5e6, 0.5);
scene.add(ambientLight);

const sunLight = new THREE.DirectionalLight(0xfff0dd, 1.2);
sunLight.position.set(30, 50, 20);
sunLight.castShadow = true;
sunLight.shadow.mapSize.set(2048, 2048);
sunLight.shadow.camera.left = -50;
sunLight.shadow.camera.right = 50;
sunLight.shadow.camera.top = 50;
sunLight.shadow.camera.bottom = -50;
sunLight.shadow.camera.near = 0.5;
sunLight.shadow.camera.far = 120;
sunLight.shadow.bias = -0.001;
scene.add(sunLight);

const fillLight = new THREE.DirectionalLight(0xc8d8ff, 0.3);
fillLight.position.set(-20, 30, -10);
scene.add(fillLight);

// 天空渐变
scene.background = new THREE.Color(0xdce8f0);
scene.fog = new THREE.FogExp2(0xdce8f0, 0.004);

// ── 地面 ──
const groundGeo = new THREE.PlaneGeometry(200, 200, 100, 100);
// 轻微地形起伏
const posAttr = groundGeo.attributes.position;
for (let i = 0; i < posAttr.count; i++) {
  const x = posAttr.getX(i);
  const y = posAttr.getY(i);
  const dist = Math.sqrt(x * x + y * y);
  // 中心平坦，边缘微微隆起
  const h = dist > 30 ? Math.sin(dist * 0.05) * 0.3 + Math.cos(x * 0.08 + y * 0.06) * 0.15 : 0;
  posAttr.setZ(i, h);
}
groundGeo.computeVertexNormals();

// 生成棋盘格地面纹理
const groundCanvas = document.createElement('canvas');
groundCanvas.width = 512; groundCanvas.height = 512;
const gctx = groundCanvas.getContext('2d');
gctx.fillStyle = '#d4ccb8';
gctx.fillRect(0, 0, 512, 512);
// 微妙的网格
gctx.strokeStyle = 'rgba(180,160,140,0.15)';
gctx.lineWidth = 1;
for (let i = 0; i < 512; i += 32) {
  gctx.beginPath(); gctx.moveTo(i, 0); gctx.lineTo(i, 512); gctx.stroke();
  gctx.beginPath(); gctx.moveTo(0, i); gctx.lineTo(512, i); gctx.stroke();
}
// 随机斑点
for (let i = 0; i < 300; i++) {
  gctx.fillStyle = \`rgba(\${150+Math.random()*40},\${140+Math.random()*40},\${120+Math.random()*30},0.08)\`;
  gctx.beginPath();
  gctx.arc(Math.random()*512, Math.random()*512, 1+Math.random()*3, 0, Math.PI*2);
  gctx.fill();
}
const groundTex = new THREE.CanvasTexture(groundCanvas);
groundTex.wrapS = groundTex.wrapT = THREE.RepeatWrapping;
groundTex.repeat.set(8, 8);

const groundMat = new THREE.MeshStandardMaterial({
  color: 0xd4ccb8,
  map: groundTex,
  roughness: 0.95,
  metalness: 0.0,
});
const ground = new THREE.Mesh(groundGeo, groundMat);
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
scene.add(ground);

// 草地圆形区域（中央广场外围）
const grassRingGeo = new THREE.RingGeometry(12, 60, 64);
const grassMat = new THREE.MeshStandardMaterial({
  color: 0xb8c4a0,
  roughness: 0.9,
  metalness: 0.0,
});
const grassRing = new THREE.Mesh(grassRingGeo, grassMat);
grassRing.rotation.x = -Math.PI / 2;
grassRing.position.y = 0.02;
grassRing.receiveShadow = true;
scene.add(grassRing);

// 中央广场
const plazaGeo = new THREE.CircleGeometry(10, 48);
// 广场放射纹理
const plazaCanvas = document.createElement('canvas');
plazaCanvas.width = 512; plazaCanvas.height = 512;
const pctx = plazaCanvas.getContext('2d');
pctx.fillStyle = '#e0d5c5';
pctx.fillRect(0, 0, 512, 512);
// 同心圆
for (let r = 30; r < 256; r += 30) {
  pctx.strokeStyle = 'rgba(200,168,130,0.12)';
  pctx.lineWidth = 1;
  pctx.beginPath(); pctx.arc(256, 256, r, 0, Math.PI*2); pctx.stroke();
}
// 放射线
for (let a = 0; a < Math.PI*2; a += Math.PI/8) {
  pctx.strokeStyle = 'rgba(200,168,130,0.08)';
  pctx.beginPath();
  pctx.moveTo(256, 256);
  pctx.lineTo(256 + Math.cos(a)*256, 256 + Math.sin(a)*256);
  pctx.stroke();
}
// 中心装饰
pctx.fillStyle = 'rgba(200,168,130,0.15)';
pctx.beginPath(); pctx.arc(256, 256, 20, 0, Math.PI*2); pctx.fill();

const plazaTex = new THREE.CanvasTexture(plazaCanvas);
const plazaMat = new THREE.MeshStandardMaterial({
  color: 0xe0d5c5,
  map: plazaTex,
  roughness: 0.8,
  metalness: 0.05,
});
const plaza = new THREE.Mesh(plazaGeo, plazaMat);
plaza.rotation.x = -Math.PI / 2;
plaza.position.y = 0.05;
plaza.receiveShadow = true;
scene.add(plaza);

// 广场装饰环
const plazaRingGeo = new THREE.RingGeometry(9.5, 10, 48);
const plazaRingMat = new THREE.MeshStandardMaterial({ color: 0xc8a882, roughness: 0.7 });
const plazaRing = new THREE.Mesh(plazaRingGeo, plazaRingMat);
plazaRing.rotation.x = -Math.PI / 2;
plazaRing.position.y = 0.06;
scene.add(plazaRing);

// 中央讲台
const podiumGeo = new THREE.CylinderGeometry(1.5, 2, 0.8, 8);
const podiumMat = new THREE.MeshStandardMaterial({ color: 0xc8a882, roughness: 0.5, metalness: 0.1 });
const podium = new THREE.Mesh(podiumGeo, podiumMat);
podium.position.y = 0.4;
podium.castShadow = true;
podium.receiveShadow = true;
scene.add(podium);

// 讲台顶部标识
const markerGeo = new THREE.OctahedronGeometry(0.5, 0);
const markerMat = new THREE.MeshStandardMaterial({ color: 0xc8a882, roughness: 0.3, metalness: 0.4, emissive: 0xc8a882, emissiveIntensity: 0.2 });
const marker = new THREE.Mesh(markerGeo, markerMat);
marker.position.y = 1.8;
scene.add(marker);

// ── 创建建筑 ──
function createBuilding(agent, index) {
  const group = new THREE.Group();
  const colors = agent.colors;
  const mainColor = new THREE.Color(colors.main);
  const roofColor = new THREE.Color(colors.roof);
  const accentColor = new THREE.Color(colors.accent);

  // 建筑尺寸基于人格
  const extraversion = agent.ocean.extraversion / 100;
  const openness = agent.ocean.openness / 100;
  const conscientiousness = agent.ocean.conscientiousness / 100;

  const width = 2.2 + openness * 1.2;
  const depth = 2.0 + conscientiousness * 1.0;
  const height = 2.5 + extraversion * 3.5;
  const floors = Math.max(1, Math.round(height / 1.5));

  // 主体
  const bodyGeo = new THREE.BoxGeometry(width, height, depth);
  const bodyMat = new THREE.MeshStandardMaterial({
    color: mainColor, roughness: 0.7, metalness: 0.05
  });
  const body = new THREE.Mesh(bodyGeo, bodyMat);
  body.position.y = height / 2;
  body.castShadow = true;
  body.receiveShadow = true;
  group.add(body);

  // 屋顶（尖顶或平顶随机）
  const roofType = index % 3;
  if (roofType === 0) {
    // 尖顶
    const roofGeo = new THREE.ConeGeometry(width * 0.75, 1.5, 4);
    const roofMat = new THREE.MeshStandardMaterial({ color: roofColor, roughness: 0.6 });
    const roof = new THREE.Mesh(roofGeo, roofMat);
    roof.position.y = height + 0.75;
    roof.rotation.y = Math.PI / 4;
    roof.castShadow = true;
    group.add(roof);
  } else if (roofType === 1) {
    // 平顶 + 小阁楼
    const flatRoofGeo = new THREE.BoxGeometry(width + 0.3, 0.15, depth + 0.3);
    const flatRoofMat = new THREE.MeshStandardMaterial({ color: roofColor, roughness: 0.6 });
    const flatRoof = new THREE.Mesh(flatRoofGeo, flatRoofMat);
    flatRoof.position.y = height + 0.075;
    flatRoof.castShadow = true;
    group.add(flatRoof);
    // 小阁楼
    const atticGeo = new THREE.BoxGeometry(width * 0.4, 0.8, depth * 0.4);
    const attic = new THREE.Mesh(atticGeo, new THREE.MeshStandardMaterial({ color: mainColor, roughness: 0.7 }));
    attic.position.y = height + 0.55;
    attic.castShadow = true;
    group.add(attic);
  } else {
    // 三角顶
    const triRoofGeo = new THREE.BufferGeometry();
    const hw = width / 2 + 0.2, hd = depth / 2 + 0.2, rh = 1.2;
    const verts = new Float32Array([
      -hw, 0, hd,  hw, 0, hd,  0, rh, 0,
      hw, 0, hd,  hw, 0, -hd,  0, rh, 0,
      hw, 0, -hd,  -hw, 0, -hd,  0, rh, 0,
      -hw, 0, -hd,  -hw, 0, hd,  0, rh, 0,
    ]);
    triRoofGeo.setAttribute('position', new THREE.BufferAttribute(verts, 3));
    triRoofGeo.computeVertexNormals();
    const triRoof = new THREE.Mesh(triRoofGeo, new THREE.MeshStandardMaterial({ color: roofColor, roughness: 0.6, side: THREE.DoubleSide }));
    triRoof.position.y = height;
    triRoof.castShadow = true;
    group.add(triRoof);
  }

  // 窗户
  const windowMat = new THREE.MeshStandardMaterial({
    color: 0xeef4ff, roughness: 0.1, metalness: 0.3,
    emissive: 0xfff5cc, emissiveIntensity: 0.0
  });
  for (let f = 0; f < floors; f++) {
    const wy = 0.8 + f * (height / floors);
    // 前面窗户
    for (let wx = 0; wx < 2; wx++) {
      const winGeo = new THREE.PlaneGeometry(0.4, 0.55);
      const win = new THREE.Mesh(winGeo, windowMat.clone());
      win.position.set(-0.35 + wx * 0.7, wy, depth / 2 + 0.01);
      group.add(win);
    }
    // 侧面窗户
    const sideWin = new THREE.Mesh(new THREE.PlaneGeometry(0.4, 0.55), windowMat.clone());
    sideWin.position.set(width / 2 + 0.01, wy, 0);
    sideWin.rotation.y = Math.PI / 2;
    group.add(sideWin);
  }

  // 门
  const doorGeo = new THREE.PlaneGeometry(0.5, 0.9);
  const doorMat = new THREE.MeshStandardMaterial({ color: roofColor, roughness: 0.6 });
  const door = new THREE.Mesh(doorGeo, doorMat);
  door.position.set(0, 0.45, depth / 2 + 0.01);
  group.add(door);

  // 门框装饰
  const frameGeo = new THREE.PlaneGeometry(0.6, 0.05);
  const frameMat = new THREE.MeshStandardMaterial({ color: accentColor, roughness: 0.5 });
  const frame = new THREE.Mesh(frameGeo, frameMat);
  frame.position.set(0, 0.92, depth / 2 + 0.02);
  group.add(frame);

  // 烟囱（50%概率）
  if (index % 2 === 0) {
    const chimGeo = new THREE.BoxGeometry(0.3, 1, 0.3);
    const chimMat = new THREE.MeshStandardMaterial({ color: 0x8b7b6b, roughness: 0.8 });
    const chim = new THREE.Mesh(chimGeo, chimMat);
    chim.position.set(width * 0.3, height + 0.8, -depth * 0.2);
    chim.castShadow = true;
    group.add(chim);
  }

  // 地基装饰线
  const baseGeo = new THREE.BoxGeometry(width + 0.1, 0.08, depth + 0.1);
  const baseMat = new THREE.MeshStandardMaterial({ color: accentColor, roughness: 0.5 });
  const base = new THREE.Mesh(baseGeo, baseMat);
  base.position.y = 0.04;
  group.add(base);

  // 窗台花盒（30%概率）
  if (Math.random() < 0.3 && floors > 0) {
    const boxGeo = new THREE.BoxGeometry(0.5, 0.08, 0.12);
    const boxMat = new THREE.MeshStandardMaterial({ color: 0x7b5b3b, roughness: 0.8 });
    const flowerBox = new THREE.Mesh(boxGeo, boxMat);
    flowerBox.position.set(0, 0.8, depth / 2 + 0.08);
    group.add(flowerBox);
    // 小花
    const fColors = [0xe88b8b, 0xf0c060, 0x80c0a0];
    for (let f = 0; f < 3; f++) {
      const fGeo = new THREE.SphereGeometry(0.04, 4, 3);
      const fMesh = new THREE.Mesh(fGeo, new THREE.MeshStandardMaterial({ color: fColors[f] }));
      fMesh.position.set(-0.15 + f * 0.15, 0.87, depth / 2 + 0.08);
      group.add(fMesh);
    }
  }

  // 遮阳棚（20%概率）
  if (Math.random() < 0.2) {
    const awningGeo = new THREE.PlaneGeometry(0.8, 0.4);
    const awningMat = new THREE.MeshStandardMaterial({
      color: accentColor, roughness: 0.6, side: THREE.DoubleSide
    });
    const awning = new THREE.Mesh(awningGeo, awningMat);
    awning.position.set(0, 1.0, depth / 2 + 0.2);
    awning.rotation.x = -Math.PI * 0.15;
    group.add(awning);
  }

  // 存储数据
  group.userData = { agentId: agent.id, type: 'building' };
  body.userData = { agentId: agent.id, type: 'building' };

  return group;
}

// 布局：螺旋形排列在广场周围
function layoutBuildings() {
  const total = agents.length;
  const startRadius = 16;
  const radiusStep = 7;
  const buildingsPerRing = 8;

  agents.forEach((agent, i) => {
    const ring = Math.floor(i / buildingsPerRing);
    const posInRing = i % buildingsPerRing;
    const radius = startRadius + ring * radiusStep;
    const angleStep = (Math.PI * 2) / Math.min(buildingsPerRing, total - ring * buildingsPerRing);
    const angle = posInRing * angleStep + ring * 0.5; // 偏移避免对齐

    const x = Math.cos(angle) * radius;
    const z = Math.sin(angle) * radius;

    const building = createBuilding(agent, i);
    building.position.set(x, 0, z);
    // 面朝中心
    building.lookAt(0, 0, 0);
    building.rotation.x = 0;
    building.rotation.z = 0;

    scene.add(building);
    agentMeshMap.set(agent.id, building);
    agentPositions.set(agent.id, { x, z });
  });
}
layoutBuildings();

// ── 创建树木 ──
function createTree(x, z, scale = 1) {
  const group = new THREE.Group();

  // 树干
  const trunkGeo = new THREE.CylinderGeometry(0.08 * scale, 0.15 * scale, 1.2 * scale, 6);
  const trunkMat = new THREE.MeshStandardMaterial({ color: 0x8b6914, roughness: 0.9 });
  const trunk = new THREE.Mesh(trunkGeo, trunkMat);
  trunk.position.y = 0.6 * scale;
  trunk.castShadow = true;
  group.add(trunk);

  // 树冠（2-3层球）
  const layers = 2 + Math.floor(Math.random() * 2);
  const greens = [0x6b8b4b, 0x7a9b5a, 0x5a7b3b, 0x8ba86b];
  for (let l = 0; l < layers; l++) {
    const r = (0.8 - l * 0.15) * scale;
    const crownGeo = new THREE.SphereGeometry(r, 6, 5);
    const crownMat = new THREE.MeshStandardMaterial({
      color: greens[l % greens.length], roughness: 0.85, metalness: 0.0
    });
    const crown = new THREE.Mesh(crownGeo, crownMat);
    crown.position.y = (1.3 + l * 0.55) * scale;
    crown.castShadow = true;
    group.add(crown);
  }

  group.position.set(x, 0, z);
  return group;
}

// 在建筑之间随机种树
function plantTrees() {
  const treePositions = [];
  const numTrees = 50;

  for (let i = 0; i < numTrees; i++) {
    let x, z, valid;
    let attempts = 0;
    do {
      const angle = Math.random() * Math.PI * 2;
      const r = 12 + Math.random() * 45;
      x = Math.cos(angle) * r;
      z = Math.sin(angle) * r;
      valid = true;
      // 不要和建筑重叠
      for (const [, pos] of agentPositions) {
        if (Math.sqrt((x - pos.x) ** 2 + (z - pos.z) ** 2) < 4) {
          valid = false; break;
        }
      }
      // 不要和其他树重叠
      for (const tp of treePositions) {
        if (Math.sqrt((x - tp.x) ** 2 + (z - tp.z) ** 2) < 2.5) {
          valid = false; break;
        }
      }
      attempts++;
    } while (!valid && attempts < 20);

    if (valid) {
      const scale = 0.7 + Math.random() * 0.8;
      scene.add(createTree(x, z, scale));
      treePositions.push({ x, z });
    }
  }
}
plantTrees();

// ── 创建道路（从建筑到中心的路径） ──
function createPaths() {
  const pathMat = new THREE.MeshStandardMaterial({
    color: 0xd4c8b4, roughness: 0.85, metalness: 0.0
  });

  for (const [, pos] of agentPositions) {
    const dx = -pos.x;
    const dz = -pos.z;
    const dist = Math.sqrt(dx * dx + dz * dz);
    const angle = Math.atan2(dz, dx);

    // 只画到广场边缘
    const pathLen = dist - 10;
    if (pathLen <= 0) continue;

    const pathGeo = new THREE.PlaneGeometry(0.8, pathLen);
    const path = new THREE.Mesh(pathGeo, pathMat);
    path.rotation.x = -Math.PI / 2;
    path.rotation.z = -angle + Math.PI / 2;
    path.position.set(
      pos.x + dx / dist * (pathLen / 2 + 2),
      0.04,
      pos.z + dz / dist * (pathLen / 2 + 2)
    );
    path.receiveShadow = true;
    scene.add(path);
  }
}
createPaths();

// ── 路灯 ──
function createLampPost(x, z) {
  const group = new THREE.Group();

  // 灯杆
  const poleGeo = new THREE.CylinderGeometry(0.04, 0.06, 2.5, 6);
  const poleMat = new THREE.MeshStandardMaterial({ color: 0x4a4a4a, roughness: 0.5, metalness: 0.3 });
  const pole = new THREE.Mesh(poleGeo, poleMat);
  pole.position.y = 1.25;
  pole.castShadow = true;
  group.add(pole);

  // 灯头
  const headGeo = new THREE.SphereGeometry(0.18, 8, 6);
  const headMat = new THREE.MeshStandardMaterial({
    color: 0xfff5cc, roughness: 0.2,
    emissive: 0xfff0aa, emissiveIntensity: 0.3
  });
  const head = new THREE.Mesh(headGeo, headMat);
  head.position.y = 2.6;
  group.add(head);

  // 点光源
  const pointLight = new THREE.PointLight(0xffeedd, 0.5, 8, 2);
  pointLight.position.y = 2.6;
  group.add(pointLight);

  group.position.set(x, 0, z);
  group.userData = { type: 'lamp', pointLight };
  return group;
}

// 广场周围放路灯
const lampPosts = [];
for (let i = 0; i < 8; i++) {
  const angle = (i / 8) * Math.PI * 2;
  const lamp = createLampPost(Math.cos(angle) * 11, Math.sin(angle) * 11);
  scene.add(lamp);
  lampPosts.push(lamp);
}

// ── 长椅 ──
function createBench(x, z, rotY) {
  const group = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ color: 0x8b6914, roughness: 0.8 });

  // 座面
  const seatGeo = new THREE.BoxGeometry(1.2, 0.06, 0.35);
  const seat = new THREE.Mesh(seatGeo, mat);
  seat.position.y = 0.4;
  seat.castShadow = true;
  group.add(seat);

  // 腿
  for (let lx = -0.5; lx <= 0.5; lx += 1) {
    const legGeo = new THREE.BoxGeometry(0.06, 0.4, 0.06);
    const leg = new THREE.Mesh(legGeo, mat);
    leg.position.set(lx, 0.2, 0.12);
    group.add(leg);
    const leg2 = leg.clone();
    leg2.position.z = -0.12;
    group.add(leg2);
  }

  // 靠背
  const backGeo = new THREE.BoxGeometry(1.2, 0.4, 0.04);
  const back = new THREE.Mesh(backGeo, mat);
  back.position.set(0, 0.62, -0.16);
  back.castShadow = true;
  group.add(back);

  group.position.set(x, 0, z);
  group.rotation.y = rotY;
  return group;
}

// 广场边放长椅
for (let i = 0; i < 6; i++) {
  const angle = (i / 6) * Math.PI * 2 + 0.3;
  scene.add(createBench(Math.cos(angle) * 8.5, Math.sin(angle) * 8.5, angle + Math.PI / 2));
}

// ── 水池/喷泉（广场一侧）──
function createFountain() {
  const group = new THREE.Group();

  // 水池底座
  const basinGeo = new THREE.CylinderGeometry(2, 2.2, 0.5, 16);
  const basinMat = new THREE.MeshStandardMaterial({ color: 0xc8c0b0, roughness: 0.6, metalness: 0.1 });
  const basin = new THREE.Mesh(basinGeo, basinMat);
  basin.position.y = 0.25;
  basin.castShadow = true;
  basin.receiveShadow = true;
  group.add(basin);

  // 水面
  const waterGeo = new THREE.CircleGeometry(1.8, 24);
  const waterMat = new THREE.MeshStandardMaterial({
    color: 0x88bbdd, roughness: 0.1, metalness: 0.3,
    transparent: true, opacity: 0.7
  });
  const water = new THREE.Mesh(waterGeo, waterMat);
  water.rotation.x = -Math.PI / 2;
  water.position.y = 0.52;
  group.add(water);

  // 中央柱子
  const pillarGeo = new THREE.CylinderGeometry(0.15, 0.2, 1.5, 8);
  const pillar = new THREE.Mesh(pillarGeo, basinMat);
  pillar.position.y = 1;
  pillar.castShadow = true;
  group.add(pillar);

  // 顶部球
  const topGeo = new THREE.SphereGeometry(0.25, 8, 6);
  const topMat = new THREE.MeshStandardMaterial({ color: 0xc8a882, roughness: 0.3, metalness: 0.2 });
  const top = new THREE.Mesh(topGeo, topMat);
  top.position.y = 1.85;
  group.add(top);

  group.position.set(5, 0, -5);
  return group;
}
scene.add(createFountain());

// ── 花坛（广场装饰）──
function createFlowerBed(x, z, radius) {
  const group = new THREE.Group();
  // 花坛边框
  const ringGeo = new THREE.TorusGeometry(radius, 0.08, 6, 16);
  const ringMat = new THREE.MeshStandardMaterial({ color: 0xa09080, roughness: 0.7 });
  const ring = new THREE.Mesh(ringGeo, ringMat);
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.08;
  group.add(ring);
  // 泥土
  const dirtGeo = new THREE.CircleGeometry(radius - 0.05, 16);
  const dirtMat = new THREE.MeshStandardMaterial({ color: 0x8b7355, roughness: 0.95 });
  const dirt = new THREE.Mesh(dirtGeo, dirtMat);
  dirt.rotation.x = -Math.PI / 2;
  dirt.position.y = 0.06;
  group.add(dirt);
  // 花朵
  const flowerColors = [0xe88b8b, 0xf0c060, 0xb088d0, 0xf0a0b0, 0x80c0a0];
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 + Math.random() * 0.3;
    const r = radius * 0.5 + Math.random() * radius * 0.3;
    const fGeo = new THREE.SphereGeometry(0.08 + Math.random() * 0.06, 5, 4);
    const fMat = new THREE.MeshStandardMaterial({
      color: flowerColors[i % flowerColors.length], roughness: 0.7
    });
    const flower = new THREE.Mesh(fGeo, fMat);
    flower.position.set(Math.cos(a) * r, 0.12 + Math.random() * 0.08, Math.sin(a) * r);
    group.add(flower);
    // 茎
    const stemGeo = new THREE.CylinderGeometry(0.01, 0.01, 0.12, 4);
    const stemMat = new THREE.MeshStandardMaterial({ color: 0x5a8040 });
    const stem = new THREE.Mesh(stemGeo, stemMat);
    stem.position.set(Math.cos(a) * r, 0.06, Math.sin(a) * r);
    group.add(stem);
  }
  group.position.set(x, 0, z);
  return group;
}
// 在广场边缘放几个花坛
scene.add(createFlowerBed(-6, 7, 0.8));
scene.add(createFlowerBed(7, 6, 0.7));
scene.add(createFlowerBed(-7, -5, 0.9));

// ── 石头装饰 ──
function createRock(x, z, scale) {
  const geo = new THREE.DodecahedronGeometry(0.3 * scale, 0);
  // 随机变形
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    pos.setXYZ(i,
      pos.getX(i) * (0.7 + Math.random() * 0.6),
      pos.getY(i) * (0.5 + Math.random() * 0.5),
      pos.getZ(i) * (0.7 + Math.random() * 0.6)
    );
  }
  geo.computeVertexNormals();
  const mat = new THREE.MeshStandardMaterial({
    color: 0x9a9080, roughness: 0.9, metalness: 0.0
  });
  const rock = new THREE.Mesh(geo, mat);
  rock.position.set(x, 0.1 * scale, z);
  rock.rotation.y = Math.random() * Math.PI;
  rock.castShadow = true;
  return rock;
}
// 散落的石头
for (let i = 0; i < 15; i++) {
  const angle = Math.random() * Math.PI * 2;
  const r = 20 + Math.random() * 35;
  scene.add(createRock(Math.cos(angle) * r, Math.sin(angle) * r, 0.5 + Math.random() * 1.5));
}

// ── 云朵（高空浮动）──
function createCloud(x, y, z) {
  const group = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({
    color: 0xffffff, roughness: 1, metalness: 0,
    transparent: true, opacity: 0.25
  });
  const count = 3 + Math.floor(Math.random() * 2);
  for (let i = 0; i < count; i++) {
    const r = 0.6 + Math.random() * 1.0;
    const geo = new THREE.SphereGeometry(r, 6, 5);
    const puff = new THREE.Mesh(geo, mat);
    puff.position.set(i * 1.2 - count * 0.6, Math.random() * 0.3, Math.random() * 0.5);
    puff.scale.y = 0.4 + Math.random() * 0.2;
    group.add(puff);
  }
  group.position.set(x, y, z);
  group.userData = { type: 'cloud', speed: 0.003 + Math.random() * 0.004 };
  return group;
}
const clouds = [];
for (let i = 0; i < 6; i++) {
  const cloud = createCloud(
    -50 + Math.random() * 100,
    32 + Math.random() * 12,
    -30 + Math.random() * 60
  );
  scene.add(cloud);
  clouds.push(cloud);
}

// ── 粒子系统（漂浮微光）──
const particleCount = 200;
const particlesGeo = new THREE.BufferGeometry();
const particlePositions = new Float32Array(particleCount * 3);
const particleSpeeds = new Float32Array(particleCount);
for (let i = 0; i < particleCount; i++) {
  particlePositions[i * 3] = (Math.random() - 0.5) * 100;
  particlePositions[i * 3 + 1] = 2 + Math.random() * 15;
  particlePositions[i * 3 + 2] = (Math.random() - 0.5) * 100;
  particleSpeeds[i] = 0.002 + Math.random() * 0.005;
}
particlesGeo.setAttribute('position', new THREE.BufferAttribute(particlePositions, 3));
const particlesMat = new THREE.PointsMaterial({
  color: 0xffeedd, size: 0.08, transparent: true, opacity: 0.4,
  blending: THREE.AdditiveBlending, depthWrite: false
});
const particles = new THREE.Points(particlesGeo, particlesMat);
scene.add(particles);

// ── 围栏（广场外围小段）──
function createFence(startX, startZ, endX, endZ) {
  const group = new THREE.Group();
  const dx = endX - startX;
  const dz = endZ - startZ;
  const len = Math.sqrt(dx * dx + dz * dz);
  const posts = Math.floor(len / 1.2);
  const postMat = new THREE.MeshStandardMaterial({ color: 0x8b7b6b, roughness: 0.8 });

  for (let i = 0; i <= posts; i++) {
    const t = i / posts;
    const postGeo = new THREE.CylinderGeometry(0.04, 0.05, 0.7, 5);
    const post = new THREE.Mesh(postGeo, postMat);
    post.position.set(startX + dx * t, 0.35, startZ + dz * t);
    post.castShadow = true;
    group.add(post);
  }
  // 横杆
  const railGeo = new THREE.CylinderGeometry(0.02, 0.02, len, 4);
  const rail = new THREE.Mesh(railGeo, postMat);
  rail.position.set((startX + endX) / 2, 0.55, (startZ + endZ) / 2);
  rail.rotation.z = Math.PI / 2;
  rail.rotation.y = Math.atan2(dz, dx);
  // 需要旋转到正确方向
  const angle = Math.atan2(dz, dx);
  rail.rotation.set(0, 0, 0);
  rail.lookAt(endX, 0.55, endZ);
  rail.rotateX(Math.PI / 2);
  group.add(rail);

  return group;
}
// 几段装饰围栏
scene.add(createFence(-15, 13, -8, 13));
scene.add(createFence(8, -13, 15, -13));

// ── Agent 行走小人 ──
function createWalker(agent) {
  const group = new THREE.Group();
  const color = new THREE.Color(agent.colors.main);

  // 身体（胶囊状）
  const bodyGeo = new THREE.CapsuleGeometry(0.15, 0.4, 4, 8);
  const bodyMat = new THREE.MeshStandardMaterial({ color, roughness: 0.6 });
  const body = new THREE.Mesh(bodyGeo, bodyMat);
  body.position.y = 0.55;
  body.castShadow = true;
  group.add(body);

  // 头
  const headGeo = new THREE.SphereGeometry(0.15, 8, 6);
  const headMat = new THREE.MeshStandardMaterial({ color: 0xf5deb3, roughness: 0.6 });
  const head = new THREE.Mesh(headGeo, headMat);
  head.position.y = 0.95;
  head.castShadow = true;
  group.add(head);

  // 初始位置（建筑附近）
  const pos = agentPositions.get(agent.id);
  if (pos) {
    group.position.set(pos.x + (Math.random() - 0.5) * 3, 0, pos.z + (Math.random() - 0.5) * 3);
  }

  group.userData = { agentId: agent.id, type: 'walker' };
  return group;
}

// 行走动画控制器
class WalkerController {
  constructor(mesh, agent) {
    this.mesh = mesh;
    this.agent = agent;
    this.homePos = agentPositions.get(agent.id) || { x: 0, z: 0 };
    this.target = this.pickTarget();
    this.speed = (0.005 + Math.random() * 0.01) * 0.2; // 速度降到 1/5
    this.waitTime = 0;
    this.bobPhase = Math.random() * Math.PI * 2;
    // 悬停效果
    this.frozen = false;
    this.hoverAmount = 0;
    this.groundX = mesh.position.x;
    this.groundZ = mesh.position.z;
    // 抓取 & 拖拽
    this.captured = false;       // 是否被抓
    this.dragging = false;       // 正在被拖拽
    // 气泡
    this.bubble = null;          // Sprite 气泡
    this.bubbleTimer = 0;        // 气泡倒计时
    this.chatCooldown = 0;       // 聊天冷却
  }

  pickTarget() {
    const r = Math.random();
    if (r < 0.4) {
      const a = Math.random() * Math.PI * 2;
      return { x: Math.cos(a) * (3 + Math.random() * 6), z: Math.sin(a) * (3 + Math.random() * 6) };
    } else if (r < 0.7) {
      return { x: this.homePos.x + (Math.random() - 0.5) * 2, z: this.homePos.z + (Math.random() - 0.5) * 2 };
    } else {
      const a = Math.random() * Math.PI * 2;
      const d = 8 + Math.random() * 25;
      return { x: Math.cos(a) * d, z: Math.sin(a) * d };
    }
  }

  update(dt) {
    const t = performance.now() * 0.001;

    // ── 气泡倒计时 ──
    if (this.bubbleTimer > 0) {
      this.bubbleTimer -= dt;
      if (this.bubbleTimer <= 0 && this.bubble) {
        this.mesh.remove(this.bubble);
        this.bubble.material.map?.dispose();
        this.bubble.material.dispose();
        this.bubble = null;
      }
    }
    if (this.chatCooldown > 0) this.chatCooldown -= dt;

    // ── 被拖拽中 ──
    if (this.dragging) {
      this.mesh.position.y = 1.5;
      const s = 1.4;
      this.mesh.scale.set(s, s, s);
      this.mesh.rotation.z = Math.sin(t * 12) * 0.08;
      return;
    }

    // ── 被抓但不在拖拽（放下后） ──
    if (this.captured && !this.dragging) {
      // 抓住后在原地微浮 + 颤抖
      this.mesh.position.y = 0.3 + Math.sin(t * 2) * 0.1;
      this.mesh.rotation.z = Math.sin(t * 15) * 0.02;
      this.mesh.scale.set(1.15, 1.15, 1.15);

      // 尝试和附近的人聊天
      if (this.chatCooldown <= 0) {
        this.tryChat();
      }
      return;
    }

    // ── 悬停效果插值 ──
    const targetHover = this.frozen ? 1 : 0;
    this.hoverAmount += (targetHover - this.hoverAmount) * 0.08;

    if (this.hoverAmount > 0.01) {
      const h = this.hoverAmount;
      const floatY = h * (1.2 + Math.sin(t * 3) * 0.15);
      const s = 1 + h * 0.5;
      this.mesh.scale.set(s, s, s);
      const tremble = h * 0.04;
      this.mesh.position.x = this.groundX + Math.sin(t * 25) * tremble;
      this.mesh.position.z = this.groundZ + Math.cos(t * 19) * tremble;
      this.mesh.position.y = floatY;
      this.mesh.rotation.z = Math.sin(t * 18) * h * 0.06;
      this.mesh.rotation.x = Math.cos(t * 14) * h * 0.04;
      return;
    }

    // 回归正常
    this.mesh.scale.set(1, 1, 1);
    this.mesh.rotation.z = 0;
    this.mesh.rotation.x = 0;

    if (this.waitTime > 0) { this.waitTime -= dt; return; }

    const dx = this.target.x - this.mesh.position.x;
    const dz = this.target.z - this.mesh.position.z;
    const dist = Math.sqrt(dx * dx + dz * dz);

    if (dist < 0.5) {
      this.target = this.pickTarget();
      this.waitTime = 2 + Math.random() * 5;
      return;
    }

    const moveX = (dx / dist) * this.speed * dt;
    const moveZ = (dz / dist) * this.speed * dt;
    this.mesh.position.x += moveX;
    this.mesh.position.z += moveZ;
    this.groundX = this.mesh.position.x;
    this.groundZ = this.mesh.position.z;
    this.mesh.rotation.y = Math.atan2(dx, dz);
    this.bobPhase += dt * 0.008;
    this.mesh.position.y = Math.abs(Math.sin(this.bobPhase)) * 0.06;
  }

  // 尝试和附近的行走者聊天
  tryChat() {
    const myPos = this.mesh.position;
    let nearest = null;
    let nearDist = Infinity;
    for (const w of agentWalkers) {
      if (w === this) continue;
      const d = myPos.distanceTo(w.mesh.position);
      if (d < 6 && d < nearDist) { nearest = w; nearDist = d; }
    }
    if (!nearest) return;

    // 两人都说话
    this.showBubble(pickChatLine(this.agent, nearest.agent));
    setTimeout(() => {
      nearest.showBubble(pickChatLine(nearest.agent, this.agent));
    }, 1500);
    this.chatCooldown = 8000 + Math.random() * 5000; // 8-13 秒冷却
  }

  // 显示气泡
  showBubble(text) {
    if (this.bubble) {
      this.mesh.remove(this.bubble);
      this.bubble.material.map?.dispose();
      this.bubble.material.dispose();
    }
    this.bubble = createBubbleSprite(text);
    this.bubble.position.set(0, 1.8, 0);
    this.mesh.add(this.bubble);
    this.bubbleTimer = 4000; // 4 秒后消失
  }
}

// ── 气泡 Sprite 生成 ──
function createBubbleSprite(text) {
  const cv = document.createElement('canvas');
  cv.width = 512; cv.height = 160;
  const cx = cv.getContext('2d');

  // 气泡背景
  cx.fillStyle = 'rgba(255,255,255,0.92)';
  const pad = 16, r = 12;
  cx.beginPath();
  cx.moveTo(pad + r, pad); cx.lineTo(cv.width - pad - r, pad);
  cx.quadraticCurveTo(cv.width - pad, pad, cv.width - pad, pad + r);
  cx.lineTo(cv.width - pad, cv.height - 40 - r);
  cx.quadraticCurveTo(cv.width - pad, cv.height - 40, cv.width - pad - r, cv.height - 40);
  cx.lineTo(pad + r, cv.height - 40);
  cx.quadraticCurveTo(pad, cv.height - 40, pad, cv.height - 40 - r);
  cx.lineTo(pad, pad + r);
  cx.quadraticCurveTo(pad, pad, pad + r, pad);
  cx.closePath();
  cx.fill();
  // 小三角
  cx.beginPath();
  cx.moveTo(cv.width / 2 - 10, cv.height - 40);
  cx.lineTo(cv.width / 2, cv.height - 20);
  cx.lineTo(cv.width / 2 + 10, cv.height - 40);
  cx.fill();
  // 边框
  cx.strokeStyle = 'rgba(200,168,130,0.5)'; cx.lineWidth = 2; cx.stroke();

  // 文字
  cx.fillStyle = '#2d2d2d';
  cx.font = '26px "Noto Sans SC", sans-serif';
  cx.textAlign = 'center'; cx.textBaseline = 'middle';
  // 自动换行
  const maxW = cv.width - 48;
  const lines = [];
  let line = '';
  for (const ch of text) {
    if (cx.measureText(line + ch).width > maxW) { lines.push(line); line = ch; }
    else line += ch;
  }
  if (line) lines.push(line);
  const lh = 32;
  const startY = (cv.height - 40) / 2 - (lines.length - 1) * lh / 2;
  lines.forEach((l, i) => cx.fillText(l, cv.width / 2, startY + i * lh));

  const tex = new THREE.CanvasTexture(cv);
  const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false });
  const sprite = new THREE.Sprite(mat);
  sprite.scale.set(4, 1.25, 1);
  return sprite;
}

// ── 聊天内容生成（基于新闻 + 人格） ──
const townNewsLines = ${newsJson};

function pickChatLine(speaker, listener) {
  const news = townNewsLines[Math.floor(Math.random() * townNewsLines.length)];
  // 去掉 emoji 前缀
  const cleanNews = news.replace(/^[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]+\\s*/u, '').slice(0, 20);
  const mbti = speaker.mbti || 'ENFP';
  const lines = {
    INTJ: [speaker.name + '："' + cleanNews + '"……这背后有规律。', speaker.name + '：从数据看，' + cleanNews + '是必然的。'],
    INTP: [speaker.name + '："' + cleanNews + '"？有意思，三种可能。', speaker.name + '：如果' + cleanNews + '，那说明……'],
    ENTJ: [speaker.name + '：' + cleanNews + '——我们该行动了。', speaker.name + '：关于' + cleanNews + '，第一步是……'],
    ENTP: [speaker.name + '：哈！' + cleanNews + '！反过来想呢？', speaker.name + '：' + listener.name + '你听说了吗？' + cleanNews + '！'],
    INFJ: [speaker.name + '：' + cleanNews + '……我觉得这是个信号。', speaker.name + '：' + listener.name + '，' + cleanNews + '你怎么看？'],
    INFP: [speaker.name + '：' + cleanNews + '让我想到了一些事……', speaker.name + '：如果' + cleanNews + '是真的，那太好了。'],
    ENFJ: [speaker.name + '：大家注意！' + cleanNews + '！', speaker.name + '：' + listener.name + '，' + cleanNews + '我们一起想办法。'],
    ENFP: [speaker.name + '：天啊！' + cleanNews + '！太棒了！', speaker.name + '：' + listener.name + '！' + cleanNews + '，走起！'],
    ISTJ: [speaker.name + '：' + cleanNews + '，按流程处理。', speaker.name + '：关于' + cleanNews + '，规章怎么说的？'],
    ISFJ: [speaker.name + '：' + cleanNews + '，大家没事吧？', speaker.name + '：' + listener.name + '辛苦了，' + cleanNews + '别着急。'],
    ESTJ: [speaker.name + '：' + cleanNews + '——谁负责？', speaker.name + '：' + cleanNews + '这事效率太低了。'],
    ESFJ: [speaker.name + '：' + cleanNews + '！我帮你问了！', speaker.name + '：' + listener.name + '，' + cleanNews + '，大家都支持！'],
    ISTP: [speaker.name + '：' + cleanNews + '。嗯。', speaker.name + '：……' + cleanNews + '，看代码吧。'],
    ISFP: [speaker.name + '：' + cleanNews + '……好美。', speaker.name + '：' + cleanNews + '让我有了灵感。'],
    ESTP: [speaker.name + '：' + cleanNews + '？交给我！', speaker.name + '：' + cleanNews + '，先干再说。'],
    ESFP: [speaker.name + '：哈哈！' + cleanNews + '！搞起！', speaker.name + '：' + listener.name + '！' + cleanNews + '太有趣了！'],
  };
  const opts = lines[mbti] || [speaker.name + '：' + cleanNews + '，你怎么看？'];
  return opts[Math.floor(Math.random() * opts.length)];
}

// ── 拖拽系统 ──
let draggingWalker = null;   // 当前拖拽的 WalkerController
const dragPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0); // Y=0 平面
const dragIntersect = new THREE.Vector3();

renderer.domElement.addEventListener('mousedown', (e) => {
  if (e.button !== 0) return; // 只响应左键
  if (e.target.closest('.top-bar, .side-panel, .detail-panel, .discuss-panel, #jail-panel')) return;

  raycaster.setFromCamera(mouse, camera);
  // 检测行走者
  const walkerMeshes = [];
  agentWalkers.forEach(w => {
    w.mesh.traverse(child => { if (child.isMesh) walkerMeshes.push(child); });
  });
  const hits = raycaster.intersectObjects(walkerMeshes, false);
  if (hits.length > 0) {
    let obj = hits[0].object;
    while (obj && !obj.userData?.agentId) obj = obj.parent;
    if (obj?.userData?.agentId) {
      const w = agentWalkers.find(w => w.agent.id === obj.userData.agentId);
      if (w) {
        // 抓住！
        if (!w.captured) {
          w.captured = true;
          captureAgent(w.agent.id);
        }
        w.dragging = true;
        draggingWalker = w;
        controls.enabled = false; // 拖拽时禁用相机控制
        e.preventDefault();
      }
    }
  }
});

renderer.domElement.addEventListener('mousemove', (e) => {
  if (!draggingWalker) return;
  raycaster.setFromCamera(mouse, camera);
  if (raycaster.ray.intersectPlane(dragPlane, dragIntersect)) {
    draggingWalker.mesh.position.x = dragIntersect.x;
    draggingWalker.mesh.position.z = dragIntersect.z;
    draggingWalker.groundX = dragIntersect.x;
    draggingWalker.groundZ = dragIntersect.z;
  }
});

renderer.domElement.addEventListener('mouseup', (e) => {
  if (!draggingWalker) return;
  draggingWalker.dragging = false;
  draggingWalker.chatCooldown = 0; // 放下后立即尝试聊天
  draggingWalker = null;
  controls.enabled = true;
});

// 所有 Agent 都有行走者
for (let i = 0; i < agents.length; i++) {
  const walkerMesh = createWalker(agents[i]);
  scene.add(walkerMesh);
  agentWalkers.push(new WalkerController(walkerMesh, agents[i]));
}

// ── 名牌（建筑上方浮动文字用 Sprite）──
function createNameSprite(text, mbti, color) {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');

  // 测量文字宽度
  ctx.font = 'bold 40px sans-serif';
  const nameW = ctx.measureText(text).width;
  ctx.font = '28px sans-serif';
  const mbtiW = ctx.measureText(mbti).width;
  const totalW = nameW + mbtiW + 50;
  const boxX = (512 - totalW) / 2;

  // 背景板
  ctx.fillStyle = 'rgba(10,10,10,0.75)';
  ctx.fillRect(boxX, 24, totalW, 72);
  // 暖色顶线
  ctx.fillStyle = color;
  ctx.fillRect(boxX, 24, totalW, 4);
  // 名字
  ctx.font = 'bold 40px sans-serif';
  ctx.fillStyle = '#ffffff';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, boxX + 16, 62);
  // MBTI
  ctx.font = '28px sans-serif';
  ctx.fillStyle = color;
  ctx.fillText(mbti, boxX + nameW + 30, 62);

  const tex = new THREE.CanvasTexture(canvas);
  tex.minFilter = THREE.LinearFilter;
  const spriteMat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false });
  const sprite = new THREE.Sprite(spriteMat);
  sprite.scale.set(6, 1.5, 1);
  return sprite;
}

// 为每栋建筑添加名牌
agents.forEach(agent => {
  const building = agentMeshMap.get(agent.id);
  if (!building) return;
  const sprite = createNameSprite(agent.name, agent.mbti, agent.colors.accent);
  const extraversion = agent.ocean.extraversion / 100;
  const height = 2.5 + extraversion * 3.5;
  sprite.position.y = height + 2.5;
  building.add(sprite);
});

// ── Raycaster 交互 ──
const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();
let hoveredBuilding = null;

function onPointerMove(e) {
  mouse.x = (e.clientX / window.innerWidth) * 2 - 1;
  mouse.y = -(e.clientY / window.innerHeight) * 2 + 1;
}

// ── 抓人系统 ──
let captureMode = true; // 默认抓人模式
let placingPrisoner = null; // 正在放置的囚犯 ID
const jailSet = new Set(); // 被抓的 Agent ID 集合
const jailData = new Map(); // agentId -> { name, mbti, capturedAt, confession }

// 被抓建筑的视觉效果 — 铁栏笼罩
const jailCages = new Map(); // agentId -> cage mesh
function addJailCage(agentId) {
  const building = agentMeshMap.get(agentId);
  if (!building || jailCages.has(agentId)) return;

  // 创建铁栏效果（透明红色线框盒）
  const bbox = new THREE.Box3().setFromObject(building);
  const size = new THREE.Vector3();
  bbox.getSize(size);
  const geo = new THREE.BoxGeometry(size.x + 1, size.y + 2, size.z + 1);
  const mat = new THREE.MeshBasicMaterial({
    color: 0xff4444,
    wireframe: true,
    transparent: true,
    opacity: 0.5,
  });
  const cage = new THREE.Mesh(geo, mat);
  cage.position.copy(building.position);
  cage.position.y = size.y / 2;
  scene.add(cage);
  jailCages.set(agentId, cage);
}

function removeJailCage(agentId) {
  const cage = jailCages.get(agentId);
  if (cage) {
    scene.remove(cage);
    cage.geometry.dispose();
    cage.material.dispose();
    jailCages.delete(agentId);
  }
}

// 基于 MBTI 生成牢房反省
function generateConfessionLocal(name, mbti) {
  const c = {
    INTJ: name + ' 冷静地坐在角落，分析为什么会被抓……',
    INTP: name + ' 好奇地研究牢房的锁结构。',
    ENTJ: name + ' 对着铁栏喊："不合理！我要见管理层！"',
    ENTP: name + ' 笑着说："被抓了？来，谁要辩论？"',
    INFJ: name + ' 安静地反思："也许这是命运的安排。"',
    INFP: name + ' 望着窗外："身在笼中，思想自由。"',
    ENFJ: name + ' 号召大家在牢里搞读书会。',
    ENFP: name + ' 兴奋地说："监狱生活可以写故事！"',
    ISTJ: name + ' 问："这里的作息时间表是什么？"',
    ISFJ: name + ' 关心旁边的人："你还好吗？"',
    ESTJ: name + ' 大声投诉："抓人需要走手续！"',
    ESFJ: name + ' 帮大家分配牢房空间。',
    ISTP: name + ' 默默检查牢房结构，寻找弱点。',
    ISFP: name + ' 在墙上刻了一朵小花。',
    ESTP: name + ' 在牢房做俯卧撑："不浪费时间。"',
    ESFP: name + ' 在牢里搞才艺秀，气氛意外地好。',
  };
  return c[mbti] || name + ' 坐在牢房里，若有所思。';
}

// 抓人
function captureAgent(agentId) {
  if (jailSet.has(agentId)) return;
  const agent = agents.find(a => a.id === agentId);
  if (!agent) return;

  jailSet.add(agentId);
  jailData.set(agentId, {
    name: agent.name,
    mbti: agent.mbti,
    capturedAt: new Date().toLocaleTimeString('zh-CN'),
    confession: generateConfessionLocal(agent.name, agent.mbti),
  });

  // 视觉效果
  addJailCage(agentId);

  // 更新 UI
  updateJailUI();

  // 弹出抓获提示
  showCaptureToast(agent.name);

  // 调用后端 API（如果有服务器）
  fetch('/api/town/capture', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      userId: localStorage.getItem('userId') || 'god-player',
      agentIds: [agentId],
      reason: '上帝点击抓获',
    }),
  }).catch(() => {}); // 静默失败
}

// 放人
function releaseAgent(agentId) {
  jailSet.delete(agentId);
  jailData.delete(agentId);
  removeJailCage(agentId);
  updateJailUI();
}

// 大赦天下
function releaseAll() {
  for (const id of [...jailSet]) releaseAgent(id);
  fetch('/api/town/release', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      userId: localStorage.getItem('userId') || 'god-player',
      agentIds: [],
    }),
  }).catch(() => {});
}

// 抓获提示动画
function showCaptureToast(name) {
  const toast = document.createElement('div');
  toast.style.cssText = 'position:fixed;top:70px;left:50%;transform:translateX(-50%);z-index:300;background:rgba(255,68,68,0.9);color:#fff;padding:10px 24px;font-size:0.85rem;letter-spacing:0.1em;border-radius:4px;animation:fadeInOut 2s ease forwards;pointer-events:none';
  toast.textContent = '🔒 抓住了 ' + name + '！';
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 2000);
}

// 更新牢房 UI
function updateJailUI() {
  document.getElementById('jail-count').textContent = jailSet.size;
  const list = document.getElementById('jail-list');
  if (!list) return;

  if (jailSet.size === 0) {
    list.innerHTML = '<div style="color:rgba(255,255,255,0.3);font-size:0.8rem;padding:16px 0;text-align:center">牢里空荡荡的</div>';
    return;
  }

  list.innerHTML = '';
  for (const [agentId, data] of jailData) {
    const agent = agents.find(a => a.id === agentId);
    const el = document.createElement('div');
    el.style.cssText = 'padding:10px;margin-bottom:6px;background:rgba(255,68,68,0.06);border:1px solid rgba(255,68,68,0.15);border-radius:4px;cursor:pointer';
    el.innerHTML = \`
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px">
        <span style="font-size:0.88rem;color:#ff8888">\${data.name}</span>
        <div style="display:flex;gap:4px">
          <button class="jail-place-btn" data-id="\${agentId}" style="font-size:0.65rem;padding:2px 8px;background:rgba(200,168,130,0.15);border:1px solid rgba(200,168,130,0.3);color:var(--warm);cursor:pointer;border-radius:2px">放到身边</button>
          <button class="jail-release-btn" data-id="\${agentId}" style="font-size:0.65rem;padding:2px 8px;background:rgba(102,217,160,0.1);border:1px solid rgba(102,217,160,0.3);color:#66d9a0;cursor:pointer;border-radius:2px">释放</button>
        </div>
      </div>
      <div style="font-size:0.72rem;color:rgba(255,255,255,0.4)">\${data.mbti} · \${data.capturedAt}</div>
      <div style="font-size:0.75rem;color:rgba(255,255,255,0.5);margin-top:4px;font-style:italic">\${data.confession}</div>
    \`;
    list.appendChild(el);
  }

  // 释放按钮事件
  list.querySelectorAll('.jail-release-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      releaseAgent(btn.dataset.id);
    });
  });

  // 放到身边按钮事件
  list.querySelectorAll('.jail-place-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      placingPrisoner = btn.dataset.id;
      document.getElementById('place-hint').style.display = 'block';
      document.getElementById('jail-panel').classList.remove('open');
    });
  });
}

// 放置囚犯到目标身边（触发互动）
async function placePrisonerNear(prisonerId, targetAgentId) {
  const prisoner = agents.find(a => a.id === prisonerId);
  const target = agents.find(a => a.id === targetAgentId);
  if (!prisoner || !target) return;

  // 显示互动动画 — 画线连接两栋建筑
  const p1 = agentPositions.get(prisonerId);
  const p2 = agentPositions.get(targetAgentId);
  if (p1 && p2) {
    const lineGeo = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(p1.x, 3, p1.z),
      new THREE.Vector3(p2.x, 3, p2.z),
    ]);
    const lineMat = new THREE.LineBasicMaterial({ color: 0xc8a882, transparent: true, opacity: 0.8 });
    const line = new THREE.Line(lineGeo, lineMat);
    scene.add(line);
    setTimeout(() => { scene.remove(line); lineGeo.dispose(); lineMat.dispose(); }, 5000);
  }

  // 飞到目标位置
  if (p2) {
    animateCamera(
      new THREE.Vector3(p2.x + 10, 10, p2.z + 10),
      new THREE.Vector3(p2.x, 3, p2.z)
    );
  }

  // 调用后端 API 触发互动
  try {
    const res = await fetch('/api/town/place', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userId: localStorage.getItem('userId') || 'god-player',
        prisonerId,
        targetAgentId,
      }),
    });
    const data = await res.json();
    if (data.interactions && data.interactions.length > 0) {
      showPlacementInteractions(prisoner.name, target.name, data.interactions);
    }
  } catch {
    // 离线模式 — 本地生成互动
    showPlacementInteractions(prisoner.name, target.name, [
      { speakerName: target.name, content: target.name + '看着被押来的' + prisoner.name + '："你也被抓了？"' },
      { speakerName: prisoner.name, content: prisoner.name + '叹气："是啊，世事无常。"' },
    ]);
  }
}

// 显示放置互动对话
function showPlacementInteractions(prisonerName, targetName, interactions) {
  const container = document.getElementById('jail-interactions');
  if (!container) return;

  let html = '<div style="border-top:1px solid rgba(200,168,130,0.15);padding-top:12px">';
  html += '<div style="font-size:0.65rem;letter-spacing:0.25em;color:var(--warm);margin-bottom:8px">最近互动 / INTERACTIONS</div>';
  for (const i of interactions) {
    const isTarget = i.speakerName === targetName;
    html += '<div style="margin-bottom:8px;padding:8px;background:rgba(255,255,255,0.03);border-radius:4px">';
    html += '<span style="color:' + (isTarget ? '#66d9a0' : '#ff8888') + ';font-size:0.8rem">' + i.speakerName + '</span>';
    html += '<div style="font-size:0.78rem;color:rgba(255,255,255,0.6);margin-top:2px">' + i.content + '</div>';
    html += '</div>';
  }
  html += '</div>';
  container.innerHTML = html;

  // 打开牢房面板显示互动
  document.getElementById('jail-panel').classList.add('open');
}

function onPointerClick(e) {
  // 忽略 UI 元素上的点击
  if (e.target.closest('.top-bar, .side-panel, .detail-panel, .discuss-panel, #jail-panel')) return;
  // 拖拽结束时的 click 忽略
  if (e.detail === 0) return;

  raycaster.setFromCamera(mouse, camera);

  // 检测建筑（点击建筑显示详情）
  const buildingMeshes = [];
  scene.traverse(obj => {
    if (obj.isMesh && obj.userData.agentId && !obj.userData.type) buildingMeshes.push(obj);
  });
  const buildingHits = raycaster.intersectObjects(buildingMeshes, false);
  if (buildingHits.length > 0) {
    const agentId = buildingHits[0].object.userData.agentId;
    if (agentId) showAgentDetail(agentId);
    return;
  }

  // 点击空白处取消放置
  if (placingPrisoner) {
    placingPrisoner = null;
    document.getElementById('place-hint').style.display = 'none';
  }
}

renderer.domElement.addEventListener('pointermove', onPointerMove);
renderer.domElement.addEventListener('click', onPointerClick);

// 悬停检测
const tooltip = document.getElementById('tooltip');
const tooltipName = document.getElementById('tooltip-name');
const tooltipMeta = document.getElementById('tooltip-meta');

function updateHover() {
  if (draggingWalker) return; // 拖拽中不更新悬停

  raycaster.setFromCamera(mouse, camera);

  // 只检测行走者
  const walkerMeshes = [];
  agentWalkers.forEach(w => {
    w.mesh.traverse(child => { if (child.isMesh) walkerMeshes.push(child); });
  });
  const intersects = raycaster.intersectObjects(walkerMeshes, false);

  let hitAgentId = null;
  let hitPoint = null;

  if (intersects.length > 0) {
    let obj = intersects[0].object;
    while (obj && !obj.userData?.agentId) obj = obj.parent;
    if (obj?.userData?.agentId) {
      hitAgentId = obj.userData.agentId;
      hitPoint = intersects[0].point;
    }
  }

  // 解冻所有（除了已被抓的）
  agentWalkers.forEach(w => { if (!w.captured) w.frozen = false; });

  if (hitAgentId) {
    const agent = agents.find(a => a.id === hitAgentId);
    const walker = agentWalkers.find(w => w.agent.id === hitAgentId);
    if (walker && !walker.captured) walker.frozen = true;

    if (hoveredBuilding !== hitAgentId) {
      hoveredBuilding = hitAgentId;
      if (agent) {
        const captured = walker?.captured;
        tooltipName.textContent = agent.name + (captured ? ' 🔒' : '');
        tooltipMeta.textContent = agent.mbti + ' · ' + agent.archetype;
      }
      tooltip.classList.add('visible');
      document.body.style.cursor = 'grab';
    }

    if (hitPoint) {
      const screenPos = hitPoint.clone().project(camera);
      tooltip.style.left = ((screenPos.x + 1) / 2 * window.innerWidth) + 'px';
      tooltip.style.top = ((-screenPos.y + 1) / 2 * window.innerHeight - 40) + 'px';
    }
  } else {
    if (hoveredBuilding) {
      hoveredBuilding = null;
      tooltip.classList.remove('visible');
      document.body.style.cursor = 'default';
    }
  }
}

// ── UI 交互 ──

// 左侧居民列表
const agentListEl = document.getElementById('agent-list');
agents.forEach(agent => {
  const el = document.createElement('div');
  el.className = 'side-agent';
  el.dataset.id = agent.id;
  el.innerHTML = \`
    <div class="side-avatar" style="background:\${agent.colors.main}">\${agent.name[0]}</div>
    <div class="side-agent-info">
      <div class="side-agent-name">\${agent.name}</div>
      <div class="side-agent-meta">\${agent.mbti} · \${agent.archetype}</div>
    </div>\`;
  el.addEventListener('click', () => showAgentDetail(agent.id));
  agentListEl.appendChild(el);
});

// 显示 Agent 详情
function showAgentDetail(agentId) {
  const agent = agents.find(a => a.id === agentId);
  if (!agent) return;

  selectedAgentId = agentId;
  const dp = document.getElementById('detail-panel');
  const dc = document.getElementById('detail-content');

  // 高亮建筑（相机飞向）
  const pos = agentPositions.get(agentId);
  if (pos) {
    const targetPos = new THREE.Vector3(pos.x, 5, pos.z);
    const camPos = new THREE.Vector3(pos.x + 12, 12, pos.z + 12);
    animateCamera(camPos, targetPos);
  }

  // 高亮侧边栏
  document.querySelectorAll('.side-agent').forEach(el => {
    el.classList.toggle('selected', el.dataset.id === agentId);
  });

  const oceanLabels = ['开放', '尽责', '外向', '宜人', '稳定'];
  const oceanVals = [agent.ocean.openness, agent.ocean.conscientiousness, agent.ocean.extraversion, agent.ocean.agreeableness, 100 - agent.ocean.neuroticism];

  dc.innerHTML = \`
    <div class="detail-hero">
      <div class="detail-avatar-lg" style="background:\${agent.colors.main}">\${agent.name[0]}</div>
      <div class="detail-name">\${agent.name}</div>
      <div class="detail-mbti">\${agent.mbti}</div>
      <div class="detail-role">\${agent.role} · \${agent.archetype}</div>
      <div class="detail-desc">\${agent.description || ''}</div>
      <div class="detail-desc" style="margin-top:8px;color:rgba(255,255,255,0.35)">\${agent.communicationStyle || ''}</div>
    </div>
    <div class="detail-section">
      <div class="detail-section-title">OCEAN 人格维度</div>
      \${oceanLabels.map((l, i) => \`
        <div class="ocean-row">
          <span class="ocean-label">\${l}</span>
          <div class="ocean-track"><div class="ocean-fill" style="width:\${oceanVals[i]}%;background:\${agent.colors.accent}"></div></div>
          <span class="ocean-val">\${oceanVals[i]}</span>
        </div>\`).join('')}
    </div>
    <div class="detail-section">
      <div class="detail-section-title">技能</div>
      \${agent.skills.map(s => \`
        <span class="skill-chip">
          <span class="skill-dot" style="background:\${s.level >= 4 ? '#c8a882' : '#555'}"></span>
          \${s.name}
          <span class="skill-lv">Lv.\${s.level}</span>
        </span>\`).join('')}
    </div>
    <div class="detail-section">
      <div class="detail-section-title">发言记录</div>
      \${getAgentUtterances(agentId)}
    </div>\`;

  dp.classList.add('open');
}

function getAgentUtterances(agentId) {
  const utts = [];
  rounds.forEach(r => {
    r.utterances.forEach(u => {
      if (u.agentId === agentId) {
        utts.push({ ...u, topic: r.topicTitle });
      }
    });
  });
  if (utts.length === 0) return '<div style="font-size:0.78rem;color:rgba(255,255,255,0.3)">未参与讨论</div>';
  return utts.map(u => \`
    <div style="padding:8px 0;border-bottom:1px solid rgba(255,255,255,0.04)">
      <div style="font-size:0.65rem;color:var(--warm);margin-bottom:3px">\${u.topic}</div>
      <div style="font-size:0.8rem;color:rgba(255,255,255,0.6);line-height:1.7">\${u.content}</div>
    </div>\`).join('');
}

// 关闭详情
document.getElementById('detail-close').addEventListener('click', () => {
  document.getElementById('detail-panel').classList.remove('open');
  selectedAgentId = null;
});

// 相机动画
function animateCamera(targetPos, lookAt, duration = 1200) {
  const startPos = camera.position.clone();
  const startTarget = controls.target.clone();
  const startTime = performance.now();

  function step(now) {
    const t = Math.min((now - startTime) / duration, 1);
    const ease = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;

    camera.position.lerpVectors(startPos, targetPos, ease);
    controls.target.lerpVectors(startTarget, lookAt, ease);
    controls.update();

    if (t < 1) requestAnimationFrame(step);
  }
  requestAnimationFrame(step);
}

// 按钮事件
document.getElementById('btn-agents').addEventListener('click', () => {
  const panel = document.getElementById('side-panel');
  panel.classList.toggle('open');
  document.getElementById('btn-agents').classList.toggle('active');
});

document.getElementById('btn-discuss').addEventListener('click', () => {
  const panel = document.getElementById('discuss-panel');
  panel.classList.toggle('open');
  document.getElementById('btn-discuss').classList.toggle('active');
  if (panel.classList.contains('open')) renderDiscussContent('rounds');
});

document.getElementById('btn-insights').addEventListener('click', () => {
  const panel = document.getElementById('discuss-panel');
  panel.classList.add('open');
  document.getElementById('btn-discuss').classList.add('active');
  renderDiscussContent('insights');
  // 切换 tab
  document.querySelectorAll('.discuss-tab').forEach(t => t.classList.toggle('active', t.dataset.tab === 'insights'));
});

document.getElementById('discuss-close').addEventListener('click', () => {
  document.getElementById('discuss-panel').classList.remove('open');
  document.getElementById('btn-discuss').classList.remove('active');
});

// 讨论 tab 切换
document.querySelectorAll('.discuss-tab').forEach(tab => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.discuss-tab').forEach(t => t.classList.remove('active'));
    tab.classList.add('active');
    renderDiscussContent(tab.dataset.tab);
  });
});

function renderDiscussContent(tab) {
  const el = document.getElementById('discuss-content');
  if (tab === 'rounds') {
    const sentColors = { positive: '#4caf50', negative: '#e57373', curious: '#64b5f6', neutral: '#888' };
    el.innerHTML = rounds.map((r, idx) => {
      const total = r.utterances.length || 1;
      const s = r.sentiment;
      return \`
        <div class="round-card">
          <div class="round-head">
            <div class="round-num">\${String(idx + 1).padStart(2, '0')}</div>
            <div class="round-info">
              <div class="round-topic-title">\${r.topicTitle}</div>
              <div class="round-question">\${r.topicQuestion}</div>
            </div>
          </div>
          <div class="sentiment-bar">
            <div class="sb-pos" style="width:\${s.positive/total*100}%"></div>
            <div class="sb-cur" style="width:\${s.curious/total*100}%"></div>
            <div class="sb-neu" style="width:\${s.neutral/total*100}%"></div>
            <div class="sb-neg" style="width:\${s.negative/total*100}%"></div>
          </div>
          <div class="utt-list">
            \${r.utterances.map(u => {
              const ag = agents.find(a => a.id === u.agentId);
              return \`
                <div class="utt-item">
                  <div class="utt-avatar" style="background:\${ag ? ag.colors.main : '#555'}">\${u.agentName[0]}</div>
                  <div class="utt-body">
                    <div class="utt-head">
                      <span class="utt-name">\${u.agentName}</span>
                      <span class="utt-mbti">\${ag ? ag.mbti : ''}</span>
                      \${u.replyTo ? \`<span class="utt-reply">回复 \${agents.find(a => a.id === u.replyTo)?.name || ''}</span>\` : ''}
                      <span class="utt-sent" style="background:\${sentColors[u.sentiment] || '#888'}"></span>
                    </div>
                    <div class="utt-text">\${u.content}</div>
                  </div>
                </div>\`;
            }).join('')}
          </div>
          <div class="gm-block">
            <div class="gm-badge">GM</div>
            <div class="gm-body">
              <div class="gm-lbl">GAME MASTER 总结</div>
              <div class="gm-txt">\${r.gmSummary}</div>
            </div>
          </div>
        </div>\`;
    }).join('');
  } else {
    el.innerHTML = '<div class="insights-content">' +
      insights.map((ins, i) => \`
        <div class="insight-item">
          <div class="insight-num">\${String(i + 1).padStart(2, '0')}</div>
          <div class="insight-text">\${ins}</div>
        </div>\`).join('') +
      '</div>';
  }
}

// 昼/夜切换
document.getElementById('btn-day-night').addEventListener('click', () => {
  isNight = !isNight;
  document.getElementById('btn-day-night').classList.toggle('active', isNight);
  toggleDayNight(isNight);
});

function toggleDayNight(night) {
  const dur = 1500;
  const start = performance.now();
  const fromBg = scene.background.clone();
  const toBg = new THREE.Color(night ? 0x0a1628 : 0xdce8f0);
  const fromFog = scene.fog.color.clone();
  const toFog = new THREE.Color(night ? 0x0a1628 : 0xdce8f0);
  const fromAmb = ambientLight.intensity;
  const toAmb = night ? 0.15 : 0.5;
  const fromSun = sunLight.intensity;
  const toSun = night ? 0.1 : 1.2;

  function step(now) {
    const t = Math.min((now - start) / dur, 1);
    const ease = t * t * (3 - 2 * t); // smoothstep

    scene.background.copy(fromBg).lerp(toBg, ease);
    scene.fog.color.copy(fromFog).lerp(toFog, ease);
    ambientLight.intensity = fromAmb + (toAmb - fromAmb) * ease;
    sunLight.intensity = fromSun + (toSun - fromSun) * ease;

    // 路灯亮度
    lampPosts.forEach(lp => {
      const pl = lp.userData.pointLight;
      if (pl) pl.intensity = night ? 1.5 * ease : 0.5 * (1 - ease);
    });

    // 窗户发光
    scene.traverse(obj => {
      if (obj.isMesh && obj.material && obj.material.emissive) {
        if (obj.material.color && obj.material.color.r > 0.9 && obj.material.color.g > 0.95) {
          obj.material.emissiveIntensity = night ? 0.8 * ease : 0;
        }
      }
    });

    if (t < 1) requestAnimationFrame(step);
  }
  requestAnimationFrame(step);
}

// 自动旋转
document.getElementById('btn-auto-rotate').addEventListener('click', () => {
  autoRotate = !autoRotate;
  controls.autoRotate = autoRotate;
  controls.autoRotateSpeed = 0.5;
  document.getElementById('btn-auto-rotate').classList.toggle('active', autoRotate);
});

// ── 抓人按钮 ──
document.getElementById('btn-capture').addEventListener('click', () => {
  captureMode = !captureMode;
  const btn = document.getElementById('btn-capture');
  btn.classList.toggle('active', captureMode);
  btn.textContent = captureMode ? '抓人 ON' : '抓人 OFF';
  btn.style.color = captureMode ? '#ff6b6b' : 'rgba(255,255,255,0.7)';
});

// ── 天牢面板 ──
document.getElementById('btn-jail').addEventListener('click', () => {
  const panel = document.getElementById('jail-panel');
  panel.classList.toggle('open');
  updateJailUI();
});

document.getElementById('btn-release-all').addEventListener('click', () => {
  if (jailSet.size === 0) return;
  releaseAll();
});

// ── 抓全部人快捷键（Ctrl+A） ──
document.addEventListener('keydown', (e) => {
  if (e.ctrlKey && e.key === 'a' && captureMode) {
    e.preventDefault();
    agents.forEach(a => captureAgent(a.id));
  }
  // Esc 取消放置
  if (e.key === 'Escape' && placingPrisoner) {
    placingPrisoner = null;
    document.getElementById('place-hint').style.display = 'none';
  }
});

// fadeInOut 动画（抓获提示用）
const captureStyle = document.createElement('style');
captureStyle.textContent = '@keyframes fadeInOut { 0% { opacity:0;transform:translateX(-50%) translateY(-10px) } 15% { opacity:1;transform:translateX(-50%) translateY(0) } 80% { opacity:1 } 100% { opacity:0;transform:translateX(-50%) translateY(-10px) } }';
document.head.appendChild(captureStyle);

// ── 关系连线（讨论时亮起）──
const relationLines = [];
function createRelationLines() {
  relationships.forEach(rel => {
    const fromPos = agentPositions.get(rel.from);
    const toPos = agentPositions.get(rel.to);
    if (!fromPos || !toPos) return;

    const points = [
      new THREE.Vector3(fromPos.x, 2, fromPos.z),
      new THREE.Vector3((fromPos.x + toPos.x) / 2, 4 + rel.count * 0.5, (fromPos.z + toPos.z) / 2),
      new THREE.Vector3(toPos.x, 2, toPos.z),
    ];
    const curve = new THREE.QuadraticBezierCurve3(...points);
    const lineGeo = new THREE.BufferGeometry().setFromPoints(curve.getPoints(20));
    const lineMat = new THREE.LineBasicMaterial({
      color: 0xc8a882, transparent: true, opacity: 0.0,
      linewidth: 1
    });
    const line = new THREE.Line(lineGeo, lineMat);
    line.userData = { from: rel.from, to: rel.to };
    scene.add(line);
    relationLines.push(line);
  });
}
createRelationLines();

// 定期闪烁关系线
let lineFlashIdx = 0;
function flashRelationLines() {
  relationLines.forEach((line, i) => {
    const active = i === lineFlashIdx % relationLines.length;
    line.material.opacity = active ? 0.4 : 0.0;
  });
  lineFlashIdx++;
}
setInterval(flashRelationLines, 3000);

// ── 主循环 ──
const clock = new THREE.Clock();

function animate() {
  requestAnimationFrame(animate);
  const dt = clock.getDelta() * 1000;

  // 更新控制器
  controls.update();

  // 更新行走者
  agentWalkers.forEach(w => w.update(dt));

  // 讲台标识旋转
  marker.rotation.y += 0.005;
  marker.position.y = 1.8 + Math.sin(performance.now() * 0.001) * 0.15;

  // 云朵漂浮
  clouds.forEach(cloud => {
    cloud.position.x += cloud.userData.speed;
    if (cloud.position.x > 80) cloud.position.x = -80;
  });

  // 粒子浮动
  const ppos = particles.geometry.attributes.position;
  for (let i = 0; i < particleCount; i++) {
    ppos.setY(i, ppos.getY(i) + particleSpeeds[i] * Math.sin(performance.now() * 0.0005 + i));
    if (ppos.getY(i) > 20) ppos.setY(i, 2);
  }
  ppos.needsUpdate = true;

  // 悬停检测
  updateHover();

  renderer.render(scene, camera);
}

// ── 响应窗口大小 ──
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// ── 加载完成 ──
const loaderFill = document.getElementById('loader-fill');
let loadProgress = 0;
const loadInterval = setInterval(() => {
  loadProgress += 15 + Math.random() * 20;
  if (loadProgress >= 100) {
    loadProgress = 100;
    clearInterval(loadInterval);
    setTimeout(() => {
      document.getElementById('loader').classList.add('fade');
      setTimeout(() => document.getElementById('loader').remove(), 800);
    }, 300);
  }
  loaderFill.style.width = loadProgress + '%';
}, 150);

// 开始动画
animate();

// 3秒后隐藏提示
setTimeout(() => {
  const hint = document.getElementById('hint');
  if (hint) hint.style.opacity = '0';
}, 6000);

</script>
</body>
</html>`;

  // 写入文件
  const reportPath = join(outputDir, 'report-3d.html');
  writeFileSync(reportPath, html, 'utf-8');

  // 同时保存 JSON 数据
  const jsonPath = join(outputDir, 'simulation.json');
  writeFileSync(jsonPath, JSON.stringify(log, null, 2), 'utf-8');

  return reportPath;
}
