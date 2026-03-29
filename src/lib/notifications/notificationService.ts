export function buildDueDayBeforeDedupeKey(input: {
  userId: string;
  taskId: string;
  targetDate: string;
}) {
  return `due_day_before:${input.userId}:${input.taskId}:${input.targetDate}`;
}

export function buildDueSameDayDedupeKey(input: {
  userId: string;
  taskId: string;
  targetDate: string;
}) {
  return `due_same_day:${input.userId}:${input.taskId}:${input.targetDate}`;
}

export function buildPlannedDayBeforeDedupeKey(input: {
  userId: string;
  taskId: string;
  assigneeUserId: string;
  plannedAtIso: string;
}) {
  return `planned_day_before:${input.userId}:${input.taskId}:${input.assigneeUserId}:${input.plannedAtIso}`;
}

export function buildPlannedSameDayDedupeKey(input: {
  userId: string;
  taskId: string;
  assigneeUserId: string;
  plannedAtIso: string;
}) {
  return `planned_same_day:${input.userId}:${input.taskId}:${input.assigneeUserId}:${input.plannedAtIso}`;
}