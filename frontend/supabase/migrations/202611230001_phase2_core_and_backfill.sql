-- Phase 2 Core Schema, Phase 1 Backfill, RPCs, RLS & Live-Backed Compatibility Views
-- Target: Supabase PostgreSQL (Asia/Dhaka Institute Dates, BDT Numeric)
-- Safe forward migration after 202611200001_phase1_access.sql.

-- 1. Fixed 7 weekday batches
CREATE TABLE public.batches (
  id smallint PRIMARY KEY,
  name text NOT NULL UNIQUE,
  day_of_week smallint NOT NULL UNIQUE,
  display_order smallint NOT NULL UNIQUE,
  class_time time NULL,
  venue text NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT chk_batches_venue_nonblank CHECK (venue IS NULL OR btrim(venue) <> ''),
  CONSTRAINT chk_batches_fixed_weekdays CHECK (
    (id = 1 AND name = 'Saturday'  AND day_of_week = 6 AND display_order = 1) OR
    (id = 2 AND name = 'Sunday'    AND day_of_week = 0 AND display_order = 2) OR
    (id = 3 AND name = 'Monday'    AND day_of_week = 1 AND display_order = 3) OR
    (id = 4 AND name = 'Tuesday'   AND day_of_week = 2 AND display_order = 4) OR
    (id = 5 AND name = 'Wednesday' AND day_of_week = 3 AND display_order = 5) OR
    (id = 6 AND name = 'Thursday'  AND day_of_week = 4 AND display_order = 6) OR
    (id = 7 AND name = 'Friday'    AND day_of_week = 5 AND display_order = 7)
  )
);

INSERT INTO public.batches (id, name, day_of_week, display_order)
VALUES
  (1, 'Saturday',  6, 1),
  (2, 'Sunday',    0, 2),
  (3, 'Monday',    1, 3),
  (4, 'Tuesday',   2, 4),
  (5, 'Wednesday', 3, 5),
  (6, 'Thursday',  4, 6),
  (7, 'Friday',    5, 7);

-- 2. Master student roster (immutable UUID PK; email temporarily nullable for unlinked legacy rows)
CREATE TABLE public.students (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_code text NOT NULL,
  full_name text NOT NULL,
  email text NULL,
  batch_id smallint NOT NULL REFERENCES public.batches(id) ON DELETE RESTRICT,
  default_monthly_fee numeric(10, 2) NULL,
  default_scholarship_percent smallint NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  enrolled_at date NOT NULL DEFAULT (now() AT TIME ZONE 'Asia/Dhaka')::date,
  batch_assigned_at date NOT NULL DEFAULT (now() AT TIME ZONE 'Asia/Dhaka')::date,
  deactivated_at timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT chk_students_code_nonblank CHECK (btrim(student_code) <> ''),
  CONSTRAINT chk_students_name_nonblank CHECK (btrim(full_name) <> ''),
  CONSTRAINT chk_students_email_format CHECK (
    email IS NULL OR (
      email = lower(btrim(email))
      AND email !~ '\s'
      AND email ~ '^[^@]+@[^@]+\.[^@]+$'
    )
  ),
  CONSTRAINT chk_students_default_fee_nonneg CHECK (default_monthly_fee IS NULL OR default_monthly_fee >= 0),
  CONSTRAINT chk_students_default_scholarship CHECK (default_scholarship_percent IN (0, 50, 100)),
  CONSTRAINT chk_students_active_deactivated CHECK (
    (is_active = true AND deactivated_at IS NULL)
    OR (is_active = false AND deactivated_at IS NOT NULL)
  )
);

CREATE UNIQUE INDEX uq_students_code_lower
  ON public.students (lower(btrim(student_code)));

CREATE UNIQUE INDEX uq_students_email_lower
  ON public.students (lower(btrim(email)))
  WHERE email IS NOT NULL;

CREATE INDEX idx_students_active_batch
  ON public.students (batch_id, full_name)
  WHERE is_active = true;

