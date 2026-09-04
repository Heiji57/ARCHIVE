import { lazy, Suspense, useEffect, useRef, useState } from "react"
import {
  BookOpen,
  Check,
  ChevronLeft,
  Clock,
  GitCommit,
  Lock,
  Maximize2,
  RotateCcw,
  Save,
} from "lucide-react"
import type { JournalEntry } from "@/entities/entry/model/types"
import type { Folder } from "@/entities/folder/model/types"
import type { GitHubCommit } from "@/entities/github/model/types"
import { useArchiveApp } from "@/app/providers/useArchiveApp"
import { can } from "@/shared/lib/permissions"
import { ConfirmModal } from "@/shared/ui/confirm-modal/ConfirmModal"
import { DisconnectBanner } from "@/shared/ui/disconnect-banner/DisconnectBanner"
import { Pill } from "@/shared/ui/pill/Pill"
import { useTodayKey } from "@/app/providers/useToday"
import { useTranslation } from "@/shared/lib/i18n"
import { EditorErrorBoundary } from "@/shared/ui/rich-editor"
import { RetroCommitsSection } from "./RetroCommitsSection"
import { RetroCompletedSection } from "./RetroCompletedSection"
import { RetroDocHead } from "./RetroDocHead"
import { RetroExpandOverlay } from "./RetroExpandOverlay"

// TipTap 에디터는 번들 크기가 크므로 회고록 페이지 진입 시에만 로드
const RichEditor = lazy(() => import("@/shared/ui/rich-editor/ui/RichEditor"))

export interface RetroEditorProps {
  entry: JournalEntry
  completedTodos: { id: string; title: string }[]
  githubConnectedAs: string
  isGithubConnected: boolean
  /** verified emails 캐시 보유 여부. false 면 커밋 0건 시 재연결 안내를 표시한다. */
  hasVerifiedEmails: boolean
  pushTargetRepositoryId: string | null
  /** 폴더 선택기에 쓸 전체 폴더 목록. */
  folders: Folder[]
  /** 폴더 이동. null 이면 루트로 옮긴다. */
  onFolderChange: (folderId: string | null) => void
  onUpdate: (patch: Partial<Pick<JournalEntry, "title" | "content">>) => void
  onSave: () => void
  /** AI 요약(isSummary) 편집 해제 — 확인 후 AI 원본으로 되돌린다. */
  onRevertSummary?: () => void
  /** 갤러리로 돌아가기 (2화면 네비게이션). */
  onBack: () => void
}

