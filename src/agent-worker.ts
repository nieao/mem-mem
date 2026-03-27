/**
 * Agent 自主工作引擎
 * 每个 Agent 用 claude CLI 真实执行任务，生成 HTML 成果
 */

import type { AgentProfile } from './types.js';
import { chat } from './llm.js';
import { buildSystemPrompt, createAgentState } from './agent.js';
import { writeFileSync, mkdirSync, readFileSync, existsSync } from 'fs';
import { join } from 'path';
import type { HeartbeatTask } from './openclaw-sim.js';

export interface AgentTaskResult {
  agentId: string;
  agentName: string;
  taskTitle: string;
  content: string;
  durationMs: number;
  savedPath: string;
}

/**
 * 为单个 Agent 执行一个心跳任务
 * 调用真实 claude CLI，生成详细输出，保存为 HTML
 */
export async function executeAgentTask(
  agent: AgentProfile,
  task: HeartbeatTask,
  crucixContext: string,
  mockMode: boolean,
  model: string,
  memoryDir: string,
): Promise<AgentTaskResult> {
  const state = createAgentState(agent);

  // 读取 Agent 的 SOUL.md 作为系统提示基础
  const soulPath = join(memoryDir, agent.id, 'openclaw', 'SOUL.md');
  let soulContent = '';
  if (existsSync(soulPath)) {
    soulContent = readFileSync(soulPath, 'utf-8');
  }

  // 读取已有知识
  const knowledgePath = join(memoryDir, agent.id, 'knowledge.json');
  let knowledgeContext = '';
  if (existsSync(knowledgePath)) {
    try {
      const knowledge = JSON.parse(readFileSync(knowledgePath, 'utf-8'));
      if (knowledge.length > 0) {
        knowledgeContext = '\n## 你的知识库\n' +
          knowledge.slice(0, 10).map((k: any) => `- ${k.content}`).join('\n');
      }
    } catch {}
  }

  const systemPrompt = `${soulContent}
${knowledgeContext}
${crucixContext ? '\n## 今日情报\n' + crucixContext : ''}

## 任务执行模式
你现在独立执行工作任务，不是在讨论。
请认真、专业地完成任务。输出要有深度、有具体内容。
用中文输出，可用 Markdown 格式。字数 300-800 字。`;

  const userPrompt = `请执行以下任务：\n\n${task.title}\n\n请给出详细的执行结果和发现。`;

  const start = Date.now();
  const result = await chat(
    { systemPrompt, userPrompt, model, maxTokens: 2000, timeout: 180000 },
    mockMode,
  );
  const durationMs = Date.now() - start;

  // 保存为 HTML
  const savedPath = saveResultHtml(agent, task, result.text, durationMs, memoryDir);

  return {
    agentId: agent.id,
    agentName: agent.name,
    taskTitle: task.title,
    content: result.text,
    durationMs,
    savedPath,
  };
}

/**
 * 批量执行：所有 Agent 的 pending 心跳任务
 * 每个 Agent 只执行 1 个任务（控制成本），并行度 3
 */
