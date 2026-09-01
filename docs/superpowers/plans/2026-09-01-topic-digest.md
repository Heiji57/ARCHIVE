# 주제별 자동 정리 문서(Topic Digest) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 회고 스튜디오에 "주제(Topics)" 탭을 추가해, 사용자가 선언한 주제별로 회고/할 일에서 관련 내용만 AI가 발췌한 정리 문서를 수동으로 생성·조회·삭제할 수 있게 한다.

**Architecture:** `entities/topic`(타입) + `shared/api/topics.ts`(REST + SSE 클라이언트) + `AppProvider`의 얇은 pass-through 메서드 5개 + `widgets/retrospective-studio` 안의 위젯 로컬 훅 2개(`useTopics`, `useTopicDigest`)와 신규 UI 컴포넌트 4개(`RetroTabBar` 추출, `TopicSidebar`, `TopicDigestPane`, `TopicsPane`). 글로벌 reducer 상태는 확장하지 않는다(digest는 서버가 진실 공급원).

**Tech Stack:** React + TypeScript, FSD 아키텍처, `fetch` 기반 API 클라이언트(`shared/api/client.ts`), `marked`/TipTap 기반 `RichEditor`, 순수 CSS(외부 UI 라이브러리 없음). 테스트 러너 없음 — 게이트는 `pnpm build`(`tsc -b && vite build`).

**Spec:** `docs/superpowers/specs/2026-09-01-topic-digest-design.md`

## Global Constraints

- **`api.yaml`이 SST** — 이 계획의 Task 1에서 백엔드 코드(`/home/minsu/PycharmProjects/ARCHIVE-BE`)를 근거로 FE `api.yaml`에 `/topics` 경로를 추가하고, 이후 모든 타입은 `pnpm gen:api`가 생성한 `schema.d.ts`에서 가져온다. 계약과 다른 필드/엔드포인트를 상상해서 만들지 않는다.
- **패키지 매니저는 pnpm만 사용.** 런타임 외부 라이브러리 신규 추가 금지(`fetch` 표준 API 직접 사용).
- **FSD 레이어 규칙**: `app → pages → widgets → entities → shared`. API 클라이언트는 `shared/api`에만 둔다. 위젯은 `shared/api`를 직접 import하지 않고 반드시 `useArchiveApp()`(AppProvider 컨텍스트)을 통해서만 API를 호출한다(이 저장소의 기존 관례, `useRetroEntriesPage`/`useFolderContents` 참고).
- **API는 `snake_case`, FE 도메인 타입은 `camelCase`.** 변환은 `shared/api/topics.ts` 내부의 로컬 매퍼 함수에서만 한다(`summaries.ts`의 `toSummary`/`toSummaryEntry` 패턴과 동일, 공용 `mappers.ts`는 건드리지 않는다).
- **에러 분기는 HTTP status가 아니라 `code` 문자열로 한다.** `ApiError.code`로 switch/if 하고, `TOPIC_LIMIT_REACHED`의 `details`는 `{field,message}` 표준 shape이 아니라 `[{"limit": number}]` 특수 shape이므로 `as unknown as {limit?: number}` 캐스팅이 필요하다.
- **테스트 러너 없음.** 각 태스크의 검증은 `pnpm build`(타입체크 + 번들) 통과로 한다. UI를 다루는 태스크는 추가로 `pnpm dev`를 띄워 명시된 수동 확인 절차를 거친다.
- **매 태스크 후 커밋.** 이 저장소는 `git commit`을 명시적으로 요청받았을 때만 하도록 하는 별도 정책이 있으나, 이 계획을 실행하는 세션은 사용자가 "진행해줘"로 이미 전체 구현을 승인했으므로 각 태스크 끝에 커밋한다.

---

### Task 1: `api.yaml`에 `/topics` 경로 추가 + 타입 생성

**Files:**
- Modify: `my-app/api.yaml`
- Generate: `my-app/src/shared/api/schema.d.ts` (자동 생성물, 직접 수정 금지)

**Interfaces:**
- Consumes: 없음 (계약 정의 단계)
- Produces: `components["schemas"]["TopicResponse"]`, `components["schemas"]["TopicDigestResponse"]`, `components["schemas"]["CreateTopicRequest"]` — Task 2가 이 타입들을 `schema.d.ts`에서 import한다.

- [ ] **Step 1: `api.yaml`에 스키마 3개 추가**

`components.schemas` 섹션(기존 `SummaryResponse` 등이 정의된 곳)에 아래를 추가한다:

```yaml
    TopicResponse:
      type: object
      required: [id, name, description, created_at]
      properties:
        id: { type: string }
        name: { type: string }
        description: { type: string }
        created_at: { type: string, format: date-time }
        updated_at: { type: string, format: date-time, nullable: true }
    CreateTopicRequest:
      type: object
      required: [name]
      properties:
        name: { type: string, minLength: 1, maxLength: 100 }
        description: { type: string, maxLength: 500, default: "" }
    TopicDigestResponse:
      type: object
      required: [id, topic_id, status]
      properties:
        id: { type: string }
        topic_id: { type: string }
        status:
          type: string
          enum: [pending, in_progress, completed, failed]
        content: { type: string, nullable: true }
        watermark_date_key: { type: string, nullable: true }
        created_at: { type: string, format: date-time }
        updated_at: { type: string, format: date-time, nullable: true }
```

- [ ] **Step 2: `api.yaml`에 경로 3개 추가**

`paths` 섹션에 추가한다(백엔드 `src/app/topic/presentation/router.py` 기준 — 실제 라우터 코드에서 이미 확정된 계약이므로 그대로 옮긴다):

```yaml
  /topics:
    post:
      tags: [topics]
      summary: 주제 생성
      requestBody:
        required: true
        content:
          application/json:
            schema: { $ref: "#/components/schemas/CreateTopicRequest" }
      responses:
        "201":
          description: 생성됨
          content:
            application/json:
              schema:
                allOf:
                  - $ref: "#/components/schemas/ApiResponse"
                  - properties:
                      data: { $ref: "#/components/schemas/TopicResponse" }
      x-error-codes: [TOPIC_NAME_DUPLICATED, TOPIC_LIMIT_REACHED, VALIDATION_ERROR]
    get:
      tags: [topics]
      summary: 주제 목록 조회
      responses:
        "200":
          description: OK
          content:
            application/json:
              schema:
                allOf:
                  - $ref: "#/components/schemas/ApiResponse"
                  - properties:
                      data:
                        type: array
                        items: { $ref: "#/components/schemas/TopicResponse" }
  /topics/{topic_id}:
    delete:
      tags: [topics]
      summary: 주제 삭제
      parameters:
        - name: topic_id
          in: path
          required: true
          schema: { type: string }
      responses:
        "204":
          description: 삭제됨
      x-error-codes: [TOPIC_NOT_FOUND]
  /topics/{topic_id}/digest/generate:
    post:
      tags: [topics]
      summary: 주제 정리 문서 생성/재생성 요청(비동기)
      parameters:
        - name: topic_id
          in: path
          required: true
          schema: { type: string }
      responses:
        "202":
          description: 생성 요청 접수
          content:
            application/json:
              schema:
                allOf:
                  - $ref: "#/components/schemas/ApiResponse"
                  - properties:
                      data: { $ref: "#/components/schemas/TopicDigestResponse" }
      x-error-codes: [TOPIC_NOT_FOUND, TOPIC_DIGEST_ALREADY_IN_PROGRESS]
  /topics/{topic_id}/digest:
    get:
      tags: [topics]
      summary: 주제 정리 문서 조회
      parameters:
        - name: topic_id
          in: path
          required: true
          schema: { type: string }
      responses:
        "200":
          description: OK
          content:
            application/json:
              schema:
                allOf:
                  - $ref: "#/components/schemas/ApiResponse"
                  - properties:
                      data: { $ref: "#/components/schemas/TopicDigestResponse" }
      x-error-codes: [TOPIC_NOT_FOUND, TOPIC_DIGEST_NOT_FOUND]
  /topics/{topic_id}/digest/stream:
    get:
      tags: [topics]
      summary: 주제 정리 문서 생성 완료 SSE 구독
      parameters:
        - name: topic_id
          in: path
          required: true
          schema: { type: string }
      responses:
        "200":
          description: text/event-stream
```

