# Ṭullāb al-Bayān — Day 1 Foundation & Developer Handoff Guide

- **Branch:** `feat/supabase-cli-auth-homework`
- **Day 1 Owner:** Pramit Datta (`Celestial-Pramit`)
- **Last Updated:** 23 November 2026

---

## Current Project Status

- **Stage:** Day 1 Foundation (`Supabase CLI`, Phase 2 core + backfill, Auth shell, Batches, Homework) implemented and verified locally at the SQL and PostgREST/repository API layers. **Not production-ready** — Days 2–5 modules, browser UI QA, Google OAuth redirect verification, and Staging/Production rollouts remain pending.
- **Local Infrastructure:** Docker Desktop + WSL2 configured and running; local Supabase running (`http://127.0.0.1:54321` API gateway, `127.0.0.1:54322` PostgreSQL, database container `supabase_db_tullab-al-bayan`).
- **Migrations & Seed:** `202611200001_phase1_access.sql`, `202611230001_phase2_core_and_backfill.sql`, `202611230002_homework.sql`, and `frontend/supabase/seed.sql` applied cleanly via `npx --yes supabase@3.2.0 db reset`.
- **Stage 1 SQL QA:** All 3 repository verification scripts (`preflight_phase1_audit.sql`, `verify_phase2_backfill_local.sql`, `verify_phase2_preflight_failures_local.sql`) plus 5 additional rollback-only SQL test groups **PASSED**.
- **Stage 2 API & Repository QA:** Live GoTrue + PostgREST tests across `Admin`, `Teacher`, `Active Student`, `Former Student`, `Pending User`, and `Anonymous` covering `loadProfile`, `listBatches`, `listActiveRosterForRole`, `listHomework`, `saveHomework`, `deleteHomework`, and Admin link/unlink RPCs **PASSED**.
- **Build & Cleanup:** `npm run build` **PASSED**; all temporary QA records and scratch files were cleaned up and baseline DB counts restored (`7` batches, `5` students, `0` `user_roles`, `3` `homework_assignments`, `0` `auth.users`).
- **Generated Types:** `frontend/src/types/database.types.ts` generated from local Supabase (`127.0.0.1:54322`) via `npx --yes supabase@3.2.0 gen types typescript --local` (UTF-8 without BOM), verified for Day 1 `public` tables, compatibility views, and RPCs.
- **PENDING Tasks:** Application-wide TypeScript type integration (generated `frontend/src/types/database.types.ts` exists on disk but is not yet imported into frontend repositories/components), interactive browser UI testing, Google OAuth browser redirect verification, optional zero-row unauthorized delete detection in `homeworkRepository.deleteHomework()`, and Days 2–5 feature work.

---

## Mandatory Instructions for AI Coding Agents

Before modifying anything in this repository, an AI coding agent MUST:

1. Read `docs/DAY1_FOUNDATION_HANDOFF.md`.
2. Read `docs/DATABASE_DESIGN.md`.
3. Inspect the actual project structure (`frontend/src/`, `frontend/supabase/`).
4. Inspect migration files and existing implementation directly.
5. Compare documented status against actual repository state.
6. Identify completed work, pending work, and known limitations.
7. Avoid reimplementing existing features.
8. Ask for clarification before making architectural changes or destructive operations.

> **Authority Rule:** Treat documentation as a starting reference, not unquestionable truth. Actual source code and database migrations remain authoritative.

---

## 1. Project Overview & Technology Stack

- **Purpose:** Student Management System for Al Bayan Institute (`Ṭullāb al-Bayān`), scoped cleanly for ~200 students, 1 institute, `Asia/Dhaka` calendar dates, and `BDT` decimal currency without unnecessary enterprise abstractions.
- **Technology Stack:**
  - **Frontend:** React 19, Vite 7, Tailwind CSS v4, React Router v7, Lucide React (`frontend/`).
  - **Backend & Database:** Supabase (`@supabase/supabase-js ^2.119.2`), PostgreSQL 15, PostgREST, GoTrue Auth (Google OAuth PKCE in live deployment).
  - **Local CLI & Containers:** `npx --yes supabase@3.2.0`, Docker Desktop + WSL2.
  - **Hosting (Planned):** Vercel Preview (Staging) and Vercel Production (`main`).

