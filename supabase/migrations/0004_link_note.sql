-- Quick capture (Feature 3): optional user-authored note on a link.
-- Additive and nullable; existing rows default to NULL. Idempotent.
ALTER TABLE public.links ADD COLUMN IF NOT EXISTS note text;

-- Re-create search_links so search results also carry the note column.
-- Adding an OUT column changes the function's row type, which
-- CREATE OR REPLACE FUNCTION cannot do, so drop the previous definition first.
-- Without this, the statement errors ("cannot change return type of existing
-- function") and aborts the migration before the note column is committed.
DROP FUNCTION IF EXISTS public.search_links(
  text, text, text, text, timestamptz, timestamptz, boolean, int, int
);

CREATE OR REPLACE FUNCTION public.search_links(
  p_term            text,
  p_filter          text DEFAULT 'all',
  p_label           text DEFAULT NULL,
  p_domain          text DEFAULT NULL,
  p_date_from       timestamptz DEFAULT NULL,
  p_date_to         timestamptz DEFAULT NULL,
  p_include_content boolean DEFAULT true,
  p_limit           int DEFAULT 48,
  p_offset          int DEFAULT 0
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
  ORDER BY rank DESC NULLS LAST, l.created_at DESC
  LIMIT greatest(p_limit, 0)
  OFFSET greatest(p_offset, 0);
$$;

