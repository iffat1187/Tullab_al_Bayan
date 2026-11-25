-- Mandatory read-only Phase 1 preflight audit before running 202611230001_phase2_core_and_backfill.sql.
-- Any non-zero finding in checks 1-4 MUST be resolved before running the Phase 2 migration.

-- 1. Missing or blank student_id or full_name
SELECT
  student_id,
  full_name,
  batch,
  user_id
FROM public.bayan_student_profiles
WHERE student_id IS NULL
   OR btrim(student_id) = ''
   OR full_name IS NULL
   OR btrim(full_name) = '';

-- 2. Duplicate normalized student codes (case-insensitive / trimmed)
SELECT
  lower(btrim(student_id)) AS normalized_student_code,
  COUNT(*) AS duplicate_count,
  array_agg(student_id ORDER BY student_id) AS raw_student_codes
FROM public.bayan_student_profiles
GROUP BY 1
HAVING COUNT(*) > 1;

-- 3. Invalid or unmatched batch names
SELECT
  student_id,
  full_name,
  batch
FROM public.bayan_student_profiles
WHERE batch IS NULL
   OR batch NOT IN (
     'Saturday', 'Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'
   );

-- 4a. Linked Phase 1 students whose auth.users email is missing or malformed
SELECT
  p.student_id,
  p.full_name,
  p.user_id,
  u.email
FROM public.bayan_student_profiles p
LEFT JOIN auth.users u ON u.id = p.user_id
WHERE p.user_id IS NOT NULL
  AND (
    u.id IS NULL
    OR (
      u.email IS NOT NULL
      AND btrim(u.email) <> ''
      AND (
        lower(btrim(u.email)) ~ '\s'
        OR lower(btrim(u.email)) !~ '^[^@]+@[^@]+\.[^@]+$'
      )
    )
  );

-- 4b. Duplicate normalized emails across linked Phase 1 students
SELECT
  lower(btrim(u.email)) AS normalized_email,
  COUNT(*) AS duplicate_count,
  array_agg(p.student_id ORDER BY p.student_id) AS student_codes
FROM public.bayan_student_profiles p
JOIN auth.users u ON u.id = p.user_id
WHERE p.user_id IS NOT NULL
  AND u.email IS NOT NULL
  AND btrim(u.email) <> ''
GROUP BY 1
HAVING COUNT(*) > 1;

-- 5. Dual-role users present in both bayan_staff_access and bayan_student_profiles
--    (Staff role takes precedence in public.user_roles; student row migrates unlinked.)
SELECT
  s.user_id,
  s.role AS staff_role,
  p.student_id,
  p.full_name,
  p.batch
FROM public.bayan_staff_access s
JOIN public.bayan_student_profiles p ON p.user_id = s.user_id;

-- 6. Unlinked Phase 1 students (will migrate with email = NULL until post-rollout Admin backfill)
SELECT
  student_id,
  full_name,
  batch
FROM public.bayan_student_profiles
WHERE user_id IS NULL
ORDER BY batch, student_id;

-- 7. Source record counts vs. expected migrated record counts
WITH counts AS (
  SELECT
    (SELECT COUNT(*) FROM public.bayan_staff_access) AS source_staff_count,
    (SELECT COUNT(*) FROM public.bayan_student_profiles) AS source_student_count,
    (SELECT COUNT(*) FROM public.bayan_student_profiles WHERE user_id IS NOT NULL) AS source_linked_student_count,
    (SELECT COUNT(*) FROM public.bayan_student_profiles WHERE user_id IS NULL) AS source_unlinked_student_count,
    (
      SELECT COUNT(*)
      FROM public.bayan_staff_access s
      JOIN public.bayan_student_profiles p ON p.user_id = s.user_id
    ) AS dual_role_overlap_count
)
SELECT
  source_staff_count,
  source_student_count,
  source_linked_student_count,
  source_unlinked_student_count,
  dual_role_overlap_count,
  source_student_count AS expected_students_count,
  source_staff_count + (source_linked_student_count - dual_role_overlap_count) AS expected_user_roles_count
FROM counts;
