"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase/client";
import { getDueMeta, dueBadgeClass, formatDue } from "@/lib/taskDue";

type ScopeType = "branch" | "department" | "personal";

type Membership = {
  branch_id: string;
  department_id: string | null;
  role: "member" | "manager" | "admin";
};

type Task = {
  id: string;
  title: string;
  description: string | null;
  requester_id: string;
  scope_type: ScopeType;
  scope_id: string | null;
  due_at: string | null;
  status: "todo" | "doing" | "done" | "hold";
  attachment_url: string | null;
  created_at: string;
  updated_at: string;
};

type Profile = {
  user_id: string;
  email: string;
  display_name: string | null;
};

type AssigneeProgress = {
  user_id: string;
  status: "todo" | "doing" | "done" | "hold";
  note: string | null;
  updated_at: string;
};

function isUuid(v: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    v
  );
}

function profileLabel(profile: Profile | undefined, fallbackUserId?: string) {
  if (!profile) return fallbackUserId ?? "不明なユーザー";
  if (profile.display_name?.trim()) return profile.display_name;
  return profile.email;
}

function scopeTypeLabel(scopeType: ScopeType) {
  switch (scopeType) {
    case "branch":
      return "支部";
    case "department":
      return "部署";
    case "personal":
      return "個人";
    default:
      return scopeType;
  }
}

function statusLabel(status: AssigneeProgress["status"]) {
  switch (status) {
    case "todo":
      return "未着手";
    case "doing":
      return "進行中";
    case "hold":
      return "保留";
    case "done":
      return "完了";
    default:
      return status;
  }
}

