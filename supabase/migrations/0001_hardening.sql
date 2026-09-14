-- Linkster schema hardening (APP_AUDIT §19.4)
-- Idempotent. Applies to the existing Flutter-era schema, derived from
-- supabase_setup.sql. Safe to re-run.
--
-- Goals:
--   1. Canonical URL normalization + UNIQUE(user_id, url_normalized)
--   2. links/labels.user_id NOT NULL with ON DELETE CASCADE
--   3. Indexes for is_read / is_archived filters
--   4. Consistent UUID default (gen_random_uuid)

-- ─────────────────────────────────────────────────────────────
-- 1. URL normalization
-- ─────────────────────────────────────────────────────────────
-- Lowercases scheme + host, strips the fragment and common tracking
-- parameters, and trims a trailing slash. IMMUTABLE so it can back a trigger.
CREATE OR REPLACE FUNCTION linkster_normalize_url(raw TEXT)
RETURNS TEXT
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  result TEXT;
  scheme_host TEXT;
  rest TEXT;
BEGIN
  IF raw IS NULL OR btrim(raw) = '' THEN
    RETURN NULL;
  END IF;

  result := btrim(raw);

  -- Strip the fragment.
  result := regexp_replace(result, '#.*$', '');

  -- Drop common tracking parameters (repeat pass tolerates loose ordering).
  result := regexp_replace(
    result,
    '([?&])(utm_[A-Za-z0-9_]+|fbclid|gclid|dclid|mc_eid|mc_cid|igshid)=[^&]*',
    '\1',
    'gi'
  );
  result := regexp_replace(result, '\?&', '?', 'g');
  result := regexp_replace(result, '&&+', '&', 'g');
  result := regexp_replace(result, '[?&]+$', '', 'g');

  -- Lowercase scheme + authority only.
  scheme_host := substring(result FROM '^[A-Za-z][A-Za-z0-9+.-]*://[^/?#]*');
  IF scheme_host IS NOT NULL THEN
    rest := substring(result FROM char_length(scheme_host) + 1);
    result := lower(scheme_host) || rest;
  END IF;

  -- Trim a trailing slash (but keep the bare "https://host/" case intact above).
  result := regexp_replace(result, '/+$', '', 'g');
  IF result = '' THEN
    RETURN raw;
  END IF;

  RETURN result;
END;
$$;

ALTER TABLE links ADD COLUMN IF NOT EXISTS url_normalized TEXT;

-- Backfill legacy rows.
UPDATE links
SET url_normalized = linkster_normalize_url(url)
WHERE url_normalized IS NULL;

-- Resolve pre-existing duplicates non-destructively: only the earliest row per
-- (user_id, normalized url) keeps a value, so the unique index can be created
-- without deleting any user data. Later duplicates stay NULL and remain usable.
UPDATE links
SET url_normalized = NULL
WHERE id IN (
  SELECT id FROM (
    SELECT
      id,
      row_number() OVER (
        PARTITION BY user_id, url_normalized
        ORDER BY created_at ASC NULLS LAST, id ASC
      ) AS rn
    FROM links
    WHERE url_normalized IS NOT NULL
  ) ranked
  WHERE ranked.rn > 1
);

-- Keep url_normalized correct for every insert/update.
CREATE OR REPLACE FUNCTION linkster_set_url_normalized()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.url_normalized := linkster_normalize_url(NEW.url);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS set_links_url_normalized ON links;
CREATE TRIGGER set_links_url_normalized
  BEFORE INSERT OR UPDATE OF url ON links
  FOR EACH ROW EXECUTE FUNCTION linkster_set_url_normalized();

CREATE UNIQUE INDEX IF NOT EXISTS uq_links_user_url_normalized
  ON links(user_id, url_normalized);

-- ─────────────────────────────────────────────────────────────
-- 2. Ownership integrity
-- ─────────────────────────────────────────────────────────────
-- Rows with a NULL owner are already invisible under RLS; remove them so the
-- NOT NULL constraint can be applied.
DELETE FROM links WHERE user_id IS NULL;
DELETE FROM labels WHERE user_id IS NULL;

ALTER TABLE links DROP CONSTRAINT IF EXISTS links_user_id_fkey;
ALTER TABLE links
  ADD CONSTRAINT links_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE links ALTER COLUMN user_id SET DEFAULT auth.uid();
ALTER TABLE links ALTER COLUMN user_id SET NOT NULL;

ALTER TABLE labels DROP CONSTRAINT IF EXISTS labels_user_id_fkey;
ALTER TABLE labels
  ADD CONSTRAINT labels_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE labels ALTER COLUMN user_id SET DEFAULT auth.uid();
ALTER TABLE labels ALTER COLUMN user_id SET NOT NULL;

-- ─────────────────────────────────────────────────────────────
-- 3. Filter indexes
-- ─────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_links_user_is_read
  ON links(user_id, is_read);
CREATE INDEX IF NOT EXISTS idx_links_user_is_archived
  ON links(user_id, is_archived);
CREATE INDEX IF NOT EXISTS idx_links_user_created_at
  ON links(user_id, created_at DESC);

-- ─────────────────────────────────────────────────────────────
-- 4. Consistent UUID defaults
-- ─────────────────────────────────────────────────────────────
ALTER TABLE links ALTER COLUMN id SET DEFAULT gen_random_uuid();
ALTER TABLE labels ALTER COLUMN id SET DEFAULT gen_random_uuid();
