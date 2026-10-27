import type { ProductState, WarrantyState } from '@dpp/shared';

export interface SpecimenEvent {
  date: string;
  title: string;
  actor: string;
  txHash: string;
}

/** Dữ liệu minh hoạ theo kịch bản xuyên suốt của tài liệu phân tích; chưa ghi lên blockchain. */
export const SPECIMEN_PASSPORT = {
  model: 'Laptop ABC Pro 14',
  serial: 'ABC-2026-000128',
  issuer: 'ABC Electronics',
  productState: 'SOLD' satisfies ProductState,
  warrantyState: 'ACTIVE' satisfies WarrantyState,
  warrantyExpiresAt: '2028-03-03',
  ownerVisibility: 'Cá nhân, đã ẩn danh',
  events: [
    {
      date: '2026-10-02',
      title: 'Chuyển quyền sở hữu sang chủ mới',
      actor: 'Chủ cũ tạo yêu cầu, chủ mới chấp nhận',
      txHash: '0x5b1e0c7d2a94f3e8b6c1d0a7e9f4b2c8d3a6e1f0b9c7d5e3a2f1c0b8d7e6a5f4',
    },
    {
      date: '2026-07-15',
      title: 'Thay SSD 512 GB',
      actor: 'Trung tâm bảo hành ABC',
      txHash: '0xc2a7f0e9d4b3a1c8e6f5d2b0a9c7e4f1d8b6a3c0e2f9d7b5a4c1e0f3d6b8a2c9',
    },
    {
      date: '2026-03-03',
      title: 'Bán lần đầu, kích hoạt bảo hành 24 tháng',
      actor: 'ABC Store Cần Thơ',
      txHash: '0x7e4d1a9c3f6b2e0d8a5c7f1b4e9d2a6c0f3b8e5d1a7c4f9b2e6d0a3c8f5b1e7d',
    },
    {
      date: '2026-01-20',
      title: 'Bàn giao cho cửa hàng',
      actor: 'ABC Electronics → ABC Store Cần Thơ',
      txHash: '0x1f8c3e6a0d9b4f2c7e5a1d8b3f0c6e9a2d5b8f1c4e7a0d3b6f9c2e5a8d1b4f7c',
    },
    {
      date: '2026-01-12',
      title: 'Phát hành sản phẩm',
      actor: 'ABC Electronics',
      txHash: '0x9f3a6d0c2e8b5f1a4d7c0e3b9f6a2d5c8e1b4f7a0d3c6e9b2f5a8d1c4e7b0a3c',
    },
  ] satisfies SpecimenEvent[],
} as const;
