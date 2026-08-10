import { useTranslation } from "@/shared/lib/i18n";

interface ProgressRingsProps {
  completionRate: number; // 0~100
  inProgressPct: number; // 0~100
  notDonePct: number; // 0~100
  doneCount: number;
  total: number;
}

const RING_DEFS = [
  { key: "completion", radius: 40, color: "var(--color-status-done)" },
  { key: "inProgress", radius: 30, color: "var(--color-primary)" },
  { key: "notDone", radius: 20, color: "var(--color-body-muted)" },
] as const;

/** 세 개의 동심원 링(완료율·진행중·완료 안됨) — SVG stroke-dasharray 로 그린다. */
export function ProgressRings({
  completionRate,
  inProgressPct,
  notDonePct,
  doneCount,
  total,
}: ProgressRingsProps) {
  const { t } = useTranslation();
  const pct = { completion: completionRate, inProgress: inProgressPct, notDone: notDonePct };
  const label = {
    completion: t("dashboard.rings.completion"),
    inProgress: t("dashboard.rings.inProgress"),
    notDone: t("dashboard.rings.notDone"),
  };

  return (
    <div className="dash-rings">
      <svg viewBox="0 0 100 100" className="dash-rings-svg" role="img"
        aria-label={`${label.completion} ${completionRate}%, ${label.inProgress} ${inProgressPct}%, ${label.notDone} ${notDonePct}%`}>
        {RING_DEFS.map((ring) => {
          const c = 2 * Math.PI * ring.radius;
          const filled = (Math.min(100, Math.max(0, pct[ring.key])) / 100) * c;
          return (
            <g key={ring.key} transform="rotate(-90 50 50)">
              <circle
                cx="50" cy="50" r={ring.radius}
                className="dash-ring-track"
                strokeWidth="6" fill="none"
              />
              <circle
                cx="50" cy="50" r={ring.radius}
                stroke={ring.color} strokeWidth="6" fill="none"
                strokeLinecap="round"
                strokeDasharray={`${filled} ${c - filled}`}
              />
            </g>
          );
        })}
        <text x="50" y="50" className="dash-rings-center">
          {doneCount}/{total}
        </text>
      </svg>

      <ul className="dash-rings-legend">
        {RING_DEFS.map((ring) => (
          <li key={ring.key}>
            <span className="dash-legend-dot" style={{ background: ring.color }} />
            <span className="dash-legend-label">{label[ring.key]}</span>
            <span className="dash-legend-val">{pct[ring.key]}%</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
