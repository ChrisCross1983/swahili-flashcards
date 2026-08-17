# Supabase schema baseline

This document records the database shape expected by the application code as of
2026-08-17. It is not a production schema dump and was prepared without
connecting to Supabase or changing any remote data.

## Reproducibility status

| Area | Status | Notes |
| --- | --- | --- |
| `ai_learner_state` | A: repository backed | Full SQL existed in `sql/ai_learner_state.sql`; mirrored as an idempotent migration. |
| Core cards, progress, groups, sessions, notes | B: code-derived | Tables and columns are clear from API usage, but full DDL, defaults, constraints, RLS and indexes are not fully present in repo. |
| AI mastery/enrichment | B: code-derived | Table names and columns are clear from reads/upserts; full DDL is missing. |
| Storage buckets | B/C: code-derived | Bucket names and object path conventions are clear; bucket privacy, policies and cache headers are not fully reproducible. |
| Existing production RLS/policies | C: not reproducible | No complete policy definitions are present in the repository. |

## Clients and trust boundaries

The app uses two Supabase access modes:

- `src/lib/supabase/server.ts`: SSR auth client with anon key and cookies. Used to read the current authenticated user.
- `src/lib/supabase/client.ts`: browser auth client with anon key. Used for login/logout and `auth.getUser`.
- `src/lib/supabaseServer.ts`: service-role client. Used by most API routes after `requireUser()` has resolved the user.

Because the service-role client bypasses RLS, the application currently relies on
API-route checks such as `.eq("owner_key", user.id)` for tenant isolation.

## Tables expected by code

### `cards`

Status: B, code-derived.

Expected columns:

- `id`
- `owner_key`
- `german_text`
- `swahili_text`
- `german_example`
- `swahili_example`
- `image_path`
- `audio_path`
- `created_at`
- `type`

Observed usage:

- Created by `/api/cards`, `/api/cards/create`, `/api/cards/import/commit`.
- Read by trainer, import duplicate checks, sentence trainer, stats, AI coach and image/audio upload routes.
- Updated by `/api/cards` and `/api/upload-audio`.
- Deleted by `/api/cards` and duplicate deletion helpers.
- Most routes filter with `.eq("owner_key", user.id)`.

Likely constraints to verify before migration:

- `owner_key` should reference `auth.users(id)` if it is consistently UUID in production.
- `type` should be limited to `vocab` / `sentence`, while older vocab rows may have `null`.
- A duplicate constraint probably exists or is expected because API code handles SQL code `23505`, but exact columns are unknown.

### `card_progress`

Status: B, code-derived.

Expected columns:

- `owner_key`
- `card_id`
- `level`
- `due_date`
- `last_seen_at`
- `updated_at`

Observed usage:

- Inserted with new cards/imported cards.
- Upserted by `/api/learn/grade` with `onConflict: "owner_key,card_id"`.
- Read by due-card endpoints, stats, duplicate review and setup counts.
- Joined to `cards` via `cards!inner(type)`.

Likely constraints to verify:

- Unique or primary key on `(owner_key, card_id)`.
- Foreign key from `card_id` to `cards(id)` with `on delete cascade`.
- `level` should be non-negative and bounded by the Leitner max level.

### `groups`

Status: B, code-derived.

Expected columns:

- `id`
- `owner_key`
- `name`
- `description`
- `color`
- `sort_order`
- `created_at`
- `updated_at`
- `type_scope`

Observed usage:

- CRUD through `/api/groups` and `/api/groups/[id]`.
- Type scoped with `type_scope = 'sentence'` or `type_scope is null/type_scope = 'vocab'`.
- Used by card/group filter helpers.

Likely constraints to verify:

- `owner_key` tenant column.
- Optional uniqueness on `(owner_key, type_scope, name)`, depending on desired product behavior.
- `type_scope` should be `vocab` / `sentence` / `null` for legacy vocab.

### `card_groups`

Status: B, code-derived.

Expected columns:

- `owner_key`
- `card_id`
- `group_id`

Observed usage:

- Upserted with `onConflict: "owner_key,card_id,group_id"`.
- Deleted by group/card routes.
- Joined to `groups!inner(...)`.

Likely constraints to verify:

