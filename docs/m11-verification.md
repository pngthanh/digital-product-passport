# M11 – Xác minh hộ chiếu công khai

M11 hoàn thiện trang hộ chiếu công khai `/p/<mã>` mà mã QR trên tem trỏ tới. Ai cũng mở được, không cần đăng nhập. Trang đã có từ M5 đến M10; M11 bổ sung bốn việc:

- **Máy chủ đối chiếu đủ sáu mục với contract**: hồ sơ, doanh nghiệp phát hành, trạng thái, bên giữ hàng, chủ sở hữu, bảo hành. Mục nào lệch thì trang ghi giá trị trên blockchain và Admin nhận cảnh báo.
- **Người xem tự kiểm tra bằng trình duyệt**: trình duyệt đọc thẳng blockchain qua RPC công khai, băm lại hồ sơ đang hiển thị và kiểm từng giao dịch trên dòng thời gian. Không cần tin máy chủ của hệ thống.
- **Giới hạn lượt tra cứu theo IP** cho mọi đường dẫn công khai, chống dò mã QR và chống dội RPC.
- **Không lộ người dùng cá nhân**: lịch sử event công khai bỏ ví và mã bên (bytes32) của người mua.

M11 không có contract mới và không có migration.

| UC     | Tên                                                          | Actor                           | Chạm blockchain                                                                                                                                       |
| ------ | ------------------------------------------------------------ | ------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| VER-01 | Xác minh hộ chiếu (cảnh báo thu hồi là luồng phụ, có từ M10) | Người tra cứu (không đăng nhập) | Chỉ đọc: `ProductPassport.product`, `WarrantyManager.warrantyOf`, `PartyRegistry.organization` (máy chủ); thêm `effectiveWarrantyState` (trình duyệt) |
| VER-02 | Xem dòng thời gian và txHash                                 | Người tra cứu, chủ sở hữu       | Chỉ đọc: biên nhận (receipt) của từng giao dịch trên dòng thời gian (trình duyệt)                                                                     |

## 1. Quyết định thiết kế

