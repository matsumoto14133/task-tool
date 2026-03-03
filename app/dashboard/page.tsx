"use client"; // クライアントコンポーネントの宣言

import { useEffect, useMemo, useState } from "react"; // クライアントコンポーネントと一緒に使う
import { useRouter } from "next/navigation"; // ルーター（ページ遷移）を使うためのフック
import { supabase } from "@/lib/supabase/client";
import Link from "next/link";
import { getDueMeta, dueBadgeClass, dueCardBorderClass, formatDue } from "@/lib/taskDue";

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
};

type AssigneeRow = {
  task_id: string;
  tasks: TaskRow | TaskRow[] | null;
};

type Membership = {
  branch_id: string;
  department_id: string | null;
  role: "member" | "manager" | "admin";
  branches: { name: string } | null;
};

function normalizeTasks(x: TaskRow | TaskRow[] | null): TaskRow[] {
  if (!x) return [];
  return Array.isArray(x) ? x : [x];
}

function statusLabel(status: TaskStatus) {
  switch (status) {
    case "todo":
      return "未着手";
    case "doing":
      return "進行中";
    case "done":
      return "完了";
    case "hold":
      return "保留";
  }
}

function roleLabel(role: "member" | "manager" | "admin") {
  switch (role) {
    case "admin":
      return "管理者";
    case "manager":
      return "マネージャー";
    default:
      return "メンバー";
  }
}

export default function DashboardPage() {
  const router = useRouter();
  const [email, setEmail] = useState<string | null>(null);
  const [rows, setRows] = useState<AssigneeRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [membership, setMembership] = useState<Membership | null>(null);

  const tasks = useMemo(() => {
    return rows.flatMap((r) => normalizeTasks(r.tasks));
  }, [rows]);

  useEffect(() => {
    (async () => {
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
      setEmail(userData.user.email ?? null);

      // ログイン後に自分のメンバーシップをとる
      const { data: membershipList, error: membershipErr } = await supabase
        .from("memberships")
        .select("branch_id, department_id, role")
        .eq("user_id", userData.user.id)
        .order("created_at", { ascending: true })
        .limit(1);

      const membershipData = membershipList?.[0] ?? null;

      if (membershipErr) {
        setErrorMsg(membershipErr.message);
        setLoading(false);
        return;
      }

      if (!membershipData) {
        setErrorMsg("memberships が未登録です（管理者に登録してもらってください）");
        setLoading(false);
        return;
      }

      setMembership(membershipData as Membership);

      // ここで branch_id / role が使えるようになる
      console.log("自分のmembership:", membershipData);

      // 2) 自分が担当のタスクをJOINして取得
      const { data, error } = await supabase
        .from("task_assignees")
        .select(
          `
          task_id,
          tasks (
            id, title, description, requester_id, scope_type, scope_id,
            due_at, status, created_at, updated_at
          )
        `
        )
        .eq("user_id", userData.user.id)
        // .neq("tasks.status", "done") // 完了を除外（好みで外してOK）
        .order("due_at", { ascending: true, foreignTable: "tasks" });

      if (error) {
        setErrorMsg(error.message);
        setLoading(false);
        return;
      }

      setRows((data ?? []) as AssigneeRow[]);
      setLoading(false);
    })();
  }, [router]);

  const updateStatus = async (taskId: string, status: TaskStatus) => {
  setErrorMsg(null);

  const { error } = await supabase
    .from("tasks")
    .update({ status })
    .eq("id", taskId);

  if (error) {
    setErrorMsg(error.message);
    return;
  }

  // 画面を即時反映（ローカルstate更新）
  setRows((prev) =>
    prev.map((r) => {
      const list = normalizeTasks(r.tasks);
      const updated = list.map((t) => (t.id === taskId ? { ...t, status } : t));

      // 返却形式は「元の形を保つ」：単体なら単体、配列なら配列
      const nextTasks =
        r.tasks === null ? null : Array.isArray(r.tasks) ? updated : updated[0] ?? null;

      return { ...r, tasks: nextTasks };
    })
  );
};

  const onLogout = async () => {
    await supabase.auth.signOut();
    setMembership(null);
    router.replace("/login");
  };
  
  return (
    <main className="p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">個人ホーム</h1>
          <div className="mt-2 flex flex-col gap-2">
            <p className="text-sm text-gray-600">ログイン中: {email ?? "-"}</p>

            <p className="text-sm text-gray-600">
              所属: {membership ? `${membership.branches?.name ?? "-"} / ${roleLabel(membership.role)}` : "-"}
            </p>

            <Link
              className="inline-block w-fit rounded-md border px-3 py-2"
              href="/tasks/new"
            >
              タスクを依頼
            </Link>
          </div>
        </div>

        <button className="rounded-md border px-3 py-2" onClick={onLogout}>
          Logout
        </button>
      </div>

      <section className="mt-8">
        <h2 className="text-lg font-semibold">自分の担当タスク</h2>

        {loading && <p className="mt-3 text-sm">読み込み中...</p>}
        {errorMsg && <p className="mt-3 text-sm text-red-600">❌ {errorMsg}</p>}

        {!loading && !errorMsg && tasks.length === 0 && (
          <p className="mt-3 text-sm text-gray-600">担当タスクがありません。</p>
        )}

        {!loading && !errorMsg && tasks.length > 0 && (
          <ul className="mt-4 space-y-3">
            {tasks.map((t) => {
              const due = getDueMeta(t.due_at);

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

                        <span
                          className={`shrink-0 px-2 py-1 rounded border text-xs ${dueBadgeClass(
                            due.tone
                          )}`}
                        >
                          {due.label}
                        </span>
                      </div>

                      <div className="mt-2 text-sm text-gray-600">
                        {formatDue(t.due_at)}
                      </div>

                      {t.description && (
                        <p className="mt-1 text-sm text-gray-600 whitespace-pre-wrap">
                          {t.description}
                        </p>
                      )}
                    </div>

                    <div className="text-right text-sm shrink-0">
                      <label className="block text-xs text-gray-500">進捗</label>
                      <select
                        className="mt-1 rounded-md border px-2 py-1"
                        value={t.status}
                        onChange={(e) => updateStatus(t.id, e.target.value as TaskStatus)}
                      >
                        <option value="todo">未着手</option>
                        <option value="doing">進行中</option>
                        <option value="hold">保留</option>
                        <option value="done">完了</option>
                      </select>

                      <div className="mt-2 text-gray-600">
                        期限: {formatDue(t.due_at)}
                      </div>
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