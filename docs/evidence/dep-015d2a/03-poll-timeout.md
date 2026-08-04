# DEP-015D2A Poll Timeout
- Scenario: publish_mock_poll_timeout
- pollIntervalMs: 2000, maxPollCount: 5
- publish() returns pending with mock-poll-timeout-{id}
- pollStatus() always returns pending (prefix match)
- After 5 polls: PUBLISHING_POLL_TIMEOUT (retryable)
- Retried until exhaustion
- Final: failed, PUBLISHING_RETRY_EXHAUSTED, reservation=released, usage=0
- Poll items remaining: 0 (all terminated)
