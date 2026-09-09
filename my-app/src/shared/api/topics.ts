/**
 * 주제(Topic) 정리 문서 도메인 API (비동기 + SSE).
 *  - POST /topics/{id}/digest/generate → 202 (작업 enqueue)
 *  - GET  /topics/{id}/digest/stream → SSE 로 완료 신호 수신
 *
 * 주제당 digest 는 1개뿐이며, 재생성은 watermark_date_key 이후 새 내용만
 * 반영해 기존 content 를 대체한다(누적 아님) — TopicDocument 에서 안내한다.
 */
import { ApiError } from "./errors";
import { request, streamSSE } from "./client";
import type { components } from "./schema";
import type {
  Topic,
  TopicDigest,
  TopicStats,
  TopicSource,
  TopicSourcePage,
} from "@/entities/topic/model/types";

type TopicResponse = components["schemas"]["TopicResponse"];
type TopicDigestResponse = components["schemas"]["TopicDigestResponse"];
type TopicStatsResponse = components["schemas"]["TopicStatsResponse"];
type TopicSourceResponse = components["schemas"]["TopicSourceResponse"];
type TopicSourcePageResponse = components["schemas"]["TopicSourcePageResponse"];

function toTopic(api: TopicResponse): Topic {
  return {
    id: api.id,
    name: api.name,
    description: api.description,
    createdAt: api.created_at,
    updatedAt: api.updated_at ?? null,
    entryCount: api.entry_count ?? null,
    todoCount: api.todo_count ?? null,
    digestWatermarkDateKey: api.digest_watermark_date_key ?? null,
  };
}

function toDigest(api: TopicDigestResponse): TopicDigest {
  return {
    id: api.id,
    topicId: api.topic_id,
    status: api.status,
    content: api.content ?? null,
    watermarkDateKey: api.watermark_date_key ?? null,
    createdAt: api.created_at,
    updatedAt: api.updated_at ?? null,
  };
}

function toTopicStats(api: TopicStatsResponse): TopicStats {
  return {
    topicId: api.topic_id,
    entryCounts: api.entry_counts,
    todoCounts: api.todo_counts,
    tagCounts: api.tag_counts.map((t) => ({ tag: t.tag, count: t.count })),
    tagCountTotal: api.tag_count_total,
    periodStartDateKey: api.period_start_date_key ?? null,
    periodEndDateKey: api.period_end_date_key ?? null,
    unreflectedEntryCount: api.unreflected_entry_count,
  };
}

function toTopicSource(api: TopicSourceResponse): TopicSource {
  return {
    kind: api.kind,
    id: api.id,
    title: api.title,
    dateKey: api.date_key,
    retroType: api.retro_type ?? null,
  };
}

/**
 * `TOPIC_LIMIT_REACHED` 에러의 `details`는 다른 에러와 달리 표준
 * `{field,message}[]` shape 이 아니라 `[{"limit": number}]` 를 그대로 내려준다
 * (CLAUDE.md §8 계약 간극 6번). 이 비표준 shape 을 API 경계에서 한 번만
 * 캐스팅해 소비자(TopicPillBar 등)가 직접 캐스팅하지 않게 한다.
 */
export function getTopicLimitFromError(error: ApiError): number | undefined {
  if (error.code !== "TOPIC_LIMIT_REACHED") return undefined;
  const detail = error.details[0] as unknown as { limit?: number } | undefined;
  return detail?.limit;
}

export async function apiListTopics(): Promise<Topic[]> {
  const list = await request<TopicResponse[] | null | undefined>("/topics");
  if (!Array.isArray(list)) return [];
  return list.map(toTopic);
}

export async function apiCreateTopic(
  name: string,
  description: string,
): Promise<Topic> {
  const res = await request<TopicResponse>("/topics", {
    method: "POST",
    body: { name, description },
  });
  return toTopic(res);
}

export async function apiDeleteTopic(id: string): Promise<void> {
  await request(`/topics/${id}`, { method: "DELETE" });
}

