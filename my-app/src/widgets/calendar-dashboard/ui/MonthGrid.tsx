import { useRef, useState } from "react";
import { Plus, X } from "lucide-react";
import type { Todo } from "@/entities/todo/model/types";
import { StatusIcon } from "@/entities/todo/ui/StatusIcon";
import { TagDots } from "@/entities/todo/ui/TagDots";
import {
  formatFullDate,
  fromDateKey,
  getMonthGrid,
  isSameMonth,
  toDateKey,
} from "@/shared/lib/date";
import { useTranslation } from "@/shared/lib/i18n";
import { MONTH_HEADER_KEYS } from "../model/constants";
import { DayCell } from "./DayCell";
import { DraggableMonthChip } from "./DraggableMonthChip";

export interface MonthGridProps {
  cursor: Date;
  byDate: Record<string, Todo[]>;
  todayKey: string;
  onSelect: (id: string) => void;
  onDropTodo: (todoId: string, dateKey: string) => void;
  onAddTodo: (title: string, dateKey: string) => void;
}

export function MonthGrid({
  cursor,
  byDate,
  todayKey,
  onSelect,
  onDropTodo,
  onAddTodo,
}: MonthGridProps) {
  const { t, locale } = useTranslation();
  const cells = getMonthGrid(cursor);
  const anchorKey = todayKey;

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

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(7, minmax(0, 1fr))",
          gap: 4,
        }}
      >
        {cells.map((d) => {
          const k = toDateKey(d);
          const todayCell = k === anchorKey;
          const inMonth = isSameMonth(d, cursor);
          const items = byDate[k] ?? [];
          const visible = items.slice(0, 3);
          const more = items.length - visible.length;
          const isAdding = addingDate === k;

          return (
            <DayCell
              key={k}
              dateKey={k}
              onDropTodo={onDropTodo}
              className="month-day-cell"
              style={{
                background: todayCell
                  ? "rgba(94, 106, 210, 0.06)"
                  : "var(--color-tile-2)",
                minHeight: 124,
                padding: 10,
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
              {/* 날짜 헤더 */}
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
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
                  {/* + 버튼 — 표시 여부는 CSS :hover 로 처리 (state 리렌더 없음) */}
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

              {/* 칩 목록 */}
              <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                {visible.map((item) => (
                  <DraggableMonthChip
                    key={item.id}
                    todo={item}
                    onSelect={onSelect}
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
            {/* 헤더 */}
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

            {/* 할 일 목록 */}
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

              {/* 모달 인라인 추가 */}
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

            {/* 모달 하단 추가 버튼 */}
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
