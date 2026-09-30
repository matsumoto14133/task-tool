-- =========================================================
-- 1. membership削除時に部署所属も削除する
-- =========================================================

alter table public.membership_departments
add constraint membership_departments_membership_fkey
foreign key (user_id, branch_id)
references public.memberships (user_id, branch_id)
on delete cascade;


-- =========================================================
-- 2. 通知本文・payloadをブラウザから取得させない
-- 現在のアプリはnotification_jobsをブラウザから参照していない。
-- =========================================================

drop policy if exists notification_jobs_select_own
on public.notification_jobs;


-- =========================================================
-- 3. 日次通知対象を、対象taskと同じbranchに現在所属する
-- ユーザーだけに限定する
-- =========================================================

create or replace function public.get_daily_summary_targets(
  p_now timestamp with time zone
)
returns table(
  user_id uuid,
  section text,
  task_id uuid,
  task_title text,
  target_at timestamp with time zone,
  daily_summary_time time without time zone
)
language sql
security definer
set search_path = public
as $$
  with window_base as (
    select
      p_now as now_at,
      (p_now - interval '1 minute') as window_start
  ),
  target_users as (
    select
      unp.user_id,
      unp.daily_summary_time
    from public.user_notification_profiles unp
    cross join window_base wb
    where
      ((wb.window_start at time zone 'Asia/Tokyo')::time < unp.daily_summary_time)
      and
      ((wb.now_at at time zone 'Asia/Tokyo')::time >= unp.daily_summary_time)
  ),
  base_due as (
    select
      ta.user_id,
      tu.daily_summary_time,
      t.id as task_id,
      t.title as task_title,
      t.due_at as target_at,
      case
        when (t.due_at at time zone 'Asia/Tokyo')::date
          = (p_now at time zone 'Asia/Tokyo')::date
          then 'due_today'
        when (t.due_at at time zone 'Asia/Tokyo')::date
          = ((p_now at time zone 'Asia/Tokyo')::date + 1)
          then 'due_tomorrow'
        else null
      end as section
    from public.tasks t
    inner join public.task_assignees ta
      on ta.task_id = t.id
    inner join public.memberships m
      on m.user_id = ta.user_id
     and m.branch_id = t.branch_id
    inner join target_users tu
      on tu.user_id = ta.user_id
    inner join public.line_accounts la
      on la.user_id = ta.user_id
     and la.is_active = true
    where t.due_at is not null
      and ta.status <> 'done'
  ),
  filtered_due as (
    select *
    from base_due bd
    where bd.section is not null
  ),
  planned_targets as (
    select
      ta.user_id,
      tu.daily_summary_time,
      case
        when (ta.planned_at at time zone 'Asia/Tokyo')::date
          = (p_now at time zone 'Asia/Tokyo')::date
          then 'planned_today'
        when (ta.planned_at at time zone 'Asia/Tokyo')::date
          = ((p_now at time zone 'Asia/Tokyo')::date + 1)
          then 'planned_tomorrow'
        else null
      end as section,
      t.id as task_id,
      t.title as task_title,
      ta.planned_at as target_at
    from public.task_assignees ta
    inner join public.tasks t
      on t.id = ta.task_id
    inner join public.memberships m
      on m.user_id = ta.user_id
     and m.branch_id = t.branch_id
    inner join target_users tu
      on tu.user_id = ta.user_id
    inner join public.line_accounts la
      on la.user_id = ta.user_id
     and la.is_active = true
    where ta.planned_at is not null
      and ta.status <> 'done'
  )
  select
    user_id,
    section,
    task_id,
    task_title,
    target_at,
    daily_summary_time
  from filtered_due

  union all

  select
    user_id,
    section,
    task_id,
    task_title,
    target_at,
    daily_summary_time
  from planned_targets
  where section is not null;
$$;


-- =========================================================
-- 4. 前日通知対象を現在所属中のユーザーだけに限定する
-- =========================================================

create or replace function public.get_due_day_before_notification_targets(
  p_now timestamp with time zone
)
returns table(
  task_id uuid,
  task_title text,
  due_at timestamp with time zone,
  assignee_user_id uuid
)
language sql
security definer
set search_path = public
as $$
  select
    t.id as task_id,
    t.title as task_title,
    t.due_at,
    ta.user_id as assignee_user_id
  from public.tasks t
  inner join public.task_assignees ta
    on ta.task_id = t.id
  inner join public.memberships m
    on m.user_id = ta.user_id
   and m.branch_id = t.branch_id
  inner join public.line_accounts la
    on la.user_id = ta.user_id
   and la.is_active = true
  inner join public.notification_settings ns
    on ns.user_id = ta.user_id
   and ns.channel = 'line'
   and ns.notification_type = 'task_due'
   and ns.timing_type = 'day_before'
   and ns.is_enabled = true
  where t.due_at is not null
    and (
      ((t.due_at at time zone 'Asia/Tokyo')::date - interval '1 day')
      <= (p_now at time zone 'Asia/Tokyo')::date
    );
