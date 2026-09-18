-- Linkster security hardening: per-user isolation (RLS), label uniqueness and
-- updated_at maintenance. Idempotent and safe to re-run.
--
-- Before this migration the repo shipped an anon key but no auditable policies;
-- isolation depended on out-of-repo SQL. These policies make `user_id = auth.uid()`
-- the single, reproducible isolation rule for every verb on `links` and `labels`.
-- (`link_content` already has its own policy in 0003.)

-- ─────────────────────────────────────────────────────────────
-- 1. Label integrity
-- ─────────────────────────────────────────────────────────────
-- Collapse any pre-existing duplicate (user_id, name) rows so the unique index
-- can be created. Links reference labels by name (text), so dropping extras is
-- non-destructive. Keep the earliest id per group.
DELETE FROM public.labels loser
USING public.labels keeper
WHERE loser.user_id = keeper.user_id
  AND loser.name = keeper.name
  AND loser.id > keeper.id;

CREATE UNIQUE INDEX IF NOT EXISTS uq_labels_user_name
  ON public.labels (user_id, name);

-- ─────────────────────────────────────────────────────────────
-- 2. updated_at maintenance
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.linkster_touch_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS touch_links_updated_at ON public.links;
CREATE TRIGGER touch_links_updated_at
  BEFORE UPDATE ON public.links
  FOR EACH ROW EXECUTE FUNCTION public.linkster_touch_updated_at();

DROP TRIGGER IF EXISTS touch_labels_updated_at ON public.labels;
CREATE TRIGGER touch_labels_updated_at
  BEFORE UPDATE ON public.labels
  FOR EACH ROW EXECUTE FUNCTION public.linkster_touch_updated_at();

-- ─────────────────────────────────────────────────────────────
-- 3. Row Level Security
-- ─────────────────────────────────────────────────────────────
ALTER TABLE public.links ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.labels ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS links_owner_select ON public.links;
CREATE POLICY links_owner_select ON public.links
  FOR SELECT USING (user_id = auth.uid());

DROP POLICY IF EXISTS links_owner_insert ON public.links;
CREATE POLICY links_owner_insert ON public.links
  FOR INSERT WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS links_owner_update ON public.links;
CREATE POLICY links_owner_update ON public.links
  FOR UPDATE USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS links_owner_delete ON public.links;
CREATE POLICY links_owner_delete ON public.links
  FOR DELETE USING (user_id = auth.uid());

DROP POLICY IF EXISTS labels_owner_select ON public.labels;
CREATE POLICY labels_owner_select ON public.labels
  FOR SELECT USING (user_id = auth.uid());

DROP POLICY IF EXISTS labels_owner_insert ON public.labels;
CREATE POLICY labels_owner_insert ON public.labels
  FOR INSERT WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS labels_owner_update ON public.labels;
CREATE POLICY labels_owner_update ON public.labels
  FOR UPDATE USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS labels_owner_delete ON public.labels;
CREATE POLICY labels_owner_delete ON public.labels
  FOR DELETE USING (user_id = auth.uid());

-- The app always calls with a signed-in user's JWT (role `authenticated`).
GRANT SELECT, INSERT, UPDATE, DELETE ON public.links TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.labels TO authenticated;
