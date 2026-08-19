import { useCallback, useEffect, useRef, useState } from "react";
import { useArchiveApp } from "@/app/providers/useArchiveApp";
import type { RetroTab } from "./constants";
import type { DateRange } from "./useRetroFilter";

export interface RetroEntriesPage {
  /** 현재 페이지(1-based). */
  page: number;
  setPage: (p: number) => void;
  /** 현재 페이지 항목 id(최신순). 실제 엔트리는 state.entries 에서 조회한다. */
  ids: string[];
  total: number;
  totalPages: number;
  loading: boolean;
  /** 서버 조회 실패 여부(목록 로드 실패 표시용). */
  error: boolean;
  /**
   * 서버 페이지네이션 활성 여부. 데모/mock 모드면 false → 호출부는 클라이언트
   * 목록(useRetroFilter)으로 폴백한다.
   */
  serverMode: boolean;
  /** 현재 페이지를 다시 조회한다(회고 생성/삭제 후 목록 갱신용). */
  refetch: () => void;
}

/**
 * 회고 목록을 GET /entries/paginated 로 서버 페이지네이션 조회한다.
 * daily(journal_entries) 뿐 아니라 weekly/monthly/yearly(AI 요약, retro_summaries)도
 * 이 엔드포인트 하나로 조회한다 — retroType 또는 검색어(q)가 바뀌면 1페이지로 리셋한다.
 *
 * @param retroType 조회할 회고 종류(사이드바 탭). "all" 이면 retroType 쿼리를
 *   생략해 4종을 합친 "전체" 뷰를 요청한다(서버가 정렬까지 처리).
 * @param q 검색어(디바운스는 호출부 책임) — 비어 있으면 무필터.
 * @param dateRange 연/월/주 선택을 변환한 단일 range(useRetroFilter.dateRange) — null 이면 무필터.
 * @param enabled false 면 조회를 건너뛴다(폴더 브라우징 뷰가 대신 활성일 때
 *   불필요한 중복 요청을 막는다).
 */
export function useRetroEntriesPage(
  retroType: RetroTab,
  q: string,
  dateRange: DateRange | null,
  enabled = true,
  size = 16,
): RetroEntriesPage {
  const { loadEntriesPage } = useArchiveApp();
  const [page, setPageState] = useState(1);
  const [ids, setIds] = useState<string[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [serverMode, setServerMode] = useState(true);
  // 경쟁 조건 방지: 마지막으로 시작한 요청만 상태에 반영한다.
  const reqRef = useRef(0);
  // retroType/q/dateRange 변경 감지용(값이 바뀌면 페이지를 1로 리셋).
  const rangeKey = `${dateRange?.from ?? ""}~${dateRange?.to ?? ""}`;
  const keyRef = useRef(`${retroType}|${q}|${rangeKey}`);
  const [refetchTick, setRefetchTick] = useState(0);

  useEffect(() => {
    if (!enabled) return;
    const key = `${retroType}|${q}|${rangeKey}`;
    const filterChanged = key !== keyRef.current;
    keyRef.current = key;

    if (filterChanged && page !== 1) {
      // page state 를 1로 리셋하면 이 effect 가 page=1 로 다시 실행되므로,
      // 여기서 바로 조회하지 않고 중복 요청을 피한다.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setPageState(1);
      return;
    }

    const reqId = ++reqRef.current;
    // 데이터 로드 시작 시 loading 플래그를 세우는 표준 패턴 — 동기 setState 이지만 의도적.
    setLoading(true);
    setError(false);
    void loadEntriesPage({
      retroType: retroType === "all" ? undefined : retroType,
      page,
      size,
      q: q || undefined,
      from: dateRange?.from,
      to: dateRange?.to,
    })
      .then((res) => {
        if (reqId !== reqRef.current) return; // stale 응답 무시
        if (res === null) {
          setServerMode(false); // 데모/mock → 클라이언트 폴백
          return;
        }
        setServerMode(true);
        setIds(res.items.map((e) => e.id));
        setTotal(res.total);
      })
      .catch(() => {
        if (reqId === reqRef.current) setError(true);
      })
      .finally(() => {
        if (reqId === reqRef.current) setLoading(false);
      });
  }, [retroType, q, rangeKey, page, size, loadEntriesPage, refetchTick, dateRange, enabled]);

  const setPage = useCallback((p: number) => setPageState(Math.max(1, p)), []);

  const totalPages = Math.max(1, Math.ceil(total / size));

  return {
    page,
    setPage,
    ids,
    total,
    totalPages,
    loading,
    error,
    serverMode,
    refetch: () => setRefetchTick((t) => t + 1),
  };
}
