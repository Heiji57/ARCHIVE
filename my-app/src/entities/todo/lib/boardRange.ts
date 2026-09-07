import { addDays, fromDateKey, toDateKey } from "@/shared/lib/date";

/** 할 일 보드가 다루는 기간 창(양끝 포함, "YYYY-MM-DD"). */
export interface BoardRangeWindow {
  from: string;
  to: string;
}

/**
 * 보드 "전체" 보기의 기간 창 — 오늘 기준 앞뒤로 `rangeDays` 를 나눈 구간.
 *
 * 서버 조회(`loadTodosForRange`)와 화면 필터(`useTodoListFilter`)가 **반드시 같은 창**을
 * 써야 하므로 계산을 여기 한 곳에 둔다. 예전에는 양쪽이 각자 계산하면서, 조회는
 * `toDateKey`(날짜)로 경계를 잡고 필터는 `Date`(현재 시각 포함)로 비교해 정오 정규화된
 * `fromDateKey` 와 어긋났고, 그 결과 받아온 경계 하루가 화면에서 통째로 빠졌다.
 *
 * 경계 비교는 항상 dateKey 문자열끼리 한다("YYYY-MM-DD" 는 사전순 = 시간순).
 */
export function boardRangeWindow(rangeDays: number, todayKey: string): BoardRangeWindow {
  const base = fromDateKey(todayKey);
  const back = Math.floor(rangeDays / 2);
  return {
    from: toDateKey(addDays(base, -back)),
    to: toDateKey(addDays(base, rangeDays - back)),
  };
}

/** dateKey 가 창 안에 있는지(양끝 포함). */
export function isWithinWindow(dateKey: string, window: BoardRangeWindow): boolean {
  return dateKey >= window.from && dateKey <= window.to;
}
