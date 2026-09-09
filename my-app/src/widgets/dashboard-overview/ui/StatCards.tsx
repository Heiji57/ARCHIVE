import { useTranslation } from "@/shared/lib/i18n";
import type { TranslationKey } from "@/shared/lib/i18n";
import type { StatsRange, TodoStats } from "@/entities/todo/model/types";

/** 대시보드 범위 토글은 `all`을 쓰지 않는다 — 그건 주제 뷰 빈 상태 전용 값(StatsRange 참고). */
type DashboardRange = Exclude<StatsRange, "all">;

interface StatCardsProps {
  stats: TodoStats;
  range: DashboardRange;
}

const DONE_LABEL: Record<DashboardRange, TranslationKey> = {
  today: "dashboard.stat.doneToday",
  week: "dashboard.stat.doneWeek",
  month: "dashboard.stat.doneMonth",
};

/** 상단 통계 카드 4개: (기간)완료 · 완료율 · 진행 중 · 시작 전. */
export function StatCards({ stats, range }: StatCardsProps) {
  const { t } = useTranslation();

  return (
    <div className="dash-stat-cards">
      <div className="dash-stat-card">
        <p className="dash-stat-label">{t(DONE_LABEL[range])}</p>
        <p className="dash-stat-value">
          {stats.doneCount}
          <span className="dash-stat-unit"> /{stats.total}</span>
        </p>
      </div>
      <div className="dash-stat-card">
        <p className="dash-stat-label">{t("dashboard.stat.completionRate")}</p>
        <p className="dash-stat-value">
          {stats.completionRate}
          <span className="dash-stat-unit">%</span>
        </p>
      </div>
      <div className="dash-stat-card">
        <p className="dash-stat-label">{t("dashboard.stat.retroCount")}</p>
        <p className="dash-stat-value">
          {stats.retroCount}
          <span className="dash-stat-unit">{t("dashboard.unit.count")}</span>
        </p>
      </div>
    </div>
  );
}
