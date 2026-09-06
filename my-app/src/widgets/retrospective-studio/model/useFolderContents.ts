import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useArchiveApp } from "@/app/providers/useArchiveApp";
import type { JournalEntry } from "@/entities/entry/model/types";
import type { Folder } from "@/entities/folder/model/types";
import { PAGE_SIZE, type RetroTab } from "./constants";

export interface UseFolderContentsResult {
  /** 현재 페이지 구간에 걸친 폴더 조각(직계 하위 폴더 전부가 아니다). */
  folders: Folder[];
  /** 현재 페이지에서 폴더가 쓰고 남은 칸에 채운 회고록 조각. */
  entries: JournalEntry[];
  page: number;
  setPage: (p: number) => void;
  totalPages: number;
  loading: boolean;
  error: boolean;
  /** 폴더 생성/이름변경/이동/삭제 후 현재 뷰를 다시 조회한다. */
  refetch: () => void;
}

/**
 * 폴더 + 회고록을 하나의 시퀀스로 보고 한 페이지 조각을 잘라낸다.
 *
 *     seq = [폴더(name ASC, id ASC)] ++ [회고록(dateKey DESC, id DESC)]
 *
 * 폴더 블록이 먼저 소진된 뒤 회고록이 이어진다(탐색기 방식). 서버 모드에서는
 * 백엔드가 같은 규칙으로 잘라 주므로 이 함수는 데모/mock 폴백 전용이지만,
 * 계약을 눈으로 대조할 수 있게 훅 밖에 두고 export 한다
 * (GET /folders/contents 의 오프셋 계산과 1:1 대응).
 */
export function sliceFolderContentsPage<F, E>(
  folders: F[],
  entries: E[],
  page: number,
  size: number,
): { folders: F[]; entries: E[]; total: number } {
  const offset = (page - 1) * size;
  const folderSlice = folders.slice(offset, offset + size);
  // 폴더를 다 지나친 만큼만 회고록 오프셋으로 넘긴다. 폴더가 남아 있는
  // 페이지에서는 0(회고록은 아직 시작 전) — max 가 그 경계를 만든다.
  const entryOffset = Math.max(0, offset - folders.length);
  const entrySlice = entries.slice(
    entryOffset,
    entryOffset + (size - folderSlice.length),
  );
  return {
    folders: folderSlice,
    entries: entrySlice,
    total: folders.length + entries.length,
  };
}

/**
 * 폴더 브라우징(GET /folders/contents) — 서버 모드와 데모/mock 클라이언트 폴백을
 * 이 훅 하나가 모두 처리한다(호출부는 서버/데모 여부를 몰라도 된다). daily 검색
 * (q)/기간(from·to) 필터는 GET /folders/contents 가 지원하지 않으므로, 검색어나
 * 기간이 걸려 있을 때는 이 훅을 쓰지 말고 useRetroEntriesPage(플랫 뷰)로 폴백할 것.
 *
 * @param allFolders state.folders 전체(클라이언트 폴백용 + 서버 응답 병합 후 참조).
 * @param allEntries state.entries 전체(클라이언트 폴백용 + 서버 응답 id 해석용).
 * @param folderId 현재 폴더(null=최상위).
 * @param retroType "all"이면 4종 통합.
 * @param enabled false 면 조회를 건너뛴다(검색어/기간 필터가 걸려 있어 플랫 뷰를
 *   대신 쓰는 동안 불필요한 요청을 막는다).
 */
