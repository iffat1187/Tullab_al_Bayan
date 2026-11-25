-- Students added in Student Management could not sign in: saving their Google email on the
-- student record never created the user_roles link, so they stayed "pending" until an admin
-- linked them manually. claim_student_access() lets a signed-in user link themselves to the
-- single unlinked student record whose email matches their provider-verified email.

-- Gmail ignores dots and "+tag" in the local part, and googlemail.com == gmail.com, so
-- "Amina.Rahman+x@googlemail.com" and "aminarahman@gmail.com" are the same mailbox.
CREATE OR REPLACE FUNCTION public.canonical_email(p_email text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT CASE
    WHEN e IS NULL OR e = '' OR position('@' IN e) = 0 THEN NULLIF(e, '')
    WHEN split_part(e, '@', 2) IN ('gmail.com', 'googlemail.com') THEN
      replace(split_part(split_part(e, '@', 1), '+', 1), '.', '') || '@gmail.com'
    ELSE e
  END
  FROM (SELECT lower(btrim(p_email)) AS e) normalized;
$$;

CREATE OR REPLACE FUNCTION public.claim_student_access()
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_email text;
  v_student_id uuid;
  v_matches integer;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Sign in first.' USING ERRCODE = '42501';
  END IF;

  -- Already has a role (student or staff): nothing to claim.
  IF EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = v_uid) THEN
    RETURN NULL;
  END IF;

  -- Only an email verified by the provider (Google) may claim a student record.
  SELECT public.canonical_email(u.email) INTO v_email
  FROM auth.users u
  WHERE u.id = v_uid AND u.deleted_at IS NULL AND u.email_confirmed_at IS NOT NULL;
  IF v_email IS NULL THEN RETURN NULL; END IF;

  SELECT count(*), min(s.id::text)::uuid INTO v_matches, v_student_id
  FROM public.students s
  WHERE public.canonical_email(s.email) = v_email
    AND NOT EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.student_id = s.id);

  -- Zero matches: stay pending. Several (only possible via Gmail dot variants): ambiguous,
  -- leave it for an admin to link manually.
  IF v_matches <> 1 THEN RETURN NULL; END IF;

  PERFORM 1 FROM public.students s WHERE s.id = v_student_id FOR UPDATE;
  INSERT INTO public.user_roles (user_id, role, student_id)
  VALUES (v_uid, 'student', v_student_id)
  ON CONFLICT DO NOTHING;

  RETURN v_student_id;
END;
$$;

REVOKE ALL ON FUNCTION public.canonical_email(text), public.claim_student_access()
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_student_access() TO authenticated;
