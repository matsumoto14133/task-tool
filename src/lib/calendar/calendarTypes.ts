export type CalendarItemType =
  | "task_due"
  | "assignee_plan"
  | "project_event";

export type CalendarDisplayMode = "all" | "personal" | "project";

export type CalendarEventItem = {
  id: string;
  type: CalendarItemType;

  title: string;
  label?: string;
  start: string;
  end?: string;
  allDay?: boolean;

  href: string;

  taskId?: string;
  projectId?: string;
  assigneeUserId?: string;

  colorKey: "due" | "assigned" | "plan" | "project" | "done";

  viewScope?: "all" | "personal" | "project";

  meta?: {
    status?: string;
    projectName?: string | null;
    assigneeName?: string | null;
  };
};

export type CalendarProjectOption = {
  id: string;
  name: string;
};