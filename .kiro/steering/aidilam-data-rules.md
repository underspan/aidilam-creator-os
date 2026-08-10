# Aidilam Data Rules

## Scope
These rules govern all data storage, retrieval, and lifecycle decisions in the Aidilam platform.

## System of Record

- PostgreSQL is the single system of record for structured data.
- All authoritative state lives in PostgreSQL. Other stores are caches or projections.
- Do not store binary/blob data in PostgreSQL. Use MinIO for all media and file storage.

## Object Storage (MinIO)

- MinIO is the storage layer for all media files, documents, and binary assets.
- Original uploaded files are immutable — never overwrite or modify an original.
- Store originals in a dedicated `originals/` prefix, separate from derived outputs.
- Derived/processed files reference their source original via lineage metadata.

## Lineage & Checksums

- Every stored object must have lineage tracking: who created it, from what source, when.
- Compute and store checksums (SHA-256) for all stored objects at ingest time.
- Use checksums for deduplication — do not store duplicate content under different keys.
- Lineage metadata is stored in PostgreSQL, linked to the object's storage key.

## Workspace Isolation

- All data is scoped to a workspace_id. No cross-workspace data access is permitted.
- Every query must filter by workspace_id. No global queries without explicit authorization.
- Row-level security or application-layer enforcement is mandatory.

## Deletion & Audit

- Use soft delete for all user-facing data. Set deleted_at timestamp, do not DROP rows.
- Hard deletes are only permitted by scheduled retention jobs after the audit window.
- All mutations (create, update, delete) must produce an audit trail entry.
- Audit entries include: actor, action, timestamp, workspace_id, and affected record.

## Migrations

- Database migrations are forward-only in production. No down migrations in prod.
- Every migration must be backward-compatible with the previous application version.
- Test migrations against a copy of production schema before applying.
- Migration files are sequentially numbered and never modified after merge.

## Backup & Classification

- Respect the backup classification of each table (critical, standard, ephemeral).
- Critical tables require point-in-time recovery capability.
- Ephemeral tables (caches, temp projections) are excluded from backup.
- Do not store classified data in unclassified tables.

## Connection Management

- Use connection pooling. Do not open unbounded connections.
- Set statement timeouts for long-running queries.
- Read replicas are acceptable for analytics; writes go to primary only.
