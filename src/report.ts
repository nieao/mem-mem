/**
 * HTML 报告生成器 — 建筑极简唯美 + 2D 伪3D 等距小镇地图
 * 包含等距地图（道路/山脉/河流/房屋）、3D 翻转卡片、关系网络、情感时间线
 */

import type { SimulationLog, AgentProfile, Utterance } from './types.js';
import { writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import { recommendTemplates } from './task-templates.js';

/** HTML 转义 */
function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/** 根据 MBTI 生成建筑配色 */
function mbtiColor(mbti: string): { main: string; roof: string; accent: string } {
  const palette: Record<string, { main: string; roof: string; accent: string }> = {
    INTJ: { main: '#6b7b8d', roof: '#4a5568', accent: '#9fb3c8' },
    INTP: { main: '#7b8fa1', roof: '#5a6f82', accent: '#a8c0d4' },
    ENTJ: { main: '#8b6f5e', roof: '#6b4f3e', accent: '#c8a882' },
    ENTP: { main: '#9b8b6e', roof: '#7b6b4e', accent: '#d4c4a2' },
    INFJ: { main: '#7b6b8d', roof: '#5b4b6d', accent: '#b8a8cc' },
    INFP: { main: '#8b7b9b', roof: '#6b5b7b', accent: '#c8b8d8' },
    ENFJ: { main: '#8b7b6b', roof: '#6b5b4b', accent: '#c8b8a2' },
    ENFP: { main: '#9b8b7b', roof: '#7b6b5b', accent: '#d4c4b4' },
    ISTJ: { main: '#6b7b7b', roof: '#4a5a5a', accent: '#9bb0b0' },
    ISFJ: { main: '#7b8b8b', roof: '#5a6a6a', accent: '#a8c0c0' },
    ESTJ: { main: '#7b6b6b', roof: '#5b4b4b', accent: '#b0a0a0' },
    ESFJ: { main: '#8b7b7b', roof: '#6b5b5b', accent: '#c0b0b0' },
    ISTP: { main: '#6b8b7b', roof: '#4a6b5a', accent: '#9bc0b0' },
    ISFP: { main: '#7b9b8b', roof: '#5a7b6a', accent: '#a8d0c0' },
    ESTP: { main: '#8b7b6b', roof: '#6b5b4b', accent: '#c0b0a0' },
    ESFP: { main: '#9b8b7b', roof: '#7b6b5b', accent: '#d0c0b0' },
  };
  return palette[mbti] || { main: '#8b8b8b', roof: '#6b6b6b', accent: '#b0b0b0' };
}

/** 计算 Agent 间的对话关系 */
function buildRelationships(log: SimulationLog): { from: string; to: string; count: number }[] {
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
      return { from, to, count };
    })
    .sort((a, b) => b.count - a.count)
    .slice(0, 20);
}

/** 统计每轮情感分布 */
function sentimentDistribution(utterances: Utterance[]) {
  const dist = { positive: 0, neutral: 0, negative: 0, curious: 0 };
  for (const u of utterances) dist[u.sentiment]++;
  return dist;
}

/** 生成 HTML 报告 */
export function generateHtmlReport(log: SimulationLog, outputDir: string): string {
  mkdirSync(outputDir, { recursive: true });

  const relationships = buildRelationships(log);

  // ── 地图数据：每个 Agent 的建筑信息 JSON ──
  const mapAgentsJson = JSON.stringify(log.agents.map((a, i) => ({
    id: a.id,
    name: a.name,
    mbti: a.personality.mbti,
    archetype: a.personality.archetype,
    role: a.role,
    extraversion: a.personality.ocean.extraversion,
    color: mbtiColor(a.personality.mbti),
  })));

  // ── Agent 卡片（3D 翻转） ──
  const agentCards = log.agents.map(a => {
    const c = mbtiColor(a.personality.mbti);
    const skills = a.skills.map(s =>
      `<div class="flip-skill"><span class="dot" style="background:${s.level >= 4 ? 'var(--warm)' : 'var(--gray-300)'}"></span>${s.name} <span class="lv">Lv.${s.level}</span></div>`
    ).join('');
    const o = a.personality.ocean;
    const radarBars = [
      { label: '开放', value: o.openness },
      { label: '尽责', value: o.conscientiousness },
      { label: '外向', value: o.extraversion },
      { label: '宜人', value: o.agreeableness },
      { label: '稳定', value: 100 - o.neuroticism },
    ].map(d => `
      <div class="radar-row">
        <span class="radar-label">${d.label}</span>
        <div class="radar-bar-track"><div class="radar-bar-fill" style="width:${d.value}%;background:${c.accent}"></div></div>
        <span class="radar-val">${d.value}</span>
      </div>`).join('');
    return `
      <div class="flip-card" data-agent="${a.id}">
        <div class="flip-inner">
          <div class="flip-front" style="--card-accent:${c.accent};--card-main:${c.main}">
            <div class="card-top-line" style="background:${c.accent}"></div>
            <div class="agent-avatar" style="background:${c.main}"><span>${a.name.charAt(0)}</span></div>
            <div class="agent-name">${a.name}</div>
            <div class="agent-mbti-badge" style="border-color:${c.accent};color:${c.main}">${a.personality.mbti}</div>
            <div class="agent-role">${a.role}</div>
            <div class="agent-archetype">${a.personality.archetype}</div>
            <div class="flip-hint">悬停翻转查看技能</div>
          </div>
          <div class="flip-back" style="--card-accent:${c.accent};--card-main:${c.main}">
            <div class="card-top-line" style="background:${c.accent}"></div>
            <div class="back-title">${a.name} 的能力</div>
            <div class="radar-chart">${radarBars}</div>
            <div class="back-skills">${skills}</div>
          </div>
        </div>
      </div>`;
  }).join('');

  // ── 讨论轮次 ──
  const roundsHtml = log.rounds.map((r, idx) => {
    const dist = sentimentDistribution(r.utterances);
    const total = r.utterances.length || 1;
    const pPos = Math.round(dist.positive / total * 100);
    const pNeu = Math.round(dist.neutral / total * 100);
    const pNeg = Math.round(dist.negative / total * 100);
    const pCur = Math.round(dist.curious / total * 100);
    const utterancesHtml = r.utterances.map((u, ui) => {
      const agent = log.agents.find(a => a.id === u.agentId);
      const c = agent ? mbtiColor(agent.personality.mbti) : { main: '#888', accent: '#aaa', roof: '#666' };
      const sc: Record<string, string> = { positive: '#4caf50', negative: '#e57373', curious: '#64b5f6', neutral: 'var(--gray-500)' };
      return `
        <div class="utterance" style="--delay:${ui * 0.05}s">
          <div class="utterance-avatar" style="background:${c.main}">${u.agentName.charAt(0)}</div>
          <div class="utterance-body">
            <div class="utterance-header">
              <span class="speaker-name">${u.agentName}</span>
              <span class="speaker-mbti" style="color:${c.main}">${agent?.personality.mbti || ''}</span>
              ${u.replyTo ? `<span class="reply-tag">回复 ${log.agents.find(a => a.id === u.replyTo)?.name || u.replyTo}</span>` : ''}
              <span class="sentiment-dot" style="background:${sc[u.sentiment]}" title="${u.sentiment}"></span>
            </div>
            <div class="utterance-content">${esc(u.content)}</div>
          </div>
        </div>`;
    }).join('');
    return `
      <div class="round-block reveal">
        <div class="round-header-bar">
          <div class="round-number-big">${String(idx + 1).padStart(2, '0')}</div>
          <div class="round-meta">
            <div class="round-topic">${r.topic.title}</div>
            <div class="round-question">${r.topic.openingQuestion}</div>
          </div>
        </div>
        <div class="sentiment-flow">
          <div class="sf-bar" style="--pos:${pPos}%;--neu:${pNeu}%;--neg:${pNeg}%;--cur:${pCur}%">
            <div class="sf-pos" title="积极 ${pPos}%"></div>
            <div class="sf-cur" title="好奇 ${pCur}%"></div>
            <div class="sf-neu" title="中立 ${pNeu}%"></div>
            <div class="sf-neg" title="消极 ${pNeg}%"></div>
          </div>
          <div class="sf-legend">
            <span><span class="sf-dot" style="background:#4caf50"></span>积极 ${pPos}%</span>
            <span><span class="sf-dot" style="background:#64b5f6"></span>好奇 ${pCur}%</span>
            <span><span class="sf-dot" style="background:var(--gray-400)"></span>中立 ${pNeu}%</span>
            <span><span class="sf-dot" style="background:#e57373"></span>消极 ${pNeg}%</span>
          </div>
        </div>
        <div class="utterances-list">${utterancesHtml}</div>
        <div class="gm-summary">
          <div class="gm-icon">GM</div>
          <div>
            <div class="gm-label">GAME MASTER 总结</div>
            <div class="gm-text">${esc(r.gmSummary)}</div>
          </div>
        </div>
      </div>`;
  }).join('');

  // ── 关系网络数据 ──
  const relDataJson = JSON.stringify(relationships.map(r => ({
    from: log.agents.find(a => a.id === r.from)?.name || r.from,
    to: log.agents.find(a => a.id === r.to)?.name || r.to,
    count: r.count,
  })));
  const agentNamesJson = JSON.stringify(log.agents.map(a => ({
    name: a.name, mbti: a.personality.mbti,
    color: mbtiColor(a.personality.mbti).main,
  })));

  // ── 洞察 ──
  const insightsHtml = log.insights.map((insight, i) => `
    <div class="insight-card reveal" style="--delay:${i * 0.1}s">
      <div class="insight-deco">
        <div class="insight-number">${String(i + 1).padStart(2, '0')}</div>
        <div class="insight-line"></div>
      </div>
      <div class="insight-content">${esc(insight)}</div>
    </div>`).join('');

  // ── 统计 ──
  const statsHtml = `
    <div class="stats-grid-3d">
      ${[
        { value: log.metadata.totalUtterances, label: '总发言数' },
        { value: log.metadata.totalRounds, label: '讨论轮数' },
        { value: log.metadata.avgUtterancesPerRound.toFixed(1), label: '轮均发言' },
        { value: log.agents.length, label: '居民人数' },
      ].map((s, i) => `
        <div class="stat-cube" style="--delay:${i * 0.1}s">
          <div class="cube-top"></div>
          <div class="cube-front"><div class="stat-value">${s.value}</div><div class="stat-label">${s.label}</div></div>
          <div class="cube-right"><div class="stat-value">${s.value}</div></div>
        </div>`).join('')}
    </div>
    <div class="activity-section">
      <div class="activity-title">最活跃居民</div>
      <div class="activity-bars">
        ${log.metadata.mostActiveAgents.slice(0, 8).map((a, i) => {
          const max = log.metadata.mostActiveAgents[0]?.count || 1;
          const pct = Math.round(a.count / max * 100);
          const agent = log.agents.find(ag => ag.name === a.name);
          const c = agent ? mbtiColor(agent.personality.mbti) : { main: '#888', accent: '#aaa', roof: '#666' };
          return `
            <div class="activity-row" style="--delay:${i * 0.05}s">
              <div class="activity-rank">#${i + 1}</div>
              <div class="activity-avatar" style="background:${c.main}">${a.name.charAt(0)}</div>
              <div class="activity-info">
                <div class="activity-name">${a.name}</div>
                <div class="activity-bar-track"><div class="activity-bar-fill" style="width:${pct}%;background:${c.accent}"></div></div>
              </div>
              <div class="activity-count">${a.count}</div>
            </div>`;
        }).join('')}
      </div>
    </div>`;

  const coverageHtml = log.metadata.topicCoverage.map((tc, i) => {
    const pct = Math.round(tc.depth * 100);
    return `
      <div class="coverage-item" style="--delay:${i * 0.08}s">
        <div class="coverage-label">${tc.topic}</div>
        <div class="coverage-bar-track">
          <div class="coverage-bar-fill" style="width:${pct}%"></div>
          <span class="coverage-pct">${pct}%</span>
        </div>
      </div>`;
  }).join('');

  const html = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>🦞 龙虾小镇</title>
<style>
  :root {
    --black: #1a1a1a; --dark: #2d2d2d; --gray-900: #3a3a3a;
    --gray-700: #555; --gray-500: #888; --gray-400: #aaa;
    --gray-300: #bbb; --gray-100: #e8e8e8; --white: #fafafa;
    --warm: #c8a882; --warm-light: #e8d5c0; --warm-bg: #f5f0eb;
  }
  * { margin:0; padding:0; box-sizing:border-box; }
  body { font-family:"Noto Sans SC","Microsoft YaHei",system-ui,sans-serif; background:var(--white); color:var(--dark); line-height:1.8; overflow-x:hidden; }
  .container { max-width:1100px; margin:0 auto; padding:0 24px; }

  /* ── 导航 ── */
  nav { position:fixed; top:0; left:0; right:0; z-index:100; background:rgba(250,250,250,0.85); backdrop-filter:blur(20px); border-bottom:1px solid var(--gray-100); }
  /* 用户登录面板 */
  .login-modal {
    position: fixed; top: 0; left: 0; width: 100%; height: 100%; z-index: 500;
    background: rgba(10,10,10,0.92); display: flex; align-items: center; justify-content: center;
    backdrop-filter: blur(16px); display: none;
  }
  .login-modal.open { display: flex; }
  .login-box {
    width: 420px; max-width: 90vw; background: var(--white); border: 1px solid var(--gray-100);
    box-shadow: 0 40px 120px rgba(0,0,0,0.5); padding: 40px 36px;
  }
  .login-box::before { content: ''; display: block; height: 3px; background: var(--warm); margin: -40px -36px 24px; }
  .login-title { font-family: "Noto Serif SC",Georgia,serif; font-size: 1.3rem; color: var(--black); margin-bottom: 4px; }
  .login-sub { font-size: 0.78rem; color: var(--gray-500); margin-bottom: 24px; }
  .login-field { margin-bottom: 16px; }
  .login-label { font-size: 0.68rem; letter-spacing: 0.15em; color: var(--warm); margin-bottom: 4px; display: block; }
  .login-input {
    width: 100%; padding: 10px 14px; border: 1px solid var(--gray-100); font-size: 0.88rem;
    font-family: inherit; color: var(--dark); background: var(--white); outline: none;
    transition: border-color 0.3s;
  }
  .login-input:focus { border-color: var(--warm); }
  .login-select { width: 100%; padding: 10px 14px; border: 1px solid var(--gray-100); font-size: 0.88rem; font-family: inherit; background: var(--white); }
  .login-btn {
    width: 100%; padding: 12px; background: var(--warm); color: white; border: none;
    font-size: 0.88rem; cursor: pointer; font-family: inherit; letter-spacing: 0.1em;
    transition: background 0.3s; margin-top: 8px;
  }
  .login-btn:hover { background: #b8986e; }
  .login-skip { text-align: center; margin-top: 12px; font-size: 0.72rem; color: var(--gray-400); cursor: pointer; }
  .login-skip:hover { color: var(--warm); }
  /* 用户信息条 */
  .user-bar {
    position: fixed; top: 68px; right: 16px; z-index: 99;
    background: rgba(26,26,26,0.92); color: rgba(255,255,255,0.8);
    padding: 6px 14px; font-size: 0.65rem; border: 1px solid rgba(200,168,130,0.2);
    backdrop-filter: blur(8px); display: none; align-items: center; gap: 8px;
    font-family: monospace;
  }
  .user-bar.show { display: flex; }
  .user-bar .user-name { color: var(--warm); }
  .user-bar .mode-badge { padding: 1px 6px; font-size: 0.55rem; letter-spacing: 0.1em; border: 1px solid; cursor: pointer; }
  .user-bar .mode-badge.god { border-color: #ff5f63; color: #ff5f63; }
  .user-bar .mode-badge.resident { border-color: #64f0c8; color: #64f0c8; }

  /* ── 右侧统一面板 ── */
  .right-panel {
    position: absolute; top: 80px; right: 16px; z-index: 50;
    width: 200px;
    display: flex; flex-direction: column; gap: 0;
    background: rgba(30,30,30,0.88); backdrop-filter: blur(10px);
    border: 1px solid rgba(200,168,130,0.2);
    border-radius: 4px; overflow: hidden;
    font-family: 'Noto Sans SC', system-ui, sans-serif;
  }
  .rp-section { border-bottom: 1px solid rgba(200,168,130,0.12); }
  .rp-section:last-child { border-bottom: none; }
  .rp-top {
    display: flex; align-items: stretch;
  }
  .rp-clock {
    flex: 1; padding: 10px 8px; text-align: center;
    border-right: 1px solid rgba(200,168,130,0.12);
    display: flex; flex-direction: column; justify-content: center; align-items: center;
  }
  .rp-token {
    flex: 1.2; padding: 8px 10px;
    border-right: 1px solid rgba(200,168,130,0.12);
    display: flex; flex-direction: column; justify-content: center;
  }
  .rp-zoom {
    display: flex; flex-direction: column; gap: 2px;
    padding: 6px 4px; justify-content: center;
  }
  /* Token 面板（嵌套版） */
  .token-panel { background: none; border: none; padding: 0; }
  .token-panel-title { font-size: 0.5rem; letter-spacing: 0.2em; color: var(--warm); margin-bottom: 3px; }
  .token-row { display: flex; justify-content: space-between; gap: 6px; padding: 1px 0; font-size: 0.56rem; color: rgba(255,255,255,0.55); }
  .token-val { color: var(--warm-light); font-family: "Noto Serif SC",Georgia,serif; font-size: 0.58rem; }

  /* 赏金墙（嵌套在右侧面板内） */
  .rp-bounty {
    max-height: 380px; overflow-y: auto;
  }
  .rp-bounty::-webkit-scrollbar { width: 3px; }
  .rp-bounty::-webkit-scrollbar-thumb { background: rgba(200,168,130,0.3); border-radius: 2px; }
  .bounty-wall::-webkit-scrollbar { width: 3px; }
  .bounty-wall::-webkit-scrollbar-thumb { background: var(--warm-light); border-radius: 2px; }
  .bounty-wall-header {
    padding: 8px 12px; border-bottom: 1px solid rgba(200,168,130,0.15);
    display: flex; align-items: center; justify-content: space-between;
  }
  .bounty-wall-title {
    font-size: 0.55rem; letter-spacing: 0.2em; color: var(--warm);
    text-transform: uppercase; font-weight: 500;
  }
  .bounty-wall-count {
    font-size: 0.58rem; color: rgba(255,255,255,0.5);
    font-family: 'Courier New', monospace;
  }
  .bounty-wall-empty {
    padding: 20px 12px; text-align: center;
    font-size: 0.7rem; color: rgba(255,255,255,0.4);
  }
  .bounty-card {
    padding: 8px 10px; border-bottom: 1px solid rgba(200,168,130,0.1);
    cursor: pointer; transition: all 0.3s ease;
  }
  .bounty-card:hover { background: rgba(200,168,130,0.1); }
  .bounty-card:last-child { border-bottom: none; }
  .bounty-card-top {
    display: flex; align-items: center; justify-content: space-between;
    margin-bottom: 4px;
  }
  .bounty-card-title {
    font-size: 0.68rem; color: rgba(255,255,255,0.9); font-weight: 500;
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
    max-width: 155px;
  }
  .bounty-card-reward {
    font-size: 0.58rem; color: var(--warm-light);
    font-family: "Noto Serif SC", Georgia, serif; white-space: nowrap;
  }
  .bounty-card-desc {
    font-size: 0.56rem; color: rgba(255,255,255,0.55); line-height: 1.4;
    display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical;
    overflow: hidden; margin-bottom: 3px;
  }
  .bounty-card-img {
    width: 100%; height: 80px; object-fit: cover; border-radius: 2px;
    border: 1px solid rgba(200,168,130,0.2); margin-bottom: 4px;
  }
  .bounty-card-meta {
    display: flex; align-items: center; justify-content: space-between;
    font-size: 0.55rem; color: rgba(255,255,255,0.4);
  }
  .bounty-status {
    display: inline-block; padding: 1px 6px; border-radius: 2px;
    font-size: 0.5rem; letter-spacing: 0.05em; font-weight: 500;
  }
  .bounty-status-open { background: #eef5ec; color: #5a7a4f; }
  .bounty-status-assigned { background: #ecf1f5; color: #4f6a7a; }
  .bounty-status-in-progress { background: #f5f0eb; color: #a68960; }
  .bounty-status-completed { background: #e8f5e8; color: #3a7a3a; }
  .bounty-status-failed { background: #f5ecec; color: #7a4f4f; }
  .bounty-card-agent {
    font-size: 0.55rem; color: rgba(255,255,255,0.5);
    font-style: italic;
  }
  .bounty-card-combo {
    font-size: 0.52rem; color: var(--warm); font-weight: 500;
    margin-top: 2px;
  }
  .bounty-wall-refresh {
    width: 100%; padding: 6px; border: none; border-top: 1px solid rgba(200,168,130,0.15);
    background: transparent; color: var(--warm); font-size: 0.6rem;
    cursor: pointer; letter-spacing: 0.1em; transition: background 0.2s;
  }
  .bounty-wall-refresh:hover { background: rgba(200,168,130,0.15); }
  /* 精选成果展示 */
  .bounty-showcase-header {
    padding: 6px 10px; font-size: 0.5rem; letter-spacing: 0.18em;
    color: var(--warm); text-transform: uppercase;
    border-top: 1px solid rgba(200,168,130,0.2);
    border-bottom: 1px solid rgba(200,168,130,0.1);
  }
  .bounty-showcase-item {
    padding: 8px 10px; border-bottom: 1px solid rgba(200,168,130,0.08);
  }
  .bounty-showcase-item:last-child { border-bottom: none; }
  .bounty-showcase-img {
    width: 100%; border-radius: 3px; margin-bottom: 6px;
    border: 1px solid rgba(200,168,130,0.15);
  }
  .bounty-showcase-info {
    font-size: 0.56rem; color: rgba(255,255,255,0.6); line-height: 1.5;
  }
  .bounty-showcase-title {
    font-size: 0.62rem; color: rgba(255,255,255,0.85); font-weight: 500; margin-bottom: 2px;
  }
  .bounty-showcase-stars { color: var(--warm-light); font-size: 0.6rem; }
  .bounty-showcase-agent { color: var(--warm); font-size: 0.52rem; }
  .bounty-showcase-reward { color: var(--warm-light); font-family: "Noto Serif SC",serif; font-size: 0.55rem; }
  nav .container { display:flex; align-items:center; height:60px; justify-content:space-between; }
  .nav-logo { font-family:"Noto Serif SC",Georgia,serif; font-size:1.1rem; letter-spacing:0.02em; color:var(--black); }
  .nav-links a { color:var(--gray-700); text-decoration:none; margin-left:24px; font-size:0.85rem; letter-spacing:0.05em; transition:color 0.3s; position:relative; }
  .nav-links a::after { content:''; position:absolute; bottom:-2px; left:0; width:0; height:1px; background:var(--warm); transition:width 0.3s; }
  .nav-links a:hover { color:var(--warm); }
  .nav-links a:hover::after { width:100%; }

  /* ── 全屏地图 Hero ── */
  .map-hero {
    position: relative; width: 100%; height: 100vh; min-height: 700px;
    overflow: hidden; background: #e8e2d6;
  }
  #town-map { display: block; width: 100%; height: 100%; cursor: grab; }
  #town-map:active { cursor: grabbing; }
  .map-overlay {
    position: absolute; bottom: 0; left: 0; right: 0;
    padding: 40px 0 32px;
    background: linear-gradient(to top, rgba(250,250,250,0.95) 0%, rgba(250,250,250,0.7) 60%, transparent 100%);
    pointer-events: none;
  }
  .map-overlay .container { pointer-events: auto; }
  .map-overlay .hero-label { font-size:0.72rem; letter-spacing:0.35em; color:var(--warm); text-transform:uppercase; margin-bottom:8px; }
  .map-overlay h1 { font-family:"Noto Serif SC",Georgia,serif; font-size:2.2rem; font-weight:400; color:var(--black); letter-spacing:0.02em; margin-bottom:8px; }
  .map-overlay p { color:var(--gray-700); font-size:0.92rem; max-width:550px; margin-bottom:16px; }
  .map-stats { display:flex; gap:28px; }
  .map-stat-val { font-family:"Noto Serif SC",Georgia,serif; font-size:1.6rem; color:var(--warm); line-height:1.2; }
  .map-stat-lbl { font-size:0.7rem; color:var(--gray-500); letter-spacing:0.12em; }
  /* 地图提示标签 */
  .map-tooltip {
    position: absolute; padding: 8px 14px; background: rgba(26,26,26,0.92);
    color: #fff; font-size: 0.78rem; border-radius: 4px; pointer-events: none;
    opacity: 0; transition: opacity 0.2s; z-index: 50; max-width: 200px;
    backdrop-filter: blur(8px); border: 1px solid rgba(200,168,130,0.3);
  }
  .map-tooltip .tt-name { font-weight: 600; margin-bottom: 2px; }
  .map-tooltip .tt-role { color: var(--warm-light); font-size: 0.7rem; }
  .map-tooltip .tt-mbti { color: var(--warm); font-size: 0.68rem; letter-spacing: 0.1em; }
  /* 地图缩放控件 */
  .map-controls { display: none; } /* 已合并到右侧面板 */
  .map-btn {
    width: 28px; height: 28px; border: 1px solid rgba(200,168,130,0.15); background: transparent;
    cursor: pointer; display: flex; align-items: center; justify-content: center;
    font-size: 0.9rem; color: rgba(255,255,255,0.6); transition: all 0.2s;
    border-radius: 2px;
  }
  .map-btn:hover { border-color: var(--warm); color: var(--warm-light); background: rgba(200,168,130,0.1); }
  .map-legend {
    position: absolute; top: 80px; left: 24px; background: rgba(250,250,250,0.9);
    backdrop-filter: blur(8px); border: 1px solid var(--gray-100); padding: 12px 16px;
    font-size: 0.72rem; color: var(--gray-700); z-index: 50;
  }
  .map-legend-title { font-size: 0.68rem; letter-spacing: 0.2em; color: var(--warm); margin-bottom: 6px; }
  .map-legend-item { display: flex; align-items: center; gap: 8px; margin-bottom: 3px; }
  .map-legend-color { width: 16px; height: 8px; border-radius: 1px; }
  /* 昼夜时钟（嵌套在右侧面板内） */
  .day-clock-time { font-family: "Noto Serif SC",Georgia,serif; font-size: 1.1rem; color: var(--warm-light); line-height: 1.2; }
  .day-clock-label { font-size: 0.55rem; letter-spacing: 0.1em; color: rgba(255,255,255,0.45); margin-top: 2px; }
  .day-clock-time { font-family: "Noto Serif SC",Georgia,serif; font-size: 1.3rem; color: var(--warm); line-height: 1.2; }
  .day-clock-label { font-size: 0.62rem; letter-spacing: 0.15em; color: var(--gray-500); margin-top: 2px; }
  /* 速度控制 */
  .speed-controls {
    position: absolute; bottom: 140px; right: 24px; z-index: 50;
    display: flex; gap: 2px;
  }
  .speed-btn {
    padding: 4px 10px; border: 1px solid var(--gray-300); background: rgba(250,250,250,0.9);
    cursor: pointer; font-size: 0.7rem; color: var(--gray-700); transition: all 0.2s;
    backdrop-filter: blur(8px);
  }
  .speed-btn:hover, .speed-btn.active { border-color: var(--warm); color: var(--warm); background: var(--warm-bg); }

  /* ── 段落 ── */
  .section { padding:80px 0; border-bottom:1px solid var(--gray-100); position:relative; }
  .section-header { margin-bottom:48px; }
  .section-label { font-size:0.72rem; letter-spacing:0.35em; color:var(--warm); margin-bottom:8px; }
  .section-title { font-family:"Noto Serif SC",Georgia,serif; font-size:1.6rem; color:var(--black); font-weight:400; }
  .section-desc { color:var(--gray-700); font-size:0.88rem; margin-top:8px; max-width:600px; }

  /* ── 3D 翻转卡片 ── */
  .cards-grid { display:grid; grid-template-columns:repeat(auto-fit,minmax(260px,1fr)); gap:24px; }
  .flip-card { perspective:1000px; height:340px; cursor:pointer; }
  .flip-inner { position:relative; width:100%; height:100%; transition:transform 0.7s cubic-bezier(0.22,1,0.36,1); transform-style:preserve-3d; }
  .flip-card:hover .flip-inner { transform:rotateY(180deg); }
  .flip-front,.flip-back { position:absolute; top:0; left:0; width:100%; height:100%; backface-visibility:hidden; border:1px solid var(--gray-100); padding:24px; display:flex; flex-direction:column; align-items:center; background:var(--white); overflow:hidden; }
  .flip-back { transform:rotateY(180deg); align-items:stretch; }
  .card-top-line { position:absolute; top:0; left:0; width:100%; height:2px; }
  .agent-avatar { width:56px; height:56px; border-radius:50%; display:flex; align-items:center; justify-content:center; color:white; font-family:"Noto Serif SC",Georgia,serif; font-size:1.4rem; margin-top:16px; margin-bottom:12px; box-shadow:0 4px 20px rgba(0,0,0,0.1); }
  .flip-front .agent-name { font-family:"Noto Serif SC",Georgia,serif; font-size:1.15rem; color:var(--black); margin-bottom:8px; }
  .agent-mbti-badge { font-size:0.72rem; letter-spacing:0.15em; border:1px solid; padding:2px 12px; margin-bottom:12px; }
  .agent-role { font-size:0.82rem; color:var(--gray-700); }
  .agent-archetype { font-size:0.78rem; color:var(--gray-500); margin-top:4px; }
  .flip-hint { margin-top:auto; font-size:0.68rem; color:var(--gray-400); letter-spacing:0.1em; animation:hintPulse 2s ease-in-out infinite; }
  @keyframes hintPulse { 0%,100%{opacity:0.5} 50%{opacity:1} }
  @keyframes breathe { 0%,100%{opacity:0.4;box-shadow:0 0 2px currentColor} 50%{opacity:1;box-shadow:0 0 8px currentColor} }
  .back-title { font-family:"Noto Serif SC",Georgia,serif; font-size:1rem; color:var(--black); margin-bottom:16px; margin-top:12px; text-align:center; }
  .radar-chart { margin-bottom:16px; }
  .radar-row { display:flex; align-items:center; gap:6px; margin-bottom:4px; }
  .radar-label { font-size:0.68rem; color:var(--gray-500); width:28px; flex-shrink:0; text-align:right; }
  .radar-bar-track { flex:1; height:4px; background:var(--gray-100); border-radius:2px; overflow:hidden; }
  .radar-bar-fill { height:100%; border-radius:2px; transition:width 1.2s ease; }
  .radar-val { font-size:0.65rem; color:var(--gray-500); width:22px; }
  .back-skills { display:flex; flex-direction:column; gap:4px; }
  .flip-skill { font-size:0.72rem; color:var(--gray-700); display:flex; align-items:center; gap:6px; padding:4px 8px; border:1px solid var(--gray-100); border-radius:2px; }
  .flip-skill .lv { color:var(--warm); margin-left:auto; font-size:0.68rem; }
  .dot { width:5px; height:5px; border-radius:50%; flex-shrink:0; }

  /* ── 关系网络 ── */
  .network-section { background:var(--black); color:var(--white); padding:80px 0; }
  .network-section .section-label { color:var(--warm); }
  .network-section .section-title { color:var(--white); }
  .network-section .section-desc { color:var(--gray-400); }
  .network-canvas-wrap { position:relative; width:100%; height:500px; margin-top:32px; border:1px solid rgba(255,255,255,0.08); border-radius:4px; overflow:hidden; background:radial-gradient(ellipse at center,rgba(200,168,130,0.05) 0%,transparent 70%); }
  #network-canvas { width:100%; height:100%; }

  /* ── 讨论 ── */
  .round-block { margin-bottom:48px; border:1px solid var(--gray-100); overflow:hidden; }
  .round-header-bar { display:flex; align-items:flex-start; gap:24px; padding:24px 32px; background:linear-gradient(135deg,var(--warm-bg),var(--white)); border-bottom:1px solid var(--gray-100); }
  .round-number-big { font-family:"Noto Serif SC",Georgia,serif; font-size:2.8rem; color:var(--warm); font-weight:300; line-height:1; flex-shrink:0; opacity:0.7; }
  .round-meta { flex:1; padding-top:4px; }
  .round-topic { font-family:"Noto Serif SC",Georgia,serif; font-size:1.15rem; color:var(--black); margin-bottom:6px; }
  .round-question { font-style:italic; color:var(--gray-700); font-size:0.88rem; padding-left:12px; border-left:2px solid var(--warm-light); }
  .sentiment-flow { padding:16px 32px; border-bottom:1px solid var(--gray-100); }
  .sf-bar { height:6px; display:flex; border-radius:3px; overflow:hidden; margin-bottom:8px; }
  .sf-pos { width:var(--pos); background:#4caf50; } .sf-cur { width:var(--cur); background:#64b5f6; }
  .sf-neu { width:var(--neu); background:var(--gray-300); } .sf-neg { width:var(--neg); background:#e57373; }
  .sf-legend { display:flex; gap:16px; font-size:0.7rem; color:var(--gray-500); }
  .sf-dot { display:inline-block; width:6px; height:6px; border-radius:50%; margin-right:4px; vertical-align:middle; }
  .utterances-list { padding:24px 32px; }
  .utterance { display:flex; gap:12px; margin-bottom:20px; padding-bottom:20px; border-bottom:1px solid var(--gray-100); animation:fadeSlideIn 0.5s ease var(--delay,0s) both; }
  .utterance:last-child { border-bottom:none; }
  @keyframes fadeSlideIn { from{opacity:0;transform:translateX(-10px)} to{opacity:1;transform:translateX(0)} }
  .utterance-avatar { width:32px; height:32px; border-radius:50%; flex-shrink:0; display:flex; align-items:center; justify-content:center; color:white; font-size:0.75rem; font-weight:500; }
  .utterance-body { flex:1; min-width:0; }
  .utterance-header { display:flex; align-items:center; gap:8px; margin-bottom:4px; flex-wrap:wrap; }
  .speaker-name { font-weight:500; color:var(--black); font-size:0.88rem; }
  .speaker-mbti { font-size:0.7rem; }
  .reply-tag { font-size:0.68rem; color:var(--warm); background:var(--warm-bg); padding:1px 8px; border-radius:2px; }
  .sentiment-dot { width:6px; height:6px; border-radius:50%; margin-left:auto; flex-shrink:0; }
  .utterance-content { color:var(--dark); font-size:0.9rem; line-height:1.8; }
  .gm-summary { display:flex; gap:16px; padding:20px 32px; background:var(--warm-bg); border-top:1px solid var(--warm-light); align-items:flex-start; }
  .gm-icon { width:36px; height:36px; background:var(--warm); color:white; display:flex; align-items:center; justify-content:center; font-size:0.7rem; font-weight:700; letter-spacing:0.05em; flex-shrink:0; border-radius:4px; }
  .gm-label { font-size:0.68rem; letter-spacing:0.2em; color:var(--warm); margin-bottom:4px; }
  .gm-text { font-size:0.86rem; color:var(--gray-900); line-height:1.8; }

  /* ── 洞察 ── */
  .insights-section { background:var(--black); color:var(--white); padding:80px 0; }
  .insights-section .section-label { color:var(--warm); }
  .insights-section .section-title { color:var(--white); }
  .insight-card { display:flex; gap:20px; padding:28px 0; border-bottom:1px solid rgba(255,255,255,0.06); }
  .insight-card:last-child { border-bottom:none; }
  .insight-deco { display:flex; flex-direction:column; align-items:center; gap:8px; flex-shrink:0; width:40px; }
  .insight-number { font-family:"Noto Serif SC",Georgia,serif; font-size:1.2rem; color:var(--warm); font-weight:300; }
  .insight-line { width:1px; flex:1; background:rgba(200,168,130,0.3); }
  .insight-content { font-size:0.9rem; color:rgba(255,255,255,0.8); line-height:1.9; }

  /* ── 统计 3D 方块 ── */
  .stats-grid-3d { display:grid; grid-template-columns:repeat(4,1fr); gap:32px; margin-bottom:48px; }
  .stat-cube { position:relative; height:140px; transform-style:preserve-3d; transform:rotateX(-10deg) rotateY(15deg); transition:transform 0.5s cubic-bezier(0.22,1,0.36,1); animation:cubeEntry 0.6s ease var(--delay,0s) both; }
  .stat-cube:hover { transform:rotateX(-15deg) rotateY(20deg) translateY(-8px); }
  @keyframes cubeEntry { from{opacity:0;transform:rotateX(-30deg) rotateY(30deg) translateY(20px)} to{opacity:1;transform:rotateX(-10deg) rotateY(15deg)} }
  .cube-front { position:absolute; bottom:0; left:0; right:0; height:120px; background:var(--white); border:1px solid var(--gray-100); display:flex; flex-direction:column; align-items:center; justify-content:center; }
  .cube-top { position:absolute; top:0; left:0; right:0; height:30px; background:var(--warm-bg); border:1px solid var(--gray-100); transform:rotateX(70deg) translateZ(15px); transform-origin:bottom center; }
  .cube-right { position:absolute; top:0; right:-20px; width:22px; height:120px; background:color-mix(in srgb,var(--warm-bg) 50%,var(--gray-100)); border:1px solid var(--gray-100); transform:skewY(-20deg); transform-origin:top left; display:flex; align-items:center; justify-content:center; bottom:0; }
  .cube-right .stat-value { font-size:0.7rem; color:var(--gray-500); writing-mode:vertical-rl; }
  .stat-value { font-family:"Noto Serif SC",Georgia,serif; font-size:2rem; color:var(--warm); line-height:1.2; }
  .stat-label { font-size:0.72rem; color:var(--gray-500); letter-spacing:0.15em; margin-top:4px; }

  .activity-section { margin-top:32px; }
  .activity-title { font-family:"Noto Serif SC",Georgia,serif; font-size:1.1rem; color:var(--black); margin-bottom:20px; }
  .activity-row { display:flex; align-items:center; gap:12px; padding:10px 0; border-bottom:1px solid var(--gray-100); }
  .activity-rank { font-family:"Noto Serif SC",Georgia,serif; color:var(--warm); width:28px; font-size:0.9rem; flex-shrink:0; }
  .activity-avatar { width:28px; height:28px; border-radius:50%; flex-shrink:0; display:flex; align-items:center; justify-content:center; color:white; font-size:0.7rem; }
  .activity-info { flex:1; min-width:0; }
  .activity-name { font-size:0.85rem; color:var(--black); margin-bottom:4px; }
  .activity-bar-track { height:4px; background:var(--gray-100); border-radius:2px; overflow:hidden; }
  .activity-bar-fill { height:100%; border-radius:2px; transition:width 1s ease; }
  .activity-count { font-size:0.82rem; color:var(--gray-500); width:32px; text-align:right; flex-shrink:0; }

  .coverage-section { margin-top:48px; }
  .coverage-title { font-family:"Noto Serif SC",Georgia,serif; font-size:1.1rem; color:var(--black); margin-bottom:20px; }
  .coverage-item { display:flex; align-items:center; gap:12px; margin-bottom:12px; }
  .coverage-label { font-size:0.82rem; color:var(--gray-700); width:160px; flex-shrink:0; text-align:right; }
  .coverage-bar-track { flex:1; height:6px; background:var(--gray-100); border-radius:3px; overflow:hidden; position:relative; }
  .coverage-bar-fill { height:100%; background:var(--warm); border-radius:3px; transition:width 1s ease; }
  .coverage-pct { position:absolute; right:8px; top:-18px; font-size:0.7rem; color:var(--gray-500); }

  .reveal { opacity:0; transform:translateY(30px); transition:all 0.8s cubic-bezier(0.22,1,0.36,1); }
  .reveal.active { opacity:1; transform:translateY(0); }

  .quote-section { background:var(--black); padding:80px 0; position:relative; overflow:hidden; }
  .quote-deco { position:absolute; top:20px; left:40px; font-family:"Noto Serif SC",Georgia,serif; font-size:8rem; color:var(--warm); opacity:0.12; line-height:1; pointer-events:none; }
  .quote-text { font-family:"Noto Serif SC",Georgia,serif; font-size:1.3rem; color:rgba(255,255,255,0.85); font-weight:300; line-height:2; max-width:700px; margin:0 auto; text-align:center; position:relative; z-index:1; }
  .quote-attr { text-align:center; margin-top:24px; font-size:0.78rem; color:var(--warm); letter-spacing:0.15em; }

  footer { padding:48px 0; text-align:center; }
  .footer-grid { display:flex; justify-content:center; gap:48px; margin-bottom:24px; }
  .footer-col { text-align:left; }
  .footer-col-title { font-size:0.72rem; letter-spacing:0.2em; color:var(--warm); margin-bottom:8px; }
  .footer-col-item { font-size:0.78rem; color:var(--gray-500); line-height:2; }
  .footer-line { width:60px; height:1px; background:var(--gray-100); margin:24px auto; }
  .footer-copy { font-size:0.75rem; color:var(--gray-400); letter-spacing:0.1em; }

  /* ── 龙虾屋室内视图模态框 ── */
  .room-modal {
    position: fixed; top: 0; left: 0; width: 100%; height: 100%; z-index: 200;
    background: rgba(10,10,10,0.85); backdrop-filter: blur(12px);
    display: none; align-items: center; justify-content: center;
    opacity: 0; transition: opacity 0.4s cubic-bezier(0.22,1,0.36,1);
  }
  .room-modal.open { display: flex; opacity: 1; }
  .room-container {
    position: relative; width: 900px; max-width: 92vw; height: 620px; max-height: 85vh;
    background: var(--white); border: 1px solid var(--gray-100);
    box-shadow: 0 40px 120px rgba(0,0,0,0.4);
    overflow: hidden;
  }
  .room-close {
    position: absolute; top: 16px; right: 16px; z-index: 10;
    width: 32px; height: 32px; border: 1px solid var(--gray-300);
    background: rgba(250,250,250,0.9); cursor: pointer;
    display: flex; align-items: center; justify-content: center;
    font-size: 1rem; color: var(--gray-700); transition: all 0.3s;
  }
  .room-close:hover { border-color: var(--warm); color: var(--warm); }
  .room-header {
    position: absolute; top: 0; left: 0; right: 0; z-index: 5;
    padding: 20px 24px; display: flex; align-items: center; gap: 16px;
    background: linear-gradient(to bottom, rgba(250,250,250,0.95), rgba(250,250,250,0.7), transparent);
  }
  .room-avatar {
    width: 44px; height: 44px; border-radius: 50%;
    display: flex; align-items: center; justify-content: center;
    color: white; font-family: "Noto Serif SC",Georgia,serif; font-size: 1.2rem;
    box-shadow: 0 4px 16px rgba(0,0,0,0.15);
  }
  .room-info { flex: 1; }
  .room-name { font-family: "Noto Serif SC",Georgia,serif; font-size: 1.1rem; color: var(--black); }
  .room-meta { font-size: 0.75rem; color: var(--gray-500); letter-spacing: 0.08em; }
  .room-badge {
    font-size: 0.65rem; letter-spacing: 0.15em; border: 1px solid var(--warm);
    color: var(--warm); padding: 2px 10px; margin-left: 8px;
  }
  #room-canvas { display: block; width: 100%; height: 100%; }
  .room-sidebar {
    position: absolute; bottom: 0; left: 0; right: 0; z-index: 5;
    padding: 16px 24px; display: flex; gap: 12px; flex-wrap: wrap;
    background: linear-gradient(to top, rgba(250,250,250,0.95), rgba(250,250,250,0.7), transparent);
  }
  .room-skill-tag {
    font-size: 0.7rem; color: var(--gray-700); padding: 4px 12px;
    border: 1px solid var(--gray-100); background: rgba(250,250,250,0.8);
    display: flex; align-items: center; gap: 6px;
  }
  .room-skill-dot { width: 5px; height: 5px; border-radius: 50%; }
  .room-hint {
    position: absolute; bottom: 56px; right: 24px; z-index: 5;
    font-size: 0.65rem; color: var(--gray-400); letter-spacing: 0.1em;
  }

  /* ── 任务面板 ── */
  .task-panel {
    position: absolute; bottom: 0; left: 0; right: 0; z-index: 8;
    background: rgba(250,250,250,0.97); border-top: 1px solid var(--gray-100);
    padding: 12px 20px 16px; transform: translateY(100%);
    transition: transform 0.4s cubic-bezier(0.22,1,0.36,1);
  }
  .task-panel.open { transform: translateY(0); }
  .task-panel-toggle {
    position: absolute; top: -32px; left: 50%; transform: translateX(-50%);
    padding: 4px 16px; font-size: 0.72rem; letter-spacing: 0.1em; color: var(--warm);
    background: rgba(250,250,250,0.95); border: 1px solid var(--gray-100);
    border-bottom: none; cursor: pointer; transition: all 0.3s;
    font-family: inherit;
  }
  .task-panel-toggle:hover { color: var(--black); border-color: var(--warm); }
  .task-templates { display: flex; gap: 6px; flex-wrap: wrap; margin-bottom: 8px; }
  .task-tpl-btn {
    font-size: 0.68rem; padding: 3px 10px; border: 1px solid var(--gray-100);
    background: var(--white); color: var(--gray-700); cursor: pointer;
    transition: all 0.2s; font-family: inherit;
  }
  .task-tpl-btn:hover { border-color: var(--warm); color: var(--warm); }
  .task-tpl-btn.active { border-color: var(--warm); color: var(--warm); background: var(--warm-bg); }
  .task-tpl-btn[data-cat="openclaw"]::before { content: '🦞 '; }
  .task-input-row { display: flex; gap: 8px; }
  .task-input {
    flex: 1; padding: 8px 12px; border: 1px solid var(--gray-100); font-size: 0.82rem;
    font-family: inherit; color: var(--dark); background: var(--white); outline: none;
    transition: border-color 0.3s;
  }
  .task-input:focus { border-color: var(--warm); }
  .task-input::placeholder { color: var(--gray-400); }
  .task-submit {
    padding: 8px 20px; background: var(--warm); color: white; border: none;
    font-size: 0.78rem; cursor: pointer; font-family: inherit;
    letter-spacing: 0.08em; transition: all 0.3s;
  }
  .task-submit:hover { background: #b8986e; }
  .task-submit:disabled { background: var(--gray-300); cursor: wait; }
  .task-status { font-size: 0.7rem; color: var(--gray-500); margin-top: 6px; min-height: 16px; }
  /* OpenClaw 状态 */
  .oc-status {
    position: absolute; top: 70px; left: 16px; z-index: 6;
    background: rgba(26,26,26,0.88); color: rgba(255,255,255,0.8);
    padding: 8px 14px; font-size: 0.68rem; border: 1px solid rgba(200,168,130,0.2);
    backdrop-filter: blur(8px); max-width: 180px;
  }
  .oc-status-title { font-size: 0.6rem; letter-spacing: 0.2em; color: var(--warm); margin-bottom: 4px; }
  .oc-status-item { display: flex; gap: 6px; margin-bottom: 2px; color: rgba(255,255,255,0.6); }
  .oc-status-item .oc-val { color: rgba(255,255,255,0.9); }

  /* ── 任务结果弹窗 ── */
  .result-modal {
    position: fixed; top: 0; left: 0; width: 100%; height: 100%; z-index: 300;
    background: rgba(10,10,10,0.9); display: none; align-items: center; justify-content: center;
    backdrop-filter: blur(16px);
  }
  .result-modal.open { display: flex; }
  .result-container {
    width: 800px; max-width: 90vw; max-height: 85vh; background: var(--white);
    border: 1px solid var(--gray-100); overflow-y: auto;
    box-shadow: 0 40px 120px rgba(0,0,0,0.5);
  }
  .result-header {
    padding: 24px 28px 16px; border-bottom: 1px solid var(--gray-100);
    position: sticky; top: 0; background: var(--white); z-index: 2;
  }
  .result-header::before { content: ''; position: absolute; top: 0; left: 0; right: 0; height: 3px; background: var(--warm); }
  .result-label { font-size: 0.65rem; letter-spacing: 0.3em; color: var(--warm); margin-bottom: 6px; }
  .result-title { font-family: "Noto Serif SC",Georgia,serif; font-size: 1.15rem; color: var(--black); }
  .result-meta { font-size: 0.78rem; color: var(--gray-500); margin-top: 4px; }
  .result-body { padding: 28px; font-size: 0.9rem; line-height: 1.9; color: var(--dark); white-space: pre-wrap; }
  .result-footer {
    padding: 16px 28px; border-top: 1px solid var(--gray-100);
    display: flex; gap: 12px; justify-content: flex-end;
    position: sticky; bottom: 0; background: var(--white);
  }
  .result-btn {
    padding: 8px 20px; font-size: 0.78rem; cursor: pointer; font-family: inherit;
    letter-spacing: 0.08em; transition: all 0.3s; border: 1px solid var(--gray-100);
    background: var(--white); color: var(--gray-700);
  }
  .result-btn:hover { border-color: var(--warm); color: var(--warm); }
  .result-btn.primary { background: var(--warm); color: white; border-color: var(--warm); }
  .result-btn.primary:hover { background: #b8986e; }

  /* ── 赏金详情弹窗 ── */
  .bounty-detail-modal {
    position: fixed; top: 0; left: 0; width: 100%; height: 100%; z-index: 250;
    background: rgba(10,10,10,0.88); display: none; align-items: center; justify-content: center;
    backdrop-filter: blur(14px);
  }
  .bounty-detail-modal.open { display: flex; }
  .bd-container {
    width: 640px; max-width: 90vw; max-height: 85vh;
    background: var(--black); color: rgba(255,255,255,0.85);
    border: 1px solid rgba(200,168,130,0.25); overflow-y: auto;
    box-shadow: 0 40px 120px rgba(0,0,0,0.6); border-radius: 4px;
  }
  .bd-header {
    padding: 20px 24px 14px; border-bottom: 1px solid rgba(200,168,130,0.15);
    position: sticky; top: 0; background: var(--black); z-index: 2;
  }
  .bd-header::before { content: ''; position: absolute; top: 0; left: 0; right: 0; height: 3px; background: var(--warm); }
  .bd-label { font-size: 0.6rem; letter-spacing: 0.25em; color: var(--warm); margin-bottom: 4px; text-transform: uppercase; }
  .bd-title { font-family: "Noto Serif SC",Georgia,serif; font-size: 1.2rem; color: rgba(255,255,255,0.95); }
  .bd-status-row { display: flex; align-items: center; gap: 10px; margin-top: 8px; flex-wrap: wrap; }
  .bd-badge { padding: 2px 10px; border-radius: 2px; font-size: 0.6rem; font-weight: 500; }
  .bd-badge-reward { background: rgba(200,168,130,0.2); color: var(--warm-light); }
  .bd-badge-status { background: rgba(100,240,200,0.15); color: #64f0c8; }
  .bd-badge-status.failed { background: rgba(240,100,100,0.15); color: #f08080; }
  .bd-badge-rating { color: var(--warm-light); font-size: 0.7rem; }
  .bd-body { padding: 20px 24px; }
  .bd-section { margin-bottom: 20px; }
  .bd-section-title {
    font-size: 0.55rem; letter-spacing: 0.2em; color: var(--warm);
    text-transform: uppercase; margin-bottom: 8px;
    padding-bottom: 4px; border-bottom: 1px solid rgba(200,168,130,0.1);
  }
  .bd-row { display: flex; justify-content: space-between; padding: 4px 0; font-size: 0.78rem; }
  .bd-row-label { color: rgba(255,255,255,0.5); }
  .bd-row-val { color: rgba(255,255,255,0.8); }
  .bd-desc {
    font-size: 0.82rem; line-height: 1.7; color: rgba(255,255,255,0.65);
    padding: 12px 16px; background: rgba(255,255,255,0.03);
    border-left: 2px solid rgba(200,168,130,0.3); border-radius: 2px;
  }
  .bd-img {
    width: 100%; max-height: 400px; object-fit: contain;
    border: 1px solid rgba(200,168,130,0.15); border-radius: 3px; margin-top: 8px;
  }
  .bd-output {
    font-size: 0.78rem; line-height: 1.7; color: rgba(255,255,255,0.7);
    white-space: pre-wrap; font-family: 'Courier New', monospace;
    padding: 12px 16px; background: rgba(255,255,255,0.03);
    border-radius: 2px; max-height: 200px; overflow-y: auto;
  }
  .bd-timeline { padding-left: 16px; border-left: 1px solid rgba(200,168,130,0.2); }
  .bd-tl-item { position: relative; margin-bottom: 12px; padding-left: 12px; }
  .bd-tl-item::before {
    content: ''; position: absolute; left: -20px; top: 6px;
    width: 8px; height: 8px; border-radius: 50%; background: var(--warm);
  }
  .bd-tl-time { font-size: 0.6rem; color: rgba(255,255,255,0.35); }
  .bd-tl-text { font-size: 0.75rem; color: rgba(255,255,255,0.7); margin-top: 2px; }
  .bd-cards { display: flex; gap: 6px; flex-wrap: wrap; }
  .bd-card-tag {
    padding: 3px 10px; border: 1px solid rgba(200,168,130,0.2);
    border-radius: 2px; font-size: 0.62rem; color: var(--warm-light);
  }
  .bd-comment {
    font-size: 0.82rem; color: rgba(255,255,255,0.7); font-style: italic;
    padding: 10px 16px; background: rgba(200,168,130,0.06);
    border-radius: 2px; border-left: 2px solid var(--warm);
  }
  .bd-footer {
    padding: 14px 24px; border-top: 1px solid rgba(200,168,130,0.15);
    display: flex; justify-content: flex-end; position: sticky; bottom: 0;
    background: var(--black);
  }
  .bd-close {
    padding: 8px 24px; font-size: 0.75rem; cursor: pointer;
    border: 1px solid rgba(200,168,130,0.3); background: transparent;
    color: var(--warm); letter-spacing: 0.1em; transition: all 0.3s;
    font-family: inherit;
  }
  .bd-close:hover { background: rgba(200,168,130,0.1); border-color: var(--warm); }

  /* ── 媒体面板（四格同屏 + 实况） ── */
  .media-section { background: var(--black); color: var(--white); border-bottom: 1px solid rgba(255,255,255,0.06); }
  .media-section-title {
    padding: 16px 24px 0; font-size: 0.6rem; letter-spacing: 0.35em; color: var(--warm);
    display: flex; align-items: center; gap: 8px;
  }
  .live-dot { width: 6px; height: 6px; border-radius: 50%; background: #ff5f63; animation: livePulse 1.5s infinite; }
  @keyframes livePulse { 0%,100%{opacity:1} 50%{opacity:0.3} }

  /* 电视台 4 格等宽 */
  .tv-4overlay {
    position:absolute;bottom:0;left:0;right:0;padding:4px 8px;
    background:linear-gradient(to top,rgba(0,0,0,0.8),transparent);
    font-size:0.58rem;color:rgba(255,255,255,0.6);font-family:monospace;
    display:flex;align-items:center;gap:5px;
  }
  .tv-4cell:hover { outline: 2px solid #c8a882; z-index: 1; }
  .tv-4cell .tv-standby-4 {
    position:absolute;top:0;left:0;right:0;bottom:0;background:#0a0c10;
    display:flex;flex-direction:column;align-items:center;justify-content:center;cursor:pointer;z-index:2;
  }
  /* 电视台：左侧实况大屏 + 右侧五格（2×2 + 底部国际新闻） */
  .tv-layout { display: grid; grid-template-columns: 1fr 1fr; gap: 0; min-height: 380px; }
  .tv-live-screen {
    position: relative; background: #0a0c10; border-right: 1px solid rgba(255,255,255,0.06);
    display: flex; flex-direction: column; overflow: hidden;
  }
  .tv-live-screen video, .tv-live-screen iframe { width: 100%; flex: 1; border: none; background: #000; object-fit: contain; }
  .tv-live-overlay {
    position: absolute; bottom: 0; left: 0; right: 0; padding: 8px 14px;
    background: linear-gradient(to top, rgba(0,0,0,0.85), transparent);
    font-size: 0.65rem; color: rgba(255,255,255,0.6); display: flex; align-items: center; gap: 6px;
  }
  .tv-live-overlay .live-badge { background: #ff5f63; color: white; padding: 1px 6px; font-size: 0.55rem; letter-spacing: 0.1em; }
  .tv-ch-bar {
    display: flex; gap: 2px; padding: 6px 8px; background: rgba(0,0,0,0.9);
    border-top: 1px solid rgba(255,255,255,0.06); flex-wrap: wrap;
  }
  .tv-ch-btn {
    font-size: 0.58rem; padding: 2px 8px; border: 1px solid rgba(255,255,255,0.12);
    background: none; color: rgba(255,255,255,0.5); cursor: pointer; font-family: inherit; transition: all 0.2s;
  }
  .tv-ch-btn:hover, .tv-ch-btn.active { border-color: #ff5f63; color: #ff5f63; background: rgba(255,95,99,0.08); }
  .tv-right { display: grid; grid-template-columns: 1fr 1fr 1fr; grid-template-rows: 1fr 1fr; gap: 1px; background: rgba(255,255,255,0.04); }
  .tv-intl-news {
    grid-column: 1 / -1; padding: 10px 14px; background: rgba(6,14,22,0.95);
    font-family: 'Courier New', monospace; border-top: 1px solid rgba(100,240,200,0.15);
  }
  .tv-intl-label { font-size: 0.55rem; letter-spacing: 0.2em; color: #64f0c8; margin-bottom: 4px; }
  .tv-intl-ticker {
    font-size: 0.65rem; color: rgba(255,255,255,0.6); overflow: hidden; white-space: nowrap;
    position: relative; height: 36px; line-height: 18px;
  }
  .tv-intl-ticker .ticker-inner {
    display: inline-block; animation: tickerScroll 30s linear infinite;
  }
  @keyframes tickerScroll { from{transform:translateX(100%)} to{transform:translateX(-100%)} }
  .tv-cell {
    padding: 10px 12px; background: rgba(6,14,22,0.9); position: relative; overflow: hidden;
    font-family: 'Courier New', monospace; display: flex; flex-direction: column;
  }
  .tv-cell-label { font-size: 0.58rem; letter-spacing: 0.2em; color: var(--warm); margin-bottom: 6px; display: flex; align-items: center; gap: 5px; }
  .tv-cell-content { font-size: 0.68rem; color: rgba(255,255,255,0.65); line-height: 1.7; max-height: 80%; overflow-y: auto; flex: 1; }
  .tv-cell-content::-webkit-scrollbar { width: 2px; }
  .tv-cell-content::-webkit-scrollbar-thumb { background: rgba(200,168,130,0.3); }
  .tv-cell-content .tv-item { padding: 2px 0; border-bottom: 1px solid rgba(255,255,255,0.03); }
  .tv-cell .scanline {
    position: absolute; top: 0; left: 0; right: 0; height: 1px;
    background: rgba(100,240,200,0.1); animation: scanDown 5s linear infinite;
  }
  @keyframes scanDown { from{top:0} to{top:100%} }

  /* 广播台：四栏平铺 */
  .radio-layout { display: grid; grid-template-columns: repeat(4, 1fr); gap: 1px; background: rgba(255,255,255,0.04); min-height: 180px; }
  .radio-cell {
    padding: 14px 16px; background: rgba(6,14,22,0.92); position: relative;
    font-family: 'Courier New', monospace;
  }
  .radio-cell-icon { font-size: 1.3rem; margin-bottom: 4px; }
  .radio-cell-name { font-size: 0.68rem; color: rgba(255,255,255,0.8); margin-bottom: 4px; }
  .radio-now { font-size: 0.65rem; color: var(--warm); margin-bottom: 8px; padding: 4px 8px; background: rgba(200,168,130,0.08); border-left: 2px solid var(--warm); }
  .radio-playlist { font-size: 0.62rem; color: rgba(255,255,255,0.5); line-height: 1.7; max-height: 100px; overflow-y: auto; }
  .radio-playlist::-webkit-scrollbar { width: 2px; }
  .radio-playlist::-webkit-scrollbar-thumb { background: rgba(200,168,130,0.3); }
  .radio-playlist .radio-item { padding: 2px 0; }
  .radio-player { margin-top: 8px; }
  .radio-player audio { width: 100%; height: 28px; opacity: 0.7; }
  .radio-eq {
    display: flex; align-items: flex-end; gap: 2px; height: 20px; margin-top: 6px;
  }
  .radio-eq-bar {
    width: 3px; background: var(--warm); border-radius: 1px 1px 0 0;
    animation: eqBounce 0.8s ease-in-out infinite alternate;
  }
  @keyframes eqBounce { from{height:3px} to{height:var(--h,16px)} }

  .economy-strip {
    display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap: 1px;
    background: var(--gray-100); border-bottom: 1px solid var(--gray-100);
  }
  .biz-card {
    padding: 14px 16px; background: var(--white); transition: all 0.3s;
    cursor: default; position: relative; overflow: hidden;
  }
  .biz-card:hover { background: var(--warm-bg); }
  .biz-card::before { content: ''; position: absolute; top: 0; left: 0; width: 0; height: 2px; background: var(--warm); transition: width 0.3s; }
  .biz-card:hover::before { width: 100%; }
  .biz-icon { font-size: 1.3rem; margin-bottom: 4px; }
  .biz-name { font-size: 0.78rem; color: var(--black); font-weight: 500; margin-bottom: 2px; }
  .biz-meta { font-size: 0.65rem; color: var(--gray-500); }
  .biz-staff { font-size: 0.62rem; color: var(--warm); margin-top: 4px; }
  .biz-rev { font-size: 0.62rem; color: var(--gray-500); }
  .biz-rep-bar { height: 2px; background: var(--gray-100); margin-top: 6px; border-radius: 1px; overflow: hidden; }
  .biz-rep-fill { height: 100%; background: var(--warm); border-radius: 1px; }

  .leaderboard-strip {
    display: grid; grid-template-columns: repeat(3, 1fr); gap: 0;
    border-bottom: 1px solid var(--gray-100);
  }
  .lb-col { padding: 16px 20px; border-right: 1px solid var(--gray-100); }
  .lb-col:last-child { border-right: none; }
  .lb-title { font-size: 0.62rem; letter-spacing: 0.25em; color: var(--warm); margin-bottom: 8px; }
  .lb-item { display: flex; align-items: center; gap: 8px; font-size: 0.72rem; color: var(--gray-700); padding: 2px 0; }
  .lb-rank { font-family: "Noto Serif SC",Georgia,serif; color: var(--warm); width: 16px; font-size: 0.8rem; }
  .lb-val { margin-left: auto; font-size: 0.68rem; color: var(--gray-500); font-family: monospace; }

  @media(max-width:768px) {
    .map-hero { min-height:500px; }
    .tv-layout { grid-template-columns: 1fr; }
    .tv-grid { grid-template-columns: 1fr; }
    .radio-layout { grid-template-columns: repeat(2, 1fr); }
    .economy-strip { grid-template-columns: repeat(2, 1fr); }
    .leaderboard-strip { grid-template-columns: 1fr; }
    .map-overlay h1 { font-size:1.5rem; }
    .map-legend { display:none; }
    .cards-grid { grid-template-columns:1fr; }
    .flip-card { height:320px; }
    .stats-grid-3d { grid-template-columns:repeat(2,1fr); gap:16px; }
    .section { padding:48px 0; }
    .network-canvas-wrap { height:350px; }
    .coverage-item { flex-direction:column; align-items:flex-start; }
    .coverage-label { width:auto; text-align:left; }
  }
</style>
</head>
<body>

<nav>
  <div class="container">
    <div class="nav-logo">龙虾小镇</div>
    <div class="nav-links">
      <a href="#town">小镇</a>
      <a href="#agents">居民</a>
      <a href="#network">关系</a>
      <a href="#rounds">讨论</a>
      <a href="#insights">洞察</a>
      <a href="#stats">统计</a>
    </div>
  </div>
</nav>

<!-- 用户登录 -->
<div class="login-modal" id="login-modal">
  <div class="login-box">
    <div class="login-title">🦞 欢迎来到龙虾小镇</div>
    <div class="login-sub">通过 OpenClaw 身份登录，成为小镇居民</div>
    <div class="login-field">
      <label class="login-label">昵称</label>
      <input class="login-input" id="login-name" placeholder="你的名字" />
    </div>
    <div class="login-field">
      <label class="login-label">MBTI 人格</label>
      <select class="login-select" id="login-mbti">
        <option value="ENFP">ENFP 灵感催化剂</option><option value="INTJ">INTJ 战略建筑师</option>
        <option value="ENTP">ENTP 魔鬼辩手</option><option value="INFJ">INFJ 远见共情者</option>
        <option value="ENTJ">ENTJ 铁腕指挥官</option><option value="INFP">INFP 理想调停者</option>
        <option value="ENFJ">ENFJ 感召导师</option><option value="INTP">INTP 逻辑探索者</option>
        <option value="ISTJ">ISTJ 可靠执行者</option><option value="ESFP">ESFP 活力表演家</option>
        <option value="ISTP">ISTP 冷静工匠</option><option value="ESTP">ESTP 行动派冒险家</option>
        <option value="ISFJ">ISFJ 守护后勤</option><option value="ESFJ">ESFJ 社交协调者</option>
        <option value="ISFP">ISFP 自由艺术家</option><option value="ESTJ">ESTJ 效率监督官</option>
      </select>
    </div>
    <div class="login-field">
      <label class="login-label">职业</label>
      <input class="login-input" id="login-role" placeholder="如：独立开发者、产品经理..." />
    </div>
    <div class="login-field">
      <label class="login-label">OpenClaw ID（可选）</label>
      <input class="login-input" id="login-openclaw" placeholder="你的 OpenClaw Agent ID" />
    </div>
    <div class="login-field">
      <label class="login-label">宠物龙虾名字</label>
      <input class="login-input" id="login-pet" placeholder="给你的龙虾起个名字" value="小龙" />
    </div>
    <button class="login-btn" id="login-submit">🦞 进入龙虾小镇</button>
    <div class="login-skip" id="login-skip">跳过登录，以访客身份浏览</div>
  </div>
</div>

<!-- 用户信息条 -->
<div class="user-bar" id="user-bar">
  <span>🦞</span>
  <span class="user-name" id="ub-name"></span>
  <span id="ub-mbti"></span>
  <span>|</span>
  <span id="ub-tokens"></span>¤
  <span class="mode-badge resident" id="ub-mode">居民</span>
</div>

<section class="map-hero" id="town">
  <!-- 右侧统一面板 -->
  <div class="right-panel" id="right-panel">
    <div class="rp-section rp-top">
      <div class="rp-clock" id="day-clock">
        <div class="day-clock-time" id="clock-time">06:00</div>
        <div class="day-clock-label" id="clock-label">清晨</div>
      </div>
      <div class="rp-token" id="token-panel">
        <div class="token-panel-title">TOKEN</div>
        <div class="token-row"><span>Calls</span><span class="token-val" id="tk-calls">0</span></div>
        <div class="token-row"><span>Est.</span><span class="token-val" id="tk-tokens">0</span></div>
        <div class="token-row"><span>Cost</span><span class="token-val" id="tk-cost">$0.00</span></div>
      </div>
      <div class="rp-zoom">
        <button class="map-btn" id="zoom-in">+</button>
        <button class="map-btn" id="zoom-out">&minus;</button>
        <button class="map-btn" id="zoom-reset">R</button>
      </div>
    </div>
    <div class="rp-section rp-bounty" id="bounty-wall">
      <div class="bounty-wall-header">
        <span class="bounty-wall-title">BOUNTY WALL</span>
        <span class="bounty-wall-count" id="bw-count">0</span>
      </div>
      <div id="bw-list">
        <div class="bounty-wall-empty">暂无赏金</div>
      </div>
      <button class="bounty-wall-refresh" id="bw-refresh">REFRESH</button>
    </div>
  </div>
  <canvas id="town-map"></canvas>
  <div class="map-tooltip" id="map-tooltip">
    <div class="tt-name"></div>
    <div class="tt-role"></div>
    <div class="tt-mbti"></div>
  </div>
  <div class="map-legend">
    <div class="map-legend-title">地图图例</div>
    <div class="map-legend-item"><div class="map-legend-color" style="background:#8b9e6b"></div>山脉</div>
    <div class="map-legend-item"><div class="map-legend-color" style="background:#7badc4"></div>河流</div>
    <div class="map-legend-item"><div class="map-legend-color" style="background:#c8a882"></div>道路</div>
    <div class="map-legend-item"><div class="map-legend-color" style="background:#b07050"></div>居民房屋</div>
    <div class="map-legend-item"><div class="map-legend-color" style="background:#8b2020"></div>人类用户</div>
    <div class="map-legend-item"><div class="map-legend-color" style="background:#6b8b5e"></div>树木</div>
    <div class="map-legend-item"><div class="map-legend-color" style="background:#c8a882;border-radius:50%"></div>公共设施</div>
    <div class="map-legend-item"><div class="map-legend-color" style="background:#c8a882;animation:breathe 2s ease-in-out infinite"></div>🎮 游戏厅</div>
    <div class="map-legend-item"><div class="map-legend-color" style="background:#8b2020;animation:breathe 3s ease-in-out infinite"></div>🔮 龙虾杀</div>
    <div class="map-legend-item"><div class="map-legend-color" style="background:#2a6a4a"></div>📈 股票大厅</div>
    <div class="map-legend-item"><div class="map-legend-color" style="background:#c8a060"></div>公交车</div>
  </div>
  <div class="speed-controls">
    <button class="speed-btn" data-speed="0.5">0.5x</button>
    <button class="speed-btn active" data-speed="1">1x</button>
    <button class="speed-btn" data-speed="3">3x</button>
    <button class="speed-btn" data-speed="8">8x</button>
  </div>
  <!-- 赏金详情弹窗 -->
  <div class="bounty-detail-modal" id="bounty-detail-modal">
    <div class="bd-container" id="bd-container"></div>
  </div>
  <div class="map-overlay">
    <div class="container">
      <div class="hero-label">OPENCLAW DISCUSSION TOWN</div>
      <h1>龙虾小镇</h1>
      <p>${log.agents.length} 位居民散居在小镇的道路两旁，每一栋房屋都映射着主人的性格色彩。</p>
      <div class="map-stats">
        <div><div class="map-stat-val">${log.agents.length}</div><div class="map-stat-lbl">居民</div></div>
        <div><div class="map-stat-val">${log.metadata.totalRounds}</div><div class="map-stat-lbl">轮次</div></div>
        <div><div class="map-stat-val">${log.metadata.totalUtterances}</div><div class="map-stat-lbl">发言</div></div>
        <div><div class="map-stat-val">${log.insights.length}</div><div class="map-stat-lbl">洞察</div></div>
      </div>
    </div>
  </div>
</section>

<!-- 龙虾屋室内视图模态框 -->
<div class="room-modal" id="room-modal">
  <div class="room-container">
    <button class="room-close" id="room-close">&times;</button>
    <div class="room-header">
      <div class="room-avatar" id="room-avatar"></div>
      <div class="room-info">
        <div class="room-name" id="room-name"></div>
        <div class="room-meta" id="room-meta"></div>
      </div>
      <div class="room-badge" id="room-badge"></div>
    </div>
    <canvas id="room-canvas"></canvas>
    <!-- 商店面板（覆盖在房间上） -->
    <div id="shop-panel" style="display:none;position:absolute;top:0;left:0;right:0;bottom:0;background:rgba(10,10,10,0.92);z-index:10;overflow-y:auto;padding:20px;">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;">
        <div style="font-size:1rem;color:#c8a882;font-family:'Noto Serif SC',serif;">LOBSTER SHOP</div>
        <div style="display:flex;gap:12px;align-items:center;">
          <span id="shop-balance" style="font-size:0.7rem;color:#c8a882;font-family:monospace;"></span>
          <button id="shop-close-btn" style="background:none;border:1px solid rgba(255,255,255,0.2);color:rgba(255,255,255,0.6);padding:2px 12px;font-size:0.7rem;cursor:pointer;font-family:monospace;">CLOSE</button>
        </div>
      </div>
      <div id="shop-items" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:8px;"></div>
    </div>
    <div id="room-tv" style="position:absolute;top:10%;left:50%;transform:translateX(-50%);width:52%;height:32%;display:none;z-index:4;">
      <div style="display:flex;gap:3px;width:100%;height:100%;">
        <div id="tv-main" style="flex:3;background:#0a0c10;border:2px solid #2a2a2a;border-radius:2px;position:relative;cursor:pointer;overflow:hidden;">
          <video id="room-tv-video" muted playsinline style="width:100%;height:100%;object-fit:cover;"></video>
          <div style="position:absolute;bottom:0;left:0;right:0;padding:3px 8px;background:linear-gradient(to top,rgba(0,0,0,0.85),transparent);font-size:0.55rem;color:rgba(255,255,255,0.5);font-family:monospace;display:flex;align-items:center;gap:4px;">
            <span style="background:#ff5f63;color:#fff;padding:0 4px;font-size:0.5rem;">LIVE</span>
            <span id="room-tv-ch">CCTV-1</span>
            <button id="room-tv-mute" style="margin-left:auto;background:none;border:1px solid rgba(255,255,255,0.2);color:rgba(255,255,255,0.5);padding:0 6px;font-size:0.5rem;cursor:pointer;font-family:monospace;">MUTE</button>
            <button id="room-tv-pause" style="background:none;border:1px solid rgba(255,255,255,0.2);color:rgba(255,255,255,0.5);padding:0 6px;font-size:0.5rem;cursor:pointer;font-family:monospace;">PAUSE</button>
          </div>
        </div>
        <div style="flex:1;display:flex;flex-direction:column;gap:3px;">
          <div class="tv-thumb" data-ch="1" style="flex:1;background:#0a0c10;border:1px solid #333;border-radius:2px;position:relative;cursor:pointer;overflow:hidden;">
            <video class="tv-thumb-video" muted playsinline style="width:100%;height:100%;object-fit:cover;pointer-events:none;"></video>
            <div style="position:absolute;bottom:0;left:0;right:0;padding:1px 4px;background:rgba(0,0,0,0.7);font-size:0.45rem;color:rgba(255,255,255,0.4);font-family:monospace;" class="tv-thumb-label"></div>
          </div>
          <div class="tv-thumb" data-ch="2" style="flex:1;background:#0a0c10;border:1px solid #333;border-radius:2px;position:relative;cursor:pointer;overflow:hidden;">
            <video class="tv-thumb-video" muted playsinline style="width:100%;height:100%;object-fit:cover;pointer-events:none;"></video>
            <div style="position:absolute;bottom:0;left:0;right:0;padding:1px 4px;background:rgba(0,0,0,0.7);font-size:0.45rem;color:rgba(255,255,255,0.4);font-family:monospace;" class="tv-thumb-label"></div>
          </div>
          <div class="tv-thumb" data-ch="3" style="flex:1;background:#0a0c10;border:1px solid #333;border-radius:2px;position:relative;cursor:pointer;overflow:hidden;">
            <video class="tv-thumb-video" muted playsinline style="width:100%;height:100%;object-fit:cover;pointer-events:none;"></video>
            <div style="position:absolute;bottom:0;left:0;right:0;padding:1px 4px;background:rgba(0,0,0,0.7);font-size:0.45rem;color:rgba(255,255,255,0.4);font-family:monospace;" class="tv-thumb-label"></div>
          </div>
        </div>
      </div>
    </div>
    <div class="oc-status" id="oc-status">
      <div class="oc-status-title">OPENCLAW</div>
      <div class="oc-status-item">SOUL: <span class="oc-val" id="oc-soul"></span></div>
      <div class="oc-status-item">技能: <span class="oc-val" id="oc-skills"></span></div>
      <div class="oc-status-item">待办: <span class="oc-val" id="oc-tasks"></span></div>
      <div class="oc-status-item">成果: <span class="oc-val" id="oc-history"></span></div>
    </div>
    <div class="room-sidebar" id="room-skills"></div>
    <div class="task-panel" id="task-panel">
      <button class="task-panel-toggle" id="task-toggle">分配任务</button>
      <div class="task-templates" id="task-templates"></div>
      <div class="task-input-row">
        <input class="task-input" id="task-input" placeholder="输入自定义任务..." />
        <button class="task-submit" id="task-submit">执行任务</button>
      </div>
      <div class="task-status" id="task-status"></div>
    </div>
  </div>
</div>

<!-- 任务结果弹窗 -->
<div class="result-modal" id="result-modal">
  <div class="result-container">
    <div class="result-header">
      <div class="result-label">AGENT 任务成果</div>
      <div class="result-title" id="result-title"></div>
      <div class="result-meta" id="result-meta"></div>
    </div>
    <div class="result-body" id="result-body"></div>
    <div class="result-footer">
      <button class="result-btn" id="result-close">关闭</button>
      <button class="result-btn primary" id="result-save">已保存到成果库</button>
    </div>
  </div>
</div>

<!-- ═══ 电视台（4频道横向等宽） ═══ -->
<div class="media-section" id="media-section">
  <div class="media-section-title"><span class="live-dot"></span> LOBSTER TV</div>
  <div id="tv-4grid" style="display:grid;grid-template-columns:repeat(4,1fr);gap:2px;height:220px;background:#000;">
    <div class="tv-4cell" data-ch="0" style="position:relative;background:#0a0c10;cursor:pointer;overflow:hidden;">
      <video id="tv-video-0" muted playsinline style="width:100%;height:100%;object-fit:cover;"></video>
      <div class="tv-4overlay"><span class="live-badge">LIVE</span><span class="tv-4name"></span></div>
    </div>
    <div class="tv-4cell" data-ch="1" style="position:relative;background:#0a0c10;cursor:pointer;overflow:hidden;">
      <video id="tv-video-1" muted playsinline style="width:100%;height:100%;object-fit:cover;"></video>
      <div class="tv-4overlay"><span class="live-badge">LIVE</span><span class="tv-4name"></span></div>
    </div>
    <div class="tv-4cell" data-ch="2" style="position:relative;background:#0a0c10;cursor:pointer;overflow:hidden;">
      <video id="tv-video-2" muted playsinline style="width:100%;height:100%;object-fit:cover;"></video>
      <div class="tv-4overlay"><span class="live-badge">LIVE</span><span class="tv-4name"></span></div>
    </div>
    <div class="tv-4cell" data-ch="3" style="position:relative;background:#0a0c10;cursor:pointer;overflow:hidden;">
      <video id="tv-video-3" muted playsinline style="width:100%;height:100%;object-fit:cover;"></video>
      <div class="tv-4overlay"><span class="live-badge">LIVE</span><span class="tv-4name"></span></div>
    </div>
  </div>
  <div class="tv-right" id="tv-right-grid" style="margin-top:1px;"></div>

  <!-- ═══ 广播台（四栏同时显示） ═══ -->
  <div class="media-section-title" style="padding-top:12px"><span class="live-dot"></span> LOBSTER RADIO</div>
  <div class="radio-layout" id="radio-layout"></div>
</div>

<!-- 经济面板：12 家企业 -->
<div class="economy-strip" id="economy-strip"></div>

<!-- 排行榜 -->
<div class="leaderboard-strip" id="leaderboard-strip">
  <div class="lb-col" id="lb-wealth"><div class="lb-title">💰 财富榜</div></div>
  <div class="lb-col" id="lb-popularity"><div class="lb-title">⭐ 人气榜</div></div>
  <div class="lb-col" id="lb-productivity"><div class="lb-title">🏆 生产力榜</div></div>
</div>

<section class="section" id="agents">
  <div class="container">
    <div class="section-header">
      <div class="section-label">01 / RESIDENTS</div>
      <div class="section-title">小镇居民</div>
      <div class="section-desc">悬停卡片翻转查看人格维度与技能分布</div>
    </div>
    <div class="cards-grid">${agentCards}</div>
  </div>
</section>

<section class="network-section" id="network">
  <div class="container">
    <div class="section-header">
      <div class="section-label">02 / CONNECTIONS</div>
      <div class="section-title">居民关系网络</div>
      <div class="section-desc">基于讨论中的回复关系绘制，线条越粗代表互动越频繁</div>
    </div>
    <div class="network-canvas-wrap"><canvas id="network-canvas"></canvas></div>
  </div>
</section>

<section class="quote-section">
  <div class="container" style="position:relative">
    <div class="quote-deco">&ldquo;</div>
    <div class="quote-text">当 ${log.agents.length} 个不同人格的 Agent 围坐讨论时，<br>最有价值的不是共识，而是分歧中浮现的新可能性。</div>
    <div class="quote-attr">— GAME MASTER</div>
  </div>
</section>

<section class="section" id="rounds">
  <div class="container">
    <div class="section-header">
      <div class="section-label">03 / DISCUSSIONS</div>
      <div class="section-title">讨论记录</div>
      <div class="section-desc">每轮讨论包含情感分布分析</div>
    </div>
    ${roundsHtml}
  </div>
</section>

<section class="insights-section" id="insights">
  <div class="container">
    <div class="section-header">
      <div class="section-label">04 / INSIGHTS</div>
      <div class="section-title">跨话题洞察</div>
    </div>
    <div class="insights-grid">${insightsHtml}</div>
  </div>
</section>

<section class="section" id="stats">
  <div class="container">
    <div class="section-header">
      <div class="section-label">05 / STATISTICS</div>
      <div class="section-title">数据总览</div>
    </div>
    ${statsHtml}
    <div class="coverage-section">
      <div class="coverage-title">话题覆盖深度</div>
      ${coverageHtml}
    </div>
  </div>
</section>

<footer>
  <div class="container">
    <div class="footer-grid">
      <div class="footer-col"><div class="footer-col-title">项目</div><div class="footer-col-item">龙虾小镇</div><div class="footer-col-item">OpenClaw 生态模拟</div></div>
      <div class="footer-col"><div class="footer-col-title">技术</div><div class="footer-col-item">Bun + TypeScript</div><div class="footer-col-item">Claude CLI Subprocess</div></div>
      <div class="footer-col"><div class="footer-col-title">灵感</div><div class="footer-col-item">斯坦福小镇</div><div class="footer-col-item">Concordia GM 模式</div></div>
    </div>
    <div class="footer-line"></div>
    <div class="footer-copy">龙虾小镇 | ${log.startTime} | Powered by Claude CLI</div>
  </div>
</footer>

<script>
// ══════════════════════════════════════════════════
// 全局数据声明（供所有 IIFE 使用）
// ══════════════════════════════════════════════════
window.__economyData = ${(log.metadata as any).economyJson || '{}'};
window.__tokenStats = ${(log.metadata as any).tokenStats || '{}'};
window.__mediaData = ${(log.metadata as any).mediaJson || '{}'};
window.__stockData = null;
window.__serverUrl = window.location.origin; // port: ${(log.metadata as any).serverPort || 3456}';
window.__bountyData = [];
// 尝试从服务器加载赏金（静默失败）
try { fetch(window.__serverUrl + '/api/bounties?limit=10').then(r=>r.json()).then(d=>{window.__bountyData=d;}).catch(()=>{}); } catch(e){}

// ── 管理模式（?admin=1 或按 Ctrl+Shift+A 切换） ──
window.__adminMode = new URLSearchParams(location.search).has('admin');
(function() {
  // 管理模式指示器
  const indicator = document.createElement('div');
  indicator.id = 'admin-indicator';
  indicator.style.cssText = 'position:fixed;top:8px;left:50%;transform:translateX(-50%);z-index:9999;font-family:monospace;font-size:0.65rem;letter-spacing:0.15em;padding:3px 16px;border-radius:2px;transition:all 0.3s;pointer-events:none;';
  function updateIndicator() {
    if (window.__adminMode) {
      indicator.style.background = 'rgba(200,80,80,0.9)';
      indicator.style.color = '#fff';
      indicator.textContent = 'ADMIN MODE';
      indicator.style.opacity = '1';
    } else {
      indicator.style.opacity = '0';
    }
  }
  document.body.appendChild(indicator);
  updateIndicator();

  // Ctrl+Shift+A 切换管理模式
  document.addEventListener('keydown', function(e) {
    if (e.ctrlKey && e.shiftKey && e.key === 'A') {
      e.preventDefault();
      window.__adminMode = !window.__adminMode;
      updateIndicator();
    }
  });
})();

// ══════════════════════════════════════════════════
// 等距小镇地图 Canvas 引擎 v3
// 行人/车辆随机运动 · 见面冒泡说话 · 昼夜循环
// 多样化树木/山脉/房屋风格
// ══════════════════════════════════════════════════
(function() {
  const canvas = document.getElementById('town-map');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const dpr = window.devicePixelRatio || 1;
  const agents = ${mapAgentsJson};
  const SERVER = (window.__serverUrl || window.location.origin);

  // ── 人类用户房屋系统 ──
  let humanUsers = []; // 从服务器获取的人类用户列表
  const userBuildings = []; // 人类用户的房屋位置
  const USER_HOUSE_COLOR = '#8b2020'; // 暗红色
  const USER_HOUSE_ROOF = '#6b1515'; // 暗红屋顶
  const USER_HOUSE_ACCENT = '#c43030'; // 暗红高亮

  // 异步加载人类用户
  (async function loadHumanUsers() {
    try {
      const resp = await fetch(SERVER + '/api/users', { signal: AbortSignal.timeout(10000) });
      if (resp.ok) {
        humanUsers = await resp.json();
        // 为每个人类用户分配房屋位置 — 沿主路和支路随机分布（靠近镇中心）
        const allUserRoads = [mainRoad, branchRoad1, branchRoad2, branchRoad3, ringRoad];
        const userRand = seededRand(42); // 固定种子保证每次刷新位置一致
        for (let i = 0; i < humanUsers.length; i++) {
          const road = allUserRoads[Math.floor(userRand() * allUserRoads.length)];
          // 在路段中间 30%~70% 范围内随机选点（更靠近中心）
          const ptIdx = Math.floor(road.length * (0.3 + userRand() * 0.4));
          const pt = road[Math.min(ptIdx, road.length - 1)];
          const idx = Math.min(ptIdx, road.length - 2);
          const dx = road[idx + 1].x - road[idx].x;
          const dy = road[idx + 1].y - road[idx].y;
          const len = Math.sqrt(dx * dx + dy * dy) || 1;
          const side = userRand() > 0.5 ? 1 : -1;
          const dist = 1.5 + userRand() * 1.5; // 距道路 1.5~3 格
          const gx = pt.x + (-dy / len * side * dist);
          const gy = pt.y + (dx / len * side * dist);
          // 避免和现有 Agent 房屋重叠
          let tooClose = false;
          for (const b of buildings) { if (Math.abs(b.gx - gx) < 2 && Math.abs(b.gy - gy) < 2) { tooClose = true; break; } }
          for (const ub of userBuildings) { if (Math.abs(ub.gx - gx) < 2 && Math.abs(ub.gy - gy) < 2) { tooClose = true; break; } }
          if (tooClose) {
            // 偏移一些重试
            userBuildings.push({ gx: gx + (userRand() - 0.5) * 3, gy: gy + (userRand() - 0.5) * 3, user: humanUsers[i], style: Math.floor(userRand() * 5) });
          } else {
            userBuildings.push({ gx, gy, user: humanUsers[i], style: Math.floor(userRand() * 5) });
          }
        }
      }
    } catch {}
  })();

  // ── 状态 ──
  let scale = 1, panX = 0, panY = 0;
  let dragging = false, dragStartX = 0, dragStartY = 0;
  let hoveredBuilding = -1;
  let hoveredUserBuilding = -1;
  let timeOfDay = 0.25; // 0~1，0=午夜 0.25=6am 0.5=正午 0.75=6pm
  let simSpeed = 1;
  let lastFrame = performance.now();

  function resize() {
    const rect = canvas.parentElement.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    canvas.style.width = rect.width + 'px';
    canvas.style.height = rect.height + 'px';
  }
  resize();
  window.addEventListener('resize', resize);

  // ── 伪随机 ──
  function seededRand(seed) {
    let s = seed;
    return function() { s = (s * 16807 + 0) % 2147483647; return (s - 1) / 2147483646; };
  }
  const rand = seededRand(42);
  // 运行时随机（非种子）
  const rr = () => Math.random();

  // ── 等距坐标 ──
  const TILE = 32;
  function toIso(gx, gy) { return { x: (gx - gy) * TILE, y: (gx + gy) * TILE * 0.5 }; }
  const MAP_W = 40, MAP_H = 30;
  const centerOffX = 640, centerOffY = 100;
  function worldToScreen(gx, gy) {
    const iso = toIso(gx, gy);
    return { x: (iso.x + centerOffX + panX) * scale, y: (iso.y + centerOffY + panY) * scale };
  }

  // ── 地形高度图 ──
  const heightMap = [];
  for (let y = 0; y < MAP_H; y++) {
    heightMap[y] = [];
    for (let x = 0; x < MAP_W; x++) {
      let h = 0;
      h += Math.sin(x * 0.15 + 1.3) * Math.cos(y * 0.12 + 0.7) * 40;
      h += Math.sin(x * 0.08 - 0.5) * Math.sin(y * 0.09 + 2.1) * 25;
      h += Math.cos((x + y) * 0.06) * 15;
      h += Math.sin(x * 0.22 + y * 0.18) * 12; // 额外变化
      if (y < 8) h += (8 - y) * 12;
      if (y < 5 && x > 10 && x < 30) h += (5 - y) * 18;
      // 第二组山丘（右侧）
      if (y < 7 && x > 28 && x < 38) h += (7 - y) * 10 * Math.sin(x * 0.3);
      heightMap[y][x] = h;
    }
  }

  // ── 河流 ──
  const riverPoints = [];
  for (let t = 0; t <= 1; t += 0.015) {
    const x = 3 + t * (MAP_W - 8) + Math.sin(t * 8) * 3 + Math.sin(t * 15) * 0.8;
    const y = 2 + t * (MAP_H - 5) + Math.cos(t * 6) * 2.5 + Math.cos(t * 13) * 0.5;
    riverPoints.push({ x, y });
  }

  // ── 道路系统（主干道 + 支路 + 居住区小路） ──
  // 主干道：横贯小镇
  const mainRoad = [];
  for (let t = 0; t <= 1; t += 0.01) {
    const x = 2 + t * (MAP_W - 4);
    const y = MAP_H * 0.45 + Math.sin(t * 5 + 0.5) * 3 + Math.sin(t * 12) * 0.8;
    mainRoad.push({ x, y });
  }
  // 支路1：从主路 30% 处向左上（学堂区）
  const branchRoad1 = [];
  for (let t = 0; t <= 1; t += 0.02) {
    const base = mainRoad[Math.floor(mainRoad.length * 0.3)];
    branchRoad1.push({ x: base.x + t * 8 + Math.sin(t * 4), y: base.y - t * 10 + Math.cos(t * 5) * 1.5 });
  }
  // 支路2：从主路 65% 处向右下（公园区）
  const branchRoad2 = [];
  for (let t = 0; t <= 1; t += 0.02) {
    const base = mainRoad[Math.floor(mainRoad.length * 0.65)];
    branchRoad2.push({ x: base.x + t * 6, y: base.y + t * 12 + Math.sin(t * 6) * 1.2 });
  }
  // 支路3：从主路 15% 处向下（超市/银行商业区）
  const branchRoad3 = [];
  for (let t = 0; t <= 1; t += 0.02) {
    const base = mainRoad[Math.floor(mainRoad.length * 0.15)];
    branchRoad3.push({ x: base.x + t * 3 + Math.sin(t * 5) * 0.8, y: base.y + t * 10 + Math.cos(t * 7) * 1 });
  }
  // 支路4：从主路 85% 处向上（东部居住区）
  const branchRoad4 = [];
  for (let t = 0; t <= 1; t += 0.02) {
    const base = mainRoad[Math.floor(mainRoad.length * 0.85)];
    branchRoad4.push({ x: base.x - t * 4 + Math.sin(t * 3) * 0.6, y: base.y - t * 8 + Math.cos(t * 4) * 1.2 });
  }
  // 环形辅路：连接支路1尾端 → 支路4尾端（北部弧线）
  const ringRoad = [];
  const r1End = branchRoad1[branchRoad1.length - 1];
  const r4End = branchRoad4[branchRoad4.length - 1];
  for (let t = 0; t <= 1; t += 0.015) {
    const x = r1End.x + (r4End.x - r1End.x) * t + Math.sin(t * Math.PI) * 4;
    const y = r1End.y + (r4End.y - r1End.y) * t - Math.sin(t * Math.PI) * 3;
    ringRoad.push({ x, y });
  }
  // 居住区小路（从各支路分叉的短小巷）
  const lanes = [];
  function makeLane(road, startPct, angle, length) {
    const lane = [];
    const base = road[Math.floor(road.length * startPct)];
    for (let t = 0; t <= 1; t += 0.04) {
      lane.push({
        x: base.x + Math.cos(angle) * t * length + Math.sin(t * 6) * 0.3,
        y: base.y + Math.sin(angle) * t * length + Math.cos(t * 5) * 0.3,
      });
    }
    return lane;
  }
  // 主路沿线居住小巷
  lanes.push(makeLane(mainRoad, 0.2, Math.PI * 0.65, 5));
  lanes.push(makeLane(mainRoad, 0.35, -Math.PI * 0.55, 4));
  lanes.push(makeLane(mainRoad, 0.55, Math.PI * 0.7, 5));
  lanes.push(makeLane(mainRoad, 0.7, -Math.PI * 0.6, 4.5));
  lanes.push(makeLane(mainRoad, 0.9, Math.PI * 0.55, 4));
  // 支路沿线小巷
  lanes.push(makeLane(branchRoad1, 0.4, Math.PI * 0.3, 3.5));
  lanes.push(makeLane(branchRoad1, 0.7, -Math.PI * 0.4, 3));
  lanes.push(makeLane(branchRoad2, 0.3, -Math.PI * 0.3, 3.5));
  lanes.push(makeLane(branchRoad3, 0.5, Math.PI * 0.8, 3));
  lanes.push(makeLane(branchRoad4, 0.5, -Math.PI * 0.7, 3));

  const allRoads = [mainRoad, branchRoad1, branchRoad2, branchRoad3, branchRoad4, ringRoad, ...lanes];

  // ── 房屋位置 ──
  const buildings = [];
  function placeAlongRoad(road, count, offsetRange) {
    const step = Math.floor(road.length / (count + 1));
    for (let i = 1; i <= count; i++) {
      const pt = road[Math.min(i * step, road.length - 1)];
      const side = rand() > 0.5 ? 1 : -1;
      const dist = 1.5 + rand() * offsetRange;
      const idx = Math.min(i * step, road.length - 2);
      const dx = road[idx + 1].x - road[idx].x;
      const dy = road[idx + 1].y - road[idx].y;
      const len = Math.sqrt(dx * dx + dy * dy) || 1;
      buildings.push({
        gx: pt.x + (-dy / len * side * dist),
        gy: pt.y + (dx / len * side * dist),
        style: Math.floor(rand() * 5) // 0~4 五种建筑风格
      });
    }
  }
  const perMain = Math.min(agents.length, Math.ceil(agents.length * 0.6));
  const perB1 = Math.min(agents.length - perMain, Math.ceil(agents.length * 0.25));
  const perB2 = agents.length - perMain - perB1;
  placeAlongRoad(mainRoad, perMain, 2.5);
  placeAlongRoad(branchRoad1, perB1, 2);
  placeAlongRoad(branchRoad2, perB2, 2);

  // ── 公共建筑（7 个地标） ──
  const publicBuildings = [
    { id: 'plaza',  name: '\u5e7f\u573a',         icon: '\u2605', color: '#c8a882', roof: '#b89872',
      gx: mainRoad[Math.floor(mainRoad.length * 0.5)].x,
      gy: mainRoad[Math.floor(mainRoad.length * 0.5)].y - 4, type: 'plaza' },
    { id: 'cafe',   name: '\u5496\u5561\u5385',   icon: '\u2615', color: '#8b6f5e', roof: '#6b4f3e',
      gx: mainRoad[Math.floor(mainRoad.length * 0.25)].x + 3,
      gy: mainRoad[Math.floor(mainRoad.length * 0.25)].y - 2.5, type: 'cafe' },
    { id: 'barber', name: '\u7406\u53d1\u5e97',   icon: '\u2702', color: '#6b7b8d', roof: '#4a5568',
      gx: mainRoad[Math.floor(mainRoad.length * 0.75)].x - 2,
      gy: mainRoad[Math.floor(mainRoad.length * 0.75)].y + 3, type: 'barber' },
    { id: 'park',   name: '\u5b0c\u7269\u4e50\u56ed', icon: '\u263a', color: '#6b8b5e', roof: '#4a7a4a',
      gx: branchRoad2[Math.floor(branchRoad2.length * 0.5)].x + 2,
      gy: branchRoad2[Math.floor(branchRoad2.length * 0.5)].y + 2, type: 'park' },
    { id: 'school', name: '\u5c0f\u9547\u5b66\u5802', icon: '\u266a', color: '#7b6b8d', roof: '#5b4b6d',
      gx: branchRoad1[Math.floor(branchRoad1.length * 0.6)].x - 1.5,
      gy: branchRoad1[Math.floor(branchRoad1.length * 0.6)].y - 2, type: 'school' },
    { id: 'market', name: '\u8d85\u5e02',         icon: '\u2302', color: '#d48050', roof: '#b06838', // 超市
      gx: branchRoad3[Math.floor(branchRoad3.length * 0.45)].x + 3,
      gy: branchRoad3[Math.floor(branchRoad3.length * 0.45)].y + 1.5, type: 'market' },
    { id: 'bank',   name: '\u94f6\u884c',         icon: '\u25c8', color: '#5a6a7a', roof: '#3a4a5a', // 银行
      gx: branchRoad3[Math.floor(branchRoad3.length * 0.75)].x - 2,
      gy: branchRoad3[Math.floor(branchRoad3.length * 0.75)].y - 1.5, type: 'bank' },
    { id: 'arcade', name: '\u6e38\u620f\u5385',     icon: '\ud83c\udfae', color: '#c8a882', roof: '#a07850', // 游戏厅
      gx: ringRoad[Math.floor(ringRoad.length * 0.3)].x + 3,
      gy: ringRoad[Math.floor(ringRoad.length * 0.3)].y - 2, type: 'arcade',
      link: '/games' },
    { id: 'mafia',  name: '\u9f99\u867e\u6740',     icon: '\ud83d\udd2e', color: '#8b2020', roof: '#6b1515', // 龙虾杀
      gx: ringRoad[Math.floor(ringRoad.length * 0.55)].x - 2,
      gy: ringRoad[Math.floor(ringRoad.length * 0.55)].y + 3, type: 'mafia',
      link: '/mafia' },
    { id: 'stock',  name: '\u80a1\u7968\u5927\u5385', icon: '\ud83d\udcc8', color: '#2a6a4a', roof: '#1a4a2a', // 股票大厅
      gx: branchRoad1[Math.floor(branchRoad1.length * 0.3)].x + 3,
      gy: branchRoad1[Math.floor(branchRoad1.length * 0.3)].y + 2.5, type: 'stock',
      link: '/stock' },
  ];

  // ── 树木（6 种类型） ──
  const trees = [];
  for (let i = 0; i < 150; i++) {
    const tx = rand() * MAP_W, ty = rand() * MAP_H;
    let tooClose = false;
    for (const rp of riverPoints) { if (Math.abs(rp.x - tx) < 1.5 && Math.abs(rp.y - ty) < 1.5) { tooClose = true; break; } }
    if (!tooClose) for (const rd of [mainRoad, branchRoad3, branchRoad4, ringRoad]) { for (const rp of rd) { if (Math.abs(rp.x - tx) < 1.2 && Math.abs(rp.y - ty) < 1.2) { tooClose = true; break; } } if (tooClose) break; }
    if (!tooClose) for (const b of buildings) { if (Math.abs(b.gx - tx) < 1.8 && Math.abs(b.gy - ty) < 1.8) { tooClose = true; break; } }
    if (!tooClose) for (const pb of publicBuildings) { if (Math.abs(pb.gx - tx) < 3.5 && Math.abs(pb.gy - ty) < 3.5) { tooClose = true; break; } }
    if (!tooClose) {
      const hy = Math.floor(Math.min(ty, MAP_H - 1));
      const hx = Math.floor(Math.min(tx, MAP_W - 1));
      const h = heightMap[hy][hx];
      if (h < 55) {
        const types = ['oak', 'pine', 'birch', 'bush', 'willow', 'maple'];
        trees.push({ x: tx, y: ty, size: 0.5 + rand() * 0.8, type: types[Math.floor(rand() * types.length)], seed: rand() * 100 });
      }
    }
  }

  // ── 居住区组团绿化（小路旁花坛/灌木组） ──
  const greenClusters = [];
  // 沿每条居住小巷放组团绿化
  for (const lane of lanes) {
    const clusterCount = 2 + Math.floor(rand() * 3);
    for (let c = 0; c < clusterCount; c++) {
      const pt = lane[Math.floor(rand() * lane.length)];
      const side = rand() > 0.5 ? 1 : -1;
      // 在小巷侧面放置
      const idx = Math.min(Math.floor(rand() * (lane.length - 1)), lane.length - 2);
      const dx = lane[idx + 1].x - lane[idx].x;
      const dy = lane[idx + 1].y - lane[idx].y;
      const len = Math.sqrt(dx * dx + dy * dy) || 1;
      greenClusters.push({
        x: pt.x + (-dy / len * side * (0.8 + rand() * 0.6)),
        y: pt.y + (dx / len * side * (0.8 + rand() * 0.6)),
        size: 0.4 + rand() * 0.5,
        variant: Math.floor(rand() * 4), // 0花坛 1灌木丛 2小花园 3盆栽排
        seed: rand() * 100,
      });
    }
  }
  // 也沿主路和支路放一些
  for (const rd of [mainRoad, branchRoad1, branchRoad2, branchRoad3, branchRoad4]) {
    for (let c = 0; c < 4; c++) {
      const idx = Math.floor(rand() * (rd.length - 2));
      const pt = rd[idx];
      const dx = rd[idx + 1].x - rd[idx].x;
      const dy = rd[idx + 1].y - rd[idx].y;
      const len = Math.sqrt(dx * dx + dy * dy) || 1;
      const side = rand() > 0.5 ? 1 : -1;
      greenClusters.push({
        x: pt.x + (-dy / len * side * (1.2 + rand() * 0.8)),
        y: pt.y + (dx / len * side * (1.2 + rand() * 0.8)),
        size: 0.3 + rand() * 0.4,
        variant: Math.floor(rand() * 4),
        seed: rand() * 100,
      });
    }
  }

  // ══════ 行人 & 车辆 系统 ══════

  // 在道路上获取一个随机点
  function randomRoadPoint() {
    const road = allRoads[Math.floor(rr() * allRoads.length)];
    const idx = Math.floor(rr() * road.length);
    return { ...road[idx], roadIdx: allRoads.indexOf(road), ptIdx: idx };
  }

  // 行人
  const walkers = [];
  const WALKER_COUNT = Math.min(agents.length * 2, 16);
  for (let i = 0; i < WALKER_COUNT; i++) {
    const start = randomRoadPoint();
    const agentIdx = i < agents.length ? i : Math.floor(rr() * agents.length);
    walkers.push({
      x: start.x, y: start.y,
      targetX: start.x, targetY: start.y,
      speed: 0.3 + rr() * 0.4,
      agentIdx: agentIdx,
      color: agents[agentIdx].color.main,
      name: agents[agentIdx].name,
      dir: 1, // 朝向：1右 -1左
      frame: rr() * 100, // 走路动画帧
      paused: false, pauseTimer: 0,
      atHome: false,
    });
  }

  // 车辆
  const vehicles = [];
  // 拼合环形公交路线：串联所有主要路段
  const busRoute = [];
  for (let i = 0; i < Math.floor(mainRoad.length * 0.7); i++) busRoute.push(mainRoad[i]);
  for (let i = branchRoad1.length - 1; i >= 0; i--) busRoute.push(branchRoad1[i]);
  for (let i = 0; i < ringRoad.length; i++) busRoute.push(ringRoad[i]);
  for (let i = branchRoad4.length - 1; i >= 0; i--) busRoute.push(branchRoad4[i]);
  for (let i = Math.floor(mainRoad.length * 0.85); i < mainRoad.length; i++) busRoute.push(mainRoad[i]);
  for (let i = mainRoad.length - 1; i >= Math.floor(mainRoad.length * 0.15); i--) busRoute.push(mainRoad[i]);
  for (let i = 0; i < branchRoad3.length; i++) busRoute.push(branchRoad3[i]);
  for (let i = branchRoad3.length - 1; i >= 0; i--) busRoute.push(branchRoad3[i]);
  for (let i = Math.floor(mainRoad.length * 0.15); i < Math.floor(mainRoad.length * 0.65); i++) busRoute.push(mainRoad[i]);
  for (let i = 0; i < branchRoad2.length; i++) busRoute.push(branchRoad2[i]);
  for (let i = branchRoad2.length - 1; i >= 0; i--) busRoute.push(branchRoad2[i]);
  for (let i = Math.floor(mainRoad.length * 0.65); i >= 0; i--) busRoute.push(mainRoad[i]);

  const VEHICLE_COUNT = 5; // 2 小车 + 1 卡车 + 1 公交 + 1 支路小车
  const carColors = ['#7a6a5a', '#5a6a7a', '#8a7a6a', '#6a5a4a', '#7a7a5a'];
  const vehicleRoads = [mainRoad, mainRoad, mainRoad, busRoute, branchRoad3];
  const vehicleTypes = ['truck', 'car', 'car', 'bus', 'car'];
  for (let i = 0; i < VEHICLE_COUNT; i++) {
    const isBus = vehicleTypes[i] === 'bus';
    const road = vehicleRoads[i];
    const idx = Math.floor(rr() * road.length);
    vehicles.push({
      x: road[idx].x, y: road[idx].y,
      road: road,
      roadPtIdx: idx,
      speed: isBus ? 0.25 : (0.2 + rr() * 0.15), // 大幅降速
      dir: isBus ? 1 : (rr() > 0.5 ? 1 : -1),
      color: isBus ? '#c8a060' : carColors[i % carColors.length],
      type: vehicleTypes[i],
    });
  }

  // 气泡系统
  const chatBubbles = [];
  // 通用短语 + 地点相关短语 + 实时新闻
  const chatPhrases = [
    '\u4f60\u597d\uff01', '\u5929\u6c14\u771f\u597d', '\u6700\u8fd1\u5fd9\u5417\uff1f',
    'Agent\u771f\u6709\u8da3', '\u5f00\u4f1a\u53bb\uff01', '\u5403\u4e86\u5417\uff1f',
    'Skill\u5199\u5b8c\u4e86', '\u8bb0\u5fc6\u7cfb\u7edf\u4e0d\u9519', 'SOUL.md\u597d\u96be',
    '\u90a3\u4e2aBug\u4fee\u4e86\u5417', '\u5403\u8336\u53bb', '\u6563\u6b65\u5417',
    '\u660e\u5929\u89c1\uff01', '\u54c8\u54c8\u54c8', '\u8d70\u5566\uff01',
  ];
  // 从经济系统获取实时新闻，混入聊天内容
  const newsPhrases = [];
  try {
    const ecoData = window.__economyData;
    if (ecoData && ecoData.dailyNews && ecoData.dailyNews.length > 0) {
      for (const news of ecoData.dailyNews) {
        // 截取新闻前15字作为泡泡聊天（太长显示不下）
        const short = news.replace(/[\u{1F4CA}\u{1F525}\u{1F4F0}\u{1F3C6}]/gu, '').trim();
        if (short.length <= 18) {
          newsPhrases.push(short);
        } else {
          newsPhrases.push(short.slice(0, 15) + '...');
        }
        // 额外生成评论式短语
        if (news.includes('\u8425\u4e1a\u5192\u519b')) newsPhrases.push('\u542c\u8bf4\u4eca\u65e5\u8425\u4e1a\u989d\u7b2c\u4e00\uff01');
        if (news.includes('\u6700\u53d7\u6b22\u8fce')) newsPhrases.push('\u90a3\u5bb6\u5e97\u6211\u4e5f\u5e38\u53bb\uff01');
        if (news.includes('\u5e86\u5178') || news.includes('\u8282\u65e5')) newsPhrases.push('\u4eca\u5929\u6709\u6d3b\u52a8\u8981\u53bb\u770b\uff01');
        if (news.includes('\u7a81\u53d1')) newsPhrases.push('\u4f60\u542c\u8bf4\u4e86\u5417\uff1f');
        if (news.includes('\u9526\u6807\u8d5b') || news.includes('\u7ade\u6280')) newsPhrases.push('\u8c01\u8d62\u4e86\uff1f');
      }
      // 把新闻短语混入通用短语池
      chatPhrases.push(...newsPhrases);
    }
    // 也从经济事件中提取话题
    if (ecoData && ecoData.events && ecoData.events.length > 0) {
      for (const ev of ecoData.events) {
        if (ev.title) {
          const t = ev.title.length > 12 ? ev.title.slice(0, 12) + '...' : ev.title;
          chatPhrases.push(t + '\uff01');
        }
      }
    }
  } catch {};
  const locationPhrases = {
    cafe:   ['\u6765\u676f\u62ff\u94c1\uff01','\u8fd9\u5496\u5561\u771f\u9999','\u52a0\u73ed\u5fc5\u5907','\u8981\u4e0d\u8981\u62fc\u5355\uff1f','\u5750\u4f1a\u513f\u518d\u8d70'],
    plaza:  ['\u5e7f\u573a\u597d\u70ed\u95f9','\u4eca\u5929\u6709\u6d3b\u52a8','\u6765\u8dd1\u6b65\u5417','\u665a\u4e0a\u6709\u8bb2\u5ea7','\u5e7f\u573a\u821e\u8d77\uff01'],
    barber: ['\u8be5\u526a\u5934\u4e86','\u6362\u4e2a\u53d1\u578b','\u5f88\u7cbe\u795e\uff01','\u5e08\u5085\u624b\u827a\u597d','\u7b49\u4e86\u591a\u4e45\uff1f'],
    park:   ['\u72d7\u72d7\u597d\u53ef\u7231','\u5e26\u5b69\u5b50\u6765\u73a9','\u5c0f\u732b\u5728\u665a\u4e0a','\u8fd9\u79cb\u5343\u592a\u53ef\u7231\u4e86','\u904d\u904d\uff01'],
    school: ['\u4e0a\u8bfe\u8fc7\u5427','\u8001\u5e08\u597d','\u4eca\u5929\u5b66\u4ec0\u4e48','\u4e0b\u8bfe\u5566','\u8003\u8bd5\u52a0\u6cb9'],
    market: ['\u4e70\u83dc\u53bb','\u6253\u6298\u4e86\uff01','\u8fd9\u897f\u74dc\u771f\u7518','\u5355\u5b50\u597d\u957f','\u8981\u4e70\u4ec0\u4e48'],
    bank:   ['\u53d6\u94b1\u53bb','\u6392\u961f\u597d\u4e45','\u529e\u5f20\u5361','\u5229\u7387\u53c8\u964d\u4e86','\u8fd8\u8d37\u6b3e\u53bb'],
    arcade: ['\u6253\u6e38\u620f\u53bb\uff01','\u6765\u5c40\u9f99\u867e2048','\u6211\u98de\u8d77\u6765\u4e86','\u8d5b\u8dd1\u4e0d\u670d','\u6392\u884c\u699c\u7b2c\u4e00\uff01'],
    mafia:  ['\u6765\u5c40\u9f99\u867e\u6740','\u8c01\u662f\u6740\u624b\uff1f','\u6211\u662f\u597d\u4eba\uff01','\u6295\u4ed6\uff01','\u4e0d\u662f\u6211\uff01'],
    stock:  ['\u80a1\u7968\u6da8\u4e86','\u52a0\u4ed3\uff01','\u5168\u7eff\u4e86...','\u6d88\u606f\u9762\u5229\u597d','\u522b\u8ffd\u9ad8'],
  };

  // 判断行人是否在某公共建筑附近
  function nearPublicBuilding(wx, wy) {
    for (const pb of publicBuildings) {
      if (Math.abs(pb.gx - wx) < 3 && Math.abs(pb.gy - wy) < 3) return pb;
    }
    return null;
  }

  // 更新行人目标（沿道路寻路 + 去公共场所）
  function pickNewTarget(w) {
    const hour = timeOfDay * 24;
    // 夜晚回家
    if (hour > 21 || hour < 5) {
      if (w.agentIdx < buildings.length) {
        const home = buildings[w.agentIdx];
        w.targetX = home.gx; w.targetY = home.gy;
        w.atHome = true; w.visiting = null;
        return;
      }
    }
    w.atHome = false;
    // 40% 概率去公共场所，60% 概率随机道路漫游
    if (rr() < 0.4) {
      // 按时段偏好选场所
      let candidates = publicBuildings;
      if (hour >= 7 && hour < 9) candidates = publicBuildings.filter(p => p.type === 'cafe' || p.type === 'school' || p.type === 'market');
      else if (hour >= 9 && hour < 12) candidates = publicBuildings.filter(p => p.type === 'school' || p.type === 'plaza' || p.type === 'bank' || p.type === 'market');
      else if (hour >= 12 && hour < 14) candidates = publicBuildings.filter(p => p.type === 'cafe' || p.type === 'plaza');
      else if (hour >= 14 && hour < 17) candidates = publicBuildings.filter(p => p.type === 'park' || p.type === 'barber' || p.type === 'school' || p.type === 'bank');
      else if (hour >= 17 && hour < 21) candidates = publicBuildings.filter(p => p.type === 'plaza' || p.type === 'cafe' || p.type === 'park' || p.type === 'market' || p.type === 'arcade' || p.type === 'mafia');
      if (candidates.length === 0) candidates = publicBuildings;
      const target = candidates[Math.floor(rr() * candidates.length)];
      w.targetX = target.gx + (rr() - 0.5) * 2;
      w.targetY = target.gy + (rr() - 0.5) * 2;
      w.visiting = target.type;
    } else {
      const pt = randomRoadPoint();
      w.targetX = pt.x; w.targetY = pt.y;
      w.visiting = null;
    }
  }

  // 更新行人位置
  function updateWalkers(dt) {
    for (const w of walkers) {
      if (w.paused) {
        w.pauseTimer -= dt;
        if (w.pauseTimer <= 0) { w.paused = false; pickNewTarget(w); }
        continue;
      }
      const dx = w.targetX - w.x;
      const dy = w.targetY - w.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < 0.3) {
        if (w.atHome) { w.paused = true; w.pauseTimer = 5 + rr() * 10; }
        else { w.paused = true; w.pauseTimer = 0.5 + rr() * 2; }
        continue;
      }
      const move = w.speed * dt;
      w.x += (dx / dist) * Math.min(move, dist);
      w.y += (dy / dist) * Math.min(move, dist);
      w.dir = dx > 0 ? 1 : -1;
      w.frame += dt * 4;
    }
  }

  // 更新车辆
  function updateVehicles(dt) {
    const hour = timeOfDay * 24;
    for (const v of vehicles) {
      const speedMul = (hour > 22 || hour < 5) ? 0.3 : 1;
      const rd = v.road;
      v.roadPtIdx += v.dir * v.speed * speedMul * dt * 8;
      if (v.type === 'bus') {
        // 公交车环线
        if (v.roadPtIdx >= rd.length - 1) v.roadPtIdx = 0;
        if (v.roadPtIdx < 0) v.roadPtIdx = rd.length - 2;
      } else {
        if (v.roadPtIdx >= rd.length - 1) { v.roadPtIdx = rd.length - 2; v.dir = -1; }
        if (v.roadPtIdx <= 0) { v.roadPtIdx = 1; v.dir = 1; }
      }
      const idx = Math.floor(Math.max(0, v.roadPtIdx));
      const frac = v.roadPtIdx - idx;
      const a = rd[Math.min(idx, rd.length - 1)];
      const b = rd[Math.min(idx + 1, rd.length - 1)];
      v.x = a.x + (b.x - a.x) * frac;
      v.y = a.y + (b.y - a.y) * frac;
      // 更新朝向
      if (b.x !== a.x) v.dir2 = b.x > a.x ? 1 : -1;
    }
  }

  // 检测行人相遇 → 生成气泡
  function checkMeetings() {
    for (let i = 0; i < walkers.length; i++) {
      for (let j = i + 1; j < walkers.length; j++) {
        const a = walkers[i], b = walkers[j];
        if (a.paused && a.atHome) continue;
        if (b.paused && b.atHome) continue;
        const dist = Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2);
        if (dist < 1.5) {
          // 检查是否已经有他们的气泡
          const exists = chatBubbles.some(cb =>
            cb.life > 0 && ((cb.walkerIdx === i || cb.walkerIdx === j))
          );
          if (!exists && rr() < 0.02) { // 低概率触发
            // 根据所在位置选短语
            const loc = nearPublicBuilding(a.x, a.y);
            const phrases = (loc && locationPhrases[loc.type]) ? locationPhrases[loc.type] : chatPhrases;
            chatBubbles.push({
              walkerIdx: i,
              text: phrases[Math.floor(rr() * phrases.length)],
              life: 3 + rr() * 2, maxLife: 5, x: a.x, y: a.y,
            });
            chatBubbles.push({
              walkerIdx: j,
              text: phrases[Math.floor(rr() * phrases.length)],
              life: 3 + rr() * 2, maxLife: 5, x: b.x, y: b.y,
            });
            // 双方暂停聊天
            a.paused = true; a.pauseTimer = 3 + rr() * 2;
            b.paused = true; b.pauseTimer = 3 + rr() * 2;
          }
        }
      }
    }
  }

  // 更新气泡
  function updateBubbles(dt) {
    for (const cb of chatBubbles) {
      cb.life -= dt;
      // 跟随行人
      const w = walkers[cb.walkerIdx];
      if (w) { cb.x = w.x; cb.y = w.y; }
    }
    // 移除过期
    for (let i = chatBubbles.length - 1; i >= 0; i--) {
      if (chatBubbles[i].life <= 0) chatBubbles.splice(i, 1);
    }
  }

  // ══════ 昼夜循环 ══════

  function getDayLight() {
    // timeOfDay: 0=午夜 0.25=6am 0.5=正午 0.75=6pm
    const hour = timeOfDay * 24;
    let brightness, warmth, skyR, skyG, skyB;

    if (hour >= 6 && hour < 8) { // 日出
      const t = (hour - 6) / 2;
      brightness = 0.4 + t * 0.6;
      warmth = 0.3 + t * 0.4;
      skyR = 180 + t * 32; skyG = 160 + t * 61; skyB = 140 + t * 92;
    } else if (hour >= 8 && hour < 17) { // 白天
      brightness = 1;
      warmth = 0.5 + Math.sin((hour - 8) / 9 * Math.PI) * 0.2;
      skyR = 212; skyG = 221; skyB = 232;
    } else if (hour >= 17 && hour < 19.5) { // 黄昏
      const t = (hour - 17) / 2.5;
      brightness = 1 - t * 0.55;
      warmth = 0.7 - t * 0.3;
      skyR = 212 - t * 80; skyG = 221 - t * 100; skyB = 232 - t * 120;
    } else if (hour >= 19.5 && hour < 21) { // 晚霞→夜
      const t = (hour - 19.5) / 1.5;
      brightness = 0.45 - t * 0.2;
      warmth = 0.4 - t * 0.3;
      skyR = 132 - t * 60; skyG = 121 - t * 60; skyB = 112 - t * 40;
    } else { // 深夜
      brightness = 0.2 + Math.sin(hour < 6 ? (hour / 6) : ((24 - hour) / 3)) * 0.05;
      warmth = 0.1;
      skyR = 42; skyG = 48; skyB = 72;
    }
    return { brightness, warmth, sky: { r: skyR, g: skyG, b: skyB } };
  }

  function getTimeLabel() {
    const hour = timeOfDay * 24;
    if (hour < 5) return '\u6df1\u591c';     // 深夜
    if (hour < 7) return '\u6e05\u6668';     // 清晨
    if (hour < 9) return '\u65e9\u6668';     // 早晨
    if (hour < 11.5) return '\u4e0a\u5348';  // 上午
    if (hour < 13) return '\u4e2d\u5348';    // 中午
    if (hour < 17) return '\u4e0b\u5348';    // 下午
    if (hour < 19.5) return '\u9ec4\u660f';  // 黄昏
    if (hour < 21) return '\u508d\u665a';    // 傍晚
    return '\u591c\u665a';                   // 夜晚
  }

  // ══════ 绘制函数 ══════

  function drawGround(dl) {
    const groundRand = seededRand(7); // 每帧一致的地面颜色
    for (let gy = 0; gy < MAP_H; gy++) {
      for (let gx = 0; gx < MAP_W; gx++) {
        const h = heightMap[gy][gx];
        const p = worldToScreen(gx, gy);
        const s = TILE * scale;
        let r, g, b;
        if (h > 60) { r = 120 + h * 0.2; g = 135 + h * 0.15; b = 110; }
        else if (h > 30) { r = 140 + h * 0.3; g = 165 + h * 0.2; b = 120; }
        else { r = 190 + groundRand() * 12; g = 205 + groundRand() * 12; b = 170 + groundRand() * 8; }
        // 应用昼夜
        r *= dl.brightness; g *= dl.brightness; b *= dl.brightness;
        ctx.fillStyle = 'rgb(' + Math.floor(r) + ',' + Math.floor(g) + ',' + Math.floor(b) + ')';
        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
        ctx.lineTo(p.x + s, p.y + s * 0.5);
        ctx.lineTo(p.x, p.y + s);
        ctx.lineTo(p.x - s, p.y + s * 0.5);
        ctx.closePath();
        ctx.fill();
      }
    }
  }

  function drawMountains(dl) {
    // 多形状山脉
    for (let gy = 0; gy < 10; gy++) {
      for (let gx = 5; gx < MAP_W - 3; gx++) {
        const h = heightMap[gy][gx];
        if (h < 35) continue;
        const p = worldToScreen(gx, gy);
        const mh = (h - 25) * scale * 1.2;
        const w = TILE * scale * (0.6 + (h % 13) / 20);
        // 山形变化
        const shape = (gx * 7 + gy * 3) % 4;
        const grad = ctx.createLinearGradient(p.x, p.y - mh, p.x, p.y);
        if (h > 75) {
          const snow = Math.min(1, (h - 75) / 30);
          grad.addColorStop(0, 'rgb(' + Math.floor((220 + snow * 35) * dl.brightness) + ',' + Math.floor((218 + snow * 30) * dl.brightness) + ',' + Math.floor((210 + snow * 25) * dl.brightness) + ')');
          grad.addColorStop(0.3, 'rgb(' + Math.floor(168 * dl.brightness) + ',' + Math.floor(174 * dl.brightness) + ',' + Math.floor(142 * dl.brightness) + ')');
          grad.addColorStop(1, 'rgb(' + Math.floor(120 * dl.brightness) + ',' + Math.floor(140 * dl.brightness) + ',' + Math.floor(100 * dl.brightness) + ')');
        } else {
          grad.addColorStop(0, 'rgb(' + Math.floor(155 * dl.brightness) + ',' + Math.floor(170 * dl.brightness) + ',' + Math.floor(126 * dl.brightness) + ')');
          grad.addColorStop(1, 'rgb(' + Math.floor(120 * dl.brightness) + ',' + Math.floor(148 * dl.brightness) + ',' + Math.floor(100 * dl.brightness) + ')');
        }
        ctx.fillStyle = grad;
        ctx.beginPath();
        if (shape === 0) { // 尖峰
          ctx.moveTo(p.x - w, p.y);
          ctx.lineTo(p.x - w * 0.1, p.y - mh);
          ctx.lineTo(p.x + w * 0.2, p.y - mh * 0.9);
          ctx.lineTo(p.x + w, p.y);
        } else if (shape === 1) { // 圆顶
          ctx.moveTo(p.x - w, p.y);
          ctx.quadraticCurveTo(p.x - w * 0.5, p.y - mh * 1.1, p.x, p.y - mh);
          ctx.quadraticCurveTo(p.x + w * 0.5, p.y - mh * 1.1, p.x + w, p.y);
        } else if (shape === 2) { // 双峰
          ctx.moveTo(p.x - w, p.y);
          ctx.lineTo(p.x - w * 0.4, p.y - mh * 0.85);
          ctx.lineTo(p.x - w * 0.1, p.y - mh * 0.6);
          ctx.lineTo(p.x + w * 0.3, p.y - mh);
          ctx.lineTo(p.x + w, p.y);
        } else { // 阶梯状
          ctx.moveTo(p.x - w, p.y);
          ctx.lineTo(p.x - w * 0.6, p.y - mh * 0.5);
          ctx.lineTo(p.x - w * 0.2, p.y - mh * 0.5);
          ctx.lineTo(p.x - w * 0.1, p.y - mh);
          ctx.lineTo(p.x + w * 0.4, p.y - mh * 0.8);
          ctx.lineTo(p.x + w, p.y);
        }
        ctx.closePath();
        ctx.fill();
        // 暗面
        ctx.fillStyle = 'rgba(0,0,0,' + (0.06 + (1 - dl.brightness) * 0.08) + ')';
        ctx.beginPath();
        ctx.moveTo(p.x, p.y - mh * 0.85);
        ctx.lineTo(p.x + w, p.y);
        ctx.lineTo(p.x, p.y);
        ctx.closePath();
        ctx.fill();
      }
    }
  }

  function drawRiver(dl) {
    if (riverPoints.length < 2) return;
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    // 河床
    ctx.lineWidth = 12 * scale; ctx.strokeStyle = 'rgb(' + Math.floor(95 * dl.brightness) + ',' + Math.floor(140 * dl.brightness) + ',' + Math.floor(165 * dl.brightness) + ')';
    ctx.beginPath(); let p0 = worldToScreen(riverPoints[0].x, riverPoints[0].y); ctx.moveTo(p0.x, p0.y);
    for (let i = 1; i < riverPoints.length; i++) { const p = worldToScreen(riverPoints[i].x, riverPoints[i].y); ctx.lineTo(p.x, p.y); } ctx.stroke();
    // 水面
    ctx.lineWidth = 8 * scale; ctx.strokeStyle = 'rgb(' + Math.floor(115 * dl.brightness) + ',' + Math.floor(165 * dl.brightness) + ',' + Math.floor(190 * dl.brightness) + ')';
    ctx.beginPath(); p0 = worldToScreen(riverPoints[0].x, riverPoints[0].y); ctx.moveTo(p0.x, p0.y);
    for (let i = 1; i < riverPoints.length; i++) { const p = worldToScreen(riverPoints[i].x, riverPoints[i].y); ctx.lineTo(p.x, p.y); } ctx.stroke();
    // 高光
    ctx.lineWidth = 2 * scale; ctx.strokeStyle = 'rgba(255,255,255,' + (0.15 + dl.brightness * 0.2) + ')';
    ctx.setLineDash([4 * scale, 8 * scale]);
    ctx.beginPath(); p0 = worldToScreen(riverPoints[0].x, riverPoints[0].y); ctx.moveTo(p0.x + 2 * scale, p0.y - scale);
    for (let i = 1; i < riverPoints.length; i++) { const p = worldToScreen(riverPoints[i].x, riverPoints[i].y); ctx.lineTo(p.x + 2 * scale, p.y - scale); } ctx.stroke();
    ctx.setLineDash([]);
  }

  function drawRoad(road, width, dl) {
    if (road.length < 2) return;
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.lineWidth = (width + 2) * scale; ctx.strokeStyle = 'rgb(' + Math.floor(160 * dl.brightness) + ',' + Math.floor(145 * dl.brightness) + ',' + Math.floor(120 * dl.brightness) + ')';
    ctx.beginPath(); let p0 = worldToScreen(road[0].x, road[0].y); ctx.moveTo(p0.x, p0.y);
    for (let i = 1; i < road.length; i++) { const p = worldToScreen(road[i].x, road[i].y); ctx.lineTo(p.x, p.y); } ctx.stroke();
    ctx.lineWidth = width * scale; ctx.strokeStyle = 'rgb(' + Math.floor(195 * dl.brightness) + ',' + Math.floor(180 * dl.brightness) + ',' + Math.floor(155 * dl.brightness) + ')';
    ctx.beginPath(); p0 = worldToScreen(road[0].x, road[0].y); ctx.moveTo(p0.x, p0.y);
    for (let i = 1; i < road.length; i++) { const p = worldToScreen(road[i].x, road[i].y); ctx.lineTo(p.x, p.y); } ctx.stroke();
    ctx.lineWidth = 1 * scale; ctx.strokeStyle = 'rgba(255,255,255,' + (dl.brightness * 0.2) + ')';
    ctx.setLineDash([3 * scale, 6 * scale]);
    ctx.beginPath(); p0 = worldToScreen(road[0].x, road[0].y); ctx.moveTo(p0.x, p0.y);
    for (let i = 1; i < road.length; i++) { const p = worldToScreen(road[i].x, road[i].y); ctx.lineTo(p.x, p.y); } ctx.stroke();
    ctx.setLineDash([]);
  }

  // ── 多样化树木 ──
  function drawTree(t, dl) {
    const p = worldToScreen(t.x, t.y);
    const s = t.size * scale;
    const br = dl.brightness;
    const sway = Math.sin(performance.now() * 0.001 + t.seed) * 1.5 * s; // 微风摇摆
    if (t.type === 'pine') {
      ctx.fillStyle = 'rgb(' + Math.floor(55 * br) + ',' + Math.floor(100 * br) + ',' + Math.floor(55 * br) + ')';
      // 三层三角
      for (let layer = 0; layer < 3; layer++) {
        const ly = p.y - (6 + layer * 7) * s;
        const lw = (8 - layer * 1.5) * s;
        const lh = 9 * s;
        ctx.beginPath();
        ctx.moveTo(p.x + sway * 0.3, ly - lh);
        ctx.lineTo(p.x - lw + sway * 0.1, ly);
        ctx.lineTo(p.x + lw + sway * 0.1, ly);
        ctx.closePath(); ctx.fill();
      }
      ctx.fillStyle = 'rgb(' + Math.floor(100 * br) + ',' + Math.floor(70 * br) + ',' + Math.floor(45 * br) + ')';
      ctx.fillRect(p.x - 1.5 * s, p.y, 3 * s, 5 * s);
    } else if (t.type === 'birch') {
      // 白桦树：白色树干 + 小叶冠
      ctx.fillStyle = 'rgb(' + Math.floor(210 * br) + ',' + Math.floor(205 * br) + ',' + Math.floor(195 * br) + ')';
      ctx.fillRect(p.x - 1.2 * s, p.y - 12 * s, 2.5 * s, 18 * s);
      // 黑色斑纹
      ctx.fillStyle = 'rgba(0,0,0,0.15)';
      for (let k = 0; k < 4; k++) ctx.fillRect(p.x - 0.5 * s, p.y - (3 + k * 3.5) * s, 1.5 * s, 1 * s);
      ctx.fillStyle = 'rgb(' + Math.floor(120 * br) + ',' + Math.floor(170 * br) + ',' + Math.floor(80 * br) + ')';
      ctx.beginPath(); ctx.ellipse(p.x + sway * 0.4, p.y - 16 * s, 6 * s, 5 * s, 0, 0, Math.PI * 2); ctx.fill();
    } else if (t.type === 'bush') {
      // 灌木：矮圆
      ctx.fillStyle = 'rgb(' + Math.floor(80 * br) + ',' + Math.floor(120 * br) + ',' + Math.floor(60 * br) + ')';
      ctx.beginPath(); ctx.ellipse(p.x, p.y - 3 * s, 6 * s, 4 * s, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = 'rgb(' + Math.floor(95 * br) + ',' + Math.floor(140 * br) + ',' + Math.floor(75 * br) + ')';
      ctx.beginPath(); ctx.ellipse(p.x - 2 * s, p.y - 4 * s, 4 * s, 3 * s, 0, 0, Math.PI * 2); ctx.fill();
    } else if (t.type === 'willow') {
      // 柳树：长下垂枝条
      ctx.fillStyle = 'rgb(' + Math.floor(110 * br) + ',' + Math.floor(90 * br) + ',' + Math.floor(55 * br) + ')';
      ctx.fillRect(p.x - 2 * s, p.y - 8 * s, 4 * s, 14 * s);
      ctx.fillStyle = 'rgb(' + Math.floor(75 * br) + ',' + Math.floor(130 * br) + ',' + Math.floor(65 * br) + ')';
      ctx.beginPath(); ctx.ellipse(p.x, p.y - 14 * s, 10 * s, 7 * s, 0, 0, Math.PI * 2); ctx.fill();
      // 下垂枝条
      ctx.strokeStyle = 'rgb(' + Math.floor(85 * br) + ',' + Math.floor(140 * br) + ',' + Math.floor(70 * br) + ')';
      ctx.lineWidth = 1 * s;
      for (let k = -3; k <= 3; k++) {
        ctx.beginPath();
        ctx.moveTo(p.x + k * 2.5 * s, p.y - 12 * s);
        ctx.quadraticCurveTo(p.x + k * 3 * s + sway, p.y - 4 * s, p.x + k * 2 * s + sway * 1.5, p.y + 2 * s);
        ctx.stroke();
      }
    } else if (t.type === 'maple') {
      // 枫树：红橙色冠
      ctx.fillStyle = 'rgb(' + Math.floor(100 * br) + ',' + Math.floor(75 * br) + ',' + Math.floor(50 * br) + ')';
      ctx.fillRect(p.x - 1.5 * s, p.y - 6 * s, 3 * s, 12 * s);
      ctx.fillStyle = 'rgb(' + Math.floor(190 * br) + ',' + Math.floor(100 * br) + ',' + Math.floor(55 * br) + ')';
      ctx.beginPath(); ctx.ellipse(p.x + sway * 0.3, p.y - 13 * s, 8 * s, 7 * s, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = 'rgb(' + Math.floor(210 * br) + ',' + Math.floor(130 * br) + ',' + Math.floor(60 * br) + ')';
      ctx.beginPath(); ctx.ellipse(p.x - 3 * s + sway * 0.2, p.y - 11 * s, 5 * s, 4.5 * s, 0, 0, Math.PI * 2); ctx.fill();
    } else { // oak
      ctx.fillStyle = 'rgb(' + Math.floor(110 * br) + ',' + Math.floor(85 * br) + ',' + Math.floor(55 * br) + ')';
      ctx.fillRect(p.x - 1.5 * s, p.y - 4 * s, 3 * s, 10 * s);
      ctx.fillStyle = 'rgb(' + Math.floor(60 * br) + ',' + Math.floor(100 * br) + ',' + Math.floor(48 * br) + ')';
      ctx.beginPath(); ctx.ellipse(p.x + s + sway * 0.2, p.y - 10 * s, 9 * s, 7 * s, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = 'rgb(' + Math.floor(85 * br) + ',' + Math.floor(130 * br) + ',' + Math.floor(72 * br) + ')';
      ctx.beginPath(); ctx.ellipse(p.x + sway * 0.3, p.y - 12 * s, 8 * s, 6.5 * s, 0, 0, Math.PI * 2); ctx.fill();
    }
  }

  // ── 多风格建筑 ──
  function drawBuilding(idx, dl) {
    if (idx >= agents.length || idx >= buildings.length) return;
    const a = agents[idx];
    const b = buildings[idx];
    const p = worldToScreen(b.gx, b.gy);
    const s = scale;
    const isHover = (hoveredBuilding === idx);
    const bumpY = isHover ? -6 * s : 0;
    const br = dl.brightness;
    const isNight = br < 0.5;

    const bw = (22 + a.extraversion * 0.08) * s;
    const bh = (20 + a.extraversion * 0.15) * s;
    const bd = bw * 0.6;
    const by = p.y + bumpY;
    const style = b.style;

    // 阴影
    ctx.fillStyle = 'rgba(0,0,0,' + (0.06 + (1 - br) * 0.06) + ')';
    ctx.beginPath(); ctx.ellipse(p.x, p.y + 4 * s, bw * 1.2, bd * 0.4, 0, 0, Math.PI * 2); ctx.fill();

    // 墙壁颜色根据风格变化
    const mc = a.color.main, rc = a.color.roof, ac = a.color.accent;
    function dimColor(hex, b2) {
      const rr = parseInt(hex.slice(1, 3), 16) * b2;
      const gg = parseInt(hex.slice(3, 5), 16) * b2;
      const bb = parseInt(hex.slice(5, 7), 16) * b2;
      return 'rgb(' + Math.floor(rr) + ',' + Math.floor(gg) + ',' + Math.floor(bb) + ')';
    }

    if (style === 0) {
      // 标准尖顶屋
      ctx.fillStyle = dimColor(isHover ? ac : mc, br);
      ctx.beginPath(); ctx.moveTo(p.x - bw, by - bh); ctx.lineTo(p.x, by - bh + bd * 0.5); ctx.lineTo(p.x, by + bd * 0.5); ctx.lineTo(p.x - bw, by); ctx.closePath(); ctx.fill();
      ctx.fillStyle = dimColor(isHover ? ac : rc, br);
      ctx.beginPath(); ctx.moveTo(p.x, by - bh + bd * 0.5); ctx.lineTo(p.x + bw, by - bh); ctx.lineTo(p.x + bw, by); ctx.lineTo(p.x, by + bd * 0.5); ctx.closePath(); ctx.fill();
      // 尖顶
      ctx.fillStyle = dimColor(rc, br);
      ctx.beginPath(); ctx.moveTo(p.x, by - bh - 10 * s); ctx.lineTo(p.x + bw + 2 * s, by - bh + 2 * s); ctx.lineTo(p.x, by - bh + bd * 0.5 + 3 * s); ctx.lineTo(p.x - bw - 2 * s, by - bh + 2 * s); ctx.closePath(); ctx.fill();
    } else if (style === 1) {
      // 平顶宽矮屋
      const bh2 = bh * 0.7, bw2 = bw * 1.2;
      ctx.fillStyle = dimColor(isHover ? ac : mc, br);
      ctx.beginPath(); ctx.moveTo(p.x - bw2, by - bh2); ctx.lineTo(p.x, by - bh2 + bd * 0.4); ctx.lineTo(p.x, by + bd * 0.4); ctx.lineTo(p.x - bw2, by); ctx.closePath(); ctx.fill();
      ctx.fillStyle = dimColor(isHover ? ac : rc, br);
      ctx.beginPath(); ctx.moveTo(p.x, by - bh2 + bd * 0.4); ctx.lineTo(p.x + bw2, by - bh2); ctx.lineTo(p.x + bw2, by); ctx.lineTo(p.x, by + bd * 0.4); ctx.closePath(); ctx.fill();
      // 平顶
      ctx.fillStyle = dimColor(rc, br * 0.9);
      ctx.beginPath(); ctx.moveTo(p.x - bw2, by - bh2); ctx.lineTo(p.x, by - bh2 + bd * 0.4); ctx.lineTo(p.x + bw2, by - bh2); ctx.lineTo(p.x, by - bh2 - bd * 0.4); ctx.closePath(); ctx.fill();
    } else if (style === 2) {
      // 圆顶小屋（穹顶）
      ctx.fillStyle = dimColor(isHover ? ac : mc, br);
      ctx.beginPath(); ctx.moveTo(p.x - bw, by); ctx.lineTo(p.x - bw, by - bh * 0.6); ctx.quadraticCurveTo(p.x, by - bh - 8 * s, p.x + bw, by - bh * 0.6); ctx.lineTo(p.x + bw, by); ctx.closePath(); ctx.fill();
      // 暗面
      ctx.fillStyle = 'rgba(0,0,0,0.08)';
      ctx.beginPath(); ctx.moveTo(p.x, by - bh - 4 * s); ctx.quadraticCurveTo(p.x + bw * 0.8, by - bh * 0.7, p.x + bw, by - bh * 0.6); ctx.lineTo(p.x + bw, by); ctx.lineTo(p.x, by); ctx.closePath(); ctx.fill();
    } else if (style === 3) {
      // 二层楼房
      const bh2 = bh * 1.3;
      ctx.fillStyle = dimColor(isHover ? ac : mc, br);
      ctx.beginPath(); ctx.moveTo(p.x - bw * 0.9, by - bh2); ctx.lineTo(p.x, by - bh2 + bd * 0.45); ctx.lineTo(p.x, by + bd * 0.45); ctx.lineTo(p.x - bw * 0.9, by); ctx.closePath(); ctx.fill();
      ctx.fillStyle = dimColor(isHover ? ac : rc, br);
      ctx.beginPath(); ctx.moveTo(p.x, by - bh2 + bd * 0.45); ctx.lineTo(p.x + bw * 0.9, by - bh2); ctx.lineTo(p.x + bw * 0.9, by); ctx.lineTo(p.x, by + bd * 0.45); ctx.closePath(); ctx.fill();
      // 楼层分割线
      ctx.strokeStyle = 'rgba(0,0,0,0.1)'; ctx.lineWidth = 1 * s;
      ctx.beginPath(); ctx.moveTo(p.x - bw * 0.9, by - bh2 * 0.45); ctx.lineTo(p.x + bw * 0.9, by - bh2 * 0.45); ctx.stroke();
      // 尖顶
      ctx.fillStyle = dimColor(rc, br);
      ctx.beginPath(); ctx.moveTo(p.x, by - bh2 - 6 * s); ctx.lineTo(p.x + bw + s, by - bh2 + s); ctx.lineTo(p.x, by - bh2 + bd * 0.45 + 2 * s); ctx.lineTo(p.x - bw - s, by - bh2 + s); ctx.closePath(); ctx.fill();
    } else {
      // 小木屋（深色）
      ctx.fillStyle = dimColor('#6a5545', br);
      ctx.beginPath(); ctx.moveTo(p.x - bw, by - bh); ctx.lineTo(p.x, by - bh + bd * 0.5); ctx.lineTo(p.x, by + bd * 0.5); ctx.lineTo(p.x - bw, by); ctx.closePath(); ctx.fill();
      ctx.fillStyle = dimColor('#5a4535', br);
      ctx.beginPath(); ctx.moveTo(p.x, by - bh + bd * 0.5); ctx.lineTo(p.x + bw, by - bh); ctx.lineTo(p.x + bw, by); ctx.lineTo(p.x, by + bd * 0.5); ctx.closePath(); ctx.fill();
      // 原木纹
      ctx.strokeStyle = 'rgba(0,0,0,0.08)'; ctx.lineWidth = 0.8 * s;
      for (let k = 1; k < 4; k++) {
        const yy = by - bh * k / 4;
        ctx.beginPath(); ctx.moveTo(p.x - bw, yy); ctx.lineTo(p.x, yy + bd * 0.25); ctx.stroke();
      }
      ctx.fillStyle = dimColor(rc, br);
      ctx.beginPath(); ctx.moveTo(p.x, by - bh - 7 * s); ctx.lineTo(p.x + bw + 3 * s, by - bh + 2 * s); ctx.lineTo(p.x, by - bh + bd * 0.5 + 3 * s); ctx.lineTo(p.x - bw - 3 * s, by - bh + 2 * s); ctx.closePath(); ctx.fill();
    }

    // ── 窗户（夜晚发光） ──
    if (isNight) {
      ctx.fillStyle = 'rgba(255,220,140,0.7)';
      ctx.shadowColor = 'rgba(255,200,100,0.5)'; ctx.shadowBlur = 8 * s;
    } else {
      ctx.fillStyle = 'rgba(255,240,200,0.45)';
      ctx.shadowBlur = 0;
    }
    const winW = 4 * s, winH = 5 * s;
    ctx.fillRect(p.x - bw * 0.6, by - bh * 0.55, winW, winH);
    ctx.fillRect(p.x - bw * 0.3, by - bh * 0.55, winW, winH);
    ctx.fillRect(p.x + bw * 0.2, by - bh * 0.5, winW, winH);
    ctx.shadowBlur = 0;

    // ── 门 ──
    ctx.fillStyle = dimColor('#503020', br);
    ctx.fillRect(p.x - 3 * s, by - 1 * s + bd * 0.25, 5 * s, 8 * s);
    // 门灯
    if (isNight) {
      ctx.fillStyle = 'rgba(255,200,100,0.9)';
      ctx.shadowColor = 'rgba(255,180,80,0.6)'; ctx.shadowBlur = 10 * s;
      ctx.beginPath(); ctx.arc(p.x - 0.5 * s, by - 2 * s + bd * 0.25, 2 * s, 0, Math.PI * 2); ctx.fill();
      ctx.shadowBlur = 0;
    } else {
      ctx.fillStyle = ac;
      ctx.beginPath(); ctx.arc(p.x - 0.5 * s, by - 2 * s + bd * 0.25, 1.5 * s, 0, Math.PI * 2); ctx.fill();
    }

    // ── 名字 ──
    ctx.fillStyle = isHover ? (isNight ? '#eee' : '#1a1a1a') : (isNight ? 'rgba(220,210,200,0.7)' : 'rgba(60,50,40,0.75)');
    ctx.font = (isHover ? 'bold ' : '') + Math.round(9 * s) + 'px "Noto Sans SC",system-ui,sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    ctx.fillText(a.name, p.x, by + bd * 0.5 + 6 * s);
    if (isHover) {
      ctx.fillStyle = isNight ? '#e8d5c0' : ac;
      ctx.font = Math.round(7 * s) + 'px "Noto Sans SC",system-ui,sans-serif';
      ctx.fillText(a.mbti + ' \u00b7 ' + a.archetype, p.x, by + bd * 0.5 + 18 * s);
    }
  }

  // ── 人类用户房屋绘制（暗红色） ──
  function drawUserBuilding(ubIdx, dl) {
    const ub = userBuildings[ubIdx];
    if (!ub) return;
    const user = ub.user;
    const p = worldToScreen(ub.gx, ub.gy);
    const s = scale;
    const isHover = (hoveredUserBuilding === ubIdx);
    const bumpY = isHover ? -6 * s : 0;
    const br = dl.brightness;
    const isNight = br < 0.5;

    const bw = 20 * s;
    const bh = 18 * s;
    const bd = bw * 0.6;
    const by = p.y + bumpY;

    function dimColor(hex, b2) {
      const rr = parseInt(hex.slice(1, 3), 16) * b2;
      const gg = parseInt(hex.slice(3, 5), 16) * b2;
      const bb = parseInt(hex.slice(5, 7), 16) * b2;
      return 'rgb(' + Math.floor(rr) + ',' + Math.floor(gg) + ',' + Math.floor(bb) + ')';
    }

    // 阴影
    ctx.fillStyle = 'rgba(0,0,0,' + (0.08 + (1 - br) * 0.06) + ')';
    ctx.beginPath(); ctx.ellipse(p.x, p.y + 4 * s, bw * 1.2, bd * 0.4, 0, 0, Math.PI * 2); ctx.fill();

    // 暗红色尖顶屋 — 左面
    ctx.fillStyle = dimColor(isHover ? USER_HOUSE_ACCENT : USER_HOUSE_COLOR, br);
    ctx.beginPath(); ctx.moveTo(p.x - bw, by - bh); ctx.lineTo(p.x, by - bh + bd * 0.5); ctx.lineTo(p.x, by + bd * 0.5); ctx.lineTo(p.x - bw, by); ctx.closePath(); ctx.fill();
    // 右面（稍暗）
    ctx.fillStyle = dimColor(isHover ? USER_HOUSE_ACCENT : USER_HOUSE_ROOF, br);
    ctx.beginPath(); ctx.moveTo(p.x, by - bh + bd * 0.5); ctx.lineTo(p.x + bw, by - bh); ctx.lineTo(p.x + bw, by); ctx.lineTo(p.x, by + bd * 0.5); ctx.closePath(); ctx.fill();
    // 尖顶
    ctx.fillStyle = dimColor(USER_HOUSE_ROOF, br);
    ctx.beginPath(); ctx.moveTo(p.x, by - bh - 10 * s); ctx.lineTo(p.x + bw + 2 * s, by - bh + 2 * s); ctx.lineTo(p.x, by - bh + bd * 0.5 + 3 * s); ctx.lineTo(p.x - bw - 2 * s, by - bh + 2 * s); ctx.closePath(); ctx.fill();

    // 暗红色发光边框（区分标记）
    ctx.strokeStyle = isHover ? 'rgba(196,48,48,0.8)' : 'rgba(139,32,32,0.4)';
    ctx.lineWidth = 1.5 * s;
    ctx.beginPath(); ctx.moveTo(p.x - bw, by - bh); ctx.lineTo(p.x, by - bh + bd * 0.5); ctx.lineTo(p.x + bw, by - bh); ctx.stroke();

    // 窗户
    if (isNight) {
      ctx.fillStyle = 'rgba(255,180,140,0.7)';
      ctx.shadowColor = 'rgba(255,150,100,0.5)'; ctx.shadowBlur = 8 * s;
    } else {
      ctx.fillStyle = 'rgba(255,220,200,0.5)';
      ctx.shadowBlur = 0;
    }
    const winW = 4 * s, winH = 5 * s;
    ctx.fillRect(p.x - bw * 0.5, by - bh * 0.55, winW, winH);
    ctx.fillRect(p.x + bw * 0.15, by - bh * 0.5, winW, winH);
    ctx.shadowBlur = 0;

    // 门
    ctx.fillStyle = dimColor('#401010', br);
    ctx.fillRect(p.x - 3 * s, by - 1 * s + bd * 0.25, 5 * s, 8 * s);
    // 门灯（暖红色）
    if (isNight) {
      ctx.fillStyle = 'rgba(255,150,100,0.9)';
      ctx.shadowColor = 'rgba(255,120,80,0.6)'; ctx.shadowBlur = 10 * s;
      ctx.beginPath(); ctx.arc(p.x - 0.5 * s, by - 2 * s + bd * 0.25, 2 * s, 0, Math.PI * 2); ctx.fill();
      ctx.shadowBlur = 0;
    } else {
      ctx.fillStyle = USER_HOUSE_ACCENT;
      ctx.beginPath(); ctx.arc(p.x - 0.5 * s, by - 2 * s + bd * 0.25, 1.5 * s, 0, Math.PI * 2); ctx.fill();
    }

    // 名字 + 「居民」标签
    ctx.fillStyle = isHover ? (isNight ? '#ffcccc' : '#6b1515') : (isNight ? 'rgba(255,200,200,0.7)' : 'rgba(139,32,32,0.85)');
    ctx.font = (isHover ? 'bold ' : '') + Math.round(9 * s) + 'px "Noto Sans SC",system-ui,sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    ctx.fillText((user.name || '???') + ' \u2302', p.x, by + bd * 0.5 + 6 * s);
    if (isHover) {
      ctx.fillStyle = isNight ? '#e8b0b0' : USER_HOUSE_ACCENT;
      ctx.font = Math.round(7 * s) + 'px "Noto Sans SC",system-ui,sans-serif';
      ctx.fillText((user.mbti || 'ENFP') + ' \u00b7 \u5c0f\u9547\u5c45\u6c11', p.x, by + bd * 0.5 + 18 * s);
    }
  }

  // ── 行人绘制 ──
  function drawWalker(w, dl) {
    const hour = timeOfDay * 24;
    if (w.atHome && w.paused && (hour > 22 || hour < 5)) return; // 在家睡觉不画
    const p = worldToScreen(w.x, w.y);
    const s = scale;
    const br = dl.brightness;
    const bob = Math.sin(w.frame) * 1.5 * s; // 走路上下跳

    // 阴影
    ctx.fillStyle = 'rgba(0,0,0,0.12)';
    ctx.beginPath(); ctx.ellipse(p.x, p.y + 2 * s, 4 * s, 1.5 * s, 0, 0, Math.PI * 2); ctx.fill();

    // 身体
    ctx.fillStyle = 'rgb(' + Math.floor(parseInt(w.color.slice(1,3),16) * br) + ',' + Math.floor(parseInt(w.color.slice(3,5),16) * br) + ',' + Math.floor(parseInt(w.color.slice(5,7),16) * br) + ')';
    ctx.beginPath(); ctx.ellipse(p.x, p.y - 5 * s + bob, 3.5 * s, 5 * s, 0, 0, Math.PI * 2); ctx.fill();

    // 头
    ctx.fillStyle = 'rgb(' + Math.floor(230 * br) + ',' + Math.floor(210 * br) + ',' + Math.floor(190 * br) + ')';
    ctx.beginPath(); ctx.arc(p.x, p.y - 11 * s + bob, 2.5 * s, 0, Math.PI * 2); ctx.fill();

    // 名字（小字）
    if (scale > 0.7) {
      ctx.fillStyle = 'rgba(' + (br > 0.5 ? '60,50,40' : '220,210,200') + ',0.6)';
      ctx.font = Math.round(6.5 * s) + 'px "Noto Sans SC",system-ui,sans-serif';
      ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
      ctx.fillText(w.name, p.x, p.y - 14 * s + bob);
    }
  }

  // ── 车辆绘制 ──
  function drawVehicle(v, dl) {
    const p = worldToScreen(v.x, v.y);
    const s = scale;
    const br = dl.brightness;
    const isNight = br < 0.5;

    // 阴影
    ctx.fillStyle = 'rgba(0,0,0,0.1)';
    ctx.beginPath(); ctx.ellipse(p.x, p.y + 3 * s, 12 * s, 3 * s, 0, 0, Math.PI * 2); ctx.fill();

    if (v.type === 'bus') {
      // 公交车：加长暖色车身
      ctx.fillStyle = 'rgb(' + Math.floor(200 * br) + ',' + Math.floor(160 * br) + ',' + Math.floor(96 * br) + ')';
      // 车身（较长）
      ctx.beginPath();
      ctx.moveTo(p.x - 14 * s, p.y);
      ctx.lineTo(p.x - 14 * s, p.y - 10 * s);
      ctx.lineTo(p.x - 12 * s, p.y - 12 * s);
      ctx.lineTo(p.x + 12 * s, p.y - 12 * s);
      ctx.lineTo(p.x + 14 * s, p.y - 10 * s);
      ctx.lineTo(p.x + 14 * s, p.y);
      ctx.closePath(); ctx.fill();
      // 窗带
      ctx.fillStyle = isNight ? 'rgba(255,220,140,0.5)' : 'rgba(180,210,230,0.55)';
      ctx.fillRect(p.x - 11 * s, p.y - 11 * s, 22 * s, 4 * s);
      // 顶部
      ctx.fillStyle = 'rgb(' + Math.floor(180 * br) + ',' + Math.floor(140 * br) + ',' + Math.floor(80 * br) + ')';
      ctx.fillRect(p.x - 13 * s, p.y - 13 * s, 26 * s, 2 * s);
      // 标志
      ctx.fillStyle = 'rgb(' + Math.floor(60 * br) + ',' + Math.floor(50 * br) + ',' + Math.floor(40 * br) + ')';
      ctx.font = Math.round(5 * s) + 'px "Noto Sans SC",system-ui,sans-serif';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('\u5c0f\u9547\u516c\u4ea4', p.x, p.y - 5 * s); // 小镇公交
      // 车轮
      ctx.fillStyle = '#333';
      ctx.beginPath(); ctx.arc(p.x - 9 * s, p.y + 0.5 * s, 2.5 * s, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(p.x + 9 * s, p.y + 0.5 * s, 2.5 * s, 0, Math.PI * 2); ctx.fill();
    } else if (v.type === 'truck') {
      ctx.fillStyle = 'rgb(' + Math.floor(100 * br) + ',' + Math.floor(90 * br) + ',' + Math.floor(75 * br) + ')';
      ctx.fillRect(p.x - 12 * s, p.y - 10 * s, 24 * s, 8 * s);
      ctx.fillStyle = 'rgb(' + Math.floor(130 * br) + ',' + Math.floor(115 * br) + ',' + Math.floor(95 * br) + ')';
      ctx.fillRect(p.x - 14 * s, p.y - 8 * s, 28 * s, 6 * s);
      ctx.fillStyle = '#333';
      ctx.beginPath(); ctx.arc(p.x - 8 * s, p.y, 2.5 * s, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(p.x + 8 * s, p.y, 2.5 * s, 0, Math.PI * 2); ctx.fill();
    } else {
      // 小车
      ctx.fillStyle = 'rgb(' + Math.floor(parseInt(v.color.slice(1,3),16) * br) + ',' + Math.floor(parseInt(v.color.slice(3,5),16) * br) + ',' + Math.floor(parseInt(v.color.slice(5,7),16) * br) + ')';
      // 车身
      ctx.beginPath();
      ctx.moveTo(p.x - 9 * s, p.y - 2 * s);
      ctx.lineTo(p.x - 6 * s, p.y - 7 * s);
      ctx.lineTo(p.x + 5 * s, p.y - 7 * s);
      ctx.lineTo(p.x + 9 * s, p.y - 2 * s);
      ctx.lineTo(p.x + 9 * s, p.y);
      ctx.lineTo(p.x - 9 * s, p.y);
      ctx.closePath(); ctx.fill();
      // 车窗
      ctx.fillStyle = isNight ? 'rgba(255,220,140,0.5)' : 'rgba(180,210,230,0.6)';
      ctx.fillRect(p.x - 4 * s, p.y - 6 * s, 7 * s, 3 * s);
      // 车轮
      ctx.fillStyle = '#333';
      ctx.beginPath(); ctx.arc(p.x - 5 * s, p.y + 0.5 * s, 2 * s, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(p.x + 5 * s, p.y + 0.5 * s, 2 * s, 0, Math.PI * 2); ctx.fill();
    }
    // 夜间车灯
    if (isNight) {
      ctx.fillStyle = 'rgba(255,240,180,0.8)';
      ctx.shadowColor = 'rgba(255,220,100,0.5)'; ctx.shadowBlur = 8 * s;
      ctx.beginPath(); ctx.arc(p.x + (v.dir > 0 ? 9 : -9) * s, p.y - 3 * s, 1.5 * s, 0, Math.PI * 2); ctx.fill();
      ctx.shadowBlur = 0;
    }
  }

  // ── 气泡绘制 ──
  function drawBubble(cb) {
    const alpha = Math.min(1, cb.life / 0.5); // 淡入淡出
    const p = worldToScreen(cb.x, cb.y);
    const s = scale;
    const bx = p.x + 6 * s, by = p.y - 22 * s;
    ctx.save();
    ctx.globalAlpha = alpha;
    // 气泡背景
    ctx.fillStyle = 'rgba(255,255,255,0.92)';
    ctx.strokeStyle = 'rgba(200,168,130,0.5)';
    ctx.lineWidth = 1 * s;
    const tw = ctx.measureText(cb.text).width || 40;
    const pw = Math.max(tw + 12 * s, 30 * s);
    const ph = 16 * s;
    // 圆角矩形
    const rx = 3 * s;
    ctx.beginPath();
    ctx.moveTo(bx - pw / 2 + rx, by - ph);
    ctx.lineTo(bx + pw / 2 - rx, by - ph);
    ctx.quadraticCurveTo(bx + pw / 2, by - ph, bx + pw / 2, by - ph + rx);
    ctx.lineTo(bx + pw / 2, by - rx);
    ctx.quadraticCurveTo(bx + pw / 2, by, bx + pw / 2 - rx, by);
    // 小三角
    ctx.lineTo(bx + 4 * s, by);
    ctx.lineTo(bx, by + 4 * s);
    ctx.lineTo(bx - 2 * s, by);
    ctx.lineTo(bx - pw / 2 + rx, by);
    ctx.quadraticCurveTo(bx - pw / 2, by, bx - pw / 2, by - rx);
    ctx.lineTo(bx - pw / 2, by - ph + rx);
    ctx.quadraticCurveTo(bx - pw / 2, by - ph, bx - pw / 2 + rx, by - ph);
    ctx.closePath();
    ctx.fill(); ctx.stroke();
    // 文字
    ctx.fillStyle = '#3a3a3a';
    ctx.font = Math.round(8 * s) + 'px "Noto Sans SC",system-ui,sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(cb.text, bx, by - ph / 2);
    ctx.restore();
  }

  // ── 组团绿化绘制 ──
  function drawGreenCluster(g, dl) {
    const p = worldToScreen(g.x, g.y);
    const s = g.size * scale;
    const br = dl.brightness;
    const sway = Math.sin(performance.now() * 0.0015 + g.seed) * s;

    if (g.variant === 0) {
      // 花坛：圆形石边 + 彩色花朵
      ctx.fillStyle = 'rgb(' + Math.floor(170 * br) + ',' + Math.floor(155 * br) + ',' + Math.floor(130 * br) + ')';
      ctx.beginPath(); ctx.ellipse(p.x, p.y, 7 * s, 3.5 * s, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = 'rgb(' + Math.floor(90 * br) + ',' + Math.floor(140 * br) + ',' + Math.floor(70 * br) + ')';
      ctx.beginPath(); ctx.ellipse(p.x, p.y - 1 * s, 6 * s, 3 * s, 0, 0, Math.PI * 2); ctx.fill();
      // 小花朵
      const flowerColors = ['#e06060', '#e0a040', '#d060c0', '#e0e050', '#f0f0f0'];
      for (let f = 0; f < 5; f++) {
        const fx = p.x + (f - 2) * 2.2 * s + sway * 0.3;
        const fy = p.y - 2.5 * s + Math.sin(f * 1.8) * s;
        ctx.fillStyle = flowerColors[f % flowerColors.length];
        ctx.globalAlpha = br;
        ctx.beginPath(); ctx.arc(fx, fy, 1.2 * s, 0, Math.PI * 2); ctx.fill();
        ctx.globalAlpha = 1;
      }
    } else if (g.variant === 1) {
      // 灌木丛：几个深绿椭圆
      const greens = [[0,0,1], [-2.5,-0.5,0.8], [2,-0.3,0.7], [0.5,1,0.6]];
      for (const [ox, oy, sz] of greens) {
        ctx.fillStyle = 'rgb(' + Math.floor((60 + ox * 5) * br) + ',' + Math.floor((100 + ox * 3) * br) + ',' + Math.floor((50 + ox * 4) * br) + ')';
        ctx.beginPath(); ctx.ellipse(p.x + ox * s + sway * 0.2, p.y + oy * s - 2 * s, 4 * sz * s, 3 * sz * s, 0, 0, Math.PI * 2); ctx.fill();
      }
    } else if (g.variant === 2) {
      // 小花园：方形矮篱笆 + 内部绿植
      const hw = 5 * s, hh = 3 * s;
      ctx.strokeStyle = 'rgb(' + Math.floor(120 * br) + ',' + Math.floor(100 * br) + ',' + Math.floor(70 * br) + ')';
      ctx.lineWidth = 0.8 * s;
      ctx.strokeRect(p.x - hw, p.y - hh, hw * 2, hh * 2);
      ctx.fillStyle = 'rgb(' + Math.floor(100 * br) + ',' + Math.floor(155 * br) + ',' + Math.floor(80 * br) + ')';
      ctx.fillRect(p.x - hw + s, p.y - hh + s, hw * 2 - 2 * s, hh * 2 - 2 * s);
      // 小花
      ctx.fillStyle = 'rgb(' + Math.floor(220 * br) + ',' + Math.floor(180 * br) + ',' + Math.floor(60 * br) + ')';
      ctx.beginPath(); ctx.arc(p.x - 2 * s, p.y - s, s, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = 'rgb(' + Math.floor(220 * br) + ',' + Math.floor(100 * br) + ',' + Math.floor(100 * br) + ')';
      ctx.beginPath(); ctx.arc(p.x + 2 * s, p.y + 0.5 * s, s, 0, Math.PI * 2); ctx.fill();
    } else {
      // 盆栽排：一排小圆盆
      for (let pi = 0; pi < 3; pi++) {
        const bx = p.x + (pi - 1) * 3.5 * s;
        // 盆
        ctx.fillStyle = 'rgb(' + Math.floor(160 * br) + ',' + Math.floor(110 * br) + ',' + Math.floor(75 * br) + ')';
        ctx.fillRect(bx - 1.5 * s, p.y - 0.5 * s, 3 * s, 2.5 * s);
        // 植物
        ctx.fillStyle = 'rgb(' + Math.floor(75 * br) + ',' + Math.floor(125 * br) + ',' + Math.floor(60 * br) + ')';
        ctx.beginPath(); ctx.ellipse(bx + sway * 0.15, p.y - 2.5 * s, 2.5 * s, 2 * s, 0, 0, Math.PI * 2); ctx.fill();
      }
    }
  }

  // ── 公共建筑绘制 ──
  function drawPublicBuilding(pb, dl) {
    const p = worldToScreen(pb.gx, pb.gy);
    const s = scale;
    const br = dl.brightness;
    const isNight = br < 0.5;

    function dim(hex, b2) {
      return 'rgb(' + Math.floor(parseInt(hex.slice(1,3),16)*b2) + ',' + Math.floor(parseInt(hex.slice(3,5),16)*b2) + ',' + Math.floor(parseInt(hex.slice(5,7),16)*b2) + ')';
    }

    // 阴影
    ctx.fillStyle = 'rgba(0,0,0,' + (0.08 + (1 - br) * 0.06) + ')';
    ctx.beginPath(); ctx.ellipse(p.x, p.y + 5 * s, 35 * s, 10 * s, 0, 0, Math.PI * 2); ctx.fill();

    if (pb.type === 'plaza') {
      // ── 广场：大型开放圆台 + 中央喷泉 + 旗帜 ──
      // 圆形地面
      ctx.fillStyle = dim('#d4c4a8', br);
      ctx.beginPath(); ctx.ellipse(p.x, p.y, 32 * s, 16 * s, 0, 0, Math.PI * 2); ctx.fill();
      // 内圈
      ctx.strokeStyle = dim('#b5a48a', br); ctx.lineWidth = 1.5 * s;
      ctx.beginPath(); ctx.ellipse(p.x, p.y, 24 * s, 12 * s, 0, 0, Math.PI * 2); ctx.stroke();
      ctx.beginPath(); ctx.ellipse(p.x, p.y, 16 * s, 8 * s, 0, 0, Math.PI * 2); ctx.stroke();
      // 中央喷泉底座
      ctx.fillStyle = dim('#a0907a', br);
      ctx.beginPath(); ctx.ellipse(p.x, p.y - 4 * s, 8 * s, 4 * s, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = dim('#c8b8a0', br);
      ctx.fillRect(p.x - 3 * s, p.y - 18 * s, 6 * s, 14 * s);
      // 水花
      ctx.fillStyle = 'rgba(130,190,220,' + (0.3 + br * 0.3) + ')';
      const splash = Math.sin(performance.now() * 0.003) * 2 * s;
      ctx.beginPath(); ctx.ellipse(p.x, p.y - 20 * s + splash, 5 * s, 3 * s, 0, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.ellipse(p.x, p.y - 22 * s - splash, 3 * s, 2 * s, 0, 0, Math.PI * 2); ctx.fill();
      // 旗杆（两侧）
      for (const side of [-1, 1]) {
        const fx = p.x + side * 26 * s;
        ctx.fillStyle = dim('#8a7a6a', br);
        ctx.fillRect(fx - 1 * s, p.y - 30 * s, 2 * s, 30 * s);
        // 旗帜（随风飘）
        const flagSway = Math.sin(performance.now() * 0.002 + side) * 3 * s;
        ctx.fillStyle = side > 0 ? dim('#c8a882', br) : dim('#8b6f5e', br);
        ctx.beginPath();
        ctx.moveTo(fx + 1 * s, p.y - 30 * s);
        ctx.lineTo(fx + 12 * s + flagSway, p.y - 28 * s);
        ctx.lineTo(fx + 10 * s + flagSway * 0.5, p.y - 24 * s);
        ctx.lineTo(fx + 1 * s, p.y - 22 * s);
        ctx.closePath(); ctx.fill();
      }
      // 长椅（四角）
      ctx.fillStyle = dim('#7a6a5a', br);
      for (const ox of [-20, 20]) {
        for (const oy of [-6, 6]) {
          ctx.fillRect(p.x + ox * s - 4 * s, p.y + oy * s, 8 * s, 2.5 * s);
          ctx.fillRect(p.x + ox * s - 4 * s, p.y + oy * s - 3 * s, 1.2 * s, 3 * s);
          ctx.fillRect(p.x + ox * s + 2.8 * s, p.y + oy * s - 3 * s, 1.2 * s, 3 * s);
        }
      }

    } else if (pb.type === 'cafe') {
      // ── 咖啡厅：暖色小楼 + 遮阳篷 + 露天座 ──
      const bw = 28 * s, bh = 26 * s, bd = bw * 0.5;
      // 主体
      ctx.fillStyle = dim('#e8d5c0', br);
      ctx.beginPath(); ctx.moveTo(p.x - bw, p.y - bh); ctx.lineTo(p.x, p.y - bh + bd * 0.5); ctx.lineTo(p.x, p.y + bd * 0.5); ctx.lineTo(p.x - bw, p.y); ctx.closePath(); ctx.fill();
      ctx.fillStyle = dim('#d4c0a8', br);
      ctx.beginPath(); ctx.moveTo(p.x, p.y - bh + bd * 0.5); ctx.lineTo(p.x + bw, p.y - bh); ctx.lineTo(p.x + bw, p.y); ctx.lineTo(p.x, p.y + bd * 0.5); ctx.closePath(); ctx.fill();
      // 屋顶
      ctx.fillStyle = dim('#8b6f5e', br);
      ctx.beginPath(); ctx.moveTo(p.x, p.y - bh - 8 * s); ctx.lineTo(p.x + bw + 3 * s, p.y - bh + 2 * s); ctx.lineTo(p.x, p.y - bh + bd * 0.5 + 3 * s); ctx.lineTo(p.x - bw - 3 * s, p.y - bh + 2 * s); ctx.closePath(); ctx.fill();
      // 条纹遮阳篷
      ctx.save();
      for (let stripe = 0; stripe < 6; stripe++) {
        ctx.fillStyle = stripe % 2 === 0 ? dim('#c8a882', br) : dim('#fff8f0', br);
        const sx = p.x - bw + stripe * bw / 3;
        ctx.fillRect(sx, p.y - 2 * s, bw / 3, 4 * s);
      }
      ctx.restore();
      // 大玻璃窗
      ctx.fillStyle = isNight ? 'rgba(255,220,140,0.65)' : 'rgba(180,210,230,0.5)';
      if (isNight) { ctx.shadowColor = 'rgba(255,200,100,0.4)'; ctx.shadowBlur = 12 * s; }
      ctx.fillRect(p.x - bw * 0.7, p.y - bh * 0.6, bw * 0.5, bh * 0.35);
      ctx.fillRect(p.x + bw * 0.1, p.y - bh * 0.55, bw * 0.4, bh * 0.3);
      ctx.shadowBlur = 0;
      // 门
      ctx.fillStyle = dim('#6b4f3e', br);
      ctx.fillRect(p.x - 3.5 * s, p.y - 1 * s + bd * 0.2, 7 * s, 10 * s);
      // 露天桌椅（前方）
      for (let ti = 0; ti < 3; ti++) {
        const tx = p.x - 12 * s + ti * 12 * s;
        const ty = p.y + bd * 0.5 + 8 * s;
        // 遮阳伞
        ctx.fillStyle = ti % 2 === 0 ? dim('#c8a882', br) : dim('#e8d5c0', br);
        ctx.beginPath(); ctx.moveTo(tx, ty - 14 * s); ctx.lineTo(tx - 6 * s, ty - 8 * s); ctx.lineTo(tx + 6 * s, ty - 8 * s); ctx.closePath(); ctx.fill();
        ctx.fillStyle = dim('#8a7a6a', br);
        ctx.fillRect(tx - 0.8 * s, ty - 14 * s, 1.6 * s, 11 * s);
        // 桌子
        ctx.fillStyle = dim('#a08060', br);
        ctx.beginPath(); ctx.ellipse(tx, ty - 2 * s, 4 * s, 2 * s, 0, 0, Math.PI * 2); ctx.fill();
      }
      // 杯子
      ctx.fillStyle = dim('#f5f0eb', br);
      ctx.fillRect(p.x - 11 * s, p.y + bd * 0.5 + 4 * s, 2 * s, 2.5 * s);

    } else if (pb.type === 'barber') {
      // ── 理发店：蓝白红旋转柱 + 小店面 ──
      const bw = 22 * s, bh = 24 * s, bd = bw * 0.5;
      ctx.fillStyle = dim('#d8d8d8', br);
      ctx.beginPath(); ctx.moveTo(p.x - bw, p.y - bh); ctx.lineTo(p.x, p.y - bh + bd * 0.5); ctx.lineTo(p.x, p.y + bd * 0.5); ctx.lineTo(p.x - bw, p.y); ctx.closePath(); ctx.fill();
      ctx.fillStyle = dim('#c8c8c8', br);
      ctx.beginPath(); ctx.moveTo(p.x, p.y - bh + bd * 0.5); ctx.lineTo(p.x + bw, p.y - bh); ctx.lineTo(p.x + bw, p.y); ctx.lineTo(p.x, p.y + bd * 0.5); ctx.closePath(); ctx.fill();
      // 平顶
      ctx.fillStyle = dim('#4a5568', br);
      ctx.beginPath(); ctx.moveTo(p.x - bw - 1 * s, p.y - bh); ctx.lineTo(p.x, p.y - bh + bd * 0.5); ctx.lineTo(p.x + bw + 1 * s, p.y - bh); ctx.lineTo(p.x, p.y - bh - bd * 0.5); ctx.closePath(); ctx.fill();
      // 旋转柱（红白蓝条纹）
      const pillarX = p.x - bw - 6 * s;
      ctx.fillStyle = dim('#e8e8e8', br);
      ctx.fillRect(pillarX - 2.5 * s, p.y - 20 * s, 5 * s, 20 * s);
      const t = performance.now() * 0.003;
      const colors = ['#e44', '#fff', '#44e'];
      for (let stripe = 0; stripe < 6; stripe++) {
        const sy = p.y - 20 * s + ((stripe * 3.5 + t * 3) % 21) * s;
        ctx.fillStyle = dim(colors[stripe % 3], br);
        ctx.fillRect(pillarX - 2.5 * s, sy, 5 * s, 2.5 * s);
      }
      // 窗+门
      ctx.fillStyle = isNight ? 'rgba(255,220,140,0.6)' : 'rgba(180,210,230,0.5)';
      if (isNight) { ctx.shadowColor = 'rgba(255,200,100,0.3)'; ctx.shadowBlur = 8 * s; }
      ctx.fillRect(p.x - bw * 0.6, p.y - bh * 0.55, bw * 0.45, bh * 0.3);
      ctx.shadowBlur = 0;
      ctx.fillStyle = dim('#4a5568', br);
      ctx.fillRect(p.x - 3 * s, p.y + bd * 0.2, 6 * s, 8 * s);
      // 招牌
      ctx.fillStyle = dim('#e8d5c0', br);
      ctx.fillRect(p.x - 10 * s, p.y - bh - 2 * s, 20 * s, 7 * s);
      ctx.fillStyle = dim('#4a5568', br);
      ctx.font = 'bold ' + Math.round(6 * s) + 'px "Noto Sans SC",system-ui,sans-serif';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('\u7406\u53d1\u5e97', p.x, p.y - bh + 1.5 * s);

    } else if (pb.type === 'park') {
      // ── 宠物乐园：围栏 + 草地 + 秋千 + 小动物 ──
      // 草地
      ctx.fillStyle = dim('#a8c890', br);
      ctx.beginPath(); ctx.ellipse(p.x, p.y, 34 * s, 18 * s, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = dim('#b8d8a0', br);
      ctx.beginPath(); ctx.ellipse(p.x, p.y, 28 * s, 14 * s, 0, 0, Math.PI * 2); ctx.fill();
      // 木栅栏
      ctx.strokeStyle = dim('#8a6a4a', br); ctx.lineWidth = 1.5 * s;
      ctx.beginPath(); ctx.ellipse(p.x, p.y, 33 * s, 17 * s, 0, 0, Math.PI * 2); ctx.stroke();
      // 栏杆竖线
      for (let fi = 0; fi < 16; fi++) {
        const angle = (fi / 16) * Math.PI * 2;
        const fx = p.x + Math.cos(angle) * 33 * s;
        const fy = p.y + Math.sin(angle) * 17 * s;
        ctx.fillStyle = dim('#8a6a4a', br);
        ctx.fillRect(fx - 0.8 * s, fy - 5 * s, 1.6 * s, 5 * s);
      }
      // 入口拱门
      ctx.fillStyle = dim('#c8a882', br);
      ctx.beginPath();
      ctx.moveTo(p.x - 5 * s, p.y + 17 * s);
      ctx.lineTo(p.x - 5 * s, p.y + 5 * s);
      ctx.quadraticCurveTo(p.x, p.y + 1 * s, p.x + 5 * s, p.y + 5 * s);
      ctx.lineTo(p.x + 5 * s, p.y + 17 * s);
      ctx.lineWidth = 2 * s; ctx.strokeStyle = dim('#c8a882', br); ctx.stroke();
      // 秋千架
      const swX = p.x - 12 * s;
      ctx.fillStyle = dim('#7a5a3a', br);
      ctx.fillRect(swX - 8 * s, p.y - 18 * s, 2 * s, 18 * s);
      ctx.fillRect(swX + 6 * s, p.y - 18 * s, 2 * s, 18 * s);
      ctx.fillRect(swX - 8 * s, p.y - 18 * s, 16 * s, 2 * s);
      // 秋千绳 + 座
      const swAng = Math.sin(performance.now() * 0.002) * 4 * s;
      ctx.strokeStyle = dim('#5a4a3a', br); ctx.lineWidth = 1 * s;
      ctx.beginPath(); ctx.moveTo(swX - 3 * s, p.y - 16 * s); ctx.lineTo(swX - 3 * s + swAng, p.y - 4 * s); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(swX + 3 * s, p.y - 16 * s); ctx.lineTo(swX + 3 * s + swAng, p.y - 4 * s); ctx.stroke();
      ctx.fillStyle = dim('#8a6a4a', br);
      ctx.fillRect(swX - 5 * s + swAng, p.y - 5 * s, 6 * s, 2 * s);
      // 小动物（猫/狗形状）
      const petBounce = Math.sin(performance.now() * 0.004) * 1.5 * s;
      // 小狗
      ctx.fillStyle = dim('#b08050', br);
      ctx.beginPath(); ctx.ellipse(p.x + 10 * s, p.y - 3 * s + petBounce, 4 * s, 3 * s, 0, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(p.x + 14 * s, p.y - 5 * s + petBounce, 2 * s, 0, Math.PI * 2); ctx.fill();
      // 小猫
      ctx.fillStyle = dim('#888', br);
      ctx.beginPath(); ctx.ellipse(p.x + 18 * s, p.y + 2 * s - petBounce, 3 * s, 2.5 * s, 0, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(p.x + 20.5 * s, p.y + 0.5 * s - petBounce, 1.8 * s, 0, Math.PI * 2); ctx.fill();
      // 耳朵
      ctx.beginPath(); ctx.moveTo(p.x + 19.5 * s, p.y - 1 * s - petBounce); ctx.lineTo(p.x + 20 * s, p.y - 3 * s - petBounce); ctx.lineTo(p.x + 21 * s, p.y - 1 * s - petBounce); ctx.fill();

    } else if (pb.type === 'school') {
      // ── 学堂：较大建筑 + 钟楼 + 黑板 + 操场 ──
      const bw = 30 * s, bh = 28 * s, bd = bw * 0.5;
      // 操场
      ctx.fillStyle = dim('#c8b890', br);
      ctx.beginPath(); ctx.ellipse(p.x + 20 * s, p.y + 10 * s, 16 * s, 8 * s, 0, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = dim('#b0a070', br); ctx.lineWidth = 1 * s;
      ctx.beginPath(); ctx.ellipse(p.x + 20 * s, p.y + 10 * s, 10 * s, 5 * s, 0, 0, Math.PI * 2); ctx.stroke();
      // 主楼
      ctx.fillStyle = dim('#e0d8c8', br);
      ctx.beginPath(); ctx.moveTo(p.x - bw, p.y - bh); ctx.lineTo(p.x, p.y - bh + bd * 0.5); ctx.lineTo(p.x, p.y + bd * 0.5); ctx.lineTo(p.x - bw, p.y); ctx.closePath(); ctx.fill();
      ctx.fillStyle = dim('#d0c8b8', br);
      ctx.beginPath(); ctx.moveTo(p.x, p.y - bh + bd * 0.5); ctx.lineTo(p.x + bw, p.y - bh); ctx.lineTo(p.x + bw, p.y); ctx.lineTo(p.x, p.y + bd * 0.5); ctx.closePath(); ctx.fill();
      // 屋顶
      ctx.fillStyle = dim('#5b4b6d', br);
      ctx.beginPath(); ctx.moveTo(p.x, p.y - bh - 8 * s); ctx.lineTo(p.x + bw + 3 * s, p.y - bh + 2 * s); ctx.lineTo(p.x, p.y - bh + bd * 0.5 + 3 * s); ctx.lineTo(p.x - bw - 3 * s, p.y - bh + 2 * s); ctx.closePath(); ctx.fill();
      // 钟楼
      ctx.fillStyle = dim('#d0c8b8', br);
      ctx.fillRect(p.x - 4 * s, p.y - bh - 18 * s, 8 * s, 12 * s);
      // 钟
      ctx.fillStyle = dim('#c8a882', br);
      ctx.beginPath(); ctx.arc(p.x, p.y - bh - 10 * s, 3 * s, 0, Math.PI * 2); ctx.fill();
      // 钟楼尖
      ctx.fillStyle = dim('#5b4b6d', br);
      ctx.beginPath(); ctx.moveTo(p.x, p.y - bh - 24 * s); ctx.lineTo(p.x - 5 * s, p.y - bh - 18 * s); ctx.lineTo(p.x + 5 * s, p.y - bh - 18 * s); ctx.closePath(); ctx.fill();
      // 多排窗（两层楼感觉）
      ctx.fillStyle = isNight ? 'rgba(255,220,140,0.6)' : 'rgba(180,210,230,0.45)';
      if (isNight) { ctx.shadowColor = 'rgba(255,200,100,0.3)'; ctx.shadowBlur = 6 * s; }
      for (let row = 0; row < 2; row++) {
        for (let col = 0; col < 3; col++) {
          ctx.fillRect(p.x - bw * 0.7 + col * bw * 0.35, p.y - bh * 0.75 + row * bh * 0.3, 5 * s, 6 * s);
        }
      }
      ctx.shadowBlur = 0;
      // 大门
      ctx.fillStyle = dim('#5b4b6d', br);
      ctx.beginPath();
      ctx.moveTo(p.x - 5 * s, p.y + bd * 0.25);
      ctx.lineTo(p.x - 5 * s, p.y - 4 * s + bd * 0.25);
      ctx.quadraticCurveTo(p.x, p.y - 8 * s + bd * 0.25, p.x + 5 * s, p.y - 4 * s + bd * 0.25);
      ctx.lineTo(p.x + 5 * s, p.y + bd * 0.25);
      ctx.closePath(); ctx.fill();

    } else if (pb.type === 'market') {
      // ── 超市：宽矮建筑 + 大招牌 + 购物车 ──
      const bw = 32 * s, bh = 20 * s, bd = bw * 0.45;
      // 主体（宽矮）
      ctx.fillStyle = dim('#f0e8d8', br);
      ctx.beginPath(); ctx.moveTo(p.x - bw, p.y - bh); ctx.lineTo(p.x, p.y - bh + bd * 0.5); ctx.lineTo(p.x, p.y + bd * 0.5); ctx.lineTo(p.x - bw, p.y); ctx.closePath(); ctx.fill();
      ctx.fillStyle = dim('#e0d8c8', br);
      ctx.beginPath(); ctx.moveTo(p.x, p.y - bh + bd * 0.5); ctx.lineTo(p.x + bw, p.y - bh); ctx.lineTo(p.x + bw, p.y); ctx.lineTo(p.x, p.y + bd * 0.5); ctx.closePath(); ctx.fill();
      // 平顶
      ctx.fillStyle = dim('#d48050', br);
      ctx.beginPath(); ctx.moveTo(p.x - bw - 1 * s, p.y - bh); ctx.lineTo(p.x, p.y - bh + bd * 0.5); ctx.lineTo(p.x + bw + 1 * s, p.y - bh); ctx.lineTo(p.x, p.y - bh - bd * 0.5); ctx.closePath(); ctx.fill();
      // 大招牌
      ctx.fillStyle = dim('#d48050', br);
      ctx.fillRect(p.x - 18 * s, p.y - bh - 10 * s, 36 * s, 10 * s);
      ctx.fillStyle = dim('#fff8f0', br);
      ctx.font = 'bold ' + Math.round(8 * s) + 'px "Noto Sans SC",system-ui,sans-serif';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('\u5c0f\u9547\u8d85\u5e02', p.x, p.y - bh - 5 * s);
      // 大玻璃橱窗
      ctx.fillStyle = isNight ? 'rgba(255,220,140,0.6)' : 'rgba(180,220,240,0.5)';
      if (isNight) { ctx.shadowColor = 'rgba(255,200,100,0.4)'; ctx.shadowBlur = 10 * s; }
      ctx.fillRect(p.x - bw * 0.8, p.y - bh * 0.6, bw * 0.6, bh * 0.4);
      ctx.fillRect(p.x + bw * 0.1, p.y - bh * 0.55, bw * 0.5, bh * 0.35);
      ctx.shadowBlur = 0;
      // 自动门
      ctx.fillStyle = dim('#b06838', br);
      ctx.fillRect(p.x - 4 * s, p.y + bd * 0.15, 8 * s, 10 * s);
      // 购物车
      ctx.strokeStyle = dim('#888', br); ctx.lineWidth = 1 * s;
      const cartX = p.x + bw + 6 * s, cartY = p.y - 2 * s;
      ctx.strokeRect(cartX - 3 * s, cartY - 4 * s, 6 * s, 4 * s);
      ctx.beginPath(); ctx.arc(cartX - 2 * s, cartY + 0.5 * s, 1 * s, 0, Math.PI * 2); ctx.stroke();
      ctx.beginPath(); ctx.arc(cartX + 2 * s, cartY + 0.5 * s, 1 * s, 0, Math.PI * 2); ctx.stroke();
      // 堆叠的果蔬箱（门口）
      ctx.fillStyle = dim('#e06030', br);
      ctx.fillRect(p.x - bw - 4 * s, p.y - 4 * s, 5 * s, 3 * s);
      ctx.fillStyle = dim('#40b040', br);
      ctx.fillRect(p.x - bw - 4 * s, p.y - 7 * s, 5 * s, 3 * s);
      ctx.fillStyle = dim('#e0c040', br);
      ctx.fillRect(p.x - bw - 4 * s, p.y - 10 * s, 5 * s, 3 * s);

    } else if (pb.type === 'bank') {
      // ── 银行：庄重对称建筑 + 柱廊 + 金色标志 ──
      const bw = 26 * s, bh = 28 * s, bd = bw * 0.5;
      // 主体（浅灰/米白庄重感）
      ctx.fillStyle = dim('#d8d4cc', br);
      ctx.beginPath(); ctx.moveTo(p.x - bw, p.y - bh); ctx.lineTo(p.x, p.y - bh + bd * 0.5); ctx.lineTo(p.x, p.y + bd * 0.5); ctx.lineTo(p.x - bw, p.y); ctx.closePath(); ctx.fill();
      ctx.fillStyle = dim('#c8c4bc', br);
      ctx.beginPath(); ctx.moveTo(p.x, p.y - bh + bd * 0.5); ctx.lineTo(p.x + bw, p.y - bh); ctx.lineTo(p.x + bw, p.y); ctx.lineTo(p.x, p.y + bd * 0.5); ctx.closePath(); ctx.fill();
      // 三角楣（古典风）
      ctx.fillStyle = dim('#3a4a5a', br);
      ctx.beginPath();
      ctx.moveTo(p.x - bw - 3 * s, p.y - bh + 1 * s);
      ctx.lineTo(p.x, p.y - bh - 14 * s);
      ctx.lineTo(p.x + bw + 3 * s, p.y - bh + 1 * s);
      ctx.closePath(); ctx.fill();
      // 楣内装饰线
      ctx.strokeStyle = dim('#c8a882', br); ctx.lineWidth = 1 * s;
      ctx.beginPath();
      ctx.moveTo(p.x - bw * 0.5, p.y - bh - 2 * s);
      ctx.lineTo(p.x, p.y - bh - 10 * s);
      ctx.lineTo(p.x + bw * 0.5, p.y - bh - 2 * s);
      ctx.stroke();
      // 柱子（4 根）
      ctx.fillStyle = dim('#d0ccc4', br);
      for (let ci = 0; ci < 4; ci++) {
        const cx = p.x - bw * 0.6 + ci * bw * 0.4;
        ctx.fillRect(cx - 1.5 * s, p.y - bh + 2 * s, 3 * s, bh - 4 * s);
        // 柱头
        ctx.fillRect(cx - 2.5 * s, p.y - bh + 1 * s, 5 * s, 2 * s);
        ctx.fillRect(cx - 2.5 * s, p.y - 3 * s, 5 * s, 2 * s);
      }
      // 窗户
      ctx.fillStyle = isNight ? 'rgba(255,220,140,0.5)' : 'rgba(160,180,200,0.4)';
      if (isNight) { ctx.shadowColor = 'rgba(255,200,100,0.3)'; ctx.shadowBlur = 6 * s; }
      for (let wi = 0; wi < 3; wi++) {
        ctx.fillRect(p.x - bw * 0.55 + wi * bw * 0.35, p.y - bh * 0.6, 4 * s, 7 * s);
      }
      ctx.shadowBlur = 0;
      // 大门（双开）
      ctx.fillStyle = dim('#3a4a5a', br);
      ctx.fillRect(p.x - 4 * s, p.y + bd * 0.15, 3.5 * s, 9 * s);
      ctx.fillRect(p.x + 0.5 * s, p.y + bd * 0.15, 3.5 * s, 9 * s);
      // 金色门把
      ctx.fillStyle = dim('#c8a060', br);
      ctx.beginPath(); ctx.arc(p.x - 1 * s, p.y + bd * 0.15 + 5 * s, 0.8 * s, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(p.x + 1 * s, p.y + bd * 0.15 + 5 * s, 0.8 * s, 0, Math.PI * 2); ctx.fill();
      // 金色标志
      ctx.fillStyle = dim('#c8a060', br);
      ctx.font = 'bold ' + Math.round(7 * s) + 'px "Noto Serif SC",Georgia,serif';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('\u5c0f\u9547\u94f6\u884c', p.x, p.y - bh - 6 * s);
      // ATM机（侧面）
      ctx.fillStyle = dim('#5a6a7a', br);
      ctx.fillRect(p.x + bw + 3 * s, p.y - 8 * s, 5 * s, 8 * s);
      ctx.fillStyle = isNight ? 'rgba(100,200,255,0.6)' : 'rgba(100,200,255,0.3)';
      ctx.fillRect(p.x + bw + 3.8 * s, p.y - 7 * s, 3.4 * s, 3 * s);

    } else if (pb.type === 'arcade') {
      // ── 游戏厅：霓虹灯风格 + 呼吸闪烁 ──
      const bw = 28 * s, bh = 28 * s, bd = bw * 0.45;
      const breathe = 0.6 + 0.4 * Math.sin(performance.now() * 0.003); // 呼吸频率
      const flicker = 0.8 + 0.2 * Math.sin(performance.now() * 0.015 + Math.cos(performance.now() * 0.007) * 2); // 闪烁
      // 主楼
      ctx.fillStyle = dim('#2d2520', br);
      ctx.beginPath(); ctx.moveTo(p.x - bw, p.y - bh); ctx.lineTo(p.x, p.y - bh + bd * 0.5); ctx.lineTo(p.x, p.y + bd * 0.5); ctx.lineTo(p.x - bw, p.y); ctx.closePath(); ctx.fill();
      ctx.fillStyle = dim('#251e18', br);
      ctx.beginPath(); ctx.moveTo(p.x, p.y - bh + bd * 0.5); ctx.lineTo(p.x + bw, p.y - bh); ctx.lineTo(p.x + bw, p.y); ctx.lineTo(p.x, p.y + bd * 0.5); ctx.closePath(); ctx.fill();
      // 屋顶
      ctx.fillStyle = dim('#a07850', br);
      ctx.beginPath(); ctx.moveTo(p.x, p.y - bh - 6 * s); ctx.lineTo(p.x + bw + 2 * s, p.y - bh + 2 * s); ctx.lineTo(p.x, p.y - bh + bd * 0.5 + 2 * s); ctx.lineTo(p.x - bw - 2 * s, p.y - bh + 2 * s); ctx.closePath(); ctx.fill();
      // 霓虹招牌（呼吸闪烁发光）
      const glowAlpha = 0.3 + 0.4 * breathe;
      ctx.shadowColor = 'rgba(200,168,130,' + glowAlpha + ')';
      ctx.shadowBlur = 15 * s * breathe;
      ctx.fillStyle = 'rgba(200,168,130,' + (0.7 + 0.3 * flicker) + ')';
      ctx.fillRect(p.x - 16 * s, p.y - bh - 14 * s, 32 * s, 10 * s);
      ctx.fillStyle = dim('#1a1a1a', br);
      ctx.font = 'bold ' + Math.round(7 * s) + 'px "Noto Sans SC",system-ui,sans-serif';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('\u6e38\u620f\u5385', p.x, p.y - bh - 9 * s);
      ctx.shadowBlur = 0;
      // 游戏机轮廓（窗里可见）
      ctx.fillStyle = isNight ? 'rgba(255,200,100,' + (0.5 + 0.3 * breathe) + ')' : 'rgba(180,210,230,0.5)';
      if (isNight) { ctx.shadowColor = 'rgba(255,180,80,' + (0.2 + 0.2 * breathe) + ')'; ctx.shadowBlur = 8 * s; }
      ctx.fillRect(p.x - bw * 0.7, p.y - bh * 0.65, bw * 0.4, bh * 0.35);
      ctx.fillRect(p.x + bw * 0.15, p.y - bh * 0.6, bw * 0.35, bh * 0.3);
      ctx.shadowBlur = 0;
      // 闪烁小灯（门口两侧）
      for (const side of [-1, 1]) {
        const lx = p.x + side * bw * 0.9;
        const glowR = 2.5 + 1.5 * breathe;
        ctx.fillStyle = 'rgba(200,168,130,' + (0.4 + 0.5 * flicker) + ')';
        ctx.beginPath(); ctx.arc(lx, p.y - 2 * s, glowR * s, 0, Math.PI * 2); ctx.fill();
      }
      // 大门
      ctx.fillStyle = dim('#c8a882', br * flicker);
      ctx.fillRect(p.x - 4 * s, p.y - 8 * s + bd * 0.25, 8 * s, 8 * s);

    } else if (pb.type === 'mafia') {
      // ── 龙虾杀：暗黑神秘风 + 红色呼吸灯 ──
      const bw = 24 * s, bh = 30 * s, bd = bw * 0.45;
      const pulse = 0.5 + 0.5 * Math.sin(performance.now() * 0.002); // 红色脉搏
      // 主楼（暗色调）
      ctx.fillStyle = dim('#2a1515', br);
      ctx.beginPath(); ctx.moveTo(p.x - bw, p.y - bh); ctx.lineTo(p.x, p.y - bh + bd * 0.5); ctx.lineTo(p.x, p.y + bd * 0.5); ctx.lineTo(p.x - bw, p.y); ctx.closePath(); ctx.fill();
      ctx.fillStyle = dim('#201010', br);
      ctx.beginPath(); ctx.moveTo(p.x, p.y - bh + bd * 0.5); ctx.lineTo(p.x + bw, p.y - bh); ctx.lineTo(p.x + bw, p.y); ctx.lineTo(p.x, p.y + bd * 0.5); ctx.closePath(); ctx.fill();
      // 尖顶（哥特风）
      ctx.fillStyle = dim('#6b1515', br);
      ctx.beginPath(); ctx.moveTo(p.x, p.y - bh - 16 * s); ctx.lineTo(p.x + bw + 2 * s, p.y - bh + 2 * s); ctx.lineTo(p.x, p.y - bh + bd * 0.5 + 2 * s); ctx.lineTo(p.x - bw - 2 * s, p.y - bh + 2 * s); ctx.closePath(); ctx.fill();
      // 红色月亮（屋顶上方）
      ctx.fillStyle = 'rgba(180,40,40,' + (0.3 + 0.4 * pulse) + ')';
      ctx.shadowColor = 'rgba(200,30,30,' + (0.2 + 0.3 * pulse) + ')';
      ctx.shadowBlur = 12 * s * pulse;
      ctx.beginPath(); ctx.arc(p.x, p.y - bh - 22 * s, 5 * s, 0, Math.PI * 2); ctx.fill();
      ctx.shadowBlur = 0;
      // 暗红窗户（脉搏发光）
      ctx.fillStyle = isNight ? 'rgba(200,50,50,' + (0.3 + 0.4 * pulse) + ')' : 'rgba(200,50,50,0.15)';
      if (isNight) { ctx.shadowColor = 'rgba(200,30,30,' + (0.15 + 0.15 * pulse) + ')'; ctx.shadowBlur = 6 * s; }
      ctx.fillRect(p.x - bw * 0.6, p.y - bh * 0.65, 6 * s, 8 * s);
      ctx.fillRect(p.x + bw * 0.2, p.y - bh * 0.6, 6 * s, 8 * s);
      ctx.shadowBlur = 0;
      // 门（拱形暗门）
      ctx.fillStyle = dim('#4a0a0a', br);
      ctx.beginPath();
      ctx.moveTo(p.x - 4 * s, p.y + bd * 0.25);
      ctx.lineTo(p.x - 4 * s, p.y - 6 * s + bd * 0.25);
      ctx.quadraticCurveTo(p.x, p.y - 10 * s + bd * 0.25, p.x + 4 * s, p.y - 6 * s + bd * 0.25);
      ctx.lineTo(p.x + 4 * s, p.y + bd * 0.25);
      ctx.closePath(); ctx.fill();

    } else if (pb.type === 'stock') {
      // ── 股票大厅：金融大楼 + 跑马灯 ──
      const bw = 26 * s, bh = 26 * s, bd = bw * 0.45;
      const ticker = (performance.now() * 0.001) % 6.28; // 跑马灯动画
      // 主楼
      ctx.fillStyle = dim('#e8e0d0', br);
      ctx.beginPath(); ctx.moveTo(p.x - bw, p.y - bh); ctx.lineTo(p.x, p.y - bh + bd * 0.5); ctx.lineTo(p.x, p.y + bd * 0.5); ctx.lineTo(p.x - bw, p.y); ctx.closePath(); ctx.fill();
      ctx.fillStyle = dim('#d8d0c0', br);
      ctx.beginPath(); ctx.moveTo(p.x, p.y - bh + bd * 0.5); ctx.lineTo(p.x + bw, p.y - bh); ctx.lineTo(p.x + bw, p.y); ctx.lineTo(p.x, p.y + bd * 0.5); ctx.closePath(); ctx.fill();
      // 平顶
      ctx.fillStyle = dim('#2a6a4a', br);
      ctx.beginPath(); ctx.moveTo(p.x - bw - 1 * s, p.y - bh); ctx.lineTo(p.x, p.y - bh + bd * 0.5); ctx.lineTo(p.x + bw + 1 * s, p.y - bh); ctx.lineTo(p.x, p.y - bh - bd * 0.5); ctx.closePath(); ctx.fill();
      // LED 跑马灯（绿色数字流动）
      ctx.save();
      ctx.beginPath(); ctx.rect(p.x - 18 * s, p.y - bh - 8 * s, 36 * s, 8 * s); ctx.clip();
      ctx.fillStyle = dim('#0a2a18', br);
      ctx.fillRect(p.x - 18 * s, p.y - bh - 8 * s, 36 * s, 8 * s);
      const tickerColor = 'rgba(80,220,120,' + (0.6 + 0.3 * Math.sin(ticker)) + ')';
      ctx.fillStyle = tickerColor;
      ctx.font = Math.round(5 * s) + 'px monospace';
      ctx.textBaseline = 'middle';
      const tickText = 'AI +3.2%  CHIP -1.1%  NEV +2.8%  MED +0.5%  ';
      const offX = -(performance.now() * 0.03) % (tickText.length * 3.2 * s);
      ctx.fillText(tickText + tickText, p.x - 18 * s + offX, p.y - bh - 4 * s);
      ctx.restore();
      // 大窗
      ctx.fillStyle = isNight ? 'rgba(80,220,120,0.3)' : 'rgba(180,210,230,0.5)';
      if (isNight) { ctx.shadowColor = 'rgba(80,220,120,0.2)'; ctx.shadowBlur = 6 * s; }
      for (let col = 0; col < 3; col++) {
        ctx.fillRect(p.x - bw * 0.7 + col * bw * 0.35, p.y - bh * 0.6, 5 * s, 7 * s);
      }
      ctx.shadowBlur = 0;
      // 柱廊
      ctx.fillStyle = dim('#c8c0b0', br);
      for (let col = 0; col < 4; col++) {
        const cx = p.x - bw * 0.7 + col * bw * 0.4;
        ctx.fillRect(cx, p.y - bh * 0.15, 2 * s, bh * 0.15 + bd * 0.25);
      }
    }

    // ── 地标名称标签 ──
    ctx.fillStyle = isNight ? 'rgba(255,250,230,0.8)' : 'rgba(60,50,40,0.85)';
    ctx.font = 'bold ' + Math.round(9 * s) + 'px "Noto Sans SC",system-ui,sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    const labelY = pb.type === 'plaza' ? p.y + 20 * s : (pb.type === 'park' ? p.y + 22 * s : p.y + 16 * s);
    ctx.fillText(pb.name, p.x, labelY);
    // 小图标
    ctx.font = Math.round(12 * s) + 'px serif';
    ctx.fillText(pb.icon, p.x, labelY - 14 * s);
  }

  // ── 招牌/桥梁 ──
  function drawSign(dl) {
    const signPt = mainRoad[Math.floor(mainRoad.length * 0.05)];
    const p = worldToScreen(signPt.x, signPt.y - 3);
    const s = scale; const br = dl.brightness;
    ctx.fillStyle = 'rgb(' + Math.floor(120 * br) + ',' + Math.floor(90 * br) + ',' + Math.floor(60 * br) + ')';
    ctx.fillRect(p.x - 2 * s, p.y - 20 * s, 4 * s, 24 * s);
    ctx.fillStyle = 'rgb(' + Math.floor(230 * br) + ',' + Math.floor(215 * br) + ',' + Math.floor(195 * br) + ')';
    ctx.strokeStyle = 'rgb(' + Math.floor(170 * br) + ',' + Math.floor(155 * br) + ',' + Math.floor(130 * br) + ')';
    ctx.lineWidth = 1 * s;
    const pw = 50 * s, ph = 18 * s;
    ctx.fillRect(p.x - pw / 2, p.y - 38 * s, pw, ph);
    ctx.strokeRect(p.x - pw / 2, p.y - 38 * s, pw, ph);
    ctx.fillStyle = 'rgb(' + Math.floor(70 * br) + ',' + Math.floor(55 * br) + ',' + Math.floor(40 * br) + ')';
    ctx.font = 'bold ' + Math.round(8 * s) + 'px "Noto Serif SC",Georgia,serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('OpenClaw \u5c0f\u9547', p.x, p.y - 29 * s);
  }

  function drawBridges(dl) {
    for (let i = 0; i < mainRoad.length; i += 3) {
      for (let j = 0; j < riverPoints.length; j += 2) {
        if (Math.sqrt((mainRoad[i].x - riverPoints[j].x) ** 2 + (mainRoad[i].y - riverPoints[j].y) ** 2) < 1.5) {
          const p = worldToScreen(mainRoad[i].x, mainRoad[i].y);
          const s = scale; const br = dl.brightness;
          ctx.fillStyle = 'rgb(' + Math.floor(185 * br) + ',' + Math.floor(160 * br) + ',' + Math.floor(130 * br) + ')';
          ctx.strokeStyle = 'rgb(' + Math.floor(140 * br) + ',' + Math.floor(110 * br) + ',' + Math.floor(85 * br) + ')';
          ctx.lineWidth = 1 * s;
          const bw = 18 * s, bh = 10 * s;
          ctx.fillRect(p.x - bw / 2, p.y - bh / 2, bw, bh);
          ctx.strokeRect(p.x - bw / 2, p.y - bh / 2, bw, bh);
          ctx.lineWidth = 1.5 * s;
          ctx.beginPath(); ctx.moveTo(p.x - bw / 2, p.y - bh / 2 - 2 * s); ctx.lineTo(p.x + bw / 2, p.y - bh / 2 - 2 * s); ctx.stroke();
          return;
        }
      }
    }
  }

  // ══════ 主绘制 & 动画循环 ══════

  function draw() {
    ctx.save();
    ctx.scale(dpr, dpr);
    const W = canvas.width / dpr, H = canvas.height / dpr;
    ctx.clearRect(0, 0, W, H);
    const dl = getDayLight();

    // 天空
    const skyGrad = ctx.createLinearGradient(0, 0, 0, H);
    skyGrad.addColorStop(0, 'rgb(' + Math.floor(dl.sky.r) + ',' + Math.floor(dl.sky.g) + ',' + Math.floor(dl.sky.b) + ')');
    const groundSky = { r: dl.sky.r * 0.9 + 30, g: dl.sky.g * 0.9 + 20, b: dl.sky.b * 0.85 + 10 };
    skyGrad.addColorStop(1, 'rgb(' + Math.floor(groundSky.r) + ',' + Math.floor(groundSky.g) + ',' + Math.floor(groundSky.b) + ')');
    ctx.fillStyle = skyGrad;
    ctx.fillRect(0, 0, W, H);

    // 星星（夜晚）
    if (dl.brightness < 0.4) {
      const starAlpha = (0.4 - dl.brightness) / 0.3;
      const starRand = seededRand(99);
      ctx.fillStyle = 'rgba(255,255,240,' + (starAlpha * 0.6) + ')';
      for (let i = 0; i < 60; i++) {
        const sx = starRand() * W, sy = starRand() * H * 0.5;
        const ss = 0.5 + starRand() * 1.5;
        ctx.beginPath(); ctx.arc(sx, sy, ss, 0, Math.PI * 2); ctx.fill();
      }
      // 月亮
      ctx.fillStyle = 'rgba(255,250,230,' + starAlpha * 0.8 + ')';
      ctx.shadowColor = 'rgba(255,250,200,0.3)'; ctx.shadowBlur = 20;
      ctx.beginPath(); ctx.arc(W * 0.82, H * 0.12, 18, 0, Math.PI * 2); ctx.fill();
      ctx.shadowBlur = 0;
    }

    drawGround(dl);
    drawMountains(dl);
    drawRiver(dl);
    drawBridges(dl);
    drawRoad(mainRoad, 7, dl);
    drawRoad(branchRoad1, 5, dl);
    drawRoad(branchRoad2, 5, dl);
    drawRoad(branchRoad3, 5, dl);
    drawRoad(branchRoad4, 5, dl);
    drawRoad(ringRoad, 4, dl);
    for (const lane of lanes) drawRoad(lane, 3, dl);
    drawSign(dl);

    // 画家算法排序
    const drawList = [];
    trees.forEach(t => { const p = worldToScreen(t.x, t.y); drawList.push({ type: 'tree', y: p.y, data: t }); });
    greenClusters.forEach(g => { const p = worldToScreen(g.x, g.y); drawList.push({ type: 'green', y: p.y, data: g }); });
    buildings.forEach((b, i) => { if (i < agents.length) { const p = worldToScreen(b.gx, b.gy); drawList.push({ type: 'building', y: p.y, data: i }); } });
    userBuildings.forEach((ub, i) => { const p = worldToScreen(ub.gx, ub.gy); drawList.push({ type: 'userBuilding', y: p.y, data: i }); });
    publicBuildings.forEach(pb => { const p = worldToScreen(pb.gx, pb.gy); drawList.push({ type: 'public', y: p.y, data: pb }); });
    walkers.forEach((w, i) => { const p = worldToScreen(w.x, w.y); drawList.push({ type: 'walker', y: p.y, data: w }); });
    vehicles.forEach(v => { const p = worldToScreen(v.x, v.y); drawList.push({ type: 'vehicle', y: p.y, data: v }); });
    drawList.sort((a, b) => a.y - b.y);

    for (const item of drawList) {
      if (item.type === 'tree') drawTree(item.data, dl);
      else if (item.type === 'green') drawGreenCluster(item.data, dl);
      else if (item.type === 'building') drawBuilding(item.data, dl);
      else if (item.type === 'userBuilding') drawUserBuilding(item.data, dl);
      else if (item.type === 'public') drawPublicBuilding(item.data, dl);
      else if (item.type === 'walker') drawWalker(item.data, dl);
      else if (item.type === 'vehicle') drawVehicle(item.data, dl);
    }

    // 气泡在最上层
    for (const cb of chatBubbles) drawBubble(cb);

    // 昼夜滤镜叠加
    if (dl.brightness < 0.5) {
      ctx.fillStyle = 'rgba(15,15,40,' + ((0.5 - dl.brightness) * 0.4) + ')';
      ctx.fillRect(0, 0, W, H);
    }

    ctx.restore();
  }

  // ── 动画主循环 ──
  // 帧率限制：30fps（降低 CPU 占用，视觉效果不变）
  const TARGET_FPS = 30;
  const FRAME_INTERVAL = 1000 / TARGET_FPS;
  let lastRender = 0;

  function animate(now) {
    requestAnimationFrame(animate);

    // 跳帧：未到下一帧时间则跳过
    if (now - lastRender < FRAME_INTERVAL) return;

    const dt = Math.min((now - lastFrame) / 1000, 0.1) * simSpeed;
    lastFrame = now;
    lastRender = now;

    // 时间流逝：1秒实时 = 2分钟游戏内
    timeOfDay += dt * (2 / 1440); // 2 分钟/秒 → 12 分钟走一天
    if (timeOfDay >= 1) timeOfDay -= 1;

    updateWalkers(dt);
    updateVehicles(dt);
    checkMeetings();
    updateBubbles(dt);

    // 更新时钟 UI
    const hour = Math.floor(timeOfDay * 24);
    const min = Math.floor((timeOfDay * 24 - hour) * 60);
    const clockEl = document.getElementById('clock-time');
    const labelEl = document.getElementById('clock-label');
    if (clockEl) clockEl.textContent = String(hour).padStart(2, '0') + ':' + String(min).padStart(2, '0');
    if (labelEl) labelEl.textContent = getTimeLabel();

    draw();
  }

  // 初始化行人目标
  walkers.forEach(w => pickNewTarget(w));

  requestAnimationFrame(animate);

  // ── 交互 ──
  canvas.addEventListener('mousedown', e => {
    dragging = true; dragStartX = e.clientX - panX * scale; dragStartY = e.clientY - panY * scale;
    canvas.style.cursor = 'grabbing';
  });
  window.addEventListener('mousemove', e => {
    if (dragging) { panX = (e.clientX - dragStartX) / scale; panY = (e.clientY - dragStartY) / scale; }
    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left, my = e.clientY - rect.top;
    let found = -1;
    let foundUser = -1;
    for (let i = 0; i < Math.min(buildings.length, agents.length); i++) {
      const p = worldToScreen(buildings[i].gx, buildings[i].gy);
      if (mx > p.x - 28 * scale && mx < p.x + 28 * scale && my > p.y - 35 * scale && my < p.y + 14 * scale) { found = i; break; }
    }
    // 检测公共建筑 hover（游戏厅/龙虾杀/股票 — 有 link 的）
    let foundPublic = null;
    if (found < 0) {
      for (const pb of publicBuildings) {
        if (pb.link) {
          const pp = worldToScreen(pb.gx, pb.gy);
          if (mx > pp.x - 35 * scale && mx < pp.x + 35 * scale && my > pp.y - 40 * scale && my < pp.y + 20 * scale) { foundPublic = pb; break; }
        }
      }
    }
    if (foundPublic && !dragging) { canvas.style.cursor = 'pointer'; }
    else if (!dragging && found < 0) { canvas.style.cursor = 'grab'; }
    // 检测人类用户房屋 hover
    if (found < 0 && !foundPublic) {
      for (let i = 0; i < userBuildings.length; i++) {
        const p = worldToScreen(userBuildings[i].gx, userBuildings[i].gy);
        if (mx > p.x - 26 * scale && mx < p.x + 26 * scale && my > p.y - 32 * scale && my < p.y + 14 * scale) { foundUser = i; break; }
      }
    }
    hoveredUserBuilding = foundUser;
    if (found !== hoveredBuilding) {
      hoveredBuilding = found;
      const tooltip = document.getElementById('map-tooltip');
      if (found >= 0 && tooltip) {
        tooltip.querySelector('.tt-name').textContent = agents[found].name;
        tooltip.querySelector('.tt-role').textContent = agents[found].role + ' \u00b7 ' + agents[found].archetype;
        tooltip.querySelector('.tt-mbti').textContent = agents[found].mbti;
        tooltip.style.left = (e.clientX - rect.left + 16) + 'px';
        tooltip.style.top = (e.clientY - rect.top - 10) + 'px';
        tooltip.style.opacity = '1';
      } else if (foundUser >= 0 && tooltip) {
        const u = userBuildings[foundUser].user;
        tooltip.querySelector('.tt-name').textContent = (u.name || '???') + ' \u2302';
        tooltip.querySelector('.tt-role').textContent = (u.role || '\u5c0f\u9547\u5c45\u6c11') + ' \u00b7 \u4eba\u7c7b\u7528\u6237';
        tooltip.querySelector('.tt-mbti').textContent = u.mbti || 'ENFP';
        tooltip.style.left = (e.clientX - rect.left + 16) + 'px';
        tooltip.style.top = (e.clientY - rect.top - 10) + 'px';
        tooltip.style.opacity = '1';
      } else if (tooltip) { tooltip.style.opacity = '0'; }
    } else if (found >= 0) {
      const tooltip = document.getElementById('map-tooltip');
      if (tooltip) { tooltip.style.left = (e.clientX - rect.left + 16) + 'px'; tooltip.style.top = (e.clientY - rect.top - 10) + 'px'; }
    } else if (foundUser >= 0) {
      const tooltip = document.getElementById('map-tooltip');
      if (tooltip) { tooltip.style.left = (e.clientX - rect.left + 16) + 'px'; tooltip.style.top = (e.clientY - rect.top - 10) + 'px'; }
    }
  });
  window.addEventListener('mouseup', () => { dragging = false; canvas.style.cursor = 'grab'; });
  canvas.addEventListener('click', (e) => {
    // 先检测公共建筑点击（游戏厅/龙虾杀/股票大厅）
    const rect2 = canvas.getBoundingClientRect();
    const cx = e.clientX - rect2.left, cy = e.clientY - rect2.top;
    for (const pb of publicBuildings) {
      if (pb.link) {
        const pp = worldToScreen(pb.gx, pb.gy);
        if (cx > pp.x - 35 * scale && cx < pp.x + 35 * scale && cy > pp.y - 40 * scale && cy < pp.y + 20 * scale) {
          window.open(pb.link, '_blank');
          return;
        }
      }
    }
    if (hoveredBuilding >= 0) {
      // 打开龙虾屋室内视图
      if (window.__openRoom) { window.__openRoom(hoveredBuilding); }
    } else if (hoveredUserBuilding >= 0) {
      // 打开人类用户的房间
      const ub = userBuildings[hoveredUserBuilding];
      if (ub && ub.user && window.__openUserRoom) {
        window.__openUserRoom(ub.user);
      }
    }
  });
  canvas.addEventListener('wheel', e => {
    e.preventDefault();
    scale = Math.max(0.4, Math.min(3, scale * (e.deltaY > 0 ? 0.9 : 1.1)));
  }, { passive: false });

  document.getElementById('zoom-in').addEventListener('click', () => { scale = Math.min(3, scale * 1.2); });
  document.getElementById('zoom-out').addEventListener('click', () => { scale = Math.max(0.4, scale * 0.8); });
  document.getElementById('zoom-reset').addEventListener('click', () => { scale = 1; panX = 0; panY = 0; });

  // 速度控制
  document.querySelectorAll('.speed-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.speed-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      simSpeed = parseFloat(btn.dataset.speed);
    });
  });

})();

// ══════════════════════════════════════════════════
// 关系网络 Canvas
// ══════════════════════════════════════════════════
(function() {
  const canvas = document.getElementById('network-canvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const rect = canvas.parentElement.getBoundingClientRect();
  canvas.width = rect.width * (window.devicePixelRatio || 1);
  canvas.height = rect.height * (window.devicePixelRatio || 1);
  ctx.scale(window.devicePixelRatio || 1, window.devicePixelRatio || 1);
  const W = rect.width, H = rect.height;
  const agents = ${agentNamesJson};
  const rels = ${relDataJson};
  const cx = W / 2, cy = H / 2, R = Math.min(W, H) * 0.38;
  const positions = agents.map((a, i) => {
    const angle = (i / agents.length) * Math.PI * 2 - Math.PI / 2;
    return { x: cx + R * Math.cos(angle), y: cy + R * Math.sin(angle), ...a };
  });
  const maxCount = rels.reduce((m, r) => Math.max(m, r.count), 1);
  for (const rel of rels) {
    const from = positions.find(p => p.name === rel.from);
    const to = positions.find(p => p.name === rel.to);
    if (!from || !to) continue;
    const alpha = 0.1 + (rel.count / maxCount) * 0.5;
    const width = 0.5 + (rel.count / maxCount) * 3;
    ctx.beginPath();
    const mx = (from.x + to.x) / 2 + (from.y - to.y) * 0.15;
    const my = (from.y + to.y) / 2 + (to.x - from.x) * 0.15;
    ctx.moveTo(from.x, from.y);
    ctx.quadraticCurveTo(mx, my, to.x, to.y);
    ctx.strokeStyle = 'rgba(200,168,130,' + alpha + ')';
    ctx.lineWidth = width;
    ctx.stroke();
  }
  for (const p of positions) {
    const grd = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, 24);
    grd.addColorStop(0, p.color + '40');
    grd.addColorStop(1, 'transparent');
    ctx.fillStyle = grd;
    ctx.beginPath(); ctx.arc(p.x, p.y, 24, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(p.x, p.y, 14, 0, Math.PI * 2);
    ctx.fillStyle = p.color; ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.2)'; ctx.lineWidth = 1; ctx.stroke();
    ctx.fillStyle = '#fff';
    ctx.font = '11px "Noto Sans SC",system-ui,sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(p.name.charAt(0), p.x, p.y);
    ctx.fillStyle = 'rgba(255,255,255,0.6)';
    ctx.font = '10px "Noto Sans SC",system-ui,sans-serif';
    ctx.fillText(p.name, p.x, p.y + 24);
    ctx.fillStyle = 'rgba(200,168,130,0.6)';
    ctx.font = '8px "Noto Sans SC",system-ui,sans-serif';
    ctx.fillText(p.mbti, p.x, p.y + 36);
  }
})();

// ══════════════════════════════════════════════════
// 媒体 + 经济面板渲染
// ══════════════════════════════════════════════════
(function() {
  // Token 消耗面板
  const ts = window.__tokenStats;
  if (ts && ts.totalCalls) {
    document.getElementById('tk-calls').textContent = ts.totalCalls;
    document.getElementById('tk-tokens').textContent = (ts.estimatedTokens || 0).toLocaleString();
    document.getElementById('tk-cost').textContent = '$' + (ts.estimatedCost || 0).toFixed(4);
  }

  // ── 赏金墙 ──
  const SERVER = window.__serverUrl || (window.__serverUrl || window.location.origin);
  async function loadBountyWall() {
    try {
      var bounties = [];
      try {
        const res = await fetch(SERVER + '/api/bounties?limit=10');
        if (res.ok) bounties = await res.json();
      } catch(e) {}
      // 回退到内嵌数据
      if (bounties.length === 0 && window.__bountyData && window.__bountyData.length > 0) {
        bounties = window.__bountyData;
      }
      const list = document.getElementById('bw-list');
      const count = document.getElementById('bw-count');
      if (!list || !count) return;
      count.textContent = bounties.length;

      if (bounties.length === 0) {
        list.innerHTML = '<div class="bounty-wall-empty">暂无赏金</div>';
        return;
      }

      // 最新的排前面
      const sorted = bounties.sort(function(a, b) {
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      });

      function esc(s){return String(s||'').replace(/[<>&"]/g,function(c){return{'<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;'}[c]||c});}
      var statusMap = {open:'待接',assigned:'已分配','in-progress':'执行中',completed:'已完成',failed:'失败'};
      var html = '';
      for (var i = 0; i < sorted.length; i++) {
        var b = sorted[i];
        var st = statusMap[b.status] || b.status;
        var sc = 'bounty-status-' + (b.status || 'open');
        var desc = (b.result && b.result.output && b.result.outputType === 'text') ? b.result.output.substring(0, 80) : (b.description || '').substring(0, 80);
        var img = (b.result && b.result.outputType === 'image-path' && b.result.savedPath) ? '<img class="bounty-card-img" src="' + esc(b.result.savedPath) + '" onerror="this.remove()">' : '';
        var combo = (b.result && b.result.combo) ? '<div class="bounty-card-combo">Combo: ' + esc(b.result.combo.comboName) + '</div>' : '';
        var agent = b.assignedAgentName ? '<span class="bounty-card-agent">' + esc(b.assignedAgentName) + '</span>' : '';
        var tm = ''; try { tm = new Date(b.createdAt).toLocaleString('zh-CN',{month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit'}); } catch(e){}
        html += '<div class="bounty-card">' +
          '<div class="bounty-card-top"><span class="bounty-card-title">' + esc(b.title) + '</span><span class="bounty-card-reward">' + (b.reward||0) + '\u00A4</span></div>' +
          img +
          '<div class="bounty-card-desc">' + esc(desc) + '</div>' +
          combo +
          '<div class="bounty-card-meta"><span class="bounty-status ' + sc + '">' + st + '</span>' + agent + '</div>' +
          '<div class="bounty-card-meta" style="margin-top:2px"><span>' + tm + '</span><span>' + esc(b.posterName) + '</span></div>' +
          '</div>';
      }
      list.innerHTML = html;

      // 绑定卡片点击 → 打开详情弹窗
      var allCards = list.querySelectorAll('.bounty-card');
      allCards.forEach(function(card, idx) {
        card.addEventListener('click', function() { openBountyDetail(sorted[idx]); });
      });

      // ── 精选成果（评分>=4 且有图片的已完成赏金） ──
      var completed = bounties.filter(function(b) {
        return b.status === 'completed' && b.rating && b.rating.score >= 4 && b.result;
      }).sort(function(a, b) { return b.rating.score - a.rating.score; });

      if (completed.length > 0) {
        var showcaseHtml = '<div class="bounty-showcase-header">COMPLETED</div>';
        for (var j = 0; j < Math.min(completed.length, 3); j++) {
          var cb = completed[j];
          var hasImg = cb.result.outputType === 'image-path' && cb.result.savedPath;
          var imgSrc = hasImg ? '/' + cb.result.savedPath.replace(/\\\\/g, '/') : '';
          var imgTag = hasImg ? '<img class="bounty-showcase-img" src="' + esc(imgSrc) + '" onerror="this.remove()">' : '';
          var stars = '';
          for (var s = 0; s < cb.rating.score; s++) stars += '\u2605';
          for (var s2 = cb.rating.score; s2 < 5; s2++) stars += '\u2606';
          showcaseHtml += '<div class="bounty-showcase-item">' +
            imgTag +
            '<div class="bounty-showcase-title">' + esc(cb.title) + '</div>' +
            '<div class="bounty-showcase-info">' +
              '<span class="bounty-showcase-stars">' + stars + '</span> ' +
              '<span class="bounty-showcase-agent">' + esc(cb.assignedAgentName) + '</span> ' +
              '<span class="bounty-showcase-reward">' + cb.reward + '\u00A4</span>' +
            '</div>' +
            (cb.rating.comment ? '<div class="bounty-showcase-info" style="margin-top:2px;font-style:italic">\u300C' + esc(cb.rating.comment) + '\u300D</div>' : '') +
          '</div>';
        }
        list.innerHTML += showcaseHtml;
        // 精选卡片也可点击
        list.querySelectorAll('.bounty-showcase-item').forEach(function(item, idx) {
          item.style.cursor = 'pointer';
          item.addEventListener('click', function() { openBountyDetail(completed[idx]); });
        });
      }
    } catch(e) {
      // 服务器未启动时静默失败
    }
  }

  // ── 赏金详情弹窗 ──
  var bdModal = document.getElementById('bounty-detail-modal');
  var bdContainer = document.getElementById('bd-container');

  function closeBountyDetail() {
    if (bdModal) { bdModal.classList.remove('open'); setTimeout(function(){ bdModal.style.display='none'; }, 300); }
  }
  if (bdModal) {
    bdModal.addEventListener('click', function(e) { if (e.target === bdModal) closeBountyDetail(); });
    document.addEventListener('keydown', function(e) { if (e.key === 'Escape') closeBountyDetail(); });
  }

  function openBountyDetail(b) {
    if (!bdModal || !bdContainer || !b) return;
    function esc2(s) { return String(s||'').replace(/[<>&"]/g, function(c){ return {'<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;'}[c]||c; }); }
    var statusMap2 = {open:'待接',assigned:'已分配','in-progress':'执行中',completed:'已完成',failed:'失败'};
    var st = statusMap2[b.status] || b.status;
    var stClass = (b.status === 'failed') ? ' failed' : '';

    // 时间线
    var tlHtml = '<div class="bd-timeline">';
    tlHtml += '<div class="bd-tl-item"><div class="bd-tl-time">' + formatTime(b.createdAt) + '</div><div class="bd-tl-text">' + esc2(b.posterName) + ' 发布赏金</div></div>';
    if (b.assignedAt) {
      tlHtml += '<div class="bd-tl-item"><div class="bd-tl-time">' + formatTime(b.assignedAt) + '</div><div class="bd-tl-text">' + esc2(b.assignedAgentName) + ' 接受任务</div></div>';
    }
    if (b.completedAt) {
      tlHtml += '<div class="bd-tl-item"><div class="bd-tl-time">' + formatTime(b.completedAt) + '</div><div class="bd-tl-text">任务' + (b.status==='completed'?'完成':'失败') + '</div></div>';
    }
    if (b.rating) {
      tlHtml += '<div class="bd-tl-item"><div class="bd-tl-time">' + formatTime(b.rating.ratedAt) + '</div><div class="bd-tl-text">委托人评价 ' + makeStars(b.rating.score) + '</div></div>';
    }
    tlHtml += '</div>';

    // 使用的卡牌
    var cardsHtml = '<div class="bd-cards">';
    (b.requiredCards || []).forEach(function(c) { cardsHtml += '<span class="bd-card-tag">' + esc2(c) + '</span>'; });
    cardsHtml += '</div>';

    // 结果展示
    var resultHtml = '';
    if (b.result) {
      if (b.result.outputType === 'image-path' && b.result.savedPath) {
        var imgPath = '/' + b.result.savedPath.replace(/\\\\/g, '/');
        resultHtml = '<img class="bd-img" src="' + esc2(imgPath) + '" onerror="this.remove()">';
      }
      if (b.result.output && b.result.outputType === 'text') {
        resultHtml += '<div class="bd-output">' + esc2(b.result.output) + '</div>';
      }
      if (b.result.combo) {
        resultHtml += '<div style="margin-top:8px;font-size:0.72rem;color:var(--warm)">Combo: ' + esc2(b.result.combo.comboName) +
          ' (x' + b.result.combo.bonus.qualityMultiplier + ' \u8d28\u91cf, x' + b.result.combo.bonus.rewardMultiplier + ' \u5956\u52b1)</div>';
      }
    }

    // 评价
    var commentHtml = '';
    if (b.rating && b.rating.comment) {
      commentHtml = '<div class="bd-section"><div class="bd-section-title">\u59d4\u6258\u4eba\u8bc4\u4ef7</div><div class="bd-comment">\u300C' + esc2(b.rating.comment) + '\u300D</div></div>';
    }

    // 组装
    bdContainer.innerHTML =
      '<div class="bd-header">' +
        '<div class="bd-label">BOUNTY DETAIL</div>' +
        '<div class="bd-title">' + esc2(b.title) + '</div>' +
        '<div class="bd-status-row">' +
          '<span class="bd-badge bd-badge-reward">' + (b.reward||0) + '\u00A4</span>' +
          '<span class="bd-badge bd-badge-status' + stClass + '">' + st + '</span>' +
          (b.rating ? '<span class="bd-badge-rating">' + makeStars(b.rating.score) + '</span>' : '') +
        '</div>' +
      '</div>' +
      '<div class="bd-body">' +
        '<div class="bd-section"><div class="bd-section-title">\u59d4\u6258\u4fe1\u606f</div>' +
          '<div class="bd-row"><span class="bd-row-label">\u59d4\u6258\u4eba</span><span class="bd-row-val">' + esc2(b.posterName) + '</span></div>' +
          '<div class="bd-row"><span class="bd-row-label">\u8d4f\u91d1</span><span class="bd-row-val">' + (b.reward||0) + '\u00A4 + ' + (b.serviceFee||0) + '\u00A4 \u624b\u7eed\u8d39</span></div>' +
          '<div class="bd-row"><span class="bd-row-label">\u622a\u6b62</span><span class="bd-row-val">' + formatTime(b.expiresAt) + '</span></div>' +
          (b.assignedAgentName ? '<div class="bd-row"><span class="bd-row-label">\u63a5\u5355 Agent</span><span class="bd-row-val">' + esc2(b.assignedAgentName) + '</span></div>' : '') +
        '</div>' +
        '<div class="bd-section"><div class="bd-section-title">\u4efb\u52a1\u63cf\u8ff0</div><div class="bd-desc">' + esc2(b.description) + '</div></div>' +
        '<div class="bd-section"><div class="bd-section-title">\u6240\u9700\u5361\u724c</div>' + cardsHtml + '</div>' +
        '<div class="bd-section"><div class="bd-section-title">\u59d4\u6258\u8fc7\u7a0b</div>' + tlHtml + '</div>' +
        (resultHtml ? '<div class="bd-section"><div class="bd-section-title">\u4ea4\u4ed8\u6210\u679c</div>' + resultHtml + '</div>' : '') +
        commentHtml +
      '</div>' +
      '<div class="bd-footer"><button class="bd-close" onclick="closeBountyDetail()">\u5173\u95ed</button></div>';

    // 暴露关闭函数到全局
    window.closeBountyDetail = closeBountyDetail;

    bdModal.style.display = 'flex';
    setTimeout(function() { bdModal.classList.add('open'); }, 10);
  }

  function formatTime(t) {
    if (!t) return '-';
    try { return new Date(t).toLocaleString('zh-CN', {month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit',second:'2-digit'}); }
    catch(e) { return t; }
  }
  function makeStars(n) {
    var s = '';
    for (var i=0;i<n;i++) s+='\u2605';
    for (var j=n;j<5;j++) s+='\u2606';
    return s;
  }

  loadBountyWall();
  var bwRefreshBtn = document.getElementById('bw-refresh');
  if (bwRefreshBtn) bwRefreshBtn.addEventListener('click', loadBountyWall);
  // 每 30 秒自动刷新
  setInterval(loadBountyWall, 30000);

  const eco = window.__economyData;
  const media = window.__mediaData;
  if (!eco || !media) return;

  // ── 电视台：4频道横向等宽 · 点击开声音 · 低码率 ──
  const tvChannelList = [
    { name: '\u51e4\u51f0\u4e2d\u6587', url: 'https://playtv-live.ifeng.com/live/06OLEGEGM4G.m3u8' },
    { name: 'CGTN', url: 'https://english-livebkali.cgtn.com/live/encgtn.m3u8' },
    { name: 'CCTV+', url: 'https://cd-live-stream.news.cctvplus.com/live/smil:CHANNEL1.smil/playlist.m3u8' },
    { name: 'CCTV-10', url: 'https://cdn4.skygo.mn/live/disk1/CCTV-10/HLSv3-FTA/CCTV-10.m3u8' },
  ];

  // 初始化频道名标签
  document.querySelectorAll('.tv-4cell').forEach((cell, i) => {
    if (tvChannelList[i]) cell.querySelector('.tv-4name').textContent = tvChannelList[i].name;
  });

  const hlsScript = document.createElement('script');
  hlsScript.src = 'https://cdn.jsdelivr.net/npm/hls.js@latest/dist/hls.min.js';
  hlsScript.onload = function() {
    const hlsInstances = [];
    let tvStarted = false;

    function playOne(idx) {
      const video = document.getElementById('tv-video-' + idx);
      if (!video || !tvChannelList[idx]) return;
      if (!Hls.isSupported()) {
        if (video.canPlayType('application/vnd.apple.mpegurl')) { video.src = tvChannelList[idx].url; video.play().catch(()=>{}); }
        return;
      }
      const hls = new Hls({ enableWorker: false, maxBufferLength: 8, maxMaxBufferLength: 15, maxBufferSize: 300000, startLevel: 0, capLevelToPlayerSize: true });
      hls.loadSource(tvChannelList[idx].url);
      hls.attachMedia(video);
      hls.on(Hls.Events.MANIFEST_PARSED, () => { video.play().catch(()=>{}); });
      hls.on(Hls.Events.ERROR, (_, d) => { if (d.fatal) { hls.destroy(); } });
      hlsInstances[idx] = hls;
    }

    function startAllTV() {
      tvStarted = true;
      for (let i = 0; i < 4; i++) playOne(i);
      // 移除所有待机画面
      document.querySelectorAll('.tv-standby-4').forEach(s => s.remove());
      document.querySelectorAll('.tv-4cell video').forEach(v => v.style.display = 'block');
    }

    // 每个格子加待机画面
    document.querySelectorAll('.tv-4cell').forEach((cell, i) => {
      const video = cell.querySelector('video');
      if (video) video.style.display = 'none';
      const sb = document.createElement('div');
      sb.className = 'tv-standby-4';
      sb.innerHTML = '<div style="font-family:monospace;font-size:0.8rem;color:rgba(255,255,255,0.25);margin-bottom:4px">' + (tvChannelList[i]?.name || 'CH' + i) + '</div><div style="font-family:monospace;font-size:0.5rem;color:rgba(255,255,255,0.2)">CLICK</div>';
      sb.addEventListener('click', () => { if (!tvStarted) startAllTV(); });
      cell.appendChild(sb);
    });

    // 点击某个频道 → 取消静音该频道（其他静音）
    document.querySelectorAll('.tv-4cell').forEach((cell, i) => {
      cell.addEventListener('click', () => {
        if (!tvStarted) return;
        document.querySelectorAll('.tv-4cell video').forEach((v, vi) => {
          v.muted = (vi !== i);
        });
        document.querySelectorAll('.tv-4cell').forEach((c, ci) => {
          c.style.outline = ci === i ? '2px solid #c8a882' : 'none';
        });
      });
    });
  };
  document.head.appendChild(hlsScript);

  // 6格信息板（直播下方）
  const tvRightGrid = document.getElementById('tv-right-grid');
  if (tvRightGrid && media.tv?.length) {
    const gridChannels = media.tv.filter(ch => ch.type !== 'live');
    const cols = Math.min(3, gridChannels.length);
    const rows = Math.ceil(gridChannels.length / cols);
    tvRightGrid.style.gridTemplateColumns = 'repeat(' + cols + ', 1fr)';
    tvRightGrid.style.gridTemplateRows = 'repeat(' + rows + ', 1fr)';

    tvRightGrid.innerHTML = gridChannels.map(ch =>
      '<div class="tv-cell">' +
        '<div class="scanline"></div>' +
        '<div class="tv-cell-label">' + ch.icon + ' ' + ch.name + '</div>' +
        '<div class="tv-cell-content">' +
          ch.content.map(c => '<div class="tv-item">' + c + '</div>').join('') +
        '</div>' +
      '</div>'
    ).join('');

    // 每格自动滚动
    tvRightGrid.querySelectorAll('.tv-cell-content').forEach(cell => {
      setInterval(() => {
        const items = cell.querySelectorAll('.tv-item');
        if (items.length > 2) {
          const first = items[0];
          first.style.transition = 'all 0.5s'; first.style.opacity = '0'; first.style.marginTop = '-20px';
          setTimeout(() => { cell.appendChild(first); first.style.opacity = '1'; first.style.marginTop = '0'; }, 500);
        }
      }, 4000 + Math.random() * 3000);
    });
  }

  // ── 广播台四栏同时显示 ──
  const radioLayout = document.getElementById('radio-layout');
  if (radioLayout && media.radio?.length) {
    // 免费在线电台流地址（公共 API）
    const radioStreams = {
      'radio-music': 'https://streams.ilovemusic.de/iloveradio1.mp3',
    };

    radioLayout.innerHTML = media.radio.map(ch => {
      const streamUrl = radioStreams[ch.id];
      const eqBars = Array.from({length: 8}, (_, i) =>
        '<div class="radio-eq-bar" style="--h:' + (6 + Math.random() * 14) + 'px;animation-delay:' + (i * 0.1) + 's"></div>'
      ).join('');

      return '<div class="radio-cell">' +
        '<div class="radio-cell-icon">' + ch.icon + '</div>' +
        '<div class="radio-cell-name">' + ch.name + '</div>' +
        '<div class="radio-now">' + ch.nowPlaying + '</div>' +
        '<div class="radio-playlist">' +
          ch.playlist.map(p => '<div class="radio-item">' + p + '</div>').join('') +
        '</div>' +
        (ch.type === 'music' ?
          '<div class="radio-player"><audio controls preload="none" src="' + (streamUrl || '') + '"></audio></div>' +
          '<div class="radio-eq">' + eqBars + '</div>'
          : '') +
      '</div>';
    }).join('');
  }

  // ── 企业面板 ──
  const ecoStrip = document.getElementById('economy-strip');
  const agentNameMap = ${JSON.stringify(Object.fromEntries(log.agents.map(a => [a.id, a.name])))};
  if (ecoStrip && eco.businesses?.length) {
    ecoStrip.innerHTML = eco.businesses.map(b => {
      const staffNames = (b.employees || []).map(id => agentNameMap[id] || '?');
      return '<div class="biz-card">' +
        '<div class="biz-icon">' + b.icon + '</div>' +
        '<div class="biz-name">' + b.name + '</div>' +
        '<div class="biz-meta">日薪 ' + b.baseSalary + ' | 客流 ' + b.dailyCustomers + '</div>' +
        '<div class="biz-staff">' + (staffNames.length > 0 ? staffNames.join('、') : '招聘中') + '</div>' +
        '<div class="biz-rev">营业额 ' + b.dailyRevenue + ' Token</div>' +
        '<div class="biz-rep-bar"><div class="biz-rep-fill" style="width:' + b.reputation + '%"></div></div>' +
      '</div>';
    }).join('');
  }

  // ── 排行榜 ──
  function renderLb(elId, items, valueKey, unit) {
    const el = document.getElementById(elId);
    if (!el || !items?.length) return;
    el.innerHTML = el.querySelector('.lb-title').outerHTML +
      items.slice(0, 5).map((item, i) =>
        '<div class="lb-item"><span class="lb-rank">' + (i + 1) + '</span>' +
        '<span>' + item.name + '</span>' +
        '<span class="lb-val">' + item[valueKey] + (unit || '') + '</span></div>'
      ).join('');
  }
  renderLb('lb-wealth', eco.leaderboard?.wealth, 'tokens', '¤');
  renderLb('lb-popularity', eco.leaderboard?.popularity, 'score', '分');
  renderLb('lb-productivity', eco.leaderboard?.productivity, 'tasks', '次');
})();

// ── 滚动入场 ──
const observer = new IntersectionObserver(entries => {
  entries.forEach(entry => { if (entry.isIntersecting) entry.target.classList.add('active'); });
}, { threshold: 0.1 });
document.querySelectorAll('.reveal').forEach(el => observer.observe(el));
document.querySelectorAll('.flip-card').forEach((el, i) => {
  el.classList.add('reveal');
  el.style.transitionDelay = (i * 0.05) + 's';
  observer.observe(el);
});

// ══════════════════════════════════════════════════
// 龙虾屋室内视图 Canvas 引擎
// 基于 MBTI/OCEAN/技能 生成个性化房间内部
// ══════════════════════════════════════════════════
(function() {
  const modal = document.getElementById('room-modal');
  const canvas = document.getElementById('room-canvas');
  if (!modal || !canvas) return;
  const ctx = canvas.getContext('2d');
  const allAgents = ${mapAgentsJson};
  const allSkills = ${JSON.stringify(log.agents.map(a => a.skills.map(s => ({ name: s.name, level: s.level, domain: s.domain }))))};
  const allOcean = ${JSON.stringify(log.agents.map(a => a.personality.ocean))};
  const allDesc = ${JSON.stringify(log.agents.map(a => a.personality.description))};
  const allComm = ${JSON.stringify(log.agents.map(a => a.personality.communicationStyle))};
  const stockData = ${(log.metadata as any).marketDataJson || '{"market":{},"portfolios":{}}'};
  const economyData = ${(log.metadata as any).economyJson || '{"businesses":[],"events":[],"dailyNews":[],"leaderboard":{},"agentJobs":{}}'};
  const mediaData = ${(log.metadata as any).mediaJson || '{"tv":[],"radio":[]}'};
  window.__economyData = economyData;
  window.__mediaData = mediaData;
  window.__stockData = stockData;

  let currentAgent = -1;
  let animFrame = 0;
  let roomAnimId = null;
  let hoveredItem = -1;
  let roomItems = []; // 可交互物品

  // 技能 → 物品映射
  const skillObjects = {
    'soul-design': { icon: 'scroll', label: 'SOUL.md 卷轴', desc: '桌上展开的人格设计卷轴，墨迹未干' },
    'memory-arch': { icon: 'server', label: '记忆服务器', desc: '嗡嗡运转的微型服务器，指示灯闪烁' },
    'security': { icon: 'shield', label: '安全盾牌', desc: '墙上挂着的数字安全盾，微微发光' },
    'model-strategy': { icon: 'chess', label: '策略棋盘', desc: '摆着各种 LLM 模型棋子的棋盘' },
    'skill-authoring': { icon: 'quill', label: 'Skill 编辑器', desc: '发光的代码编辑器，正在编写 SKILL.md' },
    'multi-agent': { icon: 'network', label: '编排控制台', desc: '多屏幕的 Agent 编排监控台' },
    'channel-ops': { icon: 'antenna', label: '通信天线', desc: '连接 Telegram/Web 等渠道的信号塔模型' },
    'automation': { icon: 'gear', label: '自动化齿轮', desc: '精密咬合的齿轮装置，Cron 定时器' },
    'tool-integration': { icon: 'plug', label: '工具接口板', desc: '密密麻麻的 API 接口插座板' },
    'prompt-craft': { icon: 'wand', label: '提示词魔杖', desc: '闪着金光的提示词工程魔杖' },
  };

  // MBTI 气质组判断
  function getTemperament(mbti) {
    const base = mbti.replace(/-.*/, ''); // 去掉变体后缀
    if (base.includes('NT')) return 'NT';
    if (base.match(/N/) && base.match(/F/)) return 'NF';
    if (base.match(/S/) && base.match(/J/)) return 'SJ';
    if (base.match(/S/) && base.match(/P/)) return 'SP';
    // 变体兜底
    if (mbti.includes('INTJ') || mbti.includes('ENTP')) return 'NT';
    if (mbti.includes('ENFJ') || mbti.includes('ISTJ')) return 'SJ';
    return 'NT';
  }

  function hexToRgb(hex) {
    const r = parseInt(hex.slice(1,3),16), g = parseInt(hex.slice(3,5),16), b = parseInt(hex.slice(5,7),16);
    return { r, g, b };
  }

  function drawRoom(idx) {
    const agent = allAgents[idx];
    const skills = allSkills[idx];
    const ocean = allOcean[idx];
    const desc = allDesc[idx];
    const colors = agent.color;
    const temperament = getTemperament(agent.mbti);
    const dpr = window.devicePixelRatio || 1;
    const W = canvas.width / dpr, H = canvas.height / dpr;

    // 清空（用物理像素保证完全清除）
    ctx.save(); ctx.setTransform(1,0,0,1,0,0); ctx.clearRect(0, 0, canvas.width, canvas.height); ctx.restore();
    roomItems = [];
    animFrame += 0.02;

    // ── 房间基础结构 ──
    const floorY = H * 0.65;
    const wallLeft = W * 0.05;
    const wallRight = W * 0.95;
    const ceilY = H * 0.08;

    // 墙壁（根据 OCEAN 神经质调整冷暖）
    const warmth = ocean.neuroticism < 50 ? 1 : 0.85;
    const wallR = Math.floor(245 * warmth), wallG = Math.floor(240 * warmth), wallB = Math.floor(232 * warmth);
    const wallGrad = ctx.createLinearGradient(0, ceilY, 0, floorY);
    wallGrad.addColorStop(0, 'rgb(' + wallR + ',' + wallG + ',' + wallB + ')');
    wallGrad.addColorStop(1, 'rgb(' + Math.floor(wallR * 0.92) + ',' + Math.floor(wallG * 0.92) + ',' + Math.floor(wallB * 0.92) + ')');
    ctx.fillStyle = wallGrad;
    ctx.fillRect(wallLeft, ceilY, wallRight - wallLeft, floorY - ceilY);

    // ── 护墙板 / 墙裙（下半墙深色段 + 分割线） ──
    const wainscotY = floorY - (floorY - ceilY) * 0.28;
    const wainGrad = ctx.createLinearGradient(0, wainscotY, 0, floorY);
    wainGrad.addColorStop(0, 'rgb(' + Math.floor(wallR * 0.88) + ',' + Math.floor(wallG * 0.88) + ',' + Math.floor(wallB * 0.88) + ')');
    wainGrad.addColorStop(1, 'rgb(' + Math.floor(wallR * 0.82) + ',' + Math.floor(wallG * 0.82) + ',' + Math.floor(wallB * 0.82) + ')');
    ctx.fillStyle = wainGrad;
    ctx.fillRect(wallLeft, wainscotY, wallRight - wallLeft, floorY - wainscotY);
    // 护墙板顶部装饰线
    ctx.strokeStyle = 'rgba(200,168,130,0.35)';
    ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(wallLeft, wainscotY); ctx.lineTo(wallRight, wainscotY); ctx.stroke();
    ctx.strokeStyle = 'rgba(200,168,130,0.18)';
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(wallLeft, wainscotY + 4); ctx.lineTo(wallRight, wainscotY + 4); ctx.stroke();
    // 护墙板竖线纹理（每 ~60px）
    ctx.strokeStyle = 'rgba(0,0,0,0.025)';
    for (let px = wallLeft + 60; px < wallRight; px += 60) {
      ctx.beginPath(); ctx.moveTo(px, wainscotY + 6); ctx.lineTo(px, floorY - 8); ctx.stroke();
    }

    // 天花线
    ctx.strokeStyle = colors.accent;
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(wallLeft, ceilY); ctx.lineTo(wallRight, ceilY); ctx.stroke();
    ctx.strokeStyle = 'rgba(200,168,130,0.3)';
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(wallLeft, ceilY + 12); ctx.lineTo(wallRight, ceilY + 12); ctx.stroke();

    // ── 天花灯具（按气质组变化） ──
    const lightCX = W * 0.45;
    if (temperament === 'NT') {
      // 聚光灯 — 圆柱形轨道灯
      ctx.fillStyle = '#4a4a4a';
      ctx.fillRect(lightCX - 4, ceilY, 8, 14);
      ctx.fillStyle = '#3a3a3a';
      ctx.beginPath(); ctx.ellipse(lightCX, ceilY + 18, 8, 5, 0, 0, Math.PI * 2); ctx.fill();
      // 光锥
      const spotGrad = ctx.createRadialGradient(lightCX, ceilY + 20, 2, lightCX, floorY - 40, 90);
      spotGrad.addColorStop(0, 'rgba(220,230,255,0.08)');
      spotGrad.addColorStop(1, 'rgba(220,230,255,0)');
      ctx.fillStyle = spotGrad;
      ctx.beginPath();
      ctx.moveTo(lightCX - 6, ceilY + 20);
      ctx.lineTo(lightCX - 90, floorY);
      ctx.lineTo(lightCX + 90, floorY);
      ctx.lineTo(lightCX + 6, ceilY + 20);
      ctx.fill();
    } else if (temperament === 'NF') {
      // 吊灯 — 黄铜吊杆 + 布艺灯罩
      ctx.strokeStyle = '#b8a070'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(lightCX, ceilY); ctx.lineTo(lightCX, ceilY + 30); ctx.stroke();
      // 灯罩（梯形）
      ctx.fillStyle = 'rgba(200,168,130,0.5)';
      ctx.beginPath();
      ctx.moveTo(lightCX - 8, ceilY + 28);
      ctx.lineTo(lightCX - 18, ceilY + 50);
      ctx.lineTo(lightCX + 18, ceilY + 50);
      ctx.lineTo(lightCX + 8, ceilY + 28);
      ctx.closePath(); ctx.fill();
      ctx.strokeStyle = '#c8a882'; ctx.lineWidth = 1; ctx.stroke();
      // 暖色光晕
      const pendGrad = ctx.createRadialGradient(lightCX, ceilY + 50, 4, lightCX, ceilY + 50, 120);
      pendGrad.addColorStop(0, 'rgba(255,220,160,0.10)');
      pendGrad.addColorStop(1, 'rgba(255,220,160,0)');
      ctx.fillStyle = pendGrad;
      ctx.beginPath(); ctx.arc(lightCX, ceilY + 50, 120, 0, Math.PI * 2); ctx.fill();
    } else if (temperament === 'SJ') {
      // 日光灯管 — 矩形荧光灯
      ctx.fillStyle = '#e0e0e0';
      ctx.fillRect(lightCX - 50, ceilY + 2, 100, 8);
      ctx.fillStyle = '#f8f8ff';
      ctx.fillRect(lightCX - 46, ceilY + 4, 92, 4);
      // 冷白光
      const fluGrad = ctx.createRadialGradient(lightCX, ceilY + 8, 2, lightCX, ceilY + 8, 180);
      fluGrad.addColorStop(0, 'rgba(240,245,255,0.06)');
      fluGrad.addColorStop(1, 'rgba(240,245,255,0)');
      ctx.fillStyle = fluGrad;
      ctx.beginPath(); ctx.arc(lightCX, ceilY + 8, 180, 0, Math.PI * 2); ctx.fill();
    } else {
      // 轨道灯 — 三头可调方向
      ctx.fillStyle = '#555';
      ctx.fillRect(lightCX - 60, ceilY + 2, 120, 4);
      for (let ti = 0; ti < 3; ti++) {
        const tx = lightCX - 40 + ti * 40;
        const tAngle = -0.3 + ti * 0.3;
        ctx.save(); ctx.translate(tx, ceilY + 6);
        ctx.rotate(tAngle);
        ctx.fillStyle = '#4a4a4a';
        ctx.fillRect(-3, 0, 6, 12);
        ctx.fillStyle = '#ffb74d';
        ctx.beginPath(); ctx.arc(0, 14, 3, 0, Math.PI * 2); ctx.fill();
        ctx.restore();
      }
    }

    // 地板（根据气质组变化）
    const floorColors = {
      NT: ['#c8b8a0', '#b8a890'],
      NF: ['#d4c4aa', '#c8b89a'],
      SJ: ['#bbb0a0', '#a8a090'],
      SP: ['#c0b4a0', '#b0a494'],
    };
    const fc = floorColors[temperament] || floorColors.NT;
    const floorGrad = ctx.createLinearGradient(0, floorY, 0, H);
    floorGrad.addColorStop(0, fc[0]);
    floorGrad.addColorStop(1, fc[1]);
    ctx.fillStyle = floorGrad;
    ctx.fillRect(wallLeft, floorY, wallRight - wallLeft, H - floorY);

    // 地板木纹（横向板缝）
    ctx.strokeStyle = 'rgba(0,0,0,0.04)';
    ctx.lineWidth = 1;
    for (let y = floorY + 20; y < H; y += 22) {
      ctx.beginPath(); ctx.moveTo(wallLeft, y); ctx.lineTo(wallRight, y); ctx.stroke();
    }
    // 地板板缝（纵向接缝，每 ~80px，交错排列）
    ctx.strokeStyle = 'rgba(0,0,0,0.03)';
    let plankRow = 0;
    for (let y = floorY; y < H; y += 22) {
      const offset = (plankRow % 2) * 40;
      for (let px = wallLeft + offset; px < wallRight; px += 80) {
        ctx.beginPath(); ctx.moveTo(px, y); ctx.lineTo(px, Math.min(y + 22, H)); ctx.stroke();
      }
      plankRow++;
    }

    // ── 地毯（按气质组变化形状和颜色） ──
    const rugCX = W * 0.42, rugCY = floorY + (H - floorY) * 0.45;
    const accentRgb = hexToRgb(colors.accent);
    if (temperament === 'NT') {
      // 几何矩形地毯（蓝灰色）
      ctx.fillStyle = 'rgba(120,140,160,0.18)';
      ctx.fillRect(rugCX - 80, rugCY - 25, 160, 50);
      ctx.strokeStyle = 'rgba(120,140,160,0.25)';
      ctx.lineWidth = 1;
      ctx.strokeRect(rugCX - 80, rugCY - 25, 160, 50);
      ctx.strokeRect(rugCX - 72, rugCY - 20, 144, 40);
      // 内部几何线条
      ctx.strokeStyle = 'rgba(100,120,140,0.12)';
      for (let gi = 0; gi < 4; gi++) {
        ctx.beginPath();
        ctx.moveTo(rugCX - 60 + gi * 35, rugCY - 18);
        ctx.lineTo(rugCX - 60 + gi * 35, rugCY + 18);
        ctx.stroke();
      }
    } else if (temperament === 'NF') {
      // 圆形暖色地毯
      ctx.fillStyle = 'rgba(' + accentRgb.r + ',' + accentRgb.g + ',' + accentRgb.b + ',0.12)';
      ctx.beginPath(); ctx.ellipse(rugCX, rugCY, 85, 30, 0, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = 'rgba(' + accentRgb.r + ',' + accentRgb.g + ',' + accentRgb.b + ',0.20)';
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.ellipse(rugCX, rugCY, 85, 30, 0, 0, Math.PI * 2); ctx.stroke();
      ctx.beginPath(); ctx.ellipse(rugCX, rugCY, 65, 22, 0, 0, Math.PI * 2); ctx.stroke();
    } else if (temperament === 'SJ') {
      // 矩形灰色地毯
      ctx.fillStyle = 'rgba(140,140,140,0.13)';
      ctx.fillRect(rugCX - 75, rugCY - 22, 150, 44);
      ctx.strokeStyle = 'rgba(140,140,140,0.18)';
      ctx.lineWidth = 1;
      ctx.strokeRect(rugCX - 75, rugCY - 22, 150, 44);
    } else {
      // 不规则彩色拼接地毯
      const patchColors = ['rgba(200,120,80,0.12)', 'rgba(80,160,200,0.12)', 'rgba(160,200,80,0.12)', 'rgba(200,160,80,0.12)'];
      for (let pi = 0; pi < 4; pi++) {
        ctx.fillStyle = patchColors[pi];
        const px = rugCX - 70 + (pi % 2) * 70;
        const py = rugCY - 20 + Math.floor(pi / 2) * 20;
        ctx.fillRect(px, py, 70, 20);
      }
      ctx.strokeStyle = 'rgba(180,140,100,0.15)';
      ctx.lineWidth = 1;
      ctx.strokeRect(rugCX - 70, rugCY - 20, 140, 40);
    }

    // 踢脚线（加厚双线）
    ctx.fillStyle = colors.main;
    ctx.fillRect(wallLeft, floorY - 2, wallRight - wallLeft, 8);
    ctx.fillStyle = 'rgba(0,0,0,0.08)';
    ctx.fillRect(wallLeft, floorY + 4, wallRight - wallLeft, 2);

    // 左右墙壁边线
    ctx.strokeStyle = 'rgba(0,0,0,0.06)';
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(wallLeft, ceilY); ctx.lineTo(wallLeft, H); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(wallRight, ceilY); ctx.lineTo(wallRight, H); ctx.stroke();

    // ── 暗角晕影效果 ──
    // 左上角
    const vigLT = ctx.createRadialGradient(wallLeft, ceilY, 0, wallLeft, ceilY, 160);
    vigLT.addColorStop(0, 'rgba(0,0,0,0.06)');
    vigLT.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = vigLT;
    ctx.fillRect(wallLeft, ceilY, 160, 160);
    // 右上角
    const vigRT = ctx.createRadialGradient(wallRight, ceilY, 0, wallRight, ceilY, 160);
    vigRT.addColorStop(0, 'rgba(0,0,0,0.06)');
    vigRT.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = vigRT;
    ctx.fillRect(wallRight - 160, ceilY, 160, 160);
    // 左下角
    const vigLB = ctx.createRadialGradient(wallLeft, H, 0, wallLeft, H, 140);
    vigLB.addColorStop(0, 'rgba(0,0,0,0.05)');
    vigLB.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = vigLB;
    ctx.fillRect(wallLeft, H - 140, 140, 140);
    // 右下角
    const vigRB = ctx.createRadialGradient(wallRight, H, 0, wallRight, H, 140);
    vigRB.addColorStop(0, 'rgba(0,0,0,0.05)');
    vigRB.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = vigRB;
    ctx.fillRect(wallRight - 140, H - 140, 140, 140);

    // ── 窗户（右侧） ──
    const winX = wallRight - 140, winY = ceilY + 50, winW = 100, winH = 130;
    // 窗框（带阴影）
    ctx.shadowColor = 'rgba(0,0,0,0.08)'; ctx.shadowBlur = 6; ctx.shadowOffsetX = 2; ctx.shadowOffsetY = 2;
    ctx.fillStyle = '#e8e2d8';
    ctx.fillRect(winX - 6, winY - 6, winW + 12, winH + 12);
    ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0; ctx.shadowOffsetX = 0; ctx.shadowOffsetY = 0;
    // 玻璃（带天空渐变）
    const skyGrad = ctx.createLinearGradient(winX, winY, winX, winY + winH);
    skyGrad.addColorStop(0, '#b8d4e8');
    skyGrad.addColorStop(0.4, '#c4ddf0');
    skyGrad.addColorStop(0.6, '#d0e8f4');
    skyGrad.addColorStop(1, '#e8f0e0');
    ctx.fillStyle = skyGrad;
    ctx.fillRect(winX, winY, winW, winH);
    // 远景树影
    ctx.fillStyle = 'rgba(100,160,100,0.15)';
    ctx.beginPath();
    ctx.moveTo(winX, winY + winH * 0.7);
    ctx.quadraticCurveTo(winX + 20, winY + winH * 0.55, winX + 35, winY + winH * 0.65);
    ctx.quadraticCurveTo(winX + 50, winY + winH * 0.5, winX + 65, winY + winH * 0.6);
    ctx.quadraticCurveTo(winX + 80, winY + winH * 0.48, winX + winW, winY + winH * 0.62);
    ctx.lineTo(winX + winW, winY + winH);
    ctx.lineTo(winX, winY + winH);
    ctx.closePath(); ctx.fill();
    // 窗格
    ctx.strokeStyle = '#d8d0c4';
    ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(winX + winW / 2, winY); ctx.lineTo(winX + winW / 2, winY + winH); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(winX, winY + winH / 2); ctx.lineTo(winX + winW, winY + winH / 2); ctx.stroke();
    // 玻璃反光
    ctx.fillStyle = 'rgba(255,255,255,0.08)';
    ctx.beginPath();
    ctx.moveTo(winX + 5, winY + 5);
    ctx.lineTo(winX + 20, winY + 5);
    ctx.lineTo(winX + 5, winY + 30);
    ctx.closePath(); ctx.fill();
    // 窗帘（颜色跟人格配色）
    const curtainColor = hexToRgb(colors.accent);
    ctx.fillStyle = 'rgba(' + curtainColor.r + ',' + curtainColor.g + ',' + curtainColor.b + ',0.35)';
    ctx.beginPath();
    ctx.moveTo(winX - 10, winY - 8);
    ctx.quadraticCurveTo(winX + 5, winY + winH * 0.3, winX - 15, winY + winH + 10);
    ctx.lineTo(winX - 10, winY + winH + 10);
    ctx.lineTo(winX - 10, winY - 8);
    ctx.fill();
    // 窗帘褶皱细节
    ctx.strokeStyle = 'rgba(' + curtainColor.r + ',' + curtainColor.g + ',' + curtainColor.b + ',0.15)';
    ctx.lineWidth = 0.5;
    for (let ci = 0; ci < 3; ci++) {
      ctx.beginPath();
      ctx.moveTo(winX - 12 + ci * 2, winY);
      ctx.quadraticCurveTo(winX - 8 + ci * 3, winY + winH * 0.5, winX - 14 + ci * 2, winY + winH + 10);
      ctx.stroke();
    }
    ctx.fillStyle = 'rgba(' + curtainColor.r + ',' + curtainColor.g + ',' + curtainColor.b + ',0.35)';
    ctx.beginPath();
    ctx.moveTo(winX + winW + 10, winY - 8);
    ctx.quadraticCurveTo(winX + winW - 5, winY + winH * 0.3, winX + winW + 15, winY + winH + 10);
    ctx.lineTo(winX + winW + 10, winY + winH + 10);
    ctx.lineTo(winX + winW + 10, winY - 8);
    ctx.fill();
    ctx.strokeStyle = 'rgba(' + curtainColor.r + ',' + curtainColor.g + ',' + curtainColor.b + ',0.15)';
    for (let ci = 0; ci < 3; ci++) {
      ctx.beginPath();
      ctx.moveTo(winX + winW + 9 + ci * 2, winY);
      ctx.quadraticCurveTo(winX + winW + 12 + ci * 3, winY + winH * 0.5, winX + winW + 14 + ci, winY + winH + 10);
      ctx.stroke();
    }

    // ── 窗台搁板 + 小物件 ──
    ctx.fillStyle = '#ddd5c8';
    ctx.fillRect(winX - 10, winY + winH + 6, winW + 20, 6);
    // 窗台阴影
    ctx.fillStyle = 'rgba(0,0,0,0.04)';
    ctx.fillRect(winX - 10, winY + winH + 12, winW + 20, 3);
    // 小物品：仙人掌盆栽
    const sillCX = winX + 15;
    ctx.fillStyle = '#a08060';
    ctx.fillRect(sillCX - 5, winY + winH - 2, 10, 8);
    ctx.fillStyle = '#5a9050';
    ctx.beginPath();
    ctx.moveTo(sillCX, winY + winH - 2);
    ctx.quadraticCurveTo(sillCX - 6, winY + winH - 16, sillCX - 3, winY + winH - 22);
    ctx.quadraticCurveTo(sillCX, winY + winH - 18, sillCX + 3, winY + winH - 22);
    ctx.quadraticCurveTo(sillCX + 6, winY + winH - 16, sillCX, winY + winH - 2);
    ctx.fill();
    // 小相框
    ctx.fillStyle = '#c8b8a0';
    ctx.fillRect(winX + winW - 30, winY + winH - 14, 16, 20);
    ctx.fillStyle = '#e8e0d4';
    ctx.fillRect(winX + winW - 28, winY + winH - 12, 12, 16);

    // 光线（加宽渐变）
    ctx.fillStyle = 'rgba(255,248,220,0.08)';
    ctx.beginPath();
    ctx.moveTo(winX, winY + winH);
    ctx.lineTo(winX - 80, H);
    ctx.lineTo(winX + winW + 80, H);
    ctx.lineTo(winX + winW, winY + winH);
    ctx.fill();

    // ── 根据气质组绘制不同的房间主题 ──
    if (temperament === 'NT') drawNTRoom(W, H, floorY, ceilY, wallLeft, wallRight, colors, ocean, skills);
    else if (temperament === 'NF') drawNFRoom(W, H, floorY, ceilY, wallLeft, wallRight, colors, ocean, skills);
    else if (temperament === 'SJ') drawSJRoom(W, H, floorY, ceilY, wallLeft, wallRight, colors, ocean, skills);
    else drawSPRoom(W, H, floorY, ceilY, wallLeft, wallRight, colors, ocean, skills);

    // ── 股市终端屏幕（右上角，Crucix Jarvis 风格） ──
    const stockW = 130, stockH = Math.min(180, (floorY - ceilY) * 0.65);
    drawStockScreen(wallRight - stockW - 20, ceilY + 16, stockW, stockH, allAgents[idx]?.id);

    // ── 龙虾屋彩蛋：桌上的龙虾摆件 ──
    drawLobster(W * 0.48, floorY - 88, 0.7);

    // ── 地面反光 ──
    ctx.fillStyle = 'rgba(255,255,255,0.03)';
    ctx.fillRect(wallLeft, floorY + 2, wallRight - wallLeft, 30);

    // ── 环境光粒子（浮尘 — 多层次大小和辉光） ──
    for (let i = 0; i < 20; i++) {
      const px = wallLeft + ((i * 137.5 + animFrame * (20 + i * 2)) % (wallRight - wallLeft));
      const py = ceilY + 20 + ((i * 89.3 + animFrame * (8 + i)) % (floorY - ceilY - 40));
      const sz = 1.0 + Math.sin(animFrame * 0.8 + i * 1.3) * 0.6 + (i % 3) * 0.5;
      const alpha = 0.08 + Math.sin(animFrame + i * 0.7) * 0.05;
      // 辉光层
      if (sz > 1.5) {
        const glowGrad = ctx.createRadialGradient(px, py, 0, px, py, sz * 3);
        glowGrad.addColorStop(0, 'rgba(200,168,130,' + (alpha * 0.5) + ')');
        glowGrad.addColorStop(1, 'rgba(200,168,130,0)');
        ctx.fillStyle = glowGrad;
        ctx.beginPath(); ctx.arc(px, py, sz * 3, 0, Math.PI * 2); ctx.fill();
      }
      ctx.fillStyle = 'rgba(200,168,130,' + (alpha + 0.06) + ')';
      ctx.beginPath(); ctx.arc(px, py, sz, 0, Math.PI * 2); ctx.fill();
    }

    // ── 可爱龙虾宠物（1-3 只，各种拟人动作） ──
    const lobsterCount = 1 + (idx % 3);
    const lobsterActions = ['walk', 'lie', 'run', 'yoga', 'dance', 'sit', 'wave', 'jump'];
    const actionDescs = {
      walk: '在悠闲地散步', lie: '躺在地上晒太阳', run: '在兴奋地跑来跑去',
      yoga: '在做龙虾瑜伽', dance: '在跳龙虾舞', sit: '安静地坐着发呆',
      wave: '在挥钳子打招呼', jump: '在欢快地蹦跶',
    };

    for (let li = 0; li < lobsterCount; li++) {
      const seed = idx * 7 + li * 31;
      const action = lobsterActions[(seed + Math.floor(animFrame * 0.1)) % lobsterActions.length];
      const walkRange = wallRight - wallLeft - 120;
      const walkSpeed = action === 'run' ? 0.6 : action === 'walk' ? 0.25 : 0.05;
      const walkPhase = (animFrame * walkSpeed + seed) % (Math.PI * 2);
      const baseX = wallLeft + 60 + (Math.sin(walkPhase) * 0.5 + 0.5) * walkRange;
      const baseY = floorY - 14 + li * 5;
      const facing = Math.cos(walkPhase) > 0 ? 1 : -1;
      const sc = 0.7; // 龙虾大小

      ctx.save();
      ctx.translate(baseX, baseY);

      // 根据动作调整姿态
      let bodyRotation = 0, yOffset = 0;
      if (action === 'lie') { bodyRotation = Math.PI / 2 * 0.3; yOffset = 6; } // 躺着
      else if (action === 'yoga') { bodyRotation = Math.sin(animFrame * 0.5 + li) * 0.3; } // 瑜伽拉伸
      else if (action === 'dance') { bodyRotation = Math.sin(animFrame * 3 + li) * 0.2; yOffset = Math.abs(Math.sin(animFrame * 4 + li)) * -8; } // 跳舞
      else if (action === 'jump') { yOffset = Math.abs(Math.sin(animFrame * 3 + li * 2)) * -16; } // 跳
      else if (action === 'run') { yOffset = Math.sin(animFrame * 5 + li) * 2; } // 跑步颠簸
      else if (action === 'wave') { } // 挥手（钳子动画加大）
      else if (action === 'sit') { yOffset = 4; } // 坐着

      ctx.translate(0, yOffset);
      ctx.scale(facing * sc, sc);
      ctx.rotate(bodyRotation);

      // 身体
      const lobColor = ['#e05040', '#d04838', '#c83828'][li % 3];
      ctx.fillStyle = lobColor;
      ctx.beginPath(); ctx.ellipse(0, 0, 20, 10, 0, 0, Math.PI * 2); ctx.fill();
      // 尾巴
      const tailWag = Math.sin(animFrame * 4 + li) * 0.2;
      ctx.beginPath(); ctx.moveTo(18, 0); ctx.quadraticCurveTo(30, -6 + tailWag * 12, 32, 5); ctx.quadraticCurveTo(28, 12, 20, 5); ctx.fill();
      // 钳子
      const clawAmp = action === 'wave' ? 0.5 : action === 'dance' ? 0.35 : 0.15;
      const clawOpen = Math.sin(animFrame * 2.5 + li * 3) * clawAmp;
      ctx.fillStyle = '#d04030';
      ctx.beginPath(); ctx.ellipse(-18, -10 - clawOpen * 12, 9, 6, -0.4 + clawOpen, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.ellipse(-18, 10 + clawOpen * 12, 9, 6, 0.4 - clawOpen, 0, Math.PI * 2); ctx.fill();
      // 触须
      ctx.strokeStyle = '#c83020'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(-14, -4); ctx.quadraticCurveTo(-32, -14 + Math.sin(animFrame * 3 + li) * 4, -38, -20); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(-14, 4); ctx.quadraticCurveTo(-32, 14 + Math.cos(animFrame * 3 + li) * 4, -38, 20); ctx.stroke();
      // 大眼睛
      ctx.fillStyle = '#fff';
      ctx.beginPath(); ctx.arc(-10, -5, 4, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(-10, 5, 4, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#1a1a1a';
      const eyeX = Math.sin(animFrame * 0.8 + li) * 1.2;
      ctx.beginPath(); ctx.arc(-10 + eyeX, -5, 2, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(-10 + eyeX, 5, 2, 0, Math.PI * 2); ctx.fill();
      // 眼睛高光
      ctx.fillStyle = '#fff';
      ctx.beginPath(); ctx.arc(-11 + eyeX, -6, 0.8, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(-11 + eyeX, 4, 0.8, 0, Math.PI * 2); ctx.fill();
      // 腮红
      ctx.fillStyle = 'rgba(255,150,150,0.35)';
      ctx.beginPath(); ctx.ellipse(-5, -9, 4, 2.5, 0, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.ellipse(-5, 9, 4, 2.5, 0, 0, Math.PI * 2); ctx.fill();
      // 小嘴（微笑）
      ctx.strokeStyle = '#a03020'; ctx.lineWidth = 0.8;
      ctx.beginPath(); ctx.arc(-14, 0, 3, 0.3, Math.PI - 0.3); ctx.stroke();
      // 小脚
      ctx.fillStyle = lobColor;
      for (let leg = 0; leg < 3; leg++) {
        const legX = -4 + leg * 9;
        const legSwing = Math.sin(animFrame * (action === 'run' ? 6 : 3) + li + leg * 1.2) * 3;
        ctx.fillRect(legX, 9, 2.5, 5 + legSwing);
        ctx.fillRect(legX, -14, 2.5, -(5 + legSwing));
      }

      ctx.restore();

      roomItems.push({ x: baseX - 18, y: baseY - 14, w: 36, h: 28, label: '宠物龙虾 🦞', desc: '可爱的小龙虾正' + actionDescs[action] });
    }
  }

  // ── NT 分析师房间：科技工作室 ──
  function drawNTRoom(W, H, floorY, ceilY, wL, wR, colors, ocean, skills) {
    // ── 大书桌（L型）──
    const deskX = W * 0.15, deskY = floorY - 6;
    // 桌面阴影
    ctx.fillStyle = 'rgba(0,0,0,0.06)';
    ctx.fillRect(deskX + 4, deskY - 66, 280, 4);
    ctx.fillStyle = '#6b5b4b';
    ctx.fillRect(deskX, deskY - 70, 280, 8); // 桌面
    // 桌面高光
    ctx.fillStyle = 'rgba(255,255,255,0.06)';
    ctx.fillRect(deskX + 2, deskY - 70, 276, 3);
    ctx.fillStyle = '#5a4a3a';
    ctx.fillRect(deskX, deskY - 62, 6, 66); // 左腿
    ctx.fillRect(deskX + 274, deskY - 62, 6, 66); // 右腿
    ctx.fillRect(deskX + 130, deskY - 62, 6, 66); // 中腿

    // ── 三屏显示器 ──
    const monY = deskY - 70;
    // 主屏（中央大屏）
    ctx.shadowColor = 'rgba(0,0,0,0.12)'; ctx.shadowBlur = 8; ctx.shadowOffsetY = 3;
    ctx.fillStyle = '#2a2a2a';
    ctx.fillRect(deskX + 30, monY - 90, 110, 75);
    ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0; ctx.shadowOffsetY = 0;
    ctx.fillStyle = '#1a2030';
    ctx.fillRect(deskX + 34, monY - 86, 102, 67);
    // 屏幕内容：代码
    ctx.fillStyle = '#4ec9b0'; ctx.font = '8px monospace';
    ctx.fillText('const agent = new', deskX + 40, monY - 72);
    ctx.fillStyle = '#ce9178'; ctx.fillText('  OpenClaw({', deskX + 40, monY - 62);
    ctx.fillStyle = '#9cdcfe'; ctx.fillText('    soul: "' + (allAgents[currentAgent]?.mbti || '') + '"', deskX + 40, monY - 52);
    ctx.fillStyle = '#569cd6'; ctx.fillText('  });', deskX + 40, monY - 42);
    // 行号
    ctx.fillStyle = '#555'; ctx.font = '7px monospace';
    for (let ln = 0; ln < 4; ln++) ctx.fillText('' + (12 + ln), deskX + 35, monY - 72 + ln * 10);
    // 主屏支架
    ctx.fillStyle = '#3a3a3a';
    ctx.fillRect(deskX + 78, monY - 15, 14, 15);
    ctx.fillRect(deskX + 68, monY, 34, 4);

    // 副屏（右侧 — 数据图表）
    ctx.fillStyle = '#2a2a2a';
    ctx.fillRect(deskX + 155, monY - 80, 85, 60);
    ctx.fillStyle = '#182028';
    ctx.fillRect(deskX + 158, monY - 77, 79, 54);
    // 图表折线
    ctx.strokeStyle = '#c8a882'; ctx.lineWidth = 1.5;
    ctx.beginPath();
    for (let i = 0; i < 8; i++) {
      const x = deskX + 165 + i * 9;
      const y = monY - 65 + Math.sin(i * 0.8 + animFrame) * 15;
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.stroke();
    // 图表填充
    ctx.fillStyle = 'rgba(200,168,130,0.08)';
    ctx.beginPath();
    for (let i = 0; i < 8; i++) {
      const x = deskX + 165 + i * 9;
      const y = monY - 65 + Math.sin(i * 0.8 + animFrame) * 15;
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.lineTo(deskX + 165 + 63, monY - 27); ctx.lineTo(deskX + 165, monY - 27); ctx.closePath(); ctx.fill();
    // 副屏支架
    ctx.fillStyle = '#3a3a3a';
    ctx.fillRect(deskX + 192, monY - 20, 10, 20);
    ctx.fillRect(deskX + 184, monY, 26, 3);

    // 第三屏（左侧竖屏 — 雷达/系统监控）
    ctx.fillStyle = '#2a2a2a';
    ctx.fillRect(deskX - 15, monY - 75, 40, 62);
    ctx.fillStyle = '#141c24';
    ctx.fillRect(deskX - 12, monY - 72, 34, 56);
    // 雷达扫描
    const radarCX = deskX + 5, radarCY = monY - 48;
    ctx.strokeStyle = 'rgba(80,200,160,0.3)'; ctx.lineWidth = 0.5;
    ctx.beginPath(); ctx.arc(radarCX, radarCY, 12, 0, Math.PI * 2); ctx.stroke();
    ctx.beginPath(); ctx.arc(radarCX, radarCY, 7, 0, Math.PI * 2); ctx.stroke();
    // 扫描线
    const scanAngle = animFrame * 2;
    ctx.strokeStyle = 'rgba(80,200,160,0.6)'; ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(radarCX, radarCY);
    ctx.lineTo(radarCX + Math.cos(scanAngle) * 12, radarCY + Math.sin(scanAngle) * 12);
    ctx.stroke();
    // 雷达点
    ctx.fillStyle = '#4ec9b0';
    ctx.beginPath(); ctx.arc(radarCX + 6, radarCY - 4, 1.5, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(radarCX - 3, radarCY + 7, 1.5, 0, Math.PI * 2); ctx.fill();
    // CPU 使用率条
    ctx.fillStyle = 'rgba(80,200,160,0.15)';
    ctx.fillRect(deskX - 10, monY - 28, 28, 4);
    ctx.fillStyle = 'rgba(80,200,160,0.5)';
    ctx.fillRect(deskX - 10, monY - 28, 28 * (0.5 + Math.sin(animFrame) * 0.3), 4);
    ctx.fillStyle = '#4ec9b0'; ctx.font = '5px monospace';
    ctx.fillText('CPU', deskX - 10, monY - 20);
    // 竖屏支架
    ctx.fillStyle = '#3a3a3a';
    ctx.fillRect(deskX + 1, monY - 13, 8, 13);
    ctx.fillRect(deskX - 5, monY, 18, 3);

    roomItems.push({ x: deskX - 15, y: monY - 90, w: 258, h: 95, label: '三屏工作站', desc: '分析师的战略中枢：代码 + 数据 + 系统监控' });

    // ── 键盘 + 鼠标 ──
    ctx.fillStyle = '#4a4a4a';
    ctx.fillRect(deskX + 60, deskY - 84, 70, 18);
    ctx.fillStyle = '#555';
    for (let r = 0; r < 3; r++) for (let c = 0; c < 9; c++) {
      ctx.fillRect(deskX + 63 + c * 7, deskY - 82 + r * 5, 5, 3);
    }
    // 鼠标
    ctx.fillStyle = '#4a4a4a';
    ctx.beginPath(); ctx.ellipse(deskX + 150, deskY - 78, 8, 12, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#555';
    ctx.fillRect(deskX + 149, deskY - 86, 2, 6);

    // ── 桌面物品：咖啡杯 ──
    ctx.fillStyle = '#e8e0d4';
    ctx.beginPath(); ctx.ellipse(deskX + 185, deskY - 78, 9, 6, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#d8d0c4';
    ctx.fillRect(deskX + 176, deskY - 78, 18, 3);
    // 杯耳
    ctx.strokeStyle = '#d0c0b0'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(deskX + 195, deskY - 78, 5, -Math.PI * 0.4, Math.PI * 0.4); ctx.stroke();
    // 蒸汽
    ctx.strokeStyle = 'rgba(200,200,200,0.2)'; ctx.lineWidth = 0.8;
    for (let si = 0; si < 2; si++) {
      ctx.beginPath();
      ctx.moveTo(deskX + 183 + si * 4, deskY - 84);
      ctx.quadraticCurveTo(deskX + 185 + si * 4 + Math.sin(animFrame + si) * 3, deskY - 92, deskX + 184 + si * 4, deskY - 98);
      ctx.stroke();
    }

    // ── USB 集线器 ──
    ctx.fillStyle = '#3a3a3a';
    ctx.fillRect(deskX + 210, deskY - 80, 30, 8);
    ctx.fillStyle = '#555';
    for (let ui = 0; ui < 4; ui++) {
      ctx.fillRect(deskX + 213 + ui * 7, deskY - 79, 4, 6);
    }
    // USB 线（一根连接）
    ctx.strokeStyle = '#444'; ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(deskX + 225, deskY - 72);
    ctx.quadraticCurveTo(deskX + 230, deskY - 68, deskX + 240, deskY - 70);
    ctx.stroke();

    // ── 便签贴（桌面角） ──
    ctx.fillStyle = '#fff9c4';
    ctx.save(); ctx.translate(deskX + 250, deskY - 92); ctx.rotate(0.08);
    ctx.fillRect(0, 0, 22, 22);
    ctx.fillStyle = '#999'; ctx.font = '5px sans-serif';
    ctx.fillText('TODO', 2, 10);
    ctx.fillText('refactor', 2, 16);
    ctx.restore();

    // ── 椅子（人体工学） ──
    ctx.fillStyle = '#3a3a3a';
    // 底座五爪
    ctx.strokeStyle = '#444'; ctx.lineWidth = 2;
    for (let ci = 0; ci < 5; ci++) {
      const ca = ci * Math.PI * 2 / 5 - Math.PI / 2;
      ctx.beginPath();
      ctx.moveTo(deskX + 125, floorY - 3);
      ctx.lineTo(deskX + 125 + Math.cos(ca) * 18, floorY - 3 + Math.sin(ca) * 6);
      ctx.stroke();
    }
    // 气杆
    ctx.fillStyle = '#444';
    ctx.fillRect(deskX + 123, floorY - 15, 4, 12);
    // 座面
    ctx.fillStyle = '#3a3a3a';
    ctx.fillRect(deskX + 100, floorY - 45, 50, 5);
    ctx.fillRect(deskX + 100, floorY - 40, 50, 26);
    ctx.fillStyle = colors.main;
    ctx.fillRect(deskX + 102, floorY - 38, 46, 22);
    // 靠背
    ctx.fillStyle = '#3a3a3a';
    ctx.fillRect(deskX + 105, floorY - 70, 40, 30);
    ctx.fillStyle = colors.main;
    ctx.fillRect(deskX + 107, floorY - 68, 36, 26);
    // 头枕
    ctx.fillStyle = '#3a3a3a';
    ctx.fillRect(deskX + 110, floorY - 78, 30, 8);

    // ── 白板（增大 + 更丰富内容） ──
    const wbX = wL + 30, wbY = ceilY + 35;
    ctx.shadowColor = 'rgba(0,0,0,0.08)'; ctx.shadowBlur = 4; ctx.shadowOffsetY = 2;
    ctx.fillStyle = '#f8f6f2';
    ctx.fillRect(wbX, wbY, 160, 110);
    ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0; ctx.shadowOffsetY = 0;
    ctx.strokeStyle = '#d0c8c0'; ctx.lineWidth = 2;
    ctx.strokeRect(wbX, wbY, 160, 110);
    // 白板笔槽
    ctx.fillStyle = '#d0c8c0';
    ctx.fillRect(wbX + 10, wbY + 110, 140, 5);
    // 白板笔（3支不同颜色）
    const penColors = [colors.main, colors.accent, '#e05050'];
    for (let pi = 0; pi < 3; pi++) {
      ctx.fillStyle = penColors[pi];
      ctx.fillRect(wbX + 20 + pi * 25, wbY + 107, 18, 4);
    }
    // 思维导图（更丰富）
    ctx.fillStyle = colors.main;
    ctx.beginPath(); ctx.arc(wbX + 80, wbY + 50, 15, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#fff'; ctx.font = 'bold 9px sans-serif'; ctx.textAlign = 'center';
    ctx.fillText('Core', wbX + 80, wbY + 53);
    ctx.strokeStyle = colors.accent; ctx.lineWidth = 1.5;
    const nodes = [[30, 25], [130, 25], [30, 80], [130, 80], [80, 15], [80, 90]];
    nodes.forEach(([nx, ny]) => {
      ctx.beginPath(); ctx.moveTo(wbX + 80, wbY + 50); ctx.lineTo(wbX + nx, wbY + ny); ctx.stroke();
      ctx.fillStyle = colors.accent; ctx.beginPath(); ctx.arc(wbX + nx, wbY + ny, 5, 0, Math.PI * 2); ctx.fill();
    });
    // 子节点标签
    ctx.fillStyle = '#888'; ctx.font = '6px sans-serif';
    ctx.fillText('Soul', wbX + 30, wbY + 20);
    ctx.fillText('Mem', wbX + 130, wbY + 20);
    ctx.fillText('Skill', wbX + 30, wbY + 95);
    ctx.fillText('Tool', wbX + 130, wbY + 95);
    ctx.textAlign = 'left';
    roomItems.push({ x: wbX, y: wbY, w: 160, h: 115, label: '战略白板', desc: 'Agent 架构的思维导图，六个核心节点清晰标注' });

    // ── 墙上证书/相框（2-3个） ──
    const certX = wR - 190, certY = ceilY + 30;
    for (let fi = 0; fi < 3; fi++) {
      const fx = certX + fi * 48;
      const fy = certY + (fi === 1 ? 8 : 0);
      ctx.fillStyle = '#e8e2d8';
      ctx.fillRect(fx, fy, 38, 30);
      ctx.strokeStyle = '#c8b8a0'; ctx.lineWidth = 1;
      ctx.strokeRect(fx, fy, 38, 30);
      ctx.fillStyle = '#f5f0e8';
      ctx.fillRect(fx + 3, fy + 3, 32, 24);
      // 证书内容线条
      ctx.strokeStyle = '#d0c8c0'; ctx.lineWidth = 0.5;
      for (let li = 0; li < 3; li++) {
        ctx.beginPath();
        ctx.moveTo(fx + 8, fy + 10 + li * 5);
        ctx.lineTo(fx + 30, fy + 10 + li * 5);
        ctx.stroke();
      }
    }
    roomItems.push({ x: certX, y: certY, w: 144, h: 38, label: '墙上证书', desc: '三张技术认证证书，整齐排列' });

    // ── 地板 PC 机箱（呼吸 LED） ──
    const pcX = deskX + 260, pcY = floorY;
    ctx.fillStyle = '#2a2a2a';
    ctx.fillRect(pcX, pcY - 55, 30, 55);
    ctx.strokeStyle = '#3a3a3a'; ctx.lineWidth = 1;
    ctx.strokeRect(pcX, pcY - 55, 30, 55);
    // 前面板
    ctx.fillStyle = '#333';
    ctx.fillRect(pcX + 3, pcY - 50, 24, 20);
    // 呼吸 LED
    const ledAlpha = 0.4 + Math.sin(animFrame * 1.5) * 0.3;
    ctx.fillStyle = 'rgba(80,200,160,' + ledAlpha + ')';
    ctx.beginPath(); ctx.arc(pcX + 15, pcY - 38, 2, 0, Math.PI * 2); ctx.fill();
    // LED 辉光
    const ledGlow = ctx.createRadialGradient(pcX + 15, pcY - 38, 0, pcX + 15, pcY - 38, 8);
    ledGlow.addColorStop(0, 'rgba(80,200,160,' + (ledAlpha * 0.3) + ')');
    ledGlow.addColorStop(1, 'rgba(80,200,160,0)');
    ctx.fillStyle = ledGlow;
    ctx.beginPath(); ctx.arc(pcX + 15, pcY - 38, 8, 0, Math.PI * 2); ctx.fill();
    // 散热栅
    ctx.strokeStyle = 'rgba(60,60,60,0.8)'; ctx.lineWidth = 0.5;
    for (let vi = 0; vi < 5; vi++) {
      ctx.beginPath();
      ctx.moveTo(pcX + 6, pcY - 26 + vi * 4);
      ctx.lineTo(pcX + 24, pcY - 26 + vi * 4);
      ctx.stroke();
    }
    roomItems.push({ x: pcX, y: pcY - 55, w: 30, h: 55, label: 'PC 主机', desc: '高性能主机，绿色呼吸灯表示正常运行' });

    // 墙上 OpenClaw 海报
    drawPoster(wR - 180, ceilY + 80, 70, 90, colors);
  }

  // ── NF 外交官房间：温馨书房 ──
  function drawNFRoom(W, H, floorY, ceilY, wL, wR, colors, ocean, skills) {
    // ── 书架（大型，靠左墙） ──
    const shX = wL + 20, shY = ceilY + 30;
    ctx.shadowColor = 'rgba(0,0,0,0.1)'; ctx.shadowBlur = 6; ctx.shadowOffsetX = 3;
    ctx.fillStyle = '#7b6555';
    ctx.fillRect(shX, shY, 140, floorY - shY - 8);
    ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0; ctx.shadowOffsetX = 0;
    // 书架侧板高光
    ctx.fillStyle = 'rgba(255,255,255,0.04)';
    ctx.fillRect(shX, shY, 4, floorY - shY - 8);
    // 隔板 + 书本 + 小摆件
    const figurines = [
      { shelf: 0, pos: 6, type: 'cat' },
      { shelf: 2, pos: 5, type: 'globe' },
      { shelf: 3, pos: 3, type: 'crystal' },
    ];
    for (let i = 0; i < 4; i++) {
      const sy = shY + 10 + i * 55;
      ctx.fillStyle = '#6b5545';
      ctx.fillRect(shX, sy, 140, 5);
      // 书本
      for (let j = 0; j < 7; j++) {
        const bw = 12 + ((j * 7 + i * 13) % 7);
        const bh = 35 + ((j * 11 + i * 17) % 16);
        const bx = shX + 5 + j * 18;
        const bookColors = [colors.accent, colors.main, '#c8a882', '#8b7b6b', '#a8c0d4', '#b8a8cc', '#9bc0b0'];
        ctx.fillStyle = bookColors[j % bookColors.length];
        ctx.fillRect(bx, sy - bh, bw, bh);
        // 书脊线
        ctx.strokeStyle = 'rgba(0,0,0,0.08)'; ctx.lineWidth = 0.5;
        ctx.beginPath(); ctx.moveTo(bx + bw * 0.5, sy - bh + 3); ctx.lineTo(bx + bw * 0.5, sy - 3); ctx.stroke();
      }
      // 小摆件
      const fig = figurines.find(f => f.shelf === i);
      if (fig) {
        const figX = shX + 5 + fig.pos * 18 + 6;
        const figY = sy;
        if (fig.type === 'cat') {
          // 小猫摆件
          ctx.fillStyle = '#d4a860';
          ctx.beginPath(); ctx.ellipse(figX, figY - 8, 6, 5, 0, 0, Math.PI * 2); ctx.fill();
          ctx.beginPath(); ctx.arc(figX, figY - 14, 4, 0, Math.PI * 2); ctx.fill();
          // 耳朵
          ctx.beginPath(); ctx.moveTo(figX - 3, figY - 17); ctx.lineTo(figX - 1, figY - 22); ctx.lineTo(figX + 1, figY - 17); ctx.fill();
          ctx.beginPath(); ctx.moveTo(figX + 1, figY - 17); ctx.lineTo(figX + 3, figY - 22); ctx.lineTo(figX + 5, figY - 17); ctx.fill();
        } else if (fig.type === 'globe') {
          // 小地球仪
          ctx.fillStyle = '#a0c8e0';
          ctx.beginPath(); ctx.arc(figX, figY - 10, 7, 0, Math.PI * 2); ctx.fill();
          ctx.strokeStyle = '#80a8c0'; ctx.lineWidth = 0.5;
          ctx.beginPath(); ctx.ellipse(figX, figY - 10, 7, 3, 0, 0, Math.PI * 2); ctx.stroke();
          ctx.beginPath(); ctx.moveTo(figX, figY - 17); ctx.lineTo(figX, figY - 3); ctx.stroke();
          ctx.fillStyle = '#7b6555';
          ctx.fillRect(figX - 4, figY - 3, 8, 3);
        } else {
          // 水晶摆件
          ctx.fillStyle = 'rgba(180,160,220,0.6)';
          ctx.beginPath();
          ctx.moveTo(figX, figY - 18);
          ctx.lineTo(figX + 5, figY - 8);
          ctx.lineTo(figX - 5, figY - 8);
          ctx.closePath(); ctx.fill();
          ctx.strokeStyle = 'rgba(200,180,240,0.8)'; ctx.lineWidth = 0.5; ctx.stroke();
        }
      }
    }
    roomItems.push({ x: shX, y: shY, w: 140, h: floorY - shY - 8, label: '藏书架', desc: '四层书架摆满书籍，穿插着小猫、地球仪和水晶摆件' });

    // ── 舒适沙发 ──
    const sofaX = W * 0.35, sofaY = floorY;
    // 沙发阴影
    ctx.fillStyle = 'rgba(0,0,0,0.05)';
    ctx.beginPath();
    ctx.ellipse(sofaX + 80, sofaY + 2, 85, 6, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = colors.main;
    // 沙发座面
    ctx.beginPath();
    ctx.moveTo(sofaX, sofaY - 30);
    ctx.quadraticCurveTo(sofaX + 80, sofaY - 38, sofaX + 160, sofaY - 30);
    ctx.lineTo(sofaX + 160, sofaY);
    ctx.lineTo(sofaX, sofaY);
    ctx.closePath(); ctx.fill();
    // 靠背
    ctx.fillStyle = hexToRgb(colors.main).r > 100 ? 'rgba(0,0,0,0.12)' : 'rgba(255,255,255,0.12)';
    ctx.beginPath();
    ctx.moveTo(sofaX - 5, sofaY - 30);
    ctx.quadraticCurveTo(sofaX + 80, sofaY - 70, sofaX + 165, sofaY - 30);
    ctx.lineTo(sofaX + 160, sofaY - 30);
    ctx.quadraticCurveTo(sofaX + 80, sofaY - 55, sofaX, sofaY - 30);
    ctx.fill();
    // 缝线纹理
    ctx.strokeStyle = 'rgba(0,0,0,0.06)'; ctx.lineWidth = 0.5;
    ctx.beginPath();
    ctx.moveTo(sofaX + 40, sofaY - 30);
    ctx.quadraticCurveTo(sofaX + 40, sofaY - 15, sofaX + 40, sofaY);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(sofaX + 120, sofaY - 30);
    ctx.quadraticCurveTo(sofaX + 120, sofaY - 15, sofaX + 120, sofaY);
    ctx.stroke();
    // 抱枕
    ctx.fillStyle = colors.accent;
    ctx.beginPath(); ctx.ellipse(sofaX + 25, sofaY - 35, 18, 12, -0.2, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(sofaX + 135, sofaY - 35, 18, 12, 0.2, 0, Math.PI * 2); ctx.fill();
    // 抱枕流苏
    ctx.strokeStyle = colors.accent; ctx.lineWidth = 0.8;
    for (let ti = 0; ti < 3; ti++) {
      ctx.beginPath(); ctx.moveTo(sofaX + 13 + ti * 3, sofaY - 26); ctx.lineTo(sofaX + 12 + ti * 3, sofaY - 22); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(sofaX + 143 + ti * 3, sofaY - 26); ctx.lineTo(sofaX + 142 + ti * 3, sofaY - 22); ctx.stroke();
    }
    roomItems.push({ x: sofaX, y: sofaY - 70, w: 160, h: 70, label: '温馨沙发', desc: '柔软的沙发配着同色系抱枕和流苏装饰' });

    // ── 小茶几 + 蜡烛 ──
    ctx.fillStyle = '#8b7b6b';
    ctx.fillRect(sofaX + 55, sofaY - 10, 50, 4);
    ctx.fillRect(sofaX + 60, sofaY - 6, 4, 10);
    ctx.fillRect(sofaX + 96, sofaY - 6, 4, 10);
    // 茶杯
    ctx.fillStyle = '#e8e0d4';
    ctx.beginPath(); ctx.ellipse(sofaX + 72, sofaY - 14, 8, 5, 0, 0, Math.PI * 2); ctx.fill();
    // 蒸汽
    ctx.strokeStyle = 'rgba(200,200,200,0.3)'; ctx.lineWidth = 1;
    for (let i = 0; i < 3; i++) {
      const sx = sofaX + 70 + i * 4;
      ctx.beginPath();
      ctx.moveTo(sx, sofaY - 19);
      ctx.quadraticCurveTo(sx + 3 * Math.sin(animFrame + i), sofaY - 30, sx + 1, sofaY - 38 - Math.sin(animFrame) * 3);
      ctx.stroke();
    }
    // ── 蜡烛（动画火焰） ──
    const candleX = sofaX + 95, candleY = sofaY - 14;
    ctx.fillStyle = '#f0e8d0';
    ctx.fillRect(candleX - 3, candleY - 16, 6, 16);
    // 烛芯
    ctx.strokeStyle = '#555'; ctx.lineWidth = 0.8;
    ctx.beginPath(); ctx.moveTo(candleX, candleY - 16); ctx.lineTo(candleX, candleY - 19); ctx.stroke();
    // 火焰（动态）
    const flameH = 8 + Math.sin(animFrame * 4) * 2;
    const flameW = 3 + Math.sin(animFrame * 3 + 1) * 0.8;
    // 外焰
    const flameGrad = ctx.createRadialGradient(candleX, candleY - 19 - flameH * 0.3, 1, candleX, candleY - 19 - flameH * 0.3, flameH);
    flameGrad.addColorStop(0, 'rgba(255,200,50,0.8)');
    flameGrad.addColorStop(0.5, 'rgba(255,140,20,0.5)');
    flameGrad.addColorStop(1, 'rgba(255,100,20,0)');
    ctx.fillStyle = flameGrad;
    ctx.beginPath();
    ctx.moveTo(candleX, candleY - 19 - flameH);
    ctx.quadraticCurveTo(candleX + flameW + 1, candleY - 19 - flameH * 0.3, candleX, candleY - 17);
    ctx.quadraticCurveTo(candleX - flameW - 1, candleY - 19 - flameH * 0.3, candleX, candleY - 19 - flameH);
    ctx.fill();
    // 内焰
    ctx.fillStyle = 'rgba(255,240,180,0.7)';
    ctx.beginPath();
    ctx.moveTo(candleX, candleY - 19 - flameH * 0.6);
    ctx.quadraticCurveTo(candleX + flameW * 0.4, candleY - 19 - flameH * 0.15, candleX, candleY - 18);
    ctx.quadraticCurveTo(candleX - flameW * 0.4, candleY - 19 - flameH * 0.15, candleX, candleY - 19 - flameH * 0.6);
    ctx.fill();
    // 烛光辉晕
    const candleGlow = ctx.createRadialGradient(candleX, candleY - 22, 2, candleX, candleY - 22, 50);
    candleGlow.addColorStop(0, 'rgba(255,200,100,0.06)');
    candleGlow.addColorStop(1, 'rgba(255,200,100,0)');
    ctx.fillStyle = candleGlow;
    ctx.beginPath(); ctx.arc(candleX, candleY - 22, 50, 0, Math.PI * 2); ctx.fill();
    roomItems.push({ x: candleX - 8, y: candleY - 30, w: 16, h: 30, label: '香氛蜡烛', desc: '跳动的火焰为书房增添温暖的气氛' });

    // ── 植物（大型落地盆栽） ──
    const plantX = wR - 100, plantY = floorY;
    ctx.fillStyle = '#8b6b4b';
    ctx.fillRect(plantX - 15, plantY - 30, 30, 30);
    // 花盆纹饰
    ctx.strokeStyle = '#9b7b5b'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(plantX - 12, plantY - 20); ctx.lineTo(plantX + 12, plantY - 20); ctx.stroke();
    ctx.fillStyle = '#5a8b4a';
    for (let i = 0; i < 5; i++) {
      const angle = -Math.PI / 2 + (i - 2) * 0.5 + Math.sin(animFrame + i) * 0.03;
      ctx.beginPath();
      ctx.moveTo(plantX, plantY - 30);
      ctx.quadraticCurveTo(
        plantX + Math.cos(angle) * 25, plantY - 60 - i * 8,
        plantX + Math.cos(angle) * 40, plantY - 80 - i * 10
      );
      ctx.lineWidth = 3; ctx.strokeStyle = '#5a8b4a'; ctx.stroke();
      ctx.fillStyle = '#6a9b5a';
      ctx.beginPath(); ctx.ellipse(plantX + Math.cos(angle) * 40, plantY - 80 - i * 10, 14, 10, angle, 0, Math.PI * 2); ctx.fill();
      // 叶脉
      ctx.strokeStyle = 'rgba(80,130,60,0.3)'; ctx.lineWidth = 0.5;
      const lx = plantX + Math.cos(angle) * 40, ly = plantY - 80 - i * 10;
      ctx.beginPath(); ctx.moveTo(lx - 8, ly); ctx.lineTo(lx + 8, ly); ctx.stroke();
    }
    roomItems.push({ x: plantX - 20, y: plantY - 100, w: 50, h: 100, label: '落地盆栽', desc: '为房间带来生机和清新空气的大叶植物' });

    // ── 窗台花瓶（3 朵花） ──
    const vaseX = wR - 80, vaseY = ceilY + 50 + 130 - 4;
    ctx.fillStyle = '#c0a8c8';
    ctx.beginPath();
    ctx.moveTo(vaseX - 6, vaseY);
    ctx.quadraticCurveTo(vaseX - 8, vaseY - 12, vaseX - 4, vaseY - 20);
    ctx.lineTo(vaseX + 4, vaseY - 20);
    ctx.quadraticCurveTo(vaseX + 8, vaseY - 12, vaseX + 6, vaseY);
    ctx.closePath(); ctx.fill();
    // 花茎
    const flowerColors = ['#e88090', '#f0c060', '#90b0e0'];
    for (let fi = 0; fi < 3; fi++) {
      const fAngle = -Math.PI / 2 + (fi - 1) * 0.35;
      const fLen = 20 + fi * 5;
      const fx = vaseX + Math.cos(fAngle) * fLen;
      const fy = vaseY - 20 + Math.sin(fAngle) * fLen;
      ctx.strokeStyle = '#5a8b4a'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(vaseX, vaseY - 18); ctx.lineTo(fx, fy); ctx.stroke();
      // 花朵
      ctx.fillStyle = flowerColors[fi];
      ctx.beginPath(); ctx.arc(fx, fy, 5, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#f0e080';
      ctx.beginPath(); ctx.arc(fx, fy, 2, 0, Math.PI * 2); ctx.fill();
    }

    // ── 墙上照片墙（3-4 小相框） ──
    const galleryX = W * 0.38, galleryY = ceilY + 35;
    const frames = [
      { x: 0, y: 0, w: 40, h: 32 },
      { x: 46, y: 4, w: 35, h: 28 },
      { x: 8, y: 38, w: 32, h: 38 },
      { x: 48, y: 36, w: 36, h: 30 },
    ];
    frames.forEach((f, fi) => {
      const fx = galleryX + f.x, fy = galleryY + f.y;
      ctx.fillStyle = fi % 2 === 0 ? '#e0d8cc' : '#d8cfc0';
      ctx.fillRect(fx, fy, f.w, f.h);
      ctx.strokeStyle = '#c8b8a0'; ctx.lineWidth = 1.5;
      ctx.strokeRect(fx, fy, f.w, f.h);
      // 照片内容（色块抽象）
      const photoColors = [colors.accent + '40', colors.main + '30', '#c8a882' + '40', '#a8c0d4' + '40'];
      ctx.fillStyle = photoColors[fi];
      ctx.fillRect(fx + 3, fy + 3, f.w - 6, f.h - 6);
    });
    roomItems.push({ x: galleryX, y: galleryY, w: 88, h: 70, label: '照片墙', desc: '四张精心排列的照片，记录着温暖的回忆' });

    // ── 落地灯（弯颈暖光） ──
    const lampX = W * 0.32, lampY = floorY;
    // 灯座
    ctx.fillStyle = '#8b7b6b';
    ctx.beginPath(); ctx.ellipse(lampX, lampY - 2, 12, 4, 0, 0, Math.PI * 2); ctx.fill();
    // 灯杆
    ctx.strokeStyle = '#a09080'; ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(lampX, lampY - 6);
    ctx.lineTo(lampX, lampY - 100);
    ctx.quadraticCurveTo(lampX, lampY - 120, lampX + 20, lampY - 125);
    ctx.stroke();
    // 灯罩
    ctx.fillStyle = 'rgba(255,230,180,0.7)';
    ctx.beginPath();
    ctx.moveTo(lampX + 14, lampY - 130);
    ctx.lineTo(lampX + 8, lampY - 115);
    ctx.lineTo(lampX + 32, lampY - 115);
    ctx.lineTo(lampX + 26, lampY - 130);
    ctx.closePath(); ctx.fill();
    ctx.strokeStyle = '#c8a882'; ctx.lineWidth = 1; ctx.stroke();
    // 暖光圈
    const lampGlow = ctx.createRadialGradient(lampX + 20, lampY - 110, 3, lampX + 20, lampY - 80, 80);
    lampGlow.addColorStop(0, 'rgba(255,220,150,0.10)');
    lampGlow.addColorStop(1, 'rgba(255,220,150,0)');
    ctx.fillStyle = lampGlow;
    ctx.beginPath(); ctx.arc(lampX + 20, lampY - 80, 80, 0, Math.PI * 2); ctx.fill();
    roomItems.push({ x: lampX - 12, y: lampY - 130, w: 45, h: 130, label: '弯颈落地灯', desc: '散发暖黄色光芒的阅读灯，照亮沙发区' });

    // OpenClaw 海报
    drawPoster(wL + 180, ceilY + 30, 60, 80, colors);
  }

  // ── SJ 守护者房间：整洁办公室 ──
  function drawSJRoom(W, H, floorY, ceilY, wL, wR, colors, ocean, skills) {
    // ── 办公桌（方正，加细节） ──
    const deskX = W * 0.28, deskY = floorY;
    // 桌面阴影
    ctx.fillStyle = 'rgba(0,0,0,0.05)';
    ctx.fillRect(deskX + 3, deskY - 66, 220, 4);
    ctx.fillStyle = '#7b6b5b';
    ctx.fillRect(deskX, deskY - 72, 220, 8);
    // 桌面高光
    ctx.fillStyle = 'rgba(255,255,255,0.05)';
    ctx.fillRect(deskX + 2, deskY - 72, 216, 3);
    ctx.fillStyle = '#6b5b4b';
    ctx.fillRect(deskX, deskY - 64, 8, 64);
    ctx.fillRect(deskX + 212, deskY - 64, 8, 64);
    // 抽屉
    ctx.fillStyle = '#8b7b6b';
    ctx.fillRect(deskX + 150, deskY - 60, 64, 25);
    ctx.fillRect(deskX + 150, deskY - 32, 64, 25);
    ctx.strokeStyle = '#a09080'; ctx.lineWidth = 1;
    ctx.strokeRect(deskX + 150, deskY - 60, 64, 25);
    ctx.strokeRect(deskX + 150, deskY - 32, 64, 25);
    // 抽屉把手
    ctx.fillStyle = colors.accent;
    ctx.fillRect(deskX + 175, deskY - 50, 14, 3);
    ctx.fillRect(deskX + 175, deskY - 22, 14, 3);

    // ── 显示器（单屏，居中） ──
    ctx.shadowColor = 'rgba(0,0,0,0.1)'; ctx.shadowBlur = 6; ctx.shadowOffsetY = 2;
    ctx.fillStyle = '#2a2a2a';
    ctx.fillRect(deskX + 55, deskY - 155, 110, 75);
    ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0; ctx.shadowOffsetY = 0;
    ctx.fillStyle = '#f4f0e8';
    ctx.fillRect(deskX + 59, deskY - 151, 102, 67);
    // 屏幕内容：表格/清单
    ctx.fillStyle = '#4a4a4a'; ctx.font = '8px sans-serif'; ctx.textAlign = 'left';
    ctx.fillText('[ ] 检查权限配置', deskX + 65, deskY - 138);
    ctx.fillStyle = '#6b8b5e';
    ctx.fillText('[x] 更新文档', deskX + 65, deskY - 126);
    ctx.fillText('[x] 回滚方案就绪', deskX + 65, deskY - 114);
    ctx.fillStyle = '#4a4a4a';
    ctx.fillText('[ ] 压力测试', deskX + 65, deskY - 102);
    // 进度条
    ctx.fillStyle = 'rgba(100,160,90,0.15)';
    ctx.fillRect(deskX + 65, deskY - 95, 88, 6);
    ctx.fillStyle = 'rgba(100,160,90,0.5)';
    ctx.fillRect(deskX + 65, deskY - 95, 55, 6);
    ctx.fillStyle = '#6b8b5e'; ctx.font = '5px sans-serif';
    ctx.fillText('62%', deskX + 122, deskY - 90);
    // 支架
    ctx.fillStyle = '#3a3a3a';
    ctx.fillRect(deskX + 103, deskY - 80, 14, 8);
    ctx.fillRect(deskX + 95, deskY - 72, 30, 3);
    roomItems.push({ x: deskX + 55, y: deskY - 155, w: 110, h: 83, label: '办公显示器', desc: '整洁的待办清单，进度条显示 62%' });

    // ── 桌面文件架（3 层） ──
    const rackX = deskX + 10, rackY = deskY - 72;
    ctx.fillStyle = '#888';
    // 框架
    ctx.fillRect(rackX, rackY - 40, 2, 40);
    ctx.fillRect(rackX + 38, rackY - 40, 2, 40);
    // 三层托盘
    for (let ri = 0; ri < 3; ri++) {
      const ry = rackY - 8 - ri * 14;
      ctx.fillStyle = '#999';
      ctx.fillRect(rackX + 1, ry, 38, 2);
      // 文件
      ctx.fillStyle = ri === 0 ? '#f5f0e5' : ri === 1 ? '#e8f0e5' : '#f0e8e5';
      ctx.fillRect(rackX + 3, ry - 8, 34, 8);
      if (ri < 2) {
        ctx.fillStyle = 'rgba(0,0,0,0.04)';
        ctx.fillRect(rackX + 5, ry - 6, 30, 1);
        ctx.fillRect(rackX + 5, ry - 3, 20, 1);
      }
    }
    roomItems.push({ x: rackX, y: rackY - 45, w: 40, h: 45, label: '文件架', desc: '三层文件架，文件按优先级分色管理' });

    // ── 笔筒（5 支笔） ──
    const penX = deskX + 135, penY = deskY - 72;
    ctx.fillStyle = '#6b5b4b';
    ctx.fillRect(penX - 7, penY - 18, 14, 18);
    ctx.strokeStyle = '#8b7b6b'; ctx.lineWidth = 0.5;
    ctx.strokeRect(penX - 7, penY - 18, 14, 18);
    const penCols = ['#333', '#1a5276', '#c0392b', '#27ae60', '#8e44ad'];
    for (let pi = 0; pi < 5; pi++) {
      ctx.strokeStyle = penCols[pi]; ctx.lineWidth = 1.2;
      const pa = -0.3 + pi * 0.15;
      ctx.beginPath();
      ctx.moveTo(penX - 4 + pi * 2.5, penY - 18);
      ctx.lineTo(penX - 4 + pi * 2.5 + Math.sin(pa) * 8, penY - 30 - pi * 1.5);
      ctx.stroke();
    }
    roomItems.push({ x: penX - 8, y: penY - 32, w: 16, h: 32, label: '笔筒', desc: '五支不同颜色的笔，整齐插在笔筒中' });

    // ── 桌牌（三角形） ──
    const npX = deskX + 95, npY = deskY - 72;
    ctx.fillStyle = '#2a2a2a';
    ctx.beginPath();
    ctx.moveTo(npX, npY - 14);
    ctx.lineTo(npX + 26, npY - 14);
    ctx.lineTo(npX + 26, npY);
    ctx.lineTo(npX, npY);
    ctx.closePath(); ctx.fill();
    // 三角斜面
    ctx.fillStyle = '#3a3a3a';
    ctx.beginPath();
    ctx.moveTo(npX, npY - 14);
    ctx.lineTo(npX + 13, npY - 20);
    ctx.lineTo(npX + 26, npY - 14);
    ctx.closePath(); ctx.fill();
    // 名字
    ctx.fillStyle = colors.accent; ctx.font = 'bold 6px sans-serif'; ctx.textAlign = 'center';
    ctx.fillText(allAgents[currentAgent]?.name?.slice(0, 6) || 'Agent', npX + 13, npY - 5);
    ctx.textAlign = 'left';
    roomItems.push({ x: npX, y: npY - 20, w: 26, h: 20, label: '桌牌', desc: '三角桌牌，展示着 Agent 的名字' });

    // ── 墙上日历 ──
    const calX = W * 0.45, calY = ceilY + 30;
    ctx.fillStyle = '#fff';
    ctx.fillRect(calX, calY, 60, 55);
    ctx.strokeStyle = '#ddd'; ctx.lineWidth = 1;
    ctx.strokeRect(calX, calY, 60, 55);
    // 日历头
    ctx.fillStyle = colors.main;
    ctx.fillRect(calX, calY, 60, 12);
    ctx.fillStyle = '#fff'; ctx.font = 'bold 7px sans-serif'; ctx.textAlign = 'center';
    ctx.fillText('MARCH 2026', calX + 30, calY + 9);
    // 日期网格
    ctx.fillStyle = '#666'; ctx.font = '5px sans-serif';
    for (let r = 0; r < 4; r++) for (let c = 0; c < 7; c++) {
      const d = r * 7 + c + 1;
      if (d <= 31) {
        ctx.fillStyle = d === 23 ? colors.accent : '#666';
        ctx.fillText('' + d, calX + 5 + c * 8, calY + 22 + r * 9);
      }
    }
    // 标记日期（圆圈）
    ctx.strokeStyle = colors.accent; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.arc(calX + 5 + 1 * 8, calY + 22 + 3 * 9 - 2, 5, 0, Math.PI * 2); ctx.stroke();
    ctx.textAlign = 'left';
    roomItems.push({ x: calX, y: calY, w: 60, h: 55, label: '日历', desc: '精确标注的日历，今天被特别圈出' });

    // ── 档案柜（靠左墙） ──
    const cabX = wL + 25, cabY = ceilY + 60;
    ctx.shadowColor = 'rgba(0,0,0,0.08)'; ctx.shadowBlur = 4; ctx.shadowOffsetX = 2;
    ctx.fillStyle = '#808080';
    ctx.fillRect(cabX, cabY, 80, floorY - cabY - 8);
    ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0; ctx.shadowOffsetX = 0;
    // 抽屉
    for (let i = 0; i < 4; i++) {
      const dy = cabY + 8 + i * 48;
      ctx.fillStyle = '#909090';
      ctx.fillRect(cabX + 4, dy, 72, 40);
      ctx.strokeStyle = '#a0a0a0'; ctx.lineWidth = 1;
      ctx.strokeRect(cabX + 4, dy, 72, 40);
      ctx.fillStyle = '#b0b0b0';
      ctx.fillRect(cabX + 30, dy + 16, 20, 6);
      // 标签
      ctx.fillStyle = '#f5f0e5';
      ctx.fillRect(cabX + 10, dy + 4, 30, 12);
      ctx.fillStyle = '#888'; ctx.font = '7px sans-serif'; ctx.textAlign = 'left';
      const labels = ['2024', '规则', '备份', '日志'];
      ctx.fillText(labels[i], cabX + 13, dy + 13);
    }
    // 文件柜顶部物品
    ctx.fillStyle = '#a09080';
    ctx.fillRect(cabX + 10, cabY - 8, 25, 8);
    ctx.fillStyle = '#c8b8a0';
    ctx.fillRect(cabX + 40, cabY - 12, 20, 12);
    roomItems.push({ x: cabX, y: cabY, w: 80, h: floorY - cabY - 8, label: '档案柜', desc: '四层档案柜，按年份和类型严格分类' });

    // ── 墙钟 ──
    const clockX = W * 0.55, clockY = ceilY + 60;
    ctx.shadowColor = 'rgba(0,0,0,0.08)'; ctx.shadowBlur = 4;
    ctx.beginPath(); ctx.arc(clockX, clockY, 30, 0, Math.PI * 2);
    ctx.fillStyle = '#f8f6f2'; ctx.fill();
    ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0;
    ctx.strokeStyle = colors.main; ctx.lineWidth = 2; ctx.stroke();
    // 刻度
    for (let i = 0; i < 12; i++) {
      const a = i * Math.PI / 6 - Math.PI / 2;
      const inner = i % 3 === 0 ? 22 : 25;
      ctx.beginPath();
      ctx.moveTo(clockX + Math.cos(a) * inner, clockY + Math.sin(a) * inner);
      ctx.lineTo(clockX + Math.cos(a) * 27, clockY + Math.sin(a) * 27);
      ctx.strokeStyle = '#555'; ctx.lineWidth = i % 3 === 0 ? 2 : 1; ctx.stroke();
    }
    // 数字
    ctx.fillStyle = '#555'; ctx.font = 'bold 6px sans-serif'; ctx.textAlign = 'center';
    [12, 3, 6, 9].forEach((n, ni) => {
      const a = ni * Math.PI / 2 - Math.PI / 2;
      ctx.fillText('' + n, clockX + Math.cos(a) * 18, clockY + Math.sin(a) * 18 + 2);
    });
    ctx.textAlign = 'left';
    // 时针分针秒针
    const ha = animFrame * 0.1 - Math.PI / 2;
    const ma = animFrame * 1.2 - Math.PI / 2;
    const sa = animFrame * 8 - Math.PI / 2;
    ctx.strokeStyle = '#333'; ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.moveTo(clockX, clockY); ctx.lineTo(clockX + Math.cos(ha) * 16, clockY + Math.sin(ha) * 16); ctx.stroke();
    ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(clockX, clockY); ctx.lineTo(clockX + Math.cos(ma) * 22, clockY + Math.sin(ma) * 22); ctx.stroke();
    // 秒针（红色细针）
    ctx.strokeStyle = '#c04040'; ctx.lineWidth = 0.8;
    ctx.beginPath(); ctx.moveTo(clockX, clockY); ctx.lineTo(clockX + Math.cos(sa) * 24, clockY + Math.sin(sa) * 24); ctx.stroke();
    ctx.fillStyle = colors.accent;
    ctx.beginPath(); ctx.arc(clockX, clockY, 3, 0, Math.PI * 2); ctx.fill();
    roomItems.push({ x: clockX - 30, y: clockY - 30, w: 60, h: 60, label: '精准挂钟', desc: '带秒针的挂钟，守护者的时间观念：准时是最基本的礼貌' });

    // ── 椅子 ──
    ctx.fillStyle = '#3a3a3a';
    ctx.fillRect(deskX + 85, floorY - 40, 50, 5);
    ctx.fillRect(deskX + 85, floorY - 35, 50, 30);
    ctx.fillStyle = '#555';
    ctx.fillRect(deskX + 87, floorY - 33, 46, 26);

    drawPoster(wR - 120, ceilY + 30, 60, 80, colors);
  }

  // ── SP 探索者房间：创意工坊 ──
  function drawSPRoom(W, H, floorY, ceilY, wL, wR, colors, ocean, skills) {
    // ── 工具台（宽大） ──
    const tbX = W * 0.15, tbY = floorY;
    ctx.fillStyle = 'rgba(0,0,0,0.04)';
    ctx.fillRect(tbX + 3, tbY - 64, 260, 4);
    ctx.fillStyle = '#8b7b6b';
    ctx.fillRect(tbX, tbY - 70, 260, 10);
    ctx.fillStyle = 'rgba(255,255,255,0.04)';
    ctx.fillRect(tbX + 2, tbY - 70, 256, 3);
    ctx.fillStyle = '#7b6b5b';
    ctx.fillRect(tbX, tbY - 60, 8, 60);
    ctx.fillRect(tbX + 252, tbY - 60, 8, 60);
    ctx.fillRect(tbX + 126, tbY - 60, 8, 60);

    // ── 工具台上的零散物品 ──
    // 笔记本（打开的）
    ctx.fillStyle = '#f0e8d8';
    ctx.save(); ctx.translate(tbX + 30, tbY - 80); ctx.rotate(-0.1);
    ctx.fillRect(0, 0, 50, 35);
    ctx.fillRect(52, 0, 50, 35);
    // 笔记内容
    ctx.fillStyle = '#bbb'; ctx.font = '4px sans-serif';
    for (let ni = 0; ni < 5; ni++) {
      ctx.fillRect(4, 6 + ni * 5, 30 + (ni * 7) % 15, 0.5);
    }
    ctx.restore();
    // 笔
    ctx.strokeStyle = colors.accent; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(tbX + 90, tbY - 78); ctx.lineTo(tbX + 110, tbY - 90); ctx.stroke();

    // ── Arduino / 电路板（闪烁 LED） ──
    const ardX = tbX + 140, ardY = tbY - 92;
    ctx.fillStyle = '#1a6b4a';
    ctx.fillRect(ardX, ardY, 40, 28);
    // PCB 纹路
    ctx.strokeStyle = 'rgba(100,200,150,0.3)'; ctx.lineWidth = 0.5;
    ctx.beginPath(); ctx.moveTo(ardX + 5, ardY + 5); ctx.lineTo(ardX + 20, ardY + 5); ctx.lineTo(ardX + 20, ardY + 15); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(ardX + 25, ardY + 8); ctx.lineTo(ardX + 35, ardY + 8); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(ardX + 10, ardY + 18); ctx.lineTo(ardX + 30, ardY + 18); ctx.lineTo(ardX + 30, ardY + 24); ctx.stroke();
    // IC 芯片
    ctx.fillStyle = '#1a1a1a';
    ctx.fillRect(ardX + 12, ardY + 10, 16, 8);
    // LED（闪烁）
    const led1 = Math.sin(animFrame * 3) > 0;
    const led2 = Math.sin(animFrame * 2 + 1) > 0;
    const led3 = Math.sin(animFrame * 4 + 2) > 0;
    ctx.fillStyle = led1 ? '#ff3030' : '#4a2020';
    ctx.beginPath(); ctx.arc(ardX + 8, ardY + 24, 2, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = led2 ? '#30ff30' : '#204a20';
    ctx.beginPath(); ctx.arc(ardX + 15, ardY + 24, 2, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = led3 ? '#3080ff' : '#20204a';
    ctx.beginPath(); ctx.arc(ardX + 22, ardY + 24, 2, 0, Math.PI * 2); ctx.fill();
    // LED 辉光
    if (led1) { ctx.fillStyle = 'rgba(255,48,48,0.15)'; ctx.beginPath(); ctx.arc(ardX + 8, ardY + 24, 6, 0, Math.PI * 2); ctx.fill(); }
    if (led2) { ctx.fillStyle = 'rgba(48,255,48,0.15)'; ctx.beginPath(); ctx.arc(ardX + 15, ardY + 24, 6, 0, Math.PI * 2); ctx.fill(); }
    if (led3) { ctx.fillStyle = 'rgba(48,128,255,0.15)'; ctx.beginPath(); ctx.arc(ardX + 22, ardY + 24, 6, 0, Math.PI * 2); ctx.fill(); }
    // 排针
    ctx.fillStyle = '#c0c0c0';
    for (let pi = 0; pi < 8; pi++) ctx.fillRect(ardX + 3 + pi * 4.5, ardY, 1.5, 3);
    for (let pi = 0; pi < 8; pi++) ctx.fillRect(ardX + 3 + pi * 4.5, ardY + 25, 1.5, 3);
    // 连接线
    ctx.strokeStyle = '#e05040'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(ardX + 40, ardY + 10); ctx.quadraticCurveTo(ardX + 55, ardY + 5, ardX + 60, ardY + 15); ctx.stroke();
    ctx.strokeStyle = '#333'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(ardX + 40, ardY + 20); ctx.quadraticCurveTo(ardX + 50, ardY + 25, ardX + 55, ardY + 20); ctx.stroke();
    roomItems.push({ x: ardX, y: ardY, w: 60, h: 28, label: 'Arduino 电路板', desc: '三色 LED 交替闪烁的原型电路板' });

    // 原型模型（小方块组）
    const protoX = tbX + 210;
    ctx.fillStyle = colors.accent;
    ctx.fillRect(protoX, tbY - 95, 20, 20);
    ctx.fillStyle = colors.main;
    ctx.fillRect(protoX + 22, tbY - 88, 15, 15);
    ctx.fillStyle = '#c0b0a0';
    ctx.fillRect(protoX + 8, tbY - 110, 12, 12);
    roomItems.push({ x: tbX, y: tbY - 110, w: 260, h: 50, label: '创意工作台', desc: '散落着笔记、电路板、原型和工具的混乱创意空间' });

    // ── 散落工具（地板上） ──
    // 扳手
    ctx.strokeStyle = '#888'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(tbX + 40, floorY + 15); ctx.lineTo(tbX + 65, floorY + 10); ctx.stroke();
    ctx.beginPath(); ctx.arc(tbX + 68, floorY + 9, 4, 0, Math.PI * 2); ctx.strokeStyle = '#888'; ctx.lineWidth = 1.5; ctx.stroke();
    // 螺丝刀
    ctx.fillStyle = '#e08040';
    ctx.save(); ctx.translate(tbX + 100, floorY + 18); ctx.rotate(0.2);
    ctx.fillRect(-3, -2, 16, 4);
    ctx.fillStyle = '#888';
    ctx.fillRect(13, -1, 12, 2);
    ctx.restore();
    // 卷尺
    ctx.fillStyle = '#f0c030';
    ctx.beginPath(); ctx.arc(tbX + 160, floorY + 14, 6, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#e0b020';
    ctx.beginPath(); ctx.arc(tbX + 160, floorY + 14, 3, 0, Math.PI * 2); ctx.fill();

    // ── 涂鸦灵感墙（更丰富） ──
    const grafX = wL + 20, grafY = ceilY + 30;
    ctx.fillStyle = '#3a3a3a';
    ctx.fillRect(grafX, grafY, 180, 130);
    // 涂鸦内容
    const doodleColors = [colors.accent, '#e57373', '#64b5f6', '#81c784', '#ffb74d', colors.main];
    ctx.lineWidth = 2;
    for (let i = 0; i < 12; i++) {
      ctx.strokeStyle = doodleColors[i % doodleColors.length];
      ctx.beginPath();
      const sx = grafX + 10 + (i * 17) % 160;
      const sy = grafY + 10 + (i * 13) % 110;
      ctx.moveTo(sx, sy);
      ctx.quadraticCurveTo(sx + 15 + (i * 5) % 20, sy - 10 - (i * 3) % 15, sx + 30 + (i * 7) % 25, sy + 5);
      ctx.stroke();
    }
    // 小图案：星星
    ctx.fillStyle = '#ffb74d';
    const starX = grafX + 140, starY = grafY + 30;
    ctx.beginPath();
    for (let si = 0; si < 5; si++) {
      const a = si * Math.PI * 2 / 5 - Math.PI / 2;
      const r = si % 2 === 0 ? 8 : 4;
      if (si === 0) ctx.moveTo(starX + Math.cos(a) * 8, starY + Math.sin(a) * 8);
      ctx.lineTo(starX + Math.cos(a + Math.PI / 5) * 4, starY + Math.sin(a + Math.PI / 5) * 4);
      ctx.lineTo(starX + Math.cos(a + Math.PI * 2 / 5) * 8, starY + Math.sin(a + Math.PI * 2 / 5) * 8);
    }
    ctx.fill();
    // 小图案：灯泡
    ctx.strokeStyle = '#fff9c4'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(grafX + 50, grafY + 100, 8, 0, Math.PI * 2); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(grafX + 46, grafY + 108); ctx.lineTo(grafX + 46, grafY + 114); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(grafX + 54, grafY + 108); ctx.lineTo(grafX + 54, grafY + 114); ctx.stroke();
    // 便利贴（6张，更随机角度）
    const noteColors = ['#fff9c4', '#c8e6c9', '#bbdefb', '#f8bbd0', '#ffe0b2', '#d1c4e9'];
    const notes = ['Hack it!', 'MVP first', 'Try this', 'Why not?', 'Ship it!', '10x better'];
    for (let i = 0; i < 6; i++) {
      ctx.fillStyle = noteColors[i];
      const nx = grafX + 8 + (i % 3) * 58, ny = grafY + 8 + Math.floor(i / 3) * 65;
      const noteAngle = ((i * 17 + 5) % 20 - 10) * 0.01;
      ctx.save(); ctx.translate(nx, ny); ctx.rotate(noteAngle);
      ctx.fillRect(0, 0, 48, 42);
      // 便签阴影折角
      ctx.fillStyle = 'rgba(0,0,0,0.05)';
      ctx.beginPath(); ctx.moveTo(36, 0); ctx.lineTo(48, 0); ctx.lineTo(48, 12); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#555'; ctx.font = '7px sans-serif'; ctx.textAlign = 'left';
      ctx.fillText(notes[i], 4, 18);
      ctx.restore();
    }
    roomItems.push({ x: grafX, y: grafY, w: 180, h: 130, label: '涂鸦灵感墙', desc: '六张便利贴 + 涂鸦覆盖的创意墙，充满活力' });

    // ── 世界地图（墙上） ──
    const mapX = wL + 210, mapY = ceilY + 30;
    ctx.fillStyle = '#e8e4d8';
    ctx.fillRect(mapX, mapY, 100, 60);
    ctx.strokeStyle = '#c8b8a0'; ctx.lineWidth = 1;
    ctx.strokeRect(mapX, mapY, 100, 60);
    // 大陆色块（简化）
    ctx.fillStyle = 'rgba(120,160,100,0.3)';
    // 北美
    ctx.beginPath(); ctx.ellipse(mapX + 22, mapY + 20, 12, 10, -0.2, 0, Math.PI * 2); ctx.fill();
    // 南美
    ctx.beginPath(); ctx.ellipse(mapX + 28, mapY + 38, 6, 10, 0.1, 0, Math.PI * 2); ctx.fill();
    // 欧洲/非洲
    ctx.beginPath(); ctx.ellipse(mapX + 52, mapY + 22, 8, 8, 0, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(mapX + 52, mapY + 38, 6, 10, 0, 0, Math.PI * 2); ctx.fill();
    // 亚洲
    ctx.beginPath(); ctx.ellipse(mapX + 74, mapY + 22, 14, 10, 0, 0, Math.PI * 2); ctx.fill();
    // 澳洲
    ctx.beginPath(); ctx.ellipse(mapX + 82, mapY + 44, 6, 4, 0, 0, Math.PI * 2); ctx.fill();
    // 图钉（标记去过的地方）
    const pinLocs = [[20, 18], [50, 20], [72, 24], [80, 42], [30, 40]];
    pinLocs.forEach(([px, py]) => {
      ctx.fillStyle = '#e05040';
      ctx.beginPath(); ctx.arc(mapX + px, mapY + py, 2.5, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#c04030';
      ctx.beginPath(); ctx.arc(mapX + px, mapY + py, 1, 0, Math.PI * 2); ctx.fill();
    });
    roomItems.push({ x: mapX, y: mapY, w: 100, h: 60, label: '世界地图', desc: '标满红色图钉的地图，记录探索者的足迹' });

    // ── 窗台望远镜 ──
    const telX = wR - 120, telY = ceilY + 50 + 130;
    ctx.fillStyle = '#555';
    // 三脚架
    ctx.strokeStyle = '#666'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(telX, telY - 20); ctx.lineTo(telX - 10, telY + 6); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(telX, telY - 20); ctx.lineTo(telX + 12, telY + 6); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(telX, telY - 20); ctx.lineTo(telX + 2, telY + 6); ctx.stroke();
    // 镜筒
    ctx.fillStyle = '#4a4a4a';
    ctx.save(); ctx.translate(telX, telY - 20); ctx.rotate(-0.4);
    ctx.fillRect(-4, -28, 8, 28);
    // 目镜
    ctx.fillStyle = '#333';
    ctx.fillRect(-5, -2, 10, 4);
    // 物镜
    ctx.fillStyle = '#8ab8d8';
    ctx.beginPath(); ctx.ellipse(0, -28, 4, 4, 0, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
    roomItems.push({ x: telX - 15, y: telY - 50, w: 30, h: 56, label: '望远镜', desc: '对准窗外的望远镜，探索者永远在观察远方' });

    // ── 角落背包 + 登山杖 ──
    const bpX = wR - 65, bpY = floorY;
    // 背包
    ctx.fillStyle = '#5a7a5a';
    ctx.beginPath();
    ctx.moveTo(bpX - 12, bpY);
    ctx.lineTo(bpX - 14, bpY - 32);
    ctx.quadraticCurveTo(bpX, bpY - 40, bpX + 14, bpY - 32);
    ctx.lineTo(bpX + 12, bpY);
    ctx.closePath(); ctx.fill();
    // 背包口袋
    ctx.fillStyle = '#4a6a4a';
    ctx.fillRect(bpX - 8, bpY - 18, 16, 12);
    ctx.strokeStyle = '#6a8a6a'; ctx.lineWidth = 0.5;
    ctx.strokeRect(bpX - 8, bpY - 18, 16, 12);
    // 背包扣
    ctx.fillStyle = '#c0a880';
    ctx.fillRect(bpX - 2, bpY - 22, 4, 4);
    // 登山杖
    ctx.strokeStyle = '#a09080'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(bpX + 20, bpY); ctx.lineTo(bpX + 16, bpY - 60); ctx.stroke();
    ctx.fillStyle = '#555';
    ctx.beginPath(); ctx.arc(bpX + 16, bpY - 62, 3, 0, Math.PI * 2); ctx.fill();
    // 杖尖
    ctx.fillStyle = '#888';
    ctx.beginPath(); ctx.moveTo(bpX + 20, bpY); ctx.lineTo(bpX + 18, bpY + 3); ctx.lineTo(bpX + 22, bpY + 3); ctx.closePath(); ctx.fill();
    roomItems.push({ x: bpX - 15, y: bpY - 62, w: 40, h: 65, label: '背包和登山杖', desc: '随时准备出发的装备，探索者的标配' });

    // ── 滑板（靠墙） ──
    ctx.fillStyle = '#8b6050';
    ctx.save(); ctx.translate(wR - 45, floorY - 5); ctx.rotate(-0.3);
    ctx.fillRect(-30, -4, 60, 8);
    // 滑板图案
    ctx.fillStyle = colors.accent;
    ctx.beginPath(); ctx.arc(-5, 0, 6, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#555';
    ctx.beginPath(); ctx.arc(-20, 6, 5, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(20, 6, 5, 0, Math.PI * 2); ctx.fill();
    ctx.restore();

    // ── 吉他 ──
    const gtX = wR - 130, gtY = ceilY + 60;
    ctx.strokeStyle = '#8b7050'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(gtX, gtY); ctx.lineTo(gtX + 8, gtY + 100); ctx.stroke();
    // 弦
    ctx.strokeStyle = 'rgba(200,200,200,0.3)'; ctx.lineWidth = 0.3;
    for (let si = 0; si < 6; si++) {
      ctx.beginPath();
      ctx.moveTo(gtX - 1 + si * 0.4, gtY + 20);
      ctx.lineTo(gtX + 5 + si * 0.6, gtY + 95);
      ctx.stroke();
    }
    ctx.fillStyle = '#a08060';
    ctx.beginPath(); ctx.ellipse(gtX + 8, gtY + 115, 20, 25, 0, 0, Math.PI * 2); ctx.fill();
    // 音孔
    ctx.fillStyle = '#2a2a2a';
    ctx.beginPath(); ctx.arc(gtX + 8, gtY + 115, 5, 0, Math.PI * 2); ctx.fill();
    // 音孔装饰
    ctx.strokeStyle = '#c8a882'; ctx.lineWidth = 0.5;
    ctx.beginPath(); ctx.arc(gtX + 8, gtY + 115, 7, 0, Math.PI * 2); ctx.stroke();
    // 琴头
    ctx.fillStyle = '#6b5040';
    ctx.fillRect(gtX - 4, gtY - 12, 8, 14);
    // 调弦钮
    ctx.fillStyle = '#c0c0c0';
    for (let ti = 0; ti < 3; ti++) {
      ctx.beginPath(); ctx.arc(gtX - 5, gtY - 8 + ti * 4, 1.5, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(gtX + 5, gtY - 8 + ti * 4, 1.5, 0, Math.PI * 2); ctx.fill();
    }
    roomItems.push({ x: gtX - 20, y: gtY - 12, w: 50, h: 152, label: '吉他', desc: '探索者的灵魂伴侣，灵感来时就弹两下' });

    drawPoster(wL + 210, ceilY + 100, 60, 80, colors);
  }

  // ── 股市屏幕绘制（Crucix Jarvis 风格） ──
  function drawStockScreen(x, y, w, h, agentId) {
    const market = stockData.market;
    const portfolio = stockData.portfolios?.[agentId];
    if (!market || !market.sectors) return;

    ctx.save();

    // 深色面板背景
    ctx.fillStyle = 'rgba(2,4,8,0.92)';
    ctx.fillRect(x, y, w, h);
    // 边框
    ctx.strokeStyle = 'rgba(100,240,200,0.15)';
    ctx.lineWidth = 1;
    ctx.strokeRect(x, y, w, h);
    // 顶部青色线
    ctx.fillStyle = '#64f0c8';
    ctx.fillRect(x, y, w, 2);

    const px = x + 8, py = y + 14;
    ctx.font = '7px monospace';

    // 标题
    ctx.fillStyle = 'rgba(106,138,130,0.8)';
    ctx.textAlign = 'left';
    ctx.fillText('MARKET', px, py);

    // 指数
    const idxColor = market.indexChangePct >= 0 ? '#ff5f63' : '#64f0c8'; // 中国：红涨绿跌
    ctx.fillStyle = idxColor;
    ctx.font = 'bold 11px monospace';
    ctx.fillText(String(Math.round(market.indexPrice)), px, py + 14);
    ctx.font = '7px monospace';
    const arrow = market.indexChangePct >= 0 ? '\u25B2' : '\u25BC';
    ctx.fillText(arrow + ' ' + (market.indexChangePct >= 0 ? '+' : '') + market.indexChangePct.toFixed(1) + '%', px + 50, py + 14);

    // 板块列表（最多 6 个）
    const sectors = market.sectors.slice(0, 6);
    ctx.font = '6.5px monospace';
    for (let i = 0; i < sectors.length; i++) {
      const s = sectors[i];
      const sy = py + 28 + i * 12;
      const sColor = s.changePct >= 0 ? '#ff5f63' : '#64f0c8';

      // 名称
      ctx.fillStyle = 'rgba(232,244,240,0.6)';
      ctx.fillText(s.name.slice(0, 4), px, sy);

      // 涨跌
      ctx.fillStyle = sColor;
      ctx.textAlign = 'right';
      ctx.fillText((s.changePct >= 0 ? '+' : '') + s.changePct.toFixed(1) + '%', px + w - 20, sy);
      ctx.textAlign = 'left';

      // Sparkline（趋势线）
      if (s.trend && s.trend.length > 1) {
        const sparkX = px + 35, sparkW = 30, sparkH = 8;
        const sparkY = sy - 5;
        const vals = s.trend;
        const min = Math.min(...vals), max = Math.max(...vals);
        const range = max - min || 1;
        ctx.beginPath();
        ctx.strokeStyle = sColor;
        ctx.lineWidth = 0.8;
        for (let j = 0; j < vals.length; j++) {
          const sx2 = sparkX + (j / (vals.length - 1)) * sparkW;
          const sy2 = sparkY + sparkH - ((vals[j] - min) / range) * sparkH;
          if (j === 0) ctx.moveTo(sx2, sy2); else ctx.lineTo(sx2, sy2);
        }
        ctx.stroke();
      }
    }

    // 我的持仓
    if (portfolio && portfolio.holdings.length > 0) {
      const holdY = py + 28 + Math.min(sectors.length, 6) * 12 + 6;
      ctx.fillStyle = 'rgba(100,240,200,0.12)';
      ctx.fillRect(x + 2, holdY - 6, w - 4, portfolio.holdings.length * 11 + 14);

      ctx.fillStyle = '#64f0c8';
      ctx.font = '6px monospace';
      ctx.fillText('MY PORTFOLIO', px, holdY + 2);
      ctx.fillStyle = 'rgba(232,244,240,0.5)';
      ctx.font = '6px monospace';
      ctx.textAlign = 'right';
      ctx.fillText('\u00A4' + portfolio.tokens, px + w - 20, holdY + 2);
      ctx.textAlign = 'left';

      ctx.font = '6.5px monospace';
      for (let i = 0; i < Math.min(portfolio.holdings.length, 3); i++) {
        const h2 = portfolio.holdings[i];
        const hy = holdY + 14 + i * 11;
        const dirIcon = h2.direction === 'long' ? '\u25B2' : '\u25BC';
        const pnlColor = h2.pnl >= 0 ? '#ff5f63' : '#64f0c8';

        ctx.fillStyle = 'rgba(232,244,240,0.6)';
        ctx.fillText(dirIcon + ' ' + h2.sectorName.slice(0, 4), px, hy);
        ctx.fillStyle = pnlColor;
        ctx.textAlign = 'right';
        ctx.fillText((h2.pnlPct >= 0 ? '+' : '') + h2.pnlPct.toFixed(1) + '%', px + w - 20, hy);
        ctx.textAlign = 'left';
      }

      // 总盈亏
      const totalY = holdY + 14 + Math.min(portfolio.holdings.length, 3) * 11 + 2;
      const totalColor = portfolio.totalPnL >= 0 ? '#ff5f63' : '#64f0c8';
      ctx.fillStyle = totalColor;
      ctx.font = 'bold 7px monospace';
      ctx.fillText('P&L: ' + (portfolio.totalPnL >= 0 ? '+' : '') + portfolio.totalPnL, px, totalY);
    }

    // 扫描线动画
    const scanY = y + ((animFrame * 30) % h);
    ctx.fillStyle = 'rgba(100,240,200,0.04)';
    ctx.fillRect(x, scanY, w, 2);

    ctx.restore();

    roomItems.push({ x, y, w, h, label: '股市终端', desc: market.indexName + ' ' + market.indexPrice + ' (' + (market.indexChangePct >= 0 ? '+' : '') + market.indexChangePct + '%)' });
  }

  // ── 龙虾摆件绘制 ──
  function drawLobster(x, y, s) {
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(s, s);
    // 身体
    ctx.fillStyle = '#e05040';
    ctx.beginPath();
    ctx.ellipse(0, 0, 18, 10, 0, 0, Math.PI * 2);
    ctx.fill();
    // 尾巴
    ctx.beginPath();
    ctx.moveTo(16, 0);
    ctx.quadraticCurveTo(28, -5, 30, 5);
    ctx.quadraticCurveTo(28, 12, 20, 5);
    ctx.fill();
    // 钳子
    ctx.fillStyle = '#d04030';
    ctx.beginPath(); ctx.ellipse(-18, -10, 10, 6, -0.5, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(-18, 10, 10, 6, 0.5, 0, Math.PI * 2); ctx.fill();
    // 钳缝
    ctx.strokeStyle = '#b03020'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(-24, -14); ctx.lineTo(-18, -10); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(-24, 14); ctx.lineTo(-18, 10); ctx.stroke();
    // 触须
    ctx.strokeStyle = '#d04030'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(-14, -4); ctx.quadraticCurveTo(-30, -15 + Math.sin(animFrame * 2) * 3, -36, -20); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(-14, 4); ctx.quadraticCurveTo(-30, 15 + Math.sin(animFrame * 2 + 1) * 3, -36, 20); ctx.stroke();
    // 眼睛
    ctx.fillStyle = '#1a1a1a';
    ctx.beginPath(); ctx.arc(-10, -5, 2, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(-10, 5, 2, 0, Math.PI * 2); ctx.fill();
    ctx.restore();

    roomItems.push({ x: x - 25 * s, y: y - 14 * s, w: 55 * s, h: 28 * s, label: '龙虾摆件 🦞', desc: 'OpenClaw 的精神象征 — The Lobster Way' });
  }

  // ── OpenClaw 海报 ──
  function drawPoster(x, y, w, h, colors) {
    ctx.fillStyle = '#1a1a1a';
    ctx.fillRect(x, y, w, h);
    // 边框
    ctx.strokeStyle = colors.accent;
    ctx.lineWidth = 1.5;
    ctx.strokeRect(x + 3, y + 3, w - 6, h - 6);
    // 标题
    ctx.fillStyle = colors.accent;
    ctx.font = 'bold 8px sans-serif'; ctx.textAlign = 'center';
    ctx.fillText('OPENCLAW', x + w / 2, y + 20);
    // 龙虾图标（简化）
    ctx.fillStyle = '#e05040';
    ctx.beginPath(); ctx.ellipse(x + w / 2, y + h / 2 + 2, 12, 8, 0, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(x + w / 2 - 12, y + h / 2 - 5, 6, 4, -0.3, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(x + w / 2 - 12, y + h / 2 + 9, 6, 4, 0.3, 0, Math.PI * 2); ctx.fill();
    // 标语
    ctx.fillStyle = '#888'; ctx.font = '6px sans-serif';
    ctx.fillText('The Lobster Way', x + w / 2, y + h - 12);
    ctx.textAlign = 'left';

    roomItems.push({ x: x, y: y, w: w, h: h, label: 'OpenClaw 海报', desc: '"The Lobster Way" — 龙虾之道，自主独立' });
  }

  // ── 绘制技能物品 ──
  function drawSkillItems(skills, W, floorY, ceilY, colors) {
    const startX = W * 0.6;
    skills.forEach((skill, i) => {
      const obj = skillObjects[skill.domain];
      if (!obj) return;
      const ix = startX + (i % 2) * 80;
      const iy = floorY - 50 - Math.floor(i / 2) * 45;

      ctx.fillStyle = colors.accent;
      ctx.strokeStyle = colors.main;
      ctx.lineWidth = 1.5;

      if (obj.icon === 'scroll') {
        // SOUL.md 卷轴 — 展开的羊皮纸
        ctx.fillStyle = '#f0e8d0';
        ctx.fillRect(ix + 3, iy + 2, 29, 22);
        // 卷轴顶部卷边
        ctx.fillStyle = '#e0d4b8';
        ctx.beginPath(); ctx.ellipse(ix + 17, iy + 2, 16, 4, 0, 0, Math.PI * 2); ctx.fill();
        // 底部卷边
        ctx.beginPath(); ctx.ellipse(ix + 17, iy + 24, 16, 3, 0, 0, Math.PI * 2); ctx.fill();
        // 内容线
        ctx.strokeStyle = '#c8a882'; ctx.lineWidth = 0.5;
        for (let li = 0; li < 3; li++) {
          ctx.beginPath(); ctx.moveTo(ix + 7, iy + 8 + li * 5); ctx.lineTo(ix + 28, iy + 8 + li * 5); ctx.stroke();
        }
        // 封印
        ctx.fillStyle = '#c8a882';
        ctx.beginPath(); ctx.arc(ix + 28, iy + 20, 3, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = '#c8a882'; ctx.lineWidth = 1; ctx.strokeRect(ix, iy, 35, 26);
      } else if (obj.icon === 'server') {
        // 记忆服务器
        ctx.fillStyle = '#4a4a4a';
        ctx.fillRect(ix, iy, 30, 28);
        ctx.fillStyle = '#6a6a6a'; ctx.fillRect(ix + 2, iy + 2, 26, 8);
        ctx.fillRect(ix + 2, iy + 12, 26, 8);
        // HDD 线
        ctx.strokeStyle = '#888'; ctx.lineWidth = 0.5;
        ctx.beginPath(); ctx.moveTo(ix + 4, iy + 5); ctx.lineTo(ix + 15, iy + 5); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(ix + 4, iy + 15); ctx.lineTo(ix + 15, iy + 15); ctx.stroke();
        ctx.fillStyle = skill.level >= 4 ? '#4caf50' : '#ffb74d';
        ctx.beginPath(); ctx.arc(ix + 24, iy + 6, 2, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(ix + 24, iy + 16, 2, 0, Math.PI * 2); ctx.fill();
        // 活动灯闪烁
        const blinkAlpha = 0.5 + Math.sin(animFrame * 4) * 0.4;
        ctx.fillStyle = 'rgba(76,175,80,' + blinkAlpha + ')';
        ctx.beginPath(); ctx.arc(ix + 20, iy + 6, 1.5, 0, Math.PI * 2); ctx.fill();
        // 散热栅
        ctx.strokeStyle = 'rgba(100,100,100,0.5)'; ctx.lineWidth = 0.5;
        for (let vi = 0; vi < 3; vi++) {
          ctx.beginPath(); ctx.moveTo(ix + 4, iy + 23 + vi * 2); ctx.lineTo(ix + 26, iy + 23 + vi * 2); ctx.stroke();
        }
      } else if (obj.icon === 'shield') {
        // 安全盾牌 — 发光
        const shieldGlow = ctx.createRadialGradient(ix + 15, iy + 15, 2, ix + 15, iy + 15, 20);
        shieldGlow.addColorStop(0, colors.main + '20');
        shieldGlow.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = shieldGlow;
        ctx.beginPath(); ctx.arc(ix + 15, iy + 15, 20, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = colors.main;
        ctx.beginPath();
        ctx.moveTo(ix + 15, iy);
        ctx.lineTo(ix + 30, iy + 8);
        ctx.lineTo(ix + 28, iy + 25);
        ctx.lineTo(ix + 15, iy + 30);
        ctx.lineTo(ix + 2, iy + 25);
        ctx.lineTo(ix, iy + 8);
        ctx.closePath(); ctx.fill();
        // 盾牌高光
        ctx.fillStyle = 'rgba(255,255,255,0.15)';
        ctx.beginPath();
        ctx.moveTo(ix + 15, iy + 2);
        ctx.lineTo(ix + 28, iy + 10);
        ctx.lineTo(ix + 15, iy + 16);
        ctx.lineTo(ix + 3, iy + 10);
        ctx.closePath(); ctx.fill();
        ctx.fillStyle = '#fff'; ctx.font = 'bold 10px sans-serif'; ctx.textAlign = 'center';
        ctx.fillText('S', ix + 15, iy + 19); ctx.textAlign = 'left';
      } else if (obj.icon === 'chess') {
        // 策略棋盘 — 8x8 格子
        const cellSz = 3.5;
        for (let r = 0; r < 6; r++) for (let c = 0; c < 6; c++) {
          ctx.fillStyle = (r + c) % 2 === 0 ? '#e8e0d0' : '#8b7b6b';
          ctx.fillRect(ix + c * cellSz, iy + r * cellSz + 3, cellSz, cellSz);
        }
        ctx.strokeStyle = '#6b5b4b'; ctx.lineWidth = 1;
        ctx.strokeRect(ix, iy + 3, cellSz * 6, cellSz * 6);
        // 棋子
        ctx.fillStyle = '#2a2a2a';
        ctx.beginPath(); ctx.arc(ix + cellSz * 1.5, iy + cellSz * 1.5 + 3, 3, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#f0e0c0';
        ctx.beginPath(); ctx.arc(ix + cellSz * 4.5, iy + cellSz * 4.5 + 3, 3, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = colors.accent;
        ctx.beginPath(); ctx.arc(ix + cellSz * 3.5, iy + cellSz * 2.5 + 3, 3, 0, Math.PI * 2); ctx.fill();
      } else if (obj.icon === 'quill') {
        // 羽毛笔 — 倾斜的羽毛
        ctx.strokeStyle = '#8b6b4b'; ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(ix + 5, iy + 25);
        ctx.quadraticCurveTo(ix + 18, iy + 10, ix + 30, iy - 2);
        ctx.stroke();
        // 羽毛
        ctx.fillStyle = colors.accent + 'c0';
        ctx.beginPath();
        ctx.moveTo(ix + 30, iy - 2);
        ctx.quadraticCurveTo(ix + 22, iy + 5, ix + 28, iy + 15);
        ctx.quadraticCurveTo(ix + 32, iy + 5, ix + 30, iy - 2);
        ctx.fill();
        // 羽毛另一侧
        ctx.fillStyle = colors.accent + '90';
        ctx.beginPath();
        ctx.moveTo(ix + 30, iy - 2);
        ctx.quadraticCurveTo(ix + 35, iy + 3, ix + 33, iy + 12);
        ctx.quadraticCurveTo(ix + 32, iy + 5, ix + 30, iy - 2);
        ctx.fill();
        // 笔尖
        ctx.fillStyle = '#555';
        ctx.beginPath();
        ctx.moveTo(ix + 5, iy + 25);
        ctx.lineTo(ix + 3, iy + 28);
        ctx.lineTo(ix + 8, iy + 24);
        ctx.closePath(); ctx.fill();
        // 墨迹
        ctx.fillStyle = '#333';
        ctx.beginPath(); ctx.arc(ix + 3, iy + 29, 1.5, 0, Math.PI * 2); ctx.fill();
      } else if (obj.icon === 'network') {
        // 编排网络 — 连接的节点
        const netNodes = [
          [15, 4], [5, 16], [25, 16], [10, 28], [20, 28], [30, 8]
        ];
        // 连线
        ctx.strokeStyle = colors.accent + '60'; ctx.lineWidth = 0.8;
        const edges = [[0,1],[0,2],[0,5],[1,3],[2,4],[1,2],[3,4]];
        edges.forEach(([a, b]) => {
          ctx.beginPath();
          ctx.moveTo(ix + netNodes[a][0], iy + netNodes[a][1]);
          ctx.lineTo(ix + netNodes[b][0], iy + netNodes[b][1]);
          ctx.stroke();
        });
        // 节点
        netNodes.forEach(([nx, ny], ni) => {
          const isActive = Math.sin(animFrame * 2 + ni) > 0.3;
          ctx.fillStyle = ni === 0 ? colors.main : (isActive ? colors.accent : colors.accent + '60');
          ctx.beginPath(); ctx.arc(ix + nx, iy + ny, ni === 0 ? 4 : 3, 0, Math.PI * 2); ctx.fill();
        });
        // 脉冲（数据流动）
        const pulsePos = (animFrame * 0.5) % 1;
        ctx.fillStyle = 'rgba(255,255,255,0.6)';
        const pa = netNodes[0], pb = netNodes[2];
        ctx.beginPath();
        ctx.arc(ix + pa[0] + (pb[0] - pa[0]) * pulsePos, iy + pa[1] + (pb[1] - pa[1]) * pulsePos, 1.5, 0, Math.PI * 2);
        ctx.fill();
      } else if (obj.icon === 'antenna') {
        // 信号塔
        // 塔身
        ctx.fillStyle = '#666';
        ctx.beginPath();
        ctx.moveTo(ix + 13, iy + 28);
        ctx.lineTo(ix + 15, iy + 4);
        ctx.lineTo(ix + 20, iy + 4);
        ctx.lineTo(ix + 22, iy + 28);
        ctx.closePath(); ctx.fill();
        // 横梁
        ctx.strokeStyle = '#888'; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(ix + 10, iy + 10); ctx.lineTo(ix + 25, iy + 10); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(ix + 11, iy + 18); ctx.lineTo(ix + 24, iy + 18); ctx.stroke();
        // 信号波
        const sigAlpha = 0.2 + Math.sin(animFrame * 3) * 0.15;
        ctx.strokeStyle = 'rgba(' + hexToRgb(colors.accent).r + ',' + hexToRgb(colors.accent).g + ',' + hexToRgb(colors.accent).b + ',' + sigAlpha + ')';
        ctx.lineWidth = 1;
        for (let si = 1; si <= 3; si++) {
          ctx.beginPath();
          ctx.arc(ix + 17, iy + 4, si * 5, -Math.PI * 0.7, -Math.PI * 0.3);
          ctx.stroke();
          ctx.beginPath();
          ctx.arc(ix + 17, iy + 4, si * 5, Math.PI * 0.3, Math.PI * 0.7);
          ctx.stroke();
        }
        // 顶部灯
        const antLed = 0.5 + Math.sin(animFrame * 2) * 0.4;
        ctx.fillStyle = 'rgba(255,60,60,' + antLed + ')';
        ctx.beginPath(); ctx.arc(ix + 17, iy + 2, 2, 0, Math.PI * 2); ctx.fill();
      } else if (obj.icon === 'gear') {
        // 齿轮 — 带缓慢旋转
        ctx.save();
        ctx.translate(ix + 15, iy + 15);
        ctx.rotate(animFrame * 0.5);
        const teeth = 8, outerR = 13, innerR = 9, toothH = 3;
        ctx.fillStyle = colors.main;
        ctx.beginPath();
        for (let t = 0; t < teeth; t++) {
          const a1 = t * Math.PI * 2 / teeth;
          const a2 = a1 + Math.PI / teeth * 0.5;
          const a3 = a1 + Math.PI / teeth;
          const a4 = a1 + Math.PI / teeth * 1.5;
          ctx.lineTo(Math.cos(a1) * outerR, Math.sin(a1) * outerR);
          ctx.lineTo(Math.cos(a2) * (outerR + toothH), Math.sin(a2) * (outerR + toothH));
          ctx.lineTo(Math.cos(a3) * (outerR + toothH), Math.sin(a3) * (outerR + toothH));
          ctx.lineTo(Math.cos(a4) * outerR, Math.sin(a4) * outerR);
        }
        ctx.closePath(); ctx.fill();
        // 内圈
        ctx.fillStyle = '#555';
        ctx.beginPath(); ctx.arc(0, 0, innerR - 3, 0, Math.PI * 2); ctx.fill();
        // 中心轴
        ctx.fillStyle = colors.accent;
        ctx.beginPath(); ctx.arc(0, 0, 3, 0, Math.PI * 2); ctx.fill();
        ctx.restore();
      } else if (obj.icon === 'plug') {
        // 多端口接口板
        ctx.fillStyle = '#4a4a4a';
        ctx.fillRect(ix, iy, 34, 26);
        ctx.strokeStyle = '#5a5a5a'; ctx.lineWidth = 0.5;
        ctx.strokeRect(ix, iy, 34, 26);
        // 端口（3x2）
        const portColors = ['#4caf50', '#ffb74d', '#64b5f6', colors.accent, '#e57373', '#81c784'];
        for (let pr = 0; pr < 2; pr++) for (let pc = 0; pc < 3; pc++) {
          const px = ix + 4 + pc * 10, py = iy + 4 + pr * 12;
          ctx.fillStyle = '#2a2a2a';
          ctx.fillRect(px, py, 7, 8);
          // 端口内亮灯
          const isConnected = (pr * 3 + pc) < skill.level;
          ctx.fillStyle = isConnected ? portColors[pr * 3 + pc] : '#3a3a3a';
          ctx.fillRect(px + 1, py + 1, 5, 2);
        }
        // 连线
        ctx.strokeStyle = '#666'; ctx.lineWidth = 0.8;
        ctx.beginPath(); ctx.moveTo(ix + 34, iy + 8); ctx.lineTo(ix + 38, iy + 6); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(ix + 34, iy + 18); ctx.lineTo(ix + 40, iy + 20); ctx.stroke();
      } else if (obj.icon === 'wand') {
        // 发光魔杖
        ctx.strokeStyle = '#6b5040'; ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.moveTo(ix + 5, iy + 28);
        ctx.lineTo(ix + 28, iy + 5);
        ctx.stroke();
        // 手柄
        ctx.strokeStyle = '#8b7060'; ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(ix + 5, iy + 28);
        ctx.lineTo(ix + 12, iy + 21);
        ctx.stroke();
        // 发光顶端
        const wandGlow = ctx.createRadialGradient(ix + 28, iy + 5, 0, ix + 28, iy + 5, 12);
        const wandAlpha = 0.4 + Math.sin(animFrame * 2) * 0.2;
        wandGlow.addColorStop(0, 'rgba(255,220,100,' + wandAlpha + ')');
        wandGlow.addColorStop(0.5, 'rgba(255,200,80,' + (wandAlpha * 0.4) + ')');
        wandGlow.addColorStop(1, 'rgba(255,200,80,0)');
        ctx.fillStyle = wandGlow;
        ctx.beginPath(); ctx.arc(ix + 28, iy + 5, 12, 0, Math.PI * 2); ctx.fill();
        // 星点
        ctx.fillStyle = 'rgba(255,240,180,0.8)';
        ctx.beginPath(); ctx.arc(ix + 28, iy + 5, 3, 0, Math.PI * 2); ctx.fill();
        // 粒子
        for (let pi = 0; pi < 3; pi++) {
          const pa = animFrame * 2 + pi * 2.1;
          const pr = 6 + Math.sin(pa) * 3;
          ctx.fillStyle = 'rgba(255,220,100,' + (0.3 + Math.sin(pa + 1) * 0.2) + ')';
          ctx.beginPath();
          ctx.arc(ix + 28 + Math.cos(pa) * pr, iy + 5 + Math.sin(pa) * pr, 1.2, 0, Math.PI * 2);
          ctx.fill();
        }
      } else {
        // 通用物品
        ctx.fillStyle = colors.accent + '80';
        ctx.fillRect(ix, iy, 30, 25);
        ctx.strokeStyle = colors.main; ctx.lineWidth = 1;
        ctx.strokeRect(ix, iy, 30, 25);
        ctx.fillStyle = '#555'; ctx.font = '6px sans-serif';
        ctx.fillText(skill.name.slice(0, 4), ix + 2, iy + 15);
      }

      // 等级星星
      ctx.fillStyle = '#c8a882';
      ctx.font = '7px sans-serif';
      ctx.fillText('\u2605'.repeat(skill.level), ix, iy + 38);

      roomItems.push({ x: ix, y: iy, w: 35, h: 30, label: obj.label, desc: obj.desc + ' (Lv.' + skill.level + ')' });
    });
  }

  // ── 打开房间 ──
  function openRoom(idx) {
    if (idx < 0 || idx >= allAgents.length) return;
    currentAgent = idx;
    const agent = allAgents[idx];

    // 更新 header
    document.getElementById('room-avatar').style.background = agent.color.main;
    document.getElementById('room-avatar').textContent = agent.name.charAt(0);
    document.getElementById('room-name').textContent = agent.name + ' 的龙虾屋';
    document.getElementById('room-meta').textContent = agent.role + ' · ' + agent.archetype;
    document.getElementById('room-badge').textContent = agent.mbti;

    // 更新技能标签
    const skillsEl = document.getElementById('room-skills');
    let skillsHtml = allSkills[idx].map(s =>
      '<div class="room-skill-tag"><div class="room-skill-dot" style="background:' +
      (s.level >= 4 ? '#c8a882' : '#bbb') + '"></div>' +
      s.name + ' Lv.' + s.level + '</div>'
    ).join('');
    // 管理模式下给 Agent 房间也加商店按钮
    if (window.__adminMode) {
      skillsHtml += '<div class="room-skill-tag" id="agent-room-shop-btn" style="border-color:#c8a882;color:#c8a882;cursor:pointer">\ud83d\udecd\ufe0f \u5546\u5e97</div>';
      setTimeout(() => {
        const btn = document.getElementById('agent-room-shop-btn');
        if (btn) btn.addEventListener('click', () => {
          // 用 Agent ID 打开商店
          if (window.__openShop) window.__openShop({ id: allAgents[idx].id, name: allAgents[idx].name });
        });
      }, 100);
    }
    skillsEl.innerHTML = skillsHtml;

    // 先显示模态框，再测量尺寸（display:none 时 offsetWidth 为 0）
    modal.style.display = 'flex';

    // 等一帧让布局生效后再设置 canvas
    requestAnimationFrame(() => {
      modal.classList.add('open');

      const container = canvas.parentElement;
      const dpr = window.devicePixelRatio || 1;
      const cw = container.offsetWidth || 900;
      const ch = container.offsetHeight || 620;
      canvas.width = cw * dpr;
      canvas.height = ch * dpr;
      canvas.style.width = cw + 'px';
      canvas.style.height = ch + 'px';
      ctx.setTransform(1, 0, 0, 1, 0, 0); // 重置变换
      ctx.scale(dpr, dpr);

      // 开始动画
      animFrame = 0;
      function animateRoom() {
        drawRoom(idx);
        const logW = canvas.width / (window.devicePixelRatio || 1);
        const logH = canvas.height / (window.devicePixelRatio || 1);
        drawSkillItems(allSkills[idx], logW, logH * 0.65, logH * 0.08, allAgents[idx].color);
        roomAnimId = requestAnimationFrame(animateRoom);
      }
      animateRoom();
    });
  }

  // ── 关闭房间 ──
  function closeRoom() {
    modal.classList.remove('open');
    setTimeout(() => { modal.style.display = 'none'; }, 400);
    if (roomAnimId) { cancelAnimationFrame(roomAnimId); roomAnimId = null; }
    currentAgent = -1;
    // 清理家具交互状态
    window.__userRoomData = null;
    window.__userRoomUserId = null;
    placingMode = false; placingItemId = null;
    draggingFurniture = -1; selectedFurniture = -1;
    // 关闭商店面板
    const sp = document.getElementById('shop-panel');
    if (sp) sp.style.display = 'none';
  }

  // 关闭按钮
  document.getElementById('room-close').addEventListener('click', closeRoom);
  modal.addEventListener('click', (e) => { if (e.target === modal) closeRoom(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && currentAgent >= 0) closeRoom(); });

  // Canvas 悬停提示
  const roomTooltip = document.createElement('div');
  roomTooltip.className = 'map-tooltip';
  roomTooltip.innerHTML = '<div class="tt-name"></div><div class="tt-role"></div>';
  document.querySelector('.room-container').appendChild(roomTooltip);

  canvas.addEventListener('mousemove', (e) => {
    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left, my = e.clientY - rect.top;
    let found = -1;
    for (let i = 0; i < roomItems.length; i++) {
      const it = roomItems[i];
      if (mx >= it.x && mx <= it.x + it.w && my >= it.y && my <= it.y + it.h) { found = i; break; }
    }
    if (found >= 0 && found !== hoveredItem) {
      hoveredItem = found;
      roomTooltip.querySelector('.tt-name').textContent = roomItems[found].label;
      roomTooltip.querySelector('.tt-role').textContent = roomItems[found].desc;
      roomTooltip.style.left = (e.clientX - rect.left + 12) + 'px';
      roomTooltip.style.top = (e.clientY - rect.top - 8) + 'px';
      roomTooltip.style.opacity = '1';
      canvas.style.cursor = 'pointer';
    } else if (found >= 0) {
      roomTooltip.style.left = (e.clientX - rect.left + 12) + 'px';
      roomTooltip.style.top = (e.clientY - rect.top - 8) + 'px';
    } else if (found < 0 && hoveredItem >= 0) {
      hoveredItem = -1;
      roomTooltip.style.opacity = '0';
      canvas.style.cursor = 'default';
    }
  });

  // 暴露 openRoom 给地图引擎调用
  window.__openRoom = openRoom;

  // ── 人类用户房间（从服务器加载家具/宠物数据） ──
  window.__openUserRoom = async function(user) {
    if (!user || !user.id) return;
    const SERVER = (window.__serverUrl || window.location.origin);

    // 设置房间 header 为暗红色主题
    document.getElementById('room-avatar').style.background = '#8b2020';
    document.getElementById('room-avatar').textContent = (user.name || '?').charAt(0);
    document.getElementById('room-name').textContent = (user.name || '???') + ' \u7684\u9f99\u867e\u5c4b';
    document.getElementById('room-meta').textContent = (user.role || '\u5c0f\u9547\u5c45\u6c11') + ' \u00b7 \u4eba\u7c7b\u7528\u6237';
    document.getElementById('room-badge').textContent = user.mbti || 'ENFP';
    document.getElementById('room-badge').style.borderColor = '#8b2020';
    document.getElementById('room-badge').style.color = '#8b2020';

    // 加载用户房间数据
    let roomData = { furniture: [], pets: [] };
    let walletData = { balance: 0 };
    try {
      const [roomResp, walletResp] = await Promise.all([
        fetch(SERVER + '/api/room/' + user.id).then(r => r.ok ? r.json() : null),
        fetch(SERVER + '/api/wallet/' + user.id).then(r => r.ok ? r.json() : null),
      ]);
      if (roomResp) {
        const serverRoom = roomResp.room || roomData;
        // 如果前端已有房间数据（用户没关闭页面），保留前端的家具位置
        // 只有首次加载或家具数量变化时才用服务端数据
        const existing = window.__userRoomData;
        if (existing && existing.furniture && existing.furniture.length === serverRoom.furniture?.length) {
          // 家具数量没变 — 保留前端位置（用户可能已拖拽过）
          roomData = existing;
          // 同步宠物数据（宠物不涉及位置）
          if (serverRoom.pets) roomData.pets = serverRoom.pets;
        } else {
          // 首次加载或家具数量变了 — 用服务端数据
          roomData = serverRoom;
        }
      }
      window.__userRoomData = roomData;
      window.__userRoomUserId = user.id;
      if (walletResp) walletData = walletResp;
    } catch {}

    // 显示技能区改为显示房间信息（家具+宠物+钱包）
    const skillsEl = document.getElementById('room-skills');
    let infoHtml = '<div class="room-skill-tag"><div class="room-skill-dot" style="background:#c8a882"></div>\ud83d\udcb0 ' + (walletData.balance || 0) + ' Token</div>';
    infoHtml += '<div class="room-skill-tag"><div class="room-skill-dot" style="background:#8b2020"></div>\ud83c\udfe0 \u5bb6\u5177 ' + (roomData.furniture?.length || 0) + ' \u4ef6</div>';
    infoHtml += '<div class="room-skill-tag"><div class="room-skill-dot" style="background:#c43030"></div>\ud83e\udda2 \u5ba0\u7269 ' + (roomData.pets?.length || 0) + ' \u53ea</div>';
    if (roomData.pets && roomData.pets.length > 0) {
      for (const pet of roomData.pets) {
        infoHtml += '<div class="room-skill-tag"><div class="room-skill-dot" style="background:' + (pet.color || '#e05040') + '"></div>' + (pet.name || pet.petId) + '</div>';
      }
    }
    if (roomData.furniture && roomData.furniture.length > 0) {
      for (const f of roomData.furniture.slice(0, 6)) {
        infoHtml += '<div class="room-skill-tag"><div class="room-skill-dot" style="background:#888"></div>' + (f.itemId || '\u5bb6\u5177') + '</div>';
      }
    }
    // 商店入口按钮
    infoHtml += '<div class="room-skill-tag" id="user-room-shop-btn" style="border-color:#c8a882;color:#c8a882;cursor:pointer">\ud83d\udecd\ufe0f \u5546\u5e97</div>';
    setTimeout(() => {
      const shopBtn = document.getElementById('user-room-shop-btn');
      if (shopBtn) shopBtn.addEventListener('click', () => openShopPanel(user));
    }, 100);
    skillsEl.innerHTML = infoHtml;

    // 显示模态框
    modal.style.display = 'flex';
    requestAnimationFrame(() => {
      modal.classList.add('open');
      const container = canvas.parentElement;
      const dpr = window.devicePixelRatio || 1;
      const cw = container.offsetWidth || 900;
      const ch = container.offsetHeight || 620;
      canvas.width = cw * dpr;
      canvas.height = ch * dpr;
      canvas.style.width = cw + 'px';
      canvas.style.height = ch + 'px';
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.scale(dpr, dpr);

      // 绘制用户房间（暖色调，与 Agent 房间风格一致）
      animFrame = 0;

      // 家具立面图绘制器
      function drawFurnitureElevation(fx, fy, f, logW, logH) {
        const id = f.itemId || '';
        ctx.save();
        // 沙发（立面图）
        if (id.includes('sofa')) {
          const w = 80, h = 50;
          ctx.fillStyle = '#8b7b6b'; ctx.fillRect(fx, fy, w, h); // 坐垫
          ctx.fillStyle = '#7a6a5a'; ctx.fillRect(fx, fy - 20, w, 22); // 靠背
          ctx.fillStyle = '#6b5b4b'; ctx.fillRect(fx - 8, fy - 10, 10, h + 10); ctx.fillRect(fx + w - 2, fy - 10, 10, h + 10); // 扶手
          ctx.fillStyle = '#5a4a3a'; ctx.fillRect(fx + 5, fy + h, 8, 12); ctx.fillRect(fx + w - 13, fy + h, 8, 12); // 腿
          // 靠垫
          ctx.fillStyle = '#c8a882'; ctx.beginPath(); ctx.ellipse(fx + 22, fy + 10, 14, 18, 0, 0, Math.PI * 2); ctx.fill();
          ctx.beginPath(); ctx.ellipse(fx + w - 22, fy + 10, 14, 18, 0, 0, Math.PI * 2); ctx.fill();
        }
        // 书桌
        else if (id.includes('desk')) {
          const w = 90, h = 35;
          ctx.fillStyle = '#6b5b4b'; ctx.fillRect(fx, fy, w, h); // 桌面
          ctx.fillStyle = '#5a4a3a'; ctx.fillRect(fx + 5, fy + h, 8, 30); ctx.fillRect(fx + w - 13, fy + h, 8, 30); // 桌腿
          ctx.fillStyle = '#4a3a2a'; ctx.fillRect(fx + 2, fy + h - 2, 35, 20); // 抽屉
          ctx.strokeStyle = '#c8a882'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(fx + 12, fy + h + 6); ctx.lineTo(fx + 25, fy + h + 6); ctx.stroke(); // 把手
        }
        // 书架
        else if (id.includes('bookshelf') || id.includes('shelf')) {
          const w = 50, h = 100;
          ctx.fillStyle = '#7b6555'; ctx.fillRect(fx, fy, w, h); // 框架
          ctx.fillStyle = '#6a5545'; for (let i = 1; i < 4; i++) ctx.fillRect(fx + 2, fy + i * 25, w - 4, 3); // 隔板
          // 书本
          const bookColors = ['#c85050', '#5080c8', '#50a060', '#c8a040', '#8060a0'];
          for (let row = 0; row < 3; row++) { for (let b = 0; b < 4; b++) { ctx.fillStyle = bookColors[(row * 4 + b) % 5]; ctx.fillRect(fx + 5 + b * 11, fy + 5 + row * 25, 8, 20); } }
        }
        // 茶几
        else if (id.includes('coffee') || id.includes('table')) {
          const w = 50, h = 25;
          ctx.fillStyle = '#8b7b6b'; ctx.fillRect(fx, fy, w, h);
          ctx.fillStyle = '#6b5b4b'; ctx.fillRect(fx + 5, fy + h, 5, 20); ctx.fillRect(fx + w - 10, fy + h, 5, 20);
          ctx.fillStyle = 'rgba(200,168,130,0.4)'; ctx.beginPath(); ctx.arc(fx + w/2, fy + h/2, 8, 0, Math.PI * 2); ctx.fill(); // 杯子
        }
        // 画/挂件
        else if (id.includes('paint') || id.includes('art') || id.includes('mirror')) {
          const w = 60, h = 45;
          ctx.fillStyle = '#c8a882'; ctx.fillRect(fx - 3, fy - 3, w + 6, h + 6); // 画框
          ctx.fillStyle = '#e8e0d0'; ctx.fillRect(fx, fy, w, h); // 画布
          // 简单风景
          ctx.fillStyle = '#b8d4e8'; ctx.fillRect(fx + 2, fy + 2, w - 4, h * 0.5); // 天空
          ctx.fillStyle = '#8bb870'; ctx.fillRect(fx + 2, fy + h * 0.5, w - 4, h * 0.3); // 草地
          ctx.fillStyle = '#6b8b5e'; ctx.beginPath(); ctx.moveTo(fx + 15, fy + h * 0.3); ctx.lineTo(fx + 25, fy + 5); ctx.lineTo(fx + 35, fy + h * 0.3); ctx.fill(); // 山
        }
        // 灯
        else if (id.includes('lamp') || id.includes('light')) {
          ctx.fillStyle = '#555'; ctx.fillRect(fx + 4, fy + 20, 6, 60); // 灯杆
          ctx.fillStyle = '#f0e8d0'; ctx.beginPath(); ctx.moveTo(fx - 5, fy + 20); ctx.lineTo(fx + 19, fy + 20); ctx.lineTo(fx + 12, fy); ctx.lineTo(fx + 2, fy); ctx.fill(); // 灯罩
          ctx.fillStyle = 'rgba(255,240,180,0.3)'; ctx.beginPath(); ctx.moveTo(fx - 5, fy + 20); ctx.lineTo(fx + 19, fy + 20); ctx.lineTo(fx + 30, fy + 70); ctx.lineTo(fx - 16, fy + 70); ctx.fill(); // 光锥
        }
        // 植物
        else if (id.includes('plant') || id.includes('bonsai')) {
          ctx.fillStyle = '#8b6040'; ctx.fillRect(fx + 3, fy + 30, 24, 25); // 花盆
          ctx.fillStyle = '#5a8b4a'; for (let i = 0; i < 5; i++) { ctx.beginPath(); ctx.ellipse(fx + 15 + (i - 2) * 8, fy + 20 - i * 6, 10, 14, (i - 2) * 0.3, 0, Math.PI * 2); ctx.fill(); }
        }
        // 显示器/电视
        // 电脑工作站（桌+椅+显示器+键盘）
        else if (id.includes('computer')) {
          // 桌子
          ctx.fillStyle = '#6b5b4b'; ctx.fillRect(fx, fy + 30, 100, 8);
          ctx.fillStyle = '#5a4a3a'; ctx.fillRect(fx + 5, fy + 38, 8, 35); ctx.fillRect(fx + 87, fy + 38, 8, 35);
          // 显示器
          ctx.fillStyle = '#1a1a1a'; ctx.fillRect(fx + 20, fy, 60, 38);
          ctx.fillStyle = '#2a4a6a'; ctx.fillRect(fx + 23, fy + 2, 54, 30);
          // 屏幕内容（代码行）
          ctx.fillStyle = 'rgba(100,200,100,0.6)'; ctx.font = '5px monospace';
          for (let li = 0; li < 4; li++) ctx.fillRect(fx + 26, fy + 5 + li * 6, 20 + (li * 7) % 25, 2);
          ctx.fillStyle = '#333'; ctx.fillRect(fx + 45, fy + 32, 10, 6); // 支架
          // 键盘
          ctx.fillStyle = '#444'; ctx.fillRect(fx + 30, fy + 32, 35, 8);
          ctx.strokeStyle = '#555'; ctx.lineWidth = 0.5;
          for (let k = 0; k < 6; k++) ctx.strokeRect(fx + 32 + k * 5, fy + 33, 4, 3);
          // 椅子
          ctx.fillStyle = '#333'; ctx.fillRect(fx - 15, fy + 20, 25, 30); // 靠背
          ctx.fillStyle = '#444'; ctx.fillRect(fx - 18, fy + 50, 30, 8); // 坐垫
          ctx.fillStyle = '#555'; ctx.fillRect(fx - 8, fy + 58, 5, 15); // 椅腿
          ctx.beginPath(); ctx.arc(fx - 5, fy + 73, 4, 0, Math.PI * 2); ctx.fill(); // 轮子
        }
        // 股票交易终端
        else if (id.includes('stock')) {
          // 多屏幕支架
          ctx.fillStyle = '#1a1a1a'; ctx.fillRect(fx, fy, 110, 60);
          // 左屏
          ctx.fillStyle = '#0a1a0a'; ctx.fillRect(fx + 3, fy + 3, 50, 35);
          // K线图
          ctx.strokeStyle = '#40c040'; ctx.lineWidth = 1;
          ctx.beginPath(); ctx.moveTo(fx + 8, fy + 30);
          for (let k = 0; k < 8; k++) { ctx.lineTo(fx + 8 + k * 5, fy + 15 + Math.sin(k * 1.2 + animFrame) * 10); }
          ctx.stroke();
          ctx.strokeStyle = '#c04040'; ctx.beginPath(); ctx.moveTo(fx + 8, fy + 25);
          for (let k = 0; k < 8; k++) { ctx.lineTo(fx + 8 + k * 5, fy + 20 + Math.cos(k * 0.8 + animFrame * 0.7) * 8); }
          ctx.stroke();
          // 右屏
          ctx.fillStyle = '#0a0a1a'; ctx.fillRect(fx + 57, fy + 3, 50, 35);
          // 数字跳动
          ctx.fillStyle = '#40ff40'; ctx.font = '7px monospace';
          ctx.fillText('AI  +' + (2.1 + Math.sin(animFrame) * 0.5).toFixed(1) + '%', fx + 62, fy + 14);
          ctx.fillStyle = '#ff4040';
          ctx.fillText('RE  ' + (-1.3 + Math.cos(animFrame) * 0.4).toFixed(1) + '%', fx + 62, fy + 24);
          ctx.fillStyle = '#40ff40';
          ctx.fillText('CHIP+' + (0.8 + Math.sin(animFrame * 1.3) * 0.6).toFixed(1) + '%', fx + 62, fy + 34);
          // 键盘区
          ctx.fillStyle = '#222'; ctx.fillRect(fx + 15, fy + 42, 80, 14);
          ctx.fillStyle = '#0a0a0a'; ctx.font = '6px monospace'; ctx.fillText('STOCK TERMINAL', fx + 25, fy + 52);
        }
        // 电竞椅
        else if (id.includes('gaming-chair')) {
          ctx.fillStyle = '#222'; ctx.fillRect(fx + 5, fy, 30, 45); // 靠背
          ctx.fillStyle = '#c04040'; ctx.fillRect(fx + 8, fy + 5, 24, 8); // 红色条纹
          ctx.fillStyle = '#333'; ctx.fillRect(fx, fy + 45, 40, 10); // 坐垫
          ctx.fillStyle = '#444'; ctx.fillRect(fx + 15, fy + 55, 10, 15); // 支柱
          ctx.fillStyle = '#555'; for (let w2 = 0; w2 < 5; w2++) { ctx.beginPath(); ctx.arc(fx + 5 + w2 * 8, fy + 72, 3, 0, Math.PI * 2); ctx.fill(); }
        }
        // 服务器机架
        else if (id.includes('server')) {
          ctx.fillStyle = '#222'; ctx.fillRect(fx, fy, 40, 90);
          ctx.strokeStyle = '#444'; ctx.lineWidth = 1;
          for (let r = 0; r < 6; r++) { ctx.strokeRect(fx + 3, fy + 5 + r * 14, 34, 11); }
          // LED 指示灯闪烁
          for (let r = 0; r < 6; r++) {
            ctx.fillStyle = Math.sin(animFrame * 3 + r) > 0 ? '#40ff40' : '#0a3a0a';
            ctx.beginPath(); ctx.arc(fx + 8, fy + 10 + r * 14, 2, 0, Math.PI * 2); ctx.fill();
            ctx.fillStyle = Math.sin(animFrame * 2 + r * 2) > 0.3 ? '#ffaa00' : '#3a2a0a';
            ctx.beginPath(); ctx.arc(fx + 14, fy + 10 + r * 14, 2, 0, Math.PI * 2); ctx.fill();
          }
        }
        // 白板
        else if (id.includes('whiteboard')) {
          ctx.fillStyle = '#ddd'; ctx.fillRect(fx, fy, 60, 40);
          ctx.strokeStyle = '#aaa'; ctx.lineWidth = 2; ctx.strokeRect(fx, fy, 60, 40);
          // 手写内容
          ctx.strokeStyle = '#3366cc'; ctx.lineWidth = 1;
          ctx.beginPath(); ctx.moveTo(fx + 8, fy + 10); ctx.lineTo(fx + 35, fy + 10); ctx.stroke();
          ctx.beginPath(); ctx.moveTo(fx + 8, fy + 18); ctx.lineTo(fx + 45, fy + 18); ctx.stroke();
          ctx.strokeStyle = '#cc3333';
          ctx.beginPath(); ctx.moveTo(fx + 8, fy + 26); ctx.lineTo(fx + 28, fy + 26); ctx.stroke();
          // 笔
          ctx.fillStyle = '#333'; ctx.fillRect(fx + 50, fy + 42, 8, 2);
        }
        // 电视/显示器
        else if (id.includes('monitor') || id.includes('tv') || id.includes('display')) {
          const w = 70, h = 45;
          ctx.fillStyle = '#2a2a2a'; ctx.fillRect(fx, fy, w, h);
          ctx.fillStyle = '#3a5a7a'; ctx.fillRect(fx + 3, fy + 3, w - 6, h - 8);
          ctx.fillStyle = '#333'; ctx.fillRect(fx + w/2 - 5, fy + h, 10, 10);
          ctx.fillRect(fx + w/2 - 15, fy + h + 10, 30, 4);
        }
        // 地毯
        else if (id.includes('carpet') || id.includes('rug')) {
          const w = 100, h = 35;
          ctx.fillStyle = '#a06040'; ctx.fillRect(fx, fy, w, h);
          ctx.strokeStyle = '#c8a882'; ctx.lineWidth = 2; ctx.strokeRect(fx + 6, fy + 6, w - 12, h - 12);
          ctx.strokeStyle = '#d4c090'; ctx.lineWidth = 1; ctx.strokeRect(fx + 12, fy + 10, w - 24, h - 20);
        }
        // 默认：简单矩形 + 标签
        else {
          const w = 50, h = 40;
          ctx.fillStyle = '#7a6a5a'; ctx.fillRect(fx, fy, w, h);
          ctx.strokeStyle = '#c8a882'; ctx.lineWidth = 1; ctx.strokeRect(fx, fy, w, h);
          ctx.fillStyle = 'rgba(200,180,150,0.8)'; ctx.font = '9px "Noto Sans SC",sans-serif'; ctx.textAlign = 'center';
          ctx.fillText(id.replace(/-/g, ' '), fx + w/2, fy + h/2 + 3);
        }
        ctx.restore();
      }

      function animateUserRoom() {
        animFrame += 0.02;
        const logW = canvas.width / dpr;
        const logH = canvas.height / dpr;
        const floorY = logH * 0.65;

        // 暖白色房间背景
        ctx.fillStyle = '#2d2820';
        ctx.fillRect(0, 0, logW, logH);

        // 墙壁（暖白色渐变）
        const wallGrad = ctx.createLinearGradient(0, 0, 0, floorY);
        wallGrad.addColorStop(0, '#f5f0eb');
        wallGrad.addColorStop(1, '#e8e2d8');
        ctx.fillStyle = wallGrad;
        ctx.fillRect(0, 0, logW, floorY);

        // 地板（木纹暖色）
        const floorGrad = ctx.createLinearGradient(0, floorY, 0, logH);
        floorGrad.addColorStop(0, '#c8b8a0');
        floorGrad.addColorStop(1, '#b8a890');
        ctx.fillStyle = floorGrad;
        ctx.fillRect(0, floorY, logW, logH - floorY);

        // 木纹条
        ctx.strokeStyle = 'rgba(160,140,110,0.15)';
        ctx.lineWidth = 1;
        for (let i = 0; i < 10; i++) {
          const y = floorY + i * ((logH - floorY) / 10);
          ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(logW, y); ctx.stroke();
        }

        // 护墙板
        ctx.fillStyle = '#d4cabb';
        ctx.fillRect(0, floorY * 0.82, logW, floorY * 0.18);
        ctx.strokeStyle = 'rgba(200,168,130,0.3)';
        ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(0, floorY * 0.82); ctx.lineTo(logW, floorY * 0.82); ctx.stroke();
        // 护墙板竖线
        ctx.strokeStyle = 'rgba(180,160,130,0.1)';
        for (let i = 0; i < 20; i++) { const x = i * (logW / 20); ctx.beginPath(); ctx.moveTo(x, floorY * 0.82); ctx.lineTo(x, floorY); ctx.stroke(); }

        // 暖色踢脚线
        ctx.fillStyle = '#c8a882';
        ctx.fillRect(0, floorY - 4, logW, 8);

        // 窗户
        const winX = logW * 0.72, winY = logH * 0.1, winW = logW * 0.18, winH = logH * 0.35;
        ctx.fillStyle = '#e8e2d8';
        ctx.fillRect(winX - 4, winY - 4, winW + 8, winH + 8);
        // 玻璃（天空渐变）
        const skyGrad = ctx.createLinearGradient(winX, winY, winX, winY + winH);
        skyGrad.addColorStop(0, '#b8d4e8');
        skyGrad.addColorStop(1, '#e8f0e0');
        ctx.fillStyle = skyGrad;
        ctx.fillRect(winX, winY, winW, winH);
        // 窗框
        ctx.strokeStyle = '#c8b8a0';
        ctx.lineWidth = 2;
        ctx.strokeRect(winX, winY, winW, winH);
        ctx.beginPath(); ctx.moveTo(winX + winW / 2, winY); ctx.lineTo(winX + winW / 2, winY + winH); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(winX, winY + winH / 2); ctx.lineTo(winX + winW, winY + winH / 2); ctx.stroke();
        // 窗帘
        ctx.fillStyle = 'rgba(200,168,130,0.2)';
        ctx.fillRect(winX - 10, winY - 8, 14, winH + 20);
        ctx.fillRect(winX + winW - 4, winY - 8, 14, winH + 20);

        // 绘制家具（立面图，从共享数据读取）
        const rd = window.__userRoomData || roomData;
        if (rd.furniture) {
          for (let fi = 0; fi < rd.furniture.length; fi++) {
            const f = rd.furniture[fi];
            const fx = 60 + (f.x != null ? f.x : fi * 100 % (logW - 120));
            const fy = floorY - 80 + (f.y || 0);
            drawFurnitureElevation(fx, fy, f, logW, logH);
            // 选中高亮
            if (fi === selectedFurniture) {
              const b = getFurnitureBounds(f.itemId);
              ctx.strokeStyle = '#c8a882'; ctx.lineWidth = 2; ctx.setLineDash([4, 4]);
              ctx.strokeRect(fx - 2, fy - 2, b.w + 4, b.h + 4);
              ctx.setLineDash([]);
            }
          }
        }
        // 摆放模式：半透明预览跟随鼠标
        if (placingMode && placingItemId) {
          ctx.globalAlpha = 0.5;
          drawFurnitureElevation(placingPos.x - 30, placingPos.y - 30, { itemId: placingItemId }, logW, logH);
          ctx.globalAlpha = 1.0;
          ctx.fillStyle = 'rgba(200,168,130,0.8)'; ctx.font = '13px "Noto Sans SC",sans-serif'; ctx.textAlign = 'center';
          ctx.fillText('\u70b9\u51fb\u653e\u7f6e\u5bb6\u5177', logW / 2, logH * 0.95);
        }

        // 绘制龙虾宠物（暖色调）
        if (rd.pets) {
          for (let pi = 0; pi < roomData.pets.length; pi++) {
            const pet = roomData.pets[pi];
            const px = logW * 0.25 + pi * 90 + Math.sin(animFrame * 2 + pi) * 10;
            const py = floorY + (logH - floorY) * 0.4 + Math.sin(animFrame * 1.5 + pi * 2) * 5;
            ctx.fillStyle = pet.color || '#e05040';
            ctx.beginPath(); ctx.ellipse(px, py, 16, 10, 0, 0, Math.PI * 2); ctx.fill();
            ctx.fillStyle = '#fff';
            ctx.beginPath(); ctx.arc(px + 10, py - 4, 3, 0, Math.PI * 2); ctx.fill();
            ctx.beginPath(); ctx.arc(px + 10, py + 4, 3, 0, Math.PI * 2); ctx.fill();
            ctx.fillStyle = '#000';
            ctx.beginPath(); ctx.arc(px + 11, py - 4, 1.5, 0, Math.PI * 2); ctx.fill();
            ctx.beginPath(); ctx.arc(px + 11, py + 4, 1.5, 0, Math.PI * 2); ctx.fill();
            ctx.strokeStyle = pet.color || '#e05040'; ctx.lineWidth = 2;
            ctx.beginPath(); ctx.moveTo(px - 14, py - 4); ctx.quadraticCurveTo(px - 28, py - 12 + Math.sin(animFrame * 3 + pi) * 3, px - 32, py - 16); ctx.stroke();
            ctx.beginPath(); ctx.moveTo(px - 14, py + 4); ctx.quadraticCurveTo(px - 28, py + 12 + Math.cos(animFrame * 3 + pi) * 3, px - 32, py + 16); ctx.stroke();
            ctx.fillStyle = 'rgba(60,50,40,0.7)'; ctx.font = '10px "Noto Sans SC",sans-serif'; ctx.textAlign = 'center';
            ctx.fillText(pet.name || '', px, py + 22);
          }
        }

        // 空房间提示
        if ((!rd.furniture || rd.furniture.length === 0) && (!rd.pets || rd.pets.length === 0)) {
          ctx.fillStyle = 'rgba(100,80,60,0.3)';
          ctx.font = '16px "Noto Serif SC",Georgia,serif';
          ctx.textAlign = 'center';
          ctx.fillText('\u8fd9\u91cc\u8fd8\u5f88\u7a7a\u65f7......', logW / 2, logH * 0.42);
          ctx.font = '13px "Noto Sans SC",sans-serif';
          ctx.fillText('\u70b9\u51fb\u4e0b\u65b9\u300c\u53bb\u5546\u5e97\u300d\u6309\u94ae\u6dfb\u7f6e\u5bb6\u5177\u548c\u5ba0\u7269', logW / 2, logH * 0.47);
        }

        // 用户名水印
        ctx.fillStyle = 'rgba(200,168,130,0.08)';
        ctx.font = '48px "Noto Serif SC",Georgia,serif';
        ctx.textAlign = 'center';
        ctx.fillText((user.name || ''), logW / 2, logH * 0.3);

        roomAnimId = requestAnimationFrame(animateUserRoom);
      }
      animateUserRoom();
    });
  };

  // ── 家具交互状态 ──
  let placingMode = false;
  let placingItemId = null;
  let placingPos = { x: 0, y: 0 };
  let draggingFurniture = -1;
  let selectedFurniture = -1;
  let dragOffset = { x: 0, y: 0 };

  // Canvas 鼠标事件：摆放模式 + 拖拽家具
  (function() {
    const rc = document.getElementById('room-canvas');
    if (!rc) return;

    rc.addEventListener('mousemove', (e) => {
      if (!window.__userRoomData) return;
      const rect = rc.getBoundingClientRect();
      const mx = e.clientX - rect.left, my = e.clientY - rect.top;

      if (placingMode) {
        placingPos.x = mx; placingPos.y = my;
        rc.style.cursor = 'crosshair';
        return;
      }
      if (draggingFurniture >= 0) {
        const rd = window.__userRoomData;
        if (rd && rd.furniture[draggingFurniture]) {
          const dpr2 = window.devicePixelRatio || 1;
          const logH = rc.height / dpr2;
          const floorY2 = logH * 0.65;
          // drawX = mx - dragOffset.x → f.x = drawX - 60
          const newDrawX = mx - dragOffset.x;
          const newDrawY = my - dragOffset.y;
          rd.furniture[draggingFurniture].x = newDrawX - 60;
          rd.furniture[draggingFurniture].y = newDrawY - (floorY2 - 80);
        }
        rc.style.cursor = 'grabbing';
      }
    });

    rc.addEventListener('mousedown', (e) => {
      if (!window.__userRoomData) return;
      const rect = rc.getBoundingClientRect();
      const mx = e.clientX - rect.left, my = e.clientY - rect.top;
      const dpr2 = window.devicePixelRatio || 1;
      const logW = rc.width / dpr2, logH = rc.height / dpr2;
      const floorY2 = logH * 0.65;
      const rd = window.__userRoomData;

      if (placingMode && rd.furniture) {
        // 放置新家具：鼠标位置就是绘制中心，反算 f.x/f.y
        const lastIdx = rd.furniture.length - 1;
        if (lastIdx >= 0) {
          rd.furniture[lastIdx].x = mx - 90;  // 居中偏移（家具约宽60，所以-30再-60）
          rd.furniture[lastIdx].y = my - floorY2 + 40; // 放在鼠标点击处附近
          // 保存到服务器
          const uid = window.__userRoomUserId || shopUserId;
          if (uid) {
            const placeSave = { userId: uid, itemIndex: lastIdx, x: rd.furniture[lastIdx].x, y: rd.furniture[lastIdx].y };
            fetch('/api/room/move', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(placeSave) })
              .catch(() => { setTimeout(() => fetch('/api/room/move', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(placeSave) }).catch(() => {}), 500); });
          }
        }
        placingMode = false; placingItemId = null;
        rc.style.cursor = 'default';
        return;
      }

      // 点击检测已有家具（倒序遍历）
      if (rd.furniture) {
        for (let fi = rd.furniture.length - 1; fi >= 0; fi--) {
          const f = rd.furniture[fi];
          const fx = 60 + (f.x != null ? f.x : fi * 100 % (logW - 120));
          const fy = floorY2 - 80 + (f.y || 0);
          const b = getFurnitureBounds(f.itemId);
          if (mx >= fx && mx <= fx + b.w && my >= fy && my <= fy + b.h) {
            draggingFurniture = fi;
            selectedFurniture = fi;
            // dragOffset = 鼠标位置 - 家具绘制位置（drawX, drawY）
            dragOffset.x = mx - fx;
            dragOffset.y = my - fy;
            rc.style.cursor = 'grabbing';
            return;
          }
        }
      }
      selectedFurniture = -1;
    });

    rc.addEventListener('mouseup', (e) => {
      if (draggingFurniture >= 0 && window.__userRoomData) {
        const f = window.__userRoomData.furniture[draggingFurniture];
        const uid = window.__userRoomUserId || shopUserId;
        if (uid && f) {
          // 保存家具位置到服务器（带重试）
          const saveData = { userId: uid, itemIndex: draggingFurniture, x: f.x, y: f.y };
          fetch('/api/room/move', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(saveData) })
            .then(r => { if (!r.ok) throw new Error('save failed'); return r.json(); })
            .catch(() => {
              // 重试一次
              setTimeout(() => {
                fetch('/api/room/move', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(saveData) }).catch(() => {});
              }, 500);
            });
        }
        draggingFurniture = -1;
        rc.style.cursor = 'default';
      }
    });
  })();

  function getFurnitureBounds(itemId) {
    const id = itemId || '';
    if (id.includes('computer')) return { w: 100, h: 73 };
    if (id.includes('stock')) return { w: 110, h: 60 };
    if (id.includes('sofa')) return { w: 80, h: 70 };
    if (id.includes('desk')) return { w: 90, h: 65 };
    if (id.includes('bookshelf') || id.includes('shelf')) return { w: 50, h: 100 };
    if (id.includes('coffee') || id.includes('table')) return { w: 50, h: 45 };
    if (id.includes('paint') || id.includes('art') || id.includes('mirror')) return { w: 60, h: 45 };
    if (id.includes('lamp') || id.includes('light')) return { w: 24, h: 80 };
    if (id.includes('plant') || id.includes('bonsai')) return { w: 30, h: 55 };
    if (id.includes('gaming')) return { w: 40, h: 75 };
    if (id.includes('server')) return { w: 40, h: 90 };
    if (id.includes('whiteboard')) return { w: 60, h: 44 };
    if (id.includes('monitor') || id.includes('tv') || id.includes('display')) return { w: 70, h: 55 };
    if (id.includes('carpet') || id.includes('rug')) return { w: 100, h: 35 };
    if (id.includes('piano')) return { w: 90, h: 70 };
    if (id.includes('aquarium')) return { w: 80, h: 50 };
    return { w: 50, h: 40 };
  }

  // ── 商店面板（从房间内打开，可购买家具和宠物） ──
  const SHOP_SERVER = (window.__serverUrl || window.location.origin);
  const shopPanel = document.getElementById('shop-panel');
  const shopItems = document.getElementById('shop-items');
  const shopBalance = document.getElementById('shop-balance');
  const shopCloseBtn = document.getElementById('shop-close-btn');
  let shopUserId = null;
  let shopRoomData = null;

  if (shopCloseBtn) shopCloseBtn.addEventListener('click', () => { if (shopPanel) shopPanel.style.display = 'none'; });

  async function openShopPanel(user) {
    if (!shopPanel || !shopItems || !user) return;
    shopUserId = user.id;
    shopPanel.style.display = 'block';
    // 管理模式提示
    const adminHint = window.__adminMode ? '<div style="font-size:0.6rem;color:#ff8080;margin-bottom:8px;font-family:monospace;">ADMIN: buying for ' + (user.name || user.id) + '</div>' : '';
    shopItems.innerHTML = adminHint + '<div style="color:rgba(255,255,255,0.4);font-size:0.7rem;text-align:center;padding:40px;">Loading...</div>';

    try {
      const [shopResp, walletResp] = await Promise.all([
        fetch(SHOP_SERVER + '/api/shop').then(r => r.ok ? r.json() : null),
        fetch(SHOP_SERVER + '/api/wallet/' + user.id).then(r => r.ok ? r.json() : null),
      ]);
      if (!shopResp) { shopItems.innerHTML = '<div style="color:#ff5f63;text-align:center;padding:40px;">Server not available</div>'; return; }
      const balance = walletResp?.balance || 0;
      if (shopBalance) shopBalance.textContent = balance + ' Token';

      let html = '';
      // 家具
      if (shopResp.items) {
        html += '<div style="grid-column:1/-1;font-size:0.65rem;color:#c8a882;letter-spacing:0.2em;padding:8px 0;border-bottom:1px solid rgba(200,168,130,0.15);">FURNITURE</div>';
        for (const item of shopResp.items) {
          const canBuy = balance >= item.price;
          const rarityColor = item.rarity === 'legendary' ? '#ffd700' : item.rarity === 'epic' ? '#a855f7' : item.rarity === 'rare' ? '#3b82f6' : '#888';
          html += '<div class="shop-card" data-id="' + item.id + '" data-type="item" style="background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.08);padding:10px;cursor:' + (canBuy ? 'pointer' : 'not-allowed') + ';opacity:' + (canBuy ? '1' : '0.5') + ';transition:all 0.2s;">';
          html += '<div style="font-size:1.2rem;margin-bottom:4px;">' + (item.icon || '') + '</div>';
          html += '<div style="font-size:0.72rem;color:rgba(255,255,255,0.8);">' + item.name + '</div>';
          html += '<div style="font-size:0.58rem;color:rgba(255,255,255,0.4);margin:4px 0;">' + (item.description || '') + '</div>';
          html += '<div style="display:flex;justify-content:space-between;align-items:center;">';
          html += '<span style="font-size:0.65rem;color:#c8a882;font-family:monospace;">' + item.price + 'T</span>';
          html += '<span style="font-size:0.5rem;color:' + rarityColor + ';border:1px solid ' + rarityColor + ';padding:0 4px;">' + (item.rarity || '') + '</span>';
          html += '</div></div>';
        }
      }
      // 宠物
      if (shopResp.pets) {
        html += '<div style="grid-column:1/-1;font-size:0.65rem;color:#c8a882;letter-spacing:0.2em;padding:8px 0;border-bottom:1px solid rgba(200,168,130,0.15);margin-top:8px;">LOBSTER PETS</div>';
        for (const pet of shopResp.pets) {
          const canBuy = balance >= pet.price;
          const rarityColor = pet.rarity === 'legendary' ? '#ffd700' : pet.rarity === 'epic' ? '#a855f7' : pet.rarity === 'rare' ? '#3b82f6' : '#888';
          html += '<div class="shop-card" data-id="' + pet.id + '" data-type="pet" style="background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.08);padding:10px;cursor:' + (canBuy ? 'pointer' : 'not-allowed') + ';opacity:' + (canBuy ? '1' : '0.5') + ';transition:all 0.2s;">';
          html += '<div style="font-size:1.2rem;margin-bottom:4px;">' + (pet.icon || '') + '</div>';
          html += '<div style="font-size:0.72rem;color:rgba(255,255,255,0.8);">' + pet.name + '</div>';
          html += '<div style="font-size:0.58rem;color:rgba(255,255,255,0.4);margin:4px 0;">' + (pet.personality || '') + '</div>';
          html += '<div style="display:flex;justify-content:space-between;align-items:center;">';
          html += '<span style="font-size:0.65rem;color:#c8a882;font-family:monospace;">' + pet.price + 'T</span>';
          html += '<span style="font-size:0.5rem;color:' + rarityColor + ';border:1px solid ' + rarityColor + ';padding:0 4px;">' + (pet.rarity || '') + '</span>';
          html += '</div></div>';
        }
      }
      shopItems.innerHTML = html;

      // 创建确认面板（如果不存在）
      if (!shopPanel.querySelector('#purchase-confirm')) {
        const cfm = document.createElement('div');
        cfm.id = 'purchase-confirm';
        cfm.style.cssText = 'display:none;position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);background:#1a1a1a;border:1px solid #c8a882;padding:24px;z-index:20;min-width:260px;text-align:center;border-radius:4px;';
        cfm.innerHTML = '<div id="cfm-icon" style="font-size:2.5rem;margin-bottom:8px;"></div><div id="cfm-name" style="color:#fff;font-size:0.85rem;margin-bottom:4px;"></div><div id="cfm-desc" style="color:rgba(255,255,255,0.4);font-size:0.6rem;margin-bottom:8px;"></div><div id="cfm-price" style="color:#c8a882;font-size:0.8rem;font-family:monospace;margin-bottom:16px;"></div><div style="display:flex;gap:12px;justify-content:center;"><button id="cfm-buy" style="background:#c8a882;color:#1a1a1a;border:none;padding:6px 24px;cursor:pointer;font-size:0.72rem;font-family:inherit;">BUY</button><button id="cfm-cancel" style="background:none;border:1px solid rgba(255,255,255,0.2);color:rgba(255,255,255,0.6);padding:6px 24px;cursor:pointer;font-size:0.72rem;font-family:inherit;">CANCEL</button></div><div id="cfm-msg" style="margin-top:10px;font-size:0.6rem;min-height:16px;"></div>';
        shopPanel.appendChild(cfm);
        document.getElementById('cfm-cancel').addEventListener('click', () => { cfm.style.display = 'none'; });
      }

      // 绑定购买事件 — 点击卡片弹确认面板
      shopItems.querySelectorAll('.shop-card').forEach(card => {
        card.addEventListener('click', () => {
          const itemId = card.getAttribute('data-id');
          const itemType = card.getAttribute('data-type');
          const icon = card.querySelector('div')?.textContent || '';
          const name = card.querySelectorAll('div')[1]?.textContent || itemId;
          const desc = card.querySelectorAll('div')[2]?.textContent || '';
          const price = card.querySelector('span')?.textContent || '';

          const cfm = document.getElementById('purchase-confirm');
          document.getElementById('cfm-icon').textContent = icon;
          document.getElementById('cfm-name').textContent = name;
          document.getElementById('cfm-desc').textContent = desc;
          document.getElementById('cfm-price').textContent = price;
          document.getElementById('cfm-msg').textContent = '';
          document.getElementById('cfm-msg').style.color = '';
          cfm.style.display = 'block';

          // 确认购买按钮（每次重新绑定）
          const buyBtn = document.getElementById('cfm-buy');
          const newBtn = buyBtn.cloneNode(true);
          buyBtn.parentNode.replaceChild(newBtn, buyBtn);
          newBtn.addEventListener('click', async () => {
            let uid = shopUserId;
            if (!uid) { const cu = window.__currentUser ? window.__currentUser() : null; if (cu) uid = cu.id; }
            if (!uid) uid = localStorage.getItem('lobster-town-user-id');
            if (!uid) { document.getElementById('cfm-msg').textContent = 'No user ID'; document.getElementById('cfm-msg').style.color = '#ff5f63'; return; }
            shopUserId = uid;

            newBtn.textContent = '...';
            const url = itemType === 'pet' ? SHOP_SERVER + '/api/shop/buy-pet' : SHOP_SERVER + '/api/shop/buy';
            const body = itemType === 'pet' ? { userId: uid, petId: itemId } : { userId: uid, itemId };
            try {
              const resp = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
              const result = await resp.json();
              if (result.success) {
                if (shopBalance && result.balance !== undefined) shopBalance.textContent = result.balance + ' Token';
                card.style.border = '2px solid #c8a882'; card.style.background = 'rgba(200,168,130,0.15)';
                if (!card.querySelector('.shop-bought')) { const tag = document.createElement('div'); tag.className = 'shop-bought'; tag.style.cssText = 'font-size:0.55rem;color:#c8a882;margin-top:4px;'; tag.textContent = 'PURCHASED'; card.appendChild(tag); }

                // 刷新房间数据 — 保留已有家具的当前位置，只追加新家具
                try {
                  const roomResp = await fetch(SHOP_SERVER + '/api/room/' + uid).then(r => r.json());
                  if (roomResp.room) {
                    const cur = window.__userRoomData;
                    if (cur && cur.furniture) {
                      // 保留已有家具的位置（前端可能已拖拽过），只追加服务端新增的
                      const newRoom = roomResp.room;
                      const oldLen = cur.furniture.length;
                      const newLen = newRoom.furniture ? newRoom.furniture.length : 0;
                      if (newLen > oldLen) {
                        // 追加新家具（保留现有的不动）
                        for (let ni = oldLen; ni < newLen; ni++) {
                          cur.furniture.push(newRoom.furniture[ni]);
                        }
                      }
                      // 同步宠物（宠物不需要位置保留）
                      if (newRoom.pets) cur.pets = newRoom.pets;
                    } else {
                      window.__userRoomData = roomResp.room;
                    }
                  }
                } catch {}

                cfm.style.display = 'none';
                // 家具类购买后进入摆放模式
                if (itemType !== 'pet') {
                  shopPanel.style.display = 'none';
                  placingMode = true;
                  placingItemId = itemId;
                } else {
                  document.getElementById('cfm-msg').textContent = 'OK!'; document.getElementById('cfm-msg').style.color = '#c8a882';
                }
              } else {
                document.getElementById('cfm-msg').textContent = result.message || 'Failed'; document.getElementById('cfm-msg').style.color = '#ff5f63';
                newBtn.textContent = 'BUY';
              }
            } catch {
              document.getElementById('cfm-msg').textContent = 'Network error'; document.getElementById('cfm-msg').style.color = '#ff5f63';
              newBtn.textContent = 'BUY';
            }
          });
        });
        card.addEventListener('mouseenter', () => { if (!card.querySelector('.shop-bought')) card.style.borderColor = 'rgba(200,168,130,0.3)'; });
        card.addEventListener('mouseleave', () => { if (!card.querySelector('.shop-bought')) card.style.borderColor = 'rgba(255,255,255,0.08)'; });
      });
    } catch (e) {
      shopItems.innerHTML = '<div style="color:#ff5f63;text-align:center;padding:40px;">Failed to load shop</div>';
    }
  }

  // 暴露给地图中的用户房屋使用
  window.__openShop = openShopPanel;

  // ── 房间内电视直播（1大3小 · 4频道 · 点击切换 · 声音控制） ──
  const roomTvEl = document.getElementById('room-tv');
  const roomTvVideo = document.getElementById('room-tv-video');
  const roomTvCh = document.getElementById('room-tv-ch');
  let mainHls = null;
  const thumbHlsList = [];
  let roomTvStarted = false;
  let mainChIdx = 0;

  // 4个中国免费频道（低码率优先）
  const roomTvChannels = [
    { name: '\u51e4\u51f0\u4e2d\u6587', url: 'https://playtv-live.ifeng.com/live/06OLEGEGM4G.m3u8' },
    { name: 'CGTN', url: 'https://english-livebkali.cgtn.com/live/encgtn.m3u8' },
    { name: 'CCTV+', url: 'https://cd-live-stream.news.cctvplus.com/live/smil:CHANNEL1.smil/playlist.m3u8' },
    { name: 'CCTV-10', url: 'https://cdn4.skygo.mn/live/disk1/CCTV-10/HLSv3-FTA/CCTV-10.m3u8' },
  ];

  function playHls(videoEl, url, lowBitrate) {
    if (typeof Hls === 'undefined' || !Hls.isSupported()) {
      if (videoEl.canPlayType('application/vnd.apple.mpegurl')) { videoEl.src = url; videoEl.play().catch(()=>{}); }
      return null;
    }
    const cfg = lowBitrate
      ? { enableWorker: false, maxBufferLength: 5, maxMaxBufferLength: 10, maxBufferSize: 200000, startLevel: 0, capLevelToPlayerSize: true, abrMaxWithRealBitrate: true }
      : { enableWorker: true, maxBufferLength: 15, startLevel: -1 };
    const hls = new Hls(cfg);
    hls.loadSource(url);
    hls.attachMedia(videoEl);
    hls.on(Hls.Events.MANIFEST_PARSED, () => {
      if (lowBitrate && hls.levels && hls.levels.length > 1) hls.currentLevel = 0;
      videoEl.play().catch(()=>{});
    });
    return hls;
  }

  function startRoomTV() {
    if (!roomTvEl) return;
    roomTvEl.style.display = 'block';
    roomTvStarted = false;

    // 清理旧的 HLS
    if (mainHls) { mainHls.destroy(); mainHls = null; }
    thumbHlsList.forEach(h => { if (h) h.destroy(); });
    thumbHlsList.length = 0;

    // 待机画面（覆盖在大画面上）
    const mainDiv = document.getElementById('tv-main');
    if (mainDiv && !mainDiv.querySelector('.tv-standby')) {
      const sb = document.createElement('div');
      sb.className = 'tv-standby';
      sb.style.cssText = 'width:100%;height:100%;background:#0a0c10;display:flex;flex-direction:column;align-items:center;justify-content:center;cursor:pointer;position:absolute;top:0;left:0;z-index:2;';
      sb.innerHTML = '<div style="font-size:1.5rem;margin-bottom:6px">TV</div><div style="font-family:monospace;font-size:0.55rem;color:rgba(255,255,255,0.4);letter-spacing:0.1em">CLICK TO START</div>';
      sb.addEventListener('click', (e) => {
        e.stopPropagation();
        sb.style.display = 'none';
        roomTvStarted = true;
        startAllChannels();
      });
      mainDiv.insertBefore(sb, mainDiv.firstChild);
    } else if (mainDiv) {
      const sb = mainDiv.querySelector('.tv-standby');
      if (sb) sb.style.display = 'flex';
    }
    if (roomTvVideo) { roomTvVideo.style.display = 'none'; roomTvVideo.muted = true; }
  }

  function startAllChannels() {
    // 大画面 — 高码率
    mainChIdx = 0;
    if (roomTvVideo) {
      roomTvVideo.style.display = 'block';
      roomTvVideo.muted = true;
      mainHls = playHls(roomTvVideo, roomTvChannels[0].url, false);
    }
    if (roomTvCh) roomTvCh.textContent = roomTvChannels[0].name;

    // 3个小画面 — 低码率
    const thumbs = document.querySelectorAll('.tv-thumb');
    thumbs.forEach((thumb, i) => {
      const chIdx = i + 1;
      if (chIdx >= roomTvChannels.length) { thumb.style.display = 'none'; return; }
      const video = thumb.querySelector('.tv-thumb-video');
      const label = thumb.querySelector('.tv-thumb-label');
      if (label) label.textContent = roomTvChannels[chIdx].name;
      if (video) {
        const hls = playHls(video, roomTvChannels[chIdx].url, true);
        thumbHlsList.push(hls);
      }
      // 点击小画面 → 切换到大画面
      thumb.onclick = () => switchToMain(chIdx);
    });
  }

  function switchToMain(newMainIdx) {
    if (!roomTvStarted || newMainIdx === mainChIdx) return;
    const oldMainIdx = mainChIdx;
    mainChIdx = newMainIdx;

    // 大画面换新频道
    if (mainHls) { mainHls.destroy(); mainHls = null; }
    if (roomTvVideo) {
      mainHls = playHls(roomTvVideo, roomTvChannels[newMainIdx].url, false);
      roomTvVideo.muted = true;
    }
    if (roomTvCh) roomTvCh.textContent = roomTvChannels[newMainIdx].name;

    // 更新小画面：把原来大画面的频道放到对应位置
    const thumbs = document.querySelectorAll('.tv-thumb');
    let thumbIdx = 0;
    for (let ci = 0; ci < roomTvChannels.length; ci++) {
      if (ci === newMainIdx) continue;
      if (thumbIdx >= thumbs.length) break;
      const thumb = thumbs[thumbIdx];
      const video = thumb.querySelector('.tv-thumb-video');
      const label = thumb.querySelector('.tv-thumb-label');
      if (label) label.textContent = roomTvChannels[ci].name;
      // 重载小画面
      if (thumbHlsList[thumbIdx]) thumbHlsList[thumbIdx].destroy();
      if (video) thumbHlsList[thumbIdx] = playHls(video, roomTvChannels[ci].url, true);
      const capturedCi = ci;
      thumb.onclick = () => switchToMain(capturedCi);
      thumbIdx++;
    }
  }

  function stopRoomTV() {
    if (mainHls) { mainHls.destroy(); mainHls = null; }
    thumbHlsList.forEach(h => { if (h) h.destroy(); });
    thumbHlsList.length = 0;
    if (roomTvVideo) { roomTvVideo.pause(); roomTvVideo.src = ''; }
    if (roomTvEl) roomTvEl.style.display = 'none';
    roomTvStarted = false;
  }

  // 声音按钮（默认静音，点击开启声音）
  const muteBtn = document.getElementById('room-tv-mute');
  if (muteBtn) {
    muteBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (roomTvVideo) {
        roomTvVideo.muted = !roomTvVideo.muted;
        muteBtn.textContent = roomTvVideo.muted ? 'MUTE' : 'SOUND';
        muteBtn.style.color = roomTvVideo.muted ? 'rgba(255,255,255,0.5)' : '#c8a882';
      }
    });
  }

  // 暂停按钮
  const roomTvPause = document.getElementById('room-tv-pause');
  if (roomTvPause) {
    roomTvPause.addEventListener('click', (e) => {
      e.stopPropagation();
      if (roomTvVideo) {
        if (roomTvVideo.paused) { roomTvVideo.play().catch(()=>{}); roomTvPause.textContent = 'PAUSE'; }
        else { roomTvVideo.pause(); roomTvPause.textContent = 'PLAY'; }
      }
    });
  }

  // 修改 openRoom 以启动电视
  const origOpen = window.__openRoom;
  window.__openRoom = function(idx) {
    origOpen(idx);
    if (typeof Hls !== 'undefined') startRoomTV();
    else setTimeout(startRoomTV, 2000);
  };

  // 修改 closeRoom 以关闭电视
  const origCloseRoom = closeRoom;
  closeRoom = function() {
    stopRoomTV();
    origCloseRoom();
  };

  // ── 任务面板逻辑 ──
  const taskPanel = document.getElementById('task-panel');
  const taskToggle = document.getElementById('task-toggle');
  const taskInput = document.getElementById('task-input');
  const taskSubmit = document.getElementById('task-submit');
  const taskStatus = document.getElementById('task-status');
  const taskTemplatesEl = document.getElementById('task-templates');
  const resultModal = document.getElementById('result-modal');
  const resultClose = document.getElementById('result-close');
  const resultSave = document.getElementById('result-save');
  const SERVER_URL = (window.__serverUrl || window.location.origin);

  // 每个 Agent 的推荐模板
  const agentTemplates = ${JSON.stringify(log.agents.map(a => {
    const tpls = recommendTemplates(a.skills).slice(0, 6);
    return tpls.map(t => ({ id: t.id, label: t.label, prompt: t.prompt, category: t.category }));
  }))};

  let selectedTemplate = null;
  let taskPanelOpen = false;

  // 面板开关
  taskToggle.addEventListener('click', () => {
    taskPanelOpen = !taskPanelOpen;
    taskPanel.classList.toggle('open', taskPanelOpen);
    taskToggle.textContent = taskPanelOpen ? '收起' : '分配任务';
  });

  // openRoom 扩展：更新任务模板
  const origOpenRoom = window.__openRoom;
  window.__openRoom = function(idx) {
    origOpenRoom(idx);
    // 填充模板按钮
    const templates = agentTemplates[idx] || [];
    taskTemplatesEl.innerHTML = templates.map(t =>
      '<button class="task-tpl-btn" data-id="' + t.id + '" data-prompt="' + esc(t.prompt) + '" data-cat="' + t.category + '">' + t.label + '</button>'
    ).join('');
    // 绑定模板点击
    taskTemplatesEl.querySelectorAll('.task-tpl-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        taskTemplatesEl.querySelectorAll('.task-tpl-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        selectedTemplate = { id: btn.dataset.id, prompt: btn.dataset.prompt };
        taskInput.placeholder = '补充具体需求...（可选）';
      });
    });
    selectedTemplate = null;
    taskInput.value = '';
    taskInput.placeholder = '输入自定义任务...';
    taskStatus.textContent = '';

    // 更新 OpenClaw 状态面板
    updateOcStatus(idx);
  };

  function esc(s) { return s.replace(/"/g, '&quot;').replace(/</g, '&lt;'); }

  function updateOcStatus(idx) {
    const a = allAgents[idx];
    document.getElementById('oc-soul').textContent = a.mbti + ' · ' + a.archetype;
    document.getElementById('oc-skills').textContent = allSkills[idx].length + ' 个';
    document.getElementById('oc-tasks').textContent = '检查中...';
    document.getElementById('oc-history').textContent = '-';
    // 尝试从服务器获取实时状态
    fetch(SERVER_URL + '/api/status/' + a.id).then(r => r.json()).then(status => {
      const pending = (status.heartbeatTasks || []).filter(t => t.status === 'pending').length;
      document.getElementById('oc-tasks').textContent = pending + ' 条待办';
      document.getElementById('oc-history').textContent = (status.taskHistoryCount || 0) + ' 份';
    }).catch(() => {
      document.getElementById('oc-tasks').textContent = '离线';
    });
  }

  // 执行任务
  taskSubmit.addEventListener('click', async () => {
    const idx = currentAgent;
    if (idx < 0) return;

    const prompt = selectedTemplate
      ? selectedTemplate.prompt + ' ' + taskInput.value
      : taskInput.value;

    if (!prompt.trim()) {
      taskStatus.textContent = '请选择模板或输入任务内容';
      return;
    }

    taskSubmit.disabled = true;
    taskStatus.textContent = allAgents[idx].name + ' 正在执行任务...';

    try {
      const resp = await fetch(SERVER_URL + '/api/task', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          agentId: allAgents[idx].id,
          agentIndex: idx,
          taskType: selectedTemplate?.id || 'custom',
          taskPrompt: prompt.trim(),
        }),
      });

      if (!resp.ok) throw new Error('服务器错误: ' + resp.status);
      const result = await resp.json();

      taskStatus.textContent = '任务完成！耗时 ' + (result.durationMs / 1000).toFixed(1) + 's';

      // 显示结果弹窗
      document.getElementById('result-title').textContent = result.agentName + ' 的工作成果';
      document.getElementById('result-meta').textContent = result.timestamp.slice(0, 19).replace('T', ' ') + ' · 耗时 ' + (result.durationMs / 1000).toFixed(1) + 's';
      document.getElementById('result-body').textContent = result.content;
      resultSave.textContent = result.savedPath ? '已保存到成果库' : '保存失败';
      resultModal.style.display = 'flex';
      resultModal.classList.add('open');
    } catch (err) {
      taskStatus.textContent = '执行失败: ' + err.message + '（请确认服务器已启动: bun run src/server.ts）';
    }

    taskSubmit.disabled = false;
  });

  // 关闭结果弹窗
  resultClose.addEventListener('click', () => {
    resultModal.classList.remove('open');
    resultModal.style.display = 'none';
  });
  resultModal.addEventListener('click', (e) => {
    if (e.target === resultModal) {
      resultModal.classList.remove('open');
      resultModal.style.display = 'none';
    }
  });

})();
// ══════════════════════════════════════════════════
// 用户登录系统
// ══════════════════════════════════════════════════
(function() {
  const SERVER = (window.__serverUrl || window.location.origin);
  const loginModal = document.getElementById('login-modal');
  const userBar = document.getElementById('user-bar');
  let currentUser = null;

  let serverOnline = false;

  // 访客模式：所有人默认不弹登录，直接进入浏览
  // 只有通过 ?login=1 参数才显示登录框
  const isLocal = location.hostname === 'localhost' || location.hostname === '127.0.0.1';
  const forceLogin = new URLSearchParams(location.search).has('login');

  fetch(SERVER + '/api/users', { signal: AbortSignal.timeout(10000) })
    .then(r => r.ok ? r.json() : null)
    .then(users => {
      if (users !== null) {
        serverOnline = true;
        setServerStatus(true);
        const savedId = localStorage.getItem('lobster-town-user-id');
        if (savedId) {
          fetch(SERVER + '/api/user/' + savedId).then(r => r.ok ? r.json() : null).then(user => {
            if (user) { setUser(user); } else if (forceLogin) { showLogin(); }
          }).catch(() => { if (forceLogin) showLogin(); });
        } else {
          // 访客模式：不弹登录，想注册的点右上角或加 ?login=1
          if (forceLogin) showLogin();
        }
      } else {
        setServerStatus(false);
        if (forceLogin) showLogin();
      }
    })
    .catch(() => {
      setServerStatus(false);
      if (forceLogin) showLogin();
    });

  function setServerStatus(online) {
    serverOnline = online;
    const sub = document.querySelector('.login-sub');
    const btn = document.getElementById('login-submit');
    if (!online) {
      if (sub) sub.innerHTML = '<span style="color:#ff5f63">⚠ 正在连接龙虾小镇服务...</span><br><span style="font-size:0.72rem;color:#888">如果持续无法连接，请联系小镇管理员</span>';
      // 每 3 秒自动重试连接
      const retryTimer = setInterval(() => {
        fetch(SERVER + '/api/users', { signal: AbortSignal.timeout(8000) })
          .then(r => r.ok ? r.json() : null)
          .then(users => {
            if (users !== null) {
              clearInterval(retryTimer);
              setServerStatus(true);
            }
          }).catch(() => {});
      }, 3000);
      if (btn) { btn.textContent = '🦞 服务器未启动'; btn.disabled = true; btn.style.opacity = '0.5'; }
    } else {
      if (sub) sub.textContent = '通过 OpenClaw 身份登录，成为小镇居民';
      if (btn) { btn.textContent = '🦞 进入龙虾小镇'; btn.disabled = false; btn.style.opacity = '1'; }
    }
  }

  function showLogin() {
    if (loginModal) loginModal.classList.add('open');
  }

  function setUser(user) {
    currentUser = user;
    localStorage.setItem('lobster-town-user-id', user.id);
    if (loginModal) loginModal.classList.remove('open');
    // 显示用户信息条
    if (userBar) {
      userBar.classList.add('show');
      document.getElementById('ub-name').textContent = user.name;
      document.getElementById('ub-mbti').textContent = user.mbti;
      document.getElementById('ub-tokens').textContent = user.tokens;
      updateModeBadge(user.mode);
    }
  }

  function updateModeBadge(mode) {
    const badge = document.getElementById('ub-mode');
    if (!badge) return;
    badge.className = 'mode-badge ' + mode;
    badge.textContent = mode === 'god' ? '上帝' : '居民';
  }

  // 注册
  const submitBtn = document.getElementById('login-submit');
  if (submitBtn) {
    submitBtn.addEventListener('click', async () => {
      const name = document.getElementById('login-name').value.trim();
      if (!name) { document.getElementById('login-name').style.borderColor = '#ff5f63'; return; }
      submitBtn.textContent = '正在进入...';
      submitBtn.disabled = true;
      try {
        const resp = await fetch(SERVER + '/api/user/register', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name,
            mbti: document.getElementById('login-mbti').value,
            role: document.getElementById('login-role').value || '小镇居民',
            openclawId: document.getElementById('login-openclaw').value || null,
            petName: document.getElementById('login-pet').value || '小龙',
          }),
        });
        if (resp.ok) {
          const user = await resp.json();
          setUser(user);
        } else {
          submitBtn.textContent = '注册失败，重试';
        }
      } catch (err) {
        submitBtn.textContent = '服务器未启动（需 --serve）';
      }
      submitBtn.disabled = false;
    });
  }

  // 跳过登录
  const skipBtn = document.getElementById('login-skip');
  if (skipBtn) {
    skipBtn.addEventListener('click', () => {
      if (loginModal) loginModal.classList.remove('open');
    });
  }

  // 模式切换（点击徽章）
  const modeBadge = document.getElementById('ub-mode');
  if (modeBadge) {
    modeBadge.addEventListener('click', async () => {
      if (!currentUser) return;
      try {
        const resp = await fetch(SERVER + '/api/user/action', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId: currentUser.id, action: 'switch-mode' }),
        });
        if (resp.ok) {
          const result = await resp.json();
          currentUser.mode = result.mode;
          updateModeBadge(result.mode);
        }
      } catch {}
    });
  }

  window.__currentUser = () => currentUser;
})();
</script>

</body>
</html>`;

  const filePath = join(outputDir, 'report.html');
  writeFileSync(filePath, html, 'utf-8');
  const jsonPath = join(outputDir, 'simulation.json');
  writeFileSync(jsonPath, JSON.stringify(log, null, 2), 'utf-8');
  return filePath;
}
