# 半期切替Runbook

最終確認日: 2026-10-03

## 1. 目的

Next.js・Vercel・Supabaseで構築したタスク管理ツールについて、半年ごとの期替わりに次を安全に実施する。

- 旧期のbranch・所属・部署・project・taskを削除する
- 新期用のbranchを作成する
- 各新branchの最初のadminを登録する
- 認証アカウント、profile、LINE連携、ユーザー単位の通知設定を保持する
- 通知送信との競合や別branchの誤削除を防ぐ
- 実施結果を記録し、次回も同じ手順を再利用できるようにする

このRunbookは運用データの切替用である。Schema、RLS、Trigger、Edge Functions、Next.jsコードを変更する場合は、別の作業ブランチ・Migration・検証手順を使用する。

## 2. 環境

| 用途 | 接続先 |
|---|---|
| Local | 開発Supabase |
| Vercel Preview | 開発Supabase |
| Vercel Production | 本番Supabase |

現在のProject Ref:

- 開発: `astzazujnpmdnzpbimcb`
- 本番: `dgnecjszhaiuqhvvblsq`

本番切替は本番SupabaseのSQL Editorでのみ実施する。LocalやPreviewから本番Supabaseへ接続しない。

## 3. 禁止事項

- branchを限定しない`DELETE FROM ...`を実行しない
- branch名だけを削除条件にしない
- 対象確認前にINSERT・UPDATE・DELETEを実行しない
- Cronを削除しない
- Secret、Vault値、API keyをSQL、README、Migration、チャット、ログへ記載しない
- legacy `anon`／`service_role` keyを再有効化しない
- JWT Signing Secretを変更しない
- 期固有のUUIDやユーザー一覧をMigrationへ埋め込まない
- エラー時にSQLを修正せずそのまま再実行しない
- Gitの既存変更を勝手に削除しない

## 4. 現在のデータモデル上の前提

### 4.1 1ユーザー1branch

`memberships.user_id`にはUnique制約があり、同じユーザーを複数branchへ同時登録できない。

新adminが旧branchに所属している場合は、旧membershipを削除した後で新membershipを登録する。

### 4.2 外部キーと削除動作

| 親データの削除 | 関連データの動作 |
|---|---|
| branch | departmentsをCASCADE削除 |
| branch | membershipsをCASCADE削除 |
| branch | membership_departmentsをCASCADE削除 |
| branch | projectsをCASCADE削除 |
| branch | tasksは`NO ACTION`のため、先に明示削除が必要 |
| membership | membership_departmentsをCASCADE削除 |
| task | task_assigneesをCASCADE削除 |
| task | taskに紐づくnotification_jobsをCASCADE削除 |
| project | tasks.project_idをNULL化 |
| department | memberships.department_idをNULL化 |

したがって、基本的な削除順序は次のとおりとする。

1. 旧membershipsを明示削除
2. 旧tasksを明示削除
3. taskに紐づかない旧通知履歴を必要に応じて明示削除
4. 旧branchを削除

### 4.3 membership削除Trigger

`prepare_membership_deletion_trigger`はmembership削除前に、対象ユーザーの通知を確認する。

- `pending`と`processing`のnotification_jobsをロックする
- 直近5分以内に開始した`processing`があれば削除を中止する
- `pending`を`canceled`へ変更する
- 5分以上停止している`processing`を`canceled`へ変更する

この安全確認をtask削除より先に通すため、membershipsを先に明示削除する。

### 4.4 保持するユーザーデータ

以下はbranchではなくユーザー単位で管理されるため、原則として保持する。

- `auth.users`
- `profiles`
- `line_accounts`
- `notification_settings`
- `user_notification_profiles`

`notification_jobs.task_id IS NULL`のレコードを、名前だけで日次サマリーと決めつけない。実際の`notification_type`、status、user_id、日時を確認して処理する。

## 5. 実施前に確定する入力値

以下を実施シートへ記録する。

