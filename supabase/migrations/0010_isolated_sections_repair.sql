-- Linkster isolated-sections repair (X posts + YouTube)
-- Corrects classification/canonicalization gaps left by 0008/0009, makes the
-- isolation data self-healing, and fixes search ranking when content search is
-- off. Idempotent and safe to re-run; safe on databases where 0008/0009 were
-- already applied (it never assumes a fresh state).

-- ─────────────────────────────────────────────────────────────
-- 1. links.kind — one guarded constraint that accepts every known kind
-- ─────────────────────────────────────────────────────────────
ALTER TABLE public.links DROP CONSTRAINT IF EXISTS links_kind_check;
ALTER TABLE public.links
  ADD CONSTRAINT links_kind_check CHECK (kind IN ('link', 'x-post', 'youtube'));

-- ─────────────────────────────────────────────────────────────
-- 2. Side-table grants (project tables are granted explicitly; RLS still
--    scopes every row to its owner)
-- ─────────────────────────────────────────────────────────────
GRANT SELECT, INSERT, UPDATE, DELETE ON public.link_x_posts TO authenticated;

-- ─────────────────────────────────────────────────────────────
-- 3. X posts — backfill missed shapes, then canonicalize mirrors
-- ─────────────────────────────────────────────────────────────
-- 0008's backfill missed m.* hosts and the /i/web/status/ form.
UPDATE public.links
SET kind = 'x-post'
WHERE kind = 'link'
  AND url ~* '^https?://(www\.|mobile\.|m\.)?(x|twitter)\.com/(([A-Za-z0-9_]{1,15}|i)/)?(web/)?status(es)?/[1-9][0-9]*';

-- Rewrite every x-post URL to the handle-free canonical form so mirrors share
-- one dedupe key. When several mirrors of the same tweet exist, only the
-- lowest-id row is rewritten: rewriting both in one statement would violate
-- uq_links_user_url_normalized (the collision guard below only sees pre-update
-- values). Rows whose canonical URL would collide with another row are left
-- untouched (the client still dedupes them by tweet id).
WITH candidates AS (
  SELECT
    l.id,
    l.user_id,
    (regexp_match(l.url, '(?i)status(?:es)?/([1-9][0-9]*)'))[1] AS tweet_id
  FROM public.links l
  WHERE l.kind = 'x-post'
)
UPDATE public.links l
SET url = 'https://x.com/i/status/' || c.tweet_id
FROM candidates c
WHERE l.id = c.id
  AND c.tweet_id IS NOT NULL
  AND l.url IS DISTINCT FROM 'https://x.com/i/status/' || c.tweet_id
  AND l.id = (
    SELECT min(winner.id)
    FROM public.links winner
    WHERE winner.user_id = l.user_id
      AND winner.kind = 'x-post'
      AND (regexp_match(winner.url, '(?i)status(?:es)?/([1-9][0-9]*)'))[1] = c.tweet_id
  )
  AND NOT EXISTS (
    SELECT 1
    FROM public.links other
    WHERE other.user_id = l.user_id
      AND other.id <> l.id
      AND other.url_normalized =
        linkster_normalize_url('https://x.com/i/status/' || c.tweet_id)
  );

-- ─────────────────────────────────────────────────────────────
-- 4. YouTube — undo false positives, backfill missed shapes, canonicalize
-- ─────────────────────────────────────────────────────────────
-- 0009's pattern matched an 11-character prefix of longer segments and the
-- reserved playlist id `videoseries`. Move those back to the library.
UPDATE public.links
SET kind = 'link'
WHERE kind = 'youtube'
  AND NOT (
    url ~* '^https?://(www\.|m\.|music\.)?youtu\.be/[A-Za-z0-9_-]{11}([^A-Za-z0-9_-]|$)'
    OR url ~* '^https?://(www\.|m\.|music\.)?youtube(-nocookie)?\.com/watch/?\?[^#]*v=[A-Za-z0-9_-]{11}([^A-Za-z0-9_-]|$)'
    OR url ~* '^https?://(www\.|m\.|music\.)?youtube(-nocookie)?\.com/(shorts|embed|live|v)/[A-Za-z0-9_-]{11}([^A-Za-z0-9_-]|$)'
  );

