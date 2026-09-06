import { memo } from "react";
import { BookOpen } from "lucide-react";
import type { JournalEntry } from "@/entities/entry/model/types";
import { Pill } from "@/shared/ui/pill/Pill";
import { useDraggable } from "@/shared/lib/dnd";
import { useTranslation } from "@/shared/lib/i18n";
import { RETRO_DRAG_KIND, RETRO_LABEL_KEY, type RetroDragPayload } from "../model/constants";
import { formatEntryDateRange } from "../model/formatEntryDate";

export interface RetroCardProps {
  entry: JournalEntry;
  isActive: boolean;
  isToday: boolean;
  onSelect: (id: string) => void;
  /** GitHub 동기화 상태(synced/draft) 표시 여부 — 개발자 계정만 true. */
  showSyncBadge: boolean;
  /**
   * 소속 폴더 경로(루트→소속 순). 검색·기간 필터 모드에서만 넘긴다 — 폴더
   * 뷰에서는 화면의 모든 카드가 같은 폴더라 정보량이 0 이다.
   * 빈 배열은 미분류(폴더 밖)를 뜻한다. undefined 면 칩을 그리지 않는다.
   */
  folderPath?: string[];
}

/** 아이콘 스퀘어 팔레트 색상 수 (retro.css 의 .retro-card-icon-tone-N 와 일치). */
const TONE_COUNT = 6;

/**
 * 엔트리 id 를 차분한 뮤트 팔레트(6색) 중 하나로 결정적 매핑한다.
 * 같은 카드는 항상 같은 색을 유지하되 그리드 전체엔 은은한 다양성을 준다.
 * 종류(daily/weekly/…)는 Pill 이 알려주므로 색으로 인코딩하지 않는다.
 */
function toneClass(seed: string): string {
  let h = 0;
  for (let i = 0; i < seed.length; i++) {
    h = (h * 31 + seed.charCodeAt(i)) | 0;
  }
  return `retro-card-icon-tone-${Math.abs(h) % TONE_COUNT}`;
}

function RetroCardImpl({
  entry,
  isActive,
  isToday,
  onSelect,
  showSyncBadge,
  folderPath,
}: RetroCardProps) {
  const { t, locale } = useTranslation();
  const isDraft = !entry.synced;
  const summaryPending = entry.isSummary && entry.status === "pending";
  const summaryInProgress = entry.isSummary && entry.status === "in_progress";
  const summaryFailed = entry.isSummary && entry.status === "failed";
  // 폴더로 드래그해 옮길 수 있게 한다(회고록 폴더 정리 기능).
  const { isDragging, ...dragHandlers } = useDraggable({
    kind: RETRO_DRAG_KIND,
    data: {
      itemType: "entry",
      id: entry.id,
      retroType: entry.retroType,
    } satisfies RetroDragPayload,
  });

  return (
    <button
      type="button"
      onClick={() => onSelect(entry.id)}
      className="retro-card"
      data-active={isActive ? "true" : undefined}
      data-today={isToday ? "true" : undefined}
      data-draggable="true"
      data-dragging={isDragging ? "true" : undefined}
      {...dragHandlers}
    >
      <div className="retro-card-top">
        <span className={`retro-card-icon ${toneClass(entry.id)}`}>
          <BookOpen size={16} />
        </span>
      </div>

      <p className="retro-card-title">{entry.title}</p>

      <div className="retro-card-meta">
        <span className="retro-card-date">
          {formatEntryDateRange(entry.retroType, entry.dateKey, locale)}
        </span>
        {folderPath !== undefined ? (
          <span
            className="retro-card-folder"
            title={folderPath.length > 0 ? folderPath.join(" › ") : undefined}
          >
            {folderPath.length > 0
              ? // 길면 마지막 2단계만 — 전체 경로는 title 로 확인한다.
                (folderPath.length > 2 ? "… › " : "") +
                folderPath.slice(-2).join(" › ")
              : t("retro.card.unfiled")}
          </span>
        ) : null}
        {showSyncBadge ? (
          <span
            className={`retro-card-sync ${isDraft ? "is-draft" : "is-synced"}`}
          >
            <span className="retro-card-sync-dot" />
            {isDraft ? t("retro.badge.draft") : t("retro.badge.synced")}
          </span>
        ) : null}
      </div>

      <div className="retro-card-badges">
        <Pill tone="outline" className="pill-sm">
          {t(RETRO_LABEL_KEY[entry.retroType])}
        </Pill>
        {isToday ? (
          <Pill tone="blue" className="pill-sm">
            {t("retro.badge.today")}
          </Pill>
        ) : null}
        {summaryPending || summaryInProgress ? (
          <Pill tone="warn" className="pill-sm">
            {t("retro.badge.generating")}
          </Pill>
        ) : null}
        {summaryFailed ? (
          <Pill tone="warn" className="pill-sm">
            {t("retro.badge.summaryFailed")}
          </Pill>
        ) : null}
      </div>
    </button>
  );
}

export const RetroCard = memo(RetroCardImpl);
