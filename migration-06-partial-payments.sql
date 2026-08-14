-- ============================================================
-- Migration: partial payments (charges)
-- Run this in the Neon SQL editor AFTER the previous migrations.
-- ============================================================

create table if not exists charges (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references students(id) on delete cascade,
  resource_type text not null check (resource_type in ('seat','locker')),
  months int not null,
  amount_due numeric not null,
  amount_paid numeric not null default 0,
  status text not null default 'open' check (status in ('open','paid','cancelled')),
  created_at timestamptz not null default now(),
  created_by uuid references staff(id),
  applied_at timestamptz,
  cancelled_at timestamptz,
  cancelled_by uuid references staff(id),
  cancel_reason text
);

create index if not exists charges_student_idx on charges(student_id);
create index if not exists charges_open_idx on charges(student_id, resource_type) where status = 'open';

alter table payments add column if not exists charge_id uuid references charges(id) on delete set null;

-- ============================================================
-- How this works:
--
-- A "charge" represents one renewal period being billed — e.g.
-- "seat, 2 months, ₹1900 due". Recording a payment against a charge
-- increases its amount_paid. The seat/locker due date is only ever
-- extended once a charge's amount_paid reaches its amount_due
-- (status flips to 'paid', applied_at is set, and expiry_date /
-- locker_expiry_date move forward by `months`). Until then the
-- charge sits 'open' with a visible remaining balance, and the due
-- date does not move — this is what makes partial payment safe: a
-- student who pays half now and half later doesn't get an extension
-- until the whole thing is actually settled.
--
-- At most one 'open' charge is allowed per (student, resource_type)
-- at a time — staff must pay it off or cancel it before starting
-- a new one for that seat/locker. Cancelling a charge does not
-- reverse payments already logged against it; it just stops it from
-- showing as pending.
--
-- Deleting a student (manual or via the nightly cleanup cron)
-- cascades to delete their charges automatically.
-- ============================================================
