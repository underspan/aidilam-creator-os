# AIĐiLàm Architecture Rules

## Modular Monolith Approach

- The system is a modular monolith deployed as containers, NOT microservices
- Each bounded context is a module with clear boundaries
- Modules communicate via well-defined internal APIs or event bus
- No distributed transactions — use eventual consistency patterns
- Modules may be extracted to services later, but default is co-located

## Bounded Contexts

- Content Ingestion: downloading, parsing, metadata extraction
- Media Processing: transcoding, subtitle extraction, audio separation
- Translation: text translation, subtitle generation, voice synthesis
- Publishing: scheduling, platform adapters, distribution
- Workspace: user settings, project management, asset library
- Analytics: usage tracking, performance metrics (internal only)

## Layered Architecture (per module)

- Domain Layer: business entities, value objects, domain events — NO external deps
- Application Layer: use cases, orchestration — depends only on Domain
- Infrastructure Layer: database, external APIs, file system — implements interfaces
- Presentation Layer: API routes, controllers — depends on Application

## Dependency Direction

- Dependencies point INWARD: Infrastructure → Application → Domain
- Domain layer NEVER imports from Infrastructure or Presentation
- Application layer defines interfaces; Infrastructure implements them
- Use dependency injection to wire implementations at startup

## Language Ownership

- Node.js/TypeScript: ALL business logic, API endpoints, orchestration
- Python: Media processing ONLY (FFmpeg wrappers, audio/video transforms)
- Python workers receive tasks via queue, return results — no business decisions
- NO FastAPI business API — Python does not expose business endpoints
- If logic requires a business decision, it belongs in Node.js

## Provider Abstraction

- NO provider SDK calls in business/domain code
- All external services accessed through adapter interfaces
- Adapters live in Infrastructure layer only
- Switching providers = new adapter, zero domain changes
- Examples: storage adapter (MinIO/S3), LLM adapter, TTS adapter

## API Design

- REST for synchronous client-server communication
- Event/queue for async processing pipelines
- WebSocket for real-time progress updates to UI
- All APIs versioned with /api/v1/ prefix
- Request/response types defined as TypeScript interfaces

## Code Organization Rules

- One module = one directory under /src/modules/
- Shared kernel for cross-cutting types (kept minimal)
- No circular dependencies between modules
- Module boundaries enforced by import restrictions
- Tests live alongside source files (*.test.ts, *.spec.ts)

## Anti-Patterns (REJECT these)

- ❌ God services that span multiple bounded contexts
- ❌ Direct database queries from presentation layer
- ❌ Python making business decisions
- ❌ Importing provider SDKs in domain or application layers
- ❌ Shared mutable state between modules
- ❌ Skipping the application layer (controller → database)
