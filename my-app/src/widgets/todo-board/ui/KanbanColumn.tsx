import type { Todo } from "@/entities/todo/model/types";
import { Pill } from "@/shared/ui/pill/Pill";
import { useDropTarget } from "@/shared/lib/dnd";
import { useTranslation } from "@/shared/lib/i18n";
import { KANBAN_DRAG_KIND, type KanbanColumnConfig } from "../model/constants";
import { KanbanCard, type KanbanCardProps } from "./KanbanCard";

export interface KanbanColumnProps {
  col: KanbanColumnConfig;
  items: Todo[];
  allTags: string[];
  recentTags: string[];
  onUpdate: KanbanCardProps["onUpdate"];
  onSelect: KanbanCardProps["onSelect"];
}

export function KanbanColumn({ col, items, allTags, recentTags, onUpdate, onSelect }: KanbanColumnProps) {
  const { t } = useTranslation();
  const isDone = col.id === "done";

  // 카드를 이 컬럼에 드롭하면 해당 컬럼의 상태로 변경
  const { ref, isOver, isActive } = useDropTarget<typeof KANBAN_DRAG_KIND>(
    KANBAN_DRAG_KIND,
    (payload) => {
      const { id } = payload.data as { id: string };
      onUpdate(id, { status: col.id });
    },
  );

  return (
    <section
      className="kanban-col"
      data-done={isDone ? "true" : undefined}
    >
      <div className="kanban-col-head">
        <div className="kanban-col-head-left">
          <span className="kanban-col-dot" data-status={col.id} />
          <div>
            <p className="kanban-col-title">{t(col.labelKey)}</p>
            <p className="kanban-col-subtitle">{t(col.koKey)}</p>
          </div>
        </div>

        <Pill tone={col.tone}>{items.length}</Pill>
      </div>

      <div
        className="kanban-col-body"
        ref={ref}
        data-drop-active={isActive}
        data-drop-over={isOver}
      >
        {items.length === 0 ? (
          <div className="dashed kanban-col-empty">
            {t("todo.col.empty")}
          </div>
        ) : (
          items.map((todoItem) => (
            <KanbanCard
              key={todoItem.id}
              todo={todoItem}
              allTags={allTags}
              recentTags={recentTags}
              onUpdate={onUpdate}
              onSelect={onSelect}
              isDone={isDone}
            />
          ))
        )}
      </div>
    </section>
  );
}
