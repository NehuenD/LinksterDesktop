-- Scaling + cross-device consistency (Feature/Improvement 4).
--   * link_stats(): counts computed in the database (RLS-scoped), so the client
--     never downloads the whole library to compute totals.
--   * labels.color: label colors become server state so they sync across devices
--     and ride along with the existing `labels` realtime publication.
-- Idempotent and safe to re-run.

-- ─────────────────────────────────────────────────────────────
-- 1. Server-side stats
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.link_stats()
RETURNS TABLE (
  total    bigint,
  unread   bigint,
  archived bigint,
  by_label jsonb
)
LANGUAGE sql
STABLE
AS $$
  WITH labeled AS (
    SELECT coalesce(nullif(btrim(label), ''), 'General') AS label, is_read, is_archived
    FROM public.links
  )
  SELECT
    (SELECT count(*) FROM labeled),
    (SELECT count(*) FROM labeled WHERE is_read = false AND is_archived = false),
    (SELECT count(*) FROM labeled WHERE is_archived = true),
    (
      SELECT coalesce(jsonb_object_agg(label, cnt), '{}'::jsonb)
      FROM (SELECT label, count(*) AS cnt FROM labeled GROUP BY label) grouped
    )
$$;

-- ─────────────────────────────────────────────────────────────
-- 2. Label colors as server state
-- ─────────────────────────────────────────────────────────────
ALTER TABLE public.labels ADD COLUMN IF NOT EXISTS color text;

-- Refresh the PostgREST schema cache so link_stats() is callable immediately.
NOTIFY pgrst, 'reload schema';
