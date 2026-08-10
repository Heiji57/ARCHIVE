/**
 * 태그는 자유 문자열이므로 색상은 고정 매핑이 아니라 태그명 해시 → 팔레트로
 * 결정적(deterministic)으로 배정한다. 같은 태그는 항상 같은 색을 받는다.
 * 팔레트는 다크 테마에 어울리는 절제된 색조로 구성(차트 한정 다색 허용).
 */
const TAG_PALETTE = [
  "#5e6ad2", // lavender-blue (primary accent)
  "#27a644", // green
  "#3fb0c4", // teal
  "#9a6ad2", // purple
  "#d9a23a", // amber
  "#d0563f", // terracotta
  "#5f8fd0", // steel blue
  "#c45f9a", // muted magenta
];

export function tagColor(tag: string): string {
  let h = 0;
  for (let i = 0; i < tag.length; i += 1) {
    h = (h * 31 + tag.charCodeAt(i)) >>> 0;
  }
  return TAG_PALETTE[h % TAG_PALETTE.length];
}
