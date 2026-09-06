import { useCallback, useEffect, useRef, useState } from "react";
import { useArchiveApp } from "@/app/providers/useArchiveApp";
import type { Folder, FolderSummary } from "@/entities/folder/model/types";

export interface UseAllFoldersResult {
  /** 전체 폴더(경로 조립용). 아직 로드 전이거나 실패하면 빈 배열. */
  folders: FolderSummary[];
  /** 폴더 생성·이름변경·이동·삭제 후 다시 조회하게 한다. */
  invalidate: () => void;
}

/**
 * 전체 폴더 목록(GET /folders) — 검색 결과의 소속 경로를 조립하는 데 쓴다.
 *
 * **lazy**: `enabled` 가 처음 true 가 될 때 1회만 조회한다. 폴더를 안 쓰는
 * 사용자가 다수라 앱 부팅마다 받을 이유가 없다. 검색·기간 필터가 켜지는
 * 시점이 곧 경로 칩이 필요해지는 시점이다.
 *
 * 데모/mock 은 loadAllFolders 가 null 을 반환하고 state.folders 로 폴백한다
 * (useFolderContents 와 같은 패턴). 폴백 값은 Folder[] 지만 FolderSummary 로
 * 구조적으로 대입된다.
 *
 * @param allFolders state.folders 전체(데모/mock 폴백용).
 * @param enabled false 면 조회를 건너뛴다.
 */
export function useAllFolders(
  allFolders: Folder[],
  enabled: boolean,
): UseAllFoldersResult {
  const { loadAllFolders } = useArchiveApp();
  const [serverFolders, setServerFolders] = useState<FolderSummary[] | null>(null);
  const [serverMode, setServerMode] = useState(true);
  const [tick, setTick] = useState(0);
  // 이미 조회한 tick — enabled 가 켜져 있는 동안 재조회를 막는다(무효화 전까지).
  const fetchedTickRef = useRef<number | null>(null);
  const reqRef = useRef(0);

  useEffect(() => {
    if (!enabled) return;
    if (fetchedTickRef.current === tick) return;
    fetchedTickRef.current = tick;

    const reqId = ++reqRef.current;
    void loadAllFolders()
      .then((list) => {
        if (reqId !== reqRef.current) return;
        if (list === null) {
          setServerMode(false); // 데모/mock → state.folders 폴백
          return;
        }
        setServerMode(true);
        setServerFolders(list);
      })
      .catch(() => {
        // 경로 칩은 보조 정보다 — 실패해도 목록 자체는 정상 동작해야 하므로
        // 조용히 넘어가고 칩만 생략된다(빈 배열 → buildFolderPath 가 [] 반환).
        if (reqId === reqRef.current) setServerFolders([]);
      });
  }, [enabled, tick, loadAllFolders]);

  const invalidate = useCallback(() => setTick((t) => t + 1), []);

  return {
    folders: serverMode ? (serverFolders ?? []) : allFolders,
    invalidate,
  };
}
