# DEP-015D2A Cancel vs Poll Success Race
- Poll loop checks cancel_requested at each iteration
- If cancel detected: stops polling, calls adapter.cancel()
- If poll returns success before cancel: success wins
- Live: poll succeeded before cancel arrived → 409 on cancel
- One terminal state per job
