import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

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

function pad2(value: number) {
  return String(value).padStart(2, "0");
}

function formatYmdJst(date: Date) {
  const jst = new Date(date.getTime() + 9 * 60 * 60 * 1000);
  return `${jst.getUTCFullYear()}-${pad2(jst.getUTCMonth() + 1)}-${pad2(
    jst.getUTCDate()
  )}`;
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
        body: `まもなくタスク「${target.task_title}」の期限です。\n期限: ${baseText}`,
      };

    case "due_at_time":
      return {
        title: "タスク期限通知",
        body: `タスク「${target.task_title}」の期限時刻です。\n期限: ${baseText}`,
      };

    case "planned_at_time":
      return {
        title: "実施予定通知",
        body: `タスク「${target.task_title}」の実施予定時刻です。\n予定: ${baseText}`,
      };

    case "planned_custom_before":
      return {
        title: "実施予定通知",
        body: `まもなくタスク「${target.task_title}」の実施予定です。\n予定: ${baseText}\n通知: ${target.offset_minutes}分前`,
      };

    default:
      return {
        title: "通知",
        body: `タスク「${target.task_title}」の通知です。`,
      };
  }
}

Deno.serve(async () => {
  const nowIso = new Date().toISOString();

  const { data, error } = await supabase.rpc("get_timed_notification_targets", {
    p_now: nowIso,
  });

  if (error) {
    console.error("get_timed_notification_targets error", error);

    return new Response(JSON.stringify({ ok: false, error: error.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

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

    if (upsertError) {
      console.error("timed notification upsert error", upsertError);
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