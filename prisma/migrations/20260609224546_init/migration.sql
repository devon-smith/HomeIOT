-- CreateEnum
CREATE TYPE "JobStatus" AS ENUM ('pending', 'fired', 'failed', 'cancelled');

-- CreateEnum
CREATE TYPE "ApprovalStatus" AS ENUM ('pending', 'approved', 'denied', 'expired');

-- CreateEnum
CREATE TYPE "ActorRole" AS ENUM ('owner', 'partner', 'guest');

-- CreateTable
CREATE TABLE "devices" (
    "id" UUID NOT NULL,
    "room" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "adapter" TEXT NOT NULL,
    "capabilities" JSONB NOT NULL,
    "config" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "devices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "state_events" (
    "id" BIGSERIAL NOT NULL,
    "deviceId" UUID NOT NULL,
    "ts" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "source" TEXT NOT NULL,
    "cmdId" UUID,
    "payload" JSONB NOT NULL,

    CONSTRAINT "state_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "scenes" (
    "id" UUID NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "actions" JSONB NOT NULL,
    "rooms" TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "scenes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "scheduled_jobs" (
    "id" UUID NOT NULL,
    "fireAt" TIMESTAMP(3) NOT NULL,
    "actionSpec" JSONB NOT NULL,
    "label" TEXT,
    "status" "JobStatus" NOT NULL DEFAULT 'pending',
    "actor" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "firedAt" TIMESTAMP(3),
    "error" TEXT,

    CONSTRAINT "scheduled_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_log" (
    "id" BIGSERIAL NOT NULL,
    "ts" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actor" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "payload" JSONB NOT NULL,

    CONSTRAINT "audit_log_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "approval_requests" (
    "id" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "decidedAt" TIMESTAMP(3),
    "actor" TEXT NOT NULL,
    "decidedBy" TEXT,
    "status" "ApprovalStatus" NOT NULL DEFAULT 'pending',
    "toolCall" JSONB NOT NULL,
    "reason" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "approval_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "actors" (
    "id" UUID NOT NULL,
    "slug" TEXT NOT NULL,
    "role" "ActorRole" NOT NULL,
    "displayName" TEXT NOT NULL,
    "imessageHandles" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "preferences" JSONB NOT NULL DEFAULT '{}',
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "actors_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "devices_room_slug_key" ON "devices"("room", "slug");

-- CreateIndex
CREATE INDEX "state_events_deviceId_ts_idx" ON "state_events"("deviceId", "ts");

-- CreateIndex
CREATE INDEX "state_events_ts_idx" ON "state_events"("ts");

-- CreateIndex
CREATE UNIQUE INDEX "scenes_slug_key" ON "scenes"("slug");

-- CreateIndex
CREATE INDEX "scheduled_jobs_status_fireAt_idx" ON "scheduled_jobs"("status", "fireAt");

-- CreateIndex
CREATE INDEX "audit_log_ts_idx" ON "audit_log"("ts");

-- CreateIndex
CREATE INDEX "audit_log_actor_ts_idx" ON "audit_log"("actor", "ts");

-- CreateIndex
CREATE INDEX "approval_requests_status_expiresAt_idx" ON "approval_requests"("status", "expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "actors_slug_key" ON "actors"("slug");

-- CreateIndex
CREATE INDEX "actors_expiresAt_idx" ON "actors"("expiresAt");

-- AddForeignKey
ALTER TABLE "state_events" ADD CONSTRAINT "state_events_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "devices"("id") ON DELETE CASCADE ON UPDATE CASCADE;
