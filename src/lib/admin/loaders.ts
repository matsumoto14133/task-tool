import { supabase } from "@/lib/supabase/client";
import type {
  Membership,
  Department,
  MembershipDepartment,
} from "@/lib/admin/types";
import { 
  canAccessMembershipsPage,
  canManageDepartments
} from "@/lib/admin/permissions";
import {
  fetchMyMembership,
  fetchBranchMemberships,
  fetchDepartments,
  fetchMembershipDepartments,
} from "@/lib/admin/queries";

// ユーザー管理ページ用のローダー
export type AdminMembershipsPageRowsData = {
  rows: Membership[];
  departments: Department[];
  membershipDepartments: MembershipDepartment[];
};

export async function loadAdminMembershipsPageRowsData(
  branchId: string
): Promise<AdminMembershipsPageRowsData> {
  const [
    { data: membershipsData, error: membershipsError },
    { data: departmentsData, error: departmentsError },
    { data: membershipDepartmentsData, error: membershipDepartmentsError },
  ] = await Promise.all([
    fetchBranchMemberships(branchId),
    fetchDepartments(branchId),
    fetchMembershipDepartments(branchId),
  ]);

  if (membershipsError) {
    throw membershipsError;
  }

  if (departmentsError) {
    throw departmentsError;
  }

  if (membershipDepartmentsError) {
    throw membershipDepartmentsError;
  }

  return {
    rows: (membershipsData ?? []) as Membership[],
    departments: (departmentsData ?? []) as Department[],
    membershipDepartments:
      (membershipDepartmentsData ?? []) as MembershipDepartment[],
  };
}

export type AdminMembershipsPageInitialData = {
  myMembership: Membership;
  rows: Membership[];
  departments: Department[];
  membershipDepartments: MembershipDepartment[];
};

export async function loadAdminMembershipsPageInitialData(): Promise<AdminMembershipsPageInitialData> {
  const { data: userData, error: userErr } = await supabase.auth.getUser();

  if (userErr) {
    throw new Error(userErr.message);
  }

  if (!userData.user) {
    throw new Error("UNAUTHENTICATED");
  }

  const { data: ms, error: msErr } = await fetchMyMembership(userData.user.id);

  if (msErr) {
    throw new Error(msErr.message);
  }

  const mine = (ms?.[0] ?? null) as Membership | null;

  if (!mine) {
    throw new Error("あなたの memberships が未登録です（admin配布が必要）");
  }

  if (!canAccessMembershipsPage(mine.role)) {
    throw new Error("権限がありません");
  }

  const rowsData = await loadAdminMembershipsPageRowsData(mine.branch_id);

  return {
    myMembership: mine,
    rows: rowsData.rows,
    departments: rowsData.departments,
    membershipDepartments: rowsData.membershipDepartments,
  };
}

// 部署管理ページ用のローダー
export type AdminDepartmentsPageRowsData = {
  departments: Department[];
  membershipDepartments: MembershipDepartment[];
};

export type AdminDepartmentsPageInitialData = {
  myMembership: Membership;
  departments: Department[];
  membershipDepartments: MembershipDepartment[];
};

export async function loadAdminDepartmentsPageRowsData(
  branchId: string
): Promise<AdminDepartmentsPageRowsData> {
  const [
    { data: departmentsData, error: departmentsError },
    { data: membershipDepartmentsData, error: membershipDepartmentsError },
  ] = await Promise.all([
    fetchDepartments(branchId),
    fetchMembershipDepartments(branchId),
  ]);

  if (departmentsError) {
    throw new Error(departmentsError.message);
  }

  if (membershipDepartmentsError) {
    throw new Error(membershipDepartmentsError.message);
  }

  return {
    departments: (departmentsData ?? []) as Department[],
    membershipDepartments:
      (membershipDepartmentsData ?? []) as MembershipDepartment[],
  };
}

export async function loadAdminDepartmentsPageInitialData(): Promise<AdminDepartmentsPageInitialData> {
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

  const mine = (ms?.[0] ?? null) as Membership | null;

  if (!mine) {
    throw new Error("あなたの memberships が未登録です");
  }

  if (!canManageDepartments(mine.role)) {
    throw new Error("権限がありません（adminのみ）");
  }

  const rowsData = await loadAdminDepartmentsPageRowsData(mine.branch_id);

  return {
    myMembership: mine,
    departments: rowsData.departments,
    membershipDepartments: rowsData.membershipDepartments,
  };
}