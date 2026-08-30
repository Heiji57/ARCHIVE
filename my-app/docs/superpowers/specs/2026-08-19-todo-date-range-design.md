# Todo 기간(시작일 → 마감일) 지원 설계

**작성일**: 2026-08-19  
**범위**: api.yaml + FE 전 레이어 (타입·매퍼·API 클라이언트·UI)

---

## 배경 및 목표

현재 할 일(`Todo`)은 `dateKey`(YYYY-MM-DD) 하나에만 속한다. 하루 안의 시간(`startTime`/`endTime`)은 있지만, 여러 날에 걸친 기간은 표현할 수 없다.

이 설계는 선택적 마감일(`dueDate`)을 추가해 "시작일 → 마감일" 기간 할 일을 지원한다.

---

## 1. API 스키마 변경 (api.yaml)

### 1-1. TodoCreateRequest

```yaml
due_date_key:
  type: string
  pattern: '^\d{4}-\d{2}-\d{2}$'
  nullable: true
  description: >
    선택적 마감일(포함). date_key 이상이어야 한다.
    생략/null = 마감일 없음(단일 날짜 할 일).
```

### 1-2. TodoUpdateRequest

```yaml
due_date_key:
  type: string
  pattern: '^\d{4}-\d{2}-\d{2}$'
  nullable: true
  description: >
    omit = unchanged, null = 마감일 삭제, YYYY-MM-DD = 설정.
    non-null 이면 date_key 이상이어야 한다.
```

### 1-3. TodoResponse

```yaml
due_date_key:
  type: string
  nullable: true
  description: "마감일 (YYYY-MM-DD). null = 단일 날짜."
```

### 1-4. 백엔드 계약

- `due_date_key < date_key`이면 `422 VALIDATION_ERROR` 반환.
- 반복(recurrence) 할 일의 경우 `recurrence_scope` 로직과 무관하게 `due_date_key`는 해당 회차에만 적용된다(기존 반복 규칙은 날짜 슬롯에 기반하므로 기간 개념과 분리).

---

## 2. FE 타입 & 데이터 레이어

### 2-1. `entities/todo/model/types.ts`

`Todo` 인터페이스에 추가:

```ts
/** 선택적 마감일 ("YYYY-MM-DD"). null = 단일 날짜 할 일. */
dueDate?: string | null;
```

`TodoPatch` (`entities/todo/ui/TaskDetailPanel.tsx`) 에 `"dueDate"` 추가:

```ts
export type TodoPatch = Partial<
  Pick<Todo, "title" | "status" | "description" | "dateKey" | "dueDate" | "tags">
>;
```

### 2-2. `shared/api/mappers.ts`

`toTodo` 함수에 `due_date_key → dueDate` 매핑 추가:

```ts
dueDate: raw.due_date_key ?? null,
```

### 2-3. `shared/api/todos.ts`

**`apiCreateTodo`** — 인자 추가:

```ts
/** 마감일 (YYYY-MM-DD, >= dateKey). null/생략 = 단일 날짜. */
dueDate?: string | null;
```

body에:

```ts
...(input.dueDate !== undefined && { due_date_key: input.dueDate }),
```

**`apiUpdateTodo`** — patch 타입 확장:

```ts
/** omit=unchanged, null=삭제, YYYY-MM-DD=설정. */
dueDate?: string | null;
```

body 구성:

```ts
if (patch.dueDate !== undefined) body.due_date_key = patch.dueDate;
```

### 2-4. 타입 재생성

api.yaml 수정 후 반드시 실행:

```bash
pnpm gen:api
```

컴파일 에러가 발생하면 계약 드리프트 신호 — FE 코드를 api.yaml에 맞춘다.

---

## 3. UI 컴포넌트

### 3-1. `DatePickerPopover` — `minDate` prop 추가

마감일 피커에서 시작일 이전 날짜를 선택 불가로 처리하기 위한 prop:

```ts
export interface DatePickerPopoverProps {
  value: string;
  onChange: (v: string) => void;
  onClose: () => void;
  anchorRight?: boolean;
  /** 이 날짜 이전은 선택 불가 (YYYY-MM-DD). */
  minDate?: string;
}
```

달력 날짜 버튼 렌더링 시:

```ts
const disabled = minDate !== undefined && k < minDate;
// disabled = true면 pointer-events: none, opacity: 0.3
```

### 3-2. `TaskDetailPanel` — "기간" 섹션

스케줄 탭의 기존 "날짜" 단일 행을 "기간" 섹션으로 교체한다.

**레이아웃:**

```
┌─────────────────────────────────────┐
│ 기간                                │
│ ┌─────────────────────────────────┐ │
│ │ 📅 시작일   2026-08-19    ∨    │ │
│ └─────────────────────────────────┘ │
│ ┌──────────────────────────────┐ ─┐ │
│ │ 🏁 마감일   없음       ∨   │ × │ │  ← 설정 시 × 버튼 노출
│ └──────────────────────────────┘ ─┘ │
└─────────────────────────────────────┘
```

**동작:**
- 시작일 버튼 → 기존 `DatePickerPopover` (minDate 없음)
- 마감일 버튼 → `DatePickerPopover` with `minDate={todo.dateKey}`
- 마감일 `×` 버튼 → `onUpdate({ dueDate: null })`
- 마감일 없으면 버튼 레이블 "없음" (i18n 키: `todo.dueDate.none`)
- 각 피커는 독립적으로 열림 (두 피커가 동시에 열리지 않음)

**i18n 키 (신규):**

| 키 | ko | en |
|---|---|---|
| `todo.dueDate.label` | 마감일 | Due date |
| `todo.dueDate.none` | 없음 | None |
| `todo.startDate.label` | 시작일 | Start date |
| `todo.period.label` | 기간 | Period |

### 3-3. `TodoListRow` — 날짜 표시

```
dueDate 없음:                📅 2026-08-19
같은 연도, dueDate 있음:     📅 2026-08-19 – 08-25
다른 연도, dueDate 있음:     📅 2026-08-19 – 2027-01-05
```

dueDate와 dateKey가 같은 연도이면 dueDate 부분을 `MM-DD`로 축약한다. 연도가 다르면 `YYYY-MM-DD` 전체를 표시한다.

### 3-4. QuickCapture

마감일 입력 추가하지 않음 — 빠른 캡처 흐름 보호.

---

## 4. 검증 & 빌드 게이트

1. api.yaml 수정
2. `pnpm gen:api` — schema.d.ts 재생성
3. 컴파일 에러 수정
4. `pnpm build` — 최종 게이트

---

## 5. 미결 사항

- 반복(recurrence) 할 일에서 마감일을 변경할 때 `recurrence_scope` 다이얼로그를 띄울지 여부 → 현재 설계에서는 **생략** (기간은 각 회차 독립 정보로 간주, "this" 스코프만).
- 캘린더 뷰에서 기간 블록 표시 — 이번 범위 밖, 추후 확장.
