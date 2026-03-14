export type SortableTaskStatus = "todo" | "doing" | "done" | "hold";

export type SortableTaskBase = {
  created_at: string;
  due_at: string | null;
};

export type SortableTaskWithMyStatus = SortableTaskBase & {
  myStatus: SortableTaskStatus | null;
};

export type SortableTaskWithProgress = SortableTaskBase & {
  progress: {
    assigneeCount: number;
    doneCount: number;
  };
};

export type CommonSortKey = "requested_desc" | "due_asc";
export type DashboardSortKey =
  | "requested_desc"
  | "due_asc"
  | "my_status_priority";

export type TaskListSortKey =
  | "requested_desc"
  | "due_asc"
  | "progress_desc";

function timeOrFallback(value: string | null | undefined, fallback: number) {
  if (!value) return fallback;
  const ms = new Date(value).getTime();
  return Number.isNaN(ms) ? fallback : ms;
}

export function compareRequestedDesc<T extends SortableTaskBase>(a: T, b: T) {
  return timeOrFallback(b.created_at, 0) - timeOrFallback(a.created_at, 0);
}

export function compareDueAsc<T extends SortableTaskBase>(a: T, b: T) {
  const aDue = timeOrFallback(a.due_at, Number.POSITIVE_INFINITY);
  const bDue = timeOrFallback(b.due_at, Number.POSITIVE_INFINITY);

  if (aDue !== bDue) return aDue - bDue;

  return compareRequestedDesc(a, b);
}

export function compareMyStatusPriority<T extends SortableTaskWithMyStatus>(
  a: T,
  b: T
) {
  const priority: Record<SortableTaskStatus, number> = {
    doing: 0,
    todo: 1,
    hold: 2,
    done: 3,
  };

  const aPriority = priority[a.myStatus ?? "todo"];
  const bPriority = priority[b.myStatus ?? "todo"];

  if (aPriority !== bPriority) return aPriority - bPriority;

  return compareRequestedDesc(a, b);
}

export function compareProgressPriority<T extends SortableTaskWithProgress>(
  a: T,
  b: T
) {
  const rateA =
    a.progress.assigneeCount === 0
      ? -1
      : a.progress.doneCount / a.progress.assigneeCount;

  const rateB =
    b.progress.assigneeCount === 0
      ? -1
      : b.progress.doneCount / b.progress.assigneeCount;

  if (rateA !== rateB) return rateA - rateB;

  return compareDueAsc(a, b);
}

export function sortDashboardTasks<T extends SortableTaskWithMyStatus>(
  tasks: T[],
  sortKey: DashboardSortKey
) {
  const copied = [...tasks];

  switch (sortKey) {
    case "due_asc":
      return copied.sort(compareDueAsc);
    case "my_status_priority":
      return copied.sort(compareMyStatusPriority);
    case "requested_desc":
    default:
      return copied.sort(compareRequestedDesc);
  }
}

export function sortCommonTasks<T extends SortableTaskBase>(
  tasks: T[],
  sortKey: CommonSortKey
) {
  const copied = [...tasks];

  switch (sortKey) {
    case "due_asc":
      return copied.sort(compareDueAsc);
    case "requested_desc":
    default:
      return copied.sort(compareRequestedDesc);
  }
}

export function sortTaskListItems<T extends SortableTaskWithProgress>(
  tasks: T[],
  sortKey: TaskListSortKey
) {
  const copied = [...tasks];

  switch (sortKey) {
    case "due_asc":
      return copied.sort(compareDueAsc);
    case "progress_desc":
      return copied.sort(compareProgressPriority);
    case "requested_desc":
    default:
      return copied.sort(compareRequestedDesc);
  }
}