export async function executeAllAgentTasks(
  agents: AgentProfile[],
  heartbeatMap: Map<string, HeartbeatTask[]>,
  crucixContextMap: Map<string, string>,
  mockMode: boolean,
  model: string,
  memoryDir: string,
  log: (msg: string) => void,
): Promise<AgentTaskResult[]> {
  const results: AgentTaskResult[] = [];

  // 收集每个 Agent 的第一个 pending 任务
  const taskQueue: { agent: AgentProfile; task: HeartbeatTask }[] = [];
  for (const agent of agents) {
    const tasks = heartbeatMap.get(agent.id) || [];
    const pending = tasks.find(t => t.status === 'pending');
    if (pending) {
      taskQueue.push({ agent, task: pending });
    }
  }

  if (taskQueue.length === 0) {
    log('  所有 Agent 无待办任务');
    return results;
  }

  log(`  ${taskQueue.length} 位 Agent 有待办任务，开始执行...`);

  // 并发执行（最多 3 个同时）
  const CONCURRENCY = 3;
  for (let i = 0; i < taskQueue.length; i += CONCURRENCY) {
    const batch = taskQueue.slice(i, i + CONCURRENCY);
    const batchResults = await Promise.all(
      batch.map(async ({ agent, task }) => {
        const crucixCtx = crucixContextMap.get(agent.id) || '';
        try {
          log(`  🦞 ${agent.name} 开始: ${task.title}`);
          const result = await executeAgentTask(
            agent, task, crucixCtx, mockMode, model, memoryDir,
          );
          // 标记任务完成
          task.status = 'done';
          task.completedAt = new Date().toISOString();
          log(`  ✓ ${agent.name} 完成 (${(result.durationMs / 1000).toFixed(1)}s) → ${result.savedPath}`);
          return result;
        } catch (err: any) {
          log(`  ✗ ${agent.name} 失败: ${err.message}`);
          return null;
        }
      })
    );
    results.push(...batchResults.filter(Boolean) as AgentTaskResult[]);
  }

  // 更新心跳文件
  for (const agent of agents) {
    const tasks = heartbeatMap.get(agent.id);
    if (tasks) {
      const hbPath = join(memoryDir, agent.id, 'openclaw', 'heartbeat.json');
      writeFileSync(hbPath, JSON.stringify(tasks, null, 2), 'utf-8');
    }
  }

  return results;
}

