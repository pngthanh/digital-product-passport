# M8 – Kiểm định sản phẩm

M8 nối nhà sản xuất và chủ sở hữu với đơn vị kiểm định. Người gửi tạo yêu cầu trên web, không cần ví. Đơn vị kiểm định ghi kết quả (Đạt, Đạt có điều kiện, Không đạt) kèm hash biên bản lên blockchain, và kết quả hiện công khai trên hộ chiếu. Như các module trước, ví MetaMask cá nhân của người đại diện đơn vị kiểm định ký và trả gas.

| UC     | Tên                                 | Actor                        | Chạm blockchain                       |
| ------ | ----------------------------------- | ---------------------------- | ------------------------------------- |
| INS-01 | Ghi kết quả kiểm định (thiết kế M0) | Đơn vị kiểm định             | `InspectionRegistry.recordInspection` |
| INS-02 | Gửi yêu cầu kiểm định               | Nhà sản xuất hoặc chủ sở hữu | Không (off-chain)                     |
| INS-03 | Huỷ yêu cầu chưa có kết quả         | Người đã gửi yêu cầu         | Không (off-chain)                     |
| INS-04 | Từ chối yêu cầu kèm lý do           | Đơn vị kiểm định             | Không (off-chain)                     |

INS-01 giữ đúng tên trong tài liệu thiết kế M0. INS-02 đến INS-04 thêm vào theo lựa chọn của nhóm: phải có yêu cầu trước thì mới ghi kết quả.

## 1. Quyết định thiết kế

| Mã  | Quyết định                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | Lý do                                                                                                                          |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| D55 | **Contract mới `InspectionRegistry`**, thay cho `ProductPassport.recordInspection` trong thiết kế M0. Contract chỉ đọc PartyRegistry (quyền đơn vị kiểm định, khoá registrar) và ProductPassport (trạng thái, nhà phát hành, chủ sở hữu), nên không cần cấp role nào và không phải deploy lại ProductPassport.                                                                                                                                                                                            | ProductPassport v2 đã deploy, không thêm hàm được (D38, D45). Dữ liệu sản phẩm giữ nguyên.                                     |
| D56 | **Phải gửi yêu cầu trước (INS-02)**, không cần ví. Người gửi chọn một đơn vị kiểm định đã duyệt và ghi nội dung cần kiểm định. Nhà sản xuất (người đại diện tổ chức phát hành) gửi được ở mọi trạng thái còn hoạt động. Chủ sở hữu chỉ gửi được sau khi mua. Mỗi sản phẩm có tối đa một yêu cầu đang chờ (`ux_inspection_one_pending`). Thêm bảng `inspection_requests` (migration `20261107000000_inspection_requests`).                                                                                 | Theo lựa chọn của nhóm: đơn vị kiểm định không tự ghi kết quả cho sản phẩm không ai yêu cầu.                                   |
| D57 | **Ghi kết quả bằng một giao dịch.** API lưu biên bản rồi ký **giấy phép EIP-712 `InspectionRecord(inspectionId, productId, inspectorId, requesterId, result, reportHash, deadline)`**, giấy phép khoá đúng kết quả và hash biên bản đã lưu. Contract kiểm tra lại: ví là đại diện đơn vị kiểm định đã duyệt, sản phẩm còn hoạt động, người gửi là nhà phát hành hoặc chủ sở hữu hiện tại. `inspectionId` = UUID yêu cầu (16 byte thấp) và chỉ ghi được một lần.                                           | Theo lựa chọn của nhóm (một bước, tiết kiệm gas). Đơn vị kiểm định không đổi được kết quả hay biên bản sau khi máy chủ đã lưu. |
| D58 | **Từ chối (INS-04) và huỷ (INS-03) chỉ diễn ra off-chain.** Đơn vị kiểm định từ chối kèm lý do; người gửi thấy lý do và gửi lại cho đơn vị khác. Người gửi huỷ được khi yêu cầu chưa có kết quả.                                                                                                                                                                                                                                                                                                          | Từ chối không tốn gas. Bảng `inspection_requests` giữ lại lịch sử.                                                             |
| D59 | **Công khai toàn bộ kết quả.** Hộ chiếu `/p/<mã>` hiện kết quả, đơn vị kiểm định, ngày giờ, kết luận, file biên bản (ai cũng mở được) và dòng đối chiếu hash. Hộ chiếu không hiện nội dung yêu cầu và không hiện tên chủ sở hữu, chỉ ghi "theo yêu cầu của nhà sản xuất/chủ sở hữu". Biên bản đang chờ ghi on-chain chỉ đơn vị kiểm định xem được.                                                                                                                                                        | Theo lựa chọn của nhóm; kết quả kiểm định là thông tin cho người mua sau.                                                      |
| D60 | **Kết quả Không đạt chỉ được ghi nhận**, trạng thái sản phẩm không đổi. Thu hồi là nghiệp vụ riêng của M10.                                                                                                                                                                                                                                                                                                                                                                                               | Theo lựa chọn của nhóm; không phải deploy lại ProductPassport.                                                                 |
| D61 | **Biên bản gồm kết luận (bắt buộc) và ảnh hoặc PDF (không bắt buộc).** Hash ghi on-chain là `keccak256(JSON{version, kind:"inspection", inspectionId, result, summary, file{sha256, mimeType}})` (hàm `inspectionReportHash` ở `@dpp/shared`). Kiểm tra file theo byte đầu, giới hạn 5 MB và kho file trên máy chủ dùng chung với M7 (`common/files`, `FileStorage`). File lưu ở `UPLOAD_DIR/inspection-reports/`.                                                                                        | Sửa kết luận hoặc thay file sau khi ghi đều làm lệch hash. Không lặp code của M7.                                              |
| D62 | **Worker chiếu `InspectionRecorded`**: yêu cầu thành COMPLETED; biên bản PENDING có đúng hash thành CONFIRMED (ghi `chain_inspection_id`, `tx_hash`, `inspected_at`). Cảnh báo được tạo trong ba trường hợp: `INSPECTION_UNKNOWN` (mã, sản phẩm hoặc đơn vị kiểm định không khớp), `INSPECTION_REPORT_MISMATCH` (hash on-chain không do hệ thống lưu) và `INSPECTION_CONFLICT` (yêu cầu vừa bị huỷ hoặc từ chối thì giao dịch tới; chain thắng). Hành trình sản phẩm thêm bước **Kiểm định** (tab riêng). | Chain là nguồn sự thật; CSDL không lệch âm thầm.                                                                               |