$$;


-- =========================================================
-- 5. 時刻指定通知対象を現在所属中のユーザーだけに限定する
-- =========================================================

create or replace function public.get_timed_notification_targets(
  p_now timestamp with time zone
)
returns table(
  user_id uuid,
  notification_kind text,
  task_id uuid,
  task_title text,
  base_time timestamp with time zone,
  scheduled_for timestamp with time zone,
  offset_minutes integer
)
language sql
security definer
set search_path = public
as $$
  with window_base as (
    select
      p_now as now_at,
      (p_now - interval '1 minute') as window_start
  ),
  due_targets as (
    select
      ta.user_id,
      'due_one_hour_before'::text as notification_kind,
      t.id as task_id,
      t.title as task_title,
      t.due_at as base_time,
      (t.due_at - interval '1 hour') as scheduled_for,
      60 as offset_minutes
    from public.tasks t
    inner join public.task_assignees ta
      on ta.task_id = t.id
    inner join public.memberships m
      on m.user_id = ta.user_id
     and m.branch_id = t.branch_id
    inner join public.line_accounts la
      on la.user_id = ta.user_id
     and la.is_active = true
    cross join window_base wb
    where t.due_at is not null
      and ta.status <> 'done'
      and (t.due_at - interval '1 hour') > wb.window_start
      and (t.due_at - interval '1 hour') <= wb.now_at

    union all

    select
      ta.user_id,
      'due_at_time'::text as notification_kind,
      t.id as task_id,
      t.title as task_title,
      t.due_at as base_time,
      t.due_at as scheduled_for,
      0 as offset_minutes
    from public.tasks t
    inner join public.task_assignees ta
      on ta.task_id = t.id
    inner join public.memberships m
      on m.user_id = ta.user_id
     and m.branch_id = t.branch_id
    inner join public.line_accounts la
      on la.user_id = ta.user_id
     and la.is_active = true
    cross join window_base wb
    where t.due_at is not null
      and ta.status <> 'done'
      and t.due_at > wb.window_start
      and t.due_at <= wb.now_at
  ),
  planned_targets as (
    select
      ta.user_id,
      'planned_at_time'::text as notification_kind,
      t.id as task_id,
      t.title as task_title,
      ta.planned_at as base_time,
      ta.planned_at as scheduled_for,
      0 as offset_minutes
    from public.task_assignees ta
    inner join public.tasks t
      on t.id = ta.task_id
    inner join public.memberships m
      on m.user_id = ta.user_id
     and m.branch_id = t.branch_id
    inner join public.line_accounts la
      on la.user_id = ta.user_id
     and la.is_active = true
    cross join window_base wb
    where ta.planned_at is not null
      and ta.status <> 'done'
      and ta.notify_at_planned = true
      and ta.planned_at > wb.window_start
      and ta.planned_at <= wb.now_at

    union all

    select
      ta.user_id,
      'planned_custom_before'::text as notification_kind,
      t.id as task_id,
      t.title as task_title,
      ta.planned_at as base_time,
      (
        ta.planned_at
        - make_interval(mins => ta.notify_before_minutes)
      ) as scheduled_for,
      ta.notify_before_minutes as offset_minutes
    from public.task_assignees ta
    inner join public.tasks t
      on t.id = ta.task_id
    inner join public.memberships m
      on m.user_id = ta.user_id
     and m.branch_id = t.branch_id
    inner join public.line_accounts la
      on la.user_id = ta.user_id
     and la.is_active = true
    cross join window_base wb
    where ta.planned_at is not null
      and ta.status <> 'done'
      and ta.notify_before_planned = true
      and ta.notify_before_minutes is not null
      and ta.notify_before_minutes > 0
      and (
        ta.planned_at
        - make_interval(mins => ta.notify_before_minutes)
      ) > wb.window_start
      and (
        ta.planned_at
        - make_interval(mins => ta.notify_before_minutes)
      ) <= wb.now_at
  )
  select *
  from due_targets

  union all

  select *
  from planned_targets;
