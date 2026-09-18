-- Linkster per-kind queue counts (0013)
-- Adds unread/unwatched counts for the isolated sections so the sidebar badge
-- can show a real queue (X posts / videos left to read/watch) instead of the
-- all-time total. Library counts stay kind = 'link'; per-kind counts mirror the
-- library's unread semantics (unread AND not archived). Postgres cannot change a
-- function's OUT columns via CREATE OR REPLACE, hence the DROP. Idempotent; no
-- data changes.

DROP FUNCTION IF EXISTS public.link_stats();

CREATE OR REPLACE FUNCTION public.link_stats()
RETURNS TABLE (
  total            bigint,
  unread           bigint,
  archived         bigint,
  by_label         jsonb,
  x_posts          bigint,
  youtube          bigint,
  x_posts_unread   bigint,
  youtube_unwatched bigint
)
LANGUAGE sql
STABLE
AS $$
  WITH library AS (
    SELECT coalesce(nullif(btrim(label), ''), 'General') AS label, is_read, is_archived
    FROM public.links
    WHERE kind = 'link'
  )
  SELECT
    (SELECT count(*) FROM library),
    (SELECT count(*) FROM library WHERE is_read = false AND is_archived = false),
    (SELECT count(*) FROM library WHERE is_archived = true),
    (
      SELECT coalesce(jsonb_object_agg(label, cnt), '{}'::jsonb)
      FROM (SELECT label, count(*) AS cnt FROM library GROUP BY label) grouped
    ),
    (SELECT count(*) FROM public.links WHERE kind = 'x-post'),
    (SELECT count(*) FROM public.links WHERE kind = 'youtube'),
    (
      SELECT count(*) FROM public.links
      WHERE kind = 'x-post' AND is_read = false AND is_archived = false
    ),
    (
      SELECT count(*) FROM public.links
      WHERE kind = 'youtube' AND is_read = false AND is_archived = false
    )
$$;

NOTIFY pgrst, 'reload schema';
