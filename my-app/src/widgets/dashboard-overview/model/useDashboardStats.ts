import { useCallback, useEffect, useState } from "react";
import { useArchiveApp } from "@/app/providers/useArchiveApp";
import { useTodayKey } from "@/app/providers/useToday";
import { computeTodoStats } from "@/entities/todo/lib/stats";
import type { StatsRange, TodoStats } from "@/entities/todo/model/types";
import { USE_API, apiGetTodoStats } from "@/shared/api";

/**
 * 대시보드 통계 로딩.
 *  - API 모드(USE_API && !demo): GET /todos/stats(서버 집계). 실패 시 로컬 계산으로 폴백.
 *  - 그 외(데모/mock): state.todos 로 클라이언트 계산(computeTodoStats).
 * reload() 로 서버 재조회(타임라인에서 상태 변경 후 호출).
 */
export function useDashboardStats(range: StatsRange) {
  const { state, isDemo } = useArchiveApp();
  const todayKey = useTodayKey();
  const useServer = USE_API && !isDemo;

  const [stats, setStats] = useState<TodoStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [nonce, setNonce] = useState(0);
  const reload = useCallback(() => setNonce((n) => n + 1), []);

  // 클라이언트 계산(데모/mock) — todos 변경에 즉시 반응.
  useEffect(() => {
    if (useServer) return;
    setStats(computeTodoStats(state.todos, range, todayKey, state.entries.length));
    setLoading(false);
  }, [useServer, state.todos, state.entries.length, range, todayKey]);

  // 서버 집계(API 모드) — range/오늘/reload 시 재조회.
  useEffect(() => {
    if (!useServer) return;
    let alive = true;
    setLoading(true);
    apiGetTodoStats(range)
      .then((s) => {
        if (alive) {
          setStats(s);
          setLoading(false);
        }
      })
      .catch(() => {
        // 네트워크 오류 시 로컬 계산으로 폴백(현재 보유 todos 기준 근사).
        if (alive) {
          setStats(computeTodoStats(state.todos, range, todayKey, state.entries.length));
          setLoading(false);
        }
      });
    return () => {
      alive = false;
    };
    // state.todos 는 폴백에만 쓰므로 의존성에서 제외(서버 모드 재조회 폭주 방지).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [useServer, range, todayKey, nonce]);

  return { stats, loading, reload };
}
