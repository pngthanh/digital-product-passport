# M12 – Kiểm thử tay

Các bước bấm tay để xác nhận M12 chạy đúng trên web thật. Thiết kế và API nằm ở [m12-audit-dashboard.md](m12-audit-dashboard.md). Chạy được trên Monad Testnet hoặc Hardhat local; các bước không cần giao dịch mới.

## 1. Cài đặt

Chạy trong PowerShell, ở thư mục gốc dự án.

```powershell
# Tắt pnpm dev đang chạy (Ctrl+C). Giải nén zip M12 đè lên dự án, rồi:
pnpm install

# M12 không có contract mới, không có migration.
# Khi kiểm thử tay, thêm vào .env để Worker quét luật nền mỗi phút (mặc định 5 phút):
#   ANOMALY_SCAN_INTERVAL_MINUTES=1
pnpm db:up
pnpm dev
# Chờ log "API đang chạy tại http://localhost:4000/api/v1" và "Worker đã sẵn sàng" rồi mới mở web.
```

## 2. Dữ liệu cần có

- Tài khoản Admin (đã cấp quyền ở M4) và ít nhất một tài khoản người dùng **A** (ví dụ người mua ở M6).
- Dữ liệu có sẵn từ M4–M11: doanh nghiệp đã duyệt, sản phẩm đã bán. Không cần tạo mới.
- Hai trình duyệt (hoặc một cửa sổ thường và một cửa sổ ẩn danh): một cho Admin, một để đăng nhập sai.

## 3. Các bước và kết quả đúng

### AUD-02: Tổng quan

| #   | Bước                                                                                 | Kết quả đúng                                                                                                                                                                        |
| --- | ------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Đăng nhập Admin, bấm **Quản trị** trên thanh trên cùng                               | Mở `/admin`, tiêu đề **Tổng quan hệ thống**. Thanh con có Tổng quan, Doanh nghiệp, Cảnh báo, Nhật ký                                                                                |
| 2   | Xem bốn ô số                                                                         | **Tài khoản** bằng số tài khoản đã đăng ký; **Doanh nghiệp đã duyệt** khớp số ở trang Doanh nghiệp; **Sản phẩm trên chain** bằng tổng các dòng ở khung **Sản phẩm theo trạng thái** |
| 3   | Di chuột vào cột cao nhất của **Event on-chain mỗi ngày**, rồi bấm **Xem dạng bảng** | Ô nhỏ hiện "n event, Ngày dd/mm"; bảng có đủ 14 ngày, khớp số trên cột                                                                                                              |
| 4   | Bấm Tab nhiều lần vào biểu đồ                                                        | Từng cột có viền focus, ô số đi theo cột                                                                                                                                            |
| 5   | Xem ô **Indexer**                                                                    | Ghi **Bắt kịp** (hoặc "Chậm n block" nếu Worker đang bắt kịp sau khi tắt máy), kèm giờ ghi mốc gần nhất                                                                             |
| 6   | Xem **Giao dịch gửi qua web**                                                        | Mỗi hàm contract đã dùng ở M4–M10 một dòng; cột **Đã chốt** cộng lại bằng ô **Đã chốt** phía trên; gas trung bình khác 0                                                            |
| 7   | Mở trang trên điện thoại (hoặc DevTools 390 px)                                      | Bốn ô thành hai cột; biểu đồ ghi nhãn ngày cách một; bảng kéo ngang trong khung, trang không bị kéo ngang                                                                           |

### Trang duyệt doanh nghiệp đã chuyển

| #   | Bước                                                          | Kết quả đúng                                                                                     |
| --- | ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| 8   | Bấm **Doanh nghiệp** trên thanh con                           | Trang duyệt của M4 (`/admin/organizations`) với các nút Chờ duyệt, Đã duyệt, Bị từ chối, Đã khoá |
| 9   | Bấm **Đã duyệt**, mở một doanh nghiệp, bấm **← Doanh nghiệp** | Quay lại đúng danh sách Đã duyệt                                                                 |

### AUD-03 và AUD-04: đăng nhập sai dồn dập

