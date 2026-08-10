import { memo, useState } from "react";
import { AlignLeft, CalendarDays, Repeat, Tag } from "lucide-react";
import type { TaskStatus, Todo } from "@/entities/todo/model/types";
import { isRecurringTodo } from "@/entities/todo/lib/selectors";
import { tagColor } from "@/entities/todo/lib/tagColor";
import { StatusIcon } from "@/entities/todo/ui/StatusIcon";
import { TagEditor } from "@/entities/todo/ui/TagEditor";
import { useTranslation } from "@/shared/lib/i18n";

export interface TodoListRowProps {
  todo: Todo;
  isSelected: boolean;
  /** 자동완성 검색 후보 — 보드에 로드된 다른 할 일들의 태그 전체. */
  allTags: string[];
  /** 자동완성 "최근 사용" 후보 — 최신순으로 미리 정렬돼 온다. */
  recentTags: string[];
  onUpdate: (
    id: string,
    patch: Partial<Pick<Todo, "title" | "status" | "description" | "dateKey" | "tags">>,
  ) => void;
  onSelect: (id: string) => void;
}

function TodoListRowImpl({ todo, isSelected, allTags, recentTags, onUpdate, onSelect }: TodoListRowProps) {
  const { t } = useTranslation();
  const [tagPopoverOpen, setTagPopoverOpen] = useState(false);
  const isDone = todo.status === "done";

  const advance = () => {
    const next: TaskStatus =
      todo.status === "not-start"
        ? "in-progress"
        : todo.status === "in-progress"
          ? "done"
          : "not-start";
    onUpdate(todo.id, { status: next });
  };

  const timeLabel = todo.startTime
    ? todo.endTime
      ? `${todo.startTime}–${todo.endTime}`
      : todo.startTime
    : null;

  return (
    <div
      className="todo-list-row"
      data-status={todo.status}
      data-selected={isSelected ? "true" : undefined}
      onClick={() => onSelect(todo.id)}
    >
      <button
        type="button"
        className="todo-list-row-status-btn"
        onClick={(e) => {
          e.stopPropagation();
          advance();
        }}
        title={t("todo.card.advance")}
      >
        <StatusIcon status={todo.status} size={15} />
      </button>

      <div className="todo-list-row-body">
        <div className="todo-list-row-top">
          <p className="todo-list-row-title" data-done={isDone ? "true" : undefined}>
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
          <span className="todo-list-row-date">
            <CalendarDays size={11} />
            {todo.dateKey}
          </span>
          {timeLabel ? <span className="todo-list-row-time">{timeLabel}</span> : null}

          {todo.tags.map((tag) => (
            <span key={tag} className="tag-chip">
              <span className="tag-chip-dot" style={{ background: tagColor(tag) }} />
              {tag}
            </span>
          ))}

          <div
            className="todo-list-row-tag-anchor"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              className="todo-list-row-tag-add"
              aria-label={t("todo.tag.add")}
              onClick={() => setTagPopoverOpen((o) => !o)}
            >
              <Tag size={11} />
            </button>
            {tagPopoverOpen ? (
              <>
                <div
                  onClick={() => setTagPopoverOpen(false)}
                  style={{ position: "fixed", inset: 0, zIndex: 30 }}
                />
                <div className="todo-list-row-tag-popover">
                  <TagEditor
                    tags={todo.tags}
                    suggestions={allTags}
                    recentTags={recentTags}
                    onChange={(tags) => onUpdate(todo.id, { tags })}
                    autoFocus
                  />
                </div>
              </>
            ) : null}
          </div>
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
