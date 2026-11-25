-- Repeatable local Phase 1 -> Phase 2 backfill, RLS, grant & constraint verification script.
-- Run inside frontend/supabase/ against local Docker PostgreSQL:
--   psql -U postgres -d postgres -v ON_ERROR_STOP=1 -f scripts/verify_phase2_backfill_local.sql
-- Wrapped in BEGIN ... ROLLBACK so normal local seed state remains untouched.

BEGIN;

-- 1. Reset public schema objects inside this transaction to simulate clean Phase 1 state
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

-- 2. Apply untouched Phase 1 migration
\i migrations/202611200001_phase1_access.sql

-- 3. Seed mock auth users and Phase 1 records
INSERT INTO auth.users (
  id,
  instance_id,
  aud,
  role,
  email,
  raw_user_meta_data,
  created_at,
  updated_at
)
VALUES
  ('11111111-1111-4111-8111-111111111111', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'mock-admin-backfill@example.test',          '{"full_name": "Portal Admin"}'::jsonb,   now() - interval '10 days', now()),
  ('22222222-2222-4222-8222-222222222222', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'mock-teacher-backfill@example.test',        '{"full_name": "Demo Teacher"}'::jsonb,   now() - interval '9 days',  now()),
  ('33333333-3333-4333-8333-333333333333', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', '  Linked.Student.Backfill@Example.TEST ',     '{"full_name": "Linked Student"}'::jsonb, now() - interval '8 days',  now()),
  ('44444444-4444-4444-8444-444444444444', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'mock-dual-backfill@example.test',           '{"full_name": "Dual Role User"}'::jsonb, now() - interval '7 days',  now()),
  ('55555555-5555-4555-8555-555555555555', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'mock-pending-backfill@example.test',        '{"full_name": "Pending User"}'::jsonb,   now() - interval '6 days',  now());

INSERT INTO public.bayan_staff_access (user_id, role)
VALUES
  ('11111111-1111-4111-8111-111111111111', 'admin'),
  ('22222222-2222-4222-8222-222222222222', 'teacher'),
  ('44444444-4444-4444-8444-444444444444', 'teacher');

INSERT INTO public.bayan_student_profiles (student_id, user_id, full_name, batch)
VALUES
  (' SAT-101 ', '33333333-3333-4333-8333-333333333333', ' Linked Student ', 'Saturday'),
  ('SUN-201',   NULL,                                   'Unlinked Legacy',  'Sunday'),
  ('MON-301',   '44444444-4444-4444-8444-444444444444', 'Dual Role User',   'Monday');

-- 4. Run preflight audit & apply Phase 2 migrations
\i scripts/preflight_phase1_audit.sql
\i migrations/202611230001_phase2_core_and_backfill.sql
\i migrations/202611230002_homework.sql

-- 5. Verify backfill counts, normalized emails, role precedence, compatibility views,
--    archived table denial, batch column grants, Option A reactivation, homework rules, and RPCs
DO $$
DECLARE
  v_admin_uid   constant uuid := '11111111-1111-4111-8111-111111111111';
  v_teacher_uid constant uuid := '22222222-2222-4222-8222-222222222222';
  v_student_uid constant uuid := '33333333-3333-4333-8333-333333333333';
  v_dual_uid    constant uuid := '44444444-4444-4444-8444-444444444444';
  v_pending_uid constant uuid := '55555555-5555-4555-8555-555555555555';

  v_sat_student_id uuid;
  v_sun_student_id uuid;
  v_mon_student_id uuid;
  v_hw_id uuid;
  v_pub_at timestamptz;
  v_pub_by uuid;
  v_upd_at timestamptz;
  v_enrolled_at date;
  v_count bigint;
  v_text text;
  v_date date;
  v_ts timestamptz;
BEGIN
  -- A. Fixed 7 batches identity & backfill checks
  SELECT COUNT(*) INTO v_count
  FROM (VALUES
    (1::smallint, 'Saturday',  6::smallint, 1::smallint),
    (2::smallint, 'Sunday',    0::smallint, 2::smallint),
    (3::smallint, 'Monday',    1::smallint, 3::smallint),
    (4::smallint, 'Tuesday',   2::smallint, 4::smallint),
    (5::smallint, 'Wednesday', 3::smallint, 5::smallint),
    (6::smallint, 'Thursday',  4::smallint, 6::smallint),
    (7::smallint, 'Friday',    5::smallint, 7::smallint)
  ) AS expected(id, name, day_of_week, display_order)
  JOIN public.batches b
    ON b.id = expected.id
   AND b.name = expected.name
   AND b.day_of_week = expected.day_of_week
   AND b.display_order = expected.display_order;
  IF v_count <> 7 OR (SELECT COUNT(*) FROM public.batches) <> 7 THEN
    RAISE EXCEPTION 'Expected exact 7 weekday batches, matched=%', v_count;
  END IF;

  SELECT COUNT(*) INTO v_count FROM public.students;
  IF v_count <> 3 THEN
    RAISE EXCEPTION 'Expected 3 backfilled students, got %', v_count;
  END IF;

  SELECT id, email, batch_id, enrolled_at
    INTO v_sat_student_id, v_text, v_count, v_enrolled_at
  FROM public.students WHERE student_code = 'SAT-101';
  IF v_text <> 'linked.student.backfill@example.test' OR v_count <> 1 THEN
    RAISE EXCEPTION 'Linked student backfill mismatch: email=%, batch_id=%', v_text, v_count;
  END IF;

  SELECT id, email INTO v_sun_student_id, v_text
  FROM public.students WHERE student_code = 'SUN-201';
  IF v_text IS NOT NULL THEN
    RAISE EXCEPTION 'Expected NULL email for unlinked student, got %', v_text;
  END IF;

  SELECT id INTO v_mon_student_id
  FROM public.students WHERE student_code = 'MON-301';
  IF v_mon_student_id IS NULL THEN
    RAISE EXCEPTION 'Dual-role student profile MON-301 must still be preserved in students';
  END IF;

  SELECT role, student_id INTO v_text, v_hw_id
  FROM public.user_roles WHERE user_id = v_dual_uid;
  IF v_text <> 'teacher' OR v_hw_id IS NOT NULL THEN
    RAISE EXCEPTION 'Expected staff role precedence for dual-role user, got role=%, student_id=%', v_text, v_hw_id;
  END IF;

  -- B. Verify anon denial on all objects
  SET LOCAL ROLE anon;
  BEGIN
    PERFORM * FROM public.batches;
    RAISE EXCEPTION 'anon must not read batches';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    PERFORM * FROM public.bayan_staff_access;
    RAISE EXCEPTION 'anon must not read compatibility view bayan_staff_access';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    PERFORM * FROM public._archived_bayan_staff_access;
    RAISE EXCEPTION 'anon must not read archived staff table';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  RESET ROLE;

  -- C. Verify archived tables deny ALL authenticated roles (including Admin)
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claim.sub', v_admin_uid::text, true);
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_admin_uid, 'role', 'authenticated')::text, true);
  BEGIN
    PERFORM * FROM public._archived_bayan_staff_access;
    RAISE EXCEPTION 'admin must not read _archived_bayan_staff_access';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    PERFORM * FROM public._archived_bayan_student_profiles;
    RAISE EXCEPTION 'admin must not read _archived_bayan_student_profiles';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;

  -- D. Verify compatibility views + live RLS as Admin
  SELECT COUNT(*) INTO v_count FROM public.bayan_staff_access;
  IF v_count <> 3 THEN
    RAISE EXCEPTION 'Admin compatibility view bayan_staff_access expected 3 rows, got %', v_count;
  END IF;
  SELECT COUNT(*) INTO v_count FROM public.bayan_student_profiles;
  IF v_count <> 3 THEN
    RAISE EXCEPTION 'Admin compatibility view bayan_student_profiles expected 3 rows, got %', v_count;
  END IF;

  -- E. Verify batch column-level security as Admin
  UPDATE public.batches SET class_time = '16:30', venue = 'Room 102' WHERE id = 1;
  BEGIN
    UPDATE public.batches SET name = 'Mutated' WHERE id = 1;
    RAISE EXCEPTION 'Admin must not update batches.name';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    INSERT INTO public.batches (id, name, day_of_week, display_order) VALUES (8, 'Extra', 6, 8);
    RAISE EXCEPTION 'Admin must not insert into batches';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    DELETE FROM public.batches WHERE id = 1;
    RAISE EXCEPTION 'Admin must not delete from batches';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;

  -- F. Verify Admin pending user listing + link/unlink RPCs + negative link guards + homework creation
  SELECT COUNT(*) INTO v_count
  FROM public.list_pending_auth_users()
  WHERE user_id = v_pending_uid;
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'Expected mock pending auth user in list_pending_auth_users(), got %', v_count;
  END IF;
  BEGIN
    PERFORM public.link_student_account(v_sun_student_id, v_teacher_uid);
    RAISE EXCEPTION 'Must reject linking a staff user_id to a student';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  BEGIN
    PERFORM public.link_student_account(v_sat_student_id, v_pending_uid);
    RAISE EXCEPTION 'Must reject linking an already-linked student';
  EXCEPTION WHEN unique_violation THEN NULL;
  END;
  PERFORM public.link_student_account(v_sun_student_id, v_pending_uid);
  PERFORM public.unlink_student_account(v_sun_student_id);

  INSERT INTO public.homework_assignments (batch_id, title, instructions, deadline, published_by, published_at, updated_at)
  VALUES (
    1,
    '  Week 1 Homework  ',
    'Practice Lesson 1',
    (now() AT TIME ZONE 'Asia/Dhaka')::date + 2,
    v_admin_uid,
    now() - interval '1 day',
    now() - interval '1 day'
  )
  RETURNING id, published_at, published_by, updated_at INTO v_hw_id, v_pub_at, v_pub_by, v_upd_at;

  INSERT INTO public.homework_assignments (batch_id, title, instructions)
  VALUES (2, 'Sunday Homework', 'Read Lesson 2');

  -- Blank title / blank instructions / null batch / invalid batch guards
  BEGIN
    INSERT INTO public.homework_assignments (batch_id, title, instructions) VALUES (1, '   ', 'Valid');
    RAISE EXCEPTION 'Blank homework title must fail';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  BEGIN
    INSERT INTO public.homework_assignments (batch_id, title, instructions) VALUES (1, 'Valid', '   ');
    RAISE EXCEPTION 'Blank homework instructions must fail';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  BEGIN
    INSERT INTO public.homework_assignments (batch_id, title, instructions) VALUES (NULL, 'Valid', 'Valid');
    RAISE EXCEPTION 'NULL homework batch_id must fail';
  EXCEPTION WHEN not_null_violation THEN NULL;
  END;
  BEGIN
    INSERT INTO public.homework_assignments (batch_id, title, instructions) VALUES (8, 'Valid', 'Valid');
    RAISE EXCEPTION 'Invalid homework batch_id=8 must fail';
  EXCEPTION WHEN foreign_key_violation THEN NULL;
  END;

  -- G. Verify Teacher isolation + compatibility views + get_teacher_roster() + edit preserves published_at & published_by
  PERFORM set_config('request.jwt.claim.sub', v_teacher_uid::text, true);
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_teacher_uid, 'role', 'authenticated')::text, true);

  UPDATE public.homework_assignments
  SET title = 'Week 1 Homework Updated',
      published_by = v_teacher_uid,
      published_at = '2000-01-01T00:00:00Z',
      updated_at = '2000-01-01T00:00:00Z'
  WHERE id = v_hw_id;
  SELECT published_at, published_by, updated_at INTO v_ts, v_pub_by, v_upd_at
  FROM public.homework_assignments WHERE id = v_hw_id;
  IF v_ts <> v_pub_at OR v_pub_by <> v_admin_uid OR v_upd_at <= v_pub_at THEN
    RAISE EXCEPTION 'Homework edit must preserve published_at (%) and published_by (%) and advance updated_at (%)', v_ts, v_pub_by, v_upd_at;
  END IF;

  SELECT COUNT(*) INTO v_count FROM public.students;
  IF v_count <> 0 THEN
    RAISE EXCEPTION 'Teacher direct SELECT on students must return 0 rows, got %', v_count;
  END IF;
  BEGIN
    INSERT INTO public.students (student_code, full_name, email, batch_id) VALUES ('T-FAIL', 'Blocked', 't@example.com', 1);
    RAISE EXCEPTION 'Teacher must not insert into students';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    PERFORM * FROM public._archived_bayan_staff_access;
    RAISE EXCEPTION 'Teacher must not read _archived_bayan_staff_access';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  SELECT COUNT(*) INTO v_count FROM public.bayan_student_profiles;
  IF v_count <> 0 THEN
    RAISE EXCEPTION 'Teacher compatibility view bayan_student_profiles must return 0 rows, got %', v_count;
  END IF;
  SELECT COUNT(*) INTO v_count FROM public.bayan_staff_access;
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'Teacher compatibility view bayan_staff_access must return 1 own row, got %', v_count;
  END IF;
  SELECT COUNT(*) INTO v_count FROM public.get_teacher_roster();
  IF v_count <> 3 THEN
    RAISE EXCEPTION 'get_teacher_roster() expected 3 active rows, got %', v_count;
  END IF;
  UPDATE public.batches SET venue = 'Tampered' WHERE id = 1;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  IF v_count <> 0 THEN
    RAISE EXCEPTION 'Teacher must not update batches';
  END IF;
  BEGIN
    PERFORM * FROM public.list_pending_auth_users();
    RAISE EXCEPTION 'Teacher must not call list_pending_auth_users()';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    PERFORM public.link_student_account(v_sun_student_id, v_pending_uid);
    RAISE EXCEPTION 'Teacher must not call link_student_account()';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    PERFORM public.unlink_student_account(v_sat_student_id);
    RAISE EXCEPTION 'Teacher must not call unlink_student_account()';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;

  -- H. Verify Pending user sees 0 rows across every table and view and cannot call RPCs
  PERFORM set_config('request.jwt.claim.sub', v_pending_uid::text, true);
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_pending_uid, 'role', 'authenticated')::text, true);
  SELECT COUNT(*) INTO v_count FROM public.batches;
  IF v_count <> 0 THEN RAISE EXCEPTION 'Pending must see 0 batches'; END IF;
  SELECT COUNT(*) INTO v_count FROM public.students;
  IF v_count <> 0 THEN RAISE EXCEPTION 'Pending must see 0 students'; END IF;
  SELECT COUNT(*) INTO v_count FROM public.user_roles;
  IF v_count <> 0 THEN RAISE EXCEPTION 'Pending must see 0 user_roles'; END IF;
  SELECT COUNT(*) INTO v_count FROM public.homework_assignments;
  IF v_count <> 0 THEN RAISE EXCEPTION 'Pending must see 0 homework rows'; END IF;
  SELECT COUNT(*) INTO v_count FROM public.bayan_staff_access;
  IF v_count <> 0 THEN RAISE EXCEPTION 'Pending must see 0 bayan_staff_access view rows'; END IF;
  SELECT COUNT(*) INTO v_count FROM public.bayan_student_profiles;
  IF v_count <> 0 THEN RAISE EXCEPTION 'Pending must see 0 bayan_student_profiles view rows'; END IF;
  BEGIN
    PERFORM * FROM public._archived_bayan_student_profiles;
    RAISE EXCEPTION 'Pending must not read _archived_bayan_student_profiles';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    PERFORM * FROM public.get_teacher_roster();
    RAISE EXCEPTION 'Pending must not call get_teacher_roster()';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    PERFORM public.link_student_account(v_sun_student_id, v_pending_uid);
    RAISE EXCEPTION 'Pending must not call link_student_account()';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;

  -- I. Verify Active Student sees own batch homework & own profile only
  PERFORM set_config('request.jwt.claim.sub', v_student_uid::text, true);
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_student_uid, 'role', 'authenticated')::text, true);
  SELECT COUNT(*) INTO v_count FROM public.students;
  IF v_count <> 1 THEN RAISE EXCEPTION 'Active student must see only 1 student row (own), got %', v_count; END IF;
  SELECT COUNT(*) INTO v_count FROM public.students WHERE id = v_sat_student_id;
  IF v_count <> 1 THEN RAISE EXCEPTION 'Active student visible row must be own student UUID'; END IF;
  SELECT COUNT(*) INTO v_count FROM public.bayan_staff_access;
  IF v_count <> 0 THEN RAISE EXCEPTION 'Student must see 0 bayan_staff_access rows'; END IF;
  SELECT COUNT(*) INTO v_count FROM public.bayan_student_profiles;
  IF v_count <> 1 THEN RAISE EXCEPTION 'Student compatibility view must show only own row (1), got %', v_count; END IF;
  SELECT COUNT(*) INTO v_count FROM public.homework_assignments;
  IF v_count <> 1 THEN RAISE EXCEPTION 'Active Saturday student must see 1 Saturday homework row, got %', v_count; END IF;
  BEGIN
    INSERT INTO public.homework_assignments (batch_id, title, instructions) VALUES (1, 'Student Spoof', 'Blocked');
    RAISE EXCEPTION 'Student must not insert homework';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    PERFORM public.link_student_account(v_sun_student_id, v_pending_uid);
    RAISE EXCEPTION 'Student must not call link_student_account()';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    PERFORM * FROM public._archived_bayan_student_profiles;
    RAISE EXCEPTION 'Student must not read _archived_bayan_student_profiles';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;

  -- J. Verify Option A deactivation + reactivation & former student 0 homework rows
  PERFORM set_config('request.jwt.claim.sub', v_admin_uid::text, true);
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_admin_uid, 'role', 'authenticated')::text, true);
  UPDATE public.students
  SET is_active = false,
      batch_assigned_at = (now() AT TIME ZONE 'Asia/Dhaka')::date - 30
  WHERE id = v_sat_student_id;

  PERFORM set_config('request.jwt.claim.sub', v_student_uid::text, true);
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_student_uid, 'role', 'authenticated')::text, true);
  SELECT COUNT(*) INTO v_count FROM public.students;
  IF v_count <> 1 THEN RAISE EXCEPTION 'Former student must still read own profile'; END IF;
  SELECT COUNT(*) INTO v_count FROM public.homework_assignments;
  IF v_count <> 0 THEN RAISE EXCEPTION 'Former student must see 0 homework rows, got %', v_count; END IF;

  PERFORM set_config('request.jwt.claim.sub', v_admin_uid::text, true);
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_admin_uid, 'role', 'authenticated')::text, true);
  UPDATE public.students SET is_active = true WHERE id = v_sat_student_id;
  SELECT batch_assigned_at, deactivated_at, enrolled_at INTO v_date, v_ts, v_enrolled_at
  FROM public.students WHERE id = v_sat_student_id;
  IF v_date <> (now() AT TIME ZONE 'Asia/Dhaka')::date OR v_ts IS NOT NULL THEN
    RAISE EXCEPTION 'Option A reactivation failed: batch_assigned_at=%, deactivated_at=%', v_date, v_ts;
  END IF;
  SELECT COUNT(*) INTO v_count FROM public.students WHERE id = v_sat_student_id;
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'Reactivation must preserve original student UUID';
  END IF;

  RESET ROLE;
  RAISE NOTICE 'ALL PHASE 1 -> PHASE 2 BACKFILL, RLS, GRANT, HOMEWORK & REACTIVATION CHECKS PASSED.';
END;
$$;

ROLLBACK;
