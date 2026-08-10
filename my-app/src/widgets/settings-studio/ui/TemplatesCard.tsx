import { useEffect, useState } from "react";
import { CheckCircle2, Circle, FileText, Plus, Trash2 } from "lucide-react";
import type { RetrospectiveType } from "@/entities/entry/model/types";
import type { RetroTemplate } from "@/entities/template";
import { useArchiveApp } from "@/app/providers/useArchiveApp";
import { isApiError } from "@/shared/api/errors";
import {
  type SummaryTemplate,
  apiListSummaryTemplates,
  apiCreateSummaryTemplate,
  apiUpdateSummaryTemplate,
  apiDeleteSummaryTemplate,
  apiSetActiveSummaryTemplate,
} from "@/shared/api";
import { COALESCE_MS, createCoalescingQueue } from "@/shared/lib/coalesce";
import { useLatestRef } from "@/shared/lib/useLatestRef";
import { useTranslation, type TranslateFn, type TranslationKey } from "@/shared/lib/i18n";
import { SettingsCardHeader } from "./SettingsCardHeader";
import { TemplateEditorPanel } from "./TemplateEditorPanel";

type SummaryType = "weekly" | "monthly" | "annual";
type AiRetroType = "weekly" | "monthly" | "yearly";

const RETRO_TO_SUMMARY_TYPE: Record<AiRetroType, SummaryType> = {
  weekly: "weekly",
  monthly: "monthly",
  yearly: "annual",
};

const RETRO_TYPES: RetrospectiveType[] = ["daily", "weekly", "monthly", "yearly"];
const AI_RETRO_TYPES = new Set<RetrospectiveType>(["weekly", "monthly", "yearly"]);

const TYPE_LABEL_KEY: Record<RetrospectiveType, TranslationKey> = {
  daily: "retro.filter.daily",
  weekly: "retro.filter.weekly",
  monthly: "retro.filter.monthly",
  yearly: "retro.filter.yearly",
};

const DEFAULT_NAME_KEY: Record<RetrospectiveType, TranslationKey> = {
  daily: "settings.templates.defaultName.daily",
  weekly: "settings.templates.defaultName.weekly",
  monthly: "settings.templates.defaultName.monthly",
  yearly: "settings.templates.defaultName.yearly",
};

function templateDisplayName(tpl: RetroTemplate, t: TranslateFn): string {
  if (tpl.isDefault) return t(DEFAULT_NAME_KEY[tpl.retroType]);
  return tpl.name;
}

/** SummaryTemplate → RetroTemplate 어댑터 (TemplateEditorPanel 호환용). */
function summaryToRetro(tpl: SummaryTemplate): RetroTemplate {
  return {
    id: tpl.id,
    name: tpl.name,
    retroType: "weekly",
    content: tpl.content,
    isDefault: false,
    isActive: tpl.isActive,
    createdAt: tpl.createdAt,
    updatedAt: tpl.updatedAt ?? tpl.createdAt,
  };
}

// ─── AI 요약 템플릿 탭 (weekly / monthly / yearly) ───────────────────────────

interface SummaryTemplateTabProps {
  retroType: AiRetroType;
}

