import { createClient } from "@/lib/supabase/client";
const supabase = createClient();

export async function fetchMyMembership(userId: string) {
  return await supabase
    .from("memberships")
    .select(`user_id, branch_id, role, profiles ( email, display_name )`)
    .eq("user_id", userId)
    .order("created_at", { ascending: true })
    .limit(1);
}

export async function fetchBranchMemberships(branchId: string) {
  return await supabase
    .from("memberships")
    .select(`user_id, branch_id, role, profiles ( email, display_name )`)
    .eq("branch_id", branchId)
    .order("created_at", { ascending: true });
}

export async function fetchDepartments(branchId: string) {
  return await supabase
    .from("departments")
    .select("id, branch_id, name, created_at")
    .eq("branch_id", branchId)
    .order("created_at", { ascending: true });
}

export async function fetchMembershipDepartments(branchId: string) {
  return await supabase
    .from("membership_departments")
    .select(`
      user_id,
      branch_id,
      department_id,
      departments ( id, branch_id, name )
    `)
    .eq("branch_id", branchId);
}

export async function fetchProfileByEmail(targetEmail: string) {
  const result = await supabase
    .from("profiles")
    .select("user_id, email, display_name")
    .eq("email", targetEmail)
    .limit(1);

  console.log("[fetchProfileByEmail] targetEmail =", targetEmail);
  console.log("[fetchProfileByEmail] result =", result);

  return result;
}

export async function fetchMembershipsByUserId(userId: string) {
  return await supabase
    .from("memberships")
    .select("user_id, branch_id, role")
    .eq("user_id", userId)
    .order("created_at", { ascending: true });
}