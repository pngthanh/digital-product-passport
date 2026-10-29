-- M5: đăng ký sản phẩm. Serial duy nhất trong từng nhà sản xuất, một giao dịch đăng ký cả lô,
-- hồ sơ có ngày sản xuất và thời hạn bảo hành. Bảng products chưa có dữ liệu trước M5 nên thêm cột NOT NULL trực tiếp.

-- DropIndex
DROP INDEX "products_created_tx_hash_key";

-- DropIndex
DROP INDEX "products_serial_number_key";

-- AlterTable
ALTER TABLE "products" ADD COLUMN     "manufactured_on" DATE NOT NULL,
ADD COLUMN     "warranty_months" INTEGER NOT NULL;

-- CreateIndex
CREATE INDEX "products_created_tx_hash_idx" ON "products"("created_tx_hash");

-- CreateIndex
CREATE UNIQUE INDEX "products_issuer_org_id_serial_number_key" ON "products"("issuer_org_id", "serial_number");

-- Ràng buộc bổ sung
ALTER TABLE "products"
  DROP CONSTRAINT "ck_products_public_code_format",
  -- 12 ký tự, bảng chữ bỏ I, O, 0, 1 (khớp PUBLIC_CODE_PATTERN trong @dpp/shared).
  ADD CONSTRAINT "ck_products_public_code_format" CHECK ("public_code" ~ '^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{12}$'),
  -- Serial lưu chữ in hoa (khớp SERIAL_NUMBER_PATTERN), nên so khớp không phân biệt hoa thường.
  ADD CONSTRAINT "ck_products_serial_pattern" CHECK ("serial_number" ~ '^[A-Z0-9]([A-Z0-9._/-]{0,98}[A-Z0-9])?$'),
  ADD CONSTRAINT "ck_products_model_name_not_blank" CHECK (btrim("model_name") <> ''),
  ADD CONSTRAINT "ck_products_warranty_months_range" CHECK ("warranty_months" BETWEEN 0 AND 120),
  ADD CONSTRAINT "ck_products_manufactured_on_range" CHECK ("manufactured_on" >= DATE '1990-01-01');
