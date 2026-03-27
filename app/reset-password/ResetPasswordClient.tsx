"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

const supabase = createClient();

export default function ResetPasswordClient() {
  const router = useRouter();

  const [password, setPassword] = useState("");
  const [passwordConfirm, setPasswordConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(true);
  const [ready, setReady] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;

    const checkSession = async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!mounted) return;

      if (session) {
        setReady(true);
      } else {
        setErrorMsg(
          "再設定リンクが無効か期限切れの可能性があります。再度メールを送信してください。"
        );
      }

      setChecking(false);
    };

    checkSession();

    return () => {
      mounted = false;
    };
  }, []);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (password.length < 8) {
      setErrorMsg("パスワードは8文字以上で入力してください");
      return;
    }

    if (password !== passwordConfirm) {
      setErrorMsg("確認用パスワードが一致しません");
      return;
    }

    setLoading(true);
    setErrorMsg(null);
    setSuccessMsg(null);

    try {
      const { error } = await supabase.auth.updateUser({
        password,
      });

      if (error) {
        throw new Error(error.message);
      }

      setSuccessMsg("パスワードを変更しました。ログイン画面へ移動します。");
      setPassword("");
      setPasswordConfirm("");

      setTimeout(() => {
        router.replace("/login");
      }, 1200);
    } catch (err) {
      setErrorMsg(
        err instanceof Error ? err.message : "パスワード変更に失敗しました"
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="p-6">
      <div className="mx-auto max-w-md rounded-lg border p-6">
        <h1 className="text-2xl font-bold">新しいパスワードを設定</h1>

        {checking ? (
          <p className="mt-4 text-sm text-gray-600">確認中...</p>
        ) : !ready ? (
          <div className="mt-4 space-y-3">
            {errorMsg && <p className="text-sm text-red-600">❌ {errorMsg}</p>}
            <Link href="/forgot-password" className="text-sm underline">
              再設定メール送信画面へ
            </Link>
          </div>
        ) : (
          <form onSubmit={onSubmit} className="mt-6 space-y-4">
            <div>
              <label className="mb-1 block text-sm font-medium">
                新しいパスワード
              </label>
              <input
                type="password"
                className="w-full rounded-md border px-3 py-2"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={8}
              />
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium">
                新しいパスワード（確認）
              </label>
              <input
                type="password"
                className="w-full rounded-md border px-3 py-2"
                value={passwordConfirm}
                onChange={(e) => setPasswordConfirm(e.target.value)}
                required
                minLength={8}
              />
            </div>

            {errorMsg && <p className="text-sm text-red-600">❌ {errorMsg}</p>}
            {successMsg && <p className="text-sm text-green-600">✅ {successMsg}</p>}

            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-md border px-4 py-2"
            >
              {loading ? "変更中..." : "パスワードを変更する"}
            </button>
          </form>
        )}
      </div>
    </main>
  );
}