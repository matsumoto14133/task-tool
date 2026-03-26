import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import TaskDetailClient from "./TaskDetailClient";

export default async function TaskDetailPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  return <TaskDetailClient />;
}