- Primary or unique key on `(owner_key, card_id, group_id)`.
- Foreign keys to `cards(id)` and `groups(id)` with `on delete cascade`.
- Indexes on `(owner_key, group_id)` and `(owner_key, card_id)`.

### `learn_sessions`

Status: B, code-derived.

Expected columns:

- `owner_key`
- `mode`
- `total_count`
- `correct_count`
- `wrong_card_ids`
- `created_at`

Observed usage:

- Inserted when sessions finish.
- Read by `/api/stats/overview` for today and last 7 days.
- Some stats code tolerates this table missing.

Likely constraints to verify:

- `mode` should be one of `LEITNER`, `DRILL`, `ai`.
- Count columns should be non-negative.
- `wrong_card_ids` is expected to be an array-like value.

### `learn_last_missed`

Status: B, code-derived.

Expected columns:

- `owner_key`
- `card_id`
- `created_at`

Observed usage:

- Upserted with `onConflict: "owner_key,card_id"`.
- Read ordered by `created_at desc`.
- Deleted by card-specific routes.

Likely constraints to verify:

- Unique or primary key on `(owner_key, card_id)`.
- Foreign key to `cards(id)` with `on delete cascade`.

### `card_notes`

Status: B, code-derived.

Expected columns:

- `owner_key`
- `card_id`
- `main_notes`
- `memory_hint`
- `example_sentence`
- `confusion_note`
- `updated_at`

Observed usage:

- Read and upserted by `/api/cards/notes` after explicit card ownership check.
- Upsert conflict target is `(owner_key, card_id)`.

Likely constraints to verify:

- Unique or primary key on `(owner_key, card_id)`.
- Foreign key to `cards(id)` with `on delete cascade`.

### `ai_learner_state`

Status: A, repository backed.

Known DDL is present in `sql/ai_learner_state.sql` and mirrored in
`supabase/migrations/20260817000000_ai_learner_state_baseline.sql`.

Known columns:

- `owner_key uuid not null`
- `card_id uuid not null`
- `mastery double precision not null default 0`
- `last_seen timestamptz`
- `due_at timestamptz`
- `wrong_count integer not null default 0`
- `last_error_type text`
- `avg_latency_ms integer not null default 0`
- `hint_count integer not null default 0`
- `updated_at timestamptz not null default now()`

Known keys/indexes:

- Primary key `(owner_key, card_id)`.
- Index `(owner_key, due_at)`.

### `ai_card_mastery`

Status: B, code-derived.

Expected columns:

- `owner_key`
- `card_id`
- `seen_count`
- `correct_count`
- `wrong_count`
- `avg_score`
- `streak`
- `last_seen_at`
- `last_task_type`
- `updated_at`

Observed usage:

- Read/upserted by `src/lib/aiCoach/mastery.ts`.
- Upsert conflict target is `(owner_key,card_id)`.

Likely constraints to verify:

- Unique or primary key on `(owner_key, card_id)`.
- Count fields should default to 0 and be non-negative.

### `ai_card_enrichment`

Status: B, code-derived.

Expected columns:

- `owner_key`
- `card_id`
- `type`
- `pos`
- `noun_class`
- `singular`
- `plural`
- `examples`
- `mnemonic`
- `notes`
- `updated_at`

Observed usage:

- Read/upserted by AI enrichment helper.
- `examples` is expected to contain structured data, likely `jsonb`.
- Upsert conflict target is `(owner_key,card_id)`.

Likely constraints to verify:

- Unique or primary key on `(owner_key, card_id)`.
- `type` and `pos` checks are useful after verifying production values.

## Storage buckets

### `card-images`

Status: B/C, code-derived.

Observed usage:

- Public URLs are assembled from `/storage/v1/object/public/card-images`.
- API upload path pattern: `${ownerKey}/${uuid}.${ext}`.
- `SUPABASE_STORAGE_BUCKET` is also expected by `/api/upload-image` and should point at the image bucket.

Unknown:

- Bucket public/private setting.
- Storage RLS/policies.
- Cache-control defaults.

### `card-audio`

Status: B/C, code-derived.

Observed usage:

- Public URLs are assembled from `/storage/v1/object/public/card-audio`.
- Upload path pattern: `${ownerKey}/${cardId}-${timestamp}.${ext}`.
- Upload validates authenticated card ownership before writing.
- New uploads store `cacheControl: "31536000"` because the path is versioned.
- Old object path is removed after successful DB update.

