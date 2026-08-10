#!/usr/bin/env bash
set -euo pipefail
echo '=== AIĐiLàm Queue Status ==='
ssh -F /opt/aidilam/.management-state/ssh/config aidilam-host \
  'docker exec aidilam-worker node -e "
const { Queue } = require(\"bullmq\");
const queue = new Queue(\"aidilam-jobs\", {
  prefix: \"aidilam:queue\",
  connection: { host: process.env.REDIS_HOST || \"redis\", port: 6379 }
});
(async () => {
  const counts = await queue.getJobCounts();
  console.log(\"Queue: aidilam-jobs\");
  console.log(\"Prefix: aidilam:queue\");
  console.log(\"---\");
  Object.entries(counts).forEach(([k, v]) => console.log(k + \": \" + v));
  await queue.close();
})();
"'
