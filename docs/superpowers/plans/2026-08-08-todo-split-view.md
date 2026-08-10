# 할 일(Todo) 탭 분할 뷰 전환 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `my-app`의 "할 일" 탭을 3열 칸반(드래그로 상태 이동) + 우측 슬라이드인 오버레이 구조에서, 좌 50%/우 50% 상시 분할 뷰(왼쪽: 상태별로 그룹된 단일 리스트, 오른쪽: 탭 2개(내용/일정)로 재편된 상세 패널)로 전환한다.

**Architecture:** `entities/todo/ui/TaskDetailPanel.tsx`(캘린더와 공유되는 상세 패널)를 탭 구조로 재편하고 AI 회고 UI를 삭제한 뒤, `widgets/todo-board/` 내부의 칸반 전용 컴포넌트(`KanbanColumn`, `KanbanCard`, `useKanbanFilter`, `TodoFilterRow`)를 리스트 전용 컴포넌트(`TodoListRow`, `useTodoListFilter`, `TodoRangeFilterRow`, `TodoStatusFilterRow`, `TodoDetailPane`)로 교체하고 `TodoBoard.tsx`를 새 레이아웃으로 재조립한다. 데이터 모델(`Todo` 타입)과 상태 관리 액션(`updateTodo`, `removeTodo` 등)은 이미 필요한 필드를 모두 갖추고 있어 전혀 변경하지 않는다.

**Tech Stack:** React 19 + TypeScript(strict, `noUnusedLocals`/`noUnusedParameters` 활성화) + Vite, 순수 CSS(전역 디자인 토큰 `--color-*`/`--r-*`/`--font-*`), `pnpm`. 상태관리 라이브러리/라우팅 라이브러리 없음(자체 reducer + Context).

## Global Constraints

- **패키지 매니저는 pnpm만 사용.** 게이트는 `pnpm build`(`tsc -b && vite build`), 모든 태스크의 "테스트" 단계는 이 명령이다.
- **이 저장소에는 단위 테스트 프레임워크가 없다** (`package.json`에 vitest/jest 없음, `*.test.*` 파일 0개). CLAUDE.md 가드레일 4번(런타임/신규 라이브러리 무단 추가 금지)과 이번 작업 범위(UI 레이아웃 개편)를 고려해 테스트 프레임워크를 새로 들이지 않는다. 따라서 각 태스크의 "테스트" 단계는 **`pnpm build`로 타입/빌드 검증** + **UI가 바뀌는 태스크는 `run` 스킬로 dev 서버를 띄워 브라우저에서 수동 확인**하는 두 단계로 구성한다.
- **`tsconfig.app.json`에 `noUnusedLocals: true`, `noUnusedParameters: true`가 켜져 있다.** 즉 prop을 지우면서 그 prop만 쓰던 import/구조분해/타입을 같이 지우지 않으면 `pnpm build`가 즉시 실패한다. 각 스텝은 이를 반영해 연쇄적으로 지워야 할 곳까지 명시한다.
- **FSD 레이어 규칙 준수**: `app → pages → widgets → entities → shared`. 새 파일은 반드시 해당 레이어 규칙에 맞는 디렉터리에 만든다.
- **i18n 키는 4개 로케일(`en`, `ko`, `ja`, `zh`) 모두 동기화**해야 하며, 키 문자열은 `shared/lib/i18n/keys.ts`의 `TranslationKey` 유니온에도 추가/삭제해야 한다(안 하면 `t("...")` 호출이 타입 에러).
- **`api.yaml`/서버 계약 변경 없음.** 이번 계획은 순수 프론트엔드 UI 리팩터링이며 새 엔드포인트나 필드를 추가하지 않는다.
- 각 태스크는 그 자체로 `pnpm build`가 통과하는 상태로 끝나야 한다(빌드가 깨진 채로 다음 태스크로 넘어가지 않는다).
- 커밋 메시지는 이 저장소의 기존 컨벤션(`feat:`, `refactor:`, `fix:` 접두사)을 따른다.

---

### Task 1: `TaskDetailPanel` 탭 재편 + AI 회고 삭제 + `onGoToRetro`/`onNavigate` 체인 전체 제거

`entities/todo/ui/TaskDetailPanel.tsx`는 `TodoBoard.tsx`와 `CalendarDashboard.tsx` 딱 2곳에서만 쓰이는 공유 컴포넌트다. 이 태스크에서 AI 자동 회고 UI를 지우고 `onGoToRetro` prop을 인터페이스에서 제거하므로, 이 prop을 넘기던 두 소비자(및 그 상위 페이지/App.tsx)에서 죽은 `onNavigate` 배선까지 **같은 태스크에서 함께** 제거해야 `pnpm build`가 깨지지 않는다(`noUnusedParameters` 때문에 절반만 지우면 빌드가 실패한다).

**구현 참고 (승인된 설계 문서 대비 트리밍)**: 승인된 스펙 문서(`docs/superpowers/specs/2026-08-08-todo-split-view-design.md`)는 "상단 헤더(상태 pill, 코드, 요일, 삭제/닫기 버튼, 제목 입력)"라고 적었지만, 실제 구현에서는 프로토타입 전용 장식 요소인 **상태 pill과 "TODO-001" 코드 배지는 넣지 않는다**. 이유: (1) 실제 `Todo.id`는 순차 정수가 아니라 서버가 발급하는 문자열(반복 가상 인스턴스는 `"{base_id}::{slot_date}"` 형식까지 있음)이라 `"TODO-" + id`로 만들면 보기 나쁜 문자열이 나온다, (2) 상태 pill은 바로 아래 "내용" 탭의 전체 상태 선택 UI와 중복된다. **제목 입력만** 헤더로 옮기고(탭 전환과 무관하게 항상 보이도록), 나머지(삭제/닫기 버튼, 반복 배지, 날짜 텍스트)는 기존 위치를 유지한다.

**Files:**
- Modify: `my-app/src/entities/todo/ui/TaskDetailPanel.tsx`
- Modify: `my-app/src/shared/lib/i18n/keys.ts`
- Modify: `my-app/src/shared/lib/i18n/locales/en.ts`
- Modify: `my-app/src/shared/lib/i18n/locales/ko.ts`
- Modify: `my-app/src/shared/lib/i18n/locales/ja.ts`
- Modify: `my-app/src/shared/lib/i18n/locales/zh.ts`
- Modify: `my-app/src/widgets/calendar-dashboard/ui/CalendarDashboard.tsx`
- Modify: `my-app/src/pages/calendar/ui/CalendarPage.tsx`
- Modify: `my-app/src/widgets/todo-board/ui/TodoBoard.tsx` (임시 최소 수정 — Task 7에서 전체 재작성됨)
- Modify: `my-app/src/pages/todos/ui/TodosPage.tsx`
- Modify: `my-app/src/app/App.tsx`

**Interfaces:**
- Produces: `TaskDetailPanelProps`에서 `onGoToRetro: () => void`가 **제거됨**. 이후 모든 태스크는 이 prop이 없는 것으로 가정한다.
- Produces: `TodoBoardProps`, `TodosPage`의 props, `CalendarDashboardProps`, `CalendarPage`의 props에서 `onNavigate`가 **제거됨**(둘 다 이 태스크 이후 무인자 컴포넌트).

- [ ] **Step 1: `keys.ts`에서 i18n 키 갱신**

`my-app/src/shared/lib/i18n/keys.ts`에서 다음 3줄을 삭제한다(170~172행 부근, `// Calendar` 섹션 안):

```ts
  | "calendar.taskDetail.aiRetro"
  | "calendar.taskDetail.aiRetroDesc"
  | "calendar.taskDetail.goToRetro"
```

같은 파일의 `"calendar.taskDetail.title"` 키 바로 다음 줄에 탭 라벨 키 2개를 추가한다:

```ts
  | "calendar.taskDetail.title"
  | "calendar.taskDetail.tab.content"
  | "calendar.taskDetail.tab.schedule"
  | "calendar.taskDetail.close"
```

(`"calendar.taskDetail.close"`는 기존 줄이므로 그대로 두고 그 앞에 2줄만 삽입.)

- [ ] **Step 2: 4개 로케일 파일에서 동일하게 키 갱신**

`locales/en.ts`, `locales/ko.ts`, `locales/ja.ts`, `locales/zh.ts` 각각에서 `"calendar.taskDetail.aiRetro"`, `"calendar.taskDetail.aiRetroDesc"`, `"calendar.taskDetail.goToRetro"` 3줄을 삭제하고, `"calendar.taskDetail.title"` 값 바로 아래에 탭 라벨 2줄을 추가한다.

`ko.ts` (142행 부근):
```ts
  "calendar.taskDetail.title": "작업 상세",
  "calendar.taskDetail.tab.content": "내용",
  "calendar.taskDetail.tab.schedule": "일정",
  "calendar.taskDetail.close": "닫기",
```

`en.ts`:
```ts
  "calendar.taskDetail.title": "Task Details",
  "calendar.taskDetail.tab.content": "Content",
  "calendar.taskDetail.tab.schedule": "Schedule",
```
(뒤이어 기존 `"calendar.taskDetail.close"` 줄 유지. `en.ts`의 `calendar.taskDetail.title` 정확한 기존 값 문자열은 파일을 열어 그대로 유지하고, 그 값 아래에 위 2줄만 추가한다.)

`ja.ts`:
```ts
  "calendar.taskDetail.tab.content": "内容",
  "calendar.taskDetail.tab.schedule": "予定",
```

`zh.ts`:
```ts
  "calendar.taskDetail.tab.content": "内容",
  "calendar.taskDetail.tab.schedule": "日程",
```

(ja/zh는 `calendar.taskDetail.title` 기존 값 문자열을 그대로 두고 바로 아래에 위 2줄을 추가, aiRetro 3종 키는 동일하게 삭제.)

- [ ] **Step 3: `TaskDetailPanel.tsx` 전체를 아래 내용으로 교체**

