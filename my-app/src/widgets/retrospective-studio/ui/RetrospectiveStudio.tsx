import { useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle } from "lucide-react";
import type { RetroRouteParams } from "@/app/router/navigation";
import { useArchiveApp } from "@/app/providers/useArchiveApp";
import { useTodayKey } from "@/app/providers/useToday";
import type { JournalEntry, RetrospectiveType } from "@/entities/entry/model/types";
import type { Folder } from "@/entities/folder/model/types";
import type {
  SummaryKind,
  SummaryReadiness,
} from "@/entities/summary/model/types";
import { fromDateKey } from "@/shared/lib/date";
import { can } from "@/shared/lib/permissions";
import { ConfirmModal } from "@/shared/ui/confirm-modal/ConfirmModal";
import { TextField } from "@/shared/ui/text-field/TextField";
import { useTranslation } from "@/shared/lib/i18n";
import { useDebouncedValue } from "@/shared/lib/useDebouncedValue";
import { useLatestRef } from "@/shared/lib/useLatestRef";
import { useFolderContents } from "../model/useFolderContents";
import { useFolderNav, type FolderCrumb } from "../model/useFolderNav";
import { useRetroEntriesPage } from "../model/useRetroEntriesPage";
import { useRetroFilter } from "../model/useRetroFilter";
import { PeriodPickerModal } from "./PeriodPickerModal";
import { RetroEditor } from "./RetroEditor";
import { RetroGallery } from "./RetroGallery";
import { TopicsPane } from "./TopicsPane";