| 項目 | 入力値 |
|---|---|
| 実施日時 |  |
| 実施担当者 |  |
| 本番Project Ref |  |
| 旧branch UUID |  |
| 旧branch表示名 |  |
| 新branch数 |  |
| 新branch表示名 |  |
| 各新branchのadmin user_id |  |
| 新規部署 |  |
| 新規project |  |
| バックアップ有無 |  |
| メンテナンス開始時刻 |  |
| メンテナンス終了予定時刻 |  |

admin UUIDは手元の実行SQLにだけ設定し、Runbook、Git、チャットへ実値を残さない。

## 6. Git準備

DB運用だけならGitブランチは不要である。Runbookを更新する場合は次の手順を使用する。

```bash
git switch main
git pull --ff-only origin main
git status --short
```

作業ツリーが空であることを確認してから、ドキュメント用ブランチを作成する。

```bash
git switch -c chore/term-transition-runbook
```

既存変更がある場合は、勝手に削除・stash・commitせず内容を確認する。

## 7. 読み取り専用の事前確認

### 7.1 本番環境の確認

Supabase Dashboard上で、開いているProject Refが本番のものと一致することを目視確認する。

### 7.2 branch別件数

`OLD_BRANCH_UUID`を置き換える。

```sql
with params as (
  select 'OLD_BRANCH_UUID'::uuid as old_branch_id
)
select
  b.id as branch_id,
  b.name as branch_name,
  b.created_at,
  (select count(*) from public.departments d where d.branch_id = b.id)
    as department_count,
  (select count(*) from public.memberships m where m.branch_id = b.id)
    as membership_count,
  (select count(*) from public.membership_departments md where md.branch_id = b.id)
    as membership_department_count,
  (select count(*) from public.projects p where p.branch_id = b.id)
    as project_count,
  (select count(*) from public.tasks t where t.branch_id = b.id)
    as task_count,
  (
    select count(*)
    from public.task_assignees ta
    where exists (
      select 1
      from public.tasks t
      where t.id = ta.task_id
        and t.branch_id = b.id
    )
  ) as task_assignee_count,
  (
    select count(*)
    from public.notification_jobs nj
    where nj.task_id is not null
      and exists (
        select 1
        from public.tasks t
        where t.id = nj.task_id
          and t.branch_id = b.id
      )
  ) as task_notification_job_count,
  (
    select count(*)
    from public.notification_jobs nj
    where nj.task_id is null
      and exists (
        select 1
        from public.memberships m
        where m.user_id = nj.user_id
          and m.branch_id = b.id
      )
  ) as non_task_notification_job_count
from public.branches b
join params p
  on p.old_branch_id = b.id;
```

結果を実施シートへ転記する。実行SQLの期待件数には、この結果を使用する。

### 7.3 新branch名の重複確認

```sql
select id, name, created_at
from public.branches
where name in (
  'NEW_BRANCH_NAME_1',
  'NEW_BRANCH_NAME_2'
);
```

新規作成する名前について0件であることを確認する。branch名にはUnique制約がないため、この確認を省略しない。

### 7.4 admin候補の確認

```sql
with planned_admins (planned_branch, admin_user_id) as (
  values
    ('NEW_BRANCH_NAME_1', 'ADMIN_USER_UUID_1'::uuid),
    ('NEW_BRANCH_NAME_2', 'ADMIN_USER_UUID_2'::uuid)
)
select
  pa.planned_branch,
  (au.id is not null) as auth_user_exists,
  (p.user_id is not null) as profile_exists,
  m.branch_id as current_branch_id,
  b.name as current_branch_name,
  m.role as current_role
from planned_admins pa
left join auth.users au
  on au.id = pa.admin_user_id
left join public.profiles p
  on p.user_id = pa.admin_user_id
left join public.memberships m
  on m.user_id = pa.admin_user_id
left join public.branches b
  on b.id = m.branch_id
order by pa.planned_branch;
```

確認事項:

- 全adminについて`auth_user_exists = true`
- 全adminについて`profile_exists = true`
- admin UUIDが重複していない
- 現在所属がある場合、削除対象の旧branchである

