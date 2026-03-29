import Link from "next/link";
import LineLinkCard from "@/components/settings/LineLinkCard";
import NotificationSettingsCard from "@/components/settings/NotificationSettingsCard";
import { getLineLinkStatus } from "@/lib/notifications/lineLinkService";
import {
  getNotificationSettingsByUserId,
  getUserNotificationProfile,
} from "@/lib/notifications/notificationQueries";
import { buildNotificationSettingsViewModel } from "@/lib/notifications/notificationSettingsService";
import { createClient } from "@/lib/supabase/server";

export default async function NotificationsSettingsPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return (
      <main className="p-6">
        <p className="text-sm text-red-600">
          ログイン情報を確認できませんでした。
        </p>
      </main>
    );
  }

  const [{ isLinked, lineAccount }, settingsResult, profileResult] =
    await Promise.all([
      getLineLinkStatus(supabase, user.id),
      getNotificationSettingsByUserId(supabase, user.id),
      getUserNotificationProfile(supabase, user.id),
    ]);

  const settings = settingsResult.data ?? [];
  const profile = profileResult.data ?? null;

  const vm = buildNotificationSettingsViewModel({
    profile,
    settings,
  });

  return (
    <main className="p-6">
      <div className="max-w-3xl space-y-6">
        <div>
          <h1 className="text-2xl font-bold">通知設定</h1>
          <p className="mt-1 text-sm text-gray-600">
            通知方法やLINE連携を設定します。
          </p>

          <div className="mt-3">
            <Link
              href="/dashboard"
              className="rounded-md border px-3 py-2 text-sm"
            >
              ホームへ
            </Link>
          </div>
        </div>

        <LineLinkCard
          isLinked={isLinked}
          displayName={lineAccount?.display_name ?? null}
          lineUserId={lineAccount?.line_user_id ?? null}
        />

        <NotificationSettingsCard
          dailySummaryTime={vm.dailySummaryTime}
          plannedAtEnabled={vm.plannedAtEnabled}
          plannedCustomEnabled={vm.plannedCustomEnabled}
          plannedCustomMinutes={vm.plannedCustomMinutes}
        />
      </div>
    </main>
  );
}