# Hộ chiếu số sản phẩm (Digital Product Passport)

Hệ thống quản lý vòng đời, bảo hành và chuyển quyền sở hữu sản phẩm, ghi nhận các sự kiện quan trọng lên **Monad Testnet** (chain ID `10143`). Token MON chỉ dùng để kiểm thử, không có giá trị thương mại hay pháp lý.

| Module  | Nội dung                                       | Trạng thái    |
| ------- | ---------------------------------------------- | ------------- |
| M0      | Thiết kế chuẩn hoá và bảng traceability        | Xong          |
| M1      | Foundation & Core Infrastructure               | Xong          |
| M2      | Identity & Auth: tài khoản, ví MetaMask, Party | Xong          |
| M3      | Indexer quét log, đối soát                     | Xong          |
| M4      | Doanh nghiệp và phí MON, khu Quản trị          | Xong          |
| M5      | Sản phẩm, mã QR, tra cứu                       | Xong          |
| M6      | Phân phối và bán hàng, kích hoạt bảo hành      | Xong          |
| M7      | Dịch vụ bảo hành (phiếu sửa chữa)              | Xong          |
| M8      | Kiểm định sản phẩm                             | Xong          |
| M9      | Chuyển nhượng quyền sở hữu                     | Xong          |
| M10     | Thu hồi, báo mất, ngừng sử dụng, thông báo     | Xong          |
| **M11** | **Xác minh hộ chiếu công khai**                | **Xong**      |
| M12–M13 | Audit và dashboard, đo hiệu năng               | Theo lộ trình |

## M1 gồm những gì

- **Monorepo pnpm** với 4 workspace: `apps/api`, `apps/web`, `packages/contracts`, `packages/shared`.
- **API NestJS 12 chạy 2 tiến trình** từ cùng một codebase: `main.ts` (HTTP) và `worker.ts` (Indexer, Scheduler). Đã có cấu hình kiểm tra bằng zod, logger, định dạng lỗi chung, mã yêu cầu, kết nối PostgreSQL qua Prisma 7, kết nối RPC có dự phòng, kiểm tra chain ID khi khởi động, endpoint `/health` và `/health/ready`.
- **CSDL 22 bảng** (M3 bỏ `custodial_keys`, còn 21) theo thiết kế chuẩn hoá: Prisma schema, migration đầu tiên kèm 69 CHECK constraint, 4 partial unique index (`ux_transfer_one_active`, `ux_service_one_open`, ...) và trigger chỉ-INSERT cho `audit_logs`.
- **Hardhat 3 + OpenZeppelin 5** cấu hình sẵn Monad Testnet (deploy, verify qua Sourcify của MonadVision hoặc Monadscan) cùng kiểu dữ liệu, role, lỗi dùng chung cho 4 contract sẽ viết ở các module sau.
- **Next.js 16 (App Router) + Tailwind 4**: bộ giao diện dùng chung, trang tổng quan, trang trạng thái hệ thống đọc dữ liệu thật từ API.
- **102 test tự động** (lúc giao M1), trong đó 28 test e2e chạy trên PostgreSQL thật để chứng minh từng ràng buộc CSDL hoạt động đúng.

## M2 gồm những gì

Mô hình Hybrid: tài khoản là Web2 (email, mật khẩu), ví MetaMask của chính người dùng ký và trả gas mọi giao dịch on-chain. Chi tiết luồng, API và bảng traceability: [docs/m2-identity-auth.md](docs/m2-identity-auth.md).

- **ACC-01 Đăng ký**: tạo `users` + `parties` (USER), mật khẩu băm Argon2id (salt ngẫu nhiên, tham số OWASP). Chưa đụng blockchain.
- **ACC-02 Đăng nhập, đăng xuất**: JWT trong cookie httpOnly. Đăng xuất tăng `users.session_version` nên mọi phiên cũ hết hiệu lực ngay. Có giới hạn số lần thử và chặn CSRF theo Origin.
- **ACC-03 Liên kết MetaMask**: ví ký thông điệp EIP-4361, backend cấp giấy phép EIP-712, rồi chính ví đó gọi `PartyRegistry.registerUser` và tự trả gas.
- **ACC-04 Xoay ví cá nhân**: nhập lại mật khẩu, ví mới ký EIP-4361 và tự gọi `rotateWallet`. Ví cũ thành ROTATED; mỗi địa chỉ ví chỉ dùng một lần.
- **Contract `PartyRegistry`** (phần người dùng) và **Worker chốt giao dịch**: chờ block finalized, ghi `blockchain_events`, chiếu event sang `parties`/`party_wallets`.
- **232 test tự động** (188 unit và contract, 44 e2e) lúc giao M2. Test e2e liên kết ví tự chạy một Hardhat node, deploy PartyRegistry rồi đi trọn luồng UC → API → contract → event → CSDL.

## M3 gồm những gì

Chi tiết quyết định, luồng và cấu hình: [docs/m3-indexer.md](docs/m3-indexer.md).

- **Indexer** trong Worker: quét log PartyRegistry từ block deploy, ghi `blockchain_events` PENDING rồi FINALIZED (hoặc ORPHANED nếu block bị thay), lưu mốc ở `indexer_checkpoints`, chiếu event sang module sở hữu. Event vẫn được chiếu khi web không kịp báo `txHash`.
- **Chiếu đúng một lần**: Indexer và luồng chốt giao dịch của M2 dùng chung một hàm chốt event trong cùng giao dịch CSDL với projector.
- **Đối soát** định kỳ ví trong CSDL với `PartyRegistry.walletOf`; lệch thì tạo `anomaly_alerts` mức HIGH, không tạo trùng.
- `/health/ready` và trang Trạng thái hệ thống có thêm mục **Indexer** (đã chốt tới block nào, chậm bao nhiêu block).
- **CSDL còn 21 bảng** (bỏ `custodial_keys`). Giao diện bỏ trang Bộ giao diện, footer và hai mục giới thiệu; lịch sử hồ sơ mẫu chia tab Phân phối, Bảo hành, Chuyển nhượng.
- **250 test tự động** (200 unit và contract, 50 e2e) lúc giao M3. Test e2e của Indexer chạy trên Hardhat node: giao dịch web không báo vẫn được chiếu, báo sau không chiếu lần hai, sửa tay CSDL thì đối soát phát hiện.

## M4 gồm những gì

Doanh nghiệp không có ví riêng: người đại diện dùng chính ví MetaMask cá nhân đã liên kết để ký, trả phí và nhận tiền hoàn. Chi tiết quyết định D25–D30, luồng và gas: [docs/m4-organizations.md](docs/m4-organizations.md).

- **ORG-01 Nộp đơn doanh nghiệp** ở trang **Doanh nghiệp** (`/organization`): nhập tay tên, mã số thuế, loại (nhà sản xuất, nhà bán lẻ, trung tâm bảo hành, đơn vị kiểm định), liên hệ. Ví cá nhân gọi `applyOrganization` kèm 8 MON; contract **giữ phí** tới khi Admin quyết định. Mỗi tài khoản đại diện đúng một doanh nghiệp.
- **ORG-02, ORG-03 Duyệt hoặc từ chối** ở khu **Quản trị** (`/admin`): duyệt thì phí về ví Treasury; từ chối kèm lý do thì người đại diện tự rút lại 8 MON, sửa hồ sơ và nộp lại.
- **ORG-04 Khoá doanh nghiệp**, **ORG-06 đổi phí và ví Treasury**. ORG-05 (ví vận hành) bỏ theo D25.
- **PartyRegistry** thêm phần doanh nghiệp: giấy phép EIP-712 `OrganizationApplication`, phí giữ trong contract, hoàn tiền kiểu pull (`withdrawRefund`, `nonReentrant`), hàm `authorizedOrganizationOf` để contract sản phẩm ở M5 kiểm tra quyền.
- Indexer chiếu event doanh nghiệp sang `organizations`, `fee_payments`, `fee_policies`. Lệnh `admin:grant` cấp quyền Admin cho một tài khoản.
- **302 test tự động** (243 unit và contract, 59 e2e) lúc giao M4. Test e2e doanh nghiệp chạy trọn luồng trên Hardhat node: nộp đơn, từ chối, rút phí, nộp lại, duyệt (Treasury nhận đúng 8 MON), khoá, đổi phí.

## M5 gồm những gì

Nhà sản xuất đã được duyệt đăng ký sản phẩm bằng ví MetaMask cá nhân của người đại diện; ai cũng quét mã QR để xem hộ chiếu số và tự kiểm chứng với blockchain. Chi tiết quyết định D31–D37, luồng, file CSV và gas: [docs/m5-products.md](docs/m5-products.md).

