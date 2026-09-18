-- Linkster X post archive state (0011)
-- The X section needs the link's archived flag to support Archive/Unarchive
-- and the archived badge (WP2). `x_post_list` previously returned only is_read,
-- so it is republished with `is_archived`. Postgres cannot change a function's
-- OUT columns via CREATE OR REPLACE, hence the DROP first. Idempotent and safe
-- to re-run; no data changes.

DROP FUNCTION IF EXISTS public.x_post_list(int, int);

CREATE OR REPLACE FUNCTION public.x_post_list(
  p_limit  int DEFAULT 100,
  p_offset int DEFAULT 0
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
  ORDER BY l.created_at DESC
  LIMIT greatest(p_limit, 0)
  OFFSET greatest(p_offset, 0);
$$;

NOTIFY pgrst, 'reload schema';
