/**
 * LLM 调用层 — 云端多模型适配
 * 支持: Claude / GPT / Gemini / DeepSeek / Qwen / MiniMax / GLM / 豆包
 * 节能模式: 服务器后台最小化调用，依赖外部玩家自带 API Key
 */

// ── 类型定义 ──

export interface LlmCallOptions {
  systemPrompt: string;
  userPrompt: string;
  model?: string;
  maxTokens?: number;
  timeout?: number;
  userId?: string;  // 使用谁的 API Key
}

export interface LlmResult {
  text: string;
  durationMs: number;
  provider?: string;
  model?: string;
}

export interface ProviderConfig {
  id: string;
  name: string;
  models: { id: string; name: string; default?: boolean }[];
  apiBase: string;
  keyPrefix: string;  // 用于识别 key 格式
}

export interface ApiKeyEntry {
  provider: string;
  apiKey: string;
  model?: string;
  addedAt: string;
}

// ── 支持的模型提供商 ──

export const PROVIDERS: ProviderConfig[] = [
  {
    id: 'claude',
    name: 'Claude (Anthropic)',
    models: [
      { id: 'claude-sonnet-4-6', name: 'Claude Sonnet 4.6', default: true },
      { id: 'claude-haiku-4-5-20251001', name: 'Claude Haiku 4.5' },
      { id: 'claude-opus-4-6', name: 'Claude Opus 4.6' },
    ],
    apiBase: 'https://api.anthropic.com/v1',
    keyPrefix: 'sk-ant-',
  },
  {
    id: 'openai',
    name: 'GPT (OpenAI)',
    models: [
      { id: 'gpt-4o', name: 'GPT-4o', default: true },
      { id: 'gpt-4o-mini', name: 'GPT-4o Mini' },
      { id: 'o3-mini', name: 'o3-mini' },
    ],
    apiBase: 'https://api.openai.com/v1',
    keyPrefix: 'sk-',
  },
  {
    id: 'gemini',
    name: 'Gemini (Google)',
    models: [
      { id: 'gemini-2.5-flash', name: 'Gemini 2.5 Flash', default: true },
      { id: 'gemini-2.5-pro', name: 'Gemini 2.5 Pro' },
    ],
    apiBase: 'https://generativelanguage.googleapis.com/v1beta',
    keyPrefix: 'AIza',
  },
  {
    id: 'deepseek',
    name: 'DeepSeek',
    models: [
      { id: 'deepseek-chat', name: 'DeepSeek V3', default: true },
      { id: 'deepseek-reasoner', name: 'DeepSeek R1' },
    ],
    apiBase: 'https://api.deepseek.com/v1',
    keyPrefix: 'sk-',
  },
  {
    id: 'qwen',
    name: 'Qwen (阿里百炼)',
    models: [
      { id: 'qwen-max', name: 'Qwen Max', default: true },
      { id: 'qwen-plus', name: 'Qwen Plus' },
      { id: 'qwen-turbo', name: 'Qwen Turbo' },
      { id: 'qwen3-235b-a22b', name: 'Qwen3 235B' },
    ],
    apiBase: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    keyPrefix: 'sk-',
  },
  {
    id: 'minimax',
    name: 'MiniMax',
    models: [
      { id: 'MiniMax-M2.7', name: 'MiniMax-M2.7', default: true },
      { id: 'MiniMax-Text-01', name: 'MiniMax-Text-01' },
    ],
    apiBase: 'https://api.minimax.chat/v1',
    keyPrefix: '',
  },
  {
    id: 'glm',
    name: 'GLM (智谱)',
    models: [
      { id: 'glm-4-plus', name: 'GLM-4 Plus', default: true },
      { id: 'glm-4-flash', name: 'GLM-4 Flash' },
    ],
    apiBase: 'https://open.bigmodel.cn/api/paas/v4',
    keyPrefix: '',
  },
  {
    id: 'doubao',
    name: '豆包 (字节跳动)',
    models: [
      { id: 'doubao-1-5-pro-256k', name: '豆包 1.5 Pro', default: true },
      { id: 'doubao-1-5-lite-32k', name: '豆包 1.5 Lite' },
    ],
    apiBase: 'https://ark.cn-beijing.volces.com/api/v3',
    keyPrefix: '',
  },
];

// ── API Key 存储 ──

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';

const CONFIG_DIR = './config';
const KEYS_FILE = join(CONFIG_DIR, 'api-keys.json');
const MEMORY_DIR = './agent-memories';

