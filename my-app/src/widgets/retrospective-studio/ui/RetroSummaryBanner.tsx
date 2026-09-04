import { RotateCcw, Sparkles } from "lucide-react"
import type { JournalEntry } from "@/entities/entry/model/types"
import { useTranslation } from "@/shared/lib/i18n"

export interface RetroSummaryBannerProps {
  entry: JournalEntry
  /** 되돌리기 확인 모달을 연다. */
  onRevert: () => void
}

/**
 * AI 요약 엔트리 전용 배너.
 *  - pending/in_progress: 생성 중 안내
 *  - failed: 실패 안내
 *  - completed: AI 요약 뱃지 + 원본으로 되돌리기
 */
export function RetroSummaryBanner({ entry, onRevert }: RetroSummaryBannerProps) {
  const { t } = useTranslation()

  if (entry.status && entry.status !== "completed") {
    const failed = entry.status === "failed"
    return (
      <div
        className="retro-doc-banner"
        data-tone={failed ? "danger" : undefined}
        style={{ marginTop: "var(--s-md)" }}>
        <span style={{ flex: 1 }}>
          {failed ? t("retro.summary.statusFailed") : t("retro.summary.statusPending")}
        </span>
      </div>
    )
  }

  return (
    <div className="retro-doc-banner" data-tone="ai" style={{ marginTop: "var(--s-md)" }}>
      <span
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: "var(--s-xxs)",
          color: "var(--color-primary-on-dark)",
          whiteSpace: "nowrap",
        }}>
        <Sparkles size={12} />
        {t("retro.summary.aiSummary")}
      </span>
      <span style={{ flex: 1 }}>{t("retro.summary.aiSummaryDesc")}</span>
      <button
        type="button"
        className="btn btn-utility"
        style={{
          padding: "var(--s-xs) var(--s-sm)",
          fontSize: 12,
          whiteSpace: "nowrap",
        }}
        onClick={onRevert}>
        <RotateCcw size={12} />
        {t("retro.summary.revert")}
      </button>
    </div>
  )
}
