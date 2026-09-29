-- 現在の運用では、1ユーザーにつき1つのbranch所属だけを許可する。
-- 将来、複数branch所属と所属切替を実装する場合は、
-- 新しいMigrationでこの制約を削除する。

alter table public.memberships
add constraint memberships_user_id_unique
unique (user_id);


-- タスクに設定するprojectが、タスクと同じbranchに属することを保証する。
-- 既存Policyの他の条件は変更しない。

alter policy tasks_insert_same_branch_or_self
on public.tasks
with check (
  requester_id = auth.uid()
  and branch_id in (
    select cb.current_branch_ids
    from public.current_branch_ids() as cb(current_branch_ids)
  )
  and (
    (
      scope_type = 'branch'::public.scope_type
      and scope_id = branch_id
    )
    or (
      scope_type = 'personal'::public.scope_type
      and scope_id = auth.uid()
    )
    or (
      scope_type = 'department'::public.scope_type
      and public.is_department_in_users_branch(scope_id, auth.uid())
    )
  )
  and (
    project_id is null
    or exists (
      select 1
      from public.projects as p
      where p.id = tasks.project_id
        and p.branch_id = tasks.branch_id
    )
  )
);