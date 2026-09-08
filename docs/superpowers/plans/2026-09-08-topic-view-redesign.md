# 주제 뷰 리디자인 (Phase 2) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 2026-09-01에 만든 "주제(Topic)" 좌우 분할 화면(사이드바+정리문서 패널)을, 확정 디자인
(`주제 뷰 확정안 v3.html`)이 정한 한 줄 pill 전환 + 문서형 본문 + 소스 목록 모달 구조로 다시 만든다.

**Architecture:** 기존 `entities/topic`·`shared/api/topics.ts`·`useTopics`/`useTopicDigest` 훅
기반을 그대로 확장한다(전면 재작성 아님). `TopicSidebar`/`TopicDigestPane`는 폐기하고
`TopicPillBar`/`TopicPicker`/`TopicDocument`/`TopicSourceListModal` 4개로 대체한다.
레이아웃은 Phase 1(회고 에디터)이 만든 `.retro-doc`/`.retro-doc-main`/`.retro-doc-rail`
그리드를 그대로 재사용한다. 검색·팝오버는 `RetroGallery`의 `.retro-gallery-search`/
`.retro-gallery-pop-*` 패턴을 그대로 복제해 새 클래스(`.topic-*`)로 옮긴다.

**Tech Stack:** React + TypeScript, FSD 아키텍처, `fetch` 기반 API 클라이언트
(`shared/api/client.ts`), `marked`/TipTap 기반 `RichEditor`, 순수 CSS(외부 UI 라이브러리
없음). **테스트 러너 없음** — 게이트는 `pnpm build`(`tsc -b && vite build`). UI 태스크는
추가로 `pnpm dev`로 수동 확인한다.

**Spec:** `docs/superpowers/specs/2026-09-04-retro-redesign-design.md` §3 (2026-09-08 갱신,
결정 18~29). BE 계약은 `docs/be-request-2026-09-04-topics-api.md`(작업 1~9, 전부 구현·확인됨).

## Global Constraints

- `api.yaml`에 없는 필드/엔드포인트를 상상하지 않는다 — 이 계획서의 모든 API 시그니처는
  `my-app/src/shared/api/schema.d.ts`(이미 재생성됨)에 정의된 타입 그대로다.
- API는 snake_case, FE 도메인 타입은 camelCase — 변환은 `shared/api/*.ts`의 매퍼에서만.
- 패키지 매니저는 pnpm만. 런타임 외부 라이브러리 신규 추가 금지.
- FSD 레이어: `app → pages → widgets → entities → shared`. 새 컴포넌트는
  `widgets/retrospective-studio/ui/`, 새 훅은 `widgets/retrospective-studio/model/`.
- 폰트 크기는 12/16/18px + 기존 헤드라인 스케일만 사용(`CLAUDE.md` §10). 여백은 `--s-*`,
  라운드는 `--r-*`, 색은 `var(--color-*)`만 — 확정안의 px/hex 값을 그대로 옮기지 않는다.
- 개수 제한(20개) 관련 전용 안내 카드를 만들지 않는다 — `TOPIC_LIMIT_REACHED`는 생성 모달의
  인라인 에러로만 표시(결정 28).
- 소스 목록에 종류 필터 UI/쿼리 파라미터를 만들지 않는다 — 회고+할 일 단일 목록,
  `date_key` 내림차순(결정 24).
- 문장 단위 출처 각주, 출처 라벨 붙은 인용 카드를 만들지 않는다(결정 4, 23) — 인용은 일반
  markdown blockquote로만 렌더.
- i18n은 ko/en/ja/zh 4개 로케일 모두 실제 번역으로 채운다(플레이스홀더 금지).

---

### Task 1: 이미 만든 API 계약 동기화를 커밋

이전 세션에서 BE의 `api.yaml`을 복사하고 `pnpm gen:api`를 돌려 스키마를 재생성했고, 그로 인한
타입 드리프트(`StatsRange`에 `"all"` 추가)도 이미 고쳐서 `pnpm build`가 통과하는 상태다. 이
작업만 별도로 커밋해 두고 시작한다(리뷰 시 "API 계약 동기화"와 "Phase 2 신규 기능"을
분리해서 보게 하기 위함).

**Files:**
- (변경 없음 — 이미 워킹 트리에 있는 것을 커밋만 한다)
  `my-app/api.yaml`, `my-app/src/shared/api/schema.d.ts`,
  `my-app/src/entities/todo/model/types.ts`,
  `my-app/src/widgets/dashboard-overview/ui/DashboardOverview.tsx`,
  `my-app/src/widgets/dashboard-overview/ui/StatCards.tsx`

**Interfaces:**
- Produces: `components["schemas"]["TopicResponse" | "TopicStatsResponse" |
  "TopicSourceResponse" | "TopicSourcePageResponse" | "UpdateTopicRequest"]`
  (Task 2가 바로 이 타입들을 소비한다), `StatsRange = "today"|"week"|"month"|"all"`.

- [ ] **Step 1: 빌드 재확인**

```bash
cd my-app && pnpm build
```

Expected: 통과 (이미 확인됐지만 커밋 전 재확인).

- [ ] **Step 2: Commit**

```bash
git add my-app/api.yaml my-app/src/shared/api/schema.d.ts \
        my-app/src/entities/todo/model/types.ts \
        my-app/src/widgets/dashboard-overview/ui/DashboardOverview.tsx \
        my-app/src/widgets/dashboard-overview/ui/StatCards.tsx
git commit -m "chore(api): sync api.yaml with BE topic endpoints, add StatsRange.all"
```

---

### Task 2: `entities/topic` 타입 확장 + `shared/api/topics.ts` 확장

**Files:**
- Modify: `my-app/src/entities/topic/model/types.ts`
- Modify: `my-app/src/shared/api/topics.ts`
- Modify: `my-app/src/shared/api/index.ts:119-128`
- Modify: `my-app/src/shared/lib/date.ts` (파일 끝에 함수 추가)

**Interfaces:**
- Consumes: `components["schemas"]["TopicResponse" | "UpdateTopicRequest" |
  "TopicStatsResponse" | "TopicEntryCounts" | "TopicTodoCounts" |
  "TopicSourceResponse" | "TopicSourcePageResponse"]` (`schema.d.ts`, Task 1에서 이미 생성됨)
- Produces:
  - `Topic { id, name, description, createdAt, updatedAt, entryCount: number|null,
    todoCount: number|null, digestWatermarkDateKey: string|null }`
  - `TopicStats { topicId, entryCounts, todoCounts, tagCounts, tagCountTotal,
    periodStartDateKey, periodEndDateKey, unreflectedEntryCount }`
  - `TopicSource { kind: "entry"|"todo", id, title, dateKey, retroType: RetrospectiveType|null }`
  - `TopicSourcePage { items: TopicSource[], total, page, size, digestWatermarkDateKey }`
  - `apiUpdateTopic(id, patch): Promise<Topic>`
  - `apiGetTopicStats(topicId): Promise<TopicStats>`
  - `apiGetTopicSources(topicId, {page?, size?}): Promise<TopicSourcePage>`
  - `TopicDigestStreamHandlers.onProgress(processed, total)` (신규 콜백)
  - `formatMonthDayFromDateKey(dateKey): string` ("2026-09-01" → "09.01")

- [ ] **Step 1: 도메인 타입 확장**

`my-app/src/entities/topic/model/types.ts` 전체를 아래로 교체:

```ts
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
```

- [ ] **Step 2: `date.ts`에 축약 포맷 함수 추가**

`my-app/src/shared/lib/date.ts` 파일 끝에 추가:

```ts
/**
 * "YYYY-MM-DD" → "MM.DD" (예: "2026-09-01" → "09.01"). 주제 뷰의 watermark 배너·레일
 * 카드 전용 축약 포맷 — Intl 포맷터를 새로 안 쓰고 date_key 문자열을 그대로 슬라이스한다.
 */
export function formatMonthDayFromDateKey(dateKey: string): string {
  return dateKey.slice(5).replace("-", ".");
}
```

- [ ] **Step 3: `shared/api/topics.ts` 확장**

파일 상단 import를 교체:

```ts
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
```

`toTopic` 매퍼를 교체(신규 nullable 필드 매핑):

```ts
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
```

`toDigest` 매퍼 아래에 새 매퍼 2개 추가:

```ts
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
```

`apiDeleteTopic` 함수 바로 아래(생성/삭제 사이)에 수정 함수 추가:

```ts
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
```

`apiGetDigest` 함수 다음, `TopicDigestStreamHandlers` 인터페이스 앞에 통계/소스 조회 함수 추가:

```ts
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
```

`TopicDigestStreamHandlers`/`StreamEvent`/`streamTopicDigest`를 아래로 교체(진행률 이벤트 추가 —
`in_progress`는 terminal이 아니므로 `terminalDispatched`를 세우지 않고 즉시 return한다):

```ts
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
```

- [ ] **Step 4: API 배럴에 export 추가**

`my-app/src/shared/api/index.ts:119-128`의 기존 블록:

```ts
export {
  apiListTopics,
  apiCreateTopic,
  apiDeleteTopic,
  apiGenerateDigest,
  apiGetDigest,
  streamTopicDigest,
  getTopicLimitFromError,
  type TopicDigestStreamHandlers,
} from "./topics";
```

를 아래로 교체:

```ts
export {
  apiListTopics,
  apiCreateTopic,
  apiUpdateTopic,
  apiDeleteTopic,
  apiGenerateDigest,
  apiGetDigest,
  apiGetTopicStats,
  apiGetTopicSources,
  streamTopicDigest,
  getTopicLimitFromError,
  type TopicDigestStreamHandlers,
} from "./topics";
```

- [ ] **Step 5: 빌드 확인**

이 시점에선 `pnpm build` 전체가 통과하지 않는다 — `TopicSidebar.tsx`/`TopicDigestPane.tsx`/
`useTopics.ts`(옛 i18n 키·옛 훅 형태, Task 4/5/12까지 미수정)와 `useTopicDigest.ts`(신규
`onProgress` 필수 필드 미제공, Task 6까지 미수정)가 아직 이 태스크의 변경과 안 맞기
때문이다 — **정상**이다. 이 태스크가 건드린 4개 파일만 좁혀서 확인한다:

```bash
cd my-app && npx tsc --noEmit -p tsconfig.app.json 2>&1 | grep -E \
  "entities/topic/model/types\.ts|shared/api/topics\.ts|shared/api/index\.ts|shared/lib/date\.ts"
```

Expected: 출력 없음(이 4개 파일 관련 에러 없음). **`my-app/api.yaml`·`my-app/src/shared/api/schema.d.ts`는
절대 건드리지 않는다** — 두 파일은 Task 1이 이미 커밋했고, 이 태스크는 그 안의 스키마 타입을
`components["schemas"][...]`로 **읽기만** 한다. `pnpm gen:api`를 다시 돌리지 않는다.

- [ ] **Step 6: Commit**

```bash
git add my-app/src/entities/topic/model/types.ts my-app/src/shared/api/topics.ts \
        my-app/src/shared/api/index.ts my-app/src/shared/lib/date.ts
git commit -m "feat(topic): extend domain types + API client for stats/sources/PATCH/progress"
```

---

### Task 3: `AppProvider` pass-through 메서드 3개 추가

**Files:**
- Modify: `my-app/src/app/model/types.ts:415-427`
- Modify: `my-app/src/app/providers/AppProvider.tsx`

**Interfaces:**
- Consumes: `apiUpdateTopic`, `apiGetTopicStats`, `apiGetTopicSources` (Task 2)
- Produces: `ArchiveAppContextValue.updateTopic(id, patch): Promise<Topic>`,
  `.getTopicStats(topicId): Promise<TopicStats>`,
  `.getTopicSources(topicId, params): Promise<TopicSourcePage>`

- [ ] **Step 1: 타입 시그니처 추가**

`my-app/src/app/model/types.ts:415-427`의 기존:

```ts
  // ─── Topics ─────────────────────────────────────────────────────────────
  loadTopics: () => Promise<import("@/entities/topic/model/types").Topic[]>;
  createTopic: (
    name: string,
    description: string,
  ) => Promise<import("@/entities/topic/model/types").Topic>;
  deleteTopic: (id: string) => Promise<void>;
  generateTopicDigest: (
    topicId: string,
  ) => Promise<import("@/entities/topic/model/types").TopicDigest>;
  getTopicDigest: (
    topicId: string,
  ) => Promise<import("@/entities/topic/model/types").TopicDigest | null>;
```

를 아래로 교체:

```ts
  // ─── Topics ─────────────────────────────────────────────────────────────
  loadTopics: () => Promise<import("@/entities/topic/model/types").Topic[]>;
  createTopic: (
    name: string,
    description: string,
  ) => Promise<import("@/entities/topic/model/types").Topic>;
  updateTopic: (
    id: string,
    patch: { name?: string; description?: string },
  ) => Promise<import("@/entities/topic/model/types").Topic>;
  deleteTopic: (id: string) => Promise<void>;
  generateTopicDigest: (
    topicId: string,
  ) => Promise<import("@/entities/topic/model/types").TopicDigest>;
  getTopicDigest: (
    topicId: string,
  ) => Promise<import("@/entities/topic/model/types").TopicDigest | null>;
  getTopicStats: (
    topicId: string,
  ) => Promise<import("@/entities/topic/model/types").TopicStats>;
  getTopicSources: (
    topicId: string,
    params: { page?: number; size?: number },
  ) => Promise<import("@/entities/topic/model/types").TopicSourcePage>;
```

- [ ] **Step 2: import 추가**

`my-app/src/app/providers/AppProvider.tsx`의 기존 import 블록(약 149-153행):

```ts
  apiListTopics,
  apiCreateTopic,
  apiDeleteTopic,
  apiGenerateDigest,
  apiGetDigest,
} from "@/shared/api";
```

를 아래로 교체:

```ts
  apiListTopics,
  apiCreateTopic,
  apiUpdateTopic,
  apiDeleteTopic,
  apiGenerateDigest,
  apiGetDigest,
  apiGetTopicStats,
  apiGetTopicSources,
} from "@/shared/api";
```

- [ ] **Step 3: 콜백 구현 추가**

기존(약 933-945행):

```ts
  const createTopic = useCallback(
    (name: string, description: string) => apiCreateTopic(name, description),
    [],
  );
  const deleteTopic = useCallback((id: string) => apiDeleteTopic(id), []);
  const generateTopicDigest = useCallback(
    (topicId: string) => apiGenerateDigest(topicId),
    [],
  );
  const getTopicDigest = useCallback(
    (topicId: string) => apiGetDigest(topicId),
    [],
  );
```

