ALTER TABLE "computers"
  ADD COLUMN IF NOT EXISTS "billingReservationId" TEXT,
  ADD COLUMN IF NOT EXISTS "billingStartedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "billingCoveredUntil" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "billingRateMicrosPerHour" BIGINT;
