


SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


CREATE EXTENSION IF NOT EXISTS "pg_cron" WITH SCHEMA "pg_catalog";






CREATE EXTENSION IF NOT EXISTS "pg_net" WITH SCHEMA "extensions";






COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE EXTENSION IF NOT EXISTS "pg_graphql" WITH SCHEMA "graphql";






CREATE EXTENSION IF NOT EXISTS "pg_stat_statements" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "supabase_vault" WITH SCHEMA "vault";






CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA "extensions";






CREATE TYPE "public"."member_role" AS ENUM (
    'member',
    'manager',
    'admin'
);


ALTER TYPE "public"."member_role" OWNER TO "postgres";


CREATE TYPE "public"."notification_channel" AS ENUM (
    'line',
    'email',
    'in_app'
);


ALTER TYPE "public"."notification_channel" OWNER TO "postgres";


CREATE TYPE "public"."notification_job_status" AS ENUM (
    'pending',
    'processing',
    'sent',
    'failed',
    'canceled'
);


ALTER TYPE "public"."notification_job_status" OWNER TO "postgres";


CREATE TYPE "public"."notification_timing_type" AS ENUM (
    'day_before',
    'same_day',
    'custom_minutes_before'
);


ALTER TYPE "public"."notification_timing_type" OWNER TO "postgres";


CREATE TYPE "public"."notification_type" AS ENUM (
    'task_due',
    'task_planned'
);


ALTER TYPE "public"."notification_type" OWNER TO "postgres";


CREATE TYPE "public"."scope_type" AS ENUM (
    'branch',
    'department',
    'personal'
);


ALTER TYPE "public"."scope_type" OWNER TO "postgres";


CREATE TYPE "public"."task_status" AS ENUM (
    'todo',
    'doing',
    'done',
    'hold'
);


ALTER TYPE "public"."task_status" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."current_branch_ids"() RETURNS SETOF "uuid"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select branch_id
  from public.memberships
  where user_id = auth.uid();
$$;


ALTER FUNCTION "public"."current_branch_ids"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."debug_is_department_in_users_branch"("target_department_id" "uuid", "target_user_id" "uuid") RETURNS TABLE("department_id" "uuid", "department_branch_id" "uuid", "membership_branch_id" "uuid", "matched" boolean)
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select
    d.id,
    d.branch_id,
    m.branch_id,
    (d.branch_id = m.branch_id) as matched
  from public.departments d
  left join public.memberships m
    on m.user_id = target_user_id
  where d.id = target_department_id;
$$;


ALTER FUNCTION "public"."debug_is_department_in_users_branch"("target_department_id" "uuid", "target_user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_daily_summary_targets"("p_now" timestamp with time zone) RETURNS TABLE("user_id" "uuid", "section" "text", "task_id" "uuid", "task_title" "text", "target_at" timestamp with time zone, "daily_summary_time" time without time zone)
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
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
        when (t.due_at at time zone 'Asia/Tokyo')::date = (p_now at time zone 'Asia/Tokyo')::date
          then 'due_today'
        when (t.due_at at time zone 'Asia/Tokyo')::date = ((p_now at time zone 'Asia/Tokyo')::date + 1)
          then 'due_tomorrow'
        else null
      end as section
    from public.tasks t
    inner join public.task_assignees ta
      on ta.task_id = t.id
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
        when (ta.planned_at at time zone 'Asia/Tokyo')::date = (p_now at time zone 'Asia/Tokyo')::date
          then 'planned_today'
        when (ta.planned_at at time zone 'Asia/Tokyo')::date = ((p_now at time zone 'Asia/Tokyo')::date + 1)
          then 'planned_tomorrow'
        else null
      end as section,
      t.id as task_id,
      t.title as task_title,
      ta.planned_at as target_at
    from public.task_assignees ta
    inner join public.tasks t
      on t.id = ta.task_id
    inner join target_users tu
      on tu.user_id = ta.user_id
    inner join public.line_accounts la
      on la.user_id = ta.user_id
     and la.is_active = true
    where ta.planned_at is not null
      and ta.status <> 'done'
  )
  select user_id, section, task_id, task_title, target_at, daily_summary_time
  from filtered_due
  union all
  select user_id, section, task_id, task_title, target_at, daily_summary_time
  from planned_targets
  where section is not null;
$$;


ALTER FUNCTION "public"."get_daily_summary_targets"("p_now" timestamp with time zone) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_due_day_before_notification_targets"("p_now" timestamp with time zone) RETURNS TABLE("task_id" "uuid", "task_title" "text", "due_at" timestamp with time zone, "assignee_user_id" "uuid")
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select
    t.id as task_id,
    t.title as task_title,
    t.due_at,
    ta.user_id as assignee_user_id
  from public.tasks t
  inner join public.task_assignees ta
    on ta.task_id = t.id
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


