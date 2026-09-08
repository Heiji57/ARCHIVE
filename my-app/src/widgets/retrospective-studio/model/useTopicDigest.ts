import { useCallback, useEffect, useRef, useState } from "react";
import { useArchiveApp } from "@/app/providers/useArchiveApp";
import { isApiError, streamTopicDigest } from "@/shared/api";
import { useTranslation } from "@/shared/lib/i18n";
import type { TopicDigest } from "@/entities/topic/model/types";

export interface TopicDigestProgress {
  processed: number;
  total: number;
}

export interface UseTopicDigestResult {
  digest: TopicDigest | null;
  loading: boolean;
  loadError: boolean;
  /** 생성(재생성) 요청 진행 중 여부 — 이 세션에서 시작했든, 마운트 시 이어받았든. */
  generating: boolean;
  /** generating 중 SSE 진행률. 아직 이벤트를 못 받았으면 null(불확정 스피너로 렌더). */
  progress: TopicDigestProgress | null;
  generateError: boolean;
  generate: () => void;
  /** 조회 실패 후 재시도 — topicId 는 그대로 두고 마운트 이펙트를 다시 돈다. */
  refetch: () => void;
}

const POLL_INTERVAL_MS = 5000;
const MAX_POLLS = 72; // 5s * 72 = 6min

/** 선택된 주제 하나의 정리 문서 조회 + 생성 수명주기(폴링+SSE). */
export function useTopicDigest(topicId: string | null): UseTopicDigestResult {
  const { getTopicDigest, generateTopicDigest, pushNotification } = useArchiveApp();
  const { t } = useTranslation();
  const [digest, setDigest] = useState<TopicDigest | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [progress, setProgress] = useState<TopicDigestProgress | null>(null);
  const [generateError, setGenerateError] = useState(false);
  const [tick, setTick] = useState(0);

  const pollTimerRef = useRef<number | null>(null);
  const stopSSERef = useRef<(() => void) | null>(null);
  // 세대 토큰 — generate()/resume 호출마다 새로 발급해, 이전 호출의 비동기
  // 후속 작업(폴링/SSE 콜백)이 이후 호출로 되살아나 잘못된 결과로 최신 호출을
  // 완료시키는 걸 막는다.
  const genTokenRef = useRef(0);
  // topicId 변경 시 재조회 응답이 뒤바뀌어 도착해도 오래된 응답이 최신 화면을
  // 덮어쓰지 않도록 하는 요청 순번 가드.
  const loadReqRef = useRef(0);

  const stopWatch = useCallback(() => {
    genTokenRef.current += 1;
    if (pollTimerRef.current !== null) {
      window.clearInterval(pollTimerRef.current);
      pollTimerRef.current = null;
    }
    stopSSERef.current?.();
    stopSSERef.current = null;
  }, []);

  // 폴링+SSE 이중 감시 — generate() 새 호출과 마운트 시 진행 중 상태 복귀 둘 다
  // 이 함수를 쓴다. 호출 전에 genTokenRef.current 를 이미 새로 발급해 뒀다고
  // 가정한다(그 값을 이 호출의 세대로 캡처한다).
  const startWatching = useCallback(() => {
    const myToken = genTokenRef.current;
    const isStale = () => genTokenRef.current !== myToken;
    if (isStale() || !topicId) return;

    const finish = (result: TopicDigest | null, failed: boolean) => {
      if (isStale()) return;
      if (pollTimerRef.current !== null) {
        window.clearInterval(pollTimerRef.current);
        pollTimerRef.current = null;
      }
      stopSSERef.current?.();
      stopSSERef.current = null;
      setGenerating(false);
      setProgress(null);
      if (result) setDigest(result);
      if (failed) setGenerateError(true);
    };

    let pollCount = 0;
    pollTimerRef.current = window.setInterval(() => {
      if (isStale()) {
        if (pollTimerRef.current !== null) window.clearInterval(pollTimerRef.current);
        pollTimerRef.current = null;
        return;
      }
      if (++pollCount > MAX_POLLS) {
        finish(null, true);
        return;
      }
      void getTopicDigest(topicId)
        .then((d) => {
          if (isStale() || !d) return;
          if (d.status === "completed") finish(d, false);
          else if (d.status === "failed") finish(d, true);
        })
        .catch(() => {
          // 일시적 조회 실패 — 다음 폴링 tick 에서 다시 시도한다.
        });
    }, POLL_INTERVAL_MS);

    stopSSERef.current = streamTopicDigest(topicId, {
      onProgress: (processed, total) => {
        if (!isStale()) setProgress({ processed, total });
      },
      onCompleted: () => {
        if (isStale()) return;
        void getTopicDigest(topicId)
          .then((d) => finish(d, false))
          .catch(() => {
            // 조회 실패 — 진행 중인 폴링이 재시도를 이어받는다.
          });
      },
      onFailed: () => finish(null, true),
      onTimeout: () => {},
      onError: () => {},
    });
  }, [topicId, getTopicDigest]);

  // topicId 변경 시 상태 초기화 + 재조회, 언마운트/전환 시 진행 중이던 감시 정리.
  useEffect(() => {
    stopWatch();
    setDigest(null);
    setGenerateError(false);
    setGenerating(false);
    setProgress(null);
    if (!topicId) return;

    const reqId = ++loadReqRef.current;
    setLoading(true);
    setLoadError(false);
    void getTopicDigest(topicId)
      .then((d) => {
        if (reqId !== loadReqRef.current) return;
        setDigest(d);
        // 마운트 시 진행 중 상태 복귀(§3.2 E) — POST 없이 감시만 이어받는다.
        if (d && (d.status === "pending" || d.status === "in_progress")) {
          genTokenRef.current += 1;
          setGenerating(true);
          startWatching();
        }
      })
      .catch(() => {
        if (reqId === loadReqRef.current) setLoadError(true);
      })
      .finally(() => {
        if (reqId === loadReqRef.current) setLoading(false);
      });

    return () => stopWatch();
  }, [topicId, getTopicDigest, stopWatch, startWatching, tick]);

  const generate = useCallback(() => {
    if (!topicId || generating) return;
    setGenerateError(false);
    setGenerating(true);
    ++loadReqRef.current;
    setLoading(false);

    genTokenRef.current += 1;
    const myToken = genTokenRef.current;
    const isStale = () => genTokenRef.current !== myToken;

    void generateTopicDigest(topicId)
      .then(() => {
        // POST 응답이 오는 사이 topicId 가 바뀌었을 수 있다(예: 사용자가 다른
        // 주제를 선택) — 그 경우 genTokenRef 가 이미 더 새로운 감시로
        // 넘어가 있으므로, 여기서 startWatching() 을 부르면 그 최신 감시의
        // 타이머/SSE 를 가로채(orphan) 버린다. catch 분기는 이미 이 체크를
        // 하고 있었는데 then 분기만 빠져 있었다(리뷰에서 발견된 회귀).
        if (isStale()) return;
        startWatching();
      })
      .catch((e) => {
        if (isStale()) return;
        if (isApiError(e) && e.code === "TOPIC_DIGEST_ALREADY_IN_PROGRESS") {
          pushNotification("info", t("topic.generate.alreadyInProgress"), "", {
            transient: true,
          });
          startWatching();
          return;
        }
        setGenerating(false);
        setGenerateError(true);
      });
  }, [
    topicId,
    generating,
    generateTopicDigest,
    startWatching,
    pushNotification,
    t,
  ]);

  const refetch = useCallback(() => setTick((n) => n + 1), []);

  return { digest, loading, loadError, generating, progress, generateError, generate, refetch };
}