-- 3. Auth user role mapping & manual student linking
CREATE TABLE public.user_roles (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  role text NOT NULL,
  student_id uuid NULL UNIQUE REFERENCES public.students(id) ON DELETE RESTRICT,
  staff_code text NULL,
  full_name text NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT chk_user_roles_role CHECK (role IN ('admin', 'teacher', 'student')),
  CONSTRAINT chk_user_roles_staff_code_nonblank CHECK (staff_code IS NULL OR btrim(staff_code) <> ''),
  CONSTRAINT chk_user_roles_full_name_nonblank CHECK (full_name IS NULL OR btrim(full_name) <> ''),
  CONSTRAINT chk_user_roles_role_links CHECK (
    (role = 'student' AND student_id IS NOT NULL AND staff_code IS NULL)
    OR (role IN ('admin', 'teacher') AND student_id IS NULL)
  )
);

-- 4. Shared updated_at & student normalization triggers
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.normalize_student_fields()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  v_today date := (now() AT TIME ZONE 'Asia/Dhaka')::date;
BEGIN
  NEW.student_code := btrim(NEW.student_code);
  NEW.full_name := btrim(NEW.full_name);

  IF NEW.email IS NOT NULL THEN
    NEW.email := NULLIF(lower(btrim(NEW.email)), '');
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW.is_active = true THEN
      NEW.deactivated_at := NULL;
    ELSIF NEW.deactivated_at IS NULL THEN
      NEW.deactivated_at := now();
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.batch_id IS DISTINCT FROM OLD.batch_id THEN
    NEW.batch_assigned_at := v_today;
  END IF;

  -- Option A Reactivation: reset batch_assigned_at to today (Asia/Dhaka) so returning
  -- students are not marked Unrecorded for unmarked sessions during their inactive period,
  -- while preserving their immutable UUID and all historical attendance & tuition marks.
  IF OLD.is_active = false AND NEW.is_active = true THEN
    NEW.deactivated_at := NULL;
    NEW.batch_assigned_at := v_today;
  ELSIF NEW.is_active = true THEN
    NEW.deactivated_at := NULL;
  ELSIF NEW.is_active = false THEN
    NEW.deactivated_at := COALESCE(OLD.deactivated_at, NEW.deactivated_at, now());
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_batches_set_updated_at
  BEFORE UPDATE ON public.batches
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER trg_students_normalize
  BEFORE INSERT OR UPDATE ON public.students
  FOR EACH ROW
  EXECUTE FUNCTION public.normalize_student_fields();

CREATE TRIGGER trg_students_set_updated_at
  BEFORE UPDATE ON public.students
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER trg_user_roles_set_updated_at
  BEFORE UPDATE ON public.user_roles
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

-- 5. Preflight integrity guard + zero-loss backfill from Phase 1 tables
DO $$
DECLARE
  v_bad_count bigint;
  v_source_students bigint;
  v_migrated_students bigint;
  v_expected_roles bigint;
  v_migrated_roles bigint;
