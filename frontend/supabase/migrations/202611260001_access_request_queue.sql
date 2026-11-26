-- Access request queue.
--
-- Until now, someone who signed in with Google but had no user_roles row only saw the
-- "Waiting for access" screen, and an admin had to add their email to a student record by hand
-- (or approve them in Teacher Management). Now every such sign-in files an access request that
-- admins review in one queue:
--   * approve as a new student (creates the student record and links the account in one step),
--   * link to an existing student record, or approve as a teacher (existing RPCs),
--   * decline (hides the account from every pending list until an admin restores it).
-- Adding students by email in Student Management keeps working exactly as before.

BEGIN;

CREATE TABLE public.access_requests (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email text NULL,
  full_name text NULL,
  status text NOT NULL DEFAULT 'pending',
  requested_at timestamptz NOT NULL DEFAULT now(),
  reviewed_by uuid NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  reviewed_at timestamptz NULL,
  approved_role text NULL,
  CONSTRAINT chk_access_requests_status CHECK (status IN ('pending', 'approved', 'rejected')),
  CONSTRAINT chk_access_requests_approved_role CHECK (
    (status = 'approved') = (approved_role IS NOT NULL)
    AND (approved_role IS NULL OR approved_role IN ('admin', 'teacher', 'student'))
  )
);

CREATE INDEX idx_access_requests_status_requested
  ON public.access_requests (status, requested_at DESC);

-- Only SECURITY DEFINER RPCs below read or write this table.
ALTER TABLE public.access_requests ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.access_requests FROM PUBLIC, anon, authenticated;

-- Backfill: everyone already waiting on the pending screen joins the queue.
INSERT INTO public.access_requests (user_id, email, full_name, requested_at)
SELECT
  u.id,
  u.email::text,
  NULLIF(btrim(COALESCE(u.raw_user_meta_data ->> 'full_name', u.raw_user_meta_data ->> 'name', '')), ''),
  COALESCE(u.last_sign_in_at, u.created_at)
FROM auth.users u
WHERE u.deleted_at IS NULL
  AND NOT EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = u.id)
ON CONFLICT (user_id) DO NOTHING;

-- Any role assignment (manual link, email auto-link, teacher approval, approval from the queue)
-- closes that account's request.
CREATE FUNCTION public.close_access_request_on_role()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  UPDATE public.access_requests
  SET status = 'approved',
      approved_role = NEW.role,
      -- A student auto-linking themselves by email has no reviewer.
      reviewed_by = NULLIF(auth.uid(), NEW.user_id),
      reviewed_at = now()
  WHERE user_id = NEW.user_id;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_user_roles_close_access_request
  AFTER INSERT ON public.user_roles
  FOR EACH ROW EXECUTE FUNCTION public.close_access_request_on_role();

-- Called by a signed-in user who has no role. Files (or refreshes) their request and returns its
-- status: 'pending' or 'rejected'. Returns 'approved' when the user already has a role.
CREATE FUNCTION public.request_access()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_email text;
  v_name text;
  v_status text;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Sign in first.' USING ERRCODE = '42501';
  END IF;

  IF EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = v_uid) THEN
    RETURN 'approved';
  END IF;

  SELECT u.email::text,
         NULLIF(btrim(COALESCE(u.raw_user_meta_data ->> 'full_name', u.raw_user_meta_data ->> 'name', '')), '')
  INTO v_email, v_name
  FROM auth.users u
  WHERE u.id = v_uid AND u.deleted_at IS NULL;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Auth user not found.' USING ERRCODE = 'P0002';
  END IF;

  INSERT INTO public.access_requests AS ar (user_id, email, full_name)
  VALUES (v_uid, v_email, v_name)
  ON CONFLICT (user_id) DO UPDATE SET
    email = EXCLUDED.email,
    full_name = EXCLUDED.full_name,
    -- An approved account whose role was later removed asks again; a declined one stays declined.
    status = CASE WHEN ar.status = 'approved' THEN 'pending' ELSE ar.status END,
    approved_role = CASE WHEN ar.status = 'approved' THEN NULL ELSE ar.approved_role END,
    requested_at = CASE WHEN ar.status = 'approved' THEN now() ELSE ar.requested_at END,
    reviewed_by = CASE WHEN ar.status = 'approved' THEN NULL ELSE ar.reviewed_by END,
    reviewed_at = CASE WHEN ar.status = 'approved' THEN NULL ELSE ar.reviewed_at END
  RETURNING ar.status INTO v_status;

  RETURN v_status;
END;
$$;

CREATE FUNCTION public.list_access_requests(p_status text DEFAULT 'pending')
RETURNS TABLE (
  user_id uuid,
  email text,
  full_name text,
  status text,
  requested_at timestamptz,
  reviewed_at timestamptz,
  has_google_identity boolean
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF public.current_user_role() IS DISTINCT FROM 'admin' THEN
    RAISE EXCEPTION 'Only admins can list access requests.' USING ERRCODE = '42501';
  END IF;
  IF p_status IS NULL OR p_status NOT IN ('pending', 'rejected') THEN
    RAISE EXCEPTION 'Status must be pending or rejected.' USING ERRCODE = '22023';
  END IF;

  RETURN QUERY
  SELECT
    ar.user_id,
    COALESCE(u.email::text, ar.email),
    ar.full_name,
    ar.status,
    ar.requested_at,
    ar.reviewed_at,
    (u.email_confirmed_at IS NOT NULL
      AND EXISTS (SELECT 1 FROM auth.identities i WHERE i.user_id = u.id AND i.provider = 'google'))
  FROM public.access_requests ar
  JOIN auth.users u ON u.id = ar.user_id AND u.deleted_at IS NULL
  WHERE ar.status = p_status
    AND NOT EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = ar.user_id)
  ORDER BY ar.requested_at DESC;
