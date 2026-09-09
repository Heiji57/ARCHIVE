import { useEffect, useMemo, useState } from "react";
import { PenLine } from "lucide-react";
import type { AppRoute } from "@/app/model/types";
import { useArchiveApp } from "@/app/providers/useArchiveApp";
import { useTodayKey } from "@/app/providers/useToday";
import { getTodosByDateKey, sortTodos } from "@/entities/todo/lib/selectors";
import type { StatsRange } from "@/entities/todo/model/types";
import { useTranslation } from "@/shared/lib/i18n";
import type { TranslationKey } from "@/shared/lib/i18n";
import { useDashboardStats } from "../model/useDashboardStats";
import { ProgressRings } from "./ProgressRings";
import { StatCards } from "./StatCards";
import { TagDistribution } from "./TagDistribution";
import { TodayTimeline } from "./TodayTimeline";
import { WeeklyTrendChart } from "./WeeklyTrendChart";

export interface DashboardOverviewProps {
  onNavigate: (route: AppRoute) => void;
}

/** 대시보드 범위 토글은 `all`을 쓰지 않는다 — 그건 주제 뷰 빈 상태 전용 값(StatsRange 참고). */
type DashboardRange = Exclude<StatsRange, "all">;

const RANGES: DashboardRange[] = ["today", "week", "month"];
const RANGE_LABEL: Record<DashboardRange, TranslationKey> = {
  today: "dashboard.range.today",
  week: "dashboard.range.week",
  month: "dashboard.range.month",
};

export function DashboardOverview({ onNavigate }: DashboardOverviewProps) {
  const { state, requestFocus, loadTodosForView } = useArchiveApp();
  const { t } = useTranslation();
  const todayKey = useTodayKey();
  const [range, setRange] = useState<DashboardRange>("today");
  const { stats } = useDashboardStats(range);

  // 오늘의 타임라인용 — 오늘 날짜 할 일을 조회(뷰 범위 = 오늘 단일).
  useEffect(() => {
    void loadTodosForView(todayKey, todayKey);
    // loadTodosForView 는 useCallback([]) 으로 안정적.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [todayKey]);

  const todayTodos = useMemo(
    () => sortTodos(getTodosByDateKey(state.todos, todayKey)),
    [state.todos, todayKey],
  );

  const openTodo = (todoId: string) => {
    requestFocus({ kind: "todo", todoId, dateKey: todayKey });
    onNavigate("calendar");
  };

  const inProgressPct =
    stats && stats.total > 0 ? Math.round((stats.inProgressCount / stats.total) * 100) : 0;
  // "완료 안됨" = 완료가 아닌 할 일 비율 (= 100 − 완료율).
  const notDonePct =
    stats && stats.total > 0
      ? Math.round(((stats.total - stats.doneCount) / stats.total) * 100)
      : 0;

  return (
    <div className="page dash-page">
      {/* Toolbar: 회고 쓰기 · range toggle */}
      <div className="dash-toolbar">
        <div className="dash-toolbar-right">
          <button
            type="button"
            className="btn btn-primary dash-write-btn"
            onClick={() => onNavigate("retrospectives")}
          >
            <PenLine size={15} />
            {t("dashboard.writeRetro")}
          </button>
          <div className="seg">
            {RANGES.map((r) => (
              <button
                key={r}
                type="button"
                className="seg-btn"
                aria-pressed={range === r}
                onClick={() => setRange(r)}
              >
                {t(RANGE_LABEL[r])}
              </button>
            ))}
          </div>
        </div>
      </div>

      {stats ? (
        <div className="dash-grid">
          <div className="dash-left">
            <StatCards stats={stats} range={range} />
            <div className="dash-card dash-analytics">
              <ProgressRings
                completionRate={stats.completionRate}
                inProgressPct={inProgressPct}
                notDonePct={notDonePct}
                doneCount={stats.doneCount}
                total={stats.total}
              />
              <div className="dash-divider" />
              <WeeklyTrendChart data={stats.weeklyTrend} todayKey={todayKey} />
              <div className="dash-divider" />
              <TagDistribution data={stats.tagDistribution} />
            </div>
          </div>

          <div className="dash-right">
            <TodayTimeline
              todos={todayTodos}
              doneCount={todayTodos.filter((td) => td.status === "done").length}
              total={todayTodos.length}
              onSelect={openTodo}
            />
          </div>
        </div>
      ) : null}
    </div>
  );
}
