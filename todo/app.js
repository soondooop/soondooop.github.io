/**
 * 업무 체크.
 * 할 일은 GitHub Contents API로 비공개 저장소에 저장한다.
 * 토큰은 이 브라우저의 localStorage/sessionStorage에만 둔다. 로그나 커밋에 남기지 않는다.
 */

import {
  CATEGORY_COLORS,
  addDays,
  isOverdue,
  isYmd,
  monthGrid,
  normalizeRepeat,
  parseQuickAdd,
  planNextTask,
  planNotifications,
  projectOccurrences,
  ruleLabel,
  seoulDate,
  thisWeekday,
  nextWeekMonday,
  weekday,
} from './model.js';
import { holidayLabel } from './holidays.js';

export { parseQuickAdd };

const TZ = 'Asia/Seoul';
const SAVE_DELAY = 1500;
const UNDO_MS = 5000;

const TOKEN_KEY = 'todo.auth.token';
const USER_KEY = 'todo.auth.user';
const PERSIST_KEY = 'todo.auth.persist';
const SETTINGS_KEY = 'todo.settings';
const THEME_KEY = 'todo.theme';
const SKIN_KEY = 'todo.skin';
const BG_KEY = 'todo.bg';
const BG_CUSTOM_KEY = 'todo.bgCustom';
const HIDE_DONE_KEY = 'todo.hideCompleted';
const SORT_KEY = 'todo.sort';
const GROUP_KEY = 'todo.groupCategory';
const OVERDUE_KEY = 'todo.dueOverdue';
const NOTIFY_KEY = 'todo.notify';
const BRIEF_KEY = 'todo.briefingTime';
const NOTIFIED_KEY = 'todo.notified';

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
const SKINS = ['paper', 'pastel', 'focus'];
const SKIN_LABEL = { paper: '페이퍼', pastel: '파스텔', focus: '다크 포커스' };
const BG_IDS = ['lavender', 'mint', 'peach', 'cream', 'ocean', 'mono'];
const SKIN_BG = { pastel: 'lavender', paper: 'cream', focus: 'ocean' };

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
  skin: 'pastel',
  bg: 'lavender',
  bgCustom: false,
  hideCompleted: false,
  sort: 'manual',
  groupByCategory: false,
  dueOnlyOverdue: false,
  categoryFilter: null,
  collapsedGroups: {},
  calendarYear: null,
  calendarMonth: null,
  calendarDay: null,
  calendarMode: 'all',
  paintedCalendarMode: null,
  expandedIds: new Set(),
  cardId: null,
  notifyEnabled: false,
  briefingTime: '09:00',
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

export { seoulDate, addDays, isYmd };

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

function normalizeTask(raw, index) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new Error(`할 일 ${index + 1}이 객체가 아닙니다.`);
  }
  const id = typeof raw.id === 'string' ? raw.id.trim() : '';
  if (!id || id.length > 140 || /\s/.test(id)) throw new Error(`할 일 ${index + 1}의 id가 올바르지 않습니다.`);
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
  const dueTime = typeof raw.dueTime === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(raw.dueTime) ? raw.dueTime : null;
  const reminder = ['at', '10m', '30m', '1h', '1d9'].includes(raw.reminder) ? raw.reminder : null;
  const seriesId = typeof raw.seriesId === 'string' && raw.seriesId.trim() && raw.seriesId.trim().length <= 80
    ? raw.seriesId.trim()
    : null;
  const occurrenceDate = typeof raw.occurrenceDate === 'string' && isYmd(raw.occurrenceDate) ? raw.occurrenceDate : null;
  const categoryId = typeof raw.categoryId === 'string' && raw.categoryId.trim() ? raw.categoryId.trim() : null;
  return {
    id,
    title: title.slice(0, 500),
    memo: typeof raw.memo === 'string' ? raw.memo.slice(0, 5000) : '',
    priority,
    due,
    dueTime,
    tags,
    list,
    status,
    order,
    createdAt,
    updatedAt,
    completedAt,
    carriedDays,
    repeat: normalizeRepeat(raw.repeat),
    seriesId,
    occurrenceDate,
    reminder,
    categoryId,
  };
}

function normalizeCategories(raw) {
  if (!Array.isArray(raw)) return [];
  const seen = new Set();
  const categories = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const id = typeof item.id === 'string' ? item.id.trim() : '';
    const name = typeof item.name === 'string' ? item.name.replace(/\s+/g, ' ').trim().slice(0, 24) : '';
    if (!id || !name || seen.has(id) || id.length > 40) continue;
    seen.add(id);
    const color = CATEGORY_COLORS.includes(item.color) ? item.color : CATEGORY_COLORS[categories.length % CATEGORY_COLORS.length];
    categories.push({ id, name, color });
    if (categories.length >= 40) break;
  }
  return categories;
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
  return { version: 2, updatedAt, rolloverDate, categories: normalizeCategories(input.categories), tasks };
}

