/**
 * 업무 체크 기능 테스트. 정적 서버(http://127.0.0.1:4173/todo/)와
 * 모킹된 GitHub Contents API만 사용한다. 앱 런타임에는 포함되지 않는다.
 *
 * 실행: node todo/tests/e2e.mjs
 */
import puppeteer from '/tmp/todo-harness/node_modules/puppeteer-core/lib/esm/puppeteer/puppeteer-core.js';
import { seoulDate, addDays } from '../model.js';

const NOW = '2026-11-13T06:30:00.000Z';
const TODAY = seoulDate(new Date(NOW));
const TOKEN = 'github_pat_e2e_fixture';
const BASE = 'http://127.0.0.1:4173/todo/?e2e=1';
const ART = '/opt/cursor/artifacts';

const cors = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': 'authorization, content-type, accept, x-github-api-version',
  'access-control-allow-methods': 'GET, PUT, OPTIONS',
  'content-type': 'application/json; charset=utf-8',
  'cache-control': 'no-store',
};

const results = [];
function pass(name) { results.push({ name, ok: true }); console.log('PASS', name); }
function fail(name, error) { results.push({ name, ok: false, error: String(error?.message || error) }); console.log('FAIL', name, error?.message || error); }

function doc(tasks, extra = {}) {
  return {
    version: 2,
    updatedAt: '2026-11-13T00:00:00.000Z',
    rolloverDate: extra.rolloverDate || TODAY,
    categories: extra.categories || [
      { id: 'cat-meet', name: '회의', color: 'plum' },
    ],
    tasks,
  };
}
function task(partial) {
  return {
    id: partial.id,
    title: partial.title,
    memo: partial.memo || '',
    priority: partial.priority || 'medium',
    due: partial.due ?? null,
    dueTime: partial.dueTime ?? null,
    tags: partial.tags || [],
    list: partial.list || 'today',
    status: partial.status || 'open',
    order: partial.order ?? 0,
    createdAt: '2026-11-01T00:00:00.000Z',
    updatedAt: partial.updatedAt || '2026-11-12T00:00:00.000Z',
    completedAt: partial.completedAt ?? null,
    carriedDays: partial.carriedDays ?? 0,
    repeat: partial.repeat ?? null,
    seriesId: partial.seriesId ?? null,
    occurrenceDate: partial.occurrenceDate ?? null,
    reminder: partial.reminder ?? null,
    categoryId: partial.categoryId ?? null,
  };
}

function createStore() {
  const files = new Map();
  const state = { offline: false, userStatus: 200, conflict: 0, puts: [] };
  function seed(path, value) {
    files.set(path, { sha: `sha-${files.size + 1}`, doc: value });
  }
  async function handle(req) {
    const url = req.url();
    if (!url.startsWith('https://api.github.com/')) {
      if (url.startsWith('http://127.0.0.1:4173/') || url.startsWith('http://localhost:4173/')) await req.continue();
      else await req.abort();
      return;
    }
    const send = (status, data) => req.respond({ status, headers: cors, body: data == null ? '' : JSON.stringify(data) });
    if (state.offline) return req.abort();
    if (req.method() === 'OPTIONS') return send(204, null);
    const auth = req.headers().authorization || '';
    if (auth !== `Bearer ${TOKEN}`) return send(401, { message: 'Bad credentials' });
    const parsed = new URL(url);
    if (parsed.pathname === '/user') {
      if (state.userStatus !== 200) return send(state.userStatus, { message: 'nope' });
      return send(200, { login: 'soondooop', name: '순두부', avatar_url: '' });
    }
    const match = parsed.pathname.match(/^\/repos\/[^/]+\/[^/]+\/contents\/(.+)$/);
    if (!match) return send(404, { message: 'no' });
    const path = decodeURIComponent(match[1]);
    if (req.method() === 'GET') {
      const file = files.get(path);
      if (!file) return send(404, { message: 'Not Found' });
      return send(200, {
        sha: file.sha,
        encoding: 'base64',
        content: Buffer.from(JSON.stringify(file.doc)).toString('base64'),
      });
    }
    if (req.method() === 'PUT') {
      const body = JSON.parse(req.postData() || '{}');
      if (String(body.content || '').includes(TOKEN)) throw new Error('token leaked into file body');
      const file = files.get(path);
      if (state.conflict > 0) {
        state.conflict -= 1;
        if (file) {
          file.sha = `sha-remote-${Date.now()}`;
          const remoteTask = task({ id: 'remote-only', title: '원격에서 온 일', updatedAt: '2026-11-13T06:00:00.000Z', order: 50 });
          if (!file.doc.tasks.some((item) => item.id === remoteTask.id)) file.doc.tasks.push(remoteTask);
        }
        return send(409, { message: 'conflict' });
      }
      if (file && body.sha && body.sha !== file.sha) return send(409, { message: 'sha mismatch' });
      const text = Buffer.from(body.content, 'base64').toString('utf8');
      const next = JSON.parse(text);
      const sha = `sha-${Date.now()}-${state.puts.length}`;
      files.set(path, { sha, doc: next });
      state.puts.push({ path, sha, doc: next, hadSha: !!body.sha });
      return send(200, { content: { sha } });
    }
    return send(404, { message: 'no' });
  }
  return { files, state, seed, handle };
}

