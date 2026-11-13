/**
 * 정렬·넘침 검사. node todo/tests/geometry.mjs
 */
import puppeteer from '/tmp/todo-harness/node_modules/puppeteer-core/lib/esm/puppeteer/puppeteer-core.js';

const NOW = '2026-11-13T06:30:00.000Z';
const TOKEN = 'github_pat_geom';
const BASE = 'http://127.0.0.1:4173/todo/?e2e=1';
const ART = '/opt/cursor/artifacts';
const cors = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': 'authorization, content-type, accept, x-github-api-version',
  'access-control-allow-methods': 'GET, PUT, OPTIONS',
  'content-type': 'application/json; charset=utf-8',
};
const doc = {
  version: 2,
  updatedAt: '2026-11-13T00:00:00.000Z',
  rolloverDate: '2026-11-13',
  categories: [{ id: 'cat-meet', name: '회의', color: 'plum' }],
  tasks: [
    { id: 'a', title: '아주 긴 제목이 한 줄에서 말줄임되어야 하는 제안서 초안 검토', memo: '메모', priority: 'high', due: '2026-11-13', dueTime: '15:00', tags: ['제안'], list: 'today', status: 'open', order: 0, createdAt: '2026-11-01T00:00:00.000Z', updatedAt: '2026-11-12T00:00:00.000Z', completedAt: null, carriedDays: 0, repeat: null, seriesId: null, occurrenceDate: null, reminder: null, categoryId: 'cat-meet' },
    { id: 'b', title: '짧은 일', memo: '', priority: 'low', due: null, dueTime: null, tags: [], list: 'today', status: 'done', order: 1, createdAt: '2026-11-01T00:00:00.000Z', updatedAt: '2026-11-13T04:15:00.000Z', completedAt: '2026-11-13T04:15:00.000Z', carriedDays: 0, repeat: null, seriesId: null, occurrenceDate: null, reminder: null, categoryId: null },
    { id: 'c', title: '메모 있는 완료', memo: '있음', priority: 'medium', due: '2026-11-13', dueTime: '10:00', tags: [], list: 'today', status: 'done', order: 2, createdAt: '2026-11-01T00:00:00.000Z', updatedAt: '2026-11-13T05:20:00.000Z', completedAt: '2026-11-13T05:20:00.000Z', carriedDays: 0, repeat: null, seriesId: null, occurrenceDate: null, reminder: null, categoryId: null },
  ],
};
const fails = [];
function check(name, ok, detail = '') { if (!ok) fails.push(`${name} ${detail}`); console.log(ok ? 'OK' : 'BAD', name, detail); }

const browser = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', headless: true, args: ['--no-sandbox'] });
const page = await browser.newPage();
await page.setViewport({ width: 1440, height: 900 });
await page.evaluateOnNewDocument((now) => { window.__TODO_NOW = now; }, NOW);
await page.setRequestInterception(true);
page.on('request', async (req) => {
  const url = req.url();
  if (!url.startsWith('https://api.github.com/')) { await req.continue(); return; }
  const send = (status, data) => req.respond({ status, headers: cors, body: data == null ? '' : JSON.stringify(data) });
  if (req.method() === 'OPTIONS') return send(204, null);
  if (new URL(url).pathname === '/user') return send(200, { login: 'soondooop', name: '순두부', avatar_url: '' });
  if (req.method() === 'GET') return send(200, { sha: 's', encoding: 'base64', content: Buffer.from(JSON.stringify(doc)).toString('base64') });
  return send(200, { content: { sha: 's2' } });
});
await page.goto('http://127.0.0.1:4173/todo/');
await page.evaluate(() => localStorage.clear());
await page.goto(BASE, { waitUntil: 'networkidle0' });
await page.type('#token', TOKEN);
await page.click('#loginBtn');
await page.waitForSelector('#list .task');

function mid(r) { return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; }

