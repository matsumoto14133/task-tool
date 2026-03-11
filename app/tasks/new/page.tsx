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

type Membership = {
  branch_id: string;
  department_id: string | null;
  role: "member" | "manager" | "admin";
  branches: { name: string }[]; // ←配列にする
};

type AssigneeCandidate = {
  user_id: string;
  email: string;
  display_name: string | null;
};

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

  // メンバーシップ関連
  const [membership, setMembership] = useState<Membership | null>(null);
  const [candidates, setCandidates] = useState<AssigneeCandidate[]>([]);

  const [assignAllBranch, setAssignAllBranch] = useState(false);
  const [assignAllDept, setAssignAllDept] = useState(false); // 部署は後回しでもOK

  useEffect(() => {
    (async () => {
      setLoading(true);
      setErrorMsg(null);

      // 1) user
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

      setMe({ id: userData.user.id, email: userData.user.email ?? null });

      // 2) membership（支部名も取る）
      const { data: ms, error: msErr } = await supabase
        .from("memberships")
        .select(`
          branch_id,
          department_id,
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
        setErrorMsg("memberships が未登録です（管理者に登録してもらってください）");
        setLoading(false);
        return;
      }
      setMembership(myMembership);

      // 3) candidates（同じ支部の人だけ）
      const { data: memList, error: memErr } = await supabase
        .from("memberships")
        .select(`
          profiles ( user_id, email, display_name )
        `)
        .eq("branch_id", myMembership.branch_id);

      if (memErr) {
        setErrorMsg(memErr.message);
        setLoading(false);
        return;
      }

      const list =
        (memList ?? [])
          .map((r: any) => r.profiles)
          .filter(Boolean) as AssigneeCandidate[];

      const uniq = Array.from(new Map(list.map((p) => [p.user_id, p])).values());

      console.log("membership:", myMembership);
      console.log("memList sample:", memList?.[0]);
      console.log("uniq candidates:", uniq);

      setCandidates(uniq);

      setLoading(false);
    })();
  }, [router]);

  const toggleAssignee = (targetUserId: string) => {
    setAssigneeIds((prev) =>
      prev.includes(targetUserId)
        ? prev.filter((x) => x !== targetUserId)
        : [...prev, targetUserId]
    );
  };

  const onToggleAllBranch = (checked: boolean) => {
    setAssignAllBranch(checked);
    if (checked) {
      setAssigneeIds(candidates.map((c) => c.user_id));
    } else {
      setAssigneeIds([]); // MVPは単純に空に戻す（必要なら「元の選択に戻す」も可能）
    }
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
    // submit時に必要な情報が揃っているかチェック
    if (!me || !membership) {
      setErrorMsg("ユーザー情報または所属情報が未取得です");
      setSaving(false);
      return;
    }

    const scope_id =
      scopeType === "branch"
        ? membership.branch_id
        : scopeType === "personal"
        ? me.id
        : null;
    if (!scope_id) {
      setErrorMsg("scope_id を決定できませんでした");
      setSaving(false);
      return;
    }
    if (assigneeIds.length === 0) {
      setErrorMsg("担当者を1人以上選んでください。");
      setSaving(false);
      return;
    }
    // 期限は必須にする
    if (!dueAt) {
      setErrorMsg("期限を入力してください。");
      setSaving(false);
      return;
    }

    // datetime-local -> ISO
    const dueAtIso = dueAt ? new Date(dueAt).toISOString() : null;

    if (!dueAtIso) {
      setErrorMsg("期限の形式が不正です。");
      setSaving(false);
      return;
    }

    // 1) tasks insert
    const { data: task, error: taskErr } = await supabase
      .from("tasks")
      .insert({
        title: title.trim(),
        description: description.trim() ? description.trim() : null,
        requester_id: me.id,
        scope_type: scopeType,
        scope_id: scope_id,
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

  const branchName =
  !membership
    ? "-"
    : Array.isArray((membership as any).branches)
    ? ((membership as any).branches?.[0]?.name ?? "-")
    : ((membership as any).branches?.name ?? "-");

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
            <label className="block text-sm font-medium">期限（必須）</label>
            <input
              type="datetime-local"
              className="mt-1 w-full rounded-md border px-3 py-2"
              value={dueAt}
              onChange={(e) => setDueAt(e.target.value)}
              required
            />
          </div>

          <div className="rounded-xl border p-4">
            <div className="font-semibold mb-2">管轄</div>

            <div className="flex items-center gap-6 text-sm">
              <label className="flex items-center gap-2">
                <input
                  type="radio"
                  name="scope"
                  value="branch"
                  checked={scopeType === "branch"}
                  onChange={() => setScopeType("branch")}
                />
                支部
              </label>

              <label className="flex items-center gap-2">
                <input
                  type="radio"
                  name="scope"
                  value="personal"
                  checked={scopeType === "personal"}
                  onChange={() => setScopeType("personal")}
                />
                個人
              </label>

              <label className="flex items-center gap-2 text-gray-400">
                <input type="radio" name="scope" value="department" disabled />
                部署（準備中）
              </label>
            </div>

            <div className="mt-3 text-sm text-gray-700">
              {scopeType === "branch" && (
                <>支部: {branchName} </>
              )}
              {scopeType === "personal" && <>個人: あなた</>}
            </div>
          </div>

          <div className="rounded-xl border p-4">
            <div className="font-semibold mb-2">担当者（複数選択可）</div>

            <div className="mb-3 flex flex-col gap-2">
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={assignAllBranch}
                  onChange={(e) => onToggleAllBranch(e.target.checked)}
                  disabled={candidates.length === 0}
                />
                支部全員に割り当て
              </label>

              <label className="flex items-center gap-2 text-sm text-gray-400">
                <input type="checkbox" disabled />
                部署全員に割り当て（準備中）
              </label>
            </div>

            {candidates.length === 0 ? (
              <p className="text-sm text-gray-500">
                担当者候補がありません（memberships / profiles を確認してください）
              </p>
            ) : (
              <div className="space-y-2 text-sm">
                {candidates.map((p) => (
                  <label key={p.user_id} className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      disabled={assignAllBranch}
                      checked={assigneeIds.includes(p.user_id)}
                      onChange={() => toggleAssignee(p.user_id)}
                    />
                    <span>
                      {p.email}
                      {p.display_name ? `（${p.display_name}）` : ""}
                    </span>
                  </label>
                ))}
              </div>
            )}
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