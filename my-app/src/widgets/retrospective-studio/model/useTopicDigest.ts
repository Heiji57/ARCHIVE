import { useCallback, useEffect, useRef, useState } from "react";
import { useArchiveApp } from "@/app/providers/useArchiveApp";
import { streamTopicDigest } from "@/shared/api";
import type { TopicDigest } from "@/entities/topic/model/types";

export interface UseTopicDigestResult {
  digest: TopicDigest | null;
  loading: boolean;
  loadError: boolean;
  /** 생성(재생성) 요청 진행 중 여부. */
  generating: boolean;
  generateError: boolean;
  generate: () => void;
}

const POLL_INTERVAL_MS = 5000;
const MAX_POLLS = 72; // 5s * 72 = 6min

/** 선택된 주제 하나의 정리 문서 조회 + 생성 수명주기(폴링+SSE). */
export function useTopicDigest(topicId: string | null): UseTopicDigestResult {
  const { getTopicDigest, generateTopicDigest } = useArchiveApp();
  const [digest, setDigest] = useState<TopicDigest | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [generateError, setGenerateError] = useState(false);

  const pollTimerRef = useRef<number | null>(null);
  const stopSSERef = useRef<(() => void) | null>(null);
  const finishedRef = useRef(true);

  const stopWatch = useCallback(() => {
    finishedRef.current = true;
    if (pollTimerRef.current !== null) {
      window.clearInterval(pollTimerRef.current);
      pollTimerRef.current = null;
    }
    stopSSERef.current?.();
    stopSSERef.current = null;
  }, []);

  // topicId 변경 시 상태 초기화 + 재조회, 언마운트/전환 시 진행 중이던 감시 정리.
  useEffect(() => {
    stopWatch();
    setDigest(null);
    setGenerateError(false);
    if (!topicId) return;

    setLoading(true);
    setLoadError(false);
    void getTopicDigest(topicId)
      .then((d) => setDigest(d))
      .catch(() => setLoadError(true))
      .finally(() => setLoading(false));

    return () => stopWatch();
  }, [topicId, getTopicDigest, stopWatch]);

  const generate = useCallback(() => {
    if (!topicId || generating) return;
    setGenerateError(false);
    setGenerating(true);
    finishedRef.current = false;

    const finish = (result: TopicDigest | null, failed: boolean) => {
      if (finishedRef.current) return;
      stopWatch();
      setGenerating(false);
      if (result) setDigest(result);
      if (failed) setGenerateError(true);
    };

    void generateTopicDigest(topicId)
      .then(() => {
        let pollCount = 0;
        pollTimerRef.current = window.setInterval(() => {
          if (finishedRef.current) return;
          if (++pollCount > MAX_POLLS) {
            finish(null, true);
            return;
          }
          void getTopicDigest(topicId).then((d) => {
            if (finishedRef.current || !d) return;
            if (d.status === "completed") finish(d, false);
            else if (d.status === "failed") finish(d, true);
          });
        }, POLL_INTERVAL_MS);

        stopSSERef.current = streamTopicDigest(topicId, {
          onCompleted: () => {
            void getTopicDigest(topicId).then((d) => finish(d, false));
          },
          onFailed: () => finish(null, true),
          // 타임아웃/오류는 폴링이 계속 담당 — 여기서는 상태를 건드리지 않음.
          onTimeout: () => {},
          onError: () => {},
        });
      })
      .catch(() => finish(null, true));
  }, [topicId, generating, generateTopicDigest, getTopicDigest, stopWatch]);

  return { digest, loading, loadError, generating, generateError, generate };
}
