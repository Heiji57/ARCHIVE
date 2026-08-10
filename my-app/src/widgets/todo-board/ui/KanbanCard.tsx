import { memo, useState } from "react";
import { AlignLeft, CalendarDays, Repeat, Tag } from "lucide-react";
import type { TaskStatus, Todo } from "@/entities/todo/model/types";
import { isRecurringTodo } from "@/entities/todo/lib/selectors";
import { tagColor } from "@/entities/todo/lib/tagColor";
import { StatusIcon } from "@/entities/todo/ui/StatusIcon";
import { TagEditor } from "@/entities/todo/ui/TagEditor";
import { useDraggable } from "@/shared/lib/dnd";
import { useTranslation } from "@/shared/lib/i18n";
import { KANBAN_DRAG_KIND } from "../model/constants";

export interface KanbanCardProps {
  todo: Todo;
  isDone: boolean;
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

function KanbanCardImpl({ todo, isDone, allTags, recentTags, onUpdate, onSelect }: KanbanCardProps) {
  const { t } = useTranslation();
  const { isDragging, ...dragHandlers } = useDraggable({ kind: KANBAN_DRAG_KIND, data: { id: todo.id } });
  const [tagPopoverOpen, setTagPopoverOpen] = useState(false);

  const advance = () => {
    const next: TaskStatus =
      todo.status === "not-start"
        ? "in-progress"
        : todo.status === "in-progress"
          ? "done"
          : "not-start";
    onUpdate(todo.id, { status: next });
  };

  return (
    <div
      className="kanban-card"
      data-done={isDone ? "true" : undefined}
      data-status={todo.status}
      data-draggable="true"
      data-dragging={isDragging ? "true" : undefined}
      {...dragHandlers}
    >
      <div
        className="kanban-card-body"
        onClick={() => onSelect(todo.id)}
        style={{ cursor: "pointer" }}
      >
        <div className="kanban-card-top">
          <p
            className="kanban-card-title"
            data-done={isDone ? "true" : undefined}
          >
            {todo.title}
          </p>
          {isRecurringTodo(todo) ? (
            <Repeat
              className="kanban-card-notes"
              size={13}
              aria-label={t("todo.card.recurring")}
            />
          ) : null}
          {todo.description ? (
            <AlignLeft
              className="kanban-card-notes"
              size={13}
              aria-label={t("todo.card.hasNotes")}
            />
          ) : null}
        </div>

        <div className="kanban-card-meta">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              advance();
            }}
            title={t("todo.card.advance")}
            className="kanban-card-status-btn"
          >
            <StatusIcon status={todo.status} size={15} />
          </button>

          <span className="kanban-card-date">
            <CalendarDays size={11} />
            {todo.dateKey}
          </span>
        </div>

        <div
          className="kanban-card-tags"
          onClick={(e) => e.stopPropagation()}
        >
          {todo.tags.map((tag) => (
            <span key={tag} className="tag-chip">
              <span className="tag-chip-dot" style={{ background: tagColor(tag) }} />
              {tag}
            </span>
          ))}
          <div className="kanban-card-tag-anchor">
            <button
              type="button"
              className="kanban-card-tag-add"
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
                <div className="kanban-card-tag-popover">
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
 * Memoized to avoid re-rendering every card when only one
 * todo in the column changes.
 */
export const KanbanCard = memo(KanbanCardImpl);