Unknown:

- Bucket public/private setting.
- Storage RLS/policies.

## RLS recommendation

Long-term policy principle:

> Authenticated users can only read or mutate rows where `owner_key = auth.uid()`.

Recommended direction after verifying production schema:

```sql
-- Template only. Verify table DDL and existing data before applying.
alter table public.cards enable row level security;

create policy "cards_select_own"
on public.cards for select
to authenticated
using (owner_key = auth.uid());

create policy "cards_insert_own"
on public.cards for insert
to authenticated
with check (owner_key = auth.uid());

create policy "cards_update_own"
on public.cards for update
to authenticated
using (owner_key = auth.uid())
with check (owner_key = auth.uid());

create policy "cards_delete_own"
on public.cards for delete
to authenticated
using (owner_key = auth.uid());
```

Apply the same shape to:

- `card_progress`
- `groups`
- `card_groups`
- `learn_sessions`
- `learn_last_missed`
- `card_notes`
- `ai_learner_state`
- `ai_card_mastery`
- `ai_card_enrichment`

Because most server routes use the service-role client, RLS will not protect
those routes. RLS would still protect future direct client-side data access and
provide defense in depth if server routes are later moved to auth-scoped clients.

## Service-role risk review

Most API routes call `requireUser()` and then use `src/lib/supabaseServer.ts`.
This is acceptable only when every query is scoped by `owner_key = user.id` or an
equivalent ownership check.

High-risk route:

- `src/app/api/migrate/route.ts`: uses service role, does not call `requireUser()`,
  and updates `cards` and `card_progress` by arbitrary `fromKey`/`toKey` request
  body values. This should not be exposed in production without admin auth or
  removal.

Routes that are service-role based but have explicit user scoping:

- Card CRUD/import/duplicate routes.
- Group routes.
- Learn routes.
- Stats route.
- AI coach routes.
- Upload routes, after card ownership checks.

Review points:

- Keep `requireUser()` before service-role access.
- Keep `.eq("owner_key", user.id)` on all tenant data queries.
- For joins, make sure joined rows cannot leak cross-user data through missing
  tenant filters.

## Index recommendations

These are recommended because query usage is visible in code. Verify existing
indexes in production before applying.

Core:

- `cards(owner_key, created_at desc)` for card list ordering.
- `cards(owner_key, type)` for type filters.
- `cards(owner_key, id)` for ownership lookups.
- `card_progress(owner_key, due_date)` for due-card queries.
- `card_progress(owner_key, card_id)` unique/primary index for upserts.
- `learn_last_missed(owner_key, created_at desc)` for recent missed cards.
- `learn_last_missed(owner_key, card_id)` unique/primary index for upserts.
- `learn_sessions(owner_key, created_at)` for stats windows.
- `groups(owner_key, type_scope, sort_order, name)` for group lists.
- `card_groups(owner_key, group_id)` and `card_groups(owner_key, card_id)` for
  group filters/enrichment.

AI:

- `ai_learner_state(owner_key, due_at)` exists in repo SQL.
- `ai_card_mastery(owner_key, card_id)` unique/primary index.
- `ai_card_enrichment(owner_key, card_id)` unique/primary index.

## Constraint recommendations

Apply only after checking existing production data:

- Add foreign keys from child tables to `cards(id)`/`groups(id)` with
  `on delete cascade` where current application behavior expects cleanup.
- Enforce non-negative counts and levels.
- Add `check` constraints for enum-like fields (`cards.type`,
  `groups.type_scope`, `learn_sessions.mode`, AI task/part-of-speech fields).
- Decide whether `owner_key` can be strict `uuid` everywhere. Code currently uses
  Supabase Auth user IDs, but old migration tooling refers to generic owner keys.

## Drift and unknowns

Unknown until inspected from Supabase:

- Exact column types for all B-status tables.
- Existing indexes and constraints.
- Whether legacy rows use `owner_key` values that are not UUIDs.
- Existing RLS enablement and policies.
- Storage bucket privacy and policies.
- Existing duplicate constraints on `cards`.

Do not convert this document into destructive migrations without first dumping
and reviewing the live schema in a non-production environment.