### 7.5 task scope整合性

旧taskがすべて`valid`になることを確認する。`OLD_BRANCH_UUID`を置き換える。

```sql
with target_tasks as (
  select
    t.*,
    case
      when t.scope_id is not null
       and t.scope_id::text ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      then t.scope_id::text::uuid
      else null
    end as scope_uuid
  from public.tasks t
  where t.branch_id = 'OLD_BRANCH_UUID'::uuid
),
classified as (
  select
    id,
    case
      when scope_type not in ('branch', 'department', 'personal')
        then 'invalid_scope_type'
      when scope_id is null
        then 'scope_id_is_null'
      when scope_uuid is null
        then 'scope_id_is_not_uuid'
      when scope_type = 'branch'
       and not exists (
         select 1 from public.branches b where b.id = target_tasks.scope_uuid
       )
        then 'branch_scope_not_found'
      when scope_type = 'department'
       and not exists (
         select 1 from public.departments d where d.id = target_tasks.scope_uuid
       )
        then 'department_scope_not_found'
      when scope_type = 'personal'
       and not exists (
         select 1 from public.profiles p where p.user_id = target_tasks.scope_uuid
       )
        then 'personal_scope_not_found'
      else 'valid'
    end as validation_result
  from target_tasks
)
select validation_result, count(*) as task_count
from classified
group by validation_result
order by validation_result;
```

`valid`以外が存在する場合は切替を中止し、原因を調査する。

### 7.6 通知状態

```sql
with
target_tasks as (
  select id
  from public.tasks
  where branch_id = 'OLD_BRANCH_UUID'::uuid
),
target_users as (
  select user_id
  from public.memberships
  where branch_id = 'OLD_BRANCH_UUID'::uuid
)
select
  case when nj.task_id is null then 'non_task' else 'task' end as job_scope,
  nj.channel,
  nj.notification_type,
  nj.status,
  count(*) as job_count,
  min(nj.created_at) as oldest_created_at,
  max(nj.created_at) as latest_created_at,
  max(nj.locked_at) as latest_locked_at,
  max(nj.sent_at) as latest_sent_at
from public.notification_jobs nj
where nj.task_id in (select id from target_tasks)
   or nj.user_id in (select user_id from target_users)
group by
  case when nj.task_id is null then 'non_task' else 'task' end,
  nj.channel,
  nj.notification_type,
  nj.status
order by job_scope, nj.channel, nj.notification_type, nj.status;
```

## 8. バックアップと復元方針

本番実施前に、次のいずれかを明示的に選択して記録する。

### バックアップを取得する場合

- Schemaダンプ
- 対象branchに関連する行のデータバックアップ
- 対象UUID一覧
- 復元順序
- バックアップ保存場所とアクセス権
- 復元確認結果

SecretやVault値をバックアップへ平文出力しない。

### バックアップを取得しない場合

- Commit後に旧期データを復元できないことを了承する
- SQL内の期待件数、対象UUID、原子的処理を必須とする
- 少なくとも実行日時、実行SQL、削除前件数、結果を記録する

DB切替SQLの例外によるRollbackは、そのSQL文の実行中だけ有効である。正常終了後の画面確認で問題が見つかっても、自動Rollbackはできない。

## 9. Cron停止

利用者への周知後、本番Cronを停止する。

```sql
select cron.alter_job(
  job_id := jobid,
  active := false
)
from cron.job
where jobname = 'run-notifications-every-1-min';
```

```sql
select jobid, jobname, schedule, active
from cron.job
where jobname = 'run-notifications-every-1-min';
```

`active = false`を確認し、少なくとも1分待つ。Cronジョブ自体は削除しない。

待機後、7.6の通知確認SQLを再実行する。直近5分以内に開始した`processing`がある場合は切替を実行しない。

## 10. 本番切替SQLテンプレート

### 10.1 設定が必要な値

次を実施回ごとに置き換える。

