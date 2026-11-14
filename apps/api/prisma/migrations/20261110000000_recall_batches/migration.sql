-- M10: thu hồi theo lô. Một giao dịch recallProducts thu hồi nhiều sản phẩm cùng lý do nên tx_hash
-- không còn duy nhất trong recalls; mỗi sản phẩm vẫn chỉ có một dòng (product_id UNIQUE).

-- DropIndex
DROP INDEX "recalls_tx_hash_key";

-- CreateIndex
CREATE INDEX "recalls_tx_hash_idx" ON "recalls"("tx_hash");
