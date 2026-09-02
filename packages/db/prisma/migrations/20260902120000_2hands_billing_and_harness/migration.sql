-- 2hands hosted billing + per-bot coding harness.
CREATE TABLE "organization_billing" (
    "organizationId" TEXT NOT NULL,
    "plan" TEXT NOT NULL DEFAULT 'free',
    "stripeCustomerId" TEXT,
    "stripeSubscriptionId" TEXT,
    "stripePriceId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'active',
    "currentPeriodEnd" TIMESTAMP(3),
    "computerSecondsUsed" INTEGER NOT NULL DEFAULT 0,
    "inputTokensUsed" INTEGER NOT NULL DEFAULT 0,
    "outputTokensUsed" INTEGER NOT NULL DEFAULT 0,
    "usagePeriodStart" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "organization_billing_pkey" PRIMARY KEY ("organizationId")
);

CREATE UNIQUE INDEX "organization_billing_stripeCustomerId_key"
ON "organization_billing"("stripeCustomerId");

CREATE UNIQUE INDEX "organization_billing_stripeSubscriptionId_key"
ON "organization_billing"("stripeSubscriptionId");

ALTER TABLE "organization_billing"
ADD CONSTRAINT "organization_billing_organizationId_fkey"
FOREIGN KEY ("organizationId") REFERENCES "organization"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "bots" ADD COLUMN "codingHarness" TEXT;
