import { StatusIcon } from "@/entities/todo/ui/StatusIcon";
import type { TaskStatus, Todo } from "@/entities/todo/model/types";
import { useTranslation } from "@/shared/lib/i18n";
import type { TranslationKey } from "@/shared/lib/i18n";
import { tagColor } from "@/entities/todo/lib/tagColor";

interface TodayTimelineProps {
  todos: Todo[];
  doneCount: number;
  total: number;
  onSelect: (id: string) => void;
}

const STATUS_LABEL: Record<TaskStatus, TranslationKey> = {
  done: "calendar.legend.done",
  "in-progress": "calendar.legend.inProgress",
  "not-start": "calendar.legend.notStart",
};

/** 오늘의 타임라인 — 시간순 할 일 리스트(우측 컬럼). */
export function TodayTimeline({ todos, doneCount, total, onSelect }: TodayTimelineProps) {
  const { t } = useTranslation();

  return (
    <section className="dash-card dash-timeline" aria-label={t("dashboard.timeline.title")}>
      <header className="dash-timeline-head">
        <h2 className="dash-card-title">{t("dashboard.timeline.title")}</h2>
        <span className="dash-timeline-count">
          {t("dashboard.timeline.done", { done: doneCount, total })}
        </span>
      </header>

      {todos.length === 0 ? (
        <p className="dash-empty-inline">{t("dashboard.timeline.empty")}</p>
      ) : (
        <ul className="dash-timeline-list">
          {todos.map((todo) => (
            <li key={todo.id}>
              <button
                type="button"
                className="dash-timeline-item"
                onClick={() => onSelect(todo.id)}
              >
                <span className="dash-timeline-time">{todo.startTime ?? "—"}</span>
                <span className="dash-timeline-node">
                  <StatusIcon status={todo.status} size={18} />
                </span>
                <span className="dash-timeline-body">
                  <span
                    className={`dash-timeline-title${todo.status === "done" ? " is-done" : ""}`}
                  >
                    {todo.title}
                  </span>
                  <span className="dash-timeline-meta">
                    {todo.tags.map((tag) => (
                      <span key={tag} className="dash-tag-chip">
                        <span className="dash-legend-dot" style={{ background: tagColor(tag) }} />
                        {tag}
                      </span>
                    ))}
                    <span className={`dash-status-chip status-${todo.status}`}>
                      {t(STATUS_LABEL[todo.status])}
                    </span>
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
