import { SupabaseClient } from "@supabase/supabase-js";

export type Project = {
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

export async function fetchProjects(
  supabase: SupabaseClient,
  branchId: string
): Promise<Project[]> {
  const { data, error } = await supabase
    .from("projects")
    .select("*")
    .eq("branch_id", branchId)
    .order("created_at", { ascending: false });

  if (error) throw error;
  return (data ?? []) as Project[];
}