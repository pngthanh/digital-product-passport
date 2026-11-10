# M9 – Kiểm thử tay trên Monad Testnet

Đây là danh sách bước bấm tay để xác nhận M9 chạy đúng trên web thật, với MetaMask và Monad Testnet. Thiết kế và API nằm ở [m9-transfer.md](m9-transfer.md).

## 1. Cài đặt

Chạy trong PowerShell, ở thư mục gốc dự án.

```powershell
# Tắt pnpm dev đang chạy (Ctrl+C). Giải nén zip M9 đè lên dự án, rồi:
pnpm install

# Bật Docker Desktop trước. M9 không có migration mới.
pnpm db:up

# Deploy OwnershipTransfer (nhập mật khẩu keystore). Ví deploy phải là ví Admin đã deploy PartyRegistry,
# vì script cấp TRANSFER_CONTRACT_ROLE cho contract mới.
pnpm --filter @dpp/contracts deploy:transfers:monad
# Chép 2 dòng in ra vào .env:
#   OWNERSHIP_TRANSFER_ADDRESS=0x...
#   OWNERSHIP_TRANSFER_DEPLOY_BLOCK=...

pnpm dev
# Chờ log "API đang chạy tại http://localhost:4000/api/v1" và "Worker đã sẵn sàng" rồi mới mở web.
```

Không cần làm mới CSDL. Mọi dữ liệu từ M2 đến M8 giữ nguyên.

## 2. Dữ liệu cần có

- **Người mua A** đang sở hữu ít nhất một sản phẩm (đã bán ở M6) và đã liên kết ví.
- **Mới:** một tài khoản cá nhân **B** với một tài khoản MetaMask riêng, chưa liên kết ví. Ví B cần khoảng 0,5 MON để trả gas.
- Một nhà bán lẻ đã duyệt (có sẵn từ M6) để thử chuyển cho doanh nghiệp. Ghi lại mã số thuế của nhà bán lẻ.
- Một trung tâm bảo hành đã duyệt (có sẵn từ M7).

## 3. Các bước và kết quả đúng

| #   | Ai                    | Bước                                                                                                                   | Kết quả đúng                                                                                                                                                                      |
| --- | --------------------- | ---------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | B                     | Đăng ký tài khoản, **không** liên kết ví                                                                               | Menu có mục **Chuyển nhượng**; trang `/transfers` có 3 tab Gửi tới tôi 0, Tôi đã gửi 0, Đã đóng 0                                                                                 |
| 2   | A                     | **Đã mua** → mở sản phẩm → khung **Bảo hành và sửa chữa**: gửi một yêu cầu bảo hành, **chưa** để trung tâm tiếp nhận   | Thẻ "Đã gửi yêu cầu" kèm **Huỷ yêu cầu**                                                                                                                                          |
| 3   | A                     | Khung **Chuyển nhượng** → nhập email của chính mình → **Kiểm tra**                                                     | Báo "Bên nhận đang là chủ sở hữu của sản phẩm này"; nút **Gửi yêu cầu chuyển nhượng** vẫn mờ                                                                                      |
| 4   | A                     | Nhập một email không có trong hệ thống, rồi một mã số thuế không có → **Kiểm tra**                                     | Báo không tìm thấy bên nhận                                                                                                                                                       |
| 5   | A                     | Nhập email của B → **Kiểm tra**                                                                                        | Hiện "Chuyển cho Phạm …" kèm email đã che và dòng cam "Người này chưa liên kết ví MetaMask…"                                                                                      |
| 6   | A                     | Chọn **7 ngày** → **Gửi yêu cầu chuyển nhượng** → MetaMask ký `createTransferRequest`                                  | 3 bước chạy xong; khung hiện thẻ **Chờ bên nhận** "Yêu cầu #n", bên nhận là B, hạn chấp nhận sau 7 ngày, link giao dịch mở được trên MonadVision, nút **Huỷ yêu cầu**             |
| 7   | B                     | **Chuyển nhượng** → tab **Gửi tới tôi**                                                                                | Có yêu cầu của A (họ tên, email đã che), dòng cam "Liên kết ví MetaMask ở trang Tài khoản trước…", chưa có nút chấp nhận                                                          |
| 8   | B                     | **Tài khoản** → liên kết ví MetaMask của B → quay lại **Chuyển nhượng**                                                | Có hai nút **Chấp nhận** và **Từ chối**                                                                                                                                           |
| 9   | B                     | **Chấp nhận** → MetaMask ký `acceptTransfer`                                                                           | 2 bước chạy xong; tab Gửi tới tôi trống; menu B có **Đã mua**, mở được sản phẩm; khung **Bảo hành** còn đúng số ngày như trước; yêu cầu bảo hành của A **không** còn chờ (TRF-03) |
| 10  | A                     | Mở lại link sản phẩm cũ trong **Đã mua**; rồi **Chuyển nhượng** → **Đã đóng**                                          | Trang sản phẩm báo "Không tìm thấy trang"; tab Đã đóng có yêu cầu **Đã chuyển quyền** kèm link giao dịch tạo và đóng                                                              |
| 11  | Ai cũng được          | Mở hộ chiếu công khai `/p/<mã>` (không đăng nhập) → tab **Chuyển nhượng** trong lịch sử                                | Có bước **Chuyển quyền sở hữu** "Người dùng cá nhân chuyển cho Người dùng cá nhân" kèm txHash; **không** có tên hay email của A, B                                                |
| 12  | B                     | Khung **Chuyển nhượng** → nhập mã số thuế nhà bán lẻ → **Kiểm tra** → chọn 3 ngày → gửi                                | Hiện tên nhà bán lẻ kèm "MST …"; thẻ **Chờ bên nhận**                                                                                                                             |
| 13  | B                     | **Huỷ yêu cầu** → MetaMask ký `cancelTransfer`                                                                         | Form gửi hiện lại; dưới cùng có "Yêu cầu đã đóng" với nhãn **Chủ đã huỷ** (TRF-02)                                                                                                |
| 14  | B, nhà bán lẻ         | B gửi lại cho nhà bán lẻ; người đại diện nhà bán lẻ vào **Chuyển nhượng** → **Từ chối** → MetaMask ký `rejectTransfer` | Bên nhận ghi tên doanh nghiệp "(bạn đại diện)"; sau khi ký, tab trống; B tải lại trang sản phẩm thấy **Bên nhận từ chối** (TRF-04), sản phẩm vẫn của B                            |
| 15  | B, nhà bán lẻ         | B gửi lại lần nữa; nhà bán lẻ **Chấp nhận**                                                                            | Menu nhà bán lẻ có **Đã mua**, sản phẩm nằm trong đó (doanh nghiệp là chủ)                                                                                                        |
| 16  | Nhà bán lẻ, A         | Nhà bán lẻ mở sản phẩm ở **Đã mua** → chuyển cho email của A, chọn 1 ngày; A vào **Chuyển nhượng** → **Chấp nhận**     | Bên gửi ghi tên nhà bán lẻ kèm MST; A nhận lại sản phẩm                                                                                                                           |
| 17  | Trung tâm bảo hành, A | A gửi yêu cầu bảo hành, trung tâm **tiếp nhận** (mở phiếu sửa); A mở khung **Chuyển nhượng**                           | Khung ghi "Sản phẩm đang có phiếu sửa chữa mở…", không có form gửi; trung tâm đóng phiếu thì form hiện lại                                                                        |
| 18  | (Tuỳ chọn) A, B       | A gửi cho B với **1 ngày**, chờ quá 1 ngày rồi mở `/transfers`                                                         | Thẻ ghi **Quá hạn, chưa đóng**, chỉ còn nút **Đóng yêu cầu hết hạn**; bấm và ký `expireTransfer` thì yêu cầu thành **Hết hạn** (TRF-05)                                           |

