-- CreateTable
CREATE TABLE "availability_exceptions" (
    "id" TEXT NOT NULL,
    "professionalId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "allDay" BOOLEAN NOT NULL DEFAULT false,
    "startTime" TEXT,
    "endTime" TEXT,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "availability_exceptions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "availability_exceptions_professionalId_date_startTime_endTi_key" ON "availability_exceptions"("professionalId", "date", "startTime", "endTime");

-- AddForeignKey
ALTER TABLE "availability_exceptions" ADD CONSTRAINT "availability_exceptions_professionalId_fkey" FOREIGN KEY ("professionalId") REFERENCES "professionals"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
