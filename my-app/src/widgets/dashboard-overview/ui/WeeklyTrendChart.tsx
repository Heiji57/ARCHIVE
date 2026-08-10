import { fromDateKey } from "@/shared/lib/date";
import { useTranslation } from "@/shared/lib/i18n";
import type { TranslationKey } from "@/shared/lib/i18n";
import type { WeeklyTrendDay } from "@/entities/todo/model/types";

interface WeeklyTrendChartProps {
  data: WeeklyTrendDay[];
  todayKey: string;
}

const DOW_KEYS: TranslationKey[] = [
  "calendar.days.sun",
  "calendar.days.mon",
  "calendar.days.tue",
  "calendar.days.wed",
  "calendar.days.thu",
  "calendar.days.fri",
  "calendar.days.sat",
];

/** 주간 완료 추이 — 요일별 가로 막대. */
export function WeeklyTrendChart({ data, todayKey }: WeeklyTrendChartProps) {
  const { t } = useTranslation();
  const total = data.reduce((sum, d) => sum + d.doneCount, 0);
  const max = Math.max(1, ...data.map((d) => d.doneCount));

  return (
    <div className="dash-section dash-weekly">
      <p className="dash-card-title">
        {t("dashboard.weekly.title")}
        <span className="dash-card-meta">· {t("dashboard.count", { n: total })}</span>
      </p>
      <div className="dash-weekly-rows">
        {data.map((d) => {
          const dow = fromDateKey(d.dateKey).getDay();
          const isToday = d.dateKey === todayKey;
          return (
            <div key={d.dateKey} className={`dash-weekly-row${isToday ? " is-today" : ""}`}>
              <span className="dash-weekly-dow">{t(DOW_KEYS[dow])}</span>
              <div className="dash-weekly-track">
                <div
                  className="dash-weekly-bar"
                  style={{ width: `${(d.doneCount / max) * 100}%` }}
                />
              </div>
              <span className="dash-weekly-val">{d.doneCount}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
