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
  /**
   * 서버 작업이 멈춘 것으로 보이는 상태 — 실패 응답을 받은 게 아니라 pending/
   * in_progress 인 채로 아무 진척이 없는 경우다. generateError 와 배타적이며,
   * 무한 스피너 대신 이 상태를 노출해 사용자가 상황을 알 수 있게 한다.
   */
  stalled: boolean;
  generate: () => void;
  /** 조회 실패 후 재시도 — topicId 는 그대로 두고 마운트 이펙트를 다시 돈다. */
  refetch: () => void;
}

const POLL_INTERVAL_MS = 5000;
/**
 * 한 번의 감시가 완료·실패를 기다리는 최대 시간(10분). 이 안에 결론이 안 나면
 * 서버 작업이 멈춘 것으로 보고 stalled 로 전환한다 — 조용히 포기하지 않는다.
 */
const WATCH_LIMIT_MS = 10 * 60 * 1000;
const MAX_POLLS = WATCH_LIMIT_MS / POLL_INTERVAL_MS;
/**
 * SSE 재구독 간격. 서버는 정리가 120초 안에 안 끝나면 `{"status":"timeout"}` 을
 * 보내고 스트림을 닫는다(api.yaml). 이건 작업 실패가 아니라 스트림 수명이 다한
 * 것이므로, 감시가 살아 있는 동안 다시 붙어 진행률을 이어받아야 한다.
 */
const SSE_RECONNECT_MS = 3000;
/**
 * 이 시간 넘게 pending/in_progress 로 남아 있는 정리는 서버 작업이 죽은 것으로
 * 본다. 진행률 이벤트는 digest 행을 건드리지 않아 updated_at 은 상태가 바뀔 때만
 * 움직이므로, 정상 생성 소요(1~2분)보다 넉넉히 잡아 오탐을 피한다.
 */
const STALE_AFTER_MS = 30 * 60 * 1000;

