-- M8: yêu cầu kiểm định. Nhà sản xuất hoặc chủ sở hữu gửi yêu cầu tới đơn vị kiểm định; biên bản
-- (inspections) gắn với yêu cầu, chỉ một biên bản CONFIRMED cho mỗi yêu cầu. Bảng inspections chưa có
-- dữ liệu trước M8 nên thêm cột NOT NULL trực tiếp.

-- CreateEnum
CREATE TYPE "inspection_request_state" AS ENUM ('REQUESTED', 'COMPLETED', 'DECLINED', 'CANCELLED');

-- AlterTable
ALTER TABLE "inspections" ADD COLUMN     "request_id" UUID NOT NULL;

-- CreateTable
CREATE TABLE "inspection_requests" (
    "id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "requested_by_party_id" UUID NOT NULL,
    "inspector_org_id" UUID NOT NULL,
    "note" TEXT NOT NULL,
    "request_state" "inspection_request_state" NOT NULL DEFAULT 'REQUESTED',
    "requested_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closed_at" TIMESTAMPTZ(6),
    "decline_reason" VARCHAR(500),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "inspection_requests_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "inspection_requests_inspector_org_id_request_state_idx" ON "inspection_requests"("inspector_org_id", "request_state");

-- CreateIndex
CREATE INDEX "inspection_requests_requested_by_party_id_idx" ON "inspection_requests"("requested_by_party_id");

-- CreateIndex
CREATE INDEX "inspection_requests_product_id_requested_at_idx" ON "inspection_requests"("product_id", "requested_at");

-- CreateIndex
CREATE UNIQUE INDEX "ux_inspection_one_pending" ON "inspection_requests"("product_id") WHERE (request_state = 'REQUESTED'::inspection_request_state);

-- CreateIndex
CREATE INDEX "inspections_request_id_created_at_idx" ON "inspections"("request_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "ux_inspections_one_confirmed" ON "inspections"("request_id") WHERE (sync_status = 'CONFIRMED'::sync_status);

-- AddForeignKey
ALTER TABLE "inspection_requests" ADD CONSTRAINT "inspection_requests_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inspection_requests" ADD CONSTRAINT "inspection_requests_requested_by_party_id_fkey" FOREIGN KEY ("requested_by_party_id") REFERENCES "parties"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inspection_requests" ADD CONSTRAINT "inspection_requests_inspector_org_id_fkey" FOREIGN KEY ("inspector_org_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inspections" ADD CONSTRAINT "inspections_request_id_fkey" FOREIGN KEY ("request_id") REFERENCES "inspection_requests"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Ràng buộc bổ sung
ALTER TABLE "inspection_requests"
  ADD CONSTRAINT "ck_inspection_requests_note_not_blank" CHECK (btrim("note") <> ''),
  ADD CONSTRAINT "ck_inspection_requests_decline_reason_not_blank" CHECK (
    "decline_reason" IS NULL OR btrim("decline_reason") <> ''
  ),
  -- Chỉ REQUESTED chưa đóng; chỉ DECLINED có lý do từ chối.
  ADD CONSTRAINT "ck_inspection_requests_state_consistency" CHECK (
    (("request_state" = 'REQUESTED') = ("closed_at" IS NULL))
    AND (("request_state" = 'DECLINED') = ("decline_reason" IS NOT NULL))
  ),
  ADD CONSTRAINT "ck_inspection_requests_closed_after_requested" CHECK (
    "closed_at" IS NULL OR "closed_at" >= "requested_at"
  );

ALTER TABLE "inspections"
  ADD CONSTRAINT "ck_inspections_summary_not_blank" CHECK ("summary" IS NULL OR btrim("summary") <> '');
