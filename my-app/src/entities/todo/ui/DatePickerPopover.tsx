import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import {
  addDays,
  addMonths,
  formatYearMonth,
  fromDateKey,
  getMonthGrid,
  startOfMonth,
  toDateKey,
} from "@/shared/lib/date";
import { useTranslation } from "@/shared/lib/i18n";

/** Day-of-week single-letter labels for the popover calendar header (Monday-first). */
const DOW_LABELS = ["M", "T", "W", "T", "F", "S", "S"];

export interface DatePickerPopoverProps {
  value: string;
  onChange: (v: string) => void;
  onClose: () => void;
  anchorRight?: boolean;
  /** 이 날짜 이전은 선택 불가 (YYYY-MM-DD). 마감일 피커에서 시작일 이전을 막을 때 사용. */
  minDate?: string;
}

/**
 * Month-navigable date picker popover with quick presets
 * (today / tomorrow / weekend). Used by Quick Capture, the board
 * date filter, and the task detail panel.
 */
export function DatePickerPopover({
  value,
  onChange,
  onClose,
  anchorRight = true,
  minDate,
}: DatePickerPopoverProps) {
  const { t } = useTranslation();
  const today = new Date();
  const seedDate = value ? fromDateKey(value) : today;
  const [cursor, setCursor] = useState(startOfMonth(seedDate));

  const monthDays = useMemo(() => getMonthGrid(cursor), [cursor]);
  const monthLabel = formatYearMonth(cursor);

  const quickOptions = [
    { v: toDateKey(today), label: t("todo.quick.today") },
    { v: toDateKey(addDays(today, 1)), label: t("todo.quick.tomorrow") },
    { v: toDateKey(addDays(today, 5)), label: t("todo.quick.weekend") },
  ];

  return (
    <>
      <div
        onClick={onClose}
        style={{ position: "fixed", inset: 0, zIndex: 30 }}
      />
      <div
        style={{
          position: "absolute",
          top: "calc(100% + 8px)",
          right: anchorRight ? 0 : undefined,
          left: anchorRight ? undefined : 0,
          zIndex: 31,
          background: "var(--color-tile-2)",
          border: "1px solid var(--color-divider-soft)",
          borderRadius: "var(--r-lg)",
          padding: 12,
          width: 320,
          boxShadow: "var(--shadow-toast)",
        }}
      >
        <p
          className="t-eyebrow"
          style={{ margin: "4px 8px 8px", color: "var(--color-body-muted)" }}
        >
          {t("todo.picker.quickDate")}
        </p>

        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 2,
            marginBottom: 8,
          }}
        >
          {quickOptions.map((o) => (
            <button
              key={o.v}
              type="button"
              onClick={() => onChange(o.v)}
              style={{
                padding: "8px 12px",
                borderRadius: "var(--r-sm)",
                textAlign: "left",
                fontSize: 16,
                background:
                  o.v === value ? "var(--color-tile-4)" : "transparent",
                color: "var(--color-ink)",
              }}
            >
              {o.label}{" "}
              <span
                style={{
                  color: "var(--color-body-muted)",
                  marginLeft: 6,
                  fontSize: 12,
                }}
              >
                {o.v}
              </span>
            </button>
          ))}
        </div>

        {/* Month header */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            margin: "8px 6px",
          }}
        >
          <button
            type="button"
            aria-label={t("todo.picker.prev")}
            onClick={() => setCursor((c) => addMonths(c, -1))}
            className="btn-icon"
            style={{ width: 28, height: 28 }}
          >
            <ChevronLeft size={14} />
          </button>
          <span style={{ fontSize: 16, fontWeight: 600 }}>{monthLabel}</span>
          <button
            type="button"
            aria-label={t("todo.picker.next")}
            onClick={() => setCursor((c) => addMonths(c, 1))}
            className="btn-icon"
            style={{ width: 28, height: 28 }}
          >
            <ChevronRight size={14} />
          </button>
        </div>

        {/* Day-of-week header */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(7, 1fr)",
            gap: 4,
            margin: "0 0 4px",
          }}
        >
          {DOW_LABELS.map((d, i) => (
            <span
              key={i}
              style={{
                textAlign: "center",
                fontSize: 12,
                color: "var(--color-body-muted)",
              }}
            >
              {d}
            </span>
          ))}
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(7, 1fr)",
            gap: 4,
          }}
        >
          {monthDays.map((d) => {
            const k = toDateKey(d);
            const disabled = minDate !== undefined && k < minDate;
            const sel = k === value;
            const inMonth = d.getMonth() === cursor.getMonth();
            return (
              <button
                key={k}
                type="button"
                onClick={() => { if (!disabled) onChange(k); }}
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
              >
                {d.getDate()}
              </button>
            );
          })}
        </div>
      </div>
    </>
  );
}