export function emptyDoc(today = todayKey(), now = new Date().toISOString()) {
  return { version: 2, updatedAt: now, rolloverDate: today, categories: [], tasks: [] };
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
  const localCats = normalizeCategories(localDoc.categories);
  const remoteCats = normalizeCategories(remoteDoc.categories);
  const newerFirst = timeOf(localDoc.updatedAt) >= timeOf(remoteDoc.updatedAt);
  const categoryMap = new Map();
  for (const category of (newerFirst ? remoteCats : localCats)) categoryMap.set(category.id, category);
  for (const category of (newerFirst ? localCats : remoteCats)) categoryMap.set(category.id, category);
  return validateDoc({
    version: 2,
    updatedAt: new Date().toISOString(),
    rolloverDate: laterYmd(localDoc.rolloverDate, remoteDoc.rolloverDate),
    categories: [...categoryMap.values()],
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

function segmentItems(segment) {
  const thumb = segment.querySelector(':scope > .segment-thumb');
  return [...segment.children].filter((el) => el !== thumb && (el.matches('button, label')));
}

function segmentSelection(el) {
  return el.getAttribute('aria-pressed') === 'true'
    || el.getAttribute('aria-current') === 'true'
    || Boolean(el.querySelector('input:checked'));
}

function syncSegmentThumbs(root = document, animate = true) {
  const list = root.classList?.contains('segment') ? [root] : [...root.querySelectorAll('.segment')];
  list.forEach((segment) => positionSegmentThumb(segment, animate));
}

function positionSegmentThumb(segment, animate) {
  let thumb = segment.querySelector(':scope > .segment-thumb');
  if (!thumb) {
    thumb = document.createElement('span');
    thumb.className = 'segment-thumb';
    thumb.setAttribute('aria-hidden', 'true');
    segment.prepend(thumb);
  }
  const items = segmentItems(segment);
  const selected = items.find(segmentSelection);
  if (!selected || selected.offsetWidth === 0) {
    thumb.hidden = true;
    return;
  }
  thumb.hidden = false;
  const place = (el) => {
    thumb.style.width = `${el.offsetWidth}px`;
    thumb.style.height = `${el.offsetHeight}px`;
    thumb.style.transform = `translate(${el.offsetLeft}px, ${el.offsetTop}px)`;
  };
  const from = segment.dataset.slideFrom;
  delete segment.dataset.slideFrom;
  const fromEl = from ? items.find((el) => el.dataset.seg === from || el.querySelector(`input[value="${CSS.escape(from)}"]`)) : null;
  const jump = (el, smooth) => {
    if (!smooth) thumb.style.transition = 'none';
    place(el);
    if (!smooth) {
      thumb.offsetWidth;
      thumb.style.transition = '';
    }
  };
  if (fromEl && fromEl !== selected) {
    jump(fromEl, false);
    requestAnimationFrame(() => jump(selected, !window.matchMedia('(prefers-reduced-motion: reduce)').matches));
    thumb.dataset.ready = '1';
    return;
  }
  const smooth = animate && thumb.dataset.ready === '1' && !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  jump(selected, smooth);
  thumb.dataset.ready = '1';
}

function applyTheme(pref) {
  const resolved = resolvedTheme(pref);
  document.documentElement.dataset.theme = resolved;
  document.documentElement.dataset.themePref = pref;
  state.theme = pref;
  document.documentElement.style.colorScheme = document.documentElement.dataset.bg === 'ocean' ? 'dark' : resolved;
  document.querySelectorAll('input[name="modeChoice"]').forEach((input) => {
    input.checked = input.value === pref;
  });
  requestAnimationFrame(() => syncSegmentThumbs(document));
}

function applySkin(skin) {
  const next = SKINS.includes(skin) ? skin : 'pastel';
  state.skin = next;
  document.documentElement.dataset.skin = next;
  document.querySelectorAll('[data-skin-set]').forEach((button) => {
    button.setAttribute('aria-pressed', button.dataset.skinSet === next ? 'true' : 'false');
  });
  document.querySelectorAll('input[name="skinChoice"]').forEach((input) => {
    input.checked = input.value === next;
  });
  if (!state.bgCustom) applyBg(SKIN_BG[next] || 'lavender');
  requestAnimationFrame(() => syncSegmentThumbs(document));
}

function applyBg(id) {
  const next = BG_IDS.includes(id) ? id : (SKIN_BG[state.skin] || 'lavender');
  state.bg = next;
  document.documentElement.dataset.bg = next;
  document.documentElement.style.colorScheme = next === 'ocean' ? 'dark' : (document.documentElement.dataset.theme || 'light');
  document.querySelectorAll('[data-bg-set]').forEach((button) => {
    button.setAttribute('aria-pressed', button.dataset.bgSet === next ? 'true' : 'false');
  });
}

function renderThemeButton() {
  const button = $('themeBtn');
  if (!button) return;
  const label = THEME_LABEL[state.theme] || '시스템';
  const text = button.querySelector('.btn-label');
  if (text) text.textContent = label;
  else button.textContent = label;
  button.dataset.tip = `밝기 · ${label}`;
  button.setAttribute('aria-label', `밝기 ${label}. 클릭하면 바뀝니다.`);
}

function appNow() {
  if (typeof window !== 'undefined' && window.__TODO_NOW) return new Date(window.__TODO_NOW);
  return new Date();
}

function todayKey() {
  return seoulDate(appNow());
}

function categoryById(id) {
  return (state.doc?.categories || []).find((category) => category.id === id) || null;
}

function compareDue(a, b) {
  if (!a.due && !b.due) return 0;
  if (!a.due) return 1;
  if (!b.due) return -1;
  if (a.due !== b.due) return a.due < b.due ? -1 : 1;
  if (!a.dueTime && !b.dueTime) return 0;
  if (!a.dueTime) return 1;
  if (!b.dueTime) return -1;
  return a.dueTime < b.dueTime ? -1 : a.dueTime > b.dueTime ? 1 : 0;
}

const PRIORITY_RANK = { high: 0, medium: 1, low: 2 };

function compareBySort(a, b) {
  if (state.sort === 'priority') {
    const diff = (PRIORITY_RANK[a.priority] ?? 1) - (PRIORITY_RANK[b.priority] ?? 1);
    if (diff) return diff;
  } else if (state.sort === 'due') {
    const diff = compareDue(a, b);
    if (diff) return diff;
  } else if (state.sort === 'created') {
    const diff = String(a.createdAt).localeCompare(String(b.createdAt));
    if (diff) return diff;
  } else if (state.sort === 'category') {
    const an = categoryById(a.categoryId)?.name || '힣';
    const bn = categoryById(b.categoryId)?.name || '힣';
    const diff = an.localeCompare(bn, 'ko');
    if (diff) return diff;
  }
  return byOrder(a, b);
}

function ensureCategory(name) {
  const clean = String(name || '').replace(/\s+/g, ' ').trim().slice(0, 24);
  if (!clean || !state.doc) return null;
  if (!Array.isArray(state.doc.categories)) state.doc.categories = [];
  const found = state.doc.categories.find((category) => category.name.toLocaleLowerCase('ko') === clean.toLocaleLowerCase('ko'));
  if (found) return found.id;
  const id = `cat-${Math.random().toString(36).slice(2, 10)}`;
  state.doc.categories.push({
    id,
    name: clean,
    color: CATEGORY_COLORS[state.doc.categories.length % CATEGORY_COLORS.length],
  });
  return id;
}

function inView(task, view) {
  if (view === 'done') return task.status === 'done';
  if (task.list !== view) return false;
  if (task.status === 'open') return true;
  if (task.status !== 'done') return false;
  if (view === 'today') return Boolean(task.completedAt && seoulDate(task.completedAt) === todayKey());
  return true;
}

function hideDoneInList() {
  return state.hideCompleted && state.view !== 'done';
}

function matchesFilter(task) {
  if (state.categoryFilter === 'none' && task.categoryId) return false;
  if (state.categoryFilter && state.categoryFilter !== 'none' && task.categoryId !== state.categoryFilter) return false;
  if (state.dueOnlyOverdue && state.view !== 'done' && state.view !== 'calendar' && task.status !== 'done' && !isOverdue(task, appNow())) return false;
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
  const open = tasks.filter((task) => task.status !== 'done').sort(compareBySort);
  const done = tasks.filter((task) => task.status === 'done').sort(compareBySort);
  return [...open, ...done];
}

function groupLabel(ymd) {
  const today = todayKey();
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

function formatDue(task, today) {
  const ymd = task?.due;
  if (!ymd) return '기한';
  let label = '';
  if (ymd === today) label = '오늘';
  else if (ymd === addDays(today, 1)) label = '내일';
  else if (task.status === 'open' && ymd === addDays(today, -1)) label = '어제';
  else {
    const [year, month, day] = ymd.split('-').map(Number);
    label = String(year) === today.slice(0, 4) ? `${month}월 ${day}일` : `${year}.${month}.${day}`;
  }
  return task.dueTime ? `${label} ${task.dueTime}` : label;
}

function dueClass(task, today) {
  if (!task?.due) return 'due is-empty';
  if (isOverdue(task, appNow())) return 'due is-overdue';
  if (task.due === today && task.status !== 'done') return 'due is-today';
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

function greetingFor(date) {
  const hour = Number(new Intl.DateTimeFormat('en-US', { timeZone: TZ, hour: 'numeric', hourCycle: 'h23' }).format(date));
  if (hour < 11) return '좋은 아침이에요';
  if (hour < 18) return '좋은 오후예요';
  return '좋은 저녁이에요';
}

function fillDate() {
  const now = appNow();
  $('todayDate').textContent = formatKoreanFull(now);
  const hello = $('greeting');
  if (!hello) return;
  const name = state.user?.name || state.user?.login || '';
  hello.textContent = name ? `${greetingFor(now)}, ${name}님` : greetingFor(now);
}

function renderDataLoc() {
  const settings = state.settings;
  const node = $('dataLoc');
  if (!node) return;
  node.textContent = `저장 위치 ${settings.owner}/${settings.repo} · ${settings.branch} · ${settings.path}`;
}

function renderUser() {
  const slot = $('avatarSlot');
  const name = $('username');
  slot.replaceChildren();
  const login = state.user?.login || '';
  name.textContent = login;
  fillDate();
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
  for (const view of ['today', 'backlog', 'done', 'calendar']) {
    const tab = $(`tab-${view}`);
    const selected = state.view === view;
    tab.setAttribute('aria-selected', selected ? 'true' : 'false');
    tab.tabIndex = selected ? 0 : -1;
  }
  $('list').setAttribute('aria-labelledby', `tab-${state.view}`);
  const titles = { today: '오늘', calendar: '예정', backlog: '백로그', done: '완료' };
  const marks = { today: '★', calendar: '▦', backlog: '▢', done: '✓' };
  const name = $('viewName');
  const icon = $('viewIcon');
  if (name) name.textContent = titles[state.view] || '오늘';
  if (icon) {
    icon.textContent = marks[state.view] || '★';
    icon.dataset.view = state.view;
  }
  document.querySelector('.workspace')?.setAttribute('data-view', state.view);
  document.querySelectorAll('[data-goto]').forEach((button) => {
    button.setAttribute('aria-current', button.dataset.goto === state.view ? 'true' : 'false');
  });
  const composer = $('composer');
  composer.placeholder = state.view === 'backlog'
    ? '백로그에 추가  ·  @카테고리  #태그  내일 오후 3시'
    : '오늘 할 일 추가  ·  @카테고리  #태그  내일 오후 3시';
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
  const today = todayKey();
  const { done, total } = todayProgress(state.doc?.tasks || [], today);
  const bar = $('progress');
  const max = Math.max(total, 1);
  bar.setAttribute('aria-valuemax', String(total === 0 ? 0 : max));
  bar.setAttribute('aria-valuenow', String(done));
  bar.setAttribute('aria-valuetext', progressText(done, total));
  const ratio = total === 0 ? 0 : done / total;
  const ring = $('progressFill');
  if (ring) {
    const length = 2 * Math.PI * 20;
    ring.style.width = `${Math.round(ratio * 100)}%`;
    ring.setAttribute('stroke-dasharray', `${(length * ratio).toFixed(2)} ${length.toFixed(2)}`);
  }
  $('progressLabel').textContent = total === 0 ? '0' : `${done}/${total}`;
  const overdue = (state.doc?.tasks || []).filter((task) => isOverdue(task, appNow())).length;
  document.title = overdue > 0 ? `(${overdue}) 오늘 · 업무 체크` : '오늘 · 업무 체크';
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
  if (sorted.length) {
    const label = document.createElement('span');
    label.className = 'tag-label';
    label.textContent = '태그';
    bar.append(label);
  }
  for (const tag of sorted) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'tag-chip';
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
    clear.className = 'tag-chip';
    clear.textContent = '필터 해제';
    clear.addEventListener('click', () => {
      state.tag = null;
      state.query = '';
      $('search').value = '';
      if ($('searchClear')) $('searchClear').hidden = true;
      renderTagBar();
      renderList();
    });
    bar.append(clear);
  }
}

function renderList() {
  requestAnimationFrame(() => syncSegmentThumbs(document));
  const list = $('list');
  const active = document.activeElement;
  const restoreId = active?.closest?.('#list [data-id]')?.getAttribute('data-id');
  const restoreKind = active?.getAttribute?.('data-restore');
  list.replaceChildren();
  if (!state.ready || !state.doc) {
    list.append(emptyNode('불러오는 중…'));
    return;
  }
  if (state.view === 'calendar') {
    renderCalendar(list);
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
  } else if (state.groupByCategory) {
    renderGrouped(list, tasks);
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
  window.requestAnimationFrame(() => bindOverflow(list));
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

function renderGrouped(list, tasks) {
  const categories = state.doc.categories || [];
  const buckets = new Map();
  for (const category of categories) buckets.set(category.id, []);
  buckets.set('none', []);
  for (const task of tasks) {
    const key = task.categoryId && buckets.has(task.categoryId) ? task.categoryId : 'none';
    buckets.get(key).push(task);
  }
  let any = false;
  for (const [key, items] of buckets) {
    if (!items.length) continue;
    any = true;
    const category = key === 'none' ? null : categoryById(key);
    const section = document.createElement('section');
    section.className = 'cat-group';
    const head = document.createElement('button');
    head.type = 'button';
    head.className = 'cat-head';
    const open = !state.collapsedGroups[key];
    head.setAttribute('aria-expanded', open ? 'true' : 'false');
    if (category) {
      const dot = document.createElement('span');
      dot.className = `cat-dot cat-${category.color}`;
      head.append(dot);
    }
    const name = document.createElement('span');
    name.textContent = category ? category.name : '카테고리 없음';
    const count = document.createElement('span');
    count.className = 'count';
    count.textContent = String(items.length);
    head.append(name, count);
    head.addEventListener('click', () => {
      state.collapsedGroups[key] = !state.collapsedGroups[key];
      renderList();
    });
    section.append(head);
    if (open) {
      const undone = items.filter((task) => task.status !== 'done');
      const done = items.filter((task) => task.status === 'done');
      if (undone.length) section.append(taskList(category ? category.name : '카테고리 없음', undone));
      if (done.length) {
        const split = document.createElement('h3');
        split.className = 'done-split';
        split.textContent = `완료 ${done.length}`;
        section.append(split, taskList('완료한 할 일', done));
      }
    }
    list.append(section);
  }
  if (!any) list.append(emptyNode(emptyMessage()));
}

function calendarEntries(day, today, projections) {
  const open = [];
  const done = [];
  for (const task of state.doc.tasks) {
    if (!passesCalendarFilter(task)) continue;
    if (task.status === 'done') {
      if (task.completedAt && seoulDate(task.completedAt) === day) done.push(task);
      continue;
    }
    const onDue = task.due === day;
    const undatedToday = !task.due && task.list === 'today' && day === today;
    const carriedToday = day === today && !!task.due && task.due < today;
    if (!onDue && !undatedToday && !carriedToday) continue;
    open.push({
      task,
      overdue: isOverdue(task, appNow()) || carriedToday,
      carried: carriedToday,
    });
  }
  const planned = (projections || []).filter((item) => item.date === day && passesCalendarFilter(item));
  return { open, done, planned };
}

function calendarLines(entry, mode) {
  const lines = [];
  if (mode !== 'done') {
    for (const item of entry.open) lines.push({ kind: 'open', title: item.task.title, categoryId: item.task.categoryId, overdue: item.overdue });
    for (const item of entry.planned) lines.push({ kind: 'plan', title: item.title, categoryId: item.categoryId, overdue: false });
  }
  if (mode !== 'open') {
    for (const task of entry.done) lines.push({ kind: 'done', title: task.title, categoryId: task.categoryId, overdue: false });
  }
  return lines;
}

function renderCalendar(list) {
  const today = todayKey();
  if (!state.calendarYear) {
    state.calendarYear = Number(today.slice(0, 4));
    state.calendarMonth = Number(today.slice(5, 7));
  }
  const year = state.calendarYear;
  const month = state.calendarMonth;
  const days = monthGrid(year, month);
  const wrap = document.createElement('section');
  wrap.className = 'calendar';
  const bar = document.createElement('div');
  bar.className = 'cal-bar';
  const title = document.createElement('h2');
  title.textContent = `${year}년 ${month}월`;
  const prev = document.createElement('button');
  prev.type = 'button';
  prev.className = 'btn';
  prev.textContent = '이전';
  prev.setAttribute('aria-label', '이전 달');
  prev.addEventListener('click', () => shiftMonth(-1));
  const next = document.createElement('button');
  next.type = 'button';
  next.className = 'btn';
  next.textContent = '다음';
  next.setAttribute('aria-label', '다음 달');
  next.addEventListener('click', () => shiftMonth(1));
  const jump = document.createElement('button');
  jump.type = 'button';
  jump.className = 'btn';
  jump.textContent = '오늘';
  jump.addEventListener('click', () => {
    state.calendarYear = Number(today.slice(0, 4));
    state.calendarMonth = Number(today.slice(5, 7));
    state.calendarDay = today;
    renderList();
  });
  const filter = document.createElement('div');
  filter.className = 'cal-filter segment';
  filter.setAttribute('role', 'group');
  filter.setAttribute('aria-label', '달력에 표시할 일');
  if (state.paintedCalendarMode && state.paintedCalendarMode !== state.calendarMode) {
    filter.dataset.slideFrom = state.paintedCalendarMode;
  }
  for (const [mode, label] of [['all', '모두'], ['open', '할 일 보기'], ['done', '완료 보기']]) {
    const button = document.createElement('button');
    button.type = 'button';
    button.dataset.seg = mode;
    button.textContent = label;
    button.setAttribute('aria-pressed', state.calendarMode === mode ? 'true' : 'false');
    button.addEventListener('click', () => {
      state.calendarMode = mode;
      localStorage.setItem('todo.calendarMode', mode);
      renderList();
    });
    filter.append(button);
  }
  state.paintedCalendarMode = state.calendarMode;
  bar.append(prev, title, next, jump, filter);
  wrap.append(bar);
  const weekdays = document.createElement('div');
  weekdays.className = 'cal-weekdays';
  ['일', '월', '화', '수', '목', '금', '토'].forEach((name, index) => {
    const cell = document.createElement('span');
    cell.textContent = name;
    if (index === 0) cell.classList.add('is-sun');
    if (index === 6) cell.classList.add('is-sat');
    weekdays.append(cell);
  });
  wrap.append(weekdays);
  const grid = document.createElement('div');
  grid.className = 'cal-grid';
  const rangeEnd = days[days.length - 1];
  const projections = projectOccurrences(state.doc.tasks, today, rangeEnd).filter((item) => item.date > today);
  for (const day of days) {
    const inMonth = Number(day.slice(5, 7)) === month;
    const entry = calendarEntries(day, today, projections);
    const lines = calendarLines(entry, state.calendarMode);
    const holiday = holidayLabel(day);
    const dow = weekday(day);
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'cal-day';
    if (!inMonth) button.classList.add('is-outside');
    if (day === today) button.classList.add('is-today');
    if (day > today) button.classList.add('is-future');
    if (day === state.calendarDay) button.classList.add('is-selected');
    if (dow === 0) button.classList.add('is-sun');
    if (dow === 6) button.classList.add('is-sat');
    if (holiday) button.classList.add('is-holiday');
    const heat = entry.done.length === 0 ? 0 : entry.done.length === 1 ? 1 : entry.done.length < 4 ? 2 : 3;
    button.dataset.heat = String(heat);
    button.setAttribute('aria-pressed', day === state.calendarDay ? 'true' : 'false');
    button.setAttribute('aria-label', `${day}${holiday ? ` ${holiday}` : ''} 할 일 ${entry.open.length + entry.planned.length}개, 완료 ${entry.done.length}개`);
    const num = document.createElement('span');
    num.className = 'cal-num';
    num.textContent = String(Number(day.slice(8, 10)));
    button.append(num);
    if (holiday) {
      const name = document.createElement('span');
      name.className = 'cal-holiday';
      name.textContent = holiday;
      button.append(name);
    }
    const summary = document.createElement('span');
    summary.className = 'cal-summary';
    if (entry.open.length) summary.append(dotCount('open-dot', entry.open.length));
    if (entry.open.some((item) => item.overdue)) summary.append(dotCount('overdue-dot', ''));
    if (entry.planned.length) summary.append(dotCount('plan-dot', entry.planned.length));
    if (entry.done.length) summary.append(dotCount('done-dot', entry.done.length));
    button.append(summary);
    const items = document.createElement('span');
    items.className = 'cal-items';
    const shown = previewLines(lines);
    for (const line of shown) items.append(calendarChip(line));
    if (lines.length > shown.length) {
      const more = document.createElement('span');
      more.className = 'cal-more';
      more.textContent = `+${lines.length - shown.length}개 더`;
      items.append(more);
    }
    button.append(items);
    button.addEventListener('click', () => {
      state.calendarDay = day;
      renderList();
    });
    grid.append(button);
  }
  wrap.append(grid);
  if (state.calendarDay) wrap.append(renderDayDetail(state.calendarDay, projections));
  list.append(wrap);
}

function dotCount(kind, count) {
  const wrap = document.createElement('span');
  wrap.className = 'sum-bit';
  const dot = document.createElement('span');
  dot.className = `dot ${kind}`;
  wrap.append(dot);
  if (count !== '') {
    const num = document.createElement('span');
    num.textContent = String(count);
    wrap.append(num);
  }
  return wrap;
}

function previewLines(lines) {
  if (lines.length <= 3) return lines;
  const openish = lines.filter((line) => line.kind !== 'done');
  const done = lines.filter((line) => line.kind === 'done');
  if (openish.length && done.length) return [...openish.slice(0, 2), done[0]];
  return lines.slice(0, 3);
}

function calendarChip(line) {
  const row = document.createElement('span');
  row.className = `cal-item is-${line.kind}`;
  if (line.overdue) row.classList.add('is-overdue');
  const category = categoryById(line.categoryId);
  if (category) {
    const dot = document.createElement('span');
    dot.className = `cat-dot cat-${category.color}`;
    row.append(dot);
  }
  if (line.kind === 'open') {
    const mark = document.createElement('span');
    mark.className = 'cal-box';
    mark.setAttribute('aria-hidden', 'true');
    row.append(mark);
  }
  const text = document.createElement('span');
  text.className = 'cal-item-title';
  text.textContent = line.title;
  row.append(text);
  return row;
}

function passesCalendarFilter(task) {
  if (state.categoryFilter === 'none') return !task.categoryId;
  if (state.categoryFilter) return task.categoryId === state.categoryFilter;
  return true;
}

function renderDayDetail(day, projections) {
  const panel = document.createElement('div');
  panel.className = 'day-detail';
  const heading = document.createElement('h3');
  heading.textContent = groupLabel(day);
  const holiday = holidayLabel(day);
  if (holiday) {
    const mark = document.createElement('span');
    mark.className = 'day-holiday';
    mark.textContent = ` · ${holiday}`;
    heading.append(mark);
  }
  panel.append(heading);
  const entry = calendarEntries(day, todayKey(), projections);
  const showOpen = state.calendarMode !== 'done';
  const showDone = state.calendarMode !== 'open';
  if (showOpen) panel.append(detailSection('해야 할 일', entry.open.map((item) => detailTaskRow(item.task, item.overdue)), entry.planned.map((item) => detailPlanRow(item))));
  if (showDone) panel.append(detailSection('완료', entry.done.map((task) => detailTaskRow(task, false)), []));
  if ((!showOpen || (!entry.open.length && !entry.planned.length)) && (!showDone || !entry.done.length)) {
    const empty = document.createElement('p');
    empty.className = 'empty';
    empty.textContent = '이 날짜에 표시할 일이 없습니다.';
    panel.append(empty);
  }
  const form = document.createElement('form');
  form.className = 'day-add';
  const input = document.createElement('input');
  input.type = 'text';
  input.maxLength = 500;
  input.placeholder = '이 날짜에 할 일 추가';
  input.setAttribute('aria-label', `${day} 할 일 추가`);
  const submit = document.createElement('button');
  submit.type = 'submit';
  submit.className = 'btn-primary';
  submit.textContent = '추가';
  form.append(input, submit);
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const title = input.value.replace(/\s+/g, ' ').trim();
    if (!title) return;
    addTaskOnDay(day, title);
  });
  panel.append(form);
  return panel;
}

function detailSection(label, rows, plans) {
  const section = document.createElement('section');
  const title = document.createElement('h4');
  title.textContent = label;
  section.append(title);
  if (!rows.length && !plans.length) return section;
  const ul = document.createElement('ul');
  ul.className = 'detail-list';
  for (const row of rows) ul.append(row);
  for (const row of plans) ul.append(row);
  section.append(ul);
  return section;
}

function detailTaskRow(task, overdue) {
  const li = document.createElement('li');
  if (task.status === 'done') li.classList.add('is-done');
  if (overdue) li.classList.add('is-overdue');
  const check = document.createElement('input');
  check.type = 'checkbox';
  check.className = 'check';
  check.checked = task.status === 'done';
  check.setAttribute('aria-label', `완료 표시: ${task.title}`);
  check.addEventListener('change', () => toggleComplete(task.id));
  li.append(check);
  const category = categoryById(task.categoryId);
  if (category) {
    const dot = document.createElement('span');
    dot.className = `cat-dot cat-${category.color}`;
    li.append(dot);
  }
  if (state.editingId === task.id && state.view === 'calendar') {
    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'title-input';
    input.value = task.title;
    input.setAttribute('aria-label', '할 일 제목');
    input.addEventListener('keydown', (event) => {
      if (event.isComposing || event.keyCode === 229) return;
      if (event.key === 'Enter') {
        event.preventDefault();
        commitTitle(task.id, input.value);
      } else if (event.key === 'Escape') {
        event.preventDefault();
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
    li.append(input);
    window.setTimeout(() => input.focus(), 0);
  } else {
    const text = document.createElement('span');
    text.className = 'detail-title';
    text.textContent = task.title;
    li.append(text);
  }
  const meta = document.createElement('span');
  meta.className = 'detail-meta';
  meta.textContent = task.status === 'done'
    ? formatDoneTime(task.completedAt)
    : `${task.dueTime || ''}${task.carriedDays ? ` 이월 ${task.carriedDays}` : ''}`.trim();
  li.append(meta);
  const edit = document.createElement('button');
  edit.type = 'button';
  edit.className = 'btn';
  edit.textContent = '편집';
  edit.setAttribute('aria-label', `${task.title} 편집`);
  edit.addEventListener('click', () => {
    state.focusId = task.id;
    state.editingId = task.id;
    renderList();
  });
  li.append(edit);
  return li;
}

function detailPlanRow(item) {
  const li = document.createElement('li');
  li.classList.add('is-projection');
  const category = categoryById(item.categoryId);
  if (category) {
    const dot = document.createElement('span');
    dot.className = `cat-dot cat-${category.color}`;
    li.append(dot);
  }
  const text = document.createElement('span');
  text.className = 'detail-title';
  text.textContent = item.title;
  const meta = document.createElement('span');
  meta.className = 'detail-meta';
  meta.textContent = `예정 · ${ruleLabel(item.rule) || '반복'}`;
  li.append(text, meta);
  return li;
}

function addTaskOnDay(day, title) {
  const now = new Date().toISOString();
  const today = todayKey();
  const task = {
    id: newId(),
    title,
    memo: '',
    priority: 'medium',
    due: day,
    dueTime: null,
    tags: [],
    list: day <= today ? 'today' : 'backlog',
    status: 'open',
    order: 0,
    createdAt: now,
    updatedAt: now,
    completedAt: null,
    carriedDays: 0,
    repeat: null,
    seriesId: null,
    occurrenceDate: day,
    reminder: null,
    categoryId: state.categoryFilter && state.categoryFilter !== 'none' ? state.categoryFilter : null,
  };
  state.doc.tasks.push(task);
  state.focusId = task.id;
  markDirty();
  renderDynamic();
  announce('할 일을 추가했습니다.');
}

function categorySuffix(task) {
  const category = categoryById(task.categoryId);
  return category ? ` · ${category.name}` : '';
}

function detailBlock(label, lines) {
  const section = document.createElement('section');
  const title = document.createElement('h4');
  title.textContent = label;
  section.append(title);
  if (!lines.length) return section;
  const ul = document.createElement('ul');
  ul.className = 'detail-list';
  for (const line of lines) ul.append(line);
  section.append(ul);
  return section;
}

function detailLine(title, meta, overdue, projected) {
  const li = document.createElement('li');
  if (projected) li.classList.add('is-projection');
  const strong = document.createElement('span');
  strong.textContent = title;
  const small = document.createElement('span');
  small.textContent = meta;
  if (overdue) small.classList.add('is-overdue');
  li.append(strong, small);
  return li;
}

function shiftMonth(delta) {
  let month = state.calendarMonth + delta;
  let year = state.calendarYear;
  if (month < 1) {
    month = 12;
    year -= 1;
  }
  if (month > 12) {
    month = 1;
    year += 1;
  }
  state.calendarMonth = month;
  state.calendarYear = year;
  renderList();
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
  const today = todayKey();
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
    title.id = `title-${task.id}`;
    title.textContent = task.title;
    title.addEventListener('dblclick', (event) => {
      event.preventDefault();
      startEdit(task.id);
    });
    titleLine.append(title);
    const expand = document.createElement('button');
    expand.type = 'button';
    expand.className = 'expand-btn';
    expand.hidden = !state.expandedIds.has(task.id);
    expand.dataset.restore = 'expand';
    expand.textContent = state.expandedIds.has(task.id) ? '접기' : '더보기';
    expand.setAttribute('aria-expanded', state.expandedIds.has(task.id) ? 'true' : 'false');
    expand.setAttribute('aria-controls', `title-${task.id}`);
    expand.addEventListener('click', (event) => {
      event.stopPropagation();
      if (state.expandedIds.has(task.id)) state.expandedIds.delete(task.id);
      else state.expandedIds.add(task.id);
      renderList();
    });
    titleLine.append(expand);
    if (state.view === 'today' && task.carriedDays > 0 && task.status !== 'done') {
      const badge = document.createElement('span');
      badge.className = 'carry';
      badge.textContent = `이월 ${task.carriedDays}`;
      titleLine.append(badge);
    }
    if (task.memo) {
      const measure = document.createElement('span');
      measure.className = 'memo-measure';
      measure.setAttribute('aria-hidden', 'true');
      measure.textContent = task.memo;
      titleLine.append(measure);
    }
    if (state.expandedIds.has(task.id) && task.memo) {
      const memoRead = document.createElement('p');
      memoRead.className = 'memo-read';
      memoRead.textContent = task.memo;
      titleLine.append(memoRead);
    }
    if (state.expandedIds.has(task.id)) li.classList.add('is-expanded');
    title.addEventListener('click', (event) => {
      if (event.detail > 1) return;
      event.stopPropagation();
      state.cardId = state.cardId === task.id ? null : task.id;
      state.focusId = task.id;
      renderList();
    });
  }
  if (state.cardId === task.id) li.classList.add('is-card');

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

  const category = categoryById(task.categoryId);
  if (category) {
    const label = document.createElement('button');
    label.type = 'button';
    label.className = `cat-label cat-${category.color}`;
    label.textContent = category.name;
    label.setAttribute('aria-label', `카테고리 ${category.name}`);
    check.classList.add(`cat-${category.color}`);
    label.addEventListener('click', (event) => {
      event.stopPropagation();
      state.focusId = task.id;
      openCategoryPicker(task.id);
    });
    meta.append(label);
  }
  if (task.repeat) {
    const repeat = document.createElement('button');
    repeat.type = 'button';
    repeat.className = 'repeat-label';
    repeat.textContent = `↻ ${ruleLabel(task.repeat)}`;
    repeat.setAttribute('aria-label', `반복 ${ruleLabel(task.repeat)}`);
    repeat.addEventListener('click', (event) => {
      event.stopPropagation();
      openRepeatDialog(task.id);
    });
    meta.append(repeat);
  }
  const due = document.createElement('button');
  due.type = 'button';
  due.className = dueClass(task, today);
  due.dataset.restore = 'due';
  due.textContent = formatDue(task, today);
  const dueLabel = task.due ? `기한 ${task.due}${task.dueTime ? ` ${task.dueTime}` : ''}` : '기한 설정';
  due.setAttribute('aria-label', dueLabel);
  due.addEventListener('click', (event) => {
    event.stopPropagation();
    openDueDialog(task.id);
  });
  meta.append(due);

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

  if (state.cardId === task.id) li.append(renderTaskCard(task));
  else if (state.memoId === task.id) li.append(renderMemo(task));
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

function renderTaskCard(task) {
  const card = document.createElement('div');
  card.className = 'task-card';
  const notes = document.createElement('textarea');
  notes.className = 'card-notes';
  notes.value = task.memo || '';
  notes.placeholder = '메모';
  notes.setAttribute('aria-label', `${task.title} 메모`);
  notes.addEventListener('blur', () => {
    const value = notes.value;
    window.setTimeout(() => commitMemo(task.id, value), 0);
  });
  const foot = document.createElement('div');
  foot.className = 'card-foot';
  for (const tag of task.tags) {
    const chip = document.createElement('span');
    chip.className = 'chip';
    chip.textContent = `#${tag}`;
    foot.append(chip);
  }
  const when = document.createElement('button');
  when.type = 'button';
  when.className = 'card-meta';
  when.textContent = task.list === 'backlog' ? '백로그' : '오늘';
  when.addEventListener('click', () => moveToList(task.id, task.list === 'backlog' ? 'today' : 'backlog'));
  const due = document.createElement('button');
  due.type = 'button';
  due.className = 'card-meta';
  due.textContent = task.due ? `마감 ${formatDue(task, todayKey())}` : '마감';
  due.addEventListener('click', () => openDueDialog(task.id));
  const repeat = document.createElement('button');
  repeat.type = 'button';
  repeat.className = 'card-meta';
  repeat.textContent = task.repeat ? ruleLabel(task.repeat) : '반복';
  repeat.addEventListener('click', () => openRepeatDialog(task.id));
  foot.append(when, due, repeat);
  card.append(notes, foot);
  return card;
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
  if (state.menu.kind === 'category') {
    menu.setAttribute('aria-label', '카테고리');
    const none = menuAction('없음', () => setCategory(task.id, null));
    none.setAttribute('aria-pressed', task.categoryId ? 'false' : 'true');
    menu.append(none);
    for (const category of state.doc?.categories || []) {
      const button = menuAction(category.name, () => setCategory(task.id, category.id));
      button.classList.add(`cat-${category.color}`);
      button.setAttribute('aria-pressed', task.categoryId === category.id ? 'true' : 'false');
      menu.append(button);
    }
    menu.append(menuAction('카테고리 관리', openCategoryDialog));
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
  menu.append(menuAction('기한', () => openDueDialog(task.id)));
  menu.append(menuAction(task.repeat ? '반복 수정' : '반복', () => openRepeatDialog(task.id)));
  menu.append(menuAction('카테고리', () => openCategoryPicker(task.id)));
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
    if (state.view === 'done' || state.view === 'calendar' || state.query.trim() || state.tag || state.categoryFilter || state.dueOnlyOverdue || state.sort !== 'manual' || state.groupByCategory || state.editingId) {
      event.preventDefault();
      if (state.query.trim() || state.tag || state.categoryFilter || state.dueOnlyOverdue || state.sort !== 'manual' || state.groupByCategory) {
        announce('수동 순서에서만, 필터와 그룹을 끄면 순서를 바꿀 수 있습니다.');
      }
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

const overflowObserver = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver((entries) => {
  for (const entry of entries) measureOverflow(entry.target.closest('.task'));
});

function measureOverflow(row) {
  if (!row) return;
  const button = row.querySelector('.expand-btn');
  const title = row.querySelector('.title');
  if (!button || !title) return;
  const expanded = row.classList.contains('is-expanded');
  if (expanded) {
    button.hidden = false;
    return;
  }
  const line = row.querySelector('.title-line');
  const memo = row.querySelector('.memo-measure');
  const titleOverflow = title.scrollWidth > title.clientWidth + 1;
  const memoOverflow = memo && line ? memo.scrollWidth > line.clientWidth + 1 : false;
  button.hidden = !(titleOverflow || memoOverflow);
}

function bindOverflow(root) {
  root.querySelectorAll('.task').forEach((row) => {
    measureOverflow(row);
    const line = row.querySelector('.title-line');
    if (line && overflowObserver) overflowObserver.observe(line);
  });
}

function renderHideButton() {
  const button = $('hideDoneBtn');
  if (!button) return;
  button.setAttribute('aria-pressed', state.hideCompleted ? 'true' : 'false');
}

function renderDueSoon() {
  const host = $('dueSoon');
  if (!host || !state.doc) return;
  const today = todayKey();
  const soon = state.doc.tasks
    .filter((task) => task.status === 'open' && task.due && task.due <= addDays(today, 3))
    .sort(compareDue)
    .slice(0, 4);
  host.replaceChildren();
  const heading = document.createElement('h3');
  heading.textContent = '마감 임박';
  host.append(heading);
  if (!soon.length) {
    const empty = document.createElement('p');
    empty.className = 'widget-empty';
    empty.textContent = '다가오는 마감이 없습니다.';
    host.append(empty);
    return;
  }
  const list = document.createElement('ul');
  for (const task of soon) {
    const item = document.createElement('li');
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = `${task.title} · ${formatDue(task, today)}`;
    if (isOverdue(task, appNow()) || task.due < today) button.classList.add('is-overdue');
    button.addEventListener('click', () => openTaskFromWidget(task));
    item.append(button);
    list.append(item);
  }
  host.append(list);
}

function openTaskFromWidget(task) {
  state.cardId = task.id;
  state.focusId = task.id;
  const view = task.list === 'backlog' ? 'backlog' : 'today';
  if (state.view === view) renderDynamic();
  else setView(view);
}

function renderWeekChart() {
  const host = $('weekChart');
  if (!host || !state.doc) return;
  const monday = thisWeekday(todayKey(), 1);
  const labels = ['월', '화', '수', '목', '금', '토', '일'];
  const counts = labels.map((_, index) => {
    const day = addDays(monday, index);
    return state.doc.tasks.filter((task) => task.status === 'done' && task.completedAt && seoulDate(task.completedAt) === day).length;
  });
  const max = Math.max(1, ...counts);
  const todayIndex = (weekday(todayKey()) + 6) % 7;
  host.replaceChildren();
  const heading = document.createElement('h3');
  heading.textContent = '이번 주 완료';
  const bars = document.createElement('div');
  bars.className = 'bars';
  counts.forEach((count, index) => {
    const cell = document.createElement('span');
    const bar = document.createElement('i');
    bar.style.height = `${Math.max(8, Math.round((count / max) * 48))}px`;
    if (index === todayIndex) bar.className = 'on';
    cell.append(bar, document.createTextNode(labels[index]));
    bars.append(cell);
  });
  host.append(heading, bars);
}

function renderMiniCal() {
  const host = $('miniCal');
  if (!host || !state.doc) return;
  const today = todayKey();
  const year = Number(today.slice(0, 4));
  const month = Number(today.slice(5, 7));
  const days = monthGrid(year, month);
  host.replaceChildren();
  const top = document.createElement('div');
  top.className = 'mini-top';
  const title = document.createElement('strong');
  title.textContent = `${month}월`;
  const open = document.createElement('button');
  open.type = 'button';
  open.className = 'btn';
  open.textContent = '크게';
  open.addEventListener('click', () => {
    state.calendarYear = year;
    state.calendarMonth = month;
    state.calendarDay = today;
    setView('calendar');
  });
  top.append(title, open);
  const week = document.createElement('div');
  week.className = 'week';
  ['일', '월', '화', '수', '목', '금', '토'].forEach((name, index) => {
    const cell = document.createElement('span');
    cell.textContent = name;
    if (index === 0) cell.classList.add('is-sun');
    if (index === 6) cell.classList.add('is-sat');
    week.append(cell);
  });
  const grid = document.createElement('div');
  grid.className = 'mini-grid';
  for (const day of days) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'mini-day';
    const dow = weekday(day);
    if (Number(day.slice(5, 7)) !== month) button.classList.add('is-outside');
    if (dow === 0) button.classList.add('is-sun');
    if (dow === 6) button.classList.add('is-sat');
    if (holidayLabel(day)) button.classList.add('is-holiday');
    if (day === today) button.classList.add('is-today');
    button.textContent = String(Number(day.slice(8, 10)));
    button.addEventListener('click', () => {
      state.calendarYear = Number(day.slice(0, 4));
      state.calendarMonth = Number(day.slice(5, 7));
      state.calendarDay = day;
      setView('calendar');
    });
    grid.append(button);
  }
  host.append(top, week, grid);
}

function renderDynamic() {
  renderTabs();
  renderCounts();
  renderProgress();
  renderDueSoon();
  renderWeekChart();
  renderMiniCal();
  renderTagBar();
  renderCategoryBar();
  renderViewControls();
  renderHideButton();
  renderList();
  renderDataLoc();
  checkNotifications();
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
  const result = applyCarryOver(state.doc, todayKey());
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
    dueTime: parsed.dueTime || null,
    tags: parsed.tags,
    list,
    status: 'open',
    order: siblings.length ? minOrder - 1 : 0,
    createdAt: now,
    updatedAt: now,
    completedAt: null,
    carriedDays: 0,
    repeat: null,
    seriesId: null,
    occurrenceDate: parsed.due,
    reminder: null,
    categoryId: parsed.categoryName ? ensureCategory(parsed.categoryName) : (state.categoryFilter && state.categoryFilter !== 'none' ? state.categoryFilter : null),
  };
  state.doc.tasks.push(task);
  state.focusId = task.id;
  if (state.view === 'done') state.view = 'today';
  $('composer').value = '';
  renderComposerMirror();
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

function setDue(id, due, dueTime = undefined, reminder = undefined) {
  const task = findTask(id);
  state.dueId = null;
  if (!task) return;
  const next = due && isYmd(due) ? due : null;
  task.due = next;
  if (dueTime !== undefined) task.dueTime = dueTime && /^([01]\d|2[0-3]):[0-5]\d$/.test(dueTime) ? dueTime : null;
  if (!next) task.dueTime = null;
  if (reminder !== undefined) task.reminder = ['at', '10m', '30m', '1h', '1d9'].includes(reminder) ? reminder : null;
  if (task.repeat && !task.occurrenceDate) task.occurrenceDate = next;
  task.updatedAt = new Date().toISOString();
  state.focusId = id;
  markDirty();
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
      if (current.repeat) {
        if (!current.seriesId) current.seriesId = String(current.id).split('@')[0];
        if (!current.occurrenceDate) current.occurrenceDate = current.due || seoulDate(current.completedAt);
        const next = planNextTask(current, state.doc.tasks, current.completedAt);
        if (next) state.doc.tasks.push(next);
      }
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
  if (state.view === 'done' || state.view === 'calendar') return;
  if (state.query.trim() || state.tag || state.categoryFilter || state.dueOnlyOverdue || state.sort !== 'manual' || state.groupByCategory) {
    announce('수동 순서에서만, 필터와 그룹을 끄면 순서를 바꿀 수 있습니다.');
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
  if (!['today', 'backlog', 'done', 'calendar'].includes(view) || state.view === view) return;
  state.view = view;
  state.editingId = null;
  state.menu = null;
  state.dueId = null;
  closeSidebar();
  renderDynamic();
}

function exportJson() {
  if (!state.doc) return;
  const doc = {
    version: 2,
    updatedAt: state.doc.updatedAt,
    rolloverDate: state.doc.rolloverDate,
    categories: state.doc.categories || [],
    tasks: state.doc.tasks,
  };
  const blob = new Blob([`${JSON.stringify(doc, null, 2)}\n`], { type: 'application/json' });
  const link = document.createElement('a');
  const url = URL.createObjectURL(blob);
  link.href = url;
  link.download = `todos-${todayKey()}.json`;
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
      version: 2,
      updatedAt: now,
      rolloverDate: incoming.rolloverDate || state.doc.rolloverDate || todayKey(),
      categories: incoming.categories || [],
      tasks: incoming.tasks.map((task) => clone(task)),
    };
  } else {
    const categoryMap = new Map();
    for (const category of state.doc.categories || []) categoryMap.set(category.id, category);
    for (const category of incoming.categories || []) categoryMap.set(category.id, category);
    state.doc = validateDoc({
      version: 2,
      updatedAt: now,
      rolloverDate: laterYmd(state.doc.rolloverDate, incoming.rolloverDate),
      categories: [...categoryMap.values()],
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
  applySkin(state.skin);
  applyTheme(state.theme);
  $('settingsDialog').showModal();
  requestAnimationFrame(() => syncSegmentThumbs($('settingsDialog')));
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
    const sortMenu = $('sortMenu');
    const reminderMenu = $('dueReminderMenu');
    if (sortMenu && !sortMenu.hidden) {
      sortMenu.hidden = true;
      $('sortBtn')?.setAttribute('aria-expanded', 'false');
      return;
    }
    if (reminderMenu && !reminderMenu.hidden) {
      reminderMenu.hidden = true;
      $('dueReminderBtn')?.setAttribute('aria-expanded', 'false');
      return;
    }
    if (state.menu || state.dueId || state.cardId) {
      state.menu = null;
      state.dueId = null;
      state.cardId = null;
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
  if (event.key === '/' || event.key === '?' || event.code === 'Slash' || event.code === 'NumpadDivide') {
    event.preventDefault();
    if (event.shiftKey || event.key === '?') $('helpDialog').showModal();
    else {
      const sidebar = $('sidebar');
      if (sidebar && getComputedStyle(sidebar).display === 'none') {
        sidebar.classList.add('is-open');
        $('navToggle')?.setAttribute('aria-expanded', 'true');
        if ($('navBackdrop')) $('navBackdrop').hidden = false;
      }
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
  if (event.code === 'KeyC' && !event.shiftKey) {
    event.preventDefault();
    setView('calendar');
    return;
  }
  if (event.code === 'KeyD' && state.focusId) {
    event.preventDefault();
    openDueDialog(state.focusId);
    return;
  }
  if (event.code === 'KeyR' && state.focusId) {
    event.preventDefault();
    openRepeatDialog(state.focusId);
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
  if (state.doc.rolloverDate && state.doc.rolloverDate < todayKey()) {
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
  document.querySelectorAll('[data-skin-set]').forEach((button) => {
    button.addEventListener('click', () => {
      localStorage.setItem(SKIN_KEY, button.dataset.skinSet);
      applySkin(button.dataset.skinSet);
    });
  });
  document.querySelectorAll('[data-goto]').forEach((button) => {
    button.addEventListener('click', () => setView(button.dataset.goto));
  });
  document.querySelectorAll('input[name="skinChoice"]').forEach((input) => {
    input.addEventListener('change', () => {
      if (!input.checked) return;
      localStorage.setItem(SKIN_KEY, input.value);
      applySkin(input.value);
    });
  });
  document.querySelectorAll('[data-bg-set]').forEach((button) => {
    button.addEventListener('click', () => {
      state.bgCustom = true;
      localStorage.setItem(BG_CUSTOM_KEY, '1');
      localStorage.setItem(BG_KEY, button.dataset.bgSet);
      applyBg(button.dataset.bgSet);
    });
  });
  document.querySelectorAll('input[name="modeChoice"]').forEach((input) => {
    input.addEventListener('change', () => {
      if (!input.checked) return;
      localStorage.setItem(THEME_KEY, input.value);
      applyTheme(input.value);
      renderThemeButton();
    });
  });
  $('settingsBtn').addEventListener('click', openSettings);
  document.querySelectorAll('dialog').forEach((dialog) => {
    dialog.addEventListener('toggle', () => {
      if (dialog.open) requestAnimationFrame(() => syncSegmentThumbs(dialog));
    });
  });
  window.addEventListener('resize', () => syncSegmentThumbs(document, false));
  $('hideDoneBtn').addEventListener('click', () => {
    state.hideCompleted = !state.hideCompleted;
    localStorage.setItem(HIDE_DONE_KEY, state.hideCompleted ? '1' : '0');
    renderDynamic();
    announce(state.hideCompleted ? '완료한 항목을 숨겼습니다.' : '완료한 항목을 표시합니다.');
  });
  $('sortSelect').addEventListener('change', () => {
    state.sort = $('sortSelect').value;
    localStorage.setItem(SORT_KEY, state.sort);
    renderList();
  });
  $('groupBtn').addEventListener('click', () => {
    state.groupByCategory = !state.groupByCategory;
    localStorage.setItem(GROUP_KEY, state.groupByCategory ? '1' : '0');
    renderDynamic();
  });
  $('overdueBtn').addEventListener('click', () => {
    state.dueOnlyOverdue = !state.dueOnlyOverdue;
    localStorage.setItem(OVERDUE_KEY, state.dueOnlyOverdue ? '1' : '0');
    renderDynamic();
  });
  $('dueForm').addEventListener('submit', (event) => {
    event.preventDefault();
    const id = $('dueTaskId').value;
    setDue(id, $('dueDate').value || null, $('dueTime').value || null, $('dueReminder').value || null);
    $('dueDialog').close();
  });
  document.querySelectorAll('[data-due-quick]').forEach((button) => {
    button.addEventListener('click', () => {
      const today = todayKey();
      const kind = button.dataset.dueQuick;
      const date = kind === 'today' ? today
        : kind === 'tomorrow' ? addDays(today, 1)
          : kind === 'friday' ? thisWeekday(today, 5)
            : nextWeekMonday(today);
      $('dueDate').value = date;
      dueView = { year: Number(date.slice(0, 4)), month: Number(date.slice(5, 7)) };
      renderDueCalendar();
    });
  });
  document.querySelectorAll('[data-due-time]').forEach((button) => {
    button.addEventListener('click', () => {
      $('dueTime').value = button.dataset.dueTime;
      syncDueControls();
    });
  });
  $('dueReminderBtn')?.addEventListener('click', () => {
    const menu = $('dueReminderMenu');
    const open = menu.hidden;
    menu.hidden = !open;
    $('dueReminderBtn').setAttribute('aria-expanded', open ? 'true' : 'false');
    syncDueControls();
  });
  document.querySelectorAll('[data-brief]').forEach((button) => {
    button.addEventListener('click', () => {
      $('briefingTime').value = button.dataset.brief;
      $('briefingTime').dispatchEvent(new Event('change'));
      syncBriefChips();
    });
  });
  $('dueClear').addEventListener('click', () => {
    setDue($('dueTaskId').value, null, null, null);
    $('dueDialog').close();
  });
  document.querySelectorAll('input[name="repeatFreq"]').forEach((input) => {
    input.addEventListener('change', syncRepeatFields);
  });
  $('repeatForm').addEventListener('submit', (event) => {
    event.preventDefault();
    saveRepeat();
  });
  $('repeatStop').addEventListener('click', stopRepeat);
  $('addCatBtn').addEventListener('click', addCategoryFromDialog);
  $('categoryForm').addEventListener('submit', (event) => {
    event.preventDefault();
    addCategoryFromDialog();
  });
  $('notifyToggle').addEventListener('change', async () => {
    if ($('notifyToggle').checked) {
      if (typeof Notification === 'undefined') {
        $('notifyToggle').checked = false;
        return;
      }
      const permission = await Notification.requestPermission();
      state.notifyEnabled = permission === 'granted';
      $('notifyToggle').checked = state.notifyEnabled;
    } else state.notifyEnabled = false;
    localStorage.setItem(NOTIFY_KEY, state.notifyEnabled ? '1' : '0');
    renderNotifyControls();
    checkNotifications();
  });
  $('briefingTime').addEventListener('change', () => {
    if (!/^\d{2}:\d{2}$/.test($('briefingTime').value)) return;
    state.briefingTime = $('briefingTime').value;
    localStorage.setItem(BRIEF_KEY, state.briefingTime);
  });
  $('helpBtn').addEventListener('click', () => $('helpDialog').showModal());
  $('magicPlus')?.addEventListener('click', focusComposer);
  $('sideQuick')?.addEventListener('click', focusComposer);
  $('navToggle')?.addEventListener('click', () => {
    const sidebar = $('sidebar');
    const open = sidebar.classList.toggle('is-open');
    $('navToggle').setAttribute('aria-expanded', open ? 'true' : 'false');
    $('navBackdrop').hidden = !open;
  });
  $('navBackdrop')?.addEventListener('click', closeSidebar);
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
    if ($('searchClear')) $('searchClear').hidden = !$('search').value;
    renderList();
    renderTagBar();
  });
  $('searchClear')?.addEventListener('click', () => {
    $('search').value = '';
    $('search').dispatchEvent(new Event('input'));
    $('search').focus();
  });
  $('composer')?.addEventListener('input', renderComposerMirror);
  $('sortBtn')?.addEventListener('click', () => {
    const menu = $('sortMenu');
    const open = menu.hidden;
    menu.hidden = !open;
    $('sortBtn').setAttribute('aria-expanded', open ? 'true' : 'false');
    renderViewControls();
  });
  mountMenus();
  renderTimeCols();
  $('search').addEventListener('keydown', (event) => {
    if (event.key !== 'Escape') return;
    event.stopPropagation();
    if ($('search').value) {
      $('search').value = '';
      state.query = '';
      if ($('searchClear')) $('searchClear').hidden = true;
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
    const sortMenu = $('sortMenu');
    if (sortMenu && !sortMenu.hidden && !event.target.closest?.('#sortBtn') && !event.target.closest?.('#sortMenu')) {
      sortMenu.hidden = true;
      $('sortBtn')?.setAttribute('aria-expanded', 'false');
    }
    const reminderMenu = $('dueReminderMenu');
    if (reminderMenu && !reminderMenu.hidden && !event.target.closest?.('#dueReminderBtn') && !event.target.closest?.('#dueReminderMenu')) {
      reminderMenu.hidden = true;
      $('dueReminderBtn')?.setAttribute('aria-expanded', 'false');
    }
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

function renderCategoryBar() {
  const bar = $('catBar');
  if (!bar || !state.doc) return;
  bar.replaceChildren();
  const all = document.createElement('button');
  all.type = 'button';
  all.className = 'side-cat';
  const allMark = document.createElement('span');
  allMark.className = 'pie-slot';
  allMark.setAttribute('aria-hidden', 'true');
  all.append(allMark, document.createTextNode('전체'));
  all.setAttribute('aria-pressed', state.categoryFilter ? 'false' : 'true');
  all.addEventListener('click', () => {
    state.categoryFilter = null;
    renderDynamic();
  });
  bar.append(all);
  for (const category of state.doc.categories || []) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `side-cat cat-${category.color}`;
    const tasks = state.doc.tasks.filter((task) => task.categoryId === category.id);
    const done = tasks.filter((task) => task.status === 'done').length;
    button.append(categoryPie(done, tasks.length), document.createTextNode(category.name));
    button.setAttribute('aria-pressed', state.categoryFilter === category.id ? 'true' : 'false');
    button.addEventListener('click', () => {
      state.categoryFilter = state.categoryFilter === category.id ? null : category.id;
      renderDynamic();
    });
    bar.append(button);
  }
  const manage = document.createElement('button');
  manage.type = 'button';
  manage.className = 'side-cat side-manage';
  const manageMark = document.createElement('span');
  manageMark.className = 'pie-slot';
  manageMark.setAttribute('aria-hidden', 'true');
  manage.append(manageMark, document.createTextNode('관리'));
  manage.setAttribute('aria-label', '카테고리 관리');
  manage.addEventListener('click', openCategoryDialog);
  bar.append(manage);
}

function categoryPie(done, total) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 16 16');
  svg.setAttribute('width', '14');
  svg.setAttribute('height', '14');
  svg.setAttribute('aria-hidden', 'true');
  svg.classList.add('pie');
  const track = document.createElementNS(svg.namespaceURI, 'circle');
  track.setAttribute('cx', '8');
  track.setAttribute('cy', '8');
  track.setAttribute('r', '6');
  track.setAttribute('fill', 'none');
  track.setAttribute('stroke', 'currentColor');
  track.setAttribute('stroke-opacity', '0.25');
  track.setAttribute('stroke-width', '2.4');
  const arc = document.createElementNS(svg.namespaceURI, 'circle');
  const length = 2 * Math.PI * 6;
  const ratio = total ? done / total : 0;
  arc.setAttribute('cx', '8');
  arc.setAttribute('cy', '8');
  arc.setAttribute('r', '6');
  arc.setAttribute('fill', 'none');
  arc.setAttribute('stroke', 'currentColor');
  arc.setAttribute('stroke-width', '2.4');
  arc.setAttribute('stroke-linecap', 'round');
  arc.setAttribute('stroke-dasharray', `${length * ratio} ${length}`);
  arc.setAttribute('transform', 'rotate(-90 8 8)');
  svg.append(track, arc);
  return svg;
}

function closeSidebar() {
  $('sidebar')?.classList.remove('is-open');
  const toggle = $('navToggle');
  if (toggle) toggle.setAttribute('aria-expanded', 'false');
  const backdrop = $('navBackdrop');
  if (backdrop) backdrop.hidden = true;
}

function focusComposer() {
  if (state.view === 'calendar' || state.view === 'done') setView('today');
  closeSidebar();
  const input = $('composer');
  input?.scrollIntoView({ block: 'center' });
  input?.focus();
}

function renderViewControls() {
  const sort = $('sortSelect');
  const group = $('groupBtn');
  const overdue = $('overdueBtn');
  if (sort) sort.value = state.sort;
  const sortLabel = $('sortLabel');
  if (sort && sortLabel) sortLabel.textContent = sort.selectedOptions[0]?.textContent || '수동 순서';
  document.querySelectorAll('#sortMenu [role="option"]').forEach((option) => {
    option.setAttribute('aria-selected', option.dataset.value === state.sort ? 'true' : 'false');
  });
  if (group) group.setAttribute('aria-pressed', state.groupByCategory ? 'true' : 'false');
  if (overdue) overdue.setAttribute('aria-pressed', state.dueOnlyOverdue ? 'true' : 'false');
  const tools = document.querySelector('.list-tools');
  if (tools) tools.hidden = state.view === 'calendar';
}

let dueView = null;

function escapeHtml(value) {
  return String(value).replace(/[&<>]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[char]));
}

function renderComposerMirror() {
  const input = $('composer');
  const mirror = $('composerMirror');
  if (!input || !mirror) return;
  const text = input.value;
  if (!text) {
    mirror.textContent = '';
    return;
  }
  const re = /(#[^\s#@]+|@[^\s#@]+|!(?:높음|보통|낮음|high|medium|low|[123])|\d{4}-\d{2}-\d{2}|\d{1,2}\/\d{1,2}|내일|모레|[일월화수목금토]요일|(?:오전|오후)\s*\d{1,2}시(?:\s*\d{1,2}분)?|\d{1,2}:\d{2})/gu;
  let html = '';
  let last = 0;
  for (const match of text.matchAll(re)) {
    html += escapeHtml(text.slice(last, match.index));
    const token = match[0];
    const kind = token.startsWith('#') ? 'tag' : token.startsWith('@') ? 'at' : token.startsWith('!') ? 'bang' : 'when';
    html += `<span class="tok ${kind}">${escapeHtml(token)}</span>`;
    last = match.index + token.length;
  }
  html += escapeHtml(text.slice(last));
  mirror.innerHTML = html;
}

function syncDueControls() {
  const reminder = $('dueReminder');
  const button = $('dueReminderBtn');
  if (reminder && button) button.textContent = reminder.selectedOptions[0]?.textContent || '없음';
  const time = $('dueTime')?.value || '';
  document.querySelectorAll('[data-due-time]').forEach((chip) => {
    chip.setAttribute('aria-pressed', chip.dataset.dueTime === time ? 'true' : 'false');
  });
  document.querySelectorAll('#dueTimeCols button').forEach((chip) => {
    chip.setAttribute('aria-pressed', chip.dataset.part === time ? 'true' : 'false');
  });
  document.querySelectorAll('#dueReminderMenu [role="option"]').forEach((option) => {
    option.setAttribute('aria-selected', option.dataset.value === reminder?.value ? 'true' : 'false');
  });
}

function syncBriefChips() {
  const value = $('briefingTime')?.value || '';
  document.querySelectorAll('[data-brief]').forEach((chip) => {
    chip.setAttribute('aria-pressed', chip.dataset.brief === value ? 'true' : 'false');
  });
}

function renderDueCalendar() {
  const host = $('dueCal');
  if (!host) return;
  const today = todayKey();
  const selected = $('dueDate')?.value || '';
  if (!dueView) {
    const base = selected || today;
    dueView = { year: Number(base.slice(0, 4)), month: Number(base.slice(5, 7)) };
  }
  const { year, month } = dueView;
  host.replaceChildren();
  const bar = document.createElement('div');
  bar.className = 'due-nav';
  const prev = document.createElement('button');
  prev.type = 'button';
  prev.className = 'icon-btn';
  prev.textContent = '‹';
  prev.setAttribute('aria-label', '이전 달');
  prev.addEventListener('click', () => {
    dueView = month === 1 ? { year: year - 1, month: 12 } : { year, month: month - 1 };
    renderDueCalendar();
  });
  const title = document.createElement('strong');
  title.textContent = `${year}년 ${month}월`;
  const next = document.createElement('button');
  next.type = 'button';
  next.className = 'icon-btn';
  next.textContent = '›';
  next.setAttribute('aria-label', '다음 달');
  next.addEventListener('click', () => {
    dueView = month === 12 ? { year: year + 1, month: 1 } : { year, month: month + 1 };
    renderDueCalendar();
  });
  bar.append(prev, title, next);
  const week = document.createElement('div');
  week.className = 'week';
  ['일', '월', '화', '수', '목', '금', '토'].forEach((name, index) => {
    const cell = document.createElement('span');
    cell.textContent = name;
    if (index === 0) cell.classList.add('is-sun');
    if (index === 6) cell.classList.add('is-sat');
    week.append(cell);
  });
  const grid = document.createElement('div');
  grid.className = 'grid';
  grid.tabIndex = 0;
  grid.setAttribute('aria-label', '날짜 선택');
  for (const day of monthGrid(year, month)) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'due-day';
    const dow = weekday(day);
    if (Number(day.slice(5, 7)) !== month) button.classList.add('is-out');
    if (dow === 0) button.classList.add('is-sun');
    if (dow === 6) button.classList.add('is-sat');
    if (holidayLabel(day)) button.classList.add('is-holiday');
    if (day === selected) button.classList.add('is-on');
    button.textContent = String(Number(day.slice(8, 10)));
    button.dataset.day = day;
    if (holidayLabel(day)) button.setAttribute('aria-label', `${day} ${holidayLabel(day)}`);
    button.addEventListener('click', () => {
      $('dueDate').value = day;
      renderDueCalendar();
    });
    grid.append(button);
  }
  grid.addEventListener('keydown', (event) => {
    const current = $('dueDate').value || today;
    const move = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 }[event.key];
    if (!move) return;
    event.preventDefault();
    const next = addDays(current, move);
    $('dueDate').value = next;
    dueView = { year: Number(next.slice(0, 4)), month: Number(next.slice(5, 7)) };
    renderDueCalendar();
    host.querySelector('.grid')?.focus();
  });
  host.append(bar, week, grid);
}

function renderTimeCols() {
  const host = $('dueTimeCols');
  if (!host || host.childElementCount) return;
  const hours = document.createElement('div');
  const minutes = document.createElement('div');
  for (let hour = 0; hour < 24; hour += 1) {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = String(hour).padStart(2, '0');
    button.addEventListener('click', () => setDueTimePart('hour', hour));
    hours.append(button);
  }
  for (const minute of [0, 15, 30, 45]) {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = String(minute).padStart(2, '0');
    button.addEventListener('click', () => setDueTimePart('minute', minute));
    minutes.append(button);
  }
  host.append(hours, minutes);
  host.addEventListener('keydown', (event) => {
    if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return;
    event.preventDefault();
    const current = $('dueTime').value || '09:00';
    const [h, m] = current.split(':').map(Number);
    const delta = event.key === 'ArrowUp' ? 1 : -1;
    const hour = (h + delta + 24) % 24;
    $('dueTime').value = `${String(hour).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
    syncDueControls();
  });
}

function setDueTimePart(part, value) {
  const current = $('dueTime').value || '09:00';
  const [hour, minute] = current.split(':').map(Number);
  const nextHour = part === 'hour' ? value : hour;
  const nextMinute = part === 'minute' ? value : (Number.isFinite(minute) ? minute : 0);
  $('dueTime').value = `${String(nextHour).padStart(2, '0')}:${String(nextMinute).padStart(2, '0')}`;
  syncDueControls();
}

function mountMenus() {
  const sortMenu = $('sortMenu');
  const sort = $('sortSelect');
  if (sortMenu && sort && !sortMenu.childElementCount) {
    [...sort.options].forEach((option) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.setAttribute('role', 'option');
      button.dataset.value = option.value;
      button.textContent = option.textContent;
      button.addEventListener('click', () => {
        sort.value = option.value;
        sort.dispatchEvent(new Event('change'));
        sortMenu.hidden = true;
        $('sortBtn')?.setAttribute('aria-expanded', 'false');
        renderViewControls();
      });
      sortMenu.append(button);
    });
  }
  const reminderMenu = $('dueReminderMenu');
  const reminder = $('dueReminder');
  if (reminderMenu && reminder && !reminderMenu.childElementCount) {
    [...reminder.options].forEach((option) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.setAttribute('role', 'option');
      button.dataset.value = option.value;
      button.textContent = option.textContent;
      button.addEventListener('click', () => {
        reminder.value = option.value;
        reminderMenu.hidden = true;
        $('dueReminderBtn')?.setAttribute('aria-expanded', 'false');
        syncDueControls();
      });
      reminderMenu.append(button);
    });
  }
}

function openDueDialog(id) {
  const task = findTask(id);
  if (!task) return;
  state.focusId = id;
  $('dueTaskId').value = id;
  $('dueDate').value = task.due || '';
  $('dueTime').value = task.dueTime || '';
  $('dueReminder').value = task.reminder || '';
  const base = task.due || todayKey();
  dueView = { year: Number(base.slice(0, 4)), month: Number(base.slice(5, 7)) };
  renderDueCalendar();
  syncDueControls();
  $('dueDialog').showModal();
}

function openRepeatDialog(id) {
  const task = findTask(id);
  if (!task) return;
  state.focusId = id;
  $('repeatTaskId').value = id;
  const rule = task.repeat;
  const freq = rule?.freq || 'daily';
  document.querySelectorAll('input[name="repeatFreq"]').forEach((input) => {
    input.checked = input.value === freq;
  });
  $('repeatInterval').value = rule?.interval || 2;
  $('repeatMonthDay').value = rule?.monthDay === 'last' ? '' : (rule?.monthDay || '');
  $('repeatLastDay').checked = rule?.monthDay === 'last';
  document.querySelectorAll('input[name="repeatWeekday"]').forEach((input) => {
    input.checked = (rule?.weekdays || []).includes(Number(input.value));
  });
  $('repeatStop').hidden = !rule;
  syncRepeatFields();
  $('repeatDialog').showModal();
}

function syncRepeatFields() {
  const freq = document.querySelector('input[name="repeatFreq"]:checked')?.value || 'daily';
  $('repeatWeekly').hidden = freq !== 'weekly';
  $('repeatMonthly').hidden = freq !== 'monthly';
  $('repeatEvery').hidden = freq !== 'interval';
}

function saveRepeat() {
  const task = findTask($('repeatTaskId').value);
  if (!task) return;
  const freq = document.querySelector('input[name="repeatFreq"]:checked')?.value || 'daily';
  const weekdays = [...document.querySelectorAll('input[name="repeatWeekday"]:checked')].map((input) => Number(input.value));
  const monthDay = $('repeatLastDay').checked ? 'last' : (Number($('repeatMonthDay').value) || Number((task.due || todayKey()).slice(8, 10)) || 1);
  task.repeat = normalizeRepeat({
    freq,
    interval: Number($('repeatInterval').value) || 1,
    weekdays,
    monthDay,
  });
  if (!task.seriesId) task.seriesId = String(task.id).split('@')[0];
  if (!task.occurrenceDate) task.occurrenceDate = task.due || todayKey();
  if (!task.due) task.due = task.occurrenceDate;
  task.updatedAt = new Date().toISOString();
  $('repeatDialog').close();
  markDirty();
  renderDynamic();
  announce(`반복을 ${ruleLabel(task.repeat)}로 저장했습니다.`);
}

function stopRepeat() {
  const task = findTask($('repeatTaskId').value);
  if (!task) return;
  task.repeat = null;
  task.updatedAt = new Date().toISOString();
  $('repeatDialog').close();
  markDirty();
  renderDynamic();
  announce('반복을 멈췄습니다.');
}

function openCategoryPicker(id) {
  state.focusId = id;
  state.menu = { id, kind: 'category' };
  renderList();
}

function setCategory(id, categoryId) {
  const task = findTask(id);
  state.menu = null;
  if (!task) return;
  task.categoryId = categoryId || null;
  task.updatedAt = new Date().toISOString();
  markDirty();
  renderDynamic();
}

function openCategoryDialog() {
  renderCategoryManager();
  $('categoryDialog').showModal();
}

function renderCategoryManager() {
  const list = $('catManager');
  if (!list || !state.doc) return;
  list.replaceChildren();
  for (const category of state.doc.categories || []) {
    const row = document.createElement('div');
    row.className = 'cat-edit';
    const input = document.createElement('input');
    input.value = category.name;
    input.maxLength = 24;
    input.setAttribute('aria-label', `${category.name} 이름`);
    const colors = document.createElement('div');
    colors.className = 'swatches';
    for (const color of CATEGORY_COLORS) {
      const swatch = document.createElement('button');
      swatch.type = 'button';
      swatch.className = `swatch cat-${color}`;
      swatch.setAttribute('aria-label', color);
      swatch.setAttribute('aria-pressed', category.color === color ? 'true' : 'false');
      swatch.addEventListener('click', () => {
        category.color = color;
        markDirty();
        renderCategoryManager();
        renderDynamic();
      });
      colors.append(swatch);
    }
    const save = document.createElement('button');
    save.type = 'button';
    save.className = 'btn';
    save.textContent = '이름 저장';
    save.addEventListener('click', () => {
      const name = input.value.replace(/\s+/g, ' ').trim().slice(0, 24);
      if (!name) return;
      category.name = name;
      markDirty();
      renderCategoryManager();
      renderDynamic();
    });
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'btn';
    remove.textContent = '삭제';
    remove.addEventListener('click', () => {
      state.doc.categories = state.doc.categories.filter((item) => item.id !== category.id);
      for (const task of state.doc.tasks) if (task.categoryId === category.id) task.categoryId = null;
      if (state.categoryFilter === category.id) state.categoryFilter = null;
      markDirty();
      renderCategoryManager();
      renderDynamic();
    });
    row.append(input, colors, save, remove);
    list.append(row);
  }
}

function addCategoryFromDialog() {
  const name = $('newCatName').value;
  const id = ensureCategory(name);
  if (!id) return;
  const color = document.querySelector('input[name="newCatColor"]:checked')?.value;
  const category = categoryById(id);
  if (category && CATEGORY_COLORS.includes(color)) category.color = color;
  $('newCatName').value = '';
  markDirty();
  renderCategoryManager();
  renderDynamic();
}

function loadNotified() {
  try { return new Set(JSON.parse(localStorage.getItem(NOTIFIED_KEY) || '[]')); }
  catch { return new Set(); }
}

function saveNotified(keys) {
  localStorage.setItem(NOTIFIED_KEY, JSON.stringify([...keys].slice(-400)));
}

function showNotice(text) {
  const notice = $('notice');
  if (!notice) return;
  notice.textContent = text;
  notice.hidden = false;
  window.clearTimeout(showNotice.timer);
  showNotice.timer = window.setTimeout(() => { notice.hidden = true; }, 5000);
}

async function pushNotification(item) {
  showNotice(`${item.title} — ${item.body}`);
  try {
    const registration = await navigator.serviceWorker?.ready;
    if (registration?.showNotification && Notification.permission === 'granted') {
      await registration.showNotification(item.title, {
        body: item.body,
        tag: item.key,
        lang: 'ko',
        icon: '/todo/icon-192.png',
        data: { url: '/todo/' },
      });
      return;
    }
  } catch { /* 페이지 알림으로 대체 */ }
  if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
    try { new Notification(item.title, { body: item.body, tag: item.key, lang: 'ko' }); } catch { /* ignore */ }
  }
}

function checkNotifications() {
  if (!state.notifyEnabled || !state.doc) return;
  const items = planNotifications({
    tasks: state.doc.tasks,
    now: appNow(),
    briefingTime: state.briefingTime,
    notified: loadNotified(),
  });
  if (!items.length) return;
  const keys = loadNotified();
  for (const item of items) {
    keys.add(item.key);
    void pushNotification(item);
  }
  saveNotified(keys);
}

function renderNotifyControls() {
  const toggle = $('notifyToggle');
  const time = $('briefingTime');
  if (!toggle) return;
  toggle.checked = state.notifyEnabled;
  toggle.disabled = typeof Notification === 'undefined';
  if (time) time.value = state.briefingTime;
  syncBriefChips();
  const note = $('notifyState');
  if (note) {
    const permission = typeof Notification === 'undefined' ? 'unsupported' : Notification.permission;
    note.textContent = permission === 'granted'
      ? '알림이 허용되어 있습니다. 이 탭이나 설치한 앱이 켜져 있을 때만 울립니다.'
      : permission === 'denied'
        ? '브라우저에서 알림이 차단되어 있습니다.'
        : '알림은 이 브라우저나 설치한 앱이 실행 중일 때만 울립니다. 푸시 서버는 없습니다.';
  }
}

function boot() {
  bind();
  const pref = localStorage.getItem(THEME_KEY) || 'system';
  const skin = localStorage.getItem(SKIN_KEY) || 'pastel';
  state.bgCustom = localStorage.getItem(BG_CUSTOM_KEY) === '1';
  const storedBg = localStorage.getItem(BG_KEY);
  applySkin(skin);
  if (state.bgCustom && BG_IDS.includes(storedBg)) applyBg(storedBg);
  applyTheme(THEME_ORDER.includes(pref) ? pref : 'system');
  renderThemeButton();
  requestAnimationFrame(() => document.documentElement.classList.add('theme-ready'));
  state.settings = loadSettings();
  state.hideCompleted = localStorage.getItem(HIDE_DONE_KEY) === '1';
  const sort = localStorage.getItem(SORT_KEY);
  if (['manual', 'category', 'priority', 'due', 'created'].includes(sort)) state.sort = sort;
  state.groupByCategory = localStorage.getItem(GROUP_KEY) === '1';
  state.dueOnlyOverdue = localStorage.getItem(OVERDUE_KEY) === '1';
  const calendarMode = localStorage.getItem('todo.calendarMode');
  if (['all', 'open', 'done'].includes(calendarMode)) state.calendarMode = calendarMode;
  state.notifyEnabled = localStorage.getItem(NOTIFY_KEY) === '1' && typeof Notification !== 'undefined' && Notification.permission === 'granted';
  const brief = localStorage.getItem(BRIEF_KEY);
  if (brief && /^\d{2}:\d{2}$/.test(brief)) state.briefingTime = brief;
  renderHideButton();
  renderViewControls();
  renderNotifyControls();
  if (new URLSearchParams(location.search).has('e2e')) {
    window.__todo = { checkNotifications, planNotifications };
  }
  if ('serviceWorker' in navigator) {
    const hadController = !!navigator.serviceWorker.controller;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (!hadController) return;
      const banner = $('updateBanner');
      if (banner) banner.hidden = false;
    });
    $('updateBtn')?.addEventListener('click', () => location.reload());
    navigator.serviceWorker.register('/todo/sw.js', { scope: '/todo/' }).catch(() => {});
  }
  window.setInterval(checkNotifications, 30000);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') checkNotifications();
  });
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
