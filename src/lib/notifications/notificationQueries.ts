import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  LineAccountRow,
  LineLinkTokenRow,
  NotificationJobRow,
  NotificationSettingRow,
  UserNotificationProfileRow,
} from "./notificationTypes";

export async function getLineAccountByUserId(
  supabase: SupabaseClient,
  userId: string
) {
  return supabase
    .from("line_accounts")
    .select("*")
    .eq("user_id", userId)
    .eq("is_active", true)
    .maybeSingle<LineAccountRow>();
}

export async function getNotificationSettingsByUserId(
  supabase: SupabaseClient,
  userId: string
) {
  return supabase
    .from("notification_settings")
    .select("*")
    .eq("user_id", userId)
    .order("channel")
    .order("notification_type")
    .order("timing_type")
    .returns<NotificationSettingRow[]>();
}

export async function insertLineLinkToken(
  supabase: SupabaseClient,
  input: {
    user_id: string;
    token: string;
    expires_at: string;
  }
) {
  return supabase
    .from("line_link_tokens")
    .insert(input)
    .select("*")
    .single<LineLinkTokenRow>();
}

export async function getValidLineLinkToken(
  supabase: SupabaseClient,
  token: string
) {
  return supabase
    .from("line_link_tokens")
    .select("*")
    .eq("token", token)
    .is("used_at", null)
    .gt("expires_at", new Date().toISOString())
    .maybeSingle<LineLinkTokenRow>();
}

export async function upsertLineAccount(
  supabase: SupabaseClient,
  input: {
    user_id: string;
    line_user_id: string;
    display_name?: string | null;
    picture_url?: string | null;
    status_message?: string | null;
  }
) {
  return supabase
    .from("line_accounts")
    .upsert(
      {
        user_id: input.user_id,
        line_user_id: input.line_user_id,
        display_name: input.display_name ?? null,
        picture_url: input.picture_url ?? null,
        status_message: input.status_message ?? null,
        is_active: true,
        linked_at: new Date().toISOString(),
        unlinked_at: null,
      },
      { onConflict: "user_id" }
    )
    .select("*")
    .single<LineAccountRow>();
}

export async function markLineLinkTokenUsed(
  supabase: SupabaseClient,
  tokenId: string,
  lineUserId: string
) {
  return supabase
    .from("line_link_tokens")
    .update({
      used_at: new Date().toISOString(),
      linked_line_user_id: lineUserId,
    })
    .eq("id", tokenId);
}

export async function insertNotificationJob(
  supabase: SupabaseClient,
  input: {
    user_id: string;
    channel: "line" | "email" | "in_app";
    notification_type: "task_due" | "task_planned";
    task_id?: string | null;
    assignee_user_id?: string | null;
    scheduled_for: string;
    dedupe_key: string;
    title: string;
    body: string;
    payload?: Record<string, unknown>;
  }
) {
  return supabase
    .from("notification_jobs")
    .insert({
      user_id: input.user_id,
      channel: input.channel,
      notification_type: input.notification_type,
      task_id: input.task_id ?? null,
      assignee_user_id: input.assignee_user_id ?? null,
      scheduled_for: input.scheduled_for,
      dedupe_key: input.dedupe_key,
      title: input.title,
      body: input.body,
      payload: input.payload ?? {},
    })
    .select("*")
    .single<NotificationJobRow>();
}

export type DueTaskNotificationTargetRow = {
  task_id: string;
  task_title: string;
  due_at: string;
  assignee_user_id: string;
};

export async function fetchDueDayBeforeNotificationTargets(
  supabase: SupabaseClient,
  nowIso: string
) {
  return supabase.rpc("get_due_day_before_notification_targets", {
    p_now: nowIso,
  });
}

export async function insertNotificationJobIfNotExists(
  supabase: SupabaseClient,
  input: {
    user_id: string;
    channel: "line" | "email" | "in_app";
    notification_type: "task_due" | "task_planned";
    task_id?: string | null;
    assignee_user_id?: string | null;
    scheduled_for: string;
    dedupe_key: string;
    title: string;
    body: string;
    payload?: Record<string, unknown>;
  }
) {
  return supabase
    .from("notification_jobs")
    .upsert(
      {
        user_id: input.user_id,
        channel: input.channel,
        notification_type: input.notification_type,
        task_id: input.task_id ?? null,
        assignee_user_id: input.assignee_user_id ?? null,
        scheduled_for: input.scheduled_for,
        dedupe_key: input.dedupe_key,
        title: input.title,
        body: input.body,
        payload: input.payload ?? {},
      },
      { onConflict: "dedupe_key", ignoreDuplicates: true }
    )
    .select("*");
}

export async function getUserNotificationProfile(
  supabase: SupabaseClient,
  userId: string
) {
  return supabase
    .from("user_notification_profiles")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle<UserNotificationProfileRow>();
}

export async function upsertUserNotificationProfile(
  supabase: SupabaseClient,
  input: {
    user_id: string;
    daily_summary_time: string;
  }
) {
  return supabase
    .from("user_notification_profiles")
    .upsert(
      {
        user_id: input.user_id,
        daily_summary_time: input.daily_summary_time,
      },
      { onConflict: "user_id" }
    )
    .select("*")
    .single<UserNotificationProfileRow>();
}

export async function upsertNotificationSetting(
  supabase: SupabaseClient,
  input: {
    user_id: string;
    channel: "line" | "email" | "in_app";
    notification_type: "task_due" | "task_planned";
    timing_type: "day_before" | "same_day" | "custom_minutes_before";
    offset_minutes: number | null;
    is_enabled: boolean;
  }
) {
  return supabase
    .from("notification_settings")
    .upsert(
      {
        user_id: input.user_id,
        channel: input.channel,
        notification_type: input.notification_type,
        timing_type: input.timing_type,
        offset_minutes: input.offset_minutes,
        is_enabled: input.is_enabled,
      },
      {
        onConflict:
          "user_id,channel,notification_type,timing_type,offset_minutes",
      }
    )
    .select("*");
}