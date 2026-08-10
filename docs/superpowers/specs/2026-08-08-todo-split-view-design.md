# 할 일(Todo) 탭 — 분할 뷰 디자인 개편 설계

- 작성일: 2026-08-08
- 대상: `my-app` (React + TS, FSD 아키텍처)
- 참고 레퍼런스: 사용자 제공 HTML 프로토타입("ARCHIVE 할 일 · 분할 뷰 프로토타입")
- 범위: `widgets/todo-board`(할 일 탭) 레이아웃 전면 교체 + `entities/todo/ui/TaskDetailPanel.tsx`(공유 상세 패널) 구조 개편

## 0. 핵심 변경 3가지

1. **레이아웃 골격**: 3열 칸반(드래그로 상태 이동) → 좌 50% 리스트 / 우 50% 상세, **상시 분할 뷰**로 전면 교체. 드래그앤드롭 완전 제거.
2. **상세 패널**: 세로 스크롤 나열형 → **탭 2개**(내용 / 일정) 구조로 재편. Google Calendar 연동 UI는 "일정" 탭으로 이동. "연동" 탭은 만들지 않음(GitHub 카드 제외).
3. **AI 자동 회고 UI 완전 삭제** — `TaskDetailPanel`이 `TodoBoard`와 `CalendarDashboard` 양쪽에서 공유되므로, 캘린더 쪽 할 일 상세 사이드바에서도 함께 사라짐.

이 세 가지는 모두 사용자와의 확인 질의응답을 거쳐 확정되었다(칸반→리스트 완전 교체 / 오버레이→상시 분할뷰 / GitHub 탭 제외·Google Calendar만 일정 탭으로 이동 / AI 회고 완전 삭제).

## 1. 레이아웃 골격 — `widgets/todo-board/ui/TodoBoard.tsx`

### 현재 구조
```
<div class="todo-page">
  <QuickCapture />
  <TodoFilterRow />
  <div class="kanban-grid">        ← 3열, 드래그 가능
    <KanbanColumn /> x3
  </div>
  <div class="side-panel-overlay" />   ← 클릭 시 닫힘
  <aside class="side-panel">           ← 우측에서 슬라이드인
    <TaskDetailPanel />
  </aside>
</div>
```

### 변경 후 구조
```
<div class="todo-split">
  <section class="todo-list-pane">     ← flex 1 1 50%
    <QuickCapture />                   ← 그대로 재사용
    <TodoRangeFilterRow />             ← 전체/오늘/이번주 + 필터 초기화 (기존 TodoFilterRow 대체)
    <TodoStatusFilterRow />            ← 신규: 전체/시작전/진행중/완료 + 개수 뱃지
    <div class="todo-list">
      <TodoListRow /> ...              ← KanbanCard 대체, 상태별 sticky 헤더로 그룹
    </div>
  </section>
  <section class="todo-detail-pane">   ← flex 1 1 50%, 항상 렌더
    <TaskDetailPanel /> 또는 빈 상태 안내
  </section>
</div>
```

- `.side-panel`/`.side-panel-overlay`(슬라이드인 오버레이) 및 `.kanban-grid`/`.kanban-col*`은 `TodoBoard`에서 제거.
- 상세가 없을 때(`selectedId === null`)도 화면 절반은 "왼쪽에서 할 일을 선택하세요" 안내로 채운다(프로토타입의 `noSel` 상태와 동일).
- 이 레이아웃 변경은 **`TodoBoard.tsx`(할 일 탭)에만 국한**된다. `CalendarDashboard.tsx`의 슬라이드인 오버레이 방식은 그대로 유지한다(사용자 요청이 "할 일 탭"에 한정되어 있으므로 캘린더 화면 레이아웃은 손대지 않음).

## 2. 왼쪽 리스트 영역

| 요소 | 현재 | 변경 후 |
|---|---|---|
| 빠른 추가(`QuickCapture.tsx`) | — | 변경 없음(그대로 재사용) |
| 날짜 필터(`TodoFilterRow.tsx`) | 전체/오늘/이번주/날짜선택/해제 | 라벨만 프로토타입 스타일(pill)로, 로직은 거의 동일하게 재사용 |
| **상태 필터** | 없음 (3열이 동시에 다 보임) | **신규**: 전체/시작전/진행중/완료 pill + 각 개수. 선택 시 해당 상태만 리스트에 표시 |
| 목록 항목(`KanbanCard.tsx`) | 카드형(제목/상태버튼/날짜/태그/드래그 핸들) | **`TodoListRow.tsx`(신규)**: 얇은 행형(체크박스形 상태 토글/제목/날짜·시간/태그칩/반복 아이콘), 상태별 sticky 섹션 헤더(예: "시작 전 · 3") |
| 정렬/그룹 로직(`useKanbanFilter.ts`) | 날짜 필터 + 3열로 그룹 | **`useTodoListFilter.ts`(신규, 대체)**: 날짜 필터 + 상태 필터 + 정렬(상태순 → 날짜순 → id순) + 상태 전환 지점에 헤더 삽입 |
| 드래그앤드롭 | `KanbanCard`(draggable) ↔ `KanbanColumn`(droppable), `KANBAN_DRAG_KIND` | **완전 제거**. 상태 변경은 상세 패널의 상태 버튼 또는 리스트 행의 토글로만 |