export function useFolderContents(
  allFolders: Folder[],
  allEntries: JournalEntry[],
  folderId: string | null,
  retroType: RetroTab,
  enabled = true,
  size = PAGE_SIZE,
): UseFolderContentsResult {
  const { loadFolderContents } = useArchiveApp();
  const [page, setPageState] = useState(1);
  const [serverFolders, setServerFolders] = useState<Folder[]>([]);
  const [serverEntryIds, setServerEntryIds] = useState<string[]>([]);
  const [serverTotal, setServerTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [serverMode, setServerMode] = useState(true);
  const reqRef = useRef(0);
  const keyRef = useRef(`${folderId ?? ""}|${retroType}`);
  const [refetchTick, setRefetchTick] = useState(0);

  useEffect(() => {
    if (!enabled) return;
    const key = `${folderId ?? ""}|${retroType}`;
    const filterChanged = key !== keyRef.current;
    keyRef.current = key;

    if (filterChanged && page !== 1) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setPageState(1);
      return;
    }

    const reqId = ++reqRef.current;
    setLoading(true);
    setError(false);
    void loadFolderContents({
      folderId: folderId ?? undefined,
      retroType: retroType === "all" || retroType === "topics" ? undefined : retroType,
      page,
      size,
    })
      .then((res) => {
        if (reqId !== reqRef.current) return;
        if (res === null) {
          setServerMode(false); // 데모/mock → 클라이언트 폴백
          return;
        }
        setServerMode(true);
        setServerFolders(res.folders);
        setServerEntryIds(res.entries.map((e) => e.id));
        setServerTotal(res.total);
      })
      .catch(() => {
        if (reqId === reqRef.current) setError(true);
      })
      .finally(() => {
        if (reqId === reqRef.current) setLoading(false);
      });
  }, [folderId, retroType, page, size, loadFolderContents, refetchTick, enabled]);

  const setPage = useCallback((p: number) => setPageState(Math.max(1, p)), []);

  // 서버 모드: id 순서를 allEntries 에서 실제 엔트리로 해석(편집 반영을 위해).
  const resolvedServerEntries = useMemo(
    () =>
      serverEntryIds
        .map((id) => allEntries.find((e) => e.id === id))
        .filter((e): e is JournalEntry => Boolean(e)),
    [serverEntryIds, allEntries],
  );

  // 클라이언트 폴백(데모/mock) — state.folders/state.entries 를 직접 필터링.
  // folderCount/entryCount 는 저장된 값 대신 매번 실제로 세어서 채운다 — 서버
  // 모드와 달리 이동/삭제 후 카운트를 갱신해줄 응답이 없어(로컬에는 그런 집계
  // 로직이 없다), 저장된 값을 쓰면 드래그로 옮긴 뒤 카드에 옛 개수가 남는다.
  // 정렬은 서버 계약(name ASC, id ASC)을 그대로 따른다. 서버는 DB 콜레이션,
  // 여기는 localeCompare("ko") 라 한글·영문 혼재 시 순서가 완전히 같지는 않지만
  // 폴백은 데모 모드 전용이라 영향 범위가 닫혀 있다.
  const clientAllFolders = useMemo(
    () =>
      allFolders
        .filter((f) => f.parentFolderId === folderId)
        .map((f) => ({
          ...f,
          folderCount: allFolders.filter((sub) => sub.parentFolderId === f.id).length,
          entryCount: allEntries.filter((e) => e.folderId === f.id).length,
        }))
        .sort((a, b) => a.name.localeCompare(b.name, "ko") || a.id.localeCompare(b.id)),
    [allFolders, allEntries, folderId],
  );
  // id tie-break 는 필수 — "전체" 뷰는 4개 타입을 합치므로 같은 dateKey 가 여러
  // 건 나오고, 순서가 비결정적이면 페이지 경계에서 항목이 누락되거나 중복된다.
  const clientAllEntries = useMemo(() => {
    const list = allEntries.filter(
      (e) =>
        e.folderId === folderId &&
        (retroType === "all" || e.retroType === retroType),
    );
    return [...list].sort(
      (a, b) => b.dateKey.localeCompare(a.dateKey) || b.id.localeCompare(a.id),
    );
  }, [allEntries, folderId, retroType]);
  const clientPage = useMemo(
    () => sliceFolderContentsPage(clientAllFolders, clientAllEntries, page, size),
    [clientAllFolders, clientAllEntries, page, size],
  );

  const total = serverMode ? serverTotal : clientPage.total;
  const totalPages = Math.max(1, Math.ceil(total / size));

  // 마지막 페이지에서 항목을 지워 total 이 줄면 빈 페이지에 갇힌다 —
  // RetroGallery 의 빈 상태 분기가 페이저까지 감춰 되돌아갈 수단이 사라지므로,
  // 응답이 반영된 뒤 범위를 벗어난 페이지는 마지막 페이지로 내린다.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (!loading && page > totalPages) setPageState(totalPages);
  }, [loading, page, totalPages]);

  return {
    folders: serverMode ? serverFolders : clientPage.folders,
    entries: serverMode ? resolvedServerEntries : clientPage.entries,
    page,
    setPage,
    totalPages,
    loading: serverMode && loading,
    error: serverMode && error,
    refetch: () => setRefetchTick((t) => t + 1),
  };
}
