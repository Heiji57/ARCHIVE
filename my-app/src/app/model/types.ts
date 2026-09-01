import type { CalendarState } from "@/entities/calendar/model/types";
import type { JournalEntry, RetrospectiveType } from "@/entities/entry/model/types";
import type {
  AvailableRepository,
  GitHubCommit,
  GitHubState,
} from "@/entities/github/model/types";
import type {
  NoticeCategory,
  NoticeType,
  NotificationItem,
} from "@/entities/notification/model/types";
import type {
  PendingSummary,
  SummaryKind,
  SummaryReadiness,
} from "@/entities/summary/model/types";
import type { Folder } from "@/entities/folder/model/types";
import type { Session } from "@/entities/session/model/types";
import type { RetroTemplate } from "@/entities/template";
import type { RecurrenceRule, RecurrenceScope, TaskStatus, Todo } from "@/entities/todo/model/types";
import type { OAuthProvider, User } from "@/entities/user/model/types";
import type { AppSettings, Locale } from "@/app/model/settings";

export type AppRoute = "dashboard" | "calendar" | "todos" | "retrospectives" | "settings";

/**
 * 전역 검색 등에서 특정 대상으로 "이동 + 포커스"를 요청하는 일회성 인텐트.
 * - todo: 캘린더로 이동해 해당 날짜로 커서를 옮기고 상세 패널을 연다.
 * - entry: 회고록으로 이동해 해당 회고를 선택한다.
 * 소비 측 위젯이 처리 후 clearFocus() 로 비운다(비영속·transient).
 */
export type AppFocusTarget =
  | { kind: "todo"; todoId: string; dateKey: string }
  | { kind: "entry"; entryId: string };

export interface PersistedAppState {
  todos: Todo[];
  entries: JournalEntry[];
  /**
   * 폴더 로컬 캐시. 서버 모드에서는 GET /folders/contents 응답이 점진적으로
   * 병합되는 부분 캐시(권위 있는 소스는 항상 서버)이고, 데모/mock 모드에서는
   * 이 배열 자체가 유일한 저장소다(entries/todos 와 동일한 패턴).
   */
  folders: Folder[];
  notifications: NotificationItem[];
  settings: AppSettings;
  pendingSummary: PendingSummary | null;
  currentUser: User | null;
  rememberMe: boolean;
  templates: RetroTemplate[];
  /** retroType → 새 회고 생성 시 사용할 활성 템플릿 id */
  activeTemplateIds: Record<RetrospectiveType, string>;
}

export interface AppState extends PersistedAppState {
  /** GitHub 연동은 서버 소스(또는 세션) 기반이라 영속화하지 않는다. */
  github: GitHubState;
  /** Google Calendar 연동도 서버 소스 기반이라 영속화하지 않는다. */
  calendar: CalendarState;
  /**
   * todoQueue 의 debounce 된 PATCH 가 반복 시리즈의 가상 인스턴스를 실체화(materialize)해
   * 서버가 새 id 를 발급했을 때의 1회성 알림(transient·비영속). CalendarDashboard/TodoBoard
   * 가 selectedId 가 이 localId 와 일치하면 newId 로 따라간 뒤 clearTodoIdReplacement() 로
   * 비운다 — 안 그러면 상세 패널이 열린 채로 선택된 항목을 못 찾아 빈 화면이 된다.
   */
  lastTodoIdReplacement: { localId: string; newId: string } | null;
}

export interface PushNotificationOptions {
  category?: NoticeCategory;
  transient?: boolean;
  /** 선택적 액션 버튼 — 토스트/패널에서 href 로 이동 (예: 데모 "로그인"). */
  actionLabel?: string;
  actionHref?: string;
}

