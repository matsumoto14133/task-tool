"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
const supabase = createClient();

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

type MembershipDepartment = {
  user_id: string;
  branch_id: string;
  department_id: string;
};

type AssigneeCandidate = {
  user_id: string;
  email: string;
  display_name: string | null;
};

type Project = {
  id: string;
  name: string;
};

type ProjectScheduleItem = {
  eventName: string;
  date: string;
};

function candidateLabel(candidate: AssigneeCandidate) {
  if (candidate.display_name?.trim()) return candidate.display_name;
  return candidate.email;
}

export default function NewTaskPage() {
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [me, setMe] = useState<{ id: string; email: string | null } | null>(null);

  // form state
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [attachmentUrl, setAttachmentUrl] = useState("");
  const [dueAt, setDueAt] = useState(""); // datetime-local
  const [scopeType, setScopeType] = useState<ScopeType>("branch");
  const [assigneeIds, setAssigneeIds] = useState<string[]>([]);
  const [selectedDepartmentId, setSelectedDepartmentId] = useState("");
  const [projects, setProjects] = useState<Project[]>([]);
  const [projectSelection, setProjectSelection] = useState("");
  const [newProjectName, setNewProjectName] = useState("");
  const [newProjectDescription, setNewProjectDescription] = useState("");
  const [newProjectAttachmentUrl, setNewProjectAttachmentUrl] = useState("");
  const [newProjectSchedules, setNewProjectSchedules] = useState<ProjectScheduleItem[]>([
    { eventName: "", date: "" },
  ]);

  // メンバーシップ関連
  const [membership, setMembership] = useState<Membership | null>(null);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [membershipDepartments, setMembershipDepartments] = useState<MembershipDepartment[]>([]);
  const [candidates, setCandidates] = useState<AssigneeCandidate[]>([]);

  const [assignAllBranch, setAssignAllBranch] = useState(false);
  const [assignAllDept, setAssignAllDept] = useState(false); 

  const selectedDepartmentMemberIds = useMemo(() => {
    if (scopeType !== "department" || !selectedDepartmentId) return [];

    return membershipDepartments
      .filter((item) => item.department_id === selectedDepartmentId)
      .map((item) => item.user_id);
  }, [scopeType, selectedDepartmentId, membershipDepartments]);

  const branchName =
  !membership
    ? "-"
    : Array.isArray((membership as any).branches)
    ? ((membership as any).branches?.[0]?.name ?? "-")
    : ((membership as any).branches?.name ?? "-");

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

      // 2.5) departments（同じ支部の部署一覧）
      const { data: deptList, error: deptErr } = await supabase
        .from("departments")
        .select("id, name, branch_id")
        .eq("branch_id", myMembership.branch_id)
        .order("created_at", { ascending: true });

      if (deptErr) {
        setErrorMsg(deptErr.message);
        setLoading(false);
        return;
      }

      setDepartments((deptList ?? []) as Department[]);

      // 2.55) projects（同じ支部のプロジェクト一覧）
      const { data: projectList, error: projectErr } = await supabase
        .from("projects")
        .select("id, name")
        .eq("branch_id", myMembership.branch_id)
        .order("created_at", { ascending: true });

      if (projectErr) {
        setErrorMsg(projectErr.message);
        setLoading(false);
        return;
      }

      setProjects((projectList ?? []) as Project[]);

      // 2.6) membership_departments（支部内の部署所属）
      const { data: mdList, error: mdErr } = await supabase
        .from("membership_departments")
        .select("user_id, branch_id, department_id")
        .eq("branch_id", myMembership.branch_id);

      if (mdErr) {
        setErrorMsg(mdErr.message);
        setLoading(false);
        return;
      }

      setMembershipDepartments((mdList ?? []) as MembershipDepartment[]);

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

  useEffect(() => {
    if (scopeType !== "department") {
      setSelectedDepartmentId("");
    }
  }, [scopeType]);

  useEffect(() => {
    if (scopeType !== "department" || !selectedDepartmentId) {
      setAssignAllDept(false);
      return;
    }

    const allDepartmentSelected =
      selectedDepartmentMemberIds.length > 0 &&
      selectedDepartmentMemberIds.every((id) => assigneeIds.includes(id));

    setAssignAllDept(allDepartmentSelected);
  }, [scopeType, selectedDepartmentId, selectedDepartmentMemberIds, assigneeIds]);

  function toggleAssignee(userId: string) {
    setAssigneeIds((prev) => {
      const next = prev.includes(userId)
        ? prev.filter((id) => id !== userId)
        : [...prev, userId];

      const allBranchSelected =
        candidates.length > 0 &&
        candidates.every((c) => next.includes(c.user_id));

      const allDepartmentSelected =
        selectedDepartmentMemberIds.length > 0 &&
        selectedDepartmentMemberIds.every((id) => next.includes(id));

      setAssignAllBranch(allBranchSelected);
      setAssignAllDept(allDepartmentSelected);

      return next;
    });
  }

  const onToggleAllBranch = (checked: boolean) => {
    setAssignAllBranch(checked);

    if (checked) {
      const next = candidates.map((c) => c.user_id);
      setAssigneeIds(next);

      const allDepartmentSelected =
        selectedDepartmentMemberIds.length > 0 &&
        selectedDepartmentMemberIds.every((id) => next.includes(id));
      setAssignAllDept(allDepartmentSelected);
    } else {
      setAssigneeIds([]);
      setAssignAllDept(false);
    }
  };

  const onToggleAllDepartment = (checked: boolean) => {
    setAssignAllDept(checked);

    if (checked) {
      setAssigneeIds((prev) => {
        const next = Array.from(new Set([...prev, ...selectedDepartmentMemberIds]));

        const allBranchSelected =
          candidates.length > 0 &&
          candidates.every((c) => next.includes(c.user_id));
        setAssignAllBranch(allBranchSelected);

        return next;
      });
    } else {
      setAssigneeIds((prev) => {
        const next = prev.filter((id) => !selectedDepartmentMemberIds.includes(id));

        const allBranchSelected =
          candidates.length > 0 &&
          candidates.every((c) => next.includes(c.user_id));
        setAssignAllBranch(allBranchSelected);

        return next;
      });
    }
  };

  const addProjectScheduleRow = () => {
    setNewProjectSchedules((prev) => [...prev, { eventName: "", date: "" }]);
  };

  const updateProjectScheduleRow = (
    index: number,
    key: keyof ProjectScheduleItem,
    value: string
  ) => {
    setNewProjectSchedules((prev) =>
      prev.map((item, i) => (i === index ? { ...item, [key]: value } : item))
    );
  };

  const removeProjectScheduleRow = (index: number) => {
    setNewProjectSchedules((prev) => {
      if (prev.length === 1) {
        return [{ eventName: "", date: "" }];
      }
      return prev.filter((_, i) => i !== index);
    });
  };

  const createProjectIfNeeded = async () => {
    if (!me || !membership) {
      setErrorMsg("ユーザー情報または所属情報が未取得です");
      return null;
    }

    if (projectSelection === "") {
      return null;
    }

    if (projectSelection !== "__new__") {
      return projectSelection;
    }

    if (!newProjectName.trim()) {
      setErrorMsg("新規プロジェクト名を入力してください。");
      return null;
    }

    const normalizedSchedules = newProjectSchedules
      .map((item) => ({
        eventName: item.eventName.trim(),
        date: item.date,
      }))
      .filter((item) => item.eventName || item.date);

    const hasInvalidSchedule = normalizedSchedules.some(
      (item) => !item.eventName || !item.date
    );

    if (hasInvalidSchedule) {
      setErrorMsg("スケジュールはイベント名と日程をセットで入力してください。");
      return null;
    }

    const { data: newProject, error: projectInsertErr } = await supabase
      .from("projects")
      .insert({
        branch_id: membership.branch_id,
        requester_id: me.id,
        name: newProjectName.trim(),
        description: newProjectDescription.trim()
          ? newProjectDescription.trim()
          : null,
        schedule:
          normalizedSchedules.length > 0
            ? JSON.stringify(normalizedSchedules)
            : null,
        attachment_url: newProjectAttachmentUrl.trim()
          ? newProjectAttachmentUrl.trim()
          : null,
      })
      .select("id")
      .single();

    if (projectInsertErr) {
      setErrorMsg(`プロジェクトの作成に失敗しました: ${projectInsertErr.message}`);
      return null;
    }

    return newProject.id as string;
  };

  const onBack = () => {
    const confirmed = window.confirm(
      "入力中の内容は保存されません。本当に戻りますか？"
    );

    if (!confirmed) return;

    router.back();
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
    if (scopeType === "department" && !selectedDepartmentId) {
      setErrorMsg("部署を選択してください。");
      setSaving(false);
      return;
    }
    if (scopeType === "department") {
      const selectedDepartment = departments.find((d) => d.id === selectedDepartmentId);

      if (!selectedDepartment) {
        setErrorMsg("選択された部署が見つかりません。");
        setSaving(false);
        return;
      }

      if (selectedDepartment.branch_id !== membership.branch_id) {
        setErrorMsg("他支部の部署は選択できません。");
        setSaving(false);
        return;
      }
    }

    const scope_id =
      scopeType === "branch"
        ? membership.branch_id
        : scopeType === "personal"
        ? me.id
        : scopeType === "department"
        ? selectedDepartmentId
        : null;
    if (!scope_id) {
      setErrorMsg("scope_id を決定できませんでした");
      setSaving(false);
      return;
    }

    const projectId = await createProjectIfNeeded();

    if (projectSelection === "__new__" && !projectId) {
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
        attachment_url: attachmentUrl.trim() ? attachmentUrl.trim() : null,
        project_id: projectId,
      })
      .select("id")
      .single();

    if (taskErr) {
      setErrorMsg(taskErr.message);
      setSaving(false);
      return;
    }

    // 2) assignees insert (bulk)
    const rows = assigneeIds.map((uid) => ({
      task_id: task.id,
      user_id: uid,
      status: "todo" as TaskStatus,
      note: null,
    }));

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

  const onCreateProjectOnly = async () => {
    if (!me || !membership) return;

    setSaving(true);
    setErrorMsg(null);

    const projectId = await createProjectIfNeeded();

    if (!projectId) {
      setSaving(false);
      return;
    }

    router.replace("/dashboard");
  };

  return (
    <main className="p-4 sm:p-6">
      <div className="max-w-2xl">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold">タスク作成</h1>
            <p className="mt-1 break-all text-sm text-gray-600">
              依頼者: {me?.email ?? "-"}
            </p>
          </div>

          <button
            type="button"
            className="w-full rounded-md border px-3 py-2 text-center sm:w-auto"
            onClick={onBack}
          >
            戻る
          </button>
        </div>
      </div>

      {loading && <p className="mt-6 text-sm">読み込み中...</p>}
      {errorMsg && <p className="mt-6 text-sm text-red-600">❌ {errorMsg}</p>}

      {!loading && (
        <form className="mt-6 max-w-2xl space-y-6 sm:space-y-7" onSubmit={onCreate}>
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
              placeholder="目的、実施手順など"
              rows={4}
            />
          </div>

          <div>
            <label className="block text-sm font-medium">資料URL</label>
            <p className="mt-1 text-xs text-gray-500">
              Google DriveのURLを貼ってください。複数資料共有時は1つのドライブにまとめてください。
            </p>
            <input
              type="url"
              className="mt-1 w-full rounded-md border px-3 py-2"
              value={attachmentUrl}
              onChange={(e) => setAttachmentUrl(e.target.value)}
              placeholder="https://drive.google.com/..."
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

            <div className="flex flex-col gap-3 text-sm sm:flex-row sm:flex-wrap sm:items-center sm:gap-6">
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

              <label className="flex items-center gap-2">
                <input
                  type="radio"
                  name="scope"
                  value="department"
                  checked={scopeType === "department"}
                  onChange={() => setScopeType("department")}
                />
                部署
              </label>
            </div>

            <div className="mt-3 text-sm text-gray-700 space-y-3">
              {scopeType === "branch" && <>支部: {branchName}</>}

              {scopeType === "personal" && <>個人: あなた</>}

              {scopeType === "department" && (
                <div className="space-y-2">
                  <div>部署を選択してください</div>
                  <select
                    className="w-full rounded-md border px-3 py-2"
                    value={selectedDepartmentId}
                    onChange={(e) => setSelectedDepartmentId(e.target.value)}
                  >
                    <option value="">部署を選択</option>
                    {departments.map((department) => (
                      <option key={department.id} value={department.id}>
                        {department.name}
                      </option>
                    ))}
                  </select>

                  {departments.length === 0 && (
                    <p className="text-xs text-gray-500">
                      この支部には部署が登録されていません。
                    </p>
                  )}
                </div>
              )}
            </div>
          </div>

          <div className="rounded-xl border p-4">
            <div className="font-semibold mb-2">担当者（複数選択可）</div>

            <div className="mb-3 flex flex-col gap-2">
              <label className="flex items-start gap-2 text-sm">
                <input
                  type="checkbox"
                  className="mt-1"
                  checked={assignAllBranch}
                  onChange={(e) => onToggleAllBranch(e.target.checked)}
                  disabled={candidates.length === 0}
                />
                支部全員に割り当て
              </label>

              <label
                className={`flex items-start gap-2 text-sm ${
                  scopeType === "department" ? "" : "text-gray-400"
                }`}
              >
                <input
                  type="checkbox"
                  className="mt-1"
                  checked={assignAllDept}
                  onChange={(e) => onToggleAllDepartment(e.target.checked)}
                  disabled={
                    scopeType !== "department" ||
                    !selectedDepartmentId ||
                    selectedDepartmentMemberIds.length === 0
                  }
                />
                部署全員に割り当て
              </label>
              {scopeType === "department" && selectedDepartmentId && selectedDepartmentMemberIds.length === 0 && (
                <p className="text-xs text-gray-500">
                  この部署には所属メンバーがいません
                </p>
              )}
            </div>

            {candidates.length === 0 ? (
              <p className="text-sm text-gray-500">
                担当者候補がありません（memberships / profiles を確認してください）
              </p>
            ) : (
              <div className="space-y-3 text-sm">
                {candidates.map((p) => (
                  <label key={p.user_id} className="flex items-start gap-2 break-words">
                    <input
                      type="checkbox"
                      className="mt-1"
                      checked={assigneeIds.includes(p.user_id)}
                      onChange={() => toggleAssignee(p.user_id)}
                    />
                    <span>{candidateLabel(p)}</span>
                  </label>
                ))}
              </div>
            )}
          </div>

          <div className="rounded-xl border p-4">
            <div className="font-semibold mb-2">プロジェクト</div>

            <select
              className="w-full rounded-md border px-3 py-2"
              value={projectSelection}
              onChange={(e) => setProjectSelection(e.target.value)}
            >
              <option value="">選択なし</option>
              {projects.map((project) => (
                <option key={project.id} value={project.id}>
                  {project.name}
                </option>
              ))}
              <option value="__new__">＋ 新規プロジェクトを作成</option>
            </select>

            {projectSelection === "__new__" && (
              <div className="mt-4 space-y-4">
                <div>
                  <label className="block text-sm font-medium">プロジェクト名</label>
                  <input
                    className="mt-1 w-full rounded-md border px-3 py-2"
                    value={newProjectName}
                    onChange={(e) => setNewProjectName(e.target.value)}
                    placeholder="プロジェクト名を入力"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium">スケジュール</label>
                  <div className="mt-2 space-y-3">
                    {newProjectSchedules.map((item, index) => (
                      <div key={index} className="space-y-2 rounded-lg border p-3 sm:p-4">
                        <div>
                          <label className="block text-xs text-gray-600">イベント名</label>
                          <input
                            className="mt-1 w-full rounded-md border px-3 py-2"
                            value={item.eventName}
                            onChange={(e) =>
                              updateProjectScheduleRow(index, "eventName", e.target.value)
                            }
                            placeholder="例: キックオフ"
                          />
                        </div>

                        <div>
                          <label className="block text-xs text-gray-600">日程</label>
                          <input
                            type="date"
                            className="mt-1 w-full rounded-md border px-3 py-2"
                            value={item.date}
                            onChange={(e) =>
                              updateProjectScheduleRow(index, "date", e.target.value)
                            }
                          />
                        </div>

                        <button
                          type="button"
                          className="text-left text-sm text-red-600 underline-offset-2 hover:underline"
                          onClick={() => removeProjectScheduleRow(index)}
                        >
                          このスケジュールを削除
                        </button>
                      </div>
                    ))}
                  </div>

                  <button
                    type="button"
                    className="mt-3 w-full rounded-md border px-3 py-2 text-sm sm:w-auto"
                    onClick={addProjectScheduleRow}
                  >
                    ＋ スケジュールを追加
                  </button>
                </div>

                <div>
                  <label className="block text-sm font-medium">プロジェクトの説明</label>
                  <textarea
                    className="mt-1 w-full rounded-md border px-3 py-2"
                    value={newProjectDescription}
                    onChange={(e) => setNewProjectDescription(e.target.value)}
                    rows={4}
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium">プロジェクト関連資料</label>
                  <p className="mt-1 text-xs text-gray-500">
                    Google DriveのURLを貼ってください。
                  </p>
                  <input
                    type="url"
                    className="mt-1 w-full rounded-md border px-3 py-2"
                    value={newProjectAttachmentUrl}
                    onChange={(e) => setNewProjectAttachmentUrl(e.target.value)}
                    placeholder="https://drive.google.com/..."
                  />
                </div>
              </div>
            )}
          </div>

          <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
            <button
              className="w-full rounded-md border px-4 py-2 font-medium disabled:opacity-50 sm:w-auto"
              type="submit"
              disabled={saving}
            >
              {saving ? "作成中..." : "タスクを作成"}
            </button>

            <button
              type="button"
              className="w-full rounded-md border px-4 py-2 font-medium disabled:opacity-50 sm:w-auto"
              disabled={saving || projectSelection !== "__new__"}
              onClick={onCreateProjectOnly}
            >
              {saving ? "作成中..." : "プロジェクトのみ作成"}
            </button>
          </div>
        </form>
      )}
    </main>
  );
}