```tsx
import { type CSSProperties, useEffect, useRef, useState } from "react";
import {
  AlertTriangle,
  CalendarDays,
  CalendarMinus,
  CalendarPlus,
  CheckCircle2,
  ChevronDown,
  Loader,
  Repeat,
  Trash2,
  X,
} from "lucide-react";
import type { RecurrenceRule, RecurrenceScope, TaskStatus, Todo } from "@/entities/todo/model/types";
import { isRecurringTodo } from "@/entities/todo/lib/selectors";
import { StatusIcon } from "@/entities/todo/ui/StatusIcon";
import { formatFullDate, fromDateKey } from "@/shared/lib/date";
import { useTranslation } from "@/shared/lib/i18n";
import { DatePickerPopover } from "./DatePickerPopover";
import { DEFAULT_RECURRENCE_RULE, RecurrencePopover } from "./RecurrencePopover";
import { RecurrenceScopeDialog } from "./RecurrenceScopeDialog";
import { TagEditor } from "./TagEditor";

export type TodoPatch = Partial<
  Pick<Todo, "title" | "status" | "description" | "dateKey" | "tags">
>;

function sameTags(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((tag, i) => tag === b[i]);
}

export interface TaskDetailPanelProps {
  todo: Todo;
  /** 자동완성 검색 후보 — 현재 로드된 다른 할 일들의 태그 전체. */
  tagSuggestions?: string[];
  /** 자동완성 "최근 사용" 후보 — 최신순으로 미리 정렬돼 온다. */
  recentTags?: string[];
  onClose: () => void;
  onUpdate: (patch: TodoPatch) => void;
  /**
   * 반복 시리즈 항목(recurring)의 제목/설명/태그를 수정하면, 커밋 시점(필드에서
   * 벗어날 때)에 이 회차만 바꿀지 이후 전체에 적용할지 범위 선택 다이얼로그를 띄운다.
   * "이후 전체"를 고르면 onUpdate 대신 이 콜백이 호출된다(recurrence_scope: "following" 고정).
   */
  onUpdateFollowing: (patch: Partial<Pick<Todo, "title" | "description" | "tags">>) => void;
  /** 시작/종료 시각 설정 (일간 타임라인 블록용). null = 비움. */
  onSetTime: (startTime: string | null, endTime: string | null) => void;
  /**
   * 반복 시리즈의 이 회차부터 이후 전체에 적용할 시작/종료 시각을 바꾼다.
   * 반복 항목의 시간을 바꿀 때 뜨는 범위 선택 다이얼로그에서 "이 일정 이후 전체"를
   * 고르면 onSetTime 대신 이 콜백이 호출된다.
   */
  onSetTimeFollowing: (startTime: string | null, endTime: string | null) => void;
  /**
   * 작업 삭제 (휴지통 버튼 / Delete 키).
   * 반복 시리즈 항목이면 범위 선택 다이얼로그를 먼저 띄운 뒤 선택된 scope 로 호출한다.
   */
  onDelete: (scope?: RecurrenceScope) => void;
  /**
   * 가상 인스턴스(todo.isVirtual)의 반복 규칙을 이 회차부터 변경한다
   * (recurrence_scope: "following" 고정). 가상 인스턴스가 아니면 섹션 자체가 숨겨져
   * 호출되지 않는다.
   */
  onUpdateRecurrence: (rule: RecurrenceRule) => void;
  /**
   * 비반복 단독 할 일(!isVirtual && seriesId===null)을 반복 시리즈로 전환한다.
   * 이미 어떤 시리즈에 속한 항목이면 섹션 자체가 숨겨져 호출되지 않는다.
   */
  onConvertToRecurring: (rule: RecurrenceRule) => void;
  /**
   * Google Calendar 연동 토글 콜백.
   * undefined 이면 섹션을 숨긴다(캘린더 미연결 등).
   */
  onToggleCalendarLink?: () => void;
  /** needsReauth=true 이면 토글을 비활성화하고 재연결 안내를 보인다. */
  calendarNeedsReauth?: boolean;
}

type DetailTab = "content" | "schedule";

const STATUS_ORDER: TaskStatus[] = ["not-start", "in-progress", "done"];

const timeInputStyle: CSSProperties = {
  flex: 1,
  fontSize: 16,
  padding: "11px 14px",
  borderRadius: "var(--r-md)",
  background: "var(--color-tile-3)",
  border: "1px solid var(--color-divider-soft)",
  colorScheme: "dark",
  color: "var(--color-ink)",
};

const eyebrowStyle: CSSProperties = {
  margin: "0 0 8px",
  color: "var(--color-body-muted)",
};

export function TaskDetailPanel({
  todo,
  tagSuggestions = [],
  recentTags = [],
  onClose,
  onUpdate,
  onUpdateFollowing,
  onSetTime,
  onSetTimeFollowing,
  onDelete,
  onUpdateRecurrence,
  onConvertToRecurring,
  onToggleCalendarLink,
  calendarNeedsReauth = false,
}: TaskDetailPanelProps) {
  const [tab, setTab] = useState<DetailTab>("content");
  const [statusOpen, setStatusOpen] = useState(false);
  const [dateOpen, setDateOpen] = useState(false);
  const [deleteScopeOpen, setDeleteScopeOpen] = useState(false);
  const [timeScopeOpen, setTimeScopeOpen] = useState(false);
  const [pendingTime, setPendingTime] = useState<{
    startTime: string | null;
    endTime: string | null;
  } | null>(null);
  const [recurrencePopoverOpen, setRecurrencePopoverOpen] = useState(false);
  // 팝오버가 열려 있는 동안의 편집 중 값 — RecurrencePopover 는 매 조작마다 onChange 를
  // 호출하는 컨트롤드 컴포넌트라, 부모가 draft 로 들고 있다가 닫힐 때만 실제로 전송해야
  // 종료일 입력 같은 다단계 조작 중간에 조기 제출/닫힘이 일어나지 않는다.
  const [draftRecurrenceRule, setDraftRecurrenceRule] = useState<RecurrenceRule | null>(null);
  // 제목/설명/태그 로컬 편집 버퍼 — 반복 항목이면 필드를 벗어날 때(commit)까지 전송을
  // 미루고, 그 시점에 범위(this/following)를 물어본다. 타이핑마다 물어보면 방해되므로
  // "편집 완료" 시점(blur)에만 게이트를 건다. todo.id 가 바뀌면(선택 변경) 이 패널은
  // key={todo.id} 로 통째로 재마운트되므로 아래 초기값은 매번 최신 todo 기준이다.
  const [draftTitle, setDraftTitle] = useState(todo.title);
  const [draftDescription, setDraftDescription] = useState(todo.description ?? "");
  const [draftTags, setDraftTags] = useState(todo.tags);
  // TagEditor 는 onBlur 직전에 onChange 로 마지막 입력을 커밋하는데, 그 직후 실행되는
  // onBlur 콜백은 같은 동기 틱이라 draftTags state 가 아직 리렌더에 반영되지 않은
  // 값(stale closure)을 볼 수 있다 — ref 로 최신값을 즉시 따라가 커밋 시점에 읽는다.
  const draftTagsRef = useRef(todo.tags);
  const [fieldScopeOpen, setFieldScopeOpen] = useState(false);
  const [pendingFieldPatch, setPendingFieldPatch] = useState<Partial<
    Pick<Todo, "title" | "description" | "tags">
  > | null>(null);
  const { t, locale } = useTranslation();
  const d = fromDateKey(todo.dateKey);
  const recurring = isRecurringTodo(todo);

  // 제목/설명/태그 편집을 마쳤을 때(blur) 호출 — 실제로 바뀐 경우에만, 반복 항목이면
  // 범위 선택 다이얼로그를 먼저 띄운다. 비반복 항목은 즉시 onUpdate.
  const commitField = (
    field: "title" | "description" | "tags",
    value: string | string[],
  ) => {
    const unchanged =
      field === "tags"
        ? sameTags(value as string[], todo.tags)
        : value === (field === "title" ? todo.title : (todo.description ?? ""));
    if (unchanged) return;
    const patch = { [field]: value } as Partial<Pick<Todo, "title" | "description" | "tags">>;
    if (!recurring) {
      onUpdate(patch);
      return;
    }
    setPendingFieldPatch(patch);
    setFieldScopeOpen(true);
  };

  // 반복 팝오버를 닫는 모든 경로(완료 클릭/바깥 클릭/헤더 버튼 재클릭)가 여길 거친다 —
  // draft 가 있을 때만(사용자가 실제로 뭔가 편집했을 때만) 전송한다.
  const closeRecurrencePopover = () => {
    if (draftRecurrenceRule) {
      if (todo.isVirtual) onUpdateRecurrence(draftRecurrenceRule);
      else onConvertToRecurring(draftRecurrenceRule);
    }
    setDraftRecurrenceRule(null);
    setRecurrencePopoverOpen(false);
  };

  // 반복 항목이면 범위 선택 다이얼로그를 먼저 띄운다(가이드 권장 UX).
  // 비반복 항목은 기존과 동일하게 즉시 삭제한다.
  const requestDelete = () => {
    if (recurring) {
      setDeleteScopeOpen(true);
      return;
    }
    onDelete();
  };

  // 반복 항목의 시간을 바꿀 때도 삭제와 동일하게 범위 선택 다이얼로그를 먼저 띄운다.
  // 그렇지 않으면 서버가 조용히 "this" 스코프로 처리해 해당 회차의 예외 row 만 하나
  // 생기고(할 일이 늘어난 것처럼 보임) 이후 회차는 시간이 그대로라 반복이 시간을
  // 따라가지 않는 것처럼 보인다 — 사용자가 의도를 직접 고르게 한다.
  const requestSetTime = (startTime: string | null, endTime: string | null) => {
    if (recurring) {
      setPendingTime({ startTime, endTime });
      setTimeScopeOpen(true);
      return;
    }
    onSetTime(startTime, endTime);
  };

  // Delete 키로 작업 삭제 — 단, 입력란(제목/설명/날짜 등)에 포커스가 있을 땐
  // 텍스트 편집을 방해하지 않도록 무시한다.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Delete") return;
      const el = document.activeElement;
      const tag = el?.tagName;
      const editable =
        tag === "INPUT" ||
        tag === "TEXTAREA" ||
        (el as HTMLElement | null)?.isContentEditable;
      if (editable) return;
      e.preventDefault();
      requestDelete();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recurring, onDelete]);

  const STATUS_LABEL: Record<TaskStatus, string> = {
    "not-start": t("todo.col.notStart.ko"),
    "in-progress": t("todo.col.inProgress.ko"),
    done: t("todo.col.done.ko"),
  };

  const TABS: { key: DetailTab; label: string }[] = [
    { key: "content", label: t("calendar.taskDetail.tab.content") },
    { key: "schedule", label: t("calendar.taskDetail.tab.schedule") },
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      {/* Header — 탭 전환과 무관하게 항상 노출 */}
      <div
        style={{
          padding: "20px 24px 0",
          borderBottom: "1px solid var(--color-divider-soft)",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <p
            className="t-eyebrow"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              color: "var(--color-body-muted)",
              margin: 0,
            }}
          >
            {t("calendar.taskDetail.title")}
            {recurring ? (
              <span
                style={{ display: "inline-flex", alignItems: "center", gap: 3 }}
                title={t("todo.card.recurring")}
              >
                <Repeat size={11} />
              </span>
            ) : null}
          </p>
          <div style={{ display: "flex", gap: 4 }}>
            <button
              type="button"
              className="btn-icon detail-delete-btn"
              aria-label={t("calendar.taskDetail.delete")}
              title={t("calendar.taskDetail.delete")}
              onClick={requestDelete}
            >
              <Trash2 size={16} />
            </button>
            <button
              type="button"
              className="btn-icon"
              aria-label="Close"
              onClick={onClose}
            >
              <X size={16} />
            </button>
          </div>
        </div>

        <input
          value={draftTitle}
          onChange={(e) => setDraftTitle(e.target.value)}
          onBlur={() => commitField("title", draftTitle)}
          style={{
            width: "100%",
            marginTop: 12,
            fontSize: 20,
            fontFamily: "var(--font-display)",
            fontWeight: 600,
            padding: "10px 0",
            letterSpacing: "-0.02em",
            color: "var(--color-ink)",
            borderBottom: "1px solid transparent",
          }}
        />

        <p
          style={{
            margin: "4px 0 0",
            fontSize: 12,
            color: "var(--color-body-muted)",
          }}
        >
          {formatFullDate(d, locale)}
        </p>

        <div style={{ display: "flex", gap: 4, marginTop: 16 }}>
          {TABS.map(({ key, label }) => (
            <button
              key={key}
              type="button"
              onClick={() => setTab(key)}
              style={{
                padding: "8px 14px",
                borderRadius: "var(--r-md) var(--r-md) 0 0",
                fontSize: 16,
                fontWeight: tab === key ? 500 : 400,
                color: tab === key ? "var(--color-ink)" : "var(--color-body-muted)",
                background: tab === key ? "var(--color-tile-3)" : "transparent",
                border: "none",
                borderBottom: "2px solid " + (tab === key ? "var(--color-primary)" : "transparent"),
                cursor: "pointer",
              }}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div
        style={{
          flex: 1,
          overflow: "auto",
          padding: "20px 24px 24px",
          display: "flex",
          flexDirection: "column",
          gap: 18,
        }}
      >
        {tab === "content" ? (
          <>
            {/* Status */}
            <div>
              <p className="t-eyebrow" style={eyebrowStyle}>
                {t("calendar.taskDetail.status")}
              </p>
              <div style={{ position: "relative" }}>
                <button
                  type="button"
                  onClick={() => setStatusOpen((o) => !o)}
                  style={{
                    width: "100%",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    padding: "12px 14px",
                    borderRadius: "var(--r-md)",
                    background: "var(--color-tile-3)",
                    border: "1px solid var(--color-divider-soft)",
                    color: "var(--color-ink)",
                    fontSize: 16,
                  }}
                >
                  <span
                    style={{
                      display: "inline-flex",
                      gap: 8,
                      alignItems: "center",
                    }}
                  >
                    <StatusIcon status={todo.status} size={16} />
                    {STATUS_LABEL[todo.status]}
                  </span>
                  <ChevronDown size={14} />
                </button>

                {statusOpen ? (
                  <div
                    style={{
                      marginTop: 6,
                      borderRadius: "var(--r-md)",
                      background: "var(--color-tile-3)",
                      border: "1px solid var(--color-divider-soft)",
                      overflow: "hidden",
                    }}
                  >
                    {STATUS_ORDER.map((s) => (
                      <button
                        key={s}
                        type="button"
                        onClick={() => {
                          onUpdate({ status: s });
                          setStatusOpen(false);
                        }}
                        style={{
                          width: "100%",
                          textAlign: "left",
                          display: "flex",
                          gap: 8,
                          alignItems: "center",
                          padding: "10px 14px",
                          fontSize: 16,
                          color: "var(--color-ink)",
                          background:
                            todo.status === s
                              ? "var(--color-tile-2)"
                              : "transparent",
                        }}
                      >
                        <StatusIcon status={s} size={14} />
                        {STATUS_LABEL[s]}
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>
            </div>

            {/* Tags */}
            <div>
              <p className="t-eyebrow" style={eyebrowStyle}>
                {t("todo.tag.title")}
              </p>
              <div
                style={{
                  padding: "8px 10px",
                  borderRadius: "var(--r-md)",
                  background: "var(--color-tile-3)",
                  border: "1px solid var(--color-divider-soft)",
                }}
              >
                <TagEditor
                  tags={draftTags}
                  suggestions={tagSuggestions}
                  recentTags={recentTags}
                  onChange={(tags) => {
                    draftTagsRef.current = tags;
                    setDraftTags(tags);
                    commitField("tags", tags);
                  }}
                  onBlur={() => commitField("tags", draftTagsRef.current)}
                />
              </div>
            </div>

            {/* Description */}
            <div>
              <p className="t-eyebrow" style={eyebrowStyle}>
                {t("calendar.taskDetail.description")}
              </p>
              <textarea
                value={draftDescription}
                onChange={(e) => setDraftDescription(e.target.value)}
                onBlur={() => commitField("description", draftDescription)}
                className="editor-area"
                style={{ minHeight: 220, fontSize: 16 }}
                placeholder={t("calendar.taskDetail.descPlaceholder")}
              />
            </div>
          </>
        ) : (
          <>
            {/* Date */}
            <div>
              <p className="t-eyebrow" style={eyebrowStyle}>
                {t("calendar.taskDetail.date")}
              </p>
              <div style={{ position: "relative" }}>
                <button
                  type="button"
                  onClick={() => setDateOpen((o) => !o)}
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
                  <span
                    style={{ display: "inline-flex", gap: 8, alignItems: "center" }}
                  >
                    <CalendarDays size={15} />
                    {todo.dateKey}
                  </span>
                  <ChevronDown size={14} />
                </button>

                {dateOpen ? (
                  <DatePickerPopover
                    value={todo.dateKey}
                    anchorRight={false}
                    onChange={(v) => {
                      onUpdate({ dateKey: v });
                      setDateOpen(false);
                    }}
                    onClose={() => setDateOpen(false)}
                  />
                ) : null}
              </div>
            </div>

            {/*
              Recurrence:
              - isVirtual → 이 회차부터 이후 반복 규칙 변경 (recurrence_scope: following)
              - 비반복 단독 항목(!recurring) → 반복 시리즈로 전환
              - 예외 row(seriesId 있음, !isVirtual) → 서버가 둘 다 지원하지 않아 섹션 숨김
            */}
            {todo.isVirtual || !recurring ? (
              <div>
                <p className="t-eyebrow" style={eyebrowStyle}>
                  {t("todo.recurrence.title")}
                </p>
                <div style={{ position: "relative" }}>
                  <button
                    type="button"
                    onClick={() => {
                      if (recurrencePopoverOpen) {
                        closeRecurrencePopover();
                        return;
                      }
                      // 기본값(매일 반복, 종료일 없음)으로 미리 채워 둔다 — 아무 것도
                      // 건드리지 않고 바로 "완료"를 눌러도 그 기본값으로 제출되도록.
                      setDraftRecurrenceRule(DEFAULT_RECURRENCE_RULE);
                      setRecurrencePopoverOpen(true);
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
                      <Repeat size={15} />
                      {t(todo.isVirtual ? "todo.recurrence.detail.summary" : "todo.recurrence.detail.convert")}
                    </span>
                    <ChevronDown size={14} />
                  </button>

                  {recurrencePopoverOpen ? (
                    <RecurrencePopover
                      value={draftRecurrenceRule}
                      showOffOption={false}
                      onChange={setDraftRecurrenceRule}
                      onClose={closeRecurrencePopover}
                    />
                  ) : null}
                </div>
                <p
                  style={{
                    margin: "8px 0 0",
                    fontSize: 12,
                    lineHeight: 1.5,
                    color: "var(--color-body-muted)",
                  }}
                >
                  {t(todo.isVirtual ? "todo.recurrence.detail.hint" : "todo.recurrence.detail.convertHint")}
                </p>
              </div>
            ) : null}

            {/* Time (optional) */}
            <div>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  margin: "0 0 8px",
                }}
              >
                <p className="t-eyebrow" style={{ margin: 0, color: "var(--color-body-muted)" }}>
                  {t("calendar.taskDetail.time")}
                </p>
                {todo.startTime || todo.endTime ? (
                  <button
                    type="button"
                    onClick={() => requestSetTime(null, null)}
                    style={{
                      fontSize: 12,
                      color: "var(--color-primary-on-dark)",
                      background: "transparent",
                      border: "none",
                      cursor: "pointer",
                      padding: 0,
                    }}
                  >
                    {t("calendar.taskDetail.clearTime")}
                  </button>
                ) : null}
              </div>
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <input
                  type="time"
                  aria-label={t("calendar.taskDetail.startTime")}
                  value={todo.startTime ?? ""}
                  onChange={(e) =>
                    requestSetTime(e.target.value || null, todo.endTime ?? null)
                  }
                  style={timeInputStyle}
                />
                <span style={{ color: "var(--color-body-muted)", fontSize: 16 }}>–</span>
                <input
                  type="time"
                  aria-label={t("calendar.taskDetail.endTime")}
                  value={todo.endTime ?? ""}
                  onChange={(e) =>
                    requestSetTime(todo.startTime ?? null, e.target.value || null)
                  }
                  style={timeInputStyle}
                />
              </div>
              <p
                style={{
                  margin: "8px 0 0",
                  fontSize: 12,
                  lineHeight: 1.5,
                  color: "var(--color-body-muted)",
                }}
              >
                {t("calendar.taskDetail.timeHint")}
              </p>
            </div>

            {/* Google Calendar 연동 섹션 — "일정" 탭으로 이동 */}
            {onToggleCalendarLink !== undefined && (
              <div>
                <p className="t-eyebrow" style={eyebrowStyle}>
                  Google Calendar
                </p>
                {calendarNeedsReauth ? (
                  <div
                    style={{
                      padding: "10px 14px",
                      background: "var(--color-warn-subtle, rgba(234,179,8,.1))",
                      border: "1px solid var(--color-warn, #ca8a04)",
                      borderRadius: "var(--r-sm)",
                      fontSize: 12,
                      color: "var(--color-body-muted)",
                    }}
                  >
                    {t("calendar.taskDetail.calendarReauth")}
                  </div>
                ) : (
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <button
                      type="button"
                      onClick={onToggleCalendarLink}
                      className="btn btn-utility"
                      style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 16 }}
                    >
                      {todo.calendarLinked ? (
                        <CalendarMinus size={14} />
                      ) : (
                        <CalendarPlus size={14} />
                      )}
                      {todo.calendarLinked
                        ? t("calendar.taskDetail.calendarLinkRemove")
                        : t("calendar.taskDetail.calendarLinkAdd")}
                    </button>
                    {todo.calendarPushStatus === "pending" || todo.calendarPushStatus === "syncing" ? (
                      <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 12, color: "var(--color-body-muted)" }}>
                        <Loader size={11} style={{ animation: "summary-spin 900ms linear infinite" }} />
                        {t(`calendar.taskDetail.calendarStatus.${todo.calendarPushStatus}`)}
                      </span>
                    ) : todo.calendarPushStatus === "synced" ? (
                      <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 12, color: "var(--color-status-done, #22c55e)" }}>
                        <CheckCircle2 size={11} />
                        {t("calendar.taskDetail.calendarStatus.synced")}
                      </span>
                    ) : todo.calendarPushStatus === "failed" ? (
                      <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 12, color: "var(--color-warn, #ca8a04)" }}>
                        <AlertTriangle size={11} />
                        {t("calendar.taskDetail.calendarStatus.failed")}
                      </span>
                    ) : todo.calendarPushStatus === "pending_delete" ? (
                      <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 12, color: "var(--color-body-muted)" }}>
                        <CalendarDays size={11} />
                        {t("calendar.taskDetail.calendarStatus.pending_delete")}
                      </span>
                    ) : null}
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>

      <RecurrenceScopeDialog
        open={deleteScopeOpen}
        title={t("todo.recurrence.deleteTitle")}
        scopes={["this", "following", "all"]}
        onChoose={(scope) => {
          setDeleteScopeOpen(false);
          onDelete(scope);
        }}
        onCancel={() => setDeleteScopeOpen(false)}
      />

      <RecurrenceScopeDialog
        open={timeScopeOpen}
        title={t("todo.recurrence.timeTitle")}
        scopes={["this", "following"]}
        onChoose={(scope) => {
          setTimeScopeOpen(false);
          if (!pendingTime) return;
          const { startTime, endTime } = pendingTime;
          setPendingTime(null);
          if (scope === "following") onSetTimeFollowing(startTime, endTime);
          else onSetTime(startTime, endTime);
        }}
        onCancel={() => {
          setTimeScopeOpen(false);
          setPendingTime(null);
        }}
      />

      <RecurrenceScopeDialog
        open={fieldScopeOpen}
        title={t("todo.recurrence.fieldTitle")}
        scopes={["this", "following"]}
        onChoose={(scope) => {
          setFieldScopeOpen(false);
          if (!pendingFieldPatch) return;
          const patch = pendingFieldPatch;
          setPendingFieldPatch(null);
          if (scope === "following") onUpdateFollowing(patch);
          else onUpdate(patch);
        }}
        onCancel={() => {
          setFieldScopeOpen(false);
          if (!pendingFieldPatch) return;
          if (pendingFieldPatch.title !== undefined) setDraftTitle(todo.title);
          if (pendingFieldPatch.description !== undefined) {
            setDraftDescription(todo.description ?? "");
          }
          if (pendingFieldPatch.tags !== undefined) {
            setDraftTags(todo.tags);
            draftTagsRef.current = todo.tags;
          }
          setPendingFieldPatch(null);
        }}
      />
    </div>
  );
}
```

