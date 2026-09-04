import { CheckCircle } from "lucide-react"
import { useTranslation } from "@/shared/lib/i18n"

export interface RetroCompletedSectionProps {
  todos: { id: string; title: string }[]
}

/**
 * 일간 회고의 "완료한 작업" 섹션 — 읽기 전용 목록.
 * (할 일에서 끌어오는 액션은 범위에서 제외됨 — 설계문서 결정 10)
 */
export function RetroCompletedSection({ todos }: RetroCompletedSectionProps) {
  const { t } = useTranslation()

  return (
    <section className="retro-doc-section">
      <div className="retro-doc-section-head">
        <h2 className="retro-doc-section-title">{t("retro.editor.completed")}</h2>
        <span className="retro-doc-section-meta">{todos.length}</span>
      </div>

      {todos.length === 0 ? (
        <p className="retro-doc-empty">{t("retro.editor.noCompleted")}</p>
      ) : (
        <div className="retro-doc-list">
          {todos.map((todo) => (
            <div key={todo.id} className="retro-doc-row">
              <span
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "var(--s-xs)",
                  fontSize: 16,
                  color: "var(--color-ink-muted-80)",
                }}>
                <CheckCircle size={14} style={{ color: "var(--color-status-done)" }} />
                {todo.title}
              </span>
              <span />
            </div>
          ))}
        </div>
      )}
    </section>
  )
}
