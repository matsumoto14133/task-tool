import { createClient } from "@/lib/supabase/client";
const supabase = createClient();
import {
  canEditDisplayName,
  canEditDepartments,
  canEditRole,
  canManageDepartments,
  countAdmins,
  isSelfMembership,
} from "@/lib/admin/permissions";
import {
  fetchMyMembership,
  fetchDepartments,
  fetchMembershipDepartments,
  fetchBranchMemberships,
  fetchProfileByEmail,
  fetchMembershipsByUserId,
} from "@/lib/admin/queries";
import type { Membership, Department, MembershipDepartment } from "@/lib/admin/types";

// ユーザー管理ページ用のミューテーション
export type UpdateDisplayNameInput = {
  targetUserId: string;
  displayName: string;
};

export type AddDepartmentToUserInput = {
  targetUserId: string;
  departmentId: string;
};

export async function addDepartmentToUser(
  input: AddDepartmentToUserInput
): Promise<void> {
  if (!input.departmentId) {
    throw new Error("追加する部署を選択してください");
  }

  const { data: userData, error: userErr } = await supabase.auth.getUser();

  if (userErr) {
    throw new Error(userErr.message);
  }

  if (!userData.user) {
    throw new Error("認証されていません");
  }

  const { data: ms, error: msErr } = await fetchMyMembership(userData.user.id);

  if (msErr) {
    throw new Error(msErr.message);
  }

  const myMembership = (ms?.[0] ?? null) as Membership | null;

  if (!myMembership) {
    throw new Error("あなたの memberships が未登録です（admin配布が必要）");
  }

  if (!canEditDepartments(myMembership.role)) {
    throw new Error("部署を編集する権限がありません");
  }

  const [
    { data: departmentsData, error: departmentsError },
    { data: membershipDepartmentsData, error: membershipDepartmentsError },
  ] = await Promise.all([
    fetchDepartments(myMembership.branch_id),
    fetchMembershipDepartments(myMembership.branch_id),
  ]);

  if (departmentsError) {
    throw new Error(departmentsError.message);
  }

  if (membershipDepartmentsError) {
    throw new Error(membershipDepartmentsError.message);
  }

  const departments = (departmentsData ?? []) as Department[];
  const membershipDepartments =
    (membershipDepartmentsData ?? []) as MembershipDepartment[];

  const department = departments.find((d) => d.id === input.departmentId);

  if (!department) {
    throw new Error("選択された部署が見つかりません");
  }

  if (department.branch_id !== myMembership.branch_id) {
    throw new Error("他支部の部署は追加できません");
  }

  const alreadyExists = membershipDepartments.some(
    (item) =>
      item.user_id === input.targetUserId &&
      item.branch_id === myMembership.branch_id &&
      item.department_id === input.departmentId
  );

  if (alreadyExists) {
    throw new Error("その部署はすでに所属済みです");
  }

  const { error } = await supabase.from("membership_departments").insert({
    user_id: input.targetUserId,
    branch_id: myMembership.branch_id,
    department_id: input.departmentId,
  });

  if (error) {
    throw new Error(error.message);
  }
}

export type RemoveDepartmentFromUserInput = {
  targetUserId: string;
  departmentId: string;
};

