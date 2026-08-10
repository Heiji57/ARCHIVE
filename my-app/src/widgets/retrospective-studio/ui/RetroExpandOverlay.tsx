import { lazy, Suspense, useMemo, useRef } from "react"
import { createPortal } from "react-dom"
import { Minimize2, X } from "lucide-react"
import type { JournalEntry } from "@/entities/entry/model/types"
import { useTranslation } from "@/shared/lib/i18n"
import { EditorErrorBoundary } from "@/shared/ui/rich-editor"
import { extractMarkdownHeadings } from "../model/extractMarkdownHeadings"

// RetroEditor 와 동일한 lazy 청크를 공유한다 (중복 로드 없음).
const RichEditor = lazy(() => import("@/shared/ui/rich-editor/ui/RichEditor"))

export interface RetroExpandOverlayProps {
  entry: JournalEntry
  onUpdate: (patch: Partial<Pick<JournalEntry, "title" | "content">>) => void
  onClose: () => void
  /** 브라우저 맞춤법 검사(빨간 밑줄) 표시 여부. 기본 true. */
  spellCheck?: boolean
}

/**
 * 회고 확장(전체화면) 모드 — Portal 오버레이.
 * 본문 오른쪽에 Notion 스타일 목차(마크다운 헤딩 기반)를 표시하고,
 * 클릭 시 해당 제목이 화면 세로 중앙에 오도록 스크롤한다.
 */
export function RetroExpandOverlay({
  entry,
  onUpdate,
  onClose,
  spellCheck = true,
}: RetroExpandOverlayProps) {
  const { t } = useTranslation()

  // 마크다운 헤딩을 뽑아 렌더된 RichEditor DOM 의 h1~h6 와 같은 순서로 매칭한다.
  const headings = useMemo(
    () => extractMarkdownHeadings(entry.content),
    [entry.content],
  )
  const mainRef = useRef<HTMLDivElement | null>(null)
  const scrollToHeading = (index: number) => {
    const headingEls =
      mainRef.current?.querySelectorAll("h1, h2, h3, h4, h5, h6") ?? []
    headingEls[index]?.scrollIntoView({ behavior: "smooth", block: "center" })
  }

  return createPortal(
    <div
      className="retro-expand-overlay"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}>
      <div className="retro-expand-card">
        <div className="retro-expand-toolbar">
          <span className="retro-expand-hint">Esc 또는 Ctrl+Shift+F 로 닫기</span>
          <button
            type="button"
            className="retro-expand-close"
            onClick={onClose}
            aria-label="확장 닫기"
            title="닫기 (Esc)">
            <Minimize2 size={14} />
            <X size={16} />
          </button>
        </div>
        <div className="retro-expand-body">
          <input
            value={entry.title}
            onChange={(e) => onUpdate({ title: e.target.value })}
            readOnly={entry.isSummary}
            title={entry.isSummary ? t("retro.summary.titleReadOnly") : undefined}
            placeholder={t("retro.editor.titlePlaceholder")}
            className="retro-title-input"
          />
          <div className="retro-expand-content-row">
            <div className="retro-expand-main" ref={mainRef}>
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
                    value={entry.content}
                    placeholder={t("retro.editor.learnedPlaceholder")}
                    onChange={(md) => onUpdate({ content: md })}
                    spellCheck={spellCheck}
                  />
                </Suspense>
              </EditorErrorBoundary>
            </div>

            {/* Notion 스타일 목차 — 헤딩이 있을 때만 렌더 */}
            {headings.length > 0 ? (
              <aside className="retro-expand-toc">
                <p className="retro-expand-toc-title">{t("retro.toc.title")}</p>
                {headings.map((h, i) => (
                  <button
                    key={i}
                    type="button"
                    className="retro-expand-toc-item"
                    style={{ paddingLeft: (h.level - 1) * 10 }}
                    onClick={() => scrollToHeading(i)}>
                    {h.text}
                  </button>
                ))}
              </aside>
            ) : null}
          </div>
        </div>
      </div>
    </div>,
    document.body,
  )
}