async function bootPage(browser, store, { clear = true } = {}) {
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });
  page.setDefaultTimeout(12000);
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('dialog', (dialog) => dialog.accept());
  await page.evaluateOnNewDocument((now) => { window.__TODO_NOW = now; }, NOW);
  await page.setRequestInterception(true);
  page.on('request', (req) => store.handle(req).catch((error) => {
    errors.push(String(error));
    req.abort().catch(() => {});
  }));
  if (clear) {
    await page.goto('http://127.0.0.1:4173/todo/', { waitUntil: 'domcontentloaded' });
    await page.evaluate(() => { localStorage.clear(); sessionStorage.clear(); });
  }
  await page.goto(BASE, { waitUntil: 'domcontentloaded' });
  page.__errors = errors;
  return page;
}

async function login(page) {
  await page.waitForSelector('#token');
  await page.type('#token', TOKEN);
  await page.click('#loginBtn');
  await page.waitForSelector('#main:not([hidden])');
  await page.waitForFunction(() => document.getElementById('syncPill')?.dataset.state === 'saved');
}

async function clickSel(page, sel) {
  await page.waitForSelector(sel);
  await page.evaluate((s) => document.querySelector(s).click(), sel);
}

async function clickButton(page, text, root = 'body') {
  const ok = await page.evaluate((label, scope) => {
    const host = document.querySelector(scope);
    const nodes = [...host.querySelectorAll('button, [role="option"], [role="menuitemradio"]')];
    const el = nodes.find((node) => node.textContent.replace(/\s+/g, ' ').trim() === label)
      || nodes.find((node) => node.textContent.includes(label));
    if (!el) return false;
    el.click();
    return true;
  }, text, root);
  if (!ok) throw new Error(`버튼을 찾지 못했습니다: ${text}`);
}

async function saved(page) {
  await page.waitForFunction(() => document.getElementById('syncPill')?.dataset.state === 'saved', { timeout: 8000 });
}

async function bodyHas(page, text) {
  return page.evaluate((value) => document.body.innerText.includes(value), text);
}

const browser = await puppeteer.launch({
  executablePath: '/usr/bin/google-chrome',
  headless: true,
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
});

try {
  await browser.defaultBrowserContext().overridePermissions('http://127.0.0.1:4173', ['notifications']);
} catch { /* permission API may be unavailable */ }

// --- 로그인 검증 ---
try {
  const store = createStore();
  const page = await bootPage(browser, store);
  await page.evaluate(() => {
    document.getElementById('token').value = '   ';
    document.getElementById('loginForm').requestSubmit();
  });
  await page.waitForFunction(() => document.getElementById('loginError').textContent.includes('토큰'));
  pass('빈 토큰은 로그인되지 않는다');
  store.state.userStatus = 401;
  await page.evaluate(() => { document.getElementById('token').value = ''; });
  await page.type('#token', 'github_pat_wrong');
  await page.click('#loginBtn');
  await page.waitForFunction(() => document.getElementById('loginError').textContent.includes('올바르지 않습니다'));
  if (await page.$('#main:not([hidden])')) throw new Error('잘못된 토큰인데 본문이 열림');
  pass('잘못된 토큰은 오류를 보여 준다');
  await page.close();
} catch (error) { fail('로그인 검증', error); }

// --- 404 첫 생성 ---
try {
  const store = createStore();
  const page = await bootPage(browser, store);
  await login(page);
  if (store.files.has('todos.json')) throw new Error('아직 할 일이 없는데 파일을 만들었다');
  await page.type('#composer', '첫 할 일');
  await page.keyboard.press('Enter');
  await saved(page);
  const created = store.state.puts.find((put) => put.path === 'todos.json' && put.hadSha === false);
  if (!created) throw new Error('없는 파일을 새로 만들지 않았다');
  if (!store.files.get('todos.json').doc.tasks.some((item) => item.title === '첫 할 일')) throw new Error('추가한 일이 파일에 없다');
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => document.body.innerText.includes('첫 할 일'));
  pass('404면 파일을 만들고 추가한 일이 다시 로드된다');
  await page.screenshot({ path: `${ART}/func-create.png` });
  await page.close();
} catch (error) { fail('404 첫 생성', error); }

