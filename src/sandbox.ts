/**
 * 安全沙箱 — 三层防御 + 六条铁律
 * 所有 Agent 能力调用必须经过此层校验
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join, resolve, normalize } from 'path';

// ══════════════════════════════════════
// 类型定义
// ══════════════════════════════════════

export interface SandboxContext {
  agentId: string;
  workspacePath: string;           // Agent 可写目录
  allowedReadPaths: string[];      // 可读路径白名单
  writablePaths: string[];         // 可写路径白名单
  maxExecutionTimeMs: number;      // 最大执行时间
  maxOutputBytes: number;          // 最大输出大小
}

export interface SandboxInput {
  command: string;                 // 要执行的命令/提示词
  targetPath?: string;             // 目标文件路径
  url?: string;                    // 目标 URL
  capabilityId: string;            // 能力 ID
}

export interface SandboxCheckResult {
  allowed: boolean;
  reason?: string;                 // 被拦截的原因
  sanitizedInput?: string;         // 清洗后的输入
}

export interface AuditEntry {
  id: string;
  timestamp: string;
  agentId: string;
  capabilityId: string;
  input: string;                   // 截断后的输入
  output: string;                  // 截断后的输出
  allowed: boolean;
  blockedReason?: string;
  durationMs: number;
  tokensUsed: number;
}

export interface KillSwitchState {
  enabled: boolean;                // true = 所有能力立即停止
  disabledAt?: string;
  disabledBy?: string;
  reason?: string;
}

interface RateLimitEntry {
  calls: number;
  windowStart: number;
}

// ══════════════════════════════════════
// 常量
// ══════════════════════════════════════

const MEMORY_DIR = './agent-memories';
const REPORTS_DIR = './reports';
const AUDIT_DIR = join(REPORTS_DIR, 'audit');
const KILLSWITCH_PATH = join(REPORTS_DIR, 'killswitch.json');

/** 速率限制：每 Agent 每小时最多 20 次 */
const RATE_LIMIT_PER_HOUR = 20;

/** 每 Agent 每日 Token 预算 */
const DAILY_TOKEN_BUDGET = 5000;

/** 审计日志单条输入/输出截断长度 */
const AUDIT_TRUNCATE = 500;

// ══════════════════════════════════════
// 六条铁律 — 硬编码正则，不可配置
// ══════════════════════════════════════

