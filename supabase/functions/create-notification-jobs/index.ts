import { createClient } from "npm:@supabase/supabase-js@2";

function pad2(value: number) {
  return String(value).padStart(2, "0");
}

function formatYmdJst(date: Date) {
  const jst = new Date(date.getTime() + 9 * 60 * 60 * 1000);
  return `${jst.getUTCFullYear()}-${pad2(jst.getUTCMonth() + 1)}-${pad2(
    jst.getUTCDate()
  )}`;
}

function getDueDateYmdJst(dueAtIso: string) {
  return formatYmdJst(new Date(dueAtIso));
}

function buildDayBeforeNotificationScheduledForJst(dueAtIso: string) {
  const due = new Date(dueAtIso);
  const jstMillis = due.getTime() + 9 * 60 * 60 * 1000;
  const jst = new Date(jstMillis);

  const year = jst.getUTCFullYear();
  const month = jst.getUTCMonth();
  const date = jst.getUTCDate();

  const scheduledJst = new Date(Date.UTC(year, month, date - 1, 0, 0, 0));
  const scheduledUtcMillis = scheduledJst.getTime() - 9 * 60 * 60 * 1000;

  return new Date(scheduledUtcMillis).toISOString();
}

function buildDueDayBeforeDedupeKey(input: {
  userId: string;
  taskId: string;
  targetDate: string;
}) {
  return `due_day_before:${input.userId}:${input.taskId}:${input.targetDate}`;
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

function buildDueDayBeforeLineMessage(input: {
  taskTitle: string;
  dueAtIso: string;
}) {
  const dueText = formatJstDateTime(input.dueAtIso);

  return {
    title: "タスク期限通知",
    body: `明日はタスク「${input.taskTitle}」の期限です。\n期限: ${dueText}`,
  };
}

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

Deno.serve(async () => {
  const nowIso = new Date().toISOString();

  const { data, error } = await supabase.rpc(
    "get_due_day_before_notification_targets",
    {
      p_now: nowIso,
    }
  );

  if (error) {
    console.error("rpc error", error);
    return new Response(JSON.stringify({ ok: false, error: error.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  const targets = (data ?? []) as Array<{
    task_id: string;
    task_title: string;
    due_at: string;
    assignee_user_id: string;
  }>;

  let createdCount = 0;

  for (const target of targets) {
    const scheduledFor = buildDayBeforeNotificationScheduledForJst(target.due_at);

    if (new Date(scheduledFor).getTime() > new Date(nowIso).getTime()) {
      continue;
    }

    const targetDate = getDueDateYmdJst(target.due_at);
    const dedupeKey = buildDueDayBeforeDedupeKey({
      userId: target.assignee_user_id,
      taskId: target.task_id,
      targetDate,
    });

    const message = buildDueDayBeforeLineMessage({
      taskTitle: target.task_title,
      dueAtIso: target.due_at,
    });

    const { error: upsertError } = await supabase
      .from("notification_jobs")
      .upsert(
        {
          user_id: target.assignee_user_id,
          channel: "line",
          notification_type: "task_due",
          task_id: target.task_id,
          assignee_user_id: target.assignee_user_id,
          scheduled_for: scheduledFor,
          dedupe_key: dedupeKey,
          title: message.title,
          body: message.body,
          payload: {
            taskTitle: target.task_title,
            dueAt: target.due_at,
            notificationTiming: "day_before",
          },
        },
        { onConflict: "dedupe_key", ignoreDuplicates: true }
      );

    if (upsertError) {
      console.error("upsert notification_jobs error", upsertError);
      continue;
    }

    createdCount += 1;
  }

  return new Response(
    JSON.stringify({
      ok: true,
      targetCount: targets.length,
      createdCount,
    }),
    {
      status: 200,
      headers: { "Content-Type": "application/json" },
    }
  );
});