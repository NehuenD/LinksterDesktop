-- Linkster Reader Mode (Feature 2)
-- Adds article content storage, full-text search, and the per-page metadata the
-- reader/media view needs. Idempotent and safe to re-run.
--
-- Design note: article bodies live in a 1:1 side table (`link_content`) rather
-- than on `links`, so the `links` realtime publication and list queries never
-- carry full article HTML/text. `link_content` is intentionally NOT added to
-- the supabase_realtime publication.

-- ─────────────────────────────────────────────────────────────
-- 1. Page metadata used by the reader + media view
-- ─────────────────────────────────────────────────────────────
ALTER TABLE public.links ADD COLUMN IF NOT EXISTS author text;
ALTER TABLE public.links ADD COLUMN IF NOT EXISTS site_name text;

-- ─────────────────────────────────────────────────────────────
-- 2. Article content (1:1 with links)
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.link_content (
  link_id           uuid PRIMARY KEY REFERENCES public.links(id) ON DELETE CASCADE,
  user_id           uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  content_html      text,
  content_text      text,
  word_count        int,
  extraction_status text NOT NULL DEFAULT 'none',
  extracted_at      timestamptz,
  content_tsv       tsvector GENERATED ALWAYS AS (
    to_tsvector('english'::regconfig, coalesce(content_text, ''))
  ) STORED
);

CREATE INDEX IF NOT EXISTS idx_link_content_tsv  ON public.link_content USING gin (content_tsv);
CREATE INDEX IF NOT EXISTS idx_link_content_user ON public.link_content (user_id);

ALTER TABLE public.link_content ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS link_content_owner ON public.link_content;
CREATE POLICY link_content_owner ON public.link_content
  FOR ALL USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- ─────────────────────────────────────────────────────────────
-- 3. Full-text search across metadata + article body
-- ─────────────────────────────────────────────────────────────
-- Title/description/url live on `links`; the body on `link_content`, so search
-- needs a join. Runs as the invoker (RLS still applies). Returns the normal
-- link columns plus reader badge fields and a match facet.
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
    -- term matches metadata (always) or the article body (when enabled)
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
