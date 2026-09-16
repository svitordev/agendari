-- CreateEnum
CREATE TYPE "AppointmentCancelledBy" AS ENUM ('PROFESSIONAL', 'CUSTOMER');

-- AlterTable
ALTER TABLE "appointments" ADD COLUMN     "cancellationReason" TEXT,
ADD COLUMN     "cancelledAt" TIMESTAMP(3),
ADD COLUMN     "cancelledBy" "AppointmentCancelledBy";

-- AlterTable
ALTER TABLE "professionals" ADD COLUMN     "whatsapp" TEXT;
