import { lazy, Suspense, useState } from "react";
import { Sparkles } from "lucide-react";
import { isApiError } from "@/shared/api";
import { useTranslation } from "@/shared/lib/i18n";
import { EmptyState } from "@/shared/ui/empty-state/EmptyState";
import { EditorErrorBoundary } from "@/shared/ui/rich-editor";
import { ConfirmModal } from "@/shared/ui/confirm-modal/ConfirmModal";
import { formatMonthDayFromDateKey } from "@/shared/lib/date";
import { useTopicDigest } from "../model/useTopicDigest";
import { useTopicStats } from "../model/useTopicStats";
import { TopicSourceListModal } from "./TopicSourceListModal";
import type { Topic } from "@/entities/topic/model/types";

const RichEditor = lazy(() => import("@/shared/ui/rich-editor/ui/RichEditor"));

export interface TopicDocumentProps {
  topic: Topic;
  onUpdate: (
    id: string,
    patch: { name?: string; description?: string },
  ) => Promise<Topic>;
  onDelete: (id: string) => Promise<void>;
  onDeleted: () => void;
  requireLoginInDemo: () => boolean;
}

type SourceModalState = { mode: "candidate" | "reflected" } | null;

export function TopicDocument({
  topic,
  onUpdate,
  onDelete,
  onDeleted,
  requireLoginInDemo,
}: TopicDocumentProps) {
  const { t } = useTranslation();
  const {
    digest,
    loading,
    loadError,
    generating,
    progress,
    generateError,
    stalled,
    generate,
    refetch,
  } = useTopicDigest(topic.id);
  const { stats } = useTopicStats(topic.id);

  const [editingField, setEditingField] = useState<"name" | "description" | null>(null);
  const [draft, setDraft] = useState("");
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [sourceModal, setSourceModal] = useState<SourceModalState>(null);
  const [showPrevious, setShowPrevious] = useState(false);

  const hasContent = Boolean(digest?.content);
  const docState:
    | "loadError"
    | "stalled"
    | "generateError"
    | "generatingFirst"
    | "generatingRegen"
    | "loading"
    | "empty"
    | "completed" =
    loadError
      ? "loadError"
      : stalled && !showPrevious
        ? "stalled"
        : generateError && !showPrevious
          ? "generateError"
          : generating
            ? hasContent
              ? "generatingRegen"
              : "generatingFirst"
            : loading
              ? "loading"
              : hasContent
                ? "completed"
                : "empty";

  const showBanner = docState === "completed" || docState === "generatingRegen";
  // 레일 카드 3개는 상태마다 노출 규칙이 다르다(§3.2 E 매트릭스):
  //  - generatingFirst: 전부 숨김(이 시점엔 stats 가 이미 로드돼 있어도 강제로 숨긴다)
  //  - empty: 소스 카드만(반영시점·태그는 숨김 — 태그는 digest 없이도 stats 로 값이
  //    있을 수 있어서 명시적으로 꺼야 한다)
  //  - completed/generatingRegen/loadError/generateError: "이전 값 있으면 유지" —
  //    아래 개별 카드의 null 체크가 자연스럽게 처리한다(따로 끌 필요 없음)
  const railAllowed =
    docState === "generatingFirst" || docState === "loading"
      ? { reflected: false, source: false, tag: false }
      : docState === "empty"
        ? { reflected: false, source: true, tag: false }
        : { reflected: true, source: true, tag: true };
  const showRail =
    (railAllowed.reflected && digest?.watermarkDateKey != null) ||
    (railAllowed.source && stats != null) ||
    (railAllowed.tag && stats != null && stats.tagCounts.length > 0);

  const [editError, setEditError] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const startEdit = (field: "name" | "description") => {
    if (requireLoginInDemo()) return;
    setDraft(field === "name" ? topic.name : topic.description);
    setEditingField(field);
    setEditError(null);
  };
  const commitEdit = async () => {
    if (!editingField) return;
    const field = editingField;
    const trimmed = draft.trim();
    if (field === "name" && (!trimmed || trimmed === topic.name)) {
      setEditingField(null);
      return;
    }
    if (field === "description" && trimmed === topic.description) {
      setEditingField(null);
      return;
    }
    try {
      await onUpdate(topic.id, field === "name" ? { name: trimmed } : { description: trimmed });
      setEditingField(null);
      setEditError(null);
    } catch (e) {
      setEditError(
        isApiError(e) && e.code === "TOPIC_NAME_DUPLICATED"
          ? t("topic.doc.nameDuplicated")
          : t("topic.generate.failed"),
      );
    }
  };

  const confirmDelete = async () => {
    try {
      await onDelete(topic.id);
      setDeleteOpen(false);
      setDeleteError(null);
      onDeleted();
    } catch {
      setDeleteError(t("topic.generate.failed"));
    }
  };

  const handleGenerate = () => {
    if (requireLoginInDemo()) return;
    setShowPrevious(false);
    generate();
  };

  const totalSourceCount =
    stats != null ? stats.entryCounts.total + stats.todoCounts.total : null;

  return (
    <div className="retro-doc">
      <div className="retro-doc-main topic-doc">
        <div className="topic-doc-header">
          {editingField === "name" ? (
            <input
              autoFocus
              className="topic-doc-title-input"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onBlur={() => void commitEdit()}
              onKeyDown={(e) => {
                if (e.key === "Enter") void commitEdit();
                if (e.key === "Escape") {
                  setEditingField(null);
                  setEditError(null);
                }
              }}
            />
          ) : (
            <button
              type="button"
              className="topic-doc-title topic-doc-title-trigger"
              onClick={() => startEdit("name")}
            >
              {topic.name}
            </button>
          )}
          {editingField === "description" ? (
            <input
              autoFocus
              className="topic-doc-desc-input"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onBlur={() => void commitEdit()}
              onKeyDown={(e) => {
                if (e.key === "Enter") void commitEdit();
                if (e.key === "Escape") {
                  setEditingField(null);
                  setEditError(null);
                }
              }}
            />
          ) : (
            <button
              type="button"
              className="topic-doc-desc topic-doc-desc-trigger"
              onClick={() => startEdit("description")}
            >
              {topic.description || t("topic.doc.editTrigger")}
            </button>
          )}
          {editingField ? (
            <span className="topic-doc-edit-save-hint">{t("topic.doc.editSaveHint")}</span>
          ) : null}
          {editError ? <span className="topic-doc-edit-error">{editError}</span> : null}
          <div className="topic-doc-meta">
            {stats ? (
              <span>
                {t("topic.doc.statsLine", {
                  entries: stats.entryCounts.total,
                  todos: stats.todoCounts.total,
                  tags: stats.tagCountTotal,
                })}
              </span>
            ) : null}
            <span className="topic-doc-edit-hint">{t("topic.doc.editTrigger")}</span>
            <button
              type="button"
              className="topic-doc-delete"
              onClick={() => {
                if (requireLoginInDemo()) return;
                setDeleteOpen(true);
              }}
            >
              {t("topic.doc.delete")}
            </button>
          </div>
        </div>

        {showBanner && digest?.watermarkDateKey ? (
          <div className="retro-doc-banner" data-tone="ai">
            <div>
              <p style={{ margin: 0 }}>
                {t("topic.doc.bannerReflected", {
                  date: formatMonthDayFromDateKey(digest.watermarkDateKey),
                })}
              </p>
              {stats && stats.unreflectedEntryCount > 0 ? (
                <p style={{ margin: "4px 0 0" }}>
                  {t("topic.doc.bannerUnreflected", { count: stats.unreflectedEntryCount })}
                </p>
              ) : null}
            </div>
            <button type="button" className="btn btn-primary" onClick={handleGenerate} disabled={generating}>
              {t("topic.doc.regenerate")}
            </button>
          </div>
        ) : null}

        {docState === "loadError" ? (
          <div className="topic-doc-state">
            <h3>{t("topic.doc.loadErrorTitle")}</h3>
            <p>{t("topic.doc.loadErrorDesc")}</p>
            <div className="topic-doc-state-actions">
              <button type="button" className="btn btn-utility" onClick={refetch}>
                {t("topic.doc.loadErrorRetry")}
              </button>
              <button type="button" className="btn btn-utility" onClick={() => setSourceModal({ mode: "reflected" })}>
                {t("topic.doc.loadErrorViewSourcesOnly")}
              </button>
            </div>
          </div>
        ) : docState === "stalled" ? (
          <div className="topic-doc-state" data-tone="danger">
            <h3>{t("topic.doc.stalledTitle")}</h3>
            <p>{t("topic.doc.stalledDesc")}</p>
            <div className="topic-doc-state-actions">
              <button type="button" className="btn btn-primary" onClick={handleGenerate}>
                {t("topic.doc.stalledRetry")}
              </button>
              {hasContent ? (
                <button type="button" className="btn btn-utility" onClick={() => setShowPrevious(true)}>
                  {t("topic.doc.stalledViewPrevious")}
                </button>
              ) : null}
            </div>
          </div>
        ) : docState === "generateError" ? (
          <div className="topic-doc-state" data-tone="danger">
            <h3>{t("topic.doc.generateErrorTitle")}</h3>
            <p>
              {t("topic.doc.generateErrorDesc", {
                date: digest?.watermarkDateKey
                  ? formatMonthDayFromDateKey(digest.watermarkDateKey)
                  : "",
              })}
            </p>
            <div className="topic-doc-state-actions">
              <button type="button" className="btn btn-primary" onClick={handleGenerate}>
                {t("topic.doc.generateErrorRetry")}
              </button>
              {hasContent ? (
                <button type="button" className="btn btn-utility" onClick={() => setShowPrevious(true)}>
                  {t("topic.doc.generateErrorViewPrevious")}
                </button>
              ) : null}
            </div>
          </div>
        ) : docState === "generatingFirst" || docState === "generatingRegen" ? (
          <div className="topic-doc-state">
            <div className="topic-doc-progress-row">
              <span className="topic-doc-spinner" aria-hidden="true" />
              <span aria-live="polite">
                {progress
                  ? t("topic.doc.generatingProgress", { ...progress })
                  : t("topic.source.loading")}
              </span>
            </div>
            <div
              className="topic-doc-progress-bar"
              role="progressbar"
              aria-valuenow={
                progress ? Math.round((progress.processed / Math.max(1, progress.total)) * 100) : undefined
              }
              aria-valuemin={0}
              aria-valuemax={100}
            >
              <div
                style={{
                  width: progress ? `${(progress.processed / Math.max(1, progress.total)) * 100}%` : "8%",
                }}
              />
            </div>
            <p>{t("topic.doc.generatingHint")}</p>
          </div>
        ) : docState === "loading" ? (
          <EmptyState message={t("topic.source.loading")} minHeight={220} />
        ) : docState === "empty" ? (
          <div className="topic-doc-state">
            <h3>{t("topic.doc.emptyTitle")}</h3>
            <p>
              {t("topic.doc.emptyDesc", {
                entries: stats?.entryCounts.total ?? 0,
                todos: stats?.todoCounts.total ?? 0,
              })}
            </p>
            <div className="topic-doc-state-actions">
              <button type="button" className="btn btn-primary" onClick={handleGenerate}>
                <Sparkles size={14} /> {t("topic.doc.emptyCta")}
              </button>
              {totalSourceCount != null ? (
                <button type="button" className="btn btn-utility" onClick={() => setSourceModal({ mode: "candidate" })}>
                  {t("topic.doc.emptyViewSources", { count: totalSourceCount })}
                </button>
              ) : null}
            </div>
            <span className="topic-doc-hint">{t("topic.doc.emptyHint")}</span>
          </div>
        ) : (
          <EditorErrorBoundary
            fallback={(error) => <div className="topic-doc-error">{error.message}</div>}
          >
            <Suspense fallback={<EmptyState message={t("topic.source.loading")} minHeight={220} />}>
              <RichEditor value={digest?.content ?? ""} editable={false} />
            </Suspense>
          </EditorErrorBoundary>
        )}
      </div>

      {showRail ? (
        <div className="retro-doc-rail">
          {railAllowed.reflected && digest?.watermarkDateKey ? (
            <div className="topic-doc-rail-card">
              <span className="retro-rail-label">{t("topic.doc.railReflectedLabel")}</span>
              <span className="topic-doc-rail-value">
                {t("topic.doc.railReflectedValue", {
                  date: formatMonthDayFromDateKey(digest.watermarkDateKey),
                })}
              </span>
              {stats ? (
                <span className="topic-doc-rail-sub">
                  {t("topic.doc.railUnreflectedCount", { count: stats.unreflectedEntryCount })}
                </span>
              ) : null}
            </div>
          ) : null}
          {railAllowed.source && stats ? (
            <div className="topic-doc-rail-card">
              <span className="retro-rail-label">{t("topic.doc.railSourceLabel")}</span>
              <div className="retro-rail-stat">
                <span>{t("topic.doc.railSourceDaily")}</span>
                <b>{stats.entryCounts.daily}</b>
              </div>
              <div className="retro-rail-stat">
                <span>{t("topic.doc.railSourceWeekly")}</span>
                <b>{stats.entryCounts.weekly}</b>
              </div>
              <div className="retro-rail-stat">
                <span>{t("topic.doc.railSourceTodo")}</span>
                <b>{stats.todoCounts.total}</b>
              </div>
            </div>
          ) : null}
          {railAllowed.tag && stats && stats.tagCounts.length > 0 ? (
            <div className="topic-doc-rail-card">
              <span className="retro-rail-label">{t("topic.doc.railTagLabel")}</span>
              <div className="topic-doc-tag-chips">
                {stats.tagCounts.slice(0, 6).map((tc) => (
                  <span key={tc.tag} className="topic-doc-tag-chip">
                    #{tc.tag} {tc.count}
                  </span>
                ))}
                {stats.tagCountTotal > 6 ? (
                  <span className="topic-doc-tag-chip topic-doc-tag-more">
                    {t("topic.doc.railTagMore", { count: stats.tagCountTotal - 6 })}
                  </span>
                ) : null}
              </div>
            </div>
          ) : null}
        </div>
      ) : null}

      {deleteOpen ? (
        <ConfirmModal
          open
          tone="danger"
          title={t("topic.crud.deleteTitle", { name: topic.name })}
          message={
            <span style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {t("topic.crud.deleteMessage")}
              {deleteError ? <span style={{ color: "var(--color-danger)" }}>{deleteError}</span> : null}
            </span>
          }
          confirmLabel={t("common.delete")}
          cancelLabel={t("common.cancel")}
          onConfirm={() => void confirmDelete()}
          onCancel={() => {
            setDeleteOpen(false);
            setDeleteError(null);
          }}
        />
      ) : null}

      {sourceModal ? (
        <TopicSourceListModal
          topicId={topic.id}
          mode={sourceModal.mode}
          entryCount={stats?.entryCounts.total ?? topic.entryCount}
          todoCount={stats?.todoCounts.total ?? topic.todoCount}
          reflectedDate={digest?.watermarkDateKey ?? null}
          onClose={() => setSourceModal(null)}
          onEditDescription={() => {
            setSourceModal(null);
            startEdit("description");
          }}
        />
      ) : null}
    </div>
  );
}
