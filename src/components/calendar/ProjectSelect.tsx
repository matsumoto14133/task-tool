"use client";

import type { CalendarProjectOption } from "@/lib/calendar/calendarTypes";

type Props = {
  projects: CalendarProjectOption[];
  selectedProjectId: string;
  onChange: (projectId: string) => void;
};

export default function ProjectSelect({
  projects,
  selectedProjectId,
  onChange,
}: Props) {
  return (
    <div className="mt-3">
      <label className="mb-1 block text-sm font-medium text-gray-700">
        プロジェクト選択
      </label>
      <select
        value={selectedProjectId}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-md border px-3 py-2 text-sm"
      >
        <option value="">選択してください</option>
        {projects.map((project) => (
          <option key={project.id} value={project.id}>
            {project.name}
          </option>
        ))}
      </select>
    </div>
  );
}