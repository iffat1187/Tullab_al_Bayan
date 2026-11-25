-- Mostofa Days 2-4: monthly tuition snapshots, validation, generation, and RLS.
CREATE TABLE public.monthly_tuition (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid NOT NULL REFERENCES public.students(id) ON DELETE RESTRICT,
  batch_id smallint NOT NULL REFERENCES public.batches(id) ON DELETE RESTRICT,
  billing_month date NOT NULL,
  base_fee numeric(10, 2) NULL,
  scholarship_percent smallint NOT NULL DEFAULT 0,
  amount_due numeric(10, 2) GENERATED ALWAYS AS (
    CASE WHEN scholarship_percent = 100 THEN 0.00
         WHEN base_fee IS NULL THEN NULL
         ELSE round(base_fee * (100 - scholarship_percent) / 100.0, 2) END
  ) STORED,
  payment_status text NOT NULL DEFAULT 'Unpaid',
  display_status text GENERATED ALWAYS AS (
    CASE WHEN scholarship_percent = 100 THEN 'Covered by scholarship'
         WHEN base_fee IS NULL THEN 'Fee not set'
         WHEN round(base_fee * (100 - scholarship_percent) / 100.0, 2) = 0 THEN 'No amount due'
         ELSE payment_status END
  ) STORED,
  paid_at timestamptz NULL,
  notes text NULL,
  updated_by uuid NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_monthly_tuition_student_month UNIQUE (student_id, billing_month),
  CONSTRAINT chk_monthly_tuition_month_start CHECK (extract(day FROM billing_month) = 1),
  CONSTRAINT chk_monthly_tuition_fee CHECK (base_fee IS NULL OR base_fee >= 0),
  CONSTRAINT chk_monthly_tuition_scholarship CHECK (scholarship_percent IN (0, 50, 100)),
  CONSTRAINT chk_monthly_tuition_payment CHECK (payment_status IN ('Paid', 'Unpaid')),
  CONSTRAINT chk_monthly_tuition_notes CHECK (notes IS NULL OR btrim(notes) <> '')
);

CREATE INDEX idx_tuition_month_batch ON public.monthly_tuition (billing_month DESC, batch_id);

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
  IF NEW.payment_status = 'Paid'
     AND (TG_OP = 'INSERT' OR OLD.payment_status IS DISTINCT FROM 'Paid')
     AND (v_due IS NULL OR v_due <= 0) THEN
    RAISE EXCEPTION 'A tuition record can be marked Paid only when amount due is positive.' USING ERRCODE = '23514';
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

CREATE TRIGGER trg_monthly_tuition_validate
  BEFORE INSERT OR UPDATE ON public.monthly_tuition
  FOR EACH ROW EXECUTE FUNCTION public.validate_monthly_tuition_write();
CREATE TRIGGER trg_monthly_tuition_updated_at
  BEFORE UPDATE ON public.monthly_tuition
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE OR REPLACE FUNCTION public.generate_monthly_tuition(p_billing_month date, p_batch_id smallint DEFAULT NULL)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE v_count integer;
BEGIN
  IF public.current_user_role() IS DISTINCT FROM 'admin' THEN
    RAISE EXCEPTION 'Only admins can generate monthly tuition.' USING ERRCODE = '42501';
  END IF;
  IF p_billing_month IS NULL OR extract(day FROM p_billing_month) <> 1 THEN
    RAISE EXCEPTION 'billing_month must be the first day of a month.' USING ERRCODE = '22023';
  END IF;
  IF p_batch_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.batches b WHERE b.id = p_batch_id) THEN
    RAISE EXCEPTION 'Batch not found.' USING ERRCODE = '22023';
  END IF;
  INSERT INTO public.monthly_tuition (student_id, batch_id, billing_month, base_fee, scholarship_percent, updated_by)
  SELECT s.id, s.batch_id, p_billing_month, s.default_monthly_fee, s.default_scholarship_percent, auth.uid()
  FROM public.students s
  WHERE s.is_active = true AND (p_batch_id IS NULL OR s.batch_id = p_batch_id)
  ON CONFLICT (student_id, billing_month) DO NOTHING;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.validate_monthly_tuition_write(), public.generate_monthly_tuition(date, smallint)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.generate_monthly_tuition(date, smallint) TO authenticated;

ALTER TABLE public.monthly_tuition ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.monthly_tuition FROM public, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.monthly_tuition TO authenticated;

CREATE POLICY "Admins manage monthly tuition" ON public.monthly_tuition
  FOR ALL TO authenticated
  USING ((SELECT public.current_user_role()) = 'admin')
  WITH CHECK ((SELECT public.current_user_role()) = 'admin');
CREATE POLICY "Students read own monthly tuition" ON public.monthly_tuition
  FOR SELECT TO authenticated
  USING (student_id = (SELECT public.current_student_id()));