(`ArrowRight`, `Sparkles` import와 AI 회고 JSX 블록, `onGoToRetro` prop이 삭제되었음을 확인.)

- [ ] **Step 4: `CalendarDashboard.tsx`에서 `onGoToRetro`/`onNavigate` 제거**

`my-app/src/widgets/calendar-dashboard/ui/CalendarDashboard.tsx`에서:

1행의 `import type { AppRoute } from "@/app/model/types";`를 삭제.

```tsx
export interface CalendarDashboardProps {
  onNavigate: (route: AppRoute) => void;
}

export function CalendarDashboard({ onNavigate }: CalendarDashboardProps) {
```

를

```tsx
export function CalendarDashboard() {
```

로 교체(`CalendarDashboardProps` 인터페이스 자체 삭제, 함수는 무인자).

`TaskDetailPanel`에 넘기던 다음 블록을 삭제:

```tsx
            onGoToRetro={() => {
              onNavigate("retrospectives");
              setSelectedId(null);
            }}
```

- [ ] **Step 5: `CalendarPage.tsx`를 무인자 pass-through로 축소**

`my-app/src/pages/calendar/ui/CalendarPage.tsx` 전체를 다음으로 교체:

```tsx
import { CalendarDashboard } from "@/widgets/calendar-dashboard";

export function CalendarPage() {
  return <CalendarDashboard />;
}
```

