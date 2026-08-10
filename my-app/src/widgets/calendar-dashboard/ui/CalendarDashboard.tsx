import { Minimize2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useArchiveApp } from "@/app/providers/useArchiveApp";
import { useTodayKey } from "@/app/providers/useToday";
import { collectAllTags, collectRecentTags, findTodoById } from "@/entities/todo/lib/selectors";
import type { Todo } from "@/entities/todo/model/types";
import { useTranslation } from "@/shared/lib/i18n";
import {
  endOfISOWeek,
  endOfMonth,
  fromDateKey,
  startOfISOWeek,
  startOfMonth,
  toDateKey,
} from "@/shared/lib/date";
import { useCalendarNav } from "../model/useCalendarNav";
import { CalendarToolbar } from "./CalendarToolbar";
import { DayTimeline } from "./DayTimeline";
import { MonthGrid } from "./MonthGrid";
import { TaskDetailPanel } from "@/entities/todo/ui/TaskDetailPanel";
import { WeekGrid } from "./WeekGrid";

export function CalendarDashboard() {
  const {
    state,
    addTodo,
    updateTodo,
    updateTodoRecurrence,
    updateTodoTimeRecurrence,
    updateTodoFollowing,
    convertTodoToRecurring,
    moveTodo,
    setTodoTime,
    removeTodo,
    loadTodosForView,
    toggleTodoCalendarLink,
    focusTarget,
    clearFocus,
    clearTodoIdReplacement,
  } = useArchiveApp();
  const { t } = useTranslation();
  // "오늘" = user.timezone 기준 (데모는 앵커 날짜). useTodayKey 가 분기 처리.
  const todayCellKey = useTodayKey();
  const anchorDate = useMemo(
    () => fromDateKey(todayCellKey),
    [todayCellKey],
  );
  const { view, setView, cursor, setCursor, navigate, goToday } = useCalendarNav(anchorDate);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const allTags = useMemo(() => collectAllTags(state.todos), [state.todos]);
  const recentTags = useMemo(() => collectRecentTags(state.todos), [state.todos]);
  // 확대(전체화면) 모드 — 버튼 또는 Ctrl+Shift+F 로 토글.
  const [expanded, setExpanded] = useState(false);

  // 전역 검색에서 특정 할 일로 이동 요청 → 일간 뷰로 해당 날짜를 열고 상세 패널을 표시.
  useEffect(() => {
    if (focusTarget?.kind !== "todo") return;
    setView("day");
    setCursor(fromDateKey(focusTarget.dateKey));
    setSelectedId(focusTarget.todoId);
    clearFocus();
    // setView/setCursor 는 안정적이므로 focusTarget 만 관찰한다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusTarget]);

  // Ctrl/Cmd+Shift+F → 확대 토글, Esc → 확대 닫기.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === "f") {
        e.preventDefault();
        setExpanded((v) => !v);
        return;
      }
      if (e.key === "Escape") setExpanded((v) => (v ? false : v));
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  // 확대 중에는 배경 스크롤 잠금.
  useEffect(() => {
    if (!expanded) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [expanded]);

  // 현재 뷰(일/주/월)가 커버하는 날짜 범위 — 재조회(뷰 전환 시 + 반복 변경 후) 공용.
  const viewRange = useMemo(() => {
    if (view === "day") {
      const k = toDateKey(cursor);
      return { from: k, to: k };
    }
    if (view === "week") {
      // WeekGrid 는 월요일 시작(ISO) 주를 그리므로 조회 범위도 동일 기준이어야
      // 일요일(마지막 칸)이 조회 범위에서 빠지지 않는다.
      return { from: toDateKey(startOfISOWeek(cursor)), to: toDateKey(endOfISOWeek(cursor)) };
    }
    return { from: toDateKey(startOfMonth(cursor)), to: toDateKey(endOfMonth(cursor)) };
  }, [view, cursor]);

  // view 또는 cursor 가 바뀌면 해당 범위의 할 일 + 캘린더 이벤트를 재조회한다.
  // 서버 62일 제한에 맞게 뷰 단위로 요청한다.
  useEffect(() => {
    void loadTodosForView(viewRange.from, viewRange.to);
    // loadTodosForView 는 useCallback([]) 으로 안정화되어 있으므로 deps 에서 제외한다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewRange]);

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
    const todos = await loadTodosForView(viewRange.from, viewRange.to);
    const match = todos.find(
      (t) => t.seriesId === serverTodo.id && t.dateKey === originalDateKey,
    );
    setSelectedId(match ? match.id : serverTodo.id);
  };

  const byDate = useMemo(() => {
    const m: Record<string, Todo[]> = {};
    for (const item of state.todos) {
      if (!m[item.dateKey]) m[item.dateKey] = [];
      m[item.dateKey].push(item);
    }
    return m;
  }, [state.todos]);

  const handleDropTodo = (todoId: string, dateKey: string) => {
    moveTodo(todoId, dateKey);
  };

  return (
    <div className={`calendar-shell${expanded ? " calendar-shell-expanded" : ""}`}>
      {expanded && (
        <button
          type="button"
          className="calendar-expand-float-btn"
          onClick={() => setExpanded(false)}
          aria-label={t("calendar.collapse")}
          title={`${t("calendar.collapse")} (Esc / Ctrl+Shift+F)`}
        >
          <Minimize2 size={16} />
        </button>
      )}
      <div className="page calendar-page">
        <CalendarToolbar
          view={view}
          cursor={cursor}
          onViewChange={setView}
          onPrev={() => navigate(-1)}
          onToday={goToday}
          onNext={() => navigate(1)}
          expanded={expanded}
          onToggleExpand={() => setExpanded((v) => !v)}
        />

        {view === "day" ? (
          <DayTimeline
            dayKey={toDateKey(cursor)}
            todayKey={todayCellKey}
            todos={state.todos}
            selectedId={selectedId}
            onSelect={setSelectedId}
            onReschedule={(id, startTime, endTime) =>
              setTodoTime(id, startTime, endTime)
            }
            onUntime={(id) => setTodoTime(id, null, null)}
            onAddTodo={(title, dateKey, opts) => {
              addTodo(title, dateKey, undefined, (newId) => {
                setSelectedId(newId);
                setTodoTime(newId, opts.startTime, opts.endTime);
              });
            }}
          />
        ) : view === "week" ? (
          <WeekGrid
            cursor={cursor}
            byDate={byDate}
            todayKey={todayCellKey}
            selectedId={selectedId}
            onSelect={setSelectedId}
            onDropTodo={handleDropTodo}
            onAddTodo={(title, dateKey) =>
            addTodo(title, dateKey, undefined, setSelectedId)
          }
          />
        ) : (
          <MonthGrid
            cursor={cursor}
            byDate={byDate}
            todayKey={todayCellKey}
            onSelect={setSelectedId}
            onDropTodo={handleDropTodo}
            onAddTodo={(title, dateKey) =>
              addTodo(title, dateKey, undefined, setSelectedId)
            }
          />
        )}
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
