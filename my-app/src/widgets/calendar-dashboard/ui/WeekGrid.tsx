import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Todo } from "@/entities/todo/model/types";
import { TagDots } from "@/entities/todo/ui/TagDots";
import { useDraggable } from "@/shared/lib/dnd";
import { addDays, startOfISOWeek, toDateKey } from "@/shared/lib/date";
import { useLatestRef } from "@/shared/lib/useLatestRef";
import { useTranslation } from "@/shared/lib/i18n";
import { DAY_ABBR_KEYS, TODO_DRAG_KIND } from "../model/constants";
import { assignSpanRows, buildSpanEvents, type SpanEventWithRow } from "../model/spanEvents";
import { DayCell } from "./DayCell";


// ── Regular chip (single day) ───────────────────────────────────────────────

interface WeekChipProps {
  todo: Todo;
  onSelect: (id: string) => void;
  onResizeStart: (e: React.PointerEvent, todoId: string) => void;
}

const WeekChip = memo(function WeekChipImpl({
  todo,
  onSelect,
  onResizeStart,
}: WeekChipProps) {
  const { isDragging, ...dragHandlers } = useDraggable({
    kind: TODO_DRAG_KIND,
    data: { id: todo.id },
  });
  return (
    <button
      type="button"
      onClick={() => onSelect(todo.id)}
      data-draggable="true"
      data-dragging={isDragging ? "true" : undefined}
      data-status={todo.status}
      className="week-chip"
      {...dragHandlers}
    >
      {todo.startTime ? (
        <p className="week-chip-time">{todo.startTime.slice(0, 5)}</p>
      ) : null}
      <p className="week-chip-title" style={{ paddingRight: 12 }}>{todo.title}</p>
      {todo.tags.length > 0 ? (
        <p className="week-chip-tags">
          <TagDots tags={todo.tags} />
        </p>
      ) : null}
      <div
        className="chip-resize-handle"
        onPointerDown={(e) => onResizeStart(e, todo.id)}
      />
    </button>
  );
});

// ── Span chip (multi-day, 태그 미표시) ─────────────────────────────────────

interface WeekSpanChipProps {
  evt: SpanEventWithRow;
  onSelect: (id: string) => void;
  onResizeStart: (e: React.PointerEvent, todoId: string) => void;
}

