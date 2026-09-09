import { useCallback, useEffect, useRef, useState } from "react";
import { useArchiveApp } from "@/app/providers/useArchiveApp";
import type { Topic } from "@/entities/topic/model/types";

export interface UseTopicsResult {
  topics: Topic[];
  loading: boolean;
  error: boolean;
  create: (name: string, description: string) => Promise<Topic>;
  update: (
    id: string,
    patch: { name?: string; description?: string },
  ) => Promise<Topic>;
  remove: (id: string) => Promise<void>;
  refetch: () => void;
}

/** 주제 목록 로드 + 생성 + 수정 + 삭제. 최대 20개라 페이지네이션 없음. */
export function useTopics(): UseTopicsResult {
  const { loadTopics, createTopic, updateTopic, deleteTopic } = useArchiveApp();
  const [topics, setTopics] = useState<Topic[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [tick, setTick] = useState(0);
  const reqRef = useRef(0);

  useEffect(() => {
    const reqId = ++reqRef.current;
    setLoading(true);
    setError(false);
    void loadTopics()
      .then((list) => {
        if (reqId !== reqRef.current) return;
        setTopics(list);
      })
      .catch(() => {
        if (reqId === reqRef.current) setError(true);
      })
      .finally(() => {
        if (reqId === reqRef.current) setLoading(false);
      });
  }, [loadTopics, tick]);

  const refetch = useCallback(() => setTick((t) => t + 1), []);

  const create = useCallback(
    async (name: string, description: string) => {
      ++reqRef.current;
      setLoading(false);
      const topic = await createTopic(name, description);
      ++reqRef.current;
      setTopics((prev) => [...prev, topic]);
      return topic;
    },
    [createTopic],
  );

  const update = useCallback(
    async (id: string, patch: { name?: string; description?: string }) => {
      ++reqRef.current;
      setLoading(false);
      const updated = await updateTopic(id, patch);
      ++reqRef.current;
      // ⚠️ updated 전체를 스프레드하지 않는다 — PATCH 단건 응답은 entryCount/
      // todoCount/digestWatermarkDateKey 가 항상 null(목록 조회에서만 채워지는
      // 필드, entities/topic/model/types.ts 의 Topic 주석 참고)이라, 그대로
      // 덮어쓰면 방금 수정한 주제의 pill 숫자·반영 상태가 화면에서 사라진다.
      // PATCH가 실제로 바꾸는 필드(name/description/updatedAt)만 병합한다.
      setTopics((prev) =>
        prev.map((t) =>
          t.id === id
            ? {
                ...t,
                name: updated.name,
                description: updated.description,
                updatedAt: updated.updatedAt,
              }
            : t,
        ),
      );
      return updated;
    },
    [updateTopic],
  );

  const remove = useCallback(
    async (id: string) => {
      ++reqRef.current;
      setLoading(false);
      await deleteTopic(id);
      ++reqRef.current;
      setTopics((prev) => prev.filter((t) => t.id !== id));
    },
    [deleteTopic],
  );

  return { topics, loading, error, create, update, remove, refetch };
}
