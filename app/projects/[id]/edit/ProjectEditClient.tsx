"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { fetchMyMembership } from "@/lib/tasks/taskQueries";

const supabase = createClient();

type Membership = {
  branch_id: string;
  role: "member" | "manager" | "admin";
};

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
  id: string;
  eventName: string;
  date: string;
};

function isValidScheduleItem(value: unknown): value is ProjectScheduleItem {
  if (!value || typeof value !== "object") return false;

  const item = value as Record<string, unknown>;

  return (
    typeof item.eventName === "string" &&
    typeof item.date === "string"
  );
}

export default function ProjectEditClient() {
  const params = useParams();
  const router = useRouter();

  const projectId =
    typeof params?.id === "string"
      ? params.id
      : Array.isArray(params?.id)
      ? params.id[0]
      : "";

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [me, setMe] = useState<{ id: string; email: string | null } | null>(null);
  const [membership, setMembership] = useState<Membership | null>(null);
  const [project, setProject] = useState<ProjectRow | null>(null);

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [attachmentUrl, setAttachmentUrl] = useState("");
  const [schedules, setSchedules] = useState<ProjectScheduleItem[]>([
    { id: crypto.randomUUID(), eventName: "", date: "" },
  ]);

  useEffect(() => {
    const loadProject = async () => {
      if (!projectId) {
        setErrorMsg("プロジェクトIDが不正です。");
        setLoading(false);
        return;
      }

      setLoading(true);
      setErrorMsg(null);

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

      const myMembership = (await fetchMyMembership(
        supabase,
        userData.user.id
      )) as Membership | null;

      if (!myMembership) {
        setErrorMsg("memberships が未登録です（管理者に登録してください）");
        setLoading(false);
        return;
      }

      setMembership(myMembership);

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

      const projectData = data as ProjectRow;
      setProject(projectData);

      const canEdit =
        projectData.requester_id === userData.user.id ||
        myMembership.role === "manager" ||
        myMembership.role === "admin";

      if (!canEdit) {
        setErrorMsg("このプロジェクトを編集する権限がありません。");
        setLoading(false);
        return;
      }

      setName(projectData.name ?? "");
      setDescription(projectData.description ?? "");
      setAttachmentUrl(projectData.attachment_url ?? "");

      if (!projectData.schedule) {
        setSchedules([{ id: crypto.randomUUID(), eventName: "", date: "" }]);
      } else {
        try {
          const parsed = JSON.parse(projectData.schedule);

          if (!Array.isArray(parsed)) {
            setSchedules([{ id: crypto.randomUUID(), eventName: "", date: "" }]);
          } else {
            const normalized = parsed.filter(isValidScheduleItem);

            setSchedules(
            normalized.length > 0
                ? normalized.map((item) => ({
                    id: crypto.randomUUID(),
                    eventName: item.eventName,
                    date: item.date,
                }))
                : [{ id: crypto.randomUUID(), eventName: "", date: "" }]
            );
          }
        } catch {
          setSchedules([{ id: crypto.randomUUID(), eventName: "", date: "" }]);
        }
      }

      setLoading(false);
    };

    loadProject();
  }, [projectId, router]);

  const addScheduleRow = () => {
    setSchedules((prev) => [
      ...prev,
      { id: crypto.randomUUID(), eventName: "", date: "" },
    ]);
  };

  const updateScheduleRow = (
    index: number,
    key: keyof ProjectScheduleItem,
    value: string
  ) => {
    setSchedules((prev) =>
      prev.map((item, i) => (i === index ? { ...item, [key]: value } : item))
    );
  };

  const removeScheduleRow = (index: number) => {
    setSchedules((prev) => {
      if (prev.length === 1) {
        return [{ id: crypto.randomUUID(), eventName: "", date: "" }];
      }
      return prev.filter((_, i) => i !== index);
    });
  };

  const onBack = () => {
    if (projectId) {
      router.push(`/projects/${projectId}`);
      return;
    }

    router.push("/dashboard");
  };

  const onSave = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!projectId || !project) return;

    setSaving(true);
    setErrorMsg(null);

    if (!name.trim()) {
      setErrorMsg("プロジェクト名を入力してください。");
      setSaving(false);
      return;
    }

    if (!me || !membership) {
      setErrorMsg("ユーザー情報または所属情報が未取得です。");
      setSaving(false);
      return;
    }

    const canEdit =
      project.requester_id === me.id ||
      membership.role === "manager" ||
      membership.role === "admin";

    if (!canEdit) {
      setErrorMsg("このプロジェクトを編集する権限がありません。");
      setSaving(false);
      return;
    }

    const normalizedSchedules = schedules
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
      setSaving(false);
      return;
    }

    const { error } = await supabase
      .from("projects")
      .update({
        name: name.trim(),
        description: description.trim() ? description.trim() : null,
        schedule:
          normalizedSchedules.length > 0
            ? JSON.stringify(normalizedSchedules)
            : null,
        attachment_url: attachmentUrl.trim() ? attachmentUrl.trim() : null,
      })
      .eq("id", projectId);

    if (error) {
      setErrorMsg(error.message);
      setSaving(false);
      return;
    }

    router.replace(`/projects/${projectId}`);
  };

  async function deleteProject() {
    if (!project) return;

    const confirmed = window.confirm(
      "このプロジェクトを削除しますか？元に戻せません。"
    );

    if (!confirmed) return;

    setSaving(true);
    setErrorMsg(null);

    try {
      // ① 紐づくtaskがあるかチェック
      const { count, error: countErr } = await supabase
        .from("tasks")
        .select("*", { count: "exact", head: true })
        .eq("project_id", project.id);

      if (countErr) throw countErr;

      if ((count ?? 0) > 0) {
        setErrorMsg(
          "このプロジェクトには紐づくタスクがあるため削除できません。先にタスク側でプロジェクトを外すか、タスクを削除してください。"
        );
        setSaving(false);
        return;
      }

      // ② project削除
      const { error: deleteErr } = await supabase
        .from("projects")
        .delete()
        .eq("id", project.id);

      if (deleteErr) throw deleteErr;

      router.replace("/dashboard");
    } catch (e: any) {
      setErrorMsg(e?.message ?? "プロジェクトの削除に失敗しました");
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="p-4 sm:p-6">
      <div className="max-w-2xl">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold">プロジェクト編集</h1>
            <p className="mt-1 text-sm text-gray-600">
              編集対象: {project?.name ?? "-"}
            </p>
          </div>

          <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:flex-wrap">
            <button
              type="button"
              className="w-full rounded-md border px-3 py-2 text-center sm:w-auto"
              onClick={onBack}
            >
              プロジェクト詳細へ戻る
            </button>
          </div>
        </div>

        {loading && <p className="mt-6 text-sm">読み込み中...</p>}
        {errorMsg && <p className="mt-6 text-sm text-red-600">❌ {errorMsg}</p>}

        {!loading && (
          <form className="mt-6 space-y-6 sm:space-y-7" onSubmit={onSave}>
            <div>
              <label className="block text-sm font-medium">プロジェクト名</label>
              <input
                className="mt-1 w-full rounded-md border px-3 py-2"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="プロジェクト名を入力"
              />
            </div>

            <div className="rounded-xl border p-4">
              <div className="mb-2 font-semibold">スケジュール</div>

              <div className="space-y-3">
                {schedules.map((item, index) => (
                  <div key={item.id} className="space-y-2 rounded-lg border p-3 sm:p-4">
                    <div>
                      <label className="block text-xs text-gray-600">
                        イベント名
                      </label>
                      <input
                        className="mt-1 w-full rounded-md border px-3 py-2"
                        value={item.eventName}
                        onChange={(e) =>
                          updateScheduleRow(index, "eventName", e.target.value)
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
                          updateScheduleRow(index, "date", e.target.value)
                        }
                      />
                    </div>

                    <button
                      type="button"
                      className="text-left text-sm text-red-600 underline-offset-2 hover:underline"
                      onClick={() => removeScheduleRow(index)}
                    >
                      このスケジュールを削除
                    </button>
                  </div>
                ))}
              </div>

              <button
                type="button"
                className="mt-3 w-full rounded-md border px-3 py-2 text-sm sm:w-auto"
                onClick={addScheduleRow}
              >
                ＋ スケジュールを追加
              </button>
            </div>

            <div>
              <label className="block text-sm font-medium">説明</label>
              <textarea
                className="mt-1 w-full rounded-md border px-3 py-2 text-sm"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={4}
                placeholder="目的、成果指標、簡単な概要など"
              />
            </div>

            <div>
              <label className="block text-sm font-medium">資料URL</label>
              <p className="mt-1 text-xs text-gray-500">
                Google DriveのURLを貼ってください。
              </p>
              <input
                type="url"
                className="mt-1 w-full rounded-md border px-3 py-2"
                value={attachmentUrl}
                onChange={(e) => setAttachmentUrl(e.target.value)}
                placeholder="https://drive.google.com/..."
              />
            </div>

            <button
              className="w-full rounded-md border px-4 py-2 font-medium disabled:opacity-50 sm:w-auto"
              type="submit"
              disabled={saving}
            >
              {saving ? "保存中..." : "保存する"}
            </button>

            <div className="border rounded-lg p-4 mt-6 border-red-300 bg-red-50">
              <div className="font-semibold text-red-700 mb-2">危険な操作</div>

              <button
                type="button"
                className="w-full rounded-md border border-red-500 px-4 py-2 text-red-700 sm:w-auto"
                onClick={deleteProject}
                disabled={saving}
              >
                {saving ? "削除中..." : "このプロジェクトを削除"}
              </button>
            </div>
          </form>
        )}
      </div>
    </main>
  );
}