- [ ] **Step 6: `TodoBoard.tsx`에서 `onGoToRetro`/`onNavigate` 임시 제거 (전체 재작성은 Task 7)**

`my-app/src/widgets/todo-board/ui/TodoBoard.tsx`에서 최소한으로:

1행의 `import type { AppRoute } from "@/app/model/types";`를 삭제.

```tsx
export interface TodoBoardProps {
  onNavigate: (route: AppRoute) => void;
}

export function TodoBoard({ onNavigate }: TodoBoardProps) {
```

를

```tsx
export function TodoBoard() {
```

로 교체.

`TaskDetailPanel`에 넘기던 다음 블록을 삭제:

```tsx
            onGoToRetro={() => {
              onNavigate("retrospectives");
              setSelectedId(null);
            }}
```

(이 파일은 Task 7에서 레이아웃까지 통째로 다시 쓰므로 지금은 빌드만 통과시키는 최소 수정이다.)

- [ ] **Step 7: `TodosPage.tsx`를 무인자 pass-through로 축소**

`my-app/src/pages/todos/ui/TodosPage.tsx` 전체를 다음으로 교체:

```tsx
import { TodoBoard } from "@/widgets/todo-board";

export function TodosPage() {
  return <TodoBoard />;
}
```

- [ ] **Step 8: `App.tsx`에서 `CalendarPage`/`TodosPage`에 넘기던 `onNavigate` 제거**

`my-app/src/app/App.tsx`의 `pages` 맵(약 279~288행)에서:

```tsx
  const pages = useMemo(
    () => ({
      dashboard: <DashboardPage onNavigate={onNavigate} />,
      calendar: <CalendarPage onNavigate={onNavigate} />,
      todos: <TodosPage onNavigate={onNavigate} />,
      retrospectives: <RetrospectivesPage retroParams={retroParams} onRetroNavigate={onRetroNavigate} />,
      settings: <SettingsPage />,
    }),
    [onNavigate, onRetroNavigate, retroParams],
  );
```

를

```tsx
  const pages = useMemo(
    () => ({
      dashboard: <DashboardPage onNavigate={onNavigate} />,
      calendar: <CalendarPage />,
      todos: <TodosPage />,
      retrospectives: <RetrospectivesPage retroParams={retroParams} onRetroNavigate={onRetroNavigate} />,
      settings: <SettingsPage />,
    }),
    [onNavigate, onRetroNavigate, retroParams],
  );
```

로 교체한다(`onNavigate`는 `DashboardPage`와 `AppShell`(292행)에 여전히 필요하므로 `useMemo` deps와 함수 시그니처는 그대로 둔다 — `AppContent`의 `onNavigate` prop 자체는 삭제하지 않는다).

- [ ] **Step 9: 빌드 검증**

```bash
cd my-app && pnpm build
```

Expected: 타입 에러 없이 성공(`tsc -b && vite build`). `onGoToRetro`/`onNavigate`/`AppRoute` 관련 미사용 변수 에러가 없어야 한다.

- [ ] **Step 10: 브라우저 수동 확인 (Task 7 전이라 레이아웃은 기존 칸반/오버레이 그대로임에 유의)**

`run` 스킬로 dev 서버를 띄운 뒤:
1. 캘린더 탭에서 아무 할 일이나 클릭 → 우측 오버레이 패널에 "내용"/"일정" 탭이 보이고, 탭 전환이 동작하는지 확인.
2. "일정" 탭에 Google Calendar 섹션이 보이는지 확인(캘린더 연동 상태에 따라).
3. AI 자동 회고 카드가 어디에도 보이지 않는지 확인.
4. 할 일 탭에서도 동일하게 확인(레이아웃은 아직 기존 칸반+오버레이).

- [ ] **Step 11: Commit**

```bash
git add my-app/src/entities/todo/ui/TaskDetailPanel.tsx \
        my-app/src/shared/lib/i18n/keys.ts \
        my-app/src/shared/lib/i18n/locales/en.ts \
        my-app/src/shared/lib/i18n/locales/ko.ts \
        my-app/src/shared/lib/i18n/locales/ja.ts \
        my-app/src/shared/lib/i18n/locales/zh.ts \
        my-app/src/widgets/calendar-dashboard/ui/CalendarDashboard.tsx \
        my-app/src/pages/calendar/ui/CalendarPage.tsx \
        my-app/src/widgets/todo-board/ui/TodoBoard.tsx \
        my-app/src/pages/todos/ui/TodosPage.tsx \
        my-app/src/app/App.tsx
git commit -m "refactor: split task detail panel into tabs and remove AI auto-retro UI"
```

---

### Task 2: `todo-board/model/constants.ts`에 `StatusFilter` 타입 추가

기존 칸반 관련 export(`COLS`, `KanbanColumnConfig`, `KANBAN_DRAG_KIND`)는 아직 `KanbanCard.tsx`/`KanbanColumn.tsx`가 쓰고 있으므로 이 태스크에서는 건드리지 않고 **추가만** 한다(칸반 관련 제거는 Task 7에서 그 소비자들과 함께 처리).

**Files:**
- Modify: `my-app/src/widgets/todo-board/model/constants.ts`

**Interfaces:**
- Produces: `StatusFilter = "all" | TaskStatus` — Task 3(`useTodoListFilter`), Task 5(`TodoStatusFilterRow`)에서 사용.

- [ ] **Step 1: 파일 끝에 타입 추가**

`my-app/src/widgets/todo-board/model/constants.ts` 파일 끝(`DateFilter` 타입 정의 다음)에 추가:

```ts

/** Status filter chip selection — "all" shows every status, others narrow to one. */
export type StatusFilter = "all" | TaskStatus;
```

(`TaskStatus`는 이미 파일 상단에서 `import type { TaskStatus } from "@/entities/todo/model/types";`로 임포트돼 있으므로 추가 임포트 불필요.)

- [ ] **Step 2: 빌드 검증**

```bash
cd my-app && pnpm build
```

Expected: 성공(순수 타입 추가라 기존 동작에 영향 없음).

- [ ] **Step 3: Commit**

```bash
git add my-app/src/widgets/todo-board/model/constants.ts
git commit -m "feat: add StatusFilter type for todo list status filtering"
```

---

### Task 3: `useTodoListFilter` 훅 신규 추가

`useKanbanFilter.ts`를 대체할 새 훅. 날짜 필터 + 상태 필터를 적용하고, 상태별로 그룹된 플랫 리스트(각 행에 "이 행이 상태 그룹의 첫 행인지" 플래그 포함)를 만든다. 기존 `useKanbanFilter.ts`는 아직 `TodoBoard.tsx`가 쓰고 있으므로 삭제하지 않는다(Task 7에서 삭제).

**Files:**
- Create: `my-app/src/widgets/todo-board/model/useTodoListFilter.ts`

**Interfaces:**
- Consumes: `getVisibleBoardTodos(todos: Todo[]): Todo[]`(`@/entities/todo/lib/selectors`), `readTodoBoardFilter()`/`writeTodoBoardFilter(filter)`(`./todoFilterPrefs`), `DateFilter`/`StatusFilter`(`./constants`).
- Produces: `useTodoListFilter(todos: Todo[], rangeDays: number): { filter: DateFilter; setFilter: (next: DateFilter) => void; statusFilter: StatusFilter; setStatusFilter: (next: StatusFilter) => void; todayK: string; counts: Record<StatusFilter, number>; entries: TodoListEntry[] }` — Task 7(`TodoBoard.tsx`)에서 이 정확한 시그니처로 소비한다. `TodoListEntry = { todo: Todo; showHeader: boolean }`.

- [ ] **Step 1: 파일 작성**

```ts
import { useCallback, useEffect, useMemo, useState } from "react";
import { getVisibleBoardTodos } from "@/entities/todo/lib/selectors";
import type { TaskStatus, Todo } from "@/entities/todo/model/types";
import {
  addDays,
  endOfWeek,
  fromDateKey,
  startOfWeek,
  toDateKey,
} from "@/shared/lib/date";
import type { DateFilter, StatusFilter } from "./constants";
import { readTodoBoardFilter, writeTodoBoardFilter } from "./todoFilterPrefs";

/** One row in the flat, status-grouped todo list. */
export interface TodoListEntry {
  todo: Todo;
  /** True when this row is the first of its status group (sticky header goes above it). */
  showHeader: boolean;
}

const STATUS_ORDER: TaskStatus[] = ["not-start", "in-progress", "done"];

function compareByStatusThenDate(a: Todo, b: Todo): number {
  const byStatus = STATUS_ORDER.indexOf(a.status) - STATUS_ORDER.indexOf(b.status);
  if (byStatus !== 0) return byStatus;
  if (a.dateKey !== b.dateKey) return a.dateKey < b.dateKey ? -1 : 1;
  const ta = a.startTime ?? "￿";
  const tb = b.startTime ?? "￿";
  if (ta !== tb) return ta < tb ? -1 : 1;
  return a.id.localeCompare(b.id);
}

/**
 * Manages the Todo split-view's date filter + status filter and produces a
 * flat, status-grouped list of rows (replaces the 3-column kanban grouping
 * from `useKanbanFilter`).
 *
 * `rangeDays` 는 "전체" 필터에서 오늘 기준 앞뒤로 나눠 표시할 기간(일)이다.
 *
 * Also ticks once a minute so the 24h-after-done auto-hide updates
 * without requiring a manual refresh.
 */
export function useTodoListFilter(todos: Todo[], rangeDays: number) {
  // 마지막으로 고른 기간 필터를 localStorage 에서 복원한다(페이지 재진입 시 유지).
  // 상태 필터는 세션 내에서만 유지한다(영속화하지 않음).
  const [filter, setFilterState] = useState<DateFilter>(readTodoBoardFilter);
  const setFilter = useCallback((next: DateFilter) => {
    setFilterState(next);
    writeTodoBoardFilter(next);
  }, []);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");

  const [, forceTick] = useState(0);
  useEffect(() => {
    const id = window.setInterval(() => forceTick((n) => n + 1), 60 * 1000);
    return () => window.clearInterval(id);
  }, []);

  const today = new Date();
  const todayK = toDateKey(today);

  const dateFiltered = useMemo(() => {
    const visible = getVisibleBoardTodos(todos);
    if (filter.kind === "all") {
      // 오늘 기준 앞뒤로 rangeDays 를 나눈 윈도우 안의 할 일만 표시한다.
      const back = Math.floor(rangeDays / 2);
      const fwd = rangeDays - back;
      const lo = addDays(today, -back).getTime();
      const hi = addDays(today, fwd).getTime();
      return visible.filter((t) => {
        const x = fromDateKey(t.dateKey).getTime();
        return x >= lo && x <= hi;
      });
    }
    if (filter.kind === "today")
      return visible.filter((t) => t.dateKey === todayK);
    if (filter.kind === "week") {
      const ws = startOfWeek(today).getTime();
      const we = endOfWeek(today).getTime();
      return visible.filter((t) => {
        const x = fromDateKey(t.dateKey).getTime();
        return x >= ws && x <= we;
      });
    }
    return visible.filter((t) => t.dateKey === filter.dateKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [todos, filter, todayK, rangeDays]);

  // 날짜 필터만 적용된 집합 기준 개수 — 상태 필터를 바꿔도 다른 pill 의 개수는 변하지 않는다.
  const counts = useMemo(() => {
    const c: Record<StatusFilter, number> = {
      all: 0,
      "not-start": 0,
      "in-progress": 0,
      done: 0,
    };
    for (const t of dateFiltered) {
      c.all += 1;
      c[t.status] += 1;
    }
    return c;
  }, [dateFiltered]);

  const entries = useMemo<TodoListEntry[]>(() => {
    const scoped =
      statusFilter === "all"
        ? dateFiltered
        : dateFiltered.filter((t) => t.status === statusFilter);
    const sorted = [...scoped].sort(compareByStatusThenDate);
    let last: TaskStatus | null = null;
    return sorted.map((todo) => {
      const showHeader = todo.status !== last;
      last = todo.status;
      return { todo, showHeader };
    });
  }, [dateFiltered, statusFilter]);

  return { filter, setFilter, statusFilter, setStatusFilter, todayK, counts, entries };
}
```

