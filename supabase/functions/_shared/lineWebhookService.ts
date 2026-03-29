import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2";

type LineLinkTokenRow = {
  id: string;
  user_id: string;
  token: string;
  expires_at: string;
  used_at: string | null;
  linked_line_user_id: string | null;
};

type LineAccountRow = {
  id: string;
  user_id: string;
  line_user_id: string;
  is_active: boolean;
};

type LineMessageEvent = {
  type: "message";
  replyToken?: string;
  source?: {
    userId?: string;
    type?: string;
  };
  message?: {
    id?: string;
    type?: string;
    text?: string;
  };
};

type LineWebhookBody = {
  events?: LineMessageEvent[];
};

function timingSafeEqual(a: Uint8Array, b: Uint8Array) {
  if (a.length !== b.length) return false;
  let out = 0;
  for (let i = 0; i < a.length; i += 1) {
    out |= a[i] ^ b[i];
  }
  return out === 0;
}

function base64ToBytes(base64: string) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function textToBytes(text: string) {
  return new TextEncoder().encode(text);
}

async function hmacSha256Base64(secret: string, message: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    textToBytes(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );

  const signature = await crypto.subtle.sign("HMAC", key, textToBytes(message));
  const bytes = new Uint8Array(signature);

  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }

  return btoa(binary);
}

export async function verifyLineSignature(input: {
  body: string;
  signature: string | null;
  channelSecret: string;
}) {
  if (!input.signature) return false;

  const expected = await hmacSha256Base64(input.channelSecret, input.body);
  return timingSafeEqual(base64ToBytes(expected), base64ToBytes(input.signature));
}

export function parseLineWebhookBody(bodyText: string) {
  return JSON.parse(bodyText) as LineWebhookBody;
}

export function extractLinkTokenFromText(text: string) {
  const trimmed = text.trim().toUpperCase();
  const match = trimmed.match(/^LINK-[A-Z2-9]{6}$/);
  return match ? match[0] : null;
}

export function buildLineReplyBody(replyToken: string, text: string) {
  return {
    replyToken,
    messages: [
      {
        type: "text",
        text,
      },
    ],
  };
}

export async function replyToLine(input: {
  replyToken: string;
  text: string;
  channelAccessToken: string;
}) {
  const response = await fetch("https://api.line.me/v2/bot/message/reply", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${input.channelAccessToken}`,
    },
    body: JSON.stringify(buildLineReplyBody(input.replyToken, input.text)),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`LINE reply failed: ${response.status} ${errorText}`);
  }
}

async function getLineAccountByLineUserId(
  supabase: SupabaseClient,
  lineUserId: string
) {
  return supabase
    .from("line_accounts")
    .select("*")
    .eq("line_user_id", lineUserId)
    .eq("is_active", true)
    .maybeSingle<LineAccountRow>();
}

async function getValidLineLinkToken(
  supabase: SupabaseClient,
  token: string
) {
  return supabase
    .from("line_link_tokens")
    .select("*")
    .eq("token", token)
    .is("used_at", null)
    .gt("expires_at", new Date().toISOString())
    .maybeSingle<LineLinkTokenRow>();
}

async function markLineLinkTokenUsed(
  supabase: SupabaseClient,
  tokenId: string,
  lineUserId: string
) {
  return supabase
    .from("line_link_tokens")
    .update({
      used_at: new Date().toISOString(),
      linked_line_user_id: lineUserId,
    })
    .eq("id", tokenId);
}

async function upsertLineAccount(
  supabase: SupabaseClient,
  input: {
    user_id: string;
    line_user_id: string;
  }
) {
  return supabase
    .from("line_accounts")
    .upsert(
      {
        user_id: input.user_id,
        line_user_id: input.line_user_id,
        is_active: true,
        linked_at: new Date().toISOString(),
        unlinked_at: null,
      },
      { onConflict: "user_id" }
    )
    .select("*")
    .single();
}

export async function linkLineUserFromToken(
  supabase: SupabaseClient,
  input: {
    token: string;
    lineUserId: string;
  }
) {
  const { data: existingAccount, error: existingAccountError } =
    await getLineAccountByLineUserId(supabase, input.lineUserId);

  if (existingAccountError) throw existingAccountError;
  if (existingAccount) {
    throw new Error("このLINEアカウントはすでに連携済みです。");
  }

  const { data: tokenRow, error: tokenError } = await getValidLineLinkToken(
    supabase,
    input.token
  );

  if (tokenError) throw tokenError;
  if (!tokenRow) {
    throw new Error("連携コードが無効か、有効期限切れです。");
  }

  const { error: upsertError } = await upsertLineAccount(supabase, {
    user_id: tokenRow.user_id,
    line_user_id: input.lineUserId,
  });

  if (upsertError) throw upsertError;

  const { error: usedError } = await markLineLinkTokenUsed(
    supabase,
    tokenRow.id,
    input.lineUserId
  );

  if (usedError) throw usedError;

  return { userId: tokenRow.user_id };
}

export function createServiceRoleClient() {
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("Supabase environment variables are missing.");
  }

  return createClient(supabaseUrl, serviceRoleKey);
}