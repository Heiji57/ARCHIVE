import type { TaskStatus } from "@/entities/todo/model/types";
import type { PillTone } from "@/shared/ui/pill/Pill";
import type { TranslationKey } from "@/shared/lib/i18n";

/**
 * Drag kind for kanban cards. Dropping a card on a column changes its status.
 * (Distinct from calendar's TODO_DRAG_KIND, which moves a todo's dateKey.)
 */
export const KANBAN_DRAG_KIND = "kanban-status";

/** Kanban column configuration. */
export interface KanbanColumnConfig {
  id: TaskStatus;
  labelKey: TranslationKey;
  koKey: TranslationKey;
  tone: PillTone;
}

export const COLS: KanbanColumnConfig[] = [
  {
    id: "not-start",
    labelKey: "todo.col.notStart.label",
    koKey: "todo.col.notStart.ko",
    tone: "ghost",
  },
  {
    id: "in-progress",
    labelKey: "todo.col.inProgress.label",
    koKey: "todo.col.inProgress.ko",
    tone: "blue",
  },
  {
    id: "done",
    labelKey: "todo.col.done.label",
    koKey: "todo.col.done.ko",
    tone: "green",
  },
];

/** Discriminated union for the board's date filter chip group. */
export type DateFilter =
  | { kind: "all" }
  | { kind: "today" }
  | { kind: "week" }
  | { kind: "specific"; dateKey: string };

/** Status filter chip selection — "all" shows every status, others narrow to one. */
export type StatusFilter = "all" | TaskStatus;