| Mã  | Quyết định                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | Lý do                                                                                                                                                                     |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D80 | **Module mới `verification`**, endpoint `GET /public/products/:code/verification`. Máy chủ đọc hàm view của contract **tại block Indexer đã chốt** (`IndexedChainState`, cùng cách đối soát ví ở M3), rồi so sáu mục với CSDL. Mỗi contract dùng mốc của chính nó. Thứ tự đọc là: mốc Indexer, rồi dữ liệu chiếu (đọc lại sản phẩm sau khi có mốc), rồi danh sách event sau mốc. Mỗi mục có một trong bốn kết quả: **MATCH** (khớp), **MISMATCH** (lệch), **SYNCING** (sản phẩm có giao dịch mới hơn mốc, chưa so được), **UNAVAILABLE** (RPC lỗi, chưa cấu hình, Indexer chưa quét).                                                                                                                                                                                          | Mọi event tới mốc đã được chiếu vào CSDL, nên tại mốc đó hai bên phải giống hệt. So ở block mới nhất sẽ báo lệch giả mỗi khi có giao dịch vừa xảy ra.                     |
| D81 | **Lệch thật thì tin theo blockchain và báo Admin.** Trang ghi "Trên blockchain: …" cạnh từng mục lệch, kèm khung đỏ. API tạo cảnh báo `PUBLIC_VERIFICATION_MISMATCH` mức HIGH, ghi các mục lệch, block, trạng thái và bên giữ hàng ở hai phía. Cảnh báo cũ của cùng sản phẩm còn mở thì không tạo thêm. SYNCING và UNAVAILABLE không tạo cảnh báo.                                                                                                                                                                                                                                                                                                                                                                                                                             | Theo lựa chọn của nhóm ("cảnh báo trang + báo Admin"). M12 hiển thị và xử lý cảnh báo.                                                                                    |
| D82 | **Giữ kết quả 15 giây cho mỗi sản phẩm**, và gộp các yêu cầu đến cùng lúc cho một sản phẩm thành một lần đọc. Mỗi lần đối chiếu tốn 3 lời gọi `eth_call`. Bộ nhớ đệm giữ tối đa 1000 sản phẩm.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | RPC công khai của Monad giới hạn 25 `eth_call` mỗi giây. Nhiều người quét cùng một tem (ví dụ ở quầy trưng bày) không làm dội RPC.                                        |
| D83 | **Tự kiểm tra bằng trình duyệt** (nút **Tự kiểm tra bằng trình duyệt**). Trình duyệt lần lượt thử các RPC công khai của mạng; không được thì dùng MetaMask nếu có. Các bước: (1) hỏi chain ID và dừng ngay nếu sai mạng; (2) băm lại hồ sơ đang hiển thị bằng `productMetadataHash` (cùng hàm của `@dpp/shared`) rồi so với hash trên `ProductPassport.product()`; (3) so nhà phát hành, trạng thái, bên giữ hàng, nhà bán lẻ sắp nhận, có chủ hay chưa; (4) so tình trạng doanh nghiệp trên PartyRegistry; (5) so trạng thái và hạn bảo hành trên WarrantyManager; (6) lấy biên nhận của mọi giao dịch trên dòng thời gian, kiểm giao dịch thành công và có event của một contract hệ thống nhắc đúng `productId`. Trang hiện địa chỉ các contract đã đọc, kèm link explorer. | Theo lựa chọn của nhóm ("server đủ + trình duyệt tự kiểm"). Đây là điểm khác cốt lõi giữa hộ chiếu trên blockchain và một trang web thường: người xem không phải tin API. |
| D84 | **Giới hạn lượt tra cứu**: throttler `public` riêng, mặc định 120 lần mỗi phút cho mỗi IP (`PUBLIC_RATE_LIMIT_PER_MINUTE`). Mọi đường dẫn `/public/*` dùng chung một bộ đếm; mở một hộ chiếu tốn 4 lần, tức khoảng 30 lần mở mỗi phút. Quá giới hạn thì API trả 429 kèm thông báo tiếng Việt, và trang hiện "Bạn tra cứu quá nhanh". Giới hạn đăng nhập (`AUTH_RATE_LIMIT_PER_MINUTE`) vẫn đếm riêng.                                                                                                                                                                                                                                                                                                                                                                          | Mã QR có 12 ký tự ngẫu nhiên, nhưng không giới hạn thì vẫn dò được hàng loạt. Đây cũng là chỗ chặn người dội RPC qua trang công khai.                                     |
| D85 | **Lấy đúng IP người dùng.** Next.js chuyển tiếp `/api/v1` sang API nhưng không tự gửi kèm IP, nên mọi người đều hiện là `127.0.0.1`. M11 thêm `apps/web/src/proxy.ts` cho `/api/v1/public/*` và `/api/v1/auth/*`, để header `X-Forwarded-For` Next.js đã ghi đi theo sang API. Server Component (`serverFetch`) cũng chuyển tiếp header này. API tin `X-Forwarded-For` chỉ khi request đến từ chính máy (`trust proxy: loopback`, có từ M2).                                                                                                                                                                                                                                                                                                                                   | Trước M11, giới hạn đăng nhập gộp mọi người dùng vào một bộ đếm chung. M11 sửa luôn điểm này.                                                                             |
| D86 | **Không lộ người dùng cá nhân trên lịch sử công khai.** API bỏ khỏi `args` mọi mã bên (bytes32) không phải của doanh nghiệp. Ví gửi chỉ được giữ khi người gửi đang là người đại diện của một doanh nghiệp có tên trong cùng giao dịch, tức là ký thay doanh nghiệp; còn lại để trống. Trang thêm mục **Nhật ký giao dịch on-chain** (thu gọn sẵn) dùng dữ liệu đã lọc này. Dòng "Chủ sở hữu" ghi "Đã có chủ (không hiện danh tính)", vì từ M9 doanh nghiệp cũng có thể làm chủ. `pendingRetailer` có thêm `partyId` (của doanh nghiệp) để trình duyệt tự đối chiếu.                                                                                                                                                                                                           | Theo lựa chọn của nhóm ("ẩn của cá nhân, giữ doanh nghiệp"). Dữ liệu gốc vẫn công khai trên blockchain; API chỉ không gom sẵn danh tính cá nhân theo từng sản phẩm.       |

## 2. Luồng

```mermaid
sequenceDiagram
    actor V as Người tra cứu
    participant W as Web (Next.js)
    participant A as API
    participant D as CSDL
    participant C as Contract (RPC)

    V->>W: Quét QR → /p/<mã>
    W->>A: 4 request /public/* (kèm X-Forwarded-For)
    A-->>A: Giới hạn 120 lần/phút mỗi IP
    A->>D: Hộ chiếu, kiểm định, cảnh báo thu hồi
    A->>D: Mốc Indexer → dữ liệu chiếu → event sau mốc
    alt Có event sau mốc
        A-->>W: SYNCING (đang cập nhật)
    else
        A->>C: eth_call tại block mốc: product, warrantyOf, organization
        A-->>A: So 6 mục; lệch thì tạo cảnh báo (không trùng)
        A-->>W: MATCH hoặc MISMATCH kèm giá trị trên blockchain (giữ 15 giây)
    end
    W-->>V: Hộ chiếu + khung Đối chiếu blockchain

    V->>W: Bấm "Tự kiểm tra bằng trình duyệt"
    W->>C: Trình duyệt gọi thẳng RPC công khai (không qua API)
    C-->>W: chain ID, product(), organization(), bảo hành, biên nhận từng giao dịch
    W-->>V: Từng mục khớp hay lệch, n/n giao dịch có thật
```

