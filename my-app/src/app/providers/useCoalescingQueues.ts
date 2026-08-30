import { useEffect, useState, type Dispatch } from "react";
import type { AppAction } from "@/app/model/actions";
import type { AppSettings } from "@/app/model/settings";
import type { AppState } from "@/app/model/types";
import type { JournalEntry } from "@/entities/entry/model/types";
import type { Todo } from "@/entities/todo/model/types";
import type { User } from "@/entities/user/model/types";
import { isDemoMode } from "@/app/config/demo";
import {
  USE_API,
  apiUpdateProfile,
  apiUpdateSettings,
  apiUpdateSummaryContent,
  apiUpdateTemplate,
  apiUpdateTodo,
  apiUpsertEntry,
} from "@/shared/api";
import { COALESCE_MS, createCoalescingQueue } from "@/shared/lib/coalesce";
import { useLatestRef } from "@/shared/lib/useLatestRef";

export type TodoQueuePatch = Partial<
  Pick<Todo, "title" | "status" | "description" | "dateKey" | "tags" | "dueDate">
> & { startTime?: string | null; endTime?: string | null; timezone?: string | null };
export type EntryQueuePatch = Partial<
  Pick<JournalEntry, "title" | "content" | "retroType">
>;
/** AI 요약(isSummary) 편집 — PATCH /summaries/{id}. contentMarkdown 만 지원. */
export type SummaryQueuePatch = { contentMarkdown?: string | null };
export type ProfileQueuePatch = Partial<Pick<User, "displayName" | "avatarUrl">>;
export type TemplateQueuePatch = { name?: string | null; content?: string | null };

export interface CoalescingQueues {
  todoQueue: ReturnType<typeof createCoalescingQueue<TodoQueuePatch>>;
  entryQueue: ReturnType<typeof createCoalescingQueue<EntryQueuePatch>>;
  summaryQueue: ReturnType<typeof createCoalescingQueue<SummaryQueuePatch>>;
  settingsQueue: ReturnType<typeof createCoalescingQueue<Partial<AppSettings>>>;
  profileQueue: ReturnType<typeof createCoalescingQueue<ProfileQueuePatch>>;
  templateQueue: ReturnType<typeof createCoalescingQueue<TemplateQueuePatch>>;
}

/**
 * 변경이 잦은 서버 쓰기(todo/회고/요약/설정/프로필/템플릿)를 idle 후 1회로 합쳐
 * 보내는 디바운스 코얼레싱 큐 묶음. UI 는 호출부에서 즉시 낙관적 dispatch 하므로
 * 체감 지연은 없다. 각 큐는 앱 수명 동안 1회만 생성돼 안정적 참조를 유지한다.
 *
 * send/onError 클로저는 1회만 생성되므로 최신 state·reportApiError 를 latest-ref 로
 * 참조한다(모두 디바운스 타이머·unload 등 비동기 컨텍스트에서만 읽힘).
 */
export function useCoalescingQueues(
  state: AppState,
  reportApiError: () => void,
  dispatch: Dispatch<AppAction>,
): CoalescingQueues {
  const reportApiErrorRef = useLatestRef(reportApiError);
  const latestRef = useLatestRef({
    settings: state.settings,
    entries: state.entries,
  });

  // useState lazy 초기화로 앱 수명 동안 큐를 1회만 생성한다.
  // latest-ref 들은 비동기 send/onError 콜백에서만 읽지만, 린터가 초기화 클로저
  // 전체를 렌더 단계로 보아 오탐하므로 예외 처리한다.
  // eslint-disable-next-line react-hooks/refs
  const [queues] = useState<CoalescingQueues>(() => ({
    todoQueue: createCoalescingQueue<TodoQueuePatch>({
      delayMs: COALESCE_MS,
      // 반복 시리즈의 가상 인스턴스를 수정하면 서버가 예외 row 를 실체화해 새 id 를
      // 발급할 수 있다 — 응답의 id 로 로컬 state 를 교체해 이후 PATCH 가 죽은 가상
      // id 를 계속 참조하지 않도록 한다(반복 Todo 가이드 에지 케이스 #1).
      send: (id, merged) =>
        apiUpdateTodo(id, merged).then((serverTodo) => {
          dispatch({ type: "todo/replaceId", payload: { localId: id, serverTodo } });
        }),
      onError: () => reportApiErrorRef.current(),
    }),
    entryQueue: createCoalescingQueue<EntryQueuePatch>({
      delayMs: COALESCE_MS,
      send: (id, merged) => {
        const base = latestRef.current.entries.find((e) => e.id === id);
        if (!base) return Promise.resolve();
        return apiUpsertEntry(id, {
          dateKey: base.dateKey,
          title: merged.title ?? base.title,
          content: merged.content ?? base.content,
          retroType: merged.retroType ?? base.retroType,
        });
      },
      onError: () => reportApiErrorRef.current(),
    }),
    summaryQueue: createCoalescingQueue<SummaryQueuePatch>({
      delayMs: COALESCE_MS,
      send: (id, merged) =>
        apiUpdateSummaryContent(id, merged.contentMarkdown ?? null),
      onError: () => reportApiErrorRef.current(),
    }),
    settingsQueue: createCoalescingQueue<Partial<AppSettings>>({
      delayMs: COALESCE_MS,
      // settings 는 전체 교체(PUT) — 누적 patch 를 send 시점의 최신 settings 에 합쳐 보낸다.
      send: (_key, merged) => {
        const cur = latestRef.current.settings;
        const full: AppSettings = {
          ...cur,
          ...merged,
          autoSummary: { ...cur.autoSummary, ...(merged.autoSummary ?? {}) },
        };
        return apiUpdateSettings(full);
      },
      onError: () => reportApiErrorRef.current(),
    }),
    profileQueue: createCoalescingQueue<ProfileQueuePatch>({
      delayMs: COALESCE_MS,
      send: (_key, merged) => apiUpdateProfile(merged),
      onError: () => reportApiErrorRef.current(),
    }),
    templateQueue: createCoalescingQueue<TemplateQueuePatch>({
      delayMs: COALESCE_MS,
      send: (id, merged) => apiUpdateTemplate(id, merged),
      onError: () => reportApiErrorRef.current(),
    }),
  }));

  // 페이지 이탈/탭 숨김 시 대기 중 변경을 즉시 전송해 유실 창을 최소화.
  // 데모는 서버 큐에 아무것도 쌓이지 않으므로 리스너를 걸지 않는다.
  useEffect(() => {
    if (!USE_API || isDemoMode()) return;
    const flushAll = () => {
      queues.todoQueue.flushAll();
      queues.entryQueue.flushAll();
      queues.settingsQueue.flushAll();
      queues.profileQueue.flushAll();
      queues.templateQueue.flushAll();
    };
    const onVisibility = () => {
      if (document.visibilityState === "hidden") flushAll();
    };
    window.addEventListener("beforeunload", flushAll);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("beforeunload", flushAll);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [queues]);

  return queues;
}
