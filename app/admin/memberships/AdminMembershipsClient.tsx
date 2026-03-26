"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type {
  Role,
  Profile,
  Membership,
  Department,
  MembershipDepartment,
} from "@/lib/admin/types";
import {
  canAccessMembershipsPage,
  canManageMemberships,
  canEditRole,
  canEditDisplayName,
  canEditDepartments,
  isSelfMembership,
} from "@/lib/admin/permissions";
import {
  loadAdminMembershipsPageRowsData,
  loadAdminMembershipsPageInitialData,
} from "@/lib/admin/loaders";
import {
  updateDisplayName,
  addDepartmentToUser,
  removeDepartmentFromUser,
  updateRole,
  createMembership,
  removeMembershipFromBranch,
} from "@/lib/admin/mutations";

type MembershipAction = "add" | "remove";

function shortUserId(userId: string) {
  return `${userId.slice(0, 8)}...`;
}

function roleLabel(role: Role) {
  switch (role) {
    case "admin":
      return "管理者";
    case "manager":
      return "マネージャー";
    case "member":
      return "メンバー";
    default:
      return role;
  }
}

function profileOne(p: Profile | Profile[] | null | undefined): Profile | null {
  if (!p) return null;
  return Array.isArray(p) ? (p[0] ?? null) : p;
}

function departmentOne(
  d: Department | Department[] | null | undefined
): Department | null {
  if (!d) return null;
  return Array.isArray(d) ? (d[0] ?? null) : d;
}

function getAvailableDepartmentsForUser(
  userId: string,
  departments: Department[],
  membershipDepartments: MembershipDepartment[]
) {
  const assignedDepartmentIds = new Set(
    membershipDepartments
      .filter((item) => item.user_id === userId)
      .map((item) => item.department_id)
  );

  return departments.filter((department) => !assignedDepartmentIds.has(department.id));
}

