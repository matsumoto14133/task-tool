"use client";

import type { CalendarDisplayMode } from "@/lib/calendar/calendarTypes";

type Props = {
  mode: CalendarDisplayMode;
  onChange: (mode: CalendarDisplayMode) => void;
};

export default function CalendarFilter({ mode, onChange }: Props) {
  const baseClass = "rounded-md border px-3 py-1 text-sm";
  const activeClass = "bg-blue-600 text-white border-blue-600";
  const inactiveClass = "bg-white text-gray-700";

  return (
    <div className="flex gap-2">
      <button
        className={`${baseClass} ${
          mode === "personal" ? activeClass : inactiveClass
        }`}
        onClick={() => onChange("personal")}
      >
        個人
      </button>

      <button
        className={`${baseClass} ${
          mode === "all" ? activeClass : inactiveClass
        }`}
        onClick={() => onChange("all")}
      >
        全体
      </button>

      <button
        className={`${baseClass} ${
          mode === "project" ? activeClass : inactiveClass
        }`}
        onClick={() => onChange("project")}
      >
        プロジェクト
      </button>
    </div>
  );
}