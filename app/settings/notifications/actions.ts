"use server";

import { revalidatePath } from "next/cache";
import { issueLineLinkToken } from "@/lib/notifications/lineLinkService";
import { createClient } from "@/lib/supabase/server";

export type IssueLineLinkTokenActionState = {
  ok: boolean;
  message: string;
  token?: string;
  expiresAt?: string;
};

export async function issueLineLinkTokenAction(): Promise<IssueLineLinkTokenActionState> {
  const supabase = await createClient();

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return {
      ok: false,
      message: "ログイン情報を確認できませんでした。",
    };
  }

  try {
    const result = await issueLineLinkToken(supabase, user.id);

    revalidatePath("/settings/notifications");

    return {
      ok: true,
      message: "連携コードを発行しました。",
      token: result.token,
      expiresAt: result.expiresAt,
    };
  } catch (error) {
    console.error("issueLineLinkTokenAction error", error);

    return {
      ok: false,
      message: "連携コードの発行に失敗しました。",
    };
  }
}