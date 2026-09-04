import { useEffect, useMemo } from "react";
import { useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { Link } from "@tiptap/extension-link";
import { Placeholder } from "@tiptap/extension-placeholder";
import { TaskItem } from "@tiptap/extension-task-item";
import { TaskList } from "@tiptap/extension-task-list";
import {
  Table,
  TableCell,
  TableHeader,
  TableRow,
} from "@tiptap/extension-table";
import {
  Callout,
  DragSelect,
  SlashCommandExtension,
  ToggleBody,
  ToggleNode,
  ToggleSummary,
} from "./extensions";
import { htmlToMarkdown, markdownToHtml } from "./markdown";

interface Options {
  value: string;
  placeholder?: string;
  onChange?: (markdown: string) => void;
  /** false 면 읽기 전용 모드 (슬래시 메뉴·드래그 선택 비활성화). 기본 true. */
  editable?: boolean;
  /** 브라우저 맞춤법 검사(빨간 밑줄) 표시 여부. 기본 true. */
  spellCheck?: boolean;
}

/**
 * TipTap 에디터 인스턴스 생성 + 외부 value 동기화.
 * (확장 등록·콘텐츠 변환 등 에디터 설정 로직을 컴포넌트에서 분리)
 */
export function useRichEditorInstance({
  value,
  placeholder,
  onChange,
  editable = true,
  spellCheck = true,
}: Options) {
  // Tiptap 은 deps=[] 일 때 매 렌더마다 options 를 이전 값과 얕게 비교해 바뀐 것만
  // setOptions 로 반영한다(object 는 참조 비교) — 매 렌더 새 객체를 넘기면 값이
  // 안 바뀌어도 매번 재적용되므로, spellCheck 가 실제로 바뀔 때만 참조가 바뀌게 memo.
  const editorProps = useMemo(
    () => ({ attributes: { spellcheck: String(spellCheck) } }),
    [spellCheck],
  );

  const editor = useEditor({
    editorProps,
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3, 4, 5] },
      }),
      Placeholder.configure({
        placeholder: placeholder ?? "내용을 입력하거나 / 를 눌러 블록 선택...",
      }),
      Table.configure({
        resizable: false,
        HTMLAttributes: { class: "rich-table" },
      }),
      TableRow,
      TableHeader,
      TableCell,
      Link.configure({
        openOnClick: false,
        HTMLAttributes: { rel: "noopener noreferrer" },
      }),
      TaskList,
      TaskItem.configure({ nested: true }),
      Callout,
      ToggleNode,
      ToggleSummary,
      ToggleBody,
      ...(editable ? [SlashCommandExtension, DragSelect] : []),
    ],
    content: markdownToHtml(value),
    editable,
    autofocus: false,
    // React 19 + lazy 마운트 시 ProseMirror 뷰가 렌더 도중 생성되어
    // 레이아웃 확정 전에 측정/페인트되는 레이스를 피한다(뷰를 effect에서 생성).
    immediatelyRender: false,
    onUpdate: ({ editor: ed }) => {
      onChange?.(htmlToMarkdown(ed.getHTML()));
    },
  });

  // 외부 value 변경 시 동기화
  useEffect(() => {
    if (!editor) return;
    const currentMd = htmlToMarkdown(editor.getHTML());
    if (currentMd !== value) {
      editor.commands.setContent(markdownToHtml(value));
    }
  }, [value, editor]);

  // 마운트 직후 한 프레임 뒤 뷰를 강제로 재렌더 → lazy 로드로 인해
  // "리사이즈/재선택 전까지 안 보이는" 페인트 레이스를 방지.
  useEffect(() => {
    if (!editor) return;
    const raf = requestAnimationFrame(() => {
      if (!editor.isDestroyed) {
        editor.view.dispatch(editor.state.tr); // no-op 트랜잭션 → 뷰 재측정/재페인트
      }
    });
    return () => cancelAnimationFrame(raf);
  }, [editor]);

  return editor;
}