- **PRD-01 Tạo sản phẩm** ở trang **Sản phẩm** (`/products`, chỉ hiện với người đại diện nhà sản xuất): serial, model, mô tả, ngày sản xuất, số tháng bảo hành. Serial duy nhất trong từng nhà sản xuất.
- **PRD-02 Nhập file CSV**: tối đa 50 sản phẩm, xem trước và báo lỗi theo từng dòng, cả lô ghi trong **một** giao dịch. Đọc được file Excel lưu CSV kiểu Việt Nam (dấu `;`, ngày `DD/MM/YYYY`).
- **PRD-03 Mã QR**: mỗi sản phẩm một mã 12 ký tự, tải QR dạng PNG hoặc SVG, trang in tem A4. QR không lên chain.
- **Tra cứu công khai** (`/lookup`): gõ mã, quét bằng camera hoặc tải ảnh tem; trang hộ chiếu `/p/<mã>` đọc trực tiếp contract để đối chiếu hash hồ sơ, kèm txHash mở được trên MonadVision.
- **Contract `ProductPassport`**: `registerProducts` nhận giấy phép EIP-712 của registrar và chỉ cho ví đại diện nhà sản xuất **đã duyệt** (kiểm tra qua `PartyRegistry.authorizedOrganizationOf`). Ví từ chối ký thì hồ sơ thành bản nháp để gửi lại hoặc xoá.
- **Sửa M4**: bảng mới `organization_applications` giữ **mọi lần nộp đơn** (bản chụp hồ sơ, phí, lý do từ chối, ví ký, từng txHash), không còn mất dấu khi bị từ chối rồi nộp lại; Admin xem đủ hồ sơ (có địa chỉ) và trang chi tiết `/admin/organizations/<id>` với nhật ký on-chain. Migration tự dựng lại lịch sử cho dữ liệu cũ.
- **363 test tự động** (285 unit và contract, 78 e2e) lúc giao M5. Test e2e sản phẩm chạy trọn luồng trên Hardhat node: duyệt nhà sản xuất, tạo một sản phẩm, lô CSV, Indexer chốt khi web không báo txHash, tra cứu công khai.

## M6 gồm những gì

Nhà sản xuất gửi hàng, nhà bán lẻ nhận rồi bán cho tài khoản của người mua; bảo hành bắt đầu ngay trong giao dịch bán. Chi tiết quyết định D38–D46, luồng, gas và cách cập nhật từ M5: [docs/m6-distribution.md](docs/m6-distribution.md).

- **DST-01 Gửi hàng**: trang chi tiết sản phẩm có khung **Phân phối** chọn nhà bán lẻ đã duyệt; gửi nhầm thì **huỷ** được khi bên kia chưa nhận.
- **DST-02 Nhận hàng** ở trang **Kho hàng** (`/inventory`, chỉ hiện với người đại diện nhà bán lẻ): **Đã nhận hàng** hoặc **Từ chối** (hàng về lại nhà sản xuất). Bên giữ hàng chỉ đổi khi nhà bán lẻ xác nhận.
- **DST-03 Bán và kích hoạt bảo hành**: nhập email tài khoản người mua (chưa cần ví), xác nhận tên rồi ví cửa hàng ký. Người mua thành chủ sở hữu; bảo hành theo đúng số tháng nhà sản xuất đã khoá on-chain, hạn tính theo lịch Việt Nam.
- **Đã mua** (`/owned`): người mua xem sản phẩm của mình, bảo hành đến ngày nào, còn bao nhiêu ngày. Hộ chiếu công khai thêm bên đang giữ, bảo hành và hành trình từng bước có txHash, không lộ người mua.
- **ProductPassport phiên bản 2** (deploy mới) và **WarrantyManager**: mỗi lần chuyển trạng thái phát `ProductStateChanged(trước, sau)`; có sẵn điểm nối qua role cho M7 (tạm dừng bảo hành), M9 (chuyển nhượng), M10 (thu hồi, báo mất) nên các module sau không phải deploy lại ProductPassport.
- Lệnh `products:reset` dọn sản phẩm test của bản M5, giữ tài khoản, doanh nghiệp và nhật ký.
- **410 test tự động** (324 unit và contract, 86 e2e) lúc giao M6. Test e2e phân phối chạy trọn luồng trên Hardhat node: gửi, từ chối, gửi lại, huỷ, nhận, bán cho tài khoản chưa có ví, bảo hành, hành trình 9 bước.

## M7 gồm những gì

Chủ sở hữu gửi yêu cầu bảo hành trên web, trung tâm bảo hành tiếp nhận và mở phiếu trên blockchain, sửa xong thì ghi biên bản (kèm ảnh hoặc PDF) và đóng phiếu. Chi tiết quyết định D47–D54, luồng, gas và cách cập nhật từ M6: [docs/m7-service.md](docs/m7-service.md).

- **SVC-01 Gửi yêu cầu** ở trang chi tiết sản phẩm **Đã mua**: chọn trung tâm bảo hành đã duyệt, mô tả lỗi; không cần ví MetaMask. **SVC-02**: chưa tiếp nhận thì huỷ được.
- **Bảo hành** (`/service`, chỉ hiện với người đại diện trung tâm bảo hành): ba tab Chờ tiếp nhận, Đang sửa, Đã đóng.
- **SVC-03 Tiếp nhận và mở phiếu**: ví trung tâm gửi `openTicket` kèm giấy phép EIP-712 của registrar (đúng chủ sở hữu, đúng trung tâm, mỗi phiếu dùng một lần). Còn bảo hành thì bảo hành **tạm dừng** trong lúc sửa (không cộng thêm thời gian); hết hoặc không có bảo hành vẫn sửa được, ghi **ngoài bảo hành**.
- **SVC-04 Ghi biên bản và đóng phiếu**: Đã sửa xong / Không sửa được, việc đã làm, ghi chú, ảnh hoặc PDF (≤ 5 MB, lưu trên máy chủ). Hash biên bản ghi on-chain bằng `closeTicket`; bảo hành tiếp tục. Trang chi tiết băm lại biên bản để báo **khớp hash on-chain** hay đã bị sửa.
- **Contract `ServiceTicketManager`** (deploy thêm, không đụng ProductPassport) có `SERVICE_CONTRACT_ROLE` để gọi WarrantyManager. Hộ chiếu công khai thêm bước "Tiếp nhận sửa chữa", "Sửa xong" kèm txHash, không lộ mô tả lỗi hay biên bản.
- **441 test tự động** (347 unit và contract, 94 e2e) lúc giao M7. Test e2e bảo hành chạy trọn luồng trên Hardhat node: gửi, huỷ, mở phiếu, bảo hành tạm dừng, biên bản kèm ảnh, đóng phiếu, sản phẩm không bảo hành, sửa biên bản thì lệch hash.

## M8 gồm những gì

Nhà sản xuất hoặc chủ sở hữu gửi yêu cầu kiểm định trên web, đơn vị kiểm định ghi kết quả kèm hash biên bản lên blockchain, kết quả hiện công khai trên hộ chiếu. Chi tiết quyết định D55–D62, luồng, gas và cách cập nhật từ M7: [docs/m8-inspection.md](docs/m8-inspection.md).

- **INS-02 Gửi yêu cầu** ở trang chi tiết sản phẩm của nhà sản xuất (mọi giai đoạn trước và sau khi bán) hoặc của chủ sở hữu (**Đã mua**): chọn đơn vị kiểm định đã duyệt, ghi nội dung cần kiểm định; không cần ví. **INS-03**: chưa có kết quả thì người gửi huỷ được. Mỗi sản phẩm một yêu cầu đang chờ.
- **Kiểm định** (`/inspection`, chỉ hiện với người đại diện đơn vị kiểm định): ba tab Chờ kiểm định, Đã có kết quả, Từ chối/huỷ.
- **INS-01 Ghi kết quả**: Đạt / Đạt có điều kiện / Không đạt, kết luận, ảnh hoặc PDF (≤ 5 MB). Ví đơn vị kiểm định gửi `recordInspection` kèm giấy phép EIP-712 khoá đúng kết quả và hash biên bản đã lưu; contract kiểm tra lại người gửi là nhà phát hành hoặc chủ sở hữu hiện tại. Không đạt chỉ được ghi nhận, không đổi trạng thái sản phẩm. **INS-04**: từ chối kèm lý do (không tốn gas).
- **Contract `InspectionRegistry`** (deploy thêm, chỉ đọc PartyRegistry và ProductPassport nên không cần role). Hộ chiếu công khai có khung **Kết quả kiểm định** (kết luận, file biên bản, đối chiếu hash) và tab **Kiểm định** trong lịch sử; không hiện nội dung yêu cầu hay tên chủ sở hữu.
- Một migration mới (`inspection_requests`). Phần kiểm tra file và kho file biên bản chuyển sang `apps/api/src/common/files` để M7 và M8 dùng chung.
- **475 test tự động** (374 unit và contract, 101 e2e). Test e2e kiểm định chạy trọn luồng trên Hardhat node: gửi, huỷ, từ chối, ghi kết quả kèm ảnh, giấy phép không dùng được cho đơn vị hay kết quả khác, công khai và tải file, sửa biên bản thì lệch hash, ba loại cảnh báo.

## M9 gồm những gì

Chủ sở hữu chuyển sản phẩm cho người khác hoặc cho một doanh nghiệp. Quyền sở hữu chỉ đổi khi bên nhận bấm chấp nhận bằng ví của họ. Chi tiết quyết định D63–D70, luồng, gas và cách cập nhật từ M8: [docs/m9-transfer.md](docs/m9-transfer.md).

