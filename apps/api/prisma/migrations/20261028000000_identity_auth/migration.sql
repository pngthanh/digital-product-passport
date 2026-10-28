-- M2 Identity & Auth
-- ACC-02: thu hồi JWT bằng session_version. Đăng xuất hoặc khoá tài khoản tăng giá trị này;
-- token mang giá trị cũ bị từ chối.
-- ACC-03/04: mỗi người dùng chỉ có một yêu cầu liên kết/xoay ví đang chờ xác nhận on-chain.

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "session_version" INTEGER NOT NULL DEFAULT 0;

-- CreateIndex
CREATE UNIQUE INDEX "ux_wallet_one_pending_personal" ON "party_wallets"("party_id") WHERE ("wallet_role" = 'PERSONAL' AND "status" = 'PENDING');

ALTER TABLE "users"
  ADD CONSTRAINT "ck_users_session_version_non_negative" CHECK ("session_version" >= 0);
