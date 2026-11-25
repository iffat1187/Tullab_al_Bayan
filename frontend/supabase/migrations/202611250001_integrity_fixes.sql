-- Integrity fixes from the 2026-11-25 bug sweep.

-- 1. Tuition: a record with nothing payable (fee unset, 100% scholarship, or zero due) can
--    never be Paid. Previously the trigger only blocked *moving into* Paid, so a Paid row kept
--    payment_status = 'Paid' and paid_at after its scholarship was raised to 100%.
CREATE OR REPLACE FUNCTION public.validate_monthly_tuition_write()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  v_due numeric(10, 2);
BEGIN
  IF TG_OP = 'UPDATE' THEN NEW.batch_id := OLD.batch_id; END IF;
  v_due := CASE WHEN NEW.scholarship_percent = 100 THEN 0.00
                WHEN NEW.base_fee IS NULL THEN NULL
                ELSE round(NEW.base_fee * (100 - NEW.scholarship_percent) / 100.0, 2) END;

  IF NEW.payment_status = 'Paid' AND (v_due IS NULL OR v_due <= 0) THEN
    IF TG_OP = 'INSERT' OR OLD.payment_status IS DISTINCT FROM 'Paid' THEN
      RAISE EXCEPTION 'A tuition record can be marked Paid only when amount due is positive.' USING ERRCODE = '23514';
    END IF;
    -- Was Paid, but the fee/scholarship change removed the amount due: reset it.
    NEW.payment_status := 'Unpaid';
  END IF;

  IF NEW.payment_status = 'Paid' AND (TG_OP = 'INSERT' OR OLD.payment_status IS DISTINCT FROM 'Paid') THEN
    NEW.paid_at := now();
  ELSIF NEW.payment_status = 'Unpaid' THEN
    NEW.paid_at := NULL;
  END IF;
  NEW.updated_by := auth.uid();
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.validate_monthly_tuition_write() FROM PUBLIC, anon, authenticated;

-- Repair rows already left in that state.
UPDATE public.monthly_tuition
SET payment_status = 'Unpaid'
WHERE payment_status = 'Paid'
  AND (amount_due IS NULL OR amount_due <= 0);

-- 2. Homework: published_by is always the inserting user; clients cannot set someone else.
CREATE OR REPLACE FUNCTION public.protect_homework_publish_metadata()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  NEW.title := btrim(NEW.title);

  IF TG_OP = 'INSERT' THEN
    NEW.published_by := auth.uid();
    NEW.published_at := now();
  ELSE
    NEW.published_at := OLD.published_at;
    NEW.published_by := OLD.published_by;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.protect_homework_publish_metadata() FROM PUBLIC, anon, authenticated;

-- 3. Attendance: staff may only mark a student for sessions on/after the date the student
--    joined that batch, matching what the student is allowed to see.
CREATE OR REPLACE FUNCTION public.is_student_eligible_for_session(
  p_student_id uuid,
  p_session_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT
    COALESCE(public.current_user_role(), '') IN ('admin', 'teacher')
    AND EXISTS (
      SELECT 1
      FROM public.students s
      JOIN public.attendance_sessions sess
        ON sess.id = p_session_id
      WHERE s.id = p_student_id
        AND s.is_active = true
        AND s.batch_id = sess.batch_id
        AND sess.class_date >= greatest(s.enrolled_at, s.batch_assigned_at)
    );
$$;

REVOKE ALL ON FUNCTION public.is_student_eligible_for_session(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.is_student_eligible_for_session(uuid, uuid) TO authenticated;
