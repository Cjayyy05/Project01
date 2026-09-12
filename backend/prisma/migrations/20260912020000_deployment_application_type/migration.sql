-- CreateEnum
CREATE TYPE "ApplicationType" AS ENUM ('DOCKERFILE', 'NODE', 'PYTHON');

-- AlterTable
ALTER TABLE "Deployment"
ADD COLUMN "applicationType" "ApplicationType";
