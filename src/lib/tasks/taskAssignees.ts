import type { TaskStatus } from "@/lib/tasks/taskProgress";

export type AssigneeProgressLike = {
  user_id: string;
  status: TaskStatus;
  note: string | null;
  planned_at?: string | null;
  updated_at: string;
};

export type ProfileLike = {
  user_id: string;
  email: string;
  display_name: string | null;
};

export type DepartmentMemberRowLike = {
  user_id: string;
  department_id: string;
};

export type AssigneeSortType = "name_asc" | "updated_desc" | "status_priority";

export function normalizeNote(note: string | null | undefined) {
  const v = (note ?? "").trim();
  return v ? v : null;
}

export function normalizePlannedAt(value: string | null | undefined) {
  return value ?? null;
}

export function getDepartmentUserIds(
  departmentMembers: DepartmentMemberRowLike[],
  departmentId: string
) {
  return departmentMembers
    .filter((row) => row.department_id === departmentId)
    .map((row) => row.user_id);
}

export function computeAllBranchAssigned(
  profiles: ProfileLike[],
  assigneeIds: string[]
) {
  return profiles.length > 0 && profiles.every((p) => assigneeIds.includes(p.user_id));
}

export function computeAllDepartmentAssigned(
  departmentUserIds: string[],
  assigneeIds: string[]
) {
  return (
    departmentUserIds.length > 0 &&
    departmentUserIds.every((id) => assigneeIds.includes(id))
  );
}

export function toggleAssigneeId(currentIds: string[], userId: string) {
  return currentIds.includes(userId)
    ? currentIds.filter((id) => id !== userId)
    : [...currentIds, userId];
}

export function replaceAssigneesWithAllBranch(profiles: ProfileLike[], checked: boolean) {
  if (!checked) return [];
  return profiles.map((p) => p.user_id);
}

export function mergeDepartmentAssignees(
  currentIds: string[],
  departmentUserIds: string[],
  checked: boolean
) {
  if (checked) {
    return Array.from(new Set([...currentIds, ...departmentUserIds]));
  }
  return currentIds.filter((id) => !departmentUserIds.includes(id));
}

export function hasAssigneeProgressChanged(
  initial: AssigneeProgressLike | undefined,
  current: AssigneeProgressLike | undefined
) {
  const currentStatus = current?.status ?? "todo";
  const currentNote = normalizeNote(current?.note);
  const currentPlannedAt = normalizePlannedAt(current?.planned_at);

  const initialStatus = initial?.status ?? "todo";
  const initialNote = normalizeNote(initial?.note);
  const initialPlannedAt = normalizePlannedAt(initial?.planned_at);

  return (
    currentStatus !== initialStatus ||
    currentNote !== initialNote ||
    currentPlannedAt !== initialPlannedAt
  );
}

export function buildInsertedAssigneeRows(params: {
  taskId: string;
  userIds: string[];
  progressMap: Record<string, AssigneeProgressLike | undefined>;
}) {
  const { taskId, userIds, progressMap } = params;

  return userIds.map((user_id) => {
    const progress = progressMap[user_id];
    return {
      task_id: taskId,
      user_id,
      status: progress?.status ?? "todo",
      note: normalizeNote(progress?.note),
      planned_at: normalizePlannedAt(progress?.planned_at),
    };
  });
}

export function buildUpdatedAssigneePayload(
  progress: AssigneeProgressLike | undefined,
  nowIso: string
) {
  return {
    status: progress?.status ?? "todo",
    note: normalizeNote(progress?.note),
    planned_at: normalizePlannedAt(progress?.planned_at),
    updated_at: nowIso,
  };
}

export function sortAssigneeIds(params: {
  assigneeIds: string[];
  hideDoneAssignees: boolean;
  assigneeProgressMap: Record<string, AssigneeProgressLike | undefined>;
  assigneeSort: AssigneeSortType;
  meId?: string | null;
  profileById: Map<string, ProfileLike>;
  assigneeStatusPriority: (status: TaskStatus | undefined) => number;
}) {
  const {
    assigneeIds,
    hideDoneAssignees,
    assigneeProgressMap,
    assigneeSort,
    meId,
    profileById,
    assigneeStatusPriority,
  } = params;

  const visibleAssigneeIds = hideDoneAssignees
    ? assigneeIds.filter((uid) => assigneeProgressMap[uid]?.status !== "done")
    : assigneeIds;

  return [...visibleAssigneeIds].sort((a, b) => {
    const aProfile = profileById.get(a);
    const bProfile = profileById.get(b);

    if (assigneeSort === "updated_desc") {
      const aTime = assigneeProgressMap[a]?.updated_at
        ? new Date(assigneeProgressMap[a]!.updated_at).getTime()
        : 0;
      const bTime = assigneeProgressMap[b]?.updated_at
        ? new Date(assigneeProgressMap[b]!.updated_at).getTime()
        : 0;
      return bTime - aTime;
    }

    if (assigneeSort === "status_priority") {
      const aPriority = assigneeStatusPriority(assigneeProgressMap[a]?.status);
      const bPriority = assigneeStatusPriority(assigneeProgressMap[b]?.status);

      if (aPriority !== bPriority) return aPriority - bPriority;

      const aTime = assigneeProgressMap[a]?.updated_at
        ? new Date(assigneeProgressMap[a]!.updated_at).getTime()
        : 0;
      const bTime = assigneeProgressMap[b]?.updated_at
        ? new Date(assigneeProgressMap[b]!.updated_at).getTime()
        : 0;

      return bTime - aTime;
    }

    if (meId && a === meId) return -1;
    if (meId && b === meId) return 1;

    const aHasDisplayName = Boolean(aProfile?.display_name?.trim());
    const bHasDisplayName = Boolean(bProfile?.display_name?.trim());

    if (aHasDisplayName !== bHasDisplayName) {
      return aHasDisplayName ? -1 : 1;
    }

    const aLabel = (aProfile?.display_name?.trim() || aProfile?.email || a).toLocaleLowerCase("ja");
    const bLabel = (bProfile?.display_name?.trim() || bProfile?.email || b).toLocaleLowerCase("ja");

    return aLabel.localeCompare(bLabel, "ja");
  });
}