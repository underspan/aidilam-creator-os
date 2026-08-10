# Aidilam Media Worker Rules

## Scope
These rules apply to all Python media worker services in the Aidilam platform.

## Communication

- Workers communicate ONLY via Redis queue. No direct HTTP calls to business APIs.
- Workers consume jobs from designated Redis queues and publish results back to Redis.
- Do not import or instantiate HTTP clients for internal business service communication.
- All inter-service coordination flows through the queue contract.

## Job Contract

- Every job must be validated against its schema before processing begins.
- Reject malformed jobs immediately with a structured error published to the dead-letter queue.
- Job payloads must include: job_id, idempotency_key, workspace_id, created_at, and payload body.
- Workers must be idempotent — re-processing the same idempotency_key produces no side effects.

## Heartbeat & Progress

- Workers must emit a heartbeat at a configurable interval (default: 30s) while processing.
- Missing heartbeats signal the orchestrator that the worker may be dead.
- Report progress as percentage (0-100) to the progress channel keyed by job_id.
- Progress updates must not be more frequent than once per second.

## Idempotency

- Use the idempotency_key from the job payload to detect duplicate work.
- Before starting processing, check if output for this key already exists.
- If output exists and is valid, publish success without reprocessing.

## Temporary Files & Cleanup

- All intermediate/temporary files go into a job-scoped temp directory.
- Clean up the temp directory on both success and failure — use try/finally or context managers.
- Never leave orphaned temp files. Register cleanup in an atexit handler as a safety net.

## FFmpeg Execution

- Always invoke FFmpeg using array arguments (subprocess list form).
- NEVER use shell=True or string interpolation for FFmpeg commands.
- Validate all user-supplied values before inserting into the argument array.
- Example: `subprocess.run(["ffmpeg", "-i", input_path, "-c:v", "libx264", output_path])`

## Execution Environment

- Workers must run as a non-root user. Do not assume root privileges.
- Do not write outside of designated directories (temp dir, output dir).
- Respect configured resource limits (memory, CPU, disk) — do not override them in code.

## Concurrency

- Concurrency level (number of parallel jobs per worker) is a configuration value.
- Do not hardcode concurrency. Read from environment or config file.
- Workers must be safe for the configured concurrency level (no shared mutable state).

## Error Handling

- Catch exceptions, publish structured failure messages, then clean up.
- Do not silently swallow errors. All failures must be observable.
- Use exponential backoff for transient Redis connection failures.

## Logging

- Use structured logging (JSON) with job_id and workspace_id in every log line.
- Log at INFO for job start/complete, WARN for retries, ERROR for failures.
- Do not log sensitive media content or user data.