/** 시작 시각 기준으로 이미 방치된 정리인지 — 감시를 붙여도 끝나지 않는다. */
function looksStalled(digest: TopicDigest): boolean {
  const startedAt = Date.parse(digest.updatedAt ?? digest.createdAt);
  if (!Number.isFinite(startedAt)) return false;
  return Date.now() - startedAt > STALE_AFTER_MS;
}

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
  const [stalled, setStalled] = useState(false);
  const [tick, setTick] = useState(0);

  const pollTimerRef = useRef<number | null>(null);
  const stopSSERef = useRef<(() => void) | null>(null);
  const sseRetryTimerRef = useRef<number | null>(null);
  // 세대 토큰 — generate()/resume 호출마다 새로 발급해, 이전 호출의 비동기
  // 후속 작업(폴링/SSE 콜백)이 이후 호출로 되살아나 잘못된 결과로 최신 호출을
  // 완료시키는 걸 막는다.
  const genTokenRef = useRef(0);
  // topicId 변경 시 재조회 응답이 뒤바뀌어 도착해도 오래된 응답이 최신 화면을
  // 덮어쓰지 않도록 하는 요청 순번 가드.
  const loadReqRef = useRef(0);
  // 409(ALREADY_IN_PROGRESS) 분기에서 "이 정리가 이미 방치된 것인지" 판단하는 데
  // 쓴다. generate 콜백이 digest 값에 의존해 매번 새로 만들어지는 걸 피한다.
  const digestRef = useRef<TopicDigest | null>(null);

  const applyDigest = useCallback((d: TopicDigest | null) => {
    digestRef.current = d;
    setDigest(d);
  }, []);

  /** 진행 중인 폴링/SSE/재구독 예약을 모두 정리한다. */
  const clearWatchTimers = useCallback(() => {
    if (pollTimerRef.current !== null) {
      window.clearInterval(pollTimerRef.current);
      pollTimerRef.current = null;
    }
    if (sseRetryTimerRef.current !== null) {
      window.clearTimeout(sseRetryTimerRef.current);
      sseRetryTimerRef.current = null;
    }
    stopSSERef.current?.();
    stopSSERef.current = null;
  }, []);

  const stopWatch = useCallback(() => {
    genTokenRef.current += 1;
    clearWatchTimers();
  }, [clearWatchTimers]);

  // 폴링+SSE 이중 감시 — generate() 새 호출과 마운트 시 진행 중 상태 복귀 둘 다
  // 이 함수를 쓴다. 호출 전에 genTokenRef.current 를 이미 새로 발급해 뒀다고
  // 가정한다(그 값을 이 호출의 세대로 캡처한다).
  const startWatching = useCallback(() => {
    const myToken = genTokenRef.current;
    const isStale = () => genTokenRef.current !== myToken;
    if (isStale() || !topicId) return;
    const tid = topicId;

    const finish = (
      result: TopicDigest | null,
      outcome: "ok" | "failed" | "stalled",
    ) => {
      if (isStale()) return;
      clearWatchTimers();
      setGenerating(false);
      setProgress(null);
      if (result) applyDigest(result);
      if (outcome === "failed") setGenerateError(true);
      if (outcome === "stalled") setStalled(true);
    };

    // ─── 폴링 ────────────────────────────────────────────────────────────────
    // 타이머 id 를 지역 변수로 잡아 둔다. ref 만 보고 지우면, 세대가 지난 타이머가
    // 자기 자신이 아니라 그 사이 새로 걸린 최신 타이머를 지워 버린다.
    let pollCount = 0;
    const pollTimer = window.setInterval(() => {
      if (isStale()) {
        window.clearInterval(pollTimer);
        return;
      }
      if (++pollCount > MAX_POLLS) {
        // 10분 동안 완료·실패 어느 쪽도 못 봤다 — 서버 작업이 멈춘 것으로 본다.
        finish(null, "stalled");
        return;
      }
      void getTopicDigest(tid)
        .then((d) => {
          if (isStale() || !d) return;
          if (d.status === "completed") finish(d, "ok");
          else if (d.status === "failed") finish(d, "failed");
        })
        .catch(() => {
          // 일시적 조회 실패 — 다음 폴링 tick 에서 다시 시도한다.
        });
    }, POLL_INTERVAL_MS);
    pollTimerRef.current = pollTimer;

    // ─── SSE (끊기면 재구독) ──────────────────────────────────────────────────
    function subscribe() {
      if (isStale()) return;
      stopSSERef.current = streamTopicDigest(tid, {
        onProgress: (processed, total) => {
          if (!isStale()) setProgress({ processed, total });
        },
        onCompleted: () => {
          if (isStale()) return;
          void getTopicDigest(tid)
            .then((d) => finish(d, "ok"))
            .catch(() => {
              // 조회 실패 — 진행 중인 폴링이 재시도를 이어받는다.
            });
        },
        onFailed: () => finish(null, "failed"),
        // timeout 은 작업 실패가 아니라 스트림 수명(120초)이 끝났다는 신호다.
        // 여기서 버리면 진행률이 영영 멈추므로 다시 붙는다. 감시 한도(10분)에
        // 도달하면 폴링 쪽 finish() 가 이 재구독 예약까지 함께 정리한다.
        onTimeout: resubscribe,
        onError: resubscribe,
      });
    }

    function resubscribe() {
      if (isStale()) return;
      stopSSERef.current?.();
      stopSSERef.current = null;
      sseRetryTimerRef.current = window.setTimeout(subscribe, SSE_RECONNECT_MS);
    }

    subscribe();
  }, [topicId, getTopicDigest, clearWatchTimers, applyDigest]);

  // topicId 변경 시 상태 초기화 + 재조회, 언마운트/전환 시 진행 중이던 감시 정리.
  useEffect(() => {
    stopWatch();
    applyDigest(null);
    setGenerateError(false);
    setStalled(false);
    setGenerating(false);
    setProgress(null);
    if (!topicId) return;

    const reqId = ++loadReqRef.current;
    setLoading(true);
    setLoadError(false);
    void getTopicDigest(topicId)
      .then((d) => {
        if (reqId !== loadReqRef.current) return;
        applyDigest(d);
        // 마운트 시 진행 중 상태 복귀(§3.2 E) — POST 없이 감시만 이어받는다.
        if (d && (d.status === "pending" || d.status === "in_progress")) {
          if (looksStalled(d)) {
            // 오래 방치된 행이다. 감시를 붙여 봐야 10분을 흘려보낸 뒤 같은 결론에
            // 도달할 뿐이므로 바로 알린다.
            setStalled(true);
            return;
          }
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
  }, [
    topicId,
    getTopicDigest,
    stopWatch,
    startWatching,
    applyDigest,
    tick,
  ]);

  const generate = useCallback(() => {
    if (!topicId || generating) return;
    setGenerateError(false);
    setStalled(false);
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
          // 서버가 "이미 진행 중"이라며 거절했다. 그 진행 중인 작업이 이미 오래
          // 방치된 것이라면 감시를 붙여도 끝나지 않는다 — 재시도 버튼이 계속
          // 같은 토스트만 띄우는 막다른 길이 되므로 stalled 로 알린다.
          const known = digestRef.current;
          if (known && looksStalled(known)) {
            setGenerating(false);
            setStalled(true);
            return;
          }
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

  return {
    digest,
    loading,
    loadError,
    generating,
    progress,
    generateError,
    stalled,
    generate,
    refetch,
  };
}
