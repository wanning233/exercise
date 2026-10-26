-- Run as administrator in the CloudBase PostgreSQL SQL editor.
DO LANGUAGE plpgsql $migration$
BEGIN

CREATE TABLE IF NOT EXISTS public.journals (
  owner_id varchar(64) PRIMARY KEY DEFAULT auth.uid(),
  payload jsonb NOT NULL,
  revision bigint NOT NULL CHECK (revision > 0),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.journal_versions (
  owner_id varchar(64) NOT NULL DEFAULT auth.uid(),
  revision bigint NOT NULL,
  payload jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (owner_id, revision)
);
ALTER TABLE public.journals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.journal_versions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.journals, public.journal_versions FROM anon, authenticated;
GRANT SELECT ON public.journals, public.journal_versions TO authenticated;
DROP POLICY IF EXISTS journal_read_own ON public.journals;
CREATE POLICY journal_read_own ON public.journals FOR SELECT TO authenticated USING (owner_id = auth.uid());
DROP POLICY IF EXISTS journal_versions_read_own ON public.journal_versions;
CREATE POLICY journal_versions_read_own ON public.journal_versions FOR SELECT TO authenticated USING (owner_id = auth.uid());

-- The only client write entry point. Compare-and-swap and history are one transaction.
CREATE OR REPLACE FUNCTION public.save_journal(p_payload jsonb, p_expected_revision bigint)
RETURNS TABLE (revision bigint, updated_at timestamptz)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  current_owner varchar(64) := auth.uid();
  current_revision bigint;
  next_revision bigint;
  saved_at timestamptz := now();
BEGIN
  IF current_owner IS NULL OR current_owner = '' THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;
  IF p_payload IS NULL OR p_payload->>'version' IS DISTINCT FROM '1'
    OR jsonb_typeof(p_payload->'days') IS DISTINCT FROM 'object'
    OR jsonb_typeof(p_payload->'notes') IS DISTINCT FROM 'array'
    OR jsonb_typeof(p_payload->'settings') IS DISTINCT FROM 'object'
    OR octet_length(p_payload::text) > 8388608 THEN
    RAISE EXCEPTION 'Invalid journal payload';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(current_owner, 0));
  SELECT j.revision INTO current_revision FROM public.journals j WHERE j.owner_id = current_owner;
  IF p_expected_revision IS DISTINCT FROM coalesce(current_revision, 0) THEN
    RAISE EXCEPTION 'JOURNAL_CONFLICT';
  END IF;
  next_revision := coalesce(current_revision, 0) + 1;
  INSERT INTO public.journals AS j (owner_id, payload, revision, updated_at)
    VALUES (current_owner, p_payload, next_revision, saved_at)
    ON CONFLICT (owner_id) DO UPDATE SET payload = excluded.payload, revision = excluded.revision, updated_at = excluded.updated_at;
  INSERT INTO public.journal_versions (owner_id, revision, payload, updated_at)
    VALUES (current_owner, next_revision, p_payload, saved_at);
  DELETE FROM public.journal_versions v WHERE v.owner_id = current_owner AND v.revision <= next_revision - 50;
  RETURN QUERY SELECT next_revision, saved_at;
END;
$$;
REVOKE ALL ON FUNCTION public.save_journal(jsonb, bigint) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_journal(jsonb, bigint) TO authenticated;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('meal-photos', 'meal-photos', false, 4000000, ARRAY['image/jpeg', 'image/png', 'image/webp'])
ON CONFLICT (id) DO NOTHING;
DROP POLICY IF EXISTS meal_photos_read ON storage.objects;
CREATE POLICY meal_photos_read ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'meal-photos' AND (storage.foldername(name))[1] = auth.uid());
DROP POLICY IF EXISTS meal_photos_insert ON storage.objects;
CREATE POLICY meal_photos_insert ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'meal-photos' AND (storage.foldername(name))[1] = auth.uid());
DROP POLICY IF EXISTS meal_photos_update ON storage.objects;
CREATE POLICY meal_photos_update ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'meal-photos' AND (storage.foldername(name))[1] = auth.uid())
  WITH CHECK (bucket_id = 'meal-photos' AND (storage.foldername(name))[1] = auth.uid());
-- Photos are immutable content-addressed objects. Keep them for history recovery.

NOTIFY pgrst, 'reload schema';
END;
$migration$;
