/**
 * 龙虾小镇游戏厅 — 3 个纯前端迷你游戏
 *
 * 游戏 1: 龙虾 2048
 * 游戏 2: 飞翔的龙虾 (Flappy Lobster)
 * 游戏 3: 龙虾赛跑 (Lobster Race)
 */

export function generateGamesPage(): string {
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1.0">
<title>龙虾小镇 · 游戏厅</title>
<style>
  :root {
    --black: #1a1a1a;
    --dark: #2d2d2d;
    --gray-900: #3a3a3a;
    --gray-700: #555;
    --gray-500: #888;
    --gray-300: #bbb;
    --gray-100: #e8e8e8;
    --white: #fafafa;
    --warm: #c8a882;
    --warm-light: #e8d5c0;
    --warm-bg: #f5f0eb;
  }
  * { margin:0; padding:0; box-sizing:border-box; }
  body {
    font-family: "Noto Sans SC", "Microsoft YaHei", system-ui, sans-serif;
    background: var(--white);
    color: var(--dark);
    min-height: 100vh;
  }
  .nav {
    position: fixed; top: 0; left: 0; right: 0; z-index: 100;
    background: rgba(250,250,250,0.85);
    backdrop-filter: blur(20px);
    border-bottom: 1px solid var(--gray-100);
    padding: 0 24px; height: 56px;
    display: flex; align-items: center; justify-content: space-between;
  }
  .nav-title { font-size: 1rem; font-weight: 600; color: var(--black); letter-spacing: 0.05em; }
  .nav a { color: var(--gray-700); text-decoration: none; font-size: 0.85rem; transition: color 0.3s; }
  .nav a:hover { color: var(--warm); }
  .top-line { position: fixed; top: 0; left: 0; right: 0; height: 2px; background: var(--warm); z-index: 101; }
  .container { max-width: 800px; margin: 0 auto; padding: 80px 24px 48px; }
  .hero { text-align: center; padding: 48px 0 32px; }
  .hero-label { font-size: 0.72rem; letter-spacing: 0.35em; color: var(--warm); text-transform: uppercase; margin-bottom: 12px; }
  .hero h1 { font-family: "Noto Serif SC", Georgia, serif; font-size: 2rem; font-weight: 400; color: var(--black); letter-spacing: 0.02em; }
  .hero p { color: var(--gray-500); font-size: 0.9rem; margin-top: 12px; }
  .game-cards { display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; margin-bottom: 48px; }
  @media (max-width: 600px) { .game-cards { grid-template-columns: 1fr; } }
  .game-card {
    border: 1px solid var(--gray-100); border-radius: 8px; padding: 24px 16px;
    text-align: center; cursor: pointer; position: relative; overflow: hidden; background: var(--white);
    transition: all 0.5s cubic-bezier(0.22, 1, 0.36, 1);
  }
  .game-card::before {
    content: ''; position: absolute; top: 0; left: 50%; transform: translateX(-50%);
    width: 0; height: 2px; background: var(--warm);
    transition: width 0.5s cubic-bezier(0.22, 1, 0.36, 1);
  }
  .game-card:hover { transform: translateY(-4px); box-shadow: 0 8px 30px rgba(0,0,0,0.06); border-color: var(--warm-light); }
  .game-card:hover::before { width: 100%; }
  .game-card.active { border-color: var(--warm); background: var(--warm-bg); }
  .game-card.active::before { width: 100%; }
  .game-card .emoji { font-size: 2.4rem; margin-bottom: 12px; }
  .game-card .name { font-size: 0.95rem; font-weight: 600; color: var(--black); margin-bottom: 6px; }
  .game-card .desc { font-size: 0.78rem; color: var(--gray-500); line-height: 1.5; }
  .game-panel { display: none; }
  .game-panel.active { display: block; }
  .divider { border: none; border-top: 1px solid var(--gray-100); margin: 48px 0; }
  .lb-title { font-size: 0.72rem; letter-spacing: 0.35em; color: var(--warm); text-transform: uppercase; margin-bottom: 24px; text-align: center; }
  #lb-content { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 24px; }
  .footer { text-align: center; padding: 32px 0; color: var(--gray-500); font-size: 0.78rem; border-top: 1px solid var(--gray-100); }
</style>
</head>
<body>
<div class="top-line"></div>
<nav class="nav">
  <span class="nav-title">\u{1F99E} 龙虾小镇 · 游戏厅</span>
  <a href="/">\u2190 返回首页</a>
</nav>

<div class="container">
  <div class="hero">
    <div class="hero-label">01 / 游戏厅</div>
    <h1>龙虾小镇游戏厅</h1>
    <p>三款龙虾主题迷你游戏，纯前端、零延迟</p>
  </div>

  <div class="game-cards">
    <div class="game-card active" data-game="g2048" onclick="switchGame('g2048',this)">
      <div class="emoji">\u{1F99E}</div>
      <div class="name">龙虾 2048</div>
      <div class="desc">合并龙虾，完成进化之路</div>
    </div>
    <div class="game-card" data-game="flappy" onclick="switchGame('flappy',this)">
      <div class="emoji">\u{1F373}</div>
      <div class="name">飞翔的龙虾</div>
      <div class="desc">躲避锅具，飞得更远</div>
    </div>
    <div class="game-card" data-game="race" onclick="switchGame('race',this)">
      <div class="emoji">\u{1F3C1}</div>
      <div class="name">龙虾赛跑</div>
      <div class="desc">疯狂点击，速度为王</div>
    </div>
  </div>

  <!-- ═══ 游戏 1: 龙虾 2048 ═══ -->
  <div class="game-panel active" id="panel-g2048" style="text-align:center;">
    <div style="display:flex;justify-content:space-between;align-items:center;max-width:420px;margin:0 auto 16px;">
      <div>
        <span style="font-size:0.72rem;letter-spacing:0.35em;color:var(--warm);">当前分数</span>
        <div id="score2048" style="font-size:1.8rem;font-weight:700;color:var(--black);">0</div>
      </div>
      <button id="btn-reset2048" style="padding:8px 24px;border:1px solid var(--gray-100);background:var(--white);color:var(--dark);cursor:pointer;font-size:0.85rem;border-radius:4px;">重新开始</button>
      <div>
        <span style="font-size:0.72rem;letter-spacing:0.35em;color:var(--warm);">最高分</span>
        <div id="best2048" style="font-size:1.8rem;font-weight:700;color:var(--warm);">0</div>
      </div>
    </div>
    <div id="grid2048" style="display:grid;grid-template-columns:repeat(4,1fr);gap:8px;max-width:420px;margin:0 auto;background:var(--gray-100);padding:8px;border-radius:8px;touch-action:none;"></div>
    <div id="msg2048" style="margin-top:16px;font-size:1.1rem;color:var(--warm);min-height:2em;"></div>
    <p style="color:var(--gray-500);font-size:0.8rem;margin-top:12px;">方向键 / 触摸滑动控制</p>
  </div>

  <!-- ═══ 游戏 2: 飞翔的龙虾 ═══ -->
  <div class="game-panel" id="panel-flappy" style="text-align:center;">
    <canvas id="flappyCvs" width="400" height="600" style="border:1px solid var(--gray-100);border-radius:8px;max-width:100%;cursor:pointer;touch-action:none;"></canvas>
    <div style="margin-top:12px;">
      <span id="flappyScore" style="font-size:1.4rem;font-weight:700;color:var(--black);">0</span>
      <span style="color:var(--gray-500);margin:0 12px;">|</span>
      <span style="font-size:0.72rem;letter-spacing:0.2em;color:var(--warm);">最高 </span>
      <span id="flappyBest" style="font-size:1.1rem;font-weight:700;color:var(--warm);">0</span>
    </div>
    <p style="color:var(--gray-500);font-size:0.8rem;margin-top:8px;">点击 / 空格跳跃 · 躲避锅具障碍</p>
  </div>

  <!-- ═══ 游戏 3: 龙虾赛跑 ═══ -->
  <div class="game-panel" id="panel-race" style="text-align:center;max-width:560px;margin:0 auto;">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;">
      <div>
        <span style="font-size:0.72rem;letter-spacing:0.35em;color:var(--warm);">手速 CPS</span>
        <div id="raceCps" style="font-size:1.6rem;font-weight:700;color:var(--black);">0.0</div>
      </div>
      <button id="raceBtn" style="padding:10px 32px;border:1px solid var(--warm);background:var(--warm-bg);color:var(--dark);cursor:pointer;font-size:0.95rem;border-radius:4px;letter-spacing:0.1em;">开始比赛</button>
      <div>
        <span style="font-size:0.72rem;letter-spacing:0.35em;color:var(--warm);">最佳 CPS</span>
        <div id="raceBestCps" style="font-size:1.6rem;font-weight:700;color:var(--warm);">0.0</div>
      </div>
    </div>
    <div id="raceTracks" style="border:1px solid var(--gray-100);border-radius:8px;padding:16px;background:var(--white);"></div>
    <div id="raceMsg" style="margin-top:12px;font-size:1.1rem;color:var(--warm);min-height:2em;"></div>
    <div id="raceClickZone" style="margin-top:16px;padding:40px;border:2px dashed var(--gray-100);border-radius:8px;cursor:pointer;color:var(--gray-500);font-size:0.85rem;user-select:none;touch-action:none;display:none;">
      \u{1F449} 在此区域疯狂点击 / 按空格
    </div>
    <p style="color:var(--gray-500);font-size:0.8rem;margin-top:8px;">疯狂点击按钮或此区域 / 按空格键让龙虾前进</p>
  </div>

  <hr class="divider">
  <div>
    <div class="lb-title">02 / 排行榜</div>
    <div id="lb-content"></div>
  </div>
</div>

<div class="footer">龙虾小镇 · mem-mem — 纯前端迷你游戏，数据存储于本地浏览器</div>

<script>
// ══════════════════════════════════════════
// 全局工具
// ══════════════════════════════════════════
function saveScore(game, sc) {
  try {
    var scores = JSON.parse(localStorage.getItem('lobster_scores') || '{}');
    if (!scores[game]) scores[game] = [];
    scores[game].push({ score: sc, time: new Date().toISOString() });
    scores[game].sort(function(a, b) { return b.score - a.score; });
    scores[game] = scores[game].slice(0, 20);
    localStorage.setItem('lobster_scores', JSON.stringify(scores));
    fetch('/api/games/score', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ game: game, score: sc }) }).catch(function(){});
  } catch(e) {}
}

