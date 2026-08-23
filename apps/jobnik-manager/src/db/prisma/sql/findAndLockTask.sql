SELECT t.*
FROM "job_manager"."task" t
INNER JOIN "job_manager"."stage" s ON t."stage_id" = s.id
INNER JOIN "job_manager"."job" j ON s."job_id" = j.id
WHERE s.type = $1
  AND t.status IN ('Pending', 'Retried')
  AND s.status IN ('Pending', 'In-Progress')
  AND j.status IN ('Pending', 'In-Progress')
ORDER BY j.priority ASC
LIMIT 1
FOR UPDATE OF t SKIP LOCKED;