async function measure(width) {
  await page.setViewport({ width, height: 900 });
  await page.evaluate(() => document.getElementById('categoryDialog')?.close());
  await new Promise((r) => setTimeout(r, 80));
  return page.evaluate((viewport) => {
    const box = (el) => el.getBoundingClientRect();
    const center = (el) => { const r = box(el); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; };
    const out = { viewport, issues: [] };
    const icons = [...document.querySelectorAll('.side-quick .nav-ico, .views .nav-ico, .side-cat .nav-ico, .side-cat .pie')];
    if (icons.length > 1 && getComputedStyle(document.querySelector('.sidebar')).display !== 'none') {
      const xs = icons.map((el) => Math.round(box(el).left * 2) / 2);
      const spread = Math.max(...xs) - Math.min(...xs);
      if (spread > 0.5) out.issues.push(`nav icon x spread ${spread}`);
      const labels = [...document.querySelectorAll('.side-quick span, .views button span:not(.count), .side-cat span')].filter((el) => el.textContent.trim());
      const lxs = labels.map((el) => box(el).left);
      if (Math.max(...lxs) - Math.min(...lxs) > 1) out.issues.push(`nav label x spread ${(Math.max(...lxs) - Math.min(...lxs)).toFixed(1)}`);
    }
    for (const task of document.querySelectorAll('#list .task')) {
      const check = task.querySelector('.check');
      const title = task.querySelector('.title');
      const rail = task.querySelector('.meta-rail');
      if (!check || !title || !rail) continue;
      const cy = center(check).y;
      if (Math.abs(center(title).y - cy) > 1) out.issues.push(`title vs check y ${title.textContent}`);
      if (Math.abs(center(rail).y - cy) > 1) out.issues.push(`rail vs check y ${title.textContent}`);
    }
    const times = [...document.querySelectorAll('#list .meta-time')].map((el) => box(el).left);
    const flags = [...document.querySelectorAll('#list .flag')].map((el) => box(el).left);
    const memos = [...document.querySelectorAll('#list .memo-slot')].map((el) => box(el).left);
    const mores = [...document.querySelectorAll('#list [aria-label="더보기"]')].map((el) => box(el).left);
    for (const [name, xs] of [['time', times], ['flag', flags], ['memo', memos], ['more', mores]]) {
      if (xs.length > 1 && Math.max(...xs) - Math.min(...xs) > 0.5) out.issues.push(`${name} column spread ${(Math.max(...xs) - Math.min(...xs)).toFixed(2)}`);
    }
    const bars = document.querySelector('.bars');
    const chart = document.getElementById('weekChart');
    if (bars && chart && getComputedStyle(chart).display !== 'none') {
      const br = box(bars);
      const cr = box(chart);
      if (br.width < cr.width - 40) out.issues.push(`chart bars width ${br.width.toFixed(0)} vs card ${cr.width.toFixed(0)}`);
      const cols = [...bars.children];
      if (cols.length === 7) {
        const gap = cols[1] ? box(cols[1]).left - box(cols[0]).right : 0;
        const widths = cols.map((el) => box(el).width);
        if (Math.max(...widths) - Math.min(...widths) > 1) out.issues.push('chart columns uneven');
      }
    }
    for (const sel of ['.sidebar', '.rail', '.column', '.shell', '.widgets', '.composer']) {
      const el = document.querySelector(sel);
      if (!el || getComputedStyle(el).display === 'none') continue;
      const r = box(el);
      if (r.left < -1 || r.right > viewport + 1) out.issues.push(`${sel} viewport overflow L${r.left.toFixed(1)} R${r.right.toFixed(1)}`);
      if (el.scrollWidth > el.clientWidth + 2) out.issues.push(`${sel} scrollWidth ${el.scrollWidth} > ${el.clientWidth}`);
    }
    const side = document.querySelector('.sidebar');
    if (side && getComputedStyle(side).display !== 'none') {
      for (const el of side.querySelectorAll('.nav-ico, .avatar-slot, .sync-line, .side-actions')) {
        const r = box(el);
        const host = box(side);
        if (r.left < host.left + 8) out.issues.push(`sidebar child clipped ${el.className} dx ${(r.left - host.left).toFixed(1)}`);
      }
    }
    const actions = document.querySelector('.side-actions');
    if (actions && getComputedStyle(actions).display !== 'none') {
      const tops = [...actions.children].map((el) => box(el).top);
      if (Math.max(...tops) - Math.min(...tops) > 1) out.issues.push('side actions wrap');
    }
    return out;
  }, width);
}

for (const width of [390, 768, 1024, 1100, 1280, 1440]) {
  const result = await measure(width);
  check(`width ${width}`, result.issues.length === 0, result.issues.join('; '));
  if (width === 1050 || width === 1024 || width === 1440 || width === 1100) {
    await page.screenshot({ path: `${ART}/layout-${width}.png` });
  }
}

await page.setViewport({ width: 1050, height: 900 });
await page.screenshot({ path: `${ART}/layout-sidebar-1050.png`, clip: { x: 0, y: 0, width: 280, height: 900 } });
await page.evaluate(() => document.querySelector('[aria-label="카테고리 관리"]').click());
await page.waitForSelector('#categoryDialog[open] .swatch input');
const swatch = await page.evaluate(() => {
  const issues = [];
  for (const sw of document.querySelectorAll('#categoryDialog label.swatch')) {
    const input = sw.querySelector('input');
    if (!input) continue;
    const a = sw.getBoundingClientRect();
    const b = input.getBoundingClientRect();
    const dx = (b.left + b.width / 2) - (a.left + a.width / 2);
    const dy = (b.top + b.height / 2) - (a.top + a.height / 2);
    if (Math.abs(dx) > 0.5 || Math.abs(dy) > 0.5) issues.push(`${sw.className} dx ${dx.toFixed(2)} dy ${dy.toFixed(2)}`);
  }
  return issues;
});
check('swatch centers', swatch.length === 0, swatch.join('; '));
await page.screenshot({ path: `${ART}/layout-category.png` });
const swatchClip = await page.evaluate(() => {
  const row = document.querySelector('#categoryDialog .swatches').getBoundingClientRect();
  return { x: row.x - 8, y: row.y - 8, width: row.width + 16, height: row.height + 16 };
});
await page.screenshot({ path: `${ART}/layout-swatches.png`, clip: swatchClip });
await page.screenshot({ path: `${ART}/layout-1050.png` });
await page.setViewport({ width: 1440, height: 900 });
await page.evaluate(() => document.getElementById('categoryDialog').close());
await page.screenshot({ path: `${ART}/layout-1440.png` });

console.log(fails.length ? `FAILED ${fails.length}` : 'GEOMETRY OK');
if (fails.length) console.log(fails.join('\n'));
await browser.close();
process.exit(fails.length ? 1 : 0);
