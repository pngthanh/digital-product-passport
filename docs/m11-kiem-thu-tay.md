# M11 – Kiểm thử tay trên Monad Testnet

Danh sách dưới đây là các bước bấm tay để xác nhận M11 chạy đúng trên web thật, với Monad Testnet. Thiết kế và API nằm ở [m11-verification.md](m11-verification.md).

## 1. Cài đặt

Chạy trong PowerShell, ở thư mục gốc dự án.

```powershell
# Tắt pnpm dev đang chạy (Ctrl+C). Giải nén zip M11 đè lên dự án, rồi:
pnpm install

# M11 không có contract mới, không có migration. (Tuỳ chọn) thêm vào .env:
#   PUBLIC_RATE_LIMIT_PER_MINUTE=120
pnpm db:up
pnpm dev
# Chờ log "API đang chạy tại http://localhost:4000/api/v1" và "Worker đã sẵn sàng" rồi mới mở web.
```

## 2. Dữ liệu cần có

Dùng sản phẩm có sẵn từ M5–M10, không cần tạo mới:

- **P-bán**: một sản phẩm đã bán cho người mua **A**, có bảo hành đang chạy.
- **P-giao**: một sản phẩm nhà sản xuất **M** đang gửi tới nhà bán lẻ **R** (chưa nhận). Nếu không còn, M gửi một sản phẩm mới tới R.
- **P-thu-hồi**: một sản phẩm đã bị thu hồi ở M10.
- Mở trang bằng cửa sổ ẩn danh (không đăng nhập), hoặc bằng điện thoại cùng Wi-Fi (đặt `PUBLIC_WEB_URL` như README hướng dẫn).

## 3. Các bước và kết quả đúng

### VER-01: máy chủ đối chiếu với blockchain

| #   | Bước                                 | Kết quả đúng                                                                                                                                                         |
| --- | ------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Mở `/p/<mã P-bán>`                   | Khung **Đối chiếu blockchain**: ô xanh **Khớp blockchain**; sáu mục đều có dấu tích. Dòng cuối ghi "Đọc contract tại block …" và giờ chốt chỉ cách hiện tại vài giây |
| 2   | Mở `/p/<mã P-giao>`                  | Vẫn **Khớp blockchain**; ô "Bên đang giữ" của hộ chiếu ghi M và "Đang gửi tới R"                                                                                     |
| 3   | Mở `/p/<mã P-thu-hồi>`               | Khung đỏ thu hồi (M10) ở đầu trang; khung đối chiếu vẫn **Khớp blockchain** với trạng thái Bị thu hồi                                                                |
| 4   | Tải lại `/p/<mã P-bán>` hai lần liền | Trang vẫn đúng; lần sau nhanh hơn (kết quả giữ 15 giây)                                                                                                              |

### VER-01: người xem tự kiểm bằng trình duyệt

| #   | Bước                                                         | Kết quả đúng                                                                                                                                                                                                                           |
| --- | ------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 5   | Trên `/p/<mã P-bán>`, bấm **Tự kiểm tra bằng trình duyệt**   | Vài giây sau hiện dòng xanh "Trình duyệt đã tự kiểm: trang này khớp dữ liệu trên blockchain"; tám mục có dấu tích; dòng giao dịch ghi "n/n giao dịch … có thật"; "Nguồn đọc: testnet-rpc.monad.xyz" (hoặc RPC dự phòng, hoặc MetaMask) |
| 6   | Mở DevTools → tab Network rồi bấm **Kiểm tra lại**           | Các request đi thẳng tới RPC Monad, **không có** request nào tới `/api/v1`                                                                                                                                                             |
| 7   | Bấm link địa chỉ **ProductPassport** trong khung Tự kiểm tra | MonadVision mở đúng contract đã deploy ở M6                                                                                                                                                                                            |
| 8   | Làm lại bước 5 trên điện thoại                               | Hai khung đối chiếu nằm ngay dưới hộ chiếu; tự kiểm cho kết quả như bước 5; trang không bị kéo ngang                                                                                                                                   |

### VER-02: dòng thời gian, nhật ký on-chain, không lộ người mua

