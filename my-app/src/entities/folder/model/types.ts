export interface Folder {
  id: string;
  name: string;
  parentFolderId: string | null;
  /** 이 폴더의 직계 하위 폴더 개수. */
  folderCount: number;
  /** 이 폴더에 직접 속한 회고록 개수(daily+weekly+monthly+yearly 합산). */
  entryCount: number;
  createdAt: string;
  updatedAt: string | null;
}

/**
 * 경로 조립(id → 이름 → 조상 사슬)에만 쓰이는 폴더의 최소 식별 정보.
 * GET /folders 응답이 이 모양이고, 데모 폴백의 Folder[] 도 구조적으로 여기에
 * 대입된다 — 개수·타임스탬프를 요구하지 않는 것이 요점이다.
 */
export type FolderSummary = Pick<Folder, "id" | "name" | "parentFolderId">;
