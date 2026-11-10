# M7 – Kiểm thử tay trên Monad Testnet

Danh sách bước bấm tay để xác nhận M7 chạy đúng trên web thật (MetaMask, Monad Testnet). Thiết kế và API: [m7-service.md](m7-service.md).

## 1. Cài đặt

```bash
# Tắt pnpm dev đang chạy (Ctrl+C), rồi ở thư mục gốc dự án:
pnpm install

# Deploy ServiceTicketManager (nhập mật khẩu keystore khi được hỏi).
# Ví deploy phải là ví đã deploy PartyRegistry (còn quyền Admin).
pnpm --filter @dpp/contracts deploy:services:monad
# Chép 2 dòng in ra vào .env:
#   SERVICE_TICKET_MANAGER_ADDRESS=0x...
#   SERVICE_TICKET_MANAGER_DEPLOY_BLOCK=...

pnpm dev
# Chờ log "API đang chạy tại http://localhost:4000/api/v1" và "Worker đã sẵn sàng" rồi mới mở web.
```

Không cần migration, không cần làm mới CSDL: tài khoản, doanh nghiệp, sản phẩm và bảo hành của M6 giữ nguyên.

## 2. Dữ liệu cần có

- Tài khoản Admin (liên kết đúng ví đã deploy PartyRegistry).
- Một người mua đang sở hữu ít nhất một sản phẩm **còn bảo hành** (bán ở M6). Muốn thử "ngoài bảo hành" thì cần thêm một sản phẩm đăng ký với **0 tháng** bảo hành, đã bán cho người mua.
- **Mới:** một tài khoản cho trung tâm bảo hành và một tài khoản MetaMask riêng cho nó. Ví này trả phí đăng ký doanh nghiệp (mặc định 8 MON) và gas mở, đóng phiếu, nên cần khoảng 20 MON. Nếu thiếu MON, Admin có thể giảm phí ở **Quản trị** trước khi trung tâm nộp đơn, hoặc chuyển MON từ ví khác sang.

## 3. Các bước và kết quả đúng

