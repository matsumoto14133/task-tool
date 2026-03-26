import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import AdminMembershipsClient from "./AdminMembershipsClient";

export default async function AdminMembershipsPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  return <AdminMembershipsClient />;
}