/**
 * 순수 로직. 브라우저 DOM에 의존하지 않는다.
 * 스키마 v2는 v1 todos.json을 그대로 읽고, 저장할 때 버전만 올린다.
 */

export const SCHEMA_VERSION = 2;
export const TZ = 'Asia/Seoul';

export const CATEGORY_COLORS = ['blue', 'teal', 'gold', 'green', 'plum', 'clay'];

export const REMINDERS = [
  { id: 'at', label: '정시' },
  { id: '10m', label: '10분 전' },
  { id: '30m', label: '30분 전' },
  { id: '1h', label: '1시간 전' },
  { id: '1d9', label: '하루 전 09:00' },
];

const WEEKDAY_KO = ['일', '월', '화', '수', '목', '금', '토'];

export function seoulDate(value = new Date()) {
  const date = value instanceof Date ? value : new Date(value);
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

export function seoulClock(value = new Date()) {
  const date = value instanceof Date ? value : new Date(value);
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: TZ,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);
  const map = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${String(map.hour ?? '00').padStart(2, '0')}:${String(map.minute ?? '00').padStart(2, '0')}`;
}

export function addDays(ymd, amount) {
  const utc = Date.parse(`${ymd}T00:00:00Z`) + amount * 86400000;
  return new Date(utc).toISOString().slice(0, 10);
}

export function isYmd(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value || '')) return false;
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

export function weekday(ymd) {
  return new Date(`${ymd}T00:00:00Z`).getUTCDay();
}

export function lastDay(year, month) {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

export function ymd(year, month, day) {
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

export function seoulDateTime(day, hours, minutes) {
  const hh = String(hours).padStart(2, '0');
  const mm = String(minutes).padStart(2, '0');
  return new Date(`${day}T${hh}:${mm}:00+09:00`);
}

export function thisWeekday(today, dow) {
  const current = weekday(today);
  const mondayOffset = (current + 6) % 7;
  const monday = addDays(today, -mondayOffset);
  const target = dow === 0 ? 6 : dow - 1;
  return addDays(monday, target);
}

export function nextWeekMonday(today) {
  return addDays(thisWeekday(today, 1), 7);
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

export function normalizeRepeat(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const freq = raw.freq;
  if (!['daily', 'weekdays', 'weekly', 'monthly', 'yearly', 'interval'].includes(freq)) return null;
  const interval = clamp(Math.floor(Number(raw.interval) || 1), 1, 366);
  const weekdays = [...new Set((Array.isArray(raw.weekdays) ? raw.weekdays : []).map(Number).filter((n) => n >= 0 && n <= 6))].sort((a, b) => a - b);
  const monthDay = raw.monthDay === 'last'
    ? 'last'
    : clamp(Math.floor(Number(raw.monthDay) || 1), 1, 31);
  return {
    freq,
    interval,
    weekdays: freq === 'weekly' && !weekdays.length ? [1] : weekdays,
    monthDay,
  };
}

export function ruleLabel(rule) {
  if (!rule) return '';
  if (rule.freq === 'daily') return '매일';
  if (rule.freq === 'weekdays') return '평일';
  if (rule.freq === 'interval') return `${rule.interval}일마다`;
  if (rule.freq === 'weekly') {
    const names = (rule.weekdays || []).map((day) => WEEKDAY_KO[day]).join('·');
    return names ? `매주 ${names}` : '매주';
  }
  if (rule.freq === 'monthly') return rule.monthDay === 'last' ? '매월 말일' : `매월 ${rule.monthDay}일`;
  if (rule.freq === 'yearly') return '매년';
  return '';
}

export function nextOccurrence(rule, fromYmd) {
  const normalized = normalizeRepeat(rule);
  if (!normalized || !isYmd(fromYmd)) return null;
  if (normalized.freq === 'daily') return addDays(fromYmd, 1);
  if (normalized.freq === 'interval') return addDays(fromYmd, normalized.interval);
  if (normalized.freq === 'weekdays') {
    let cursor = addDays(fromYmd, 1);
    for (let i = 0; i < 7; i += 1) {
      const day = weekday(cursor);
      if (day !== 0 && day !== 6) return cursor;
      cursor = addDays(cursor, 1);
    }
    return cursor;
  }
  if (normalized.freq === 'weekly') {
    for (let i = 1; i <= 7; i += 1) {
      const cursor = addDays(fromYmd, i);
      if (normalized.weekdays.includes(weekday(cursor))) return cursor;
    }
    return null;
  }
  if (normalized.freq === 'monthly') {
    let year = Number(fromYmd.slice(0, 4));
    let month = Number(fromYmd.slice(5, 7)) + 1;
    if (month > 12) {
      month = 1;
      year += 1;
    }
    const dim = lastDay(year, month);
    const day = normalized.monthDay === 'last' ? dim : Math.min(normalized.monthDay, dim);
    return ymd(year, month, day);
  }
  if (normalized.freq === 'yearly') {
    const year = Number(fromYmd.slice(0, 4)) + 1;
    const month = Number(fromYmd.slice(5, 7));
    const day = Math.min(Number(fromYmd.slice(8, 10)), lastDay(year, month));
    return ymd(year, month, day);
  }
  return null;
}

export function occurrenceId(seriesId, day) {
  return `${seriesId}@${day}`;
}

export function planNextTask(task, existing, nowIso) {
  if (!task?.repeat) return null;
  const seriesId = task.seriesId || String(task.id).split('@')[0];
  const from = task.occurrenceDate || task.due || seoulDate(nowIso);
  const day = nextOccurrence(task.repeat, from);
  if (!day) return null;
  const id = occurrenceId(seriesId, day);
  if ((existing || []).some((item) => item.id === id || (item.seriesId === seriesId && item.occurrenceDate === day))) return null;
  return {
    id,
    title: task.title,
    memo: task.memo || '',
    priority: task.priority || 'medium',
    due: day,
    dueTime: task.dueTime || null,
    tags: [...(task.tags || [])],
    list: task.list === 'backlog' ? 'backlog' : 'today',
    status: 'open',
    order: Number.isFinite(task.order) ? task.order - 1 : 0,
    createdAt: nowIso,
    updatedAt: nowIso,
    completedAt: null,
    carriedDays: 0,
    repeat: normalizeRepeat(task.repeat),
    seriesId,
    occurrenceDate: day,
    reminder: task.reminder || null,
    categoryId: task.categoryId || null,
  };
}

export function projectOccurrences(tasks, rangeStart, rangeEnd) {
  const out = [];
  const occupied = new Set();
  for (const task of tasks) {
    if (task.seriesId && task.occurrenceDate) occupied.add(`${task.seriesId}@${task.occurrenceDate}`);
    if (task.seriesId && task.id?.includes('@')) occupied.add(task.id);
  }
  for (const task of tasks) {
    if (task.status !== 'open' || !task.repeat) continue;
    const seriesId = task.seriesId || String(task.id).split('@')[0];
    let cursor = task.occurrenceDate || task.due || rangeStart;
    if (!isYmd(cursor)) continue;
    for (let guard = 0; guard < 24; guard += 1) {
      const day = nextOccurrence(task.repeat, cursor);
      if (!day || day > rangeEnd) break;
      cursor = day;
      if (day < rangeStart) continue;
      const id = occurrenceId(seriesId, day);
      if (occupied.has(id)) continue;
      occupied.add(id);
      out.push({
        id,
        seriesId,
        date: day,
        title: task.title,
        dueTime: task.dueTime || null,
        categoryId: task.categoryId || null,
        rule: normalizeRepeat(task.repeat),
      });
    }
  }
  return out;
}

export function isOverdue(task, now = new Date()) {
  if (!task?.due || task.status === 'done' || !isYmd(task.due)) return false;
  const today = seoulDate(now);
  if (task.due < today) return true;
  if (task.due > today) return false;
  if (!task.dueTime) return false;
  return task.dueTime < seoulClock(now);
}

export function reminderInstant(task) {
  if (!task?.due || !isYmd(task.due) || !task.reminder) return null;
  const [hours, minutes] = (task.dueTime || '09:00').split(':').map(Number);
  const base = seoulDateTime(task.due, hours || 0, minutes || 0);
  if (task.reminder === 'at') return base;
  if (task.reminder === '10m') return new Date(base.getTime() - 10 * 60 * 1000);
  if (task.reminder === '30m') return new Date(base.getTime() - 30 * 60 * 1000);
  if (task.reminder === '1h') return new Date(base.getTime() - 60 * 60 * 1000);
  if (task.reminder === '1d9') return seoulDateTime(addDays(task.due, -1), 9, 0);
  return null;
}

export function planNotifications({ tasks, now, briefingTime, notified }) {
  const items = [];
  const seen = notified instanceof Set ? notified : new Set(notified || []);
  const today = seoulDate(now);
  for (const task of tasks) {
    if (task.status !== 'open') continue;
    const at = reminderInstant(task);
    if (!at) continue;
    const key = `${task.id}:${task.reminder}:${task.due}:${task.dueTime || ''}`;
    if (seen.has(key)) continue;
    const delta = now.getTime() - at.getTime();
    if (delta < 0 || delta >= 6 * 60 * 60 * 1000) continue;
    const when = REMINDERS.find((item) => item.id === task.reminder)?.label || '알림';
    items.push({ key, title: task.title, body: `${when} · 기한 ${task.due}${task.dueTime ? ` ${task.dueTime}` : ''}`, kind: 'due' });
  }
  if (briefingTime && /^\d{2}:\d{2}$/.test(briefingTime)) {
    const key = `briefing:${today}`;
    if (!seen.has(key)) {
      const [hours, minutes] = briefingTime.split(':').map(Number);
      const at = seoulDateTime(today, hours, minutes);
      const delta = now.getTime() - at.getTime();
      if (delta >= 0 && delta < 6 * 60 * 60 * 1000) {
        const openToday = tasks.filter((task) => task.status === 'open' && (task.list === 'today' || task.due === today));
        const overdue = tasks.filter((task) => isOverdue(task, now)).length;
        const names = openToday.slice(0, 5).map((task) => task.title).join(', ');
        items.push({
          key,
          title: '아침 브리핑',
          body: `오늘 ${openToday.length}개${names ? ` · ${names}` : ''} · 기한 지남 ${overdue}개`,
          kind: 'brief',
        });
      }
    }
  }
  return items;
}

function mapPriority(value) {
  const v = String(value ?? '').toLowerCase();
  if (v === '1' || v === 'high' || v === '높음') return 'high';
  if (v === '3' || v === 'low' || v === '낮음') return 'low';
  return v === '2' || v === 'medium' || v === '보통' ? 'medium' : null;
}

function resolveMonthDay(month, day, today) {
  const year = Number(today.slice(0, 4));
  const build = (yr) => {
    if (month < 1 || month > 12 || day < 1 || day > lastDay(yr, month)) return null;
    return ymd(yr, month, day);
  };
  const current = build(year);
  if (!current) return null;
  return current < today ? build(year + 1) : current;
}

function upcomingWeekday(today, dow) {
  const current = weekday(today);
  const delta = (dow - current + 7) % 7;
  return addDays(today, delta);
}

export function parseQuickAdd(text, today = seoulDate(new Date())) {
  const src = String(text ?? '').normalize('NFC');
  const tags = [];
  let categoryName = null;
  let priority = null;
  let due = null;
  let dueTime = null;
  const re = /(^|\s)(#([^\s#@]+)|@([^\s#@]+)|!(높음|보통|낮음|high|medium|low|[123])|(\d{4}-\d{2}-\d{2})|(\d{1,2})\/(\d{1,2})|(내일|모레)|((일|월|화|수|목|금|토)요일)|(오전|오후)\s*(\d{1,2})시(?:\s*(\d{1,2})분)?|(\d{1,2}):(\d{2}))(?=\s|$)/giu;
  let out = '';
  let last = 0;
  let match = re.exec(src);
  while (match) {
    const ws = match[1] || '';
    const tokenStart = match.index + ws.length;
    out += src.slice(last, tokenStart);
    last = match.index + match[0].length;
    if (match[3]) tags.push(match[3]);
    else if (match[4]) categoryName = match[4].slice(0, 24);
    else if (match[5]) priority = mapPriority(match[5]);
    else if (match[6] && isYmd(match[6])) due = match[6];
    else if (match[7] && match[8]) {
      const resolved = resolveMonthDay(Number(match[7]), Number(match[8]), today);
      if (resolved) due = resolved;
      else out += `${match[7]}/${match[8]}`;
    } else if (match[9] === '내일') due = addDays(today, 1);
    else if (match[9] === '모레') due = addDays(today, 2);
    else if (match[11]) {
      const index = WEEKDAY_KO.indexOf(match[11]);
      if (index >= 0) due = upcomingWeekday(today, index);
    } else if (match[12] && match[13]) {
      let hour = Number(match[13]);
      const minute = clamp(Number(match[14] || 0), 0, 59);
      if (match[12] === '오전') hour = hour === 12 ? 0 : hour;
      else hour = hour === 12 ? 12 : hour + 12;
      if (hour >= 0 && hour <= 23) dueTime = `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
    } else if (match[15] && match[16]) {
      const hour = Number(match[15]);
      const minute = Number(match[16]);
      if (hour >= 0 && hour <= 23 && minute >= 0 && minute <= 59) {
        dueTime = `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
      }
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
  return { title, tags: uniq, priority: priority || 'medium', due, dueTime, categoryName };
}

export function monthGrid(year, month) {
  const first = ymd(year, month, 1);
  const start = addDays(first, -((weekday(first) + 6) % 7));
  const days = [];
  for (let i = 0; i < 42; i += 1) days.push(addDays(start, i));
  return days;
}
