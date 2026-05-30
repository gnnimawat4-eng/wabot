-- WaBot v3 Migration — Smart Multi-Level Menu
-- Run this in the Supabase SQL Editor after migration_v2.sql.

-- Contacts: conversation state columns
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS preferred_language text DEFAULT 'english';
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS menu_state        text DEFAULT '';
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS last_menu_reply   text DEFAULT '';

-- Workspaces: store custom smart-menu content overrides as JSON
ALTER TABLE workspaces ADD COLUMN IF NOT EXISTS smart_menu jsonb DEFAULT NULL;

-- Indexes for state-based lookups
CREATE INDEX IF NOT EXISTS idx_contacts_menu_state
  ON contacts(workspace_id, menu_state)
  WHERE menu_state IS NOT NULL AND menu_state != '';
