import type { TaskStatus } from "@/entities/todo/model/types";

/** Discriminated union for the board's date filter chip group. */
export type DateFilter =
  | { kind: "all" }
  | { kind: "today" }
  | { kind: "week" }
  | { kind: "specific"; dateKey: string };

/** Status filter chip selection — "all" shows every status, others narrow to one. */
export type StatusFilter = "all" | TaskStatus;
