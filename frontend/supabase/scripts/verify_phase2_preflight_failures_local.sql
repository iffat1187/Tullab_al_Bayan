-- Repeatable local negative preflight test for 202611230001_phase2_core_and_backfill.sql.
-- Run inside frontend/supabase/ against local Docker PostgreSQL:
--   psql -U postgres -d postgres -v ON_ERROR_STOP=1 -f scripts/verify_phase2_preflight_failures_local.sql
-- Wrapped in BEGIN ... ROLLBACK so normal local seed state remains untouched.

BEGIN;

DROP VIEW IF EXISTS public.bayan_student_profiles CASCADE;
DROP VIEW IF EXISTS public.bayan_staff_access CASCADE;
DROP TABLE IF EXISTS public.homework_assignments CASCADE;
DROP TABLE IF EXISTS public.user_roles CASCADE;
DROP TABLE IF EXISTS public.students CASCADE;
DROP TABLE IF EXISTS public.batches CASCADE;
DROP TABLE IF EXISTS public._archived_bayan_student_profiles CASCADE;
DROP TABLE IF EXISTS public._archived_bayan_staff_access CASCADE;
DROP TABLE IF EXISTS public.bayan_student_profiles CASCADE;
DROP TABLE IF EXISTS public.bayan_staff_access CASCADE;

DROP FUNCTION IF EXISTS public.protect_homework_publish_metadata() CASCADE;
DROP FUNCTION IF EXISTS public.unlink_student_account(uuid) CASCADE;
DROP FUNCTION IF EXISTS public.link_student_account(uuid, uuid) CASCADE;
DROP FUNCTION IF EXISTS public.list_pending_auth_users() CASCADE;
DROP FUNCTION IF EXISTS public.get_teacher_roster() CASCADE;
DROP FUNCTION IF EXISTS public.is_active_student() CASCADE;
DROP FUNCTION IF EXISTS public.current_student_id() CASCADE;
DROP FUNCTION IF EXISTS public.current_user_role() CASCADE;
DROP FUNCTION IF EXISTS public.normalize_student_fields() CASCADE;
DROP FUNCTION IF EXISTS public.set_updated_at() CASCADE;

\i migrations/202611200001_phase1_access.sql
SAVEPOINT phase1_clean;

-- Case 1: Normalized duplicate student code ('SAT-101' vs ' sat-101 ')
INSERT INTO public.bayan_student_profiles (student_id, user_id, full_name, batch)
VALUES
  ('SAT-101',   NULL, 'First Student',     'Saturday'),
  (' sat-101 ', NULL, 'Duplicate Student', 'Saturday');

\set ON_ERROR_STOP 0
\i migrations/202611230001_phase2_core_and_backfill.sql
\if :ERROR
  ROLLBACK TO SAVEPOINT phase1_clean;
  \set ON_ERROR_STOP 1
\else
  \set ON_ERROR_STOP 1
  DO $$ BEGIN RAISE EXCEPTION 'Expected 202611230001 to fail on duplicate normalized student_code'; END $$;
\endif

-- Case 2: Invalid / unmatched batch name (simulate corrupted/unconstrained legacy batch)
ALTER TABLE public.bayan_student_profiles DROP CONSTRAINT IF EXISTS bayan_student_profiles_batch_check;
INSERT INTO public.bayan_student_profiles (student_id, user_id, full_name, batch)
VALUES ('SAT-901', NULL, 'Invalid Batch Student', 'NoSuchBatch');

\set ON_ERROR_STOP 0
\i migrations/202611230001_phase2_core_and_backfill.sql
\if :ERROR
  ROLLBACK TO SAVEPOINT phase1_clean;
  \set ON_ERROR_STOP 1
\else
  \set ON_ERROR_STOP 1
  DO $$ BEGIN RAISE EXCEPTION 'Expected 202611230001 to fail on invalid/unmatched batch name'; END $$;
\endif

-- Case 3: Blank full_name
INSERT INTO public.bayan_student_profiles (student_id, user_id, full_name, batch)
VALUES ('SAT-902', NULL, '   ', 'Saturday');

\set ON_ERROR_STOP 0
\i migrations/202611230001_phase2_core_and_backfill.sql
\if :ERROR
  ROLLBACK TO SAVEPOINT phase1_clean;
  \set ON_ERROR_STOP 1
\else
  \set ON_ERROR_STOP 1
  DO $$ BEGIN RAISE EXCEPTION 'Expected 202611230001 to fail on blank full_name'; END $$;
\endif

DO $$
BEGIN
  RAISE NOTICE 'ALL NEGATIVE PHASE 1 PREFLIGHT MIGRATION FAILURE CHECKS PASSED.';
END;
$$;

ROLLBACK;