- **TRF-01 Gửi yêu cầu** ở khung **Chuyển nhượng** trên trang **Đã mua**: nhập email tài khoản cá nhân hoặc mã số thuế doanh nghiệp đã duyệt, bấm **Kiểm tra** để thấy đúng tên, chọn thời gian chờ 1–30 ngày (mặc định 7). API ký giấy phép EIP-712 khoá bên nhận và thời hạn; ví chủ sở hữu gửi `createTransferRequest`. Mỗi sản phẩm một yêu cầu đang chờ.
- **Chuyển nhượng** (`/transfers`, mọi người dùng): tab Gửi tới tôi, Tôi đã gửi, Đã đóng. **TRF-03 Chấp nhận** và **TRF-04 Từ chối** bằng ví bên nhận; **TRF-02 Huỷ** bằng ví bên gửi; **TRF-05** yêu cầu quá hạn không chấp nhận được, ai cũng đóng được.
- Doanh nghiệp làm chủ được: người đại diện chấp nhận, chuyển tiếp, gửi yêu cầu bảo hành hay kiểm định thay doanh nghiệp. Cá nhân chưa liên kết ví vẫn nhận được yêu cầu, liên kết ví rồi mới chấp nhận.
- **Bảo hành đi theo sản phẩm**; sản phẩm đang có phiếu sửa mở thì không chuyển được. Khi đổi chủ, yêu cầu bảo hành chưa tiếp nhận và yêu cầu kiểm định đang chờ của chủ cũ tự huỷ. Hộ chiếu công khai có bước **Chuyển quyền sở hữu**, không hiện tên hay email.
- **Contract `OwnershipTransfer`** (deploy thêm, được cấp `TRANSFER_CONTRACT_ROLE` để gọi `ProductPassport.transferOwnership`). Không có migration mới.
- **502 test tự động** (396 unit và contract, 106 e2e). Test e2e chuyển nhượng chạy trọn luồng trên Hardhat node: tạo và chấp nhận, đổi chủ và bảo hành đi theo, phiếu sửa chặn chuyển, tổ chức từ chối rồi chấp nhận, chủ huỷ, quá hạn.

## M10 gồm những gì

Nhà sản xuất thu hồi sản phẩm, chủ sở hữu báo mất hoặc ngừng sử dụng, và người dùng nhận thông báo ngay trong ứng dụng. Chi tiết quyết định D72–D79, luồng, gas và cách cập nhật từ M9: [docs/m10-lifecycle.md](docs/m10-lifecycle.md). Kiểm thử tay: [docs/m10-kiem-thu-tay.md](docs/m10-kiem-thu-tay.md).

- **RCL-01 Thu hồi theo lô**: ở trang **Sản phẩm**, nhà sản xuất chọn 1–50 sản phẩm (đang ở kho, đang giao, ở cửa hàng hay đã bán), nhập một lý do chung. API lưu lý do và ký giấy phép EIP-712 khoá danh sách và hash lý do; ví người đại diện gửi `recallProducts`. Hàng đang giao tự huỷ bàn giao. Bộ lọc mới **Đã thu hồi**.
- **LIF-01 Báo mất hoặc bị trộm** và **LIF-02 Ngừng sử dụng**: khung mới trên trang **Đã mua**, chủ sở hữu (hoặc người đại diện doanh nghiệp chủ) ký bằng ví của mình. Không làm được khi đang có phiếu sửa mở.
- Cả ba là **trạng thái cuối, không hoàn tác**: sản phẩm không bán, chuyển nhượng, gửi bảo hành hay kiểm định được nữa; yêu cầu bảo hành và kiểm định đang chờ tự huỷ; yêu cầu chuyển nhượng đang mở chỉ còn huỷ được. Hộ chiếu công khai, trang của chủ, nhà bán lẻ và nhà sản xuất hiện khung cảnh báo (thu hồi kèm lý do và tên nhà sản xuất; báo mất không hiện tên chủ).
- **Thông báo trong ứng dụng** (`/notifications`, chuông có số chưa đọc trên thanh đầu trang): sản phẩm bị thu hồi; hàng gửi tới nhà bán lẻ (M6); trung tâm tiếp nhận, đóng phiếu sửa (M7); kết quả hoặc từ chối kiểm định (M8); yêu cầu chuyển nhượng gửi tới, được chấp nhận hay bị từ chối (M9).
- **Contract `ProductLifecycle`** (deploy thêm, được cấp `LIFECYCLE_CONTRACT_ROLE` để gọi `ProductPassport.setLifecycleState`). Một migration nhỏ: `recalls.tx_hash` bỏ UNIQUE vì một giao dịch thu hồi nhiều sản phẩm.
- **538 test tự động** (426 unit và contract, 112 e2e). Test e2e M10 chạy trọn luồng trên Hardhat node: thu hồi một lô ở ba giai đoạn, báo đúng các bên, huỷ yêu cầu đang chờ, chuyển nhượng bị chặn, báo mất, phiếu sửa chặn rồi ngừng sử dụng, đọc thông báo.

## M11 gồm những gì

Trang hộ chiếu công khai `/p/<mã>` tự chứng minh dữ liệu của mình với blockchain. Chi tiết quyết định D80–D86, luồng, tải RPC và giới hạn: [docs/m11-verification.md](docs/m11-verification.md). Kiểm thử tay: [docs/m11-kiem-thu-tay.md](docs/m11-kiem-thu-tay.md).

- **VER-01 Đối chiếu blockchain**: máy chủ đọc contract tại block Indexer đã chốt và so sáu mục: hồ sơ, doanh nghiệp phát hành, trạng thái, bên giữ hàng, chủ sở hữu, bảo hành. Mục lệch thì trang ghi giá trị trên blockchain và Admin nhận cảnh báo `PUBLIC_VERIFICATION_MISMATCH`. Sản phẩm vừa có giao dịch mới thì báo "đang cập nhật" thay vì báo lệch giả.
- **Tự kiểm tra bằng trình duyệt**: trình duyệt của người xem gọi thẳng RPC công khai (hoặc MetaMask), băm lại hồ sơ đang hiển thị, so từng mục và kiểm biên nhận của mọi giao dịch trên dòng thời gian, không đi qua API.
- **VER-02 Dòng thời gian và nhật ký on-chain**: lịch sử công khai bỏ ví và mã bên của người dùng cá nhân; ví chỉ hiện khi người đại diện ký thay doanh nghiệp.
- **Giới hạn lượt tra cứu**: mọi đường dẫn `/public/*` dùng chung giới hạn theo IP (mặc định 120 lần mỗi phút, `PUBLIC_RATE_LIMIT_PER_MINUTE`). Web chuyển tiếp IP thật sang API (`apps/web/src/proxy.ts`), nên giới hạn đăng nhập cũng tính đúng từng IP.
- Không có contract mới, không có migration.
- **565 test tự động** (445 unit và contract, 120 e2e). Test e2e M11 chạy trên Hardhat node: khớp mọi mục, hàng đang giao, lịch sử không có người mua, đang cập nhật khi Indexer chưa quét, sửa tay CSDL thì lệch và có đúng một cảnh báo, quá giới hạn thì 429.

---

## 1. Chuẩn bị

| Công cụ        | Phiên bản                | Ghi chú                                              |
| -------------- | ------------------------ | ---------------------------------------------------- |
| Node.js        | 22 LTS (tối thiểu 22.13) | Hardhat 3 yêu cầu ≥ 22.13                            |
| pnpm           | 10.x                     | Bật bằng `corepack enable`, không cần cài riêng      |
| Docker Desktop | bản mới                  | Chạy PostgreSQL 17                                   |
| Git            | bản mới                  |                                                      |
| MetaMask       | bản mới                  | Cần từ M2; lấy MON test tại https://faucet.monad.xyz |

Kiểm tra nhanh:

```bash
node -v        # v22.x
corepack enable
pnpm -v        # 10.x
docker -v
```

## 2. Cài đặt từ A đến Z

