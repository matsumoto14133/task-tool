import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

type SummaryTargetRow = {
  user_id: string;
  section: "due_today" | "due_tomorrow" | "planned_today";
  task_id: string;
  task_title: string;
  target_at: string;
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

function formatJstHm(iso: string) {
  return new Intl.DateTimeFormat("ja-JP", {
    timeZone: "Asia/Tokyo",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));
}

function buildDailySummaryScheduledFor(nowIso: string) {
  const now = new Date(nowIso);
  const jst = new Date(now.getTime() + 9 * 60 * 60 * 1000);

  const year = jst.getUTCFullYear();
  const month = jst.getUTCMonth();
  const date = jst.getUTCDate();

  // JST 09:00
  const scheduledJst = new Date(Date.UTC(year, month, date, 9, 0, 0));
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

  const lines: string[] = ["本日の通知まとめ", ""];

  if (dueToday.length > 0) {
    lines.push("【今日が期限】");
    for (const item of dueToday) {
      lines.push(`・${formatJstHm(item.target_at)} ${item.task_title}`);
    }
    lines.push("");
  }

  if (dueTomorrow.length > 0) {
    lines.push("【明日が期限】");
    for (const item of dueTomorrow) {
      lines.push(`・${formatJstHm(item.target_at)} ${item.task_title}`);
    }
    lines.push("");
  }

  if (plannedToday.length > 0) {
    lines.push("【今日の実施予定】");
    for (const item of plannedToday) {
      lines.push(`・${formatJstHm(item.target_at)} ${item.task_title}`);
    }
    lines.push("");
  }

  if (
    dueToday.length === 0 &&
    dueTomorrow.length === 0 &&
    plannedToday.length === 0
  ) {
    lines.push("本日の通知対象はありません。");
  }

  return {
    title: "本日の通知まとめ",
    body: lines.join("\n").trim(),
  };
}

Deno.serve(async () => {
  const nowIso = new Date().toISOString();

  const { data, error } = await supabase.rpc("get_daily_summary_targets", {
    p_now: nowIso,
  });

  if (error) {
    console.error("get_daily_summary_targets error", error);
    return new Response(JSON.stringify({ ok: false, error: error.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  const targets = (data ?? []) as SummaryTargetRow[];

  const byUser = new Map<string, SummaryTargetRow[]>();
  for (const row of targets) {
    const current = byUser.get(row.user_id) ?? [];
    current.push(row);
    byUser.set(row.user_id, current);
  }

  const scheduledFor = buildDailySummaryScheduledFor(nowIso);
  let createdCount = 0;

  for (const [userId, rows] of byUser.entries()) {
    const message = buildDailySummaryMessage(rows);
    const dedupeKey = buildDailySummaryDedupeKey(userId, nowIso);

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
          },
        },
        { onConflict: "dedupe_key", ignoreDuplicates: true }
      );

    if (upsertError) {
      console.error("daily summary upsert error", upsertError);
      continue;
    }

    createdCount += 1;
  }

  return new Response(
    JSON.stringify({
      ok: true,
      targetCount: targets.length,
      userCount: byUser.size,
      createdCount,
    }),
    {
      status: 200,
      headers: { "Content-Type": "application/json" },
    }
  );
});