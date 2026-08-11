-- Migration 022: Commercial Provider Registry
-- AIDILAM-COM-04B
-- Workspace-scoped provider configuration with no raw secrets in DB.

-- System-level provider catalog
CREATE TABLE IF NOT EXISTS aidilam_app.provider_definitions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  name text NOT NULL,
  description text,
  provider_type text NOT NULL CHECK (provider_type IN ('local', 'online_free', 'online_paid', 'self_hosted')),
  capabilities text[] NOT NULL DEFAULT '{}',
  network_required boolean NOT NULL DEFAULT false,
  credential_required boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'available' CHECK (status IN ('available', 'deprecated', 'coming_soon')),
  metadata_json jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Workspace-scoped provider configuration
CREATE TABLE IF NOT EXISTS aidilam_app.workspace_provider_configs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES aidilam_app.workspaces(id),
  provider_id uuid NOT NULL REFERENCES aidilam_app.provider_definitions(id),
  capability text NOT NULL,
  enabled boolean NOT NULL DEFAULT true,
  is_default boolean NOT NULL DEFAULT false,
  priority integer NOT NULL DEFAULT 100,
  configuration_json jsonb NOT NULL DEFAULT '{}',
  credential_reference text,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'disabled', 'error')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, provider_id, capability)
);
CREATE INDEX IF NOT EXISTS idx_ws_provider_configs_workspace ON aidilam_app.workspace_provider_configs(workspace_id);
CREATE INDEX IF NOT EXISTS idx_ws_provider_configs_capability ON aidilam_app.workspace_provider_configs(workspace_id, capability);

-- Seed provider catalog
INSERT INTO aidilam_app.provider_definitions (id, code, name, description, provider_type, capabilities, network_required, credential_required, status) VALUES
  ('b0000000-0000-4000-a000-000000000001', 'faster_whisper', 'faster-whisper', 'Local speech-to-text using Whisper models', 'local', ARRAY['stt'], false, false, 'available'),
  ('b0000000-0000-4000-a000-000000000002', 'google_translate_free', 'Google Translate (Community)', 'Free online neural machine translation', 'online_free', ARRAY['translation'], true, false, 'available'),
  ('b0000000-0000-4000-a000-000000000003', 'edge_tts', 'Microsoft Edge TTS', 'Free online neural text-to-speech', 'online_free', ARRAY['tts'], true, false, 'available'),
  ('b0000000-0000-4000-a000-000000000004', 'ffmpeg', 'FFmpeg', 'Local media processing and rendering engine', 'local', ARRAY['render'], false, false, 'available'),
  ('b0000000-0000-4000-a000-000000000010', 'openai', 'OpenAI', 'GPT and Whisper API', 'online_paid', ARRAY['llm','translation','stt','tts'], true, true, 'coming_soon'),
  ('b0000000-0000-4000-a000-000000000011', 'gemini', 'Google Gemini', 'Gemini multimodal AI', 'online_paid', ARRAY['llm','translation'], true, true, 'coming_soon'),
  ('b0000000-0000-4000-a000-000000000012', 'claude', 'Anthropic Claude', 'Claude AI assistant', 'online_paid', ARRAY['llm','translation'], true, true, 'coming_soon'),
  ('b0000000-0000-4000-a000-000000000013', 'elevenlabs', 'ElevenLabs', 'Premium voice synthesis', 'online_paid', ARRAY['tts'], true, true, 'coming_soon'),
  ('b0000000-0000-4000-a000-000000000014', 'deepseek', 'DeepSeek', 'Open-weight LLM', 'online_paid', ARRAY['llm','translation'], true, true, 'coming_soon')
ON CONFLICT (code) DO NOTHING;

-- Seed default workspace configs for Workspace A
INSERT INTO aidilam_app.workspace_provider_configs (workspace_id, provider_id, capability, enabled, is_default) VALUES
  ('a0000000-0000-4000-a000-000000000001', 'b0000000-0000-4000-a000-000000000001', 'stt', true, true),
  ('a0000000-0000-4000-a000-000000000001', 'b0000000-0000-4000-a000-000000000002', 'translation', true, true),
  ('a0000000-0000-4000-a000-000000000001', 'b0000000-0000-4000-a000-000000000003', 'tts', true, true),
  ('a0000000-0000-4000-a000-000000000001', 'b0000000-0000-4000-a000-000000000004', 'render', true, true)
ON CONFLICT (workspace_id, provider_id, capability) DO NOTHING;

-- Seed for Workspace B
INSERT INTO aidilam_app.workspaces (id, code, name, description, status)
VALUES ('b0000000-0000-4000-a000-000000000002', 'workspace-b', 'Workspace B', 'Second workspace', 'active')
ON CONFLICT (id) DO NOTHING;
INSERT INTO aidilam_app.workspace_provider_configs (workspace_id, provider_id, capability, enabled, is_default) VALUES
  ('b0000000-0000-4000-a000-000000000002', 'b0000000-0000-4000-a000-000000000001', 'stt', true, true),
  ('b0000000-0000-4000-a000-000000000002', 'b0000000-0000-4000-a000-000000000002', 'translation', true, true),
  ('b0000000-0000-4000-a000-000000000002', 'b0000000-0000-4000-a000-000000000003', 'tts', true, true),
  ('b0000000-0000-4000-a000-000000000002', 'b0000000-0000-4000-a000-000000000004', 'render', true, true)
ON CONFLICT (workspace_id, provider_id, capability) DO NOTHING;

-- Rollback: DROP TABLE aidilam_app.workspace_provider_configs; DROP TABLE aidilam_app.provider_definitions;
