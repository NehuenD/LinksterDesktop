-- Linkster X section query (0012)
-- Adds server-side search, filter and sort to x_post_list so the section toolbar
-- scales past scrolling: search matches tweet text, author name and handle;
-- filters cover unread/archived/has-link/failed; sort covers newest/oldest/author.
-- Postgres cannot change a function's OUT columns or argument list via CREATE OR
-- REPLACE, hence the DROP first. Idempotent and safe to re-run; no data changes.

DROP FUNCTION IF EXISTS public.x_post_list(int, int);

CREATE OR REPLACE FUNCTION public.x_post_list(
  p_limit  int DEFAULT 100,
  p_offset int DEFAULT 0,
  p_search text DEFAULT NULL,
  p_filter text DEFAULT 'all',
  p_sort   text DEFAULT 'newest'
)
RETURNS TABLE (
  link_id         uuid,
  url             text,
  is_read         boolean,
  is_archived     boolean,
  created_at      timestamptz,
  tweet_id        text,
  author_handle   text,
  author_name     text,
  "text"          text,
  posted_at       timestamptz,
  capture_status  text,
  capture_error   text,
  captured_at     timestamptz,
  related_url     text,
  related_link_id uuid,
  related_title   text,
  related_link_url text,
  total           bigint
)
LANGUAGE sql
STABLE
AS $$
  SELECT
    l.id,
    l.url,
    l.is_read,
    l.is_archived,
    l.created_at,
    xp.tweet_id,
    xp.author_handle,
    xp.author_name,
    xp."text",
    xp.posted_at,
    coalesce(xp.capture_status, 'none'),
    xp.capture_error,
    xp.captured_at,
    xp.related_url,
    xp.related_link_id,
    rl.title,
    rl.url,
    count(*) OVER ()
  FROM public.links l
  LEFT JOIN public.link_x_posts xp ON xp.link_id = l.id
  LEFT JOIN public.links rl ON rl.id = xp.related_link_id
  WHERE l.kind = 'x-post'
    AND (
      p_filter = 'all'
      OR (p_filter = 'unread' AND l.is_read = false AND l.is_archived = false)
      OR (p_filter = 'archived' AND l.is_archived = true)
      OR (p_filter = 'has-link' AND xp.related_url IS NOT NULL)
      OR (p_filter = 'failed' AND xp.capture_status = 'failed')
    )
    AND (
      p_search IS NULL
      OR btrim(p_search) = ''
      OR xp."text" ILIKE '%' || p_search || '%'
      OR xp.author_name ILIKE '%' || p_search || '%'
      OR xp.author_handle ILIKE '%' || p_search || '%'
    )
  ORDER BY
    CASE WHEN p_sort = 'oldest' THEN l.created_at END ASC,
    CASE WHEN p_sort = 'author' THEN lower(xp.author_name) END ASC NULLS LAST,
    l.created_at DESC
  LIMIT greatest(p_limit, 0)
  OFFSET greatest(p_offset, 0);
$$;

NOTIFY pgrst, 'reload schema';
