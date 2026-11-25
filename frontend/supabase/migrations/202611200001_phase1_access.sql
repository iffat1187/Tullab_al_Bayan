-- Apply on a Supabase project using the SQL editor or migrations.
-- Only trusted project operators can insert or modify access assignments.
create table public.bayan_staff_access (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role text not null check (role in ('admin', 'teacher'))
);

create table public.bayan_student_profiles (
  student_id text primary key,
  user_id uuid unique references auth.users(id) on delete set null,
  full_name text not null,
  batch text not null check (batch in ('Saturday', 'Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'))
);

alter table public.bayan_staff_access enable row level security;
alter table public.bayan_student_profiles enable row level security;

revoke all on public.bayan_staff_access, public.bayan_student_profiles from public, anon, authenticated;
grant select on public.bayan_staff_access, public.bayan_student_profiles to authenticated;

create policy "Read own staff assignment"
  on public.bayan_staff_access for select to authenticated
  using (user_id = (select auth.uid()));

create policy "Students read only their linked record"
  on public.bayan_student_profiles for select to authenticated
  using (user_id = (select auth.uid()));

create policy "Admins read institute roster"
  on public.bayan_student_profiles for select to authenticated
  using (exists (
    select 1 from public.bayan_staff_access
    where user_id = (select auth.uid()) and role = 'admin'
  ));
