# COM-04E3 Evidence 17: Final Result

## AIDILAM-COM-04E3 = NOT PROVEN

### What IS Proven

1. **Shadow execution mode** — DB constraint extended: `dry_run`, `shadow` allowed. `canonical` fails closed (CHECK constraint violation proven live).
2. **Shadow executor architecture** — `shadow-executor.ts` implements generic DAG traversal using frozen snapshot nodes/edges. No hardcoded pipeline sequence. Handler registry is fixed allowlist Map.
3. **Shadow artifact model** — Migration 029 creates `wf_shadow_artifacts`, `wf_shadow_pairs`, `wf_shadow_comparisons`, `wf_shadow_provider_calls` tables with proper isolation constraints.
4. **Pairing model** — `wf_shadow_pairs` links legacy_job_id ↔ shadow_execution_id with UNIQUE constraint. Status model: pending→comparing→pass/fail/inconclusive.
5. **Parity framework** — Text normalization, duration comparison, exact comparison logic implemented and tested. 17 required dimensions defined.
6. **Isolation** — All shadow tables scoped by workspace_id + project_id. Canonical asset/version counts unchanged (61/56). Publishing = 0. Canonical mode INSERT blocked.
7. **Dedicated test suite** — 125 tests PASS (3 files: shadow-executor.test.ts, shadow-parity.test.ts, shadow-coverage.test.ts)
8. **Full regression** — API: 33 files / 620 tests PASS. Worker: 23 tests PASS.

### What IS NOT Proven

**The 3 real matched legacy/shadow pairs with actual provider calls (faster-whisper, Google Translate, Edge TTS, FFmpeg) have NOT been executed.**

#### Blocker

The shadow executor is implemented as an API-layer domain service. Real provider adapters (faster-whisper Python, Edge TTS Python, FFmpeg) live exclusively in the **worker container**. The shadow executor currently operates with mocked dependency injection (proven through 125 tests), but has no worker-container integration pathway to invoke real providers.

#### What Would Unblock

1. Either: wire shadow executor into worker container alongside legacy pipeline (add shadow job type to BullMQ registry)
2. Or: expose provider adapters as callable services from API layer (requires Python runtime access)

Either approach requires additional implementation work that was not completed in this session.

### Remaining Requirements for PASS

- [ ] Real shadow STT call count >= 1
- [ ] Real shadow translation call count >= 1  
- [ ] Real shadow TTS call count >= 1
- [ ] Real shadow render call count >= 1
- [ ] 3 matched pairs with parity comparison results
- [ ] Shadow output playable validation (ffprobe)
- [ ] Worker restart recovery proof
- [ ] Provider drift protection live proof

---

## Final Report (Partial)

| # | Item | Value |
|---|------|-------|
| 1 | Repository/branch/HEAD | /opt/aidilam / develop / c757dc5 |
| 2 | Migration number | 029 |
| 3 | Shadow mode guard | PROVEN (CHECK allows dry_run + shadow only) |
| 4 | Canonical mode request result | FAILS (CHECK constraint violation) |
| 5 | Shadow executor module | shadow-executor.ts (248 lines) |
| 6 | Hardcoded pipeline-next count | 0 (DAG-driven via isNodeReady) |
| 7 | Handler registry | Fixed allowlist Map (10 types registered) |
| 8 | Shadow artifact storage | wf_shadow_artifacts table, shadow/ namespace |
| 9 | Canonical-DAM isolation | PROVEN (assets=61 unchanged, versions=56 unchanged) |
| 10 | Pair model | wf_shadow_pairs (UNIQUE legacy_job_id + shadow_execution_id) |
| 11 | Parity comparison model | wf_shadow_comparisons (17 dimensions) |
| 12-21 | Pair 1 results | **NOT EXECUTED** |
| 22 | Pair 2 overall | **NOT EXECUTED** |
| 23 | Pair 3 overall | **NOT EXECUTED** |
| 24 | Required parity dimension failures | N/A (not executed) |
| 25 | Healthy shadow node success count | 10 (in-memory test) |
| 26 | Real shadow STT call count | **0** |
| 27 | Real shadow translation call count | **0** |
| 28 | Real shadow TTS call count | **0** |
| 29 | Real shadow render call count | **0** |
| 30 | Manual translation count | 0 |
| 31 | Mock provider count | 0 (in prod; tests use mocked deps) |
| 32 | Provider bypass count | 0 |
| 33-36 | Shadow output validation | **NOT EXECUTED** |
| 37 | Canonical asset delta from shadow | 0 |
| 38 | Canonical asset-version delta | 0 |
| 39 | Canonical review delta | 0 |
| 40 | Legacy job mutation from shadow | 0 |
| 41-52 | Idempotency/cancel/recovery | PROVEN (via 125 unit tests) |
| 53 | Drift test | NOT EXECUTED (live) |
| 54-58 | Isolation | PROVEN (tests + DB constraints) |
| 59 | Shadow download security | Designed but not HTTP-tested |
| 60 | Secret leakage | 0 (verified in tests 99-100) |
| 61 | Canonical workflow invocation count | 0 |
| 62 | Normal Create Video runtime | Legacy (unchanged) |
| 63 | Normal Reprocess runtime | Legacy (unchanged) |
| 64 | Shadow successful real execution count | **0** (blocker: no worker integration) |
| 65 | Orphan shadow artifact count | 0 |
| 66 | State invariant violation count | 0 |
| 67 | Dedicated COM-04E3 total | 125 |
| 68 | Dedicated passed | 125 |
| 69 | Dedicated failed | 0 |
| 70 | Dedicated skipped | 0 |
| 71 | API regression | 620 passed / 0 failed |
| 72 | Worker regression | 23 passed / 0 failed |
| 73 | Workflow E1 regression | 65 passed (in API suite) |
| 74 | Workflow E2 regression | 110 passed (in API suite) |
| 75 | Provider Registry regression | PASS |
| 76 | Template regression | PASS |
| 77 | DAM regression | PASS |
| 78 | Workspace tenancy regression | PASS |
| 79 | Build/typecheck | PASS (0 errors) |
| 80 | Publishing trigger count | 0 |
| 81 | External upload count | 0 |
| 82 | Production changed | NO |
| 83 | Remaining limitations | Shadow executor not wired to worker-container providers. No real STT/TTS/FFmpeg calls yet. |
| 84 | Recommendation | Wire shadow execution into worker or expose providers to API layer, then re-run E3. |
| 85 | Final decision | **NOT PROVEN** |

---

**AIDILAM-COM-04E3 = NOT PROVEN**

WORKFLOW EXECUTION FOUNDATION REMAINS OPEN
LEGACY PIPELINE REMAINS CANONICAL
COM-04E4 MUST NOT START

### Blocker Summary
The shadow executor domain model, migration, handler registry, parity framework, and 125 dedicated tests are complete and passing. The missing piece is **worker-container integration** to invoke real faster-whisper/edge-tts/FFmpeg through the shadow executor's node handlers. This requires either:
- Adding a `shadow_workflow` job type to the worker's BullMQ registry that calls `executeShadowWorkflow` with real provider deps
- Or exposing worker provider adapters as callable services from the API layer

Once that bridge is built, re-running E3 with real providers should produce the 3 matched pairs needed for PASS.
