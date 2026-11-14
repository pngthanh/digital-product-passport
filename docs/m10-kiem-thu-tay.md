# M10 – Kiểm thử tay trên Monad Testnet

Danh sách dưới đây là các bước bấm tay để xác nhận M10 chạy đúng trên web thật, với MetaMask và Monad Testnet. Thiết kế và API nằm ở [m10-lifecycle.md](m10-lifecycle.md).

## 1. Cài đặt

Chạy trong PowerShell, ở thư mục gốc dự án.

```powershell
# Tắt pnpm dev đang chạy (Ctrl+C). Giải nén zip M10 đè lên dự án, rồi:
pnpm install

# Bật Docker Desktop trước. M10 có một migration nhỏ (bỏ UNIQUE recalls.tx_hash), không xoá dữ liệu.
pnpm db:up
pnpm db:deploy
pnpm --filter @dpp/api db:deploy:test   # CSDL test, cần cho pnpm test:e2e

# Deploy ProductLifecycle (nhập mật khẩu keystore). Ví deploy phải là ví Admin đã deploy PartyRegistry,
# vì script cấp LIFECYCLE_CONTRACT_ROLE cho contract mới.
pnpm --filter @dpp/contracts deploy:lifecycle:monad
# Chép 2 dòng in ra vào .env:
#   PRODUCT_LIFECYCLE_ADDRESS=0x...
#   PRODUCT_LIFECYCLE_DEPLOY_BLOCK=...

pnpm dev
# Chờ log "API đang chạy tại http://localhost:4000/api/v1" và "Worker đã sẵn sàng" rồi mới mở web.
```

Không cần làm mới CSDL. Mọi dữ liệu từ M2 đến M9 giữ nguyên.

## 2. Dữ liệu cần có

Các tài khoản đã có từ M4–M9, mỗi ví còn khoảng 0,5 MON để trả gas:

- **Nhà sản xuất M**.
- **Nhà bán lẻ R**.
- **Trung tâm bảo hành S**.
- **Đơn vị kiểm định I**.
- Hai người mua đã liên kết ví: **A** và **B**.

Chuẩn bị trước bước 1:

- **M** tạo và đăng ký lên blockchain **3 sản phẩm mới P1, P2, P3** (trang **Sản phẩm**, như M5). Chưa gửi đi.
- **A** đang sở hữu **2 sản phẩm khác P5, P6**, chưa thu hồi. Dùng sản phẩm A đã có từ M6 hoặc M9. Nếu chưa đủ, R bán thêm cho A.

Ở mọi bước, **chuông** nghĩa là biểu tượng chuông trên thanh đầu trang. Bấm vào chuông là mở trang **Thông báo**.

## 3. Các bước và kết quả đúng

### Thông báo của M6 và M9, chuẩn bị thu hồi

| #   | Ai   | Bước                                                                                                  | Kết quả đúng                                                                                                            |
| --- | ---- | ----------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| 1   | M, R | M gửi P1, P2, P3 tới R (Giao hàng, như M6). R tải lại trang bất kỳ                                    | Chuông của R có số **3**; trang **Thông báo** có 3 dòng **Có hàng gửi tới cửa hàng**, ghi tên M và từng sản phẩm        |
| 2   | R    | Bấm một thông báo                                                                                     | Mở **Kho hàng** tab **Chờ nhận**; quay lại thì thông báo đó hết chấm xanh, chuông còn **2**                             |
| 3   | R    | Xác nhận nhận **P1 và P2** (P3 để nguyên ở Chờ nhận). Bán **P1** cho A                                | P2 ở tab **Đang bán** có nút **Bán**                                                                                    |
| 4   | A    | **Đã mua** → P1 → khung **Bảo hành và sửa chữa**: gửi yêu cầu bảo hành tới S, **chưa** để S tiếp nhận | Thẻ "Đã gửi yêu cầu"                                                                                                    |
| 5   | A, B | A: khung **Chuyển nhượng** của P1 → gửi cho email của B, 7 ngày. B tải lại trang                      | Chuông của B có **Có yêu cầu chuyển nhượng gửi tới**; bấm vào mở `/transfers` tab **Gửi tới tôi**. B **chưa** chấp nhận |

### RCL-01: thu hồi một lô

