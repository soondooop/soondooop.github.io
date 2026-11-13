/**
 * 업무 체크.
 * 할 일은 GitHub Contents API로 비공개 저장소에 저장한다.
 * 토큰은 이 브라우저의 localStorage/sessionStorage에만 둔다. 로그나 커밋에 남기지 않는다.
 */

const TZ = 'Asia/Seoul';
const SAVE_DELAY = 1500;
const UNDO_MS = 5000;

const TOKEN_KEY = 'todo.auth.token';
const USER_KEY = 'todo.auth.user';
const PERSIST_KEY = 'todo.auth.persist';
const SETTINGS_KEY = 'todo.settings';
const THEME_KEY = 'todo.theme';
const HIDE_DONE_KEY = 'todo.hideCompleted';

export const DEFAULT_SETTINGS = Object.freeze({
  owner: 'soondooop',
  repo: 'todo-data',
  branch: 'main',
  path: 'todos.json',
});

const SYNC_LABEL = {
  saved: '저장됨',
  saving: '저장 중',
  offline: '오프라인',
  conflict: '충돌',
  error: '오류',
};

const PRIORITY_LABEL = { high: '높음', medium: '보통', low: '낮음' };
const THEME_ORDER = ['system', 'light', 'dark'];
const THEME_LABEL = { system: '시스템', light: '라이트', dark: '다크' };

const state = {
  token: '',
  user: null,
  settings: { ...DEFAULT_SETTINGS },
  doc: null,
  sha: null,
  baseTasks: [],
  deletedAt: {},
  dirty: false,
  ready: false,
  view: 'today',
  hideCompleted: false,
  query: '',
  tag: null,
  focusId: null,
  editingId: null,
  selectTitle: false,
  memoId: null,
  dueId: null,
  menu: null,
  dragId: null,
  sync: 'saved',
  theme: 'system',
  flushing: false,
  again: false,
  timer: 0,
  undo: null,
  undoTimer: 0,
  animatingId: null,
  pendingImport: null,
};

let client = null;
let addLock = false;

export class GitHubError extends Error {
  constructor(message, extra = {}) {
    super(message);
    this.name = 'GitHubError';
    this.status = extra.status || 0;
    this.offline = !!extra.offline;
    this.conflict = !!extra.conflict;
  }
}

export function seoulDate(value = new Date()) {
  const date = value instanceof Date ? value : new Date(value);
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

export function seoulStamp(value = new Date()) {
  const date = value instanceof Date ? value : new Date(value);
  const day = seoulDate(date);
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: TZ,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);
  const map = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  const hour = String(map.hour ?? '00').padStart(2, '0');
  const minute = String(map.minute ?? '00').padStart(2, '0');
  return `${day} ${hour}:${minute}`;
}

export function formatKoreanFull(value = new Date()) {
  const date = value instanceof Date ? value : new Date(value);
  return new Intl.DateTimeFormat('ko-KR', {
    timeZone: TZ,
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    weekday: 'long',
  }).format(date);
}

export function addDays(ymd, amount) {
  const utc = Date.parse(`${ymd}T00:00:00Z`) + amount * 86400000;
  return new Date(utc).toISOString().slice(0, 10);
}

