-- The original card columns and AI enrichment stay intact for legacy reads and
-- AI training. A note-row version makes the backfill safe to run repeatedly.
alter table public.card_notes
  add column if not exists examples_migration_version integer not null default 0;

insert into public.card_notes (owner_key, card_id, main_notes, memory_hint, example_sentence, confusion_note, examples_migration_version)
select c.owner_key::uuid, c.id,
  case when nullif(btrim(coalesce(n.main_notes, '')), '') is null then 'Beispiele:' || E'\n' || x.lines
       else n.main_notes || E'\n\nBeispiele:' || E'\n' || x.lines end,
  coalesce(n.memory_hint, ''), coalesce(n.example_sentence, ''), coalesce(n.confusion_note, ''),
  1
from public.cards c
left join public.card_notes n on n.owner_key = c.owner_key::uuid and n.card_id = c.id
left join public.ai_card_enrichment e on e.owner_key = c.owner_key and e.card_id = c.id
cross join lateral (
  select concat_ws(E'\n',
    case when nullif(btrim(c.swahili_example), '') is not null then '- ' || c.swahili_example end,
    case when nullif(btrim(c.german_example), '') is not null then '- ' || c.german_example end,
    case when nullif(btrim(n.example_sentence), '') is not null then '- ' || n.example_sentence end,
    (
      select string_agg('- ' || line.text, E'\n' order by pair.ordinality, line.position)
      from jsonb_array_elements(
        case when jsonb_typeof(e.examples) = 'array' then e.examples else '[]'::jsonb end
      ) with ordinality as pair(value, ordinality)
      cross join lateral (values (1, pair.value ->> 'sw'), (2, pair.value ->> 'de')) as line(position, text)
      where nullif(btrim(line.text), '') is not null
    )
  ) as lines
) x
where coalesce(c.type, 'vocab') = 'vocab'
  and x.lines <> ''
  and coalesce(n.examples_migration_version, 0) < 1
on conflict (owner_key, card_id) do update
set main_notes = excluded.main_notes,
    examples_migration_version = 1,
    updated_at = now()
where public.card_notes.examples_migration_version < 1;