를 아래로 교체:

```ts
  const createTopic = useCallback(
    (name: string, description: string) => apiCreateTopic(name, description),
    [],
  );
  const updateTopic = useCallback(
    (id: string, patch: { name?: string; description?: string }) =>
      apiUpdateTopic(id, patch),
    [],
  );
  const deleteTopic = useCallback((id: string) => apiDeleteTopic(id), []);
  const generateTopicDigest = useCallback(
    (topicId: string) => apiGenerateDigest(topicId),
    [],
  );
  const getTopicDigest = useCallback(
    (topicId: string) => apiGetDigest(topicId),
    [],
  );
  const getTopicStats = useCallback(
    (topicId: string) => apiGetTopicStats(topicId),
    [],
  );
  const getTopicSources = useCallback(
    (topicId: string, params: { page?: number; size?: number }) =>
      apiGetTopicSources(topicId, params),
    [],
  );
```

- [ ] **Step 4: context value 객체에 배선**

기존(약 1722-1727행):

```ts
    // ─── Topics ───────────────────────────────────────────────────────────
    loadTopics,
    createTopic,
    deleteTopic,
    generateTopicDigest,
    getTopicDigest,
```

를 아래로 교체:

```ts
    // ─── Topics ───────────────────────────────────────────────────────────
    loadTopics,
    createTopic,
    updateTopic,
    deleteTopic,
    generateTopicDigest,
    getTopicDigest,
    getTopicStats,
    getTopicSources,
```

- [ ] **Step 5: 빌드 확인**

```bash
cd my-app && pnpm build
```

Expected: 통과.

- [ ] **Step 6: Commit**

```bash
git add my-app/src/app/model/types.ts my-app/src/app/providers/AppProvider.tsx
git commit -m "feat(topic): wire updateTopic/getTopicStats/getTopicSources into AppProvider"
```

---

### Task 4: i18n 키 — ko/en/ja/zh 4개 로케일

기존 `topic.sidebar.*`/`topic.pane.*` 네임스페이스는 사이드바+단일 패널 구조 전제였다.
새 IA(pill 바 / 미선택 피커 / 문서 본문 / 소스 모달)에 맞춰 네임스페이스를 재편한다.
`topic.generate.failed`/`topic.generate.alreadyInProgress`는 그대로 유지(여전히 쓰임).
`common.cancel`/`common.confirm`/`common.delete`/`common.close`는 새로 만들지 않고 재사용한다.

**Files:**
- Modify: `my-app/src/shared/lib/i18n/keys.ts`
- Modify: `my-app/src/shared/lib/i18n/locales/ko.ts`
- Modify: `my-app/src/shared/lib/i18n/locales/en.ts`
- Modify: `my-app/src/shared/lib/i18n/locales/ja.ts`
- Modify: `my-app/src/shared/lib/i18n/locales/zh.ts`

**Interfaces:**
- Produces: `TranslationKey` 유니온에 아래 신규 키 전부 포함. Task 8~11의 컴포넌트가
  `t("topic.pill.newTopic")` 형태로 소비한다.

- [ ] **Step 1: `keys.ts`에서 기존 `topic.sidebar.*`/`topic.pane.*` 제거하고 신규 키 추가**

`my-app/src/shared/lib/i18n/keys.ts`에서 기존 블록(314행 부근):

```ts
  | "topic.sidebar.newTopic"
  | "topic.sidebar.namePlaceholder"
  | "topic.sidebar.descPlaceholder"
  | "topic.sidebar.deleteTitle"
  | "topic.sidebar.deleteMessage"
  | "topic.sidebar.limitReached"
  | "topic.sidebar.nameDuplicated"
  | "topic.sidebar.generateButton"
  | "topic.sidebar.generateInProgress"
  | "topic.sidebar.listLoading"
  | "topic.sidebar.listError"
  | "topic.sidebar.emptyTitle"
  | "topic.pane.loading"
  | "topic.pane.loadError"
  | "topic.pane.emptyTitle"
  | "topic.pane.emptyDesc"
  | "topic.pane.noSelection"
  | "topic.pane.watermark"
  | "topic.generate.failed"
  | "topic.generate.alreadyInProgress"
```

를 아래로 교체:

```ts
  | "topic.generate.failed"
  | "topic.generate.alreadyInProgress"
  // ── pill bar (crumb A) ──
  | "topic.pill.newTopic"
  | "topic.pill.searchPlaceholder"
  | "topic.pill.deselect"
  | "topic.pill.viewAll"
  | "topic.pill.searchEmptyTitle"
  | "topic.pill.searchEmptyHint"
  | "topic.pill.searchEmptyCreate"
  | "topic.pill.searchClear"
  | "topic.pill.emptyTitle"
  | "topic.pill.emptyDesc"
  | "topic.pill.emptyCta"
  | "topic.pill.listError"
  // ── create/delete modals ──
  | "topic.crud.title"
  | "topic.crud.subtitle"
  | "topic.crud.namePlaceholder"
  | "topic.crud.descPlaceholder"
  | "topic.crud.nameDuplicated"
  | "topic.crud.limitReached"
  | "topic.crud.deleteTitle"
  | "topic.crud.deleteMessage"
  // ── unselected picker (crumb B) ──
  | "topic.picker.title"
  | "topic.picker.reflectedUntil"
  | "topic.picker.notReflected"
  | "topic.picker.noDescription"
  | "topic.picker.searchPlaceholder"
  | "topic.picker.rememberHint"
  // ── document body ──
  | "topic.doc.statsLine"
  | "topic.doc.editTrigger"
  | "topic.doc.delete"
  | "topic.doc.editSaveHint"
  | "topic.doc.bannerReflected"
  | "topic.doc.bannerUnreflected"
  | "topic.doc.regenerate"
  | "topic.doc.railReflectedLabel"
  | "topic.doc.railReflectedValue"
  | "topic.doc.railUnreflectedCount"
  | "topic.doc.railSourceLabel"
  | "topic.doc.railSourceDaily"
  | "topic.doc.railSourceWeekly"
  | "topic.doc.railSourceTodo"
  | "topic.doc.railTagLabel"
  | "topic.doc.railTagMore"
  // ── document states ──
  | "topic.doc.emptyTitle"
  | "topic.doc.emptyDesc"
  | "topic.doc.emptyCta"
  | "topic.doc.emptyViewSources"
  | "topic.doc.emptyHint"
  | "topic.doc.generatingProgress"
  | "topic.doc.generatingHint"
  | "topic.doc.loadErrorTitle"
  | "topic.doc.loadErrorDesc"
  | "topic.doc.loadErrorRetry"
  | "topic.doc.loadErrorViewSourcesOnly"
  | "topic.doc.generateErrorTitle"
  | "topic.doc.generateErrorDesc"
  | "topic.doc.generateErrorRetry"
  | "topic.doc.generateErrorViewPrevious"
  // ── source list modal ──
  | "topic.source.candidateTitle"
  | "topic.source.candidateDesc"
  | "topic.source.reflectedTitle"
  | "topic.source.reflectedDesc"
  | "topic.source.loading"
  | "topic.source.loadErrorTitle"
  | "topic.source.loadErrorDesc"
  | "topic.source.loadErrorRetry"
  | "topic.source.emptyTitle"
  | "topic.source.emptyDesc"
  | "topic.source.editDescription"
  | "topic.source.prev"
  | "topic.source.next"
  | "topic.source.pageSummary"
  | "topic.source.legendDaily"
  | "topic.source.legendWeekly"
  | "topic.source.legendMonthly"
  | "topic.source.legendYearly"
  | "topic.source.legendTodo"
  | "topic.source.legendOther"
  | "topic.source.ariaEntry"
  | "topic.source.ariaTodo"
```

- [ ] **Step 2: `ko.ts` 갱신**

`my-app/src/shared/lib/i18n/locales/ko.ts`에서 기존 `topic.sidebar.*`/`topic.pane.*` 블록
(320-338행 부근, `topic.generate.*` 2줄은 유지)을 아래로 교체:

```ts
  "topic.generate.failed": "정리 생성에 실패했어요. 잠시 후 다시 시도해주세요.",
  "topic.generate.alreadyInProgress": "이미 정리를 생성하고 있어요. 완료될 때까지 기다려주세요.",
  "topic.pill.newTopic": "새 주제",
  "topic.pill.searchPlaceholder": "주제 검색",
  "topic.pill.deselect": "선택 해제",
  "topic.pill.viewAll": "전체 {count}",
  "topic.pill.searchEmptyTitle": "\"{query}\"와 일치하는 주제가 없습니다",
  "topic.pill.searchEmptyHint": "이름과 설명을 함께 검색합니다.",
  "topic.pill.searchEmptyCreate": "\"{query}\"로 만들기",
  "topic.pill.searchClear": "검색 지우기",
  "topic.pill.emptyTitle": "주제를 만들면 회고를 한 편의 문서로 묶어드립니다",
  "topic.pill.emptyDesc": "관심사를 하나 정하면 관련 일일·주간 회고와 할 일을 모아 요약·패턴·반복 신호를 정리합니다.",
  "topic.pill.emptyCta": "첫 주제 만들기",
  "topic.pill.listError": "주제 목록을 불러오지 못했어요.",
  "topic.crud.title": "새 주제 만들기",
  "topic.crud.subtitle": "이름과 설명으로 어떤 회고를 모을지 정합니다.",
  "topic.crud.namePlaceholder": "주제 이름 (예: ARCHIVE 프로젝트)",
  "topic.crud.descPlaceholder": "설명 (선택)",
  "topic.crud.nameDuplicated": "이미 같은 이름의 주제가 있어요.",
  "topic.crud.limitReached": "주제는 최대 {limit}개까지 만들 수 있어요.",
  "topic.crud.deleteTitle": "\"{name}\" 주제를 삭제할까요?",
  "topic.crud.deleteMessage": "정리된 문서와 이 주제 설정이 삭제됩니다. 회고와 할 일 원본은 삭제되지 않습니다.",
  "topic.picker.title": "어떤 주제를 볼까요?",
  "topic.picker.reflectedUntil": "{date}까지 정리됨",
  "topic.picker.notReflected": "정리 안 됨",
  "topic.picker.noDescription": "설명 없음",
  "topic.picker.searchPlaceholder": "주제 검색",
  "topic.picker.rememberHint": "마지막으로 본 주제를 기억해 다음 진입 시 선택합니다.",
  "topic.doc.statsLine": "회고 {entries} · 할 일 {todos} · 태그 {tags}",
  "topic.doc.editTrigger": "제목·설명 클릭하면 편집",
  "topic.doc.delete": "주제 삭제",
  "topic.doc.editSaveHint": "↵ 저장 · esc 취소",
  "topic.doc.bannerReflected": "{date}까지의 회고가 반영된 문서입니다",
  "topic.doc.bannerUnreflected": "이후 작성된 회고 {count}개는 아직 포함되지 않았습니다. 다시 정리하면 이 문서는 새 결과로 대체됩니다 — 기존 내용에 덧붙지 않습니다.",
  "topic.doc.regenerate": "다시 정리하기",
  "topic.doc.railReflectedLabel": "반영 시점",
  "topic.doc.railReflectedValue": "{date}까지",
  "topic.doc.railUnreflectedCount": "미반영 회고 {count}개",
  "topic.doc.railSourceLabel": "소스",
  "topic.doc.railSourceDaily": "일일 회고",
  "topic.doc.railSourceWeekly": "주간 회고",
  "topic.doc.railSourceTodo": "할 일",
  "topic.doc.railTagLabel": "태그",
  "topic.doc.railTagMore": "+{count}",
  "topic.doc.emptyTitle": "이 주제는 아직 정리되지 않았습니다",
  "topic.doc.emptyDesc": "회고 {entries}개와 할 일 {todos}개가 이 주제에 묶여 있습니다. 정리하면 한 편의 브리핑 문서로 만들어 드립니다.",
  "topic.doc.emptyCta": "지금 정리하기",
  "topic.doc.emptyViewSources": "소스 {count}개 보기",
  "topic.doc.emptyHint": "1~2분 정도 걸립니다.",
  "topic.doc.generatingProgress": "소스 {total}개를 읽고 있습니다 · {processed} / {total}",
  "topic.doc.generatingHint": "이 화면을 벗어나도 정리는 계속됩니다. 재생성이면 이전 문서와 반영 시점을 그대로 유지합니다.",
  "topic.doc.loadErrorTitle": "정리된 문서를 불러오지 못했습니다",
  "topic.doc.loadErrorDesc": "네트워크 문제일 수 있습니다. 이전에 정리한 내용은 서버에 그대로 남아 있습니다.",
  "topic.doc.loadErrorRetry": "다시 불러오기",
  "topic.doc.loadErrorViewSourcesOnly": "소스만 보기",
  "topic.doc.generateErrorTitle": "정리하는 중에 문제가 생겼습니다",
  "topic.doc.generateErrorDesc": "이전에 정리한 {date} 기준 문서는 그대로 유지됩니다. 다시 시도하면 그 문서를 새 결과로 대체합니다.",
  "topic.doc.generateErrorRetry": "다시 시도",
  "topic.doc.generateErrorViewPrevious": "이전 문서 보기",
  "topic.source.candidateTitle": "이 주제에 묶인 소스 {count}개",
  "topic.source.candidateDesc": "정리하면 아래 회고와 할 일이 문서에 반영됩니다.",
  "topic.source.reflectedTitle": "마지막 정리에 반영된 소스",
  "topic.source.reflectedDesc": "{date} 기준 문서에 실제로 쓰인 회고 {entries}개 · 할 일 {todos}개",
  "topic.source.loading": "소스를 불러오고 있습니다",
  "topic.source.loadErrorTitle": "소스 목록을 불러오지 못했습니다",
  "topic.source.loadErrorDesc": "네트워크 문제일 수 있습니다. 회고와 할 일 원본은 그대로 남아 있습니다.",
  "topic.source.loadErrorRetry": "다시 시도",
  "topic.source.emptyTitle": "아직 이 주제에 묶인 회고나 할 일이 없습니다",
  "topic.source.emptyDesc": "회고를 쓰거나 할 일에 관련 태그를 붙이면 여기에 모입니다. 주제 이름과 설명이 구체적일수록 더 잘 모입니다.",
  "topic.source.editDescription": "주제 설명 편집",
  "topic.source.prev": "이전",
  "topic.source.next": "다음",
  "topic.source.pageSummary": "{total}개 중 {from}–{to}",
  "topic.source.legendDaily": "일간",
  "topic.source.legendWeekly": "주간",
  "topic.source.legendMonthly": "월간",
  "topic.source.legendYearly": "연간",
  "topic.source.legendTodo": "할 일",
  "topic.source.legendOther": "그 외",
  "topic.source.ariaEntry": "{type} 회고",
  "topic.source.ariaTodo": "할 일",
```