export function daysBetween(from, to) {
  const ms = Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`);
  return Math.round(ms / 86400000);
}

export function toBase64(text) {
  const bytes = new TextEncoder().encode(text);
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

export function fromBase64(value) {
  let clean = String(value ?? '').replace(/\s/g, '');
  const pad = clean.length % 4;
  if (pad) clean += '='.repeat(4 - pad);
  const binary = atob(clean);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}

function timeOf(value) {
  const parsed = Date.parse(value || '');
  return Number.isNaN(parsed) ? 0 : parsed;
}

function isNewer(a, b) {
  return timeOf(a) > timeOf(b);
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function mapPriority(value) {
  const v = String(value ?? '').toLowerCase();
  if (v === '1' || v === 'high' || v === '높음') return 'high';
  if (v === '3' || v === 'low' || v === '낮음') return 'low';
  if (v === '2' || v === 'medium' || v === '보통') return 'medium';
  return null;
}

export function isYmd(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value || '')) return false;
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

export function parseQuickAdd(text) {
  const src = String(text ?? '').normalize('NFC');
  const tags = [];
  let priority = null;
  let due = null;
  const re = /(^|\s)(#([^\s#]+)|!(높음|보통|낮음|high|medium|low|[123])|(\d{4}-\d{2}-\d{2}))(?=\s|$)/giu;
  let out = '';
  let last = 0;
  let match = re.exec(src);
  while (match) {
    const ws = match[1] || '';
    const tokenStart = match.index + ws.length;
    out += src.slice(last, tokenStart);
    last = match.index + match[0].length;
    if (match[3]) tags.push(match[3]);
    else if (match[4]) priority = mapPriority(match[4]);
    else if (match[5]) {
      if (isYmd(match[5])) due = match[5];
      else out += match[5];
    }
    match = re.exec(src);
  }
  out += src.slice(last);
  const title = out.replace(/\s+/g, ' ').trim().slice(0, 500);
  const uniq = [];
  for (const tag of tags) {
    const clean = tag.replace(/^#+/, '').trim().slice(0, 30);
    if (!clean) continue;
    if (!uniq.some((item) => item.toLocaleLowerCase('ko') === clean.toLocaleLowerCase('ko'))) uniq.push(clean);
    if (uniq.length >= 12) break;
  }
  return { title, tags: uniq, priority: priority || 'medium', due };
}

function normalizeTask(raw, index) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new Error(`할 일 ${index + 1}이 객체가 아닙니다.`);
  }
  const id = typeof raw.id === 'string' ? raw.id.trim() : '';
  if (!id || id.length > 80 || /\s/.test(id)) throw new Error(`할 일 ${index + 1}의 id가 올바르지 않습니다.`);
  const title = typeof raw.title === 'string' ? raw.title.replace(/\s+/g, ' ').trim() : '';
  if (!title) throw new Error(`할 일 ${index + 1}의 제목이 필요합니다.`);
  const priority = mapPriority(raw.priority) || 'medium';
  const list = raw.list === 'backlog' ? 'backlog' : 'today';
  const status = raw.status === 'done' ? 'done' : 'open';
  const tags = [];
  if (Array.isArray(raw.tags)) {
    for (const tag of raw.tags) {
      const clean = String(tag ?? '').replace(/^#+/, '').trim().slice(0, 30);
      if (!clean || /\s/.test(clean)) continue;
      if (!tags.some((item) => item.toLocaleLowerCase('ko') === clean.toLocaleLowerCase('ko'))) tags.push(clean);
      if (tags.length >= 12) break;
    }
  }
  const due = typeof raw.due === 'string' && isYmd(raw.due) ? raw.due : null;
  const now = new Date().toISOString();
  const createdAt = typeof raw.createdAt === 'string' && !Number.isNaN(Date.parse(raw.createdAt))
    ? new Date(raw.createdAt).toISOString()
    : now;
  const updatedAt = typeof raw.updatedAt === 'string' && !Number.isNaN(Date.parse(raw.updatedAt))
    ? new Date(raw.updatedAt).toISOString()
    : createdAt;
  const completedAt = status === 'done'
    ? (typeof raw.completedAt === 'string' && !Number.isNaN(Date.parse(raw.completedAt))
      ? new Date(raw.completedAt).toISOString()
      : updatedAt)
    : null;
  const carriedDays = Number.isFinite(Number(raw.carriedDays))
    ? Math.max(0, Math.min(9999, Math.floor(Number(raw.carriedDays))))
    : 0;
  const order = Number.isFinite(Number(raw.order)) ? Number(raw.order) : index;
  return {
    id,
    title: title.slice(0, 500),
    memo: typeof raw.memo === 'string' ? raw.memo.slice(0, 5000) : '',
    priority,
    due,
    tags,
    list,
    status,
    order,
    createdAt,
    updatedAt,
    completedAt,
    carriedDays,
  };
}

export function validateDoc(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('JSON 객체여야 합니다.');
  if (input.version != null && (typeof input.version !== 'number' || input.version < 1)) {
    throw new Error('지원하지 않는 version 입니다.');
  }
  if (!Array.isArray(input.tasks)) throw new Error('tasks 배열이 필요합니다.');
  if (input.tasks.length > 5000) throw new Error('할 일이 너무 많습니다.');
  const seen = new Set();
  const tasks = input.tasks.map((task, index) => {
    const normalized = normalizeTask(task, index);
    if (seen.has(normalized.id)) throw new Error(`중복된 id가 있습니다: ${normalized.id}`);
    seen.add(normalized.id);
    return normalized;
  });
  const rolloverDate = typeof input.rolloverDate === 'string' && isYmd(input.rolloverDate) ? input.rolloverDate : null;
  const updatedAt = typeof input.updatedAt === 'string' && !Number.isNaN(Date.parse(input.updatedAt))
    ? new Date(input.updatedAt).toISOString()
    : new Date().toISOString();
  return { version: 1, updatedAt, rolloverDate, tasks };
}

export function emptyDoc(today = seoulDate(new Date()), now = new Date().toISOString()) {
  return { version: 1, updatedAt: now, rolloverDate: today, tasks: [] };
}

export function validateSettings(input) {
  if (!input || typeof input !== 'object') return '설정을 확인해 주세요.';
  if (!/^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})$/.test(input.owner || '')) return '소유자 이름을 확인해 주세요.';
  if (!/^[A-Za-z0-9_.-]{1,100}$/.test(input.repo || '')) return '저장소 이름을 확인해 주세요.';
  if (!input.branch || /[\s~^:?*[\]\\]/.test(input.branch) || input.branch.includes('..') || input.branch.startsWith('/') || input.branch.endsWith('/')) {
    return '브랜치 이름을 확인해 주세요.';
  }
  if (!input.path || input.path.startsWith('/') || input.path.includes('\\') || input.path.split('/').some((part) => !part || part === '.' || part === '..')) {
    return '파일 경로를 확인해 주세요.';
  }
  if (!input.path.endsWith('.json')) return '경로는 .json 파일이어야 합니다.';
  return '';
}

export function encodeRepoPath(path) {
  const error = validateSettings({ ...DEFAULT_SETTINGS, path });
  if (error && error.includes('경로')) throw new GitHubError(error);
  return path.split('/').map((part) => encodeURIComponent(part)).join('/');
}

function laterYmd(a, b) {
  const left = isYmd(a) ? a : '';
  const right = isYmd(b) ? b : '';
  if (!left) return right || null;
  if (!right) return left;
  return left > right ? left : right;
}

export function mergeByUpdatedAt(leftTasks, rightTasks) {
  const map = new Map();
  for (const task of rightTasks) map.set(task.id, clone(task));
  for (const task of leftTasks) {
    const other = map.get(task.id);
    if (!other || timeOf(task.updatedAt) >= timeOf(other.updatedAt)) map.set(task.id, clone(task));
  }
  return [...map.values()].sort((a, b) => a.order - b.order || String(a.createdAt).localeCompare(String(b.createdAt)));
}

export function mergeDocs(localDoc, remoteDoc, baseDoc = { tasks: [] }, deletedAt = {}) {
  const local = new Map(localDoc.tasks.map((task) => [task.id, task]));
  const remote = new Map(remoteDoc.tasks.map((task) => [task.id, task]));
  const base = new Map((baseDoc?.tasks || []).map((task) => [task.id, task]));
  const ids = new Set([...local.keys(), ...remote.keys()]);
  const tasks = [];
  for (const id of ids) {
    const left = local.get(id);
    const right = remote.get(id);
    const prev = base.get(id);
    if (left && right) {
      tasks.push(clone(timeOf(left.updatedAt) >= timeOf(right.updatedAt) ? left : right));
      continue;
    }
    if (left && !right) {
      if (!prev || isNewer(left.updatedAt, prev.updatedAt)) tasks.push(clone(left));
      continue;
    }
    if (right && !left) {
      const deleted = deletedAt?.[id];
      if (deleted) {
        if (isNewer(right.updatedAt, deleted)) tasks.push(clone(right));
        continue;
      }
      if (!prev || isNewer(right.updatedAt, prev.updatedAt)) tasks.push(clone(right));
    }
  }
  tasks.sort((a, b) => a.order - b.order || String(a.createdAt).localeCompare(String(b.createdAt)));
  return validateDoc({
    version: 1,
    updatedAt: new Date().toISOString(),
    rolloverDate: laterYmd(localDoc.rolloverDate, remoteDoc.rolloverDate),
    tasks,
  });
}

export function applyCarryOver(doc, today, nowIso = new Date().toISOString()) {
  const tasks = doc.tasks.map((task) => ({ ...task, tags: [...task.tags] }));
  const from = doc.rolloverDate;
  if (!isYmd(from)) {
    return { doc: { ...doc, tasks, rolloverDate: today }, changed: doc.rolloverDate !== today };
  }
  if (from >= today) return { doc: { ...doc, tasks }, changed: false };
  const delta = daysBetween(from, today);
  const nextTasks = tasks.map((task) => {
    if (task.list === 'today' && task.status === 'open') {
      return { ...task, carriedDays: (task.carriedDays || 0) + delta, updatedAt: nowIso };
    }
    return task;
  });
  return {
    doc: { ...doc, tasks: nextTasks, rolloverDate: today, updatedAt: nowIso },
    changed: true,
  };
}

export function todayProgress(tasks, today) {
  const done = tasks.filter((task) => task.status === 'done' && task.completedAt && seoulDate(task.completedAt) === today).length;
  const open = tasks.filter((task) => task.status === 'open' && task.list === 'today').length;
  return { done, total: done + open };
}

function messageForStatus(status) {
  if (status === 401) return '토큰이 올바르지 않거나 만료되었습니다.';
  if (status === 403) return '저장소 권한이 없습니다. Contents 읽기/쓰기를 확인해 주세요.';
  if (status === 404) return '저장소를 찾을 수 없거나 권한이 없습니다.';
  return 'GitHub 요청에 실패했습니다.';
}

export function createClient({ fetchImpl, getToken, getSettings, now = () => new Date() }) {
  async function request(url, { method = 'GET', body = null, allowMissing = false } = {}) {
    const token = getToken();
    if (!token) throw new GitHubError('로그인이 필요합니다.', { status: 401 });
    const headers = {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${token}`,
      'X-GitHub-Api-Version': '2022-11-28',
    };
    let payload;
    if (body != null) {
      headers['Content-Type'] = 'application/json';
      payload = JSON.stringify(body);
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 20000);
    let response;
    try {
      response = await fetchImpl(url, {
        method,
        headers,
        body: payload,
        cache: 'no-store',
        signal: controller.signal,
      });
    } catch (error) {
      const timedOut = error?.name === 'AbortError';
      throw new GitHubError(timedOut ? '요청 시간이 초과되었습니다.' : '네트워크에 연결할 수 없습니다.', { offline: true });
    } finally {
      clearTimeout(timer);
    }
    const text = await response.text();
    if (allowMissing && response.status === 404) return { missing: true };
    if (response.status === 409 || (response.status === 422 && /sha/i.test(text))) {
      throw new GitHubError('다른 변경과 충돌했습니다.', { status: response.status, conflict: true });
    }
    let data = null;
    if (text) {
      try { data = JSON.parse(text); } catch { data = null; }
    }
    if (!response.ok) throw new GitHubError(messageForStatus(response.status), { status: response.status });
    return data;
  }

  return {
    async user() {
      const data = await request('https://api.github.com/user');
      if (!data?.login) throw new GitHubError('사용자 정보를 가져오지 못했습니다.');
      return { login: data.login, avatarUrl: data.avatar_url || '', name: data.name || '' };
    },
    async readFile() {
      const settings = getSettings();
      const path = encodeRepoPath(settings.path);
      const url = `https://api.github.com/repos/${encodeURIComponent(settings.owner)}/${encodeURIComponent(settings.repo)}/contents/${path}?ref=${encodeURIComponent(settings.branch)}`;
      const data = await request(url, { allowMissing: true });
      if (data?.missing) return { missing: true, sha: null, doc: null };
      if (Array.isArray(data)) throw new GitHubError('경로가 파일이 아니라 폴더입니다.');
      if (!data || typeof data.content !== 'string' || !data.sha) throw new GitHubError('파일 응답을 해석할 수 없습니다.');
      let parsed;
      try { parsed = JSON.parse(fromBase64(data.content)); }
      catch { throw new GitHubError('원격 JSON을 읽을 수 없습니다.'); }
      try { return { missing: false, sha: data.sha, doc: validateDoc(parsed) }; }
      catch (error) { throw new GitHubError(error.message || '원격 JSON 형식이 올바르지 않습니다.'); }
    },
    async writeFile({ sha, doc }) {
      const settings = getSettings();
      const path = encodeRepoPath(settings.path);
      const url = `https://api.github.com/repos/${encodeURIComponent(settings.owner)}/${encodeURIComponent(settings.repo)}/contents/${path}`;
      const body = {
        message: `todo: update ${seoulStamp(now())}`,
        content: toBase64(`${JSON.stringify(doc, null, 2)}\n`),
        branch: settings.branch,
      };
      if (sha) body.sha = sha;
      const data = await request(url, { method: 'PUT', body });
      const next = data?.content?.sha;
      if (!next) throw new GitHubError('저장 응답에 sha가 없습니다.');
      return { sha: next };
    },
  };
}

function $(id) { return document.getElementById(id); }

