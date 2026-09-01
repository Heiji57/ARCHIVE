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
  // 공유 boolean 대신 "세대" 토큰을 쓴다 — generate() 호출마다 토큰을 새로 발급해,
  // 이전 generate() 의 비동기 후속 작업(폴링/SSE 콜백)이 이후의 generate() 호출로
  // 인해 되살아나 잘못된 topicId 의 결과로 최신 호출을 완료시키는 걸 막는다
  // (finishedRef 를 단일 boolean 으로 공유하면 이 문제가 생긴다 — 리뷰에서 발견).
  const genTokenRef = useRef(0);
  // topicId 변경 시 재조회 응답이 뒤바뀌어 도착해도(네트워크 순서 역전) 오래된
  // 응답이 최신 화면을 덮어쓰지 않도록 하는 요청 순번 가드(useTopics.ts 의
  // reqRef 패턴과 동일).
  const loadReqRef = useRef(0);

  const stopWatch = useCallback(() => {
    // 진행 중이던 generate() 호출을 전부 무효화한다(이후 그 호출의 .then/interval/
    // SSE 콜백이 도착해도 isStale() 이 true 가 되어 아무 것도 하지 않는다).
    genTokenRef.current += 1;
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
    // 진행 중이던 generate() 가 있었다면 stopWatch() 로 무효화됐으므로 다시는
    // finish() 가 불리지 않는다 — 여기서 직접 풀어주지 않으면 버튼이 영구히
    // "생성 중" 상태로 멈춘다(리뷰에서 발견된 버그).
    setGenerating(false);
    if (!topicId) return;

    const reqId = ++loadReqRef.current;
    setLoading(true);
    setLoadError(false);
    void getTopicDigest(topicId)
      .then((d) => {
        if (reqId !== loadReqRef.current) return; // stale 응답 무시
        setDigest(d);
      })
      .catch(() => {
        if (reqId === loadReqRef.current) setLoadError(true);
      })
      .finally(() => {
        if (reqId === loadReqRef.current) setLoading(false);
      });

    return () => stopWatch();
  }, [topicId, getTopicDigest, stopWatch]);

  const generate = useCallback(() => {
    if (!topicId || generating) return;
    setGenerateError(false);
    setGenerating(true);

    const myToken = ++genTokenRef.current;
    const isStale = () => genTokenRef.current !== myToken;

    const finish = (result: TopicDigest | null, failed: boolean) => {
      if (isStale()) return;
      if (pollTimerRef.current !== null) {
        window.clearInterval(pollTimerRef.current);
        pollTimerRef.current = null;
      }
      stopSSERef.current?.();
      stopSSERef.current = null;
      setGenerating(false);
      if (result) setDigest(result);
      if (failed) setGenerateError(true);
    };

    void generateTopicDigest(topicId)
      .then(() => {
        if (isStale()) return; // POST 응답 오는 사이 topicId 가 바뀜 — 타이머/SSE 를 새로 열지 않는다

        let pollCount = 0;
        pollTimerRef.current = window.setInterval(() => {
          if (isStale()) {
            // stopWatch() 가 놓친 타이머가 없어야 하지만, 방어적으로 스스로도 정리한다.
            if (pollTimerRef.current !== null) window.clearInterval(pollTimerRef.current);
            pollTimerRef.current = null;
            return;
          }
          if (++pollCount > MAX_POLLS) {
            finish(null, true);
            return;
          }
          void getTopicDigest(topicId).then((d) => {
            if (isStale() || !d) return;
            if (d.status === "completed") finish(d, false);
            else if (d.status === "failed") finish(d, true);
          });
        }, POLL_INTERVAL_MS);

        stopSSERef.current = streamTopicDigest(topicId, {
          onCompleted: () => {
            if (isStale()) return;
            void getTopicDigest(topicId).then((d) => finish(d, false));
          },
          onFailed: () => finish(null, true),
          // 타임아웃/오류는 폴링이 계속 담당 — 여기서는 상태를 건드리지 않음.
          onTimeout: () => {},
          onError: () => {},
        });
      })
      .catch(() => finish(null, true));
  }, [topicId, generating, generateTopicDigest, getTopicDigest]);

  return { digest, loading, loadError, generating, generateError, generate };
}
