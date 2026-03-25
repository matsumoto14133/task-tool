"use client";

import { useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
const supabase = createClient();

export default function SignupPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const onSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setStatus(null);

    const { error } = await supabase.auth.signUp({
      email,
      password,
    });

    if (error) {
      setStatus(`❌ ${error.message}`);
      setLoading(false);
      return;
    }

    // Confirm email ON の場合、ここでログイン完了ではなく確認メール送信が走る
    setStatus("✅ 登録OK。確認メールを送信しました。メール内のリンクを開いてください。");
    setLoading(false);
  };

  return (
    <main className="min-h-screen flex items-center justify-center p-6">
      <div className="w-full max-w-md rounded-xl border p-6">
        <h1 className="text-xl font-bold">Sign up</h1>

        <form className="mt-6 space-y-4" onSubmit={onSignup}>
          <div>
            <label className="block text-sm font-medium">Email</label>
            <input
              className="mt-1 w-full rounded-md border px-3 py-2"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium">Password</label>
            <input
              className="mt-1 w-full rounded-md border px-3 py-2"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="new-password"
              required
              minLength={8}
            />
            <p className="mt-1 text-xs text-gray-600">8文字以上推奨</p>
          </div>

          <button
            className="w-full rounded-md border px-3 py-2 font-medium disabled:opacity-50"
            type="submit"
            disabled={loading}
          >
            {loading ? "Creating..." : "Create account"}
          </button>
        </form>

        {status && <p className="mt-4 text-sm">{status}</p>}

        <p className="mt-6 text-sm">
          既にアカウントがある？{" "}
          <Link className="underline" href="/login">
            ログインへ
          </Link>
        </p>
      </div>
    </main>
  );
}