| #   | Ai           | Bước                                                                                                                                                                       | Kết quả đúng                                                                                                                                                                                          |
| --- | ------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 6   | M            | **Sản phẩm** → đánh dấu P1, P2, P3                                                                                                                                         | Có nút **Thu hồi (3)**                                                                                                                                                                                |
| 7   | M            | Bấm **Thu hồi (3)** → nhập lý do "lỗi pin" → đánh dấu **Tôi hiểu thu hồi không hoàn tác được** → bấm ký                                                                    | Báo "Lý do thu hồi tối thiểu 10 ký tự", chưa mở MetaMask                                                                                                                                              |
| 8   | M            | Nhập lý do đầy đủ, ví dụ "Pin có thể phồng khi sạc qua đêm. Ngừng sử dụng và mang tới cửa hàng để được đổi." → **Ký và thu hồi 3 sản phẩm** → MetaMask ký `recallProducts` | 3 bước chạy xong; ba dòng có nhãn **Bị thu hồi**; bộ lọc **Đã thu hồi** đếm 3                                                                                                                         |
| 9   | M            | Mở P1                                                                                                                                                                      | Khung đỏ **Sản phẩm đã bị nhà sản xuất thu hồi** có lý do vừa nhập, ngày, link giao dịch mở được trên MonadVision                                                                                     |
| 10  | M            | Quay lại danh sách, đánh dấu lại P1                                                                                                                                        | Không có nút **Thu hồi** (sản phẩm đã ở trạng thái cuối)                                                                                                                                              |
| 11  | R            | Chuông → **Thông báo**                                                                                                                                                     | Có **2** dòng **Sản phẩm bị thu hồi** (chữ đỏ) cho P2 (đang giữ) và P3 (sắp nhận), kèm lý do. Không có dòng cho P1 (đã bán cho A)                                                                     |
| 12  | R            | **Kho hàng** → tab **Đang bán**, rồi tab **Chờ nhận**; mở P2                                                                                                               | P2 có nhãn **Bị thu hồi**, không có nút **Bán**; P3 không còn ở Chờ nhận (đã huỷ bàn giao); trang P2 có khung đỏ "Gỡ sản phẩm khỏi kệ…"                                                               |
| 13  | A            | Chuông → **Thông báo** → bấm dòng **Sản phẩm bị thu hồi**                                                                                                                  | Dòng ghi tên M, P1 và lý do; bấm vào mở hộ chiếu công khai của P1                                                                                                                                     |
| 14  | A            | **Đã mua** → P1                                                                                                                                                            | Khung đỏ có lý do; **Bảo hành** ghi "Bảo hành không còn áp dụng"; yêu cầu bảo hành ở bước 4 không còn chờ; khung **Kiểm định** và **Bảo hành và sửa chữa** ghi không gửi được; không có khung báo mất |
| 15  | B            | **Chuyển nhượng** → **Gửi tới tôi**                                                                                                                                        | Yêu cầu P1 có dòng cam "Sản phẩm đã bị thu hồi, báo mất hoặc ngừng sử dụng…"; **không** có nút **Chấp nhận**, **Từ chối**                                                                             |
| 16  | A            | **Chuyển nhượng** → **Tôi đã gửi** → **Huỷ yêu cầu** → MetaMask ký `cancelTransfer`                                                                                        | Yêu cầu chuyển sang **Đã đóng** với nhãn **Chủ đã huỷ**                                                                                                                                               |
| 17  | Ai cũng được | Đăng xuất, mở `/p/<mã P1>`                                                                                                                                                 | Khung đỏ trên cùng có tên M, lý do, giao dịch; lịch sử có tab **Thu hồi, báo mất** với bước **Nhà sản xuất thu hồi**; **không** có tên hay email của A                                                |

### Thông báo của M7, LIF-01 báo mất

