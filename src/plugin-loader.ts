/**
 * 插件系统 — 发现、注册、数据管理
 * 扫描 plugins/ 目录，自动注册插件到小镇
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, statSync } from 'fs';
import { join } from 'path';

// ── 类型 ──

export interface PluginManifest {
  id: string;
  name: string;
  icon: string;
  description: string;
  author: string;
  version?: string;
  entry?: string;      // 默认 index.html
  color?: string;       // 建筑颜色（hex）
  roof?: string;        // 屋顶颜色
  position?: { gx: number; gy: number }; // 地图位置（可选，自动分配）
  category?: 'game' | 'social' | 'tool' | 'creative' | 'other';
  minTokens?: number;   // 进入最低 Token（可选门票）
}

export interface PluginInfo extends PluginManifest {
  route: string;        // /plugins/{id}/index.html
  dir: string;          // 插件目录绝对路径
  enabled: boolean;
}

// ── 勋章系统 ──

export interface Badge {
  id: string;
  name: string;
  icon: string;
  description: string;
  rarity: 'common' | 'rare' | 'epic' | 'legendary';
}

export const BADGES: Record<string, Badge> = {
  'speed-demon':   { id: 'speed-demon',   name: '手速恶魔',   icon: '⚡', description: '龙虾赛跑连续3天前10', rarity: 'rare' },
  'early-bird':    { id: 'early-bird',    name: '早起虾',     icon: '🌅', description: '连续7天早上登录', rarity: 'common' },
  'rich-lobster':  { id: 'rich-lobster',  name: '虾界富豪',   icon: '💎', description: '持有超过 50000 Token', rarity: 'epic' },
  'social-king':   { id: 'social-king',   name: '社交达虾',   icon: '👑', description: '论坛发帖超过 50 条', rarity: 'rare' },
  'game-master':   { id: 'game-master',   name: '游戏大师',   icon: '🏆', description: '三个游戏都拿过第一', rarity: 'epic' },
  'fashion-icon':  { id: 'fashion-icon',  name: '时尚虾皇',   icon: '👔', description: '拥有 10 件以上装备', rarity: 'rare' },
  'explorer':      { id: 'explorer',      name: '探索者',     icon: '🧭', description: '访问过所有小镇建筑', rarity: 'common' },
  'inviter':       { id: 'inviter',       name: '带虾大使',   icon: '📨', description: '邀请 5 位新虾友', rarity: 'rare' },
  'first-plugin':  { id: 'first-plugin',  name: '插件先驱',   icon: '🔌', description: '提交了第一个社区插件', rarity: 'legendary' },
  'lobster-killer':{ id: 'lobster-killer', name: '杀虾高手',   icon: '🔪', description: '龙虾杀中成功伪装3局', rarity: 'rare' },
};

// ── 插件安全检查（加载时快速验证） ──

/** 插件运行时安全检查（快速版） */
function checkPluginSafety(content: string): string | null {
  const BLOCKED_PATTERNS = [
    { pattern: /eval\s*\(/i, reason: '禁止 eval()' },
    { pattern: /(?<!\w)Function\s*\(/g, reason: '禁止 Function()' },
    { pattern: /document\.cookie/i, reason: '禁止访问 Cookie' },
    { pattern: /<iframe/i, reason: '禁止嵌套 iframe' },
    { pattern: /new\s+Worker/i, reason: '禁止 Web Worker' },
    { pattern: /crypto\.subtle/i, reason: '禁止加密 API' },
    { pattern: /SharedArrayBuffer/i, reason: '禁止共享内存' },
    { pattern: /importScripts/i, reason: '禁止导入外部脚本' },
  ];
  for (const bp of BLOCKED_PATTERNS) {
    if (bp.pattern.test(content)) return bp.reason;
  }
  // 文件大小检查
  if (content.length > 512 * 1024) return '文件超过 512KB';
  return null;
}

// ── 插件发现 ──

const PLUGINS_DIR = './plugins';
let registeredPlugins: PluginInfo[] = [];

/** 扫描 plugins/ 目录发现所有插件 */
export function discoverPlugins(): PluginInfo[] {
  if (!existsSync(PLUGINS_DIR)) {
    mkdirSync(PLUGINS_DIR, { recursive: true });
    return [];
  }

  const dirs = readdirSync(PLUGINS_DIR, { withFileTypes: true });
  const plugins: PluginInfo[] = [];

  for (const dir of dirs) {
    if (!dir.isDirectory() || dir.name.startsWith('.')) continue;

    const manifestPath = join(PLUGINS_DIR, dir.name, 'manifest.json');
    if (!existsSync(manifestPath)) continue;

    try {
      const manifest = JSON.parse(readFileSync(manifestPath, 'utf-8')) as PluginManifest;
      if (!manifest.id || !manifest.name) continue;

      const entry = manifest.entry || 'index.html';
      const entryPath = join(PLUGINS_DIR, dir.name, entry);
      if (!existsSync(entryPath)) continue;

      // 读取入口文件内容做安全检查
      const content = readFileSync(entryPath, 'utf-8');
      const blocked = checkPluginSafety(content);
      if (blocked) {
        console.log('[插件] 安全检查拦截 ' + dir.name + ': ' + blocked);
        continue;
      }

      plugins.push({
        ...manifest,
        entry,
        route: `/plugins/${dir.name}/${entry}`,
        dir: join(PLUGINS_DIR, dir.name),
        enabled: true,
      });
    } catch {
      console.log(`[插件] 跳过 ${dir.name}: manifest 解析失败`);
    }
  }

  registeredPlugins = plugins;
  console.log(`[插件] 发现 ${plugins.length} 个插件: ${plugins.map(p => p.name).join(', ') || '无'}`);
  return plugins;
}

/** 获取已注册的插件列表 */
export function getPlugins(): PluginInfo[] {
  return registeredPlugins;
}

// ── 插件数据存储 ──

const PLUGIN_DATA_DIR = './agent-memories';

/** 读取插件为某用户存储的数据 */
export function getPluginData(pluginId: string, userId: string, key: string): any {
  const p = join(PLUGIN_DATA_DIR, userId, 'plugins', pluginId + '.json');
  if (!existsSync(p)) return null;
  try {
    const data = JSON.parse(readFileSync(p, 'utf-8'));
    return data[key] !== undefined ? data[key] : null;
  } catch { return null; }
}

/** 写入插件数据 */
export function setPluginData(pluginId: string, userId: string, key: string, value: any): void {
  const dir = join(PLUGIN_DATA_DIR, userId, 'plugins');
  mkdirSync(dir, { recursive: true });
  const p = join(dir, pluginId + '.json');
  let data: Record<string, any> = {};
  if (existsSync(p)) {
    try { data = JSON.parse(readFileSync(p, 'utf-8')); } catch {}
  }
  data[key] = value;
  writeFileSync(p, JSON.stringify(data, null, 2), 'utf-8');
}

// ── 用户勋章管理 ──

/** 获取用户的勋章列表 */
export function getUserBadges(userId: string): string[] {
  const p = join(PLUGIN_DATA_DIR, userId, 'badges.json');
  if (!existsSync(p)) return [];
  try { return JSON.parse(readFileSync(p, 'utf-8')); } catch { return []; }
}

/** 授予用户勋章 */
export function awardUserBadge(userId: string, badgeId: string): boolean {
  if (!BADGES[badgeId]) return false;
  const badges = getUserBadges(userId);
  if (badges.includes(badgeId)) return false; // 已拥有
  badges.push(badgeId);
  const dir = join(PLUGIN_DATA_DIR, userId);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'badges.json'), JSON.stringify(badges, null, 2), 'utf-8');
  return true;
}

