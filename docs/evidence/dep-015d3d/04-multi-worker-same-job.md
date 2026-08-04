# DEP-015D3D Multi-Worker Same-Job
- 2 workers available, 1 slow job submitted
- Result: attempts=1, publish calls=1, usage=1, succeeded
- FOR UPDATE prevents duplicate claim across processes
- Only one worker executed the job
