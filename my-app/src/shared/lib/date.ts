import type { Locale } from "@/app/model/settings";

const LOCALE_TAG: Record<Locale, string> = {
  ko: "ko-KR",
  en: "en-US",
  zh: "zh-CN",
  ja: "ja-JP",
};

function pad(value: number) {
  return String(value).padStart(2, "0");
}

function clone(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 12);
}

export function addDays(date: Date, amount: number) {
  const next = clone(date);
  next.setDate(next.getDate() + amount);
  return next;
}

export function addMonths(date: Date, amount: number) {
  return new Date(date.getFullYear(), date.getMonth() + amount, 1, 12);
}

export function startOfWeek(date: Date) {
  const next = clone(date);
  next.setDate(next.getDate() - next.getDay());
  return next;
}

export function endOfWeek(date: Date) {
  return addDays(startOfWeek(date), 6);
}

/**
 * ISO 8601 주 시작(월요일)을 반환. 서버의 weekly 기간 계산(월~일)과 정합.
 * (startOfWeek 는 일요일 기준이므로 요약 periodStart 계산에는 이 함수를 사용한다.)
 */
export function startOfISOWeek(date: Date) {
  const next = clone(date);
  const day = next.getDay(); // 0=일 .. 6=토
  const offset = day === 0 ? 6 : day - 1;
  next.setDate(next.getDate() - offset);
  return next;
}

/** ISO 주의 끝(일요일) = 월요일 + 6일 */
export function endOfISOWeek(date: Date) {
  return addDays(startOfISOWeek(date), 6);
}

export function startOfMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), 1, 12);
}

export function endOfMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0, 12);
}

export function startOfYear(date: Date) {
  return new Date(date.getFullYear(), 0, 1, 12);
}

export function endOfYear(date: Date) {
  return new Date(date.getFullYear(), 11, 31, 12);
}

export function toDateKey(date: Date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function fromDateKey(dateKey: string) {
  const [year, month, day] = dateKey.split("-").map(Number);
  if (!year || !month || !day || isNaN(year) || isNaN(month) || isNaN(day)) {
    return new Date();
  }
  return new Date(year, month - 1, day, 12);
}

export function todayKey() {
  return toDateKey(new Date());
}

/**
 * 주어진 IANA 타임존 기준 "오늘"의 dateKey(YYYY-MM-DD).
 * timeZone 생략 시 브라우저 로컬 기준.
 * (서버가 기간을 user.timezone 으로 계산하므로 FE의 "오늘"도 동일 기준이어야 함)
 */
export function todayKeyInTz(timeZone?: string): string {
  if (!timeZone) return todayKey();
  try {
    // en-CA 로케일은 YYYY-MM-DD 형식을 반환
    return new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date());
  } catch {
    return todayKey();
  }
}

/** date 시점에서 IANA timeZone 의 UTC 대비 오프셋(ms). (wall = utc + offset) */
function tzOffsetMs(date: Date, timeZone: string): number {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const parts = dtf.formatToParts(date);
  const map: Record<string, number> = {};
  for (const p of parts) if (p.type !== "literal") map[p.type] = Number(p.value);
  const asUTC = Date.UTC(
    map.year,
    map.month - 1,
    map.day,
    map.hour,
    map.minute,
    map.second,
  );
  return asUTC - date.getTime();
}

/**
 * dateKey(YYYY-MM-DD) + "HH:mm" 벽시계 시각(timeZone 기준)을 UTC ISO 문자열로 변환.
 * 서버 Todo start_time/end_time(UTC) 전송용. timeZone 생략 시 브라우저 로컬.
 */
export function localTimeToUtcISO(
  dateKey: string,
  hhmm: string,
  timeZone?: string,
): string {
  const guess = Date.parse(`${dateKey}T${hhmm}:00Z`); // 벽시계를 UTC 로 가정
  if (Number.isNaN(guess)) return new Date().toISOString();
  if (!timeZone) return new Date(guess).toISOString();
  const offset = tzOffsetMs(new Date(guess), timeZone);
  return new Date(guess - offset).toISOString();
}