function newId() {
  if (globalThis.crypto?.randomUUID) return crypto.randomUUID();
  return `t-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function findTask(id) {
  return state.doc?.tasks.find((task) => task.id === id) || null;
}

function cacheKey() {
  const settings = state.settings;
  return `${settings.owner}/${settings.repo}/${settings.branch}/${settings.path}`;
}

function cacheStorageKey() {
  return `todo.cache.v1:${cacheKey()}`;
}

function readToken() {
  return sessionStorage.getItem(TOKEN_KEY) || localStorage.getItem(TOKEN_KEY) || '';
}

function storeToken(token, persist) {
  if (persist) {
    localStorage.setItem(TOKEN_KEY, token);
    sessionStorage.removeItem(TOKEN_KEY);
  } else {
    sessionStorage.setItem(TOKEN_KEY, token);
    localStorage.removeItem(TOKEN_KEY);
  }
  localStorage.setItem(PERSIST_KEY, persist ? '1' : '0');
}

function storeUser(user) {
  localStorage.setItem(USER_KEY, JSON.stringify({ login: user.login, avatarUrl: user.avatarUrl || '', name: user.name || '' }));
}

function readUser() {
  try {
    const user = JSON.parse(localStorage.getItem(USER_KEY) || 'null');
    if (!user?.login) return null;
    return { login: user.login, avatarUrl: user.avatarUrl || '', name: user.name || '' };
  } catch { return null; }
}

function clearAuth() {
  localStorage.removeItem(TOKEN_KEY);
  sessionStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
}

function loadSettings() {
  try {
    const raw = JSON.parse(localStorage.getItem(SETTINGS_KEY) || 'null');
    if (raw && !validateSettings(raw)) {
      return { owner: raw.owner, repo: raw.repo, branch: raw.branch, path: raw.path };
    }
  } catch { /* use defaults */ }
  return { ...DEFAULT_SETTINGS };
}

function readCache() {
  try {
    const raw = JSON.parse(localStorage.getItem(cacheStorageKey()) || 'null');
    if (!raw || raw.key !== cacheKey() || !raw.doc) return null;
    raw.doc = validateDoc(raw.doc);
    return raw;
  } catch { return null; }
}

function persistCache() {
  if (!state.doc) return;
  try {
    localStorage.setItem(cacheStorageKey(), JSON.stringify({
      key: cacheKey(),
      sha: state.sha,
      doc: state.doc,
      baseTasks: state.baseTasks,
      deletedAt: state.deletedAt,
      dirty: state.dirty,
      savedAt: new Date().toISOString(),
    }));
  } catch { setDetail('이 기기의 저장 공간이 부족합니다.'); }
}

function clearCurrentCache() {
  localStorage.removeItem(cacheStorageKey());
}

function sameSettings(a, b) {
  return a.owner === b.owner && a.repo === b.repo && a.branch === b.branch && a.path === b.path;
}

function announce(message) {
  const live = $('live');
  if (!live) return;
  live.textContent = '';
  window.setTimeout(() => { live.textContent = message; }, 30);
}

function setDetail(text) {
  const detail = $('syncDetail');
  if (detail) detail.textContent = text || '';
}

function setSync(name, detail = '') {
  state.sync = name;
  const pill = $('syncPill');
  if (!pill) return;
  pill.dataset.state = name;
  pill.textContent = SYNC_LABEL[name] || name;
  setDetail(detail);
}

function reduceMotion() {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function resolvedTheme(pref) {
  if (pref === 'light' || pref === 'dark') return pref;
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function applyTheme(pref) {
  const resolved = resolvedTheme(pref);
  document.documentElement.dataset.theme = resolved;
  document.documentElement.dataset.themePref = pref;
  document.documentElement.style.colorScheme = resolved;
  state.theme = pref;
}

function renderThemeButton() {
  const button = $('themeBtn');
  if (!button) return;
  button.textContent = THEME_LABEL[state.theme] || '시스템';
  button.setAttribute('aria-label', `테마 ${THEME_LABEL[state.theme]}. 클릭하면 바뀝니다.`);
}

function inView(task, view) {
  if (view === 'done') return task.status === 'done';
  if (task.list !== view) return false;
  if (task.status === 'open') return true;
  if (task.status !== 'done') return false;
  if (view === 'today') return Boolean(task.completedAt && seoulDate(task.completedAt) === seoulDate(new Date()));
  return true;
}

function hideDoneInList() {
  return state.hideCompleted && state.view !== 'done';
}

function matchesFilter(task) {
  if (state.tag && !task.tags.includes(state.tag)) return false;
  const query = state.query.trim().toLocaleLowerCase('ko');
  if (!query) return true;
  if (query.startsWith('#')) {
    const needle = query.slice(1);
    if (task.tags.some((tag) => tag.toLocaleLowerCase('ko').includes(needle))) return true;
  }
  const hay = [task.title, task.memo, ...task.tags].join('\n').toLocaleLowerCase('ko');
  return hay.includes(query);
}

function byOrder(a, b) {
  return a.order - b.order || String(a.createdAt).localeCompare(String(b.createdAt));
}

function orderedVisibleTasks() {
  if (!state.doc) return [];
  let tasks = state.doc.tasks.filter((task) => inView(task, state.view) && matchesFilter(task));
  if (state.view === 'done') {
    return tasks.sort((a, b) => String(b.completedAt || '').localeCompare(String(a.completedAt || '')));
  }
  if (hideDoneInList()) tasks = tasks.filter((task) => task.status !== 'done');
  const open = tasks.filter((task) => task.status !== 'done').sort(byOrder);
  const done = tasks.filter((task) => task.status === 'done').sort(byOrder);
  return [...open, ...done];
}

function groupLabel(ymd) {
  const today = seoulDate(new Date());
  if (ymd === today) return '오늘';
  if (ymd === addDays(today, -1)) return '어제';
  if (!isYmd(ymd)) return '날짜 없음';
  return new Intl.DateTimeFormat('ko-KR', {
    timeZone: TZ,
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    weekday: 'short',
  }).format(new Date(`${ymd}T12:00:00+09:00`));
}

function formatDue(ymd, today, status) {
  if (!ymd) return '기한';
  if (ymd === today) return '오늘';
  if (ymd === addDays(today, 1)) return '내일';
  if (status === 'open' && ymd === addDays(today, -1)) return '어제';
  const [year, month, day] = ymd.split('-').map(Number);
  if (String(year) === today.slice(0, 4)) return `${month}월 ${day}일`;
  return `${year}.${month}.${day}`;
}

function dueClass(ymd, today, status) {
  if (!ymd) return 'due is-empty';
  if (status === 'open' && ymd < today) return 'due is-overdue';
  if (ymd === today) return 'due is-today';
  return 'due';
}

function formatDoneTime(iso) {
  if (!iso || Number.isNaN(Date.parse(iso))) return '';
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: TZ,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date(iso));
  const map = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `완료 ${String(map.hour ?? '00').padStart(2, '0')}:${String(map.minute ?? '00').padStart(2, '0')}`;
}

function progressText(done, total) {
  if (total === 0) return '오늘은 아직 할 일이 없습니다';
  if (done === total) return `모두 마쳤습니다 · ${done}/${total}`;
  return `${done}/${total} 완료`;
}

function emptyMessage() {
  if (state.query.trim() || state.tag) return '검색 결과가 없습니다.';
  if (state.view === 'today') return '오늘 할 일이 없습니다. N 키나 위 입력란으로 추가하세요.';
  if (state.view === 'backlog') return '백로그가 비어 있습니다.';
  return '완료한 일이 없습니다.';
}

function showLogin(message = '') {
  $('login').hidden = false;
  $('main').hidden = true;
  $('loginError').textContent = message || '';
  if (message) $('token').setAttribute('aria-invalid', 'true');
  else $('token').removeAttribute('aria-invalid');
}

function showMain() {
  $('login').hidden = true;
  $('main').hidden = false;
  fillDate();
  renderThemeButton();
  renderDataLoc();
}

function fillDate() {
  $('todayDate').textContent = formatKoreanFull(new Date());
}

function renderDataLoc() {
  const settings = state.settings;
  $('dataLoc').textContent = `${settings.owner}/${settings.repo}@${settings.branch} · ${settings.path} · 비공개 저장소에만 저장하세요`;
}

function renderUser() {
  const slot = $('avatarSlot');
  const name = $('username');
  slot.replaceChildren();
  const login = state.user?.login || '';
  name.textContent = login;
  if (!login) return;
  if (state.user.avatarUrl) {
    const img = document.createElement('img');
    img.alt = '';
    img.width = 28;
    img.height = 28;
    img.referrerPolicy = 'no-referrer';
    img.src = state.user.avatarUrl;
    img.addEventListener('error', () => { slot.replaceChildren(fallbackAvatar(login)); });
    slot.append(img);
    return;
  }
  slot.append(fallbackAvatar(login));
}

function fallbackAvatar(login) {
  const span = document.createElement('span');
  span.className = 'avatar-fallback';
  span.setAttribute('aria-hidden', 'true');
  span.textContent = login.slice(0, 1).toUpperCase();
  return span;
}

function renderTabs() {
  for (const view of ['today', 'backlog', 'done']) {
    const tab = $(`tab-${view}`);
    const selected = state.view === view;
    tab.setAttribute('aria-selected', selected ? 'true' : 'false');
    tab.tabIndex = selected ? 0 : -1;
  }
  $('list').setAttribute('aria-labelledby', `tab-${state.view}`);
  const composer = $('composer');
  composer.placeholder = state.view === 'backlog'
    ? '백로그에 추가  ·  #태그  !높음  2026-11-20'
    : '오늘 할 일 추가  ·  #태그  !높음  2026-11-20';
  composer.disabled = !state.ready || !state.doc;
  $('composerForm').querySelector('button').disabled = composer.disabled;
}

function renderCounts() {
  const tasks = state.doc?.tasks || [];
  const count = (view) => tasks.filter((task) => inView(task, view) && !(state.hideCompleted && task.status === 'done')).length;
  $('count-today').textContent = String(count('today'));
  $('count-backlog').textContent = String(count('backlog'));
}

function renderProgress() {
  const today = seoulDate(new Date());
  const { done, total } = todayProgress(state.doc?.tasks || [], today);
  const bar = $('progress');
  const max = Math.max(total, 1);
  bar.setAttribute('aria-valuemax', String(total === 0 ? 0 : max));
  bar.setAttribute('aria-valuenow', String(done));
  bar.setAttribute('aria-valuetext', progressText(done, total));
  $('progressFill').style.width = total === 0 ? '0%' : `${Math.round((done / total) * 100)}%`;
  $('progressLabel').textContent = progressText(done, total);
}

function renderTagBar() {
  const bar = $('tagBar');
  bar.replaceChildren();
  if (!state.doc) return;
  const tags = new Set();
  for (const task of state.doc.tasks) {
    if (!inView(task, state.view)) continue;
    if (hideDoneInList() && task.status === 'done') continue;
    for (const tag of task.tags) tags.add(tag);
  }
  if (state.tag) tags.add(state.tag);
  const sorted = [...tags].sort((a, b) => a.localeCompare(b, 'ko'));
  for (const tag of sorted) {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = `#${tag}`;
    button.setAttribute('aria-pressed', state.tag === tag ? 'true' : 'false');
    button.addEventListener('click', () => {
      state.tag = state.tag === tag ? null : tag;
      renderTagBar();
      renderList();
    });
    bar.append(button);
  }
  if (state.tag || state.query.trim()) {
    const clear = document.createElement('button');
    clear.type = 'button';
    clear.textContent = '필터 해제';
    clear.addEventListener('click', () => {
      state.tag = null;
      state.query = '';
      $('search').value = '';
      renderTagBar();
      renderList();
    });
    bar.append(clear);
  }
}