- `OLD_BRANCH_UUID`
- `OLD_BRANCH_NAME`
- 新branch表示名
- 各新branchのadmin UUID
- 削除前確認で取得した期待件数

以下は2つの新branchを作成する場合のテンプレートである。新branch数が異なる場合は、INSERTと検証を同じ数に合わせてレビューする。

```sql
do $term_transition$
declare
  v_old_branch constant uuid := 'OLD_BRANCH_UUID'::uuid;
  v_old_branch_expected_name constant text := 'OLD_BRANCH_NAME';

  v_branch_1_name constant text := 'NEW_BRANCH_NAME_1';
  v_branch_2_name constant text := 'NEW_BRANCH_NAME_2';

  -- 必ず実値へ置き換える。RunbookやGitへ実値を保存しない。
  v_branch_1_admin uuid := null;
  v_branch_2_admin uuid := null;

  -- 事前確認結果へ置き換える。
  v_expected_departments constant bigint := EXPECTED_DEPARTMENTS;
  v_expected_memberships constant bigint := EXPECTED_MEMBERSHIPS;
  v_expected_membership_departments constant bigint := EXPECTED_MEMBERSHIP_DEPARTMENTS;
  v_expected_projects constant bigint := EXPECTED_PROJECTS;
  v_expected_tasks constant bigint := EXPECTED_TASKS;
  v_expected_task_assignees constant bigint := EXPECTED_TASK_ASSIGNEES;
  v_expected_task_jobs constant bigint := EXPECTED_TASK_NOTIFICATION_JOBS;
  v_expected_non_task_jobs constant bigint := EXPECTED_NON_TASK_NOTIFICATION_JOBS;

  v_cutover_at timestamptz := clock_timestamp();
  v_old_branch_name text;
  v_old_user_ids uuid[];
  v_old_task_ids uuid[];
  v_branch_1_id uuid;
  v_branch_2_id uuid;
  v_count bigint;
  v_row_count bigint;
begin
  if v_branch_1_admin is null or v_branch_2_admin is null then
    raise exception 'admin UUIDが設定されていません。';
  end if;

  if v_branch_1_admin = v_branch_2_admin then
    raise exception '新branchごとに異なるadminを指定してください。';
  end if;

  select b.name
  into v_old_branch_name
  from public.branches b
  where b.id = v_old_branch
  for update;

  if not found then
    raise exception '旧branchが存在しません。branch_id=%', v_old_branch;
  end if;

  if v_old_branch_name is distinct from v_old_branch_expected_name then
    raise exception
      '旧branch名不一致。actual=%, expected=%',
      v_old_branch_name,
      v_old_branch_expected_name;
  end if;

  select count(*)
  into v_count
  from public.branches
  where name in (v_branch_1_name, v_branch_2_name);

  if v_count <> 0 then
    raise exception '作成予定のbranch名がすでに存在します。count=%', v_count;
  end if;

  select count(*)
  into v_count
  from auth.users
  where id in (v_branch_1_admin, v_branch_2_admin);

  if v_count <> 2 then
    raise exception 'adminのauth.usersを2件確認できません。count=%', v_count;
  end if;

  select count(*)
  into v_count
  from public.profiles
  where user_id in (v_branch_1_admin, v_branch_2_admin);

  if v_count <> 2 then
    raise exception 'adminのprofilesを2件確認できません。count=%', v_count;
  end if;

  select count(*)
  into v_count
  from public.memberships
  where user_id in (v_branch_1_admin, v_branch_2_admin)
    and branch_id <> v_old_branch;

  if v_count <> 0 then
    raise exception 'admin候補が旧branch以外に所属しています。count=%', v_count;
  end if;

  perform m.id
  from public.memberships m
  where m.branch_id = v_old_branch
  order by m.id
  for update;

  perform t.id
  from public.tasks t
  where t.branch_id = v_old_branch
  order by t.id
  for update;

  perform ta.task_id
  from public.task_assignees ta
  join public.tasks t on t.id = ta.task_id
  where t.branch_id = v_old_branch
  order by ta.task_id, ta.user_id
  for update of ta;

  select array_agg(m.user_id order by m.user_id)
  into v_old_user_ids
  from public.memberships m
  where m.branch_id = v_old_branch;

  select array_agg(t.id order by t.id)
  into v_old_task_ids
  from public.tasks t
  where t.branch_id = v_old_branch;

  select count(*) into v_count
  from public.departments where branch_id = v_old_branch;
  if v_count <> v_expected_departments then
    raise exception 'departments件数不一致。actual=%, expected=%',
      v_count, v_expected_departments;
  end if;

  select count(*) into v_count
  from public.memberships where branch_id = v_old_branch;
  if v_count <> v_expected_memberships then
    raise exception 'memberships件数不一致。actual=%, expected=%',
      v_count, v_expected_memberships;
  end if;

  select count(*) into v_count
  from public.membership_departments where branch_id = v_old_branch;
  if v_count <> v_expected_membership_departments then
    raise exception 'membership_departments件数不一致。actual=%, expected=%',
      v_count, v_expected_membership_departments;
  end if;

  select count(*) into v_count
  from public.projects where branch_id = v_old_branch;
  if v_count <> v_expected_projects then
    raise exception 'projects件数不一致。actual=%, expected=%',
      v_count, v_expected_projects;
  end if;

  select count(*) into v_count
  from public.tasks where branch_id = v_old_branch;
  if v_count <> v_expected_tasks then
    raise exception 'tasks件数不一致。actual=%, expected=%',
      v_count, v_expected_tasks;
  end if;

  select count(*) into v_count
  from public.task_assignees
  where task_id = any(v_old_task_ids);
  if v_count <> v_expected_task_assignees then
    raise exception 'task_assignees件数不一致。actual=%, expected=%',
      v_count, v_expected_task_assignees;
  end if;

  select count(*) into v_count
  from public.notification_jobs
  where task_id = any(v_old_task_ids);
  if v_count <> v_expected_task_jobs then
    raise exception 'task通知件数不一致。actual=%, expected=%',
      v_count, v_expected_task_jobs;
  end if;

  select count(*) into v_count
  from public.notification_jobs
  where task_id is null
    and user_id = any(v_old_user_ids);
  if v_count <> v_expected_non_task_jobs then
    raise exception 'taskなし通知件数不一致。actual=%, expected=%',
      v_count, v_expected_non_task_jobs;
  end if;

  perform nj.id
  from public.notification_jobs nj
  where (
    nj.user_id = any(v_old_user_ids)
    or nj.task_id = any(v_old_task_ids)
  )
    and nj.status in ('pending', 'processing')
  order by nj.id
  for update;

  if exists (
    select 1
    from public.notification_jobs nj
    where (
      nj.user_id = any(v_old_user_ids)
      or nj.task_id = any(v_old_task_ids)
    )
      and nj.status = 'processing'
      and nj.locked_at is not null
      and nj.locked_at > clock_timestamp() - interval '5 minutes'
  ) then
    raise exception '通知送信処理中のため、半期切替を中止します。';
  end if;

  insert into public.branches (name)
  values (v_branch_1_name)
  returning id into v_branch_1_id;

  insert into public.branches (name)
  values (v_branch_2_name)
  returning id into v_branch_2_id;

  delete from public.memberships
  where branch_id = v_old_branch;
  get diagnostics v_row_count = row_count;
  if v_row_count <> v_expected_memberships then
    raise exception 'memberships削除件数不一致。actual=%, expected=%',
      v_row_count, v_expected_memberships;
  end if;

  delete from public.tasks
  where branch_id = v_old_branch;
  get diagnostics v_row_count = row_count;
  if v_row_count <> v_expected_tasks then
    raise exception 'tasks削除件数不一致。actual=%, expected=%',
      v_row_count, v_expected_tasks;
  end if;

  delete from public.notification_jobs
  where task_id is null
    and user_id = any(v_old_user_ids)
    and created_at <= v_cutover_at;
  get diagnostics v_row_count = row_count;
  if v_row_count <> v_expected_non_task_jobs then
    raise exception 'taskなし通知削除件数不一致。actual=%, expected=%',
      v_row_count, v_expected_non_task_jobs;
  end if;

  delete from public.branches
  where id = v_old_branch;
  get diagnostics v_row_count = row_count;
  if v_row_count <> 1 then
    raise exception '旧branch削除件数不一致。actual=%', v_row_count;
  end if;

  insert into public.memberships (user_id, branch_id, role)
  values
    (v_branch_1_admin, v_branch_1_id, 'admin'::public.member_role),
    (v_branch_2_admin, v_branch_2_id, 'admin'::public.member_role);
  get diagnostics v_row_count = row_count;
  if v_row_count <> 2 then
    raise exception '新admin登録件数不一致。actual=%', v_row_count;
  end if;

  if exists (select 1 from public.branches where id = v_old_branch) then
    raise exception '旧branchが残っています。';
  end if;

  if exists (select 1 from public.tasks where branch_id = v_old_branch) then
    raise exception '旧tasksが残っています。';
  end if;

  if exists (
    select 1 from public.task_assignees
    where task_id = any(v_old_task_ids)
  ) then
    raise exception '旧task_assigneesが残っています。';
  end if;

  if exists (
    select 1 from public.notification_jobs
    where task_id = any(v_old_task_ids)
  ) then
    raise exception '旧task通知が残っています。';
  end if;

  if exists (
    select 1 from public.notification_jobs
    where task_id is null
      and user_id = any(v_old_user_ids)
      and created_at <= v_cutover_at
  ) then
    raise exception '切替前のtaskなし通知が残っています。';
  end if;

  if not exists (
    select 1 from public.memberships
    where user_id = v_branch_1_admin
      and branch_id = v_branch_1_id
      and role = 'admin'::public.member_role
      and department_id is null
  ) then
    raise exception '新branch 1のadmin登録を確認できません。';
  end if;

  if not exists (
    select 1 from public.memberships
    where user_id = v_branch_2_admin
      and branch_id = v_branch_2_id
      and role = 'admin'::public.member_role
      and department_id is null
  ) then
    raise exception '新branch 2のadmin登録を確認できません。';
  end if;

  if exists (
    select 1
    from public.departments
    where branch_id in (v_branch_1_id, v_branch_2_id)
  ) then
    raise exception '新branchに想定外のdepartmentがあります。';
  end if;

  if exists (
    select 1
    from public.projects
    where branch_id in (v_branch_1_id, v_branch_2_id)
  ) then
    raise exception '新branchに想定外のprojectがあります。';
  end if;

  if exists (
    select 1
    from public.tasks
    where branch_id in (v_branch_1_id, v_branch_2_id)
  ) then
    raise exception '新branchに想定外のtaskがあります。';
  end if;

  raise notice
    '半期切替完了: branch1=%, branch2=%, cutover_at=%',
    v_branch_1_id,
    v_branch_2_id,
    v_cutover_at;
end;
$term_transition$;
```

