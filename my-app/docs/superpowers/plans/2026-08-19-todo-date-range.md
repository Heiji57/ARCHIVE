# Todo 시작일 → 마감일 지원 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 할 일에 선택적 마감일(`dueDate`)을 추가해 "시작일 → 마감일" 기간 관리를 지원한다.

**Architecture:** api.yaml에 `due_date_key` 필드를 추가하고, FE 데이터 레이어(타입·매퍼·API 클라이언트)를 순서대로 확장한다. UI는 TaskDetailPanel의 날짜 섹션을 "기간" 섹션으로 교체하고, DatePickerPopover에 `minDate` prop을 추가해 마감일이 시작일보다 앞설 수 없도록 제한한다.

**Tech Stack:** TypeScript, React, Vite, openapi-typescript

**Spec:** `docs/superpowers/specs/2026-08-19-todo-date-range-design.md`

## Global Constraints

- 패키지 매니저는 `pnpm`만 사용 (npm/yarn 금지)
- 빌드 게이트: 각 태스크 마지막에 `pnpm build` 통과 필수 (`tsc -b && vite build`)
- `api.yaml`에 없는 필드를 FE에서 임의로 만들지 않는다
- FSD 레이어 규칙 준수: 위젯·엔티티는 `@/shared/api` 배럴로만 접근
- 타이포그래피 스케일: 12px(캡션) / 16px(본문) / 18px(강조) — 그 사이 값 금지
- `.env`, `.env.local` 등 실제 환경 변수 파일 접근 금지

---

## 파일 맵

| 파일 | 작업 |
|---|---|
| `api.yaml` | 수정 — due_date_key를 3개 스키마에 추가 |
| `src/shared/api/schema.d.ts` | 재생성 — pnpm gen:api (직접 편집 금지) |
| `src/entities/todo/model/types.ts` | 수정 — Todo에 dueDate 필드 추가 |
| `src/shared/api/mappers.ts` | 수정 — toTodo에 due_date_key → dueDate 매핑 추가 |
| `src/shared/api/todos.ts` | 수정 — apiCreateTodo/apiUpdateTodo에 dueDate 인자 추가 |
| `src/shared/lib/i18n/keys.ts` | 수정 — 5개 신규 키 추가 |
| `src/shared/lib/i18n/locales/ko.ts` | 수정 — 한국어 번역 |
| `src/shared/lib/i18n/locales/en.ts` | 수정 — 영어 번역 |
| `src/shared/lib/i18n/locales/ja.ts` | 수정 — 일본어 번역 |
| `src/shared/lib/i18n/locales/zh.ts` | 수정 — 중국어 번역 |
| `src/shared/lib/date.ts` | 수정 — formatDueDateSuffix 유틸 추가 |
| `src/entities/todo/ui/DatePickerPopover.tsx` | 수정 — minDate prop 추가 |
| `src/entities/todo/ui/TaskDetailPanel.tsx` | 수정 — 날짜 단일 행 → 기간 섹션 교체, TodoPatch 확장 |
| `src/widgets/todo-board/ui/TodoListRow.tsx` | 수정 — dueDate 범위 표시 |

---

## Task 1: api.yaml + 데이터 레이어

**Files:**
- Modify: `api.yaml` (TodoCreateRequest, TodoUpdateRequest, TodoResponse)
- Modify: `src/entities/todo/model/types.ts`
- Modify: `src/shared/api/mappers.ts`
- Modify: `src/shared/api/todos.ts`
- Regenerate: `src/shared/api/schema.d.ts` (pnpm gen:api)

**Interfaces:**
- Produces: `Todo.dueDate?: string | null`, `toTodo` 매핑, `apiCreateTodo({ dueDate })`, `apiUpdateTodo(id, { dueDate })`

- [ ] **Step 1: api.yaml — TodoCreateRequest에 due_date_key 추가**

`api.yaml`의 `TodoCreateRequest` 스키마 `properties` 블록 (`tags` 항목 바로 위)에 추가:

