-- CreateEnum
CREATE TYPE "ProfessionalStatus" AS ENUM ('ACTIVE', 'SUSPENDED');

-- AlterTable
ALTER TABLE "professionals" ADD COLUMN     "status" "ProfessionalStatus" NOT NULL DEFAULT 'ACTIVE';
