-- Optional, reviewed learning aid on sentence cards. Existing cards remain valid.
alter table public.cards
  add column if not exists sentence_explanation jsonb;

alter table public.cards
  add constraint cards_sentence_explanation_sentence_only
  check (sentence_explanation is null or type = 'sentence');
