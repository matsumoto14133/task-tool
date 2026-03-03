"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase/client";

export default function Home() {
  const [status, setStatus] = useState("checking...");

  useEffect(() => {
    (async () => {
      const { data, error } = await supabase.auth.getSession();
      if (error) setStatus(`error: ${error.message}`);
      else setStatus(`ok: session=${data.session ? "yes" : "no"}`);
    })();
  }, []);

  return (
    <main className="p-6">
      <h1 className="text-xl font-bold">Supabase connection test</h1>
      <p className="mt-2">{status}</p>
    </main>
  );
}