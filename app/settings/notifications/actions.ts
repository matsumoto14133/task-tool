"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { issueLineLinkToken } from "@/lib/notifications/lineLinkService";
import { upsertUserNotificationProfile } from "@/lib/notifications/notificationQueries";

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

export type SaveNotificationSettingsActionState = {
  ok: boolean;
  message: string;
};

export async function saveNotificationSettingsAction(input: {
  dailySummaryTime: string;
}): Promise<SaveNotificationSettingsActionState> {
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
    await upsertUserNotificationProfile(supabase, {
      user_id: user.id,
      daily_summary_time: `${input.dailySummaryTime}:00`,
    });

    revalidatePath("/settings/notifications");

    return {
      ok: true,
      message: "通知設定を保存しました。",
    };
  } catch (error) {
    console.error("saveNotificationSettingsAction error", error);

    return {
      ok: false,
      message: "通知設定の保存に失敗しました。",
    };
  }
}

export type UnlinkLineAccountActionState = {
  ok: boolean;
  message: string;
};

export async function unlinkLineAccountAction(): Promise<UnlinkLineAccountActionState> {
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
    const { error: lineAccountsError } = await supabase
      .from("line_accounts")
      .delete()
      .eq("user_id", user.id);

    if (lineAccountsError) {
      throw lineAccountsError;
    }

    const { error: lineLinkTokensError } = await supabase
      .from("line_link_tokens")
      .delete()
      .eq("user_id", user.id);

    if (lineLinkTokensError) {
      throw lineLinkTokensError;
    }

    revalidatePath("/settings/notifications");

    return {
      ok: true,
      message: "LINE連携を解除しました。",
    };
  } catch (error) {
    console.error("unlinkLineAccountAction error", error);

    return {
      ok: false,
      message: "LINE連携の解除に失敗しました。",
    };
  }
}