export type TaskStatus = "done" | "in-progress" | "not-start";

export interface RecurrenceRule {
  unit: "day" | "week";
  /** 반복 간격 (1~365). 예: unit="week", interval=2 → 2주마다. */
  interval: number;
  /** 반복 종료 날짜(포함, 로컬 "YYYY-MM-DD"). null = 무기한. */
  until: string | null;
}

/**
 * 반복 시리즈 수정/삭제 범위.
 * "this" = 이 회차만, "following" = 이 회차부터 이후 전체, "all" = 시리즈 전체(삭제 전용).
 */
export type RecurrenceScope = "this" | "following" | "all";

export interface Todo {
  id: string;
  title: string;
  completed: boolean;
  dateKey: string;
  createdAt: string;
  completedAt?: string | null;
  status: TaskStatus;
  description: string;
  /**
   * 선택적 시작/종료 시각 ("HH:mm", 24시간제). 일간 타임라인 뷰의 블록 배치에 사용.
   * 비어 있으면(오늘 한정) createdAt 시각 기준 1시간 블록으로 자동 배치된다.
   * 서버는 UTC ISO(start_time/end_time) + IANA timezone 으로 보관하고, mappers 에서
   * "HH:mm" 벽시계로 환산한다(api.yaml TodoResponse).
   */
  startTime?: string | null;
  endTime?: string | null;
  /** Google Calendar 연동 여부 (push 완료/대기/진행 중 포함). */
  calendarLinked: boolean;
  /** 연동 세부 상태. null = 미연동. */
  calendarPushStatus: "pending" | "syncing" | "synced" | "failed" | "pending_delete" | null;
  /** 반복 시리즈의 가상 인스턴스(DB row 없음). ID 형식: "{base_id}::{slot_date}". */
  isVirtual: boolean;
  /** 예외 row(또는 가상 인스턴스)의 베이스 todo ID. 비반복 및 베이스는 null. */
  seriesId: string | null;
  /** 예외 row가 커버하는 원래 슬롯 날짜(시리즈 멤버십 키). 비반복은 null. */
  originalDateKey: string | null;
  /** 반복 베이스 row에만 존재(현재 목록 조회 응답엔 거의 포함되지 않음). */
  recurrenceRule: RecurrenceRule | null;
  /** 사용자 자유 태그 목록 (각 1~20자, 최대 10개, 중복 없음). 보드 칩/상세 편집/대시보드 분포에 사용. */
  tags: string[];
}

/** 할 일당 최대 태그 개수 (api.yaml TodoCreateRequest/TodoUpdateRequest.tags.maxItems 와 동일). */
export const MAX_TAGS_PER_TODO = 10;
/** 태그 하나의 최대 길이 (api.yaml tags.items.maxLength 와 동일). */
export const MAX_TAG_LENGTH = 20;

// ─── Dashboard stats (GET /todos/stats) ──────────────────────────────────────

/** 대시보드 통계 집계 범위. */
export type StatsRange = "today" | "week" | "month";

/** 이번 ISO주 하루치 완료 개수 (월~일 7칸). */
export interface WeeklyTrendDay {
  dateKey: string;
  doneCount: number;
}

/** 태그별 할 일 개수 (내림차순, tag=null 제외). */
export interface TagCount {
  tag: string;
  count: number;
}

/** GET /todos/stats 응답 (FE 도메인 타입). */
export interface TodoStats {
  range: StatsRange;
  total: number;
  doneCount: number;
  inProgressCount: number;
  notStartCount: number;
  /** 0~100 정수. done/total. total=0 이면 0. */
  completionRate: number;
  /** 항상 이번 ISO주 월~일 7칸 (range 와 무관). */
  weeklyTrend: WeeklyTrendDay[];
  /** range 범위 내 태그별 개수, 내림차순. */
  tagDistribution: TagCount[];
  /** 여태까지 작성한 회고 전체 개수(range 무관, all-time). */
  retroCount: number;
}
