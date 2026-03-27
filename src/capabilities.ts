/**
 * 能力执行引擎 — Claude CLI / Ollama / ComfyUI 三类执行器
 * 所有执行都经过 sandbox.ts 校验，结果记录审计日志
 */

import { spawn } from 'child_process';
import { writeFileSync, mkdirSync, readFileSync, existsSync } from 'fs';
import { join } from 'path';

import type { AgentProfile } from './types.js';
import type { SkillCard, ExecutorType, PlayCardResult, ComboRule } from './skill-cards.js';
import { CARD_REGISTRY, playCards, detectCombo, getHand } from './skill-cards.js';
import {
  createSandboxContext, validateInput, recordAudit, recordRateLimitCall,
  recordTokenUsage, generateAuditId, isAllowedUrl, ALLOWED_LOCAL_PORTS,
  type SandboxContext, type AuditEntry,
} from './sandbox.js';

// ══════════════════════════════════════
// 类型定义
// ══════════════════════════════════════

export interface CapabilityInput {
  prompt: string;                    // 用户输入的任务描述
  context?: string;                  // 附加上下文
  imagePath?: string;                // 输入图片（img2img）
  targetPath?: string;               // 输出目标路径
}

export interface CapabilityResult {
  success: boolean;
  cardId: string;
  output: string;
  outputType: 'text' | 'html' | 'image-path' | 'json';
  durationMs: number;
  tokensUsed: number;
  auditId: string;
  savedPath?: string;
  combo?: { comboName: string; bonus: ComboRule['bonus'] };
  error?: string;
}

// ══════════════════════════════════════
// 统一执行入口
// ══════════════════════════════════════

/**
 * 执行单张卡牌能力
 * 流程：沙箱校验 → 出牌（扣能量+冷却）→ 分发执行器 → 审计记录
 */
export async function executeCapability(
  agent: AgentProfile,
  cardId: string,
  input: CapabilityInput,
  mockMode = false,
): Promise<CapabilityResult> {
  const start = Date.now();
  const auditId = generateAuditId();
  const card = CARD_REGISTRY.find(c => c.id === cardId);

  if (!card) {
    return makeError(cardId, auditId, '卡牌不存在');
  }

  // 创建沙箱上下文
  const sandbox = createSandboxContext(agent.id);

  // 沙箱校验
  const check = validateInput(
    { command: input.prompt, targetPath: input.targetPath, capabilityId: cardId },
    sandbox,
  );

  if (!check.allowed) {
    const entry = buildAuditEntry(auditId, agent.id, cardId, input.prompt, '', false, check.reason!, 0, 0);
    recordAudit(entry);
    return makeError(cardId, auditId, check.reason!);
  }

  // 出牌（扣能量 + 冷却）
  const playResult = playCards(agent.id, [cardId]);
  if (!playResult.success) {
    return makeError(cardId, auditId, playResult.message);
  }

  // 分发执行器
  // mock 模式只拦截 Claude CLI（花钱），本地 Ollama/ComfyUI 在线时直连真实执行器
  let result: CapabilityResult;
  try {
    if (card.executor === 'comfyui') {
      // ComfyUI：检测在线则走真实执行器，离线才 mock
      const health = await checkComfyUIHealth();
      if (health.available) {
        result = await executeComfyUI(card, input, sandbox, auditId);
      } else {
        result = await executeMock(card, input, auditId);
      }
    } else if (card.executor === 'ollama') {
      // Ollama：检测在线则走真实执行器，离线才 mock
      const health = await checkOllamaHealth();
      if (health.available) {
        result = await executeOllama(card, input, sandbox, auditId);
      } else {
        result = await executeMock(card, input, auditId);
      }
    } else if (card.executor === 'claude-skill') {
      // Claude CLI：mock 模式走 mock，否则走真实
      if (mockMode) {
        result = await executeMock(card, input, auditId);
      } else {
        result = await executeClaude(card, input, sandbox, auditId);
      }
    } else {
      result = makeError(cardId, auditId, `未知执行器类型: ${card.executor}`);
    }
  } catch (err: any) {
    result = makeError(cardId, auditId, `执行异常: ${err.message}`);
  }

  result.durationMs = Date.now() - start;

  // 记录速率和 Token
  recordRateLimitCall(agent.id);
  recordTokenUsage(agent.id, result.tokensUsed);

  // 审计记录
  const entry = buildAuditEntry(
    auditId, agent.id, cardId, input.prompt,
    result.output.slice(0, 500), result.success,
    result.error, result.durationMs, result.tokensUsed,
  );
  recordAudit(entry);

  return result;
}

