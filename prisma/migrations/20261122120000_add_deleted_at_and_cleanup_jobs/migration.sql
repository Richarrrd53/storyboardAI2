-- AlterTable
ALTER TABLE "Project" ADD COLUMN IF NOT EXISTS "deletedAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Project_is_deleted_deletedAt_idx" ON "Project"("is_deleted", "deletedAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Project_authorId_is_deleted_deletedAt_idx" ON "Project"("authorId", "is_deleted", "deletedAt");

-- CreateTable
CREATE TABLE IF NOT EXISTS "CleanupJob" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "authorId" TEXT,
    "reason" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "storagePaths" JSONB NOT NULL DEFAULT '[]',
    "deletedPaths" JSONB NOT NULL DEFAULT '[]',
    "dbDeleted" BOOLEAN NOT NULL DEFAULT false,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,
    "lockedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CleanupJob_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "CleanupJob_projectId_key" ON "CleanupJob"("projectId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "CleanupJob_status_updatedAt_idx" ON "CleanupJob"("status", "updatedAt");

-- NOTE: Existing soft-deleted projects (is_deleted = true AND deletedAt IS NULL)
-- are intentionally NOT backfilled with updatedAt here so they cannot be immediately
-- expired and permanently deleted. Run:
--   node scripts/migrate-base64-images.js --backfill-deleted-at --dry-run
--   node scripts/migrate-base64-images.js --backfill-deleted-at --execute
-- to grant them a safe 30-day protection window from activation time.
