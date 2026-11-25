BEGIN;

CREATE TABLE public.curriculum_skills (
  id text PRIMARY KEY CHECK (id IN ('speaking', 'writing', 'listening', 'reading')),
  description text NOT NULL CHECK (description ~ '[^[:space:]]')
);

INSERT INTO public.curriculum_skills (id, description) VALUES
  ('speaking', 'Practise everyday conversations and express ideas clearly in Arabic.'),
  ('writing', 'Write short sentences and paragraphs using course vocabulary and grammar.'),
  ('listening', 'Understand spoken dialogues and identify their main ideas.'),
  ('reading', 'Read short Arabic texts, understand their main ideas, and learn new vocabulary in context.');

ALTER TABLE public.curriculum_skills ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.curriculum_skills FROM PUBLIC, anon, authenticated;
GRANT SELECT, UPDATE (description) ON public.curriculum_skills TO authenticated;

CREATE POLICY curriculum_skills_approved_read ON public.curriculum_skills
  FOR SELECT TO authenticated
  USING ((SELECT public.current_user_role()) IN ('admin', 'teacher', 'student'));

CREATE POLICY curriculum_skills_admin_update ON public.curriculum_skills
  FOR UPDATE TO authenticated
  USING ((SELECT public.current_user_role()) = 'admin')
  WITH CHECK ((SELECT public.current_user_role()) = 'admin');

COMMIT;
