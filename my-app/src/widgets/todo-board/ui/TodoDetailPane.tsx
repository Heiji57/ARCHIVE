import { CheckCircle2 } from "lucide-react";
import type { Todo } from "@/entities/todo/model/types";
import { TaskDetailPanel, type TaskDetailPanelProps } from "@/entities/todo/ui/TaskDetailPanel";
import { useTranslation } from "@/shared/lib/i18n";

export interface TodoDetailPaneProps {
  selection: {
    todo: Todo;
    panelProps: Omit<TaskDetailPanelProps, "todo">;
  } | null;
}

/**
 * 분할 뷰 우측 컬럼. 선택된 할 일이 없으면 빈 상태 안내를,
 * 있으면 `TaskDetailPanel`을 렌더링한다.
 */
export function TodoDetailPane({ selection }: TodoDetailPaneProps) {
  const { t } = useTranslation();

  if (!selection) {
    return (
      <section className="todo-detail-pane todo-detail-pane-empty">
        <div className="todo-detail-empty">
          <span className="todo-detail-empty-icon">
            <CheckCircle2 size={22} />
          </span>
          <p className="todo-detail-empty-title">{t("todo.detail.emptyTitle")}</p>
          <p className="todo-detail-empty-desc">{t("todo.detail.emptyDesc")}</p>
        </div>
      </section>
    );
  }

  return (
    <section className="todo-detail-pane">
      <TaskDetailPanel key={selection.todo.id} todo={selection.todo} {...selection.panelProps} />
    </section>
  );
}
