import { useCallback, useEffect, useRef, useState } from "react";
import { useArchiveApp } from "@/app/providers/useArchiveApp";
import type { Topic } from "@/entities/topic/model/types";

export interface UseTopicsResult {
  topics: Topic[];
  loading: boolean;
  error: boolean;
  create: (name: string, description: string) => Promise<Topic>;
  remove: (id: string) => Promise<void>;
  refetch: () => void;
}

/** 주제 목록 로드 + 생성 + 삭제. 최대 20개라 페이지네이션 없음. */
export function useTopics(): UseTopicsResult {
  const { loadTopics, createTopic, deleteTopic } = useArchiveApp();
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
      // 진행 중이던 목록 조회를 무효화한다 — 그렇지 않으면 그 응답이 생성보다
      // 늦게 도착해 방금 추가한 주제를 목록에서 지워버릴 수 있다.
      ++reqRef.current;
      const topic = await createTopic(name, description);
      setTopics((prev) => [...prev, topic]);
      return topic;
    },
    [createTopic],
  );

  const remove = useCallback(
    async (id: string) => {
      // 위와 동일한 이유로 진행 중이던 목록 조회를 무효화한다.
      ++reqRef.current;
      await deleteTopic(id);
      setTopics((prev) => prev.filter((t) => t.id !== id));
    },
    [deleteTopic],
  );

  return { topics, loading, error, create, remove, refetch };
}
