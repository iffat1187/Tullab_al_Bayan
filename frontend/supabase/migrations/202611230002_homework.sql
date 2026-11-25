-- Phase 2 Homework Assignments (strictly 1 batch per assignment, former students get 0 rows)

CREATE TABLE public.homework_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id smallint NOT NULL REFERENCES public.batches(id) ON DELETE RESTRICT,
  title text NOT NULL,
  instructions text NOT NULL,
  deadline date NULL,
  published_by uuid NULL REFERENCES auth.users(id) ON DELETE SET NULL DEFAULT auth.uid(),
  published_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT chk_homework_title_nonblank CHECK (btrim(title) <> ''),
  CONSTRAINT chk_homework_instructions_nonblank CHECK (btrim(instructions) <> '')
);

CREATE INDEX idx_homework_batch_deadline
  ON public.homework_assignments (batch_id, deadline ASC NULLS LAST, published_at DESC);

CREATE OR REPLACE FUNCTION public.protect_homework_publish_metadata()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  NEW.title := btrim(NEW.title);

  IF TG_OP = 'UPDATE' THEN
    NEW.published_at := OLD.published_at;
    NEW.published_by := OLD.published_by;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.protect_homework_publish_metadata()
  FROM PUBLIC, anon, authenticated;

CREATE TRIGGER trg_homework_protect_publish_metadata
  BEFORE INSERT OR UPDATE ON public.homework_assignments
  FOR EACH ROW
  EXECUTE FUNCTION public.protect_homework_publish_metadata();

CREATE TRIGGER trg_homework_set_updated_at
  BEFORE UPDATE ON public.homework_assignments
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.homework_assignments ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.homework_assignments FROM public, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.homework_assignments TO authenticated;

CREATE POLICY "Staff and active batch students read homework"
  ON public.homework_assignments
  FOR SELECT
  TO authenticated
  USING (
    (SELECT public.current_user_role()) IN ('admin', 'teacher')
    OR EXISTS (
      SELECT 1
      FROM public.students s
      WHERE s.id = (SELECT public.current_student_id())
        AND s.is_active = true
        AND s.batch_id = homework_assignments.batch_id
    )
  );

CREATE POLICY "Staff insert homework"
  ON public.homework_assignments
  FOR INSERT
  TO authenticated
  WITH CHECK ((SELECT public.current_user_role()) IN ('admin', 'teacher'));

CREATE POLICY "Staff update homework"
  ON public.homework_assignments
  FOR UPDATE
  TO authenticated
  USING ((SELECT public.current_user_role()) IN ('admin', 'teacher'))
  WITH CHECK ((SELECT public.current_user_role()) IN ('admin', 'teacher'));

CREATE POLICY "Staff delete homework"
  ON public.homework_assignments
  FOR DELETE
  TO authenticated
  USING ((SELECT public.current_user_role()) IN ('admin', 'teacher'));
