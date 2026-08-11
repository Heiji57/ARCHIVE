import { createPortal } from "react-dom";
import { useDnd } from "@/shared/lib/dnd";
import { useArchiveApp } from "@/app/providers/useArchiveApp";
import { TODO_DRAG_KIND } from "@/widgets/calendar-dashboard/model/constants";

export function TodoDragGhost() {
  const { state } = useDnd();
  const { state: appState } = useArchiveApp();

  if (!state.payload || !state.pointer) return null;

  const kind = state.payload.kind;
  if (kind !== TODO_DRAG_KIND) return null;

  const data = state.payload.data as { id: string };
  const todo = appState.todos.find((t) => t.id === data.id);
  if (!todo) return null;

  const { x, y } = state.pointer;
  const rect = state.dragRect;

  const ghostLeft = rect ? x - rect.offsetX : x + 14;
  const ghostTop = rect ? y - rect.offsetY : y - 10;

  const statusColor =
    todo.status === "done"
      ? "var(--color-status-done)"
      : todo.status === "in-progress"
        ? "var(--color-primary)"
        : "var(--color-ink-muted-48)";

  return createPortal(
    <div
      className="drag-ghost"
      style={{ left: ghostLeft, top: ghostTop, width: rect?.width, height: rect?.height }}
    >
      <p className="drag-ghost-title">{todo.title}</p>
      <div className="drag-ghost-meta">
        <span className="drag-ghost-dot" style={{ background: statusColor }} />
        <span className="drag-ghost-date">{todo.dateKey}</span>
      </div>
    </div>,
    document.body,
  );
}
