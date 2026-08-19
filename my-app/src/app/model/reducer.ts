import type { AppAction } from "@/app/model/actions";
import { DEFAULT_SETTINGS } from "@/app/model/settings";
import type { AppState } from "@/app/model/types";
import type { JournalEntry } from "@/entities/entry/model/types";
import { INITIAL_GITHUB_STATE } from "@/entities/github/model/types";
import type { NotificationItem } from "@/entities/notification/model/types";
import { DEFAULT_TEMPLATE_CONTENT, defaultTemplateId } from "@/entities/template";
import type { Todo } from "@/entities/todo/model/types";
import { createId } from "@/shared/lib/id";

export function appReducer(state: AppState, action: AppAction): AppState {
  switch (action.type) {
    case "todo/add":
      return {
        ...state,
        todos: [
          ...state.todos,
          createTodo(
            action.payload.title,
            action.payload.dateKey,
            action.payload.status,
            action.payload.description,
            action.payload.id,
            action.payload.startTime,
            action.payload.endTime,
            action.payload.recurrenceRule,
          ),
        ],
      };

    case "todo/update":
      return {
        ...state,
        todos: state.todos.map((todo) =>
          todo.id === action.payload.id
            ? applyTodoPatch(todo, action.payload.patch)
            : todo,
        ),
      };

    case "todo/move":
      return {
        ...state,
        todos: state.todos.map((todo) =>
          todo.id === action.payload.id
            ? { ...todo, dateKey: action.payload.dateKey }
            : todo,
        ),
      };

    case "todo/upsert": {
      const idx = state.todos.findIndex((t) => t.id === action.payload.todo.id);
      if (idx >= 0) {
        const next = state.todos.slice();
        next[idx] = action.payload.todo;
        return { ...state, todos: next };
      }
      return { ...state, todos: [...state.todos, action.payload.todo] };
    }

    case "todo/remove":
      return {
        ...state,
        todos: state.todos.filter((t) => t.id !== action.payload.id),
      };

    case "todo/removeSeries": {
      const { seriesId, fromDateKey } = action.payload;
      return {
        ...state,
        todos: state.todos.filter(
          (t) =>
            !(
              t.seriesId === seriesId &&
              (fromDateKey === null || t.dateKey >= fromDateKey)
            ),
        ),
      };
    }

    case "todo/set-calendar": {
      const { id, calendarLinked, calendarPushStatus } = action.payload;
      return {
        ...state,
        todos: state.todos.map((t) =>
          t.id === id ? { ...t, calendarLinked, calendarPushStatus } : t,
        ),
      };
    }

    case "hydrate/todos":
      return { ...state, todos: action.payload.todos };

    case "hydrate/entries":
      return { ...state, entries: action.payload.entries };

    case "entries/merge": {
      // id 기준 upsert-many. 기존 항목은 서버 값으로 교체하고, 없던 항목은 추가한다.
      const byId = new Map(state.entries.map((e) => [e.id, e]));
      for (const entry of action.payload.entries) {
        const prev = byId.get(entry.id);
        if (prev && prev.isSummary && entry.isSummary) {
          // GET /entries/paginated 의 EntryResponse 에는 editedContent 짝 필드가 없어
          // (SummaryResponse 에만 존재) 이 응답의 content 가 사용자 편집본을 반영하는지
          // AI 원본인지 계약상 불명확하다 — 이미 아는 본문(로컬에 정확히 반영돼 있는
          // 값)을 목록 재조회로 퇴화시키지 않도록 content 는 항상 기존 값을 보존한다.
          // 실제 편집/되돌리기/재생성 갱신은 entry/upsert(PATCH·SSE 재조회)가 담당한다.
          byId.set(entry.id, { ...prev, ...entry, content: prev.content });
        } else {
          byId.set(entry.id, prev ? { ...prev, ...entry } : entry);
        }
      }
      return { ...state, entries: [...byId.values()] };
    }

    case "folder/merge": {
      const byId = new Map(state.folders.map((f) => [f.id, f]));
      for (const folder of action.payload.folders) {
        byId.set(folder.id, folder);
      }
      return { ...state, folders: [...byId.values()] };
    }

    case "folder/remove": {
      const { id } = action.payload;
      return {
        ...state,
        folders: state.folders
          .filter((f) => f.id !== id)
          .map((f) => (f.parentFolderId === id ? { ...f, parentFolderId: null } : f)),
        entries: state.entries.map((e) =>
          e.folderId === id ? { ...e, folderId: null } : e,
        ),
      };
    }

    case "hydrate/notifications":
      return { ...state, notifications: action.payload.notifications };

    case "hydrate/settings":
      // SettingsResponse 에 없는 FE/서버-User 전용 필드(accountType,
      // accountTypeDetermined)는 서버 settings 로 덮어쓰지 않고 기존 값을 보존한다.
      // (accountType 은 세션 복원/로그인 시 user 로부터 별도 동기화된다)
      return {
        ...state,
        settings: {
          ...action.payload.settings,
          accountType: state.settings.accountType,
          accountTypeDetermined: state.settings.accountTypeDetermined,
        },
      };

    case "hydrate/templates":
      return {
        ...state,
        templates: action.payload.templates,
        activeTemplateIds: {
          ...state.activeTemplateIds,
          ...action.payload.activeTemplateIds,
        },
      };

    case "entry/update":
      return {
        ...state,
        entries: state.entries.map((entry) =>
          entry.id === action.payload.id
            ? {
                ...entry,
                ...action.payload.patch,
                updatedAt: new Date().toISOString(),
              }
            : entry,
        ),
      };

    case "entry/upsert": {
      const existingIndex = state.entries.findIndex(
        (e) => e.id === action.payload.entry.id,
      );
      if (existingIndex >= 0) {
        const prev = state.entries[existingIndex];
        const next = state.entries.slice();
        next[existingIndex] = {
          ...prev,
          ...action.payload.entry,
          // SummaryResponse(GET /summaries/{id})엔 folderId 가 없어 toSummaryEntry
          // 가 항상 null 을 채운다 — 요약 재생성/되돌리기로 이 액션이 다시 실행돼도
          // 폴더 소속을 잃지 않도록 기존 값을 유지한다. 실제 폴더 이동은 항상
          // entry/update(folderId 패치)로만 이뤄진다.
          folderId: prev.folderId,
          updatedAt: new Date().toISOString(),
        };
        return { ...state, entries: next };
      }
      return {
        ...state,
        entries: [...state.entries, action.payload.entry],
      };
    }

    // POST/PUT 응답의 서버 entry 로 낙관적 로컬 entry 를 교체한다.
    // localId 항목과 serverEntry.id 를 이미 가진 항목(예: 하이드레이션된 동일
    // entry)을 모두 제거한 뒤 serverEntry 하나만 남긴다 → 어떤 경로(요약 덮어쓰기
    // 등)에서도 동일 entry 가 중복 생성되지 않게 한다.
    case "entry/replaceId": {
      const { localId, serverEntry } = action.payload;
      const rest = state.entries.filter(
        (e) => e.id !== localId && e.id !== serverEntry.id,
      );
      return { ...state, entries: [...rest, serverEntry] };
    }

    case "todo/replaceId": {
      const { localId, serverTodo } = action.payload;
      // entry/replaceId 와 동일하게 중복(localId + serverTodo.id) 제거 후 단일 유지.
      const rest = state.todos.filter(
        (t) => t.id !== localId && t.id !== serverTodo.id,
      );
      return { ...state, todos: [...rest, serverTodo] };
    }

    case "github/setStatus":
      return {
        ...state,
        github: { ...state.github, status: action.payload.status },
      };

    case "github/setLinked":
      return {
        ...state,
        github: {
          ...state.github,
          status: action.payload.status,
          linkedRepositories: action.payload.repositories,
          ...(action.payload.login !== undefined
            ? { login: action.payload.login }
            : {}),
          ...(action.payload.pushTargetRepositoryId !== undefined
            ? { pushTargetRepositoryId: action.payload.pushTargetRepositoryId }
            : {}),
          ...(action.payload.hasVerifiedEmails !== undefined
            ? { hasVerifiedEmails: action.payload.hasVerifiedEmails }
            : {}),
        },
      };

    case "github/updateLinked":
      return {
        ...state,
        github: {
          ...state.github,
          linkedRepositories: state.github.linkedRepositories.map((r) =>
            r.id === action.payload.repositoryId
              ? { ...r, commitReadEnabled: action.payload.commitReadEnabled }
              : r,
          ),
        },
      };

    case "github/setPushTarget":
      return {
        ...state,
        github: {
          ...state.github,
          pushTargetRepositoryId: action.payload.repositoryId,
        },
      };

    case "github/setCommits":
      return {
        ...state,
        github: { ...state.github, commits: action.payload.commits },
      };

    case "calendar/setConnection":
      return {
        ...state,
        calendar: {
          ...state.calendar,
          status: action.payload.status,
          ...(action.payload.googleUserId !== undefined
            ? { googleUserId: action.payload.googleUserId }
            : {}),
          ...(action.payload.lastSyncedAt !== undefined
            ? { lastSyncedAt: action.payload.lastSyncedAt }
            : {}),
          // 미연결/재인증 상태로 바뀌면 캐시된 이벤트를 비운다.
          ...(action.payload.status === "not-connected"
            ? { events: [] }
            : {}),
        },
      };

    case "notification/push":
      // 동일 id 는 무시 (하이드레이션 ↔ SSE 실시간 수신 중복 방지)
      if (
        state.notifications.some((n) => n.id === action.payload.notification.id)
      ) {
        return state;
      }
      return {
        ...state,
        notifications: [action.payload.notification, ...state.notifications],
      };

    case "notification/dismiss":
    case "notification/clear":
      return {
        ...state,
        notifications: state.notifications.filter(
          (n) => n.id !== action.payload.id,
        ),
      };

    case "notification/markRead":
      return {
        ...state,
        notifications: state.notifications.map((n) =>
          n.id === action.payload.id ? { ...n, read: true } : n,
        ),
      };

    case "notification/markAllRead":
      return {
        ...state,
        notifications: state.notifications.map((n) =>
          n.read ? n : { ...n, read: true },
        ),
      };

    case "notification/clearRead":
      return {
        ...state,
        notifications: state.notifications.filter((n) => !n.read),
      };

    case "notification/clearAll":
      return { ...state, notifications: [] };

    case "notification/cleanup": {
      const cutoff =
        Date.now() - action.payload.retentionDays * 24 * 60 * 60 * 1000;
      return {
        ...state,
        notifications: state.notifications.filter(
          (n) => new Date(n.timestamp).getTime() >= cutoff,
        ),
      };
    }

    case "settings/locale":
      return {
        ...state,
        settings: { ...state.settings, locale: action.payload.locale },
      };

    case "settings/autoSummary":
      return {
        ...state,
        settings: {
          ...state.settings,
          autoSummary: {
            ...state.settings.autoSummary,
            ...action.payload.patch,
          },
        },
      };

    case "settings/retention":
      return {
        ...state,
        settings: {
          ...state.settings,
          notificationRetentionDays: action.payload.days,
        },
      };

    case "settings/todoBoardRange":
      return {
        ...state,
        settings: {
          ...state.settings,
          todoBoardRangeDays: action.payload.days,
        },
      };

    case "settings/calendarAutoPushTodo":
      return {
        ...state,
        settings: {
          ...state.settings,
          calendarAutoPushTodo: action.payload.value,
        },
      };

    case "settings/calendarAutoDeleteTodo":
      return {
        ...state,
        settings: {
          ...state.settings,
          calendarAutoDeleteTodo: action.payload.value,
        },
      };

    case "settings/scheduleCheck":
      return {
        ...state,
        settings: {
          ...state.settings,
          lastScheduleCheckAt: action.payload.timestamp,
        },
      };

    case "settings/accountType":
      return {
        ...state,
        settings: {
          ...state.settings,
          accountType: action.payload.accountType,
          accountTypeDetermined: true,
        },
      };

    case "summary/start": {
      const now = new Date();
      return {
        ...state,
        pendingSummary: {
          id: createId("summary"),
          kind: action.payload.kind,
          startedAt: now.toISOString(),
          willCompleteAt: new Date(now.getTime() + 6000).toISOString(),
          minimized: false,
          targetDateKey: action.payload.targetDateKey,
        },
      };
    }

    case "summary/minimize":
      if (!state.pendingSummary) return state;
      return {
        ...state,
        pendingSummary: { ...state.pendingSummary, minimized: true },
      };

    case "summary/cancel":
      return { ...state, pendingSummary: null };

    case "summary/setPending":
      return { ...state, pendingSummary: action.payload.pending };

    case "summary/complete":
      return { ...state, pendingSummary: null };

    case "template/add":
      return {
        ...state,
        templates: [...state.templates, action.payload.template],
      };

    case "template/replaceId": {
      const { localId, serverTemplate } = action.payload;
      const nextActive = { ...state.activeTemplateIds };
      if (nextActive[serverTemplate.retroType] === localId) {
        nextActive[serverTemplate.retroType] = serverTemplate.id;
      }
      return {
        ...state,
        templates: state.templates.map((t) =>
          t.id === localId ? serverTemplate : t,
        ),
        activeTemplateIds: nextActive,
      };
    }

    case "template/update":
      return {
        ...state,
        templates: state.templates.map((t) =>
          t.id === action.payload.id
            ? { ...t, ...action.payload.patch, updatedAt: new Date().toISOString() }
            : t,
        ),
      };

    case "template/delete": {
      const deleted = state.templates.find((t) => t.id === action.payload.id);
      const nextActive = { ...state.activeTemplateIds };
      // 삭제한 템플릿이 활성 상태였다면 해당 타입의 기본 템플릿으로 되돌린다
      if (deleted && nextActive[deleted.retroType] === deleted.id) {
        nextActive[deleted.retroType] = defaultTemplateId(deleted.retroType);
      }
      return {
        ...state,
        templates: state.templates.filter((t) => t.id !== action.payload.id),
        activeTemplateIds: nextActive,
      };
    }

    case "template/setActive":
      return {
        ...state,
        activeTemplateIds: {
          ...state.activeTemplateIds,
          [action.payload.retroType]: action.payload.id,
        },
      };

    case "template/resetDefault":
      return {
        ...state,
        templates: state.templates.map((t) =>
          t.retroType === action.payload.retroType && t.isDefault
            ? {
                ...t,
                content: DEFAULT_TEMPLATE_CONTENT[action.payload.retroType],
                updatedAt: new Date().toISOString(),
              }
            : t,
        ),
      };

    case "auth/login":
      return {
        ...state,
        currentUser: action.payload.user,
        rememberMe: action.payload.rememberMe,
        // GitHub 연결 상태는 계정/세션에 종속 → 로그인 시 초기화하고 서버에서 재조회.
        github: INITIAL_GITHUB_STATE,
      };

    case "auth/logout":
      return {
        ...state,
        currentUser: null,
        rememberMe: false,
        github: INITIAL_GITHUB_STATE,
      };

    case "auth/updateProfile":
      if (!state.currentUser) return state;
      return {
        ...state,
        currentUser: { ...state.currentUser, ...action.payload.patch },
      };

    case "auth/updateUser":
      if (!state.currentUser) return state;
      return {
        ...state,
        currentUser: { ...state.currentUser, ...action.payload.patch },
      };

    default:
      return state;
  }
}

