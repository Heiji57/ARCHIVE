import { useEffect, useMemo, useState } from "react";
import { useArchiveApp } from "@/app/providers/useArchiveApp";
import type { RecurrenceRule, Todo } from "@/entities/todo/model/types";
import { collectAllTags, collectRecentTags, findTodoById } from "@/entities/todo/lib/selectors";
import { useTranslation } from "@/shared/lib/i18n";
import { useTodoListFilter } from "../model/useTodoListFilter";
import { QuickCapture } from "./QuickCapture";
import { TodoDetailPane } from "./TodoDetailPane";
import { TodoListRow } from "./TodoListRow";
import { TodoRangeFilterRow } from "./TodoRangeFilterRow";
import { TodoStatusFilterRow } from "./TodoStatusFilterRow";

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
  const { filter, setFilter, statusFilter, setStatusFilter, todayK, counts, entries } =
    useTodoListFilter(state.todos, rangeDays);
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
  // null 을 반환해 상세 패널이 빈 상태로 바뀌어 보인다.
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

  const STATUS_LABEL: Record<Todo["status"], string> = {
    "not-start": t("todo.col.notStart.ko"),
    "in-progress": t("todo.col.inProgress.ko"),
    done: t("todo.col.done.ko"),
  };

  const detailSelection = selectedTodo
    ? {
        todo: selectedTodo,
        panelProps: {
          tagSuggestions: allTags,
          recentTags,
          onClose: () => setSelectedId(null),
          onUpdate: (patch: Parameters<typeof updateTodo>[1]) =>
            updateTodo(selectedTodo.id, patch),
          onUpdateFollowing: (patch: Parameters<typeof updateTodoFollowing>[1]) =>
            void followRecurrenceMutation(
              () => updateTodoFollowing(selectedTodo.id, patch),
              selectedTodo.dateKey,
            ),
          onSetTime: (startTime: string | null, endTime: string | null) =>
            setTodoTime(selectedTodo.id, startTime, endTime),
          onSetTimeFollowing: (startTime: string | null, endTime: string | null) =>
            void followRecurrenceMutation(
              () => updateTodoTimeRecurrence(selectedTodo.id, startTime, endTime),
              selectedTodo.dateKey,
            ),
          onDelete: (scope?: Parameters<typeof removeTodo>[1]) => {
            removeTodo(selectedTodo.id, scope);
            setSelectedId(null);
          },
          onUpdateRecurrence: (rule: RecurrenceRule) =>
            void followRecurrenceMutation(
              () => updateTodoRecurrence(selectedTodo.id, rule),
              selectedTodo.dateKey,
            ),
          onConvertToRecurring: (rule: RecurrenceRule) =>
            void followRecurrenceMutation(
              () => convertTodoToRecurring(selectedTodo.id, rule),
              selectedTodo.dateKey,
            ),
          onToggleCalendarLink:
            state.calendar.status === "connected" || state.calendar.status === "needs-reauth"
              ? () => toggleTodoCalendarLink(selectedTodo.id)
              : undefined,
          calendarNeedsReauth: state.calendar.status === "needs-reauth",
        },
      }
    : null;

  return (
    <div className="page todo-page todo-split">
      <section className="todo-list-pane">
        <QuickCapture onSubmit={handleSubmit} tagSuggestions={allTags} recentTags={recentTags} />
        <TodoRangeFilterRow filter={filter} onChange={setFilter} todayKey={todayK} />
        <TodoStatusFilterRow value={statusFilter} onChange={setStatusFilter} counts={counts} />

        <div className="todo-list">
          {entries.map(({ todo, showHeader }) => (
            <div key={todo.id}>
              {showHeader ? (
                <div className="todo-list-header" data-status={todo.status}>
                  <span className="todo-list-header-dot" />
                  <span className="todo-list-header-label">{STATUS_LABEL[todo.status]}</span>
                  <span className="todo-list-header-count">{counts[todo.status]}</span>
                </div>
              ) : null}
              <TodoListRow
                todo={todo}
                isSelected={todo.id === selectedId}
                allTags={allTags}
                recentTags={recentTags}
                onUpdate={updateTodo}
                onSelect={setSelectedId}
              />
            </div>
          ))}
          {entries.length === 0 ? (
            <div className="todo-list-empty">{t("todo.list.empty")}</div>
          ) : null}
        </div>
      </section>

      <TodoDetailPane selection={detailSelection} />
    </div>
  );
}