```yaml
        due_date_key:
          type: string
          pattern: '^\d{4}-\d{2}-\d{2}$'
          nullable: true
          description: >
            선택적 마감일(포함). date_key 이상이어야 한다.
            생략/null = 마감일 없음(단일 날짜 할 일).
```

- [ ] **Step 2: api.yaml — TodoUpdateRequest에 due_date_key 추가**

`TodoUpdateRequest` 스키마 `properties` 블록 (`tags` 항목 바로 위)에 추가:

```yaml
        due_date_key:
          type: string
          pattern: '^\d{4}-\d{2}-\d{2}$'
          nullable: true
          description: >
            omit = unchanged, null = 마감일 삭제, YYYY-MM-DD = 설정.
            non-null 이면 date_key 이상이어야 한다.
```

- [ ] **Step 3: api.yaml — TodoResponse에 due_date_key 추가**

`TodoResponse` 스키마 `properties` 블록 (`tags` 항목 바로 위)에 추가:

```yaml
        due_date_key:
          type: string
          nullable: true
          description: "마감일 (YYYY-MM-DD). null = 단일 날짜."
```

- [ ] **Step 4: schema.d.ts 재생성**

```bash
cd /home/minsu/project/ARCHIVE-FE/my-app
pnpm gen:api
```

컴파일 에러가 발생하면 계약 드리프트 신호 — 아래 단계에서 FE 코드로 해소한다.

- [ ] **Step 5: Todo 타입에 dueDate 추가**

`src/entities/todo/model/types.ts`의 `Todo` 인터페이스에서 `tags: string[];` 바로 위에 추가:

```ts
  /** 선택적 마감일 ("YYYY-MM-DD"). null = 단일 날짜 할 일. */
  dueDate?: string | null;
```

- [ ] **Step 6: toTodo 매퍼에 dueDate 매핑 추가**

`src/shared/api/mappers.ts`의 `toTodo` 함수 내 `return` 블록에서 `tags: api.tags ?? [],` 바로 위에 추가:

```ts
    dueDate: api.due_date_key ?? null,
```

- [ ] **Step 7: apiCreateTodo에 dueDate 인자 추가**

`src/shared/api/todos.ts`의 `apiCreateTodo` 함수 인자 객체에 `tags?: string[];` 바로 위에 추가:

```ts
  /** 마감일 (YYYY-MM-DD, >= dateKey). null/생략 = 단일 날짜. */
  dueDate?: string | null;
```

같은 함수의 `body` 객체에서 `tags: input.tags ?? [],` 바로 위에 추가:

```ts
      ...(input.dueDate !== undefined && { due_date_key: input.dueDate }),
```

- [ ] **Step 8: apiUpdateTodo에 dueDate 인자 추가**

`src/shared/api/todos.ts`의 `apiUpdateTodo` patch 타입에서 `tags?: string[];` 바로 위에 추가:

```ts
    /** omit=unchanged, null=삭제, YYYY-MM-DD=설정. */
    dueDate?: string | null;
```

같은 함수의 body 구성 블록에서 `if (patch.tags !== undefined) body.tags = patch.tags;` 바로 위에 추가:

```ts
  if (patch.dueDate !== undefined) body.due_date_key = patch.dueDate;
```

- [ ] **Step 9: 빌드 검증**

```bash
pnpm build
```

에러 없이 통과해야 한다.

- [ ] **Step 10: 커밋**

```bash
git add api.yaml src/shared/api/schema.d.ts src/entities/todo/model/types.ts src/shared/api/mappers.ts src/shared/api/todos.ts
git commit -m "feat: add due_date_key to api schema and wire FE data layer"
```

---

## Task 2: i18n — 신규 키 5개

**Files:**
- Modify: `src/shared/lib/i18n/keys.ts`
- Modify: `src/shared/lib/i18n/locales/ko.ts`
- Modify: `src/shared/lib/i18n/locales/en.ts`
- Modify: `src/shared/lib/i18n/locales/ja.ts`
- Modify: `src/shared/lib/i18n/locales/zh.ts`