ALTER FUNCTION "public"."get_due_day_before_notification_targets"("p_now" timestamp with time zone) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_timed_notification_targets"("p_now" timestamp with time zone) RETURNS TABLE("user_id" "uuid", "notification_kind" "text", "task_id" "uuid", "task_title" "text", "base_time" timestamp with time zone, "scheduled_for" timestamp with time zone, "offset_minutes" integer)
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
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
      (ta.planned_at - make_interval(mins => ta.notify_before_minutes)) as scheduled_for,
      ta.notify_before_minutes as offset_minutes
    from public.task_assignees ta
    inner join public.tasks t
      on t.id = ta.task_id
    inner join public.line_accounts la
      on la.user_id = ta.user_id
     and la.is_active = true
    cross join window_base wb
    where ta.planned_at is not null
      and ta.status <> 'done'
      and ta.notify_before_planned = true
      and ta.notify_before_minutes is not null
      and ta.notify_before_minutes > 0
      and (ta.planned_at - make_interval(mins => ta.notify_before_minutes)) > wb.window_start
      and (ta.planned_at - make_interval(mins => ta.notify_before_minutes)) <= wb.now_at
  )
  select * from due_targets
  union all
  select * from planned_targets;
$$;


ALTER FUNCTION "public"."get_timed_notification_targets"("p_now" timestamp with time zone) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."handle_new_user"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  insert into public.profiles (user_id, email)
  values (new.id, new.email)
  on conflict (user_id) do update
    set email = excluded.email;

  return new;
end;
$$;


ALTER FUNCTION "public"."handle_new_user"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_admin_in_branch"("b" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select exists (
    select 1
    from public.memberships
    where user_id = auth.uid()
      and branch_id = b
      and role = 'admin'
  );
$$;