```bash
# 1. Lấy mã nguồn
git clone <url-repo-cua-nhom> dpp
cd dpp

# 2. Cài thư viện. Bước postinstall tự build @dpp/shared và sinh Prisma Client.
pnpm install

# 3. Tạo file cấu hình (Windows PowerShell: Copy-Item .env.example .env)
cp .env.example .env

# 3b. (M2) Sinh bí mật rồi chép 2 dòng in ra vào .env
pnpm --filter @dpp/api secret:new       # JWT_SECRET=...
pnpm --filter @dpp/api registrar:new    # REGISTRAR_SIGNER_PRIVATE_KEY=...

# 4. Bật PostgreSQL 17 trong Docker (tự tạo 2 CSDL: dpp và dpp_test)
pnpm db:up

# 5. Áp migration vào CSDL phát triển và CSDL test
pnpm db:deploy
pnpm --filter @dpp/api db:deploy:test

# 6. Biên dịch và test Smart Contract
pnpm contracts:compile
pnpm contracts:test

# 7. (M2) Deploy PartyRegistry lên Monad Testnet (ví deploy cần MON),
#    chép PARTY_REGISTRY_ADDRESS và PARTY_REGISTRY_DEPLOY_BLOCK in ra vào .env
pnpm --filter @dpp/contracts deploy:monad

# 7b. (M5, M6) Deploy ProductPassport và WarrantyManager (cần PARTY_REGISTRY_ADDRESS trong .env),
#     chép PRODUCT_PASSPORT_ADDRESS, PRODUCT_PASSPORT_DEPLOY_BLOCK, WARRANTY_MANAGER_ADDRESS vào .env
pnpm --filter @dpp/contracts deploy:products:monad

# 7c. (M7) Deploy ServiceTicketManager (cần 3 địa chỉ ở trên trong .env),
#     chép SERVICE_TICKET_MANAGER_ADDRESS, SERVICE_TICKET_MANAGER_DEPLOY_BLOCK vào .env
pnpm --filter @dpp/contracts deploy:services:monad

# 7d. (M8) Deploy InspectionRegistry (cần PARTY_REGISTRY_ADDRESS, PRODUCT_PASSPORT_ADDRESS),
#     chép INSPECTION_REGISTRY_ADDRESS, INSPECTION_REGISTRY_DEPLOY_BLOCK vào .env
pnpm --filter @dpp/contracts deploy:inspections:monad

# 7e. (M9) Deploy OwnershipTransfer (cần PARTY_REGISTRY_ADDRESS, PRODUCT_PASSPORT_ADDRESS,
#     SERVICE_TICKET_MANAGER_ADDRESS; ví deploy là Admin), chép OWNERSHIP_TRANSFER_ADDRESS,
#     OWNERSHIP_TRANSFER_DEPLOY_BLOCK vào .env
pnpm --filter @dpp/contracts deploy:transfers:monad

# 7f. (M10) Deploy ProductLifecycle (cần PARTY_REGISTRY_ADDRESS, PRODUCT_PASSPORT_ADDRESS,
#     SERVICE_TICKET_MANAGER_ADDRESS; ví deploy là Admin), chép PRODUCT_LIFECYCLE_ADDRESS,
#     PRODUCT_LIFECYCLE_DEPLOY_BLOCK vào .env
pnpm --filter @dpp/contracts deploy:lifecycle:monad

# 8. Chạy toàn bộ: API (cổng 4000), Worker và Web (cổng 3000)
pnpm dev

# 9. (M4) Đăng ký tài khoản Admin trên web, rồi cấp quyền (cửa sổ khác)
pnpm --filter @dpp/api admin:grant <email-admin>
```

Máy đã chạy M4 chỉ cần `pnpm install`, `pnpm db:deploy`, `pnpm --filter @dpp/api db:deploy:test` và bước 7b, **không** làm mới CSDL (xem [docs/m5-products.md](docs/m5-products.md) mục 8). Máy đã chạy M6 chỉ cần `pnpm install` và bước 7c (xem [docs/m7-service.md](docs/m7-service.md) mục 6). Máy đã chạy M7 cần `pnpm install`, `pnpm db:deploy`, `pnpm --filter @dpp/api db:deploy:test` và bước 7d (xem [docs/m8-inspection.md](docs/m8-inspection.md) mục 6). Máy đã chạy M8 chỉ cần `pnpm install` và bước 7e (xem [docs/m9-transfer.md](docs/m9-transfer.md) mục 6). Máy đã chạy M9 cần `pnpm install`, `pnpm db:deploy`, `pnpm --filter @dpp/api db:deploy:test` và bước 7f (xem [docs/m10-lifecycle.md](docs/m10-lifecycle.md) mục 6). Máy đã chạy M10 chỉ cần `pnpm install` (xem [docs/m11-verification.md](docs/m11-verification.md) mục 6).

Mở trình duyệt:

- http://localhost:3000 — trang tổng quan.
- http://localhost:3000/register — tạo tài khoản, sau đó vào **Tài khoản** để liên kết MetaMask.
- http://localhost:3000/organization — nộp đơn doanh nghiệp, theo dõi duyệt, rút phí khi bị từ chối (cần ví đã liên kết).
- http://localhost:3000/admin — khu Quản trị: duyệt, từ chối, khoá doanh nghiệp, đổi phí; bấm vào từng doanh nghiệp để xem mọi lần nộp đơn kèm txHash. Chỉ tài khoản Admin mới thấy (người khác nhận 404). Tài khoản Admin phải liên kết **đúng ví đã deploy** PartyRegistry.
- http://localhost:3000/products — (M5) sản phẩm của nhà sản xuất: thêm từng cái hoặc nhập CSV, tải QR, in tem; (M10) chọn nhiều dòng để thu hồi. Chỉ hiện khi tài khoản đại diện nhà sản xuất đã duyệt.
- http://localhost:3000/lookup — (M5) tra cứu công khai bằng mã, camera hoặc ảnh tem; hộ chiếu ở `/p/<mã>`, không cần đăng nhập; (M11) khung đối chiếu blockchain và nút tự kiểm tra bằng trình duyệt.
- http://localhost:3000/inventory — (M6) kho hàng của nhà bán lẻ: nhận hoặc từ chối hàng, bán và kích hoạt bảo hành.
- http://localhost:3000/owned — (M6) sản phẩm người mua (hoặc doanh nghiệp mình đại diện) đang sở hữu và bảo hành; (M7, M8, M9, M10) trang chi tiết có khung gửi yêu cầu bảo hành, yêu cầu kiểm định, chuyển nhượng, báo mất hoặc ngừng sử dụng.
- http://localhost:3000/service — (M7) phiếu sửa chữa của trung tâm bảo hành: tiếp nhận, mở phiếu, ghi biên bản, đóng phiếu.
- http://localhost:3000/inspection — (M8) yêu cầu kiểm định gửi tới đơn vị kiểm định: ghi kết quả hoặc từ chối.
- http://localhost:3000/transfers — (M9) yêu cầu chuyển nhượng gửi tới bạn, bạn đã gửi và đã đóng: chấp nhận, từ chối, huỷ.
- http://localhost:3000/notifications — (M10) thông báo của bạn và doanh nghiệp bạn đại diện; mở bằng biểu tượng chuông trên thanh đầu trang.
- Quét QR bằng điện thoại cùng Wi-Fi: đặt `PUBLIC_WEB_URL` bằng địa chỉ `Network: http://192.168.x.x:3000` mà `pnpm dev` in ra, rồi khởi động lại `pnpm dev`.
- http://localhost:3000/system/status — trạng thái CSDL, blockchain và Indexer (mở từ khu Quản trị).
- http://localhost:4000/api/v1/health/ready — báo cáo JSON (trả 503 khi chưa sẵn sàng).

### Chạy với blockchain cục bộ (không cần Internet)

```bash
# Cửa sổ 1: mạng Hardhat cục bộ, chain ID 31337
pnpm --filter @dpp/contracts node
```

Sửa `.env`: `CHAIN_ID=31337`, `RPC_URL=http://127.0.0.1:8545`, `RPC_FALLBACK_URL=` (để trống). Ở cửa sổ 2 chạy `pnpm --filter @dpp/contracts deploy:local`, chép `PARTY_REGISTRY_ADDRESS` và `PARTY_REGISTRY_DEPLOY_BLOCK` vào `.env`; tiếp theo `pnpm --filter @dpp/contracts deploy:products:local`, chép `PRODUCT_PASSPORT_ADDRESS`, `PRODUCT_PASSPORT_DEPLOY_BLOCK` và `WARRANTY_MANAGER_ADDRESS`; tiếp theo `pnpm --filter @dpp/contracts deploy:services:local`, chép `SERVICE_TICKET_MANAGER_ADDRESS` và `SERVICE_TICKET_MANAGER_DEPLOY_BLOCK`; tiếp theo `pnpm --filter @dpp/contracts deploy:inspections:local`, chép `INSPECTION_REGISTRY_ADDRESS` và `INSPECTION_REGISTRY_DEPLOY_BLOCK`; tiếp theo `pnpm --filter @dpp/contracts deploy:transfers:local`, chép `OWNERSHIP_TRANSFER_ADDRESS` và `OWNERSHIP_TRANSFER_DEPLOY_BLOCK`; tiếp theo `pnpm --filter @dpp/contracts deploy:lifecycle:local`, chép `PRODUCT_LIFECYCLE_ADDRESS` và `PRODUCT_LIFECYCLE_DEPLOY_BLOCK`; rồi `pnpm dev`.

Để thử liên kết ví với mạng cục bộ: trong MetaMask thêm mạng RPC `http://127.0.0.1:8545`, chain ID `31337`, ký hiệu `ETH`; import một tài khoản thử từ danh sách Hardhat node in ra (khoá công khai, **chỉ dùng cục bộ**). Mỗi lần khởi động lại Hardhat node, contract phải deploy lại, CSDL cần làm mới bằng `pnpm --filter @dpp/api db:reset` (mốc quét của Indexer thuộc chain cũ), và MetaMask cần xoá lịch sử giao dịch của tài khoản (Settings → Advanced → Clear activity tab data) để không lệch nonce.

## 3. Cấu trúc thư mục