export async function removeDepartmentFromUser(
  input: RemoveDepartmentFromUserInput
): Promise<void> {
  if (!input.departmentId) {
    throw new Error("削除する部署が指定されていません");
  }

  const { data: userData, error: userErr } = await supabase.auth.getUser();

  if (userErr) {
    throw new Error(userErr.message);
  }

  if (!userData.user) {
    throw new Error("認証されていません");
  }

  const { data: ms, error: msErr } = await fetchMyMembership(userData.user.id);

  if (msErr) {
    throw new Error(msErr.message);
  }

  const myMembership = (ms?.[0] ?? null) as Membership | null;

  if (!myMembership) {
    throw new Error("あなたの memberships が未登録です（admin配布が必要）");
  }

  if (!canEditDepartments(myMembership.role)) {
    throw new Error("部署を編集する権限がありません");
  }

  const { data: membershipDepartmentsData, error: membershipDepartmentsError } =
    await fetchMembershipDepartments(myMembership.branch_id);

  if (membershipDepartmentsError) {
    throw new Error(membershipDepartmentsError.message);
  }

  const membershipDepartments =
    (membershipDepartmentsData ?? []) as MembershipDepartment[];

  const targetRelation = membershipDepartments.find(
    (item) =>
      item.user_id === input.targetUserId &&
      item.branch_id === myMembership.branch_id &&
      item.department_id === input.departmentId
  );

  if (!targetRelation) {
    throw new Error("削除対象の所属部署が見つかりません");
  }

  const { error } = await supabase
    .from("membership_departments")
    .delete()
    .eq("user_id", input.targetUserId)
    .eq("branch_id", myMembership.branch_id)
    .eq("department_id", input.departmentId);

  if (error) {
    throw new Error(error.message);
  }
}

export type UpdateRoleInput = {
  targetUserId: string;
  role: Membership["role"];
};

export async function updateRole(input: UpdateRoleInput): Promise<void> {
  const nextRole = input.role;

  if (!nextRole) {
    throw new Error("変更後の role が不正です");
  }

  const { data: userData, error: userErr } = await supabase.auth.getUser();

  if (userErr) {
    throw new Error(userErr.message);
  }

  if (!userData.user) {
    throw new Error("認証されていません");
  }

  const { data: ms, error: msErr } = await fetchMyMembership(userData.user.id);

  if (msErr) {
    throw new Error(msErr.message);
  }

  const myMembership = (ms?.[0] ?? null) as Membership | null;

  if (!myMembership) {
    throw new Error("あなたの memberships が未登録です（admin配布が必要）");
  }

  if (!canEditRole(myMembership.role)) {
    throw new Error("role を変更する権限がありません");
  }

  const { data: membershipsData, error: membershipsError } =
    await fetchBranchMemberships(myMembership.branch_id);

  if (membershipsError) {
    throw new Error(membershipsError.message);
  }

  const rows = (membershipsData ?? []) as Membership[];

  const targetRow = rows.find((row) => row.user_id === input.targetUserId);

  if (!targetRow) {
    throw new Error("対象ユーザーの membership が見つかりません");
  }

  if (isSelfMembership(myMembership.user_id, input.targetUserId)) {
    throw new Error("自分自身の role は変更できません");
  }

  if (
    targetRow.role === "admin" &&
    nextRole !== "admin" &&
    countAdmins(rows) <= 1
  ) {
    throw new Error("最後のadminは降格できません");
  }

  const { error } = await supabase
    .from("memberships")
    .update({ role: nextRole })
    .eq("user_id", input.targetUserId)
    .eq("branch_id", myMembership.branch_id);

  if (error) {
    throw new Error(error.message);
  }
}

export type CreateMembershipInput = {
  email: string;
  role: Membership["role"];
};

export async function createMembership(
  input: CreateMembershipInput
): Promise<void> {
  const targetEmail = input.email.trim().toLowerCase();

  if (!targetEmail) {
    throw new Error("メールアドレスを入力してください");
  }

  const { data: userData, error: userErr } = await supabase.auth.getUser();

  if (userErr) {
    throw new Error(userErr.message);
  }

  if (!userData.user) {
    throw new Error("認証されていません");
  }

  const { data: ms, error: msErr } = await fetchMyMembership(userData.user.id);

  if (msErr) {
    throw new Error(msErr.message);
  }

  const myMembership = (ms?.[0] ?? null) as Membership | null;

  if (!myMembership) {
    throw new Error("あなたの memberships が未登録です（admin配布が必要）");
  }

  if (!canEditRole(myMembership.role)) {
    throw new Error("membership を付与・更新する権限がありません");
  }

  const { data: prof, error: pErr } = await fetchProfileByEmail(targetEmail);

  if (pErr) {
    throw new Error(pErr.message);
  }

  const target = prof?.[0];

  if (!target) {
    throw new Error(
      "該当ユーザーが見つかりません。先にユーザーにサインアップ＆ログインしてもらい profiles が作成されている必要があります。"
    );
  }

  if (target.user_id === myMembership.user_id) {
    throw new Error("自分自身の role は変更できません");
  }

  const { data: targetMembershipsData, error: targetMembershipsError } =
    await fetchMembershipsByUserId(target.user_id);

  if (targetMembershipsError) {
    throw new Error(targetMembershipsError.message);
  }

  const targetMemberships = (targetMembershipsData ?? []) as Membership[];

  const hasOtherBranchMembership = targetMemberships.some(
    (membership) => membership.branch_id !== myMembership.branch_id
  );

  if (hasOtherBranchMembership) {
    throw new Error("このユーザーはすでに別の支部に所属しているため追加できません");
  }


  const { error: upErr } = await supabase
    .from("memberships")
    .upsert(
      {
        user_id: target.user_id,
        branch_id: myMembership.branch_id,
        role: input.role,
      },
      { onConflict: "user_id,branch_id" }
    );

  if (upErr) {
    throw new Error(upErr.message);
  }
}


