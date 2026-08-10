# AIĐiLàm Project Context

## Identity

- Project: AIĐiLàm Creator OS
- Domain: aidilam.com
- Type: Private-first AI Creator Operating System
- Purpose: Chinese video content → Vietnamese repurposed content
- Target users: Vietnamese content creators who repurpose Chinese-language video

## Technology Stack

- Frontend: Next.js 14+ (App Router), TypeScript, TailwindCSS
- Backend: Node.js (business logic), TypeScript
- Workers: Python (media processing only)
- Database: PostgreSQL (primary), Redis (cache/queues), Qdrant (vector search)
- Storage: MinIO (S3-compatible object storage)
- Media: FFmpeg (transcoding, subtitle burn-in, audio extraction)
- Containerization: Docker Compose on SUSE Linux

## Deployment & Hosting

- Host OS: SUSE Linux
- Deployment method: Docker Compose (single-node)
- All services run as containers on the same host
- Workspace: Ubuntu shared workspace container (contains Kiro CLI for both projects)
- Coexists with: Underspan — sibling project, shares the workspace and physical server

## Canonical Architecture v1.2

### Shared Workspace

The current Ubuntu container is a shared development and management workspace.

It contains Kiro CLI and project workspaces for:

- AIĐiLàm at `/opt/aidilam`
- Underspan at `/opt/underspan`

The shared workspace does not imply shared application architecture.

AIĐiLàm and Underspan remain independent sibling projects.

### Infrastructure Topology

1. SUSE Linux Host
   - owns the kernel, Docker Engine, storage, network, firewall and system services.

2. Ubuntu Shared Workspace Container
   - runs inside the Docker Engine on the SUSE host;
   - is a shared development and management workspace;
   - contains Kiro CLI, Git, SSH client and build tools;
   - hosts AIĐiLàm workspace at /opt/aidilam;
   - hosts Underspan workspace at /opt/underspan;
   - hosts Underspan development runtime (Astro on port 4321);
   - is not an AIĐiLàm application container;
   - is not an Underspan application container.

3. Application Layer
   - AIĐiLàm and Underspan are independent sibling applications;
   - each owns its own source, Compose project, containers, networks, volumes, credentials and data;
   - neither application owns or contains the workspace container.

### Scope Selection

Kiro's active authorization is determined by the current project root.

When operating in `/opt/aidilam`:

- Kiro may manage AIĐiLàm only.
- `/opt/underspan` is protected.
- Underspan processes, ports, files, Git repositories and credentials must not be modified.
- NEMO OS is out of scope.
- Unknown resources are protected by default.

When operating in `/opt/underspan`, AIĐiLàm resources are outside the active project scope.

### Runtime Isolation

The projects may share the Ubuntu workspace and installed developer tools.

They must not share:

- application databases;
- Redis;
- Qdrant;
- MinIO;
- Docker networks;
- Docker volumes;
- runtime credentials;
- secrets;
- Compose projects;
- application containers.

### Shared Container Lifecycle

The current Ubuntu workspace container also hosts the existing Underspan
development runtime.

Therefore it must not be stopped, restarted, renamed, removed or recreated
from an AIĐiLàm task.

Any container lifecycle operation requires an explicit cross-project impact
assessment and operator approval.

### Docker Management Path

The workspace container does not have Docker CLI or Docker socket mounted.

Docker operations are performed via SSH to the SUSE host:

```
Kiro inside Ubuntu shared workspace
    → SSH client
    → SUSE Linux host
    → Docker CLI and Docker Compose
```

No Docker TCP. No Docker-in-Docker. No Docker daemon inside the workspace.

## Project Isolation — Mandatory Boundaries

- AIĐiLàm is an independent application
- Underspan is an independent application — shares the workspace and physical server
- NEMO OS is a separate project on another server — completely out of scope
- The Ubuntu workspace container is shared — not owned by either project
- AIĐiLàm project root: `/opt/aidilam`
- Underspan project root: `/opt/underspan`

### Isolation Rules

AIĐiLàm and Underspan are sibling projects. Neither project may:

- modify the other's containers
- reuse the other's databases
- reuse Redis
- reuse Qdrant
- reuse MinIO
- reuse Docker networks
- reuse credentials or secrets

### Management Scope

Kiro is authorized to manage AIĐiLàm only.
Kiro must never modify Underspan.
Unknown resources must be treated as protected until ownership is proven.

### Allowed Management Scope

- /opt/aidilam and approved AIĐiLàm data/backup paths
- Docker resources owned by AIĐiLàm (prefix: aidilam-)
- Documentation, source, builds, and releases belonging to AIĐiLàm

### Docker Ownership Identification

- Compose project name: `aidilam`
- Container name prefix: `aidilam-`
- Network name prefix: `aidilam-`
- Volume name prefix: `aidilam-`
- Project ownership labels required

### Default-Deny Rule

Any resource not conclusively identified as AIĐiLàm-owned must NOT be changed.

### Explicitly Prohibited

- NEMO OS access, integration, or management
- Shared runtime between AIĐiLàm and any other project
- Shared credentials, databases, Redis, Qdrant, MinIO, or Docker networks with other projects
- Modification of Underspan resources
- Development of a generic multi-project platform within the AIĐiLàm roadmap

## Directory Layout

- Source code: /opt/aidilam/source/
- Documentation: /opt/aidilam/docs/
- Steering files: /opt/aidilam/.kiro/steering/
- Docker configs: /opt/aidilam/source/docker/

## Language Conventions

- Documentation language: Vietnamese
- Code language: English (variables, functions, comments)
- Commit messages: English
- UI strings: Vietnamese (user-facing), English (developer/admin)

## Key Principles

- Privacy-first: No external analytics, no telemetry to third parties
- Self-hosted: All data stays on owner's infrastructure
- Offline-capable: Core workflows function without internet
- Creator-centric: Every feature serves the content repurposing pipeline
- Modular: Services are independently deployable containers

## Related Steering Files

- Architecture: aidilam-architecture-rules.md
- Security: aidilam-security-rules.md
- Model Routing: aidilam-model-routing-rules.md
