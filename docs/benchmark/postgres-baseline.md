# Đường cơ sở PostgreSQL + chữ ký ECDSA

Sinh tự động bởi `apps/api/scripts/benchmark-baseline.mjs` lúc 2026-11-14T12:49:24.574Z. PostgreSQL 16.15 (Ubuntu 16.15-0ubuntu0.24.04.1), Node v22.23.4. Mỗi việc chạy 20 lần (mỗi lần đổi trạng thái 3 bước) sau 5 lần khởi động. Ký và kiểm bằng ECDSA secp256k1 (khoá do máy chủ giữ), băm keccak256 giống blockchain. Không tốn phí giao dịch.

| Việc | n | TB (ms) | p50 (ms) | p95 (ms) | Lệch chuẩn (ms) |
| --- | --: | --: | --: | --: | --: |
| Ghi hồ sơ sản phẩm + ký (≈ registerProducts) | 20 | 2,35 | 2,02 | 3,06 | 1,01 |
| Đổi trạng thái + ghi nhật ký + ký (≈ dispatch, nhận, bán) | 60 | 1,89 | 1,72 | 2,62 | 0,66 |
| Đọc nhật ký + kiểm mọi chữ ký (≈ tự kiểm hộ chiếu) | 20 | 8,72 | 8,27 | 11,43 | 1,37 |

Lô 20 hồ sơ trong một giao dịch CSDL: 19,9 ms. Ghi tuần tự 1.000 hồ sơ: 1,68 giây (596 hồ sơ/giây).