function renderList() {
  const list = $('list');
  const active = document.activeElement;
  const restoreId = active?.closest?.('#list [data-id]')?.getAttribute('data-id');
  const restoreKind = active?.getAttribute?.('data-restore');
  list.replaceChildren();
  if (!state.ready || !state.doc) {
    list.append(emptyNode('불러오는 중…'));
    return;
  }
  const tasks = orderedVisibleTasks();
  if (!tasks.length) {
    list.append(emptyNode(emptyMessage()));
    return;
  }
  if (state.view === 'done') {
    const groups = new Map();
    for (const task of tasks) {
      const key = task.completedAt ? seoulDate(task.completedAt) : 'unknown';
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(task);
    }
    for (const [key, items] of groups) {
      const section = document.createElement('section');
      section.className = 'group';
      const heading = document.createElement('h2');
      heading.textContent = groupLabel(key);
      const ul = document.createElement('ul');
      ul.className = 'tasks';
      for (const task of items) ul.append(renderTask(task));
      section.append(heading, ul);
      list.append(section);
    }
  } else {
    const open = tasks.filter((task) => task.status !== 'done');
    const done = tasks.filter((task) => task.status === 'done');
    const label = state.view === 'today' ? '오늘 할 일' : '백로그';
    if (open.length) list.append(taskList(label, open));
    if (done.length) {
      const split = document.createElement('h2');
      split.className = 'done-split';
      split.textContent = `완료 ${done.length}`;
      list.append(split);
      list.append(taskList('완료한 할 일', done));
    }
  }
  if (state.editingId) {
    const input = list.querySelector('.title-input');
    if (input) {
      input.focus();
      if (state.selectTitle) {
        input.select();
        state.selectTitle = false;
      }
    }
  } else if (restoreId) {
    const row = list.querySelector(`[data-id="${CSS.escape(restoreId)}"]`);
    if (!row) return;
    if (!restoreKind || restoreKind === 'row') row.focus();
    else row.querySelector(`[data-restore="${CSS.escape(restoreKind)}"]`)?.focus();
  }
}

function taskList(label, tasks) {
  const ul = document.createElement('ul');
  ul.className = 'tasks';
  ul.setAttribute('aria-label', label);
  for (const task of tasks) ul.append(renderTask(task));
  return ul;
}

function emptyNode(text) {
  const p = document.createElement('p');
  p.className = 'empty';
  p.textContent = text;
  return p;
}

function noteIcon() {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 16 16');
  svg.setAttribute('width', '14');
  svg.setAttribute('height', '14');
  svg.setAttribute('aria-hidden', 'true');
  const path = document.createElementNS(svg.namespaceURI, 'path');
  path.setAttribute('d', 'M4 2.2h5.2L12.8 5.6V13a.8.8 0 0 1-.8.8H4a.8.8 0 0 1-.8-.8V3a.8.8 0 0 1 .8-.8Z');
  path.setAttribute('fill', 'none');
  path.setAttribute('stroke', 'currentColor');
  path.setAttribute('stroke-width', '1.3');
  path.setAttribute('stroke-linejoin', 'round');
  const fold = document.createElementNS(svg.namespaceURI, 'path');
  fold.setAttribute('d', 'M9 2.4V5.4h3');
  fold.setAttribute('fill', 'none');
  fold.setAttribute('stroke', 'currentColor');
  fold.setAttribute('stroke-width', '1.3');
  svg.append(path, fold);
  return svg;
}

function flagIcon(priority) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 16 16');
  svg.setAttribute('width', '14');
  svg.setAttribute('height', '14');
  svg.setAttribute('aria-hidden', 'true');
  const pole = document.createElementNS(svg.namespaceURI, 'path');
  pole.setAttribute('d', 'M3.2 1.6v12.8');
  pole.setAttribute('fill', 'none');
  pole.setAttribute('stroke', 'currentColor');
  pole.setAttribute('stroke-width', '1.4');
  pole.setAttribute('stroke-linecap', 'round');
  const flag = document.createElementNS(svg.namespaceURI, 'path');
  flag.setAttribute('d', 'M3.2 2.4h8.3L9.7 5.1l1.8 2.6H3.2Z');
  if (priority === 'low') {
    flag.setAttribute('fill', 'none');
    flag.setAttribute('stroke', 'currentColor');
    flag.setAttribute('stroke-width', '1.3');
    flag.setAttribute('stroke-linejoin', 'round');
  } else flag.setAttribute('fill', 'currentColor');
  svg.append(pole, flag);
  return svg;
}

function renderTask(task) {
  const today = seoulDate(new Date());
  const li = document.createElement('li');
  li.className = 'task';
  if (task.status === 'done') li.classList.add('is-done');
  if (state.focusId === task.id) li.classList.add('is-focused');
  if (state.menu?.id === task.id) li.classList.add('menu-open');
  li.dataset.id = task.id;
  li.dataset.restore = 'row';
  li.tabIndex = state.focusId === task.id ? 0 : -1;
  li.draggable = state.view !== 'done' && state.editingId !== task.id;

  const main = document.createElement('div');
  main.className = 'task-main';

  const check = document.createElement('input');
  check.type = 'checkbox';
  check.className = 'check';
  check.checked = task.status === 'done';
  check.dataset.restore = 'check';
  check.setAttribute('aria-label', `완료 표시: ${task.title}`);
  check.addEventListener('click', (event) => event.stopPropagation());
  check.addEventListener('change', () => {
    if (state.animatingId) {
      check.checked = findTask(task.id)?.status === 'done';
      return;
    }
    toggleComplete(task.id);
  });

  const titleLine = document.createElement('div');
  titleLine.className = 'title-line';
  if (state.editingId === task.id) {
    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'title-input';
    input.value = task.title;
    input.maxLength = 500;
    input.setAttribute('aria-label', '할 일 제목');
    input.addEventListener('keydown', (event) => {
      if (event.isComposing || event.keyCode === 229) return;
      if (event.key === 'Enter') {
        event.preventDefault();
        event.stopPropagation();
        commitTitle(task.id, input.value);
      } else if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        state.editingId = null;
        renderList();
      }
    });
    input.addEventListener('blur', () => {
      const value = input.value;
      window.setTimeout(() => {
        if (state.editingId === task.id) commitTitle(task.id, value);
      }, 0);
    });
    titleLine.append(input);
  } else {
    const title = document.createElement('span');
    title.className = 'title';
    title.textContent = task.title;
    title.title = task.title;
    title.addEventListener('dblclick', (event) => {
      event.preventDefault();
      startEdit(task.id);
    });
    titleLine.append(title);
    if (state.view === 'today' && task.carriedDays > 0) {
      const badge = document.createElement('span');
      badge.className = 'carry';
      badge.textContent = `이월 ${task.carriedDays}`;
      titleLine.append(badge);
    }
  }

  const meta = document.createElement('div');
  meta.className = 'meta';
  if (task.status === 'done' && task.completedAt) {
    const doneAt = document.createElement('span');
    doneAt.className = 'done-time';
    doneAt.textContent = formatDoneTime(task.completedAt);
    meta.append(doneAt);
  }
  const shown = task.tags.slice(0, 2);
  for (const tag of shown) {
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = 'chip';
    chip.textContent = `#${tag}`;
    chip.setAttribute('aria-pressed', state.tag === tag ? 'true' : 'false');
    chip.addEventListener('click', (event) => {
      event.stopPropagation();
      state.focusId = task.id;
      state.tag = state.tag === tag ? null : tag;
      renderTagBar();
      renderList();
    });
    meta.append(chip);
  }
  if (task.tags.length > shown.length) {
    const moreTags = document.createElement('span');
    moreTags.className = 'chip';
    moreTags.textContent = `+${task.tags.length - shown.length}`;
    meta.append(moreTags);
  }

  if (state.dueId === task.id) {
    const dateInput = document.createElement('input');
    dateInput.type = 'date';
    dateInput.className = 'due-input';
    dateInput.value = task.due || '';
    dateInput.setAttribute('aria-label', `${task.title} 기한`);
    dateInput.addEventListener('change', () => {
      setDue(task.id, dateInput.value || null);
    });
    dateInput.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        state.dueId = null;
        renderList();
      }
    });
    dateInput.addEventListener('blur', () => {
      window.setTimeout(() => {
        if (state.dueId === task.id) {
          state.dueId = null;
          renderList();
        }
      }, 120);
    });
    meta.append(dateInput);
  } else {
    const due = document.createElement('button');
    due.type = 'button';
    due.className = dueClass(task.due, today, task.status);
    due.dataset.restore = 'due';
    due.textContent = formatDue(task.due, today, task.status);
    due.setAttribute('aria-label', task.due ? `기한 ${task.due}` : '기한 설정');
    due.addEventListener('click', (event) => {
      event.stopPropagation();
      state.focusId = task.id;
      state.dueId = task.id;
      state.menu = null;
      renderList();
      $('list').querySelector('.due-input')?.focus();
    });
    meta.append(due);
  }

  const flag = document.createElement('button');
  flag.type = 'button';
  flag.className = `flag p-${task.priority}`;
  flag.dataset.restore = 'flag';
  flag.dataset.opensMenu = 'priority';
  flag.setAttribute('aria-haspopup', 'menu');
  flag.setAttribute('aria-label', `우선순위 ${PRIORITY_LABEL[task.priority]}`);
  flag.append(flagIcon(task.priority));
  flag.addEventListener('click', (event) => {
    event.stopPropagation();
    toggleMenu(task.id, 'priority');
  });
  meta.append(flag);

  if (task.memo) {
    const memoBtn = document.createElement('button');
    memoBtn.type = 'button';
    memoBtn.className = 'iconbtn has-memo';
    memoBtn.dataset.restore = 'memo';
    memoBtn.append(noteIcon());
    memoBtn.setAttribute('aria-label', '메모');
    memoBtn.setAttribute('aria-expanded', state.memoId === task.id ? 'true' : 'false');
    memoBtn.addEventListener('click', (event) => {
      event.stopPropagation();
      toggleMemo(task.id);
    });
    meta.append(memoBtn);
  }

  const more = document.createElement('button');
  more.type = 'button';
  more.className = 'iconbtn';
  more.dataset.restore = 'more';
  more.dataset.opensMenu = 'more';
  more.textContent = '⋯';
  more.setAttribute('aria-haspopup', 'menu');
  more.setAttribute('aria-label', '더보기');
  more.addEventListener('click', (event) => {
    event.stopPropagation();
    toggleMenu(task.id, 'more');
  });
  meta.append(more);

  main.append(check, titleLine, meta);
  li.append(main);

  if (state.memoId === task.id) li.append(renderMemo(task));
  if (state.menu?.id === task.id) li.append(renderMenu(task));

  li.addEventListener('mousedown', (event) => {
    if (event.target.closest('button, input, textarea, a')) return;
    focusTask(task.id, true);
  });
  li.addEventListener('dblclick', (event) => {
    if (event.target.closest('button, input, textarea, a')) return;
    startEdit(task.id);
  });
  bindDrag(li, task);
  return li;
}

