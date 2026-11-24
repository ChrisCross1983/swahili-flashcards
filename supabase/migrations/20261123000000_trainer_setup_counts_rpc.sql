-- One exact dashboard snapshot in one PostgREST request. This deliberately
-- does not add an index: index state must be verified with production EXPLAIN
-- before changing write costs on these shared tables.
create or replace function public.trainer_setup_counts(
    p_owner_key text,
    p_card_type text,
    p_today date
)
returns table (
    today_due bigint,
    total_cards bigint,
    last_missed_count bigint
)
language plpgsql
stable
security invoker
set search_path = public
as $function$
declare
    cards_owner_type text;
    progress_owner_type text;
    missed_owner_type text;
begin
    -- The legacy schema has not been dumped into this repository, and its
    -- owner_key columns may be text or uuid. Resolve each live column type so
    -- the comparison remains indexable instead of casting indexed columns.
    select pg_catalog.format_type(a.atttypid, a.atttypmod)
      into cards_owner_type
      from pg_catalog.pg_attribute a
     where a.attrelid = 'public.cards'::regclass
       and a.attname = 'owner_key'
       and not a.attisdropped;
    select pg_catalog.format_type(a.atttypid, a.atttypmod)
      into progress_owner_type
      from pg_catalog.pg_attribute a
     where a.attrelid = 'public.card_progress'::regclass
       and a.attname = 'owner_key'
       and not a.attisdropped;
    select pg_catalog.format_type(a.atttypid, a.atttypmod)
      into missed_owner_type
      from pg_catalog.pg_attribute a
     where a.attrelid = 'public.learn_last_missed'::regclass
       and a.attname = 'owner_key'
       and not a.attisdropped;

    if cards_owner_type is null or progress_owner_type is null or missed_owner_type is null then
        raise exception 'trainer_setup_counts requires owner_key on cards, card_progress and learn_last_missed';
    end if;

    return query execute format($sql$
        with scoped_cards as materialized (
            select c.id
            from public.cards c
            where c.owner_key = $1::%s
              and (
                  $2 is null
                  or ($2 = 'sentence' and c.type = 'sentence')
                  or ($2 = 'vocab' and (c.type is null or c.type = 'vocab'))
              )
        )
        select
            (select count(*) from public.card_progress p
             join scoped_cards c on c.id = p.card_id
             where p.owner_key = $1::%s and p.due_date <= $3),
            (select count(*) from scoped_cards),
            (select count(*) from public.learn_last_missed m
             join scoped_cards c on c.id = m.card_id
             where m.owner_key = $1::%s)
    $sql$, cards_owner_type, progress_owner_type, missed_owner_type)
    using p_owner_key, p_card_type, p_today;
end;
$function$;

revoke all on function public.trainer_setup_counts(text, text, date) from public;
grant execute on function public.trainer_setup_counts(text, text, date) to service_role;

comment on function public.trainer_setup_counts(text, text, date) is
    'Exact ungrouped trainer dashboard counts. Drop the function to roll back.';