$$;


-- 通知対象取得RPCの実行権限を維持する。

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


-- =========================================================
-- 6. 通知ジョブを安全にprocessingへ変更するRPC
-- membershipをロックしてから通知ジョブをロックする。
-- =========================================================

create or replace function public.claim_notification_job(
  p_job_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_job public.notification_jobs%rowtype;
  v_has_membership boolean := false;
  v_is_authorized boolean := false;
begin
  -- ロック順序を決めるため、最初はジョブ情報の参照だけを行う。
  select nj.*
  into v_job
  from public.notification_jobs as nj
  where nj.id = p_job_id;

  if not found then
    return false;
  end if;

  -- membership削除と競合しないよう、membershipを先にロックする。
  perform m.id
  from public.memberships as m
  where m.user_id = v_job.user_id
  for key share;

  v_has_membership := found;

  if not v_has_membership then
    update public.notification_jobs
    set
      status = 'canceled',
      locked_at = null,
      last_error = null
    where id = p_job_id
      and status = 'pending';

    return false;
  end if;

  -- 同じジョブを複数処理しないよう、ジョブ行をロックして再確認する。
  select nj.*
  into v_job
  from public.notification_jobs as nj
  where nj.id = p_job_id
  for update;

  if not found
     or v_job.status <> 'pending'
     or v_job.channel <> 'line'
     or v_job.scheduled_for > clock_timestamp() then
    return false;
  end if;

  if v_job.task_id is not null then
    select exists (
      select 1
      from public.tasks as t
      inner join public.memberships as m
        on m.user_id = v_job.user_id
       and m.branch_id = t.branch_id
      where t.id = v_job.task_id
    )
    into v_is_authorized;

  elsif v_job.payload ->> 'type' = 'daily_summary' then
    if jsonb_typeof(v_job.payload -> 'items') = 'array'
       and jsonb_array_length(v_job.payload -> 'items') > 0 then
      select not exists (
        select 1
        from jsonb_array_elements(
          v_job.payload -> 'items'
        ) as item(value)
        left join public.tasks as t
          on t.id::text = item.value ->> 'task_id'
        left join public.memberships as m
          on m.user_id = v_job.user_id
         and m.branch_id = t.branch_id
        where t.id is null
           or m.user_id is null
      )
      into v_is_authorized;
    end if;
  end if;

  if not v_is_authorized then
    update public.notification_jobs
    set
      status = 'canceled',
      locked_at = null,
      last_error = null
    where id = p_job_id
      and status = 'pending';

    return false;
  end if;

  update public.notification_jobs
  set
    status = 'processing',
    locked_at = clock_timestamp(),
    last_error = null
  where id = p_job_id
    and status = 'pending';

  return found;
end;
$$;

revoke execute
on function public.claim_notification_job(uuid)
from public, anon, authenticated;

grant execute
on function public.claim_notification_job(uuid)
to service_role;


-- =========================================================
-- 7. membership削除前の通知停止処理
-- =========================================================

create or replace function public.prepare_membership_deletion()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- claim_notification_jobと同じ順序で関連ジョブをロックする。
  perform nj.id
  from public.notification_jobs as nj
  where nj.user_id = old.user_id
    and nj.status in ('pending', 'processing')
  order by nj.id
  for update;

  -- 直近5分以内に処理開始した通知は送信中の可能性がある。
  if exists (
    select 1
    from public.notification_jobs as nj
    where nj.user_id = old.user_id
      and nj.status = 'processing'
      and nj.locked_at is not null
      and nj.locked_at > clock_timestamp() - interval '5 minutes'
  ) then
    raise exception
      '通知送信処理中です。しばらく待ってから再度削除してください。';
  end if;

  -- pendingと、5分以上停止しているprocessingをキャンセルする。
  update public.notification_jobs
  set
    status = 'canceled',
    locked_at = null,
    last_error = null
  where user_id = old.user_id
    and (
      status = 'pending'
      or (
        status = 'processing'
        and (
          locked_at is null
          or locked_at <= clock_timestamp() - interval '5 minutes'
        )
      )
    );

  return old;
end;
$$;

revoke execute
on function public.prepare_membership_deletion()
from public, anon, authenticated, service_role;

drop trigger if exists prepare_membership_deletion_trigger
on public.memberships;

create trigger prepare_membership_deletion_trigger
before delete on public.memberships
for each row
execute function public.prepare_membership_deletion();