/**
 * 执行多张卡牌（Combo 连携）
 * 按顺序执行每张卡牌，汇总结果，应用 Combo 加成
 */
export async function executeCombo(
  agent: AgentProfile,
  cardIds: string[],
  input: CapabilityInput,
  mockMode = false,
): Promise<CapabilityResult> {
  if (cardIds.length === 1) {
    return executeCapability(agent, cardIds[0], input, mockMode);
  }

  const start = Date.now();
  const auditId = generateAuditId();

  // 检测 Combo
  const combo = detectCombo(cardIds);

  // 按顺序执行
  const outputs: string[] = [];
  let totalTokens = 0;
  let lastOutputType: CapabilityResult['outputType'] = 'text';

  for (const cardId of cardIds) {
    // 后续卡牌可以用前一张的输出作为上下文
    const cardInput: CapabilityInput = {
      ...input,
      context: outputs.length > 0
        ? `前序卡牌输出:\n${outputs[outputs.length - 1]}\n\n${input.context || ''}`
        : input.context,
    };

    const result = await executeCapability(agent, cardId, cardInput, mockMode);
    if (!result.success) {
      return { ...result, auditId };
    }

    outputs.push(result.output);
    totalTokens += result.tokensUsed;
    lastOutputType = result.outputType;
  }

  // 合并输出
  const combinedOutput = outputs.join('\n\n---\n\n');

  return {
    success: true,
    cardId: cardIds.join('+'),
    output: combinedOutput,
    outputType: lastOutputType,
    durationMs: Date.now() - start,
    tokensUsed: totalTokens,
    auditId,
    combo: combo ? { comboName: combo.name, bonus: combo.bonus } : undefined,
  };
}

// ══════════════════════════════════════
// Claude CLI 执行器
// ══════════════════════════════════════

async function executeClaude(
  card: SkillCard,
  input: CapabilityInput,
  sandbox: SandboxContext,
  auditId: string,
): Promise<CapabilityResult> {
  const systemPrompt = card.executorConfig.systemPrompt || '';
  const model = card.executorConfig.model || 'claude-haiku-4-5-20251001';
  const timeout = card.executorConfig.timeoutMs || 60_000;

  const userPrompt = input.context
    ? `${input.prompt}\n\n## 附加上下文\n${input.context}`
    : input.prompt;

  const args = ['-p', '--model', model, '--output-format', 'text'];
  if (systemPrompt) {
    args.push('--system-prompt', systemPrompt);
  }

  return new Promise<CapabilityResult>((resolve) => {
    let settled = false;
    const settle = (fn: () => void) => {
      if (!settled) { settled = true; clearTimeout(timer); fn(); }
    };

    const proc = spawn('claude', args, {
      stdio: ['pipe', 'pipe', 'pipe'],
      shell: true,
    });

    let stdout = '';
    let stderr = '';

    proc.stdout.on('data', (chunk: Buffer) => { stdout += chunk.toString('utf-8'); });
    proc.stderr.on('data', (chunk: Buffer) => { stderr += chunk.toString('utf-8'); });

    proc.on('close', (code) => {
      if (code !== 0) {
        settle(() => resolve(makeError(card.id, auditId, `Claude CLI 退出码 ${code}: ${stderr.slice(0, 200)}`)));
      } else {
        const tokensUsed = Math.ceil((systemPrompt.length + userPrompt.length + stdout.length) / 2);
        settle(() => resolve({
          success: true,
          cardId: card.id,
          output: stdout.trim(),
          outputType: 'text',
          durationMs: 0,
          tokensUsed,
          auditId,
        }));
      }
    });

    proc.on('error', (err) => {
      settle(() => resolve(makeError(card.id, auditId, `Claude CLI 启动失败: ${err.message}`)));
    });

    proc.stdin.write(userPrompt, 'utf-8');
    proc.stdin.end();

    const timer = setTimeout(() => {
      proc.kill('SIGTERM');
      settle(() => resolve(makeError(card.id, auditId, `Claude CLI 超时 (${timeout}ms)`)));
    }, timeout);
  });
}

// ══════════════════════════════════════
// Ollama 执行器
// ══════════════════════════════════════

