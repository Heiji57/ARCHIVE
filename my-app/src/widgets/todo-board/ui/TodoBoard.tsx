import { useEffect, useMemo, useState } from "react";
import { useArchiveApp } from "@/app/providers/useArchiveApp";
import type { RecurrenceRule, Todo } from "@/entities/todo/model/types";
import { collectAllTags, collectRecentTags, findTodoById } from "@/entities/todo/lib/selectors";
import { TaskDetailPanel } from "@/entities/todo/ui/TaskDetailPanel";
import { useTranslation } from "@/shared/lib/i18n";
import { COLS } from "../model/constants";
import { useKanbanFilter } from "../model/useKanbanFilter";
import { KanbanColumn } from "./KanbanColumn";
import { QuickCapture } from "./QuickCapture";
import { TodoFilterRow } from "./TodoFilterRow";

export function TodoBoard() {
  const {
    state,
    addTodo,
    updateTodo,
    updateTodoRecurrence,
    updateTodoTimeRecurrence,
    updateTodoFollowing,
    convertTodoToRecurring,
    setTodoTime,
    removeTodo,
    toggleTodoCalendarLink,
    loadTodosForRange,
    pushNotification,
    clearTodoIdReplacement,
  } = useArchiveApp();
  const { t } = useTranslation();
  const rangeDays = state.settings.todoBoardRangeDays;
  const { filter, setFilter, todayK, grouped } = useKanbanFilter(state.todos, rangeDays);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const allTags = useMemo(() => collectAllTags(state.todos), [state.todos]);
  const recentTags = useMemo(() => collectRecentTags(state.todos), [state.todos]);

  // 보드 진입 시 + 기간 설정 변경 시 "전체" 보기 범위의 할 일을 로드한다.
  // (loadTodosForRange 는 useCallback([]) 으로 안정화되어 있어 deps 에서 제외한다.)
  useEffect(() => {
    void loadTodosForRange(rangeDays);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rangeDays]);

  const selectedTodo = selectedId
    ? findTodoById(state.todos, selectedId)
    : null;

  // 반복 시리즈 가상 인스턴스를 편집하면 debounce 된 PATCH 응답으로 서버가 새 id 를
  // 발급할 수 있다(todo/replaceId) — selectedId 가 이를 따라가지 않으면 findTodoById 가
  // null 을 반환해 side-panel 은 열린 채(.open) 내용만 사라져 빈 검은 패널로 보인다.
  useEffect(() => {
    const rep = state.lastTodoIdReplacement;
    if (!rep || rep.localId !== selectedId) return;
    setSelectedId(rep.newId);
    clearTodoIdReplacement();
  }, [state.lastTodoIdReplacement, selectedId, clearTodoIdReplacement]);

  // 반복 전환/규칙변경 PATCH 응답은 base row 원본 형태라 목록에 나오는 가상 인스턴스
  // 모양과 다르다 — 재조회 후, 그 새 base 에서 파생된(같은 날짜) 항목을 찾아 선택을
  // 옮겨야 상세 패널이 갑자기 빈 화면이 되지 않는다.
  const followRecurrenceMutation = async (
    mutate: () => Promise<Todo | null>,
    originalDateKey: string,
  ) => {
    const serverTodo = await mutate();
    if (!serverTodo) return;
    const todos = await loadTodosForRange(rangeDays);
    const match = todos.find(
      (t) => t.seriesId === serverTodo.id && t.dateKey === originalDateKey,
    );
    setSelectedId(match ? match.id : serverTodo.id);
  };

  const handleSubmit = (
    text: string,
    dateKey: string,
    recurrenceRule?: RecurrenceRule | null,
    tags?: string[],
  ) => {
    // 새 할 일의 Google Calendar push 여부는 calendarAutoPushTodo 설정을 따른다
    // (pushToCalendar: null → 서버가 설정값으로 처리).
    addTodo(
      text,
      dateKey,
      { status: "not-start", pushToCalendar: null, recurrenceRule, tags },
      (id) => {
        setSelectedId(id);
        // 반복 생성 응답은 base row 원본 형태라 목록 조회의 가상 인스턴스 모양과 다르다 —
        // 재조회해야 반복 배지·이후 회차가 즉시 보이고, 선택도 새 가상 인스턴스로 옮겨간다.
        if (recurrenceRule) {
          void loadTodosForRange(rangeDays).then((todos) => {
            const match = todos.find((t) => t.seriesId === id && t.dateKey === dateKey);
            if (match) setSelectedId(match.id);
          });
        }
      },
    );
    pushNotification(
      "success",
      t("todo.notif.added.title"),
      `"${text}" — ${dateKey}`,
    );
  };

  return (
    <div className="page todo-page">
      <QuickCapture onSubmit={handleSubmit} tagSuggestions={allTags} recentTags={recentTags} />

      <TodoFilterRow filter={filter} onChange={setFilter} todayKey={todayK} />

      <div className="kanban-grid">
        {COLS.map((col) => (
          <KanbanColumn
            key={col.id}
            col={col}
            items={grouped[col.id]}
            allTags={allTags}
            recentTags={recentTags}
            onUpdate={updateTodo}
            onSelect={setSelectedId}
          />
        ))}
      </div>

      <div
        className={`side-panel-overlay ${selectedId ? "open" : ""}`}
        onClick={() => setSelectedId(null)}
      />

      <aside
        className={`side-panel ${selectedId ? "open" : ""}`}
        aria-hidden={!selectedId}
      >
        {selectedTodo ? (
          <TaskDetailPanel
            key={selectedTodo.id}
            todo={selectedTodo}
            tagSuggestions={allTags}
            recentTags={recentTags}
            onClose={() => setSelectedId(null)}
            onUpdate={(patch) => updateTodo(selectedTodo.id, patch)}
            onUpdateFollowing={(patch) =>
              void followRecurrenceMutation(
                () => updateTodoFollowing(selectedTodo.id, patch),
                selectedTodo.dateKey,
              )
            }
            onSetTime={(startTime, endTime) =>
              setTodoTime(selectedTodo.id, startTime, endTime)
            }
            onSetTimeFollowing={(startTime, endTime) =>
              void followRecurrenceMutation(
                () => updateTodoTimeRecurrence(selectedTodo.id, startTime, endTime),
                selectedTodo.dateKey,
              )
            }
            onDelete={(scope) => {
              removeTodo(selectedTodo.id, scope);
              setSelectedId(null);
            }}
            onUpdateRecurrence={(rule) =>
              void followRecurrenceMutation(
                () => updateTodoRecurrence(selectedTodo.id, rule),
                selectedTodo.dateKey,
              )
            }
            onConvertToRecurring={(rule) =>
              void followRecurrenceMutation(
                () => convertTodoToRecurring(selectedTodo.id, rule),
                selectedTodo.dateKey,
              )
            }
            onToggleCalendarLink={
              state.calendar.status === "connected" || state.calendar.status === "needs-reauth"
                ? () => toggleTodoCalendarLink(selectedTodo.id)
                : undefined
            }
            calendarNeedsReauth={state.calendar.status === "needs-reauth"}
          />
        ) : null}
      </aside>
    </div>
  );
}