/** 加载服务器全局 API Keys */
export function loadServerKeys(): ApiKeyEntry[] {
  if (!existsSync(KEYS_FILE)) return [];
  try { return JSON.parse(readFileSync(KEYS_FILE, 'utf-8')); } catch { return []; }
}

/** 保存服务器全局 API Keys */
export function saveServerKeys(keys: ApiKeyEntry[]): void {
  mkdirSync(CONFIG_DIR, { recursive: true });
  writeFileSync(KEYS_FILE, JSON.stringify(keys, null, 2), 'utf-8');
}

/** 加载用户个人 API Keys */
export function loadUserKeys(userId: string): ApiKeyEntry[] {
  const p = join(MEMORY_DIR, userId, 'api-keys.json');
  if (!existsSync(p)) return [];
  try { return JSON.parse(readFileSync(p, 'utf-8')); } catch { return []; }
}

/** 保存用户个人 API Keys */
export function saveUserKeys(userId: string, keys: ApiKeyEntry[]): void {
  const dir = join(MEMORY_DIR, userId);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'api-keys.json'), JSON.stringify(keys, null, 2), 'utf-8');
}

/** 获取可用的 API Key（优先用户 → 全局 → null） */
function resolveApiKey(userId?: string, preferredProvider?: string): { provider: string; apiKey: string; model: string; apiBase: string } | null {
  // 1. 用户自己的 key
  if (userId) {
    const userKeys = loadUserKeys(userId);
    if (preferredProvider) {
      const match = userKeys.find(k => k.provider === preferredProvider);
      if (match) {
        const prov = PROVIDERS.find(p => p.id === match.provider);
        const model = match.model || prov?.models.find(m => m.default)?.id || prov?.models[0]?.id || '';
        return { provider: match.provider, apiKey: match.apiKey, model, apiBase: prov?.apiBase || '' };
      }
    }
    // 用用户的任意可用 key
    if (userKeys.length > 0) {
      const k = userKeys[0];
      const prov = PROVIDERS.find(p => p.id === k.provider);
      const model = k.model || prov?.models.find(m => m.default)?.id || prov?.models[0]?.id || '';
      return { provider: k.provider, apiKey: k.apiKey, model, apiBase: prov?.apiBase || '' };
    }
  }

  // 2. 服务器全局 key
  const serverKeys = loadServerKeys();
  if (preferredProvider) {
    const match = serverKeys.find(k => k.provider === preferredProvider);
    if (match) {
      const prov = PROVIDERS.find(p => p.id === match.provider);
      const model = match.model || prov?.models.find(m => m.default)?.id || prov?.models[0]?.id || '';
      return { provider: match.provider, apiKey: match.apiKey, model, apiBase: prov?.apiBase || '' };
    }
  }
  if (serverKeys.length > 0) {
    const k = serverKeys[0];
    const prov = PROVIDERS.find(p => p.id === k.provider);
    const model = k.model || prov?.models.find(m => m.default)?.id || prov?.models[0]?.id || '';
    return { provider: k.provider, apiKey: k.apiKey, model, apiBase: prov?.apiBase || '' };
  }

  return null;
}

// ── Token 消耗追踪 ──

export interface TokenStats {
  totalCalls: number;
  totalInputChars: number;
  totalOutputChars: number;
  totalDurationMs: number;
  byAgent: Record<string, { calls: number; inputChars: number; outputChars: number }>;
  estimatedTokens: number;
  estimatedCost: number;
  byProvider: Record<string, number>;  // 每个提供商的调用次数
}

const tokenStats: TokenStats = {
  totalCalls: 0, totalInputChars: 0, totalOutputChars: 0,
  totalDurationMs: 0, byAgent: {}, estimatedTokens: 0, estimatedCost: 0,
  byProvider: {},
};

function trackTokens(input: string, output: string, durationMs: number, agentId?: string, provider?: string) {
  const inChars = input.length;
  const outChars = output.length;
  tokenStats.totalCalls++;
  tokenStats.totalInputChars += inChars;
  tokenStats.totalOutputChars += outChars;
  tokenStats.totalDurationMs += durationMs;
  const inTokens = Math.ceil(inChars / 2);
  const outTokens = Math.ceil(outChars / 2);
  tokenStats.estimatedTokens += inTokens + outTokens;
  tokenStats.estimatedCost += (inTokens * 0.80 + outTokens * 4.0) / 1_000_000;

  if (agentId) {
    if (!tokenStats.byAgent[agentId]) tokenStats.byAgent[agentId] = { calls: 0, inputChars: 0, outputChars: 0 };
    tokenStats.byAgent[agentId].calls++;
    tokenStats.byAgent[agentId].inputChars += inChars;
    tokenStats.byAgent[agentId].outputChars += outChars;
  }
  if (provider) {
    tokenStats.byProvider[provider] = (tokenStats.byProvider[provider] || 0) + 1;
  }
}

