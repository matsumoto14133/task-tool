-- 通知対象取得RPCはEdge Functionsからのみ実行する。
-- public、anon、authenticatedからの直接実行を禁止する。

revoke execute
on function public.get_daily_summary_targets(timestamp with time zone)
from public, anon, authenticated;

grant execute
on function public.get_daily_summary_targets(timestamp with time zone)
to service_role;


revoke execute
on function public.get_due_day_before_notification_targets(timestamp with time zone)
from public, anon, authenticated;

grant execute
on function public.get_due_day_before_notification_targets(timestamp with time zone)
to service_role;


revoke execute
on function public.get_timed_notification_targets(timestamp with time zone)
from public, anon, authenticated;

grant execute
on function public.get_timed_notification_targets(timestamp with time zone)
to service_role;


-- デバッグ用FunctionはData APIから実行させない。
-- Supabase SQL Editorのpostgresロールからは引き続き実行できる。

revoke execute
on function public.debug_is_department_in_users_branch(uuid, uuid)
from public, anon, authenticated, service_role;