ALTER FUNCTION "public"."is_admin_in_branch"("b" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_department_in_current_branch"("target_department_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select exists (
    select 1
    from public.departments d
    where d.id = target_department_id
      and d.branch_id in (
        select cb.current_branch_ids
        from public.current_branch_ids() as cb(current_branch_ids)
      )
  );
$$;


ALTER FUNCTION "public"."is_department_in_current_branch"("target_department_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_department_in_users_branch"("target_department_id" "uuid", "target_user_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select exists (
    select 1
    from public.departments d
    join public.memberships m
      on m.branch_id = d.branch_id
    where d.id = target_department_id
      and m.user_id = target_user_id
  );
$$;


ALTER FUNCTION "public"."is_department_in_users_branch"("target_department_id" "uuid", "target_user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."on_task_assignees_changed"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
begin
  perform public.recompute_task_status(coalesce(new.task_id, old.task_id));
  return coalesce(new, old);
end;
$$;


ALTER FUNCTION "public"."on_task_assignees_changed"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."recompute_task_status"("p_task_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
declare
  assignee_count int;
  done_count int;
  doing_count int;
  hold_count int;
  next_status public.task_status;
begin
  select count(*),
         count(*) filter (where status = 'done'),
         count(*) filter (where status = 'doing'),
         count(*) filter (where status = 'hold')
    into assignee_count, done_count, doing_count, hold_count
  from public.task_assignees
  where task_id = p_task_id;

  if assignee_count = 0 then
    next_status := 'todo'::public.task_status;
  elsif done_count = assignee_count then
    next_status := 'done'::public.task_status;
  elsif doing_count > 0 then
    next_status := 'doing'::public.task_status;
  elsif hold_count > 0 then
    next_status := 'hold'::public.task_status;
  else
    next_status := 'todo'::public.task_status;
  end if;

  update public.tasks
  set status = next_status,
      updated_at = now()
  where id = p_task_id;
end;
$$;


ALTER FUNCTION "public"."recompute_task_status"("p_task_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
begin
  new.updated_at = now();
  return new;
end;
$$;


ALTER FUNCTION "public"."set_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."validate_task_scope"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
begin
  if new.scope_type = 'branch' then
    if new.scope_id is null then
      raise exception 'scope_id is required for branch';
    end if;

    if not exists (
      select 1
      from public.branches b
      where b.id = new.scope_id::uuid
    ) then
      raise exception 'invalid scope_id for branch';
    end if;

  elsif new.scope_type = 'department' then
    if new.scope_id is null then
      raise exception 'scope_id is required for department';
    end if;

    if not exists (
      select 1
      from public.departments d
      where d.id = new.scope_id::uuid
    ) then
      raise exception 'invalid scope_id for department';
    end if;

  elsif new.scope_type = 'personal' then
    if new.scope_id is null then
      raise exception 'scope_id is required for personal';
    end if;

    if not exists (
      select 1
      from public.profiles p
      where p.user_id = new.scope_id::uuid
    ) then
      raise exception 'invalid scope_id for personal';
    end if;

  else
    raise exception 'invalid scope_type: %', new.scope_type;
  end if;

  return new;
end;
$$;


ALTER FUNCTION "public"."validate_task_scope"() OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."branches" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."branches" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."departments" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "branch_id" "uuid",
    "name" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."departments" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."line_accounts" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "line_user_id" "text" NOT NULL,
    "display_name" "text",
    "picture_url" "text",
    "status_message" "text",
    "is_active" boolean DEFAULT true NOT NULL,
    "linked_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "unlinked_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."line_accounts" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."line_link_tokens" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "token" "text" NOT NULL,
    "expires_at" timestamp with time zone NOT NULL,
    "used_at" timestamp with time zone,
    "linked_line_user_id" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."line_link_tokens" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."membership_departments" (
    "user_id" "uuid" NOT NULL,
    "branch_id" "uuid" NOT NULL,
    "department_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."membership_departments" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."memberships" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "branch_id" "uuid" NOT NULL,
    "department_id" "uuid",
    "role" "public"."member_role" DEFAULT 'member'::"public"."member_role" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."memberships" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."notification_jobs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "channel" "public"."notification_channel" NOT NULL,
    "notification_type" "public"."notification_type" NOT NULL,
    "task_id" "uuid",
    "assignee_user_id" "uuid",
    "scheduled_for" timestamp with time zone NOT NULL,
    "status" "public"."notification_job_status" DEFAULT 'pending'::"public"."notification_job_status" NOT NULL,
    "dedupe_key" "text" NOT NULL,
    "title" "text" NOT NULL,
    "body" "text" NOT NULL,
    "payload" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "provider_message_id" "text",
    "last_error" "text",
    "retry_count" integer DEFAULT 0 NOT NULL,
    "max_retry_count" integer DEFAULT 3 NOT NULL,
    "locked_at" timestamp with time zone,
    "sent_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "chk_notification_jobs_max_retry_count_non_negative" CHECK (("max_retry_count" >= 0)),
    CONSTRAINT "chk_notification_jobs_retry_count_non_negative" CHECK (("retry_count" >= 0))
);


ALTER TABLE "public"."notification_jobs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."notification_settings" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "channel" "public"."notification_channel" NOT NULL,
    "notification_type" "public"."notification_type" NOT NULL,
    "timing_type" "public"."notification_timing_type" NOT NULL,
    "offset_minutes" integer,
    "is_enabled" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "chk_notification_settings_offset_minutes" CHECK (((("timing_type" = 'custom_minutes_before'::"public"."notification_timing_type") AND ("offset_minutes" IS NOT NULL) AND ("offset_minutes" > 0)) OR (("timing_type" <> 'custom_minutes_before'::"public"."notification_timing_type") AND ("offset_minutes" IS NULL))))
);


ALTER TABLE "public"."notification_settings" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."profiles" (
    "user_id" "uuid" NOT NULL,
    "email" "text",
    "display_name" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."profiles" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."projects" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "branch_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "description" "text",
    "schedule" "text",
    "attachment_url" "text",
    "requester_id" "uuid" NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."projects" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."task_assignees" (
    "task_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "assigned_at" timestamp with time zone DEFAULT "now"(),
    "status" "text" DEFAULT 'todo'::"text" NOT NULL,
    "note" "text",
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "planned_at" timestamp with time zone,
    "notify_at_planned" boolean DEFAULT true NOT NULL,
    "notify_before_minutes" integer,
    "notify_before_planned" boolean DEFAULT true NOT NULL,
    CONSTRAINT "task_assignees_status_check" CHECK (("status" = ANY (ARRAY['todo'::"text", 'doing'::"text", 'hold'::"text", 'done'::"text"])))
);


ALTER TABLE "public"."task_assignees" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."tasks" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "title" "text" NOT NULL,
    "description" "text",
    "requester_id" "uuid" NOT NULL,
    "scope_type" "public"."scope_type" NOT NULL,
    "scope_id" "uuid" NOT NULL,
    "due_at" timestamp with time zone,
    "status" "public"."task_status" DEFAULT 'todo'::"public"."task_status" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "project_id" "uuid",
    "attachment_url" "text",
    "branch_id" "uuid" NOT NULL
);


ALTER TABLE "public"."tasks" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."user_notification_profiles" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "daily_summary_time" time without time zone DEFAULT '09:00:00'::time without time zone NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."user_notification_profiles" OWNER TO "postgres";


ALTER TABLE ONLY "public"."branches"
    ADD CONSTRAINT "branches_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."departments"
    ADD CONSTRAINT "departments_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."line_accounts"
    ADD CONSTRAINT "line_accounts_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."line_link_tokens"
    ADD CONSTRAINT "line_link_tokens_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."membership_departments"
    ADD CONSTRAINT "membership_departments_pkey" PRIMARY KEY ("user_id", "branch_id", "department_id");



ALTER TABLE ONLY "public"."memberships"
    ADD CONSTRAINT "memberships_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."memberships"
    ADD CONSTRAINT "memberships_user_id_branch_id_department_id_key" UNIQUE ("user_id", "branch_id", "department_id");



ALTER TABLE ONLY "public"."notification_jobs"
    ADD CONSTRAINT "notification_jobs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."notification_settings"
    ADD CONSTRAINT "notification_settings_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_email_key" UNIQUE ("email");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_pkey" PRIMARY KEY ("user_id");



ALTER TABLE ONLY "public"."projects"
    ADD CONSTRAINT "projects_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."task_assignees"
    ADD CONSTRAINT "task_assignees_pkey" PRIMARY KEY ("task_id", "user_id");



ALTER TABLE ONLY "public"."task_assignees"
    ADD CONSTRAINT "task_assignees_task_id_user_id_key" UNIQUE ("task_id", "user_id");



ALTER TABLE ONLY "public"."tasks"
    ADD CONSTRAINT "tasks_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."line_accounts"
    ADD CONSTRAINT "uq_line_accounts_line_user_id" UNIQUE ("line_user_id");



ALTER TABLE ONLY "public"."line_accounts"
    ADD CONSTRAINT "uq_line_accounts_user_id" UNIQUE ("user_id");



ALTER TABLE ONLY "public"."line_link_tokens"
    ADD CONSTRAINT "uq_line_link_tokens_token" UNIQUE ("token");



ALTER TABLE ONLY "public"."notification_jobs"
    ADD CONSTRAINT "uq_notification_jobs_dedupe_key" UNIQUE ("dedupe_key");



ALTER TABLE ONLY "public"."notification_settings"
    ADD CONSTRAINT "uq_notification_settings_rule" UNIQUE ("user_id", "channel", "notification_type", "timing_type", "offset_minutes");



ALTER TABLE ONLY "public"."user_notification_profiles"
    ADD CONSTRAINT "uq_user_notification_profiles_user_id" UNIQUE ("user_id");



ALTER TABLE ONLY "public"."user_notification_profiles"
    ADD CONSTRAINT "user_notification_profiles_pkey" PRIMARY KEY ("id");



CREATE INDEX "idx_line_accounts_line_user_id" ON "public"."line_accounts" USING "btree" ("line_user_id");



CREATE INDEX "idx_line_accounts_user_id" ON "public"."line_accounts" USING "btree" ("user_id");



CREATE INDEX "idx_line_link_tokens_expires_at" ON "public"."line_link_tokens" USING "btree" ("expires_at");



CREATE INDEX "idx_line_link_tokens_token" ON "public"."line_link_tokens" USING "btree" ("token");



CREATE INDEX "idx_line_link_tokens_user_id" ON "public"."line_link_tokens" USING "btree" ("user_id");



CREATE INDEX "idx_memberships_branch" ON "public"."memberships" USING "btree" ("branch_id");



CREATE INDEX "idx_memberships_dept" ON "public"."memberships" USING "btree" ("department_id");



CREATE INDEX "idx_memberships_user" ON "public"."memberships" USING "btree" ("user_id");



CREATE INDEX "idx_notification_jobs_channel_status" ON "public"."notification_jobs" USING "btree" ("channel", "status", "scheduled_for");



CREATE INDEX "idx_notification_jobs_status_scheduled_for" ON "public"."notification_jobs" USING "btree" ("status", "scheduled_for");



CREATE INDEX "idx_notification_jobs_task_id" ON "public"."notification_jobs" USING "btree" ("task_id");



CREATE INDEX "idx_notification_jobs_user_id" ON "public"."notification_jobs" USING "btree" ("user_id");



CREATE INDEX "idx_notification_settings_enabled" ON "public"."notification_settings" USING "btree" ("user_id", "channel", "notification_type") WHERE ("is_enabled" = true);



CREATE INDEX "idx_notification_settings_user_id" ON "public"."notification_settings" USING "btree" ("user_id");



CREATE INDEX "idx_projects_branch" ON "public"."projects" USING "btree" ("branch_id");



CREATE INDEX "idx_tasks_project" ON "public"."tasks" USING "btree" ("project_id");



CREATE INDEX "idx_tasks_project_id" ON "public"."tasks" USING "btree" ("project_id");



CREATE INDEX "idx_user_notification_profiles_user_id" ON "public"."user_notification_profiles" USING "btree" ("user_id");



CREATE INDEX "membership_departments_branch_id_idx" ON "public"."membership_departments" USING "btree" ("branch_id");



CREATE INDEX "membership_departments_department_id_idx" ON "public"."membership_departments" USING "btree" ("department_id");



CREATE INDEX "membership_departments_user_id_idx" ON "public"."membership_departments" USING "btree" ("user_id");



CREATE UNIQUE INDEX "memberships_user_branch_unique" ON "public"."memberships" USING "btree" ("user_id", "branch_id");



CREATE OR REPLACE TRIGGER "task_assignees_changed_trigger" AFTER INSERT OR DELETE OR UPDATE ON "public"."task_assignees" FOR EACH ROW EXECUTE FUNCTION "public"."on_task_assignees_changed"();



CREATE OR REPLACE TRIGGER "trg_line_accounts_updated_at" BEFORE UPDATE ON "public"."line_accounts" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "trg_notification_jobs_updated_at" BEFORE UPDATE ON "public"."notification_jobs" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "trg_notification_settings_updated_at" BEFORE UPDATE ON "public"."notification_settings" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "trg_user_notification_profiles_updated_at" BEFORE UPDATE ON "public"."user_notification_profiles" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "trg_validate_task_scope" BEFORE INSERT OR UPDATE ON "public"."tasks" FOR EACH ROW EXECUTE FUNCTION "public"."validate_task_scope"();



ALTER TABLE ONLY "public"."departments"
    ADD CONSTRAINT "departments_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."line_accounts"
    ADD CONSTRAINT "line_accounts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("user_id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."line_link_tokens"
    ADD CONSTRAINT "line_link_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("user_id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."membership_departments"
    ADD CONSTRAINT "membership_departments_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."membership_departments"
    ADD CONSTRAINT "membership_departments_department_id_fkey" FOREIGN KEY ("department_id") REFERENCES "public"."departments"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."membership_departments"
    ADD CONSTRAINT "membership_departments_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("user_id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."memberships"
    ADD CONSTRAINT "memberships_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."memberships"
    ADD CONSTRAINT "memberships_department_id_fkey" FOREIGN KEY ("department_id") REFERENCES "public"."departments"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."memberships"
    ADD CONSTRAINT "memberships_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("user_id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."notification_jobs"
    ADD CONSTRAINT "notification_jobs_assignee_user_id_fkey" FOREIGN KEY ("assignee_user_id") REFERENCES "public"."profiles"("user_id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."notification_jobs"
    ADD CONSTRAINT "notification_jobs_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."notification_jobs"
    ADD CONSTRAINT "notification_jobs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("user_id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."notification_settings"
    ADD CONSTRAINT "notification_settings_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("user_id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."projects"
    ADD CONSTRAINT "projects_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."projects"
    ADD CONSTRAINT "projects_requester_id_fkey" FOREIGN KEY ("requester_id") REFERENCES "public"."profiles"("user_id");



ALTER TABLE ONLY "public"."task_assignees"
    ADD CONSTRAINT "task_assignees_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."task_assignees"
    ADD CONSTRAINT "task_assignees_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."tasks"
    ADD CONSTRAINT "tasks_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id");



ALTER TABLE ONLY "public"."tasks"
    ADD CONSTRAINT "tasks_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."tasks"
    ADD CONSTRAINT "tasks_requester_id_fkey" FOREIGN KEY ("requester_id") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."user_notification_profiles"
    ADD CONSTRAINT "user_notification_profiles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("user_id") ON DELETE CASCADE;



ALTER TABLE "public"."branches" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "branches_select_my_branch" ON "public"."branches" FOR SELECT TO "authenticated" USING (("id" IN ( SELECT "m"."branch_id"
   FROM "public"."memberships" "m"
  WHERE ("m"."user_id" = "auth"."uid"()))));



ALTER TABLE "public"."departments" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "departments_delete_admin_only" ON "public"."departments" FOR DELETE TO "authenticated" USING ("public"."is_admin_in_branch"("branch_id"));



CREATE POLICY "departments_insert_admin_only" ON "public"."departments" FOR INSERT TO "authenticated" WITH CHECK ("public"."is_admin_in_branch"("branch_id"));



CREATE POLICY "departments_select_same_branch" ON "public"."departments" FOR SELECT TO "authenticated" USING (("branch_id" IN ( SELECT "m"."branch_id"
   FROM "public"."memberships" "m"
  WHERE ("m"."user_id" = "auth"."uid"()))));



CREATE POLICY "departments_update_admin_only" ON "public"."departments" FOR UPDATE TO "authenticated" USING ("public"."is_admin_in_branch"("branch_id")) WITH CHECK ("public"."is_admin_in_branch"("branch_id"));



ALTER TABLE "public"."line_accounts" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "line_accounts_select_own" ON "public"."line_accounts" FOR SELECT TO "authenticated" USING (("auth"."uid"() = "user_id"));



ALTER TABLE "public"."line_link_tokens" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "line_link_tokens_insert_own" ON "public"."line_link_tokens" FOR INSERT TO "authenticated" WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "line_link_tokens_select_own" ON "public"."line_link_tokens" FOR SELECT TO "authenticated" USING (("auth"."uid"() = "user_id"));



ALTER TABLE "public"."membership_departments" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "membership_departments_delete_manager_or_admin" ON "public"."membership_departments" FOR DELETE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."memberships" "actor_m"
  WHERE (("actor_m"."user_id" = "auth"."uid"()) AND ("actor_m"."branch_id" = "membership_departments"."branch_id") AND ("actor_m"."role" = ANY (ARRAY['manager'::"public"."member_role", 'admin'::"public"."member_role"]))))));



CREATE POLICY "membership_departments_insert_manager_or_admin" ON "public"."membership_departments" FOR INSERT TO "authenticated" WITH CHECK (((EXISTS ( SELECT 1
   FROM "public"."memberships" "actor_m"
  WHERE (("actor_m"."user_id" = "auth"."uid"()) AND ("actor_m"."branch_id" = "membership_departments"."branch_id") AND ("actor_m"."role" = ANY (ARRAY['manager'::"public"."member_role", 'admin'::"public"."member_role"]))))) AND (EXISTS ( SELECT 1
   FROM "public"."memberships" "target_m"
  WHERE (("target_m"."user_id" = "membership_departments"."user_id") AND ("target_m"."branch_id" = "membership_departments"."branch_id")))) AND (EXISTS ( SELECT 1
   FROM "public"."departments" "d"
  WHERE (("d"."id" = "membership_departments"."department_id") AND ("d"."branch_id" = "membership_departments"."branch_id"))))));



CREATE POLICY "membership_departments_select_same_branch" ON "public"."membership_departments" FOR SELECT TO "authenticated" USING (("branch_id" IN ( SELECT "m"."branch_id"
   FROM "public"."memberships" "m"
  WHERE ("m"."user_id" = "auth"."uid"()))));



ALTER TABLE "public"."memberships" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "memberships_delete_admin_only" ON "public"."memberships" FOR DELETE USING ("public"."is_admin_in_branch"("branch_id"));



CREATE POLICY "memberships_insert_admin_only" ON "public"."memberships" FOR INSERT WITH CHECK ("public"."is_admin_in_branch"("branch_id"));



CREATE POLICY "memberships_select_same_branch" ON "public"."memberships" FOR SELECT USING (("branch_id" IN ( SELECT "current_branch_ids"."current_branch_ids"
   FROM "public"."current_branch_ids"() "current_branch_ids"("current_branch_ids"))));



CREATE POLICY "memberships_update_admin_only" ON "public"."memberships" FOR UPDATE USING ("public"."is_admin_in_branch"("branch_id")) WITH CHECK ("public"."is_admin_in_branch"("branch_id"));



ALTER TABLE "public"."notification_jobs" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "notification_jobs_select_own" ON "public"."notification_jobs" FOR SELECT TO "authenticated" USING (("auth"."uid"() = "user_id"));



ALTER TABLE "public"."notification_settings" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "notification_settings_insert_own" ON "public"."notification_settings" FOR INSERT TO "authenticated" WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "notification_settings_select_own" ON "public"."notification_settings" FOR SELECT TO "authenticated" USING (("auth"."uid"() = "user_id"));



CREATE POLICY "notification_settings_update_own" ON "public"."notification_settings" FOR UPDATE TO "authenticated" USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));



