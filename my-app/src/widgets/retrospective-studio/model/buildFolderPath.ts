import type { FolderSummary } from "@/entities/folder/model/types";

/**
 * 폴더 사슬을 거슬러 올라가 순회 깊이 상한. 서버가
 * FOLDER_CIRCULAR_REFERENCE 로 순환을 막지만, 클라이언트 캐시는 이동 중간의
 * 일관되지 않은 상태를 잡을 수 있으므로 무한 루프를 여기서 끊는다.
 */
const MAX_DEPTH = 32;

/**
 * folderId 를 루트→현재 순의 이름 배열로 조립한다.
 *
 *     buildFolderPath(folders, "f_2")  // ["2025 아카이브", "1분기"]
 *     buildFolderPath(folders, null)   // []  (미분류)
 *
 * 사슬 중간에 캐시에 없는 id 가 나오면 거기서 멈추고 알아낸 만큼만 돌려준다 —
 * 부분 경로가 빈 경로보다 낫다. 호출부는 빈 배열을 "미분류"로 해석하면 된다.
 */
export function buildFolderPath(
  folders: FolderSummary[],
  folderId: string | null,
): string[] {
  if (folderId === null) return [];

  const byId = new Map(folders.map((f) => [f.id, f]));
  const path: string[] = [];
  const seen = new Set<string>();

  let cursor: string | null = folderId;
  for (let depth = 0; cursor !== null && depth < MAX_DEPTH; depth++) {
    if (seen.has(cursor)) break; // 순환 — 캐시가 이동 중간 상태를 잡은 경우
    seen.add(cursor);
    const folder = byId.get(cursor);
    if (!folder) break; // 캐시에 없는 조상 — 알아낸 만큼만
    path.unshift(folder.name);
    cursor = folder.parentFolderId;
  }

  return path;
}
