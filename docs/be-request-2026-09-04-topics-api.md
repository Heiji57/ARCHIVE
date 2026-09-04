# BE 작업 요청 — 주제(Topic) API 확장 + 회고 기본 제목 (2026-09-04)

FE 리디자인 Phase 2(주제 뷰)를 착수하려면 아래 계약이 먼저 필요하다.
**아래 블록을 그대로 복사해 ARCHIVE-BE 작업 세션에 붙여넣으면 된다.**

관련 FE 문서: `docs/superpowers/specs/2026-09-04-retro-redesign-design.md`

---

```
ARCHIVE 백엔드(이 저장소)에 주제(Topic) 관련 API 3개를 추가하고, 회고 기본 제목 규칙 1개를
바꾸고, 기존 동작 1개를 확인해줘. 프론트엔드(ARCHIVE-FE)의 "주제 뷰 리디자인"이 이 계약을
기다리고 있어.

## 배경

프론트엔드는 지금 주제 화면을 이렇게 바꾸는 중이야:
- 주제를 pill 목록으로 전환하고 이름/설명 편집·삭제를 화면 안에서 한다.
- 정리 문서(digest) 위에 "회고 24 · 할 일 61 · 태그 11 · 2026.06.12~09.03" 같은 통계 줄과
  "09.01까지 반영됨 · 미반영 회고 3개" 배너를 띄운다.
- "소스 24개 보기"로 이 digest에 실제로 반영된 회고/할 일 목록을 펼쳐 본다.

지금 `/topics` 도메인에는 목록/생성/삭제와 digest 생성·조회·SSE 만 있어서 위를 못 만든다.

## 지켜야 할 기존 규약

- 응답은 기존 래퍼 그대로: `{"status": "success", "code": "OK", "data": {...}}`,
  에러는 `{"status": "error", "code": "<DOMAIN_CODE>", "data": null, "details": [...]}`.
- 필드는 snake_case.
- 페이지네이션 응답은 기존 `EntryPageResponse`와 동일한 모양(`items`, `total`, `page`, `size`)을 쓴다.
- 태그 카운트는 기존 `TagCount`(`{tag, count}`) 모양을 재사용한다.
- 에러 분기는 HTTP status가 아니라 `code` 문자열이 기준이다.

## 작업 1 — 주제 수정: `PATCH /topics/{topic_id}`

지금 `/topics/{topic_id}`에는 DELETE만 있다. 이름·설명을 고칠 방법이 없어서 FE의 "설명 편집"을
만들 수 없다.

- 요청 body: `{"name": "...", "description": "..."}` — 둘 다 선택(omit = 변경 없음).
  제약은 생성과 동일: `name` 1~100자, `description` 0~500자.
- 응답 200: 기존 `TopicResponse`와 같은 모양(`id, name, description, created_at, updated_at`).
- 에러 코드: `TOPIC_NOT_FOUND`(404), `TOPIC_NAME_DUPLICATED`(409), `VALIDATION_ERROR`(422).
- 이름을 바꿔도 기존 digest는 그대로 둔다(재생성 트리거 금지).

## 작업 2 — 주제 통계: `GET /topics/{topic_id}/stats`

digest 생성 여부와 무관하게 항상 조회 가능해야 한다(정리한 적 없는 주제도 통계는 보여준다).

응답 `data` 예시:

{
  "topic_id": "tpc_123",
  "entry_counts": { "daily": 18, "weekly": 6, "monthly": 0, "yearly": 0, "total": 24 },
  "todo_counts": { "total": 61, "completed": 48 },
  "tag_counts": [ { "tag": "배포", "count": 12 }, { "tag": "React", "count": 9 } ],
  "period_start_date_key": "2026-06-12",
  "period_end_date_key": "2026-09-03",
  "unreflected_entry_count": 3
}

- 집계 대상은 digest 생성 때 쓰는 것과 **같은 매칭 규칙**(벡터 검색 등 현재 구현)으로 이 주제에
  묶이는 회고/할 일이다. 별도의 새 매칭 로직을 만들지 말고 기존 로직을 재사용해줘.
- `tag_counts`는 **할 일(todo)의 태그** 기준이다. 회고 엔트리에는 태그 필드가 없고, 이번에
  추가하지도 않는다. 상위 N개(예: 20개)로 잘라도 되지만 총 태그 종류 수를 알 수 있게
  응답에 무엇을 담을지는 네가 판단해서 알려줘.
- `period_start_date_key` / `period_end_date_key`는 이 주제에 묶인 항목 중 가장 이른/늦은
  날짜(YYYY-MM-DD). 항목이 없으면 null.
- `unreflected_entry_count`는 **digest의 `watermark_date_key` 이후에 작성된, 이 주제에 묶이는
  회고 수**다. digest가 아직 없으면 매칭되는 전체 회고 수. FE가 "미반영 회고 3개" 배너에 쓴다.
- 에러: `TOPIC_NOT_FOUND`(404).
- 매 호출마다 무겁게 재계산되면 곤란하니 캐시가 필요하면 넣고, 어떤 캐시/TTL을 썼는지 알려줘.

## 작업 3 — 소스 목록: `GET /topics/{topic_id}/sources`

"이 정리 문서가 실제로 무엇을 읽고 썼는가"를 사용자에게 보여주는 목록이다.

- 쿼리: `page`(기본 1), `size`(기본 20, 최대 100).
- 응답 `data`: `{ "items": [...], "total": 24, "page": 1, "size": 20 }`
- `items[]` 항목:

  { "kind": "entry", "id": "...", "title": "2026-08-21 일일 회고",
    "date_key": "2026-08-21", "retro_type": "daily" }

  { "kind": "todo", "id": "...", "title": "배포 절차 문서 쓰기",
    "date_key": "2026-08-20", "retro_type": null }

- 정렬은 `date_key` 내림차순.
- **가능하면 "마지막 digest 생성에 실제로 투입된 소스"** 를 돌려줘. 지금 구현이 그걸 기록하지
  않는다면 (a) 기록하도록 바꾸는 비용과 (b) 매칭 규칙으로 매번 다시 계산하는 방식 중 어느 쪽이
  나은지 판단해서 알려주고, 고른 쪽으로 구현해줘. 다시 계산하는 쪽을 골랐다면 응답에 그 사실이
  드러나야 한다(예: 문서 기준 시점과 다를 수 있음).
- 에러: `TOPIC_NOT_FOUND`(404).

## 작업 4 — 회고 기본 제목을 서버가 채운다 (`POST /entries`)

지금은 프론트엔드가 `"{date_key} 일일 회고"` 문자열을 만들어 보낸다. 이 규칙을 서버로 옮긴다.

- `POST /entries`에서 `title`이 없거나 공백만 있으면 서버가 채운다.
- 형식은 `"{date_key} {회고 종류}"`이고, 언어는 **해당 사용자의 `user_settings.locale`** 을 따른다
  (AI 요약 언어나 GitHub push 경로에서 이미 locale을 쓰고 있으니 같은 값을 재사용):
  - ko: `2026-09-03 일일 회고` / `... 주간 회고` / `... 월간 회고` / `... 연간 회고`
  - en: `2026-09-03 Daily Retrospective` / `Weekly` / `Monthly` / `Annual`
  - ja: `2026-09-03 デイリー振り返り` / `ウィークリー` / `マンスリー` / `年間`
  - zh: `2026-09-03 每日回顾` / `每周回顾` / `每月回顾` / `年度回顾`
  - 그 외 locale은 en으로 폴백.
- 기존 데이터 마이그레이션은 하지 않는다(이미 제목이 있는 회고는 그대로).
- `PATCH /entries/{id}`로 제목을 빈 문자열로 만들었을 때도 같은 규칙으로 채울지는 네가 판단해서
  알려줘 — FE는 빈 제목을 보낼 수 있다.

## 확인 요청 (코드 구현 아님)

`POST /topics/{topic_id}/digest/generate`로 재생성을 걸어 `status`가 `pending`이 될 때,
**기존 `content`가 그대로 남아 있는지** 확인해서 알려줘. FE는 "정리하는 중에 문제가 생겼습니다 —
이전 09.01 기준 문서는 그대로 유지됩니다 / 이전 문서 보기" 화면을 만들 계획이라, 재생성 중과
실패 후에도 직전 content를 읽을 수 있어야 한다. 지금 지워진다면 유지하도록 바꿔줘.

## 이번 범위에서 명시적으로 제외 (만들지 마)

- digest `content`의 구조화 — 문장 단위 출처(citation), "잘 된 것/계속 걸리는 것" 섹션 분리,
  인용구 추출. **content는 지금처럼 마크다운 문자열 하나로 유지한다.**
- digest 생성 취소/중단 API.
- 회고 엔트리(journal_entries)에 태그 필드 추가.
- 회고↔주제 수동 연결 테이블/엔드포인트. (매칭은 지금의 자동 방식 유지)
- 주제 개수 제한 변경 — **현재 값(20개) 그대로 둔다.**

## 끝나고 알려줄 것

1. 위 4개의 **최종 계약을 OpenAPI 3.0 조각(paths + components.schemas)으로** 정리해서 줘.
   프론트엔드가 그걸 `my-app/api.yaml`에 붙여넣고 `pnpm gen:api`로 타입을 재생성한다.
2. 새로 생긴 에러 코드가 있으면 코드 문자열과 HTTP status 매핑.
3. 작업 2·3에서 네가 판단해서 고른 선택(캐시 전략, 소스 기록 방식)과 그 이유.
```