기존 `x-tagGroups`(파일 상단 근처)의 적절한 그룹에 `topics` 태그를 추가한다(예: `entries, summaries` 그룹 옆에 `topics` 포함).

- [ ] **Step 3: 타입 생성 및 빌드 확인**

```bash
cd my-app
pnpm gen:api
pnpm build
```

Expected: `schema.d.ts`에 `TopicResponse`/`TopicDigestResponse`/`CreateTopicRequest`가 생성되고, 아직 아무도 참조하지 않으므로 빌드는 기존과 동일하게 통과한다.

- [ ] **Step 4: Commit**

```bash
git add my-app/api.yaml my-app/src/shared/api/schema.d.ts
git commit -m "feat: add /topics contract to api.yaml and regenerate types"
```

---

### Task 2: `entities/topic` 타입 + `shared/api/topics.ts`

**Files:**
- Create: `my-app/src/entities/topic/model/types.ts`
- Create: `my-app/src/shared/api/topics.ts`
- Modify: `my-app/src/shared/api/index.ts`

**Interfaces:**
- Consumes: `components["schemas"]["TopicResponse"|"TopicDigestResponse"]`(Task 1), `request`/`streamSSE`(`shared/api/client.ts`), `ApiError`(`shared/api/errors.ts`)
- Produces: `Topic`, `TopicDigest`, `DigestStatus`(`entities/topic/model/types.ts`); `apiListTopics()`, `apiCreateTopic(name, description)`, `apiDeleteTopic(id)`, `apiGenerateDigest(topicId)`, `apiGetDigest(topicId)`, `streamTopicDigest(topicId, handlers)` — Task 4(AppProvider)가 이 6개 함수를 그대로 소비한다.

- [ ] **Step 1: 타입 정의**

`my-app/src/entities/topic/model/types.ts`:

```ts
export type DigestStatus = "pending" | "in_progress" | "completed" | "failed";

export interface Topic {
  id: string;
  name: string;
  description: string;
  createdAt: string;
  updatedAt: string | null;
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
```

- [ ] **Step 2: API 클라이언트 작성**

`my-app/src/shared/api/topics.ts`:

```ts
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
```

- [ ] **Step 3: 배럴에 export 추가**

`my-app/src/shared/api/index.ts`에 다음 블록을 추가한다(기존 `apiListEntries` 등 블록 옆):

```ts
export {
  apiListTopics,
  apiCreateTopic,
  apiDeleteTopic,
  apiGenerateDigest,
  apiGetDigest,
  streamTopicDigest,
  type TopicDigestStreamHandlers,
} from "./topics";
```

- [ ] **Step 4: 빌드 확인**

```bash
cd my-app && pnpm build
```

Expected: 에러 없이 통과 (아직 아무도 이 모듈을 소비하지 않음).

- [ ] **Step 5: Commit**

```bash
git add my-app/src/entities/topic my-app/src/shared/api/topics.ts my-app/src/shared/api/index.ts
git commit -m "feat: add Topic entity types and topics API client"
```

---

### Task 3: i18n 키 + `RetroTab`/`RETRO_FILTERS`

**Files:**
- Modify: `my-app/src/shared/lib/i18n/keys.ts`
- Modify: `my-app/src/shared/lib/i18n/locales/ko.ts`
- Modify: `my-app/src/shared/lib/i18n/locales/en.ts`
- Modify: `my-app/src/shared/lib/i18n/locales/ja.ts`
- Modify: `my-app/src/shared/lib/i18n/locales/zh.ts`
- Modify: `my-app/src/widgets/retrospective-studio/model/constants.ts`
- Modify: `my-app/src/widgets/retrospective-studio/model/useRetroFilter.ts`
- Modify: `my-app/src/widgets/retrospective-studio/model/useRetroEntriesPage.ts`
- Modify: `my-app/src/widgets/retrospective-studio/model/useFolderContents.ts`

**Interfaces:**
- Consumes: 없음
- Produces: `RetroTab`(`RetrospectiveType | "all" | "topics"`), `RETRO_FILTERS`(topics 탭 포함), 아래 `TranslationKey` 목록 — 이후 모든 UI 태스크가 이 키들과 타입을 사용한다.

**⚠️ 주의**: `RetroTab`을 넓히면 이 타입을 좁혀서 `RetrospectiveType`(엄격 4종) 매개변수에 넘기는 기존 코드 3곳이 컴파일 에러가 난다(`retroType: RetrospectiveType`는 `getEntriesByRetroType`/`loadEntriesPage`/`loadFolderContents`의 실제 매개변수 타입이다 — `src/entities/entry/lib/selectors.ts:8`, `src/app/model/types.ts:281`, `src/app/model/types.ts:298`에서 확인됨). Step 3 이후 반드시 아래 Step 4~6에서 이 3곳도 함께 고쳐야 이 태스크 끝에 빌드가 통과한다("topics" 탭은 이 세 함수를 애초에 호출하지 않게 만들 것이므로, 여기서는 "topics"를 "all"과 동일하게 취급해 타입만 통과시키면 된다 — 실제 topics 데이터 흐름과 무관).

- [ ] **Step 1: `keys.ts`에 키 추가**

`my-app/src/shared/lib/i18n/keys.ts`에서 `| "retro.filter.periodFilter"` 줄(291번 근처) 바로 다음, `// Summary overlay` 주석 앞에 삽입:

```ts
  | "retro.filter.periodFilter"
  // Topics
  | "retro.filter.topics"
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
  // Summary overlay
```

- [ ] **Step 2: 로케일 4개에 값 추가**

`my-app/src/shared/lib/i18n/locales/ko.ts`에서 `"retro.filter.periodFilter"` 항목 바로 다음에 삽입:

```ts
  "retro.filter.topics": "주제",
  "topic.sidebar.newTopic": "새 주제",
  "topic.sidebar.namePlaceholder": "주제 이름 (예: ARCHIVE 프로젝트)",
  "topic.sidebar.descPlaceholder": "설명 (선택)",
  "topic.sidebar.deleteTitle": "주제를 삭제할까요?",
  "topic.sidebar.deleteMessage": "이 주제와 정리 문서가 함께 삭제됩니다. 되돌릴 수 없습니다.",
  "topic.sidebar.limitReached": "주제는 최대 {limit}개까지 만들 수 있어요.",
  "topic.sidebar.nameDuplicated": "이미 같은 이름의 주제가 있어요.",
  "topic.sidebar.generateButton": "정리하기",
  "topic.sidebar.generateInProgress": "정리 중...",
  "topic.sidebar.listLoading": "주제를 불러오는 중...",
  "topic.sidebar.listError": "주제 목록을 불러오지 못했어요.",
  "topic.sidebar.emptyTitle": "아직 주제가 없어요. 첫 주제를 만들어보세요.",
  "topic.pane.loading": "정리 문서를 불러오는 중...",
  "topic.pane.loadError": "정리 문서를 불러오지 못했어요.",
  "topic.pane.emptyTitle": "아직 정리된 내용이 없어요",
  "topic.pane.emptyDesc": "왼쪽에서 '정리하기'를 눌러 이 주제 관련 회고·할 일을 모아보세요.",
  "topic.pane.noSelection": "왼쪽에서 주제를 선택하세요.",
  "topic.pane.watermark": "{date} 까지의 내용이 반영됨",
  "topic.generate.failed": "정리 생성에 실패했어요. 잠시 후 다시 시도해주세요.",
```

