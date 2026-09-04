import type { CalloutType, SlashCommandItem } from "./types";

/**
 * 리치 에디터 정적 데이터 — 콜아웃 메타 + 슬래시 커맨드 목록.
 * (FSD §10: 상수/설정 객체는 model/constants 에 위치)
 */

export const CALLOUT_META: Record<
  CalloutType,
  { emoji: string; tone: string; titleKo: string; titleEn: string }
> = {
  NOTE: { emoji: "💡", tone: "info", titleKo: "정보", titleEn: "Note" },
  TIP: { emoji: "✨", tone: "tip", titleKo: "팁", titleEn: "Tip" },
  IMPORTANT: {
    emoji: "❗",
    tone: "important",
    titleKo: "중요",
    titleEn: "Important",
  },
  WARNING: { emoji: "⚠️", tone: "warning", titleKo: "경고", titleEn: "Warning" },
  CAUTION: { emoji: "🛑", tone: "caution", titleKo: "위험", titleEn: "Caution" },
};

export const SLASH_COMMANDS: SlashCommandItem[] = [
  // ─── 제목 (Heading) ─────────────────────────────────────────────────────
  {
    id: "h1",
    titleKo: "제목 1",
    titleEn: "Heading 1",
    descKo: "큰 섹션 제목",
    descEn: "Big section heading",
    keywords: [
      "h1",
      "heading1",
      "heading 1",
      "제목1",
      "제목 1",
      "큰제목",
      "見出し1",
      "标题1",
    ],
    category: "heading",
    icon: "Heading1",
    execute: (editor, range) =>
      editor
        .chain()
        .focus()
        .deleteRange(range)
        .setNode("heading", { level: 1 })
        .run(),
  },
  {
    id: "h2",
    titleKo: "제목 2",
    titleEn: "Heading 2",
    descKo: "중간 섹션 제목",
    descEn: "Medium section heading",
    keywords: [
      "h2",
      "heading2",
      "heading 2",
      "제목2",
      "제목 2",
      "見出し2",
      "标题2",
    ],
    category: "heading",
    icon: "Heading2",
    execute: (editor, range) =>
      editor
        .chain()
        .focus()
        .deleteRange(range)
        .setNode("heading", { level: 2 })
        .run(),
  },
  {
    id: "h3",
    titleKo: "제목 3",
    titleEn: "Heading 3",
    descKo: "작은 섹션 제목",
    descEn: "Small section heading",
    keywords: [
      "h3",
      "heading3",
      "heading 3",
      "제목3",
      "제목 3",
      "見出し3",
      "标题3",
    ],
    category: "heading",
    icon: "Heading3",
    execute: (editor, range) =>
      editor
        .chain()
        .focus()
        .deleteRange(range)
        .setNode("heading", { level: 3 })
        .run(),
  },
  {
    id: "h4",
    titleKo: "제목 4",
    titleEn: "Heading 4",
    descKo: "더 작은 제목",
    descEn: "Smaller heading",
    keywords: [
      "h4",
      "heading4",
      "heading 4",
      "제목4",
      "제목 4",
      "見出し4",
      "标题4",
    ],
    category: "heading",
    icon: "Heading4",
    execute: (editor, range) =>
      editor
        .chain()
        .focus()
        .deleteRange(range)
        .setNode("heading", { level: 4 })
        .run(),
  },
  {
    id: "h5",
    titleKo: "제목 5",
    titleEn: "Heading 5",
    descKo: "가장 작은 제목",
    descEn: "Smallest heading",
    keywords: [
      "h5",
      "heading5",
      "heading 5",
      "제목5",
      "제목 5",
      "見出し5",
      "标题5",
    ],
    category: "heading",
    icon: "Heading5",
    execute: (editor, range) =>
      editor
        .chain()
        .focus()
        .deleteRange(range)
        .setNode("heading", { level: 5 })
        .run(),
  },

  // ─── 리스트 (Lists) ─────────────────────────────────────────────────────
  {
    id: "bullet",
    titleKo: "글머리 기호",
    titleEn: "Bullet list",
    descKo: "점으로 구분된 목록",
    descEn: "Dotted list",
    keywords: [
      "bullet",
      "list",
      "ul",
      "-",
      "*",
      "글머리",
      "리스트",
      "목록",
      "箇条書き",
      "项目符号",
    ],
    category: "list",
    icon: "List",
    execute: (editor, range) =>
      editor.chain().focus().deleteRange(range).toggleBulletList().run(),
  },
  {
    id: "task",
    titleKo: "할 일 체크박스",
    titleEn: "To-do list",
    descKo: "체크박스로 표시하는 목록",
    descEn: "Checkbox list",
    keywords: [
      "task",
      "todo",
      "check",
      "checkbox",
      "할일",
      "체크",
      "체크박스",
      "タスク",
      "チェック",
      "任务",
      "清单",
    ],
    category: "list",
    icon: "ListChecks",
    execute: (editor, range) =>
      editor.chain().focus().deleteRange(range).toggleTaskList().run(),
  },
  {
    id: "numbered",
    titleKo: "번호 매기기",
    titleEn: "Numbered list",
    descKo: "1, 2, 3 순서 목록",
    descEn: "Ordered numbered list",
    keywords: [
      "numbered",
      "ol",
      "number",
      "1",
      "번호",
      "숫자",
      "순서",
      "番号",
      "编号",
    ],
    category: "list",
    icon: "ListOrdered",
    execute: (editor, range) =>
      editor.chain().focus().deleteRange(range).toggleOrderedList().run(),
  },
  {
    id: "toggle",
    titleKo: "토글 목록",
    titleEn: "Toggle list",
    descKo: "펼치고 접을 수 있는 목록 (>>+공백 단축키)",
    descEn: "Collapsible toggle list",
    keywords: ["toggle", "details", "fold", ">", ">>", "토글", "접기", "トグル", "折叠"],
    category: "list",
    icon: "ChevronRight",
    execute: (editor, range) =>
      editor.chain().focus().deleteRange(range).setToggle().run(),
  },

  // ─── 블록 (Block) ───────────────────────────────────────────────────────
  {
    id: "quote",
    titleKo: "인용",
    titleEn: "Quote",
    descKo: "인용문 블록",
    descEn: "Blockquote",
    keywords: ["quote", "blockquote", "인용", "引用", "引用"],
    category: "block",
    icon: "Quote",
    execute: (editor, range) =>
      editor.chain().focus().deleteRange(range).toggleBlockquote().run(),
  },
  {
    id: "callout",
    titleKo: "콜아웃",
    titleEn: "Callout",
    descKo: "강조 카드 (정보/팁/경고 등)",
    descEn: "Highlight card (info / tip / warning)",
    keywords: [
      "callout",
      "note",
      "alert",
      "admonition",
      "콜아웃",
      "알림",
      "강조",
      "コールアウト",
      "标注",
    ],
    category: "block",
    icon: "Lightbulb",
    execute: (editor, range) =>
      editor
        .chain()
        .focus()
        .deleteRange(range)
        .setCallout({ type: "NOTE" })
        .run(),
  },
  {
    id: "table",
    titleKo: "표",
    titleEn: "Table",
    descKo: "2×2 표 삽입 (행/열 추가 가능)",
    descEn: "Insert a 2×2 table (expandable)",
    keywords: ["table", "표", "テーブル", "表格", "grid"],
    category: "block",
    icon: "Table",
    execute: (editor, range) =>
      editor
        .chain()
        .focus()
        .deleteRange(range)
        .insertTable({ rows: 2, cols: 2, withHeaderRow: true })
        .run(),
  },
  {
    id: "code",
    titleKo: "코드 블록",
    titleEn: "Code block",
    descKo: "코드 작성 영역",
    descEn: "Code writing block",
    keywords: [
      "code",
      "codeblock",
      "pre",
      "코드",
      "코드블록",
      "코드작성",
      "コード",
      "代码",
    ],
    category: "block",
    icon: "Code2",
    execute: (editor, range) =>
      editor.chain().focus().deleteRange(range).toggleCodeBlock().run(),
  },
  {
    id: "divider",
    titleKo: "구분선",
    titleEn: "Divider",
    descKo: "수평 구분선 (/-- 단축키)",
    descEn: "Horizontal divider (/-- shortcut)",
    keywords: ["divider", "hr", "separator", "--", "구분", "구분선", "区切り", "分隔"],
    category: "block",
    icon: "Minus",
    execute: (editor, range) =>
      editor.chain().focus().deleteRange(range).setHorizontalRule().run(),
  },
];
