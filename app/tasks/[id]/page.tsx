"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase/client";
import { getDueMeta, dueBadgeClass, formatDue } from "@/lib/taskDue";

type TaskStatus = "todo" | "doing" | "done" | "hold";
type ScopeType = "branch" | "department" | "personal";

type Task = {
  id: string;
  title: string;
  description: string | null;
  requester_id: string;
  scope_type: ScopeType;
  scope_id: string | null;
  due_at: string | null;
  status: TaskStatus;
  created_at: string;
  updated_at: string;
};

type Profile = {
  user_id: string;
  email: string;
  display_name: string | null;
};

function dueTone(dueAt: string | null) {
  if (!dueAt) return "border-gray-200 bg-gray-50 text-gray-700";
  const due = new Date(dueAt).getTime();
  const now = Date.now();
  const diffHours = (due - now) / (1000 * 60 * 60);

  if (diffHours < 0) return "border-red-300 bg-red-50 text-red-700";
  if (diffHours <= 48) return "border-orange-300 bg-orange-50 text-orange-700";
  return "border-emerald-200 bg-emerald-50 text-emerald-700";
}

function isUuid(v: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    v
  );
}

export default function TaskDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const taskId = params.id;

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [task, setTask] = useState<Task | null>(null);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [assigneeIds, setAssigneeIds] = useState<string[]>([]);

  // 編集用（description）
  const [descriptionDraft, setDescriptionDraft] = useState<string>("");

  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!taskId || !isUuid(taskId)) {
      setError("不正なタスクIDです");
      setLoading(false);
      return;
    }

    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [taskId]);

  async function load() {
    if (!taskId || !isUuid(taskId)) return;
    setLoading(true);
    setError(null);

    try {
      // 1) task本体
      const { data: taskData, error: taskErr } = await supabase
        .from("tasks")
        .select("*")
        .eq("id", taskId)
        .single();

      if (taskErr) throw taskErr;
      setTask(taskData as Task);
      setDescriptionDraft((taskData as Task).description ?? "");

      // 2) assignees
      const { data: assigneesData, error: assigneesErr } = await supabase
        .from("task_assignees")
        .select("user_id")
        .eq("task_id", taskId);

      if (assigneesErr) throw assigneesErr;
      const ids = (assigneesData ?? []).map((r: { user_id: string }) => r.user_id);
      setAssigneeIds(ids);

      // 3) profiles（候補）
      const { data: profilesData, error: profilesErr } = await supabase
        .from("profiles")
        .select("user_id,email,display_name")
        .order("created_at", { ascending: true });

      if (profilesErr) throw profilesErr;
      setProfiles((profilesData ?? []) as Profile[]);
    } catch (e: any) {
      setError(e?.message ?? "読み込みに失敗しました");
    } finally {
      setLoading(false);
    }
  }

  async function updateDescription() {
    if (!task) return;
    setSaving(true);
    setError(null);

    try {
      const { error: updErr } = await supabase
        .from("tasks")
        .update({ description: descriptionDraft })
        .eq("id", task.id);

      if (updErr) throw updErr;

      // ローカル反映
      setTask({ ...task, description: descriptionDraft });
    } catch (e: any) {
      setError(e?.message ?? "保存に失敗しました");
    } finally {
      setSaving(false);
    }
  }

  async function updateStatus(next: TaskStatus) {
    if (!task) return;
    setSaving(true);
    setError(null);

    try {
      const { error: updErr } = await supabase
        .from("tasks")
        .update({ status: next })
        .eq("id", task.id);

      if (updErr) throw updErr;
      setTask({ ...task, status: next });
    } catch (e: any) {
      setError(e?.message ?? "ステータス更新に失敗しました");
    } finally {
      setSaving(false);
    }
  }

  function toggleAssignee(userId: string) {
    setAssigneeIds((prev) =>
      prev.includes(userId) ? prev.filter((id) => id !== userId) : [...prev, userId]
    );
  }

  async function saveAssignees() {
    if (!task) return;

    if (assigneeIds.length === 0) {
      setError("担当者は1人以上必要です");
      return;
    }

    setSaving(true);
    setError(null);

    try {
      // 置換（全削除→再insert）: 最初はこれが一番安全
      const { error: delErr } = await supabase
        .from("task_assignees")
        .delete()
        .eq("task_id", task.id);

      if (delErr) throw delErr;

      const rows = assigneeIds.map((user_id) => ({
        task_id: task.id,
        user_id,
      }));

      const { error: insErr } = await supabase
        .from("task_assignees")
        .insert(rows);

      if (insErr) throw insErr;
    } catch (e: any) {
      setError(e?.message ?? "担当者保存に失敗しました");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="p-6">
        <div className="text-sm text-gray-500">読み込み中...</div>
      </div>
    );
  }

  if (!task) {
    return (
      <div className="p-6">
        <div className="mb-3 text-sm text-red-600">{error ?? "タスクが見つかりません"}</div>
        <Link href="/dashboard" className="underline">
          ダッシュボードへ戻る
        </Link>
      </div>
    );
  }

  const dueClass = dueTone(task.due_at);
  const due = getDueMeta(task.due_at);

  return (
    <div className="p-6 max-w-3xl">
      <div className="flex items-center justify-between gap-3 mb-6">
        <div>
          <h1 className="text-2xl font-bold">タスク詳細</h1>
          <div className="text-sm text-gray-500">task_id: {task.id}</div>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => router.back()}
            className="px-4 py-2 border rounded-md"
          >
            戻る
          </button>
          <Link href="/dashboard" className="px-4 py-2 border rounded-md">
            ホーム
          </Link>
        </div>
      </div>

      {error && (
        <div className="mb-4 p-3 rounded-md border border-red-200 bg-red-50 text-red-700 text-sm">
          {error}
        </div>
      )}

      {/* 基本情報 */}
      <div className="border rounded-lg p-4 mb-4">
        <div className="text-xl font-semibold mb-1">{task.title}</div>

        <div className="flex flex-wrap items-center gap-3 text-sm mt-2">
          <div className={`px-2 py-1 rounded border ${dueBadgeClass(due.tone)}`}>
            {formatDue(task.due_at)}（{due.label}）
          </div>

          <div className="px-2 py-1 rounded border border-gray-200 bg-gray-50 text-gray-700">
            scope: {task.scope_type}
            {task.scope_id ? ` (${task.scope_id})` : ""}
          </div>

          <div className="flex items-center gap-2">
            <span className="text-gray-500">進捗</span>
            <select
              value={task.status}
              onChange={(e) => updateStatus(e.target.value as TaskStatus)}
              className="border rounded-md px-2 py-1"
              disabled={saving}
            >
              <option value="todo">未着手</option>
              <option value="doing">進行中</option>
              <option value="done">完了</option>
              <option value="hold">保留</option>
            </select>
          </div>
        </div>
      </div>

      {/* 説明（編集） */}
      <div className="border rounded-lg p-4 mb-4">
        <div className="font-semibold mb-2">説明</div>
        <textarea
          value={descriptionDraft}
          onChange={(e) => setDescriptionDraft(e.target.value)}
          className="w-full border rounded-md p-3 min-h-[140px]"
          placeholder="説明を入力"
        />
        <div className="mt-3 flex justify-end">
          <button
            onClick={updateDescription}
            disabled={saving}
            className="px-4 py-2 rounded-md border"
          >
            {saving ? "保存中..." : "説明を保存"}
          </button>
        </div>
      </div>

      {/* 担当者（編集） */}
      <div className="border rounded-lg p-4">
        <div className="font-semibold mb-2">担当者</div>
        <div className="text-xs text-gray-500 mb-3">
          ※ MVPは profiles 全員を候補に表示（RLS後に“同じ支部/部署のみ”へ）
        </div>

        <div className="space-y-2">
          {profiles.map((p) => (
            <label key={p.user_id} className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
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

        <div className="mt-4 flex justify-end">
          <button
            onClick={saveAssignees}
            disabled={saving}
            className="px-4 py-2 rounded-md border"
          >
            {saving ? "保存中..." : "担当者を保存"}
          </button>
        </div>
      </div>
    </div>
  );
}