**제거되는 파일**: `KanbanColumn.tsx`, `KanbanCard.tsx`, `model/constants.ts`의 `KANBAN_DRAG_KIND` / `KanbanColumnConfig` / `COLS`.

**대체되는 파일**: `useKanbanFilter.ts` → `useTodoListFilter.ts`.

`todoFilterPrefs.ts`(날짜 필터 로컬 저장)는 유지하되, 상태 필터도 세션 간 유지하고 싶다면 저장 대상을 확장한다(이번 설계에서는 필수 아님, 후속 결정 가능).

**영향받는 외부 파일**: `src/app/TodoDragGhost.tsx` — `KANBAN_DRAG_KIND` 분기 제거. `TODO_DRAG_KIND`(캘린더용) 분기는 그대로 유지한다. 조사 결과 두 드래그 경로(`shared/lib/dnd`의 kind 매칭)는 완전히 독립적이라 이 파일 수정 외에 다른 파급 효과는 없다.

## 3. 오른쪽 상세 패널 — `entities/todo/ui/TaskDetailPanel.tsx`

현재는 탭 없이 세로로 나열: 상태 → 제목 → 태그 → 날짜 → 반복 → 시간 → 설명 → Google Calendar → AI 자동 회고.

변경 후, 탭 2개로 재편한다.

- **"내용" 탭**: 상태, 제목, 태그, 설명
- **"일정" 탭**: 날짜, 시간, 반복, **Google Calendar 연동(현재 위치에서 이동)**

기존 필드별 로직(반복 범위 선택 다이얼로그 3종, 시간 변경 시 scope 확인, 태그 커밋/blur 처리 등)은 **로직 변경 없이 그대로 유지**하고, JSX 배치만 탭 아래로 재배치한다. `tab` 로컬 state(`"content" | "schedule"`)를 추가하고, 탭 클릭 시 전환한다. 상단 헤더(상태 pill, 코드, 요일, 삭제/닫기 버튼, 제목 입력)는 탭과 무관하게 상시 노출한다(프로토타입과 동일 구조).

### 삭제되는 것
- AI 자동 회고 섹션 전체(JSX 블록 + `Sparkles`/`ArrowRight` import)
- `TaskDetailPanelProps.onGoToRetro: () => void` — prop 자체를 인터페이스에서 제거

### 연쇄 영향 (`onGoToRetro`를 넘기던 2곳 모두 수정 필요)
- `widgets/todo-board/ui/TodoBoard.tsx`: `onGoToRetro={...}` 호출부 제거. 이 컴포넌트 내에서 `onNavigate`를 더 쓸 곳이 없어지므로 `TodoBoardProps.onNavigate`도 제거하고, `pages/todos/ui/TodosPage.tsx`에서 넘기던 `onNavigate`도 함께 제거한다.
- `widgets/calendar-dashboard/ui/CalendarDashboard.tsx`: 동일하게 `onGoToRetro={...}` 호출부만 제거한다. 이 파일은 `onNavigate`를 다른 목적으로도 쓸 가능성이 있으므로 prop 자체 제거 여부는 구현 단계에서 별도 확인한다.

## 4. 공유 컴포넌트 파급 범위 (중요)

`TaskDetailPanel`은 `TodoBoard.tsx`와 `CalendarDashboard.tsx` 딱 2곳에서만 쓰이는 `entities` 레벨 공유 컴포넌트다. 즉:

- 탭 재편(내용/일정) + AI 회고 삭제 + Google Calendar 위치 이동은 **자동으로 캘린더 쪽 "할 일 상세" 사이드바에도 동일하게 적용**된다.
- 반면 **레이아웃 골격 변경(칸반 → 리스트, 오버레이 → 분할뷰)은 `TodoBoard.tsx` 내부에만 국한**되고, `CalendarDashboard.tsx`의 슬라이드인 오버레이 방식은 그대로 유지된다.

## 5. 상태/액션/타입 레벨

- `entities/todo/model/types.ts`(`Todo`, `RecurrenceRule` 등) — **변경 없음**. 새 디자인에 필요한 필드(status/tags/repeat/date/time/calendarLinked)가 이미 모두 있다.
- `app/model/actions.ts` / `reducer.ts` / `AppProvider.tsx` — **변경 없음**. `updateTodo`, `removeTodo`, `updateTodoRecurrence` 등 기존 액션을 그대로 재사용한다.
- `moveTodo`(`app/providers/AppProvider.tsx`, `todo/move` 액션)는 캘린더의 날짜 드래그 전용이며 칸반 상태 변경과 무관함을 확인했다 — 이번 변경과 관계없이 그대로 유지된다.
- GitHub 관련 필드/액션은 **추가하지 않는다**(스코프 제외, 8절 참고).

## 6. CSS 변경 — `app/styles/widgets/todo-board.css`

