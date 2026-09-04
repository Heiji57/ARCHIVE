import type { JournalEntry } from "@/entities/entry/model/types"
import type { Folder } from "@/entities/folder/model/types"
import { formatFullDate, fromDateKey } from "@/shared/lib/date"
import { useTranslation } from "@/shared/lib/i18n"
import { RETRO_LABEL_KEY } from "../model/constants"
import { formatDefaultEntryTitle } from "../model/formatDefaultEntryTitle"

export interface RetroDocHeadProps {
  entry: JournalEntry
  folders: Folder[]
  onTitleChange: (title: string) => void
  onFolderChange: (folderId: string | null) => void
}

/**
 * 문서 머리 — 회고 타입(읽기 전용) · 폴더 · 날짜 · 자유 제목.
 * 타입은 엔트리 생성 후 바꿀 수 없으므로(주간/월간/연간은 AI 요약 엔트리) 세그먼트가
 * 아니라 현재 타입 1개만 표시한다.
 */
export function RetroDocHead({
  entry,
  folders,
  onTitleChange,
  onFolderChange,
}: RetroDocHeadProps) {
  // folders / onFolderChange 는 Task 4(폴더 선택기)에서 실제로 쓰인다. props 시그니처를
  // 지금 확정해 두어야 Task 4 가 컴포넌트 경계를 다시 손대지 않는다.
  void folders
  void onFolderChange

  const { t } = useTranslation()
  const defaultTitle = formatDefaultEntryTitle(t, entry.dateKey, entry.retroType)

  return (
    <header className="retro-doc-head">
      <div className="retro-doc-meta">
        <span className="retro-doc-type">{t(RETRO_LABEL_KEY[entry.retroType])}</span>
        {/* Task 4에서 EntryFolderPicker 로 교체 */}
        <span className="retro-doc-date">
          {formatFullDate(fromDateKey(entry.dateKey))}
        </span>
      </div>

      <input
        className="retro-doc-title"
        value={entry.title}
        readOnly={entry.isSummary}
        title={entry.isSummary ? t("retro.summary.titleReadOnly") : undefined}
        placeholder={defaultTitle}
        onChange={(e) => onTitleChange(e.target.value)}
      />

      {!entry.isSummary ? (
        <p className="retro-doc-hint">
          {t("retro.editor.titleHint", { title: defaultTitle })}
        </p>
      ) : null}
    </header>
  )
}
