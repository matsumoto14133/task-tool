import type { SupabaseClient } from "@supabase/supabase-js";
import {
  getLineAccountByUserId,
  insertLineLinkToken,
} from "./notificationQueries";

const LINK_CODE_PREFIX = "LINK";
const LINK_CODE_LENGTH = 6;
const LINK_TOKEN_EXPIRES_MINUTES = 10;

function generateRandomCode(length: number) {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let result = "";

  for (let i = 0; i < length; i += 1) {
    result += chars[Math.floor(Math.random() * chars.length)];
  }

  return result;
}

export function generateLineLinkToken() {
  return `${LINK_CODE_PREFIX}-${generateRandomCode(LINK_CODE_LENGTH)}`;
}

export function buildLineLinkExpiresAt(minutes = LINK_TOKEN_EXPIRES_MINUTES) {
  return new Date(Date.now() + minutes * 60 * 1000).toISOString();
}

export async function issueLineLinkToken(
  supabase: SupabaseClient,
  userId: string
) {
  const token = generateLineLinkToken();
  const expiresAt = buildLineLinkExpiresAt();

  const { data, error } = await insertLineLinkToken(supabase, {
    user_id: userId,
    token,
    expires_at: expiresAt,
  });

  if (error) {
    throw error;
  }

  return {
    token: data.token,
    expiresAt: data.expires_at,
  };
}

export async function getLineLinkStatus(
  supabase: SupabaseClient,
  userId: string
) {
  const { data, error } = await getLineAccountByUserId(supabase, userId);

  if (error) {
    throw error;
  }

  return {
    isLinked: Boolean(data),
    lineAccount: data ?? null,
  };
}