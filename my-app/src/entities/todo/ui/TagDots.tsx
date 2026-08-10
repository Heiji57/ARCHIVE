import { tagColor } from "@/entities/todo/lib/tagColor";

export interface TagDotsProps {
  tags: string[];
}

/**
 * 태그를 작은 색점으로만 표시 — 캘린더(월/주/일 뷰)처럼 텍스트 칩을 넣을 공간이
 * 없는 곳에서 태그 존재만 눈에 띄게 알린다. hover 시 title 로 태그명 확인 가능.
 */
export function TagDots({ tags }: TagDotsProps) {
  if (tags.length === 0) return null;
  return (
    <span className="tag-dots">
      {tags.map((tag) => (
        <span
          key={tag}
          className="tag-dot"
          style={{ background: tagColor(tag) }}
          title={tag}
        />
      ))}
    </span>
  );
}
