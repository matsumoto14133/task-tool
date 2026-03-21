export type TaskStatus = "todo" | "doing" | "done" | "hold"

export function statusLabel(status: TaskStatus) {
  switch (status) {
    case "todo":
      return "未着手"
    case "doing":
      return "進行中"
    case "hold":
      return "保留"
    case "done":
      return "完了"
    default:
      return status
  }
}

export function assigneeStatusPriority(status: TaskStatus | undefined) {
  switch (status) {
    case "done":
      return 0
    case "doing":
      return 1
    case "todo":
      return 2
    case "hold":
      return 3
    default:
      return 99
  }
}

export function formatDateTime(value: string | null) {
  if (!value) return "未更新"
  const d = new Date(value)
  return d.toLocaleString("ja-JP")
}