この`DO`文は1つの原子的な処理である。途中で例外が発生した場合、文中のINSERT・UPDATE・DELETEはすべてRollbackされる。Cron停止は別操作なので、自動では元に戻らない。

## 11. DB検証

```sql
select
  b.id as branch_id,
  b.name as branch_name,
  b.created_at,
  (select count(*) from public.memberships m where m.branch_id = b.id)
    as membership_count,
  (select count(*) from public.departments d where d.branch_id = b.id)
    as department_count,
  (select count(*) from public.projects p where p.branch_id = b.id)
    as project_count,
  (select count(*) from public.tasks t where t.branch_id = b.id)
    as task_count
from public.branches b
order by b.name;
```

確認事項:

- 旧branchが存在しない
- 新branchがすべて存在する
- 各新branchに想定したadminだけが登録されている
- 初期作成しない方針の場合、departments・projects・tasksが0件
- profilesと認証アカウントが保持されている
- LINE連携とユーザー通知設定が保持されている

## 12. Production画面確認

Cronを再開する前に確認する。

- 各新adminでログインできる
- 表示branch名が正しい
- 他branchを閲覧できない
- admin画面を開ける
- 旧タスクが表示されない
- 新branchで部署を作成できる
- メールアドレスから一般ユーザーを追加できる
- 一般ユーザー追加時に他branch所属者を拒否できる
- 担当者候補が同じbranchだけに限定される

