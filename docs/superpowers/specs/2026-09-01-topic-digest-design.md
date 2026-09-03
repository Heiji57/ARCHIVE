# 주제별 자동 정리 문서(Topic Digest) — FE 설계

- 작성일: 2026-09-01
- 대상: `my-app` (React + TS, FSD 아키텍처)
- 백엔드 근거: `/home/minsu/PycharmProjects/ARCHIVE-BE`(`src/app/topic/**`, `src/app/worker/tasks/generate_digest.py`) — **코드 기준**. `api.yaml`엔 아직 미반영(FE·BE 양쪽 모두).
- 범위: 회고 스튜디오에 "주제(Topics)" 탭 추가 — 주제 선언(CRUD) + 수동 "정리하기" + 읽기 전용 정리 문서 뷰. **매일 밤 자동 생성/토글은 이번 범위 제외**(백엔드 미구현, 아래 8절).

## 0. 핵심 변경 3가지

1. **신규 FSD 슬라이스**: `entities/topic`(타입) + `shared/api/topics.ts`(API 클라이언트) + `widgets/retrospective-studio`에 주제 탭 UI 3개 컴포넌트 추가.
2. **글로벌 상태(reducer/AppState) 확장 없음** — pendingSummary처럼 앱 전역에 "생성 중" 상태를 두지 않는다. digest 상태는 서버가 진실 공급원이고(GET으로 항상 재확인 가능), 이번 범위는 페이지 이탈 시에도 이어지는 플로팅 진행 위젯을 요구하지 않으므로, 생성 중 폴링/SSE 수명주기를 위젯 로컬 훅(`useTopicDigest`) 안에 가둔다. AppProvider엔 `shared/api/topics.ts`를 감싸는 얇은 pass-through 메서드 5개만 추가한다(기존 `loadEntriesPage`/`loadFolderContents` 패턴과 동일).
3. **탭 바(`RETRO_FILTERS` 렌더링)를 `RetroGallery`에서 `RetroTabBar`로 추출**해 재사용한다 — "주제" 탭 선택 시 `RetrospectiveStudio`가 `RetroGallery` 대신 새 `TopicsPane`을 렌더링하는데, 이때도 동일한 탭 바가 보여야 하기 때문. `RetroGallery`의 다른 로직(검색/폴더/AI요약 메뉴 등, 모두 entry 전용)은 건드리지 않는다.

## 1. 확정된 백엔드 계약 (코드 기준, api.yaml 미반영)

| 엔드포인트 | 동작 |
|---|---|
| `POST /topics` | 201. `{name(1~100자), description(0~500자, 기본 "")}` → `TopicResponse{id,name,description,created_at,updated_at}` |
| `GET /topics` | 200, `TopicResponse[]` |
| `DELETE /topics/{id}` | 204 |
| `POST /topics/{id}/digest/generate` | **202**, `TopicDigestResponse` 반환 + Celery(`ai_tasks` 큐) enqueue |
| `GET /topics/{id}/digest` | 200, `TopicDigestResponse`. **주제당 digest는 1개뿐**(재생성해도 같은 id, `status`만 `pending`으로 리셋). 아직 한 번도 생성 안 했으면 **404 `TOPIC_DIGEST_NOT_FOUND`** |
| `GET /topics/{id}/digest/stream` | SSE, 단일 이벤트 `{status:"completed"\|"failed"\|"timeout"}` — 기존 `/summaries/{id}/stream`과 완전히 동일한 shape |

`TopicDigestResponse`: `{id, topic_id, status(pending/in_progress/completed/failed), content(string|null), watermark_date_key(string|null, YYYY-MM-DD), created_at, updated_at}`

에러 코드 + HTTP status(`handler.py`의 `_STATUS_MAP` 확인):