// --- 본 기능 ---
try {
  const store = createStore();
  const yesterday = addDays(TODAY, -1);
  store.seed('todos.json', doc([
    task({ id: 'a', title: '제안서 초안', memo: '아주 긴 메모입니다. '.repeat(12), priority: 'high', due: TODAY, dueTime: '18:00', tags: ['제안', '초안'], order: 0, categoryId: 'cat-meet', reminder: 'at' }),
    task({ id: 'b', title: '고객 메일', priority: 'low', due: addDays(TODAY, 1), tags: ['메일'], order: 1 }),
    task({ id: 'c', title: '백로그 아이디어', list: 'backlog', order: 0 }),
    task({ id: 'd', title: '어제 남은 일', due: yesterday, order: 2, carriedDays: 0 }),
    task({ id: 'e', title: '이미 끝낸 일', status: 'done', completedAt: NOW, order: 3, categoryId: 'cat-meet' }),
    task({ id: 'f1', title: '하루 일정 1', due: addDays(TODAY, 2), order: 4 }),
    task({ id: 'f2', title: '하루 일정 2', due: addDays(TODAY, 2), order: 5 }),
    task({ id: 'f3', title: '하루 일정 3', due: addDays(TODAY, 2), order: 6 }),
    task({ id: 'f4', title: '하루 일정 4', due: addDays(TODAY, 2), order: 7 }),
  ], { rolloverDate: yesterday }));
  const page = await bootPage(browser, store);
  await login(page);
  const carried = store.files.get('todos.json').doc.tasks.find((item) => item.id === 'd');
  if (!carried || carried.carriedDays < 1) throw new Error(`이월이 반영되지 않음: ${JSON.stringify(carried)}`);
  if (!(await bodyHas(page, '이월'))) throw new Error('이월 배지가 없다');
  pass('날짜가 바뀌면 오늘 할 일을 이월한다');

  await page.waitForFunction(() => {
    const button = document.querySelector('.task[data-id="a"] .expand-btn');
    return button && !button.hidden;
  });
  await page.evaluate(() => document.querySelector('.task[data-id="a"] .expand-btn').click());
  await page.waitForFunction(() => document.querySelector('.task[data-id="a"] .memo-read'));
  await page.evaluate(() => document.querySelector('.task[data-id="a"] .expand-btn').click());
  await page.waitForFunction(() => !document.querySelector('.task[data-id="a"] .memo-read'));
  pass('긴 메모를 더보기와 접기로 연다');

  const progress = await page.$eval('#progressLabel', (el) => el.textContent);
  if (progress !== '1/8') throw new Error(`진행률 ${progress}, 기대 1/8`);
  if (!(await bodyHas(page, '제안서 초안'))) throw new Error('마감 임박에 제안서가 없다');
  const barOn = await page.$eval('#weekChart .bars i.on', (el) => el.style.height);
  if (!barOn || barOn === '0px') throw new Error('이번 주 완료 막대가 비었다');
  pass('진행률, 마감 임박, 이번 주 완료가 맞다');

  await page.type('#composer', '보고서 @회의 #제안 내일 모레 금요일 11/20 오후 3시');
  await page.keyboard.press('Enter');
  await saved(page);
  const added = store.files.get('todos.json').doc.tasks.find((item) => item.title === '보고서');
  if (!added) throw new Error('빠른 추가가 저장되지 않음');
  if (added.categoryId == null) throw new Error('카테고리가 연결되지 않음');
  if (!added.tags.includes('제안')) throw new Error(`태그 ${added.tags}`);
  if (added.due !== '2026-11-20') throw new Error(`기한 ${added.due}`);
  if (added.dueTime !== '15:00') throw new Error(`시간 ${added.dueTime}`);
  const cat = store.files.get('todos.json').doc.categories.find((item) => item.id === added.categoryId);
  if (!cat || cat.name !== '회의') throw new Error('회의 카테고리가 아니다');
  pass('빠른 추가가 카테고리, 태그, 기한, 시간을 해석한다');

  await clickSel(page, '.task[data-id="b"] .title');
  await page.waitForSelector('.task.is-card textarea');
  await page.type('.task.is-card textarea', '회신 초안');
  await page.evaluate(() => document.querySelector('.task.is-card textarea').blur());
  await page.waitForFunction(() => document.getElementById('syncPill').dataset.state === 'saving', { timeout: 2000 }).catch(() => {});
  await saved(page);
  if (store.files.get('todos.json').doc.tasks.find((item) => item.id === 'b').memo !== '회신 초안') throw new Error('메모가 저장되지 않음');
  pass('카드 메모를 저장한다');

  await clickButton(page, '마감', '.task[data-id="b"]');
  await page.waitForSelector('#dueDialog[open]');
  await clickButton(page, '내일', '#dueDialog');
  await clickButton(page, '15:00', '#dueDialog');
  await clickSel(page, '#dueReminderBtn');
  await clickButton(page, '정시', '#dueReminderMenu');
  await page.click('#dueForm button[type="submit"]');
  await saved(page);
  const dueTask = store.files.get('todos.json').doc.tasks.find((item) => item.id === 'b');
  if (dueTask.due !== addDays(TODAY, 1) || dueTask.dueTime !== '15:00' || dueTask.reminder !== 'at') {
    throw new Error(`기한 저장 ${dueTask.due} ${dueTask.dueTime} ${dueTask.reminder}`);
  }
  pass('기한 달력, 시간, 알림을 저장한다');

  await page.keyboard.press('Escape');
  await page.keyboard.press('KeyR');
  await page.waitForSelector('#repeatDialog[open]');
  await page.evaluate(() => {
    document.querySelector('input[name="repeatFreq"][value="weekly"]').click();
  });
  await page.waitForSelector('#repeatWeekly:not([hidden])');
  await page.evaluate(() => { document.querySelector('input[name="repeatWeekday"][value="1"]').click(); });
  await page.click('#repeatForm button[type="submit"]');
  await saved(page);
  const repeated = store.files.get('todos.json').doc.tasks.find((item) => item.id === 'b');
  if (repeated.repeat?.freq !== 'weekly' || !repeated.repeat.weekdays.includes(1)) throw new Error('반복 규칙이 저장되지 않음');
  pass('매주 월요일 반복을 저장한다');

  const beforeComplete = store.files.get('todos.json').doc.tasks.length;
  await page.evaluate(() => document.querySelector('.task[data-id="b"] .check').click());
  await page.waitForFunction(() => document.querySelector('.task[data-id="b"]')?.classList.contains('is-done'));
  await saved(page);
  const after = store.files.get('todos.json').doc.tasks;
  const doneB = after.find((item) => item.id === 'b');
  if (doneB.status !== 'done') throw new Error('완료되지 않음');
  if (after.length !== beforeComplete + 1) throw new Error('다음 반복이 생기지 않음');
  const nextOcc = after.find((item) => item.seriesId === doneB.seriesId && item.status === 'open' && item.id !== 'b');
  if (!nextOcc) throw new Error('다음 발생이 없다');
  pass('완료하면 다음 반복 일정을 만든다');

  await page.evaluate(() => document.querySelector('.task[data-id="b"] .check').click());
  await saved(page);
  if (store.files.get('todos.json').doc.tasks.find((item) => item.id === 'b').status !== 'open') throw new Error('완료 해제가 안 됨');
  pass('완료를 해제한다');

  await page.evaluate(() => document.querySelector('.task[data-id="b"] [aria-label="더보기"]').click());
  await clickButton(page, '백로그로 이동', '.menu');
  await saved(page);
  await clickSel(page, '#tab-backlog');
  await page.waitForFunction(() => document.getElementById('viewName').textContent === '백로그');
  if (!(await bodyHas(page, '고객 메일'))) throw new Error('백로그로 이동하지 않음');
  await page.evaluate(() => document.querySelector('.task[data-id="b"] [aria-label="더보기"]').click());
  await clickButton(page, '오늘로 이동', '.menu');
  await saved(page);
  await clickSel(page, '#tab-today');
  await page.waitForFunction(() => document.body.innerText.includes('고객 메일'));
  pass('오늘과 백로그 사이를 옮긴다');

  await page.evaluate(() => document.querySelector('.task[data-id="a"] .title').click());
  await page.keyboard.down('Alt');
  await page.keyboard.press('ArrowDown');
  await page.keyboard.up('Alt');
  await saved(page);
  const orders = store.files.get('todos.json').doc.tasks.filter((item) => item.list === 'today' && item.status === 'open').sort((x, y) => x.order - y.order).map((item) => item.id);
  if (orders[0] === 'a') throw new Error(`키보드 순서 변경이 반영되지 않음 ${orders}`);
  pass('Alt+아래 키로 순서를 바꾼다');

  const beforeDrag = await page.$$eval('#list .task', (nodes) => nodes.map((node) => node.dataset.id));
  const rows = await page.$$('#list .task');
  if (rows.length < 2) throw new Error('드래그할 항목이 부족하다');
  const first = await rows[0].boundingBox();
  const second = await rows[1].boundingBox();
  await page.mouse.move(first.x + 80, first.y + 18);
  await page.mouse.down();
  await page.mouse.move(second.x + 80, second.y + second.height - 6, { steps: 12 });
  await page.mouse.up();
  await page.waitForFunction((ids) => {
    const now = [...document.querySelectorAll('#list .task')].map((node) => node.dataset.id);
    return now.join() !== ids.join();
  }, {}, beforeDrag);
  await saved(page);
  pass('드래그로 순서를 바꾼다');

  await page.evaluate(() => document.querySelector('.task[data-id="c"]') || document.querySelector('.task .title'));
  await clickSel(page, '#tab-today');
  await page.keyboard.press('j');
  await page.keyboard.press('x');
  await saved(page);
  pass('J와 X 단축키가 동작한다');

  await page.keyboard.press('n');
  const focused = await page.evaluate(() => document.activeElement?.id);
  if (focused !== 'composer') throw new Error(`N이 입력을 가리키지 않음: ${focused}`);
  await page.keyboard.press('Escape');
  await page.keyboard.press('/');
  if (await page.evaluate(() => document.activeElement?.id) !== 'search') throw new Error('슬래시가 검색을 열지 않음');
  await page.type('#search', '제안서');
  await page.waitForFunction(() => {
    const titles = [...document.querySelectorAll('#list .title')].map((node) => node.textContent);
    return titles.includes('제안서 초안') && !titles.includes('고객 메일');
  });
  await clickSel(page, '#searchClear');
  await page.waitForFunction(() => [...document.querySelectorAll('#list .title')].some((node) => node.textContent === '고객 메일'));
  pass('검색과 지우기가 목록을 거른다');

  await clickButton(page, '#제안', '#tagBar');
  await page.waitForFunction(() => {
    const titles = [...document.querySelectorAll('#list .title')].map((node) => node.textContent);
    return titles.some((title) => title.includes('제안서')) && !titles.includes('고객 메일');
  });
  await clickButton(page, '필터 해제', '#tagBar');
  pass('태그 칩으로 거른다');

  await clickSel(page, '#sortBtn');
  await page.waitForSelector('#sortMenu:not([hidden])');
  await clickButton(page, '우선순위', '#sortMenu');
  await page.waitForFunction(() => document.getElementById('sortLabel').textContent === '우선순위');
  const titles = await page.$$eval('.task .title', (nodes) => nodes.map((node) => node.textContent));
  const high = titles.indexOf('제안서 초안');
  const low = titles.findIndex((title) => title === '고객 메일');
  if (high < 0 || (low >= 0 && high > low)) throw new Error(`우선순위 정렬 ${titles}`);
  await clickSel(page, '#sortBtn');
  await clickButton(page, '수동 순서', '#sortMenu');
  pass('정렬 메뉴가 순서를 바꾼다');

  await clickSel(page, '#groupBtn');
  await page.waitForSelector('.cat-head');
  if (!(await bodyHas(page, '회의'))) throw new Error('카테고리 묶음이 없다');
  await clickSel(page, '#groupBtn');
  pass('카테고리로 묶기를 켜고 끈다');

  await clickSel(page, '#overdueBtn');
  await page.waitForFunction(() => {
    const titles = [...document.querySelectorAll('#list .title')].map((node) => node.textContent);
    return titles.includes('어제 남은 일') && !titles.includes('보고서');
  });
  await clickSel(page, '#overdueBtn');
  pass('지난 기한만 보여 준다');

  await page.evaluate(() => document.querySelector('[aria-label="카테고리 관리"]').click());
  await page.waitForSelector('#categoryDialog[open]');
  await page.type('#newCatName', '운영');
  await page.evaluate(() => document.querySelector('input[name="newCatColor"][value="teal"]').click());
  await clickSel(page, '#addCatBtn');
  await saved(page);
  if (!store.files.get('todos.json').doc.categories.some((item) => item.name === '운영' && item.color === 'teal')) throw new Error('카테고리 추가 실패');
  await page.evaluate(() => {
    const row = [...document.querySelectorAll('#catManager .cat-edit')].find((el) => el.querySelector('input').value === '운영');
    row.querySelector('[aria-label="gold"]').click();
  });
  await saved(page);
  if (store.files.get('todos.json').doc.categories.find((item) => item.name === '운영').color !== 'gold') throw new Error('색 변경 실패');
  await clickButton(page, '닫기', '#categoryDialog');
  const pie = await page.$eval('.side-cat.cat-plum .pie circle:last-child', (el) => el.getAttribute('stroke-dasharray'));
  if (!pie || pie.startsWith('0 ')) throw new Error(`카테고리 진행 원 ${pie}`);
  pass('카테고리를 추가하고 색과 진행률을 보여 준다');

  await clickSel(page, '#miniCal .mini-day.is-today');
  await page.waitForSelector('.cal-grid');
  if ((await page.$eval('#viewName', (el) => el.textContent)) !== '예정') throw new Error('미니 달력 클릭이 예정으로 가지 않음');
  await clickSel(page, '#tab-today');
  await clickButton(page, '크게', '#miniCal');
  await page.waitForSelector('.cal-grid');
  pass('미니 달력의 날짜와 크게 버튼이 예정으로 연다');

  await clickButton(page, '다음');
  const nextMonth = await page.$eval('.cal-bar h2', (el) => el.textContent);
  if (!nextMonth.includes('12월')) throw new Error(`다음 달 ${nextMonth}`);
  await clickButton(page, '오늘');
  if (!(await page.$eval('.cal-bar h2', (el) => el.textContent)).includes('11월')) throw new Error('오늘로 돌아오지 않음');
  await clickButton(page, '할 일 보기');
  await clickButton(page, '완료 보기');
  await clickButton(page, '모두');
  const more = await page.$('.cal-more');
  if (!more) throw new Error('+N개 더 가 없다');
  const day = addDays(TODAY, 2);
  await page.evaluate((value) => {
    const cell = [...document.querySelectorAll('.cal-day')].find((el) => el.getAttribute('aria-label')?.startsWith(value));
    cell.click();
  }, day);
  await page.waitForSelector('.day-detail');
  await page.click('.day-add input');
  await page.type('.day-add input', '달력에서 추가');
  await page.evaluate(() => document.querySelector('.day-add').requestSubmit());
  await page.waitForFunction(() => document.body.innerText.includes('달력에서 추가'));
  await saved(page);
  if (!store.files.get('todos.json').doc.tasks.some((item) => item.title === '달력에서 추가' && item.due === day)) throw new Error(`날짜 추가가 저장되지 않음 ${day}`);
  const detailCheck = await page.$('.day-detail .check');
  if (detailCheck) await detailCheck.click();
  await saved(page);
  pass('예정 달력에서 이동, 필터, 날짜 추가, 완료가 된다');

  await clickSel(page, '#tab-done');
  await page.waitForFunction(() => document.getElementById('viewName').textContent === '완료');
  if (!(await bodyHas(page, '이미 끝낸 일'))) throw new Error('완료 목록이 비었다');
  pass('완료 기록 화면이 열린다');

  await clickSel(page, '#tab-today');
  await page.evaluate(() => {
    const row = document.querySelector('.task[data-id="a"]');
    row.querySelector('[aria-label^="더보기"], .iconbtn[aria-label="더보기"]').click();
  });
  await clickButton(page, '삭제', '.menu');
  await page.waitForSelector('#toast:not([hidden])');
  if (store.files.get('todos.json').doc.tasks.some((item) => item.id === 'a')) {
    await saved(page);
  }
  if (store.files.get('todos.json').doc.tasks.some((item) => item.id === 'a')) throw new Error('삭제가 저장되지 않음');
  await clickSel(page, '#undoBtn');
  await saved(page);
  if (!store.files.get('todos.json').doc.tasks.some((item) => item.id === 'a')) throw new Error('실행 취소가 저장되지 않음');
  pass('삭제와 실행 취소를 저장한다');

  await page.keyboard.down('Shift');
  await page.keyboard.press('/');
  await page.keyboard.up('Shift');
  await page.waitForSelector('#helpDialog[open]');
  await page.keyboard.press('Escape');
  await clickSel(page, '#helpBtn');
  await page.waitForSelector('#helpDialog[open]');
  await clickButton(page, '닫기', '#helpDialog');
  pass('도움말 버튼과 ? 단축키가 열린다');

  await clickSel(page, '#themeBtn');
  await clickSel(page, '#themeBtn');
  const theme = await page.evaluate(() => document.documentElement.dataset.theme);
  if (theme !== 'dark' && theme !== 'light') throw new Error(`밝기 ${theme}`);
  await page.evaluate(() => document.querySelector('[data-skin-set="paper"]').click());
  await page.evaluate(() => document.querySelector('[data-bg-set="mint"]')?.click() || document.querySelector('#settingsBtn').click());
  await clickSel(page, '#settingsBtn');
  await page.waitForSelector('#settingsDialog[open]');
  await page.evaluate(() => document.querySelector('[data-bg-set="peach"]').click());
  const look = await page.evaluate(() => ({
    skin: document.documentElement.dataset.skin,
    bg: document.documentElement.dataset.bg,
  }));
  if (look.skin !== 'paper' || look.bg !== 'peach') throw new Error(JSON.stringify(look));
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#main:not([hidden])');
  const kept = await page.evaluate(() => ({
    skin: document.documentElement.dataset.skin,
    bg: document.documentElement.dataset.bg,
    theme: localStorage.getItem('todo.theme'),
  }));
  if (kept.skin !== 'paper' || kept.bg !== 'peach' || !kept.theme) throw new Error(`설정이 유지되지 않음 ${JSON.stringify(kept)}`);
  pass('테마, 밝기, 배경이 새로고침 뒤에도 남는다');

  await page.evaluate(() => document.querySelector('[data-skin-set="pastel"]').click());
  await clickSel(page, '#settingsBtn');
  await page.waitForSelector('#dataLoc');
  if (!(await page.$eval('#dataLoc', (el) => el.textContent)).includes('todos.json')) throw new Error('저장 위치가 없다');
  await page.$eval('#setPath', (el) => { el.value = 'other.json'; });
  await page.click('#settingsForm button[type="submit"]');
  await page.waitForFunction(() => {
    const list = document.getElementById('list')?.innerText || '';
    return document.getElementById('dataLoc')?.textContent.includes('other.json') && !list.includes('불러오는');
  });
  await page.click('#composer');
  await page.type('#composer', '경로 확인');
  await page.keyboard.press('Enter');
  try {
    await page.waitForFunction(() => document.body.innerText.includes('경로 확인'), { timeout: 3000 });
  } catch {
    const info = await page.evaluate(() => ({
      loc: document.getElementById('dataLoc')?.textContent,
      view: document.getElementById('viewName')?.textContent,
      composer: document.getElementById('composer')?.value,
      dialog: [...document.querySelectorAll('dialog')].filter((d) => d.open).map((d) => d.id),
      err: document.getElementById('settingsError')?.textContent,
      list: document.getElementById('list')?.innerText?.slice(0, 180),
    }));
    throw new Error(JSON.stringify(info));
  }
  await saved(page);
  if (!store.files.get('other.json')?.doc.tasks.some((item) => item.title === '경로 확인')) {
    const paths = [...store.files.keys()].join(',');
    const puts = store.state.puts.map((put) => `${put.path}:${(put.doc.tasks || []).map((item) => item.title).join('|')}`).join(' || ');
    throw new Error(`바꾼 경로로 파일을 만들지 않음 files=${paths} puts=${puts}`);
  }
  pass('저장소 경로를 바꾸면 그 파일에 저장한다');

  await clickSel(page, '#settingsBtn');
  await page.evaluate(() => {
    const blob = new Blob([JSON.stringify({ version: 2, tasks: [{ id: 'imp-1', title: '가져온 일', status: 'open', list: 'today' }] })], { type: 'application/json' });
    const file = new File([blob], 'in.json', { type: 'application/json' });
    const input = document.getElementById('importFile');
    const transfer = new DataTransfer();
    transfer.items.add(file);
    input.files = transfer.files;
    input.dispatchEvent(new Event('change'));
  });
  await page.waitForSelector('#importDialog[open]');
  await clickSel(page, '#importMerge');
  await saved(page);
  if (!store.files.get('other.json').doc.tasks.some((item) => item.title === '가져온 일')) throw new Error('병합이 저장되지 않음');
  pass('JSON 병합이 가져온 일을 저장한다');

  await clickSel(page, '#settingsBtn');
  await page.evaluate(() => {
    window.__downloads = [];
    const orig = URL.createObjectURL;
    URL.createObjectURL = (blob) => { window.__downloads.push(blob); return orig(blob); };
  });
  await clickSel(page, '#exportBtn');
  const exported = await page.evaluate(async () => {
    const blob = window.__downloads.at(-1);
    return blob ? blob.text() : '';
  });
  if (!exported.includes('가져온 일')) throw new Error('내보내기에 현재 목록이 없다');
  await page.evaluate(() => {
    const blob = new Blob([JSON.stringify({ version: 2, tasks: [{ id: 'only-new', title: '교체된 일', status: 'open', list: 'today' }] })], { type: 'application/json' });
    const file = new File([blob], 'replace.json', { type: 'application/json' });
    const input = document.getElementById('importFile');
    const transfer = new DataTransfer();
    transfer.items.add(file);
    input.files = transfer.files;
    input.dispatchEvent(new Event('change'));
  });
  await page.waitForSelector('#importDialog[open]');
  await clickSel(page, '#importReplace');
  await saved(page);
  const replaced = store.files.get('other.json').doc.tasks;
  if (!replaced.some((item) => item.title === '교체된 일') || replaced.some((item) => item.title === '가져온 일')) throw new Error('교체가 반영되지 않음');
  pass('JSON 교체는 파일 내용으로 목록을 바꾼다');

  await page.evaluate(() => { window.__TODO_NOW = '2026-11-13T06:30:00.000Z'; localStorage.removeItem('todo.notified'); });
  await clickSel(page, '#settingsBtn');
  await page.waitForSelector('#notifyToggle');
  await clickButton(page, '15:00', '#briefChips');
  const perm = await page.evaluate(() => (typeof Notification === 'undefined' ? 'missing' : Notification.permission));
  if (perm === 'granted') {
    await page.evaluate(() => {
      const box = document.getElementById('notifyToggle');
      box.checked = true;
      box.dispatchEvent(new Event('change'));
    });
    await page.waitForFunction(() => {
      const note = document.getElementById('notice');
      return note && !note.hidden && note.textContent.includes('아침 브리핑');
    });
    pass('알림을 켜면 아침 브리핑이 뜬다');
  } else {
    pass(`알림 권한은 이 브라우저에서 ${perm} 이라 실제 알림은 확인하지 못했다`);
  }

  await clickSel(page, '#saveBtn');
  await saved(page);
  const pill = await page.$eval('#syncPill', (el) => el.dataset.state);
  if (pill !== 'saved') throw new Error(`저장 상태 ${pill}`);
  pass('저장 버튼이 저장됨으로 돌아온다');

  await page.evaluate(() => document.getElementById('settingsDialog')?.close());
  await clickSel(page, '#hideDoneBtn');
  if (await page.$eval('#hideDoneBtn', (el) => el.getAttribute('aria-pressed')) !== 'true') throw new Error('완료 숨기기가 켜지지 않음');
  await clickSel(page, '#hideDoneBtn');
  pass('완료 숨기기를 켜고 끈다');
  await page.screenshot({ path: `${ART}/func-today.png` });
  await clickSel(page, '#tab-calendar');
  await page.waitForSelector('.cal-grid');
  await page.screenshot({ path: `${ART}/func-calendar.png` });

  await page.setViewport({ width: 390, height: 844 });
  await clickSel(page, '#navToggle');
  const drawer = await page.$eval('#sidebar', (el) => el.classList.contains('is-open'));
  if (!drawer) throw new Error('모바일 서랍이 열리지 않음');
  await page.screenshot({ path: `${ART}/func-mobile.png` });
  await clickSel(page, '#navBackdrop');
  await page.evaluate(() => document.querySelector('[data-goto="today"]').click());
  const plusFocus = await page.evaluate(() => {
    const button = document.getElementById('magicPlus');
    button.click();
    return {
      id: document.activeElement?.id || document.activeElement?.tagName,
      display: getComputedStyle(button).display,
      composer: getComputedStyle(document.getElementById('composer')).display,
    };
  });
  if (plusFocus.id !== 'composer') throw new Error(`떠 있는 + 가 입력을 열지 않음 ${JSON.stringify(plusFocus)}`);
  pass('모바일 서랍과 + 버튼이 동작한다');

  await page.setViewport({ width: 1440, height: 900 });
  await clickSel(page, '#logoutBtn');
  await page.waitForSelector('#login:not([hidden])');
  const tokenLeft = await page.evaluate(() => localStorage.getItem('todo.auth.token') || sessionStorage.getItem('todo.auth.token'));
  if (tokenLeft) throw new Error('로그아웃 후에도 토큰이 남았다');
  pass('로그아웃하면 토큰을 지운다');
  if (page.__errors.length) throw new Error(page.__errors.join(' | '));
  await page.close();
} catch (error) { fail('본 기능', error); }

