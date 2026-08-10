import { memo } from "react";
import type { Todo } from "@/entities/todo/model/types";
import { TagDots } from "@/entities/todo/ui/TagDots";
import { useDraggable } from "@/shared/lib/dnd";
import { TODO_DRAG_KIND } from "../model/constants";

export interface DraggableMonthChipProps {
  todo: Todo;
  /** 안정적 참조(setState 등)를 그대로 넘겨야 memo 가 작동한다 — 인라인 클로저 금지. */
  onSelect: (id: string) => void;
}

function DraggableMonthChipImpl({ todo, onSelect }: DraggableMonthChipProps) {
  const { isDragging, ...dragHandlers } = useDraggable({ kind: TODO_DRAG_KIND, data: { id: todo.id } });

  return (
    <button
      type="button"
      onClick={() => onSelect(todo.id)}
      data-draggable="true"
      data-dragging={isDragging ? "true" : undefined}
      data-status={todo.status}
      className="todo-month-chip"
      {...dragHandlers}
    >
      <span className="todo-month-chip-title">{todo.title}</span>
      <TagDots tags={todo.tags} />
    </button>
  );
}

export const DraggableMonthChip = memo(DraggableMonthChipImpl);
