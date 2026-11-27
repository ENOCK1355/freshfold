ALTER TABLE "Company" ADD COLUMN "primaryAreaId" TEXT;

-- Preserve existing profiles. Only infer a base area when the address matches
-- exactly one configured area, or the business has exactly one coverage area.
WITH matches AS (
  SELECT c."id", MIN(a."id") AS "areaId"
  FROM "Company" c
  JOIN "Area" a ON
    LOWER(c."location") LIKE '%' || LOWER(a."name") || '%'
    OR LOWER(c."location") LIKE '%' || REPLACE(LOWER(a."id"), '-', ' ') || '%'
  GROUP BY c."id"
  HAVING COUNT(*) = 1
)
UPDATE "Company" c SET "primaryAreaId" = matches."areaId"
FROM matches WHERE c."id" = matches."id";

WITH single_area AS (
  SELECT "companyId", MIN("areaId") AS "areaId"
  FROM "CompanyArea" GROUP BY "companyId" HAVING COUNT(*) = 1
)
UPDATE "Company" c SET "primaryAreaId" = single_area."areaId"
FROM single_area
WHERE c."id" = single_area."companyId" AND c."primaryAreaId" IS NULL;

CREATE INDEX "Company_primaryAreaId_idx" ON "Company"("primaryAreaId");
ALTER TABLE "Company" ADD CONSTRAINT "Company_primaryAreaId_fkey"
  FOREIGN KEY ("primaryAreaId") REFERENCES "Area"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