function renderMemo(task) {
  const panel = document.createElement('div');
  panel.className = 'memo';
  const area = document.createElement('textarea');
  area.value = task.memo || '';
  area.maxLength = 5000;
  area.setAttribute('aria-label', `${task.title} 메모`);
  area.addEventListener('blur', () => {
    const value = area.value;
    window.setTimeout(() => commitMemo(task.id, value), 0);
  });
  area.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      state.memoId = null;
      renderList();
    }
  });
  panel.append(area);
  return panel;
}

function renderMenu(task) {
  const menu = document.createElement('div');
  menu.className = 'menu';
  menu.setAttribute('role', 'menu');
  if (state.menu.kind === 'priority') {
    menu.setAttribute('aria-label', '우선순위');
    for (const priority of ['high', 'medium', 'low']) {
      const button = document.createElement('button');
      button.type = 'button';
      button.setAttribute('role', 'menuitemradio');
      button.setAttribute('aria-checked', task.priority === priority ? 'true' : 'false');
      button.textContent = PRIORITY_LABEL[priority];
      button.addEventListener('click', (event) => {
        event.stopPropagation();
        setPriority(task.id, priority);
      });
      menu.append(button);
    }
    return menu;
  }
  menu.setAttribute('aria-label', '할 일 메뉴');
  const items = orderedVisibleTasks();
  const index = items.findIndex((item) => item.id === task.id);
  const filtered = !!(state.query.trim() || state.tag);
  if (state.view !== 'done') {
    menu.append(menuAction('위로', () => moveTask(task.id, -1), filtered || index <= 0));
    menu.append(menuAction('아래로', () => moveTask(task.id, 1), filtered || index < 0 || index >= items.length - 1));
  }
  if (!(task.status === 'open' && task.list === 'today')) menu.append(menuAction('오늘로 이동', () => moveToList(task.id, 'today')));
  if (!(task.status === 'open' && task.list === 'backlog')) menu.append(menuAction('백로그로 이동', () => moveToList(task.id, 'backlog')));
  menu.append(menuAction(task.memo ? '메모 편집' : '메모 추가', () => toggleMemo(task.id)));
  const danger = menuAction('삭제', () => deleteTask(task.id));
  danger.classList.add('danger');
  menu.append(danger);
  return menu;
}

function menuAction(label, onClick, disabled = false) {
  const button = document.createElement('button');
  button.type = 'button';
  button.textContent = label;
  button.disabled = disabled;
  button.addEventListener('click', (event) => {
    event.stopPropagation();
    onClick();
  });
  return button;
}

function bindDrag(li, task) {
  li.addEventListener('dragstart', (event) => {
    if (state.view === 'done' || state.query.trim() || state.tag || state.editingId) {
      event.preventDefault();
      if (state.query.trim() || state.tag) announce('필터를 해제하면 순서를 바꿀 수 있습니다.');
      return;
    }
    if (event.target.closest('button, input, textarea, a')) {
      event.preventDefault();
      return;
    }
    state.dragId = task.id;
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', task.id);
    li.classList.add('is-dragging');
  });
  li.addEventListener('dragover', (event) => {
    if (!state.dragId || state.view === 'done' || state.dragId === task.id) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
    const rect = li.getBoundingClientRect();
    const after = event.clientY > rect.top + rect.height / 2;
    li.dataset.dropAfter = after ? '1' : '0';
    li.classList.toggle('is-drop-after', after);
    li.classList.toggle('is-drop-before', !after);
  });
  li.addEventListener('drop', (event) => {
    event.preventDefault();
    const from = state.dragId || event.dataTransfer.getData('text/plain');
    const after = li.dataset.dropAfter === '1';
    state.dragId = null;
    if (from && from !== task.id) reorderTo(from, task.id, after);
  });
  li.addEventListener('dragleave', () => {
    li.classList.remove('is-drop-before', 'is-drop-after');
  });
  li.addEventListener('dragend', () => {
    state.dragId = null;
    document.querySelectorAll('.task').forEach((row) => {
      row.classList.remove('is-dragging', 'is-drop-before', 'is-drop-after');
    });
  });
}

function renderHideButton() {
  const button = $('hideDoneBtn');
  if (!button) return;
  button.setAttribute('aria-pressed', state.hideCompleted ? 'true' : 'false');
}

function renderDynamic() {
  renderTabs();
  renderCounts();
  renderProgress();
  renderTagBar();
  renderHideButton();
  renderList();
  renderDataLoc();
}

function focusTask(id, domFocus) {
  state.focusId = id;
  document.querySelectorAll('.task').forEach((row) => {
    const on = row.dataset.id === id;
    row.classList.toggle('is-focused', on);
    row.tabIndex = on ? 0 : -1;
  });
  if (domFocus) document.querySelector(`.task[data-id="${CSS.escape(id)}"]`)?.focus();
}

function moveFocus(delta) {
  const items = orderedVisibleTasks();
  if (!items.length) return;
  let index = items.findIndex((task) => task.id === state.focusId);
  if (index < 0) index = delta > 0 ? -1 : items.length;
  index = Math.max(0, Math.min(items.length - 1, index + delta));
  focusTask(items[index].id, true);
}

function markDirty() {
  state.dirty = true;
  if (state.doc) state.doc.updatedAt = new Date().toISOString();
  persistCache();
  if (state.flushing) {
    state.again = true;
    return;
  }
  scheduleSave();
}

function scheduleSave() {
  state.dirty = true;
  persistCache();
  if (!navigator.onLine) {
    setSync('offline', '오프라인입니다. 연결되면 저장합니다.');
    return;
  }
  setSync('saving');
  window.clearTimeout(state.timer);
  state.timer = window.setTimeout(() => { void flush(); }, SAVE_DELAY);
}

function applyCarryIfNeeded() {
  if (!state.doc) return false;
  const result = applyCarryOver(state.doc, seoulDate(new Date()));
  if (!result.changed) return false;
  state.doc = result.doc;
  state.dirty = true;
  return true;
}

async function flush() {
  if (!state.doc || !state.token || !client) return;
  if (state.flushing) {
    state.again = true;
    return;
  }
  if (!state.dirty) {
    if (state.sync === 'saving') setSync(navigator.onLine ? 'saved' : 'offline');
    return;
  }
  if (!navigator.onLine) {
    setSync('offline', '오프라인입니다. 연결되면 저장합니다.');
    persistCache();
    return;
  }
  state.flushing = true;
  state.again = false;
  window.clearTimeout(state.timer);
  setSync('saving');
  const sent = clone(state.doc);
  const sha = state.sha;
  try {
    const result = await client.writeFile({ sha, doc: sent });
    state.sha = result.sha;
    if (JSON.stringify(state.doc) === JSON.stringify(sent)) {
      state.dirty = false;
      state.baseTasks = clone(state.doc.tasks);
      state.deletedAt = {};
      setSync('saved');
    } else state.again = true;
    persistCache();
  } catch (error) {
    if (error?.conflict) {
      setSync('conflict');
      try {
        const remote = await client.readFile();
        if (remote.missing) state.sha = null;
        else {
          state.doc = mergeDocs(
            state.doc,
            remote.doc,
            { version: 1, updatedAt: state.doc.updatedAt, rolloverDate: state.doc.rolloverDate, tasks: state.baseTasks },
            state.deletedAt,
          );
          state.sha = remote.sha;
        }
        applyCarryIfNeeded();
        state.dirty = true;
        renderDynamic();
        announce('원격 변경과 병합했습니다.');
        const retrySent = clone(state.doc);
        const retry = await client.writeFile({ sha: state.sha, doc: retrySent });
        state.sha = retry.sha;
        if (JSON.stringify(state.doc) === JSON.stringify(retrySent)) {
          state.dirty = false;
          state.baseTasks = clone(state.doc.tasks);
          state.deletedAt = {};
          setSync('saved');
        } else state.again = true;
        persistCache();
      } catch (retryError) {
        persistCache();
        handleSyncError(retryError);
      }
    } else {
      persistCache();
      handleSyncError(error);
    }
  } finally {
    state.flushing = false;
    if (state.again && state.dirty) {
      state.again = false;
      scheduleSave();
    }
  }
}