一般ユーザーは、adminによる追加前にサインアップと初回ログインを完了し、profileが作成されている必要がある。

## 13. Cron再開

```sql
select cron.alter_job(
  job_id := jobid,
  active := true
)
from cron.job
where jobname = 'run-notifications-every-1-min';
```

```sql
select jobid, jobname, schedule, active
from cron.job
where jobname = 'run-notifications-every-1-min';
```

1分以上待ってから最新実行を確認する。

```sql
select
  runid,
  jobid,
  status,
  start_time,
  end_time,
  return_message
from cron.job_run_details
where jobid in (
  select jobid
  from cron.job
  where jobname = 'run-notifications-every-1-min'
)
  and start_time is not null
order by start_time desc nulls last
limit 5;
```

最新実行が`succeeded`であることを確認する。

## 14. ログ確認

切替後に次を確認する。

- Supabase Database Logs
- Edge Function `run-notifications`
- Edge Function `send-notifications`
- Vercel Production Logs
- 想定外の401・403・500がない
- 旧task由来の通知が送信されない
- 通知が重複していない

## 15. 異常時対応

### 切替SQLが例外で終了した

- `DO`文内の変更はRollbackされる
- エラーメッセージを保存する
- 対象件数、admin、branch名、通知状態を再確認する
- 原因を特定するまで再実行しない
- 作業を中止する場合はCronを再開する