// ── 每日活跃排名 ──

interface DailyActivity {
  userId: string;
  name: string;
  actions: number;    // 当天操作次数
  duration: number;   // 在线时长(分钟，估算)
  lastSeen: string;
}

const dailyActivities = new Map<string, DailyActivity>();

/** 记录用户活动 */
export function recordActivity(userId: string, name: string): void {
  const today = new Date().toISOString().slice(0, 10);
  const key = today + ':' + userId;
  const existing = dailyActivities.get(key);
  if (existing) {
    existing.actions++;
    existing.lastSeen = new Date().toISOString();
    existing.duration = Math.min(existing.duration + 1, 1440); // 最大24小时
  } else {
    dailyActivities.set(key, { userId, name, actions: 1, duration: 1, lastSeen: new Date().toISOString() });
  }
}

/** 获取今日活跃排行 */
export function getDailyLeaderboard(): DailyActivity[] {
  const today = new Date().toISOString().slice(0, 10);
  const todayEntries: DailyActivity[] = [];
  for (const [key, val] of dailyActivities) {
    if (key.startsWith(today)) todayEntries.push(val);
  }
  return todayEntries.sort((a, b) => b.actions - a.actions).slice(0, 20);
}

// ── 插件容器页面生成（iframe wrapper） ──

/** 生成插件容器页面（主站 wrapper，包含 postMessage 桥） */
export function generatePluginWrapper(plugin: PluginInfo, userId?: string): string {
  return `<!DOCTYPE html>
<html lang="zh">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${plugin.name} — 龙虾小镇</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:"Noto Sans SC",system-ui,sans-serif;background:#0d0d0f;color:#d4d4dc;height:100vh;display:flex;flex-direction:column}
.wrapper-bar{display:flex;align-items:center;justify-content:space-between;padding:8px 16px;background:#141418;border-bottom:1px solid #2a2a32;flex-shrink:0}
.wrapper-bar h2{font-size:0.9rem;color:#c8a882}
.wrapper-bar a{color:#888;text-decoration:none;font-size:0.75rem}
.wrapper-bar a:hover{color:#c8a882}
.wrapper-bar .plugin-info{font-size:0.68rem;color:#555}
iframe{flex:1;border:none;width:100%}
</style>
</head>
<body>
<div class="wrapper-bar">
  <h2>${plugin.icon} ${plugin.name}</h2>
  <div class="plugin-info">by ${plugin.author || '社区'} · v${plugin.version || '1.0'}</div>
  <div><a href="/">← 返回小镇</a> · <a href="/games">游戏厅</a> · <a href="/plugins">插件列表</a></div>
</div>
<iframe id="plugin-frame" sandbox="allow-scripts allow-forms" src="${plugin.route}"></iframe>
<script>
// ── postMessage 桥：处理插件 SDK 调用 ──
var SERVER = window.location.origin;
var PLUGIN_ID = '${plugin.id}';
var USER_ID = ${userId ? "'" + userId + "'" : 'null'};

// 尝试从 localStorage 获取用户
if (!USER_ID) {
  try { USER_ID = JSON.parse(localStorage.getItem('lobster-user') || '{}').id || null; } catch {}
}

window.addEventListener('message', async function(e) {
  if (!e.data || !e.data.__lobster_call) return;
  var msg = e.data;
  var result = null;
  var error = null;

  try {
    switch (msg.method) {
      case 'getCurrentUser':
        if (!USER_ID) { error = '未登录'; break; }
        var r = await fetch(SERVER + '/api/user/' + USER_ID);
        result = await r.json();
        break;

      case 'getData':
        var r2 = await fetch(SERVER + '/api/plugin/data?pluginId=' + PLUGIN_ID + '&userId=' + (USER_ID||'') + '&key=' + msg.params.key);
        var d2 = await r2.json();
        result = d2.value;
        break;

      case 'setData':
        await fetch(SERVER + '/api/plugin/data', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ pluginId: PLUGIN_ID, userId: USER_ID, key: msg.params.key, value: msg.params.value })
        });
        result = true;
        break;

      case 'getBalance':
        if (!USER_ID) { result = 0; break; }
        var r3 = await fetch(SERVER + '/api/wallet/' + USER_ID);
        var d3 = await r3.json();
        result = d3.balance || d3.tokens || 0;
        break;

      case 'addTokens':
        if (!USER_ID) { error = '未登录'; break; }
        await fetch(SERVER + '/api/plugin/tokens', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ pluginId: PLUGIN_ID, userId: USER_ID, amount: msg.params.amount, reason: msg.params.reason })
        });
        result = true;
        break;

      case 'deductTokens':
        if (!USER_ID) { error = '未登录'; break; }
        await fetch(SERVER + '/api/plugin/tokens', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ pluginId: PLUGIN_ID, userId: USER_ID, amount: -(msg.params.amount), reason: msg.params.reason })
        });
        result = true;
        break;

      case 'awardBadge':
        if (!USER_ID) { error = '未登录'; break; }
        await fetch(SERVER + '/api/plugin/badge', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId: USER_ID, badgeId: msg.params.badgeId })
        });
        result = true;
        break;

      case 'getBadges':
        if (!USER_ID) { result = []; break; }
        var r4 = await fetch(SERVER + '/api/plugin/badges/' + USER_ID);
        result = await r4.json();
        break;

      case 'sendMessage':
        await fetch(SERVER + '/api/town/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId: USER_ID, message: msg.params.text, source: PLUGIN_ID })
        });
        result = true;
        break;

      case 'getLeaderboard':
        var r5 = await fetch(SERVER + '/api/plugin/leaderboard?metric=' + (msg.params.metric || 'daily'));
        result = await r5.json();
        break;

      case 'getAgents':
        var r6 = await fetch(SERVER + '/api/agents');
        result = await r6.json();
        break;

      case 'callLLM':
        var r7 = await fetch(SERVER + '/api/plugin/llm', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ pluginId: PLUGIN_ID, userId: USER_ID, prompt: msg.params.prompt, maxTokens: msg.params.maxTokens })
        });
        var d7 = await r7.json();
        result = d7.text || d7.response;
        break;

      case 'close':
        window.location.href = '/';
        result = true;
        break;

      default:
        error = '未知方法: ' + msg.method;
    }
  } catch (err) {
    error = err.message || '调用失败';
  }

  // 回复插件
  document.getElementById('plugin-frame').contentWindow.postMessage({
    __lobster_reply: true,
    id: msg.id,
    result: result,
    error: error
  }, '*');
});

// 记录活动
if (USER_ID) {
  fetch(SERVER + '/api/plugin/activity', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userId: USER_ID, pluginId: PLUGIN_ID })
  }).catch(function(){});
}
</script>
</body>
</html>`;
}