function loadLeaderboard() {
  var el = document.getElementById('lb-content');
  if (!el) return;
  var scores = JSON.parse(localStorage.getItem('lobster_scores') || '{}');
  var names = { '2048': '\u{1F99E} 龙虾 2048', flappy: '\u{1F99E} 飞翔的龙虾', race: '\u{1F99E} 龙虾赛跑' };
  var html = '';
  ['2048', 'flappy', 'race'].forEach(function(gk) {
    var list = scores[gk] || [];
    html += '<div style="margin-bottom:24px;"><div style="font-size:0.8rem;letter-spacing:0.2em;color:var(--warm);margin-bottom:8px;">' + names[gk] + '</div>';
    if (!list.length) { html += '<div style="color:var(--gray-500);font-size:0.85rem;">还没有记录</div></div>'; return; }
    html += '<table style="width:100%;border-collapse:collapse;font-size:0.85rem;">';
    html += '<tr style="color:var(--gray-500);border-bottom:1px solid var(--gray-100);"><td style="padding:4px 0;">排名</td><td>分数</td><td style="text-align:right;">时间</td></tr>';
    list.slice(0, 5).forEach(function(s, i) {
      var medal = i === 0 ? '\u{1F947}' : i === 1 ? '\u{1F948}' : i === 2 ? '\u{1F949}' : (i + 1);
      var t = new Date(s.time);
      var ts = (t.getMonth()+1) + '/' + t.getDate() + ' ' + t.getHours() + ':' + String(t.getMinutes()).padStart(2,'0');
      html += '<tr style="border-bottom:1px solid var(--gray-100);"><td style="padding:6px 0;">' + medal + '</td><td style="font-weight:600;color:var(--dark);">' + s.score + '</td><td style="text-align:right;color:var(--gray-500);">' + ts + '</td></tr>';
    });
    html += '</table></div>';
  });
  el.innerHTML = html || '<div style="color:var(--gray-500);">还没有任何游戏记录</div>';
}

