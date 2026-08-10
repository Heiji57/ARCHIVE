/**
 * API(snake_case) ↔ FE 도메인(camelCase) 변환 경계.
 * 이 파일에서만 변환하고 FE 내부는 기존 camelCase 타입을 그대로 쓴다.
 */
import type { GithubPush, JournalEntry } from "@/entities/entry/model/types";
import { formatSummaryTitle } from "@/entities/entry/lib/summaryTitle";
import type { Folder } from "@/entities/folder/model/types";
import type {
  NoticeCategory,
  NoticeType,
  NotificationItem,
} from "@/entities/notification/model/types";
import type { RetroTemplate } from "@/entities/template/model/types";
import type { Todo, TodoStats } from "@/entities/todo/model/types";
import type { OAuthProvider, User } from "@/entities/user/model/types";
import { DEFAULT_SETTINGS, type AccountType, type AppSettings, type Locale } from "@/app/model/settings";
import { readSpellCheckPref } from "@/shared/lib/spellCheckPrefs";
import { readTodoBoardRange } from "@/shared/lib/todoRangePrefs";
import { utcISOToLocalTime } from "@/shared/lib/date";
import type { components } from "./schema";

type UserResponse = components["schemas"]["UserResponse"];
type TodoResponse = components["schemas"]["TodoResponse"];
type TodoStatsResponse = components["schemas"]["TodoStatsResponse"];
type EntryResponse = components["schemas"]["EntryResponse"];
type FolderResponse = components["schemas"]["FolderResponse"];
type SettingsResponse = components["schemas"]["SettingsResponse"];
type NotificationResponse = components["schemas"]["NotificationResponse"];
type RetroTemplateResponse = components["schemas"]["RetroTemplateResponse"];

/**
 * API UserResponse({id,email})를 FE User 로 변환.
 * displayName/avatarUrl/oauthProvider/createdAt 는 API 계약에 없으므로
 * 클라 전용 값으로 보존하거나 fallback 한다 (displayName 없으면 email local-part).
 */
export function toUser(
  api: UserResponse,
  opts: { displayName?: string | null; oauthProvider?: OAuthProvider | null } = {},
): User {
  const fallbackName = api.email.split("@")[0] ?? api.email;
  return {
    id: api.id,
    email: api.email,
    // 서버 제공 필드 (country/timezone 필수, region nullable)
    country: api.country,
    region: api.region ?? null,
    timezone: api.timezone,
    accountType: api.accountType as AccountType,
    // 아래는 API 미제공 — 클라 전용 보존/폴백
    displayName: opts.displayName?.trim() || fallbackName,
    oauthProvider: opts.oauthProvider ?? null,
    avatarUrl: null,
    createdAt: new Date().toISOString(),
  };
}

// ─── Todo ─────────────────────────────────────────────────────────────────
export function toTodo(api: TodoResponse): Todo {
  // 서버는 시간을 UTC ISO + timezone 으로 보관 → FE 표시는 "HH:mm" 벽시계로 환산.
  const startTime = api.start_time
    ? utcISOToLocalTime(api.start_time, api.timezone ?? undefined)
    : null;
  const endTime = api.end_time
    ? utcISOToLocalTime(api.end_time, api.timezone ?? undefined)
    : null;
  return {
    id: api.id,
    title: api.title,
    status: api.status,
    completed: api.completed,
    dateKey: api.date_key,
    description: api.description,
    createdAt: api.created_at,
    completedAt: api.completed_at ?? null,
    startTime,
    endTime,
    calendarLinked: api.calendar_linked,
    calendarPushStatus: api.calendar_push_status ?? null,
    isVirtual: api.is_virtual ?? false,
    seriesId: api.series_id ?? null,
    originalDateKey: api.original_date_key ?? null,
    recurrenceRule: api.recurrence_rule
      ? { ...api.recurrence_rule, until: api.recurrence_rule.until ?? null }
      : null,
    tags: api.tags ?? [],
  };
}

/** TodoStatsResponse(snake) → TodoStats(camel). GET /todos/stats */
export function toTodoStats(api: TodoStatsResponse): TodoStats {
  return {
    range: api.range,
    total: api.total,
    doneCount: api.done_count,
    inProgressCount: api.in_progress_count,
    notStartCount: api.not_start_count,
    completionRate: api.completion_rate,
    weeklyTrend: api.weekly_trend.map((d) => ({
      dateKey: d.date_key,
      doneCount: d.done_count,
    })),
    tagDistribution: api.tag_distribution.map((t) => ({
      tag: t.tag,
      count: t.count,
    })),
    retroCount: api.retro_count,
  };
}

