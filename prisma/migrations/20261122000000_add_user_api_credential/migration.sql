-- CreateTable
CREATE TABLE "UserApiCredential" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "encryptedKey" TEXT NOT NULL,
    "iv" TEXT NOT NULL,
    "authTag" TEXT NOT NULL,
    "keyVersion" TEXT NOT NULL DEFAULT 'v1',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserApiCredential_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "UserApiCredential_userId_idx" ON "UserApiCredential"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "UserApiCredential_userId_provider_key" ON "UserApiCredential"("userId", "provider");

-- AddForeignKey
ALTER TABLE "UserApiCredential" ADD CONSTRAINT "UserApiCredential_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