export default function TaskEditPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const taskId = params.id;

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [task, setTask] = useState<Task | null>(null);
  const [membership, setMembership] = useState<Membership | null>(null);

  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [assigneeIds, setAssigneeIds] = useState<string[]>([]);
  const [assigneeProgressMap, setAssigneeProgressMap] = useState<
  Record<string, AssigneeProgress>
  >({});
  const [assignAllBranch, setAssignAllBranch] = useState(false);

  const [descriptionDraft, setDescriptionDraft] = useState("");
  const [dueDraft, setDueDraft] = useState("");
  const [attachmentUrlDraft, setAttachmentUrlDraft] = useState("");

  const isManagerOrAdmin =
    membership?.role === "manager" || membership?.role === "admin";

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

    const { data: userData, error: userErr } = await supabase.auth.getUser();
    if (userErr) {
      setError(userErr.message);
      setLoading(false);
      return;
    }

    if (!userData.user) {
      router.replace("/login");
      return;
    }

    const myUserId = userData.user.id;

    const { data: ms, error: msErr } = await supabase
      .from("memberships")
      .select("role, branch_id, department_id")
      .eq("user_id", myUserId)
      .limit(1);

    if (msErr) {
      setError(msErr.message);
      setLoading(false);
      return;
    }

    const currentMembership = (ms?.[0] ?? null) as Membership | null;
    setMembership(currentMembership);

    if (
      !currentMembership ||
      (currentMembership.role !== "manager" && currentMembership.role !== "admin")
    ) {
      setError("このページにアクセスする権限がありません");
      setLoading(false);
      return;
    }

    const myBranchId = currentMembership.branch_id;
    if (!myBranchId) {
      setError("branch_id を取得できませんでした");
      setLoading(false);
      return;
    }

    const { data: memList, error: memErr } = await supabase
      .from("memberships")
      .select("user_id")
      .eq("branch_id", myBranchId)
      .order("created_at", { ascending: true });

    if (memErr) {
      setError(memErr.message);
      setLoading(false);
      return;
    }

    const branchUserIds = (memList ?? []).map((r: any) => r.user_id as string);

    try {
      const { data: taskData, error: taskErr } = await supabase
        .from("tasks")
        .select("*")
        .eq("id", taskId)
        .single();

      if (taskErr) throw taskErr;

      setTask(taskData as Task);
      setDescriptionDraft((taskData as Task).description ?? "");

      const due = (taskData as Task).due_at;
      setDueDraft(due ? new Date(due).toISOString().slice(0, 16) : "");
      setAttachmentUrlDraft((taskData as Task).attachment_url ?? "");

      const { data: assigneesData, error: assigneesErr } = await supabase
        .from("task_assignees")
        .select("user_id, status, note, updated_at")
        .eq("task_id", taskId);

      if (assigneesErr) throw assigneesErr;

      const rows = (assigneesData ?? []) as AssigneeProgress[];
      const ids = rows.map((r) => r.user_id);
      setAssigneeIds(ids);

      const nextMap: Record<string, AssigneeProgress> = {};
      for (const row of rows) {
        nextMap[row.user_id] = row;
      }
      setAssigneeProgressMap(nextMap);

      const { data: profilesData, error: profilesErr } = await supabase
        .from("profiles")
        .select("user_id,email,display_name")
        .in("user_id", branchUserIds)
        .order("created_at", { ascending: true });

      if (profilesErr) throw profilesErr;

      setProfiles((profilesData ?? []) as Profile[]);
    } catch (e: any) {
      setError(e?.message ?? "読み込みに失敗しました");
    } finally {
      setLoading(false);
    }
  }

  function toggleAssignee(userId: string) {
    setAssigneeIds((prev) => {
      const next = prev.includes(userId)
        ? prev.filter((id) => id !== userId)
        : [...prev, userId];

      const allSelected =
        profiles.length > 0 &&
        profiles.every((p) => next.includes(p.user_id));

      setAssignAllBranch(allSelected);

      return next;
    });
  }

  function toggleAssignAllBranch(checked: boolean) {
    setAssignAllBranch(checked);

    if (checked) {
      const allIds = profiles.map((p) => p.user_id);
      setAssigneeIds(allIds);
    } else {
      setAssigneeIds([]);
    }
  }

  function updateAssigneeStatus(
    userId: string,
    status: AssigneeProgress["status"]
  ) {
    setAssigneeProgressMap((prev) => ({
      ...prev,
      [userId]: {
        ...(prev[userId] ?? {
          user_id: userId,
          note: "",
          updated_at: new Date().toISOString(),
        }),
        status,
        updated_at: new Date().toISOString(),
      },
    }));
  }

  function updateAssigneeNote(userId: string, note: string) {
    setAssigneeProgressMap((prev) => ({
      ...prev,
      [userId]: {
        ...(prev[userId] ?? {
          user_id: userId,
          status: "todo",
          updated_at: new Date().toISOString(),
        }),
        note,
        updated_at: new Date().toISOString(),
      },
    }));
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

      setTask({ ...task, description: descriptionDraft });
    } catch (e: any) {
      setError(e?.message ?? "説明の保存に失敗しました");
    } finally {
      setSaving(false);
    }
  }

  async function saveDue() {
    if (!task) return;

    if (!dueDraft) {
      setError("期限は必須です");
      return;
    }

    setSaving(true);
    setError(null);

    try {
      const nextIso = new Date(dueDraft).toISOString();

      const { error: updErr } = await supabase
        .from("tasks")
        .update({ due_at: nextIso })
        .eq("id", task.id);

      if (updErr) throw updErr;

      setTask({ ...task, due_at: nextIso });
    } catch (e: any) {
      setError(e?.message ?? "期限の保存に失敗しました");
    } finally {
      setSaving(false);
    }
  }

  async function saveAttachmentUrl() {
    if (!task) return;

    setSaving(true);
    setError(null);

    try {
      const nextValue = attachmentUrlDraft.trim() || null;

      const { error: updErr } = await supabase
        .from("tasks")
        .update({ attachment_url: nextValue })
        .eq("id", task.id);

      if (updErr) throw updErr;

      setTask({ ...task, attachment_url: nextValue });
      setAttachmentUrlDraft(nextValue ?? "");
    } catch (e: any) {
      setError(e?.message ?? "資料URLの保存に失敗しました");
    } finally {
      setSaving(false);
    }
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
      const { data: currentRows, error: currentErr } = await supabase
        .from("task_assignees")
        .select("user_id")
        .eq("task_id", task.id);

      if (currentErr) throw currentErr;

      const currentIds = (currentRows ?? []).map((r: { user_id: string }) => r.user_id);

      const toDelete = currentIds.filter((id) => !assigneeIds.includes(id));
      const toInsert = assigneeIds.filter((id) => !currentIds.includes(id));

      if (toDelete.length > 0) {
        const { error: delErr } = await supabase
          .from("task_assignees")
          .delete()
          .eq("task_id", task.id)
          .in("user_id", toDelete);

        if (delErr) throw delErr;
      }

      if (toInsert.length > 0) {
        const rows = toInsert.map((user_id) => {
          const progress = assigneeProgressMap[user_id];
          return {
            task_id: task.id,
            user_id,
            status: progress?.status ?? "todo",
            note: progress?.note ?? null,
          };
        });

        const { error: insErr } = await supabase
          .from("task_assignees")
          .insert(rows);

        if (insErr) throw insErr;
      }
    } catch (e: any) {
      setError(e?.message ?? "担当者の保存に失敗しました");
    } finally {
      setSaving(false);
    }
  }

  async function saveAssigneeProgresses() {
    if (!task) return;

    setSaving(true);
    setError(null);

    try {
      for (const userId of assigneeIds) {
        const progress = assigneeProgressMap[userId];

        const payload = {
          status: progress?.status ?? "todo",
          note: progress?.note?.trim() ? progress.note.trim() : null,
          updated_at: new Date().toISOString(),
        };

        const { error: updErr } = await supabase
          .from("task_assignees")
          .update(payload)
          .eq("task_id", task.id)
          .eq("user_id", userId);

        if (updErr) throw updErr;
      }

      await load();
    } catch (e: any) {
      setError(e?.message ?? "担当者ごとの進捗保存に失敗しました");
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

  if (!task || !isManagerOrAdmin) {
    return (
      <div className="p-6">
        <div className="mb-3 text-sm text-red-600">
          {error ?? "このページにアクセスする権限がありません"}
        </div>
        <div className="flex gap-3">
          <Link href={`/tasks/${taskId}`} className="underline">
            詳細ページへ戻る
          </Link>
          <Link href="/dashboard" className="underline">
            ダッシュボードへ戻る
          </Link>
        </div>
      </div>
    );
  }

  const dueMeta = getDueMeta(task.due_at);
  const due = getDueMeta(task.due_at);

  return (
    <div className="p-6 max-w-3xl">
      <div className="flex items-center justify-between gap-3 mb-6">
        <div>
          <h1 className="text-2xl font-bold">タスク編集</h1>
          <div className="text-sm text-gray-500">task_id: {task.id}</div>
        </div>

        <div className="flex gap-2">
          <Link
            href={`/tasks/${task.id}`}
            className="px-4 py-2 border rounded-md"
          >
            詳細へ戻る
          </Link>
          <button
            onClick={() => router.back()}
            className="px-4 py-2 border rounded-md"
          >
            戻る
          </button>
        </div>
      </div>

      {error && (
        <div className="mb-4 p-3 rounded-md border border-red-200 bg-red-50 text-red-700 text-sm">
          {error}
        </div>
      )}

      <div className="border rounded-lg p-4 mb-4">
        <div className="text-xl font-semibold mb-1">{task.title}</div>

        <div className="mt-4 flex flex-wrap gap-4 text-sm">
            <div className="min-w-[220px]">
                <div className="text-xs text-gray-500">現在の期限</div>
                <div className={`px-2 py-1 rounded border ${dueBadgeClass(due.tone)}`}>
                    {formatDue(task.due_at)}（{due.label}）
                </div>
            </div>

            <div className="min-w-[220px]">
                <div className="text-xs text-gray-500">現在の管轄</div>
                <div className="px-2 py-1 rounded border border-gray-200 bg-gray-50 text-gray-700">
                {scopeTypeLabel(task.scope_type)}
                {task.scope_id ? `（${task.scope_id}）` : ""}
                </div>
            </div>
        </div>
      </div>

      <div className="border rounded-lg p-4 mb-4">
        <div className="font-semibold mb-2">説明を編集</div>
        <textarea
          className="mt-2 w-full rounded-md border px-3 py-2"
          value={descriptionDraft}
          onChange={(e) => setDescriptionDraft(e.target.value)}
          rows={6}
        />
        <button
          className="mt-2 rounded-md border px-3 py-2"
          onClick={updateDescription}
          disabled={saving}
        >
          {saving ? "保存中..." : "説明を保存"}
        </button>
      </div>

      <div className="border rounded-lg p-4 mb-4">
        <div className="font-semibold mb-2">期限を編集</div>
        <input
          type="datetime-local"
          className="rounded-md border px-3 py-2 text-sm"
          value={dueDraft}
          onChange={(e) => setDueDraft(e.target.value)}
        />
        <div className="mt-2">
          <button
            className="rounded-md border px-3 py-2 text-sm"
            onClick={saveDue}
            disabled={saving}
          >
            {saving ? "保存中..." : "期限を保存"}
          </button>
        </div>
      </div>

      <div className="border rounded-lg p-4 mb-4">
        <div className="font-semibold mb-2">資料URLを編集</div>
        <div className="text-xs text-gray-500 mb-3">
          Google DriveのURLを貼ってください。複数資料共有時は1つのドライブにまとめてください。
        </div>

        <input
          type="url"
          className="w-full rounded-md border px-3 py-2 text-sm"
          value={attachmentUrlDraft}
          onChange={(e) => setAttachmentUrlDraft(e.target.value)}
          placeholder="https://drive.google.com/..."
        />

        <div className="mt-2">
          <button
            className="rounded-md border px-3 py-2 text-sm"
            onClick={saveAttachmentUrl}
            disabled={saving}
          >
            {saving ? "保存中..." : "資料URLを保存"}
          </button>
        </div>
      </div>

      <div className="border rounded-lg p-4">
        <div className="font-semibold mb-2">担当者を編集</div>
        <div className="text-xs text-gray-500 mb-3">
          同一branch内のユーザーから担当者を選択します
        </div>

        <div className="mt-2 space-y-2">
          <div className="mb-3 flex flex-col gap-2">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={assignAllBranch}
                onChange={(e) => toggleAssignAllBranch(e.target.checked)}
                disabled={profiles.length === 0}
              />
              支部全員に割り当て
            </label>

            <label className="flex items-center gap-2 text-sm text-gray-400">
              <input type="checkbox" disabled />
              部署全員に割り当て（準備中）
            </label>
          </div>
          {profiles.map((p) => (
            <label key={p.user_id} className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={assigneeIds.includes(p.user_id)}
                onChange={() => toggleAssignee(p.user_id)}
              />
              {profileLabel(p, p.user_id)}
            </label>
          ))}
        </div>

        <button
          className="mt-3 rounded-md border px-3 py-2"
          onClick={saveAssignees}
          disabled={saving}
        >
          {saving ? "保存中..." : "担当者を保存"}
        </button>
      </div>

      <div className="border rounded-lg p-4 mt-4">
        <div className="font-semibold mb-2">担当者ごとの進捗・備考を編集</div>

        {assigneeIds.length === 0 ? (
          <div className="text-sm text-gray-500">担当者が未設定です</div>
        ) : (
          <div className="space-y-4">
            {assigneeIds.map((userId) => {
              const profile = profiles.find((p) => p.user_id === userId);
              const progress = assigneeProgressMap[userId];

              return (
                <div key={userId} className="rounded-lg border p-3">
                  <div className="font-medium mb-2">
                    {profileLabel(profile, userId)}
                  </div>

                  <div className="mb-3">
                    <div className="text-xs text-gray-500 mb-1">進捗</div>
                    <select
                      className="rounded-md border px-3 py-2 text-sm"
                      value={progress?.status ?? "todo"}
                      onChange={(e) =>
                        updateAssigneeStatus(
                          userId,
                          e.target.value as AssigneeProgress["status"]
                        )
                      }
                    >
                      <option value="todo">未着手</option>
                      <option value="doing">進行中</option>
                      <option value="hold">保留</option>
                      <option value="done">完了</option>
                    </select>
                  </div>

                  <div>
                    <div className="text-xs text-gray-500 mb-1">備考</div>
                    <textarea
                      className="w-full rounded-md border px-3 py-2 text-sm"
                      rows={3}
                      value={progress?.note ?? ""}
                      onChange={(e) => updateAssigneeNote(userId, e.target.value)}
                      placeholder="進捗に関する備考を入力"
                    />
                  </div>

                  <div className="mt-2 text-xs text-gray-500">
                    現在の状態: {statusLabel(progress?.status ?? "todo")}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <button
          className="mt-3 rounded-md border px-3 py-2"
          onClick={saveAssigneeProgresses}
          disabled={saving}
        >
          {saving ? "保存中..." : "担当者ごとの進捗・備考を保存"}
        </button>
      </div>
    </div>
  );
}