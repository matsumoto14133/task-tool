"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase/client";
import { getDueMeta, dueBadgeClass, dueCardBorderClass, formatDue } from "@/lib/taskDue";

type TaskStatus = "todo" | "doing" | "done" | "hold";
type ScopeType = "branch" | "department" | "personal";

type Membership = {
  branch_id: string;
  role: "member" | "manager" | "admin";
  // 環境で配列/単体が揺れることがあるので両対応
  branches?: { name: string } | { name: string }[] | null;
};

type Dept = { id: string; name: string };

type BranchUser = {
  user_id: string;
  email: string;
  display_name: string | null;
};

type TaskRow = {
  id: string;
  title: string;
  description: string | null;
  requester_id: string;
  scope_type: ScopeType;
  scope_id: string;
  due_at: string | null;
  status: TaskStatus;
  created_at: string;
  updated_at: string;
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

export default function TasksPage() {
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [membership, setMembership] = useState<Membership | null>(null);
  const [tasks, setTasks] = useState<TaskRow[]>([]);

  // フィルタ用の参照データ
  const [departments, setDepartments] = useState<Dept[]>([]);
  const [branchUsers, setBranchUsers] = useState<BranchUser[]>([]);
  const [assigneesByTask, setAssigneesByTask] = useState<Record<string, string[]>>({});

  // UI state
  const [q, setQ] = useState("");
  const [showDone, setShowDone] = useState(false);
  const [statusFilter, setStatusFilter] = useState<"" | TaskStatus>("");
  const [sortKey, setSortKey] = useState<"due" | "created">("due");

  // 追加要件：管轄/担当者フィルタ
  const [scopeTypeFilter, setScopeTypeFilter] = useState<"" | ScopeType>("");
  const [scopeIdFilter, setScopeIdFilter] = useState<string>(""); // 部署ID or 個人user_id（支部はbranch_id固定）
  const [assigneeFilter, setAssigneeFilter] = useState<string>(""); // user_id

  useEffect(() => {
    (async () => {
      setLoading(true);
      setErrorMsg(null);

      // 1) login
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

      // 2) membership（支部名も取る）
      const { data: ms, error: msErr } = await supabase
        .from("memberships")
        .select(`
          branch_id,
          role,
          branches ( name )
        `)
        .eq("user_id", userData.user.id)
        .order("created_at", { ascending: true })
        .limit(1);

      if (msErr) {
        setErrorMsg(msErr.message);
        setLoading(false);
        return;
      }

      const myMembership = (ms?.[0] ?? null) as Membership | null;
      if (!myMembership) {
        setErrorMsg("memberships が未登録です（管理者に登録してください）");
        setLoading(false);
        return;
      }
      setMembership(myMembership);

      // 3) 支部のユーザー一覧（担当者フィルタ/個人名表示用）
      const { data: memList, error: memErr } = await supabase
        .from("memberships")
        .select(`profiles ( user_id, email, display_name )`)
        .eq("branch_id", myMembership.branch_id);

      if (memErr) {
        setErrorMsg(memErr.message);
        setLoading(false);
        return;
      }

      const users = (memList ?? [])
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

      const uniqUsers = Array.from(new Map(users.map((u) => [u.user_id, u])).values());
      setBranchUsers(uniqUsers);

      // 4) 支部の部署一覧（部署名表示/フィルタ用）
      const { data: deptData, error: deptErr } = await supabase
        .from("departments")
        .select("id, name")
        .eq("branch_id", myMembership.branch_id)
        .order("created_at", { ascending: true });

      if (deptErr) {
        setErrorMsg(deptErr.message);
        setLoading(false);
        return;
      }
      setDepartments((deptData ?? []) as Dept[]);

      const departmentIds = (deptData ?? []).map((d: any) => d.id as string);
      const branchUserIds = uniqUsers.map((u) => u.user_id);

      // 5) tasks（支部/部署/個人 全て）
      const selectCols =
        "id,title,description,requester_id,scope_type,scope_id,due_at,status,created_at,updated_at";

      const [
        { data: tBranch, error: eBranch },
        tDeptResult,
        tPersonalResult,
      ] = await Promise.all([
        supabase.from("tasks").select(selectCols).eq("scope_type", "branch").eq("scope_id", myMembership.branch_id),

        departmentIds.length === 0
          ? Promise.resolve({ data: [], error: null } as any)
          : supabase.from("tasks").select(selectCols).eq("scope_type", "department").in("scope_id", departmentIds),

        branchUserIds.length === 0
          ? Promise.resolve({ data: [], error: null } as any)
          : supabase.from("tasks").select(selectCols).eq("scope_type", "personal").in("scope_id", branchUserIds),
      ]);

      const eDept = (tDeptResult as any).error;
      const ePersonal = (tPersonalResult as any).error;

      const anyErr = eBranch || eDept || ePersonal;
      if (anyErr) {
        setErrorMsg(anyErr.message);
        setLoading(false);
        return;
      }

      const tDept = (tDeptResult as any).data ?? [];
      const tPersonal = (tPersonalResult as any).data ?? [];

      const allTasks = ([] as any[]).concat(tBranch ?? [], tDept, tPersonal);
      setTasks(allTasks as TaskRow[]);

      // 6) task_assignees をまとめて取って、担当者フィルタに使う
      const taskIds = allTasks.map((t: any) => t.id as string);
      if (taskIds.length > 0) {
        const { data: taData, error: taErr } = await supabase
          .from("task_assignees")
          .select("task_id, user_id")
          .in("task_id", taskIds);

        if (taErr) {
          setErrorMsg(taErr.message);
          setLoading(false);
          return;
        }

        const map: Record<string, string[]> = {};
        for (const row of taData ?? []) {
          const tid = (row as any).task_id as string;
          const uid = (row as any).user_id as string;
          map[tid] = map[tid] ? [...map[tid], uid] : [uid];
        }
        setAssigneesByTask(map);
      } else {
        setAssigneesByTask({});
      }

      setLoading(false);
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

  const branchName = branchNameOf(membership);

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
    let list = [...tasks];

    // 完了表示
    if (!showDone) list = list.filter((t) => t.status !== "done");

    // ステータス絞り込み
    if (statusFilter) list = list.filter((t) => t.status === statusFilter);

    // 検索（タイトル）
    if (q.trim()) {
      const needle = q.trim().toLowerCase();
      list = list.filter((t) => (t.title ?? "").toLowerCase().includes(needle));
    }

    // 管轄（scope_type）
    if (scopeTypeFilter) list = list.filter((t) => t.scope_type === scopeTypeFilter);

    // 管轄（scope_id）
    if (scopeIdFilter) list = list.filter((t) => t.scope_id === scopeIdFilter);

    // 担当者（task_assignees）
    if (assigneeFilter) {
      list = list.filter((t) => (assigneesByTask[t.id] ?? []).includes(assigneeFilter));
    }

    // 並び替え
    list.sort((a, b) => {
      if (sortKey === "created") {
        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      }
      // due（nullは最後）
      const da = a.due_at ? new Date(a.due_at).getTime() : Number.POSITIVE_INFINITY;
      const db = b.due_at ? new Date(b.due_at).getTime() : Number.POSITIVE_INFINITY;
      return da - db;
    });

    return list;
  }, [
    tasks,
    q,
    showDone,
    statusFilter,
    sortKey,
    scopeTypeFilter,
    scopeIdFilter,
    assigneeFilter,
    assigneesByTask,
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
            <label className="block text-xs text-gray-500">ステータス</label>
            <select
              className="mt-1 rounded-md border px-2 py-2 text-sm"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as any)}
            >
              <option value="">すべて</option>
              <option value="todo">未着手</option>
              <option value="doing">進行中</option>
              <option value="hold">保留</option>
              <option value="done">完了</option>
            </select>
          </div>

          <div>
            <label className="block text-xs text-gray-500">並び替え</label>
            <select
              className="mt-1 rounded-md border px-2 py-2 text-sm"
              value={sortKey}
              onChange={(e) => setSortKey(e.target.value as any)}
            >
              <option value="due">期限（近い順）</option>
              <option value="created">作成日（新しい順）</option>
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
              const due = getDueMeta(t.due_at);

              // 管轄名（部署名/個人名/支部名）
              const scopeName =
                t.scope_type === "branch"
                  ? branchName
                  : t.scope_type === "department"
                  ? deptNameById.get(t.scope_id) ?? "(不明な部署)"
                  : userNameById.get(t.scope_id) ?? "(不明な個人)";

              // 担当者表示（簡易：人数＋先頭1名）
              const assignees = assigneesByTask[t.id] ?? [];
              const assigneePreview =
                assignees.length === 0
                  ? "未割当"
                  : assignees.length === 1
                  ? userNameById.get(assignees[0]) ?? "1名"
                  : `${userNameById.get(assignees[0]) ?? "1名"} 他${assignees.length - 1}名`;

              return (
                <li key={t.id} className={`rounded-xl border p-4 ${dueCardBorderClass(due.tone)}`}>
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
                            {scopeTypeLabel(t.scope_type)}: {scopeName}
                          </span>

                          <span className={`px-2 py-1 rounded border text-xs ${dueBadgeClass(due.tone)}`}>
                            {due.label}
                          </span>
                        </div>
                      </div>

                      <div className="mt-2 text-sm text-gray-600">{formatDue(t.due_at)}</div>

                      <div className="mt-2 text-xs text-gray-600">
                        担当: {assigneePreview}
                      </div>

                      {t.description && (
                        <p className="mt-2 text-sm text-gray-600 whitespace-pre-wrap">{t.description}</p>
                      )}
                    </div>

                    <div className="text-right text-sm shrink-0">
                      <div className="text-xs text-gray-500">進捗</div>
                      <div className="mt-1">{t.status}</div>
                    </div>
                  </div>

                  <div className="mt-3 text-xs text-gray-500">task_id: {t.id}</div>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </main>
  );
}