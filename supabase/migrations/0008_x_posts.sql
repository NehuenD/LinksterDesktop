-- Linkster X post capture
-- Isolates X (Twitter) posts from the library (`kind = 'x-post'`), stores their
-- capture metadata + capture state in a 1:1 side table, and keeps their
-- "contains link" relation. Idempotent and safe to re-run.
--
-- Design notes:
--   * `links.kind` is the authoritative isolation switch: library queries default
--     to 'link', the X section reads 'x-post'.
--   * `link_x_posts` is a side table (like `link_content`) so the `links` realtime
--     publication and list queries never carry tweet payloads. Capture PNGs are
--     local-only files; only textual metadata syncs.

-- ─────────────────────────────────────────────────────────────
-- 1. links.kind — library vs X post
-- ─────────────────────────────────────────────────────────────
ALTER TABLE public.links ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'link';

-- Backfill posts captured before this migration so they move to the X section.
UPDATE public.links
SET kind = 'x-post'
WHERE kind = 'link'
  AND url ~* '^https?://(www\.|mobile\.)?(x|twitter)\.com/(([A-Za-z0-9_]{1,15}|i)/)?status(es)?/[0-9]+';

-- Includes 'youtube' (added by 0009) so re-running this file after 0009 cannot
-- fail constraint validation on existing youtube rows.
ALTER TABLE public.links DROP CONSTRAINT IF EXISTS links_kind_check;
ALTER TABLE public.links
  ADD CONSTRAINT links_kind_check CHECK (kind IN ('link', 'x-post', 'youtube'));

CREATE INDEX IF NOT EXISTS idx_links_user_kind ON public.links (user_id, kind);