| code | status | 의미 |
|---|---|---|
| `TOPIC_NOT_FOUND` | 404 | 주제 삭제됨/없음 |
| `TOPIC_NAME_DUPLICATED` | 409 | 이름 중복 |
| `TOPIC_LIMIT_REACHED` | 409 | 사용자당 최대 20개(서버 설정값). **`details`가 `{field,message}` 표준 shape이 아니라 `[{"limit": 20}]` 특수 shape** — FE `ApiErrorDetail` 타입과 안 맞으므로 캐스팅 필요(2절) |
| `TOPIC_DIGEST_NOT_FOUND` | 404 | 아직 정리 이력 없음 — **에러 아님, 빈 상태로 처리** |
| `TOPIC_DIGEST_ALREADY_IN_PROGRESS` | 409 | 이미 생성 중인데 재요청 |

**중요한 동작 특성(반드시 UI 문구에 반영)**: digest는 `watermark_date_key` **이후** 새로 작성된 회고/할 일만 벡터 검색해 AI에 넘기고, **이전 digest 본문을 프롬프트에 포함하지 않는다** — 재생성하면 이전에 이미 반영됐던 옛 구간 서술이 이번 결과에서 빠질 수 있다(완전 누적이 아님). 즉 "정리하기"는 "새로 쌓인 내용을 반영해 문서를 갱신"이지 "누적 보강"이 아니다. `watermark_date_key`를 "OO일까지 반영됨" 메타로 노출해 사용자가 이 특성을 인지하게 한다.

## 2. `entities/topic/model/types.ts` (신규)

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

`entities/summary`처럼 `PendingXxx` 타입은 두지 않는다(0-2절 근거).

## 3. `shared/api/topics.ts` (신규)

`summaries.ts`와 동일한 구조로 작성하되, SSE는 자체 구현 대신 `client.ts`의 기존 범용 `streamSSE(path, onData, onClose)`(notifications.ts가 이미 사용 중)를 재사용한다 — `streamSummary`가 자체 fetch/reader 파싱을 중복 구현한 건 `streamSSE`가 생기기 전 레거시로 보이므로 새 코드에서 반복하지 않는다.

```ts
export async function apiListTopics(): Promise<Topic[]>
export async function apiCreateTopic(name: string, description: string): Promise<Topic>
export async function apiDeleteTopic(id: string): Promise<void>
export async function apiGenerateDigest(topicId: string): Promise<TopicDigest>   // POST .../digest/generate
export async function apiGetDigest(topicId: string): Promise<TopicDigest | null> // 404(TOPIC_DIGEST_NOT_FOUND) → null
export function streamTopicDigest(
  topicId: string,
  handlers: { onCompleted(): void; onFailed(): void; onTimeout(): void; onError(): void },
): () => void   // streamSSE(`/topics/${topicId}/digest/stream`, ...) 래핑
```

snake_case → camelCase 변환은 `summaries.ts`처럼 이 파일 내부 `toTopic`/`toDigest` 매퍼로 직접 처리한다(공용 `mappers.ts`엔 추가하지 않음 — 기존 요약도 그렇게 함).

`TOPIC_LIMIT_REACHED`의 비표준 `details` 처리 예시:
```ts
const limit = (e.details[0] as unknown as { limit?: number } | undefined)?.limit;
```

## 4. `app/model/types.ts` / `AppProvider.tsx` — 얇은 pass-through 메서드 5개 추가

```ts
loadTopics: () => Promise<Topic[]>;
createTopic: (name: string, description: string) => Promise<Topic>;
deleteTopic: (id: string) => Promise<void>;
generateTopicDigest: (topicId: string) => Promise<TopicDigest>;
getTopicDigest: (topicId: string) => Promise<TopicDigest | null>;
```