export function getTokenStats(): TokenStats { return tokenStats; }
export function resetTokenStats() {
  tokenStats.totalCalls = 0; tokenStats.totalInputChars = 0; tokenStats.totalOutputChars = 0;
  tokenStats.totalDurationMs = 0; tokenStats.byAgent = {}; tokenStats.estimatedTokens = 0;
  tokenStats.estimatedCost = 0; tokenStats.byProvider = {};
}

// ── 云端 API 调用 ──

/** 调用 OpenAI 兼容 API（GPT / DeepSeek / Qwen / MiniMax / GLM / 豆包） */
async function callOpenAICompatible(
  apiBase: string, apiKey: string, model: string,
  systemPrompt: string, userPrompt: string, maxTokens: number, timeout: number,
): Promise<string> {
  const messages: any[] = [];
  if (systemPrompt) messages.push({ role: 'system', content: systemPrompt });
  messages.push({ role: 'user', content: userPrompt });

  const resp = await fetch(`${apiBase}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({ model, messages, max_tokens: maxTokens }),
    signal: AbortSignal.timeout(timeout),
  });

  if (!resp.ok) {
    const errText = await resp.text().catch(() => '');
    throw new Error(`API 错误 ${resp.status}: ${errText.slice(0, 200)}`);
  }

  const data = await resp.json() as any;
  return data.choices?.[0]?.message?.content || '';
}

/** 调用 Claude API */
async function callClaude(
  apiKey: string, model: string,
  systemPrompt: string, userPrompt: string, maxTokens: number, timeout: number,
): Promise<string> {
  const body: any = {
    model,
    max_tokens: maxTokens,
    messages: [{ role: 'user', content: userPrompt }],
  };
  if (systemPrompt) body.system = systemPrompt;

  const resp = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(timeout),
  });

  if (!resp.ok) {
    const errText = await resp.text().catch(() => '');
    throw new Error(`Claude API 错误 ${resp.status}: ${errText.slice(0, 200)}`);
  }

  const data = await resp.json() as any;
  return data.content?.[0]?.text || '';
}

/** 调用 Gemini API */
async function callGemini(
  apiKey: string, model: string,
  systemPrompt: string, userPrompt: string, maxTokens: number, timeout: number,
): Promise<string> {
  const contents: any[] = [];
  if (systemPrompt) {
    contents.push({ role: 'user', parts: [{ text: systemPrompt }] });
    contents.push({ role: 'model', parts: [{ text: '好的，我会按照指示行事。' }] });
  }
  contents.push({ role: 'user', parts: [{ text: userPrompt }] });

  const resp = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents,
        generationConfig: { maxOutputTokens: maxTokens },
      }),
      signal: AbortSignal.timeout(timeout),
    },
  );

  if (!resp.ok) {
    const errText = await resp.text().catch(() => '');
    throw new Error(`Gemini API 错误 ${resp.status}: ${errText.slice(0, 200)}`);
  }

  const data = await resp.json() as any;
  return data.candidates?.[0]?.content?.parts?.[0]?.text || '';
}

/** 执行云端 LLM 调用 */
async function executeCloudCall(options: LlmCallOptions): Promise<LlmResult> {
  const { systemPrompt, userPrompt, maxTokens = 500, timeout = 60000, userId } = options;

  const resolved = resolveApiKey(userId, options.model?.split('/')[0]);
  if (!resolved) {
    throw new Error('没有可用的 API Key，请在设置页面配置至少一个模型提供商的 API Key');
  }

  const { provider, apiKey, model, apiBase } = resolved;
  const start = Date.now();
  let text: string;

  if (provider === 'claude') {
    text = await callClaude(apiKey, model, systemPrompt, userPrompt, maxTokens, timeout);
  } else if (provider === 'gemini') {
    text = await callGemini(apiKey, model, systemPrompt, userPrompt, maxTokens, timeout);
  } else {
    // OpenAI 兼容协议（GPT / DeepSeek / Qwen / MiniMax / GLM / 豆包）
    text = await callOpenAICompatible(apiBase, apiKey, model, systemPrompt, userPrompt, maxTokens, timeout);
  }

  const durationMs = Date.now() - start;
  trackTokens((systemPrompt || '') + userPrompt, text, durationMs, undefined, provider);

  return { text: text.trim(), durationMs, provider, model };
}

// ── 并发控制 ──

let activeCallCount = 0;
const MAX_CONCURRENT = 5;
const callQueue: Array<{
  resolve: (r: LlmResult) => void;
  reject: (e: Error) => void;
  options: LlmCallOptions;
}> = [];

async function processQueue(): Promise<void> {
  while (callQueue.length > 0 && activeCallCount < MAX_CONCURRENT) {
    const item = callQueue.shift()!;
    activeCallCount++;
    executeCloudCall(item.options)
      .then(item.resolve)
      .catch(item.reject)
      .finally(() => { activeCallCount--; processQueue(); });
  }
}

/** 调用 LLM（带并发队列） */
export async function callLlm(options: LlmCallOptions): Promise<LlmResult> {
  if (activeCallCount < MAX_CONCURRENT) {
    activeCallCount++;
    try { return await executeCloudCall(options); }
    finally { activeCallCount--; processQueue(); }
  }
  return new Promise((resolve, reject) => { callQueue.push({ resolve, reject, options }); });
}

// ── Mock 模式 ──

const MOCK_RESPONSES = [
  '我觉得这个问题很有意思。从我的经验来看，SOUL.md 的设计应该保持简洁，不超过两页。关键是明确安全红线和主动行为。',
  '同意前面的观点，但我想补充一点：模型选择策略同样重要。日常任务用 Sonnet 就够了，只有处理外部输入时才需要升级到 Opus。',
  '我持不同看法。安全不应该是事后考虑的事情。我们应该从第一天就设计好权限边界，Docker 隔离是基本要求。',
  '说到 Skill 编写，我发现很多人忽略了 description 字段的重要性。Agent 就是靠这个字段来决定何时调用 Skill 的。',
  '多 Agent 编排是个深水区。我建议先从单 Agent + 多 Skill 开始，等稳定了再扩展到多 Agent 协作。',
  '记忆系统的设计决定了 Agent 的"智慧"上限。三层记忆（短期、中期、长期）是经过验证的架构。',
  '自动化不仅仅是 Cron 任务。Heartbeat 机制让 Agent 能主动检查待办，这才是真正的"自主"。',
  '提示词工程在 OpenClaw 中被低估了。一个好的系统提示可以让 Haiku 模型表现得像 Sonnet。',
  '工具集成要遵循最小权限原则。每周逐步扩展权限，就像培训新员工一样。',
];

let mockIndex = 0;

export async function callLlmMock(options: LlmCallOptions): Promise<LlmResult> {
  await new Promise((r) => setTimeout(r, 100 + Math.random() * 200));
  const text = MOCK_RESPONSES[mockIndex % MOCK_RESPONSES.length];
  mockIndex++;
  trackTokens((options.systemPrompt || '') + options.userPrompt, text, 150);
  return { text, durationMs: 150, provider: 'mock', model: 'mock' };
}

// ── 节能模式 ──

let energySavingMode = false;  // 已配置 MiniMax M2.7，默认关闭节能模式

export function setEnergySavingMode(enabled: boolean) { energySavingMode = enabled; }
export function isEnergySavingMode(): boolean { return energySavingMode; }

// ── 统一入口 ──

let tokenBudget = Infinity;
export function setTokenBudget(budget: number) { tokenBudget = budget; }

export async function chat(options: LlmCallOptions, mockMode = false): Promise<LlmResult> {
  // Token 预算检查
  if (tokenStats.estimatedTokens >= tokenBudget) {
    console.log(`[LLM] Token 预算已用尽 (${tokenStats.estimatedTokens}/${tokenBudget})，自动切换 Mock`);
    return callLlmMock(options);
  }

  // 节能模式：服务器后台调用自动 mock（除非用户请求且有自己的 key）
  if (energySavingMode && !options.userId) {
    return callLlmMock(options);
  }

  if (mockMode || process.env.MOCK_LLM === '1') {
    return callLlmMock(options);
  }

  // 没有任何 API Key 时降级 mock
  const hasKey = resolveApiKey(options.userId);
  if (!hasKey) {
    return callLlmMock(options);
  }

  return callLlm(options);
}
