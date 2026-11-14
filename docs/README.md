# Tài liệu dự án

Thư mục lưu tài liệu đi kèm mã nguồn để giảng viên và cả nhóm đối chiếu:

- Thiết kế chuẩn hoá và bảng traceability (Module M0): xuất bản PDF hoặc Word từ tài liệu thiết kế và đặt vào đây.
- ERD: vẽ từ `apps/api/prisma/schema.prisma`, đây là nguồn sự thật duy nhất của cấu trúc CSDL.
- Báo cáo từng module: mỗi module hoàn thành thêm một file `mX-ten-module.md` mô tả phạm vi, Use Case đã phủ và test chứng minh. Đã có: [M2 Identity & Auth](m2-identity-auth.md), [M3 Indexer & đối soát](m3-indexer.md), [M4 Doanh nghiệp & phí MON](m4-organizations.md), [M5 Sản phẩm, mã QR & tra cứu](m5-products.md), [M6 Phân phối, bán hàng & bảo hành](m6-distribution.md), [M7 Dịch vụ bảo hành & phiếu sửa chữa](m7-service.md), [M8 Kiểm định sản phẩm](m8-inspection.md), [M9 Chuyển nhượng quyền sở hữu](m9-transfer.md), [M10 Thu hồi, báo mất, ngừng sử dụng và thông báo](m10-lifecycle.md), [M11 Xác minh hộ chiếu công khai](m11-verification.md), [M12 Nhật ký kiểm toán, dashboard và cảnh báo](m12-audit-dashboard.md), [M13 Đo hiệu năng, kiểm thử độ bền và demo](m13-benchmark-hardening.md). Module có màn hình cần bấm thử đi kèm danh sách kiểm thử tay `mX-kiem-thu-tay.md` (M7–M12).
- Kiểm thử một lượt từ máy trắng tới M13: [kiem-thu-tong-the.md](kiem-thu-tong-the.md). Kịch bản demo khi báo cáo: [demo-kich-ban.md](demo-kich-ban.md).
- `benchmark/`: báo cáo do script đo hiệu năng sinh ra (Hardhat local, PostgreSQL; Monad Testnet sau khi chạy `bench:monad`).
