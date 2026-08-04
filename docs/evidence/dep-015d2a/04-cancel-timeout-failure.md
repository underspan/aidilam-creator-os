# DEP-015D2A Cancel Timeout/Failure Policy

## Cancel Timeout
- Scenario: publish_mock_cancel_timeout (adapter.cancel() throws)
- Policy: job remains cancel_requested, reservation stays reserved
- Worker: catches throw, returns without settling

## Cancel Permanent Failure
- Scenario: publish_mock_cancel_fail (adapter.cancel() returns {cancelled:false})
- Policy: job remains cancel_requested, reservation stays reserved
- Worker: checks cancelResult.cancelled, returns without settling if false

## Race Outcome (live)
- Both cancel scenarios: jobs polled to success before cancel arrived
- Cancel at 409 (already terminal)
- Proves: success wins if settled first