BEGIN
  SELECT COUNT(*) INTO v_bad_count
  FROM public.bayan_student_profiles
  WHERE student_id IS NULL
     OR btrim(student_id) = ''
     OR full_name IS NULL
     OR btrim(full_name) = '';
  IF v_bad_count > 0 THEN
    RAISE EXCEPTION 'Phase 1 preflight failed: % student profile row(s) have blank student_id or full_name.', v_bad_count;
  END IF;

  SELECT COUNT(*) INTO v_bad_count
  FROM (
    SELECT lower(btrim(student_id))
    FROM public.bayan_student_profiles
    GROUP BY 1
    HAVING COUNT(*) > 1
  ) dup_codes;
  IF v_bad_count > 0 THEN
    RAISE EXCEPTION 'Phase 1 preflight failed: % duplicate normalized student_id value(s) detected.', v_bad_count;
  END IF;

  SELECT COUNT(*) INTO v_bad_count
  FROM public.bayan_student_profiles p
  LEFT JOIN public.batches b ON b.name = p.batch
  WHERE b.id IS NULL;
  IF v_bad_count > 0 THEN
    RAISE EXCEPTION 'Phase 1 preflight failed: % student profile row(s) have invalid or unmatched batch names.', v_bad_count;
  END IF;

  SELECT COUNT(*) INTO v_bad_count
  FROM public.bayan_student_profiles p
  JOIN auth.users u ON u.id = p.user_id
  WHERE p.user_id IS NOT NULL
    AND u.email IS NOT NULL
    AND btrim(u.email) <> ''
    AND (
      lower(btrim(u.email)) ~ '\s'
      OR lower(btrim(u.email)) !~ '^[^@]+@[^@]+\.[^@]+$'
    );
  IF v_bad_count > 0 THEN
    RAISE EXCEPTION 'Phase 1 preflight failed: % linked student auth user(s) have invalid email format.', v_bad_count;
  END IF;

  SELECT COUNT(*) INTO v_bad_count
  FROM (
    SELECT lower(btrim(u.email))
    FROM public.bayan_student_profiles p
    JOIN auth.users u ON u.id = p.user_id
    WHERE p.user_id IS NOT NULL
      AND u.email IS NOT NULL
      AND btrim(u.email) <> ''
    GROUP BY 1
    HAVING COUNT(*) > 1
  ) dup_emails;
  IF v_bad_count > 0 THEN
    RAISE EXCEPTION 'Phase 1 preflight failed: % duplicate normalized email(s) across linked Phase 1 students.', v_bad_count;
  END IF;

  SELECT COUNT(*) INTO v_source_students FROM public.bayan_student_profiles;

  INSERT INTO public.students (student_code, full_name, email, batch_id)
  SELECT
    btrim(p.student_id),
    btrim(p.full_name),
    CASE
      WHEN p.user_id IS NOT NULL AND u.email IS NOT NULL AND btrim(u.email) <> ''
        THEN lower(btrim(u.email))
      ELSE NULL
    END,
    b.id
  FROM public.bayan_student_profiles p
  JOIN public.batches b ON b.name = p.batch
  LEFT JOIN auth.users u ON u.id = p.user_id;

  SELECT COUNT(*) INTO v_migrated_students FROM public.students;
  IF v_migrated_students <> v_source_students THEN
    RAISE EXCEPTION 'Phase 1 student backfill mismatch: expected %, migrated %.', v_source_students, v_migrated_students;
  END IF;

  -- Staff roles take precedence over student links for any dual-role user_id.
  INSERT INTO public.user_roles (user_id, role, student_id)
  SELECT s.user_id, s.role, NULL
  FROM public.bayan_staff_access s
  ON CONFLICT (user_id) DO NOTHING;

  INSERT INTO public.user_roles (user_id, role, student_id)
  SELECT p.user_id, 'student', st.id
  FROM public.bayan_student_profiles p
  JOIN public.students st
    ON lower(btrim(st.student_code)) = lower(btrim(p.student_id))
  WHERE p.user_id IS NOT NULL
  ON CONFLICT (user_id) DO NOTHING;

  SELECT
    (SELECT COUNT(*) FROM public.bayan_staff_access) +
    (
      SELECT COUNT(*)
      FROM public.bayan_student_profiles p
      WHERE p.user_id IS NOT NULL
        AND NOT EXISTS (
          SELECT 1 FROM public.bayan_staff_access s WHERE s.user_id = p.user_id
        )
    )
  INTO v_expected_roles;

  SELECT COUNT(*) INTO v_migrated_roles FROM public.user_roles;
  IF v_migrated_roles <> v_expected_roles THEN
    RAISE EXCEPTION 'Phase 1 user_roles backfill mismatch: expected %, migrated %.', v_expected_roles, v_migrated_roles;
  END IF;
END;
$$;

