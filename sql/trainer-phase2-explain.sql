-- Read-only production-plan checklist for the trainer count paths.
-- Replace the all-zero UUID below with a non-sensitive representative test-user
-- UUID before running in the Supabase SQL editor. Do not paste card content
-- into a report.

-- 1) Exact due count used by the vocabulary dashboard before the RPC migration.
explain (analyze, buffers, verbose)
select count(*)
from public.card_progress p
join public.cards c on c.id = p.card_id
where p.owner_key = '00000000-0000-0000-0000-000000000000'
  and p.due_date <= current_date
  and (c.type is null or c.type = 'vocab');

-- 2) Exact "last missed" count.
explain (analyze, buffers, verbose)
select count(*)
from public.learn_last_missed m
join public.cards c on c.id = m.card_id
where m.owner_key = '00000000-0000-0000-0000-000000000000'
  and (c.type is null or c.type = 'vocab');

-- 3) Scoped-card count and the source relation for the new one-request RPC.
explain (analyze, buffers, verbose)
select count(*)
from public.cards c
where c.owner_key = '00000000-0000-0000-0000-000000000000'
  and (c.type is null or c.type = 'vocab');

-- Record only node type, index name, estimated/actual rows, loops, timing and
-- buffer totals. Do not copy cards, emails, owner keys or other row data.