| #   | Bước                                                                                                | Kết quả đúng                                                                                                                              |
| --- | --------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| 10  | Ở trình duyệt thứ hai, vào `/login`, nhập email của **A** và mật khẩu sai, bấm Đăng nhập **10 lần** | 10 lần báo "Email hoặc mật khẩu không đúng." (Lần thứ 11 trong cùng phút bị chặn theo giới hạn 10 lần mỗi phút của M2: đúng như thiết kế) |
| 11  | Đợi tối đa `ANOMALY_SCAN_INTERVAL_MINUTES` phút, tải lại trang Admin                                | Thanh con hiện **Cảnh báo 1**; ô **Cảnh báo đang mở** trên Tổng quan có viền vàng, ghi "1 cao"                                            |
| 12  | Bấm **Cảnh báo**                                                                                    | Dòng mức **Cao**, **Đăng nhập sai dồn dập**, "<email A> sai 10 lần trong 15 phút", dưới là tên của A                                      |
| 13  | Bấm vào dòng đó                                                                                     | Trang chi tiết: Email, Số lần sai 10, Email có tài khoản **Có**, Người liên quan là A                                                     |
| 14  | Bấm **Chốt cảnh báo** khi chưa chọn gì                                                              | Báo "Chọn Đã xử lý hoặc Báo nhầm" và "Ghi chú tối thiểu 5 ký tự"; không gửi gì lên máy chủ                                                |
| 15  | Chọn **Đã xử lý**, ghi "Đã gọi cho A, A quên mật khẩu.", bấm **Chốt cảnh báo**                      | Form đổi thành khung Kết luận **Đã xử lý**, người chốt là Admin, đúng giờ, đúng ghi chú. Thanh con hết số cảnh báo                        |
| 16  | Quay lại **Cảnh báo**, bấm nút **Đã xử lý**                                                         | Cảnh báo vừa chốt nằm ở đây, kèm "Đã xử lý bởi <tên Admin>: <ghi chú>"                                                                    |
| 17  | Đợi thêm một lượt quét, tải lại                                                                     | Không có cảnh báo mới cho cùng email (chỉ báo lại sau 24 giờ)                                                                             |
| 18  | Lặp lại bước 10 với một email **chưa đăng ký**                                                      | Có cảnh báo mới, Email có tài khoản **Không**, không có Người liên quan. Chốt là **Báo nhầm** kèm ghi chú                                 |

### AUD-04: hai Admin chốt cùng lúc

| #   | Bước                                                                                                                                            | Kết quả đúng                                                                                               |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| 19  | Tạo thêm một cảnh báo (lặp bước 10 với email khác). Mở trang chi tiết của nó ở **hai tab** cùng tài khoản Admin. Chốt ở tab 1, rồi chốt ở tab 2 | Tab 2 báo "Cảnh báo này đã được xử lý. Tải lại trang để xem kết quả."; tải lại thì thấy kết luận của tab 1 |

### AUD-01: nhật ký kiểm toán

| #   | Bước                                                                                      | Kết quả đúng                                                                                           |
| --- | ----------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| 20  | Bấm **Nhật ký**                                                                           | Danh sách mới nhất trước; dòng trên cùng là **Xử lý cảnh báo** của Admin, metadata có ghi chú vừa nhập |
| 21  | Chọn Hành động **Đăng nhập sai**, bấm **Lọc**                                             | Chỉ còn các dòng Đăng nhập sai, mỗi dòng có email đã nhập trong metadata và IP                         |
| 22  | Bấm **Bỏ lọc**, nhập email của Admin vào **Email người thực hiện**, bấm **Lọc**           | Chỉ còn việc Admin đã làm (đăng nhập, duyệt doanh nghiệp, xử lý cảnh báo…)                             |
| 23  | Đặt **Từ ngày** sau **Đến ngày**, bấm **Lọc**                                             | Báo "Bộ lọc không hợp lệ…"                                                                             |
| 24  | Bỏ lọc. Nếu có hơn 50 dòng, kéo xuống cuối, bấm **Cũ hơn**, rồi **Về mới nhất**           | Trang sau là các dòng cũ hơn, không lặp dòng của trang trước                                           |
| 25  | Mở Prisma Studio (`pnpm db:studio`), bảng `audit_logs`, thử sửa hoặc xoá một dòng rồi lưu | Lưu thất bại: trigger `trg_audit_logs_append_only` chặn (có từ M1)                                     |

