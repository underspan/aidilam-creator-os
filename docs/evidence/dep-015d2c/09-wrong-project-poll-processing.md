# DEP-015D2C Wrong-Project Poll Processing

## Architecture
- Polling is inline within the worker processor (not separate BullMQ item)
- Poll execution requires successful job claim first
- Job claim: WHERE id=$1 AND project_id=$2

## Protection
- Same protection as retry delivery (proven in 08)
- Wrong project → 0 rows → skip
- pollStatus never called for wrong project

## Result
- pollStatus calls from wrong project: 0
- Job unchanged, mutations: 0