## 2. Luồng kiểm định

```mermaid
sequenceDiagram
    actor NG as Nhà sản xuất / chủ sở hữu
    actor KD as Đơn vị kiểm định
    participant W as Web
    participant A as API
    participant R as InspectionRegistry
    participant P as ProductPassport
    participant K as Worker

    NG->>W: Trang sản phẩm → chọn đơn vị, ghi nội dung cần kiểm định
    W->>A: POST /me/products/:id/inspection-requests (hoặc /me/owned-products/…)
    A-->>A: inspection_requests REQUESTED (off-chain)
    opt Đổi ý trước khi có kết quả (INS-03)
        NG->>A: POST /me/inspection-requests/:id/cancel → CANCELLED
    end
    alt Từ chối (INS-04)
        KD->>A: POST /me/inspections/:id/decline { reason } → DECLINED
    else Ghi kết quả (INS-01)
        KD->>W: Kết quả, kết luận, ảnh/PDF → "Ghi kết quả kiểm định"
        W->>A: POST /me/inspections/:id/results (multipart)
        A-->>W: Biên bản PENDING + giấy phép EIP-712 InspectionRecord (khoá kết quả, reportHash)
        KD->>R: recordInspection(inspectionId, productId, requesterId, result, reportHash, deadline, chữ ký)
        R->>P: product(productId): trạng thái, nhà phát hành, chủ sở hữu
        R-->>R: InspectionRecorded(…, result, reportHash)
        K->>A: COMPLETED, inspections CONFIRMED
    end
    NG->>W: Thấy kết quả; ai cũng thấy trên /p/<mã>, mở file, "khớp hash on-chain"
```

## 3. Bảng traceability

