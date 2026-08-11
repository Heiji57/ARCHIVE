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
  // Delete 키 단축키가 패널 바깥에서 발동하지 않도록 포커스 범위를 제한하는 데 쓴다.
  const panelRef = useRef<HTMLDivElement>(null);
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
      if (!panelRef.current?.contains(document.activeElement)) return;
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
    <div ref={panelRef} style={{ display: "flex", flexDirection: "column", height: "100%" }}>
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
