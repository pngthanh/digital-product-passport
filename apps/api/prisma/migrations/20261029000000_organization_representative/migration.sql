-- M4: tổ chức không có ví riêng; tài khoản đại diện ký mọi giao dịch bằng ví cá nhân (D25).
-- Bảng organizations chưa có dữ liệu trước M4 nên thêm cột NOT NULL trực tiếp.

-- AlterTable
ALTER TABLE "organizations" ADD COLUMN     "representative_user_id" UUID NOT NULL,
ADD COLUMN     "status_reason" VARCHAR(500);

-- CreateIndex
CREATE UNIQUE INDEX "organizations_representative_user_id_key" ON "organizations"("representative_user_id");

-- AddForeignKey
ALTER TABLE "organizations" ADD CONSTRAINT "organizations_representative_user_id_fkey" FOREIGN KEY ("representative_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Ràng buộc bổ sung
ALTER TABLE "organizations"
  ADD CONSTRAINT "ck_organizations_status_reason_not_blank" CHECK ("status_reason" IS NULL OR btrim("status_reason") <> '');
