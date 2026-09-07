import type { Todo } from "@/entities/todo/model/types";
import { fromDateKey } from "@/shared/lib/date";

/**
 * 1차: dateKey 오름차순
 * 2차: startTime 오름차순 (없으면 맨 뒤)
 * 3차: title 가나다/ABC 오름차순
 */
export function sortTodos(todos: Todo[]): Todo[] {
  return [...todos].sort((a, b) => {
    if (a.dateKey < b.dateKey) return -1;
    if (a.dateKey > b.dateKey) return 1;
    const ta = a.startTime ?? "￿";
    const tb = b.startTime ?? "￿";
    if (ta < tb) return -1;
    if (ta > tb) return 1;
    return a.title.localeCompare(b.title);
  });
}

export function findTodoById(todos: Todo[], id: string) {
  return todos.find((todo) => todo.id === id) ?? null;
}

/**
 * 반복 시리즈에 속한 항목인지(가상 인스턴스, 예외 row, 또는 시리즈를 정의하는 첫 회차/베이스
 * row). 베이스 row는 isVirtual=false·seriesId=null 이라 앞의 두 조건만으로는 걸러지지
 * 않지만 recurrenceRule 이 있으면 시리즈의 시작점이므로 함께 반복으로 취급한다 — 그렇지
 * 않으면 첫 회차만 삭제/시간 변경 시 범위 선택 없이 조용히 처리돼 시리즈가 깨질 수 있다.
 */
export function isRecurringTodo(todo: Todo): boolean {
  return todo.isVirtual || todo.seriesId !== null || todo.recurrenceRule !== null;
}

/** Filter todos by a specific date key. */
export function getTodosByDateKey(todos: Todo[], dateKey: string) {
  return todos.filter((todo) => todo.dateKey === dateKey);
}

/** Filter todos within an inclusive date range. */
export function getTodosInRange(todos: Todo[], start: Date, end: Date) {
  const s = start.getTime();
  const e = end.getTime();
  return todos.filter((todo) => {
    const t = fromDateKey(todo.dateKey).getTime();
    return t >= s && t <= e;
  });
}

/** 현재 로드된 todos 전체에서 쓰이고 있는 태그 목록 (중복 제거, 가나다/ABC 오름차순). */
export function collectAllTags(todos: Todo[]): string[] {
  const set = new Set<string>();
  for (const todo of todos) {
    for (const tag of todo.tags) set.add(tag);
  }
  return [...set].sort((a, b) => a.localeCompare(b));
}

/**
 * 생성일(createdAt) 최신순 todo 를 훑어 태그를 중복 제거하며 모은다 — 태그
 * 자동완성의 "최근 사용" 섹션용 근사치. Todo 엔티티에 태그별/수정 시각 타임스탬프가
 * 없어 todo 생성 시각 최신순으로 대신한다(태그만 나중에 추가/변경해도 반영 안 됨).
 * 정식 사용 빈도/최근성 집계는 서버 FTS 붙을 때 대체될 예정.
 */
export function collectRecentTags(todos: Todo[], limit = 8): string[] {
  const ranked = [...todos].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const seen = new Set<string>();
  const result: string[] = [];
  for (const todo of ranked) {
    for (const tag of todo.tags) {
      if (seen.has(tag)) continue;
      seen.add(tag);
      result.push(tag);
      if (result.length >= limit) return result;
    }
  }
  return result;
}
