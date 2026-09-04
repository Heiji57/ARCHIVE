# 회고 에디터 문서형 리디자인 Implementation Plan (Phase 1)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 회고 에디터를 카드 나열형에서 "한 단 문서 + 우측 각주 레일" 형태로 바꾸고, 제목 자유 입력·폴더 선택·문서 동기화 상태·AI 요약 배너·체크박스 블록을 갖춘다.

**Architecture:** `RetroEditor`를 오케스트레이션 셸로 남기고, 문서 머리/폴더 선택/완료 작업/커밋/레일/요약 배너를 각각 별도 컴포넌트로 분리한다. 데이터 소스는 전부 기존 것(`state.folders`, `completedTodos`, `loadCommits`, `moveEntryToFolder`, `revertSummaryEdit`)을 재사용하며 **백엔드 계약 변경 없이** 진행한다. 리치 에디터에는 TipTap TaskList/TaskItem을 등록해 체크박스 블록을 추가한다.

**Tech Stack:** React 19 + TypeScript, FSD 아키텍처, TipTap v3(`@tiptap/*`), marked/turndown 마크다운 왕복, 순수 CSS(디자인 토큰 `--color-*`/`--s-*`/`--r-*`). 테스트 러너 없음 — 게이트는 `pnpm build`(`tsc -b && vite build`).

**Spec:** `docs/superpowers/specs/2026-09-04-retro-redesign-design.md`

## Global Constraints

- **작업 디렉터리는 `my-app/`.** 모든 경로는 이 문서에서 `my-app/` 기준 상대 경로로 적는다. 명령은 `my-app`에서 실행한다.
- **패키지 매니저는 pnpm만.** 신규 런타임 의존성 추가 금지 — `@tiptap/extension-task-list`, `@tiptap/extension-task-item`은 **이미 `package.json`에 설치돼 있다**(등록만 안 돼 있음).
- **`api.yaml`이 SST.** 이 Phase는 API를 건드리지 않는다. 새 엔드포인트/필드를 상상해서 만들지 않는다.
- **FSD 레이어 규칙**: `app → pages → widgets → entities → shared`. 위젯은 `shared/api`를 직접 import하지 않고 `useArchiveApp()`을 통한다.
- **타이포 스케일은 `CLAUDE.md` §10 고정**: 12 / 16 / 18 + 기존 헤드라인 스케일(21·22·28·`clamp(32px,3.4vw,44px)`·`clamp(40px,5vw,48px)`). 13·14·15·17·20·26·30·46px 같은 사이값과 12px 미만은 **새로 만들지 않는다**.
- **여백은 4px 그리드(`--s-xxs:4 / --s-xs:8 / --s-sm:12 / --s-md:16 / --s-lg:24 / --s-xl:32`), 라운드는 `--r-xs:4 / --r-sm:6 / --r-md:8 / --r-lg:12 / --r-pill:9999`만 쓴다.** 색은 반드시 `var(--color-*)`.
- **i18n 하드코딩 금지.** 새 문구는 `src/shared/lib/i18n/keys.ts`에 키를 추가하고 `locales/{ko,en,ja,zh}.ts` **4개 전부**에 값을 넣는다(하나라도 빠지면 컴파일 에러).
- **테스트 러너 없음.** 각 태스크의 검증은 `pnpm build` 통과 + 명시된 `pnpm dev` 수동 확인이다.
- **매 태스크 후 커밋.** 커밋 메시지 끝에는 실행 세션 자신의 attribution 푸터(`Co-Authored-By:` + `Claude-Session:`)를 붙인다.
- **시작 전 확인**: 작업 트리에 이 계획과 무관한 CSS 수정이 남아 있을 수 있다. `git status`로 확인하고, 있으면 먼저 커밋하거나 stash 한 뒤 Task 1을 시작한다.

---

### Task 1: 파운데이션 — Pretendard 폰트 + 신규 i18n 키 14개

**Files:**
- Modify: `src/app/styles/tokens/typography.css`
- Modify: `src/shared/lib/i18n/keys.ts`
- Modify: `src/shared/lib/i18n/locales/ko.ts`, `en.ts`, `ja.ts`, `zh.ts`

**Interfaces:**
- Consumes: 없음
- Produces: 번역 키 `retro.title.default.{daily,weekly,monthly,yearly}`, `retro.editor.{titleHint,folderNone,content,contentHint,commitsRepoAll,commitsRepoMulti,materials,materialBlocks,expand}`, `retro.summary.aiSummary` — Task 3~11이 이 키들을 쓴다.

- [ ] **Step 1: Pretendard를 폰트 스택 맨 앞에 추가**

`src/app/styles/tokens/typography.css`의 `@import` 블록 마지막 줄 뒤에 추가:

```css
/* Pretendard: 한글 본문용 (Inter에 한글 글리프가 없어 시스템 폰트로 폴백되던 것을 대체) */
@import url('https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/static/pretendard.min.css');
```

같은 파일의 `--font-display`, `--font-text` 값 맨 앞에 `"Pretendard"`를 넣는다(모노 `--font-mono`는 **건드리지 않는다** — Commit Mono 유지):

```css
  --font-display:
    "Pretendard", "Inter", -apple-system, BlinkMacSystemFont, system-ui,
    "Helvetica Neue", Helvetica, Arial, sans-serif;
  --font-text:
    "Pretendard", "Inter", -apple-system, BlinkMacSystemFont, system-ui,
    "Helvetica Neue", Helvetica, Arial, sans-serif;
```

- [ ] **Step 2: 번역 키 16개를 `keys.ts`에 추가**

`src/shared/lib/i18n/keys.ts`에서 기존 `| "retro.editor.autoSaved"` 줄을 찾아 그 아래에 추가한다:

```ts
  | "retro.title.default.daily"
  | "retro.title.default.weekly"
  | "retro.title.default.monthly"
  | "retro.title.default.yearly"
  | "retro.editor.titleHint"
  | "retro.editor.folderNone"
  | "retro.editor.content"
  | "retro.editor.contentHint"
  | "retro.editor.commitsRepoAll"
  | "retro.editor.commitsRepoMulti"
  | "retro.editor.materials"
  | "retro.editor.materialBlocks"
  | "retro.editor.expand"
  | "retro.summary.aiSummary"
```

- [ ] **Step 3: `locales/ko.ts`에 값 추가**

`"retro.editor.autoSaved": ...` 항목 뒤에 추가:

```ts
  "retro.title.default.daily": "{date} 일일 회고",
  "retro.title.default.weekly": "{date} 주간 회고",
  "retro.title.default.monthly": "{date} 월간 회고",
  "retro.title.default.yearly": "{date} 연간 회고",
  "retro.editor.titleHint": "비워두면 {title}(으)로 저장됩니다",
  "retro.editor.folderNone": "폴더 없음",
  "retro.editor.content": "회고 본문 · Content",
  "retro.editor.contentHint": "Markdown · / 명령으로 블록 추가",
  "retro.editor.commitsRepoAll": "모두 {repo}",
  "retro.editor.commitsRepoMulti": "{count}개 저장소",
  "retro.editor.materials": "이 회고의 재료",
  "retro.editor.materialBlocks": "본문 블록",
  "retro.editor.expand": "전체 화면으로 쓰기",
  "retro.summary.aiSummary": "AI 요약",
```

- [ ] **Step 4: `locales/en.ts`에 값 추가**

```ts
  "retro.title.default.daily": "{date} Daily Retrospective",
  "retro.title.default.weekly": "{date} Weekly Retrospective",
  "retro.title.default.monthly": "{date} Monthly Retrospective",
  "retro.title.default.yearly": "{date} Annual Retrospective",
  "retro.editor.titleHint": "Saved as \"{title}\" if left blank",
  "retro.editor.folderNone": "No folder",
  "retro.editor.content": "Content",
  "retro.editor.contentHint": "Markdown · press / to add a block",
  "retro.editor.commitsRepoAll": "All in {repo}",
  "retro.editor.commitsRepoMulti": "{count} repositories",
  "retro.editor.materials": "Sources for this entry",
  "retro.editor.materialBlocks": "Content blocks",
  "retro.editor.expand": "Write full screen",
  "retro.summary.aiSummary": "AI summary",
```

- [ ] **Step 5: `locales/ja.ts`에 값 추가**

