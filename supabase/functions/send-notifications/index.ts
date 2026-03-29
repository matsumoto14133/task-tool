import { createClient } from "npm:@supabase/supabase-js@2";
import { pushLineMessage } from "../_shared/lineSendService.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const LINE_CHANNEL_ACCESS_TOKEN = Deno.env.get("LINE_CHANNEL_ACCESS_TOKEN")!;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

type NotificationJobRow = {
  id: string;
  user_id: string;
  channel: "line" | "email" | "in_app";
  notification_type: "task_due" | "task_planned";
  task_id: string | null;
  assignee_user_id: string | null;
  scheduled_for: string;
  status: "pending" | "processing" | "sent" | "failed" | "canceled";
  dedupe_key: string;
  title: string;
  body: string;
  payload: Record<string, unknown>;
  provider_message_id: string | null;
  last_error: string | null;
  retry_count: number;
  max_retry_count: number;
  locked_at: string | null;
  sent_at: string | null;
  created_at: string;
  updated_at: string;
};

type LineAccountRow = {
  id: string;
  user_id: string;
  line_user_id: string;
  is_active: boolean;
};

async function fetchPendingLineJobs(nowIso: string) {
  return supabase
    .from("notification_jobs")
    .select("*")
    .eq("status", "pending")
    .eq("channel", "line")
    .lte("scheduled_for", nowIso)
    .order("scheduled_for", { ascending: true })
    .limit(50)
    .returns<NotificationJobRow[]>();
}

async function getActiveLineAccountByUserId(userId: string) {
  return supabase
    .from("line_accounts")
    .select("*")
    .eq("user_id", userId)
    .eq("is_active", true)
    .maybeSingle<LineAccountRow>();
}

async function markJobProcessing(jobId: string) {
  return supabase
    .from("notification_jobs")
    .update({
      status: "processing",
      locked_at: new Date().toISOString(),
    })
    .eq("id", jobId)
    .eq("status", "pending");
}

async function markJobSent(jobId: string) {
  return supabase
    .from("notification_jobs")
    .update({
      status: "sent",
      sent_at: new Date().toISOString(),
      locked_at: null,
      last_error: null,
    })
    .eq("id", jobId);
}

async function markJobFailedOrRetry(job: NotificationJobRow, errorMessage: string) {
  const nextRetryCount = job.retry_count + 1;
  const nextStatus =
    nextRetryCount >= job.max_retry_count ? "failed" : "pending";

  return supabase
    .from("notification_jobs")
    .update({
      status: nextStatus,
      retry_count: nextRetryCount,
      last_error: errorMessage,
      locked_at: null,
    })
    .eq("id", job.id);
}

Deno.serve(async () => {
  const nowIso = new Date().toISOString();

  const { data: jobs, error } = await fetchPendingLineJobs(nowIso);

  if (error) {
    console.error("fetchPendingLineJobs error", error);

    return new Response(JSON.stringify({ ok: false, error: error.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  let processedCount = 0;
  let sentCount = 0;
  let failedCount = 0;

  for (const job of jobs ?? []) {
    processedCount += 1;

    await markJobProcessing(job.id);

    try {
      const { data: lineAccount, error: lineAccountError } =
        await getActiveLineAccountByUserId(job.user_id);

      if (lineAccountError) {
        throw lineAccountError;
      }

      if (!lineAccount) {
        throw new Error("LINE連携済みアカウントが見つかりません。");
      }

      await pushLineMessage({
        channelAccessToken: LINE_CHANNEL_ACCESS_TOKEN,
        lineUserId: lineAccount.line_user_id,
        text: job.body,
      });

      await markJobSent(job.id);
      sentCount += 1;
    } catch (error) {
      console.error("send notification error", error);

      const message =
        error instanceof Error
          ? error.message
          : "通知送信に失敗しました。";

      await markJobFailedOrRetry(job, message);
      failedCount += 1;
    }
  }

  return new Response(
    JSON.stringify({
      ok: true,
      processedCount,
      sentCount,
      failedCount,
    }),
    {
      status: 200,
      headers: { "Content-Type": "application/json" },
    }
  );
});