# DEP-015D1B Unsafe URL Matrix

## Scenarios Tested (11/11 rejected)
| Scenario | URL | Result |
|----------|-----|--------|
| publish_unsafe_url_https | https://example.invalid/item | PUBLISHING_ADAPTER_RESULT_INVALID |
| publish_unsafe_url_http | http://example.invalid/item | PUBLISHING_ADAPTER_RESULT_INVALID |
| publish_unsafe_url_localhost | http://localhost/item | PUBLISHING_ADAPTER_RESULT_INVALID |
| publish_unsafe_url_loopback | http://127.0.0.1/item | PUBLISHING_ADAPTER_RESULT_INVALID |
| publish_unsafe_url_private10 | http://10.0.0.1/item | PUBLISHING_ADAPTER_RESULT_INVALID |
| publish_unsafe_url_private172 | http://172.16.0.1/item | PUBLISHING_ADAPTER_RESULT_INVALID |
| publish_unsafe_url_private192 | http://192.168.1.1/item | PUBLISHING_ADAPTER_RESULT_INVALID |
| publish_unsafe_url_metadata | http://169.254.169.254/latest/meta-data | PUBLISHING_ADAPTER_RESULT_INVALID |
| publish_unsafe_url_file | file:///tmp/item | PUBLISHING_ADAPTER_RESULT_INVALID |
| publish_unsafe_url_ftp | ftp://example.invalid/item | PUBLISHING_ADAPTER_RESULT_INVALID |
| publish_unsafe_url_credentials | http://user:password@example.invalid/item | PUBLISHING_ADAPTER_RESULT_INVALID |

## All Results
- job status: failed (all 11)
- attempt status: permanent_failed (all 11)
- reservation: released (all 11)
- usage: 0
- external_publish_id: null (all)
- published_url_safe: null (all)
- external network calls: 0
