-- CreateTable
CREATE TABLE "availability_periods" (
    "id" TEXT NOT NULL,
    "startTime" TEXT NOT NULL,
    "endTime" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "availabilityId" TEXT NOT NULL,

    CONSTRAINT "availability_periods_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "availability_periods_availabilityId_startTime_key"
ON "availability_periods"("availabilityId", "startTime");

-- AddForeignKey
ALTER TABLE "availability_periods"
ADD CONSTRAINT "availability_periods_availabilityId_fkey"
FOREIGN KEY ("availabilityId")
REFERENCES "availabilities"("id")
ON DELETE CASCADE
ON UPDATE CASCADE;

-- Migra os horários antigos para a nova tabela de períodos.
--
-- Antes:
-- Availability
-- startTime = 08:00
-- endTime   = 18:00
--
-- Depois:
-- Availability
--   └── AvailabilityPeriod
--       startTime = 08:00
--       endTime   = 18:00
INSERT INTO "availability_periods" (
    "id",
    "startTime",
    "endTime",
    "createdAt",
    "updatedAt",
    "availabilityId"
)
SELECT
    'legacy_' || "id",
    "startTime",
    "endTime",
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP,
    "id"
FROM "availabilities"
WHERE "startTime" IS NOT NULL
  AND "endTime" IS NOT NULL;

-- Somente depois de copiar os dados antigos,
-- removemos as colunas antigas.
ALTER TABLE "availabilities"
DROP COLUMN "endTime",
DROP COLUMN "startTime";