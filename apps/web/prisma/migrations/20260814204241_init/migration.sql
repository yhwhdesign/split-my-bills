-- CreateEnum
CREATE TYPE "PaySchedule" AS ENUM ('WEEKLY', 'BIWEEKLY', 'SEMIMONTHLY', 'MONTHLY');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('SCHEDULED', 'PAID', 'MISSED');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "paySchedule" "PaySchedule" NOT NULL,
    "paydayAnchor" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IncomeSource" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "amount" DECIMAL(65,30) NOT NULL,
    "frequency" "PaySchedule" NOT NULL,
    "nextPayDate" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "IncomeSource_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Bill" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "amount" DECIMAL(65,30) NOT NULL,
    "dueDate" INTEGER NOT NULL,
    "category" TEXT,
    "isRecurring" BOOLEAN NOT NULL DEFAULT true,
    "splittable" BOOLEAN NOT NULL DEFAULT false,
    "minSplitAmount" DECIMAL(65,30),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Bill_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Payment" (
    "id" TEXT NOT NULL,
    "billId" TEXT NOT NULL,
    "amount" DECIMAL(65,30) NOT NULL,
    "paidDate" TIMESTAMP(3),
    "status" "PaymentStatus" NOT NULL DEFAULT 'SCHEDULED',
    "isSplitPayment" BOOLEAN NOT NULL DEFAULT false,
    "splitGroupId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Payment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SplitSuggestion" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "billId" TEXT NOT NULL,
    "suggestedSplit" BOOLEAN NOT NULL,
    "reasoning" TEXT NOT NULL,
    "suggestedDates" TIMESTAMP(3)[],
    "confidence" DOUBLE PRECISION NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SplitSuggestion_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- AddForeignKey
ALTER TABLE "IncomeSource" ADD CONSTRAINT "IncomeSource_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Bill" ADD CONSTRAINT "Bill_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_billId_fkey" FOREIGN KEY ("billId") REFERENCES "Bill"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SplitSuggestion" ADD CONSTRAINT "SplitSuggestion_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SplitSuggestion" ADD CONSTRAINT "SplitSuggestion_billId_fkey" FOREIGN KEY ("billId") REFERENCES "Bill"("id") ON DELETE CASCADE ON UPDATE CASCADE;