// 部署管理ページ用のミューテーション
export type CreateDepartmentInput = {
  name: string;
};

export async function createDepartment(
  input: CreateDepartmentInput
): Promise<void> {
  const name = input.name.trim();

  if (!name) {
    throw new Error("部署名を入力してください");
  }

  const { data: userData, error: userErr } = await supabase.auth.getUser();

  if (userErr) {
    throw new Error(userErr.message);
  }

  if (!userData.user) {
    throw new Error("認証されていません");
  }

  const { data: ms, error: msErr } = await fetchMyMembership(userData.user.id);

  if (msErr) {
    throw new Error(msErr.message);
  }

  const myMembership = (ms?.[0] ?? null) as Membership | null;

  if (!myMembership) {
    throw new Error("あなたの memberships が未登録です");
  }

  if (!canManageDepartments(myMembership.role)) {
    throw new Error("部署を作成する権限がありません");
  }

  const { error } = await supabase.from("departments").insert({
    branch_id: myMembership.branch_id,
    name,
  });

  if (error) {
    throw new Error(error.message);
  }
}

export type RenameDepartmentInput = {
  departmentId: string;
  name: string;
};

export async function renameDepartment(
  input: RenameDepartmentInput
): Promise<void> {
  const nextName = input.name.trim();

  if (!nextName) {
    throw new Error("部署名を入力してください");
  }

  const { data: userData, error: userErr } = await supabase.auth.getUser();

  if (userErr) {
    throw new Error(userErr.message);
  }

  if (!userData.user) {
    throw new Error("認証されていません");
  }

  const { data: ms, error: msErr } = await fetchMyMembership(userData.user.id);

  if (msErr) {
    throw new Error(msErr.message);
  }

  const myMembership = (ms?.[0] ?? null) as Membership | null;

  if (!myMembership) {
    throw new Error("あなたの memberships が未登録です");
  }

  if (!canManageDepartments(myMembership.role)) {
    throw new Error("部署を編集する権限がありません");
  }

  const { data: departmentsData, error: departmentsError } =
    await fetchDepartments(myMembership.branch_id);

  if (departmentsError) {
    throw new Error(departmentsError.message);
  }

  const departments = (departmentsData ?? []) as Department[];

  const currentDepartment = departments.find((d) => d.id === input.departmentId);

  if (!currentDepartment) {
    throw new Error("対象の部署が見つかりません");
  }

  if (currentDepartment.branch_id !== myMembership.branch_id) {
    throw new Error("他支部の部署は編集できません");
  }

  const { error } = await supabase
    .from("departments")
    .update({ name: nextName })
    .eq("id", input.departmentId)
    .eq("branch_id", myMembership.branch_id);

  if (error) {
    throw new Error(error.message);
  }
}

export type DeleteDepartmentInput = {
  departmentId: string;
};

