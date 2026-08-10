import { useCallback, useEffect, useMemo, useState } from "react";
import { getVisibleBoardTodos } from "@/entities/todo/lib/selectors";
import type { TaskStatus, Todo } from "@/entities/todo/model/types";
import {
  addDays,
  endOfWeek,
  fromDateKey,
  startOfWeek,
  toDateKey,
} from "@/shared/lib/date";
import type { DateFilter, StatusFilter } from "./constants";
import { readTodoBoardFilter, writeTodoBoardFilter } from "./todoFilterPrefs";

/** One row in the flat, status-grouped todo list. */
export interface TodoListEntry {
  todo: Todo;
  /** True when this row is the first of its status group (sticky header goes above it). */
  showHeader: boolean;
}

const STATUS_ORDER: TaskStatus[] = ["not-start", "in-progress", "done"];

function compareByStatusThenDate(a: Todo, b: Todo): number {
  const byStatus = STATUS_ORDER.indexOf(a.status) - STATUS_ORDER.indexOf(b.status);
  if (byStatus !== 0) return byStatus;
  if (a.dateKey !== b.dateKey) return a.dateKey < b.dateKey ? -1 : 1;
  const ta = a.startTime ?? "￿";
  const tb = b.startTime ?? "￿";
  if (ta !== tb) return ta < tb ? -1 : 1;
  return a.id.localeCompare(b.id);
}

/**
 * Manages the Todo split-view's date filter + status filter and produces a
 * flat, status-grouped list of rows (replaces the 3-column kanban grouping
 * from `useKanbanFilter`).
 *
 * `rangeDays` 는 "전체" 필터에서 오늘 기준 앞뒤로 나눠 표시할 기간(일)이다.
 *
 * Also ticks once a minute so the 24h-after-done auto-hide updates
 * without requiring a manual refresh.
 */
export function useTodoListFilter(todos: Todo[], rangeDays: number) {
  // 마지막으로 고른 기간 필터를 localStorage 에서 복원한다(페이지 재진입 시 유지).
  // 상태 필터는 세션 내에서만 유지한다(영속화하지 않음).
  const [filter, setFilterState] = useState<DateFilter>(readTodoBoardFilter);
  const setFilter = useCallback((next: DateFilter) => {
    setFilterState(next);
    writeTodoBoardFilter(next);
  }, []);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");

  const [, forceTick] = useState(0);
  useEffect(() => {
    const id = window.setInterval(() => forceTick((n) => n + 1), 60 * 1000);
    return () => window.clearInterval(id);
  }, []);

  const today = new Date();
  const todayK = toDateKey(today);

  const dateFiltered = useMemo(() => {
    const visible = getVisibleBoardTodos(todos);
    if (filter.kind === "all") {
      // 오늘 기준 앞뒤로 rangeDays 를 나눈 윈도우 안의 할 일만 표시한다.
      const back = Math.floor(rangeDays / 2);
      const fwd = rangeDays - back;
      const lo = addDays(today, -back).getTime();
      const hi = addDays(today, fwd).getTime();
      return visible.filter((t) => {
        const x = fromDateKey(t.dateKey).getTime();
        return x >= lo && x <= hi;
      });
    }
    if (filter.kind === "today")
      return visible.filter((t) => t.dateKey === todayK);
    if (filter.kind === "week") {
      const ws = startOfWeek(today).getTime();
      const we = endOfWeek(today).getTime();
      return visible.filter((t) => {
        const x = fromDateKey(t.dateKey).getTime();
        return x >= ws && x <= we;
      });
    }
    return visible.filter((t) => t.dateKey === filter.dateKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [todos, filter, todayK, today, rangeDays]);

  // 날짜 필터만 적용된 집합 기준 개수 — 상태 필터를 바꿔도 다른 pill 의 개수는 변하지 않는다.
  const counts = useMemo(() => {
    const c: Record<StatusFilter, number> = {
      all: 0,
      "not-start": 0,
      "in-progress": 0,
      done: 0,
    };
    for (const t of dateFiltered) {
      c.all += 1;
      c[t.status] += 1;
    }
    return c;
  }, [dateFiltered]);

  const entries = useMemo<TodoListEntry[]>(() => {
    const scoped =
      statusFilter === "all"
        ? dateFiltered
        : dateFiltered.filter((t) => t.status === statusFilter);
    const sorted = [...scoped].sort(compareByStatusThenDate);
    let last: TaskStatus | null = null;
    return sorted.map((todo) => {
      const showHeader = todo.status !== last;
      last = todo.status;
      return { todo, showHeader };
    });
  }, [dateFiltered, statusFilter]);

  return { filter, setFilter, statusFilter, setStatusFilter, todayK, counts, entries };
}
