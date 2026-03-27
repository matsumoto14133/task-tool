import { type EmailOtpType } from "@supabase/supabase-js";
import { type NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url);
  const token_hash = requestUrl.searchParams.get("token_hash");
  const type = requestUrl.searchParams.get("type") as EmailOtpType | null;

  const loginUrl = new URL("/login", request.url);

  if (!token_hash || !type) {
    loginUrl.searchParams.set("message", "認証リンクが無効です");
    return NextResponse.redirect(loginUrl);
  }

  const supabase = await createClient();

  const { error } = await supabase.auth.verifyOtp({
    type,
    token_hash,
  });

  if (error) {
    loginUrl.searchParams.set(
      "message",
      "このリンクはすでに使用済み、または期限切れの可能性があります。アカウント作成済みの場合はそのままログインしてください。"
    );
    return NextResponse.redirect(loginUrl);
  }

  loginUrl.searchParams.set(
    "message",
    "メール確認が完了しました。"
  );
  return NextResponse.redirect(loginUrl);
}