```ts
  "retro.title.default.daily": "{date} デイリー振り返り",
  "retro.title.default.weekly": "{date} ウィークリー振り返り",
  "retro.title.default.monthly": "{date} マンスリー振り返り",
  "retro.title.default.yearly": "{date} 年間振り返り",
  "retro.editor.titleHint": "空欄のままだと「{title}」として保存されます",
  "retro.editor.folderNone": "フォルダなし",
  "retro.editor.content": "本文 · Content",
  "retro.editor.contentHint": "Markdown · / でブロックを追加",
  "retro.editor.commitsRepoAll": "すべて {repo}",
  "retro.editor.commitsRepoMulti": "{count} 個のリポジトリ",
  "retro.editor.materials": "この振り返りの材料",
  "retro.editor.materialBlocks": "本文ブロック",
  "retro.editor.expand": "全画面で書く",
  "retro.summary.aiSummary": "AI 要約",
```

- [ ] **Step 6: `locales/zh.ts`에 값 추가**

```ts
  "retro.title.default.daily": "{date} 每日回顾",
  "retro.title.default.weekly": "{date} 每周回顾",
  "retro.title.default.monthly": "{date} 每月回顾",
  "retro.title.default.yearly": "{date} 年度回顾",
  "retro.editor.titleHint": "留空将保存为「{title}」",
  "retro.editor.folderNone": "无文件夹",
  "retro.editor.content": "正文 · Content",
  "retro.editor.contentHint": "Markdown · 按 / 添加块",
  "retro.editor.commitsRepoAll": "全部来自 {repo}",
  "retro.editor.commitsRepoMulti": "{count} 个仓库",
  "retro.editor.materials": "这篇回顾的素材",
  "retro.editor.materialBlocks": "正文块",
  "retro.editor.expand": "全屏书写",
  "retro.summary.aiSummary": "AI 摘要",
```

- [ ] **Step 7: 빌드 검증**

Run: `pnpm build`
Expected: PASS. (키를 4개 로케일 중 하나라도 빠뜨리면 `Property '...' is missing` 타입 에러가 난다 — 그 경우 누락 로케일을 채운다.)

- [ ] **Step 8: 수동 확인**

Run: `pnpm dev` → 회고 페이지를 열어 한글 본문이 Pretendard로 렌더되는지 확인(개발자도구 Computed → font-family 첫 항목이 Pretendard).

- [ ] **Step 9: 커밋**

```bash
git add src/app/styles/tokens/typography.css src/shared/lib/i18n
git commit -m "feat(retro): add Pretendard font stack and editor redesign i18n keys"
```

---

### Task 2: 문서형 레이아웃 셸

기존 요소를 **그대로 둔 채** 컨테이너만 "본문 컬럼 + 우측 sticky 레일"로 바꾼다. 이 태스크에서는 헤더 액션들을 레일로 옮기기만 하고 내용은 손대지 않는다.

**Files:**
- Modify: `src/app/styles/widgets/retro.css` (파일 끝에 추가)
- Modify: `src/widgets/retrospective-studio/ui/RetroEditor.tsx`

**Interfaces:**
- Consumes: Task 1의 폰트 토큰
- Produces: CSS 클래스 `.retro-doc`, `.retro-doc-main`, `.retro-doc-rail`, `.retro-doc-head`, `.retro-doc-meta`, `.retro-doc-type`, `.retro-doc-date`, `.retro-doc-title`, `.retro-doc-hint`, `.retro-doc-section`, `.retro-doc-section-head`, `.retro-doc-section-title`, `.retro-doc-section-meta`, `.retro-doc-list`, `.retro-doc-row`, `.retro-doc-empty`, `.retro-doc-banner`, `.retro-rail-group`, `.retro-rail-label`, `.retro-rail-stat`, `.retro-rail-divider` — Task 3~9가 이 클래스들을 쓴다.

- [ ] **Step 1: `retro.css` 끝에 문서형 스타일 추가**

```css
/* ─── 문서형 회고 에디터 ─────────────────────────────────────────────── */
.retro-doc {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-start;
  gap: var(--s-xl);
}

.retro-doc-main {
  flex: 1 1 320px;
  min-width: 0;
  max-width: 720px;
  display: flex;
  flex-direction: column;
}

.retro-doc-rail {
  flex: 1 1 240px;
  min-width: 0;
  max-width: 320px;
  position: sticky;
  top: var(--s-md);
  align-self: flex-start;
  display: flex;
  flex-direction: column;
  gap: var(--s-lg);
  padding-top: var(--s-xs);
}

.retro-doc-head {
  display: flex;
  flex-direction: column;
  gap: var(--s-sm);
  padding-bottom: var(--s-lg);
  border-bottom: 1px solid var(--color-hairline);
}

.retro-doc-meta {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: var(--s-xs);
  font-size: 12px;
  color: var(--color-body-muted);
}

.retro-doc-type {
  padding: 4px 8px;
  border-radius: var(--r-sm);
  background: var(--color-tile-2);
  border: 1px solid var(--color-hairline);
  color: var(--color-ink);
}

.retro-doc-date {
  font-family: var(--font-mono);
  color: var(--color-ink-muted-48);
}

.retro-doc-title {
  width: 100%;
  box-sizing: border-box;
  padding: 0;
  background: transparent;
  border: none;
  outline: none;
  color: var(--color-ink);
  font-family: var(--font-display);
  font-size: clamp(32px, 3.4vw, 44px);
  font-weight: 600;
  line-height: 1.1;
  letter-spacing: var(--headline-tracking);
  caret-color: var(--color-primary);
}

.retro-doc-title::placeholder {
  color: var(--color-ink-muted-32);
}

.retro-doc-hint {
  margin: 0;
  font-size: 12px;
  color: var(--color-ink-muted-48);
}

.retro-doc-section {
  display: flex;
  flex-direction: column;
  gap: var(--s-sm);
  padding: var(--s-lg) 0;
  border-bottom: 1px solid var(--color-hairline);
}

.retro-doc-section:last-child {
  border-bottom: none;
}

.retro-doc-section-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--s-sm);
  flex-wrap: wrap;
}

.retro-doc-section-title {
  margin: 0;
  font-size: 18px;
  font-weight: 600;
  color: var(--color-ink);
}

.retro-doc-section-meta {
  display: flex;
  align-items: center;
  gap: var(--s-xs);
  font-size: 12px;
  color: var(--color-ink-muted-48);
}

.retro-doc-list {
  display: flex;
  flex-direction: column;
}

.retro-doc-row {
  display: grid;
  grid-template-columns: 1fr auto;
  align-items: baseline;
  gap: var(--s-sm);
  padding: var(--s-xs) 0;
  border-bottom: 1px solid var(--color-divider-soft);
}

.retro-doc-row:last-child {
  border-bottom: none;
}

.retro-doc-empty {
  margin: 0;
  font-size: 16px;
  color: var(--color-ink-muted-48);
}

.retro-doc-banner {
  display: flex;
  align-items: flex-start;
  gap: var(--s-sm);
  padding: var(--s-sm) var(--s-md);
  border-radius: var(--r-md);
  background: color-mix(in srgb, var(--color-warn) 7%, transparent);
  border: 1px solid color-mix(in srgb, var(--color-warn) 32%, transparent);
  font-size: 12px;
  color: var(--color-ink-muted-80);
}

.retro-doc-banner[data-tone="ai"] {
  background: var(--color-chip-translucent);
  border-color: color-mix(in srgb, var(--color-primary) 32%, transparent);
}

.retro-doc-banner[data-tone="danger"] {
  background: color-mix(in srgb, var(--color-danger) 6%, transparent);
  border-color: color-mix(in srgb, var(--color-danger) 30%, transparent);
}

.retro-rail-group {
  display: flex;
  flex-direction: column;
  gap: var(--s-sm);
}

.retro-rail-label {
  font-size: 12px;
  letter-spacing: var(--eyebrow-tracking);
  color: var(--color-ink-muted-48);
}

.retro-rail-stat {
  display: flex;
  justify-content: space-between;
  gap: var(--s-xs);
  font-size: 12px;
  color: var(--color-body-muted);
}

.retro-rail-stat > b {
  font-weight: 500;
  color: var(--color-ink-muted-80);
}

.retro-rail-divider {
  height: 1px;
  background: var(--color-hairline);
}

@media (max-width: 900px) {
  .retro-doc-rail {
    position: static;
    max-width: none;
  }
}
```

- [ ] **Step 2: `RetroEditor.tsx`의 반환 구조를 셸로 교체**

`return (` 이후 `<article>` 전체를 아래 구조로 바꾼다. **이 단계에서는 기존 JSX 조각을 그대로 옮겨 담기만 한다**(내용 수정 없음):

