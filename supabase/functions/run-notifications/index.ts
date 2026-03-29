import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const LINE_CHANNEL_ACCESS_TOKEN = Deno.env.get("LINE_CHANNEL_ACCESS_TOKEN")!;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

type SummaryTargetRow = {
  user_id: string;
  section:
    | "due_today"
    | "due_tomorrow"
    | "planned_today"
    | "planned_tomorrow";
  task_id: string;
  task_title: string;
  target_at: string;
  daily_summary_time: string;
};

type TimedTargetRow = {
  user_id: string;
  notification_kind:
    | "due_one_hour_before"
    | "due_at_time"
    | "planned_at_time"
    | "planned_custom_before";
  task_id: string;
  task_title: string;
  base_time: string;
  scheduled_for: string;
  offset_minutes: number;
};

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

function pad2(value: number) {
  return String(value).padStart(2, "0");
}

function formatYmdJst(date: Date) {
  const jst = new Date(date.getTime() + 9 * 60 * 60 * 1000);
  return `${jst.getUTCFullYear()}-${pad2(jst.getUTCMonth() + 1)}-${pad2(
    jst.getUTCDate()
  )}`;
}

function formatJstDateLabel(iso: string) {
  return new Intl.DateTimeFormat("ja-JP", {
    timeZone: "Asia/Tokyo",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(iso));
}

function formatJstHm(iso: string) {
  return new Intl.DateTimeFormat("ja-JP", {
    timeZone: "Asia/Tokyo",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));
}

function formatJstDateTime(iso: string) {
  return new Intl.DateTimeFormat("ja-JP", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));
}

function buildDailySummaryScheduledFor(nowIso: string, dailySummaryTime: string) {
  const now = new Date(nowIso);
  const jst = new Date(now.getTime() + 9 * 60 * 60 * 1000);

  const year = jst.getUTCFullYear();
  const month = jst.getUTCMonth();
  const date = jst.getUTCDate();

  const [hourStr, minuteStr] = dailySummaryTime.slice(0, 5).split(":");
  const hour = Number(hourStr);
  const minute = Number(minuteStr);

  const scheduledJst = new Date(Date.UTC(year, month, date, hour, minute, 0));
  const scheduledUtcMillis = scheduledJst.getTime() - 9 * 60 * 60 * 1000;

  return new Date(scheduledUtcMillis).toISOString();
}

function buildDailySummaryDedupeKey(userId: string, nowIso: string) {
  return `daily_summary:${userId}:${formatYmdJst(new Date(nowIso))}`;
}

function buildDailySummaryMessage(targets: SummaryTargetRow[]) {
  const dueToday = targets
    .filter((x) => x.section === "due_today")
    .sort((a, b) => a.target_at.localeCompare(b.target_at));

  const dueTomorrow = targets
    .filter((x) => x.section === "due_tomorrow")
    .sort((a, b) => a.target_at.localeCompare(b.target_at));

  const plannedToday = targets
    .filter((x) => x.section === "planned_today")
    .sort((a, b) => a.target_at.localeCompare(b.target_at));

  const plannedTomorrow = targets
    .filter((x) => x.section === "planned_tomorrow")
    .sort((a, b) => a.target_at.localeCompare(b.target_at));

  const summaryDate = formatJstDateLabel(new Date().toISOString());
  const lines: string[] = [`タスク一覧（${summaryDate}）`, ""];

  lines.push("【今日が期限⚠️】");
  if (dueToday.length > 0) {
    for (const item of dueToday) {
      lines.push(`・${formatJstHm(item.target_at)} ${item.task_title}`);
    }
  } else {
    lines.push("なし");
  }
  lines.push("");

  lines.push("【明日が期限⚠️】");
  if (dueTomorrow.length > 0) {
    for (const item of dueTomorrow) {
      lines.push(`・${formatJstHm(item.target_at)} ${item.task_title}`);
    }
  } else {
    lines.push("なし");
  }
  lines.push("");

  lines.push("【今日の実施予定✅】");
  if (plannedToday.length > 0) {
    for (const item of plannedToday) {
      lines.push(`・${formatJstHm(item.target_at)} ${item.task_title}`);
    }
  } else {
    lines.push("なし");
  }
  lines.push("");

  lines.push("【明日の実施予定✅】");
  if (plannedTomorrow.length > 0) {
    for (const item of plannedTomorrow) {
      lines.push(`・${formatJstHm(item.target_at)} ${item.task_title}`);
    }
  } else {
    lines.push("なし");
  }

  return {
    title: "タスク一覧",
    body: lines.join("\n").trim(),
  };
}

function buildTimedNotificationDedupeKey(input: {
  userId: string;
  taskId: string;
  notificationKind: string;
  baseTime: string;
  offsetMinutes: number;
}) {
  return [
    "timed",
    input.notificationKind,
    input.userId,
    input.taskId,
    input.baseTime,
    input.offsetMinutes,
  ].join(":");
}