```text
dpp/
├── apps/
│   ├── api/                         # NestJS – Modular Monolith
│   │   ├── prisma/
│   │   │   ├── schema.prisma        # 23 bảng (M8 thêm inspection_requests), enum, partial unique index
│   │   │   └── migrations/          # SQL migration (kèm CHECK, trigger)
│   │   ├── src/
│   │   │   ├── main.ts              # tiến trình HTTP API
│   │   │   ├── worker.ts            # tiến trình Worker (Indexer, đối soát, Scheduler)
│   │   │   ├── app.module.ts        # module gốc của API
│   │   │   ├── worker.module.ts     # module gốc của Worker
│   │   │   ├── config/              # nạp .env, kiểm tra bằng zod, AppConfigService
│   │   │   ├── common/              # filter lỗi, pipe zod, mã yêu cầu, logger, giới hạn lượt gọi; files/ (kiểm tra file biên bản)
│   │   │   ├── infrastructure/
│   │   │   │   ├── database/        # PrismaService (Prisma 7 + driver adapter pg)
│   │   │   │   ├── blockchain/      # JSON-RPC có dự phòng, kiểm tra chain ID
│   │   │   │   └── storage/         # lưu file biên bản trong UPLOAD_DIR
│   │   │   └── modules/
│   │   │       ├── health/          # module mẫu theo 4 tầng
│   │   │       │   ├── presentation/    # controller, scheduler
│   │   │       │   ├── application/     # use case, port
│   │   │       │   ├── domain/          # quy tắc nghiệp vụ thuần
│   │   │       │   ├── infrastructure/  # hiện thực port (DB, RPC)
│   │   │       │   └── index.ts         # public API duy nhất của module
│   │   │       ├── identity/        # M2: ACC-01..04, liên kết ví, projector PartyRegistry; M3: đối soát ví
│   │   │       ├── chain-sync/      # M2: chốt giao dịch ví gửi; M3: Indexer, indexer_checkpoints
│   │   │       ├── organizations/   # M4: ORG-01..06, phí, khu Quản trị, projector doanh nghiệp; M5: lịch sử nộp đơn
│   │   │       ├── products/        # M5: PRD-01..03, mã QR, hộ chiếu công khai; M6: DST-01..03, kho hàng, đã mua, bảo hành
│   │   │       ├── service/         # M7: SVC-01..04, phiếu sửa chữa, biên bản (file trong UPLOAD_DIR), projector ServiceTicketManager
│   │   │       ├── inspection/      # M8: INS-01..04, yêu cầu và kết quả kiểm định, projector InspectionRegistry
│   │   │       ├── transfer/        # M9: TRF-01..06, chuyển nhượng quyền sở hữu, projector OwnershipTransfer
│   │   │       ├── lifecycle/       # M10: RCL-01, LIF-01..02, thu hồi theo lô, báo mất, ngừng sử dụng, projector ProductLifecycle
│   │   │       ├── notifications/   # M10: thông báo trong ứng dụng (Notifier dùng chung cho các projector), chuông, đánh dấu đã đọc
│   │   │       ├── verification/    # M11: VER-01 đối chiếu hộ chiếu công khai với contract tại mốc Indexer, cảnh báo khi lệch
│   │   │       └── audit/           # ghi audit_logs, anomaly_alerts (màn hình xem ở M12)
│   │   ├── scripts/                 # sinh JWT_SECRET, khoá registrar, cấp quyền Admin
│   │   └── test/                    # e2e: health, ràng buộc CSDL, đăng nhập, liên kết ví, Indexer, doanh nghiệp, sản phẩm, bảo hành, kiểm định, chuyển nhượng, thu hồi, xác minh công khai
│   └── web/                         # Next.js 16 + Tailwind 4
│       └── src/
│           ├── app/                 # route: /, /login, /register, /account, /organization, /admin, /products, /inventory, /owned, /service, /inspection, /transfers, /notifications, /lookup, /p/[code], /system/status
│           ├── components/          # ui/ (button, badge, field, tabs, step-list, ...), layout/
│           ├── features/            # theo tính năng: auth, wallet-link, organization, admin, products, distribution, warranty, service, inspection, transfer, lifecycle, notifications, verification, lookup, passport, ...
│           ├── lib/                 # env, format, nhãn trạng thái; wallet/ (MetaMask, gửi giao dịch)
│           └── proxy.ts             # M11: chuyển IP người dùng sang API cho /api/v1/public, /api/v1/auth
├── packages/
│   ├── contracts/                   # Hardhat 3 + OpenZeppelin 5
│   │   ├── contracts/shared/        # DppTypes.sol, DppRoles.sol, DppErrors.sol, VietnamCalendar.sol
│   │   ├── contracts/registry/      # M2, M4: PartyRegistry.sol
│   │   ├── contracts/product/       # M5, M6: ProductPassport.sol (phiên bản 2)
│   │   ├── contracts/warranty/      # M6: WarrantyManager.sol
│   │   ├── contracts/service/       # M7: ServiceTicketManager.sol
│   │   ├── contracts/inspection/    # M8: InspectionRegistry.sol
│   │   ├── contracts/transfer/      # M9: OwnershipTransfer.sol
│   │   ├── contracts/lifecycle/     # M10: ProductLifecycle.sol
│   │   ├── contracts/test/          # contract chỉ dùng trong test
│   │   ├── ignition/modules/        # module deploy (Hardhat Ignition)
│   │   ├── scripts/                 # deploy-identity.ts, deploy-products.ts, deploy-services.ts, deploy-inspections.ts, deploy-transfers.ts, deploy-lifecycle.ts, grant-admin-role.ts, export-abi.ts
│   │   ├── test/                    # mocha + ethers
│   │   └── hardhat.config.ts        # mạng monadTestnet, verify
│   └── shared/                      # dùng chung cho API, Web, test contract
│       └── src/
│           ├── abi/                 # ABI sinh từ artifact (không sửa tay)
│           ├── chain/               # thông số mạng, EIP-712 của PartyRegistry, ProductPassport, ServiceTicketManager, InspectionRegistry, OwnershipTransfer, ProductLifecycle, hạn bảo hành
│           ├── domain/              # enum, 4 state machine, role, enum on-chain, hash hồ sơ sản phẩm, hash biên bản sửa chữa và kiểm định, hash lý do thu hồi, mã QR
│           ├── api/                 # hợp đồng dữ liệu API ↔ Web
│           └── utils/               # chuẩn hoá địa chỉ, hash, MON
├── docker/postgres/init/            # tạo CSDL dpp_test lần đầu
├── docker-compose.yml
├── .env.example
└── .github/workflows/ci.yml         # lint, typecheck, test, e2e, build
```

### Quy tắc phân tầng (bắt buộc)

1. Phụ thuộc chỉ đi một chiều: `presentation → application → domain`. Tầng `infrastructure` hiện thực các port do `application` khai báo.
2. Module khác chỉ import qua `index.ts` của module. Cấm đọc ghi bảng hoặc repository của module khác.
3. Mỗi module sở hữu bảng của mình và projector cho event thuộc nó (ví dụ `identity` chiếu `PartyRegistered`, `WalletRotated`).
4. `packages/shared` không phụ thuộc NestJS, Next.js hay Prisma.

## 4. Quy chuẩn lập trình

| Hạng mục         | Quy ước                                                                                     |
| ---------------- | ------------------------------------------------------------------------------------------- |
| Tên file TS/TSX  | `kebab-case`, ví dụ `product-passport.service.ts` (oxlint kiểm tra)                         |
| Biến, hàm        | `camelCase`                                                                                 |
| Class, interface | `PascalCase`                                                                                |
| Hằng số          | `UPPER_SNAKE_CASE`, ví dụ `MONAD_TESTNET`, `MANUFACTURER_ROLE`                              |
| Enum             | Object hằng `PascalCase` kèm kiểu cùng tên (`ProductState`), không dùng `enum` của TS       |
| File Solidity    | `PascalCase.sol` theo Solidity Style Guide (trùng tên contract)                             |
| Comment          | JSDoc ngắn trên hàm chính; comment inline chỉ cho logic phức tạp                            |
| Giao diện        | Tối giản, xanh đại dương đậm + xám lạnh, không gradient, dùng token màu trong `globals.css` |

Lưu ý NestJS: `apps/api` tắt rule `consistent-type-imports` vì NestJS cần import giá trị (không phải `import type`) cho class được inject qua constructor.

## 5. Cơ sở dữ liệu

### Ba loại dữ liệu

| Ký hiệu | Ý nghĩa                 | Ai được ghi          | Ví dụ                                            |
| ------- | ----------------------- | -------------------- | ------------------------------------------------ |
| [A]     | Off-chain authoritative | API                  | users, audit_logs, chain_transactions            |
| [P]     | On-chain projection     | Chỉ Worker (Indexer) | transfer_requests, warranties, ownership_records |
| [A+P]   | Có cả hai nhóm cột      | Theo từng cột        | products, organizations, service_requests        |
| [R]     | Raw event cache         | Chỉ Worker (Indexer) | blockchain_events, indexer_checkpoints           |

Mỗi model trong `schema.prisma` ghi rõ loại và các cột [P].

### Ràng buộc chính đã kiểm chứng bằng test e2e