- [ ] **Step 2: 빌드 검증**

```bash
cd my-app && pnpm build
```

Expected: 성공. 이 시점에는 아직 아무도 `useTodoListFilter`를 import하지 않지만(TodoBoard.tsx는 여전히 useKanbanFilter 사용), 새 파일 자체가 독립적으로 타입 체크를 통과해야 한다.

- [ ] **Step 3: Commit**

```bash
git add my-app/src/widgets/todo-board/model/useTodoListFilter.ts
git commit -m "feat: add useTodoListFilter hook for status-grouped todo list"
```

---

### Task 4: `TodoListRow` 컴포넌트 신규 추가

`KanbanCard.tsx`를 대체할 얇은 리스트 행 컴포넌트. 드래그 핸들 없음, 대신 선택 상태(`isSelected`) 표시를 갖는다. 기존 상태 3단계 순환("advance") 동작과 인라인 태그 편집 팝오버는 `KanbanCard`와 동일하게 유지한다.

**Files:**
- Create: `my-app/src/widgets/todo-board/ui/TodoListRow.tsx`

**Interfaces:**
- Consumes: `isRecurringTodo(todo)`(`@/entities/todo/lib/selectors`), `tagColor(tag)`(`@/entities/todo/lib/tagColor`), `StatusIcon`, `TagEditor`(`@/entities/todo/ui/*`).
- Produces: `TodoListRow` 컴포넌트, props `{ todo: Todo; isSelected: boolean; allTags: string[]; recentTags: string[]; onUpdate: (id: string, patch: Partial<Pick<Todo,"title"|"status"|"description"|"dateKey"|"tags">>) => void; onSelect: (id: string) => void }` — Task 7(`TodoBoard.tsx`)에서 이 시그니처로 렌더링한다.

- [ ] **Step 1: 파일 작성**

```tsx
import { memo, useState } from "react";
import { AlignLeft, CalendarDays, Repeat, Tag } from "lucide-react";
import type { TaskStatus, Todo } from "@/entities/todo/model/types";
import { isRecurringTodo } from "@/entities/todo/lib/selectors";
import { tagColor } from "@/entities/todo/lib/tagColor";
import { StatusIcon } from "@/entities/todo/ui/StatusIcon";
import { TagEditor } from "@/entities/todo/ui/TagEditor";
import { useTranslation } from "@/shared/lib/i18n";

export interface TodoListRowProps {
  todo: Todo;
  isSelected: boolean;
  /** 자동완성 검색 후보 — 보드에 로드된 다른 할 일들의 태그 전체. */
  allTags: string[];
  /** 자동완성 "최근 사용" 후보 — 최신순으로 미리 정렬돼 온다. */
  recentTags: string[];
  onUpdate: (
    id: string,
    patch: Partial<Pick<Todo, "title" | "status" | "description" | "dateKey" | "tags">>,
  ) => void;
  onSelect: (id: string) => void;
}

function TodoListRowImpl({ todo, isSelected, allTags, recentTags, onUpdate, onSelect }: TodoListRowProps) {
  const { t } = useTranslation();
  const [tagPopoverOpen, setTagPopoverOpen] = useState(false);
  const isDone = todo.status === "done";

  const advance = () => {
    const next: TaskStatus =
      todo.status === "not-start"
        ? "in-progress"
        : todo.status === "in-progress"
          ? "done"
          : "not-start";
    onUpdate(todo.id, { status: next });
  };

  const timeLabel = todo.startTime
    ? todo.endTime
      ? `${todo.startTime}–${todo.endTime}`
      : todo.startTime
    : null;

  return (
    <div
      className="todo-list-row"
      data-status={todo.status}
      data-selected={isSelected ? "true" : undefined}
      onClick={() => onSelect(todo.id)}
    >
      <button
        type="button"
        className="todo-list-row-status-btn"
        onClick={(e) => {
          e.stopPropagation();
          advance();
        }}
        title={t("todo.card.advance")}
      >
        <StatusIcon status={todo.status} size={15} />
      </button>

      <div className="todo-list-row-body">
        <div className="todo-list-row-top">
          <p className="todo-list-row-title" data-done={isDone ? "true" : undefined}>
            {todo.title}
          </p>
          {isRecurringTodo(todo) ? (
            <Repeat
              className="todo-list-row-notes"
              size={13}
              aria-label={t("todo.card.recurring")}
            />
          ) : null}
          {todo.description ? (
            <AlignLeft
              className="todo-list-row-notes"
              size={13}
              aria-label={t("todo.card.hasNotes")}
            />
          ) : null}
        </div>

        <div className="todo-list-row-meta">
          <span className="todo-list-row-date">
            <CalendarDays size={11} />
            {todo.dateKey}
          </span>
          {timeLabel ? <span className="todo-list-row-time">{timeLabel}</span> : null}

          {todo.tags.map((tag) => (
            <span key={tag} className="tag-chip">
              <span className="tag-chip-dot" style={{ background: tagColor(tag) }} />
              {tag}
            </span>
          ))}

          <div
            className="todo-list-row-tag-anchor"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              className="todo-list-row-tag-add"
              aria-label={t("todo.tag.add")}
              onClick={() => setTagPopoverOpen((o) => !o)}
            >
              <Tag size={11} />
            </button>
            {tagPopoverOpen ? (
              <>
                <div
                  onClick={() => setTagPopoverOpen(false)}
                  style={{ position: "fixed", inset: 0, zIndex: 30 }}
                />
                <div className="todo-list-row-tag-popover">
                  <TagEditor
                    tags={todo.tags}
                    suggestions={allTags}
                    recentTags={recentTags}
                    onChange={(tags) => onUpdate(todo.id, { tags })}
                    autoFocus
                  />
                </div>
              </>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Memoized to avoid re-rendering every row when only one
 * todo in the list changes.
 */
export const TodoListRow = memo(TodoListRowImpl);
```

- [ ] **Step 2: 빌드 검증**

```bash
cd my-app && pnpm build
```

Expected: 성공. `.todo-list-row*` CSS 클래스는 Task 8에서 추가되므로 이 시점엔 스타일 없이도 타입 체크만 통과하면 된다.

- [ ] **Step 3: Commit**

```bash
git add my-app/src/widgets/todo-board/ui/TodoListRow.tsx
git commit -m "feat: add TodoListRow component for split-view todo list"
```

---

### Task 5: `TodoRangeFilterRow` + `TodoStatusFilterRow` 신규 추가

기존 `TodoFilterRow.tsx`(날짜 필터: 전체/오늘/이번주/날짜선택/해제)를 이름만 `TodoRangeFilterRow`로 바꿔 새 파일로 만들고(기존 `TodoFilterRow.tsx`는 Task 7까지 그대로 둔다 — 아직 `TodoBoard.tsx`가 쓰고 있음), 상태 필터(전체/시작전/진행중/완료 + 개수)를 보여주는 `TodoStatusFilterRow`를 신규 추가한다.

**Files:**
- Create: `my-app/src/widgets/todo-board/ui/TodoRangeFilterRow.tsx`
- Create: `my-app/src/widgets/todo-board/ui/TodoStatusFilterRow.tsx`

**Interfaces:**
- Consumes: `DateFilter`, `StatusFilter`(`../model/constants`), `DatePickerPopover`(`@/entities/todo/ui/DatePickerPopover`).
- Produces: `TodoRangeFilterRow` props `{ filter: DateFilter; onChange: (next: DateFilter) => void; todayKey: string }`(기존 `TodoFilterRow`와 동일 시그니처). `TodoStatusFilterRow` props `{ value: StatusFilter; onChange: (next: StatusFilter) => void; counts: Record<StatusFilter, number> }` — 둘 다 Task 7(`TodoBoard.tsx`)에서 이 시그니처로 렌더링한다.

- [ ] **Step 1: `TodoRangeFilterRow.tsx` 작성**

```tsx
import { useRef, useState } from "react";
import { CalendarDays } from "lucide-react";
import { DatePickerPopover } from "@/entities/todo/ui/DatePickerPopover";
import { useTranslation } from "@/shared/lib/i18n";
import type { DateFilter } from "../model/constants";

export interface TodoRangeFilterRowProps {
  filter: DateFilter;
  onChange: (next: DateFilter) => void;
  todayKey: string;
}

/**
 * `[전체][오늘][이번 주][날짜 선택]` 날짜 필터 칩 행 — 리스트 상단에 위치.
 */
export function TodoRangeFilterRow({ filter, onChange, todayKey }: TodoRangeFilterRowProps) {
  const { t } = useTranslation();
  const [filterDateOpen, setFilterDateOpen] = useState(false);
  const filterDateAnchor = useRef<HTMLDivElement | null>(null);

  return (
    <div className="todo-filter-row">
      <button
        type="button"
        className="todo-filter-btn"
        data-active={filter.kind === "all"}
        onClick={() => onChange({ kind: "all" })}
      >
        {t("todo.filter.all")}
      </button>
      <button
        type="button"
        className="todo-filter-btn"
        data-active={filter.kind === "today"}
        onClick={() => onChange({ kind: "today" })}
      >
        {t("todo.filter.today")}
      </button>
      <button
        type="button"
        className="todo-filter-btn"
        data-active={filter.kind === "week"}
        onClick={() => onChange({ kind: "week" })}
      >
        {t("todo.filter.thisWeek")}
      </button>
      <div className="todo-filter-date-wrap" ref={filterDateAnchor}>
        <button
          type="button"
          className="todo-filter-btn"
          data-active={filter.kind === "specific"}
          onClick={() => setFilterDateOpen((v) => !v)}
        >
          <CalendarDays size={11} />
          {filter.kind === "specific"
            ? filter.dateKey
            : t("todo.filter.pickDate")}
        </button>
        {filterDateOpen ? (
          <DatePickerPopover
            value={filter.kind === "specific" ? filter.dateKey : todayKey}
            onChange={(v) => {
              onChange({ kind: "specific", dateKey: v });
              setFilterDateOpen(false);
            }}
            onClose={() => setFilterDateOpen(false)}
            anchorRight={false}
          />
        ) : null}
      </div>
      {filter.kind !== "all" ? (
        <button
          type="button"
          className="todo-filter-btn"
          onClick={() => onChange({ kind: "all" })}
        >
          {t("todo.filter.clear")}
        </button>
      ) : null}
    </div>
  );
}
```

- [ ] **Step 2: `TodoStatusFilterRow.tsx` 작성**

