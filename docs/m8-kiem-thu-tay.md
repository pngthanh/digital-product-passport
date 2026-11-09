# M8 – Kiểm thử tay trên Monad Testnet

Danh sách bước bấm tay để xác nhận M8 chạy đúng trên web thật (MetaMask, Monad Testnet). Thiết kế và API: [m8-inspection.md](m8-inspection.md).

## 1. Cài đặt

Chạy trong PowerShell, ở thư mục gốc dự án.

```powershell
# Tắt pnpm dev đang chạy (Ctrl+C). Giải nén zip M8 đè lên dự án, rồi xoá 3 file M7 đã chuyển chỗ:
git rm apps/api/src/modules/service/application/evidence-files.ts apps/api/src/modules/service/infrastructure/local-evidence.storage.ts apps/web/src/features/service/service-flows.spec.ts

pnpm install

# Bật Docker Desktop trước, rồi áp migration mới (bảng inspection_requests) cho CSDL chính và CSDL test
pnpm db:up
pnpm db:deploy
pnpm --filter @dpp/api db:deploy:test

# Deploy InspectionRegistry (nhập mật khẩu keystore). Không cần quyền Admin, chỉ cần MON trả gas.
pnpm --filter @dpp/contracts deploy:inspections:monad
# Chép 2 dòng in ra vào .env:
#   INSPECTION_REGISTRY_ADDRESS=0x...
#   INSPECTION_REGISTRY_DEPLOY_BLOCK=...

pnpm dev
# Chờ log "API đang chạy tại http://localhost:4000/api/v1" và "Worker đã sẵn sàng" rồi mới mở web.
```

Nếu đã commit M7 bằng `git` thì `git rm` vừa xoá file vừa đưa thay đổi vào lần commit sau. Nếu báo file không tồn tại thì bỏ qua dòng đó.

Không cần làm mới CSDL. Tài khoản, doanh nghiệp, sản phẩm, bảo hành và phiếu sửa chữa của M7 giữ nguyên.

## 2. Dữ liệu cần có

- Tài khoản Admin và tài khoản nhà sản xuất đã duyệt, có ít nhất một sản phẩm **đã ghi lên blockchain**.
- Một người mua đang sở hữu ít nhất một sản phẩm (đã bán ở M6).
- **Mới:** một tài khoản cho đơn vị kiểm định cùng một tài khoản MetaMask riêng. Ví này trả phí đăng ký doanh nghiệp (mặc định 8 MON) và gas ghi kết quả, nên cần khoảng 10 MON. Thiếu MON thì Admin giảm phí ở **Quản trị** trước khi nộp đơn, hoặc chuyển MON từ ví khác sang.

## 3. Các bước và kết quả đúng