```tsx
  return (
    <article>
      <button type="button" className="retro-back-link" onClick={onBack}>
        <ChevronLeft size={15} />
        {t("retro.gallery.backToList")}
      </button>

      <div className="retro-doc">
        <div className="retro-doc-main">
          {/* 기존: 제목 input + 서브카피 + 완료한 작업 + 커밋 + 본문 섹션 */}
          {/* → Task 3~6, 9에서 각 영역을 문서형 컴포넌트로 교체한다. */}
        </div>

        <aside className="retro-doc-rail">
          {/* 기존 헤더 우측 액션(자동저장 안내 · Pill · Push · 확장 버튼)을 그대로 옮겨온다.
              → Task 7에서 RetroDocRail 컴포넌트로 교체한다. */}
        </aside>
      </div>

      {expanded ? (
        <RetroExpandOverlay
          entry={entry}
          onUpdate={onUpdate}
          onClose={() => setExpanded(false)}
          spellCheck={state.settings.spellCheck}
        />
      ) : null}

      {revertConfirmOpen ? (
        <ConfirmModal
          open
          title={t("retro.summary.revertConfirmTitle")}
          message={t("retro.summary.revertConfirmMessage")}
          confirmLabel={t("retro.summary.revertConfirm")}
          cancelLabel={t("retro.summary.revertCancel")}
          onConfirm={() => {
            setRevertConfirmOpen(false)
            onRevertSummary?.()
          }}
          onCancel={() => setRevertConfirmOpen(false)}
        />
      ) : null}
    </article>
  )
```

구체적으로: 기존 헤더 `<div style={{display:"flex", ...}}>` 안의 **왼쪽 블록(eyebrow + 날짜)** 은 `.retro-doc-main` 맨 위로, **오른쪽 액션 묶음(자동저장 span, 되돌리기 버튼, 확장 버튼, Pill, Push 버튼)** 은 `.retro-doc-rail` 안으로 옮긴다. 기존 배너(`DisconnectBanner` 2종), 제목 input, 서브카피, 완료 작업 섹션, 커밋 섹션, 본문 섹션, 요약 상태 배너는 순서를 유지한 채 `.retro-doc-main` 안에 그대로 둔다. `{!expanded && (...)}` 분기도 그대로 유지한다.

- [ ] **Step 3: 빌드 검증**

Run: `pnpm build`
Expected: PASS

- [ ] **Step 4: 수동 확인**

Run: `pnpm dev` → 회고 → 아무 일간 회고 열기.
확인: (1) 본문이 왼쪽 컬럼(최대 720px)에, 액션이 오른쪽 레일에 있다. (2) 스크롤 시 레일이 따라온다. (3) 브라우저 폭을 900px 아래로 줄이면 레일이 본문 아래로 내려오고 sticky가 풀린다.

- [ ] **Step 5: 커밋**

```bash
git add src/app/styles/widgets/retro.css src/widgets/retrospective-studio/ui/RetroEditor.tsx
git commit -m "refactor(retro): move editor to document layout shell with sticky rail"
```

---

### Task 3: 문서 머리 — 타입 · 날짜 · 자유 제목

**Files:**
- Create: `src/widgets/retrospective-studio/model/formatDefaultEntryTitle.ts`
- Create: `src/widgets/retrospective-studio/ui/RetroDocHead.tsx`
- Modify: `src/widgets/retrospective-studio/ui/RetroEditor.tsx`

**Interfaces:**
- Consumes: Task 1의 `retro.title.default.*`, `retro.editor.titleHint`; Task 2의 `.retro-doc-head` 계열 클래스
- Produces:
  - `formatDefaultEntryTitle(t: TranslateFn, dateKey: string, retroType: RetrospectiveType): string`
  - `<RetroDocHead entry folders onTitleChange onFolderChange />` — Task 4가 `folders`/`onFolderChange`를 실제로 연결한다.

- [ ] **Step 1: 기본 제목 헬퍼 작성**

`src/widgets/retrospective-studio/model/formatDefaultEntryTitle.ts`:

```ts
import type { RetrospectiveType } from "@/entities/entry/model/types";
import type { TranslateFn, TranslationKey } from "@/shared/lib/i18n";

const DEFAULT_TITLE_KEY: Record<RetrospectiveType, TranslationKey> = {
  daily: "retro.title.default.daily",
  weekly: "retro.title.default.weekly",
  monthly: "retro.title.default.monthly",
  yearly: "retro.title.default.yearly",
};

/**
 * 제목이 비었을 때 쓰는 기본 제목("2026-09-03 일일 회고").
 * 서버가 빈 제목을 채워주기 전까지는 FE 표시용 폴백으로도 쓴다.
 */
export function formatDefaultEntryTitle(
  t: TranslateFn,
  dateKey: string,
  retroType: RetrospectiveType,
): string {
  return t(DEFAULT_TITLE_KEY[retroType], { date: dateKey });
}
```

- [ ] **Step 2: `RetroDocHead` 컴포넌트 작성**

`src/widgets/retrospective-studio/ui/RetroDocHead.tsx`:

```tsx
import type { JournalEntry } from "@/entities/entry/model/types"
import type { Folder } from "@/entities/folder/model/types"
import { formatFullDate, fromDateKey } from "@/shared/lib/date"
import { useTranslation } from "@/shared/lib/i18n"
import { RETRO_LABEL_KEY } from "../model/constants"
import { formatDefaultEntryTitle } from "../model/formatDefaultEntryTitle"

export interface RetroDocHeadProps {
  entry: JournalEntry
  folders: Folder[]
  onTitleChange: (title: string) => void
  onFolderChange: (folderId: string | null) => void
}

/**
 * 문서 머리 — 회고 타입(읽기 전용) · 폴더 · 날짜 · 자유 제목.
 * 타입은 엔트리 생성 후 바꿀 수 없으므로(주간/월간/연간은 AI 요약 엔트리) 세그먼트가
 * 아니라 현재 타입 1개만 표시한다.
 */
export function RetroDocHead({
  entry,
  folders,
  onTitleChange,
  onFolderChange,
}: RetroDocHeadProps) {
  // folders / onFolderChange 는 Task 4(폴더 선택기)에서 실제로 쓰인다. props 시그니처를
  // 지금 확정해 두어야 Task 4 가 컴포넌트 경계를 다시 손대지 않는다.
  void folders
  void onFolderChange

  const { t } = useTranslation()
  const defaultTitle = formatDefaultEntryTitle(t, entry.dateKey, entry.retroType)

  return (
    <header className="retro-doc-head">
      <div className="retro-doc-meta">
        <span className="retro-doc-type">{t(RETRO_LABEL_KEY[entry.retroType])}</span>
        {/* Task 4에서 EntryFolderPicker 로 교체 */}
        <span className="retro-doc-date">
          {formatFullDate(fromDateKey(entry.dateKey))}
        </span>
      </div>

      <input
        className="retro-doc-title"
        value={entry.title}
        readOnly={entry.isSummary}
        title={entry.isSummary ? t("retro.summary.titleReadOnly") : undefined}
        placeholder={defaultTitle}
        onChange={(e) => onTitleChange(e.target.value)}
      />

      {!entry.isSummary ? (
        <p className="retro-doc-hint">
          {t("retro.editor.titleHint", { title: defaultTitle })}
        </p>
      ) : null}
    </header>
  )
}
```

위 `void folders` / `void onFolderChange` 두 줄은 Task 4 Step 3에서 실제 사용으로 교체하며 지운다.

- [ ] **Step 3: `RetroEditor`에서 기존 머리 부분을 교체**

`RetroEditor.tsx`에서 (a) `.retro-doc-main` 맨 위로 옮겨둔 eyebrow+날짜 블록, (b) 기존 `<input className="retro-title-input" ...>`, (c) 그 아래 서브카피 `<p>{t("retro.editor.sub")}</p>` 세 조각을 지우고 아래로 대체한다:

```tsx
          <RetroDocHead
            entry={entry}
            folders={[]}
            onTitleChange={(title) => onUpdate({ title })}
            onFolderChange={() => {}}
          />
```

import 추가: `import { RetroDocHead } from "./RetroDocHead"`. 더 이상 쓰이지 않게 된 import(`formatFullDate`, `fromDateKey`, `RETRO_LABEL_KEY`, 사용하지 않는 lucide 아이콘)를 정리한다.

- [ ] **Step 4: 빌드 검증**

Run: `pnpm build`
Expected: PASS

- [ ] **Step 5: 수동 확인**

Run: `pnpm dev` → 일간 회고 열기.
확인: (1) 타입 pill·날짜·큰 제목 입력이 보인다. (2) 제목을 지우면 placeholder로 `2026-09-03 일일 회고`가 뜨고 힌트 문구가 그 제목을 보여준다. (3) 요약(주간/월간/연간) 회고를 열면 제목이 읽기 전용이고 힌트가 없다.

