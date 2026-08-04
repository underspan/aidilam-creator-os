# DEP-015D2D Poll Success Before Cancel

## Execution
- Same poll-barrier scenario, no cancel during barrier
- pollStatus() delays 4s, returns succeeded
- Worker settles success (no cancel_requested in DB)

## Verified State
- job: succeeded
- url: mock://tiktok/poll-barrier-success
- usage: 1
- reservation: committed

## Cancel After Success
- Cancel API: 409 "Job is already terminal"
- adapter.cancel(): 0

## Aggregate
- Duplicate terminal outcomes: 0
- Duplicate usage: 0
