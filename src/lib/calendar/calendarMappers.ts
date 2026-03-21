import type {
  CalendarEventItem,
  CalendarProjectOption,
} from "@/lib/calendar/calendarTypes";
import type {
  PersonalPlannedSourceRow,
  TaskDueSourceRow,
  ProjectOptionRow,
  ProjectScheduleEventRow,
  ProjectScheduleSourceRow,
  ProjectTaskDueRow,
} from "@/lib/calendar/calendarQueries";

type TaskProgressSummary = {
  assigneeCount: number;
  doneCount: number;
};

function buildProgressLabel(summary?: TaskProgressSummary): string | undefined {
  if (!summary) return undefined;
  return `${summary.doneCount}/${summary.assigneeCount}`;
}

function colorKeyForRequestTask(summary?: TaskProgressSummary): "due" | "done" {
  if (!summary) return "due";
  if (summary.assigneeCount > 0 && summary.doneCount === summary.assigneeCount) {
    return "done";
  }
  return "due";
}

function colorKeyForAssignedTask(status?: string | null): "assigned" | "done" {
  if (status === "done") return "done";
  return "assigned";
}

function assigneeStatusLabel(status?: string | null): string {
  switch (status) {
    case "todo":
      return "未";
    case "doing":
      return "進";
    case "done":
      return "完";
    case "hold":
      return "保";
    default:
      return "未";
  }
}

function extractPersonalTask(
  tasks: PersonalPlannedSourceRow["tasks"]
):
  | {
      id: string;
      title: string;
      due_at: string | null;
      status: string | null;
      project_id: string | null;
      requester_id: string | null;
    }
  | null {
  if (!tasks) return null;
  if (Array.isArray(tasks)) {
    return tasks[0] ?? null;
  }
  return tasks;
}

export function mapTaskDueToCalendarEvent(
  row: TaskDueSourceRow,
  summary?: TaskProgressSummary
): CalendarEventItem | null {
  if (!row.due_at) return null;

  return {
    id: `task-due-${row.id}`,
    type: "task_due",
    title: row.title,
    label: buildProgressLabel(summary),
    start: row.due_at,
    allDay: true,
    href: `/tasks/${row.id}`,
    taskId: row.id,
    projectId: row.project_id ?? undefined,
    colorKey: colorKeyForRequestTask(summary),
    viewScope: "all",
    meta: {
      status: row.status ?? undefined,
      projectName: null,
    },
  };
}

function normalizeProjectSchedule(
  raw: unknown
): ProjectScheduleEventRow[] {

  if (!raw) return [];

  if (Array.isArray(raw)) {
    return raw as ProjectScheduleEventRow[];
  }

  if (typeof raw === "string") {
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? (parsed as ProjectScheduleEventRow[]) : [];
    } catch (error) {
      return [];
    }
  }

  if (typeof raw === "object") {

    const maybeItems = (raw as { items?: unknown }).items;
    if (Array.isArray(maybeItems)) {
      return maybeItems as ProjectScheduleEventRow[];
    }
  }

  return [];
}

function normalizeProjectScheduleEvent(
  event: ProjectScheduleEventRow & {
    eventName?: string;
    date?: string;
  }
): {
  id?: string;
  title: string | null;
  start: string | null;
  end?: string;
  allDay: boolean;
} {
  const title =
    typeof event.title === "string"
      ? event.title
      : typeof event.eventName === "string"
      ? event.eventName
      : null;

  const start =
    typeof event.start === "string"
      ? event.start
      : typeof event.date === "string"
      ? event.date
      : null;

  const end = typeof event.end === "string" ? event.end : undefined;

  const allDay =
    !!start &&
    /^\d{4}-\d{2}-\d{2}$/.test(start);

  return {
    id: event.id,
    title,
    start,
    end,
    allDay,
  };
}