export function RetroEditor({
  entry,
  completedTodos,
  githubConnectedAs,
  isGithubConnected,
  hasVerifiedEmails,
  pushTargetRepositoryId,
  folders,
  onFolderChange,
  onUpdate,
  onSave,
  onRevertSummary,
  onBack,
}: RetroEditorProps) {
  const { t } = useTranslation()
  const { state, loadCommits, pushRetrospective, pushNotification } = useArchiveApp()
  const isGithubEnabled = can(state.settings.accountType, "github")
  const todayDateKey = useTodayKey()

  // 커밋 섹션은 모든 일간 회고에 표시 (오늘 + 과거 날짜 모두)
  const isDailyEntry = entry.retroType === "daily"
  // 오늘 여부 — 제목·빈 상태 문구 구분에 사용
  const isTodayDaily = isDailyEntry && entry.dateKey === todayDateKey

  // ─── 커밋 로드 (로컬 state — entry 별 독립 관리) ──────────────────────────
  // loadCommits 가 결과를 직접 반환하므로, 전역 state 를 거치지 않고 이 컴포넌트
  // 인스턴스(key=entry.id 로 재마운트)에 격리된 커밋 목록을 유지한다.
  // → 다른 날짜 회고를 열어도 오늘 커밋이 덮어쓰이지 않는다.
  const [commits, setCommits] = useState<GitHubCommit[]>([])
  const [loadingCommits, setLoadingCommits] = useState(false)

  // 일간 회고를 열 때 자동으로 해당 날짜 커밋 1회 로드 (오늘 + 과거 모두)
  const commitsLoadedRef = useRef(false)
  useEffect(() => {
    if (!isDailyEntry || !isGithubConnected) return
    if (commitsLoadedRef.current) return
    commitsLoadedRef.current = true
    // 커밋 로드(외부 API) 시작 시 로딩 플래그 표시 — 데이터 페치 표준 패턴이라 예외 처리.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoadingCommits(true)
    void loadCommits(entry.dateKey)
      .then(setCommits)
      .finally(() => setLoadingCommits(false))
  }, [isDailyEntry, isGithubConnected, entry.dateKey, loadCommits])

  const handleRefreshCommits = () => {
    setLoadingCommits(true)
    void loadCommits(entry.dateKey)
      .then(setCommits)
      .finally(() => setLoadingCommits(false))
  }

  // ─── Push ──────────────────────────────────────────────────────────────────
  const [pushing, setPushing] = useState(false)

  const handlePush = async () => {
    if (!isGithubConnected || !pushTargetRepositoryId) return
    setPushing(true)
    const result = await pushRetrospective(
      entry.retroType,
      entry.dateKey,
      entry.content,
    )
    setPushing(false)
    if (result.ok) {
      onSave() // synced 마킹
      pushNotification("success", t("retro.editor.pushSuccess"), result.path, {
        category: "sync",
      })
    } else {
      pushNotification("warning", t("retro.editor.pushFailed"), result.error, {
        category: "sync",
      })
    }
  }

  // ─── 확장 모드 ─────────────────────────────────────────────────────────────
  const [expanded, setExpanded] = useState(false)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (
        (e.ctrlKey || e.metaKey) &&
        e.shiftKey &&
        e.key.toLowerCase() === "f"
      ) {
        e.preventDefault()
        setExpanded((v) => !v)
        return
      }
      if (expanded && e.key === "Escape") {
        e.preventDefault()
        setExpanded(false)
      }
    }
    document.addEventListener("keydown", onKey)
    return () => document.removeEventListener("keydown", onKey)
  }, [expanded])

  useEffect(() => {
    if (!expanded) return
    const prev = document.body.style.overflow
    document.body.style.overflow = "hidden"
    return () => {
      document.body.style.overflow = prev
    }
  }, [expanded])

  const canPush = isGithubConnected && !!pushTargetRepositoryId

  // ─── AI 요약 되돌리기(편집 해제 → AI 원본 복귀) ────────────────────────────
  const [revertConfirmOpen, setRevertConfirmOpen] = useState(false)

  return (
    <article>
      <button type="button" className="retro-back-link" onClick={onBack}>
        <ChevronLeft size={15} />
        {t("retro.gallery.backToList")}
      </button>

      <div className="retro-doc">
        <div className="retro-doc-main">
          <RetroDocHead
            entry={entry}
            folders={folders}
            onTitleChange={(title) => onUpdate({ title })}
            onFolderChange={onFolderChange}
          />

          {isGithubEnabled && !isGithubConnected ? (
            <DisconnectBanner message={t("retro.github.notConnected")} />
          ) : isGithubEnabled && !pushTargetRepositoryId ? (
            <DisconnectBanner message={t("settings.github.pushTargetHint")} />
          ) : null}

          {/* 일반 모드 */}
          {!expanded && (
            <>
              {/* 완료된 할 일 — 일간 회고에서만 표시 */}
              {isDailyEntry && <RetroCompletedSection todos={completedTodos} />}

              {/* 커밋 기록 (개발자 계정 + 일간 회고 + GitHub 연결 시 표시) */}
              {isGithubEnabled && isGithubConnected && isDailyEntry ? (
                <RetroCommitsSection
                  commits={commits}
                  loading={loadingCommits}
                  onRefresh={handleRefreshCommits}
                  githubConnectedAs={githubConnectedAs}
                  hasVerifiedEmails={hasVerifiedEmails}
                  isToday={isTodayDaily}
                />
              ) : null}

              {/* 미완성 요약(GET /entries/paginated placeholder) 안내 배너 */}
              {entry.isSummary && entry.status && entry.status !== "completed" ? (
                <div
                  style={{
                    padding: "10px 14px",
                    marginBottom: 12,
                    borderRadius: "var(--r-sm)",
                    background: "var(--color-tile-3)",
                    fontSize: 16,
                    color: "var(--color-body-muted)",
                  }}>
                  {entry.status === "failed"
                    ? t("retro.summary.statusFailed")
                    : t("retro.summary.statusPending")}
                </div>
              ) : null}

              {/* 회고 본문 — AI 요약(isSummary)도 편집 가능(PATCH /summaries/{id}) */}
              <section className="section-card section-card--retro-body">
                {!entry.isSummary && (
                  <div className="section-card-head">
                    <div className="avatar avatar-sm avatar-tile">
                      <BookOpen size={14} />
                    </div>
                    <p className="section-card-title">
                      {t("retro.editor.learned")}
                    </p>
                  </div>
                )}
                <EditorErrorBoundary
                  fallback={(error) => (
                    <div
                      style={{
                        padding: 14,
                        fontSize: 16,
                        color: "var(--color-warn, #d9a23a)",
                        background: "var(--color-tile-3)",
                        borderRadius: "var(--r-sm)",
                        fontFamily: "var(--font-mono, monospace)",
                        whiteSpace: "pre-wrap",
                      }}>
                      <strong>에디터를 불러오지 못했습니다.</strong>
                      {"\n"}
                      {error.message}
                    </div>
                  )}>
                  <Suspense
                    fallback={
                      <div
                        style={{
                          minHeight: 260,
                          padding: 12,
                          fontSize: 16,
                          color: "var(--color-body-muted)",
                        }}>
                        에디터 로딩 중...
                      </div>
                    }>
                    <RichEditor
                      key={entry.id}
                      value={entry.content}
                      placeholder={t("retro.editor.learnedPlaceholder")}
                      onChange={(md) => onUpdate({ content: md })}
                      spellCheck={state.settings.spellCheck}
                    />
                  </Suspense>
                </EditorErrorBoundary>
              </section>
            </>
          )}
        </div>

        <aside className="retro-doc-rail">
          <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
            {/* 자동 저장 안내 */}
            <span
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 4,
                fontSize: 12,
                color: "var(--color-body-muted)",
              }}>
              <Save size={11} />
              {t("retro.editor.autoSaved")}
            </span>

            {/* AI 요약 되돌리기(편집 해제 → AI 원본 복귀) — 요약 항목에만 노출 */}
            {entry.isSummary && onRevertSummary ? (
              <button
                type="button"
                className="btn btn-utility"
                onClick={() => setRevertConfirmOpen(true)}
                style={{ padding: "6px 12px", fontSize: 12 }}
                title={t("retro.summary.revert")}>
                <RotateCcw size={12} />
                {t("retro.summary.revert")}
              </button>
            ) : null}

            {/* 확장 버튼 */}
            <button
              type="button"
              className="retro-expand-btn"
              onClick={() => setExpanded(true)}
              aria-label="회고록 확장"
              title="회고록 확장 (Ctrl+Shift+F)">
              <Maximize2 size={14} />
            </button>

            {isGithubEnabled && (
              <>
                {isGithubConnected ? (
                  entry.synced ? (
                    <Pill tone="green">
                      <Check size={10} /> {t("retro.editor.synced")}
                    </Pill>
                  ) : (
                    <Pill tone="warn">
                      <Clock size={10} /> {t("retro.editor.pending")}
                    </Pill>
                  )
                ) : (
                  <Pill tone="ghost">
                    <Lock size={10} /> {t("settings.github.notConnected")}
                  </Pill>
                )}

                {/* Push 버튼 */}
                <button
                  type="button"
                  onClick={() => void handlePush()}
                  className="btn btn-primary"
                  style={{ padding: "10px 22px" }}
                  disabled={!canPush || pushing}
                  title={
                    !isGithubConnected
                      ? t("retro.github.connectFromSettings")
                      : !pushTargetRepositoryId
                        ? t("settings.github.pushTargetHint")
                        : ""
                  }>
                  <GitCommit size={14} />
                  {pushing ? t("retro.editor.pushing") : t("retro.editor.save")}
                </button>
              </>
            )}
          </div>
        </aside>
      </div>

      {/* 확장 모드 — Portal (Notion 스타일 목차 포함) */}
      {expanded ? (
        <RetroExpandOverlay
          entry={entry}
          onUpdate={onUpdate}
          onClose={() => setExpanded(false)}
          spellCheck={state.settings.spellCheck}
        />
      ) : null}

      {/* AI 요약 되돌리기 확인 */}
      {revertConfirmOpen ? (
        <ConfirmModal
          open
          title={t("retro.summary.revertConfirmTitle")}
          message={t("retro.summary.revertConfirmMessage")}
          confirmLabel={t("retro.summary.revertConfirm")}
          cancelLabel={t("retro.summary.revertCancel")}
          onConfirm={() => {
            setRevertConfirmOpen(false)
            onRevertSummary?.()
          }}
          onCancel={() => setRevertConfirmOpen(false)}
        />
      ) : null}
    </article>
  )
}
