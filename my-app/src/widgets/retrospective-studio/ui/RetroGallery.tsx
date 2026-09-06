import { useState } from "react";
import {
  ChevronLeft,
  ChevronRight,
  FolderPlus,
  Plus,
  Search,
  SlidersHorizontal,
  Sparkles,
} from "lucide-react";
import type { JournalEntry, RetrospectiveType } from "@/entities/entry/model/types";
import type { Folder } from "@/entities/folder/model/types";
import type { SummaryKind } from "@/entities/summary/model/types";
import { useTodayKey } from "@/app/providers/useToday";
import { useDropTarget } from "@/shared/lib/dnd";
import { EmptyState } from "@/shared/ui/empty-state/EmptyState";
import { useTranslation, type TranslationKey } from "@/shared/lib/i18n";
import {
  MONTHS,
  RETRO_DRAG_KIND,
  type RetroDragPayload,
} from "../model/constants";
import type { FolderCrumb } from "../model/useFolderNav";
import type { UseRetroFilterResult } from "../model/useRetroFilter";
import { RetroCard } from "./RetroCard";
import { RetroFolderCard } from "./RetroFolderCard";
import { RetroTabBar } from "./RetroTabBar";

export interface RetroGalleryProps {
  filterState: UseRetroFilterResult;
  /** 현재 편집 중인 회고 id (카드 하이라이트용). */
  activeId: string | null;
  onSelect: (id: string) => void;
  onNewDaily: () => void;
  onSummarize: (kind: SummaryKind) => void;
  showSyncBadge: boolean;
  listEntries: JournalEntry[];
  currentPage: number;
  totalPages: number;
  onPrevPage: () => void;
  onNextPage: () => void;
  loading?: boolean;
  loadError?: boolean;
  /** 디바운스된 검색어 — listEntries/loading 이 실제로 반영하고 있는 검색어.
   * "첫 방문(pristine)" 판정에 써서, 입력값(search)만 지워졌을 뿐 디바운스가
   * 아직 따라잡지 못한 순간(이전 검색어의 빈 결과가 남아있는 순간)에 빈 상태
   * CTA 가 잘못 뜨는 것을 막는다. */
  debouncedSearch: string;
  /** 검색어·기간 필터가 없어 폴더 브라우징이 활성인지(GET /folders/contents 는
   * 검색/기간을 지원하지 않아, 걸려 있으면 플랫 뷰로 전환하고 폴더 UI 를 숨긴다). */
  isFolderView: boolean;
  /** 현재 폴더의 직계 하위 폴더(isFolderView 일 때만 의미). */
  folders: Folder[];
  /** 루트 제외 경로. */
  breadcrumb: FolderCrumb[];
  onEnterFolder: (folder: FolderCrumb) => void;
  onGoToRoot: () => void;
  onGoToCrumb: (index: number) => void;
  onCreateFolder: () => void;
  onRenameFolder: (folder: Folder) => void;
  onDeleteFolder: (folder: Folder) => void;
  /** targetFolderId=null 이면 루트로 이동(breadcrumb 드롭). */
  onDropEntryOnFolder: (
    entryId: string,
    retroType: RetrospectiveType,
    targetFolderId: string | null,
  ) => void;
  onDropFolderOnFolder: (draggedFolderId: string, targetFolderId: string | null) => void;
}

const SUMMARY_KINDS: { kind: SummaryKind; labelKey: TranslationKey }[] = [
  { kind: "weekly", labelKey: "retro.summarize.weekly" },
  { kind: "monthly", labelKey: "retro.summarize.monthly" },
  { kind: "yearly", labelKey: "retro.summarize.yearly" },
];