// 游戏切换
var flappyStopped = true;
function switchGame(name, card) {
  document.querySelectorAll('.game-card').forEach(function(c) { c.classList.remove('active'); });
  document.querySelectorAll('.game-panel').forEach(function(p) { p.classList.remove('active'); });
  if (card) card.classList.add('active');
  var panel = document.getElementById('panel-' + name);
  if (panel) panel.classList.add('active');
  // 停止 flappy 游戏循环
  flappyStopped = true;
  if (name === 'flappy') { flappyStopped = false; initFlappy(); }
  loadLeaderboard();
}

// ══════════════════════════════════════════
// 游戏 1: 龙虾 2048
// ══════════════════════════════════════════
(function() {
  var EMOJI = {2:'\\u{1F990}',4:'\\u{1F980}',8:'\\u{1F99E}',16:'\\u{1F419}',32:'\\u{1F433}',64:'\\u{1F40B}',128:'\\u{1F451}',256:'\\u2B50',512:'\\u{1F48E}',1024:'\\u{1F525}',2048:'\\u{1F3C6}'};
  var BG = {0:'var(--gray-100)',2:'#f5f0eb',4:'#e8d5c0',8:'#dcc4a8',16:'#c8a882',32:'#b8936d',64:'#a07850',128:'#8a6540',256:'#705030',512:'#553820',1024:'#3a2510',2048:'#1a1a1a'};
  var FG = {0:'transparent',2:'var(--dark)',4:'var(--dark)',8:'var(--dark)',16:'#fff',32:'#fff',64:'#fff',128:'#fff',256:'#fff',512:'#fff',1024:'#fff',2048:'#ffd700'};
  var grid, score, best, over;

  function init() {
    grid = [];
    for (var r = 0; r < 4; r++) { grid[r] = [0, 0, 0, 0]; }
    score = 0; over = false;
    addRandom(); addRandom();
    best = parseInt(localStorage.getItem('best2048') || '0');
    document.getElementById('best2048').textContent = best;
    document.getElementById('msg2048').textContent = '';
    render();
  }

  function addRandom() {
    var empty = [];
    for (var r = 0; r < 4; r++) for (var c = 0; c < 4; c++) if (!grid[r][c]) empty.push([r, c]);
    if (!empty.length) return;
    var pos = empty[Math.floor(Math.random() * empty.length)];
    grid[pos[0]][pos[1]] = Math.random() < 0.9 ? 2 : 4;
  }

  function render() {
    var el = document.getElementById('grid2048'); el.innerHTML = '';
    for (var r = 0; r < 4; r++) for (var c = 0; c < 4; c++) {
      var v = grid[r][c];
      var cell = document.createElement('div');
      var fs = v >= 128 ? '1.6rem' : '2rem';
      cell.style.cssText = 'width:100%;aspect-ratio:1;display:flex;align-items:center;justify-content:center;border-radius:6px;font-size:' + fs + ';background:' + (BG[v] || BG[2048]) + ';color:' + (FG[v] || FG[2048]);
      cell.textContent = v ? (EMOJI[v] || v) : '';
      el.appendChild(cell);
    }
    document.getElementById('score2048').textContent = score;
    if (score > best) { best = score; localStorage.setItem('best2048', String(best)); document.getElementById('best2048').textContent = best; }
  }

  function slide(row) {
    var a = row.filter(function(x) { return x; });
    for (var i = 0; i < a.length - 1; i++) {
      if (a[i] === a[i + 1]) { a[i] *= 2; score += a[i]; a.splice(i + 1, 1); }
    }
    while (a.length < 4) a.push(0);
    return a;
  }

  function move(dir) {
    if (over) return;
    var prev = JSON.stringify(grid);
    var r, c, col;
    if (dir === 'left') { for (r = 0; r < 4; r++) grid[r] = slide(grid[r]); }
    else if (dir === 'right') { for (r = 0; r < 4; r++) { grid[r].reverse(); grid[r] = slide(grid[r]); grid[r].reverse(); } }
    else if (dir === 'up') { for (c = 0; c < 4; c++) { col = [grid[0][c], grid[1][c], grid[2][c], grid[3][c]]; col = slide(col); for (r = 0; r < 4; r++) grid[r][c] = col[r]; } }
    else if (dir === 'down') { for (c = 0; c < 4; c++) { col = [grid[3][c], grid[2][c], grid[1][c], grid[0][c]]; col = slide(col); for (r = 0; r < 4; r++) grid[r][c] = col[3 - r]; } }
    if (JSON.stringify(grid) !== prev) { addRandom(); render(); checkEnd(); }
  }

  function checkEnd() {
    for (var r = 0; r < 4; r++) for (var c = 0; c < 4; c++) {
      if (grid[r][c] === 2048) { document.getElementById('msg2048').innerHTML = '<span style="color:#c8a882;font-size:1.3rem;">\\u{1F3C6} 恭喜！龙虾进化完成！</span>'; over = true; saveScore('2048', score); return; }
      if (!grid[r][c]) return;
      if (c < 3 && grid[r][c] === grid[r][c + 1]) return;
      if (r < 3 && grid[r][c] === grid[r + 1][c]) return;
    }
    document.getElementById('msg2048').innerHTML = '<span style="color:var(--gray-500);">游戏结束！得分: ' + score + '</span>';
    over = true;
    saveScore('2048', score);
  }

  document.addEventListener('keydown', function(e) {
    if (!document.getElementById('panel-g2048').classList.contains('active')) return;
    var map = { ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'up', ArrowDown: 'down' };
    if (map[e.key]) { e.preventDefault(); move(map[e.key]); }
  });

  // 触摸滑动
  var tx, ty;
  var gridEl = document.getElementById('grid2048');
  gridEl.addEventListener('touchstart', function(e) { tx = e.touches[0].clientX; ty = e.touches[0].clientY; e.preventDefault(); }, { passive: false });
  gridEl.addEventListener('touchend', function(e) {
    var dx = e.changedTouches[0].clientX - tx, dy = e.changedTouches[0].clientY - ty;
    if (Math.abs(dx) > Math.abs(dy)) { if (dx > 30) move('right'); else if (dx < -30) move('left'); }
    else { if (dy > 30) move('down'); else if (dy < -30) move('up'); }
  }, { passive: true });

  document.getElementById('btn-reset2048').addEventListener('click', init);
  init();
})();