async function executeOllama(
  card: SkillCard,
  input: CapabilityInput,
  sandbox: SandboxContext,
  auditId: string,
): Promise<CapabilityResult> {
  const model = card.executorConfig.ollamaModel || 'qwen2.5:7b';
  const systemPrompt = card.executorConfig.systemPrompt || '';
  const timeout = card.executorConfig.timeoutMs || 30_000;
  const port = ALLOWED_LOCAL_PORTS.ollama;
  const url = `http://localhost:${port}/api/generate`;

  // URL 安全检查
  if (!isAllowedUrl(url)) {
    return makeError(card.id, auditId, '铁律2违规：非本地URL');
  }

  const userPrompt = input.context
    ? `${input.prompt}\n\n附加上下文:\n${input.context}`
    : input.prompt;

  const prompt = systemPrompt
    ? `${systemPrompt}\n\n用户请求:\n${userPrompt}`
    : userPrompt;

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        prompt,
        stream: false,
        options: {
          num_predict: card.executorConfig.maxTokens || 2000,
        },
      }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      return makeError(card.id, auditId, `Ollama HTTP ${response.status}: ${await response.text()}`);
    }

    const data = await response.json() as any;
    const output = data.response || '';
    const tokensUsed = (data.eval_count || 0) + (data.prompt_eval_count || 0);

    return {
      success: true,
      cardId: card.id,
      output,
      outputType: 'text',
      durationMs: 0,
      tokensUsed,
      auditId,
    };
  } catch (err: any) {
    if (err.name === 'AbortError') {
      return makeError(card.id, auditId, `Ollama 超时 (${timeout}ms)`);
    }
    return makeError(card.id, auditId, `Ollama 调用失败: ${err.message}`);
  }
}

// ══════════════════════════════════════
// ComfyUI 执行器（Flux2-Klein 真实工作流）
// ══════════════════════════════════════

/** 加载 Flux2-Klein 工作流模板 */
function loadFlux2KleinWorkflow(): object | null {
  const workflowPath = join(__dirname, 'workflows', 'flux2-klein-txt2img.json');
  // 兼容 bun 运行（__dirname 可能不可用）
  const paths = [
    workflowPath,
    join('.', 'src', 'workflows', 'flux2-klein-txt2img.json'),
    join(process.cwd(), 'src', 'workflows', 'flux2-klein-txt2img.json'),
  ];
  for (const p of paths) {
    if (existsSync(p)) {
      try { return JSON.parse(readFileSync(p, 'utf-8')); } catch {}
    }
  }
  return null;
}

/** 用 Claude CLI 生成英文 ComfyUI 提示词 */
async function generateImagePrompt(userRequest: string): Promise<string> {
  const systemPrompt = 'You are a Stable Diffusion / Flux prompt expert. Convert the user request into a high-quality English image generation prompt. Output ONLY the prompt text, nothing else. Use comma-separated descriptive tags. Include style, lighting, composition, quality tags like "masterpiece, best quality, highly detailed".';

  return new Promise<string>((resolve) => {
    let settled = false;
    const settle = (fn: () => void) => {
      if (!settled) { settled = true; clearTimeout(timer); fn(); }
    };

    const args = ['-p', '--model', 'claude-haiku-4-5-20251001', '--output-format', 'text', '--system-prompt', systemPrompt];
    const proc = spawn('claude', args, { stdio: ['pipe', 'pipe', 'pipe'], shell: true });

    let stdout = '';
    proc.stdout.on('data', (chunk: Buffer) => { stdout += chunk.toString('utf-8'); });
    proc.on('close', (code) => {
      settle(() => resolve(code === 0 && stdout.trim() ? stdout.trim() : userRequest));
    });
    proc.on('error', () => {
      settle(() => resolve(userRequest));
    });

    proc.stdin.write(userRequest, 'utf-8');
    proc.stdin.end();

    const timer = setTimeout(() => {
      proc.kill('SIGTERM');
      settle(() => resolve(userRequest));
    }, 30_000);
  });
}

