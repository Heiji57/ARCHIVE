import { useState } from "react";
import { CalendarDays, ChevronDown, Plus, Repeat, Tag as TagIcon } from "lucide-react";
import { DatePickerPopover } from "@/entities/todo/ui/DatePickerPopover";
import { RecurrencePopover } from "@/entities/todo/ui/RecurrencePopover";
import { TagEditor } from "@/entities/todo/ui/TagEditor";
import type { RecurrenceRule } from "@/entities/todo/model/types";
import { addDays, toDateKey, todayKey } from "@/shared/lib/date";
import { useTranslation } from "@/shared/lib/i18n";

export interface QuickCaptureProps {
  onSubmit: (
    text: string,
    dateKey: string,
    recurrenceRule?: RecurrenceRule | null,
    tags?: string[],
  ) => void;
  /** 태그 자동완성 후보 (기존 할 일에서 이미 쓰인 태그들). */
  tagSuggestions: string[];
  /** 포커스 직후 보여줄 "최근 사용" 태그. */
  recentTags: string[];
}

/**
 * Compact single-row capture bar at the bottom of the Todo board:
 * text field + date chip + Add button.
 *
 * 새 할 일의 Google Calendar push 여부는 `calendarAutoPushTodo` 설정을
 * 그대로 따른다(생성 시 별도 토글 없음 → 서버가 설정값으로 처리).
 * 개별 할 일의 캘린더 연동 변경은 상세 패널에서 한다.
 */
export function QuickCapture({ onSubmit, tagSuggestions, recentTags }: QuickCaptureProps) {
  const { t } = useTranslation();
  const [input, setInput] = useState("");
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickedDate, setPickedDate] = useState(todayKey);
  const [recurrencePickerOpen, setRecurrencePickerOpen] = useState(false);
  const [recurrenceRule, setRecurrenceRule] = useState<RecurrenceRule | null>(null);
  const [tagPickerOpen, setTagPickerOpen] = useState(false);
  const [tags, setTags] = useState<string[]>([]);

  const today = new Date();
  const todayK = toDateKey(today);
  const tomorrowK = toDateKey(addDays(today, 1));

  const pickedLabel =
    pickedDate === todayK
      ? t("todo.quick.today")
      : pickedDate === tomorrowK
        ? t("todo.quick.tomorrow")
        : pickedDate;

  const recurrenceLabel = recurrenceRule
    ? recurrenceRule.interval === 1
      ? t(recurrenceRule.unit === "day" ? "todo.recurrence.label.daily" : "todo.recurrence.label.weekly")
      : t("todo.recurrence.label.interval", {
          n: recurrenceRule.interval,
          unit: t(`todo.recurrence.unitNoun.${recurrenceRule.unit}`),
        })
    : t("todo.recurrence.chipOff");

  const tagLabel =
    tags.length === 0
      ? t("todo.tag.chipOff")
      : tags.length <= 2
        ? tags.join(", ")
        : `${tags[0]}, ${tags[1]} +${tags.length - 2}`;

  const submit = (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!input.trim()) return;
    onSubmit(input.trim(), pickedDate, recurrenceRule, tags);
    setInput("");
    setRecurrenceRule(null);
    setTags([]);
  };

  return (
    <form onSubmit={submit} className="quick-capture">
      <div className="quick-capture-input-wrap">
        <Plus size={16} />
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={t("todo.quickCapture.placeholder")}
          className="quick-capture-input"
        />
      </div>

      <div className="quick-capture-date-wrap">
        <button
          type="button"
          onClick={() => setPickerOpen((p) => !p)}
          className="btn btn-utility quick-capture-date-btn"
        >
          <CalendarDays size={14} />
          {pickedLabel}
          <ChevronDown size={12} />
        </button>

        {pickerOpen ? (
          <DatePickerPopover
            value={pickedDate}
            onChange={(v) => {
              setPickedDate(v);
              setPickerOpen(false);
            }}
            onClose={() => setPickerOpen(false)}
          />
        ) : null}
      </div>

      <div className="quick-capture-date-wrap">
        <button
          type="button"
          onClick={() => setRecurrencePickerOpen((p) => !p)}
          className="btn btn-utility quick-capture-date-btn"
          data-active={recurrenceRule ? "true" : undefined}
        >
          <Repeat size={14} />
          {recurrenceLabel}
          <ChevronDown size={12} />
        </button>

        {recurrencePickerOpen ? (
          <RecurrencePopover
            value={recurrenceRule}
            onChange={setRecurrenceRule}
            onClose={() => setRecurrencePickerOpen(false)}
          />
        ) : null}
      </div>

      <div className="quick-capture-date-wrap">
        <button
          type="button"
          onClick={() => setTagPickerOpen((p) => !p)}
          className="btn btn-utility quick-capture-date-btn"
          data-active={tags.length > 0 ? "true" : undefined}
        >
          <TagIcon size={14} />
          {tagLabel}
          <ChevronDown size={12} />
        </button>

        {tagPickerOpen ? (
          <>
            <div
              onClick={() => setTagPickerOpen(false)}
              style={{ position: "fixed", inset: 0, zIndex: 30 }}
            />
            <div
              style={{
                position: "absolute",
                top: "calc(100% + 8px)",
                right: 0,
                zIndex: 31,
                background: "var(--color-tile-2)",
                border: "1px solid var(--color-divider-soft)",
                borderRadius: "var(--r-lg)",
                padding: 14,
                width: 280,
                boxShadow: "var(--shadow-toast)",
              }}
            >
              <p
                className="t-eyebrow"
                style={{ margin: "0 0 10px", color: "var(--color-body-muted)" }}
              >
                {t("todo.tag.title")}
              </p>
              <TagEditor
                tags={tags}
                suggestions={tagSuggestions}
                recentTags={recentTags}
                onChange={setTags}
                autoFocus
              />
              <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 12 }}>
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={() => setTagPickerOpen(false)}
                  style={{ padding: "8px 16px", fontSize: 16 }}
                >
                  {t("todo.tag.done")}
                </button>
              </div>
            </div>
          </>
        ) : null}
      </div>

      <button type="submit" className="btn btn-primary quick-capture-submit">
        {t("todo.quickCapture.add")}
      </button>
    </form>
  );
}
