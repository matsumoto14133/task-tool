"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabase/client";

type Role = "member" | "manager" | "admin";

type Membership = {
  user_id: string;
  branch_id: string;
  department_id: string | null;
  role: Role;
  profiles?: { email: string; display_name: string | null } | { email: string; display_name: string | null }[] | null;
};

function profileOne(p: any): { email: string; display_name: string | null } | null {
  if (!p) return null;
  return Array.isArray(p) ? (p[0] ?? null) : p;
}

export default function AdminMembershipsPage() {
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [myMembership, setMyMembership] = useState<Membership | null>(null);
  const isAdmin = myMembership?.role === "admin";

  const [rows, setRows] = useState<Membership[]>([]);

  // form
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<Role>("member");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      setLoading(true);
      setErrorMsg(null);

      const { data: userData, error: userErr } = await supabase.auth.getUser();
      if (userErr) {
        setErrorMsg(userErr.message);
        setLoading(false);
        return;
      }
      if (!userData.user) {
        router.replace("/login");
        return;
      }

      // 自分の membership 取得
      const { data: ms, error: msErr } = await supabase
        .from("memberships")
        .select(`user_id, branch_id, department_id, role, profiles ( email, display_name )`)
        .eq("user_id", userData.user.id)
        .order("created_at", { ascending: true })
        .limit(1);

      if (msErr) {
        setErrorMsg(msErr.message);
        setLoading(false);
        return;
      }

      const mine = (ms?.[0] ?? null) as Membership | null;
      if (!mine) {
        setErrorMsg("あなたの memberships が未登録です（admin配布が必要）");
        setLoading(false);
        return;
      }
      setMyMembership(mine);

      // admin でなければここで止める（UIガード）
      if (mine.role !== "admin") {
        setErrorMsg("権限がありません（adminのみ）");
        setLoading(false);
        return;
      }

      // 同一支部の memberships 一覧
      const { data: list, error: listErr } = await supabase
        .from("memberships")
        .select(`user_id, branch_id, department_id, role, profiles ( email, display_name )`)
        .eq("branch_id", mine.branch_id)
        .order("created_at", { ascending: true });

      if (listErr) {
        setErrorMsg(listErr.message);
        setLoading(false);
        return;
      }

      setRows((list ?? []) as Membership[]);
      setLoading(false);
    })();
  }, [router]);

  const onGrant = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!myMembership || !isAdmin) return;

    setSaving(true);
    setErrorMsg(null);

    const targetEmail = email.trim().toLowerCase();
    if (!targetEmail) {
      setErrorMsg("メールアドレスを入力してください");
      setSaving(false);
      return;
    }

    // profiles から user_id を引く（auth.users は見れないのでこれが正攻法）
    const { data: prof, error: pErr } = await supabase
      .from("profiles")
      .select("user_id, email, display_name")
      .eq("email", targetEmail)
      .limit(1);

    if (pErr) {
      setErrorMsg(pErr.message);
      setSaving(false);
      return;
    }
    const target = prof?.[0];
    if (!target) {
      setErrorMsg("該当ユーザーが見つかりません。先にユーザーにサインアップ＆ログインしてもらい profiles が作成されている必要があります。");
      setSaving(false);
      return;
    }

    // memberships を upsert（同一支部で二重登録を防ぐ想定：user_id+branch_id unique）
    const { error: upErr } = await supabase
      .from("memberships")
      .upsert(
        {
          user_id: target.user_id,
          branch_id: myMembership.branch_id,
          department_id: null, // 部署は後で
          role,
        },
        { onConflict: "user_id,branch_id" }
      );

    if (upErr) {
      setErrorMsg(upErr.message);
      setSaving(false);
      return;
    }

    // 一覧を再取得（簡単にリロード）
    const { data: list, error: listErr } = await supabase
      .from("memberships")
      .select(`user_id, branch_id, department_id, role, profiles ( email, display_name )`)
      .eq("branch_id", myMembership.branch_id)
      .order("created_at", { ascending: true });

    if (listErr) {
      setErrorMsg(listErr.message);
      setSaving(false);
      return;
    }

    setRows((list ?? []) as Membership[]);
    setEmail("");
    setSaving(false);
  };

  return (
    <main className="p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Membership 配布（admin）</h1>
          <div className="mt-3 flex items-center gap-2">
            <Link className="rounded-md border px-3 py-2" href="/dashboard">
              個人ホームへ
            </Link>
            <Link className="rounded-md border px-3 py-2" href="/tasks">
              タスク一覧へ
            </Link>
          </div>
        </div>
      </div>

      {loading && <p className="mt-4 text-sm">読み込み中...</p>}
      {errorMsg && <p className="mt-4 text-sm text-red-600">❌ {errorMsg}</p>}

      {!loading && isAdmin && myMembership && (
        <>
          <section className="mt-8 max-w-xl">
            <h2 className="text-lg font-semibold">配布</h2>
            <form className="mt-4 space-y-4" onSubmit={onGrant}>
              <div>
                <label className="block text-sm font-medium">対象ユーザーのメール</label>
                <input
                  className="mt-1 w-full rounded-md border px-3 py-2"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="user@example.com"
                />
              </div>

              <div>
                <label className="block text-sm font-medium">付与ロール</label>
                <select
                  className="mt-1 w-full rounded-md border px-3 py-2"
                  value={role}
                  onChange={(e) => setRole(e.target.value as Role)}
                >
                  <option value="member">メンバー</option>
                  <option value="manager">マネージャー</option>
                  <option value="admin">管理者</option>
                </select>
              </div>

              <button
                className="rounded-md border px-3 py-2 disabled:opacity-50"
                disabled={saving}
              >
                {saving ? "付与中..." : "membership を付与/更新"}
              </button>
            </form>
          </section>

          <section className="mt-10">
            <h2 className="text-lg font-semibold">同一支部の所属一覧</h2>
            {rows.length === 0 ? (
              <p className="mt-3 text-sm text-gray-600">まだ所属がありません。</p>
            ) : (
              <ul className="mt-4 space-y-2">
                {rows.map((r) => {
                  const p = profileOne((r as any).profiles);
                  return (
                    <li key={r.user_id} className="rounded-lg border p-3 text-sm">
                      <div className="font-medium">
                        {p?.display_name ?? "-"}（{p?.email ?? "-"}）
                      </div>
                      <div className="text-gray-600">
                        role: {r.role} / user_id: {r.user_id}
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        </>
      )}
    </main>
  );
}