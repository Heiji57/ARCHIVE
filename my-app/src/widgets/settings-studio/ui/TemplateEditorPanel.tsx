import { lazy, Suspense } from "react"
import { RotateCcw, Save } from "lucide-react"
import type { RetroTemplate } from "@/entities/template"
import { EditorErrorBoundary } from "@/shared/ui/rich-editor"
import { useTranslation } from "@/shared/lib/i18n"

// TipTap 에디터는 lazy — 템플릿 카드 열 때만 로드
const RichEditor = lazy(() => import("@/shared/ui/rich-editor/ui/RichEditor"))

export interface TemplateEditorPanelProps {
  template: RetroTemplate
  /** 번역된 표시 이름 (기본 템플릿은 i18n, 사용자 템플릿은 원본). */
  displayName: string
  onUpdate: (patch: Partial<Pick<RetroTemplate, "name" | "content">>) => void
  onReset: () => void
  /** 브라우저 맞춤법 검사(빨간 밑줄) 표시 여부. 기본 true. */
  spellCheck?: boolean
}

export function TemplateEditorPanel({
  template,
  displayName,
  onUpdate,
  onReset,
  spellCheck = true,
}: TemplateEditorPanelProps) {
  const { t } = useTranslation()

  return (
    <div className="template-editor-inner">
      <div className="template-editor-header">
        {template.isDefault ? (
          <p className="template-editor-name-static">{displayName}</p>
        ) : (
          <input
            className="template-name-input"
            value={template.name}
            onChange={(e) => onUpdate({ name: e.target.value })}
            placeholder={t("settings.templates.namePlaceholder")}
          />
        )}
        <div className="template-editor-actions">
          <span className="template-autosave-hint">
            <Save size={11} />
            {t("retro.editor.autoSaved")}
          </span>
          {template.isDefault && (
            <button
              type="button"
              className="btn btn-utility"
              onClick={onReset}
              title={t("settings.templates.reset")}
              style={{ fontSize: 12, padding: "6px 12px" }}>
              <RotateCcw size={12} />
              {t("settings.templates.reset")}
            </button>
          )}
        </div>
      </div>

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
                minHeight: 200,
                padding: 12,
                fontSize: 16,
                color: "var(--color-body-muted)",
              }}>
              에디터 로딩 중...
            </div>
          }>
          <RichEditor
            key={template.id}
            value={template.content}
            placeholder={t("settings.templates.contentPlaceholder")}
            onChange={(md) => onUpdate({ content: md })}
            spellCheck={spellCheck}
          />
        </Suspense>
      </EditorErrorBoundary>
    </div>
  )
}
