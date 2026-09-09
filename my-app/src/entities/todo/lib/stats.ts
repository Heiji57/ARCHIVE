/**
 * 대시보드 통계 클라이언트 계산 — 데모/mock(USE_API=false) 모드 폴백.
 * API 모드에서는 GET /todos/stats(서버 집계)를 쓰고, 이 함수는 서버가 없을 때
 * state.todos 로부터 동일한 형태(TodoStats)를 근사 계산한다.
 *
 * NOTE: 서버는 weekly_trend 를 completed_at 기준으로 계산하지만, 시드/데모 데이터는
 * completedAt 이 항상 채워지지 않으므로 여기서는 done 상태 + dateKey 를 기준으로
 * 근사한다. retro_count 는 호출부에서 entries 개수를 주입한다. (데모 체험용이라
 * 정확도보다 안정성을 우선)
 */
import {
  addDays,
  endOfISOWeek,
  endOfMonth,
  fromDateKey,
  startOfISOWeek,
  startOfMonth,
  toDateKey,
} from "@/shared/lib/date";
import type { StatsRange, Todo, TodoStats } from "../model/types";

function rangeBounds(range: StatsRange, today: Date): { from: string; to: string } {
  if (range === "today") {
    const k = toDateKey(today);
    return { from: k, to: k };
  }
  if (range === "week") {
    return { from: toDateKey(startOfISOWeek(today)), to: toDateKey(endOfISOWeek(today)) };
  }
  if (range === "all") {
    return { from: toDateKey(new Date(2000, 0, 1, 12)), to: toDateKey(today) };
  }
  return { from: toDateKey(startOfMonth(today)), to: toDateKey(endOfMonth(today)) };
}

/** 반복 시리즈 중복(가상 인스턴스 + 예외 row)이 섞여도 dateKey 범위로만 필터한다. */
function inRange(todo: Todo, from: string, to: string): boolean {
  return todo.dateKey >= from && todo.dateKey <= to;
}

export function computeTodoStats(
  todos: Todo[],
  range: StatsRange,
  todayKey: string,
  retroCount = 0,
): TodoStats {
  const today = fromDateKey(todayKey);
  const { from, to } = rangeBounds(range, today);
  const scoped = todos.filter((t) => inRange(t, from, to));

  const doneCount = scoped.filter((t) => t.status === "done").length;
  const inProgressCount = scoped.filter((t) => t.status === "in-progress").length;
  const notStartCount = scoped.filter((t) => t.status === "not-start").length;
  const total = scoped.length;
  const completionRate = total === 0 ? 0 : Math.round((doneCount / total) * 100);

  // 이번 ISO주 월~일 7칸 (range 와 무관) — done 상태를 dateKey 기준으로 집계.
  const weekStart = startOfISOWeek(today);
  const doneByDate = new Map<string, number>();
  for (const t of todos) {
    if (t.status !== "done") continue;
    doneByDate.set(t.dateKey, (doneByDate.get(t.dateKey) ?? 0) + 1);
  }
  const weeklyTrend = Array.from({ length: 7 }, (_, i) => {
    const dateKey = toDateKey(addDays(weekStart, i));
    return { dateKey, doneCount: doneByDate.get(dateKey) ?? 0 };
  });

  // 태그 분포 — range 범위 내, 내림차순. 태그가 여러 개인 todo는 각 태그 버킷에 중복 집계.
  const tagMap = new Map<string, number>();
  for (const t of scoped) {
    for (const tag of t.tags) {
      tagMap.set(tag, (tagMap.get(tag) ?? 0) + 1);
    }
  }
  const tagDistribution = [...tagMap.entries()]
    .map(([tag, count]) => ({ tag, count }))
    .sort((a, b) => b.count - a.count);

  return {
    range,
    total,
    doneCount,
    inProgressCount,
    notStartCount,
    completionRate,
    weeklyTrend,
    tagDistribution,
    retroCount,
  };
}
