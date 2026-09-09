import { useMemo, useState } from "react";
import { Check, ChevronDown, Plus, Search } from "lucide-react";
import { useTranslation } from "@/shared/lib/i18n";
import { ApiError, getTopicLimitFromError } from "@/shared/api";
import { ConfirmModal } from "@/shared/ui/confirm-modal/ConfirmModal";
import { TextField } from "@/shared/ui/text-field/TextField";
import type { Topic } from "@/entities/topic/model/types";

export interface TopicPillBarProps {
  topics: Topic[];
  loading: boolean;
  error: boolean;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onCreate: (name: string, description: string) => Promise<Topic>;
  requireLoginInDemo: () => boolean;
}

/** 8개 초과일 때만 검색·드로어를 노출(결정: 한 줄 고정 · 줄바꿈 없음). */
const SEARCH_THRESHOLD = 8;

function matches(topic: Topic, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return (
    topic.name.toLowerCase().includes(q) ||
    topic.description.toLowerCase().includes(q)
  );
}

export function TopicPillBar({
  topics,
  loading,
  error,
  selectedId,
  onSelect,
  onCreate,
  requireLoginInDemo,
}: TopicPillBarProps) {
  const { t } = useTranslation();
  const [query, setQuery] = useState("");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [formError, setFormError] = useState<string | null>(null);

  const filtered = useMemo(
    () => topics.filter((topic) => matches(topic, query)),
    [topics, query],
  );
  const showSearch = topics.length > SEARCH_THRESHOLD;

  const openCreate = (prefillName = "") => {
    if (requireLoginInDemo()) return;
    setName(prefillName);
    setDescription("");
    setFormError(null);
    setCreating(true);
    setDrawerOpen(false);
  };

  const submitCreate = async () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    try {
      const topic = await onCreate(trimmed, description.trim());
      setCreating(false);
      onSelect(topic.id);
    } catch (e) {
      if (e instanceof ApiError && e.code === "TOPIC_NAME_DUPLICATED") {
        setFormError(t("topic.crud.nameDuplicated"));
      } else if (e instanceof ApiError && e.code === "TOPIC_LIMIT_REACHED") {
        const limit = getTopicLimitFromError(e);
        setFormError(t("topic.crud.limitReached", { limit: limit ?? "" }));
      } else {
        setFormError(t("topic.generate.failed"));
      }
    }
  };

  if (error) {
    return (
      <div className="topic-pill-bar">
        <span className="topic-pill-error">{t("topic.pill.listError")}</span>
      </div>
    );
  }

  if (!loading && topics.length === 0) {
    return (
      <div className="topic-pill-empty">
        <div className="topic-pill-empty-head">
          <button type="button" className="btn btn-primary" onClick={() => openCreate()}>
            <Plus size={14} /> {t("topic.pill.newTopic")}
          </button>
        </div>
        <h3 className="topic-pill-empty-title">{t("topic.pill.emptyTitle")}</h3>
        <p className="topic-pill-empty-desc">{t("topic.pill.emptyDesc")}</p>
        <button type="button" className="btn btn-primary" onClick={() => openCreate()}>
          {t("topic.pill.emptyCta")}
        </button>
        {creating ? (
          <CreateTopicModal
            name={name}
            description={description}
            formError={formError}
            onNameChange={setName}
            onDescriptionChange={setDescription}
            onConfirm={() => void submitCreate()}
            onCancel={() => setCreating(false)}
          />
        ) : null}
      </div>
    );
  }

  return (
    <div className="topic-pill-bar">
      {showSearch ? (
        <div className="topic-pill-search">
          <Search size={14} className="topic-pill-search-icon" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("topic.pill.searchPlaceholder")}
          />
        </div>
      ) : null}

      {/* role="tablist"/"tab"/aria-selected — §3.2 H 접근성 요구. 선택 해제가
          가능한 토글이라 표준 tablist(단일 배타 선택)와 완전히 같은 의미는
          아니지만, 스크린리더에 "탭처럼 전환되는 묶음"이라는 신호를 주기
          위해 스펙이 지정한 role 을 그대로 쓴다. */}
      <div className="topic-pill-row" role="tablist">
        {filtered.map((topic) => (
          <button
            key={topic.id}
            type="button"
            role="tab"
            aria-selected={selectedId === topic.id}
            className="topic-pill"
            data-active={selectedId === topic.id ? "true" : undefined}
            onClick={() => onSelect(selectedId === topic.id ? null : topic.id)}
          >
            {selectedId === topic.id ? <Check size={12} /> : null}
            <span className="topic-pill-name">{topic.name}</span>
            {topic.entryCount != null && topic.todoCount != null ? (
              <span className="topic-pill-count">
                {topic.entryCount + topic.todoCount}
              </span>
            ) : null}
          </button>
        ))}
        <button type="button" className="topic-pill topic-pill-new" onClick={() => openCreate()}>
          <Plus size={12} /> {t("topic.pill.newTopic")}
        </button>
      </div>

      {selectedId ? (
        <button type="button" className="topic-pill-deselect" onClick={() => onSelect(null)}>
          {t("topic.pill.deselect")}
        </button>
      ) : null}

      {showSearch ? (
        <div className="topic-pill-drawer">
          <button
            type="button"
            className="topic-pill-drawer-trigger"
            onClick={() => setDrawerOpen((v) => !v)}
          >
            {t("topic.pill.viewAll", { count: topics.length })} <ChevronDown size={13} />
          </button>
          {drawerOpen ? (
            <>
              <div
                className="topic-pill-drawer-backdrop"
                onClick={() => setDrawerOpen(false)}
              />
              <div className="topic-pill-drawer-panel" role="menu">
                {filtered.length === 0 ? (
                  <div className="topic-pill-drawer-empty">
                    <p>{t("topic.pill.searchEmptyTitle", { query })}</p>
                    <span>{t("topic.pill.searchEmptyHint")}</span>
                    <div className="topic-pill-drawer-empty-actions">
                      <button type="button" onClick={() => openCreate(query)}>
                        {t("topic.pill.searchEmptyCreate", { query })}
                      </button>
                      <button type="button" onClick={() => setQuery("")}>
                        {t("topic.pill.searchClear")}
                      </button>
                    </div>
                  </div>
                ) : (
                  filtered.map((topic) => (
                    <button
                      key={topic.id}
                      type="button"
                      className="topic-pill-drawer-row"
                      onClick={() => {
                        onSelect(topic.id);
                        setDrawerOpen(false);
                      }}
                    >
                      <span>{topic.name}</span>
                      {topic.entryCount != null && topic.todoCount != null ? (
                        <span className="topic-pill-count">
                          {topic.entryCount + topic.todoCount}
                        </span>
                      ) : null}
                    </button>
                  ))
                )}
              </div>
            </>
          ) : null}
        </div>
      ) : null}

      {creating ? (
        <CreateTopicModal
          name={name}
          description={description}
          formError={formError}
          onNameChange={setName}
          onDescriptionChange={setDescription}
          onConfirm={() => void submitCreate()}
          onCancel={() => setCreating(false)}
        />
      ) : null}
    </div>
  );
}

interface CreateTopicModalProps {
  name: string;
  description: string;
  formError: string | null;
  onNameChange: (v: string) => void;
  onDescriptionChange: (v: string) => void;
  onConfirm: () => void;
  onCancel: () => void;
}

function CreateTopicModal({
  name,
  description,
  formError,
  onNameChange,
  onDescriptionChange,
  onConfirm,
  onCancel,
}: CreateTopicModalProps) {
  const { t } = useTranslation();
  return (
    <ConfirmModal
      open
      title={t("topic.crud.title")}
      message={
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <p style={{ margin: 0, fontSize: 12, color: "var(--color-body-muted)" }}>
            {t("topic.crud.subtitle")}
          </p>
          <TextField
            autoFocus
            value={name}
            placeholder={t("topic.crud.namePlaceholder")}
            onChange={(e) => onNameChange(e.target.value)}
            error={formError ?? undefined}
          />
          <TextField
            value={description}
            placeholder={t("topic.crud.descPlaceholder")}
            onChange={(e) => onDescriptionChange(e.target.value)}
          />
        </div>
      }
      confirmLabel={t("common.confirm")}
      cancelLabel={t("common.cancel")}
      onConfirm={onConfirm}
      onCancel={onCancel}
    />
  );
}
