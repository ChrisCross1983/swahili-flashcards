-- Protect every public table whose owner_key identifies an Auth user.
-- This is deliberately independent of older, possibly unapplied migrations.
-- A single DO statement makes policy replacement atomic. The migration must
-- be reviewed against a fresh schema dump before it is applied remotely.
do $rls$
declare
  target record;
  existing_policy record;
  owner_predicate text;
  write_predicate text;
begin
  for target in
    select c.relname as table_name, a.atttypid as owner_type
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    join pg_attribute a on a.attrelid = c.oid
    where n.nspname = 'public'
      and c.relkind in ('r', 'p')
      and a.attname = 'owner_key'
      and not a.attisdropped
  loop
    if target.owner_type = 'pg_catalog.text'::regtype then
      owner_predicate := 'owner_key = (select auth.uid()::text)';
    elsif target.owner_type = 'pg_catalog.uuid'::regtype then
      owner_predicate := 'owner_key = (select auth.uid())';
    else
      raise exception 'Unsupported owner_key type in public.%: %',
        target.table_name, format_type(target.owner_type, null);
    end if;

    write_predicate := owner_predicate;

    -- A matching owner_key alone must not let a user attach data to another
    -- user's card or group. Reads/deletes remain owner-scoped so existing
    -- orphaned rows can still be inspected or removed by their owner.
    if target.table_name in (
      'card_notes', 'card_progress', 'learn_last_missed',
      'ai_learner_state', 'ai_card_enrichment', 'ai_card_mastery',
      'card_groups'
    ) then
      write_predicate := write_predicate || format(
        ' and exists (select 1 from public.cards c where c.id = %I.card_id and c.owner_key = (select auth.uid()::text))',
        target.table_name
      );
    end if;

    if target.table_name = 'card_groups' then
      write_predicate := write_predicate ||
        ' and exists (select 1 from public.groups g where g.id = card_groups.group_id and g.owner_key = (select auth.uid()::text))';
    end if;

    -- PostgreSQL combines permissive policies with OR. Leaving a former
    -- broad policy in place would bypass the new owner restriction.
    for existing_policy in
      select p.polname
      from pg_policy p
      join pg_class c on c.oid = p.polrelid
      join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relname = target.table_name
    loop
      execute format('drop policy %I on public.%I', existing_policy.polname, target.table_name);
    end loop;

    execute format('alter table public.%I enable row level security', target.table_name);
    -- RLS does not govern TRUNCATE or REFERENCES; remove existing GRANT ALL.
    execute format('revoke all privileges on table public.%I from public, anon, authenticated', target.table_name);
    execute format('grant select, insert, update, delete on table public.%I to authenticated', target.table_name);
    execute format('grant all privileges on table public.%I to service_role', target.table_name);

    execute format(
      'create policy owner_select on public.%I for select to authenticated using (%s)',
      target.table_name, owner_predicate
    );
    execute format(
      'create policy owner_insert on public.%I for insert to authenticated with check (%s)',
      target.table_name, write_predicate
    );
    execute format(
      'create policy owner_update on public.%I for update to authenticated using (%s) with check (%s)',
      target.table_name, owner_predicate, write_predicate
    );
    execute format(
      'create policy owner_delete on public.%I for delete to authenticated using (%s)',
      target.table_name, owner_predicate
    );
  end loop;
end
$rls$;