```tsx
import { useTranslation } from "@/shared/lib/i18n";
import type { StatusFilter } from "../model/constants";

export interface TodoStatusFilterRowProps {
  value: StatusFilter;
  onChange: (next: StatusFilter) => void;
  counts: Record<StatusFilter, number>;
}

const ORDER: StatusFilter[] = ["all", "not-start", "in-progress", "done"];

/**
 * `[전체][시작 전][진행 중][완료]` 상태 필터 칩 행(개수 포함) — 날짜 필터 바로 아래에 위치.
 */
export function TodoStatusFilterRow({ value, onChange, counts }: TodoStatusFilterRowProps) {
  const { t } = useTranslation();
  const LABEL: Record<StatusFilter, string> = {
    all: t("todo.filter.all"),
    "not-start": t("todo.col.notStart.ko"),
    "in-progress": t("todo.col.inProgress.ko"),
    done: t("todo.col.done.ko"),
  };

  return (
    <div className="todo-filter-row todo-status-filter-row">
      {ORDER.map((key) => (
        <button
          key={key}
          type="button"
          className="todo-filter-btn"
          data-active={value === key}
          onClick={() => onChange(key)}
        >
          {LABEL[key]}
          <span className="todo-filter-btn-count">{counts[key]}</span>
        </button>
      ))}
    </div>
  );
}
```

- [ ] **Step 3: 빌드 검증**

```bash
cd my-app && pnpm build
```

Expected: 성공.

- [ ] **Step 4: Commit**

```bash
git add my-app/src/widgets/todo-board/ui/TodoRangeFilterRow.tsx \
        my-app/src/widgets/todo-board/ui/TodoStatusFilterRow.tsx
git commit -m "feat: add TodoRangeFilterRow and TodoStatusFilterRow components"
```

---

### Task 6: `TodoDetailPane` 컴포넌트 신규 추가 + i18n 빈 상태 문구

분할 뷰 우측 컬럼 래퍼. `todo`가 선택되지 않았을 때는 빈 상태 안내를, 선택됐을 때는 `TaskDetailPanel`을 렌더링한다.

**Files:**
- Create: `my-app/src/widgets/todo-board/ui/TodoDetailPane.tsx`
- Modify: `my-app/src/shared/lib/i18n/keys.ts`
- Modify: `my-app/src/shared/lib/i18n/locales/en.ts`
- Modify: `my-app/src/shared/lib/i18n/locales/ko.ts`
- Modify: `my-app/src/shared/lib/i18n/locales/ja.ts`
- Modify: `my-app/src/shared/lib/i18n/locales/zh.ts`

**Interfaces:**
- Consumes: `TaskDetailPanel`, `TaskDetailPanelProps`(`@/entities/todo/ui/TaskDetailPanel`, Task 1에서 `onGoToRetro` 제거된 버전).
- Produces: `TodoDetailPane` 컴포넌트, props `{ selection: { todo: Todo; panelProps: Omit<TaskDetailPanelProps, "todo"> } | null }` — Task 7(`TodoBoard.tsx`)에서 이 시그니처로 렌더링한다.

- [ ] **Step 1: i18n 키 추가 — `keys.ts`**

`todo.filter.clear` 다음 줄(77행 부근)에 추가:

```ts
  | "todo.filter.clear"
  | "todo.list.empty"
  | "todo.detail.emptyTitle"
  | "todo.detail.emptyDesc"
```

- [ ] **Step 2: 4개 로케일에 값 추가**

`ko.ts` (`"todo.filter.clear": "필터 해제",` 다음 줄):
```ts
  "todo.filter.clear": "필터 해제",
  "todo.list.empty": "조건에 맞는 할 일이 없습니다.",
  "todo.detail.emptyTitle": "왼쪽에서 할 일을 선택하세요.",
  "todo.detail.emptyDesc": "내용 · 일정을 여기서 편집합니다.",
```

`en.ts`:
```ts
  "todo.list.empty": "No todos match the current filters.",
  "todo.detail.emptyTitle": "Select a todo from the list.",
  "todo.detail.emptyDesc": "Edit its content and schedule here.",
```

`ja.ts`:
```ts
  "todo.list.empty": "条件に一致するタスクがありません。",
  "todo.detail.emptyTitle": "左のリストからタスクを選択してください。",
  "todo.detail.emptyDesc": "内容・予定をここで編集します。",
```

`zh.ts`:
```ts
  "todo.list.empty": "没有符合条件的待办事项。",
  "todo.detail.emptyTitle": "请从左侧选择一个待办事项。",
  "todo.detail.emptyDesc": "在此编辑内容和日程。",
```

(각 로케일 파일에서 `"todo.filter.clear"` 값이 있는 줄을 찾아 그 바로 아래에 위 3줄을 삽입한다.)

- [ ] **Step 3: `TodoDetailPane.tsx` 작성**

```tsx
import { CheckCircle2 } from "lucide-react";
import type { Todo } from "@/entities/todo/model/types";
import { TaskDetailPanel, type TaskDetailPanelProps } from "@/entities/todo/ui/TaskDetailPanel";
import { useTranslation } from "@/shared/lib/i18n";

export interface TodoDetailPaneProps {
  selection: {
    todo: Todo;
    panelProps: Omit<TaskDetailPanelProps, "todo">;
  } | null;
}

/**
 * 분할 뷰 우측 컬럼. 선택된 할 일이 없으면 빈 상태 안내를,
 * 있으면 `TaskDetailPanel`을 렌더링한다.
 */
export function TodoDetailPane({ selection }: TodoDetailPaneProps) {
  const { t } = useTranslation();

  if (!selection) {
    return (
      <section className="todo-detail-pane todo-detail-pane-empty">
        <div className="todo-detail-empty">
          <span className="todo-detail-empty-icon">
            <CheckCircle2 size={22} />
          </span>
          <p className="todo-detail-empty-title">{t("todo.detail.emptyTitle")}</p>
          <p className="todo-detail-empty-desc">{t("todo.detail.emptyDesc")}</p>
        </div>
      </section>
    );
  }

  return (
    <section className="todo-detail-pane">
      <TaskDetailPanel key={selection.todo.id} todo={selection.todo} {...selection.panelProps} />
    </section>
  );
}
```

- [ ] **Step 4: 빌드 검증**

```bash
cd my-app && pnpm build
```

Expected: 성공.

- [ ] **Step 5: Commit**

```bash
git add my-app/src/widgets/todo-board/ui/TodoDetailPane.tsx \
        my-app/src/shared/lib/i18n/keys.ts \
        my-app/src/shared/lib/i18n/locales/en.ts \
        my-app/src/shared/lib/i18n/locales/ko.ts \
        my-app/src/shared/lib/i18n/locales/ja.ts \
        my-app/src/shared/lib/i18n/locales/zh.ts
git commit -m "feat: add TodoDetailPane component with empty-state copy"
```

---

### Task 7: `TodoBoard.tsx` 전면 교체 + 칸반 전용 파일 삭제 + 드래그 고스트 정리

이 태스크에서 칸반 레이아웃을 완전히 걷어내고 분할 뷰로 조립한다. 지금까지의 태스크가 만든 새 컴포넌트/훅을 전부 연결하고, 더 이상 아무도 쓰지 않는 칸반 전용 파일을 삭제하고, `constants.ts`에서 칸반 관련 export를 제거하고, `TodoDragGhost.tsx`에서 칸반 드래그 kind 분기를 제거한다.

**Files:**
- Modify: `my-app/src/widgets/todo-board/ui/TodoBoard.tsx` (전체 재작성)
- Modify: `my-app/src/widgets/todo-board/model/constants.ts`
- Modify: `my-app/src/app/TodoDragGhost.tsx`
- Delete: `my-app/src/widgets/todo-board/ui/KanbanColumn.tsx`
- Delete: `my-app/src/widgets/todo-board/ui/KanbanCard.tsx`
- Delete: `my-app/src/widgets/todo-board/model/useKanbanFilter.ts`
- Delete: `my-app/src/widgets/todo-board/ui/TodoFilterRow.tsx`

**Interfaces:**
- Consumes: `useTodoListFilter`(Task 3), `TodoListRow`(Task 4), `TodoRangeFilterRow`/`TodoStatusFilterRow`(Task 5), `TodoDetailPane`(Task 6), `QuickCapture`(기존, 변경 없음).
- Produces: `TodoBoard()` — 무인자 컴포넌트(Task 1에서 이미 `onNavigate` 제거됨, 이 태스크는 내부 렌더링만 교체).

- [ ] **Step 1: `constants.ts`에서 칸반 관련 export 삭제**

`my-app/src/widgets/todo-board/model/constants.ts`를 다음 내용으로 전체 교체:

```ts
import type { TaskStatus } from "@/entities/todo/model/types";

/** Discriminated union for the board's date filter chip group. */
export type DateFilter =
  | { kind: "all" }
  | { kind: "today" }
  | { kind: "week" }
  | { kind: "specific"; dateKey: string };

/** Status filter chip selection — "all" shows every status, others narrow to one. */
export type StatusFilter = "all" | TaskStatus;
```

(`KANBAN_DRAG_KIND`, `KanbanColumnConfig`, `COLS`, 그리고 이제 안 쓰는 `PillTone`/`TranslationKey` import를 제거했다.)

- [ ] **Step 2: `TodoBoard.tsx` 전체 교체**

