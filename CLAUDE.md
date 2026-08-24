# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A single-page React app ("NeuroCare CRM", branded GiraSoli) for managing a child psychology practice (DSA/ADHD therapy). It handles patients, therapy sessions/time-tracking, room bookings, billing reports, and team management for therapists/admins. All UI text is in Italian — match this convention for any new UI copy.

There is no backend of its own: the app talks directly to Supabase (Postgres + Auth + Realtime) from the browser using `@supabase/supabase-js`. There is no server-side API layer, no ORM, and no migration files checked into this repo — the schema lives only in the Supabase project.

## Commands

- `npm install` — install dependencies
- `npm run dev` — start Vite dev server on port 3000 (`--host=0.0.0.0`)
- `npm run build` — production build (`vite build`)
- `npm run preview` — preview the production build
- `npm run lint` — type-check only (`tsc --noEmit`); there is no ESLint config
- `npm run clean` — remove `dist/`

There is no test runner configured (no Jest/Vitest, no `test` script). `test.ts` at the repo root is **not** a test suite — it's an ad-hoc script (run manually via `npx tsx test.ts`) that connects directly to the live Supabase project to poke at data. Treat it as a scratch/debug file, not part of CI or a pattern to extend.

## Environment variables

- `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` — Supabase project credentials, read in `src/lib/supabase.ts`. If unset, the code falls back to a hardcoded project URL/anon key baked into that file (the anon/publishable key, not a secret — access is meant to be gated by Supabase RLS policies, not by hiding this key).
- `GEMINI_API_KEY` — wired up in `vite.config.ts` (leftover from the Google AI Studio template this project was scaffolded from) but not referenced anywhere in `src/`. `@google/genai` and `express` are unused dependencies from the same template; don't assume either is in play.

## Architecture

**Entry point:** `index.html` → `src/main.tsx` → `src/App.tsx`.

**Routing & auth gating** (`src/App.tsx`): `AuthProvider` wraps a `BrowserRouter`. A `PrivateRoute` wrapper redirects to `/login` when there's no authenticated user; everything else is nested under `Layout` (sidebar + `<Outlet/>`). Routes map 1:1 to files in `src/pages/`: `/` → Patients, `/sessions`, `/rooms`, `/reports`, `/team` (admin-only, hidden from the nav for therapists), `/profile`.

**Auth & profile** (`src/context/AuthContext.tsx`): wraps `supabase.auth` session state. On login, it fetches (or lazily creates, on first login) a matching row in the `users` table keyed by the Supabase auth user id — this is the app's "profile" (`name`, `email`, `role`, `hourlyRate`). Note the hardcoded bootstrap rule: the email `valerioportaro97@gmail.com` is always force-promoted to `role: 'admin'` on login. New users self-register from the login page (`/login`, toggled between sign-in/sign-up) and default to `role: 'therapist'`; an existing admin then promotes them via the Team page.

**Data access pattern (all pages follow this, e.g. `src/pages/Patients.tsx`, `Sessions.tsx`, `Rooms.tsx`, `Reports.tsx`, `Team.tsx`):**
- Fetch directly from Supabase in a `useEffect` via `supabase.from(table).select(...)`.
- Subscribe to a `postgres_changes` Realtime channel per table and re-fetch on any change, unsubscribing on unmount. There's no shared data-fetching/cache layer (no react-query etc.) — each page owns its own fetch + subscription.
- Mutations (`insert`/`update`/`delete`) are fired directly from form handlers; errors are logged to console (and sometimes `alert()`), not surfaced through a shared error UI.
- Role-based access (`admin` vs `therapist`) is enforced only in the client (conditional rendering / filtering by `profile.role` and `assignedTherapists`/`therapistId`). Actual data isolation relies on Supabase RLS policies configured in the Supabase project — not visible in this repo.

**Data model** (inferred from usage — no schema file exists, treat table/column names below as the source of truth when writing queries):
- `users` — id (= auth uid), name, email, role: `'admin' | 'therapist'`, hourlyRate
- `patients` — id, firstName, lastName, dateOfBirth, diagnosis, parentName, parentEmail, parentPhone, assignedTherapists (string[] of user ids), createdAt, createdBy, notes
- `sessions` — id, patientId, therapistId, date, durationMinutes, activityType, notes, cost, status: `'scheduled' | 'completed' | 'cancelled' | 'no-show'`
- `rooms` — id, name, capacity, description
- `bookings` — id, roomId, therapistId, patientId (nullable), startTime, endTime, title

**`patients.notes` is a JSON-encoded string, not a JSONB column** — it's used as a free-form extras bag (currently just `{ customRate }`, the patient's overridden hourly rate). It's always read with `JSON.parse` wrapped in try/catch (see `Patients.tsx`, `Sessions.tsx`, `Rooms.tsx`). Cost calculation everywhere falls back from `patient.notes.customRate` → `profile.hourlyRate` → a hardcoded `60` default; keep any new billing logic consistent with this fallback chain (see `calculateCost` duplicated in `Sessions.tsx` and `Rooms.tsx`).

**Bookings and sessions are two separate tables kept in sync by hand**, not by a DB relation/trigger: `src/pages/Rooms.tsx` creates/updates/deletes a matching `sessions` row whenever a booking with a `patientId` is created/edited/deleted, matching the two by `{ patientId, therapistId, date }`. When touching booking logic, keep both tables in sync manually the same way.

**`home.html`** at the repo root is a standalone static login-page mockup (posts to `/login`) that is not served by the Vite app or wired into the React router — it's not part of the running application; don't assume routes/behavior from it apply to `src/pages/Login.tsx`.

**Styling:** Tailwind CSS v4 via `@tailwindcss/vite` (no `tailwind.config.js`; `src/index.css` is just `@import "tailwindcss";`), applied with inline utility classes. `cn()` in `src/lib/utils.ts` (clsx + tailwind-merge) is available for conditional class merging. Icons from `lucide-react`, charts in Reports from `recharts`, date handling from `date-fns` (with the `it` locale for display).

**Path alias:** `@/*` maps to the repo root (set in both `tsconfig.json` and `vite.config.ts`).