ALTER TABLE "public"."profiles" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "profiles_select_same_branch" ON "public"."profiles" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM ("public"."memberships" "me"
     JOIN "public"."memberships" "target" ON (("target"."branch_id" = "me"."branch_id")))
  WHERE (("me"."user_id" = "auth"."uid"()) AND ("target"."user_id" = "profiles"."user_id")))));



CREATE POLICY "profiles_update_self" ON "public"."profiles" FOR UPDATE USING (("user_id" = "auth"."uid"())) WITH CHECK (("user_id" = "auth"."uid"()));



ALTER TABLE "public"."projects" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "projects_insert_same_branch" ON "public"."projects" FOR INSERT TO "authenticated" WITH CHECK (("branch_id" IN ( SELECT "m"."branch_id"
   FROM "public"."memberships" "m"
  WHERE ("m"."user_id" = "auth"."uid"()))));



CREATE POLICY "projects_select_same_branch" ON "public"."projects" FOR SELECT TO "authenticated" USING (("branch_id" IN ( SELECT "m"."branch_id"
   FROM "public"."memberships" "m"
  WHERE ("m"."user_id" = "auth"."uid"()))));



CREATE POLICY "projects_update_manager_or_requester" ON "public"."projects" FOR UPDATE TO "authenticated" USING ((("requester_id" = "auth"."uid"()) OR (EXISTS ( SELECT 1
   FROM "public"."memberships" "m"
  WHERE (("m"."user_id" = "auth"."uid"()) AND ("m"."branch_id" = "projects"."branch_id") AND ("m"."role" = ANY (ARRAY['manager'::"public"."member_role", 'admin'::"public"."member_role"]))))))) WITH CHECK ((("requester_id" = "auth"."uid"()) OR (EXISTS ( SELECT 1
   FROM "public"."memberships" "m"
  WHERE (("m"."user_id" = "auth"."uid"()) AND ("m"."branch_id" = "projects"."branch_id") AND ("m"."role" = ANY (ARRAY['manager'::"public"."member_role", 'admin'::"public"."member_role"])))))));