각각 `shared/api/topics.ts` 호출을 그대로 감싼다. mock/데모 분기는 넣지 않는다 — `entities/topic`엔 대응하는 mock 데이터 생성기가 없고(할 일/엔트리와 달리 이 기능 자체가 실제 API 없이는 의미가 없음), 데모 게이팅은 위젯 레벨에서 기존 `requireLoginInDemo()` 패턴으로 호출 전에 막는다(`handleSummarize`와 동일 방식). **탭 자체는 데모에서도 보이고 진입 가능** — "+ 새 주제"/"정리하기"/삭제 등 액션 버튼을 누르는 시점에만 `requireLoginInDemo()`가 로그인 유도 토스트를 띄우고 요청을 막는다. GitHub 연동 UX(탭·카드는 보이되 액션 시에만 게이팅)와 동일한 결정이며, 이번 스펙에서 확정한다.

## 5. 위젯 로컬 훅 (신규, `widgets/retrospective-studio/model/`)

### `useTopics.ts`
목록 로드 + 생성 + 삭제. `useFolderContents.ts`처럼 `useArchiveApp()`의 pass-through 메서드만 호출하고 로컬 state(list/loading/error)를 관리한다. 페이지네이션 불필요(최대 20개).

### `useTopicDigest.ts`
선택된 `topicId` 하나에 대해 digest 조회 + 생성 수명주기를 관리한다.

- 입력: `topicId: string | null`
- `topicId` 변경 시 `getTopicDigest`로 재조회(로컬 state에만 저장, 전역 캐시 없음)
- `generate()` 호출 시: `generateTopicDigest` → 상태 `pending`/`in_progress`로 세팅 → **폴링(5초 간격) + SSE 이중 감시**(`startSummaryViaApi`의 검증된 패턴 그대로 이식: 폴링이 기본 신뢰 경로, SSE는 더 빠른 보조 신호, 6분 초과 시 타임아웃 처리) → 완료 시 `getTopicDigest` 재조회해 content 갱신
- 언마운트/`topicId` 변경 시 폴링 타이머·SSE 구독 정리. 페이지를 벗어났다가 돌아와도 서버가 진실 공급원이라 재조회만으로 정상 상태 복구(전역 상태 불필요했던 근거).

## 6. UI 통합

```
widgets/retrospective-studio/
  ui/RetroTabBar.tsx        (신규) — RETRO_FILTERS 순회 버튼만 담당(순수 표시용), RetroGallery에서 추출
  ui/RetroGallery.tsx       (수정) — 인라인 탭 블록(L308-321)을 <RetroTabBar/> 사용으로 교체, 그 외 변경 없음
  ui/TopicsPane.tsx         (신규) — <RetroTabBar/> + 좌우 분할(TopicSidebar | TopicDigestPane)
  ui/TopicSidebar.tsx       (신규) — 주제 카드 목록 + "+ 새 주제" 모달(ConfirmModal 재사용, TextField 2개) + 삭제(ConfirmModal danger, folderDeleteTarget 패턴)
  ui/TopicDigestPane.tsx    (신규) — 선택 주제의 digest를 RichEditor(editable={false})로 표시
  ui/RetrospectiveStudio.tsx (수정) — 최상위 분기 추가
  model/constants.ts        (수정) — RetroTab에 "topics" 추가, RETRO_FILTERS에 탭 추가
```

### 최상위 분기 (`RetrospectiveStudio.tsx`)
```
view === "editor" && active   → <RetroEditor .../>                (기존)
filterState.retroFilter === "topics" → <RetroTabBar/> + <TopicsPane/>  (신규)
그 외                          → <RetroGallery .../>                (기존, 내부에 RetroTabBar 포함)
```
탭 바는 오늘도 "gallery" 뷰에서만 보인다(editor 진입 시 사라지는 기존 동작 유지) — 이 규칙은 topics에도 동일 적용되므로 `view` state 변경이 불필요하다.

### `TopicDigestPane`에서 `RichEditor` 재사용
`shared/ui/rich-editor`의 `editable` prop은 이미 "AI 요약 표시 등" 읽기 전용 용도로 문서화돼 있으나 **현재 코드베이스에서 실사용 사례가 없다** — 이번이 첫 실사용이 된다. `<RichEditor value={digest?.content ?? ""} editable={false} />`로 마크다운을 그대로 렌더링(별도 markdown→html 변환 불필요, RichEditor 내부에서 처리).