function SummaryTemplateTab({ retroType }: SummaryTemplateTabProps) {
  const { t } = useTranslation();
  const { state, pushNotification } = useArchiveApp();
  const summaryType = RETRO_TO_SUMMARY_TYPE[retroType];
  const typeLabel = t(TYPE_LABEL_KEY[retroType]);

  // pushNotification은 매 렌더마다 새 참조가 생성되므로 latest-ref로 보관해
  // useEffect/큐 콜백 의존성에서 제외한다(콜백에서만 읽음).
  const pushRef = useLatestRef(pushNotification);

  const [templates, setTemplates] = useState<SummaryTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // CoalescingQueue — AppProvider 와 동일한 COALESCE_MS 사용.
  // useState 초기화 함수로 1회만 생성해 안정적 참조를 유지한다.
  // pushRef.current 는 비동기 onError 콜백에서만 읽지만, 린터가 초기화 클로저
  // 전체를 렌더 단계로 보아 오탐하므로 이 한 줄만 예외 처리한다.
  type UpdatePatch = { name?: string; content?: string };
  // eslint-disable-next-line react-hooks/refs
  const [updateQueue] = useState(() =>
    createCoalescingQueue<UpdatePatch>({
      delayMs: COALESCE_MS,
      send: (id, patch) =>
        apiUpdateSummaryTemplate(id, patch).then((updated) => {
          setTemplates((prev) => prev.map((tpl) => (tpl.id === id ? updated : tpl)));
        }),
      onError: (_id, err) => {
        const code = isApiError(err) ? err.code : "UNKNOWN";
        pushRef.current("warning", "템플릿 저장 실패", `오류 코드: ${code}`);
      },
    }),
  );

  // 탭 전환·페이지 이탈 시 대기 중 변경을 즉시 전송해 유실 방지
  useEffect(() => {
    const flush = () => updateQueue.flushAll();
    const onVisibility = () => { if (document.visibilityState === "hidden") flush(); };
    window.addEventListener("beforeunload", flush);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("beforeunload", flush);
      document.removeEventListener("visibilitychange", onVisibility);
      flush(); // 컴포넌트 언마운트(탭 전환) 시에도 즉시 전송
    };
  }, [updateQueue]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    void apiListSummaryTemplates(summaryType)
      .then((list) => {
        if (cancelled) return;
        setTemplates(list);
        setSelectedId(list.find((tpl) => tpl.isActive)?.id ?? list[0]?.id ?? null);
        setLoading(false);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setLoading(false);
        const code = isApiError(err) ? err.code : "UNKNOWN";
        pushRef.current("warning", "템플릿 로드 실패", `오류 코드: ${code}`);
      });
    return () => {
      cancelled = true;
    };
    // pushRef 는 안정적 ref(useLatestRef)라 재실행에 영향 없음 — summaryType 변경 시에만 재조회.
  }, [summaryType, pushRef]);

  const scheduleUpdate = (id: string, patch: UpdatePatch) => {
    setTemplates((prev) =>
      prev.map((tpl) => (tpl.id === id ? { ...tpl, ...patch } : tpl)),
    );
    updateQueue.enqueue(id, patch);
  };

  const handleAdd = () => {
    if (creating) return;
    const name = t("settings.templates.newName", { type: typeLabel });
    setCreating(true);
    void apiCreateSummaryTemplate(summaryType, name, " ")
      .then((tpl) => {
        setTemplates((prev) => [...prev, tpl]);
        setSelectedId(tpl.id);
      })
      .catch((err: unknown) => {
        const code = isApiError(err) ? err.code : "UNKNOWN";
        if (code === "RETRO_SUMMARY_TEMPLATE_LIMIT_REACHED") {
          pushRef.current("warning", "템플릿 한도 초과", "이 유형의 템플릿을 더 추가할 수 없습니다.");
        } else if (code === "RETRO_SUMMARY_TEMPLATE_NAME_DUPLICATED") {
          pushRef.current("warning", "이름 중복", "같은 이름의 템플릿이 이미 있습니다.");
        } else {
          pushRef.current("warning", "템플릿 생성 실패", `오류 코드: ${code}`);
        }
      })
      .finally(() => setCreating(false));
  };

  const handleDelete = (id: string) => {
    if (selectedId === id) {
      const remaining = templates.find((tpl) => tpl.id !== id);
      setSelectedId(remaining?.id ?? null);
    }
    setTemplates((prev) => prev.filter((tpl) => tpl.id !== id));
    void apiDeleteSummaryTemplate(id).catch((err: unknown) => {
      const code = isApiError(err) ? err.code : "UNKNOWN";
      pushRef.current("warning", "삭제 실패", `오류 코드: ${code}`);
      void apiListSummaryTemplates(summaryType).then(setTemplates).catch(() => {});
    });
  };

  const handleSetActive = (id: string) => {
    const tpl = templates.find((t) => t.id === id);
    const newActiveId = tpl?.isActive ? null : id;
    setTemplates((prev) =>
      prev.map((t) => ({ ...t, isActive: t.id === id ? !tpl?.isActive : false })),
    );
    void apiSetActiveSummaryTemplate(summaryType, newActiveId).catch((err: unknown) => {
      const code = isApiError(err) ? err.code : "UNKNOWN";
      pushRef.current("warning", "설정 실패", `오류 코드: ${code}`);
      void apiListSummaryTemplates(summaryType).then(setTemplates).catch(() => {});
    });
  };

  const selected = templates.find((tpl) => tpl.id === selectedId) ?? null;

  // 로딩 중에도 template-card-body 구조를 유지해 레이아웃 붕괴 방지
  if (loading) {
    return (
      <div className="template-card-body">
        <div className="template-list-panel">
          <p className="template-list-caption" style={{ color: "var(--color-body-muted)" }}>
            로딩 중…
          </p>
        </div>
        <div className="template-editor-panel" />
      </div>
    );
  }

  return (
    <div className="template-card-body">
      <div className="template-list-panel">
        <p className="template-list-caption">
          {t("settings.templates.aiActiveHint")}
        </p>

        {templates.map((tpl) => (
          <div
            key={tpl.id}
            className="template-list-row"
            data-active={selectedId === tpl.id}
            data-inuse={tpl.isActive}
          >
            <button
              type="button"
              className="template-radio"
              aria-label={t("settings.templates.use")}
              aria-pressed={tpl.isActive}
              onClick={() => handleSetActive(tpl.id)}
              title={t("settings.templates.use")}
            >
              {tpl.isActive ? <CheckCircle2 size={17} /> : <Circle size={17} />}
            </button>

            <button
              type="button"
              className="template-list-name-btn"
              onClick={() => setSelectedId(tpl.id)}
            >
              <span className="template-list-name">{tpl.name}</span>
            </button>

            {tpl.isActive && (
              <span className="pill pill-blue pill-sm">
                {t("settings.templates.inUse")}
              </span>
            )}

            <button
              type="button"
              className="template-delete-btn"
              aria-label={t("common.delete")}
              onClick={() => handleDelete(tpl.id)}
            >
              <Trash2 size={13} />
            </button>
          </div>
        ))}

        <button
          type="button"
          className="template-add-btn"
          onClick={handleAdd}
          disabled={creating}
        >
          <Plus size={14} />
          {creating ? "생성 중…" : t("settings.templates.add")}
        </button>
      </div>

      <div className="template-editor-panel">
        {selected ? (
          <TemplateEditorPanel
            key={selected.id}
            template={summaryToRetro(selected)}
            displayName={selected.name}
            onUpdate={(patch) => scheduleUpdate(selected.id, patch)}
            onReset={() => {}}
            spellCheck={state.settings.spellCheck}
          />
        ) : (
          <p className="template-editor-empty">
            {templates.length === 0
              ? t("settings.templates.aiEmpty")
              : t("settings.templates.selectHint")}
          </p>
        )}
      </div>
    </div>
  );
}