async function executeComfyUI(
  card: SkillCard,
  input: CapabilityInput,
  sandbox: SandboxContext,
  auditId: string,
): Promise<CapabilityResult> {
  const timeout = card.executorConfig.timeoutMs || 180_000;
  const port = ALLOWED_LOCAL_PORTS.comfyui;
  const baseUrl = `http://localhost:${port}`;

  // URL 安全检查
  if (!isAllowedUrl(baseUrl)) {
    return makeError(card.id, auditId, '铁律2违规：非本地URL');
  }

  // 加载真实 Flux2-Klein 工作流
  const workflow = loadFlux2KleinWorkflow();
  if (!workflow) {
    return makeError(card.id, auditId, '工作流文件加载失败: src/workflows/flux2-klein-txt2img.json');
  }

  try {
    // 用 Claude CLI 将用户请求转为英文提示词
    const imagePrompt = await generateImagePrompt(input.prompt);

    // 深拷贝工作流，注入提示词 + 随机种子
    const workflowData = JSON.parse(JSON.stringify(workflow));

    // 节点 76（PrimitiveStringMultiline）= 提示词输入
    if (workflowData['76']) {
      workflowData['76'].inputs.value = imagePrompt;
    }

    // 节点 75:73（RandomNoise）= 随机种子
    if (workflowData['75:73']) {
      workflowData['75:73'].inputs.noise_seed = Math.floor(Math.random() * Number.MAX_SAFE_INTEGER);
    }

    // 节点 9（SaveImage）= 文件名前缀
    if (workflowData['9']) {
      workflowData['9'].inputs.filename_prefix = `agent-${sandbox.agentId}`;
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    // 提交工作流到 ComfyUI
    const response = await fetch(`${baseUrl}/api/prompt`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt: workflowData }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const errText = await response.text();
      return makeError(card.id, auditId, `ComfyUI HTTP ${response.status}: ${errText.slice(0, 300)}`);
    }

    const data = await response.json() as any;
    const promptId = data.prompt_id;

    // 等待完成（轮询历史）
    const outputPath = await waitForComfyUIResult(baseUrl, promptId, sandbox.workspacePath, timeout);

    return {
      success: true,
      cardId: card.id,
      output: outputPath,
      outputType: 'image-path',
      durationMs: 0,
      tokensUsed: 100,
      auditId,
      generatedPrompt: imagePrompt, // 附带生成的提示词
    } as CapabilityResult & { generatedPrompt: string };
  } catch (err: any) {
    if (err.name === 'AbortError') {
      return makeError(card.id, auditId, `ComfyUI 超时 (${timeout}ms)`);
    }
    return makeError(card.id, auditId, `ComfyUI 调用失败: ${err.message}`);
  }
}

/** 轮询等待 ComfyUI 任务完成 */
async function waitForComfyUIResult(
  baseUrl: string,
  promptId: string,
  outputDir: string,
  timeoutMs: number,
): Promise<string> {
  const start = Date.now();
  const pollInterval = 2000; // 2 秒轮询

  while (Date.now() - start < timeoutMs) {
    await new Promise(r => setTimeout(r, pollInterval));

    try {
      const res = await fetch(`${baseUrl}/api/history/${promptId}`);
      if (!res.ok) continue;
      const history = await res.json() as any;

      if (history[promptId] && history[promptId].outputs) {
        // 找到输出图片
        const outputs = history[promptId].outputs;
        for (const nodeId of Object.keys(outputs)) {
          const images = outputs[nodeId]?.images;
          if (images && images.length > 0) {
            const img = images[0];
            // 下载图片到 Agent workspace
            const imgRes = await fetch(`${baseUrl}/api/view?filename=${img.filename}&subfolder=${img.subfolder || ''}&type=${img.type || 'output'}`);
            if (imgRes.ok) {
              const buffer = Buffer.from(await imgRes.arrayBuffer());
              mkdirSync(outputDir, { recursive: true });
              const savePath = join(outputDir, `${promptId}.png`);
              writeFileSync(savePath, buffer);
              return savePath;
            }
          }
        }
      }
    } catch {
      // 继续轮询
    }
  }

  throw new Error(`ComfyUI 任务超时 (${timeoutMs}ms)`);
}

// ══════════════════════════════════════
// Mock 执行器
// ══════════════════════════════════════

async function executeMock(
  card: SkillCard,
  input: CapabilityInput,
  auditId: string,
): Promise<CapabilityResult> {
  await new Promise(r => setTimeout(r, 200 + Math.random() * 300));

  const mockOutputs: Record<ExecutorType, string> = {
    'claude-skill': `[Mock] ${card.name} 执行完成。\n\n针对「${input.prompt.slice(0, 50)}」的分析报告：\n1. 整体结构合理，符合最佳实践\n2. 建议优化错误处理逻辑\n3. 安全性评分：8.5/10`,
    'ollama': `[Mock Ollama] ${card.name} 推理完成。\n\n核心要点：\n- 输入内容已分析完毕\n- 关键信息已提取\n- 建议下一步行动方案已生成`,
    'comfyui': `[Mock ComfyUI] ${card.name} 生成完成。\n图片已保存到: ./agent-memories/${input.prompt.slice(0, 20)}/workspace/mock-output.png`,
  };

  return {
    success: true,
    cardId: card.id,
    output: mockOutputs[card.executor],
    outputType: card.executor === 'comfyui' ? 'image-path' : 'text',
    durationMs: 250,
    tokensUsed: 100,
    auditId,
  };
}