/** 保存任务结果为建筑极简风格 HTML */
function saveResultHtml(
  agent: AgentProfile,
  task: HeartbeatTask,
  content: string,
  durationMs: number,
  memoryDir: string,
): string {
  const libraryDir = join('reports', 'library', agent.id);
  mkdirSync(libraryDir, { recursive: true });

  // 也保存到 openclaw/tasks/
  const ocTasksDir = join(memoryDir, agent.id, 'openclaw', 'tasks');
  mkdirSync(ocTasksDir, { recursive: true });

  const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const fileName = `${ts}.html`;

  // Markdown → HTML 基础转换
  let htmlContent = content
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/^### (.+)$/gm, '<h3>$1</h3>')
    .replace(/^## (.+)$/gm, '<h2>$1</h2>')
    .replace(/^# (.+)$/gm, '<h1>$1</h1>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/```[\s\S]*?```/g, (m) => '<pre>' + m.slice(3, -3) + '</pre>')
    .replace(/^- (.+)$/gm, '<li>$1</li>')
    .replace(/^(\d+)\. (.+)$/gm, '<li>$2</li>')
    .replace(/\n\n/g, '</p><p>')
    .replace(/\n/g, '<br>');
  htmlContent = '<p>' + htmlContent + '</p>';

  const html = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${agent.name} — ${task.title}</title>
<style>
  :root { --warm: #c8a882; --warm-light: #e8d5c0; --warm-bg: #f5f0eb; --black: #1a1a1a; --dark: #2d2d2d; --gray-700: #555; --gray-500: #888; --gray-100: #e8e8e8; --white: #fafafa; }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: "Noto Sans SC", "Microsoft YaHei", system-ui, sans-serif; background: var(--white); color: var(--dark); line-height: 1.9; }
  .page { max-width: 800px; margin: 0 auto; padding: 60px 32px 80px; }
  /* 顶部暖色线 */
  .top-accent { height: 3px; background: var(--warm); }
  .header { padding: 32px 0 24px; border-bottom: 1px solid var(--gray-100); margin-bottom: 32px; }
  .label { font-size: 0.68rem; letter-spacing: 0.35em; color: var(--warm); text-transform: uppercase; margin-bottom: 12px; }
  .agent-row { display: flex; align-items: center; gap: 16px; margin-bottom: 12px; }
  .avatar { width: 48px; height: 48px; border-radius: 50%; background: ${'{0}'}; display: flex; align-items: center; justify-content: center; color: white; font-family: "Noto Serif SC", Georgia, serif; font-size: 1.3rem; box-shadow: 0 4px 16px rgba(0,0,0,0.1); }
  .agent-info h1 { font-family: "Noto Serif SC", Georgia, serif; font-size: 1.3rem; font-weight: 400; color: var(--black); }
  .agent-info .meta { font-size: 0.82rem; color: var(--gray-500); }
  .mbti-badge { font-size: 0.68rem; letter-spacing: 0.15em; border: 1px solid var(--warm); color: var(--warm); padding: 2px 12px; margin-left: auto; }
  .task-box { background: var(--warm-bg); padding: 16px 20px; margin-bottom: 32px; border-left: 3px solid var(--warm); }
  .task-box .task-label { font-size: 0.68rem; letter-spacing: 0.2em; color: var(--warm); margin-bottom: 4px; }
  .task-box .task-title { font-size: 0.92rem; color: var(--black); }
  .content { font-size: 0.92rem; color: var(--dark); line-height: 2; }
  .content h1 { font-family: "Noto Serif SC", Georgia, serif; font-size: 1.25rem; font-weight: 400; color: var(--black); margin: 28px 0 12px; padding-bottom: 8px; border-bottom: 1px solid var(--gray-100); }
  .content h2 { font-family: "Noto Serif SC", Georgia, serif; font-size: 1.1rem; font-weight: 400; color: var(--black); margin: 24px 0 10px; }
  .content h3 { font-size: 0.95rem; color: var(--gray-700); margin: 20px 0 8px; }
  .content code { background: var(--warm-bg); padding: 2px 6px; font-size: 0.88em; color: var(--black); }
  .content pre { background: var(--black); color: #e8e0d4; padding: 16px 20px; overflow-x: auto; font-size: 0.85rem; line-height: 1.6; margin: 16px 0; }
  .content li { margin-left: 24px; margin-bottom: 4px; }
  .content strong { color: var(--black); }
  .content em { color: var(--gray-700); }
  .footer { margin-top: 48px; padding-top: 24px; border-top: 1px solid var(--gray-100); display: flex; justify-content: space-between; align-items: center; }
  .footer-left { font-size: 0.75rem; color: var(--gray-500); letter-spacing: 0.08em; }
  .footer-right { font-size: 0.7rem; color: var(--warm); letter-spacing: 0.1em; }
</style>
</head>
<body>
<div class="top-accent"></div>
<div class="page">
  <div class="header">
    <div class="label">OPENCLAW AGENT 工作成果</div>
    <div class="agent-row">
      <div class="avatar" style="background:${getAgentColor(agent)}">${agent.name.charAt(0)}</div>
      <div class="agent-info">
        <h1>${agent.name} 的工作报告</h1>
        <div class="meta">${agent.role} · ${agent.personality.archetype} · ${new Date().toISOString().slice(0, 19).replace('T', ' ')}</div>
      </div>
      <div class="mbti-badge">${agent.personality.mbti}</div>
    </div>
  </div>
  <div class="task-box">
    <div class="task-label">执行任务</div>
    <div class="task-title">${task.title}</div>
  </div>
  <div class="content">${htmlContent}</div>
  <div class="footer">
    <div class="footer-left">耗时 ${(durationMs / 1000).toFixed(1)}s · ${agent.personality.mbti} 视角</div>
    <div class="footer-right">龙虾小镇</div>
  </div>
</div>
</body>
</html>`.replace("${'{0}'}", getAgentColor(agent));

  // 保存到两个位置
  const libraryPath = join(libraryDir, fileName);
  writeFileSync(libraryPath, html, 'utf-8');
  writeFileSync(join(ocTasksDir, fileName), html, 'utf-8');

  return libraryPath;
}

function getAgentColor(agent: AgentProfile): string {
  const palette: Record<string, string> = {
    INTJ: '#6b7b8d', INTP: '#7b8fa1', ENTJ: '#8b6f5e', ENTP: '#9b8b6e',
    INFJ: '#7b6b8d', INFP: '#8b7b9b', ENFJ: '#8b7b6b', ENFP: '#9b8b7b',
    ISTJ: '#6b7b7b', ISFJ: '#7b8b8b', ESTJ: '#7b6b6b', ESFJ: '#8b7b7b',
    ISTP: '#6b8b7b', ISFP: '#7b9b8b', ESTP: '#8b7b6b', ESFP: '#9b8b7b',
  };
  return palette[agent.personality.mbti] || '#888';
}
