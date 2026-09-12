-- AlterTable
ALTER TABLE "Deployment"
ADD COLUMN "rollbackSourceDeploymentId" UUID;

-- CreateIndex
CREATE INDEX "Deployment_rollbackSourceDeploymentId_idx"
ON "Deployment"("rollbackSourceDeploymentId");

-- AddForeignKey
ALTER TABLE "Deployment"
ADD CONSTRAINT "Deployment_rollbackSourceDeploymentId_fkey"
FOREIGN KEY ("rollbackSourceDeploymentId") REFERENCES "Deployment"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
