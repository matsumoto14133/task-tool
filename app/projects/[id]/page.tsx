"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase/client";
import {
  getDueMeta,
  dueBadgeClass,
  dueCardBorderClass,
  formatDue,
} from "@/lib/taskDue";
import {
  buildUserDisplayLabel,
  buildScopeBadgeLabel,
  buildTaskListItems,
  buildTaskProgressMap,
  type TaskAssigneeRow,
  type TaskListItem,
  type TaskRow,
} from "@/lib/tasks/taskList";
import type { Dept } from "@/lib/tasks/taskQueries";
import {
  fetchMyMembership,
  fetchBranchUsers,
  fetchDepartments,
  fetchTaskAssignees,
} from "@/lib/tasks/taskQueries";
import { sortTaskListItems, type TaskListSortKey } from "@/lib/taskSort";

type ProjectRow = {
  id: string;
  branch_id: string;
  name: string;
  description: string | null;
  schedule: string | null;
  attachment_url: string | null;
  requester_id: string;
  created_at: string;
  updated_at: string;
};

type ProjectScheduleItem = {
  eventName: string;
  date: string;
};

type Membership = {
  branch_id: string;
  role: "member" | "manager" | "admin";
  branches?: { name: string } | { name: string }[] | null;
};

type BranchUser = {
  user_id: string;
  email: string;
  display_name: string | null;
};

function branchNameOf(m: Membership | null) {
  if (!m) return "-";
  const b: any = (m as any).branches;
  if (!b) return "-";
  if (Array.isArray(b)) return b?.[0]?.name ?? "-";
  return b?.name ?? "-";
}

function isValidScheduleItem(value: unknown): value is ProjectScheduleItem {
  if (!value || typeof value !== "object") return false;

  const item = value as Record<string, unknown>;

  return (
    typeof item.eventName === "string" &&
    typeof item.date === "string"
  );
}

