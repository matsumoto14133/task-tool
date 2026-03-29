"use server";

import { revalidatePath } from "next/cache";
import { issueLineLinkToken } from "@/lib/notifications/lineLinkService";
import { createClient } from "@/lib/supabase/server";
import {
  upsertNotificationSetting,
  upsertUserNotificationProfile,
} from "@/lib/notifications/notificationQueries";

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
  plannedAtEnabled: boolean;
  plannedCustomEnabled: boolean;
  plannedCustomMinutes: number;
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

    await upsertNotificationSetting(supabase, {
      user_id: user.id,
      channel: "line",
      notification_type: "task_planned",
      timing_type: "same_day",
      offset_minutes: null,
      is_enabled: input.plannedAtEnabled,
    });

    await upsertNotificationSetting(supabase, {
      user_id: user.id,
      channel: "line",
      notification_type: "task_planned",
      timing_type: "custom_minutes_before",
      offset_minutes: input.plannedCustomMinutes,
      is_enabled: input.plannedCustomEnabled,
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