import { Fragment, memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Plus, X } from "lucide-react";
import type { Todo } from "@/entities/todo/model/types";
import { StatusIcon } from "@/entities/todo/ui/StatusIcon";
import { TagDots } from "@/entities/todo/ui/TagDots";
import { useDraggable } from "@/shared/lib/dnd";
import { useLatestRef } from "@/shared/lib/useLatestRef";
import {
  formatFullDate,
  fromDateKey,
  getMonthGrid,
  isSameMonth,
  toDateKey,
} from "@/shared/lib/date";
import { useTranslation } from "@/shared/lib/i18n";
import { MONTH_HEADER_KEYS, TODO_DRAG_KIND } from "../model/constants";
import { assignSpanRows, buildSpanEvents, type SpanEventWithRow } from "../model/spanEvents";
import { DayCell } from "./DayCell";
import { DraggableMonthChip } from "./DraggableMonthChip";

const MONTH_SPAN_ROW_HEIGHT = 28;
const MONTH_DATE_HEADER_HEIGHT = 36;

// ── Month span chip (multi-day, 태그 미표시) ─────────────────────────────────

interface MonthSpanChipProps {
  evt: SpanEventWithRow;
  onSelect: (id: string) => void;
  onResizeStart: (e: React.PointerEvent, todoId: string) => void;
}

const MonthSpanChip = memo(function MonthSpanChipImpl({
  evt,
  onSelect,
  onResizeStart,
}: MonthSpanChipProps) {
  const { isDragging, ...dragHandlers } = useDraggable({
    kind: TODO_DRAG_KIND,
    data: { id: evt.todo.id },
  });
  return (
    <button
      type="button"
      className="todo-month-chip"
      data-status={evt.todo.status}
      data-span=""
      data-draggable="true"
      data-dragging={isDragging ? "true" : undefined}
      onClick={() => onSelect(evt.todo.id)}
      style={{
        gridColumn: `${evt.startCol + 1} / ${evt.startCol + evt.colSpan + 1}`,
        gridRow: evt.row + 1,
        alignSelf: "start",
        margin: "2px 10px",
        width: "auto",
        position: "relative",
        zIndex: 1,
        minWidth: 0,
        borderRadius: `${evt.isStart ? 4 : 0}px ${evt.isEnd ? 4 : 0}px ${evt.isEnd ? 4 : 0}px ${evt.isStart ? 4 : 0}px`,
        borderLeft: evt.isStart ? undefined : "none",
        overflow: "hidden",
        whiteSpace: "nowrap",
        textOverflow: "ellipsis",
      }}
      {...dragHandlers}
    >
      <span style={{ overflow: "hidden", textOverflow: "ellipsis", flex: 1, minWidth: 0 }}>
        {evt.todo.title}
      </span>
      {evt.isStart && evt.todo.tags.length > 0 ? (
        <TagDots tags={evt.todo.tags} />
      ) : null}
      {evt.isEnd ? (
        <div
          className="chip-resize-handle"
          onPointerDown={(e) => onResizeStart(e, evt.todo.id)}
        />
      ) : null}
    </button>
  );
});

export interface MonthGridProps {
  cursor: Date;
  byDate: Record<string, Todo[]>;
  spanningTodos?: Todo[];
  todayKey: string;
  onSelect: (id: string) => void;
  onDropTodo: (todoId: string, dateKey: string) => void;
  onAddTodo: (title: string, dateKey: string) => void;
  onResizeDueDate: (id: string, dueDate: string | null) => void;
}

