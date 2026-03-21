import type { SupabaseClient } from "@supabase/supabase-js";
import type { ScopeType, TaskAssigneeRow, TaskRow } from "@/lib/tasks/taskList";

export type Membership = {
  branch_id: string;
  role: "member" | "manager" | "admin";
  branches?: { name: string } | { name: string }[] | null;
};

export type BranchUser = {
  user_id: string;
  email: string;
  display_name: string | null;
};

export async function fetchMyMembership(
  supabase: SupabaseClient,
  userId: string
): Promise<Membership | null> {
  const { data, error } = await supabase
    .from("memberships")
    .select(`
      branch_id,
      role,
      branches ( name )
    `)
    .eq("user_id", userId)
    .order("created_at", { ascending: true })
    .limit(1);

  if (error) {
    throw new Error(error.message);
  }

  return (data?.[0] ?? null) as Membership | null;
}

export async function fetchBranchUsers(
  supabase: SupabaseClient,
  branchId: string
): Promise<BranchUser[]> {
  const { data, error } = await supabase
    .from("memberships")
    .select(`profiles ( user_id, email, display_name )`)
    .eq("branch_id", branchId);

  if (error) {
    throw new Error(error.message);
  }

  const users = (data ?? [])
    .flatMap((r: any) => {
      const p = r.profiles;
      if (!p) return [];
      return Array.isArray(p) ? p : [p];
    })
    .map((p: any) => ({
      user_id: p.user_id as string,
      email: p.email as string,
      display_name: (p.display_name ?? null) as string | null,
    }));

  return Array.from(new Map(users.map((u) => [u.user_id, u])).values());
}

export type Dept = {
  id: string;
  name: string;
};

export async function fetchDepartments(
  supabase: SupabaseClient,
  branchId: string
): Promise<Dept[]> {
  const { data, error } = await supabase
    .from("departments")
    .select("id, name")
    .eq("branch_id", branchId)
    .order("created_at", { ascending: true });

  if (error) {
    throw new Error(error.message);
  }

  return (data ?? []) as Dept[];
}

function normalizeJoinedProject(
  value: { id: string; name: string } | { id: string; name: string }[] | null | undefined
): { id: string; name: string } | null {
  if (!value) return null;
  if (Array.isArray(value)) return value[0] ?? null;
  return value;
}

export async function fetchBranchTasks(params: {
  supabase: SupabaseClient;
  branchId: string;
  departmentIds: string[];
  branchUserIds: string[];
}): Promise<TaskRow[]> {
  const { supabase, branchId, departmentIds, branchUserIds } = params;

  const selectCols = `
    id,
    title,
    description,
    requester_id,
    scope_type,
    scope_id,
    due_at,
    status,
    created_at,
    updated_at,
    project_id,
    projects (
      id,
      name
    )
  `;

  const [
    { data: tBranch, error: eBranch },
    tDeptResult,
    tPersonalResult,
  ] = await Promise.all([
    supabase
      .from("tasks")
      .select(selectCols)
      .eq("scope_type", "branch" satisfies ScopeType)
      .eq("scope_id", branchId),

    departmentIds.length === 0
      ? Promise.resolve({ data: [], error: null } as const)
      : supabase
          .from("tasks")
          .select(selectCols)
          .eq("scope_type", "department" satisfies ScopeType)
          .in("scope_id", departmentIds),

    branchUserIds.length === 0
      ? Promise.resolve({ data: [], error: null } as const)
      : supabase
          .from("tasks")
          .select(selectCols)
          .eq("scope_type", "personal" satisfies ScopeType)
          .in("scope_id", branchUserIds),
  ]);

  const eDept = (tDeptResult as any).error;
  const ePersonal = (tPersonalResult as any).error;
  const anyErr = eBranch || eDept || ePersonal;

  if (anyErr) {
    throw new Error(anyErr.message);
  }

  const normalizeTaskRows = (rows: any[]): TaskRow[] =>
    rows.map((row) => ({
      id: row.id,
      title: row.title,
      description: row.description,
      requester_id: row.requester_id,
      scope_type: row.scope_type,
      scope_id: row.scope_id,
      due_at: row.due_at,
      status: row.status,
      created_at: row.created_at,
      updated_at: row.updated_at,
      project_id: row.project_id ?? null,
      projects: normalizeJoinedProject(row.projects),
    }));

  const tBranchRows = normalizeTaskRows(((tBranch ?? []) as any[]));
  const tDeptRows = normalizeTaskRows((((tDeptResult as any).data ?? []) as any[]));
  const tPersonalRows = normalizeTaskRows((((tPersonalResult as any).data ?? []) as any[]));

  return ([] as TaskRow[]).concat(tBranchRows, tDeptRows, tPersonalRows);
}

export async function fetchTaskAssignees(
  supabase: SupabaseClient,
  taskIds: string[]
): Promise<Record<string, TaskAssigneeRow[]>> {
  if (taskIds.length === 0) return {};

  const { data, error } = await supabase
    .from("task_assignees")
    .select("task_id, user_id, status")
    .in("task_id", taskIds);

  if (error) {
    throw new Error(error.message);
  }

  const map: Record<string, TaskAssigneeRow[]> = {};

  for (const row of (data ?? []) as TaskAssigneeRow[]) {
    const tid = row.task_id;
    map[tid] = map[tid] ? [...map[tid], row] : [row];
  }

  return map;
}