-- 6. Archive legacy Phase 1 tables with zero client access
ALTER TABLE public.bayan_staff_access RENAME TO _archived_bayan_staff_access;
ALTER TABLE public.bayan_student_profiles RENAME TO _archived_bayan_student_profiles;

DROP POLICY IF EXISTS "Read own staff assignment" ON public._archived_bayan_staff_access;
DROP POLICY IF EXISTS "Students read only their linked record" ON public._archived_bayan_student_profiles;
DROP POLICY IF EXISTS "Admins read institute roster" ON public._archived_bayan_student_profiles;

REVOKE ALL ON public._archived_bayan_staff_access, public._archived_bayan_student_profiles
  FROM public, anon, authenticated;

-- 7. Security-definer auth helpers & Admin/Teacher RPCs
CREATE OR REPLACE FUNCTION public.current_user_role()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT ur.role
  FROM public.user_roles ur
  WHERE ur.user_id = (SELECT auth.uid());
$$;

CREATE OR REPLACE FUNCTION public.current_student_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT ur.student_id
  FROM public.user_roles ur
  WHERE ur.user_id = (SELECT auth.uid())
    AND ur.role = 'student';
$$;

CREATE OR REPLACE FUNCTION public.is_active_student()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT COALESCE((
    SELECT s.is_active
    FROM public.user_roles ur
    JOIN public.students s ON s.id = ur.student_id
    WHERE ur.user_id = (SELECT auth.uid())
      AND ur.role = 'student'
  ), false);
$$;