- [ ] **Step 6: 커밋**

```bash
git add src/widgets/retrospective-studio
git commit -m "feat(retro): add document head with free-form title and default-title fallback"
```

---

### Task 4: 폴더 선택기

**Files:**
- Create: `src/widgets/retrospective-studio/ui/EntryFolderPicker.tsx`
- Modify: `src/app/styles/widgets/retro.css`
- Modify: `src/widgets/retrospective-studio/ui/RetroDocHead.tsx`
- Modify: `src/widgets/retrospective-studio/ui/RetroEditor.tsx`
- Modify: `src/widgets/retrospective-studio/ui/RetrospectiveStudio.tsx`

**Interfaces:**
- Consumes: Task 3의 `RetroDocHead` props(`folders`, `onFolderChange`), `retro.editor.folderNone`
- Produces: `<EntryFolderPicker folders value onChange />`

- [ ] **Step 1: 폴더 선택기 컴포넌트 작성**

`src/widgets/retrospective-studio/ui/EntryFolderPicker.tsx`:

```tsx
import { useEffect, useRef, useState } from "react"
import { ChevronDown, Folder as FolderIcon } from "lucide-react"
import type { Folder } from "@/entities/folder/model/types"
import { useTranslation } from "@/shared/lib/i18n"

export interface EntryFolderPickerProps {
  folders: Folder[]
  value: string | null
  onChange: (folderId: string | null) => void
}

/** 폴더 경로를 "부모 / 자식" 으로 만든다. 손상된 데이터의 순환 참조는 깊이 20에서 끊는다. */
function folderPath(folders: Folder[], id: string): string {
  const names: string[] = []
  let currentId: string | null = id
  let guard = 0
  while (currentId && guard < 20) {
    const target = currentId
    const found = folders.find((f) => f.id === target)
    if (!found) break
    names.unshift(found.name)
    currentId = found.parentFolderId
    guard += 1
  }
  return names.join(" / ")
}

/** 문서 머리의 폴더 선택 드롭다운. 선택 시 회고를 그 폴더로 옮긴다. */
export function EntryFolderPicker({
  folders,
  value,
  onChange,
}: EntryFolderPickerProps) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onDocPointerDown = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false)
    }
    document.addEventListener("mousedown", onDocPointerDown)
    document.addEventListener("keydown", onKey)
    return () => {
      document.removeEventListener("mousedown", onDocPointerDown)
      document.removeEventListener("keydown", onKey)
    }
  }, [open])

  const label = value ? folderPath(folders, value) : t("retro.editor.folderNone")

  const pick = (folderId: string | null) => {
    setOpen(false)
    if (folderId !== value) onChange(folderId)
  }

  return (
    <div className="retro-folder-pick" ref={rootRef}>
      <button
        type="button"
        className="retro-folder-pick-btn"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}>
        <FolderIcon size={12} />
        {label}
        <ChevronDown size={12} />
      </button>

      {open ? (
        <div className="retro-folder-pick-menu" role="listbox">
          <button
            type="button"
            role="option"
            aria-selected={value === null}
            className="retro-folder-pick-item"
            data-active={value === null ? "true" : undefined}
            onClick={() => pick(null)}>
            {t("retro.editor.folderNone")}
          </button>
          {folders.map((folder) => (
            <button
              key={folder.id}
              type="button"
              role="option"
              aria-selected={value === folder.id}
              className="retro-folder-pick-item"
              data-active={value === folder.id ? "true" : undefined}
              onClick={() => pick(folder.id)}>
              {folderPath(folders, folder.id)}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  )
}
```

- [ ] **Step 2: `retro.css` 끝에 선택기 스타일 추가**

```css
.retro-folder-pick {
  position: relative;
}

.retro-folder-pick-btn {
  display: inline-flex;
  align-items: center;
  gap: var(--s-xxs);
  padding: 4px 8px;
  border-radius: var(--r-sm);
  background: var(--color-tile-2);
  border: 1px solid var(--color-hairline);
  color: var(--color-ink-muted-80);
  font-size: 12px;
  cursor: pointer;
}

.retro-folder-pick-btn:hover {
  color: var(--color-ink);
  border-color: var(--color-hairline-strong);
}

.retro-folder-pick-menu {
  position: absolute;
  top: calc(100% + var(--s-xxs));
  left: 0;
  z-index: 41;
  min-width: 200px;
  max-height: 280px;
  overflow: auto;
  padding: var(--s-xxs);
  display: flex;
  flex-direction: column;
  gap: 2px;
  background: var(--color-tile-1);
  border: 1px solid var(--color-divider-soft);
  border-radius: var(--r-md);
  box-shadow: var(--shadow-popover);
}

.retro-folder-pick-item {
  padding: var(--s-xs);
  border: none;
  border-radius: var(--r-sm);
  background: transparent;
  color: var(--color-body-muted);
  font-size: 12px;
  text-align: left;
  cursor: pointer;
}

.retro-folder-pick-item:hover {
  background: var(--color-tile-3);
  color: var(--color-ink);
}

.retro-folder-pick-item[data-active="true"] {
  color: var(--color-ink);
}
```

- [ ] **Step 3: `RetroDocHead`에 선택기 연결**

`RetroDocHead.tsx`에서 Task 3이 넣어둔 `void folders` / `void onFolderChange` 두 줄과 그 위 주석을 지우고, `{/* Task 4에서 EntryFolderPicker 로 교체 */}` 주석 자리에 넣는다:

```tsx
        <EntryFolderPicker
          folders={folders}
          value={entry.folderId}
          onChange={onFolderChange}
        />
```

import 추가: `import { EntryFolderPicker } from "./EntryFolderPicker"`.

- [ ] **Step 4: `RetroEditor`에 props 통과 + `RetrospectiveStudio`에서 주입**

`RetroEditor.tsx`의 `RetroEditorProps`에 추가:

```tsx
  /** 폴더 선택기에 쓸 전체 폴더 목록. */
  folders: Folder[]
  /** 폴더 이동. null 이면 루트로 옮긴다. */
  onFolderChange: (folderId: string | null) => void
```

`import type { Folder } from "@/entities/folder/model/types"`를 추가하고, 구조 분해에 `folders`, `onFolderChange`를 넣은 뒤 `RetroDocHead` 호출을 실제 값으로 바꾼다:

```tsx
          <RetroDocHead
            entry={entry}
            folders={folders}
            onTitleChange={(title) => onUpdate({ title })}
            onFolderChange={onFolderChange}
          />
```

`RetrospectiveStudio.tsx`의 `<RetroEditor ... />` 호출에 추가:

```tsx
          folders={state.folders}
          onFolderChange={(folderId) => {
            void moveEntryToFolder(active.id, active.retroType, folderId).then(() => {
              if (isFolderView) folderContents.refetch()
            })
          }}
```

- [ ] **Step 5: 빌드 검증**

Run: `pnpm build`
Expected: PASS

- [ ] **Step 6: 수동 확인**

Run: `pnpm dev` → 폴더를 하나 만들고 회고를 연다.
확인: (1) 문서 머리에 "폴더 없음"이 뜬다. (2) 클릭 → 폴더 목록이 뜨고 선택하면 라벨이 그 폴더 경로로 바뀐다. (3) 갤러리로 돌아가 그 폴더에 들어가면 회고가 들어가 있다. (4) 바깥 클릭/ESC로 드롭다운이 닫힌다.

- [ ] **Step 7: 커밋**

```bash
git add src/app/styles/widgets/retro.css src/widgets/retrospective-studio
git commit -m "feat(retro): add folder picker to the editor document head"
```

---

### Task 5: 완료한 작업 섹션 문서형 전환

**Files:**
- Create: `src/widgets/retrospective-studio/ui/RetroCompletedSection.tsx`
- Modify: `src/widgets/retrospective-studio/ui/RetroEditor.tsx`

**Interfaces:**
- Consumes: Task 2의 `.retro-doc-section` 계열 클래스
- Produces: `<RetroCompletedSection todos={{ id: string; title: string }[]} />`

- [ ] **Step 1: 컴포넌트 작성**

`src/widgets/retrospective-studio/ui/RetroCompletedSection.tsx`:

```tsx
import { CheckCircle } from "lucide-react"
import { useTranslation } from "@/shared/lib/i18n"

export interface RetroCompletedSectionProps {
  todos: { id: string; title: string }[]
}

/**
 * 일간 회고의 "완료한 작업" 섹션 — 읽기 전용 목록.
 * (할 일에서 끌어오는 액션은 범위에서 제외됨 — 설계문서 결정 10)
 */
export function RetroCompletedSection({ todos }: RetroCompletedSectionProps) {
  const { t } = useTranslation()

  return (
    <section className="retro-doc-section">
      <div className="retro-doc-section-head">
        <h2 className="retro-doc-section-title">{t("retro.editor.completed")}</h2>
        <span className="retro-doc-section-meta">{todos.length}</span>
      </div>

      {todos.length === 0 ? (
        <p className="retro-doc-empty">{t("retro.editor.noCompleted")}</p>
      ) : (
        <div className="retro-doc-list">
          {todos.map((todo) => (
            <div key={todo.id} className="retro-doc-row">
              <span
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "var(--s-xs)",
                  fontSize: 16,
                  color: "var(--color-ink-muted-80)",
                }}>
                <CheckCircle size={14} style={{ color: "var(--color-status-done)" }} />
                {todo.title}
              </span>
              <span />
            </div>
          ))}
        </div>
      )}
    </section>
  )
}
```

- [ ] **Step 2: `RetroEditor`에서 기존 완료 작업 `<section className="section-card">` 블록을 교체**

```tsx
          {isDailyEntry && <RetroCompletedSection todos={completedTodos} />}
```

import 추가: `import { RetroCompletedSection } from "./RetroCompletedSection"`. 더 이상 쓰지 않는 `CheckCircle` import를 `RetroEditor`에서 제거한다.

- [ ] **Step 3: 빌드 검증**

Run: `pnpm build`
Expected: PASS

- [ ] **Step 4: 수동 확인**

Run: `pnpm dev` → 완료한 할 일이 있는 날짜와 없는 날짜의 일간 회고를 각각 연다.
확인: 카드 테두리 없이 구분선만 있는 문서형 섹션으로 보이고, 개수가 우측에, 빈 날은 안내 문구만 나온다. **"할 일에서 가져오기" 링크는 없어야 한다.**

- [ ] **Step 5: 커밋**

```bash
git add src/widgets/retrospective-studio
git commit -m "feat(retro): convert completed-todos section to document style"
```

---

### Task 6: 커밋 섹션 문서형 전환 + 저장소 요약 줄

**Files:**
- Modify: `src/widgets/retrospective-studio/ui/RetroCommitsSection.tsx`
- Modify: `src/app/styles/widgets/retro.css`

**Interfaces:**
- Consumes: Task 1의 `retro.editor.commitsRepoAll` / `retro.editor.commitsRepoMulti`; Task 2의 `.retro-doc-section` 계열
- Produces: 변경된 `RetroCommitsSection` (props 시그니처는 그대로 — `commits`, `loading`, `onRefresh`, `githubConnectedAs`, `hasVerifiedEmails`, `isToday`)

- [ ] **Step 1: `RetroCommitsSection`의 반환부를 문서형으로 교체**

`return (` 이후 전체를 아래로 바꾼다(파일 상단 import는 `ExternalLink`, `RefreshCw`만 남기고 `GitCommit` 제거):

```tsx
  const repoNames = Array.from(new Set(commits.map((c) => c.fullName)))
  const repoSummary =
    repoNames.length === 1
      ? t("retro.editor.commitsRepoAll", { repo: repoNames[0] })
      : t("retro.editor.commitsRepoMulti", { count: repoNames.length })

  return (
    <section className="retro-doc-section">
      <div className="retro-doc-section-head">
        <h2 className="retro-doc-section-title">
          {isToday ? t("retro.editor.commits") : t("retro.editor.commitsPast")}
        </h2>
        <div className="retro-doc-section-meta">
          <span>@{githubConnectedAs}</span>
          <span>·</span>
          <span>{commits.length}</span>
          <button
            type="button"
            className="btn btn-utility"
            style={{ padding: "4px 8px", fontSize: 12 }}
            onClick={onRefresh}
            disabled={loading}
            title={t("retro.editor.loadCommits")}>
            <RefreshCw
              size={11}
              style={
                loading
                  ? { animation: "summary-spin 900ms linear infinite" }
                  : undefined
              }
            />
          </button>
        </div>
      </div>

      {loading ? (
        <p className="retro-doc-empty">{t("retro.editor.loadCommits")}…</p>
      ) : commits.length === 0 ? (
        <div style={{ display: "flex", flexDirection: "column", gap: "var(--s-xxs)" }}>
          <p className="retro-doc-empty">
            {!hasVerifiedEmails
              ? t("retro.github.noCommitsReconnect")
              : isToday
                ? t("retro.editor.noCommits")
                : t("retro.editor.noCommitsPast")}
          </p>
          {hasVerifiedEmails && (
            <a
              href="https://github.com/settings/emails"
              target="_blank"
              rel="noopener noreferrer"
              style={{
                fontSize: 12,
                color: "var(--color-primary)",
                textDecoration: "underline",
              }}>
              {t("retro.github.emailsSettingsLink")} ↗
            </a>
          )}
        </div>
      ) : (
        <>
          <div className="retro-doc-list">
            {commits.map((c) => (
              <div key={`${c.repositoryId}-${c.sha}`} className="retro-doc-row">
                <span className="retro-commit-msg">{c.message}</span>
                <a
                  className="retro-commit-sha"
                  href={c.htmlUrl}
                  target="_blank"
                  rel="noreferrer noopener"
                  title={c.sha}>
                  {c.sha.slice(0, 7)}
                  <ExternalLink size={10} />
                </a>
              </div>
            ))}
          </div>
          <span className="retro-doc-section-meta">{repoSummary}</span>
        </>
      )}
    </section>
  )
```

> 커밋 행에는 동기화 Pill을 붙이지 않는다 — 동기화는 회고 문서 단위(`entry.synced`)이고, 그 표시는 Task 7의 레일에 1개만 둔다(설계문서 §2.2③).

- [ ] **Step 2: `retro.css` 끝에 커밋 행 스타일 추가**

```css
.retro-commit-msg {
  font-family: var(--font-mono);
  font-size: 16px;
  line-height: 1.5;
  color: var(--color-ink-muted-80);
  word-break: break-word;
}

.retro-commit-sha {
  display: inline-flex;
  align-items: center;
  gap: var(--s-xxs);
  font-family: var(--font-mono);
  font-size: 12px;
  color: var(--color-ink-muted-48);
  text-decoration: none;
  white-space: nowrap;
}

.retro-commit-sha:hover {
  color: var(--color-primary-on-dark);
}
```

- [ ] **Step 3: 빌드 검증**

Run: `pnpm build`
Expected: PASS

- [ ] **Step 4: 수동 확인**

Run: `pnpm dev` → GitHub이 연결된 계정으로 커밋이 있는 날짜의 일간 회고를 연다.
확인: (1) 메시지 + sha 2열 목록. (2) 목록 아래 "모두 `owner/repo`" 요약(여러 저장소면 "N개 저장소"). (3) 새로고침 버튼 동작. (4) 커밋 0건일 때 기존 안내/재연결 링크가 그대로 나온다.

- [ ] **Step 5: 커밋**

```bash
git add src/app/styles/widgets/retro.css src/widgets/retrospective-studio/ui/RetroCommitsSection.tsx
git commit -m "feat(retro): convert commits section to document style with repo summary"
```

---

### Task 7: 우측 레일 — 상태 · 액션 · 재료 통계

**Files:**
- Create: `src/widgets/retrospective-studio/model/countContentBlocks.ts`
- Create: `src/widgets/retrospective-studio/ui/RetroDocRail.tsx`
- Modify: `src/widgets/retrospective-studio/ui/RetroEditor.tsx`

**Interfaces:**
- Consumes: Task 1의 `retro.editor.{materials,materialBlocks,expand}`; Task 2의 `.retro-rail-*`
- Produces:
  - `countContentBlocks(markdown: string): number`
  - `<RetroDocRail entry isGithubEnabled isGithubConnected canPush pushing completedCount commitCount onPush onExpand />`

- [ ] **Step 1: 본문 블록 수 헬퍼 작성**

`src/widgets/retrospective-studio/model/countContentBlocks.ts`:

```ts
/**
 * 마크다운 최상위 블록 수 — 빈 줄로 구분된 덩어리 개수.
 * 레일의 "본문 블록" 수치에 쓴다(구조화 필드가 없으므로 문단 진행률은 만들 수 없다).
 */
export function countContentBlocks(markdown: string): number {
  return markdown
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter((block) => block.length > 0).length;
}
```

- [ ] **Step 2: 레일 컴포넌트 작성**

`src/widgets/retrospective-studio/ui/RetroDocRail.tsx`:

```tsx
import { Check, Clock, GitCommit, Lock, Maximize2, Save } from "lucide-react"
import type { JournalEntry } from "@/entities/entry/model/types"
import { Pill } from "@/shared/ui/pill/Pill"
import { useTranslation } from "@/shared/lib/i18n"
import { countContentBlocks } from "../model/countContentBlocks"

export interface RetroDocRailProps {
  entry: JournalEntry
  /** 개발자 계정 등 GitHub 기능 사용 권한. false 면 동기화 영역 전체를 감춘다. */
  isGithubEnabled: boolean
  isGithubConnected: boolean
  canPush: boolean
  pushing: boolean
  completedCount: number
  commitCount: number
  onPush: () => void
  onExpand: () => void
}

/** 문서 우측 각주 레일 — 저장/동기화 상태, 액션 버튼, 이 회고의 재료. */
export function RetroDocRail({
  entry,
  isGithubEnabled,
  isGithubConnected,
  canPush,
  pushing,
  completedCount,
  commitCount,
  onPush,
  onExpand,
}: RetroDocRailProps) {
  const { t } = useTranslation()

  return (
    <>
      <div className="retro-rail-group">
        <span
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "var(--s-xxs)",
            fontSize: 12,
            color: "var(--color-ink-muted-48)",
          }}>
          <Save size={11} />
          {t("retro.editor.autoSaved")}
        </span>

        {isGithubEnabled ? (
          isGithubConnected ? (
            entry.synced ? (
              <Pill tone="green">
                <Check size={10} /> {t("retro.editor.synced")}
              </Pill>
            ) : (
              <Pill tone="warn">
                <Clock size={10} /> {t("retro.editor.pending")}
              </Pill>
            )
          ) : (
            <Pill tone="ghost">
              <Lock size={10} /> {t("settings.github.notConnected")}
            </Pill>
          )
        ) : null}
      </div>

      <div className="retro-rail-group">
        {isGithubEnabled ? (
          <button
            type="button"
            className="btn btn-primary"
            style={{ justifyContent: "center" }}
            disabled={!canPush || pushing}
            onClick={onPush}
            title={
              !isGithubConnected
                ? t("retro.github.connectFromSettings")
                : !canPush
                  ? t("settings.github.pushTargetHint")
                  : ""
            }>
            <GitCommit size={14} />
            {pushing ? t("retro.editor.pushing") : t("retro.editor.save")}
          </button>
        ) : null}

        <button
          type="button"
          className="btn btn-utility"
          style={{ justifyContent: "center" }}
          onClick={onExpand}
          title={`${t("retro.editor.expand")} (Ctrl+Shift+F)`}>
          <Maximize2 size={14} />
          {t("retro.editor.expand")}
        </button>
      </div>

      <div className="retro-rail-divider" />

      <div className="retro-rail-group">
        <span className="retro-rail-label">{t("retro.editor.materials")}</span>
        <span className="retro-rail-stat">
          {t("retro.editor.completed")}
          <b>{completedCount}</b>
        </span>
        <span className="retro-rail-stat">
          {t("retro.editor.commits")}
          <b>{commitCount}</b>
        </span>
        <span className="retro-rail-stat">
          {t("retro.editor.materialBlocks")}
          <b>{countContentBlocks(entry.content)}</b>
        </span>
      </div>
    </>
  )
}
```

- [ ] **Step 3: `RetroEditor`의 `.retro-doc-rail` 안을 레일 컴포넌트로 교체**

Task 2에서 레일로 옮겨둔 조각들(자동저장 span, Pill, Push 버튼, 확장 버튼)을 전부 지우고:

```tsx
        <aside className="retro-doc-rail">
          <RetroDocRail
            entry={entry}
            isGithubEnabled={isGithubEnabled}
            isGithubConnected={isGithubConnected}
            canPush={canPush}
            pushing={pushing}
            completedCount={completedTodos.length}
            commitCount={commits.length}
            onPush={() => void handlePush()}
            onExpand={() => setExpanded(true)}
          />
        </aside>
```

import 추가: `import { RetroDocRail } from "./RetroDocRail"`. `RetroEditor`에서 더 이상 쓰지 않는 import(`Check`, `Clock`, `GitCommit`, `Lock`, `Maximize2`, `Save`, `Pill`)를 제거한다. `RotateCcw`와 `ConfirmModal`은 Task 9까지 남겨둔다.

- [ ] **Step 4: 빌드 검증**

Run: `pnpm build`
Expected: PASS

- [ ] **Step 5: 수동 확인**

Run: `pnpm dev` → 일간 회고 열기.
확인: (1) 레일에 자동저장 안내 + 동기화 Pill 1개 + Push/전체화면 버튼 + "이 회고의 재료" 3줄. (2) 본문에 문단을 추가하면 "본문 블록" 수가 늘어난다. (3) Push 대상이 없으면 Push 버튼이 비활성(툴팁 확인). (4) 전체화면 버튼과 `Ctrl+Shift+F`가 모두 확장 모드를 연다.

- [ ] **Step 6: 커밋**

```bash
git add src/widgets/retrospective-studio
git commit -m "feat(retro): add editor side rail with sync state, actions and source stats"
```

---

### Task 8: GitHub 배너 2종 문서형 전환

> 시안에는 배너에 "GitHub 연결" / "저장소 선택" 액션 버튼이 있지만, **이번 범위에서는 넣지 않는다**. 위젯에서 설정 화면으로 보내는 라우팅 경로가 아직 없고(라우트 상태는 `App.tsx`가 들고 있다), 메모리 보관 access token 때문에 `<a href>`로 전체 새로고침을 시키면 세션이 끊긴다. 현행 `DisconnectBanner`처럼 안내 문구만 문서형으로 바꾼다.

**Files:**
- Modify: `src/widgets/retrospective-studio/ui/RetroEditor.tsx`

**Interfaces:**
- Consumes: 기존 키 `retro.github.{notConnected,connectFromSettings}`, `settings.github.pushTargetHint`; Task 2의 `.retro-doc-banner`
- Produces: 없음(에디터 내부 렌더)

- [ ] **Step 1: 기존 `DisconnectBanner` 2종을 문서형 배너로 교체**

`RetroEditor.tsx`에서 아래 블록을

```tsx
      {isGithubEnabled && !isGithubConnected ? (
        <DisconnectBanner message={t("retro.github.notConnected")} />
      ) : isGithubEnabled && !pushTargetRepositoryId ? (
        <DisconnectBanner message={t("settings.github.pushTargetHint")} />
      ) : null}
```

`.retro-doc-main` 안(문서 머리 바로 아래)의 다음 코드로 바꾼다:

```tsx
          {isGithubEnabled && !isGithubConnected ? (
            <div className="retro-doc-banner" style={{ marginTop: "var(--s-md)" }}>
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: "var(--s-xxs)",
                  flex: 1,
                }}>
                <span style={{ color: "var(--color-ink)" }}>
                  {t("retro.github.notConnected")}
                </span>
                <span>{t("retro.github.connectFromSettings")}</span>
              </div>
            </div>
          ) : isGithubEnabled && !pushTargetRepositoryId ? (
            <div className="retro-doc-banner" style={{ marginTop: "var(--s-md)" }}>
              <span style={{ flex: 1 }}>{t("settings.github.pushTargetHint")}</span>
            </div>
          ) : null}
```

`DisconnectBanner` import를 제거한다.

- [ ] **Step 2: 빌드 검증**

Run: `pnpm build`
Expected: PASS

- [ ] **Step 3: 수동 확인**

Run: `pnpm dev` → 설정에서 GitHub 연결을 끊은 상태 / 연결했지만 Push 대상 저장소를 고르지 않은 상태로 각각 회고를 연다.
확인: 두 배너가 각각 앰버 톤으로 문서 머리 아래에 뜬다(액션 버튼은 없다). GitHub이 정상 연결 + Push 대상 지정된 상태에서는 둘 다 안 보인다.

- [ ] **Step 4: 커밋**

```bash
git add src/widgets/retrospective-studio/ui/RetroEditor.tsx
git commit -m "feat(retro): restyle GitHub connect/push-target banners for document layout"
```

---

### Task 9: AI 요약 엔트리 전용 UI

`entry.isSummary === true`(주간/월간/연간 요약)일 때만 나오는 배너다. 일간 회고에는 요약 UI를 넣지 않는다(설계문서 결정 11).

**Files:**
- Create: `src/widgets/retrospective-studio/ui/RetroSummaryBanner.tsx`
- Modify: `src/widgets/retrospective-studio/ui/RetroEditor.tsx`

**Interfaces:**
- Consumes: Task 1의 `retro.summary.aiSummary`; 기존 키 `retro.summary.{revert,statusPending,statusFailed}`; Task 2의 `.retro-doc-banner`
- Produces: `<RetroSummaryBanner entry onRevert />`

