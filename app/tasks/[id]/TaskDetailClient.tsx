"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { getDueMeta, dueBadgeClass, formatDue } from "@/lib/taskDue";

const supabase = createClient();

import { buildScopeBadgeLabel } from "@/lib/tasks/taskList";
import { 
  fetchDepartments,
  type Dept 
} from "@/lib/tasks/taskQueries";
import {
  profileLabel,
  profileLabelWithEmail,
  buildProfileMap,
} from "@/lib/tasks/taskUsers"
import {
  statusLabel,
  assigneeStatusPriority,
  formatDateTime,
} from "@/lib/tasks/taskProgress"
import { sortAssigneeIds, type AssigneeSortType } from "@/lib/tasks/taskAssignees";

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
  project_id: string | null;
  projects?: {
    id: string;
    name: string;
  } | null;
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

function isUuid(v: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    v
  );
}

export default function TaskDetailClient() {
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
  const [assigneeSort, setAssigneeSort] = useState<AssigneeSortType>("name_asc");

  const [me, setMe] = useState<{ id: string; email: string | null } | null>(null);
  const [membership, setMembership] = useState<Membership | null>(null);
  const [departments, setDepartments] = useState<Dept[]>([]);

  const [notifyAtStart, setNotifyAtStart] = useState(false);
  const [notifyBeforeEnabled, setNotifyBeforeEnabled] = useState(true);
  const [notifyBeforeMinutes, setNotifyBeforeMinutes] = useState("30");
  const [notifyPreviousDayEnabled, setNotifyPreviousDayEnabled] = useState(false);
  const [notifyPreviousDayTime, setNotifyPreviousDayTime] = useState("09:00");

  const isManagerOrAdmin =
    membership?.role === "manager" || membership?.role === "admin";
  const isRequester = !!me && task?.requester_id === me.id;
  const canAccessEditPage = isManagerOrAdmin || isRequester;
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

    // ログインユーザーIDはローカル変数として固定で使う
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
    try {
      const nextDepartments = await fetchDepartments(supabase, myBranchId);
      setDepartments(nextDepartments);
    } catch (e: any) {
      setError(e?.message ?? "部署一覧の取得に失敗しました");
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
        .select(`
          *,
          projects (
            id,
            name
          )
        `)
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

  const assigneeCount = assigneeIds.length;
  const doneCount = assigneeIds.filter(
    (uid) => assigneeProgressMap[uid]?.status === "done"
  ).length;

  const requesterName = useMemo(() => {
    if (!task?.requester_id) return "-";

    const requester = profiles.find((p) => p.user_id === task.requester_id);
    if (!requester) return task.requester_id;

    return requester.display_name
      ? `${requester.display_name}（${requester.email}）`
      : requester.email;
  }, [task, profiles]);

  const deptNameById = useMemo(() => {
    const m = new Map<string, string>();
    for (const d of departments) {
      m.set(d.id, d.name);
    }
    return m;
  }, [departments]);
  const profileById = useMemo(() => buildProfileMap(profiles), [profiles]);

  const due = getDueMeta(task?.due_at ?? null, {
    isCompleted: assigneeCount > 0 && doneCount === assigneeCount,
  });

  const personalScopeProfile =
    task?.scope_type === "personal" && task.scope_id
      ? profileById.get(task.scope_id)
      : undefined;

  const scopeBadgeLabel = task
    ? task.scope_type === "personal"
      ? `個人: ${profileLabelWithEmail(personalScopeProfile, task.scope_id ?? undefined)}`
      : buildScopeBadgeLabel({
          scopeType: task.scope_type,
          scopeName:
            task.scope_type === "department"
              ? task.scope_id
                ? deptNameById.get(task.scope_id) ?? "-"
                : "-"
              : "",
        })
    : "";

  const sortedAssignees = sortAssigneeIds({
    assigneeIds,
    hideDoneAssignees,
    assigneeProgressMap,
    assigneeSort,
    meId: me?.id ?? null,
    profileById,
    assigneeStatusPriority,
  });

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

  function toDatetimeLocalValue(value: string | null | undefined) {
    if (!value) return "";

    const date = new Date(value);

    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    const hours = String(date.getHours()).padStart(2, "0");
    const minutes = String(date.getMinutes()).padStart(2, "0");

    return `${year}-${month}-${day}T${hours}:${minutes}`;
  }

  return (
    <div className="max-w-3xl p-4 sm:p-6">
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold">タスク詳細</h1>
          <div className="break-all text-sm text-gray-500">task_id: {task.id}</div>
        </div>

        <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:flex-wrap sm:justify-end">
          {canAccessEditPage && (
            <Link
              href={`/tasks/${task.id}/edit`}
              className="w-full rounded-md border px-4 py-2 text-center sm:w-auto"
            >
              タスクを編集する
            </Link>
          )}

          <button
            onClick={() => router.back()}
            className="w-full rounded-md border px-4 py-2 text-center sm:w-auto"
          >
            戻る
          </button>

          <Link
            href="/dashboard"
            className="w-full rounded-md border px-4 py-2 text-center sm:w-auto"
          >
            ホームへ
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
        <div className="mb-4 rounded-md border border-orange-200 bg-orange-50 p-3 text-sm text-orange-700">
          あなたはこのタスクの担当者です。このページから進捗更新が可能です。
        </div>
      )}
      <div className="border rounded-lg p-4 mb-4">
        <div className="text-xl font-semibold mb-1">{task.title}</div>

        <div className="mt-2 space-y-2 text-sm">
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold text-gray-900">
                期限: {formatDue(task.due_at)}
              </span>

              <span
                className={`px-2 py-0.5 rounded border text-xs ${dueBadgeClass(
                  due.tone
                )}`}
              >
                {due.label}
              </span>

              {due.remainingLabel && (
                <span className="text-sm font-semibold text-orange-700">
                  {due.remainingLabel}
                </span>
              )}
            </div>

            <div className="px-2 py-0.5 rounded border border-gray-200 bg-gray-50 text-xs text-gray-700">
              管轄: {scopeBadgeLabel}
            </div>

            {task.projects && (
              <Link
                href={`/projects/${task.projects.id}`}
                className="inline-flex items-center px-2 py-0.5 rounded border border-blue-200 bg-blue-50 text-xs text-blue-700"
              >
                {task.projects.name}
              </Link>
            )}
          </div>

          <div className="flex items-center gap-2">
            <span className="text-gray-500">依頼者:</span>
            <p className="text-sm text-gray-700">{requesterName}</p>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-gray-500">全体進捗:</span>
            <div className="text-sm text-gray-700">
              {doneCount} / {assigneeCount}
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
        <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="font-semibold">担当者ごとの進捗</div>

          <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
            <div>
              <label className="block text-xs text-gray-500">並び替え</label>
              <select
                className="mt-1 rounded-md border px-2 py-2 text-sm"
                value={assigneeSort}
                onChange={(e) =>
                  setAssigneeSort(
                    e.target.value as "name_asc" | "updated_desc" | "status_priority"
                  )
                }
              >
                <option value="name_asc">名前順</option>
                <option value="updated_desc">最終更新日順</option>
                <option value="status_priority">完了→進行中→未着手→保留</option>
              </select>
            </div>

            <label className="flex items-center gap-2 text-sm text-gray-600 sm:pt-5">
              <input
                type="checkbox"
                checked={hideDoneAssignees}
                onChange={(e) => setHideDoneAssignees(e.target.checked)}
              />
              完了を非表示
            </label>
          </div>
        </div>

        {assigneeIds.length === 0 ? (
          <div className="text-sm text-gray-500">（未割当）</div>
        ) : (
          <div className="space-y-4">
            {sortedAssignees.map((uid) => {
              const p = profileById.get(uid);
              const label = profileLabel(p, uid);
              const progress = assigneeProgressMap[uid];
              const isMe = me?.id === uid;

              return (
                <div
                  key={uid}
                  className={`rounded-lg border p-3 ${
                    isMe
                      ? "border-2 border-orange-400"
                      : "border-gray-200"
                  }`}
                >
                  <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex min-w-0 flex-wrap items-center gap-2 font-medium">
                      <span className="break-words">{label}</span>
                      {isMe && (
                        <span className="rounded bg-orange-500 px-2 py-0.5 text-xs text-white">
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

                  <div>
                    <div className="text-xs text-gray-500 mb-1">備考</div>

                    {isMe && canEditOwnProgress ? (
                      <div className="space-y-2">
                        <textarea
                          className="w-full rounded-md border px-3 py-2 text-sm"
                          rows={3}
                          placeholder="報告事項、進捗に関する補足など"
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
                          className="w-full rounded-md border px-3 py-2 text-sm sm:w-auto"
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

                  {isMe && canEditOwnProgress && (
                    <div className="mt-4 space-y-3">
                      <p className="text-xs text-gray-500">
                        *以下２項目はあなたにだけ表示されます
                      </p>

                      <div className="grid grid-cols-1 gap-4 sm:grid-cols-[260px_minmax(0,1fr)] sm:gap-6">
                        <div>
                          <div className="mb-1 text-xs text-gray-500">実施予定日時</div>
                          <input
                            type="datetime-local"
                            className="w-full rounded-md border px-3 py-2 text-sm"
                            value={toDatetimeLocalValue(progress?.planned_at)}
                            onChange={(e) => updateMyPlannedAt(e.target.value)}
                            disabled={savingUserId === uid}
                          />
                        </div>

                        <div className="min-w-0">
                          <div className="mb-1 text-xs text-gray-500">通知タイミング</div>

                          <div className="flex flex-col gap-3 text-sm">
                            <label className="flex items-center gap-2">
                              <input
                                type="checkbox"
                                checked={notifyAtStart}
                                onChange={(e) => setNotifyAtStart(e.target.checked)}
                              />
                              <span>実施予定時刻</span>
                            </label>

                            <label className="flex flex-wrap items-center gap-2">
                              <input
                                type="checkbox"
                                checked={notifyBeforeEnabled}
                                onChange={(e) => setNotifyBeforeEnabled(e.target.checked)}
                              />
                              <span>実施予定</span>
                              <input
                                type="number"
                                min={1}
                                className="w-20 rounded-md border px-2 py-1"
                                value={notifyBeforeMinutes}
                                onChange={(e) => setNotifyBeforeMinutes(e.target.value)}
                                disabled={!notifyBeforeEnabled}
                              />
                              <span>分前</span>
                            </label>

                            <label className="flex flex-wrap items-center gap-2">
                              <input
                                type="checkbox"
                                checked={notifyPreviousDayEnabled}
                                onChange={(e) => setNotifyPreviousDayEnabled(e.target.checked)}
                              />
                              <span>実施前日</span>
                              <input
                                type="time"
                                className="rounded-md border px-2 py-1"
                                value={notifyPreviousDayTime}
                                onChange={(e) => setNotifyPreviousDayTime(e.target.value)}
                                disabled={!notifyPreviousDayEnabled}
                              />
                            </label>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}