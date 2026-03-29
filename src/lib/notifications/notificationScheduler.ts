function pad2(value: number) {
  return String(value).padStart(2, "0");
}

function formatYmdJst(date: Date) {
  const jst = new Date(date.getTime() + 9 * 60 * 60 * 1000);
  return `${jst.getUTCFullYear()}-${pad2(jst.getUTCMonth() + 1)}-${pad2(
    jst.getUTCDate()
  )}`;
}

export function getDueDateYmdJst(dueAtIso: string) {
  return formatYmdJst(new Date(dueAtIso));
}

export function buildDayBeforeNotificationScheduledForJst(dueAtIso: string) {
  const due = new Date(dueAtIso);
  const jstMillis = due.getTime() + 9 * 60 * 60 * 1000;
  const jst = new Date(jstMillis);

  const year = jst.getUTCFullYear();
  const month = jst.getUTCMonth();
  const date = jst.getUTCDate();

  const scheduledJst = new Date(Date.UTC(year, month, date - 1, 0, 0, 0));
  scheduledJst.setUTCHours(0);

  const scheduledUtcMillis = scheduledJst.getTime() - 9 * 60 * 60 * 1000;

  return new Date(scheduledUtcMillis).toISOString();
}

export function isWithinDayBeforeWindowJst(input: {
  dueAtIso: string;
  nowIso: string;
}) {
  const target = buildDayBeforeNotificationScheduledForJst(input.dueAtIso);
  return new Date(target).getTime() <= new Date(input.nowIso).getTime();
}