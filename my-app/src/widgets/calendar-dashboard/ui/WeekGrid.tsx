import { memo, useRef, useState } from "react";
import type { Todo } from "@/entities/todo/model/types";
import { TagDots } from "@/entities/todo/ui/TagDots";
import { useDraggable } from "@/shared/lib/dnd";
import { addDays, startOfISOWeek, toDateKey } from "@/shared/lib/date";
import { useTranslation } from "@/shared/lib/i18n";
import { DAY_ABBR_KEYS, TODO_DRAG_KIND } from "../model/constants";
import { DayCell } from "./DayCell";

interface WeekChipProps {
  todo: Todo;
  /** 안정적 참조(setState 등)를 그대로 넘겨야 memo 가 작동한다 — 인라인 클로저 금지. */
  onSelect: (id: string) => void;
}

const WeekChip = memo(function WeekChipImpl({ todo, onSelect }: WeekChipProps) {
  const { isDragging, ...dragHandlers } = useDraggable({ kind: TODO_DRAG_KIND, data: { id: todo.id } });
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
      <p className="week-chip-title">{todo.title}</p>
      {todo.tags.length > 0 ? (
        <p className="week-chip-tags">
          <TagDots tags={todo.tags} />
        </p>
      ) : null}
    </button>
  );
});

export interface WeekGridProps {
  cursor: Date;
  byDate: Record<string, Todo[]>;
  todayKey: string;
  selectedId: string | null;
  onSelect: (id: string) => void;
  onDropTodo: (todoId: string, dateKey: string) => void;
  onAddTodo: (title: string, dateKey: string) => void;
}

export function WeekGrid({
  cursor,
  byDate,
  todayKey,
  onSelect,
  onDropTodo,
  onAddTodo,
}: WeekGridProps) {
  const { t } = useTranslation();
  const start = startOfISOWeek(cursor);
  const days = Array.from({ length: 7 }, (_, i) => addDays(start, i));

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
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(7, minmax(0, 1fr))",
        gap: 6,
      }}
    >
      {days.map((d) => {
        const k = toDateKey(d);
        const todayCell = k === todayKey;
        const items = byDate[k] ?? [];
        const isAdding = addingDate === k;

        return (
          <DayCell
            key={k}
            dateKey={k}
            onDropTodo={onDropTodo}
            style={{
              background: todayCell
                ? "rgba(94, 106, 210, 0.07)"
                : "var(--color-tile-2)",
              borderRadius: "var(--r-sm)",
              border: todayCell
                ? "1px solid rgba(94, 106, 210, 0.4)"
                : "1px solid var(--color-divider-soft)",
              minHeight: 340,
              padding: "14px 10px",
              display: "flex",
              flexDirection: "column",
              gap: 10,
            }}
          >
            {/* Column header: abbr + date / count */}
            <div
              style={{
                display: "flex",
                alignItems: "flex-start",
                justifyContent: "space-between",
              }}
            >
              <div>
                <p
                  className="t-eyebrow"
                  style={{
                    color: todayCell
                      ? "var(--color-primary-on-dark)"
                      : "var(--color-body-muted)",
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
                    color: todayCell
                      ? "var(--color-primary-on-dark)"
                      : "var(--color-ink)",
                  }}
                >
                  {d.getDate()}
                </p>
              </div>
              {items.length > 0 ? (
                <span
                  style={{
                    fontSize: 12,
                    color: "var(--color-body-muted)",
                    fontVariantNumeric: "tabular-nums",
                  }}
                >
                  {items.length}
                </span>
              ) : null}
            </div>

            {/* Task chips */}
            {items.length > 0 && (
              <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                {items.map((item) => (
                  <WeekChip
                    key={item.id}
                    todo={item}
                    onSelect={onSelect}
                  />
                ))}
              </div>
            )}

            {/* 추가 영역 — 항상 최소 높이를 확보해 할 일이 많아도 클릭 가능 */}
            <div
              style={{
                flex: 1,
                minHeight: 40,
                cursor: isAdding ? "default" : "text",
              }}
              onClick={() => {
                if (!isAdding) startAdding(k);
              }}
            >
              {isAdding ? (
                <input
                  autoFocus
                  value={addingTitle}
                  onChange={(e) => setAddingTitle(e.target.value)}
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
    </div>
  );
}
