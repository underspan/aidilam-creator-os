-- Migration 021: Multi-Workspace Tenancy Foundation
-- AIDILAM-COM-04A2
-- Adds workspace as top-level tenant boundary.
-- All projects belong to a workspace. Cross-workspace access denied.

-- Workspaces table
CREATE TABLE IF NOT EXISTS aidilam_app.workspaces (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  name text NOT NULL,
  description text,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended', 'archived')),
  owner_user_id uuid REFERENCES aidilam_app.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Workspace members
CREATE TABLE IF NOT EXISTS aidilam_app.workspace_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES aidilam_app.workspaces(id),
  user_id uuid NOT NULL REFERENCES aidilam_app.users(id),
  role text NOT NULL DEFAULT 'viewer' CHECK (role IN ('owner', 'admin', 'editor', 'reviewer', 'viewer')),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended', 'removed')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_workspace_members_workspace ON aidilam_app.workspace_members(workspace_id);
CREATE INDEX IF NOT EXISTS idx_workspace_members_user ON aidilam_app.workspace_members(user_id);

-- Add workspace_id to projects (nullable initially for backfill)
ALTER TABLE aidilam_app.projects ADD COLUMN IF NOT EXISTS workspace_id uuid REFERENCES aidilam_app.workspaces(id);
CREATE INDEX IF NOT EXISTS idx_projects_workspace ON aidilam_app.projects(workspace_id);

-- Create default workspace and backfill
INSERT INTO aidilam_app.workspaces (id, code, name, description, status, owner_user_id)
VALUES ('00000000-0000-4000-a000-workspace00001', 'default', 'AIĐiLàm Studio', 'Default workspace', 'active',
  (SELECT id FROM aidilam_app.users WHERE email = 'owner@aidilam.dev' LIMIT 1))
ON CONFLICT (code) DO NOTHING;

-- Backfill all projects to default workspace
UPDATE aidilam_app.projects SET workspace_id = '00000000-0000-4000-a000-workspace00001' WHERE workspace_id IS NULL;

-- Make workspace_id NOT NULL after backfill
ALTER TABLE aidilam_app.projects ALTER COLUMN workspace_id SET NOT NULL;

-- Add owner as workspace member
INSERT INTO aidilam_app.workspace_members (workspace_id, user_id, role)
SELECT '00000000-0000-4000-a000-workspace00001', id, 'owner'
FROM aidilam_app.users WHERE email = 'owner@aidilam.dev'
ON CONFLICT (workspace_id, user_id) DO NOTHING;

-- Rollback: ALTER TABLE aidilam_app.projects DROP COLUMN workspace_id; DROP TABLE aidilam_app.workspace_members; DROP TABLE aidilam_app.workspaces;
