# M12 – Nhật ký kiểm toán, dashboard và cảnh báo bất thường

M12 dựng khu Quản trị cho Admin trên dữ liệu các module trước đã ghi:

- **Tổng quan** (`/admin`): số tài khoản, doanh nghiệp, sản phẩm theo trạng thái, bảo hành, sửa chữa, kiểm định, chuyển nhượng, event on-chain 14 ngày, giao dịch theo hàm contract, độ trễ Indexer và cảnh báo đang mở.
- **Nhật ký kiểm toán** (`/admin/audit`): mọi dòng `audit_logs`, mới nhất trước, lọc theo hành động, email người thực hiện và khoảng ngày.
- **Luật phát hiện bất thường chạy nền** trong Worker: giao dịch treo, ví bị revert liên tục, Indexer chậm, đăng nhập sai dồn dập, đổi chủ dồn dập, phiếu sửa quá hạn, yêu cầu chờ lâu.
- **Xử lý cảnh báo** (`/admin/alerts`): Admin chốt từng cảnh báo là **Đã xử lý** hoặc **Báo nhầm**, kèm ghi chú bắt buộc.

Trang duyệt doanh nghiệp của M4 chuyển sang `/admin/organizations`. M12 không có contract mới và không có migration.

| UC     | Tên                          | Actor             | Chạm blockchain                                                 |
| ------ | ---------------------------- | ----------------- | --------------------------------------------------------------- |
| AUD-01 | Xem nhật ký kiểm toán        | Admin             | Không                                                           |
| AUD-02 | Xem dashboard hệ thống       | Admin             | Chỉ đọc: block finalized và thời gian block (độ trễ Indexer)    |
| AUD-03 | Phát hiện bất thường định kỳ | Worker (hệ thống) | Chỉ đọc: block finalized và thời gian block (luật Indexer chậm) |
| AUD-04 | Xử lý cảnh báo bất thường    | Admin             | Không                                                           |

## 1. Quyết định thiết kế

