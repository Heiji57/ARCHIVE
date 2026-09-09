import { useEffect, useRef, useState } from "react";
import { useArchiveApp } from "@/app/providers/useArchiveApp";
import type { TopicStats } from "@/entities/topic/model/types";

export interface UseTopicStatsResult {
  stats: TopicStats | null;
  loading: boolean;
  error: boolean;
}

/**
 * 주제 통계 로딩 — useTopicDigest 와 독립. digest 생성 여부와 무관하게 항상
 * 조회 가능(BE 계약)하고, 실패해도 본문(TopicDocument)은 정상 렌더되어야
 * 하므로 이 훅의 error 는 메타 줄·레일 카드만 숨기는 데 쓴다.
 */
export function useTopicStats(topicId: string | null): UseTopicStatsResult {
  const { getTopicStats } = useArchiveApp();
  const [stats, setStats] = useState<TopicStats | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const reqRef = useRef(0);

  useEffect(() => {
    setStats(null);
    setError(false);
    if (!topicId) return;

    const reqId = ++reqRef.current;
    setLoading(true);
    void getTopicStats(topicId)
      .then((s) => {
        if (reqId === reqRef.current) setStats(s);
      })
      .catch(() => {
        if (reqId === reqRef.current) setError(true);
      })
      .finally(() => {
        if (reqId === reqRef.current) setLoading(false);
      });
  }, [topicId, getTopicStats]);

  return { stats, loading, error };
}