ALTER TABLE "public"."task_assignees" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "task_assignees_delete_requester_or_manager" ON "public"."task_assignees" FOR DELETE USING ((EXISTS ( SELECT 1
   FROM "public"."tasks" "t"
  WHERE (("t"."id" = "task_assignees"."task_id") AND (("t"."requester_id" = "auth"."uid"()) OR (EXISTS ( SELECT 1
           FROM "public"."memberships" "m"
          WHERE (("m"."user_id" = "auth"."uid"()) AND ("m"."branch_id" = "t"."branch_id") AND ("m"."role" = ANY (ARRAY['manager'::"public"."member_role", 'admin'::"public"."member_role"]))))))))));



CREATE POLICY "task_assignees_insert_requester_or_manager" ON "public"."task_assignees" FOR INSERT WITH CHECK (((EXISTS ( SELECT 1
   FROM "public"."tasks" "t"
  WHERE (("t"."id" = "task_assignees"."task_id") AND (("t"."requester_id" = "auth"."uid"()) OR (EXISTS ( SELECT 1
           FROM "public"."memberships" "m"
          WHERE (("m"."user_id" = "auth"."uid"()) AND ("m"."branch_id" = "t"."branch_id") AND ("m"."role" = ANY (ARRAY['manager'::"public"."member_role", 'admin'::"public"."member_role"]))))))))) AND (EXISTS ( SELECT 1
   FROM ("public"."tasks" "t"
     JOIN "public"."memberships" "target_m" ON (("target_m"."branch_id" = "t"."branch_id")))
  WHERE (("t"."id" = "task_assignees"."task_id") AND ("target_m"."user_id" = "task_assignees"."user_id"))))));



