import type { CalendarOptions } from "@fullcalendar/core";

export function buildResponsiveCalendarOptions(
  isMobile: boolean
): Partial<CalendarOptions> {
  if (isMobile) {
    return {
      initialView: "listWeek",
      headerToolbar: false,
      contentHeight: "auto",
      handleWindowResize: true,
      dayMaxEvents: 1,
      moreLinkClick: "popover",
      buttonText: {
        month: "月",
        list: "一覧",
      },
      titleFormat: {
        year: "numeric",
        month: "2-digit",
      },
    };
  }

  return {
    initialView: "dayGridMonth",
    headerToolbar: {
      left: "title",
      center: "",
      right: "prev,next",
    },
    contentHeight: "auto",
    handleWindowResize: true,
    dayMaxEvents: 3,
    moreLinkClick: "popover",
    buttonText: {
      today: "今日",
      month: "月",
      list: "一覧",
    },
    titleFormat: {
      year: "numeric",
      month: "long",
    },
  };
}