- [ ] **Step 1: 컴포넌트 작성**

`src/widgets/retrospective-studio/ui/RetroSummaryBanner.tsx`:

```tsx
import { RotateCcw, Sparkles } from "lucide-react"
import type { JournalEntry } from "@/entities/entry/model/types"
import { useTranslation } from "@/shared/lib/i18n"

export interface RetroSummaryBannerProps {
  entry: JournalEntry
  /** 되돌리기 확인 모달을 연다. */
  onRevert: () => void
}

/**
 * AI 요약 엔트리 전용 배너.
 *  - pending/in_progress: 생성 중 안내
 *  - failed: 실패 안내
 *  - completed: AI 요약 뱃지 + 원본으로 되돌리기
 */
export function RetroSummaryBanner({ entry, onRevert }: RetroSummaryBannerProps) {
  const { t } = useTranslation()

  if (entry.status && entry.status !== "completed") {
    const failed = entry.status === "failed"
    return (
      <div
        className="retro-doc-banner"
        data-tone={failed ? "danger" : undefined}
        style={{ marginTop: "var(--s-md)" }}>
        <span style={{ flex: 1 }}>
          {failed ? t("retro.summary.statusFailed") : t("retro.summary.statusPending")}
        </span>
      </div>
    )
  }

  return (
    <div className="retro-doc-banner" data-tone="ai" style={{ marginTop: "var(--s-md)" }}>
      <span
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: "var(--s-xxs)",
          color: "var(--color-primary-on-dark)",
          whiteSpace: "nowrap",
        }}>
        <Sparkles size={12} />
        {t("retro.summary.aiSummary")}
      </span>
      <span style={{ flex: 1 }}>{t("retro.summary.titleReadOnly")}</span>
      <button
        type="button"
        className="btn btn-utility"
        style={{ padding: "6px 12px", fontSize: 12, whiteSpace: "nowrap" }}
        onClick={onRevert}>
        <RotateCcw size={12} />
        {t("retro.summary.revert")}
      </button>
    </div>
  )
}
```

- [ ] **Step 2: `RetroEditor`에서 기존 요약 관련 조각을 교체**

(a) Task 2에서 레일로 옮겼던 "AI 요약 되돌리기" 버튼(`entry.isSummary && onRevertSummary` 조건의 `btn btn-utility`)과 (b) 본문 위의 미완성 요약 안내 `<div style={{padding:"10px 14px", ...}}>` 블록을 **둘 다 삭제**하고, `.retro-doc-main`의 배너 자리(Task 8 배너 바로 아래)에 넣는다:

```tsx
          {entry.isSummary && onRevertSummary ? (
            <RetroSummaryBanner
              entry={entry}
              onRevert={() => setRevertConfirmOpen(true)}
            />
          ) : null}
```

import 추가: `import { RetroSummaryBanner } from "./RetroSummaryBanner"`. `RotateCcw` import를 `RetroEditor`에서 제거한다(`ConfirmModal`과 `revertConfirmOpen` 상태는 그대로 유지).

- [ ] **Step 3: 빌드 검증**

Run: `pnpm build`
Expected: PASS

- [ ] **Step 4: 수동 확인**

Run: `pnpm dev` → 주간 요약 회고를 연다.
확인: (1) 보라 톤 AI 요약 배너 + "원본으로 되돌리기" 버튼. (2) 누르면 기존 확인 모달이 뜨고, 확인 시 원본으로 돌아간다. (3) **일간 회고에는 이 배너가 없다.** (4) 생성 중/실패 상태의 요약 항목에서는 각각 진행/실패 배너가 뜬다.

- [ ] **Step 5: 커밋**

```bash
git add src/widgets/retrospective-studio
git commit -m "feat(retro): add AI summary banner with revert and generation states"
```

---

### Task 10: 리치 에디터 체크박스(할 일) 블록

**Files:**
- Modify: `src/shared/ui/rich-editor/model/useRichEditorInstance.ts`
- Modify: `src/shared/ui/rich-editor/model/markdown.ts`
- Modify: `src/shared/ui/rich-editor/model/constants.ts`
- Modify: `src/shared/ui/rich-editor/ui/slash-menu/constants.ts`
- Modify: `src/app/styles/widgets/rich-editor.css`

**Interfaces:**
- Consumes: 없음(설치돼 있는 `@tiptap/extension-task-list`, `@tiptap/extension-task-item`)
- Produces: 슬래시 명령 `task`, 마크다운 `- [ ] / - [x]` 왕복

- [ ] **Step 1: TaskList/TaskItem 등록**

`useRichEditorInstance.ts` 상단 import에 추가:

```ts
import { TaskItem } from "@tiptap/extension-task-item";
import { TaskList } from "@tiptap/extension-task-list";
```

`extensions:` 배열에서 `Link.configure({...})` 다음 줄에 추가:

```ts
      TaskList,
      TaskItem.configure({ nested: true }),
```

- [ ] **Step 2: 마크다운 → HTML 변환에 체크박스 목록 처리 추가**

`markdown.ts`의 `markdownToHtml`을 아래로 바꾸고, 그 아래에 변환 함수를 추가한다:

```ts
export function markdownToHtml(markdown: string): string {
  if (!markdown) return "";
  // GitHub Alert를 우리의 callout div로 사전 변환
  const preprocessed = convertAlertsToHtml(markdown);
  const html = marked.parse(preprocessed, { async: false }) as string;
  return convertTaskListsToHtml(html);
}

/**
 * GFM 체크박스 목록(`<li><input type=checkbox>`)을 TipTap taskList 마크업으로 변환.
 * marked 는 체크박스를 li 안의 input 으로 내보내는데, TipTap TaskList 는
 * `ul[data-type="taskList"]` / `li[data-type="taskItem"]` 를 파싱한다.
 */
function convertTaskListsToHtml(html: string): string {
  if (typeof DOMParser === "undefined") return html;
  const doc = new DOMParser().parseFromString(html, "text/html");
  doc.querySelectorAll("ul").forEach((ul) => {
    const items = Array.from(ul.children).filter((el) => el.tagName === "LI");
    const isTaskList =
      items.length > 0 &&
      items.every((li) => li.querySelector('input[type="checkbox"]'));
    if (!isTaskList) return;
    ul.setAttribute("data-type", "taskList");
    items.forEach((li) => {
      const input = li.querySelector(
        'input[type="checkbox"]',
      ) as HTMLInputElement | null;
      li.setAttribute("data-type", "taskItem");
      li.setAttribute(
        "data-checked",
        input?.hasAttribute("checked") ? "true" : "false",
      );
      input?.remove();
    });
  });
  return doc.body.innerHTML;
}
```

- [ ] **Step 3: HTML → 마크다운 변환 룰 추가**

`markdown.ts`의 `turndown.addRule("toggle", {...})` 아래(= `htmlToMarkdown` 선언 위)에 추가:

```ts
// 체크박스(할 일) 목록 — TipTap taskItem → `- [ ] / - [x]`
turndown.addRule("taskItem", {
  filter: (node) =>
    node.nodeName === "LI" &&
    (node as HTMLElement).getAttribute("data-type") === "taskItem",
  replacement: (content, node) => {
    const el = node as HTMLElement;
    const checked = el.getAttribute("data-checked") === "true";
    const body = el.querySelector("div");
    const text = (body?.textContent ?? content).trim().replace(/\s*\n\s*/g, " ");
    return `- [${checked ? "x" : " "}] ${text}\n`;
  },
});
```

- [ ] **Step 4: 슬래시 명령 추가**

`src/shared/ui/rich-editor/model/constants.ts`의 `SLASH_COMMANDS` 배열에서 `id: "bullet"` 항목 **바로 뒤**에 추가:

```ts
  {
    id: "task",
    titleKo: "할 일 체크박스",
    titleEn: "To-do list",
    descKo: "체크박스로 표시하는 목록",
    descEn: "Checkbox list",
    keywords: [
      "task",
      "todo",
      "check",
      "checkbox",
      "할일",
      "체크",
      "체크박스",
      "タスク",
      "チェック",
      "任务",
      "清单",
    ],
    category: "list",
    icon: "ListChecks",
    execute: (editor, range) =>
      editor.chain().focus().deleteRange(range).toggleTaskList().run(),
  },
```

`src/shared/ui/rich-editor/ui/slash-menu/constants.ts`의 lucide import에 `ListChecks`를 추가하고 `ICONS` 맵에 `ListChecks,`를 추가한다.

- [ ] **Step 5: 체크박스 스타일 추가**

`src/app/styles/widgets/rich-editor.css` 끝에 추가:

```css
/* 할 일 체크박스 블록 */
.rich-editor .ProseMirror ul[data-type="taskList"] {
  list-style: none;
  padding-left: 0;
}

.rich-editor .ProseMirror ul[data-type="taskList"] li {
  display: flex;
  align-items: flex-start;
  gap: var(--s-xs);
}

.rich-editor .ProseMirror ul[data-type="taskList"] li > label {
  display: inline-flex;
  align-items: center;
  margin-top: 4px;
}

.rich-editor .ProseMirror ul[data-type="taskList"] li > div {
  flex: 1;
  min-width: 0;
}

.rich-editor .ProseMirror ul[data-type="taskList"] input[type="checkbox"] {
  width: 14px;
  height: 14px;
  accent-color: var(--color-primary);
  cursor: pointer;
}
```

- [ ] **Step 6: 빌드 검증**

Run: `pnpm build`
Expected: PASS. (`toggleTaskList` 타입 에러가 나면 Step 1의 확장 등록이 빠진 것이다.)

- [ ] **Step 7: 수동 확인 — 왕복 검증이 핵심**

Run: `pnpm dev` → 회고 본문에서:
1. `/` 입력 → "할 일 체크박스" 항목이 목록 그룹에 보이고 선택하면 체크박스 항목이 생긴다.
2. 항목 2개를 쓰고 하나를 체크한다.
3. **다른 회고로 갔다가 돌아온다**(마크다운으로 저장 → 다시 파싱). 체크 상태와 항목이 그대로 복원돼야 한다.
4. 체크박스 목록 위/아래에 일반 글머리 목록을 하나씩 두고 3번을 반복한다 — 일반 목록이 체크박스로 바뀌거나 그 반대가 되면 안 된다.

- [ ] **Step 8: 커밋**

```bash
git add src/shared/ui/rich-editor src/app/styles/widgets/rich-editor.css
git commit -m "feat(rich-editor): add to-do checkbox block with markdown round-trip"
```

---

### Task 11: 회고 본문 섹션 문서형 전환

**Files:**
- Modify: `src/widgets/retrospective-studio/ui/RetroEditor.tsx`

**Interfaces:**
- Consumes: Task 1의 `retro.editor.{content,contentHint}`; Task 2의 `.retro-doc-section` 계열
- Produces: 없음(에디터 내부 렌더)

- [ ] **Step 1: 본문 섹션을 카드에서 문서 섹션으로 교체**

`RetroEditor.tsx`의 `<section className="section-card section-card--retro-body">` 블록 전체를 아래로 바꾼다. 에러 바운더리와 `Suspense` 폴백은 그대로 유지하되 카드 껍데기와 아바타 헤더를 버린다:

```tsx
          <section className="retro-doc-section">
            <div className="retro-doc-section-head">
              <h2 className="retro-doc-section-title">{t("retro.editor.content")}</h2>
              <span className="retro-doc-section-meta">
                {t("retro.editor.contentHint")}
              </span>
            </div>

            <EditorErrorBoundary
              fallback={(error) => (
                <div
                  className="retro-doc-banner"
                  data-tone="danger"
                  style={{
                    fontFamily: "var(--font-mono)",
                    whiteSpace: "pre-wrap",
                  }}>
                  {error.message}
                </div>
              )}>
              <Suspense
                fallback={
                  <p className="retro-doc-empty" style={{ minHeight: 260 }}>
                    {t("retro.editor.loadCommits")}…
                  </p>
                }>
                <RichEditor
                  key={entry.id}
                  value={entry.content}
                  placeholder={t("retro.editor.learnedPlaceholder")}
                  onChange={(md) => onUpdate({ content: md })}
                  spellCheck={state.settings.spellCheck}
                />
              </Suspense>
            </EditorErrorBoundary>
          </section>
```

`Suspense` 폴백 문구는 기존 하드코딩 한국어("에디터 로딩 중...")를 쓰지 않기 위해 기존 키를 재사용한 것이다. 더 알맞은 문구를 원하면 Task 1과 같은 방식으로 키를 추가하되, **4개 로케일 전부**에 값을 넣어야 한다.

`BookOpen` import를 `RetroEditor`에서 제거한다.

- [ ] **Step 2: 빌드 검증**

Run: `pnpm build`
Expected: PASS

- [ ] **Step 3: 수동 확인**

Run: `pnpm dev` → 일간 회고 열기.
확인: (1) "회고 본문 · Content" 헤더와 우측 "Markdown · / 명령으로 블록 추가" 힌트. (2) 본문 영역이 카드 테두리 없이 문서 폭 전체를 쓴다. (3) 입력·자동 저장이 그대로 동작한다. (4) 요약 회고에서도 본문이 정상 렌더된다.

- [ ] **Step 4: 커밋**

```bash
git add src/widgets/retrospective-studio/ui/RetroEditor.tsx
git commit -m "feat(retro): convert content section to document style"
```

---

### Task 12: 잔여 정리 — 토큰 감사 · 반응형 · 죽은 코드 제거

**Files:**
- Modify: `src/widgets/retrospective-studio/ui/RetroEditor.tsx`
- Modify: `src/app/styles/widgets/retro.css`
- (필요 시) Modify: `src/app/styles/atoms/cards.css`

**Interfaces:**
- Consumes: Task 2~11의 결과물
- Produces: 없음(정리 태스크)

- [ ] **Step 1: 에디터에 남은 인라인 스타일을 토큰으로 스냅**

`RetroEditor.tsx`와 Task 5·6·7·9·11에서 만든/고친 컴포넌트를 훑어 아래를 고친다:
- `fontSize` 숫자값이 `12`/`16`/`18`이 아닌 것 → 12·16·18 중 하나로.
- `gap`/`padding`의 px 값이 4의 배수가 아닌 것 → `var(--s-xxs|xs|sm|md|lg|xl)`로.
- `#` 로 시작하는 하드코딩 색 → `var(--color-*)`로.

- [ ] **Step 2: 더 이상 쓰지 않는 스타일/클래스 제거**

`.retro-title-input`, `.retro-expand-btn`, `.section-card--retro-body`가 다른 곳에서 쓰이는지 확인한다:

```bash
grep -rn "retro-title-input\|retro-expand-btn\|section-card--retro-body" src
```

`RetroExpandOverlay` 등 다른 사용처가 없으면 `retro.css` / `cards.css`의 해당 블록을 삭제한다. 사용처가 남아 있으면 그대로 둔다.

- [ ] **Step 3: 좁은 화면 확인 + 조정**

Run: `pnpm dev` → 브라우저 폭을 1440 / 1024 / 768 / 390px로 바꿔가며 회고 에디터를 본다.
확인: (1) 가로 스크롤이 생기지 않는다. (2) 900px 이하에서 레일이 본문 아래로 내려온다. (3) 커밋 메시지 같은 긴 모노 텍스트가 넘치지 않고 줄바꿈된다. 문제가 있으면 `retro.css`의 `.retro-doc-*`에 `min-width: 0` / `word-break` 를 보강한다.

- [ ] **Step 4: 빌드 검증**

Run: `pnpm build`
Expected: PASS

- [ ] **Step 5: 전체 흐름 수동 확인**

Run: `pnpm dev`
1. 갤러리 → 일간 회고 열기 → 제목 입력 → 폴더 지정 → 본문에 체크박스 블록 작성 → 갤러리로 나갔다 다시 들어오기(모두 유지되는지).
2. 주간 요약 열기 → AI 요약 배너·되돌리기 확인.
3. GitHub 미연결 상태에서 배너 확인.
4. 전체화면 모드(`Ctrl+Shift+F`) 진입/이탈.

- [ ] **Step 6: 커밋**

```bash
git add -A src/widgets/retrospective-studio src/app/styles
git commit -m "chore(retro): snap editor styles to design tokens and clean up dead styles"
```

---

## 완료 기준

- `pnpm build` 통과.
- 일간 회고에서: 문서형 레이아웃, 자유 제목 + 기본 제목 폴백, 폴더 선택, 완료 작업/커밋 문서형 섹션, 저장소 요약 줄, 우측 레일(동기화 Pill 1개 · Push · 전체화면 · 재료 3종), 체크박스 블록 왕복.
- 요약(주간/월간/연간) 회고에서: AI 요약 배너 + 되돌리기 + 생성 중/실패 상태.
- 일간 회고에 요약 생성 버튼이 **없다**. 커밋 행에 동기화 Pill이 **없다**. "붙을 주제"·"할 일에서 가져오기"가 **없다**.
- 900px 이하에서 레일이 본문 아래로 내려오고 가로 스크롤이 없다.
