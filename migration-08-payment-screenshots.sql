-- Migration 08: keep each payment's screenshot so staff can view it
-- from Payment history. Run in the Neon SQL editor BEFORE deploying.
alter table payments add column if not exists screenshot_key text;
