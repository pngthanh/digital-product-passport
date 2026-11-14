# Tài liệu dự án

| Tài liệu                                     | Nội dung                                                                                                         |
| -------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| [kich-ban-kiem-thu.md](kich-ban-kiem-thu.md) | Kịch bản kiểm thử toàn hệ thống: từng bước dùng tài khoản nào, nhập gì, bấm gì, kết quả đúng                     |
| [du-lieu-mau/](du-lieu-mau/)                 | Dữ liệu mẫu cho kịch bản: [thông tin để dán](du-lieu-mau/thong-tin-mau.md), file CSV sản phẩm, file biên bản mẫu |
| [demo-kich-ban.md](demo-kich-ban.md)         | Kịch bản demo 13 bước khi báo cáo (Hardhat local hoặc Monad Testnet)                                             |
| [benchmark/](benchmark/)                     | Kết quả đo hiệu năng do script sinh ra (Hardhat local, PostgreSQL; Monad Testnet sau khi chạy `bench:monad`)     |

Thiết kế từng module (quyết định thiết kế, luồng, API, bảng traceability, gas, test chứng minh):

| Module | Tài liệu                                                            |
| ------ | ------------------------------------------------------------------- |
| M2     | [Tài khoản, đăng nhập và ví MetaMask](m2-identity-auth.md)          |
| M3     | [Indexer và đối soát](m3-indexer.md)                                |
| M4     | [Doanh nghiệp và phí MON](m4-organizations.md)                      |
| M5     | [Sản phẩm, mã QR và tra cứu](m5-products.md)                        |
| M6     | [Phân phối, bán hàng và bảo hành](m6-distribution.md)               |
| M7     | [Dịch vụ bảo hành và phiếu sửa chữa](m7-service.md)                 |
| M8     | [Kiểm định sản phẩm](m8-inspection.md)                              |
| M9     | [Chuyển nhượng quyền sở hữu](m9-transfer.md)                        |
| M10    | [Thu hồi, báo mất, ngừng sử dụng và thông báo](m10-lifecycle.md)    |
| M11    | [Xác minh hộ chiếu công khai](m11-verification.md)                  |
| M12    | [Nhật ký kiểm toán, tổng quan và cảnh báo](m12-audit-dashboard.md)  |
| M13    | [Đo hiệu năng, kiểm thử độ bền và demo](m13-benchmark-hardening.md) |

ERD vẽ từ `apps/api/prisma/schema.prisma`, nguồn sự thật duy nhất của cấu trúc CSDL.