```tsx
import { useEffect, useMemo, useState } from "react";
import { useArchiveApp } from "@/app/providers/useArchiveApp";
import type { RecurrenceRule, Todo } from "@/entities/todo/model/types";
import { collectAllTags, collectRecentTags, findTodoById } from "@/entities/todo/lib/selectors";
import { useTranslation } from "@/shared/lib/i18n";
import { useTodoListFilter } from "../model/useTodoListFilter";
import { QuickCapture } from "./QuickCapture";
import { TodoDetailPane } from "./TodoDetailPane";
import { TodoListRow } from "./TodoListRow";
import { TodoRangeFilterRow } from "./TodoRangeFilterRow";
import { TodoStatusFilterRow } from "./TodoStatusFilterRow";

export function TodoBoard() {
  const {
    state,
    addTodo,
    updateTodo,
    updateTodoRecurrence,
    updateTodoTimeRecurrence,
    updateTodoFollowing,
    convertTodoToRecurring,
    setTodoTime,
    removeTodo,
    toggleTodoCalendarLink,
    loadTodosForRange,
    pushNotification,
    clearTodoIdReplacement,
  } = useArchiveApp();
  const { t } = useTranslation();
  const rangeDays = state.settings.todoBoardRangeDays;
  const { filter, setFilter, statusFilter, setStatusFilter, todayK, counts, entries } =
    useTodoListFilter(state.todos, rangeDays);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const allTags = useMemo(() => collectAllTags(state.todos), [state.todos]);
  const recentTags = useMemo(() => collectRecentTags(state.todos), [state.todos]);

  // 보드 진입 시 + 기간 설정 변경 시 "전체" 보기 범위의 할 일을 로드한다.
  // (loadTodosForRange 는 useCallback([]) 으로 안정화되어 있어 deps 에서 제외한다.)
  useEffect(() => {
    void loadTodosForRange(rangeDays);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rangeDays]);

  const selectedTodo = selectedId
    ? findTodoById(state.todos, selectedId)
    : null;

  // 반복 시리즈 가상 인스턴스를 편집하면 debounce 된 PATCH 응답으로 서버가 새 id 를
  // 발급할 수 있다(todo/replaceId) — selectedId 가 이를 따라가지 않으면 findTodoById 가
  // null 을 반환해 상세 패널이 빈 상태로 바뀌어 보인다.
  useEffect(() => {
    const rep = state.lastTodoIdReplacement;
    if (!rep || rep.localId !== selectedId) return;
    setSelectedId(rep.newId);
    clearTodoIdReplacement();
  }, [state.lastTodoIdReplacement, selectedId, clearTodoIdReplacement]);

  // 반복 전환/규칙변경 PATCH 응답은 base row 원본 형태라 목록에 나오는 가상 인스턴스
  // 모양과 다르다 — 재조회 후, 그 새 base 에서 파생된(같은 날짜) 항목을 찾아 선택을
  // 옮겨야 상세 패널이 갑자기 빈 화면이 되지 않는다.
  const followRecurrenceMutation = async (
    mutate: () => Promise<Todo | null>,
    originalDateKey: string,
  ) => {
    const serverTodo = await mutate();
    if (!serverTodo) return;
    const todos = await loadTodosForRange(rangeDays);
    const match = todos.find(
      (t) => t.seriesId === serverTodo.id && t.dateKey === originalDateKey,
    );
    setSelectedId(match ? match.id : serverTodo.id);
  };

  const handleSubmit = (
    text: string,
    dateKey: string,
    recurrenceRule?: RecurrenceRule | null,
    tags?: string[],
  ) => {
    // 새 할 일의 Google Calendar push 여부는 calendarAutoPushTodo 설정을 따른다
    // (pushToCalendar: null → 서버가 설정값으로 처리).
    addTodo(
      text,
      dateKey,
      { status: "not-start", pushToCalendar: null, recurrenceRule, tags },
      (id) => {
        setSelectedId(id);
        // 반복 생성 응답은 base row 원본 형태라 목록 조회의 가상 인스턴스 모양과 다르다 —
        // 재조회해야 반복 배지·이후 회차가 즉시 보이고, 선택도 새 가상 인스턴스로 옮겨간다.
        if (recurrenceRule) {
          void loadTodosForRange(rangeDays).then((todos) => {
            const match = todos.find((t) => t.seriesId === id && t.dateKey === dateKey);
            if (match) setSelectedId(match.id);
          });
        }
      },
    );
    pushNotification(
      "success",
      t("todo.notif.added.title"),
      `"${text}" — ${dateKey}`,
    );
  };

  const STATUS_LABEL: Record<Todo["status"], string> = {
    "not-start": t("todo.col.notStart.ko"),
    "in-progress": t("todo.col.inProgress.ko"),
    done: t("todo.col.done.ko"),
  };

  const detailSelection = selectedTodo
    ? {
        todo: selectedTodo,
        panelProps: {
          tagSuggestions: allTags,
          recentTags,
          onClose: () => setSelectedId(null),
          onUpdate: (patch: Parameters<typeof updateTodo>[1]) =>
            updateTodo(selectedTodo.id, patch),
          onUpdateFollowing: (patch: Parameters<typeof updateTodoFollowing>[1]) =>
            void followRecurrenceMutation(
              () => updateTodoFollowing(selectedTodo.id, patch),
              selectedTodo.dateKey,
            ),
          onSetTime: (startTime: string | null, endTime: string | null) =>
            setTodoTime(selectedTodo.id, startTime, endTime),
          onSetTimeFollowing: (startTime: string | null, endTime: string | null) =>
            void followRecurrenceMutation(
              () => updateTodoTimeRecurrence(selectedTodo.id, startTime, endTime),
              selectedTodo.dateKey,
            ),
          onDelete: (scope?: Parameters<typeof removeTodo>[1]) => {
            removeTodo(selectedTodo.id, scope);
            setSelectedId(null);
          },
          onUpdateRecurrence: (rule: RecurrenceRule) =>
            void followRecurrenceMutation(
              () => updateTodoRecurrence(selectedTodo.id, rule),
              selectedTodo.dateKey,
            ),
          onConvertToRecurring: (rule: RecurrenceRule) =>
            void followRecurrenceMutation(
              () => convertTodoToRecurring(selectedTodo.id, rule),
              selectedTodo.dateKey,
            ),
          onToggleCalendarLink:
            state.calendar.status === "connected" || state.calendar.status === "needs-reauth"
              ? () => toggleTodoCalendarLink(selectedTodo.id)
              : undefined,
          calendarNeedsReauth: state.calendar.status === "needs-reauth",
        },
      }
    : null;

  return (
    <div className="page todo-page todo-split">
      <section className="todo-list-pane">
        <QuickCapture onSubmit={handleSubmit} tagSuggestions={allTags} recentTags={recentTags} />
        <TodoRangeFilterRow filter={filter} onChange={setFilter} todayKey={todayK} />
        <TodoStatusFilterRow value={statusFilter} onChange={setStatusFilter} counts={counts} />

        <div className="todo-list">
          {entries.map(({ todo, showHeader }) => (
            <div key={todo.id}>
              {showHeader ? (
                <div className="todo-list-header" data-status={todo.status}>
                  <span className="todo-list-header-dot" />
                  <span className="todo-list-header-label">{STATUS_LABEL[todo.status]}</span>
                  <span className="todo-list-header-count">{counts[todo.status]}</span>
                </div>
              ) : null}
              <TodoListRow
                todo={todo}
                isSelected={todo.id === selectedId}
                allTags={allTags}
                recentTags={recentTags}
                onUpdate={updateTodo}
                onSelect={setSelectedId}
              />
            </div>
          ))}
          {entries.length === 0 ? (
            <div className="todo-list-empty">{t("todo.list.empty")}</div>
          ) : null}
        </div>
      </section>

      <TodoDetailPane selection={detailSelection} />
    </div>
  );
}
```

> **타입 참고**: `onUpdate`/`onUpdateFollowing`/`onDelete` 등의 파라미터 타입은 `Parameters<typeof updateTodo>[1]`처럼 기존 `useArchiveApp()`이 제공하는 함수 시그니처에서 그대로 뽑아 쓴다(중복 정의 방지). `pnpm build`가 이 부분에서 타입 불일치를 보고하면, `app/model/types.ts`에서 해당 함수(`updateTodo`, `updateTodoFollowing`, `removeTodo` 등)의 실제 시그니처를 확인해 `panelProps`의 각 콜백 파라미터 타입을 맞춘다(기존 `TodoBoard.tsx`가 인라인 화살표 함수로 이미 문제없이 넘기던 것과 동일한 값들이므로, 타입 불일치가 나면 `Parameters<...>` 추출 부분만 조정하면 된다).

- [ ] **Step 3: `TodoDragGhost.tsx`에서 `KANBAN_DRAG_KIND` 분기 제거**

`my-app/src/app/TodoDragGhost.tsx`에서:

```tsx
import { TODO_DRAG_KIND } from "@/widgets/calendar-dashboard/model/constants";
import { KANBAN_DRAG_KIND } from "@/widgets/todo-board/model/constants";
```

를

```tsx
import { TODO_DRAG_KIND } from "@/widgets/calendar-dashboard/model/constants";
```

로, 그리고

```tsx
  const kind = state.payload.kind;
  if (kind !== TODO_DRAG_KIND && kind !== KANBAN_DRAG_KIND) return null;
```

를

```tsx
  const kind = state.payload.kind;
  if (kind !== TODO_DRAG_KIND) return null;
```

로 교체한다(캘린더 쪽 `TODO_DRAG_KIND` 드래그 고스트는 그대로 유지).

- [ ] **Step 4: 칸반 전용 파일 삭제**

```bash
git rm my-app/src/widgets/todo-board/ui/KanbanColumn.tsx
git rm my-app/src/widgets/todo-board/ui/KanbanCard.tsx
git rm my-app/src/widgets/todo-board/model/useKanbanFilter.ts
git rm my-app/src/widgets/todo-board/ui/TodoFilterRow.tsx
```

- [ ] **Step 5: `todo.col.empty` 키가 다른 곳에서 쓰이는지 확인 후 정리**

```bash
cd my-app && grep -rn '"todo.col.empty"\|todo\.col\.empty' src
```

`KanbanColumn.tsx` 삭제로 인해 이 grep 결과가 **`keys.ts`/4개 로케일 파일의 키 정의 줄만** 남고 실제 사용처가 없다면(칸반 컬럼의 "빈 열" 안내 문구였으므로 삭제된 파일에서만 쓰였을 가능성이 높다), `keys.ts`와 `locales/{en,ko,ja,zh}.ts`에서 `"todo.col.empty"` 키/값 줄을 삭제한다. 만약 다른 곳(예: 캘린더 쪽)에서도 쓰이고 있다면 그대로 둔다.

- [ ] **Step 6: 빌드 검증**

```bash
cd my-app && pnpm build
```

Expected: 성공. 삭제된 파일을 참조하는 곳이 남아있으면 여기서 모듈 not found 에러로 드러난다.

- [ ] **Step 7: 브라우저 수동 확인**

`run` 스킬로 dev 서버를 띄운 뒤 "할 일" 탭에서:
1. 좌측에 할 일 목록이 상태별(시작 전/진행 중/완료) sticky 헤더로 그룹돼 보이는지.
2. 상단 날짜 필터(전체/오늘/이번 주/날짜선택)와 그 아래 상태 필터(전체/시작전/진행중/완료 + 개수)가 각각 동작하는지.
3. 목록에서 아무 항목이나 클릭하면 우측 패널에 "내용"/"일정" 탭 상세가 뜨는지, 선택된 행에 좌측 강조(파란 보더)가 표시되는지.
4. 아무것도 선택 안 된 초기 상태(또는 X로 닫은 뒤)에 우측이 빈 상태 안내로 채워지는지.
5. 상태 아이콘 클릭 시 상태가 순환(시작 전→진행 중→완료→시작 전)하는지, 목록 그룹이 그에 맞춰 다시 정렬되는지.
6. 빠른 추가(QuickCapture)로 새 할 일을 만들면 목록에 반영되고 우측에 자동 선택되는지.
7. 태그 아이콘 클릭 시 인라인 태그 편집 팝오버가 뜨는지.
8. 브라우저 콘솔에 에러가 없는지, 페이지를 리사이즈했을 때 분할 뷰가 깨지지 않는지(Task 8의 CSS 적용 후 최종 확인은 Task 9에서 다시 함 — 지금은 CSS가 아직 없어 레이아웃이 비주얼적으로 부실할 수 있으나 기능 동작만 확인).

- [ ] **Step 8: Commit**

```bash
git add my-app/src/widgets/todo-board/ui/TodoBoard.tsx \
        my-app/src/widgets/todo-board/model/constants.ts \
        my-app/src/app/TodoDragGhost.tsx \
        my-app/src/shared/lib/i18n/keys.ts \
        my-app/src/shared/lib/i18n/locales/en.ts \
        my-app/src/shared/lib/i18n/locales/ko.ts \
        my-app/src/shared/lib/i18n/locales/ja.ts \
        my-app/src/shared/lib/i18n/locales/zh.ts
git commit -m "refactor: replace kanban board with split-view todo list"
```

---

### Task 8: CSS — 칸반 스타일 삭제 + 분할 뷰/리스트/상태필터/빈 상태 스타일 추가

**Files:**
- Modify: `my-app/src/app/styles/widgets/todo-board.css`

**Interfaces:**
- Consumes: 전역 디자인 토큰(`--color-tile-1/2/3`, `--color-canvas`, `--color-divider-soft`, `--color-ink`, `--color-ink-muted-48`, `--color-body-muted`, `--color-primary`, `--color-status-done`, `--r-md/lg/xl`, `--font-mono`) — 모두 `app/styles/tokens/`에 기존 정의됨, 신규 토큰 추가 없음.

- [ ] **Step 1: `todo-board.css` 전체 교체**

