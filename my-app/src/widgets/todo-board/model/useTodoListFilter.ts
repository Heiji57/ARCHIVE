import { useCallback, useEffect, useMemo, useState } from "react";
import { boardRangeWindow } from "@/entities/todo/lib/boardRange";
import type { BoardRangeWindow } from "@/entities/todo/lib/boardRange";
import type { TaskStatus, Todo } from "@/entities/todo/model/types";
import { endOfWeek, fromDateKey, startOfWeek, toDateKey } from "@/shared/lib/date";
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
 * Also ticks once a minute so "오늘"/"이번 주" 기준이 자정을 넘길 때
 * 수동 새로고침 없이 갱신된다.
 *
 * 완료된 할 일은 시간이 지나도 숨기지 않는다 — 기간/상태 필터가 이미 범위를 좁히는
 * 수단이므로, 여기서 한 번 더 감추면 "완료" 필터로도 어제 끝낸 일을 볼 수 없었다.
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

  const todayK = toDateKey(new Date());

  // 화면에 표시할 기간 창(양끝 포함). 단일 날짜 필터는 from===to 로 표현한다.
  //
  // 경계는 반드시 dateKey 문자열끼리 비교한다. Date 로 비교하면 창의 양끝이 "현재
  // 시각"을 물고 있어서 정오로 정규화된 fromDateKey 와 어긋나고, 정오 이전에는 창의
  // 마지막 날이, 정오 이후에는 첫날이 통째로 빠졌다.
  // 이름을 dateWindow 로 두는 이유: `window` 로 두면 위 useEffect 의 전역
  // window.setInterval 까지 이 지역 변수로 가려진다.
  const dateWindow = useMemo<BoardRangeWindow>(() => {
    if (filter.kind === "today") return { from: todayK, to: todayK };
    if (filter.kind === "specific")
      return { from: filter.dateKey, to: filter.dateKey };
    if (filter.kind === "week") {
      const base = fromDateKey(todayK);
      return { from: toDateKey(startOfWeek(base)), to: toDateKey(endOfWeek(base)) };
    }
    return boardRangeWindow(rangeDays, todayK);
  }, [filter, todayK, rangeDays]);

  const dateFiltered = useMemo(
    () =>
      todos.filter((t) => t.dateKey >= dateWindow.from && t.dateKey <= dateWindow.to),
    [todos, dateWindow],
  );

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
    // 앞 행과 상태가 다르면 그 행이 그룹의 첫 행 — 정렬이 상태 우선이라 이것으로 충분하다.
    return sorted.map((todo, i) => ({
      todo,
      showHeader: i === 0 || todo.status !== sorted[i - 1].status,
    }));
  }, [dateFiltered, statusFilter]);

  return { filter, setFilter, statusFilter, setStatusFilter, todayK, counts, entries };
}