- [ ] **Step 3: `en.ts` 갱신**

같은 위치(322-341행 부근)를 아래로 교체:

```ts
  "topic.generate.failed": "Failed to generate the digest. Please try again.",
  "topic.generate.alreadyInProgress": "A digest is already being generated. Please wait for it to finish.",
  "topic.pill.newTopic": "New topic",
  "topic.pill.searchPlaceholder": "Search topics",
  "topic.pill.deselect": "Deselect",
  "topic.pill.viewAll": "All {count}",
  "topic.pill.searchEmptyTitle": "No topics match \"{query}\"",
  "topic.pill.searchEmptyHint": "Search matches both name and description.",
  "topic.pill.searchEmptyCreate": "Create \"{query}\"",
  "topic.pill.searchClear": "Clear search",
  "topic.pill.emptyTitle": "Create a topic to bundle your retrospectives into one briefing",
  "topic.pill.emptyDesc": "Pick a focus area and we'll gather related daily/weekly entries and todos to summarize patterns and recurring signals.",
  "topic.pill.emptyCta": "Create your first topic",
  "topic.pill.listError": "Failed to load topics.",
  "topic.crud.title": "Create a new topic",
  "topic.crud.subtitle": "Name it and describe what it should gather.",
  "topic.crud.namePlaceholder": "Topic name (e.g. ARCHIVE project)",
  "topic.crud.descPlaceholder": "Description (optional)",
  "topic.crud.nameDuplicated": "A topic with this name already exists.",
  "topic.crud.limitReached": "You can create up to {limit} topics.",
  "topic.crud.deleteTitle": "Delete \"{name}\"?",
  "topic.crud.deleteMessage": "The digest and this topic's settings will be deleted. The original entries and todos are not deleted.",
  "topic.picker.title": "Which topic would you like to see?",
  "topic.picker.reflectedUntil": "Digested through {date}",
  "topic.picker.notReflected": "Not digested yet",
  "topic.picker.noDescription": "No description",
  "topic.picker.searchPlaceholder": "Search topics",
  "topic.picker.rememberHint": "We remember the last topic you viewed for next time.",
  "topic.doc.statsLine": "{entries} entries · {todos} todos · {tags} tags",
  "topic.doc.editTrigger": "Click the title or description to edit",
  "topic.doc.delete": "Delete topic",
  "topic.doc.editSaveHint": "↵ save · esc cancel",
  "topic.doc.bannerReflected": "This document reflects entries through {date}",
  "topic.doc.bannerUnreflected": "{count} entries written since then aren't included yet. Regenerating will replace this document with a new result — it won't be appended to.",
  "topic.doc.regenerate": "Regenerate",
  "topic.doc.railReflectedLabel": "Reflected through",
  "topic.doc.railReflectedValue": "{date}",
  "topic.doc.railUnreflectedCount": "{count} unreflected entries",
  "topic.doc.railSourceLabel": "Sources",
  "topic.doc.railSourceDaily": "Daily entries",
  "topic.doc.railSourceWeekly": "Weekly entries",
  "topic.doc.railSourceTodo": "Todos",
  "topic.doc.railTagLabel": "Tags",
  "topic.doc.railTagMore": "+{count}",
  "topic.doc.emptyTitle": "This topic hasn't been digested yet",
  "topic.doc.emptyDesc": "{entries} entries and {todos} todos are tied to this topic. Digesting turns them into one briefing document.",
  "topic.doc.emptyCta": "Digest now",
  "topic.doc.emptyViewSources": "View {count} sources",
  "topic.doc.emptyHint": "Usually takes 1–2 minutes.",
  "topic.doc.generatingProgress": "Reading {total} sources · {processed} / {total}",
  "topic.doc.generatingHint": "Digesting continues even if you leave this screen. A regeneration keeps the previous document and watermark until it finishes.",
  "topic.doc.loadErrorTitle": "Couldn't load the digest",
  "topic.doc.loadErrorDesc": "This may be a network issue. Content digested earlier is still safe on the server.",
  "topic.doc.loadErrorRetry": "Reload",
  "topic.doc.loadErrorViewSourcesOnly": "View sources only",
  "topic.doc.generateErrorTitle": "Something went wrong while digesting",
  "topic.doc.generateErrorDesc": "The document as of {date} is kept as-is. Retrying will replace it with a new result.",
  "topic.doc.generateErrorRetry": "Retry",
  "topic.doc.generateErrorViewPrevious": "View previous document",
  "topic.source.candidateTitle": "{count} sources tied to this topic",
  "topic.source.candidateDesc": "Digesting will reflect the entries and todos below.",
  "topic.source.reflectedTitle": "Sources reflected in the last digest",
  "topic.source.reflectedDesc": "{entries} entries · {todos} todos actually used in the document as of {date}",
  "topic.source.loading": "Loading sources",
  "topic.source.loadErrorTitle": "Couldn't load the source list",
  "topic.source.loadErrorDesc": "This may be a network issue. Your original entries and todos are unaffected.",
  "topic.source.loadErrorRetry": "Retry",
  "topic.source.emptyTitle": "No entries or todos are tied to this topic yet",
  "topic.source.emptyDesc": "Write an entry or tag a todo related to it and it'll show up here. A more specific name and description helps matching.",
  "topic.source.editDescription": "Edit topic description",
  "topic.source.prev": "Previous",
  "topic.source.next": "Next",
  "topic.source.pageSummary": "{from}–{to} of {total}",
  "topic.source.legendDaily": "Daily",
  "topic.source.legendWeekly": "Weekly",
  "topic.source.legendMonthly": "Monthly",
  "topic.source.legendYearly": "Yearly",
  "topic.source.legendTodo": "Todo",
  "topic.source.legendOther": "Other",
  "topic.source.ariaEntry": "{type} entry",
  "topic.source.ariaTodo": "Todo",
```

- [ ] **Step 4: `ja.ts` 갱신**

같은 위치(320-339행 부근)를 아래로 교체:

```ts
  "topic.generate.failed": "整理の生成に失敗しました。しばらくしてからもう一度お試しください。",
  "topic.generate.alreadyInProgress": "すでに整理を生成中です。完了までお待ちください。",
  "topic.pill.newTopic": "新しいトピック",
  "topic.pill.searchPlaceholder": "トピックを検索",
  "topic.pill.deselect": "選択解除",
  "topic.pill.viewAll": "すべて {count}",
  "topic.pill.searchEmptyTitle": "「{query}」に一致するトピックがありません",
  "topic.pill.searchEmptyHint": "名前と説明の両方から検索します。",
  "topic.pill.searchEmptyCreate": "「{query}」で作成",
  "topic.pill.searchClear": "検索をクリア",
  "topic.pill.emptyTitle": "トピックを作ると振り返りを1つの文書にまとめられます",
  "topic.pill.emptyDesc": "関心事を1つ決めると、関連する日次・週次の振り返りとタスクを集めて要約・パターン・繰り返しの兆候を整理します。",
  "topic.pill.emptyCta": "最初のトピックを作成",
  "topic.pill.listError": "トピック一覧の読み込みに失敗しました。",
  "topic.crud.title": "新しいトピックを作成",
  "topic.crud.subtitle": "名前と説明で、何をまとめるトピックか決めます。",
  "topic.crud.namePlaceholder": "トピック名（例：ARCHIVEプロジェクト）",
  "topic.crud.descPlaceholder": "説明（任意）",
  "topic.crud.nameDuplicated": "同じ名前のトピックが既にあります。",
  "topic.crud.limitReached": "トピックは最大{limit}個まで作成できます。",
  "topic.crud.deleteTitle": "「{name}」を削除しますか？",
  "topic.crud.deleteMessage": "整理された文書とこのトピックの設定が削除されます。振り返り・タスクの元データは削除されません。",
  "topic.picker.title": "どのトピックを見ますか？",
  "topic.picker.reflectedUntil": "{date}まで整理済み",
  "topic.picker.notReflected": "未整理",
  "topic.picker.noDescription": "説明なし",
  "topic.picker.searchPlaceholder": "トピックを検索",
  "topic.picker.rememberHint": "最後に見たトピックを記憶し、次回はそれを選択します。",
  "topic.doc.statsLine": "振り返り {entries} ・タスク {todos} ・タグ {tags}",
  "topic.doc.editTrigger": "タイトル・説明をクリックすると編集できます",
  "topic.doc.delete": "トピックを削除",
  "topic.doc.editSaveHint": "↵ 保存 ・esc キャンセル",
  "topic.doc.bannerReflected": "{date}までの振り返りが反映された文書です",
  "topic.doc.bannerUnreflected": "それ以降に書かれた振り返り{count}件はまだ含まれていません。再整理すると、この文書は新しい結果に置き換わります — 既存の内容には追記されません。",
  "topic.doc.regenerate": "再整理する",
  "topic.doc.railReflectedLabel": "反映時点",
  "topic.doc.railReflectedValue": "{date}まで",
  "topic.doc.railUnreflectedCount": "未反映の振り返り{count}件",
  "topic.doc.railSourceLabel": "ソース",
  "topic.doc.railSourceDaily": "デイリー振り返り",
  "topic.doc.railSourceWeekly": "ウィークリー振り返り",
  "topic.doc.railSourceTodo": "タスク",
  "topic.doc.railTagLabel": "タグ",
  "topic.doc.railTagMore": "+{count}",
  "topic.doc.emptyTitle": "このトピックはまだ整理されていません",
  "topic.doc.emptyDesc": "振り返り{entries}件とタスク{todos}件がこのトピックに紐づいています。整理すると1本のブリーフィング文書になります。",
  "topic.doc.emptyCta": "今すぐ整理する",
  "topic.doc.emptyViewSources": "ソース{count}件を見る",
  "topic.doc.emptyHint": "1〜2分ほどかかります。",
  "topic.doc.generatingProgress": "ソース{total}件を読み込み中 ・{processed} / {total}",
  "topic.doc.generatingHint": "この画面を離れても整理は続きます。再整理の場合、完了するまで前の文書と反映時点はそのまま保持されます。",
  "topic.doc.loadErrorTitle": "整理された文書を読み込めませんでした",
  "topic.doc.loadErrorDesc": "ネットワークの問題かもしれません。以前整理した内容はサーバーにそのまま残っています。",
  "topic.doc.loadErrorRetry": "再読み込み",
  "topic.doc.loadErrorViewSourcesOnly": "ソースだけ見る",
  "topic.doc.generateErrorTitle": "整理中に問題が発生しました",
  "topic.doc.generateErrorDesc": "以前整理した{date}時点の文書はそのまま維持されます。再試行すると、その文書が新しい結果に置き換わります。",
  "topic.doc.generateErrorRetry": "再試行",
  "topic.doc.generateErrorViewPrevious": "以前の文書を見る",
  "topic.source.candidateTitle": "このトピックに紐づくソース{count}件",
  "topic.source.candidateDesc": "整理すると、下の振り返りとタスクが文書に反映されます。",
  "topic.source.reflectedTitle": "最後の整理に反映されたソース",
  "topic.source.reflectedDesc": "{date}時点の文書に実際に使われた振り返り{entries}件・タスク{todos}件",
  "topic.source.loading": "ソースを読み込んでいます",
  "topic.source.loadErrorTitle": "ソース一覧を読み込めませんでした",
  "topic.source.loadErrorDesc": "ネットワークの問題かもしれません。振り返り・タスクの元データには影響ありません。",
  "topic.source.loadErrorRetry": "再試行",
  "topic.source.emptyTitle": "まだこのトピックに紐づく振り返りやタスクがありません",
  "topic.source.emptyDesc": "関連する振り返りを書いたり、タスクにタグを付けたりするとここに集まります。トピック名と説明が具体的なほどよくマッチします。",
  "topic.source.editDescription": "トピックの説明を編集",
  "topic.source.prev": "前へ",
  "topic.source.next": "次へ",
  "topic.source.pageSummary": "{total}件中 {from}–{to}",
  "topic.source.legendDaily": "デイリー",
  "topic.source.legendWeekly": "ウィークリー",
  "topic.source.legendMonthly": "マンスリー",
  "topic.source.legendYearly": "年間",
  "topic.source.legendTodo": "タスク",
  "topic.source.legendOther": "その他",
  "topic.source.ariaEntry": "{type}の振り返り",
  "topic.source.ariaTodo": "タスク",
```

- [ ] **Step 5: `zh.ts` 갱신**

같은 위치(318-337행 부근)를 아래로 교체:

```ts
  "topic.generate.failed": "生成整理失败，请稍后重试。",
  "topic.generate.alreadyInProgress": "已经在生成整理中，请等待完成。",
  "topic.pill.newTopic": "新建主题",
  "topic.pill.searchPlaceholder": "搜索主题",
  "topic.pill.deselect": "取消选择",
  "topic.pill.viewAll": "全部 {count}",
  "topic.pill.searchEmptyTitle": "没有与「{query}」匹配的主题",
  "topic.pill.searchEmptyHint": "同时搜索名称和描述。",
  "topic.pill.searchEmptyCreate": "以「{query}」创建",
  "topic.pill.searchClear": "清除搜索",
  "topic.pill.emptyTitle": "创建主题即可把回顾整理成一篇简报",
  "topic.pill.emptyDesc": "确定一个关注点后，会收集相关的每日/每周回顾和待办，整理出摘要、模式和反复出现的信号。",
  "topic.pill.emptyCta": "创建第一个主题",
  "topic.pill.listError": "加载主题列表失败。",
  "topic.crud.title": "新建主题",
  "topic.crud.subtitle": "用名称和描述决定要收集哪些回顾。",
  "topic.crud.namePlaceholder": "主题名称（例如：ARCHIVE 项目）",
  "topic.crud.descPlaceholder": "描述（可选）",
  "topic.crud.nameDuplicated": "已存在同名主题。",
  "topic.crud.limitReached": "最多可以创建 {limit} 个主题。",
  "topic.crud.deleteTitle": "要删除「{name}」吗？",
  "topic.crud.deleteMessage": "整理好的文档和该主题的设置将被删除。回顾和待办的原始数据不会被删除。",
  "topic.picker.title": "要查看哪个主题？",
  "topic.picker.reflectedUntil": "已整理至 {date}",
  "topic.picker.notReflected": "尚未整理",
  "topic.picker.noDescription": "暂无描述",
  "topic.picker.searchPlaceholder": "搜索主题",
  "topic.picker.rememberHint": "会记住你上次查看的主题，下次进入时自动选中。",
  "topic.doc.statsLine": "回顾 {entries} · 待办 {todos} · 标签 {tags}",
  "topic.doc.editTrigger": "点击标题或描述即可编辑",
  "topic.doc.delete": "删除主题",
  "topic.doc.editSaveHint": "↵ 保存 · esc 取消",
  "topic.doc.bannerReflected": "本文档已反映截至 {date} 的回顾",
  "topic.doc.bannerUnreflected": "此后新写的 {count} 篇回顾尚未包含在内。重新整理会用新结果替换本文档 —— 不会在原有内容上追加。",
  "topic.doc.regenerate": "重新整理",
  "topic.doc.railReflectedLabel": "反映时点",
  "topic.doc.railReflectedValue": "截至 {date}",
  "topic.doc.railUnreflectedCount": "{count} 篇未反映的回顾",
  "topic.doc.railSourceLabel": "来源",
  "topic.doc.railSourceDaily": "每日回顾",
  "topic.doc.railSourceWeekly": "每周回顾",
  "topic.doc.railSourceTodo": "待办",
  "topic.doc.railTagLabel": "标签",
  "topic.doc.railTagMore": "+{count}",
  "topic.doc.emptyTitle": "这个主题还没有整理过",
  "topic.doc.emptyDesc": "已有 {entries} 篇回顾和 {todos} 个待办与该主题相关。整理后会生成一篇简报文档。",
  "topic.doc.emptyCta": "立即整理",
  "topic.doc.emptyViewSources": "查看 {count} 个来源",
  "topic.doc.emptyHint": "大约需要 1~2 分钟。",
  "topic.doc.generatingProgress": "正在读取 {total} 个来源 · {processed} / {total}",
  "topic.doc.generatingHint": "离开此页面整理仍会继续。如果是重新整理，完成前会保留原文档和反映时点。",
  "topic.doc.loadErrorTitle": "未能加载整理文档",
  "topic.doc.loadErrorDesc": "可能是网络问题。此前整理的内容仍原样保存在服务器上。",
  "topic.doc.loadErrorRetry": "重新加载",
  "topic.doc.loadErrorViewSourcesOnly": "仅查看来源",
  "topic.doc.generateErrorTitle": "整理过程中出现了问题",
  "topic.doc.generateErrorDesc": "此前整理的截至 {date} 的文档将保持不变。重试会用新结果替换该文档。",
  "topic.doc.generateErrorRetry": "重试",
  "topic.doc.generateErrorViewPrevious": "查看此前的文档",
  "topic.source.candidateTitle": "与该主题相关的来源 {count} 个",
  "topic.source.candidateDesc": "整理后会反映下面的回顾和待办。",
  "topic.source.reflectedTitle": "最后一次整理反映的来源",
  "topic.source.reflectedDesc": "截至 {date} 的文档实际使用了 {entries} 篇回顾 · {todos} 个待办",
  "topic.source.loading": "正在加载来源",
  "topic.source.loadErrorTitle": "未能加载来源列表",
  "topic.source.loadErrorDesc": "可能是网络问题。回顾和待办的原始数据不受影响。",
  "topic.source.loadErrorRetry": "重试",
  "topic.source.emptyTitle": "该主题下还没有相关的回顾或待办",
  "topic.source.emptyDesc": "写一篇相关回顾，或给待办打上相关标签，就会出现在这里。主题名称和描述越具体，匹配效果越好。",
  "topic.source.editDescription": "编辑主题描述",
  "topic.source.prev": "上一页",
  "topic.source.next": "下一页",
  "topic.source.pageSummary": "共 {total} 个 · {from}–{to}",
  "topic.source.legendDaily": "每日",
  "topic.source.legendWeekly": "每周",
  "topic.source.legendMonthly": "每月",
  "topic.source.legendYearly": "每年",
  "topic.source.legendTodo": "待办",
  "topic.source.legendOther": "其他",
  "topic.source.ariaEntry": "{type}回顾",
  "topic.source.ariaTodo": "待办",
```

- [ ] **Step 6: 빌드 확인**

```bash
cd my-app && pnpm build
```

Expected: 통과. (기존 `topic.sidebar.*`/`topic.pane.*`를 참조하던 `TopicSidebar.tsx`/
`TopicDigestPane.tsx`는 Task 12에서 삭제하기 전까지 이 시점엔 아직 남아있어 컴파일 에러가
난다 — **Task 12까지는 이 에러가 정상**이다. 여기서는 `keys.ts`/로케일 4개 파일만 타입
문법 오류 없이 저장됐는지 `git diff`로 눈으로 확인한다.)

```bash
cd my-app && git diff --stat src/shared/lib/i18n/
```

Expected: 5개 파일(keys.ts + 로케일 4개) 변경.

- [ ] **Step 7: Commit**

```bash
git add my-app/src/shared/lib/i18n/
git commit -m "feat(i18n): replace topic.sidebar/pane namespace with pill/crud/picker/doc/source keys"
```

---

### Task 5: `useTopics` 확장(`update`) + `useLastViewedTopic` 훅

**Files:**
- Modify: `my-app/src/widgets/retrospective-studio/model/useTopics.ts`
- Create: `my-app/src/widgets/retrospective-studio/model/useLastViewedTopic.ts`

**Interfaces:**
- Consumes: `useArchiveApp().updateTopic` (Task 3)
- Produces: `UseTopicsResult.update(id, patch): Promise<Topic>`,
  `useLastViewedTopic(): [string | null, (id: string | null) => void]`

- [ ] **Step 1: `useTopics.ts`에 `update` 추가**

`my-app/src/widgets/retrospective-studio/model/useTopics.ts` 전체를 아래로 교체:

```ts
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
```

- [ ] **Step 2: `useLastViewedTopic.ts` 작성**

`my-app/src/widgets/retrospective-studio/model/useLastViewedTopic.ts`(신규):

```ts
import { useCallback, useState } from "react";

/**
 * 주제 뷰에서 마지막으로 선택했던 주제 id의 로컬 영속화(결정 19).
 *
 * API 계약(/settings)에 없는 FE 전용 UI 선호도이므로 서버로 동기화하지 않고
 * localStorage 에만 저장한다([[todoFilterPrefs]] 의 rangeDays 저장과 동일한 취지).
 * 그 주제가 삭제됐을 때의 폴백(존재 여부 검증)은 이 훅이 아니라 소비 측
 * (TopicsPane)이 topics 목록과 대조해서 처리한다 — 이 훅은 순수 저장/복원만 한다.
 */
const KEY = "archive.lastViewedTopicId";

function read(): string | null {
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null;
  }
}

function write(id: string | null): void {
  try {
    if (id === null) localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, id);
  } catch {
    /* localStorage 접근 불가(프라이빗 모드 등) 시 무시 */
  }
}

export function useLastViewedTopic(): [string | null, (id: string | null) => void] {
  const [id, setIdState] = useState<string | null>(() => read());
  const setId = useCallback((next: string | null) => {
    setIdState(next);
    write(next);
  }, []);
  return [id, setId];
}
```

- [ ] **Step 3: 빌드 확인**

```bash
cd my-app && pnpm build
```

Expected: `useTopics.ts`/`useLastViewedTopic.ts`는 통과. `TopicSidebar.tsx`가 옛 `remove`
시그니처(변경 없음이라 문제 없음)와 옛 i18n 키(Task 4에서 지움)를 참조해 **에러가 계속
난다 — Task 12까지 정상**. 이 태스크에서는 새 파일 2개에 문법/타입 오류가 없는지만
`tsc --noEmit`으로 부분 확인한다:

```bash
cd my-app && npx tsc --noEmit -p tsconfig.app.json 2>&1 | grep -E "useTopics\.ts|useLastViewedTopic\.ts"
```

Expected: 출력 없음(이 두 파일 관련 에러 없음).

- [ ] **Step 4: Commit**

```bash
git add my-app/src/widgets/retrospective-studio/model/useTopics.ts \
        my-app/src/widgets/retrospective-studio/model/useLastViewedTopic.ts
git commit -m "feat(topic): add useTopics.update + useLastViewedTopic"
```

---

### Task 6: `useTopicDigest` — 진행률 + 마운트 시 진행 중 상태 복귀

기존 훅은 `generate()`를 호출해야만 폴링+SSE 감시가 시작된다. 재진입 시 이미 서버에서
진행 중인 정리를 감시하지 못해 "이 화면을 벗어나도 정리는 계속됩니다"(§3.2 E)가 거짓이
된다. `startWatching`/`finish`를 `generate()` 밖으로 꺼내 마운트 시에도 재사용한다.

**Files:**
- Modify: `my-app/src/widgets/retrospective-studio/model/useTopicDigest.ts`

**Interfaces:**
- Consumes: `streamTopicDigest`(Task 2, `onProgress` 콜백 포함)
- Produces: `UseTopicDigestResult.progress: { processed: number; total: number } | null`

- [ ] **Step 1: 파일 전체 교체**

`my-app/src/widgets/retrospective-studio/model/useTopicDigest.ts` 전체를 아래로 교체:

```ts
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
  }, [topicId, getTopicDigest, stopWatch, startWatching]);

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
      .then(() => startWatching())
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

  return { digest, loading, loadError, generating, progress, generateError, generate };
}
```

- [ ] **Step 2: 빌드 확인**

```bash
cd my-app && npx tsc --noEmit -p tsconfig.app.json 2>&1 | grep "useTopicDigest\.ts"
```

Expected: 출력 없음.

- [ ] **Step 3: Commit**

```bash
git add my-app/src/widgets/retrospective-studio/model/useTopicDigest.ts
git commit -m "feat(topic): add SSE progress + resume watching on mount to useTopicDigest"
```

---

### Task 7: `useTopicStats` 신규 훅

digest와 완전히 독립된 로딩/에러 — 실패해도 메타 줄·레일 카드만 빠지고 본문 전체를
에러로 덮지 않는다(결정: stats 부분 실패 허용).

**Files:**
- Create: `my-app/src/widgets/retrospective-studio/model/useTopicStats.ts`

**Interfaces:**
- Consumes: `useArchiveApp().getTopicStats`(Task 3)
- Produces: `useTopicStats(topicId): { stats: TopicStats | null, loading: boolean, error: boolean }`

- [ ] **Step 1: 파일 작성**

`my-app/src/widgets/retrospective-studio/model/useTopicStats.ts`(신규):

```ts
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
```

- [ ] **Step 2: 빌드 확인**

```bash
cd my-app && npx tsc --noEmit -p tsconfig.app.json 2>&1 | grep "useTopicStats\.ts"
```

Expected: 출력 없음.

- [ ] **Step 3: Commit**

```bash
git add my-app/src/widgets/retrospective-studio/model/useTopicStats.ts
git commit -m "feat(topic): add useTopicStats hook (independent of digest loading)"
```

---

### Task 8: `TopicPillBar` 컴포넌트 (크롬 A)

한 줄 고정 pill 목록 + 8개 초과 시 검색·전체 드로어 + 0개 첫 진입 변형 + 새 주제 생성 모달.
드로어 검색과 상단 검색은 **하나의 상태를 공유**한다(드로어는 "전체 목록을 스크롤 가능한
패널로 펼쳐 보여주는 것"이지 별도 검색 표면이 아니다 — 확정안 §2-C가 두 입력을 따로
그렸지만, 상태를 분리하면 두 검색 결과가 어긋나 보이는 문제만 생기므로 하나로 통합한다.
이 통합은 구현상의 판단이며 시각 디자인엔 영향 없다).

**Files:**
- Create: `my-app/src/widgets/retrospective-studio/ui/TopicPillBar.tsx`
- Modify: `my-app/src/app/styles/widgets/topic-studio.css` (전체 교체 — Task 12까지 계속 append)

**Interfaces:**
- Consumes: `Topic[]`(Task 2), `useTopics().create`(Task 5), `getTopicLimitFromError`
  (기존 `shared/api/topics.ts`), `ConfirmModal`, `TextField`(기존 `shared/ui`)
- Produces: `TopicPillBarProps { topics, loading, error, selectedId, onSelect(id|null),
  onCreate(name, description): Promise<Topic>, requireLoginInDemo() }`

- [ ] **Step 1: 컴포넌트 작성**

`my-app/src/widgets/retrospective-studio/ui/TopicPillBar.tsx`(신규):