/** 生成插件列表页面 */
export function generatePluginListPage(plugins: PluginInfo[]): string {
  const cards = plugins.map(p => {
    const cat = p.category || 'other';
    const catLabel: Record<string, string> = { game: '游戏', social: '社交', tool: '工具', creative: '创作', other: '其他' };
    return '<a href="/plugin/' + p.id + '" class="plugin-card">'
      + '<div class="pc-icon">' + (p.icon || '📦') + '</div>'
      + '<div class="pc-name">' + p.name + '</div>'
      + '<div class="pc-desc">' + (p.description || '') + '</div>'
      + '<div class="pc-meta"><span class="pc-cat">' + (catLabel[cat] || '其他') + '</span> <span class="pc-author">by ' + (p.author || '社区') + '</span></div>'
      + '</a>';
  }).join('');

  return '<!DOCTYPE html><html lang="zh"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>插件市场 — 龙虾小镇</title><style>'
    + '*{margin:0;padding:0;box-sizing:border-box}body{font-family:"Noto Sans SC",system-ui,sans-serif;background:#fafafa;color:#2d2d2d;min-height:100vh}'
    + '.container{max-width:900px;margin:0 auto;padding:48px 24px}'
    + 'h1{font-family:"Noto Serif SC",Georgia,serif;font-size:1.8rem;letter-spacing:0.02em;margin-bottom:8px}'
    + '.subtitle{color:#888;font-size:0.85rem;margin-bottom:32px}'
    + '.nav{margin-bottom:24px;font-size:0.8rem}a{color:#c8a882;text-decoration:none}a:hover{color:#2d2d2d}'
    + '.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:20px}'
    + '.plugin-card{display:block;border:1px solid #e8e8e8;padding:20px;transition:all 0.4s cubic-bezier(0.22,1,0.36,1);text-decoration:none;color:#2d2d2d}'
    + '.plugin-card:hover{border-color:#c8a882;transform:translateY(-4px);box-shadow:0 8px 24px rgba(0,0,0,0.06)}'
    + '.pc-icon{font-size:2rem;margin-bottom:8px}'
    + '.pc-name{font-size:1rem;font-weight:600;margin-bottom:4px}'
    + '.pc-desc{font-size:0.78rem;color:#888;line-height:1.5;margin-bottom:8px}'
    + '.pc-meta{font-size:0.68rem;color:#bbb}'
    + '.pc-cat{padding:2px 8px;border:1px solid #e8e8e8;border-radius:2px;margin-right:8px}'
    + '.empty{text-align:center;padding:60px;color:#888}'
    + '.empty-icon{font-size:3rem;margin-bottom:16px;opacity:0.3}'
    + '.cta{margin-top:48px;padding:24px;border:1px solid #e8e8e8;background:#f5f0eb}'
    + '.cta h3{font-size:1rem;margin-bottom:8px;color:#c8a882}'
    + '.cta p{font-size:0.82rem;color:#555;line-height:1.6}'
    + '.cta code{background:#fff;padding:2px 6px;border:1px solid #e8e8e8;font-size:0.75rem}'
    + '</style></head><body><div class="container">'
    + '<div class="nav"><a href="/">← 返回小镇</a> · <a href="/games">游戏厅</a> · <a href="/mafia">龙虾杀</a> · <a href="/stock">股票大厅</a></div>'
    + '<h1>🔌 插件市场</h1><p class="subtitle">社区共建的龙虾小镇扩展 — 每个插件都是小镇里的一栋新建筑</p>'
    + (plugins.length > 0 ? '<div class="grid">' + cards + '</div>' : '<div class="empty"><div class="empty-icon">🔌</div>暂无社区插件<br>成为第一个贡献者吧！</div>')
    + '<div class="cta"><h3>🛠 开发你自己的插件</h3><p>'
    + '只需要一个 <code>manifest.json</code> + 一个 <code>index.html</code> 就能创建小镇建筑。<br>'
    + '1. Fork 仓库 → 2. 在 <code>plugins/</code> 目录创建你的插件 → 3. 提交 PR<br>'
    + '详见 <a href="https://github.com/nieao/mem-mem">GitHub 文档</a></p></div>'
    + '</div></body></html>';
}
