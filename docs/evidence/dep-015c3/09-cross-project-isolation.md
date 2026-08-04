# DEP-015C3 Cross-Project Isolation

## Project B Resources
- 1 account, 1 destination, 1 profile, 1 asset, 1 job

## A → B Tests (all denied)
- A-Creator read B jobs: 403
- A-Creator read B job detail: 403
- A-Canceller cancel B job: 403
- Metadata leakage: NONE

## B → A Tests (all denied)
- B-Creator read A jobs: 403
- B-Reader read A job detail: 403
- Metadata leakage: NONE

## Foreign Relationship Tests (all denied)
- A job with B profile: 404 (profile not found in project)
- A job with B asset: 404 (asset not found in project)
- New jobs created: 0
- New plans: 0
- New reservations: 0
- Unauthorized mutations: 0
