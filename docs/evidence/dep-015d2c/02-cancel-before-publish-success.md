# DEP-015D2C Cancel Before Publish Success (Executed Barrier)

## Barrier Scenario: publish_mock_success_barrier
- Adapter pauses 4s before returning success result
- Worker claims job, enters barrier

## Cancel Injection
- Cancel API called during barrier: HTTP 200, status=cancel_requested
- Job DB: cancel_requested while adapter still sleeping

## After Barrier Release
- Worker returns from adapter.publish()
- Post-execution cancel check: detects cancel_requested
- handleActiveCancellation called
- adapter.cancel() invoked

## Final State
- job: cancelled
- url: null
- usage: 0
- reservation: released
- success settlement: 0 (never committed)
- adapter.cancel calls: 1