### 상태 뱃지 재사용
"생성중"/"실패" 뱃지는 새 클래스를 만들지 않고 기존 `.retro-card-badges` + `retro.badge.generating` / `retro.badge.summaryFailed` i18n 키를 그대로 재사용한다(요약 카드와 시각적 일관성).

### `RetrospectiveStudio.tsx`의 entry-fetch 훅 가드
`retroFilter === "topics"`일 때 `useRetroEntriesPage`/`useFolderContents`에 `"topics"` 값이 그대로 `retroType` 쿼리로 흘러가면 `/entries/paginated`에 잘못된 값이 나간다 — 두 훅 호출의 `enabled` 인자에 `filterState.retroFilter !== "topics"` 조건을 추가해 topics 탭에서는 완전히 비활성화한다.

## 7. 에러 처리

| 코드 | UI 처리 |
|---|---|
| `TOPIC_LIMIT_REACHED` | 생성 모달에 `details[0].limit` 값을 넣은 안내 메시지(하드코딩 금지) |
| `TOPIC_NAME_DUPLICATED` | 생성 모달 인라인 에러 |
| `TOPIC_DIGEST_ALREADY_IN_PROGRESS` | '정리하기' 버튼 비활성 + 토스트 |
| `TOPIC_DIGEST_NOT_FOUND` | 에러 아님 — "아직 정리된 내용이 없어요" 빈 상태 |
| `TOPIC_NOT_FOUND` | 목록 새로고침(다른 탭/기기에서 이미 삭제된 경우) |

## 8. 스코프 제외 (확정)

- **매일 밤 자동 생성 + 온오프 토글**: 백엔드에 celery beat 항목·`UserSettings.auto_topic_digest` 필드·PUT 엔드포인트가 전혀 없음(직접 확인). 이번 FE 작업은 **수동 "정리하기" 버튼만** 구현한다. 자동화는 백엔드 작업이 별도로 선행된 뒤 후속 스펙으로 다룬다.
- **출처(원본 회고/할 일) 구조화 링크**: `TopicDigestResponse.content`는 마크다운 문자열 하나뿐이고 서버가 날짜별 구조화 출처를 내려주지 않는다. 클릭해서 원문으로 점프하는 기능은 이번 계약으로 불가능 — 만들지 않는다.
- **주제 이름/설명 수정(PATCH)**: 백엔드에 엔드포인트 자체가 없다(생성/조회/삭제만). 수정이 필요해지면 백엔드에 먼저 추가 요청.
- **digest 수동 편집(PATCH)**: 요약(`/summaries/{id}` PATCH)과 달리 digest는 편집 엔드포인트가 없다 — 읽기 전용으로만 표시.

## 9. 선행 작업 — `api.yaml` 반영

CLAUDE.md 절대규칙(§1,§2)에 따라 구현 착수 전에 FE `api.yaml`에 `/topics` 3개 경로 + `TopicResponse`/`TopicDigestResponse`/`CreateTopicRequest` 스키마 + `x-error-codes`를 위 1절 내용대로 추가하고 `pnpm gen:api`로 `schema.d.ts`를 생성한다. BE 저장소의 `api.yaml`도 비어 있으므로, 가능하면 BE 세션과 동기화하되 최소한 FE 저장소 내에서는 SST 규칙을 지킨다. 이 작업이 구현 계획의 0번째 작업이 된다.

## 10. i18n 키 (신규, `en/ko/ja/zh` 4개 로케일 동기화 필요)

