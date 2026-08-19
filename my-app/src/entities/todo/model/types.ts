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
   * NOTE: api.yaml 의 Todo 스키마에는 시간 필드가 없다(계약 간극, CLAUDE.md §8 참고).
   *   → 현재 FE 로컬 상태로만 유지되며, 영속화하려면 백엔드에 start_time/end_time 추가 필요.
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
  /** 선택적 마감일 ("YYYY-MM-DD"). null = 단일 날짜 할 일. */
  dueDate?: string | null;
  /** 반복 베이스 row에만 존재(현재 목록 조회 응답엔 거의 포함되지 않음). */
  recurrenceRule: RecurrenceRule | null;
}
