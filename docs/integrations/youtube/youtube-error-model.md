# YouTube Error Classification

| Category | Retryable | Backoff | Owner Action |
|----------|-----------|---------|-------------|
| AUTH_EXPIRED | yes (once) | immediate refresh | none initially |
| AUTH_REVOKED | permanent | none | reauthorize |
| QUOTA_EXHAUSTED | yes | 24hr or retry-after | upgrade quota |
| RATE_LIMITED | yes | retry-after header | none |
| INVALID_MEDIA | permanent | none | fix source |
| INVALID_METADATA | permanent | none | fix config |
| CHANNEL_NOT_FOUND | permanent | none | rebind account |
| PERMISSION_DENIED | permanent | none | reauthorize |
| DUPLICATE_REQUEST | permanent (idempotent) | none | reconcile |
| SESSION_EXPIRED | yes | create new session | none |
| UPLOAD_INTERRUPTED | yes | resume from checkpoint | none |
| PROCESSING_FAILED | permanent | none | investigate |
| PLATFORM_INTERNAL | yes | exponential | none |
| NETWORK_TRANSIENT | yes | exponential | none |
| UNKNOWN | yes (limited) | exponential | investigate |