M9 xong khi bước 1–17 đúng như cột cuối. Bước 18 cần chờ hơn một ngày; test e2e đã chạy trường hợp này bằng cách tua thời gian trên Hardhat.

## 4. Test tự động

Cần Docker PostgreSQL đang chạy (`pnpm db:up`).

```bash
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test        # 396 unit và contract
pnpm test:e2e    # 106 e2e, gồm apps/api/test/transfer/transfer.e2e-spec.ts
pnpm build
```

## 5. Lỗi thường gặp

| Hiện tượng                                                                      | Cách xử lý                                                                                                                                              |
| ------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Script deploy báo ví deploy không có quyền Admin trên PartyRegistry             | Keystore đang giữ khoá của ví khác. Đặt lại bằng khoá ví Admin: `pnpm --filter @dpp/contracts exec hardhat keystore set DEPLOYER_PRIVATE_KEY --force`   |
| Script deploy báo thiếu `SERVICE_TICKET_MANAGER_ADDRESS`                        | Chép lại dòng này từ lần deploy M7 vào `.env`                                                                                                           |
| Khung Chuyển nhượng báo "chưa cấu hình OwnershipTransfer"                       | Chưa chép 2 dòng `OWNERSHIP_TRANSFER_*` vào `.env`, hoặc chưa khởi động lại `pnpm dev`                                                                  |
| Nút **Gửi yêu cầu chuyển nhượng** mờ                                            | Bấm **Kiểm tra** trước để xem đúng tên bên nhận                                                                                                         |
| Báo "MetaMask đang chọn ví khác…"                                               | Mở MetaMask, chọn đúng tài khoản đã liên kết với tài khoản đang đăng nhập rồi bấm lại                                                                   |
| Bên nhận là doanh nghiệp bấm Chấp nhận báo "Ví đang chọn không thuộc bên nhận…" | Doanh nghiệp vừa bị khoá, hoặc MetaMask không chọn ví của người đại diện                                                                                |
| Gửi xong cứ chờ "block finalized" lâu                                           | Worker đang bắt kịp chain sau thời gian tắt máy (khoảng 3 phút cho mỗi ngày tắt); log Worker báo còn bao nhiêu block, chờ `/system/status` hết báo chậm |