CREATE POLICY "task_assignees_select_same_branch" ON "public"."task_assignees" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM ("public"."tasks" "t"
     JOIN "public"."memberships" "m" ON (("m"."branch_id" = "t"."branch_id")))
  WHERE (("t"."id" = "task_assignees"."task_id") AND ("m"."user_id" = "auth"."uid"())))));



CREATE POLICY "task_assignees_update_requester_manager_or_self" ON "public"."task_assignees" FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM "public"."tasks" "t"
  WHERE (("t"."id" = "task_assignees"."task_id") AND (("t"."requester_id" = "auth"."uid"()) OR (EXISTS ( SELECT 1
           FROM "public"."memberships" "m"
          WHERE (("m"."user_id" = "auth"."uid"()) AND ("m"."branch_id" = "t"."branch_id") AND ("m"."role" = ANY (ARRAY['manager'::"public"."member_role", 'admin'::"public"."member_role"]))))) OR ("task_assignees"."user_id" = "auth"."uid"())))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM ("public"."tasks" "t"
     JOIN "public"."memberships" "target_m" ON (("target_m"."branch_id" = "t"."branch_id")))
  WHERE (("t"."id" = "task_assignees"."task_id") AND ("target_m"."user_id" = "task_assignees"."user_id") AND (("t"."requester_id" = "auth"."uid"()) OR (EXISTS ( SELECT 1
           FROM "public"."memberships" "m"
          WHERE (("m"."user_id" = "auth"."uid"()) AND ("m"."branch_id" = "t"."branch_id") AND ("m"."role" = ANY (ARRAY['manager'::"public"."member_role", 'admin'::"public"."member_role"]))))) OR ("task_assignees"."user_id" = "auth"."uid"()))))));



