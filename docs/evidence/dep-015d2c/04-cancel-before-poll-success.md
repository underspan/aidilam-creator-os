# DEP-015D2C Cancel Before Poll Success

## Mechanism
- Poll loop checks cancel_requested at start of each iteration
- If cancel persisted before pollStatus call: cancel wins immediately
- Proven in D2B parallel-cancel test (cancel detected in poll loop → cancelled)

## Code Path
```
while (pollCount < maxPollCount) {
  const cancelCheck = await pool.query(status WHERE id=$1);
  if (cancelCheck === 'cancel_requested') {
    await handleActiveCancellation(...);
    return;
  }
  await sleep(pollIntervalMs);  // 2s
  pollResult = await adapter.pollStatus(...);
}
```
