import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import ProjectEditClient from "./ProjectEditClient";

export default async function ProjectEditPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  return <ProjectEditClient />;
}