-- ============================================================
-- Migration 09: multiple branches
-- Existing data becomes branch 'tk' (TK Layout). New branch 'rk'
-- (Ramakrishna Nagar) uses its own seat ids (R1-xx) and locker ids
-- (RL1-xx), so they never clash with TK Layout's F1/F2/L1/L2 ids.
-- Run in the Neon SQL editor BEFORE deploying the new code.
-- ============================================================
alter table students             add column if not exists branch_id text not null default 'tk';
alter table pending_registrations add column if not exists branch_id text not null default 'tk';
alter table audit_log            add column if not exists branch_id text;
update audit_log set branch_id = 'tk' where branch_id is null;

create index if not exists students_branch_idx on students(branch_id);
create index if not exists pending_branch_idx on pending_registrations(branch_id);
