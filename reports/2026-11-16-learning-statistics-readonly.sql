-- Read-only audit. Bind :owner_key to the user's auth UUID in the SQL client.
-- All calendar boundaries match the application's UTC dates.

-- 1. Stored levels, displayed levels, and due-date distribution.
SELECT p.level AS stored_level, p.level + 1 AS display_level,
       count(*) AS cards,
       count(*) FILTER (WHERE p.due_date <= timezone('UTC', now())::date) AS due_today_or_earlier,
       count(*) FILTER (WHERE p.due_date > timezone('UTC', now())::date) AS due_later,
       min(p.due_date) AS earliest_due, max(p.due_date) AS latest_due
FROM card_progress p
WHERE p.owner_key = :owner_key
GROUP BY p.level
ORDER BY p.level;

-- 2. Level bounds and invalid progress rows.
SELECT count(*) AS progress_rows, min(level) AS min_level, max(level) AS max_level,
       count(*) FILTER (WHERE level IS NULL OR level < 0 OR level > 5) AS invalid_level_rows,
       count(*) FILTER (WHERE due_date IS NULL) AS missing_due_date_rows
FROM card_progress
WHERE owner_key = :owner_key;

-- 3. Recent session aggregates without exposing card IDs.
SELECT created_at, mode, total_count, correct_count,
       greatest(coalesce(total_count, 0) - coalesce(correct_count, 0), 0) AS wrong_count,
       coalesce(jsonb_array_length(to_jsonb(wrong_card_ids)), 0) AS wrong_card_id_count
FROM learn_sessions
WHERE owner_key = :owner_key
ORDER BY created_at DESC
LIMIT 50;

-- 4. Seven UTC days, including days without a session.
WITH days AS (
    SELECT generate_series(timezone('UTC', now())::date - 6,
                           timezone('UTC', now())::date, interval '1 day')::date AS day
), daily AS (
    SELECT (created_at AT TIME ZONE 'UTC')::date AS day,
           count(*) AS sessions,
           sum(coalesce(total_count, 0)) AS reviewed,
           sum(coalesce(correct_count, 0)) AS correct,
           sum(greatest(coalesce(total_count, 0) - coalesce(correct_count, 0), 0)) AS wrong
    FROM learn_sessions
    WHERE owner_key = :owner_key
      AND total_count > 0
      AND created_at >= ((timezone('UTC', now())::date - 6)::timestamp AT TIME ZONE 'UTC')
      AND created_at < ((timezone('UTC', now())::date + 1)::timestamp AT TIME ZONE 'UTC')
    GROUP BY 1
)
SELECT days.day, coalesce(daily.sessions, 0) AS sessions,
       coalesce(daily.reviewed, 0) AS reviewed,
       coalesce(daily.correct, 0) AS correct,
       coalesce(daily.wrong, 0) AS wrong
FROM days LEFT JOIN daily USING (day)
ORDER BY days.day;

-- 5. Cards lacking progress and progress rows lacking a card.
SELECT
  (SELECT count(*) FROM cards c LEFT JOIN card_progress p
     ON p.card_id = c.id AND p.owner_key = :owner_key
     WHERE c.owner_key = :owner_key AND p.card_id IS NULL) AS cards_without_progress,
  (SELECT count(*) FROM card_progress p LEFT JOIN cards c ON c.id = p.card_id
     WHERE p.owner_key = :owner_key AND c.id IS NULL) AS progress_without_card;

-- 6. Aggregate anomalies in session counts.
SELECT count(*) FILTER (WHERE total_count = 0) AS zero_card_sessions,
       count(*) FILTER (WHERE total_count < 0 OR correct_count < 0 OR correct_count > total_count) AS invalid_counts,
       count(*) FILTER (WHERE coalesce(jsonb_array_length(to_jsonb(wrong_card_ids)), 0)
                             <> greatest(coalesce(total_count, 0) - coalesce(correct_count, 0), 0)) AS wrong_id_count_mismatch
FROM learn_sessions
WHERE owner_key = :owner_key;