| Ràng buộc                          | Ý nghĩa                                                     |
| ---------------------------------- | ----------------------------------------------------------- |
| `ck_parties_subject`               | Party trỏ tới đúng một User hoặc một Organization           |
| `ck_products_owner_matches_state`  | Chưa bán thì chưa có owner; đã bán thì bắt buộc có owner    |
| `ck_products_pending_custodian`    | Chỉ khi đang vận chuyển mới có bên nhận custody đang chờ    |
| `ux_transfer_one_active`           | Mỗi sản phẩm tối đa 1 yêu cầu chuyển quyền REQUESTED        |
| `ux_service_one_open`              | Mỗi sản phẩm tối đa 1 phiếu dịch vụ đang mở                 |
| `ux_wallet_one_active_owner`       | Mỗi tổ chức chỉ 1 ví OWNER đang hoạt động                   |
| `ux_wallet_one_active_personal`    | Mỗi người dùng chỉ 1 ví cá nhân đang dùng                   |
| `ux_wallet_one_pending_personal`   | (M2) Mỗi người dùng chỉ 1 yêu cầu liên kết ví đang chờ      |
| `organizations_representative_*`   | (M4) Mỗi tài khoản đại diện tối đa 1 doanh nghiệp           |
| `ck_organizations_status_reason_*` | (M4) Lý do từ chối/khoá nếu có thì không rỗng               |
| `ux_org_application_one_pending`   | (M5) Mỗi doanh nghiệp tối đa 1 lần nộp đơn đang chờ duyệt   |
| `ck_org_applications_*`            | (M5) Lần nộp đơn: số thứ tự, hash, địa chỉ, quyết định đúng |
| `products_issuer_org_id_serial_*`  | (M5) Serial duy nhất trong một nhà sản xuất                 |
| `ck_products_serial_pattern`       | (M5) Serial in hoa, chỉ gồm chữ, số và `. _ / -`            |
| `ck_products_public_code_format`   | (M5) Mã QR đúng 12 ký tự, không có I, O, 0, 1               |
| `ck_products_warranty_months_*`    | (M5) Bảo hành 0–120 tháng; ngày sản xuất từ 1990            |
| `ck_users_session_version_*`       | (M2) Phiên bản phiên đăng nhập không âm                     |
| `warranties_product_id_key`        | Mỗi sản phẩm 1 bảo hành hiện hành                           |
| `ux_blockchain_events_identity`    | Event ghi idempotent theo (chain_id, tx_hash, log_index)    |
| `ck_blockchain_events_finality`    | FINALIZED phải có thời điểm, không bao giờ thành ORPHANED   |
| `ck_users_password_hash_argon2id`  | Mật khẩu lưu dạng băm Argon2id                              |
| `trg_audit_logs_append_only`       | `audit_logs` không cho UPDATE/DELETE                        |
| Địa chỉ, hash                      | Lưu chữ thường, đúng 42/66 ký tự hex                        |
| Khoá ngoại                         | `ON DELETE RESTRICT`, không xoá dây chuyền dữ liệu lịch sử  |

### Thêm migration mới

Migration của M2: `20261028000000_identity_auth` (thêm `users.session_version` và `ux_wallet_one_pending_personal`). Migration của M3: `20261028120000_drop_custodial_keys` (bỏ bảng `custodial_keys`). Migration của M4: `20261029000000_organization_representative` (thêm `organizations.representative_user_id` và `status_reason`). Migration của M5: `20261030000000_organization_applications` (bảng lịch sử nộp đơn, tự dựng lại từ `blockchain_events`) và `20261030010000_product_registration` (serial theo nhà sản xuất, ngày sản xuất, bảo hành). M6, M7 không có migration mới. Migration của M8: `20261107000000_inspection_requests` (bảng yêu cầu kiểm định, `inspections.request_id`). M9 không có migration mới (bảng `transfer_requests` có từ đầu). Migration của M10: `20261110000000_recall_batches` (bỏ UNIQUE `recalls.tx_hash` để một giao dịch thu hồi nhiều sản phẩm). Máy đã chạy module trước chỉ cần `pnpm db:deploy` và `pnpm --filter @dpp/api db:deploy:test`; riêng M4 phải deploy lại PartyRegistry nên làm mới CSDL bằng `db:reset` (xem [docs/m4-organizations.md](docs/m4-organizations.md) mục 5); M6 deploy ProductPassport mới nên chỉ dọn sản phẩm bằng `products:reset` (xem [docs/m6-distribution.md](docs/m6-distribution.md) mục 6).

```bash
# 1. Sửa apps/api/prisma/schema.prisma
# 2. Sinh migration nhưng chưa áp dụng
pnpm --filter @dpp/api exec prisma migrate dev --create-only --name ten_thay_doi
# 3. Thêm CHECK/trigger (nếu có) vào cuối file migration.sql vừa sinh
# 4. Áp dụng
pnpm db:migrate
```

- CHECK constraint và trigger viết tay trong migration vì Prisma schema không mô tả được. Prisma Migrate không xoá chúng ở các lần sau.
- Partial unique index khai báo ngay trong schema (preview feature `partialIndexes`). Với điều kiện viết bằng `raw(...)`, hãy viết đúng dạng PostgreSQL chuẩn hoá (ví dụ `service_state = ANY (ARRAY[...])`), nếu không Prisma sẽ tưởng có thay đổi và sinh migration thừa.

## 6. Smart Contract trên Monad Testnet

- Mạng `monadTestnet` trong `hardhat.config.ts`: chain ID 10143, RPC mặc định `https://testnet-rpc.monad.xyz` (đổi bằng `MONAD_TESTNET_RPC_URL`).
- Khoá ví deploy nên lưu bằng keystore của Hardhat thay vì để trong `.env`:

  ```bash
  pnpm --filter @dpp/contracts exec hardhat keystore set DEPLOYER_PRIVATE_KEY
  ```

- Deploy PartyRegistry: `pnpm --filter @dpp/contracts deploy:monad` (hoặc `deploy:local` cho Hardhat node). Script cấp `REGISTRAR_ROLE` cho địa chỉ của `REGISTRAR_SIGNER_PRIVATE_KEY` và in các dòng cần chép vào `.env`. Khoá registrar chỉ ký giấy phép, không cần MON.
- Deploy ProductPassport và WarrantyManager (M6): `pnpm --filter @dpp/contracts deploy:products:monad` (hoặc `deploy:products:local`). Hai contract đọc quyền tổ chức từ PartyRegistry nên phải deploy sau PartyRegistry; script kiểm tra `PARTY_REGISTRY_ADDRESS` có contract, ví deploy còn quyền Admin (để cấp `PRODUCT_CONTRACT_ROLE` cho ProductPassport) rồi in ba dòng cần chép vào `.env`.
- Deploy ServiceTicketManager (M7): `pnpm --filter @dpp/contracts deploy:services:monad` (hoặc `deploy:services:local`). Script đọc `PARTY_REGISTRY_ADDRESS`, `PRODUCT_PASSPORT_ADDRESS`, `WARRANTY_MANAGER_ADDRESS`, kiểm tra ví deploy còn quyền Admin (để cấp `SERVICE_CONTRACT_ROLE`) rồi in hai dòng cần chép vào `.env`.
- Deploy InspectionRegistry (M8): `pnpm --filter @dpp/contracts deploy:inspections:monad` (hoặc `deploy:inspections:local`). Script đọc `PARTY_REGISTRY_ADDRESS`, `PRODUCT_PASSPORT_ADDRESS`, kiểm tra ProductPassport trỏ đúng PartyRegistry rồi in hai dòng cần chép vào `.env`. Không cần quyền Admin.
- Deploy OwnershipTransfer (M9): `pnpm --filter @dpp/contracts deploy:transfers:monad` (hoặc `deploy:transfers:local`). Script đọc `PARTY_REGISTRY_ADDRESS`, `PRODUCT_PASSPORT_ADDRESS`, `SERVICE_TICKET_MANAGER_ADDRESS`, kiểm tra ví deploy còn quyền Admin (để cấp `TRANSFER_CONTRACT_ROLE`) rồi in hai dòng cần chép vào `.env`.
- Deploy ProductLifecycle (M10): `pnpm --filter @dpp/contracts deploy:lifecycle:monad` (hoặc `deploy:lifecycle:local`). Script đọc `PARTY_REGISTRY_ADDRESS`, `PRODUCT_PASSPORT_ADDRESS`, `SERVICE_TICKET_MANAGER_ADDRESS`, kiểm tra ví deploy còn quyền Admin (để cấp `LIFECYCLE_CONTRACT_ROLE`) rồi in hai dòng cần chép vào `.env`.
- Sau khi sửa contract: `pnpm --filter @dpp/contracts abi:export` để cập nhật ABI trong `@dpp/shared` (test báo đỏ nếu quên).
- Xác minh mã nguồn: `pnpm --filter @dpp/contracts exec hardhat verify <địa_chỉ> --network monadTestnet`. Sourcify của MonadVision không cần API key; Monadscan cần `ETHERSCAN_API_KEY`.
- Nếu mạng chặn tải trình biên dịch Solidity, đặt `SOLC_PATH` tới `soljson.js` (gói npm `solc`) hoặc file solc native.

Ba điểm khác Ethereum cần nhớ khi code các module sau:

1. Phí gas tính theo **gas limit**, không phải gas đã dùng, nên Backend phải đặt gas limit sát ước lượng.
2. Block finalized sau 2 block và không thể reorg; Indexer chỉ chiếu event sang bảng [P] khi block đã finalized. RPC công khai giới hạn `eth_getLogs` 100 block mỗi lần.
3. Ví có số dư dưới 10 MON (reserve balance) có thể bị revert giao dịch chuyển MON; nạp cho ví cá nhân của người đại diện từ 20 MON trở lên trước khi demo nộp phí 8 MON.

## 7. Lệnh thường dùng

