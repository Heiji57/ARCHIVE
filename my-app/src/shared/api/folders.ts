/** 회고록 폴더 도메인 API (중첩 가능한 폴더 정리). */
import type { RetrospectiveType } from "@/entities/entry/model/types";
import type { Folder } from "@/entities/folder/model/types";
import { request } from "./client";
import { toEntry, toFolder } from "./mappers";
import type { components } from "./schema";
import type { EntryPage } from "./entries";

type FolderResponse = components["schemas"]["FolderResponse"];
type FolderContentsResponse = components["schemas"]["FolderContentsResponse"];

export interface FolderContents extends Pick<EntryPage, "total" | "page" | "size"> {
  folders: Folder[];
  entries: EntryPage["items"];
}

/**
 * POST /folders — 폴더 생성. parentFolderId 생략/null 이면 최상위.
 * 같은 부모 아래 이름 중복은 409 FOLDER_NAME_DUPLICATED.
 */
export async function apiCreateFolder(input: {
  name: string;
  parentFolderId?: string | null;
}): Promise<Folder> {
  const res = await request<FolderResponse>("/folders", {
    method: "POST",
    body: input,
  });
  return toFolder(res);
}

/**
 * GET /folders/contents — 폴더 열람(직계 하위 폴더 + 직계 회고록).
 * folderId 생략 시 최상위. retroType 생략 시 4개 타입을 합친 "전체" 뷰.
 *
 * page/size 는 폴더와 회고록을 합친 하나의 시퀀스에 적용된다 —
 * `[폴더: name ASC] ++ [회고록: dateKey DESC]` 에서 폴더 블록이 먼저 소진된 뒤
 * 회고록이 이어진다. 따라서 folders 는 "이 페이지 구간의 조각"이지 직계 하위
 * 폴더 전부가 아니고, total 은 폴더 총개수 + 회고록 총건수다.
 */
export async function apiGetFolderContents(params: {
  folderId?: string;
  retroType?: RetrospectiveType;
  page?: number;
  size?: number;
}): Promise<FolderContents> {
  const res = await request<FolderContentsResponse>("/folders/contents", {
    query: params,
  });
  return {
    folders: Array.isArray(res?.folders) ? res.folders.map(toFolder) : [],
    entries: Array.isArray(res?.entries) ? res.entries.map(toEntry) : [],
    total: res?.total ?? 0,
    page: res?.page ?? 1,
    size: res?.size ?? 0,
  };
}

/**
 * PATCH /folders/{folderId} — 이름 변경 및/또는 이동. patch.parentFolderId 를
 * 명시적으로 넣으면(문자열|null) 이동, 필드 자체를 생략하면 이동 없음.
 * 422 FOLDER_CIRCULAR_REFERENCE / 409 FOLDER_NAME_DUPLICATED 가능.
 */
export async function apiUpdateFolder(
  folderId: string,
  patch: { name?: string; parentFolderId?: string | null },
): Promise<Folder> {
  const res = await request<FolderResponse>(`/folders/${folderId}`, {
    method: "PATCH",
    body: patch,
  });
  return toFolder(res);
}

/**
 * DELETE /folders/{folderId} — 폴더만 삭제되고 내용물(하위 폴더·회고록)은
 * 최상위로 풀린다(orphan, 서버 정책).
 */
export async function apiDeleteFolder(folderId: string): Promise<void> {
  await request(`/folders/${folderId}`, { method: "DELETE" });
}

/**
 * PATCH /entries/{entryId}/folder — 회고록을 다른 폴더로 이동(드래그앤드롭) 또는
 * 소속 해제(folderId:null). retroType 은 daily(journal_entries) vs
 * weekly/monthly/yearly(retro_summaries) 라우팅에 필수.
 */
export async function apiMoveEntryToFolder(
  entryId: string,
  retroType: RetrospectiveType,
  folderId: string | null,
): Promise<void> {
  await request(`/entries/${entryId}/folder`, {
    method: "PATCH",
    query: { retroType },
    body: { folderId },
  });
}
