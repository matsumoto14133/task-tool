"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import CalendarView from "@/components/calendar/CalendarView";
import BackButton from "@/components/common/BackButton";
import CalendarFilter from "@/components/calendar/CalendarFilter";
import ProjectSelect from "@/components/calendar/ProjectSelect";
import {
  buildAllModeEvents,
  buildPersonalModeEvents,
  buildProjectModeEvents,
  loadCalendarBaseData,
} from "@/lib/calendar/calendarService";
import type {
  CalendarDisplayMode,
  CalendarEventItem,
  CalendarProjectOption,
} from "@/lib/calendar/calendarTypes";
import type { CalendarBaseData } from "@/lib/calendar/calendarService";
import CalendarLegend from "@/components/calendar/CalendarLegend";

function descriptionByMode(mode: CalendarDisplayMode) {
  if (mode === "all") {
    return "すべてのタスク期限とプロジェクトイベントを表示しています。";
  }
  if (mode === "personal") {
    return "自分の依頼したタスク・担当タスク・実施予定を表示しています。";
  }
  return "選択したプロジェクトのタスク期限とプロジェクトイベントを表示しています。";
}

export default function CalendarPageClient() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [baseData, setBaseData] = useState<CalendarBaseData | null>(null);
  const [projects, setProjects] = useState<CalendarProjectOption[]>([]);

  const initialMode =
  (searchParams.get("mode") as CalendarDisplayMode) || "personal";
  const initialProjectId = searchParams.get("project") || "";
  const initialHideCompleted = searchParams.get("hideCompleted") === "1";

  const [selectedProjectId, setSelectedProjectId] = useState(initialProjectId);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState("");
  const [mode, setMode] = useState<CalendarDisplayMode>(initialMode);
  const [hideCompleted, setHideCompleted] = useState(initialHideCompleted);

  useEffect(() => {
    const params = new URLSearchParams(searchParams.toString());

    params.set("mode", mode);

    if (mode === "project" && selectedProjectId) {
      params.set("project", selectedProjectId);
    } else {
      params.delete("project");
    }

    if (hideCompleted) {
      params.set("hideCompleted", "1");
    } else {
      params.delete("hideCompleted");
    }

    const nextUrl = `${pathname}?${params.toString()}`;
    const currentUrl = `${pathname}?${searchParams.toString()}`;

    if (nextUrl !== currentUrl) {
      router.replace(nextUrl, { scroll: false });
    }
  }, [mode, selectedProjectId, hideCompleted, pathname, router, searchParams]);

  useEffect(() => {
    let mounted = true;

    async function fetchBaseData() {
      try {
        setLoading(true);
        setErrorMsg("");

        const data = await loadCalendarBaseData();
        if (!mounted) return;

        setBaseData(data);
        setProjects(data.projectOptions);
      } catch (error) {
        if (!mounted) return;

        const message =
          error instanceof Error ? error.message : "イベント取得に失敗しました";
        setErrorMsg(message);
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    }

    fetchBaseData();

    return () => {
      mounted = false;
    };
  }, []);

  const events = useMemo<CalendarEventItem[]>(() => {
    if (!baseData) return [];

    if (mode === "all") {
      return buildAllModeEvents(baseData);
    }

    if (mode === "personal") {
      return buildPersonalModeEvents(baseData);
    }

    return buildProjectModeEvents(baseData, selectedProjectId);
  }, [baseData, mode, selectedProjectId]);

  const visibleEvents = useMemo(
    () =>
      hideCompleted
        ? events.filter((event) => event.colorKey !== "done")
        : events,
    [events, hideCompleted]
  );

  return (
    <main className="p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">カレンダー</h1>
          <p className="mt-2 text-sm text-gray-600">
            {descriptionByMode(mode)}
          </p>

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Link className="rounded-md border px-3 py-2" href="/dashboard">
              ホームへ
            </Link>
            <Link className="rounded-md border px-3 py-2" href="/tasks">
              タスク一覧へ
            </Link>
            <Link className="rounded-md border px-3 py-2" href="/tasks/new">
              タスクを依頼
            </Link>
            <BackButton />
          </div>

          <div className="mt-3">
            <CalendarFilter
              mode={mode}
              onChange={(nextMode) => {
                setMode(nextMode);
                if (nextMode !== "project") {
                  setSelectedProjectId("");
                }
              }}
            />
          </div>

          {mode === "project" && (
            <ProjectSelect
              projects={projects}
              selectedProjectId={selectedProjectId}
              onChange={setSelectedProjectId}
            />
          )}
          
          <CalendarLegend mode={mode} />

          <div className="mt-3 flex items-center gap-2 text-sm text-gray-700">
            <input
              id="hide-completed"
              type="checkbox"
              checked={hideCompleted}
              onChange={(e) => setHideCompleted(e.target.checked)}
              className="h-4 w-4"
            />
            <label htmlFor="hide-completed">完了済みを非表示</label>
          </div>

          <div className="mt-3 text-sm text-gray-600">
            {loading && <p>読み込み中...</p>}
            {errorMsg && <p className="text-red-600">❌ {errorMsg}</p>}
          </div>
        </div>
      </div>

      <div className="mt-6">
        <CalendarView events={visibleEvents} />
      </div>
    </main>
  );
}