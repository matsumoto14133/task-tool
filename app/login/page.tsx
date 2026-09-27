"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import TurnstileWidget from "@/components/auth/TurnstileWidget";

const supabase = createClient();

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const [captchaKey, setCaptchaKey] = useState(0);
  const [status, setStatus] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleVerify = useCallback((token: string) => {
    setCaptchaToken(token);
  }, []);

  const handleExpire = useCallback(() => {
    setCaptchaToken(null);
  }, []);

  const handleWidgetError = useCallback(() => {
    setCaptchaToken(null);
    setStatus(
      "❌ 認証確認の読み込みに失敗しました。再読み込みしてください。"
    );
  }, []);

  const resetCaptcha = () => {
    setCaptchaToken(null);
    setCaptchaKey((current) => current + 1);
  };

  // すでにログインしていたら dashboard へ
  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getSession();
      if (data.session) {
        router.replace("/dashboard");
      }
    })();
  }, [router]);

  const onLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setStatus(null);

    if (!captchaToken) {
      setStatus("❌ 認証確認を完了してください。");
      setLoading(false);
      return;
    }

    const { data, error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
      options: {
        captchaToken,
      },
    });

    if (error) {
      setStatus(
        error.code === "captcha_failed"
          ? "❌ 認証確認に失敗しました。もう一度お試しください。"
          : "❌ メールまたはパスワードが間違っています。"
      );
      resetCaptcha();
      setLoading(false);
      return;
    }

    if (!data.session) {
      setStatus(
        "⚠️ ログインできませんでした。メール確認が完了しているか確認してください。"
      );
      resetCaptcha();
      setLoading(false);
      return;
    }

    router.replace("/dashboard");
  };

  return (
    <main className="min-h-screen flex items-center justify-center p-6">
      <div className="w-full max-w-md rounded-xl border p-6">
        <h1 className="text-xl font-bold">Login</h1>

        <form className="mt-6 space-y-4" onSubmit={onLogin}>
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
              autoComplete="current-password"
              required
            />
          </div>

          <TurnstileWidget
            key={captchaKey}
            onVerify={handleVerify}
            onExpire={handleExpire}
            onError={handleWidgetError}
          />

          <button
            className="w-full rounded-md border px-3 py-2 font-medium disabled:opacity-50"
            type="submit"
            disabled={loading}
          >
            {loading ? "Signing in..." : "Sign in"}
          </button>
        </form>

        {status && <p className="mt-4 text-sm">{status}</p>}

        <div className="mt-6 flex flex-wrap items-center justify-between gap-2">
          <Link href="/signup" className="text-sm underline">
            新規アカウント作成
          </Link>

          <Link
            href="/forgot-password"
            className="text-right text-sm underline"
          >
            パスワードを忘れた方
          </Link>
        </div>
      </div>
    </main>
  );
}