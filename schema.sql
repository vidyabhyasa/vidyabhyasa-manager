-- ============================================================
-- Vidyabhyasa Study Center — Neon Postgres schema
-- Run this once in the Neon SQL editor (or via psql).
-- ============================================================

create extension if not exists pgcrypto;

-- Staff accounts. Passwords are hashed (bcrypt) by the API —
-- never store a plain password here.
create table if not exists staff (
  id uuid primary key default gen_random_uuid(),
  email text unique not null,
  password_hash text not null,
  role text not null check (role in ('manager','founder')),
  display_name text not null,
  created_at timestamptz not null default now()
);

-- Students. ID photos are stored directly here as bytea, to
-- avoid needing a separate file-storage service.
create table if not exists students (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  phone text not null,
  email text,
  exam_prep text not null,
  join_date date not null,
  duration_months int not null,
  expiry_date date not null,
  seat_id text not null,
  floor text not null,
  locker_id text,
  locker_floor text,
  locker_join_date date,
  locker_months int,
  locker_expiry_date date,
  locker_deposit int,
  id_photo bytea,
  id_photo_type text,
  created_at timestamptz not null default now()
);

create index if not exists students_seat_idx on students(seat_id);
create index if not exists students_locker_idx on students(locker_id);

-- Payments — one row per payment event (registration + renewals).
create table if not exists payments (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references students(id) on delete cascade,
  date date not null default current_date,
  amount numeric not null,
  note text,
  created_at timestamptz not null default now()
);

create index if not exists payments_student_idx on payments(student_id);

-- ============================================================
-- Note on access control: unlike Supabase, Neon has no built-in
-- row-level security tied to a public API layer. All access rules
-- (public can only ever see free/occupied counts, only logged-in
-- staff can read personal data) are enforced by the API code in
-- /api, not by the database itself. The database connection string
-- is only ever used server-side (inside the Vercel functions),
-- never sent to the browser.
-- ============================================================

-- Staff accounts are created via the one-time /api/admin-create-staff
-- endpoint described in SETUP.md — no manual SQL needed for that step.