| UC     | Domain Class                  | Database                                                                       | Smart Contract                                                                                        | Event              |
| ------ | ----------------------------- | ------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------- | ------------------ |
| INS-01 | InspectionRequest, Inspection | inspection_requests (COMPLETED), inspections (CONFIRMED, report_hash, tx_hash) | `recordInspection(inspectionId, productId, requesterId, result, reportHash, deadline, authorization)` | InspectionRecorded |
| INS-02 | InspectionRequest             | inspection_requests (REQUESTED)                                                | —                                                                                                     | —                  |
| INS-03 | InspectionRequest             | inspection_requests (CANCELLED, closed_at)                                     | —                                                                                                     | —                  |
| INS-04 | InspectionRequest             | inspection_requests (DECLINED, decline_reason, closed_at)                      | —                                                                                                     | —                  |

Điều kiện contract kiểm tra (mỗi điều kiện có ca test):

- Ví là đại diện đơn vị kiểm định đã duyệt (`NotAuthorizedInspector`).
- `inspectionId` chưa dùng (`InspectionAlreadyRecorded`).
- Kết quả khác NONE (`InvalidInspectionResult`).
- Sản phẩm đã đăng ký, chưa thu hồi, báo mất hay ngừng sử dụng (`ProductNotInspectable`).
- Người gửi là nhà phát hành, hoặc là chủ sở hữu khi sản phẩm đã bán (`RequesterNotAllowed`).
- Giấy phép do registrar ký, đúng đơn vị, đúng kết quả và hash, còn hạn (`InvalidAuthorization`, `AuthorizationExpired`).
- Các giá trị bytes32 khác 0.

Ràng buộc CSDL:

- `ux_inspection_one_pending`: mỗi sản phẩm tối đa một yêu cầu REQUESTED.
- `ux_inspections_one_confirmed`: mỗi yêu cầu tối đa một biên bản CONFIRMED.
- `ck_inspection_requests_state_consistency`: chỉ REQUESTED chưa đóng; chỉ DECLINED có lý do.
- Nội dung yêu cầu, lý do và kết luận không được để trống.

State machine yêu cầu (bảng `INSPECTION_REQUEST_STATE_TRANSITIONS` trong `packages/shared/src/domain/state-machines.ts`):

```text
REQUESTED ──recordInspection──▶ COMPLETED
    ├──đơn vị từ chối (off-chain)──▶ DECLINED
    └──người gửi huỷ (off-chain)───▶ CANCELLED
```

## 4. Màn hình

- **Sản phẩm → chi tiết** (nhà sản xuất, sản phẩm đã ghi lên blockchain) và **Đã mua → chi tiết** (chủ sở hữu) có khung **Kiểm định**. Khung gồm ô chọn đơn vị kiểm định, ô nội dung cần kiểm định và nút **Gửi yêu cầu kiểm định**. Bên dưới là các yêu cầu đã gửi: trạng thái, nút **Huỷ yêu cầu** khi đang chờ, lý do từ chối, kết quả, kết luận, **Xem ảnh/Mở file PDF** và dòng "Băm lại biên bản khớp hash đã ghi on-chain".
- **Kiểm định** (`/inspection`, chỉ hiện với người đại diện đơn vị kiểm định) có ba tab: Chờ kiểm định, Đã có kết quả, Từ chối/huỷ.
- **Yêu cầu** (`/inspection/<id>`) hiện người gửi (tên nhà sản xuất, hoặc tên và email đã che của chủ sở hữu), nội dung cần kiểm định và trạng thái sản phẩm. Trang có form **Ghi kết quả kiểm định** (Đạt / Đạt có điều kiện / Không đạt, kết luận, ảnh hoặc PDF), khung **Từ chối** kèm lý do và nhật ký on-chain.
- **Hộ chiếu công khai** có khung **Kết quả kiểm định** (mọi lần kiểm định, mới nhất trước) và tab **Kiểm định** trong lịch sử.

## 5. API

