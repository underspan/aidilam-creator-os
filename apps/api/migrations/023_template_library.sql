-- Migration 023: Commercial Template Library
-- AIDILAM-COM-04C

CREATE TABLE IF NOT EXISTS aidilam_app.template_definitions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid REFERENCES aidilam_app.workspaces(id),
  name text NOT NULL,
  slug text NOT NULL,
  description text,
  category text NOT NULL DEFAULT 'general',
  template_type text NOT NULL DEFAULT 'system' CHECK (template_type IN ('system', 'workspace', 'custom')),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('draft', 'active', 'archived', 'disabled')),
  visibility text NOT NULL DEFAULT 'system' CHECK (visibility IN ('private', 'workspace', 'system')),
  current_version_id uuid,
  created_by text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_templates_workspace ON aidilam_app.template_definitions(workspace_id);
CREATE INDEX IF NOT EXISTS idx_templates_category ON aidilam_app.template_definitions(category);
CREATE INDEX IF NOT EXISTS idx_templates_status ON aidilam_app.template_definitions(status);

CREATE TABLE IF NOT EXISTS aidilam_app.template_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id uuid NOT NULL REFERENCES aidilam_app.template_definitions(id),
  version integer NOT NULL DEFAULT 1,
  config_json jsonb NOT NULL DEFAULT '{}',
  config_checksum text NOT NULL,
  created_by text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (template_id, version)
);

