import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useArchiveApp } from "@/app/providers/useArchiveApp";
import type { JournalEntry } from "@/entities/entry/model/types";
import type { Folder } from "@/entities/folder/model/types";
import { PAGE_SIZE, type RetroTab } from "./constants";

export interface UseFolderContentsResult {
  /** 현재 폴더의 직계 하위 폴더. */
  folders: Folder[];
  /** 현재 폴더의 직계 회고록(현재 페이지). */
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
      retroType: retroType === "all" ? undefined : retroType,
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
  const clientFolders = useMemo(
    () =>
      allFolders
        .filter((f) => f.parentFolderId === folderId)
        .map((f) => ({
          ...f,
          folderCount: allFolders.filter((sub) => sub.parentFolderId === f.id).length,
          entryCount: allEntries.filter((e) => e.folderId === f.id).length,
        })),
    [allFolders, allEntries, folderId],
  );
  const clientAllEntries = useMemo(() => {
    const list = allEntries.filter(
      (e) =>
        e.folderId === folderId &&
        (retroType === "all" || e.retroType === retroType),
    );
    return [...list].sort((a, b) => b.dateKey.localeCompare(a.dateKey));
  }, [allEntries, folderId, retroType]);
  const clientTotal = clientAllEntries.length;
  const clientPageEntries = useMemo(() => {
    const start = (page - 1) * size;
    return clientAllEntries.slice(start, start + size);
  }, [clientAllEntries, page, size]);

  const total = serverMode ? serverTotal : clientTotal;
  const totalPages = Math.max(1, Math.ceil(total / size));

  return {
    folders: serverMode ? serverFolders : clientFolders,
    entries: serverMode ? resolvedServerEntries : clientPageEntries,
    page,
    setPage,
    totalPages,
    loading: serverMode && loading,
    error: serverMode && error,
    refetch: () => setRefetchTick((t) => t + 1),
  };
}