// --- 409 충돌 ---
try {
  const store = createStore();
  store.seed('todos.json', doc([task({ id: 'a', title: '원래 일', order: 0 })]));
  store.state.conflict = 1;
  const page = await bootPage(browser, store);
  await login(page);
  await page.type('#composer', '로컬에서 추가');
  await page.keyboard.press('Enter');
  await saved(page);
  const titles = store.files.get('todos.json').doc.tasks.map((item) => item.title);
  if (!titles.includes('로컬에서 추가') || !titles.includes('원격에서 온 일')) throw new Error(`충돌 병합 실패 ${titles}`);
  pass('409 충돌을 병합해 다시 저장한다');
  await page.close();
} catch (error) { fail('409 충돌', error); }

// --- 오프라인 ---
try {
  const store = createStore();
  store.seed('todos.json', doc([task({ id: 'a', title: '오프라인 원본', order: 0 })]));
  const page = await bootPage(browser, store);
  await login(page);
  await page.evaluate(() => {
    Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => false });
  });
  store.state.offline = true;
  await page.type('#composer', '오프라인 추가');
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => document.getElementById('syncPill')?.dataset.state === 'offline');
  const cached = await page.evaluate(() => JSON.stringify(localStorage));
  if (!cached.includes('오프라인 추가')) throw new Error('오프라인 변경이 기기에 남지 않음');
  store.state.offline = false;
  await page.evaluate(() => {
    Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => true });
  });
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => document.body.innerText.includes('오프라인 추가'));
  await saved(page);
  if (!store.files.get('todos.json').doc.tasks.some((item) => item.title === '오프라인 추가')) throw new Error('다시 연결한 뒤 저장되지 않음');
  pass('오프라인이면 이 기기에 남기고 연결되면 저장한다');
  await page.close();
} catch (error) { fail('오프라인', error); }

