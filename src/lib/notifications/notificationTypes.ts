export type NotificationChannel = "line" | "email" | "in_app";

export type NotificationType = "task_due" | "task_planned";

export type NotificationTimingType =
  | "day_before"
  | "same_day"
  | "custom_minutes_before";

export type NotificationJobStatus =
  | "pending"
  | "processing"
  | "sent"
  | "failed"
  | "canceled";

export type LineAccountRow = {
  id: string;
  user_id: string;
  line_user_id: string;
  display_name: string | null;
  picture_url: string | null;
  status_message: string | null;
  is_active: boolean;
  linked_at: string;
  unlinked_at: string | null;
  created_at: string;
  updated_at: string;
};

export type LineLinkTokenRow = {
  id: string;
  user_id: string;
  token: string;
  expires_at: string;
  used_at: string | null;
  linked_line_user_id: string | null;
  created_at: string;
};

export type NotificationSettingRow = {
  id: string;
  user_id: string;
  channel: NotificationChannel;
  notification_type: NotificationType;
  timing_type: NotificationTimingType;
  offset_minutes: number | null;
  is_enabled: boolean;
  created_at: string;
  updated_at: string;
};

export type NotificationJobRow = {
  id: string;
  user_id: string;
  channel: NotificationChannel;
  notification_type: NotificationType;
  task_id: string | null;
  assignee_user_id: string | null;
  scheduled_for: string;
  status: NotificationJobStatus;
  dedupe_key: string;
  title: string;
  body: string;
  payload: Record<string, unknown>;
  provider_message_id: string | null;
  last_error: string | null;
  retry_count: number;
  max_retry_count: number;
  locked_at: string | null;
  sent_at: string | null;
  created_at: string;
  updated_at: string;
};