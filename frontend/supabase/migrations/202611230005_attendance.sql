-- Mostofa Days 2-4: attendance sessions, marks, safe RPCs, and RLS.
CREATE TABLE public.attendance_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id smallint NOT NULL REFERENCES public.batches(id) ON DELETE RESTRICT,
  class_date date NOT NULL DEFAULT (now() AT TIME ZONE 'Asia/Dhaka')::date,
  class_type text NOT NULL CHECK (class_type IN ('Physical', 'Online')),
  session_no smallint NOT NULL CHECK (session_no > 0),
  created_by uuid NULL REFERENCES auth.users(id) ON DELETE SET NULL DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_attendance_session_number UNIQUE (batch_id, class_date, session_no)
);

CREATE TABLE public.attendance_marks (
  session_id uuid NOT NULL REFERENCES public.attendance_sessions(id) ON DELETE RESTRICT,
  student_id uuid NOT NULL REFERENCES public.students(id) ON DELETE RESTRICT,
  status text NOT NULL CHECK (status IN ('Present', 'Late', 'Sick', 'Absent')),
  marked_by uuid NULL REFERENCES auth.users(id) ON DELETE SET NULL DEFAULT auth.uid(),
  marked_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (session_id, student_id)
);

CREATE INDEX idx_sessions_date_batch ON public.attendance_sessions (class_date DESC, batch_id);
CREATE INDEX idx_marks_student ON public.attendance_marks (student_id, session_id);

CREATE OR REPLACE FUNCTION public.stamp_attendance_mark_actor()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  NEW.marked_by := auth.uid();
  IF TG_OP = 'INSERT' THEN
    NEW.marked_at := now();
  ELSE
    IF NEW.session_id IS DISTINCT FROM OLD.session_id
       OR NEW.student_id IS DISTINCT FROM OLD.student_id THEN
      RAISE EXCEPTION 'Cannot change session_id or student_id on an existing attendance mark.'
        USING ERRCODE = '42501';
    END IF;
    NEW.marked_at := OLD.marked_at;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_attendance_marks_actor BEFORE INSERT OR UPDATE ON public.attendance_marks
  FOR EACH ROW EXECUTE FUNCTION public.stamp_attendance_mark_actor();
CREATE TRIGGER trg_attendance_marks_updated_at BEFORE UPDATE ON public.attendance_marks
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

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
    );
$$;

CREATE OR REPLACE FUNCTION public.create_attendance_session(p_batch_id smallint, p_class_date date, p_class_type text)
RETURNS public.attendance_sessions
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE v_session public.attendance_sessions;
BEGIN
  IF COALESCE(public.current_user_role(), '') NOT IN ('admin', 'teacher') THEN
    RAISE EXCEPTION 'Only staff can create attendance sessions.' USING ERRCODE = '42501';
  END IF;
  IF p_class_date IS NULL OR p_class_type NOT IN ('Physical', 'Online') THEN
    RAISE EXCEPTION 'A valid class date and type are required.' USING ERRCODE = '22023';
  END IF;
  PERFORM 1 FROM public.batches b WHERE b.id = p_batch_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Batch not found.' USING ERRCODE = 'P0002'; END IF;
  INSERT INTO public.attendance_sessions (batch_id, class_date, class_type, session_no, created_by)
  SELECT p_batch_id, p_class_date, p_class_type, COALESCE(max(s.session_no), 0) + 1, auth.uid()
  FROM public.attendance_sessions s WHERE s.batch_id = p_batch_id AND s.class_date = p_class_date
  RETURNING * INTO v_session;
  RETURN v_session;
END;
$$;

CREATE OR REPLACE FUNCTION public.delete_empty_attendance_session(p_session_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF COALESCE(public.current_user_role(), '') NOT IN ('admin', 'teacher') THEN
    RAISE EXCEPTION 'Only staff can delete attendance sessions.' USING ERRCODE = '42501';
  END IF;
  IF p_session_id IS NULL THEN
    RAISE EXCEPTION 'Attendance session ID is required.' USING ERRCODE = '22023';
  END IF;
  PERFORM 1 FROM public.attendance_sessions s WHERE s.id = p_session_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Attendance session not found.' USING ERRCODE = 'P0002'; END IF;
  IF EXISTS (SELECT 1 FROM public.attendance_marks m WHERE m.session_id = p_session_id) THEN
    RAISE EXCEPTION 'Only an empty attendance session can be deleted.' USING ERRCODE = '23503';
  END IF;
  DELETE FROM public.attendance_sessions s WHERE s.id = p_session_id;
END;
$$;

REVOKE ALL ON FUNCTION
  public.stamp_attendance_mark_actor(),
  public.is_student_eligible_for_session(uuid, uuid),
  public.create_attendance_session(smallint, date, text),
  public.delete_empty_attendance_session(uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION
  public.is_student_eligible_for_session(uuid, uuid),
  public.create_attendance_session(smallint, date, text),
  public.delete_empty_attendance_session(uuid)
  TO authenticated;

ALTER TABLE public.attendance_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.attendance_marks ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.attendance_sessions, public.attendance_marks FROM public, anon, authenticated;
GRANT SELECT ON public.attendance_sessions TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.attendance_marks TO authenticated;

CREATE POLICY "Staff read attendance sessions" ON public.attendance_sessions FOR SELECT TO authenticated
  USING ((SELECT public.current_user_role()) IN ('admin', 'teacher'));
CREATE POLICY "Students read eligible attendance sessions" ON public.attendance_sessions FOR SELECT TO authenticated
  USING (
    (SELECT public.current_user_role()) = 'student'
    AND (
      EXISTS (
        SELECT 1
        FROM public.attendance_marks m
        WHERE m.session_id = attendance_sessions.id
          AND m.student_id = (SELECT public.current_student_id())
      )
      OR EXISTS (
        SELECT 1
        FROM public.students s
        WHERE s.id = (SELECT public.current_student_id())
          AND s.is_active = true
          AND s.batch_id = attendance_sessions.batch_id
          AND attendance_sessions.class_date >= greatest(s.enrolled_at, s.batch_assigned_at)
      )
    )
  );

CREATE POLICY "Staff read attendance marks" ON public.attendance_marks FOR SELECT TO authenticated
  USING ((SELECT public.current_user_role()) IN ('admin', 'teacher'));
CREATE POLICY "Students read own attendance marks" ON public.attendance_marks FOR SELECT TO authenticated
  USING (
    (SELECT public.current_user_role()) = 'student'
    AND student_id = (SELECT public.current_student_id())
  );
CREATE POLICY "Staff insert valid attendance marks" ON public.attendance_marks FOR INSERT TO authenticated
  WITH CHECK (
    (SELECT public.current_user_role()) IN ('admin', 'teacher')
    AND (SELECT public.is_student_eligible_for_session(attendance_marks.student_id, attendance_marks.session_id))
  );
CREATE POLICY "Staff update existing attendance marks" ON public.attendance_marks FOR UPDATE TO authenticated
  USING ((SELECT public.current_user_role()) IN ('admin', 'teacher'))
  WITH CHECK ((SELECT public.current_user_role()) IN ('admin', 'teacher'));
