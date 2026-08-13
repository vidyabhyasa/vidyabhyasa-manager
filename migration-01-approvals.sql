-- ============================================================
-- Migration: approval pipeline (Stage 1)
-- Run this in the Neon SQL editor AFTER schema.sql has already
-- been applied. Safe to re-run (uses IF NOT EXISTS throughout).
-- ============================================================

create table if not exists pending_registrations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  phone text not null,
  email text,
  exam_prep text not null,
  join_date date not null,
  duration_months int not null,
  seat_id text not null,
  floor text not null,
  locker_id text,
  locker_floor text,
  locker_months int,
  amount numeric not null,
  id_photo bytea,
  id_photo_type text,
  payment_screenshot bytea,
  payment_screenshot_type text,
  rules_accepted_at timestamptz not null,
  status text not null default 'pending' check (status in ('pending','approved','rejected')),
  reject_reason text,
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  resolved_by uuid references staff(id)
);

create index if not exists pending_status_idx on pending_registrations(status);
create index if not exists pending_seat_idx on pending_registrations(seat_id);
create index if not exists pending_locker_idx on pending_registrations(locker_id);

-- ============================================================
-- Note: while a registration is 'pending', its seat_id / locker_id
-- count as held — /api/availability.js excludes them from the free
-- list, so nobody else can request the same seat while it awaits
-- approval. On approval a real row is created in `students` and
-- this row is marked 'approved'; on rejection it's marked
-- 'rejected' with a reason, and the seat becomes free again
-- immediately (since only 'pending' rows hold a seat).
-- ============================================================
