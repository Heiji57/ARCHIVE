import {
  ChevronRight,
  Code2,
  Heading1,
  Heading2,
  Heading3,
  Heading4,
  Heading5,
  Lightbulb,
  List,
  ListChecks,
  ListOrdered,
  Minus,
  Quote,
  Table as TableIcon,
  type LucideIcon,
} from "lucide-react";

/** SlashCommandItem.icon 문자열 → lucide 아이콘 컴포넌트 매핑 */
export const ICONS: Record<string, LucideIcon> = {
  Heading1,
  Heading2,
  Heading3,
  Heading4,
  Heading5,
  List,
  ListChecks,
  ListOrdered,
  ChevronRight,
  Quote,
  Lightbulb,
  Table: TableIcon,
  Minus,
  Code2,
};

/** 카테고리 그룹 라벨 (다국어) */
export const CATEGORY_LABELS: Record<string, { ko: string; en: string }> = {
  heading: { ko: "제목", en: "Headings" },
  list: { ko: "목록", en: "Lists" },
  block: { ko: "블록", en: "Blocks" },
  media: { ko: "미디어", en: "Media" },
};

export { Minus as FallbackIcon };