| #   | Bước                                                                                        | Kết quả đúng                                                                                                                                         |
| --- | ------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| 9   | Trên `/p/<mã P-bán>`, mở mục **Nhật ký giao dịch on-chain (n)**                             | Danh sách event kèm block; các bước của M và R có dòng "Ví gửi 0x…"; bước người mua tự làm (chuyển nhượng, báo mất ở M9–M10, nếu có) **không** có ví |
| 10  | Mở `http://localhost:3000/api/v1/public/products/<mã P-bán>`, tìm (Ctrl+F) địa chỉ ví của A | Không thấy địa chỉ ví của A, không thấy tên hay email của A                                                                                          |
| 11  | Bấm một giao dịch trên **Lịch sử đã ghi nhận**                                              | MonadVision mở đúng giao dịch, cùng thời điểm với trang                                                                                              |

### VER-01: lệch dữ liệu và cảnh báo Admin

| #   | Bước                                                                                                                                                             | Kết quả đúng                                                                                                                                                          |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 12  | Mở Prisma Studio (`pnpm db:studio`), bảng `warranties`: tìm dòng của P-bán, đổi `warranty_state` thành `SUSPENDED` rồi lưu. Đợi 15 giây, tải lại `/p/<mã P-bán>` | Ô "Bảo hành" của hộ chiếu ghi "Tạm dừng khi sửa"; khung đối chiếu có ô đỏ **Có mục khác blockchain**, mục **Bảo hành** đỏ, ghi "Trên blockchain: Còn bảo hành, đến …" |
| 13  | Bấm **Tự kiểm tra bằng trình duyệt**                                                                                                                             | Dòng đỏ "Có mục khác dữ liệu trên blockchain"; mục **Bảo hành** đỏ, các mục khác vẫn có dấu tích                                                                      |
| 14  | Prisma Studio, bảng `anomaly_alerts`                                                                                                                             | Có đúng **một** dòng `PUBLIC_VERIFICATION_MISMATCH`, HIGH, OPEN, gắn với P-bán; tải lại trang nhiều lần cũng không thêm dòng                                          |
| 15  | Đổi `warranty_state` của P-bán về `ACTIVE`, đợi 15 giây rồi tải lại                                                                                              | Trở lại **Khớp blockchain**. (Dòng cảnh báo vẫn OPEN; M12 có màn hình xử lý)                                                                                          |

### Giới hạn lượt tra cứu

| #   | Bước                                                                                                                       | Kết quả đúng                                                                 |
| --- | -------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| 16  | Đặt `PUBLIC_RATE_LIMIT_PER_MINUTE=20` trong `.env`, khởi động lại `pnpm dev`. Mở `/p/<mã P-bán>` rồi bấm F5 liên tục 6 lần | Lần thứ 6 hiện **Bạn tra cứu quá nhanh** (mỗi lần mở tốn 4 lượt)             |
| 17  | Cùng lúc đó, mở trang bằng điện thoại (IP khác)                                                                            | Điện thoại vẫn xem được                                                      |
| 18  | Đợi một phút, tải lại máy tính                                                                                             | Xem lại được. Trả `.env` về 120 (hoặc xoá dòng) rồi khởi động lại `pnpm dev` |

M11 xong khi bước 1–18 đúng như cột cuối.

## 4. Test tự động

Cần Docker PostgreSQL đang chạy (`pnpm db:up`).

```bash
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test        # 445 unit và contract
pnpm test:e2e    # 120 e2e, gồm apps/api/test/verification/*.e2e-spec.ts
pnpm build
```

## 5. Lỗi thường gặp

| Hiện tượng                                     | Cách xử lý                                                                                                                      |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| Khung đối chiếu báo **Chưa đối chiếu được**    | API chưa đọc được RPC hoặc Worker chưa chạy. Xem `/system/status`; bật lại `pnpm dev`                                           |
| Khung đối chiếu báo **Đang cập nhật** lâu      | Worker đang bắt kịp chain sau thời gian tắt máy (log Worker báo còn bao nhiêu block). Đợi `/system/status` hết báo chậm         |
| Tự kiểm báo "không đọc được blockchain"        | Mạng hoặc tiện ích chặn quảng cáo đang chặn RPC Monad. Tắt tiện ích chặn, hoặc mở MetaMask (đang ở Monad Testnet) rồi bấm lại   |
| Tự kiểm báo lệch ngay sau khi vừa có giao dịch | Trình duyệt đọc trạng thái mới nhất, còn trang hiển thị dữ liệu đã chốt. Tải lại trang sau vài giây rồi kiểm lại                |
| Bị **Bạn tra cứu quá nhanh** dù mới mở vài lần | Nhiều người dùng chung một IP (cùng mạng công ty, cùng Wi-Fi). Tăng `PUBLIC_RATE_LIMIT_PER_MINUTE` rồi khởi động lại `pnpm dev` |