export function mapPersonalAssignedTaskDueToCalendarEvent(
  row: PersonalPlannedSourceRow
): CalendarEventItem | null {
  const task = extractPersonalTask(row.tasks);
  if (!task?.due_at) return null;

  return {
    id: `personal-assigned-due-${task.id}`,
    type: "task_due",
    title: task.title,
    label: assigneeStatusLabel(row.status),
    start: task.due_at,
    allDay: true,
    href: `/tasks/${task.id}`,
    taskId: task.id,
    projectId: task.project_id ?? undefined,
    assigneeUserId: row.user_id,
    colorKey: colorKeyForAssignedTask(row.status),
    viewScope: "personal",
    meta: {
      status: task.status ?? undefined,
      projectName: null,
    },
  };
}

export function mapPersonalRequestedTaskDueToCalendarEvent(
  row: TaskDueSourceRow,
  summary?: TaskProgressSummary
): CalendarEventItem | null {
  if (!row.due_at) return null;

  return {
    id: `personal-requested-due-${row.id}`,
    type: "task_due",
    title: row.title,
    label: buildProgressLabel(summary),
    start: row.due_at,
    allDay: true,
    href: `/tasks/${row.id}`,
    taskId: row.id,
    projectId: row.project_id ?? undefined,
    colorKey: colorKeyForRequestTask(summary),
    viewScope: "personal",
    meta: {
      status: row.status ?? undefined,
      projectName: null,
    },
  };
}

export function mapPersonalPlannedToCalendarEvent(
  row: PersonalPlannedSourceRow
): CalendarEventItem | null {
  const task = extractPersonalTask(row.tasks);
  if (!task || !row.planned_at) return null;

  return {
    id: `personal-plan-${task.id}-${row.user_id}`,
    type: "assignee_plan",
    title: task.title,
    label: undefined,
    start: row.planned_at,
    allDay: false,
    href: `/tasks/${task.id}`,
    taskId: task.id,
    projectId: task.project_id ?? undefined,
    assigneeUserId: row.user_id,
    colorKey: "plan",
    viewScope: "personal",
    meta: {
      status: row.status ?? undefined,
      projectName: null,
    },
  };
}

export function mapProjectOption(
  row: ProjectOptionRow
): CalendarProjectOption | null {
  if (!row.name) return null;

  return {
    id: row.id,
    name: row.name,
  };
}

export function mapProjectTaskDueToCalendarEvent(
  row: ProjectTaskDueRow,
  summary?: TaskProgressSummary
): CalendarEventItem | null {
  if (!row.due_at) return null;

  return {
    id: `project-task-due-${row.id}`,
    type: "task_due",
    title: row.title,
    label: buildProgressLabel(summary),
    start: row.due_at,
    allDay: true,
    href: `/tasks/${row.id}`,
    taskId: row.id,
    projectId: row.project_id ?? undefined,
    colorKey: colorKeyForRequestTask(summary),
    viewScope: "project",
    meta: {
      status: row.status ?? undefined,
      projectName: null,
    },
  };
}

export function mapProjectScheduleToCalendarEvents(
  row: ProjectScheduleSourceRow
): CalendarEventItem[] {
  const schedule = normalizeProjectSchedule(row.schedule);
  const mapped = schedule.map((event, index) => {
    const normalized = normalizeProjectScheduleEvent(
      event as ProjectScheduleEventRow & {
        eventName?: string;
        date?: string;
      }
    );

    if (!normalized.title || !normalized.start) {
      return null;
    }

    const calendarEvent: CalendarEventItem = {
      id: `project-event-${row.id}-${normalized.id ?? index}`,
      type: "project_event",
      title: normalized.title,
      start: normalized.start,
      end: normalized.end,
      allDay: normalized.allDay,
      href: `/projects/${row.id}`,
      projectId: row.id,
      colorKey: "project",
      viewScope: "project",
      meta: {
        projectName: row.name ?? null,
      },
    };

    return calendarEvent;
  });

  return mapped.filter((event) => event !== null);
}

export function mapAllProjectSchedulesToCalendarEvents(
  rows: ProjectScheduleSourceRow[]
): CalendarEventItem[] {
  return rows.flatMap((row) => mapProjectScheduleToCalendarEvents(row));
}