# DEP-015D1B Execution Context Security

## Scan Before adapter.publish()
- detectCredentialFields() called on assembled ServerResolvedPublishInput
- Fields checked: access_token, refresh_token, password, cookie, authorization, client_secret, session, bearer

## Context Contains Only
- jobId, projectId (safe identifiers)
- sourceAssetKey (bucket/key reference — not presigned)
- caption (from plan content snapshot)
- hashtags, privacy (from plan)
- platformKey
- validationScenario (if validation mode)

## Does NOT Contain
- Raw credential values: 0
- Tokens: 0
- Presigned URLs: 0
- Host workspace paths: 0
- Authorization headers: 0
