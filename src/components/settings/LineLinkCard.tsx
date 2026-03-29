"use client";

import { useState, useTransition } from "react";
import { issueLineLinkTokenAction } from "../../../app/settings/notifications/actions";

type Props = {
  isLinked: boolean;
  displayName: string | null;
  lineUserId: string | null;
};

function formatExpiresAt(iso: string) {
  return new Intl.DateTimeFormat("ja-JP", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));
}

export default function LineLinkCard({
  isLinked,
  displayName,
  lineUserId,
}: Props) {
  const [isPending, startTransition] = useTransition();
  const [resultMessage, setResultMessage] = useState<string>("");
  const [issuedToken, setIssuedToken] = useState<string>("");
  const [expiresAt, setExpiresAt] = useState<string>("");

  const handleIssueToken = () => {
    startTransition(async () => {
      const result = await issueLineLinkTokenAction();

      setResultMessage(result.message);

      if (result.ok) {
        setIssuedToken(result.token ?? "");
        setExpiresAt(result.expiresAt ?? "");
      } else {
        setIssuedToken("");
        setExpiresAt("");
      }
    });
  };

  return (
    <section className="rounded-xl border bg-white p-5 shadow-sm">
      <div className="flex flex-col gap-4">
        <div>
          <h2 className="text-lg font-semibold">LINE連携</h2>
          <p className="mt-1 text-sm text-gray-600">
            LINE公式アカウントと連携すると、タスク通知をLINEで受け取れるようになります。
          </p>
        </div>

        <div className="rounded-lg border bg-gray-50 p-4 text-sm">
          <p className="font-medium text-gray-900">
            連携状態: {isLinked ? "連携済み" : "未連携"}
          </p>

          {isLinked ? (
            <div className="mt-2 space-y-1 text-gray-700">
              <p>LINE表示名: {displayName ?? "未取得"}</p>
              <p>LINEユーザーID: {lineUserId ?? "未取得"}</p>
            </div>
          ) : (
            <p className="mt-2 text-gray-700">
              まだLINEアカウントは連携されていません。
            </p>
          )}
        </div>

        <div className="rounded-lg border p-4">
          <h3 className="font-medium">連携手順</h3>
          <ol className="mt-2 space-y-1 text-sm text-gray-700">
            <li>1. 下のボタンで連携コードを発行</li>
            <li>2. LINE公式アカウントを友だち追加</li>
            <li>3. 発行されたコードをLINEで送信</li>
            <li>4. webhook側で照合して連携完了</li>
          </ol>

          <div className="mt-4">
            <button
              type="button"
              onClick={handleIssueToken}
              disabled={isPending}
              className="rounded-md border px-4 py-2 text-sm font-medium hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isPending ? "発行中..." : "連携コードを発行"}
            </button>
          </div>

          {resultMessage ? (
            <p className="mt-3 text-sm text-gray-700">{resultMessage}</p>
          ) : null}

          {issuedToken ? (
            <div className="mt-4 rounded-lg border bg-yellow-50 p-4">
              <p className="text-sm text-gray-700">発行された連携コード</p>
              <p className="mt-2 text-2xl font-bold tracking-wide">
                {issuedToken}
              </p>
              {expiresAt ? (
                <p className="mt-2 text-sm text-gray-700">
                  有効期限: {formatExpiresAt(expiresAt)}
                </p>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
}