/** 铁律 1：禁止删除 */
const DELETE_PATTERNS = [
  /\brm\b/i,
  /\bdel\b/i,
  /\bunlink\b/i,
  /\brmdir\b/i,
  /\brimraf\b/i,
  /\bremove\b/i,
  /\.delete\s*\(/i,
  /fs\.unlink/i,
  /fs\.rm/i,
  /shutil\.rmtree/i,
];

/** 铁律 2：禁止外网（只允许 localhost） */
const EXTERNAL_URL_PATTERN = /https?:\/\/(?!localhost|127\.0\.0\.1|0\.0\.0\.0)/i;

/** 铁律 3：禁止执行外部脚本 */
const SCRIPT_PATTERNS = [
  /\.(sh|bat|ps1|cmd|vbs|wsf)\b/i,
  /\bexec\s*\(/i,
  /\beval\s*\(/i,
  /child_process/i,
];

/** 铁律 4：禁止命令注入 */
const INJECTION_PATTERNS = [
  /[;&|`]/,              // shell 元字符
  /\$\(/,                // 命令替换
  /\$\{/,                // 变量展开
  /\bsudo\b/i,
  /\bchmod\b/i,
  /\bchown\b/i,
  /\bkill\b/i,
  /\btaskkill\b/i,
];

/** 铁律 5 附加：禁止读取敏感文件 */
const SENSITIVE_FILE_PATTERNS = [
  /\.env$/i,
  /\.env\./i,
  /credentials/i,
  /\.key$/i,
  /\.pem$/i,
  /\.p12$/i,
  /secret/i,
  /password/i,
  /token.*\.json$/i,
  /notion_config/i,
];

/** 路径穿越检测 */
const PATH_TRAVERSAL = /\.\.\//;

// ══════════════════════════════════════
// 速率限制（内存中）
// ══════════════════════════════════════

const rateLimits = new Map<string, RateLimitEntry>();

/** 每日 Token 使用量追踪 */
const dailyTokenUsage = new Map<string, { date: string; tokens: number }>();

// ══════════════════════════════════════
// 核心函数
// ══════════════════════════════════════

/** 为 Agent 创建沙箱上下文 */
export function createSandboxContext(agentId: string, memoryDir = MEMORY_DIR): SandboxContext {
  const workspacePath = join(memoryDir, agentId, 'workspace');
  mkdirSync(workspacePath, { recursive: true });

  return {
    agentId,
    workspacePath: resolve(workspacePath),
    allowedReadPaths: [
      resolve(join(memoryDir, agentId)),   // 自己的记忆目录
      resolve('./src'),                     // 源码（代码分析任务）
    ],
    writablePaths: [
      resolve(workspacePath),                                    // 工作空间
      resolve(join(REPORTS_DIR, 'library', agentId)),           // 产出目录
    ],
    maxExecutionTimeMs: 120_000,  // 2 分钟
    maxOutputBytes: 100_000,      // 100KB
  };
}

/** 校验输入 — 执行前必须调用 */
export function validateInput(input: SandboxInput, context: SandboxContext): SandboxCheckResult {
  const { command, targetPath, url } = input;

  // ── 熔断检查 ──
  const killSwitch = getKillSwitch();
  if (killSwitch.enabled) {
    return { allowed: false, reason: `全局熔断已启用：${killSwitch.reason || '管理员操作'}` };
  }

  // ── 被捕检查（延迟导入避免循环依赖） ──
  // jail.ts 的 isCaptured 会在 server.ts 层调用，这里不重复

  // ── 铁律 1：禁止删除 ──
  for (const pat of DELETE_PATTERNS) {
    if (pat.test(command)) {
      return { allowed: false, reason: `铁律1违规：检测到删除操作 (${pat.source})` };
    }
  }

  // ── 铁律 2：禁止外网 ──
  if (url && EXTERNAL_URL_PATTERN.test(url)) {
    return { allowed: false, reason: `铁律2违规：禁止访问外部URL (${url})` };
  }
  if (EXTERNAL_URL_PATTERN.test(command)) {
    return { allowed: false, reason: '铁律2违规：命令中包含外部URL' };
  }

  // ── 铁律 3：禁止外部脚本 ──
  for (const pat of SCRIPT_PATTERNS) {
    if (pat.test(command)) {
      return { allowed: false, reason: `铁律3违规：检测到脚本执行 (${pat.source})` };
    }
  }

  // ── 铁律 4：禁止命令注入 ──
  for (const pat of INJECTION_PATTERNS) {
    if (pat.test(command)) {
      return { allowed: false, reason: `铁律4违规：检测到命令注入 (${pat.source})` };
    }
  }

  // ── 路径穿越检测 ──
  if (targetPath) {
    if (PATH_TRAVERSAL.test(targetPath)) {
      return { allowed: false, reason: '路径穿越违规：检测到 ../ 模式' };
    }

    const normalizedPath = resolve(normalize(targetPath));

    // 检查写入路径白名单
    const isWritable = context.writablePaths.some(wp => normalizedPath.startsWith(wp));
    const isReadable = context.allowedReadPaths.some(rp => normalizedPath.startsWith(rp));
    if (!isWritable && !isReadable) {
      return { allowed: false, reason: `路径越权：${targetPath} 不在允许范围内` };
    }

    // 敏感文件检测
    for (const pat of SENSITIVE_FILE_PATTERNS) {
      if (pat.test(targetPath)) {
        return { allowed: false, reason: `敏感文件违规：${targetPath} 匹配 ${pat.source}` };
      }
    }
  }

  // ── 速率限制检查 ──
  const rateCheck = checkRateLimit(context.agentId);
  if (!rateCheck.allowed) {
    return { allowed: false, reason: `速率限制：已达上限 ${RATE_LIMIT_PER_HOUR}次/小时，${rateCheck.resetIn}秒后重置` };
  }

  // ── 日预算检查 ──
  const budgetCheck = checkDailyBudget(context.agentId);
  if (!budgetCheck.allowed) {
    return { allowed: false, reason: `日预算耗尽：已使用 ${budgetCheck.used}/${DAILY_TOKEN_BUDGET} token` };
  }

  return { allowed: true, sanitizedInput: command };
}

// ══════════════════════════════════════
// 速率限制
// ══════════════════════════════════════

/** 检查速率限制 */
export function checkRateLimit(agentId: string): { allowed: boolean; remaining: number; resetIn: number } {
  const now = Date.now();
  const entry = rateLimits.get(agentId);

  if (!entry || now - entry.windowStart > 3600_000) {
    // 窗口过期或不存在，创建新窗口
    rateLimits.set(agentId, { calls: 0, windowStart: now });
    return { allowed: true, remaining: RATE_LIMIT_PER_HOUR, resetIn: 3600 };
  }

  const remaining = RATE_LIMIT_PER_HOUR - entry.calls;
  const resetIn = Math.ceil((entry.windowStart + 3600_000 - now) / 1000);

  if (remaining <= 0) {
    return { allowed: false, remaining: 0, resetIn };
  }

  return { allowed: true, remaining, resetIn };
}

/** 记录一次调用（速率限制计数） */
export function recordRateLimitCall(agentId: string): void {
  const now = Date.now();
  const entry = rateLimits.get(agentId);

  if (!entry || now - entry.windowStart > 3600_000) {
    rateLimits.set(agentId, { calls: 1, windowStart: now });
  } else {
    entry.calls++;
  }
}

// ══════════════════════════════════════
// 日预算
// ══════════════════════════════════════

/** 检查日预算 */
function checkDailyBudget(agentId: string): { allowed: boolean; used: number } {
  const today = new Date().toISOString().slice(0, 10);
  const entry = dailyTokenUsage.get(agentId);

  if (!entry || entry.date !== today) {
    return { allowed: true, used: 0 };
  }

  return { allowed: entry.tokens < DAILY_TOKEN_BUDGET, used: entry.tokens };
}

/** 记录 Token 使用 */
export function recordTokenUsage(agentId: string, tokens: number): void {
  const today = new Date().toISOString().slice(0, 10);
  const entry = dailyTokenUsage.get(agentId);

  if (!entry || entry.date !== today) {
    dailyTokenUsage.set(agentId, { date: today, tokens });
  } else {
    entry.tokens += tokens;
  }
}

/** 获取 Agent 日预算状态 */
export function getDailyBudgetStatus(agentId: string): { used: number; budget: number; remaining: number } {
  const today = new Date().toISOString().slice(0, 10);
  const entry = dailyTokenUsage.get(agentId);
  const used = (entry && entry.date === today) ? entry.tokens : 0;
  return { used, budget: DAILY_TOKEN_BUDGET, remaining: DAILY_TOKEN_BUDGET - used };
}

// ══════════════════════════════════════
// 审计日志
// ══════════════════════════════════════

/** 记录审计日志 */
export function recordAudit(entry: AuditEntry): void {
  const agentAuditDir = join(AUDIT_DIR, entry.agentId);
  mkdirSync(agentAuditDir, { recursive: true });

  const today = new Date().toISOString().slice(0, 10);
  const logPath = join(agentAuditDir, `${today}.json`);

  let logs: AuditEntry[] = [];
  if (existsSync(logPath)) {
    try { logs = JSON.parse(readFileSync(logPath, 'utf-8')); } catch {}
  }

  // 截断输入/输出防止日志膨胀
  entry.input = entry.input.slice(0, AUDIT_TRUNCATE);
  entry.output = entry.output.slice(0, AUDIT_TRUNCATE);

  logs.push(entry);
  writeFileSync(logPath, JSON.stringify(logs, null, 2), 'utf-8');
}

/** 获取 Agent 审计日志 */
export function getAuditLog(agentId: string, limit = 50): AuditEntry[] {
  const agentAuditDir = join(AUDIT_DIR, agentId);
  if (!existsSync(agentAuditDir)) return [];

  const today = new Date().toISOString().slice(0, 10);
  const logPath = join(agentAuditDir, `${today}.json`);
  if (!existsSync(logPath)) return [];

  try {
    const logs: AuditEntry[] = JSON.parse(readFileSync(logPath, 'utf-8'));
    return logs.slice(-limit);
  } catch {
    return [];
  }
}

/** 获取全局审计摘要 */
export function getAuditSummary(): {
  totalToday: number;
  blockedToday: number;
  byAgent: Record<string, { total: number; blocked: number }>;
} {
  const today = new Date().toISOString().slice(0, 10);
  const summary: { totalToday: number; blockedToday: number; byAgent: Record<string, { total: number; blocked: number }> } = {
    totalToday: 0, blockedToday: 0, byAgent: {},
  };

  if (!existsSync(AUDIT_DIR)) return summary;

  try {
    const { readdirSync } = require('fs');
    const agentDirs = readdirSync(AUDIT_DIR);
    for (const agentId of agentDirs) {
      const logPath = join(AUDIT_DIR, agentId, `${today}.json`);
      if (!existsSync(logPath)) continue;
      try {
        const logs: AuditEntry[] = JSON.parse(readFileSync(logPath, 'utf-8'));
        const blocked = logs.filter(l => !l.allowed).length;
        summary.totalToday += logs.length;
        summary.blockedToday += blocked;
        summary.byAgent[agentId] = { total: logs.length, blocked };
      } catch {}
    }
  } catch {}

  return summary;
}

// ══════════════════════════════════════
// 熔断开关
// ══════════════════════════════════════

/** 获取熔断状态 */
export function getKillSwitch(): KillSwitchState {
  if (!existsSync(KILLSWITCH_PATH)) {
    return { enabled: false };
  }
  try {
    return JSON.parse(readFileSync(KILLSWITCH_PATH, 'utf-8'));
  } catch {
    return { enabled: false };
  }
}

/** 设置熔断开关 */
export function setKillSwitch(enabled: boolean, by: string, reason: string): KillSwitchState {
  mkdirSync(REPORTS_DIR, { recursive: true });
  const state: KillSwitchState = {
    enabled,
    disabledAt: new Date().toISOString(),
    disabledBy: by,
    reason,
  };
  writeFileSync(KILLSWITCH_PATH, JSON.stringify(state, null, 2), 'utf-8');
  return state;
}

// ══════════════════════════════════════
// 工具函数
// ══════════════════════════════════════

/** 生成审计 ID */
export function generateAuditId(): string {
  return `aud-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

/** 检查 URL 是否为允许的本地地址 */
export function isAllowedUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname;
    return host === 'localhost' || host === '127.0.0.1' || host === '0.0.0.0';
  } catch {
    return false;
  }
}

/** 允许的本地服务端口 */
export const ALLOWED_LOCAL_PORTS: Record<string, number> = {
  ollama: 11434,
  comfyui: 8188,
};