| #   | Ai           | Bước                                                                                                      | Kết quả đúng                                                                                                                                                   |
| --- | ------------ | --------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 18  | A, S         | A gửi yêu cầu bảo hành cho **P5**; S **tiếp nhận** (mở phiếu sửa)                                         | Chuông của A có **Trung tâm bảo hành đã tiếp nhận**                                                                                                            |
| 19  | A            | **Đã mua** → P5 → khung **Báo mất hoặc ngừng sử dụng**                                                    | Khung ghi "Sản phẩm đang ở trung tâm bảo hành (phiếu sửa chữa đang mở)…", không có nút                                                                         |
| 20  | S, A         | S **đóng phiếu**, chọn đã sửa xong                                                                        | Chuông của A có **Sản phẩm đã sửa xong**; khung của P5 hiện hai nút **Báo mất hoặc bị trộm** và **Ngừng sử dụng**                                              |
| 21  | A            | **Báo mất hoặc bị trộm** → đánh dấu **Tôi hiểu thao tác này không hoàn tác được** → ký `reportLostStolen` | Khung cam **Chủ sở hữu đã báo sản phẩm bị mất hoặc bị trộm**; nhãn **Báo mất cắp**                                                                             |
| 22  | Ai cũng được | Mở `/p/<mã P5>` khi chưa đăng nhập                                                                        | Khung cam báo mất kèm "hãy cẩn trọng…"; **không** có tên chủ; lịch sử tab **Thu hồi, báo mất** có bước **Báo mất hoặc bị trộm** ("Người dùng cá nhân báo mất") |

### Thông báo của M8, LIF-02 ngừng sử dụng

| #   | Ai   | Bước                                                              | Kết quả đúng                                                                                                                 |
| --- | ---- | ----------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| 23  | A, I | A gửi yêu cầu kiểm định **P6** tới I; I **từ chối** kèm lý do     | Chuông của A có **Yêu cầu kiểm định bị từ chối** kèm lý do của I                                                             |
| 24  | A, I | A gửi lại; I **ghi kết quả** (ví dụ Đạt)                          | Chuông của A có **Có kết quả kiểm định** ghi tên I và kết quả                                                                |
| 25  | A    | P6 → **Ngừng sử dụng** → đánh dấu ô xác nhận → ký `retireProduct` | Khung xám **Sản phẩm đã ngừng sử dụng**; khung **Chuyển nhượng**, **Bảo hành và sửa chữa**, **Kiểm định** không còn form gửi |
| 26  | A    | Chuông → **Thông báo** → **Đánh dấu tất cả đã đọc**               | Mọi dòng hết chấm xanh; chuông không còn số                                                                                  |

M10 xong khi bước 1–26 đúng như cột cuối.

## 4. Test tự động

Cần Docker PostgreSQL đang chạy (`pnpm db:up`).

```bash
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test        # 426 unit và contract
pnpm test:e2e    # 112 e2e, gồm apps/api/test/lifecycle/lifecycle.e2e-spec.ts
pnpm build
```

## 5. Lỗi thường gặp

| Hiện tượng                                                          | Cách xử lý                                                                                                                                            |
| ------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm db:deploy` báo không kết nối được CSDL                        | Bật Docker Desktop rồi chạy lại `pnpm db:up`                                                                                                          |
| Script deploy báo ví deploy không có quyền Admin trên PartyRegistry | Keystore đang giữ khoá của ví khác. Đặt lại bằng khoá ví Admin: `pnpm --filter @dpp/contracts exec hardhat keystore set DEPLOYER_PRIVATE_KEY --force` |
| Script deploy báo thiếu `SERVICE_TICKET_MANAGER_ADDRESS`            | Chép lại dòng này từ lần deploy M7 vào `.env`                                                                                                         |
| Bấm thu hồi báo "Hệ thống chưa cấu hình ProductLifecycle"           | Chưa chép 2 dòng `PRODUCT_LIFECYCLE_*` vào `.env`, hoặc chưa khởi động lại `pnpm dev`                                                                 |
| Không thấy nút **Thu hồi (n)**                                      | Các dòng đã chọn chưa lên blockchain (bản nháp) hoặc đã ở trạng thái cuối                                                                             |
| Báo "MetaMask đang chọn ví khác…"                                   | Mở MetaMask, chọn đúng tài khoản đã liên kết với tài khoản đang đăng nhập rồi bấm lại                                                                 |
| Chuông chưa có số sau khi bên kia đã ký                             | Thông báo tạo khi Worker ghi nhận block finalized. Chờ vài giây rồi tải lại trang                                                                     |
| Gửi xong cứ chờ "block finalized" lâu                               | Worker đang bắt kịp chain sau thời gian tắt máy; log Worker báo còn bao nhiêu block, chờ `/system/status` hết báo chậm                                |
