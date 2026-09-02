# CLAUDE.md — ARCHIVE 프론트엔드 (API 연동 가이드)

> 이 파일은 Claude Code가 **이 저장소(`my-app`, 프론트엔드)에서 백엔드 API를 연동**할 때 따라야 하는 운영 규칙이다.
> 상세 레퍼런스는 다음 두 문서를 **단일 진실 공급원(SST)** 으로 삼는다. 추측하지 말고 항상 먼저 읽어라.
>
> - **`api.yaml`** — 백엔드 API 계약 (OpenAPI 3.0.3). 엔드포인트·스키마·에러코드·인증의 SST.
> - **`develop.md`** — 프론트엔드 컨벤션 + DB/Redis 전략 레퍼런스.

---

## 0. 절대 규칙 (가드레일)

1. **`api.yaml`에 없는 엔드포인트/필드를 상상해서 만들지 않는다.** 필요하면 멈추고 사용자에게 "백엔드(api.yaml)에 추가가 필요하다"고 보고한다.
2. **`api.yaml`이 SST다.** FE 타입·클라이언트가 api.yaml과 다르면 api.yaml이 옳다. 코드를 api.yaml에 맞춘다.
3. **패키지 매니저는 pnpm만 사용** (npm/yarn 금지). 게이트는 `pnpm build` (`tsc -b && vite build`).
4. **런타임 외부 라이브러리 무단 추가 금지** (상태관리/라우팅/UI/HTTP 클라이언트). `fetch`는 표준 API를 직접 쓴다. (빌드타임 전용 devDependency는 예외 — 4장 참고)
5. FSD 레이어 규칙 준수: `app → pages → widgets → entities → shared`. API 클라이언트는 **`shared/api`** 에 둔다.
6. 작업 후 반드시 `pnpm build`로 검증한다.

---

## 1. 백엔드 개요 (api.yaml 요약)

- **Base URL**: `http://localhost:8000/api/v1` (로컬), 운영은 placeholder.
- **태그(도메인)**: `auth`, `todos`, `entries`, `summaries`, `notifications`, `settings`.
- **인증**:
  - Access Token: `Authorization: Bearer <JWT>` 헤더 (만료 **15분**).
  - Refresh Token: `refresh_token` **HttpOnly Cookie** (만료 7일, `Secure`, `SameSite=Lax`).
- **AI 요약은 비동기**: `POST /summaries/generate` → `202 Accepted`만 반환. 완료는 SSE로 통지.

---

## 2. 공통 응답/에러 규약

모든 응답은 아래 래퍼를 사용한다.

```jsonc
// 성공
{ "status": "success" | "accepted", "code": "OK", "data": { ... } }
// 에러
{ "status": "error", "code": "<DOMAIN_ERROR_CODE>", "data": null, "details": [ { "field": "...", "message": "..." } ] }
```

- 클라이언트 래퍼는 `data`를 **언래핑해서 반환**하고, `status === "error"`면 `code`를 담은 에러를 throw 한다.
- 에러 분기는 HTTP status가 아니라 **`code` 문자열**로 한다. (api.yaml 각 경로의 `x-error-codes` 참고)
  - 예: `AUTH_INVALID_CREDENTIALS`, `USER_EMAIL_DUPLICATED`, `TODO_NOT_FOUND`, `JOURNAL_ENTRY_ALREADY_EXISTS`, `RETRO_SUMMARY_IN_PROGRESS`, `AUTH_TOKEN_EXPIRED`, `VALIDATION_ERROR`.
- 에러 `code` → 사용자 메시지는 **i18n 키로 매핑**한다 (하드코딩 금지). 기존 `auth.*.error.*` 패턴 참고.

---

## 3. 인증 흐름 구현 규칙

- Access token은 **메모리/앱 상태**에 보관 (localStorage 저장 지양 — XSS 노출 최소화). Refresh token은 쿠키이므로 JS가 접근하지 않는다.
- 모든 인증 필요 요청에 `Authorization: Bearer` 자동 첨부. **쿠키 전송을 위해 `credentials: "include"`** 필수.
- **401 처리**: 응답 `code`가 `AUTH_TOKEN_EXPIRED`면 → `POST /auth/token/refresh` 1회 시도 → 성공 시 원요청 재시도, 실패 시 로그아웃 처리. (refresh는 rotation 방식 — 동시요청 중복 refresh 방지 락 필요)
- OAuth는 `GET /auth/oauth/{provider}/authorize`를 **팝업으로 열고**, 콜백 HTML이 `window.opener.postMessage({ type: "oauth_success" | "oauth_error", ... })`로 결과를 보낸다. 부모 창에서 `message` 이벤트로 수신.

