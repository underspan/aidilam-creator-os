# DEP-015D2B Parallel Cancel Exactly-Once
- Job in publishing/polling state (publish_mock_poll_timeout)
- 20 concurrent cancel requests: 1×200 + 19×409 + 0×500
- Worker: adapter.cancel() called exactly once (log confirmed)
- Final: job=cancelled, reservation=released, usage=0
- Cancel audit events: 1 (publishing_job_cancelled)
- Cancel-requested events: 1 (publishing_cancel_requested)