```css
/* ---------- Todo split view (list pane + detail pane) ---------- */
.todo-page {
  padding-top: 40px;
}

.todo-split {
  display: flex;
  align-items: stretch;
  gap: 24px;
  /* 뷰포트 남은 높이의 근사치 — 앱 헤더/서브헤더/.page 패딩을 감안한 값이다.
     브라우저에서 확인 후 과도한 페이지 스크롤/잘림이 보이면 260px 값을 조정한다. */
  height: max(480px, calc(100vh - 260px));
}

@media (max-width: 900px) {
  .todo-split {
    flex-direction: column;
    height: auto;
  }
}

/* ---------- Left: list pane ---------- */
.todo-list-pane {
  flex: 1 1 50%;
  min-width: 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

.todo-list {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  margin-top: 16px;
  border-top: 1px solid var(--color-divider-soft);
  padding-right: 2px;
  scrollbar-width: thin;
  scrollbar-color: var(--color-divider-soft) transparent;
}

@media (max-width: 900px) {
  .todo-list {
    max-height: 480px;
  }
}

.todo-list-empty {
  padding: 48px 12px;
  text-align: center;
  font-size: 12px;
  color: var(--color-ink-muted-48);
}

.todo-list-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 9px 4px;
  position: sticky;
  top: 0;
  background: var(--color-canvas);
  z-index: 1;
}
.todo-list-header-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  flex-shrink: 0;
  background: var(--color-ink-muted-48);
}
.todo-list-header[data-status="in-progress"] .todo-list-header-dot { background: var(--color-primary); }
.todo-list-header[data-status="done"] .todo-list-header-dot { background: var(--color-status-done); }
.todo-list-header-label {
  font-size: 12px;
  font-weight: 500;
  color: var(--color-body-muted);
}
.todo-list-header-count {
  font-family: var(--font-mono);
  font-size: 11px;
  color: var(--color-ink-muted-48);
}

/* ---------- Todo list row (replaces kanban card) ---------- */
.todo-list-row {
  display: flex;
  gap: 12px;
  align-items: flex-start;
  padding: 12px 6px;
  border-bottom: 1px solid var(--color-divider-soft);
  border-left: 2px solid transparent;
  cursor: pointer;
  transition: background 100ms ease, border-color 100ms ease;
}
.todo-list-row:hover {
  background: var(--color-tile-2);
}
.todo-list-row[data-selected="true"] {
  background: var(--color-tile-2);
  border-left-color: var(--color-primary);
}
.todo-list-row-status-btn {
  flex: none;
  margin-top: 1px;
  cursor: pointer;
  display: flex;
}
.todo-list-row-body {
  flex: 1;
  min-width: 0;
}
.todo-list-row-top {
  display: flex;
  align-items: flex-start;
  gap: 8px;
}
.todo-list-row-title {
  margin: 0;
  flex: 1;
  min-width: 0;
  font-size: 16px;
  font-weight: 500;
  letter-spacing: -0.16px;
  color: var(--color-ink);
}
.todo-list-row-title[data-done="true"] {
  text-decoration: line-through;
  color: var(--color-body-muted);
}
.todo-list-row-notes {
  flex-shrink: 0;
  margin-top: 2px;
  color: var(--color-ink-muted-48);
}
.todo-list-row-meta {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 8px;
}
.todo-list-row-date {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-family: var(--font-mono);
  font-size: 11px;
  color: var(--color-body-muted);
}
.todo-list-row-time {
  font-family: var(--font-mono);
  font-size: 11px;
  color: var(--color-body-muted);
}
.todo-list-row-tag-anchor {
  position: relative;
  display: inline-flex;
}
.todo-list-row-tag-add {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  border-radius: 50%;
  color: var(--color-body-muted);
  background: transparent;
  border: 1px dashed var(--color-divider-soft);
  cursor: pointer;
}
.todo-list-row-tag-add:hover {
  color: var(--color-ink);
  border-color: var(--color-ink-muted-48);
  background: var(--color-tile-3);
}
.todo-list-row-tag-popover {
  position: absolute;
  top: calc(100% + 6px);
  left: 0;
  z-index: 31;
  min-width: 220px;
  max-width: 280px;
  padding: 10px;
  border-radius: var(--r-md);
  background: var(--color-tile-3);
  border: 1px solid var(--color-divider-soft);
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.24);
}

/* ---------- Filter rows (date range + status) ----------
   `.todo-filter-row`/`.todo-filter-btn` 기본 규칙(배경/보더/hover/[data-active])은
   이 파일에 없다 — 기존 `TodoFilterRow.tsx`가 이미 이 클래스들을 쓰고 있었는데도
   원본 `todo-board.css`에는 정의가 없었으므로, 다른 전역 CSS 파일(atoms 계열)에
   이미 정의돼 있다는 뜻이다. 여기서는 그 기본 규칙을 재정의하지 않고, todo-board
   전용 보강 규칙만 추가한다(Step 2에서 실제 정의 위치를 확인한다). */
.todo-filter-btn svg {
  margin-right: 4px;
}
.todo-filter-btn-count {
  font-family: var(--font-mono);
  font-size: 11px;
  color: var(--color-ink-muted-48);
}
.todo-status-filter-row {
  margin-top: 8px;
}

/* Wrapper around a filter button that anchors a popover */
.todo-filter-date-wrap {
  position: relative;
}

/* ---------- Right: detail pane ---------- */
.todo-detail-pane {
  flex: 1 1 50%;
  min-width: 0;
  min-height: 0;
  overflow: hidden;
  background: var(--color-tile-2);
  border-radius: var(--r-xl);
  border: 1px solid var(--color-divider-soft);
}
@media (max-width: 900px) {
  .todo-detail-pane {
    min-height: 480px;
  }
}
.todo-detail-pane-empty {
  display: flex;
  align-items: center;
  justify-content: center;
}
.todo-detail-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  text-align: center;
  padding: 24px;
}
.todo-detail-empty-icon {
  color: var(--color-ink-muted-48);
}
.todo-detail-empty-title {
  margin: 0;
  font-size: 16px;
  color: var(--color-body-muted);
}
.todo-detail-empty-desc {
  margin: 0;
  font-size: 12px;
  color: var(--color-ink-muted-48);
}

/* ---------- Quick capture (bar above the list) ---------- */
.quick-capture {
  display: flex;
  gap: 12px;
  align-items: stretch;
  margin-bottom: 24px;
}
/* 입력 박스 — 독립된 큰 라운드 컨테이너 */
.quick-capture-input-wrap {
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 14px 20px;
  background: var(--color-tile-1);
  border: 1px solid var(--color-divider-soft);
  border-radius: var(--r-lg);
}
.quick-capture-input-wrap > svg {
  color: var(--color-body-muted);
  flex-shrink: 0;
}
.quick-capture-input {
  flex: 1;
  font-size: 18px;
  min-width: 0;
}
/* 날짜칩 · Add 버튼 — 입력 박스와 분리된 형제, 높이 동일(stretch) */
.quick-capture-date-wrap {
  position: relative;
  flex-shrink: 0;
}
.quick-capture-date-btn {
  height: 100%;
  padding: 0 16px;
}
.quick-capture-date-btn[data-active="true"] {
  background: var(--color-ink);
  color: var(--color-canvas);
  border-color: var(--color-ink);
}
.quick-capture-submit {
  flex-shrink: 0;
  padding: 0 22px;
}
```

- [ ] **Step 2: 기존 `.todo-filter-row`/`.todo-filter-btn` 정의 위치 확인**

```bash
cd my-app && grep -rn "\.todo-filter-row\s*{\|\.todo-filter-btn\s*{\|\.todo-filter-btn:hover\|\.todo-filter-btn\[data-active" src/app/styles
```

Expected: `todo-board.css`가 아닌 다른 파일(atoms 계열)에서 정의가 발견된다. 만약 예상과 달리 **아무 파일에서도 발견되지 않는다면**(즉 실제로 어디에도 정의가 없었다면), `todo-board.css`에 다음 기본 규칙 블록을 추가한다:

```css
.todo-filter-row {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
}
.todo-filter-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 5px 10px;
  border-radius: 6px;
  cursor: pointer;
  font-size: 12px;
  color: var(--color-body-muted);
  background: transparent;
  border: 1px solid transparent;
}
.todo-filter-btn:hover {
  color: var(--color-ink);
}
.todo-filter-btn[data-active="true"] {
  background: var(--color-tile-2);
  color: var(--color-ink);
  border-color: var(--color-divider-soft);
}
```

(다른 파일에서 정의를 찾았다면 이 블록은 추가하지 않는다 — 중복 정의로 인한 스타일 우선순위 혼란을 피한다.)

- [ ] **Step 3: 빌드 검증**

```bash
cd my-app && pnpm build
```

Expected: 성공(CSS는 타입 체크 대상이 아니므로 이 시점엔 사실상 회귀 확인용).

- [ ] **Step 4: 브라우저 수동 확인 (비주얼 최종 점검)**

`run` 스킬로 dev 서버를 띄운 뒤 "할 일" 탭에서:
1. 좌 50% / 우 50% 분할이 실제로 화면에 보이는지, 페이지 자체가 과도하게 스크롤되지 않는지(만약 아래쪽이 뷰포트를 크게 벗어나면 `.todo-split`의 `calc(100vh - 260px)` 오프셋 값을 브라우저 개발자도구로 실측해 조정).
2. 좌측 리스트만 내부 스크롤되고, 우측 상세도 내부 스크롤되는지(둘 다 바깥 페이지 스크롤에 끌려가지 않는지).
3. 상태별 sticky 헤더가 스크롤 시 상단에 붙어있는지, 배경색이 리스트 배경과 자연스럽게 이어지는지(뜯어 보이지 않는지).
4. 리스트 행 hover/선택 시 배경·좌측 보더가 자연스럽게 바뀌는지.
5. 태그 칩 색상이 캘린더/기존 태그 UI와 동일한 팔레트로 보이는지.
6. 900px 이하로 브라우저 폭을 좁혔을 때 분할 뷰가 세로로 쌓이는 반응형 레이아웃으로 바뀌는지.
7. 우측 상세 패널의 "내용"/"일정" 탭 전환, Google Calendar 섹션 표시가 정상인지 다시 한번 확인.
8. 캘린더 탭의 할 일 상세 오버레이(레이아웃은 그대로, 내용만 탭 재편됨)도 함께 열어 정상 동작하는지 확인.

- [ ] **Step 5: Commit**

```bash
git add my-app/src/app/styles/widgets/todo-board.css
git commit -m "style: add split-view todo list and detail pane styles"
```

---

### Task 9: 최종 통합 검증

**Files:**
- (읽기 전용 — 코드 변경 없음)

- [ ] **Step 1: 전체 빌드**

```bash
cd my-app && pnpm build
```

Expected: `tsc -b`와 `vite build` 모두 에러 없이 성공.

- [ ] **Step 2: lint**

```bash
cd my-app && pnpm lint
```

Expected: 에러 없이 통과(경고는 기존 코드베이스 기준선과 비교해 새로 늘어나지 않았는지 확인).

- [ ] **Step 3: 최종 브라우저 회귀 확인**

`run` 스킬로 dev 서버를 띄운 뒤:
1. **할 일 탭**: 목록 필터(날짜+상태) 조합, 항목 추가/선택/상태순환/삭제/태그편집/반복설정/시간설정/Google Calendar 토글까지 한 사이클을 전부 눌러보고 콘솔 에러가 없는지 확인.
2. **캘린더 탭**: 일/주/월 뷰 각각에서 할 일 클릭 → 오버레이 상세 패널의 탭 전환, AI 회고 카드 부재, Google Calendar 섹션 위치("일정" 탭) 확인.
3. **회고 탭**: 상단 네비게이션에서 직접 이동만 되는지 확인(할 일 상세를 통한 진입 경로가 사라졌으므로 이 경로가 유일한 진입점임을 인지).
4. 콘솔에 React 경고(key 누락, effect deps 등)나 네트워크 에러가 없는지 확인.

- [ ] **Step 4: 사용자에게 보고**

빌드/lint 통과 여부와 수동 확인 결과를 요약해 보고한다. `.todo-split`의 `calc(100vh - 260px)` 오프셋처럼 실측 후 조정이 필요했던 값이 있다면 최종 값을 함께 보고한다.
