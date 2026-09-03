/**
 * 주제(Topic) 정리 문서 도메인 API (비동기 + SSE).
 *  - POST /topics/{id}/digest/generate → 202 (작업 enqueue)
 *  - GET  /topics/{id}/digest/stream → SSE 로 완료 신호 수신
 *
 * 주제당 digest 는 1개뿐이며, 재생성은 watermark_date_key 이후 새 내용만
 * 반영해 기존 content 를 대체한다(누적 아님) — TopicDigestPane 에서 안내한다.
 */
import { ApiError } from "./errors";
import { request, streamSSE } from "./client";
import type { components } from "./schema";
import type { Topic, TopicDigest } from "@/entities/topic/model/types";

type TopicResponse = components["schemas"]["TopicResponse"];
type TopicDigestResponse = components["schemas"]["TopicDigestResponse"];

function toTopic(api: TopicResponse): Topic {
  return {
    id: api.id,
    name: api.name,
    description: api.description,
    createdAt: api.created_at,
    updatedAt: api.updated_at ?? null,
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

/**
 * `TOPIC_LIMIT_REACHED` 에러의 `details`는 다른 에러와 달리 표준
 * `{field,message}[]` shape 이 아니라 `[{"limit": number}]` 를 그대로 내려준다
 * (CLAUDE.md §8 계약 간극 6번). 이 비표준 shape 을 API 경계에서 한 번만
 * 캐스팅해 소비자(TopicSidebar 등)가 직접 캐스팅하지 않게 한다.
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

export interface TopicDigestStreamHandlers {
  onCompleted: () => void;
  onFailed: () => void;
  onTimeout: () => void;
  onError: () => void;
}

interface StreamEvent {
  status?: "completed" | "failed" | "timeout" | "error";
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
      // data 가 null/객체가 아니거나 status 필드가 없으면(keep-alive 등) terminal
      // 이벤트가 아니다 — cast 전에 걸러야 terminalDispatched 가 잘못 true 로
      // 남아 onClose 의 onTimeout 폴백이 영구히 비활성화되는 걸 막을 수 있다.
      if (!data || typeof data !== "object" || !("status" in data)) {
        handlers.onError();
        return;
      }
      const evt = data as StreamEvent;
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
      // 스트림이 terminal 이벤트 없이 닫히면(서버 타임아웃·네트워크 끊김) timeout 폴백.
      if (!terminalDispatched) handlers.onTimeout();
    },
  );
}
