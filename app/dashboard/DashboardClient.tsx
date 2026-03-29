"use client"; // クライアントコンポーネントの宣言

import { useEffect, useMemo, useState } from "react"; // クライアントコンポーネントと一緒に使う
import { useRouter } from "next/navigation"; // ルーター（ページ遷移）を使うためのフック
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { getDueMeta, dueBadgeClass, dueCardBorderClass, formatDue } from "@/lib/taskDue";
import {
  type CommonSortKey,
  type DashboardSortKey,
  sortCommonTasks,
  sortDashboardTasks,
} from "@/lib/taskSort";
import {
  buildScopeBadgeLabel,
  buildUserDisplayLabel,
} from "@/lib/tasks/taskList";
import {
  fetchBranchUsers,
  fetchDepartments,
} from "@/lib/tasks/taskQueries";
import type { Dept } from "@/lib/tasks/taskQueries";

const supabase = createClient();

type TaskStatus = "todo" | "doing" | "done" | "hold";

type TaskRow = {
  id: string;
  title: string;
  description: string | null;
  requester_id: string;
  scope_type: "branch" | "department" | "personal";
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

type TaskAssigneeProgress = {
  user_id: string;
  status: TaskStatus;
};

type DashboardTask = TaskRow & {
  assignees: TaskAssigneeProgress[];
  assigneeCount: number;
  doneCount: number;
  myStatus: TaskStatus | null;
  isCompleted: boolean;
};

type AssigneeRow = {
  task_id: string;
  status: TaskStatus;
  tasks: TaskRow | TaskRow[] | null;
};

type Membership = {
  branch_id: string;
  role: "member" | "manager" | "admin";
};

type BranchUser = {
  user_id: string;
  email: string;
  display_name: string | null;
};

type BranchRow = {
  id: string;
  name: string;
};

type DepartmentLinkRow = {
  department_id: string;
  departments: { id: string; name: string } | { id: string; name: string }[] | null;
};

function normalizeTasks(x: TaskRow | TaskRow[] | null): TaskRow[] {
  if (!x) return [];
  return Array.isArray(x) ? x : [x];
}

function normalizeAssigneeRows(rows: any[]): AssigneeRow[] {
  return rows.map((row) => ({
    task_id: row.task_id,
    status: row.status,
    tasks: normalizeTasks(row.tasks).map(normalizeTaskRow),
  }));
}

function getRoleLabel(role: string | null | undefined) {
  switch (role) {
    case "admin":
      return "管理者";
    case "manager":
      return "マネージャー";
    case "member":
      return "メンバー";
    default:
      return "未所属";
  }
}

function formatDateTimeShort(value: string | null) {
  if (!value) return "-";

  const d = new Date(value);

  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  const hh = String(d.getHours()).padStart(2, "0");
  const min = String(d.getMinutes()).padStart(2, "0");

  return `${yyyy}/${mm}/${dd} ${hh}:${min}`;
}

function buildDashboardTask(
  task: TaskRow,
  assignees: TaskAssigneeProgress[],
  myStatus: TaskStatus | null
): DashboardTask {
  const assigneeCount = assignees.length;
  const doneCount = assignees.filter((a) => a.status === "done").length;
  const isCompleted = assigneeCount > 0 && doneCount === assigneeCount;

  return {
    ...task,
    assignees,
    assigneeCount,
    doneCount,
    myStatus,
    isCompleted,
  };
}

function normalizeTaskRow(row: any): TaskRow {
  const projectValue = Array.isArray(row.projects)
    ? row.projects[0] ?? null
    : row.projects ?? null;

  return {
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
    projects: projectValue
      ? {
          id: projectValue.id,
          name: projectValue.name,
        }
      : null,
  };
}

export default function DashboardPage() { // ページコンポーネント（部品化）→一部を他のファイルから呼び出せる
  const router = useRouter();
  const [rows, setRows] = useState<AssigneeRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [assigneeProgressRows, setAssigneeProgressRows] = useState<
    { task_id: string; user_id: string; status: TaskStatus }[]
  >([]);
  const [showCompletedRequestedTasks, setShowCompletedRequestedTasks] = useState(false);

  const [membership, setMembership] = useState<Membership | null>(null);
  const [branch, setBranch] = useState<BranchRow | null>(null);
  const [departmentNames, setDepartmentNames] = useState<string[]>([]);
  const [departments, setDepartments] = useState<Dept[]>([]);
  const [branchUsers, setBranchUsers] = useState<BranchUser[]>([]);
  const [requestedTasks, setRequestedTasks] = useState<DashboardTask[]>([]);
  const [me, setMe] = useState<{
    id: string;
    email: string | null;
    displayName: string | null;
  } | null>(null);

  // ソート関連
  const [myTaskSort, setMyTaskSort] = useState<DashboardSortKey>("requested_desc");
  const [requestedTaskSort, setRequestedTaskSort] =
    useState<CommonSortKey>("requested_desc");

  const tasks = useMemo<DashboardTask[]>(() => {
    const built = rows
      .flatMap((r) =>
        normalizeTasks(r.tasks).map((task) => {
          const assignees = assigneeProgressRows
            .filter((a) => a.task_id === task.id)
            .map((a) => ({
              user_id: a.user_id,
              status: a.status,
            }));

          return buildDashboardTask(task, assignees, r.status);
        })
      )
      .filter((task) => task.myStatus !== "done");

    return sortDashboardTasks(built, myTaskSort);
  }, [rows, assigneeProgressRows, myTaskSort]);

  const visibleRequestedTasks = useMemo(() => {
    const filtered = showCompletedRequestedTasks
      ? requestedTasks
      : requestedTasks.filter((task) => !task.isCompleted);

    return sortCommonTasks(filtered, requestedTaskSort);
  }, [requestedTasks, showCompletedRequestedTasks, requestedTaskSort]);

  const deptNameById = useMemo(() => {
    const m = new Map<string, string>();
    for (const d of departments) {
      m.set(d.id, d.name);
    }
    return m;
  }, [departments]);

  const requesterNameById = useMemo(() => {
    const m = new Map<string, string>();
    for (const u of branchUsers) {
      m.set(
        u.user_id,
        buildUserDisplayLabel({
          displayName: u.display_name,
          email: u.email,
        })
      );
    }
    return m;
  }, [branchUsers]);

  const branchLabel = branch?.name ?? "未所属";
  const departmentLabel =
    departmentNames.length > 0 ? departmentNames.join(" / ") : "未所属";
  const roleLabel = getRoleLabel(membership?.role);

  async function loadDashboard() {
    setLoading(true);
    setErrorMsg(null);

    // 1) ログイン確認＆user取得
    const { data: userData, error: userErr } = await supabase.auth.getUser();
    if (userErr) {
      setErrorMsg(userErr.message);
      setLoading(false);
      return;
    }
    if (!userData.user) {
      router.replace("/login");
      return;
    }

    const { data: profileData } = await supabase
      .from("profiles")
      .select("display_name")
      .eq("user_id", userData.user.id)
      .maybeSingle();

    setMe({
      id: userData.user.id,
      email: userData.user.email ?? null,
      displayName: profileData?.display_name ?? null,
    });

    // 2) membership
    const { data: membershipList, error: membershipErr } = await supabase
      .from("memberships")
      .select("branch_id, role")
      .eq("user_id", userData.user.id)
      .order("created_at", { ascending: true })
      .limit(1);

    const membershipData = (membershipList?.[0] ?? null) as Membership | null;

    if (membershipErr) {
      setErrorMsg(membershipErr.message);
      setLoading(false);
      return;
    }

    if (!membershipData) {
      setErrorMsg("memberships が未登録です（管理者に登録してもらってください）");
      setMembership(null);
      setBranch(null);
      setDepartmentNames([]);
      setDepartments([]);
      setBranchUsers([]);
      setLoading(false);
      return;
    }

    setMembership(membershipData);

    const [nextDepartments, nextBranchUsers] = await Promise.all([
      fetchDepartments(supabase, membershipData.branch_id),
      fetchBranchUsers(supabase, membershipData.branch_id),
    ]);

    setDepartments(nextDepartments);
    setBranchUsers(nextBranchUsers as BranchUser[]);

    // 2-1) 所属支部
    const { data: branchData, error: branchErr } = await supabase
      .from("branches")
      .select("id, name")
      .eq("id", membershipData.branch_id)
      .single();

    if (branchErr) {
      setErrorMsg(branchErr.message);
      setLoading(false);
      return;
    }

    setBranch((branchData ?? null) as BranchRow | null);

    // 2-2) 所属部署一覧
    const { data: departmentLinkData, error: departmentLinkErr } = await supabase
      .from("membership_departments")
      .select(`
        department_id,
        departments (
          id,
          name
        )
      `)
      .eq("user_id", userData.user.id)
      .eq("branch_id", membershipData.branch_id);

    if (departmentLinkErr) {
      setErrorMsg(departmentLinkErr.message);
      setLoading(false);
      return;
    }

    const nextDepartmentNames = ((departmentLinkData ?? []) as DepartmentLinkRow[])
      .map((row) => {
        const department = Array.isArray(row.departments)
          ? row.departments[0]
          : row.departments;

        return department?.name ?? null;
      })
      .filter((name): name is string => Boolean(name));

    setDepartmentNames(nextDepartmentNames);
    
    // 3) 自分が担当のタスク
    const { data, error } = await supabase
      .from("task_assignees")
      .select(
        `
        task_id,
        status,
        tasks (
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
        )
      `
      )
      .eq("user_id", userData.user.id)
      .order("due_at", { ascending: true, foreignTable: "tasks" });

    if (error) {
      setErrorMsg(error.message);
      setLoading(false);
      return;
    }

    const rawRows = normalizeAssigneeRows((data ?? []) as any[]);
    const taskIds = rawRows.flatMap((r) => normalizeTasks(r.tasks).map((t) => t.id));

    let nextAssigneeProgressRows: {
      task_id: string;
      user_id: string;
      status: TaskStatus;
    }[] = [];

    if (taskIds.length > 0) {
      const { data: apData, error: apErr } = await supabase
        .from("task_assignees")
        .select("task_id, user_id, status")
        .in("task_id", taskIds);

      if (apErr) {
        setErrorMsg(apErr.message);
        setLoading(false);
        return;
      }

      nextAssigneeProgressRows = (apData ?? []) as {
        task_id: string;
        user_id: string;
        status: TaskStatus;
      }[];
    }

    // 4) 自分が依頼したタスク
    const { data: reqData, error: reqErr } = await supabase
      .from("tasks")
      .select(`
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
      `)
      .eq("requester_id", userData.user.id)
      .order("due_at", { ascending: true });

    if (reqErr) {
      setErrorMsg(reqErr.message);
      setLoading(false);
      return;
    }

    const requestedTasks = (reqData ?? []).map(normalizeTaskRow);
    const requestedTaskIds = requestedTasks.map((t) => t.id);

    let requestedAssigneeRows: {
      task_id: string;
      user_id: string;
      status: TaskStatus;
    }[] = [];

    if (requestedTaskIds.length > 0) {
      const { data: requestedApData, error: requestedApErr } = await supabase
        .from("task_assignees")
        .select("task_id, user_id, status")
        .in("task_id", requestedTaskIds);

      if (requestedApErr) {
        setErrorMsg(requestedApErr.message);
        setLoading(false);
        return;
      }

      requestedAssigneeRows = (requestedApData ?? []) as {
        task_id: string;
        user_id: string;
        status: TaskStatus;
      }[];
    }

    setRows(rawRows);
    setAssigneeProgressRows(nextAssigneeProgressRows);

    setRequestedTasks(
      requestedTasks.map((task) => {
        const assignees = requestedAssigneeRows
          .filter((a) => a.task_id === task.id)
          .map((a) => ({
            user_id: a.user_id,
            status: a.status,
          }));

        return buildDashboardTask(task, assignees, null);
      })
    );

    setLoading(false);
  }

  useEffect(() => {
    loadDashboard();

    const onFocus = () => {
      loadDashboard();
    };

    window.addEventListener("focus", onFocus);

    return () => {
      window.removeEventListener("focus", onFocus);
    };
  }, []);

  const updateMyStatus = async (taskId: string, status: TaskStatus) => {
    if (!me) return;

    setErrorMsg(null);

    const { error } = await supabase
      .from("task_assignees")
      .update({
        status,
        updated_at: new Date().toISOString(),
      })
      .eq("task_id", taskId)
      .eq("user_id", me.id);

    if (error) {
      setErrorMsg(error.message);
      return;
    }

    setRows((prev) =>
      prev.map((r) => (r.task_id === taskId ? { ...r, status } : r))
    );

    setAssigneeProgressRows((prev) =>
      prev.map((row) =>
        row.task_id === taskId && row.user_id === me.id
          ? { ...row, status }
          : row
      )
    );
  };

  const onLogout = async () => {
    const ok = window.confirm("本当にログアウトしますか？");
    if (!ok) return;

    await supabase.auth.signOut();
    setMembership(null);
    setBranch(null);
    setDepartmentNames([]);
    setDepartments([]);
    setBranchUsers([]);
    router.replace("/login");
  };
  
  return (
    <main className="p-4 sm:p-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold">個人ホーム</h1>
          <div className="mt-1 flex flex-col gap-1">
            <p className="text-sm text-gray-600">
              ログイン中: {me ? `${me.displayName ?? "名無し"}（${me.email ?? "-"}）` : "-"}
            </p>
            <p className="text-sm text-gray-600">所属支部: {branchLabel}</p>
            <p className="text-sm text-gray-600">所属部署: {departmentLabel}</p>
            <p className="text-sm text-gray-600">権限: {roleLabel}</p>

            <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
              <Link
                className="inline-block w-full rounded-md border px-3 py-2 text-center sm:w-fit"
                href="/admin/memberships"
              >
                支部員一覧/名前登録
              </Link>

              <Link
                className="inline-block w-full rounded-md border px-3 py-2 text-center sm:w-fit"
                href="/settings/notifications"
              >
                通知設定
              </Link>
            </div>

            <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
              <Link
                className="inline-block w-full rounded-md border px-3 py-2 text-center sm:w-fit"
                href="/tasks/new"
              >
                タスクを依頼
              </Link>

              <Link
                className="inline-block w-full rounded-md border px-3 py-2 text-center sm:w-fit"
                href="/tasks"
              >
                支部のタスク一覧
              </Link>

              <Link
                className="inline-block w-full rounded-md border px-3 py-2 text-center sm:w-fit"
                href="/calendar?mode=personal"
              >
                カレンダーへ
              </Link>
            </div>
          </div>
        </div>

        <button
          className="w-full rounded-md border border-red-100 bg-red-50 px-3 py-2 text-red-600 sm:w-auto"
          onClick={onLogout}
        >
          Logout
        </button>
      </div>

      <section className="mt-8">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <h2 className="text-lg font-semibold">自分の担当タスク</h2>

          <select
            className="w-full rounded-md border px-2 py-2 text-sm sm:w-auto"
            value={myTaskSort}
            onChange={(e) => setMyTaskSort(e.target.value as DashboardSortKey)}
          >
            <option value="requested_desc">依頼日が新しい順</option>
            <option value="due_asc">期限が近い順</option>
            <option value="my_status_priority">進行中→未着手→保留</option>
          </select>
        </div>

        {loading && <p className="mt-3 text-sm">読み込み中...</p>}
        {errorMsg && <p className="mt-3 text-sm text-red-600">❌ {errorMsg}</p>}

        {!loading && !errorMsg && tasks.length === 0 && (
          <p className="mt-3 text-sm text-gray-600">担当タスクがありません。</p>
        )}

        {!loading && !errorMsg && tasks.length > 0 && (
          <ul className="mt-4 space-y-3">
            {tasks.map((t) => {
              const due = getDueMeta(t.due_at, {
                isCompleted: t.assigneeCount > 0 && t.doneCount === t.assigneeCount,
              });

              return (
                <li
                  key={t.id}
                  className={`rounded-xl border p-4 ${dueCardBorderClass(due.tone)}`}
                >
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0 flex-1 self-stretch">
                      <div className="flex min-w-0 flex-wrap items-start gap-2">
                        <Link
                          href={`/tasks/${t.id}`}
                          className="min-w-0 break-words text-lg font-semibold underline"
                          title={t.title}
                        >
                          {t.title}
                        </Link>

                        <span className="shrink-0 rounded border px-2 py-0.5 text-xs text-gray-600">
                          {buildScopeBadgeLabel({
                            scopeType: t.scope_type,
                            scopeName:
                              t.scope_type === "department"
                                ? deptNameById.get(t.scope_id) ?? "-"
                                : "",
                          })}
                        </span>

                        {t.projects && (
                          <Link
                            href={`/projects/${t.projects.id}`}
                            className="inline-flex max-w-full items-center rounded border border-blue-200 bg-blue-50 px-2 py-0.5 text-xs text-blue-700 break-words whitespace-normal"
                          >
                            {t.projects.name}
                          </Link>
                        )}

                        <span
                          className={`shrink-0 px-2 py-1 rounded border text-xs ${dueBadgeClass(
                            due.tone
                          )}`}
                        >
                          {due.label}
                        </span>

                        {due.remainingLabel && (
                          <span className="shrink-0 text-sm font-medium font-semibold text-orange-700">
                            {due.remainingLabel}
                          </span>
                        )}
                      </div>

                      {t.description && (
                        <p className="mt-1 whitespace-pre-wrap break-words text-sm text-gray-600">
                          {t.description}
                        </p>
                      )}

                      <div className="pt-2 text-xs text-gray-600 break-words">
                        依頼者: {requesterNameById.get(t.requester_id) ?? "-"}
                      </div>
                    </div>

                    <div className="shrink-0 text-sm text-left sm:text-right">
                      <div className="flex flex-col items-start gap-2 sm:flex-row sm:items-center sm:justify-end">
                        <label className="text-xs text-gray-500">自分の進捗</label>
                        <select
                          className="w-full rounded-md border px-2 py-2 sm:w-auto"
                          value={t.myStatus ?? "todo"}
                          onChange={(e) => updateMyStatus(t.id, e.target.value as TaskStatus)}
                        >
                          <option value="todo">未着手</option>
                          <option value="doing">進行中</option>
                          <option value="hold">保留</option>
                          <option value="done">完了</option>
                        </select>
                      </div>
                      <div className="mt-2 text-gray-600">
                        全体進捗: {t.doneCount} / {t.assigneeCount}
                      </div>

                      <div className="mt-1 text-gray-600">
                        依頼日時：{formatDateTimeShort(t.created_at)}
                      </div>

                      <div className="mt-1 text-lg font-semibold text-gray-900">
                        期限：{formatDateTimeShort(t.due_at)}
                      </div>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="mt-10">
        <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
          <h2 className="text-lg font-semibold">自分が依頼したタスク</h2>

          <label className="flex items-center gap-2 text-sm text-gray-600">
            <input
              type="checkbox"
              checked={showCompletedRequestedTasks}
              onChange={(e) => setShowCompletedRequestedTasks(e.target.checked)}
            />
            完了も表示
          </label>

          <select
            className="w-full rounded-md border px-2 py-2 text-sm sm:w-auto"
            value={requestedTaskSort}
            onChange={(e) => setRequestedTaskSort(e.target.value as CommonSortKey)}
          >
            <option value="requested_desc">依頼日が新しい順</option>
            <option value="due_asc">期限が近い順</option>
          </select>
        </div>

        {visibleRequestedTasks.length === 0 ? (
          <p className="mt-3 text-sm text-gray-600">依頼したタスクがありません。</p>
        ) : (
          <ul className="mt-4 space-y-4">
            {visibleRequestedTasks.map((t) => {
              const due = getDueMeta(t.due_at, {
                isCompleted: t.assigneeCount > 0 && t.doneCount === t.assigneeCount,
              });

              return (
                <li
                  key={t.id}
                  className={`rounded-xl border p-4 ${dueCardBorderClass(due.tone)}`}
                >
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0 flex-1">
                      <div className="flex min-w-0 flex-wrap items-start gap-2">
                        <Link
                          href={`/tasks/${t.id}`}
                          className="min-w-0 break-words text-lg font-semibold underline"
                          title={t.title}
                        >
                          {t.title}
                        </Link>

                        <span className="shrink-0 rounded border px-2 py-0.5 text-xs text-gray-600">
                          {buildScopeBadgeLabel({
                            scopeType: t.scope_type,
                            scopeName:
                              t.scope_type === "department"
                                ? deptNameById.get(t.scope_id) ?? "-"
                                : "",
                          })}
                        </span>

                        {t.projects && (
                          <Link
                            href={`/projects/${t.projects.id}`}
                            className="inline-flex max-w-full items-center rounded border border-blue-200 bg-blue-50 px-2 py-0.5 text-xs text-blue-700 break-words whitespace-normal"
                          >
                            {t.projects.name}
                          </Link>
                        )}

                        <span
                          className={`shrink-0 px-2 py-0.5 rounded border text-xs ${dueBadgeClass(
                            due.tone
                          )}`}
                        >
                          {due.label}
                        </span>

                        {due.remainingLabel && (
                          <span className="shrink-0 text-sm font-medium font-semibold text-orange-700">
                            {due.remainingLabel}
                          </span>
                        )}
                      </div>

                      <div className="mt-1 text-sm text-gray-600">
                        依頼日時：{formatDateTimeShort(t.created_at)}
                      </div>

                      <div className="mt-1 text-base font-semibold text-gray-900">
                        期限：{formatDateTimeShort(t.due_at)}
                      </div>
                    </div>

                    <div className="text-left text-sm sm:text-right">
                      <label className="block text-xs text-gray-500">全体進捗</label>
                      <div className="mt-1 text-base">
                        {t.doneCount} / {t.assigneeCount}
                      </div>
                      <div className="mt-2 text-xs text-gray-500">
                        完了者数 / 担当者数
                      </div>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </main>
  );
}