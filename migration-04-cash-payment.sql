-- ============================================================
-- Migration: cash payment option
-- Run this in the Neon SQL editor AFTER the previous migrations.
-- ============================================================

alter table pending_registrations add column if not exists payment_method text default 'upi';

-- ============================================================
-- payment_method is 'upi' or 'cash'. It only needs to live on
-- pending_registrations (to carry the choice from submission
-- through to approval, where it gets folded into the payments
-- table's `note` text) — renewal payments recorded directly by
-- staff choose a method in the same request that creates the
-- payment row, so no persisted column is needed there.
-- ============================================================
