export type Role = "member" | "manager" | "admin";

export type Profile = {
  email: string;
  display_name: string | null;
};

export type Membership = {
  user_id: string;
  branch_id: string;
  role: Role;
  profiles?: Profile | Profile[] | null;
};

export type Department = {
  id: string;
  branch_id: string;
  name: string;
  created_at?: string;
};
export type MembershipDepartment = {
  user_id: string;
  branch_id: string;
  department_id: string;
  departments?: Department | Department[] | null;
};

export type ProfileLookupRow = {
  user_id: string;
  email: string;
  display_name: string | null;
};