/** UTC ISO 문자열을 timeZone 기준 "HH:mm" 벽시계 시각으로 변환. (서버 → FE 표시용) */
export function utcISOToLocalTime(iso: string, timeZone?: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return new Intl.DateTimeFormat("en-GB", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(d);
}

export function isSameMonth(left: Date, right: Date) {
  return (
    left.getFullYear() === right.getFullYear() &&
    left.getMonth() === right.getMonth()
  );
}

export function isInRange(dateKey: string, start: Date, end: Date) {
  const t = fromDateKey(dateKey).getTime();
  return t >= start.getTime() && t <= end.getTime();
}

/** ISO 8601 week number (Mon-based) */
export function getISOWeek(date: Date): number {
  const d = new Date(
    Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()),
  );
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
}

export function getWeekKey(date: Date): string {
  return `${date.getFullYear()}-W${pad(getISOWeek(date))}`;
}

/** ISO 8601 연도+주차의 월요일을 로컬 Date로 반환한다(getISOWeek 의 역함수). */
export function dateOfISOWeek(year: number, week: number): Date {
  const simple = new Date(Date.UTC(year, 0, 1 + (week - 1) * 7));
  const dow = simple.getUTCDay() || 7; // 월=1 .. 일=7
  simple.setUTCDate(simple.getUTCDate() - dow + 1);
  return new Date(
    simple.getUTCFullYear(),
    simple.getUTCMonth(),
    simple.getUTCDate(),
    12,
  );
}

export function formatMonthLabel(date: Date, locale: Locale = "ko") {
  return new Intl.DateTimeFormat(LOCALE_TAG[locale], {
    year: "numeric",
    month: "long",
  }).format(date);
}