function buildTimedNotificationMessage(target: TimedTargetRow) {
  const baseText = formatJstDateTime(target.base_time);

  switch (target.notification_kind) {
    case "due_one_hour_before":
      return {
        title: "タスク期限通知",
        body: `【もうすぐ期限時刻⚠️】${target.task_title}\n期限: ${baseText}`,
      };
    case "due_at_time":
      return {
        title: "タスク期限通知",
        body: `【期限時刻⚠️】${target.task_title}\n期限: ${baseText}`,
      };
    case "planned_at_time":
      return {
        title: "実施予定通知",
        body: `【実施予定時刻✅】${target.task_title}\n予定: ${baseText}`,
      };
    case "planned_custom_before":
      return {
        title: "実施予定通知",
        body: `【もうすぐ実施予定時刻✅】${target.task_title}\n予定: ${baseText}\n通知: ${target.offset_minutes}分前`,
      };
    default:
      return {
        title: "通知",
        body: `タスク「${target.task_title}」の通知です。`,
      };
  }
}

async function createDailySummaryJobs(nowIso: string) {
  const { data, error } = await supabase.rpc("get_daily_summary_targets", {
    p_now: nowIso,
  });

  if (error) throw error;

  const targets = (data ?? []) as SummaryTargetRow[];
  const byUser = new Map<string, SummaryTargetRow[]>();

  for (const row of targets) {
    const current = byUser.get(row.user_id) ?? [];
    current.push(row);
    byUser.set(row.user_id, current);
  }

  let createdCount = 0;

  for (const [userId, rows] of byUser.entries()) {
    const message = buildDailySummaryMessage(rows);
    const dedupeKey = buildDailySummaryDedupeKey(userId, nowIso);
    const scheduledFor = buildDailySummaryScheduledFor(
      nowIso,
      rows[0].daily_summary_time
    );

    const { error: upsertError } = await supabase
      .from("notification_jobs")
      .upsert(
        {
          user_id: userId,
          channel: "line",
          notification_type: "task_due",
          task_id: null,
          assignee_user_id: userId,
          scheduled_for: scheduledFor,
          dedupe_key: dedupeKey,
          title: message.title,
          body: message.body,
          payload: {
            type: "daily_summary",
            items: rows,
            dailySummaryTime: rows[0].daily_summary_time,
          },
        },
        { onConflict: "dedupe_key", ignoreDuplicates: true }
      );

    if (!upsertError) createdCount += 1;
  }

  return { targetCount: targets.length, createdCount };
}

async function createTimedJobs(nowIso: string) {
  const { data, error } = await supabase.rpc("get_timed_notification_targets", {
    p_now: nowIso,
  });

  if (error) throw error;

  const targets = (data ?? []) as TimedTargetRow[];
  let createdCount = 0;

  for (const target of targets) {
    const dedupeKey = buildTimedNotificationDedupeKey({
      userId: target.user_id,
      taskId: target.task_id,
      notificationKind: target.notification_kind,
      baseTime: target.base_time,
      offsetMinutes: target.offset_minutes,
    });

    const message = buildTimedNotificationMessage(target);

    const { error: upsertError } = await supabase
      .from("notification_jobs")
      .upsert(
        {
          user_id: target.user_id,
          channel: "line",
          notification_type:
            target.notification_kind.startsWith("due_")
              ? "task_due"
              : "task_planned",
          task_id: target.task_id,
          assignee_user_id: target.user_id,
          scheduled_for: target.scheduled_for,
          dedupe_key: dedupeKey,
          title: message.title,
          body: message.body,
          payload: {
            type: "timed_notification",
            notificationKind: target.notification_kind,
            taskTitle: target.task_title,
            baseTime: target.base_time,
            offsetMinutes: target.offset_minutes,
            targetDateJst: formatYmdJst(new Date(target.base_time)),
          },
        },
        { onConflict: "dedupe_key", ignoreDuplicates: true }
      );

    if (!upsertError) createdCount += 1;
  }

  return { targetCount: targets.length, createdCount };
}

async function pushLineMessage(input: {
  lineUserId: string;
  text: string;
}) {
  const response = await fetch("https://api.line.me/v2/bot/message/push", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${LINE_CHANNEL_ACCESS_TOKEN}`,
    },
    body: JSON.stringify({
      to: input.lineUserId,
      messages: [{ type: "text", text: input.text }],
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`LINE push failed: ${response.status} ${errorText}`);
  }
}

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

async function sendNotifications(nowIso: string) {
  const { data: jobs, error } = await fetchPendingLineJobs(nowIso);
  if (error) throw error;

  let processedCount = 0;
  let sentCount = 0;
  let failedCount = 0;

  for (const job of jobs ?? []) {
    processedCount += 1;

    await markJobProcessing(job.id);

    try {
      const { data: lineAccount, error: lineAccountError } =
        await getActiveLineAccountByUserId(job.user_id);

      if (lineAccountError) throw lineAccountError;
      if (!lineAccount) {
        throw new Error("LINE連携済みアカウントが見つかりません。");
      }

      await pushLineMessage({
        lineUserId: lineAccount.line_user_id,
        text: job.body,
      });

      await markJobSent(job.id);
      sentCount += 1;
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "通知送信に失敗しました。";
      await markJobFailedOrRetry(job, message);
      failedCount += 1;
    }
  }

  return { processedCount, sentCount, failedCount };
}

Deno.serve(async () => {
  const nowIso = new Date().toISOString();

  try {
    const dailySummary = await createDailySummaryJobs(nowIso);
    const timed = await createTimedJobs(nowIso);
    const send = await sendNotifications(nowIso);

    return new Response(
      JSON.stringify({
        ok: true,
        dailySummary,
        timed,
        send,
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("run-notifications error", error);

    return new Response(
      JSON.stringify({
        ok: false,
        error: error instanceof Error ? error.message : "unknown error",
      }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      }
    );
  }
});