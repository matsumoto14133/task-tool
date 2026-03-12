"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase/client";
import { getDueMeta, dueBadgeClass, formatDue } from "@/lib/taskDue";

type TaskStatus = "todo" | "doing" | "done" | "hold";
type ScopeType = "branch" | "department" | "personal";

type Membership = {
  branch_id: string;
  department_id: string | null;
  role: "member" | "manager" | "admin";
  branches?: { name: string } | null;
};

type Task = {
  id: string;
  title: string;
  description: string | null;
  requester_id: string;
  scope_type: ScopeType;
  scope_id: string | null;
  due_at: string | null;
  status: TaskStatus;
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
  status: TaskStatus;
  note: string | null;
  planned_at: string | null;
  updated_at: string;
};

// 更新日時表示用関数
function formatDateTime(value: string | null) {
  if (!value) return "未更新";
  const d = new Date(value);
  return d.toLocaleString("ja-JP");
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

function statusLabel(status: TaskStatus) {
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

function profileLabel(profile: Profile | undefined, fallbackUserId?: string) {
  if (!profile) return fallbackUserId ?? "不明なユーザー";
  if (profile.display_name?.trim()) return profile.display_name;
  return profile.email;
}

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

  const [task, setTask] = useState<Task | null>(null);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [assigneeIds, setAssigneeIds] = useState<string[]>([]);
  const [assigneeProgressMap, setAssigneeProgressMap] = useState<
    Record<string, AssigneeProgress>
  >({});
  const [savingUserId, setSavingUserId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [hideDoneAssignees, setHideDoneAssignees] = useState(false);

  const [me, setMe] = useState<{ id: string; email: string | null } | null>(null);
  const [membership, setMembership] = useState<Membership | null>(null);
  const isManagerOrAdmin = 
    membership?.role === "manager" || membership?.role === "admin";
  const isMyTask = me ? assigneeIds.includes(me.id) : false;
  const canAccessEditPage = isManagerOrAdmin;
  const isAssignee = me ? assigneeIds.includes(me.id) : false;
  const canEditOwnProgress = isAssignee;

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

    // 0) user
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

    // ✅ ログインユーザーIDはローカル変数として固定で使う
    const myUserId = userData.user.id;

    // stateにも保存（表示用）
    setMe({ id: myUserId, email: userData.user.email ?? null });

    // 0.5) membership（※ me?.id は使わない）
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

    setMembership((ms?.[0] ?? null) as any);

    const myBranchId = ms?.[0]?.branch_id;
    if (!myBranchId) {
      setError("branch_id を取得できませんでした");
      setLoading(false);
      return;
    }

    // A) 同一branchの memberships から user_id を取る
    const { data: memList, error: memErr } = await supabase
      .from("memberships")
      .select("user_id")
      .eq("branch_id", ms?.[0]?.branch_id)
      .order("created_at", { ascending: true });

    if (memErr) {
      setError(memErr.message);
      setLoading(false);
      return;
    }

    const branchUserIds = (memList ?? []).map((r: any) => r.user_id as string);

    try {
      // 1) task本体
      const { data: taskData, error: taskErr } = await supabase
        .from("tasks")
        .select("*")
        .eq("id", taskId)
        .single();

      if (taskErr) throw taskErr;

      setTask(taskData as Task);

      // 2) assignees
      const { data: assigneesData, error: assigneesErr } = await supabase
        .from("task_assignees")
        .select("user_id, status, note, planned_at, updated_at")
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

      // 3) profiles（候補）
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

  async function updateMyStatus(status: TaskStatus) {
    if (!task || !me) return;

    setSavingUserId(me.id);
    setError(null);

    try {
      const { error: updErr } = await supabase
        .from("task_assignees")
        .update({
          status,
          updated_at: new Date().toISOString(),
        })
        .eq("task_id", task.id)
        .eq("user_id", me.id);

      if (updErr) throw updErr;

      setAssigneeProgressMap((prev) => ({
        ...prev,
        [me.id]: {
          ...(prev[me.id] ?? {
            user_id: me.id,
            note: "",
            updated_at: new Date().toISOString(),
          }),
          status,
          updated_at: new Date().toISOString(),
        },
      }));
    } catch (e: any) {
      setError(e?.message ?? "進捗更新に失敗しました");
    } finally {
      setSavingUserId(null);
    }
  }

  async function updateMyNote(note: string) {
    if (!task || !me) return;

    setSavingUserId(me.id);
    setError(null);

    try {
      const nextNote = note.trim() ? note : null;

      const { error: updErr } = await supabase
        .from("task_assignees")
        .update({
          note: nextNote,
          updated_at: new Date().toISOString(),
        })
        .eq("task_id", task.id)
        .eq("user_id", me.id);

      if (updErr) throw updErr;

      setAssigneeProgressMap((prev) => ({
        ...prev,
        [me.id]: {
          ...(prev[me.id] ?? {
            user_id: me.id,
            status: "todo",
            updated_at: new Date().toISOString(),
          }),
          note: nextNote,
          updated_at: new Date().toISOString(),
        },
      }));
    } catch (e: any) {
      setError(e?.message ?? "備考更新に失敗しました");
    } finally {
      setSavingUserId(null);
    }
  }

  async function updateMyPlannedAt(plannedAt: string) {
    if (!task || !me) return;

    setSavingUserId(me.id);
    setError(null);

    try {
      const nextPlannedAt = plannedAt ? new Date(plannedAt).toISOString() : null;

      const { error: updErr } = await supabase
        .from("task_assignees")
        .update({
          planned_at: nextPlannedAt,
          updated_at: new Date().toISOString(),
        })
        .eq("task_id", task.id)
        .eq("user_id", me.id);

      if (updErr) throw updErr;

      setAssigneeProgressMap((prev) => ({
        ...prev,
        [me.id]: {
          ...(prev[me.id] ?? {
            user_id: me.id,
            status: "todo",
            note: "",
            updated_at: new Date().toISOString(),
          }),
          planned_at: nextPlannedAt,
          updated_at: new Date().toISOString(),
        },
      }));
    } catch (e: any) {
      setError(e?.message ?? "実施予定日時の更新に失敗しました");
    } finally {
      setSavingUserId(null);
    }
  }

  const dueClass = dueTone(task.due_at);
  const due = getDueMeta(task.due_at);
  const visibleAssigneeIds = hideDoneAssignees
    ? assigneeIds.filter((uid) => assigneeProgressMap[uid]?.status !== "done")
    : assigneeIds;

  const sortedAssignees = [...visibleAssigneeIds].sort((a, b) => {
    if (a === me?.id) return -1;
    if (b === me?.id) return 1;
    return 0;
  });

  return (
    <div className="p-6 max-w-3xl">
      <div className="flex items-center justify-between gap-3 mb-6">
        <div>
          <h1 className="text-2xl font-bold">タスク詳細</h1>
          <div className="text-sm text-gray-500">task_id: {task.id}</div>
        </div>
        <div className="flex gap-2">
          {canAccessEditPage && (
            <Link
              href={`/tasks/${task.id}/edit`}
              className="px-4 py-2 border rounded-md"
            >
              タスクを編集する
            </Link>
          )}

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
      {canEditOwnProgress && (
        <div className="mb-4 rounded-md border border-green-200 bg-green-50 p-3 text-sm text-green-700">
          あなたはこのタスクの担当者です。このページから進捗更新が可能です。
        </div>
      )}
      <div className="border rounded-lg p-4 mb-4">
        <div className="text-xl font-semibold mb-1">{task.title}</div>

        <div className="flex flex-wrap items-center gap-3 text-sm mt-2">
          <div className={`px-2 py-1 rounded border ${dueBadgeClass(due.tone)}`}>
            {formatDue(task.due_at)}（{due.label}）
          </div>

          <div className="px-2 py-1 rounded border border-gray-200 bg-gray-50 text-gray-700">
            管轄: {scopeTypeLabel(task.scope_type)}
            {task.scope_id ? `（${task.scope_id}）` : ""}
          </div>

          <div className="flex items-center gap-2">
            <span className="text-gray-500">全体進捗</span>
            <div className="text-sm text-gray-700">
              {statusLabel(task.status)}
            </div>
          </div>
        </div>
      </div>

      {/* 説明 */}
      <div className="border rounded-lg p-4 mb-4">
        <div className="font-semibold mb-2">説明</div>
        <p className="mt-2 whitespace-pre-wrap text-sm text-gray-700">
          {task.description?.trim() ? task.description : "（未入力）"}
        </p>
      </div>

      {/* 資料 */}
      <div className="border rounded-lg p-4 mb-4">
        <div className="font-semibold mb-2">資料</div>

        {task.attachment_url ? (
          <a
            href={task.attachment_url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm text-blue-600 underline break-all"
          >
            {task.attachment_url}
          </a>
        ) : (
          <p className="text-sm text-gray-500">（未添付）</p>
        )}
      </div>

      {/* 担当者ごとの進捗 */}
      <div className="border rounded-lg p-4">
        <div className="flex items-center justify-between gap-3 mb-2">
          <div className="font-semibold">担当者ごとの進捗</div>

          <label className="flex items-center gap-2 text-sm text-gray-600">
            <input
              type="checkbox"
              checked={hideDoneAssignees}
              onChange={(e) => setHideDoneAssignees(e.target.checked)}
            />
            完了を非表示
          </label>
        </div>

        {assigneeIds.length === 0 ? (
          <div className="text-sm text-gray-500">（未割当）</div>
        ) : (
          <div className="space-y-4">
            {sortedAssignees.map((uid) => {
              const p = profiles.find((x) => x.user_id === uid);
              const label = profileLabel(p, uid);
              const progress = assigneeProgressMap[uid];
              const isMe = me?.id === uid;

              return (
                <div
                  key={uid}
                  className={`rounded-lg border p-3 ${
                    isMe
                      ? "border-2 border-green-400"
                      : "border-gray-200"
                  }`}
                >
                  <div className="flex items-center justify-between gap-3 mb-3">
                    <div className="font-medium flex items-center gap-2">
                      {label}
                      {isMe && (
                        <span className="text-xs px-2 py-0.5 rounded bg-green-600 text-white">
                          あなた
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-gray-500">
                      最終更新: {formatDateTime(progress?.updated_at ?? null)}
                    </div>
                  </div>

                  <div className="mb-3">
                    <div className="text-xs text-gray-500 mb-1">進捗</div>

                    {isMe && canEditOwnProgress ? (
                      <select
                        className="rounded-md border px-3 py-2 text-sm"
                        value={progress?.status ?? "todo"}
                        onChange={(e) => updateMyStatus(e.target.value as TaskStatus)}
                        disabled={savingUserId === uid}
                      >
                        <option value="todo">未着手</option>
                        <option value="doing">進行中</option>
                        <option value="hold">保留</option>
                        <option value="done">完了</option>
                      </select>
                    ) : (
                      <div className="text-sm text-gray-700">
                        {statusLabel(progress?.status ?? "todo")}
                      </div>
                    )}
                  </div>

                  {isMe && canEditOwnProgress && (
                    <div className="mb-3">
                      <div className="text-xs text-gray-500 mb-1">実施予定日時（この項目はあなたにだけ表示されます）</div>
                      <div className="space-y-2">
                        <input
                          type="datetime-local"
                          className="rounded-md border px-3 py-2 text-sm"
                          value={
                            progress?.planned_at
                              ? new Date(progress.planned_at).toISOString().slice(0, 16)
                              : ""
                          }
                          onChange={(e) => updateMyPlannedAt(e.target.value)}
                          disabled={savingUserId === uid}
                        />
                      </div>
                    </div>
                  )}

                  <div>
                    <div className="text-xs text-gray-500 mb-1">備考</div>

                    {isMe && canEditOwnProgress ? (
                      <div className="space-y-2">
                        <textarea
                          className="w-full rounded-md border px-3 py-2 text-sm"
                          rows={3}
                          value={progress?.note ?? ""}
                          onChange={(e) =>
                            setAssigneeProgressMap((prev) => ({
                              ...prev,
                              [uid]: {
                                ...(prev[uid] ?? {
                                  user_id: uid,
                                  status: "todo",
                                  updated_at: new Date().toISOString(),
                                }),
                                note: e.target.value,
                              },
                            }))
                          }
                        />
                        <button
                          className="rounded-md border px-3 py-2 text-sm"
                          onClick={() => updateMyNote(progress?.note ?? "")}
                          disabled={savingUserId === uid}
                        >
                          {savingUserId === uid ? "保存中..." : "備考を保存"}
                        </button>
                      </div>
                    ) : (
                      <div className="text-sm text-gray-700 whitespace-pre-wrap">
                        {progress?.note?.trim() ? progress.note : "（未入力）"}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}