import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { useTranslation } from "@/shared/lib/i18n";
import { ApiError, getTopicLimitFromError } from "@/shared/api";
import { ConfirmModal } from "@/shared/ui/confirm-modal/ConfirmModal";
import { TextField } from "@/shared/ui/text-field/TextField";
import { EmptyState } from "@/shared/ui/empty-state/EmptyState";
import { useTopics } from "../model/useTopics";
import type { Topic } from "@/entities/topic/model/types";

export interface TopicSidebarProps {
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  requireLoginInDemo: () => boolean;
}

export function TopicSidebar({
  selectedId,
  onSelect,
  requireLoginInDemo,
}: TopicSidebarProps) {
  const { t } = useTranslation();
  const { topics, loading, error, create, remove } = useTopics();

  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Topic | null>(null);

  const openCreate = () => {
    if (requireLoginInDemo()) return;
    setName("");
    setDescription("");
    setFormError(null);
    setCreating(true);
  };

  const submitCreate = async () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    try {
      const topic = await create(trimmed, description.trim());
      setCreating(false);
      onSelect(topic.id);
    } catch (e) {
      if (e instanceof ApiError && e.code === "TOPIC_NAME_DUPLICATED") {
        setFormError(t("topic.sidebar.nameDuplicated"));
      } else if (e instanceof ApiError && e.code === "TOPIC_LIMIT_REACHED") {
        const limit = getTopicLimitFromError(e);
        setFormError(t("topic.sidebar.limitReached", { limit: limit ?? "" }));
      } else {
        setFormError(t("topic.generate.failed"));
      }
    }
  };

  const confirmDelete = async () => {
    const target = deleteTarget;
    if (!target) return;
    setDeleteTarget(null);
    await remove(target.id);
    // 삭제한 주제가 선택돼 있었다면 선택을 풀어준다 — 그대로 두면 삭제된
    // 주제의 정리 문서 화면이 계속 남거나, 그 주제로 후속 요청이 나갈 수 있다.
    if (target.id === selectedId) onSelect(null);
  };

  return (
    <aside className="topic-sidebar">
      <div className="topic-sidebar-head">
        <button type="button" className="btn btn-primary" onClick={openCreate}>
          <Plus size={14} /> {t("topic.sidebar.newTopic")}
        </button>
      </div>

      {error ? (
        <EmptyState message={t("topic.sidebar.listError")} minHeight={120} />
      ) : loading && topics.length === 0 ? (
        <EmptyState message={t("topic.sidebar.listLoading")} minHeight={120} />
      ) : topics.length === 0 ? (
        <EmptyState message={t("topic.sidebar.emptyTitle")} minHeight={120} />
      ) : (
        <ul className="topic-sidebar-list">
          {topics.map((topic) => (
            <li key={topic.id}>
              <button
                type="button"
                className="topic-card"
                data-active={selectedId === topic.id ? "true" : undefined}
                onClick={() => onSelect(topic.id)}
              >
                <span className="topic-card-name">{topic.name}</span>
                {topic.description ? (
                  <span className="topic-card-desc">{topic.description}</span>
                ) : null}
              </button>
              <button
                type="button"
                className="topic-card-delete"
                aria-label={t("topic.sidebar.deleteTitle")}
                onClick={() => {
                  if (requireLoginInDemo()) return;
                  setDeleteTarget(topic);
                }}
              >
                <Trash2 size={13} />
              </button>
            </li>
          ))}
        </ul>
      )}

      {creating ? (
        <ConfirmModal
          open
          title={t("topic.sidebar.newTopic")}
          message={
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <TextField
                autoFocus
                value={name}
                placeholder={t("topic.sidebar.namePlaceholder")}
                onChange={(e) => setName(e.target.value)}
                error={formError ?? undefined}
              />
              <TextField
                value={description}
                placeholder={t("topic.sidebar.descPlaceholder")}
                onChange={(e) => setDescription(e.target.value)}
              />
            </div>
          }
          confirmLabel={t("common.confirm")}
          cancelLabel={t("common.cancel")}
          onConfirm={() => void submitCreate()}
          onCancel={() => setCreating(false)}
        />
      ) : null}

      {deleteTarget ? (
        <ConfirmModal
          open
          tone="danger"
          title={t("topic.sidebar.deleteTitle")}
          message={
            <span style={{ whiteSpace: "pre-line" }}>
              {t("topic.sidebar.deleteMessage")}
            </span>
          }
          confirmLabel={t("common.delete")}
          cancelLabel={t("common.cancel")}
          onConfirm={() => void confirmDelete()}
          onCancel={() => setDeleteTarget(null)}
        />
      ) : null}
    </aside>
  );
}
