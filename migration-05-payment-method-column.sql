-- ============================================================
-- Migration: payment_method on payments table
-- Run this in the Neon SQL editor AFTER the previous migrations.
-- ============================================================

alter table payments add column if not exists payment_method text not null default 'upi';

-- ============================================================
-- Existing rows all get 'upi' as a reasonable default, since cash
-- wasn't a distinct option before this migration — Postgres applies
-- this to already-existing rows automatically for a constant default.
-- Going forward, every new payment (registration approval, renewal)
-- sets this explicitly to 'cash' or 'upi'. Reports can now aggregate
-- cleanly by payment_method instead of parsing it out of the note
-- text.
-- ============================================================
