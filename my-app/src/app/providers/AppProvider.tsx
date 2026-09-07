import {
  useCallback,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  mockCompleteOnboarding,
  mockCompleteSignup,
  mockConfirmPasswordReset,
  mockLogin,
  mockOAuthLogin,
  mockRequestEmailCode,
  mockRequestPasswordReset,
  mockVerifyEmailCode,
} from "@/app/lib/mockAuth";
import { detectOverdueSchedules } from "@/app/lib/scheduleSummary";
import {
  buildSummaryEntry,
  KIND_TO_TYPE,
} from "@/app/lib/summaryFactory";
import { getInitialAppState } from "@/app/model/initialState";
import { appReducer } from "@/app/model/reducer";
import type { AppSettings, Locale } from "@/app/model/settings";
import type {
  AppFocusTarget,
  ArchiveAppContextValue,
  PushNotificationOptions,
  SignupInput,
} from "@/app/model/types";
import { AppContext } from "@/app/providers/context";
import { usePersistAppState } from "@/app/providers/usePersistAppState";
import { useCoalescingQueues } from "@/app/providers/useCoalescingQueues";
import { useServerSync } from "@/app/providers/useServerSync";
import { findEntryByDateKeyAndType } from "@/entities/entry/lib/selectors";
import type { JournalEntry, RetrospectiveType } from "@/entities/entry/model/types";
import type { Folder } from "@/entities/folder/model/types";
import type {
  NoticeCategory,
  NoticeType,
  NotificationItem,
} from "@/entities/notification/model/types";
import { resolveActiveTemplate, type RetroTemplate } from "@/entities/template";
import type { OAuthProvider, User } from "@/entities/user/model/types";
import {
  SUMMARY_DURATION_MS,
  type SummaryKind,
  type SummaryReadiness,
} from "@/entities/summary/model/types";
import type { Todo } from "@/entities/todo/model/types";
import type { Topic } from "@/entities/topic/model/types";
import { boardRangeWindow } from "@/entities/todo/lib/boardRange";
import { getTodosInRange, sortTodos } from "@/entities/todo/lib/selectors";
import { getEntriesInRange } from "@/entities/entry/lib/selectors";
import { DEMO_ANCHOR_DATE_KEY, isDemoMode } from "@/app/config/demo";
import {
  addDays,
  computeAutoTodoTime,
  endOfMonth,
  endOfWeek,
  endOfYear,
  fromDateKey,
  localTimeToUtcISO,
  startOfMonth,
  startOfWeek,
  startOfYear,
  todayKey,
  todayKeyInTz,
  toDateKey,
} from "@/shared/lib/date";
import { writeSpellCheckPref } from "@/shared/lib/spellCheckPrefs";
import { writeTodoBoardRange } from "@/shared/lib/todoRangePrefs";
import { createId } from "@/shared/lib/id";
import { translate } from "@/shared/lib/i18n";
import { ConfirmModal } from "@/shared/ui";
import {
  USE_API,
  ApiError,
  apiClearNotifications,
  apiCompleteOnboarding,
  apiCompleteSignup,
  apiCreateEntry,
  apiCreateTodo,
  apiDeleteTodo,
  apiUpdateTodo,
  apiLinkCalendarTodo,
  apiUnlinkCalendarTodo,
  apiDeleteNotification,
  apiGenerateSummary,
  apiGetConnection,
  apiGetCalendarConnection,
  apiConnectCalendar,
  apiDisconnectCalendar,
  apiGetCommits,
  apiGetSettings,
  apiGetSummary,
  apiGetSummaryEntry,
  apiGetSummaryReadiness,
  apiLinkOAuth,
  apiLinkRepo,
  apiConfirmPasswordReset,
  apiRequestPasswordReset,
  apiGetCountryTimezones,
  apiUpdateCountry,
  apiUpdateTimezone,
  apiListAvailableRepos,
  apiGetEntry,
  apiGlobalSearch,
  apiUpdateSummaryContent,
  apiListEntries,
  apiListEntriesPaginated,
  apiListLinkedRepos,
  apiListNotifications,
  apiListSessions,
  apiListTodos,
  apiLogin,
  apiLogout,
  apiRevokeSession,
  apiRevokeOtherSessions,
  setSessionInvalidatedHandler,
  apiMarkAllNotificationsRead,
  apiMarkNotificationRead,
  apiOAuthLogin,
  apiPushRetrospective,
  apiRequestEmailCode,
  apiRestoreSession,
  apiSetPushTarget,
  apiSyncAllRepos,
  apiUnlinkAllRepos,
  apiUnlinkRepo,
  apiUpdateProfile,
  apiUpdateRepo,
  apiVerifyEmailCode,
  apiListTemplates,
  apiCreateTemplate,
  apiDeleteTemplate,
  apiResetTemplate,
  apiSetActiveTemplate,
  streamSummary,
  apiCreateFolder,
  apiGetFolderContents,
  apiListFolders,
  apiUpdateFolder,
  apiDeleteFolder,
  apiMoveEntryToFolder,
  apiListTopics,
  apiCreateTopic,
  apiDeleteTopic,
  apiGenerateDigest,
  apiGetDigest,
} from "@/shared/api";
import {
  MOCK_AVAILABLE_REPOS,
  MOCK_COMMITS,
  MOCK_LOGIN,
  mockLinkRepository,
} from "@/app/lib/mockGithub";
import { toPeriodKey } from "@/shared/lib/date";
import {
  countryDefaultTimezone,
  MULTI_TZ_COUNTRIES,
  supportedTimeZones,
  type MultiTzCountry,
} from "@/shared/lib/geo";
import type { AvailableRepository } from "@/entities/github/model/types";
import {
  mockListSessions,
  mockRevokeSession,
  mockRevokeOtherSessions,
} from "@/app/lib/mockAuth";
import type { PushRetrospectiveResult } from "@/app/model/types";

/**
 * 시작만 지정되고 끝이 비어 있으면 끝을 시작+60분으로 자동 보정한다(24:00 은 23:59 로 clamp).
 * setTodoTime/updateTodoTimeRecurrence 둘 다 같은 보정 정책을 쓴다.
 */
