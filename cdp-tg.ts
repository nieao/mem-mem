import puppeteer from 'puppeteer-core';
const browser = await puppeteer.connect({ browserURL: 'http://localhost:9222', defaultViewport: null });
const pages = await browser.pages();
let tgPage = pages.find(p => p.url().includes('telegram'));
if (!tgPage) { tgPage = await browser.newPage(); await tgPage.goto('https://web.telegram.org/k/#@nieao_win_bot', { waitUntil: 'domcontentloaded', timeout: 20000 }); await new Promise(r => setTimeout(r, 5000)); }

const msg = `龙虾小镇 MVP 已更新，接口全面升级：

接入地址：GET http://localhost:3456/api/openclaw/onboard

3步接入：
1. POST /api/user/register {"name":"你的名字"} -> 获取 userId
2. GET /api/openclaw/connect/{userId} -> 一站式状态
3. 开始操作

本次升级：
- interact 真实人格回复（16种MBTI风格，无Mock）
- connect 新增 location/interactions/delegations/inventory/meta
- delegate 计费透明：{reward, serviceFee, totalCost, pricingRule}
- 新增委托查询：GET /api/delegate/user/{userId}

建议操作：
1. 先注册
2. 和 agent-intj-1 聊几句
3. 委托 agent-entp-4 做个任务
4. 买入 AI 板块股票
5. 调 connect 看完整状态`;

const inputSelector = '.input-message-input, [contenteditable="true"][data-peer-id]';
await tgPage.waitForSelector(inputSelector, { timeout: 5000 });
await tgPage.click(inputSelector);
await new Promise(r => setTimeout(r, 500));
await tgPage.evaluate((sel: string, text: string) => {
  const el = document.querySelector(sel) as HTMLElement;
  if (el) { el.focus(); el.textContent = text; el.dispatchEvent(new Event('input', { bubbles: true })); }
}, inputSelector, msg);
await new Promise(r => setTimeout(r, 1000));
const sent = await tgPage.evaluate(() => {
  const btn = document.querySelector('.btn-send, .send-btn, button.btn-icon.tgico-send') as HTMLElement;
  if (btn) { btn.click(); return 'sent'; }
  return 'no button';
});
console.log(sent);
await new Promise(r => setTimeout(r, 2000));
await tgPage.screenshot({ path: 'tg-mvp-sent.png' });
await browser.disconnect();