| Phương thức | Đường dẫn                                             | Quyền                           | Mô tả                                                                                      |
| ----------- | ----------------------------------------------------- | ------------------------------- | ------------------------------------------------------------------------------------------ |
| GET         | `/me/products/:id/inspection`                         | Đại diện nhà sản xuất phát hành | Đơn vị đã duyệt để chọn, lý do không gửi được (nếu có), yêu cầu của nhà sản xuất           |
| POST        | `/me/products/:id/inspection-requests`                | Đại diện nhà sản xuất đã duyệt  | `{ inspectorOrgId, note }` → yêu cầu REQUESTED                                             |
| GET         | `/me/owned-products/:id/inspection`                   | Chủ sở hữu hiện tại             | Như trên, cho chủ sở hữu                                                                   |
| POST        | `/me/owned-products/:id/inspection-requests`          | Chủ sở hữu hiện tại             | `{ inspectorOrgId, note }` → yêu cầu REQUESTED                                             |
| POST        | `/me/inspection-requests/:id/cancel`                  | Người gửi                       | Huỷ khi còn REQUESTED (204)                                                                |
| GET         | `/me/inspections?filter=REQUESTED\|COMPLETED\|CLOSED` | Đăng nhập                       | Yêu cầu của đơn vị kiểm định, đếm theo tab                                                 |
| GET         | `/me/inspections/:id`                                 | Đơn vị của yêu cầu              | Chi tiết, người gửi, biên bản (cả bản chờ ghi), đối chiếu hash, nhật ký on-chain           |
| POST        | `/me/inspections/:id/results`                         | Đơn vị đã duyệt, có ví          | multipart: `result`, `summary`, file `report` → giấy phép `InspectionRecord` (hạn 15 phút) |
| POST        | `/me/inspections/:id/decline`                         | Đơn vị đã duyệt                 | `{ reason }` → DECLINED (204)                                                              |
| GET         | `/me/inspections/:id/report`                          | Đơn vị của yêu cầu              | File biên bản, kể cả bản chờ ghi (`nosniff`, `no-store`)                                   |
| POST        | `/me/inspections/transactions`                        | Đơn vị đã duyệt, có ví          | Báo txHash của `recordInspection`                                                          |
| GET         | `/public/products/:code/inspections`                  | Không cần đăng nhập             | Kết quả đã ghi on-chain của sản phẩm, đối chiếu hash                                       |
| GET         | `/public/inspections/:id/report`                      | Không cần đăng nhập             | File biên bản đã ghi on-chain                                                              |

## 6. Cài đặt khi cập nhật từ M7

M8 có **một migration mới** (`20261107000000_inspection_requests`: bảng `inspection_requests`, cột `inspections.request_id`, các ràng buộc ở mục 3). Bảng `inspections` chưa có dữ liệu nên migration chạy thẳng, không cần làm mới CSDL. Tài khoản, doanh nghiệp, sản phẩm, bảo hành và phiếu sửa chữa giữ nguyên.

1. Tắt `pnpm dev`. Giải nén đè lên thư mục dự án và xoá hai file M7 đã chuyển sang `common/files` (lệnh ở [m8-kiem-thu-tay.md](m8-kiem-thu-tay.md) mục 1), rồi chạy `pnpm install`.
2. `pnpm db:deploy` và `pnpm --filter @dpp/api db:deploy:test`.
3. `pnpm --filter @dpp/contracts deploy:inspections:monad` (nhập mật khẩu keystore). Script đọc `PARTY_REGISTRY_ADDRESS` và `PRODUCT_PASSPORT_ADDRESS` trong `.env`, kiểm tra ProductPassport trỏ đúng PartyRegistry, deploy vào thư mục Ignition `chain-10143-inspections-v1`, rồi in hai dòng `INSPECTION_REGISTRY_ADDRESS` và `INSPECTION_REGISTRY_DEPLOY_BLOCK` để chép vào `.env`. Không cần quyền Admin, chỉ cần MON trả gas.
4. `pnpm dev`. Worker bắt đầu quét InspectionRegistry từ block deploy.
5. Tạo thêm một doanh nghiệp loại **Đơn vị kiểm định** (tài khoản khác, ví MetaMask khác, Admin duyệt).

Chạy cục bộ: sau `deploy:services:local` chạy `deploy:inspections:local` rồi chép hai dòng in ra.

