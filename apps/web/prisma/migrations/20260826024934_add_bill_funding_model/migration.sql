-- CreateEnum
CREATE TYPE "FundingModel" AS ENUM ('BEFORE_DUE', 'NEXT_CHECK');

-- AlterTable
ALTER TABLE "Bill" ADD COLUMN     "fundingModel" "FundingModel" NOT NULL DEFAULT 'BEFORE_DUE';
