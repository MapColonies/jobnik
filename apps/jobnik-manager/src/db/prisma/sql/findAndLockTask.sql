SELECT t.*
FROM "job_manager"."task" t
INNER JOIN "job_manager"."stage" s ON t."stage_id" = s.id
INNER JOIN "job_manager"."job" j ON s."job_id" = j.id
WHERE s.type = $1
  AND t.status IN ('PENDING', 'RETRIED')
  AND s.status IN ('PENDING', 'IN_PROGRESS')
  AND j.status IN ('PENDING', 'IN_PROGRESS')
ORDER BY j.priority ASC
LIMIT 1
FOR UPDATE OF t SKIP LOCKED;