```tsx
import { useMemo, useState } from "react";
import { Check, ChevronDown, Plus, Search } from "lucide-react";
import { useTranslation } from "@/shared/lib/i18n";
import { ApiError, getTopicLimitFromError } from "@/shared/api";
import { ConfirmModal } from "@/shared/ui/confirm-modal/ConfirmModal";
import { TextField } from "@/shared/ui/text-field/TextField";
import type { Topic } from "@/entities/topic/model/types";

export interface TopicPillBarProps {
  topics: Topic[];
  loading: boolean;
  error: boolean;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onCreate: (name: string, description: string) => Promise<Topic>;
  requireLoginInDemo: () => boolean;
}

/** 8개 초과일 때만 검색·드로어를 노출(결정: 한 줄 고정 · 줄바꿈 없음). */
const SEARCH_THRESHOLD = 8;

function matches(topic: Topic, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return (
    topic.name.toLowerCase().includes(q) ||
    topic.description.toLowerCase().includes(q)
  );
}

export function TopicPillBar({
  topics,
  loading,
  error,
  selectedId,
  onSelect,
  onCreate,
  requireLoginInDemo,
}: TopicPillBarProps) {
  const { t } = useTranslation();
  const [query, setQuery] = useState("");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [formError, setFormError] = useState<string | null>(null);

  const filtered = useMemo(
    () => topics.filter((topic) => matches(topic, query)),
    [topics, query],
  );
  const showSearch = topics.length > SEARCH_THRESHOLD;

  const openCreate = (prefillName = "") => {
    if (requireLoginInDemo()) return;
    setName(prefillName);
    setDescription("");
    setFormError(null);
    setCreating(true);
    setDrawerOpen(false);
  };

  const submitCreate = async () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    try {
      const topic = await onCreate(trimmed, description.trim());
      setCreating(false);
      onSelect(topic.id);
    } catch (e) {
      if (e instanceof ApiError && e.code === "TOPIC_NAME_DUPLICATED") {
        setFormError(t("topic.crud.nameDuplicated"));
      } else if (e instanceof ApiError && e.code === "TOPIC_LIMIT_REACHED") {
        const limit = getTopicLimitFromError(e);
        setFormError(t("topic.crud.limitReached", { limit: limit ?? "" }));
      } else {
        setFormError(t("topic.generate.failed"));
      }
    }
  };

  if (error) {
    return (
      <div className="topic-pill-bar">
        <span className="topic-pill-error">{t("topic.pill.listError")}</span>
      </div>
    );
  }

  if (!loading && topics.length === 0) {
    return (
      <div className="topic-pill-empty">
        <div className="topic-pill-empty-head">
          <button type="button" className="btn btn-primary" onClick={() => openCreate()}>
            <Plus size={14} /> {t("topic.pill.newTopic")}
          </button>
        </div>
        <h3 className="topic-pill-empty-title">{t("topic.pill.emptyTitle")}</h3>
        <p className="topic-pill-empty-desc">{t("topic.pill.emptyDesc")}</p>
        <button type="button" className="btn btn-primary" onClick={() => openCreate()}>
          {t("topic.pill.emptyCta")}
        </button>
        {creating ? (
          <CreateTopicModal
            name={name}
            description={description}
            formError={formError}
            onNameChange={setName}
            onDescriptionChange={setDescription}
            onConfirm={() => void submitCreate()}
            onCancel={() => setCreating(false)}
          />
        ) : null}
      </div>
    );
  }

  return (
    <div className="topic-pill-bar">
      {showSearch ? (
        <div className="topic-pill-search">
          <Search size={14} className="topic-pill-search-icon" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("topic.pill.searchPlaceholder")}
          />
        </div>
      ) : null}

      {/* role="tablist"/"tab"/aria-selected — §3.2 H 접근성 요구. 선택 해제가
          가능한 토글이라 표준 tablist(단일 배타 선택)와 완전히 같은 의미는
          아니지만, 스크린리더에 "탭처럼 전환되는 묶음"이라는 신호를 주기
          위해 스펙이 지정한 role 을 그대로 쓴다. */}
      <div className="topic-pill-row" role="tablist">
        {filtered.map((topic) => (
          <button
            key={topic.id}
            type="button"
            role="tab"
            aria-selected={selectedId === topic.id}
            className="topic-pill"
            data-active={selectedId === topic.id ? "true" : undefined}
            onClick={() => onSelect(selectedId === topic.id ? null : topic.id)}
          >
            {selectedId === topic.id ? <Check size={12} /> : null}
            <span className="topic-pill-name">{topic.name}</span>
            {topic.entryCount != null && topic.todoCount != null ? (
              <span className="topic-pill-count">
                {topic.entryCount + topic.todoCount}
              </span>
            ) : null}
          </button>
        ))}
        <button type="button" className="topic-pill topic-pill-new" onClick={() => openCreate()}>
          <Plus size={12} /> {t("topic.pill.newTopic")}
        </button>
      </div>

      {selectedId ? (
        <button type="button" className="topic-pill-deselect" onClick={() => onSelect(null)}>
          {t("topic.pill.deselect")}
        </button>
      ) : null}

      {showSearch ? (
        <div className="topic-pill-drawer">
          <button
            type="button"
            className="topic-pill-drawer-trigger"
            onClick={() => setDrawerOpen((v) => !v)}
          >
            {t("topic.pill.viewAll", { count: topics.length })} <ChevronDown size={13} />
          </button>
          {drawerOpen ? (
            <>
              <div
                className="topic-pill-drawer-backdrop"
                onClick={() => setDrawerOpen(false)}
              />
              <div className="topic-pill-drawer-panel" role="menu">
                {filtered.length === 0 ? (
                  <div className="topic-pill-drawer-empty">
                    <p>{t("topic.pill.searchEmptyTitle", { query })}</p>
                    <span>{t("topic.pill.searchEmptyHint")}</span>
                    <div className="topic-pill-drawer-empty-actions">
                      <button type="button" onClick={() => openCreate(query)}>
                        {t("topic.pill.searchEmptyCreate", { query })}
                      </button>
                      <button type="button" onClick={() => setQuery("")}>
                        {t("topic.pill.searchClear")}
                      </button>
                    </div>
                  </div>
                ) : (
                  filtered.map((topic) => (
                    <button
                      key={topic.id}
                      type="button"
                      className="topic-pill-drawer-row"
                      onClick={() => {
                        onSelect(topic.id);
                        setDrawerOpen(false);
                      }}
                    >
                      <span>{topic.name}</span>
                      {topic.entryCount != null && topic.todoCount != null ? (
                        <span className="topic-pill-count">
                          {topic.entryCount + topic.todoCount}
                        </span>
                      ) : null}
                    </button>
                  ))
                )}
              </div>
            </>
          ) : null}
        </div>
      ) : null}

      {creating ? (
        <CreateTopicModal
          name={name}
          description={description}
          formError={formError}
          onNameChange={setName}
          onDescriptionChange={setDescription}
          onConfirm={() => void submitCreate()}
          onCancel={() => setCreating(false)}
        />
      ) : null}
    </div>
  );
}

interface CreateTopicModalProps {
  name: string;
  description: string;
  formError: string | null;
  onNameChange: (v: string) => void;
  onDescriptionChange: (v: string) => void;
  onConfirm: () => void;
  onCancel: () => void;
}

function CreateTopicModal({
  name,
  description,
  formError,
  onNameChange,
  onDescriptionChange,
  onConfirm,
  onCancel,
}: CreateTopicModalProps) {
  const { t } = useTranslation();
  return (
    <ConfirmModal
      open
      title={t("topic.crud.title")}
      message={
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <p style={{ margin: 0, fontSize: 12, color: "var(--color-body-muted)" }}>
            {t("topic.crud.subtitle")}
          </p>
          <TextField
            autoFocus
            value={name}
            placeholder={t("topic.crud.namePlaceholder")}
            onChange={(e) => onNameChange(e.target.value)}
            error={formError ?? undefined}
          />
          <TextField
            value={description}
            placeholder={t("topic.crud.descPlaceholder")}
            onChange={(e) => onDescriptionChange(e.target.value)}
          />
        </div>
      }
      confirmLabel={t("common.confirm")}
      cancelLabel={t("common.cancel")}
      onConfirm={onConfirm}
      onCancel={onCancel}
    />
  );
}
```

- [ ] **Step 2: `topic-studio.css` 전체 교체**

`my-app/src/app/styles/widgets/topic-studio.css`(기존 사이드바/패널 스타일 전부 폐기,
아래로 전체 교체 — 이후 Task 9~11이 이 파일 끝에 섹션을 추가한다):

```css
/* ---------- Topics tab: pill bar (crumb A) ---------- */
.topic-pill-bar {
  display: flex;
  flex-direction: column;
  gap: var(--s-sm);
  margin-bottom: var(--s-lg);
}

.topic-pill-error {
  font-size: 12px;
  color: var(--color-danger);
}

.topic-pill-search {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 240px;
  max-width: 100%;
  padding: 9px 14px;
  background: var(--color-tile-3);
  border: 1px solid var(--color-divider-soft);
  border-radius: var(--r-pill);
}
.topic-pill-search:focus-within {
  border-color: var(--color-primary);
}
.topic-pill-search-icon {
  color: var(--color-body-muted);
  flex-shrink: 0;
}
.topic-pill-search input {
  flex: 1;
  min-width: 0;
  font-size: 16px;
  background: transparent;
}

.topic-pill-row {
  display: flex;
  align-items: center;
  gap: var(--s-xs);
  overflow-x: auto;
  padding-bottom: 2px;
}

.topic-pill {
  flex: none;
  display: inline-flex;
  align-items: center;
  gap: var(--s-xxs);
  padding: 7px 13px;
  border-radius: var(--r-pill);
  border: 1px solid var(--color-divider-soft);
  background: transparent;
  color: var(--color-body-muted);
  font-size: 12px;
  font-weight: 500;
  white-space: nowrap;
  transition: background-color 120ms ease, border-color 120ms ease, color 120ms ease;
}
.topic-pill:hover {
  border-color: var(--color-hairline-strong);
  color: var(--color-ink);
}
.topic-pill[data-active="true"] {
  background: var(--color-tile-3);
  border-color: var(--color-divider-soft);
  color: var(--color-ink);
}
.topic-pill-name {
  max-width: 200px;
  overflow: hidden;
  text-overflow: ellipsis;
}
.topic-pill-count {
  font-family: var(--font-mono);
  font-size: 11px;
  color: var(--color-ink-muted-48);
}
.topic-pill-new {
  border-style: dashed;
}

.topic-pill-deselect {
  align-self: flex-start;
  font-size: 12px;
  color: var(--color-body-muted);
}
.topic-pill-deselect:hover {
  color: var(--color-ink);
}

.topic-pill-drawer {
  position: relative;
  align-self: flex-start;
}
.topic-pill-drawer-trigger {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
  color: var(--color-body-muted);
}
.topic-pill-drawer-trigger:hover {
  color: var(--color-ink);
}
.topic-pill-drawer-backdrop {
  position: fixed;
  inset: 0;
  z-index: 40;
}
.topic-pill-drawer-panel {
  position: absolute;
  top: calc(100% + 8px);
  left: 0;
  z-index: 41;
  min-width: 260px;
  max-height: 320px;
  overflow-y: auto;
  padding: 6px;
  display: flex;
  flex-direction: column;
  gap: 2px;
  background: var(--color-tile-1);
  border: 1px solid var(--color-divider-soft);
  border-radius: var(--r-md);
  box-shadow: 0 16px 40px rgba(0, 0, 0, 0.4);
}
.topic-pill-drawer-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 9px 12px;
  border-radius: var(--r-sm);
  font-size: 16px;
  color: var(--color-ink);
  text-align: left;
}
.topic-pill-drawer-row:hover {
  background: var(--color-tile-3);
}
.topic-pill-drawer-empty {
  padding: 16px 14px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  font-size: 12px;
  color: var(--color-body-muted);
}
.topic-pill-drawer-empty-actions {
  display: flex;
  gap: 10px;
}
.topic-pill-drawer-empty-actions button {
  color: var(--color-primary);
}

/* ---------- 0개 첫 진입 ---------- */
.topic-pill-empty {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: var(--s-sm);
  padding: 40px var(--s-lg);
  margin-bottom: var(--s-lg);
  background: var(--color-tile-2);
  border-radius: var(--r-xl);
  border: 1px solid var(--color-divider-soft);
}
.topic-pill-empty-head {
  align-self: flex-end;
}
.topic-pill-empty-title {
  margin: 0;
  font-size: 18px;
  font-weight: 600;
  color: var(--color-ink);
}
.topic-pill-empty-desc {
  margin: 0;
  max-width: 480px;
  font-size: 16px;
  line-height: 1.6;
  color: var(--color-body-muted);
}
```

- [ ] **Step 3: `index.css`에 import 추가**

`my-app/src/app/styles/index.css`에서 기존:

```css
@import "./widgets/retro.css";
```

바로 다음 줄이 이미 `@import "./widgets/topic-studio.css";`인지 확인한다(2026-09-01
플랜에서 이미 추가됨). 없으면 추가한다.

- [ ] **Step 4: 빌드 확인**

```bash
cd my-app && npx tsc --noEmit -p tsconfig.app.json 2>&1 | grep "TopicPillBar\.tsx"
```

Expected: 출력 없음.

- [ ] **Step 5: Commit**

```bash
git add my-app/src/widgets/retrospective-studio/ui/TopicPillBar.tsx \
        my-app/src/app/styles/widgets/topic-studio.css
git commit -m "feat(topic): add TopicPillBar (one-line pills + search drawer + create modal)"
```

---

### Task 9: `TopicPicker` 컴포넌트 (크롬 B, 미선택 상태)

**Files:**
- Create: `my-app/src/widgets/retrospective-studio/ui/TopicPicker.tsx`
- Modify: `my-app/src/app/styles/widgets/topic-studio.css` (append)

**Interfaces:**
- Consumes: `Topic[]`, `formatMonthDayFromDateKey`(Task 2)
- Produces: `TopicPickerProps { topics: Topic[], onSelect(id: string) }`

- [ ] **Step 1: 컴포넌트 작성**

`my-app/src/widgets/retrospective-studio/ui/TopicPicker.tsx`(신규):

```tsx
import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import { useTranslation } from "@/shared/lib/i18n";
import { formatMonthDayFromDateKey } from "@/shared/lib/date";
import type { Topic } from "@/entities/topic/model/types";

export interface TopicPickerProps {
  topics: Topic[];
  onSelect: (id: string) => void;
}

/** 주제 미선택 상태(§3.2 B) — 자동 선택하지 않고 카드 목록에서 고르게 한다. */
export function TopicPicker({ topics, onSelect }: TopicPickerProps) {
  const { t } = useTranslation();
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return topics;
    return topics.filter(
      (topic) =>
        topic.name.toLowerCase().includes(q) ||
        topic.description.toLowerCase().includes(q),
    );
  }, [topics, query]);

  return (
    <div className="topic-picker">
      <div className="topic-picker-search">
        <Search size={14} className="topic-picker-search-icon" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t("topic.picker.searchPlaceholder")}
        />
      </div>
      <h3 className="topic-picker-title">{t("topic.picker.title")}</h3>
      <div className="topic-picker-list">
        {filtered.map((topic) => (
          <button
            key={topic.id}
            type="button"
            className="topic-picker-card"
            onClick={() => onSelect(topic.id)}
          >
            <div className="topic-picker-card-head">
              <span className="topic-picker-card-name">{topic.name}</span>
              <span className="topic-picker-card-status">
                {topic.digestWatermarkDateKey
                  ? t("topic.picker.reflectedUntil", {
                      date: formatMonthDayFromDateKey(topic.digestWatermarkDateKey),
                    })
                  : t("topic.picker.notReflected")}
              </span>
            </div>
            <span className="topic-picker-card-desc">
              {topic.description || t("topic.picker.noDescription")}
            </span>
          </button>
        ))}
      </div>
      <p className="topic-picker-hint">{t("topic.picker.rememberHint")}</p>
    </div>
  );
}
```

