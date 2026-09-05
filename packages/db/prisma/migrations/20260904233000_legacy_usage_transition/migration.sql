ALTER TABLE "organization_billing" ADD COLUMN "usageAllowanceStartsAt" TIMESTAMP(3);
-- Existing paid subscribers keep their current token/computer allowance through renewal.
UPDATE "organization_billing"
SET "usageAllowanceStartsAt" = "currentPeriodEnd"
WHERE "stripeSubscriptionId" IS NOT NULL
  AND "plan" <> 'free'
  AND "currentPeriodEnd" > CURRENT_TIMESTAMP;