| #   | Ai                   | Bước                                                                                                                                    | Kết quả đúng                                                                                                                                                           |
| --- | -------------------- | --------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Trung tâm            | Đăng ký tài khoản mới, vào **Tài khoản**, liên kết ví MetaMask mới                                                                      | Báo "Đã liên kết ví thành công"                                                                                                                                        |
| 2   | Trung tâm            | **Doanh nghiệp** → loại **Trung tâm bảo hành** → nộp đơn và phí                                                                         | Trạng thái "Chờ duyệt"                                                                                                                                                 |
| 3   | Admin                | **Quản trị** → duyệt đơn của trung tâm                                                                                                  | Trung tâm "Đã duyệt"; menu của tài khoản trung tâm có mục **Bảo hành**, trang `/service` có 3 tab Chờ tiếp nhận 0, Đang sửa 0, Đã đóng 0                               |
| 4   | Người mua            | **Đã mua** → mở sản phẩm còn bảo hành                                                                                                   | Có khung **Bảo hành và sửa chữa**, ô chọn trung tâm có trung tâm vừa duyệt                                                                                             |
| 5   | Người mua            | Bấm **Gửi yêu cầu bảo hành** khi để trống mô tả                                                                                         | Báo "Mô tả lỗi của sản phẩm", không gửi                                                                                                                                |
| 6   | Người mua            | Nhập mô tả lỗi → **Gửi yêu cầu bảo hành** (không cần MetaMask)                                                                          | Thẻ "Đã gửi yêu cầu" kèm nút **Huỷ yêu cầu**; form ẩn, ghi "Sản phẩm đang có một yêu cầu chưa xong…"                                                                   |
| 7   | Người mua            | **Huỷ yêu cầu**, rồi gửi lại một yêu cầu mới                                                                                            | Yêu cầu cũ "Đã huỷ"; yêu cầu mới "Đã gửi yêu cầu" (SVC-02)                                                                                                             |
| 8   | Nhà bán lẻ           | Đăng nhập, mở `http://localhost:3000/service`                                                                                           | Không có menu **Bảo hành**; trang báo chỉ người đại diện trung tâm bảo hành mới dùng được                                                                              |
| 9   | Trung tâm            | **Bảo hành** → tab Chờ tiếp nhận (1) → **Tiếp nhận**                                                                                    | Trang phiếu có tên chủ sở hữu, email đã che (`t***@gmail.com`), mô tả lỗi, bảo hành "Còn bảo hành … ngày"                                                              |
| 10  | Trung tâm            | **Tiếp nhận và mở phiếu** → MetaMask ký `openTicket`                                                                                    | 3 bước chạy xong; trạng thái **Đang sửa**, bảo hành **Tạm dừng khi sửa**, phiếu ghi "Trong bảo hành"; nhật ký **Mở phiếu sửa chữa** có txHash mở được trên MonadVision |
| 11  | Người mua            | Tải lại trang sản phẩm                                                                                                                  | Yêu cầu "Đang sửa", có dòng Tiếp nhận kèm txHash; bảo hành "Tạm dừng khi sửa"; **không còn** nút Huỷ yêu cầu                                                           |
| 12  | Trung tâm            | Ở form kết quả, chọn một file `.gif` hoặc file lớn hơn 5 MB                                                                             | Báo lỗi loại file hoặc dung lượng, nút đóng phiếu bị mờ                                                                                                                |
| 13  | Trung tâm            | **Đã sửa xong**, việc đã làm **Thay linh kiện**, ghi chú, chọn ảnh JPG/PNG → **Ghi biên bản và đóng phiếu** → MetaMask ký `closeTicket` | Trạng thái **Đã sửa xong**; dòng xanh "Băm lại biên bản khớp hash đã ghi on-chain"; nhật ký có thêm **Đóng phiếu sửa chữa**                                            |
| 14  | Trung tâm            | Xem khung Bảo hành                                                                                                                      | Về **Còn bảo hành**, ngày hết hạn giữ nguyên (không cộng thêm thời gian sửa)                                                                                           |
| 15  | Người mua            | Tải lại trang sản phẩm → **Xem ảnh**                                                                                                    | Thấy kết quả, việc đã làm, ghi chú; ảnh biên bản mở đúng; dòng khớp hash màu xanh                                                                                      |
| 16  | Ai cũng được         | Mở hộ chiếu công khai `/p/<mã>` (không đăng nhập) → tab **Bảo hành**                                                                    | Có bước "Tiếp nhận sửa chữa" và "Sửa xong", mỗi bước có txHash; **không** có mô tả lỗi, ghi chú, ảnh hay tên người mua                                                 |
| 17  | Người mua, trung tâm | Lặp lại 6, 10, 13 với sản phẩm **0 tháng** bảo hành, lần này đóng phiếu bằng **Không sửa được**, không chọn ảnh                         | Phiếu ghi **Ngoài bảo hành**, trạng thái **Không sửa được**, "Không đính kèm file", vẫn khớp hash                                                                      |
| 18  | (Tuỳ chọn)           | `pnpm db:studio` → bảng `service_records` → sửa `action_detail` của phiếu đã đóng → tải lại trang phiếu                                 | Dòng đỏ "Biên bản đang lưu không khớp hash on-chain (đã bị sửa)"; sửa lại như cũ thì xanh trở lại                                                                      |

M7 xong khi bước 1–16 đúng như cột cuối (17, 18 nên chạy nếu có thời gian, để thấy "ngoài bảo hành" và chống sửa dữ liệu).

## 4. Test tự động

Cần Docker PostgreSQL đang chạy (`pnpm db:up`).

```bash
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test        # 347 unit và contract
pnpm test:e2e    # 94 e2e, gồm apps/api/test/service/service.e2e-spec.ts
pnpm build
```

## 5. Lỗi thường gặp

| Hiện tượng                                              | Cách xử lý                                                                                                                                              |
| ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Trang Bảo hành báo "chưa cấu hình ServiceTicketManager" | Chưa chép 2 dòng `SERVICE_TICKET_MANAGER_*` vào `.env`, hoặc chưa khởi động lại `pnpm dev`                                                              |
| Script deploy báo ví không có quyền Admin               | Dùng đúng ví (keystore) đã deploy PartyRegistry                                                                                                         |
| Báo "MetaMask đang chọn ví khác…"                       | Mở MetaMask, chọn đúng tài khoản đã liên kết với tài khoản trung tâm rồi bấm lại                                                                        |
| Bấm mở/đóng phiếu xong cứ chờ "block finalized" lâu     | Worker đang bắt kịp chain sau thời gian tắt máy (khoảng 3 phút cho mỗi ngày tắt); log Worker báo còn bao nhiêu block, chờ `/system/status` hết báo chậm |
| "Sản phẩm đang có một phiếu sửa chữa chưa đóng"         | Đóng phiếu đang mở trước khi tiếp nhận yêu cầu mới của cùng sản phẩm                                                                                    |