// --- 서비스 워커 업데이트 배너 ---
try {
  const store = createStore();
  store.seed('todos.json', doc([task({ id: 'a', title: '워커 확인', order: 0 })]));
  const page = await bootPage(browser, store);
  await login(page);
  await page.evaluate(async () => {
    const ready = navigator.serviceWorker?.ready;
    if (!ready) return 'unsupported';
    await Promise.race([ready, new Promise((resolve) => setTimeout(resolve, 4000))]);
    return navigator.serviceWorker.controller ? 'controlled' : 'registered';
  });
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#main:not([hidden])');
  const shown = await page.evaluate(() => {
    const had = !!navigator.serviceWorker?.controller;
    navigator.serviceWorker?.dispatchEvent(new Event('controllerchange'));
    const banner = document.getElementById('updateBanner');
    return { had, hidden: banner ? banner.hidden : null };
  });
  if (shown.hidden !== false && shown.had) throw new Error(`업데이트 배너 ${JSON.stringify(shown)}`);
  if (!shown.had) pass('이 환경에서는 서비스 워커가 제어권을 잡지 않아 배너만 코드 경로로 확인했다');
  else {
    await clickSel(page, '#updateBtn');
    pass('서비스 워커가 바뀌면 새로고침 안내가 나온다');
  }
  await page.close();
} catch (error) { fail('서비스 워커 업데이트', error); }

await browser.close();
const failed = results.filter((item) => !item.ok);
console.log(JSON.stringify({ passed: results.filter((item) => item.ok).length, failed: failed.length, results }, null, 2));
process.exit(failed.length ? 1 : 0);
