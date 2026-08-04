# DEP-015D2 Live Polling

## Pending-Then-Success
- Scenario: publish_mock_pending
- publish() returns: success=true, pending=true, externalPublishId present
- Worker enters polling stage
- First poll returns: status=succeeded, publishedUrl=mock://...
- Final: job=succeeded, attempt=1, usage=1, reservation=committed
- URL: mock://tiktok/polled-{id}

## Poll Configuration
- pollIntervalMs: 2000
- maxPollCount: 5
- Total max duration: 10s

## Poll Failure (code path)
- mock-pending-fail-{id} prefix → pollStatus returns failed/permanent
- Worker: settleFailure with PUBLISHING_POLL_FAILED