export default function AdminMembershipsClient() {
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [myMembership, setMyMembership] = useState<Membership | null>(null);
  const canAccessPage = canAccessMembershipsPage(myMembership?.role);

  const [rows, setRows] = useState<Membership[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [membershipDepartments, setMembershipDepartments] = useState<MembershipDepartment[]>([]);

  // form
  const [email, setEmail] = useState("");
  const [membershipAction, setMembershipAction] = useState<MembershipAction>("add");
  const [saving, setSaving] = useState(false);
  const [editingRoles, setEditingRoles] = useState<Record<string, Role>>({});
  const [updatingUserId, setUpdatingUserId] = useState<string | null>(null);
  const [editingNames, setEditingNames] = useState<Record<string, string>>({});
  const [updatingNameUserId, setUpdatingNameUserId] = useState<string | null>(null);
  const [selectedDepartmentIds, setSelectedDepartmentIds] = useState<Record<string, string>>({});
  const [updatingDepartmentUserId, setUpdatingDepartmentUserId] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      setLoading(true);
      setErrorMsg(null);

      try {
        const data = await loadAdminMembershipsPageInitialData();

        setMyMembership(data.myMembership);
        setRows(data.rows);
        setDepartments(data.departments);
        setMembershipDepartments(data.membershipDepartments);
        setLoading(false);
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "初期データの取得に失敗しました";

        if (message === "UNAUTHENTICATED") {
          router.replace("/login");
          return;
        }

        setErrorMsg(message);
        setLoading(false);
      }
    })();
  }, [router]);

  // rows が更新されたら、各行の編集中 state を再初期化する
  useEffect(() => {
    const next: Record<string, Role> = {};

    for (const row of rows) {
      next[row.user_id] = row.role;
    }

    setEditingRoles(next);
  }, [rows]);
  useEffect(() => {
    const next: Record<string, string> = {};

    for (const row of rows) {
      const profile = profileOne(row.profiles);
      next[row.user_id] = profile?.display_name ?? "";
    }

    setEditingNames(next);
  }, [rows]);
  useEffect(() => {
    const next: Record<string, string> = {};

    for (const row of rows) {
      next[row.user_id] = "";
    }

    setSelectedDepartmentIds(next);
  }, [rows]);

  const reloadRows = async (branchId: string) => {
    const data = await loadAdminMembershipsPageRowsData(branchId);

    setRows(data.rows);
    setDepartments(data.departments);
    setMembershipDepartments(data.membershipDepartments);
  };

  // membershipの付与（デフォルト:member）
  const onGrant = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!myMembership || !canAccessPage) return;

    const trimmedEmail = email.trim().toLowerCase();
    if (!trimmedEmail) {
      setErrorMsg("メールアドレスを入力してください");
      return;
    }

    if (membershipAction === "remove") {
      const confirmed = window.confirm("本当に削除しますか？");
      if (!confirmed) return;
    }

    setSaving(true);
    setErrorMsg(null);

    try {
      if (membershipAction === "add") {
        await createMembership({
          email: trimmedEmail,
          role: "member",
        });
      } else {
        await removeMembershipFromBranch({
          email: trimmedEmail,
        });
      }

      await reloadRows(myMembership.branch_id);
      setEmail("");
    } catch (err) {
      setErrorMsg(
        err instanceof Error
          ? err.message
          : membershipAction === "add"
          ? "支部への追加に失敗しました"
          : "支部からの削除に失敗しました"
      );
    } finally {
      setSaving(false);
    }
  };

  // 行更新
  const onUpdateRole = async (targetUserId: string) => {
    if (!myMembership || !canManageMemberships(myMembership.role)) return;

    const nextRole = editingRoles[targetUserId];
    if (!nextRole) return;

    const targetRow = rows.find((row) => row.user_id === targetUserId);
    if (!targetRow) return;

    const isPromotingToAdmin =
      (targetRow.role === "member" || targetRow.role === "manager") &&
      nextRole === "admin";

    const isDemotingFromAdmin =
      targetRow.role === "admin" &&
      (nextRole === "member" || nextRole === "manager");

    if (isPromotingToAdmin) {
      const confirmed = window.confirm(
        "管理者には多くの権限が付与されます。本当に変更しますか？"
      );
      if (!confirmed) return;
    }

    if (isDemotingFromAdmin) {
      const confirmed = window.confirm(
        "このユーザーの管理者権限が失われます。本当に変更しますか？"
      );
      if (!confirmed) return;
    }

    setUpdatingUserId(targetUserId);
    setErrorMsg(null);

    try {
      await updateRole({
        targetUserId,
        role: nextRole,
      });

      await reloadRows(myMembership.branch_id);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "role の更新に失敗しました");
    } finally {
      setUpdatingUserId(null);
    }
  };
  const onUpdateDisplayName = async (targetUserId: string) => {
    if (
      !myMembership ||
      !canEditDisplayName(myMembership.role, myMembership.user_id, targetUserId)
    ) {
      return;
    }

    setUpdatingNameUserId(targetUserId);
    setErrorMsg(null);

    try {
      await updateDisplayName({
        targetUserId,
        displayName: editingNames[targetUserId] ?? "",
      });

      await reloadRows(myMembership.branch_id);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "表示名の更新に失敗しました");
    } finally {
      setUpdatingNameUserId(null);
    }
  };

  // 部署所属更新
  const onAddDepartmentToUser = async (targetUserId: string) => {
    if (!myMembership || !canEditDepartments(myMembership.role)) return;

    setUpdatingDepartmentUserId(targetUserId);
    setErrorMsg(null);

    try {
      await addDepartmentToUser({
        targetUserId,
        departmentId: selectedDepartmentIds[targetUserId] ?? "",
      });

      await reloadRows(myMembership.branch_id);

      setSelectedDepartmentIds((prev) => ({
        ...prev,
        [targetUserId]: "",
      }));

    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "部署の追加に失敗しました");
    } finally {
      setUpdatingDepartmentUserId(null);
    }
  };
  const onRemoveDepartmentFromUser = async (
    targetUserId: string,
    departmentId: string
  ) => {
    if (!myMembership || !canEditDepartments(myMembership.role)) return;

    setUpdatingDepartmentUserId(targetUserId);
    setErrorMsg(null);

    try {
      await removeDepartmentFromUser({
        targetUserId,
        departmentId,
      });

      await reloadRows(myMembership.branch_id);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "部署の削除に失敗しました");
    } finally {
      setUpdatingDepartmentUserId(null);
    }
  };

  return (
    <main className="p-4 sm:p-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold">ユーザー管理</h1>
          <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
          <Link
              className="w-full rounded-md border px-3 py-2 text-center sm:w-auto"
              href="/dashboard"
          >
              ホームへ
          </Link>

          {myMembership?.role === "admin" && (
              <Link
              className="w-full rounded-md border px-3 py-2 text-center sm:w-auto"
              href="/admin/departments"
              >
              部署管理へ
              </Link>
          )}
          </div>
        </div>
      </div>

      {loading && <p className="mt-4 text-sm">読み込み中...</p>}
      {errorMsg && <p className="mt-4 text-sm text-red-600">❌ {errorMsg}</p>}

      {!loading && canAccessPage && myMembership && (
        <>
          {myMembership.role === "admin" && (
            <section className="mt-8 max-w-xl">
              <h2 className="text-lg font-semibold">支部所属者管理（管理者のみに表示）</h2>
              <form className="mt-4 space-y-4" onSubmit={onGrant}>
                <div>
                  <label className="block text-sm font-medium">対象ユーザーのメール</label>
                  <input
                    className="mt-1 w-full rounded-md border px-3 py-2"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="user@example.com"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium">操作</label>
                  <select
                    className="mt-1 w-full rounded-md border px-3 py-2"
                    value={membershipAction}
                    onChange={(e) => setMembershipAction(e.target.value as MembershipAction)}
                  >
                    <option value="add">支部に追加</option>
                    <option value="remove">支部から削除</option>
                  </select>
                </div>

                <button
                  className="w-full rounded-md border px-3 py-2 text-center disabled:opacity-50 sm:w-auto"
                  disabled={saving}
                >
                  {saving
                    ? membershipAction === "add"
                      ? "追加中..."
                      : "削除中..."
                    : membershipAction === "add"
                    ? `支部に追加`
                    : `支部から削除`}
                </button>
              </form>
            </section>
          )}

          <section className="mt-10">
            <h2 className="text-lg font-semibold">支部員一覧</h2>
            {rows.length === 0 ? (
              <p className="mt-3 text-sm text-gray-600">この支部にはまだユーザーが登録されていません。</p>
            ) : (
              <ul className="mt-4 space-y-3">
                {rows.map((r) => {
                  const p = profileOne(r.profiles);
                  const availableDepartments = getAvailableDepartmentsForUser(
                    r.user_id,
                    departments,
                    membershipDepartments
                  );

                  return (
                    <li
                      key={`${r.branch_id}-${r.user_id}`}
                      className={`rounded-lg border p-4 text-sm ${
                        isSelfMembership(myMembership?.user_id, r.user_id)
                          ? "bg-gray-80 border-2"
                          : "bg-white"
                      }`}
                    >
                      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                        <div className="min-w-0">
                          {canEditDisplayName(
                            myMembership?.role,
                            myMembership?.user_id,
                            r.user_id
                          ) ? (
                            <div className="flex flex-col gap-2">
                              <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                                <input
                                  className="w-full rounded-md border px-3 py-2 text-sm"
                                  value={editingNames[r.user_id] ?? ""}
                                  onChange={(e) =>
                                    setEditingNames((prev) => ({
                                      ...prev,
                                      [r.user_id]: e.target.value,
                                    }))
                                  }
                                  placeholder="表示名を入力"
                                />
                                <button
                                  type="button"
                                  className="w-full rounded-md border px-3 py-2 text-sm disabled:opacity-50 sm:w-auto sm:px-2 sm:py-1 sm:text-xs"
                                  onClick={() => onUpdateDisplayName(r.user_id)}
                                  disabled={
                                    updatingNameUserId === r.user_id ||
                                    ((editingNames[r.user_id] ?? "").trim() ===
                                      (p?.display_name ?? "").trim())
                                  }
                                >
                                  {updatingNameUserId === r.user_id ? "保存中..." : "名前を保存"}
                                </button>
                              </div>

                              <div className="text-sm text-gray-600 break-all">{p?.email ?? "-"}</div>
                            </div>
                          ) : (
                            <div className="flex flex-col gap-1">
                              <div className="font-medium">{p?.display_name ?? "名称未設定"}</div>
                              <div className="text-sm text-gray-600 break-all">{p?.email ?? "-"}</div>
                            </div>
                          )}

                          <div className="mt-2 flex flex-wrap gap-2">
                            {membershipDepartments.filter((item) => item.user_id === r.user_id).length > 0 ? (
                              membershipDepartments
                                .filter((item) => item.user_id === r.user_id)
                                .map((item) => {
                                  const department = departmentOne(item.departments);
                                  if (!department) return null;

                                  return (
                                    <span
                                      key={`${item.user_id}-${item.department_id}`}
                                      className="inline-flex items-center gap-2 rounded-full border px-2 py-1 text-xs text-gray-700"
                                    >
                                      <span>{department.name}</span>

                                      {canEditDepartments(myMembership?.role) && (
                                        <button
                                          type="button"
                                          className="text-gray-500 hover:text-red-600 disabled:opacity-50"
                                          onClick={() => onRemoveDepartmentFromUser(r.user_id, item.department_id)}
                                          disabled={updatingDepartmentUserId === r.user_id}
                                        >
                                          ×
                                        </button>
                                      )}
                                    </span>
                                  );
                                })
                            ) : (
                              <span className="text-xs text-gray-500">所属部署なし</span>
                            )}
                          </div>

                          {canEditDepartments(myMembership?.role) && (
                            <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-center">
                              <select
                                className="w-full rounded-md border px-3 py-2 text-sm"
                                value={selectedDepartmentIds[r.user_id] ?? ""}
                                onChange={(e) =>
                                  setSelectedDepartmentIds((prev) => ({
                                    ...prev,
                                    [r.user_id]: e.target.value,
                                  }))
                                }
                                disabled={updatingDepartmentUserId === r.user_id || availableDepartments.length === 0}
                              >
                                <option value="">追加する部署を選択</option>
                                {availableDepartments.map((department) => (
                                  <option key={department.id} value={department.id}>
                                    {department.name}
                                  </option>
                                ))}
                              </select>

                              <button
                                type="button"
                                className="w-full rounded-md border px-3 py-2 text-sm disabled:opacity-50 sm:w-auto"
                                onClick={() => onAddDepartmentToUser(r.user_id)}
                                disabled={
                                  updatingDepartmentUserId === r.user_id ||
                                  !selectedDepartmentIds[r.user_id] ||
                                  availableDepartments.length === 0
                                }
                              >
                                {updatingDepartmentUserId === r.user_id ? "更新中..." : "部署を追加"}
                              </button>
                            </div>
                          )}
                        </div>

                        <div className="flex flex-col gap-2">
                          <div className="flex flex-col gap-2 text-sm sm:flex-row sm:flex-wrap sm:items-center">
                            {canEditRole(myMembership?.role) ? (
                              <>
                                <select
                                  className="w-full rounded-md border px-3 py-2 sm:w-auto sm:px-2 sm:py-1"
                                  value={editingRoles[r.user_id] ?? r.role}
                                  onChange={(e) =>
                                    setEditingRoles((prev) => ({
                                      ...prev,
                                      [r.user_id]: e.target.value as Role,
                                    }))
                                  }
                                  disabled={isSelfMembership(myMembership?.user_id, r.user_id)}
                                >
                                  <option value="member">メンバー</option>
                                  <option value="manager">マネージャー</option>
                                  <option value="admin">管理者</option>
                                </select>

                                <button
                                  type="button"
                                  className="w-full rounded-md border px-3 py-2 disabled:opacity-50 sm:w-auto sm:py-1"
                                  onClick={() => onUpdateRole(r.user_id)}
                                  disabled={
                                    updatingUserId === r.user_id ||
                                    isSelfMembership(myMembership?.user_id, r.user_id) ||
                                    (editingRoles[r.user_id] ?? r.role) === r.role
                                  }
                                >
                                  {updatingUserId === r.user_id ? "保存中..." : "保存"}
                                </button>
                              </>
                            ) : (
                              <span className="rounded-md border px-2 py-1">
                                権限: {roleLabel(r.role)}
                              </span>
                            )}

                            <span className="rounded-md border px-2 py-1 text-gray-600">
                              user_id: {shortUserId(r.user_id)}
                            </span>
                          </div>

                          {canEditRole(myMembership?.role) &&
                            isSelfMembership(myMembership?.user_id, r.user_id) && (
                              <p className="text-xs text-gray-500">
                                自分自身の role は変更できません
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