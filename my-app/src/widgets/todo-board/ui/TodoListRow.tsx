import { memo } from "react";
import { AlignLeft, CalendarDays, Repeat } from "lucide-react";
import type { TaskStatus, Todo } from "@/entities/todo/model/types";
import { isRecurringTodo } from "@/entities/todo/lib/selectors";
import { StatusIcon } from "@/entities/todo/ui/StatusIcon";
import { formatDueDateSuffix } from "@/shared/lib/date";
import { useTranslation } from "@/shared/lib/i18n";

export interface TodoListRowProps {
  todo: Todo;
  isDone: boolean;
  onUpdate: (patch: Partial<Pick<Todo, "title" | "status" | "description" | "dateKey">>) => void;
  onSelect: () => void;
}

function TodoListRowImpl({ todo, isDone, onUpdate, onSelect }: TodoListRowProps) {
  const { t } = useTranslation();

  const advance = () => {
    const next: TaskStatus =
      todo.status === "not-start"
        ? "in-progress"
        : todo.status === "in-progress"
          ? "done"
          : "not-start";
    onUpdate({ status: next });
  };

  return (
    <div
      className="todo-list-row"
      data-done={isDone ? "true" : undefined}
      data-status={todo.status}
    >
      <div
        className="todo-list-row-body"
        onClick={onSelect}
        style={{ cursor: "pointer" }}
      >
        <div className="todo-list-row-top">
          <p
            className="todo-list-row-title"
            data-done={isDone ? "true" : undefined}
          >
            {todo.title}
          </p>
          {isRecurringTodo(todo) ? (
            <Repeat
              className="todo-list-row-notes"
              size={13}
              aria-label={t("todo.card.recurring")}
            />
          ) : null}
          {todo.description ? (
            <AlignLeft
              className="todo-list-row-notes"
              size={13}
              aria-label={t("todo.card.hasNotes")}
            />
          ) : null}
        </div>

        <div className="todo-list-row-meta">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              advance();
            }}
            title={t("todo.card.advance")}
            className="todo-list-row-status-btn"
          >
            <StatusIcon status={todo.status} size={15} />
          </button>

          <span className="todo-list-row-date">
            <CalendarDays size={11} />
            {todo.dueDate && todo.dueDate !== todo.dateKey
              ? `${todo.dateKey} – ${formatDueDateSuffix(todo.dateKey, todo.dueDate)}`
              : todo.dateKey}
          </span>
        </div>
      </div>
    </div>
  );
}

/**
 * Memoized to avoid re-rendering every row when only one
 * todo in the list changes.
 */
export const TodoListRow = memo(TodoListRowImpl);
