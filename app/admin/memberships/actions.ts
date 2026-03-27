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