| 클래스 | 처리 |
|---|---|
| `.kanban-grid`, `.kanban-col*`, `.kanban-card*` | 삭제 |
| `.side-panel`, `.side-panel-overlay` (TodoBoard 쪽 사용) | 제거. 단 `CalendarDashboard`가 같은 클래스를 계속 사용하므로 클래스 정의 자체는 삭제하지 않고 유지 확인 |
| `.quick-capture*` | 유지(그대로 재사용) |
| `.todo-filter-row`, `.todo-filter-btn`, `.todo-filter-date-wrap` | 유지 + 상태 필터용 스타일(pill + count) 추가 |
| 신규: `.todo-split`, `.todo-list-pane`, `.todo-detail-pane`, `.todo-list-row*`, `.todo-status-filter*` | 추가 |

## 7. i18n 키 변경 (`shared/lib/i18n/keys.ts` + `locales/{en,ko,ja,zh}.ts`)

- **삭제**: `calendar.taskDetail.aiRetro`, `calendar.taskDetail.aiRetroDesc`, `calendar.taskDetail.goToRetro`
- **유지(그대로)**: `todo.filter.*`, `todo.tag.*`, `todo.recurrence.*`, `calendar.taskDetail.calendarLinkAdd/Remove`, `calendar.taskDetail.calendarStatus.*`, `calendar.taskDetail.calendarReauth`
- **신규 추가 필요**:
  - 상태 필터 chip 라벨 (`todo.col.notStart.ko` / `todo.col.inProgress.ko` / `todo.col.done.ko`를 재사용하거나 `todo.statusFilter.*` 신설)
  - 탭 라벨: `calendar.taskDetail.tab.content`, `calendar.taskDetail.tab.schedule`
  - 분할뷰 빈 상태 안내 문구: 예) `todo.detail.emptyTitle`, `todo.detail.emptyDesc`

4개 로케일(en/ko/ja/zh) 모두 동기화 필요.

## 8. 스코프 제외 사항 (확정)

- **GitHub 연동 카드**: 만들지 않는다. `CLAUDE.md` 8절 가드레일상 할 일-GitHub 연동 API가 `api.yaml`에 없어 임의로 필드/엔드포인트를 만들 수 없다. 필요해지면 백엔드에 먼저 api.yaml 추가를 요청한다.
- **AI 자동 회고**: UI를 완전히 삭제한다(탭으로도, 다른 위치로도 옮기지 않는다). `onGoToRetro`와 연결되어 있던 "할 일 상세 → 회고 이동" 진입점 하나가 없어지므로, 회고 화면 진입은 상단 네비게이션의 "회고" 탭을 통해서만 가능해진다.

## 9. 파일 변경 목록 요약

| 구분 | 경로 |
|---|---|
| 삭제 | `widgets/todo-board/ui/KanbanColumn.tsx`, `widgets/todo-board/ui/KanbanCard.tsx` |
| 대체(신규 파일로 교체) | `widgets/todo-board/model/useKanbanFilter.ts` → `useTodoListFilter.ts`; `widgets/todo-board/ui/TodoFilterRow.tsx` → `TodoRangeFilterRow.tsx` + `TodoStatusFilterRow.tsx`로 분리 |
| 신규 | `widgets/todo-board/ui/TodoListRow.tsx`, `widgets/todo-board/ui/TodoDetailPane.tsx`(분할뷰 우측 래퍼 + 빈 상태) |
| 대폭 수정 | `widgets/todo-board/ui/TodoBoard.tsx`(골격 교체), `entities/todo/ui/TaskDetailPanel.tsx`(탭 재편 + AI 회고 삭제), `widgets/todo-board/model/constants.ts`(COLS 등 칸반 설정 제거) |
| 소폭 수정 | `pages/todos/ui/TodosPage.tsx`(onNavigate prop 제거 여부 확인), `widgets/calendar-dashboard/ui/CalendarDashboard.tsx`(onGoToRetro 호출부 제거), `app/TodoDragGhost.tsx`(KANBAN_DRAG_KIND 분기 제거), `app/styles/widgets/todo-board.css` |
| i18n | `shared/lib/i18n/keys.ts` + `locales/en.ts, ko.ts, ja.ts, zh.ts` |

## 10. 사전 조사로 확인된 안전성 근거

- `widgets/todo-board/index.ts` 배럴은 `TodoBoard`만 export한다 — 위젯 내부 구조(칸반 → 리스트)를 바꿔도 외부 소비자에게 영향 없음.
- `moveTodo`/`todo/move`는 캘린더 전용이며 `TodoBoard`에서 호출되지 않음 — 칸반 제거와 무관.
- `KANBAN_DRAG_KIND`(칸반), `TODO_DRAG_KIND`(캘린더), `RETRO_DRAG_KIND`(회고)는 `shared/lib/dnd`의 kind 매칭으로 서로 완전히 독립된 경로 — 칸반 DnD 제거가 다른 드래그 기능에 영향을 주지 않음. 유일한 공용 지점은 `app/TodoDragGhost.tsx`.
- `TaskDetailPanel`을 렌더링하는 곳은 `TodoBoard.tsx`, `CalendarDashboard.tsx` 딱 2곳뿐 — 파급 범위가 명확하게 한정됨.