function handleSyncError(error) {
  if (error?.status === 401) {
    forceLogout('토큰이 올바르지 않거나 만료되었습니다.');
    return;
  }
  if (error?.conflict) {
    setSync('conflict', '원격 변경과 합치지 못했습니다. 저장을 다시 눌러 주세요.');
    return;
  }
  if (error?.offline || !navigator.onLine) {
    setSync('offline', '오프라인입니다. 이 기기에 임시 저장했습니다.');
    return;
  }
  setSync('error', error?.message || '저장에 실패했습니다.');
}

async function manualSync() {
  if (!state.doc || !client) return;
  if (!navigator.onLine) {
    setSync('offline', '오프라인입니다. 연결되면 저장합니다.');
    return;
  }
  if (state.dirty) {
    window.clearTimeout(state.timer);
    await flush();
    return;
  }
  setSync('saving');
  try {
    const remote = await client.readFile();
    if (remote.missing) {
      setSync('saved');
      return;
    }
    if (remote.sha !== state.sha) {
      const before = JSON.stringify(state.doc.tasks);
      state.doc = mergeDocs(
        state.doc,
        remote.doc,
        { version: 1, updatedAt: state.doc.updatedAt, rolloverDate: state.doc.rolloverDate, tasks: state.baseTasks },
        state.deletedAt,
      );
      state.sha = remote.sha;
      const carried = applyCarryIfNeeded();
      const changed = carried || JSON.stringify(state.doc.tasks) !== before;
      renderDynamic();
      if (changed) {
        state.dirty = true;
        announce('원격 변경과 병합했습니다.');
        await flush();
      } else {
        state.dirty = false;
        state.baseTasks = clone(state.doc.tasks);
        setSync('saved');
        persistCache();
        announce('이미 최신 상태입니다.');
      }
    } else {
      setSync('saved');
      announce('이미 최신 상태입니다.');
    }
  } catch (error) {
    handleSyncError(error);
  }
}

function ensureClient() {
  client = createClient({
    fetchImpl: (...args) => window.fetch(...args),
    getToken: () => state.token,
    getSettings: () => state.settings,
  });
}

async function openWorkspace() {
  const cache = readCache();
  if (cache) {
    state.doc = cache.doc;
    state.sha = cache.sha || null;
    state.baseTasks = Array.isArray(cache.baseTasks) ? cache.baseTasks : clone(cache.doc.tasks);
    state.deletedAt = cache.deletedAt && typeof cache.deletedAt === 'object' ? { ...cache.deletedAt } : {};
    state.dirty = !!cache.dirty;
    state.ready = true;
    showMain();
    renderUser();
    renderDynamic();
  } else {
    state.ready = false;
    showMain();
    renderUser();
    renderDynamic();
  }

  if (!navigator.onLine) {
    if (!state.doc) {
      state.doc = emptyDoc();
      state.baseTasks = [];
      state.deletedAt = {};
      state.dirty = false;
    }
    applyCarryIfNeeded();
    state.ready = true;
    renderDynamic();
    setSync('offline', state.doc.tasks.length ? '오프라인입니다. 이전에 받아 둔 목록을 보여 줍니다.' : '오프라인입니다.');
    persistCache();
    return;
  }

  setSync('saving', cache ? '' : '불러오는 중…');
  try {
    const remote = await client.readFile();
    const localDirty = state.dirty && state.doc ? clone(state.doc) : null;
    const localDeleted = { ...state.deletedAt };
    const localBase = state.baseTasks || [];
    if (remote.missing) {
      if (!localDirty) {
        state.doc = emptyDoc();
        state.sha = null;
        state.baseTasks = [];
        state.deletedAt = {};
        state.dirty = false;
      } else {
        state.doc = localDirty;
        state.sha = null;
        state.dirty = true;
      }
    } else if (localDirty) {
      state.doc = mergeDocs(
        localDirty,
        remote.doc,
        { version: 1, updatedAt: localDirty.updatedAt, rolloverDate: localDirty.rolloverDate, tasks: localBase },
        localDeleted,
      );
      state.sha = remote.sha;
      state.dirty = true;
      announce('원격 변경과 병합했습니다.');
    } else {
      state.doc = remote.doc;
      state.sha = remote.sha;
      state.baseTasks = clone(remote.doc.tasks);
      state.deletedAt = {};
      state.dirty = false;
    }
    if (applyCarryIfNeeded()) state.dirty = true;
    state.ready = true;
    showMain();
    renderUser();
    renderDynamic();
    if (state.dirty) scheduleSave();
    else {
      setSync('saved');
      persistCache();
    }
  } catch (error) {
    if (error?.status === 401) {
      forceLogout('토큰이 올바르지 않거나 만료되었습니다.');
      return;
    }
    if (!state.doc) {
      state.doc = emptyDoc();
      state.ready = true;
      renderDynamic();
    } else state.ready = true;
    renderDynamic();
    setSync(error?.offline ? 'offline' : 'error', error?.message || '목록을 불러오지 못했습니다.');
  }
}

async function bootSession() {
  ensureClient();
  if (!navigator.onLine) {
    const cachedUser = readUser();
    if (!cachedUser && !readCache()) {
      showLogin('오프라인이고 이 기기에 저장된 세션이 없습니다.');
      return;
    }
    state.user = cachedUser;
    await openWorkspace();
    return;
  }
  try {
    state.user = await client.user();
    storeUser(state.user);
  } catch (error) {
    if (error?.offline) {
      state.user = readUser();
      if (!state.user && !readCache()) {
        showLogin(error.message);
        return;
      }
      await openWorkspace();
      return;
    }
    clearAuth();
    state.token = '';
    showLogin(error?.status === 401 ? '토큰이 올바르지 않습니다.' : error.message);
    return;
  }
  await openWorkspace();
}

async function login(token, persist) {
  state.token = token;
  ensureClient();
  const button = $('loginBtn');
  button.disabled = true;
  button.textContent = '확인 중…';
  button.setAttribute('aria-busy', 'true');
  try {
    const user = await client.user();
    storeToken(token, persist);
    storeUser(user);
    state.user = user;
    $('token').value = '';
    $('loginError').textContent = '';
    $('token').removeAttribute('aria-invalid');
    await openWorkspace();
  } catch (error) {
    state.token = '';
    const message = error?.status === 401 ? '토큰이 올바르지 않습니다.' : (error?.message || '로그인에 실패했습니다.');
    $('loginError').textContent = message;
    $('token').setAttribute('aria-invalid', 'true');
  } finally {
    button.disabled = false;
    button.textContent = '로그인';
    button.removeAttribute('aria-busy');
  }
}

function forceLogout(message) {
  window.clearTimeout(state.timer);
  window.clearTimeout(state.undoTimer);
  clearAuth();
  state.token = '';
  state.user = null;
  state.doc = null;
  state.ready = false;
  state.dirty = false;
  hideToast();
  showLogin(message);
}

function logout() {
  if (state.dirty) {
    const ok = window.confirm('아직 GitHub에 저장되지 않은 변경이 있습니다. 로그아웃하면 이 기기의 임시 저장도 지웁니다. 계속할까요?');
    if (!ok) return;
  }
  window.clearTimeout(state.timer);
  window.clearTimeout(state.undoTimer);
  clearAuth();
  clearCurrentCache();
  state.token = '';
  state.user = null;
  state.doc = null;
  state.sha = null;
  state.ready = false;
  state.dirty = false;
  state.baseTasks = [];
  state.deletedAt = {};
  state.undo = null;
  hideToast();
  showLogin('');
}

function submitComposer() {
  if (addLock || !state.doc) return;
  const parsed = parseQuickAdd($('composer').value);
  if (!parsed.title) {
    announce('할 일 제목을 입력해 주세요.');
    return;
  }
  addLock = true;
  window.setTimeout(() => { addLock = false; }, 80);
  const list = state.view === 'backlog' ? 'backlog' : 'today';
  const now = new Date().toISOString();
  const siblings = state.doc.tasks.filter((task) => task.status === 'open' && task.list === list);
  const minOrder = siblings.reduce((min, task) => Math.min(min, task.order), 0);
  const task = {
    id: newId(),
    title: parsed.title,
    memo: '',
    priority: parsed.priority,
    due: parsed.due,
    tags: parsed.tags,
    list,
    status: 'open',
    order: siblings.length ? minOrder - 1 : 0,
    createdAt: now,
    updatedAt: now,
    completedAt: null,
    carriedDays: 0,
  };
  state.doc.tasks.push(task);
  state.focusId = task.id;
  if (state.view === 'done') state.view = 'today';
  $('composer').value = '';
  markDirty();
  renderDynamic();
  announce('할 일을 추가했습니다.');
}

function startEdit(id) {
  if (!findTask(id)) return;
  state.editingId = id;
  state.focusId = id;
  state.menu = null;
  state.dueId = null;
  state.selectTitle = true;
  renderList();
}

function commitTitle(id, value) {
  if (state.editingId !== id) return;
  const task = findTask(id);
  state.editingId = null;
  const title = String(value || '').replace(/\s+/g, ' ').trim().slice(0, 500);
  if (task && title && title !== task.title) {
    task.title = title;
    task.updatedAt = new Date().toISOString();
    markDirty();
    announce('제목을 수정했습니다.');
  } else if (!title) announce('제목은 비울 수 없습니다.');
  renderDynamic();
}

function commitMemo(id, value) {
  const task = findTask(id);
  if (!task) return;
  const memo = String(value || '').slice(0, 5000);
  if (memo === task.memo) return;
  task.memo = memo;
  task.updatedAt = new Date().toISOString();
  markDirty();
  renderDynamic();
}

function toggleMemo(id) {
  state.memoId = state.memoId === id ? null : id;
  state.menu = null;
  state.focusId = id;
  renderList();
  if (state.memoId === id) $('list').querySelector('.memo textarea')?.focus();
}

