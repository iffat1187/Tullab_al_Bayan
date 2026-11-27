BEGIN;

DROP POLICY payment_instructions_staff_insert ON public.payment_instructions;
DROP POLICY payment_instructions_staff_update ON public.payment_instructions;
DROP POLICY payment_instructions_staff_delete ON public.payment_instructions;

CREATE POLICY payment_instructions_admin_insert ON public.payment_instructions
  FOR INSERT TO authenticated
  WITH CHECK ((SELECT public.current_user_role()) = 'admin');

CREATE POLICY payment_instructions_admin_update ON public.payment_instructions
  FOR UPDATE TO authenticated
  USING ((SELECT public.current_user_role()) = 'admin')
  WITH CHECK ((SELECT public.current_user_role()) = 'admin');

CREATE POLICY payment_instructions_admin_delete ON public.payment_instructions
  FOR DELETE TO authenticated
  USING ((SELECT public.current_user_role()) = 'admin');

COMMIT;