`en.ts`:

```ts
  "retro.filter.topics": "Topics",
  "topic.sidebar.newTopic": "New topic",
  "topic.sidebar.namePlaceholder": "Topic name (e.g. ARCHIVE project)",
  "topic.sidebar.descPlaceholder": "Description (optional)",
  "topic.sidebar.deleteTitle": "Delete this topic?",
  "topic.sidebar.deleteMessage": "This topic and its digest will be deleted. This cannot be undone.",
  "topic.sidebar.limitReached": "You can create up to {limit} topics.",
  "topic.sidebar.nameDuplicated": "A topic with this name already exists.",
  "topic.sidebar.generateButton": "Generate",
  "topic.sidebar.generateInProgress": "Generating...",
  "topic.sidebar.listLoading": "Loading topics...",
  "topic.sidebar.listError": "Failed to load topics.",
  "topic.sidebar.emptyTitle": "No topics yet. Create your first one.",
  "topic.pane.loading": "Loading digest...",
  "topic.pane.loadError": "Failed to load the digest.",
  "topic.pane.emptyTitle": "Nothing here yet",
  "topic.pane.emptyDesc": "Click 'Generate' on the left to collect entries and todos related to this topic.",
  "topic.pane.noSelection": "Select a topic on the left.",
  "topic.pane.watermark": "Reflects content through {date}",
  "topic.generate.failed": "Failed to generate the digest. Please try again.",
```

`ja.ts`:

```ts
  "retro.filter.topics": "トピック",
  "topic.sidebar.newTopic": "新しいトピック",
  "topic.sidebar.namePlaceholder": "トピック名（例：ARCHIVEプロジェクト）",
  "topic.sidebar.descPlaceholder": "説明（任意）",
  "topic.sidebar.deleteTitle": "このトピックを削除しますか？",
  "topic.sidebar.deleteMessage": "このトピックと整理ドキュメントが削除されます。元に戻せません。",
  "topic.sidebar.limitReached": "トピックは最大{limit}個まで作成できます。",
  "topic.sidebar.nameDuplicated": "同じ名前のトピックが既にあります。",
  "topic.sidebar.generateButton": "整理する",
  "topic.sidebar.generateInProgress": "整理中...",
  "topic.sidebar.listLoading": "トピックを読み込み中...",
  "topic.sidebar.listError": "トピック一覧の読み込みに失敗しました。",
  "topic.sidebar.emptyTitle": "まだトピックがありません。最初のトピックを作成しましょう。",
  "topic.pane.loading": "整理ドキュメントを読み込み中...",
  "topic.pane.loadError": "整理ドキュメントの読み込みに失敗しました。",
  "topic.pane.emptyTitle": "まだ整理された内容がありません",
  "topic.pane.emptyDesc": "左側の「整理する」を押して、このトピックに関する会顧・タスクを集めましょう。",
  "topic.pane.noSelection": "左側でトピックを選択してください。",
  "topic.pane.watermark": "{date} までの内容が反映されています",
  "topic.generate.failed": "整理の生成に失敗しました。しばらくしてからもう一度お試しください。",
```

`zh.ts`:

```ts
  "retro.filter.topics": "主题",
  "topic.sidebar.newTopic": "新建主题",
  "topic.sidebar.namePlaceholder": "主题名称（例如：ARCHIVE 项目）",
  "topic.sidebar.descPlaceholder": "描述（可选）",
  "topic.sidebar.deleteTitle": "要删除这个主题吗？",
  "topic.sidebar.deleteMessage": "该主题及其整理文档将被删除，且无法恢复。",
  "topic.sidebar.limitReached": "最多可以创建 {limit} 个主题。",
  "topic.sidebar.nameDuplicated": "已存在同名主题。",
  "topic.sidebar.generateButton": "整理",
  "topic.sidebar.generateInProgress": "整理中...",
  "topic.sidebar.listLoading": "正在加载主题...",
  "topic.sidebar.listError": "加载主题列表失败。",
  "topic.sidebar.emptyTitle": "还没有主题，创建第一个吧。",
  "topic.pane.loading": "正在加载整理文档...",
  "topic.pane.loadError": "加载整理文档失败。",
  "topic.pane.emptyTitle": "还没有整理内容",
  "topic.pane.emptyDesc": "点击左侧的“整理”，收集与该主题相关的日志和待办。",
  "topic.pane.noSelection": "请在左侧选择一个主题。",
  "topic.pane.watermark": "已反映至 {date} 的内容",
  "topic.generate.failed": "生成整理失败，请稍后重试。",
```

- [ ] **Step 3: `RetroTab`/`RETRO_FILTERS`에 topics 추가**

`my-app/src/widgets/retrospective-studio/model/constants.ts`에서 기존:

```ts
export type RetroTab = RetrospectiveType | "all";
```

를 다음으로 교체:

```ts
export type RetroTab = RetrospectiveType | "all" | "topics";
```

기존:

```ts
export const RETRO_FILTERS: RetroFilterConfig[] = [
  { id: "all", labelKey: "retro.filter.all" },
  { id: "daily", labelKey: "retro.filter.daily" },
  { id: "weekly", labelKey: "retro.filter.weekly" },
  { id: "monthly", labelKey: "retro.filter.monthly" },
  { id: "yearly", labelKey: "retro.filter.yearly" },
];
```

를 다음으로 교체:

```ts
export const RETRO_FILTERS: RetroFilterConfig[] = [
  { id: "all", labelKey: "retro.filter.all" },
  { id: "daily", labelKey: "retro.filter.daily" },
  { id: "weekly", labelKey: "retro.filter.weekly" },
  { id: "monthly", labelKey: "retro.filter.monthly" },
  { id: "yearly", labelKey: "retro.filter.yearly" },
  { id: "topics", labelKey: "retro.filter.topics" },
];
```

- [ ] **Step 4: `useRetroFilter.ts` — "topics"를 "all"처럼 무필터 처리**

`my-app/src/widgets/retrospective-studio/model/useRetroFilter.ts`의 기존(86~89번 줄):

```ts
  const allOfType = useMemo(
    () => (retroFilter === "all" ? entries : getEntriesByRetroType(entries, retroFilter)),
    [entries, retroFilter],
  );
```

를 다음으로 교체:

```ts
  const allOfType = useMemo(
    () =>
      retroFilter === "all" || retroFilter === "topics"
        ? entries
        : getEntriesByRetroType(entries, retroFilter),
    [entries, retroFilter],
  );
```

(`retroFilter === "all" || retroFilter === "topics"` 분기에서 `retroFilter`가 제외되므로, else 분기의 `retroFilter` 타입이 `RetrospectiveType`으로 좁혀져 `getEntriesByRetroType`에 그대로 전달 가능해진다. "topics" 탭에서 이 값(`filteredEntries`)은 어차피 화면에 쓰이지 않는다 — `TopicsPane`은 `state.entries`를 참조하지 않는다.)