// ══════════════════════════════════════════
// 游戏 2: 飞翔的龙虾
// ══════════════════════════════════════════
var initFlappy;
(function() {
  var cvs = document.getElementById('flappyCvs'), ctx = cvs.getContext('2d');
  var W = 400, H = 600;
  var bird, pipes, score, best, frame, started, over, gapSize, pipeW, animId;
  best = parseInt(localStorage.getItem('bestFlappy') || '0');
  document.getElementById('flappyBest').textContent = best;

  function init() {
    if (animId) cancelAnimationFrame(animId);
    bird = { x: 80, y: H / 2, vy: 0, r: 16 };
    pipes = []; score = 0; frame = 0; started = false; over = false;
    gapSize = 160; pipeW = 50;
    document.getElementById('flappyScore').textContent = '0';
    drawStart();
  }

  function drawBg() {
    var grd = ctx.createLinearGradient(0, 0, 0, H);
    grd.addColorStop(0, '#1a3a5c'); grd.addColorStop(1, '#4a8db7');
    ctx.fillStyle = grd; ctx.fillRect(0, 0, W, H);
  }

  function drawStart() {
    drawBg();
    ctx.font = '40px serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('\\u{1F99E}', bird.x, bird.y);
    ctx.fillStyle = '#1a1a1a'; ctx.font = '18px "Noto Sans SC",sans-serif';
    ctx.fillText('点击开始', W / 2, H / 2 + 60);
    ctx.fillStyle = '#888'; ctx.font = '13px sans-serif';
    ctx.fillText('穿越锅具障碍 获得分数', W / 2, H / 2 + 90);
  }

  function jump() {
    if (over) { init(); return; }
    if (!started) { started = true; bird.vy = -7; loop(); return; }
    bird.vy = -7;
  }

  function spawnPipe() {
    var minTop = 60, maxTop = H - gapSize - 60;
    var topH = minTop + Math.random() * (maxTop - minTop);
    pipes.push({ x: W, topH: topH, scored: false });
  }

  function update() {
    frame++;
    bird.vy += 0.35; bird.y += bird.vy;
    gapSize = Math.max(100, 160 - Math.floor(score / 5) * 5);
    if (frame % 90 === 0) spawnPipe();
    for (var i = pipes.length - 1; i >= 0; i--) {
      var p = pipes[i]; p.x -= 2.5;
      if (p.x + pipeW < 0) { pipes.splice(i, 1); continue; }
      if (!p.scored && p.x + pipeW < bird.x) { p.scored = true; score++; document.getElementById('flappyScore').textContent = score; }
      if (bird.x + bird.r > p.x && bird.x - bird.r < p.x + pipeW) {
        if (bird.y - bird.r < p.topH || bird.y + bird.r > p.topH + gapSize) die();
      }
    }
    if (bird.y > H - bird.r || bird.y < bird.r) die();
  }

  function die() {
    over = true;
    if (score > best) { best = score; localStorage.setItem('bestFlappy', String(best)); document.getElementById('flappyBest').textContent = best; }
    saveScore('flappy', score);
  }

  function draw() {
    drawBg();
    for (var i = 0; i < pipes.length; i++) {
      var p = pipes[i];
      ctx.fillStyle = '#c8a882'; ctx.fillRect(p.x, 0, pipeW, p.topH);
      ctx.fillStyle = '#a07850'; ctx.fillRect(p.x - 6, p.topH - 18, pipeW + 12, 18);
      ctx.fillStyle = '#e8d5c0'; ctx.beginPath(); ctx.arc(p.x + pipeW / 2, p.topH - 18, 8, Math.PI, 0); ctx.fill();
      var botY = p.topH + gapSize;
      ctx.fillStyle = '#c8a882'; ctx.fillRect(p.x, botY, pipeW, H - botY);
      ctx.fillStyle = '#a07850'; ctx.fillRect(p.x - 6, botY, pipeW + 12, 18);
      ctx.fillStyle = '#e8d5c0'; ctx.beginPath(); ctx.arc(p.x + pipeW / 2, botY + 18, 8, 0, Math.PI); ctx.fill();
    }
    ctx.font = '30px serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.save(); ctx.translate(bird.x, bird.y);
    var angle = Math.min(bird.vy * 3, 45) * Math.PI / 180;
    ctx.rotate(angle); ctx.fillText('\\u{1F99E}', 0, 0); ctx.restore();
    ctx.fillStyle = 'rgba(255,255,255,0.9)'; ctx.font = 'bold 32px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    ctx.fillText(score, W / 2, 20);
    if (over) {
      ctx.fillStyle = 'rgba(0,0,0,0.4)'; ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = '#fff'; ctx.font = '22px "Noto Sans SC",sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('游戏结束！得分: ' + score, W / 2, H / 2 - 10);
      ctx.font = '14px sans-serif'; ctx.fillText('点击重新开始', W / 2, H / 2 + 30);
    }
  }

  function loop() {
    if (flappyStopped) return;
    if (!over) { update(); draw(); animId = requestAnimationFrame(loop); }
    else draw();
  }

  cvs.addEventListener('click', jump);
  cvs.addEventListener('touchstart', function(e) { e.preventDefault(); jump(); });
  document.addEventListener('keydown', function(e) {
    if (!document.getElementById('panel-flappy').classList.contains('active')) return;
    if (e.code === 'Space') { e.preventDefault(); jump(); }
  });

  initFlappy = init;
  init();
})();