// ══════════════════════════════════════
// 服务健康检查
// ══════════════════════════════════════

/** 检查 Ollama 是否可用 */
export async function checkOllamaHealth(): Promise<{ available: boolean; models?: string[] }> {
  try {
    const res = await fetch(`http://localhost:${ALLOWED_LOCAL_PORTS.ollama}/api/tags`, { signal: AbortSignal.timeout(3000) });
    if (!res.ok) return { available: false };
    const data = await res.json() as any;
    return { available: true, models: data.models?.map((m: any) => m.name) || [] };
  } catch {
    return { available: false };
  }
}

/** 检查 ComfyUI 是否可用 */
export async function checkComfyUIHealth(): Promise<{ available: boolean }> {
  try {
    const res = await fetch(`http://localhost:${ALLOWED_LOCAL_PORTS.comfyui}/api/system_stats`, { signal: AbortSignal.timeout(3000) });
    return { available: res.ok };
  } catch {
    return { available: false };
  }
}

// ══════════════════════════════════════
// 工具函数
// ══════════════════════════════════════

function makeError(cardId: string, auditId: string, error: string): CapabilityResult {
  return {
    success: false, cardId, output: '', outputType: 'text',
    durationMs: 0, tokensUsed: 0, auditId, error,
  };
}

function buildAuditEntry(
  id: string, agentId: string, capabilityId: string,
  input: string, output: string, allowed: boolean,
  blockedReason: string | undefined, durationMs: number, tokensUsed: number,
): AuditEntry {
  return {
    id, timestamp: new Date().toISOString(),
    agentId, capabilityId, input, output,
    allowed, blockedReason, durationMs, tokensUsed,
  };
}

// ══════════════════════════════════════
// 保存结果为 HTML（复用 agent-worker 模式）
// ══════════════════════════════════════

/** 将能力执行结果保存为 HTML 文件 */
export function saveResultAsHtml(
  agentId: string,
  agentName: string,
  cardName: string,
  result: CapabilityResult,
): string {
  const libraryDir = join('./reports/library', agentId);
  mkdirSync(libraryDir, { recursive: true });

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const filePath = join(libraryDir, `${timestamp}.html`);

  const comboHtml = result.combo
    ? `<div style="background:#f5f0eb;padding:12px 20px;border-left:3px solid #c8a882;margin:16px 0;border-radius:4px">
         <strong>Combo: ${result.combo.comboName}</strong>
         <span style="margin-left:12px;color:#888">质量 x${result.combo.bonus.qualityMultiplier} · 奖励 x${result.combo.bonus.rewardMultiplier}</span>
       </div>`
    : '';

  const contentHtml = result.outputType === 'image-path'
    ? `<p>图片已保存到: <code>${result.output}</code></p>`
    : `<div style="white-space:pre-wrap;font-family:monospace;background:#f8f8f8;padding:20px;border-radius:4px;line-height:1.7">${escapeHtml(result.output)}</div>`;

  const html = `<!DOCTYPE html>
<html lang="zh-CN">
<head><meta charset="UTF-8"><title>${agentName} - ${cardName}</title>
<style>
  body{font-family:"Noto Sans SC",system-ui,sans-serif;max-width:800px;margin:40px auto;padding:0 20px;color:#2d2d2d;line-height:1.8;background:#fafafa}
  h1{font-family:"Noto Serif SC",Georgia,serif;color:#1a1a1a;border-bottom:2px solid #c8a882;padding-bottom:12px}
  .meta{color:#888;font-size:0.85rem;margin-bottom:24px}
  .badge{display:inline-block;padding:2px 10px;border-radius:2px;font-size:0.75rem;margin-right:8px}
  .badge-warm{background:#f5f0eb;color:#a68960}
  .badge-green{background:#eef5ec;color:#5a7a4f}
</style></head>
<body>
<h1>${agentName} · ${cardName}</h1>
<div class="meta">
  <span class="badge badge-warm">耗时 ${result.durationMs}ms</span>
  <span class="badge badge-green">Token ${result.tokensUsed}</span>
  <span class="badge badge-warm">${new Date().toLocaleString('zh-CN')}</span>
</div>
${comboHtml}
${contentHtml}
</body></html>`;

  writeFileSync(filePath, html, 'utf-8');
  return filePath;
}

function escapeHtml(str: string): string {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