- [ ] **Step 5: `useRetroEntriesPage.ts`/`useFolderContents.ts` — 동일 패턴 수정**

`my-app/src/widgets/retrospective-studio/model/useRetroEntriesPage.ts`의 기존:

```ts
    void loadEntriesPage({
      retroType: retroType === "all" ? undefined : retroType,
```

를 다음으로 교체:

```ts
    void loadEntriesPage({
      retroType: retroType === "all" || retroType === "topics" ? undefined : retroType,
```

`my-app/src/widgets/retrospective-studio/model/useFolderContents.ts`의 기존(71번 줄):

```ts
      retroType: retroType === "all" ? undefined : retroType,
```

를 다음으로 교체:

```ts
      retroType: retroType === "all" || retroType === "topics" ? undefined : retroType,
```

(두 훅 모두 Task 10에서 `enabled=false`로 topics 탭일 때 실제 호출 자체를 막지만, `enabled`는 런타임 값이라 TS 타입체크와는 무관하다 — 이 수정 없이는 `pnpm build`가 실패한다.)

- [ ] **Step 6: 빌드 확인**

```bash
cd my-app && pnpm build
```

Expected: 통과. (`RetroFilterConfig.id: RetroTab`이므로 `RETRO_FILTERS`에 `"topics"`를 추가해도 타입 에러 없음 — `RetroTab`에 이미 추가했기 때문. Step 4~5의 수정으로 `getEntriesByRetroType`/`loadEntriesPage`/`loadFolderContents` 호출부도 타입 통과.)

- [ ] **Step 7: Commit**

```bash
git add my-app/src/shared/lib/i18n my-app/src/widgets/retrospective-studio/model/constants.ts my-app/src/widgets/retrospective-studio/model/useRetroFilter.ts my-app/src/widgets/retrospective-studio/model/useRetroEntriesPage.ts my-app/src/widgets/retrospective-studio/model/useFolderContents.ts
git commit -m "feat: add topics tab i18n keys and RetroTab entry"
```

---

### Task 4: `AppProvider`에 얇은 pass-through 메서드 5개

**Files:**
- Modify: `my-app/src/app/model/types.ts`
- Modify: `my-app/src/app/providers/AppProvider.tsx`

**Interfaces:**
- Consumes: `apiListTopics`, `apiCreateTopic`, `apiDeleteTopic`, `apiGenerateDigest`, `apiGetDigest`(Task 2, `@/shared/api`), `Topic`/`TopicDigest`(Task 2, `@/entities/topic/model/types`)
- Produces: `useArchiveApp().loadTopics()`, `.createTopic(name, description)`, `.deleteTopic(id)`, `.generateTopicDigest(topicId)`, `.getTopicDigest(topicId)` — Task 6(`useTopics`/`useTopicDigest`)이 이 5개를 소비한다.

- [ ] **Step 1: `ArchiveAppContextValue`에 메서드 시그니처 추가**

`my-app/src/app/model/types.ts`에서 `cancelSummary: () => void;`(401번 근처) 바로 다음, `// ─── Templates` 주석 앞에 삽입:

```ts
  cancelSummary: () => void;
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
  // ─── Templates ──────────────────────────────────────────────────────────
```

(파일 전체에서 이미 `import("@/app/model/settings").AccountType` 처럼 인라인 `import()` 타입을 쓰는 관례가 있으므로 동일하게 따른다 — 상단 import 목록을 늘리지 않기 위함.)

- [ ] **Step 2: `AppProvider.tsx`에 barrel import 추가**

`my-app/src/app/providers/AppProvider.tsx`의 기존 `@/shared/api` import 블록(76~145번 줄)에 아래 5개를 추가한다:

```ts
  apiListTopics,
  apiCreateTopic,
  apiDeleteTopic,
  apiGenerateDigest,
  apiGetDigest,
```

- [ ] **Step 3: context value 객체에 구현 추가**

`cancelSummary: () => {...},`(1663~1668번 줄) 바로 다음, `// ─── Templates` 주석 앞에 삽입:

```ts
    // ─── Topics ───────────────────────────────────────────────────────────
    loadTopics: () => apiListTopics(),
    createTopic: (name, description) => apiCreateTopic(name, description),
    deleteTopic: (id) => apiDeleteTopic(id),
    generateTopicDigest: (topicId) => apiGenerateDigest(topicId),
    getTopicDigest: (topicId) => apiGetDigest(topicId),
```

mock/데모 분기는 넣지 않는다 — `entities/topic`엔 대응 mock 생성기가 없고, 데모 게이팅은 위젯 레벨(`requireLoginInDemo`)에서 액션 호출 전에 처리한다(Task 7/8에서 구현).

- [ ] **Step 4: 빌드 확인**

```bash
cd my-app && pnpm build
```

Expected: 통과.

- [ ] **Step 5: Commit**

```bash
git add my-app/src/app/model/types.ts my-app/src/app/providers/AppProvider.tsx
git commit -m "feat: expose topic API pass-through methods on AppProvider"
```

---

### Task 5: `RetroTabBar` 추출 + `RetroGallery` 수정

**Files:**
- Create: `my-app/src/widgets/retrospective-studio/ui/RetroTabBar.tsx`
- Modify: `my-app/src/widgets/retrospective-studio/ui/RetroGallery.tsx`

**Interfaces:**
- Consumes: `RETRO_FILTERS`(Task 3, `../model/constants`), `RetroTab`(Task 3), `useTranslation`(`@/shared/lib/i18n`)
- Produces: `RetroTabBar({ retroFilter, setRetroFilter })` — Task 9(`TopicsPane`)가 소비한다.

- [ ] **Step 1: `RetroTabBar.tsx` 작성**

`RetroGallery.tsx`의 기존 308~321번 줄 블록을 그대로 옮긴 순수 표시 컴포넌트:

```tsx
import { useTranslation } from "@/shared/lib/i18n";
import { RETRO_FILTERS, type RetroTab } from "../model/constants";

export interface RetroTabBarProps {
  retroFilter: RetroTab;
  setRetroFilter: (tab: RetroTab) => void;
}

/** 회고 스튜디오 상단 종류 탭(전체/일간/주간/월간/연간/주제). */
export function RetroTabBar({ retroFilter, setRetroFilter }: RetroTabBarProps) {
  const { t } = useTranslation();
  return (
    <div className="retro-gallery-tabs">
      {RETRO_FILTERS.map((f) => (
        <button
          key={f.id}
          type="button"
          className="retro-gallery-chip"
          data-active={retroFilter === f.id ? "true" : undefined}
          onClick={() => setRetroFilter(f.id)}
        >
          {t(f.labelKey)}
        </button>
      ))}
    </div>
  );
}
```

- [ ] **Step 2: `RetroGallery.tsx`에서 인라인 블록을 `RetroTabBar` 사용으로 교체**

`RetroGallery.tsx`의 import 목록에 추가:

```ts
import { RetroTabBar } from "./RetroTabBar";
```

기존(308~321번 줄):

```tsx
        {/* 타입 칩 */}
        <div className="retro-gallery-tabs">
          {RETRO_FILTERS.map((f) => (
            <button
              key={f.id}
              type="button"
              className="retro-gallery-chip"
              data-active={retroFilter === f.id ? "true" : undefined}
              onClick={() => setRetroFilter(f.id)}
            >
              {t(f.labelKey)}
            </button>
          ))}
        </div>
```

