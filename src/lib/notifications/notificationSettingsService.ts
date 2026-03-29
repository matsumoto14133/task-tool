import type { UserNotificationProfileRow } from "./notificationTypes";

export type NotificationSettingsViewModel = {
  dailySummaryTime: string;
};

function toHm(value: string | null | undefined) {
  if (!value) return "09:00";
  return value.slice(0, 5);
}

export function buildNotificationSettingsViewModel(input: {
  profile: UserNotificationProfileRow | null;
}): NotificationSettingsViewModel {
  return {
    dailySummaryTime: toHm(input.profile?.daily_summary_time),
  };
}