export async function deleteDepartment(
  input: DeleteDepartmentInput
): Promise<void> {
  const { data: userData, error: userErr } = await supabase.auth.getUser();

  if (userErr) {
    throw new Error(userErr.message);
  }

  if (!userData.user) {
    throw new Error("認証されていません");
  }

  const { data: ms, error: msErr } = await fetchMyMembership(userData.user.id);

  if (msErr) {
    throw new Error(msErr.message);
  }

  const myMembership = (ms?.[0] ?? null) as Membership | null;

  if (!myMembership) {
    throw new Error("あなたの memberships が未登録です");
  }

  if (!canManageDepartments(myMembership.role)) {
    throw new Error("部署を削除する権限がありません");
  }

  const [
    { data: departmentsData, error: departmentsError },
    { data: membershipDepartmentsData, error: membershipDepartmentsError },
  ] = await Promise.all([
    fetchDepartments(myMembership.branch_id),
    fetchMembershipDepartments(myMembership.branch_id),
  ]);

  if (departmentsError) {
    throw new Error(departmentsError.message);
  }

  if (membershipDepartmentsError) {
    throw new Error(membershipDepartmentsError.message);
  }

  const departments = (departmentsData ?? []) as Department[];
  const membershipDepartments =
    (membershipDepartmentsData ?? []) as MembershipDepartment[];

  const currentDepartment = departments.find((d) => d.id === input.departmentId);

  if (!currentDepartment) {
    throw new Error("対象の部署が見つかりません");
  }

  if (currentDepartment.branch_id !== myMembership.branch_id) {
    throw new Error("他支部の部署は削除できません");
  }

  const memberCount = membershipDepartments.filter(
    (item) => item.department_id === input.departmentId
  ).length;

  if (memberCount > 0) {
    throw new Error("所属メンバーがいる部署は削除できません");
  }

  const { error } = await supabase
    .from("departments")
    .delete()
    .eq("id", input.departmentId)
    .eq("branch_id", myMembership.branch_id);

  if (error) {
    throw new Error(error.message);
  }
}

// membership削除
export type RemoveMembershipInput = {
  email: string;
};

export async function removeMembershipFromBranch(
  input: RemoveMembershipInput
): Promise<void> {
  const targetEmail = input.email.trim().toLowerCase();

  if (!targetEmail) {
    throw new Error("メールアドレスを入力してください");
  }

  const { data: userData, error: userErr } = await supabase.auth.getUser();

  if (userErr) {
    throw new Error(userErr.message);
  }

  if (!userData.user) {
    throw new Error("認証されていません");
  }

  const { data: ms, error: msErr } = await fetchMyMembership(userData.user.id);

  if (msErr) {
    throw new Error(msErr.message);
  }

  const myMembership = (ms?.[0] ?? null) as Membership | null;

  if (!myMembership) {
    throw new Error("あなたの memberships が未登録です（admin配布が必要）");
  }

  if (!canEditRole(myMembership.role)) {
    throw new Error("支部メンバーを削除する権限がありません");
  }

  const { data: prof, error: pErr } = await fetchProfileByEmail(targetEmail);

  if (pErr) {
    throw new Error(pErr.message);
  }

  const target = prof?.[0];

  if (!target) {
    throw new Error("該当ユーザーが見つかりません");
  }

  const { data: membershipsData, error: membershipsError } =
    await fetchBranchMemberships(myMembership.branch_id);

  if (membershipsError) {
    throw new Error(membershipsError.message);
  }

  const rows = (membershipsData ?? []) as Membership[];
  const targetRow = rows.find((row) => row.user_id === target.user_id);

  if (!targetRow) {
    throw new Error("そのユーザーはこの支部に所属していません");
  }

  if (targetRow.role === "admin") {
    throw new Error("管理者は支部から削除できません");
  }

  if (isSelfMembership(myMembership.user_id, target.user_id)) {
    throw new Error("自分自身は支部から削除できません");
  }

  const { error } = await supabase
    .from("memberships")
    .delete()
    .eq("user_id", target.user_id)
    .eq("branch_id", myMembership.branch_id);

  if (error) {
    throw new Error(error.message);
  }
}