export function RetroGallery({
  filterState,
  activeId,
  onSelect,
  onNewDaily,
  onSummarize,
  showSyncBadge,
  listEntries,
  currentPage,
  totalPages,
  onPrevPage,
  onNextPage,
  loading = false,
  loadError = false,
  debouncedSearch,
  isFolderView,
  folders,
  breadcrumb,
  onEnterFolder,
  onGoToRoot,
  onGoToCrumb,
  onCreateFolder,
  onRenameFolder,
  onDeleteFolder,
  onDropEntryOnFolder,
  onDropFolderOnFolder,
}: RetroGalleryProps) {
  const todayDateKey = useTodayKey();
  const { t } = useTranslation();
  const {
    retroFilter,
    setRetroFilter,
    search,
    setSearch,
    yearFilter,
    setYearFilter,
    monthFilter,
    setMonthFilter,
    weekFilter,
    setWeekFilter,
    years,
    weeks,
  } = filterState;

  // AI 요약 메뉴(주간/월간/연간) 및 기간 필터 팝오버 — 로컬 열림 상태.
  const [aiMenuOpen, setAiMenuOpen] = useState(false);
  const [filterOpen, setFilterOpen] = useState(false);

  // 검색·기간 필터가 모두 초기값이고 daily 탭 + 최상위 폴더면 "첫 방문(빈 상태)"으로
  // 간주. search(입력 즉시) 뿐 아니라 debouncedSearch(listEntries/loading 이 실제로
  // 반영 중인 검색어)도 함께 비어 있어야 한다 — 그렇지 않으면 검색어를 지운
  // 직후, 디바운스가 아직 따라잡지 못해 이전 검색어의 빈 결과가 남아있는
  // 순간에 "회고록이 없다" CTA 가 잘못 플래시된다.
  const isPristine =
    retroFilter === "daily" &&
    search === "" &&
    debouncedSearch === "" &&
    yearFilter === "all" &&
    monthFilter === "all" &&
    weekFilter === "all" &&
    breadcrumb.length === 0;

  // 폴더 뷰에서는 하위 폴더가 있으면 "비어있다"고 볼 수 없다(내용이 폴더 안에 있을 뿐).
  const isEmpty =
    !loadError &&
    !loading &&
    listEntries.length === 0 &&
    (!isFolderView || folders.length === 0);

  // 첫 방문 빈 상태: 탭 바(주제 탭 진입 경로 유지) + 중앙 CTA.
  if (isEmpty && isPristine) {
    return (
      <section className="retro-gallery">
        <div className="retro-gallery-head">
          <RetroTabBar retroFilter={retroFilter} setRetroFilter={setRetroFilter} />
        </div>
        <div className="retro-gallery-empty">
          <span className="retro-gallery-empty-icon">
            <Plus size={22} />
          </span>
          <h3 className="retro-gallery-empty-title">{t("retro.gallery.emptyTitle")}</h3>
          <p className="retro-gallery-empty-desc">{t("retro.gallery.emptyDesc")}</p>
          <button
            type="button"
            className="btn btn-primary"
            onClick={onNewDaily}
            style={{ justifyContent: "center" }}
          >
            {t("retro.gallery.newRetro")}
          </button>
        </div>
      </section>
    );
  }

  return (
    <section className="retro-gallery">
      {/* ── 헤더: 검색(확장) + AI 요약 (좌) / 타입 칩 (우) ── */}
      <div className="retro-gallery-head">
        <div className="retro-gallery-tools">
          <div className="retro-gallery-search">
            <Search size={14} className="retro-gallery-search-icon" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t("retro.search")}
            />
          </div>

          {/* 기간 필터 팝오버 트리거 (연/월/주) */}
          <div className="retro-gallery-pop">
            <button
              type="button"
              className="retro-gallery-icon-btn"
              onClick={() => setFilterOpen((v) => !v)}
              title={t("retro.filter.periodFilter")}
              aria-label={t("retro.filter.periodFilter")}
            >
              <SlidersHorizontal size={15} />
            </button>
            {filterOpen ? (
              <>
                <div
                  className="retro-gallery-pop-backdrop"
                  onClick={() => setFilterOpen(false)}
                />
                <div className="retro-gallery-pop-panel" role="menu">
                  <label className="retro-gallery-pop-row">
                    <span>{t("retro.filter.year")}</span>
                    <select
                      className="select"
                      value={yearFilter}
                      onChange={(e) => setYearFilter(e.target.value)}
                    >
                      <option value="all">{t("retro.filter.allYears")}</option>
                      {years.map((y) => (
                        <option key={y} value={y}>
                          {y}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="retro-gallery-pop-row">
                    <span>{t("retro.filter.month")}</span>
                    <select
                      className="select"
                      value={monthFilter}
                      onChange={(e) => setMonthFilter(e.target.value)}
                      disabled={yearFilter === "all"}
                    >
                      <option value="all">{t("retro.filter.allMonths")}</option>
                      {MONTHS.map((m) => (
                        <option key={m} value={m}>
                          {m}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="retro-gallery-pop-row">
                    <span>{t("retro.filter.week")}</span>
                    <select
                      className="select"
                      value={weekFilter}
                      onChange={(e) => setWeekFilter(e.target.value)}
                      disabled={yearFilter === "all"}
                    >
                      <option value="all">{t("retro.filter.allWeeks")}</option>
                      {weeks.map((w) => (
                        <option key={w} value={w}>
                          W{w}
                        </option>
                      ))}
                    </select>
                  </label>
                  {yearFilter === "all" ? (
                    <p className="retro-gallery-pop-hint">
                      {t("retro.filter.yearFirstHint")}
                    </p>
                  ) : null}
                </div>
              </>
            ) : null}
          </div>

          {/* AI 요약 생성 (주간/월간/연간 메뉴) */}
          <div className="retro-gallery-pop">
            <button
              type="button"
              className="retro-gallery-icon-btn retro-gallery-ai-btn"
              onClick={() => setAiMenuOpen((v) => !v)}
              title={t("retro.gallery.aiSummary")}
              aria-label={t("retro.gallery.aiSummary")}
            >
              <Sparkles size={15} />
            </button>
            {aiMenuOpen ? (
              <>
                <div
                  className="retro-gallery-pop-backdrop"
                  onClick={() => setAiMenuOpen(false)}
                />
                <div className="retro-gallery-pop-panel retro-gallery-ai-menu" role="menu">
                  {SUMMARY_KINDS.map(({ kind, labelKey }) => (
                    <button
                      key={kind}
                      type="button"
                      className="retro-gallery-ai-item"
                      role="menuitem"
                      onClick={() => {
                        setAiMenuOpen(false);
                        onSummarize(kind);
                      }}
                    >
                      <Sparkles size={12} /> {t(labelKey)}
                    </button>
                  ))}
                </div>
              </>
            ) : null}
          </div>

          {isFolderView ? (
            <button
              type="button"
              className="retro-gallery-icon-btn"
              onClick={onCreateFolder}
              title={t("folder.newFolder")}
              aria-label={t("folder.newFolder")}
            >
              <FolderPlus size={15} />
            </button>
          ) : null}
        </div>

        {/* 타입 칩 */}
        <RetroTabBar retroFilter={retroFilter} setRetroFilter={setRetroFilter} />
      </div>

      {/* ── 폴더 경로(breadcrumb) — 최상위가 아닐 때만. 각 항목은 drop target 이라
          카드를 위쪽 경로로 드래그해 옮길 수 있다. ── */}
      {isFolderView && breadcrumb.length > 0 ? (
        <div className="retro-breadcrumb">
          <FolderCrumbButton
            label={t("folder.root")}
            onClick={onGoToRoot}
            onDropEntry={(id, rt) => onDropEntryOnFolder(id, rt, null)}
            onDropFolder={(id) => onDropFolderOnFolder(id, null)}
          />
          {breadcrumb.map((crumb, i) => (
            <FolderCrumbButton
              key={crumb.id}
              label={crumb.name}
              current={i === breadcrumb.length - 1}
              onClick={() => onGoToCrumb(i)}
              onDropEntry={(id, rt) => onDropEntryOnFolder(id, rt, crumb.id)}
              onDropFolder={(id) => onDropFolderOnFolder(id, crumb.id)}
            />
          ))}
        </div>
      ) : null}

      {/* ── 카드 그리드 ── */}
      {loadError ? (
        <EmptyState message={t("retro.list.loadError")} minHeight={220} />
      ) : loading && listEntries.length === 0 ? (
        <EmptyState message={t("retro.list.loading")} minHeight={220} />
      ) : (
        <div className="retro-gallery-grid">
          {/* 새 회고록 만들기 카드 — 일간(및 전체 탭)은 즉시 오늘자 생성, 주간/월간/
              연간은 기간 선택 모달(PeriodPickerModal)을 그 종류로 바로 연다.
              1페이지에만 — 페이지네이션이 "페이지당 size 개"를 약속하므로 매
              페이지가 size+1 칸이 되면 안 된다. */}
          {currentPage === 1 ? (
            <button
              type="button"
              className="retro-card retro-card-new"
              onClick={() =>
                retroFilter === "daily" ||
                retroFilter === "all" ||
                retroFilter === "topics"
                  ? onNewDaily()
                  : onSummarize(retroFilter)
              }
            >
              <span className="retro-card-new-icon">
                <Plus size={18} />
              </span>
              <span className="retro-card-new-label">
                {t("retro.gallery.newRetro")}
              </span>
            </button>
          ) : null}

          {isFolderView
            ? folders.map((folder) => (
                <RetroFolderCard
                  key={folder.id}
                  folder={folder}
                  onOpen={onEnterFolder}
                  onRename={onRenameFolder}
                  onDelete={onDeleteFolder}
                  onDropEntry={(entryId, entryRetroType) =>
                    onDropEntryOnFolder(entryId, entryRetroType, folder.id)
                  }
                  onDropFolder={(draggedFolderId) =>
                    onDropFolderOnFolder(draggedFolderId, folder.id)
                  }
                />
              ))
            : null}

          {listEntries.map((e) => (
            <RetroCard
              key={e.id}
              entry={e}
              isActive={e.id === activeId}
              isToday={e.dateKey === todayDateKey}
              onSelect={onSelect}
              showSyncBadge={showSyncBadge}
            />
          ))}
        </div>
      )}

      {/* 페이저 */}
      {totalPages > 1 ? (
        <div className="pager" style={{ marginTop: "auto" }}>
          <button
            type="button"
            className="pager-btn"
            disabled={currentPage <= 1 || loading}
            onClick={onPrevPage}
          >
            <ChevronLeft size={12} /> {t("retro.pager.prev")}
          </button>
          <span>
            {t("retro.pager.page", { current: currentPage, total: totalPages })}
          </span>
          <button
            type="button"
            className="pager-btn"
            disabled={currentPage >= totalPages || loading}
            onClick={onNextPage}
          >
            {t("retro.pager.next")} <ChevronRight size={12} />
          </button>
        </div>
      ) : null}
    </section>
  );
}

/** 폴더 경로(breadcrumb) 한 항목. drop target 이라 카드를 이 경로로 드래그해 옮길 수 있다. */
function FolderCrumbButton({
  label,
  current,
  onClick,
  onDropEntry,
  onDropFolder,
}: {
  label: string;
  current?: boolean;
  onClick: () => void;
  onDropEntry: (entryId: string, retroType: RetrospectiveType) => void;
  onDropFolder: (folderId: string) => void;
}) {
  const { ref, isOver, isActive } = useDropTarget<typeof RETRO_DRAG_KIND>(
    RETRO_DRAG_KIND,
    (payload) => {
      const data = payload.data as RetroDragPayload;
      if (data.itemType === "entry") onDropEntry(data.id, data.retroType);
      else onDropFolder(data.id);
    },
  );

  return (
    <div
      ref={ref}
      role="button"
      tabIndex={0}
      className="retro-breadcrumb-item"
      data-current={current ? "true" : undefined}
      data-drop-active={isActive ? "true" : undefined}
      data-drop-over={isOver ? "true" : undefined}
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") onClick();
      }}
    >
      {label}
    </div>
  );
}