---

## 2. Developer Onboarding & Local Environment Setup

### Prerequisites
- **Node.js & npm** (tested with Node `v24.15.0`, npm `11.12.1`).
- **Git**.
- **Docker Desktop + WSL2** (on low-`C:\`-space Windows machines, keep Docker Desktop / WSL storage and npm cache on `D:\`, e.g., `--cache D:\npm-cache`).
- **Supabase CLI:** Invoke via `npx --yes supabase@3.2.0` from `frontend/` (no global install required).

### Local Installation & Initialization
```powershell
cd frontend
npm ci --cache D:\npm-cache
```
*(Run `npm ci` without modifying `package.json` or `package-lock.json`.)*

### Docker & Local Supabase Startup
1. Start Docker Desktop and verify `docker ps` succeeds.
2. Start the local Supabase stack from `frontend/`:
   ```powershell
   npx --yes supabase@3.2.0 start
   ```
3. Verified local service endpoints:
   - **Local API Gateway:** `http://127.0.0.1:54321`
   - **Local PostgreSQL:** `127.0.0.1:54322`
   - **Database Container:** `supabase_db_tullab-al-bayan`

### Environment Variables Setup
Copy [frontend/.env.example](../frontend/.env.example) to gitignored `frontend/.env.local` and set:
- `VITE_SUPABASE_URL` — for local dev, `http://127.0.0.1:54321` (from `npx --yes supabase@3.2.0 status`).
- `VITE_SUPABASE_PUBLISHABLE_KEY` — local publishable/anon key printed by `npx --yes supabase@3.2.0 status` (or the hosted Staging project's publishable key from the project lead / Supabase Dashboard when testing Staging Preview).
- **Strict Secret Rule:** Never place `service_role` keys, database passwords, or Google OAuth Client Secrets in `frontend/.env.local`, `VITE_*` variables, documentation, or Git.

### Database Environments (Keep Strictly Separated)

| Environment | Purpose | Reset / Seed Rules | Credentials Rule |
|---|---|---|---|
| **Local Development DB** | Isolated Docker Postgres per developer workstation | Run `npx --yes supabase@3.2.0 db reset` freely; applies migrations + `seed.sql`. | Each developer initializes their own local DB and **must never** use Production credentials locally. |
| **Hosted Staging DB** | Pre-release upgrade testing with Vercel Preview | **Never** run `db reset` or demo `seed.sql`. Forward-migrate only (`migration repair` for `202611200001` then `db push`). | Obtain Staging `VITE_SUPABASE_URL` & publishable key from project lead; never commit. |
| **Production DB** | Live institute database (`main`) | **Never** run `db reset` or demo `seed.sql`. Forward-migrate only after Staging sign-off. | Managed in Vercel Production env vars; never used locally. |

### Local Reset, Migrations, Seed & SQL Verification Commands
```powershell
cd frontend

# Apply all migrations (202611200001 -> 202611230001 -> 202611230002) and seed.sql cleanly:
npx --yes supabase@3.2.0 db reset
```
Baseline row counts after a clean `db reset`:
- `public.batches`: `7`
- `public.students`: `5` (`SAT-001`, `SAT-002`, `SUN-001`, `MON-001` active; `SAT-099` former/inactive)
- `public.user_roles`: `0`
- `public.homework_assignments`: `3` (1 overdue, 1 upcoming, 1 `NULL` deadline)
- `auth.users`: `0`

To re-run local SQL verification scripts (all rollback-safe; run against container `supabase_db_tullab-al-bayan` from `frontend/supabase/`):
- `scripts/preflight_phase1_audit.sql` (read-only audit)
- `scripts/verify_phase2_backfill_local.sql` (`BEGIN; ... ROLLBACK;`)
- `scripts/verify_phase2_preflight_failures_local.sql` (`BEGIN; ... ROLLBACK;`)

---

## 3. Database Architecture, Auth & Permissions Summary

Full schema details live in [DATABASE_DESIGN.md](./DATABASE_DESIGN.md). Day 1 establishes:

- **Core Day 1 Tables & Relationships:**
  - `public.batches` (`1..7`, `Saturday`..`Friday`, fixed `CHECK` constraint; `INSERT`/`DELETE` revoked; Admin-only column-level `UPDATE (class_time, venue)`).
  - `public.students` (immutable `uuid` PK, editable `student_code`, nullable `email` temporarily for unlinked legacy Phase 1 rows, `batch_id` FK `ON DELETE RESTRICT`, `default_monthly_fee`, `default_scholarship_percent`, `is_active`, `enrolled_at`, `batch_assigned_at`, `deactivated_at`).
  - `public.user_roles` (`user_id` PK FK `auth.users(id) ON DELETE CASCADE`, `role` in `'admin'|'teacher'|'student'`, unique `student_id` FK `students(id) ON DELETE RESTRICT`, `staff_code`, `full_name`).
  - `public.homework_assignments` (`batch_id NOT NULL` FK `batches(id) ON DELETE RESTRICT` — strictly 1 batch per assignment, nonblank `title` & `instructions`, optional `deadline`, `published_by` default `auth.uid()`, `published_at`, `updated_at`).
- **Triggers & Data Preservation:**
  - `normalize_student_fields()` trims/lowercases, updates `batch_assigned_at` (`Asia/Dhaka`) on batch transfer (`batch_id` change), manages `deactivated_at`, and implements **Option A reactivation** (resets `batch_assigned_at` to today in `Asia/Dhaka` on `is_active: false -> true` while preserving student UUID and all historical records).
  - `protect_homework_publish_metadata()` trims `title` (preserving line breaks in `instructions`) and preserves `published_at` and `published_by` across edits.
  - `set_updated_at()` maintains `updated_at`.
- **Phase 1 → Phase 2 Archival & Compatibility Views:**
  - `202611230001` runs atomic preflight checks before backfill, gives staff roles precedence over student links for dual-role users, renames `bayan_staff_access` & `bayan_student_profiles` to `_archived_bayan_*` (all client grants revoked → `42501` for all client roles), and exposes temporary read-only `WITH (security_invoker = true)` views `public.bayan_staff_access` & `public.bayan_student_profiles` backed by the **live Phase 2 tables**.
- **Authentication & Authorization Model (6 User Types):**
  - Live browser login uses Google OAuth PKCE via Supabase Auth (`supabaseAuth.js`), mapped to roles via `public.user_roles`. Unlinked users have no `user_roles` row (`role = 'pending'`) and see only the "Awaiting institute access" screen.
  - **Admin:** Full `batches (class_time, venue)`, `students` CRUD (no `DELETE`), `user_roles` read, `homework_assignments` CRUD, plus `list_pending_auth_users()`, `link_student_account()`, `unlink_student_account()`.
  - **Teacher:** `batches` read, `0` rows on direct `students` `SELECT` (uses `get_teacher_roster()` RPC without emails/fees), full `homework_assignments` CRUD across all 7 batches.
  - **Active Student (`is_active = true`):** Reads `batches`, own `user_roles` & `students` row only, and current `batch_id` `homework_assignments` only; writes denied.
  - **Former Student (`is_active = false`):** Retains read-only access to own `students` / `user_roles` (and future historical attendance/tuition); receives **`0` rows** from `homework_assignments`.
  - **Pending User (no `user_roles` row):** `0` rows across all domain tables, compatibility views, and `batches`; RPCs raise `42501`.
  - **Anonymous (`anon`):** Denied (`42501`) across all tables, views, and RPCs.

---

## 4. What Changed in Day 1

### Database Objects & Scripts (`frontend/supabase/`)
1. [config.toml](../frontend/supabase/config.toml) & [.gitignore](../frontend/supabase/.gitignore) — local CLI configuration (original [202611200001_phase1_access.sql](../frontend/supabase/migrations/202611200001_phase1_access.sql) **untouched**).
2. [202611230001_phase2_core_and_backfill.sql](../frontend/supabase/migrations/202611230001_phase2_core_and_backfill.sql) — `batches`, `students`, `user_roles`, triggers, preflight guards, Phase 1 backfill, `_archived_bayan_*` lockdown, 7 `SECURITY DEFINER` functions, RLS/column-level grants, and live-backed `security_invoker` compatibility views.
3. [202611230002_homework.sql](../frontend/supabase/migrations/202611230002_homework.sql) — `homework_assignments`, `idx_homework_batch_deadline`, `protect_homework_publish_metadata()`, `set_updated_at()`, and RLS.
4. [seed.sql](../frontend/supabase/seed.sql) — local dev seed only (5 sample students, 3 sample homework assignments).
5. [preflight_phase1_audit.sql](../frontend/supabase/scripts/preflight_phase1_audit.sql), [verify_phase2_backfill_local.sql](../frontend/supabase/scripts/verify_phase2_backfill_local.sql), [verify_phase2_preflight_failures_local.sql](../frontend/supabase/scripts/verify_phase2_preflight_failures_local.sql).

### Frontend Files (`frontend/src/`)
| File | Action | Summary |
|---|---|---|
| [supabaseAuth.js](../frontend/src/features/auth/supabaseAuth.js) | Modified | PKCE Google OAuth `startGoogleSignIn()`, `signOutUser()`, `loadProfile()` querying `user_roles` + `students(..., batches(name))` |
| [useLiveAuth.js](../frontend/src/features/auth/useLiveAuth.js) | Modified | Fixes `?code=` callback error bug, keys profile cache on `user.id`, adds `getSession()` + `signOut()` |
| [MyProfile.jsx](../frontend/src/features/auth/MyProfile.jsx) | Modified | Active / Inactive (`Former student`) enrollment badge, archive notice, nullable field guards, pending guidance |
| [App.jsx](../frontend/src/app/App.jsx) | Modified | Removes demo accounts, password, `sessionStorage`, `readRoster`; wires live Google sign-in, loading/retry, and Pending screen |
| [batchRepository.js](../frontend/src/features/admin/batchRepository.js) | Created | Async `listBatches()` and `listActiveRosterForRole(role, knownBatches?)` |
| [BatchGrid.jsx](../frontend/src/features/admin/BatchGrid.jsx) | Modified | Renders live DB `batches` prop; keeps weekday fallback **only** when `batches === undefined` for untouched `StudentManagement.jsx` |
| [AdminBatchPage.jsx](../frontend/src/features/admin/AdminBatchPage.jsx) | Modified | Async loads batches + role-appropriate roster; shows loading/empty/error+Retry (never fake fallback batches); passes `{ batchId, batch, students, reload }` |
| [homeworkRepository.js](../frontend/src/features/homework/homeworkRepository.js) | Modified | Removes `localStorage`; implements async `listHomework`, `saveHomework`, `deleteHomework`; keeps transitional throwing `readHomework()` + `homeworkTitle()` for compilation |
| [HomeworkPages.jsx](../frontend/src/features/homework/HomeworkPages.jsx) | Modified | Title, Instructions, optional Deadline, `Asia/Dhaka` Overdue badge, loading/saving/deleting/error+Retry states, former-student notice |
| [AUTH_SETUP.md](../frontend/AUTH_SETUP.md) | Modified | Updated from Phase 1 demo instructions to live Google OAuth PKCE & `user_roles` setup |
| [database.types.ts](../frontend/src/types/database.types.ts) | Created | Generated local Supabase TypeScript schema types (UTF-8 without BOM); application-wide type integration remains pending |

---

## 5. Exact Shared Contracts to Use

### Global Auth `account` Contract (`useOutletContext() -> { role, account }`)
**`historyId` is removed.** Use `account.studentUuid` for relational identity and `account.id` for editable `student_code`:
```js
{
  userId: string,                  // auth.users.id UUID
  role: 'admin' | 'teacher' | 'student' | 'pending',
  name: string,                    // staff full_name / OAuth metadata or students.full_name
  email: string,
  photo: string | null,
  staffId: string | null,          // user_roles.staff_code
  studentUuid: string | null,      // students.id UUID (NULL for staff/pending)
  id: string | null,               // students.student_code (e.g. 'SAT-001')
  batchId: number | null,          // 1..7
  batch: string | null,            // 'Saturday'..'Friday'
  isActive: boolean,               // false for former students
  enrolledAt: string | null,       // 'YYYY-MM-DD'
  batchAssignedAt: string | null,  // 'YYYY-MM-DD'
}
```

### Shared Repository & Component Contracts
- `batchRepository.listBatches()` → `Promise<Array<{ id, name, dayOfWeek, displayOrder, classTime, venue }>>`
- `batchRepository.listActiveRosterForRole(role, knownBatches?)`:
  - `admin` → `Promise<Array<{ uuid, id, name, email, batchId, batch, defaultMonthlyFee, defaultScholarshipPercent, isActive }>>`
  - `teacher` → `Promise<Array<{ uuid, id, name, batchId, batch, isActive }>>` (via `get_teacher_roster()`)
- `AdminBatchPage` children receive `{ batchId, batch, students, reload }` (`students` objects use `uuid`, **not** `historyId`).
- `homeworkRepository`:
  - `listHomework(batchId?)` → `Promise<Array<{ id, batchId, batchName, title, instructions, deadline, publishedAt, updatedAt }>>`
  - `saveHomework({ id?, batchId, title, instructions, deadline })` → `Promise<HomeworkItem>`
  - `deleteHomework(id)` → `Promise<void>`
- Admin account-linking RPCs: `list_pending_auth_users()`, `link_student_account(p_student_id, p_user_id)`, `unlink_student_account(p_student_id)`.

---

## 6. Current Verification Status (23 November 2026)

| Verification Area | Status | Verified Scope & Results |
|---|---|---|
| **Local Environment & Migrations** | **PASSED** | Docker Desktop + WSL2 + local Supabase healthy (`127.0.0.1:54321`, `127.0.0.1:54322`, `supabase_db_tullab-al-bayan`); `202611200001`, `202611230001`, `202611230002`, and `seed.sql` applied cleanly via `db reset`. |
| **Stage 1: Repository SQL Verification** | **PASSED** | `preflight_phase1_audit.sql`, `verify_phase2_backfill_local.sql`, and `verify_phase2_preflight_failures_local.sql` all exited `0` (verified 7 batches, Phase 1 backfill, staff precedence, live-backed `security_invoker` views, `42501` denial on `_archived_bayan_*`, column-level batch grants, Option A reactivation, homework constraints/preservation, duplicate/invalid-batch/blank-name failures). |
| **Stage 1: 5 Additional Rollback-Only SQL Groups** | **PASSED** | Verified: (1) malformed linked `auth.users.email` preflight failure; (2) duplicate normalized linked `auth.users.email` preflight failure; (3) batch transfer `batch_assigned_at` refresh preserving `enrolled_at` & UUID; (4) Teacher homework `INSERT`/`DELETE` & `students` write denials; (5) Active & Former Student `UPDATE`/`DELETE` denials on `homework_assignments` & `students`. |
| **Stage 2: Live PostgREST & Repository API QA** | **PASSED** | Real local GoTrue sessions (`Admin`, `Teacher`, `Active Student`, `Former Student`, `Pending User`) + `Anonymous` exercised `loadProfile`, `listBatches`, `listActiveRosterForRole`, `listHomework`, `saveHomework`, `deleteHomework`, Admin link/unlink RPCs, RLS, and PostgREST responses. All assertions passed. |
| **Frontend Dependency Install & Build** | **PASSED** | `npm ci --cache D:\npm-cache` and `npm run build` (`1664 modules transformed`, `✓ built in 1.79s`) passed with `package.json` and `package-lock.json` unmodified. |
| **QA Cleanup & Baseline Restore** | **PASSED** | Temporary QA records and scratch files removed; DB restored identically to `7` batches, `5` students, `0` `user_roles`, `3` `homework_assignments`, `0` `auth.users`. |
| **Generate `frontend/src/types/database.types.ts`** | **PASSED** | Generated from local Supabase (`127.0.0.1:54322`) via `npx --yes supabase@3.2.0 gen types typescript --local` (UTF-8 without BOM); verified Day 1 `public` tables, compatibility views, and RPCs. |
| **Application-Wide Type Integration** | **PENDING** | `frontend/src/types/database.types.ts` exists on disk, but is not yet imported or integrated into frontend repositories/components. |
| **Browser Interactive UI Verification** | **PENDING** | React pages have not yet been interactively clicked through in a live browser against local Supabase. |
| **Google OAuth Browser Redirect Verification** | **PENDING** | Local `google` external provider is disabled by default; interactive Google sign-in redirect requires Google Cloud OAuth credentials. |

---

## 7. Outstanding Tasks (PENDING)

1. **PENDING — Application-wide TypeScript type integration:** `frontend/src/types/database.types.ts` has been generated from local Supabase, but has not yet been imported or wired into frontend repositories/components (re-generate after adding Days 2–4 migrations).
2. **PENDING — Browser-based interactive UI verification:** Configure gitignored `frontend/.env.local` for local `127.0.0.1:54321` and manually exercise sign-in, pending screen, Admin/Teacher batch/homework CRUD, active student overdue badges, and former student notices in a browser.
3. **PENDING — Google OAuth browser redirect verification:** Configure Google OAuth Client ID/Secret and test `/sign-in` redirect round-trip (on Staging or configured local OAuth).
4. **PENDING (Optional Improvement) — Zero-row delete feedback:** `homeworkRepository.deleteHomework(id)` currently omits `.select()`, so PostgREST returns HTTP `204` with `0` rows deleted when an unauthorized user or missing ID calls it directly (DB RLS prevents deletion safely, but callers receive no row-count error).
5. **PENDING — Additional QA & Days 2–5 Features:** Remaining modules in [DATABASE_DESIGN.md](./DATABASE_DESIGN.md) (`202611230003`–`0006`, Roster/CSV/Linking UI, Tuition, Attendance, Staff Dashboard, Academic Calendar, Curriculum Analysis static image, Admin Export, Jihad's RLS test suite, and Staging/Production rollout).

---

## 8. Known Limitations & Risks

- **Legacy `historyId` & `readHomework` Consumers:** Mostofa's and Iffat's unmigrated frontend files (`StaffAttendance.jsx`, `AdminTuition.jsx`, `StudentTuition.jsx`, `StudentPages.jsx`, `StaffDashboard.jsx`, `AcademicCalendar.jsx`, `AcademicPages.jsx`) still read `historyId` (`undefined`) or `readHomework()`.
  - `homeworkRepository.readHomework()` intentionally **throws** a deprecation error so unmigrated callers display error alerts rather than silent empty lists (currently triggers Teacher Dashboard's error banner in `StaffDashboard.jsx`).
  - `StaffAttendance.jsx` and `AdminTuition.jsx` currently key rows on `student.historyId` (`undefined`) until Mostofa migrates them to `student.uuid`.
  - `BatchGrid.jsx` retains `LEGACY_WEEKDAY_BATCHES` strictly when `batches === undefined` so untouched `StudentManagement.jsx` keeps compiling until migrated.
- **Nullable `students.email` Until Cleanup:** `students.email` stays nullable in Phase 2 (`202611230001`) so unlinked Phase 1 students can backfill without data loss; `NOT NULL` is deferred to post-rollout `202611230006_finalize_legacy_cleanup.sql` after Admin email backfill.
- **Local Google OAuth:** Interactive Google OAuth is unverified locally without external OAuth credentials (Stage 2 used local GoTrue email/password sessions).

---

## 9. Team Action Lists & Recommended Starting Point

### Recommended Starting Point for the Next Developer
1. Pull updated `main` (once Day 1 PR merges), run `npm ci --cache D:\npm-cache` and `npx --yes supabase@3.2.0 start && npx --yes supabase@3.2.0 db reset` inside `frontend/`.
2. Re-generate `frontend/src/types/database.types.ts` after adding any Days 2–4 migrations (Day 1 types are already generated on disk; application-wide type integration remains pending).
3. Follow your role action list below without modifying Day 1's `App.jsx`, `supabaseAuth.js`, `AdminBatchPage.jsx`, `homeworkRepository.js`, `202611200001`, `202611230001`, or `202611230002`.

### Mostofa Mohi Uddin Ahmed (`feat/roster-tuition-attendance`) — Mandatory Before Merging Days 2–4 PR
1. **`frontend/src/features/attendance/StaffAttendance.jsx` (CRITICAL):** Replace `student.historyId` (lines 26, 27, 49, 53, 55, 105, 120) with `student.uuid` and wire Supabase `attendance_*` tables (`202611230005`).
2. **`frontend/src/features/tuition/AdminTuition.jsx` (CRITICAL):** Replace `student.historyId` (lines 78, 87, 101, 164, 176) with `student.uuid` and `monthly_tuition` (`202611230004`).
3. **`frontend/src/features/tuition/StudentTuition.jsx`:** Replace `student.historyId` (line 9) with `student.studentUuid` and async Supabase query.
4. **`frontend/src/app/StudentPages.jsx`:** Replace `account.historyId` & `readRoster()` (lines 17, 38, 42, 50, 98) with `account.studentUuid`, `account.batchId`, `account.enrolledAt`, `account.batchAssignedAt`, and `account.isActive`; replace `readHomework` / `homeworkTitle(item.text)` (lines 5, 51, 87) with async `listHomework(account.batchId)` and `item.title`.
5. **`frontend/src/features/admin/StudentManagement.jsx` & `rosterRepository.js`:** Pass live `batches` from `batchRepository.listBatches()` into `<BatchGrid />`, migrate CRUD/deactivation/reactivation to `public.students` (`uuid`), add CSV import (`202611230003`), and add Manual Account Linking UI (`list_pending_auth_users()`, `link_student_account()`, `unlink_student_account()`).
6. **`frontend/src/features/attendance/attendanceRepository.js` & `tuitionRepository.js`:** Remove `localStorage` and `historyId` keys; update `tuitionFormat.js` to exact two-decimal `BDT`.

### Iffat Jahan (`feat/frontend-polish-export`)
1. **`frontend/src/features/dashboard/StaffDashboard.jsx` (MANDATORY):** Replace `readHomework()`, `homeworkTitle(item.text)`, and `student.historyId` (lines 7, 40, 56, 112, 126) with async `listHomework()`, `item.title` + `item.batchName`, and `student.uuid`. Once both `StaffDashboard.jsx` and `StudentPages.jsx` migrate, delete the transitional `readHomework` export from `homeworkRepository.js`.
2. **`frontend/src/features/academics/AcademicCalendar.jsx` (MANDATORY):** Replace `readRoster()` / `account.historyId` in `StudentCalendar` (line 87) with `account.batch` and `account.isActive === false` guard, and wire `batches(class_time, venue)` Admin edits.
3. **`frontend/src/features/academics/AcademicPages.jsx` & `academicRepository.js` (Later Improvement):** Hidden `/grades` route still calls `publishedGrades(account.historyId)` (`[]` safely); align to `account.studentUuid` or leave as inactive stub if deferred.
4. **`CurriculumAnalysis.jsx`, `portalNavigation.jsx`, `AdminExport.jsx`, `package.json` (`fflate`):** Per [DATABASE_DESIGN.md](./DATABASE_DESIGN.md) §11.5.

### Jihad Mia (`chore/qa-rls-tests-docs`)
- Align `frontend/supabase/tests/rls_and_constraints.test.sql` with [verify_phase2_backfill_local.sql](../frontend/supabase/scripts/verify_phase2_backfill_local.sql) (`batches` column-level grants, live-backed `security_invoker` views vs. `_archived_bayan_*` `42501` denial, Option A reactivation, and `published_at`/`published_by` preservation).

### Project Manager (PM)
- Day 1 SQL verification, API/repository verification, and local `database.types.ts` generation succeeded; application-wide type integration, browser UI QA, and Google OAuth redirect verification remain pending before merging Day 1 PR or deploying to Staging.
- Never apply `202611230001` on Staging/Live without first running `preflight_phase1_audit.sql` and `supabase migration repair --status applied 202611200001`.