ALTER TABLE "public"."tasks" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "tasks_delete_manager_admin_only" ON "public"."tasks" FOR DELETE USING ((EXISTS ( SELECT 1
   FROM "public"."memberships" "m"
  WHERE (("m"."user_id" = "auth"."uid"()) AND ("m"."branch_id" = "tasks"."branch_id") AND ("m"."role" = ANY (ARRAY['manager'::"public"."member_role", 'admin'::"public"."member_role"]))))));



CREATE POLICY "tasks_insert_same_branch_or_self" ON "public"."tasks" FOR INSERT WITH CHECK ((("requester_id" = "auth"."uid"()) AND ("branch_id" IN ( SELECT "cb"."current_branch_ids"
   FROM "public"."current_branch_ids"() "cb"("current_branch_ids"))) AND ((("scope_type" = 'branch'::"public"."scope_type") AND ("scope_id" = "branch_id")) OR (("scope_type" = 'personal'::"public"."scope_type") AND ("scope_id" = "auth"."uid"())) OR (("scope_type" = 'department'::"public"."scope_type") AND "public"."is_department_in_users_branch"("scope_id", "auth"."uid"()))) AND (("project_id" IS NULL) OR (EXISTS ( SELECT 1
   FROM "public"."projects" "p"
  WHERE (("p"."id" = "tasks"."project_id") AND ("p"."branch_id" = "p"."branch_id")))))));



CREATE POLICY "tasks_select_same_branch" ON "public"."tasks" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."memberships" "m"
  WHERE (("m"."user_id" = "auth"."uid"()) AND ("m"."branch_id" = "tasks"."branch_id")))));



CREATE POLICY "tasks_update_requester_or_manager" ON "public"."tasks" FOR UPDATE USING ((("requester_id" = "auth"."uid"()) OR (EXISTS ( SELECT 1
   FROM "public"."memberships" "m"
  WHERE (("m"."user_id" = "auth"."uid"()) AND ("m"."branch_id" = "tasks"."branch_id") AND ("m"."role" = ANY (ARRAY['manager'::"public"."member_role", 'admin'::"public"."member_role"]))))))) WITH CHECK ((("requester_id" = "auth"."uid"()) OR (EXISTS ( SELECT 1
   FROM "public"."memberships" "m"
  WHERE (("m"."user_id" = "auth"."uid"()) AND ("m"."branch_id" = "tasks"."branch_id") AND ("m"."role" = ANY (ARRAY['manager'::"public"."member_role", 'admin'::"public"."member_role"])))))));



ALTER TABLE "public"."user_notification_profiles" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "user_notification_profiles_insert_own" ON "public"."user_notification_profiles" FOR INSERT TO "authenticated" WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "user_notification_profiles_select_own" ON "public"."user_notification_profiles" FOR SELECT TO "authenticated" USING (("auth"."uid"() = "user_id"));



CREATE POLICY "user_notification_profiles_update_own" ON "public"."user_notification_profiles" FOR UPDATE TO "authenticated" USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));





ALTER PUBLICATION "supabase_realtime" OWNER TO "postgres";








GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";














































































































































































GRANT ALL ON FUNCTION "public"."current_branch_ids"() TO "anon";
GRANT ALL ON FUNCTION "public"."current_branch_ids"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."current_branch_ids"() TO "service_role";



