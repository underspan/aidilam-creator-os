# DEP-015D2B Bidirectional Isolation
- A→B cancel: 404 "Publishing job not found"
- B→A cancel: 404 "Publishing job not found"
- Cross-project mutations: 0
- Metadata leakage: NONE
- All queries include AND project_id=$2
