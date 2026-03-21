"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase/client";
import { getDueMeta, dueBadgeClass, formatDue } from "@/lib/taskDue";
import { buildScopeBadgeLabel } from "@/lib/tasks/taskList";
import { fetchDepartments, type Dept } from "@/lib/tasks/taskQueries";
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
import {
  buildInsertedAssigneeRows,
  buildUpdatedAssigneePayload,
  computeAllBranchAssigned,
  computeAllDepartmentAssigned,
  getDepartmentUserIds,
  hasAssigneeProgressChanged,
  mergeDepartmentAssignees,
  replaceAssigneesWithAllBranch,
  sortAssigneeIds,
  toggleAssigneeId,
  type AssigneeSortType,
} from "@/lib/tasks/taskAssignees";

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
  status: "todo" | "doing" | "done" | "hold";
  note: string | null;
  planned_at: string | null;
  updated_at: string;
};

type DepartmentMemberRow = {
  user_id: string;
  department_id: string;
};

type Project = {
  id: string;
  name: string;
};

function isUuid(v: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    v
  );
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
  const [me, setMe] = useState<{ id: string; email: string | null } | null>(null);
  const [departments, setDepartments] = useState<Dept[]>([]);
  const [departmentMembers, setDepartmentMembers] = useState<DepartmentMemberRow[]>([]);

  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [assigneeIds, setAssigneeIds] = useState<string[]>([]);
  const [assigneeProgressMap, setAssigneeProgressMap] = useState<
    Record<string, AssigneeProgress>
  >({});
  const [initialAssigneeProgressMap, setInitialAssigneeProgressMap] = useState<
    Record<string, AssigneeProgress>
  >({});
  const [assignAllBranch, setAssignAllBranch] = useState(false);
  const [assignAllDepartment, setAssignAllDepartment] = useState(false);
  const [scopeTypeDraft, setScopeTypeDraft] = useState<ScopeType>("branch");
  const [scopeIdDraft, setScopeIdDraft] = useState("");
  const [hideDoneAssignees, setHideDoneAssignees] = useState(false);
  const [assigneeSort, setAssigneeSort] = useState<AssigneeSortType>("name_asc");

  const [descriptionDraft, setDescriptionDraft] = useState("");
  const [dueDraft, setDueDraft] = useState("");
  const [attachmentUrlDraft, setAttachmentUrlDraft] = useState("");

  const [projects, setProjects] = useState<Project[]>([]);
  const [projectSelection, setProjectSelection] = useState("");

  const canEditTask =
    !!task &&
    !!me &&
    (
      task.requester_id === me.id ||
      membership?.role === "manager" ||
      membership?.role === "admin"
    );

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
    setMe({ id: myUserId, email: userData.user.email ?? null });

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

    if (!currentMembership) {
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

    try {
      const nextDepartments = await fetchDepartments(supabase, myBranchId);
      setDepartments(nextDepartments);
    } catch (e: any) {
      setError(e?.message ?? "部署一覧の取得に失敗しました");
      setLoading(false);
      return;
    }

    const { data: projectList, error: projectErr } = await supabase
      .from("projects")
      .select("id, name")
      .eq("branch_id", myBranchId)
      .order("created_at", { ascending: true });

    if (projectErr) {
      setError(projectErr.message);
      setLoading(false);
      return;
    }

    setProjects((projectList ?? []) as Project[]);

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
    const { data: departmentMemberRows, error: departmentMemberErr } = await supabase
      .from("membership_departments")
      .select("user_id, department_id")
      .eq("branch_id", myBranchId);

    if (departmentMemberErr) {
      setError(departmentMemberErr.message);
      setLoading(false);
      return;
    }

    setDepartmentMembers((departmentMemberRows ?? []) as DepartmentMemberRow[]);
  
    try {
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
      setDescriptionDraft((taskData as Task).description ?? "");

      const canEdit =
        (taskData as Task).requester_id === myUserId ||
        currentMembership.role === "manager" ||
        currentMembership.role === "admin";

      if (!canEdit) {
        setError("このページにアクセスする権限がありません");
        setLoading(false);
        return;
      }

      const due = (taskData as Task).due_at;
      setDueDraft(due ? new Date(due).toISOString().slice(0, 16) : "");
      setAttachmentUrlDraft((taskData as Task).attachment_url ?? "");
      setScopeTypeDraft((taskData as Task).scope_type);
      setScopeIdDraft((taskData as Task).scope_id ?? "");
      setProjectSelection((taskData as Task).project_id ?? "");

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
      setInitialAssigneeProgressMap(nextMap);

      const { data: profilesData, error: profilesErr } = await supabase
        .from("profiles")
        .select("user_id,email,display_name")
        .in("user_id", branchUserIds)
        .order("created_at", { ascending: true });

      if (profilesErr) throw profilesErr;

      const nextProfiles = (profilesData ?? []) as Profile[];
      setProfiles(nextProfiles);

      setAssignAllBranch(computeAllBranchAssigned(nextProfiles, ids));

      if ((taskData as Task).scope_type === "department" && (taskData as Task).scope_id) {
        const departmentUserIds = getDepartmentUserIds(
          (departmentMemberRows ?? []) as DepartmentMemberRow[],
          (taskData as Task).scope_id as string
        );

        setAssignAllDepartment(computeAllDepartmentAssigned(departmentUserIds, ids));
      } else {
        setAssignAllDepartment(false);
      }
    } catch (e: any) {
      setError(e?.message ?? "読み込みに失敗しました");
    } finally {
      setLoading(false);
    }
  }

  function toggleAssignee(userId: string) {
    setAssigneeIds((prev) => {
      const next = toggleAssigneeId(prev, userId);

      setAssignAllBranch(computeAllBranchAssigned(profiles, next));

      if (scopeTypeDraft === "department" && scopeIdDraft) {
        const departmentUserIds = getDepartmentUserIds(departmentMembers, scopeIdDraft);
        setAssignAllDepartment(computeAllDepartmentAssigned(departmentUserIds, next));
      } else {
        setAssignAllDepartment(false);
      }

      return next;
    });
  }

  function toggleAssignAllBranch(checked: boolean) {
    setAssignAllBranch(checked);
    setAssigneeIds(replaceAssigneesWithAllBranch(profiles, checked));

    if (scopeTypeDraft === "department" && scopeIdDraft) {
      const nextIds = replaceAssigneesWithAllBranch(profiles, checked);
      const departmentUserIds = getDepartmentUserIds(departmentMembers, scopeIdDraft);
      setAssignAllDepartment(computeAllDepartmentAssigned(departmentUserIds, nextIds));
    } else {
      setAssignAllDepartment(false);
    }
  }

  function toggleAssignAllDepartment(checked: boolean) {
    setAssignAllDepartment(checked);

    if (!scopeIdDraft || scopeTypeDraft !== "department") {
      return;
    }

    const departmentUserIds = getDepartmentUserIds(departmentMembers, scopeIdDraft);

    setAssigneeIds((prev) => {
      const next = mergeDepartmentAssignees(prev, departmentUserIds, checked);
      setAssignAllBranch(computeAllBranchAssigned(profiles, next));
      return next;
    });
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
          planned_at: null,
          updated_at: "",
        }),
        note,
      },
    }));
  }

  function updateAssigneePlannedAt(userId: string, plannedAt: string) {
    setAssigneeProgressMap((prev) => ({
      ...prev,
      [userId]: {
        ...(prev[userId] ?? {
          user_id: userId,
          status: "todo",
          note: "",
          updated_at: "",
        }),
        planned_at: plannedAt ? new Date(plannedAt).toISOString() : null,
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

  async function saveProject() {
    if (!task) return;

    setSaving(true);
    setError(null);

    try {
      const nextProjectId = projectSelection || null;

      const { error: updErr } = await supabase
        .from("tasks")
        .update({ project_id: nextProjectId })
        .eq("id", task.id);

      if (updErr) throw updErr;

      const selectedProject =
        nextProjectId == null
          ? null
          : projects.find((p) => p.id === nextProjectId) ?? null;

      setTask({
        ...task,
        project_id: nextProjectId,
        projects: selectedProject
          ? { id: selectedProject.id, name: selectedProject.name }
          : null,
      });
    } catch (e: any) {
      setError(e?.message ?? "登録プロジェクトの保存に失敗しました");
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

  async function saveScope() {
    if (!task) return;

    setSaving(true);
    setError(null);

    try {
      let nextScopeId: string | null = null;

      if (scopeTypeDraft === "department") {
        if (!scopeIdDraft) {
          setError("部署を選択してください");
          setSaving(false);
          return;
        }
        nextScopeId = scopeIdDraft;
      }

      if (scopeTypeDraft === "personal") {
        if (!scopeIdDraft) {
          setError("対象者を選択してください");
          setSaving(false);
          return;
        }
        nextScopeId = scopeIdDraft;
      }

      const { error: updErr } = await supabase
        .from("tasks")
        .update({
          scope_type: scopeTypeDraft,
          scope_id: nextScopeId,
        })
        .eq("id", task.id);

      if (updErr) throw updErr;

      setTask({
        ...task,
        scope_type: scopeTypeDraft,
        scope_id: nextScopeId,
      });

      if (scopeTypeDraft !== "department") {
        setAssignAllDepartment(false);
      }
    } catch (e: any) {
      setError(e?.message ?? "管轄の保存に失敗しました");
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
        const rows = buildInsertedAssigneeRows({
          taskId: task.id,
          userIds: toInsert,
          progressMap: assigneeProgressMap,
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
        const initial = initialAssigneeProgressMap[userId];

        if (!hasAssigneeProgressChanged(initial, progress)) continue;

        const nowIso = new Date().toISOString();
        const payload = buildUpdatedAssigneePayload(progress, nowIso);

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

  async function deleteTask() {
    if (!task) return;

    const confirmed = window.confirm(
      "このタスクを削除しますか？担当者の進捗情報も削除され、元に戻せません。"
    );

    if (!confirmed) return;

    setSaving(true);
    setError(null);

    try {
      // ① assignees削除
      const { error: assigneeErr } = await supabase
        .from("task_assignees")
        .delete()
        .eq("task_id", task.id);

      if (assigneeErr) throw assigneeErr;

      // ② task削除
      const { error: taskErr } = await supabase
        .from("tasks")
        .delete()
        .eq("id", task.id);

      if (taskErr) throw taskErr;

      router.replace("/tasks");
    } catch (e: any) {
      setError(e?.message ?? "タスクの削除に失敗しました");
    } finally {
      setSaving(false);
    }
  }

  const deptNameById = useMemo(() => {
    const m = new Map<string, string>();
    for (const d of departments) {
      m.set(d.id, d.name);
    }
    return m;
  }, [departments]);
  const profileById = useMemo(() => buildProfileMap(profiles), [profiles]);

  const assigneeCount = assigneeIds.length;
  const doneCount = assigneeIds.filter(
    (uid) => assigneeProgressMap[uid]?.status === "done"
  ).length;

  const due = getDueMeta(task?.due_at ?? null, {
    isCompleted: assigneeCount > 0 && doneCount === assigneeCount,
  });

  const personalScopeProfile =
    task?.scope_type === "personal" && task.scope_id
      ? profiles.find((p) => p.user_id === task.scope_id)
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

  const sortedAssigneeIds = sortAssigneeIds({
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

  if (!task || !canEditTask) {
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
            タスク詳細へ戻る
          </Link>
        </div>
      </div>

      {error && (
        <div className="mb-4 p-3 rounded-md border border-red-200 bg-red-50 text-red-700 text-sm">
          {error}
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
            <span className="text-gray-500">全体進捗:</span>
            <div className="text-sm text-gray-700">
              {doneCount} / {assigneeCount}
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
          placeholder="目的、実施手順など"
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
        <div className="font-semibold mb-2">管轄を編集</div>

        <div className="space-y-3">
          <div>
            <label className="block text-xs text-gray-500 mb-1">管轄</label>
            <select
              className="rounded-md border px-3 py-2 text-sm"
              value={scopeTypeDraft}
              onChange={(e) => {
                const nextType = e.target.value as ScopeType;
                setScopeTypeDraft(nextType);
                setScopeIdDraft("");
                setAssignAllDepartment(false);
              }}
            >
              <option value="branch">支部</option>
              <option value="department">部署</option>
              <option value="personal">個人</option>
            </select>
          </div>

          {scopeTypeDraft === "department" && (
            <div>
              <label className="block text-xs text-gray-500 mb-1">部署</label>
              <select
                className="rounded-md border px-3 py-2 text-sm"
                value={scopeIdDraft}
                onChange={(e) => setScopeIdDraft(e.target.value)}
              >
                <option value="">選択してください</option>
                {departments.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          {scopeTypeDraft === "personal" && (
            <div>
              <label className="block text-xs text-gray-500 mb-1">対象者</label>
              <select
                className="rounded-md border px-3 py-2 text-sm"
                value={scopeIdDraft}
                onChange={(e) => setScopeIdDraft(e.target.value)}
              >
                <option value="">選択してください</option>
                {profiles.map((p) => (
                  <option key={p.user_id} value={p.user_id}>
                    {profileLabelWithEmail(p, p.user_id)}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div>
            <button
              className="rounded-md border px-3 py-2 text-sm"
              onClick={saveScope}
              disabled={saving}
            >
              {saving ? "保存中..." : "管轄を保存"}
            </button>
          </div>
        </div>
      </div>

      <div className="border rounded-lg p-4 mb-4">
        <div className="font-semibold mb-2">登録プロジェクトを編集</div>

        <select
          className="w-full rounded-md border px-3 py-2 text-sm"
          value={projectSelection}
          onChange={(e) => setProjectSelection(e.target.value)}
        >
          <option value="">未選択</option>
          {projects.map((project) => (
            <option key={project.id} value={project.id}>
              {project.name}
            </option>
          ))}
        </select>

        <button
          className="mt-3 rounded-md border px-3 py-2 text-sm"
          onClick={saveProject}
          disabled={saving}
        >
          {saving ? "保存中..." : "登録プロジェクトを保存"}
        </button>
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
        {scopeTypeDraft === "department" && scopeIdDraft && (
          <div className="text-xs text-gray-500 mb-3">
            選択中の部署: {deptNameById.get(scopeIdDraft) ?? "不明な部署"}
          </div>
        )}

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

            <label
              className={`flex items-center gap-2 text-sm ${
                scopeTypeDraft === "department" && scopeIdDraft
                  ? ""
                  : "text-gray-400"
              }`}
            >
              <input
                type="checkbox"
                checked={assignAllDepartment}
                onChange={(e) => toggleAssignAllDepartment(e.target.checked)}
                disabled={!(scopeTypeDraft === "department" && scopeIdDraft)}
              />
              部署全員に割り当て
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
        <div className="flex flex-wrap items-center justify-between gap-3 mb-2">
          <div className="font-semibold">担当者ごとの進捗・備考を編集</div>

          <div className="flex flex-wrap items-center gap-3">
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

            <label className="flex items-center gap-2 text-sm text-gray-600 pt-5">
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
          <div className="text-sm text-gray-500">担当者が未設定です</div>
        ) : (
          <div className="space-y-4">
            {sortedAssigneeIds.map((userId) => {
              const profile = profiles.find((p) => p.user_id === userId);
              const progress = assigneeProgressMap[userId];
              const isMe = me?.id === userId;

              return (
                <div
                  key={userId}
                  className={`rounded-lg p-3 ${
                    isMe ? "border-2 border-orange-400" : "border border-gray-200"
                  }`}
                >
                  <div className="flex items-center justify-between gap-3 mb-3">
                    <div className="font-medium flex items-center gap-2">
                      {profileLabel(profile, userId)}
                      {isMe && (
                        <span className="text-xs px-2 py-0.5 rounded bg-orange-500 text-white">
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
                      placeholder="報告事項、進捗に関する補足など"
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
      
      <div className="border rounded-lg p-4 mt-6 border-red-300 bg-red-50">
        <div className="font-semibold text-red-700 mb-2">危険な操作</div>

        <button
          className="rounded-md border border-red-500 text-red-700 px-4 py-2"
          onClick={deleteTask}
          disabled={saving}
        >
          {saving ? "削除中..." : "このタスクを削除"}
        </button>
      </div>
    </div>
  );
}