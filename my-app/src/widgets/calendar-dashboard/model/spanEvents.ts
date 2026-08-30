import type { Todo } from "@/entities/todo/model/types";

export interface SpanEvent {
  todo: Todo;
  /** 이 주/행에서 칩이 시작하는 컬럼 (0-indexed). */
  startCol: number;
  /** 이 주/행에서 칩이 차지하는 컬럼 수. */
  colSpan: number;
  /** 할 일의 실제 시작일이 이 주에 포함되는가. */
  isStart: boolean;
  /** 할 일의 실제 마감일이 이 주에 포함되는가. */
  isEnd: boolean;
}

export interface SpanEventWithRow extends SpanEvent {
  /** 그리드 행 번호 (1-indexed). */
  row: number;
}

/**
 * weekKeys(7일치 dateKey 배열)를 기준으로, 해당 주에 걸쳐 있는
 * 마감일 할 일들을 SpanEvent 목록으로 변환한다.
 */
export function buildSpanEvents(todos: Todo[], weekKeys: string[]): SpanEvent[] {
  if (weekKeys.length === 0) return [];
  const firstDay = weekKeys[0];
  const lastDay = weekKeys[weekKeys.length - 1];
  const events: SpanEvent[] = [];

  for (const todo of todos) {
    if (!todo.dueDate || todo.dueDate <= todo.dateKey) continue;
    if (todo.dueDate < firstDay || todo.dateKey > lastDay) continue;

    const startCol =
      todo.dateKey < firstDay ? 0 : weekKeys.indexOf(todo.dateKey);
    const endCol =
      todo.dueDate > lastDay
        ? weekKeys.length - 1
        : weekKeys.indexOf(todo.dueDate);

    if (startCol === -1 || endCol === -1 || endCol < startCol) continue;

    events.push({
      todo,
      startCol,
      colSpan: endCol - startCol + 1,
      isStart: todo.dateKey >= firstDay,
      isEnd: todo.dueDate <= lastDay,
    });
  }

  return events;
}

/**
 * SpanEvent 목록에 행 번호(1-indexed)를 배정한다.
 * 같은 컬럼 범위에서 겹치는 이벤트는 서로 다른 행에 배치된다.
 */
export function assignSpanRows(events: SpanEvent[]): SpanEventWithRow[] {
  const sorted = [...events].sort((a, b) => {
    if (a.todo.dateKey !== b.todo.dateKey) {
      return a.todo.dateKey.localeCompare(b.todo.dateKey);
    }
    const aDue = a.todo.dueDate ?? a.todo.dateKey;
    const bDue = b.todo.dueDate ?? b.todo.dateKey;
    return bDue.localeCompare(aDue);
  });

  const placed: SpanEventWithRow[] = [];

  for (const evt of sorted) {
    let r = 0;
    while (
      placed.some(
        (p) =>
          p.row === r + 1 &&
          p.startCol < evt.startCol + evt.colSpan &&
          p.startCol + p.colSpan > evt.startCol,
      )
    ) {
      r++;
    }
    placed.push({ ...evt, row: r + 1 });
  }

  return placed;
}
