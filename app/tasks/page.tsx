"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase/client";
import { getDueMeta, dueBadgeClass, dueCardBorderClass, formatDue } from "@/lib/taskDue";
import { sortTaskListItems, type TaskListSortKey } from "@/lib/taskSort";
import {
  buildUserDisplayLabel,
  buildScopeBadgeLabel,
  buildTaskListItems,
  buildTaskProgressMap,
  type ScopeType,
  type TaskAssigneeRow,
  type TaskListItem,
  type TaskRow,
} from "@/lib/tasks/taskList";
import type { Dept } from "@/lib/tasks/taskQueries";
import {
  fetchMyMembership,
  fetchBranchUsers,
  fetchDepartments,
  fetchBranchTasks,
  fetchTaskAssignees,
} from "@/lib/tasks/taskQueries";

type TaskStatus = "todo" | "doing" | "done" | "hold";

type Membership = {
  branch_id: string;
  role: "member" | "manager" | "admin";
  // 環境で配列/単体が揺れることがあるので両対応
  branches?: { name: string } | { name: string }[] | null;
};

type BranchUser = {
  user_id: string;
  email: string;
  display_name: string | null;
};

type TasksPageData = {
  membership: Membership;
  branchUsers: BranchUser[];
  departments: Dept[];
  tasks: TaskRow[];
  assigneesByTask: Record<string, TaskAssigneeRow[]>;
};

type TaskAssigneeSummary = {
  assigneeUserIds: string[];
  assigneeCount: number;
  doneCount: number;
  isCompleted: boolean;
};

function roleLabel(role: Membership["role"]) {
  switch (role) {
    case "admin":
      return "管理者";
    case "manager":
      return "マネージャー";
    default:
      return "メンバー";
  }
}

function branchNameOf(m: Membership | null) {
  if (!m) return "-";
  const b: any = (m as any).branches;
  if (!b) return "-";
  if (Array.isArray(b)) return b?.[0]?.name ?? "-";
  return b?.name ?? "-";
}

async function loadTasksPageData(params: {
  supabase: typeof supabase;
  userId: string;
}): Promise<TasksPageData> {
  const { supabase, userId } = params;

  const membership = await fetchMyMembership(supabase, userId);
  if (!membership) {
    throw new Error("memberships が未登録です（管理者に登録してください）");
  }

  const branchUsers = await fetchBranchUsers(supabase, membership.branch_id);
  const departments = await fetchDepartments(supabase, membership.branch_id);

  const departmentIds = departments.map((d) => d.id);
  const branchUserIds = branchUsers.map((u) => u.user_id);

  const tasks = await fetchBranchTasks({
    supabase,
    branchId: membership.branch_id,
    departmentIds,
    branchUserIds,
  });

  const taskIds = tasks.map((t) => t.id);
  const assigneesByTask = await fetchTaskAssignees(supabase, taskIds);

  return {
    membership,
    branchUsers,
    departments,
    tasks,
    assigneesByTask,
  };
}

