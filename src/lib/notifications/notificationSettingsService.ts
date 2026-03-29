import type {
  NotificationSettingRow,
  UserNotificationProfileRow,
} from "./notificationTypes";

export type NotificationSettingsViewModel = {
  dailySummaryTime: string;
  plannedAtEnabled: boolean;
  plannedCustomEnabled: boolean;
  plannedCustomMinutes: number;
};

function toHm(value: string | null | undefined) {
  if (!value) return "09:00";
  return value.slice(0, 5);
}

export function buildNotificationSettingsViewModel(input: {
  profile: UserNotificationProfileRow | null;
  settings: NotificationSettingRow[];
}): NotificationSettingsViewModel {
  const plannedAt = input.settings.find(
    (x) =>
      x.channel === "line" &&
      x.notification_type === "task_planned" &&
      x.timing_type === "same_day" &&
      x.offset_minutes === null
  );

  const plannedCustom = input.settings.find(
    (x) =>
      x.channel === "line" &&
      x.notification_type === "task_planned" &&
      x.timing_type === "custom_minutes_before"
  );

  return {
    dailySummaryTime: toHm(input.profile?.daily_summary_time),
    plannedAtEnabled: plannedAt?.is_enabled ?? true,
    plannedCustomEnabled: plannedCustom?.is_enabled ?? false,
    plannedCustomMinutes: plannedCustom?.offset_minutes ?? 30,
  };
}