### Phân quyền

| #   | Bước                                                                    | Kết quả đúng                  |
| --- | ----------------------------------------------------------------------- | ----------------------------- |
| 26  | Đăng nhập bằng A, mở `/admin`, `/admin/alerts`, `/admin/audit`          | Cả ba là trang 404            |
| 27  | Khi đang đăng nhập A, mở `http://localhost:3000/api/v1/admin/dashboard` | JSON lỗi 403 `ADMIN_REQUIRED` |

### Tuỳ chọn: giao dịch treo và Indexer chậm

Hai luật này bắt sự cố hạ tầng (mất kết nối RPC), nên phải tạo sự cố thật. Làm trên Monad Testnet; CSDL chạy trong Docker trên máy nên vẫn hoạt động khi mất mạng. Mất khoảng 20 phút.

| #   | Bước                                                                                                                                                                                                       | Kết quả đúng                                                                                                                                                                                                                                                                |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 28  | Bắt đầu một thao tác ký MetaMask (ví dụ nhà bán lẻ bán một sản phẩm). Ngay khi MetaMask báo đã gửi và web chuyển sang chờ xác nhận, **tắt Wi-Fi** (hoặc rút mạng) của máy. Để `pnpm dev` chạy tiếp 16 phút | Log Worker báo lỗi RPC liên tục. Sau 15 phút, lượt quét kế tiếp ghi "Phát hiện bất thường mới: TRANSACTION_STUCK 1"; mở `/admin/alerts` (trang web chạy trên máy nên vẫn mở được) thấy **Giao dịch treo**, mức Trung bình, chi tiết có hàm contract, ví gửi, số phút đã chờ |
| 29  | Bật lại mạng                                                                                                                                                                                               | Worker đọc được biên nhận và chốt giao dịch (sản phẩm hiện Đã có chủ). Nếu lượt quét đầu sau khi có mạng chạy trước khi Indexer bắt kịp, có thêm cảnh báo **Indexer chậm**, mức Cao. Khi Indexer bắt kịp, ô Indexer trên Tổng quan về **Bắt kịp**                           |

Giao dịch không bao giờ vào block (ví huỷ hoặc thay giao dịch) không thuộc luật Giao dịch treo: từ M3, Worker đánh dấu nó **Không vào block** sau 10 phút (xem ô cùng tên trên Tổng quan).

M12 xong khi bước 1–27 đúng như cột cuối (28–29 tuỳ chọn).

## 4. Test tự động

Cần Docker PostgreSQL đang chạy (`pnpm db:up`).

```bash
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test        # unit và contract
pnpm test:e2e    # e2e, gồm apps/api/test/monitoring/monitoring.e2e-spec.ts
pnpm build
```

## 5. Lỗi thường gặp

| Hiện tượng                                   | Cách xử lý                                                                                                                                                              |
| -------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Đăng nhập sai 10 lần mà không có cảnh báo    | Worker chưa quét: đợi `ANOMALY_SCAN_INTERVAL_MINUTES` phút. Xem log Worker có dòng "Phát hiện bất thường mới". Nếu các lần sai trải dài quá 15 phút thì không đủ ngưỡng |
| Đăng nhập sai bị chặn trước 10 lần           | Đã có lần sai khác trong cùng phút từ cùng IP (giới hạn 10 lần mỗi phút). Đợi một phút rồi làm tiếp, cảnh báo vẫn đếm trong 15 phút                                     |
| Ô Indexer ghi **Không đọc được**             | API không gọi được RPC. Xem `/system/status`; các số liệu khác vẫn đúng                                                                                                 |
| Mở `/admin` thấy trang duyệt doanh nghiệp cũ | Trình duyệt giữ bản cũ: tải lại cứng (Ctrl+F5) sau khi `pnpm dev` đã build xong                                                                                         |
