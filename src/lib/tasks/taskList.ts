import type { SortableTaskStatus } from "@/lib/taskSort";

export type TaskStatus = SortableTaskStatus;
export type ScopeType = "branch" | "department" | "personal";

export type TaskRow = {
  id: string;
  title: string;
  description: string | null;
  requester_id: string;
  scope_type: ScopeType;
  scope_id: string;
  due_at: string | null;
  status: TaskStatus;
  created_at: string;
  updated_at: string;
  project_id: string | null;
  projects?: {
    id: string;
    name: string;
  } | null;
}; 

export type TaskAssigneeRow = {
  task_id: string;
  user_id: string;
  status: TaskStatus;
};

export type TaskAssigneeSummary = {
  assigneeUserIds: string[];
  assigneeCount: number;
  doneCount: number;
  isCompleted: boolean;
};

export type TaskListItem = {
  id: string;
  title: string;
  description: string | null;
  requesterId: string;
  requesterName: string;
  scopeType: ScopeType;
  scopeId: string;
  scopeName: string;
  dueAt: string | null;
  createdAt: string;
  updatedAt: string;

  // taskSort.ts 用
  due_at: string | null;
  created_at: string;

  assigneeUserIds: string[];
  assigneePreview: string;
  progress: TaskAssigneeSummary;

  projectId: string | null;
  projectName: string | null;
};

export function buildUserDisplayLabel(params: {
  displayName: string | null;
  email: string | null;
}): string {
  const { displayName, email } = params;
  return displayName ? `${displayName}（${email ?? "-"}）` : email ?? "-";
}

export function buildScopeBadgeLabel(params: {
  scopeType: ScopeType;
  scopeName: string;
}): string {
  const { scopeType, scopeName } = params;

  if (scopeType === "department") return scopeName;
  if (scopeType === "branch") return "支部";
  return "個人";
}

export function buildTaskProgressMap(
  assigneesByTask: Record<string, TaskAssigneeRow[]>
): Record<string, TaskAssigneeSummary> {
  const map: Record<string, TaskAssigneeSummary> = {};

  for (const [taskId, assignees] of Object.entries(assigneesByTask)) {
    const assigneeUserIds = assignees.map((a) => a.user_id);
    const assigneeCount = assignees.length;
    const doneCount = assignees.filter((a) => a.status === "done").length;
    const isCompleted = assigneeCount > 0 && doneCount === assigneeCount;

    map[taskId] = {
      assigneeUserIds,
      assigneeCount,
      doneCount,
      isCompleted,
    };
  }

  return map;
}

type BuildTaskListItemsParams = {
  tasks: TaskRow[];
  taskProgressById: Record<string, TaskAssigneeSummary>;
  branchName: string;
  deptNameById: Map<string, string>;
  requesterNameById: Map<string, string>;
  userNameById: Map<string, string>;
};

export function buildTaskListItems({
  tasks,
  taskProgressById,
  branchName,
  deptNameById,
  requesterNameById,
  userNameById,
}: BuildTaskListItemsParams): TaskListItem[] {
  return tasks.map((t) => {
    const progress = taskProgressById[t.id] ?? {
      assigneeUserIds: [],
      assigneeCount: 0,
      doneCount: 0,
      isCompleted: false,
    };

    const scopeName =
      t.scope_type === "branch"
        ? branchName
        : t.scope_type === "department"
        ? deptNameById.get(t.scope_id) ?? "(不明な部署)"
        : requesterNameById.get(t.scope_id) ?? "(不明な個人)";

    const assigneePreview =
      progress.assigneeUserIds.length === 0
        ? "未割当"
        : progress.assigneeUserIds.length === 1
        ? userNameById.get(progress.assigneeUserIds[0]) ?? "1名"
        : `${userNameById.get(progress.assigneeUserIds[0]) ?? "1名"} 他${progress.assigneeUserIds.length - 1}名`;

    return {
      id: t.id,
      title: t.title,
      description: t.description,
      requesterId: t.requester_id,
      requesterName: requesterNameById.get(t.requester_id) ?? "(不明な依頼者)",
      scopeType: t.scope_type,
      scopeId: t.scope_id,
      scopeName,
      dueAt: t.due_at,
      createdAt: t.created_at,
      updatedAt: t.updated_at,

      due_at: t.due_at,
      created_at: t.created_at,

      assigneeUserIds: progress.assigneeUserIds,
      assigneePreview,
      progress,

      projectId: t.project_id ?? null,
      projectName: t.projects?.name ?? null,
    };
  });
}