| Mã  | Quyết định                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | Lý do                                                                                                                                        |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| D87 | **Module mới `monitoring`** gom dashboard, nhật ký và luật chạy nền. Mỗi module sở hữu bảng tự đếm số liệu của mình qua một cổng thống kê xuất ở `index.ts` (`IDENTITY_STATISTICS`, `ORGANIZATION_STATISTICS`, `PRODUCT_STATISTICS`, `SERVICE_STATISTICS`, `INSPECTION_STATISTICS`, `TRANSFER_STATISTICS`, `CHAIN_ACTIVITY`). `audit_logs` và `anomaly_alerts` vẫn thuộc module `audit` (`AuditRecords`, `ReviewAnomalyAlert`). `monitoring` không đọc bảng của module khác. | Giữ đúng quy tắc Modular Monolith: module chỉ gọi nhau qua `index.ts`.                                                                       |
| D88 | **Số liệu dashboard**: sản phẩm theo `product_state` đã chiếu từ event (bản nháp đếm riêng); event on-chain mỗi ngày đếm `blockchain_events` theo giờ Việt Nam, 14 ngày; giao dịch theo hàm lấy `chain_transactions` 30 ngày, gas và thời gian chốt chỉ tính giao dịch đã chốt; độ trễ Indexer là block finalized trừ mốc thấp nhất trong `indexer_checkpoints`. RPC lỗi thì ô Indexer ghi "Không đọc được", phần còn lại vẫn hiện.                                          | Dashboard đọc CSDL là chính, chỉ cần 1 lời gọi RPC; RPC chập chờn không làm hỏng cả trang.                                                   |
| D89 | **Luật chạy nền trong Worker**, mỗi `ANOMALY_SCAN_INTERVAL_MINUTES` phút (mặc định 5), độc lập với Indexer. Mỗi luật nằm trong `try/catch` riêng: một luật lỗi chỉ ghi log, các luật khác vẫn chạy. Ngưỡng nằm ở một chỗ: `apps/api/src/modules/monitoring/domain/anomaly-thresholds.ts` (bảng ở mục 3).                                                                                                                                                                     | Theo ngưỡng nhóm chọn. Gom ngưỡng một chỗ để dễ chỉnh khi demo.                                                                              |
| D90 | **Chống trùng bằng khoá theo đối tượng**, lưu ở `details.dedupeKey` (không cần migration): giao dịch, ví, email, sản phẩm, phiếu, yêu cầu. Luật mang tính đợt (ví revert, Indexer chậm, đăng nhập sai, đổi chủ) được báo lại sau một khoảng thời gian kể từ lần báo trước, kể cả khi Admin đã chốt. Luật theo đối tượng (giao dịch treo, phiếu quá hạn, yêu cầu chờ lâu) chỉ báo một lần cho mỗi đối tượng.                                                                  | Worker quét 5 phút một lần; không có khoá thì mỗi lần quét tạo thêm một cảnh báo cho cùng sự việc.                                           |
| D91 | **Giao dịch treo** là giao dịch `SUBMITTED` quá 15 phút. Từ M3, Worker đã tự đánh dấu `FAILED` giao dịch không có biên nhận sau 10 phút (dashboard đếm ở cột **Không vào block**). Vì vậy luật này chỉ bắn khi chính việc chốt giao dịch bị kẹt: RPC lỗi, Worker tắt, finality đứng.                                                                                                                                                                                         | Không trùng việc với cơ chế bỏ giao dịch của M3, và bắt được sự cố hạ tầng mà M3 không báo.                                                  |
| D92 | **Indexer chậm** đo bằng **thời gian của block**: thời gian block finalized trừ thời gian block đã chiếu, từ 10 phút trở lên. Không đo bằng lần ghi mốc gần nhất.                                                                                                                                                                                                                                                                                                            | Trên Hardhat không có giao dịch thì không có block mới, mốc không đổi nhưng Indexer vẫn bắt kịp. Đo theo thời gian block thì không báo nhầm. |
| D93 | **Đăng nhập sai dồn dập** gom các dòng `SIGN_IN_FAILED` theo email (chữ thường) trong 15 phút. Email có tài khoản thì cảnh báo gắn với người đó; không có thì ghi `accountExists: false`. Giới hạn 10 lần đăng nhập mỗi phút mỗi IP (M2) vẫn giữ nguyên.                                                                                                                                                                                                                     | Giới hạn theo IP chặn một máy dò nhanh; luật theo email bắt được kẻ dò chậm hoặc đổi IP liên tục.                                            |
| D94 | **Chốt cảnh báo** (AUD-04): **Đã xử lý** (`ACKNOWLEDGED`) hoặc **Báo nhầm** (`DISMISSED`), ghi chú 5–1000 ký tự (chuẩn hoá NFC, bỏ khoảng trắng đầu cuối). Ghi chú nằm trong `audit_logs` (`ALERT_REVIEWED`, metadata gồm quyết định, ghi chú, mã luật, mức độ); `anomaly_alerts` chỉ đổi trạng thái, người chốt, lúc chốt. Lệnh cập nhật có điều kiện `alert_status = OPEN`: hai Admin chốt cùng lúc thì người sau nhận 409.                                                | Theo lựa chọn của nhóm ("Đã xử lý/Báo nhầm + ghi chú"). Không cần migration; `audit_logs` chỉ ghi thêm nên ghi chú không bị sửa.             |
| D95 | **Giao diện**: `/admin` thành trang Tổng quan, trang duyệt doanh nghiệp chuyển sang `/admin/organizations`. Thanh điều hướng con có số cảnh báo đang mở. Bộ lọc nằm trên URL (gửi link cho người khác được). Phân trang bằng con trỏ (`id < before`): nhật ký 50 dòng, cảnh báo 30 dòng mỗi trang. Lọc ngày tính theo giờ Việt Nam, gồm cả ngày "Đến ngày"; ngày không có thật hoặc "Từ ngày" sau "Đến ngày" thì API trả 400.                                                | Thêm ba trang mới mà không làm đường dẫn cũ của M4 khó tìm.                                                                                  |
| D96 | **Biểu đồ**: event mỗi ngày là biểu đồ cột một chuỗi, một màu (xanh đại dương, kiểm độ tương phản từ 3:1 với nền ở cả chế độ sáng và tối), không có chú giải. Chỉ ghi số trên cột cao nhất; di chuột hoặc Tab vào cột để xem số; có bảng "Xem dạng bảng". Sản phẩm theo trạng thái là danh sách thanh ngang giữ thứ tự vòng đời, kèm số và phần trăm, không dùng biểu đồ tròn.                                                                                               | Số đọc được không cần màu; dùng được bằng bàn phím và trình đọc màn hình.                                                                    |

