import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { useArchiveApp } from "@/app/providers/useArchiveApp";
import { useTranslation } from "@/shared/lib/i18n";
import { formatMonthDayFromDateKey } from "@/shared/lib/date";
import type { RetrospectiveType } from "@/entities/entry/model/types";
import type { TopicSource, TopicSourcePage } from "@/entities/topic/model/types";

export interface TopicSourceListModalProps {
  topicId: string;
  mode: "candidate" | "reflected";
  entryCount: number | null;
  todoCount: number | null;
  reflectedDate: string | null;
  onClose: () => void;
  onEditDescription: () => void;
}

const PAGE_SIZE = 20;

const KIND_COLOR: Record<RetrospectiveType, string> = {
  daily: "#5f86bd",
  weekly: "#8f77bd",
  monthly: "#63a894",
  yearly: "#bd7c94",
};
const TODO_COLOR = "#bda05f";
const FALLBACK_COLOR = "#6b7580";

function sourceColor(source: TopicSource): string {
  if (source.kind === "todo") return TODO_COLOR;
  return (source.retroType && KIND_COLOR[source.retroType]) || FALLBACK_COLOR;
}

/** 소스 목록 모달(§3.2 F) — 조회 전용, 640px, 종류 필터 없음(결정 24). */
export function TopicSourceListModal({
  topicId,
  mode,
  entryCount,
  todoCount,
  reflectedDate,
  onClose,
  onEditDescription,
}: TopicSourceListModalProps) {
  const { t } = useTranslation();
  const { getTopicSources } = useArchiveApp();
  const [page, setPage] = useState(1);
  const [data, setData] = useState<TopicSourcePage | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError(false);
    void getTopicSources(topicId, { page, size: PAGE_SIZE })
      .then((res) => {
        if (alive) setData(res);
      })
      .catch(() => {
        if (alive) setError(true);
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [topicId, page, nonce, getTopicSources]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  const title =
    mode === "candidate"
      ? t("topic.source.candidateTitle", { count: (entryCount ?? 0) + (todoCount ?? 0) })
      : t("topic.source.reflectedTitle");
  const subtitle =
    mode === "candidate"
      ? t("topic.source.candidateDesc")
      : t("topic.source.reflectedDesc", {
          date: reflectedDate ? formatMonthDayFromDateKey(reflectedDate) : "",
          entries: entryCount ?? 0,
          todos: todoCount ?? 0,
        });

  const from = data ? (data.page - 1) * data.size + 1 : 0;
  const to = data ? Math.min(data.page * data.size, data.total) : 0;

  return createPortal(
    <div
      className="topic-source-overlay"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div role="dialog" aria-modal="true" className="topic-source-modal">
        <div className="topic-source-head">
          <div>
            <h3>{title}</h3>
            <p>{subtitle}</p>
          </div>
          <button type="button" className="topic-source-close" onClick={onClose} aria-label={t("common.close")}>
            <X size={16} />
          </button>
        </div>

        {loading ? (
          <div className="topic-source-skeleton" aria-label={t("topic.source.loading")}>
            {Array.from({ length: 5 }, (_, i) => (
              <div key={i} className="topic-source-skeleton-row" />
            ))}
          </div>
        ) : error ? (
          <div className="topic-source-state">
            <span className="topic-source-state-title">{t("topic.source.loadErrorTitle")}</span>
            <p>{t("topic.source.loadErrorDesc")}</p>
            <button type="button" className="btn btn-utility" onClick={() => setNonce((n) => n + 1)}>
              {t("topic.source.loadErrorRetry")}
            </button>
          </div>
        ) : !data || data.items.length === 0 ? (
          <div className="topic-source-state">
            <span className="topic-source-state-title">{t("topic.source.emptyTitle")}</span>
            <p>{t("topic.source.emptyDesc")}</p>
            <button type="button" className="btn btn-utility" onClick={onEditDescription}>
              {t("topic.source.editDescription")}
            </button>
          </div>
        ) : (
          <>
            {/* 목록은 조회 전용 — role="list"/"listitem"이며 버튼·링크로 만들지
                않는다(결정 25). 행에 tabindex를 주지 않고, 스크롤 컨테이너만
                키보드 포커스를 받는다. */}
            <div className="topic-source-list" role="list" tabIndex={0}>
              {data.items.map((source) => (
                <div
                  key={`${source.kind}-${source.id}`}
                  role="listitem"
                  className="topic-source-row"
                  aria-label={
                    source.kind === "todo"
                      ? t("topic.source.ariaTodo")
                      : t("topic.source.ariaEntry", {
                          type: t(legendKeyFor(source.retroType)),
                        })
                  }
                >
                  <span
                    className="topic-source-row-bar"
                    style={{ background: sourceColor(source) }}
                  />
                  <span className="topic-source-row-title">{source.title}</span>
                  <span className="topic-source-row-date">
                    {formatMonthDayFromDateKey(source.dateKey)}
                  </span>
                </div>
              ))}
            </div>

            <div className="topic-source-footer">
              <div className="topic-source-legend">
                <LegendItem color={KIND_COLOR.daily} label={t("topic.source.legendDaily")} />
                <LegendItem color={KIND_COLOR.weekly} label={t("topic.source.legendWeekly")} />
                <LegendItem color={KIND_COLOR.monthly} label={t("topic.source.legendMonthly")} />
                <LegendItem color={KIND_COLOR.yearly} label={t("topic.source.legendYearly")} />
                <LegendItem color={TODO_COLOR} label={t("topic.source.legendTodo")} />
                <LegendItem color={FALLBACK_COLOR} label={t("topic.source.legendOther")} />
              </div>
              <div className="topic-source-pagination">
                <span className="topic-source-page-summary">
                  {t("topic.source.pageSummary", { total: data.total, from, to })}
                </span>
                <button
                  type="button"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                >
                  {t("topic.source.prev")}
                </button>
                <span className="topic-source-page-current">{page}</span>
                <button
                  type="button"
                  disabled={to >= data.total}
                  onClick={() => setPage((p) => p + 1)}
                >
                  {t("topic.source.next")}
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>,
    document.body,
  );
}

function legendKeyFor(retroType: RetrospectiveType | null) {
  switch (retroType) {
    case "daily":
      return "topic.source.legendDaily" as const;
    case "weekly":
      return "topic.source.legendWeekly" as const;
    case "monthly":
      return "topic.source.legendMonthly" as const;
    case "yearly":
      return "topic.source.legendYearly" as const;
    default:
      return "topic.source.legendOther" as const;
  }
}

function LegendItem({ color, label }: { color: string; label: string }) {
  return (
    <span className="topic-source-legend-item">
      <span className="topic-source-legend-swatch" style={{ background: color }} />
      {label}
    </span>
  );
}
