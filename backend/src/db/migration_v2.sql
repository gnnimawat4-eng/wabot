-- WaBot v2 Migration
-- Run this in the Supabase SQL Editor once against your existing database.

-- Broadcasts: add scheduling + text-message columns
ALTER TABLE broadcasts ADD COLUMN IF NOT EXISTS message          text;
ALTER TABLE broadcasts ADD COLUMN IF NOT EXISTS scheduled_at     timestamptz;
ALTER TABLE broadcasts ADD COLUMN IF NOT EXISTS recipient_count  integer NOT NULL DEFAULT 0;
ALTER TABLE broadcasts ADD COLUMN IF NOT EXISTS deleted_at       timestamptz;

-- template_name was NOT NULL in v1; make nullable so text-message broadcasts work
ALTER TABLE broadcasts ALTER COLUMN template_name DROP NOT NULL;

-- Add deleted_at index for trash queries
CREATE INDEX IF NOT EXISTS idx_broadcasts_deleted ON broadcasts(deleted_at)
  WHERE deleted_at IS NOT NULL;

-- Contacts: add deleted_at if missing (some deployments may already have it)
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS deleted_at timestamptz;
CREATE INDEX IF NOT EXISTS idx_contacts_deleted ON contacts(deleted_at)
  WHERE deleted_at IS NOT NULL;
