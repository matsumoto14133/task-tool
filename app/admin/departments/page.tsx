"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type {
  Membership,
  Department,
  MembershipDepartment,
} from "@/lib/admin/types";
import {
  canManageDepartments,
  countMembersInDepartment,
  canDeleteDepartment,
} from "@/lib/admin/permissions";
import {
  loadAdminDepartmentsPageRowsData,
  loadAdminDepartmentsPageInitialData,
} from "@/lib/admin/loaders";
import {
  createDepartment,
  renameDepartment,
  deleteDepartment,
} from "@/lib/admin/mutations";

export default function AdminDepartmentsPage() {

  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [myMembership, setMyMembership] = useState<Membership | null>(null);
  const isAdmin = canManageDepartments(myMembership?.role);

  const [departments, setDepartments] = useState<Department[]>([]);
  const [membershipDepartments, setMembershipDepartments] = useState<MembershipDepartment[]>([]);
  const [newDepartmentName, setNewDepartmentName] = useState("");
  const [creating, setCreating] = useState(false);
  const [editingDepartmentNames, setEditingDepartmentNames] = useState<Record<string, string>>({});
  const [updatingDepartmentId, setUpdatingDepartmentId] = useState<string | null>(null);
  const [deletingDepartmentId, setDeletingDepartmentId] = useState<string | null>(null);

  const reloadDepartmentsPage = async (branchId: string) => {
    const data = await loadAdminDepartmentsPageRowsData(branchId);

    setDepartments(data.departments);
    setMembershipDepartments(data.membershipDepartments);
  };

  useEffect(() => {
    (async () => {
      setLoading(true);
      setErrorMsg(null);

      try {
        const data = await loadAdminDepartmentsPageInitialData();

        setMyMembership(data.myMembership);
        setDepartments(data.departments);
        setMembershipDepartments(data.membershipDepartments);
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "初期データの取得に失敗しました";

        setErrorMsg(message);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  useEffect(() => {
    const next: Record<string, string> = {};

    for (const department of departments) {
      next[department.id] = department.name;
    }

    setEditingDepartmentNames(next);
  }, [departments]);

  const onCreateDepartment = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    if (!myMembership || !canManageDepartments(myMembership.role)) return;

    setCreating(true);
    setErrorMsg(null);

    try {
      await createDepartment({
        name: newDepartmentName,
      });

      await reloadDepartmentsPage(myMembership.branch_id);
      setNewDepartmentName("");
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "部署の作成に失敗しました");
    } finally {
      setCreating(false);
    }
  };

  const onRenameDepartment = async (departmentId: string) => {
    if (!myMembership || !canManageDepartments(myMembership.role)) return;

    setUpdatingDepartmentId(departmentId);
    setErrorMsg(null);

    try {
      await renameDepartment({
        departmentId,
        name: editingDepartmentNames[departmentId] ?? "",
      });

      await reloadDepartmentsPage(myMembership.branch_id);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "部署名の更新に失敗しました");
    } finally {
      setUpdatingDepartmentId(null);
    }
  };

  const onDeleteDepartment = async (departmentId: string) => {
    if (!myMembership || !canManageDepartments(myMembership.role)) return;

    const confirmed = window.confirm("この部署を削除しますか？");
    if (!confirmed) {
      return;
    }

    setDeletingDepartmentId(departmentId);
    setErrorMsg(null);

    try {
      await deleteDepartment({
        departmentId,
      });

      await reloadDepartmentsPage(myMembership.branch_id);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "部署の削除に失敗しました");
    } finally {
      setDeletingDepartmentId(null);
    }
  };

  return (
    <main className="p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">部署管理（管理者のみアクセス可能）</h1>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Link className="rounded-md border px-3 py-2" href="/dashboard">
              ホームへ
            </Link>
            <Link className="rounded-md border px-3 py-2" href="/admin/memberships">
              ユーザー管理へ
            </Link>
          </div>
        </div>
      </div>

      {loading && <p className="mt-4 text-sm">読み込み中...</p>}
      {errorMsg && <p className="mt-4 text-sm text-red-600">❌ {errorMsg}</p>}

      {!loading && isAdmin && (
        <>
          <section className="mt-8 max-w-xl">
            <h2 className="text-lg font-semibold">部署作成</h2>

            <form className="mt-4 space-y-4" onSubmit={onCreateDepartment}>
              <div>
                <label className="block text-sm font-medium">新しい部署名</label>
                <input
                  className="mt-1 w-full rounded-md border px-3 py-2"
                  value={newDepartmentName}
                  onChange={(e) => setNewDepartmentName(e.target.value)}
                  placeholder="例: 広報部"
                />
              </div>

              <button
                type="submit"
                className="rounded-md border px-3 py-2 disabled:opacity-50"
                disabled={creating}
              >
                {creating ? "作成中..." : "部署を作成"}
              </button>
            </form>
          </section>

          <section className="mt-10">
            <h2 className="text-lg font-semibold">同一支部の部署一覧</h2>

            {departments.length === 0 ? (
              <p className="mt-3 text-sm text-gray-600">
                  まだ部署が作成されていません。
                  上のフォームから作成してください。
              </p>
            ) : (
              <ul className="mt-4 space-y-3">
                {departments.map((department) => {
                  const memberCount = countMembersInDepartment(
                    department.id,
                    membershipDepartments
                  );
                  const deletable = canDeleteDepartment(
                    department.id,
                    membershipDepartments
                  );

                  return (
                    <li
                      key={department.id}
                      className="rounded-lg border bg-white p-4"
                    >
                      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                            <input
                              className="w-full rounded-md border px-3 py-2 text-sm"
                              value={editingDepartmentNames[department.id] ?? ""}
                              onChange={(e) =>
                                setEditingDepartmentNames((prev) => ({
                                  ...prev,
                                  [department.id]: e.target.value,
                                }))
                              }
                              placeholder="部署名を入力"
                            />

                            <button
                              type="button"
                              className="rounded-md border px-2 py-1 text-xs disabled:opacity-50"
                              onClick={() => onRenameDepartment(department.id)}
                              disabled={
                                updatingDepartmentId === department.id ||
                                ((editingDepartmentNames[department.id] ?? "").trim() ===
                                  department.name.trim())
                              }
                            >
                              {updatingDepartmentId === department.id ? "保存中..." : "名前を保存"}
                            </button>
                          </div>

                          <div className="mt-1 text-sm text-gray-600 break-all">
                            department_id: {department.id}
                          </div>
                        </div>

                        <div className="flex shrink-0 flex-col items-start gap-2 text-sm md:items-end">
                          <span className="rounded-md border px-2 py-1">
                            所属人数: {memberCount}人
                          </span>

                          <button
                            type="button"
                            className="rounded-md border px-3 py-2 text-sm disabled:opacity-50"
                            onClick={() => onDeleteDepartment(department.id)}
                            disabled={deletingDepartmentId === department.id || !deletable}
                          >
                            {deletingDepartmentId === department.id ? "削除中..." : "部署を削除"}
                          </button>

                          {!deletable && (
                            <p className="text-xs text-gray-500">
                              所属メンバーがいるため削除できません
                            </p>
                          )}
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        </>
      )}
    </main>
  );
}