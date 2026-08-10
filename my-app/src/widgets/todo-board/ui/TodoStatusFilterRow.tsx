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
