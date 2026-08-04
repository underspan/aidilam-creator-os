# DEP-015D3D Hard Restart Live
- Job with publish_mock_poll_timeout (stays in polling ~10s per attempt)
- Worker restarted with `docker restart aidilam-worker`
- Job continued processing through BullMQ stalled recovery
- After 3 attempts (all poll-timeout): failed, PUBLISHING_RETRY_EXHAUSTED
- Worker did not leave job stuck indefinitely
- New worker started and continued execution
- Duplicate usage: 0