function toggleMenu(id, kind) {
  state.focusId = id;
  if (state.menu?.id === id && state.menu.kind === kind) state.menu = null;
  else state.menu = { id, kind };
  renderList();
}

function setPriority(id, priority) {
  const task = findTask(id);
  state.menu = null;
  if (!task) return;
  state.focusId = id;
  if (task.priority !== priority) {
    task.priority = priority;
    task.updatedAt = new Date().toISOString();
    markDirty();
    announce(`우선순위를 ${PRIORITY_LABEL[priority]}으로 바꿨습니다.`);
  }
  renderDynamic();
}

function setDue(id, due) {
  const task = findTask(id);
  state.dueId = null;
  if (!task) return;
  const next = due && isYmd(due) ? due : null;
  if (next !== task.due) {
    task.due = next;
    task.updatedAt = new Date().toISOString();
    markDirty();
  }
  state.focusId = id;
  renderDynamic();
}

function toggleComplete(id) {
  const task = findTask(id);
  if (!task || state.animatingId) return;
  const wantDone = task.status !== 'done';
  const apply = () => {
    state.animatingId = null;
    const current = findTask(id);
    if (!current) return;
    if (wantDone) {
      current.status = 'done';
      current.completedAt = new Date().toISOString();
    } else {
      current.status = 'open';
      current.completedAt = null;
    }
    current.updatedAt = new Date().toISOString();
    state.focusId = id;
    markDirty();
    renderDynamic();
    announce(wantDone ? '완료했습니다.' : '완료를 해제했습니다.');
    $( 'list' ).querySelector(`[data-id="${CSS.escape(id)}"] [data-restore="check"]`)?.focus();
  };
  if (wantDone && !reduceMotion()) {
    state.animatingId = id;
    const row = document.querySelector(`.task[data-id="${CSS.escape(id)}"]`);
    row?.classList.add('is-completing');
    const box = row?.querySelector('[data-restore="check"]');
    if (box) box.checked = true;
    window.setTimeout(apply, 280);
  } else apply();
}

function deleteTask(id) {
  if (!state.doc) return;
  const index = state.doc.tasks.findIndex((task) => task.id === id);
  if (index < 0) return;
  const [task] = state.doc.tasks.splice(index, 1);
  state.deletedAt[id] = new Date().toISOString();
  state.undo = clone(task);
  state.menu = null;
  state.editingId = null;
  if (state.memoId === id) state.memoId = null;
  const visible = orderedVisibleTasks();
  state.focusId = visible[0]?.id || null;
  markDirty();
  renderDynamic();
  showToast(task);
  announce('할 일을 삭제했습니다. 실행 취소할 수 있습니다.');
}

function showToast(task) {
  window.clearTimeout(state.undoTimer);
  $('toastText').textContent = `‘${task.title}’ 삭제됨`;
  $('toast').hidden = false;
  state.undoTimer = window.setTimeout(() => {
    state.undo = null;
    hideToast();
  }, UNDO_MS);
}

function hideToast() {
  $('toast').hidden = true;
  $('toastText').textContent = '';
}

function undoDelete() {
  if (!state.undo || !state.doc) return;
  const task = state.undo;
  delete state.deletedAt[task.id];
  state.undo = null;
  window.clearTimeout(state.undoTimer);
  state.doc.tasks.push(task);
  state.focusId = task.id;
  hideToast();
  markDirty();
  renderDynamic();
  announce('삭제를 취소했습니다.');
}

function moveToList(id, list) {
  const task = findTask(id);
  state.menu = null;
  if (!task) return;
  state.focusId = id;
  if (task.status === 'open' && task.list === list) {
    renderList();
    announce(list === 'today' ? '이미 오늘에 있습니다.' : '이미 백로그에 있습니다.');
    return;
  }
  const siblings = state.doc.tasks.filter((item) => item.id !== id && item.status === 'open' && item.list === list);
  const minOrder = siblings.reduce((min, item) => Math.min(min, item.order), 0);
  task.list = list;
  task.status = 'open';
  task.completedAt = null;
  task.order = siblings.length ? minOrder - 1 : 0;
  task.updatedAt = new Date().toISOString();
  markDirty();
  renderDynamic();
  announce(list === 'today' ? '오늘로 옮겼습니다.' : '백로그로 옮겼습니다.');
}

function applyOrder(ids) {
  const now = new Date().toISOString();
  let changed = false;
  ids.forEach((id, index) => {
    const task = findTask(id);
    if (!task || task.order === index) return;
    task.order = index;
    task.updatedAt = now;
    changed = true;
  });
  if (!changed) return;
  markDirty();
  renderList();
  if (state.focusId) focusTask(state.focusId, true);
}

function moveTask(id, delta) {
  state.menu = null;
  state.focusId = id;
  if (state.view === 'done') return;
  if (state.query.trim() || state.tag) {
    announce('필터를 해제하면 순서를 바꿀 수 있습니다.');
    renderList();
    return;
  }
  const items = orderedVisibleTasks().filter((item) => (item.status === 'done') === (findTask(id)?.status === 'done'));
  const index = items.findIndex((task) => task.id === id);
  const next = index + delta;
  if (index < 0 || next < 0 || next >= items.length) {
    renderList();
    return;
  }
  const ids = items.map((task) => task.id);
  const [moved] = ids.splice(index, 1);
  ids.splice(next, 0, moved);
  applyOrder(ids);
}

function reorderTo(fromId, toId, after) {
  if (state.view === 'done' || state.query.trim() || state.tag) return;
  const fromTask = findTask(fromId);
  const toTask = findTask(toId);
  if (!fromTask || !toTask || (fromTask.status === 'done') !== (toTask.status === 'done')) return;
  const ids = orderedVisibleTasks().filter((task) => (task.status === 'done') === (fromTask.status === 'done')).map((task) => task.id);
  const from = ids.indexOf(fromId);
  if (from < 0) return;
  ids.splice(from, 1);
  let to = ids.indexOf(toId);
  if (to < 0) return;
  if (after) to += 1;
  ids.splice(to, 0, fromId);
  state.focusId = fromId;
  applyOrder(ids);
}

function setView(view) {
  if (!['today', 'backlog', 'done'].includes(view) || state.view === view) return;
  state.view = view;
  state.editingId = null;
  state.menu = null;
  state.dueId = null;
  renderDynamic();
}

function exportJson() {
  if (!state.doc) return;
  const doc = {
    version: 1,
    updatedAt: state.doc.updatedAt,
    rolloverDate: state.doc.rolloverDate,
    tasks: state.doc.tasks,
  };
  const blob = new Blob([`${JSON.stringify(doc, null, 2)}\n`], { type: 'application/json' });
  const link = document.createElement('a');
  const url = URL.createObjectURL(blob);
  link.href = url;
  link.download = `todos-${seoulDate(new Date())}.json`;
  link.click();
  URL.revokeObjectURL(url);
}

function applyImport(mode) {
  const incoming = state.pendingImport;
  if (!incoming || !state.doc) return;
  const now = new Date().toISOString();
  if (mode === 'replace') {
    const nextIds = new Set(incoming.tasks.map((task) => task.id));
    for (const task of state.doc.tasks) {
      if (!nextIds.has(task.id)) state.deletedAt[task.id] = now;
    }
    for (const id of nextIds) delete state.deletedAt[id];
    state.doc = {
      version: 1,
      updatedAt: now,
      rolloverDate: incoming.rolloverDate || state.doc.rolloverDate || seoulDate(new Date()),
      tasks: incoming.tasks.map((task) => clone(task)),
    };
  } else {
    state.doc = validateDoc({
      version: 1,
      updatedAt: now,
      rolloverDate: laterYmd(state.doc.rolloverDate, incoming.rolloverDate),
      tasks: mergeByUpdatedAt(state.doc.tasks, incoming.tasks),
    });
  }
  applyCarryIfNeeded();
  state.dirty = true;
  state.pendingImport = null;
  $('importDialog').close();
  scheduleSave();
  renderDynamic();
  announce(mode === 'replace' ? '목록을 파일로 교체했습니다.' : '파일을 현재 목록과 병합했습니다.');
}

function openSettings() {
  const settings = state.settings;
  $('setOwner').value = settings.owner;
  $('setRepo').value = settings.repo;
  $('setBranch').value = settings.branch;
  $('setPath').value = settings.path;
  $('settingsError').textContent = '';
  $('settingsDialog').showModal();
}

async function applySettings(event) {
  event.preventDefault();
  const next = {
    owner: $('setOwner').value.trim(),
    repo: $('setRepo').value.trim(),
    branch: $('setBranch').value.trim(),
    path: $('setPath').value.trim(),
  };
  const error = validateSettings(next);
  if (error) {
    $('settingsError').textContent = error;
    return;
  }
  if (sameSettings(next, state.settings)) {
    $('settingsDialog').close();
    return;
  }
  if (state.dirty) {
    await flush();
    if (state.dirty) {
      $('settingsError').textContent = '현재 변경을 저장하지 못했습니다. 연결을 확인한 뒤 다시 시도해 주세요.';
      return;
    }
  }
  state.settings = next;
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(next));
  state.doc = null;
  state.sha = null;
  state.ready = false;
  state.baseTasks = [];
  state.deletedAt = {};
  state.dirty = false;
  $('settingsDialog').close();
  ensureClient();
  await openWorkspace();
}

function isTypingTarget(element) {
  if (!element || element.nodeType !== 1) return false;
  if (element.isContentEditable) return true;
  const tag = element.tagName;
  if (tag === 'TEXTAREA' || tag === 'SELECT') return true;
  if (tag === 'INPUT') {
    const type = (element.getAttribute('type') || 'text').toLowerCase();
    return !['checkbox', 'radio', 'button', 'submit', 'file', 'range'].includes(type);
  }
  return false;
}

