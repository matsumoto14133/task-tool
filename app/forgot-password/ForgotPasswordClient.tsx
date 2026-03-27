"use client";

import Link from "next/link";
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import TurnstileWidget from "@/components/auth/TurnstileWidget";

const supabase = createClient();

export default function ForgotPasswordClient() {
  const [email, setEmail] = useState("");
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setErrorMsg(null);
    setSuccessMsg(null);

    if (!captchaToken) {
      setErrorMsg("認証確認を完了してください。");
      setLoading(false);
      return;
    }

    try {
      const redirectTo = `${window.location.origin}/reset-password`;

      const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
        redirectTo,
        captchaToken,
      });

      if (error) {
        throw new Error(error.message);
      }

      setSuccessMsg(
        "パスワード再設定メールを送信しました。メールをご確認ください。"
      );
      setEmail("");
      setCaptchaToken(null);
    } catch (err) {
      setErrorMsg(
        err instanceof Error
          ? err.message
          : "再設定メールの送信に失敗しました"
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="p-6">
      <div className="mx-auto max-w-md rounded-lg border p-6">
        <h1 className="text-2xl font-bold">パスワード再設定</h1>
        <p className="mt-2 text-sm text-gray-600">
          登録済みメールアドレスを入力してください。
        </p>

        <form onSubmit={onSubmit} className="mt-6 space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium">
              メールアドレス
            </label>
            <input
              type="email"
              className="w-full rounded-md border px-3 py-2"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>

          {errorMsg && <p className="text-sm text-red-600">❌ {errorMsg}</p>}
          {successMsg && <p className="text-sm text-green-600">✅ {successMsg}</p>}

          <TurnstileWidget
            onVerify={(token) => {
              setCaptchaToken(token);
            }}
            onExpire={() => {
              setCaptchaToken(null);
            }}
            onError={() => {
              setCaptchaToken(null);
              setErrorMsg("認証確認の読み込みに失敗しました。再読み込みしてください。");
            }}
          />

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-md border px-4 py-2"
          >
            {loading ? "送信中..." : "再設定メールを送る"}
          </button>
        </form>

        <div className="mt-4">
          <Link href="/login" className="text-sm underline">
            ログイン画面へ戻る
          </Link>
        </div>
      </div>
    </main>
  );
}