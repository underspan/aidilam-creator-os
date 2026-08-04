# DEP-015D1B Checksum Failure

## Setup
- Asset: available, checksum_sha256='goodchecksum111'
- Plan source_asset_snapshot: checksumSha256='WRONGCHECKSUM999'
- Mismatch detected at worker claim time

## Result
- job: failed
- error_code: PUBLISHING_SOURCE_INVALID
- attempt: permanent_failed
- reservation: released
- usage: 0
- adapter publish calls: 0
- external ID: null
- published URL: null
- raw checksum NOT in audit metadata