`shared/lib/i18n/keys.ts`에 추가:
- `retro.filter.topics` (탭 라벨)
- `topic.sidebar.newTopic`, `topic.sidebar.namePlaceholder`, `topic.sidebar.descPlaceholder`
- `topic.sidebar.deleteTitle`, `topic.sidebar.deleteMessage`
- `topic.sidebar.limitReached`(`{limit}` 보간)
- `topic.sidebar.nameDuplicated`
- `topic.sidebar.generateButton`, `topic.sidebar.generateInProgress`
- `topic.pane.emptyTitle`, `topic.pane.emptyDesc`(아직 정리 안 됨)
- `topic.pane.noSelection`(주제 미선택)
- `topic.pane.watermark`(`{date}` 보간 — "OO일까지 반영됨")
- `topic.generate.failed`

기존 재사용(신규 키 아님): `retro.badge.generating`, `retro.badge.summaryFailed`, `common.confirm`, `common.cancel`, `common.delete`.

## 11. CSS

신규 `src/app/styles/widgets/topic-studio.css` 추가 + `src/app/styles/index.css`에 `@import "./widgets/topic-studio.css";` 한 줄 등록(기존 `retro.css`/`todo-board.css`와 동일 패턴). `.topic-sidebar*`, `.topic-card*`, `.topic-pane*`, `.topic-empty*` 클래스 신설. 기존 `retro.css`는 건드리지 않는다.

## 12. 파일 변경 목록 요약

| 구분 | 경로 |
|---|---|
| 선행(계약) | `api.yaml`(`/topics` 3경로 + 스키마), `pnpm gen:api` 재실행 |
| 신규 | `entities/topic/model/types.ts`, `shared/api/topics.ts` |
| 신규 | `widgets/retrospective-studio/model/useTopics.ts`, `useTopicDigest.ts` |
| 신규 | `widgets/retrospective-studio/ui/RetroTabBar.tsx`, `TopicsPane.tsx`, `TopicSidebar.tsx`, `TopicDigestPane.tsx` |
| 신규 | `app/styles/widgets/topic-studio.css` |
| 수정 | `widgets/retrospective-studio/model/constants.ts`(RetroTab, RETRO_FILTERS) |
| 수정 | `widgets/retrospective-studio/ui/RetroGallery.tsx`(탭 블록 → RetroTabBar 사용) |
| 수정 | `widgets/retrospective-studio/ui/RetrospectiveStudio.tsx`(최상위 분기, entry-fetch 훅 enabled 가드) |
| 수정 | `app/model/types.ts`(`ArchiveAppContextValue`에 5개 메서드), `app/providers/AppProvider.tsx`(구현) |
| 수정 | `shared/lib/i18n/keys.ts` + `locales/{en,ko,ja,zh}.ts` |
| 수정 | `app/styles/index.css`(import 등록) |
| 수정(문서) | `CLAUDE.md` §8에 `TOPIC_LIMIT_REACHED` details 비표준 shape 간극 1건 추가 권장 |

## 13. 사전 조사로 확인된 안전성 근거

- `RetroGallery`의 탭 바(L308-321)는 `RETRO_FILTERS`/`retroFilter`/`setRetroFilter`만 참조하는 순수 블록 — 추출해도 검색/폴더/AI요약 메뉴 등 나머지 로직과 결합이 없음.
- 탭 바는 오늘도 `view==="editor"`일 때 이미 사라지는 구조(`RetroGallery` 자체가 언마운트) — topics 분기 추가로 새 상태 전이를 만들 필요가 없음.
- `RichEditor`의 `editable={false}` 경로는 이미 구현·문서화돼 있고 컴포넌트 자체 수정 없이 그대로 소비 가능 — 미사용 상태였을 뿐 신규 구현이 아님.
- `client.ts`의 `streamSSE`는 이미 notifications.ts가 프로덕션에서 쓰고 있는 범용 구현 — topics SSE에 재사용해도 새 위험이 없음.
- `ArchiveAppContextValue`에 pass-through 메서드를 추가하는 패턴(`loadEntriesPage`, `loadFolderContents`)이 이미 두 군데 이상 있어 5개 추가가 구조적으로 이례적이지 않음.