를 다음으로 교체:

```tsx
        {/* 타입 칩 */}
        <RetroTabBar retroFilter={retroFilter} setRetroFilter={setRetroFilter} />
```

`RetroGallery.tsx` 상단 import에서 더 이상 쓰이지 않게 된 `RETRO_FILTERS`를 import 목록에서 제거한다(`RetroDragPayload`, `RETRO_DRAG_KIND`, `MONTHS`는 계속 사용되므로 유지).

- [ ] **Step 3: 빌드 확인 + 수동 확인**

```bash
cd my-app && pnpm build && pnpm dev
```

브라우저에서 회고 스튜디오 진입 → 기존 전체/일간/주간/월간/연간 탭이 그대로 동작하는지(클릭 시 목록 필터링) 확인. (아직 "주제" 탭을 눌러도 아무 화면도 없음 — Task 8까지는 정상.)

- [ ] **Step 4: Commit**

```bash
git add my-app/src/widgets/retrospective-studio/ui/RetroTabBar.tsx my-app/src/widgets/retrospective-studio/ui/RetroGallery.tsx
git commit -m "refactor: extract RetroTabBar from RetroGallery for reuse"
```

---

### Task 6: `useTopics` + `useTopicDigest` 훅

**Files:**
- Create: `my-app/src/widgets/retrospective-studio/model/useTopics.ts`
- Create: `my-app/src/widgets/retrospective-studio/model/useTopicDigest.ts`

**Interfaces:**
- Consumes: `useArchiveApp().loadTopics/createTopic/deleteTopic/generateTopicDigest/getTopicDigest`(Task 4), `Topic`/`TopicDigest`/`DigestStatus`(Task 2), `streamTopicDigest`는 직접 쓰지 않는다(SSE는 `getTopicDigest`/`generateTopicDigest`를 감싸는 폴링 루프의 보조 신호로만 쓰고, 스트림 자체는 `useArchiveApp()`을 거치지 않고 이 훅이 `@/shared/api`에서 직접 import한다 — SSE 구독은 API 호출이 아니라 순수 이벤트 구독이라 위젯이 직접 열어도 FSD 경계를 해치지 않으며, `useServerSync.ts`의 알림 SSE도 같은 방식이다).
- Produces: `useTopics()` → `{ topics, loading, error, create, remove, refetch }`; `useTopicDigest(topicId)` → `{ digest, status, loading, generating, generate }` — Task 7(`TopicSidebar`)과 Task 8(`TopicDigestPane`)이 각각 소비한다.

- [ ] **Step 1: 기존 알림 SSE가 위젯에서 직접 열리는 패턴 확인**

```bash
cd my-app && grep -n "streamNotifications\|useServerSync" src/app/providers/useServerSync.ts | head -5
```

Expected: `streamNotifications`(SSE 구독 함수)를 `AppProvider`쪽 훅이 `@/shared/api`에서 직접 import해서 쓰고 있음을 확인 — 이번 `useTopicDigest`도 `streamTopicDigest`를 `@/shared/api`에서 직접 import하는 것이 이 저장소의 기존 관례임을 검증하는 단계(코드 변경 없음).

- [ ] **Step 2: `useTopics.ts` 작성**

```ts
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
      const topic = await createTopic(name, description);
      setTopics((prev) => [...prev, topic]);
      return topic;
    },
    [createTopic],
  );

  const remove = useCallback(
    async (id: string) => {
      await deleteTopic(id);
      setTopics((prev) => prev.filter((t) => t.id !== id));
    },
    [deleteTopic],
  );

  return { topics, loading, error, create, remove, refetch };
}
```

- [ ] **Step 3: `useTopicDigest.ts` 작성**

폴링(5초, 최대 72회=6분) + SSE 이중 감시 — `startSummaryViaApi`(`AppProvider.tsx`)와 동일한 검증된 패턴을 이식한다:

```ts
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
```

- [ ] **Step 4: 빌드 확인**

```bash
cd my-app && pnpm build
```

Expected: 통과.

- [ ] **Step 5: Commit**

```bash
git add my-app/src/widgets/retrospective-studio/model/useTopics.ts my-app/src/widgets/retrospective-studio/model/useTopicDigest.ts
git commit -m "feat: add useTopics and useTopicDigest widget-local hooks"
```

---

### Task 7: `TopicSidebar` 컴포넌트

**Files:**
- Create: `my-app/src/widgets/retrospective-studio/ui/TopicSidebar.tsx`

**Interfaces:**
- Consumes: `useTopics()`(Task 6), `Topic`(Task 2), `ConfirmModal`(`@/shared/ui/confirm-modal/ConfirmModal`), `TextField`(`@/shared/ui/text-field/TextField`), `EmptyState`(`@/shared/ui/empty-state/EmptyState`), `useTranslation`, `ApiError`(`@/shared/api`)
- Produces: `TopicSidebar({ selectedId, onSelect, requireLoginInDemo })` — Task 9(`TopicsPane`)가 소비한다.

- [ ] **Step 1: 컴포넌트 작성**

```tsx
import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { useTranslation } from "@/shared/lib/i18n";
import { ApiError } from "@/shared/api";
import { ConfirmModal } from "@/shared/ui/confirm-modal/ConfirmModal";
import { TextField } from "@/shared/ui/text-field/TextField";
import { EmptyState } from "@/shared/ui/empty-state/EmptyState";
import { useTopics } from "../model/useTopics";
import type { Topic } from "@/entities/topic/model/types";

export interface TopicSidebarProps {
  selectedId: string | null;
  onSelect: (id: string) => void;
  requireLoginInDemo: () => boolean;
}

export function TopicSidebar({
  selectedId,
  onSelect,
  requireLoginInDemo,
}: TopicSidebarProps) {
  const { t } = useTranslation();
  const { topics, loading, error, create, remove } = useTopics();

  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Topic | null>(null);

  const openCreate = () => {
    if (requireLoginInDemo()) return;
    setName("");
    setDescription("");
    setFormError(null);
    setCreating(true);
  };

  const submitCreate = async () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    try {
      const topic = await create(trimmed, description.trim());
      setCreating(false);
      onSelect(topic.id);
    } catch (e) {
      if (e instanceof ApiError && e.code === "TOPIC_NAME_DUPLICATED") {
        setFormError(t("topic.sidebar.nameDuplicated"));
      } else if (e instanceof ApiError && e.code === "TOPIC_LIMIT_REACHED") {
        const limit = (e.details[0] as unknown as { limit?: number } | undefined)
          ?.limit;
        setFormError(t("topic.sidebar.limitReached", { limit: limit ?? "" }));
      } else {
        setFormError(t("topic.generate.failed"));
      }
    }
  };

  const confirmDelete = async () => {
    const target = deleteTarget;
    if (!target) return;
    setDeleteTarget(null);
    await remove(target.id);
  };

  return (
    <aside className="topic-sidebar">
      <div className="topic-sidebar-head">
        <button type="button" className="btn btn-primary" onClick={openCreate}>
          <Plus size={14} /> {t("topic.sidebar.newTopic")}
        </button>
      </div>

      {error ? (
        <EmptyState message={t("topic.sidebar.listError")} minHeight={120} />
      ) : loading && topics.length === 0 ? (
        <EmptyState message={t("topic.sidebar.listLoading")} minHeight={120} />
      ) : topics.length === 0 ? (
        <EmptyState message={t("topic.sidebar.emptyTitle")} minHeight={120} />
      ) : (
        <ul className="topic-sidebar-list">
          {topics.map((topic) => (
            <li key={topic.id}>
              <button
                type="button"
                className="topic-card"
                data-active={selectedId === topic.id ? "true" : undefined}
                onClick={() => onSelect(topic.id)}
              >
                <span className="topic-card-name">{topic.name}</span>
                {topic.description ? (
                  <span className="topic-card-desc">{topic.description}</span>
                ) : null}
              </button>
              <button
                type="button"
                className="topic-card-delete"
                aria-label={t("topic.sidebar.deleteTitle")}
                onClick={() => {
                  if (requireLoginInDemo()) return;
                  setDeleteTarget(topic);
                }}
              >
                <Trash2 size={13} />
              </button>
            </li>
          ))}
        </ul>
      )}

      {creating ? (
        <ConfirmModal
          open
          title={t("topic.sidebar.newTopic")}
          message={
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <TextField
                autoFocus
                value={name}
                placeholder={t("topic.sidebar.namePlaceholder")}
                onChange={(e) => setName(e.target.value)}
                error={formError ?? undefined}
              />
              <TextField
                value={description}
                placeholder={t("topic.sidebar.descPlaceholder")}
                onChange={(e) => setDescription(e.target.value)}
              />
            </div>
          }
          confirmLabel={t("common.confirm")}
          cancelLabel={t("common.cancel")}
          onConfirm={() => void submitCreate()}
          onCancel={() => setCreating(false)}
        />
      ) : null}

      {deleteTarget ? (
        <ConfirmModal
          open
          tone="danger"
          title={t("topic.sidebar.deleteTitle")}
          message={
            <span style={{ whiteSpace: "pre-line" }}>
              {t("topic.sidebar.deleteMessage")}
            </span>
          }
          confirmLabel={t("common.delete")}
          cancelLabel={t("common.cancel")}
          onConfirm={() => void confirmDelete()}
          onCancel={() => setDeleteTarget(null)}
        />
      ) : null}
    </aside>
  );
}
```

