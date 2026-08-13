-- ============================================================
-- Migration: notifications + auto-removal (Stage 2)
-- Run this in the Neon SQL editor AFTER schema.sql and
-- migration-01-approvals.sql have already been applied.
-- ============================================================

create table if not exists cleanup_flags (
  id uuid primary key default gen_random_uuid(),
  resource_type text not null check (resource_type in ('seat','locker')),
  resource_id text not null,
  floor text not null,
  reason text not null default 'auto-removed after 3 days overdue',
  flagged_at timestamptz not null default now(),
  cleared_at timestamptz,
  cleared_by uuid references staff(id)
);

create index if not exists cleanup_active_idx on cleanup_flags(resource_type, resource_id) where cleared_at is null;

-- ============================================================
-- Status model (computed on the fly, not stored):
--   active    — more than 2 days until expiry
--   warning   — 1-2 days until expiry
--   error     — day of expiry through 2 days overdue
--   critical  — 3+ days overdue (eligible for auto-removal)
--
-- A seat/locker being "occupied" is now determined purely by
-- whether a students row references it — not by comparing dates.
-- Once a student is 3+ days overdue, the nightly cleanup job
-- deletes their record (freeing the seat) and adds a row here so
-- staff know it needs a physical wipe-down before the next student
-- sits there. If only the locker is 3+ days overdue (seat still
-- current), just the locker fields are cleared instead of the
-- whole student.
-- ============================================================
