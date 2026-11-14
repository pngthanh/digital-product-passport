# Kết quả đo hiệu năng – hardhat-local

Sinh tự động bởi `packages/contracts/scripts/benchmark.ts` lúc 2026-11-14T12:48:29.393Z. Chain 31337, giá gas 1,000 gwei; phí tính theo gas đã dùng × giá gas; gas limit = ước lượng + 10% (giống web). Chạy 20/20 vòng nghiệp vụ. Độ trễ tính từ lúc ký và gửi giao dịch tới lúc có biên nhận, và tới lúc block chứa giao dịch được finalized (hỏi mỗi 150 ms).

## Hàm contract

| Hàm | n | Gas dùng (TB) | Gas limit (TB) | Phí TB (MON) | Biên nhận TB / p95 (ms) | Finalized TB / p95 (ms) | Lệch chuẩn finalized (ms) |
| --- | --: | --: | --: | --: | --: | --: | --: |
| PartyRegistry.registerUser | 25 | 99.576 | 109.532 | 0,000100 | 12 / 16 | 13 / 17 | 3 |
| PartyRegistry.applyOrganization | 4 | 175.992 | 193.591 | 0,000176 | 12 / 14 | 13 / 14 | 2 |
| PartyRegistry.approveOrganization | 4 | 37.714 | 46.995 | 0,000038 | 6 / 6 | 6 / 7 | 1 |
| ProductPassport.registerProducts (1 sản phẩm) | 20 | 116.662 | 128.328 | 0,000117 | 13 / 17 | 14 / 18 | 3 |
| ProductPassport.dispatchCustody | 20 | 75.500 | 83.050 | 0,000076 | 12 / 20 | 13 / 21 | 4 |
| ProductPassport.confirmCustodyReceipt | 20 | 67.962 | 80.306 | 0,000068 | 12 / 17 | 13 / 22 | 5 |
| ProductPassport.sellAndActivateWarranty | 20 | 147.572 | 163.596 | 0,000148 | 12 / 16 | 13 / 18 | 2 |
| ServiceTicketManager.openTicket | 20 | 184.053 | 203.248 | 0,000184 | 13 / 17 | 14 / 18 | 2 |
| ServiceTicketManager.closeTicket | 20 | 82.400 | 96.304 | 0,000082 | 12 / 15 | 13 / 16 | 2 |
| InspectionRegistry.recordInspection | 20 | 199.275 | 219.203 | 0,000199 | 14 / 18 | 15 / 19 | 2 |
| OwnershipTransfer.createTransferRequest | 20 | 183.363 | 201.699 | 0,000183 | 13 / 16 | 13 / 17 | 2 |
| OwnershipTransfer.acceptTransfer | 20 | 70.214 | 82.666 | 0,000070 | 12 / 17 | 13 / 18 | 3 |
| ProductLifecycle.recallProducts (1 sản phẩm) | 20 | 96.178 | 106.208 | 0,000096 | 13 / 17 | 14 / 19 | 4 |
| ProductPassport.registerProducts (20 sản phẩm) | 1 | 1.460.252 | 1.606.277 | 0,001460 | 31 / 31 | 32 / 32 | 0 |
| ProductLifecycle.recallProducts (20 sản phẩm) | 1 | 997.225 | 1.098.017 | 0,000997 | 31 / 31 | 32 / 32 | 0 |

Lô 20 sản phẩm: đăng ký 73.013 gas mỗi sản phẩm, thu hồi 49.861 gas mỗi sản phẩm.

## Thông lượng

20 giao dịch `registerProducts` gửi liền nhau từ một ví, nằm trong 20 block: gửi xong sau 178 ms; đủ biên nhận sau 179 ms (111,7 giao dịch/giây); tất cả finalized sau 187 ms (107,2 giao dịch/giây).

## Deploy

| Contract | Gas | Phí (MON) |
| --- | --: | --: |
| PartyRegistry | 2.069.598 | 0,002070 |
| WarrantyManager | 825.771 | 0,000826 |
| ProductPassport | 2.097.266 | 0,002097 |
| ServiceTicketManager | 1.187.573 | 0,001188 |
| InspectionRegistry | 1.005.433 | 0,001005 |
| OwnershipTransfer | 1.494.751 | 0,001495 |
| ProductLifecycle | 1.233.503 | 0,001234 |

Tổng phí của lần đo: 0,044315 MON (số dư ví deploy giảm 0,044315 MON; đã trả về 0,008185 MON từ ví tạm).