## 7. Gas

Đo trên Hardhat (Monad định giá opcode khác; số liệu chính thức ở M13). Web đặt gas limit bằng ước lượng cộng 10%.

| Hàm                                             | Gas đã dùng |
| ----------------------------------------------- | ----------- |
| `recordInspection` (lần đầu của sản phẩm)       | 199.068     |
| `recordInspection` (sản phẩm đã từng kiểm định) | 181.990     |

Phần lớn chi phí đến từ việc kiểm tra chữ ký EIP-712, hai lời gọi ngoài (PartyRegistry, ProductPassport) và lưu bản ghi (4 ô bytes32 cộng một ô gói thời gian và kết quả). Lần sau rẻ hơn vì ô `latestInspectionOf` của sản phẩm đã có giá trị.

## 8. Test chứng minh

| Test                                                                          | Chứng minh                                                                                                                                                                                                                                                                                                                                          |
| ----------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/contracts/test/inspection/inspection-registry.test.ts`              | 10 ca: nhà sản xuất yêu cầu ở kho, đang giao, đã bán; chủ sở hữu yêu cầu, Không đạt không đổi trạng thái; người gửi sai; ví không phải đơn vị kiểm định; giấy phép khoá đơn vị, kết quả, hash, hết hạn; mã dùng một lần; sản phẩm chưa đăng ký hoặc đã thu hồi; giá trị 0; digest khớp `@dpp/shared`                                                |
| `packages/shared/src/domain/inspection-report.spec.ts`                        | Hash biên bản ổn định; đổi kết quả, kết luận hay file thì đổi hash; khác hash biên bản sửa chữa                                                                                                                                                                                                                                                     |
| `packages/shared/src/domain/state-machines.spec.ts`                           | Chỉ REQUESTED còn đổi được trạng thái                                                                                                                                                                                                                                                                                                               |
| `apps/api/src/common/files/evidence-file.spec.ts`                             | File đúng chữ ký đầu file mới nhận; khoá file theo thư mục và nội dung                                                                                                                                                                                                                                                                              |
| `apps/api/src/modules/inspection/domain/inspection-request.spec.ts`           | inspectionId đọc ngược ra UUID; người gửi là nhà sản xuất hay chủ sở hữu; còn quyền yêu cầu theo trạng thái                                                                                                                                                                                                                                         |
| `apps/api/src/modules/products/application/product-journey.spec.ts`           | Bước "Kiểm định" ghi đơn vị và kết quả, không hiện người gửi; kết quả lạ thì bỏ qua                                                                                                                                                                                                                                                                 |
| `apps/api/src/modules/chain-sync/infrastructure/abi-contract.catalog.spec.ts` | Indexer giải mã InspectionRecorded, correlation theo inspectionId, ghi productId                                                                                                                                                                                                                                                                    |
| `apps/api/test/inspection/inspection.e2e-spec.ts`                             | 7 ca trọn luồng trên Hardhat node: phân quyền xem; gửi, huỷ, gửi lại; đơn vị khác không thấy; file giả bị chặn; giấy phép không dùng được cho đơn vị khác hay kết quả khác; ghi on-chain thì công khai, tải file, hành trình có bước Kiểm định; từ chối kèm lý do; Không đạt giữ SOLD; sửa biên bản thì lệch hash; ba loại cảnh báo; ràng buộc CSDL |
| `apps/web/src/features/inspection/inspection.schema.spec.ts`                  | Web kiểm tra dữ liệu kết quả công khai và chặn giấy phép có mã kết quả lạ                                                                                                                                                                                                                                                                           |

## 9. Giới hạn

- Kết quả kiểm định không có thời hạn hiệu lực (bảng `inspections` không có cột hết hạn). Hộ chiếu hiện mọi lần kiểm định theo thứ tự thời gian.
- Không đạt không tự thu hồi hay chặn bán sản phẩm (D60); thu hồi làm ở M10.
- Chưa có phí kiểm định trên chain và chưa có thông báo email khi có kết quả.
- File biên bản lưu trên ổ đĩa máy chủ API như M7.
