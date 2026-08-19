-- CreateTable
CREATE TABLE "AICoachingCache" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "dataHash" TEXT NOT NULL,
    "coaching" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AICoachingCache_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AICoachingCache_userId_key" ON "AICoachingCache"("userId");