## 3. Bảng traceability

| UC     | Domain Class                                  | Database                                                                                                                                     | Smart Contract (chỉ đọc)                                                                                        | Event                                  |
| ------ | --------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- | -------------------------------------- |
| VER-01 | Product, Warranty, Organization, AnomalyAlert | products, warranties, organizations, indexer_checkpoints, blockchain_events (event sau mốc), anomaly_alerts (`PUBLIC_VERIFICATION_MISMATCH`) | `ProductPassport.product`, `WarrantyManager.warrantyOf`, `effectiveWarrantyState`, `PartyRegistry.organization` | —                                      |
| VER-02 | Product, BlockchainEvent (đọc)                | blockchain_events (đã lọc thông tin cá nhân), parties, party_wallets, organizations (để biết ai ký thay doanh nghiệp)                        | `eth_getTransactionReceipt` (trình duyệt)                                                                       | Mọi event của sản phẩm trên 6 contract |

Các mục máy chủ đối chiếu (bảng `VERIFICATION_CHECKS` trong `packages/shared/src/api/verification.ts`):

| Mục      | CSDL                                                       | Contract tại block mốc                                    |
| -------- | ---------------------------------------------------------- | --------------------------------------------------------- |
| PROFILE  | `metadata_hash`, nhà phát hành, số tháng bảo hành          | `product().metadataHash`, `issuerId`, `warrantyMonths`    |
| ISSUER   | `organizations.auth_status` của nhà phát hành              | `organization(issuerId).status`                           |
| STATE    | `product_state`                                            | `product().state`                                         |
| CUSTODY  | `current_custodian_party_id`, `pending_custodian_party_id` | `product().custodianId`, `pendingCustodianId`             |
| OWNER    | `current_owner_party_id`                                   | `product().ownerId`                                       |
| WARRANTY | bên kích hoạt, ngày kích hoạt, hạn, đang tạm dừng          | `warrantyOf()`; cờ tạm dừng chỉ so khi chưa hết hạn (D10) |

## 4. Màn hình

- **Hộ chiếu công khai** (`/p/<mã>`):
  - Khung **Đối chiếu blockchain** có ô tóm tắt: **Khớp blockchain** (xanh), **Có mục khác blockchain** (đỏ), **Đang cập nhật**, hoặc **Chưa đối chiếu được**. Dưới ô là sáu mục; mục lệch ghi "Trên blockchain: …". Cuối khung ghi block đã đọc và lúc dữ liệu được chốt.
  - Khung **Tự kiểm tra** có nút **Tự kiểm tra bằng trình duyệt**. Bấm xong, khung hiện tám mục (đúng mạng, hồ sơ, doanh nghiệp, trạng thái, bên giữ hàng, chủ, bảo hành, giao dịch), nguồn đọc (tên RPC hoặc MetaMask), và địa chỉ các contract kèm link explorer.
  - Khung **Mã trên blockchain** giữ giao dịch đăng ký, `productId`, hash hồ sơ và contract.
  - Mục **Nhật ký giao dịch on-chain (n)** thu gọn sẵn. Mở ra thì thấy mọi event của sản phẩm, kèm block và ví gửi của doanh nghiệp.
  - Trên điện thoại, hai khung đối chiếu nằm ngay dưới hộ chiếu. Trên màn hình rộng, chúng nằm ở cột phải.
- **Quá giới hạn**: trang hiện **Bạn tra cứu quá nhanh** và hướng dẫn đợi một phút.

## 5. API

| Phương thức | Đường dẫn                             | Quyền     | Mô tả                                                                                              |
| ----------- | ------------------------------------- | --------- | -------------------------------------------------------------------------------------------------- |
| GET         | `/public/products/:code/verification` | Công khai | Kết quả sáu mục, giá trị trên blockchain (không có danh tính cá nhân), block mốc, địa chỉ contract |
| GET         | `/public/products/:code`              | Công khai | (Đổi ở M11) `history` đã lọc thông tin cá nhân; `pendingRetailer` có thêm `partyId`                |
| *           | `/public/*`                           | Công khai | (Đổi ở M11) Giới hạn chung theo IP; quá giới hạn thì trả 429                                       |

## 6. Cài đặt khi cập nhật từ M10

M11 không có contract mới, không có migration, không cần deploy.

1. Tắt `pnpm dev`. Giải nén đè lên thư mục dự án rồi chạy `pnpm install` (lệnh này build lại `@dpp/shared`).
2. (Tuỳ chọn) Thêm `PUBLIC_RATE_LIMIT_PER_MINUTE=120` vào `.env`. Không thêm thì API dùng mặc định 120.
3. `pnpm dev`.

## 7. Hiệu năng và tải RPC