- [ ] **Step 2: 빌드 확인**

```bash
cd my-app && pnpm build
```

Expected: 통과. (`TopicSidebar`는 아직 아무 곳에서도 렌더링되지 않으므로 未사용 export 경고만 없다면 OK — `tsc`는 export된 미사용 컴포넌트를 에러로 잡지 않는다.)

- [ ] **Step 3: Commit**

```bash
git add my-app/src/widgets/retrospective-studio/ui/TopicSidebar.tsx
git commit -m "feat: add TopicSidebar component"
```

---

### Task 8: `TopicDigestPane` 컴포넌트

**Files:**
- Create: `my-app/src/widgets/retrospective-studio/ui/TopicDigestPane.tsx`

**Interfaces:**
- Consumes: `useTopicDigest(topicId)`(Task 6), `RichEditor`(`@/shared/ui/rich-editor/ui/RichEditor`, lazy), `EditorErrorBoundary`(`@/shared/ui/rich-editor`), `EmptyState`, `useTranslation`, `formatFullDate`/`fromDateKey`(`@/shared/lib/date`, watermark 날짜 표시용)
- Produces: `TopicDigestPane({ topicId, requireLoginInDemo })` — Task 9가 소비한다.

- [ ] **Step 1: 컴포넌트 작성**

```tsx
import { lazy, Suspense } from "react";
import { Sparkles } from "lucide-react";
import { useTranslation } from "@/shared/lib/i18n";
import { EmptyState } from "@/shared/ui/empty-state/EmptyState";
import { EditorErrorBoundary } from "@/shared/ui/rich-editor";
import { formatFullDate, fromDateKey } from "@/shared/lib/date";
import { useTopicDigest } from "../model/useTopicDigest";

const RichEditor = lazy(() => import("@/shared/ui/rich-editor/ui/RichEditor"));

export interface TopicDigestPaneProps {
  topicId: string | null;
  requireLoginInDemo: () => boolean;
}

export function TopicDigestPane({
  topicId,
  requireLoginInDemo,
}: TopicDigestPaneProps) {
  const { t } = useTranslation();
  const { digest, loading, loadError, generating, generateError, generate } =
    useTopicDigest(topicId);

  if (!topicId) {
    return (
      <section className="topic-pane">
        <EmptyState message={t("topic.pane.noSelection")} minHeight={220} />
      </section>
    );
  }

  const handleGenerate = () => {
    if (requireLoginInDemo()) return;
    generate();
  };

  return (
    <section className="topic-pane">
      <div className="topic-pane-head">
        <button
          type="button"
          className="btn btn-primary"
          disabled={generating}
          onClick={handleGenerate}
        >
          <Sparkles size={14} />
          {generating
            ? t("topic.sidebar.generateInProgress")
            : t("topic.sidebar.generateButton")}
        </button>
        {digest?.watermarkDateKey ? (
          <span className="topic-pane-meta">
            {t("topic.pane.watermark", {
              date: formatFullDate(fromDateKey(digest.watermarkDateKey)),
            })}
          </span>
        ) : null}
      </div>

      {generateError ? (
        <div className="topic-pane-error">{t("topic.generate.failed")}</div>
      ) : null}

      {loadError ? (
        <EmptyState message={t("topic.pane.loadError")} minHeight={220} />
      ) : loading ? (
        <EmptyState message={t("topic.pane.loading")} minHeight={220} />
      ) : !digest || !digest.content ? (
        <EmptyState
          message={`${t("topic.pane.emptyTitle")}\n${t("topic.pane.emptyDesc")}`}
          minHeight={220}
        />
      ) : (
        <EditorErrorBoundary
          fallback={(error) => (
            <div className="topic-pane-error">{error.message}</div>
          )}
        >
          <Suspense fallback={<EmptyState message={t("topic.pane.loading")} minHeight={220} />}>
            <RichEditor value={digest.content} editable={false} />
          </Suspense>
        </EditorErrorBoundary>
      )}
    </section>
  );
}
```

- [ ] **Step 2: 빌드 확인**

```bash
cd my-app && pnpm build
```

Expected: 통과.

- [ ] **Step 3: Commit**

```bash
git add my-app/src/widgets/retrospective-studio/ui/TopicDigestPane.tsx
git commit -m "feat: add TopicDigestPane component"
```

---

### Task 9: `TopicsPane` 컴포넌트 (조합)

**Files:**
- Create: `my-app/src/widgets/retrospective-studio/ui/TopicsPane.tsx`

**Interfaces:**
- Consumes: `RetroTabBar`(Task 5), `TopicSidebar`(Task 7), `TopicDigestPane`(Task 8)
- Produces: `TopicsPane({ retroFilter, setRetroFilter, requireLoginInDemo })` — Task 10(`RetrospectiveStudio`)이 소비한다.

- [ ] **Step 1: 컴포넌트 작성**

```tsx
import { useState } from "react";
import { RetroTabBar } from "./RetroTabBar";
import { TopicSidebar } from "./TopicSidebar";
import { TopicDigestPane } from "./TopicDigestPane";
import type { RetroTab } from "../model/constants";

export interface TopicsPaneProps {
  retroFilter: RetroTab;
  setRetroFilter: (tab: RetroTab) => void;
  requireLoginInDemo: () => boolean;
}

/** "주제" 탭 최상위 화면 — 탭 바 + 좌(주제 목록) / 우(정리 문서) 분할 뷰. */
export function TopicsPane({
  retroFilter,
  setRetroFilter,
  requireLoginInDemo,
}: TopicsPaneProps) {
  const [selectedId, setSelectedId] = useState<string | null>(null);

  return (
    <div className="retro-gallery">
      <div className="retro-gallery-header">
        <RetroTabBar retroFilter={retroFilter} setRetroFilter={setRetroFilter} />
      </div>
      <div className="topic-split">
        <TopicSidebar
          selectedId={selectedId}
          onSelect={setSelectedId}
          requireLoginInDemo={requireLoginInDemo}
        />
        <TopicDigestPane topicId={selectedId} requireLoginInDemo={requireLoginInDemo} />
      </div>
    </div>
  );
}
```