---

## 4. API 클라이언트 구조 (`src/shared/api/`)

### 타입 생성 — openapi-typescript (devDependency, 런타임 0바이트)

```bash
pnpm add -D openapi-typescript
# package.json scripts에 추가:
#   "gen:api": "openapi-typescript api.yaml -o src/shared/api/schema.d.ts"
pnpm gen:api
```

- `schema.d.ts`는 **생성물** — 직접 수정 금지, api.yaml 변경 시 `pnpm gen:api`로 재생성.
- 재생성 후 컴파일 에러가 나면 그것이 **계약 드리프트 신호**다 → FE 코드를 맞춘다.

### 파일 배치 (태그별 모듈)

```
src/shared/api/
├── schema.d.ts        # openapi-typescript 생성물 (수정 금지)
├── client.ts          # fetch 래퍼: baseURL, 인증 헤더, 응답 언래핑, 401 refresh, 에러 throw
├── errors.ts          # ApiError(code) + code→i18n 키 매핑
├── mappers.ts         # snake_case(API) ↔ camelCase(FE 도메인) 변환
├── auth.ts            # /auth/*
├── todos.ts           # /todos/*
├── entries.ts         # /entries/*
├── summaries.ts       # /summaries/* (+ SSE)
├── notifications.ts   # /notifications/* (+ SSE)
├── settings.ts        # /settings
└── index.ts           # barrel
```

- 각 모듈은 `schema.d.ts`의 타입을 import해 함수형 API로 노출한다.
- 위젯/프로바이더는 `@/shared/api` 배럴로만 접근한다 (FSD).

---

## 5. 네이밍/스키마 변환 규칙

- **API는 `snake_case`, FE 도메인 타입은 `camelCase`.** 변환은 **`shared/api/mappers.ts` 경계에서만** 수행하고, FE 내부(`entities/*`, `widgets/*`)는 기존 camelCase 타입을 그대로 쓴다.

| API (snake) | FE (camel) |
|---|---|
| `date_key` | `dateKey` |
| `retro_type` | `retroType` |
| `is_read` | `read` |
| `created_at` / `updated_at` / `completed_at` | `createdAt` / `updatedAt` / `completedAt` |
| `display_name` | `displayName` |
| `password_confirm` | (요청 전용) |

- API 응답엔 `user_id`가 포함되지만 FE 도메인 타입엔 보통 불필요 → 매핑 시 제거 가능.

---

## 6. SSE (실시간 통지)

- **요약 완료**: `GET /summaries/{id}/stream` — `EventSource`로 단일 이벤트 수신 후 종료. payload `{ status: "completed"|"failed"|"timeout"|"error", summary_id }`. 5분 타임아웃.
- **알림 푸시**: `GET /notifications/stream` — Redis pub/sub 기반, 새 알림 실시간 수신. 5분 타임아웃 → 재연결 로직 필요.
- 흐름: `POST /summaries/generate`(202) → 반환된 `summary_id`로 stream 구독 → `completed` 수신 시 `GET /summaries/{id}` 또는 `/entries`를 재조회해 UI 갱신.

---

## 7. Mock → 실제 API 전환 매핑

현재 mock 계층(아래)을 `shared/api` 호출로 교체한다. `AppProvider`의 콜백 구현부를 API 호출로 바꾸는 방식.

| 현재 mock | 교체 대상 | 비고 |
|---|---|---|
| `app/lib/mockAuth.ts` | `shared/api/auth.ts` | 로그인/회원가입/인증코드/OAuth/프로필 |
| `app/lib/authStorage.ts` | (삭제) | 유저 DB는 서버로 이전 |
| `app/lib/storage.ts` (localStorage) | `shared/api/{todos,entries,settings}.ts` | 서버 영속화. UI 전용 상태(예: 진행 중 요약 표시)는 로컬 유지 가능 |
| `app/lib/summaryFactory.ts` + `scheduleSummary.ts` | `shared/api/summaries.ts` + SSE | 생성은 서버 비동기. 자동 스케줄은 서버 Cron으로 이전 |

> 전환은 한 번에 하지 말고 **도메인 단위(auth → settings → todos → entries → summaries → notifications)** 로 진행하고, 각 단계마다 `pnpm build`.

---

## 8. 알려진 계약 간극 (api.yaml ↔ 현재 FE)

연동 중 아래 불일치를 만나면 **api.yaml을 기준**으로 매핑하되, 해소가 안 되면 멈추고 사용자/백엔드와 협의한다. (임의로 엔드포인트를 만들지 않는다.)

