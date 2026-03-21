import type {
  CalendarDisplayMode,
  CalendarEventItem,
  CalendarProjectOption,
} from "@/lib/calendar/calendarTypes";
import {
  fetchAllProjectScheduleRows,
  fetchCurrentUserId,
  fetchProjectOptions,
  fetchTaskAssigneeSourceRows,
  fetchTaskDueSourceRows,
} from "@/lib/calendar/calendarQueries";
import {
  mapAllProjectSchedulesToCalendarEvents,
  mapPersonalAssignedTaskDueToCalendarEvent,
  mapPersonalPlannedToCalendarEvent,
  mapPersonalRequestedTaskDueToCalendarEvent,
  mapProjectOption,
  mapProjectTaskDueToCalendarEvent,
  mapTaskDueToCalendarEvent,
} from "@/lib/calendar/calendarMappers";

import type {
  ProjectScheduleSourceRow,
  TaskAssigneeSourceRow,
  TaskDueSourceRow,
} from "@/lib/calendar/calendarQueries";

export type CalendarBaseData = {
  currentUserId: string | null;
  taskRows: TaskDueSourceRow[];
  taskAssigneeRows: TaskAssigneeSourceRow[];
  projectScheduleRows: ProjectScheduleSourceRow[];
  projectOptions: CalendarProjectOption[];
};

function calendarEventPriority(event: CalendarEventItem): number {
  switch (event.type) {
    case "project_event":
      return 0;
    case "assignee_plan":
      return 1;
    case "task_due":
      return 2;
    default:
      return 9;
  }
}

function sortCalendarEvents(a: CalendarEventItem, b: CalendarEventItem): number {
  const dateDiff = new Date(a.start).getTime() - new Date(b.start).getTime();
  if (dateDiff !== 0) return dateDiff;

  return calendarEventPriority(a) - calendarEventPriority(b);
}

function buildTaskProgressMap(
  rows: { task_id: string; status: string | null }[]
): Map<string, { assigneeCount: number; doneCount: number }> {
  const map = new Map<string, { assigneeCount: number; doneCount: number }>();

  for (const row of rows) {
    const current = map.get(row.task_id) ?? { assigneeCount: 0, doneCount: 0 };
    current.assigneeCount += 1;
    if (row.status === "done") {
      current.doneCount += 1;
    }
    map.set(row.task_id, current);
  }

  return map;
}

function buildTaskMap(taskRows: TaskDueSourceRow[]): Map<string, TaskDueSourceRow> {
  return new Map(taskRows.map((row) => [row.id, row]));
}

export async function loadCalendarBaseData(): Promise<CalendarBaseData> {
  const [currentUserId, taskRows, taskAssigneeRows, projectScheduleRows, projectRows] =
    await Promise.all([
      fetchCurrentUserId(),
      fetchTaskDueSourceRows(),
      fetchTaskAssigneeSourceRows(),
      fetchAllProjectScheduleRows(),
      fetchProjectOptions(),
    ]);

  const projectOptions = projectRows
    .map(mapProjectOption)
    .filter((row): row is CalendarProjectOption => row !== null);

  return {
    currentUserId,
    taskRows,
    taskAssigneeRows,
    projectScheduleRows,
    projectOptions,
  };
}

export function buildAllModeEvents(
  baseData: CalendarBaseData
): CalendarEventItem[] {
  const progressMap = buildTaskProgressMap(baseData.taskAssigneeRows);

  const taskEvents = baseData.taskRows
    .map((row) => mapTaskDueToCalendarEvent(row, progressMap.get(row.id)))
    .filter((event): event is CalendarEventItem => event !== null);

  const projectEvents = mapAllProjectSchedulesToCalendarEvents(
    baseData.projectScheduleRows
  );

  return [...taskEvents, ...projectEvents].sort(sortCalendarEvents);
}

export function buildPersonalModeEvents(
  baseData: CalendarBaseData
): CalendarEventItem[] {
  if (!baseData.currentUserId) return [];

  const currentUserId = baseData.currentUserId;
  const taskMap = buildTaskMap(baseData.taskRows);
  const progressMap = buildTaskProgressMap(baseData.taskAssigneeRows);

  const assignedRows = baseData.taskAssigneeRows.filter(
    (row) => row.user_id === currentUserId
  );

  const assignedDueEvents = assignedRows
    .map((row) => {
      const task = taskMap.get(row.task_id);
      if (!task) return null;

      return mapPersonalAssignedTaskDueToCalendarEvent({
        ...row,
        tasks: task,
      });
    })
    .filter((event): event is CalendarEventItem => event !== null);

  const plannedEvents = assignedRows
    .map((row) => {
      const task = taskMap.get(row.task_id);
      if (!task) return null;

      return mapPersonalPlannedToCalendarEvent({
        ...row,
        tasks: task,
      });
    })
    .filter((event): event is CalendarEventItem => event !== null);

  const requestedRows = baseData.taskRows.filter(
    (row) => row.requester_id === currentUserId
  );

  const requestedDueEvents = requestedRows
    .map((row) =>
      mapPersonalRequestedTaskDueToCalendarEvent(row, progressMap.get(row.id))
    )
    .filter((event): event is CalendarEventItem => event !== null);

  const merged = [
    ...assignedDueEvents,
    ...requestedDueEvents,
    ...plannedEvents,
  ];

  const unique = Array.from(
    new Map(merged.map((event) => [event.id, event])).values()
  );

  return unique.sort(sortCalendarEvents);
}

export function buildProjectModeEvents(
  baseData: CalendarBaseData,
  selectedProjectId?: string
): CalendarEventItem[] {
  if (!selectedProjectId) return [];

  const progressMap = buildTaskProgressMap(baseData.taskAssigneeRows);

  const taskEvents = baseData.taskRows
    .filter((row) => row.project_id === selectedProjectId)
    .map((row) =>
      mapProjectTaskDueToCalendarEvent(row, progressMap.get(row.id))
    )
    .filter((event): event is CalendarEventItem => event !== null);

  const projectScheduleRow = baseData.projectScheduleRows.find(
    (row) => row.id === selectedProjectId
  );

  const projectEvents = projectScheduleRow
    ? mapAllProjectSchedulesToCalendarEvents([projectScheduleRow])
    : [];

  return [...taskEvents, ...projectEvents].sort(sortCalendarEvents);
}
