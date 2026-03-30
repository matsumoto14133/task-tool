"use client";

import Image from "next/image";
import { useState, useTransition } from "react";
import {
  issueLineLinkTokenAction,
  unlinkLineAccountAction,
} from "../../../app/settings/notifications/actions";

type Props = {
  isLinked: boolean;
  displayName: string | null;
  lineUserId: string | null;
  lineAddFriendUrl?: string | null;
  lineQrImageUrl?: string | null;
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
  lineAddFriendUrl,
  lineQrImageUrl,
}: Props) {
  const [isPending, startTransition] = useTransition();
  const [resultMessage, setResultMessage] = useState("");
  const [issuedToken, setIssuedToken] = useState("");
  const [expiresAt, setExpiresAt] = useState("");
  const [linkedState, setLinkedState] = useState(isLinked);
  const [linkedDisplayName, setLinkedDisplayName] = useState(displayName);
  const [linkedLineUserId, setLinkedLineUserId] = useState(lineUserId);

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

  const handleUnlink = () => {
    const ok = window.confirm("LINE連携を解除しますか？");
    if (!ok) return;

    startTransition(async () => {
      const result = await unlinkLineAccountAction();

      setResultMessage(result.message);

      if (result.ok) {
        setIssuedToken("");
        setExpiresAt("");
        setLinkedState(false);
        setLinkedDisplayName(null);
        setLinkedLineUserId(null);
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
            連携状態: {linkedState ? "連携済み" : "未連携"}
          </p>

          {linkedState ? (
            <div className="mt-2 space-y-1 text-gray-700">
              {linkedDisplayName ? <p>LINE表示名: {linkedDisplayName}</p> : null}
              {linkedLineUserId ? <p>LINEユーザーID: {linkedLineUserId}</p> : null}
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
            <li>1. 公式LINEを友だち追加</li>
            <li>2. 下のボタンで連携コードを発行（10分間有効）</li>
            <li>3. 発行されたコードを公式LINEのチャットで送信</li>
          </ol>

          {(lineAddFriendUrl || lineQrImageUrl) && (
            <div className="mt-4 rounded-lg border bg-gray-50 p-4">
              <p className="text-sm font-medium text-gray-900">公式LINE</p>

              {lineAddFriendUrl ? (
                <div className="mt-2">
                  <a
                    href={lineAddFriendUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm text-blue-600 underline break-all"
                  >
                    {lineAddFriendUrl}
                  </a>
                </div>
              ) : null}

              {lineQrImageUrl ? (
                <div className="mt-4">
                  <Image
                    src={lineQrImageUrl}
                    alt="公式LINE QRコード"
                    width={180}
                    height={180}
                    className="rounded border"
                  />
                </div>
              ) : null}
            </div>
          )}

          <div className="mt-4 flex flex-col gap-2 md:flex-row">
            <button
              type="button"
              onClick={handleIssueToken}
              disabled={isPending}
              className="w-full md:w-auto rounded-md border px-4 py-2 text-sm font-medium hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isPending ? "処理中..." : "連携コードを発行"}
            </button>

            {linkedState ? (
              <button
                type="button"
                onClick={handleUnlink}
                disabled={isPending}
                className="w-full md:w-auto rounded-md border border-red-300 px-4 py-2 text-sm font-medium text-red-700 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isPending ? "処理中..." : "LINE連携を解除"}
              </button>
            ) : null}
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