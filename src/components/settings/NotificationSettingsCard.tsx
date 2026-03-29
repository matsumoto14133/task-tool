"use client";

import { useState, useTransition } from "react";
import { saveNotificationSettingsAction } from "../../../app/settings/notifications/actions";

type Props = {
  dailySummaryTime: string;
};

export default function NotificationSettingsCard(props: Props) {
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState("");
  const [dailySummaryTime, setDailySummaryTime] = useState(
    props.dailySummaryTime
  );

  const handleSave = () => {
    startTransition(async () => {
      const result = await saveNotificationSettingsAction({
        dailySummaryTime,
      });

      setMessage(result.message);
    });
  };

  return (
    <section className="rounded-xl border bg-white p-5 shadow-sm">
      <div className="space-y-6">
        <h2 className="text-lg font-semibold">通知設定</h2>

        <div className="rounded-lg border bg-gray-50 p-4">
          <h3 className="font-medium text-gray-900">固定で送信される通知</h3>
          <ul className="mt-2 space-y-1 text-sm text-gray-700">
            <li>・期限前日一覧通知</li>
            <li>・期限当日一覧通知</li>
            <li>・期限1時間前通知</li>
            <li>・期限時刻通知</li>
          </ul>
          <p className="mt-2 text-xs text-gray-500">
            実施予定の通知タイミングは各タスクで設定可能です。
          </p>
        </div>

        <div className="rounded-lg border p-4">
        <label className="block text-sm font-medium text-gray-900">
            タスク一覧通知時刻
        </label>
        <p className="mt-1 text-sm text-gray-600">
            今日が期限のタスク・明日が期限のタスク・今日の実施予定をまとめて1日1回以下の時刻で送ります。
        </p>
        <input
            type="time"
            value={dailySummaryTime}
            onChange={(e) => setDailySummaryTime(e.target.value)}
            className="mt-3 w-full md:w-auto rounded-md border px-3 py-2 text-sm"
        />
        </div>

        <div>
        <button
            type="button"
            onClick={handleSave}
            disabled={isPending}
            className="w-full md:w-auto rounded-md border px-4 py-2 text-sm font-medium hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
        >
            {isPending ? "保存中..." : "設定を保存"}
        </button>

        {message ? (
            <p className="mt-3 text-sm text-gray-700 text-center md:text-left">{message}</p>
        ) : null}
        </div>
      </div>
    </section>
  );
}