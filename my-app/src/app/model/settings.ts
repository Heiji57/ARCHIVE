export type Locale = "ko" | "en" | "zh" | "ja";
export type AccountType = "developer" | "user";

export interface AutoSummarySettings {
  weekly: boolean;
  monthly: boolean;
  yearly: boolean;
}

export interface AppSettings {
  locale: Locale;
  autoSummary: AutoSummarySettings;
  notificationRetentionDays: number;
  /**
   * 할 일 보드 "전체" 보기에 표시할 기간(일). 오늘을 기준으로 앞뒤로 나눠
   * 이 기간 안의 할 일을 불러온다. FE 전용(로컬 저장) — 서버로 동기화하지 않는다.
   */
  todoBoardRangeDays: number;
  lastScheduleCheckAt: string | null;
  /** 신규 할 일 생성 시 기본으로 Google Calendar 에 push할지. */
  calendarAutoPushTodo: boolean;
  /** Google Calendar 에서 일정 삭제 시 연동 할 일도 함께 삭제할지. */
  calendarAutoDeleteTodo: boolean;
  accountType: AccountType;
  /** true once the user has seen and confirmed/skipped the account type screen */
  accountTypeDetermined: boolean;
  /**
   * 리치 에디터(회고록 본문 등)의 브라우저 맞춤법 검사(빨간 밑줄) 표시 여부.
   * api.yaml /settings 계약에 없는 FE 전용 로컬 선호도 — todoBoardRangeDays 와 동일하게
   * 서버로 동기화하지 않고 localStorage 에만 저장한다.
   */
  spellCheck: boolean;
}

export const DEFAULT_SETTINGS: AppSettings = {
  locale: "en",
  autoSummary: { weekly: true, monthly: true, yearly: true },
  notificationRetentionDays: 30,
  todoBoardRangeDays: 60,
  lastScheduleCheckAt: null,
  calendarAutoPushTodo: false,
  calendarAutoDeleteTodo: false,
  accountType: "user",
  accountTypeDetermined: false,
  spellCheck: true,
};

export const SUPPORTED_LOCALES: Array<{ code: Locale; label: string; native: string }> = [
  { code: "ko", label: "Korean", native: "한국어" },
  { code: "en", label: "English", native: "English" },
  { code: "zh", label: "Chinese (Simplified)", native: "中文" },
  { code: "ja", label: "Japanese", native: "日本語" },
];