- [ ] **Step 2: CSS 추가**

`my-app/src/app/styles/widgets/topic-studio.css` 끝에 추가:

```css
/* ---------- 미선택 상태 (crumb B) ---------- */
.topic-picker {
  display: flex;
  flex-direction: column;
  gap: var(--s-md);
  max-width: 640px;
  margin: 0 auto;
  padding: var(--s-xl) 0;
}
.topic-picker-search {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 260px;
  padding: 9px 14px;
  background: var(--color-tile-3);
  border: 1px solid var(--color-divider-soft);
  border-radius: var(--r-pill);
}
.topic-picker-search-icon {
  color: var(--color-body-muted);
}
.topic-picker-search input {
  flex: 1;
  min-width: 0;
  font-size: 16px;
  background: transparent;
}
.topic-picker-title {
  margin: 0;
  font-size: 18px;
  font-weight: 600;
  color: var(--color-ink);
}
.topic-picker-list {
  display: flex;
  flex-direction: column;
  gap: var(--s-xs);
}
.topic-picker-card {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: var(--s-sm) var(--s-md);
  border-radius: var(--r-md);
  border: 1px solid var(--color-divider-soft);
  background: var(--color-tile-2);
  text-align: left;
}
.topic-picker-card:hover {
  background: var(--color-tile-3);
}
.topic-picker-card-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--s-sm);
}
.topic-picker-card-name {
  font-size: 16px;
  font-weight: 600;
  color: var(--color-ink);
}
.topic-picker-card-status {
  font-size: 12px;
  color: var(--color-ink-muted-48);
  white-space: nowrap;
}
.topic-picker-card-desc {
  font-size: 12px;
  color: var(--color-body-muted);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.topic-picker-hint {
  margin: 0;
  font-size: 12px;
  color: var(--color-ink-muted-48);
}
```

- [ ] **Step 3: 빌드 확인**

```bash
cd my-app && npx tsc --noEmit -p tsconfig.app.json 2>&1 | grep "TopicPicker\.tsx"
```

Expected: 출력 없음.

- [ ] **Step 4: Commit**

```bash
git add my-app/src/widgets/retrospective-studio/ui/TopicPicker.tsx \
        my-app/src/app/styles/widgets/topic-studio.css
git commit -m "feat(topic): add TopicPicker (unselected-state card list)"
```

---

### Task 10: `TopicSourceListModal` 컴포넌트

**Files:**
- Create: `my-app/src/widgets/retrospective-studio/ui/TopicSourceListModal.tsx`
- Modify: `my-app/src/app/styles/widgets/topic-studio.css` (append)

**Interfaces:**
- Consumes: `useArchiveApp().getTopicSources`(Task 3), `TopicSource`/`TopicSourcePage`(Task 2)
- Produces:
  ```ts
  interface TopicSourceListModalProps {
    topicId: string;
    mode: "candidate" | "reflected";
    entryCount: number | null;   // reflected 모드 서브카피용(회고 N개)
    todoCount: number | null;    // reflected 모드 서브카피용(할 일 N개)
    reflectedDate: string | null; // reflected 모드 서브카피용(YYYY-MM-DD)
    onClose: () => void;
    onEditDescription: () => void;
  }
  ```

- [ ] **Step 1: 컴포넌트 작성**

`my-app/src/widgets/retrospective-studio/ui/TopicSourceListModal.tsx`(신규):

```tsx
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { useArchiveApp } from "@/app/providers/useArchiveApp";
import { useTranslation } from "@/shared/lib/i18n";
import { formatMonthDayFromDateKey } from "@/shared/lib/date";
import type { RetrospectiveType } from "@/entities/entry/model/types";
import type { TopicSource, TopicSourcePage } from "@/entities/topic/model/types";

export interface TopicSourceListModalProps {
  topicId: string;
  mode: "candidate" | "reflected";
  entryCount: number | null;
  todoCount: number | null;
  reflectedDate: string | null;
  onClose: () => void;
  onEditDescription: () => void;
}

const PAGE_SIZE = 20;

const KIND_COLOR: Record<RetrospectiveType, string> = {
  daily: "#5f86bd",
  weekly: "#8f77bd",
  monthly: "#63a894",
  yearly: "#bd7c94",
};
const TODO_COLOR = "#bda05f";
const FALLBACK_COLOR = "#6b7580";

function sourceColor(source: TopicSource): string {
  if (source.kind === "todo") return TODO_COLOR;
  return (source.retroType && KIND_COLOR[source.retroType]) || FALLBACK_COLOR;
}

/** 소스 목록 모달(§3.2 F) — 조회 전용, 640px, 종류 필터 없음(결정 24). */
export function TopicSourceListModal({
  topicId,
  mode,
  entryCount,
  todoCount,
  reflectedDate,
  onClose,
  onEditDescription,
}: TopicSourceListModalProps) {
  const { t } = useTranslation();
  const { getTopicSources } = useArchiveApp();
  const [page, setPage] = useState(1);
  const [data, setData] = useState<TopicSourcePage | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError(false);
    void getTopicSources(topicId, { page, size: PAGE_SIZE })
      .then((res) => {
        if (alive) setData(res);
      })
      .catch(() => {
        if (alive) setError(true);
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [topicId, page, nonce, getTopicSources]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  const title =
    mode === "candidate"
      ? t("topic.source.candidateTitle", { count: (entryCount ?? 0) + (todoCount ?? 0) })
      : t("topic.source.reflectedTitle");
  const subtitle =
    mode === "candidate"
      ? t("topic.source.candidateDesc")
      : t("topic.source.reflectedDesc", {
          date: reflectedDate ? formatMonthDayFromDateKey(reflectedDate) : "",
          entries: entryCount ?? 0,
          todos: todoCount ?? 0,
        });

  const from = data ? (data.page - 1) * data.size + 1 : 0;
  const to = data ? Math.min(data.page * data.size, data.total) : 0;

  return createPortal(
    <div
      className="topic-source-overlay"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div role="dialog" aria-modal="true" className="topic-source-modal">
        <div className="topic-source-head">
          <div>
            <h3>{title}</h3>
            <p>{subtitle}</p>
          </div>
          <button type="button" className="topic-source-close" onClick={onClose} aria-label={t("common.close")}>
            <X size={16} />
          </button>
        </div>

        {loading ? (
          <div className="topic-source-skeleton" aria-label={t("topic.source.loading")}>
            {Array.from({ length: 5 }, (_, i) => (
              <div key={i} className="topic-source-skeleton-row" />
            ))}
          </div>
        ) : error ? (
          <div className="topic-source-state">
            <span className="topic-source-state-title">{t("topic.source.loadErrorTitle")}</span>
            <p>{t("topic.source.loadErrorDesc")}</p>
            <button type="button" className="btn btn-utility" onClick={() => setNonce((n) => n + 1)}>
              {t("topic.source.loadErrorRetry")}
            </button>
          </div>
        ) : !data || data.items.length === 0 ? (
          <div className="topic-source-state">
            <span className="topic-source-state-title">{t("topic.source.emptyTitle")}</span>
            <p>{t("topic.source.emptyDesc")}</p>
            <button type="button" className="btn btn-utility" onClick={onEditDescription}>
              {t("topic.source.editDescription")}
            </button>
          </div>
        ) : (
          <>
            {/* 목록은 조회 전용 — role="list"/"listitem"이며 버튼·링크로 만들지
                않는다(결정 25). 행에 tabindex를 주지 않고, 스크롤 컨테이너만
                키보드 포커스를 받는다. */}
            <div className="topic-source-list" role="list" tabIndex={0}>
              {data.items.map((source) => (
                <div
                  key={`${source.kind}-${source.id}`}
                  role="listitem"
                  className="topic-source-row"
                  aria-label={
                    source.kind === "todo"
                      ? t("topic.source.ariaTodo")
                      : t("topic.source.ariaEntry", {
                          type: t(legendKeyFor(source.retroType)),
                        })
                  }
                >
                  <span
                    className="topic-source-row-bar"
                    style={{ background: sourceColor(source) }}
                  />
                  <span className="topic-source-row-title">{source.title}</span>
                  <span className="topic-source-row-date">
                    {formatMonthDayFromDateKey(source.dateKey)}
                  </span>
                </div>
              ))}
            </div>

            <div className="topic-source-footer">
              <div className="topic-source-legend">
                <LegendItem color={KIND_COLOR.daily} label={t("topic.source.legendDaily")} />
                <LegendItem color={KIND_COLOR.weekly} label={t("topic.source.legendWeekly")} />
                <LegendItem color={KIND_COLOR.monthly} label={t("topic.source.legendMonthly")} />
                <LegendItem color={KIND_COLOR.yearly} label={t("topic.source.legendYearly")} />
                <LegendItem color={TODO_COLOR} label={t("topic.source.legendTodo")} />
                <LegendItem color={FALLBACK_COLOR} label={t("topic.source.legendOther")} />
              </div>
              <div className="topic-source-pagination">
                <span className="topic-source-page-summary">
                  {t("topic.source.pageSummary", { total: data.total, from, to })}
                </span>
                <button
                  type="button"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                >
                  {t("topic.source.prev")}
                </button>
                <span className="topic-source-page-current">{page}</span>
                <button
                  type="button"
                  disabled={to >= data.total}
                  onClick={() => setPage((p) => p + 1)}
                >
                  {t("topic.source.next")}
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>,
    document.body,
  );
}

function legendKeyFor(retroType: RetrospectiveType | null) {
  switch (retroType) {
    case "daily":
      return "topic.source.legendDaily" as const;
    case "weekly":
      return "topic.source.legendWeekly" as const;
    case "monthly":
      return "topic.source.legendMonthly" as const;
    case "yearly":
      return "topic.source.legendYearly" as const;
    default:
      return "topic.source.legendOther" as const;
  }
}

function LegendItem({ color, label }: { color: string; label: string }) {
  return (
    <span className="topic-source-legend-item">
      <span className="topic-source-legend-swatch" style={{ background: color }} />
      {label}
    </span>
  );
}
```

- [ ] **Step 2: CSS 추가**

`my-app/src/app/styles/widgets/topic-studio.css` 끝에 추가:

```css
/* ---------- 소스 목록 모달 ---------- */
.topic-source-overlay {
  position: fixed;
  inset: 0;
  z-index: 1000;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.55);
  backdrop-filter: blur(2px);
  padding: var(--s-lg);
}
.topic-source-modal {
  width: 100%;
  max-width: 640px;
  max-height: min(680px, 84vh);
  display: flex;
  flex-direction: column;
  background: var(--color-tile-1);
  border: 1px solid var(--color-divider-soft);
  border-radius: var(--r-xl);
  box-shadow: 0 24px 60px rgba(0, 0, 0, 0.45);
  overflow: hidden;
}
.topic-source-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--s-md);
  padding: var(--s-lg) var(--s-lg) var(--s-md);
  border-bottom: 1px solid var(--color-hairline);
}
.topic-source-head h3 {
  margin: 0 0 4px;
  font-size: 18px;
  font-weight: 600;
  color: var(--color-ink);
}
.topic-source-head p {
  margin: 0;
  font-size: 12px;
  color: var(--color-body-muted);
}
.topic-source-close {
  color: var(--color-body-muted);
  padding: 4px;
  border-radius: var(--r-sm);
}
.topic-source-close:hover {
  background: var(--color-tile-3);
  color: var(--color-ink);
}

.topic-source-list {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: var(--s-xs) 0;
}
.topic-source-row {
  display: flex;
  align-items: center;
  gap: var(--s-sm);
  padding: 8px var(--s-lg);
}
.topic-source-row-bar {
  width: 3px;
  height: 24px;
  border-radius: 2px;
  flex: none;
}
.topic-source-row-title {
  flex: 1;
  min-width: 0;
  font-size: 16px;
  color: var(--color-ink-muted-80, var(--color-ink));
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.topic-source-row-date {
  flex: none;
  font-family: var(--font-mono);
  font-size: 12px;
  color: var(--color-ink-muted-48);
}

.topic-source-skeleton {
  display: flex;
  flex-direction: column;
  gap: var(--s-sm);
  padding: var(--s-lg);
}
.topic-source-skeleton-row {
  height: 14px;
  border-radius: var(--r-sm);
  background: var(--color-tile-3);
}

.topic-source-state {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: var(--s-sm);
  padding: 40px var(--s-lg);
}
.topic-source-state-title {
  font-size: 18px;
  font-weight: 600;
  color: var(--color-ink);
}
.topic-source-state p {
  margin: 0;
  font-size: 12px;
  color: var(--color-body-muted);
  max-width: 420px;
}

.topic-source-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--s-md);
  padding: var(--s-sm) var(--s-lg);
  border-top: 1px solid var(--color-hairline);
  flex-wrap: wrap;
}
.topic-source-legend {
  display: flex;
  gap: var(--s-sm);
  flex-wrap: wrap;
}
.topic-source-legend-item {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  font-size: 11px;
  color: var(--color-body-muted);
}
.topic-source-legend-swatch {
  width: 8px;
  height: 3px;
  border-radius: 2px;
}
.topic-source-pagination {
  display: flex;
  align-items: center;
  gap: var(--s-xs);
  font-size: 12px;
  color: var(--color-body-muted);
}
.topic-source-pagination button {
  padding: 6px 10px;
  border: 1px solid var(--color-divider-soft);
  border-radius: var(--r-sm);
  color: var(--color-ink);
}
.topic-source-pagination button:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}
.topic-source-page-current {
  padding: 6px 10px;
  background: var(--color-tile-3);
  border-radius: var(--r-sm);
  color: var(--color-ink);
}
```

- [ ] **Step 3: 빌드 확인**

```bash
cd my-app && npx tsc --noEmit -p tsconfig.app.json 2>&1 | grep "TopicSourceListModal\.tsx"
```

Expected: 출력 없음.

- [ ] **Step 4: Commit**

```bash
git add my-app/src/widgets/retrospective-studio/ui/TopicSourceListModal.tsx \
        my-app/src/app/styles/widgets/topic-studio.css
git commit -m "feat(topic): add TopicSourceListModal (read-only, 640px, mixed entry/todo list)"
```

---

### Task 11: `TopicDocument` 컴포넌트 (본문 — 가장 큰 태스크)

헤더 인라인 편집 + 삭제 모달 + watermark 배너 + digest 렌더 + 5개 상태 매트릭스 + 레일
3카드. `useTopicDigest`(Task 6) + `useTopicStats`(Task 7)를 내부에서 직접 구독한다.

