-- ============================================================
-- Migration: Cloudflare R2 image storage
-- Run this in the Neon SQL editor AFTER the previous migrations.
-- ============================================================

alter table pending_registrations add column if not exists id_photo_key text;
alter table pending_registrations add column if not exists payment_screenshot_key text;
alter table students add column if not exists id_photo_key text;

-- ============================================================
-- The old bytea columns (id_photo, payment_screenshot) are left in
-- place on purpose — they're not touched by this migration. From
-- now on, every NEW upload goes to R2 and only the object key is
-- stored here; the *_key columns being null just means "not yet
-- migrated to R2", and the app falls back to reading the legacy
-- bytea column in that case, so nothing breaks for existing photos.
--
-- To fully move existing photos into R2 (optional, but recommended
-- once R2 is set up and confirmed working), run the one-time script
-- described in SETUP.md. After confirming it worked, you can drop
-- the old bytea columns to reclaim space:
--
--   alter table students drop column id_photo, drop column id_photo_type;
--   alter table pending_registrations drop column id_photo, drop column id_photo_type,
--     drop column payment_screenshot, drop column payment_screenshot_type;
--
-- Don't run those drops until you've verified the migration script
-- completed successfully and photos are loading correctly from R2.
-- ============================================================
