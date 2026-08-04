# DEP-015D2D Cancel Before Poll Success (Executed Barrier)

## Scenario: publish_mock_poll_success_barrier
- publish() returns pending with mock-poll-barrier-{id}
- pollStatus() delays 4s then returns succeeded

## Execution
- Worker claims job, publish returns pending
- Job enters polling (current_stage=polling)
- pollInterval(2s) + pollStatus enters 4s barrier
- Cancel API called: 200, status=cancel_requested

## After Barrier Release
- pollStatus returns succeeded
- Worker checks cancel_requested (post-poll check added in D2D)
- cancel_requested detected → handleActiveCancellation
- adapter.cancel() called once

## Final State
- job: cancelled
- url: null
- usage: 0
- reservation: released
- poll-success settlement: 0 (not committed)
- cancel terminal events: 1
- poll calls after terminal: 0
