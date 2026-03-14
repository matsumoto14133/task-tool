"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase/client";
import { getDueMeta, dueBadgeClass, dueCardBorderClass, formatDue } from "@/lib/taskDue";
import { sortTaskListItems, type TaskListSortKey } from "@/lib/taskSort";
import {
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

function scopeTypeLabel(t: ScopeType) {
  return t === "branch" ? "支部" : t === "department" ? "部署" : "個人";
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

  // 追加要件：管轄/担当者フィルタ
  const [scopeTypeFilter, setScopeTypeFilter] = useState<"" | ScopeType>("");
  const [scopeIdFilter, setScopeIdFilter] = useState<string>(""); // 部署ID or 個人user_id（支部はbranch_id固定）
  const [assigneeFilter, setAssigneeFilter] = useState<string>(""); // user_id

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

  const deptNameById = useMemo(() => {
    const m = new Map<string, string>();
    for (const d of departments) m.set(d.id, d.name);
    return m;
  }, [departments]);

  const userNameById = useMemo(() => {
    const m = new Map<string, string>();
    for (const u of branchUsers) {
      const label = u.display_name ? `${u.display_name}（${u.email}）` : u.email;
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

  // 管轄フィルタの選択肢（scope_type に応じて scope_id 候補を出す）
  const scopeIdOptions = useMemo(() => {
    if (!membership) return [];
    if (scopeTypeFilter === "branch") {
      return [{ id: membership.branch_id, label: branchName }];
    }
    if (scopeTypeFilter === "department") {
      return departments.map((d) => ({ id: d.id, label: d.name }));
    }
    if (scopeTypeFilter === "personal") {
      return branchUsers.map((u) => ({
        id: u.user_id,
        label: u.display_name ? `${u.display_name}（${u.email}）` : u.email,
      }));
    }
    return [];
  }, [scopeTypeFilter, membership, departments, branchUsers, branchName]);

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

    // 管轄（scope_type）
    if (scopeTypeFilter) list = list.filter((t) => t.scopeType === scopeTypeFilter);

    // 管轄（scope_id）
    if (scopeIdFilter) list = list.filter((t) => t.scopeId === scopeIdFilter);

    // 担当者（task_assignees）
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
    scopeTypeFilter,
    scopeIdFilter,
    assigneeFilter,
  ]);

  // scopeTypeFilter を変えたら scopeIdFilter をリセット（ズレ防止）
  useEffect(() => {
    setScopeIdFilter("");
  }, [scopeTypeFilter]);

  const isManager = membership?.role === "manager" || membership?.role === "admin";

  return (
    <main className="p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">タスク一覧（支部俯瞰）</h1>
          <p className="mt-1 text-sm text-gray-600">
            所属: {branchName} / {membership ? roleLabel(membership.role) : "-"}
          </p>

          <div className="mt-3 flex items-center gap-2">
            <Link className="rounded-md border px-3 py-2" href="/dashboard">
              個人ホームへ
            </Link>
            <Link className="rounded-md border px-3 py-2" href="/tasks/new">
              タスクを依頼
            </Link>
          </div>
        </div>
      </div>

      <section className="mt-8">
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

          {/* 管轄フィルタ */}
          <div>
            <label className="block text-xs text-gray-500">管轄タイプ</label>
            <select
              className="mt-1 rounded-md border px-2 py-2 text-sm"
              value={scopeTypeFilter}
              onChange={(e) => setScopeTypeFilter(e.target.value as any)}
            >
              <option value="">すべて</option>
              <option value="branch">支部</option>
              <option value="department">部署</option>
              <option value="personal">個人</option>
            </select>
          </div>

          <div>
            <label className="block text-xs text-gray-500">管轄（名前）</label>
            <select
              className="mt-1 rounded-md border px-2 py-2 text-sm"
              value={scopeIdFilter}
              onChange={(e) => setScopeIdFilter(e.target.value)}
              disabled={!scopeTypeFilter}
              title={!scopeTypeFilter ? "先に管轄タイプを選択してください" : ""}
            >
              <option value="">すべて</option>
              {scopeIdOptions.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>

          {/* 担当者フィルタ */}
          <div>
            <label className="block text-xs text-gray-500">担当者</label>
            <select
              className="mt-1 rounded-md border px-2 py-2 text-sm"
              value={assigneeFilter}
              onChange={(e) => setAssigneeFilter(e.target.value)}
            >
              <option value="">全員</option>
              {branchUsers.map((u) => (
                <option key={u.user_id} value={u.user_id}>
                  {u.display_name ? `${u.display_name}（${u.email}）` : u.email}
                </option>
              ))}
            </select>
          </div>
        </div>

        {loading && <p className="mt-4 text-sm">読み込み中...</p>}
        {errorMsg && <p className="mt-4 text-sm text-red-600">❌ {errorMsg}</p>}

        {!loading && !errorMsg && filtered.length === 0 && (
          <p className="mt-4 text-sm text-gray-600">該当するタスクがありません。</p>
        )}

        {!loading && !errorMsg && filtered.length > 0 && (
          <ul className="mt-4 space-y-3">
            {filtered.map((t) => {
              const due = getDueMeta(t.dueAt, { isCompleted: t.progress.isCompleted });

              return (
                <li
                  key={t.id}
                  className={`rounded-xl border p-4 ${dueCardBorderClass(due.tone)}`}
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <div className="flex items-center justify-between gap-3">
                        <Link
                          href={`/tasks/${t.id}`}
                          className="truncate text-lg font-semibold underline"
                          title={t.title}
                        >
                          {t.title}
                        </Link>

                        <div className="flex items-center gap-2 shrink-0">
                          <span className="rounded border px-2 py-0.5 text-xs text-gray-600">
                            {scopeTypeLabel(t.scopeType)}: {t.scopeName}
                          </span>

                          <span
                            className={`shrink-0 px-2 py-1 rounded border text-xs ${dueBadgeClass(
                              due.tone
                            )}`}
                          >
                            {due.label}
                          </span>

                          {due.remainingLabel && (
                            <span className="text-sm font-medium font-semibold text-orange-700">
                              {due.remainingLabel}
                            </span>
                          )}
                        </div>
                      </div>

                      {t.description && (
                        <p className="mt-1 text-sm text-gray-600 whitespace-pre-wrap">
                          {t.description}
                        </p>
                      )}

                      <div className="mt-2 text-xs text-gray-600">
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
        )}
      </section>
    </main>
  );
}