END;
$$;

-- Creates a student record from a request and links the account to it, atomically.
CREATE FUNCTION public.approve_access_request_as_student(
  p_user_id uuid,
  p_student_code text,
  p_full_name text,
  p_batch_id smallint,
  p_default_monthly_fee numeric DEFAULT NULL,
  p_default_scholarship_percent smallint DEFAULT 0
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_email text;
  v_student_id uuid;
BEGIN
  IF public.current_user_role() IS DISTINCT FROM 'admin' THEN
    RAISE EXCEPTION 'Only admins can approve access requests.' USING ERRCODE = '42501';
  END IF;
  IF p_user_id IS NULL OR NULLIF(btrim(p_student_code), '') IS NULL
     OR NULLIF(btrim(p_full_name), '') IS NULL OR p_batch_id IS NULL THEN
    RAISE EXCEPTION 'Account, student ID, full name and batch are required.' USING ERRCODE = '22023';
  END IF;

  SELECT lower(btrim(u.email::text)) INTO v_email
  FROM auth.users u
  WHERE u.id = p_user_id AND u.deleted_at IS NULL AND u.email_confirmed_at IS NOT NULL
  FOR UPDATE;
  IF NOT FOUND OR v_email IS NULL THEN
    RAISE EXCEPTION 'The account must sign in with a verified email first.' USING ERRCODE = 'P0002';
  END IF;

  IF EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = p_user_id) THEN
    RAISE EXCEPTION 'This account already has institute access. Refresh the list.' USING ERRCODE = '23514';
  END IF;

  -- Unique indexes reject a duplicate student ID or email with 23505.
  INSERT INTO public.students (student_code, full_name, email, batch_id, default_monthly_fee, default_scholarship_percent)
  VALUES (btrim(p_student_code), btrim(p_full_name), v_email, p_batch_id, p_default_monthly_fee,
          COALESCE(p_default_scholarship_percent, 0))
  RETURNING id INTO v_student_id;

  INSERT INTO public.user_roles (user_id, role, student_id)
  VALUES (p_user_id, 'student', v_student_id);

  RETURN v_student_id;
END;
$$;

CREATE FUNCTION public.reject_access_request(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF public.current_user_role() IS DISTINCT FROM 'admin' THEN
    RAISE EXCEPTION 'Only admins can decline access requests.' USING ERRCODE = '42501';
  END IF;

  UPDATE public.access_requests ar
  SET status = 'rejected', reviewed_by = auth.uid(), reviewed_at = now()
  WHERE ar.user_id = p_user_id
    AND ar.status = 'pending'
    AND NOT EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = ar.user_id);
  IF NOT FOUND THEN
    RAISE EXCEPTION 'This request is no longer waiting. Refresh the list.' USING ERRCODE = 'P0002';
  END IF;
END;
$$;

CREATE FUNCTION public.restore_access_request(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF public.current_user_role() IS DISTINCT FROM 'admin' THEN
    RAISE EXCEPTION 'Only admins can restore access requests.' USING ERRCODE = '42501';
  END IF;

  UPDATE public.access_requests
  SET status = 'pending', reviewed_by = NULL, reviewed_at = NULL
  WHERE user_id = p_user_id AND status = 'rejected';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'This request is not declined. Refresh the list.' USING ERRCODE = 'P0002';
  END IF;
END;
$$;

-- Declined accounts no longer appear in Student or Teacher Management pending lists.
CREATE OR REPLACE FUNCTION public.list_pending_auth_users()
RETURNS TABLE (
  user_id uuid,
  email text,
  full_name text,
  created_at timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF public.current_user_role() IS DISTINCT FROM 'admin' THEN
    RAISE EXCEPTION 'Only admins can list pending auth users.' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT
    u.id AS user_id,
    u.email::text AS email,
    NULLIF(btrim(COALESCE(
      u.raw_user_meta_data ->> 'full_name',
      u.raw_user_meta_data ->> 'name',
      ''
    )), '') AS full_name,
    u.created_at
  FROM auth.users u
  WHERE u.deleted_at IS NULL
    AND NOT EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = u.id)
    AND NOT EXISTS (
      SELECT 1 FROM public.access_requests ar
      WHERE ar.user_id = u.id AND ar.status = 'rejected'
    )
  ORDER BY u.created_at DESC;
END;
$$;

REVOKE ALL ON FUNCTION
  public.close_access_request_on_role(),
  public.request_access(),
  public.list_access_requests(text),
  public.approve_access_request_as_student(uuid, text, text, smallint, numeric, smallint),
  public.reject_access_request(uuid),
  public.restore_access_request(uuid)
  FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION
  public.request_access(),
  public.list_access_requests(text),
  public.approve_access_request_as_student(uuid, text, text, smallint, numeric, smallint),
  public.reject_access_request(uuid),
  public.restore_access_request(uuid)
  TO authenticated;

COMMIT;
