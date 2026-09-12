ALTER TABLE "Project"
ADD COLUMN "operationLockToken" UUID,
ADD COLUMN "operationLockExpiresAt" TIMESTAMP(3);

CREATE INDEX "Project_operationLockExpiresAt_idx"
ON "Project"("operationLockExpiresAt");