export default function TasksPage() {
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [membership, setMembership] = useState<Membership | null>(null);
  const [tasks, setTasks] = useState<TaskRow[]>([]);

  // フィルタ用の参照データ
  const [departments, setDepartments] = useState<Dept[]>([]);
  const [branchUsers, setBranchUsers] = useState<BranchUser[]>([]);
  const [assigneesByTask, setAssigneesByTask] = useState<Record<string, TaskAssigneeRow[]>>({});

  // UI state
  const [q, setQ] = useState("");
  const [showDone, setShowDone] = useState(false);
  const [sortKey, setSortKey] = useState<TaskListSortKey>("requested_desc");

  // フィルタ
  const [scopeFilter, setScopeFilter] = useState<string>(""); // "" | "branch" | "personal" | `department:${id}`
  const [requesterFilter, setRequesterFilter] = useState<string>(""); // user_id
  const [assigneeFilter, setAssigneeFilter] = useState<string>(""); // user_id

  const PAGE_SIZE = 10;
  const [page, setPage] = useState(1);

  useEffect(() => {
    (async () => {
      setLoading(true);
      setErrorMsg(null);

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

      try {
        const data = await loadTasksPageData({
          supabase,
          userId: userData.user.id,
        });

        setMembership(data.membership);
        setBranchUsers(data.branchUsers);
        setDepartments(data.departments);
        setTasks(data.tasks);
        setAssigneesByTask(data.assigneesByTask);
      } catch (err: any) {
        setErrorMsg(err.message);
      } finally {
        setLoading(false);
      }
    })();
  }, [router]);

  useEffect(() => {
    setPage(1);
  }, [q, showDone, sortKey, scopeFilter, requesterFilter, assigneeFilter]);

  const deptNameById = useMemo(() => {
    const m = new Map<string, string>();
    for (const d of departments) m.set(d.id, d.name);
    return m;
  }, [departments]);

  const userNameById = useMemo(() => {
    const m = new Map<string, string>();
    for (const u of branchUsers) {
      const label = buildUserDisplayLabel({
        displayName: u.display_name,
        email: u.email,
      });
      m.set(u.user_id, label);
    }
    return m;
  }, [branchUsers]);

  const requesterNameById = useMemo(() => {
    const m = new Map<string, string>();
    for (const u of branchUsers) {
      const label = u.display_name ? `${u.display_name}（${u.email}）` : u.email;
      m.set(u.user_id, label);
    }
    return m;
  }, [branchUsers]);

  const taskProgressById = useMemo(
    () => buildTaskProgressMap(assigneesByTask),
    [assigneesByTask]
  );

  const branchName = branchNameOf(membership);

  const taskListItems = useMemo<TaskListItem[]>(
    () =>
      buildTaskListItems({
        tasks,
        taskProgressById,
        branchName,
        deptNameById,
        requesterNameById,
        userNameById,
      }),
    [tasks, taskProgressById, branchName, deptNameById, requesterNameById, userNameById]
  );

  const requesterOptions = useMemo(() => {
    const m = new Map<string, string>();

    for (const t of taskListItems) {
      if (!t.requesterId) continue;
      m.set(t.requesterId, t.requesterName);
    }

    return Array.from(m.entries()).map(([id, label]) => ({
      id,
      label,
    }));
  }, [taskListItems]);

  const filtered = useMemo(() => {
    let list = [...taskListItems];

    // 完了表示（task_assignees ベース）
    if (!showDone) {
      list = list.filter((t) => !t.progress.isCompleted);
    }

    // ステータス絞り込み
    // if (statusFilter) list = list.filter((t) => t.status === statusFilter);

    // 検索（タイトル）
    if (q.trim()) {
      const needle = q.trim().toLowerCase();
      list = list.filter((t) => (t.title ?? "").toLowerCase().includes(needle));
    }

    // 管轄
    if (scopeFilter) {
      if (scopeFilter === "branch") {
        list = list.filter((t) => t.scopeType === "branch");
      } else if (scopeFilter === "personal") {
        list = list.filter((t) => t.scopeType === "personal");
      } else if (scopeFilter.startsWith("department:")) {
        const departmentId = scopeFilter.replace("department:", "");
        list = list.filter(
          (t) => t.scopeType === "department" && t.scopeId === departmentId
        );
      }
    }

    // 依頼者
    if (requesterFilter) {
      list = list.filter((t) => t.requesterId === requesterFilter);
    }

    // 担当者
    if (assigneeFilter) {
      list = list.filter((t) => t.assigneeUserIds.includes(assigneeFilter));
    }

    // 並び替え
    list = sortTaskListItems(list, sortKey);

    return list;
  }, [
    taskListItems,
    q,
    showDone,
    sortKey,
    scopeFilter,
    requesterFilter,
    assigneeFilter,
  ]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));

  const pagedTasks = useMemo(() => {
    const start = (page - 1) * PAGE_SIZE;
    const end = start + PAGE_SIZE;
    return filtered.slice(start, end);
  }, [filtered, page]);

  useEffect(() => {
    if (page > totalPages) {
      setPage(totalPages);
    }
  }, [page, totalPages]);

  return (
    <main className="p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">タスク一覧（{branchName}）</h1>

          <div className="mt-3 flex items-center gap-2">
            <Link className="rounded-md border px-3 py-2" href="/dashboard">
              ホームへ
            </Link>
            <Link className="rounded-md border px-3 py-2" href="/calendar?mode=all">
              カレンダーへ
            </Link>
            <Link className="rounded-md border px-3 py-2" href="/tasks/new">
              タスクを依頼
            </Link>
          </div>
        </div>
      </div>

      <section className="mt-8">
        <div className="flex flex-wrap gap-3">
          <div className="flex flex-wrap items-end gap-3">
            <div className="min-w-[240px]">
              <label className="block text-xs text-gray-500">検索（タイトル）</label>
              <input
                className="mt-1 w-full rounded-md border px-3 py-2"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="例）確認、会議、資料…"
              />
            </div>

            <div>
              <label className="block text-xs text-gray-500">表示</label>
              <label className="mt-2 flex items-center gap-2 text-sm">
                <input type="checkbox" checked={showDone} onChange={(e) => setShowDone(e.target.checked)} />
                完了も表示
              </label>
            </div>

            <div>
              <label className="block text-xs text-gray-500">並び替え</label>
              <select
                className="mt-1 rounded-md border px-2 py-2 text-sm"
                value={sortKey}
                onChange={(e) => setSortKey(e.target.value as TaskListSortKey)}
              >
                <option value="requested_desc">依頼日（新しい順）</option>
                <option value="due_asc">期限（近い順）</option>
                <option value="progress_desc">進捗（未完了優先）</option>
              </select>
            </div>
          </div>

          <div className="flex flex-wrap items-end gap-3">
            {/* 管轄フィルタ */}
            <div>
              <label className="block text-xs text-gray-500">管轄フィルタ</label>
              <select
                className="mt-1 rounded-md border px-2 py-2 text-sm"
                value={scopeFilter}
                onChange={(e) => setScopeFilter(e.target.value)}
              >
                <option value="">指定なし</option>
                <option value="branch">支部</option>
                <option value="personal">個人</option>
                {departments.map((d) => (
                  <option key={d.id} value={`department:${d.id}`}>
                    {d.name}
                  </option>
                ))}
              </select>
            </div>

            {/* 依頼者フィルタ */}
            <div>
              <label className="block text-xs text-gray-500">依頼者フィルタ</label>
              <select
                className="mt-1 rounded-md border px-2 py-2 text-sm"
                value={requesterFilter}
                onChange={(e) => setRequesterFilter(e.target.value)}
              >
                <option value="">指定なし</option>
                {requesterOptions.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.label}
                  </option>
                ))}
              </select>
            </div>

            {/* 担当者フィルタ */}
            <div>
              <label className="block text-xs text-gray-500">担当者フィルタ</label>
              <select
                className="mt-1 rounded-md border px-2 py-2 text-sm"
                value={assigneeFilter}
                onChange={(e) => setAssigneeFilter(e.target.value)}
              >
                <option value="">指定なし</option>
                {branchUsers.map((u) => (
                  <option key={u.user_id} value={u.user_id}>
                    {u.display_name ? `${u.display_name}（${u.email}）` : u.email}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {loading && <p className="mt-4 text-sm">読み込み中...</p>}
        {errorMsg && <p className="mt-4 text-sm text-red-600">❌ {errorMsg}</p>}

        {!loading && !errorMsg && filtered.length === 0 && (
          <p className="mt-4 text-sm text-gray-600">該当するタスクがありません。</p>
        )}

        {!loading && !errorMsg && filtered.length > 0 && (
          <>
            <div className="mt-4 text-sm text-gray-600">
              {filtered.length}件中 {Math.min((page - 1) * PAGE_SIZE + 1, filtered.length)}-
              {Math.min(page * PAGE_SIZE, filtered.length)}件を表示
            </div>

            <ul className="mt-4 space-y-3">
              {pagedTasks.map((t) => {
                const due = getDueMeta(t.dueAt, { isCompleted: t.progress.isCompleted });

                return (
                  <li
                    key={t.id}
                    className={`rounded-xl border p-4 ${dueCardBorderClass(due.tone)}`}
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0">
                        <div className="flex min-w-0 items-center gap-2">
                          <Link
                            href={`/tasks/${t.id}`}
                            className="min-w-0 truncate text-lg font-semibold underline"
                            title={t.title}
                          >
                            {t.title}
                          </Link>

                          <span className="shrink-0 rounded border px-2 py-0.5 text-xs text-gray-600">
                            {buildScopeBadgeLabel({
                              scopeType: t.scopeType,
                              scopeName: t.scopeName,
                            })}
                          </span>

                          {t.projectId && t.projectName && (
                            <Link
                              href={`/projects/${t.projectId}`}
                              className="inline-flex px-2 py-0.5 rounded border border-blue-200 bg-blue-50 text-xs text-blue-700"
                            >
                              {t.projectName}
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
                          <p className="mt-1 text-sm text-gray-600 whitespace-pre-wrap">
                            {t.description}
                          </p>
                        )}

                        <div className="mt-2 text-xs text-gray-600">
                          依頼者: {t.requesterName}
                        </div>

                        <div className="mt-1 text-xs text-gray-600">
                          担当: {t.assigneePreview}
                        </div>
                      </div>

                      <div className="text-right text-sm shrink-0">
                        <div className="mt-2 text-gray-600">
                          全体進捗: {t.progress.doneCount} / {t.progress.assigneeCount}
                        </div>

                        <div className="mt-1 text-gray-600">
                          依頼日時：{formatDue(t.createdAt)}
                        </div>

                        <div className="mt-1 text-base font-semibold text-gray-900">
                          期限：{formatDue(t.dueAt)}
                        </div>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>

            <div className="mt-4 flex items-center justify-between">
              <div className="text-sm text-gray-500">
                {page} / {totalPages} ページ
              </div>

              <div className="flex gap-2">
                <button
                  type="button"
                  className="rounded-md border px-3 py-2 text-sm disabled:opacity-50"
                  onClick={() => setPage((prev) => Math.max(1, prev - 1))}
                  disabled={page === 1}
                >
                  前へ
                </button>

                <button
                  type="button"
                  className="rounded-md border px-3 py-2 text-sm disabled:opacity-50"
                  onClick={() => setPage((prev) => Math.min(totalPages, prev + 1))}
                  disabled={page === totalPages}
                >
                  次へ
                </button>
              </div>
            </div>
          </>
        )}
      </section>
    </main>
  );
}