-- Backfill shapes 0009 missed (`/v/`, trailing-slash watch, mixed-case paths).
UPDATE public.links
SET kind = 'youtube'
WHERE kind = 'link'
  AND (
    url ~* '^https?://(www\.|m\.|music\.)?youtu\.be/[A-Za-z0-9_-]{11}([^A-Za-z0-9_-]|$)'
    OR url ~* '^https?://(www\.|m\.|music\.)?youtube(-nocookie)?\.com/watch/?\?[^#]*v=[A-Za-z0-9_-]{11}([^A-Za-z0-9_-]|$)'
    OR url ~* '^https?://(www\.|m\.|music\.)?youtube(-nocookie)?\.com/(shorts|embed|live|v)/[A-Za-z0-9_-]{11}([^A-Za-z0-9_-]|$)'
  )
  AND url !~* '[?&]v=videoseries'
  AND url !~* '/(shorts|embed|live|v)/videoseries';

-- Rewrite every video URL to the canonical watch form so old variants dedupe
-- against fresh captures. Only the lowest-id mirror per video is rewritten
-- (two rewrites in one statement would violate the unique URL index), and
-- colliding rows are left untouched.
WITH candidates AS (
  SELECT
    l.id,
    l.user_id,
    coalesce(
      (regexp_match(l.url, '(?i)youtu\.be/([A-Za-z0-9_-]{11})([^A-Za-z0-9_-]|$)'))[1],
      (regexp_match(l.url, '(?i)/(?:watch\?[^#]*v=|shorts/|embed/|live/|v/)([A-Za-z0-9_-]{11})([^A-Za-z0-9_-]|$)'))[1]
    ) AS video_id
  FROM public.links l
  WHERE l.kind = 'youtube'
)
UPDATE public.links l
SET url = 'https://www.youtube.com/watch?v=' || c.video_id
FROM candidates c
WHERE l.id = c.id
  AND c.video_id IS NOT NULL
  AND l.url IS DISTINCT FROM 'https://www.youtube.com/watch?v=' || c.video_id
  AND l.id = (
    SELECT min(winner.id)
    FROM public.links winner
    WHERE winner.user_id = l.user_id
      AND winner.kind = 'youtube'
      AND coalesce(
        (regexp_match(winner.url, '(?i)youtu\.be/([A-Za-z0-9_-]{11})([^A-Za-z0-9_-]|$)'))[1],
        (regexp_match(winner.url, '(?i)/(?:watch\?[^#]*v=|shorts/|embed/|live/|v/)([A-Za-z0-9_-]{11})([^A-Za-z0-9_-]|$)'))[1]
      ) = c.video_id
  )
  AND NOT EXISTS (
    SELECT 1
    FROM public.links other
    WHERE other.user_id = l.user_id
      AND other.id <> l.id
      AND other.url_normalized =
        linkster_normalize_url('https://www.youtube.com/watch?v=' || c.video_id)
  );

-- ─────────────────────────────────────────────────────────────
-- 5. linkster_mark_all_read — bulk mark-read with the same filters as
--    search_links. A plain PostgREST or() filter cannot escape commas or
--    parentheses in the search term, so the update runs server-side.
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.linkster_mark_all_read(
  p_term      text DEFAULT NULL,
  p_filter    text DEFAULT 'all',
  p_label     text DEFAULT NULL,
  p_domain    text DEFAULT NULL,
  p_date_from timestamptz DEFAULT NULL,
  p_date_to   timestamptz DEFAULT NULL,
  p_kind      text DEFAULT 'link'
)
RETURNS integer
LANGUAGE sql
AS $$
  WITH updated AS (
    UPDATE public.links
    SET is_read = true
    WHERE is_read = false
      AND (
        p_filter IS NULL OR p_filter = 'all'
        OR (p_filter = 'unread' AND is_archived = false)
        OR (p_filter = 'archived' AND is_archived = true)
      )
      AND (p_label IS NULL OR label = p_label)
      AND (p_domain IS NULL OR url ILIKE '%' || p_domain || '%')
      AND (p_date_from IS NULL OR created_at >= p_date_from)
      AND (p_date_to IS NULL OR created_at <= p_date_to)
      AND (p_kind IS NULL OR p_kind = 'all' OR kind = p_kind)
      AND (
        p_term IS NULL OR p_term = ''
        OR title ILIKE '%' || p_term || '%'
        OR description ILIKE '%' || p_term || '%'
        OR url ILIKE '%' || p_term || '%'
      )
    RETURNING 1
  )
  SELECT count(*)::int FROM updated;
$$;

-- ─────────────────────────────────────────────────────────────
-- 6. search_links — rank only reflects content when content search is on
--    (otherwise hidden article-body relevance reorders metadata matches)
-- ─────────────────────────────────────────────────────────────
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
    CASE
      WHEN p_include_content THEN ts_rank(lc.content_tsv, (SELECT tsq FROM q))
      ELSE NULL
    END AS rank
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

-- Refresh the PostgREST schema cache so the recreated RPC is callable immediately.
NOTIFY pgrst, 'reload schema';
