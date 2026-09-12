CREATE TABLE "GitHubWebhookDelivery" (
    "deliveryId" VARCHAR(255) NOT NULL,
    "projectId" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GitHubWebhookDelivery_pkey" PRIMARY KEY ("deliveryId")
);

CREATE INDEX "GitHubWebhookDelivery_projectId_idx" ON "GitHubWebhookDelivery"("projectId");
CREATE INDEX "GitHubWebhookDelivery_createdAt_idx" ON "GitHubWebhookDelivery"("createdAt");

ALTER TABLE "GitHubWebhookDelivery"
ADD CONSTRAINT "GitHubWebhookDelivery_projectId_fkey"
FOREIGN KEY ("projectId") REFERENCES "Project"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