| Lệnh                                                 | Việc làm                                                                           |
| ---------------------------------------------------- | ---------------------------------------------------------------------------------- |
| `pnpm dev`                                           | Chạy API, Worker, Web cùng lúc ở chế độ theo dõi thay đổi                          |
| `pnpm build`                                         | Build toàn bộ theo đúng thứ tự phụ thuộc                                           |
| `pnpm lint` / `pnpm typecheck`                       | Kiểm tra lint (oxlint, ESLint) và kiểu                                             |
| `pnpm test`                                          | Unit test (shared, api, web) và test contract                                      |
| `pnpm test:e2e`                                      | Test e2e trên CSDL `dpp_test`                                                      |
| `pnpm format` / `pnpm format:check`                  | Định dạng mã bằng Prettier                                                         |
| `pnpm db:up` / `pnpm db:down`                        | Bật / tắt PostgreSQL trong Docker                                                  |
| `pnpm db:migrate` / `pnpm db:deploy`                 | Tạo migration khi phát triển / áp migration có sẵn                                 |
| `pnpm db:studio`                                     | Mở Prisma Studio xem dữ liệu                                                       |
| `pnpm contracts:compile` / `contracts:test`          | Biên dịch / test Smart Contract                                                    |
| `pnpm --filter @dpp/contracts deploy:local`          | Deploy PartyRegistry lên Hardhat node (`deploy:monad` cho testnet)                 |
| `pnpm --filter @dpp/contracts deploy:products:monad` | Deploy ProductPassport, WarrantyManager (`deploy:products:local` cho Hardhat node) |
| `pnpm --filter @dpp/api products:reset [--yes]`      | (M6) Xem rồi xoá sản phẩm và dữ liệu đi kèm, giữ tài khoản và doanh nghiệp         |
| `pnpm --filter @dpp/contracts admin-role:monad`      | Ví deploy cấp quyền Admin PartyRegistry cho ví trong `NEW_ADMIN_WALLET`            |
| `pnpm --filter @dpp/contracts abi:export`            | Sinh lại ABI vào `packages/shared/src/abi`                                         |
| `pnpm --filter @dpp/api secret:new`                  | Sinh `JWT_SECRET`                                                                  |
| `pnpm --filter @dpp/api registrar:new`               | Sinh khoá ký giấy phép `REGISTRAR_SIGNER_PRIVATE_KEY`                              |
| `pnpm --filter @dpp/api admin:grant <email>`         | Cấp quyền Admin cho tài khoản (`admin:revoke` để thu hồi)                          |

## 8. Test chứng minh traceability

