// app/tasks/page.tsx
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import TasksClient from "./TasksClient";

export default async function TasksPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  return <TasksClient />;
}