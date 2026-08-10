import { useTranslation } from "@/shared/lib/i18n";
import type { TagCount } from "@/entities/todo/model/types";
import { tagColor } from "@/entities/todo/lib/tagColor";

interface TagDistributionProps {
  data: TagCount[];
}

/** 태그 분포 — 누적 가로 막대 + 범례(퍼센트). */
export function TagDistribution({ data }: TagDistributionProps) {
  const { t } = useTranslation();
  const total = data.reduce((sum, d) => sum + d.count, 0);

  return (
    <div className="dash-section dash-tags">
      <p className="dash-card-title">
        {t("dashboard.tags.title")}
        <span className="dash-card-meta">· {t("dashboard.count", { n: total })}</span>
      </p>

      {total === 0 ? (
        <p className="dash-empty-inline">{t("dashboard.tags.empty")}</p>
      ) : (
        <>
          <div className="dash-tags-bar" role="img" aria-label={t("dashboard.tags.title")}>
            {data.map((d) => (
              <div
                key={d.tag}
                className="dash-tags-seg"
                style={{ width: `${(d.count / total) * 100}%`, background: tagColor(d.tag) }}
                title={`${d.tag} ${Math.round((d.count / total) * 100)}%`}
              />
            ))}
          </div>
          <ul className="dash-tags-legend">
            {data.map((d) => (
              <li key={d.tag}>
                <span className="dash-legend-dot" style={{ background: tagColor(d.tag) }} />
                <span className="dash-legend-label">{d.tag}</span>
                <span className="dash-legend-val">{Math.round((d.count / total) * 100)}%</span>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