`className="retro-gallery"`/`"retro-gallery-header"`는 기존 `retro.css`의 카드 그리드 배경/패딩을 그대로 물려받기 위함(새 배경 스타일을 따로 정의하지 않는다) — Task 10에서 실제 화면으로 확인하며 어긋나면 `topic-studio.css`에서 override한다.

- [ ] **Step 2: 빌드 확인**

```bash
cd my-app && pnpm build
```

Expected: 통과.

- [ ] **Step 3: Commit**

```bash
git add my-app/src/widgets/retrospective-studio/ui/TopicsPane.tsx
git commit -m "feat: add TopicsPane composing topic sidebar and digest view"
```

---

### Task 10: `RetrospectiveStudio` 배선 + CSS

**Files:**
- Modify: `my-app/src/widgets/retrospective-studio/ui/RetrospectiveStudio.tsx`
- Create: `my-app/src/app/styles/widgets/topic-studio.css`
- Modify: `my-app/src/app/styles/index.css`

**Interfaces:**
- Consumes: `TopicsPane`(Task 9), 기존 `requireLoginInDemo`(파일 내 이미 정의됨)
- Produces: 사용자가 "주제" 탭을 클릭하면 실제로 `TopicsPane`이 보이는 완결된 기능.

- [ ] **Step 1: 최상위 렌더 분기 추가**

`RetrospectiveStudio.tsx` import 목록에 추가:

```ts
import { TopicsPane } from "./TopicsPane";
```

기존 최상위 return 블록(파일 끝부분 `return (` 안, `<div className="page retro-page">` 바로 아래)의 조건:

```tsx
      {view === "editor" && active ? (
        <RetroEditor
          key={active.id}
          entry={active}
          completedTodos={completedTodos}
          githubConnectedAs={githubConnectedAs}
          isGithubConnected={isGithubConnected}
          hasVerifiedEmails={hasVerifiedEmails}
          pushTargetRepositoryId={pushTargetRepositoryId}
          onUpdate={(patch) => updateEntry(active.id, patch)}
          onSave={handleSave}
          onRevertSummary={handleRevertSummary}
          onBack={() => {
            setView("gallery");
            onRetroNavigate?.({});
          }}
        />
      ) : (
        <RetroGallery
          filterState={filterState}
          activeId={selectedId}
          onSelect={openEntry}
          onSummarize={handleSummarize}
          onNewDaily={handleNewDaily}
          showSyncBadge={can(state.settings.accountType, "github")}
          listEntries={listEntries}
          currentPage={currentPage}
          totalPages={totalPages}
          onPrevPage={goPrevPage}
          onNextPage={goNextPage}
          loading={
            isFolderView ? folderContents.loading : useServerList && entriesPage.loading
          }
          loadError={
            isFolderView ? folderContents.error : useServerList && entriesPage.error
          }
          debouncedSearch={debouncedSearch}
          isFolderView={isFolderView}
          folders={isFolderView ? folderContents.folders : []}
          breadcrumb={folderNav.breadcrumb}
          onEnterFolder={handleEnterFolder}
          onGoToRoot={folderNav.goToRoot}
          onGoToCrumb={folderNav.goToCrumb}
          onCreateFolder={() => setFolderPrompt({ mode: "create", name: "" })}
          onRenameFolder={(folder) =>
            setFolderPrompt({ mode: "rename", folder, name: folder.name })
          }
          onDeleteFolder={setFolderDeleteTarget}
          onDropEntryOnFolder={handleDropEntryOnFolder}
          onDropFolderOnFolder={handleDropFolderOnFolder}
        />
      )}
```

를 다음으로 교체 — `view === "editor"` 분기와 `RetroGallery` 분기 사이에 `filterState.retroFilter === "topics"` 분기만 끼워 넣고, 두 기존 분기의 내부 JSX(props)는 한 글자도 바꾸지 않는다:

```tsx
      {view === "editor" && active ? (
        <RetroEditor
          key={active.id}
          entry={active}
          completedTodos={completedTodos}
          githubConnectedAs={githubConnectedAs}
          isGithubConnected={isGithubConnected}
          hasVerifiedEmails={hasVerifiedEmails}
          pushTargetRepositoryId={pushTargetRepositoryId}
          onUpdate={(patch) => updateEntry(active.id, patch)}
          onSave={handleSave}
          onRevertSummary={handleRevertSummary}
          onBack={() => {
            setView("gallery");
            onRetroNavigate?.({});
          }}
        />
      ) : filterState.retroFilter === "topics" ? (
        <TopicsPane
          retroFilter={filterState.retroFilter}
          setRetroFilter={filterState.setRetroFilter}
          requireLoginInDemo={requireLoginInDemo}
        />
      ) : (
        <RetroGallery
          filterState={filterState}
          activeId={selectedId}
          onSelect={openEntry}
          onSummarize={handleSummarize}
          onNewDaily={handleNewDaily}
          showSyncBadge={can(state.settings.accountType, "github")}
          listEntries={listEntries}
          currentPage={currentPage}
          totalPages={totalPages}
          onPrevPage={goPrevPage}
          onNextPage={goNextPage}
          loading={
            isFolderView ? folderContents.loading : useServerList && entriesPage.loading
          }
          loadError={
            isFolderView ? folderContents.error : useServerList && entriesPage.error
          }
          debouncedSearch={debouncedSearch}
          isFolderView={isFolderView}
          folders={isFolderView ? folderContents.folders : []}
          breadcrumb={folderNav.breadcrumb}
          onEnterFolder={handleEnterFolder}
          onGoToRoot={folderNav.goToRoot}
          onGoToCrumb={folderNav.goToCrumb}
          onCreateFolder={() => setFolderPrompt({ mode: "create", name: "" })}
          onRenameFolder={(folder) =>
            setFolderPrompt({ mode: "rename", folder, name: folder.name })
          }
          onDeleteFolder={setFolderDeleteTarget}
          onDropEntryOnFolder={handleDropEntryOnFolder}
          onDropFolderOnFolder={handleDropFolderOnFolder}
        />
      )}
```

- [ ] **Step 2: entry-fetch 훅 가드 추가**

기존:

```ts
  const entriesPage = useRetroEntriesPage(
    filterState.retroFilter,
    debouncedSearch,
    filterState.dateRange,
    !isFolderView,
  );
  const folderContents = useFolderContents(
    state.folders,
    state.entries,
    folderNav.currentFolderId,
    filterState.retroFilter,
    isFolderView,
  );
```

를 다음으로 교체:

```ts
  const isTopicsView = filterState.retroFilter === "topics";
  const entriesPage = useRetroEntriesPage(
    filterState.retroFilter,
    debouncedSearch,
    filterState.dateRange,
    !isFolderView && !isTopicsView,
  );
  const folderContents = useFolderContents(
    state.folders,
    state.entries,
    folderNav.currentFolderId,
    filterState.retroFilter,
    isFolderView && !isTopicsView,
  );
```

- [ ] **Step 3: CSS 작성**