| Test                                                                    | Chứng minh                                                                                  |
| ----------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| `apps/api/src/infrastructure/database/prisma-enums.spec.ts`             | Enum PostgreSQL trùng tên và thứ tự với `@dpp/shared`                                       |
| `packages/contracts/test/shared/dpp-types.test.ts`                      | Enum và role trong Solidity trùng với `@dpp/shared`                                         |
| `apps/api/test/database/schema-constraints.e2e-spec.ts`                 | Từng ràng buộc CSDL chặn đúng dữ liệu sai                                                   |
| `packages/contracts/test/registry/party-registry.test.ts`               | ACC-03/04 on-chain: mỗi điều kiện revert có một ca                                          |
| `packages/contracts/test/shared/abi-export.test.ts`                     | ABI dùng ở API/Web trùng contract đã biên dịch                                              |
| `apps/api/test/identity/auth.e2e-spec.ts`                               | ACC-01/02: Argon2id, cookie, session_version, CSRF                                          |
| `apps/api/test/identity/wallet-link.e2e-spec.ts`                        | ACC-03/04 thật trên Hardhat node: UC → DB → contract → event                                |
| `apps/api/test/chain-sync/indexer.e2e-spec.ts`                          | (M3) Indexer chiếu event một lần, đối soát tạo cảnh báo                                     |
| `packages/contracts/test/registry/party-registry-organizations.test.ts` | (M4) Giữ phí, duyệt chuyển Treasury, từ chối và rút phí, nộp lại, đổi ví, khoá              |
| `apps/api/test/organizations/organizations.e2e-spec.ts`                 | (M4) ORG-01..06 thật trên Hardhat node: nộp đơn → từ chối → rút phí → nộp lại → duyệt       |
| `packages/contracts/test/product/product-passport.test.ts`              | (M5) Chỉ nhà sản xuất đã duyệt, lô 1–50, giấy phép sai/hết hạn, trùng productId, đổi ví     |
| `apps/api/test/products/products.e2e-spec.ts`                           | (M5) PRD-01, PRD-02 thật trên Hardhat node, tra cứu công khai đọc lại contract              |
| `apps/api/test/database/application-backfill.e2e-spec.ts`               | (M5) Migration dựng lại đúng lịch sử nộp đơn từ event cũ                                    |
| `packages/contracts/test/product/product-distribution.test.ts`          | (M6) Gửi, huỷ, từ chối, nhận, bán; mọi điều kiện revert; điểm nối M9, M10                   |
| `packages/contracts/test/warranty/warranty-manager.test.ts`             | (M6) Kích hoạt bảo hành, hết hạn theo thời gian, lịch Việt Nam khớp phía ứng dụng           |
| `apps/api/test/products/distribution.e2e-spec.ts`                       | (M6) DST-01..03 thật trên Hardhat node, hành trình và hộ chiếu không lộ người mua           |
| `packages/contracts/test/service/service-ticket-manager.test.ts`        | (M7) Mở phiếu trong/ngoài bảo hành, giấy phép dùng một lần, đóng phiếu, mọi revert          |
| `apps/api/test/service/service.e2e-spec.ts`                             | (M7) SVC-01..04 thật trên Hardhat node, biên bản kèm ảnh khớp hash, sửa biên bản thì lệch   |
| `packages/contracts/test/inspection/inspection-registry.test.ts`        | (M8) Ghi kết quả, quyền người gửi, giấy phép khoá kết quả và hash, mọi revert               |
| `apps/api/test/inspection/inspection.e2e-spec.ts`                       | (M8) INS-01..04 thật trên Hardhat node, công khai trên hộ chiếu, cảnh báo, ràng buộc CSDL   |
| `packages/contracts/test/transfer/ownership-transfer.test.ts`           | (M9) Tạo, chấp nhận, từ chối, huỷ, quá hạn; tổ chức làm chủ; phiếu sửa chặn; mọi revert     |
| `apps/api/test/transfer/transfer.e2e-spec.ts`                           | (M9) TRF-01..06 thật trên Hardhat node, đổi chủ, bảo hành đi theo, dọn yêu cầu chủ cũ       |
| `packages/contracts/test/lifecycle/product-lifecycle.test.ts`           | (M10) Thu hồi theo lô ở mọi giai đoạn, báo mất, ngừng sử dụng, trạng thái cuối, mọi revert  |
| `apps/api/test/lifecycle/lifecycle.e2e-spec.ts`                         | (M10) RCL-01, LIF-01..02 thật trên Hardhat node, báo đúng các bên, thông báo M6–M9          |
| `apps/api/test/verification/verification.e2e-spec.ts`                   | (M11) VER-01, VER-02 trên Hardhat node: khớp, đang cập nhật, lệch và cảnh báo, ẩn người mua |
| `apps/api/test/verification/public-rate-limit.e2e-spec.ts`              | (M11) Giới hạn chung cho /public/* theo IP, 429 tiếng Việt, đăng nhập đếm riêng             |
| `apps/web/src/features/verification/verification.spec.ts`               | (M11) Trình duyệt tự kiểm: băm lại hồ sơ, so từng mục, giao dịch của contract lạ bị loại    |

Chuỗi `Database ↔ shared ↔ Solidity ↔ Web` được kiểm tra tự động mỗi lần chạy CI, nên một bên đổi mà quên bên kia thì test sẽ đỏ.

## 9. Xử lý sự cố

| Hiện tượng                                                       | Cách xử lý                                                                                                                                                                                                                                                                                                                               |
| ---------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Cổng 5433 đã bị chiếm                                            | Đổi `POSTGRES_PORT` và cổng trong `DATABASE_URL`, `TEST_DATABASE_URL`                                                                                                                                                                                                                                                                    |
| `P1000` khi `pnpm db:deploy`                                     | Xem tên user trong lỗi: khác `POSTGRES_USER` nghĩa là Prisma không đọc chuỗi kết nối từ `.env` (biến môi trường Windows `DATABASE_URL` được ưu tiên hơn `.env`) hoặc `.env` ghi sai; user đúng mà vẫn lỗi thì cổng trong `DATABASE_URL` đang trỏ vào PostgreSQL cài sẵn trên máy (`Get-Service *postgres*`), không phải container Docker |
| Đổi `POSTGRES_*` sau khi đã `db:up`                              | Container chỉ tạo user lúc khởi tạo volume; chạy `docker compose down -v` rồi `pnpm db:up`                                                                                                                                                                                                                                               |
| Thiếu CSDL `dpp_test`                                            | Script tạo CSDL chỉ chạy lần đầu; chạy `docker compose down -v` rồi `pnpm db:up`                                                                                                                                                                                                                                                         |
| API dừng với `ChainMismatchError`                                | `RPC_URL` trỏ sai mạng so với `CHAIN_ID`; sửa cho khớp                                                                                                                                                                                                                                                                                   |
| API báo `Cấu hình môi trường không hợp lệ`                       | Thông báo liệt kê đúng biến sai; đối chiếu với `.env.example`                                                                                                                                                                                                                                                                            |
| Trang trạng thái báo không kết nối được API                      | Chạy `pnpm dev`, kiểm tra `API_INTERNAL_URL`                                                                                                                                                                                                                                                                                             |
| `prisma generate` lỗi tải engine                                 | Máy cần truy cập `binaries.prisma.sh` ở lần cài đầu; thử lại khi có mạng                                                                                                                                                                                                                                                                 |
| API báo thiếu `JWT_SECRET`                                       | Chạy `pnpm --filter @dpp/api secret:new`, chép dòng in ra vào `.env`                                                                                                                                                                                                                                                                     |
| Trang Tài khoản báo chưa cấu hình PartyRegistry                  | Thiếu `REGISTRAR_SIGNER_PRIVATE_KEY` hoặc `PARTY_REGISTRY_ADDRESS`; xem bước 3b và 7 ở mục 2                                                                                                                                                                                                                                             |
| MetaMask báo lỗi nonce sau khi khởi động lại Hardhat node        | MetaMask → Settings → Advanced → Clear activity tab data, rồi deploy lại contract                                                                                                                                                                                                                                                        |
| Header hiện sai tên mạng                                         | Web đọc `CHAIN_ID` trong `.env`; sửa rồi khởi động lại `pnpm dev`                                                                                                                                                                                                                                                                        |
| Trạng thái hệ thống báo Indexer chưa quét hoặc chậm              | Worker chưa chạy (`pnpm dev` chạy cả Worker) hoặc đang bắt kịp từ block deploy; xem log Worker. Chậm lâu thì kiểm tra `PARTY_REGISTRY_DEPLOY_BLOCK` và RPC                                                                                                                                                                               |
| Worker báo block finalized thấp hơn mốc đã quét                  | Thường do vừa khởi động lại Hardhat node: chạy `pnpm --filter @dpp/api db:reset` rồi deploy lại contract                                                                                                                                                                                                                                 |
| Khu Quản trị báo ví đang liên kết không có quyền Admin           | Ví MetaMask của tài khoản Admin khác ví deploy. Cấp quyền bằng ví deploy: `$env:NEW_ADMIN_WALLET="0x..."` rồi `pnpm --filter @dpp/contracts admin-role:monad`, sau đó tải lại trang                                                                                                                                                      |
| Mở `/admin` ra trang 404                                         | Tài khoản chưa có quyền Admin: chạy `pnpm --filter @dpp/api admin:grant <email>` rồi tải lại trang                                                                                                                                                                                                                                       |
| Nộp đơn báo "Phí đăng ký vừa được thay đổi"                      | Admin vừa đổi phí sau khi bạn mở trang; tải lại trang Doanh nghiệp rồi nộp lại                                                                                                                                                                                                                                                           |
| Deploy báo `HHE10120 ... reconciliation errors`                  | Ignition đã có bản deploy cũ với tham số khác. Tăng `PARTY_REGISTRY_VERSION` trong `packages/contracts/scripts/deploy-identity.ts` khi contract đổi mà cần deploy mới                                                                                                                                                                    |
| Trang Sản phẩm báo chưa cấu hình ProductPassport                 | Thiếu `PRODUCT_PASSPORT_ADDRESS`: chạy `pnpm --filter @dpp/contracts deploy:products:monad`, chép hai dòng in ra vào `.env`, khởi động lại `pnpm dev`                                                                                                                                                                                    |
| Trang Kiểm định báo chưa cấu hình InspectionRegistry             | Thiếu `INSPECTION_REGISTRY_ADDRESS`: chạy `pnpm --filter @dpp/contracts deploy:inspections:monad`, chép hai dòng in ra vào `.env`, khởi động lại `pnpm dev`                                                                                                                                                                              |
| Khung Chuyển nhượng báo chưa cấu hình OwnershipTransfer          | Thiếu `OWNERSHIP_TRANSFER_ADDRESS`: chạy `pnpm --filter @dpp/contracts deploy:transfers:monad` bằng ví Admin, chép hai dòng in ra vào `.env`, khởi động lại `pnpm dev`                                                                                                                                                                   |
| Thu hồi hoặc báo mất báo chưa cấu hình ProductLifecycle          | Thiếu `PRODUCT_LIFECYCLE_ADDRESS`: chạy `pnpm --filter @dpp/contracts deploy:lifecycle:monad` bằng ví Admin, chép hai dòng in ra vào `.env`, khởi động lại `pnpm dev`                                                                                                                                                                    |
| Hộ chiếu công khai báo "Bạn tra cứu quá nhanh"                   | Một IP mở quá `PUBLIC_RATE_LIMIT_PER_MINUTE` lượt mỗi phút (mỗi lần mở hộ chiếu tốn 4 lượt). Đợi một phút, hoặc tăng giá trị trong `.env` rồi khởi động lại `pnpm dev`                                                                                                                                                                   |
| Nút "Tự kiểm tra bằng trình duyệt" báo không đọc được blockchain | Mạng hoặc tiện ích chặn quảng cáo chặn RPC Monad. Tắt tiện ích chặn, hoặc mở MetaMask ở Monad Testnet rồi bấm lại                                                                                                                                                                                                                        |
| Không thấy mục Sản phẩm / Kho hàng trên menu                     | Sản phẩm chỉ hiện với người đại diện Nhà sản xuất, Kho hàng chỉ hiện với người đại diện Nhà bán lẻ. Đơn chưa duyệt thì mục vẫn hiện nhưng chưa thao tác được                                                                                                                                                                             |
| Deploy sản phẩm báo ví deploy không có quyền Admin               | Ví trong keystore không phải ví đã deploy PartyRegistry, hoặc đã bị thu quyền. Dùng đúng ví đã deploy PartyRegistry                                                                                                                                                                                                                      |
| Khung Phân phối báo chưa có nhà bán lẻ                           | Chưa có doanh nghiệp loại Nhà bán lẻ nào được Admin duyệt                                                                                                                                                                                                                                                                                |
| Bán hàng báo không có tài khoản với email này                    | Người mua tạo tài khoản ở trang Đăng ký trước (không cần liên kết ví), rồi nhập đúng email đó                                                                                                                                                                                                                                            |
| Sản phẩm cũ (M5) vẫn hiện sau khi deploy ProductPassport mới     | Chạy `pnpm --filter @dpp/api products:reset --yes` rồi nhập lại sản phẩm                                                                                                                                                                                                                                                                 |
| MetaMask báo `NotAuthorizedManufacturer`                         | Ví đang chọn trong MetaMask không phải ví đã liên kết của người đại diện, hoặc doanh nghiệp đã bị khoá                                                                                                                                                                                                                                   |
| Điện thoại quét QR không mở được trang                           | QR đang chứa `localhost`. Đặt `PUBLIC_WEB_URL=http://<địa chỉ Network>:3000`, khởi động lại `pnpm dev`, cho phép Node.js qua tường lửa Windows (mạng Private), điện thoại cùng Wi-Fi                                                                                                                                                     |
| Nút "Quét bằng camera" báo cần HTTPS                             | Trình duyệt chỉ mở camera trên HTTPS hoặc `localhost`; trên điện thoại dùng ứng dụng camera có sẵn quét tem, hoặc tải ảnh tem lên                                                                                                                                                                                                        |
| Nhập CSV báo thiếu cột                                           | Dùng nút "Tải file mẫu"; dòng đầu là tiêu đề, Excel lưu dạng "CSV UTF-8" để giữ dấu tiếng Việt                                                                                                                                                                                                                                           |
| Test e2e báo "Chưa biên dịch contract"                           | Chạy `pnpm contracts:compile` (hoặc `pnpm test`) trước `pnpm test:e2e`                                                                                                                                                                                                                                                                   |
| Windows: lệnh `cp` không có                                      | Dùng `Copy-Item .env.example .env` (PowerShell) hoặc `copy .env.example .env` (cmd)                                                                                                                                                                                                                                                      |

## 10. Quy trình phát triển và công cụ

- Nhóm phát triển theo từng module (M1 → M13). Mỗi module có tài liệu trong `docs/` ghi lại các quyết định thiết kế (D14–D86), luồng nghiệp vụ, bảng truy vết và cách kiểm thử.
- Nhóm sử dụng trợ lý AI (Claude) để **hỗ trợ** viết mã, test và tài liệu. Nhóm chịu trách nhiệm phân tích nghiệp vụ, chọn phương án thiết kế, đọc hiểu và chỉnh sửa mã, chạy kiểm thử, deploy và vận hành hệ thống trên Monad Testnet.
- M1–M6 được commit theo từng module. Từ M7, commit nhỏ theo từng lớp (contract → shared → API → web → docs); trước khi push lên `main` chạy đủ format, lint, typecheck, test, e2e, build trên máy, và CI trên GitHub chạy lại các bước này sau mỗi lần push.

## 11. Đưa lên GitHub

Tạo repo trống trên GitHub (không tick thêm README, .gitignore hay license), rồi chạy ở thư mục gốc:

```bash
git init -b main
git check-ignore -v .env   # phải in ra dòng .gitignore chứa .env
git add .
git commit -m "feat(m1): foundation monorepo, 22-table schema, health API, Hardhat Monad config"
git remote add origin <url-repo-cua-nhom>
git push -u origin main
```

`.gitignore` đã loại `node_modules`, kết quả build, Prisma Client sinh ra và file `.env`. `.gitattributes` giữ xuống dòng kiểu LF trên mọi máy để `pnpm format:check` không báo lỗi trên Windows. CI trên GitHub Actions chạy đủ lint, typecheck, test, test e2e trên PostgreSQL và build ở mỗi lần push.
