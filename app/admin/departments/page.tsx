import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import AdminDepartmentsClient from "./AdminDepartmentsClient";

export default async function AdminDepartmentsPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  return <AdminDepartmentsClient />;
}