export function formatYearMonth(date: Date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}`;
}

export function formatFullDate(date: Date, locale: Locale = "ko") {
  return new Intl.DateTimeFormat(LOCALE_TAG[locale], {
    year: "numeric",
    month: "long",
    day: "numeric",
    weekday: "long",
  }).format(date);
}

export function getMonthGrid(date: Date) {
  // Monday-first grid (Linear design). Weeks start on Monday.
  const calendarStart = startOfISOWeek(startOfMonth(date));
  return Array.from({ length: 42 }, (_, index) => addDays(calendarStart, index));
}

/** Calendar grid in compact form: weeks of 7 days, only enough to cover the month */
export function getMonthGridCompact(date: Date) {
  const calendarStart = startOfISOWeek(startOfMonth(date));
  const calendarEnd = endOfISOWeek(endOfMonth(date));
  const days: Date[] = [];
  let cursor = calendarStart;
  while (cursor.getTime() <= calendarEnd.getTime()) {
    days.push(cursor);
    cursor = addDays(cursor, 1);
  }
  return days;
}

// ─── GitHub push periodKey 계산 ──────────────────────────────────────────────

/** ISO 주(週) Monday 날짜를 반환 (로컬 시간 기준, hour=12으로 고정) */
function isoWeekMonday(date: Date): Date {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 12);
  const day = d.getDay(); // 0=Sun
  const offset = day === 0 ? 6 : day - 1;
  d.setDate(d.getDate() - offset);
  return d;
}

/** weekStart 에서 시작하는 7일 중 가장 많이 포함된 달(majority-day 방식)을 반환 */
function weekMajorityMonth(weekStart: Date): { year: number; month: number } {
  const counts = new Map<string, number>();
  for (let i = 0; i < 7; i++) {
    const d = new Date(
      weekStart.getFullYear(),
      weekStart.getMonth(),
      weekStart.getDate() + i,
      12,
    );
    const k = `${d.getFullYear()}-${d.getMonth()}`;
    counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  let bestKey = "";
  let best = 0;
  for (const [k, v] of counts) {
    if (v > best) {
      best = v;
      bestKey = k;
    }
  }
  const [y, m] = bestKey.split("-");
  return { year: Number(y), month: Number(m) };
}

/**
 * weekStart 이 year/month(0-based) 에서 몇 번째 majority-day 주인지 반환 (1-based).
 * majority-day = 해당 7일 중 4일 이상이 포함된 달.
 */
function weekNumberInMonth(
  weekStart: Date,
  year: number,
  month: number,
): number {
  // 해당 month 의 1일을 ISO-week Monday 로 당긴다
  const firstOfMonth = new Date(year, month, 1, 12);
  let cursor = isoWeekMonday(firstOfMonth);
  // cursor 의 majority 가 year/month 가 될 때까지 전진
  while (true) {
    const { year: cy, month: cm } = weekMajorityMonth(cursor);
    if (cy === year && cm === month) break;
    cursor = new Date(
      cursor.getFullYear(),
      cursor.getMonth(),
      cursor.getDate() + 7,
      12,
    );
  }
  // weekStart 까지 year/month majority 인 주 개수 세기
  let n = 0;
  let c = new Date(cursor);
  while (c.getTime() <= weekStart.getTime() + 1000) {
    const { year: cy, month: cm } = weekMajorityMonth(c);
    if (cy === year && cm === month) n++;
    c = new Date(c.getFullYear(), c.getMonth(), c.getDate() + 7, 12);
  }
  return n;
}

/**
 * 회고 retroType + dateKey 로부터 GitHub push 용 periodKey 를 계산한다.
 * - daily:   YYYY-MM-DD  (= dateKey 그대로)
 * - weekly:  YYYY-MM-Wn  (majority-day 방식, n=1~6)
 * - monthly: YYYY-MM
 * - yearly:  YYYY
 */
export function toPeriodKey(
  retroType: "daily" | "weekly" | "monthly" | "yearly",
  dateKey: string,
): string {
  switch (retroType) {
    case "daily":
      return dateKey;
    case "monthly":
      return dateKey.slice(0, 7); // YYYY-MM
    case "yearly":
      return dateKey.slice(0, 4); // YYYY
    case "weekly": {
      const date = fromDateKey(dateKey);
      const weekStart = isoWeekMonday(date);
      const { year, month } = weekMajorityMonth(weekStart);
      const n = weekNumberInMonth(weekStart, year, month);
      const mm = String(month + 1).padStart(2, "0");
      return `${year}-${mm}-W${n}`;
    }
  }
}

/**
 * 현재 시각 기준으로 다음 30분 경계를 시작 시간으로, 1시간 후를 종료 시간으로 반환.
 * 예: 3:12 → { startTime: "03:30", endTime: "04:30" }
 *     3:45 → { startTime: "04:00", endTime: "05:00" }
 */
export function computeAutoTodoTime(): { startTime: string; endTime: string } {
  const now = new Date();
  const h = now.getHours();
  const m = now.getMinutes();
  const rawStartM = Math.ceil(m / 30) * 30;
  const startH = rawStartM >= 60 ? (h + 1) % 24 : h;
  const startM = rawStartM >= 60 ? 0 : rawStartM;
  // start/end 는 항상 같은 날짜(dateKey)에 실려 전송되므로, +1시간이 자정을 넘기면
  // % 24 로 감싸지 않고 그날 마지막 시각(23:59)으로 clamp 한다 — 안 그러면 예: 시작
  // 23:30 → 끝 00:30 처럼 끝이 시작보다 "이른" 시각이 되어 서버 검증(end > start)에
  // 걸린다(setTodoTime 의 수동 종료시각 자동 채움과 동일한 clamp 정책).
  const startTotal = startH * 60 + startM;
  const endTotal = Math.min(24 * 60 - 1, startTotal + 60);
  const endH = Math.floor(endTotal / 60);
  const endM = endTotal % 60;
  return {
    startTime: `${pad(startH)}:${pad(startM)}`,
    endTime: `${pad(endH)}:${pad(endM)}`,
  };
}
