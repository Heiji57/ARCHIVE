/**
 * 마크다운 최상위 블록 수 — 빈 줄로 구분된 덩어리 개수.
 * 레일의 "본문 블록" 수치에 쓴다(구조화 필드가 없으므로 문단 진행률은 만들 수 없다).
 */
export function countContentBlocks(markdown: string): number {
  return markdown
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter((block) => block.length > 0).length
}
