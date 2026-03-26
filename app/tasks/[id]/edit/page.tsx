import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import TaskEditClient from "./TaskEditClient";

export default async function TaskEditPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  return <TaskEditClient />;
}