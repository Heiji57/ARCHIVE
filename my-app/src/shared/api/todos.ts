/** Todo 도메인 API. 반환은 FE 도메인 타입(camelCase)으로 매핑해 돌려준다. */
import type {
  RecurrenceRule,
  RecurrenceScope,
  StatsRange,
  TaskStatus,
  Todo,
  TodoStats,
} from "@/entities/todo/model/types";
import { request } from "./client";
import { toTodo, toTodoStats } from "./mappers";
import type { components } from "./schema";

type TodoResponse = components["schemas"]["TodoResponse"];
type TodoStatsResponse = components["schemas"]["TodoStatsResponse"];

/** 기간 범위(from~to) 또는 단일 날짜의 할 일 조회. GET /todos → Todo[] */
export async function apiListTodos(params: {
  from?: string;
  to?: string;
  dateKey?: string;
}): Promise<Todo[]> {
  const data = await request<TodoResponse[] | null | undefined>("/todos", {
    query: params,
  });
  return (Array.isArray(data) ? data : []).map(toTodo);
}

/** 대시보드 통계 조회. GET /todos/stats?range=&tz= → TodoStats */
export async function apiGetTodoStats(
  range: StatsRange,
  tz?: string,
): Promise<TodoStats> {
  const res = await request<TodoStatsResponse>("/todos/stats", {
    query: { range, ...(tz ? { tz } : {}) },
  });
  return toTodoStats(res);
}

export async function apiCreateTodo(input: {
  title: string;
  dateKey: string;
  description?: string;
  status?: TaskStatus;
  /** UTC ISO datetime (localTimeToUtcISO 변환 후 전달) */
  startTimeUtc?: string | null;
  endTimeUtc?: string | null;
  /** start_time/end_time 중 하나라도 있으면 필수 (api.yaml TodoCreateRequest) */
  timezone?: string | null;
  /**
   * null/생략 = 사용자 설정(calendarAutoPushTodo) 기본값 적용.
   * true/false = 이 할 일에 한해 개별 지정.
   */
  pushToCalendar?: boolean | null;
  /** 반복 규칙. null/생략 = 단건(비반복) todo. */
  recurrenceRule?: RecurrenceRule | null;
  /** 태그 목록(각 1~20자, 최대 10개). 생략 = 빈 배열. */
  tags?: string[];
  /** 마감일(포함, YYYY-MM-DD). dateKey 이상이어야 한다. null = 마감일 없음. */
  dueDate?: string | null;
}): Promise<Todo> {
  const hasTime = input.startTimeUtc != null || input.endTimeUtc != null;
  const res = await request<TodoResponse>("/todos", {
    method: "POST",
    body: {
      title: input.title,
      date_key: input.dateKey,
      description: input.description ?? "",
      status: input.status ?? "not-start",
      ...(input.startTimeUtc !== undefined && { start_time: input.startTimeUtc }),
      ...(input.endTimeUtc !== undefined && { end_time: input.endTimeUtc }),
      ...(hasTime && { timezone: input.timezone ?? null }),
      // null/undefined 는 필드 생략 → 서버가 calendarAutoPushTodo 설정으로 처리
      ...(input.pushToCalendar != null && { push_to_calendar: input.pushToCalendar }),
      ...(input.recurrenceRule !== undefined && { recurrence_rule: input.recurrenceRule }),
      tags: input.tags ?? [],
      ...(input.dueDate !== undefined && { due_date_key: input.dueDate }),
    },
  });
  return toTodo(res);
}

/**
 * Todo 부분 수정. 시간 필드는 UTC ISO datetime + IANA timezone 으로 전송한다
 * (api.yaml TodoUpdateRequest: omit=unchanged, null=clear, string=set).
 * recurrenceScope 생략 시 서버 기본값 "this"(해당 회차만 수정)로 동작한다.
 */
export async function apiUpdateTodo(
  id: string,
  patch: Partial<
    Pick<Todo, "title" | "status" | "description" | "dateKey">
  > & {
    /** UTC ISO datetime 또는 null(clear). omit 시 미변경. */
    startTime?: string | null;
    endTime?: string | null;
    /** start/end 중 하나라도 non-null 로 설정 시 필수. */
    timezone?: string | null;
    /** 반복 시리즈 수정 범위. 생략 = "this". */
    recurrenceScope?: Extract<RecurrenceScope, "this" | "following">;
    /** recurrenceScope: "following" 일 때 새 시리즈에 적용할 규칙. 생략 시 기존 규칙 유지. */
    recurrenceRule?: RecurrenceRule | null;
    /** 태그 목록. omit=미변경, array(빈 배열 포함)=전체 교체. */
    tags?: string[];
    /** 마감일(YYYY-MM-DD). omit=미변경, null=삭제, string=설정. dateKey 이상이어야 한다. */
    dueDate?: string | null;
  },
): Promise<Todo> {
  const body: components["schemas"]["TodoUpdateRequest"] = {
    recurrence_scope: patch.recurrenceScope ?? "this",
  };
  if (patch.title !== undefined) body.title = patch.title;
  if (patch.status !== undefined) body.status = patch.status;
  if (patch.description !== undefined) body.description = patch.description;
  if (patch.dateKey !== undefined) body.date_key = patch.dateKey;
  if (patch.startTime !== undefined) body.start_time = patch.startTime;
  if (patch.endTime !== undefined) body.end_time = patch.endTime;
  if (patch.timezone !== undefined) body.timezone = patch.timezone;
  if (patch.recurrenceRule !== undefined) body.recurrence_rule = patch.recurrenceRule;
  if (patch.tags !== undefined) body.tags = patch.tags;
  if (patch.dueDate !== undefined) body.due_date_key = patch.dueDate;
  const res = await request<TodoResponse>(`/todos/${id}`, {
    method: "PATCH",
    body,
  });
  return toTodo(res);
}

/** recurrenceScope 생략 시 서버 기본값 "this"(해당 회차만 삭제)로 동작한다. */
export async function apiDeleteTodo(
  id: string,
  recurrenceScope?: RecurrenceScope,
): Promise<void> {
  await request(`/todos/${id}`, {
    method: "DELETE",
    ...(recurrenceScope !== undefined && { query: { recurrenceScope } }),
  });
}

/** POST /todos/{id}/calendar-link — 캘린더 연동 추가(비동기 반영). */
export async function apiLinkCalendarTodo(id: string): Promise<void> {
  await request(`/todos/${id}/calendar-link`, { method: "POST" });
}

/** DELETE /todos/{id}/calendar-link — 캘린더 연동 해제(비동기 반영). */
export async function apiUnlinkCalendarTodo(id: string): Promise<void> {
  await request(`/todos/${id}/calendar-link`, { method: "DELETE" });
}

type TagSearchResponse = components["schemas"]["TagSearchResponse"];

/**
 * 태그 자동완성 검색. GET /todos/tags/search?q=&limit= → 사용 빈도순 태그명 목록.
 * 이 사용자가 지금까지 쓴 전체 태그 이력에서 검색한다(현재 FE에 로드된 범위와 무관).
 */
export async function apiSearchTags(query: string, limit = 8): Promise<string[]> {
  const res = await request<TagSearchResponse>("/todos/tags/search", {
    query: { q: query, limit },
  });
  return res.tags;
}