export async function apiUpdateTopic(
  id: string,
  patch: { name?: string; description?: string },
): Promise<Topic> {
  const res = await request<TopicResponse>(`/topics/${id}`, {
    method: "PATCH",
    body: patch,
  });
  return toTopic(res);
}

/** 정리 생성/재생성 요청 (202). */
export async function apiGenerateDigest(topicId: string): Promise<TopicDigest> {
  const res = await request<TopicDigestResponse>(
    `/topics/${topicId}/digest/generate`,
    { method: "POST" },
  );
  return toDigest(res);
}

/**
 * 정리 문서 조회. 한 번도 생성한 적 없으면 서버가 404(TOPIC_DIGEST_NOT_FOUND)를
 * 반환하는데, 이는 에러가 아니라 "아직 없음" 상태이므로 null 로 정규화한다.
 */
export async function apiGetDigest(topicId: string): Promise<TopicDigest | null> {
  try {
    const res = await request<TopicDigestResponse>(`/topics/${topicId}/digest`);
    return toDigest(res);
  } catch (e) {
    if (e instanceof ApiError && e.code === "TOPIC_DIGEST_NOT_FOUND") return null;
    throw e;
  }
}

/** 정리 여부와 무관하게 항상 조회 가능한 주제 통계. */
export async function apiGetTopicStats(topicId: string): Promise<TopicStats> {
  const res = await request<TopicStatsResponse>(`/topics/${topicId}/stats`);
  return toTopicStats(res);
}

/**
 * 주제에 묶인 소스(회고+할 일) 페이지 조회. 종류 필터 없음(결정 24) — 서버가
 * date_key 내림차순 단일 목록으로 내려준다. 요청 시점 재계산 결과이므로
 * `digestWatermarkDateKey` 이후 항목은 아직 digest에 반영 안 된 것.
 */
export async function apiGetTopicSources(
  topicId: string,
  params: { page?: number; size?: number } = {},
): Promise<TopicSourcePage> {
  const res = await request<TopicSourcePageResponse>(
    `/topics/${topicId}/sources`,
    { query: params },
  );
  return {
    items: res.items.map(toTopicSource),
    total: res.total,
    page: res.page,
    size: res.size,
    digestWatermarkDateKey: res.digest_watermark_date_key ?? null,
  };
}

export interface TopicDigestStreamHandlers {
  /** 최초 생성 3번(0/total 포함)부터 배치마다 온다. terminal 이벤트가 아니다. */
  onProgress: (processed: number, total: number) => void;
  onCompleted: () => void;
  onFailed: () => void;
  onTimeout: () => void;
  onError: () => void;
}

interface StreamEvent {
  status?: "in_progress" | "completed" | "failed" | "timeout" | "error";
  processed?: number;
  total?: number;
}

/** 정리 완료 SSE 구독. 반환된 함수를 호출하면 구독을 중단한다. */
export function streamTopicDigest(
  topicId: string,
  handlers: TopicDigestStreamHandlers,
): () => void {
  let terminalDispatched = false;
  return streamSSE(
    `/topics/${topicId}/digest/stream`,
    (data) => {
      if (!data || typeof data !== "object" || !("status" in data)) {
        handlers.onError();
        return;
      }
      const evt = data as StreamEvent;
      if (evt.status === "in_progress") {
        // 진행률 — terminal 아님. dispatched 플래그를 세우지 않고 계속 구독한다.
        if (typeof evt.processed === "number" && typeof evt.total === "number") {
          handlers.onProgress(evt.processed, evt.total);
        }
        return;
      }
      terminalDispatched = true;
      switch (evt.status) {
        case "completed":
          handlers.onCompleted();
          break;
        case "failed":
          handlers.onFailed();
          break;
        case "timeout":
          handlers.onTimeout();
          break;
        default:
          handlers.onError();
      }
    },
    () => {
      if (!terminalDispatched) handlers.onTimeout();
    },
  );
}