1. **GitHub 연동 엔드포인트가 api.yaml에 없음.** 현재 FE의 GitHub 연결/커밋(`settings-studio`, `retrospective-studio`의 `DEMO_GITHUB`/`MOCK_COMMITS`)에 대응하는 API가 계약에 정의돼 있지 않다 → **백엔드에 추가 요청 필요**. 그 전까지 GitHub은 mock 유지.
2. **알림 enum 불일치**: api `type`=`[info,success,warning,error]`, `category`=`[sync,summary,system]` vs FE `type`=`[success,info,warning]`, `category`=`[general,summary,sync,system]`. 매핑 레이어에서 흡수하고, 누락 값은 협의.
3. **요약 content 구조 차이**: api `SummaryResponse.content`는 `{achievements, challenges, learnings, next_focus}` 구조화 객체. 현재 FE는 회고를 **마크다운 문자열**로 다룸 → 매핑 시 구조화 객체를 마크다운으로 합성하거나, 회고 엔트리(`/entries`)와의 관계를 백엔드와 확정.
4. **요약 주기 enum**: api `SummaryType`=`[weekly, monthly, annual]` (주의: `annual`) vs FE `SummaryKind`=`[weekly, monthly, yearly]`. 매핑 필요.
5. **회고 1일 1개 제약**: `journal_entries`는 `UNIQUE(user_id, date_key)` → 같은 날 daily 중복 생성 시 `409 JOURNAL_ENTRY_ALREADY_EXISTS`. FE의 `createDailyEntry` 중복 처리와 정합 확인.
6. **`TOPIC_LIMIT_REACHED`의 `details` 비표준 shape**: 다른 에러는 `details`가 `{field, message}[]`이지만, 이 코드만 `[{"limit": number}]`를 그대로 내려준다(백엔드 `TopicLimitReachedException` 구현 그대로). FE에서 `as unknown as {limit?: number}` 캐스팅으로 처리한다(`shared/api/topics.ts` 관례 참고용, 실제 매핑은 `TopicSidebar.tsx`에 있음).

---

## 9. 변경 프로토콜 (계약 드리프트 방지)

- 백엔드가 `api.yaml`을 변경하면: FE에서 `pnpm gen:api` 재실행 → 컴파일 에러 지점 수정 → `pnpm build`.
- FE에서 새 엔드포인트/필드가 필요하면: 코드에 임시로 만들지 말고 **api.yaml 변경을 요청**한다.
- 두 세션(FE/BE) 협업 시 api.yaml이 공유 계약이다. 스펙 변경은 api.yaml 수정으로만 소통한다.

---

## 10. 타이포그래피 스케일 (Typography Scale)

전역 폰트 크기는 3단계로 고정한다. 새 스타일을 추가할 때 아래 값 중 하나를 사용하고, 그 사이의 임의 값(13/14/15/17px 등)을 새로 만들지 않는다.

| 단계 | 크기 | 용도 |
|---|---|---|
| 최소(floor) | `12px` | 캡션, 뱃지/칩, 메타 정보, 타임스탬프 등 가장 작은 텍스트. 이보다 작게 내려가지 않는다. |
| 기본(base) | `16px` | 본문/설명/입력 텍스트 기본값. `body`(`base/reset.css`), `.t-body`(`typography/classes.css`), `.editor-area` 등. |
| 강조(emphasis) | `18px` | 카드/섹션 타이틀, 서브헤더처럼 본문보다 한 단계 강조가 필요한 텍스트. |

- `21px`/`22px`/`28px`, 히어로 `clamp()` 등 기존 대형 헤드라인 스케일(`.t-tagline`, `.t-lead`, `.t-display-md`, `.t-hero` 등)은 이 3단계보다 상위 계층이므로 그대로 유지한다.
- 문맥상 "본문"으로 쓰이는 요소(설명 문단, 입력창, 에디터 본문 등)는 강조 단계로 올리지 말고 기본(16px)에 맞춘다. 반대로 타이틀/굵은 라벨처럼 이름 자체가 강조를 뜻하는 요소는 강조(18px)를 쓴다.
- `rich-editor.css`의 헤딩(h1~h5)은 `em` 단위로 기본 폰트 크기에 상대적으로 스케일하므로 별도 px 값을 추가하지 않는다.

---

*이 문서는 운영 규칙이다. 데이터 타입·DB 스키마·엔드포인트 상세는 `api.yaml`과 `develop.md`를 직접 참조하라.*