-- ─────────────────────────────────────────────────────────────
-- 2. link_x_posts — tweet metadata + capture state (1:1)
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.link_x_posts (
  link_id        uuid PRIMARY KEY REFERENCES public.links(id) ON DELETE CASCADE,
  user_id        uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  tweet_id       text NOT NULL,
  author_handle  text,
  author_name    text,
  "text"         text,
  posted_at      timestamptz,
  capture_status text NOT NULL DEFAULT 'none',
  capture_error  text,
  captured_at    timestamptz,
  related_url    text,
  related_link_id uuid REFERENCES public.links(id) ON DELETE SET NULL,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.link_x_posts DROP CONSTRAINT IF EXISTS link_x_posts_capture_status_check;
ALTER TABLE public.link_x_posts
  ADD CONSTRAINT link_x_posts_capture_status_check
  CHECK (capture_status IN ('none', 'pending', 'ok', 'failed'));

CREATE UNIQUE INDEX IF NOT EXISTS uq_link_x_posts_user_tweet
  ON public.link_x_posts (user_id, tweet_id);
CREATE INDEX IF NOT EXISTS idx_link_x_posts_related
  ON public.link_x_posts (related_link_id);

ALTER TABLE public.link_x_posts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS link_x_posts_owner ON public.link_x_posts;
CREATE POLICY link_x_posts_owner ON public.link_x_posts
  FOR ALL USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- ─────────────────────────────────────────────────────────────
-- 3. search_links — kind filter (adding a parameter requires a drop)
-- ─────────────────────────────────────────────────────────────
DROP FUNCTION IF EXISTS public.search_links(
  text, text, text, text, timestamptz, timestamptz, boolean, text, int, int
);

CREATE OR REPLACE FUNCTION public.search_links(
  p_term            text,
  p_filter          text DEFAULT 'all',
  p_label           text DEFAULT NULL,
  p_domain          text DEFAULT NULL,
  p_date_from       timestamptz DEFAULT NULL,
  p_date_to         timestamptz DEFAULT NULL,
  p_include_content boolean DEFAULT true,
  p_sort            text DEFAULT 'newest',
  p_limit           int DEFAULT 48,
  p_offset          int DEFAULT 0,
  p_kind            text DEFAULT 'link'
)
RETURNS TABLE (
  id                uuid,
  url               text,
  title             text,
  description       text,
  thumbnail_url     text,
  author            text,
  site_name         text,
  label             text,
  note              text,
  kind              text,
  is_read           boolean,
  is_archived       boolean,
  created_at        timestamptz,
  updated_at        timestamptz,
  user_id           uuid,
  word_count        int,
  extraction_status text,
  matched_in_content boolean,
  rank              real
)
LANGUAGE sql
STABLE
AS $$
  WITH q AS (
    SELECT websearch_to_tsquery('english'::regconfig, coalesce(p_term, '')) AS tsq
  )
  SELECT
    l.id,
    l.url,
    l.title,
    l.description,
    l.thumbnail_url,
    l.author,
    l.site_name,
    l.label,
    l.note,
    l.kind,
    l.is_read,
    l.is_archived,
    l.created_at,
    l.updated_at,
    l.user_id,
    lc.word_count,
    lc.extraction_status,
    (p_include_content AND lc.content_tsv @@ (SELECT tsq FROM q)) AS matched_in_content,
    ts_rank(lc.content_tsv, (SELECT tsq FROM q)) AS rank
  FROM public.links l
  LEFT JOIN public.link_content lc ON lc.link_id = l.id
  WHERE
    (
      l.title ILIKE '%' || p_term || '%'
      OR l.description ILIKE '%' || p_term || '%'
      OR l.url ILIKE '%' || p_term || '%'
      OR (
        p_include_content
        AND lc.content_tsv @@ (SELECT tsq FROM q)
      )
    )
    AND (
      p_filter IS NULL OR p_filter = 'all'
      OR (p_filter = 'unread' AND l.is_read = false AND l.is_archived = false)
      OR (p_filter = 'archived' AND l.is_archived = true)
    )
    AND (p_label IS NULL OR l.label = p_label)
    AND (p_domain IS NULL OR l.url ILIKE '%' || p_domain || '%')
    AND (p_date_from IS NULL OR l.created_at >= p_date_from)
    AND (p_date_to IS NULL OR l.created_at <= p_date_to)
    AND (p_kind IS NULL OR p_kind = 'all' OR l.kind = p_kind)
  ORDER BY
    rank DESC NULLS LAST,
    CASE p_sort WHEN 'oldest' THEN l.created_at END ASC NULLS LAST,
    CASE p_sort WHEN 'title'  THEN l.title END ASC NULLS LAST,
    CASE p_sort WHEN 'domain' THEN l.url END ASC NULLS LAST,
    CASE WHEN p_sort IN ('oldest', 'title', 'domain') THEN NULL ELSE l.created_at END DESC NULLS LAST,
    l.created_at DESC
  LIMIT greatest(p_limit, 0)
  OFFSET greatest(p_offset, 0);
$$;

-- ─────────────────────────────────────────────────────────────
-- 4. link_stats — library counts exclude X posts; expose the X count
-- ─────────────────────────────────────────────────────────────
DROP FUNCTION IF EXISTS public.link_stats();

CREATE OR REPLACE FUNCTION public.link_stats()
RETURNS TABLE (
  total    bigint,
  unread   bigint,
  archived bigint,
  by_label jsonb,
  x_posts  bigint
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
    (SELECT count(*) FROM public.links WHERE kind = 'x-post')
$$;

-- ─────────────────────────────────────────────────────────────
-- 5. X section listing (link + capture metadata + relation)
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.x_post_list(
  p_limit  int DEFAULT 100,
  p_offset int DEFAULT 0
)
RETURNS TABLE (
  link_id         uuid,
  url             text,
  is_read         boolean,
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

-- ─────────────────────────────────────────────────────────────
-- 6. Resolve related links once the related URL has been captured
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.linkster_resolve_x_related_links()
RETURNS integer
LANGUAGE sql
AS $$
  WITH resolved AS (
    UPDATE public.link_x_posts lp
    SET related_link_id = l.id, updated_at = now()
    FROM public.links l
    WHERE lp.related_link_id IS NULL
      AND lp.related_url IS NOT NULL
      AND l.user_id = auth.uid()
      AND l.url_normalized = linkster_normalize_url(lp.related_url)
    RETURNING 1
  )
  SELECT count(*)::int FROM resolved;
$$;

-- Refresh the PostgREST schema cache so the recreated RPCs are callable immediately.
NOTIFY pgrst, 'reload schema';