Số đo trên Hardhat node, máy phát triển, chế độ `pnpm dev`. M13 đo lại trên Monad Testnet.

| Việc                                                   | Số lời gọi RPC                                                      | Thời gian đo được |
| ------------------------------------------------------ | ------------------------------------------------------------------- | ----------------- |
| Mở `/p/<mã>` (4 request API song song)                 | 3 `eth_call` để đối chiếu (giữ 15 giây) + 1 `eth_call` của khung mã | 0,9–1,6 giây      |
| Tự kiểm tra bằng trình duyệt (sản phẩm có 4 giao dịch) | 1 chain ID + 4 `eth_call` + 4 biên nhận                             | 0,25–0,3 giây     |

## 8. Test chứng minh

| Test                                                                 | Chứng minh                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/api/src/modules/verification/application/verification.spec.ts` | 10 ca: (1) đọc tại block mốc, khớp thì không cảnh báo; (2) trạng thái, bên giữ, chủ lệch thì báo đúng mục, giá trị trên chain không lộ người mua, cảnh báo Admin; (3) hồ sơ, doanh nghiệp, bảo hành lệch đều bị phát hiện; (4) có giao dịch sau mốc thì báo đang cập nhật, không kết luận; (5) RPC lỗi thì chưa đọc được, không cảnh báo; (6) giữ kết quả 15 giây, gộp yêu cầu đồng thời; (7) mã lạ thì 404; (8)–(10) quy tắc so bảo hành và trạng thái chung |
| `apps/api/src/modules/products/application/public-history.spec.ts`   | Bán hàng: giữ ví nhà bán lẻ, bỏ mã bên người mua; người mua tự báo mất thì ẩn ví và mã bên; người đại diện ký việc không liên quan doanh nghiệp thì ẩn ví                                                                                                                                                                                                                                                                                                     |
| `apps/api/test/verification/verification.e2e-spec.ts`                | 6 ca trên Hardhat node: sản phẩm đã bán khớp mọi mục; hàng đang giao có nhà bán lẻ sắp nhận; lịch sử công khai không có mã bên người mua; giao dịch web vừa báo (chưa qua Indexer) thì đang cập nhật; sửa tay CSDL thì lệch đúng mục và có đúng một cảnh báo; mã lạ thì 404                                                                                                                                                                                   |
| `apps/api/test/verification/public-rate-limit.e2e-spec.ts`           | Quá 4 lần một phút (gộp 4 đường dẫn công khai) thì 429 kèm thông báo tiếng Việt; IP khác có bộ đếm riêng; đăng nhập không bị giới hạn tra cứu chặn                                                                                                                                                                                                                                                                                                            |
| `apps/web/src/features/verification/verification.spec.ts`            | Tự kiểm: mọi mục khớp; sửa một chữ trong hồ sơ hay trạng thái khác chain thì lệch; giao dịch của contract lạ không được tính; sai mạng thì dừng; doanh nghiệp giữ hàng và hàng đang giao; khung đối chiếu ghi đúng giá trị trên blockchain                                                                                                                                                                                                                    |

## 9. Giới hạn

- Khi web chạy thẳng ra Internet (không qua Nginx hay Caddy), người dùng tự gửi được header `X-Forwarded-For` giả để né giới hạn theo IP. Next.js không có cách lấy IP thật trong trường hợp này. Khi triển khai thật, đặt reverse proxy ghi đè `X-Forwarded-For`. RPC vẫn được bảo vệ nhờ bộ nhớ đệm 15 giây (D82).
- Bộ đếm giới hạn nằm trong bộ nhớ của tiến trình API: khởi động lại thì đếm lại từ đầu, và nhiều tiến trình API thì mỗi tiến trình đếm riêng.
- Trình duyệt tự kiểm dựa trên địa chỉ contract trang đưa ra. Người xem cẩn thận nên mở các địa chỉ đó trên explorer (mã nguồn đã verify) hoặc so với địa chỉ nhóm công bố.
- Trình duyệt đọc trạng thái mới nhất, còn trang hiển thị dữ liệu đã chốt. Ngay sau một giao dịch mới, hai bên có thể lệch vài giây; tải lại trang rồi kiểm lại.
- Một số RPC công khai chặn gọi từ trình duyệt hoặc giới hạn tần suất. Khi đó trình duyệt thử RPC kế tiếp, rồi tới MetaMask.
- Ví gửi chỉ giữ khi người gửi **đang** là người đại diện doanh nghiệp. Ví của người đại diện cũ bị ẩn, tức là nghiêng về phía an toàn.
- Kết quả đối chiếu giữ 15 giây, nên thay đổi trong khoảng đó chưa hiện ngay.
- Nội dung tóm tắt kiểm định do đơn vị kiểm định tự viết; hệ thống không lọc thông tin cá nhân trong đó.
