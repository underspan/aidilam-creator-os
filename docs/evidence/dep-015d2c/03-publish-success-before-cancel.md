# DEP-015D2C Publish Success Before Cancel

## Proven in D2B
- Job succeeded (mock instant or before cancel arrives)
- Cancel API: 409 "Job is already terminal"
- Final: succeeded, committed, usage=1
- adapter.cancel: 0
- Duplicate terminal outcomes: 0