| #   | Ai                          | Bước                                                                                                                  | Kết quả đúng                                                                                                                                                                                       |
| --- | --------------------------- | --------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Đơn vị kiểm định            | Đăng ký tài khoản mới, vào **Tài khoản**, liên kết ví MetaMask mới                                                    | Báo "Đã liên kết ví thành công"                                                                                                                                                                    |
| 2   | Đơn vị kiểm định            | **Doanh nghiệp** → loại **Đơn vị kiểm định** → nộp đơn và phí                                                         | Trạng thái "Chờ duyệt"                                                                                                                                                                             |
| 3   | Admin                       | **Quản trị** → duyệt đơn của đơn vị kiểm định                                                                         | Đơn vị "Đã duyệt"; menu của tài khoản đơn vị có mục **Kiểm định**, trang `/inspection` có 3 tab Chờ kiểm định 0, Đã có kết quả 0, Từ chối/huỷ 0                                                    |
| 4   | Nhà sản xuất                | **Sản phẩm** → mở một sản phẩm đã ghi lên blockchain                                                                  | Có khung **Kiểm định**, ô chọn đơn vị có đơn vị vừa duyệt                                                                                                                                          |
| 5   | Nhà sản xuất                | Bấm **Gửi yêu cầu kiểm định** khi để trống nội dung                                                                   | Báo "Ghi nội dung cần kiểm định", không gửi                                                                                                                                                        |
| 6   | Nhà sản xuất                | Nhập nội dung → **Gửi yêu cầu kiểm định** (không cần MetaMask)                                                        | Thẻ "Chờ kiểm định" kèm nút **Huỷ yêu cầu**; form ẩn, ghi "Sản phẩm đang có một yêu cầu kiểm định chờ kết quả…"                                                                                    |
| 7   | Nhà sản xuất                | **Huỷ yêu cầu**, rồi gửi lại một yêu cầu mới                                                                          | Yêu cầu cũ "Đã huỷ"; yêu cầu mới "Chờ kiểm định" (INS-03)                                                                                                                                          |
| 8   | Nhà bán lẻ                  | Đăng nhập, mở `http://localhost:3000/inspection`                                                                      | Không có menu **Kiểm định**; trang báo chỉ người đại diện đơn vị kiểm định mới dùng được                                                                                                           |
| 9   | Đơn vị kiểm định            | **Kiểm định** → tab Chờ kiểm định (1) → **Kiểm định**                                                                 | Trang yêu cầu ghi "Nhà sản xuất gửi" kèm tên công ty, nội dung cần kiểm định, trạng thái sản phẩm                                                                                                  |
| 10  | Đơn vị kiểm định            | Ở form kết quả, chọn một file `.gif` hoặc file lớn hơn 5 MB                                                           | Báo lỗi loại file hoặc dung lượng, nút ghi kết quả bị mờ                                                                                                                                           |
| 11  | Đơn vị kiểm định            | Chọn **Đạt**, ghi kết luận, chọn ảnh JPG/PNG → **Ghi kết quả kiểm định** → MetaMask ký `recordInspection`             | 3 bước chạy xong; trạng thái **Đã có kết quả**; dòng xanh "Băm lại biên bản khớp hash đã ghi on-chain"; khung **Trên blockchain** có **Ghi kết quả kiểm định** kèm txHash mở được trên MonadVision |
| 12  | Nhà sản xuất                | Tải lại trang sản phẩm → **Xem ảnh**                                                                                  | Yêu cầu "Đã có kết quả", kết quả **Đạt**, kết luận, ảnh mở đúng, dòng xanh; trạng thái sản phẩm **không đổi**                                                                                      |
| 13  | Ai cũng được                | Mở hộ chiếu công khai `/p/<mã>` (không đăng nhập)                                                                     | Có khung **Kết quả kiểm định**: đơn vị, "theo yêu cầu của nhà sản xuất", Đạt, kết luận, **Xem ảnh** mở được, dòng xanh; tab **Kiểm định** trong lịch sử có bước "Kiểm định" kèm txHash             |
| 14  | Người mua                   | **Đã mua** → mở sản phẩm → khung **Kiểm định** → ghi nội dung → **Gửi yêu cầu kiểm định**                             | Thẻ "Chờ kiểm định" kèm **Huỷ yêu cầu**                                                                                                                                                            |
| 15  | Đơn vị kiểm định            | Mở yêu cầu mới → khung **Từ chối**: ghi lý do → **Từ chối yêu cầu**                                                   | Trang ghi "Chủ sở hữu gửi" kèm họ tên và email đã che (`t***@gmail.com`); sau khi từ chối, trạng thái **Bị từ chối**, không tốn gas                                                                |
| 16  | Người mua                   | Tải lại trang → thấy lý do → gửi lại một yêu cầu                                                                      | Yêu cầu cũ "Bị từ chối" kèm "Lý do từ chối: …"; yêu cầu mới "Chờ kiểm định" (INS-04)                                                                                                               |
| 17  | Đơn vị kiểm định, người mua | Đơn vị chọn **Không đạt**, ghi kết luận, **không** chọn file → ghi kết quả; người mua tải lại trang, rồi mở `/p/<mã>` | Kết quả **Không đạt**, "Không đính kèm file", vẫn khớp hash; sản phẩm vẫn **Đã có chủ**; hộ chiếu ghi "theo yêu cầu của chủ sở hữu", **không** có tên người mua hay nội dung yêu cầu               |
| 18  | (Tuỳ chọn)                  | `pnpm db:studio` → bảng `inspections` → sửa `summary` của một kết quả đã ghi → tải lại `/p/<mã>`                      | Dòng đỏ "Biên bản đang lưu không khớp hash on-chain (đã bị sửa)"; sửa lại như cũ thì xanh trở lại                                                                                                  |

M8 xong khi bước 1–17 đúng như cột cuối. Bước 18 nên chạy nếu có thời gian, để thấy hệ thống chống sửa dữ liệu.

## 4. Test tự động

Cần Docker PostgreSQL đang chạy (`pnpm db:up`).

```bash
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test        # 374 unit và contract
pnpm test:e2e    # 101 e2e, gồm apps/api/test/inspection/inspection.e2e-spec.ts
pnpm build
```

## 5. Lỗi thường gặp

| Hiện tượng                                                          | Cách xử lý                                                                                                 |
| ------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| Typecheck báo `evidence-files.ts` hoặc `service-flows.spec.ts` lỗi  | Chưa xoá 3 file M7 đã chuyển chỗ (mục 1)                                                                   |
| API báo lỗi bảng `inspection_requests` không tồn tại                | Chưa chạy `pnpm db:deploy` (và `pnpm --filter @dpp/api db:deploy:test` cho test e2e)                       |
| Trang Kiểm định báo "chưa cấu hình InspectionRegistry"              | Chưa chép 2 dòng `INSPECTION_REGISTRY_*` vào `.env`, hoặc chưa khởi động lại `pnpm dev`                    |
| Script deploy báo ProductPassport không dùng PARTY_REGISTRY_ADDRESS | `.env` đang trộn địa chỉ của hai lần deploy khác nhau; kiểm tra lại hai dòng đó                            |
| Báo "MetaMask đang chọn ví khác…"                                   | Mở MetaMask, chọn đúng tài khoản đã liên kết với tài khoản đơn vị kiểm định rồi bấm lại                    |
| Ghi kết quả xong cứ chờ "block finalized" lâu                       | Worker đang bắt kịp chain sau thời gian tắt máy; xem `/system/status`, chờ Indexer chạy tới block hiện tại |
| Báo "Người gửi không còn quyền yêu cầu kiểm định sản phẩm này"      | Sản phẩm đã đổi chủ hoặc bị thu hồi sau khi gửi yêu cầu; từ chối yêu cầu đó kèm lý do                      |