export interface ArchiveAppContextValue {
  state: AppState;
  /** 게스트 데모 모드 여부 (?demo=true). 데모에서는 할 일 외 변경이 차단된다. */
  isDemo: boolean;
  /**
   * 전역 검색 등에서 요청한 이동/포커스 인텐트 (없으면 null).
   * 소비 측 위젯(CalendarDashboard/RetrospectiveStudio)이 마운트 후 처리하고
   * clearFocus() 로 비운다.
   */
  focusTarget: AppFocusTarget | null;
  /** 이동/포커스 인텐트를 설정한다(라우팅과 함께 호출). */
  requestFocus: (target: AppFocusTarget) => void;
  /** 처리 완료 후 인텐트를 비운다. */
  clearFocus: () => void;
  addTodo: (
    title: string,
    dateKey?: string,
    options?: {
      status?: TaskStatus;
      description?: string;
      pushToCalendar?: boolean | null;
      /** 반복 규칙. 지정 시 서버에 반복 시리즈 베이스로 생성된다 (api.yaml TodoCreateRequest). */
      recurrenceRule?: RecurrenceRule | null;
      /** 태그 목록(각 1~20자, 최대 10개). 생략 = 빈 배열. */
      tags?: string[];
    },
    onCreated?: (id: string) => void,
  ) => void;
  /**
   * 할 일의 Google Calendar 연동을 토글한다.
   * calendarLinked=true 면 해제(DELETE /calendar-link), false 면 추가(POST /calendar-link).
   * 낙관적 UI: 즉시 pending/pending_delete 로 상태를 바꾸고, API 실패 시 복원.
   * needsReauth 상태에서는 호출하지 말 것(CalendarCard 재연결 후 사용 가능).
   */
  toggleTodoCalendarLink: (id: string) => void;
  updateTodo: (
    id: string,
    patch: Partial<Pick<Todo, "title" | "status" | "description" | "dateKey" | "tags" | "dueDate">>,
  ) => void;
  moveTodo: (id: string, dateKey: string) => void;
  /**
   * 할 일 삭제. 반복 시리즈의 경우 scope 로 삭제 범위를 지정한다
   * (생략/"this" = 이 회차만, "following" = 이 회차부터 이후 전체, "all" = 시리즈 전체).
   * "following"/"all" 은 낙관적으로 로컬에서도 일치하는 시리즈 항목을 함께 제거한다.
   */
  removeTodo: (id: string, scope?: RecurrenceScope) => void;
  /**
   * 반복 시리즈의 가상 인스턴스(isVirtual=true)에서 이 회차부터 이후 전체에 적용할
   * 반복 규칙을 바꾼다 (recurrence_scope: "following" 고정 — 서버가 새 시리즈로 분리).
   * 가상 인스턴스가 아닌 항목에는 서버가 무시하므로 호출하지 않는다.
   * 데모/mock 모드는 반복 확장 로직이 없어 no-op.
   *
   * PATCH 응답은 새로 분리된 시리즈의 base row 원본 형태(is_virtual:false, series_id:null)로
   * 온다 — 목록 조회에서 나오는 가상 인스턴스 모양과 달라 로컬에 그대로 반영해도 반복으로
   * 인식되지 않는다. 호출부(TodoBoard/CalendarDashboard)가 반환된 새 base 의 id 로 현재
   * 보이는 범위를 재조회하고, 그 안에서 seriesId 가 일치하는 항목을 찾아 선택을 옮겨야 한다.
   * 실패/데모 모드는 null.
   */
  updateTodoRecurrence: (id: string, rule: RecurrenceRule) => Promise<Todo | null>;
  /**
   * 비반복 단독 할 일(isVirtual=false, seriesId=null)을 반복 시리즈로 전환한다.
   * 이 항목 자체가 새 시리즈의 base 가 되어(이 날짜가 첫 회차), recurrence_scope 는
   * 의미가 없으므로 지정하지 않는다. 이미 어떤 시리즈에 속한 항목(seriesId 있음)에는
   * 서버가 무시한다 — 그 경우는 updateTodoRecurrence(가상 인스턴스 전용)를 쓴다.
   * 데모/mock 모드는 반복 확장 로직이 없어 no-op.
   *
   * PATCH 응답이 base row 원본 형태로 오는 것은 updateTodoRecurrence 와 동일 — 호출부가
   * 반환된 id 로 재조회 후 선택을 옮겨야 한다. 실패/데모 모드는 null.
   */
  convertTodoToRecurring: (id: string, rule: RecurrenceRule) => Promise<Todo | null>;
  /**
   * 할 일의 시작/종료 시각 설정 (일간 타임라인 블록·드래그 재배치용).
   * null 을 주면 해당 시각을 비운다("HH:mm" 형식). 디바운스 큐를 통해 PATCH 되며,
   * 반복 시리즈 항목이면 recurrenceScope 생략 시 서버 기본값 "this"로 동작해
   * 해당 회차의 예외 row 만 실체화한다(이후 회차는 영향 없음).
   * 반복 시리즈 전체(이 회차부터 이후)의 시간을 바꾸려면 updateTodoTimeRecurrence 를 쓴다.
   */
  setTodoTime: (
    id: string,
    startTime: string | null,
    endTime: string | null,
  ) => void;
  /**
   * 반복 시리즈의 이 회차부터 이후 전체에 적용할 시작/종료 시각을 바꾼다
   * (recurrence_scope: "following" 고정 — 서버가 새 시리즈로 분리).
   * setTodoTime과 달리 디바운스 큐를 거치지 않고 즉시 전송한다(updateTodoRecurrence와 동일 패턴).
   *
   * PATCH 응답은 새로 분리된 시리즈의 base row 원본 형태로 온다 — 호출부(TodoBoard/
   * CalendarDashboard)가 반환된 새 base 의 id 로 현재 보이는 범위를 재조회하고, 그 안에서
   * seriesId 가 일치하는 항목을 찾아 선택을 옮겨야 한다. 실패/데모 모드는 null.
   */
  updateTodoTimeRecurrence: (
    id: string,
    startTime: string | null,
    endTime: string | null,
  ) => Promise<Todo | null>;
  /**
   * 반복 시리즈의 이 회차부터 이후 전체에 적용할 제목/설명/태그를 바꾼다
   * (recurrence_scope: "following" 고정 — 서버가 새 시리즈로 분리).
   * updateTodo 와 달리 디바운스 큐를 거치지 않고 즉시 전송한다
   * (updateTodoRecurrence/updateTodoTimeRecurrence와 동일 패턴).
   *
   * PATCH 응답은 새로 분리된 시리즈의 base row 원본 형태로 온다 — 호출부(TodoBoard/
   * CalendarDashboard)가 반환된 새 base 의 id 로 현재 보이는 범위를 재조회하고, 그 안에서
   * seriesId 가 일치하는 항목을 찾아 선택을 옮겨야 한다. 실패/데모 모드는 null.
   */
  updateTodoFollowing: (
    id: string,
    patch: Partial<Pick<Todo, "title" | "description" | "tags">>,
  ) => Promise<Todo | null>;
  /**
   * state.lastTodoIdReplacement 를 소비한 뒤 비운다. 반복 가상 인스턴스 편집 중
   * 서버가 새 id 를 발급했을 때, 이를 따라간 위젯(CalendarDashboard/TodoBoard)이
   * 처리 직후 호출해 1회성 신호를 정리한다.
   */
  clearTodoIdReplacement: () => void;
  /**
   * AI 요약(isSummary=true) 항목은 title 패치를 무시하고(서버 미저장, FE 합성 라벨)
   * content 패치만 PATCH /summaries/{id}(contentMarkdown)로 디바운스 저장한다.
   * 데모/mock 은 로컬 낙관적 반영만 하고 서버에는 쓰지 않는다.
   */
  updateEntry: (
    id: string,
    patch: Partial<
      Pick<JournalEntry, "title" | "content" | "synced" | "retroType">
    >,
  ) => void;
  /**
   * AI 요약 편집 해제 — PATCH /summaries/{id} 에 contentMarkdown:null 을 보내
   * 사용자 편집을 버리고 AI 원본으로 되돌린다. 결과(되돌아간 마크다운)는 미리 알 수
   * 없으므로 응답을 그대로 state 에 반영한다. 데모/mock 은 no-op.
   */
  revertSummaryEdit: (id: string) => void;
  /**
   * 일간 회고 생성(또는 기존 반환).
   * onIdReplaced: USE_API 모드에서 POST 응답의 서버 ID 로 교체될 때 호출.
   *   호출자(RetrospectiveStudio)가 selectedId 를 서버 ID 로 갱신하는 데 사용.
   */
  createDailyEntry: (
    dateKey: string,
    onIdReplaced?: (serverEntry: JournalEntry) => void,
    /** 지정하면 생성 직후 이 폴더로 옮긴다(현재 폴더 브라우징 중 생성 시). */
    folderId?: string | null,
  ) => { entry: JournalEntry; existed: boolean };
  // ─── GitHub (서버 저장소 연결 모델) ────────────────────────────────────────
  /** 연결 상태·연결된 저장소 목록을 (재)조회해 상태에 반영. */
  refreshGitHub: () => void;
  /** GitHub 에서 연결 후보(public) 저장소 목록 조회. */
  loadGitHubAvailableRepos: () => Promise<AvailableRepository[]>;
  /** githubRepoId 로 저장소 1개 연결. */
  linkGitHubRepo: (githubRepoId: number) => Promise<void>;
  /** 저장소 commitReadEnabled 토글. */
  updateLinkedRepo: (repositoryId: string, commitReadEnabled: boolean) => void;
  /** 단일 저장소 연결 해제. */
  unlinkGitHubRepo: (repositoryId: string) => void;
  /** 모든 저장소 연결 해제. */
  unlinkAllGitHubRepos: () => void;
  /** 현재 GitHub 저장소를 일괄 연결(sync). */
  syncAllGitHubRepos: () => Promise<void>;
  /** push target 저장소 변경 (null = 해제). */
  setPushTarget: (repositoryId: string | null) => void;
  /** 지정 날짜(생략 시 오늘)의 커밋 목록 조회 — 결과를 직접 반환한다. */
  loadCommits: (date?: string) => Promise<GitHubCommit[]>;
  /** 회고 마크다운을 GitHub push target 저장소에 push. */
  pushRetrospective: (
    retroType: "daily" | "weekly" | "monthly" | "yearly",
    dateKey: string,
    contentMarkdown: string,
  ) => Promise<PushRetrospectiveResult>;
  // ─── Google Calendar 연동 ──────────────────────────────────────────────────
  /** 캘린더 연결 상태를 (재)조회해 상태에 반영. */
  refreshCalendar: () => void;
  /** Google Calendar 연결 시작 (팝업 동의 → 상태 갱신). */
  connectCalendar: () => Promise<{ ok: boolean; error?: string }>;
  /** Google Calendar 연결 해제 (연결 + 이벤트 삭제). */
  disconnectCalendar: () => Promise<{ ok: boolean }>;
  /**
   * Google Calendar 수동 동기화 — GET /todos?from=&to= 로 할 일 목록을 재조회한다.
   * 서버가 stale 판단 시 자동으로 Google 과 동기화 후 최신 todos 를 반환하므로
   * 별도의 동기화 전용 엔드포인트를 호출하지 않는다.
   */
  syncCalendar: (from: string, to: string) => Promise<{ ok: boolean }>;
  /**
   * 현재 뷰 날짜 범위의 할 일 + 캘린더 이벤트를 재조회해 state 를 교체한다.
   * CalendarDashboard 가 view/cursor 전환 시 호출한다. 재조회된 목록을 그대로 반환하므로,
   * 호출부가 재조회 직후 특정 항목을 찾아 선택을 옮기는 등의 후속 처리에 쓸 수 있다.
   */
  loadTodosForView: (from: string, to: string) => Promise<Todo[]>;
  /**
   * 할 일 보드 "전체" 보기 로드 — 오늘 기준 앞뒤로 rangeDays 를 나눈 구간의
   * 할 일을 (필요 시 62일 청크로 나눠) 조회해 state.todos 를 교체한다. 반환값은 위와 동일.
   */
  loadTodosForRange: (rangeDays: number) => Promise<Todo[]>;
  /**
   * 회고록 목록 페이지 조회 (GET /entries/paginated). 과거 전체 이력을 최신순으로
   * 페이지 단위 조회하고, 받은 항목을 state.entries 에 병합한다(entries/merge).
   * daily 뿐 아니라 weekly/monthly/yearly(AI 요약)도 이 엔드포인트 하나로 조회한다.
   * - 데모/mock 모드에서는 서버가 없으므로 null 을 반환한다 → 호출부는 클라이언트
   *   목록(state.entries)으로 폴백한다.
   * - 서버 오류는 삼키지 않고 예외로 전파한다(호출부가 목록 로드 실패를 표시하도록).
   */
  loadEntriesPage: (params: {
    /** 생략 시 4개 타입을 합친 "전체" 뷰(GET /entries/paginated 의 retroType 생략). */
    retroType?: RetrospectiveType;
    page: number;
    size: number;
    q?: string;
    from?: string;
    to?: string;
  }) => Promise<import("@/shared/api").EntryPage | null>;
  // ─── Folders (회고록 폴더 정리) ─────────────────────────────────────────────
  /**
   * 폴더 열람(GET /folders/contents). folderId 생략 시 최상위, retroType 생략 시
   * 4개 타입을 합친 "전체" 뷰. 반환된 entries 는 state.entries 에 병합하고,
   * folders 는 state.folders 캐시에 병합한다.
   * 데모/mock 모드에서는 null 을 반환한다 → 호출부는 state.folders/state.entries
   * 를 직접 필터링해 폴백한다.
   */
  loadFolderContents: (params: {
    folderId?: string;
    retroType?: RetrospectiveType;
    page: number;
    size: number;
  }) => Promise<import("@/shared/api").FolderContents | null>;
  /**
   * 폴더 생성. parentFolderId 생략/null 이면 최상위. 데모/mock 은 로컬 상태에만
   * 반영(낙관적, 서버 없음).
   */
  createFolder: (
    name: string,
    parentFolderId?: string | null,
  ) => Promise<Folder | null>;
  /**
   * 폴더 이름 변경 및/또는 이동(부모 변경). patch 에 parentFolderId 를 명시적으로
   * 넣으면(문자열|null) 이동, 필드 자체를 생략하면 이동 없음(이름만 변경).
   */
  updateFolder: (
    folderId: string,
    patch: { name?: string; parentFolderId?: string | null },
  ) => Promise<Folder | null>;
  /**
   * 폴더 삭제. 내용물(하위 폴더·회고록)은 삭제되지 않고 최상위로 풀린다(orphan) —
   * 로컬 캐시(state.folders/state.entries)에도 동일하게 반영한다.
   */
  deleteFolder: (folderId: string) => Promise<boolean>;
  /**
   * 회고록을 다른 폴더로 이동(드래그앤드롭). folderId=null 이면 폴더 소속 해제.
   * retroType 은 daily(journal_entries) vs weekly/monthly/yearly(retro_summaries)
   * 라우팅에 필수.
   */
  moveEntryToFolder: (
    entryId: string,
    retroType: RetrospectiveType,
    folderId: string | null,
  ) => Promise<boolean>;
  /**
   * 통합검색(GET /search) — nav 빠른 이동용. Todo(title) + 회고 daily entry
   * (title+content)만 대상이며, weekly/monthly/yearly 요약은 포함하지 않는다.
   * 결과를 state.todos/state.entries 에 병합해(id 로 upsert) 검색 결과 클릭 시
   * 바로 조회 가능하게 한다(하이드레이션 범위 밖의 오래된 항목이어도 동작).
   * 데모/mock 모드에서는 null 을 반환한다 → 호출부는 로컬 필터로 폴백한다.
   */
  globalSearch: (
    q: string,
    limit?: number,
  ) => Promise<import("@/shared/api").GlobalSearchResult | null>;
  pushNotification: (
    type: NoticeType,
    title: string,
    message: string,
    options?: PushNotificationOptions,
  ) => void;
  markNotificationRead: (id: string) => void;
  markAllNotificationsRead: () => void;
  clearNotification: (id: string) => void;
  clearReadNotifications: () => void;
  clearAllNotifications: () => void;
  dismissNotification: (id: string) => void;
  setLocale: (locale: Locale) => void;
  setAutoSummary: (patch: Partial<AppSettings["autoSummary"]>) => void;
  setCalendarAutoPushTodo: (value: boolean) => void;
  setCalendarAutoDeleteTodo: (value: boolean) => void;
  setNotificationRetention: (days: number) => void;
  /** 할 일 보드 "전체" 보기 기간(일). FE 전용 — localStorage 에만 저장. */
  setTodoBoardRange: (days: number) => void;
  /** 리치 에디터 맞춤법 검사 표시 여부. FE 전용 — localStorage 에만 저장. */
  setSpellCheck: (value: boolean) => void;
  setAccountType: (accountType: import("@/app/model/settings").AccountType) => void;
  /**
   * monthly/annual 요약 생성 전 데이터 밀도 점검.
   * - weekly·mock·오류 시 null (다이얼로그 없이 바로 생성하면 됨).
   * - periodStart 지정 시 해당 기간을, 생략 시 직전 기간(지난 달/작년)을 점검.
   * - entry 추가/수정 전까지 결과를 캐시한다.
   */
  checkSummaryReadiness: (
    kind: SummaryKind,
    periodStart?: string,
  ) => Promise<SummaryReadiness | null>;
  /**
   * 선택한 기간에 이미 요약 회고록(entry)이 존재하는지 확인.
   * - API 모드: 서버(GET /entries)를 진실 공급원으로 조회.
   * - mock 모드: 로컬 상태에서 확인.
   * 덮어쓰기 전 사용자 확인 다이얼로그 분기에 사용.
   */
  checkRetroExists: (
    kind: SummaryKind,
    periodStart: string,
    periodEnd: string,
  ) => Promise<boolean>;
  /**
   * 요약 생성 시작.
   * @param targetDateKey mock 모드 기간 계산 + entry dateKey fallback.
   * @param periodStart API 모드에서 서버에 전달할 기간 시작일(생략 시 직전 기간).
   */
  startSummary: (
    kind: SummaryKind,
    targetDateKey: string,
    periodStart?: string,
    /** true 면 이미 완료된 기간도 강제 재생성 (덮어쓰기 확인 후). */
    force?: boolean,
  ) => void;
  minimizeSummary: () => void;
  completeSummary: () => void;
  cancelSummary: () => void;
  // ─── Topics ─────────────────────────────────────────────────────────────
  loadTopics: () => Promise<import("@/entities/topic/model/types").Topic[]>;
  createTopic: (
    name: string,
    description: string,
  ) => Promise<import("@/entities/topic/model/types").Topic>;
  deleteTopic: (id: string) => Promise<void>;
  generateTopicDigest: (
    topicId: string,
  ) => Promise<import("@/entities/topic/model/types").TopicDigest>;
  getTopicDigest: (
    topicId: string,
  ) => Promise<import("@/entities/topic/model/types").TopicDigest | null>;
  // ─── Templates ──────────────────────────────────────────────────────────
  addTemplate: (
    retroType: RetrospectiveType,
    name: string,
    content: string,
  ) => RetroTemplate;
  updateTemplate: (
    id: string,
    patch: Partial<Pick<RetroTemplate, "name" | "content">>,
  ) => void;
  deleteTemplate: (id: string) => void;
  resetTemplate: (retroType: RetrospectiveType) => void;
  setActiveTemplate: (retroType: RetrospectiveType, id: string) => void;
  // ─── Auth ────────────────────────────────────────────────────────────────
  login: (
    email: string,
    password: string,
    rememberMe: boolean,
  ) => Promise<LoginResult>;
  logout: () => void;
  requestEmailCode: (
    email: string,
    mode?: "signup" | "reset",
  ) => Promise<RequestCodeResult>;
  verifyEmailCode: (email: string, code: string) => Promise<VerifyCodeResult>;
  completeSignup: (input: SignupInput) => Promise<SignupResult>;
  oauthLogin: (provider: OAuthProvider) => Promise<OAuthResult>;
  /** OAuth 신규 사용자가 국가 입력을 마쳐 가입 완료 (onboarding_token 쿠키 사용). */
  completeOnboarding: (input: {
    country: string;
    region: string | null;
  }) => Promise<SignupResult>;
  /** 비밀번호 재설정 메일 발송 (토큰 링크 방식). 보안상 항상 성공으로 간주. */
  requestPasswordReset: (email: string) => Promise<void>;
  /** 이메일 토큰 + 새 비밀번호로 재설정 확정. */
  confirmPasswordReset: (
    token: string,
    newPassword: string,
    newPasswordConfirm: string,
  ) => Promise<ResetPasswordResult>;
  updateProfile: (
    patch: Partial<Pick<User, "displayName" | "avatarUrl">>,
  ) => void;
  // ─── 지역/시간대 (settings) ────────────────────────────────────────────────
  /**
   * 국가 변경.
   * - timezone: 단일 tz 국가는 null/undefined 가능, 다중 tz 는 필수.
   * - keepCurrentTimezone: true 면 API 호출 후 이전 tz 를 복원.
   */
  updateCountry: (
    country: string,
    timezone: string | null,
    keepCurrentTimezone?: boolean,
  ) => Promise<{ ok: boolean }>;
  /**
   * 국가의 IANA timezone 목록 조회 (국가 선택 시 드롭다운 데이터).
   * multi=true 면 사용자가 직접 timezone 을 선택해야 한다.
   */
  loadCountryTimezones: (
    code: string,
  ) => Promise<{ multi: boolean; timezones: string[] }>;
  /** timezone 단독 변경 (국가 유지). AI 요약 실행 시간대 변경용. */
  updateTimezone: (timezone: string) => Promise<{ ok: boolean }>;
  /** GitHub 계정 연결 (로그인 상태에서 OAuth link 팝업). */
  linkGitHubAccount: () => Promise<{ ok: boolean; error?: string }>;
  // ─── 세션 관리 ─────────────────────────────────────────────────────────────
  /** 현재 사용자의 활성 세션(로그인 기기) 목록. */
  listSessions: () => Promise<Session[]>;
  /** 단일 세션 폐기. 현재 세션을 폐기하면 이후 요청이 401 → 로그아웃. */
  revokeSession: (sessionId: string) => Promise<{ ok: boolean }>;
  /** 현재 세션 외 모든 기기 로그아웃. */
  revokeOtherSessions: () => Promise<{ ok: boolean; revokedCount?: number }>;
  // ─── 보안(탈취 감지) ───────────────────────────────────────────────────────
  /** refresh token 재사용 감지로 강제 로그아웃된 상태 (보안 경고 모달 표시용). */
  securityLogout: boolean;
  /** 보안 경고 모달 닫기. */
  dismissSecurityLogout: () => void;
}