export function RetrospectiveStudio({ retroParams, onRetroNavigate }: { retroParams?: RetroRouteParams; onRetroNavigate?: (params: RetroRouteParams) => void }) {
  const {
    state,
    updateEntry,
    revertSummaryEdit,
    createDailyEntry,
    pushNotification,
    startSummary,
    checkSummaryReadiness,
    checkRetroExists,
    isDemo,
    focusTarget,
    clearFocus,
  } = useArchiveApp();
  const { t } = useTranslation();
  const todayDateKey = useTodayKey();
  const todayDate = useMemo(() => fromDateKey(todayDateKey), [todayDateKey]);

  // 기간 선택 모달 상태 (열린 요약 종류; null = 닫힘)
  const [pickerKind, setPickerKind] = useState<SummaryKind | null>(null);

  // 데이터 부족 시 확인 다이얼로그 상태
  const [readinessDialog, setReadinessDialog] = useState<{
    kind: SummaryKind;
    target: string;
    periodStart: string;
    readiness: SummaryReadiness;
    /** 덮어쓰기 확인을 거쳐 강제 재생성하는 경우 true. */
    force: boolean;
  } | null>(null);

  // 이미 요약된 회고록 덮어쓰기 확인 다이얼로그 상태
  const [overwriteDialog, setOverwriteDialog] = useState<{
    kind: SummaryKind;
    periodStart: string;
    anchorDateKey: string;
  } | null>(null);

  /** 데모 모드: GitHub 동기화 등 외부 의존성 차단 + "로그인" 액션 토스트. 차단 시 true. */
  const requireLoginInDemo = (): boolean => {
    if (!isDemo) return false;
    pushNotification("info", t("demo.locked.title"), t("demo.locked.message"), {
      actionLabel: t("demo.locked.action"),
      actionHref: "/login",
    });
    return true;
  };

  const filterState = useRetroFilter(state.entries);
  const { filteredEntries } = filterState;
  const { createFolder, updateFolder, deleteFolder, moveEntryToFolder } =
    useArchiveApp();

  // 4개 탭(daily/weekly/monthly/yearly) 전부 서버 페이지네이션(GET /entries/paginated)
  // 으로 조회한다 — daily=journal_entries, weekly/monthly/yearly=retro_summaries.
  // 검색은 디바운스해 입력마다 요청하지 않는다.
  const debouncedSearch = useDebouncedValue(filterState.search, 300);

  // 폴더 브라우징 경로(현재 폴더 + breadcrumb) — GET /folders/contents 는 검색어/
  // 기간을 지원하지 않으므로, 둘 중 하나라도 걸려 있으면 플랫 뷰(useRetroEntriesPage)
  // 로 전환하고 폴더 UI 는 숨긴다("검색은 폴더를 가로질러 전체를 훑는다" 는 의도).
  const folderNav = useFolderNav();
  const isFolderView =
    debouncedSearch.trim() === "" && filterState.dateRange === null;

  const isTopicsView = filterState.retroFilter === "topics";
  const entriesPage = useRetroEntriesPage(
    filterState.retroFilter,
    debouncedSearch,
    filterState.dateRange,
    !isFolderView && !isTopicsView,
  );
  const folderContents = useFolderContents(
    state.folders,
    state.entries,
    folderNav.currentFolderId,
    filterState.retroFilter,
    isFolderView && !isTopicsView,
  );
  // 데모/mock 은 서버가 없어 serverMode=false → 클라이언트 목록(useRetroFilter)으로 폴백.
  const useServerList = entriesPage.serverMode;

  // 서버 페이지 항목(id 순서)을 state.entries 에서 실제 엔트리로 해석한다
  // (편집이 state.entries 를 갱신하면 목록도 즉시 반영된다).
  const serverPageEntries = useMemo(
    () =>
      entriesPage.ids
        .map((id) => state.entries.find((e) => e.id === id))
        .filter((e): e is JournalEntry => Boolean(e)),
    [entriesPage.ids, state.entries],
  );

  // 사이드바 목록 + 페이저 소스. 폴더 뷰가 우선이고(폴더 자체가 서버/클라 폴백을
  // 이미 흡수), 아니면 기존 플랫 뷰(서버 모드=서버 페이지, 폴백=클라이언트).
  const listEntries = isFolderView
    ? folderContents.entries
    : useServerList
      ? serverPageEntries
      : filterState.pageEntries;
  const currentPage = isFolderView
    ? folderContents.page
    : useServerList
      ? entriesPage.page
      : filterState.page + 1;
  const totalPages = isFolderView
    ? folderContents.totalPages
    : useServerList
      ? entriesPage.totalPages
      : filterState.totalPages;
  const goPrevPage = () => {
    if (isFolderView) folderContents.setPage(folderContents.page - 1);
    else if (useServerList) entriesPage.setPage(entriesPage.page - 1);
    else filterState.setPage((p) => Math.max(0, p - 1));
  };
  const goNextPage = () => {
    if (isFolderView) folderContents.setPage(folderContents.page + 1);
    else if (useServerList) entriesPage.setPage(entriesPage.page + 1);
    else filterState.setPage((p) => Math.min(filterState.totalPages - 1, p + 1));
  };

  // AI 요약 완료 시 갤러리만 즉시 갱신 — 서버 모드는 /entries/paginated 나
  // /folders/contents 의 목록이 완료된 요약을 자동으로 포함하지 않으므로(로컬
  // state.entries 갱신과 별개) 직접 refetch 해야 카드가 나타난다. (클라이언트
  // 폴백 목록은 state.entries 파생이라 이미 자동 반영됨 — 서버 모드에서만 필요.)
  const galleryRefreshRef = useLatestRef({
    retroFilter: filterState.retroFilter,
    isFolderView,
    useServerList,
    setEntriesPage: entriesPage.setPage,
    refetchEntries: entriesPage.refetch,
    refetchFolder: folderContents.refetch,
  });
  const prevPendingSummaryRef = useRef(state.pendingSummary);
  useEffect(() => {
    const prev = prevPendingSummaryRef.current;
    prevPendingSummaryRef.current = state.pendingSummary;
    // pendingSummary 가 "있었다가 없어짐" = 완료(또는 취소) 전이. 지금 보고 있는
    // 탭(kind)과 일치할 때만 새로고침한다.
    if (prev && !state.pendingSummary && prev.kind === galleryRefreshRef.current.retroFilter) {
      if (galleryRefreshRef.current.isFolderView) {
        galleryRefreshRef.current.refetchFolder();
      } else if (galleryRefreshRef.current.useServerList) {
        galleryRefreshRef.current.setEntriesPage(1);
        galleryRefreshRef.current.refetchEntries();
      }
    }
  }, [state.pendingSummary, galleryRefreshRef]);

  // ─── 폴더 CRUD (생성/이름변경/삭제) + 드래그앤드롭 이동 ─────────────────────
  const [folderPrompt, setFolderPrompt] = useState<{
    mode: "create" | "rename";
    folder?: Folder;
    name: string;
  } | null>(null);
  const [folderDeleteTarget, setFolderDeleteTarget] = useState<Folder | null>(
    null,
  );

  const submitFolderPrompt = async () => {
    if (!folderPrompt) return;
    const name = folderPrompt.name.trim();
    if (!name) return;
    if (folderPrompt.mode === "create") {
      await createFolder(name, folderNav.currentFolderId);
    } else if (folderPrompt.folder) {
      await updateFolder(folderPrompt.folder.id, { name });
    }
    setFolderPrompt(null);
    folderContents.refetch();
  };

  const confirmDeleteFolder = async () => {
    const target = folderDeleteTarget;
    if (!target) return;
    setFolderDeleteTarget(null);
    const crumbIndex = folderNav.breadcrumb.findIndex((c) => c.id === target.id);
    await deleteFolder(target.id);
    if (crumbIndex >= 0) {
      // 지금 보고 있는 경로 위쪽이 삭제됐으면 그 지점 이전으로 물러난다.
      if (crumbIndex === 0) folderNav.goToRoot();
      else folderNav.goToCrumb(crumbIndex - 1);
    } else {
      folderContents.refetch();
    }
  };

  const handleDropEntryOnFolder = (
    entryId: string,
    retroType: RetrospectiveType,
    targetFolderId: string | null,
  ) => {
    void moveEntryToFolder(entryId, retroType, targetFolderId).then(() =>
      folderContents.refetch(),
    );
  };

  const handleDropFolderOnFolder = (
    draggedFolderId: string,
    targetFolderId: string | null,
  ) => {
    void updateFolder(draggedFolderId, { parentFolderId: targetFolderId }).then(
      () => folderContents.refetch(),
    );
  };

  const handleEnterFolder = (folder: FolderCrumb) => folderNav.enterFolder(folder);

  const [selectedId, setSelectedId] = useState<string | null>(
    () => retroParams?.entryId ?? filteredEntries[0]?.id ?? null,
  );

  // 2화면 네비게이션: 카드 그리드(gallery) ⇄ 편집기(editor).
  const [view, setView] = useState<"gallery" | "editor">(() =>
    retroParams?.view === "editor" ? "editor" : "gallery"
  );

  const active =
    state.entries.find((e) => e.id === selectedId) ??
    listEntries[0] ??
    filteredEntries[0] ??
    null;

  // 카드 선택 → 편집기로 전환.
  const openEntry = (id: string) => {
    setSelectedId(id);
    setView("editor");
    onRetroNavigate?.({ view: "editor", entryId: id });
  };

  // 전역 검색에서 특정 회고로 이동 요청 → 해당 회고 종류로 필터를 맞추고 선택.
  const { setRetroFilter } = filterState;
  useEffect(() => {
    if (focusTarget?.kind !== "entry") return;
    const target = state.entries.find((e) => e.id === focusTarget.entryId);
    if (target) {
      setRetroFilter(target.retroType);
      setSelectedId(target.id);
      setView("editor");
    }
    clearFocus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusTarget, state.entries]);

  // URL 파라미터 변경 시 view와 selectedId를 동기화 (뒤로가기 등).
  useEffect(() => {
    if (retroParams?.view === "editor" && retroParams?.entryId) {
      setSelectedId(retroParams.entryId);
      setView("editor");
    } else if (retroParams?.view !== "editor") {
      setView("gallery");
    }
  }, [retroParams?.view, retroParams?.entryId]);

  const completedTodos = useMemo(() => {
    if (!active) return [];
    return state.todos.filter((todoItem) => {
      if (todoItem.status !== "done") return false;
      const isSpanning = todoItem.dueDate && todoItem.dueDate > todoItem.dateKey;
      if (isSpanning) {
        // 마감일 지정 할 일: completedAt 날짜 기준 회고록에만 표시.
        // completedAt 이 없으면 dueDate(마감일)를 완료일로 간주.
        const completedDate = todoItem.completedAt
          ? todoItem.completedAt.slice(0, 10)
          : todoItem.dueDate!;
        return completedDate === active.dateKey;
      }
      return todoItem.dateKey === active.dateKey;
    });
  }, [state.todos, active]);

  // 서버 모델: 연결 상태 + login + push target + verified emails
  const isGithubConnected = state.github.status === "connected";
  const { login, pushTargetRepositoryId, linkedRepositories, hasVerifiedEmails } =
    state.github;
  const pushTargetRepo = linkedRepositories.find(
    (r) => r.id === pushTargetRepositoryId,
  );
  const githubConnectedAs =
    login ?? pushTargetRepo?.owner ?? state.currentUser?.displayName ?? "github";

  const handleSave = () => {
    if (!active) return;
    if (requireLoginInDemo()) return;
    if (!isGithubConnected) return;
    // RetroEditor 내에서 pushRetrospective 가 호출되고 성공 시 여기로 옴 → synced 마킹
    updateEntry(active.id, { synced: true });
  };

  // AI 요약 편집 해제(되돌리기) — 확인 모달은 RetroEditor 가 띄우고, 여기선 데모 게이팅 후 호출만.
  const handleRevertSummary = () => {
    if (!active) return;
    if (requireLoginInDemo()) return;
    revertSummaryEdit(active.id);
  };

  // [요약] 버튼 클릭 → 기간 선택 모달을 연다.
  const handleSummarize = (kind: SummaryKind) => {
    if (requireLoginInDemo()) return;
    setPickerKind(kind);
  };

  // 기간 확정 → 이미 요약된 회고록이 있으면 덮어쓰기 확인, 없으면 바로 진행.
  const handlePeriodPicked = async (
    periodStart: string,
    periodEnd: string,
    anchorDateKey: string,
  ) => {
    const kind = pickerKind;
    setPickerKind(null);
    if (!kind) return;
    const exists = await checkRetroExists(kind, periodStart, periodEnd);
    if (exists) {
      setOverwriteDialog({ kind, periodStart, anchorDateKey });
      return;
    }
    await proceedSummary(kind, periodStart, anchorDateKey);
  };

  // 데이터 밀도 점검(monthly/yearly) 후 요약 생성. 부족하면 확인 다이얼로그.
  // force=true 면 이미 완료된 기간도 강제 재생성(덮어쓰기 확인을 거친 경우).
  const proceedSummary = async (
    kind: SummaryKind,
    periodStart: string,
    anchorDateKey: string,
    force = false,
  ) => {
    const readiness = await checkSummaryReadiness(kind, periodStart);
    if (readiness && readiness.recommendation === "insufficient") {
      setReadinessDialog({
        kind,
        target: anchorDateKey,
        periodStart,
        readiness,
        force,
      });
      return;
    }
    startSummary(kind, anchorDateKey, periodStart, force);
  };

  // 덮어쓰기 확인 → 강제 재생성(force=true).
  const confirmOverwrite = () => {
    if (!overwriteDialog) return;
    const { kind, periodStart, anchorDateKey } = overwriteDialog;
    setOverwriteDialog(null);
    void proceedSummary(kind, periodStart, anchorDateKey, true);
  };

  const confirmReadinessGenerate = () => {
    if (!readinessDialog) return;
    startSummary(
      readinessDialog.kind,
      readinessDialog.target,
      readinessDialog.periodStart,
      readinessDialog.force,
    );
    setReadinessDialog(null);
  };

  const handleNewDaily = () => {
    const dateKey = todayDateKey;
    const { entry, existed } = createDailyEntry(
      dateKey,
      // POST 응답의 서버 ID 로 교체되면 selectedId 를 갱신하고, 최신 회고가 목록
      // 1페이지 최상단에 나타나도록 서버 목록을 다시 조회한다.
      (serverEntry) => {
        setSelectedId(serverEntry.id);
        if (isFolderView) {
          folderContents.refetch();
        } else {
          entriesPage.setPage(1);
          entriesPage.refetch();
        }
      },
      // 폴더를 보는 중이면 그 폴더 안에 생성한다.
      folderNav.currentFolderId,
    );
    if (existed) {
      pushNotification("info", t("retro.newDaily.duplicate"), dateKey);
    } else {
      pushNotification("success", t("retro.newDaily.created"), dateKey);
    }
    filterState.setRetroFilter("daily");
    setSelectedId(entry.id);
    setView("editor");
  };

  return (
    <div className="page retro-page">
      {view === "editor" && active ? (
        <RetroEditor
          key={active.id}
          entry={active}
          completedTodos={completedTodos}
          githubConnectedAs={githubConnectedAs}
          isGithubConnected={isGithubConnected}
          hasVerifiedEmails={hasVerifiedEmails}
          pushTargetRepositoryId={pushTargetRepositoryId}
          onUpdate={(patch) => updateEntry(active.id, patch)}
          onSave={handleSave}
          onRevertSummary={handleRevertSummary}
          onBack={() => {
            setView("gallery");
            onRetroNavigate?.({});
          }}
        />
      ) : filterState.retroFilter === "topics" ? (
        <TopicsPane
          retroFilter={filterState.retroFilter}
          setRetroFilter={filterState.setRetroFilter}
          requireLoginInDemo={requireLoginInDemo}
        />
      ) : (
        <RetroGallery
          filterState={filterState}
          activeId={selectedId}
          onSelect={openEntry}
          onSummarize={handleSummarize}
          onNewDaily={handleNewDaily}
          showSyncBadge={can(state.settings.accountType, "github")}
          listEntries={listEntries}
          currentPage={currentPage}
          totalPages={totalPages}
          onPrevPage={goPrevPage}
          onNextPage={goNextPage}
          loading={
            isFolderView ? folderContents.loading : useServerList && entriesPage.loading
          }
          loadError={
            isFolderView ? folderContents.error : useServerList && entriesPage.error
          }
          debouncedSearch={debouncedSearch}
          isFolderView={isFolderView}
          folders={isFolderView ? folderContents.folders : []}
          breadcrumb={folderNav.breadcrumb}
          onEnterFolder={handleEnterFolder}
          onGoToRoot={folderNav.goToRoot}
          onGoToCrumb={folderNav.goToCrumb}
          onCreateFolder={() => setFolderPrompt({ mode: "create", name: "" })}
          onRenameFolder={(folder) =>
            setFolderPrompt({ mode: "rename", folder, name: folder.name })
          }
          onDeleteFolder={setFolderDeleteTarget}
          onDropEntryOnFolder={handleDropEntryOnFolder}
          onDropFolderOnFolder={handleDropFolderOnFolder}
        />
      )}

      {readinessDialog ? (
        <ConfirmModal
          open
          icon={<span className="retro-warn-badge"><AlertTriangle size={18} /></span>}
          title={t("retro.readiness.title")}
          message={
            <span style={{ whiteSpace: "pre-line" }}>
              {t(
                readinessDialog.kind === "yearly"
                  ? "retro.readiness.annualMessage"
                  : "retro.readiness.monthlyMessage",
                {
                  covered: readinessDialog.readiness.coveredUnits,
                  expected: readinessDialog.readiness.expectedUnits,
                  year: new Date(
                    readinessDialog.readiness.periodStart,
                  ).getFullYear(),
                },
              )}
            </span>
          }
          confirmLabel={t("retro.readiness.generate")}
          cancelLabel={t("retro.readiness.writeMore")}
          onConfirm={confirmReadinessGenerate}
          onCancel={() => setReadinessDialog(null)}
        />
      ) : null}

      {pickerKind ? (
        <PeriodPickerModal
          key={pickerKind}
          kind={pickerKind}
          today={todayDate}
          onPick={(periodStart, periodEnd, anchorDateKey) =>
            void handlePeriodPicked(periodStart, periodEnd, anchorDateKey)
          }
          onCancel={() => setPickerKind(null)}
        />
      ) : null}

      {overwriteDialog ? (
        <ConfirmModal
          open
          tone="danger"
          title={t("retro.overwrite.title")}
          message={
            <span style={{ whiteSpace: "pre-line" }}>
              {t("retro.overwrite.message")}
            </span>
          }
          confirmLabel={t("retro.overwrite.confirm")}
          cancelLabel={t("retro.overwrite.cancel")}
          onConfirm={confirmOverwrite}
          onCancel={() => setOverwriteDialog(null)}
        />
      ) : null}

      {folderPrompt ? (
        <ConfirmModal
          open
          title={
            folderPrompt.mode === "create"
              ? t("folder.newFolder")
              : t("folder.rename")
          }
          message={
            <TextField
              autoFocus
              value={folderPrompt.name}
              placeholder={t("folder.namePlaceholder")}
              onChange={(e) =>
                setFolderPrompt((prev) =>
                  prev ? { ...prev, name: e.target.value } : prev,
                )
              }
              onKeyDown={(e) => {
                if (e.key === "Enter") void submitFolderPrompt();
              }}
            />
          }
          confirmLabel={t("common.confirm")}
          cancelLabel={t("common.cancel")}
          onConfirm={() => void submitFolderPrompt()}
          onCancel={() => setFolderPrompt(null)}
        />
      ) : null}

      {folderDeleteTarget ? (
        <ConfirmModal
          open
          tone="danger"
          title={t("folder.deleteTitle")}
          message={
            <span style={{ whiteSpace: "pre-line" }}>
              {t("folder.deleteMessage")}
            </span>
          }
          confirmLabel={t("common.delete")}
          cancelLabel={t("common.cancel")}
          onConfirm={() => void confirmDeleteFolder()}
          onCancel={() => setFolderDeleteTarget(null)}
        />
      ) : null}
    </div>
  );
}
