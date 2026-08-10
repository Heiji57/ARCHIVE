import { useRef } from "react";
import { EditorContent } from "@tiptap/react";
import { useRichEditorInstance } from "../model/useRichEditorInstance";
import { useSlashPopup } from "../model/useSlashPopup";
import { BlockHandle } from "./block-handle/BlockHandle";
import { BubbleToolbar } from "./BubbleToolbar";
import { DragSelectOverlay, useDragSelect } from "./drag-select";
import { SlashMenuPortal } from "./SlashMenuPortal";
import { TableControls } from "./table-controls/TableControls";

export interface RichEditorProps {
  value: string;
  placeholder?: string;
  onChange?: (markdown: string) => void;
  /** false 면 읽기 전용 모드 — 편집 UI(툴바·슬래시 메뉴·블록 핸들)를 숨긴다. 기본 true. */
  editable?: boolean;
  /** 브라우저 맞춤법 검사(빨간 밑줄) 표시 여부. 기본 true. */
  spellCheck?: boolean;
}

/**
 * 노션 스타일 WYSIWYG 마크다운 에디터.
 *  - 에디터 인스턴스/슬래시 로직은 model 훅에 위임하고, 여기서는 조합만 담당.
 *  - editable={false} 로 읽기 전용 렌더러로도 사용 가능 (AI 요약 표시 등).
 */
export default function RichEditor({
  value,
  placeholder,
  onChange,
  editable = true,
  spellCheck = true,
}: RichEditorProps) {
  const editor = useRichEditorInstance({ value, placeholder, onChange, editable, spellCheck });
  const { popup, menuRef, items, handleSelect } = useSlashPopup(editable ? editor : null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const marquee = useDragSelect(editable ? editor : null, containerRef);

  if (!editor) return null;

  return (
    <div className={`rich-editor${editable ? "" : " rich-editor--readonly"}`} ref={containerRef}>
      <EditorContent editor={editor} className="rich-editor-content" />
      {editable && <BubbleToolbar editor={editor} />}
      {editable && <BlockHandle editor={editor} />}
      {editable && <TableControls editor={editor} />}
      {editable && <DragSelectOverlay rect={marquee} />}
      {editable && popup.open && popup.rect ? (
        <SlashMenuPortal
          rect={popup.rect}
          items={items}
          onSelect={handleSelect}
          menuRef={menuRef}
        />
      ) : null}
    </div>
  );
}
