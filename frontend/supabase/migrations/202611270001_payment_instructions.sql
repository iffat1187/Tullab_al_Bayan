BEGIN;

-- Each stored method is published. Deleting a row removes that method from the portal.
CREATE TABLE public.payment_instructions (
  method text PRIMARY KEY CHECK (method IN ('bank', 'bkash')),
  bank_name text,
  branch_name text,
  account_name text,
  account_number text,
  routing_number text,
  mobile_number text,
  transfer_instruction text,
  reference_instruction text,
  cash_out_instruction text,
  CONSTRAINT payment_instructions_method_fields CHECK (
    (CASE method
      WHEN 'bank' THEN
        bank_name ~ '[^[:space:]]'
        AND branch_name ~ '[^[:space:]]'
        AND account_name ~ '[^[:space:]]'
        AND account_number ~ '[^[:space:]]'
        AND routing_number ~ '[^[:space:]]'
        AND num_nonnulls(mobile_number, transfer_instruction, reference_instruction, cash_out_instruction) = 0
      WHEN 'bkash' THEN
        mobile_number ~ '[^[:space:]]'
        AND transfer_instruction ~ '[^[:space:]]'
        AND reference_instruction ~ '[^[:space:]]'
        AND cash_out_instruction ~ '[^[:space:]]'
        AND num_nonnulls(bank_name, branch_name, account_name, account_number, routing_number) = 0
    END) IS TRUE
  )
);

INSERT INTO public.payment_instructions (method, bank_name, branch_name, account_name, account_number, routing_number)
VALUES ('bank', 'The City Bank PLC', 'Gulshan Avenue Branch', 'AL BAYAN INSTITUTE', '1781430000816', '225261732');

INSERT INTO public.payment_instructions (method, mobile_number, transfer_instruction, reference_instruction, cash_out_instruction)
VALUES ('bkash', '+8801701050904', 'Use the Send Money option.', 'Enter your full name and batch.',
        'Please include the cash-out charge when sending your payment.');

ALTER TABLE public.payment_instructions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.payment_instructions FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, DELETE ON public.payment_instructions TO authenticated;
GRANT UPDATE (
  bank_name, branch_name, account_name, account_number, routing_number,
  mobile_number, transfer_instruction, reference_instruction, cash_out_instruction
) ON public.payment_instructions TO authenticated;

CREATE POLICY payment_instructions_approved_read ON public.payment_instructions
  FOR SELECT TO authenticated
  USING ((SELECT public.current_user_role()) IN ('admin', 'teacher', 'student'));

CREATE POLICY payment_instructions_staff_insert ON public.payment_instructions
  FOR INSERT TO authenticated
  WITH CHECK ((SELECT public.current_user_role()) IN ('admin', 'teacher'));

CREATE POLICY payment_instructions_staff_update ON public.payment_instructions
  FOR UPDATE TO authenticated
  USING ((SELECT public.current_user_role()) IN ('admin', 'teacher'))
  WITH CHECK ((SELECT public.current_user_role()) IN ('admin', 'teacher'));

CREATE POLICY payment_instructions_staff_delete ON public.payment_instructions
  FOR DELETE TO authenticated
  USING ((SELECT public.current_user_role()) IN ('admin', 'teacher'));

COMMIT;
