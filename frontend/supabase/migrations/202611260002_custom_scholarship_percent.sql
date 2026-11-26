-- Custom scholarship percentages.
--
-- Scholarships were limited to 0%, 50% or 100%. Admins can now set any percentage from 0 to 100
-- with up to two decimal places (for example 43.3% or 12.75%), both as a student's default and
-- on each monthly tuition record.

BEGIN;

-- monthly_tuition: amount_due and display_status are generated from scholarship_percent, so they
-- are dropped and recreated (with the same expressions) around the type change.
ALTER TABLE public.monthly_tuition
  DROP CONSTRAINT chk_monthly_tuition_scholarship,
  DROP COLUMN amount_due,
  DROP COLUMN display_status;

ALTER TABLE public.monthly_tuition
  ALTER COLUMN scholarship_percent DROP DEFAULT,
  ALTER COLUMN scholarship_percent TYPE numeric(5, 2) USING scholarship_percent::numeric(5, 2),
  ALTER COLUMN scholarship_percent SET DEFAULT 0;

ALTER TABLE public.monthly_tuition
  ADD CONSTRAINT chk_monthly_tuition_scholarship CHECK (scholarship_percent BETWEEN 0 AND 100),
  ADD COLUMN amount_due numeric(10, 2) GENERATED ALWAYS AS (
    CASE WHEN scholarship_percent = 100 THEN 0.00
         WHEN base_fee IS NULL THEN NULL
         ELSE round(base_fee * (100 - scholarship_percent) / 100.0, 2) END
  ) STORED,
  ADD COLUMN display_status text GENERATED ALWAYS AS (
    CASE WHEN scholarship_percent = 100 THEN 'Covered by scholarship'
         WHEN base_fee IS NULL THEN 'Fee not set'
         WHEN round(base_fee * (100 - scholarship_percent) / 100.0, 2) = 0 THEN 'No amount due'
         ELSE payment_status END
  ) STORED;

-- students: default scholarship copied into each newly generated month.
ALTER TABLE public.students
  DROP CONSTRAINT chk_students_default_scholarship;

ALTER TABLE public.students
  ALTER COLUMN default_scholarship_percent DROP DEFAULT,
  ALTER COLUMN default_scholarship_percent TYPE numeric(5, 2) USING default_scholarship_percent::numeric(5, 2),
  ALTER COLUMN default_scholarship_percent SET DEFAULT 0;

ALTER TABLE public.students
  ADD CONSTRAINT chk_students_default_scholarship CHECK (default_scholarship_percent BETWEEN 0 AND 100);

-- CSV import: accept any percentage from 0 to 100 with up to two decimal places.
CREATE OR REPLACE FUNCTION public.import_students_csv(p_rows jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_row jsonb;
  v_index integer := 0;
  v_imported integer := 0;
  v_skipped integer := 0;
  v_errors jsonb := '[]'::jsonb;
  v_student_code text;
  v_full_name text;
  v_email text;
  v_batch_name text;
  v_batch_id smallint;
  v_fee numeric(10, 2);
  v_scholarship numeric(5, 2);
  v_scholarship_text text;
BEGIN
  IF public.current_user_role() IS DISTINCT FROM 'admin' THEN
    RAISE EXCEPTION 'Only admins can import students.' USING ERRCODE = '42501';
  END IF;
  IF p_rows IS NULL OR jsonb_typeof(p_rows) <> 'array' THEN
    RAISE EXCEPTION 'p_rows must be a JSON array.' USING ERRCODE = '22023';
  END IF;

  FOR v_row IN SELECT value FROM jsonb_array_elements(p_rows)
  LOOP
    v_index := v_index + 1;
    v_student_code := btrim(COALESCE(v_row->>'student_id', ''));
    v_full_name := btrim(COALESCE(v_row->>'full_name', ''));
    v_email := lower(btrim(COALESCE(v_row->>'email', '')));
    v_batch_name := btrim(COALESCE(v_row->>'batch', ''));
    v_batch_id := NULL;
    v_fee := NULL;
    v_scholarship := 0;

    BEGIN
      IF jsonb_typeof(v_row) <> 'object' THEN
        RAISE EXCEPTION 'Row must be an object.' USING ERRCODE = '22023';
      END IF;
      IF v_student_code = '' THEN RAISE EXCEPTION 'student_id is required.' USING ERRCODE = '22023'; END IF;
      IF v_full_name = '' THEN RAISE EXCEPTION 'full_name is required.' USING ERRCODE = '22023'; END IF;
      IF v_email = '' OR v_email ~ '\s' OR v_email !~ '^[^@]+@[^@]+\.[^@]+$' THEN
        RAISE EXCEPTION 'email must be a valid email address.' USING ERRCODE = '22023';
      END IF;

      SELECT b.id INTO v_batch_id FROM public.batches b WHERE lower(b.name) = lower(v_batch_name);
      IF v_batch_id IS NULL THEN
        RAISE EXCEPTION 'batch must be one of the seven weekday batch names.' USING ERRCODE = '22023';
      END IF;

      IF NULLIF(btrim(COALESCE(v_row->>'default_monthly_fee', '')), '') IS NOT NULL THEN
        v_fee := (v_row->>'default_monthly_fee')::numeric(10, 2);
        IF v_fee < 0 THEN RAISE EXCEPTION 'default_monthly_fee cannot be negative.' USING ERRCODE = '22023'; END IF;
      END IF;
      v_scholarship_text := rtrim(btrim(COALESCE(v_row->>'default_scholarship_percent', '')), '%');
      IF v_scholarship_text <> '' THEN
        IF v_scholarship_text !~ '^\d{1,3}(\.\d{1,2})?$' THEN
          RAISE EXCEPTION 'default_scholarship_percent must be a number from 0 to 100 with up to two decimal places.' USING ERRCODE = '22023';
        END IF;
        v_scholarship := v_scholarship_text::numeric(5, 2);
      END IF;
      IF v_scholarship < 0 OR v_scholarship > 100 THEN
        RAISE EXCEPTION 'default_scholarship_percent must be from 0 to 100.' USING ERRCODE = '22023';
      END IF;

      IF EXISTS (
        SELECT 1 FROM public.students s
        WHERE lower(btrim(s.student_code)) = lower(v_student_code)
           OR (s.email IS NOT NULL AND lower(btrim(s.email)) = v_email)
      ) THEN
        RAISE EXCEPTION 'Student ID or email already exists.' USING ERRCODE = '23505';
      END IF;

      INSERT INTO public.students (
        student_code, full_name, email, batch_id, default_monthly_fee, default_scholarship_percent
      ) VALUES (v_student_code, v_full_name, v_email, v_batch_id, v_fee, v_scholarship);
      v_imported := v_imported + 1;
    EXCEPTION WHEN OTHERS THEN
      v_skipped := v_skipped + 1;
      v_errors := v_errors || jsonb_build_array(jsonb_build_object(
        'row', v_index, 'student_id', NULLIF(v_student_code, ''), 'message', SQLERRM
      ));
    END;
  END LOOP;

  RETURN jsonb_build_object('imported_count', v_imported, 'skipped_count', v_skipped, 'errors', v_errors);
END;
$$;

REVOKE ALL ON FUNCTION public.import_students_csv(jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.import_students_csv(jsonb) TO authenticated;

COMMIT;
