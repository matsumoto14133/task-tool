type BuildDueDayBeforeLineMessageInput = {
  taskTitle: string;
  dueAtIso: string;
};

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

export function buildDueDayBeforeLineMessage(
  input: BuildDueDayBeforeLineMessageInput
) {
  const dueText = formatJstDateTime(input.dueAtIso);

  return {
    title: "タスク期限通知",
    body: `明日はタスク「${input.taskTitle}」の期限です。\n期限: ${dueText}`,
  };
}