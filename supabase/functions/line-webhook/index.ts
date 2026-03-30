import {
  createServiceRoleClient,
  extractLinkTokenFromText,
  linkLineUserFromToken,
  parseLineWebhookBody,
  replyToLine,
  verifyLineSignature,
} from "../_shared/lineWebhookService.ts";

const LINE_CHANNEL_ACCESS_TOKEN = Deno.env.get("LINE_CHANNEL_ACCESS_TOKEN");
const LINE_CHANNEL_SECRET = Deno.env.get("LINE_CHANNEL_SECRET");

if (!LINE_CHANNEL_ACCESS_TOKEN || !LINE_CHANNEL_SECRET) {
  throw new Error("LINE secrets are missing.");
}

Deno.serve(async (req) => {
  console.log("[line-webhook] invoked", {
    method: req.method,
    url: req.url,
    at: new Date().toISOString(),
  });

  if (req.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405 });
  }

  const bodyText = await req.text();
  const signature = req.headers.get("x-line-signature");

  console.log("[line-webhook] received body", bodyText);
  console.log("[line-webhook] signature exists =", Boolean(signature));

  const valid = await verifyLineSignature({
    body: bodyText,
    signature,
    channelSecret: LINE_CHANNEL_SECRET,
  });

  if (!valid) {
    return new Response("Invalid signature", { status: 401 });
  }

  const body = parseLineWebhookBody(bodyText);
  const events = body.events ?? [];
  const supabase = createServiceRoleClient();

  console.log("[line-webhook] events.length =", events.length);

  for (const event of events) {
    if (event.type !== "message") continue;
    if (event.message?.type !== "text") continue;
    if (!event.replyToken) continue;

    const lineUserId = event.source?.userId;
    const text = event.message.text ?? "";

    if (!lineUserId) {
      await replyToLine({
        replyToken: event.replyToken,
        text: "個別チャットで連携コードを送信してください。",
        channelAccessToken: LINE_CHANNEL_ACCESS_TOKEN,
      });
      continue;
    }

    const token = extractLinkTokenFromText(text);

    if (!token) {
      await replyToLine({
        replyToken: event.replyToken,
        text: "連携コードを確認できませんでした。画面に表示された LINK-XXXXXX をそのまま送信してください。",
        channelAccessToken: LINE_CHANNEL_ACCESS_TOKEN,
      });
      continue;
    }

    try {
      await linkLineUserFromToken(supabase, {
        token,
        lineUserId,
      });

      await replyToLine({
        replyToken: event.replyToken,
        text: "LINE連携が完了しました。今後、このアカウントに通知を送信します。",
        channelAccessToken: LINE_CHANNEL_ACCESS_TOKEN,
      });
    } catch (error) {
      console.error("line-webhook link error:", error);

      await replyToLine({
        replyToken: event.replyToken,
        text:
          error instanceof Error
            ? error.message
            : "連携処理に失敗しました。時間を置いて再度お試しください。",
        channelAccessToken: LINE_CHANNEL_ACCESS_TOKEN,
      });
    }
  }

  return new Response("ok", { status: 200 });
});