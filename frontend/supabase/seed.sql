-- Local development seed data ONLY.
-- NEVER execute this file against Staging or Production.
-- Batches (1..7) are already seeded in 202611230001_phase2_core_and_backfill.sql.

INSERT INTO public.students (
  student_code,
  full_name,
  email,
  batch_id,
  default_monthly_fee,
  default_scholarship_percent,
  is_active,
  enrolled_at,
  batch_assigned_at,
  deactivated_at
)
VALUES
  ('SAT-001', 'Amina Rahman',   'amina.sat@example.com',   1, 1000.00, 0,   true,  (now() AT TIME ZONE 'Asia/Dhaka')::date - 30, (now() AT TIME ZONE 'Asia/Dhaka')::date - 30, NULL),
  ('SAT-002', 'Sumaiya Akter',  'sumaiya.sat@example.com', 1, 1000.00, 50,  true,  (now() AT TIME ZONE 'Asia/Dhaka')::date - 25, (now() AT TIME ZONE 'Asia/Dhaka')::date - 25, NULL),
  ('SUN-001', 'Nabila Chowdhury','nabila.sun@example.com', 2, 1000.00, 100, true,  (now() AT TIME ZONE 'Asia/Dhaka')::date - 20, (now() AT TIME ZONE 'Asia/Dhaka')::date - 20, NULL),
  ('MON-001', 'Afia Siddiqui',  'afia.mon@example.com',    3, 1200.00, 0,   true,  (now() AT TIME ZONE 'Asia/Dhaka')::date - 15, (now() AT TIME ZONE 'Asia/Dhaka')::date - 15, NULL),
  ('SAT-099', 'Former Student', 'former.sat@example.com',  1, 1000.00, 0,   false, (now() AT TIME ZONE 'Asia/Dhaka')::date - 90, (now() AT TIME ZONE 'Asia/Dhaka')::date - 90, now() - interval '14 days')
ON CONFLICT DO NOTHING;

INSERT INTO public.homework_assignments (batch_id, title, instructions, deadline)
SELECT 1, 'Arabic vocabulary practice', 'Review the vocabulary from Week 3 and write five sentences using the new words.', (now() AT TIME ZONE 'Asia/Dhaka')::date + 3
WHERE NOT EXISTS (
  SELECT 1 FROM public.homework_assignments
  WHERE batch_id = 1 AND title = 'Arabic vocabulary practice'
);

INSERT INTO public.homework_assignments (batch_id, title, instructions, deadline)
SELECT 1, 'Past-due reading comprehension', 'Read Lesson 2 aloud and answer questions 1 through 4 in your notebook.', (now() AT TIME ZONE 'Asia/Dhaka')::date - 2
WHERE NOT EXISTS (
  SELECT 1 FROM public.homework_assignments
  WHERE batch_id = 1 AND title = 'Past-due reading comprehension'
);

INSERT INTO public.homework_assignments (batch_id, title, instructions, deadline)
SELECT 2, 'Listening & dictation review', 'Listen to the assigned audio clip twice and transcribe the short dialogue.', NULL
WHERE NOT EXISTS (
  SELECT 1 FROM public.homework_assignments
  WHERE batch_id = 2 AND title = 'Listening & dictation review'
);
