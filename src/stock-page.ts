/**
 * 股票大厅页面 — 专业炒股界面
 * TradingView Lightweight Charts + 自选股 + 实时行情
 * 建筑极简唯美风格（暗色交易主题变体）
 */

export function generateStockPage(): string {
  return `<!DOCTYPE html>
<html lang="zh">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>股票大厅 — 龙虾小镇</title>
<script src="https://unpkg.com/lightweight-charts@4.1.3/dist/lightweight-charts.standalone.production.js"><\/script>
<style>
*{margin:0;padding:0;box-sizing:border-box}
:root{
  --bg:#0d0d0f;--bg2:#141418;--bg3:#1c1c22;--border:#2a2a32;
  --text:#d4d4dc;--text2:#888;--warm:#c8a882;--warm2:#a07850;
  --up:#26a69a;--down:#ef5350;--up-bg:rgba(38,166,154,0.1);--down-bg:rgba(239,83,80,0.1);
}
body{font-family:"Noto Sans SC",system-ui,sans-serif;background:var(--bg);color:var(--text);min-height:100vh}
a{color:var(--warm);text-decoration:none}
a:hover{color:var(--text)}

/* 顶栏 */
.topbar{display:flex;align-items:center;justify-content:space-between;padding:10px 20px;border-bottom:1px solid var(--border);background:var(--bg2)}
.topbar h1{font-family:"Noto Serif SC",Georgia,serif;font-size:1.1rem;color:var(--warm);letter-spacing:0.05em}
.topbar-right{display:flex;gap:16px;align-items:center;font-size:0.78rem;color:var(--text2)}

/* 主布局：左侧自选股列表 + 右侧图表和详情 */
.main{display:grid;grid-template-columns:280px 1fr;height:calc(100vh - 45px);overflow:hidden}
@media(max-width:768px){.main{grid-template-columns:1fr;grid-template-rows:auto 1fr}}

/* 左侧面板 */
.sidebar{border-right:1px solid var(--border);display:flex;flex-direction:column;overflow:hidden;background:var(--bg2)}
.sidebar-header{padding:12px 14px;border-bottom:1px solid var(--border);display:flex;align-items:center;gap:8px}
.search-box{flex:1;padding:6px 10px;background:var(--bg3);border:1px solid var(--border);color:var(--text);font-size:0.8rem;border-radius:2px;font-family:inherit}
.search-box:focus{outline:none;border-color:var(--warm)}
.search-box::placeholder{color:var(--text2)}

/* 板块标签 */
.tabs{display:flex;border-bottom:1px solid var(--border);font-size:0.72rem}
.tab{flex:1;padding:8px 0;text-align:center;cursor:pointer;color:var(--text2);border-bottom:2px solid transparent;transition:all 0.2s}
.tab:hover{color:var(--text)}
.tab.active{color:var(--warm);border-bottom-color:var(--warm)}

/* 股票列表 */
.stock-list{flex:1;overflow-y:auto}
.stock-list::-webkit-scrollbar{width:3px}
.stock-list::-webkit-scrollbar-thumb{background:var(--border);border-radius:2px}
.stock-item{display:grid;grid-template-columns:1fr auto auto;align-items:center;padding:10px 14px;border-bottom:1px solid rgba(42,42,50,0.5);cursor:pointer;transition:background 0.15s}
.stock-item:hover{background:var(--bg3)}
.stock-item.active{background:var(--bg3);border-left:2px solid var(--warm)}
.stock-name{font-size:0.82rem;line-height:1.3}
.stock-name .symbol{color:var(--text);font-weight:600}
.stock-name .desc{font-size:0.68rem;color:var(--text2);margin-top:1px}
.stock-price{text-align:right;font-size:0.85rem;font-family:"SF Mono",Consolas,monospace;font-weight:600}
.stock-change{text-align:right;font-size:0.72rem;padding:2px 6px;border-radius:2px;font-family:"SF Mono",Consolas,monospace;min-width:60px}
.up{color:var(--up)}.down{color:var(--down)}
.up-bg{background:var(--up-bg)}.down-bg{background:var(--down-bg)}

/* 搜索结果 */
.search-results{position:absolute;top:100%;left:0;right:0;background:var(--bg2);border:1px solid var(--border);z-index:100;max-height:300px;overflow-y:auto;display:none}
.search-result-item{padding:8px 14px;cursor:pointer;font-size:0.8rem;border-bottom:1px solid rgba(42,42,50,0.3);display:flex;justify-content:space-between}
.search-result-item:hover{background:var(--bg3)}
.search-result-item .sr-sym{color:var(--warm);font-weight:600}
.search-result-item .sr-desc{color:var(--text2);font-size:0.72rem}
.search-result-item .sr-add{color:var(--up);font-size:0.7rem;opacity:0}
.search-result-item:hover .sr-add{opacity:1}

/* 右侧内容 */
.content{display:flex;flex-direction:column;overflow:hidden}

/* 行情概览条 */
.ticker-bar{display:flex;gap:0;border-bottom:1px solid var(--border);overflow-x:auto;background:var(--bg2);flex-shrink:0}
.ticker-item{padding:8px 16px;border-right:1px solid var(--border);min-width:120px;cursor:pointer;transition:background 0.15s}
.ticker-item:hover{background:var(--bg3)}
.ticker-item .ti-name{font-size:0.65rem;color:var(--text2);letter-spacing:0.1em;margin-bottom:2px}
.ticker-item .ti-price{font-size:0.9rem;font-family:"SF Mono",Consolas,monospace;font-weight:600}
.ticker-item .ti-change{font-size:0.7rem;font-family:"SF Mono",Consolas,monospace}

/* 图表区 */
.chart-area{flex:1;position:relative;min-height:300px}
.chart-header{display:flex;align-items:center;justify-content:space-between;padding:10px 16px;background:var(--bg);border-bottom:1px solid var(--border)}
.chart-symbol{font-size:1.2rem;font-weight:700;color:var(--text)}
.chart-symbol .cs-name{font-size:0.78rem;color:var(--text2);font-weight:400;margin-left:8px}
.chart-price-big{font-size:1.4rem;font-family:"SF Mono",Consolas,monospace;font-weight:700}
.chart-controls{display:flex;gap:4px}
.chart-btn{padding:4px 10px;font-size:0.7rem;background:transparent;border:1px solid var(--border);color:var(--text2);cursor:pointer;border-radius:2px;font-family:inherit}
.chart-btn:hover{border-color:var(--warm);color:var(--warm)}
.chart-btn.active{background:var(--warm);color:var(--bg);border-color:var(--warm)}
#chart-container{width:100%;flex:1}

/* 详情面板 */
.detail-panel{display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:0;border-top:1px solid var(--border);background:var(--bg2);flex-shrink:0}
.detail-item{padding:10px 16px;border-right:1px solid var(--border)}
.detail-item .di-label{font-size:0.62rem;color:var(--text2);letter-spacing:0.15em;margin-bottom:2px}
.detail-item .di-value{font-size:0.88rem;font-family:"SF Mono",Consolas,monospace}

/* 小镇板块 */
.town-sectors{border-top:1px solid var(--border);background:var(--bg2);padding:12px 16px;flex-shrink:0}
.town-sectors-title{font-size:0.68rem;color:var(--warm);letter-spacing:0.2em;margin-bottom:8px}
.sectors-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(100px,1fr));gap:6px}
.sector-card{padding:6px 8px;border:1px solid var(--border);border-radius:2px;cursor:pointer;transition:all 0.2s;text-align:center}
.sector-card:hover{border-color:var(--warm);transform:translateY(-1px)}
.sector-card .sc-name{font-size:0.72rem;margin-bottom:2px}
.sector-card .sc-price{font-size:0.78rem;font-family:"SF Mono",Consolas,monospace;font-weight:600}
.sector-card .sc-change{font-size:0.65rem;font-family:"SF Mono",Consolas,monospace}

/* 操作按钮 */
.action-bar{display:flex;gap:8px;padding:8px 14px;border-top:1px solid var(--border);background:var(--bg2)}
.btn{padding:6px 14px;font-size:0.78rem;border:1px solid var(--border);background:transparent;color:var(--text);cursor:pointer;font-family:inherit;border-radius:2px;transition:all 0.2s}
.btn:hover{border-color:var(--warm);color:var(--warm)}
.btn-buy{border-color:var(--up);color:var(--up)}
.btn-buy:hover{background:var(--up);color:var(--bg)}
.btn-sell{border-color:var(--down);color:var(--down)}
.btn-sell:hover{background:var(--down);color:var(--bg)}
.btn-warm{border-color:var(--warm);color:var(--warm)}
.btn-warm:hover{background:var(--warm);color:var(--bg)}

/* 加载中 */
.loading{color:var(--text2);font-size:0.8rem;padding:20px;text-align:center}

/* 空状态 */
.empty{display:flex;flex-direction:column;align-items:center;justify-content:center;padding:40px;color:var(--text2);font-size:0.85rem}
.empty .empty-icon{font-size:2.5rem;margin-bottom:12px;opacity:0.3}
</style>
</head>
<body>

<div class="topbar">
  <h1>📈 股票大厅</h1>
  <div class="topbar-right">
    <span id="market-status">加载中...</span>
    <a href="/">← 返回小镇</a>
    <a href="/games">游戏厅</a>
  </div>
</div>

<div class="main">
  <!-- 左侧：自选股 + 搜索 -->
  <div class="sidebar">
    <div class="sidebar-header" style="position:relative">
      <input class="search-box" id="search-input" placeholder="搜索股票代码..." autocomplete="off" />
      <div class="search-results" id="search-results"></div>
    </div>
    <!-- 模式切换 -->
    <div class="tabs" id="preset-tabs" style="font-size:0.65rem;background:var(--bg3)">
      <div class="tab" data-preset="cn" onclick="switchPreset(this)">A股</div>
      <div class="tab" data-preset="hk" onclick="switchPreset(this)">港股</div>
      <div class="tab" data-preset="us" onclick="switchPreset(this)">美股</div>
      <div class="tab" data-preset="custom" onclick="switchPreset(this)">自定义</div>
    </div>
    <div class="tabs">
      <div class="tab active" data-tab="watchlist" onclick="switchTab(this)">自选股</div>
      <div class="tab" data-tab="sectors" onclick="switchTab(this)">小镇板块</div>
      <div class="tab" data-tab="portfolio" onclick="switchTab(this)">我的持仓</div>
    </div>
    <div class="stock-list" id="stock-list">
      <div class="loading">加载中...</div>
    </div>
    <div class="action-bar">
      <button class="btn btn-warm" onclick="addDefaultStocks()" id="btn-hot" title="添加当前市场热门股票">+ 热门</button>
      <button class="btn btn-buy" onclick="openTrade('long')" id="btn-buy" disabled>买入</button>
      <button class="btn btn-sell" onclick="openTrade('short')" id="btn-sell" disabled>卖出</button>
    </div>
  </div>

  <!-- 右侧：图表 + 详情 -->
  <div class="content">
    <!-- 行情概览条 -->
    <div class="ticker-bar" id="ticker-bar"></div>

    <!-- 图表头部 -->
    <div class="chart-header">
      <div>
        <span class="chart-symbol" id="chart-symbol">--</span>
        <span class="chart-symbol cs-name" id="chart-name"></span>
      </div>
      <div style="text-align:right">
        <div class="chart-price-big" id="chart-price">--</div>
        <div id="chart-change" style="font-size:0.82rem;font-family:monospace">--</div>
      </div>
    </div>

    <!-- 图表 -->
    <div class="chart-area">
      <div id="chart-container"></div>
    </div>

    <!-- 详情面板 -->
    <div class="detail-panel" id="detail-panel">
      <div class="detail-item"><div class="di-label">开 盘</div><div class="di-value" id="d-open">--</div></div>
      <div class="detail-item"><div class="di-label">最 高</div><div class="di-value" id="d-high">--</div></div>
      <div class="detail-item"><div class="di-label">最 低</div><div class="di-value" id="d-low">--</div></div>
      <div class="detail-item"><div class="di-label">昨 收</div><div class="di-value" id="d-pc">--</div></div>
      <div class="detail-item"><div class="di-label">涨 跌 额</div><div class="di-value" id="d-change">--</div></div>
      <div class="detail-item"><div class="di-label">涨 跌 幅</div><div class="di-value" id="d-changepct">--</div></div>
    </div>

    <!-- 小镇板块（内嵌的模拟板块） -->
    <div class="town-sectors">
      <div class="town-sectors-title">小 镇 板 块（模 拟）</div>
      <div class="sectors-grid" id="sectors-grid"></div>
    </div>
  </div>
</div>

<script>
const SERVER = window.location.origin;
let chart = null;
let lineSeries = null;
let currentSymbol = null;
let currentTab = 'watchlist';
let userId = null;

// 从 localStorage 获取用户 ID
try { userId = JSON.parse(localStorage.getItem('lobster-user') || '{}').id; } catch {}

// ── 初始化图表 ──
function initChart() {
  var container = document.getElementById('chart-container');
  if (!container || !window.LightweightCharts) return;

  var rect = container.parentElement.getBoundingClientRect();
  chart = LightweightCharts.createChart(container, {
    width: rect.width,
    height: Math.max(rect.height - 2, 280),
    layout: {
      background: { color: '#0d0d0f' },
      textColor: '#888',
      fontSize: 11,
    },
    grid: {
      vertLines: { color: '#1c1c22' },
      horzLines: { color: '#1c1c22' },
    },
    crosshair: {
      vertLine: { color: '#c8a882', width: 1, style: 3, labelBackgroundColor: '#c8a882' },
      horzLine: { color: '#c8a882', width: 1, style: 3, labelBackgroundColor: '#c8a882' },
    },
    timeScale: {
      borderColor: '#2a2a32',
      timeVisible: true,
    },
    rightPriceScale: {
      borderColor: '#2a2a32',
    },
  });

  lineSeries = chart.addAreaSeries({
    topColor: 'rgba(200,168,130,0.3)',
    bottomColor: 'rgba(200,168,130,0.02)',
    lineColor: '#c8a882',
    lineWidth: 2,
  });

  // 响应式
  window.addEventListener('resize', function() {
    var r = container.parentElement.getBoundingClientRect();
    chart.applyOptions({ width: r.width, height: Math.max(r.height - 2, 280) });
  });
}

// ── 生成模拟历史数据（Mock K 线） ──
function generateMockHistory(basePrice, days) {
  var data = [];
  var price = basePrice || 100;
  var now = Math.floor(Date.now() / 1000);
  for (var i = days; i >= 0; i--) {
    var t = now - i * 86400;
    price = price * (1 + (Math.random() - 0.48) * 0.04);
    data.push({ time: t, value: Math.round(price * 100) / 100 });
  }
  return data;
}

// ── 选择股票 ──
async function selectStock(symbol, name) {
  currentSymbol = symbol;
  document.getElementById('chart-symbol').textContent = symbol;
  document.getElementById('chart-name').textContent = name || '';
  document.getElementById('btn-buy').disabled = false;
  document.getElementById('btn-sell').disabled = false;

  // 高亮列表项
  document.querySelectorAll('.stock-item').forEach(function(el) {
    el.classList.toggle('active', el.dataset.symbol === symbol);
  });

  // 获取行情
  try {
    var resp = await fetch(SERVER + '/api/market/quote/' + symbol);
    var data = await resp.json();
    if (data && data.c) {
      var isUp = data.dp >= 0;
      var cls = isUp ? 'up' : 'down';
      document.getElementById('chart-price').innerHTML = '<span class="' + cls + '">' + data.c.toFixed(2) + '</span>';
      document.getElementById('chart-change').innerHTML = '<span class="' + cls + '">' + (isUp ? '+' : '') + data.d.toFixed(2) + ' (' + (isUp ? '+' : '') + data.dp.toFixed(2) + '%)</span>';
      document.getElementById('d-open').textContent = data.o.toFixed(2);
      document.getElementById('d-high').textContent = data.h.toFixed(2);
      document.getElementById('d-low').textContent = data.l.toFixed(2);
      document.getElementById('d-pc').textContent = data.pc.toFixed(2);
      document.getElementById('d-change').innerHTML = '<span class="' + cls + '">' + (isUp ? '+' : '') + data.d.toFixed(2) + '</span>';
      document.getElementById('d-changepct').innerHTML = '<span class="' + cls + '">' + (isUp ? '+' : '') + data.dp.toFixed(2) + '%</span>';

      // 更新图表
      if (lineSeries) {
        var history = generateMockHistory(data.pc, 90);
        // 最后一个点用真实价格
        if (history.length > 0) history[history.length - 1].value = data.c;
        lineSeries.setData(history);
        chart.timeScale().fitContent();
      }
    } else {
      // Finnhub 无数据，用 Mock
      showMockData(symbol, name);
    }
  } catch (e) {
    showMockData(symbol, name);
  }
}

function showMockData(symbol, name) {
  var mockPrice = 50 + Math.random() * 200;
  var mockChange = (Math.random() - 0.45) * 8;
  var isUp = mockChange >= 0;
  var cls = isUp ? 'up' : 'down';
  document.getElementById('chart-price').innerHTML = '<span class="' + cls + '">' + mockPrice.toFixed(2) + '</span>';
  document.getElementById('chart-change').innerHTML = '<span class="' + cls + '">' + (isUp ? '+' : '') + mockChange.toFixed(2) + '%</span>';
  document.getElementById('d-open').textContent = (mockPrice * 0.99).toFixed(2);
  document.getElementById('d-high').textContent = (mockPrice * 1.02).toFixed(2);
  document.getElementById('d-low').textContent = (mockPrice * 0.97).toFixed(2);
  document.getElementById('d-pc').textContent = (mockPrice / (1 + mockChange / 100)).toFixed(2);
  document.getElementById('d-change').innerHTML = '<span class="' + cls + '">' + (isUp ? '+' : '') + (mockPrice * mockChange / 100).toFixed(2) + '</span>';
  document.getElementById('d-changepct').innerHTML = '<span class="' + cls + '">' + (isUp ? '+' : '') + mockChange.toFixed(2) + '%</span>';
  if (lineSeries) {
    lineSeries.setData(generateMockHistory(mockPrice, 90));
    chart.timeScale().fitContent();
  }
}

// ── 自选股管理 ──
async function loadWatchlist() {
  var list = document.getElementById('stock-list');
  if (!userId) {
    // 没有登录，用默认列表
    renderDefaultWatchlist(list);
    return;
  }
  try {
    var resp = await fetch(SERVER + '/api/market/watchlist/' + userId);
    var data = await resp.json();
    if (data.stocks && data.stocks.length > 0) {
      renderStockList(list, data.stocks);
    } else {
      renderDefaultWatchlist(list);
    }
  } catch {
    renderDefaultWatchlist(list);
  }
}

// ── 预设股票列表（按市场分类） ──
var STOCK_PRESETS = {
  'cn': {
    label: 'A股热门',
    stocks: [
      { symbol: '600519.SS', name: '贵州茅台', sector: '白酒' },
      { symbol: '300750.SZ', name: '宁德时代', sector: '新能源' },
      { symbol: '601318.SS', name: '中国平安', sector: '保险' },
      { symbol: '000858.SZ', name: '五粮液', sector: '白酒' },
      { symbol: '600036.SS', name: '招商银行', sector: '银行' },
      { symbol: '002594.SZ', name: '比亚迪', sector: '新能源车' },
      { symbol: '601899.SS', name: '紫金矿业', sector: '有色金属' },
      { symbol: '000001.SZ', name: '平安银行', sector: '银行' },
      { symbol: '600900.SS', name: '长江电力', sector: '电力' },
      { symbol: '601012.SS', name: '隆基绿能', sector: '光伏' },
    ]
  },
  'hk': {
    label: '港股热门',
    stocks: [
      { symbol: '0700.HK', name: '腾讯控股', sector: '互联网' },
      { symbol: '9988.HK', name: '阿里巴巴', sector: '电商' },
      { symbol: '3690.HK', name: '美团', sector: '本地生活' },
      { symbol: '9999.HK', name: '网易', sector: '游戏' },
      { symbol: '1810.HK', name: '小米集团', sector: '消费电子' },
      { symbol: '9618.HK', name: '京东集团', sector: '电商' },
      { symbol: '0941.HK', name: '中国移动', sector: '通信' },
      { symbol: '2318.HK', name: '中国平安', sector: '保险' },
    ]
  },
  'us': {
    label: '美股热门',
    stocks: [
      { symbol: 'AAPL', name: '苹果', sector: '科技' },
      { symbol: 'NVDA', name: '英伟达', sector: '芯片' },
      { symbol: 'TSLA', name: '特斯拉', sector: '新能源' },
      { symbol: 'MSFT', name: '微软', sector: '科技' },
      { symbol: 'GOOGL', name: '谷歌', sector: '科技' },
      { symbol: 'AMZN', name: '亚马逊', sector: '电商' },
      { symbol: 'META', name: 'Meta', sector: '社交' },
      { symbol: 'AMD', name: 'AMD', sector: '芯片' },
    ]
  }
};

// 当前模式（从 localStorage 读取，默认 A股）
var currentPreset = localStorage.getItem('stock-preset') || 'cn';
var customStocks = JSON.parse(localStorage.getItem('stock-custom') || '[]');

function getActiveStocks() {
  if (currentPreset === 'custom' && customStocks.length > 0) return customStocks;
  return (STOCK_PRESETS[currentPreset] || STOCK_PRESETS['cn']).stocks;
}

var DEFAULT_STOCKS = getActiveStocks();

function renderDefaultWatchlist(list) {
  var stocks = getActiveStocks();
  if (currentPreset === 'custom' && stocks.length === 0) {
    list.innerHTML = '<div class="empty"><div class="empty-icon">🔧</div>自定义模式<br><span style="font-size:0.72rem;margin-top:8px;color:var(--warm)">搜索股票代码添加到自选<br>支持 A股/港股/美股 任意组合</span></div>';
    return;
  }
  renderStockList(list, stocks);
}

function renderStockList(container, stocks) {
  if (stocks.length === 0) {
    container.innerHTML = '<div class="empty"><div class="empty-icon">📊</div>暂无自选股<br><span style="font-size:0.72rem;margin-top:8px">搜索股票代码添加到自选</span></div>';
    return;
  }
  var html = '';
  for (var i = 0; i < stocks.length; i++) {
    var s = stocks[i];
    var mockPct = ((Math.sin(i * 3.7 + Date.now() / 50000) * 4)).toFixed(2);
    var isUp = parseFloat(mockPct) >= 0;
    var mockPrice = (100 + i * 15 + Math.sin(i) * 30).toFixed(2);
    html += '<div class="stock-item" data-symbol="' + s.symbol + '" onclick="selectStock(\\'' + s.symbol + '\\',\\'' + (s.name || '') + '\\')">';
    html += '<div class="stock-name"><div class="symbol">' + s.symbol + '</div><div class="desc">' + (s.name || s.sector || '') + '</div></div>';
    html += '<div class="stock-price ' + (isUp ? 'up' : 'down') + '">' + mockPrice + '</div>';
    html += '<div class="stock-change ' + (isUp ? 'up up-bg' : 'down down-bg') + '">' + (isUp ? '+' : '') + mockPct + '%</div>';
    html += '</div>';
  }
  container.innerHTML = html;

  // 异步更新真实行情
  stocks.forEach(function(s) {
    fetch(SERVER + '/api/market/quote/' + s.symbol).then(function(r) { return r.json(); }).then(function(q) {
      if (!q || !q.c) return;
      var el = container.querySelector('[data-symbol="' + s.symbol + '"]');
      if (!el) return;
      var isUp = q.dp >= 0;
      el.querySelector('.stock-price').className = 'stock-price ' + (isUp ? 'up' : 'down');
      el.querySelector('.stock-price').textContent = q.c.toFixed(2);
      el.querySelector('.stock-change').className = 'stock-change ' + (isUp ? 'up up-bg' : 'down down-bg');
      el.querySelector('.stock-change').textContent = (isUp ? '+' : '') + q.dp.toFixed(2) + '%';
    }).catch(function() {});
  });
}

// ── 小镇板块（模拟数据） ──
async function loadSectors() {
  var list = document.getElementById('stock-list');
  try {
    var resp = await fetch(SERVER + '/api/town/market');
    var data = await resp.json();
    if (data && data.market && data.market.sectors) {
      var html = '';
      data.market.sectors.forEach(function(s) {
        var isUp = s.changePct >= 0;
        html += '<div class="stock-item" data-symbol="' + s.code + '" onclick="selectSector(\\'' + s.code + '\\',\\'' + s.name + '\\',' + s.price + ')">';
        html += '<div class="stock-name"><div class="symbol">' + s.code + '</div><div class="desc">' + s.name + '</div></div>';
        html += '<div class="stock-price ' + (isUp ? 'up' : 'down') + '">' + s.price.toFixed(2) + '</div>';
        html += '<div class="stock-change ' + (isUp ? 'up up-bg' : 'down down-bg') + '">' + (isUp ? '+' : '') + s.changePct.toFixed(2) + '%</div>';
        html += '</div>';
      });
      list.innerHTML = html;

      // 更新板块概览条
      renderTickerBar(data.market);
      document.getElementById('market-status').innerHTML =
        '<span class="' + (data.market.sentiment === 'bull' ? 'up' : data.market.sentiment === 'bear' ? 'down' : '') + '">'
        + data.market.indexName + ' ' + data.market.indexPrice.toFixed(2)
        + ' (' + (data.market.indexChangePct >= 0 ? '+' : '') + data.market.indexChangePct.toFixed(2) + '%)</span>';

      // 小镇板块卡片
      var sgrid = document.getElementById('sectors-grid');
      sgrid.innerHTML = data.market.sectors.map(function(s) {
        var isUp = s.changePct >= 0;
        return '<div class="sector-card" onclick="selectSector(\\'' + s.code + '\\',\\'' + s.name + '\\',' + s.price + ')">'
          + '<div class="sc-name">' + s.name + '</div>'
          + '<div class="sc-price">' + s.price.toFixed(0) + '</div>'
          + '<div class="sc-change ' + (isUp ? 'up' : 'down') + '">' + (isUp ? '+' : '') + s.changePct.toFixed(2) + '%</div>'
          + '</div>';
      }).join('');
    }
  } catch {}
}

function selectSector(code, name, price) {
  currentSymbol = code;
  document.getElementById('chart-symbol').textContent = code;
  document.getElementById('chart-name').textContent = name + '（模拟）';
  document.getElementById('btn-buy').disabled = false;
  document.getElementById('btn-sell').disabled = false;
  showMockData(code, name);
  document.querySelectorAll('.stock-item').forEach(function(el) {
    el.classList.toggle('active', el.dataset.symbol === code);
  });
}

function renderTickerBar(market) {
  var bar = document.getElementById('ticker-bar');
  var html = '<div class="ticker-item"><div class="ti-name">' + market.indexName + '</div>'
    + '<div class="ti-price">' + market.indexPrice.toFixed(2) + '</div>'
    + '<div class="ti-change ' + (market.indexChangePct >= 0 ? 'up' : 'down') + '">'
    + (market.indexChangePct >= 0 ? '+' : '') + market.indexChangePct.toFixed(2) + '%</div></div>';
  market.sectors.slice(0, 6).forEach(function(s) {
    var isUp = s.changePct >= 0;
    html += '<div class="ticker-item" onclick="selectSector(\\'' + s.code + '\\',\\'' + s.name + '\\',' + s.price + ')">'
      + '<div class="ti-name">' + s.name + '</div>'
      + '<div class="ti-price">' + s.price.toFixed(0) + '</div>'
      + '<div class="ti-change ' + (isUp ? 'up' : 'down') + '">' + (isUp ? '+' : '') + s.changePct.toFixed(2) + '%</div></div>';
  });
  bar.innerHTML = html;
}

// ── 持仓 ──
async function loadPortfolio() {
  var list = document.getElementById('stock-list');
  if (!userId) {
    list.innerHTML = '<div class="empty"><div class="empty-icon">💰</div>请先登录小镇<br><span style="font-size:0.72rem;margin-top:8px">注册后可在小镇板块交易</span></div>';
    return;
  }
  try {
    var resp = await fetch(SERVER + '/api/market/portfolio/' + userId);
    var data = await resp.json();
    if (data.holdings && data.holdings.length > 0) {
      var html = '<div style="padding:10px 14px;font-size:0.72rem;color:var(--text2);border-bottom:1px solid var(--border)">'
        + '可用: ' + data.tokens + ' Token | 总盈亏: <span class="' + (data.totalPnL >= 0 ? 'up' : 'down') + '">' + (data.totalPnL >= 0 ? '+' : '') + data.totalPnL + '</span></div>';
      data.holdings.forEach(function(h) {
        var isUp = h.pnlPct >= 0;
        html += '<div class="stock-item" onclick="selectSector(\\'' + h.sectorCode + '\\',\\'' + h.sectorName + '\\',' + h.currentPrice + ')">';
        html += '<div class="stock-name"><div class="symbol">' + h.sectorCode + ' ' + (h.direction === 'long' ? '↑多' : '↓空') + '</div><div class="desc">' + h.sectorName + ' · ' + h.amount + ' Token</div></div>';
        html += '<div class="stock-price ' + (isUp ? 'up' : 'down') + '">' + h.currentPrice.toFixed(2) + '</div>';
        html += '<div class="stock-change ' + (isUp ? 'up up-bg' : 'down down-bg') + '">' + (isUp ? '+' : '') + h.pnlPct.toFixed(2) + '%</div>';
        html += '</div>';
      });
      list.innerHTML = html;
    } else {
      list.innerHTML = '<div class="empty"><div class="empty-icon">📊</div>暂无持仓<br><span style="font-size:0.72rem;margin-top:8px">在小镇板块选择做多或做空</span></div>';
    }
  } catch {
    list.innerHTML = '<div class="empty"><div class="empty-icon">⚠</div>加载失败</div>';
  }
}

// ── Tab 切换 ──
function switchTab(el) {
  document.querySelectorAll('.tab').forEach(function(t) { t.classList.remove('active'); });
  el.classList.add('active');
  currentTab = el.dataset.tab;
  if (currentTab === 'watchlist') loadWatchlist();
  else if (currentTab === 'sectors') loadSectors();
  else if (currentTab === 'portfolio') loadPortfolio();
}

// ── 搜索 ──
var searchTimer = null;
document.getElementById('search-input').addEventListener('input', function(e) {
  clearTimeout(searchTimer);
  var q = e.target.value.trim();
  if (q.length < 1) { document.getElementById('search-results').style.display = 'none'; return; }
  searchTimer = setTimeout(function() {
    fetch(SERVER + '/api/market/search?q=' + encodeURIComponent(q)).then(function(r) { return r.json(); }).then(function(data) {
      var results = data.results || [];
      var container = document.getElementById('search-results');
      if (results.length === 0) {
        container.innerHTML = '<div class="search-result-item" style="color:var(--text2)">未找到结果</div>';
      } else {
        container.innerHTML = results.map(function(r) {
          return '<div class="search-result-item" onclick="addToWatchlist(\\'' + r.symbol + '\\',\\'' + (r.description || '').replace(/'/g, '') + '\\')">'
            + '<span><span class="sr-sym">' + r.symbol + '</span> <span class="sr-desc">' + (r.description || '').slice(0, 20) + '</span></span>'
            + '<span class="sr-add">+ 添加</span></div>';
        }).join('');
      }
      container.style.display = 'block';
    }).catch(function() {});
  }, 300);
});

document.getElementById('search-input').addEventListener('blur', function() {
  setTimeout(function() { document.getElementById('search-results').style.display = 'none'; }, 200);
});

// ── 添加自选股 ──
async function addToWatchlist(symbol, name) {
  document.getElementById('search-results').style.display = 'none';
  document.getElementById('search-input').value = '';
  // 自定义模式：同时保存到自定义列表
  if (currentPreset === 'custom') {
    addToCustom(symbol, name);
  }
  if (userId) {
    await fetch(SERVER + '/api/market/watchlist', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: userId, action: 'add', symbol: symbol, name: name })
    });
  }
  // 立即选中
  selectStock(symbol, name);
  if (currentTab === 'watchlist') loadWatchlist();
}

function addDefaultStocks() {
  getActiveStocks().forEach(function(s) { addToWatchlist(s.symbol, s.name); });
}

// ── 模式切换 ──
function switchPreset(el) {
  document.querySelectorAll('#preset-tabs .tab').forEach(function(t) { t.classList.remove('active'); });
  el.classList.add('active');
  currentPreset = el.dataset.preset;
  localStorage.setItem('stock-preset', currentPreset);
  DEFAULT_STOCKS = getActiveStocks();
  // 如果是自定义模式且无自定义股票，提示用户搜索添加
  if (currentPreset === 'custom' && customStocks.length === 0) {
    var list = document.getElementById('stock-list');
    list.innerHTML = '<div class="empty"><div class="empty-icon">🔧</div>自定义模式<br><span style="font-size:0.72rem;margin-top:8px;color:var(--warm)">搜索股票代码添加到自选<br>支持 A股/港股/美股 任意组合</span></div>';
    return;
  }
  if (currentTab === 'watchlist') loadWatchlist();
  // 自动选中第一只
  var first = getActiveStocks()[0];
  if (first) setTimeout(function() { selectStock(first.symbol, first.name); }, 300);
}

// 添加到自定义列表
function addToCustom(symbol, name) {
  if (customStocks.some(function(s) { return s.symbol === symbol; })) return;
  customStocks.push({ symbol: symbol, name: name, sector: '' });
  localStorage.setItem('stock-custom', JSON.stringify(customStocks));
}

// ── 交易弹窗（简化） ──
function openTrade(direction) {
  if (!currentSymbol) return;
  var amount = prompt((direction === 'long' ? '做多' : '做空') + ' ' + currentSymbol + '\\n请输入 Token 金额（最低 100）：', '500');
  if (!amount || isNaN(parseInt(amount))) return;
  if (!userId) { alert('请先在小镇首页注册登录'); return; }

  fetch(SERVER + '/api/market/trade', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userId: userId, sectorCode: currentSymbol, direction: direction, amount: parseInt(amount) })
  }).then(function(r) { return r.json(); }).then(function(data) {
    alert(data.message || '交易完成');
    if (currentTab === 'portfolio') loadPortfolio();
  }).catch(function() { alert('交易失败'); });
}

// ── 初始化 ──
initChart();
// 高亮当前预设 tab
(function() {
  var tabs = document.querySelectorAll('#preset-tabs .tab');
  tabs.forEach(function(t) {
    if (t.dataset.preset === currentPreset) t.classList.add('active');
  });
})();
loadWatchlist();
loadSectors();
// 默认选当前预设的第一只
var _firstStock = getActiveStocks()[0];
setTimeout(function() { selectStock(_firstStock.symbol, _firstStock.name); }, 500);
<\/script>
</body>
</html>`;
}
