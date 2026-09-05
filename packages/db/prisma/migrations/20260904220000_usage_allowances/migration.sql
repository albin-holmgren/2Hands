ALTER TABLE "organization_billing"
  ADD COLUMN "currentPeriodStart" TIMESTAMP(3),
  ADD COLUMN "lastProviderEventAt" TIMESTAMP(3);
ALTER TABLE "runs"
  ADD COLUMN "modelFunding" TEXT,
  ADD COLUMN "modelThinkingLevel" TEXT;

CREATE TABLE "billing_periods" (
  "id" TEXT PRIMARY KEY,
  "organizationId" TEXT NOT NULL REFERENCES "organization_billing"("organizationId") ON DELETE CASCADE ON UPDATE CASCADE,
  "startsAt" TIMESTAMP(3) NOT NULL,
  "endsAt" TIMESTAMP(3) NOT NULL,
  "allowanceMicros" BIGINT NOT NULL CHECK ("allowanceMicros" >= 0),
  "spentMicros" BIGINT NOT NULL DEFAULT 0 CHECK ("spentMicros" >= 0),
  "reservedMicros" BIGINT NOT NULL DEFAULT 0 CHECK ("reservedMicros" >= 0),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "billing_periods_valid_dates" CHECK ("endsAt" > "startsAt")
);
CREATE UNIQUE INDEX "billing_periods_organizationId_startsAt_key" ON "billing_periods"("organizationId", "startsAt");
CREATE INDEX "billing_periods_organizationId_endsAt_idx" ON "billing_periods"("organizationId", "endsAt");

CREATE TABLE "usage_reservations" (
  "id" TEXT PRIMARY KEY,
  "organizationId" TEXT NOT NULL,
  "periodId" TEXT NOT NULL REFERENCES "billing_periods"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "spaceId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "runId" TEXT,
  "operationKey" TEXT NOT NULL,
  "kind" TEXT NOT NULL CHECK ("kind" IN ('ai', 'computer', 'harness')),
  "funding" TEXT NOT NULL CHECK ("funding" IN ('hosted', 'byok')),
  "status" TEXT NOT NULL DEFAULT 'reserved' CHECK ("status" IN ('reserved', 'settled', 'released')),
  "reservedMicros" BIGINT NOT NULL CHECK ("reservedMicros" >= 0),
  "settledMicros" BIGINT CHECK ("settledMicros" >= 0),
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "settledAt" TIMESTAMP(3),
  "releasedAt" TIMESTAMP(3)
);
CREATE UNIQUE INDEX "usage_reservations_organizationId_operationKey_key" ON "usage_reservations"("organizationId", "operationKey");
CREATE INDEX "usage_reservations_runId_status_idx" ON "usage_reservations"("runId", "status");
CREATE INDEX "usage_reservations_periodId_status_idx" ON "usage_reservations"("periodId", "status");

CREATE TABLE "billing_provider_events" (
  "id" TEXT PRIMARY KEY,
  "organizationId" TEXT NOT NULL REFERENCES "organization_billing"("organizationId") ON DELETE CASCADE ON UPDATE CASCADE,
  "provider" TEXT NOT NULL,
  "occurredAt" TIMESTAMP(3) NOT NULL,
  "processedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "billing_provider_events_organizationId_occurredAt_idx" ON "billing_provider_events"("organizationId", "occurredAt");
