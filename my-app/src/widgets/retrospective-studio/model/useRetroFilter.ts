import { useMemo, useState } from "react";
import { getEntriesByRetroType } from "@/entities/entry/lib/selectors";
import type { JournalEntry } from "@/entities/entry/model/types";
import {
  dateOfISOWeek,
  endOfISOWeek,
  endOfMonth,
  fromDateKey,
  getISOWeek,
  toDateKey,
} from "@/shared/lib/date";
import { PAGE_SIZE, type RetroTab } from "./constants";

/** GET /entries/paginated 의 from/to 로 그대로 보낼 수 있는 기간(YYYY-MM-DD, 양끝 포함). */
export interface DateRange {
  from: string;
  to: string;
}

export interface UseRetroFilterResult {
  retroFilter: RetroTab;
  setRetroFilter: (t: RetroTab) => void;
  search: string;
  setSearch: (s: string) => void;
  yearFilter: string;
  setYearFilter: (s: string) => void;
  monthFilter: string;
  setMonthFilter: (s: string) => void;
  weekFilter: string;
  setWeekFilter: (s: string) => void;
  page: number;
  setPage: (p: number | ((prev: number) => number)) => void;
  resetPage: () => void;
  totalPages: number;
  filteredEntries: JournalEntry[];
  pageEntries: JournalEntry[];
  years: string[];
  /** 선택된 연도 안의 ISO 주차 목록(연도 미선택 시 빈 배열 — 주는 연도에 종속). */
  weeks: string[];
  /**
   * 연/월/주 선택을 서버 필터용 단일 range 로 변환한 값(week > month > year 우선순위).
   * 연도 미선택("all")이면 null(무필터). 서버 모드 호출부(useRetroEntriesPage)가 쓴다.
   */
  dateRange: DateRange | null;
}

/**
 * Manages the retrospective sidebar's filter + pagination state.
 * Returns memoized derived lists (filteredEntries, pageEntries, years, weeks).
 */
export function useRetroFilter(entries: JournalEntry[]): UseRetroFilterResult {
  const [retroFilter, setRetroFilterRaw] = useState<RetroTab>("daily");
  const [search, setSearch] = useState("");
  const [yearFilter, setYearFilterRaw] = useState("all");
  const [monthFilter, setMonthFilterRaw] = useState("all");
  const [weekFilter, setWeekFilterRaw] = useState("all");
  const [page, setPage] = useState(0);

  const resetPage = () => setPage(0);

  // Wrappers that reset the page when the underlying filter changes.
  const setRetroFilter = (t: RetroTab) => {
    setRetroFilterRaw(t);
    resetPage();
  };
  const setYearFilter = (s: string) => {
    setYearFilterRaw(s);
    // 월/주는 연도에 종속(주 목록이 연도 안에서만 계산됨) — 연도를 해제하면 같이 초기화.
    if (s === "all") {
      setMonthFilterRaw("all");
      setWeekFilterRaw("all");
    }
    resetPage();
  };
  const setMonthFilter = (s: string) => {
    setMonthFilterRaw(s);
    resetPage();
  };
  const setWeekFilter = (s: string) => {
    setWeekFilterRaw(s);
    resetPage();
  };

  // "all" 탭: 타입 구분 없이 4종 전부(서버 GET /entries/paginated 의 retroType
  // 생략과 동일한 의미) — 클라이언트 폴백(데모/mock)에서만 쓰인다.
  const allOfType = useMemo(
    () =>
      retroFilter === "all" || retroFilter === "topics"
        ? entries
        : getEntriesByRetroType(entries, retroFilter),
    [entries, retroFilter],
  );

  const filteredEntries = useMemo(() => {
    const q = search.toLowerCase().trim();
    let list = allOfType;

    if (yearFilter !== "all") {
      list = list.filter((e) => e.dateKey.startsWith(`${yearFilter}-`));
    }
    if (monthFilter !== "all") {
      list = list.filter((e) => e.dateKey.slice(5, 7) === monthFilter);
    }
    if (weekFilter !== "all") {
      list = list.filter((e) => {
        const w = getISOWeek(fromDateKey(e.dateKey));
        return String(w) === weekFilter;
      });
    }
    if (q) {
      list = list.filter(
        (e) =>
          e.title.toLowerCase().includes(q) ||
          e.dateKey.includes(q) ||
          e.content.toLowerCase().includes(q),
      );
    }
    return [...list].sort((a, b) => b.dateKey.localeCompare(a.dateKey));
  }, [allOfType, search, yearFilter, monthFilter, weekFilter]);

  const years = useMemo(() => {
    const s = new Set(allOfType.map((e) => e.dateKey.slice(0, 4)));
    return Array.from(s).sort((a, b) => b.localeCompare(a));
  }, [allOfType]);

  // 주는 연도에 종속 — 연도를 고르기 전엔 특정 주가 어느 해인지 알 수 없어 목록을 비운다.
  const weeks = useMemo(() => {
    if (yearFilter === "all") return [];
    const inYear = allOfType.filter((e) => e.dateKey.startsWith(`${yearFilter}-`));
    const s = new Set(
      inYear.map((e) => String(getISOWeek(fromDateKey(e.dateKey)))),
    );
    return Array.from(s).sort((a, b) => Number(a) - Number(b));
  }, [allOfType, yearFilter]);

  // 서버 필터(from/to)용 단일 range — 주 > 월 > 연 우선순위로 가장 구체적인 선택을 range 화한다.
  const dateRange = useMemo<DateRange | null>(() => {
    if (yearFilter === "all") return null;
    const year = Number(yearFilter);
    if (weekFilter !== "all") {
      const monday = dateOfISOWeek(year, Number(weekFilter));
      return { from: toDateKey(monday), to: toDateKey(endOfISOWeek(monday)) };
    }
    if (monthFilter !== "all") {
      const start = new Date(year, Number(monthFilter) - 1, 1, 12);
      return { from: toDateKey(start), to: toDateKey(endOfMonth(start)) };
    }
    return { from: `${yearFilter}-01-01`, to: `${yearFilter}-12-31` };
  }, [yearFilter, monthFilter, weekFilter]);

  const totalPages = Math.max(1, Math.ceil(filteredEntries.length / PAGE_SIZE));
  const pageStart = page * PAGE_SIZE;
  const pageEntries = filteredEntries.slice(pageStart, pageStart + PAGE_SIZE);

  return {
    retroFilter,
    setRetroFilter,
    search,
    setSearch: (s) => {
      setSearch(s);
      resetPage();
    },
    yearFilter,
    setYearFilter,
    monthFilter,
    setMonthFilter,
    weekFilter,
    setWeekFilter,
    page,
    setPage,
    resetPage,
    totalPages,
    filteredEntries,
    pageEntries,
    years,
    weeks,
    dateRange,
  };
}
