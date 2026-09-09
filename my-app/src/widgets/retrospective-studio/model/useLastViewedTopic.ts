import { useCallback, useState } from "react";

/**
 * 주제 뷰에서 마지막으로 선택했던 주제 id의 로컬 영속화(결정 19).
 *
 * API 계약(/settings)에 없는 FE 전용 UI 선호도이므로 서버로 동기화하지 않고
 * localStorage 에만 저장한다([[todoFilterPrefs]] 의 rangeDays 저장과 동일한 취지).
 * 그 주제가 삭제됐을 때의 폴백(존재 여부 검증)은 이 훅이 아니라 소비 측
 * (TopicsPane)이 topics 목록과 대조해서 처리한다 — 이 훅은 순수 저장/복원만 한다.
 */
const KEY = "archive.lastViewedTopicId";

function read(): string | null {
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null;
  }
}

function write(id: string | null): void {
  try {
    if (id === null) localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, id);
  } catch {
    /* localStorage 접근 불가(프라이빗 모드 등) 시 무시 */
  }
}

export function useLastViewedTopic(): [string | null, (id: string | null) => void] {
  const [id, setIdState] = useState<string | null>(() => read());
  const setId = useCallback((next: string | null) => {
    setIdState(next);
    write(next);
  }, []);
  return [id, setId];
}