## 2. Luồng

```mermaid
sequenceDiagram
    participant W as Worker
    participant DB as CSDL
    participant C as RPC
    actor A as Admin
    participant API as API

    loop Mỗi ANOMALY_SCAN_INTERVAL_MINUTES phút
        W->>DB: Cổng thống kê từng module: giao dịch treo, ví revert, SIGN_IN_FAILED, đổi chủ, phiếu và yêu cầu
        W->>C: Block finalized, thời gian block đã chiếu
        W->>DB: anomaly_alerts (bỏ qua nếu đã có cùng khoá)
    end

    A->>API: GET /admin/dashboard, /admin/alerts
    API->>DB: Đếm qua cổng thống kê
    API->>C: Block finalized (độ trễ Indexer)
    API-->>A: Số liệu, danh sách cảnh báo
    A->>API: POST /admin/alerts/:id/review {quyết định, ghi chú}
    API->>DB: UPDATE … WHERE alert_status = OPEN; INSERT audit_logs ALERT_REVIEWED
    API-->>A: Cảnh báo đã chốt (hoặc 409 nếu người khác chốt trước)
```

## 3. Luật phát hiện bất thường (AUD-03)

| Mã luật                   | Điều kiện                                                 | Mức        | Khoá chống trùng                                  | Báo lại sau | Gắn với                       |
| ------------------------- | --------------------------------------------------------- | ---------- | ------------------------------------------------- | ----------- | ----------------------------- |
| `TRANSACTION_STUCK`       | Giao dịch `SUBMITTED` quá 15 phút                         | Trung bình | `tx:<hash>`                                       | Không       | Bên sở hữu ví gửi             |
| `WALLET_REPEATED_REVERTS` | Một ví bị revert từ 5 lần trong 60 phút                   | Trung bình | `wallet:<địa chỉ>`                                | 24 giờ      | Bên sở hữu ví                 |
| `INDEXER_LAGGING`         | Block đã chiếu cũ hơn block finalized từ 10 phút          | Cao        | `indexer`                                         | 6 giờ       | —                             |
| `SIGN_IN_BRUTE_FORCE`     | Một email đăng nhập sai từ 10 lần trong 15 phút           | Cao        | `email:<email>`                                   | 24 giờ      | Chủ tài khoản (nếu có)        |
| `RAPID_OWNERSHIP_CHANGES` | Một sản phẩm đổi chủ từ 3 lần trong 7 ngày                | Cao        | `product:<id>`                                    | 7 ngày      | Sản phẩm                      |
| `SERVICE_TICKET_OVERDUE`  | Phiếu sửa (`IN_REPAIR`) mở quá 30 ngày                    | Thấp       | `service-ticket:<id>`                             | Không       | Sản phẩm, trung tâm bảo hành  |
| `REQUEST_STALE`           | Yêu cầu bảo hành hoặc kiểm định ở `REQUESTED` quá 14 ngày | Thấp       | `service-request:<id>`, `inspection-request:<id>` | Không       | Sản phẩm, đơn vị nhận yêu cầu |

