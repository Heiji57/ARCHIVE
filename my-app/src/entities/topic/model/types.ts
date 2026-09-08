import type { RetrospectiveType } from "@/entities/entry/model/types";

export type DigestStatus = "pending" | "in_progress" | "completed" | "failed";

export interface Topic {
  id: string;
  name: string;
  description: string;
  createdAt: string;
  updatedAt: string | null;
  /**
   * 이 주제에 묶이는 회고/할 일 수. **목록(GET /topics)에서만 채워진다** — 생성/수정
   * 단건 응답에서는 null(백엔드가 그렇게 정의함). 임베딩 API 장애·쿼터 초과 시에도
   * 목록 자체는 200으로 오고 카운트만 null — 이 경우 숫자 없이 렌더링해야 한다.
   * pill 숫자는 entryCount + todoCount 를 소비 측에서 합산한다(둘 중 하나라도
   * null이면 합계도 표시하지 않는다).
   */
  entryCount: number | null;
  todoCount: number | null;
  /** 마지막 정리 시점(YYYY-MM-DD). 정리한 적 없으면 null. */
  digestWatermarkDateKey: string | null;
}

export interface TopicDigest {
  id: string;
  topicId: string;
  status: DigestStatus;
  content: string | null;
  watermarkDateKey: string | null;
  createdAt: string;
  updatedAt: string | null;
}

export interface TopicEntryCounts {
  daily: number;
  weekly: number;
  monthly: number;
  yearly: number;
  total: number;
}

export interface TopicTodoCounts {
  /** 매칭 규칙상 not-start 상태 할 일은 제외된다. */
  total: number;
  completed: number;
}

export interface TopicTagCount {
  tag: string;
  count: number;
}

export interface TopicStats {
  topicId: string;
  entryCounts: TopicEntryCounts;
  todoCounts: TopicTodoCounts;
  /** 상위 20개로 잘린 목록. 전체 종류 수는 tagCountTotal. */
  tagCounts: TopicTagCount[];
  tagCountTotal: number;
  periodStartDateKey: string | null;
  periodEndDateKey: string | null;
  /** watermarkDateKey 이후(초과) 날짜의 매칭 회고 수. digest 없으면 전체 매칭 회고 수. */
  unreflectedEntryCount: number;
}

export type TopicSourceKind = "entry" | "todo";

export interface TopicSource {
  kind: TopicSourceKind;
  id: string;
  title: string;
  dateKey: string;
  /** 회고면 회고 종류, 할 일이면 null. */
  retroType: RetrospectiveType | null;
}

export interface TopicSourcePage {
  items: TopicSource[];
  total: number;
  page: number;
  size: number;
  /** 이 목록은 요청 시점 재계산 결과 — 이 날짜 이후 항목은 아직 digest에 반영 안 됨. */
  digestWatermarkDateKey: string | null;
}
