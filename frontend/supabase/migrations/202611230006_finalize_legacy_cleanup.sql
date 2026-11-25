-- Finalize Phase 1 -> Phase 2 cutover: drop the temporary read-only compatibility views
-- created in 202611230001_phase2_core_and_backfill.sql. No frontend code reads them.
-- The _archived_* tables are kept (no client access) as the zero-loss audit trail.
--
-- NOT included: students.email SET NOT NULL. That still needs an Admin email backfill for
-- unlinked legacy students; run it in a later migration once
--   SELECT count(*) FROM public.students WHERE email IS NULL;
-- returns 0.

DROP VIEW IF EXISTS public.bayan_staff_access;
DROP VIEW IF EXISTS public.bayan_student_profiles;