`my-app/src/app/styles/widgets/topic-studio.css`(신규):

```css
/* ---------- Topics tab: split view (sidebar + digest pane) ---------- */
.topic-split {
  display: flex;
  align-items: stretch;
  gap: 24px;
  height: max(480px, calc(100vh - 220px));
}

@media (max-width: 900px) {
  .topic-split {
    flex-direction: column;
    height: auto;
  }
}

/* ---------- Left: topic list ---------- */
.topic-sidebar {
  flex: 1 1 32%;
  min-width: 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: 10px;
  background: var(--color-tile-2);
  border-radius: var(--r-xl);
  border: 1px solid var(--color-divider-soft);
  padding: 16px;
  overflow-y: auto;
}

.topic-sidebar-head {
  display: flex;
  justify-content: flex-end;
}

.topic-sidebar-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.topic-sidebar-list li {
  position: relative;
  display: flex;
  align-items: stretch;
}

.topic-card {
  flex: 1;
  text-align: left;
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 10px 34px 10px 12px;
  border-radius: var(--r-sm);
  border: 1px solid transparent;
  background: transparent;
  cursor: pointer;
}

.topic-card:hover {
  background: var(--color-tile-3);
}

.topic-card[data-active="true"] {
  background: var(--color-tile-3);
  border-color: var(--color-divider-soft);
}

.topic-card-name {
  font-size: 16px;
  font-weight: 600;
  color: var(--color-ink);
}

.topic-card-desc {
  font-size: 12px;
  color: var(--color-body-muted);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.topic-card-delete {
  position: absolute;
  right: 6px;
  top: 50%;
  transform: translateY(-50%);
  border: none;
  background: transparent;
  color: var(--color-body-muted);
  cursor: pointer;
  padding: 6px;
  border-radius: var(--r-sm);
}

.topic-card-delete:hover {
  background: var(--color-tile-3);
  color: var(--color-ink);
}

/* ---------- Right: digest pane ---------- */
.topic-pane {
  flex: 1 1 68%;
  min-width: 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: 12px;
  background: var(--color-tile-2);
  border-radius: var(--r-xl);
  border: 1px solid var(--color-divider-soft);
  padding: 20px;
  overflow-y: auto;
}

.topic-pane-head {
  display: flex;
  align-items: center;
  gap: 12px;
}

.topic-pane-meta {
  font-size: 12px;
  color: var(--color-body-muted);
}

.topic-pane-error {
  padding: 10px 14px;
  border-radius: var(--r-sm);
  background: var(--color-tile-3);
  color: var(--color-warn, #d9a23a);
  font-size: 16px;
}
```

`my-app/src/app/styles/index.css`에서 기존:

```css
@import "./widgets/retro.css";
```

바로 다음 줄에 추가:

```css
@import "./widgets/topic-studio.css";
```

- [ ] **Step 4: 빌드 확인**

```bash
cd my-app && pnpm build
```

Expected: 통과.

- [ ] **Step 5: 수동 확인 (dev 서버)**

```bash
cd my-app && pnpm dev
```

1. 로그인 후 회고 스튜디오 진입 → "주제" 탭 클릭 → 좌측 빈 목록 + "새 주제" 버튼이 보이는지 확인.
2. "새 주제" 클릭 → 이름 입력(예: "ARCHIVE 프로젝트") → 확인 → 목록에 카드가 생기고 자동 선택되는지 확인.
3. 우측에서 "정리하기" 클릭 → 버튼이 "정리 중..."으로 바뀌고 비활성화되는지, 완료 후(백엔드가 실제로 떠 있어야 함) 마크다운 본문이 표시되는지 확인.
4. 다른 탭(일간 등)으로 전환했다가 "주제" 탭으로 돌아와도 정상 동작하는지 확인.
5. 삭제 버튼(휴지통 아이콘) 클릭 → 확인 모달 → 삭제 후 목록에서 사라지는지 확인.
6. `?demo=true`로 접속해 "주제" 탭 진입 → "새 주제"/"정리하기"/삭제 클릭 시 로그인 유도 토스트가 뜨고 실제 요청이 나가지 않는지 확인(Network 탭에서 `/topics` 요청 없어야 함).

- [ ] **Step 6: Commit**

```bash
git add my-app/src/widgets/retrospective-studio/ui/RetrospectiveStudio.tsx my-app/src/app/styles/widgets/topic-studio.css my-app/src/app/styles/index.css
git commit -m "feat: wire up Topics tab in RetrospectiveStudio"
```

---

### Task 11: 최종 회귀 확인 + 문서 업데이트

**Files:**
- Modify: `my-app/CLAUDE.md`

**Interfaces:**
- Consumes: 없음
- Produces: 없음 (문서 + 검증 태스크)

- [ ] **Step 1: 전체 빌드 재확인**

```bash
cd my-app && pnpm build
```

Expected: 에러 없이 통과.

- [ ] **Step 2: 기존 탭 회귀 확인 (dev 서버)**

`pnpm dev`로 띄운 채 일간/주간/월간/연간/전체 탭 각각에서: 목록 로딩, 카드 클릭 → 편집기 진입, 뒤로가기 → 갤러리 복귀, 검색, 폴더 생성/이동이 Task 5 이전과 동일하게 동작하는지 확인(탭 바 추출이 회귀를 만들지 않았음을 확인하는 단계).

- [ ] **Step 3: `CLAUDE.md` §8에 계약 간극 1건 추가**

`my-app/CLAUDE.md`의 "## 8. 알려진 계약 간극" 섹션 마지막 항목(`5. **회고 1일 1개 제약**...`) 다음에 추가:

```markdown
6. **`TOPIC_LIMIT_REACHED`의 `details` 비표준 shape**: 다른 에러는 `details`가 `{field, message}[]`이지만, 이 코드만 `[{"limit": number}]`를 그대로 내려준다(백엔드 `TopicLimitReachedException` 구현 그대로). FE에서 `as unknown as {limit?: number}` 캐스팅으로 처리한다(`shared/api/topics.ts` 관례 참고용, 실제 매핑은 `TopicSidebar.tsx`에 있음).
```

- [ ] **Step 4: Commit**

```bash
git add my-app/CLAUDE.md
git commit -m "docs: note TOPIC_LIMIT_REACHED details shape gap in CLAUDE.md"
```

---

## Self-Review Notes

- **스펙 커버리지**: 스펙 1~13절 모두 대응 태스크 있음 — 1절(계약)→Task1, 2~4절(타입/클라이언트/훅)→Task2,6, 5절(AppProvider)→Task4, 6절(UI통합)→Task5,7,8,9,10, 7절(에러처리)→Task7,8 내 분기, 8절(스코프 제외)→계획에 포함 안 함(의도적), 9절(api.yaml 선행)→Task1, 10절(i18n)→Task3, 11절(CSS)→Task10, 12절(파일목록)→전 태스크 매핑, 13절(안전성 근거)→Task5/8/9 설계 근거로 반영.
- **타입 일관성 확인**: `Topic`/`TopicDigest`/`DigestStatus`(Task2) → `shared/api/topics.ts`(Task2) → `ArchiveAppContextValue`(Task4) → `useTopics`/`useTopicDigest`(Task6) → `TopicSidebar`/`TopicDigestPane`(Task7,8) 전 구간에서 동일 필드명(`topicId`, `watermarkDateKey`, `status`) 사용 확인.
- **플레이스홀더 없음 확인**: 전 태스크 코드 블록이 실제 완결 코드이며 "TODO"/"similar to Task N" 패턴 없음.
