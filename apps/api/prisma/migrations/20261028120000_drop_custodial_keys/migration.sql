-- M3: mô hình Hybrid (D14) không tạo ví custodial, nên bỏ bảng custodial_keys.
-- CSDL còn 21 bảng; ví của người dùng luôn là NON_CUSTODIAL (MetaMask).

-- DropForeignKey
ALTER TABLE "custodial_keys" DROP CONSTRAINT "custodial_keys_wallet_id_fkey";

-- DropTable
DROP TABLE "custodial_keys";
