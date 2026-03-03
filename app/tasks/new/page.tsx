"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabase/client";

type ScopeType = "branch" | "department" | "personal";
type TaskStatus = "todo" | "doing" | "done" | "hold";

type Branch = { id: string; name: string };
type Department = { id: string; name: string; branch_id: string | null };
type Profile = { user_id: string; email: string | null; display_name: string | null };

export default function NewTaskPage() {
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [me, setMe] = useState<{ id: string; email: string | null } | null>(null);

  const [branches, setBranches] = useState<Branch[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);

  // form state
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [dueAt, setDueAt] = useState(""); // datetime-local
  const [scopeType, setScopeType] = useState<ScopeType>("branch");
  const [branchId, setBranchId] = useState<string>("");
  const [departmentId, setDepartmentId] = useState<string>("");
  const [assigneeIds, setAssigneeIds] = useState<string[]>([]);

  const scopeId = useMemo(() => {
    if (!me) return "";
    if (scopeType === "personal") return me.id;
    if (scopeType === "department") return departmentId;
    return branchId; // branch
  }, [scopeType, branchId, departmentId, me]);

  useEffect(() => {
    (async () => {
      setLoading(true);
      setErrorMsg(null);

      // login check
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
      const myId = userData.user.id;
      setMe({ id: myId, email: userData.user.email ?? null });

      // fetch initial data
      const [bRes, dRes, pRes] = await Promise.all([
        supabase.from("branches").select("id,name").order("created_at", { ascending: true }),
        supabase.from("departments").select("id,name,branch_id").order("created_at", { ascending: true }),
        supabase.from("profiles").select("user_id,email,display_name").order("created_at", { ascending: true }),
      ]);

      if (bRes.error) return setErrorMsg(bRes.error.message), setLoading(false);
      if (dRes.error) return setErrorMsg(dRes.error.message), setLoading(false);
      if (pRes.error) return setErrorMsg(pRes.error.message), setLoading(false);

      const b = (bRes.data ?? []) as Branch[];
      const d = (dRes.data ?? []) as Department[];
      const p = (pRes.data ?? []) as Profile[];

      setBranches(b);
      setDepartments(d);
      setProfiles(p);

      // 1支部スタート想定：最初の支部をデフォルト選択
      const defaultBranchId = b[0]?.id ?? "";
      setBranchId(defaultBranchId);

      // 部署も支部に紐づく最初のものを選択
      const firstDept = d.find((x) => x.branch_id === defaultBranchId) ?? d[0];
      setDepartmentId(firstDept?.id ?? "");

      // 担当者はデフォルトで自分
      setAssigneeIds([myId]);

      setLoading(false);
    })();
  }, [router]);

  const toggleAssignee = (userId: string) => {
    setAssigneeIds((prev) =>
      prev.includes(userId) ? prev.filter((x) => x !== userId) : [...prev, userId]
    );
  };

  const onCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!me) return;

    setSaving(true);
    setErrorMsg(null);

    if (!title.trim()) {
      setErrorMsg("タイトルを入力してください。");
      setSaving(false);
      return;
    }
    if (!scopeId) {
      setErrorMsg("管轄の選択が不正です（scope_idが空）。");
      setSaving(false);
      return;
    }
    if (assigneeIds.length === 0) {
      setErrorMsg("担当者を1人以上選んでください。");
      setSaving(false);
      return;
    }

    // datetime-local -> ISO
    const dueAtIso = dueAt ? new Date(dueAt).toISOString() : null;

    // 1) tasks insert
    const { data: task, error: taskErr } = await supabase
      .from("tasks")
      .insert({
        title: title.trim(),
        description: description.trim() ? description.trim() : null,
        requester_id: me.id,
        scope_type: scopeType,
        scope_id: scopeId,
        due_at: dueAtIso,
        status: "todo" as TaskStatus,
      })
      .select("id")
      .single();

    if (taskErr) {
      setErrorMsg(taskErr.message);
      setSaving(false);
      return;
    }

    // 2) assignees insert (bulk)
    const rows = assigneeIds.map((uid) => ({ task_id: task.id, user_id: uid }));
    const { error: aErr } = await supabase.from("task_assignees").insert(rows);

    if (aErr) {
      // MVP: 失敗したらタスクも消す（中途半端防止）
      await supabase.from("tasks").delete().eq("id", task.id);
      setErrorMsg(`担当者の登録に失敗しました: ${aErr.message}`);
      setSaving(false);
      return;
    }

    // 作成後はdashboardへ
    router.replace("/dashboard");
  };

  const deptOptions = useMemo(() => {
    if (!branchId) return departments;
    return departments.filter((d) => d.branch_id === branchId);
  }, [departments, branchId]);

  return (
    <main className="p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">タスク作成</h1>
          <p className="mt-1 text-sm text-gray-600">
            依頼者: {me?.email ?? "-"}
          </p>
        </div>
        <Link className="rounded-md border px-3 py-2" href="/dashboard">
          戻る
        </Link>
      </div>

      {loading && <p className="mt-6 text-sm">読み込み中...</p>}
      {errorMsg && <p className="mt-6 text-sm text-red-600">❌ {errorMsg}</p>}

      {!loading && (
        <form className="mt-6 space-y-6 max-w-2xl" onSubmit={onCreate}>
          <div>
            <label className="block text-sm font-medium">タイトル</label>
            <input
              className="mt-1 w-full rounded-md border px-3 py-2"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium">説明</label>
            <textarea
              className="mt-1 w-full rounded-md border px-3 py-2"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={4}
            />
          </div>

          <div>
            <label className="block text-sm font-medium">期限</label>
            <input
              className="mt-1 rounded-md border px-3 py-2"
              type="datetime-local"
              value={dueAt}
              onChange={(e) => setDueAt(e.target.value)}
            />
          </div>

          <div className="rounded-xl border p-4 space-y-3">
            <p className="font-semibold">管轄</p>

            <div className="flex flex-wrap gap-3">
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="radio"
                  name="scope"
                  checked={scopeType === "branch"}
                  onChange={() => setScopeType("branch")}
                />
                支部
              </label>

              <label className="flex items-center gap-2 text-sm">
                <input
                  type="radio"
                  name="scope"
                  checked={scopeType === "department"}
                  onChange={() => setScopeType("department")}
                />
                部署
              </label>

              <label className="flex items-center gap-2 text-sm">
                <input
                  type="radio"
                  name="scope"
                  checked={scopeType === "personal"}
                  onChange={() => setScopeType("personal")}
                />
                個人
              </label>
            </div>

            {(scopeType === "branch" || scopeType === "department") && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium">支部</label>
                  <select
                    className="mt-1 w-full rounded-md border px-3 py-2"
                    value={branchId}
                    onChange={(e) => {
                      setBranchId(e.target.value);
                      // 支部変更時、部署選択も合わせて更新
                      const nextDept = departments.find((d) => d.branch_id === e.target.value);
                      setDepartmentId(nextDept?.id ?? "");
                    }}
                  >
                    {branches.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.name}
                      </option>
                    ))}
                  </select>
                </div>

                {scopeType === "department" && (
                  <div>
                    <label className="block text-sm font-medium">部署</label>
                    <select
                      className="mt-1 w-full rounded-md border px-3 py-2"
                      value={departmentId}
                      onChange={(e) => setDepartmentId(e.target.value)}
                    >
                      {deptOptions.map((d) => (
                        <option key={d.id} value={d.id}>
                          {d.name}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
              </div>
            )}

            {scopeType === "personal" && (
              <p className="text-sm text-gray-600">
                個人タスクとして作成します（scope_id = あなたのユーザーID）
              </p>
            )}
          </div>

          <div className="rounded-xl border p-4">
            <p className="font-semibold">担当者（複数選択可）</p>
            <p className="text-xs text-gray-600 mt-1">
              ※ profiles から取得しています。まずは全員閲覧できる前提（RLS後で）。
            </p>

            <div className="mt-3 space-y-2">
              {profiles.map((p) => {
                const label = p.display_name || p.email || p.user_id;
                const checked = assigneeIds.includes(p.user_id);
                return (
                  <label key={p.user_id} className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleAssignee(p.user_id)}
                    />
                    <span>{label}</span>
                    {p.user_id === me?.id && (
                      <span className="text-xs text-gray-500">(あなた)</span>
                    )}
                  </label>
                );
              })}
            </div>
          </div>

          <button
            className="rounded-md border px-4 py-2 font-medium disabled:opacity-50"
            type="submit"
            disabled={saving}
          >
            {saving ? "作成中..." : "タスクを作成"}
          </button>
        </form>
      )}
    </main>
  );
}