CREATE TABLE IF NOT EXISTS aidilam_app.template_usage (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES aidilam_app.workspaces(id),
  template_id uuid NOT NULL REFERENCES aidilam_app.template_definitions(id),
  template_version_id uuid NOT NULL REFERENCES aidilam_app.template_versions(id),
  job_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_template_usage_workspace ON aidilam_app.template_usage(workspace_id);

-- Seed system templates
INSERT INTO aidilam_app.template_definitions (id, name, slug, description, category, template_type, status, visibility) VALUES
  ('a0000000-0001-4000-a000-000000000001', 'Vertical Short 9:16', 'vertical-short', 'Perfect for TikTok, Reels, and Shorts', 'short-form', 'system', 'active', 'system'),
  ('a0000000-0002-4000-a000-000000000002', 'YouTube Shorts', 'youtube-shorts', 'Optimized for YouTube Shorts format', 'short-form', 'system', 'active', 'system'),
  ('a0000000-0003-4000-a000-000000000003', 'Facebook Reels', 'facebook-reels', 'Configured for Facebook Reels', 'social', 'system', 'active', 'system'),
  ('a0000000-0004-4000-a000-000000000004', 'TikTok Style', 'tiktok-style', 'Fast-paced TikTok content', 'short-form', 'system', 'active', 'system'),
  ('a0000000-0005-4000-a000-000000000005', 'Douyin Localization', 'douyin-local', 'Chinese to Vietnamese for Douyin content', 'short-form', 'system', 'active', 'system'),
  ('a0000000-0006-4000-a000-000000000006', 'Talking / Narration', 'talking-narration', 'Clear narration with subtitles', 'general', 'system', 'active', 'system'),
  ('a0000000-0007-4000-a000-000000000007', 'Education Explainer', 'education-explainer', 'Educational content with clear voice', 'education', 'system', 'active', 'system'),
  ('a0000000-0008-4000-a000-000000000008', 'News Summary', 'news-summary', 'Quick news clip translation', 'news', 'system', 'active', 'system'),
  ('a0000000-0009-4000-a000-000000000009', 'Affiliate Product', 'affiliate-product', 'Product review/promotion video', 'affiliate', 'system', 'active', 'system'),
  ('a0000000-0010-4000-a000-000000000010', 'Podcast Clip', 'podcast-clip', 'Audio-first content with subtitles', 'podcast', 'system', 'active', 'system')
ON CONFLICT (id) DO NOTHING;

-- Seed template versions (v1 for each)
INSERT INTO aidilam_app.template_versions (id, template_id, version, config_json, config_checksum) VALUES
  ('b0000000-0001-4000-a000-000000000001', 'a0000000-0001-4000-a000-000000000001', 1, '{"language":{"source":"auto","target":"vi"},"translation":{"capability":"translation","provider_mode":"workspace_default"},"voice":{"capability":"tts","provider_mode":"workspace_default","voice":"vi-VN-HoaiMyNeural"},"video":{"aspect_ratio":"9:16","resolution":"1080x1920"},"subtitle":{"enabled":true,"position":"bottom","style":"default"},"audio":{"original_volume":0.15,"narration_volume":1.0}}', 'v1-vertical'),
  ('b0000000-0002-4000-a000-000000000002', 'a0000000-0002-4000-a000-000000000002', 1, '{"language":{"source":"auto","target":"vi"},"translation":{"capability":"translation","provider_mode":"workspace_default"},"voice":{"capability":"tts","provider_mode":"workspace_default","voice":"vi-VN-HoaiMyNeural"},"video":{"aspect_ratio":"9:16","resolution":"1080x1920"},"subtitle":{"enabled":true},"audio":{"original_volume":0.15}}', 'v1-yt-shorts'),
  ('b0000000-0003-4000-a000-000000000003', 'a0000000-0003-4000-a000-000000000003', 1, '{"language":{"source":"auto","target":"vi"},"translation":{"capability":"translation","provider_mode":"workspace_default"},"voice":{"capability":"tts","provider_mode":"workspace_default","voice":"vi-VN-HoaiMyNeural"},"video":{"aspect_ratio":"9:16","resolution":"1080x1920"},"subtitle":{"enabled":true},"audio":{"original_volume":0.2}}', 'v1-fb-reels'),
  ('b0000000-0004-4000-a000-000000000004', 'a0000000-0004-4000-a000-000000000004', 1, '{"language":{"source":"zh","target":"vi"},"translation":{"capability":"translation","provider_mode":"workspace_default"},"voice":{"capability":"tts","provider_mode":"workspace_default","voice":"vi-VN-HoaiMyNeural"},"video":{"aspect_ratio":"9:16","resolution":"1080x1920"},"subtitle":{"enabled":true},"audio":{"original_volume":0.1}}', 'v1-tiktok'),
  ('b0000000-0005-4000-a000-000000000005', 'a0000000-0005-4000-a000-000000000005', 1, '{"language":{"source":"zh","target":"vi"},"translation":{"capability":"translation","provider_mode":"workspace_default"},"voice":{"capability":"tts","provider_mode":"workspace_default","voice":"vi-VN-HoaiMyNeural"},"video":{"aspect_ratio":"9:16","resolution":"1080x1920"},"subtitle":{"enabled":true},"audio":{"original_volume":0.1}}', 'v1-douyin'),
  ('b0000000-0006-4000-a000-000000000006', 'a0000000-0006-4000-a000-000000000006', 1, '{"language":{"source":"auto","target":"vi"},"translation":{"capability":"translation","provider_mode":"workspace_default"},"voice":{"capability":"tts","provider_mode":"workspace_default","voice":"vi-VN-HoaiMyNeural"},"video":{"aspect_ratio":"9:16","resolution":"1080x1920"},"subtitle":{"enabled":true},"audio":{"original_volume":0.0}}', 'v1-narration'),
  ('b0000000-0007-4000-a000-000000000007', 'a0000000-0007-4000-a000-000000000007', 1, '{"language":{"source":"auto","target":"vi"},"translation":{"capability":"translation","provider_mode":"workspace_default"},"voice":{"capability":"tts","provider_mode":"workspace_default","voice":"vi-VN-HoaiMyNeural"},"video":{"aspect_ratio":"9:16","resolution":"1080x1920"},"subtitle":{"enabled":true},"audio":{"original_volume":0.1}}', 'v1-edu'),
  ('b0000000-0008-4000-a000-000000000008', 'a0000000-0008-4000-a000-000000000008', 1, '{"language":{"source":"zh","target":"vi"},"translation":{"capability":"translation","provider_mode":"workspace_default"},"voice":{"capability":"tts","provider_mode":"workspace_default","voice":"vi-VN-NamMinhNeural"},"video":{"aspect_ratio":"9:16","resolution":"1080x1920"},"subtitle":{"enabled":true},"audio":{"original_volume":0.15}}', 'v1-news'),
  ('b0000000-0009-4000-a000-000000000009', 'a0000000-0009-4000-a000-000000000009', 1, '{"language":{"source":"zh","target":"vi"},"translation":{"capability":"translation","provider_mode":"workspace_default"},"voice":{"capability":"tts","provider_mode":"workspace_default","voice":"vi-VN-HoaiMyNeural"},"video":{"aspect_ratio":"9:16","resolution":"1080x1920"},"subtitle":{"enabled":true},"audio":{"original_volume":0.2}}', 'v1-affiliate'),
  ('b0000000-0010-4000-a000-000000000010', 'a0000000-0010-4000-a000-000000000010', 1, '{"language":{"source":"auto","target":"vi"},"translation":{"capability":"translation","provider_mode":"workspace_default"},"voice":{"capability":"tts","provider_mode":"workspace_default","voice":"vi-VN-HoaiMyNeural"},"video":{"aspect_ratio":"9:16","resolution":"1080x1920"},"subtitle":{"enabled":true},"audio":{"original_volume":0.0}}', 'v1-podcast')
ON CONFLICT (template_id, version) DO NOTHING;

-- Update current_version_id
UPDATE aidilam_app.template_definitions SET current_version_id = 'b0000000-0001-4000-a000-000000000001' WHERE id = 'a0000000-0001-4000-a000-000000000001';
UPDATE aidilam_app.template_definitions SET current_version_id = 'b0000000-0002-4000-a000-000000000002' WHERE id = 'a0000000-0002-4000-a000-000000000002';
UPDATE aidilam_app.template_definitions SET current_version_id = 'b0000000-0003-4000-a000-000000000003' WHERE id = 'a0000000-0003-4000-a000-000000000003';
UPDATE aidilam_app.template_definitions SET current_version_id = 'b0000000-0004-4000-a000-000000000004' WHERE id = 'a0000000-0004-4000-a000-000000000004';
UPDATE aidilam_app.template_definitions SET current_version_id = 'b0000000-0005-4000-a000-000000000005' WHERE id = 'a0000000-0005-4000-a000-000000000005';
UPDATE aidilam_app.template_definitions SET current_version_id = 'b0000000-0006-4000-a000-000000000006' WHERE id = 'a0000000-0006-4000-a000-000000000006';
UPDATE aidilam_app.template_definitions SET current_version_id = 'b0000000-0007-4000-a000-000000000007' WHERE id = 'a0000000-0007-4000-a000-000000000007';
UPDATE aidilam_app.template_definitions SET current_version_id = 'b0000000-0008-4000-a000-000000000008' WHERE id = 'a0000000-0008-4000-a000-000000000008';
UPDATE aidilam_app.template_definitions SET current_version_id = 'b0000000-0009-4000-a000-000000000009' WHERE id = 'a0000000-0009-4000-a000-000000000009';
UPDATE aidilam_app.template_definitions SET current_version_id = 'b0000000-0010-4000-a000-000000000010' WHERE id = 'a0000000-0010-4000-a000-000000000010';

-- Rollback: DROP TABLE aidilam_app.template_usage; DROP TABLE aidilam_app.template_versions; DROP TABLE aidilam_app.template_definitions;
