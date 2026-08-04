# DEP-015D2B Wrong-Project Poll Payload
- Polling is inline (not separate BullMQ item)
- Same protection: job claim uses WHERE id=$1 AND project_id=$2
- Wrong project → job not found → skip (proven in retry payload test)
- pollStatus calls from wrong project: 0
