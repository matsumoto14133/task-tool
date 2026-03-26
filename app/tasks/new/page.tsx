import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import NewTaskClient from "./NewTaskClient";

export default async function NewTaskPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  return <NewTaskClient />;
}