export type DueTone = "neutral" | "ok" | "warning" | "danger";

export function getDueMeta(dueAt: string | null | undefined) {
  if (!dueAt) {
    return {
      label: "期限なし",
      tone: "neutral" as DueTone,
      diffHours: null as number | null,
    };
  }

  const dueMs = new Date(dueAt).getTime();
  const nowMs = Date.now();
  const diffHours = (dueMs - nowMs) / (1000 * 60 * 60);

  if (diffHours < 0) {
    return { label: "期限切れ", tone: "danger" as DueTone, diffHours };
  }
  if (diffHours <= 48) {
    return { label: "期限間近", tone: "warning" as DueTone, diffHours };
  }
  return { label: "期限内", tone: "ok" as DueTone, diffHours };
}

export function dueBadgeClass(tone: DueTone) {
  switch (tone) {
    case "danger":
      return "border-red-300 bg-red-50 text-red-700";
    case "warning":
      return "border-orange-300 bg-orange-50 text-orange-700";
    case "ok":
      return "border-emerald-200 bg-emerald-50 text-emerald-700";
    default:
      return "border-gray-200 bg-gray-50 text-gray-700";
  }
}

export function dueCardBorderClass(tone: DueTone) {
  switch (tone) {
    case "danger":
      return "border-red-300";
    case "warning":
      return "border-orange-300";
    case "ok":
      return "border-emerald-200";
    default:
      return "border-gray-200";
  }
}

export function formatDue(dueAt: string | null | undefined) {
  if (!dueAt) return "期限なし";
  const d = new Date(dueAt);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}/${pad(d.getMonth() + 1)}/${pad(d.getDate())} ${pad(
    d.getHours()
  )}:${pad(d.getMinutes())}`;
}