-- WaBot v4 Migration — smart_menus table
-- Run after migration_v3.sql in the Supabase SQL Editor.

CREATE TABLE IF NOT EXISTS smart_menus (
  id           uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  workspace_id uuid        REFERENCES workspaces(id) ON DELETE CASCADE UNIQUE,
  business_name text       NOT NULL,
  languages    text[]      DEFAULT '{hindi,english,hinglish}',
  -- options: [{label_en, label_hi, label_hl, reply_en, reply_hi, reply_hl}]
  options      jsonb       DEFAULT '[]',
  is_active    boolean     DEFAULT true,
  created_at   timestamptz DEFAULT now(),
  updated_at   timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_smart_menus_workspace ON smart_menus(workspace_id);
