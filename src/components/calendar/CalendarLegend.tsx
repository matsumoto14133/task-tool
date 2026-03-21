import type { CalendarDisplayMode } from "@/lib/calendar/calendarTypes";

type Item = {
  label: string;
  color: string;
};

type Props = {
  mode: CalendarDisplayMode;
};

function itemsByMode(mode: CalendarDisplayMode): Item[] {
  if (mode === "personal") {
    return [
      { label: "依頼したタスク", color: "#033297" },
      { label: "担当タスク", color: "#be3023" },
      { label: "実施予定", color: "#ea580c" },
      { label: "完了済み", color: "#9ca3af" },
    ];
  }

  return [
    { label: "タスク期限", color: "#033297" },
    { label: "プロジェクトイベント", color: "#16a34a" },
    { label: "完了済みタスク", color: "#9ca3af" },
  ];
}

export default function CalendarLegend({ mode }: Props) {
  const items = itemsByMode(mode);

  return (
    <div className="mt-3 flex flex-wrap gap-x-4 gap-y-2 text-sm text-gray-700">
      {items.map((item) => (
        <div key={item.label} className="flex items-center gap-2">
          <span
            className="inline-block h-3 w-3 rounded-sm"
            style={{ backgroundColor: item.color }}
          />
          <span>{item.label}</span>
        </div>
      ))}
    </div>
  );
}