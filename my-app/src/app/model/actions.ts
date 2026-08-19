import type { CalendarStatus } from "@/entities/calendar/model/types";
import type { JournalEntry, RetrospectiveType } from "@/entities/entry/model/types";
import type {
  GitHubCommit,
  GitHubStatus,
  LinkedRepository,
} from "@/entities/github/model/types";
import type { Folder } from "@/entities/folder/model/types";
import type { NotificationItem } from "@/entities/notification/model/types";
import type {
  PendingSummary,
  SummaryKind,
} from "@/entities/summary/model/types";
import type { RetroTemplate } from "@/entities/template";
import type { RecurrenceRule, Todo } from "@/entities/todo/model/types";
import type { User } from "@/entities/user/model/types";
import type { AccountType, AppSettings, Locale } from "@/app/model/settings";

export type AppAction =
  | {
      type: "todo/add";
      payload: {
        id: string;
        title: string;
        dateKey: string;
        status?: Todo["status"];
        description?: string;
        startTime?: string;
        endTime?: string;
        /**
         * 로컬(비 API) 생성 경로에서 표시용으로만 보존한다 — 데모/mock 모드는
         * 서버의 반복 인스턴스 생성 로직이 없어 실제 반복은 일어나지 않는다.
         */
        recurrenceRule?: RecurrenceRule | null;
      };
    }
  | {
      type: "todo/update";
      payload: {
        id: string;
        patch: Partial<
          Pick<
            Todo,
            "title" | "status" | "description" | "dateKey" | "dueDate" | "startTime" | "endTime"
          >
        >;
      };
    }
  | { type: "todo/move"; payload: { id: string; dateKey: string } }
  | { type: "todo/upsert"; payload: { todo: Todo } }
  | { type: "todo/remove"; payload: { id: string } }
  | {
      /** 반복 시리즈 삭제(following/all) 후 로컬 state 에서 일치하는 항목들을 정리. */
      type: "todo/removeSeries";
      payload: { seriesId: string; fromDateKey: string | null };
    }
  | {
      type: "todo/set-calendar";
      payload: {
        id: string;
        calendarLinked: boolean;
        calendarPushStatus: Todo["calendarPushStatus"];
      };
    }
  // ── 서버 하이드레이션 (API 모드) ──
  | { type: "hydrate/todos"; payload: { todos: Todo[] } }
  | { type: "hydrate/entries"; payload: { entries: JournalEntry[] } }
  // 페이지네이션 조회 결과를 state.entries 에 병합(id upsert). hydrate/entries 와 달리
  // 기존 항목(요약 등)을 유지하며, 각 항목의 서버 updatedAt 을 그대로 보존한다.
  | { type: "entries/merge"; payload: { entries: JournalEntry[] } }
  | { type: "hydrate/notifications"; payload: { notifications: NotificationItem[] } }
  | { type: "hydrate/settings"; payload: { settings: AppSettings } }
  | { type: "hydrate/templates"; payload: { templates: RetroTemplate[]; activeTemplateIds: Record<string, string> } }
  | {
      type: "entry/update";
      payload: {
        id: string;
        patch: Partial<
          Pick<
            JournalEntry,
            "title" | "content" | "synced" | "retroType" | "folderId"
          >
        >;
      };
    }
  | { type: "entry/upsert"; payload: { entry: JournalEntry } }
  // 폴더 캐시 upsert-many(id 기준) — GET /folders/contents 병합 + 데모/mock 저장소.
  | { type: "folder/merge"; payload: { folders: Folder[] } }
  // 폴더 삭제 + cascade orphan(하위 폴더 parentFolderId, 안의 회고록 folderId → null).
  | { type: "folder/remove"; payload: { id: string } }
  /** POST 응답 서버 ID 로 낙관적 로컬 ID 를 교체한다. */
  | { type: "entry/replaceId"; payload: { localId: string; serverEntry: JournalEntry } }
  /** POST 응답 서버 ID 로 낙관적 로컬 ID 를 교체한다. */
  | { type: "todo/replaceId"; payload: { localId: string; serverTodo: Todo } }
  | { type: "github/setStatus"; payload: { status: GitHubStatus } }
  | {
      type: "github/setLinked";
      payload: {
        status: GitHubStatus;
        repositories: LinkedRepository[];
        login?: string | null;
        pushTargetRepositoryId?: string | null;
        hasVerifiedEmails?: boolean;
      };
    }
  | {
      type: "github/updateLinked";
      payload: { repositoryId: string; commitReadEnabled: boolean };
    }
  | { type: "github/setPushTarget"; payload: { repositoryId: string | null } }
  | { type: "github/setCommits"; payload: { commits: GitHubCommit[] } }
  | {
      type: "calendar/setConnection";
      payload: {
        status: CalendarStatus;
        googleUserId?: string | null;
        lastSyncedAt?: string | null;
      };
    }
  | { type: "notification/push"; payload: { notification: NotificationItem } }
  | { type: "notification/dismiss"; payload: { id: string } }
  | { type: "notification/markRead"; payload: { id: string } }
  | { type: "notification/markAllRead" }
  | { type: "notification/clear"; payload: { id: string } }
  | { type: "notification/clearRead" }
  | { type: "notification/clearAll" }
  | { type: "notification/cleanup"; payload: { retentionDays: number } }
  | { type: "settings/locale"; payload: { locale: Locale } }
  | {
      type: "settings/autoSummary";
      payload: { patch: Partial<AppSettings["autoSummary"]> };
    }
  | { type: "settings/retention"; payload: { days: number } }
  | { type: "settings/todoBoardRange"; payload: { days: number } }
  | { type: "settings/calendarAutoPushTodo"; payload: { value: boolean } }
  | { type: "settings/calendarAutoDeleteTodo"; payload: { value: boolean } }
  | { type: "settings/scheduleCheck"; payload: { timestamp: string } }
  | { type: "settings/accountType"; payload: { accountType: AccountType } }
  | {
      type: "summary/start";
      payload: { kind: SummaryKind; targetDateKey: string };
    }
  | { type: "summary/minimize" }
  | { type: "summary/complete" }
  | { type: "summary/cancel" }
  | { type: "summary/setPending"; payload: { pending: PendingSummary | null } }
  | { type: "template/add"; payload: { template: RetroTemplate } }
  | {
      type: "template/update";
      payload: {
        id: string;
        patch: Partial<Pick<RetroTemplate, "name" | "content">>;
      };
    }
  | { type: "template/delete"; payload: { id: string } }
  | { type: "template/replaceId"; payload: { localId: string; serverTemplate: RetroTemplate } }
  | {
      type: "template/resetDefault";
      payload: { retroType: RetrospectiveType };
    }
  | {
      type: "template/setActive";
      payload: { retroType: RetrospectiveType; id: string };
    }
  | {
      type: "auth/login";
      payload: { user: User; rememberMe: boolean };
    }
  | { type: "auth/logout" }
  | {
      type: "auth/updateProfile";
      payload: { patch: Partial<Pick<User, "displayName" | "avatarUrl">> };
    }
  | {
      type: "auth/updateUser";
      payload: {
        patch: Partial<
          Pick<User, "country" | "region" | "timezone" | "accountType">
        >;
      };
    };
