-- Linkster search/RPC hardening (0015)
-- Fixes:
--   * LIKE wildcards (`%`, `_`) and backslashes in search terms/domains were
--     passed raw into ILIKE, so a term like `%` matched every row (and mark-all-
--     read then mutated rows the user never saw as matches).
--   * `search_links` dropped the YouTube enrichment columns from its projection,
--     so search results lost duration/origin/channel/playlist metadata.
--   * `ts_rank` returned 0 for content rows whose body did not match, which
--     reordered metadata-only matches ahead of contentless links.
--   * `linkster_mark_all_read` ignored content matches (`p_include_content`),
--     so "mark all read" and the visible search result set could disagree.
--   * RPC sorts lacked a unique tiebreaker, allowing duplicate/skipped rows
--     across offset pages.
--   * `link_x_posts` had no updated_at trigger and was missing from Realtime,
--     so capture-state changes never reached other devices.
-- Idempotent; safe to re-run.

-- ─────────────────────────────────────────────────────────────
-- 0. Shared LIKE escaper (used with `ESCAPE '\'` below).
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.linkster_escape_like(p_value text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT replace(replace(replace(coalesce(p_value, ''), '\', '\\'), '%', '\%'), '_', '\_')
$$;

-- ─────────────────────────────────────────────────────────────
-- 1. search_links — escaped terms, real content rank, YouTube columns,
--    unique tiebreaker.
-- ─────────────────────────────────────────────────────────────
DROP FUNCTION IF EXISTS public.search_links(
  text, text, text, text, timestamptz, timestamptz, boolean, text, int, int, text
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
  duration_seconds  int,
  channel_url       text,
  origin            text,
  playlist_id       text,
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
  ),
  t AS (
    SELECT
      public.linkster_escape_like(p_term)   AS term,
      public.linkster_escape_like(p_domain) AS domain
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
    l.duration_seconds,
    l.channel_url,
    l.origin,
    l.playlist_id,
    lc.word_count,
    lc.extraction_status,
    (p_include_content AND lc.content_tsv @@ (SELECT tsq FROM q)) AS matched_in_content,
    CASE
      WHEN p_include_content AND lc.content_tsv @@ (SELECT tsq FROM q)
        THEN ts_rank(lc.content_tsv, (SELECT tsq FROM q))
      ELSE NULL
    END AS rank
  FROM public.links l
  LEFT JOIN public.link_content lc ON lc.link_id = l.id
  WHERE
    (
      l.title ILIKE '%' || (SELECT term FROM t) || '%' ESCAPE '\'
      OR l.description ILIKE '%' || (SELECT term FROM t) || '%' ESCAPE '\'
      OR l.url ILIKE '%' || (SELECT term FROM t) || '%' ESCAPE '\'
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
    AND (
      p_domain IS NULL
      OR p_domain = ''
      OR l.url ILIKE '%' || (SELECT domain FROM t) || '%' ESCAPE '\'
    )
    AND (p_date_from IS NULL OR l.created_at >= p_date_from)
    AND (p_date_to IS NULL OR l.created_at <= p_date_to)
    AND (p_kind IS NULL OR p_kind = 'all' OR l.kind = p_kind)
  ORDER BY
    rank DESC NULLS LAST,
    CASE p_sort WHEN 'oldest' THEN l.created_at END ASC NULLS LAST,
    CASE p_sort WHEN 'title'  THEN l.title END ASC NULLS LAST,
    CASE p_sort WHEN 'domain' THEN l.url END ASC NULLS LAST,
    CASE WHEN p_sort IN ('oldest', 'title', 'domain') THEN NULL ELSE l.created_at END DESC NULLS LAST,
    l.created_at DESC,
    l.id DESC
  LIMIT greatest(p_limit, 0)
  OFFSET greatest(p_offset, 0);
$$;

-- ─────────────────────────────────────────────────────────────
-- 2. linkster_mark_all_read — content-aware, escaped, owner-scoped.
--    The argument list changes, so the old signature is dropped first.
-- ─────────────────────────────────────────────────────────────
DROP FUNCTION IF EXISTS public.linkster_mark_all_read(
  text, text, text, text, timestamptz, timestamptz, text
);

CREATE OR REPLACE FUNCTION public.linkster_mark_all_read(
  p_term            text DEFAULT NULL,
  p_filter          text DEFAULT 'all',
  p_label           text DEFAULT NULL,
  p_domain          text DEFAULT NULL,
  p_date_from       timestamptz DEFAULT NULL,
  p_date_to         timestamptz DEFAULT NULL,
  p_kind            text DEFAULT 'link',
  p_include_content boolean DEFAULT true
)
RETURNS integer
LANGUAGE sql
AS $$
  WITH q AS (
    SELECT websearch_to_tsquery('english'::regconfig, coalesce(p_term, '')) AS tsq
  ),
  t AS (
    SELECT
      public.linkster_escape_like(p_term)   AS term,
      public.linkster_escape_like(p_domain) AS domain
  ),
  updated AS (
    UPDATE public.links l
    SET is_read = true
    WHERE is_read = false
      AND l.user_id = auth.uid()
      AND (
        p_filter IS NULL OR p_filter = 'all'
        OR (p_filter = 'unread' AND l.is_archived = false)
        OR (p_filter = 'archived' AND l.is_archived = true)
      )
      AND (p_label IS NULL OR l.label = p_label)
      AND (
        p_domain IS NULL
        OR p_domain = ''
        OR l.url ILIKE '%' || (SELECT domain FROM t) || '%' ESCAPE '\'
      )
      AND (p_date_from IS NULL OR l.created_at >= p_date_from)
      AND (p_date_to IS NULL OR l.created_at <= p_date_to)
      AND (p_kind IS NULL OR p_kind = 'all' OR l.kind = p_kind)
      AND (
        p_term IS NULL OR btrim(p_term) = ''
        OR l.title ILIKE '%' || (SELECT term FROM t) || '%' ESCAPE '\'
        OR l.description ILIKE '%' || (SELECT term FROM t) || '%' ESCAPE '\'
        OR l.url ILIKE '%' || (SELECT term FROM t) || '%' ESCAPE '\'
        OR (
          p_include_content
          AND EXISTS (
            SELECT 1 FROM public.link_content lc
            WHERE lc.link_id = l.id
              AND lc.content_tsv @@ (SELECT tsq FROM q)
          )
        )
      )
    RETURNING 1
  )
  SELECT count(*)::int FROM updated;
$$;

-- ─────────────────────────────────────────────────────────────
-- 3. x_post_list — escaped search + unique tiebreaker.
-- ─────────────────────────────────────────────────────────────
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
      OR xp."text" ILIKE '%' || public.linkster_escape_like(p_search) || '%' ESCAPE '\'
      OR xp.author_name ILIKE '%' || public.linkster_escape_like(p_search) || '%' ESCAPE '\'
      OR xp.author_handle ILIKE '%' || public.linkster_escape_like(p_search) || '%' ESCAPE '\'
    )
  ORDER BY
    CASE WHEN p_sort = 'oldest' THEN l.created_at END ASC,
    CASE WHEN p_sort = 'author' THEN lower(xp.author_name) END ASC NULLS LAST,
    l.created_at DESC,
    l.id DESC
  LIMIT greatest(p_limit, 0)
  OFFSET greatest(p_offset, 0);
$$;

-- ─────────────────────────────────────────────────────────────
-- 4. Ownership indexes for the hot filter/sort paths.
-- ─────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_links_user_label
  ON public.links (user_id, label);
CREATE INDEX IF NOT EXISTS idx_links_user_kind_created
  ON public.links (user_id, kind, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_link_x_posts_user_created
  ON public.link_x_posts (user_id, created_at DESC);

-- ─────────────────────────────────────────────────────────────
-- 5. link_content grants (explicit, not reliant on platform defaults) and a
--    link_x_posts updated_at trigger (all current writes set it manually, but
--    direct SQL/PostgREST writes must not leave it stale).
-- ─────────────────────────────────────────────────────────────
GRANT SELECT, INSERT, UPDATE, DELETE ON public.link_content TO authenticated;

DROP TRIGGER IF EXISTS touch_link_x_posts_updated_at ON public.link_x_posts;
CREATE TRIGGER touch_link_x_posts_updated_at
  BEFORE UPDATE ON public.link_x_posts
  FOR EACH ROW EXECUTE FUNCTION public.linkster_touch_updated_at();

-- ─────────────────────────────────────────────────────────────
-- 6. Publish link_x_posts so capture-state changes reach other devices.
-- ─────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'link_x_posts'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.link_x_posts;
  END IF;
END $$;

ALTER TABLE public.link_x_posts REPLICA IDENTITY FULL;

NOTIFY pgrst, 'reload schema';
