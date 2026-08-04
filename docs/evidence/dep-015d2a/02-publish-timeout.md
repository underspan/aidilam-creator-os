# DEP-015D2A Publish Timeout
- Scenario: publish_timeout (retryable=true, MOCK_TIMEOUT)
- maxAttempts: 3 (job column)
- Attempt 1: retryable_failed → retry_wait → delayed BullMQ item
- Attempt 2: retryable_failed → retry_wait
- Attempt 3: PUBLISHING_RETRY_EXHAUSTED
- Final: failed, reservation=released, usage=0
- Bounded execution: yes (mock instant timeout return)