**Files:**
- Create: `my-app/src/widgets/retrospective-studio/ui/TopicDocument.tsx`
- Modify: `my-app/src/app/styles/widgets/topic-studio.css` (append)

**Interfaces:**
- Consumes: `useTopicDigest`(Task 6), `useTopicStats`(Task 7), `RichEditor`(기존
  `shared/ui/rich-editor`), `ConfirmModal`, `TopicSourceListModal`(Task 10),
  `formatMonthDayFromDateKey`(Task 2)
- Produces:
  ```ts
  interface TopicDocumentProps {
    topic: Topic;
    onUpdate: (id: string, patch: { name?: string; description?: string }) => Promise<Topic>;
    onDelete: (id: string) => Promise<void>;
    onDeleted: () => void; // 삭제 성공 후 선택 해제(부모 책임)
    requireLoginInDemo: () => boolean;
  }
  ```

- [ ] **Step 1: 컴포넌트 작성**

`my-app/src/widgets/retrospective-studio/ui/TopicDocument.tsx`(신규):

```tsx
import { lazy, Suspense, useState } from "react";
import { Sparkles } from "lucide-react";
import { useTranslation } from "@/shared/lib/i18n";
import { EmptyState } from "@/shared/ui/empty-state/EmptyState";
import { EditorErrorBoundary } from "@/shared/ui/rich-editor";
import { ConfirmModal } from "@/shared/ui/confirm-modal/ConfirmModal";
import { formatMonthDayFromDateKey } from "@/shared/lib/date";
import { useTopicDigest } from "../model/useTopicDigest";
import { useTopicStats } from "../model/useTopicStats";
import { TopicSourceListModal } from "./TopicSourceListModal";
import type { Topic } from "@/entities/topic/model/types";

const RichEditor = lazy(() => import("@/shared/ui/rich-editor/ui/RichEditor"));

export interface TopicDocumentProps {
  topic: Topic;
  onUpdate: (
    id: string,
    patch: { name?: string; description?: string },
  ) => Promise<Topic>;
  onDelete: (id: string) => Promise<void>;
  onDeleted: () => void;
  requireLoginInDemo: () => boolean;
}

type SourceModalState = { mode: "candidate" | "reflected" } | null;

export function TopicDocument({
  topic,
  onUpdate,
  onDelete,
  onDeleted,
  requireLoginInDemo,
}: TopicDocumentProps) {
  const { t } = useTranslation();
  const { digest, loading, loadError, generating, progress, generateError, generate } =
    useTopicDigest(topic.id);
  const { stats } = useTopicStats(topic.id);

  const [editingField, setEditingField] = useState<"name" | "description" | null>(null);
  const [draft, setDraft] = useState("");
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [sourceModal, setSourceModal] = useState<SourceModalState>(null);
  const [showPrevious, setShowPrevious] = useState(false);

  const hasContent = Boolean(digest?.content);
  const docState: "loadError" | "generateError" | "generatingFirst" | "generatingRegen" | "empty" | "completed" =
    loadError
      ? "loadError"
      : generateError && !showPrevious
        ? "generateError"
        : generating
          ? hasContent
            ? "generatingRegen"
            : "generatingFirst"
          : hasContent
            ? "completed"
            : "empty";

  const showBanner = docState === "completed" || docState === "generatingRegen";
  // 레일 카드 3개는 상태마다 노출 규칙이 다르다(§3.2 E 매트릭스):
  //  - generatingFirst: 전부 숨김(이 시점엔 stats 가 이미 로드돼 있어도 강제로 숨긴다)
  //  - empty: 소스 카드만(반영시점·태그는 숨김 — 태그는 digest 없이도 stats 로 값이
  //    있을 수 있어서 명시적으로 꺼야 한다)
  //  - completed/generatingRegen/loadError/generateError: "이전 값 있으면 유지" —
  //    아래 개별 카드의 null 체크가 자연스럽게 처리한다(따로 끌 필요 없음)
  const railAllowed =
    docState === "generatingFirst"
      ? { reflected: false, source: false, tag: false }
      : docState === "empty"
        ? { reflected: false, source: true, tag: false }
        : { reflected: true, source: true, tag: true };
  const showRail =
    (railAllowed.reflected && digest?.watermarkDateKey != null) ||
    (railAllowed.source && stats != null) ||
    (railAllowed.tag && stats != null && stats.tagCounts.length > 0);

  const startEdit = (field: "name" | "description") => {
    if (requireLoginInDemo()) return;
    setDraft(field === "name" ? topic.name : topic.description);
    setEditingField(field);
  };
  const commitEdit = async () => {
    if (!editingField) return;
    const field = editingField;
    setEditingField(null);
    const trimmed = draft.trim();
    if (field === "name" && (!trimmed || trimmed === topic.name)) return;
    if (field === "description" && trimmed === topic.description) return;
    await onUpdate(topic.id, field === "name" ? { name: trimmed } : { description: trimmed });
  };

  const confirmDelete = async () => {
    setDeleteOpen(false);
    await onDelete(topic.id);
    onDeleted();
  };

  const handleGenerate = () => {
    if (requireLoginInDemo()) return;
    setShowPrevious(false);
    generate();
  };

  const totalSourceCount =
    stats != null ? stats.entryCounts.total + stats.todoCounts.total : null;

  return (
    <div className="retro-doc">
      <div className="retro-doc-main topic-doc">
        <div className="topic-doc-header">
          {editingField === "name" ? (
            <input
              autoFocus
              className="topic-doc-title-input"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onBlur={() => void commitEdit()}
              onKeyDown={(e) => {
                if (e.key === "Enter") void commitEdit();
                if (e.key === "Escape") setEditingField(null);
              }}
            />
          ) : (
            <h2 className="topic-doc-title" onClick={() => startEdit("name")}>
              {topic.name}
            </h2>
          )}
          {editingField === "description" ? (
            <input
              autoFocus
              className="topic-doc-desc-input"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onBlur={() => void commitEdit()}
              onKeyDown={(e) => {
                if (e.key === "Enter") void commitEdit();
                if (e.key === "Escape") setEditingField(null);
              }}
            />
          ) : (
            <p className="topic-doc-desc" onClick={() => startEdit("description")}>
              {topic.description || t("topic.doc.editTrigger")}
            </p>
          )}
          {editingField ? (
            <span className="topic-doc-edit-save-hint">{t("topic.doc.editSaveHint")}</span>
          ) : null}
          <div className="topic-doc-meta">
            {topic.entryCount != null && topic.todoCount != null && stats ? (
              <span>
                {t("topic.doc.statsLine", {
                  entries: stats.entryCounts.total,
                  todos: stats.todoCounts.total,
                  tags: stats.tagCountTotal,
                })}
              </span>
            ) : null}
            <span className="topic-doc-edit-hint">{t("topic.doc.editTrigger")}</span>
            <button
              type="button"
              className="topic-doc-delete"
              onClick={() => {
                if (requireLoginInDemo()) return;
                setDeleteOpen(true);
              }}
            >
              {t("topic.doc.delete")}
            </button>
          </div>
        </div>

        {showBanner && digest?.watermarkDateKey ? (
          <div className="retro-doc-banner" data-tone="ai">
            <div>
              <p style={{ margin: 0 }}>
                {t("topic.doc.bannerReflected", {
                  date: formatMonthDayFromDateKey(digest.watermarkDateKey),
                })}
              </p>
              {stats && stats.unreflectedEntryCount > 0 ? (
                <p style={{ margin: "4px 0 0" }}>
                  {t("topic.doc.bannerUnreflected", { count: stats.unreflectedEntryCount })}
                </p>
              ) : null}
            </div>
            <button type="button" className="btn btn-primary" onClick={handleGenerate}>
              {t("topic.doc.regenerate")}
            </button>
          </div>
        ) : null}

        {docState === "loadError" ? (
          <div className="topic-doc-state">
            <h3>{t("topic.doc.loadErrorTitle")}</h3>
            <p>{t("topic.doc.loadErrorDesc")}</p>
            <div className="topic-doc-state-actions">
              <button type="button" className="btn btn-utility" onClick={() => window.location.reload()}>
                {t("topic.doc.loadErrorRetry")}
              </button>
              <button type="button" className="btn btn-utility" onClick={() => setSourceModal({ mode: "reflected" })}>
                {t("topic.doc.loadErrorViewSourcesOnly")}
              </button>
            </div>
          </div>
        ) : docState === "generateError" ? (
          <div className="topic-doc-state" data-tone="danger">
            <h3>{t("topic.doc.generateErrorTitle")}</h3>
            <p>
              {t("topic.doc.generateErrorDesc", {
                date: digest?.watermarkDateKey
                  ? formatMonthDayFromDateKey(digest.watermarkDateKey)
                  : "",
              })}
            </p>
            <div className="topic-doc-state-actions">
              <button type="button" className="btn btn-primary" onClick={handleGenerate}>
                {t("topic.doc.generateErrorRetry")}
              </button>
              {hasContent ? (
                <button type="button" className="btn btn-utility" onClick={() => setShowPrevious(true)}>
                  {t("topic.doc.generateErrorViewPrevious")}
                </button>
              ) : null}
            </div>
          </div>
        ) : docState === "generatingFirst" || docState === "generatingRegen" ? (
          <div className="topic-doc-state">
            <div className="topic-doc-progress-row">
              <span className="topic-doc-spinner" aria-hidden="true" />
              <span aria-live="polite">
                {progress
                  ? t("topic.doc.generatingProgress", progress)
                  : t("topic.source.loading")}
              </span>
            </div>
            <div
              className="topic-doc-progress-bar"
              role="progressbar"
              aria-valuenow={
                progress ? Math.round((progress.processed / Math.max(1, progress.total)) * 100) : undefined
              }
              aria-valuemin={0}
              aria-valuemax={100}
            >
              <div
                style={{
                  width: progress ? `${(progress.processed / Math.max(1, progress.total)) * 100}%` : "8%",
                }}
              />
            </div>
            <p>{t("topic.doc.generatingHint")}</p>
          </div>
        ) : docState === "empty" ? (
          <div className="topic-doc-state">
            <h3>{t("topic.doc.emptyTitle")}</h3>
            <p>
              {t("topic.doc.emptyDesc", {
                entries: stats?.entryCounts.total ?? 0,
                todos: stats?.todoCounts.total ?? 0,
              })}
            </p>
            <div className="topic-doc-state-actions">
              <button type="button" className="btn btn-primary" onClick={handleGenerate}>
                <Sparkles size={14} /> {t("topic.doc.emptyCta")}
              </button>
              {totalSourceCount != null ? (
                <button type="button" className="btn btn-utility" onClick={() => setSourceModal({ mode: "candidate" })}>
                  {t("topic.doc.emptyViewSources", { count: totalSourceCount })}
                </button>
              ) : null}
            </div>
            <span className="topic-doc-hint">{t("topic.doc.emptyHint")}</span>
          </div>
        ) : loading ? (
          <EmptyState message={t("topic.source.loading")} minHeight={220} />
        ) : (
          <EditorErrorBoundary
            fallback={(error) => <div className="topic-doc-error">{error.message}</div>}
          >
            <Suspense fallback={<EmptyState message={t("topic.source.loading")} minHeight={220} />}>
              <RichEditor value={digest?.content ?? ""} editable={false} />
            </Suspense>
          </EditorErrorBoundary>
        )}
      </div>

      {showRail ? (
        <div className="retro-doc-rail">
          {railAllowed.reflected && digest?.watermarkDateKey ? (
            <div className="topic-doc-rail-card">
              <span className="retro-rail-label">{t("topic.doc.railReflectedLabel")}</span>
              <span className="topic-doc-rail-value">
                {t("topic.doc.railReflectedValue", {
                  date: formatMonthDayFromDateKey(digest.watermarkDateKey),
                })}
              </span>
              {stats ? (
                <span className="topic-doc-rail-sub">
                  {t("topic.doc.railUnreflectedCount", { count: stats.unreflectedEntryCount })}
                </span>
              ) : null}
            </div>
          ) : null}
          {railAllowed.source && stats ? (
            <div className="topic-doc-rail-card">
              <span className="retro-rail-label">{t("topic.doc.railSourceLabel")}</span>
              <div className="retro-rail-stat">
                <span>{t("topic.doc.railSourceDaily")}</span>
                <b>{stats.entryCounts.daily}</b>
              </div>
              <div className="retro-rail-stat">
                <span>{t("topic.doc.railSourceWeekly")}</span>
                <b>{stats.entryCounts.weekly}</b>
              </div>
              <div className="retro-rail-stat">
                <span>{t("topic.doc.railSourceTodo")}</span>
                <b>{stats.todoCounts.total}</b>
              </div>
            </div>
          ) : null}
          {railAllowed.tag && stats && stats.tagCounts.length > 0 ? (
            <div className="topic-doc-rail-card">
              <span className="retro-rail-label">{t("topic.doc.railTagLabel")}</span>
              <div className="topic-doc-tag-chips">
                {stats.tagCounts.slice(0, 6).map((tc) => (
                  <span key={tc.tag} className="topic-doc-tag-chip">
                    #{tc.tag} {tc.count}
                  </span>
                ))}
                {stats.tagCountTotal > 6 ? (
                  <span className="topic-doc-tag-chip topic-doc-tag-more">
                    {t("topic.doc.railTagMore", { count: stats.tagCountTotal - 6 })}
                  </span>
                ) : null}
              </div>
            </div>
          ) : null}
        </div>
      ) : null}

      {deleteOpen ? (
        <ConfirmModal
          open
          tone="danger"
          title={t("topic.crud.deleteTitle", { name: topic.name })}
          message={t("topic.crud.deleteMessage")}
          confirmLabel={t("common.delete")}
          cancelLabel={t("common.cancel")}
          onConfirm={() => void confirmDelete()}
          onCancel={() => setDeleteOpen(false)}
        />
      ) : null}

      {sourceModal ? (
        <TopicSourceListModal
          topicId={topic.id}
          mode={sourceModal.mode}
          entryCount={stats?.entryCounts.total ?? topic.entryCount}
          todoCount={stats?.todoCounts.total ?? topic.todoCount}
          reflectedDate={digest?.watermarkDateKey ?? null}
          onClose={() => setSourceModal(null)}
          onEditDescription={() => {
            setSourceModal(null);
            startEdit("description");
          }}
        />
      ) : null}
    </div>
  );
}
```