### 通知送信中エラーになった

- Cronが停止していることを再確認する
- 5分以上待つ
- `processing`、`locked_at`、最新ログを確認する
- statusを手動変更せず、既存Triggerの判定に従う

### DB切替成功後に画面エラーが見つかった

- Cronは停止したままにする
- SupabaseとVercelのログを確認する
- RLS、admin membership、branch IDを確認する
- バックアップがある場合は復元可否を判断する
- バックアップがない場合、旧期データは自動復元できない
- profilesを利用したmembership再登録など、補正対応を検討する

### Cron再開後に失敗した

- Cronを再度停止する
- `cron.job_run_details`を確認する
- `run-notifications`と`send-notifications`のログを確認する
- SecretやVault値をログ・チャットへ貼らない

## 16. 作業完了後のGit手順

Runbookに実施結果や改善点を反映した場合、差分を確認する。

```bash
git status --short
git diff -- docs/term-transition-runbook.md
```

内容確認後にcommitし、Pull Requestを作成する。mainへ直接commit・pushしない。

## 17. 実施記録

| 項目 | 結果 |
|---|---|
| 実施日時 |  |
| 担当者 |  |
| 旧branch |  |
| 新branch |  |
| 削除前件数 |  |
| バックアップ |  |
| Cron停止時刻 |  |
| 切替SQL結果 |  |
| DB検証結果 |  |
| Production確認結果 |  |
| Cron再開時刻 |  |
| 最新Cron結果 |  |
| ログ確認結果 |  |
| 想定外事象 |  |
| 次回への申し送り |  |

## 18. 2026-10-03実施時の結果

- 旧branch: 広島G2
- 新branch: 58th広島第二支部
- 新branch: 58th岡山支部
- 初期データ: 各branchにadmin 1名、部署・project・taskは0件
- profiles、認証アカウント、LINE連携、通知設定を保持
- Cron停止・再開を実施
- 再開後のCronは`succeeded`
- Schema、RLS、Trigger、Next.jsコード、Edge Functionsの変更なし
- バックアップなしで実施したため、削除した旧期データは復元不可