function fillDefaultEndTime(startTime: string | null, endTime: string | null): string | null {
  if (!startTime || endTime) return endTime;
  const m = /^(\d{1,2}):(\d{2})$/.exec(startTime);
  if (!m) return endTime;
  const total = Math.min(24 * 60 - 1, Number(m[1]) * 60 + Number(m[2]) + 60);
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

export function AppProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(
    appReducer,
    undefined,
    getInitialAppState,
  );

  usePersistAppState(state);

  // Track timers so we can clean up.
  const summaryTimerRef = useRef<number | null>(null);

  // 탈취 감지(refresh token 재사용) → 강제 로그아웃 + 보안 경고 모달 플래그
  const [securityLogout, setSecurityLogout] = useState(false);

  // 전역 검색 → 특정 할 일/회고로 이동+포커스 요청 (transient·비영속).
  const [focusTarget, setFocusTarget] = useState<AppFocusTarget | null>(null);

  // client 레이어가 AUTH_REFRESH_TOKEN_REUSE_DETECTED 를 받으면 여기로 통지된다.
  // 자동 refresh 재시도 없이 즉시 로그아웃 + 보안 모달을 띄운다.
  useEffect(() => {
    setSessionInvalidatedHandler(() => {
      dispatch({ type: "auth/logout" });
      setSecurityLogout(true);
    });
    return () => setSessionInvalidatedHandler(null);
  }, []);

  const dismissNotification = useCallback((id: string) => {
    dispatch({ type: "notification/dismiss", payload: { id } });
  }, []);

  const pushNotification = useCallback(
    (
      type: NoticeType,
      title: string,
      message: string,
      options?: PushNotificationOptions,
    ) => {
      const notification: NotificationItem = {
        id: createId("notice"),
        type,
        category: options?.category ?? "general",
        title,
        message,
        timestamp: new Date().toISOString(),
        read: false,
        actionLabel: options?.actionLabel,
        actionHref: options?.actionHref,
        transient: options?.transient,
      };
      dispatch({ type: "notification/push", payload: { notification } });
      // Transient toast auto-dismiss handled by ToastViewport, not by store.
    },
    [],
  );

  // ─── Notification retention cleanup ──────────────────────────────────────
  useEffect(() => {
    const interval = window.setInterval(
      () => {
        dispatch({
          type: "notification/cleanup",
          payload: { retentionDays: state.settings.notificationRetentionDays },
        });
      },
      60 * 60 * 1000, // hourly
    );
    return () => window.clearInterval(interval);
  }, [state.settings.notificationRetentionDays]);

  // Run cleanup once on mount.
  useEffect(() => {
    dispatch({
      type: "notification/cleanup",
      payload: { retentionDays: state.settings.notificationRetentionDays },
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ─── Auto-summary scheduler ──────────────────────────────────────────────
  // On mount: detect overdue weekly/monthly/yearly boundaries since the last
  // recorded check, and queue them for processing.
  const scheduleRanRef = useRef(false);
  useEffect(() => {
    // API 모드: 자동 요약은 서버 Cron 이 담당한다 (CLAUDE.md §7). 로컬 스케줄러가
    // 돌면 새로고침마다 lastScheduleCheckAt=null 로 밀린 요약을 오인 감지해
    // AI 요약 오버레이가 떠버린다 → API 모드에서는 비활성화.
    if (USE_API) return;
    if (scheduleRanRef.current) return;
    scheduleRanRef.current = true;

    const events = detectOverdueSchedules(
      state.settings.lastScheduleCheckAt,
      state.settings.autoSummary,
    );
    const now = new Date().toISOString();
    dispatch({ type: "settings/scheduleCheck", payload: { timestamp: now } });

    if (events.length === 0) return;

    // Process events sequentially — kick off the first, the rest follow as
    // each completes.
    let i = 0;
    const runNext = () => {
      if (i >= events.length) return;
      const evt = events[i++];
      startSummaryInternal(evt.kind, evt.targetDateKey, runNext);
    };
    runNext();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ─── Summary lifecycle ────────────────────────────────────────────────────
  const completeSummaryFor = useCallback(
    (kind: SummaryKind, targetDateKey: string) => {
      const target = fromDateKey(targetDateKey);
      let rangeStart: Date;
      let rangeEnd: Date;
      switch (kind) {
        case "weekly":
          rangeStart = startOfWeek(target);
          rangeEnd = endOfWeek(target);
          break;
        case "monthly":
          rangeStart = startOfMonth(target);
          rangeEnd = endOfMonth(target);
          break;
        case "yearly":
          rangeStart = startOfYear(target);
          rangeEnd = endOfYear(target);
          break;
      }

      const todos = getTodosInRange(state.todos, rangeStart, rangeEnd);
      const entries = getEntriesInRange(state.entries, rangeStart, rangeEnd);
      const existing = findEntryByDateKeyAndType(
        state.entries,
        targetDateKey,
        KIND_TO_TYPE[kind],
      );
      const entry = buildSummaryEntry(
        kind,
        targetDateKey,
        todos,
        entries,
        existing,
      );

      dispatch({ type: "entry/upsert", payload: { entry } });
      dispatch({ type: "summary/complete" });

      const locale = state.settings.locale;
      const kindLabel = translate(locale, `summary.kind.${kind}`);
      pushNotification(
        "success",
        translate(locale, "summary.completed.title"),
        translate(locale, "summary.completed.message", { kind: kindLabel }),
        { category: "summary" },
      );
    },
    [state.todos, state.entries, state.settings.locale, pushNotification],
  );

  const startSummaryInternal = useCallback(
    (kind: SummaryKind, targetDateKey: string, onDone?: () => void) => {
      dispatch({
        type: "summary/start",
        payload: { kind, targetDateKey },
      });
      if (summaryTimerRef.current) window.clearTimeout(summaryTimerRef.current);
      summaryTimerRef.current = window.setTimeout(() => {
        completeSummaryFor(kind, targetDateKey);
        onDone?.();
      }, SUMMARY_DURATION_MS);
    },
    [completeSummaryFor],
  );

  // ─── API 모드: SSE 기반 비동기 요약 ─────────────────────────────────────────
  const apiSummaryAbortRef = useRef<(() => void) | null>(null);
  // readiness 점검 결과 캐시 ("kind:periodStart" 별). entry 추가/수정 시 무효화한다.
  const readinessCacheRef = useRef<Map<string, SummaryReadiness>>(new Map());

  const finalizeApiSummary = (summaryId: string, kind: SummaryKind) => {
    // 요약은 retro_summaries 가 진실 공급원. /entries 로 미러링하지 않고,
    // 완성된 요약을 표시용 entry(isSummary=true)로 state 에만 upsert 한다.
    // (서버엔 이미 저장돼 있으므로 새로고침 시 /summaries 에서 다시 로드된다.)
    void apiGetSummaryEntry(summaryId)
      .then((entry) => {
        dispatch({ type: "entry/upsert", payload: { entry } });
        dispatch({ type: "summary/complete" });
        const locale = state.settings.locale;
        pushNotification(
          "success",
          translate(locale, "summary.completed.title"),
          translate(locale, "summary.completed.message", {
            kind: translate(locale, `summary.kind.${kind}`),
          }),
          { category: "summary" },
        );
      })
      .catch(() => dispatch({ type: "summary/cancel" }));
  };

  const startSummaryViaApi = (
    kind: SummaryKind,
    targetDateKey: string,
    periodStart?: string,
    force?: boolean,
  ) => {
    dispatch({ type: "summary/start", payload: { kind, targetDateKey } });
    apiSummaryAbortRef.current?.();
    apiSummaryAbortRef.current = null;

    const locale = state.settings.locale;
    let finished = false;

    const fail = (e?: unknown) => {
      if (finished) return;
      finished = true;
      dispatch({ type: "summary/cancel" });
      // 한도 초과(429)는 별도 안내, 그 외 실패는 일반 안내.
      const msg =
        e instanceof ApiError &&
        e.code === "RETRO_SUMMARY_RATE_LIMIT_EXCEEDED"
          ? translate(locale, "summary.rateLimited")
          : translate(locale, "summary.failed");
      pushNotification("warning", msg, "", { category: "summary" });
    };

    const complete = (summaryId: string) => {
      if (finished) return;
      finished = true;
      finalizeApiSummary(summaryId, kind);
    };

    void apiGenerateSummary(kind, periodStart, force)
      .then((summary) => {
        if (summary.status === "completed") {
          complete(summary.id);
          return;
        }

        // 폴링 최대 횟수: 5초 × 72 = 6분. 이 안에 완료·실패를 감지 못하면 타임아웃 처리.
        let pollCount = 0;
        const MAX_POLLS = 72;

        // 1) 폴링 (기본): 5초마다 상태 직접 조회 — SSE 이벤트보다 안정적
        const pollTimer = window.setInterval(() => {
          if (finished) { window.clearInterval(pollTimer); return; }
          if (++pollCount > MAX_POLLS) {
            window.clearInterval(pollTimer);
            fail();
            return;
          }
          void apiGetSummary(summary.id)
            .then((s: { status: string }) => {
              if (s.status === "completed") { window.clearInterval(pollTimer); complete(summary.id); }
              else if (s.status === "failed") { window.clearInterval(pollTimer); fail(); }
            })
            .catch(() => { /* 일시적 네트워크 오류 — 다음 폴링 때 재시도 */ });
        }, 5000);

        // 2) SSE 보조: 실시간 이벤트 도달 시 즉시 처리 (폴링보다 빠를 수 있음)
        const stopSSE = streamSummary(summary.id, {
          onCompleted: () => complete(summary.id),
          onFailed: () => fail(),
          // SSE 타임아웃·오류는 폴링이 계속 담당하므로 여기서는 chip 을 건드리지 않음
          onTimeout: () => { /* polling handles */ },
          onError: () => { /* polling handles */ },
        });

        apiSummaryAbortRef.current = () => {
          finished = true;
          window.clearInterval(pollTimer);
          stopSSE();
        };
      })
      .catch(fail);
  };

  // If a pending summary was persisted from a previous session and its
  // willCompleteAt is already past, finish it on mount.
  const resumedRef = useRef(false);
  useEffect(() => {
    if (resumedRef.current) return;
    resumedRef.current = true;
    if (USE_API) return; // API 모드는 pendingSummary 를 영속화하지 않음
    const p = state.pendingSummary;
    if (!p) return;
    const remaining = new Date(p.willCompleteAt).getTime() - Date.now();
    if (remaining <= 0) {
      completeSummaryFor(p.kind, p.targetDateKey);
    } else {
      summaryTimerRef.current = window.setTimeout(() => {
        completeSummaryFor(p.kind, p.targetDateKey);
      }, remaining);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    return () => {
      if (summaryTimerRef.current) window.clearTimeout(summaryTimerRef.current);
    };
  }, []);

  // API 모드: 앱 시작 시 refresh 쿠키로 세션 복원 (access token 은 메모리라 새로고침 시 소실됨).
  const sessionRestoredRef = useRef(false);
  useEffect(() => {
    // 데모(게스트) 모드는 서버 세션이 없다. refresh 쿠키로 세션 복원을 시도하면
    // (1) 데모인데도 /auth/token/refresh 네트워크 호출이 나가고, (2) 실사용자가
    // ?demo=true 로 들어온 경우 실제 세션이 복원돼 진짜 데이터가 로드되고 이후
    // 변경이 "비영속" 배너와 달리 실계정에 저장되는 문제가 생긴다. → 데모는 건너뛴다.
    if (!USE_API || isDemoMode() || sessionRestoredRef.current) return;
    sessionRestoredRef.current = true;
    void apiRestoreSession().then((user) => {
      if (user) {
        dispatch({ type: "auth/login", payload: { user, rememberMe: true } });
        // API 모드: 서버에 저장된 accountType을 settings에 반영하고 온보딩 화면을 건너뜀.
        dispatch({ type: "settings/accountType", payload: { accountType: user.accountType } });
      } else {
        dispatch({ type: "auth/logout" });
      }
    });
  }, []);

  // ─── API 모드: 로그인 후 서버 데이터 하이드레이션 ────────────────────────────
  const hydratedUserRef = useRef<string | null>(null);
  useEffect(() => {
    if (!USE_API) return;
    const uid = state.currentUser?.id ?? null;
    if (!uid || hydratedUserRef.current === uid) return;
    hydratedUserRef.current = uid;

    // 초기 하이드레이션은 현재 월 범위만 로드한다(서버 최대 62일 제한).
    // CalendarDashboard 가 마운트·뷰 전환 시 loadTodosForView 로 재조회한다.
    const _now = new Date();
    const _initFrom = toDateKey(startOfMonth(_now));
    const _initTo = toDateKey(endOfMonth(_now));
    void apiListTodos({ from: _initFrom, to: _initTo })
      .then((todos) => {
        dispatch({ type: "hydrate/todos", payload: { todos } });
      })
       
      .catch((e) => console.error("[hydrate/todos] 로드 실패:", e));
    // 회고 데이터: 일일 회고만 초기 하이드레이션한다(GET /entries?retroType=daily,
    // 오늘 기준 최근 30일). 주/월/연 AI 요약(retro_summaries)은 더 이상 로그인 시
    // 전체 이력을 미리 로드하지 않는다 — GET /entries/paginated 가 daily 뿐 아니라
    // weekly/monthly/yearly 도 함께 지원하게 되어, 회고록 목록(RetrospectiveStudio)이
    // 각 탭을 열 때(또는 최초 daily 탭) 그때그때 서버 페이지네이션으로 조회한다.
    void apiListEntries({ retroType: "daily" })
      .then((daily) => {
        // 방어: 서버가 retroType 필터를 무시해도 daily 외 항목은 버린다.
        const dailyOnly = daily.filter((e) => e.retroType === "daily");
        dispatch({ type: "hydrate/entries", payload: { entries: dailyOnly } });
      })
       
      .catch((e) => console.error("[hydrate/entries] 로드 실패:", e));
    void apiGetSettings()
      .then((settings) =>
        dispatch({ type: "hydrate/settings", payload: { settings } }),
      )
      .catch(() => {});
    void apiListNotifications()
      .then((notifications) =>
        dispatch({ type: "hydrate/notifications", payload: { notifications } }),
      )
      .catch(() => {});
    void apiListTemplates("daily")
      .then((templates) => {
        const activeIds: Record<string, string> = {};
        for (const t of templates) {
          if (t.isActive) activeIds[t.retroType] = t.id;
        }
        dispatch({
          type: "hydrate/templates",
          payload: { templates, activeTemplateIds: activeIds },
        });
      })
      .catch(() => {});
  }, [state.currentUser?.id]);

  // ─── GitHub 연결 프로브 (API·mock 양쪽) ──────────────────────────────────────
  const githubProbedRef = useRef<string | null>(null);
  useEffect(() => {
    const uid = state.currentUser?.id ?? null;
    if (!uid || githubProbedRef.current === uid) return;
    githubProbedRef.current = uid;
    runGitHubRefresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.currentUser?.id]);

  // ─── Google Calendar 연결 프로브 ─────────────────────────────────────────────
  const calendarProbedRef = useRef<string | null>(null);
  useEffect(() => {
    const uid = state.currentUser?.id ?? null;
    if (!uid || calendarProbedRef.current === uid) return;
    calendarProbedRef.current = uid;
    runCalendarRefresh();
     
  }, [state.currentUser?.id]);

  // ─── API 모드: 서버 동기화 인프라(SSE 알림 스트림 + 캘린더 폴링 폴백) ────────
  useServerSync({ userId: state.currentUser?.id, todos: state.todos, dispatch });

  // ─── API 모드 헬퍼 ──────────────────────────────────────────────────────────
  // 실패 시 일시적 토스트로 알린다 (네트워크 오류 메시지 재사용).
  const reportApiError = () => {
    pushNotification(
      "warning",
      translate(state.settings.locale, "auth.error.network"),
      "",
      { transient: true },
    );
  };
  // ─── 디바운스 코얼레싱 큐 ────────────────────────────────────────────────────
  // 변경이 잦은 서버 쓰기(todo/회고/요약/설정/프로필/템플릿)를 idle 후 1회로 합쳐
  // 보낸다. 큐 생성·flush·최신 state 참조는 useCoalescingQueues 로 캡슐화한다.
  const {
    todoQueue,
    entryQueue,
    summaryQueue,
    settingsQueue,
    profileQueue,
    templateQueue,
  } = useCoalescingQueues(state, reportApiError, dispatch);

  // 설정은 전체 교체(PUT)이므로 현재 settings 에 patch 를 합쳐 전송.
  const syncSettings = (patch: Partial<AppSettings>) => {
    settingsQueue.enqueue("settings", patch);
  };

  // ─── GitHub 저장소 연동 (서버 모델) ──────────────────────────────────────────
  /**
   * GET /github/connection 을 짧게 재시도하며 connected 여부를 확인한다.
   * 계정 연결 직후 백엔드 커밋 타이밍 레이스로 첫 조회가 false 일 수 있어,
   * 최대 5회(약 2초)까지 polling 해 즉시 반영을 보장한다.
   */
  const probeGitHubConnected = async (): Promise<boolean> => {
    if (!USE_API) return true;
    for (let attempt = 0; attempt < 5; attempt++) {
      try {
        const conn = await apiGetConnection();
        if (conn.connected) return true;
      } catch {
        // 네트워크 일시 오류 — 재시도
      }
      await new Promise((resolve) => setTimeout(resolve, 400));
    }
    return false;
  };

  const runGitHubRefresh = () => {
    // 데모: GitHub 연결을 제공하지 않는다(가짜 연결/목 데이터 없이 미연결 유지).
    if (isDemoMode()) {
      dispatch({
        type: "github/setLinked",
        payload: {
          status: "not-connected",
          repositories: [],
          login: null,
          pushTargetRepositoryId: null,
          hasVerifiedEmails: false,
        },
      });
      return;
    }
    if (!USE_API) {
      // mock: "연결됨"으로 간주, 기존 연결 목록 유지, login=developer
      dispatch({
        type: "github/setLinked",
        payload: {
          status: "connected",
          repositories: state.github.linkedRepositories,
          login: MOCK_LOGIN,
          pushTargetRepositoryId: state.github.pushTargetRepositoryId,
          hasVerifiedEmails: true, // mock 모드에서는 항상 정상
        },
      });
      return;
    }
    // GET /github/connection → 연결 상태 + login + pushTarget + hasVerifiedEmails
    void apiGetConnection()
      .then((connection) => {
        // 진단: 200 인데 미연결로 보이는 경우 실제 응답값을 확인한다.
         
        console.info("[github] connection 응답:", connection);
        if (!connection || !connection.connected) {
          dispatch({
            type: "github/setLinked",
            payload: {
              status: "not-connected",
              repositories: [],
              login: null,
              pushTargetRepositoryId: null,
              hasVerifiedEmails: false,
            },
          });
          return;
        }
        // 연결됨 → linked 저장소 목록 로드
        void apiListLinkedRepos()
          .then((repositories) =>
            dispatch({
              type: "github/setLinked",
              payload: {
                status: "connected",
                repositories,
                login: connection.login,
                pushTargetRepositoryId: connection.pushTargetRepositoryId,
                hasVerifiedEmails: connection.hasVerifiedEmails,
              },
            }),
          )
          .catch(() =>
            dispatch({
              type: "github/setLinked",
              payload: {
                status: "connected",
                repositories: [],
                login: connection.login,
                pushTargetRepositoryId: connection.pushTargetRepositoryId,
                hasVerifiedEmails: connection.hasVerifiedEmails,
              },
            }),
          );
      })
      .catch(() => {
        // connection 조회 실패 → 이전 상태 유지하되 unknown 으로
        dispatch({
          type: "github/setStatus",
          payload: { status: "not-connected" },
        });
      });
  };

  // 뷰 단위 할 일 로드 — CalendarDashboard 가 view/cursor 전환 시 호출한다.
  // dispatch 가 안정적이므로 useCallback 의존성 배열을 비워 함수를 안정화한다.
  const loadTodosForView = useCallback(async (from: string, to: string): Promise<Todo[]> => {
    // 데모(게스트) 모드는 시드 데이터만 사용 → 서버 호출 금지 (401 반복/불필요 트래픽 방지).
    if (!USE_API || isDemoMode()) return [];
    try {
      const todos = await apiListTodos({ from, to });
      dispatch({ type: "hydrate/todos", payload: { todos } });
      return todos;
    } catch {
      /* transient network error — 다음 재시도에서 보정 */
      return [];
    }

  }, []);

  // 할 일 보드 "전체" 보기 로드 — 오늘 기준 앞뒤로 rangeDays 를 나눈 구간을 조회한다.
  // 서버가 한 번에 최대 62일까지만 허용하므로(초과 시 422) 62일 이하 청크로 나눠
  // 병렬 조회한 뒤 id 기준으로 병합해 한 번에 hydrate 한다.
  //
  // 조회 창은 화면 필터와 같은 boardRangeWindow 를 쓴다 — 양쪽이 각자 계산하던 시절엔
  // 받아온 경계 하루를 화면 필터가 도로 버렸다.
  //
  // extraDateKey: 창 밖의 특정 날짜를 함께 조회한다. hydrate/todos 는 목록을 통째로
  // 교체하므로(삭제/이동된 항목이 남지 않게 하는 의도) 그 날짜만 따로 조회하면 창이
  // 날아간다 — 같은 응답 집합에 실어 한 번에 hydrate 해야 한다.
  const loadTodosForRange = useCallback(
    async (rangeDays: number, extraDateKey?: string): Promise<Todo[]> => {
    // 데모(게스트) 모드는 시드 데이터만 사용 → 서버 호출 금지.
    if (!USE_API || isDemoMode()) return [];
    const { from, to } = boardRangeWindow(rangeDays, todayKey());
    const start = fromDateKey(from);
    const end = fromDateKey(to);

    const chunks: Array<{ from: string; to: string }> = [];
    let cursor = start;
    while (cursor.getTime() <= end.getTime()) {
      // cursor..cursor+61 = 62일(포함) 윈도우 → 서버 제한 이내
      const chunkEndMs = Math.min(addDays(cursor, 61).getTime(), end.getTime());
      const chunkEnd = new Date(chunkEndMs);
      chunks.push({ from: toDateKey(cursor), to: toDateKey(chunkEnd) });
      cursor = addDays(chunkEnd, 1);
    }
    if (extraDateKey && (extraDateKey < from || extraDateKey > to)) {
      chunks.push({ from: extraDateKey, to: extraDateKey });
    }

    try {
      const results = await Promise.all(chunks.map((c) => apiListTodos(c)));
      const merged = new Map<string, Todo>();
      for (const arr of results) {
        for (const todo of arr) merged.set(todo.id, todo);
      }
      const todos = [...merged.values()];
      dispatch({ type: "hydrate/todos", payload: { todos } });
      return todos;
    } catch {
      /* transient network error — 다음 재시도에서 보정 */
      return [];
    }

    },
    [],
  );

  // 회고록 목록 페이지 조회 (GET /entries/paginated) — daily/weekly/monthly/yearly
  // 4개 탭 전부 이 엔드포인트 하나로 서버 페이지네이션+검색(q)한다. 받은 항목을
  // state.entries 에 병합하고 페이지 정보를 반환한다. useCallback([]) 으로 안정화
  // — 소비 훅(useRetroEntriesPage)이 이 함수를 effect 의존성에 넣어도 재조회 루프가 없다.
  // 데모/mock 은 null 을 반환(호출부가 클라이언트 목록으로 폴백). 서버 오류는 전파한다.
  const loadEntriesPage = useCallback(
    async (params: {
      /** 생략 시 4개 타입을 합친 "전체" 뷰(GET /entries/paginated 의 retroType 생략). */
      retroType?: RetrospectiveType;
      page: number;
      size: number;
      q?: string;
      from?: string;
      to?: string;
    }) => {
      if (!USE_API || isDemoMode()) return null;
      const res = await apiListEntriesPaginated(params);
      if (res.items.length > 0) {
        dispatch({ type: "entries/merge", payload: { entries: res.items } });
      }
      return res;
    },

    [],
  );

  // 폴더 열람(GET /folders/contents) — 반환된 folders/entries 를 각각 로컬 캐시에
  // 병합한다. 데모/mock 은 null(호출부가 state.folders/state.entries 를 직접
  // 필터링해 폴백). useCallback([]) 으로 안정화(useFolderContents 의 effect 의존성).
  const loadFolderContents = useCallback(
    async (params: {
      folderId?: string;
      retroType?: RetrospectiveType;
      page: number;
      size: number;
    }) => {
      if (!USE_API || isDemoMode()) return null;
      const res = await apiGetFolderContents(params);
      if (res.folders.length > 0) {
        dispatch({ type: "folder/merge", payload: { folders: res.folders } });
      }
      if (res.entries.length > 0) {
        dispatch({ type: "entries/merge", payload: { entries: res.entries } });
      }
      return res;
    },

    [],
  );

  // 전체 폴더 목록(GET /folders) — 경로 조립용. 응답을 state.folders 에 병합하지
  // 않는다: FolderSummary 에는 folderCount/entryCount 가 없어서, 병합하면 폴더
  // 카드 뱃지가 0 으로 덮인다. 호출부(useAllFolders)가 별도로 들고 있는다.
  // 데모/mock 은 null(호출부가 state.folders 로 폴백). useCallback([]) 으로 안정화.
  const loadAllFolders = useCallback(async () => {
    if (!USE_API || isDemoMode()) return null;
    return await apiListFolders();
  }, []);

  // 통합검색(GET /search) — nav 빠른 이동용. 결과를 state 에 병합해 검색 결과를
  // 클릭했을 때(하이드레이션 범위 밖의 오래된 항목이어도) id 로 바로 조회 가능하게 한다.
  // 데모/mock 은 null(호출부가 로컬 필터로 폴백). useCallback([]) 으로 안정화.
  const globalSearch = useCallback(async (q: string, limit?: number) => {
    if (!USE_API || isDemoMode()) return null;
    const res = await apiGlobalSearch(q, limit);
    for (const todo of res.todos) {
      dispatch({ type: "todo/upsert", payload: { todo } });
    }
    if (res.entries.length > 0) {
      dispatch({ type: "entries/merge", payload: { entries: res.entries } });
    }
    return res;
  }, []);

  // ─── Google Calendar 연결 프로브 ─────────────────────────────────────────────
  const runCalendarRefresh = () => {
    // 데모/mock 모드: 연결 기능 미제공 → 미연결 유지.
    if (isDemoMode() || !USE_API) {
      dispatch({
        type: "calendar/setConnection",
        payload: { status: "not-connected", googleUserId: null, lastSyncedAt: null },
      });
      return;
    }
    void apiGetCalendarConnection()
      .then((conn) => {
        const status = !conn.connected
          ? "not-connected"
          : conn.needsReauth
            ? "needs-reauth"
            : "connected";
        dispatch({
          type: "calendar/setConnection",
          payload: {
            status,
            googleUserId: conn.googleUserId,
            lastSyncedAt: conn.lastSyncedAt,
          },
        });
      })
      .catch(() => {
        dispatch({
          type: "calendar/setConnection",
          payload: { status: "not-connected" },
        });
      });
  };

  // ─── 데모(게스트) 모드 가드 ──────────────────────────────────────────────────
  // 데모에서는 모든 화면을 자유롭게 체험할 수 있고(변경은 로컬·비영속),
  // 외부 의존성(GitHub 연동/동기화)만 차단하고 "로그인" 액션 토스트로 유도한다.
  const isDemo =
    typeof window !== "undefined" &&
    new URLSearchParams(window.location.search).get("demo") === "true";

  const requireLoginInDemo = (): boolean => {
    if (!isDemo) return false;
    const locale = state.settings.locale;
    pushNotification(
      "info",
      translate(locale, "demo.locked.title"),
      translate(locale, "demo.locked.message"),
      { actionLabel: translate(locale, "demo.locked.action"), actionHref: "/login" },
    );
    return true;
  };

  // 데이터·설정 CRUD 의 서버 반영 여부. 데모(게스트)는 서버 세션이 없는 로컬 전용
  // 샌드박스이므로, 낙관적 로컬 dispatch 는 그대로 두되 서버 호출만 건너뛴다
  // (mock 모드와 동일 취급). 실사용자(isDemo=false)에겐 apiActive === USE_API 이므로
  // 동작이 완전히 동일하다 — 즉 이 플래그 치환은 프로덕션 경로에 영향이 없다.
  const apiActive = USE_API && !isDemo;

  // ─── Topics — 안정적인 참조가 필요하다: useTopics/useTopicDigest 가 이 함수들을
  // effect 의존성 배열에 넣기 때문에, value 객체 리터럴 안에서 매 렌더마다 새로
  // 만들어지면 provider 가 (토픽과 무관한 이유로) 리렌더될 때마다 목록 재로드 /
  // 진행 중이던 digest 폴링·SSE 가 끊긴다.
  const loadTopics = useCallback(async (): Promise<Topic[]> => {
    // 데모(게스트) 모드는 주제 기능에 대응하는 mock 이 없다 → 서버 호출 없이 빈 목록.
    if (!apiActive) return [];
    return apiListTopics();
  }, [apiActive]);
  const createTopic = useCallback(
    (name: string, description: string) => apiCreateTopic(name, description),
    [],
  );
  const deleteTopic = useCallback((id: string) => apiDeleteTopic(id), []);
  const generateTopicDigest = useCallback(
    (topicId: string) => apiGenerateDigest(topicId),
    [],
  );
  const getTopicDigest = useCallback(
    (topicId: string) => apiGetDigest(topicId),
    [],
  );

  // ─── Context value ────────────────────────────────────────────────────────
  const sortedTodos = useMemo(() => sortTodos(state.todos), [state.todos]);
  const sortedState = useMemo(
    () => ({ ...state, todos: sortedTodos }),
    [state, sortedTodos],
  );
  const value: ArchiveAppContextValue = {
    state: sortedState,
    isDemo,
    focusTarget,
    requestFocus: setFocusTarget,
    clearFocus: () => setFocusTarget(null),
    addTodo: (title, dateKey, options, onCreated) => {
      // 기본 날짜("오늘")는 user.timezone 기준 (데모는 앵커 날짜)
      const resolvedDateKey =
        dateKey ??
        (isDemo
          ? DEMO_ANCHOR_DATE_KEY
          : todayKeyInTz(state.currentUser?.timezone ?? undefined));
      // 현재 시각 기준으로 다음 30분 경계를 시작 시간으로 자동 설정
      const { startTime, endTime } = computeAutoTodoTime();
      if (apiActive) {
        const tz = state.currentUser?.timezone ?? undefined;
        // 서버가 id 를 발급하므로 생성은 await 후 dispatch
        void apiCreateTodo({
          title,
          dateKey: resolvedDateKey,
          status: options?.status,
          description: options?.description,
          startTimeUtc: localTimeToUtcISO(resolvedDateKey, startTime, tz),
          endTimeUtc: localTimeToUtcISO(resolvedDateKey, endTime, tz),
          timezone: tz ?? null,
          pushToCalendar: options?.pushToCalendar,
          recurrenceRule: options?.recurrenceRule,
          tags: options?.tags,
        })
          .then((todo) => {
            dispatch({ type: "todo/upsert", payload: { todo } });
            onCreated?.(todo.id);
          })
          .catch(() => reportApiError());
        return;
      }
      const newId = createId("todo");
      dispatch({
        type: "todo/add",
        payload: {
          id: newId,
          title,
          dateKey: resolvedDateKey,
          status: options?.status,
          description: options?.description,
          startTime,
          endTime,
          recurrenceRule: options?.recurrenceRule,
          tags: options?.tags,
        },
      });
      onCreated?.(newId);
    },
    updateTodo: (id, patch) => {
      dispatch({ type: "todo/update", payload: { id, patch } }); // 낙관적
      // 디바운스 코얼레싱 — 빠른 연속 수정(제목/설명 등)을 idle 후 1회 PATCH 로 합침.
      if (apiActive) todoQueue.enqueue(id, patch);
    },
    moveTodo: (id, dateKey) => {
      dispatch({ type: "todo/move", payload: { id, dateKey } }); // 낙관적
      // updateTodo 와 같은 id 큐를 공유 → 수정+이동이 1회 PATCH 로 머지됨.
      if (apiActive) todoQueue.enqueue(id, { dateKey });
    },
    removeTodo: (id, scope) => {
      // 데모는 로컬에서만 삭제한다(다른 할 일 CRUD 와 동일하게 비영속 로컬 처리).
      const todo = state.todos.find((t) => t.id === id);
      if (scope && scope !== "this" && todo?.seriesId) {
        // following/all — 서버가 여러 row 를 지우므로, 로컬도 같은 시리즈의
        // 일치하는 항목들(가상 인스턴스 포함)을 함께 정리해 재조회 없이 정합을 맞춘다.
        dispatch({
          type: "todo/removeSeries",
          payload: {
            seriesId: todo.seriesId,
            fromDateKey: scope === "following" ? (todo.originalDateKey ?? todo.dateKey) : null,
          },
        }); // 낙관적
      } else {
        dispatch({ type: "todo/remove", payload: { id } }); // 낙관적
      }
      if (apiActive) {
        // 대기 중 수정 큐를 취소하고 삭제 요청.
        // 연동된 Google Calendar 이벤트는 백엔드가 비동기(best-effort)로 자동 삭제한다.
        todoQueue.cancel(id);
        void apiDeleteTodo(id, scope).catch(() => reportApiError());
      }
    },
    updateTodoRecurrence: async (id, rule) => {
      // 데모/mock 은 반복 확장(가상 인스턴스 생성) 로직 자체가 없어 지원하지 않는다.
      if (!apiActive) return null;
      // 큐를 거치지 않고 즉시 전송 — following 스코프는 서버가 새 시리즈(새 id)를
      // 만드는 1회성 명시적 액션이라 디바운스 코얼레싱 대상이 아니다.
      try {
        const serverTodo = await apiUpdateTodo(id, {
          recurrenceScope: "following",
          recurrenceRule: rule,
        });
        // 응답은 새 base row 원본 형태 — 우선 반영해 두지만, 목록 모양(가상 인스턴스)과
        // 다르므로 호출부가 이어서 재조회해 정확한 모양으로 교체한다.
        dispatch({ type: "todo/replaceId", payload: { localId: id, serverTodo } });
        return serverTodo;
      } catch {
        reportApiError();
        return null;
      }
    },
    convertTodoToRecurring: async (id, rule) => {
      // 데모/mock 은 반복 확장 로직 자체가 없어 지원하지 않는다.
      if (!apiActive) return null;
      // scope 를 지정하지 않는다 — 대상이 어떤 시리즈에도 속하지 않은 단독 항목일 때만
      // 서버가 이 규칙을 받아 그 자리에서 시리즈 base 로 전환한다(recurrence_scope 무관).
      try {
        const serverTodo = await apiUpdateTodo(id, { recurrenceRule: rule });
        // 응답은 base row 원본 형태(is_virtual:false) — 호출부가 이어서 재조회해야
        // 목록 조회 시의 가상 인스턴스 모양(is_virtual:true)으로 정확히 바뀐다.
        dispatch({ type: "todo/replaceId", payload: { localId: id, serverTodo } });
        return serverTodo;
      } catch {
        reportApiError();
        return null;
      }
    },
    toggleTodoCalendarLink: (id) => {
      const todo = state.todos.find((t) => t.id === id);
      if (!todo || !apiActive) return;
      const willLink = !todo.calendarLinked;
      // 낙관적 UI — 즉시 상태 반전
      dispatch({
        type: "todo/set-calendar",
        payload: {
          id,
          calendarLinked: willLink,
          calendarPushStatus: willLink ? "pending" : "pending_delete",
        },
      });
      const apiCall = willLink ? apiLinkCalendarTodo : apiUnlinkCalendarTodo;
      void apiCall(id).catch(() => {
        // 실패 시 원래 상태로 복원
        dispatch({
          type: "todo/set-calendar",
          payload: {
            id,
            calendarLinked: todo.calendarLinked,
            calendarPushStatus: todo.calendarPushStatus,
          },
        });
        reportApiError();
      });
    },
    setTodoTime: (id, startTime, endTime) => {
      // 일간 캘린더 블록은 시각상 +1시간으로 그려지므로 데이터도 일치시켜,
      // 블록을 눌러 상세를 봐도 끝 시간이 채워져 있도록 한다.
      endTime = fillDefaultEndTime(startTime, endTime);
      dispatch({
        type: "todo/update",
        payload: { id, patch: { startTime, endTime } },
      }); // 낙관적 (로컬 "HH:mm")
      if (!apiActive) return;
      // 서버는 UTC ISO + timezone 으로 보관 → 할 일 날짜·사용자 timezone 으로 환산.
      const todo = state.todos.find((t) => t.id === id);
      const dateKey = todo?.dateKey;
      if (!dateKey) return;
      const tz = state.currentUser?.timezone ?? undefined;
      const hasTime = Boolean(startTime || endTime);
      // recurrenceScope 를 지정하지 않는다 — 서버 기본값 "this" 로 해당 회차만 수정된다
      // (반복 시리즈면 예외 row 로 실체화). 이후 회차까지 바꾸려면 updateTodoTimeRecurrence.
      todoQueue.enqueue(id, {
        startTime: startTime ? localTimeToUtcISO(dateKey, startTime, tz) : null,
        endTime: endTime ? localTimeToUtcISO(dateKey, endTime, tz) : null,
        timezone: hasTime ? (tz ?? null) : null,
      });
    },
    updateTodoTimeRecurrence: async (id, startTime, endTime) => {
      // 데모/mock 은 반복 확장 로직 자체가 없어 지원하지 않는다.
      if (!apiActive) return null;
      endTime = fillDefaultEndTime(startTime, endTime);
      const todo = state.todos.find((t) => t.id === id);
      const dateKey = todo?.dateKey;
      if (!dateKey) return null;
      const tz = state.currentUser?.timezone ?? undefined;
      const hasTime = Boolean(startTime || endTime);
      // 큐를 거치지 않고 즉시 전송 — following 스코프는 서버가 새 시리즈(새 id)를
      // 만드는 1회성 명시적 액션이라 디바운스 코얼레싱 대상이 아니다(updateTodoRecurrence와 동일).
      try {
        const serverTodo = await apiUpdateTodo(id, {
          startTime: startTime ? localTimeToUtcISO(dateKey, startTime, tz) : null,
          endTime: endTime ? localTimeToUtcISO(dateKey, endTime, tz) : null,
          timezone: hasTime ? (tz ?? null) : null,
          recurrenceScope: "following",
        });
        dispatch({ type: "todo/replaceId", payload: { localId: id, serverTodo } });
        return serverTodo;
      } catch {
        reportApiError();
        return null;
      }
    },
    updateTodoFollowing: async (id, patch) => {
      // 데모/mock 은 반복 확장 로직 자체가 없어 지원하지 않는다.
      if (!apiActive) return null;
      // 큐를 거치지 않고 즉시 전송 — following 스코프는 서버가 새 시리즈(새 id)를
      // 만드는 1회성 명시적 액션이라 디바운스 코얼레싱 대상이 아니다(updateTodoRecurrence와 동일).
      try {
        const serverTodo = await apiUpdateTodo(id, {
          title: patch.title,
          description: patch.description,
          tags: patch.tags,
          recurrenceScope: "following",
        });
        dispatch({ type: "todo/replaceId", payload: { localId: id, serverTodo } });
        return serverTodo;
      } catch {
        reportApiError();
        return null;
      }
    },
    clearTodoIdReplacement: () => dispatch({ type: "todo/clearIdReplacement" }),
    updateEntry: (id, patch) => {
      dispatch({ type: "entry/update", payload: { id, patch } }); // 낙관적
      // entry 본문/제목 변경 → readiness 캐시 무효화
      if (patch.content !== undefined || patch.title !== undefined) {
        readinessCacheRef.current.clear();
      }
      // AI 요약(isSummary)은 소스 테이블이 달라(retro_summaries) /entries 가 아니라
      // PATCH /summaries/{id} 로 저장한다(title 은 FE 합성 라벨이라 서버에 없음 — 무시).
      const isSummary = state.entries.find((e) => e.id === id)?.isSummary;
      if (isSummary) {
        if (apiActive && patch.content !== undefined) {
          summaryQueue.enqueue(id, { contentMarkdown: patch.content });
        }
        return;
      }
      // 디바운스 코얼레싱 — 본문 타이핑을 idle 후 1회 upsert 로 합침.
      // (synced 는 서버 githubPush 필드 기반 — base 는 send 시점 최신값 사용)
      if (apiActive) {
        entryQueue.enqueue(id, {
          title: patch.title,
          content: patch.content,
          retroType: patch.retroType,
        });
      }
    },
    revertSummaryEdit: (id) => {
      const entry = state.entries.find((e) => e.id === id);
      if (!entry?.isSummary || !apiActive) return;
      // 되돌리기는 결과(AI 원본 마크다운)를 클라이언트가 미리 알 수 없으므로
      // (타이핑 저장과 달리) 응답을 그대로 반영해야 한다 — entry/upsert 로 갱신.
      summaryQueue.cancel(id); // 대기 중인 편집 저장이 있으면 되돌리기가 이기도록 취소
      void apiUpdateSummaryContent(id, null)
        .then((updated) => {
          dispatch({ type: "entry/upsert", payload: { entry: updated } });
        })
        .catch(() => reportApiError());
    },
    createDailyEntry: (dateKey, onIdReplaced, folderId) => {
      const existing = state.entries.find(
        (e) => e.dateKey === dateKey && e.retroType === "daily",
      );
      if (existing) return { entry: existing, existed: true };
      // 활성 일간 템플릿 내용을 초기 본문으로 채운다
      const template = resolveActiveTemplate(
        state.templates,
        state.activeTemplateIds,
        "daily",
      );
      const localId = createId("entry");
      const entry: JournalEntry = {
        id: localId,
        dateKey,
        title: `${dateKey} 일일 회고`,
        content: template?.content ?? "",
        retroType: "daily",
        githubPush: null,
        synced: false,
        updatedAt: new Date().toISOString(),
        folderId: folderId ?? null,
      };
      dispatch({ type: "entry/upsert", payload: { entry } });
      // 새 entry 추가 → readiness 캐시 무효화
      readinessCacheRef.current.clear();
      if (apiActive) {
        // POST 응답의 서버 ID 로 낙관적 로컬 ID 를 즉시 교체한다.
        // 이후 updateEntry 가 올바른 서버 ID 로 PUT 을 호출하게 된다.
        void apiCreateEntry({
          dateKey,
          title: entry.title,
          content: entry.content,
          retroType: "daily",
        })
          .then((serverEntry) => {
            dispatch({
              type: "entry/replaceId",
              payload: { localId, serverEntry: { ...serverEntry, folderId: folderId ?? null } },
            });
            // 호출자(RetrospectiveStudio)가 selectedId 를 서버 ID 로 갱신할 수 있도록 통지
            onIdReplaced?.(serverEntry);
            // 폴더 안에서 생성한 경우 — 생성 자체는 폴더를 모르므로(EntryCreateRequest
            // 에 folder_id 없음) 별도로 이동 호출을 보낸다.
            if (folderId) {
              void apiMoveEntryToFolder(serverEntry.id, "daily", folderId).catch(
                () => reportApiError(),
              );
            }
          })
          .catch(() => reportApiError());
      }
      return { entry, existed: false };
    },
    refreshGitHub: () => runGitHubRefresh(),
    loadGitHubAvailableRepos: async (): Promise<AvailableRepository[]> => {
      if (!USE_API) {
        // 이미 연결된 건 후보에서 제외
        const linked = new Set(
          state.github.linkedRepositories.map((r) => r.githubRepoId),
        );
        return MOCK_AVAILABLE_REPOS.filter((r) => !linked.has(r.githubRepoId));
      }
      return apiListAvailableRepos();
    },
    updateLinkedRepo: (repositoryId: string, commitReadEnabled: boolean) => {
      if (requireLoginInDemo()) return;
      // 낙관적 업데이트
      dispatch({
        type: "github/updateLinked",
        payload: { repositoryId, commitReadEnabled },
      });
      if (USE_API) {
        void apiUpdateRepo(repositoryId, { commitReadEnabled }).catch(() => {
          // 롤백
          dispatch({
            type: "github/updateLinked",
            payload: { repositoryId, commitReadEnabled: !commitReadEnabled },
          });
          reportApiError();
        });
      }
    },
    linkGitHubRepo: async (githubRepoId: number) => {
      if (requireLoginInDemo()) return;
      if (!USE_API) {
        const repo = MOCK_AVAILABLE_REPOS.find(
          (r) => r.githubRepoId === githubRepoId,
        );
        if (!repo) return;
        dispatch({
          type: "github/setLinked",
          payload: {
            status: "connected",
            repositories: [
              ...state.github.linkedRepositories,
              mockLinkRepository(repo),
            ],
          },
        });
        return;
      }
      try {
        const linked = await apiLinkRepo(githubRepoId);
        dispatch({
          type: "github/setLinked",
          payload: {
            status: "connected",
            repositories: [...state.github.linkedRepositories, linked],
          },
        });
      } catch {
        reportApiError();
      }
    },
    unlinkGitHubRepo: (repositoryId: string) => {
      if (requireLoginInDemo()) return;
      const next = state.github.linkedRepositories.filter(
        (r) => r.id !== repositoryId,
      );
      dispatch({
        type: "github/setLinked",
        payload: { status: "connected", repositories: next },
      });
      if (USE_API) void apiUnlinkRepo(repositoryId).catch(() => reportApiError());
    },
    unlinkAllGitHubRepos: () => {
      if (requireLoginInDemo()) return;
      dispatch({
        type: "github/setLinked",
        payload: { status: "connected", repositories: [] },
      });
      if (USE_API) void apiUnlinkAllRepos().catch(() => reportApiError());
    },
    syncAllGitHubRepos: async () => {
      if (requireLoginInDemo()) return;
      if (!USE_API) {
        dispatch({
          type: "github/setLinked",
          payload: {
            status: "connected",
            repositories: MOCK_AVAILABLE_REPOS.map(mockLinkRepository),
          },
        });
        return;
      }
      try {
        const repositories = await apiSyncAllRepos();
        dispatch({
          type: "github/setLinked",
          payload: { status: "connected", repositories },
        });
      } catch {
        reportApiError();
      }
    },
    setPushTarget: (repositoryId: string | null) => {
      if (requireLoginInDemo()) return;
      dispatch({ type: "github/setPushTarget", payload: { repositoryId } });
      if (USE_API) {
        void apiSetPushTarget(state.settings, repositoryId).catch(() => {
          // 롤백
          dispatch({
            type: "github/setPushTarget",
            payload: { repositoryId: state.github.pushTargetRepositoryId },
          });
          reportApiError();
        });
      }
    },
    loadCommits: async (date?: string) => {
      // 결과를 전역 state 에 저장하지 않고 직접 반환한다.
      // RetroEditor 가 로컬 useState 로 관리하므로, 다른 날짜 회고로 이동해도
      // 각 에디터 인스턴스(key=entry.id 로 재마운트)가 독립적인 커밋 목록을 가진다.
      if (!USE_API) {
        return MOCK_COMMITS;
      }
      try {
        return await apiGetCommits(date);
      } catch {
        // 커밋 로드 실패 → 빈 배열 (toast 없음)
        return [];
      }
    },
    pushRetrospective: async (
      retroType: "daily" | "weekly" | "monthly" | "yearly",
      dateKey: string,
      contentMarkdown: string,
    ): Promise<PushRetrospectiveResult> => {
      if (requireLoginInDemo()) {
        return { ok: false, error: "demo" };
      }
      const periodTypeMap = {
        daily: "DAILY",
        weekly: "WEEKLY",
        monthly: "MONTHLY",
        yearly: "ANNUAL",
      } as const;
      const periodType = periodTypeMap[retroType];
      const periodKey = toPeriodKey(retroType, dateKey);

      if (!USE_API) {
        // mock: 성공 응답 반환
        return {
          ok: true,
          commitSha: "mock_sha_" + Math.random().toString(36).slice(2, 8),
          htmlUrl: "https://github.com/developer/archive-journal",
          path: `daily/${dateKey} 회고록.md`,
        };
      }

      try {
        const result = await apiPushRetrospective({
          periodType,
          periodKey,
          contentMarkdown,
        });
        // push 성공 → 해당 entry 를 서버에서 재조회해 githubPush 필드 반영
        // (서버가 push 레코드를 생성하므로 synced=true 가 자동으로 결정됨)
        const entry = state.entries.find(
          (e) => e.dateKey === dateKey && e.retroType === retroType,
        );
        if (entry) {
          void apiGetEntry(entry.id)
            .then((updated) =>
              dispatch({ type: "entry/upsert", payload: { entry: updated } }),
            )
            .catch(() => {
              // 재조회 실패 시 낙관적으로 synced 마킹 (다음 하이드레이션에서 정합)
              dispatch({
                type: "entry/update",
                payload: { id: entry.id, patch: { synced: true } },
              });
            });
        }
        return { ok: true, ...result };
      } catch (e) {
        const err =
          e instanceof ApiError ? e.code : "GITHUB_PUSH_FAILED";
        return { ok: false, error: err };
      }
    },
    // ─── Google Calendar 연동 ──────────────────────────────────────────────────
    refreshCalendar: () => runCalendarRefresh(),
    connectCalendar: async () => {
      if (requireLoginInDemo()) return { ok: false, error: "demo" };
      if (!USE_API) return { ok: false, error: "mock" };
      const result = await apiConnectCalendar();
      // 콜백 메시지를 받았든 놓쳤든 서버 연결 상태를 직접 재확인해 즉시 반영.
      runCalendarRefresh();
      // 설정 화면에서 연결 직후이므로 현재 월 범위의 할 일을 재로드한다.
      const _cNow = new Date();
      void loadTodosForView(
        toDateKey(startOfMonth(_cNow)),
        toDateKey(endOfMonth(_cNow)),
      );
      return result;
    },
    disconnectCalendar: async () => {
      if (requireLoginInDemo()) return { ok: false };
      if (!USE_API) return { ok: false };
      try {
        await apiDisconnectCalendar();
        dispatch({
          type: "calendar/setConnection",
          payload: { status: "not-connected", googleUserId: null, lastSyncedAt: null },
        });
        return { ok: true };
      } catch {
        reportApiError();
        return { ok: false };
      }
    },
    syncCalendar: async (from: string, to: string) => {
      if (requireLoginInDemo()) return { ok: false };
      if (!USE_API) return { ok: false };
      try {
        const todos = await apiListTodos({ from, to });
        dispatch({ type: "hydrate/todos", payload: { todos } });
        return { ok: true };
      } catch (e) {
        if (e instanceof ApiError && e.code === "GOOGLE_CALENDAR_REAUTH_REQUIRED") {
          dispatch({
            type: "calendar/setConnection",
            payload: { status: "needs-reauth" },
          });
        } else {
          reportApiError();
        }
        return { ok: false };
      }
    },
    loadTodosForView,
    loadTodosForRange,
    loadEntriesPage,
    loadFolderContents,
    loadAllFolders,
    // ─── Folders ────────────────────────────────────────────────────────────
    createFolder: async (name, parentFolderId) => {
      if (!apiActive) {
        const folder: Folder = {
          id: createId("folder"),
          name,
          parentFolderId: parentFolderId ?? null,
          folderCount: 0,
          entryCount: 0,
          createdAt: new Date().toISOString(),
          updatedAt: null,
        };
        dispatch({ type: "folder/merge", payload: { folders: [folder] } });
        return folder;
      }
      try {
        const folder = await apiCreateFolder({ name, parentFolderId });
        dispatch({ type: "folder/merge", payload: { folders: [folder] } });
        return folder;
      } catch (e) {
        const locale = state.settings.locale;
        const msg =
          e instanceof ApiError && e.code === "FOLDER_NAME_DUPLICATED"
            ? translate(locale, "folder.error.duplicateName")
            : translate(locale, "auth.error.network");
        pushNotification("warning", msg, "", { transient: true });
        return null;
      }
    },
    updateFolder: async (folderId, patch) => {
      if (!apiActive) {
        const existing = state.folders.find((f) => f.id === folderId);
        if (!existing) return null;
        const updated: Folder = {
          ...existing,
          ...patch,
          updatedAt: new Date().toISOString(),
        };
        dispatch({ type: "folder/merge", payload: { folders: [updated] } });
        return updated;
      }
      try {
        const folder = await apiUpdateFolder(folderId, patch);
        dispatch({ type: "folder/merge", payload: { folders: [folder] } });
        return folder;
      } catch (e) {
        const locale = state.settings.locale;
        const msg =
          e instanceof ApiError && e.code === "FOLDER_NAME_DUPLICATED"
            ? translate(locale, "folder.error.duplicateName")
            : e instanceof ApiError && e.code === "FOLDER_CIRCULAR_REFERENCE"
              ? translate(locale, "folder.error.circular")
              : translate(locale, "auth.error.network");
        pushNotification("warning", msg, "", { transient: true });
        return null;
      }
    },
    deleteFolder: async (folderId) => {
      dispatch({ type: "folder/remove", payload: { id: folderId } });
      if (!apiActive) return true;
      try {
        await apiDeleteFolder(folderId);
        return true;
      } catch {
        reportApiError();
        return false;
      }
    },
    moveEntryToFolder: async (entryId, retroType, folderId) => {
      dispatch({
        type: "entry/update",
        payload: { id: entryId, patch: { folderId } },
      });
      if (!apiActive) return true;
      try {
        await apiMoveEntryToFolder(entryId, retroType, folderId);
        return true;
      } catch {
        reportApiError();
        return false;
      }
    },
    globalSearch,
    pushNotification,
    markNotificationRead: (id) => {
      dispatch({ type: "notification/markRead", payload: { id } });
      if (apiActive) void apiMarkNotificationRead(id).catch(() => reportApiError());
    },
    markAllNotificationsRead: () => {
      dispatch({ type: "notification/markAllRead" });
      if (apiActive)
        void apiMarkAllNotificationsRead().catch(() => reportApiError());
    },
    clearNotification: (id) => {
      dispatch({ type: "notification/clear", payload: { id } });
      if (apiActive) void apiDeleteNotification(id).catch(() => reportApiError());
    },
    clearReadNotifications: () => {
      dispatch({ type: "notification/clearRead" });
      if (apiActive) void apiClearNotifications(true).catch(() => reportApiError());
    },
    clearAllNotifications: () => {
      dispatch({ type: "notification/clearAll" });
      if (apiActive) void apiClearNotifications(false).catch(() => reportApiError());
    },
    dismissNotification,
    setLocale: (locale: Locale) => {
      dispatch({ type: "settings/locale", payload: { locale } });
      if (apiActive) void syncSettings({ locale });
    },
    setAutoSummary: (patch: Partial<AppSettings["autoSummary"]>) => {
      dispatch({ type: "settings/autoSummary", payload: { patch } });
      if (apiActive)
        void syncSettings({
          autoSummary: { ...state.settings.autoSummary, ...patch },
        });
    },
    setCalendarAutoPushTodo: (value) => {
      dispatch({ type: "settings/calendarAutoPushTodo", payload: { value } });
      if (apiActive) void syncSettings({ calendarAutoPushTodo: value });
    },
    setCalendarAutoDeleteTodo: (value) => {
      dispatch({ type: "settings/calendarAutoDeleteTodo", payload: { value } });
      if (apiActive) void syncSettings({ calendarAutoDeleteTodo: value });
    },
    setNotificationRetention: (days) => {
      dispatch({ type: "settings/retention", payload: { days } });
      if (apiActive) void syncSettings({ notificationRetentionDays: days });
    },
    setTodoBoardRange: (days) => {
      // FE 전용 선호도 — 서버(/settings)로 동기화하지 않고 localStorage 에만 저장한다.
      dispatch({ type: "settings/todoBoardRange", payload: { days } });
      writeTodoBoardRange(days);
    },
    setSpellCheck: (value) => {
      // FE 전용 선호도 — 서버(/settings)로 동기화하지 않고 localStorage 에만 저장한다.
      dispatch({ type: "settings/spellCheck", payload: { value } });
      writeSpellCheckPref(value);
    },
    setAccountType: (accountType) => {
      dispatch({ type: "settings/accountType", payload: { accountType } });
      // accountType 은 서버 User 속성 → currentUser 도 낙관적으로 동기화해
      // 다음 하이드레이션/복원 전까지 로컬 일관성을 유지한다.
      dispatch({ type: "auth/updateUser", payload: { patch: { accountType } } });
      // 서버 영속화. 실패 시 조용히 넘기지 않고 토스트로 알린다 (DB 미반영 진단).
      if (apiActive) {
        void apiUpdateProfile({ accountType })
          .then(() => {
            // 프로필 PATCH 가 새 access token(developer 클레임)을 교체한 뒤에야
            // GitHub 연결을 재프로브한다. GET /github/connection 은 developer 토큰이
            // 아니면 403 → 모드 전환 직후엔 연결이 not-connected 로 고정되어 회고
            // 커밋 섹션이 안 뜨므로, 변경 완료 시점에 한 번 다시 조회한다.
            githubProbedRef.current = null;
            runGitHubRefresh();
          })
          .catch(() => reportApiError());
      }
    },
    checkSummaryReadiness: async (kind, periodStart) => {
      // weekly 는 readiness 미지원 → null (바로 생성)
      if (kind === "weekly") return null;
      // mock 모드는 점검 생략
      if (!USE_API) return null;
      // periodStart 별로 캐시 키를 분리한다 (기간 선택 시 기간마다 점검 결과가 다름).
      const cacheKey = `${kind}:${periodStart ?? "default"}`;
      const cached = readinessCacheRef.current.get(cacheKey);
      if (cached) return cached;
      try {
        const readiness = await apiGetSummaryReadiness(kind, periodStart);
        readinessCacheRef.current.set(cacheKey, readiness);
        return readiness;
      } catch (e) {
        // 정상 흐름(monthly/annual)에서는 도달하지 않음. 422/네트워크 오류는
        // 방어적으로 null 반환 → 점검 없이 생성 진행.
        if (
          e instanceof ApiError &&
          e.code === "RETRO_SUMMARY_READINESS_UNSUPPORTED"
        ) {
          console.warn("[summary] readiness 미지원 호출:", kind);
        }
        return null;
      }
    },
    checkRetroExists: async (kind, periodStart, periodEnd) => {
      const retroType = KIND_TO_TYPE[kind];
      // 요약은 /summaries 로부터 state.entries 에 로드돼 있다(isSummary). 로컬에서
      // 기간 내 동일 retroType 요약 존재 여부를 확인한다 (덮어쓰기 확인용).
      return state.entries.some(
        (e) =>
          e.retroType === retroType &&
          e.dateKey >= periodStart &&
          e.dateKey <= periodEnd,
      );
    },
    startSummary: (kind, targetDateKey, periodStart, force) => {
      if (USE_API) startSummaryViaApi(kind, targetDateKey, periodStart, force);
      else startSummaryInternal(kind, targetDateKey);
    },
    minimizeSummary: () => dispatch({ type: "summary/minimize" }),
    completeSummary: () => {
      const p = state.pendingSummary;
      if (!p) return;
      // API 모드는 서버 완료를 강제할 수 없음 → 스트림 종료 + 취소만
      if (USE_API) {
        apiSummaryAbortRef.current?.();
        apiSummaryAbortRef.current = null;
        dispatch({ type: "summary/cancel" });
        return;
      }
      if (summaryTimerRef.current) window.clearTimeout(summaryTimerRef.current);
      completeSummaryFor(p.kind, p.targetDateKey);
    },
    cancelSummary: () => {
      if (summaryTimerRef.current) window.clearTimeout(summaryTimerRef.current);
      apiSummaryAbortRef.current?.();
      apiSummaryAbortRef.current = null;
      dispatch({ type: "summary/cancel" });
    },
    // ─── Topics ───────────────────────────────────────────────────────────
    loadTopics,
    createTopic,
    deleteTopic,
    generateTopicDigest,
    getTopicDigest,
    // ─── Templates ──────────────────────────────────────────────────────────
    addTemplate: (retroType, name, content) => {
      const localId = createId("template");
      const template: RetroTemplate = {
        id: localId,
        name,
        retroType,
        content,
        isDefault: false,
        isActive: false,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      dispatch({ type: "template/add", payload: { template } });
      if (apiActive) {
        void apiCreateTemplate({ retroType, name, content })
          .then((serverTemplate) => {
            // 로컬 낙관적 ID → 서버 ID 교체
            dispatch({
              type: "template/replaceId",
              payload: { localId, serverTemplate },
            });
          })
          .catch(() => reportApiError());
      }
      return template;
    },
    updateTemplate: (id, patch) => {
      dispatch({ type: "template/update", payload: { id, patch } });
      if (apiActive) {
        templateQueue.enqueue(id, {
          name: patch.name,
          content: patch.content,
        });
      }
    },
    deleteTemplate: (id) => {
      dispatch({ type: "template/delete", payload: { id } });
      if (apiActive) {
        void apiDeleteTemplate(id).catch(() => reportApiError());
      }
    },
    resetTemplate: (retroType) => {
      dispatch({ type: "template/resetDefault", payload: { retroType } });
      if (apiActive) {
        const defaultTpl = state.templates.find(
          (t) => t.retroType === retroType && t.isDefault,
        );
        if (defaultTpl) {
          void apiResetTemplate(defaultTpl.id)
            .then((serverTemplate) => {
              dispatch({
                type: "template/update",
                payload: {
                  id: serverTemplate.id,
                  patch: { content: serverTemplate.content, name: serverTemplate.name },
                },
              });
            })
            .catch(() => reportApiError());
        }
      }
    },
    setActiveTemplate: (retroType, id) => {
      dispatch({ type: "template/setActive", payload: { retroType, id } });
      if (apiActive) {
        void apiSetActiveTemplate(retroType, id).catch(() => reportApiError());
      }
    },
    // ─── Auth ────────────────────────────────────────────────────────────
    // USE_API 플래그로 실제 API ↔ mock 을 전환한다.
    login: async (email, password, rememberMe) => {
      const result = USE_API
        ? await apiLogin(email, password)
        : await mockLogin(email, password);
      if (result.ok) {
        dispatch({ type: "auth/login", payload: { user: result.user, rememberMe } });
        if (USE_API) {
          dispatch({ type: "settings/accountType", payload: { accountType: result.user.accountType } });
        }
      }
      return result;
    },
    logout: () => {
      if (USE_API) {
        // 대기 중 변경을 세션 종료 전에 모두 전송.
        todoQueue.flushAll();
        entryQueue.flushAll();
        settingsQueue.flushAll();
        profileQueue.flushAll();
        templateQueue.flushAll();
        void apiLogout();
      }
      dispatch({ type: "auth/logout" });
    },
    requestEmailCode: (email, mode) =>
      // 회원가입 코드 발송만 API 지원. reset(forgot-password) 흐름은 API 미정의 → mock 폴백.
      USE_API && mode !== "reset"
        ? apiRequestEmailCode(email)
        : mockRequestEmailCode(email, { mode }),
    verifyEmailCode: (email, code) =>
      USE_API ? apiVerifyEmailCode(email, code) : mockVerifyEmailCode(email, code),
    completeSignup: async (input: SignupInput) => {
      const result = USE_API
        ? await apiCompleteSignup(input)
        : await mockCompleteSignup(input);
      if (result.ok) {
        dispatch({ type: "auth/login", payload: { user: result.user, rememberMe: input.rememberMe } });
        if (USE_API) {
          dispatch({ type: "settings/accountType", payload: { accountType: result.user.accountType } });
        }
      }
      return result;
    },
    oauthLogin: async (provider: OAuthProvider) => {
      const result = USE_API
        ? await apiOAuthLogin(provider)
        : await mockOAuthLogin(provider);
      if (result.kind === "success") {
        dispatch({ type: "auth/login", payload: { user: result.user, rememberMe: true } });
        if (USE_API) {
          dispatch({ type: "settings/accountType", payload: { accountType: result.user.accountType } });
        }
      }
      // onboarding-required / error 는 호출 측(OAuthButtons)이 라우팅 처리
      return result;
    },
    completeOnboarding: async (input) => {
      const result = USE_API
        ? await apiCompleteOnboarding(input)
        : await mockCompleteOnboarding(input);
      if (result.ok) {
        dispatch({ type: "auth/login", payload: { user: result.user, rememberMe: true } });
        if (USE_API) {
          dispatch({ type: "settings/accountType", payload: { accountType: result.user.accountType } });
        }
      }
      return result;
    },
    // 비밀번호 재설정 (이메일 토큰 링크 방식)
    requestPasswordReset: (email) =>
      USE_API ? apiRequestPasswordReset(email) : mockRequestPasswordReset(email),
    confirmPasswordReset: (token, newPassword, newPasswordConfirm) =>
      USE_API
        ? apiConfirmPasswordReset(token, newPassword, newPasswordConfirm)
        : mockConfirmPasswordReset(token, newPassword),
    updateProfile: (patch: Partial<Pick<User, "displayName" | "avatarUrl">>) => {
      dispatch({ type: "auth/updateProfile", payload: { patch } }); // 낙관적
      // 디바운스 코얼레싱 — displayName 타이핑을 idle 후 1회 PATCH 로 합침.
      if (apiActive) profileQueue.enqueue("profile", patch);
    },
    // ─── 지역/시간대 ────────────────────────────────────────────────────────
    /**
     * 국가의 IANA timezone 목록 조회. multi=true 면 사용자가 timezone 을 직접 선택.
     * mock 모드: COUNTRY_PRIMARY_TZ 를 단일 요소로, MULTI_TZ_COUNTRIES 로 multi 판단.
     */
    loadCountryTimezones: async (code) => {
      if (!apiActive) {
        const tz = countryDefaultTimezone(code);
        const multi = MULTI_TZ_COUNTRIES.includes(code as MultiTzCountry);
        const tzList = tz ? [tz] : supportedTimeZones().slice(0, 20);
        return { multi, timezones: tzList };
      }
      try {
        return await apiGetCountryTimezones(code);
      } catch {
        // 실패 시 빈 목록 (단일 tz 로 간주)
        return { multi: false, timezones: [] };
      }
    },
    updateCountry: async (country, timezone, keepCurrentTimezone = false) => {
      if (requireLoginInDemo()) return { ok: false };
      const prevTz = state.currentUser?.timezone ?? null;
      if (!USE_API) {
        // mock: 국가 + timezone 갱신
        dispatch({
          type: "auth/updateUser",
          payload: { patch: { country, region: null, timezone: timezone ?? prevTz ?? undefined } },
        });
        return { ok: true };
      }
      try {
        const displayName = state.currentUser?.displayName;
        const user = await apiUpdateCountry(country, timezone, { displayName });
        dispatch({
          type: "auth/updateUser",
          payload: {
            patch: {
              country: user.country,
              region: user.region,
              timezone: user.timezone,
            },
          },
        });
        // 기존 요약 시간(timezone) 유지를 원하면 이전 tz 로 되돌린다
        if (keepCurrentTimezone && prevTz && prevTz !== user.timezone) {
          const restored = await apiUpdateTimezone(prevTz, { displayName });
          dispatch({
            type: "auth/updateUser",
            payload: { patch: { timezone: restored.timezone } },
          });
        }
        return { ok: true };
      } catch (err) {
        if (err instanceof ApiError) {
          // 다중 tz 국가인데 timezone 을 선택하지 않은 경우
          if (err.code === "AUTH_COUNTRY_TIMEZONE_REQUIRED") {
            pushNotification(
              "warning",
              translate(state.settings.locale, "settings.region.apply"),
              translate(state.settings.locale, "settings.region.selectTimezoneHint"),
              { transient: true },
            );
            return { ok: false };
          }
        }
        reportApiError();
        return { ok: false };
      }
    },
    updateTimezone: async (timezone) => {
      if (requireLoginInDemo()) return { ok: false };
      if (!USE_API) {
        dispatch({
          type: "auth/updateUser",
          payload: { patch: { timezone } },
        });
        return { ok: true };
      }
      try {
        const displayName = state.currentUser?.displayName;
        const user = await apiUpdateTimezone(timezone, { displayName });
        dispatch({
          type: "auth/updateUser",
          payload: { patch: { timezone: user.timezone } },
        });
        return { ok: true };
      } catch {
        reportApiError();
        return { ok: false };
      }
    },
    linkGitHubAccount: async () => {
      if (requireLoginInDemo()) return { ok: false, error: "demo" };
      if (!USE_API) {
        // mock: 즉시 연결됨 처리
        dispatch({ type: "github/setStatus", payload: { status: "connected" } });
        runGitHubRefresh();
        return { ok: true };
      }
      const result = await apiLinkOAuth("github");
      // 콜백 postMessage 를 받았든(ok) 놓쳤든(popup-closed/origin 불일치) 서버
      // 연결 상태를 직접 재확인해 즉시 UI 에 반영한다. 백엔드가 link 를 막 커밋한
      // 직후라 첫 조회가 아직 connected=false 일 수 있어 짧게 몇 번 재시도한다
      // (새로고침해야만 반영되던 레이스 제거).
      const probedConnected = await probeGitHubConnected();
      if (probedConnected) {
        runGitHubRefresh();
        return { ok: true };
      }
      return result;
    },
    // ─── 세션 관리 ───────────────────────────────────────────────────────────
    listSessions: () => (apiActive ? apiListSessions() : mockListSessions()),
    revokeSession: async (sessionId: string) => {
      if (requireLoginInDemo()) return { ok: false };
      try {
        if (USE_API) await apiRevokeSession(sessionId);
        else await mockRevokeSession(sessionId);
        return { ok: true };
      } catch {
        reportApiError();
        return { ok: false };
      }
    },
    revokeOtherSessions: async () => {
      if (requireLoginInDemo()) return { ok: false };
      try {
        const revokedCount = USE_API
          ? await apiRevokeOtherSessions()
          : await mockRevokeOtherSessions();
        return { ok: true, revokedCount };
      } catch {
        reportApiError();
        return { ok: false };
      }
    },
    // ─── 보안(탈취 감지) ─────────────────────────────────────────────────────
    securityLogout,
    dismissSecurityLogout: () => setSecurityLogout(false),
  };

  return (
    <AppContext.Provider value={value}>
      {children}
      <SecurityLogoutModal
        open={securityLogout}
        locale={state.settings.locale}
        onConfirm={() => setSecurityLogout(false)}
      />
    </AppContext.Provider>
  );
}

/** 탈취 의심(refresh 재사용)으로 강제 로그아웃 시 뜨는 보안 경고 모달. */
function SecurityLogoutModal({
  open,
  locale,
  onConfirm,
}: {
  open: boolean;
  locale: Locale;
  onConfirm: () => void;
}) {
  if (!open) return null;
  return (
    <ConfirmModal
      open={open}
      hideCancel
      title={translate(locale, "security.reuse.title")}
      message={translate(locale, "security.reuse.message")}
      confirmLabel={translate(locale, "security.reuse.action")}
      cancelLabel={translate(locale, "security.reuse.action")}
      onConfirm={onConfirm}
      onCancel={onConfirm}
      onDismiss={onConfirm}
    />
  );
}

// re-export for convenience
export type { NoticeCategory };
