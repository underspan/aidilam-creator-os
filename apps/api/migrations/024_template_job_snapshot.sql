-- Migration 024: Template fields on jobs
ALTER TABLE aidilam_app.jobs ADD COLUMN IF NOT EXISTS template_id uuid REFERENCES aidilam_app.template_definitions(id);
ALTER TABLE aidilam_app.jobs ADD COLUMN IF NOT EXISTS template_version_id uuid REFERENCES aidilam_app.template_versions(id);
ALTER TABLE aidilam_app.jobs ADD COLUMN IF NOT EXISTS effective_config_json jsonb;