- [ ] **Step 2: CSS 추가**

`my-app/src/app/styles/widgets/topic-studio.css` 끝에 추가:

```css
/* ---------- 문서 본문 (TopicDocument) ---------- */
.topic-doc-header {
  display: flex;
  flex-direction: column;
  gap: var(--s-xs);
  padding-bottom: var(--s-lg);
  border-bottom: 1px solid var(--color-hairline);
}
.topic-doc-title,
.topic-doc-title-input {
  margin: 0;
  font-family: var(--font-display);
  font-size: clamp(32px, 3.4vw, 44px);
  font-weight: 600;
  line-height: 1.1;
  color: var(--color-ink);
  cursor: text;
}
.topic-doc-title-input {
  width: 100%;
  background: transparent;
  border: none;
  border-bottom: 1px dashed var(--color-divider-soft);
  outline: none;
  padding: 0;
}
.topic-doc-desc,
.topic-doc-desc-input {
  margin: 0;
  font-size: 16px;
  line-height: 1.6;
  color: var(--color-body-muted);
  cursor: text;
}
.topic-doc-desc-input {
  width: 100%;
  background: transparent;
  border: none;
  border-bottom: 1px dashed var(--color-divider-soft);
  outline: none;
  padding: 0;
}
.topic-doc-edit-save-hint {
  font-family: var(--font-mono);
  font-size: 12px;
  color: var(--color-ink-muted-48);
}
.topic-doc-meta {
  display: flex;
  align-items: center;
  gap: var(--s-sm);
  flex-wrap: wrap;
  font-size: 12px;
  color: var(--color-body-muted);
  padding-top: 4px;
}
.topic-doc-edit-hint {
  color: var(--color-ink-muted-48);
}
.topic-doc-delete {
  color: var(--color-danger);
  margin-left: auto;
}

.topic-doc-state {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: var(--s-sm);
  padding: 44px var(--s-lg);
}
.topic-doc-state[data-tone="danger"] {
  background: color-mix(in srgb, var(--color-danger) 6%, transparent);
  border: 1px solid color-mix(in srgb, var(--color-danger) 30%, transparent);
  border-radius: var(--r-lg);
}
.topic-doc-state h3 {
  margin: 0;
  font-size: 21px;
  font-weight: 600;
  color: var(--color-ink);
}
.topic-doc-state p {
  margin: 0;
  max-width: 480px;
  font-size: 16px;
  line-height: 1.6;
  color: var(--color-body-muted);
}
.topic-doc-state-actions {
  display: flex;
  gap: var(--s-xs);
}
.topic-doc-hint {
  font-size: 12px;
  color: var(--color-ink-muted-48);
}
.topic-doc-error {
  padding: 10px 14px;
  border-radius: var(--r-sm);
  background: var(--color-tile-3);
  color: var(--color-warn, #d9a23a);
  font-size: 16px;
}

.topic-doc-progress-row {
  display: flex;
  align-items: center;
  gap: var(--s-sm);
  font-size: 16px;
  color: var(--color-ink);
}
.topic-doc-spinner {
  width: 13px;
  height: 13px;
  border-radius: 50%;
  border: 2px solid var(--color-divider-soft);
  border-top-color: var(--color-primary);
  animation: topic-doc-spin 700ms linear infinite;
}
@keyframes topic-doc-spin {
  to {
    transform: rotate(360deg);
  }
}
.topic-doc-progress-bar {
  width: 100%;
  max-width: 420px;
  height: 6px;
  border-radius: var(--r-pill);
  background: var(--color-tile-3);
  overflow: hidden;
}
.topic-doc-progress-bar > div {
  height: 100%;
  background: var(--color-primary);
  transition: width 200ms ease;
}

.topic-doc-rail-card {
  display: flex;
  flex-direction: column;
  gap: var(--s-xs);
  padding: var(--s-sm) var(--s-md);
  background: var(--color-tile-2);
  border: 1px solid var(--color-divider-soft);
  border-radius: var(--r-lg);
}
.topic-doc-rail-value {
  font-size: 16px;
  font-weight: 500;
  color: var(--color-ink);
}
.topic-doc-rail-sub {
  font-size: 12px;
  color: var(--color-body-muted);
}
.topic-doc-tag-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
.topic-doc-tag-chip {
  padding: 3px 8px;
  border-radius: var(--r-pill);
  background: var(--color-tile-3);
  font-size: 12px;
  color: var(--color-body-muted);
}
.topic-doc-tag-more {
  color: var(--color-ink-muted-48);
}
```

- [ ] **Step 3: 빌드 확인**

```bash
cd my-app && npx tsc --noEmit -p tsconfig.app.json 2>&1 | grep "TopicDocument\.tsx"
```

Expected: 출력 없음.

- [ ] **Step 4: Commit**

```bash
git add my-app/src/widgets/retrospective-studio/ui/TopicDocument.tsx \
        my-app/src/app/styles/widgets/topic-studio.css
git commit -m "feat(topic): add TopicDocument (inline edit, 5-state matrix, rail cards)"
```

---

### Task 12: `TopicsPane` 재조합 + 옛 컴포넌트 삭제

**Files:**
- Modify: `my-app/src/widgets/retrospective-studio/ui/TopicsPane.tsx`
- Delete: `my-app/src/widgets/retrospective-studio/ui/TopicSidebar.tsx`
- Delete: `my-app/src/widgets/retrospective-studio/ui/TopicDigestPane.tsx`
- Modify: `my-app/src/app/styles/widgets/topic-studio.css` (append — 상단 레이아웃)

**Interfaces:**
- Consumes: `useTopics`(Task 5), `useLastViewedTopic`(Task 5), `TopicPillBar`(Task 8),
  `TopicPicker`(Task 9), `TopicDocument`(Task 11)
- Produces: `TopicsPaneProps`(변경 없음 — `RetrospectiveStudio.tsx`가 이미 이 시그니처로
  호출하고 있어 Task 13에서 그쪽은 손댈 필요가 없다)

- [ ] **Step 1: 옛 컴포넌트 2개 삭제**

```bash
cd my-app
git rm src/widgets/retrospective-studio/ui/TopicSidebar.tsx
git rm src/widgets/retrospective-studio/ui/TopicDigestPane.tsx
```

- [ ] **Step 2: `TopicsPane.tsx` 재작성**

`my-app/src/widgets/retrospective-studio/ui/TopicsPane.tsx` 전체를 아래로 교체:

```tsx
import { useEffect, useState } from "react";
import { RetroTabBar } from "./RetroTabBar";
import { TopicPillBar } from "./TopicPillBar";
import { TopicPicker } from "./TopicPicker";
import { TopicDocument } from "./TopicDocument";
import { useTopics } from "../model/useTopics";
import { useLastViewedTopic } from "../model/useLastViewedTopic";
import type { RetroTab } from "../model/constants";

export interface TopicsPaneProps {
  retroFilter: RetroTab;
  setRetroFilter: (tab: RetroTab) => void;
  requireLoginInDemo: () => boolean;
}

/** "주제" 탭 최상위 화면 — 탭 바 + pill 전환 + (미선택 피커 | 문서 본문). */
export function TopicsPane({
  retroFilter,
  setRetroFilter,
  requireLoginInDemo,
}: TopicsPaneProps) {
  const { topics, loading, error, create, update, remove } = useTopics();
  const [lastViewedId, setLastViewedId] = useLastViewedTopic();
  const [selectedId, setSelectedId] = useState<string | null>(lastViewedId);

  // 마지막으로 본 주제가 삭제됐으면 폴백(미선택) — 목록이 로드된 뒤에만 검증한다.
  useEffect(() => {
    if (loading || topics.length === 0) return;
    if (selectedId && !topics.some((tp) => tp.id === selectedId)) {
      setSelectedId(null);
      setLastViewedId(null);
    }
  }, [loading, topics, selectedId, setLastViewedId]);

  const select = (id: string | null) => {
    setSelectedId(id);
    setLastViewedId(id);
  };

  const selectedTopic = selectedId ? topics.find((tp) => tp.id === selectedId) ?? null : null;

  return (
    <div className="retro-gallery">
      <div className="retro-gallery-header">
        <RetroTabBar retroFilter={retroFilter} setRetroFilter={setRetroFilter} />
      </div>

      <TopicPillBar
        topics={topics}
        loading={loading}
        error={error}
        selectedId={selectedId}
        onSelect={select}
        onCreate={create}
        requireLoginInDemo={requireLoginInDemo}
      />

      {topics.length === 0 ? null : selectedTopic ? (
        <TopicDocument
          key={selectedTopic.id}
          topic={selectedTopic}
          onUpdate={update}
          onDelete={remove}
          onDeleted={() => select(null)}
          requireLoginInDemo={requireLoginInDemo}
        />
      ) : loading ? null : (
        <TopicPicker topics={topics} onSelect={select} />
      )}
    </div>
  );
}
```

- [ ] **Step 3: CSS 추가(상단 여백 정리)**

`my-app/src/app/styles/widgets/topic-studio.css` 끝에 추가:

```css
/* ---------- 좁은 폭(<900px) ---------- */
@media (max-width: 900px) {
  .topic-pill-row {
    flex-wrap: nowrap;
  }
}
```

(레일 접힘·헤드라인 스케일은 `.retro-doc`/`.retro-doc-rail`이 이미 900px에서 처리 —
`retro.css:513` 참고. 여기서는 pill 바 전용 규칙만 추가한다.)

- [ ] **Step 4: 빌드 확인**

```bash
cd my-app && pnpm build
```

Expected: **여기서 처음으로 전체 빌드가 통과한다.** 이전 태스크들에서 남아있던
`TopicSidebar.tsx`/`TopicDigestPane.tsx` 참조 에러가 이 삭제로 전부 해소된다.

- [ ] **Step 5: 수동 확인(dev 서버)**

```bash
cd my-app && pnpm dev
```

1. 로그인 후 회고 스튜디오 → "주제" 탭 → 주제 0개면 "첫 주제 만들기" 화면이 보이는지.
2. "새 주제" 생성(예: "ARCHIVE 프로젝트") → 생성 직후 자동 선택되어 `TopicDocument`가
   빈 상태("아직 정리되지 않았습니다")로 뜨는지.
3. "지금 정리하기" 클릭 → "정리 중" 진행률 UI로 바뀌는지(백엔드가 실제 SSE 진행률을
   보내면 `9 / 24` 형태로, 안 보내도 최소한 불확정 스피너로) → 완료 후 본문이 렌더되는지.
4. 제목/설명 클릭 → 인라인 입력으로 바뀌는지, Enter로 저장·Esc로 취소되는지, 저장 후
   pill의 이름도 같이 바뀌는지(카운트는 그대로 유지되는지 — Task 5 Step 1의 병합 로직
   확인 포인트).
5. 새 주제를 하나 더 만들어 pill이 2개가 되면, 페이지를 새로고침했을 때 마지막으로 본
   주제가 자동으로 다시 선택되는지(`localStorage`의 `archive.lastViewedTopicId` 확인).
6. pill을 다시 클릭해 선택 해제 → `TopicPicker`("어떤 주제를 볼까요?")가 뜨는지.
7. "소스 N개 보기" → 640px 모달이 뜨고 회고/할 일이 섞인 목록 + 하단 범례가 보이는지,
   Esc/배경 클릭으로 닫히는지.
8. 주제 삭제 → 확인 모달 → 삭제 후 선택이 풀리고 pill에서 사라지는지.
9. `?demo=true`로 접속해 생성/정리/삭제 클릭 시 로그인 유도 토스트만 뜨고 실제 요청이
   안 나가는지(Network 탭에 `/topics` 요청 없어야 함).

- [ ] **Step 6: Commit**

```bash
git add my-app/src/widgets/retrospective-studio/ui/TopicsPane.tsx \
        my-app/src/app/styles/widgets/topic-studio.css
git rm my-app/src/widgets/retrospective-studio/ui/TopicSidebar.tsx \
       my-app/src/widgets/retrospective-studio/ui/TopicDigestPane.tsx
git commit -m "feat(topic): recompose TopicsPane with pill bar + picker + document; drop old sidebar/pane"
```

---

### Task 13: 최종 회귀 확인 + 문서 갱신

**Files:**
- Modify: `docs/superpowers/specs/2026-09-04-retro-redesign-design.md` (완료 표시)
- Modify: `docs/be-request-2026-09-04-topics-api.md` (완료 표시)

**Interfaces:** 없음(문서 전용 태스크).

- [ ] **Step 1: 전체 회귀 수동 확인**

```bash
cd my-app && pnpm dev
```

Task 12 Step 5의 9개 항목을 처음부터 다시 훑는다. 추가로:

- 회고 탭(전체/일간/주간/월간/연간) ↔ 주제 탭을 여러 번 오가도 `useRetroEntriesPage`/
  `useFolderContents`가 불필요하게 재요청하지 않는지(Network 탭).
- 브라우저 창 폭을 900px 이하로 줄여 레일이 본문 아래로 내려가는지, watermark 배너는
  본문 위에 남는지.

- [ ] **Step 2: 언어 전환 확인**

설정에서 언어를 en/ja/zh로 바꿔가며 "주제" 탭에 깨진 텍스트(`topic.xxx` 키 그대로 노출)가
없는지 확인한다.

- [ ] **Step 3: 최종 빌드**

```bash
cd my-app && pnpm build
```

Expected: 통과.

- [ ] **Step 4: 설계 문서에 완료 표시**

`docs/superpowers/specs/2026-09-04-retro-redesign-design.md`의 §3 도입부(3.0 표 위)에
한 줄 추가:

```markdown
> **2026-09-08 구현 완료** — `docs/superpowers/plans/2026-09-08-topic-view-redesign.md`
> 참고. 이하 §3.0~3.6은 구현이 끝난 뒤에도 참조용 스펙으로 남긴다.
```

- [ ] **Step 5: BE 요청서에 완료 표시**

`docs/be-request-2026-09-04-topics-api.md` 최상단(제목 바로 아래)에 추가:

```markdown
> **2026-09-08: 작업 1~9 전부 BE 구현 완료, FE 반영 완료.** 이 문서는 계약 이력 참고용으로
> 남긴다.
```

- [ ] **Step 6: Commit**

```bash
git add docs/superpowers/specs/2026-09-04-retro-redesign-design.md \
        docs/be-request-2026-09-04-topics-api.md
git commit -m "docs: mark Phase 2 topic view redesign as implemented"
```
