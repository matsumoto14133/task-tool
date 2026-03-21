"use client";

import { useMemo, useRef, useState } from "react";
import type { DatesSetArg, EventClickArg } from "@fullcalendar/core";
import FullCalendar from "@fullcalendar/react";
import dayGridPlugin from "@fullcalendar/daygrid";
import listPlugin from "@fullcalendar/list";
import interactionPlugin from "@fullcalendar/interaction";
import { useRouter } from "next/navigation";

import { useIsMobile } from "@/hooks/useIsMobile";
import { buildResponsiveCalendarOptions } from "@/lib/calendar/calendarResponsive";
import type { CalendarEventItem } from "@/lib/calendar/calendarTypes";

type Props = {
  events: CalendarEventItem[];
};

function buildCalendarHeaderText(arg: DatesSetArg) {
  if (arg.view.type === "listWeek") {
    const end = new Date(arg.end);
    end.setDate(end.getDate() - 1);

    const year = arg.start.getFullYear();
    const startMonth = arg.start.getMonth() + 1;
    const startDate = arg.start.getDate();
    const endMonth = end.getMonth() + 1;
    const endDate = end.getDate();

    const range =
      startMonth === endMonth
        ? `${startMonth}/${startDate}-${endDate}`
        : `${startMonth}/${startDate}-${endMonth}/${endDate}`;

    return {
      line1: String(year),
      line2: range,
    };
  }

  return {
    line1: arg.view.title,
    line2: "",
  };
}

function formatDateRangeTitle(start: Date, endExclusive: Date) {
  const end = new Date(endExclusive);
  end.setDate(end.getDate() - 1);

  const year = start.getFullYear();
  const startMonth = start.getMonth() + 1;
  const startDate = start.getDate();
  const endMonth = end.getMonth() + 1;
  const endDate = end.getDate();

  const range =
    startMonth === endMonth
      ? `${startMonth}/${startDate}-${endDate}`
      : `${startMonth}/${startDate}-${endMonth}/${endDate}`;

  return {
    year: String(year),
    range,
  };
}

function buildCalendarHeaderHtml(arg: DatesSetArg) {
  if (arg.view.type === "listWeek") {
    const { year, range } = formatDateRangeTitle(arg.start, arg.end);
    return `${year}<br>${range}`;
  }

  return arg.view.title;
}

function getWeekOfMonth(date: Date) {
  const firstDay = new Date(date.getFullYear(), date.getMonth(), 1);
  const offset = firstDay.getDay();
  return Math.floor((date.getDate() + offset - 1) / 7) + 1;
}

function eventColor(colorKey: CalendarEventItem["colorKey"]) {
  switch (colorKey) {
    case "due":
      return "#033297"; // 青（依頼・全体・PJ期限）
    case "assigned":
      return "#be3023"; // 赤（自分担当）
    case "plan":
      return "#ea580c"; // オレンジ（予定）
    case "project":
      return "#16a34a"; // 緑（プロジェクトイベント）
    case "done":
      return "#adaeaf"; // グレー（完了）
    default:
      return "#adaeaf";
  }
}

export default function CalendarView({ events }: Props) {
  const router = useRouter();
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const isMobile = useIsMobile();
  const responsiveOptions = buildResponsiveCalendarOptions(isMobile);
  const [headerTitle, setHeaderTitle] = useState<{ line1: string; line2: string }>({
    line1: "",
    line2: "",
  });
  const [currentViewType, setCurrentViewType] = useState("");

  const fcEvents = useMemo(
    () =>
      events.map((event) => ({
        id: event.id,
        title:
          event.type === "assignee_plan"
            ? event.title
            : event.label
            ? `【${event.label}】${event.title}`
            : event.title,
        start: event.start,
        end: undefined,
        allDay: event.type === "project_event",
        backgroundColor: eventColor(event.colorKey),
        borderColor: eventColor(event.colorKey),
        textColor: "#ffffff",
        extendedProps: {
          href: event.href,
          type: event.type,
          taskId: event.taskId,
          projectId: event.projectId,
          assigneeUserId: event.assigneeUserId,
          meta: event.meta,
          priority:
            event.type === "project_event"
              ? 0
              : event.type === "assignee_plan"
              ? 1
              : 2,
          tooltip: event.label ? `【${event.label}】${event.title}` : event.title,
        },
      })),
    [events]
  );

  const handleEventClick = (arg: EventClickArg) => {
    const href = arg.event.extendedProps.href as string | undefined;
    if (!href) return;
    router.push(href);
  };

  const handleDatesSet = (arg: DatesSetArg) => {
    setCurrentViewType(arg.view.type);
    setHeaderTitle(buildCalendarHeaderText(arg));
  };

  return (
    <div
      className={`calendar-shell rounded-xl border bg-white p-2 sm:p-4 ${
        isMobile ? "calendar-shell-mobile" : ""
      } ${isMobile && currentViewType === "listWeek" ? "calendar-shell-list" : ""}`}
    >
      {isMobile && headerTitle.line1 && (
        <div className="calendar-mobile-header">
          <div className="calendar-mobile-header-line1">{headerTitle.line1}</div>
          {headerTitle.line2 && (
            <div className="calendar-mobile-header-line2">{headerTitle.line2}</div>
          )}
        </div>
      )}
      <FullCalendar
        key={isMobile ? "mobile" : "desktop"}
        plugins={[dayGridPlugin, listPlugin, interactionPlugin]}
        locale="ja"
        timeZone="local"
        height="auto"
        events={fcEvents}
        eventClick={handleEventClick}
        datesSet={handleDatesSet}
        eventDidMount={(info) => {
          const tooltip = info.event.extendedProps.tooltip as string | undefined;
          if (tooltip) {
            info.el.setAttribute("title", tooltip);
          }
        }}
        displayEventTime={true}
        eventTimeFormat={{
          hour: "numeric",
          minute: "2-digit",
          meridiem: false,
        }}
        eventOrder="priority,start"
        eventOrderStrict={true}
        nextDayThreshold="00:00:00"
        {...responsiveOptions}
      />
    </div>
  );
}