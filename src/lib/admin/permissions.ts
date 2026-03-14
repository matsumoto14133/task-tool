import type { Role, Membership, MembershipDepartment } from "@/lib/admin/types";

export function canAccessMembershipsPage(role: Role | undefined) {
  return role === "admin" || role === "manager" || role === "member";
}

export function canManageMemberships(role: Role | undefined) {
  return canAccessMembershipsPage(role);
}

export function canManageDepartments(role: Role | undefined) {
  return role === "admin";
}

export function canEditRole(actorRole: Role | undefined) {
  return actorRole === "admin";
}

export function canEditDisplayName(
  actorRole: Role | undefined,
  actorUserId: string | undefined,
  targetUserId: string
) {
  if (actorRole === "admin") return true;
  return actorUserId === targetUserId;
}

export function canEditDepartments(actorRole: Role | undefined) {
  return actorRole === "admin" || actorRole === "manager";
}

export function isSelfMembership(
  actorUserId: string | undefined,
  targetUserId: string
) {
  return actorUserId === targetUserId;
}

export function countAdmins(rows: Membership[]) {
  return rows.filter((row) => row.role === "admin").length;
}


export function countMembersInDepartment(
  departmentId: string,
  membershipDepartments: MembershipDepartment[]
) {
  return membershipDepartments.filter((item) => item.department_id === departmentId).length;
}

export function canDeleteDepartment(
  departmentId: string,
  membershipDepartments: MembershipDepartment[]
) {
  return countMembersInDepartment(departmentId, membershipDepartments) === 0;
}