// ─── helpers ──────────────────────────────────────────────────────────────────

function createTodo(
  title: string,
  dateKey: string,
  status: Todo["status"] = "not-start",
  description = "",
  id?: string,
  startTime?: string,
  endTime?: string,
  recurrenceRule?: Todo["recurrenceRule"],
): Todo {
  const now = new Date().toISOString();
  return {
    id: id ?? createId("todo"),
    title,
    completed: status === "done",
    dateKey,
    createdAt: now,
    completedAt: status === "done" ? now : null,
    status,
    description,
    startTime: startTime ?? null,
    endTime: endTime ?? null,
    calendarLinked: false,
    calendarPushStatus: null,
    isVirtual: false,
    seriesId: null,
    originalDateKey: null,
    recurrenceRule: recurrenceRule ?? null,
  };
}

function applyTodoPatch(
  todo: Todo,
  patch: Partial<
    Pick<
      Todo,
      "title" | "status" | "description" | "dateKey" | "dueDate" | "startTime" | "endTime"
    >
  >,
): Todo {
  const nextStatus = patch.status ?? todo.status;
  const becameDone = nextStatus === "done" && todo.status !== "done";
  const leftDone = nextStatus !== "done" && todo.status === "done";

  return {
    ...todo,
    ...patch,
    status: nextStatus,
    completed: nextStatus === "done",
    completedAt: becameDone
      ? new Date().toISOString()
      : leftDone
        ? null
        : todo.completedAt,
  };
}

