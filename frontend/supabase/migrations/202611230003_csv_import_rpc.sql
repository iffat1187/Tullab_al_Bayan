-- Mostofa Days 2-4: validated Admin-only bulk roster import.
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
  v_scholarship smallint;
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
      IF NULLIF(btrim(COALESCE(v_row->>'default_scholarship_percent', '')), '') IS NOT NULL THEN
        v_scholarship := (v_row->>'default_scholarship_percent')::smallint;
      END IF;
      IF v_scholarship NOT IN (0, 50, 100) THEN
        RAISE EXCEPTION 'default_scholarship_percent must be 0, 50, or 100.' USING ERRCODE = '22023';
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