const WeekSpanChip = memo(function WeekSpanChipImpl({
  evt,
  onSelect,
  onResizeStart,
}: WeekSpanChipProps) {
  const { isDragging, ...dragHandlers } = useDraggable({
    kind: TODO_DRAG_KIND,
    data: { id: evt.todo.id },
  });
  return (
    <button
      key={`span-${evt.todo.id}`}
      type="button"
      className="week-chip"
      data-status={evt.todo.status}
      data-span=""
      data-draggable="true"
      data-dragging={isDragging ? "true" : undefined}
      onClick={() => onSelect(evt.todo.id)}
      style={{
        gridColumn: `${evt.startCol + 1} / ${evt.startCol + evt.colSpan + 1}`,
        gridRow: evt.row + 1,
        alignSelf: "start",
        margin: "3px 10px",
        width: "auto",
        position: "relative",
        zIndex: 1,
        minWidth: 0,
        borderRadius: `${evt.isStart ? 5 : 0}px ${evt.isEnd ? 5 : 0}px ${evt.isEnd ? 5 : 0}px ${evt.isStart ? 5 : 0}px`,
        borderLeft: evt.isStart ? undefined : "none",
        overflow: "hidden",
      }}
      {...dragHandlers}
    >
      {evt.isStart && evt.todo.startTime ? (
        <p className="week-chip-time">{evt.todo.startTime.slice(0, 5)}</p>
      ) : null}
      <div style={{ display: "flex", alignItems: "center", gap: 4, overflow: "hidden", paddingRight: evt.isEnd ? 12 : 0 }}>
        <p className="week-chip-title" style={{ flex: 1, margin: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {evt.todo.title}
        </p>
        {evt.isStart && evt.todo.tags.length > 0 ? (
          <TagDots tags={evt.todo.tags} />
        ) : null}
      </div>
      {evt.isEnd ? (
        <div
          className="chip-resize-handle"
          onPointerDown={(e) => onResizeStart(e, evt.todo.id)}
        />
      ) : null}
    </button>
  );
});

const SPAN_ROW_HEIGHT = 60;

// ── WeekGrid ────────────────────────────────────────────────────────────────

export interface WeekGridProps {
  cursor: Date;
  byDate: Record<string, Todo[]>;
  spanningTodos?: Todo[];
  todayKey: string;
  selectedId: string | null;
  onSelect: (id: string) => void;
  onDropTodo: (todoId: string, dateKey: string) => void;
  onAddTodo: (title: string, dateKey: string) => void;
  onResizeDueDate: (id: string, dueDate: string | null) => void;
}

export function WeekGrid({
  cursor,
  byDate,
  spanningTodos = [],
  todayKey,
  onSelect,
  onDropTodo,
  onAddTodo,
  onResizeDueDate,
}: WeekGridProps) {
  const { t } = useTranslation();
  const start = startOfISOWeek(cursor);
  const days = Array.from({ length: 7 }, (_, i) => addDays(start, i));
  const weekKeys = useMemo(() => days.map(d => toDateKey(d)), [cursor]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Resize state ────────────────────────────────────────────────────────
  const gridRef = useRef<HTMLDivElement | null>(null);
  const [resizing, setResizing] = useState<{ todoId: string; dueDate: string } | null>(null);

  const byDateRef = useLatestRef(byDate);
  const spanningTodosRef = useLatestRef(spanningTodos);
  const weekKeysRef = useLatestRef(weekKeys);
  const onResizeDueDateRef = useLatestRef(onResizeDueDate);

  const getColAtX = useCallback((clientX: number): number => {
    if (!gridRef.current) return 0;
    const r = gridRef.current.getBoundingClientRect();
    return Math.min(6, Math.max(0, Math.floor((clientX - r.left) / (r.width / 7))));
  }, []);

  const findTodo = useCallback((id: string): Todo | undefined => {
    return (
      spanningTodosRef.current.find(t => t.id === id) ??
      Object.values(byDateRef.current).flat().find(t => t.id === id)
    );
  }, [byDateRef, spanningTodosRef]);

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
      const col = getColAtX(e.clientX);
      const newDue = weekKeysRef.current[col];
      if (!newDue || newDue < todo.dateKey) return prev;
      return newDue !== prev.dueDate ? { ...prev, dueDate: newDue } : prev;
    });
  }, [findTodo, getColAtX, weekKeysRef]);

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

  // ── Span events (리사이즈 미리보기 포함) ──────────────────────────────────
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

  const spanEventsWithRows = useMemo(
    () => assignSpanRows(buildSpanEvents(effectiveSpanTodos, weekKeys)),
    [effectiveSpanTodos, weekKeys],
  );
  const numSpanRows = spanEventsWithRows.length > 0
    ? Math.max(...spanEventsWithRows.map(e => e.row))
    : 0;

  const spanIds = useMemo(
    () => new Set(spanEventsWithRows.map(e => e.todo.id)),
    [spanEventsWithRows],
  );

  // 컬럼별 최대 span 행 번호 (span 없는 컬럼은 0)
  const colLocalSpanRows = useMemo(
    () =>
      Array.from({ length: 7 }, (_, ci) =>
        spanEventsWithRows.reduce<number>((max, evt) => {
          if (ci >= evt.startCol && ci < evt.startCol + evt.colSpan) {
            return Math.max(max, evt.row);
          }
          return max;
        }, 0),
      ),
    [spanEventsWithRows],
  );

  const resizingRegularId = useMemo(() => {
    if (!resizing) return null;
    if (spanningTodos.some(t => t.id === resizing.todoId)) return null;
    const todo = Object.values(byDate).flat().find(t => t.id === resizing.todoId);
    if (!todo || resizing.dueDate <= todo.dateKey) return null;
    return resizing.todoId;
  }, [resizing, spanningTodos, byDate]);

  // ── Inline add state ────────────────────────────────────────────────────
  const [addingDate, setAddingDate] = useState<string | null>(null);
  const [addingTitle, setAddingTitle] = useState("");
  const escapedRef = useRef(false);

  const startAdding = (dateKey: string) => {
    escapedRef.current = false;
    setAddingDate(dateKey);
    setAddingTitle("");
  };

  const commitAdd = () => {
    if (addingTitle.trim() && addingDate) {
      onAddTodo(addingTitle.trim(), addingDate);
    }
    setAddingDate(null);
    setAddingTitle("");
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      escapedRef.current = false;
      commitAdd();
    } else if (e.key === "Escape") {
      escapedRef.current = true;
      setAddingDate(null);
      setAddingTitle("");
    }
  };

  const handleBlur = () => {
    if (escapedRef.current) {
      escapedRef.current = false;
      return;
    }
    commitAdd();
  };

  return (
    <div
      ref={gridRef}
      style={{
        display: "grid",
        flex: 1,
        minHeight: 0,
        gridTemplateColumns: "repeat(7, minmax(0, 1fr))",
        gridTemplateRows: numSpanRows > 0
          ? `auto ${Array(numSpanRows).fill(`${SPAN_ROW_HEIGHT}px`).join(' ')} 1fr`
          : 'auto 1fr',
        columnGap: 6,
        rowGap: 0,
      }}
    >
      {/* ── Row 1: Column headers ── */}
      {days.map((d, ci) => {
        const k = toDateKey(d);
        const isToday = k === todayKey;
        const count = (byDate[k] ?? []).length;
        const border = isToday
          ? "1px solid rgba(94, 106, 210, 0.4)"
          : "1px solid var(--color-divider-soft)";
        return (
          <div
            key={`hdr-${k}`}
            style={{
              gridColumn: ci + 1,
              gridRow: 1,
              padding: "14px 10px 8px",
              background: isToday ? "rgba(94, 106, 210, 0.07)" : "var(--color-tile-2)",
              borderTop: border,
              borderLeft: border,
              borderRight: border,
              borderTopLeftRadius: "var(--r-sm)",
              borderTopRightRadius: "var(--r-sm)",
              display: "flex",
              alignItems: "flex-start",
              justifyContent: "space-between",
            }}
          >
            <div>
              <p
                className="t-eyebrow"
                style={{
                  color: isToday ? "var(--color-primary-on-dark)" : "var(--color-body-muted)",
                  margin: "0 0 2px",
                }}
              >
                {t(DAY_ABBR_KEYS[d.getDay()])}
              </p>
              <p
                style={{
                  margin: 0,
                  fontSize: 20,
                  fontFamily: "var(--font-display)",
                  fontWeight: 600,
                  letterSpacing: "-0.04em",
                  color: isToday ? "var(--color-primary-on-dark)" : "var(--color-ink)",
                }}
              >
                {d.getDate()}
              </p>
            </div>
            {count > 0 ? (
              <span style={{ fontSize: 12, color: "var(--color-body-muted)", fontVariantNumeric: "tabular-nums" }}>
                {count}
              </span>
            ) : null}
          </div>
        );
      })}

      {/* ── DayCell: 헤더 아래 전체 영역(span 행 + content 행) 커버 ── */}
      {days.map((d, ci) => {
        const k = toDateKey(d);
        const isToday = k === todayKey;
        const items = (byDate[k] ?? []).filter(
          item => !spanIds.has(item.id) && item.id !== resizingRegularId,
        );
        const isAdding = addingDate === k;
        const border = isToday
          ? "1px solid rgba(94, 106, 210, 0.4)"
          : "1px solid var(--color-divider-soft)";
        const local = colLocalSpanRows[ci];
        const gridRow = numSpanRows > 0 ? `2 / ${numSpanRows + 3}` : 2;
        const paddingTop = local > 0 ? local * SPAN_ROW_HEIGHT + 6 : 6;
        return (
          <DayCell
            key={k}
            dateKey={k}
            onDropTodo={onDropTodo}
            style={{
              gridColumn: ci + 1,
              gridRow,
              paddingTop,
              paddingLeft: 10,
              paddingRight: 10,
              paddingBottom: 14,
              minHeight: 240,
              background: isToday ? "rgba(94, 106, 210, 0.07)" : "var(--color-tile-2)",
              borderBottom: border,
              borderLeft: border,
              borderRight: border,
              borderBottomLeftRadius: "var(--r-sm)",
              borderBottomRightRadius: "var(--r-sm)",
              display: "flex",
              flexDirection: "column",
              gap: 5,
            }}
          >
            {items.map(item => (
              <WeekChip
                key={item.id}
                todo={item}
                onSelect={onSelect}
                onResizeStart={startResize}
              />
            ))}
            <div
              style={{ flex: 1, minHeight: 40, cursor: isAdding ? "default" : "text" }}
              onClick={() => { if (!isAdding) startAdding(k); }}
            >
              {isAdding ? (
                <input
                  autoFocus
                  value={addingTitle}
                  onChange={e => setAddingTitle(e.target.value)}
                  onKeyDown={handleKeyDown}
                  onBlur={handleBlur}
                  placeholder={t("calendar.addCard.placeholder")}
                  style={{
                    width: "100%",
                    fontSize: 12,
                    padding: "6px 8px",
                    borderRadius: "var(--r-sm)",
                    background: "var(--color-tile-3)",
                    border: "1px solid var(--color-primary)",
                    color: "var(--color-ink)",
                    outline: "none",
                    boxSizing: "border-box",
                  }}
                />
              ) : null}
            </div>
          </DayCell>
        );
      })}

      {/* ── Span chips (DayCell 뒤에 렌더링 → 시각적으로 위에 표시) ── */}
      {spanEventsWithRows.map(evt => (
        <WeekSpanChip
          key={`span-${evt.todo.id}`}
          evt={evt}
          onSelect={onSelect}
          onResizeStart={startResize}
        />
      ))}
    </div>
  );
}