export function MonthGrid({
  cursor,
  byDate,
  spanningTodos = [],
  todayKey,
  onSelect,
  onDropTodo,
  onAddTodo,
  onResizeDueDate,
}: MonthGridProps) {
  const { t, locale } = useTranslation();
  const cells = getMonthGrid(cursor);
  const anchorKey = todayKey;

  // 6주 행으로 분리
  const weeks = useMemo(
    () => Array.from({ length: 6 }, (_, i) => cells.slice(i * 7, (i + 1) * 7)),
    [cells],
  );

  // ── Resize state ────────────────────────────────────────────────────────
  const gridBodyRef = useRef<HTMLDivElement | null>(null);
  const [resizing, setResizing] = useState<{ todoId: string; dueDate: string } | null>(null);

  const byDateRef = useLatestRef(byDate);
  const spanningTodosRef = useLatestRef(spanningTodos);
  const onResizeDueDateRef = useLatestRef(onResizeDueDate);
  const weeksRef = useLatestRef(weeks);

  const findTodo = useCallback((id: string): Todo | undefined => {
    return (
      spanningTodosRef.current.find(t => t.id === id) ??
      Object.values(byDateRef.current).flat().find(t => t.id === id)
    );
  }, [byDateRef, spanningTodosRef]);

  const getDateKeyAtPoint = useCallback((clientX: number, clientY: number): string | null => {
    if (!gridBodyRef.current) return null;
    const r = gridBodyRef.current.getBoundingClientRect();
    const col = Math.min(6, Math.max(0, Math.floor((clientX - r.left) / (r.width / 7))));
    const relY = clientY - r.top;
    const weekHeight = r.height / 6;
    const weekIdx = Math.min(5, Math.max(0, Math.floor(relY / weekHeight)));
    const weekDays = weeksRef.current[weekIdx];
    if (!weekDays) return null;
    return toDateKey(weekDays[col]);
  }, [weeksRef]);

  const startResize = useCallback((e: React.PointerEvent, todoId: string) => {
    e.stopPropagation();
    e.preventDefault();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    const todo = findTodo(todoId);
    if (!todo) return;
    setResizing({ todoId, dueDate: todo.dueDate ?? todo.dateKey });
  }, [findTodo]);

  const handleResizeMove = useCallback((e: PointerEvent) => {
    setResizing(prev => {
      if (!prev) return null;
      const todo = findTodo(prev.todoId);
      if (!todo) return prev;
      const newDue = getDateKeyAtPoint(e.clientX, e.clientY);
      if (!newDue || newDue < todo.dateKey) return prev;
      return newDue !== prev.dueDate ? { ...prev, dueDate: newDue } : prev;
    });
  }, [findTodo, getDateKeyAtPoint]);

  const handleResizeUp = useCallback((_e: PointerEvent) => {
    setResizing(prev => {
      if (!prev) return null;
      const todo = findTodo(prev.todoId);
      if (!todo) return null;
      const newDueDate = prev.dueDate > todo.dateKey ? prev.dueDate : null;
      onResizeDueDateRef.current(prev.todoId, newDueDate);
      return null;
    });
  }, [findTodo, onResizeDueDateRef]);

  const isResizing = resizing !== null;
  useEffect(() => {
    if (!isResizing) return;
    window.addEventListener('pointermove', handleResizeMove);
    window.addEventListener('pointerup', handleResizeUp);
    return () => {
      window.removeEventListener('pointermove', handleResizeMove);
      window.removeEventListener('pointerup', handleResizeUp);
    };
  }, [isResizing, handleResizeMove, handleResizeUp]);

  // ── Span events per week (리사이즈 미리보기 포함) ─────────────────────────
  const effectiveSpanTodos = useMemo(() => {
    if (!resizing) return spanningTodos;
    const isAlreadySpan = spanningTodos.some(t => t.id === resizing.todoId);
    if (isAlreadySpan) {
      return spanningTodos.map(t =>
        t.id === resizing.todoId ? { ...t, dueDate: resizing.dueDate } : t,
      );
    }
    const todo = Object.values(byDate).flat().find(t => t.id === resizing.todoId);
    if (!todo || resizing.dueDate <= todo.dateKey) return spanningTodos;
    return [...spanningTodos, { ...todo, dueDate: resizing.dueDate }];
  }, [spanningTodos, byDate, resizing]);

  const spanEventsByWeek = useMemo(
    () =>
      weeks.map((weekDays) => {
        const wk = weekDays.map(d => toDateKey(d));
        return assignSpanRows(buildSpanEvents(effectiveSpanTodos, wk));
      }),
    [effectiveSpanTodos, weeks],
  );

  const resizingRegularId = useMemo(() => {
    if (!resizing) return null;
    if (spanningTodos.some(t => t.id === resizing.todoId)) return null;
    const todo = Object.values(byDate).flat().find(t => t.id === resizing.todoId);
    if (!todo || resizing.dueDate <= todo.dateKey) return null;
    return resizing.todoId;
  }, [resizing, spanningTodos, byDate]);

  // ── Inline add & modal state ─────────────────────────────────────────────
  const [modalDate, setModalDate] = useState<string | null>(null);
  const [addingDate, setAddingDate] = useState<string | null>(null);
  const [addingTitle, setAddingTitle] = useState("");
  const [modalAdding, setModalAdding] = useState(false);
  const [modalAddTitle, setModalAddTitle] = useState("");
  const cellInputRef = useRef<HTMLInputElement | null>(null);
  const modalInputRef = useRef<HTMLInputElement | null>(null);
  const modalTodos = modalDate ? (byDate[modalDate] ?? []) : [];

  const startCellAdd = (dateKey: string) => {
    setAddingDate(dateKey);
    setAddingTitle("");
    setTimeout(() => cellInputRef.current?.focus(), 0);
  };

  const commitCellAdd = () => {
    if (addingTitle.trim() && addingDate) {
      onAddTodo(addingTitle.trim(), addingDate);
    }
    setAddingDate(null);
    setAddingTitle("");
  };

  const startModalAdd = () => {
    setModalAdding(true);
    setModalAddTitle("");
    setTimeout(() => modalInputRef.current?.focus(), 0);
  };

  const commitModalAdd = () => {
    if (modalAddTitle.trim() && modalDate) {
      onAddTodo(modalAddTitle.trim(), modalDate);
    }
    setModalAdding(false);
    setModalAddTitle("");
  };

  return (
    <div>
      {/* Day-of-week header */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(7, 1fr)",
          marginBottom: 8,
        }}
      >
        {MONTH_HEADER_KEYS.map((key, i) => (
          <div
            key={i}
            style={{
              padding: "8px 4px",
              fontSize: 12,
              letterSpacing: "0.18em",
              fontWeight: 600,
              textTransform: "uppercase",
              color: i === 6 ? "var(--color-warn)" : "var(--color-body-muted)",
            }}
          >
            {t(key)}
          </div>
        ))}
      </div>

      {/* 6주 그리드 */}
      <div ref={gridBodyRef} style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        {weeks.map((weekDays, weekIdx) => {
          const weekSpanEvents = spanEventsByWeek[weekIdx];
          const numSpanRows = weekSpanEvents.length > 0
            ? Math.max(...weekSpanEvents.map(e => e.row))
            : 0;
          const weekSpanIds = new Set(weekSpanEvents.map(e => e.todo.id));
          const colLocalSpanRows = Array.from({ length: 7 }, (_, ci) =>
            weekSpanEvents.reduce<number>((max, evt) => {
              if (ci >= evt.startCol && ci < evt.startCol + evt.colSpan) return Math.max(max, evt.row);
              return max;
            }, 0),
          );

          return (
            <div
              key={weekIdx}
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(7, minmax(0, 1fr))",
                gridTemplateRows: numSpanRows > 0
                  ? `${MONTH_DATE_HEADER_HEIGHT}px ${Array(numSpanRows).fill(`${MONTH_SPAN_ROW_HEIGHT}px`).join(' ')} auto`
                  : `${MONTH_DATE_HEADER_HEIGHT}px auto`,
                columnGap: 4,
                rowGap: 0,
              }}
            >
              {/* 날짜 헤더(gridRow:1) + day cell 배경/todos — Fragment로 묶어 한 번에 렌더 */}
              {weekDays.map((d, ci) => {
                const k = toDateKey(d);
                const todayCell = k === anchorKey;
                const inMonth = isSameMonth(d, cursor);
                const allItems = byDate[k] ?? [];
                const regularItems = allItems.filter(
                  item => !weekSpanIds.has(item.id) && item.id !== resizingRegularId,
                );
                const visible = regularItems.slice(0, 3);
                const more = regularItems.length - visible.length;
                const isAdding = addingDate === k;
                const local = colLocalSpanRows[ci];

                return (
                  <Fragment key={k}>
                    {/* 날짜 헤더 — 항상 최상단 (gridRow:1, zIndex:2 > span chip zIndex:1) */}
                    <div
                      style={{
                        gridColumn: ci + 1,
                        gridRow: 1,
                        position: "relative",
                        zIndex: 2,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        padding: "10px 10px 4px 10px",
                        opacity: inMonth ? 1 : 0.35,
                      }}
                    >
                      <span
                        style={{
                          fontSize: 16,
                          fontWeight: 600,
                          color: todayCell
                            ? "var(--color-primary-on-dark)"
                            : "var(--color-ink)",
                        }}
                      >
                        {d.getDate()}
                      </span>
                      <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                        {todayCell ? (
                          <span
                            style={{
                              fontSize: 12,
                              letterSpacing: "0.14em",
                              color: "var(--color-primary-on-dark)",
                              fontWeight: 600,
                              textTransform: "uppercase",
                            }}
                          >
                            {t("calendar.today")}
                          </span>
                        ) : null}
                        {inMonth ? (
                          <button
                            type="button"
                            className="month-cell-add-btn"
                            data-adding={isAdding ? "true" : undefined}
                            onClick={(e) => { e.stopPropagation(); startCellAdd(k); }}
                            style={{
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                              width: 18,
                              height: 18,
                              borderRadius: 4,
                              background: "var(--color-primary)",
                              border: "none",
                              cursor: "default",
                              flexShrink: 0,
                            }}
                            title="할일 추가"
                          >
                            <Plus size={11} color="#fff" strokeWidth={2.5} />
                          </button>
                        ) : null}
                      </div>
                    </div>

                    {/* Day cell — 배경/border/드롭타겟, 전체 행 커버, todos만 포함 */}
                    <DayCell
                      dateKey={k}
                      onDropTodo={onDropTodo}
                      className="month-day-cell"
                      style={{
                        gridColumn: ci + 1,
                        gridRow: `1 / ${numSpanRows + 3}`,
                        background: todayCell
                          ? "rgba(94, 106, 210, 0.06)"
                          : "var(--color-tile-2)",
                        minHeight: 124,
                        paddingTop: MONTH_DATE_HEADER_HEIGHT + local * MONTH_SPAN_ROW_HEIGHT + 6,
                        paddingLeft: 10,
                        paddingRight: 10,
                        paddingBottom: 10,
                        opacity: inMonth ? 1 : 0.35,
                        display: "flex",
                        flexDirection: "column",
                        gap: 6,
                        borderRadius: "var(--r-sm)",
                        border: todayCell
                          ? "1px solid var(--color-primary)"
                          : "1px solid var(--color-divider-soft)",
                        position: "relative",
                      }}
                    >
                      {/* 칩 목록 */}
                      <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                        {visible.map((item) => (
                          <DraggableMonthChip
                            key={item.id}
                            todo={item}
                            onSelect={onSelect}
                            onResizeStart={startResize}
                          />
                        ))}
                        {more > 0 ? (
                          <button
                            type="button"
                            onClick={() => setModalDate(k)}
                            style={{
                              margin: 0,
                              fontSize: 12,
                              color: "var(--color-primary-on-dark)",
                              background: "transparent",
                              border: "none",
                              padding: "2px 0",
                              cursor: "default",
                              textAlign: "left",
                            }}
                          >
                            {t("calendar.moreItems", { n: more })}
                          </button>
                        ) : null}
                      </div>

                      {/* 인라인 추가 입력 */}
                      {isAdding ? (
                        <input
                          ref={cellInputRef}
                          className="month-add-input"
                          placeholder={t("calendar.addCard.placeholder")}
                          value={addingTitle}
                          onChange={(e) => setAddingTitle(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              commitCellAdd();
                            } else if (e.key === "Escape") {
                              setAddingDate(null);
                              setAddingTitle("");
                            }
                          }}
                          onBlur={commitCellAdd}
                        />
                      ) : null}
                    </DayCell>
                  </Fragment>
                );
              })}

              {/* Span chips after day cells so they render on top */}
              {weekSpanEvents.map(evt => (
                <MonthSpanChip
                  key={`span-${evt.todo.id}-w${weekIdx}`}
                  evt={evt}
                  onSelect={onSelect}
                  onResizeStart={startResize}
                />
              ))}
            </div>
          );
        })}
      </div>

      {/* "n개 더 보기" 모달 */}
      {modalDate ? (
        <>
          <div
            style={{
              position: "fixed",
              inset: 0,
              background: "rgba(0,0,0,0.48)",
              zIndex: 200,
            }}
            onClick={() => { setModalDate(null); setModalAdding(false); }}
          />
          <div
            style={{
              position: "fixed",
              top: "50%",
              left: "50%",
              transform: "translate(-50%, -50%)",
              zIndex: 201,
              width: 360,
              maxHeight: "70vh",
              display: "flex",
              flexDirection: "column",
              background: "var(--color-tile-2)",
              borderRadius: "var(--r-lg)",
              border: "1px solid var(--color-divider-soft)",
              boxShadow: "0 24px 56px rgba(0,0,0,0.55)",
              overflow: "hidden",
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "16px 20px 14px",
                borderBottom: "1px solid var(--color-divider-soft)",
                flexShrink: 0,
              }}
            >
              <p
                style={{
                  margin: 0,
                  fontSize: 16,
                  fontWeight: 600,
                  color: "var(--color-ink)",
                }}
              >
                {formatFullDate(fromDateKey(modalDate), locale)}
              </p>
              <button
                type="button"
                className="btn-icon"
                onClick={() => { setModalDate(null); setModalAdding(false); }}
                aria-label={t("calendar.taskDetail.close")}
              >
                <X size={16} />
              </button>
            </div>

            <div
              style={{
                overflowY: "auto",
                padding: "12px 16px 0",
                display: "flex",
                flexDirection: "column",
                gap: 6,
                flex: 1,
              }}
            >
              {modalTodos.map((todo) => (
                <button
                  key={todo.id}
                  type="button"
                  onClick={() => {
                    onSelect(todo.id);
                    setModalDate(null);
                  }}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    padding: "10px 12px",
                    borderRadius: "var(--r-sm)",
                    background: "var(--color-tile-2)",
                    border: "1px solid var(--color-divider-soft)",
                    cursor: "pointer",
                    textAlign: "left",
                    fontSize: 16,
                    color: "var(--color-ink)",
                    flexShrink: 0,
                  }}
                >
                  <StatusIcon status={todo.status} size={14} />
                  <span
                    style={{
                      overflow: "hidden",
                      whiteSpace: "nowrap",
                      textOverflow: "ellipsis",
                      flex: 1,
                      color:
                        todo.status === "done"
                          ? "var(--color-status-done)"
                          : "var(--color-ink)",
                    }}
                  >
                    {todo.title}
                  </span>
                  <TagDots tags={todo.tags} />
                </button>
              ))}

              {modalAdding ? (
                <input
                  ref={modalInputRef}
                  className="month-add-input"
                  placeholder={t("calendar.addCard.placeholder")}
                  value={modalAddTitle}
                  onChange={(e) => setModalAddTitle(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") commitModalAdd();
                    else if (e.key === "Escape") { setModalAdding(false); setModalAddTitle(""); }
                  }}
                  onBlur={commitModalAdd}
                  style={{ flexShrink: 0 }}
                />
              ) : null}
            </div>

            <button
              type="button"
              onClick={startModalAdd}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 7,
                margin: "10px 16px 16px",
                padding: "9px 12px",
                borderRadius: "var(--r-sm)",
                background: "transparent",
                border: "1px dashed var(--color-divider-soft)",
                cursor: "pointer",
                fontSize: 12,
                color: "var(--color-body-muted)",
                flexShrink: 0,
              }}
            >
              <Plus size={13} />
              {t("calendar.addCard")}
            </button>
          </div>
        </>
      ) : null}
    </div>
  );
}