CREATE OR REPLACE FUNCTION public.get_teacher_roster()
RETURNS TABLE (
  id uuid,
  student_code text,
  full_name text,
  batch_id smallint
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF COALESCE(public.current_user_role(), '') NOT IN ('admin', 'teacher') THEN
    RAISE EXCEPTION 'Only staff can access the teacher roster.' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT s.id, s.student_code, s.full_name, s.batch_id
  FROM public.students s
  WHERE s.is_active = true
  ORDER BY s.batch_id ASC, s.full_name ASC;
END;
$$;

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
    AND NOT EXISTS (
      SELECT 1
      FROM public.user_roles ur
      WHERE ur.user_id = u.id
    )
  ORDER BY u.created_at DESC;
END;
$$;

CREATE OR REPLACE FUNCTION public.link_student_account(
  p_student_id uuid,
  p_user_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_existing_role text;
BEGIN
  IF public.current_user_role() IS DISTINCT FROM 'admin' THEN
    RAISE EXCEPTION 'Only admins can link student accounts.' USING ERRCODE = '42501';
  END IF;

  IF p_student_id IS NULL OR p_user_id IS NULL THEN
    RAISE EXCEPTION 'Both student_id and user_id are required.' USING ERRCODE = '22023';
  END IF;

  PERFORM 1
  FROM public.students s
  WHERE s.id = p_student_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Student record not found.' USING ERRCODE = 'P0002';
  END IF;

  PERFORM 1
  FROM auth.users u
  WHERE u.id = p_user_id
    AND u.deleted_at IS NULL;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Auth user not found.' USING ERRCODE = 'P0002';
  END IF;

  SELECT ur.role INTO v_existing_role
  FROM public.user_roles ur
  WHERE ur.user_id = p_user_id;
  IF FOUND THEN
    IF v_existing_role IN ('admin', 'teacher') THEN
      RAISE EXCEPTION 'Cannot link a staff account to a student profile.' USING ERRCODE = '23514';
    END IF;
    RAISE EXCEPTION 'This auth account is already linked to a student.' USING ERRCODE = '23505';
  END IF;

  PERFORM 1
  FROM public.user_roles ur
  WHERE ur.student_id = p_student_id;
  IF FOUND THEN
    RAISE EXCEPTION 'This student profile is already linked to an auth account.' USING ERRCODE = '23505';
  END IF;

  INSERT INTO public.user_roles (user_id, role, student_id)
  VALUES (p_user_id, 'student', p_student_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.unlink_student_account(
  p_student_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF public.current_user_role() IS DISTINCT FROM 'admin' THEN
    RAISE EXCEPTION 'Only admins can unlink student accounts.' USING ERRCODE = '42501';
  END IF;

  IF p_student_id IS NULL THEN
    RAISE EXCEPTION 'student_id is required.' USING ERRCODE = '22023';
  END IF;

  PERFORM 1
  FROM public.students s
  WHERE s.id = p_student_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Student record not found.' USING ERRCODE = 'P0002';
  END IF;

  DELETE FROM public.user_roles
  WHERE role = 'student'
    AND student_id = p_student_id;
END;
$$;

REVOKE ALL ON FUNCTION
  public.set_updated_at(),
  public.normalize_student_fields(),
  public.current_user_role(),
  public.current_student_id(),
  public.is_active_student(),
  public.get_teacher_roster(),
  public.list_pending_auth_users(),
  public.link_student_account(uuid, uuid),
  public.unlink_student_account(uuid)
  FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION
  public.current_user_role(),
  public.current_student_id(),
  public.is_active_student(),
  public.get_teacher_roster(),
  public.list_pending_auth_users(),
  public.link_student_account(uuid, uuid),
  public.unlink_student_account(uuid)
  TO authenticated;

-- 8. Least-privilege table grants & Row Level Security
ALTER TABLE public.batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.students ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.batches, public.students, public.user_roles
  FROM public, anon, authenticated;

GRANT SELECT ON public.batches TO authenticated;
GRANT UPDATE (class_time, venue) ON public.batches TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.students TO authenticated;
GRANT SELECT ON public.user_roles TO authenticated;

CREATE POLICY "Authenticated approved roles read batches"
  ON public.batches
  FOR SELECT
  TO authenticated
  USING ((SELECT public.current_user_role()) IN ('admin', 'teacher', 'student'));

CREATE POLICY "Admins update batch schedule metadata"
  ON public.batches
  FOR UPDATE
  TO authenticated
  USING ((SELECT public.current_user_role()) = 'admin')
  WITH CHECK ((SELECT public.current_user_role()) = 'admin');

CREATE POLICY "Users read own role and admins read all"
  ON public.user_roles
  FOR SELECT
  TO authenticated
  USING (
    user_id = (SELECT auth.uid())
    OR (SELECT public.current_user_role()) = 'admin'
  );

CREATE POLICY "Admins and linked students read students"
  ON public.students
  FOR SELECT
  TO authenticated
  USING (
    (SELECT public.current_user_role()) = 'admin'
    OR id = (SELECT public.current_student_id())
  );

CREATE POLICY "Admins insert students"
  ON public.students
  FOR INSERT
  TO authenticated
  WITH CHECK ((SELECT public.current_user_role()) = 'admin');

CREATE POLICY "Admins update students"
  ON public.students
  FOR UPDATE
  TO authenticated
  USING ((SELECT public.current_user_role()) = 'admin')
  WITH CHECK ((SELECT public.current_user_role()) = 'admin');

-- 9. Temporary read-only security_invoker compatibility views over LIVE Phase 2 tables
--    (Dropped in 202611230006_finalize_legacy_cleanup.sql after frontend rollout.)
CREATE VIEW public.bayan_staff_access
WITH (security_invoker = true) AS
SELECT
  ur.user_id,
  ur.role
FROM public.user_roles ur
WHERE ur.role IN ('admin', 'teacher');

CREATE VIEW public.bayan_student_profiles
WITH (security_invoker = true) AS
SELECT
  s.student_code AS student_id,
  ur.user_id,
  s.full_name,
  b.name AS batch
FROM public.students s
JOIN public.batches b ON b.id = s.batch_id
LEFT JOIN public.user_roles ur
  ON ur.student_id = s.id
 AND ur.role = 'student';

REVOKE ALL ON public.bayan_staff_access, public.bayan_student_profiles
  FROM public, anon, authenticated;
GRANT SELECT ON public.bayan_staff_access, public.bayan_student_profiles
  TO authenticated;
