/**
 * 管理后台 — 小镇运营数据统计面板
 * 用户管理 / 活跃统计 / Token 流水 / 系统健康
 */

export function generateAdminPage(): string {
  return `<!DOCTYPE html>
<html lang="zh">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>管理后台 — 龙虾小镇</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
:root{--bg:#0d0d0f;--bg2:#141418;--bg3:#1c1c22;--border:#2a2a32;--text:#d4d4dc;--text2:#888;--warm:#c8a882;--up:#26a69a;--down:#ef5350}
body{font-family:"Noto Sans SC",system-ui,sans-serif;background:var(--bg);color:var(--text);min-height:100vh}
a{color:var(--warm);text-decoration:none}a:hover{color:var(--text)}

.topbar{display:flex;align-items:center;justify-content:space-between;padding:10px 20px;border-bottom:1px solid var(--border);background:var(--bg2)}
.topbar h1{font-size:1rem;color:var(--warm);letter-spacing:0.05em}
.topbar-right{display:flex;gap:16px;align-items:center;font-size:0.78rem;color:var(--text2)}

.main{padding:20px}

/* 概览卡片 */
.stats-row{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:12px;margin-bottom:24px}
.stat-card{background:var(--bg2);border:1px solid var(--border);padding:16px;transition:border-color 0.3s}
.stat-card:hover{border-color:var(--warm)}
.stat-card .sc-label{font-size:0.62rem;letter-spacing:0.2em;color:var(--text2);margin-bottom:6px}
.stat-card .sc-value{font-size:1.6rem;font-weight:700;font-family:"SF Mono",Consolas,monospace}
.stat-card .sc-sub{font-size:0.7rem;color:var(--text2);margin-top:4px}

/* 标签页 */
.tabs{display:flex;border-bottom:1px solid var(--border);margin-bottom:20px}
.tab{padding:10px 20px;cursor:pointer;color:var(--text2);font-size:0.85rem;border-bottom:2px solid transparent;transition:all 0.2s}
.tab:hover{color:var(--text)}
.tab.active{color:var(--warm);border-bottom-color:var(--warm)}

.panel{display:none}
.panel.active{display:block}

/* 表格 */
table{width:100%;border-collapse:collapse;font-size:0.82rem}
th{text-align:left;padding:10px 12px;color:var(--text2);font-size:0.68rem;letter-spacing:0.15em;border-bottom:1px solid var(--border);background:var(--bg2)}
td{padding:10px 12px;border-bottom:1px solid rgba(42,42,50,0.4)}
tr:hover td{background:var(--bg3)}
.badge{display:inline-block;padding:2px 8px;font-size:0.65rem;border-radius:2px;margin-right:4px}
.badge-god{background:rgba(200,168,130,0.2);color:var(--warm)}
.badge-resident{background:rgba(100,200,150,0.1);color:var(--up)}
.up{color:var(--up)}.down{color:var(--down)}
.mono{font-family:"SF Mono",Consolas,monospace;font-size:0.78rem}

/* 搜索 */
.search-bar{margin-bottom:16px;display:flex;gap:8px}
.search-bar input{flex:1;padding:8px 12px;background:var(--bg3);border:1px solid var(--border);color:var(--text);font-size:0.82rem;font-family:inherit}
.search-bar input:focus{outline:none;border-color:var(--warm)}
.btn{padding:6px 14px;border:1px solid var(--border);background:transparent;color:var(--text);cursor:pointer;font-size:0.78rem;font-family:inherit;transition:all 0.2s}
.btn:hover{border-color:var(--warm);color:var(--warm)}

/* 时间线 */
.timeline{max-height:400px;overflow-y:auto;padding:8px 0}
.tl-item{display:flex;gap:12px;padding:8px 12px;border-bottom:1px solid rgba(42,42,50,0.3);font-size:0.8rem}
.tl-time{color:var(--text2);font-family:monospace;font-size:0.72rem;min-width:80px;flex-shrink:0}
.tl-icon{font-size:1rem;flex-shrink:0}
.tl-content{flex:1;color:var(--text)}

/* 健康指标 */
.health-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(250px,1fr));gap:12px}
.health-card{background:var(--bg2);border:1px solid var(--border);padding:16px}
.health-card .hc-title{font-size:0.75rem;color:var(--text2);letter-spacing:0.1em;margin-bottom:8px}
.health-card .hc-status{font-size:0.88rem;margin-bottom:4px}
.health-card .hc-detail{font-size:0.72rem;color:var(--text2)}
.dot{display:inline-block;width:8px;height:8px;border-radius:50%;margin-right:6px}
.dot-green{background:var(--up)}.dot-red{background:var(--down)}.dot-yellow{background:#e8b84a}

/* 刷新 */
.refresh-bar{display:flex;align-items:center;gap:12px;margin-bottom:16px;font-size:0.75rem;color:var(--text2)}
#last-refresh{font-family:monospace}
</style>
</head>
<body>

<div class="topbar">
  <h1>🛠 龙虾小镇管理后台</h1>
  <div class="topbar-right">
    <span id="server-time"></span>
    <a href="/">← 返回小镇</a>
    <a href="/guide">新手引导</a>
  </div>
</div>

<div class="main">
  <!-- 概览 -->
  <div class="stats-row" id="stats-row">
    <div class="stat-card"><div class="sc-label">注 册 用 户</div><div class="sc-value" id="s-users">--</div><div class="sc-sub" id="s-users-sub">加载中...</div></div>
    <div class="stat-card"><div class="sc-label">AI 居 民</div><div class="sc-value" id="s-agents">--</div><div class="sc-sub">MBTI 人格 Agent</div></div>
    <div class="stat-card"><div class="sc-label">总 Token 流 通</div><div class="sc-value" id="s-tokens">--</div><div class="sc-sub" id="s-tokens-sub">--</div></div>
    <div class="stat-card"><div class="sc-label">LLM 调 用</div><div class="sc-value" id="s-llm">--</div><div class="sc-sub" id="s-llm-sub">--</div></div>
    <div class="stat-card"><div class="sc-label">活 跃 游 戏</div><div class="sc-value" id="s-games">--</div><div class="sc-sub">龙虾杀进行中</div></div>
    <div class="stat-card"><div class="sc-label">悬 赏 任 务</div><div class="sc-value" id="s-bounties">--</div><div class="sc-sub" id="s-bounties-sub">--</div></div>
  </div>

  <!-- 标签页 -->
  <div class="tabs">
    <div class="tab active" onclick="switchPanel('users')">👥 用户管理</div>
    <div class="tab" onclick="switchPanel('activity')">📊 活跃统计</div>
    <div class="tab" onclick="switchPanel('economy')">💰 经济流水</div>
    <div class="tab" onclick="switchPanel('health')">🏥 系统健康</div>
  </div>

  <div class="refresh-bar">
    <button class="btn" onclick="refreshAll()">🔄 刷新数据</button>
    <span>上次刷新: <span id="last-refresh">--</span></span>
  </div>

  <!-- 用户管理面板 -->
  <div class="panel active" id="panel-users">
    <div class="search-bar">
      <input id="user-search" placeholder="搜索用户名/ID..." oninput="filterUsers()" />
    </div>
    <table id="users-table">
      <thead>
        <tr><th>用户</th><th>MBTI</th><th>身份</th><th>模式</th><th>Token</th><th>持仓</th><th>注册时间</th><th>操作</th></tr>
      </thead>
      <tbody id="users-tbody"></tbody>
    </table>
  </div>

  <!-- 活跃统计面板 -->
  <div class="panel" id="panel-activity">
    <div class="stats-row" style="margin-bottom:16px">
      <div class="stat-card"><div class="sc-label">今 日 活 跃</div><div class="sc-value" id="s-today-active">--</div></div>
      <div class="stat-card"><div class="sc-label">今 日 新 增</div><div class="sc-value" id="s-today-new">--</div></div>
      <div class="stat-card"><div class="sc-label">总 聊 天 数</div><div class="sc-value" id="s-chats">--</div></div>
    </div>
    <h3 style="font-size:0.85rem;color:var(--warm);margin-bottom:12px">近期活动</h3>
    <div class="timeline" id="activity-timeline"></div>
  </div>

  <!-- 经济流水面板 -->
  <div class="panel" id="panel-economy">
    <div class="stats-row" style="margin-bottom:16px">
      <div class="stat-card"><div class="sc-label">Token 总 量</div><div class="sc-value" id="s-total-tokens">--</div></div>
      <div class="stat-card"><div class="sc-label">平 均 持 有</div><div class="sc-value" id="s-avg-tokens">--</div></div>
      <div class="stat-card"><div class="sc-label">最 富 虾 友</div><div class="sc-value" id="s-richest">--</div></div>
    </div>
    <h3 style="font-size:0.85rem;color:var(--warm);margin-bottom:12px">Token 排行</h3>
    <table>
      <thead><tr><th>#</th><th>用户</th><th>余额</th><th>总投资</th><th>总盈亏</th></tr></thead>
      <tbody id="token-ranking"></tbody>
    </table>
  </div>

  <!-- 系统健康面板 -->
  <div class="panel" id="panel-health">
    <div class="health-grid" id="health-grid"></div>
  </div>
</div>

<script>
var SERVER = window.location.origin;
var allUsers = [];

async function api(path) {
  try {
    var r = await fetch(SERVER + path, { signal: AbortSignal.timeout(8000) });
    return await r.json();
  } catch (e) { return null; }
}

function switchPanel(name) {
  document.querySelectorAll('.panel').forEach(function(p) { p.classList.remove('active'); });
  document.querySelectorAll('.tab').forEach(function(t) { t.classList.remove('active'); });
  document.getElementById('panel-' + name).classList.add('active');
  event.target.classList.add('active');
}

async function refreshAll() {
  document.getElementById('last-refresh').textContent = new Date().toLocaleTimeString();
  document.getElementById('server-time').textContent = new Date().toLocaleString();

  // 用户
  var users = await api('/api/users');
  if (users) {
    allUsers = users;
    document.getElementById('s-users').textContent = users.length;
    var today = new Date().toISOString().slice(0, 10);
    var todayUsers = users.filter(function(u) { return (u.createdAt || '').startsWith(today); });
    document.getElementById('s-users-sub').textContent = '今日新增 ' + todayUsers.length;
    document.getElementById('s-today-new').textContent = todayUsers.length;
    renderUsers(users);
  }

  // Agents
  var agents = await api('/api/agents');
  if (agents) document.getElementById('s-agents').textContent = agents.length;

  // LLM stats
  var stats = await api('/api/config/stats');
  if (stats) {
    document.getElementById('s-llm').textContent = stats.totalCalls || 0;
    document.getElementById('s-llm-sub').textContent = '预估 Token: ' + (stats.estimatedTokens || 0);
  }

  // 悬赏
  var bounties = await api('/api/bounties');
  if (bounties) {
    var open = Array.isArray(bounties) ? bounties.filter(function(b) { return b.status === 'open'; }).length : 0;
    document.getElementById('s-bounties').textContent = Array.isArray(bounties) ? bounties.length : 0;
    document.getElementById('s-bounties-sub').textContent = open + ' 个进行中';
  }

  // 龙虾杀
  var mafia = await api('/api/mafia/list');
  if (mafia) document.getElementById('s-games').textContent = mafia.length;

  // 聊天
  var chats = await api('/api/town/chat');
  if (chats) document.getElementById('s-chats').textContent = Array.isArray(chats) ? chats.length : 0;

  // Token 统计
  await loadEconomy(users || []);

  // 健康检查
  await loadHealth(stats);

  // 活动时间线
  await loadActivity(users || []);
}

function renderUsers(users) {
  var tbody = document.getElementById('users-tbody');
  var html = '';
  for (var i = 0; i < users.length; i++) {
    var u = users[i];
    var modeClass = u.mode === 'god' ? 'badge-god' : 'badge-resident';
    html += '<tr data-name="' + (u.name || '') + '" data-id="' + (u.id || '') + '">';
    html += '<td><strong>' + (u.name || '?') + '</strong><br><span style="font-size:0.65rem;color:#555">' + (u.id || '').slice(0, 20) + '</span></td>';
    html += '<td>' + (u.mbti || '?') + '</td>';
    html += '<td>' + (u.role || u.occupation || '居民') + '</td>';
    html += '<td><span class="badge ' + modeClass + '">' + (u.mode || 'resident') + '</span></td>';
    html += '<td class="mono" id="tok-' + i + '">...</td>';
    html += '<td class="mono" id="pos-' + i + '">...</td>';
    html += '<td style="font-size:0.72rem;color:#555">' + (u.createdAt || '').slice(0, 10) + '</td>';
    html += '<td><button class="btn" onclick="viewUser(\\'' + (u.id || '') + '\\')">详情</button></td>';
    html += '</tr>';
  }
  tbody.innerHTML = html;

  // 异步加载每个用户的钱包
  users.forEach(function(u, i) {
    api('/api/wallet/' + u.id).then(function(w) {
      var el = document.getElementById('tok-' + i);
      if (el && w) el.innerHTML = '<span class="' + ((w.balance || 0) > 10000 ? 'up' : '') + '">' + (w.balance || w.tokens || 0) + '</span>';
    });
    api('/api/market/portfolio/' + u.id).then(function(p) {
      var el = document.getElementById('pos-' + i);
      if (el && p) {
        var count = (p.holdings || []).length;
        el.innerHTML = count > 0 ? count + ' 笔 <span class="' + ((p.totalPnL || 0) >= 0 ? 'up' : 'down') + '">(' + (p.totalPnL >= 0 ? '+' : '') + (p.totalPnL || 0) + ')</span>' : '-';
      }
    });
  });
}

function filterUsers() {
  var q = document.getElementById('user-search').value.toLowerCase();
  document.querySelectorAll('#users-tbody tr').forEach(function(tr) {
    var name = (tr.dataset.name || '').toLowerCase();
    var id = (tr.dataset.id || '').toLowerCase();
    tr.style.display = (!q || name.includes(q) || id.includes(q)) ? '' : 'none';
  });
}

async function viewUser(userId) {
  var w = await api('/api/wallet/' + userId);
  var p = await api('/api/market/portfolio/' + userId);
  var room = await api('/api/room/' + userId);
  var detail = 'ID: ' + userId;
  if (w) detail += '\\nToken: ' + (w.balance || w.tokens || 0) + '\\n交易记录: ' + (w.transactions || []).length + ' 条';
  if (p) detail += '\\n持仓: ' + (p.holdings || []).length + ' 笔\\n总盈亏: ' + (p.totalPnL || 0);
  if (room) detail += '\\n家具: ' + (room.furniture || []).length + ' 件\\n宠物: ' + (room.pets || []).length + ' 只';
  alert(detail);
}

async function loadEconomy(users) {
  var total = 0; var balances = []; var richest = { name: '-', bal: 0 };
  var results = await Promise.all(users.map(function(u) { return api('/api/wallet/' + u.id); }));
  results.forEach(function(w, i) {
    var bal = w ? (w.balance || w.tokens || 0) : 0;
    total += bal;
    balances.push({ name: users[i].name, id: users[i].id, balance: bal, invested: 0, pnl: 0 });
    if (bal > richest.bal) richest = { name: users[i].name, bal: bal };
  });
  document.getElementById('s-total-tokens').textContent = total.toLocaleString();
  document.getElementById('s-tokens').textContent = total.toLocaleString();
  document.getElementById('s-tokens-sub').textContent = '人均 ' + Math.round(total / Math.max(users.length, 1));
  document.getElementById('s-avg-tokens').textContent = Math.round(total / Math.max(users.length, 1)).toLocaleString();
  document.getElementById('s-richest').textContent = richest.name;

  balances.sort(function(a, b) { return b.balance - a.balance; });
  var rankHtml = '';
  balances.slice(0, 20).forEach(function(b, i) {
    rankHtml += '<tr><td>' + (i + 1) + '</td><td>' + b.name + '</td><td class="mono up">' + b.balance.toLocaleString() + '</td><td class="mono">-</td><td class="mono">-</td></tr>';
  });
  document.getElementById('token-ranking').innerHTML = rankHtml;
}

async function loadHealth(stats) {
  var grid = document.getElementById('health-grid');
  var items = [];

  // 服务器
  items.push({ title: '服务器', status: '<span class="dot dot-green"></span>运行中', detail: 'Bun + TypeScript · 端口 3456' });

  // LLM
  var llmOk = stats && stats.totalCalls > 0;
  items.push({ title: 'LLM 模型', status: '<span class="dot ' + (stats ? 'dot-green' : 'dot-yellow') + '"></span>' + (stats && !stats.energySaving ? 'MiniMax M2.7' : '节能模式'), detail: '调用 ' + (stats ? stats.totalCalls : 0) + ' 次 · 预估 Token ' + (stats ? stats.estimatedTokens : 0) });

  // Ollama
  var ollamaHealth = await api('/api/admin/health');
  if (ollamaHealth) {
    items.push({ title: 'Ollama', status: '<span class="dot ' + (ollamaHealth.ollama ? 'dot-green' : 'dot-red') + '"></span>' + (ollamaHealth.ollama ? '在线' : '离线'), detail: ollamaHealth.ollamaModels || '无可用模型' });
    items.push({ title: 'ComfyUI', status: '<span class="dot ' + (ollamaHealth.comfyui ? 'dot-green' : 'dot-red') + '"></span>' + (ollamaHealth.comfyui ? '在线' : '离线'), detail: '画图引擎' });
  }

  // 数据
  items.push({ title: '用户数据', status: '<span class="dot dot-green"></span>agent-memories/', detail: allUsers.length + ' 个用户目录' });
  items.push({ title: '报告目录', status: '<span class="dot dot-green"></span>reports/', detail: 'report.html + 成果库' });

  grid.innerHTML = items.map(function(it) {
    return '<div class="health-card"><div class="hc-title">' + it.title + '</div><div class="hc-status">' + it.status + '</div><div class="hc-detail">' + it.detail + '</div></div>';
  }).join('');
}

async function loadActivity(users) {
  var timeline = document.getElementById('activity-timeline');
  var events = [];

  // 最近注册的用户
  users.slice().sort(function(a, b) { return (b.createdAt || '').localeCompare(a.createdAt || ''); }).slice(0, 10).forEach(function(u) {
    events.push({ time: (u.createdAt || '').slice(11, 16), icon: '🦞', content: u.name + ' 注册了小镇', ts: u.createdAt });
  });

  // 聊天消息
  var chats = await api('/api/town/chat');
  if (Array.isArray(chats)) {
    chats.slice(-10).reverse().forEach(function(c) {
      events.push({ time: (c.time || c.timestamp || '').slice(11, 16), icon: '💬', content: (c.name || c.userId || '?') + ': ' + (c.message || '').slice(0, 40), ts: c.time || c.timestamp });
    });
  }

  // 按时间排序
  events.sort(function(a, b) { return (b.ts || '').localeCompare(a.ts || ''); });
  var todayStr = new Date().toISOString().slice(0, 10);
  var todayEvents = events.filter(function(e) { return (e.ts || '').startsWith(todayStr); });
  document.getElementById('s-today-active').textContent = todayEvents.length;

  timeline.innerHTML = events.slice(0, 30).map(function(e) {
    return '<div class="tl-item"><span class="tl-time">' + (e.time || '--:--') + '</span><span class="tl-icon">' + e.icon + '</span><span class="tl-content">' + e.content + '</span></div>';
  }).join('') || '<div style="padding:20px;text-align:center;color:#555">暂无活动记录</div>';
}

// 初始加载
refreshAll();
// 每 30 秒自动刷新
setInterval(refreshAll, 30000);
</script>
</body>
</html>`;
}