function onKeyDown(event) {
  if (event.isComposing || event.keyCode === 229) return;
  if ($('main').hidden) return;
  if (document.querySelector('dialog[open]')) return;
  if (event.key === 'Escape') {
    if (state.menu || state.dueId) {
      state.menu = null;
      state.dueId = null;
      renderList();
    }
    return;
  }
  if (isTypingTarget(event.target)) return;
  const onControl = !!event.target.closest?.('button, a');
  const onCheck = event.target.matches?.('input[type="checkbox"]');

  if (event.metaKey || event.ctrlKey) {
    if (event.code === 'KeyZ' && !event.shiftKey && !event.altKey) {
      event.preventDefault();
      undoDelete();
    }
    return;
  }
  if (event.altKey) {
    if (event.code === 'ArrowDown' || event.code === 'KeyJ') {
      event.preventDefault();
      if (state.focusId) moveTask(state.focusId, 1);
    } else if (event.code === 'ArrowUp' || event.code === 'KeyK') {
      event.preventDefault();
      if (state.focusId) moveTask(state.focusId, -1);
    }
    return;
  }
  if (event.code === 'KeyN' && !event.shiftKey) {
    event.preventDefault();
    $('composer').focus();
    return;
  }
  if (event.code === 'Slash') {
    event.preventDefault();
    if (event.shiftKey) $('helpDialog').showModal();
    else {
      $('search').focus();
      $('search').select();
    }
    return;
  }
  if (event.code === 'KeyJ' || event.code === 'ArrowDown') {
    event.preventDefault();
    moveFocus(1);
    return;
  }
  if (event.code === 'KeyK' || event.code === 'ArrowUp') {
    event.preventDefault();
    moveFocus(-1);
    return;
  }
  if (event.code === 'Space') {
    if (onControl || onCheck) return;
    event.preventDefault();
    if (state.focusId) toggleComplete(state.focusId);
    return;
  }
  if (event.key === 'Enter') {
    if (onControl || onCheck) return;
    if (state.focusId) {
      event.preventDefault();
      startEdit(state.focusId);
    }
    return;
  }
  if (event.code === 'KeyX' && state.focusId) {
    event.preventDefault();
    toggleComplete(state.focusId);
    return;
  }
  if (event.code === 'Digit1' || event.code === 'Digit2' || event.code === 'Digit3') {
    if (!state.focusId) return;
    event.preventDefault();
    setPriority(state.focusId, { Digit1: 'high', Digit2: 'medium', Digit3: 'low' }[event.code]);
    return;
  }
  if (event.code === 'KeyT' && state.focusId) {
    event.preventDefault();
    moveToList(state.focusId, 'today');
    return;
  }
  if (event.code === 'KeyB' && state.focusId) {
    event.preventDefault();
    moveToList(state.focusId, 'backlog');
    return;
  }
  if ((event.key === 'Delete' || event.key === 'Backspace') && state.focusId) {
    event.preventDefault();
    deleteTask(state.focusId);
  }
}

function rolloverTick() {
  if (!state.doc || $('main').hidden) return;
  fillDate();
  if (state.doc.rolloverDate && state.doc.rolloverDate < seoulDate(new Date())) {
    if (!applyCarryIfNeeded()) return;
    renderDynamic();
    if (navigator.onLine) scheduleSave();
    else {
      setSync('offline', '날짜가 바뀌어 오늘 할 일을 이월했습니다. 연결되면 저장합니다.');
      persistCache();
    }
  }
}

function bind() {
  $('loginForm').addEventListener('submit', (event) => {
    event.preventDefault();
    const token = $('token').value.trim();
    if (!token) {
      $('loginError').textContent = '토큰을 입력해 주세요.';
      return;
    }
    void login(token, $('persist').checked);
  });
  $('logoutBtn').addEventListener('click', logout);
  $('saveBtn').addEventListener('click', () => { void manualSync(); });
  $('themeBtn').addEventListener('click', () => {
    const index = THEME_ORDER.indexOf(state.theme);
    const next = THEME_ORDER[(index + 1) % THEME_ORDER.length];
    localStorage.setItem(THEME_KEY, next);
    applyTheme(next);
    renderThemeButton();
  });
  $('settingsBtn').addEventListener('click', openSettings);
  $('hideDoneBtn').addEventListener('click', () => {
    state.hideCompleted = !state.hideCompleted;
    localStorage.setItem(HIDE_DONE_KEY, state.hideCompleted ? '1' : '0');
    renderDynamic();
    announce(state.hideCompleted ? '완료한 항목을 숨겼습니다.' : '완료한 항목을 표시합니다.');
  });
  $('helpBtn').addEventListener('click', () => $('helpDialog').showModal());
  $('settingsForm').addEventListener('submit', (event) => { void applySettings(event); });
  $('exportBtn').addEventListener('click', exportJson);
  $('importBtn').addEventListener('click', () => $('importFile').click());
  $('importFile').addEventListener('change', async () => {
    const file = $('importFile').files?.[0];
    $('importFile').value = '';
    if (!file) return;
    if (file.size > 2_000_000) {
      $('settingsError').textContent = '파일이 너무 큽니다.';
      return;
    }
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      state.pendingImport = validateDoc(data);
      $('importSummary').textContent = `할 일 ${state.pendingImport.tasks.length}개를 읽었습니다. 현재 목록과 병합하거나, 이 파일로 교체할 수 있습니다.`;
      $('importError').textContent = '';
      if ($('settingsDialog').open) $('settingsDialog').close();
      $('importDialog').showModal();
    } catch (error) {
      state.pendingImport = null;
      const message = error instanceof SyntaxError ? 'JSON 형식이 아닙니다.' : (error.message || '파일을 읽지 못했습니다.');
      if ($('settingsDialog').open) $('settingsError').textContent = message;
      else {
        $('importSummary').textContent = '';
        $('importError').textContent = message;
        $('importDialog').showModal();
      }
    }
  });
  $('importCancel').addEventListener('click', () => {
    state.pendingImport = null;
    $('importDialog').close();
  });
  $('importMerge').addEventListener('click', () => applyImport('merge'));
  $('importReplace').addEventListener('click', () => applyImport('replace'));
  document.querySelectorAll('[data-close-dialog]').forEach((button) => {
    button.addEventListener('click', () => button.closest('dialog')?.close());
  });
  document.querySelectorAll('dialog').forEach((dialog) => {
    dialog.addEventListener('click', (event) => {
      if (event.target === dialog) dialog.close();
    });
  });
  $('undoBtn').addEventListener('click', undoDelete);
  $('composer').addEventListener('keydown', (event) => {
    if (event.isComposing || event.keyCode === 229) return;
    if (event.key === 'Enter') {
      event.preventDefault();
      submitComposer();
    } else if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      $('composer').blur();
    }
  });
  $('composerForm').addEventListener('submit', (event) => {
    event.preventDefault();
    submitComposer();
  });
  $('search').addEventListener('input', () => {
    state.query = $('search').value;
    renderList();
    renderTagBar();
  });
  $('search').addEventListener('keydown', (event) => {
    if (event.key !== 'Escape') return;
    event.stopPropagation();
    if ($('search').value) {
      $('search').value = '';
      state.query = '';
      renderList();
      renderTagBar();
    } else $('search').blur();
  });
  $('main').querySelector('[role="tablist"]').addEventListener('keydown', (event) => {
    if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') return;
    const tabs = [...event.currentTarget.querySelectorAll('[role="tab"]')];
    const index = tabs.indexOf(document.activeElement);
    if (index < 0) return;
    event.preventDefault();
    event.stopPropagation();
    const dir = event.key === 'ArrowRight' ? 1 : -1;
    const next = tabs[(index + dir + tabs.length) % tabs.length];
    setView(next.dataset.view);
    next.focus();
  });
  for (const tab of document.querySelectorAll('[role="tab"]')) {
    tab.addEventListener('click', () => setView(tab.dataset.view));
  }
  $('list').addEventListener('focusin', (event) => {
    const row = event.target.closest?.('.task');
    if (!row?.dataset.id) return;
    state.focusId = row.dataset.id;
    document.querySelectorAll('.task').forEach((item) => {
      const on = item.dataset.id === state.focusId;
      item.classList.toggle('is-focused', on);
      if (document.activeElement !== item) item.tabIndex = on ? 0 : -1;
      else item.tabIndex = 0;
    });
  });
  document.addEventListener('click', (event) => {
    if (!state.menu) return;
    if (event.target.closest?.('.menu') || event.target.closest?.('[data-opens-menu]')) return;
    state.menu = null;
    renderList();
  });
  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('online', () => {
    if (!state.token || !state.doc) return;
    if (state.dirty) void flush();
    else if (state.sync === 'offline') setSync('saved');
  });
  window.addEventListener('offline', () => {
    if (state.token) setSync('offline', '오프라인입니다. 변경은 이 기기에 남습니다.');
  });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') rolloverTick();
  });
  window.setInterval(rolloverTick, 60000);
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
    if (state.theme === 'system') applyTheme('system');
  });
}

function boot() {
  bind();
  const pref = localStorage.getItem(THEME_KEY) || 'system';
  applyTheme(THEME_ORDER.includes(pref) ? pref : 'system');
  renderThemeButton();
  state.settings = loadSettings();
  state.hideCompleted = localStorage.getItem(HIDE_DONE_KEY) === '1';
  renderHideButton();
  const persisted = localStorage.getItem(PERSIST_KEY);
  $('persist').checked = persisted !== '0';
  const token = readToken();
  if (!token) {
    showLogin('');
    return;
  }
  state.token = token;
  state.user = readUser();
  void bootSession();
}

if (typeof document !== 'undefined') boot();
