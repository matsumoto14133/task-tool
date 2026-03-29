"use client";

import { useState, useTransition } from "react";
import { saveNotificationSettingsAction } from "../../../app/settings/notifications/actions";

type Props = {
  dailySummaryTime: string;
  plannedAtEnabled: boolean;
  plannedCustomEnabled: boolean;
  plannedCustomMinutes: number;
};

export default function NotificationSettingsCard(props: Props) {
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState("");

  const [dailySummaryTime, setDailySummaryTime] = useState(
    props.dailySummaryTime
  );
  const [plannedAtEnabled, setPlannedAtEnabled] = useState(
    props.plannedAtEnabled
  );
  const [plannedCustomEnabled, setPlannedCustomEnabled] = useState(
    props.plannedCustomEnabled
  );
  const [plannedCustomMinutes, setPlannedCustomMinutes] = useState(
    props.plannedCustomMinutes
  );

  const handleSave = () => {
    startTransition(async () => {
      const result = await saveNotificationSettingsAction({
        dailySummaryTime,
        plannedAtEnabled,
        plannedCustomEnabled,
        plannedCustomMinutes,
      });

      setMessage(result.message);
    });
  };

  return (
    <section className="rounded-xl border bg-white p-5 shadow-sm">
      <div className="space-y-6">
        <div>
          <h2 className="text-lg font-semibold">通知設定</h2>
          <p className="mt-1 text-sm text-gray-600">
            LINE通知の時刻や実施予定通知を設定します。
          </p>
        </div>

        <div className="rounded-lg border bg-gray-50 p-4">
          <h3 className="font-medium text-gray-900">固定で送信される通知</h3>
          <ul className="mt-2 space-y-1 text-sm text-gray-700">
            <li>・期限前日一覧通知</li>
            <li>・期限当日一覧通知</li>
            <li>・期限1時間前通知</li>
            <li>・期限時刻通知</li>
          </ul>
          <p className="mt-2 text-xs text-gray-500">
            これらは現在OFFにできません。
          </p>
        </div>

        <div className="grid gap-4">
          <div className="rounded-lg border p-4">
            <label className="block text-sm font-medium text-gray-900">
              一覧通知時刻
            </label>
            <p className="mt-1 text-sm text-gray-600">
              今日が期限・明日が期限・今日の実施予定をまとめて送ります。
            </p>
            <input
              type="time"
              value={dailySummaryTime}
              onChange={(e) => setDailySummaryTime(e.target.value)}
              className="mt-3 rounded-md border px-3 py-2 text-sm"
            />
          </div>

          <div className="rounded-lg border p-4">
            <label className="flex items-center gap-2 text-sm font-medium text-gray-900">
              <input
                type="checkbox"
                checked={plannedAtEnabled}
                onChange={(e) => setPlannedAtEnabled(e.target.checked)}
              />
              実施予定時刻に通知する
            </label>
          </div>

          <div className="rounded-lg border p-4">
            <label className="flex items-center gap-2 text-sm font-medium text-gray-900">
              <input
                type="checkbox"
                checked={plannedCustomEnabled}
                onChange={(e) => setPlannedCustomEnabled(e.target.checked)}
              />
              実施予定のカスタム時間前に通知する
            </label>

            <div className="mt-3 flex items-center gap-3">
              <input
                type="number"
                min={1}
                value={plannedCustomMinutes}
                onChange={(e) =>
                  setPlannedCustomMinutes(Number(e.target.value || 0))
                }
                className="w-28 rounded-md border px-3 py-2 text-sm"
                disabled={!plannedCustomEnabled}
              />
              <span className="text-sm text-gray-700">分前</span>
            </div>
          </div>
        </div>

        <div>
          <button
            type="button"
            onClick={handleSave}
            disabled={isPending}
            className="rounded-md border px-4 py-2 text-sm font-medium hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isPending ? "保存中..." : "設定を保存"}
          </button>

          {message ? (
            <p className="mt-3 text-sm text-gray-700">{message}</p>
          ) : null}
        </div>
      </div>
    </section>
  );
}