import { supabase } from "@/lib/supabase/client";

export type TaskDueSourceRow = {
  id: string;
  title: string;
  due_at: string | null;
  status: string | null;
  project_id: string | null;
  requester_id: string | null;
};

export type PersonalPlannedSourceRow = {
  task_id: string;
  user_id: string;
  planned_at: string | null;
  status: string | null;
  tasks:
    | {
        id: string;
        title: string;
        due_at: string | null;
        status: string | null;
        project_id: string | null;
        requester_id: string | null;
      }
    | {
        id: string;
        title: string;
        due_at: string | null;
        status: string | null;
        project_id: string | null;
        requester_id: string | null;
      }[]
    | null;
};

export async function fetchCurrentUserId(): Promise<string | null> {
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error) {
    throw new Error(`fetchCurrentUserId failed: ${error.message}`);
  }

  return user?.id ?? null;
}

export async function fetchTaskDueSourceRows(): Promise<TaskDueSourceRow[]> {
  const { data, error } = await supabase
    .from("tasks")
    .select("id, title, due_at, status, project_id, requester_id")
    .not("due_at", "is", null)
    .order("due_at", { ascending: true });

  if (error) {
    throw new Error(`fetchTaskDueSourceRows failed: ${error.message}`);
  }

  return (data ?? []) as TaskDueSourceRow[];
}

export type TaskAssigneeStatusCountRow = {
  task_id: string;
  status: string | null;
};

export async function fetchTaskAssigneeStatusCountRows(
  taskIds: string[]
): Promise<TaskAssigneeStatusCountRow[]> {
  if (taskIds.length === 0) return [];

  const { data, error } = await supabase
    .from("task_assignees")
    .select("task_id, status")
    .in("task_id", taskIds);

  if (error) {
    throw new Error(`fetchTaskAssigneeStatusCountRows failed: ${error.message}`);
  }

  return (data ?? []) as TaskAssigneeStatusCountRow[];
}

export type TaskAssigneeSourceRow = {
  task_id: string;
  user_id: string;
  planned_at: string | null;
  status: string | null;
};

export async function fetchTaskAssigneeSourceRows(): Promise<
  TaskAssigneeSourceRow[]
> {
  const { data, error } = await supabase
    .from("task_assignees")
    .select("task_id, user_id, planned_at, status");

  if (error) {
    throw new Error(`fetchTaskAssigneeSourceRows failed: ${error.message}`);
  }

  return (data ?? []) as TaskAssigneeSourceRow[];
}

export async function fetchPersonalAssignedTaskDueRows(
  userId: string
): Promise<PersonalPlannedSourceRow[]> {
  const { data, error } = await supabase
    .from("task_assignees")
    .select(`
      task_id,
      user_id,
      planned_at,
      status,
      tasks (
        id,
        title,
        due_at,
        status,
        project_id,
        requester_id
      )
    `)
    .eq("user_id", userId);

  if (error) {
    throw new Error(`fetchPersonalAssignedTaskDueRows failed: ${error.message}`);
  }

  return (data ?? []) as PersonalPlannedSourceRow[];
}

export async function fetchPersonalRequestedTaskDueRows(
  userId: string
): Promise<TaskDueSourceRow[]> {
  const { data, error } = await supabase
    .from("tasks")
    .select("id, title, due_at, status, project_id, requester_id")
    .eq("requester_id", userId)
    .not("due_at", "is", null)
    .order("due_at", { ascending: true });

  if (error) {
    throw new Error(`fetchPersonalRequestedTaskDueRows failed: ${error.message}`);
  }

  return (data ?? []) as TaskDueSourceRow[];
}

export type ProjectOptionRow = {
  id: string;
  name: string | null;
};

export type ProjectTaskDueRow = {
  id: string;
  title: string;
  due_at: string | null;
  status: string | null;
  project_id: string | null;
  requester_id: string | null;
};

export type ProjectScheduleEventRow = {
  id?: string;
  title?: string;
  start?: string;
  end?: string;
};

export type ProjectScheduleSourceRow = {
  id: string;
  name: string | null;
  schedule: unknown;
};

export async function fetchProjectOptions(): Promise<ProjectOptionRow[]> {
  const { data, error } = await supabase
    .from("projects")
    .select("id, name")
    .order("name", { ascending: true });

  if (error) {
    throw new Error(`fetchProjectOptions failed: ${error.message}`);
  }

  return (data ?? []) as ProjectOptionRow[];
}

export async function fetchProjectTaskDueRows(
  projectId: string
): Promise<ProjectTaskDueRow[]> {
  const { data, error } = await supabase
    .from("tasks")
    .select("id, title, due_at, status, project_id, requester_id")
    .eq("project_id", projectId)
    .not("due_at", "is", null)
    .order("due_at", { ascending: true });

  if (error) {
    throw new Error(`fetchProjectTaskDueRows failed: ${error.message}`);
  }

  return (data ?? []) as ProjectTaskDueRow[];
}

export async function fetchProjectScheduleRows(
  projectId: string
): Promise<ProjectScheduleSourceRow | null> {
  const { data, error } = await supabase
    .from("projects")
    .select("id, name, schedule")
    .eq("id", projectId)
    .maybeSingle();

  if (error) {
    throw new Error(`fetchProjectScheduleRows failed: ${error.message}`);
  }

  return (data ?? null) as ProjectScheduleSourceRow | null;
}

export async function fetchAllProjectScheduleRows(): Promise<
  ProjectScheduleSourceRow[]
> {
  const { data, error } = await supabase
    .from("projects")
    .select("id, name, schedule")
    .order("name", { ascending: true });

  if (error) {
    throw new Error(`fetchAllProjectScheduleRows failed: ${error.message}`);
  }

  return (data ?? []) as ProjectScheduleSourceRow[];
}