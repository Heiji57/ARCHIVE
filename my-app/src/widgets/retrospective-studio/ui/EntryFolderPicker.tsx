import { useEffect, useRef, useState } from "react"
import { ChevronDown, Folder as FolderIcon } from "lucide-react"
import type { Folder } from "@/entities/folder/model/types"
import { useTranslation } from "@/shared/lib/i18n"

export interface EntryFolderPickerProps {
  folders: Folder[]
  value: string | null
  onChange: (folderId: string | null) => void
}

/** 폴더 경로를 "부모 / 자식" 으로 만든다. 손상된 데이터의 순환 참조는 깊이 20에서 끊는다. */
function folderPath(folders: Folder[], id: string): string {
  const names: string[] = []
  let currentId: string | null = id
  let guard = 0
  while (currentId && guard < 20) {
    const target: string = currentId
    const found: Folder | undefined = folders.find((f) => f.id === target)
    if (!found) break
    names.unshift(found.name)
    currentId = found.parentFolderId
    guard += 1
  }
  return names.join(" / ")
}

/** 문서 머리의 폴더 선택 드롭다운. 선택 시 회고를 그 폴더로 옮긴다. */
export function EntryFolderPicker({
  folders,
  value,
  onChange,
}: EntryFolderPickerProps) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onDocPointerDown = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false)
    }
    document.addEventListener("mousedown", onDocPointerDown)
    document.addEventListener("keydown", onKey)
    return () => {
      document.removeEventListener("mousedown", onDocPointerDown)
      document.removeEventListener("keydown", onKey)
    }
  }, [open])

  const label = value ? folderPath(folders, value) : t("retro.editor.folderNone")

  const pick = (folderId: string | null) => {
    setOpen(false)
    if (folderId !== value) onChange(folderId)
  }

  return (
    <div className="retro-folder-pick" ref={rootRef}>
      <button
        type="button"
        className="retro-folder-pick-btn"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}>
        <FolderIcon size={12} />
        {label}
        <ChevronDown size={12} />
      </button>

      {open ? (
        <div className="retro-folder-pick-menu" role="listbox">
          <button
            type="button"
            role="option"
            aria-selected={value === null}
            className="retro-folder-pick-item"
            data-active={value === null ? "true" : undefined}
            onClick={() => pick(null)}>
            {t("retro.editor.folderNone")}
          </button>
          {folders.map((folder) => (
            <button
              key={folder.id}
              type="button"
              role="option"
              aria-selected={value === folder.id}
              className="retro-folder-pick-item"
              data-active={value === folder.id ? "true" : undefined}
              onClick={() => pick(folder.id)}>
              {folderPath(folders, folder.id)}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  )
}