export function ensureSettings(
  partial: Partial<AppState["settings"]> | undefined,
): AppState["settings"] {
  if (!partial) return { ...DEFAULT_SETTINGS };
  return {
    locale: partial.locale ?? DEFAULT_SETTINGS.locale,
    autoSummary: {
      ...DEFAULT_SETTINGS.autoSummary,
      ...(partial.autoSummary ?? {}),
    },
    notificationRetentionDays:
      partial.notificationRetentionDays ??
      DEFAULT_SETTINGS.notificationRetentionDays,
    todoBoardRangeDays:
      partial.todoBoardRangeDays ?? DEFAULT_SETTINGS.todoBoardRangeDays,
    lastScheduleCheckAt:
      partial.lastScheduleCheckAt ?? DEFAULT_SETTINGS.lastScheduleCheckAt,
    accountType: partial.accountType ?? DEFAULT_SETTINGS.accountType,
    accountTypeDetermined:
      partial.accountTypeDetermined ?? DEFAULT_SETTINGS.accountTypeDetermined,
    calendarAutoPushTodo:
      partial.calendarAutoPushTodo ?? DEFAULT_SETTINGS.calendarAutoPushTodo,
    calendarAutoDeleteTodo:
      partial.calendarAutoDeleteTodo ?? DEFAULT_SETTINGS.calendarAutoDeleteTodo,
  };
}

// re-exports so other modules can import these from one place
export type { JournalEntry, NotificationItem };
