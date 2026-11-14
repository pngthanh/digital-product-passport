# Thông tin mẫu để nhập khi kiểm thử

Dùng cùng [kịch bản kiểm thử](../kich-ban-kiem-thu.md). Mỗi giá trị nằm trong một khung riêng: trên GitHub, rê chuột vào khung rồi bấm nút chép ở góc phải, sau đó dán vào đúng ô trên web. Mã ở đầu mỗi mục (TK-2, DN-1, P1…) trùng với mã trong kịch bản.

Mọi tên người, doanh nghiệp, mã số thuế, email, số điện thoại và địa chỉ ở đây đều là giả định để kiểm thử; nếu trùng với người hay đơn vị có thật thì chỉ là ngẫu nhiên. Hệ thống không gửi email nên địa chỉ email không cần có thật.

| Mục                                          | Nội dung                                   |
| -------------------------------------------- | ------------------------------------------ |
| [1. Ví MetaMask](#1-ví-metamask)             | Tên đặt cho 7 tài khoản MetaMask           |
| [2. Tài khoản web](#2-tài-khoản-web)         | Họ tên, email của 7 tài khoản              |
| [3. Doanh nghiệp](#3-doanh-nghiệp)           | Hồ sơ 4 doanh nghiệp, lý do từ chối        |
| [4. Phí đăng ký](#4-phí-đăng-ký)             | Phí dùng khi kiểm thử                      |
| [5. Sản phẩm](#5-sản-phẩm)                   | Sản phẩm nhập tay, bản nháp, hai file CSV  |
| [6. Bảo hành](#6-bảo-hành)                   | Mô tả lỗi, ghi chú kỹ thuật, file biên bản |
| [7. Kiểm định](#7-kiểm-định)                 | Nội dung yêu cầu, kết luận, lý do từ chối  |
| [8. Chuyển nhượng](#8-chuyển-nhượng)         | Bên nhận                                   |
| [9. Thu hồi](#9-thu-hồi)                     | Lý do thu hồi                              |
| [10. Quản trị](#10-quản-trị)                 | Ghi chú chốt cảnh báo, lý do khoá          |
| [11. Giá trị sai cố ý](#11-giá-trị-sai-cố-ý) | Giá trị dùng để thử báo lỗi                |

## 1. Ví MetaMask

Tạo các tài khoản trong MetaMask (**Thêm tài khoản**) rồi đổi tên theo bảng để khỏi chọn nhầm khi ký. DPP 1 là ví đã deploy contract. Cách chuyển MON sang các ví: mục 0.3 của kịch bản.

| Mã    | Tên trong MetaMask       | Dùng cho                               | MON cần có |
| ----- | ------------------------ | -------------------------------------- | ---------- |
| DPP 1 | `DPP 1 – Admin`          | TK-1, ký đổi phí, duyệt, từ chối, khoá | Sẵn có     |
| DPP 2 | `DPP 2 – Sao Việt`       | TK-2, nhà sản xuất                     | 2          |
| DPP 3 | `DPP 3 – Phương Nam`     | TK-3, nhà bán lẻ                       | 1,5        |
| DPP 4 | `DPP 4 – Sao Việt Care`  | TK-4, trung tâm bảo hành               | 1          |
| DPP 5 | `DPP 5 – An Tâm QC`      | TK-5, đơn vị kiểm định                 | 1          |
| DPP 6 | `DPP 6 – Minh Anh`       | TK-6, người mua A                      | 0,5        |
| DPP 7 | `DPP 7 – Quốc Bảo`       | TK-7, người mua B                      | 0,5        |
| DPP 8 | `DPP 8 – Quốc Bảo (mới)` | Tuỳ chọn: thử đổi ví của TK-7          | 0,2        |

```text
DPP 1 – Admin
```

```text
DPP 2 – Sao Việt
```

```text
DPP 3 – Phương Nam
```

```text
DPP 4 – Sao Việt Care
```

```text
DPP 5 – An Tâm QC
```

```text
DPP 6 – Minh Anh
```

```text
DPP 7 – Quốc Bảo
```

```text
DPP 8 – Quốc Bảo (mới)
```

## 2. Tài khoản web

**Mật khẩu:** tự chọn một mật khẩu kiểm thử dùng chung cho cả 7 tài khoản (ít nhất 8 ký tự, khác email, không dùng lại mật khẩu thật của bạn). Ghi nó ra giấy hoặc trình quản lý mật khẩu; không ghi vào repo hay file nào trong dự án.

| Mã   | Vai trò                     | Họ và tên       | Email                           |
| ---- | --------------------------- | --------------- | ------------------------------- |
| TK-1 | Quản trị viên               | Hoàng Gia Huy   | quantri.dpp@gmail.com           |
| TK-2 | Đại diện nhà sản xuất       | Trần Minh Khoa  | khoa.tran@saovietelectronics.vn |
| TK-3 | Đại diện nhà bán lẻ         | Lê Thị Thu Hà   | thuha.le@dienmayphuongnam.vn    |
| TK-4 | Đại diện trung tâm bảo hành | Võ Đức Thịnh    | thinh.vo@saovietcare.vn         |
| TK-5 | Đại diện đơn vị kiểm định   | Ngô Thanh Tùng  | tung.ngo@antamqc.vn             |
| TK-6 | Người mua A                 | Nguyễn Minh Anh | minhanh.nguyen.dpp@gmail.com    |
| TK-7 | Người mua B                 | Đặng Quốc Bảo   | quocbao.dang.dpp@gmail.com      |

Nếu đã có tài khoản Admin liên kết ví deploy từ trước thì dùng luôn tài khoản đó làm TK-1.

### TK-1 · Quản trị viên

```text
Hoàng Gia Huy
```

```text
quantri.dpp@gmail.com
```

### TK-2 · Nhà sản xuất

```text
Trần Minh Khoa
```

```text
khoa.tran@saovietelectronics.vn
```

### TK-3 · Nhà bán lẻ

```text
Lê Thị Thu Hà
```

```text
thuha.le@dienmayphuongnam.vn
```

### TK-4 · Trung tâm bảo hành

```text
Võ Đức Thịnh
```

```text
thinh.vo@saovietcare.vn
```

### TK-5 · Đơn vị kiểm định

```text
Ngô Thanh Tùng
```

```text
tung.ngo@antamqc.vn
```

### TK-6 · Người mua A

```text
Nguyễn Minh Anh
```

```text
minhanh.nguyen.dpp@gmail.com
```

### TK-7 · Người mua B

```text
Đặng Quốc Bảo
```

```text
quocbao.dang.dpp@gmail.com
```

## 3. Doanh nghiệp

Ô **Loại doanh nghiệp** là ô chọn, không cần dán.

### DN-1 · Nhà sản xuất (TK-2 nộp)

Loại doanh nghiệp: **Nhà sản xuất**

```text
Công ty Cổ phần Điện tử Sao Việt
```

```text
0318456721
```

```text
lienhe@saovietelectronics.vn
```

```text
028 3925 6688
```

Địa chỉ **lần nộp đầu** (cố ý thiếu số lô để Admin từ chối):

```text
Khu Công nghệ cao, TP. Hồ Chí Minh
```

Lý do Admin từ chối (TK-1 nhập):

```text
Địa chỉ chưa ghi rõ số lô trong Khu Công nghệ cao. Bổ sung địa chỉ đầy đủ rồi nộp lại.
```

Địa chỉ **sửa lại** khi nộp lần hai:

```text
Lô C3-2, Khu Công nghệ cao, TP. Hồ Chí Minh
```

### DN-2 · Nhà bán lẻ (TK-3 nộp)

Loại doanh nghiệp: **Nhà bán lẻ**

```text
Công ty TNHH Thương mại Điện máy Phương Nam
```

```text
0316789234
```

```text
lienhe@dienmayphuongnam.vn
```

```text
028 3836 1122
```

```text
125 Nguyễn Thị Minh Khai, TP. Hồ Chí Minh
```

### DN-3 · Trung tâm bảo hành (TK-4 nộp)

Loại doanh nghiệp: **Trung tâm bảo hành**

```text
Công ty TNHH Dịch vụ Kỹ thuật Sao Việt Care
```

```text
0317234590
```

```text
hotro@saovietcare.vn
```

```text
1900 6868
```

```text
48 Cách Mạng Tháng Tám, TP. Hồ Chí Minh
```

### DN-4 · Đơn vị kiểm định (TK-5 nộp)

Loại doanh nghiệp: **Đơn vị kiểm định**

```text
Công ty Cổ phần Kiểm định Chất lượng An Tâm
```

```text
0315678012
```

```text
kiemdinh@antamqc.vn
```

```text
028 3512 4455
```

```text
22 Phan Đăng Lưu, TP. Hồ Chí Minh
```

## 4. Phí đăng ký

Phí mặc định là 8 MON. Khi kiểm thử, Admin hạ phí xuống 0,5 MON để đỡ tốn MON (ô này dùng dấu chấm):

```text
0.5
```

Đặt lại phí mặc định sau khi kiểm thử xong (tuỳ chọn):

```text
8
```

## 5. Sản phẩm

### P1 · Nhập tay ở tab Từng sản phẩm (TK-2)

Ô **Ngày sản xuất** là lịch: chọn **05/10/2026**. Ô **Bảo hành (tháng)** mặc định là 12, sửa thành **24**.

```text
SV-LP14-2026-0001
```

```text
Laptop Sao Việt ProBook 14 (2026)
```

```text
Intel Core Ultra 7, RAM 16 GB, SSD 512 GB, màn hình 14 inch 2.8K OLED, màu xám không gian
```

### Bản nháp · Dùng để thử từ chối ký rồi xoá (TK-2)

Ngày sản xuất chọn **12/10/2026**, bảo hành **12** tháng.

```text
SV-PH-X5-2026-0199
```

```text
Điện thoại Sao Việt X5 128 GB
```

```text
Hàng trưng bày, màu trắng
```

### P2–P7 · Nhập từ file CSV (TK-2)

File [san-pham-lo-01.csv](san-pham-lo-01.csv), 6 dòng, đều hợp lệ:

| Mã  | Serial              | Tên model                              | Ngày SX    | Bảo hành |
| --- | ------------------- | -------------------------------------- | ---------- | -------- |
| P2  | SV-LP14-2026-0002   | Laptop Sao Việt ProBook 14 (2026)      | 05/10/2026 | 24 tháng |
| P3  | SV-LP14-2026-0003   | Laptop Sao Việt ProBook 14 (2026)      | 05/10/2026 | 24 tháng |
| P4  | SV-PH-X5-2026-0101  | Điện thoại Sao Việt X5 128 GB          | 12/10/2026 | 12 tháng |
| P5  | SV-PH-X5-2026-0102  | Điện thoại Sao Việt X5 128 GB          | 12/10/2026 | 12 tháng |
| P6  | SV-AP-300-2026-0501 | Máy lọc không khí Sao Việt AirPure 300 | 28/09/2026 | 24 tháng |
| P7  | SV-CB-65W-2026-1001 | Sạc nhanh GaN Sao Việt 65W             | 01/10/2026 | Không    |

File [san-pham-lo-loi.csv](san-pham-lo-loi.csv) cố ý sai để thử báo lỗi. Web phải tô đỏ đúng 6 dòng và không cho ghi lên blockchain:

| Dòng | Lỗi cố ý                      | Web phải báo                                               |
| ---- | ----------------------------- | ---------------------------------------------------------- |
| 2    | Serial có khoảng trắng        | Serial chỉ gồm chữ, số và . \_ / - (không có khoảng trắng) |
| 3    | Bỏ trống tên model            | Nhập tên model                                             |
| 4    | Ngày sản xuất 15/01/2030      | Ngày sản xuất không được ở tương lai                       |
| 5    | Ngày 31/02/2026 không có thật | Ngày sản xuất không hợp lệ (YYYY-MM-DD hoặc DD/MM/YYYY)    |
| 6    | Bảo hành 150 tháng            | Bảo hành tối đa 120 tháng                                  |
| 7    | (Dòng đúng)                   | Không tô đỏ                                                |
| 8    | Trùng serial với dòng 7       | Trùng serial với dòng 7                                    |

## 6. Bảo hành

### S1 · P1, còn bảo hành (TK-6 gửi, TK-4 xử lý)

Mô tả lỗi (TK-6 nhập):

```text
Máy tự tắt khi đang sạc pin, quạt tản nhiệt kêu to khi chạy tác vụ nặng.
```

Kết quả **Đã sửa xong**, việc đã làm **Thay linh kiện**. Ghi chú kỹ thuật (TK-4 nhập):

```text
Quạt tản nhiệt mòn bạc đạn, khe gió bám bụi, CPU đạt 98 °C sau 6 phút tải nặng. Đã thay quạt FAN-PB14-01 chính hãng, vệ sinh khe gió, thay keo tản nhiệt. Chạy thử tải nặng 2 giờ: nhiệt độ ổn định 76–81 °C, không tắt máy. Phiếu SVC-2026-11-0128.
```

File biên bản: [bien-ban-sua-chua-SV-LP14-2026-0001.png](bien-ban-sua-chua-SV-LP14-2026-0001.png)

### S2 · P7, không có bảo hành (TK-6 gửi, TK-4 xử lý)

Mô tả lỗi:

```text
Sạc không vào điện thoại qua cổng USB-C thứ hai, đèn báo không sáng.
```

Kết quả **Không sửa được**, việc đã làm **Chỉ kiểm tra**, không đính kèm file. Ghi chú kỹ thuật:

```text
Cổng USB-C thứ hai bị cháy mạch điều khiển công suất, không thay riêng được. Sản phẩm không có bảo hành; đã tư vấn khách mua bộ sạc mới.
```

## 7. Kiểm định

### I1 · P3, nhà sản xuất gửi (TK-2 gửi, TK-5 ghi kết quả)

Nội dung cần kiểm định:

```text
Kiểm tra an toàn điện và an toàn pin trước khi phân phối theo IEC 62368-1 và IEC 62133-2.
```

Kết quả **Đạt có điều kiện**. Kết luận:

```text
Biên bản AT-KD-2026-0417. Đạt yêu cầu an toàn điện và pin khi dùng bộ sạc 65 W chính hãng (điện trở cách điện 210 MΩ, dòng rò 0,08 mA, nhiệt độ vỏ khi sạc 44 °C). Với bộ sạc 100 W không chính hãng, nhiệt độ vỏ đạt 53 °C, vượt ngưỡng 48 °C. Điều kiện: nhà sản xuất ghi rõ cảnh báo không dùng bộ sạc trên 65 W không chính hãng trong hướng dẫn sử dụng.
```

File biên bản: [bien-ban-kiem-dinh-SV-LP14-2026-0003.pdf](bien-ban-kiem-dinh-SV-LP14-2026-0003.pdf)

### I2 · P1, chủ sở hữu gửi (TK-6 gửi, TK-5 từ chối rồi ghi kết quả)

Nội dung cần kiểm định (lần đầu, sẽ bị từ chối):

```text
Kiểm tra độ bền bản lề màn hình sau 20.000 lần đóng mở.
```

Lý do từ chối (TK-5 nhập):

```text
Phòng thử nghiệm chưa có thiết bị thử độ bền cơ khí bản lề. Đề nghị gửi yêu cầu đánh giá tình trạng pin và hiệu năng, hoặc chọn đơn vị kiểm định khác.
```

Nội dung cần kiểm định (gửi lại):

```text
Đánh giá tình trạng pin và hiệu năng trước khi bán lại.
```

Kết quả **Đạt**. Kết luận:

```text
Biên bản AT-KD-2026-0422. Pin còn 94 % dung lượng thiết kế sau 41 chu kỳ sạc; hiệu năng CPU đạt 98 % so với máy mới cùng model; nhiệt độ khi tải nặng 30 phút 79 °C; màn hình, bàn phím, cổng kết nối hoạt động bình thường. Đã thay quạt tản nhiệt theo phiếu bảo hành SVC-2026-11-0128.
```

File biên bản: [bien-ban-kiem-dinh-SV-LP14-2026-0001.jpg](bien-ban-kiem-dinh-SV-LP14-2026-0001.jpg)

### I3 · P5, chủ sở hữu gửi (TK-6 gửi, TK-5 ghi Không đạt)

Nội dung cần kiểm định:

```text
Kiểm tra pin phồng và thời lượng sử dụng sau khi máy bị rơi xuống nước.
```

Kết quả **Không đạt**, không đính kèm file. Kết luận:

```text
Pin phồng 1,8 mm, vỏ sau bị cong; thời lượng sử dụng chỉ còn 3 giờ 10 phút so với 14 giờ công bố. Không đạt yêu cầu an toàn pin; khuyến nghị ngừng sử dụng và thay pin chính hãng.
```

## 8. Chuyển nhượng

Ô **Bên nhận** nhận email tài khoản cá nhân hoặc mã số thuế doanh nghiệp đã được duyệt.

P1 từ TK-6 sang TK-7:

```text
quocbao.dang.dpp@gmail.com
```

P7 từ TK-6 sang nhà bán lẻ Phương Nam (mã số thuế DN-2):

```text
0316789234
```

## 9. Thu hồi

Thu hồi P2, P3, P6 một lần (TK-2). Lý do (từ 10 đến 1000 ký tự, hiện công khai trên hộ chiếu):

```text
Lô sản xuất tháng 9–10/2026 có nguy cơ quá nhiệt ở bộ nguồn khi sạc liên tục. Ngừng sử dụng và mang sản phẩm tới cửa hàng để được đổi mới miễn phí.
```

## 10. Quản trị

Ghi chú chốt cảnh báo lệch dữ liệu (kết luận **Đã xử lý**):

```text
Đã kiểm tra: dòng bảo hành của SV-LP14-2026-0001 bị sửa tay trong CSDL khi kiểm thử chống sửa dữ liệu. Đã trả về ACTIVE, hộ chiếu khớp blockchain trở lại.
```

Ghi chú chốt cảnh báo đăng nhập sai dồn dập với email có tài khoản (kết luận **Đã xử lý**):

```text
Đã liên hệ người dùng Đặng Quốc Bảo: người dùng quên mật khẩu, không có dấu hiệu bị dò mật khẩu.
```

Email chưa đăng ký dùng để thử đăng nhập sai dồn dập:

```text
khongtontai.dpp@gmail.com
```

Ghi chú chốt cảnh báo với email chưa đăng ký (kết luận **Báo nhầm**):

```text
Email không có trong hệ thống, là lượt kiểm thử luật đăng nhập sai dồn dập.
```

Lý do khoá DN-4 (bước cuối của kịch bản):

```text
Hết hạn chứng nhận năng lực phòng thử nghiệm. Tạm khoá cho tới khi nộp chứng nhận mới.
```

## 11. Giá trị sai cố ý

Dùng ở các bước "thử báo lỗi" của kịch bản; kết quả đúng ghi trong kịch bản.

Mã số thuế thiếu một chữ số:

```text
031845672
```

Số điện thoại quá ngắn:

```text
12345
```

Phí viết bằng dấu phẩy:

```text
0,5
```

Địa chỉ ví Treasury sai:

```text
0x123
```

Serial có khoảng trắng:

```text
SV LP14 2026 0001
```

Serial trùng P1 (viết thường, hệ thống tự đổi thành chữ in hoa):

```text
sv-lp14-2026-0001
```

Email người mua không có tài khoản:

```text
khachle.chuadangky@gmail.com
```

Mã số thuế không thuộc doanh nghiệp nào đã duyệt:

```text
0300000000
```

Mã tra cứu không tồn tại:

```text
ZZZZ-ZZZZ-ZZZZ
```