// ─── Auth result types ──────────────────────────────────────────────────────

export interface SignupInput {
  email: string;
  password: string;
  /** 표시 이름 — API 미저장(클라 전용). */
  displayName: string;
  /** ISO 3166-1 alpha-2 (필수). */
  country: string;
  /** ISO 3166-2 — 다중 tz 국가만 필수, 그 외 null. */
  region: string | null;
  rememberMe: boolean;
}

export type LoginResult =
  | { ok: true; user: User }
  | { ok: false; error: "invalid-credentials" | "user-not-found" };

/** OAuth 로그인 결과: 기존 사용자 성공 / 신규 사용자 온보딩 필요 / 실패 */
export type OAuthResult =
  | { kind: "success"; user: User }
  | { kind: "onboarding-required" }
  | { kind: "error"; error: string };

export type RequestCodeResult =
  | { ok: true }
  | { ok: false; error: "already-registered" | "cooldown" };

export type VerifyCodeResult =
  | { ok: true }
  | { ok: false; error: "invalid-code" | "expired" | "not-requested" };

export type SignupResult =
  | { ok: true; user: User }
  | { ok: false; error: "email-not-verified" | "already-registered" };

export type ResetPasswordResult =
  | { ok: true }
  | {
      ok: false;
      error: "token-invalid" | "token-expired" | "not-allowed" | "unknown";
    };

export type PushRetrospectiveResult =
  | { ok: true; commitSha: string; htmlUrl: string; path: string }
  | { ok: false; error: string };