Bảy luật này nằm cạnh 14 luật đối chiếu có từ M3–M11 (Indexer và trang công khai báo khi dữ liệu on-chain lệch CSDL). Màn hình Cảnh báo hiện cả 21 luật bằng tiếng Việt.

## 4. Bảng traceability

| UC     | Domain Class           | Database                                                                                                                                                                                        | Smart Contract                                       | Event |
| ------ | ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------- | ----- |
| AUD-01 | AuditLog               | audit_logs (đọc), users (tên, email người thực hiện)                                                                                                                                            | —                                                    | —     |
| AUD-02 | — (truy vấn đọc)       | users, party_wallets, organizations, products, warranties, service_requests, inspection_requests, transfer_requests, chain_transactions, blockchain_events, indexer_checkpoints, anomaly_alerts | `eth_getBlockByNumber("finalized")`                  | —     |
| AUD-03 | AnomalyAlert           | chain_transactions, audit_logs (`SIGN_IN_FAILED`), ownership_records, service_requests, inspection_requests, indexer_checkpoints → anomaly_alerts                                               | `eth_getBlockByNumber` (finalized và block đã chiếu) | —     |
| AUD-04 | AnomalyAlert, AuditLog | anomaly_alerts (`alert_status`, `reviewed_by_user_id`, `reviewed_at`), audit_logs (`ALERT_REVIEWED`)                                                                                            | —                                                    | —     |

## 5. Màn hình

- **Thanh Quản trị** (mọi trang `/admin/*`): Tổng quan, Doanh nghiệp, Cảnh báo (kèm số đang mở), Nhật ký. Người không phải Admin mở các trang này nhận 404.
- **Tổng quan** (`/admin`): bốn ô số (tài khoản, doanh nghiệp đã duyệt, sản phẩm trên chain, cảnh báo đang mở; hai ô sau có viền vàng khi có việc cần xem); biểu đồ event mỗi ngày; ô Indexer; sản phẩm theo trạng thái và bảo hành; việc đang chạy (sửa chữa, kiểm định, chuyển nhượng); doanh nghiệp theo loại và giai đoạn; giao dịch theo hàm contract trong 30 ngày. Nút **Làm mới** tải lại số liệu.
- **Doanh nghiệp** (`/admin/organizations`): trang duyệt, từ chối, khoá và đổi phí của M4, không đổi chức năng.
- **Cảnh báo** (`/admin/alerts`): ba nút trạng thái (Đang mở, Đã xử lý, Báo nhầm, kèm số), lọc theo mức độ và luật. Mỗi dòng có mức độ, tên luật, tóm tắt một dòng, sản phẩm hoặc bên liên quan, thời điểm phát hiện; dòng đã chốt ghi kết luận, người chốt và ghi chú.
- **Chi tiết cảnh báo** (`/admin/alerts/<id>`): tên luật, ý nghĩa và việc nên kiểm tra; bảng chi tiết (giao dịch và ví bấm mở MonadVision); link **Mở hộ chiếu công khai** khi cảnh báo gắn với sản phẩm; form **Kết luận** (Đã xử lý hoặc Báo nhầm) và **Ghi chú**. Đã chốt thì form thay bằng kết luận, người chốt, lúc chốt, ghi chú.
- **Nhật ký** (`/admin/audit`): lọc theo hành động (42 mã, nhãn tiếng Việt), email người thực hiện, từ ngày, đến ngày. Mỗi dòng có giờ, hành động, người thực hiện (hoặc "Khách hoặc hệ thống"), đối tượng, IP và metadata. **Cũ hơn** và **Về mới nhất** để chuyển trang.

## 6. API

Mọi đường dẫn cần phiên đăng nhập của Admin (`SessionGuard` + `AdminGuard`); người khác nhận 403 `ADMIN_REQUIRED`.

