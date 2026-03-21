"use client";

import { useMemo, useRef, useState } from "react";
import FullCalendar from "@fullcalendar/react";
import type { DatesSetArg, EventClickArg } from "@fullcalendar/core";
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
  const isMobile = useIsMobile();
  const responsiveOptions = buildResponsiveCalendarOptions(isMobile);
  const calendarRef = useRef<FullCalendar | null>(null);
  const getCalendarApi = () => {
    return calendarRef.current?.getApi();
  };

  const [headerTitle, setHeaderTitle] = useState<{
    line1: string;
    line2: string;
  }>({
    line1: "",
    line2: "",
  });

  const [currentViewType, setCurrentViewType] = useState(
    isMobile ? "listWeek" : "dayGridMonth"
  );

  const fcEvents = useMemo(
    () =>
      events.map((event) => {
        const isTaskDue = event.type === "task_due";
        const isProjectEvent = event.type === "project_event";
        const isAssigneePlan = event.type === "assignee_plan";
        const isMonthView = currentViewType === "dayGridMonth";
        const isBandEventInMonth = isMonthView && (isTaskDue || isProjectEvent);

        return {
          id: event.id,
          title:
            isAssigneePlan
              ? event.title
              : event.label
              ? `【${event.label}】${event.title}`
              : event.title,
          start: event.start,
          end: isTaskDue ? undefined : event.end,
          allDay: isProjectEvent ? true : false,

          backgroundColor: eventColor(event.colorKey),
          borderColor: eventColor(event.colorKey),
          textColor: "#ffffff",

          display: isBandEventInMonth ? "block" : "auto",

          classNames: [
            isTaskDue ? "calendar-task-due-event" : "",
            isProjectEvent ? "calendar-project-event" : "",
            isAssigneePlan ? "calendar-assignee-plan-event" : "",
            isBandEventInMonth ? "calendar-band-event" : "",
          ].filter(Boolean),

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
        };
      }),
    [events, currentViewType]
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

  const handlePrev = () => {
    console.log("prev clicked");
    const api = getCalendarApi();
    if (!api) return;
    api.prev();
  };

  const handleNext = () => {
    console.log("next clicked");
    const api = getCalendarApi();
    if (!api) return;
    api.next();
  };

  const handleChangeToMonth = () => {
    console.log("month clicked");
    const api = getCalendarApi();
    if (!api) return;
    api.changeView("dayGridMonth");
  };

  const handleChangeToList = () => {
    console.log("list clicked");
    const api = getCalendarApi();
    if (!api) return;
    api.changeView("listWeek");
  };

  return (
    <div className="rounded-xl border bg-white p-2 sm:p-4">
      {isMobile && (
        <div className="mb-3 flex items-start justify-between gap-3">
          <div className="flex gap-2">
            <button
              type="button"
              onClick={handlePrev}
              className="rounded-md border bg-slate-700 px-4 py-3 text-white"
            >
              ＜
            </button>
            <button
              type="button"
              onClick={handleNext}
              className="rounded-md border bg-slate-700 px-4 py-3 text-white"
            >
              ＞
            </button>
          </div>

          <div
            className={`min-w-0 flex-1 text-center ${
              currentViewType === "listWeek"
                ? "calendar-mobile-title calendar-mobile-title-list"
                : "calendar-mobile-title calendar-mobile-title-month"
            }`}
          >
            <div className="text-xl font-bold leading-tight text-gray-800">
              {headerTitle.line1}
            </div>
            {headerTitle.line2 && (
              <div className="text-base font-semibold leading-tight text-gray-700">
                {headerTitle.line2}
              </div>
            )}
          </div>

          <div className="flex gap-2">
            <button
              type="button"
              onClick={handleChangeToMonth}
              className={`rounded-md border px-4 py-3 ${
                currentViewType === "dayGridMonth"
                  ? "bg-slate-800 text-white"
                  : "bg-slate-700 text-white"
              }`}
            >
              月
            </button>
            <button
              type="button"
              onClick={handleChangeToList}
              className={`rounded-md border px-4 py-3 ${
                currentViewType === "listWeek"
                  ? "bg-slate-800 text-white"
                  : "bg-slate-700 text-white"
              }`}
            >
              一覧
            </button>
          </div>
        </div>
      )}
      <FullCalendar
        ref={calendarRef}
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
        defaultTimedEventDuration="00:01"
        moreLinkContent={(arg) => `+${arg.num}件`}
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