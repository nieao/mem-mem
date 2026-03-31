/**
 * 插件安全检查器
 * 用法: bun run scripts/check-plugin.ts <plugin-dir>
 * 或: bun run scripts/check-plugin.ts --all（检查所有插件）
 */

import { readFileSync, existsSync, readdirSync, statSync } from 'fs';
import { join, extname } from 'path';

interface CheckResult {
  pass: boolean;
  name: string;
  message: string;
  severity: 'error' | 'warning' | 'info';
}

const results: CheckResult[] = [];

function check(name: string, pass: boolean, message: string, severity: 'error' | 'warning' | 'info' = 'error') {
  results.push({ pass, name, message, severity });
}

// ── 检查清单 ──

function checkPlugin(pluginDir: string) {
  const manifestPath = join(pluginDir, 'manifest.json');

  // 1. manifest.json 存在且格式正确
  check('manifest 存在', existsSync(manifestPath), 'manifest.json 不存在');
  if (!existsSync(manifestPath)) return;

  let manifest: any;
  try {
    manifest = JSON.parse(readFileSync(manifestPath, 'utf-8'));
    check('manifest JSON 格式', true, '');
  } catch (e: any) {
    check('manifest JSON 格式', false, 'JSON 解析失败: ' + e.message);
    return;
  }

  // 2. 必填字段
  check('id 字段', !!manifest.id && typeof manifest.id === 'string' && /^[a-z0-9-]+$/.test(manifest.id),
    'id 必须是小写字母+数字+连字符，当前: ' + manifest.id);
  check('name 字段', !!manifest.name && manifest.name.length <= 20, 'name 必填且不超过 20 字');
  check('icon 字段', !!manifest.icon, 'icon 必填（一个 emoji）');
  check('description 字段', !!manifest.description && manifest.description.length <= 100, 'description 必填且不超过 100 字');
  check('author 字段', !!manifest.author, 'author 必填');

  // 3. 入口文件存在
  const entry = manifest.entry || 'index.html';
  const entryPath = join(pluginDir, entry);
  check('入口文件存在', existsSync(entryPath), entry + ' 不存在');
  if (!existsSync(entryPath)) return;

  // 4. 文件大小限制
  const entrySize = statSync(entryPath).size;
  check('入口文件大小', entrySize <= 512 * 1024,
    '入口文件 ' + (entrySize / 1024).toFixed(0) + 'KB 超过 512KB 限制', 'error');

  // 5. 目录总大小限制（1MB）
  let totalSize = 0;
  let fileCount = 0;
  function scanDir(dir: string) {
    for (const f of readdirSync(dir, { withFileTypes: true })) {
      if (f.isDirectory()) scanDir(join(dir, f.name));
      else { totalSize += statSync(join(dir, f.name)).size; fileCount++; }
    }
  }
  scanDir(pluginDir);
  check('目录总大小', totalSize <= 1024 * 1024,
    '总大小 ' + (totalSize / 1024).toFixed(0) + 'KB 超过 1MB 限制', 'error');
  check('文件数量', fileCount <= 20, '文件数 ' + fileCount + ' 超过 20 个限制', 'warning');

  // 6. 只允许安全的文件类型
  const ALLOWED_EXTS = new Set(['.html', '.css', '.js', '.json', '.png', '.jpg', '.jpeg', '.gif', '.svg', '.webp', '.ico', '.txt', '.md']);
  function checkFileTypes(dir: string) {
    for (const f of readdirSync(dir, { withFileTypes: true })) {
      if (f.isDirectory()) { checkFileTypes(join(dir, f.name)); continue; }
      const ext = extname(f.name).toLowerCase();
      if (!ALLOWED_EXTS.has(ext) && f.name !== 'manifest.json') {
        check('文件类型', false, '不允许的文件类型: ' + f.name + ' (' + ext + ')', 'error');
      }
    }
  }
  checkFileTypes(pluginDir);

  // 7. HTML/JS 内容安全检查
  const htmlContent = readFileSync(entryPath, 'utf-8');

  // 危险模式检测
  const DANGEROUS_PATTERNS: Array<{ pattern: RegExp; name: string; desc: string; severity?: 'error' | 'warning' | 'info' }> = [
    { pattern: /eval\s*\(/gi, name: 'eval()', desc: '禁止使用 eval' },
    { pattern: /(?<!\w)Function\s*\(/g, name: 'Function()', desc: '禁止动态创建函数' },
    { pattern: /document\.cookie/gi, name: 'document.cookie', desc: '禁止访问 Cookie' },
    { pattern: /localStorage/gi, name: 'localStorage', desc: '禁止直接访问 localStorage（用 SDK）', severity: 'warning' },
    { pattern: /sessionStorage/gi, name: 'sessionStorage', desc: '禁止访问 sessionStorage' },
    { pattern: /window\.opener/gi, name: 'window.opener', desc: '禁止访问 opener' },
    { pattern: /window\.top(?!\s*\.postMessage)/gi, name: 'window.top', desc: '禁止访问 top（非 postMessage）' },
    { pattern: /window\.parent(?!\s*\.postMessage)/gi, name: 'window.parent', desc: '禁止直接访问 parent（用 SDK）', severity: 'warning' },
    { pattern: /XMLHttpRequest/gi, name: 'XMLHttpRequest', desc: '禁止 XHR（用 SDK 调用 API）', severity: 'warning' },
    { pattern: /importScripts/gi, name: 'importScripts', desc: '禁止导入外部脚本' },
    { pattern: /crypto\.subtle/gi, name: 'crypto.subtle', desc: '禁止加密 API（可用于挖矿）' },
    { pattern: /WebSocket/gi, name: 'WebSocket', desc: '禁止 WebSocket（减少资源消耗）', severity: 'warning' },
    { pattern: /new\s+Worker/gi, name: 'Web Worker', desc: '禁止创建 Worker（可用于挖矿）' },
    { pattern: /SharedArrayBuffer/gi, name: 'SharedArrayBuffer', desc: '禁止共享内存' },
    { pattern: /<iframe/gi, name: '嵌套 iframe', desc: '插件内禁止嵌套 iframe' },
    { pattern: /javascript:/gi, name: 'javascript:', desc: '禁止 javascript: 协议' },
    { pattern: /data:text\/html/gi, name: 'data: HTML', desc: '禁止 data: HTML 协议' },
    { pattern: /\.innerHTML\s*=/gi, name: 'innerHTML', desc: '建议用 textContent 替代 innerHTML（XSS 风险）', severity: 'warning' },
  ];

  for (const dp of DANGEROUS_PATTERNS) {
    const matches = htmlContent.match(dp.pattern);
    if (matches) {
      check(dp.name, false, dp.desc + ' (发现 ' + matches.length + ' 处)', dp.severity || 'error');
    }
  }

  // 8. 外部资源检查（CDN 白名单）
  const CDN_WHITELIST = [
    'unpkg.com',
    'cdn.jsdelivr.net',
    'cdnjs.cloudflare.com',
    'fonts.googleapis.com',
    'fonts.gstatic.com',
  ];
  const urlPattern = /(?:src|href|url)\s*=\s*["'](https?:\/\/[^"']+)["']/gi;
  let urlMatch;
  while ((urlMatch = urlPattern.exec(htmlContent)) !== null) {
    const url = urlMatch[1];
    try {
      const domain = new URL(url).hostname;
      const isWhitelisted = CDN_WHITELIST.some(w => domain === w || domain.endsWith('.' + w));
      check('外部 URL: ' + domain, isWhitelisted,
        '外部资源 ' + url.slice(0, 60) + ' 不在白名单中。允许: ' + CDN_WHITELIST.join(', '),
        isWhitelisted ? 'info' : 'warning');
    } catch {
      check('外部 URL 解析', false, '无法解析 URL: ' + url.slice(0, 60), 'warning');
    }
  }

  // 9. 必须引入 SDK
  const hasSDK = /plugin-sdk\.js/i.test(htmlContent);
  check('引入 Plugin SDK', hasSDK, '建议引入 /sdk/plugin-sdk.js', 'warning');

  // 10. fetch 调用检查（应该通过 SDK 而不是直接 fetch）
  const directFetch = htmlContent.match(/fetch\s*\(\s*['"`]/g);
  if (directFetch && directFetch.length > 0) {
    check('直接 fetch 调用', false,
      '发现 ' + directFetch.length + ' 处直接 fetch 调用，建议改用 LobsterSDK API', 'warning');
  }
}

// ── 主流程 ──

const args = process.argv.slice(2);
const pluginsDir = './plugins';

if (args[0] === '--all') {
  // 检查所有插件
  const dirs = readdirSync(pluginsDir, { withFileTypes: true })
    .filter(d => d.isDirectory() && !d.name.startsWith('.'));
  console.log('🔍 检查 ' + dirs.length + ' 个插件...\n');
  let allPassed = true;
  for (const dir of dirs) {
    console.log('━━ ' + dir.name + ' ━━');
    results.length = 0;
    checkPlugin(join(pluginsDir, dir.name));
    const failed = printResults();
    if (failed) allPassed = false;
    console.log('');
  }
  if (!allPassed) process.exit(1);
} else if (args[0]) {
  const dir = args[0].startsWith('plugins/') ? args[0] : join(pluginsDir, args[0]);
  console.log('🔍 检查插件: ' + dir + '\n');
  checkPlugin(dir);
  printResults();
} else {
  console.log('用法: bun run scripts/check-plugin.ts <plugin-dir|--all>');
  process.exit(1);
}

function printResults(): boolean {
  const errors = results.filter(r => !r.pass && r.severity === 'error');
  const warnings = results.filter(r => !r.pass && r.severity === 'warning');
  const passed = results.filter(r => r.pass);

  for (const r of results) {
    if (r.pass) console.log('  ✅ ' + r.name);
    else if (r.severity === 'error') console.log('  ❌ ' + r.name + ': ' + r.message);
    else if (r.severity === 'warning') console.log('  ⚠️  ' + r.name + ': ' + r.message);
    else console.log('  ℹ️  ' + r.name + ': ' + r.message);
  }

  console.log('\n结果: ' + passed.length + ' 通过, ' + errors.length + ' 错误, ' + warnings.length + ' 警告');
  if (errors.length > 0) {
    console.log('❌ 检查未通过 — 插件不能合并');
    process.exit(1);
    return true;
  } else if (warnings.length > 0) {
    console.log('⚠️  有警告但可以合并 — 建议修复');
    return false;
  } else {
    console.log('✅ 所有检查通过！');
    return false;
  }
}