| Phương thức | Đường dẫn                                                                | Mô tả                                                                                                                            |
| ----------- | ------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------- |
| GET         | `/admin/dashboard`                                                       | Số liệu tổng quan (`DashboardStatistics`)                                                                                        |
| GET         | `/admin/audit-logs?action&actorEmail&targetType&targetId&from&to&cursor` | Nhật ký, 50 dòng, mới nhất trước, `nextCursor` cho trang sau                                                                     |
| GET         | `/admin/alerts?status&severity&rule&cursor`                              | Cảnh báo theo trạng thái (mặc định `OPEN`), 30 dòng, kèm số đếm từng trạng thái                                                  |
| GET         | `/admin/alerts/summary`                                                  | `{ open, openHigh }` cho thanh Quản trị                                                                                          |
| GET         | `/admin/alerts/:id`                                                      | Một cảnh báo kèm sản phẩm, bên liên quan và kết quả xử lý                                                                        |
| POST        | `/admin/alerts/:id/review`                                               | `{ decision: ACKNOWLEDGED \| DISMISSED, note }` → 200 cảnh báo đã chốt; 400 ghi chú ngắn hoặc dài quá; 404 không có; 409 đã chốt |

## 7. Cài đặt khi cập nhật từ M11

M12 không có contract mới, không có migration, không cần deploy.

1. Tắt `pnpm dev`. Giải nén đè lên thư mục dự án rồi chạy `pnpm install` (lệnh này build lại `@dpp/shared`).
2. (Tuỳ chọn) Thêm `ANOMALY_SCAN_INTERVAL_MINUTES=5` vào `.env`. Khi kiểm thử tay có thể đặt `1` để không phải đợi lâu.
3. `pnpm dev`. Đường dẫn cũ `/admin` giờ là trang Tổng quan; trang duyệt doanh nghiệp ở **Quản trị → Doanh nghiệp**.

## 8. Hiệu năng

Đo trên Hardhat node, máy phát triển, `pnpm dev`, dữ liệu demo (4 tài khoản, 2 doanh nghiệp, 3 sản phẩm, khoảng 80 dòng nhật ký): `GET /admin/dashboard` 10–33 ms (gồm 1 lời gọi RPC), `GET /admin/audit-logs` và `GET /admin/alerts` dưới 5 ms. Mỗi lần quét luật nền tốn 2 lời gọi RPC (block finalized và block đã chiếu); các luật còn lại chỉ đọc CSDL.

## 9. Test chứng minh

| Test                                                             | Chứng minh                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/api/src/modules/monitoring/application/monitoring.spec.ts` | 7 ca: (1) bảy luật nền tạo cảnh báo đúng mức độ, đúng đối tượng, đúng khoá chống trùng; (2) một luật lỗi không làm dừng các luật khác; (3) Indexer chậm đo theo thời gian block, Hardhat đứng yên không bị báo; (4) chốt cảnh báo ghi ghi chú vào nhật ký; (5) chốt lần hai thì 409, cảnh báo lạ thì 404; (6) mã hành động và mã luật ở `@dpp/shared` khớp API; (7) biểu đồ có đủ 14 ngày theo giờ Việt Nam                                       |
| `apps/api/test/monitoring/monitoring.e2e-spec.ts`                | 5 ca trên CSDL test, RPC ngoại tuyến: 12 lần đăng nhập sai và một giao dịch treo 40 phút tạo đúng hai cảnh báo, giao dịch mới 2 phút không bị báo, quét lại không tạo trùng; người không phải Admin nhận 403; Admin lọc theo mức độ, chốt với ghi chú (ghi chú ngắn thì 400, chốt lại thì 409, chốt rồi quét lại không báo lại); nhật ký lọc theo hành động, email, ngày, sai ngày thì 400; dashboard đếm đúng, RPC lỗi thì phần Indexer để trống |
| `apps/web/src/features/monitoring/monitoring.spec.ts`            | 6 ca: trục biểu đồ tròn số; tóm tắt cảnh báo theo luật; cách hiển thị giao dịch, ví, thời gian, có/không; form chốt bắt buộc kết luận và ghi chú 5–1000 ký tự; schema từ chối mức độ lạ                                                                                                                                                                                                                                                           |
