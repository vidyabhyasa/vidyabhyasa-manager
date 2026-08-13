-- ============================================================
-- Migration: audit log + Stage 3 support (Stage 3)
-- Run this in the Neon SQL editor AFTER schema.sql,
-- migration-01-approvals.sql, and migration-02-notifications.sql
-- have already been applied.
-- ============================================================

create table if not exists audit_log (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references staff(id),
  actor_name text,
  action text not null,
  target_type text,
  target_id text,
  details text,
  created_at timestamptz not null default now()
);

create index if not exists audit_log_created_idx on audit_log(created_at desc);

-- ============================================================
-- action values in use: approve_pending, reject_pending,
-- edit_pending, edit_student, remove_student, record_payment,
-- edit_payment, delete_payment, assign_locker, remove_locker,
-- swap_seat, swap_locker, resend_bill
--
-- `details` is a short human-readable summary (not structured
-- JSON) so the log stays readable even after the underlying
-- student/payment row has been deleted.
-- ============================================================