GRANT ALL ON FUNCTION "public"."debug_is_department_in_users_branch"("target_department_id" "uuid", "target_user_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."debug_is_department_in_users_branch"("target_department_id" "uuid", "target_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."debug_is_department_in_users_branch"("target_department_id" "uuid", "target_user_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_daily_summary_targets"("p_now" timestamp with time zone) TO "anon";
GRANT ALL ON FUNCTION "public"."get_daily_summary_targets"("p_now" timestamp with time zone) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_daily_summary_targets"("p_now" timestamp with time zone) TO "service_role";



GRANT ALL ON FUNCTION "public"."get_due_day_before_notification_targets"("p_now" timestamp with time zone) TO "anon";
GRANT ALL ON FUNCTION "public"."get_due_day_before_notification_targets"("p_now" timestamp with time zone) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_due_day_before_notification_targets"("p_now" timestamp with time zone) TO "service_role";



GRANT ALL ON FUNCTION "public"."get_timed_notification_targets"("p_now" timestamp with time zone) TO "anon";
GRANT ALL ON FUNCTION "public"."get_timed_notification_targets"("p_now" timestamp with time zone) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_timed_notification_targets"("p_now" timestamp with time zone) TO "service_role";



GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "anon";
GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "service_role";



GRANT ALL ON FUNCTION "public"."is_admin_in_branch"("b" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."is_admin_in_branch"("b" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_admin_in_branch"("b" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."is_department_in_current_branch"("target_department_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."is_department_in_current_branch"("target_department_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_department_in_current_branch"("target_department_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."is_department_in_users_branch"("target_department_id" "uuid", "target_user_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."is_department_in_users_branch"("target_department_id" "uuid", "target_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_department_in_users_branch"("target_department_id" "uuid", "target_user_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."on_task_assignees_changed"() TO "anon";
GRANT ALL ON FUNCTION "public"."on_task_assignees_changed"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."on_task_assignees_changed"() TO "service_role";



GRANT ALL ON FUNCTION "public"."recompute_task_status"("p_task_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."recompute_task_status"("p_task_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."recompute_task_status"("p_task_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."set_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."set_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_updated_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."validate_task_scope"() TO "anon";
GRANT ALL ON FUNCTION "public"."validate_task_scope"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."validate_task_scope"() TO "service_role";
























GRANT ALL ON TABLE "public"."branches" TO "anon";
GRANT ALL ON TABLE "public"."branches" TO "authenticated";
GRANT ALL ON TABLE "public"."branches" TO "service_role";



GRANT ALL ON TABLE "public"."departments" TO "anon";
GRANT ALL ON TABLE "public"."departments" TO "authenticated";
GRANT ALL ON TABLE "public"."departments" TO "service_role";



GRANT ALL ON TABLE "public"."line_accounts" TO "anon";
GRANT ALL ON TABLE "public"."line_accounts" TO "authenticated";
GRANT ALL ON TABLE "public"."line_accounts" TO "service_role";



GRANT ALL ON TABLE "public"."line_link_tokens" TO "anon";
GRANT ALL ON TABLE "public"."line_link_tokens" TO "authenticated";
GRANT ALL ON TABLE "public"."line_link_tokens" TO "service_role";



GRANT ALL ON TABLE "public"."membership_departments" TO "anon";
GRANT ALL ON TABLE "public"."membership_departments" TO "authenticated";
GRANT ALL ON TABLE "public"."membership_departments" TO "service_role";



GRANT ALL ON TABLE "public"."memberships" TO "anon";
GRANT ALL ON TABLE "public"."memberships" TO "authenticated";
GRANT ALL ON TABLE "public"."memberships" TO "service_role";



GRANT ALL ON TABLE "public"."notification_jobs" TO "anon";
GRANT ALL ON TABLE "public"."notification_jobs" TO "authenticated";
GRANT ALL ON TABLE "public"."notification_jobs" TO "service_role";



GRANT ALL ON TABLE "public"."notification_settings" TO "anon";
GRANT ALL ON TABLE "public"."notification_settings" TO "authenticated";
GRANT ALL ON TABLE "public"."notification_settings" TO "service_role";



GRANT ALL ON TABLE "public"."profiles" TO "anon";
GRANT ALL ON TABLE "public"."profiles" TO "authenticated";
GRANT ALL ON TABLE "public"."profiles" TO "service_role";



GRANT ALL ON TABLE "public"."projects" TO "anon";
GRANT ALL ON TABLE "public"."projects" TO "authenticated";
GRANT ALL ON TABLE "public"."projects" TO "service_role";



GRANT ALL ON TABLE "public"."task_assignees" TO "anon";
GRANT ALL ON TABLE "public"."task_assignees" TO "authenticated";
GRANT ALL ON TABLE "public"."task_assignees" TO "service_role";



GRANT ALL ON TABLE "public"."tasks" TO "anon";
GRANT ALL ON TABLE "public"."tasks" TO "authenticated";
GRANT ALL ON TABLE "public"."tasks" TO "service_role";



GRANT ALL ON TABLE "public"."user_notification_profiles" TO "anon";
GRANT ALL ON TABLE "public"."user_notification_profiles" TO "authenticated";
GRANT ALL ON TABLE "public"."user_notification_profiles" TO "service_role";









ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";































CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();