// ─── JournalEntry ───────────────────────────────────────────────────────────
export function toEntry(api: EntryResponse): JournalEntry {
  // api.githubPush 는 camelCase 그대로 (api.yaml 정의). null = 미push.
  const githubPush: GithubPush | null = api.githubPush
    ? {
        pushedAt: api.githubPush.pushedAt,
        commitSha: api.githubPush.commitSha,
        htmlUrl: api.githubPush.htmlUrl,
        path: api.githubPush.path,
        repositoryFullName: api.githubPush.repositoryFullName,
      }
    : null;
  const isSummary = api.isSummary ?? false;
  return {
    id: api.id,
    dateKey: api.date_key,
    // 요약(GET /entries/paginated, isSummary=true)은 서버 title 기본값
    // ("{periodStart} ~ {periodEnd}") 대신 FE 자체 라벨을 쓴다 — toSummaryEntry
    // (GET /summaries)와 동일한 항목이 같은 제목으로 보이도록 포맷을 공유한다.
    title: isSummary ? formatSummaryTitle(api.retro_type, api.date_key) : api.title,
    content: api.content,
    retroType: api.retro_type,
    updatedAt: api.updated_at ?? api.created_at,
    githubPush,
    // synced 는 서버 push 레코드 기반 (localStorage 서명 불필요)
    synced: githubPush !== null,
    isSummary,
    status: api.status ?? null,
    folderId: api.folderId ?? null,
  };
}

// ─── Folder ─────────────────────────────────────────────────────────────────
export function toFolder(api: FolderResponse): Folder {
  return {
    id: api.id,
    name: api.name,
    parentFolderId: api.parentFolderId ?? null,
    folderCount: api.folderCount,
    entryCount: api.entryCount,
    createdAt: api.createdAt,
    updatedAt: api.updatedAt ?? null,
  };
}

// ─── Settings ────────────────────────────────────────────────────────────────
export function toSettings(api: SettingsResponse, current?: AppSettings): AppSettings {
  return {
    locale: api.locale as Locale,
    autoSummary: {
      weekly: api.autoSummaryWeekly,
      monthly: api.autoSummaryMonthly,
      yearly: api.autoSummaryYearly,
    },
    notificationRetentionDays: api.notificationRetentionDays,
    lastScheduleCheckAt: api.lastScheduleCheckAt ?? null,
    calendarAutoPushTodo: api.calendarAutoPushTodo ?? false,
    calendarAutoDeleteTodo: api.calendarAutoDeleteTodo ?? false,
    // FE-only fields — preserve existing local values (not stored server-side)
    accountType: current?.accountType ?? DEFAULT_SETTINGS.accountType,
    accountTypeDetermined: current?.accountTypeDetermined ?? DEFAULT_SETTINGS.accountTypeDetermined,
    todoBoardRangeDays:
      current?.todoBoardRangeDays ??
      readTodoBoardRange(DEFAULT_SETTINGS.todoBoardRangeDays),
    spellCheck:
      current?.spellCheck ?? readSpellCheckPref(DEFAULT_SETTINGS.spellCheck),
  };
}

export function fromSettings(
  s: AppSettings,
): components["schemas"]["UpdateSettingsRequest"] {
  return {
    locale: s.locale,
    autoSummaryWeekly: s.autoSummary.weekly,
    autoSummaryMonthly: s.autoSummary.monthly,
    autoSummaryYearly: s.autoSummary.yearly,
    notificationRetentionDays: s.notificationRetentionDays,
    lastScheduleCheckAt: s.lastScheduleCheckAt,
    calendarAutoPushTodo: s.calendarAutoPushTodo,
    calendarAutoDeleteTodo: s.calendarAutoDeleteTodo,
  };
}

// ─── Notification ────────────────────────────────────────────────────────────
// API type 'error' 는 FE 에 없으므로 'warning' 으로, category 는 그대로 매핑.
const NOTICE_TYPE_MAP: Record<NotificationResponse["type"], NoticeType> = {
  info: "info",
  success: "success",
  warning: "warning",
  error: "warning",
};

export function toNotification(api: NotificationResponse): NotificationItem {
  return {
    id: api.id,
    type: NOTICE_TYPE_MAP[api.type],
    category: api.category as NoticeCategory,
    title: api.title,
    message: api.message,
    timestamp: api.created_at,
    read: api.is_read,
  };
}

export function toTemplate(api: RetroTemplateResponse): RetroTemplate {
  return {
    id: api.id,
    name: api.name,
    retroType: api.retro_type,
    content: api.content,
    isDefault: api.is_default,
    isActive: api.is_active,
    createdAt: api.created_at,
    updatedAt: api.updated_at ?? api.created_at,
  };
}