**Interfaces:**
- Produces: `t("todo.period.label")`, `t("todo.startDate.label")`, `t("todo.dueDate.label")`, `t("todo.dueDate.none")`, `t("todo.dueDate.clear")`

- [ ] **Step 1: keys.ts에 신규 키 추가**

`src/shared/lib/i18n/keys.ts`에서 `"todo.tag.title"` 줄 바로 위에 추가:

```ts
  | "todo.period.label"
  | "todo.startDate.label"
  | "todo.dueDate.label"
  | "todo.dueDate.none"
  | "todo.dueDate.clear"
```

- [ ] **Step 2: ko.ts 번역 추가**

`src/shared/lib/i18n/locales/ko.ts`에서 `"todo.tag.title": "태그",` 바로 위에 추가:

```ts
  "todo.period.label": "기간",
  "todo.startDate.label": "시작일",
  "todo.dueDate.label": "마감일",
  "todo.dueDate.none": "없음",
  "todo.dueDate.clear": "마감일 지우기",
```

- [ ] **Step 3: en.ts 번역 추가**

`src/shared/lib/i18n/locales/en.ts`에서 `"todo.tag.title"` 줄 바로 위에 추가:

```ts
  "todo.period.label": "Period",
  "todo.startDate.label": "Start date",
  "todo.dueDate.label": "Due date",
  "todo.dueDate.none": "None",
  "todo.dueDate.clear": "Clear due date",
```

- [ ] **Step 4: ja.ts 번역 추가**

`src/shared/lib/i18n/locales/ja.ts`에서 `"todo.tag.title"` 줄 바로 위에 추가:

```ts
  "todo.period.label": "期間",
  "todo.startDate.label": "開始日",
  "todo.dueDate.label": "締め切り",
  "todo.dueDate.none": "なし",
  "todo.dueDate.clear": "締め切りを削除",
```

- [ ] **Step 5: zh.ts 번역 추가**

`src/shared/lib/i18n/locales/zh.ts`에서 `"todo.tag.title"` 줄 바로 위에 추가:

```ts
  "todo.period.label": "期间",
  "todo.startDate.label": "开始日",
  "todo.dueDate.label": "截止日",
  "todo.dueDate.none": "无",
  "todo.dueDate.clear": "清除截止日",
```

- [ ] **Step 6: 빌드 검증**

```bash
pnpm build
```

- [ ] **Step 7: 커밋**

```bash
git add src/shared/lib/i18n/keys.ts src/shared/lib/i18n/locales/ko.ts src/shared/lib/i18n/locales/en.ts src/shared/lib/i18n/locales/ja.ts src/shared/lib/i18n/locales/zh.ts
git commit -m "feat: add i18n keys for todo date range (period/startDate/dueDate)"
```

---

## Task 3: DatePickerPopover — minDate prop

**Files:**
- Modify: `src/entities/todo/ui/DatePickerPopover.tsx`

**Interfaces:**
- Consumes: 없음 (독립 컴포넌트)
- Produces: `DatePickerPopoverProps.minDate?: string` — YYYY-MM-DD, 이 날짜 이전 날짜 선택 불가

- [ ] **Step 1: minDate prop 인터페이스에 추가**

`src/entities/todo/ui/DatePickerPopover.tsx`의 `DatePickerPopoverProps` 인터페이스에서 `anchorRight?: boolean;` 바로 아래에 추가:

```ts
  /** 이 날짜 이전은 선택 불가 (YYYY-MM-DD). 마감일 피커에서 시작일 이전을 막을 때 사용. */
  minDate?: string;
```

함수 파라미터 구조분해에도 추가:

```ts
export function DatePickerPopover({
  value,
  onChange,
  onClose,
  anchorRight = true,
  minDate,
}: DatePickerPopoverProps) {
```

- [ ] **Step 2: 날짜 버튼에 disabled 처리 적용**

달력 날짜 버튼을 렌더링하는 `monthDays.map((d) => { ... })` 블록 안에서 `const k = toDateKey(d);` 바로 아래에 추가:

```ts
const disabled = minDate !== undefined && k < minDate;
```

버튼 요소의 `onClick` prop을 수정해 disabled일 때 호출하지 않도록:

```ts
onClick={() => { if (!disabled) onChange(k); }}
```

버튼 `style`에 disabled 시각 처리를 추가 — 기존 `style` 객체에 병합:

```ts
style={{
  aspectRatio: "1 / 1",
  borderRadius: "var(--r-sm)",
  background: sel
    ? "var(--color-primary)"
    : "var(--color-tile-3)",
  color: sel
    ? "#fff"
    : inMonth && !disabled
      ? "var(--color-ink)"
      : "var(--color-ink-muted-48)",
  fontSize: 12,
  fontWeight: 500,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  cursor: disabled ? "default" : "pointer",
  opacity: disabled ? 0.35 : 1,
}}
```

- [ ] **Step 3: 빌드 검증**

```bash
pnpm build
```

- [ ] **Step 4: 커밋**

```bash
git add src/entities/todo/ui/DatePickerPopover.tsx
git commit -m "feat: add minDate prop to DatePickerPopover to restrict selectable range"
```

---

## Task 4: TaskDetailPanel — "기간" 섹션

**Files:**
- Modify: `src/entities/todo/ui/TaskDetailPanel.tsx`

**Interfaces:**
- Consumes: `Todo.dueDate?: string | null` (Task 1), `t("todo.period.label")` 외 4개 키 (Task 2), `DatePickerPopoverProps.minDate` (Task 3)
- Produces: 기간 섹션 UI, `onUpdate({ dueDate: v })` / `onUpdate({ dueDate: null })` 호출

- [ ] **Step 1: TodoPatch 타입에 dueDate 추가**

`src/entities/todo/ui/TaskDetailPanel.tsx`의 `TodoPatch` 타입을 수정:

```ts
export type TodoPatch = Partial<
  Pick<Todo, "title" | "status" | "description" | "dateKey" | "dueDate" | "tags">
>;
```

- [ ] **Step 2: 상태 변수 교체 — dateOpen → startDateOpen + dueDateOpen**

기존 `const [dateOpen, setDateOpen] = useState(false);`를 삭제하고 아래 두 줄로 교체:

```ts
const [startDateOpen, setStartDateOpen] = useState(false);
const [dueDateOpen, setDueDateOpen] = useState(false);
```

- [ ] **Step 3: 스케줄 탭의 "날짜" 섹션을 "기간" 섹션으로 교체**

스케줄 탭(`tab === "schedule"`) 안의 `{/* Date */}` 블록 전체(약 `<div>` ~ `</div>`)를 아래로 교체:

```tsx
{/* Period — 시작일 + 마감일 */}
<div>
  <p className="t-eyebrow" style={eyebrowStyle}>
    {t("todo.period.label")}
  </p>

  {/* 시작일 */}
  <div style={{ position: "relative", marginBottom: 6 }}>
    <button
      type="button"
      onClick={() => {
        setStartDateOpen((o) => !o);
        setDueDateOpen(false);
      }}
      style={{
        width: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "11px 14px",
        borderRadius: "var(--r-md)",
        background: "var(--color-tile-3)",
        border: "1px solid var(--color-divider-soft)",
        color: "var(--color-ink)",
        fontSize: 16,
      }}
    >
      <span style={{ display: "inline-flex", gap: 8, alignItems: "center" }}>
        <CalendarDays size={15} />
        <span style={{ fontSize: 12, color: "var(--color-body-muted)", marginRight: 4 }}>
          {t("todo.startDate.label")}
        </span>
        {todo.dateKey}
      </span>
      <ChevronDown size={14} />
    </button>
    {startDateOpen ? (
      <DatePickerPopover
        value={todo.dateKey}
        anchorRight={false}
        onChange={(v) => {
          onUpdate({ dateKey: v });
          setStartDateOpen(false);
        }}
        onClose={() => setStartDateOpen(false)}
      />
    ) : null}
  </div>

  {/* 마감일 */}
  <div style={{ position: "relative" }}>
    <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
      <button
        type="button"
        onClick={() => {
          setDueDateOpen((o) => !o);
          setStartDateOpen(false);
        }}
        style={{
          flex: 1,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "11px 14px",
          borderRadius: "var(--r-md)",
          background: "var(--color-tile-3)",
          border: "1px solid var(--color-divider-soft)",
          color: "var(--color-ink)",
          fontSize: 16,
        }}
      >
        <span style={{ display: "inline-flex", gap: 8, alignItems: "center" }}>
          <CalendarDays size={15} />
          <span style={{ fontSize: 12, color: "var(--color-body-muted)", marginRight: 4 }}>
            {t("todo.dueDate.label")}
          </span>
          {todo.dueDate ?? t("todo.dueDate.none")}
        </span>
        <ChevronDown size={14} />
      </button>
      {todo.dueDate ? (
        <button
          type="button"
          className="btn-icon"
          aria-label={t("todo.dueDate.clear")}
          title={t("todo.dueDate.clear")}
          onClick={() => onUpdate({ dueDate: null })}
          style={{ flexShrink: 0 }}
        >
          <X size={14} />
        </button>
      ) : null}
    </div>
    {dueDateOpen ? (
      <DatePickerPopover
        value={todo.dueDate ?? todo.dateKey}
        anchorRight={false}
        minDate={todo.dateKey}
        onChange={(v) => {
          onUpdate({ dueDate: v });
          setDueDateOpen(false);
        }}
        onClose={() => setDueDateOpen(false)}
      />
    ) : null}
  </div>
</div>
```

- [ ] **Step 4: 빌드 검증**

```bash
pnpm build
```

- [ ] **Step 5: 커밋**

```bash
git add src/entities/todo/ui/TaskDetailPanel.tsx
git commit -m "feat: replace single date picker with period section (startDate + dueDate) in TaskDetailPanel"
```

---

## Task 5: TodoListRow — 날짜 범위 표시 + date 유틸

**Files:**
- Modify: `src/shared/lib/date.ts`
- Modify: `src/widgets/todo-board/ui/TodoListRow.tsx`

**Interfaces:**
- Consumes: `Todo.dueDate?: string | null` (Task 1)
- Produces: `formatDueDateSuffix(dateKey, dueDate): string` 유틸, 목록 행에 날짜 범위 표시

- [ ] **Step 1: date.ts에 formatDueDateSuffix 추가**

`src/shared/lib/date.ts`의 `export function toDateKey` 함수 바로 위에 추가:

```ts
/**
 * 목록 행에서 마감일을 간결하게 표시하기 위한 접미사.
 * 같은 연도이면 "MM-DD", 다른 연도이면 "YYYY-MM-DD" 전체를 반환한다.
 */
export function formatDueDateSuffix(dateKey: string, dueDate: string): string {
  if (dateKey.slice(0, 4) === dueDate.slice(0, 4)) {
    return dueDate.slice(5); // "MM-DD"
  }
  return dueDate;
}
```

- [ ] **Step 2: TodoListRow에서 dueDate import 및 범위 표시**

`src/widgets/todo-board/ui/TodoListRow.tsx`의 import 블록에 `formatDueDateSuffix` 추가:

```ts
import { formatDueDateSuffix } from "@/shared/lib/date";
```

날짜 표시 부분(`<span className="todo-list-row-date">` 블록)을 수정:

```tsx
<span className="todo-list-row-date">
  <CalendarDays size={11} />
  {todo.dueDate && todo.dueDate !== todo.dateKey
    ? `${todo.dateKey} – ${formatDueDateSuffix(todo.dateKey, todo.dueDate)}`
    : todo.dateKey}
</span>
```

- [ ] **Step 3: 빌드 검증**

```bash
pnpm build
```

- [ ] **Step 4: 커밋**

```bash
git add src/shared/lib/date.ts src/widgets/todo-board/ui/TodoListRow.tsx
git commit -m "feat: show date range in TodoListRow when dueDate is set"
```
