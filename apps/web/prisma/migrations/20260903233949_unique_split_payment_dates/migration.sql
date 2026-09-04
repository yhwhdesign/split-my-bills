/*
  Warnings:

  - A unique constraint covering the columns `[billId,paidDate,isSplitPayment]` on the table `Payment` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateIndex
CREATE UNIQUE INDEX "Payment_billId_paidDate_isSplitPayment_key" ON "Payment"("billId", "paidDate", "isSplitPayment");
