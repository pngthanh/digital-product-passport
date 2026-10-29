import type { CustodyStep } from './distribution-flows';

/** Nhãn hai bước của mỗi giao dịch giao nhận/bán: ví gửi, rồi chờ block finalized. */
export function custodyStepLabels(method: string): Record<CustodyStep, string> {
  return {
    send: `Ví cá nhân gửi ${method}, tự trả gas`,
    confirm: 'Chờ block finalized và hệ thống ghi nhận',
  };
}
