const PERMISSIONS: ReadonlyArray<{ role: string; actions: string }> = [
  { role: 'Nhà sản xuất', actions: 'Phát hành sản phẩm, bàn giao cho cửa hàng, thu hồi' },
  { role: 'Nhà bán lẻ', actions: 'Xác nhận nhận hàng, bán và kích hoạt bảo hành' },
  { role: 'Trung tâm bảo hành', actions: 'Mở phiếu dịch vụ, ghi kết quả sửa chữa' },
  { role: 'Đơn vị kiểm định', actions: 'Ghi kết quả kiểm định kèm biên bản' },
  { role: 'Chủ sở hữu', actions: 'Gửi yêu cầu bảo hành, chuyển quyền sở hữu' },
  { role: 'Người xác minh', actions: 'Tra cứu lịch sử công khai, không cần tài khoản hay ví' },
];

/** Ai được ghi loại sự kiện nào — Smart Contract kiểm tra vai trò trước mỗi lần ghi. */
export function WritePermissions() {
  return (
    <dl className="divide-y divide-line rounded-panel border border-line bg-surface">
      {PERMISSIONS.map((item) => (
        <div key={item.role} className="grid gap-1 px-5 py-3.5 sm:grid-cols-[14rem_1fr] sm:gap-8">
          <dt className="font-medium">{item.role}</dt>
          <dd className="text-muted">{item.actions}</dd>
        </div>
      ))}
    </dl>
  );
}
