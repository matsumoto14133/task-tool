"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { canEditDisplayName } from "@/lib/admin/permissions";
import type { Role } from "@/lib/admin/types";

type MembershipRow = {
  user_id: string;
  branch_id: string;
  role: Role;
};

type UpdateDisplayNameActionInput = {
  targetUserId: string;
  displayName: string;
};

export async function updateDisplayNameAction(
  input: UpdateDisplayNameActionInput
): Promise<void> {
  const nextName = input.displayName.trim();

  if (!nextName) {
    throw new Error("表示名を入力してください");
  }

  const supabase = await createClient();

  const {
    data: { user },
    error: userErr,
  } = await supabase.auth.getUser();

  if (userErr) {
    throw new Error(userErr.message);
  }

  if (!user) {
    throw new Error("認証されていません");
  }

  const { data: myMembership, error: myMembershipErr } = await supabase
    .from("memberships")
    .select("user_id, branch_id, role")
    .eq("user_id", user.id)
    .single<MembershipRow>();

  if (myMembershipErr || !myMembership) {
    throw new Error("あなたの memberships が未登録です（admin配布が必要）");
  }

  const { data: targetMembership, error: targetMembershipErr } = await supabase
    .from("memberships")
    .select("user_id, branch_id, role")
    .eq("user_id", input.targetUserId)
    .single<MembershipRow>();

  if (targetMembershipErr || !targetMembership) {
    throw new Error("対象ユーザーの memberships が見つかりません");
  }

  if (myMembership.branch_id !== targetMembership.branch_id) {
    throw new Error("同一branchのユーザーのみ表示名を変更できます");
  }

  if (
    !canEditDisplayName(
      myMembership.role,
      myMembership.user_id,
      input.targetUserId
    )
  ) {
    throw new Error("表示名を変更する権限がありません");
  }

  const adminSupabase = createAdminClient();

  const { error: updateErr } = await adminSupabase
    .from("profiles")
    .update({ display_name: nextName })
    .eq("user_id", input.targetUserId);

  if (updateErr) {
    throw new Error(updateErr.message);
  }
}

type CreateMembershipActionInput = {
  email: string;
  role: Role;
};

export async function createMembershipAction(
  input: CreateMembershipActionInput
): Promise<void> {
  const targetEmail = input.email.trim().toLowerCase();

  if (!targetEmail) {
    throw new Error("メールアドレスを入力してください");
  }

  const supabase = await createClient();

  const {
    data: { user },
    error: userErr,
  } = await supabase.auth.getUser();

  if (userErr) {
    throw new Error(userErr.message);
  }

  if (!user) {
    throw new Error("認証されていません");
  }

  const { data: myMembership, error: myMembershipErr } = await supabase
    .from("memberships")
    .select("user_id, branch_id, role")
    .eq("user_id", user.id)
    .single<MembershipRow>();

  if (myMembershipErr || !myMembership) {
    throw new Error("あなたの memberships が未登録です（admin配布が必要）");
  }

  if (myMembership.role !== "admin") {
    throw new Error("membership を付与・更新する権限がありません");
  }

  const adminSupabase = createAdminClient();

  const { data: targetProfile, error: profileErr } = await adminSupabase
    .from("profiles")
    .select("user_id, email, display_name")
    .ilike("email", targetEmail)
    .maybeSingle();

  if (profileErr) {
    throw new Error(profileErr.message);
  }

  if (!targetProfile) {
    throw new Error(
      "該当ユーザーが見つかりません。先にユーザーにサインアップ＆ログインしてもらい profiles が作成されている必要があります。"
    );
  }

  if (targetProfile.user_id === myMembership.user_id) {
    throw new Error("自分自身の role は変更できません");
  }

  const { data: targetMemberships, error: targetMembershipsError } =
    await adminSupabase
      .from("memberships")
      .select("user_id, branch_id, role")
      .eq("user_id", targetProfile.user_id);

  if (targetMembershipsError) {
    throw new Error(targetMembershipsError.message);
  }

  const hasOtherBranchMembership = (targetMemberships ?? []).some(
    (membership) => membership.branch_id !== myMembership.branch_id
  );

  if (hasOtherBranchMembership) {
    throw new Error("このユーザーはすでに別の支部に所属しているため追加できません");
  }

  const { error: upErr } = await adminSupabase
    .from("memberships")
    .upsert(
      {
        user_id: targetProfile.user_id,
        branch_id: myMembership.branch_id,
        role: input.role,
      },
      { onConflict: "user_id,branch_id" }
    );

  if (upErr) {
    throw new Error(upErr.message);
  }
}