export default function ProjectDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const projectId = params?.id;

  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [project, setProject] = useState<ProjectRow | null>(null);

  const [membership, setMembership] = useState<Membership | null>(null);
  const [tasks, setTasks] = useState<TaskRow[]>([]);
  const [departments, setDepartments] = useState<Dept[]>([]);
  const [branchUsers, setBranchUsers] = useState<BranchUser[]>([]);
  const [assigneesByTask, setAssigneesByTask] = useState<Record<string, TaskAssigneeRow[]>>({});

  const [showDone, setShowDone] = useState(false);
  const [sortKey, setSortKey] = useState<TaskListSortKey>("requested_desc");
  const [me, setMe] = useState<{ id: string; email: string | null } | null>(null);

  useEffect(() => {
    const loadProject = async () => {
      if (!projectId) {
        setErrorMsg("プロジェクトIDが不正です。");
        setLoading(false);
        return;
      }

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

      setMe({
        id: userData.user.id,
        email: userData.user.email ?? null,
      });

      // 2) membership
      const myMembership = (await fetchMyMembership(supabase, userData.user.id)) as Membership | null;

      if (!myMembership) {
        setErrorMsg("memberships が未登録です（管理者に登録してください）");
        setLoading(false);
        return;
      }

      setMembership(myMembership);

      // 3) project
      const { data, error } = await supabase
        .from("projects")
        .select(`
          id,
          branch_id,
          name,
          description,
          schedule,
          attachment_url,
          requester_id,
          created_at,
          updated_at
        `)
        .eq("id", projectId)
        .single();

      if (error) {
        setErrorMsg(error.message);
        setLoading(false);
        return;
      }

      setProject(data as ProjectRow);

      // 4) branch users / departments
      const [users, deptList] = await Promise.all([
        fetchBranchUsers(supabase, myMembership.branch_id),
        fetchDepartments(supabase, myMembership.branch_id),
      ]);

      setBranchUsers(users);
      setDepartments(deptList);

      // 5) project tasks
      const { data: projectTasks, error: projectTasksErr } = await supabase
        .from("tasks")
        .select(`
          id,
          title,
          description,
          requester_id,
          scope_type,
          scope_id,
          due_at,
          status,
          created_at,
          updated_at,
          project_id,
          projects (
            id,
            name
          )
        `)
        .eq("project_id", projectId)
        .order("created_at", { ascending: false });

      if (projectTasksErr) {
        setErrorMsg(projectTasksErr.message);
        setLoading(false);
        return;
      }

      const normalizedTasks: TaskRow[] = (projectTasks ?? []).map((t: any) => ({
        ...t,
        projects: Array.isArray(t.projects) ? (t.projects[0] ?? null) : t.projects ?? null,
      }));
      setTasks(normalizedTasks);

      // 6) assignees
      const taskIds = normalizedTasks.map((t) => t.id);
      const assigneeMap = await fetchTaskAssignees(supabase, taskIds);
      setAssigneesByTask(assigneeMap);

      setLoading(false);
    };

    loadProject();
  }, [projectId, router]);

  const schedules = useMemo(() => {
    if (!project?.schedule) return [];

    try {
      const parsed = JSON.parse(project.schedule);

      if (!Array.isArray(parsed)) return [];

      return parsed
        .filter(isValidScheduleItem)
        .sort((a, b) => a.date.localeCompare(b.date));
    } catch {
      return [];
    }
  }, [project]);

  const deptNameById = useMemo(() => {
    const m = new Map<string, string>();
    for (const d of departments) m.set(d.id, d.name);
    return m;
  }, [departments]);

  const userNameById = useMemo(() => {
    const m = new Map<string, string>();
    for (const u of branchUsers) {
      const label = buildUserDisplayLabel({
        displayName: u.display_name,
        email: u.email,
      });
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

  const requesterName = useMemo(() => {
    if (!project) return "-";

    const user = branchUsers.find((u) => u.user_id === project.requester_id);
    if (!user) return project.requester_id;

    return user.display_name
      ? `${user.display_name}（${user.email}）`
      : user.email;
  }, [project, branchUsers]);

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

  const visibleTaskListItems = useMemo(() => {
    let list = [...taskListItems];

    if (!showDone) {
      list = list.filter((t) => !t.progress.isCompleted);
    }

    list = sortTaskListItems(list, sortKey);

    return list;
  }, [taskListItems, showDone, sortKey]);

  const progressSummary = useMemo(() => {
    const now = Date.now();

    let completedCount = 0;
    let requestingCount = 0;
    let delayedCount = 0;

    for (const t of taskListItems) {
      const isCompleted = t.progress.isCompleted;
      const isDelayed =
        !isCompleted &&
        !!t.dueAt &&
        new Date(t.dueAt).getTime() < now;

      if (isCompleted) {
        completedCount += 1;
      } else if (isDelayed) {
        delayedCount += 1;
      } else {
        requestingCount += 1;
      }
    }

    return {
      completedCount,
      requestingCount,
      delayedCount,
    };
  }, [taskListItems]);

  const canEditProject = useMemo(() => {
    if (!project || !membership || !me) return false;

    return (
      project.requester_id === me.id ||
      membership.role === "manager" ||
      membership.role === "admin"
    );
  }, [project, membership, me]);

  const onBack = () => {
    router.back();
  };

  return (
    <main className="p-6">
      <div className="max-w-3xl">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold">プロジェクト詳細</h1>
          </div>

          <div className="flex flex-wrap gap-2">
            {project && canEditProject && (
              <Link
                href={`/projects/${project.id}/edit`}
                className="rounded-md border px-3 py-2"
              >
                プロジェクトを編集する
              </Link>
            )}

            <button
              type="button"
              className="rounded-md border px-3 py-2"
              onClick={onBack}
            >
              戻る
            </button>

            <Link
              href="/dashboard"
              className="rounded-md border px-3 py-2"
            >
              ホームへ
            </Link>
          </div>
        </div>

        {loading && <p className="mt-6 text-sm">読み込み中...</p>}
        {errorMsg && <p className="mt-6 text-sm text-red-600">❌ {errorMsg}</p>}

        {!loading && !errorMsg && project && (
          <div className="mt-6 space-y-6">
            <div className="border rounded-lg p-4 mb-4">
              <div className="text-xl font-semibold mb-1">{project.name}</div>

              <div className="mt-2 space-y-2 text-sm">
                <div className="flex items-center gap-2">
                  <span className="text-gray-500">プロジェクト作成者:</span>
                  <span className="text-gray-700">{requesterName}</span>
                </div>

                <div className="flex items-center gap-2">
                  <span className="text-gray-500">全体進捗:</span>
                  <div className="text-sm text-gray-700">
                    完了済 {progressSummary.completedCount}件・依頼中 {progressSummary.requestingCount}件・遅延中 {progressSummary.delayedCount}件
                  </div>
                </div>

                <div className="text-sm text-gray-500 break-all">
                  project_id: {project.id}
                </div>
              </div>
            </div>

            <div className="border rounded-lg p-4 mb-4">
              <div className="flex items-center justify-between mb-3">
                <h2 className="mb2 font-semibold">スケジュール</h2>
                <Link
                  href={`/calendar?mode=project&project=${project.id}`}
                  className="rounded-md border px-3 py-2 text-sm"
                >
                  カレンダーで見る
                </Link>
              </div>

              {schedules.length === 0 ? (
                <p className="text-sm text-gray-500">（未入力）</p>
              ) : (
                <div className="space-y-3">
                  {schedules.map((item, index) => (
                    <div
                      key={`${item.eventName}-${item.date}-${index}`}
                      className="border rounded-lg px-4 py-2"
                    >
                      <span className="text-lg text-gray-900 leading-tight">
                        {item.date}：
                        {item.eventName}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="border rounded-lg p-4 mb-4">
              <div className="font-semibold mb-2">説明</div>
              <p className="mt-2 whitespace-pre-wrap text-sm text-gray-700">
                {project.description?.trim() ? project.description : "（未入力）"}
              </p>
            </div>

            <div className="border rounded-lg p-4 mb-4">
              <div className="font-semibold mb-2">資料</div>

              {project.attachment_url ? (
                <a
                  href={project.attachment_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-blue-600 underline break-all"
                >
                  {project.attachment_url}
                </a>
              ) : (
                <p className="text-sm text-gray-500">（未添付）</p>
              )}
            </div>

            <section className="rounded-xl border p-4">
              <div className="text-lg font-semibold">このプロジェクトのタスク一覧</div>

              <div className="mt-4 flex flex-wrap items-end gap-3">
                <div>
                  <label className="block text-xs text-gray-500">表示</label>
                  <label className="mt-2 flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={showDone}
                      onChange={(e) => setShowDone(e.target.checked)}
                    />
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
              </div>

              {visibleTaskListItems.length === 0 ? (
                <p className="mt-4 text-sm text-gray-600">
                  このプロジェクトに紐づくタスクはありません。
                </p>
              ) : (
                <ul className="mt-4 space-y-3">
                  {visibleTaskListItems.map((t) => {
                    const due = getDueMeta(t.dueAt, { isCompleted: t.progress.isCompleted });

                    return (
                      <li
                        key={t.id}
                        className={`rounded-xl border p-4 ${dueCardBorderClass(due.tone)}`}
                      >
                        <div className="flex items-start justify-between gap-4">
                          <div className="min-w-0">
                            <div className="flex min-w-0 items-center gap-2">
                              <Link
                                href={`/tasks/${t.id}`}
                                className="min-w-0 truncate text-lg font-semibold underline"
                                title={t.title}
                              >
                                {t.title}
                              </Link>

                              <span className="shrink-0 rounded border px-2 py-0.5 text-xs text-gray-600">
                                {buildScopeBadgeLabel({
                                  scopeType: t.scopeType,
                                  scopeName: t.scopeName,
                                })}
                              </span>

                              {t.projectId && t.projectName && (
                                <Link
                                  href={`/projects/${t.projectId}`}
                                  className="inline-flex rounded border border-blue-200 bg-blue-50 px-2 py-0.5 text-xs text-blue-700"
                                >
                                  {t.projectName}
                                </Link>
                              )}

                              <span
                                className={`shrink-0 rounded border px-2 py-1 text-xs ${dueBadgeClass(
                                  due.tone
                                )}`}
                              >
                                {due.label}
                              </span>

                              {due.remainingLabel && (
                                <span className="shrink-0 text-sm font-semibold text-orange-700">
                                  {due.remainingLabel}
                                </span>
                              )}
                            </div>

                            {t.description && (
                              <p className="mt-1 whitespace-pre-wrap text-sm text-gray-600">
                                {t.description}
                              </p>
                            )}

                            <div className="mt-2 text-xs text-gray-600">
                              依頼者: {t.requesterName}
                            </div>

                            <div className="mt-1 text-xs text-gray-600">
                              担当: {t.assigneePreview}
                            </div>
                          </div>

                          <div className="shrink-0 text-right text-sm">
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
          </div>
        )}
      </div>
    </main>
  );
}