// ══════════════════════════════════════════
// 游戏 3: 龙虾赛跑
// ══════════════════════════════════════════
(function() {
  var FINISH = 100;
  var racing = false, positions, speeds, clicks, startTime, bestCps, animId;
  bestCps = parseFloat(localStorage.getItem('bestRaceCps') || '0');
  document.getElementById('raceBestCps').textContent = bestCps.toFixed(1);
  var names = ['\\u{1F99E} 你的龙虾', '\\u{1F980} 赛跑蟹', '\\u{1F990} 飞毒虾'];
  var colors = ['var(--warm)', '#6ba3be', '#b87e5a'];

  function renderTracks() {
    var el = document.getElementById('raceTracks'); el.innerHTML = '';
    for (var i = 0; i < 3; i++) {
      var pct = Math.min(positions[i] / FINISH * 100, 100);
      var track = document.createElement('div');
      track.style.cssText = 'margin-bottom:12px;text-align:left;';
      track.innerHTML = '<div style="font-size:0.8rem;color:var(--gray-700);margin-bottom:4px;">' + names[i] + '</div>'
        + '<div style="position:relative;height:32px;background:var(--warm-bg);border-radius:16px;overflow:hidden;border:1px solid var(--gray-100);">'
        + '<div style="position:absolute;left:0;top:0;height:100%;width:' + pct + '%;background:' + colors[i] + ';border-radius:16px;transition:width 0.08s;"></div>'
        + '<div style="position:absolute;right:8px;top:50%;transform:translateY(-50%);font-size:0.75rem;color:var(--dark);">' + Math.round(pct) + '%</div>'
        + '</div>';
      el.appendChild(track);
    }
  }

  function init() {
    positions = [0, 0, 0]; speeds = [0, 0, 0]; clicks = 0; startTime = 0; racing = false;
    document.getElementById('raceCps').textContent = '0.0';
    document.getElementById('raceMsg').textContent = '';
    document.getElementById('raceBtn').textContent = '开始比赛';
    document.getElementById('raceClickZone').style.display = 'none';
    renderTracks();
  }

  function start() {
    if (racing) return;
    positions = [0, 0, 0]; clicks = 0;
    renderTracks();
    document.getElementById('raceBtn').disabled = true;
    document.getElementById('raceClickZone').style.display = 'none';
    var countdown = 3;
    document.getElementById('raceMsg').innerHTML = '<span style="font-size:2rem;color:var(--warm);">' + countdown + '</span>';
    var cdTimer = setInterval(function() {
      countdown--;
      if (countdown > 0) {
        document.getElementById('raceMsg').innerHTML = '<span style="font-size:2rem;color:var(--warm);">' + countdown + '</span>';
      } else {
        clearInterval(cdTimer);
        document.getElementById('raceMsg').innerHTML = '<span style="font-size:1.5rem;color:var(--warm);">\\u{1F680} 冲呀！</span>';
        racing = true; startTime = Date.now();
        speeds[1] = 0.3 + Math.random() * 0.4;
        speeds[2] = 0.25 + Math.random() * 0.5;
        document.getElementById('raceBtn').disabled = false;
        document.getElementById('raceBtn').textContent = '\\u{1F449} 狂点！';
        document.getElementById('raceClickZone').style.display = 'block';
        gameLoop();
      }
    }, 1000);
  }

  function clickBoost() {
    if (!racing) return;
    clicks++;
    positions[0] += 2 + Math.random() * 2;
    var elapsed = (Date.now() - startTime) / 1000;
    var cps = elapsed > 0 ? (clicks / elapsed) : 0;
    document.getElementById('raceCps').textContent = cps.toFixed(1);
  }

  function gameLoop() {
    if (!racing) return;
    for (var i = 1; i < 3; i++) { positions[i] += speeds[i] * (0.5 + Math.random() * 1.5) * 0.16; }
    renderTracks();
    var winner = -1;
    for (var i = 0; i < 3; i++) { if (positions[i] >= FINISH) { winner = i; break; } }
    if (winner >= 0) {
      racing = false;
      var elapsed = (Date.now() - startTime) / 1000;
      var cps = elapsed > 0 ? (clicks / elapsed) : 0;
      if (cps > bestCps) { bestCps = cps; localStorage.setItem('bestRaceCps', String(bestCps.toFixed(1))); document.getElementById('raceBestCps').textContent = bestCps.toFixed(1); }
      var cpsScore = Math.round(cps * 100);
      saveScore('race', cpsScore);
      if (winner === 0) {
        document.getElementById('raceMsg').innerHTML = '<span style="color:var(--warm);font-size:1.2rem;">\\u{1F3C6} 你赢了！CPS: ' + cps.toFixed(1) + '</span>';
      } else {
        document.getElementById('raceMsg').innerHTML = '<span style="color:var(--gray-500);">' + names[winner] + ' 赢了... 你的 CPS: ' + cps.toFixed(1) + '</span>';
      }
      document.getElementById('raceBtn').textContent = '再来一局';
      document.getElementById('raceClickZone').style.display = 'none';
      return;
    }
    animId = requestAnimationFrame(gameLoop);
  }

  document.getElementById('raceBtn').addEventListener('click', function() { if (!racing) start(); else clickBoost(); });
  document.getElementById('raceClickZone').addEventListener('click', function() { clickBoost(); });
  document.getElementById('raceClickZone').addEventListener('touchstart', function(e) { e.preventDefault(); clickBoost(); });
  document.addEventListener('keydown', function(e) {
    if (!document.getElementById('panel-race').classList.contains('active')) return;
    if (e.code === 'Space') { e.preventDefault(); if (!racing) start(); else clickBoost(); }
  });

  init();
})();

// 初始加载排行榜
loadLeaderboard();
</script>
</body>
</html>`;
}