// ─── TemplatesCard ────────────────────────────────────────────────────────────

export function TemplatesCard() {
  const {
    state,
    addTemplate,
    updateTemplate,
    deleteTemplate,
    resetTemplate,
    setActiveTemplate,
  } = useArchiveApp();
  const { t } = useTranslation();

  const [activeType, setActiveType] = useState<RetrospectiveType>("daily");
  const [selectedId, setSelectedId] = useState<string | null>(
    () => state.templates.find((tpl) => tpl.retroType === "daily")?.id ?? null,
  );

  const isAiTab = AI_RETRO_TYPES.has(activeType);
  const templatesForType = state.templates.filter(
    (tpl) => tpl.retroType === activeType,
  );
  const inUseId = state.activeTemplateIds[activeType];
  const selected =
    selectedId != null
      ? (state.templates.find((tpl) => tpl.id === selectedId) ?? null)
      : null;

  const handleTabChange = (type: RetrospectiveType) => {
    setActiveType(type);
    if (type === "daily") {
      setSelectedId(
        state.templates.find((tpl) => tpl.retroType === "daily")?.id ?? null,
      );
    }
  };

  const handleAdd = () => {
    const typeLabel = t(TYPE_LABEL_KEY[activeType]);
    const name = t("settings.templates.newName", { type: typeLabel });
    const tpl = addTemplate(activeType, name, "");
    setSelectedId(tpl.id);
  };

  const handleDelete = (id: string) => {
    if (selectedId === id) {
      const remaining = templatesForType.find((tpl) => tpl.id !== id);
      setSelectedId(remaining?.id ?? null);
    }
    deleteTemplate(id);
  };

  return (
    <section className="settings-card template-card-full">
      <SettingsCardHeader
        icon={<FileText size={20} />}
        iconVariant="primary"
        eyebrow={t("settings.section.templates")}
        title={t("settings.templates.title")}
      />
      <p className="settings-card-description">
        {isAiTab
          ? t("settings.templates.aiDescription")
          : t("settings.templates.description")}
      </p>

      {/* 유형 탭 */}
      <div className="seg template-type-seg" role="tablist">
        {RETRO_TYPES.map((type) => (
          <button
            key={type}
            type="button"
            role="tab"
            className="seg-btn"
            aria-pressed={activeType === type}
            aria-selected={activeType === type}
            onClick={() => handleTabChange(type)}
          >
            {t(TYPE_LABEL_KEY[type])}
          </button>
        ))}
      </div>

      {/* AI 요약 템플릿 탭 (weekly / monthly / yearly) */}
      {isAiTab && (
        <SummaryTemplateTab
          key={activeType}
          retroType={activeType as AiRetroType}
        />
      )}

      {/* 일간 회고 템플릿 탭 (daily only) */}
      {!isAiTab && (
        <div className="template-card-body">
          <div className="template-list-panel">
            <p className="template-list-caption">
              {t("settings.templates.activeHint")}
            </p>

            {templatesForType.map((tpl) => {
              const isInUse = tpl.id === inUseId;
              return (
                <div
                  key={tpl.id}
                  className="template-list-row"
                  data-active={selectedId === tpl.id}
                  data-inuse={isInUse}
                >
                  <button
                    type="button"
                    className="template-radio"
                    aria-label={t("settings.templates.use")}
                    aria-pressed={isInUse}
                    onClick={() => setActiveTemplate(activeType, tpl.id)}
                    title={t("settings.templates.use")}
                  >
                    {isInUse ? (
                      <CheckCircle2 size={17} />
                    ) : (
                      <Circle size={17} />
                    )}
                  </button>

                  <button
                    type="button"
                    className="template-list-name-btn"
                    onClick={() => setSelectedId(tpl.id)}
                  >
                    <span className="template-list-name">
                      {templateDisplayName(tpl, t)}
                    </span>
                  </button>

                  {isInUse && (
                    <span className="pill pill-blue pill-sm">
                      {t("settings.templates.inUse")}
                    </span>
                  )}
                  {!tpl.isDefault && (
                    <button
                      type="button"
                      className="template-delete-btn"
                      aria-label={t("common.delete")}
                      onClick={() => handleDelete(tpl.id)}
                    >
                      <Trash2 size={13} />
                    </button>
                  )}
                </div>
              );
            })}

            <button
              type="button"
              className="template-add-btn"
              onClick={handleAdd}
            >
              <Plus size={14} />
              {t("settings.templates.add")}
            </button>
          </div>

          <div className="template-editor-panel">
            {selected ? (
              <TemplateEditorPanel
                key={selected.id}
                template={selected}
                displayName={templateDisplayName(selected, t)}
                onUpdate={(patch) => updateTemplate(selected.id, patch)}
                onReset={() => resetTemplate(selected.retroType)}
                spellCheck={state.settings.spellCheck}
              />
            ) : (
              <p className="template-editor-empty">
                {t("settings.templates.selectHint")}
              </p>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
